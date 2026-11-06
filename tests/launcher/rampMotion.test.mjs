import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { designRamp, easeQuadInOut, screwStateAtDistance, screwStateAtTime } from '../../src/launcher/rampMotion.js'
import { RampSuperCurve3 } from '../../src/curves/RampSuperCurve3.js'
import { capsuleLoad, specificForceAt } from '../../src/launcher/crewAcceleration.js'
import { threadTime, threadSpeed } from '../../src/launcher/launcherPhysics.js'
import { brakingProfile } from '../../src/launcher/trackBraking.js'
import { ScrewGeometry } from '../../src/launcher/ScrewGeometry.js'
import { ParameterStore } from '../../src/params/ParameterStore.js'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'

const MU = 3.986004418e14, R = 6371000, speed = 8000
const planet = { gravitationalParameter: MU, lengthOfSiderealDay: 86164 }
const options = { radius: R, exitRadius: R + 2900, entrySpeed: speed, forwardAcceleration: 80, upwardAcceleration: 120,
  transitionSeconds: 2, upwardJerk: 240, mu: MU, rotation: [0.00002, 0.00001, 0.00006] }
const p = designRamp(options)
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('ramp angle eases quadratically, forward drive never increases, and the load rises to its upward target', () => {
  const first = p.atTime(0), initial = new Vector3(first.upward, first.forward, first.fz).normalize()
  const initialAngle = Math.acos(initial.x)
  let lastForward = first.forward, lastMagnitude = 0
  for (let i = 0; i <= 40; i++) {
    const t = 2 * i / 40, a = p.atTime(t), e = easeQuadInOut(t / 2)
    const currentAngle = Math.acos(Math.max(-1, Math.min(1, a.upward / a.magnitude)))
    near(currentAngle, initialAngle * (1 - e), 1e-6)
    assert.ok(a.forward <= lastForward + 1e-6)
    lastForward = a.forward
    if (a.upward >= 0) { assert.ok(a.magnitude >= lastMagnitude - 1e-6); lastMagnitude = a.magnitude }
    assert.ok(a.magnitude <= 120 + 1e-6)
    assert.ok(a.forward >= -1e-9)
  }
  near(p.detach.t, 2)
  near(p.detach.forward, 0)
  near(p.detach.upward, 120)
  near(p.samples.at(-1).r, R + 2900, 1e-5)
  const h = 1e-4
  assert.ok((p.atTime(h).angle - first.angle) / h < 0.001)
  assert.ok((p.atTime(2).angle - p.atTime(2 - h).angle) / h < 0.001)
})

test('upward release has bounded jerk and joins ballistic flight at zero specific force', () => {
  const release = p.transitionSeconds + p.holdSeconds
  near(p.releaseSeconds, 1)
  let maxJerk = 0
  for (let i = 0; i < 100; i++) {
    const t = release + i / 100
    maxJerk = Math.max(maxJerk, (p.atTime(t).upward - p.atTime(t + 0.01).upward) / 0.01)
  }
  assert.ok(maxJerk <= 240 + 1e-5)
  assert.ok(maxJerk > 230)
  const last = p.atTime(p.duration)
  near(Math.hypot(last.fx, last.fy, last.fz), 0)
  const h = 0.0001
  assert.ok(p.atTime(p.duration - h).upward / h < 0.1)
})

test('integrated position derivatives produce the commanded proper force in a rotating frame', () => {
  const omega = new Vector3(...options.rotation)
  for (const t of [0.3, 0.81, 1.37, 2, 3.5, p.duration - 0.2]) {
    const a = p.atTime(t), h = 0.002
    const before = p.atTime(t - h), after = p.atTime(t + h)
    const position = new Vector3(a.px, a.py, a.pz), velocity = new Vector3(a.vx, a.vy, a.vz)
    const acceleration = new Vector3(after.vx - before.vx, after.vy - before.vy, after.vz - before.vz).divideScalar(2 * h)
    acceleration.add(new Vector3().crossVectors(omega, velocity).multiplyScalar(2))
      .add(new Vector3().crossVectors(omega, new Vector3().crossVectors(omega, position)))
      .addScaledVector(position, MU / position.length() ** 3)
    assert.ok(acceleration.distanceTo(new Vector3(a.fx, a.fy, a.fz)) < 0.02, `force mismatch at ${t}`)
    near((after.s - before.s) / (2 * h), a.v, 0.01)
    near(p.atDistance(a.s).t, t, 1e-8)
  }
})

