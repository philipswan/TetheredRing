import * as tram from '../tram.js'

const HELIOCENTRIC_ORBIT_RADIUS = {
  Earth: 1.496e11,
  // Moon's heliocentric orbit is approximately Earth's.
  Moon: 1.496e11,
  Mars: 2.279e11
}

const LOCAL_ORBIT_ALTITUDE = {
  Earth: 200000,
  Moon: 200000,
  Mars: 200000
}

const V_EXCESS_OVERRIDES = {
  'Earth->Moon': 900,
  'Moon->Earth': 900
}

const gSun = 1.32712440018e20

function normalizePlanetName(name) {
  if (!name) return null
  const normalized = name.trim().toLowerCase()
  if (normalized === 'earth') return 'Earth'
  if (normalized === 'moon') return 'Moon'
  if (normalized === 'mars') return 'Mars'
  return null
}

function getBodyFromSpec(planetName) {
  const canonicalPlanet = normalizePlanetName(planetName)
  if (!canonicalPlanet) {
    throw new Error(`Unknown planet: ${planetName}`)
  }

  const spec = tram.getPlanetSpec(canonicalPlanet)
  return {
    name: canonicalPlanet,
    mu: spec.gravitationalParameter,
    radius: spec.radiusAtLatitude(0),
    siderealDay: spec.lengthOfSiderealDay,
    orbitRadius: HELIOCENTRIC_ORBIT_RADIUS[canonicalPlanet]
  }
}

function parseDestination(destination, departure) {
  const destinationText = (destination ?? '').trim()
  const destinationLower = destinationText.toLowerCase()
  const directPlanet = normalizePlanetName(destinationText)
  if (directPlanet) {
    return { kind: 'planet', planet: directPlanet, displayName: destinationText }
  }

  if (destinationLower === 'gto') {
    return { kind: 'orbit', orbitType: 'gto', centralBody: 'Earth', displayName: destinationText }
  }

  if (destinationLower === 'geo') {
    return { kind: 'orbit', orbitType: 'circular', centralBody: 'Earth', altitude: 35786000, displayName: destinationText }
  }

  if (
    destinationLower === 'loworbit' ||
    destinationLower === 'low orbit' ||
    destinationLower === 'leo' ||
    destinationLower === 'llo' ||
    destinationLower === 'lmo'
  ) {
    return { kind: 'orbit', orbitType: 'circular', centralBody: departure, altitude: LOCAL_ORBIT_ALTITUDE[departure] ?? 200000, displayName: destinationText }
  }

  if (destinationLower.startsWith('low ') && destinationLower.endsWith(' orbit')) {
    const bodyName = destinationText.slice(4, -6).trim()
    const orbitBody = normalizePlanetName(bodyName)
    if (orbitBody) {
      return { kind: 'orbit', orbitType: 'circular', centralBody: orbitBody, altitude: LOCAL_ORBIT_ALTITUDE[orbitBody] ?? 200000, displayName: destinationText }
    }
  }

  return { kind: 'unknown', displayName: destinationText }
}

function getDepartureExcessSpeed(departure, destination) {
  const overrideKey = `${departure}->${destination}`
  if (V_EXCESS_OVERRIDES[overrideKey] !== undefined) {
    return V_EXCESS_OVERRIDES[overrideKey]
  }

  const from = getBodyFromSpec(departure)
  const to = getBodyFromSpec(destination)
  if (!from.orbitRadius || !to.orbitRadius) {
    return 0
  }

  if (from.orbitRadius === to.orbitRadius) {
    return 0
  }

  const aTransferOrbit = (from.orbitRadius + to.orbitRadius) / 2
  const vTransferAtDeparture = Math.sqrt(2 * gSun / from.orbitRadius - gSun / aTransferOrbit)
  const vDepartureOrbit = Math.sqrt(gSun / from.orbitRadius)

  return Math.abs(vTransferAtDeparture - vDepartureOrbit)
}

