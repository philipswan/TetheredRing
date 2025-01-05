import * as THREE from 'three'
import g from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { cos } from 'three/examples/jsm/nodes/shadernode/ShaderNodeBaseElements.js'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { googleEarthStudioProvidedBackground } from './googleEarthStudioProvidedBackground.js'
import { toMarsFromEarthLauncherArchitecture } from './toMarsFromEarthLauncherArchitecture.js'
import { toMarsFromMoonLauncherArchitecture } from './toMarsFromMoonLauncherArchitecture.js'

export function launchLookingBackwards(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74.34
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.681

  // Mauna Kea (19.820667, -155.468056)
  const launcherRampEndLatitude = 19.820667 // °N (Hawaii Big Island)
  const launcherRampEndLongitude = -155.468056 + .048056 // moving the end of the ramp a little bit east 
  const massDriverAltitude = 200 // -50 // m (below sea level) (at the moment we can't see it below the ocean so, for now, raising it above the ocean)
  const rampExitAltitude = 4500 // m  (Altitute of Mauna Kea summit (4207) plus ~300 meters which is an engineered truss structure that can be stowed underground when not in use)
  toMarsFromEarthLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude)

  guidParamWithUnits['launcherMassDriverScrewNumBrackets'].value = 300 // Limit the number of brackets since they temporarily alias
  
  guidParamWithUnits['numLaunchesPerMarsTransferWindow'].value = 14*4 // 14 days, four lauches per day
  guidParamWithUnits['numberOfMarsTransferWindows'].value = 10

  // Grappler Parameters
  guidParamWithUnits['launchSledNumGrapplers'].value = 64
  guidParamWithUnits['launchSledGrapplerMagnetThickness'].value = 0.06  // m

  // Hawaii
  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    ((i==1) && (j==4)) ||
    ((i==2) && (j==4)) ||
    ((i==3) && (j==4))
  )} 

  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100*20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 10
  guidParamWithUnits['logZoomRate'].value = -3

  // Hack to speed up the simulation
  // guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  // guidParamWithUnits['showMassDriverBrackets'].value = false

  // Camera infront of the launch vehicle inside the tube
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.26486255382392027, 0.3356270981801784, -0.9039924106700366)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-131.41884332499467, 7.06073940731585, 39.23605372570455)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.26486255382392027, 0.3356270981801784, -0.9039924106700366)
  guidParamWithUnits['cameraFieldOfView'].value = 30
  guidParamWithUnits['massDriverCameraRange'].value = 1000

}