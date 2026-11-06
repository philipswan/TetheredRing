import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3, Line3 } from 'three'
import { ScrewGeometry } from '../../src/launcher/ScrewGeometry.js'
import { CircleSuperCurve3 } from '../../src/curves/CircleSuperCurve3.js'
import { RampSuperCurve3 } from '../../src/curves/RampSuperCurve3.js'
import { designRamp, screwStateAtTime, screwStateAtDistance, screwGeometryDistance } from '../../src/launcher/rampMotion.js'
import { SledGrapplerGeometry, SledGrapplerPlacementInfo } from '../../src/launcher/SledGrapplerGeometry.js'
import { screwContactSide, screwFlightFrontAngle, threadTime } from '../../src/launcher/launcherPhysics.js'

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
const initialVelocity = 50, acceleration = 80, entrySpeed = 8000
const horizontalTime = (entrySpeed - initialVelocity) / acceleration
const horizontalLength = (entrySpeed ** 2 - initialVelocity ** 2) / (2 * acceleration)
const brakingStartTime = horizontalTime + 2, brakingStartDistance = horizontalLength + entrySpeed * 2 + acceleration * 2
const samples = []
for (let i = 0; i <= 100; i++) {
  const t = 2 * i / 100
  samples.push({ t: horizontalTime + t, s: horizontalLength + entrySpeed * t + acceleration * t * t / 2, v: entrySpeed + acceleration * t })
}
const brakeSpeed = entrySpeed + 160, deceleration = 1000
for (let i = 1; i <= 1000; i++) {
  const t = brakeSpeed / deceleration * i / 1000
  samples.push({ t: brakingStartTime + t, s: brakingStartDistance + brakeSpeed * t - deceleration * t * t / 2, v: Math.max(0, brakeSpeed - deceleration * t) })
}
const motion = { samples, horizontalTime, horizontalLength, initialVelocity, acceleration, brakingStartDistance, brakingStartTime }

const shaftRadius = 0.25, threadRadius = 0.33, thickness = 0.05, magnet = 0.04, clearance = 0.01, rps = 169, starts = 8, initialDistance = 10
function padAt(distance, taper = 0.25) {
  const info = new SledGrapplerPlacementInfo(shaftRadius, threadRadius, thickness, starts, rps,
    acceleration, initialVelocity, initialDistance, distance, 20, 64, magnet, 0.1, clearance, 0, 0.5, 0.5, [0, 0], 0, motion, undefined, taper)
  info.generatePlacementInfo(5, 0.01)
  const geometry = new SledGrapplerGeometry(shaftRadius, threadRadius, thickness, starts, rps,
    acceleration, initialVelocity, initialDistance, distance, 20, 64, magnet, 0.1, clearance, 0, 5, info.offset, 0, motion, undefined, taper)
  // Undo local centering, exactly as the left pad's attached instance transform does.
  const position = geometry.getAttribute('position')
  const points = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i)
    .applyAxisAngle(new Vector3(0, 1, 0), -info.offset.θ)
    .add(new Vector3(-info.offset.r * Math.sin(info.offset.θ), info.offset.y, info.offset.r * Math.cos(info.offset.θ))))
  return { info, geometry, points }
}

// Flight phase increases through its material, from the rear face at 0 to the tapered forward face.
function facePhase(point, distance) {
  const phase = 2 * Math.PI * rps * threadTime(distance + point.y, initialVelocity, initialDistance, acceleration, motion)
  const difference = Math.atan2(-point.x, point.z) - phase
  const spacing = 2 * Math.PI / starts
  return ((difference + spacing / 2) % spacing + spacing) % spacing - spacing / 2
}

test('ramp entry preserves the horizontal track side convention and both screw handednesses', () => {
  const radius = 6371000, start = new Vector3(radius, 0, 0), axis = new Vector3(0, 0, 1)
  const profile = designRamp({ radius, exitRadius: radius + 2900, entrySpeed, forwardAcceleration: acceleration,
    upwardAcceleration: 120, mu: 3.986004418e14 })
  const horizontal = new CircleSuperCurve3(new Vector3(), axis, start, -1000)
  const ramp = new RampSuperCurve3(profile, start, axis)
  near(horizontal.getBinormalAt(1).dot(ramp.getBinormalAt(0)), 1)
  near(horizontal.getTangentAt(1).dot(ramp.getTangentAt(0)), 1)
  for (const side of [-1, 1]) {
    const horizontalCentre = horizontal.getBinormalAt(1).multiplyScalar(side)
    const rampCentre = ramp.getBinormalAt(0).multiplyScalar(side)
    assert.ok(horizontalCentre.distanceTo(rampCentre) < 1e-10)
    const localCentre = rampCentre.applyQuaternion(ramp.getQuaternionAt(0).invert())
    near(localCentre.x, -side)
  }
})

