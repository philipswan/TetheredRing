import * as THREE from 'three'
import atmosphereCommon from '../shaders/atmosphereCommon.glsl?raw'
import './seaDarkening.js' // its fog code first: see below
import { SKY_LUT_SIZE, skyLutGlsl } from './skyLut.js'

// Aerial perspective: everything seen through the air (terrain, sea, the ring, vehicles) is dimmed by
// the air's transmittance along the line of sight and has the light the air scatters into it added,
// by the same model as the sky (atmosphereCommon.glsl), so distant mountains turn blue, the ground
// near the limb fades into the sky instead of meeting it at a hard edge, and from space the planet is
// seen through a thin blue veil.
//
// The line of sight from the camera to the fragment is clipped to the atmosphere shell and marched
// with a few samples. Things under the sea are hazed only as far as the line of sight's entry into the
// water (seaDarkening.js's vSeaPath, worked out per vertex): beyond it there is no air, and counting it
// as air at sea-level density would make the deep sea floor hazier than the shallows, so seamounts
// that stay well under the surface would show through the haze. Like seaDarkening.js it is added to three.js's fog chunks, which every built-in
// material includes when the scene has fog (App keeps a zero-density fog on the scene while the haze
// is on), with plain-object uniforms shared by every material's copy of the library uniforms. It is
// applied after the sea's darkening (this module is imported after seaDarkening.js), since the water
// is behind the air; and in linear colour, converting from and back to the sRGB output that the fog
// chunk sees.
//
// Its uniforms are named ap* rather than atmo*, so they cannot clash with a ShaderMaterial that has
// its own atmo* uniforms and also includes the fog chunks (structureLine).
THREE.ShaderChunk.atmosphere_common = atmosphereCommon

const SAMPLES = 8

const camera = { x: 0, y: 0, z: 0, w: 0 }   // xyz: stretched camera (planet centre at the origin, world axes); w: |C'|^2 - top^2
const pole = { x: 0, y: 1, z: 0, w: 0 }     // xyz: polar axis (world); w: a/b - 1
const params = { x: 1, y: 0, z: 1, w: SAMPLES } // x: exposure (see Planet.js); y: active; z: a (m); w: samples
const sun = { x: 0, y: 1, z: 0 }            // direction to the sun (world)
// The haze in front of the ground as a table of lines of sight from the camera (skyLut.js, with the ground's
// aerosol; Planet.setGroundHazeLut), read from above LOW_SAMPLES_HEIGHT instead of marching (params.w < 0:
// -SAMPLES, the samples for the materials that do not read it), by the materials that define AP_HAZE_LUT and
// share these uniforms (apHazeUniforms: the planet's terrain and sea, which add them as they compile; three.js
// cannot give a render target's texture to every material by its libraries' uniforms, which it clones).
const hazeLight = { value: null }
const hazeTransmittance = { value: null }
export const apHazeUniforms = { apHazeLight: hazeLight, apHazeTransmittance: hazeTransmittance }

const LIBRARIES = ['basic', 'lambert', 'phong', 'standard', 'physical', 'toon', 'matcap', 'points', 'sprite']
for (const name of LIBRARIES) {
  Object.assign(THREE.ShaderLib[name].uniforms, {
    apCamera: { value: camera },
    apPole: { value: pole },
    apParams: { value: params },
    apSun: { value: sun },
  })
}

THREE.ShaderChunk.fog_pars_vertex += `
#ifdef USE_FOG
  varying vec3 vApOffset;
#endif
`
// Camera-to-vertex offset in world axes (interpolates exactly across a triangle).
THREE.ShaderChunk.fog_vertex += `
#ifdef USE_FOG
  vApOffset = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`
