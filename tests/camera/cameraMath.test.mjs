import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  levelUp, lookRotation, aimRotation, framingDirection, framingFromDirection, zoomPanPath, slerpUnit,
  classifyWheel, transitionSeconds,
} from '../../src/camera/cameraMath.js'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)
const nearV = (a, b, eps = 1e-9) => { near(a.x, b.x, eps); near(a.y, b.y, eps); near(a.z, b.z, eps) }
const V = (x, y, z) => new THREE.Vector3(x, y, z)

test('levelUp keeps the horizon level when looking sideways', () => {
  const up = levelUp(V(1, 0, 0), V(0, 1, 0), V(0, 0, 1))
  nearV(up, V(0, 1, 0))
  const tilted = levelUp(V(1, -1, 0).normalize(), V(0, 1, 0), V(0, 0, 1))
  near(tilted.dot(V(0, 0, 1)), 0)
  assert.ok(tilted.y > 0)
})

test('levelUp keeps the previous up when looking straight down', () => {
  const up = levelUp(V(0, -1, 0), V(0, 1, 0), V(0, 0.2, 1))
  nearV(up, V(0, 0, 1))
})

test('levelUp is continuous as the view tilts to straight down', () => {
  let prev = null
  for (let i = 0; i <= 200; i++) {
    const a = (Math.PI / 2) * (i / 200)
    const f = V(Math.cos(a), -Math.sin(a), 0)
    const up = levelUp(f, V(0, 1, 0), V(1, 0, 0))
    if (prev) assert.ok(up.angleTo(prev) < 0.05, `jump at ${i}`)
    prev = up
  }
})

test('lookRotation points the camera along forward with up', () => {
  const q = lookRotation(V(1, 0, 0), V(0, 1, 0))
  nearV(V(0, 0, -1).applyQuaternion(q), V(1, 0, 0))
  nearV(V(0, 1, 0).applyQuaternion(q), V(0, 1, 0))
})

test('framing round-trips and aimRotation puts the subject at the framing', () => {
  const f = framingFromDirection(framingDirection(0.2, -0.1))
  near(f.yaw, 0.2)
  near(f.pitch, -0.1)
  const position = V(6.4e6, 10, 3)
  const subject = V(6.4e6 + 100, 50, -40)
  const q = aimRotation(position, subject, position.clone().normalize(), V(0, 0, 1), 0.2, -0.1)
  const d = subject.clone().sub(position).normalize().applyQuaternion(q.clone().invert())
  nearV(d, framingDirection(0.2, -0.1), 1e-9)
})

test('zoomPanPath starts and ends at the two views and zooms out between distant ones', () => {
  const p = zoomPanPath(100, 200, 10000)
  const a = p.at(0)
  const b = p.at(p.S)
  near(a.u, 0, 1e-6)
  near(a.w, 100, 1e-6)
  near(b.u, 10000, 1e-6)
  near(b.w, 200, 1e-6)
  assert.ok(p.at(p.S / 2).w > 200)
})

test('zoomPanPath with no pan is a steady logarithmic zoom', () => {
  const p = zoomPanPath(10, 1e6, 0)
  near(p.at(p.S).w, 1e6, 1e-3)
  near(Math.log(p.at(p.S / 2).w), (Math.log(10) + Math.log(1e6)) / 2, 1e-9)
})

test('slerpUnit handles opposite vectors', () => {
  const m = slerpUnit(V(1, 0, 0), V(-1, 0, 0), 0.5)
  near(m.length(), 1)
  near(m.x, 0)
})

test('wheel classification', () => {
  assert.equal(classifyWheel({ ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: 3 }), 'pinch')
  assert.equal(classifyWheel({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 }), 'wheel')
  assert.equal(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100 }), 'wheel')
  assert.equal(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaX: 2, deltaY: 1 }), 'touchpad')
  assert.equal(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 1.5 }), 'touchpad')
  assert.equal(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 4 }, 'wheel'), 'wheel')
})

test('transition durations are bounded', () => {
  assert.ok(transitionSeconds(0, 0) >= 0.7)
  assert.ok(transitionSeconds(100, Math.PI) <= 5)
})
