import * as THREE from 'three'
import * as tram from './tram.js'

export function applyCapturePreset(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    v.value = guidParam[k]
  })

  // defaults
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

  switch (0) {
    case 0:
      defaultBehaviour()
      break
    case 1:
      launchVehicleOrbit()
      break
    case 2:
      launchVehicleDollyShot()
      break
    case 3:
      launchVehiclePanShot()
      break
    case 4:
      transitVehicleDollyShotWashington()
      break
    case 5:
      transitVehicleDollyShotAustralia()
      break
    case 6:
      multipleRings()
      break
    case 7:
      launchVehiclePanShotInSpace()
      break
    case 8:
      launchVehicleFountain()
      break
    case 9:
      launchSystemOverview()
      break
    case 10:
      solarPanelsCalifornia()
      break
    case 11:
      twoStageMassDriver()
      break
    case 12:
      bigIslandLauncher()
      break
    case 13:
      equatorialLauncher()
      break
    case 14:
      smallRing()
      break
    case 15:
      movingRingsOrbit()
      break
    case 16:
      demonstratorLauncher()
      break
    case 17:
      starship()
      break
    case 18:
      christmasIslandLauncher()
      break
    case 19:
      flightPaths()
      break
  }

  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    guidParam[k] = v.value
  })
  gui.children.forEach(folder => {
    if (folder.controllers) {
      folder.controllers.forEach(control => {
        control.updateDisplay()
      })
    } 
  })


  function defaultBehaviour() {
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0, 1, 0)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(2.92909490611565e-9, 1.464547453057825e-9, -23917875)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0, 1, 0)
    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=3) || (j!=2)) &&
      ((i!=1) || (j!=4)) &&
      ((i!=18) || (j!=3)) &&
      ((i!=18) || (j!=4)) &&
      ((i!=23) || (j!=8))  // New Zealand North Island
    )}
    nonGUIParams['overrideClipPlanes'] = false
    nonGUIParams['nearClip'] = 0.1
    nonGUIParams['farClip'] = 600000000
  }

  function launchVehicleOrbit() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = true
    guidParamWithUnits['showStars'].value = true
    guidParamWithUnits['showEarthAxis'].value = true
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 3
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
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2165961.395604829, 2151545.706611093, -5567865.682549198)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3665540565881692, 0.3276645652229013, -0.8707893294569269)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-1894419.9636432864, 1725570.1470296388, -6162027.437464318)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3665540565881692, 0.3276645652229013, -0.8707893294569269)
    

    // Hawaii
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2307593.902230268, 2191199.386457382, -5527259.744988217)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.36181387751791044, 0.3435640671709055, -0.866633976823226)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(780917.2197601651, 1247175.8999634252, -8913282.292151898)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.36181387751791044, 0.3435640671709055, -0.866633976823226)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      // ((i!=1) || (j!=4))
      ((i!=23) || (j!=8)) &&
      ((i!=0) || (j!=8)) &&
      ((i!=1) || (j!=4))
    )} // New Zealand North Island and ocean to the east and west
    //nonGUIParams['getCapturePresetRegions'] = (i, j) => {return true}
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

  function launchVehicleDollyShot() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    const allFeaturesOn = true
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = allFeaturesOn
    guidParamWithUnits['showStars'].value = allFeaturesOn
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
    guidParamWithUnits['showEarthEquator'].value = false
    guidParamWithUnits['showMainRingCurve'].value = false
    guidParamWithUnits['showGravityForceArrows'].value = false
    guidParamWithUnits['showGyroscopicForceArrows'].value = false
    guidParamWithUnits['showTethers'].value = false
    guidParamWithUnits['showTransitSystem'].value = allFeaturesOn
    guidParamWithUnits['showStationaryRings'].value = allFeaturesOn
    guidParamWithUnits['showMovingRings'].value = false
    guidParamWithUnits['showTransitTube'].value = allFeaturesOn
    guidParamWithUnits['showTransitTracks'].value = allFeaturesOn
    guidParamWithUnits['showTransitVehicles'].value = allFeaturesOn
    guidParamWithUnits['showRingTerminuses'].value = allFeaturesOn
    guidParamWithUnits['showGroundTerminuses'].value = false
    guidParamWithUnits['showElevatorCables'].value = allFeaturesOn
    guidParamWithUnits['showElevatorCars'].value = allFeaturesOn
    guidParamWithUnits['showHabitats'].value = allFeaturesOn
    guidParamWithUnits['showSolarArrays'].value = false
    guidParamWithUnits['showLaunchTrajectory'].value = false
    guidParamWithUnits['showMassDriverTube'].value = true
    guidParamWithUnits['showMassDriverScrews'].value = true
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 4
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
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(3648776.1588658285, -2166834.4005995863, -4762523.109043196)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.5720072159420826, -0.33968735795396227, -0.7466058155120708)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(3648780.671172157, -2166835.2884166394, -4762522.258575801)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.5720072159420826, -0.33968735795396227, -0.7466058155120708)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=21) || (j!=7)) && 
      ((i!=22) || (j!=7)) && 
      ((i!=23) || (j!=8)) && 
      ((i!=0) || (j!=8)))} // New Zealand North Island and ocean to the east
    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 1
    nonGUIParams['farClip'] = 10000000
    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Shorten the launcher
    // Adjust lighting - too bright
    // Add struts to grapplers

  }

  function launchVehiclePanShot() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    const allFeaturesOn = true
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = allFeaturesOn
    guidParamWithUnits['showStars'].value = allFeaturesOn
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = true
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 4
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
    
    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=21) || (j!=7)) && 
      ((i!=22) || (j!=7)) && 
      ((i!=23) || (j!=8)) && 
      ((i!=0) || (j!=8)))} // New Zealand North Island and ocean to the east
    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 1
    nonGUIParams['farClip'] = 10000000
    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Shorten the launcher
    // Adjust lighting - too bright
    // Add struts to grapplers

  }


  function transitVehicleDollyShotWashington() {

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
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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

    // Seattle
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3727537.649897123, 4708634.095946986, -2241060.868326444)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.5815226294846256, 0.73457715738515, -0.34961097128843)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3727658.7268805667, 4708594.241455055, -2241059.6032852777)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.5815226294846256, 0.73457715738515, -0.34961097128843)

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3726688.23898569, 4709297.49590366, -2240934.5710918065)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.5815226294846256, 0.73457715738515, -0.34961097128843)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3726596.822598604, 4709456.615198362, -2240983.043088419)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.5815226294846256, 0.73457715738515, -0.34961097128843)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-4531490.660642649, 3763264.860769378, -2456848.746220458)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.7197762905214095, 0.5891548388307251, -0.36717661620204234)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-5395965.235633378, 3299100.3502868814, -3087026.64082868)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.7197762905214095, 0.5891548388307251, -0.36717661620204234)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-4126729.417850525, 4335974.85896652, -2292453.2476548003)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-4126308.398898858, 4336571.93031984, -2292344.0126398113)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=3) || (j!=4)) &&  // Mexico
      ((i!=4) || (j!=4)) &&  // Mexico
      ((i!=3) || (j!=3)) &&  // California
      ((i!=4) || (j!=3)))}  // California

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 10
    nonGUIParams['farClip'] = 100000000

    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Shorten the launcher
    // Adjust lighting - too bright

  }

  function transitVehicleDollyShotAustralia() {

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
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=21) || (j!=7)) && 
      ((i!=22) || (j!=7)) && 
      ((i!=23) || (j!=8)) && 
      ((i!=0) || (j!=8)))} // New Zealand North Island and ocean to the east
  
    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 1
    nonGUIParams['farClip'] = 10000000

    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Adjust lighting - too bright

  }

  function multipleRings() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    const allFeaturesOn = false
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = true
    guidParamWithUnits['showMoon'].value = true
    guidParamWithUnits['showStars'].value = true
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['orbitControlsRotateSpeed'].value = 1
    guidParamWithUnits['logZoomRate'].value = -2.5
    guidParamWithUnits['transitTubeOpacity'].value = 0.05
    guidParamWithUnits['transitVehicleCruisingSpeed'].value = 4000
    guidParamWithUnits['transitVehicleStopDuration'].value = 42
    guidParamWithUnits['transitVehicleRandomizeStartPositions'].value = false

    guidParamWithUnits['numTethers'].value = 2000
    guidParamWithUnits['numForkLevels'].value = 2
    guidParamWithUnits['numVirtualTransitVehicles'].value = 4000 * 8
    guidParamWithUnits['numVirtualGroundTerminuses'].value = 4000
    guidParamWithUnits['numVirtualRingTerminuses'].value = 4000
    guidParamWithUnits['numElevatorCables'].value = 4000
    guidParamWithUnits['numVirtualHabitats'].value = 0
    guidParamWithUnits['numForkLevels'].value = 2


    // From space, above North America's West Coast
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0, 1, 0)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-21029602, 4606144, -3608743)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0, 1, 0)

    // nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    //   ((i!=3) || (j!=2)) &&  // Seattle??
    //   ((i!=4) || (j!=2)) &&  // Seattle??
    //   ((i!=1) || (j!=4)))} // Hawaii??

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=3) || (j!=2)) &&  // Seattle??
      ((i!=4) || (j!=2)) &&  // Seattle??
      ((i!=1) || (j!=4)))} // Hawaii??
      
    nonGUIParams['getRingSpecs'] = () => {
      const tetheredRingSpecs = []
      const coordinates = tram.getDodecahedronFaceCoordinates();
      coordinates.forEach(coord => {
        const lat = coord.lat*180/Math.PI + Math.random()*10
        const lon = coord.lon*180/Math.PI + Math.random()*10
        tetheredRingSpecs.push(
          {locationSpec: {buildLat: -19.2, buildLon:213.7, finalLat: lat, finalLon: lon}}
        )
      })
      return tetheredRingSpecs
    }

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 10000
    nonGUIParams['farClip'] = 100000000

  }

  function launchVehiclePanShotInSpace() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    const allFeaturesOn = false
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = allFeaturesOn
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = true
    guidParamWithUnits['showStars'].value = true
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = true
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 4
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

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=21) || (j!=7)) && 
      ((i!=22) || (j!=7)) && 
      ((i!=23) || (j!=8)) && 
      ((i!=0) || (j!=8)))} // New Zealand North Island and ocean to the east
    
    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 10
    nonGUIParams['farClip'] = 10000000000
    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Shorten the launcher
    // Adjust lighting - too bright
    // Add struts to grapplers

  }

  function launchVehicleFountain() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = false
    guidParamWithUnits['showStars'].value = false
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 500
    guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
    guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
    //guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
    guidParamWithUnits['launcherMassDriverExitVelocity'].value = 1000
    guidParamWithUnits['launchVehicleScaleFactor'].value = 100
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['numVirtualLaunchVehicles'].value = 20

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(384587.067768322, -4036766.0558425565, -4923631.703887237)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06029407718038538, -0.6328686129320207, -0.7719079887023231)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(393066.7034365224, -4084241.1876733834, -4890071.8842349565)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.06029407718038538, -0.6328686129320207, -0.7719079887023231)
        
    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=23) || (j!=8)) &&
      ((i!=0) || (j!=8))
    )} // New Zealand North Island and ocean to the east and west

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

  function LaunchVehicleAndTubeBugs() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = false
    guidParamWithUnits['showStars'].value = false
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 500
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
        
    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=23) || (j!=8)) &&
      ((i!=0) || (j!=8))
    )} // New Zealand North Island and ocean to the east and west


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

  function launchSystemOverview() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = true
    guidParamWithUnits['showStars'].value = true
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 1000
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

    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=23) || (j!=8)) &&
      ((i!=0) || (j!=8))
    )} // New Zealand North Island and ocean to the east and west


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

  function solarPanelsCalifornia() {

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
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-4126649.50347885, 4336131.069876342, -2292694.6838267166)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-4127217.359602618, 4335764.529077124, -2292992.795739126)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=3) || (j!=4)) &&  // Mexico
      ((i!=4) || (j!=4)) &&  // Mexico
      ((i!=3) || (j!=3)) &&  // California
      ((i!=4) || (j!=3)))}  // California

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 10
    nonGUIParams['farClip'] = 10000000

    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Shorten the launcher
    // Adjust lighting - too bright

  }

  function twoStageMassDriver() {

    // Uses Mt Ruapehu launch location

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = true
    guidParamWithUnits['showEarthsSurface'].value = true
    //guidParamWithUnits['earthTextureOpacity'].value = 0.25
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = true
    guidParamWithUnits['showStars'].value = true
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 3
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
    // Launch Angle (launcherRampUpwardAcceleration)
    // Propellant Mass (launchVehiclePropellantMass)
    // Altitude of Ramp Exit
    // Altitude of Evauated Tube Exit
    // Desired Orbital Altitude

    // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
    // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
    // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.


    switch (50) {
      case 0.5:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 70       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 500     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s
        break
      case 1:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 140       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 1000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s
        break
        // Mass Fraction = 0.013
      case 2:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 135       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 2000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        break
        // Mass Fraction = 0.075
      case 3:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 120       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 3000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        break
        // Mass Fraction = 0.146
      case 4:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 110       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 4000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        break
        // Mass Fraction = 0.232
      case 5:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 80       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 5000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        // Mass Fraction = 0.339
        break
      case 6:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 60       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 6000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        // Mass Fraction = 0.473
        break
      case 7:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 24       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 7000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2700           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        // Mass Fraction = 0.635
        break
      case 8:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 3300     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = 0         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 2900           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 3300  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        // Mass Fraction =
        break
      case 50:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = -100         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 4500           // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        break
      case 51:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
        guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2       // m/s
        guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 40      // m/s
        guidParamWithUnits['launcherMassDriverExitVelocity'].value = 100     // m/s
        guidParamWithUnits['launcherMassDriverAltitude'].value = 0         // m
        guidParamWithUnits['launcherRampExitAltitude'].value = 100         // m
        guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 110  // m
        guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
        break
      case 52:
        guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
        guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
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

    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=23) || (j!=8)) &&
      ((i!=0) || (j!=8))
    )} // New Zealand North Island and ocean to the east and west

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

  function bigIslandLauncher() {

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
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['launcherMassDriverScrewModelRoughLength'].value = .25 //* .25/5

    guidParamWithUnits['launchVehicleScaleFactor'].value = 200
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 100
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
    // Launch Angle (launcherRampUpwardAcceleration)
    // Propellant Mass (launchVehiclePropellantMass)
    // Altitude of Ramp Exit
    // Altitude of Evauated Tube Exit
    // Desired Orbital Altitude

    // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
    // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
    // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

    guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
    guidParamWithUnits['launcherRampDesignMode'].value = 0
    //guidParamWithUnits['launcherRampTurningRadius'].value = 250000
    guidParamWithUnits['launcherRampTurningRadius'].value = 381000
    guidParamWithUnits['launcherRampTurningRadius'].value = 49096
    //guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
    guidParamWithUnits['launcherMassDriverExitVelocity'].value = 5500     // m/s
    guidParamWithUnits['launcherMassDriverAltitude'].value = 100         // m
    guidParamWithUnits['launcherRampExitAltitude'].value = 4500           // m  (Altitute of Mauna Kea summit plus ~300 meters)
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 5000  // m
    guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
    guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
    guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
    //guidParamWithUnits['launchVehicleRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2476152.695003177, 2163687.090317844, -5516496.147743987)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.39104480167972105, 0.33343715687290343, -0.8578482531868805)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2353919.4598949375, 1882125.1810429322, -5788929.236748725)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.39104480167972105, 0.33343715687290343, -0.8578482531868805)

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2447303.054002276, 2131697.443510971, -5513884.545953701)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.39104480167972105, 0.33343715687290343, -0.8578482531868805)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2609848.661827688, 2033982.0935899257, -5527446.623460379)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.39104480167972105, 0.33343715687290343, -0.8578482531868805)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2112519.5324192257, 2119219.738697768, -5632499.571435554)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.33122058591904685, 0.3322692062977853, -0.8831138646911185)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2112384.9163022134, 2119124.770983503, -5632607.237614656)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.33122058591904685, 0.3322692062977853, -0.8831138646911185)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=1) || (j!=4)) // Hawaii??
    )} 

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

  function equatorialLauncher() {

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
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = true
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 3
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
    // Launch Angle (launcherRampUpwardAcceleration)
    // Propellant Mass (launchVehiclePropellantMass)
    // Altitude of Ramp Exit
    // Altitude of Evauated Tube Exit
    // Desired Orbital Altitude

    // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
    // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
    // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

    guidParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value = 100  // m
    guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 10  // m/s2
    guidParamWithUnits['launcherRampDesignMode'].value = 1
    guidParamWithUnits['launcherRampTurningRadius'].value = 25
    //guidParamWithUnits['launcherRampTurningRadius'].value = 10
    //guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
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

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
//      ((i!=1) || (j!=4)) // Hawaii??
      ((i!=14) || (j!=5)) // Hawaii??
    )} 

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


  function smallRing() {
    
    guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = true
    guidParamWithUnits['showMoon'].value = false
    guidParamWithUnits['showStars'].value = false
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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

    guidParamWithUnits['showBackgroundPatch'].value = true
 
    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      // ((i!=3) || (j!=2)) &&  // Seattle??
      // ((i!=4) || (j!=2)) &&  // Seattle??
      // ((i!=3) || (j!=3)) &&
      ((i!=4) || (j!=3))
    )} // Hawaii??

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3954814.892863949, 4671082.911289911, -2284901.3465206292)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-4275669.140229426, 5008235.366238964, -2463162.4610441993)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6437762083188713, 0.6764789334721483, -0.3576708629047093)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3826971.694589688, 4594210.570761112, -2220499.5290678455)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.6019616798311834, 0.7196019598240632, -0.34614325853927475)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3835202.1426253137, 4593861.719903532, -2224488.484862578)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.6019616798311834, 0.7196019598240632, -0.34614325853927475)

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

  function movingRingsOrbit() {
    
    guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = true
    guidParamWithUnits['showMoon'].value = false
    guidParamWithUnits['showStars'].value = false
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      // ((i!=3) || (j!=2)) &&  // Washington State
      // ((i!=4) || (j!=2)) &&
      // ((i!=3) || (j!=3)) &&
      // ((i!=4) || (j!=3))
      true
    )}

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3586160.308932927, 4822570.089538445, -2229721.126416423)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.5594546432906146, 0.7523392721138287, -0.34784496796102365)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-3586158.264192416, 4822573.6952032205, -2229721.092930216)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.5594546432906146, 0.7523392721138287, -0.34784496796102365)

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 1
    nonGUIParams['farClip'] = 10000000
    
  }

  function demonstratorLauncher() {

    // Kilamanjaro, Africa
    guidParamWithUnits['finalLocationRingCenterLatitude'].value = 54.5
    guidParamWithUnits['finalLocationRingCenterLongitude'].value = 40
    guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.1295

    guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = false
    guidParamWithUnits['showStars'].value = false
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMarkers'].value = false
    guidParamWithUnits['launcherMarkerRadius'].value = 500

    guidParamWithUnits['showMassDriverTube'].value = true
    guidParamWithUnits['showMassDriverScrews'].value = true
    guidParamWithUnits['showMassDriverRail'].value = true
    guidParamWithUnits['showMassDriverBrackets'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    guidParamWithUnits['massDriverCameraRange'].value = 300
    guidParamWithUnits['launchSledCameraRange'].value = 10000
    guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
    guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
    guidParamWithUnits['orbitControlsRotateSpeed'].value = 1
    guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
    guidParamWithUnits['logZoomRate'].value = -3

    guidParamWithUnits['launchVehicleScaleFactor'].value = 1
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 0.45
    guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
    guidParamWithUnits['numVirtualLaunchSleds'].value = 1
    guidParamWithUnits['launchVehicleRadius'].value = 1.5
    guidParamWithUnits['launchVehicleBodyLength'].value = 10

    guidParamWithUnits['launchVehicleAdaptiveThrust'].value = true
    guidParamWithUnits['launcherCoastTime'].value = 10
    guidParamWithUnits['launchVehicleEmptyMass'].value = 1000
    guidParamWithUnits['launchVehiclePayloadMass'].value = 100

    guidParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value = 100  // m
    guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 70  // m/s2
    guidParamWithUnits['launcherRampDesignMode'].value = 1
    guidParamWithUnits['launcherRampTurningRadius'].value = 25
    //guidParamWithUnits['launcherRampTurningRadius'].value = 10
    //guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
    guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 1
    guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 8
    guidParamWithUnits['launcherMassDriverExitVelocity'].value = 16     // m/s
    guidParamWithUnits['launcherMassDriverAltitude'].value = 50         // m
    guidParamWithUnits['launcherRampExitAltitude'].value = 70           // m  (Altitute of Mauna Kea summit plus ~300 meters)
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 85  // m
    //guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
    guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 265 // kg/s  (Based on RS-25)
    guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
    guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)


    guidParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value = 0.125  // m
    guidParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value = -1.75/8  // m
    guidParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value = 0.03  // m
    guidParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value = 0.025  // m
    guidParamWithUnits['launcherMassDriverScrewThreadRadius'].value = 0.038  // m
    guidParamWithUnits['launcherMassDriverScrewThreadThickness'].value = 0.05/8  // m
    guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 4  // m
    guidParamWithUnits['launcherMassDriverScrewModelRoughLength'].value = .25  // m
    guidParamWithUnits['launcherMassDriverScrewNumBrackets'].value = 80  // m
    guidParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value = 100  // m
    guidParamWithUnits['launcherMassDriverBracketWidth'].value = 2.0/32  // m
    guidParamWithUnits['launcherMassDriverBracketHeight'].value = 0.125/32  // m
    guidParamWithUnits['launcherMassDriverScrewBracketThickness'].value = 0.002  // m
    guidParamWithUnits['launcherMassDriverRailWidth'].value = 1/8  // m
    guidParamWithUnits['launcherMassDriverRailHeight'].value = 0.25/8  // m
    guidParamWithUnits['launchRailUpwardsOffset'].value = -1.5/8  // m
    guidParamWithUnits['launchSledBodyLength'].value = .1  // m

    // Hack!!!!
    guidParamWithUnits['saveMassDriverScrewSTL'].value = false

    // Kilamanjaro, Africa
    // Side on view
    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(4329645.232337113, 2297.1925139744653, 4683477.93398771)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.678824606787916, 0.0003601659538681463, 0.7343003632708599)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(4329645.488945393, 2296.225021810688, 4683478.113763174)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(0.678824606787916, 0.0003601659538681463, 0.7343003632708599)

    // End View
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(4329644.469907974, 2297.4671285898203, 4683478.087086993)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.678824606787916, 0.0003601659538681463, 0.7343003632708599)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(4329644.363210346, 2297.480607709849, 4683478.416303728)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.678824606787916, 0.0003601659538681463, 0.7343003632708599)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
//      ((i!=1) || (j!=4)) // Hawaii??
      ((i!=14) || (j!=5)) // Hawaii??
    )} 

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = .1
    nonGUIParams['farClip'] = 400000

  }

  function starship() {

    // Uses Boca Chica launch location
    guidParamWithUnits['finalLocationRingCenterLatitude'].value = -28.5
    guidParamWithUnits['finalLocationRingCenterLongitude'].value = 266
    guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.0011

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    
    guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = true
    guidParamWithUnits['showEarthsSurface'].value = true
    //guidParamWithUnits['earthTextureOpacity'].value = 0.25
    guidParamWithUnits['showEarthsAtmosphere'].value = false
    guidParamWithUnits['showMoon'].value = true
    guidParamWithUnits['showStars'].value = true
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
    guidParamWithUnits['showEarthEquator'].value = false
    guidParamWithUnits['showMainRingCurve'].value = false
    guidParamWithUnits['showGravityForceArrows'].value = false
    guidParamWithUnits['showGyroscopicForceArrows'].value = false
    guidParamWithUnits['showTethers'].value = true
    guidParamWithUnits['showTransitSystem'].value = false
    guidParamWithUnits['showStationaryRings'].value = true
    guidParamWithUnits['showMovingRings'].value = false
    guidParamWithUnits['showTransitTube'].value = false
    guidParamWithUnits['showTransitVehicles'].value = false
    guidParamWithUnits['showRingTerminuses'].value = false
    guidParamWithUnits['showGroundTerminuses'].value = false
    guidParamWithUnits['showElevatorCables'].value = true
    guidParamWithUnits['showElevatorCars'].value = false
    guidParamWithUnits['showHabitats'].value = true
    guidParamWithUnits['showSolarArrays'].value = false
    guidParamWithUnits['showLaunchTrajectory'].value = true
    guidParamWithUnits['showMarkers'].value = false
    guidParamWithUnits['launcherMarkerRadius'].value = 500

    guidParamWithUnits['showMassDriverTube'].value = true
    guidParamWithUnits['showMassDriverScrews'].value = true
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 3
    guidParamWithUnits['numVirtualLaunchVehicles'].value = 6
    guidParamWithUnits['numVirtualLaunchSleds'].value = 6
    guidParamWithUnits['launchVehicleRadius'].value = 1.5
    guidParamWithUnits['launchVehicleBodyLength'].value = 10

    guidParamWithUnits['launchVehicleAdaptiveThrust'].value = true
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
    // Launch Angle (launcherRampUpwardAcceleration)
    // Propellant Mass (launchVehiclePropellantMass)
    // Altitude of Ramp Exit
    // Altitude of Evauated Tube Exit
    // Desired Orbital Altitude

    // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
    // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
    // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

    guidParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value = 450000  // m
    guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 10  // m/s2
    guidParamWithUnits['launcherRampDesignMode'].value = 1
    guidParamWithUnits['launcherRampTurningRadius'].value = 250
    //guidParamWithUnits['launcherRampTurningRadius'].value = 10
    //guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
    guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 1.6
    guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 3
    guidParamWithUnits['launcherMassDriverExitVelocity'].value = 3000     // m/s
    guidParamWithUnits['launcherMassDriverAltitude'].value = 50         // m
    guidParamWithUnits['launcherRampExitAltitude'].value = 70           // m  (Altitute of Mauna Kea summit plus ~300 meters)
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 8500  // m
    //guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
    // Hack!!!
    guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 80 // kg/s  (Based on RS-25)

    guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
    guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
    //guidParamWithUnits['launchVehicleRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-5688456.3101708945, 2794645.7669225773, -715246.7324399783)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.8918731941629815, 0.4381627476408296, -0.11214103670538951)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-5781180.701785349, 2739411.1838029707, -714002.3253086259)
    nonGUIParams['cameraUp'] = new THREE.Vector3(-0.8918731941629815, 0.4381627476408296, -0.11214103670538951)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=5) || (j!=4)) // Boca Chica
    )} 

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 1
    nonGUIParams['farClip'] = 40000000

    // Improvements...
    // Add watermark
    // Update bounding sphere on the mass driver tube?
    // Put the moon in the background near the end of the shot
    // Put Mars in the background at the end of the shot
    // Reduce the rate at which the camera orbits the launch vehicle
    // Add the sled to the shot

  }

  function christmasIslandLauncher() {

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
    guidParamWithUnits['showBackgroundPatch'].value = false
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
    guidParamWithUnits['showMassDriverScrews'].value = false
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
    guidParamWithUnits['launcherMassDriverScrewModelRoughLength'].value = .25 //* .25/5

    guidParamWithUnits['launchVehicleScaleFactor'].value = 200
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 100
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
    // Launch Angle (launcherRampUpwardAcceleration)
    // Propellant Mass (launchVehiclePropellantMass)
    // Altitude of Ramp Exit
    // Altitude of Evauated Tube Exit
    // Desired Orbital Altitude

    // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
    // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
    // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

    guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
    guidParamWithUnits['launcherRampDesignMode'].value = 0
    //guidParamWithUnits['launcherRampTurningRadius'].value = 250000
    guidParamWithUnits['launcherRampTurningRadius'].value = 381000
    guidParamWithUnits['launcherRampTurningRadius'].value = 49096
    //guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
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

    nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
      ((i!=19) || (j!=5)) &&
      ((i!=19) || (j!=6)) // Christmas Island
    )} 

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

  function flightPaths() {
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(402701.22087436507, -4015908.319093469, -4952967.081153212)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.06409308160535271, -0.6302146235738024, -0.7737710288735681)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(448508.6471684609, -4007299.454096686, -4996083.6711664805)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.06409308160535271, -0.6302146235738024, -0.7737710288735681)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=3) || (j!=2)) &&
      ((i!=1) || (j!=4)) &&
      ((i!=18) || (j!=3)) &&
      ((i!=18) || (j!=4)) &&
      ((i!=23) || (j!=8))  // New Zealand North Island
    )}
    nonGUIParams['overrideClipPlanes'] = false
    nonGUIParams['nearClip'] = 0.1
    nonGUIParams['farClip'] = 600000000

    //guidParamWithUnits['tetherMinOpacity'].value = 0.3
    
  }


}