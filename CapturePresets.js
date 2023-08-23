import * as THREE from 'three'

export function applyCapturePreset(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    v.value = guidParam[k]
  })

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
    guidParamWithUnits['showLaunchVehiclePointLight'].value = true
    guidParamWithUnits['pKeyAltitudeFactor'].value = 0
    //guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['tetherVisibility'].value = .3
    guidParamWithUnits['massDriverCameraRange'].value = 1000
    guidParamWithUnits['launchSledCameraRange'].value = 1000
    guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
    guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 200
    guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
    guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 3
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
    guidParamWithUnits['launchVehicleScaleFactor'].value = 100
    guidParamWithUnits['launchSledScaleFactor'].value = 100
    guidParamWithUnits['numVirtualLaunchVehicles'].value = 1

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1084955.6075665343, -3903206.4585830015, -4926632.252543484)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.170177773175294, -0.6119079118531179, -0.7724041901288828)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1045387.3238111101, -3920693.423766571, -4927516.702510944)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.170177773175294, -0.6119079118531179, -0.7724041901288828)
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
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 4
    guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
    guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
    guidParamWithUnits['launcherMassDriverAltitude'].value = 800
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
    guidParamWithUnits['launchVehicleScaleFactor'].value = 1
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['numVirtualMassDriverTubes'].value = 64
    guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
    guidParamWithUnits['launcherMassDriverExitVelocity'].value = 8000
    guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.857
    guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value =  6
    guidParamWithUnits['logZoomRate'].value = -3



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
}