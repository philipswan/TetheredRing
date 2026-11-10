import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { toMarsHawaiiLauncherPresets } from '../../src/presets/toMarsHawaiiLauncherPresets.js'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { designRamp } from '../../src/launcher/rampMotion.js'
import { jerkLimitedBrakingProfile } from '../../src/launcher/trackBraking.js'
import { StashingFacility, dailyStashingCapacity, mountainPortalDistance, planStashingStorage,
  stashingRampStation, stashingTransferPose, aboveGroundStashingStation } from '../../src/launcher/stashingFacility.js'

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('storage capacity uses explicit launches per day independently of seasonal totals', () => {
  const p = createParameterDefinitions()
  assert.equal(dailyStashingCapacity(p), 4)
  p.numLaunchesPerMarsTransferSeason.value = 57
  assert.equal(dailyStashingCapacity(p), 4)
  p.numLaunchesPerDay.value = 7
  assert.equal(dailyStashingCapacity(p), 7)
  toMarsHawaiiLauncherPresets(p, {})
  assert.equal(p.numLaunchesPerDay.value, 4)
  assert.equal(dailyStashingCapacity(p), 4)
})

test('facility defaults to the upper ramp and can be sited at the mountain portal', () => {
  const profile = { length: 10000, atDistance: s => ({ r: 6371000 + s / 10 }) }
  near(stashingRampStation(profile), 7000)
  near(stashingRampStation(profile, 8100), 8100)
  near(stashingRampStation(profile, 6000), 6000)
})

test('mountain siting finds the last uphill exit and handles missing terrain', async () => {
  const distance = await mountainPortalDistance({ length: 10000,
    clearanceAt: async s => s - 8250 })
  near(distance, 8250, 0.1)
  assert.equal(await mountainPortalDistance({ length: 10000, clearanceAt: async () => null }), null)
  assert.equal(await mountainPortalDistance({ length: 10000, clearanceAt: async () => -1 }), null)
})

test('nut braking stops at the facility station using the production jerk-limited solver', () => {
  const mu = 3.986004418e14
  const ramp = designRamp({ radius: 6371000, exitRadius: 6373900, entrySpeed: 8000,
    forwardAcceleration: 80, upwardAcceleration: 120, transitionSeconds: 2, upwardJerk: 240, mu })
  const station = stashingRampStation(ramp)
  const centreOffset = 10
  const distance = station - centreOffset - ramp.detach.s
  const braking = jerkLimitedBrakingProfile({ initialSpeed: ramp.detach.v, stopDistance: distance,
    radiusAt: s => ramp.atDistance(ramp.detach.s + s).r, mu, jerk: 2400 })
  near(ramp.detach.s + braking.tTod(braking.duration) + centreOffset, station, 1e-3)
  near(braking.tTos(braking.duration), 0, 1e-3)
})

test('crane waits, lifts vertically, traverses horizontally, then lowers without rotation', () => {
  const input = { startCentre: new Vector3(), targetCentre: new Vector3(100, 20, 2), transferHeight: 8,
    startOrientation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.2) }
  for (const elapsed of [0, 4, 5]) near(stashingTransferPose({ ...input, elapsed }).centre.length(), 0)
  const lifting = stashingTransferPose({ ...input, elapsed: 6.5 })
  near(lifting.centre.x, 0); near(lifting.centre.y, 0); near(lifting.centre.z, 4)
  const halfway = stashingTransferPose({ ...input, elapsed: 10 })
  near(halfway.centre.x, 50); near(halfway.centre.z, 8)
  const lowering = stashingTransferPose({ ...input, elapsed: 13.5 })
  near(lowering.centre.x, 100); near(lowering.centre.y, 20); near(lowering.centre.z, 5)
  for (const elapsed of [15, 1000]) {
    const pose = stashingTransferPose({ ...input, elapsed })
    near(pose.centre.distanceTo(input.targetCentre), 0)
    near(pose.orientation.angleTo(input.startOrientation), 0)
  }
})

