// The light the sky sheds on the ground, from the atmosphere model the sky is drawn with
// (src/shaders/atmosphereCommon.glsl; its constants are repeated here and a test checks they match).
// The sky's radiance is integrated over the upper hemisphere at sea level for a range of sun
// elevations, giving the irradiance on a level surface as a fraction of the sun's irradiance above the
// atmosphere. sunAndSkyLight.js turns this into the ambient light of everything in the scene.
//
// The model is single scattering, which underestimates the sky (most of all in twilight), so the result
// is scaled by MULTIPLE_SCATTERING.

export const ATMO_BETA_R = [5.8e-6, 13.5e-6, 33.1e-6]
export const ATMO_BETA_M = 80e-6  // (the sky's: atmosphereCommon.glsl with ATMO_SKY_AEROSOL)
export const ATMO_MIE_MULTIPLE = 0.06
export const ATMO_MIE_MULTIPLE_TINT = [0.7207, 1.0083, 1.7402]
export const ATMO_HEIGHT_R = 8000
export const ATMO_HEIGHT_M = 1200
export const ATMO_MIE_G = 0.76
// The planet the table is worked out for (Earth's equatorial radius) and the atmosphere's top (Planet.js).
const GROUND = 6378137
const TOP = GROUND + 100000
// Light scattered more than once, as a multiple of the single-scattered light (a clear sky).
export const MULTIPLE_SCATTERING = 1.5

// The table: sun cosines (zenith) from SKY_MU_MIN to 1 in SKY_SAMPLES steps.
export const SKY_MU_MIN = -0.25
export const SKY_SAMPLES = 33

const VIEW_SAMPLES = 24
const ZENITH_STEPS = 16
const AZIMUTH_STEPS = 16

function chapman(H, r, h, c) {
  const k = Math.sqrt(Math.PI * r / H * 0.5)
  const up = H * Math.exp(-h / H) * k / ((k - 1) * Math.abs(c) + 1)
  if (c >= 0) return up
  const rt = r * Math.sqrt(1 - c * c)
  return 2 * H * Math.exp(-(rt - GROUND) / H) * Math.sqrt(Math.PI * rt / H * 0.5) - up
}

// Rayleigh and Mie air between p and the sun (null if the ground is in the way).
function sunDepth(p, sun) {
  const r = Math.max(Math.hypot(p[0], p[1], p[2]), GROUND)
  const c = (p[0] * sun[0] + p[1] * sun[1] + p[2] * sun[2]) / r
  const b = c * r
  if (b < 0 && b * b - (r * r - GROUND * GROUND) > 0) return null
  const h = r - GROUND
  return [chapman(ATMO_HEIGHT_R, r, h, c), chapman(ATMO_HEIGHT_M, r, h, c)]
}

/** The air's transmittance (RGB) towards the sun from sea level, for a sun at zenith cosine `mu`. */
export function sunTransmittance(mu) {
  const d = sunDepth([0, GROUND, 0], [Math.sqrt(1 - mu * mu), mu, 0])
  if (!d) return [0, 0, 0]
  return ATMO_BETA_R.map(b => Math.exp(-(b * d[0] + ATMO_BETA_M * 1.1 * d[1])))
}

// Sky radiance (RGB, per unit of the sun's irradiance) along direction d from sea level.
function skyRadiance(d, sun) {
  const t1 = -GROUND * d[1] + Math.sqrt(GROUND * GROUND * d[1] * d[1] - GROUND * GROUND + TOP * TOP)
  const segment = t1 / VIEW_SAMPLES
  let viewR = 0, viewM = 0
  const sumR = [0, 0, 0], sumM = [0, 0, 0]
  for (let i = 0; i < VIEW_SAMPLES; i++) {
    const t = (i + 0.5) * segment
    const p = [d[0] * t, GROUND + d[1] * t, d[2] * t]
    const h = Math.max(Math.hypot(p[0], p[1], p[2]) - GROUND, 0)
    const densityR = Math.exp(-h / ATMO_HEIGHT_R) * segment
    const densityM = Math.exp(-h / ATMO_HEIGHT_M) * segment
    const s = sunDepth(p, sun)
    if (s) {
      for (let c = 0; c < 3; c++) {
        // The segment's own light, integrated exactly for its air (as in atmoScatter).
        const tau = ATMO_BETA_R[c] * densityR + ATMO_BETA_M * 1.1 * densityM
        const within = tau > 1e-4 ? (1 - Math.exp(-tau)) / tau : 1 - 0.5 * tau
        const attenuation = Math.exp(-(ATMO_BETA_R[c] * (viewR + s[0]) + ATMO_BETA_M * 1.1 * (viewM + s[1]))) * within
        sumR[c] += densityR * attenuation
        sumM[c] += densityM * attenuation
      }
    }
    viewR += densityR
    viewM += densityM
  }
  const cos = d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2]
  const phaseR = 3 / (16 * Math.PI) * (1 + cos * cos)
  const g2 = ATMO_MIE_G * ATMO_MIE_G
  const phaseM = 3 / (8 * Math.PI) * ((1 - g2) * (1 + cos * cos)) / ((2 + g2) * Math.pow(1 + g2 - 2 * ATMO_MIE_G * cos, 1.5))
  return [0, 1, 2].map(c => sumR[c] * ATMO_BETA_R[c] * phaseR + ATMO_BETA_M * (sumM[c] * phaseM + sumM[1] * ATMO_MIE_MULTIPLE * ATMO_MIE_MULTIPLE_TINT[c]))
}

/** Sky irradiance (RGB) on a level surface at sea level, per unit of the sun's irradiance. */
export function skyIrradiance(mu) {
  const sun = [Math.sqrt(1 - mu * mu), mu, 0]
  const sum = [0, 0, 0]
  const dTheta = Math.PI / 2 / ZENITH_STEPS
  const dPhi = Math.PI / AZIMUTH_STEPS
  for (let i = 0; i < ZENITH_STEPS; i++) {
    const theta = (i + 0.5) * dTheta
    const weight = Math.cos(theta) * Math.sin(theta) * dTheta * dPhi * 2 // (both sides of the sun's plane)
    for (let j = 0; j < AZIMUTH_STEPS; j++) {
      const phi = (j + 0.5) * dPhi
      const L = skyRadiance([Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)], sun)
      for (let c = 0; c < 3; c++) sum[c] += L[c] * weight
    }
  }
  return sum.map(v => v * MULTIPLE_SCATTERING)
}

/** skyIrradiance at SKY_SAMPLES sun cosines from SKY_MU_MIN to 1. */
export function skyIrradianceTable() {
  return Array.from({ length: SKY_SAMPLES }, (_, i) => skyIrradiance(SKY_MU_MIN + (1 - SKY_MU_MIN) * i / (SKY_SAMPLES - 1)))
}

const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/**
 * Per-channel factors that make the light on level ground under a noon sun (sun plus sky) white,
 * keeping its brightness: the eye adapts to daylight, and imagery and materials are coloured for it.
 */
export function daylightWhiteBalance(table = skyIrradianceTable()) {
  const sun = sunTransmittance(1)
  const total = sun.map((s, c) => s + table[SKY_SAMPLES - 1][c])
  return total.map(v => luminance(total) / v)
}
