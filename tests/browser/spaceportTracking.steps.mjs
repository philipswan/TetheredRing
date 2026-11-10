/* global window, document */
// npm run smoke -- --url-params "preset=SpaceportLauncher&quality=low" --steps tests/browser/spaceportTracking.steps.mjs
export default async function ({page}) {
  const toggle = async () => {
    await page.keyboard.press('Digit6')
  }
  for (const scheme of ['classic', 'smart']) {
    await page.evaluate(scheme => {
      const {app} = window.tetheredRing
      app.shots.pause(); app.camera.setScheme(scheme); app.camera.stopTracking()
      app.shots.jumpToSimTime(800); app.step(0)
    }, scheme)
    await toggle()
    await page.waitForFunction(() => window.tetheredRing.app.camera.tracker.type === 'spaceport')
    await page.evaluate(() => {
      const {app} = window.tetheredRing, l = app.launchSystem
      for (const time of [820, 1000, 50]) {
        app.shots.jumpToSimTime(time); app.step(0)
        const expected = l.scene.localToWorld(l.spaceportStation.root.position.clone())
        if (app.camera.tracker.getPosition().distanceTo(expected) > 1e-5) throw new Error('Tracker missed displayed station centre')
      }
    })
    await toggle()
    await page.waitForFunction(() => !window.tetheredRing.app.camera.tracking)
    console.log(`${scheme}: 6 tracks spaceport, follows seeks, and releases`)
  }
  const anchors = await page.evaluate(async () => {
    const {app} = window.tetheredRing, shots = app.shots
    shots.addKeyframe()
    const menus = [...document.querySelectorAll('select')].filter(select =>
      [...select.options].some(option => option.value === 'spaceport'))
    if (menus.length < 2) throw new Error('Spaceport missing from camera/look-at dropdowns')
    const menu = menus[0]
    menu.value = 'spaceport'; menu.dispatchEvent(new Event('change'))
    if (shots.keyframes[shots.selected].anchor.type !== 'spaceport') throw new Error('Dropdown failed to assign spaceport anchor')
    const {parseShot, serializeShot} = await import('/src/shots/ShotFormat.js')
    const restored = parseShot(serializeShot(shots.shot))
    if (restored.camera.keyframes[shots.selected].anchor.type !== 'spaceport') throw new Error('Spaceport anchor did not survive save/load')
    shots.setViewMode('shot')
    for (const t of [820, 1000, 50]) {
      shots.jumpToSimTime(t); app.step(0)
      const pose = shots.poseAt(shots.playhead)
      if (!pose.position.every(Number.isFinite)) throw new Error('Invalid spaceport-anchored playback')
    }
    return 'Spaceport appears in both dropdowns, can be selected, saved, loaded and played back'
  })
  console.log(anchors)
}
