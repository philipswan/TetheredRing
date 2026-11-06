// Scene presets. A preset sets parameter values and scene options (camera placement, which planet
// assets to stream, lighting, ...) before the scene is built. Select one with the "Preset" dropdown
// or the ?preset=<id> URL parameter; shot files record the preset id they were made with.
//
// Each preset is a function (guidParamWithUnits, nonGUIParams) that mutates its arguments:
//   guidParamWithUnits[name].value  -- parameter values (see src/params/parameterDefinitions.js)
//   nonGUIParams[name]              -- construction-time options that are not GUI parameters
import * as THREE from 'three'
import { launchVehicleDollyShot } from './launchVehicleDollyShot.js'
import { demonstratorLauncher } from './demonstratorLauncher.js'
import { grapplerEngineeringPresets } from './grapplerEngineeringPresets.js'
import { toMarsHawaiiLauncherPresets } from './toMarsHawaiiLauncherPresets.js'
import { elevatedEvacuatedTubeDeployment } from './elevatedEvacuatedTubeDeployment.js'
import { toLEOFromBocaChikaWithStarship } from './toLEOFromBocaChikaWithStarship.js'
import { toLowOrbitFromEarth } from './toLowOrbitFromEarth.js'
import { olympusMonsLauncher } from './olympusMonsLauncher.js'
import { edwardsAirforceBasePresets } from './edwardsAirforceBasePresets.js'
import { launchLookingBackwards } from './launchLookingBackwards.js'
import { multipleRings } from './multipleRings.js'
import { multipleUSRings } from './multipleUSRings.js'
import { toOrbitFromMoonLauncherPresets } from './toOrbitFromMoonLauncherPresets.js'
import { variableSpeedScrew } from './variableSpeedScrew.js'
import { launcherSystemUnderwater } from './launcherSystemUnderwater.js'
import { planetSetup } from './planetSetup.js'


export const DEFAULT_PRESET_ID = 'default'

export const PRESETS = [
  { id: 'default', label: 'Default overview', apply: defaultBehaviour },
  { id: 'launchVehicleOrbit', label: 'Launch vehicle orbit', apply: launchVehicleOrbit },
  { id: 'launchVehicleDollyShot', label: 'Launch vehicle dolly shot', apply: launchVehicleDollyShot },
  { id: 'launchVehiclePanShot', label: 'Launch vehicle pan shot', apply: launchVehiclePanShot },
  { id: 'transitVehicleDollyShotWashington', label: 'Transit vehicle dolly shot (Washington)', apply: transitVehicleDollyShotWashington },
  { id: 'transitVehicleDollyShotAustralia', label: 'Transit vehicle dolly shot (Australia)', apply: transitVehicleDollyShotAustralia },
  { id: 'multipleRings', label: 'Multiple rings', apply: multipleRings },
  { id: 'multipleUSRings', label: 'Multiple US rings', apply: multipleUSRings },
  { id: 'launchVehiclePanShotInSpace', label: 'Launch vehicle pan shot in space', apply: launchVehiclePanShotInSpace },
  { id: 'launchVehicleFountain', label: 'Launch vehicle fountain', apply: launchVehicleFountain },
  { id: 'launchSystemOverview', label: 'Launch system overview', apply: launchSystemOverview },
  { id: 'solarPanelsCalifornia', label: 'Solar panels (California)', apply: solarPanelsCalifornia },
  { id: 'twoStageMassDriver', label: 'Two-stage mass driver', apply: twoStageMassDriver },
  { id: 'bigIslandLauncher', label: 'Big Island launcher', apply: bigIslandLauncher },
  { id: 'equatorialLauncher', label: 'Equatorial launcher', apply: equatorialLauncher },
  { id: 'smallRing', label: 'Small ring', apply: smallRing },
  { id: 'movingRingsOrbit', label: 'Moving rings orbit', apply: movingRingsOrbit },
  { id: 'demonstratorLauncher', label: 'Demonstrator launcher', apply: demonstratorLauncher },
  { id: 'toLEOFromBocaChikaWithStarship', label: 'To LEO from Boca Chica with Starship', apply: toLEOFromBocaChikaWithStarship },
  { id: 'christmasIslandLauncher', label: 'Christmas Island launcher', apply: christmasIslandLauncher },
  { id: 'flightPaths', label: 'Flight paths', apply: flightPaths },
  { id: 'grapplerEngineering', label: 'Grappler engineering', apply: grapplerEngineeringPresets },
  { id: 'toMarsHawaii', label: 'To Mars from Hawaii (planet2 terrain)', apply: toMarsHawaiiLauncherPresets },
  { id: 'elevatedEvacuatedTubeDeployment', label: 'Elevated evacuated tube deployment', apply: elevatedEvacuatedTubeDeployment },
  { id: 'olympusMonsLauncher', label: 'Olympus Mons launcher (Mars)', apply: olympusMonsLauncher },
  { id: 'edwardsAirforceBase', label: 'Edwards Air Force Base', apply: edwardsAirforceBasePresets },
  { id: 'launchLookingBackwards', label: 'Launch looking backwards', apply: launchLookingBackwards },
  { id: 'toLowOrbitFromEarth', label: 'To low orbit from Earth', apply: toLowOrbitFromEarth },
  { id: 'toOrbitFromMoon', label: 'To orbit from the Moon (lunar terrain)', apply: toOrbitFromMoonLauncherPresets },
  { id: 'variableSpeedScrew', label: 'Variable-speed screw', apply: variableSpeedScrew },
  { id: 'launcherSystemUnderwater', label: 'Launcher system underwater', apply: launcherSystemUnderwater },
]

export function findPreset(id) {
  return PRESETS.find(p => p.id === id) ?? null
}

