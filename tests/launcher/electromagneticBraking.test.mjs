import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { brakingProfile, jerkLimitedBrakingProfile, nutElectromagneticHandoff } from '../../src/launcher/trackBraking.js'
import { designRamp, screwGeometryDistance, screwStateAtDistance } from '../../src/launcher/rampMotion.js'
import { RampSuperCurve3 } from '../../src/curves/RampSuperCurve3.js'

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('electromagnetic tail begins at 200 m/s and retains the exact stop location and time', () => {
  const base = brakingProfile({ initialSpeed: 1000, stopDistance: 1000, radiusAt: () => 6371000, mu: 3.986e14 })
  const profile = { ...base, brakingAt: () => base.deceleration }
  const handoff = nutElectromagneticHandoff(profile, 200)
  near(handoff.speed, 200)
  assert.ok(handoff.distance < profile.stopDistance)
  near(handoff.electromagnetic.stopDistance, 40)
  near(handoff.electromagnetic.tTod(0), 0)
  near(handoff.electromagnetic.tTos(0), 200)
  near(handoff.electromagnetic.tTod(handoff.electromagnetic.duration), handoff.electromagnetic.stopDistance)
  near(handoff.electromagnetic.tTos(handoff.electromagnetic.duration), 0)
  near(handoff.time + handoff.electromagnetic.duration, profile.duration)
  for (let i = 0; i <= 100; i++) {
    const t = profile.duration * i / 100
    near(handoff.screwBrakingAt(t) + handoff.electromagneticBrakingAt(t), profile.brakingAt(t))
  }
  assert.throws(() => nutElectromagneticHandoff(profile, 0), /positive/)
})

test('production jerk-limited braking and ramp geometry end screws before the electromagnetic section', () => {
  const radius = 6371000, mu = 3.986004418e14
  const ramp = designRamp({ radius, exitRadius: radius + 2900, entrySpeed: 8000,
    forwardAcceleration: 80, upwardAcceleration: 120, transitionSeconds: 2, upwardJerk: 240, mu })
  const brake = jerkLimitedBrakingProfile({ initialSpeed: ramp.detach.v,
    stopDistance: ramp.length - ramp.detach.s - 500, jerk: 2400,
    radiusAt: s => ramp.atDistance(ramp.detach.s + s).r, mu })
  const handoff = nutElectromagneticHandoff(brake, 200)
  near(handoff.speed, 200)
  assert.ok(handoff.electromagnetic.duration > 0 && handoff.electromagnetic.stopDistance > 0)
  const start = new Vector3(radius, 0, 0), axis = new Vector3(0, 0, 1)
  const full = new RampSuperCurve3(ramp, start, axis)
  const endDistance = ramp.detach.s + handoff.distance
  const short = new RampSuperCurve3(ramp, start, axis, endDistance)
  near(short.getLength(), endDistance)
  near(short.getPointAt(1).distanceTo(full.getPointAt(endDistance / ramp.length)), 0)
  assert.ok(short.getLength() < ramp.detach.s + brake.stopDistance)
  const samples = brake.samples.map(a => ({ ...a, s: ramp.detach.s + a.s }))
  const motion = { samples, horizontalLength: 0, initialVelocity: 8000, acceleration: 80,
    brakingStartDistance: ramp.detach.s, screwEndTime: handoff.time, screwEndDistance: endDistance }
  const anchor = screwGeometryDistance(motion, 0, endDistance)
  assert.ok(anchor <= endDistance + 1e-6)
  near(screwStateAtDistance(motion, anchor).v, 200, 0.01)
})
