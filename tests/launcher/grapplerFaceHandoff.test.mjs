import { applyPreset } from '../../src/presets/presets.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3, Matrix4, Quaternion, Scene, Color } from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import '../support/rawImports.mjs'
import { GrapplerFaceHandoffPlan, faceHandoffEnvelope, blendGrapplerPlacement } from '../../src/launcher/grapplerFaceHandoff.js'
import { SledGrapplerPlacementInfo, SledGrapplerGeometry, blendGrapplerGeometry } from '../../src/launcher/SledGrapplerGeometry.js'
import { designRamp, easeQuadInOut } from '../../src/launcher/rampMotion.js'
import { jerkLimitedBrakingProfile } from '../../src/launcher/trackBraking.js'
import { screwContactSide } from '../../src/launcher/launcherPhysics.js'
import { virtualAdaptiveNut, adaptiveNutModel, adaptiveNutFrontReach } from '../../src/launcher/AdaptiveNut.js'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { PixelLOD } from '../../src/scene/PixelLOD.js'
import { grapplerSequencingModes } from '../../src/launcher/grapplerPlacement.js'

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
const ordinary = { lift: 0, raise: 0, neutral: 0, alpha: 0.2, attached: true }

function envelope(down = 2, up = 2) {
  const zero = 10 + down
  const drive = [], brake = []
  for (let i = 0; i <= 200; i++) {
    drive.push({ t: 10 + down * i / 200, fraction: 1 - easeQuadInOut(i / 200) })
    brake.push({ t: zero + up * i / 200, fraction: easeQuadInOut(i / 200) })
  }
  return { start: 10, zero, end: zero + up, drive, brake }
}

test('face transfers reserve load capacity on each side throughout the actual force envelope', () => {
  for (const count of [2, 8, 64]) {
    const e = envelope(), plan = new GrapplerFaceHandoffPlan(e, count, 0.6)
    assert.ok(plan.groups.length >= 2)
    assert.equal(plan.groups[0].from, 0)
    assert.equal(plan.groups.at(-1).to, count)
    for (const group of plan.groups) {
      assert.ok(group.start >= e.start)
      assert.ok(group.end <= e.end)
      near(group.end - group.start, 0.6)
    }
    for (let step = 0; step <= 2400; step++) {
      const time = e.start + (e.end - e.start) * step / 2400
      const states = Array.from({ length: count }, (_, i) => plan.state(i, time))
      const rear = states.filter(s => !s.transferring && s.mix === 0).length
      const front = states.filter(s => !s.transferring && s.mix === 1).length
      assert.ok(rear + front > 0, `all pads disengaged at ${time}`)
      const drive = time < e.zero ? 1 - easeQuadInOut((time - e.start) / (e.zero - e.start)) : 0
      const brake = time > e.zero ? easeQuadInOut((time - e.zero) / (e.end - e.zero)) : 0
      assert.ok(rear / count >= drive - 0.00003, `insufficient accelerating bank at ${time}`)
      assert.ok(front / count >= brake - 0.00003, `insufficient braking bank at ${time}`)
      const poses = states.map((_, i) => plan.pose(i, time, ordinary))
      plan.assertSupport(time, poses)
      for (const state of states) {
        if (state.mix > 0 && state.mix < 1) {
          assert.equal(state.lift, 1)
          assert.equal(state.raise, 1)
          assert.equal(state.neutral, 1)
        }
      }
    }
  }
})

test('handoff uses contiguous strips and stays deterministic when time runs backwards', () => {
  const strips = Array.from({ length: 64 }, (_, i) => Math.floor(i / 16))
  const plan = new GrapplerFaceHandoffPlan(envelope(), 64, 0.6, strips)
  assert.deepEqual(plan.groups.map(g => [g.from, g.to]), [[0, 32], [32, 64]])
  for (let i = 1; i < plan.groups.length; i++) {
    assert.equal(plan.groups[i].from, plan.groups[i - 1].to)
    assert.ok(plan.groups[i].start >= plan.groups[i - 1].start)
  }
  const unsplit = plan.groups.filter(g => g.to === 64 || strips[g.to] !== strips[g.to - 1]).length
  assert.ok(unsplit >= 2)
  for (const time of [10, 11, 12, 13, 14, 12.1, 10.2, 14]) {
    const forward = Array.from({ length: 64 }, (_, i) => plan.state(i, time))
    const reverse = Array.from({ length: 64 }, (_, k) => plan.state(63 - k, time)).reverse()
    assert.deepEqual(forward, reverse)
  }
})