// Applies the defaults every preset starts from, then the chosen preset.
export function applyPreset(id, guidParamWithUnits, nonGUIParams) {
  const preset = findPreset(id) ?? findPreset(DEFAULT_PRESET_ID)
  nonGUIParams['getRingSpecs'] = () => {
    return [{
      locationSpec: {
        buildLat: guidParamWithUnits['buildLocationRingCenterLatitude'].value,
        buildLon: guidParamWithUnits['buildLocationRingCenterLongitude'].value,
        finalLat: guidParamWithUnits['finalLocationRingCenterLatitude'].value,
        finalLon: guidParamWithUnits['finalLocationRingCenterLongitude'].value
      }
    }]
  }
  nonGUIParams['startTimerActions'] = (startTimerParams) => {}
  nonGUIParams['setResolutionFromBackgroundVideo'] = false
  preset.apply(guidParamWithUnits, nonGUIParams)
  return preset
}

function defaultBehaviour(guidParamWithUnits, nonGUIParams) {
  
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0, 1, 0)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(2.92909490611565e-9, 1.464547453057825e-9, -23917875)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0, 1, 0)
  nonGUIParams['overrideClipPlanes'] = false
  nonGUIParams['nearClip'] = 0.1
  nonGUIParams['farClip'] = 600000000

}

function launchVehicleOrbit(guidParamWithUnits, nonGUIParams) {
  // Near the new_zealand regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['new_zealand'] })

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showEarthAxis'].value = true
  guidParamWithUnits['showEarthEquator'].value = true
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showStationaryRings'].value = true
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = true
  guidParamWithUnits['showTransitVehicles'].value = true
  guidParamWithUnits['showRingTerminuses'].value = true
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = true
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = true
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['launcherMassDriverScrewNumBrackets'].value = 80000
  guidParamWithUnits['launcherMassDriverScrewBracketThickness'].value = 0.02
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 100
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 5
  guidParamWithUnits['orbitControlsRotateSpeed'].value = -.0001
  guidParamWithUnits['logZoomRate'].value = -3

  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 3
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['numVirtualLaunchSleds'].value = 1
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 20
  guidParamWithUnits['launcherFeederRailLength'].value = 20
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 500
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
  guidParamWithUnits['numVirtualRingTerminuses'].value = 10000

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1089202.1956358338, -3902623.2216274855, -4925909.955900454)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.17076990043377732, -0.6118685586241525, -0.7723046730876617)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1089240.7241478835, -3902638.8456773777, -4925903.188283286)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.17076990043377732, -0.6118685586241525, -0.7723046730876617)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1082214.6746342087, -3904219.0954899974, -4926186.774702437)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.1696740181490977, -0.6121191921409517, -0.7723476045006692)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1082215.4347764272, -3904221.5535437455, -4926185.72475156)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.1696740181490977, -0.6121191921409517, -0.7723476045006692)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-63636.3777848408, -4115849.7575696534, -4913396.378631104)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-64172.35213304402, -4115800.0825407896, -4913293.827853268)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(210757.18355882427, -4012137.7432638933, -4932894.541903759)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(480331.6551612802, -4195149.259355443, -4883519.833408484)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2165961.395604829, 2151545.706611093, -5567865.682549198)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3665540565881692, 0.3276645652229013, -0.8707893294569269)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-1894419.9636432864, 1725570.1470296388, -6162027.437464318)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3665540565881692, 0.3276645652229013, -0.8707893294569269)
  
  // Hawaii
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2307593.902230268, 2191199.386457382, -5527259.744988217)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.36181387751791044, 0.3435640671709055, -0.866633976823226)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(780917.2197601651, 1247175.8999634252, -8913282.292151898)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.36181387751791044, 0.3435640671709055, -0.866633976823226)

  nonGUIParams['initialReferencePoint'] = 'feederRailEntrancePosition'
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-20.596624654252082, -18.795628492254764, -28.63014849368483)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.2672085688689862, 0.33374015320741873, -0.9040006033516111)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(98.94242870318703, -63.433976754080504, -84.42750348616391)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.2672085688689862, 0.33374015320741873, -0.9040006033516111)

  // nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 100
  nonGUIParams['farClip'] = 1000000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}

function launchVehiclePanShot(guidParamWithUnits, nonGUIParams) {
  // Near the new_zealand regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['new_zealand'] })

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  const allFeaturesOn = true
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = allFeaturesOn
  guidParamWithUnits['showStars'].value = allFeaturesOn
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showTransitSystem'].value = allFeaturesOn
  guidParamWithUnits['showStationaryRings'].value = allFeaturesOn
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = allFeaturesOn
  guidParamWithUnits['showTransitVehicles'].value = allFeaturesOn
  guidParamWithUnits['showRingTerminuses'].value = allFeaturesOn
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = allFeaturesOn
  guidParamWithUnits['showElevatorCars'].value = allFeaturesOn
  guidParamWithUnits['showHabitats'].value = allFeaturesOn
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = true
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['logZoomRate'].value = -3

  // Launcher parameters
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = .5
  guidParamWithUnits['launcherMassDriverAltitude'].value = 800
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['numVirtualMassDriverTubes'].value = 64
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.857
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value =  6


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

  // Australia
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(3648776.8297729506, -2166831.68765253, -4762523.836569949)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.5720072159420826, -0.33968735795396227, -0.7466058155120708)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(3647968.337570933, -2167679.903115839, -4762759.525260652)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.5720072159420826, -0.33968735795396227, -0.7466058155120708)
  
  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 10000000
  // Adjust near clipping plane
  // Tube bouncing - might need more tube segments...
  // Shorten the launcher
  // Adjust lighting - too bright
  // Add struts to grapplers

}


