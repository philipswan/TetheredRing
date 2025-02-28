export function setAllShowsToFalse(guidParamWithUnits) {

  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = false
  guidParamWithUnits['showStars'].value = false
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showBackgroundPatch'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = false
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showStatorMagnets'].value = false
  guidParamWithUnits['showTransitTube'].value = false
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showTransitTracks'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['showTrackingMarkers'].value = false
  guidParamWithUnits['showMassDriverTube'].value = false
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['showLaunchVehicles'].value = false
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
}

export function showMassDriver(guidParamWithUnits) {

  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = true
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showAdaptiveNuts'].value = true

}