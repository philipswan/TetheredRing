import * as THREE from 'three'
import { fbmGlsl } from './seaNoise.js'
import { seaSkyTableGlsl } from './seaSkyTable.js'

// Wind-driven waves on the sea surface (CubedSpherePlanetRenderer._createWaterMaterial): the slopes
// that set where the sun glints and what the water reflects, gusts, and whitecaps. Only the shading
// changes (the surface itself stays at sea level).
//
// The waves are WAVE_BANDS wavelength bands (WAVELENGTH_MAX down to WAVELENGTH_MIN) of WAVE_DIRECTIONS
// trains each, travelling in fixed pseudo-random directions with deep-water dispersion. Their phase at
// a point is |k| d . x - omega t, a pure function of place and time (so shots repeat), split as for the
// sea's noise (seaNoise.js): each tile's material has its centre's part, |k| d . centre mod 2 pi, worked
// out in float64 (tileWaveOffsets), and the time's part, omega t mod 2 pi, is shared (update).
//
// The wind (at the camera: the waves' detail is only seen within a few kilometres of it) sets only
// their amplitudes, so the pattern does not shift as the wind changes:
// - The total mean square slope is Cox and Munk's (1954) for a clean sea, 0.003 + 0.00512 U (U the
//   wind speed in m/s), which is what the width of the sun's glitter on the sea measures. It is split
//   between the bands by the Pierson-Moskowitz spectrum's cut-off below its peak, kp = 0.77 g / U^2
//   (equal slope per band above it), so stronger wind raises longer waves. A little swell (SWELL_SLOPE)
//   is always there in the longest bands.
// - Within a band, trains running with the wind are strongest (0.3 + cos^2 of the angle, downwind
//   only, so the sea is short-crested), and each train's weight is scaled by how much of its direction lies in the surface there.
// - Waves come in groups: each band's amplitude varies over a few of its wavelengths.
// - Gusts (patches a few hundred metres across, fading in and out) roughen the short waves, so at low
//   winds the sea is glassy with patches of ripples ("cat's paws").
// - Whitecaps cover a fraction 3.84e-6 U^3.41 of the sea (Monahan and O'Muircheartaigh, 1980; none
//   below about 3.5 m/s), in patches a few metres across that come and go, more in the gusts.
//
// Waves too fine for their pixel are left out of the normal (they would shimmer), and their slope
// variance goes into the roughness of the sun's glint instead, so close up it glints off individual
// waves and far away it spreads into a glitter path.

const G = 9.81
const SURFACE_TENSION = 7.4e-5 // m^3/s^2 (sigma / rho): capillary waves
export const WAVE_BANDS = 9
export const WAVE_DIRECTIONS = 8
const WAVE_COUNT = WAVE_BANDS * WAVE_DIRECTIONS
const WAVELENGTH_MAX = 300 // m
const WAVELENGTH_MIN = 0.1
// Bands shorter than this (m) are roughened by gusts.
const GUSTED_WAVELENGTH = 2
// The lighter qualities draw no waves shorter than this (m): their slope goes into the roughness.
const SEA_LITE_MIN_WAVELENGTH = 0.6
const SWELL_SLOPE = 0.02 // RMS slope of the swell
// Gust and whitecap patches: noise frequencies (1/m), and how long each pattern lasts (s).
export const GUST_FREQUENCIES = [1 / 400, 1 / 150]
export const FOAM_FREQUENCIES = [1 / 3, 1 / 1.2, 1 / 0.45]
const GUST_SECONDS = 25
// The real clouds' mip level for the sea's reflection of them (blurred, as a rough sea's reflection is).
const SEA_COVER_BLUR = 3
const FOAM_SECONDS = 5
const FOAM_NOISE_SD = 0.247 // of the 3-octave noise (seaNoise.js fbm)