function transitVehicleDollyShotWashington(guidParamWithUnits, nonGUIParams) {
  // Near the washington regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['washington'] })

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  const allFeaturesOn = true
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = allFeaturesOn
  guidParamWithUnits['showStars'].value = allFeaturesOn
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showTransitSystem'].value = allFeaturesOn
  guidParamWithUnits['showStationaryRings'].value = allFeaturesOn
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = allFeaturesOn
  guidParamWithUnits['showTransitVehicles'].value = allFeaturesOn
  guidParamWithUnits['showRingTerminuses'].value = allFeaturesOn
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = allFeaturesOn
  guidParamWithUnits['showElevatorCars'].value = allFeaturesOn
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = false
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['showLaunchVehicles'].value = false
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 1
  guidParamWithUnits['showMarkers'].value = true

  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['logZoomRate'].value = -2
  guidParamWithUnits['transitTubeOpacity'].value = 0.05
  guidParamWithUnits['transitVehicleCruisingSpeed'].value = 4000
  guidParamWithUnits['transitVehicleStopDuration'].value = 22
  guidParamWithUnits['transitVehicleRandomizeStartPositions'].value = false

  guidParamWithUnits['numVirtualTransitVehicles'].value = 4000 * 8
  guidParamWithUnits['numVirtualGroundTerminuses'].value = 4000
  guidParamWithUnits['numVirtualRingTerminuses'].value = 4000
  guidParamWithUnits['numElevatorCables'].value = 4000
  guidParamWithUnits['numVirtualHabitats'].value = 0

  // Hack
  //guidParamWithUnits['transitVehicleCruisingSpeed'].value = 4
  // guidParamWithUnits['showTrackingMarkers'].value = true
  // guidParamWithUnits['trackingMarkerSize'].value = 10


  // Seattle
  nonGUIParams['cameraAtRingHeight'] = true // placed against the ring on the sphere; lowered with it
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3724410.278152983, 4710017.83565673, -2243449.2392905336)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.5810279609523532, 0.7347880213825453, -0.3499901030376074)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3725506.7143735993, 4709667.556950768, -2242269.015923921)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.5810279609523532, 0.7347880213825453, -0.3499901030376074)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 10
  nonGUIParams['farClip'] = 100000000

}

function transitVehicleDollyShotAustralia(guidParamWithUnits, nonGUIParams) {
  // Near the queensland regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['queensland'] })

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  const allFeaturesOn = true
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = allFeaturesOn
  guidParamWithUnits['showStars'].value = allFeaturesOn
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showTransitSystem'].value = allFeaturesOn
  guidParamWithUnits['showStationaryRings'].value = allFeaturesOn
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = allFeaturesOn
  guidParamWithUnits['showTransitVehicles'].value = allFeaturesOn
  guidParamWithUnits['showRingTerminuses'].value = allFeaturesOn
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = allFeaturesOn
  guidParamWithUnits['showElevatorCars'].value = allFeaturesOn
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = false
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['showLaunchVehicles'].value = false
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 1
  guidParamWithUnits['showMarkers'].value = false

  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  //guidParamWithUnits['orbitControlsRotateSpeed'].value = -.5
  guidParamWithUnits['logZoomRate'].value = -1
  guidParamWithUnits['transitTubeOpacity'].value = 0.05
  guidParamWithUnits['transitVehicleCruisingSpeed'].value = 4000
  guidParamWithUnits['transitVehicleStopDuration'].value = 42
  guidParamWithUnits['transitVehicleRandomizeStartPositions'].value = false

  guidParamWithUnits['numVirtualTransitVehicles'].value = 4000 * 8
  guidParamWithUnits['numVirtualGroundTerminuses'].value = 4000
  guidParamWithUnits['numVirtualRingTerminuses'].value = 4000
  guidParamWithUnits['numElevatorCables'].value = 4000
  guidParamWithUnits['numVirtualHabitats'].value = 0

  // Australia at Ring
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(3854081.875702202, -1869253.445959495, -4768685.441456861)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.6012689149188755, -0.2916173650948143, -0.7439321234678846)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(3854225.933371469, -1869011.7999721793, -4768741.209966059)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.6012689149188755, -0.2916173650948143, -0.7439321234678846)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 10000000

  // Adjust near clipping plane
  // Tube bouncing - might need more tube segments...
  // Adjust lighting - too bright

}


function launchVehiclePanShotInSpace(guidParamWithUnits, nonGUIParams) {

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  const allFeaturesOn = false
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = false
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = allFeaturesOn
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = true
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 3000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['logZoomRate'].value = -1
  guidParamWithUnits['cameraFieldOfView'].value = 20

  // Launcher parameters
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = .5
  guidParamWithUnits['launcherMassDriverAltitude'].value = 800
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['numVirtualMassDriverTubes'].value = 64
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.857
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value =  6


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

  // Australia
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(3648776.8297729506, -2166831.68765253, -4762523.836569949)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.5720072159420826, -0.33968735795396227, -0.7466058155120708)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(3647968.337570933, -2167679.903115839, -4762759.525260652)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.5720072159420826, -0.33968735795396227, -0.7466058155120708)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 10
  nonGUIParams['farClip'] = 10000000000
  // Adjust near clipping plane
  // Tube bouncing - might need more tube segments...
  // Shorten the launcher
  // Adjust lighting - too bright
  // Add struts to grapplers

}

function launchVehicleFountain(guidParamWithUnits, nonGUIParams) {
  // Near the new_zealand regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['new_zealand'] })

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = false
  guidParamWithUnits['showStars'].value = false
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = false
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = false
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showLaunchVehiclePointLight'].value = true
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 4.5
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 3
  //guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 1000
  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(384587.067768322, -4036766.0558425565, -4923631.703887237)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06029407718038538, -0.6328686129320207, -0.7719079887023231)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(393066.7034365224, -4084241.1876733834, -4890071.8842349565)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.06029407718038538, -0.6328686129320207, -0.7719079887023231)

  nonGUIParams['initialReferencePoint'] = 'feederRailEntrancePosition'

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-1008.2859871687251, -388.6212618118152, 345.26719563733786)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06307189289785171, -0.6324554954458451, -0.7720245997418945)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(640.438746019383, -1545.674466157332, 680.3350654970855)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.06307189289785171, -0.6324554954458451, -0.7720245997418945)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 0.1
  nonGUIParams['farClip'] = 100000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}

