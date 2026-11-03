import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sampleCameraPath } from '../../src/shots/CameraPath.js'
import { createShot, parseShot, serializeShot, sampleParameterTrack, validateShot } from '../../src/shots/ShotFormat.js'
import { createTimeMap, solveSpeedFor } from '../../src/shots/ShotTiming.js'
import { subFrameTimes, adaptiveSubFrames } from '../../src/capture/MotionBlur.js'

const R = 6.4e6
const key = (time, x) => ({ time, position: [R + x, 1, 2], target: [R, 0, 0], up: [1, 0, 0], fov: 45 })

test('smooth path passes exactly through every keyframe', () => {
  const camera = { interpolation: 'smooth', keyframes: [key(0, 0), key(1, 10), key(3, 50), key(4, 20)] }
  for (const k of camera.keyframes) {
    const s = sampleCameraPath(camera, k.time)
    assert.deepEqual(s.position, k.position)
  }
})

test('smooth path keeps sub-millimetre precision at planet scale', () => {
  const camera = { interpolation: 'smooth', keyframes: [key(0, 0), key(1, 0.001), key(2, 0.002)] }
  const s = sampleCameraPath(camera, 0.5)
  assert.ok(Math.abs(s.position[0] - (R + 0.0005)) < 1e-6, `got ${s.position[0] - R}`)
})

test('linear path and clamping outside the keyframe range', () => {
  const camera = { interpolation: 'linear', keyframes: [key(0, 0), key(2, 20)] }
  assert.equal(sampleCameraPath(camera, 1).position[0], R + 10)
  assert.equal(sampleCameraPath(camera, -5).position[0], R)
  assert.equal(sampleCameraPath(camera, 50).position[0], R + 20)
})

test('shot round-trips through JSON and validates', () => {
  const shot = createShot({ preset: 'default', parameters: { a: 1 }, startTime: 12.5 })
  shot.camera.keyframes.push(key(0, 0), key(1, 1))
  const copy = parseShot(serializeShot(shot))
  assert.deepEqual(copy.camera, shot.camera)
  assert.equal(copy.simulation.startTime, 12.5)
})

test('validation reports useful errors', () => {
  assert.throws(() => parseShot('{'), /Invalid shot file/)
  assert.throws(() => validateShot({ format: 'nope' }), /format/)
  const shot = createShot({ preset: 'default', parameters: {}, startTime: 0 })
  shot.camera.keyframes.push(key(1, 0), key(0, 0))
  assert.throws(() => validateShot(shot), /earlier/)
})

test('parameter tracks interpolate numbers and step other values', () => {
  const track = [{ time: 0, value: 0 }, { time: 2, value: 1 }]
  assert.equal(sampleParameterTrack(track, 1), 0.5)
  assert.equal(sampleParameterTrack([{ time: 0, value: false }, { time: 1, value: true }], 0.5), false)
  assert.equal(sampleParameterTrack([{ time: 0, value: false }, { time: 1, value: true }], 1), true)
})

test('eased keyframes stop the camera; others keep it moving', () => {
  const keys = [key(0, 0), key(1, 10), key(2, 20)]
  const speed = (camera, t) => (sampleCameraPath(camera, t + 1e-4).position[0] - sampleCameraPath(camera, t - 1e-4).position[0]) / 2e-4
  const free = { interpolation: 'smooth', keyframes: keys.map(k => ({ ...k, motion: 'direct' })) }
  assert.ok(Math.abs(speed(free, 1) - 10) < 1e-3)
  const eased = { interpolation: 'smooth', keyframes: keys.map((k, i) => ({ ...k, motion: 'direct', ease: i === 1 })) }
  assert.ok(Math.abs(speed(eased, 1)) < 1e-2, `speed ${speed(eased, 1)}`)
})

