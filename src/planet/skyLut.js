import * as THREE from 'three'

// The sky as seen from the camera, worked out once a frame into a small table (a "sky-view" table:
// Hillaire 2020) rather than marched through the air at every pixel of the sky: the light the air scatters
// towards the camera along each line of sight, and the air's transmittance along it, by the same model
// (atmosphereCommon.glsl's atmoScatter) with the same samples. The sky (atmosphere.frag.glsl, SKY_LUT)
// then reads it. On a small GPU the sky's per-pixel march was a large part of the frame.
//
// Its lines of sight are by their azimuth from the sun (0 to 180 degrees: the sky is the same either
// side of the sun's vertical plane) across, and up, their elevation from the horizon as seen from the
// camera's height, closer together towards the horizon (squared), where the sky changes fastest: the top half
// of the table is the sky above the horizon (from space, only up to the top of the air's thin band at the
// limb), the bottom half the air in front of the ground.

export const SKY_LUT_SIZE = [256, 192]

// GLSL (with <atmosphere_common> and PI): the table's coordinates for a line of sight d (its stretched
// direction, unit: in the stretched frame the planet is a sphere, so its horizon and limb are the same all
// round) from the camera at c (stretched, planet centre at the origin), with the sun's direction sun, the
// ground's radius a and the air's top's; and the line of sight at the table's coordinates uv.
export const skyLutGlsl = `
void skyLutFrame(vec3 c, vec3 sun, out vec3 up, out vec3 toSun, out vec3 across) {
  up = normalize(c);
  toSun = sun - dot(sun, up) * up;
  toSun = dot(toSun, toSun) > 1e-8 ? normalize(toSun) : normalize(cross(up, abs(up.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)));
  across = cross(up, toSun);
}

// The elevation (radians) of the horizon from the camera: 0 at the ground, falling with height.
float skyLutHorizon(vec3 c, float a) {
  return -acos(clamp(a / max(length(c), a), 0.0, 1.0));
}

// The highest elevation (radians) at which there is air: straight up from inside the air; from above it,
// the top of the air's thin band at the limb (so the table's rows are spent on that band, not on space).
float skyLutTop(vec3 c, float top) {
  float r = length(c);
  return r <= top ? 0.5 * PI : -acos(clamp(top / r, 0.0, 1.0));
}

vec2 skyLutUv(vec3 d, vec3 c, vec3 sun, float a, float top) {
  vec3 up, toSun, across;
  skyLutFrame(c, sun, up, toSun, across);
  float azimuth = atan(abs(dot(d, across)), dot(d, toSun));
  float horizon = skyLutHorizon(c, a);
  float elevation = asin(clamp(dot(d, up), -1.0, 1.0)) - horizon;
  float v = elevation >= 0.0 ? 0.5 + 0.5 * sqrt(min(elevation / (skyLutTop(c, top) - horizon), 1.0)) : 0.5 - 0.5 * sqrt(-elevation / (0.5 * PI + horizon));
  return vec2(azimuth / PI, v);
}

vec3 skyLutDirection(vec2 uv, vec3 c, vec3 sun, float a, float top) {
  vec3 up, toSun, across;
  skyLutFrame(c, sun, up, toSun, across);
  float horizon = skyLutHorizon(c, a);
  float s = 2.0 * (uv.y - 0.5);
  float elevation = horizon + (s >= 0.0 ? s * s * (skyLutTop(c, top) - horizon) : -s * s * (0.5 * PI + horizon));
  float azimuth = uv.x * PI;
  return cos(elevation) * (cos(azimuth) * toSun + sin(azimuth) * across) + sin(elevation) * up;
}
`

const lutFragment = `
#define ATMO_SKY_AEROSOL
#include <common>
#include <atmosphere_common>
uniform vec4 atmoCamera;
uniform vec4 atmoPole;
uniform vec4 atmoParams;
uniform vec3 atmoSun;
varying vec2 vUv;
layout(location = 0) out vec4 outLight;          // rgb: the scattered light; a: the transmittance's luminance
layout(location = 1) out vec4 outTransmittance;  // rgb: the transmittance
const int VIEW_SAMPLES = 16;
${skyLutGlsl}
void main() {
  // (Texel centres: the same lines of sight the sky reads between.)
  vec3 c = atmoCamera.xyz;
  float a = atmoParams.z;
  // (The table's directions are stretched ones, in which the planet is a sphere: back to the true direction
  // for the light's phase.)
  vec3 dsUnit = skyLutDirection(vUv, c, atmoSun, a, atmoParams.w);
  vec3 d = normalize(dsUnit - atmoPole.w / (1.0 + atmoPole.w) * dot(dsUnit, atmoPole.xyz) * atmoPole.xyz);
  vec3 ds = d + atmoPole.w * dot(d, atmoPole.xyz) * atmoPole.xyz;
  float A = dot(ds, ds), B = dot(c, ds);
  float t0, t1;
  vec3 light = vec3(0.0), transmittance = vec3(1.0);
  if (atmoRoots(A, B, atmoCamera.w, t0, t1)) {
    t0 = max(t0, 0.0);
    float g0, g1;
    if (atmoParams.x > 0.0 && B < 0.0 && atmoRoots(A, B, atmoParams.x, g0, g1)) t1 = max(g0, t0);
    if (t1 > t0) atmoScatter(c, ds, d, t0, t1, atmoSun, a, VIEW_SAMPLES, light, transmittance);
  }
  outLight = vec4(light, dot(transmittance, vec3(0.2126, 0.7152, 0.0722)));
  outTransmittance = vec4(transmittance, 1.0);
}
`

const lutVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export class SkyLut {
  // uniforms: the planet's atmosphere uniforms (Planet.atmosphereUniforms), updated each frame before update().
  constructor(uniforms) {
    this.target = new THREE.WebGLRenderTarget(SKY_LUT_SIZE[0], SKY_LUT_SIZE[1], {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, count: 2,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms, vertexShader: lutVertex, fragmentShader: lutFragment, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    }))
    mesh.frustumCulled = false
    this.scene = new THREE.Scene().add(mesh)
    this.camera = new THREE.Camera()
  }

  get light() { return this.target.textures[0] }
  get transmittance() { return this.target.textures[1] }

  update(renderer) {
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
