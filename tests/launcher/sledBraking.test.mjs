import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sledBrakingProfile } from '../../src/launcher/sledBraking.js'

const MU = 3.986004418e14
const R = 6.371e6

test('on a level track the sled brakes at v^2/2d and stops at the stop distance', () => {
  const p = sledBrakingProfile({ initialSpeed: 8000, stopDistance: 200e3, radiusAt: () => R, mu: MU })
  assert.ok(Math.abs(p.deceleration - 8000 ** 2 / 2 / 200e3) < 1e-9)
  assert.equal(p.stopDistance, 200e3)
  // Constant deceleration: stops after v/a, having covered the stop distance.
  assert.ok(Math.abs(p.duration - 8000 / p.deceleration) < 0.01)
  assert.ok(Math.abs(p.tTod(p.duration) - 200e3) < 1e-6)
  assert.ok(Math.abs(p.tTod(10) - (8000 * 10 - p.deceleration * 100 / 2)) < 0.01)
  assert.ok(Math.abs(p.tTos(10) - (8000 - p.deceleration * 10)) < 1e-6)
  assert.equal(p.tTos(p.duration), 0)
  // Before the start and after the stop it stays put.
  assert.equal(p.tTod(-1), 0)
  assert.equal(p.tTod(p.duration + 100), 200e3)
})

test('on a climbing track gravity does part of the braking', () => {
  const climb = 30e3, length = 200e3
  const radiusAt = (s) => R + climb * s / length
  const p = sledBrakingProfile({ initialSpeed: 8000, stopDistance: length, radiusAt, mu: MU })
  const gravityWork = MU / R - MU / (R + climb)
  assert.ok(Math.abs(p.deceleration - (8000 ** 2 / 2 - gravityWork) / length) < 1e-9)
  assert.ok(p.deceleration < 8000 ** 2 / 2 / length)
  assert.equal(p.stopDistance, length)
  // Distance and speed only ever increase and decrease.
  let lastD = -1, lastV = Infinity
  for (let t = 0; t <= p.duration; t += p.duration / 500) {
    const d = p.tTod(t), v = p.tTos(t)
    assert.ok(d >= lastD && v <= lastV + 1e-9)
    lastD = d
    lastV = v
  }
})

test('a sled too slow to reach the stop distance stops where gravity stops it, without braking', () => {
  const radiusAt = (s) => R + s   // straight up
  const p = sledBrakingProfile({ initialSpeed: 100, stopDistance: 10e3, radiusAt, mu: MU })
  assert.equal(p.deceleration, 0)
  assert.ok(p.stopDistance < 10e3 && Math.abs(p.stopDistance - 100 ** 2 / 2 / 9.82) < 20)
  assert.ok(Math.abs(p.tTod(p.duration) - p.stopDistance) < 1e-6)
})