test('orbit motion zooms out evenly in log-distance and keeps the subject in frame', () => {
  const subject = [R, 0, 0]
  const far = [0, 0, 0]
  const keys = [
    { time: 0, position: [R - 50, 0, 0], target: subject, up: [0, 0, 1], fov: 45 },
    { time: 10, position: [0, 3e7, 0], target: far, up: [0, 0, 1], fov: 45 },
  ]
  const camera = { interpolation: 'smooth', keyframes: keys }
  const at = (t) => sampleCameraPath(camera, t)
  // Distance to the target grows by roughly the same factor per second.
  const dist = (p) => Math.hypot(...p.position.map((x, i) => x - p.target[i]))
  const d = [2, 5, 8].map(t => Math.log10(dist(at(t))))
  assert.ok(d[0] < d[1] && d[1] < d[2])
  // Early in the zoom the subject is still near the middle of the view.
  const p = at(1)
  const view = p.target.map((x, i) => x - p.position[i])
  const toSubject = subject.map((x, i) => x - p.position[i])
  const cos = view.reduce((s, x, i) => s + x * toSubject[i], 0) / Math.hypot(...view) / Math.hypot(...toSubject)
  assert.ok(cos > Math.cos(Math.PI / 8), `subject is ${(Math.acos(cos) * 180 / Math.PI).toFixed(1)} degrees off-centre`)
  // And the path still passes through the keyframes.
  assert.deepEqual(at(10).position, keys[1].position)
})

test('keyframes are resolved through their anchors at the current time', () => {
  const camera = { interpolation: 'smooth', keyframes: [{ ...key(0, 0), anchor: { type: 'x' } }, { ...key(1, 0), anchor: { type: 'x' } }] }
  const shift = 1000
  const resolve = (k) => ({ ...k, position: k.position.map((x, i) => (i === 0 ? x + shift : x)), target: k.target.map((x, i) => (i === 0 ? x + shift : x)) })
  assert.equal(sampleCameraPath(camera, 0.5, resolve).position[0], R + shift)
})

test('time warp integrates the speed exactly and inverts', () => {
  const map = createTimeMap([{ time: 0, speed: 1 }, { time: 2, speed: 100 }, { time: 4, speed: 100 }])
  // The offset is the integral of the speed (checked numerically) ...
  let integral = 0
  const n = 20000
  for (let i = 0; i < n; i++) integral += map.speedAt(5 * (i + 0.5) / n) * 5 / n
  assert.ok(Math.abs(map.simOffsetAt(5) - integral) < 1e-6 * integral, `${map.simOffsetAt(5)} vs ${integral}`)
  assert.ok(Math.abs(map.simOffsetAt(5) - map.simOffsetAt(4) - 100) < 1e-9)
  // ... the ramp is geometric (10x halfway from 1x to 100x, give or take the floor near 0) ...
  assert.ok(Math.abs(map.speedAt(1) - 10) < 0.3)
  // ... and it inverts.
  for (const u of [-1, 0.3, 1.7, 3, 6]) assert.ok(Math.abs(map.videoTimeAt(map.simOffsetAt(u)) - u) < 1e-9, `u=${u}`)
  assert.equal(createTimeMap([{ time: 0 }, { time: 1 }]).simOffsetAt(3), 3)
  // A frozen stretch maps back to its start, and speeds near 0 behave like 0.
  const frozen = createTimeMap([{ time: 0, speed: 0 }, { time: 1, speed: 0 }, { time: 1.5, speed: 1 }])
  assert.equal(frozen.simOffsetAt(0.5), 0)
  assert.equal(frozen.videoTimeAt(0), 0)
  const near = createTimeMap([{ time: 0, speed: 1 }, { time: 1, speed: 1e-9 }]).simOffsetAt(1)
  assert.ok(Math.abs(near - createTimeMap([{ time: 0, speed: 1 }, { time: 1, speed: 0 }]).simOffsetAt(1)) < 1e-6)
})

