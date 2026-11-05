// The procedural weather shared by the wind (wind.js), the clouds and rain (weather.js) and their GLSL
// twins (weatherNoiseGlsl): smooth random fields on the sphere, redrawn about every WEATHER_DAYS and
// cross-faded between draws, repeating each year. Everything is a pure function of place and date, and
// the JS and GLSL versions agree (the hash is exact 32-bit integer arithmetic in both), so the clouds
// drawn on the GPU sit where the CPU's wind and rain say they are.

export const DAYS_PER_YEAR = 365.25
export const PLANET_RADIUS = 6371000 // m
// The eddies: stream-function octaves (feature size, m; relative amplitude).
export const EDDIES = [[1500e3, 1], [600e3, 0.4]]
// Convective clusters in the tropics (feature size, m), where the eddies give way (see pressureAnomaly).
const CLUSTER_SIZE = 500e3
// About every WEATHER_DAYS: a whole number of draws per year, so the weather repeats without a jump.
export const WEATHER_DAYS = 1.5
export const WEATHER_PERIOD = Math.round(DAYS_PER_YEAR / WEATHER_DAYS) // draws per year
// Latitude (degrees) over which the pressure anomaly turns from the eddies' to the clusters'.
const TROPICS = 12

/** A 32-bit hash of integers, to [0, 1). */
export function hash(a, b, c, d) {
  let h = 2166136261
  for (const v of [a, b, c, d]) {
    h = Math.imul(h ^ (v | 0), 16777619)
    h ^= h >>> 15
  }
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10)

/** Value noise in [-1, 1] at (x, y, z), from lattice `seed`. */
export function noise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const fx = smooth(x - xi), fy = smooth(y - yi), fz = smooth(z - zi)
  let sum = 0
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2
    sum += (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz) * hash(xi + dx, yi + dy, zi + dz, seed)
  }
  return sum * 2 - 1
}

/** The eddies' stream function at a point of the unit sphere for weather draw `draw`. */
export function streamFunction(x, y, z, draw) {
  let sum = 0
  EDDIES.forEach(([size, amplitude], i) => {
    const k = PLANET_RADIUS / size
    sum += amplitude * noise(x * k, y * k, z * k, draw * 7 + i)
  })
  return sum
}

/** The two weather draws either side of a date, and the cross-fade between them (0..1, smoothed). */
export function weatherDraws(dayOfYear, utcHours) {
  const t = (dayOfYear - 1 + utcHours / 24) / DAYS_PER_YEAR * WEATHER_PERIOD
  const t0 = Math.floor(t)
  const wrap = (n) => ((n % WEATHER_PERIOD) + WEATHER_PERIOD) % WEATHER_PERIOD
  return { d0: wrap(t0), d1: wrap(t0 + 1), f: smooth(t - t0) }
}

// The pressure anomaly of one draw: the stream function's sign turned to "low pressure is negative" in
// either hemisphere (a low is a minimum of the stream function in the north, where the flow round it is
// anticlockwise, and a maximum in the south), giving way in the tropics, where rotation no longer
// organises the weather, to convective clusters. Unscaled.
function drawAnomaly(lat, x, y, z, draw) {
  const s = Math.max(-1, Math.min(1, lat / TROPICS))
  return -s * streamFunction(x, y, z, draw) / STREAM_RMS + Math.sqrt(1 - s * s) * clusterNoise(x, y, z, draw) / NOISE_RMS
}

// The convective clusters' noise: two value-noise samples in differently rotated lattices, averaged (a
// single lattice's axis-aligned cells show through as squares once the cover's steep transform sharpens
// them). The rotations are fixed rotations about the (1, 1, 1) and (1, -1, 0) axes.
const ROT_A = [[0.9107, -0.2440, 0.3333], [0.3333, 0.9107, -0.2440], [-0.2440, 0.3333, 0.9107]]
const ROT_B = [[0.8660, 0.1294, 0.4830], [0.1294, 0.8660, -0.4830], [-0.4830, 0.4830, 0.7321]]
const rotate = (m, x, y, z) => [m[0][0] * x + m[0][1] * y + m[0][2] * z, m[1][0] * x + m[1][1] * y + m[1][2] * z, m[2][0] * x + m[2][1] * y + m[2][2] * z]
function clusterNoise(x, y, z, draw) {
  const k = PLANET_RADIUS / CLUSTER_SIZE
  const a = rotate(ROT_A, x * k, y * k, z * k), b = rotate(ROT_B, x * k, y * k, z * k)
  return noise(a[0], a[1], a[2], draw * 7 + 5) + noise(b[0] + 17.3, b[1] + 41.1, b[2] + 5.7, draw * 7 + 6)
}

