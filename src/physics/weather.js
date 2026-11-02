import climatology from './weatherClimatology.data.js'
import { DAYS_PER_YEAR, pressureAnomaly, probit } from './weatherNoise.js'
import { windAt } from './wind.js'

// The weather anywhere on Earth at a date and time of day: cloud cover and heights, rain and humidity.
// Plausible weather, not a forecast: a pure function of (place, day of year, UTC hours), like the wind
// (wind.js), and from the same lows and highs, so the clouds and rain sit in the storms that turn the
// wind.
//
// - The climate: a monthly climatology from NCEP/NCAR reanalysis fields (2022-2023; baked by
//   tools/sources/build_weather.py into weatherClimatology.data.js) on a 5-degree grid, smoothed by a
//   cubic B-spline between nodes (bilinear interpolation has kinks along the grid lines, which the
//   cover's steep transform would turn into visible squares) and interpolated linearly between months.
// - The weather: the pressure anomaly (weatherNoise.js; about normal with unit variance, negative under
//   lows) moves the cloud cover through a probit transform (coverFor), which keeps it between 0 and 1
//   with the climate's mean and about its spread, and the humidity by HUMIDITY_GAIN of its spread; it rains
//   where the anomaly is lower than the threshold that is passed rainFreq of the time, harder the lower
//   it is, so that it averages rainRate while it rains.
//
// The large-scale fields here are what the clouds are drawn from: the clouds' own shapes, far smaller
// than the 5-degree grid, come from the renderer's noise.

const { rows, cols, gridDegrees, fields, scales } = climatology
const FIELDS = fields.length
const DATA = Int8Array.from(atob(climatology.data), (c) => {
  const b = c.charCodeAt(0)
  return b > 127 ? b - 256 : b
})
const F = Object.fromEntries(fields.map((name, i) => [name, i]))

/** The climatology as floats ([month][row][column][field]) with its grid, for the GPU (clouds). */
export function weatherClimatologyTable() {
  return { rows, cols, gridDegrees, fields, values: Float32Array.from(DATA, (v, i) => v * scales[i % FIELDS]) }
}
const HUMIDITY_GAIN = 1.2
// The reanalysis's rain is an average over cells about 200 km across, of which only part is raining:
// a share RAIN_AREA[0] of the cell for steady rain, RAIN_AREA[1] for showers.
export const RAIN_AREA = [0.6, 0.15]
// Squalls: under heavy showers the wind at the surface rises by up to SQUALL_GAIN, reaching it at
// SQUALL_RAIN (mm/h) of rain in the shower (showerRain).
const SQUALL_GAIN = 0.6
const SQUALL_RAIN = 10

// The climate fields at a grid node (month 0..11, row 0..rows-1, column any integer).
function node(month, row, col, out, weight) {
  const o = ((month * rows + row) * cols + (((col % cols) + cols) % cols)) * FIELDS
  for (let f = 0; f < FIELDS; f++) out[f] += weight * DATA[o + f] * scales[f]
}

// Cubic B-spline weights for the four nodes around fraction f.
export function bSpline(f) {
  const g = 1 - f
  return [g * g * g / 6, (3 * f * f * f - 6 * f * f + 4) / 6, (-3 * f * f * f + 3 * f * f + 3 * f + 1) / 6, f * f * f / 6]
}

/** The climate fields (see build_weather.py's FIELDS), smoothed in place and interpolated in season. */
export function weatherClimate(lat, lon, dayOfYear, utcHours, out = new Float64Array(FIELDS)) {
  out.fill(0)
  const m = ((dayOfYear - 1 + utcHours / 24) / DAYS_PER_YEAR) * 12 - 0.5
  const m0 = Math.floor(m), fm = m - m0
  const r = (lat + 90) / gridDegrees
  const r0 = Math.floor(r), wr = bSpline(r - r0)
  const c = lon / gridDegrees
  const c0 = Math.floor(c), wc = bSpline(c - c0)
  for (const [month, wm] of [[(m0 % 12 + 12) % 12, 1 - fm], [((m0 + 1) % 12 + 12) % 12, fm]]) {
    for (let i = 0; i < 4; i++) {
      const row = Math.min(Math.max(r0 - 1 + i, 0), rows - 1)
      for (let j = 0; j < 4; j++) node(month, row, c0 - 1 + j, out, wm * wr[i] * wc[j])
    }
  }
  return out
}

/**
 * The cloud cover for a weather strength z (minus the pressure anomaly, about standard normal), given the
 * climate's mean cover and its standard deviation: Phi(m + k z), whose average over z is exactly `mean`
 * when m = probit(mean) sqrt(1 + k^2), with k set so that its spread is about `sd` (so a variable climate
 * is mostly clear or overcast rather than always half covered).
 */
export function coverFor(z, mean, sd) {
  const p = Math.min(Math.max(mean, 0.005), 0.995)
  const base = probit(p)
  const k = Math.min(Math.max(1.3 * sd / Math.max(normalPdf(base), 0.05), 0.2), 3)
  return 1 - normalTail(base * Math.sqrt(1 + k * k) + k * z)
}

const normalPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
// The upper tail of the standard normal distribution (Abramowitz and Stegun 26.2.17).
function normalTail(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const tail = normalPdf(x) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? tail : 1 - tail
}

/**
 * The rain rate (mm/h) for a weather strength z (minus the pressure anomaly), given how often it rains
 * and the mean rate while it does: zero below the threshold passed `frequency` of the time, rising
 * linearly beyond it, scaled so that the rate averages `rate` while it rains.
 */
