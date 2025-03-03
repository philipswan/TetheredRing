import * as THREE from 'three'


  // function starship() {

  //   guidParamWithUnits['launchTrajectorySelector'].value = 1 // Use the trajectory code for a rocket on a launchpad

  //   // Uses Boca Chica launch location
  //   guidParamWithUnits['finalLocationRingCenterLatitude'].value = -28.5
  //   guidParamWithUnits['finalLocationRingCenterLongitude'].value = 266
  //   guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.0011

  //   // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
  //   // guidParamWithUnits['numTethers'].value = 1300
  //   // guidParamWithUnits['numForkLevels'].value = 10
    
  //   guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
  //   guidParamWithUnits['showXYChart'].value = true
  //   guidParamWithUnits['showEarthsSurface'].value = true
  //   //guidParamWithUnits['earthTextureOpacity'].value = 0.25
  //   guidParamWithUnits['showEarthsAtmosphere'].value = false
  //   guidParamWithUnits['showMoon'].value = true
  //   guidParamWithUnits['showStars'].value = true
  //   guidParamWithUnits['showEarthAxis'].value = false
  //   guidParamWithUnits['showBackgroundPatch'].value = false
  //   guidParamWithUnits['showEarthEquator'].value = false
  //   guidParamWithUnits['showMainRingCurve'].value = false
  //   guidParamWithUnits['showGravityForceArrows'].value = false
  //   guidParamWithUnits['showGyroscopicForceArrows'].value = false
  //   guidParamWithUnits['showTethers'].value = true
  //   guidParamWithUnits['showTransitSystem'].value = false
  //   guidParamWithUnits['showStationaryRings'].value = true
  //   guidParamWithUnits['showMovingRings'].value = false
  //   guidParamWithUnits['showTransitTube'].value = false
  //   guidParamWithUnits['showTransitVehicles'].value = false
  //   guidParamWithUnits['showRingTerminuses'].value = false
  //   guidParamWithUnits['showGroundTerminuses'].value = false
  //   guidParamWithUnits['showElevatorCables'].value = true
  //   guidParamWithUnits['showElevatorCars'].value = false
  //   guidParamWithUnits['showHabitats'].value = true
  //   guidParamWithUnits['showSolarArrays'].value = false
  //   guidParamWithUnits['showLaunchTrajectory'].value = true
  //   guidParamWithUnits['showMarkers'].value = false
  //   guidParamWithUnits['launcherMarkerRadius'].value = 500

  //   guidParamWithUnits['showMassDriverTube'].value = true
  //   guidParamWithUnits['showMassDriverAccelerationScrews'].value = true
  //   guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
  //   guidParamWithUnits['showMassDriverRail'].value = true
  //   guidParamWithUnits['showMassDriverBrackets'].value = false
  //   guidParamWithUnits['showLaunchSleds'].value = true
  //   guidParamWithUnits['showLaunchVehicles'].value = true
  //   guidParamWithUnits['numVirtualRingTerminuses'].value = 10000
  //   guidParamWithUnits['showLaunchVehiclePointLight'].value = false
  //   guidParamWithUnits['pKeyAltitudeFactor'].value = 0
  //   guidParamWithUnits['massDriverCameraRange'].value = 300
  //   guidParamWithUnits['launchSledCameraRange'].value = 10000
  //   guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
  //   guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
  //   guidParamWithUnits['orbitControlsRotateSpeed'].value = .4
  //   guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 3
  //   guidParamWithUnits['logZoomRate'].value = -3

  //   guidParamWithUnits['launchVehicleScaleFactor'].value = 1
  //   guidParamWithUnits['launchSledScaleFactor'].value = 1
  //   guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 3
  //   guidParamWithUnits['numVirtualLaunchVehicles'].value = 6
  //   guidParamWithUnits['numVirtualLaunchSleds'].value = 6
  //   guidParamWithUnits['launchVehicleRadius'].value = 1.5
  //   guidParamWithUnits['launchVehicleBodyLength'].value = 10

  //   guidParamWithUnits['launchVehicleAdaptiveThrust'].value = true
  //   guidParamWithUnits['launcherCoastTime'].value = 93*60 / 2
  //   guidParamWithUnits['launchVehicleEmptyMass'].value = 1000
  //   guidParamWithUnits['launchVehiclePayloadMass'].value = 100

  //   // Estimte the launchVehicle's volume and dry mass from its mass diameter and length
  //   const r = guidParamWithUnits['launchVehicleRadius'].value
  //   const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  //   const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value
  //   const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  //   const π = Math.PI
  //   const interiorVolume = r**2 * π * (bl - rel  + ncl/3)
  //   const surfaceArea = 2 * π * r * bl + π * r * Math.sqrt(ncl**2 + r**2)
  //   const skinThickness = 0.003  // Includes any ribs, stringers, etc as well as skin
  //   const skinMaterialDensity = 8000 // kg/m3
  //   const rocketEngineMass = 3177 // kg (based on RS-25)
  //   const avionicsEtcMass = 1000 // kg

  //   // Hack
  //   const dryMass = 0 //skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass
  //   // Allocate the volume between the payload and the propellant
  //   const propellantDensity = 360 // kg/m3
  //   const payloadDensity = 360 // kg/m3
  //   const propellantMass = interiorVolume * propellantDensity
  //   const payloadMass = 0 // (interiorVolume - propellantMass / propellantDensity) * payloadDensity
  //   console.log('dryMass', dryMass)
  //   console.log('payloadMass', payloadMass)
  //   console.log('propellantMass', payloadMass)
  //   console.log('totalMass', payloadMass + dryMass)

  //   guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass    // kg
  //   guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass   // kg
  //   guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass   // kg
  //   // Parameters that are going to effect the launch system's performance...
  //   // Launch Angle (launcherRampUpwardAcceleration)
  //   // Propellant Mass (launchVehiclePropellantMass)
  //   // Altitude of Ramp Exit
  //   // Altitude of Evauated Tube Exit
  //   // Desired Orbital Altitude

  //   // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  //   // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  //   // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  //   guidParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value = 450000  // m
  //   guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 10  // m/s2
  //   guidParamWithUnits['launcherRampDesignMode'].value = 1
  //   guidParamWithUnits['launcherRampTurningRadius'].value = 250
  //   //guidParamWithUnits['launcherRampTurningRadius'].value = 10
  //   //guidParamWithUnits['launcherRampUpwardAcceleration'].value = 50       // m/s2
  //   guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 1.6
  //   guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 3
  //   guidParamWithUnits['launcherMassDriverExitVelocity'].value = 300     // m/s
  //   guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 8500  // m
  //   //guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  //   // Hack!!!
  //   guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 80 // kg/s  (Based on RS-25)

  //   guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  //   guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  //   //guidParamWithUnits['launchVehicleRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)

  // }



