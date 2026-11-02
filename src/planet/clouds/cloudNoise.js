import * as THREE from 'three'
import { hash } from '../../physics/weatherNoise.js'

// Tileable 3D noise textures for the clouds' shapes, made once (deterministically) at start-up:
//   shape (SHAPE_SIZE^3): R Perlin-Worley (billowy fractal noise, its gaps carved by Worley noise),
//     G, B, A Worley noise at 4, 8 and 16 cells across the tile, for eroding it at finer scales;
//   detail (DETAIL_SIZE^3): R, G, B Worley noise at 4, 8 and 16 cells, for wispy edges.
//   occupancy (SHAPE_SIZE^2 x (2 SHAPE_SIZE - 1), R8): bounds on the shape value, for skipping empty space
//     (see occupancyTexture).
// Worley noise here is 1 - the distance to the nearest of one random point per cell (so it is high in
// the cells' middles: puffs, not cracks). Both wrap, so the renderer tiles them over the planet.

const SHAPE_SIZE = 64
const DETAIL_SIZE = 32
const QUANTILES = 32

// Worley noise (1 - nearest distance, in cell units, clamped) with `cells` cells across the tile.
function worley(x, y, z, cells, seed) {
  const px = x * cells, py = y * cells, pz = z * cells
  const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz)
  let best = 9
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx, iy = cy + dy, iz = cz + dz
        const wx = ((ix % cells) + cells) % cells, wy = ((iy % cells) + cells) % cells, wz = ((iz % cells) + cells) % cells
        const fx = ix + hash(wx, wy, wz, seed), fy = iy + hash(wx, wy, wz, seed + 1), fz = iz + hash(wx, wy, wz, seed + 2)
        const d = (fx - px) ** 2 + (fy - py) ** 2 + (fz - pz) ** 2
        if (d < best) best = d
      }
    }
  }
  return 1 - Math.min(1, Math.sqrt(best))
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)

// Gradient (Perlin) noise in about [-1, 1] with `cells` cells across the tile.
function perlin(x, y, z, cells, seed) {
  const px = x * cells, py = y * cells, pz = z * cells
  const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz)
  const fx = px - cx, fy = py - cy, fz = pz - cz
  let sum = 0
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2
    const ix = (((cx + dx) % cells) + cells) % cells, iy = (((cy + dy) % cells) + cells) % cells, iz = (((cz + dz) % cells) + cells) % cells
    // A gradient from the 12 edge directions of a cube.
    const g = Math.floor(hash(ix, iy, iz, seed) * 12)
    const gx = g < 4 ? (g & 1 ? -1 : 1) : g < 8 ? 0 : (g & 1 ? -1 : 1)
    const gy = g < 4 ? (g & 2 ? -1 : 1) : g < 8 ? (g & 1 ? -1 : 1) : 0
    const gz = g < 4 ? 0 : g < 8 ? (g & 2 ? -1 : 1) : (g & 2 ? -1 : 1)
    const dot = gx * (fx - dx) + gy * (fy - dy) + gz * (fz - dz)
    sum += (dx ? fade(fx) : 1 - fade(fx)) * (dy ? fade(fy) : 1 - fade(fy)) * (dz ? fade(fz) : 1 - fade(fz)) * dot
  }
  return sum * 1.5
}

const remap = (v, a, b, c, d) => c + (v - a) / (b - a) * (d - c)

function texture3d(size, fill) {
  const data = new Uint8Array(size * size * size * 4)
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const o = ((z * size + y) * size + x) * 4
        const v = fill((x + 0.5) / size, (y + 0.5) / size, (z + 0.5) / size)
        for (let c = 0; c < 4; c++) data[o + c] = Math.round(Math.min(1, Math.max(0, v[c] ?? 0)) * 255)
      }
    }
  }
  const t = new THREE.Data3DTexture(data, size, size, size)
  t.format = THREE.RGBAFormat
  t.minFilter = t.magFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

