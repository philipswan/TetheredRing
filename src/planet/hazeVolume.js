import * as THREE from 'three'
import { skyLutGlsl } from './skyLut.js'

// The haze in front of the ground from above (aerialPerspective.js), worked out once a frame into a small
// table rather than marched at every pixel of the ground: for lines of sight from the camera down to the
// ground (the sky table's below its horizon, skyLut.js: by their azimuth from the sun and their elevation),
// and for each, the air between the camera and where the line of sight comes down to each of HEIGHTS heights
// (closer together near the ground, where the air is thick: the slice s at top (s / (HEIGHTS - 1))^2). The
// ground, the sea and what stands on them are then hazed by where along their line of sight they are, not as
// if at sea level (a table of lines of sight to sea level hazed mountains as if they were at its foot).
//
// Its texels keep what atmoScatter sums along the line of sight, before the light's phase and the sun's
// intensity: the air scattering (Rayleigh, Mie) towards the camera, attenuated, and the air passed through
// (the view depths). So the phase is worked out at each pixel for its own direction (the glow around the sun
// is as sharp as marched), and the transmittance from the view depths. In kilometres (HAZE_VOLUME_SCALE), to
// keep within half floats.
//
// The table is a 2D atlas: AZIMUTH across, and HEIGHTS slices of ELEVATION rows up.

export const HAZE_VOLUME_SIZE = { AZIMUTH: 128, ELEVATION: 64, HEIGHTS: 16 }
const VOLUME_SAMPLES = 12
const SCALE = 1e-3

// GLSL (with <atmosphere_common>, PI and skyLutGlsl): the haze along the line of sight from the camera c
// (stretched) in stretched direction ds (true direction d) to tEnd, for the ground's radius a and the air's
// top's; false where the table does not have it (a line of sight above the horizon, which the caller marches).
export const hazeVolumeGlsl = `
uniform sampler2D apVolume0;   // the Rayleigh scattering's sum (rgb) and view depth (a), in km
uniform sampler2D apVolume1;   // the Mie scattering's sum (rgb) and view depth (a), in km
uniform float apVolumeTop;     // the height of the highest slice (m)
bool hazeVolume(vec3 c, vec3 ds, vec3 d, float tEnd, vec3 sun, float a, float top, out vec3 light, out vec3 transmittance) {
  const float EL = ${HAZE_VOLUME_SIZE.ELEVATION.toFixed(1)}, HS = ${HAZE_VOLUME_SIZE.HEIGHTS.toFixed(1)};
  vec2 uv = skyLutUv(normalize(ds), c, sun, a, top);
  if (uv.y > 0.5 - 0.5 / EL) return false;
  float h = length(c + ds * tEnd) - a;
  float z = sqrt(clamp(h / apVolumeTop, 0.0, 1.0)) * (HS - 1.0);
  float s0 = min(floor(z), HS - 2.0);
  float row = clamp(uv.y * 2.0 * EL, 0.5, EL - 0.5);
  vec2 uv0 = vec2(uv.x, (s0 * EL + row) / (EL * HS)), uv1 = vec2(uv.x, ((s0 + 1.0) * EL + row) / (EL * HS));
  vec4 r = mix(texture(apVolume0, uv0), texture(apVolume0, uv1), z - s0) * ${(1 / SCALE).toFixed(1)};
  vec4 m = mix(texture(apVolume1, uv0), texture(apVolume1, uv1), z - s0) * ${(1 / SCALE).toFixed(1)};
  float sunCos = dot(d, sun);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + sunCos * sunCos);
  float g2 = ATMO_MIE_G * ATMO_MIE_G;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + sunCos * sunCos)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * ATMO_MIE_G * sunCos, 1.5));
  light = ATMO_SUN_INTENSITY * (r.rgb * ATMO_BETA_R * phaseR + ATMO_BETA_M * (m.rgb * phaseM + m.g * ATMO_MIE_MULTIPLE * ATMO_MIE_MULTIPLE_TINT));
  transmittance = exp(-(ATMO_BETA_R * r.a + ATMO_BETA_M * 1.1 * m.a));
  return true;
}
`

