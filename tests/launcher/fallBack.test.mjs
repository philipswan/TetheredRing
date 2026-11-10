import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallBackProfile, sledReturnProfile, recoveryHeadway, rampRecoveryDistance } from '../../src/launcher/fallBack.js'

const MU = 3.986004418e14
const R = 6.371e6
const g = MU / R ** 2

test('falling back down a slope from rest is uniformly accelerated (near the surface)', () => {
  const sinSlope = 0.1, start = 2000
  const p = fallBackProfile({ startDistance: start, endDistance: 0, radiusAt: (s) => R + s * sinSlope, mu: MU })
  const a = g * sinSlope
  assert.ok(Math.abs(p.duration - Math.sqrt(2 * start / a)) < 0.05)
  assert.ok(Math.abs(p.distanceAt(10) - (start - a * 100 / 2)) < 0.5)
  assert.ok(Math.abs(p.speedAt(10) - a * 10) < 0.01)
  assert.equal(p.distanceAt(0), start)
  assert.equal(p.distanceAt(p.duration + 5), 0)
  assert.ok(Math.abs(p.speedAt(p.duration) - Math.sqrt(2 * a * start)) < 0.1)
})

test('it only ever moves back, and arrives at the end', () => {
  // A ramp that steepens towards the top (as the launcher's does).
  const radiusAt = (s) => R + 3000 * (s / 50e3) ** 2
  const p = fallBackProfile({ startDistance: 50e3, endDistance: 10e3, radiusAt, mu: MU })
  let last = Infinity
  for (let tau = 0; tau <= p.duration; tau += p.duration / 400) {
    const d = p.distanceAt(tau)
    assert.ok(d <= last && d >= 10e3)
    last = d
  }
  assert.ok(Math.abs(p.distanceAt(p.duration) - 10e3) < 1e-6)
})

test('nothing to fall back over: no time at all', () => {
  const p = fallBackProfile({ startDistance: 100, endDistance: 100, radiusAt: () => R, mu: MU })
  assert.equal(p.duration, 0)
  assert.equal(p.distanceAt(3), 100)
})

test('sled coasts back, brakes continuously, and stops at its recovery point', () => {
  const p = sledReturnProfile({ startDistance: 10000, endDistance: 100,
    radiusAt: s => R + s * 0.1, mu: MU })
  assert.ok(p.coastDuration > 0 && p.brakingDuration > 0)
  const t = p.coastDuration
  assert.ok(Math.abs(p.speedAt(t - 1e-6) - p.speedAt(t + 1e-6)) < 1e-3)
  let previous = 10000
  for (let i = 0; i <= 1000; i++) {
    const d = p.distanceAt(p.duration * i / 1000)
    assert.ok(d <= previous + 1e-6 && d >= 100 - 1e-6)
    previous = d
  }
  assert.equal(p.distanceAt(p.duration + 1), 100)
  assert.equal(p.speedAt(p.duration), 0)
})

test('return clearance includes the next train nose and the full recovery lifetime', () => {
  const required = recoveryHeadway({ returnEndTime: 100, returnEndDistance: 600,
    frontReach: 100, outboundDuration: 100, distanceAt: t => 10 * t })
  assert.ok(Math.abs(required - 50) < 1e-6)
  // Below the threshold the nose has reached the returning object before despawn.
  assert.ok(10 * (100 - (required - 1)) + 100 > 600)
  assert.ok(10 * (100 - (required + 1)) + 100 < 600)
})

test('sled recovery point is on the ramp at least 300 m vertically below its top', () => {
  const radiusAt = s => R + 1000 * ((s - 100) / 10000) ** 2
  const s = rampRecoveryDistance({ rampStart: 100, rampEnd: 10100, radiusAt })
  assert.ok(s > 100 && s < 10100)
  assert.ok(radiusAt(10100) - radiusAt(s) >= 300 - 1e-8)
  assert.ok(Math.abs(radiusAt(10100) - radiusAt(s) - 300) < 1e-6)
  assert.throws(() => rampRecoveryDistance({ rampStart: 0, rampEnd: 100,
    radiusAt: s => R + s }), /at least 300 m/)
})
