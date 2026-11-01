import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { InteractionFocus, sizeWeight, AFFINITY_HALF_LIFE_MS } from '../../src/camera/InteractionFocus.js'

const P = (x = 0) => new THREE.Vector3(x, 0, 0)
// How big something of `size` m looks at `distance` m, with a 45 degree view 720 px high.
const ppr = 720 / (Math.PI / 4)
const looks = (size, distance) => 2 * size / distance * ppr

const ground = (distance) => ({ kind: 'ground', point: P(1), distance, px: 0 })
const ringWhole = (distance, px = 0) => ({ kind: 'structure', tag: 'ring', point: P(2), distance, px, apparentPx: looks(6.4e6, distance) })
const ringPart = (distance, px = 0) => ({ kind: 'structure', tag: 'ring', point: P(3), distance, px, apparentPx: looks(15, distance) })
const vehicle = (distance, px) => ({ kind: 'object', type: 'transitVehicle', key: 'v', point: P(4), distance, px, apparentPx: looks(30, distance) })

test('size preference peaks at a workable size on screen', () => {
  assert.equal(sizeWeight(80), 1)
  assert.ok(sizeWeight(1) < 0.1, 'a pixel across')
  assert.ok(sizeWeight(1e7) >= 0.3 && sizeWeight(1e7) < 0.4, 'far bigger than the view')
  assert.ok(sizeWeight(2000) > sizeWeight(1e7), 'filling the view beats far bigger')
})

test('far away the whole ring is meant; close up the things on it', () => {
  const f = new InteractionFocus()
  const far = f.choose([ground(2e7), ringWhole(2e7, 10), ringPart(2e7, 10)])
  assert.equal(far.point.x, 2, 'whole ring from 20,000 km')
  const near = f.choose([ground(4e4), ringWhole(300, 0), ringPart(300, 0), vehicle(300, 15)])
  assert.equal(near.kind, 'object', 'the vehicle beside the pointer, 300 m away')
  const part = f.choose([ground(4e4), ringWhole(300, 0), ringPart(300, 0), vehicle(300, 200)])
  assert.equal(part.point.x, 3, 'the part of the ring under the pointer when no vehicle is near it')
})

test('a thin structure near the pointer beats the ground under it', () => {
  const f = new InteractionFocus()
  assert.equal(f.choose([ground(7e4), ringPart(300, 20)]).kind, 'structure')
})

test('a fast flick settles a close call in favour of the ground', () => {
  const f = new InteractionFocus()
  const c = [ground(7e4), ringPart(300, 35)]
  assert.equal(f.choose(c, { speed: 0 }).kind, 'structure')
  assert.equal(f.choose(c, { speed: 20000 }).kind, 'ground')
})

test('affinity makes a target magnetic, and fades', () => {
  const f = new InteractionFocus()
  const c = [ground(7e4), ringPart(300, 60)]
  assert.equal(f.choose(c, { now: 0 }).kind, 'ground', 'too far from the pointer at first')
  for (let i = 0; i < 4; i++) f.reinforce(ringPart(300, 0), 0.5, 0)
  assert.equal(f.choose(c, { now: 1000 }).kind, 'structure', 'after working with it')
  assert.equal(f.choose(c, { now: 10 * AFFINITY_HALF_LIFE_MS }).kind, 'ground', 'long after')
})

test('a double-click picks the object; the followed object is sticky', () => {
  const f = new InteractionFocus()
  const c = [ground(7e4), ringPart(300, 0), vehicle(300, 40)]
  assert.equal(f.choose(c).kind, 'structure')
  assert.equal(f.choose(c, { doubleClick: true }).kind, 'object')
  assert.equal(f.choose([ground(7e4), ringPart(300, 0), { ...vehicle(300, 40), tracked: true }]).kind, 'object')
})

test('a fast flick does not override a structure right at the pointer', () => {
  const f = new InteractionFocus()
  assert.equal(f.choose([ground(7e4), ringPart(300, 5)], { speed: 20000 }).kind, 'structure')
})