function LaunchVehicleAndTubeBugs(guidParamWithUnits, nonGUIParams) {

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = false
  guidParamWithUnits['showStars'].value = false
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = false
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = false
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showLaunchVehiclePointLight'].value = true
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 500
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  //guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 15000
  guidParamWithUnits['launchVehicleScaleFactor'].value = 100
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 20

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(384587.067768322, -4036766.0558425565, -4923631.703887237)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06029407718038538, -0.6328686129320207, -0.7719079887023231)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(393066.7034365224, -4084241.1876733834, -4890071.8842349565)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.06029407718038538, -0.6328686129320207, -0.7719079887023231)
      

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 0.1
  nonGUIParams['farClip'] = 10000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}

function launchSystemOverview(guidParamWithUnits, nonGUIParams) {
  // Near the new_zealand regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['new_zealand'] })

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showTransitSystem'].value = true
  guidParamWithUnits['showStationaryRings'].value = true
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = true
  guidParamWithUnits['showTransitVehicles'].value = true
  guidParamWithUnits['showRingTerminuses'].value = true
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = true
  guidParamWithUnits['showElevatorCars'].value = true
  guidParamWithUnits['showHabitats'].value = true
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 3000
  guidParamWithUnits['launchSledCameraRange'].value = 1000000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 15
  guidParamWithUnits['orbitControlsRotateSpeed'].value = -1.4
  guidParamWithUnits['logZoomRate'].value = -2.5

  guidParamWithUnits['launcherMassDriverAltitude'].value = 400
  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  //guidParamWithUnits['launchSledUpwardsOffset'].value = 
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 1000
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
  guidParamWithUnits['launchSystemForwardScaleFactor'].value = 300
  guidParamWithUnits['launchSystemUpwardScaleFactor'].value = 300
  guidParamWithUnits['launchSystemRightwardScaleFactor'].value = 300

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1005694.9767440184, -3932640.1689530904, -4921963.9082510285)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1162702.6363794354, -4023801.194321223, -4917795.912447176)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1080874.6463911165, -3904833.8259542934, -4926382.551169978)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.16945592951181573, -0.612186850506278, -0.772341859554751)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1080897.152044865, -3904846.893077751, -4926381.953724792)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.16945592951181573, -0.612186850506278, -0.772341859554751)


  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 10000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}

function solarPanelsCalifornia(guidParamWithUnits, nonGUIParams) {
  // 15 August: the real clouds' snapshot nearest the default (hashed) day had a featureless deck over the view.
  guidParamWithUnits['sunDayOfYear'].value = 228

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  const allFeaturesOn = true
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = allFeaturesOn
  guidParamWithUnits['showStars'].value = allFeaturesOn
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showTransitSystem'].value = allFeaturesOn
  guidParamWithUnits['showStationaryRings'].value = allFeaturesOn
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = allFeaturesOn
  guidParamWithUnits['showTransitVehicles'].value = allFeaturesOn
  guidParamWithUnits['showRingTerminuses'].value = allFeaturesOn
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = allFeaturesOn
  guidParamWithUnits['showElevatorCars'].value = allFeaturesOn
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = true
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMassDriverTube'].value = false
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['showLaunchVehicles'].value = false
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 1
  guidParamWithUnits['showMarkers'].value = false

  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['logZoomRate'].value = -2.5
  guidParamWithUnits['transitTubeOpacity'].value = 0.05
  guidParamWithUnits['transitVehicleCruisingSpeed'].value = 4000
  guidParamWithUnits['transitVehicleStopDuration'].value = 22
  guidParamWithUnits['transitVehicleRandomizeStartPositions'].value = false

  guidParamWithUnits['numVirtualTransitVehicles'].value = 4000 * 8
  guidParamWithUnits['numVirtualGroundTerminuses'].value = 4000
  guidParamWithUnits['numVirtualRingTerminuses'].value = 4000
  guidParamWithUnits['numElevatorCables'].value = 4000
  guidParamWithUnits['numVirtualHabitats'].value = 0
  guidParamWithUnits['numVirtualSolarArrays'].value = 1000000

  // California
  nonGUIParams['cameraAtRingHeight'] = true // placed against the ring on the sphere; lowered with it
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-4126649.50347885, 4336131.069876342, -2292694.6838267166)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-4127217.359602618, 4335764.529077124, -2292992.795739126)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 10
  nonGUIParams['farClip'] = 10000000

  // Adjust near clipping plane
  // Tube bouncing - might need more tube segments...
  // Shorten the launcher
  // Adjust lighting - too bright

}

