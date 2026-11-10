import {spaceportAtmosphere} from '../../src/launcher/spaceportAtmosphere.js'
import { attachSpaceportContinuation } from '../../src/launcher/SpaceportRendezvous.js'
import { MovingVirtualObject, pathDuration, pathZoneIndex, curveFrameAtTime } from '../../src/launcher/VirtualObject.js'
import { StashingFacility } from '../../src/launcher/stashingFacility.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { ParameterStore } from '../../src/params/ParameterStore.js'
import { SpaceportLauncher } from '../../src/presets/SpaceportLauncher.js'
import { solveSpaceportSizing, evaluateSpaceportRamp, createSpaceportMission, orbitalInvariants } from '../../src/launcher/spaceportOrbit.js'
import { applyLauncherVisualScale, resetLauncherVisualScale } from '../../src/launcher/launcherVisuals.js'

const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('Chimborazo launch reaches 300 km, uses a 110 km station with 5 km margins and circularizes', () => {
  const params = createParameterDefinitions(), scene = {}
  SpaceportLauncher(params, scene)
  const d = new ParameterStore(params).derived, sizing = solveSpaceportSizing(d)
  const ramp = evaluateSpaceportRamp(d, sizing.entrySpeed, sizing.upwardAcceleration)
  const mu = ramp.planet.gravitationalParameter
  const mission = createSpaceportMission({position: ramp.position, velocity: ramp.velocity, mu,
    omega: 2 * Math.PI / ramp.planet.lengthOfSiderealDay, deficit: 1000,
    stationLength: d.spaceportStationLength.value, acceleration: 5})
  let lo = 0, hi = mission.apogeeTime
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (mission.stateAt(mid).position.length() - ramp.referenceRadius < d.launcherEvacuatedTubeExitAltitude.value) lo = mid; else hi = mid
  }
  const tubeTime = (lo + hi) / 2
  const atmosphere = spaceportAtmosphere(mission, ramp.planet, d, ramp.referenceRadius, tubeTime)
  assert.equal(d.launcherEvacuatedTubeExitAltitude.value, 14000)
  assert.ok(atmosphere.consumed > 0 && atmosphere.consumed < d.launchVehiclePropellantMass.value)
  assert.ok(atmosphere.peakFlow > 0 && atmosphere.peakFlow < d.launchVehiclePropellantMassFlowRate.value)
  const air = atmosphere.at(tubeTime + 1)
  assert.ok(air.airSpeed > 6000 && air.density > 0 && air.massFlowRate > 0)
  near(air.thrust, air.drag)
  near(atmosphere.consumedAt(tubeTime - 1), 0)
  near(atmosphere.consumedAt(mission.apogeeTime + 100), atmosphere.consumed)
  near(atmosphere.at(tubeTime - 1).massFlowRate, 0)
  near(atmosphere.at(mission.apogeeTime).massFlowRate, 0)
  assert.throws(() => spaceportAtmosphere(mission, ramp.planet,
    {...d, launchVehiclePropellantMass: {value: 0}}, ramp.referenceRadius, tubeTime), /propellant/)
  assert.throws(() => spaceportAtmosphere(mission, ramp.planet,
    {...d, launchVehiclePropellantMassFlowRate: {value: 0}}, ramp.referenceRadius, tubeTime), /flow limit/)
  console.log(`Spaceport drag compensation: ${atmosphere.consumed.toFixed(1)} kg propellant, ${atmosphere.peakFlow.toFixed(1)} kg/s peak flow`)
  near(mission.radius - ramp.referenceRadius, 300000, 0.01)
  near(mission.circularSpeed - mission.entrySpeed, 1000)
  const apogee = mission.stateAt(mission.apogeeTime)
  near(apogee.position.distanceTo(mission.stationAt(mission.apogeeTime).captureStart.position), 0)
  near(mission.inertialAt(mission.apogeeTime).velocity.dot(mission.inertialAt(mission.apogeeTime).position), 0, 0.01)
  for (let i = 0; i < 20; i++) {
    const state = mission.inertialAt(mission.apogeeTime * i / 20)
    const orbit = orbitalInvariants(state.position, state.velocity, mu)
    near(orbit.energy, ramp.energy, 1e-6)
    near(orbit.h / ramp.h, 1, 1e-12)
  }
  const impactTime = mission.ballisticReturnTime(ramp.referenceRadius)
  assert.ok(impactTime > mission.apogeeTime)
  near(mission.ballisticStateAt(mission.apogeeTime).position.distanceTo(apogee.position), 0)
  near(mission.ballisticStateAt(impactTime).position.length(), ramp.referenceRadius, 1e-6)
  assert.ok(mission.ballisticStateAt(impactTime - 1).position.length() > ramp.referenceRadius)
  assert.ok(mission.ballisticStateAt(impactTime).position.dot(mission.ballisticStateAt(impactTime).velocity) < 0)
  near(mission.stateAt(impactTime).position.length(), mission.radius)
  const end = mission.apogeeTime + mission.captureDuration
  near(mission.inertialAt(end).velocity.length(), mission.circularSpeed)
  near(mission.inertialAt(end + 30).position.length(), mission.radius)
  // Rendered/tracked motion must use the exact orbit, including unevenly sampled
  // event boundaries. Check every frame around the end of the capture burn.
  const path = {getDuration: () => mission.duration, getLength: () => 1000000}
  attachSpaceportContinuation({polyCurveForrf4: path, spaceportMission: mission,
    freeFlightPositionCurve: {getLength: () => 1000000}, spaceportReleaseTime: 0, timeWithinEvacuatedTube: 50})
  for (let frame = -360; frame <= 360; frame++) {
    const t = end + frame / 60
    const rendered = curveFrameAtTime(path, t)
    near(rendered.point.distanceTo(mission.stateAt(t).position), 0, 1e-6)
    if (frame >= 0) {
      const lag = rendered.point.angleTo(mission.stationAt(t).leading.position) * mission.radius
      near(lag, mission.endMargin + mission.captureDistance, 0.001)
    }
  }
  near(mission.captureDuration, 200)
  near(mission.captureDistance, 100000)
  near(mission.endMargin, 5000)
  near(apogee.position.angleTo(mission.stationAt(mission.apogeeTime).leading.position) * mission.radius, 5000, 0.001)
  const craft = mission.stateAt(end), leading = mission.stationAt(end).leading
  const angle = craft.position.angleTo(leading.position)
  near(mission.stationLength - angle * mission.radius, 5000, 0.001)
  assert.ok(mission.captureDistance < mission.stationLength)
  assert.equal(scene.spaceportOverviewCamera, true)

  // Changing either display scale must leave all derived engineering values alone.
  params.launcherVisualRadiusScale.value = 10
  params.launcherVisualLengthScale.value = 7
  const other = new ParameterStore(params).derived
  for (const key of Object.keys(d)) {
    if (key.startsWith('launcherVisual')) continue
    assert.deepEqual(other[key], d[key], `Visual scale altered ${key}`)
  }
  assert.throws(() => createSpaceportMission({position: ramp.position, velocity: ramp.velocity,
    mu, omega: 0, deficit: 1000, stationLength: 50000, acceleration: 5}), /too short/)
})

