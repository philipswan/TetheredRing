import { toMarsHawaiiLauncherPresets } from './toMarsHawaiiLauncherPresets.js'

// The Hawaii engineering model, with a screen-space evidence annotation layer.
export function EvidenceLedgerLinks(params, scene) {
  toMarsHawaiiLauncherPresets(params, scene)
  // A terrain landmark, independent of tube geometry and camera orbit targets.
  scene.evidenceLedgerSite = {label: 'Mauna Kea', lat: 19.820667, lon: -155.468056, altitude: 4207, diameter: 8000}
  // Focus the explainer on launcher hardware; omit expensive scenery/effects.
  for (const key of [
    'showClouds', 'showEarthsAtmosphere', 'showOcean', 'showSeaIce',
    'showSailboats', 'showContainerShips', 'showMoon', 'showStars',
    'showTethers', 'showTransitSystem', 'showStationaryRings', 'showMovingRings',
    'showStatorMagnets', 'showTransitTube', 'showTransitTracks', 'showTransitVehicles',
    'showRingTerminuses', 'showGroundTerminuses', 'showElevatorCables',
    'showElevatorCars', 'showHabitats', 'showSolarArrays',
    'showLaunchVehiclePlasma', 'showLaunchVehicleExhaust', 'showLaunchVehiclePointLight',
    'showMassDriverBrackets', 'showXYChart', 'showLogo',
    'showMarkers', 'showTrackingMarkers', 'showGravityForceArrows', 'showGyroscopicForceArrows',
  ]) params[key].value = false
  params.showLiftFans.value = true
  params.showObjectLabels.value = true
  params.showEvidenceLedgerLinks.value = true
}
