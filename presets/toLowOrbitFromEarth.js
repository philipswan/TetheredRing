import * as THREE from 'three'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { showMassDriver } from "./cameraShotHelperFunctions"
import * as tram from '../tram'
import { toMarsFromEarthLauncherArchitecture } from './toMarsFromEarthLauncherArchitecture.js'

export function toLowOrbitFromEarth(guidParamWithUnits, nonGUIParams) {

  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74.34
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.681

  // Location specific parameters that will affect the architecture
  // Mauna Kea (19.820667, -155.468056)
  const launcherRampEndLatitude = 19.820667 // °N (Hawaii Big Island)
  const launcherRampEndLongitude = -155.468056 + .048056 // moving the end of the ramp a little bit east 
  const launchVehicleAirspeed = 8000 // m/s

  guidParamWithUnits['launchFromPlanet'].value = "Earth"
  guidParamWithUnits['launchToPlanet'].value = "Low Earth Orbit"
  guidParamWithUnits['launcherMassDriverAltitude'].value = 100 // m
  guidParamWithUnits['launcherRampExitAltitude'].value = 4500 // m  (Altitute of Mauna Kea summit (4207) plus ~300 meters which is an engineered truss structure that can be stowed underground when not in use)
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 15000 // m
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 50
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 100
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = launchVehicleAirspeed     // m/s
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = false
  guidParamWithUnits['launcherCoastTime'].value = 100*60
  guidParamWithUnits['launcherFeederRailLength'].value = 30
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 0 // Auto mode

  const r = guidParamWithUnits['launchVehicleRadius'].value
  const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value
  const {interiorVolume, dryMass} = tram.estimateVehicleVolumeMass(r, bl, ncl, rel)
  const propellantDensity = 360 // kg/m3
  const payloadDensity = 360 // kg/m3
  const propellantMass = 3000
  const payloadMass = (interiorVolume - propellantMass / propellantDensity) * payloadDensity
  guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass    // kg
  guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass   // kg
  guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass   // kg
  //launchVehicleNonPayloadMass
  guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 80  // m/s2
  guidParamWithUnits['launcherRampUpwardAcceleration'].value = 160
  guidParamWithUnits['launcherMaxEyesInAcceleration'].value = 80
  guidParamWithUnits['launcherMaxEyesOutAcceleration'].value = 80
  //guidParamWithUnits['launcherRampTurningRadius'].value = 250000
  guidParamWithUnits['launcherRampTurningRadius'].value = 381000
  guidParamWithUnits['launcherRampTurningRadius'].value = 49096
  guidParamWithUnits['launcherRampDesignMode'].value = 0
  guidParamWithUnits['planetName'].value = "Earth"
  guidParamWithUnits['launcherLocationMode'].value = 1
  guidParamWithUnits['launcherRampEndLatitude'].value = launcherRampEndLatitude
  guidParamWithUnits['launcherRampEndLongitude'].value = launcherRampEndLongitude

  guidParamWithUnits['propellantNeededForLandingOnMars'].value = 1000 //kg // ToDo - We need to make a proper estimate of this
  guidParamWithUnits['launcherMassDriverScrewNumBrackets'].value = 80000 // 300
  guidParamWithUnits['launcherFeederRailLength'].value = 0
  guidParamWithUnits['numLaunchesPerMarsTransferSeason'].value = 14*4 // 14 days, four lauches per day
  guidParamWithUnits['numberOfMarsTransferSeasons'].value = 10
  guidParamWithUnits['adaptiveNutNumGrapplers'].value = 64
  guidParamWithUnits['adaptiveNutGrapplerMagnetThickness'].value = 0.06  // m
 
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
  showMassDriver(guidParamWithUnits)
  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)
  guidParamWithUnits['showStars'].value = true
  //guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100*20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 3
  //guidParamWithUnits['launchVehicleScaleFactor'].value = 300
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 500.0
  guidParamWithUnits['logZoomRate'].value = -3
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showMarkers'].value = true

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 100000000

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-20.596624654252082, -18.795628492254764, -28.63014849368483)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.2672085688689862, 0.33374015320741873, -0.9040006033516111)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(98.94242870318703, -63.433976754080504, -84.42750348616391)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.2672085688689862, 0.33374015320741873, -0.9040006033516111)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-10.22879414097406, 1.391210527624935, 1.4851894294843078)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.269815220766585, 0.33386822226202806, -0.9031786959435393)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-12.609756035730243, -14.428051792550832, -4.398444567807019)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.269815220766585, 0.33386822226202806, -0.9031786959435393)
  
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-792047.7715618422, 23312.00666318601, 300221.2602548003)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3909145665914432, 0.33716689860362425, -0.8564486465122338)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-887323.9041289391, 70376.78830169467, 91036.49722965527)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3909145665914432, 0.33716689860362425, -0.8564486465122338)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-442225.995872651, 156923.79012277396, 184517.0484141186)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.267210746924624, 0.33373589058311254, -0.9040015332203154)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-485220.1577472219, -543684.1227839389, -219995.83733422682)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.267210746924624, 0.33373589058311254, -0.9040015332203154)  
  
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-780132.7900953067, 41764.54504580656, 290685.1760425009)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.39085758595486675, 0.3366053003813937, -0.8566955230749637)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-778426.6457124173, -61992.33274240047, 196607.0947371293)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.39085758595486675, 0.3366053003813937, -0.8566955230749637)

  // Hack to speed up the simulation
  //guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  //guidParamWithUnits['showMassDriverBrackets'].value = false

  // Start rotating and zooming out the camera same time that the launch starts
  // nonGUIParams['startTimerActions'] = (startTimerParams) => {
  //   startTimerParams.animateZoomingOut = true
  //   startTimerParams.orbitControlsAutoRotate = true
  // }

}