test('capsules align all three load components with the crew front-to-back axis at every ramp time', () => {
  const curve = new RampSuperCurve3(p, new Vector3(R, 0, 0), new Vector3(0, 0, 1))
  for (let t = 0; t <= p.duration; t += 0.073) {
    const a = p.atTime(t), u = a.s / p.length
    const force = specificForceAt(curve, t, planet)
    const load = capsuleLoad(force, curve.getQuaternionAt(u))
    near(load.magnitude, a.magnitude)
    near(load.frontBack, a.magnitude)
    assert.ok(load.sideways < 1e-10)
    const face = new Vector3(0, 1, 0).applyQuaternion(load.orientation).applyQuaternion(curve.getQuaternionAt(u))
    assert.ok(face.dot(force.normalize()) > 1 - 1e-10)
  }
  assert.equal(specificForceAt({ name: 'elevatedEvacuatedTube' }, 0, planet).length(), 0)
  const origin = curve.getPointAt(0.5)
  const zones = curve.getStartFinishZoneIndices(origin, 10)
  assert.ok(zones[0] <= 0.5 && zones[1] >= 0.5)
})

test('horizontal proper load includes gravity and planetary curvature without double-counting', () => {
  const v = 7000, a = 80
  const curve = { name: 'massDriver2Curve', getLength: () => 100000, getDuration: () => 10,
    tTod: t => v * t + a * t * t / 2, tTos: t => v + a * t,
    getPointAt: () => new Vector3(R, 0, 0), getTangentAt: () => new Vector3(0, 0, -1), getNormalAt: () => new Vector3(1, 0, 0) }
  const force = specificForceAt(curve, 0, planet), w = 2 * Math.PI / planet.lengthOfSiderealDay
  near(force.x, MU / R ** 2 - (v + w * R) ** 2 / R)
  near(force.z, -a, 1e-5)
})

test('ramp screws preserve horizontal phase and follow the nut through acceleration, detachment and braking', () => {
  const initialVelocity = 50, acceleration = 80
  const horizontalTime = (speed - initialVelocity) / acceleration
  const horizontalLength = (speed ** 2 - initialVelocity ** 2) / (2 * acceleration)
  const brake = brakingProfile({ initialSpeed: p.detach.v, stopDistance: p.length - p.detach.s,
    radiusAt: s => p.atDistance(p.detach.s + s).r, mu: MU })
  const samples = p.samples.filter(a => a.t <= p.detach.t).map(a => ({ s: horizontalLength + a.s, t: horizontalTime + a.t, v: a.v }))
  for (let i = 1; i <= 1000; i++) {
    const t = brake.duration * i / 1000
    samples.push({ s: horizontalLength + p.detach.s + brake.tTod(t), t: horizontalTime + p.detach.t + t, v: brake.tTos(t) })
  }
  const motion = { samples, horizontalTime, horizontalLength, initialVelocity, acceleration }
  const offset = 10
  for (const time of [horizontalTime - 0.1, horizontalTime, horizontalTime + 0.5, horizontalTime + p.detach.t, samples.at(-2).t]) {
    const a = screwStateAtTime(motion, time)
    near(screwStateAtDistance(motion, a.s).t, time, 1e-7)
    near(threadTime(a.s + offset, initialVelocity, offset, acceleration, motion), -2 * initialVelocity / acceleration - time, 1e-6)
    near(Math.abs(threadSpeed(a.s + offset, initialVelocity, offset, acceleration, motion)), a.v, 1e-6)
  }
  assert.ok(screwStateAtTime(motion, horizontalTime + 1).v > speed)
  assert.ok(samples.at(-2).v < p.detach.v)
  near(samples.at(-1).v, 0)
  const geometry = new ScrewGeometry(5, 0.25, 0.2, 0.33, 0.05, 0.5, 8,
    horizontalLength + p.detach.s + 100, initialVelocity, offset, 169, acceleration, 12, 1, 12, 512, 0, motion)
  assert.ok(geometry.getAttribute('position').array.every(Number.isFinite))
  geometry.dispose()
})

test('legacy shot acceleration names migrate while current names take precedence', () => {
  const store = new ParameterStore(createParameterDefinitions())
  assert.deepEqual(store.restore({ launcherMassDriverForwardAcceleration: 81, launcherRampUpwardAcceleration: 121 }), [])
  assert.equal(store.get('launchVehicleMassDriverForwardAcceleration'), 81)
  assert.equal(store.get('launcherRampUpwardAcceleration'), 121)
  store.set('launcherMassDriverForwardAcceleration', 85)
  assert.equal(store.get('launchVehicleMassDriverForwardAcceleration'), 85)
  store.restore({ launchVehicleMassDriverForwardAcceleration: 90, launcherMassDriverForwardAcceleration: 60 })
  assert.equal(store.snapshot().launchVehicleMassDriverForwardAcceleration, 90)
  assert.equal(store.snapshot().launcherMassDriverForwardAcceleration, undefined)
  assert.equal(store.get('launcherMassDriverUpwardJerk'), 240)
})


test('invalid ramp time steps and rotation vectors fail before numerical integration', () => {
  assert.throws(() => designRamp({ ...options, exitRadius: R + 1 }), /ramp is too short/)
  for (const patch of [{ maxStep: 0 }, { transitionSeconds: 0 }, { rotation: [0, NaN, 0] }, { rotation: [0, 0] }, { upwardJerk: 0 }]) {
    assert.throws(() => designRamp({ ...options, ...patch }), /Invalid ramp/)
  }
})