test('version 1 shots still load, and anchors are validated', () => {
  const v1 = { ...createShot({ preset: 'default', parameters: {}, startTime: 0 }), version: 1 }
  v1.camera.keyframes.push(key(0, 0))
  assert.equal(validateShot(v1).camera.keyframes.length, 1)
  const shot = createShot({ preset: 'default', parameters: {}, startTime: 0 })
  shot.camera.keyframes.push({ ...key(0, 0), anchor: { type: 'launchVehicle', launchIndex: 74, orient: 'follow' } })
  assert.equal(validateShot(shot).camera.keyframes[0].anchor.launchIndex, 74)
  shot.camera.keyframes[0].anchor = { type: 'launchVehicle' }
  assert.throws(() => validateShot(shot), /launchIndex/)
  shot.camera.keyframes[0].anchor = { type: 'spaceship', launchIndex: 1 }
  assert.throws(() => validateShot(shot), /anchor type/)
})

test('a world-fixed neighbour does not swing a camera riding with an object', () => {
  // The object moves 10 km/s along x; three keyframes ride 30 m behind it, after a world-fixed one.
  const ride = (time) => ({ time, position: [-30, 5, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 45, anchor: { type: 'thing' } })
  const keys = [{ time: 0, position: [0, 1e5, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 45 }, ride(9), ride(16), ride(24)]
  for (const t of [10, 12.5, 15, 20]) {
    const objectX = 1e4 * t
    const resolve = (k) => (k.anchor ? { ...k, position: [k.position[0] + objectX, k.position[1], k.position[2]], target: [objectX, 0, 0] } : k)
    const p = sampleCameraPath({ interpolation: 'smooth', keyframes: keys }, t, resolve)
    assert.ok(Math.hypot(p.position[0] - objectX, p.position[1], p.position[2]) < 31, `t=${t}: ${p.position[0] - objectX}`)
  }
})

test('a keyframe speed can be solved to reach a simulated moment', () => {
  const keys = [{ time: 0, speed: 1 }, { time: 4, speed: 1 }, { time: 8, speed: 1 }]
  for (const [j, i, offset] of [[1, 2, 500], [2, 2, 30], [1, 1, 4], [0, 2, 9]]) {
    const { speed, exact } = solveSpeedFor(keys, j, i, offset)
    assert.ok(exact, `${j} ${i} ${offset}`)
    const solved = keys.map((k, n) => (n === j ? { ...k, speed } : k))
    assert.ok(Math.abs(createTimeMap(solved).simOffsetAt(keys[i].time) - offset) < 1e-6 * offset)
  }
  // Even stopping at once from 1x takes some simulated time.
  assert.equal(solveSpeedFor(keys, 2, 2, 1).exact, false)
})

test('motion blur sub-frames are spread over the shutter, centred on the frame', () => {
  const t = subFrameTimes(10, 50, 4, 180)
  assert.equal(t.length, 4)
  const mean = t.reduce((a, b) => a + b, 0) / 4
  assert.ok(Math.abs(mean - 10 / 50) < 1e-12)
  // 180 degrees: the sub-frames cover half the frame interval, evenly.
  assert.ok(Math.abs((t[3] - t[0]) - 0.5 / 50 * 3 / 4) < 1e-12)
  assert.deepEqual(subFrameTimes(3, 30, 1, 360), [0.1])
  const shot = createShot({ preset: 'default', parameters: {}, startTime: 0 })
  assert.equal(validateShot(shot).output.motionBlur, 'off')
  shot.output.motionBlurSamples = 0
  assert.throws(() => validateShot(shot), /motionBlurSamples/)
})

test('adaptive motion blur takes enough sub-frames for the camera to move a step at a time', () => {
  // 300 m of travel across the shutter, 1 m steps: 300 sub-frames.
  const poses = [0, 100, 200, 300].map(x => ({ position: [x, 0, 0], target: [x, 0, 100] }))
  const options = { maxStep: 1, maxPixels: 2, pixelsPerRadian: 1000, minSamples: 4, maxSamples: 1024 }
  assert.equal(adaptiveSubFrames(poses, options), 300)
  assert.equal(adaptiveSubFrames(poses, { ...options, maxSamples: 64 }), 64)
  // Standing still: the minimum. Turning 0.1 rad at 1000 px/rad and 2 px per sub-frame: 50.
  const still = [{ position: [0, 0, 0], target: [0, 0, 1] }, { position: [0, 0, 0], target: [0, 0, 1] }]
  assert.equal(adaptiveSubFrames(still, options), 4)
  const turning = [{ position: [0, 0, 0], target: [0, 0, 1] }, { position: [0, 0, 0], target: [Math.sin(0.1), 0, Math.cos(0.1)] }]
  assert.equal(adaptiveSubFrames(turning, options), 50)
  // The same 300 m travelled 1,000 km from everything moves the scenery far less than a pixel.
  const far = [0, 100, 200, 300].map(x => ({ position: [x, 1e6, 0], target: [x, 0, 0] }))
  assert.equal(adaptiveSubFrames(far, { ...options, planetRadius: 1 }), 4)
})

test('linearEased passes through every keyframe exactly', () => {
  const camera = { interpolation: 'linearEased', cornerSeconds: 1, keyframes: [key(0, 0), key(5, 10), key(5.5, 80), key(8, 20)] }
  for (const k of camera.keyframes) assert.deepEqual(sampleCameraPath(camera, k.time).position, k.position)
})

test('linearEased stays on the straight line between keyframes and does not overshoot', () => {
  // A near-in-time, far neighbour gives a smooth spline a huge tangent at keyframe 1; linearEased,
  // which only ever blends the two adjacent segments, must stay on the straight line instead.
  const keys = [
    { time: 0, position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 45 },
    { time: 45, position: [0, 0, -1400], target: [0, 0, 0], up: [0, 1, 0], fov: 45 },
    { time: 47, position: [0, 0, -5000], target: [0, 0, 0], up: [0, 1, 0], fov: 45 },
  ]
  const eased = { interpolation: 'linearEased', cornerSeconds: 1, keyframes: keys }
  // The middle of the long first segment is exactly the straight blend.
  assert.deepEqual(sampleCameraPath(eased, 22.5).position, [0, 0, -700])
  let max = 0
  for (let t = 0; t <= 45; t += 0.1) max = Math.max(max, Math.hypot(...sampleCameraPath(eased, t).position))
  assert.ok(max < 1401, `linearEased max |pos| ${max.toFixed(1)} should not exceed the 1400 endpoint`)
  // The smooth spline, by contrast, swings far past both endpoints over the same segment.
  const smooth = { interpolation: 'smooth', keyframes: keys.map(k => ({ ...k, motion: 'direct' })) }
  let smoothMax = 0
  for (let t = 0; t <= 45; t += 0.1) smoothMax = Math.max(smoothMax, Math.hypot(...sampleCameraPath(smooth, t).position))
  assert.ok(smoothMax > 3000, `smooth max |pos| ${smoothMax.toFixed(1)} (expected a large overshoot)`)
})

test('linearEased velocity matches each straight segment outside the corners', () => {
  const keys = [key(0, 0), key(10, 100), key(12, 60)]
  const eased = { interpolation: 'linearEased', cornerSeconds: 1, keyframes: keys }
  const speed = (t) => (sampleCameraPath(eased, t + 1e-4).position[0] - sampleCameraPath(eased, t - 1e-4).position[0]) / 2e-4
  assert.ok(Math.abs(speed(5) - 10) < 1e-2, `mid-segment speed ${speed(5)}`)   // 100 m over 10 s
  assert.ok(Math.abs(speed(11) - (-20)) < 1e-2, `next-segment speed ${speed(11)}`) // -40 m over 2 s
})

test('linearEased interpolation and cornerSeconds validate and round-trip', () => {
  const shot = createShot({ preset: 'default', parameters: {}, startTime: 0 })
  shot.camera.interpolation = 'linearEased'
  shot.camera.cornerSeconds = 0.5
  shot.camera.keyframes.push(key(0, 0), key(1, 1))
  const copy = parseShot(serializeShot(shot))
  assert.equal(copy.camera.interpolation, 'linearEased')
  assert.equal(copy.camera.cornerSeconds, 0.5)
  shot.camera.cornerSeconds = -1
  assert.throws(() => validateShot(shot), /cornerSeconds/)
  shot.camera.cornerSeconds = 0.5
  shot.camera.interpolation = 'wobbly'
  assert.throws(() => validateShot(shot), /interpolation/)
})