function twoStageMassDriver(guidParamWithUnits, nonGUIParams) {
  // Near the new_zealand regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['new_zealand'] })

  // Uses Mt Ruapehu launch location

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = true
  guidParamWithUnits['showEarthsSurface'].value = true
  //guidParamWithUnits['earthTextureOpacity'].value = 0.25
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showTransitSystem'].value = true
  guidParamWithUnits['showStationaryRings'].value = true
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = true
  guidParamWithUnits['showTransitVehicles'].value = true
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = true
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = true
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['numVirtualRingTerminuses'].value = 10000
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 300
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 3
  guidParamWithUnits['logZoomRate'].value = -3

  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 3
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 6
  guidParamWithUnits['numVirtualLaunchSleds'].value = 6
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 400
  guidParamWithUnits['launchVehicleRadius'].value = 1.5
  guidParamWithUnits['launchVehicleBodyLength'].value = 10

  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 4500
  guidParamWithUnits['launchVehicleEmptyMass'].value = 1000
  guidParamWithUnits['launchVehiclePayloadMass'].value = 100

  // Estimte the launchVehicle's volume and dry mass from its mass diameter and length
  const r = guidParamWithUnits['launchVehicleRadius'].value
  const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value
  const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  const π = Math.PI
  const interiorVolume = r**2 * π * (bl - rel  + ncl/3)
  const surfaceArea = 2 * π * r * bl + π * r * Math.sqrt(ncl**2 + r**2)
  const skinThickness = 0.003  // Includes any ribs, stringers, etc as well as skin
  const skinMaterialDensity = 8000 // kg/m3
  const rocketEngineMass = 3177 // kg (based on RS-25)
  const avionicsEtcMass = 1000 // kg

  // Hack
  const dryMass = 0 //skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass
  // Allocate the volume between the payload and the propellant
  const propellantDensity = 360 // kg/m3
  const payloadDensity = 360 // kg/m3
  const propellantMass = interiorVolume * propellantDensity
  const payloadMass = 0 // (interiorVolume - propellantMass / propellantDensity) * payloadDensity
  console.log('dryMass', dryMass)
  console.log('payloadMass', payloadMass)
  console.log('propellantMass', payloadMass)
  console.log('totalMass', payloadMass + dryMass)

  guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass    // kg
  guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass   // kg
  guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass   // kg
  // Parameters that are going to effect the launch system's performance...
  // Launch Angle (launchVehicleRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.


  switch (50) {
    case 0.5:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 70       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 500     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s
      break
    case 1:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 140       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 1000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s
      break
      // Mass Fraction = 0.013
    case 2:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 135       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 2000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      break
      // Mass Fraction = 0.075
    case 3:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 120       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 3000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      break
      // Mass Fraction = 0.146
    case 4:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 110       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 4000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      break
      // Mass Fraction = 0.232
    case 5:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 80       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 5000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      // Mass Fraction = 0.339
      break
    case 6:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 60       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 6000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      // Mass Fraction = 0.473
      break
    case 7:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 24       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 7000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      // Mass Fraction = 0.635
      break
    case 8:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 50       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 3300     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = 0         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 2900           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 3300  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      // Mass Fraction =
      break
    case 50:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 50       // m/s2
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 4500           // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      break
    case 51:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 50       // m/s2
      guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2       // m/s
      guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 40      // m/s
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 100     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = 0         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 100         // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 110  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      break
    case 52:
      guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
      guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 50       // m/s2
      // guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2       // m/s
      // guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 40      // m/s
      guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000     // m/s
      guidParamWithUnits['launcherMassDriverAltitude'].value = 0         // m
      guidParamWithUnits['launcherRampExitAltitude'].value = 1000         // m
      guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 4000  // m
      guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
      break

  }

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1085383.8669969547, -3902699.9169670017, -4926661.290153145)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1085051.7452291835, -3902846.696186079, -4926668.713904155)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(392362.28345846327, -4073057.909934009, -4892485.123762921)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06151710833298002, -0.6386005103137135, -0.7670756374761313)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(638339.3390246285, -5101790.093401408, -4083665.75154447)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.06151710833298002, -0.6386005103137135, -0.7670756374761313)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(378524.6040990794, -4045316.9481399837, -4925332.910447178)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.059654109070758805, -0.6338627678877135, -0.7711416074604592)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(392764.46257647, -4063550.977465477, -4914259.685875784)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(0.059654109070758805, -0.6338627678877135, -0.7711416074604592)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(380525.60358032025, -4038146.2734964443, -4922552.789112389)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.059654109070758805, -0.6338627678877135, -0.7711416074604592)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(382481.65103939606, -4038404.374358447, -4922505.895094078)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.059654109070758805, -0.6338627678877135, -0.7711416074604592)    

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 10
  nonGUIParams['farClip'] = 40000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}