// The trains: wavenumber (rad/m; jittered within the band so they do not beat regularly) and direction.
function trains() {
  let s = 0x2545f491
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const ratio = Math.pow(WAVELENGTH_MAX / WAVELENGTH_MIN, 1 / (WAVE_BANDS - 1))
  const list = []
  for (let b = 0; b < WAVE_BANDS; b++) {
    const bandK = 2 * Math.PI / (WAVELENGTH_MAX / Math.pow(ratio, b))
    for (let d = 0; d < WAVE_DIRECTIONS; d++) {
      const z = 2 * r() - 1, phi = 2 * Math.PI * r(), rho = Math.sqrt(1 - z * z)
      const k = bandK * (0.85 + 0.3 * r())
      list.push({ band: b, bandK, k, omega: Math.sqrt(G * k + SURFACE_TENSION * k * k * k), dir: new THREE.Vector3(rho * Math.cos(phi), z, rho * Math.sin(phi)) })
    }
  }
  return list
}
const TRAINS = trains()
// Wave groups: each band's amplitude varies over about GROUP_WAVELENGTHS of its wavelength.
const GROUP_WAVELENGTHS = 5
export const GROUP_FREQUENCIES = Array.from({ length: WAVE_BANDS }, (_, b) => TRAINS[b * WAVE_DIRECTIONS].bandK / (2 * Math.PI * GROUP_WAVELENGTHS))

/** A tile's part of the wave phases: |k| d . centre mod 2 pi (centre in the renderer's frame). */
export function tileWaveOffsets(center) {
  return TRAINS.map((w) => {
    const p = w.k * (w.dir.x * center.x + w.dir.y * center.y + w.dir.z * center.z)
    return p - 2 * Math.PI * Math.floor(p / (2 * Math.PI))
  })
}

// Shared by every tile's material.
export const seaWaveUniforms = {
  seaWavePhase: { value: new Float32Array(WAVE_COUNT) },
  seaBandSlope: { value: new Float32Array(WAVE_BANDS) },
  seaWind: { value: new THREE.Vector4(1, 0, 0, 0) },        // xyz: where the wind blows to (renderer frame); w: speed (m/s)
  seaFoam: { value: new THREE.Vector4(0, 0, 0, 0) },        // x: the noise's SD; y: coverage; z: pattern cross-fade
  seaFoamSlice: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  seaGust: { value: new THREE.Vector4(0, 0, 0, 0) },        // z: pattern cross-fade
  seaGustSlice: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  seaSlopeVariance: { value: 0.03 },                        // the sea's mean square slope (see seaReflectanceGlsl)
  seaWindMap: { value: null },                              // the weather map's wind (weatherMap.js), if any
  seaWindMapActive: { value: 0 },
  // The clouds' cover (Planet.setSeaClouds): the weather map's (weatherMap.js) and the real clouds' (realClouds.js),
  // with the clouds' blend between them (Clouds.js realShare: blend, declination (degrees), active).
  seaSkyTable: { value: null },                             // the sky from sea level (seaSkyTable.js; SEA_LITE)
  seaCoverMap: { value: null },
  seaRealClouds: { value: null },
  seaCloudBlend: { value: new THREE.Vector3() },
}

// A whole-lattice offset for pattern number n (so the noise stays seamless across tiles).
function slice(n, out) {
  const h = (a) => (Math.imul(n + 1, a) >>> 0) % 1024
  return out.set(h(0x9e3779b1), h(0x85ebca6b), h(0xc2b2ae35))
}

/**
 * Sets the sea state for this frame: simulated time t (s), and the wind at the camera's point on the
 * sea: `direction` (the way it blows, a unit vector in the planet renderer's frame) and speed (m/s).
 */
