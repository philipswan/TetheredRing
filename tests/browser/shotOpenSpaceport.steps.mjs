/* global window */
// npm run smoke -- --url-params "preset=toMarsHawaii&quality=low&restoreShot=false" --steps tests/browser/shotOpenSpaceport.steps.mjs
export default async function ({page}) {
  await page.waitForFunction(() => !!window.tetheredRing?.app?.shots)
  const originalPreset = await page.evaluate(() => window.tetheredRing.app.presetId)
  if (originalPreset === 'SpaceportLauncher') throw new Error('Test must start from a different preset')
  const navigation = page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: 120000})
  await page.evaluate(async () => {
    const {app} = window.tetheredRing
    app.shots._nativeOpenBlocked = true
    app.shots.openShotProject()
  })
  const input = await page.$('input[type=file][accept=".json,application/json"]')
  await input.uploadFile('shots/SpaceportConceptual.shot.json')
  await navigation
  await page.waitForFunction(() => window.tetheredRing?.app?.shots?.hasProject, {timeout: 120000})
  const report = await page.evaluate(async () => {
    const {app} = window.tetheredRing, shots = app.shots
    const expected = await (await fetch('/shots/SpaceportConceptual.shot.json')).json()
    if (app.presetId !== expected.preset) throw new Error('Preset did not switch')
    if (shots.shot.project.id !== expected.project.id) throw new Error('Wrong project after reload')
    if (JSON.stringify(shots.keyframes) !== JSON.stringify(expected.camera.keyframes)) throw new Error('Saved keyframe missing or changed')
    if (app.sidebar.projectName.textContent !== `Current Shot Name: ${expected.name}`) throw new Error('Sidebar does not show saved shot name')
    if (sessionStorage.getItem('tetheredRing.pendingShot')) throw new Error('Pending import was not consumed')
    return {preset: app.presetId, name: shots.shot.name, keyframes: shots.keyframes.length, status: shots.status}
  })
  console.log(JSON.stringify(report))
}
