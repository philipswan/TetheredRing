// The region's ground data on the GPU: its chunks (groundData.js) as layers of texture arrays, which every tile's
// look (groundDetail.js) samples directly, whatever the tile's level and whether it is generated or baked. So the
// cover, and the ground's shading slope, are the same function of position on every tile: nothing in them can change
// at a tile's edge.
//
// Two copies:
//  - coarse: every chunk under a drawn tile with a look, its cells averaged COARSE x COARSE (about 110 m), for the
//    ground further off;
//  - full: the chunks under the nearer tiles (from FULL_MIN_LOD down), at the data's own cells (about 27 m), in a
//    limited number of layers, the least recently used given up first.
// The shader blends from the full to the coarse copy by how much ground a pixel covers (GROUND_FULL_FOOTPRINT in
// groundDetail.js), which does not depend on the tile, so where the change happens is not at a tile's edge either.
// Where a pixel covers that little ground, the tiles are from FULL_MIN_LOD down, so their chunks are in the full copy.
//
// Each layer is a chunk with a border of one (of its cells) from its neighbours, filled in when they arrive, so
// filtering across a chunk's edge is the same from either side. A lookup texture says which layer of each copy holds
// each chunk (R full, G coarse; 255 none).
//
// Textures: A = (vegetation, trees, shrubs, coast), B = (roughness, sand, cinder, shade), RGBA8 as the chunks store
// them; S = the ground's slope (rise east, rise north, metres per metre), from the region's heights and the coast's
// shape at the copy's spacing, half floats (in the coarse copy, with the height itself too, for the snow).

import * as THREE from 'three'
import { COVER, COVER_COUNT, coastShape, coastSide } from './groundData.js'

const NONE = 255
export const COARSE = 4
export const FULL_MIN_LOD = 12

class LayerSet {
  // withHeight: S holds the shaped height too (RGBA: rise east, rise north, height, 0), for the snow.
  constructor(size, layers, withHeight = false) {
    this.withHeight = withHeight
    this.size = size
    this.layers = layers
    const texels = size * size * layers
    const array = (data, format, type) => {
      const t = new THREE.DataArrayTexture(data, size, size, layers)
      t.format = format
      t.type = type
      t.magFilter = THREE.LinearFilter
      t.minFilter = THREE.LinearFilter
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      t.needsUpdate = true
      return t
    }
    this.a = array(new Uint8Array(texels * 4), THREE.RGBAFormat, THREE.UnsignedByteType)
    this.b = array(new Uint8Array(texels * 4), THREE.RGBAFormat, THREE.UnsignedByteType)
    this.s = withHeight
      ? array(new Uint16Array(texels * 4), THREE.RGBAFormat, THREE.HalfFloatType)
      : array(new Uint16Array(texels * 2), THREE.RGFormat, THREE.HalfFloatType)
    this.layerOf = new Map()
    this.chunkAt = new Array(layers).fill(-1)
    this.used = new Float64Array(layers)
  }

  dispose() {
    for (const t of [this.a, this.b, this.s]) t.dispose()
  }
}

export class GroundTextures {
  constructor(ground, { fullLayers = 24 } = {}) {
    this.ground = ground
    this.fullLayers = fullLayers
    this.ready = false
    this.clock = 0
    ground.ready.then((ok) => { if (ok) this._init() })
  }

