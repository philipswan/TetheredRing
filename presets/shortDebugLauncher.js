import * as THREE from 'three'
import { setAllShowsToFalse } from "./cameraShotHelperFunctions"

export function actualSizeDollyShot(guidParamWithUnits, nonGUIParams) {

  guidParamWithUnits['launchVehicleScaleFactor'].value = 1 //300
  guidParamWithUnits['launchVehicleSpacingInSeconds'].value = 120
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1

  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 4.5 //200.0

  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['numVirtualLaunchSleds'].value = 1

  setAllShowsToFalse(guidParamWithUnits)
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = true
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true

  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 10000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 2000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .2
  guidParamWithUnits['logZoomRate'].value = -2

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-1697629.1706892352, 2141146.353671825, -5763357.356233417)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.26615689954756405, 0.33569220228437413, -0.9035879869435487)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-1697416.9303627321, 2140979.1731594005, -5763555.65277038)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.26615689954756405, 0.33569220228437413, -0.9035879869435487)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 100000000

}