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
    guidParamWithUnits['showLaunchTrajectory'].value = false
    guidParamWithUnits['showMassDriverTube'].value = true
    guidParamWithUnits['showMassDriverScrews'].value = true
    guidParamWithUnits['showMassDriverRail'].value = true
    guidParamWithUnits['showMassDriverBrackets'].value = true
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['massDriverCameraRange'].value = 3000
    guidParamWithUnits['launchSledCameraRange'].value = 10000
    guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
    guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
    guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
    guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 3
    guidParamWithUnits['orbitControlsRotateSpeed'].value = -.2
    guidParamWithUnits['logZoomRate'].value = -3

    guidParamWithUnits['launchVehicleScaleFactor'].value = 1
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 600
    guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
    guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
    guidParamWithUnits['numVirtualRingTerminuses'].value = 10000

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1085383.8669969547, -3902699.9169670017, -4926661.290153145)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1085051.7452291835, -3902846.696186079, -4926668.713904155)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-63636.3777848408, -4115849.7575696534, -4913396.378631104)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-64172.35213304402, -4115800.0825407896, -4913293.827853268)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(210757.18355882427, -4012137.7432638933, -4932894.541903759)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(480331.6551612802, -4195149.259355443, -4883519.833408484)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=23) || (j!=8)) &&
      ((i!=0) || (j!=8))
    )} // New Zealand North Island and ocean to the east and west
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .3
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .3
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = false
    guidParamWithUnits['showLaunchVehicles'].value = false
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 1
    guidParamWithUnits['showMarkers'].value = false

    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .13
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = false
    guidParamWithUnits['showLaunchVehicles'].value = false
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 1
    guidParamWithUnits['showMarkers'].value = false

    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .13
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = false
    guidParamWithUnits['showLaunchVehicles'].value = false
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 1
    guidParamWithUnits['showMarkers'].value = false

    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .13
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .3
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = true
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    guidParamWithUnits['tetherVisibility'].value = .3
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = true
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    guidParamWithUnits['tetherVisibility'].value = .3
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    guidParamWithUnits['tetherVisibility'].value = .3
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
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = false
    guidParamWithUnits['showLaunchVehicles'].value = false
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 1
    guidParamWithUnits['showMarkers'].value = false

    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .13
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

    nonGUIParams['nearClip'] = 10
    nonGUIParams['farClip'] = 10000000

    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Shorten the launcher
    // Adjust lighting - too bright

  }

  function twoStageMassDriver() {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = false
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
    guidParamWithUnits['showLaunchTrajectory'].value = false
    guidParamWithUnits['showMarkers'].value = false
    guidParamWithUnits['showMassDriverTube'].value = true
    guidParamWithUnits['showMassDriverScrews'].value = true
    guidParamWithUnits['showMassDriverRail'].value = true
    guidParamWithUnits['showMassDriverBrackets'].value = true
    guidParamWithUnits['showEvacuatedTube'].value = false
    guidParamWithUnits['showLaunchSleds'].value = true
    guidParamWithUnits['showLaunchVehicles'].value = true
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['massDriverCameraRange'].value = 300
    guidParamWithUnits['launchSledCameraRange'].value = 10000
    guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
    guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
    guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
    guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 2
    guidParamWithUnits['logZoomRate'].value = -3

    guidParamWithUnits['launchVehicleScaleFactor'].value = 1
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 6
    guidParamWithUnits['numVirtualLaunchVehicles'].value = 6
    guidParamWithUnits['numVirtualLaunchSleds'].value = 6
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
    guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2
    guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 400
    guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
    guidParamWithUnits['numVirtualRingTerminuses'].value = 10000

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1085383.8669969547, -3902699.9169670017, -4926661.290153145)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1085051.7452291835, -3902846.696186079, -4926668.713904155)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.17017387534008444, -0.6118879246181094, -0.7724208825881654)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-63636.3777848408, -4115849.7575696534, -4913396.378631104)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-64172.35213304402, -4115800.0825407896, -4913293.827853268)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)

    // nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(210757.18355882427, -4012137.7432638933, -4932894.541903759)
    // nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)
    // nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(480331.6551612802, -4195149.259355443, -4883519.833408484)
    // nonGUIParams['cameraUp'] = new THREE.Vector3(-0.009956572807877009, -0.6421261414357942, -0.7665343339620867)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return (
      ((i!=23) || (j!=8)) &&
      ((i!=0) || (j!=8))
    )} // New Zealand North Island and ocean to the east and west
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


}