  _init() {
    const g = this.ground
    this.full = new LayerSet(g.n + 2, this.fullLayers)
    this.coarse = new LayerSet(g.n / COARSE + 2, g.cols * g.rows, true)
    this.lookupData = new Uint8Array(g.cols * g.rows * 4).fill(NONE)
    this.lookup = new THREE.DataTexture(this.lookupData, g.cols, g.rows, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.lookup.magFilter = this.lookup.minFilter = THREE.NearestFilter
    this.lookup.needsUpdate = true
    // (The shader's uniforms read these.)
    this.a = this.full.a; this.b = this.full.b; this.s = this.full.s
    this.ca = this.coarse.a; this.cb = this.coarse.b; this.cs = this.coarse.s
    this.ready = true
    // A chunk that arrives fills its layers, and its neighbours' borders.
    g.onChunk = (i, j) => {
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const k = (j + dj) * g.cols + (i + di)
          if (this.full.layerOf.has(k)) this._fill(this.full, k, 1)
          if (this.coarse.layerOf.has(k)) this._fill(this.coarse, k, COARSE)
        }
      }
    }
  }

  /**
   * Makes the chunks over a box (degrees) resident: in the coarse copy, and in the full one too if `full` (loading
   * their data first if needed).
   */
  need(latMin, latMax, lonMin, lonMax, full) {
    if (!this.ready) return
    const g = this.ground, c = g.cpd / g.n
    const i0 = Math.max(0, Math.floor((lonMin - g.lonMin) * c)), i1 = Math.min(g.cols - 1, Math.floor((lonMax - g.lonMin) * c))
    const j0 = Math.max(0, Math.floor((g.latMax - latMax) * c)), j1 = Math.min(g.rows - 1, Math.floor((g.latMax - latMin) * c))
    let missing = false
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * g.cols + i
        if (!g.inGrid[k]) continue
        if (g.grid[k] === undefined) { missing = true; continue }
        this._use(this.coarse, k, COARSE, 1)
        if (full) this._use(this.full, k, 1, 0)
      }
    }
    if (missing) g.request(latMin, latMax, lonMin, lonMax)
  }

  /** Call once a frame, before the frame's need() calls. */
  tick() { this.clock++ }

  _use(set, k, factor, channel) {
    let layer = set.layerOf.get(k)
    if (layer === undefined) {
      layer = 0
      for (let l = 1; l < set.layers; l++) if (set.used[l] < set.used[layer]) layer = l
      // (Never one already used this frame: there are too few layers for what is in view, so this chunk waits.)
      if (set.used[layer] === this.clock && set.chunkAt[layer] >= 0) return
      const old = set.chunkAt[layer]
      if (old >= 0) {
        set.layerOf.delete(old)
        this._setLookup(old, channel, NONE)
      }
      set.chunkAt[layer] = k
      set.layerOf.set(k, layer)
      this._setLookup(k, channel, layer)
      this._fill(set, k, factor)
    }
    set.used[layer] = this.clock
  }

  _setLookup(k, channel, layer) {
    this.lookupData[k * 4 + channel] = layer
    this.lookup.needsUpdate = true
  }

  // Fills chunk k's layer in a copy whose cells are `factor` of the data's across: its cells (each the mean of the
  // data's), a border of one from its neighbours (this chunk's edge where they are not here), and each one's slope.
  _fill(set, k, factor) {
    const g = this.ground, n = g.n, m = n / factor, size = set.size, layer = set.layerOf.get(k)
    const i = k % g.cols, j = (k - i) / g.cols
    const A = set.a.image.data, B = set.b.image.data, S = set.s.image.data
    const base = layer * size * size
    const sum = new Float32Array(8), cover = new Float32Array(COVER_COUNT)
    // One of this copy's cells (x, y: from -2 to m + 1, relative to the chunk's first): its raw cover bytes (mean of
    // the data's), and its height shaped by the coast, from the chunk holding it, or this one's nearest where that is
    // not here.
    const cellAt = (x, y, wantBytes) => {
      sum.fill(0)
      let h = 0, count = 0
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          let cx = i * n + x * factor + dx, cy = j * n + y * factor + dy
          let chunk = g._chunk(cx, cy)
          if (!chunk) {
            cx = Math.min(Math.max(cx, i * n), i * n + n - 1)
            cy = Math.min(Math.max(cy, j * n), j * n + n - 1)
            chunk = g._chunk(cx, cy)
            if (!chunk) continue
          }
          const li = (cy - Math.floor(cy / n) * n) * n + (cx - Math.floor(cx / n) * n), v = chunk.cover, o = li * COVER_COUNT
          if (wantBytes) {
            sum[0] += v[o + COVER.veg]; sum[1] += v[o + COVER.tree]; sum[2] += v[o + COVER.shrub]; sum[3] += v[o + COVER.coast]
            sum[4] += v[o + COVER.rough]; sum[5] += v[o + COVER.sand]; sum[6] += v[o + COVER.cinder]; sum[7] += v[o + COVER.shade]
          }
          for (let c = 0; c < COVER_COUNT; c++) cover[c] += v[o + c]
          h += chunk.height[li]
          count++
        }
      }
      if (!count) return 0
      for (let c = 0; c < COVER_COUNT; c++) cover[c] /= count * 255
      cover[COVER.coast] = (cover[COVER.coast] * 255 - 128) * (g.manifest.coastScale ?? 2)
      if (wantBytes) for (let c = 0; c < 8; c++) sum[c] /= count
      return coastSide(coastShape(h / count, cover, factor * 110600 / g.cpd), cover)
    }
    const W = size + 2, H = new Float32Array(W * W)
    for (let y = -2; y <= m + 1; y++) {
      for (let x = -2; x <= m + 1; x++) {
        const inLayer = x >= -1 && y >= -1 && x <= m && y <= m
        cover.fill(0)
        H[(y + 2) * W + (x + 2)] = cellAt(x, y, inLayer)
        if (!inLayer) continue
        const t = base + (y + 1) * size + (x + 1)
        for (let c = 0; c < 4; c++) { A[t * 4 + c] = Math.round(sum[c]); B[t * 4 + c] = Math.round(sum[4 + c]) }
      }
    }
    const toHalf = THREE.DataUtils.toHalfFloat
    for (let y = -1; y <= m; y++) {
      const lat = g.latMax - (j * n + (y + 0.5) * factor) / g.cpd
      const dx = factor * 111320 * Math.cos(lat * Math.PI / 180) / g.cpd
      const dy = factor * (110574 + 1110 * Math.sin(lat * Math.PI / 180) ** 2) / g.cpd
      for (let x = -1; x <= m; x++) {
        const p = (y + 2) * W + (x + 2)
        const t = base + (y + 1) * size + (x + 1), c = set.withHeight ? 4 : 2
        S[t * c] = toHalf((H[p + 1] - H[p - 1]) / (2 * dx))
        S[t * c + 1] = toHalf((H[p - W] - H[p + W]) / (2 * dy))
        if (set.withHeight) { S[t * c + 2] = toHalf(H[p]); S[t * c + 3] = toHalf(0) }
      }
    }
    for (const t of [set.a, set.b, set.s]) {
      t.addLayerUpdate(layer)
      t.needsUpdate = true
    }
  }

  dispose() {
    this.full?.dispose()
    this.coarse?.dispose()
    this.lookup?.dispose()
  }
}