export function updateSeaWaves(t, direction, speed) {
  const u = seaWaveUniforms
  TRAINS.forEach((w, i) => {
    const p = w.omega * t
    u.seaWavePhase.value[i] = p - 2 * Math.PI * Math.floor(p / (2 * Math.PI))
  })
  const mss = 0.003 + 0.00512 * speed
  const kp = 0.77 * G / Math.max(speed * speed, 0.25)
  const weights = Array.from({ length: WAVE_BANDS }, (_, b) => Math.exp(-1.25 * (kp / TRAINS[b * WAVE_DIRECTIONS].bandK) ** 2))
  const total = weights.reduce((a, b) => a + b, 0)
  weights.forEach((w, b) => {
    const swell = b < 2 ? SWELL_SLOPE * SWELL_SLOPE / 2 : 0
    u.seaBandSlope.value[b] = Math.sqrt(mss * w / total + swell)
  })
  u.seaSlopeVariance.value = mss + SWELL_SLOPE * SWELL_SLOPE
  u.seaWind.value.set(direction.x, direction.y, direction.z, speed)
  const coverage = speed > 3.5 ? Math.min(0.2, 3.84e-6 * Math.pow(speed, 3.41)) : 0
  u.seaFoam.value.set(FOAM_NOISE_SD, coverage, 0, 0)
  for (const [vec, slices, seconds] of [[u.seaFoam.value, u.seaFoamSlice.value, FOAM_SECONDS], [u.seaGust.value, u.seaGustSlice.value, GUST_SECONDS]]) {
    const n = Math.floor(t / seconds)
    const f = t / seconds - n
    slice(n, slices[0])
    slice(n + 1, slices[1])
    vec.z = f * f * f * (f * (f * 6 - 15) + 10)
  }
}

// How much sky a rough sea reflects. A wave face tilted away from the viewer would reflect nearly all
// of the sky at a grazing angle, but on a rough sea those faces are hidden behind the ones tilted
// towards the viewer, which are seen less obliquely: averaged over the sea's slopes, the angle the
// surface is seen at is about acos(sqrt(cos^2 + mean square slope)), so the reflectance near the
// horizon is about 30% in a moderate breeze, and more only when it is calm. Those faces also reflect
// sky from higher up, which is darker and bluer than at the horizon. GLSL, with seaWaveUniforms'
// seaSlopeVariance (the sea's mean square slope).
export const seaReflectanceGlsl = `
#ifndef SEA_SLOPE_VARIANCE
#define SEA_SLOPE_VARIANCE
uniform float seaSlopeVariance;
#endif

// The share of the sky reflected, seen at |cos| facing of the angle to the (drawn) normal.
float seaReflectance(float facing) {
  float c = sqrt(min(facing * facing + seaSlopeVariance, 1.0));
  return 0.02 + 0.98 * pow(1.0 - c, 5.0);
}
`

// GLSL for lit materials (after their lights pars chunk, with vViewPosition declared):
// seaSkyReflection(r, rough), the sky seen in direction r (view space), tilted up by rough (the RMS
// slope of the waves not drawn there), and seaReflectance (above).
export const seaSkyReflectionGlsl = seaReflectanceGlsl + `
#ifdef SEA_LITE
${seaSkyTableGlsl}
#endif
// The sky seen from this point in direction r (view space), as the sky is drawn (atmosphereCommon.glsl,
// with sunAndSkyLight.js's uniforms). Reflections that dip below the horizon (off the back of a wave)
// see the sky just above it.
vec3 seaSkyReflection(vec3 r, float rough) {
  if (slParams.x < 0.5 || slParams.y < 0.5) return vec3(0.0);
  vec3 o = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
  vec3 p = slCamera.xyz + o + slPole.w * dot(o, slPole.xyz) * slPole.xyz;
  vec3 up = normalize(p);
  vec3 d = normalize((vec4(r, 0.0) * viewMatrix).xyz + 2.0 * rough * up);
  d = normalize(d + max(0.02 - dot(d, up), 0.0) * up);
#ifdef SEA_LITE
  // (The lighter qualities: from the table of the sky from sea level, seaSkyTable.js.)
  vec3 sunAcross = slSun - dot(slSun, up) * up, dAcross = d - dot(d, up) * up;
  float across = sqrt(dot(sunAcross, sunAcross) * dot(dAcross, dAcross));
  return 1.0 - exp(-seaSkyTableLight(dot(d, up), dot(slSun, up), across > 1e-6 ? dot(sunAcross, dAcross) / across : 1.0));
#else
  vec3 ds = d + slPole.w * dot(d, slPole.xyz) * slPole.xyz;
  float top = slParams.z + 100000.0;
  float t0, t1;
  if (!atmoRoots(dot(ds, ds), dot(p, ds), dot(p, p) - top * top, t0, t1)) return vec3(0.0);
  vec3 light, transmittance;
  atmoScatter(p, ds, d, max(t0, 0.0), t1, slSun, slParams.z, 6, light, transmittance);
  return 1.0 - exp(-light);
#endif
}
`

