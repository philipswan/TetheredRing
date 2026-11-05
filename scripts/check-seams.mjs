// Seam check for the generated ground: runs the planet renderer's own tile selection and geometry (no GPU: colour
// tiles are not loaded, heights are read from assets/ on disk) for a sweep of camera positions over a region with
// generated ground, and after each one checks every edge of every drawn tile (CubedSpherePlanetRenderer.measureSeams):
// the gap between it and the drawn tile across it, and whether there is one at all where the edge is on screen. Edges
// with a generated tile on either side must meet to within the tolerance (generated with generated, and with the baked
// tiles), whatever the levels on each side. Exits non-zero on any failure, listing them.
//
// The sweep: the camera at points every --step metres along the region's coastline and over a grid across the region,
// at each of several heights above the ground and several headings, looking a little below the horizon; and descents
// from high up to the ground along the coast, step by step, so tiles refine and coarsen through their levels as the
// camera moves (the selection has hysteresis, so the state depends on the path).
//
//   POSIX:      node scripts/check-seams.mjs [--region hawaii_ground] [--step 3000] [--quick] [--tolerance 0.001]
//   PowerShell: node scripts\check-seams.mjs [--region hawaii_ground] [--step 3000] [--quick]
import '../tests/support/rawImports.mjs'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback }
const quick = process.argv.includes('--quick')
const region = arg('region', 'hawaii_ground')
const step = Number(arg('step', quick ? 12000 : 3000))
const tolerance = Number(arg('tolerance', 0.001))
const limit = Number(arg('limit', Infinity))

// Files under the repository served as fetch() would serve them from the dev server.
globalThis.fetch = async (url) => {
  const file = path.join(root, decodeURIComponent(String(url).replace(/^\/+/, '').split('?')[0]))
  try {
    const data = await fs.promises.readFile(file)
    return new Response(data, { status: 200 })
  } catch {
    return new Response('', { status: 404 })
  }
}

const THREE = await import('three')
const { CubedSpherePlanetRenderer } = await import('../src/planet/CubedSpherePlanetRenderer.js')
const { GroundData, COVER, COVER_COUNT } = await import('../src/planet/groundData.js')
const { PixelLOD } = await import('../src/scene/PixelLOD.js')
PixelLOD.buildBudget = Infinity // (everything that has loaded is built at once)

// No colour tiles (no GPU to decode them): a tile is drawn with its flat fallback colour, which has no bearing on
// its shape.
CubedSpherePlanetRenderer._sharedLoader = { loadAsync: async () => { throw new Error('no colour in the seam check') } }
CubedSpherePlanetRenderer._supportDetected = true

const ellipsoid = { a: 6378137, f: 1 / 298.257223563 }
const asset = (name) => ({ name, manifestUrl: `/assets/${name}/manifest.json`, colorBasePath: `/assets/${name}/color`, heightBasePath: `/assets/${name}/height` })
const baseTiles = fs.existsSync(path.join(root, 'assets/earth_hires/manifest.json')) ? 'earth_hires' : 'earth'
const ground = new GroundData(`/assets/${region}`)
const lod = new CubedSpherePlanetRenderer({
  group: new THREE.Group(),
  planetSpec: { ellipsoid },
  assets: [asset(baseTiles), asset('hawaii')],
  water: true,
  requireKtx2: true,
  tileSegments: 24,
  maxCachedTiles: 3000,
  maxTileGpuBytes: 4e9,
  maxConcurrentTileLoads: 32,
  groundData: [ground],
  renderer: { getDrawingBufferSize: (v) => v.set(1920, 1080) },
})
if (!(await ground.ready)) { console.log(`No ground data at assets/${region}.`); process.exit(1) }
await lod.manifestLoaded

// A geodetic position in the renderer's frame (X = ECEF x, Y = ECEF z, Z = -ECEF y; see latLonToDirection).
const e2 = ellipsoid.f * (2 - ellipsoid.f)
const toFrame = (lat, lon, h) => {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180
  const n = ellipsoid.a / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  return new THREE.Vector3((n + h) * Math.cos(p) * Math.cos(l), (n * (1 - e2) + h) * Math.sin(p), -(n + h) * Math.cos(p) * Math.sin(l))
}
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 1e8)
const place = (lat, lon, height, heading, pitch = -12) => {
  const p = toFrame(lat, lon, height)
  const up = toFrame(lat, lon, height + 1).sub(p).normalize()
  const north = toFrame(lat + 1e-4, lon, height).sub(p).normalize()
  const east = new THREE.Vector3().crossVectors(north, up).normalize()
  const h = THREE.MathUtils.degToRad(heading), t = THREE.MathUtils.degToRad(pitch)
  const look = north.clone().multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h)).multiplyScalar(Math.cos(t)).addScaledVector(up, Math.sin(t))
  camera.position.copy(p)
  camera.up.copy(up)
  camera.lookAt(p.clone().add(look))
  camera.updateMatrixWorld(true)
}
const groundHeight = (lat, lon) => {
  const h = ground.height(lat, lon)
  return h === h ? Math.max(0, h) : 0
}
const tick = () => new Promise((r) => setImmediate(r))

