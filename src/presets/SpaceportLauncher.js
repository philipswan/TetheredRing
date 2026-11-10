import { solveSpaceportSizing } from '../launcher/spaceportOrbit.js'
import { toMarsHawaiiLauncherPresets } from './toMarsHawaiiLauncherPresets.js'
import { planetSetup } from './planetSetup.js'

// Drag-compensated flight followed by electromagnetic capture 5 km behind the station's leading edge.
export function SpaceportLauncher(params, scene) {
  toMarsHawaiiLauncherPresets(params, scene)
  const values = {
    planetName: 'Earth', launcherLocationMode: 1, launcherRampDesignMode: 0,
    launcherRampEndLatitude: -1.4693, launcherRampEndLongitude: -78.8071,
    launcherMassDriverAltitude: 0, launcherRampExitAltitude: 6063,
    launcherEvacuatedTubeExitAltitude: 14000,
    adaptiveNutGrapplerSwitchoverTime: 0.1,
    spaceportRendezvousEnabled: true, spaceportApogeeAltitude: 300000,
    spaceportVelocityDeficit: 1000, spaceportStationLength: 110000,
    spaceportCaptureAcceleration: 5,
    launchVehicleCoefficientOfDrag: 0.035, launchVehiclePropellantMassFlowRate: 514.49,
    launchVehiclePropellantMass: 3000, launchVehicleAdaptiveThrust: false,
    launcherCoastTime: 1200, launcherSlowDownPassageOfTime: 1,
    launcherStartDelayInSeconds: 0,
    launcherVisualRadiusScale: 2000, launcherVisualLengthScale: 900,
    launchVehicleScaleFactor: 1, launchSledScaleFactor: 1, adaptiveNutScaleFactor: 1,
    launchSystemRightwardScaleFactor: 1, launchSystemForwardScaleFactor: 1,
    launchSystemUpwardScaleFactor: 1, exagerateNonElevatedTubeFactor: 1,
    launcherStagedLaunches: 1, launcherPrepopulatedLaunches: 0,
    numVirtualLaunchVehicles: 1, numVirtualLaunchSleds: 1, numVirtualAdaptiveNuts: 0,
    numLaunchesPerDay: 4, launchVehicleSpacingInSeconds: 1200,
    showLaunchVehicles: true, showLaunchSleds: true, showAdaptiveNuts: false,
    showLaunchTrajectory: true, showMassDriverTube: true,
    showMassDriverAccelerationScrews: false, showMassDriverDecelerationScrews: false, showMassDriverBrackets: false,
    showMassDriverRail: false, showLauncherOceanTerminal: false,
    showClouds: false, showSeaIce: false, showSailboats: false, showContainerShips: false,
    showEarthsAtmosphere: false, showStashingFacility: false,
    showLiftFans: false, showMooringCables: false, showMarkers: false,
    numVirtualMassDriverTubes: 256,
    launcherMassDriverScrewRoughLength: 1000, launcherMassDriverScrewNumBrackets: 1000,
    massDriverCameraRange: 20000000, launchSledCameraRange: 20000000,
    vehicleInTubeCameraRange: 20000000, lauchVehicleCameraRange: 20000000,
  }
  for (const [key, value] of Object.entries(values)) {
    if (!params[key]) throw new Error(`Unknown spaceport preset parameter: ${key}`)
    params[key].value = value
  }
  const sizing = solveSpaceportSizing(params)
  params.launcherMassDriverExitVelocity.value = sizing.entrySpeed
  params.launchVehicleRampUpwardAcceleration.value = sizing.upwardAcceleration
  params.launchVehicleDesiredOrbitalAltitude.value = values.spaceportApogeeAltitude
  planetSetup(scene, {near: ['chimborazo']})
  scene.excludedPlanetAssets = ['chimborazo']
  scene.locationInterests = []
  delete scene.launchTrackCamera
  scene.spaceportOverviewCamera = true
  scene.spaceportInitialZoom = 10
  scene.initialTrackingHotkey = '0'
  scene.overrideClipPlanes = true
  scene.nearClip = 100
  scene.farClip = 100000000
}