// An upper bound on the shape value (R remapped by the Worley octaves, as the renderer combines them from
// the texture's interpolated channels) over blocks of the shape texture: at each level L (blocks 2^L
// texels across, (SHAPE_SIZE >> L)^3 of them, stacked along z from 2 SHAPE_SIZE - 2 (SHAPE_SIZE >> L)),
// the bound for anywhere in the block and a texel beyond (for the interpolation). The remap rises with R and falls with
// the octaves' sum, so the bound is from the highest R and the lowest sum. Rounded up.
function occupancyTexture(shape) {
  const n = SHAPE_SIZE, d = shape.image.data
  // The texels' R and octave sum, then the most and least of each over 3x3x3 texels (interpolation).
  let rMax = new Float32Array(n * n * n), fMin = new Float32Array(n * n * n)
  for (let i = 0; i < n * n * n; i++) {
    rMax[i] = d[i * 4] / 255
    fMin[i] = (d[i * 4 + 1] * 0.625 + d[i * 4 + 2] * 0.25 + d[i * 4 + 3] * 0.125) / 255
  }
  const spread = (a, size, op, reach) => {
    // (Separable: along x, y, then z, over -reach..reach blocks, wrapping.)
    for (let axis = 0; axis < 3; axis++) {
      const out = new Float32Array(a.length)
      for (let z = 0; z < size; z++) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            let v = a[(z * size + y) * size + x]
            for (let k = -reach; k <= reach; k++) {
              const q = [x, y, z]
              q[axis] = (((q[axis] + k) % size) + size) % size
              v = op(v, a[(q[2] * size + q[1]) * size + q[0]])
            }
            out[(z * size + y) * size + x] = v
          }
        }
      }
      a = out
    }
    return a
  }
  rMax = spread(rMax, n, Math.max, 1)
  fMin = spread(fMin, n, Math.min, 1)
  const data = new Uint8Array(n * n * (2 * n - 1))
  let size = n, r = rMax, f = fMin
  for (let level = 0; size >= 1; level++) {
    const z0 = 2 * n - 2 * size
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (z * size + y) * size + x
          const bound = (r[i] + 1 - f[i]) / (2 - f[i])
          data[((z0 + z) * n + y) * n + x] = Math.min(255, Math.ceil(bound * 255 + 1e-6))
        }
      }
    }
    // The next level's blocks: the most and least of the 2x2x2 below.
    if (size === 1) break
    const half = size / 2, r2 = new Float32Array(half ** 3), f2 = new Float32Array(half ** 3).fill(1)
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (z * size + y) * size + x, j = ((z >> 1) * half + (y >> 1)) * half + (x >> 1)
          r2[j] = Math.max(r2[j], r[i])
          f2[j] = Math.min(f2[j], f[i])
        }
      }
    }
    r = r2
    f = f2
    size = half
  }
  const t = new THREE.Data3DTexture(data, n, n, 2 * n - 1)
  t.format = THREE.RedFormat
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

/**
 * The statistics of the shape texture's channels weighted by `weights` (R Perlin-Worley, then the
 * Worley octaves) averaged over `taps` points along a line
 * `length` tiles long, in any direction (as the cirrus's fibres smear it along the wind): its mean and
 * standard deviation, and the mean of smoothstep(edges[0], edges[1], z) of its standardised value z
 * (the share of the sky the fibres fill). Deterministic: a fixed set of sample lines.
 */
export function smearStats(taps, length, weights, edges, samples = 4000) {
  const n = SHAPE_SIZE, d = cloudNoiseTextures().shape.image.data
  const at = (x, y, z) => {
    const o = ((((z % n) + n) % n) * n * n + (((y % n) + n) % n) * n + (((x % n) + n) % n)) * 4
    return (d[o] * weights[0] + d[o + 1] * weights[1] + d[o + 2] * weights[2] + d[o + 3] * weights[3]) / 255
  }
  const sample = (p) => {
    const q = p.map(v => v - 0.5), f = q.map(Math.floor), t = q.map((v, i) => v - f[i])
    let sum = 0
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2
      sum += (dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]) * at(f[0] + dx, f[1] + dy, f[2] + dz)
    }
    return sum
  }
  const values = []
  for (let i = 0; i < samples; i++) {
    const p = [hash(i, 0, 0, 7) * n, hash(i, 1, 0, 7) * n, hash(i, 2, 0, 7) * n]
    let dir = [hash(i, 3, 0, 7) - 0.5, hash(i, 4, 0, 7) - 0.5, hash(i, 5, 0, 7) - 0.5]
    const l = Math.hypot(...dir) || 1
    dir = dir.map(v => v / l)
    let s = 0
    for (let k = 0; k < taps; k++) {
      const o = (k / (taps - 1) - 0.5) * length * n
      s += sample(p.map((v, j) => v + dir[j] * o))
    }
    values.push(s / taps)
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  const smoothstep = (x) => { const t = Math.min(1, Math.max(0, (x - edges[0]) / (edges[1] - edges[0]))); return t * t * (3 - 2 * t) }
  const filled = values.reduce((a, v) => a + smoothstep((v - mean) / sd), 0) / values.length
  return { mean, sd, filled }
}

