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
    guidParamWithUnits['launchSledCameraRange'].value = 1000
    guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
    guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
    guidParamWithUnits['launcherMassDriverTubeRadius'].value = 5
    guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
    guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
    guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 31700
    guidParamWithUnits['launchVehicleScaleFactor'].value = 1
    guidParamWithUnits['launchSledScaleFactor'].value = 1
    guidParamWithUnits['numVirtualMassDriverTubes'].value = 64
    

    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1085414.851595548, -3902939.3531232267, -4926886.232148159)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0.17016930349931836, -0.6118889678426827, -0.7724210633967548)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(1085443.428076657, -3902946.7717559896, -4926881.138724203)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0.17016930349931836, -0.6118889678426827, -0.7724210633967548)

    nonGUIParams['getCapturePresetRegions'] = (i, j) => {return ((i!=23) || (j!=8)) && ((i!=0) || (j!=8))} // New Zealand North Island and ocean to the east
    nonGUIParams['nearClip'] = 0.01
    nonGUIParams['farClip'] = 1000000
    // Adjust near clipping plane
    // Tube bouncing - might need more tube segments...
    // Shorten the launcher
    // Adjust lighting - too bright
    // Add struts to grapplers

  }
}