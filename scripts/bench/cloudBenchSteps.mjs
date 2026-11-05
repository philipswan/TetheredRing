/* global window, document, Image, requestAnimationFrame -- (the functions passed to page.evaluate run in the page) */
// The steps of scripts/bench-clouds.mjs, run in the page by scripts/smoke.mjs (see there): for each view,
// restore it, wait for everything to load, time the cloud pass and the frame, screenshot the canvas and
// compare it with the baseline's.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export default async function ({ page }) {
  const views = JSON.parse(process.env.BENCH_VIEWS)
  const out = process.env.BENCH_OUT, baseline = process.env.BENCH_BASELINE, frames = Number(process.env.BENCH_FRAMES)
  // Only the canvas in the screenshots.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important } .bench-canvas { visibility: visible !important }' })
  // (And no logo: it is drawn in the scene, and turns by the wall clock.)
  await page.evaluate(() => {
    const app = window.tetheredRing.app
    app.renderer.domElement.classList.add('bench-canvas')
    app.store.set('showLogo', false)
    app.applyAllParameters()
  })
  // A fixed quality (BENCH_QUALITY, default high): in Auto the render resolution follows the frame time, so
  // it would depend on how loaded the GPU is and on the views measured before.
  await page.evaluate((mode) => window.tetheredRing.app.quality.setMode(mode), process.env.BENCH_QUALITY || 'high')
  // BENCH_SKY_LUT=0: the sky marched at every pixel rather than read from its table (Planet.setSkyLut).
  if (process.env.BENCH_SKY_LUT === '0') await page.evaluate(() => window.tetheredRing.app.planet.setSkyLut(false))
  // BENCH_SEA_LITE=0|1 and BENCH_HAZE_LUT=0|1: the sea's lighter shader and the haze from a table from above (Planet.setSeaLite,
  // Planet.setGroundHazeLut), whatever the quality.
  if (process.env.BENCH_SEA_LITE) await page.evaluate((on) => window.tetheredRing.app.planet.setSeaLite(on), process.env.BENCH_SEA_LITE === '1')
  if (process.env.BENCH_HAZE_LUT) await page.evaluate((on) => window.tetheredRing.app.planet.setGroundHazeLut(on), process.env.BENCH_HAZE_LUT === '1')
  // BENCH_HAZE_VOLUME=0|1: the haze from above from its table down to the ground (Planet.setHazeVolume); BENCH_HAZE_HIGH_SAMPLES=n:
  // the samples it is marched in from above otherwise (a reference, with many).
  if (process.env.BENCH_HAZE_VOLUME) await page.evaluate((on) => window.tetheredRing.app.planet.setHazeVolume(on), process.env.BENCH_HAZE_VOLUME === '1')
  if (process.env.BENCH_HAZE_HIGH_SAMPLES) await page.evaluate(async (n) => (await import('/src/planet/aerialPerspective.js')).AerialPerspective.setHighSamples(n), Number(process.env.BENCH_HAZE_HIGH_SAMPLES))
  // BENCH_HAZE_SAMPLES=n: the haze's samples (aerialPerspective.js), whatever the quality.
  if (process.env.BENCH_HAZE_SAMPLES) await page.evaluate(async (n) => (await import('/src/planet/aerialPerspective.js')).AerialPerspective.setLowSamples(n), Number(process.env.BENCH_HAZE_SAMPLES))
  // BENCH_CLOUD_DEFINES=A,B: the clouds' optional shader parts (Clouds.setFeatures).
  if (process.env.BENCH_CLOUD_DEFINES) await page.evaluate((d) => window.tetheredRing.app.clouds?.setFeatures(d.split(',')), process.env.BENCH_CLOUD_DEFINES)
  // BENCH_PLANET_DEBUG=tileBorders|lod|ground|...: the planet's tiles drawn in a debug mode, without the sea surface
  // (noWater: just without the sea surface).
  if (process.env.BENCH_PLANET_DEBUG) {
    await page.evaluate((mode) => {
      const lod = window.tetheredRing.app.planet.lod
      if (mode !== 'noWater') lod.setDebugMode(mode)
      lod.setWaterVisible(false)
    }, process.env.BENCH_PLANET_DEBUG)
  }
  const gpu = await page.evaluate(() => {
    const gl = window.tetheredRing.app.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info')
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  for (const { name, view } of views) {
    // BENCH_PASSES=1: also the GPU time of each pass (see below).
    const timing = await page.evaluate(async (view, frames, passesWanted, probe) => {
      const app = window.tetheredRing.app, gl = app.renderer.getContext()
      const frame = () => new Promise(r => requestAnimationFrame(r))
      const { applyViewState } = await import('/src/ui/ViewStatus.js')
      // (view.cloudType: the sky filled with one cloud type, Clouds.setCloudTypeTest.)
      app.clouds?.setCloudTypeTest?.(view.cloudType ?? null)
      applyViewState(app, view)
      // Loaded: the planet's tiles, the real clouds, and a few quiet frames.
      const settle = async () => {
        for (let i = 0; i < 1200; i++) {
          await frame()
          const s = app.planet.getDebugStats()
          const real = app.clouds?.realClouds
          if (i > 60 && !s.queue && !s.inflight && (!real || (real.ready && !real.loading))) break
        }
      }
      await settle()
      // (view.camera.eyeAboveGround: the camera that many metres above the terrain as drawn, found by a ray down
      // through it once loaded, and again after the closer tiles that brings in have loaded.)
      const eye = view.camera?.eyeAboveGround
      if (eye) {
        const THREE = await window.tetheredRing.THREE
        for (let pass = 0; pass < 4; pass++) {
          const state = app.camera.getState()
          const pos = new THREE.Vector3().fromArray(state.position)
          const centre = app.planetCoordSys.getWorldPosition(new THREE.Vector3())
          const up = pos.clone().sub(centre).normalize()
          const ray = new THREE.Raycaster(pos.clone().addScaledVector(up, 20000), up.clone().negate(), 0, 60000)
          const hit = app.planet.raycast(ray)[0]
          if (!hit) break
          const next = hit.point.clone().addScaledVector(up, eye)
          if (next.distanceTo(pos) < 0.05) break
          const shift = next.clone().sub(pos)
          app.camera.setState({ ...state, position: next.toArray(), target: new THREE.Vector3().fromArray(state.target).add(shift).toArray() })
          await settle()
        }
      }
      for (let i = 0; i < 20; i++) await frame()
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
      if (!ext) return { error: 'no EXT_disjoint_timer_query_webgl2' }
      const timed = (target, key) => {
        const original = target[key], queries = []
        target[key] = function (...args) {
          const q = gl.createQuery()
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
          const result = original.apply(this, args)
          gl.endQuery(ext.TIME_ELAPSED_EXT)
          queries.push(q)
          return result
        }
        return { queries, restore: () => { target[key] = original } }
      }
      // (Timer queries cannot nest: the clouds are timed over `frames` frames, then the whole frame.)
      const summary = async (target, key) => {
        const t = timed(target, key)
        for (let i = 0; i < frames; i++) await frame()
        t.restore()
        await new Promise(r => setTimeout(r, 300))
        const ms = t.queries.map(q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : NaN).filter(x => !isNaN(x)).sort((x, y) => x - y)
        return { median: ms[ms.length >> 1] ?? NaN, p90: ms[Math.floor(ms.length * 0.9)] ?? NaN, n: ms.length }
      }
      const clouds = app.clouds ? await summary(app.clouds, 'render') : { median: 0, p90: 0, n: 0 }
      const frameTime = await summary(app, 'render')
      // Each of the renderer's passes on its own (the sky, the scene, the clouds' three, ...): every
      // renderer.render call timed, by what it draws. (Calls do not nest, so neither do the queries.)
      const passes = {}
      if (passesWanted) {
        const renderer = app.renderer, original = renderer.render, pending = []
        const label = (scene) => scene === app.scene ? (scene.overrideMaterial ? 'cloudDistance' : 'scene')
          : scene === app.clouds?.marchScene ? 'cloudMarch' : scene === app.clouds?.compositeScene ? 'cloudComposite'
            : scene.name || scene.children[0]?.name || scene.children[0]?.material?.type || 'other'
        renderer.render = function (scene, camera) {
          const q = gl.createQuery()
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
          original.call(this, scene, camera)
          gl.endQuery(ext.TIME_ELAPSED_EXT)
          pending.push([label(scene), q])
        }
        for (let i = 0; i < frames; i++) await frame()
        renderer.render = original
        await new Promise(r => setTimeout(r, 300))
        const sums = {}
        for (const [name, q] of pending) {
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue
          ;(sums[name] ??= []).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
        }
        // (Per frame: a pass drawn several times a frame is summed.)
        for (const [name, v] of Object.entries(sums)) passes[name] = +(v.reduce((s, x) => s + x, 0) / frames).toFixed(2)
      }
      // What the frame depended on, to tell a change in the code from a change in the state (a view should
      // look the same whichever views came before it).
      const u = app.clouds?.uniforms
      const round = (v) => Array.from(v.toArray ? v.toArray() : v, (x) => +x.toFixed(5))
      const state = {
        time: app.clock.time,
        drift: u && round(u.drift.value),
        realDate: app.clouds?.realClouds.textureDate,
        weather: app.clouds?.weatherMap.date,
        sun: u?.slSun && [u.slSun.value.x, u.slSun.value.y, u.slSun.value.z].map((x) => +x.toFixed(5)),
        exposure: u && round(u.exposure.value),
        buffer: `${app.renderer.domElement.width}x${app.renderer.domElement.height}`,
        tiles: (() => { const s = app.planet.getDebugStats(); return { visible: s.visibleTiles, loaded: s.loadedTiles } })(),
        lods: (() => { const h = {}; for (const t of app.planet.lod.visibleList ?? []) { const k = t.lod + (t.ground ? 'g' : ''); h[k] = (h[k] ?? 0) + 1 } return h })(),
        // BENCH_PROBE=x,y (pixels from the top left, of 1280 x 720): the planet tile and sea surface under that pixel.
        probe: await (async () => {
          if (!probe) return undefined
          const THREE = await window.tetheredRing.THREE
          const [px, py] = probe.split(',').map(Number)
          const ray = new THREE.Raycaster()
          ray.setFromCamera(new THREE.Vector2(px / 640 - 1, 1 - py / 360), app.camera3d)
          const lod = app.planet.lod, out = []
          for (const tile of lod.visibleList) {
            for (const m of [tile.mesh, tile.waterMesh, tile.waterUnderside]) {
              if (!m) continue
              m.updateWorldMatrix(true, false)
              const hits = []
              const side = m.material.side
              m.material.side = THREE.DoubleSide
              m.raycast(ray, hits)
              m.material.side = side
              if (hits.length) {
                const f = hits[0].face, n = f.normal.clone().transformDirection(m.matrixWorld)
                const local = hits[0].point.clone().applyMatrix4(lod.group.matrixWorld.clone().invert())
                const ll = lod._latLon(local.clone().normalize(), {})
                out.push({ tile: tile.id, ground: !!tile.ground, mesh: m.name, dist: +hits[0].distance.toFixed(1),
                  lat: +ll.lat.toFixed(6), lon: +ll.lon.toFixed(6),
                  facing: +n.dot(ray.ray.direction).toFixed(3), visible: m.visible, map: !!m.material.map,
                  seaFar: tile.seaFar, color: m.material.color?.getHexString(), colorTile: tile.colorTile?.id,
                  hasWater: !!tile.waterMesh, waterGeometry: !!tile.mesh?.geometry?.userData.waterGeometry,
                  grid: tile.heightGrid ? [Math.min(...tile.heightGrid), Math.max(...tile.heightGrid)].map((x) => +x.toFixed(1)) : null,
                  loaded: tile.loaded, ready: tile.ready, edgeSteps: tile.edgeSteps,
                  water: (() => {
                    const w = tile.waterMesh
                    if (!w || m !== tile.mesh) return undefined
                    const g = w.geometry, pos = g.attributes.position, local = w.worldToLocal(hits[0].point.clone())
                    let best = Infinity, bi = -1
                    for (let i = 0; i < pos.count; i++) {
                      const d = Math.hypot(pos.getX(i) - local.x, pos.getY(i) - local.y, pos.getZ(i) - local.z)
                      if (d < best) { best = d; bi = i }
                    }
                    return { count: pos.count, index: g.index?.count, sphere: g.boundingSphere?.radius, nearestVertex: +best.toFixed(1), at: bi,
                      depth: g.attributes.seaDepth.getX(bi), parent: w.parent?.name, sameGeometryAsMesh: g === tile.mesh.geometry.userData.waterGeometry }
                  })() })
              }
            }
          }
          // Where the ray crosses sea level, and the tile there.
          const g = lod.group, inv = g.matrixWorld.clone().invert()
          let cross = null
          for (let t = 1; t < 3000; t += 0.5) {
            const p = ray.ray.at(t, new THREE.Vector3()).applyMatrix4(inv)
            const d = p.clone().normalize()
            const surface = 1 / Math.sqrt((d.x * d.x + d.z * d.z) / (lod.a * lod.a) + d.y * d.y / (lod.b * lod.b))
            if (p.length() < surface) {
              const s = lod._sampleTerrainHeightAtDirection(d)
              const tile = s && [...lod.tiles.values()].find((x) => x.id === s.tileId)
              cross = { t, tileId: s?.tileId, height: s && +s.heightMeters.toFixed(1), visible: tile?.visibleFrame === lod.frame,
                hasWater: !!tile?.waterMesh, ground: !!tile?.ground }
              // And the visible tile there.
              for (const v of lod.visibleList) {
                if (!s || v.face !== s.face || v.lod > s.lod) continue
                if (Math.floor(s.x / 2 ** (s.lod - v.lod)) === v.x && Math.floor(s.y / 2 ** (s.lod - v.lod)) === v.y) {
                  cross.visibleTile = { id: v.id, ground: !!v.ground, hasWater: !!v.waterMesh, waterVisible: v.waterMesh?.visible,
                    grid: v.heightGrid ? [Math.min(...v.heightGrid), Math.max(...v.heightGrid)].map((x) => +x.toFixed(1)) : null }
                }
              }
              break
            }
          }
          out.push({ cross })
          return out.sort((a, b) => a.dist - b.dist)
        })(),
        // How well the drawn tiles meet (CubedSpherePlanetRenderer.measureSeams).
        seams: app.planet.lod.measureSeams(app.camera3d),
        boats: app.sailboats?.active?.reduce((n, cell) => n + (cell.boats?.length ?? 0), 0),
        // (Each boat's distance from the generated ground's coastline, metres, negative at sea; and the drawn sea floor's
        // height under it.)
        boatCoast: (() => {
          const g = app.planet.lod.groundData?.[0], c = new Float32Array(16), out = []
          if (!g?.loaded) return null
          for (const cell of app.sailboats?.active ?? []) for (const b of cell.boats ?? []) {
            g.cover(b.lat, b.lon, c)
            const h = app.planet.lod.sampleTerrainHeight(b.lat, b.lon)
            out.push([Math.round(c[3]), h ? +h.heightMeters.toFixed(1) : null, h?.lod ?? null, b.anchored ? 'anchored' : 'sailing'])
          }
          return out
        })(),
        drawCalls: app.renderer.info.render.calls,
        triangles: app.renderer.info.render.triangles,
      }
      return { clouds, frame: frameTime, passes, state }
    }, view, frames, !!process.env.BENCH_PASSES, process.env.BENCH_PROBE)
    if (timing.error) throw new Error(timing.error)
    const file = path.join(out, `${name}.png`)
    await page.screenshot({ path: file })
    const result = { name, gpu, ...timing }
    // BENCH_COST=1: the march's work per pixel (Clouds.setCostView), its statistics and a heat map of the
    // density samples (red), light march samples (green) and shadow samples (blue).
    if (process.env.BENCH_COST) {
      const cost = await page.evaluate(async () => {
        const app = window.tetheredRing.app
        const frame = () => new Promise(r => requestAnimationFrame(r))
        app.clouds.setCostView(true)
        for (let i = 0; i < 3; i++) await frame()
        const { counts, width, height } = app.clouds.costReadback(app.renderer)
        app.clouds.setCostView(false)
        const names = ['columns', 'densities', 'lightSamples', 'fineCells', 'fibres', 'shadowSamples']
        const stats = {}
        names.forEach((n, k) => {
          const v = []
          for (let i = 0; i < width * height; i++) v.push(counts[i * 6 + k])
          v.sort((a, b) => a - b)
          stats[n] = { mean: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1), p90: v[Math.floor(v.length * 0.9)], max: v[v.length - 1] }
        })
        const c = document.createElement('canvas'); c.width = width; c.height = height
        const ctx = c.getContext('2d'), img = ctx.createImageData(width, height)
        const scale = (k) => 255 / Math.max(1, stats[names[k]].p90 * 1.5)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (height - 1 - y) * width + x, o = (y * width + x) * 4
            img.data[o] = Math.min(255, counts[i * 6 + 1] * scale(1))
            img.data[o + 1] = Math.min(255, counts[i * 6 + 2] * scale(2))
            img.data[o + 2] = Math.min(255, counts[i * 6 + 5] * scale(5))
            img.data[o + 3] = 255
          }
        }
        ctx.putImageData(img, 0, 0)
        for (let i = 0; i < 3; i++) await frame()
        return { stats, image: c.toDataURL('image/png') }
      })
      fs.writeFileSync(path.join(out, `${name}.cost.png`), Buffer.from(cost.image.split(',')[1], 'base64'))
      result.cost = cost.stats
    }
    const base = baseline && path.join(baseline, `${name}.png`)
    if (base && fs.existsSync(base)) {
      const toUrl = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
      const diff = await page.evaluate(async (a, b) => {
        const load = (src) => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src })
        const [ia, ib] = await Promise.all([load(a), load(b)])
        const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
        const pixels = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h) }
        const pa = pixels(ia).data, pb = pixels(ib).data
        const c = document.createElement('canvas'); c.width = w; c.height = h
        const ctx = c.getContext('2d'), img = ctx.createImageData(w, h)
        let sum = 0, over8 = 0, max = 0
        for (let i = 0; i < pa.length; i += 4) {
          const dv = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]))
          sum += dv; if (dv > 8) over8++; if (dv > max) max = dv
          img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, dv * 8); img.data[i + 3] = 255
        }
        ctx.putImageData(img, 0, 0)
        return { mean: sum / (w * h), over8: over8 / (w * h), max, image: c.toDataURL('image/png') }
      }, toUrl(file), toUrl(base))
      fs.writeFileSync(path.join(out, `${name}.diff.png`), Buffer.from(diff.image.split(',')[1], 'base64'))
      delete diff.image
      result.diff = diff
    }
    // BENCH_MOTION=kind:amount:frames: a camera move from the view, with simulated time held, saved as
    // frames (<out>/<name>.motion/frame-NNNN.png) for tools/motion_artifacts.py. With nothing else moving,
    // everything that changes from frame to frame should be explained by the camera's motion; flicker,
    // shimmer and sliding are not. kind: strafe (sideways, amount in metres), dolly (forwards, metres),
    // pan (turning about the up direction, degrees), orbit (about the target, degrees).
    if (process.env.BENCH_MOTION) {
      const [kind, amount, count] = process.env.BENCH_MOTION.split(':')
      const dir = path.join(out, `${name}.motion`)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      for (let i = 0; i < Number(count); i++) {
        await page.evaluate(async (view, kind, amount, f) => {
          const app = window.tetheredRing.app
          const frame = () => new Promise(r => requestAnimationFrame(r))
          const { applyViewState } = await import('/src/ui/ViewStatus.js')
          const THREE = await window.tetheredRing.THREE
          const c = view.camera
          const pos = new THREE.Vector3(...c.position), target = new THREE.Vector3(...c.target), up = new THREE.Vector3(...c.up).normalize()
          const forward = target.clone().sub(pos).normalize(), right = forward.clone().cross(up).normalize()
          if (kind === 'strafe' || kind === 'dolly') {
            const shift = (kind === 'strafe' ? right : forward).multiplyScalar(amount * f)
            pos.add(shift)
            target.add(shift)
          }
          else if (kind === 'pan') target.sub(pos).applyAxisAngle(up, -THREE.MathUtils.degToRad(amount * f)).add(pos)
          else if (kind === 'orbit') pos.sub(target).applyAxisAngle(up, THREE.MathUtils.degToRad(amount * f)).add(target)
          applyViewState(app, { camera: { ...c, position: pos.toArray(), target: target.toArray() } })
          for (let i = 0; i < 1200; i++) {
            await frame()
            const s = app.planet.getDebugStats()
            if (i > 2 && !s.queue && !s.inflight) break
          }
          for (let i = 0; i < 3; i++) await frame()
        }, view, kind, Number(amount), i / Math.max(1, Number(count) - 1))
        await page.screenshot({ path: path.join(dir, `frame-${String(i).padStart(4, '0')}.png`) })
      }
    }
    console.log('BENCH ' + JSON.stringify(result))
  }
}
