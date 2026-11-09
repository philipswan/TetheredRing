import { launchQueueInfrastructure, launchQueueLayout } from '../../src/launcher/launchQueue.js'
import { LineSuperCurve3 } from '../../src/curves/SuperCurves.js'
import { applyPreset } from '../../src/presets/presets.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { ParameterStore } from '../../src/params/ParameterStore.js'
import { toMarsHawaiiLauncherPresets } from '../../src/presets/toMarsHawaiiLauncherPresets.js'
import { MovingVirtualObject, curveFrameAtTime } from '../../src/launcher/VirtualObject.js'
import { virtualAdaptiveNut } from '../../src/launcher/AdaptiveNut.js'
import { grapplerTelemetry } from '../../src/launcher/grapplerTelemetry.js'
import { screwThreadLayout } from '../../src/launcher/launcherPhysics.js'

const hawaii = () => {
  const defs = createParameterDefinitions()
  toMarsHawaiiLauncherPresets(defs, {})
  return new ParameterStore(defs)
}

test('Hawaii stages four complete assemblies and has a positive screw-free first acceleration phase', () => {
  const store = hawaii(), d = store.derived
  for (const key of ['launcherStagedLaunches', 'numVirtualLaunchVehicles', 'numVirtualLaunchSleds', 'numVirtualAdaptiveNuts']) assert.equal(d[key].value, 4)
  assert.equal(d.showAdaptiveNuts.value, true)
  const v0 = d.launcherMassDriver1InitialVelocity.value, v1 = d.launcherMassDriver2InitialVelocity.value
  assert.equal(v0, 50)
  assert.equal(v1, 200)
  const entry = (v1 ** 2 - v0 ** 2) / (2 * d.launchVehicleMassDriverForwardAcceleration.value)
  assert.ok(entry > 0)
  assert.ok(screwThreadLayout(d).flightsAt(entry) > 0, 'entry speed has room for the grapplers')
})

test('proportional tube sizing doubles with vehicle radius, preserves ratio, and can be disabled', () => {
  const store = hawaii()
  const original = store.derived.launcherMassDriverTubeInnerRadius.value
  store.set('launchVehicleRadius', store.get('launchVehicleRadius') * 2)
  store.derive()
  for (const key of ['launcherMassDriverTubeInnerRadius', 'elevatedEvacuatedTubeInnerRadius', 'elevateEvacuatedTubeInnerRadius']) assert.equal(store.derived[key].value, original * 2)
  store.set('launcherProportionalTubeRadius', false)
  store.derive()
  assert.equal(store.derived.launcherMassDriverTubeInnerRadius.value, store.get('launcherMassDriverTubeInnerRadius'))
})

test('finite staging queue keeps all three classes aligned, rewinds, and never creates a fifth launch', t => {
  const saved = Object.getOwnPropertyDescriptors(MovingVirtualObject)
  t.after(() => Object.defineProperties(MovingVirtualObject, saved))
  MovingVirtualObject.stagedLaunches = 4
  MovingVirtualObject.queueMotion = { period: 20, spacing: 63, advanceDelay: 2, advanceDuration: 10 }
  class Vehicle extends MovingVirtualObject { static numObjects = 4; static tInc = 20 }
  class Sled extends Vehicle {}
  class Nut extends Vehicle {}
  for (const time of [0, 3, 20, 2, 0]) {
    const expected = [0, 1, 2, 3].filter(k => time - k * 20 <= 10)
    for (const cls of [Vehicle, Sled, Nut]) assert.deepEqual(cls.activeLaunchIndices(time, 10), expected)
  }
  const curve = { getPointAt: () => new Vector3(), getTangentAt: () => new Vector3(0, 1, 0), getNormalAt: () => new Vector3(0, 0, 1), tTod: () => 0 }
  const path = { findRelevantCurve: () => ({ relevantCurve: curve, relevantCurveLength: 100, relevantCurveStartTime: 0 }) }
  for (let k = 1; k < 4; k++) assert.equal(curveFrameAtTime(path, -k * 20).point.y, -k * 63)
  assert.ok(curveFrameAtTime(path, -1e-9).point.length() < 1e-6)
  assert.equal(new Nut(3).clampedDeltaT({ timeSinceStart: 0, curve: { getDuration: () => 10 } }), -60)
})

