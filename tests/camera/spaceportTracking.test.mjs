import test from 'node:test'
import assert from 'node:assert/strict'
import {Group, Vector3} from 'three'
import {ObjectTracker, TRACKABLE_TYPES} from '../../src/camera/ObjectTracker.js'
import {KEY_BINDINGS, installKeyboardShortcuts} from '../../src/input/KeyboardShortcuts.js'

const near = (a, b) => assert.ok(a.distanceTo(b) < 1e-8, `${a.toArray()} != ${b.toArray()}`)

test('6 tracks the spaceport and Shift+6 runs its diagnostic action', () => {
  let index = null, counted = false
  const app = {camera: {toggleTracking: i => { index = i }}, logObjectCounts: () => { counted = true }}
  KEY_BINDINGS.find(b => b.code === 'Digit6' && !b.shiftKey).action(app)
  assert.equal(TRACKABLE_TYPES[index], 'spaceport')
  KEY_BINDINGS.find(b => b.code === 'Digit6' && b.shiftKey).action(app)
  assert.equal(counted, true)
  assert.equal(new Set(KEY_BINDINGS.map(b => `${b.shiftKey ? 'Shift+' : ''}${b.code}`)).size, KEY_BINDINGS.length)
})

test('spaceport tracking follows the displayed centre in world coordinates, predicts and rewinds', () => {
  const parent = new Group(), root = new Group()
  parent.position.set(10, 20, 30); parent.rotation.z = Math.PI / 2; parent.add(root)
  const ref = {timeSinceStart: 20}
  const vehicle = {refFrames: [ref], adjustedTime: t => (t - 2) * 3}
  const launch = {spaceportReleaseTime: 4, movingObjectClass: () => vehicle,
    spaceportStation: {root, frameAt: t => ({position: new Vector3(t, 0, 8),
      forward: new Vector3(0, 1, 0), upward: new Vector3(1, 0, 0)})}}
  const tracker = new ObjectTracker(() => ({launchSystem: launch}))
  assert.equal(tracker.findNearest('spaceport', new Vector3()), true)
  near(tracker.getPosition(), new Vector3(10, 70, 38))
  near(tracker.getPosition(2), new Vector3(10, 76, 38))
  near(tracker.getFrame().forward, new Vector3(-1, 0, 0))
  near(tracker.getFrame().upward, new Vector3(0, 1, 0))
  ref.timeSinceStart = 5
  near(tracker.getPosition(), new Vector3(10, 25, 38))
  launch.spaceportStation = null
  assert.equal(tracker.getPosition(), null)
  assert.equal(tracker.getFrame(), null)
  assert.equal(tracker.findNearest('spaceport', new Vector3()), false)
})


test('keyboard dispatch distinguishes Shift+6 and preserves existing shifted shortcuts', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', {configurable: true, value: class {}})
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'HTMLElement', original)
    else delete globalThis.HTMLElement
  })
  const calls = [], target = new EventTarget()
  const uninstall = installKeyboardShortcuts({camera: {toggleTracking: i => calls.push(['track', i])},
    logObjectCounts: () => calls.push(['count']), moveToLaunchTrajectory: () => calls.push(['launch'])}, target)
  t.after(uninstall)
  for (const [code, shiftKey] of [['Digit6', false], ['Digit6', true], ['KeyJ', true]]) {
    const event = new Event('keydown', {cancelable: true})
    Object.assign(event, {code, shiftKey})
    target.dispatchEvent(event)
    assert.equal(event.defaultPrevented, true)
  }
  assert.deepEqual(calls, [['track', 6], ['count'], ['launch']])
})