test('render exaggeration preserves the physical centre and does not accumulate on reused models', () => {
  const model = new Group(), pivot = new Vector3(40, 80, 30)
  model.position.set(30, 60, 20); model.scale.set(2, 3, 4)
  model.quaternion.setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 0.8)
  const original = model.position.clone(), physicalScale = model.scale.clone()
  const localCentre = pivot.clone().sub(original).applyQuaternion(model.quaternion.clone().invert()).divide(physicalScale)
  for (let i = 0; i < 3; i++) {
    resetLauncherVisualScale(model); model.position.copy(original)
    applyLauncherVisualScale(model, {radius: 10, length: 20}, pivot)
    near(localCentre.clone().multiply(model.scale).applyQuaternion(model.quaternion).add(model.position).distanceTo(pivot), 0)
    assert.deepEqual(model.scale.toArray(), [20, 60, 40])
  }
  resetLauncherVisualScale(model)
  assert.deepEqual(model.scale, physicalScale)
})

test('exaggerated storage stays inside its display enclosure without enlarging physical storage specs', () => {
  const geometry = new BoxGeometry(2, 20, 3), material = new MeshBasicMaterial(), factors = {radius: 10, length: 20}
  const makeFacility = scale => {
    const component = () => ({stopTime: 10, visualScale: scale, visible: () => true,
      create: () => new Mesh(geometry, material),
      pose: model => { resetLauncherVisualScale(model); model.position.set(0, 0, 0); model.quaternion.identity() },
      render: (model, centre) => applyLauncherVisualScale(model, scale, centre),
      release: model => { resetLauncherVisualScale(model); model.removeFromParent() }})
    return new StashingFacility({parent: new Group(), capacity: 2, tubeRadius: 5,
      frame: {point: new Vector3(), forward: new Vector3(0, 1, 0), upward: new Vector3(0, 0, 1), rightward: new Vector3(1, 0, 0)},
      components: {nut: component(), sled: component()}})
  }
  const physical = makeFacility({radius: 1, length: 1}), visual = makeFacility(factors)
  assert.deepEqual(physical.plan.size, visual.plan.size)
  for (let i = 0; i <= 60; i++) {
    visual.update({time: 10 + i / 4, spacing: 1200, firstLaunch: 0, lastLaunch: 0})
    visual.root.updateMatrixWorld(true)
    for (const {model} of visual.entries.values()) {
      assert.ok(visual.visualPlan.bounds.clone().expandByScalar(1e-6).containsBox(new Box3().setFromObject(model)))
    }
  }
  physical.dispose(); visual.dispose(); geometry.dispose(); material.dispose()
})

