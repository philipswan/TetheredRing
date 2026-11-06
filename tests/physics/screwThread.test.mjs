import { test } from 'node:test'
import assert from 'node:assert/strict'
import { threadTime, threadSpeed, threadStartDistance, screwThreadLayout } from '../../src/launcher/launcherPhysics.js'
import { screwLengthOffsets } from '../../src/launcher/ScrewGeometry.js'

const params = (values) => Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value }]))
// Big Island launcher screw and grappler dimensions
const bigIsland = {
  launcherMassDriver1InitialVelocity: 2, adaptiveNutBodyLength: 20, launchVehicleMassDriverForwardAcceleration: 50,
  launcherMassDriverScrewRevolutionsPerSecond: 169, launcherMassDriverScrewShaftOuterRadius: 0.228,
  launcherMassDriverScrewThreadRadius: 0.5, launcherMassDriverScrewThreadThickness: 0.07,
  launcherMassDriverScrewThreadTaperRatio: 0.25, adaptiveNutShaftToGrapplerPad: 0.172,
  adaptiveNutGrapplerMagnetThickness: 0.1, adaptiveNutGrapplerPadLiftAwayDistance: 0.01,
  launcherMassDriverScrewThreadStarts: 8,
}

test('thread time and speed are continuous where the nut starts, and the speed never reaches zero', () => {
  const [v0, d0, a] = [2, 10, 80]
  for (const f of [threadTime, threadSpeed]) {
    assert.ok(Math.abs(f(d0 - 1e-6, v0, d0, a) - f(d0 + 1e-6, v0, d0, a)) < 1e-4)
  }
  for (const d of [0, 5, 10, 50, 5000]) assert.ok(Math.abs(threadSpeed(d, v0, d0, a)) >= v0)
})

test('a thread with more starts needs a higher speed to leave room for a pad', () => {
  const geometry = { initialVelocity: 2, initialDistance: 10, acceleration: 50, revolutionsPerSecond: 169,
    shaftRadius: 0.228, threadRadius: 0.5, threadThickness: 0.07, threadTaperRatio: 0.25, padInnerRadius: 0.4, padThickness: 0.11 }
  const distances = [2, 4, 8].map(threadStarts => threadStartDistance({ ...geometry, threadStarts }))
  assert.ok(distances[0] < distances[1] && distances[1] < distances[2])
  // So many starts that a pad cannot fit even with straight flights.
  assert.equal(threadStartDistance({ ...geometry, threadStarts: 64 }), Infinity)
})

test('the layout doubles the starts up to the maximum, using only even numbers', () => {
  const sequence = (max) => screwThreadLayout(params({ ...bigIsland, launcherMassDriverScrewThreadStarts: max })).steps.map(s => s.starts)
  assert.deepEqual(sequence(8), [2, 4, 8])
  assert.deepEqual(sequence(12), [6, 12])
  assert.deepEqual(sequence(10), [10])
  assert.deepEqual(sequence(7), [6])
  assert.deepEqual(sequence(6), [6])
  assert.deepEqual(sequence(1), [2])
  assert.deepEqual(sequence(0), [2, 4, 8])
})

test('extra starts begin on segment boundaries; the screw is a plain shaft before the thread', () => {
  const segment = 5
  const layout = screwThreadLayout(params(bigIsland), segment)
  const [first, ...rest] = layout.steps
  assert.equal(layout.threadStartDistance, first.distance)
  for (const step of rest) assert.ok(Math.abs(step.distance / segment - Math.round(step.distance / segment)) < 1e-9)
  assert.equal(layout.flightsAt(first.distance - 0.01), 0)
  assert.equal(layout.flightsAt(first.distance), 2)
  assert.equal(layout.startsAt(rest[0].distance), 4)
  assert.equal(layout.startsAt(rest[1].distance - 0.01), 4)
})

test('screw rings are sampled per turn of the thread only where the screw is threaded', () => {
  const threadStart = 24.5
  // Entirely before the thread: only lengthwise steps (16 per metre).
  const plain = screwLengthOffsets(5, 0, 2, 10, 80, 169, 16, 50, Infinity, threadStart)
  assert.equal(plain.length, 16 * 5 + 1)
  // Threaded: at least samplesPerTurn rings per turn of the thread.
  const threaded = screwLengthOffsets(5, 30, 2, 10, 80, 169, 16, 50, Infinity, threadStart)
  const turns = 169 * Math.abs(threadTime(35, 2, 10, 80) - threadTime(30, 2, 10, 80))
  assert.ok(threaded.length - 1 >= turns * 50)
})
