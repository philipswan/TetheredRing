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
    console.log('BENCH ' + JSON.stringify(result))
  }
}