test('telemetry prepares entry geometry before the screws without reporting engaged support', () => {
  const calls = []
  const nut = {
    motion: { initialVelocity: 50, acceleration: 80, horizontalTime: 10, horizontalLength: 4500, duration: 10, samples: [] },
    screwStartDistance: 234.375, initialDistance: 10, threadLayout: { flightsAt: () => 2 },
    adaptiveNutNumGrapplers: 2, switchoverTime: 0.2, screwRevolutionsPerSecond: 169,
    padLiftActuation: 0.04, padRadialActuation: 0.1,
    grapplerStateAt(...args) {
      calls.push(args)
      return { grapplerPoses: [{ attached: true, alpha: 0, lift: 0, raise: 0 }, { attached: true }] }
    },
  }
  const before = grapplerTelemetry(nut, 0, 1, 0)
  assert.ok(before[0].every(p => p.y === 0))
  assert.ok(calls.every(c => c[0] === nut.screwStartDistance && c[4] && c[5] === 200))
  const entryTime = (200 - 50) / 80
  const atEntry = grapplerTelemetry(nut, entryTime, entryTime, 0)
  assert.equal(atEntry[0][0].y, 100)
})

test('nut distance coordinates retain the first phase for agreement with the screw helix', () => {
  const path = { superCurves: [{ name: 'feederRailCurve', getLength: () => 30 }, { name: 'massDriver1Curve', getLength: () => 200 }] }
  assert.equal(virtualAdaptiveNut.distanceAlongScrews(path, { res: { relevantCurveStartDistance: 230 }, distance: 15 }), 215)
})


test('all four real adaptive nuts have valid entry poses phased to the global screw clock', t => {
  const saved = Object.getOwnPropertyDescriptors(virtualAdaptiveNut)
  t.after(() => {
    for (const key of Object.getOwnPropertyNames(virtualAdaptiveNut)) if (!(key in saved)) delete virtualAdaptiveNut[key]
    Object.defineProperties(virtualAdaptiveNut, saved)
  })
  const d = hawaii().derived, v = virtualAdaptiveNut
  v.motion = { initialVelocity: 50, acceleration: d.launchVehicleMassDriverForwardAcceleration.value,
    horizontalTime: 100, horizontalLength: 500000, duration: 100, samples: [] }
  v.threadLayout = screwThreadLayout(d)
  v.update(d, 500000)
  const entry = (200 ** 2 - 50 ** 2) / (2 * v.motion.acceleration)
  const entryTime = (200 - 50) / v.motion.acceleration
  for (let k = 0; k < 4; k++) {
    const globalTime = k * v.tInc + entryTime
    const launchTurn = ((k * v.tInc * v.screwRevolutionsPerSecond) % 1 + 1) % 1
    const state = v.grapplerStateAt(entry, (globalTime * v.screwRevolutionsPerSecond) % 1, entryTime, launchTurn, true, 200)
    assert.equal(state.grapplerPoses.length, d.adaptiveNutNumGrapplers.value)
    assert.ok(state.grapplerPoses.some(p => p.attached), `nut ${k} has no support at entry`)
    assert.ok(state.grapplerPoses.every(p => [p.alpha, p.lift, p.raise].every(Number.isFinite)))
    const rewind = v.grapplerStateAt(entry, (globalTime * v.screwRevolutionsPerSecond) % 1, entryTime, launchTurn, true, 200)
    assert.deepEqual(rewind.grapplerPoses, state.grapplerPoses)
  }
})