const vec3 = (v) => `vec3(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)})`

// Fractal noise cross-faded between two patterns (sliced by whole-lattice offsets), in about [-1, 1]
// with the variance kept.
function slicedFbmGlsl(prefix, n) {
  return `
float ${prefix}Sliced(vec3 local, float viewDistance, vec3 slices[2], float fade) {
  float a = 0.0, b = 0.0, weight = 0.0, amplitude = 1.0;
  for (int i = 0; i < ${n}; i++) {
${prefix === 'seaGust' ? `#ifdef SEA_LITE
    if (i == ${n - 1}) break;  // (the lighter qualities: an octave fewer of the gusts; the whitecaps' threshold
#endif                          // is for all of theirs)
` : ''}    float wavelengthPixels = 1000.0 / (${prefix}Freq[i] * viewDistance);
    float visible = smoothstep(2.0, 6.0, wavelengthPixels);
    // (Too fine to see from here: not looked up at all.)
    if (visible > 0.0) {
      vec3 p = ${prefix}Rotation[i] * local * ${prefix}Freq[i] + ${prefix}Offset[i];
      a += amplitude * visible * (${prefix}Noise(p + slices[0]) * 2.0 - 1.0);
      b += amplitude * visible * (${prefix}Noise(p + slices[1]) * 2.0 - 1.0);
    }
    weight += amplitude;
    amplitude *= 0.6;
  }
  return mix(a, b, fade) / (weight * sqrt(fade * fade + (1.0 - fade) * (1.0 - fade)));
}
`
}

