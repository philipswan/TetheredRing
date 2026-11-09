import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { upgradeFollowLaunchVehicleQueue } from '../../src/shots/FollowLaunchVehicleQueue.js'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { toMarsHawaiiLauncherPresets } from '../../src/presets/toMarsHawaiiLauncherPresets.js'

const updated = JSON.parse(readFileSync(new URL('../../shots/FollowLaunchVehicle.shot.json', import.meta.url), 'utf8'))
const defs = createParameterDefinitions()
toMarsHawaiiLauncherPresets(defs, {})
const baseline = Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.value]))

test('the bundled follow shot keeps the four-train queue and terminal enabled', () => {
  for (const key of ['launcherStagedLaunches', 'numVirtualLaunchVehicles', 'numVirtualLaunchSleds', 'numVirtualAdaptiveNuts']) assert.equal(updated.parameters[key], 4)
  assert.equal(updated.parameters.showLauncherOceanTerminal, true)
  assert.equal(updated.parameters.launchVehicleSpacingInSeconds, baseline.launchVehicleSpacingInSeconds)
  assert.ok(Math.abs(updated.camera.keyframes[0].position[0]) > 300)
})

test('old recovered follow shots upgrade once without changing later keys or unrelated parameters', () => {
  const old = structuredClone(updated)
  delete old.parameters.launcherStagedLaunches
  delete old.parameters.launcherQueueAdvanceDuration
  old.parameters.numVirtualLaunchVehicles = old.parameters.numVirtualLaunchSleds = old.parameters.numVirtualAdaptiveNuts = 1
  old.parameters.launchVehicleSpacingInSeconds = 120
  old.parameters.showClouds = false
  const later = structuredClone(old.camera.keyframes.slice(2))
  assert.equal(upgradeFollowLaunchVehicleQueue(old, baseline), true)
  assert.equal(old.parameters.numVirtualLaunchVehicles, 4)
  assert.equal(old.parameters.launcherStagedLaunches, 4)
  assert.equal(old.parameters.showClouds, false)
  assert.deepEqual(old.camera.keyframes.slice(2), later)
  assert.equal(upgradeFollowLaunchVehicleQueue(old, baseline), false)
})

test('other shots are not migrated', () => {
  const other = structuredClone(updated)
  delete other.parameters.launcherStagedLaunches
  other.name = 'My single vehicle shot'
  assert.equal(upgradeFollowLaunchVehicleQueue(other, baseline), false)
  assert.equal(Object.hasOwn(other.parameters, 'launcherStagedLaunches'), false)
})


test('the previously upgraded rolling-queue shot gets the new stop-and-advance timing', () => {
  const old = structuredClone(updated)
  delete old.parameters.launcherQueueAdvanceDuration
  old.parameters.launchVehicleSpacingInSeconds = 1.26
  assert.equal(upgradeFollowLaunchVehicleQueue(old, baseline), true)
  assert.equal(old.parameters.launchVehicleSpacingInSeconds, 20)
  assert.equal(old.parameters.launcherQueueAdvanceDelay, 2)
  assert.equal(old.parameters.launcherQueueAdvanceDuration, 10)
})


test('recovered bundled shot widens the old rail default without changing custom widths', () => {
  const shot = structuredClone(updated), camera = structuredClone(shot.camera)
  shot.parameters.launcherMassDriverRailWidth = 1
  assert.equal(upgradeFollowLaunchVehicleQueue(shot,baseline),true)
  assert.equal(shot.parameters.launcherMassDriverRailWidth,1.5)
  assert.deepEqual(shot.camera,camera)
  assert.equal(upgradeFollowLaunchVehicleQueue(shot,baseline),false)
  shot.parameters.launcherMassDriverRailWidth = 2
  assert.equal(upgradeFollowLaunchVehicleQueue(shot,baseline),false)
  assert.equal(shot.parameters.launcherMassDriverRailWidth,2)
})


test('older recovered shot adopts contact sizing and reframes only the opening camera keys', () => {
  const shot = structuredClone(updated), later = structuredClone(shot.camera.keyframes.slice(2))
  delete shot.parameters.adaptiveNutAutoSize
  assert.equal(upgradeFollowLaunchVehicleQueue(shot,baseline),true)
  assert.equal(shot.parameters.adaptiveNutAutoSize,true)
  assert.deepEqual(shot.camera.keyframes.slice(2),later)
  assert.equal(upgradeFollowLaunchVehicleQueue(shot,baseline),false)
})
