// Ground data for the generated close-up ground (see groundDetail.js): what the ground is made of, its heights at
// the source terrain's full resolution and the shape of its coast, over a region (assets/<name>/, baked by
// tools/ground_cover.py).
//
// The region is a grid in geodetic latitude and longitude, `cellsPerDegree` cells to the degree, cut into square
// chunks of `chunkCells` cells. Each chunk is one file, `chunks/<i>_<j>.bin` (i eastwards from the bbox's west edge,
// j southwards from its north edge), zlib-compressed: the heights (see encode_heights in tools/ground_cover.py), then
// one uint8 plane per cover channel, rows north to south.
// Chunks that are all open sea are left out. Values are at cell centres.
//
// Everything here is a pure function of the position (and the data), so the generated ground is the same however
// the camera got there.

const COVER_CHANNELS = ['veg', 'tree', 'shrub', 'coast', 'rough', 'sand', 'cinder', 'built', 'cliff', 'shade']
export const COVER = Object.fromEntries(COVER_CHANNELS.map((name, i) => [name, i]))
export const COVER_COUNT = COVER_CHANNELS.length

async function inflate(buffer) {
  const bytes = new Uint8Array(buffer)
  // (Served as is, or already decompressed by the server if it sent it with Content-Encoding.)
  if (bytes[0] !== 0x78) return bytes
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export class GroundData {
  /** baseUrl: the asset's folder (e.g. '/assets/hawaii_ground'); name: the asset's name (for its credit). */
  constructor(baseUrl, name = baseUrl.split('/').pop()) {
    this.baseUrl = baseUrl
    this.name = name
    this.manifest = null
    this.chunks = new Map() // 'i_j' -> { height: Float32Array, cover: Uint8Array (cells x COVER_COUNT) } | null (sea)
    this.pending = new Map() // 'i_j' -> Promise
    this.version = 0 // bumped whenever a chunk arrives
    this.ready = fetch(`${baseUrl}/manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m || m.version !== 2) return false
        this.manifest = m
        this.cpd = m.cellsPerDegree
        this.n = m.chunkCells
        this.lonMin = m.bbox[0]
        this.latMax = m.bbox[3]
        this.cols = Math.round((m.bbox[1] - m.bbox[0]) * this.cpd / this.n)
        this.rows = Math.round((m.bbox[3] - m.bbox[2]) * this.cpd / this.n)
        this.present = new Set(m.chunks)
        // (By index, j * cols + i, for the per-sample lookups: undefined not loaded, null none or failed.)
        this.grid = new Array(this.cols * this.rows)
        this.inGrid = new Uint8Array(this.cols * this.rows)
        for (const key of m.chunks) {
          const [i, j] = key.split('_').map(Number)
          if (i < this.cols && j < this.rows) this.inGrid[j * this.cols + i] = 1
        }
        this.channelIndex = m.channels.slice(1).map((c) => COVER_CHANNELS.indexOf(c))
        this.version++
        return true
      })
      .catch(() => false)
  }

  get loaded() { return this.manifest !== null }

  /** True if (lat, lon) (degrees) is inside the region's grid. */
  covers(lat, lon) {
    if (!this.manifest) return false
    const b = this.manifest.bbox
    return lon >= b[0] && lon <= b[1] && lat >= b[2] && lat <= b[3]
  }

  // The chunk holding global cell (cx, cy): its data, null for open sea (no file), undefined if not loaded yet.
  _chunk(cx, cy) {
    const i = Math.floor(cx / this.n), j = Math.floor(cy / this.n)
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return null
    const k = j * this.cols + i
    return this.inGrid[k] ? this.grid[k] : null
  }

  /** Starts loading the chunks over a box (degrees); resolves true once they are all here. */
  request(latMin, latMax, lonMin, lonMax) {
    if (!this.manifest) return Promise.resolve(false)
    const i0 = Math.max(0, Math.floor((lonMin - this.lonMin) * this.cpd / this.n))
    const i1 = Math.min(this.cols - 1, Math.floor((lonMax - this.lonMin) * this.cpd / this.n))
    const j0 = Math.max(0, Math.floor((this.latMax - latMax) * this.cpd / this.n))
    const j1 = Math.min(this.rows - 1, Math.floor((this.latMax - latMin) * this.cpd / this.n))
    const waits = []
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const key = `${i}_${j}`
        if (!this.present.has(key) || this.chunks.has(key)) continue
        let p = this.pending.get(key)
        if (!p) {
          p = this._load(key)
          this.pending.set(key, p)
        }
        waits.push(p)
      }
    }
    return waits.length ? Promise.all(waits).then(() => true) : Promise.resolve(true)
  }

  /** True if every chunk over the box is loaded (or is open sea). */
  has(latMin, latMax, lonMin, lonMax) {
    if (!this.manifest) return false
    const i0 = Math.max(0, Math.floor((lonMin - this.lonMin) * this.cpd / this.n))
    const i1 = Math.min(this.cols - 1, Math.floor((lonMax - this.lonMin) * this.cpd / this.n))
    const j0 = Math.max(0, Math.floor((this.latMax - latMax) * this.cpd / this.n))
    const j1 = Math.min(this.rows - 1, Math.floor((this.latMax - latMin) * this.cpd / this.n))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const key = `${i}_${j}`
        if (this.present.has(key) && !this.chunks.has(key)) return false
      }
    }
    return true
  }

  async _load(key) {
    try {
      const response = await fetch(`${this.baseUrl}/chunks/${key}.bin`)
      if (!response.ok) throw new Error(`${response.status}`)
      const bytes = await inflate(await response.arrayBuffer())
      const n = this.n, cells = n * n, m = this.manifest
      // Heights: each sample less its prediction (west + north - north-west), zigzag coded, low bytes then high.
      const q = new Int32Array(cells)
      for (let k = 0; k < cells; k++) {
        const z = bytes[k] | (bytes[cells + k] << 8)
        const r = z & 1 ? -((z + 1) >> 1) : z >> 1
        const x = k % n, y = (k - x) / n
        q[k] = k === 0 ? r + (m.heightFirst ?? 0)
          : r + (x > 0 ? q[k - 1] : 0) + (y > 0 ? q[k - n] : 0) - (x > 0 && y > 0 ? q[k - n - 1] : 0)
      }
      const height = new Float32Array(cells)
      for (let k = 0; k < cells; k++) height[k] = q[k] * m.heightScale + m.heightOffset
      // Cover: interleaved per cell (COVER_COUNT bytes), in COVER_CHANNELS order.
      const cover = new Uint8Array(cells * COVER_COUNT)
      const planes = this.channelIndex
      for (let c = 0; c < planes.length; c++) {
        const to = planes[c]
        if (to < 0) continue
        const base = cells * 2 + c * cells
        for (let k = 0; k < cells; k++) cover[k * COVER_COUNT + to] = bytes[base + k]
      }
      this.chunks.set(key, { height, cover })
      this._index(key, { height, cover })
    } catch (error) {
      console.warn(`[ground] chunk ${key} failed:`, error?.message || error)
      this.chunks.set(key, null)
      this._index(key, null)
    }
    this.pending.delete(key)
    this.version++
  }

  _index(key, data) {
    const [i, j] = key.split('_').map(Number)
    this.grid[j * this.cols + i] = data
    this.onChunk?.(i, j)
  }

  // The height of global cell (cx, cy), or NaN where there is no data loaded or none at all (open sea).
  _cellHeight(cx, cy) {
    const chunk = this._chunk(cx, cy)
    if (!chunk) return NaN
    const n = this.n
    return chunk.height[(cy - Math.floor(cy / n) * n) * n + (cx - Math.floor(cx / n) * n)]
  }

  /**
   * The terrain height (m) at a geodetic latitude and longitude (degrees), bicubic (Catmull-Rom) between the cells:
   * the land's, and the sea floor's near the coast. NaN where the data is not loaded, or over open sea beyond it.
   */
  height(lat, lon) {
    const fx = (lon - this.lonMin) * this.cpd - 0.5
    const fy = (this.latMax - lat) * this.cpd - 0.5
    const x0 = Math.floor(fx), y0 = Math.floor(fy)
    const tx = fx - x0, ty = fy - y0
    const wx = catmullRom(tx, _wx), wy = catmullRom(ty, _wy)
    let sum = 0
    for (let j = 0; j < 4; j++) {
      let row = 0
      for (let i = 0; i < 4; i++) {
        const h = this._cellHeight(x0 + i - 1, y0 + j - 1)
        if (h !== h) return NaN
        row += wx[i] * h
      }
      sum += wy[j] * row
    }
    return sum
  }

  /**
   * The cover at (lat, lon) (degrees), bilinear, into out[COVER_COUNT] (0..1, except coast: signed metres from the
   * coastline, positive inland). Returns false where there is no data loaded (out is then open sea).
   */
  cover(lat, lon, out) {
    const fx = (lon - this.lonMin) * this.cpd - 0.5
    const fy = (this.latMax - lat) * this.cpd - 0.5
    const x0 = Math.floor(fx), y0 = Math.floor(fy)
    const tx = fx - x0, ty = fy - y0
    // (Fast path: all four cells in one loaded chunk.)
    const n = this.n, lx = x0 - Math.floor(x0 / n) * n, ly = y0 - Math.floor(y0 / n) * n
    if (lx < n - 1 && ly < n - 1) {
      const chunk = this._chunk(x0, y0)
      if (chunk) {
        const cv = chunk.cover, i00 = (ly * n + lx) * COVER_COUNT, i10 = i00 + COVER_COUNT, i01 = i00 + n * COVER_COUNT, i11 = i01 + COVER_COUNT
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty
        for (let c = 0; c < COVER_COUNT; c++) out[c] = cv[i00 + c] * w00 + cv[i10 + c] * w10 + cv[i01 + c] * w01 + cv[i11 + c] * w11
        for (let c = 0; c < COVER_COUNT; c++) if (c !== COVER.coast) out[c] /= 255
        out[COVER.coast] = (out[COVER.coast] - 128) * (this.manifest.coastScale ?? 2)
        return true
      }
    }
    out.fill(0)
    let ok = true
    for (let k = 0; k < 4; k++) {
      const cx = x0 + (k & 1), cy = y0 + (k >> 1)
      const w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty)
      const chunk = this._chunk(cx, cy)
      if (!chunk) {
        if (chunk === undefined) ok = false
        continue // (open sea: all zero, which for the coast is its furthest out)
      }
      const n = this.n
      const base = ((cy - Math.floor(cy / n) * n) * n + (cx - Math.floor(cx / n) * n)) * COVER_COUNT
      for (let c = 0; c < COVER_COUNT; c++) out[c] += w * chunk.cover[base + c]
    }
    for (let c = 0; c < COVER_COUNT; c++) if (c !== COVER.coast) out[c] /= 255
    out[COVER.coast] = (out[COVER.coast] - 128) * (this.manifest.coastScale ?? 2)
    return ok
  }
}

const _wx = [0, 0, 0, 0], _wy = [0, 0, 0, 0]
function catmullRom(t, w) {
  const t2 = t * t, t3 = t2 * t
  w[0] = -0.5 * t3 + t2 - 0.5 * t
  w[1] = 1.5 * t3 - 2.5 * t2 + 1
  w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t
  w[3] = 0.5 * t3 - 0.5 * t2
  return w
}

// --- The generated ground's shape -------------------------------------------------------------------------------------

// Lattice value noise in the region's plane (metres east and north of its origin), from an integer hash: the same
// on every machine (JavaScript numbers are float64, and the hash is integer arithmetic).
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y)
  let fx = x - ix, fy = y - iy
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy // 0..1
}

// The relief's octaves: wavelengths (m). Longer than these, the shape is the source terrain's (30 m posts).
const RELIEF_WAVELENGTHS = [32, 16, 8, 4, 2, 1, 0.5]

/**
 * Height (m) added to the source terrain by the generated relief at (east, north) (m, the region's plane), for the
 * ground's cover c (GroundData.cover), with only the octaves a grid of `spacing` metres can show (the rest fade in as
 * the grid gets finer, so refining a tile does not make the ground jump).
 */
export function groundRelief(east, north, c, spacing) {
  const veg = c[COVER.veg], bare = Math.max(0, 1 - veg - c[COVER.built])
  const sand = c[COVER.sand], cinder = c[COVER.cinder], rough = c[COVER.rough]
  const lava = Math.max(0, bare - sand - cinder)
  const aa = lava * rough, pahoehoe = lava * (1 - rough)
  let sum = 0
  for (let k = 0; k < RELIEF_WAVELENGTHS.length; k++) {
    const wl = RELIEF_WAVELENGTHS[k]
    const shown = smooth(2, 4, wl / spacing)
    if (shown <= 0) break
    // Amplitude of this octave for each kind of ground (m).
    const amp =
      aa * 0.55 * Math.pow(wl / 16, 0.75) +
      pahoehoe * (wl >= 8 ? 0.9 * Math.pow(wl / 16, 1.2) : 0.12 * Math.pow(wl / 8, 1.3)) +
      cinder * 0.25 * Math.pow(wl / 16, 1.0) +
      sand * 0.12 * Math.pow(wl / 16, 1.4) +
      veg * 0.3 * Math.pow(wl / 16, 1.0) +
      c[COVER.built] * 0.03
    if (amp <= 0) continue
    const f = 1 / wl
    let n = valueNoise(east * f + 0.37 * k, north * f - 0.71 * k, k + 1) - 0.5
    // A'a is a rubble of blocks: billowy (ridged upwards) at its smaller scales.
    if (wl <= 4 && aa > 0) n = n * (1 - aa) + aa * (0.5 - Math.abs(n) * 2) * 0.8
    sum += 2 * amp * shown * n
  }
  return sum
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The coast's shape: the ground's height (m) near the coastline from the source terrain's height hDem, for the cover
 * c. Beaches slope gently into the sea, low lava shores end in a bench a metre or two high, and cliffs drop straight
 * into it; on land the shape meets the source terrain again within COAST_ZONE metres of the coast, and the sea floor
 * deepens away from it. The coastline itself is the cover's (10 m imagery), not the source terrain's (30 m posts).
 */
const COAST_ZONE = 90
// spacing: the grid's vertex spacing (m), so the shape stays wider than it.
export function coastShape(hDem, c, spacing = 0) {
  const d = c[COVER.coast]
  if (d > COAST_ZONE || d < -COAST_ZONE * 2) return hDem
  const cliffH = c[COVER.cliff] * 255
  const sand = Math.min(1, c[COVER.sand] * 1.6)
  const cliff = smooth(9, 22, cliffH) * (1 - sand)
  const rock = Math.max(0, 1 - sand - cliff)
  let p
  if (d >= 0) {
    const beach = d * 0.07
    const bench = Math.min(cliffH, 1.2 + 0.04 * d + 0.6 * smooth(0, 3, d))
    // (At least three of the grid's spacings wide, or alternate vertices land at its top and its foot: a sawtooth.)
    const wall = cliffH * smooth(0, Math.max(4 + 0.08 * cliffH, 3 * spacing), d)
    p = sand * beach + rock * bench + cliff * wall
  } else {
    const ad = -d
    p = -(sand * (0.3 + ad * 0.035) + rock * (1.0 + ad * 0.08) + cliff * (3 + ad * 0.2))
    p = Math.max(p, -60)
  }
  // Back to the source terrain inland (where it rises above the beach or bench) and offshore.
  const t = d >= 0 ? smooth(COAST_ZONE * 0.45, COAST_ZONE, d) : smooth(COAST_ZONE, COAST_ZONE * 2, -d)
  let h = p + (hDem - p) * t
  if (d >= 0 && d < COAST_ZONE * 0.45) h = Math.max(h, Math.min(hDem, p)) // (no pits in the beach where the DEM dips)
  return h
}

/** Keeps the ground on the right side of sea level for which side of the coastline it is on. */
export function coastSide(h, c) {
  const d = c[COVER.coast]
  if (d > 1.5) return Math.max(h, 0.1 + Math.min(d, 20) * 0.01)
  if (d < -1.5) return Math.min(h, -0.15)
  return h
}