const volumeFragment = `
#include <common>
#include <atmosphere_common>
uniform vec4 atmoCamera;
uniform vec4 atmoPole;
uniform vec4 atmoParams;
uniform vec3 atmoSun;
uniform float volumeTop;
layout(location = 0) out vec4 outRayleigh;
layout(location = 1) out vec4 outMie;
${skyLutGlsl}
// atmoScatter's sums along the line of sight (before the phase and the sun's intensity), with the same
// samples: the Rayleigh and Mie scattering towards the camera, attenuated, and the view depths.
void atmoSums(vec3 camera, vec3 ds, float t0, float t1, vec3 sun, float ground, int samples, out vec3 sumR, out vec3 sumM, out vec2 viewDepth) {
  float segment = (t1 - t0) / float(samples);
  viewDepth = vec2(0.0);
  sumR = vec3(0.0);
  sumM = vec3(0.0);
  for (int i = 0; i < 64; i++) {
    if (i >= samples) break;
    vec3 p = camera + ds * (t0 + (float(i) + 0.5) * segment);
    float h = max(length(p) - ground, 0.0);
    vec2 density = exp(-h / vec2(ATMO_HEIGHT_R, ATMO_HEIGHT_M)) * segment;
    vec3 tau = ATMO_BETA_R * density.x + ATMO_BETA_M * 1.1 * density.y;
    vec3 within = mix(1.0 - 0.5 * tau, (1.0 - exp(-tau)) / max(tau, vec3(1e-4)), step(vec3(1e-4), tau));
    vec2 sunDepth = atmoSunDepth(p, sun, ground);
    vec3 attenuation = exp(-(ATMO_BETA_R * (viewDepth.x + sunDepth.x) + ATMO_BETA_M * 1.1 * (viewDepth.y + sunDepth.y))) * within;
    viewDepth += density;
    sumR += density.x * attenuation;
    sumM += density.y * attenuation;
  }
}
void main() {
  const float EL = ${HAZE_VOLUME_SIZE.ELEVATION.toFixed(1)}, HS = ${HAZE_VOLUME_SIZE.HEIGHTS.toFixed(1)}, AZ = ${HAZE_VOLUME_SIZE.AZIMUTH.toFixed(1)};
  vec2 p = floor(gl_FragCoord.xy);
  float s = floor(p.y / EL), j = p.y - s * EL;
  // (The sky table's lines of sight below its horizon, at its texel centres there.)
  vec2 uv = vec2((p.x + 0.5) / AZ, (j + 0.5) / (2.0 * EL));
  vec3 c = atmoCamera.xyz;
  float a = atmoParams.z;
  vec3 dsUnit = skyLutDirection(uv, c, atmoSun, a, atmoParams.w);
  vec3 d = normalize(dsUnit - atmoPole.w / (1.0 + atmoPole.w) * dot(dsUnit, atmoPole.xyz) * atmoPole.xyz);
  vec3 ds = d + atmoPole.w * dot(d, atmoPole.xyz) * atmoPole.xyz;
  float A = dot(ds, ds), B = dot(c, ds);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  vec2 viewDepth = vec2(0.0);
  float t0, t1;
  if (atmoRoots(A, B, atmoCamera.w, t0, t1)) {
    t0 = max(t0, 0.0);
    // (To where the line of sight comes down to this slice's height.)
    float r = a + volumeTop * (s / (HS - 1.0)) * (s / (HS - 1.0));
    float g0, g1;
    if (atmoRoots(A, B, dot(c, c) - r * r, g0, g1)) t1 = max(g0, t0);
    if (t1 > t0) atmoSums(c, ds, t0, t1, atmoSun, a, ${VOLUME_SAMPLES}, sumR, sumM, viewDepth);
  }
  outRayleigh = vec4(sumR, viewDepth.x) * ${SCALE.toExponential(1)};
  outMie = vec4(sumM, viewDepth.y) * ${SCALE.toExponential(1)};
}
`

const vertex = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export class HazeVolume {
  // uniforms: the planet's atmosphere uniforms (Planet.atmosphereUniforms), updated each frame before update().
  // top: the uniform for the highest slice's height, which the materials that read the table share.
  constructor(uniforms, top = { value: 100000 }) {
    const { AZIMUTH, ELEVATION, HEIGHTS } = HAZE_VOLUME_SIZE
    this.target = new THREE.WebGLRenderTarget(AZIMUTH, ELEVATION * HEIGHTS, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, count: 2,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    })
    this.top = top
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { ...uniforms, volumeTop: this.top }, vertexShader: vertex, fragmentShader: volumeFragment,
      glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    }))
    mesh.frustumCulled = false
    this.scene = new THREE.Scene().add(mesh)
    this.camera = new THREE.Camera()
  }

  get rayleigh() { return this.target.textures[0] }
  get mie() { return this.target.textures[1] }

  // height: the camera's (m) over the ground's sphere; atmosphereHeight: the air's top over it (m).
  update(renderer, height, atmosphereHeight) {
    this.top.value = Math.max(Math.min(height, atmosphereHeight), 1)
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(previous)
  }

  dispose() {
    this.target.dispose()
    this.scene.children[0].material.dispose()
  }
}