// Settles the selection for the current camera: update until nothing is wanted, loading or waiting to be built.
async function settle() {
  for (let i = 0; i < 400; i++) {
    lod.update(camera)
    await tick()
    const s = lod.debugStats
    const pending = lod._uploadQueue.length || lod.inflightLoads || [...lod.tiles.values()].some((t) => t.loading)
    if (i > 2 && !s.queue && !pending) {
      lod.update(camera) // (and once more, so the edges see the final neighbours)
      return true
    }
    if (pending) await new Promise((r) => setTimeout(r, 2))
  }
  return false
}

// The poses: points along the coastline and over a grid, at heights and headings.
const m = ground.manifest
const coast = []
{
  const c = new Float32Array(COVER_COUNT), [lonMin, lonMax, latMin, latMax] = m.bbox
  const dLat = 250 / 111000
  for (let lat = latMin; lat <= latMax; lat += dLat) {
    const dLon = dLat / Math.cos(lat * Math.PI / 180)
    await ground.request(lat, lat + dLat, lonMin, lonMax)
    let prev = null
    for (let lon = lonMin; lon <= lonMax; lon += dLon) {
      if (!ground.cover(lat, lon, c)) continue
      const land = c[COVER.coast] > 0
      if (prev !== null && land !== prev) coast.push([lat, lon])
      prev = land
    }
  }
}
// Thin the coast points to about one every `step` metres.
const thin = []
for (const p of coast) {
  if (!thin.some((q) => Math.hypot((p[0] - q[0]) * 111000, (p[1] - q[1]) * 104000) < step)) thin.push(p)
}
const grid = []
{
  const [lonMin, lonMax, latMin, latMax] = m.bbox
  for (let lat = latMin + 0.05; lat < latMax; lat += step / 111000 * 2) {
    for (let lon = lonMin + 0.05; lon < lonMax; lon += step / 104000 * 2) {
      await ground.request(lat - 0.001, lat + 0.001, lon - 0.001, lon + 0.001)
      const c = new Float32Array(COVER_COUNT)
      if (ground.cover(lat, lon, c) && c[COVER.coast] > -2000) grid.push([lat, lon])
    }
  }
}
const heights = quick ? [2, 150, 1500] : [2, 20, 150, 600, 2500]
const headings = quick ? [0, 180] : [0, 90, 180, 270]
const poses = []
for (const [lat, lon] of [...thin, ...grid]) {
  for (const h of heights) for (const heading of headings) poses.push({ lat, lon, h, heading })
}
// Descents along the coast: from 4 km to 2 m, in steps, with the camera moving along the coast as it comes down.
const descents = []
for (let i = 0; i < thin.length; i += quick ? 8 : 2) {
  const [lat, lon] = thin[i], [lat2, lon2] = thin[Math.min(thin.length - 1, i + 1)]
  const path = []
  for (let k = 0; k <= 24; k++) {
    const f = k / 24
    path.push({ lat: lat + (lat2 - lat) * f * 0.3, lon: lon + (lon2 - lon) * f * 0.3, h: 4000 * Math.pow(0.0005, f), heading: (i * 37) % 360 })
  }
  descents.push(path)
}

