import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ClassicCameraController } from '../../src/camera/ClassicCameraController.js'
import { CameraController } from '../../src/camera/CameraController.js'
import { createCameraControlSwitch } from '../../src/camera/CameraControlSwitch.js'

const radius = 6371000
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

function fixture(t, Controller = ClassicCameraController) {
  let wallMs = 0
  t.mock.method(performance, 'now', () => wallMs)
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor)
    else delete globalThis.document
  })
  const domElement = new EventTarget()
  domElement.ownerDocument = globalThis.document
  domElement.style = {}
  const refFrame = { timeSinceStart: 0, wedges: [{}] }
  const queries = []
  const classes = ['virtualLaunchVehicles', 'virtualAdaptiveNuts', 'virtualLaunchSleds']
  for (const [i, name] of classes.entries()) {
    refFrame.wedges[0][name] = [{
      getFuturePosition(ref, dt) {
        queries.push(dt)
        return new THREE.Vector3(radius + 10, 100 + i * 20 + 11123 * (ref.timeSinceStart + dt), 0)
      },
      getFutureFrame: () => ({ forward: new THREE.Vector3(0, 1, 0), upward: new THREE.Vector3(1, 0, 0) }),
    }]
  }
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1e8)
  const options = {
    camera, domElement, planetRadius: radius, nonGUIParams: {}, enableVR: false,
    planetCoordSys: new THREE.Object3D(), ellipsoid: { a: radius, f: 0 },
    store: { derived: {
      logZoomRate: { value: -3 }, trackingMode: { value: 0 },
      showTrackingMarkers: { value: false }, orbitControlsRotateSpeed: { value: 1 },
      cameraMinGroundClearance: { value: 0 }, cameraTransitionTime: { value: 2 },
    } },
    getTrackerContext: () => ({ launchSystem: { refFrames: [refFrame] } }),
  }
  const controller = new Controller(options)
  controller.setState({
    position: [radius + 500, 0, 1000], target: [radius, 0, 0],
    up: [1, 0, 0], orbitUp: [1, 0, 0], fov: 45,
  })
  controller.update(0, 0, 0)
  t.after(() => {
    controller.controls.dispose()
    for (const marker of [controller.trackingMarker, controller.targetMarker, controller.orbitMarker]) {
      marker.geometry.dispose()
      marker.material.dispose()
    }
  })
  return {
    controller, options, refFrame, queries,
    advance(rate = 0, interactionDt, wallSeconds = 1 / 60) {
      wallMs += 1000 * wallSeconds
      refFrame.timeSinceStart += rate / 60
      controller.update(refFrame.timeSinceStart, rate / 60, interactionDt)
    },
  }
}

for (const rate of [0, 0.1, 0.0025, 1, -0.1]) {
  test(`Classic number keys converge on the live object in two real seconds at rate ${rate}`, t => {
    const { controller: c, advance, queries } = fixture(t)
    for (const key of [0, 1, 2]) {
      c.stopTracking()
      assert.equal(c.toggleTracking(key), true)
      for (let i = 0; i < 60; i++) advance(rate)
      assert.equal(c.tweeningActive, true)
      for (let i = 0; i < 61; i++) advance(rate)
      assert.equal(c.tweeningActive, false)
      near(c.controls.target.distanceTo(c.tracker.getPosition(0)), 0)
      advance(rate)
      near(c.controls.target.distanceTo(c.tracker.getPosition(0)), 0)
    }
    assert.ok(queries.every(dt => dt === 0), 'retargeting must not predict ahead in simulated time')
  })
}

test('retargeting responds to time-warp changes and seeks during the transition', t => {
  const { controller: c, advance, refFrame } = fixture(t)
  c.toggleTracking(1)
  for (let i = 0; i < 30; i++) advance(0.1)
  refFrame.timeSinceStart = 30
  for (let i = 0; i < 30; i++) advance(-0.1)
  for (let i = 0; i < 61; i++) advance(0)
  near(c.controls.target.distanceTo(c.tracker.getPosition(0)), 0)
  assert.equal(c.tweeningActive, false)
})

test('slow rendering does not stretch the tracking transition', t => {
  const { controller: c, advance } = fixture(t)
  c.toggleTracking(1)
  advance(0, undefined, 1)
  assert.equal(c.tweeningActive, true)
  near(c.tweenClockMs, 1000)
  advance(0, undefined, 1)
  assert.equal(c.tweeningActive, false)
  near(c.controls.target.distanceTo(c.tracker.getPosition(0)), 0)
})