test('Hawaii initial camera frames the full queue instead of the lead assembly close-up', () => {
  const defs = createParameterDefinitions(), options = {}
  toMarsHawaiiLauncherPresets(defs, options)
  assert.equal(defs.showLauncherOceanTerminal.value, true)
  const camera = options.launchTrackCamera
  const queue = launchQueueLayout(new ParameterStore(defs).derived).queueLength
  const front = defs.launchVehicleForwardsOffset.value + defs.launchVehicleBodyLength.value + defs.launchVehicleNoseconeLength.value
  const span = queue + front
  assert.ok(camera.target.forward > -queue && camera.target.forward < front)
  assert.ok(camera.position.right > span)
  assert.ok(camera.position.up > 0)
})


test('two-stage preset queues four complete assemblies with a gap instead of spreading past launches downrange', t => {
  const saved = Object.getOwnPropertyDescriptors(MovingVirtualObject)
  t.after(() => Object.defineProperties(MovingVirtualObject, saved))
  const p = createParameterDefinitions()
  applyPreset('twoStageMassDriver', p, {})
  assert.equal(p.launcherStagedLaunches.value, 4)
  assert.equal(p.launcherPrepopulatedLaunches.value, 0)
  assert.equal(p.launchVehicleSpacingInSeconds.value, 20)
  assert.equal(p.launcherQueueAdvanceDelay.value, 2)
  assert.equal(p.launcherQueueAdvanceDuration.value, 10)
  // The separate history mode remains available when explicitly selected.
  MovingVirtualObject.stagedLaunches = 0
  MovingVirtualObject.prepopulatedLaunches = 6
  class Train extends MovingVirtualObject {
    static numObjects = 6 // Separate legacy history-mode fixture.
    static tInc = 20
  }
  assert.equal(p.numVirtualLaunchVehicles.value, 4)
  assert.equal(p.numVirtualAdaptiveNuts.value, 4)
  assert.equal(p.numVirtualLaunchSleds.value, 4)
  assert.deepEqual(Train.activeLaunchIndices(0, 200), [-5, -4, -3, -2, -1, 0])
  assert.deepEqual(Train.activeLaunchIndices(20, 200), [-4, -3, -2, -1, 0, 1])
  assert.deepEqual(Train.activeLaunchIndices(0, 200), [-5, -4, -3, -2, -1, 0])
  assert.deepEqual(Train.activeLaunchIndices(0, 30), [-1, 0])
  assert.equal(new Train(-5).timeLaunched, -100)
})


test('both presets size queue spacing to their engineered assemblies and enclose all four trains', () => {
  const hawaiiParams = hawaii().derived
  const twoStage = createParameterDefinitions()
  applyPreset('twoStageMassDriver', twoStage, {})
  const twoStageParams = new ParameterStore(twoStage).derived
  const entrance = new LineSuperCurve3(new Vector3(), new Vector3(0, 10, 0), new Vector3(0, 0, 1))
  for (const p of [hawaiiParams, twoStageParams]) {
    const q = launchQueueLayout(p), infrastructure = launchQueueInfrastructure(p, entrance)
    assert.equal(q.count, 4)
    assert.ok(q.queueLength / 3 >= q.front - q.aft + 10)
    const turns = p.launchVehicleSpacingInSeconds.value * p.launcherMassDriverScrewRevolutionsPerSecond.value
    assert.ok(Math.abs(turns - Math.round(turns)) < 1e-8)
    for (let k = 0; k < 4; k++) {
      const tail = -k * q.spacing
      assert.ok(tail + q.aft > infrastructure.curve.startPoint.y)
      assert.ok(tail + q.front >= tail)
    }
    assert.equal(infrastructure.curve.endPoint.y, 0)
    const rearFront = -q.queueLength + q.front
    assert.ok(infrastructure.terminalFrame.point.y > rearFront)
    assert.ok(infrastructure.terminalFrame.point.y <= -q.queueLength + q.queueLength / 3 + 1e-8)
  }
  for (const p of [hawaiiParams,twoStageParams]) {
    const q = launchQueueLayout(p)
    assert.equal(q.spacing,q.front-q.aft+10)
  }
})
