import * as THREE from 'three'

export function grapplerEngineeringPresets(guidParamWithUnits, guidParam, gui, nonGUIParams) {
  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.6815

  guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showEarthsSurface'].value = true
  //guidParamWithUnits['earthTextureOpacity'].value = 0.25
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
  guidParamWithUnits['showMassDriverBrackets'].value = false
  guidParamWithUnits['showLaunchSleds'].value = true
  guidParamWithUnits['showLaunchVehicles'].value = true
  guidParamWithUnits['showLaunchVehiclePointLight'].value = false

  guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  guidParamWithUnits['massDriverCameraRange'].value = 1000
  guidParamWithUnits['launchSledCameraRange'].value = 1000
  guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  guidParamWithUnits['orbitControlsRotateSpeed'].value = .2
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  guidParamWithUnits['logZoomRate'].value = -4

  // guidParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value = 0.375 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value = 0.3 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewThreadRadius'].value = .5 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewThreadThickness'].value = .05 * .25/5
  // guidParamWithUnits['launcherMassDriverScrewModelRoughLength'].value = .25 //* .25/5

  //guidParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value = 5

  guidParamWithUnits['launchVehicleScaleFactor'].value = 1.6
  guidParamWithUnits['launchSledScaleFactor'].value = 1
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 4.0
  guidParamWithUnits['numVirtualLaunchVehicles'].value = 1
  guidParamWithUnits['numVirtualLaunchSleds'].value = 1
  guidParamWithUnits['launcherFeederRailLength'].value = 0
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 150
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 150
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 4

  guidParamWithUnits['adaptiveNutNumGrapplers'].value = 64
  guidParamWithUnits['adaptiveNutGrapplerMagnetThickness'].value = 0.06  // m
  guidParamWithUnits['adaptiveNutShaftToGrapplerPad'].value = 0.02
  guidParamWithUnits['adaptiveNutGrapplerPadLiftAwayDistance'].value = 0.01
  guidParamWithUnits['adaptiveNutGrapplerPadLiftAwayPortion'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerClearanceFactor'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerPadTwistPortion'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerBallJointClearance'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerBallJointRadius'].value = 0.04
  guidParamWithUnits['adaptiveNutGrapplerRangeFactor'].value = .01
  guidParamWithUnits['adaptiveNutGrapplerMaxRangeOfMotion'].value = 0.125
  guidParamWithUnits['adaptiveNutGrapplerTopDeadCenterRotation'].value = 0.5



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
  // Launch Angle (launcherRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 50  // m/s2
  guidParamWithUnits['launcherRampUpwardAcceleration'].value = 70
  guidParamWithUnits['launcherRampDesignMode'].value = 0
  //guidParamWithUnits['launcherRampTurningRadius'].value = 250000
  guidParamWithUnits['launcherRampTurningRadius'].value = 381000
  guidParamWithUnits['launcherRampTurningRadius'].value = 49096
  //guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 5500     // m/s
  guidParamWithUnits['launcherMassDriverAltitude'].value = 100         // m
  guidParamWithUnits['launcherRampExitAltitude'].value = 4500           // m  (Altitute of Mauna Kea summit (4207) plus ~300 meters)
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 15000  // m
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  //guidParamWithUnits['launchVehicleRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2150736.5224817945, 2118839.283473587, -5618388.35803223)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.33720117313376846, 0.33220019495681974, -0.8808736568361357)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2150719.7539519947, 2118839.8358160397, -5618399.697956475)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.33720117313376846, 0.33220019495681974, -0.8808736568361357)

  // To see tube side on...
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2152520.5214642677, 2118897.819865572, -5617686.007873287)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3374807371345877, 0.3322092361166716, -0.880763177875797)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2152518.030219181, 2118889.906518018, -5617699.491232116)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3374807371345877, 0.3322092361166716, -0.880763177875797)

  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    true
    //((i==1) && (j==4)) // Hawaii??
  )} 

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