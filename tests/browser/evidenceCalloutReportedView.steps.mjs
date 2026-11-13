/* global window */
// The user's detaching-callout report (2026-11-11), preserved as a real scene
// regression. Unlike coordinate-only tests, this reads the pixels drawn by WebGL.
const reportedView = {
  preset: 'EvidenceLedgerLinks', time: 79.834, sunDayOfYear: 131, sunTimeOfDayUTC: 20.29,
  camera: {
    position: [-1702963.032, 2127052.876, -5764036.391],
    target: [-1702776.613, 2127740.336, -5763684.071],
    up: [-0.267108, 0.333736, -0.904032], orbitUp: [-0.267108, 0.333736, -0.904032], fov: 45,
  },
  parameters: {sunDayOfYear: 131, sunTimeOfDayUTC: 20.29},
}

export default async function ({page, screenshot}) {
  await page.waitForFunction(() => window.tetheredRing?.app?.evidenceCallouts, {timeout: 120000})
  await page.evaluate(async view => {
    const {applyViewState} = await import('/src/ui/ViewStatus.js')
    const app = window.tetheredRing.app
    applyViewState(app, view); app.step(0); app.render()
    // Test attachment even during fast input, when the ordinary motion gate hides
    // labels. Do not let that intended hiding behavior make the check vacuous.
    app.evidenceCallouts.motion.accept = () => true
  }, reportedView)
  await screenshot('reported-view')
  await page.mouse.move(700, 285); await page.mouse.down()
  await page.mouse.move(790, 300, {steps: 20}); await page.mouse.up()
  const result = await page.evaluate(async () => {
    const {Vector2} = await window.tetheredRing.THREE
    const app = window.tetheredRing.app, labels = app.evidenceCallouts, renderer = app.renderer
    const previousMode = app.shots.mode
    app.shots.mode = 'live' // Inspect the composited video path; interactive labels use their own canvas.
    const pose = app.camera.getState(), target = app.camera3d.position.clone().fromArray(pose.target)
    const offset = app.camera3d.position.clone().sub(target), up = target.clone().normalize()
    const measurements = []
    for (const [index, ratio] of [1, 0.75, 0.5, 1.25, 2, 1].entries()) {
      renderer.setPixelRatio(ratio)
      app.camera.setState({...pose, position: target.clone().add(offset.clone().applyAxisAngle(up, index * 0.02)).toArray()})
      app.step(0); app.render()
      const size = renderer.getSize(new Vector2()), physical = renderer.getDrawingBufferSize(new Vector2())
      const gl = renderer.getContext(), checks = []
      const probes = labels.visibleCallouts.map(card => {
        const [tip, elbow] = card.leader
        return {card, x: Math.floor((tip.x + elbow.x) / 2 / size.x * physical.x) - 2,
          y: physical.y - 3 - Math.floor((tip.y + elbow.y) / 2 / size.y * physical.y)}
      })
      // Compare the final framebuffer with and without the overlay at each leader.
      // This checks actual GPU placement at every DPR without relying on anchor dots.
      const read = probe => {
        const patch = new Uint8Array(5 * 5 * 4)
        gl.readPixels(probe.x, probe.y, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, patch)
        return patch
      }
      const drawn = probes.map(read)
      labels.quad.visible = false
      try {
        app.render()
        for (const [i, probe] of probes.entries()) {
          const background = read(probe)
          if (!drawn[i].some((channel, k) => k % 4 !== 3 && Math.abs(channel - background[k]) > 3)) {
            throw new Error(`Detached leader ${probe.card.id} at ratio ${ratio}`)
          }
          checks.push(probe.card.targetId)
        }
      } finally { labels.quad.visible = true; app.render() }
      if (!checks.length) throw new Error('Attachment regression ran without visible callouts')
      measurements.push({ratio, checks})
    }
    app.shots.mode = previousMode; app.render()
    return {time: app.clock.time, measurements}
  })
  console.log(JSON.stringify(result))
  await screenshot('after-mouse-orbit')
}
