import * as THREE from 'three'
import { setAllShowsToFalse } from "./cameraShotHelperFunctions"

export function actualSizeDollyShot(guidParamWithUnits, nonGUIParams) {

  guidParamWithUnits['launchVehicleScaleFactor'].value = 1.5 //300
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
  guidParamWithUnits['showLogo'].value = false

  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 10000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 2000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .6
  guidParamWithUnits['logZoomRate'].value = -2.5

  nonGUIParams['initialReferencePoint'] = 'feederRailEntrancePosition'
  nonGUIParams['initialReferencePoint'] = 'feederRailEntrancePosition'
    
  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 1000000000

}