test('face motion is continuous and preserves ordinary poses outside transfers', () => {
  const plan = new GrapplerFaceHandoffPlan(envelope(), 64, 0.6)
  for (const group of plan.groups) {
    const i = group.from
    for (let step = 0; step < 1000; step++) {
      const time = group.start + 0.6 * step / 1000
      const a = plan.state(i, time), b = plan.state(i, time + 0.0006)
      for (const key of ['mix', 'lift', 'raise', 'neutral']) assert.ok(Math.abs(a[key] - b[key]) < 0.015)
    }
    assert.deepEqual(plan.pose(i, group.start - 1, ordinary), ordinary)
    assert.deepEqual(plan.pose(i, group.end + 1, ordinary), ordinary)
  }
})

test('impossible timing warns once and provides usable poses; invalid inputs still fail', t => {
  const warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  for (const [e, duration] of [[envelope(0.1, 0.1), 0.6], [envelope(), 10]]) {
    const plan = new GrapplerFaceHandoffPlan(e, 64, duration)
    const before = warnings.length
    assert.match(warnings.at(-1), /Increase launchVehicleAccelerationTransitionTime/)
    for (const time of [plan.groups[0].start - 1, e.zero, plan.groups.at(-1).end + 1, e.zero]) {
      const poses = Array.from({ length: 64 }, (_, i) => plan.pose(i, time, ordinary))
      assert.ok(poses.every((_, i) => Number.isFinite(plan.state(i, time).mix)))
      assert.doesNotThrow(() => plan.assertSupport(time, poses))
      plan.assertSupport(time, poses.map(pose => ({ ...pose, attached: false })))
    }
    assert.equal(warnings.length, before)
  }
  assert.throws(() => new GrapplerFaceHandoffPlan(envelope(), 1, 0.6), /Increase launchVehicleAccelerationTransitionTime/)
  const invalid = envelope()
  invalid.drive[10].fraction = 2
  assert.throws(() => new GrapplerFaceHandoffPlan(invalid, 64, 0.6), /Invalid.*envelope/)
  const plan = new GrapplerFaceHandoffPlan(envelope(), 64, 0.6)
  const poses = Array.from({ length: 64 }, () => ({ ...ordinary, attached: false }))
  const before = warnings.length
  assert.doesNotThrow(() => plan.assertSupport(12, poses))
  plan.assertSupport(12, poses)
  assert.equal(warnings.length, before + 1)
})

function pad(side) {
  const args = [0.25, 0.33, 0.05, 8, 169, 80, 50, 10, 100000, 20, 64, 0.04, 0.1, 0.01, 0]
  const info = new SledGrapplerPlacementInfo(...args, 0.5, 0.5, [0, 0], 0, null, side, 0.25)
  info.generatePlacementInfo(5, 0.01)
  const geometry = new SledGrapplerGeometry(...args, 5, info.offset, 0, null, side, 0.25)
  return { info, geometry }
}

test('both face meshes have matching topology and retain plate thickness while changing faces', () => {
  const rear = pad(-1), front = pad(1)
  assert.deepEqual(rear.geometry.index.array, front.geometry.index.array)
  for (const mix of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const geometry = blendGrapplerGeometry(rear.geometry, front.geometry, mix)
    const positions = geometry.getAttribute('position')
    assert.ok(positions.array.every(Number.isFinite))
    const contact = new Vector3().fromBufferAttribute(positions, 0)
    const outer = new Vector3().fromBufferAttribute(positions, 3)
    assert.ok(contact.distanceTo(outer) > 0.035, 'plate collapsed during the face change')
    if (mix === 0) assert.deepEqual(positions.array, rear.geometry.getAttribute('position').array)
    if (mix === 1) {
      for (let i = 0; i < positions.array.length; i++) near(positions.array[i], front.geometry.getAttribute('position').array[i], 1e-7)
    }
    geometry.dispose()
  }
  const y = rear.info.offset.y, theta = rear.info.offset.θ
  blendGrapplerPlacement(rear.info, front.info, 0.5)
  near(rear.info.offset.y, (y + front.info.offset.y) / 2)
  near(rear.info.offset.θ, (theta + front.info.offset.θ) / 2)
  rear.geometry.dispose()
  front.geometry.dispose()
})

test('production ramp and jerk-limited braking supply the handoff window without changing the trajectory', () => {
  const radius = 6371000, mu = 3.986004418e14
  const ramp = designRamp({ radius, exitRadius: radius + 2900, entrySpeed: 8000, forwardAcceleration: 80,
    upwardAcceleration: 120, mu, transitionSeconds: 2, upwardJerk: 240 })
  const brake = jerkLimitedBrakingProfile({ initialSpeed: ramp.detach.v, stopDistance: ramp.length - ramp.detach.s - 25,
    radiusAt: s => ramp.atDistance(ramp.detach.s + s).r, mu, jerk: 2400 })
  const e = faceHandoffEnvelope(ramp, brake, 99.375, 80)
  near(e.start, 99.375)
  near(e.zero, 99.375 + ramp.detach.t)
  near(e.end, e.zero + brake.rampTime)
  assert.doesNotThrow(() => new GrapplerFaceHandoffPlan(e, 64, 0.6))
  const plan = new GrapplerFaceHandoffPlan(e, 64, 0.3)
  assert.ok(plan.groups.at(-1).end <= e.end)
  assert.equal(faceHandoffEnvelope(ramp, { rampTime: 0 }, 0, 80), null)
  assert.equal(screwContactSide({ brakingStartDistance: 0, brakingDeceleration: 0 }, 100), -1)
})