export function rainFor(z, frequency, rate) {
  if (frequency <= 1e-4 || rate <= 0) return 0
  const threshold = probit(1 - Math.min(frequency, 0.9999))
  if (z <= threshold) return 0
  const meanExcess = normalPdf(threshold) / normalTail(threshold) - threshold
  return rate * (z - threshold) / meanExcess
}

// The cloud types: the real world's mix from surface observations (build_weather.py's st ... hiWhen,
// tools/sources/cloud_types.py), today's from the weather (as weatherMap.js's GLSL). Each layer's cover
// follows its long-run mean amount through the same probit transform as the total cover (coverFor, which
// keeps that mean), moved by the pressure anomaly (lows bring more) partly through a field of its own
// (LAYER_OWN of it, other draws: the layers are not all locked together). In a low the low cloud turns
// stratiform and the middle cloud to altostratus and nimbostratus; in a high, cumuliform and altocumulus
// (TYPE_SHIFT, in log-odds per unit of anomaly). LAYER_SPREAD: the layers' cover's spread, as a share of a
// 0/1 variable's at the same mean. LAYER_DRAWS: the draw offsets of the mid and high layers' own fields.
export const LAYER_OWN = 0.6
export const TYPE_SHIFT = 0.8
export const LAYER_SPREAD = 0.8
export const LAYER_DRAWS = [3001, 6007]
// (The middle cloud's stratiform share is the more where its cover is the more, both being moved by the
// same lows: MID_SHEET_BIAS, in log-odds, keeps its mean amount the observations'.)
export const MID_SHEET_BIAS = -0.8

/** A layer's cover today (0..1) from its long-run mean amount, at weather strength z. */
export function layerCover(z, mean) {
  const m = Math.min(Math.max(mean, 0), 0.98)
  return m <= 0.002 ? 0 : coverFor(z, m, LAYER_SPREAD * Math.sqrt(m * (1 - m)))
}

/** A share (0..1) moved by `shift` in log-odds. */
export function shiftShare(share, shift) {
  const s = Math.min(Math.max(share, 0.01), 0.99)
  return 1 / (1 + Math.exp(-(Math.log(s / (1 - s)) + shift)))
}

const _c = new Float64Array(FIELDS)

/**
 * The weather at geodetic latitude/longitude (degrees) on day of year `dayOfYear` (1..366) at
 * `utcHours`: cover (0..1) of cloud, the low cloud layer's base and top (m) and its cumuliform share
 * (0..1: cumulus and cumulonimbus, rather than stratocumulus and stratus); the middle cloud layer's cover
 * (0..1), stratiform share (altostratus and nimbostratus, rather than altocumulus) and base (m); the high
 * cloud's cover (0..1) and base (m); rain (mm/h, averaged over the area), its convective share (0..1, showers rather
 * than steady rain) and showerRain (mm/h, under the clouds that are raining);
 * humidity (relative, near the surface, 0..1); and the pressure anomaly.
 */
export function weatherAt(lat, lon, dayOfYear, utcHours) {
  const c = weatherClimate(lat, lon, dayOfYear, utcHours, _c)
  const anomaly = pressureAnomaly(lat, lon, dayOfYear, utcHours)
  const z = -anomaly
  const w = 2 * Math.PI * utcHours / 24
  const clamp = (v) => Math.min(1, Math.max(0, v))
  const cover = coverFor(z, c[F.cover] + c[F.coverCos] * Math.cos(w) + c[F.coverSin] * Math.sin(w), c[F.coverSd])
  const own = Math.sqrt(1 - LAYER_OWN * LAYER_OWN)
  const zMid = own * z - LAYER_OWN * pressureAnomaly(lat, lon, dayOfYear, utcHours, LAYER_DRAWS[0])
  const zHigh = own * z - LAYER_OWN * pressureAnomaly(lat, lon, dayOfYear, utcHours, LAYER_DRAWS[1])
  const lowSum = c[F.st] + c[F.sc] + c[F.cu] + c[F.cb]
  const midMean = c[F.ac] + c[F.as_] + c[F.ns]
  return {
    cover,
    lowBase: 1000 * c[F.lowBase],
    lowTop: 1000 * Math.max(c[F.lowTop], c[F.lowBase] + 0.3),
    cumuliform: shiftShare((c[F.cu] + c[F.cb]) / Math.max(lowSum, 1e-3), -TYPE_SHIFT * z),
    midCover: layerCover(zMid, midMean),
    midStratiform: shiftShare((c[F.as_] + c[F.ns]) / Math.max(midMean, 1e-3), TYPE_SHIFT * zMid + MID_SHEET_BIAS),
    midBase: 1000 * c[F.midBase],
    highCover: layerCover(zHigh, c[F.hi]),
    highBase: 1000 * c[F.highBase],
    rain: rainFor(z, c[F.rainFreq], c[F.rainRate]),
    convective: clamp(c[F.convective]),
    get showerRain() { return this.rain / (RAIN_AREA[0] + (RAIN_AREA[1] - RAIN_AREA[0]) * this.convective) },
    humidity: clamp(c[F.humidity] + HUMIDITY_GAIN * c[F.humiditySd] * z),
    anomaly,
  }
}

/**
 * The wind at the sea surface (wind.js's windAt), stronger in squalls under heavy showers. Same fields
 * as windAt.
 */
export function seaWindAt(lat, lon, dayOfYear, utcHours) {
  const wind = windAt(lat, lon, dayOfYear, utcHours)
  const { showerRain, convective } = weatherAt(lat, lon, dayOfYear, utcHours)
  const gust = 1 + SQUALL_GAIN * convective * Math.min(1, showerRain / SQUALL_RAIN)
  return { ...wind, east: wind.east * gust, north: wind.north * gust, speed: wind.speed * gust, knots: wind.knots * gust }
}
