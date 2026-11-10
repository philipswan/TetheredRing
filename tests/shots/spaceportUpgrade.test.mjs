import test from 'node:test'
import assert from 'node:assert/strict'
import {upgradeSpaceportAtmosphere} from '../../src/shots/SpaceportShotUpgrade.js'
const baseline = {launcherEvacuatedTubeExitAltitude: 14000, launchVehicleCoefficientOfDrag: 0.035,
  launchVehiclePropellantMassFlowRate: 514.49, launchVehiclePropellantMass: 3000, launchVehicleAdaptiveThrust: false}
const legacy = () => ({preset: 'SpaceportLauncher', name: 'My saved scene',
  parameters: {launcherEvacuatedTubeExitAltitude: 100000, launchVehicleCoefficientOfDrag: 0,
    launchVehiclePropellantMassFlowRate: 0, launchVehiclePropellantMass: 0, launchVehicleAdaptiveThrust: false, launcherVisualLengthScale: 123},
  camera: {keyframes: [{time: 25, position: [1, 2, 3]}]}, output: {duration: 1000}, project: {id: 'original'}})

test('legacy Spaceport physics upgrades once while retaining camera, timing, project and unrelated settings', () => {
  const shot = legacy(), original = structuredClone(shot)
  assert.equal(upgradeSpaceportAtmosphere(shot, baseline), true)
  for (const [key, value] of Object.entries(baseline)) assert.equal(shot.parameters[key], value)
  assert.deepEqual(shot.camera, original.camera)
  assert.deepEqual(shot.output, original.output)
  assert.deepEqual(shot.project, original.project)
  assert.equal(shot.parameters.launcherVisualLengthScale, 123)
  assert.equal(upgradeSpaceportAtmosphere(shot, baseline), false)
})

test('custom physics, animated overrides, other presets and old baselines are not migrated', () => {
  const custom = legacy(); custom.parameters.launcherEvacuatedTubeExitAltitude = 20000
  const powered = legacy(); powered.parameters.launchVehiclePropellantMass = 2000
  const other = legacy(); other.preset = 'toMarsHawaii'
  const animated = legacy(); animated.parameterTracks = {launcherEvacuatedTubeExitAltitude: [{time: 0, value: 100000}]}
  for (const shot of [custom, powered, other, animated]) {
    const original = structuredClone(shot)
    assert.equal(upgradeSpaceportAtmosphere(shot, baseline), false)
    assert.deepEqual(shot, original)
  }
  assert.equal(upgradeSpaceportAtmosphere(legacy(), null), false)
})
