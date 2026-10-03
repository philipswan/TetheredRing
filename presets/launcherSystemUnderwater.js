import * as THREE from 'three'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { showMassDriver } from "./cameraShotHelperFunctions"
import { googleEarthStudioProvidedBackground } from './googleEarthStudioProvidedBackground.js'
import { toMarsFromEarthLauncherArchitecture } from './toAFromBLauncherArchitecture.js'
import { toVenusFromEarthLauncherArchitecture } from './toVenusFromEarthLauncherArchitecture.js'
import { toMarsFromMoonLauncherArchitecture } from './toAFromBLauncherArchitecture.js'

export function launcherSystemUnderwater(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74.34
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.681

  let launcherRampEndLatitude
  let launcherRampEndLongitude
  let massDriverAltitude
  let rampExitAltitude
  // Location specific parameters that will affect the architecture
  const useEarth = true
  if (useEarth) {
    guidParamWithUnits['planetName'].value = "Earth"
    const Location = "Hawaii"
    switch (Location) {
      case "Hawaii":
        // Mauna Kea (19.820667, -155.468056)
        launcherRampEndLatitude = 19.820667 // °N (Hawaii Big Island)
        launcherRampEndLongitude = -155.468056 + .048056 // moving the end of the ranp a little bit east 
        massDriverAltitude = -150 // m (below sea level) (at the moment we can't see it below the ocean so, for now, raising it above the ocean)
        rampExitAltitude = 4000 // m  (Altitude of Mauna Kea summit (4207) plus ~300 meters which is an engineered truss structure that can be stowed underground when not in use)

        // Beside the launch train
        nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-36.21158583671786, 1.79342060117051, 11.38001290615648)
        nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.2675391853001986, 0.33375641834975495, -0.9038968069084266)
        nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(6.8633874780498445, -21.86256320727989, -18.231402538716793)
        nonGUIParams['cameraUp'] = new THREE.Vector3(-0.2675391853001986, 0.33375641834975495, -0.9038968069084266)

        // Distance: 57.375037; yaw: -17.578745 deg; pitch: 18.270657 deg
        nonGUIParams['launchTrackCamera'] = {
          target: {forward: 34.913652, right: 1.672414, up: 10.479944},
          position: {forward: -17.024705, right: 18.127028, up: -7.507485},
          cameraUp: {forward: 0.000006, right: 0, up: 1}
        }
        break
      case "Mount Chimborazo":
        launcherRampEndLatitude = -1.4693 // °N (Ecuador)
        launcherRampEndLongitude = -78.8171 + .01 // moving the end of the ranp a little bit east
        massDriverAltitude = 0 // m (Mount Chimborazo summit)
        rampExitAltitude = 6263 - 200// m  (Altitute of Mount Chimborazo summit (6263) plus ~500 meters which is an engineered truss structure that can be stowed underground when not in use)

        // Start of launcher
        nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(2.199184328317642, -4.227140800678171, 9.701095274358522)
        nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.99772503018104, -0.025220154969113173, 0.06251966037636848)
        nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-101.57670010253787, -182.04474738315912, -255.43992544565117)
        nonGUIParams['cameraUp'] = new THREE.Vector3(-0.99772503018104, -0.025220154969113173, 0.06251966037636848)
        break
    }

    toMarsFromEarthLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude)

  }
  else {
    guidParamWithUnits['planetName'].value = "Moon"
    const launcherRampEndLatitude = 19.820667 // °N (Hawaii Big Island)
    const launcherRampEndLongitude = -155.468056 + .048056 // moving the end of the ranp a little bit east 
    const massDriverAltitude = 1000 // m
    const rampExitAltitude = 1500 // m
    toMarsFromMoonLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude)
  }
  guidParamWithUnits['launcherMassDriverScrewNumBrackets'].value = 80000 // 300

  guidParamWithUnits['launcherFeederRailLength'].value = 0

  guidParamWithUnits['numLaunchesPerMarsTransferSeason'].value = 14*4 // 14 days, four lauches per day
  guidParamWithUnits['numberOfMarsTransferSeasons'].value = 10
  guidParamWithUnits['launcherMarkerRadius'].value = 500

  // Grappler Parameters
  guidParamWithUnits['adaptiveNutNumGrapplers'].value = 64
  guidParamWithUnits['adaptiveNutGrapplerMagnetThickness'].value = 0.06  // m
 
  // Parameters that are going to effect the launch system's performance...
  // Launch Angle (launcherRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  showMassDriver(guidParamWithUnits)
  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)
  guidParamWithUnits['showStars'].value = false
  guidParamWithUnits['showMoon'].value = false
  guidParamWithUnits['showLogo'].value = false
  // The underwater background image hides the planet, so skip building the
  // planet entirely (this disables the heavy legacy 24x12 globe loader).
  guidParamWithUnits['showEarthsSurface'].value = false
  guidParamWithUnits['showEarthsAtmosphere'].value = false

  guidParamWithUnits['launcherCoastTime'].value = 100*20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  guidParamWithUnits['orbitControlsRotateSpeed'].value = 1
  guidParamWithUnits['logZoomRate'].value = -3
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showMarkers'].value = false

  // No virtual human figures are needed in this shot (skips loading the FBX model).
  guidParamWithUnits['numVirtualHumanFigures'].value = 0

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 10
  nonGUIParams['farClip'] = 100000000

  // Hack to speed up the simulation
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showMassDriverTube'].value = true

  nonGUIParams['displayBackgroundImage'] = true
  nonGUIParams['backgroundImageFilename'] = './textures/UnderwaterView.jpg'
  nonGUIParams['setResolutionFromBackgroundImage'] = true

}