THREE.ShaderChunk.fog_pars_fragment += `
#ifdef USE_FOG
  uniform vec4 apCamera;
  uniform vec4 apPole;
  uniform vec4 apParams;
  uniform vec3 apSun;
  varying vec3 vApOffset;
  #include <atmosphere_common>
  #ifdef AP_HAZE_LUT
    uniform sampler2D apHazeLight;
    uniform sampler2D apHazeTransmittance;
    ${skyLutGlsl}
  #endif
#endif
`
THREE.ShaderChunk.fog_fragment += `
#ifdef USE_FOG
  if (apParams.y > 0.5) {
    float apDistance = length(vApOffset);
    vec3 apDir = vApOffset / max(apDistance, 1e-6);
    vec3 apDirStretched = apDir + apPole.w * dot(apDir, apPole.xyz) * apPole.xyz;
    float apT0, apT1;
    if (atmoRoots(dot(apDirStretched, apDirStretched), dot(apCamera.xyz, apDirStretched), apCamera.w, apT0, apT1)) {
      apT0 = max(apT0, 0.0);
      apT1 = min(apT1, apDistance - vSeaPath);
      if (apT1 > apT0) {
        vec3 apLight, apTransmittance;
#ifdef AP_HAZE_LUT
        if (apParams.w < 0.0) {
          // (From the table: the line of sight to sea level, its lower half.)
          float apTop = sqrt(max(dot(apCamera.xyz, apCamera.xyz) - apCamera.w, 0.0));
          vec2 apUv = skyLutUv(normalize(apDirStretched), apCamera.xyz, apSun, apParams.z, apTop);
          apUv.y = min(apUv.y, 0.5 - 0.5 / ${SKY_LUT_SIZE[1].toFixed(1)});
          apLight = texture2D(apHazeLight, apUv).rgb;
          apTransmittance = texture2D(apHazeTransmittance, apUv).rgb;
        }
        else
#endif
        atmoScatter(apCamera.xyz, apDirStretched, apDir, apT0, apT1, apSun, apParams.z, int(abs(apParams.w)), apLight, apTransmittance);
        apLight *= atmoHazeScale(apTransmittance, apParams.x);
        vec3 apColor = sRGBTransferEOTF(vec4(gl_FragColor.rgb, 1.0)).rgb * apTransmittance + (1.0 - exp(-apLight));
        gl_FragColor.rgb = sRGBTransferOETF(vec4(apColor, 1.0)).rgb;
      }
    }
  }
#endif
`

// The lighter graphics qualities' samples (setLowSamples) serve below LOW_SAMPLES_HEIGHT (m): there the
// lines of sight cross little enough air that they look the same as SAMPLES (by tools/perceptual_diff.py up
// to 13 km); from higher, and from space, where they cross the whole of it, they did not.
const LOW_SAMPLES_HEIGHT = 12000
let lowSamples = SAMPLES

export const AerialPerspective = {
  // The samples along each line of sight below LOW_SAMPLES_HEIGHT (SAMPLES, or fewer for the lighter
  // graphics qualities).
  setLowSamples(n) {
    lowSamples = n
  },

  // The table of the haze in front of the ground (Planet.setGroundHazeLut), read from above
  // LOW_SAMPLES_HEIGHT when set; null: marched.
  setHazeLut(lut) {
    hazeLight.value = lut?.light ?? null
    hazeTransmittance.value = lut?.transmittance ?? null
  },

  // active: the air hazes what is seen through it. atmosphereUniforms: the planet's (Planet.atmosphereUniforms,
  // already updated for this frame).
  update(active, atmosphereUniforms) {
    params.y = active ? 1 : 0
    if (!active) return
    const u = atmosphereUniforms
    Object.assign(camera, { x: u.atmoCamera.value.x, y: u.atmoCamera.value.y, z: u.atmoCamera.value.z, w: u.atmoCamera.value.w })
    Object.assign(pole, { x: u.atmoPole.value.x, y: u.atmoPole.value.y, z: u.atmoPole.value.z, w: u.atmoPole.value.w })
    params.x = u.atmoParams.value.y
    params.z = u.atmoParams.value.z
    // (The camera's height over the stretched sphere: |C'|^2 - a^2 = atmoParams.x.)
    const height = Math.sqrt(Math.max(u.atmoParams.value.x + params.z * params.z, 0)) - params.z
    params.w = height < LOW_SAMPLES_HEIGHT ? lowSamples : hazeLight.value ? -SAMPLES : SAMPLES
    Object.assign(sun, { x: u.atmoSun.value.x, y: u.atmoSun.value.y, z: u.atmoSun.value.z })
  },
}
