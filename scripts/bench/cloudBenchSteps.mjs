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
  const gpu = await page.evaluate(() => {
    const gl = window.tetheredRing.app.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info')
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  for (const { name, view } of views) {
    const timing = await page.evaluate(async (view, frames) => {
      const app = window.tetheredRing.app, gl = app.renderer.getContext()
      const frame = () => new Promise(r => requestAnimationFrame(r))
      const { applyViewState } = await import('/src/ui/ViewStatus.js')
      applyViewState(app, view)
      // Loaded: the planet's tiles, the real clouds, and a few quiet frames.
      for (let i = 0; i < 1200; i++) {
        await frame()
        const s = app.planet.getDebugStats()
        const real = app.clouds?.realClouds
        if (i > 60 && !s.queue && !s.inflight && (!real || (real.ready && !real.loading))) break
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
      return { clouds, frame: frameTime }
    }, view, frames)
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