// The RMS of the stream function and of one octave of noise (measured once, deterministically, with
// the same sampling in the GLSL's constants), so the anomaly has unit variance everywhere.
function rms(f) {
  let sum = 0
  for (let i = 0; i < 4000; i++) {
    const z = 2 * hash(i, 1, 2, 3) - 1, phi = 2 * Math.PI * hash(i, 4, 5, 6), r = Math.sqrt(1 - z * z)
    const v = f(r * Math.sin(phi), z, r * Math.cos(phi), i % 50)
    sum += v * v
  }
  return Math.sqrt(sum / 4000)
}
const STREAM_RMS = rms(streamFunction)
const NOISE_RMS = rms(clusterNoise)

/**
 * The weather's pressure anomaly at geodetic latitude/longitude (degrees) and date: about normally
 * distributed with unit variance, negative under lows (cloud and rain), positive under highs. With a
 * drawOffset, an independent field of the same kind (other draws), as the GLSL's weatherAnomaly with d0 and
 * d1 offset.
 */
export function pressureAnomaly(lat, lon, dayOfYear, utcHours, drawOffset = 0) {
  const { d0: w0, d1: w1, f } = weatherDraws(dayOfYear, utcHours)
  const d0 = w0 + drawOffset, d1 = w1 + drawOffset
  const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180
  const x = Math.cos(phi) * Math.sin(lambda), y = Math.sin(phi), z = Math.cos(phi) * Math.cos(lambda)
  return ((1 - f) * drawAnomaly(lat, x, y, z, d0) + f * drawAnomaly(lat, x, y, z, d1)) / Math.hypot(1 - f, f)
}

/** The standard normal quantile (Abramowitz and Stegun 26.2.23), for 0 < p < 1. */
export function probit(p) {
  const q = p < 0.5 ? p : 1 - p
  const t = Math.sqrt(-2 * Math.log(q))
  const x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t)
  return p < 0.5 ? -x : x
}

// GLSL: the same functions (weatherHash, weatherNoise, weatherStream, weatherAnomaly(lat degrees, unit
// position, d0, d1, f)) for shaders.
export const weatherNoiseGlsl = `
float weatherHash(int a, int b, int c, int d) {
  uint h = 2166136261u;
  h = (h ^ uint(a)) * 16777619u; h ^= h >> 15u;
  h = (h ^ uint(b)) * 16777619u; h ^= h >> 15u;
  h = (h ^ uint(c)) * 16777619u; h ^= h >> 15u;
  h = (h ^ uint(d)) * 16777619u; h ^= h >> 15u;
  h = (h ^ (h >> 13u)) * 0x5bd1e995u;
  return float(h ^ (h >> 16u)) / 4294967296.0;
}

float weatherSmooth(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float weatherNoise(vec3 p, int seed) {
  vec3 i = floor(p);
  vec3 f = vec3(weatherSmooth(p.x - i.x), weatherSmooth(p.y - i.y), weatherSmooth(p.z - i.z));
  ivec3 n = ivec3(i);
  float sum = 0.0;
  for (int k = 0; k < 8; k++) {
    ivec3 d = ivec3(k & 1, (k >> 1) & 1, k >> 2);
    vec3 w = mix(1.0 - f, f, vec3(d));
    sum += w.x * w.y * w.z * weatherHash(n.x + d.x, n.y + d.y, n.z + d.z, seed);
  }
  return sum * 2.0 - 1.0;
}

float weatherStream(vec3 p, int draw) {
  return ${EDDIES.map(([size, amplitude], i) => `${amplitude.toFixed(4)} * weatherNoise(p * ${(PLANET_RADIUS / size).toFixed(6)}, draw * 7 + ${i})`).join(' + ')};
}

float weatherCluster(vec3 p, int draw) {
  vec3 q = p * ${(PLANET_RADIUS / CLUSTER_SIZE).toFixed(6)};
  vec3 a = vec3(${ROT_A.map(r => `dot(vec3(${r.map(v => v.toFixed(4)).join(', ')}), q)`).join(', ')});
  vec3 b = vec3(${ROT_B.map(r => `dot(vec3(${r.map(v => v.toFixed(4)).join(', ')}), q)`).join(', ')});
  return weatherNoise(a, draw * 7 + 5) + weatherNoise(b + vec3(17.3, 41.1, 5.7), draw * 7 + 6);
}

float weatherDrawAnomaly(float lat, vec3 p, int draw) {
  float s = clamp(lat / ${TROPICS.toFixed(1)}, -1.0, 1.0);
  return -s * weatherStream(p, draw) / ${STREAM_RMS.toFixed(6)} + sqrt(1.0 - s * s) * weatherCluster(p, draw) / ${NOISE_RMS.toFixed(6)};
}

float weatherAnomaly(float lat, vec3 p, int d0, int d1, float f) {
  return ((1.0 - f) * weatherDrawAnomaly(lat, p, d0) + f * weatherDrawAnomaly(lat, p, d1)) / length(vec2(1.0 - f, f));
}
`
