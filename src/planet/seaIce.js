import * as THREE from 'three'
import { track } from '../core/PendingWork.js'

// Seasonal sea ice on the sea surface (CubedSpherePlanetRenderer._createWaterMaterial).
//
// assets/sea_ice (built by tools/sources/build_sea_ice.py from the NSIDC Sea Ice Index) holds, for each
// pole, the mean sea ice concentration of each calendar month over recent years, on a polar azimuthal
// equidistant grid: the point at geodetic latitude lat and longitude lon is at
//   r = (90 - |lat|) / capDegrees,  u = 0.5 + 0.5 r cos(lon),  v = 0.5 + 0.5 r sin(lon).
// setDayOfYear blends the two months either side of the date (each month's mean is taken to be at its
// middle) into one texture per pole. The date is quantised to SNAP_DAYS, so the ice is a function of the
// simulated date alone (recorded shots render the same everywhere).
//
// The textures and uniforms are shared by every planet renderer (the A/B tile sets too). Until the data
// has loaded, or where it is not on the machine, there is no ice.

const SNAP_DAYS = 0.25
// Days before the start of each month (not a leap year), and the year's length.
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]

// The concentration field is 25 km; the ice is broken up below that by fractal noise (seaNoise.js) at
// these frequencies (1/m), into floes and leads near its edge.
export const SEA_ICE_FREQUENCIES = [1 / 30000, 1 / 9000, 1 / 2800, 1 / 900, 1 / 280]
// Ice colour (linear): pack ice, and thin or broken ice (at low concentration).
const PACK_ICE = [0.72, 0.78, 0.84]
const THIN_ICE = [0.32, 0.4, 0.47]

function blankTexture() {
  const texture = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat, THREE.UnsignedByteType)
  texture.needsUpdate = true
  return texture
}

export const seaIceUniforms = {
  seaIceNorth: { value: blankTexture() },
  seaIceSouth: { value: blankTexture() },
  seaIceParams: { value: new THREE.Vector2(1, 1) }, // x: 1 / cap (per radian of colatitude), y: shown (0..1)
}

const state = { months: null, size: 0, day: null, loading: null }

/** Loads assets/sea_ice once (later calls return the same promise). */
export function loadSeaIce(baseUrl = `${import.meta.env?.BASE_URL ?? '/'}assets/sea_ice`) {
  state.loading ??= track((async () => {
    try {
      const manifest = await (await fetch(`${baseUrl}/manifest.json`)).json()
      const size = manifest.size, count = size * size
      const months = {}
      for (const pole of ['north', 'south']) {
        const response = await fetch(`${baseUrl}/${pole}.bin`)
        const data = response.ok ? new Uint8Array(await response.arrayBuffer()) : null
        if (!data || data.length !== count * 12) throw new Error(`${pole}.bin is not ${size} x ${size} x 12`)
        months[pole] = Array.from({ length: 12 }, (_, m) => data.subarray(m * count, (m + 1) * count))
        const texture = new THREE.DataTexture(new Uint8Array(count), size, size, THREE.RedFormat, THREE.UnsignedByteType)
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearFilter
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
        const uniform = pole === 'north' ? seaIceUniforms.seaIceNorth : seaIceUniforms.seaIceSouth
        uniform.value.dispose()
        uniform.value = texture
      }
      seaIceUniforms.seaIceParams.value.x = 1 / THREE.MathUtils.degToRad(manifest.capDegrees)
      state.months = months
      state.size = size
      const day = state.day ?? 1
      state.day = null
      setSeaIceDayOfYear(day)
    } catch (error) {
      console.info('[planet] no sea ice data (assets/sea_ice is not on this machine, or not pulled from Git LFS)', error.message)
    }
  })())
  return state.loading
}