function bigIslandLauncher(guidParamWithUnits, nonGUIParams) {

  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.6815

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  //guidParamWithUnits['earthTextureOpacity'].value = 0.25
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = false
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showStatorMagnets'].value = false
  guidParamWithUnits['showTransitTube'].value = false
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showTransitTracks'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false

  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['launcherMarkerRadius'].value = 500

  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = true
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = true
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['numVirtualRingTerminuses'].value = 10000
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 10000
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .2
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  guidParamWithUnits['logZoomRate'].value = -3

  // guidParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value = 0.375 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value = 0.3 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewThreadRadius'].value = .5 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewThreadThickness'].value = .05 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewRoughLength'].value = .25 //* .25/5

  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  // (This preset used a 100 m tube radius so the track showed up from far away; it now uses the real size.)
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['numVirtualLaunchSleds'].value = 1
  // A launch every 20 minutes, each after a feeder ship has brought its cargo to the ocean terminal (launchCadence.js).
  guidParamWithUnits['launchVehicleSpacingInSeconds'].value = 1200
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 1000
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 8  // m

  //guidParamWithUnits['launchVehicleRadius'].value = 1.5
  //guidParamWithUnits['launchVehicleBodyLength'].value = 10

  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = false
  guidParamWithUnits['launcherCoastTime'].value = 93*60 / 2
  guidParamWithUnits['launchVehicleEmptyMass'].value = 1000
  guidParamWithUnits['launchVehiclePayloadMass'].value = 100

  // Estimte the launchVehicle's volume and dry mass from its mass diameter and length
  const r = guidParamWithUnits['launchVehicleRadius'].value
  const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value
  const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  const π = Math.PI
  const interiorVolume = r**2 * π * (bl - rel  + ncl/3)
  const surfaceArea = 2 * π * r * bl + π * r * Math.sqrt(ncl**2 + r**2)
  const skinThickness = 0.003  // Includes any ribs, stringers, etc as well as skin
  const skinMaterialDensity = 8000 // kg/m3
  const rocketEngineMass = 3177 // kg (based on RS-25)
  const avionicsEtcMass = 1000 // kg

  // Hack
  const dryMass = 0 //skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass
  // Allocate the volume between the payload and the propellant
  const propellantDensity = 360 // kg/m3
  const payloadDensity = 360 // kg/m3
  const propellantMass = interiorVolume * propellantDensity
  const payloadMass = 0 // (interiorVolume - propellantMass / propellantDensity) * payloadDensity
  console.log('dryMass', dryMass)
  console.log('payloadMass', payloadMass)
  console.log('propellantMass', payloadMass)
  console.log('totalMass', payloadMass + dryMass)

  guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass    // kg
  guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass   // kg
  guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass   // kg
  // Parameters that are going to effect the launch system's performance...
  // Launch Angle (launchVehicleRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
  guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 70
  guidParamWithUnits['launcherRampDesignMode'].value = 0
  //guidParamWithUnits['launcherRampTurningRadius'].value = 250000
  guidParamWithUnits['launcherRampTurningRadius'].value = 381000
  guidParamWithUnits['launcherRampTurningRadius'].value = 49096
  //guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 50       // m/s2
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 5500     // m/s
  guidParamWithUnits['launcherMassDriverAltitude'].value = -150        // m (submerged, moored to the sea floor; as in toMarsHawaii)
  guidParamWithUnits['launcherRampExitAltitude'].value = 4500           // m  (Altitute of Mauna Kea summit (4207) plus ~300 meters)
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 15000  // m
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  //guidParamWithUnits['launchVehicleRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2476152.695003177, 2163687.090317844, -5516496.147743987)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.39104480167972105, 0.33343715687290343, -0.8578482531868805)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2353919.4598949375, 1882125.1810429322, -5788929.236748725)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.39104480167972105, 0.33343715687290343, -0.8578482531868805)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2141299.931502703, 2114722.5368433706, -5619536.116728196)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3351207342153644, 0.33338091138840403, -0.8812214599184579)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2134661.4309153776, 2101371.730378247, -5635563.822049001)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3351207342153644, 0.33338091138840403, -0.8812214599184579)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2138622.027473265, 2120063.832549798, -5622552.560326888)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.33530391088807443, 0.33238797984899815, -0.8815268108203315)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2138568.504086628, 2119994.796780028, -5622621.973677439)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.33530391088807443, 0.33238797984899815, -0.8815268108203315)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2150000.7446935046, 2120376.2679333487, -5618092.758162816)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.33708569178937653, 0.33244104816902326, -0.8808269897563077)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2150159.2265106635, 2120350.627335476, -5618051.057699365)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.33708569178937653, 0.33244104816902326, -0.8808269897563077)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2491106.305939982, 2120656.272177813, -5447757.554648286)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3901202681575166, 0.3354310762809081, -0.8574917897203093)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2470937.952519685, 2048799.9499429713, -5527483.037906753)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3901202681575166, 0.3354310762809081, -0.8574917897203093)

  // Near the Big Island's regional bake: load the launcher's surroundings first.
  planetSetup(nonGUIParams, {
    near: ['hawaii'],
    interests: [
      { name: 'Mauna Kea', lat: 19.8207, lon: -155.4681, radiusKm: 80, lodBoost: 2 },
      { name: 'Hawaii Launch Corridor', lat: 19.6, lon: -156.0, radiusKm: 140, lodBoost: 1.5 },
    ],
  })

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 100000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}

function equatorialLauncher(guidParamWithUnits, nonGUIParams) {

  // Uses Monna Kea launch location
  // guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74
  // guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  //guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.6815

  // Kilamanjaro, Africa
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 54.5
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 40
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.1295

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  
  guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = true
  guidParamWithUnits['showEarthsSurface'].value = true
  //guidParamWithUnits['earthTextureOpacity'].value = 0.25
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = false
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = false
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = true
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['launcherMarkerRadius'].value = 500

  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = true
  guidParamWithUnits['showMassDriverRail'].value = true
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['numVirtualRingTerminuses'].value = 10000
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 300
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 3
  guidParamWithUnits['logZoomRate'].value = -3

  guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 3
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 6
  guidParamWithUnits['numVirtualLaunchSleds'].value = 6
  guidParamWithUnits['launchVehicleRadius'].value = 1.5
  guidParamWithUnits['launchVehicleBodyLength'].value = 10

  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 10*60/2 //93*60 / 2
  guidParamWithUnits['launchVehicleEmptyMass'].value = 1000
  guidParamWithUnits['launchVehiclePayloadMass'].value = 100

  // Estimte the launchVehicle's volume and dry mass from its mass diameter and length
  const r = guidParamWithUnits['launchVehicleRadius'].value
  const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value
  const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  const π = Math.PI
  const interiorVolume = r**2 * π * (bl - rel  + ncl/3)
  const surfaceArea = 2 * π * r * bl + π * r * Math.sqrt(ncl**2 + r**2)
  const skinThickness = 0.003  // Includes any ribs, stringers, etc as well as skin
  const skinMaterialDensity = 8000 // kg/m3
  const rocketEngineMass = 3177 // kg (based on RS-25)
  const avionicsEtcMass = 1000 // kg

  // Hack
  const dryMass = 0 //skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass
  // Allocate the volume between the payload and the propellant
  const propellantDensity = 360 // kg/m3
  const payloadDensity = 360 // kg/m3
  const propellantMass = interiorVolume * propellantDensity
  const payloadMass = 0 // (interiorVolume - propellantMass / propellantDensity) * payloadDensity
  console.log('dryMass', dryMass)
  console.log('payloadMass', payloadMass)
  console.log('propellantMass', payloadMass)
  console.log('totalMass', payloadMass + dryMass)

  guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass    // kg
  guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass   // kg
  guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass   // kg
  // Parameters that are going to effect the launch system's performance...
  // Launch Angle (launchVehicleRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  guidParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value = 100  // m
  guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 10  // m/s2
  guidParamWithUnits['launcherRampDesignMode'].value = 1
  guidParamWithUnits['launcherRampTurningRadius'].value = 25
  //guidParamWithUnits['launcherRampTurningRadius'].value = 10
  //guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 50       // m/s2
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 1.6
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 3
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 30     // m/s
  guidParamWithUnits['launcherMassDriverAltitude'].value = 50         // m
  guidParamWithUnits['launcherRampExitAltitude'].value = 70           // m  (Altitute of Mauna Kea summit plus ~300 meters)
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 85  // m
  //guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 65 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  //guidParamWithUnits['launchVehicleRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2487278.43074692, 2126938.161322296, -5474514.194829545)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3899107618545533, 0.33346476047592527, -0.858353570104264)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2487210.558448951, 2126516.6923537357, -5474712.455103916)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3899107618545533, 0.33346476047592527, -0.858353570104264)

  // Kilamanjaro, Africa
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(4329687.2603029255, 2244.3810607220607, 4683409.931129799)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.6788274853914157, 0.0003603690842848706, 0.734297702033168)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(4329547.928026106, 1741.0135460491783, 4683657.233782173)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.6788274853914157, 0.0003603690842848706, 0.734297702033168)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 10
  nonGUIParams['farClip'] = 40000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}