let cached = null

/**
 * The distribution (mean and QUANTILES + 1 quantiles) of the mid-level cloud's shape value (Clouds.js
 * driftedShape): the shape value averaged over two unrelated places, mixed with a share `cells` of their Worley
 * noise (B 0.6, A 0.4), so a cover can be turned into its threshold as for the low cloud's.
 */
export function midShapeStats(cells, samples = 200000) {
  const d = cloudNoiseTextures().shape.image.data, n = d.length / 4
  const value = (i) => {
    const r = d[i * 4] / 255, fbm = (d[i * 4 + 1] * 0.625 + d[i * 4 + 2] * 0.25 + d[i * 4 + 3] * 0.125) / 255
    return [remap(r, fbm - 1, 1, 0, 1), d[i * 4 + 2] / 255]
  }
  let seed = 12345
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n) }
  const values = new Float32Array(samples)
  for (let k = 0; k < samples; k++) {
    const a = value(next()), b = value(next())
    values[k] = (1 - cells) * 0.5 * (a[0] + b[0]) + cells * (0.75 * a[1] + 0.25 * b[1])
  }
  values.sort()
  const mean = values.reduce((s, v) => s + v, 0) / samples
  const quantiles = Array.from({ length: QUANTILES + 1 }, (_, i) => values[Math.min(samples - 1, Math.round(i / QUANTILES * (samples - 1)))])
  return { mean, quantiles }
}

/** The clouds' noise textures ({ shape, detail, occupancy, shapeStats: the shape value's mean and quantiles }), made on first use. */
export function cloudNoiseTextures() {
  if (cached) return cached
  const shape = texture3d(SHAPE_SIZE, (x, y, z) => {
    let p = 0, amplitude = 1, total = 0
    for (let o = 0; o < 4; o++) {
      p += amplitude * perlin(x, y, z, 4 << o, 100 + o)
      total += amplitude
      amplitude *= 0.5
    }
    p = p / total * 0.5 + 0.5
    const w = [worley(x, y, z, 4, 10), worley(x, y, z, 8, 20), worley(x, y, z, 16, 30)]
    const wFbm = w[0] * 0.625 + w[1] * 0.25 + w[2] * 0.125
    return [remap(p, wFbm - 1, 1, 0, 1), w[0], w[1], w[2]]
  })
  const detail = texture3d(DETAIL_SIZE, (x, y, z) => [worley(x, y, z, 4, 40), worley(x, y, z, 8, 50), worley(x, y, z, 16, 60), 1])
  // The distribution of the shape value the renderer uses (R remapped by the Worley octaves), so a
  // cover can be turned into the threshold that leaves that fraction cloudy.
  const d = shape.image.data
  const values = new Float32Array(d.length / 4)
  for (let i = 0; i < values.length; i++) {
    const r = d[i * 4] / 255, fbm = (d[i * 4 + 1] * 0.625 + d[i * 4 + 2] * 0.25 + d[i * 4 + 3] * 0.125) / 255
    values[i] = remap(r, fbm - 1, 1, 0, 1)
  }
  values.sort()
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const quantiles = Array.from({ length: QUANTILES + 1 }, (_, i) => values[Math.min(values.length - 1, Math.round(i / QUANTILES * (values.length - 1)))])
  cached = { shape, detail, occupancy: occupancyTexture(shape), shapeStats: { mean, quantiles } }
  return cached
}
