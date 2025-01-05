import * as THREE from 'three'
import { setAllShowsToFalse } from "./cameraShotHelperFunctions"

export function launchVehicleDollyShot(guidParamWithUnits, nonGUIParams) {

  setAllShowsToFalse(guidParamWithUnits)
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  //guidParamWithUnits['showMassDriverDecelerationScrews'].value = true
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true

  guidParamWithUnits['displacementMapOverride'].value = true
  guidParamWithUnits['displacementBias'].value = -900
  guidParamWithUnits['displacementScale'].value = 0

  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['logZoomRate'].value = -3

  // Launcher parameters
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 2
  guidParamWithUnits['launcherMassDriverAltitude'].value = 200
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['numVirtualMassDriverTubes'].value = 64
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.857


  // 1000 m/s
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(397909.67071315, -4034242.6281670346, -4924227.129283767)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06238676295264463, -0.6325048499831474, -0.7720398348246591)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(397950.8988250455, -4034249.7313017384, -4924229.143902924)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.06238676295264463, -0.6325048499831474, -0.7720398348246591)
  // 2000 m/s, +100m mass driver
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(438585.90821414173, -4027131.565021059, -4926591.602529705)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06876567508528579, -0.6313894216282682, -0.7724109529168952)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(438630.6208055194, -4027146.0738138203, -4926587.30928224)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.06876567508528579, -0.6313894216282682, -0.7724109529168952)
  // 2000 m/s, +1000m mass driver
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(434476.2204064888, -4028410.9158271803, -4927073.443449539)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.0681093289659182, -0.6315014525289117, -0.7723775208806163)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(434493.40436025156, -4028444.3121074894, -4927056.876038148)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.0681093289659182, -0.6315014525289117, -0.7723775208806163)

  nonGUIParams['initialReferencePoint'] = 'feederRailEntrancePosition'
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0.09515362372621894, -23.58945773448795, -5.194072839803994)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.5721871155350564, -0.34004243034160064, -0.7463062711669048)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(74.57012815354392, -26.514206442050636, 44.626589365303516)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.5721871155350564, -0.34004243034160064, -0.7463062711669048)

  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    ((i==21) && (j==7)) ||
    ((i==22) && (j==7)) ||
    ((i==23) && (j==8)) ||
    ((i==0) && (j==8)))} // New Zealand North Island and ocean to the east

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 10000000
  nonGUIParams['startTimerActions'] = (startTimerParams) => {
    startTimerParams.animateZoomingOut = true
    startTimerParams.orbitControlsAutoRotate = true
  }
  // Adjust near clipping plane
  // Tube bouncing - might need more tube segments...
  // Shorten the launcher
  // Adjust lighting - too bright
  // Add struts to grapplers

}