test('real pad and actuator instances change faces continuously and mirror the same supported maneuver', t => {
  const saved = Object.getOwnPropertyDescriptors(virtualAdaptiveNut)
  const load = OBJLoader.prototype.load, budget = PixelLOD.buildBudget
  t.after(() => {
    OBJLoader.prototype.load = load
    PixelLOD.buildBudget = budget
    for (const key of Object.getOwnPropertyNames(virtualAdaptiveNut)) {
      if (!(key in saved)) delete virtualAdaptiveNut[key]
    }
    Object.defineProperties(virtualAdaptiveNut, saved)
  })
  OBJLoader.prototype.load = () => {}
  PixelLOD.buildBudget = Infinity
  const initialVelocity = 50, acceleration = 80, speed = 8000
  const horizontalTime = (speed - initialVelocity) / acceleration
  const horizontalLength = (speed ** 2 - initialVelocity ** 2) / (2 * acceleration)
  const e = envelope()
  const shift = horizontalTime - e.start
  for (const key of ['start', 'zero', 'end']) e[key] += shift
  for (const sample of [...e.drive, ...e.brake]) sample.t += shift
  const motion = { initialVelocity, acceleration, horizontalTime, horizontalLength, faceHandoff: e,
    brakingStartTime: e.zero, brakingStartDistance: horizontalLength + 2 * speed, duration: e.end + 2,
    samples: Array.from({ length: 601 }, (_, i) => ({ t: horizontalTime + i / 100,
      s: horizontalLength + speed * i / 100, v: speed, a: 0 })) }
  const params = createParameterDefinitions()
  const values = {
    showAdaptiveNuts: true, numVirtualAdaptiveNuts: 1, adaptiveNutNumModels: 1, adaptiveNutNumGrapplers: 64,
    adaptiveNutBodyLength: 20, adaptiveNutGrapplerLength: 20, adaptiveNutGrapplerMagnetThickness: 0.04,
    adaptiveNutBetweenGrapplerFactor: 0.1, adaptiveNutShaftToGrapplerPad: 0.01,
    adaptiveNutGrapplerSwitchoverTime: 0.6, adaptiveNutGrapplerRangeFactor: 0.01,
    adaptiveNutGrapplerMaxRangeOfMotion: 0.5, launcherMassDriver1InitialVelocity: initialVelocity,
    launchVehicleMassDriverForwardAcceleration: acceleration, launcherMassDriverScrewThreadRadius: 0.33,
    launcherMassDriverScrewShaftOuterRadius: 0.25, launcherMassDriverScrewThreadThickness: 0.05,
    launcherMassDriverScrewThreadTaperRatio: 0.25, launcherMassDriverScrewRevolutionsPerSecond: 169,
    launcherMassDriverScrewThreadStarts: 8, launcherSlowDownPassageOfTime: 1, launcherStartDelayInSeconds: 0,
    launchSystemRightwardScaleFactor: 1, launchSystemForwardScaleFactor: 1, launchSystemUpwardScaleFactor: 1,
  }
  for (const [key, value] of Object.entries(values)) params[key].value = value
  virtualAdaptiveNut.motion = motion
  virtualAdaptiveNut.threadLayout = { motion, startsAt: () => 8, flightsAt: () => 8, threadStartDistance: 0 }
  virtualAdaptiveNut.update(params, motion.samples.at(-1).s)
  const models = []
  new adaptiveNutModel(params, new Scene(), models)
  const model = models[0], nut = new virtualAdaptiveNut(0, 0)
  nut.timeLaunched = 0
  nut.clampedDeltaT = frame => frame.timeSinceStart
  nut.frameAt = (frame, time) => ({
    position: new Vector3(), orientation: new Quaternion(),
    f: { curve: { name: 'launchRampCurve0' }, res: { relevantCurveStartDistance: horizontalLength },
      distance: speed * (time - horizontalTime), egress: false, fallingBack: false },
  })
  const path = { superCurves: [{ name: 'massDriver1Curve' }] }
  const mirror = new Matrix4().makeScale(-1, 1, 1)
  const color = new Color()
  for (const mode of Object.values(grapplerSequencingModes)) {
    virtualAdaptiveNut.sequencingMode = mode
    const snapshots = new Map()
    let previous
    for (let step = 0; step <= 240; step++) {
      const time = e.start + 4 * step / 240
      nut.placeAndOrientModel(model, { timeSinceStart: time, curve: path })
      const pads = model.grappler.pads
      let engaged = 0
      const positions = []
      for (let i = 0; i < 64; i++) {
        for (let row = 0; row < 2; row++) {
          const left = pads.instances[i * 4 + row * 2], right = pads.instances[i * 4 + row * 2 + 1]
          const expected = mirror.clone().multiply(left.matrix).multiply(mirror)
          for (let k = 0; k < 16; k++) near(right.matrix.elements[k], expected.elements[k], 1e-8)
          left.shape.mesh.getColorAt(left.index, color)
          const leftColor = color.getHex()
          right.shape.mesh.getColorAt(right.index, color)
          assert.equal(leftColor, color.getHex())
          if (leftColor === 0x00ff00) engaged++
          const state = virtualAdaptiveNut.facePlan(0).state(i, time)
          if (state.mix > 0 && state.mix < 1) {
            const vertices = left.shape.geometry.getAttribute('position')
            for (let vertex = 0; vertex < vertices.count; vertex++) {
              const point = new Vector3().fromBufferAttribute(vertices, vertex).applyMatrix4(left.matrix)
              const radius = Math.hypot(point.x + virtualAdaptiveNut.launcherMassDriverScrewSidewaysOffset,
                point.z - virtualAdaptiveNut.launcherMassDriverScrewUpwardsOffset)
              assert.ok(radius > 0.33, 'pad crosses the flight while changing faces')
            }
          }
          const hardware = model.grappler.hardware.instances
          for (let part = 0; part < 12; part++) {
            const a = new Vector3().setFromMatrixPosition(hardware[i * 48 + row * 24 + part].matrix)
            const b = new Vector3().setFromMatrixPosition(hardware[i * 48 + row * 24 + 12 + part].matrix)
            near(a.x, -b.x)
            near(a.y, b.y)
            near(a.z, b.z)
          }
          positions.push(new Vector3().setFromMatrixPosition(left.matrix))
        }
      }
      assert.ok(engaged > 0, `${mode}: no real instances gripping at ${time}`)
      if (step % 60 === 0) snapshots.set(step, pads.instances.map(p => [...p.matrix.elements]))
      if (previous) {
        for (let i = 0; i < positions.length; i++) {
          assert.ok(previous[i].distanceTo(positions[i]) < 0.15, `${mode}: discontinuous pad position at ${time}`)
        }
      }
      previous = positions
    }
    for (const step of [240, 180, 120, 60, 0]) {
      nut.placeAndOrientModel(model, { timeSinceStart: e.start + 4 * step / 240, curve: path })
      const actual = model.grappler.pads.instances
      snapshots.get(step).forEach((expected, i) => {
        for (let k = 0; k < 16; k++) near(actual[i].matrix.elements[k], expected[k], 1e-10)
      })
    }
  }
  virtualAdaptiveNut.threadLayout.flightsAt = () => 0
  assert.doesNotThrow(() => nut.placeAndOrientModel(model, { timeSinceStart: e.zero, curve: path }))
})


