import * as THREE from 'three'
import { standInScene } from '../../scene/precompile.js'
import '../../scene/sunAndSkyLight.js' // registers <sun_and_sky_light> (and <atmosphere_common>)
import { SunAndSkyLight } from '../../scene/sunAndSkyLight.js'
import { cloudNoiseTextures, smearStats } from './cloudNoise.js'
import { WeatherMap } from './weatherMap.js'
import { RealClouds } from './realClouds.js'
import { RAIN_AREA } from '../../physics/weather.js'
import { MULTIPLE_SCATTERING } from '../../scene/skyIrradiance.js'

// Volumetric clouds over the whole planet, from the weather (weatherMap.js) and tiling noise
// (cloudNoise.js), drawn over the rendered scene in three passes at RESOLUTION of the screen:
//
// 1. Distance: the scene again, writing each pixel's distance from the camera, so the clouds stop at
//    whatever is in front of them (the ground, the sea, the ring, a vehicle in a cloud).
// 2. Clouds: each pixel's line of sight is marched through the cloud shell (sea level to SHELL_TOP over
//    the ellipsoid, stretched to a sphere as the sky does), up to the ground or the scene, across the
//    cells of a grid fixed to the planet (see main): what is drawn depends on where the camera is only
//    through where it is seen from, so moving the camera never makes the clouds shimmer, slide or pop
//    (samples at distances from the camera, or jittered, sliced them into terraces that slid as it
//    moved); nothing changes from frame to frame, so recordings are repeatable. Along the way:
//    - The weather map gives the cover, the low cloud layer's base and top, the convective share, the
//      rain and the wind. Convective weather gives cumulus, rising into towers in heavy showers;
//      otherwise the layer is stratiform.
//    - The density is the shape noise, its gaps widened where the cover is low and its edges eroded by
//      the detail noise, through the layer's height profile. The noise is anchored to the planet
//      (sampled at planet coordinates relative to the camera plus the camera's position modulo the
//      tile, worked out in float64), and drifts with the wind by flow-mapping: two copies, each
//      displaced by the wind for up to DRIFT_PERIOD and restarted in turn, cross-faded, so the drift
//      never distorts it without bound.
//    - Light: the sun's (dimmed by the air and the planet's shadow: sunAndSkyLight.js) through the
//      cloud towards the sun (a short march), with a two-lobed phase function and approximate
//      multiple scattering; the sky's and the ground's from below and above; and the haze between
//      the camera and the cloud.
//    Below the clouds the march also crosses the air's own murk: rain shafts under raining clouds
//    (rainShaft), and haze, mist or sea fog from the humidity near the surface (airMurk), which cut how
//    far one can see. They are lit by the sun as it reaches the end of the line of sight (one shadow
//    march per pixel rather than per step, so there are no shafts of light through them).
//    And for each pixel showing the scene, how much its light is dimmed by the clouds: the sun's share
//    of the light there (sunAndSkyLight.js's model) times the cloud's transmittance towards the sun
//    (cloudShadow), and the sky's share less under overcast.
// 3. Composite: the scene dimmed by the clouds' shadow, the clouds over it (premultiplied; their
//    transmittance dims what is behind), and rain streaks when the camera is in the rain.

// The cloud target's resolution (of the screen's), the same from every height (switching it changed the
// pixels' footprints, and with them the clouds' detail, at once).
const RESOLUTION = 0.5
// The pixel footprints (m) over which the clouds become a flat layer of the real clouds' opacity, at
// FLAT_HEIGHT (m), as the imagery shows them from far out in space (too small to see as shapes, and the
// march's cells are too few to show them steadily).
const FLAT_FOOTPRINT = [1500, 5000]
const FLAT_HEIGHT = 2000
// The flat layer's light: shares of the sunlight on it (by the sun's height) and of the sky's.
const FLAT_SUN = 0.55
const FLAT_SKY = 1.0
const SHELL_TOP = 13000 // m
// The march (see main): the cloud layer, from LAYER_BOTTOM (m) up (below the lowest cloud bases), in the
// cells of a grid fixed to the planet: fine cells CELL_MIN (m) and up, powers of two at about CELL_SHARE
// of the distance, climbing or falling no more than VERTICAL_CELL (m) across one (HIGH_CELLS times both
// where there can only be high cloud), in coarse cells COARSE fine ones across, up to CELL_MAX (m), at
// most MAX_COARSE of them; HEIGHT_MARGIN (m): how far beyond a column's layers cloud is looked for.
// MURK_STEPS across each stretch below the layer.
const CELL_MIN = 16
const CELL_MAX = 8192
const CELL_SHARE = 0.004
const COARSE = 8
const MAX_COARSE = 1500
const HEIGHT_MARGIN = 100
const HIGH_CELLS = 8
const VERTICAL_CELL = 150
const MURK_STEPS = 10
const LAYER_BOTTOM = 250
// The pixel footprints (m) over which the clouds' shapes fade to their expected density.
const LOD_FOOTPRINT = [150, 900]
const LIGHT_STEPS = 5
// The sky's and the ground's light inside the clouds: dimmed by the cloud above (or below) as
// exp(-AMBIENT_EXTINCTION * its optical depth), slower than the direct sunlight as it is scattered on
// rather than lost; VERTICAL_STEPS samples each way (see verticalDepth).
const AMBIENT_EXTINCTION = 0.5
const VERTICAL_STEPS = 4
// The noise tiles (m): shape and detail.
const SHAPE_TILE = 24000
const DETAIL_TILE = 3000
// Large-scale structure (cloud streets and cells, clusters and gaps): the shape noise again on this tile
// (m), moving the cover through a probit transform, so it shows where the clouds themselves are too
// small to see (from orbit).
const MACRO_TILE = 400000
// The clouds' types. The cover, where the satellite imagery is (realClouds.js; otherwise the weather's),
// is shared between two layers:
// - High cloud (cirrus, cirrostratus) takes the thin part of the opacity, up to HIGH_SHARE, where the
//   reanalysis has high cloud often (over HIGH_FREQUENCY; thin cirrus is what the faint brightening of
//   the imagery over clear sea mostly is); it is thin (opacity HIGH_OPACITY where it is, an optical depth of about
//   0.3), so it covers a good deal more of the sky than its opacity; HIGH_THICKNESS (m) deep from the high
//   cloud base, drawn out into streaks along the wind (which is CIRRUS_WIND times the surface's aloft).
// - Low cloud for the rest of the imagery's opacity, less LOW_FLOOR of it (the imagery's opacity varies
//   about the blurred share the high cloud takes, and a thin sky would otherwise always have some low
//   cloud under its cirrus): a few fair-weather cumulus where there is little
//   (FAIR_CUMULUS of the sky, more with convection, in fields a few hundred kilometres across covering
//   about FAIR_FIELDS of the clear sky, the rest clear), turning into stratocumulus and then a stratus
//   sheet as it rises over STRATUS_ONSET; towers in showers (the weather's, where the imagery has cloud:
//   SHOWER_OPACITY).
const HIGH_SHARE = 0.45
const HIGH_FREQUENCY = [0.1, 0.5]
const LOW_FLOOR = 0.12
const HIGH_BLUR = 60000 // m
const SHOWER_OPACITY = [0.3, 0.7]
const HIGH_OPACITY = 0.25
const HIGH_THICKNESS = 1500
const HIGH_TILE = 30000
const HIGH_DENSITY = 0.012
// Its fibres (cirrus): the shape noise on FIBRE_TILE (m) (its channels by FIBRE_WEIGHTS, favouring the
// finer octaves, for narrow streaks), averaged over FIBRE_TAPS points along FIBRE_LENGTH (m) of the
// wind, so it is drawn out into hair-like streaks a few hundred metres across and kilometres long; the
// cloud is where that rises over FIBRE_EDGES (in standard deviations of it, see smearStats), and denser
// there, so the streaks gather some of the cloud the layer would have spread evenly.
// Where the high cover rises over VEIL_COVER it thickens into an even veil (cirrostratus).
const FIBRE_TILE = 4000
const FIBRE_LENGTH = 3000
const FIBRE_WEIGHTS = [0.3, 0.1, 0.3, 0.3]
const FIBRE_TAPS = 12
const FIBRE_EDGES = [0.3, 1.5]
const VEIL_COVER = [0.5, 0.9]
// The streaks: the shape noise averaged over STREAK_TAPS points along HIGH_STREAK_LENGTH (m) of the wind
// (which narrows its spread; STREAK_SPREAD restores it).
const STREAK_TAPS = 3
const HIGH_STREAK_LENGTH = 20000
const STREAK_SPREAD = 1.45
const CIRRUS_WIND = 3
const FAIR_CUMULUS = [0.012, 0.03]
const FAIR_FIELDS = 0.35
const STRATUS_ONSET = [0.4, 0.85]
const DRIFT_PERIOD = 2400 // s
// Extinction (1/m) of a cloud at full density.
const EXTINCTION = 0.03
// The air's murk (airMurk): the visibility (m) for the surface humidity, clear up to 88% (typical over
// the sea) and falling to fog near saturation: about 40 km at 90%, 10 km at 95%, 400 m at 99%.
const CLEAR_VISIBILITY = 60000
const FOG_VISIBILITY = 300
// Rain: visibility (m) for a rain rate R (mm/h), RAIN_VISIBILITY * R^-0.63.
const RAIN_VISIBILITY = 12000
// The clouds' shadow on the scene: samples across the low and the high cloud (see cloudShadow).
const SHADOW_STEPS = 16
const SHADOW_HIGH_STEPS = 4

const fullscreenVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const distanceMaterial = new THREE.ShaderMaterial({
  vertexShader: `
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vCloudDistance;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  vCloudDistance = length(mvPosition.xyz);
}
`,
  fragmentShader: `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vCloudDistance;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vCloudDistance, 0.0, 0.0, 1.0);
}
`,
  side: THREE.DoubleSide,
})

// The cloud march's fragment shader, for the shape noise's statistics (cloudNoise.js).
const marchFragment = (stats, fibre = smearStats(FIBRE_TAPS, FIBRE_LENGTH / FIBRE_TILE, FIBRE_WEIGHTS, FIBRE_EDGES)) => `
#include <common>
#include <sun_and_sky_light>
precision highp sampler3D;
uniform sampler2D distanceMap;
uniform sampler2D weatherA;
uniform sampler2D weatherB;
uniform sampler2D weatherC;
uniform sampler3D shapeNoise;
uniform sampler3D detailNoise;
uniform sampler3D occupancy;      // bounds on the shape noise (cloudNoise.js)
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform mat3 worldToPlanet;
uniform vec3 shapeOffset[2];    // the camera's planet position modulo the shape tile (m), for each drift copy
uniform vec3 detailOffset[2];
uniform vec3 cameraGrid;        // the camera's planet position modulo CELL_MAX (m), for the march's grid
uniform vec3 cameraPlanet;      // the camera's planet position (m; float32, for the high cloud's streaks)
uniform vec3 driftShift[2];     // each drift copy's own shift (m)
uniform vec3 macroOffset;        // the camera's planet position modulo the large-scale tile (m)
uniform sampler2D realClouds;    // the real clouds' opacity (realClouds.js)
uniform float realBlend;         // 1 where the real clouds' opacity sets the cover (it has loaded), else 0
uniform float realTexel;         // the real clouds' texel size (m)
uniform vec3 drift;             // x, y: the two copies' drift times (s); z: the second copy's weight
uniform vec2 exposure;          // x: the sky's exposure (Planet.js); y: the sun's intensity
uniform float pixelAngle;       // radians per pixel of the cloud target
varying vec2 vUv;
layout(location = 0) out vec4 outClouds;
layout(location = 1) out vec4 outShade;  // r: the scene's dimming by the clouds; g: rain at the camera (mm/h)

const float SHELL_TOP = ${SHELL_TOP.toFixed(1)};
const int MURK_STEPS = ${MURK_STEPS};
const float LAYER_BOTTOM = ${LAYER_BOTTOM.toFixed(1)};
const float EXTINCTION = ${EXTINCTION.toFixed(4)};

float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

// The rain under the clouds that are raining (mm/h; weather.js showerRain), from the weather map.
float showerRain(vec4 weather) {
  return weather.g / mix(${RAIN_AREA[0].toFixed(3)}, ${RAIN_AREA[1].toFixed(3)}, weather.b);
}

// The shape value's quantiles (cloudNoise.js): the threshold that leaves a fraction cover above it.
const float SHAPE_QUANTILE[${stats.quantiles.length}] = float[](${stats.quantiles.map(q => q.toFixed(5)).join(', ')});
const float SHAPE_MEAN = ${stats.mean.toFixed(5)};
const float SHAPE_TOP = ${stats.quantiles[stats.quantiles.length - 2].toFixed(5)};
float normalCdf(float x) {
  float t = 1.0 / (1.0 + 0.2316419 * abs(x));
  float tail = exp(-0.5 * x * x) * 0.3989422804 * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0.0 ? 1.0 - tail : tail;
}
float probit(float p) {
  float q = p < 0.5 ? p : 1.0 - p;
  float t = sqrt(-2.0 * log(q));
  float x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1.0 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return p < 0.5 ? -x : x;
}
float coverThreshold(float cover) {
  float x = clamp(1.0 - cover, 0.0, 1.0) * ${(stats.quantiles.length - 1).toFixed(1)};
  int i = int(min(floor(x), ${(stats.quantiles.length - 2).toFixed(1)}));
  return mix(SHAPE_QUANTILE[i], SHAPE_QUANTILE[i + 1], x - float(i));
}

// The planet frame position (m, relative to the camera) and its latitude/longitude (degrees) for a
// point at offset o (world axes) from the camera; p is that point in the stretched frame.
vec2 latLon(vec3 p) {
  vec3 q = worldToPlanet * p;
  float k = 1.0 + slPole.w;
  return vec2(degrees(atan(k * q.y, length(q.xz))), degrees(atan(q.x, q.z)));
}

vec2 mapUv(vec2 ll) { return vec2(ll.y / 360.0 + 0.5, (ll.x + 90.0) / 180.0); }

// The two copies of the noise (flow-mapped with the wind) at q, cross-faded with their spread kept.
float driftedShape(vec3 local, vec3 wind, float tile, vec3 offsets[2], out float detail, bool full) {
  float shape = 0.0;
  detail = 0.0;
  for (int i = 0; i < 2; i++) {
    float weight = i == 0 ? 1.0 - drift.z : drift.z;
    vec3 q = local - wind * (i == 0 ? drift.x : drift.y);
    vec4 s = texture(shapeNoise, (q + offsets[i]) / tile);
    float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
    shape += weight * remap(s.r, fbm - 1.0, 1.0, 0.0, 1.0);
    if (full) {
      vec4 dn = texture(detailNoise, (q + detailOffset[i]) / ${DETAIL_TILE.toFixed(1)});
      detail += weight * (dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125);
    }
  }
  // (Cross-fading two copies narrows the spread: restore it, so the cover stays the same.)
  return SHAPE_MEAN + (shape - SHAPE_MEAN) / length(vec2(1.0 - drift.z, drift.z));
}

// Density (0..1) of thresholded noise for a cover: from 0 at the threshold to 1 near the noise's top
// (SHAPE_TOP), so even sparse clouds are dense at their cores.
float thresholdDensity(float shape, float cover) {
  float threshold = coverThreshold(cover);
  return clamp((shape - threshold) / max(SHAPE_TOP - threshold, 0.02), 0.0, 1.0);
}

// The weather and cloud cover of a column of the sky (the same for every height in it, and changing
// little across a coarse cell of the march, which blends it between the cell's ends): from the
// textures at uv, the point p (stretched) and planet-frame offset local, for a pixel footprint (m).
struct CloudColumn {
  float highCover, highOpacity, lowCover, stratiform, showers;
  float base, top, highBase;
  vec3 wind, east;
  float humidity, rain;
};

CloudColumn cloudColumn(vec2 uv, vec3 p, vec3 local, float footprint) {
  vec4 a = texture2D(weatherA, uv);
  vec4 b = texture2D(weatherB, uv);
  // The sky's opacity seen from space: the real clouds' (less the imagery's floor of faint haze and noise
  // over clear sea, about 0.05; the mip level from the pixel's footprint, as automatic derivatives mean
  // nothing along a ray and jump at the date line), or the weather's.
  float opacity, opacitySmooth;
  if (realBlend > 0.5) {
    float real = textureLod(realClouds, uv, log2(max(footprint, 1.0) / realTexel)).r;
    opacity = clamp((real - 0.05) / 0.95, 0.0, 1.0);
    // (And blurred over about HIGH_BLUR, for the high cloud's share: see below.)
    float smoothReal = textureLod(realClouds, uv, max(log2(max(footprint, 1.0) / realTexel), log2(${HIGH_BLUR.toFixed(1)} / realTexel))).r;
    opacitySmooth = clamp((smoothReal - 0.05) / 0.95, 0.0, 1.0);
  }
  else {
    opacity = a.r * 0.9;
    opacitySmooth = opacity;
    // (Large-scale structure in the weather's smooth cover, fading out as it shrinks below a pixel.)
    float macroDetail = 1.0 - smoothstep(2000.0, 8000.0, footprint);
    if (macroDetail > 0.0 && opacity > 0.01) {
      vec4 m = texture(shapeNoise, (local + macroOffset) / ${MACRO_TILE.toFixed(1)});
      float macro = remap(m.r, m.g * 0.625 + m.b * 0.25 + m.a * 0.125 - 1.0, 1.0, 0.0, 1.0) - SHAPE_MEAN;
      opacity = normalCdf(probit(clamp(opacity, 0.005, 0.995)) + 9.0 * macro * macroDetail);
    }
  }
  // Shared between the layers: high cloud where the reanalysis has it, the rest low.
  // (The high cloud's share follows the opacity blurred over HIGH_BLUR, so that only the low cloud carries
  // the imagery's edges: with both layers following them, from orbit the same pattern showed at both
  // heights, apart by parallax, as double vision.)
  float highOpacity = min(opacitySmooth, ${HIGH_SHARE.toFixed(3)}) * smoothstep(${HIGH_FREQUENCY[0].toFixed(2)}, ${HIGH_FREQUENCY[1].toFixed(2)}, a.a);
  float highCover = clamp(highOpacity / ${HIGH_OPACITY.toFixed(3)}, 0.0, 1.0);
  float lowOpacity = clamp((1.0 - (1.0 - opacity) / (1.0 - highOpacity) - ${LOW_FLOOR.toFixed(2)}) / ${(1 - LOW_FLOOR).toFixed(2)}, 0.0, 1.0);
  float convective = a.b;
  float showers = convective * clamp(showerRain(a) / 3.0, 0.0, 1.0) * smoothstep(${SHOWER_OPACITY[0].toFixed(2)}, ${SHOWER_OPACITY[1].toFixed(2)}, opacity);
  // (The fair-weather cumulus come in fields: the large-scale noise above its FAIR_FIELDS quantile.)
  vec4 fm = texture(shapeNoise, (local + macroOffset) / ${MACRO_TILE.toFixed(1)});
  float field = remap(fm.r, fm.g * 0.625 + fm.b * 0.25 + fm.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
  float fieldThreshold = coverThreshold(${FAIR_FIELDS.toFixed(2)});
  float fair = mix(${FAIR_CUMULUS[0].toFixed(3)}, ${FAIR_CUMULUS[1].toFixed(3)}, convective) * smoothstep(fieldThreshold - 0.03, fieldThreshold + 0.06, field);
  float lowCover = max(lowOpacity / 0.9, fair);
  float stratiform = smoothstep(${STRATUS_ONSET[0].toFixed(2)}, ${STRATUS_ONSET[1].toFixed(2)}, lowCover) * (1.0 - showers);
  vec3 up = normalize(worldToPlanet * p);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), up));
  vec3 north = cross(up, east);
  float base = b.x * 1000.0;
  float cumulusTop = base + 800.0 + 1500.0 * lowCover + 9000.0 * showers;
  vec4 c = texture2D(weatherC, uv);
  CloudColumn col;
  col.highCover = highCover;
  col.highOpacity = highOpacity;
  col.lowCover = lowCover;
  col.stratiform = stratiform;
  col.showers = showers;
  col.base = base;
  col.top = mix(cumulusTop, max(b.y * 1000.0, base + 500.0), stratiform);
  col.highBase = c.g * 1000.0;
  col.wind = b.z * east + b.w * north;
  col.east = east;
  col.humidity = c.r;
  col.rain = showerRain(a);
  return col;
}

// Cloud density (0..1) in a column at planet-frame offset from the camera local, altitude h (m); full
// adds the detail erosion. layer: the height within its layer (0 at the base, 1 at the top; 1 in high
// cloud).
float columnDensity(CloudColumn col, vec3 local, float h, bool full, float footprint, out float layer) {
  layer = 0.0;
  float highCover = col.highCover, highOpacity = col.highOpacity, lowCover = col.lowCover;
  float stratiform = col.stratiform, showers = col.showers, base = col.base, top = col.top;
  vec3 surfaceWind = col.wind, east = col.east;
  // Too far for the noise's features (a few hundred metres up) to be seen: its expected value.
  float lod = smoothstep(${LOD_FOOTPRINT[0].toFixed(1)}, ${LOD_FOOTPRINT[1].toFixed(1)}, footprint);
  float density = 0.0;

  // Low cloud.
  float hf = (h - base) / (top - base);
  if (hf > 0.0 && hf < 1.0) {
    layer = hf;
    // Height profiles: cumulus rounded at the top, stratus flat.
    float cumulus = smoothstep(0.0, 0.08, hf) * smoothstep(1.0, 0.45, hf);
    float stratus = smoothstep(0.0, 0.2, hf) * smoothstep(1.0, 0.75, hf);
    float profile = mix(cumulus, stratus, stratiform);
    float d = 0.0, detail = 0.0;
    if (lod < 1.0) {
      float shape = driftedShape(local, surfaceWind * 1.5, ${SHAPE_TILE.toFixed(1)}, shapeOffset, detail, full);
      d = thresholdDensity(shape, lowCover) * profile;
      // Edges eroded by the detail noise (wispy below, billowy above); less on stratus.
      if (full && d > 0.0) d = remap(d, mix(0.3, 0.12, stratiform) * mix(detail, 1.0 - detail, clamp(hf * 4.0, 0.0, 1.0)), 1.0, 0.0, 1.0);
    }
    // Too far for the clouds to be told apart: a density giving the column the transmittance of a cover
    // of opaque clouds (spreading the clouds' own density out evenly would make any cover of them opaque).
    float far = -log(1.0 - 0.95 * min(lowCover, 1.0)) / (EXTINCTION * (top - base) * 0.5) * profile;
    density += mix(clamp(d, 0.0, 1.0), far, lod) * mix(1.0, 1.6, showers);
  }

  // High cloud: streaks along the wind aloft.
  float hb = col.highBase;
  float hh = (h - hb) / ${HIGH_THICKNESS.toFixed(1)};
  if (highCover > 0.005 && hh > 0.0 && hh < 1.0) {
    layer = 1.0;
    float profile = smoothstep(0.0, 0.3, hh) * smoothstep(1.0, 0.6, hh);
    vec3 windAloft = surfaceWind * ${CIRRUS_WIND.toFixed(1)};
    vec3 along = normalize(length(windAloft) > 0.1 ? windAloft : east);
    float d = 0.0;
    if (lod < 1.0) {
      // Drawn out along the wind: the noise averaged over STREAK_TAPS points along it (a smear depends only on
      // the point's own position, so the streaks stay put as the camera moves; squeezing the coordinates
      // along the wind needs a point to squeeze about, and about the camera they slid and jumped). In the
      // planet's frame: float32 is precise enough here, to about a metre, for features kilometres across.
      vec3 planetPoint = cameraPlanet + local;
      float shape = 0.0, fibre = 0.0;
      for (int i = 0; i < 2; i++) {
        float weight = i == 0 ? 1.0 - drift.z : drift.z;
        if (weight < 0.002) continue;
        float age = i == 0 ? drift.x : drift.y;
        // (Offset from the low cloud's noise, so the two layers' shapes are unrelated.)
        vec3 q = planetPoint - windAloft * age + driftShift[i] + vec3(9137.0, 4211.0, 15731.0);
        float smear = 0.0;
        for (int k = 0; k < ${STREAK_TAPS}; k++) {
          vec4 sn = texture(shapeNoise, (q + along * ${HIGH_STREAK_LENGTH.toFixed(1)} * (float(k) / ${(STREAK_TAPS - 1).toFixed(1)} - 0.5)) / ${HIGH_TILE.toFixed(1)});
          smear += remap(sn.r, sn.g * 0.625 + sn.b * 0.25 + sn.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
        }
        // (Averaging narrows the noise's spread: restored, so the cover stays about the same.)
        shape += weight * (SHAPE_MEAN + (smear / ${STREAK_TAPS.toFixed(1)} - SHAPE_MEAN) * ${STREAK_SPREAD.toFixed(2)});
        if (full) {
          vec3 qf = planetPoint - windAloft * age + driftShift[i];
          float f = 0.0;
          for (int k = 0; k < ${FIBRE_TAPS}; k++) {
            f += dot(texture(shapeNoise, (qf + along * ${FIBRE_LENGTH.toFixed(1)} * (float(k) / ${(FIBRE_TAPS - 1).toFixed(1)} - 0.5)) / ${FIBRE_TILE.toFixed(1)}), vec4(${FIBRE_WEIGHTS.map(w => w.toFixed(2)).join(', ')}));
          }
          fibre += weight * (f / ${FIBRE_TAPS.toFixed(1)} - ${fibre.mean.toFixed(5)}) / ${fibre.sd.toFixed(5)};
        }
      }
      shape = SHAPE_MEAN + (shape - SHAPE_MEAN) / length(vec2(1.0 - drift.z, drift.z));
      d = thresholdDensity(shape, highCover) * profile;
      // Fibres along the wind (cirrus), filling in to an even veil as the cover rises (cirrostratus).
      if (full && d > 0.0) {
        fibre /= length(vec2(1.0 - drift.z, drift.z));
        // (Gathered into the streaks, though not all of it: cirrus stays thin and translucent.)
        float streaks = smoothstep(${FIBRE_EDGES[0].toFixed(2)}, ${FIBRE_EDGES[1].toFixed(2)}, fibre) / ${Math.sqrt(fibre.filled).toFixed(4)};
        d = min(d, 1.0) * mix(streaks, 1.0, smoothstep(${VEIL_COVER[0].toFixed(2)}, ${VEIL_COVER[1].toFixed(2)}, highCover));
      }
    }
    float far = -log(1.0 - highOpacity) / (EXTINCTION * ${HIGH_THICKNESS.toFixed(1)} * 0.5) * profile;
    // (Not clamped to 1: the fibres gather the layer's cloud into the streaks.)
    density += mix(max(d, 0.0) * ${HIGH_DENSITY.toFixed(3)}, far, lod);
  }
  return density;
}

float cloudDensity(vec2 uv, vec3 p, vec3 local, float h, bool full, float footprint, out float layer) {
  return columnDensity(cloudColumn(uv, p, local, footprint), local, h, full, footprint, layer);
}

// The distance along the line of sight D (planet axes; safeD: D with no zero component) from r to where
// it leaves the grid's cell of size cell (m) it is in (moving on from a cell's plane, into the next).
float cellExit(float r, float cell, vec3 D, vec3 safeD) {
  vec3 q = cameraGrid + D * r;
  vec3 inside = floor((q + D * (cell * 1e-3)) / cell) * cell;   // (nudged off the plane it is on)
  vec3 ahead = (inside + step(vec3(0.0), D) * cell - q) / safeD;
  return max(min(ahead.x, min(ahead.y, ahead.z)), cell * 1e-3);
}

// An upper bound on the shape noise's value anywhere within extent (m) of q (m, before dividing by the
// tile): the highest of the occupancy texture's blocks overlapping that box, at the finest level whose
// blocks are at least the box's size across (so it overlaps at most two along each axis).
float shapeBound(vec3 q, float extent, float tile) {
  int size = textureSize(occupancy, 0).x;
  float texels = 2.0 * extent / tile * float(size);
  int level = int(clamp(ceil(log2(max(texels, 1.0))), 0.0, log2(float(size))));
  int n = size >> level;
  vec3 lo = (fract(q / tile) - extent / tile) * float(n);
  ivec3 a = ivec3(floor(lo)), b = ivec3(floor(lo + 2.0 * extent / tile * float(n)));
  float bound = 0.0;
  for (int k = 0; k < 8; k++) {
    ivec3 i = ivec3((k & 1) == 0 ? a.x : b.x, (k & 2) == 0 ? a.y : b.y, (k & 4) == 0 ? a.z : b.z);
    i = ((i % n) + n) % n;
    bound = max(bound, texelFetch(occupancy, ivec3(i.xy, 2 * size - 2 * n + i.z), 0).r);
  }
  return bound;
}

// The cloud's optical depth from p (stretched; local: its planet-frame offset from the camera) towards the
// sun (sunDirS stretched), in a column col, over LIGHT_STEPS steps doubling from 60 m.
float sunwardDepth(CloudColumn col, vec3 p, vec3 local, vec3 sunDirS, float footprint) {
  float a = slParams.z;
  float od = 0.0, unused;
  float lightStep = 60.0;
  for (int k = 0; k < ${LIGHT_STEPS}; k++) {
    float lightAt = lightStep * (float(k) + 0.5);
    vec3 q = p + sunDirS * lightAt;
    vec3 ql = local + worldToPlanet * (slSun * lightAt);
    od += columnDensity(col, ql, length(q) - a, false, footprint, unused) * lightStep;
    lightStep *= 2.0;
  }
  return od * EXTINCTION;
}

// The share of sunlight scattered towards the eye at optical depth od from the sun: multiple scattering,
// approximately (octaves of weaker extinction and flatter phase), less the powder effect (the sunlit side
// of a cloud's surface is darker than its depths' glow).
float cloudScatter(float od, float phase) {
  float scatter = 0.0;
  float att = 1.0, ext = 1.0, ph = 1.0;
  for (int k = 0; k < 3; k++) {
    scatter += att * exp(-od * ext) * mix(1.0 / (4.0 * PI), phase, ph);
    att *= 0.5; ext *= 0.5; ph *= 0.5;
  }
  return scatter * (1.0 - 0.6 * exp(-od * 2.0));
}

// The cloud's optical depth straight up (dir 1) or down (dir -1) from height h (m) at planet-frame offset
// local, in a column col: VERTICAL_STEPS steps doubling from 80 m, for the sky's light from above and the
// ground's from below.
float verticalDepth(CloudColumn col, vec3 local, float h, float dir, float footprint) {
  vec3 up = normalize(cameraPlanet + local);
  float od = 0.0, unused;
  float stepLength = 80.0;
  for (int k = 0; k < ${VERTICAL_STEPS}; k++) {
    float at = dir * stepLength * (float(k) + 0.5);
    if (h + at < 0.0) break;
    od += columnDensity(col, local + up * at, h + at, false, footprint, unused) * stepLength;
    stepLength *= 2.0;
  }
  return od * EXTINCTION;
}

// Columns blended (t from a to b), for the points between two where they are known.
CloudColumn mixColumn(CloudColumn a, CloudColumn b, float t) {
  CloudColumn m;
  m.highCover = mix(a.highCover, b.highCover, t);
  m.highOpacity = mix(a.highOpacity, b.highOpacity, t);
  m.lowCover = mix(a.lowCover, b.lowCover, t);
  m.stratiform = mix(a.stratiform, b.stratiform, t);
  m.showers = mix(a.showers, b.showers, t);
  m.base = mix(a.base, b.base, t);
  m.top = mix(a.top, b.top, t);
  m.highBase = mix(a.highBase, b.highBase, t);
  m.wind = mix(a.wind, b.wind, t);
  m.east = normalize(mix(a.east, b.east, t));
  m.humidity = mix(a.humidity, b.humidity, t);
  m.rain = mix(a.rain, b.rain, t);
  return m;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float phaseHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

// Ray against a sphere of radius r about the origin from o along unit d: entry and exit (-1 if none).
vec2 sphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d), c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

// The real clouds' opacity (or the weather's cover) at uv, as the flat layer shows it, for a footprint (m).
float flatOpacityAt(vec2 uv, float footprint) {
  if (realBlend > 0.5) return clamp((textureLod(realClouds, uv, log2(max(footprint, 1.0) / realTexel)).r - 0.05) / 0.95, 0.0, 1.0);
  return texture2D(weatherA, uv).r * 0.9;
}

// The share of sunlight reaching p (stretched; local: its planet-frame offset from the camera) through
// the clouds towards the sun (sunS, stretched), for a pixel footprint (m). The line towards the sun is
// sampled only where it crosses the layers' heights (from the column at p): SHADOW_STEPS across the low
// cloud and SHADOW_HIGH_STEPS across the high, at fixed fractions, so the samples are points fixed to the
// planet wherever the camera is. From far enough away (FLAT_FOOTPRINT, as the clouds themselves), the
// flat layer's opacity where the line crosses FLAT_HEIGHT instead.
float cloudShadow(vec3 p, vec3 local, vec3 sunS, float footprint) {
  float a = slParams.z;
  vec2 floorHit = sphere(p, sunS, a);
  if (floorHit.x > 0.0) return 0.0;  // (the planet's own shadow is the light model's)
  float hp = length(p) - a;
  float mu = max(dot(normalize(p), sunS), 0.02);
  float flatShare = smoothstep(${FLAT_FOOTPRINT[0].toFixed(1)}, ${FLAT_FOOTPRINT[1].toFixed(1)}, footprint);
  float flatLit = 1.0;
  if (flatShare > 0.0) {
    vec3 q = p + sunS * max((${FLAT_HEIGHT.toFixed(1)} - hp) / mu, 0.0);
    flatLit = 1.0 - flatOpacityAt(mapUv(latLon(q)), footprint);
    if (flatShare > 0.999) return flatLit;
  }
  CloudColumn col = cloudColumn(mapUv(latLon(p)), p, local, max(footprint, 150.0));
  float od = 0.0, unused;
  for (int layerIndex = 0; layerIndex < 2; layerIndex++) {
    bool low = layerIndex == 0;
    float bottom = low ? col.base : col.highBase, top = low ? col.top : col.highBase + ${HIGH_THICKNESS.toFixed(1)};
    if (!low && col.highCover <= 0.005) continue;
    float ta = max((bottom - ${HEIGHT_MARGIN.toFixed(1)} - hp) / mu, 0.0), tb = (top + ${HEIGHT_MARGIN.toFixed(1)} - hp) / mu;
    if (tb <= ta) continue;
    int steps = low ? ${SHADOW_STEPS} : ${SHADOW_HIGH_STEPS};
    float dt = (tb - ta) / float(steps);
    for (int j = 0; j < ${SHADOW_STEPS}; j++) {
      if (j >= steps) break;
      float t = ta + dt * (float(j) + 0.5);
      vec3 q = p + sunS * t;
      od += cloudDensity(mapUv(latLon(q)), q, local + worldToPlanet * (slSun * t), length(q) - a, false, max(footprint, 150.0), unused) * dt;
    }
  }
  return mix(exp(-EXTINCTION * od), flatLit, flatShare);
}

// The air's murk at a point (extinction, 1/m), beyond the clear air the atmosphere model already has:
// haze from the surface humidity, thickening into mist and, near saturation, a shallow fog.
float airMurk(CloudColumn col, float h) {
  float rh = col.humidity;
  float visibility = ${CLEAR_VISIBILITY.toFixed(1)} * pow(clamp((1.0 - rh) / 0.12, 0.0, 1.0), 2.0);
  visibility = max(visibility, ${FOG_VISIBILITY.toFixed(1)});
  float extinction = max(3.912 / visibility - 3.912 / ${CLEAR_VISIBILITY.toFixed(1)}, 0.0);
  float height = mix(1200.0, 200.0, smoothstep(0.93, 0.99, rh));
  return extinction * exp(-max(h, 0.0) / height);
}

// Rain below the clouds (extinction, 1/m): under the cloud bases that are raining, a shaft as wide as
// the cloud above it.
float rainShaft(CloudColumn col, vec3 p, vec3 local, float h) {
  float rate = col.rain;
  if (rate < 0.1) return 0.0;
  float base = col.base;
  if (h > base) return 0.0;
  // The cloud a little above its base, straight up from here.
  vec3 up = normalize(p);
  float lift = base + 0.25 * (col.top - base) - h;
  float unused;
  float cloud = columnDensity(col, local + worldToPlanet * (up * lift), h + lift, false, 400.0, unused);
  return smoothstep(0.02, 0.25, cloud) * 3.912 / (${RAIN_VISIBILITY.toFixed(1)} * pow(rate, -0.63));
}

// The rain at the camera (mm/h), with the same shaft as rainShaft (0 above the cloud base).
float cameraRain(vec3 c, vec3 cameraLocal) {
  float shaft = rainShaft(cloudColumn(mapUv(latLon(c)), c, cameraLocal, 400.0), c, cameraLocal, length(c) - slParams.z);
  return shaft > 0.0 ? pow(shaft * ${RAIN_VISIBILITY.toFixed(1)} / 3.912, 1.0 / 0.63) : 0.0;
}

void main() {
  vec4 view = inverseProjection * vec4(vUv * 2.0 - 1.0, -1.0, 1.0); // (the near plane: the far one is too far for float32)
  vec3 dirWorld = normalize((cameraWorld * vec4(normalize(view.xyz / view.w), 0.0)).xyz);
  // The stretched frame: positions with the polar axis scaled so the ellipsoid is a sphere of radius a.
  vec3 ds = dirWorld + slPole.w * dot(dirWorld, slPole.xyz) * slPole.xyz;
  float stretch = length(ds);
  vec3 d = ds / stretch;
  vec3 c = slCamera.xyz;
  float a = slParams.z;
  float sceneDistance = texture2D(distanceMap, vUv).r;
  vec2 outer = sphere(c, d, a + SHELL_TOP);
  vec2 ground = sphere(c, d, a);
  float t0 = max(outer.x, 0.0);
  float t1 = outer.y;
  if (ground.x > 0.0) t1 = min(t1, ground.x);
  t1 = min(t1, sceneDistance * stretch);
  vec3 sunDirS = normalize(slSun + slPole.w * dot(slSun, slPole.xyz) * slPole.xyz);
  // The scene's dimming by the clouds, at the end of the line of sight (the ground or the scene).
  float tScene = min(ground.x > 0.0 ? ground.x : 1e30, sceneDistance * stretch);
  float sceneSun = 1.0, shade = 1.0;
  if (tScene < 1e20 && slParams.x > 0.5) {
    vec3 ps = c + d * tScene;
    vec3 localS = worldToPlanet * (dirWorld * (tScene / stretch));
    sceneSun = cloudShadow(ps, localS, sunDirS, tScene / stretch * pixelAngle);
    vec3 up = normalize(ps);
    float mu = dot(up, slSun);
    vec3 sun = slSunTransmittance(ps) * max(mu, 0.0);
    vec3 sky = slSkyIrradiance(mu) * slParams.y;
    float directShare = dot(sun, vec3(0.2126, 0.7152, 0.0722)) / max(dot(sun + sky, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
    float cover = texture2D(weatherA, mapUv(latLon(ps))).r;
    float lit = directShare * sceneSun + (1.0 - directShare) * (1.0 - 0.5 * cover * cover);
    // (Seen through the air's haze, which the shadow does not darken: by the air's transmittance.)
    float at0, at1;
    float airSeen = 1.0;
    if (atmoRoots(dot(ds / stretch, ds / stretch), dot(c, d), dot(c, c) - (a + 100000.0) * (a + 100000.0), at0, at1)) {
      vec3 airLight, airTransmittance;
      atmoScatter(c, d, dirWorld, max(at0, 0.0), min(at1, tScene), slSun, a, 8, airLight, airTransmittance);
      airSeen = dot(airTransmittance, vec3(0.2126, 0.7152, 0.0722));
    }
    shade = mix(1.0, lit, airSeen);
  }
  else if (slParams.x > 0.5) {
    // (Sky: the murk's sunlight as at the camera.)
    sceneSun = cloudShadow(c, vec3(0.0), sunDirS, 400.0);
  }
  float rainHere = cameraRain(c, vec3(0.0));
  outShade = vec4(shade, rainHere, 0.0, 1.0);
  if (outer.y <= 0.0 || t1 <= t0) { outClouds = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // The march. Everything it samples must be fixed to the planet, so that moving the camera cannot
  // change what is drawn, only where it is seen from: sampling at distances from the camera (in steps,
  // fine or jittered) sliced the clouds into terraces that slid over them as it moved (moire).
  // - The cloud layer (from LAYER_BOTTOM to the shell's top) is cut into the cells of a grid fixed to the
  //   planet (planet axes, powers of two growing with the distance so each divides the next: see
  //   CELL_SHARE), and the density is integrated across each cell's stretch of the line of sight by
  //   Simpson's rule, from its values where the line of sight enters and leaves the cell (on the grid's
  //   planes) and at the middle; the light from the sun through the cloud is worked out at the ends and
  //   blended across. The cells' boundaries belong to the world, and the points move smoothly along them
  //   as the camera moves, so nothing slides.
  // - The fine cells come in coarse ones. Where neither of a coarse cell's columns can hold cloud at the
  //   heights crossed, or (near enough for the noise's shapes) the noise cannot reach the cover's
  //   threshold anywhere along it (the occupancy bounds, cloudNoise.js), only the murk is added. Either
  //   test only skips what would be empty, so it changes nothing that is drawn.
  // - The weather and the light change little across a coarse cell: from its ends (blended) and middle.
  // - Below the layer there is only the murk, which is smooth: MURK_STEPS steps each side.
  float transmittance = 1.0;
  vec3 light = vec3(0.0);
  float depthSum = 0.0, depthWeight = 0.0;
  float sunCos = dot(d, normalize(slSun + slPole.w * dot(slSun, slPole.xyz) * slPole.xyz));
  float phase = mix(phaseHG(sunCos, 0.65), phaseHG(sunCos, -0.2), 0.3);
  float sunIntensity = exposure.y;
  float murkPhase = mix(phaseHG(sunCos, 0.5), 1.0 / (4.0 * PI), 0.5);
  vec3 white = mix(vec3(1.0), SL_WHITE, slParams.y) * sunIntensity;
  // The line of sight in the planet's axes (true metres), and the grid's coordinates (the camera's planet
  // position modulo CELL_MAX, worked out in float64, plus the offset from it).
  vec3 D = normalize(worldToPlanet * dirWorld);
  vec3 safeD = vec3(abs(D.x) > 1e-6 ? D.x : 1e-6, abs(D.y) > 1e-6 ? D.y : 1e-6, abs(D.z) > 1e-6 ? D.z : 1e-6);
  // From far enough away, the flat layer (FLAT_FOOTPRINT), lit by the sun on it and the sky above it; in
  // between, blended with the march's clouds.
  float flatShare = 0.0;
  vec3 flatLight = vec3(0.0);
  float flatOpacity = 0.0, tFlat = 0.0;
  vec2 flatHit = sphere(c, d, a + ${FLAT_HEIGHT.toFixed(1)});
  if (flatHit.y > 0.0) {
    tFlat = flatHit.x > 0.0 ? flatHit.x : flatHit.y;
    float footprint = tFlat / stretch * pixelAngle;
    flatShare = smoothstep(${FLAT_FOOTPRINT[0].toFixed(1)}, ${FLAT_FOOTPRINT[1].toFixed(1)}, footprint);
    if (flatShare > 0.0 && tFlat >= t0 && tFlat <= t1) {
      vec3 pf = c + d * tFlat;
      vec2 uv = mapUv(latLon(pf));
      flatOpacity = flatOpacityAt(uv, footprint);
      // (Seen aslant, more of the sky is cloud: the clear share falls as through a layer, by the length of
      // the line of sight across it, as the march's clouds do from afar.)
      float slant = abs(dot(D, normalize(cameraPlanet + D * (tFlat / stretch))));
      flatOpacity = 1.0 - pow(1.0 - min(flatOpacity, 0.999), min(1.0 / max(slant, 1e-3), 30.0));
      vec3 fDirect, fSkyDown, fGroundUp, fUp;
      slLightAt(dirWorld * (tFlat / stretch), fDirect, fSkyDown, fGroundUp, fUp);
      float mu = max(dot(fUp, slSun), 0.0);
      flatLight = (fDirect * mu * ${FLAT_SUN.toFixed(2)} + fSkyDown * ${FLAT_SKY.toFixed(2)} * RECIPROCAL_PI) * sunIntensity * flatOpacity;
    }
  }
  // The stretches: below the layer before it (from a camera under it), in it, and below it after it
  // (looking down through it).
  vec2 bottom = sphere(c, d, a + LAYER_BOTTOM);
  float tLayer0 = t0, tLayer1 = t1;
  if (length(c) < a + LAYER_BOTTOM) tLayer0 = min(max(bottom.y, t0), t1);
  else if (bottom.x > t0) tLayer1 = min(bottom.x, t1);
  for (int stretchIndex = 0; stretchIndex < 3; stretchIndex++) {
    if (flatShare > 0.999) break;
    float ta = stretchIndex == 0 ? t0 : stretchIndex == 1 ? tLayer0 : tLayer1;
    float tb = stretchIndex == 0 ? tLayer0 : stretchIndex == 1 ? tLayer1 : t1;
    if (tb <= ta) continue;
    float r = ta / stretch, rEnd = tb / stretch;   // true metres along the line of sight
    if (stretchIndex != 1) {
      // Below the layer: the murk alone.
      for (int i = 0; i < MURK_STEPS; i++) {
        float r1 = min(r + (rEnd - ta / stretch) / float(MURK_STEPS), rEnd);
        float rm = 0.5 * (r + r1);
        vec3 p = c + d * (rm * stretch);
        float h = length(p) - a;
        vec3 local = D * rm;
        CloudColumn col = cloudColumn(mapUv(latLon(p)), p, local, rm * pixelAngle);
        float murk = airMurk(col, h) + rainShaft(col, p, local, h);
        if (murk > 1e-7) {
          vec3 stepDirect, stepSkyDown, stepGroundUp, upW;
          slLightAt(dirWorld * rm, stepDirect, stepSkyDown, stepGroundUp, upW);
          vec3 murkLight = (stepDirect * sceneSun * murkPhase * 4.0 * PI * 0.25 + (stepSkyDown + stepGroundUp) * RECIPROCAL_PI * 0.5) * white;
          float murkT = exp(-murk * (r1 - r) * stretch);
          light += transmittance * murkLight * (1.0 - murkT);
          transmittance *= murkT;
        }
        r = r1;
        if (r >= rEnd || transmittance < 0.01) break;
      }
      if (transmittance < 0.01) break;
      continue;
    }
    // The layer, a coarse cell at a time (COARSE fine cells across). The weather, the light and the murk
    // change little across one: its columns are worked out where the line of sight enters and leaves it
    // (and blended between), its light at the middle. Where neither end's column can hold cloud at the
    // stretch's heights, only the murk is added; otherwise the fine cells across it are integrated.
    vec3 pA = c + d * (r * stretch);
    CloudColumn colA = cloudColumn(mapUv(latLon(pA)), pA, D * r, r * pixelAngle);
    float d0 = 0.0;          // the density where the next fine cell starts
    bool d0Known = false;
    vec3 od0 = vec3(-1.0);   // its optical depths towards the sun, up and down (x < 0: not known)
    for (int i = 0; i < ${MAX_COARSE}; i++) {
      if (r >= rEnd) break;
      float fine = exp2(ceil(log2(clamp(r * ${CELL_SHARE.toFixed(4)}, ${CELL_MIN.toFixed(1)}, ${(CELL_MAX / COARSE).toFixed(1)}))));
      // (And short enough to climb or fall no more than VERTICAL_CELL across one, for the layers' height
      // profiles: looking down from orbit, cells as long as the distance asks for would each span the
      // whole layer, and slice it into rings.)
      float climb = abs(dot(D, normalize(cameraPlanet + D * r)));
      float steepest = exp2(max(floor(log2(${VERTICAL_CELL.toFixed(1)} / max(climb, 1e-4))), log2(${CELL_MIN.toFixed(1)})));
      fine = min(fine, steepest);
      float coarse = fine * ${COARSE.toFixed(1)};
      // (Far enough for only the expected density, which is smooth across: the coarse cell is one fine
      // cell, unless it would climb too far.)
      if (r * pixelAngle >= ${LOD_FOOTPRINT[1].toFixed(1)}) fine = min(coarse, steepest);
      float rc1 = min(r + cellExit(r, coarse, D, safeD), rEnd);
      float rcm = 0.5 * (r + rc1);
      vec3 pB = c + d * (rc1 * stretch);
      CloudColumn colB = cloudColumn(mapUv(latLon(pB)), pB, D * rc1, rc1 * pixelAngle);
      vec3 stepDirect, stepSkyDown, stepGroundUp, upW;
      slLightAt(dirWorld * rcm, stepDirect, stepSkyDown, stepGroundUp, upW);
      vec3 murkLight = (stepDirect * sceneSun * murkPhase * 4.0 * PI * 0.25 + (stepSkyDown + stepGroundUp) * RECIPROCAL_PI * 0.5) * white;
      vec3 sunlight = slSunTransmittance(c + d * (rcm * stretch)) * white;
      vec3 skyAmbient = stepSkyDown * 1.6 * sunIntensity * RECIPROCAL_PI * 0.5;
      vec3 groundAmbient = stepGroundUp * 0.6 * sunIntensity * RECIPROCAL_PI * 0.5;
      // The stretch's heights (the lowest where the line of sight passes closest to the centre).
      float hA = length(pA) - a, hB = length(pB) - a;
      float rLow = clamp(-dot(c, d) / stretch, r, rc1);
      float hLow = length(c + d * (rLow * stretch)) - a;
      float hHigh = max(hA, hB);
      bool lowCloud = max(colA.lowCover, colB.lowCover) > 0.002
        && hHigh > min(colA.base, colB.base) - ${HEIGHT_MARGIN.toFixed(1)} && hLow < max(colA.top, colB.top) + ${HEIGHT_MARGIN.toFixed(1)};
      bool highCloud = max(colA.highCover, colB.highCover) > 0.005
        && hHigh > min(colA.highBase, colB.highBase) - ${HEIGHT_MARGIN.toFixed(1)} && hLow < max(colA.highBase, colB.highBase) + ${(HIGH_THICKNESS + HEIGHT_MARGIN).toFixed(1)};
      // Near enough for the noise's shapes everywhere along it (no expected density): whether the noise
      // can reach the threshold of the higher cover anywhere along it (both drift copies, the wind
      // changing between the columns, and for the high cloud its smear along the wind).
      if (rc1 * pixelAngle <= ${LOD_FOOTPRINT[0].toFixed(1)}) {
        float halfLength = 0.5 * (rc1 - r);
        vec3 localM = D * rcm;
        float spreadNorm = length(vec2(1.0 - drift.z, drift.z));
        if (lowCloud) {
          vec3 windM = 0.75 * (colA.wind + colB.wind);
          float windChange = 0.75 * length(colB.wind - colA.wind);
          float bound = 0.0;
          for (int k = 0; k < 2; k++) {
            float age = k == 0 ? drift.x : drift.y;
            bound = max(bound, shapeBound(localM - windM * age + shapeOffset[k], halfLength + windChange * age, ${SHAPE_TILE.toFixed(1)}));
          }
          lowCloud = SHAPE_MEAN + (bound - SHAPE_MEAN) / spreadNorm > coverThreshold(max(colA.lowCover, colB.lowCover));
        }
        if (highCloud) {
          vec3 windM = 0.5 * ${CIRRUS_WIND.toFixed(1)} * (colA.wind + colB.wind);
          float windChange = 0.5 * ${CIRRUS_WIND.toFixed(1)} * length(colB.wind - colA.wind);
          float bound = 0.0;
          for (int k = 0; k < 2; k++) {
            float age = k == 0 ? drift.x : drift.y;
            vec3 q = cameraPlanet + localM - windM * age + driftShift[k] + vec3(9137.0, 4211.0, 15731.0);
            float b = shapeBound(q, halfLength + windChange * age + ${(HIGH_STREAK_LENGTH / 2).toFixed(1)}, ${HIGH_TILE.toFixed(1)});
            bound = max(bound, SHAPE_MEAN + (b - SHAPE_MEAN) * ${STREAK_SPREAD.toFixed(2)});
          }
          highCloud = SHAPE_MEAN + (bound - SHAPE_MEAN) / spreadNorm > coverThreshold(max(colA.highCover, colB.highCover));
        }
      }
      if (!lowCloud && !highCloud) {
        vec3 pm = c + d * (rcm * stretch);
        CloudColumn colM = mixColumn(colA, colB, 0.5);
        float murk = airMurk(colM, length(pm) - a) + rainShaft(colM, pm, D * rcm, length(pm) - a);
        if (murk > 1e-7) {
          float murkT = exp(-murk * (rc1 - r) * stretch);
          light += transmittance * murkLight * (1.0 - murkT);
          transmittance *= murkT;
        }
        d0 = 0.0;
        d0Known = true;
        od0 = vec3(-1.0);
      }
      else {
        if (!d0Known) {
          float unused;
          d0 = columnDensity(colA, D * r, hA, true, r * pixelAngle, unused);
        }
        // (Only high cloud: drawn out along the wind, and with gentler height profiles, so smooth enough for
        // cells HIGH_CELLS times the low cloud's.)
        if (!lowCloud) fine = min(fine * ${HIGH_CELLS.toFixed(1)}, min(coarse, steepest * 4.0));
        float rf = r;
        for (int j = 0; j < ${3 * COARSE + 3}; j++) {
          if (rf >= rc1) break;
          float r1 = min(rf + cellExit(rf, fine, D, safeD), rc1);
          float rm = 0.5 * (rf + r1);
          float dt = (r1 - rf) * stretch;
          vec3 p = c + d * (rm * stretch);
          float h = length(p) - a;
          vec3 local = D * rm;
          float footprint = rm * pixelAngle;
          CloudColumn col = mixColumn(colA, colB, (rm - r) / max(rc1 - r, 1e-3));
          CloudColumn col1 = mixColumn(colA, colB, (r1 - r) / max(rc1 - r, 1e-3));
          float murk = airMurk(col, h) + rainShaft(col, p, local, h);
          if (murk > 1e-7) {
            float murkT = exp(-murk * dt);
            light += transmittance * murkLight * (1.0 - murkT);
            transmittance *= murkT;
          }
          // The density across the fine cell's stretch (Simpson's rule).
          float layer, unused;
          float dm = columnDensity(col, local, h, true, footprint, layer);
          vec3 p1 = c + d * (r1 * stretch);
          float d1 = columnDensity(col1, D * r1, length(p1) - a, true, r1 * pixelAngle, unused);
          float density = (d0 + 4.0 * dm + d1) / 6.0;
          d0 = d1;
          float rf0 = rf;
          rf = r1;
          if (density <= 0.0005) { od0 = vec3(-1.0); continue; }
          float sigma = EXTINCTION * density;
          // Light towards the sun through the cloud, from the cell's stretch's ends (shared with the cells
          // beside it, so the light is continuous from cell to cell; from the middle alone, each cell was lit
          // evenly, and the cells showed as steps), and the light scattered towards the eye.
          // (High cloud alone is too thin to shade itself much: lit as if clear.)
          // The same for the cloud above and below, which the sky's and the ground's light come through.
          vec3 od1 = vec3(0.0);
          if (lowCloud) {
            CloudColumn col0 = mixColumn(colA, colB, (rf0 - r) / max(rc1 - r, 1e-3));
            if (od0.x < 0.0) {
              float h0 = length(c + d * (rf0 * stretch)) - a;
              od0 = vec3(sunwardDepth(col0, c + d * (rf0 * stretch), D * rf0, sunDirS, rf0 * pixelAngle),
                verticalDepth(col0, D * rf0, h0, 1.0, rf0 * pixelAngle), verticalDepth(col0, D * rf0, h0, -1.0, rf0 * pixelAngle));
            }
            float h1 = length(p1) - a;
            od1 = vec3(sunwardDepth(col1, p1, D * r1, sunDirS, r1 * pixelAngle),
              verticalDepth(col1, D * r1, h1, 1.0, r1 * pixelAngle), verticalDepth(col1, D * r1, h1, -1.0, r1 * pixelAngle));
          }
          else od0 = vec3(0.0);
          float scatter = 0.5 * (cloudScatter(od0.x, phase) + cloudScatter(od1.x, phase));
          vec2 ambientShare = 0.5 * (exp(-${AMBIENT_EXTINCTION.toFixed(3)} * od0.yz) + exp(-${AMBIENT_EXTINCTION.toFixed(3)} * od1.yz));
          vec3 ambient = skyAmbient * ambientShare.x + groundAmbient * ambientShare.y;
          od0 = od1;
          // Sunlight scattered many times inside the cloud, which lights even its shaded depths and base:
          // more higher up, nearer the sunlit top. (Sky and ground light: ambient, from above and below.)
          vec3 diffuse = sunlight * 0.05 * mix(0.35, 1.0, layer);
          vec3 sourceLight = sunlight * scatter * 4.0 + ambient + diffuse;
          // Energy-conserving integration across the stretch.
          float stepT = exp(-sigma * dt);
          light += transmittance * sourceLight * (1.0 - stepT);
          depthSum += transmittance * (1.0 - stepT) * rm * stretch;
          depthWeight += transmittance * (1.0 - stepT);
          transmittance *= stepT;
          if (transmittance < 0.01) break;
        }
        d0Known = true;
      }
      r = rc1;
      pA = pB;
      colA = colB;
      if (transmittance < 0.01) break;
    }
    if (transmittance < 0.01) break;
  }
  if (flatShare > 0.0) {
    light = mix(light, flatLight, flatShare);
    transmittance = mix(transmittance, 1.0 - flatOpacity, flatShare);
    depthSum = mix(depthSum, flatOpacity * tFlat, flatShare);
    depthWeight = mix(depthWeight, flatOpacity, flatShare);
  }
  // Haze between the camera and the cloud (by its opacity-weighted distance). The air's light in front of
  // a cloud is the brighter of the sky's (as the sky beside it is drawn, with its exposure: clouds seen
  // against the sky) and the light on the clouds' own scale (ATMO_HAZE_THIN, uncapped: from space, where
  // the sky's exposure falls, clouds seen against the ground). Single scattering alone leaves far clouds
  // tan from space (along a grazing line of sight the air reddens them strongly and adds too little light
  // of its own), so the latter is scaled up for the light scattered more than once (MULTIPLE_SCATTERING,
  // as the sky's light); and for an extended bright surface such as a cloud deck the light scattered out
  // of the line of sight is largely made up by light scattered into it from beside it, so its reddening
  // is half desaturated.
  if (depthWeight > 0.0 && slParams.y > 0.5) {
    float tc = depthSum / depthWeight;
    float at0, at1;
    if (atmoRoots(dot(ds / stretch, ds / stretch), dot(c, d), dot(c, c) - (a + 100000.0) * (a + 100000.0), at0, at1)) {
      vec3 airLight, airTransmittance;
      atmoScatter(c, d, dirWorld, max(at0, 0.0), min(at1, tc), slSun, a, 8, airLight, airTransmittance);
      vec3 cloudTransmittance = mix(airTransmittance, vec3(dot(airTransmittance, vec3(0.2126, 0.7152, 0.0722))), 0.5);
      vec3 inScatter = max((1.0 - exp(-airLight)) * exposure.x, airLight * ATMO_HAZE_THIN * ${MULTIPLE_SCATTERING.toFixed(2)});
      light = light * cloudTransmittance + inScatter * (1.0 - transmittance);
    }
  }
  outClouds = vec4(light, transmittance);
}
`