test('captured vehicle continues analytically past the sampled path without expiring or freezing', () => {
  const curve = {getLength: () => 1000}
  const path = {getDuration: () => 100, getLength: () => 2000, getZoneIndexAt: () => 7}
  const mission = {stateAt: t => ({position: new Vector3(7000000 * Math.cos(t / 1000), 7000000 * Math.sin(t / 1000), 0),
    velocity: new Vector3(-7000 * Math.sin(t / 1000), 7000 * Math.cos(t / 1000), 0)})}
  attachSpaceportContinuation({polyCurveForrf4: path, spaceportMission: mission,
    freeFlightPositionCurve: curve, spaceportReleaseTime: 10, timeWithinEvacuatedTube: 20})
  assert.equal(pathDuration(path), Infinity)
  assert.equal(pathZoneIndex(path, 7200), 7)
  const frame = curveFrameAtTime(path, 7200)
  near(frame.point.distanceTo(mission.stateAt(7190).position), 0)
  near(frame.forward.dot(frame.upward), 0)
  near(frame.t, 7170)
  class Vehicle extends MovingVirtualObject {}
  const obj = new Vehicle(0), ref = {curve: path, timeSinceStart: 7200}
  assert.equal(obj.deltaTAt(ref), 7200)
  assert.equal(obj.clampedDeltaT(ref), 7200)
  near(curveFrameAtTime(path, 7300).point.distanceTo(frame.point), 699708.3697894966, 0.01)
})


test('exhaust and plasma use exact telemetry and attach to the visually exaggerated vehicle', async () => {
  await import('../support/rawImports.mjs')
  const {LaunchVehicleGlow} = await import('../../src/launcher/LaunchVehicleGlow.js')
  const {getPlanetSpec} = await import('../../src/physics/planets.js')
  const d = new ParameterStore(createParameterDefinitions()).derived
  d.launcherVisualRadiusScale.value = 2000; d.launcherVisualLengthScale.value = 900
  const glow = new LaunchVehicleGlow(), physical = new LaunchVehicleGlow()
  glow.configure(d, getPlanetSpec('Earth'))
  physical.configure({...d, launcherVisualRadiusScale: {value: 1}, launcherVisualLengthScale: {value: 1}}, getPlanetSpec('Earth'))
  assert.deepEqual(glow.shape, physical.shape)
  assert.deepEqual(glow.engine, physical.engine)
  const position = new Vector3(6392137, 0, 0), forward = new Vector3(0, 1, 0)
  const frame = {position, centre: position.clone().addScaledVector(forward, 15), modelForward: forward,
    f: {point: position, t: 1, curve: {telemetryAtTime: () => new Vector3(6500, 800000, 180)}}}
  const air = glow.airAt(frame, 6378137)
  near(air.airSpeed, 6500); near(air.massFlowRate, 180)
  const mesh = new Group(); mesh.position.copy(position)
  applyLauncherVisualScale(mesh, {radius: 2000, length: 900}, frame.centre)
  near(glow.displayPoint(frame, position).distanceTo(mesh.position), 0)
  const tube = () => ({rings: [], visible: false, begin() {this.rings = []},
    addRing(...ring) {this.rings.push(ring)}, end() {this.visible = true}})
  const shown = tube(), actual = tube()
  assert.equal(glow.buildPlume(shown, frame, 6378137), true)
  assert.equal(physical.buildPlume(actual, frame, 6378137), true)
  near(new Vector3(...shown.rings[0].slice(0, 3)).distanceTo(mesh.position), 0)
  near(shown.rings[0][3] / actual.rings[0][3], 2000)
  const earlierFrame = (_ref, t) => ({...frame,
    position: position.clone().addScaledVector(forward, (t - 10) * 6500),
    centre: frame.centre.clone().addScaledVector(forward, (t - 10) * 6500),
    f: {...frame.f, t}})
  const current = {...frame, f: {...frame.f, t: 10}}
  const obj = {frameAt: earlierFrame}
  assert.equal(glow.buildTrail(shown, obj, {}, 10, current, 6378137), true)
  assert.equal(physical.buildTrail(actual, obj, {}, 10, current, 6378137), true)
  near(shown.rings[0][3] / actual.rings[0][3], 2000)
  const envelope = 1.2 * glow.shape.bodyRadius
  const tail = shown.rings.at(-1)[3], physicalTail = actual.rings.at(-1)[3]
  assert.ok(physicalTail > envelope)
  near(tail - envelope * 2000, physicalTail - envelope)
  assert.ok(tail < physicalTail * 2000 / 2)
  glow.dispose(); physical.dispose()
})