test('legacy two-stage preset can transfer grapplers within its actual drive-to-brake force window', () => {
  const params = createParameterDefinitions()
  applyPreset('twoStageMassDriver', params, {})
  const p = name => params[name].value
  const radius = 6371000 + p('launcherMassDriverAltitude'), mu = 3.986004418e14
  const ramp = designRamp({ radius, exitRadius: radius + p('launcherRampExitAltitude') - p('launcherMassDriverAltitude'),
    entrySpeed: p('launcherMassDriverExitVelocity'), forwardAcceleration: p('launchVehicleMassDriverForwardAcceleration'),
    upwardAcceleration: p('launchVehicleRampUpwardAcceleration'), mu,
    transitionSeconds: p('launchVehicleAccelerationTransitionTime'), upwardJerk: p('launcherMassDriverUpwardJerk') })
  const brake = jerkLimitedBrakingProfile({ initialSpeed: ramp.detach.v,
    stopDistance: ramp.length - ramp.detach.s - adaptiveNutFrontReach(params) - p('adaptiveNutStopClearance'),
    radiusAt: s => ramp.atDistance(ramp.detach.s + s).r, mu, jerk: p('adaptiveNutDecelerationJerk') })
  const envelope = faceHandoffEnvelope(ramp, brake, 0, p('launchVehicleMassDriverForwardAcceleration'))
  const count = p('adaptiveNutNumGrapplers')
  assert.doesNotThrow(() => new GrapplerFaceHandoffPlan(envelope, count, 0.6))
  const plan = new GrapplerFaceHandoffPlan(envelope, count, p('adaptiveNutGrapplerSwitchoverTime'))
  assert.ok(plan.groups.length > 0)
  assert.ok(plan.groups.at(-1).end <= envelope.end)
})