const compositeFragment = `
uniform sampler2D clouds;
uniform sampler2D shade;
uniform vec2 texel;
uniform float rainTime;        // simulated time (s), for the streaks
uniform float aspect;
varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Rain streaks across the view: short, faint, slightly slanted lines falling through the frame, in two
// layers (near, faster and longer; far, slower), more of them the harder it rains.
float streaks(vec2 uv, float rain) {
  float sum = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 40.0 : 90.0;
    float speed = layer == 0 ? 2.6 : 1.4;
    vec2 p = vec2(uv.x * aspect + uv.y * 0.08, uv.y + rainTime * speed) * vec2(scale, scale * 0.25);
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float h = hash12(cell + float(layer) * 37.0);
    float present = step(h, clamp(rain / 50.0, 0.02, 0.3));
    float x = fract(h * 13.7);
    float line = smoothstep(0.06, 0.0, abs(f.x - x)) * smoothstep(0.0, 0.3, f.y) * smoothstep(1.0, 0.6, f.y);
    sum += present * line * (layer == 0 ? 0.25 : 0.12);
  }
  return sum;
}

void main() {
  // A small tent filter over the half-resolution clouds (softens their upscaling).
  vec4 c = 0.4 * texture2D(clouds, vUv)
    + 0.15 * (texture2D(clouds, vUv + vec2(texel.x, 0.0)) + texture2D(clouds, vUv - vec2(texel.x, 0.0))
            + texture2D(clouds, vUv + vec2(0.0, texel.y)) + texture2D(clouds, vUv - vec2(0.0, texel.y)));
  float opacity = 1.0 - c.a;
  // Premultiplied, linear: unpremultiply to encode for the (sRGB) canvas, then premultiply again.
  vec3 color = opacity > 1e-4 ? c.rgb / opacity : vec3(0.0);
  vec3 encoded = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)) * opacity;
  // The scene's dimming by the clouds (linear: as a factor on the sRGB canvas, its gamma root).
  float dim = pow(clamp(texture2D(shade, vUv).r, 0.0, 1.0), 1.0 / 2.2);
  float rain = texture2D(shade, vec2(0.5)).g;
  if (rain > 0.05) encoded += vec3(0.3) * streaks(vUv, rain);
  gl_FragColor = vec4(encoded, c.a * dim);
}
`

