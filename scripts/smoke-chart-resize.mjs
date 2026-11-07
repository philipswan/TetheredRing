// Pixel regression for text distortion when a CanvasTexture changes dimensions.
// node scripts/smoke.mjs --page /tests/blank.html --wait 0 --steps scripts/smoke-chart-resize.mjs --out .scratch/chart-fonts.png
import assert from 'node:assert/strict'

export default async function({ page }) {
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js')
    const { XYChart } = await import('/src/scene/XYChart.js')
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setSize(1000, 600)
    renderer.setClearColor(0x000000, 1)
    globalThis.document.body.append(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(0, 1000, 0, -600, 1, 10)
    camera.position.z = 10
    const chart = new XYChart()
    chart.addCurve('Altitude', 'm', [{ x: 0, y: 0 }, { x: 300, y: 1000 }])
    scene.add(chart)
    const target = new THREE.WebGLRenderTarget(1000, 600)
    const gl = renderer.getContext()
    const capture = (width, height) => {
      chart.setSize(width, height)
      chart.update(-1)
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      const pixels = new Uint8Array(300 * 69 * 4)
      renderer.readRenderTargetPixels(target, 8, 600 - 74, 300, 69, pixels)
      return { pixels, error: gl.getError(), textures: renderer.info.memory.textures }
    }
    try {
      const baseline = capture(800, 400)
      const frames = [[400, 400], [800, 200], [500, 500], [900, 550], [800, 400]].map(([width, height]) => {
        const current = capture(width, height)
        let changed = 0
        current.pixels.forEach((value, i) => { if (value !== baseline.pixels[i]) changed++ })
        return { width, height, changed, error: current.error, textures: current.textures }
      })
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      return { baselineError: baseline.error, headerValues: new Set(baseline.pixels).size, textures: baseline.textures, frames }
    }
    finally { chart.dispose(); target.dispose(); renderer.dispose() }
  })
  console.log('Chart resize pixel regression:', JSON.stringify(result))
  assert.equal(result.baselineError, 0)
  assert.ok(result.headerValues > 10, 'The reference must contain visible text')
  for (const frame of result.frames) {
    assert.equal(frame.error, 0, `WebGL error at ${frame.width} × ${frame.height}`)
    assert.equal(frame.changed, 0, `Text changed shape at ${frame.width} × ${frame.height}`)
    assert.equal(frame.textures, result.textures, 'Resizing must release the previous GPU texture')
  }
}