test('switching or releasing tracked objects cancels competing transitions', t => {
  const { controller: c, advance } = fixture(t)
  let released = 0
  c.trackingReleased = () => released++
  c.toggleTracking(0)
  for (let i = 0; i < 30; i++) advance()
  c.toggleTracking(1)
  assert.equal(c.tweens.getAll().length, 1)
  for (let i = 0; i < 121; i++) advance()
  near(c.controls.target.distanceTo(c.tracker.getPosition(0)), 0)
  c.toggleTracking(2)
  advance()
  c.toggleTracking(2)
  const target = c.controls.target.clone()
  for (let i = 0; i < 121; i++) advance()
  assert.equal(c.tracking, false)
  assert.equal(c.tweens.getAll().length, 0)
  assert.equal(released, 1)
  near(c.controls.target.distanceTo(target), 0)
})

test('follow, static retargeting, lost objects and shot placement do not leave stale tweens', t => {
  const { controller: c, advance } = fixture(t)
  const entry = { type: 'shotAnchor', frame: 'world', getPosition: () => new THREE.Vector3(radius, 500, 0) }
  assert.equal(c.follow(entry), true)
  for (let i = 0; i < 121; i++) advance()
  near(c.controls.target.distanceTo(entry.getPosition()), 0)
  c.stopTracking()
  const staticTarget = new THREE.Vector3(radius, 200, 0)
  c.tweenTo(staticTarget)
  for (let i = 0; i < 121; i++) advance()
  near(c.controls.target.distanceTo(staticTarget), 0)
  c.follow(entry)
  const state = c.getState()
  c.setState(state)
  assert.equal(c.tweens.getAll().length, 0)
  c.follow(entry)
  entry.getPosition = () => null
  advance()
  assert.equal(c.tracking, false)
  assert.equal(c.tweeningActive, false)
  assert.equal(c.tweens.getAll().length, 0)
})

for (const Controller of [ClassicCameraController, CameraController]) {
  test(`${Controller.name} zoom is independent of pause, slow playback and rewind`, t => {
    const { controller: c, advance } = fixture(t, Controller)
    const state = c.getState()
    const initialDistance = c.camera.position.distanceTo(c.controls.target)
    for (const rate of [0, 0.1, 0.0025, -0.1]) {
      c.setState(state)
      c.zoomDirection = -1
      for (let i = 0; i < 60; i++) advance(rate)
      near(c.camera.position.distanceTo(c.controls.target), initialDistance / 1.001 ** 60, 1e-6)
      c.zoomDirection = 1
      for (let i = 0; i < 60; i++) advance(rate)
      near(c.camera.position.distanceTo(c.controls.target), initialDistance, 1e-6)
      c.zoomDirection = 0
      advance(rate)
      near(c.camera.position.distanceTo(c.controls.target), initialDistance, 1e-6)
    }
  })

  test(`${Controller.name} explicit live-take steps ignore rendering time and repeated frame settlement`, t => {
    const { controller: c, advance } = fixture(t, Controller)
    const initial = c.camera.position.distanceTo(c.controls.target)
    c.zoomDirection = -1
    for (let i = 0; i < 60; i++) advance(0, 0)
    near(c.tweenClockMs, 0)
    near(c.camera.position.distanceTo(c.controls.target), initial)
    for (let i = 0; i < 60; i++) advance(0, 1 / 120)
    near(c.tweenClockMs, 500)
    near(c.camera.position.distanceTo(c.controls.target), initial / 1.001 ** 30, 1e-6)
  })
}

test('switching camera schemes cancels a Classic tracking transition', t => {
  const { controller: classic, options } = fixture(t)
  const smart = new CameraController(options)
  t.after(() => {
    smart.controls.dispose()
    for (const marker of [smart.trackingMarker, smart.targetMarker, smart.orbitMarker]) {
      marker.geometry.dispose()
      marker.material.dispose()
    }
  })
  const camera = createCameraControlSwitch({ classic, smart })
  classic.toggleTracking(1)
  camera.setScheme('smart')
  assert.equal(classic.tweens.getAll().length, 0)
  assert.equal(classic.tracking, false)
})
