/* global window, requestAnimationFrame -- (the functions passed to page.evaluate run in the page) */
// The steps of scripts/check-visual-seams.mjs, run in the page by scripts/smoke.mjs: for each view, settle the
// terrain, render the frame, then render each drawn terrain tile's id and distance from the camera, and look at every
// pixel where two tiles meet on screen (not at a silhouette, where the distance jumps): a step in the colour across
// the boundary that stands out from the colour's variation within each tile beside it is a visual seam.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export default async function ({ page }) {
  const views = JSON.parse(fs.readFileSync(process.env.SEAM_VIEWS, 'utf8'))
  const out = process.env.SEAM_OUT
  const options = { minRelative: Number(process.env.SEAM_MIN_RELATIVE ?? 0.02), ratio: Number(process.env.SEAM_RATIO ?? 2.5), minLength: Number(process.env.SEAM_MIN_LENGTH ?? 24), selfTest: !!process.env.SEAM_SELFTEST, masking: Number(process.env.SEAM_MASKING ?? 0.3) }
  // Only the canvas in the screenshots.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important } .seam-canvas { visibility: visible !important }' })
  await page.evaluate((quality) => {
    const app = window.tetheredRing.app
    app.renderer.domElement.classList.add('seam-canvas')
    app.store.set('showLogo', false)
    app.applyAllParameters()
    app.quality.setMode(quality)
  }, process.env.SEAM_QUALITY || 'high')
  for (const { name, view, pose } of views) {
    const result = await page.evaluate(async (view, options) => {
      const app = window.tetheredRing.app, THREE = await window.tetheredRing.THREE
      const frame = () => new Promise((r) => requestAnimationFrame(r))
      const { applyViewState } = await import('/src/ui/ViewStatus.js')
      app.clouds?.setCloudTypeTest?.(view.cloudType ?? null)
      applyViewState(app, view)
      const settle = async () => {
        for (let i = 0; i < 1500; i++) {
          await frame()
          const s = app.planet.getDebugStats(), lod = app.planet.lod
          // (Generated tiles wait to be built in the upload queue, and wait for their region's data while loading.)
          const building = lod._uploadQueue.length || [...lod.tiles.values()].some((t) => t.loading)
          if (i > 20 && !s.queue && !s.inflight && !building) break
        }
        for (let i = 0; i < 4; i++) await frame()
      }
      await settle()
      const eye = view.camera?.eyeAboveGround
      if (eye) {
        for (let pass = 0; pass < 3; pass++) {
          const state = app.camera.getState()
          const pos = new THREE.Vector3().fromArray(state.position)
          const up = pos.clone().sub(app.planetCoordSys.getWorldPosition(new THREE.Vector3())).normalize()
          const hit = app.planet.raycast(new THREE.Raycaster(pos.clone().addScaledVector(up, 20000), up.clone().negate(), 0, 60000))[0]
          if (!hit) break
          const next = hit.point.clone().addScaledVector(up, Math.max(eye, 1))
          if (next.distanceTo(pos) < 0.05) break
          const shift = next.clone().sub(pos)
          app.camera.setState({ ...state, position: next.toArray(), target: new THREE.Vector3().fromArray(state.target).add(shift).toArray() })
          await settle()
        }
      }
      const renderer = app.renderer, gl = renderer.getContext(), camera = app.camera3d
      // (SEAM_SELFTEST: every other tile darkened by 15%, which must be found.)
      const tiles = app.planet.lod.visibleList.filter((t) => t.mesh?.visible && t.ready)
      const tinted = options.selfTest ? tiles.filter((t, k) => k % 2 && t.material).map((t) => t.material) : []
      for (const m of tinted) m.color.multiplyScalar(0.85)
      // The frame as drawn.
      app.render()
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight
      const color = new Uint8Array(W * H * 4)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, color)
      for (const m of tinted) m.color.multiplyScalar(1 / 0.85)
      // Each drawn terrain tile's id and distance (nothing else drawn).
      const material = new THREE.ShaderMaterial({
        uniforms: { tileId: { value: 0 } },
        vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying float vDist;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`,
        fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform float tileId;
varying float vDist;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(tileId, vDist, 0.0, 1.0);
}`,
      })
      const hidden = []
      app.scene.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.visible) { hidden.push(o); o.visible = false } })
      const swapped = tiles.map((t, k) => {
        const m = material.clone()
        m.uniforms.tileId.value = k + 1
        const old = t.mesh.material
        t.mesh.material = m
        t.mesh.visible = true
        return [t, old, m]
      })
      // The sea surface, drawn over its tiles as -1: those pixels are left out (the coastline is no seam).
      const sea = material.clone()
      sea.uniforms.tileId.value = -1
      const seaSwapped = tiles.filter((t) => t.waterMesh).map((t) => {
        const old = t.waterMesh.material
        t.waterMesh.material = sea
        t.waterMesh.visible = true
        return [t, old]
      })
      const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat })
      const background = app.scene.background
      app.scene.background = null
      renderer.setRenderTarget(target)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.render(app.scene, camera)
      const idd = new Float32Array(W * H * 4)
      renderer.readRenderTargetPixels(target, 0, 0, W, H, idd)
      renderer.setRenderTarget(null)
      app.scene.background = background
      for (const [t, old, m] of swapped) { t.mesh.material = old; m.dispose() }
      for (const [t, old] of seaSwapped) t.waterMesh.material = old
      sea.dispose()
      for (const o of hidden) o.visible = true
      target.dispose()
      material.dispose()
      // The boundaries: pixel pairs side by side (across and up) with different tiles and no jump in distance.
      const lum = (i) => 0.2126 * color[i * 4] + 0.7152 * color[i * 4 + 1] + 0.0722 * color[i * 4 + 2]
      const id = (i) => Math.round(idd[i * 4])
      const dist = (i) => idd[i * 4 + 1]
      const pairs = new Map()
      const look = (x, y, dx, dy) => {
        const i = y * W + x, j = (y + dy) * W + (x + dx)
        const a = id(i), b = id(j)
        if (a <= 0 || b <= 0 || a === b) return
        const da = dist(i), db = dist(j)
        if (Math.abs(da - db) > 0.03 * Math.min(da, db) + 0.5) return // (a silhouette)
        // Two pixels each side, and the two beyond them, each on its own tile.
        const at = (k) => { const xx = x + dx * k, yy = y + dy * k; return xx >= 0 && yy >= 0 && xx < W && yy < H ? yy * W + xx : -1 }
        const side = [at(-3), at(-2), at(-1), at(0)], other = [at(1), at(2), at(3), at(4)]
        if (side.some((k) => k < 0 || id(k) !== a) || other.some((k) => k < 0 || id(k) !== b)) return
        const near = (lum(side[2]) + lum(side[3])) / 2, far = (lum(side[0]) + lum(side[1])) / 2
        const nearB = (lum(other[0]) + lum(other[1])) / 2, farB = (lum(other[2]) + lum(other[3])) / 2
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        let p = pairs.get(key)
        if (!p) pairs.set(key, p = { a: Math.min(a, b), b: Math.max(a, b), n: 0, step: 0, signed: 0, within: 0, sum: 0, dist: 0, xs: 0, ys: 0, px: [] })
        p.n++
        p.step += Math.abs(near - nearB)
        // The jump across, less what each side's own gradient predicts over the two pixels between the pairs'
        // middles (a smooth gradient, such as the haze's with distance, is no seam), the lower id's side less the
        // other's.
        const jump = (near - nearB) - ((far - near) + (nearB - farB)) / 2
        p.signed += (a < b ? 1 : -1) * jump
        p.sum += near + nearB
        p.dist += (da + db) / 2
        p.within += (Math.abs(near - far) + Math.abs(nearB - farB)) / 2
        p.xs += x; p.ys += y
        if (p.px.length < 400) p.px.push(x, H - 1 - y)
      }
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { look(x, y, 1, 0); look(x, y, 0, 1) }
      const seams = []
      for (const p of pairs.values()) {
        if (p.n < options.minLength) continue
        // The step: the mean of the signed differences across the boundary along its length (texture averages out of
        // it; a change at the edge does not), against its noise (the variation within the tiles, over the square
        // root of the boundary's length), and relative to the brightness there (the eye sees a step of a few
        // percent along a line).
        const step = Math.abs(p.signed / p.n), within = p.within / p.n
        const mean = p.sum / (2 * p.n), relative = step / Math.max(6, mean)
        // (Texture hides a step: one has to stand out from the variation beside it, as well as from noise.)
        if (relative > options.minRelative && step > options.masking * within && step > options.ratio * (within + 0.5) / Math.sqrt(p.n)) {
          const ta = tiles[p.a - 1], tb = tiles[p.b - 1]
          seams.push({ a: ta.id, b: tb.id, aGenerated: !!ta.ground, bGenerated: !!tb.ground, pixels: p.n,
            step: +step.toFixed(1), relative: +relative.toFixed(3), within: +within.toFixed(1), px: p.px, at: [Math.round(p.xs / p.n), H - 1 - Math.round(p.ys / p.n)] })
        }
      }
      seams.sort((p, q) => q.step * q.pixels - p.step * p.pixels)
      // (Self-test: of the boundaries between a darkened tile and another, long enough to judge, how many were found.)
      let tintedPairs = 0
      const missed = []
      if (options.selfTest) {
        const found = new Set(seams.map((q) => `${q.a}|${q.b}`))
        for (const p of pairs.values()) {
          if (p.n < options.minLength || ((p.a - 1) % 2) === ((p.b - 1) % 2)) continue
          tintedPairs++
          const ta = tiles[p.a - 1], tb = tiles[p.b - 1]
          if (!found.has(`${ta.id}|${tb.id}`)) {
            missed.push({ n: p.n, step: +Math.abs(p.signed / p.n).toFixed(2), within: +(p.within / p.n).toFixed(1),
              mean: +(p.sum / (2 * p.n)).toFixed(0), dist: +(p.dist / p.n).toFixed(0), sea: ta.refHeight < -5 || tb.refHeight < -5 })
          }
        }
      }
      return { width: W, height: H, boundaries: pairs.size, seams, tintedPairs, missed: missed.slice(0, 50) }
    }, view, options)
    const file = path.join(out, `${name}.png`)
    if (result.seams.length) await page.screenshot({ path: file })
    console.log('SEAMS ' + JSON.stringify({ name, pose, ...result }))
  }
}