function setVehicleMasses(guidParamWithUnits) {
  const r = guidParamWithUnits['launchVehicleRadius'].value
  const bl = guidParamWithUnits['launchVehicleBodyLength'].value
  const ncl = guidParamWithUnits['launchVehicleNoseconeLength'].value
  const rel = guidParamWithUnits['launchVehicleRocketEngineLength'].value

  const pi = Math.PI
  const interiorVolume = r ** 2 * pi * (bl - rel + ncl / 3)
  const surfaceArea = 2 * pi * r * bl + pi * r * Math.sqrt(ncl ** 2 + r ** 2)

  const skinThickness = 0.003
  const skinMaterialDensity = 8000
  const rocketEngineMass = 3177
  const avionicsEtcMass = 1000

  const dryMass = skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass

  const propellantDensity = 360
  const payloadDensity = 360
  const propellantMass = 3000
  const payloadMass = (interiorVolume - propellantMass / propellantDensity) * payloadDensity

  guidParamWithUnits['launchVehicleEmptyMass'].value = dryMass
  guidParamWithUnits['launchVehiclePropellantMass'].value = propellantMass
  guidParamWithUnits['launchVehiclePayloadMass'].value = payloadMass
}

export function toAFromBLauncherArchitecture(
  guidParamWithUnits,
  launcherRampEndLatitude,
  launcherRampEndLongitude,
  massDriverAltitude,
  rampExitAltitude,
  departure,
  destination
) {
  const departureBody = getBodyFromSpec(departure)
  const destinationProfile = parseDestination(destination, departureBody.name)

  const vRotation =
    (2 * Math.PI * (departureBody.radius + massDriverAltitude) * Math.cos(launcherRampEndLatitude * Math.PI / 180)) /
    departureBody.siderealDay

  let launchVehicleAirspeed
  if (destinationProfile.kind === 'orbit') {
    if (departureBody.name !== destinationProfile.centralBody) {
      throw new Error(`Departure ${departureBody.name} does not match orbit destination body ${destinationProfile.centralBody}`)
    }

    if (destinationProfile.orbitType === 'gto') {
      const rPerigee = departureBody.radius + (LOCAL_ORBIT_ALTITUDE[departureBody.name] ?? 200000)
      const rApogee = departureBody.radius + 35786000
      const aTransfer = (rPerigee + rApogee) / 2
      const vPerigee = Math.sqrt(departureBody.mu * (2 / rPerigee - 1 / aTransfer))
      launchVehicleAirspeed = vPerigee + 250
    }
    else {
      const localOrbitAltitude = destinationProfile.altitude ?? (LOCAL_ORBIT_ALTITUDE[departureBody.name] ?? 200000)
      const orbitalSpeed = Math.sqrt(departureBody.mu / (departureBody.radius + localOrbitAltitude))
      // Small margin to account for gravity and drag losses from the launcher exit point.
      launchVehicleAirspeed = orbitalSpeed + (departureBody.name === 'Earth' ? 250 : 150)
    }
  }
  else if (destinationProfile.kind === 'planet') {
    const vExcess = getDepartureExcessSpeed(departureBody.name, destinationProfile.planet)
    if (vExcess <= 0) {
      const escapeSpeed = Math.sqrt((2 * departureBody.mu) / (departureBody.radius + massDriverAltitude))
      launchVehicleAirspeed = escapeSpeed - vRotation
    }
    else {
    const aDeparture = -departureBody.mu / (vExcess ** 2)
    const launchVehiclePerigeeSpeed = Math.sqrt(
      (departureBody.mu * 2) / (departureBody.radius + massDriverAltitude) + departureBody.mu / Math.abs(aDeparture)
    )
    launchVehicleAirspeed = launchVehiclePerigeeSpeed - vRotation
    }
  }
  else {
    throw new Error(`Unsupported destination: ${destination}`)
  }

  guidParamWithUnits['launchFromPlanet'].value = departureBody.name
  guidParamWithUnits['launchToPlanet'].value = destination
  guidParamWithUnits['launcherMassDriverAltitude'].value = massDriverAltitude
  guidParamWithUnits['launcherRampExitAltitude'].value = rampExitAltitude
  guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = departureBody.name === 'Earth' ? 15000 : departureBody.name === 'Moon' ? rampExitAltitude : rampExitAltitude + 100
  guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = departureBody.name === 'Earth' ? 50 : 10
  guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = departureBody.name === 'Earth' ? 100 : 10
  guidParamWithUnits['launcherMassDriverExitVelocity'].value = launchVehicleAirspeed
  guidParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value = 3590
  guidParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value = 4436
  guidParamWithUnits['launchVehiclePropellantMassFlowRate'].value = 514.49
  guidParamWithUnits['launchVehicleAdaptiveThrust'].value = false
  guidParamWithUnits['launcherCoastTime'].value = 100 * 60
  guidParamWithUnits['launcherFeederRailLength'].value = departureBody.name === 'Earth' ? 30 : 10
  guidParamWithUnits['launcherMassDriverScrewThreadStarts'].value = 0

  setVehicleMasses(guidParamWithUnits)

  guidParamWithUnits['launcherMassDriverForwardAcceleration'].value = 80
  guidParamWithUnits['launcherRampUpwardAcceleration'].value = departureBody.name === 'Earth' ? 240 : 120
  guidParamWithUnits['launcherMaxEyesInAcceleration'].value = 80
  guidParamWithUnits['launcherMaxEyesOutAcceleration'].value = 80
  guidParamWithUnits['launcherRampTurningRadius'].value = 381000
  guidParamWithUnits['launcherRampTurningRadius'].value = 49096
  guidParamWithUnits['launcherRampDesignMode'].value = 0
  guidParamWithUnits['planetName'].value = departureBody.name
  guidParamWithUnits['launcherLocationMode'].value = 1
  guidParamWithUnits['launcherRampEndLatitude'].value = launcherRampEndLatitude
  guidParamWithUnits['launcherRampEndLongitude'].value = launcherRampEndLongitude

  if (destination === 'Mars') {
    guidParamWithUnits['propellantNeededForLandingOnMars'].value = 1000
  }
}