export function toLowOrbitWithRocket(guidParamWithUnits, rocketLaunchPadLatitude, rocketLaunchPadLongitude, massDriverAltitude, rampExitAltitude) {

  guidParamWithUnits['launchTrajectorySelector'].value = 1 // Use the trajectory code for a rocket on a launchpad

  // Sun's Gravitational Parameter
  const g_sun = 1.32712440018e20 // m3/kg/s2
  // Earth's Gravitational Parameter
  const g_earth = 3.986004418e14 // m3/kg/s2
  // Mars's Gravitational Parameter
  const g_mars = 4.282837e13 // m3/kg/s2
  // Radius of Earth's orbit around the sun
  const r_earthOrbit = 1.496e11 // m
  // Radius of Mars's orbit around the sun
  const r_marsOrbit = 2.279e11 // m
  // Earth's orbital speed
  const v_earth = Math.sqrt(g_sun / r_earthOrbit) // m/s
  // Mars's orbital speed
  const v_mars = Math.sqrt(g_sun / r_marsOrbit) // m/s
  // Earth-Mars transfer orbit semi-major axis
  const a_transferOrbit = (r_earthOrbit + r_marsOrbit) / 2 // m
  // Perihelion speed of earth-mars transfer orbit
  const v_perihelion = Math.sqrt(2 * g_sun / r_earthOrbit - g_sun / a_transferOrbit) // m/s
  // Apohelion speed of earth-mars transfer orbit
  const v_apohelion = Math.sqrt(2 * g_sun / r_marsOrbit - g_sun / a_transferOrbit) // m/s
  // Excess speed at earth of earth-mars transfer orbit
  let v_earth_excess = v_perihelion - v_earth // m/s

  const C3Value = (v_earth_excess/1000)**2 // km2/s2
  console.log('C3Value', C3Value, "km2/s2")

  // This works out to be 2943 m/s, but this source (https://web.archive.org/web/20210331135639/https://trs.jpl.nasa.gov/bitstream/handle/2014/44336/13-0679_A1b.pdf?sequence=1#expand)
  // Which does a more detailed analysis of the transfer orbit, says on table 3 that the that the excess speed (ΔV1) varies between 2990 m/s and 4030 m/s
  // In practice, after orbital eccentricity, inclination, and rotated apsides are taken into consideration.
  // 10/2/2024 - 3360 m/s
  // 10/31/2026 - 3040 m/s
  // 11/24/2028 - 3020 m/s
  // 12/29/2030 - 3220 m/s
  // 4/16/2033 - 3000 m/s
  // 6/26/2035 - 3210 m/s
  // 8/20/2037 - 4030 m/s
  // 9/21/2039 - 3540 m/s
  // 10/20/2041 - 3130 m/s
  // 11/15/2043 - 3000 m/s
  // 12/14/2045 - 3110 m/s
  // 3/20/2048 - 3260 m/s
  // 5/26/2050 - 2830 m/s
  // 8/9/2052 - 3980 m/s

  // Hack...
  //v_earth_excess = 4030 // m/s - value for 8/20/2037
  //v_earth_excess = Math.sqrt(41.65)*1000 // C3 value is from Figure 1 of https://dataverse.jpl.nasa.gov/file.xhtml?fileId=91111&version=2.0

  console.log('v_earth_excess', v_earth_excess)

  // Also we need to consider that we will want to use the launcher over a period of several days, and that only one of these days will
  // be associated with the optimal launch window.
  
  // Excess speed at mars of earth-mars transfer orbit
  const v_mars_excess = v_mars - v_apohelion // m/s
  // Negative semi-major of Earth hyperbolic trajectory with excess speed of v_earth_excess
  const a_earth = -g_earth / v_earth_excess**2
  console.log('a_earth', a_earth)
  // Radius of the earth
  const r_earth = 6378100 // m  

  console.log('g_earth', g_earth, 'r_earth', r_earth)

  // Length of earth's sideral day in seconds
  const t_earth = 86164.0905 // s
  // Velocity of spacecraft at earth's surface at the hyperbolic orbit perigee in the inertial reference frame
  const launchVehiclePerigeeSpeed = Math.sqrt(g_earth * 2 / (r_earth+massDriverAltitude) + g_earth / Math.abs(a_earth)) // m/s
  //const launchVehiclePerigeeSpeed2 = Math.sqrt(g_earth * 2 / (r_earth+200000) + g_earth / Math.abs(a_earth)) // m/s
  console.log('*** launchVehiclePerigeeSpeed', launchVehiclePerigeeSpeed)
  //console.log('*** launchVehiclePerigeeSpeed2', launchVehiclePerigeeSpeed2)
  // Velocity at earth's surface due to earth's rotation
  const v_earth_rotation = 2*Math.PI*(r_earth+massDriverAltitude) * Math.cos(rocketLaunchPadLatitude*Math.PI/180) / t_earth // m/s
  console.log('v_earth_rotation', v_earth_rotation)
  // Velocity of spacecraft at earth's surface in ECEF coordinates
  const launchVehicleAirspeed = launchVehiclePerigeeSpeed - v_earth_rotation // m/s
  // Velocity of a satellite in 200km LEO orbit
  const v_spacecraft_LEO = Math.sqrt(g_earth / (r_earth + 200000)) // m/s
  // Difference in velocity between spacecraft in LEO and 10km above earth's surface
  const v_minus_vleo = launchVehicleAirspeed - v_spacecraft_LEO // m/s

  console.log('v_earth', v_earth)
  console.log('v_mars', v_mars)
  console.log('v_perihelion', v_perihelion)
  console.log('v_apohelion', v_apohelion)
  console.log('v_earth_excess', v_earth_excess)
  console.log('v_mars_excess', v_mars_excess)
  console.log('a_earth', a_earth)
  console.log('launchVehicleAirspeed', launchVehicleAirspeed)
  console.log('v_spacecraft_LEO', v_spacecraft_LEO)
  console.log('v_minus_vleo', v_minus_vleo)

  guidParamWithUnits['launcherMassDriverAltitude'].value = massDriverAltitude // m
  guidParamWithUnits['launcherRampExitAltitude'].value = rampExitAltitude // m
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 500 // m
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 50
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 100
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = 300     // m/s
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  //guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100*60
  guidParamWithUnits['launcherFeederRailLength'].value = 30
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 0 // Auto mode

  // Estimte the launchVehicle's volume and dry mass from its mass diameter and length
  const r = guidParamWithUnits['launchVehicleRadius'].value
  const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value
  const π = Math.PI
  const interiorVolume = r**2 * π * (bl - rel  + ncl/3)
  const surfaceArea = 2 * π * r * bl + π * r * Math.sqrt(ncl**2 + r**2)
  const skinThickness = 0.003  // Includes any ribs, stringers, etc as well as skin
  const skinMaterialDensity = 8000 // kg/m3
  const rocketEngineMass = 3177 // kg (based on RS-25)
  const avionicsEtcMass = 1000 // kg

  const dryMass = skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass
  // Allocate the volume between the payload and the propellant
  const propellantDensity = 360 // kg/m3
  const payloadDensity = 360 // kg/m3
  const propellantMass = 3000
  const payloadMass = (interiorVolume - propellantMass / propellantDensity) * payloadDensity
  console.log('dryMass', dryMass)
  console.log('payloadMass', payloadMass)
  console.log('propellantMass', payloadMass)
  console.log('totalMass', payloadMass + dryMass)

  guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass    // kg
  guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass   // kg
  guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass   // kg
  guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 80  // m/s2
  guidParamWithUnits['launcherRampUpwardAcceleration'].value = 160
  guidParamWithUnits['launcherMaxEyesInAcceleration'].value = 80
  guidParamWithUnits['launcherMaxEyesOutAcceleration'].value = 80
  guidParamWithUnits['launcherRampTurningRadius'].value = 381000
  guidParamWithUnits['launcherRampTurningRadius'].value = 49096
  guidParamWithUnits['launcherRampDesignMode'].value = 0
  guidParamWithUnits['planetName'].value = "Earth"
  guidParamWithUnits['launcherLocationMode'].value = 1
  guidParamWithUnits['rocketLaunchPadLatitude'].value = rocketLaunchPadLatitude
  guidParamWithUnits['rocketLaunchPadLongitude'].value = rocketLaunchPadLongitude

  guidParamWithUnits['propellantNeededForLandingOnMars'].value = 1000 //kg // ToDo - We need to make a proper estimate of this

}