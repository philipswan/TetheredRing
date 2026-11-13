/* global window */
export default async function ({page}) {
  await page.waitForFunction(() => window.calloutFixture)
  console.log(await page.evaluate(() => {
    const {app, labels, THREE} = window.calloutFixture, renderer = app.renderer
    const results = []
    let initialTextures, nativePixels
    const stationary = (w, h) => [{id: 'vehicle', label: 'Spacecraft', priority: 100,
      x: w * 0.6, y: h * 0.55, claims: []}]
    // Every size must be checked after an initial GPU upload. The original bug
    // passes when each resolution is rendered with a brand-new texture/context.
    for (const [width, height, ratio] of [
      [1280, 720, 1], [1280, 720, 0.75], [1280, 720, 0.5], [1280, 720, 1.5],
      [1280, 720, 2], [960, 600, 1], [1280, 720, 1],
    ]) {
      renderer.setPixelRatio(ratio); renderer.setSize(width, height)
      Object.assign(renderer.domElement.style, {width: '1280px', height: '720px', objectFit: 'contain'})
      labels.candidates = stationary
      app.shots = {mode: 'idle'}
      renderer.setClearColor(0x000000, 1); renderer.clear()
      labels.render(renderer)
      const [card] = labels.visibleCallouts
      if (!card) throw new Error('Fixture callout missing')
      const rect = labels.canvas.getBoundingClientRect()
      if (labels.canvas.width !== Math.round(rect.width * window.devicePixelRatio) ||
          labels.canvas.height !== Math.round(rect.height * window.devicePixelRatio)) throw new Error('Label layer is not native display resolution')
      if (window.getComputedStyle(labels.canvas).pointerEvents !== 'none') throw new Error('Label layer intercepts camera controls')
      if (width === 1280 && height === 720) {
        const pixels = labels.canvas.toDataURL()
        if (nativePixels && nativePixels !== pixels) throw new Error('Stationary labels changed sharpness with adaptive resolution')
        nativePixels = pixels
      }
      if (labels.canvas.style.display === 'none') throw new Error('Interactive full-resolution label layer is hidden')
      const first = card.leader[0], second = card.leader[1]
      const centreX = (first.x + second.x) / 2, centreY = (first.y + second.y) / 2
      const buffer = renderer.getDrawingBufferSize(new THREE.Vector2()), glScene = renderer.getContext()
      const scenePixel = new Uint8Array(4)
      glScene.readPixels(Math.floor(centreX / width * buffer.x), buffer.y - 1 - Math.floor(centreY / height * buffer.y),
        1, 1, glScene.RGBA, glScene.UNSIGNED_BYTE, scenePixel)
      if (scenePixel[0] || scenePixel[1] || scenePixel[2]) throw new Error('Interactive labels still pass through the low-resolution scene buffer')
      const expectedLeft = renderer.domElement.getBoundingClientRect().left + (1280 - width * labels.screen.scale) / 2
      if (Math.abs(rect.left - expectedLeft) > 0.01) throw new Error('Native label layer ignores letterboxing')
      // Exercise the separate recording path as well as the full-resolution screen layer.
      app.shots.mode = 'live'
      renderer.clear(); labels.render(renderer)
      if (labels.canvas.style.display !== 'none') throw new Error('Recording displays duplicate label layers')
      const physical = renderer.getDrawingBufferSize(new THREE.Vector2())
      const pixel = new Uint8Array(4), gl = renderer.getContext()
      const [tip, elbow] = card.leader
      const x = (tip.x + elbow.x) / 2, y = (tip.y + elbow.y) / 2
      const patch = new Uint8Array(5 * 5 * 4)
      gl.readPixels(Math.floor(x / width * physical.x) - 2, physical.y - 3 - Math.floor(y / height * physical.y),
        5, 5, gl.RGBA, gl.UNSIGNED_BYTE, patch)
      for (let i = 0; i < patch.length; i += 4) if (patch[i] > pixel[0]) pixel.set(patch.subarray(i, i + 4))
      if (pixel[0] < 30 || pixel[1] < 30 || pixel[2] < 30) {
        throw new Error(`Detached GPU anchor after resize to ${width}x${height} at ratio ${ratio}: pixel ${[...pixel]}`)
      }
      if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL error resizing callout texture')
      initialTextures ??= renderer.info.memory.textures
      if (renderer.info.memory.textures !== initialTextures) throw new Error('Callout resizing leaked GPU textures')
      results.push({width, height, ratio, pixel: [...pixel]})
    }
    app.shots.mode = 'idle'
    renderer.clear(); labels.render(renderer)
    return {renderedAnchorChecks: results, nativeLabelPixels: [labels.canvas.width, labels.canvas.height]}
  }))
}