function smallRing(guidParamWithUnits, nonGUIParams) {
  // Near the washington regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['washington'] })
  
  guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = false
  guidParamWithUnits['showStars'].value = false
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = true
  guidParamWithUnits['showMovingRings'].value = true
  guidParamWithUnits['showStatorMagnets'].value = true
  guidParamWithUnits['showTransitTube'].value = true
  guidParamWithUnits['showTransitTracks'].value = false
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = false
  guidParamWithUnits['showSolarArrays'].value = false

  guidParamWithUnits['showMassDriverTube'].value = false
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['showLaunchVehicles'].value = false
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['transitSystemNumZones'].value = 64
  guidParamWithUnits['animateMovingRingSegments'].value = true
  guidParamWithUnits['orbitControlsRotateSpeed'].value = -.5

  guidParamWithUnits['stationaryRingTubeRadius'].value = 0.25
  guidParamWithUnits['numVirtualStationaryRingSegments'].value = 2048
  guidParamWithUnits['numVirtualMovingRingSegments'].value = 2048
  guidParamWithUnits['numVirtualStatorMagnetSegments'].value = 2048
  guidParamWithUnits['numVirtualRingTerminuses'].value = 18
  guidParamWithUnits['numVirtualHabitats'].value = 171
  guidParamWithUnits['numTethers'].value = 32
  guidParamWithUnits['numForkLevels'].value = 3
  guidParamWithUnits['movingRingsSpeedForRendering'].value = 10


  guidParamWithUnits['equivalentLatitude'].value = 89.997
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 46.05
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 239.96
  guidParamWithUnits['ringFinalAltitude'].value = 1225
  guidParamWithUnits['numMainRings'].value = 1

 
  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3954814.892863949, 4671082.911289911, -2284901.3465206292)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-4275669.140229426, 5008235.366238964, -2463162.4610441993)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)

  // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3826971.694589688, 4594210.570761112, -2220499.5290678455)
  // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6019616798311834, 0.7196019598240632, -0.34614325853927475)
  // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3835202.1426253137, 4593861.719903532, -2224488.484862578)
  // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6019616798311834, 0.7196019598240632, -0.34614325853927475)

  nonGUIParams['cameraAtRingHeight'] = true // placed against the ring on the sphere; lowered with it
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3832974.594616706, 4592541.861591282, -2216451.2693740227)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6008432580565791, 0.719910280322552, -0.3474428982348893)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3832975.279103812, 4592541.9190021865, -2216450.773449553)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6008432580565791, 0.719910280322552, -0.3474428982348893)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3832974.091539497, 4592541.956755445, -2216451.121252548)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6008432580565791, 0.719910280322552, -0.3474428982348893)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3832973.8206065563, 4592542.127120851, -2216451.905682695)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6008432580565791, 0.719910280322552, -0.3474428982348893)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = .1
  nonGUIParams['farClip'] = 1000000
  
  nonGUIParams['enableLaunchSystem'] = false
  
}

function movingRingsOrbit(guidParamWithUnits, nonGUIParams) {
  // Near the washington regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['washington'] })
  
  guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = false
  guidParamWithUnits['showStars'].value = false
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = true
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = true
  guidParamWithUnits['showTransitSystem'].value = true
  guidParamWithUnits['showStationaryRings'].value = true
  guidParamWithUnits['showMovingRings'].value = true
  guidParamWithUnits['showStatorMagnets'].value = true
  guidParamWithUnits['showTransitTube'].value = true
  guidParamWithUnits['showTransitTracks'].value = true
  guidParamWithUnits['showTransitVehicles'].value = true
  guidParamWithUnits['showRingTerminuses'].value = true
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = true
  guidParamWithUnits['showElevatorCars'].value = true
  guidParamWithUnits['showHabitats'].value = true
  guidParamWithUnits['showSolarArrays'].value = false

  guidParamWithUnits['showMassDriverTube'].value = false
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['showLaunchVehicles'].value = false
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['animateMovingRingSegments'].value = true
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .5

  guidParamWithUnits['stationaryRingTubeRadius'].value = 0.25
  // guidParamWithUnits['numVirtualStationaryRingSegments'].value = 50000
  // guidParamWithUnits['numVirtualMovingRingSegments'].value = 500000
  // guidParamWithUnits['numVirtualStatorMagnetSegments'].value = 500000
  guidParamWithUnits['numForkLevels'].value = 8
  guidParamWithUnits['movingRingsSpeedForRendering'].value = 100
  //guidParamWithUnits['transitTubeTubeRadius'].value = 5000

  nonGUIParams['cameraAtRingHeight'] = true // placed against the ring on the sphere; lowered with it
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3586160.308932927, 4822570.089538445, -2229721.126416423)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.5594546432906146, 0.7523392721138287, -0.34784496796102365)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3586158.264192416, 4822573.6952032205, -2229721.092930216)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.5594546432906146, 0.7523392721138287, -0.34784496796102365)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 10000000
  
}



