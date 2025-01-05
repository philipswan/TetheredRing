import * as THREE from 'three'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'

export function olympusMonsLauncher(guidParamWithUnits, guidParam, gui, nonGUIParams) {


  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)

  // Set to altitude of Oylymus Mons...
  guidParamWithUnits['launcherRampExitAltitude'].value = 21000
  guidParamWithUnits['launchVehicleScaleFactor'].value = 800 //300
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 2000

  guidParamWithUnits['enableBackgroundAlpha'].value = true
  //guidParamWithUnits['showBackgroundPatch'].value = true //300
  guidParamWithUnits['showEarthsSurface'].value = false
  guidParamWithUnits['showEarthsAtmosphere'].value = false
  //guidParamWithUnits['showLogo'].value = false
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 15
  guidParamWithUnits['lauchVehicleCameraRange'].value = 5000000

  nonGUIParams['displayBackgroundImage'] = true
  nonGUIParams['backgroundImageFilename'] = './textures/mars/olympusmons.jpg'
  //nonGUIParams['backgroundImageFilename'] = './textures/mars/Close-up_perspective_view_of_flank_of_Olympus_Mons.jpg'
  nonGUIParams['setResolutionFromBackgroundImage'] = true

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-181286.6388546233, -280671.1926029036, -83556.60614304058)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.1833274017127509, -0.6067775922308114, -0.7734416702944257)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(37813.15333902789, -594000.5956267272, -193258.40790285356)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.1833274017127509, -0.6067775922308114, -0.7734416702944257)

}
