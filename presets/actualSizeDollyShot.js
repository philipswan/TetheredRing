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
  guidParamWithUnits['showLogo'].value = true

  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 10000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 2000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .6
  guidParamWithUnits['logZoomRate'].value = -2.5

  nonGUIParams['initialReferencePoint'] = 'feederRailEntrancePosition'

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-1697629.1706892352, 2141146.353671825, -5763357.356233417)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.26615689954756405, 0.33569220228437413, -0.9035879869435487)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-1697416.9303627321, 2140979.1731594005, -5763555.65277038)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.26615689954756405, 0.33569220228437413, -0.9035879869435487)
  
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-1690249.9120657323, 2140777.257193356, -5765660.314295797)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.265000064604319, 0.33563445701728567, -0.9039493774666919)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-1690224.3190687683, 2140693.511896637, -5765709.962031548)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.265000064604319, 0.33563445701728567, -0.9039493774666919)

  // Beside the start of the launch tube
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-74.8243553515058, -18.926443746779114, 6.666308454237878)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.26486874857732934, 0.3356268023840633, -0.9039907054547235)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-43.475810640258715, -123.74847913440317, -40.698920564725995)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.26486874857732934, 0.3356268023840633, -0.9039907054547235)

  // // Surface of moon
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3383587990910079, 0.33798490543321996, -0.8782252141546543)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-4.905454064137302, -66.66267249651719, -32.933316274080426)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3383587990910079, 0.33798490543321996, -0.8782252141546543)

  // // Of the north coast of big island
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-785415.877205126, 74823.92275694897, 313458.4797664676)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.38243472046752847, 0.35811864909238483, -0.8517597770223532)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-856029.4776803269, 99355.1559659522, 337677.4232492186)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.38243472046752847, 0.35811864909238483, -0.8517597770223532)

  // // Fast pan shot
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-680676.2374419556, 21135.270183477085, 253104.74758333433)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3717039893583415, 0.3389445980939931, -0.8642642557215908)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-680865.1367110643, 21074.14970692573, 253148.86324537825)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3717039893583415, 0.3389445980939931, -0.8642642557215908)

  // View from far above the launcher looking straight down
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-440816.01642672624, 14678.0296555534, 157313.07151191216)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.26486255382392027, 0.3356270981801784, -0.9039924106700366)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-592608.8189168209, 207025.3653611699, -360765.11346622277)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.26486255382392027, 0.3356270981801784, -0.9039924106700366)
    
  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 1000000000

}