const _offset = new THREE.Vector3()
const _cameraPlanet = new THREE.Vector3()
const _m4 = new THREE.Matrix4()
const _far = new THREE.Color(1e9, 0, 0)

export class Clouds {
  // planet: Planet (its atmosphere uniforms are updated each frame); planetCoordSys: the planet's frame.
  constructor(planet, planetCoordSys) {
    this.planet = planet
    this.planetCoordSys = planetCoordSys
    // Drawing-buffer pixels per output pixel across (the supersampling factor while recording): the
    // clouds' detail is filtered to the output pixel, so a supersampled frame looks like an ordinary one.
    this.pixelScale = 1
    this.weatherMap = new WeatherMap()
    this.realClouds = new RealClouds()
    this.enabled = true
    const noise = cloudNoiseTextures()
    const targetOptions = { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    this.distanceTarget = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
    this.cloudTarget = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, type: THREE.HalfFloatType, depthBuffer: false, count: 2 })
    this.uniforms = {
      ...SunAndSkyLight.uniforms,
      distanceMap: { value: this.distanceTarget.texture },
      weatherA: { value: this.weatherMap.textures[0] },
      weatherB: { value: this.weatherMap.textures[1] },
      weatherC: { value: this.weatherMap.textures[2] },
      shapeNoise: { value: noise.shape },
      detailNoise: { value: noise.detail },
      occupancy: { value: noise.occupancy },
      inverseProjection: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() },
      worldToPlanet: { value: new THREE.Matrix3() },
      shapeOffset: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      macroOffset: { value: new THREE.Vector3() },
      cameraPlanet: { value: new THREE.Vector3() },
      cameraGrid: { value: new THREE.Vector3() },
      driftShift: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      realClouds: { value: null },
      realBlend: { value: 0 },
      realTexel: { value: 4000 },
      detailOffset: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      drift: { value: new THREE.Vector3() },
      exposure: { value: new THREE.Vector2(1, Math.PI) },
      pixelAngle: { value: 0.001 },
    }
    const quad = (material) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      return new THREE.Scene().add(mesh)
    }
    this.marchScene = quad(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: fullscreenVertex, fragmentShader: marchFragment(noise.shapeStats), glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false }))
    this.compositeScene = quad(new THREE.ShaderMaterial({
      uniforms: { clouds: { value: this.cloudTarget.textures[0] }, shade: { value: this.cloudTarget.textures[1] }, texel: { value: new THREE.Vector2() }, rainTime: { value: 0 }, aspect: { value: 1 } },
      vertexShader: fullscreenVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }))
    this.quadCamera = new THREE.Camera()
  }

  /**
   * Weather for the date (day of year, UTC hours) and drift for the simulated time t (s). Called each
   * frame before render.
   */
  update(renderer, dayOfYear, utcHours, t) {
    // (The weather map also gives the sea its roughness, with or without the clouds.)
    this.weatherMap.update(renderer, dayOfYear, utcHours)
    if (!this.enabled) return
    this.realClouds.setDayOfYear(dayOfYear + utcHours / 24)
    // The real clouds' snapshot (10240 x 5120) takes ~0.1 s to upload: do it as soon as it has loaded,
    // rather than on the first frame with clouds (e.g. on coming up out of the sea).
    if (this.realClouds.ready && this._uploaded !== this.realClouds.texture) {
      renderer.initTexture(this.realClouds.texture)
      this._uploaded = this.realClouds.texture
    }
    this.time = t
  }

  // Compiles the passes' shaders in the background (see precompile.js), so that the first frame with
  // clouds (e.g. on coming up out of the sea) does not wait for them: the march, the composite, and the
  // distance pass's variants for the objects in `scene` (new ones only).
  compileAsync(renderer, scene, camera) {
    if (!this.enabled) return Promise.resolve()
    const compiled = []
    // Each for the target it is drawn into (three.js compiles for the current target's colour space),
    // and the distance pass with the scene's lights but no fog, as it is drawn.
    const previousTarget = renderer.getRenderTarget()
    const standIns = standInScene(scene, { material: distanceMaterial, seen: (this._compiled ??= new Set()) })
    if (standIns) {
      const fog = scene.fog
      scene.fog = null
      renderer.setRenderTarget(this.distanceTarget)
      compiled.push(renderer.compileAsync(standIns, camera, scene))
      scene.fog = fog
    }
    if (!this._compiledPasses) {
      this._compiledPasses = true
      renderer.setRenderTarget(this.cloudTarget)
      compiled.push(renderer.compileAsync(this.marchScene, this.quadCamera))
      renderer.setRenderTarget(previousTarget)
      compiled.push(renderer.compileAsync(this.compositeScene, this.quadCamera))
    }
    renderer.setRenderTarget(previousTarget)
    return Promise.all(compiled)
  }

  // Draws the clouds over what `renderer` has drawn of `scene` from `camera`.
  render(renderer, scene, camera, sunIntensity, skyExposure) {
    if (!this.enabled) return
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    this.planetCoordSys.updateWorldMatrix(true, false)
    camera.getWorldPosition(_cameraPlanet)
    this.planetCoordSys.worldToLocal(_cameraPlanet)
    const resolution = RESOLUTION
    const w = Math.max(1, Math.round(size.x * resolution)), h = Math.max(1, Math.round(size.y * resolution))
    if (this.distanceTarget.width !== w || this.distanceTarget.height !== h) {
      this.distanceTarget.setSize(w, h)
      this.cloudTarget.setSize(w, h)
      // (No smoothing at full resolution.)
      this.compositeScene.children[0].material.uniforms.texel.value.set(resolution < 1 ? 1 / w : 0, resolution < 1 ? 1 / h : 0)
      this.compositeScene.children[0].material.uniforms.aspect.value = w / h
    }
    const u = this.uniforms
    // Planet axes (the camera's planet position, float64, is above: for the noise offsets).
    u.worldToPlanet.value.setFromMatrix4(_m4.copy(this.planetCoordSys.matrixWorld).invert())
    const t = this.time ?? 0
    const phase = t / DRIFT_PERIOD
    const ages = [((phase % 1) + 1) % 1, (((phase + 0.5) % 1) + 1) % 1]
    u.drift.value.set(ages[0] * DRIFT_PERIOD, ages[1] * DRIFT_PERIOD, Math.abs(2 * ages[0] - 1))
    // Each copy restarts from a different place in the tile (so a restart does not repeat it).
    ages.forEach((age, i) => {
      const cycle = Math.floor(phase + (i ? 0.5 : 0))
      const shift = cycle * 7919.37 + i * 3571.1
      // (Wrapped at the high cloud's tile, a whole number of its fibres' tiles, so the noise is the same.)
      const wrap = (v) => ((v % HIGH_TILE) + HIGH_TILE) % HIGH_TILE
      u.driftShift.value[i].set(wrap(shift), wrap(shift * 0.61), wrap(shift * 1.37))
      for (const [target, tile] of [[u.shapeOffset.value[i], SHAPE_TILE], [u.detailOffset.value[i], DETAIL_TILE]]) {
        _offset.set(_cameraPlanet.x + shift, _cameraPlanet.y + shift * 0.61, _cameraPlanet.z + shift * 1.37)
        target.set(((_offset.x % tile) + tile) % tile, ((_offset.y % tile) + tile) % tile, ((_offset.z % tile) + tile) % tile)
      }
    })
    u.cameraPlanet.value.copy(_cameraPlanet)
    u.cameraGrid.value.set(...['x', 'y', 'z'].map(k => ((_cameraPlanet[k] % CELL_MAX) + CELL_MAX) % CELL_MAX))
    const mt = MACRO_TILE
    u.macroOffset.value.set(((_cameraPlanet.x % mt) + mt) % mt, ((_cameraPlanet.y % mt) + mt) % mt, ((_cameraPlanet.z % mt) + mt) % mt)
    u.inverseProjection.value.copy(camera.projectionMatrixInverse)
    u.cameraWorld.value.copy(camera.matrixWorld)
    u.exposure.value.set(skyExposure, sunIntensity)
    this.compositeScene.children[0].material.uniforms.rainTime.value = t % 1000
    u.pixelAngle.value = 2 / (camera.projectionMatrix.elements[5] * h) * this.pixelScale
    u.realClouds.value = this.realClouds.texture
    u.realTexel.value = 2 * Math.PI * 6378137 / (this.realClouds.texture.image?.width ?? 10240)
    u.realBlend.value = this.realClouds.ready ? 1 : 0

    const previousTarget = renderer.getRenderTarget()
    const previousClear = renderer.getClearColor(new THREE.Color()), previousAlpha = renderer.getClearAlpha()
    const atmosphere = this.planet.atmosphere, atmosphereVisible = atmosphere.visible
    // 1. Distance.
    atmosphere.visible = false
    const override = scene.overrideMaterial, background = scene.background, fog = scene.fog
    scene.overrideMaterial = distanceMaterial
    scene.background = null
    scene.fog = null
    renderer.setRenderTarget(this.distanceTarget)
    renderer.setClearColor(_far, 1) // (a float target: nothing drawn is "far")
    renderer.clear()
    renderer.render(scene, camera)
    scene.overrideMaterial = override
    scene.background = background
    scene.fog = fog
    atmosphere.visible = atmosphereVisible
    // 2. Clouds.
    renderer.setRenderTarget(this.cloudTarget)
    renderer.render(this.marchScene, this.quadCamera)
    // 3. Composite.
    renderer.setRenderTarget(previousTarget)
    renderer.setClearColor(previousClear, previousAlpha)
    renderer.render(this.compositeScene, this.quadCamera)
  }

  dispose() {
    this.weatherMap.dispose()
    this.distanceTarget.dispose()
    this.cloudTarget.dispose()
  }
}