console.log(`${thin.length} coast points, ${grid.length} grid points: ${poses.length} poses and ${descents.length} descents of 25 steps`)
const failures = []
let checked = 0, edges = 0, generatedEdges = 0, worst = 0, worstAll = 0
async function check(pose, label) {
  place(pose.lat, pose.lon, groundHeight(pose.lat, pose.lon) + pose.h, pose.heading)
  if (!(await settle())) failures.push({ label, pose, reason: 'did not settle' })
  const s = lod.measureSeams(camera)
  if (process.env.SEAM_DEBUG) {
    const h = {}
    for (const t of lod.visibleList) { const k = t.lod + (t.ground ? 'g' : ''); h[k] = (h[k] ?? 0) + 1 }
    const d = lod.debugStats
    console.log(label, JSON.stringify(pose), JSON.stringify(h), 'tiles', lod.tiles.size,
      JSON.stringify({ started: d.loadStarted, ok: d.loadSucceeded, failed: d.loadFailed, retries: d.loadRetries, dropped: d.droppedLoads, queue: d.queue }))
    for (const t of lod.visibleList.slice(0, 3)) {
      lod._refreshTileCache(t)
      const dist = t.center.distanceTo(lod._camLocal)
      console.log('   ', t.id, 'ready', t.ready, 'hasChildAssets', t.hasChildAssets, 'dist km', (dist / 1000).toFixed(0), 'err', lod._tileGeometricError(t).toFixed(0),
        'sseScale', lod._sseScale.toFixed(0), 'refine', lod._shouldRefine(t), 'children', t.children?.map((c) => c && `${c.id}:${c.ready}`).join(' '))
    }
  }
  for (const id of inspect) {
    const t = [...lod.tiles.values()].find((x) => x.id === id)
    if (!t) { console.log(id, 'not loaded'); continue }
    console.log(id, { visible: t.visibleFrame === lod.frame, ready: t.ready, ground: !!t.ground, steps: t.edgeSteps,
      neighbors: t.edgeNeighbors.map((n) => n?.id ?? null), colorTile: t.colorTile?.id, refHeight: t.refHeight?.toFixed(1),
      grid: t.heightGrid ? [Math.min(...t.heightGrid), Math.max(...t.heightGrid)].map((x) => +x.toFixed(1)) : null })
  }
  checked++
  edges += s.edges
  generatedEdges += s.generated.edges
  worst = Math.max(worst, s.generated.maxGap)
  worstAll = Math.max(worstAll, s.maxGap)
  const bad = s.worst.filter((w) => w.gap > tolerance || w.uncovered)
  if (bad.length) failures.push({ label, pose, bad: bad.slice(0, 4), count: bad.length })
}
// --write-views file: write the sweep's camera positions as views (the view status's format, for the visual seam
// check, scripts/check-visual-seams.mjs) and stop. --every n: only every nth.
const writeViews = arg('write-views', null)
if (writeViews) {
  const every = Number(arg('every', 1)), out = []
  const scene = (v) => [-v.z, v.y, v.x] // (renderer frame to the app's: X = ECEF y, Y = ECEF z, Z = ECEF x)
  const all = [...poses, ...descents.flat()]
  for (let k = 0; k < all.length; k += every) {
    const pose = all[k]
    place(pose.lat, pose.lon, groundHeight(pose.lat, pose.lon) + pose.h, pose.heading)
    const dirv = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const target = camera.position.clone().addScaledVector(dirv, 1000)
    const r = (v) => scene(v).map((x) => +x.toFixed(3))
    out.push({ name: `p${k}`, pose, view: { preset: 'bigIslandLauncher', time: 10, sunDayOfYear: 35, sunTimeOfDayUTC: 20.4,
      camera: { position: r(camera.position), target: r(target), up: r(camera.up), orbitUp: r(camera.up), fov: 50, ...(pose.h < 200 ? { eyeAboveGround: pose.h } : {}) },
      parameters: { sunDayOfYear: 35, sunTimeOfDayUTC: 20.4 }, cloudType: { low: [0, 0, 0, 1800, 2400], rain: 0, humidity: 0.5 } } })
  }
  fs.writeFileSync(writeViews, JSON.stringify(out, null, 1))
  console.log(`Wrote ${out.length} views to ${writeViews}`)
  process.exit(0)
}

// --pose lat,lon,h,heading: check that one pose only; --inspect id,id: and print those tiles' edges.
const onePose = arg('pose', null)
if (onePose) {
  const [lat, lon, h, heading] = onePose.split(',').map(Number)
  poses.length = 0
  poses.push({ lat, lon, h, heading })
  descents.length = 0
}
const inspect = arg('inspect', null)?.split(',') ?? []
// SEAM_TIMING=1: how long the generated tiles took to build, by level.
const timing = {}
if (process.env.SEAM_TIMING) {
  for (const name of ['_buildGroundHeights', '_buildGroundCover', '_buildGroundNormals', '_buildTileGeometry']) {
    const f = lod[name]
    lod[name] = function (tile, ...rest) {
      const t0 = performance.now(), r = f.call(this, tile, ...rest), k = `${name} ${tile.lod}`
      ;(timing[k] ??= []).push(performance.now() - t0)
      return r
    }
  }
}
const started = Date.now()
for (const [k, pose] of poses.entries()) {
  if (k >= limit) break
  await check(pose, `pose ${k}`)
  if (k % 50 === 0) console.log(`  ${k}/${poses.length}  (${((Date.now() - started) / 1000).toFixed(0)} s, ${failures.length} failing)`)
}
for (const [k, path] of descents.entries()) {
  if (k >= limit) break
  for (const [j, pose] of path.entries()) await check(pose, `descent ${k} step ${j}`)
}
if (process.env.SEAM_TIMING) {
  for (const [k, v] of Object.entries(timing).sort()) {
    v.sort((a, b) => a - b)
    console.log(`  ${k.padEnd(28)} n ${String(v.length).padStart(5)}  median ${v[v.length >> 1].toFixed(1)} ms  p90 ${v[Math.floor(v.length * 0.9)].toFixed(1)} ms`)
  }
}
console.log(`Checked ${checked} camera positions: ${edges} edges drawn, ${generatedEdges} with generated ground, largest gap there ${worst.toFixed(4)} m (${worstAll.toFixed(4)} m over all edges).`)
if (failures.length) {
  console.log(`${failures.length} positions with seams (gap over ${tolerance} m, or an edge on screen with nothing beyond it):`)
  for (const f of failures.slice(0, 40)) console.log(JSON.stringify(f))
  process.exit(1)
}
console.log('No seams.')
process.exit(0)
