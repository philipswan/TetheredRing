import * as THREE from 'three'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { googleEarthStudioProvidedBackground } from './googleEarthStudioProvidedBackground.js'
import { toMarsFromEarthLauncherArchitecture } from './toMarsFromEarthLauncherArchitecture.js'
import { toMarsFromMoonLauncherArchitecture } from './toMarsFromMoonLauncherArchitecture.js'

export function toMarsHawaiiLauncherPresets(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74.34
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.681

  // Location specific parameters that will affect the architecture
  const useEarth = true
  if (useEarth) {
    // Mauna Kea (19.820667, -155.468056)
    const launcherRampEndLatitude = 19.820667 // °N (Hawaii Big Island)
    const launcherRampEndLongitude = -155.468056 + .048056 // moving the end of the ramp a little bit east 
    //const massDriverAltitude = -150 // m (below sea level) (at the moment we can't see it below the ocean so, for now, raising it above the ocean)
    const massDriverAltitude = 100 // Hacked because I suspect that Google Earth is acting up when altitudes are negative
    const rampExitAltitude = 4000 // m  (Altitute of Mauna Kea summit (4207) plus ~300 meters which is an engineered truss structure that can be stowed underground when not in use)
    toMarsFromEarthLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude)
  }
  else {
    const launcherRampEndLatitude = 19.820667 // °N (Hawaii Big Island)
    const launcherRampEndLongitude = -155.468056 + .048056 // moving the end of the ranp a little bit east 
    const massDriverAltitude = 1000 // m
    const rampExitAltitude = 1500 // m
    toMarsFromMoonLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude)
  }
  guidParamWithUnits['launcherMassDriverScrewNumBrackets'].value = 300

  guidParamWithUnits['launcherFeederRailLength'].value = 0

  // Mount Everest
  // guidParamWithUnits['launcherRampEndLatitude'].value = 27.9881
  // guidParamWithUnits['launcherRampEndLongitude'].value = 86.925
  // launcherSledDownwardAcceleration: {value: 150, units: 'm*s-2', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  //launchVehicleSledMass
  //launchVehicleDesiredOrbitalAltitude
  //launchVehicleEffectiveRadius
  //launcherPayloadDeliveredToOrbit
  guidParamWithUnits['numLaunchesPerMarsTransferWindow'].value = 14*4 // 14 days, four lauches per day
  guidParamWithUnits['numberOfMarsTransferWindows'].value = 10
  //launchVehicleCoefficientOfDrag
  //launcherXyChartMaxT
  //launcherServiceLife
  //launcherLaunchesPerYear
  //launchSystemForwardScaleFactor
  //launchSystemUpwardScaleFactor
  //launchSystemRightwardScaleFactor
  //launchSystemRightwardScaleFactor
  //launchVehicleUpwardsOffset
  //launchVehicleForwardsOffset
  //guidParamWithUnits['launchVehicleRadius'].value = 1.5
  //guidParamWithUnits['launchVehicleBodyLength'].value = 10
  //launchVehicleFlameLength
  //launchVehicleNoseconeLength
  //launchVehicleRocketEngineLength
  //launchVehicleShockwaveConeLength


  //launchVehicleNumModels
  //numVirtualMassDriverTubes
  //launcherMassDriverRailWidth
  //launcherMassDriverRailHeight
  //launchRailUpwardsOffset
  //numVirtualMassDriverRailsPerZone
  //launcherMassDriverBracketWidth
  //launcherMassDriverBracketHeight  
  //launcherMassDriverBracketRibWidth
  //launcherMassDriverBracketNumModels
  // guidParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value = 0.375 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value = 0.3 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewThreadRadius'].value = .5 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewThreadThickness'].value = .05 * .25/5
  //guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 2
  //launcherMassDriverScrewRoughLength
  //launcherMassDriverScrewSidewaysOffset
  //launcherMassDriverScrewUpwardsOffset
  //launcherMassDriverScrewRevolutionsPerSecond
  //launcherMassDriverScrewBracketThickness
  //launcherMassDriverScrewBracketDensity
  //launcherMassDriverScrewBracketMaterialCost
  //launcherMassDriverScrewNumBrackets
  //launcherMassDriverScrewMaterialDensity
  //launcherMassDriverScrewMaterialCost
  //launcherMassDriverTubeLinerThickness
  //launcherMassDriverTubeWallThickness
  //launcherMassDriverTubeMaterial0Density
  //launcherMassDriverTubeMaterial0Cost
  //launcherMassDriverTubeMaterial1Density
  //launcherMassDriverTubeMaterial1Cost
  //launcherEvacuatedTubeNumModels
  guidParamWithUnits['launcherMarkerRadius'].value = 500
  //launchSledSpacingInSeconds
  //launchSledWidth
  //launchSledHeight
  //launchSledBodyLength
  //launchSledSidewaysOffset
  //launchSledUpwardsOffset
  //launchSledForwardsOffset
  //launchSledNumModels
  
  //guidParamWithUnits['launcherScrewRotationRate'].value = 200

  // Grappler Parameters
  guidParamWithUnits['launchSledNumGrapplers'].value = 64
  guidParamWithUnits['launchSledGrapplerMagnetThickness'].value = 0.06  // m
 
  // Parameters that are going to effect the launch system's performance...
  // Launch Angle (launcherRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  // Launch Trajectory Parameters

  // Hawaii Big Island
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2485252.833291091, 2139838.026337634, -5469810.453140184)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2004542.2348935166, 1914991.4645450646, -6064638.482857945)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)

  // Hawaii for tracking shot
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-1913174.8068502536, 2051872.8119204757, -5679238.61182404)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2589667.296365839, 2335558.762770908, -5428604.592928227)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)

  // Camera to south of 80X enlarged vehicle
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-1704743.1920667875, 2141504.9827542473, -5761121.240517391)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.26727234405199485, 0.3357485509860463, -0.9032377342736382)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-1712354.4232612643, 2132558.788824954, -5768365.566253694)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.26727234405199485, 0.3357485509860463, -0.9032377342736382)

  // Camera to south of actual size vehicle
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-1690249.9120657323, 2140777.257193356, -5765660.314295797)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.265000064604319, 0.33563445701728567, -0.9039493774666919)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-1690224.3190687683, 2140693.511896637, -5765709.962031548)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.265000064604319, 0.33563445701728567, -0.9039493774666919)
  
  // Mount Everest
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(5624095.830121477, 2994721.514383685, 333102.4562004242)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.8819834230776509, 0.46865418712915813, 0.04968394411213295)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(5717756.521284462, 2869550.0022072233, 414273.2894226406)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.8819834230776509, 0.46865418712915813, 0.04968394411213295)  

  // Hawaii Big Island
  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    ((i==1) && (j==4)) ||
    ((i==2) && (j==4)) ||
    ((i==3) && (j==4))
  )} 

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0, 1, 0)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(2.92909490611565e-9, 1.464547453057825e-9, -23917875)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0, 1, 0)


  //googleEarthStudioProvidedBackground(guidParamWithUnits, nonGUIParams)
  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)
  guidParamWithUnits['showStars'].value = true
  //guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100*20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  //guidParamWithUnits['launchVehicleScaleFactor'].value = 300
  //guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 5000.0
  guidParamWithUnits['logZoomRate'].value = -3

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = .1
  nonGUIParams['farClip'] = 10000000

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-20.596624654252082, -18.795628492254764, -28.63014849368483)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.2672085688689862, 0.33374015320741873, -0.9040006033516111)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(98.94242870318703, -63.433976754080504, -84.42750348616391)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.2672085688689862, 0.33374015320741873, -0.9040006033516111)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-15.401019364362583, 1.4742208924144506, 4.857152966782451)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.2899585701484135, 0.3347774151120973, -0.896575769206572)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-18.82346588699147, -12.121040514670312, -3.740331665612757)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.2899585701484135, 0.3347774151120973, -0.896575769206572)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-792047.7715618422, 23312.00666318601, 300221.2602548003)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3909145665914432, 0.33716689860362425, -0.8564486465122338)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-887323.9041289391, 70376.78830169467, 91036.49722965527)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3909145665914432, 0.33716689860362425, -0.8564486465122338)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-442225.995872651, 156923.79012277396, 184517.0484141186)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.267210746924624, 0.33373589058311254, -0.9040015332203154)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-485220.1577472219, -543684.1227839389, -219995.83733422682)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.267210746924624, 0.33373589058311254, -0.9040015332203154)  

  // Hack to speed up the simulation
  //guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  //guidParamWithUnits['showMassDriverBrackets'].value = false

  // Start rotating and zooming out the camera same time that the launch starts
  // nonGUIParams['startTimerActions'] = (startTimerParams) => {
  //   startTimerParams.animateZoomingOut = true
  //   startTimerParams.orbitControlsAutoRotate = true
  // }

}