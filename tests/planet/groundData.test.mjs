import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { COVER, COVER_COUNT, GroundData, coastShape, coastSide, groundRelief } from '../../src/planet/groundData.js'

// A chunk as tools/ground_cover.py writes it (encode_heights, then one byte plane per channel).
function encodeChunk(heights, planes, n, { heightOffset, heightScale, heightFirst }) {
  const h = heights.map((v) => Math.round((v - heightOffset) / heightScale))
  const z = new Uint8Array(n * n * 2)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = y * n + x
      let r
      if (k === 0) r = h[0] - heightFirst
      else if (y === 0) r = h[k] - h[k - 1]
      else if (x === 0) r = h[k] - h[k - n]
      else r = h[k] - h[k - 1] - h[k - n] + h[k - n - 1]
      const zz = r >= 0 ? 2 * r : -2 * r - 1
      z[k] = zz & 255
      z[n * n + k] = zz >> 8
    }
  }
  return deflateSync(Buffer.concat([Buffer.from(z), ...planes.map((p) => Buffer.from(p))]))
}

function fakeRegion() {
  const n = 6
  const manifest = {
    version: 2, bbox: [10, 10.003, 20, 20.003], cellsPerDegree: 2000, chunkCells: n,
    channels: ['height', 'veg', 'tree', 'shrub', 'coast', 'rough', 'sand', 'cinder', 'built', 'cliff', 'shade'],
    heightOffset: -6000, heightScale: 0.2, heightFirst: 32768, coastScale: 2, chunks: ['0_0'],
  }
  const heights = Array.from({ length: n * n }, (_, k) => 100 + 10 * (k % n) - 7.5 * Math.floor(k / n))
  const planes = manifest.channels.slice(1).map((c, i) => new Uint8Array(n * n).fill(c === 'coast' ? 178 : 10 * i))
  const chunk = encodeChunk(heights, planes, n, manifest)
  globalThis.fetch = async (url) => {
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest))
    if (url.endsWith('chunks/0_0.bin')) return new Response(chunk)
    return new Response('', { status: 404 })
  }
  return { manifest, heights, n }
}

test('ground data chunks decode to the baked heights and cover', async () => {
  const { heights, n } = fakeRegion()
  const g = new GroundData('/assets/fake')
  assert.equal(await g.ready, true)
  // Cell centres are at (x + 0.5) / cellsPerDegree east of the west edge, rows from the north edge.
  const lat = (y) => 20.003 - (y + 0.5) / 2000, lon = (x) => 10 + (x + 0.5) / 2000
  assert.ok(Number.isNaN(g.height(lat(1), lon(1))), 'not loaded yet')
  await g.request(20, 20.003, 10, 10.003)
  // (Bicubic: the cells two from the chunk's edge, which is open sea, with no heights.)
  assert.ok(Number.isNaN(g.height(lat(0), lon(0))))
  for (const [x, y] of [[2, 2], [3, 2], [2, 3]]) {
    assert.ok(Math.abs(g.height(lat(y), lon(x)) - heights[y * n + x]) < 0.101, `cell ${x},${y}`)
  }
  const c = new Float32Array(COVER_COUNT)
  assert.equal(g.cover(lat(1), lon(1), c), true)
  assert.ok(Math.abs(c[COVER.coast] - (178 - 128) * 2) < 1e-4) // metres inland
  assert.ok(Math.abs(c[COVER.tree] - 10 / 255) < 1e-6)
})

test('the coast keeps land above and sea below sea level', () => {
  const c = new Float32Array(COVER_COUNT)
  for (const [cliff, sand] of [[0, 1], [3 / 255, 0], [60 / 255, 0]]) {
    c[COVER.cliff] = cliff
    c[COVER.sand] = sand
    for (const d of [-150, -40, -5, 5, 20, 60]) {
      c[COVER.coast] = d
      const h = coastSide(coastShape(d > 0 ? 3 : -8, c) + groundRelief(d * 7, d * 3, c, 0.5), c)
      assert.ok(d > 0 ? h > 0 : h < 0, `cliff ${cliff * 255} m, sand ${sand}, ${d} m from the coast: ${h}`)
    }
  }
  // A cliff rises to its height within a few metres of the sea.
  c[COVER.cliff] = 60 / 255
  c[COVER.sand] = 0
  c[COVER.coast] = 12
  assert.ok(coastShape(55, c) > 50)
})

test('generated relief is a pure function of position, and absent on coarse grids', () => {
  const c = new Float32Array(COVER_COUNT)
  c[COVER.rough] = 1
  const a = groundRelief(12345.6, -987.6, c, 0.4)
  assert.equal(groundRelief(12345.6, -987.6, c, 0.4), a)
  assert.ok(Math.abs(a) > 0)
  assert.equal(groundRelief(12345.6, -987.6, c, 100), 0) // (no octave a 100 m grid can show)
})
