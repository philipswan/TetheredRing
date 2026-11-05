import * as THREE from 'three'

// The sky as seen from sea level, worked out once into a table (the air is the same all round the planet, so
// the light from a direction depends only on how high the sun is, how high the direction is above the
// horizon, and the azimuth between them): what the sea reflects (seaWaves.js seaSkyReflection), read from
// it by the lighter qualities (SEA_LITE) rather than marched through the air at every pixel of the sea.
//   x: the direction's height above the horizon, sin(elevation) = (x / (VIEW - 1))^2 (closer together low
//      down, where the sky changes fastest)
//   y: SUN slices of AZIMUTH rows: the sun's sin(elevation) from SUN_MIN to 1, and the azimuth from the
//      sun from 0 to pi
// Its light is the scattered light before the sky's exposure curve (atmoScatter's), at the ground's aerosol
// (the haze model the sea is drawn with), with TABLE_SAMPLES samples.
export const SEA_SKY_SIZE = { VIEW: 32, AZIMUTH: 16, SUN: 32 }
export const SEA_SKY_SUN_MIN = -0.25
const TABLE_SAMPLES = 16

// GLSL (with <atmosphere_common> and PI): the table's light for a direction at sin(elevation) muV, the sun at
// muS, and the cosine of the azimuth between them cosAz.
export const seaSkyTableGlsl = `
uniform sampler2D seaSkyTable;
vec3 seaSkyTableLight(float muV, float muS, float cosAz) {
  const float V = ${SEA_SKY_SIZE.VIEW.toFixed(1)}, A = ${SEA_SKY_SIZE.AZIMUTH.toFixed(1)}, S = ${SEA_SKY_SIZE.SUN.toFixed(1)};
  float u = (sqrt(clamp(muV, 0.0, 1.0)) * (V - 1.0) + 0.5) / V;
  float sunF = clamp((muS - ${SEA_SKY_SUN_MIN.toFixed(2)}) / ${(1 - SEA_SKY_SUN_MIN).toFixed(2)}, 0.0, 1.0) * (S - 1.0);
  float s0 = min(floor(sunF), S - 2.0);
  float az = acos(clamp(cosAz, -1.0, 1.0)) / PI * (A - 1.0) + 0.5;
  vec3 a = texture(seaSkyTable, vec2(u, (s0 * A + az) / (A * S))).rgb;
  vec3 b = texture(seaSkyTable, vec2(u, ((s0 + 1.0) * A + az) / (A * S))).rgb;
  return mix(a, b, sunF - s0);
}
`

const fragment = `
#include <common>
#include <atmosphere_common>
uniform float ground;
varying vec2 vUv;
void main() {
  const float V = ${SEA_SKY_SIZE.VIEW.toFixed(1)}, A = ${SEA_SKY_SIZE.AZIMUTH.toFixed(1)}, S = ${SEA_SKY_SIZE.SUN.toFixed(1)};
  float iv = floor(vUv.x * V), row = floor(vUv.y * A * S);
  float is = floor(row / A), ia = row - is * A;
  float muV = max(pow(iv / (V - 1.0), 2.0), 0.02);  // (as seaSkyReflection: never below the horizon)
  float muS = ${SEA_SKY_SUN_MIN.toFixed(2)} + is / (S - 1.0) * ${(1 - SEA_SKY_SUN_MIN).toFixed(2)};
  float az = ia / (A - 1.0) * PI;
  float sinV = sqrt(1.0 - muV * muV);
  vec3 d = vec3(sinV * cos(az), muV, sinV * sin(az));
  vec3 sun = vec3(sqrt(1.0 - muS * muS), muS, 0.0);
  vec3 p = vec3(0.0, ground, 0.0);
  float top = ground + 100000.0;
  float t0, t1;
  vec3 light = vec3(0.0), transmittance;
  if (atmoRoots(1.0, dot(p, d), dot(p, p) - top * top, t0, t1)) atmoScatter(p, d, d, max(t0, 0.0), t1, sun, ground, ${TABLE_SAMPLES}, light, transmittance);
  gl_FragColor = vec4(light, 1.0);
}
`

export class SeaSkyTable {
  constructor() {
    const { VIEW, AZIMUTH, SUN } = SEA_SKY_SIZE
    this.target = new THREE.WebGLRenderTarget(VIEW, AZIMUTH * SUN, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    })
    this.material = new THREE.ShaderMaterial({
      uniforms: { ground: { value: 6378137 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: fragment, depthTest: false, depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    mesh.frustumCulled = false
    this.scene = new THREE.Scene().add(mesh)
    this.camera = new THREE.Camera()
    this.ground = null
  }

  get texture() { return this.target.texture }

  // Works the table out for a planet of radius ground (m), once (again only if the radius changes).
  update(renderer, ground) {
    if (ground === this.ground) return
    this.ground = ground
    this.material.uniforms.ground.value = ground
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(previous)
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
  }
}
