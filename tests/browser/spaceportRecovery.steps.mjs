/* global window */
// npm run smoke -- --url-params "preset=SpaceportLauncher&quality=low" --steps tests/browser/spaceportRecovery.steps.mjs
export default async function ({page}) {
  await page.evaluate(async () => {
    const shot = await (await fetch('/shots/SpaceportConceptual.shot.json')).json()
    Object.assign(shot.parameters, {launcherEvacuatedTubeExitAltitude: 100000,
      launchVehicleCoefficientOfDrag: 0, launchVehiclePropellantMassFlowRate: 0, launchVehiclePropellantMass: 0})
    sessionStorage.removeItem('tetheredRing.pendingShot')
    localStorage.setItem('tetheredRing.shotAutosave', JSON.stringify(shot))
  })
  await page.reload({waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => window.tetheredRing?.app?.shots?.hasProject, {timeout: 120000})
  console.log(await page.evaluate(() => {
    const {app} = window.tetheredRing, l = app.launchSystem
    if (app.d.launcherEvacuatedTubeExitAltitude.value !== 14000) throw new Error('Stale autosave restored 100 km exit')
    if (app.shots.shot.parameters.launcherEvacuatedTubeExitAltitude !== 14000) throw new Error('Shot baseline was not upgraded')
    if (!(l.launcherElevatedEvacuatedTubeLength < 100000)) throw new Error('Tube is still hundreds of kilometres long')
    if (!(l.spaceportMission.atmosphere.consumed > 0)) throw new Error('Rocket propulsion not restored')
    return {exitAltitudeKm: app.d.launcherEvacuatedTubeExitAltitude.value / 1000,
      tubeLengthKm: l.launcherElevatedEvacuatedTubeLength / 1000,
      keyframes: app.shots.keyframes.length, propellantUsed: l.spaceportMission.atmosphere.consumed}
  }))
}