/** The ice for a day of the year (1 = 1 January, fractional days allowed). */
export function setSeaIceDayOfYear(dayOfYear) {
  const day = Math.floor((((dayOfYear - 1) % 365 + 365) % 365) / SNAP_DAYS) * SNAP_DAYS
  if (day === state.day) return
  state.day = day
  if (!state.months) return
  // The months whose middles are either side of the day.
  const middle = (m) => (MONTH_START[m] + MONTH_START[m + 1]) / 2
  let m0 = 11
  for (let m = 0; m < 12; m++) if (middle(m) <= day) m0 = m
  const m1 = (m0 + 1) % 12
  const start = middle(m0), end = m1 === 0 ? middle(0) + 365 : middle(m1)
  const w = ((day < start ? day + 365 : day) - start) / (end - start)
  for (const [pole, uniform] of [['north', seaIceUniforms.seaIceNorth], ['south', seaIceUniforms.seaIceSouth]]) {
    const a = state.months[pole][m0], b = state.months[pole][m1], out = uniform.value.image.data
    for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * w + 0.5
    uniform.value.needsUpdate = true
  }
}

/** The sea ice concentration (0..1) at the current date at a geodetic latitude and longitude (degrees). */
export function seaIceConcentrationAt(latDeg, lonDeg) {
  if (!state.months) return 0
  const north = latDeg >= 0
  const r = (90 - Math.abs(latDeg)) * seaIceUniforms.seaIceParams.value.x * Math.PI / 180
  if (r >= 1) return 0
  const lon = lonDeg * Math.PI / 180, size = state.size
  const col = Math.floor((0.5 + 0.5 * r * Math.cos(lon)) * size)
  const row = Math.floor((0.5 + 0.5 * r * Math.sin(lon)) * size)
  const data = (north ? seaIceUniforms.seaIceNorth : seaIceUniforms.seaIceSouth).value.image.data
  return data[Math.min(size - 1, row) * size + Math.min(size - 1, col)] / 255 * seaIceUniforms.seaIceParams.value.y
}

export function setSeaIceVisible(visible) {
  seaIceUniforms.seaIceParams.value.y = visible ? 1 : 0
}

// GLSL: float seaIceConcentration(vec3 n), the ice concentration (0..1) at the ellipsoid normal n (planet
// axes: y is the polar axis, longitude is atan(-z, x)); and vec4 seaIceLook(float concentration, float
// noise, float viewDistance), the ice's colour and coverage, with the concentration's 25 km steps broken
// into floes by `noise` (fractal noise in [-1, 1]) close up and an even blend from far away.
export const seaIceGlsl = `
uniform sampler2D seaIceNorth;
uniform sampler2D seaIceSouth;
uniform vec2 seaIceParams;
float seaIceConcentration(vec3 n) {
  float horizontal = length(n.xz);
  vec2 lonDir = horizontal > 1e-12 ? vec2(n.x, -n.z) / horizontal : vec2(1.0, 0.0);
  // Colatitude from each pole (atan keeps it accurate near the poles, where asin is not).
  vec2 north = 0.5 + 0.5 * atan(horizontal, n.y) * seaIceParams.x * lonDir;
  vec2 south = 0.5 + 0.5 * atan(horizontal, -n.y) * seaIceParams.x * lonDir;
  // Outside its cap each grid is 0 (and clamps to its zero border).
  return seaIceParams.y * (texture2D(seaIceNorth, north).r + texture2D(seaIceSouth, south).r);
}
vec4 seaIceLook(float concentration, float noise, float viewDistance) {
  // Close up, ice where the concentration beats the noise (sharp floe edges); from far away, where the
  // noise has faded out, a soft ramp, so the cover matches the concentration on average.
  float softness = mix(0.04, 0.35, smoothstep(5.0e4, 2.0e6, viewDistance));
  float cover = smoothstep(-softness, softness, concentration - 0.5 - 0.55 * noise);
  cover *= smoothstep(0.05, 0.15, concentration);
  vec3 color = mix(vec3(${THIN_ICE.join(', ')}), vec3(${PACK_ICE.join(', ')}), smoothstep(0.3, 0.95, concentration));
  return vec4(color * (1.0 + 0.06 * noise), cover);
}
`