// GLSL for the sea surface's fragment shader (needs <common>; declares the per-tile uniforms
// seaWaveOffset, seaGustOffset, seaFoamOffset and seaGroupOffset).
export const seaWavesGlsl = `
uniform float seaWaveOffset[${WAVE_COUNT}];
uniform float seaWavePhase[${WAVE_COUNT}];
uniform float seaBandSlope[${WAVE_BANDS}];
uniform vec4 seaWind;
uniform sampler2D seaWindMap;
uniform float seaWindMapActive;
uniform sampler2D seaCoverMap;
uniform sampler2D seaRealClouds;
uniform vec3 seaCloudBlend;
#ifndef SEA_SLOPE_VARIANCE
#define SEA_SLOPE_VARIANCE
uniform float seaSlopeVariance;
#endif
uniform vec4 seaFoam;
uniform vec3 seaFoamSlice[2];
uniform vec4 seaGust;
uniform vec3 seaGustSlice[2];
const vec3 SEA_WAVE_DIR[${WAVE_COUNT}] = vec3[](${TRAINS.map(w => vec3(w.dir)).join(', ')});
const float SEA_WAVE_K[${WAVE_COUNT}] = float[](${TRAINS.map(w => w.k.toExponential(6)).join(', ')});
const float SEA_GUSTED_K = ${(2 * Math.PI / GUSTED_WAVELENGTH).toFixed(4)};
${fbmGlsl('seaGust', GUST_FREQUENCIES)}
${fbmGlsl('seaFoam', FOAM_FREQUENCIES)}
${fbmGlsl('seaGroup', GROUP_FREQUENCIES)}
${slicedFbmGlsl('seaGust', GUST_FREQUENCIES.length)}
${slicedFbmGlsl('seaFoam', FOAM_FREQUENCIES.length)}

// The sea's mean square slope (Cox and Munk, plus the swell) at the ellipsoid normal n (renderer frame:
// y the polar axis, longitude atan(-z, x)), from the weather map's wind there; the camera's
// (seaSlopeVariance) without a map.
float seaRoughnessHere(vec3 n) {
  if (seaWindMapActive < 0.5) return seaSlopeVariance;
  vec2 uv = vec2(atan(-n.z, n.x) / (2.0 * PI) + 0.5, asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5);
  float speed = length(texture(seaWindMap, uv).zw);
  return 0.003 + 0.00512 * speed + ${(SWELL_SLOPE * SWELL_SLOPE).toFixed(5)};
}

// The clouds' opacity over the sea at the ellipsoid normal n (renderer frame), as the clouds have it far away
// (Clouds.js flatOpacityAt, without its sharpening: the imagery's, blurred, where the clouds use it, otherwise
// the weather's); 0 without clouds.
float seaCloudCover(vec3 n) {
  if (seaCloudBlend.z < 0.5) return 0.0;
  vec2 uv = vec2(atan(-n.z, n.x) / (2.0 * PI) + 0.5, asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5);
  float opacity = texture(seaCoverMap, uv).r * 0.9;
  float noonSun = 90.0 - abs(uv.y * 180.0 - 90.0 - seaCloudBlend.y);
  float share = seaCloudBlend.x * smoothstep(15.0, 25.0, noonSun);
  if (share > 0.0) opacity = mix(opacity, clamp((textureLod(seaRealClouds, uv, ${SEA_COVER_BLUR.toFixed(1)}).r - 0.05) / 0.95, 0.0, 1.0), share);
  return opacity;
}

// The gust factor at a point (1 on average): how much rougher than average the short waves are.
float seaGustFactor(vec3 local, float viewDistance) {
  return clamp(1.0 + 0.8 * seaGustSliced(local, viewDistance, seaGustSlice, seaGust.z), 0.35, 1.8);
}

// The waves' slope (the height's gradient along the surface, renderer frame) at a point: local, its
// tile-local position; up, the surface normal there. unresolved: the slope variance of the waves too
// fine to draw here.
vec3 seaWaveSlope(vec3 local, vec3 up, float gust, out float unresolved) {
  vec3 wind = seaWind.xyz - dot(seaWind.xyz, up) * up;
  wind /= max(length(wind), 1e-6);
  // Short waves follow the wind where it gusts (none in a calm).
  float shortWaves = gust * smoothstep(0.3, 3.0, seaWind.w * gust);
  vec3 slope = vec3(0.0);
  unresolved = 0.0;
  // The smaller side of a pixel on the surface (m): bands whose waves are all well under it are left
  // out wholesale (their slope variance is the band's, by construction).
  float pixel = min(length(dFdx(local)), length(dFdy(local)));
  for (int b = 0; b < ${WAVE_BANDS}; b++) {
    float gusted = SEA_WAVE_K[b * ${WAVE_DIRECTIONS}] > SEA_GUSTED_K ? shortWaves : 1.0;
#ifdef SEA_LITE
    // (The lighter qualities: waves shorter than SEA_LITE_MIN_WAVELENGTH are roughness, as if under a pixel.)
    if (0.6 * SEA_WAVE_K[b * ${WAVE_DIRECTIONS}] * pixel > 2.0 || SEA_WAVE_K[b * ${WAVE_DIRECTIONS}] > ${(2 * Math.PI / SEA_LITE_MIN_WAVELENGTH).toFixed(3)}) {
#else
    if (0.6 * SEA_WAVE_K[b * ${WAVE_DIRECTIONS}] * pixel > 2.0) {
#endif
      unresolved += seaBandSlope[b] * seaBandSlope[b] * gusted * gusted;
      continue;
    }
    vec3 along[${WAVE_DIRECTIONS}];
    float weight[${WAVE_DIRECTIONS}];
    float sum = 0.0;
    for (int d = 0; d < ${WAVE_DIRECTIONS}; d++) {
      int j = b * ${WAVE_DIRECTIONS} + d;
      vec3 t = SEA_WAVE_DIR[j] - dot(SEA_WAVE_DIR[j], up) * up;   // its projection on the surface
      float inPlane = dot(t, t);
      float c = max(dot(t, wind), 0.0) / sqrt(max(inPlane, 1e-6));
      along[d] = t;
      weight[d] = (0.3 + c * c) * inPlane;
#ifdef SEA_LITE
      // (The lighter qualities: every other direction, the band's slope shared among them, so the sea is
      // as rough and its glint the same.)
      if ((d & 1) == 1) weight[d] = 0.0;
#endif
      sum += weight[d] * weight[d] * inPlane;
    }
    // Two group envelopes, for alternate trains (so no two trains keep the same weight everywhere and
    // beat into a lattice). Shifted by whole lattice cells, so they stay seamless across tiles.
    vec3 g = seaGroupRotation[b] * local * seaGroupFreq[b] + seaGroupOffset[b];
    // (Kept by the lighter qualities too: without them their fewer trains beat into a lattice.)
    vec2 group = clamp(1.0 + 1.3 * (vec2(seaGroupNoise(g), seaGroupNoise(g + vec3(17.0, 41.0, 5.0))) * 2.0 - 1.0), 0.25, 2.0);
    float band = seaBandSlope[b] * gusted * 1.41421 / sqrt(max(sum, 1e-8));
    for (int d = 0; d < ${WAVE_DIRECTIONS}; d++) {
#ifdef SEA_LITE
      if ((d & 1) == 1) continue;
#endif
      int j = b * ${WAVE_DIRECTIONS} + d;
      float phase = SEA_WAVE_K[j] * dot(SEA_WAVE_DIR[j], local) + seaWaveOffset[j] - seaWavePhase[j];
      float amplitude = band * weight[d];                          // slope amplitude, a k
      float visible = 1.0 - smoothstep(0.5, 1.2, fwidth(phase));   // phase change across a pixel
      slope += visible * amplitude * group[d - 2 * (d / 2)] * cos(phase) * along[d];
      // (Without the groups: those of waves too fine to draw are finer still, so they average out.)
      unresolved += (1.0 - visible) * 0.5 * amplitude * amplitude * dot(along[d], along[d]);
    }
  }
  // The waves too fine to draw are as rough as the wind where they are (not at the camera, whose wind
  // sets the drawn waves): from far away the sea's roughness, and so the sun's glint, follows the
  // weather (with one wind for the whole planet, the glint turned sharp or blurred all at once as the
  // point under the camera moved between a calm and a breeze).
  unresolved *= seaRoughnessHere(up) / seaSlopeVariance;
  return slope;
}

// Whitecap cover (0..1) at a point, given the gust factor; footprint: the size of a pixel there (m).
float seaWhitecaps(vec3 local, float viewDistance, float gust, float footprint) {
  if (seaFoam.y <= 0.0) return 0.0;
  float coverage = clamp(seaFoam.y * gust, 0.0, 0.2);
  // Too small to see: their average cover (and the pattern not worked out at all).
  float average = smoothstep(0.5, 3.0, footprint);
  if (average >= 1.0) return coverage;
  // The noise is close to normal: the threshold that leaves the coverage above it (the normal
  // quantile, Abramowitz and Stegun 26.2.23), with soft, lacy edges below a dense core.
  float t = sqrt(-2.0 * log(coverage));
  float threshold = seaFoam.x * (t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1.0 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t));
  float n = seaFoamSliced(local, viewDistance, seaFoamSlice, seaFoam.z);
  float pattern = smoothstep(threshold - 0.05, threshold + 0.25, n) * 0.85;
  return mix(pattern, coverage, average);
}
`
