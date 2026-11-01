import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SledGrapplerPlacementInfo } from '../../src/launcher/SledGrapplerGeometry.js'
import { GrapplerLatticePlan } from '../../src/launcher/grapplerLattice.js'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import {
  grapplerPose, grapplerSequencingModes, originalGrapplerPose,
  originalConstantRateSwitchoverSignal,
} from '../../src/launcher/grapplerPlacement.js'

const duration = 0.6
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
const infoAt = (rate, away, n = 8) => ({
  engageable: true,
  rotationRate: rate,
  rotationAway: away,
  maxRotationAway: 0.5 / n,
  launchSledGrapplerMaxRangeOfMotion: 0.5,
  offset: { θ: 2 * Math.PI * away },
})
const pose = (info) => grapplerPose(grapplerSequencingModes.OriginalConstantRate, {
  info, switchoverTime: duration, padLiftPortion: 0.1, padTwistPortion: 0.1,
})

test('constant-rate original starts at phase (a - b) * rate and completes each half-hop in b seconds', () => {
  for (const n of [2, 4, 8]) {
    // Both ends and the middle: opposite drift directions and widely different drift magnitudes.
    for (const rate of [-0.08, -0.02, -0.001, 0.001, 0.02, 0.08]) {
      const speed = Math.abs(rate), limit = 0.5 / n
      const a = limit / speed, b = duration / 2
      for (const side of [-1, 1]) {
        close(originalConstantRateSwitchoverSignal(infoAt(rate, side * (a - b) * speed, n), duration), 0)
        for (const progress of [0.05, 0.1, 0.2, 0.5, 0.8, 1]) {
          const away = side * (a - b + b * progress) * speed
          const info = infoAt(rate, away, n)
          close(originalConstantRateSwitchoverSignal(info, duration), progress)
          const actual = pose(info)
          const expected = originalGrapplerPose({ ...info, switchoverSignal: progress }, 0.1, 0.1)
          for (const key of ['lift', 'raise', 'neutral', 'alpha']) close(actual[key], expected[key])
          assert.equal(actual.attached, false)
        }
      }
    }
  }
})

test('the signal reverses symmetrically after handover without using a schedule', () => {
  const rate = 0.05, limit = 0.5 / 8, b = duration / 2
  for (const t of [0, 0.03, 0.1, 0.2, b]) {
    const before = infoAt(rate, limit - rate * t)
    const after = infoAt(rate, -limit + rate * t)
    close(originalConstantRateSwitchoverSignal(before, duration), originalConstantRateSwitchoverSignal(after, duration))
    if (t === 0) {
      close(pose(before).alpha, 0)
      close(pose(after).alpha, 0)
    }
  }
})

test('unengageable or too-fast grapplers stay retracted rather than shortening the hop', () => {
  for (const rate of [0.5 / 8 / (duration / 2), 1, -1]) {
    const p = pose(infoAt(rate, 0))
    assert.deepEqual(p, { lift: 1, raise: 1, neutral: 1, alpha: 0, attached: false })
  }
  assert.deepEqual(pose({ ...infoAt(0.01, 0), engageable: false }),
    { lift: 1, raise: 1, neutral: 1, alpha: 0, attached: false })
})

test('stationary grapplers remain attached within their mechanical range', () => {
  assert.equal(pose(infoAt(0, 0.02)).attached, true)
  const info = { ...infoAt(0, 0.04), launchSledGrapplerMaxRangeOfMotion: 0.03 }
  assert.equal(pose(info).attached, false)
})

test('a tighter mechanical range starts the switchover earlier', () => {
  const info = { ...infoAt(0.01, 0.03), launchSledGrapplerMaxRangeOfMotion: 0.03 }
  close(originalConstantRateSwitchoverSignal(info, duration), 0)
  close(originalConstantRateSwitchoverSignal({ ...info, rotationAway: 0.05 }, duration),
    (0.05 - 0.03) / (info.maxRotationAway - 0.03))
})

test('the unchanged Original mode still uses its supplied position-based signal', () => {
  const info = { ...infoAt(0.08, 0.04), switchoverSignal: 0.15 }
  assert.deepEqual(grapplerPose(grapplerSequencingModes.Original, {
    info, padLiftPortion: 0.1, padTwistPortion: 0.1,
  }), originalGrapplerPose(info, 0.1, 0.1))
})

test('the saved scheduled mode delegates to the incoming lattice plan, including its output object', () => {
  assert.equal(grapplerSequencingModes.Scheduled, 'scheduled')
  const definitions = createParameterDefinitions()
  assert.equal(definitions.adaptiveNutGrapplerSequencingMode.value, grapplerSequencingModes.Original)
  assert.deepEqual(definitions.adaptiveNutGrapplerSequencingMode.options, grapplerSequencingModes)
  const sampleAt = (t) => Array.from({ length: 4 }, (_, i) => ({
    phase: 0.3 + 0.02 * i + 0.01 * t, rate: 0.01 / 8, n: 8, engageable: true,
  }))
  const plan = new GrapplerLatticePlan(sampleAt, 10, {
    holdLimit: 0.125, switchoverTime: duration, fastestDrift: 0.8 / duration,
  })
  for (const deltaT of [0, 1, 5, 2, 9]) {
    const info = { threadStarts: 8, phase: () => sampleAt(deltaT)[1].phase, rotationRate: 0.01 / 8 }
    const out = {}
    const actual = grapplerPose(grapplerSequencingModes.Scheduled, { plan, info, i: 1, deltaT }, out)
    assert.equal(actual, out)
    assert.deepEqual(actual, plan.pose(1, deltaT, info))
  }
})

test('accelerating screw geometry supplies the timing threshold for aft, middle and forward pads', () => {
  const rates = []
  for (const distance of [0, 10, 19]) {
    const info = new SledGrapplerPlacementInfo(1, 2, 0.2, 8, 20, 50, 100, 0, 100000, 20, 20)
    info.nutSpeed = Math.sqrt(100 ** 2 + 2 * 50 * 100000)
    info.generatePlacementInfo(distance, 0.1)
    assert.equal(info.engageable, true)
    rates.push(info.rotationRate)
    const b = duration / 2
    const start = info.maxRotationAway - Math.abs(info.rotationRate) * b
    assert.ok(start > 0 && start < info.launchSledGrapplerMaxRangeOfMotion)
    for (const progress of [0, 0.1, 0.5, 1]) {
      const target = start + (info.maxRotationAway - start) * progress
      info.additionalRotation += target - info.rotationAway
      info.generatePlacementInfo(distance, 0.1)
      close(originalConstantRateSwitchoverSignal(info, duration), progress, 1e-6)
    }
  }
  assert.ok(rates[2] > rates[1] && rates[1] > rates[0])
})