function christmasIslandLauncher(guidParamWithUnits, nonGUIParams) {
  // Near the christmas_island regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['christmas_island'] })

  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.6815

  // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  // guidParamWithUnits['numTethers'].value = 1300
  // guidParamWithUnits['numForkLevels'].value = 10
  
  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  //guidParamWithUnits['earthTextureOpacity'].value = 0.25
  guidParamWithUnits['showEarthsAtmosphere'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showEarthAxis'].value = false
  guidParamWithUnits['showEarthEquator'].value = false
  guidParamWithUnits['showMainRingCurve'].value = false
  guidParamWithUnits['showGravityForceArrows'].value = false
  guidParamWithUnits['showGyroscopicForceArrows'].value = false
  guidParamWithUnits['showTethers'].value = false
  guidParamWithUnits['showTransitSystem'].value = false
  guidParamWithUnits['showStationaryRings'].value = false
  guidParamWithUnits['showMovingRings'].value = false
  guidParamWithUnits['showTransitTube'].value = false
  guidParamWithUnits['showTransitVehicles'].value = false
  guidParamWithUnits['showRingTerminuses'].value = false
  guidParamWithUnits['showGroundTerminuses'].value = false
  guidParamWithUnits['showElevatorCables'].value = false
  guidParamWithUnits['showElevatorCars'].value = false
  guidParamWithUnits['showHabitats'].value = true
  guidParamWithUnits['showSolarArrays'].value = false
  guidParamWithUnits['showLaunchTrajectory'].value = false
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['launcherMarkerRadius'].value = 500

  guidParamWithUnits['showMassDriverTube'].value = true
  guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  guidParamWithUnits['showMassDriverRail'].value = false
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = false
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['numVirtualRingTerminuses'].value = 10000
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 300
  guidParamWithUnits['launchSledCameraRange'].value = 10000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 6
  guidParamWithUnits['logZoomRate'].value = -3

  guidParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value = 0.375 * .25/5
  guidParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value = 0.3 * .25/5
  guidParamWithUnits['launcherMassDriverScrewThreadRadius'].value = .5 * .25/5
  guidParamWithUnits['launcherMassDriverScrewThreadThickness'].value = .05 * .25/5
  guidParamWithUnits['launcherMassDriverScrewRoughLength'].value = .25 //* .25/5

  guidParamWithUnits['launchVehicleScaleFactor'].value = 200
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 100
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['numVirtualLaunchSleds'].value = 1
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 40
  guidParamWithUnits['launchVehicleRadius'].value = 1.5
  guidParamWithUnits['launchVehicleBodyLength'].value = 10

  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = false
  guidParamWithUnits['launcherCoastTime'].value = 93*60 / 2
  guidParamWithUnits['launchVehicleEmptyMass'].value = 1000
  guidParamWithUnits['launchVehiclePayloadMass'].value = 100

  // Estimte the launchVehicle's volume and dry mass from its mass diameter and length
  const r = guidParamWithUnits['launchVehicleRadius'].value
  const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value
  const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  const π = Math.PI
  const interiorVolume = r**2 * π * (bl - rel  + ncl/3)
  const surfaceArea = 2 * π * r * bl + π * r * Math.sqrt(ncl**2 + r**2)
  const skinThickness = 0.003  // Includes any ribs, stringers, etc as well as skin
  const skinMaterialDensity = 8000 // kg/m3
  const rocketEngineMass = 3177 // kg (based on RS-25)
  const avionicsEtcMass = 1000 // kg

  // Hack
  const dryMass = 0 //skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass
  // Allocate the volume between the payload and the propellant
  const propellantDensity = 360 // kg/m3
  const payloadDensity = 360 // kg/m3
  const propellantMass = interiorVolume * propellantDensity
  const payloadMass = 0 // (interiorVolume - propellantMass / propellantDensity) * payloadDensity
  console.log('dryMass', dryMass)
  console.log('payloadMass', payloadMass)
  console.log('propellantMass', payloadMass)
  console.log('totalMass', payloadMass + dryMass)

  guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass    // kg
  guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass   // kg
  guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass   // kg
  // Parameters that are going to effect the launch system's performance...
  // Launch Angle (launchVehicleRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  guidParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value = 50  // m/s2
  guidParamWithUnits['launcherRampDesignMode'].value = 0
  //guidParamWithUnits['launcherRampTurningRadius'].value = 250000
  guidParamWithUnits['launcherRampTurningRadius'].value = 381000
  guidParamWithUnits['launcherRampTurningRadius'].value = 49096
  //guidParamWithUnits['launchVehicleRampUpwardAcceleration'].value = 50       // m/s2
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 5500     // m/s
  guidParamWithUnits['launcherMassDriverAltitude'].value = 100         // m
  guidParamWithUnits['launcherRampExitAltitude'].value = 4500           // m  (Altitute of Mauna Kea summit plus ~300 meters)
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 5000  // m
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  //guidParamWithUnits['launchVehicleRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(6039536.488690861, -1159413.4880529183, -1690491.6664801068)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.946942914984838, -0.18178520654778604, -0.2650533049037438)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(6130406.766382722, -1186149.4229390235, -1730293.0171118996)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.946942914984838, -0.18178520654778604, -0.2650533049037438)

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 10
  nonGUIParams['farClip'] = 40000000

  // Improvements...
  // Add watermark
  // Update bounding sphere on the mass driver tube?
  // Put the moon in the background near the end of the shot
  // Put Mars in the background at the end of the shot
  // Reduce the rate at which the camera orbits the launch vehicle
  // Add the sled to the shot

}

function flightPaths(guidParamWithUnits, nonGUIParams) {
  // Near the new_zealand regional bake: load its area first (see planetSetup.js).
  planetSetup(nonGUIParams, { near: ['new_zealand'] })
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(402701.22087436507, -4015908.319093469, -4952967.081153212)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06409308160535271, -0.6302146235738024, -0.7737710288735681)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(448508.6471684609, -4007299.454096686, -4996083.6711664805)
  nonGUIParams['cameraUp'] = new THREE.Vector3(0.06409308160535271, -0.6302146235738024, -0.7737710288735681)

  nonGUIParams['overrideClipPlanes'] = false
  nonGUIParams['nearClip'] = 0.1
  nonGUIParams['farClip'] = 600000000

  //guidParamWithUnits['tetherMinOpacity'].value = 0.3
  
}



