/* global window */
// npm run smoke -- --url-params "preset=SpaceportLauncher&quality=low" --steps tests/browser/spaceport.steps.mjs
export default async function ({page, screenshot}) {
  const report = await page.evaluate(async () => {
    const {app} = window.tetheredRing, l = app.launchSystem, m = l.spaceportMission
    const {Vector3} = await import('/node_modules/three/build/three.module.js')
    if (!m || !l.spaceportStation) throw new Error('Missing rendezvous mission')
    if (Math.abs(m.radius - l.planetRadius - 300000) > 0.2) throw new Error('Wrong apogee altitude')
    if (Math.abs(m.circularSpeed - m.entrySpeed - 1000) > 0.1) throw new Error('Wrong apogee velocity deficit')
    const Class = l.movingObjectClass('virtualLaunchVehicles'), ref = Class.refFrames[0]
    const rendezvous = l.spaceportReleaseTime + m.apogeeTime
    app.shots.pause(); app.clock.paused = true
    app.shots.jumpToSimTime(l.spaceportReleaseTime + l.timeWithinEvacuatedTube + 1)
    app.step(0)
    const air = m.atmosphere.at(l.timeWithinEvacuatedTube + 1)
    const effects = l.glow.inUse.get(0)
    if (!(air.massFlowRate > 0 && air.thrust > 0 && m.atmosphere.remaining > 0)) throw new Error('Drag-compensating rocket is not burning')
    if (!effects?.trail.visible || !effects?.plume.visible) throw new Error('Plasma or rocket exhaust is not visible after tube exit')
    if (Math.abs(app.d.launcherEvacuatedTubeExitAltitude.value - 14000) > 1) throw new Error('Tube exit altitude was not restored')
    console.log(`Drag compensation uses ${m.atmosphere.consumed.toFixed(1)} kg of propellant; exhaust and plasma are visible`)

    app.shots.jumpToSimTime(rendezvous)
    app.step(0)
    const obj = Class.activeObjects.get(0)
    if (!obj?.model?.visible) throw new Error('Launch vehicle not visible at rendezvous')
    const frame = obj.frameAt(ref, rendezvous)
    if (frame.f.point.distanceTo(m.stateAt(m.apogeeTime).position) > 1) throw new Error('Rendered flight misses apogee')
    const leading = l.spaceportStation.root.getObjectByName('spaceportLeadingEdge')
    l.scene.updateWorldMatrix(true, true)
    const captureEntry = l.spaceportStation.root.getObjectByName('spaceportCaptureEntry')
    const leadingPosition = l.scene.worldToLocal(captureEntry.getWorldPosition(new Vector3()))
    const stationLift = l.spaceportStation.visualAltitudeOffset
    const stationUp = m.stationAt(m.apogeeTime).centre.position.clone().normalize()
    if (leadingPosition.clone().addScaledVector(stationUp, -stationLift).distanceTo(frame.f.point) > 1) throw new Error('Station capture entry misses physical rendezvous')
    if (obj.model.scale.y / obj.model._physicalRenderScale.y !== app.d.launcherVisualLengthScale.value) throw new Error('Length exaggeration missing')
    if (obj.model.scale.x / obj.model._physicalRenderScale.x !== app.d.launcherVisualRadiusScale.value) throw new Error('Radius exaggeration missing')
    if (leading.isMesh) throw new Error('Yellow leading-edge ball was not removed')
    if (Math.abs(frame.centre.length() - frame.f.point.length()) > 100) throw new Error('Spacecraft moved off its physical trajectory')
    if (leadingPosition.length() - frame.centre.length() < 6000) throw new Error('Station display is not above spacecraft')
    if (app.d.showAdaptiveNuts.value || app.d.numVirtualAdaptiveNuts.value) throw new Error('Adaptive nut still enabled')
    // The station must not oscillate relative to the tracked vehicle around
    // capture completion (~816 s), where event samples have unequal spacing.
    for (let k = -360; k <= 360; k++) {
      const burn = Math.min(m.captureDuration, m.captureDuration + k / 60)
      const time = rendezvous + m.captureDuration + k / 60
      const point = obj.frameAt(ref, time).f.point
      const leading = m.stationAt(time - l.spaceportReleaseTime).leading.position
      const lag = point.angleTo(leading) * m.radius
      const expected = m.endMargin + m.deltaV * burn - 0.5 * app.d.spaceportCaptureAcceleration.value * burn ** 2
      if (Math.abs(lag - expected) > 0.05) throw new Error('Capture transition introduces a tracking oscillation')
    }
    const events = app.shots.resolver.events({type: 'world'}, 0, 1000)
    if (!events.some(e => e.name === 'Spaceport rendezvous at apogee')) throw new Error('Missing rendezvous timeline event')
    if (app.shots.duration < rendezvous + m.captureDuration) throw new Error('Shot ends before capture completes')
    app.render()
    return {rendezvous, apogeeAltitude: m.radius - l.planetRadius,
      apogeeSpeed: m.entrySpeed, circularSpeed: m.circularSpeed,
      captureDuration: m.captureDuration, captureDistance: m.captureDistance}
  })
  console.log(JSON.stringify(report))
  await screenshot('rendezvous')
  await page.evaluate(() => {
    const {app} = window.tetheredRing, l = app.launchSystem, m = l.spaceportMission
    app.shots.jumpToSimTime(l.spaceportReleaseTime + m.apogeeTime + m.captureDuration)
    app.step(0); app.render()
  })
  await screenshot('captured')
  const persistence = await page.evaluate(() => {
    const {app} = window.tetheredRing, l = app.launchSystem, m = l.spaceportMission
    const Class = l.movingObjectClass('virtualLaunchVehicles')
    let previous = null
    for (const extra of [600, 3600, 7200]) {
      app.shots.jumpToSimTime(l.spaceportReleaseTime + m.duration + extra)
      app.step(0)
      const obj = Class.activeObjects.get(0)
      if (!obj?.model?.visible || !app.camera.tracking) throw new Error('Captured vehicle despawned or tracking stopped')
      const frame = obj.getFutureFrame(Class.refFrames[0], 0)
      if (previous && frame.position.distanceTo(previous) < 100000) throw new Error('Captured vehicle froze at end of sampled path')
      previous = frame.position
    }
    return 'Vehicle remains visible, moving and tracked two hours beyond sampled path'
  })
  console.log(persistence)
}
