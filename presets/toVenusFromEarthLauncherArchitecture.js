import * as THREE from 'three';

export function toVenusFromEarthLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude) {

  // Sun's Gravitational Parameter
  const g_sun = 1.32712440018e20; // m3/kg/s2
  // Earth's Gravitational Parameter
  const g_earth = 3.986004418e14; // m3/kg/s2
  // Venus' Gravitational Parameter
  const g_venus = 3.24859e14; // m3/kg/s2
  // Radius of Earth's orbit around the sun
  const r_earthOrbit = 1.496e11; // m
  // Radius of Venus' orbit around the sun
  const r_venusOrbit = 1.082e11; // m
  // Earth's orbital speed
  const v_earth = Math.sqrt(g_sun / r_earthOrbit); // m/s
  // Venus' orbital speed
  const v_venus = Math.sqrt(g_sun / r_venusOrbit); // m/s
  // Earth-Venus transfer orbit semi-major axis
  const a_transferOrbit = (r_earthOrbit + r_venusOrbit) / 2; // m
  // Perihelion speed of Earth-Venus transfer orbit
  const v_perihelion = Math.sqrt(2 * g_sun / r_earthOrbit - g_sun / a_transferOrbit); // m/s
  // Apohelion speed of Earth-Venus transfer orbit
  const v_apohelion = Math.sqrt(2 * g_sun / r_venusOrbit - g_sun / a_transferOrbit); // m/s
  // Excess speed at Earth of Earth-Venus transfer orbit
  let v_earth_excess = v_perihelion - v_earth; // m/s

  const C3Value = (v_earth_excess/1000)**2; // km2/s2
  console.log('C3Value', C3Value, "km2/s2");

  console.log('v_earth_excess', v_earth_excess);

  // Excess speed at Venus of Earth-Venus transfer orbit
  const v_venus_excess = v_venus - v_apohelion; // m/s
  // Negative semi-major of Earth hyperbolic trajectory with excess speed of v_earth_excess
  const a_earth = -g_earth / v_earth_excess**2;
  console.log('a_earth', a_earth);
  // Radius of the Earth
  const r_earth = 6378100; // m  

  console.log('g_earth', g_earth, 'r_earth', r_earth);

  // Length of Earth's sidereal day in seconds
  const t_earth = 86164.0905; // s
  // Velocity of spacecraft at Earth's surface at the hyperbolic orbit perigee in the inertial reference frame
  const launchVehiclePerigeeSpeed = Math.sqrt(g_earth * 2 / (r_earth+massDriverAltitude) + g_earth / Math.abs(a_earth)); // m/s
  console.log('*** launchVehiclePerigeeSpeed', launchVehiclePerigeeSpeed);

  // Velocity at Earth's surface due to Earth's rotation
  const v_earth_rotation = 2*Math.PI*(r_earth+massDriverAltitude) * Math.cos(launcherRampEndLatitude*Math.PI/180) / t_earth; // m/s
  console.log('v_earth_rotation', v_earth_rotation);
  // Velocity of spacecraft at Earth's surface in ECEF coordinates
  const launchVehicleAirspeed = launchVehiclePerigeeSpeed - v_earth_rotation; // m/s
  
  console.log('v_earth', v_earth);
  console.log('v_venus', v_venus);
  console.log('v_perihelion', v_perihelion);
  console.log('v_apohelion', v_apohelion);
  console.log('v_earth_excess', v_earth_excess);
  console.log('v_venus_excess', v_venus_excess);
  console.log('a_earth', a_earth);
  console.log('launchVehicleAirspeed', launchVehicleAirspeed);

  guidParamWithUnits['launchFromPlanet'].value = "Earth"
  guidParamWithUnits['launchToPlanet'].value = "Venus"
  guidParamWithUnits['launcherMassDriverAltitude'].value = massDriverAltitude; // m
  guidParamWithUnits['launcherRampExitAltitude'].value = rampExitAltitude; // m
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 15000; // m
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = launchVehicleAirspeed; // m/s
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590; // m/s  (Based on RS-25 Sea Level)
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436; // m/s  (Based on RS-25 Vacuum)
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49; // kg/s  (Based on RS-25)
  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = false;
  guidParamWithUnits['launcherCoastTime'].value = 100*60;
  guidParamWithUnits['launcherFeederRailLength'].value = 30;
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 0; // Auto mode

  guidParamWithUnits['planetName'].value = "Earth";
  guidParamWithUnits['launcherLocationMode'].value = 1;
  guidParamWithUnits['launcherRampEndLatitude'].value = launcherRampEndLatitude;
  guidParamWithUnits['launcherRampEndLongitude'].value = launcherRampEndLongitude;

  guidParamWithUnits['propellantNeededForLandingOnVenus'].value = 1000; // kg // ToDo - We need to make a proper estimate of this
}