test('one compact enclosure contains the tube, storage slots, and complete crane motion', () => {
  const halfSizes = { nut: new Vector3(3, 25, 4), sled: new Vector3(2, 12, 2) }
  const stopCentres = { nut: new Vector3(0, 0, -2), sled: new Vector3(0, 1, -1) }
  const plan = planStashingStorage({ capacity: 7, halfSizes, stopCentres, tubeRadius: 5 })
  assert.ok(plan.bounds.containsBox(plan.tubeBounds))
  assert.ok(plan.bounds.containsBox(plan.transferBounds))
  const parked = []
  for (const kind of ['nut', 'sled']) for (const target of plan.slots[kind]) {
    near(target.z - halfSizes[kind].z, plan.bounds.min.z + 0.5)
    assert.ok(target.x < 100, 'storage starts beside the tube instead of at a remote east offset')
    const box = new Box3().setFromCenterAndSize(target, halfSizes[kind].clone().multiplyScalar(2))
    parked.push(box)
    for (let i = 0; i <= 200; i++) {
      const elapsed = 5 + i / 20
      const pose = stashingTransferPose({ startCentre: stopCentres[kind], targetCentre: target,
        transferHeight: plan.transferHeights[kind], startOrientation: new Quaternion(), elapsed })
      const moving = new Box3().setFromCenterAndSize(pose.centre, halfSizes[kind].clone().multiplyScalar(2))
      assert.ok(plan.bounds.containsBox(moving), 'hardware left the facility box')
      if (elapsed >= 8 && elapsed <= 12) assert.ok(moving.min.z >= plan.tubeBounds.max.z + 0.5 - 1e-8)
    }
  }
  for (let i = 0; i < parked.length; i++) for (let j = i + 1; j < parked.length; j++) assert.ok(!parked[i].intersectsBox(parked[j]))
  const highest = Math.max(...['nut', 'sled'].map(k => plan.transferHeights[k] + halfSizes[k].z))
  near(plan.bounds.max.z, highest + 0.5)
})

test('siting moves uphill until the full footprint clears ground and never raises the floor', async () => {
  const station = await aboveGroundStashingStation({ startDistance: 100, endDistance: 1000,
    clearanceAt: async s => (s - 425) / 10 })
  assert.ok(station > 430 && station < 432)
  assert.equal(await aboveGroundStashingStation({ startDistance: 100, endDistance: 1000, clearanceAt: async () => 1 }), 100)
  assert.equal(await aboveGroundStashingStation({ startDistance: 100, endDistance: 200, clearanceAt: async () => -1 }), null)
  assert.equal(await aboveGroundStashingStation({ startDistance: 100, endDistance: 200, clearanceAt: async () => null }), null)
})

test('facility retains every finite-queue assembly, rewinds, and expands without moving existing slots', () => {
  const parent = new Group(), geometry = new BoxGeometry(2, 20, 3), material = new MeshBasicMaterial()
  const component = stopTime => ({ stopTime, visible: () => true,
    create: () => new Mesh(geometry, material), pose: m => { m.position.set(0, 0, 0); m.quaternion.identity() }, release: m => m.removeFromParent() })
  const facility = new StashingFacility({ parent, capacity: 4, tubeRadius: 5,
    frame: { point: new Vector3(), forward: new Vector3(0, 1, 0), upward: new Vector3(0, 0, 1), rightward: new Vector3(1, 0, 0) },
    components: { nut: component(10), sled: component(100) } })
  facility.update({ time: 5000, spacing: 1200, firstLaunch: 0, lastLaunch: 3 })
  assert.equal(facility.entries.size, 8)
  assert.equal(facility.box.geometry.index.count, 36, 'the enclosure includes a roof')
  const firstSlot = facility.plan.slots.nut[0].clone()
  facility.update({ time: 7000, spacing: 1200, firstLaunch: 0, lastLaunch: 5 })
  assert.equal(facility.entries.size, 12)
  near(firstSlot.distanceTo(facility.plan.slots.nut[0]), 0)
  facility.root.updateMatrixWorld(true)
  for (const { model } of facility.entries.values()) {
    const bounds = new Box3().setFromObject(model)
    assert.ok(facility.plan.bounds.containsBox(bounds))
  }
  facility.update({ time: 0, spacing: 1200, firstLaunch: 0, lastLaunch: 0 })
  assert.equal(facility.entries.size, 0)
  facility.dispose()
  assert.equal(parent.children.length, 0)
  geometry.dispose(); material.dispose()
})
