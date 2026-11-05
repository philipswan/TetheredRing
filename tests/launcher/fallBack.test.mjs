import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallBackProfile } from '../../src/launcher/fallBack.js'

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