test('speed buckets on braking ramps select the braking branch, never a horizontal position at the same speed', () => {
  const target = 7000, time = brakingStartTime + (brakeSpeed - target) / deceleration
  const actual = screwStateAtTime(motion, time)
  const anchor = screwGeometryDistance(motion, target, actual.s)
  near(anchor, actual.s, 1e-5)
  assert.ok(anchor > brakingStartDistance)
  assert.ok(screwGeometryDistance(motion, target, horizontalLength / 2) < horizontalLength)
  near(screwGeometryDistance(motion, 8080, horizontalLength + 9000), screwStateAtTime(motion, horizontalTime + 1).s, 1e-5)
  assert.equal(screwContactSide(null, horizontalLength / 2), -1)
  assert.equal(screwContactSide(motion, brakingStartDistance - 1e-6), -1)
  assert.equal(screwContactSide(motion, brakingStartDistance), 1)
})

test('acceleration and braking pads retain screw handedness while occupying opposite faces outside the flight', () => {
  for (const distance of [horizontalLength / 2, horizontalLength + 5000, brakingStartDistance + 8000, brakingStartDistance + 25000]) {
    for (const taper of [0.1, 0.25, 0.6]) {
      const { info, geometry, points } = padAt(distance, taper)
      const side = screwContactSide(motion, distance)
      assert.equal(geometry.parameters.contactSide, side)
      const start = points.slice(0, 4).reduce((a, b) => a.add(b), new Vector3()).divideScalar(4)
      const end = points.slice(4, 8).reduce((a, b) => a.add(b), new Vector3()).divideScalar(4)
      const theta0 = Math.atan2(-start.x, start.z), theta1 = Math.atan2(-end.x, end.z)
      const dTheta = Math.atan2(Math.sin(theta1 - theta0), Math.cos(theta1 - theta0))
      assert.ok(dTheta / (end.y - start.y) < 0, 'braking must not reverse helix handedness')
      assert.ok(info.threadPitch < 0)
      for (const point of points) {
        const phase = facePhase(point, distance)
        if (side < 0) assert.ok(phase <= 2e-5, `rear pad enters flight: ${phase}`)
        else {
          const signedSpeed = Math.abs(screwStateAtTime(motion, -threadTime(distance + point.y, initialVelocity, initialDistance, acceleration, motion) - 2 * initialVelocity / acceleration).v)
          const outerPitch = -signedSpeed / (2 * Math.PI * threadRadius * rps)
          const face = screwFlightFrontAngle(Math.hypot(point.x, point.z), shaftRadius, threadRadius, thickness, taper, outerPitch)
          assert.ok(phase >= face - 2e-5, `forward pad enters flight: ${phase} < ${face}`)
        }
      }
      geometry.dispose()
    }
  }
})

test('magnetic attraction toward the screw flight accelerates forward and brakes backward', () => {
  for (const distance of [horizontalLength / 2, horizontalLength + 5000, brakingStartDistance + 8000]) {
    const requiredForceSign = Math.sign(screwStateAtDistance(motion, distance + 1).v - screwStateAtDistance(motion, distance).v)
    for (const taper of [0.1, 0.25, 0.6]) {
      const { geometry, points } = padAt(distance, taper)
      try {
        const front = geometry.parameters.contactSide > 0
        const contactCorners = front ? [2, 3] : [0, 1]
        const outerCorners = front ? [0, 1] : [2, 3]
        const sidewallCorners = [0, 1, 3, 5]
        for (let start = 8; start < points.length; start += 8) {
          const corners = sidewallCorners.map(index => points[start + index])
          const contact = corners[contactCorners[0]].clone().add(corners[contactCorners[1]]).multiplyScalar(0.5)
          const outer = corners[outerCorners[0]].clone().add(corners[outerCorners[1]]).multiplyScalar(0.5)
          assert.equal(Math.sign(contact.y - outer.y), requiredForceSign, 'attraction toward the flight must match the required along-track force')
        }
      }
      finally { geometry.dispose() }
    }
  }
})


test('both pad contact surfaces match the actual tapered screw mesh', () => {
  for (const distance of [horizontalLength / 2, brakingStartDistance + 8000]) {
    for (const taper of [0.1, 0.25, 0.6]) {
      const { geometry, points } = padAt(distance, taper)
      const front = screwContactSide(motion, distance) > 0
      for (const corner of front ? [2, 3] : [0, 1]) {
        const point = points[corner]
        const screw = new ScrewGeometry(0.01, shaftRadius, 0, threadRadius, thickness, taper, starts,
          distance + point.y, initialVelocity, initialDistance, rps, acceleration, 3, 1, 12, 512, 0, motion)
        const vertices = screw.getAttribute('position')
        const target = new Vector3(point.x, -0.005, point.z)
        let error = Infinity
        for (let flight = 0; flight < starts; flight++) {
          const index = flight * (6 + 4) + (front ? 4 : 0)
          const a = new Vector3().fromBufferAttribute(vertices, index)
          const b = new Vector3().fromBufferAttribute(vertices, index + 1)
          const closest = new Line3(a, b).closestPointToPoint(target, true, new Vector3())
          error = Math.min(error, target.distanceTo(closest))
        }
        assert.ok(error < 1e-7, `pad is ${error} m from the screw contact face`)
        screw.dispose()
      }
      geometry.dispose()
    }
  }
})
