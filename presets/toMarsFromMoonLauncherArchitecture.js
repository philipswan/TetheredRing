import * as THREE from 'three'

export function toMarsFromMoonLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude) {

  // Sun's Gravitational Parameter
  const g_sun = 1.32712440018e20 // m3/kg/s2
  // Earth's Gravitational Parameter
  const g_earth = 3.986004418e14 // m3/kg/s2
  // Moon's Gravitational Parameter
  const g_moon = 4.9048695e12 // m3/kg/s2
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

  // Could add the speed of the moon traveling around the earth, although waiting for the moon
  // to be traveling in the right direction could cause the ideal launch window to be missed.

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
  //const a_earth = -g_earth / v_earth_excess**2
  const a_moon = -g_moon / v_earth_excess**2
  //console.log('a_earth', a_earth)
  // Radius of the earth
  // const r_earth = 6378100 // m  
  // Radius of the moon
  const r_moon = 1737100 // m

  //console.log('g_earth', g_earth, 'r_earth', r_earth)

  // Length of earth's sideral day in seconds
  //const t_earth = 86164.0905 // s
  const t_moon = 2360591.5 // s
  // Velocity of spacecraft at earth's surface at the hyperbolic orbit perigee in the inertial reference frame
  const launchVehiclePerigeeSpeed = Math.sqrt(g_moon * 2 / (r_moon+massDriverAltitude) + g_moon / Math.abs(a_moon)) // m/s
  //const launchVehiclePerigeeSpeed2 = Math.sqrt(g_earth * 2 / (r_moon+200000) + g_moon / Math.abs(a_moon)) // m/s
  console.log('*** launchVehiclePerigeeSpeed', launchVehiclePerigeeSpeed)
  //console.log('*** launchVehiclePerigeeSpeed2', launchVehiclePerigeeSpeed2)
  // Velocity at earth's surface due to earth's rotation
  const v_moon_rotation = 2*Math.PI*(r_moon+massDriverAltitude) * Math.cos(launcherRampEndLatitude*Math.PI/180) / t_moon // m/s
  //console.log('v_earth_rotation', v_earth_rotation)
  // Velocity of spacecraft at earth's surface in ECEF coordinates
  const launchVehicleAirspeed = launchVehiclePerigeeSpeed - v_moon_rotation // m/s
  // Velocity of a satellite in 200km LLO orbit
  const v_spacecraft_LLO = Math.sqrt(g_moon / (r_moon + 200000)) // m/s
  // Difference in velocity between spacecraft in LLO and 10km above moon's surface
  const v_minus_vleo = launchVehicleAirspeed - v_spacecraft_LLO // m/s

  console.log('v_earth', v_earth)
  console.log('v_mars', v_mars)
  console.log('v_perihelion', v_perihelion)
  console.log('v_apohelion', v_apohelion)
  console.log('v_earth_excess', v_earth_excess)
  console.log('v_mars_excess', v_mars_excess)
  console.log('a_moon', a_moon)
  console.log('launchVehicleAirspeed', launchVehicleAirspeed)
  console.log('v_spacecraft_LLO', v_spacecraft_LLO)
  console.log('v_minus_vleo', v_minus_vleo)

  guidParamWithUnits['launcherMassDriverAltitude'].value = massDriverAltitude // m
  guidParamWithUnits['launcherRampExitAltitude'].value = rampExitAltitude // m
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = rampExitAltitude+100 // m
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 10
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 10
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = launchVehicleAirspeed     // m/s
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590  // m/s  (Based on RS-25 Sea Level)
  //guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3210  // m/s  (Based on Raptor Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436  // m/s  (Based on RS-25 Vacuum)
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49 // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = false
  guidParamWithUnits['launcherCoastTime'].value = 100*60
  guidParamWithUnits['launcherFeederRailLength'].value = 10
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
  //launchVehicleNonPayloadMass
  guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 80  // m/s2
  guidParamWithUnits['launcherRampUpwardAcceleration'].value = 120
  guidParamWithUnits['launcherMaxEyesInAcceleration'].value = 80
  guidParamWithUnits['launcherMaxEyesOutAcceleration'].value = 80
  //guidParamWithUnits['launcherRampTurningRadius'].value = 250000
  guidParamWithUnits['launcherRampTurningRadius'].value = 381000
  guidParamWithUnits['launcherRampTurningRadius'].value = 49096
  guidParamWithUnits['launcherRampDesignMode'].value = 0
  guidParamWithUnits['planetName'].value = "Moon"
  guidParamWithUnits['launcherLocationMode'].value = 1
  guidParamWithUnits['launcherRampEndLatitude'].value = launcherRampEndLatitude
  guidParamWithUnits['launcherRampEndLongitude'].value = launcherRampEndLongitude

}