export function toMarsFromMoonLauncherArchitecture(
  guidParamWithUnits,
  launcherRampEndLatitude,
  launcherRampEndLongitude,
  massDriverAltitude,
  rampExitAltitude
) {
  toAFromBLauncherArchitecture(
    guidParamWithUnits,
    launcherRampEndLatitude,
    launcherRampEndLongitude,
    massDriverAltitude,
    rampExitAltitude,
    'Moon',
    'Mars'
  )
}

export function toMarsFromEarthLauncherArchitecture(
  guidParamWithUnits,
  launcherRampEndLatitude,
  launcherRampEndLongitude,
  massDriverAltitude,
  rampExitAltitude
) {
  toAFromBLauncherArchitecture(
    guidParamWithUnits,
    launcherRampEndLatitude,
    launcherRampEndLongitude,
    massDriverAltitude,
    rampExitAltitude,
    'Earth',
    'Mars'
  )
}

export function toOrbitFromMoonLauncherArchitecture(
  guidParamWithUnits,
  launcherRampEndLatitude,
  launcherRampEndLongitude,
  massDriverAltitude,
  rampExitAltitude
) {
  toAFromBLauncherArchitecture(
    guidParamWithUnits,
    launcherRampEndLatitude,
    launcherRampEndLongitude,
    massDriverAltitude,
    rampExitAltitude,
    'Moon',
    'Low Moon Orbit'
  )
}

export function toOrbitFromEarthLauncherArchitecture(
  guidParamWithUnits,
  launcherRampEndLatitude,
  launcherRampEndLongitude,
  massDriverAltitude,
  rampExitAltitude
) {
  toAFromBLauncherArchitecture(
    guidParamWithUnits,
    launcherRampEndLatitude,
    launcherRampEndLongitude,
    massDriverAltitude,
    rampExitAltitude,
    'Earth',
    'Low Earth Orbit'
  )
}

export function toMoonFromEarthLauncherArchitecture(
  guidParamWithUnits,
  launcherRampEndLatitude,
  launcherRampEndLongitude,
  massDriverAltitude,
  rampExitAltitude
) {
  toAFromBLauncherArchitecture(
    guidParamWithUnits,
    launcherRampEndLatitude,
    launcherRampEndLongitude,
    massDriverAltitude,
    rampExitAltitude,
    'Earth',
    'Moon'
  )
}

export function toEarthFromMarsLauncherArchitecture(
  guidParamWithUnits,
  launcherRampEndLatitude,
  launcherRampEndLongitude,
  massDriverAltitude,
  rampExitAltitude
) {
  toAFromBLauncherArchitecture(
    guidParamWithUnits,
    launcherRampEndLatitude,
    launcherRampEndLongitude,
    massDriverAltitude,
    rampExitAltitude,
    'Mars',
    'Earth'
  )
}
