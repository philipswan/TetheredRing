import { createParameterDefinitions } from '../params/parameterDefinitions.js'
import { ParameterStore } from '../params/ParameterStore.js'
import { launchQueueLayout } from '../launcher/launchQueue.js'

// Upgrade only the original bundled shot, not other projects that intentionally use one launch.
export function upgradeFollowLaunchVehicleQueue(shot, baseline) {
  if (shot.name !== 'FollowLaunchVehicle' || shot.preset !== 'toMarsHawaii'
    || shot.createdAt !== '2026-11-03T19:12:26.899Z'
    || baseline?.launcherStagedLaunches !== 4) return false
  // The original bundled shot persisted the old rail default. Preserve custom widths.
  const widenRail = shot.parameters.launcherMassDriverRailWidth === 1 && baseline.launcherMassDriverRailWidth === 1.5
  if (widenRail) shot.parameters.launcherMassDriverRailWidth = baseline.launcherMassDriverRailWidth
  const sizeNut = !Object.hasOwn(shot.parameters,'adaptiveNutAutoSize') && baseline.adaptiveNutAutoSize === true
  if (sizeNut) shot.parameters.adaptiveNutAutoSize = true
  if (!sizeNut && Object.hasOwn(shot.parameters, 'launcherStagedLaunches')
    && Object.hasOwn(shot.parameters, 'launcherQueueAdvanceDuration')) return widenRail
  for (const key of ['launcherStagedLaunches', 'launcherPrepopulatedLaunches',
    'numVirtualLaunchVehicles', 'numVirtualLaunchSleds', 'numVirtualAdaptiveNuts',
    'launchVehicleSpacingInSeconds', 'launchVehicleScaleFactor', 'launcherQueueAdvanceDelay', 'launcherQueueAdvanceDuration',
    'launcherMassDriver1InitialVelocity', 'launcherMassDriver2InitialVelocity',
    'showLauncherOceanTerminal', 'showLaunchVehicles', 'showLaunchSleds', 'showAdaptiveNuts',
    'launcherProportionalTubeRadius', 'launcherTubeRadiusToVehicleRadius']) {
    if (Object.hasOwn(baseline, key)) shot.parameters[key] = baseline[key]
  }
  const store = new ParameterStore(createParameterDefinitions())
  store.restore({...baseline,...shot.parameters})
  const derived = store.derived
  const q = launchQueueLayout(derived)
  const span = q.queueLength + q.front
  const centre = (q.front - q.queueLength) / 2 - span / 4
  const vehicleCentre = derived.launchVehicleForwardsOffset.value
    + (shot.parameters.launchVehicleBodyLength + shot.parameters.launchVehicleNoseconeLength)
      * shot.parameters.launchSystemForwardScaleFactor * shot.parameters.launchVehicleScaleFactor / 2
  for (const key of shot.camera.keyframes.slice(0, 2)) {
    if (key.anchor?.type !== 'launchVehicle' || key.anchor.launchIndex !== 0) continue
    key.position = [-span * 1.6, span * 0.18 - shot.parameters.launchVehicleUpwardsOffset, centre - vehicleCentre]
    key.target = [0, -shot.parameters.launchVehicleUpwardsOffset, centre - vehicleCentre]
    key.up = [0, 1, 0]
    key.orbitUp = [0, 1, 0]
  }
  return true
}
