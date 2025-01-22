import * as THREE from 'three'
import { toLowOrbitWithRocket } from './toLowOrbitWithRocket.js'
//import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { setAllShowsToFalse } from "./cameraShotHelperFunctions"

export function toLEOFromBocaChikaWithStarship(guidParamWithUnits, nonGUIParams) {

  // Lat/Lon of Boca Chika is 25.9975° N, 97.1560° W  
  const launcherRampEndLatitude = 25.9975 // °N (Boca Chika)
  const launcherRampEndLongitude = -97.1560 // °W (Boca Chika)
  const massDriverAltitude = 10  // Temporary until we can remove the mass driver code entirely
  const rampExitAltitude = 4000  // Temporary until we can remove the mass driver code entirely
  toLowOrbitWithRocket(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude)

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

  //googleEarthStudioProvidedBackground(guidParamWithUnits, nonGUIParams)
  setAllShowsToFalse(guidParamWithUnits)
  guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showAdaptiveNuts'].value = false

  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100*20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  //guidParamWithUnits['launchVehicleScaleFactor'].value = 300
  //guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 5000.0
  guidParamWithUnits['logZoomRate'].value = -3
  guidParamWithUnits['showXYChart'].value = true
  guidParamWithUnits['showMarkers'].value = true

  nonGUIParams['initialReferencePoint'] = '' //'feederRailEntrancePosition'

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-5688456.3101708945, 2794645.7669225773, -715246.7324399783)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.8918731941629815, 0.4381627476408296, -0.11214103670538951)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-5781180.701785349, 2739411.1838029707, -714002.3253086259)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.8918731941629815, 0.4381627476408296, -0.11214103670538951)

  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    ((i==5) && (j==4)) // Boca Chica
  )} 

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 100000000

  // Hack to speed up the simulation
  //guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  //guidParamWithUnits['showMassDriverBrackets'].value = false

  // Start rotating and zooming out the camera same time that the launch starts
  // nonGUIParams['startTimerActions'] = (startTimerParams) => {
  //   startTimerParams.animateZoomingOut = true
  //   startTimerParams.orbitControlsAutoRotate = true
  // }

}