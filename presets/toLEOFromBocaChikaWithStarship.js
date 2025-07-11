import * as THREE from 'three'
import { toLowOrbitWithRocket } from './toLowOrbitWithRocket.js'
//import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { setAllShowsToFalse } from "./cameraShotHelperFunctions"

export function toLEOFromBocaChikaWithStarship(guidParamWithUnits, nonGUIParams) {

  // Lat/Lon of Boca Chika is 25.9975° N, 97.1560° W  
  const rocketLaunchPadLatitude = 25.9975 // °N (Boca Chika)
  const rocketLaunchPadLongitude = -97.1560 // °W (Boca Chika)
  const massDriverAltitude = 10  // Temporary until we can remove the mass driver code entirely
  const rampExitAltitude = 400    // Temporary until we can remove the mass driver code entirely
  toLowOrbitWithRocket(guidParamWithUnits, rocketLaunchPadLatitude, rocketLaunchPadLongitude, massDriverAltitude, rampExitAltitude)

  guidParamWithUnits['launchVehicleFlameLength'].value = 1

  // ISPs are from https://x.com/elonmusk/status/1171118891671490560
  // At sea level values are estimated using ratio of "At Sea Level" thrust to "In Vacuum" thrust from Falcon9 which is 7607/8227. See "thrust" at https://www.spacex.com/vehicles/falcon-9/
  // guidParamWithUnits['rocketExhaustVelocityVacEngInVac'].value = 380*9.807
  // guidParamWithUnits['rocketExhaustVelocityVacEngAtSeaLevel'].value = 380*9.807*(7607/8227)
  // guidParamWithUnits['rocketExhaustVelocitySLEngInVac'].value = 350*9.807
  // guidParamWithUnits['rocketExhaustVelocitySLEngAtSeaLevel'].value = 350*9.807*(7607/8227)

  guidParamWithUnits['rocketVacuumEnginePropellantFlowRate'].value = 650
  guidParamWithUnits['rocketSeaLevelEnginePropellantFlowRate'].value = 650
  guidParamWithUnits['rocketStage1SeaLevelEngines'].value = 33
  guidParamWithUnits['rocketStage1VacuumEngines'].value = 0
  guidParamWithUnits['rocketStage2SeaLevelEngines'].value = 3
  guidParamWithUnits['rocketStage2VacuumEngines'].value = 3
  
  guidParamWithUnits['rocketPayloadMass'].value = 0

  guidParamWithUnits['launcherMarkerRadius'].value = 50

  //googleEarthStudioProvidedBackground(guidParamWithUnits, nonGUIParams)
  setAllShowsToFalse(guidParamWithUnits)
  guidParamWithUnits['showLogo'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['trackingMode'].value = 0
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0   // The 'P' key will point the camera at a point with altitude = 0
  guidParamWithUnits['showForwardAccelerationVersusTime'].value = false
  guidParamWithUnits['showUpwardAccelerationVersusTime'].value = false
  guidParamWithUnits['showApogeeAltitudeVersusTime'].value = false
  guidParamWithUnits['showPerigeeAltitudeVersusTime'].value = false
  guidParamWithUnits['showCloseApsisVersusTime'].value = false
  guidParamWithUnits['showFarApsisVersusTime'].value = false
  guidParamWithUnits['showAltitudeVersusTime'].value = true
  guidParamWithUnits['showAirPressureVersusTime'].value = false
  guidParamWithUnits['showDownrangeDistanceVersusTime'].value = false
  guidParamWithUnits['showAirSpeedVersusTime'].value = true
  guidParamWithUnits['showAerodynamicDragVersusTime'].value = false
  guidParamWithUnits['showPropellantMassFlowRateVersusTime'].value = false
  guidParamWithUnits['showTotalMassVersusTime'].value = false
  guidParamWithUnits['showOrbitalAltitudeVersusTime'].value = false
  guidParamWithUnits['showDeltaVVersusTime'].value = false
  guidParamWithUnits['showOrientationCorrectionVersusTime'].value = false
  guidParamWithUnits['showAngularMomentumVectorVersusTime'].value = false
  guidParamWithUnits['showEccentricityVersusTime'].value = false
  guidParamWithUnits['showRightAscensionOfAscendingNodeVersusTime'].value = false
  guidParamWithUnits['showInclinationVersusTime'].value = false
  guidParamWithUnits['showArgumentOfPerigeeVersusTime'].value = false
  guidParamWithUnits['showTrueAnomalyVersusTime'].value = false
  guidParamWithUnits['showSemimajorAxisVersusTime'].value = false
  guidParamWithUnits['showPredictedAltitudeVersusTime'].value = false



  guidParamWithUnits['showStars'].value = false
  guidParamWithUnits['rocketCoastTime'].value = 700
  guidParamWithUnits['launcherXyChartMaxT'].value = 100*60
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 5
  guidParamWithUnits['launchVehicleScaleFactor'].value = 3
  guidParamWithUnits['logZoomRate'].value = -3
  guidParamWithUnits['showXYChart'].value = true
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['enableBackgroundAlpha'].value = 1

  nonGUIParams['initialReferencePoint'] = '' //'feederRailEntrancePosition'

  guidParamWithUnits['rocketStage1DryMass'].value = 154415
  guidParamWithUnits['rocketStage2DryMass'].value = 123458
  guidParamWithUnits['rocketStage1RecoveryPropellantMass'].value = 654000
  guidParamWithUnits['rocketStage2RecoveryPropellantMass'].value = 28000
  guidParamWithUnits['rocketExhaustVelocityVacEngInVac'].value = 3520
  guidParamWithUnits['rocketExhaustVelocityVacEngAtSeaLevel'].value = 3451
  guidParamWithUnits['rocketExhaustVelocitySLEngInVac'].value = 2700
  guidParamWithUnits['rocketExhaustVelocitySLEngAtSeaLevel'].value = 2600
  guidParamWithUnits['rocketCoefficientOfDrag'].value = 0.6
  guidParamWithUnits['rocketStage1StructuralLoadLimit'].value = 27300000
  guidParamWithUnits['rocketStage2StructuralLoadLimit'].value = 2842463
  guidParamWithUnits['rocketSeparationDelay'].value = 5
  guidParamWithUnits['rocketDesiredOrbitalAltitude'].value = 200000

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-5694311.049928793, 2779249.1163286944, -715034.8056602069)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.8930025235698165, 0.43586569390757035, -0.11210526201928114)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-5692774.255240464, 2776212.1597679034, -721284.2381164293)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.8930025235698165, 0.43586569390757035, -0.11210526201928114)

  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    ((i==5) && (j==4)) // Boca Chica
  )} 

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 100
  nonGUIParams['farClip'] = 1000000000

  // Hack to speed up the simulation
  //guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  //guidParamWithUnits['showMassDriverBrackets'].value = false

  // Start rotating and zooming out the camera same time that the launch starts
  // nonGUIParams['startTimerActions'] = (startTimerParams) => {
  //   startTimerParams.animateZoomingOut = true
  //   startTimerParams.orbitControlsAutoRotate = true
  // }

}