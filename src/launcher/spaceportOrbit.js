import { Vector3 } from 'three'
import { designRamp } from './rampMotion.js'
import { geodeticToECEF } from '../physics/geodesy.js'
import { getPlanetSpec } from '../physics/planets.js'

const polarAxis = new Vector3(0, 1, 0)
export function orbitalInvariants(position, velocity, mu) {
  const r = position.length(), h = new Vector3().crossVectors(position, velocity)
  const energy = velocity.lengthSq() / 2 - mu / r
  const a = -mu / (2 * energy)
  const eccentricityVector = new Vector3().crossVectors(velocity, h).divideScalar(mu).sub(position.clone().divideScalar(r))
  const eccentricity = eccentricityVector.length(), apogeeRadius = a * (1 + eccentricity)
  const angularMomentum = h.length()
  return { energy, h: angularMomentum, axis: h.normalize(), a, eccentricity, eccentricityVector,
    apogeeRadius, apogeeSpeed: angularMomentum / apogeeRadius }
}

// Reproduce the production ramp's rotating-planet siting while solving launch
// speed and upward acceleration from the desired apogee energy and momentum.
export function evaluateSpaceportRamp(params, entrySpeed, upwardAcceleration) {
  const p = name => params[name].value, planet = getPlanetSpec(p('planetName'))
  const mu = planet.gravitationalParameter, omega = 2 * Math.PI / planet.lengthOfSiderealDay
  const xyz = geodeticToECEF(p('launcherRampEndLatitude'), p('launcherRampEndLongitude'), p('launcherRampExitAltitude'), planet.ellipsoid)
  const site = new Vector3(xyz.x, xyz.y, xyz.z), referenceRadius = site.length() - p('launcherRampExitAltitude')
  const exit = site.clone().applyAxisAngle(polarAxis, 100000 / referenceRadius)
  const axis = new Vector3().crossVectors(site, exit.sub(site)).normalize()
  const base = geodeticToECEF(p('launcherRampEndLatitude'), p('launcherRampEndLongitude'), p('launcherMassDriverAltitude'), planet.ellipsoid)
  const radius = Math.hypot(base.x, base.y, base.z)
  const options = { radius, exitRadius: radius + p('launcherRampExitAltitude') - p('launcherMassDriverAltitude'),
    entrySpeed, forwardAcceleration: p('launchVehicleMassDriverForwardAcceleration'), upwardAcceleration,
    transitionSeconds: p('launchVehicleAccelerationTransitionTime'), upwardJerk: p('launcherMassDriverUpwardJerk'), mu }
  let profile = designRamp(options)
  const entry = site.clone().normalize().applyAxisAngle(axis, -profile.downrangeAngle)
  const spin = polarAxis.clone().multiplyScalar(omega)
  options.omega = axis.dot(spin)
  options.radius = referenceRadius + p('launcherMassDriverAltitude')
  options.exitRadius = site.length()
  for (let i = 0; i < 5; i++) {
    const tangent = new Vector3().crossVectors(axis, entry)
    options.rotation = [spin.dot(entry), spin.dot(tangent), spin.dot(axis)]
    profile = designRamp(options)
    const end = profile.samples.at(-1)
    const direction = entry.clone().multiplyScalar(end.px).addScaledVector(tangent, end.py).addScaledVector(axis, end.pz).normalize()
    // Avoid importing scene or renderer state into the engineering solve.
    const correctionAxis = new Vector3().crossVectors(direction, site.clone().normalize())
    const angle = direction.angleTo(site)
    if (correctionAxis.lengthSq() > 1e-24) {
      correctionAxis.normalize(); entry.applyAxisAngle(correctionAxis, angle); axis.applyAxisAngle(correctionAxis, angle)
    }
    if (angle < 1e-11) break
  }
  const tangent = new Vector3().crossVectors(axis, entry), end = profile.samples.at(-1)
  const position = entry.clone().multiplyScalar(end.px).addScaledVector(tangent, end.py).addScaledVector(axis, end.pz)
  const velocity = entry.clone().multiplyScalar(end.vx).addScaledVector(tangent, end.vy).addScaledVector(axis, end.vz)
    .add(new Vector3().crossVectors(spin, position))
  return { position, velocity, referenceRadius, profile, planet, ...orbitalInvariants(position, velocity, mu) }
}

let sizingCache = null
export function solveSpaceportSizing(params) {
  const keys = ['planetName', 'launcherRampEndLatitude', 'launcherRampEndLongitude', 'launcherRampExitAltitude',
    'launcherMassDriverAltitude', 'launchVehicleMassDriverForwardAcceleration', 'launchVehicleAccelerationTransitionTime',
    'launcherMassDriverUpwardJerk', 'spaceportApogeeAltitude', 'spaceportVelocityDeficit']
  const key = JSON.stringify(keys.map(k => params[k].value))
  if (sizingCache?.key === key) return sizingCache.result
  const p = name => params[name].value, planet = getPlanetSpec(p('planetName')), mu = planet.gravitationalParameter
  const xyz = geodeticToECEF(p('launcherRampEndLatitude'), p('launcherRampEndLongitude'), p('launcherRampExitAltitude'), planet.ellipsoid)
  const referenceRadius = Math.hypot(xyz.x, xyz.y, xyz.z) - p('launcherRampExitAltitude')
  const apogeeRadius = referenceRadius + p('spaceportApogeeAltitude')
  const circularSpeed = Math.sqrt(mu / apogeeRadius), apogeeSpeed = circularSpeed - p('spaceportVelocityDeficit')
  if (!(apogeeSpeed > 0)) throw new Error('Spaceport velocity deficit must be less than circular orbital speed.')
  const targetEnergy = apogeeSpeed ** 2 / 2 - mu / apogeeRadius, targetH = apogeeRadius * apogeeSpeed
  const r = referenceRadius + p('launcherMassDriverAltitude')
  let speed = Math.sqrt(2 * (targetEnergy + mu / r)) - 2 * Math.PI / planet.lengthOfSiderealDay * r
  let upward = 100
  const error = state => [(state.energy - targetEnergy) / 1e6, (state.h - targetH) / 1e9]
  let solved
  for (let i = 0; i < 14; i++) {
    solved = evaluateSpaceportRamp(params, speed, upward)
    const e = error(solved), norm = Math.hypot(...e)
    if (norm < 1e-10) break
    const ds = error(evaluateSpaceportRamp(params, speed + 1, upward))
    const du = error(evaluateSpaceportRamp(params, speed, upward + 0.1))
    const a = ds[0] - e[0], b = (du[0] - e[0]) / 0.1
    const c = ds[1] - e[1], d = (du[1] - e[1]) / 0.1, determinant = a * d - b * c
    const stepSpeed = (-e[0] * d + b * e[1]) / determinant
    const stepUp = (-a * e[1] + c * e[0]) / determinant
    let accepted = false
    for (let fraction = 1; fraction >= 1 / 64; fraction /= 2) {
      const nextSpeed = speed + fraction * stepSpeed, nextUp = upward + fraction * stepUp
      if (!(nextSpeed > 100 && nextUp > 1 && nextUp < 2000)) continue
      try {
        if (Math.hypot(...error(evaluateSpaceportRamp(params, nextSpeed, nextUp))) < norm) {
          speed = nextSpeed; upward = nextUp; accepted = true; break
        }
      } catch { /* shorter trial steps can still fit the ramp */ }
    }
    if (!accepted) throw new Error('Spaceport launch sizing did not converge to the requested apogee.')
  }
  if (Math.abs(solved.apogeeRadius - apogeeRadius) > 0.1 || Math.abs(solved.h / solved.apogeeRadius - apogeeSpeed) > 0.01) {
    throw new Error('Spaceport sizing failed its apogee or velocity check.')
  }
  const result = { entrySpeed: speed, upwardAcceleration: upward, apogeeRadius, circularSpeed, apogeeSpeed, referenceRadius }
  sizingCache = { key, result }
  return result
}

export function createSpaceportMission({ position, velocity, mu, omega, deficit, stationLength, acceleration }) {
  const orbit = orbitalInvariants(position, velocity, mu), e = orbit.eccentricity
  const periapsis = orbit.eccentricityVector.clone().normalize(), side = new Vector3().crossVectors(orbit.axis, periapsis)
  const trueAnomaly = Math.atan2(position.dot(side), position.dot(periapsis))
  const initialE = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(trueAnomaly / 2), Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2))
  const initialM = initialE - e * Math.sin(initialE), n = Math.sqrt(mu / orbit.a ** 3)
  const apogeeTime = (Math.PI - initialM) / n
  const radius = orbit.apogeeRadius, circularSpeed = Math.sqrt(mu / radius), entrySpeed = orbit.h / radius
  const deltaV = circularSpeed - entrySpeed, captureDuration = deltaV / acceleration
  const captureDistance = deltaV ** 2 / (2 * acceleration)
  if (Math.abs(deltaV - deficit) > 0.1) throw new Error('Spaceport launch does not meet the requested velocity deficit.')
  if (!(acceleration > 0 && captureDistance < stationLength)) throw new Error('The station capture track is too short for its acceleration.')
  // Centre the acceleration track within the station, sharing spare length
  // equally between the leading and trailing ends (5 km each in this preset).
  const endMargin = (stationLength - captureDistance) / 2
  const apogeeDirection = periapsis.clone().negate()
  const circularState = (angle, speed) => {
    const radial = apogeeDirection.clone().applyAxisAngle(orbit.axis, angle)
    return { position: radial.clone().multiplyScalar(radius), velocity: new Vector3().crossVectors(orbit.axis, radial).multiplyScalar(speed) }
  }
  const inertialAt = time => {
    if (time >= apogeeTime) {
      const t = time - apogeeTime, burn = Math.min(t, captureDuration)
      const distance = entrySpeed * burn + 0.5 * acceleration * burn ** 2 + Math.max(0, t - burn) * circularSpeed
      return { ...circularState(distance / radius, entrySpeed + acceleration * burn), captured: true }
    }
    return ballisticInertialAt(time)
  }
  // The unassisted Kepler orbit is also used to draw the missed-capture return.
  const ballisticInertialAt = time => {
    const M = initialM + n * time
    let E = M
    for (let i = 0; i < 14; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    const cos = Math.cos(E), sin = Math.sin(E), factor = Math.sqrt(1 - e * e)
    const p = periapsis.clone().multiplyScalar(orbit.a * (cos - e)).addScaledVector(side, orbit.a * factor * sin)
    const rate = n / (1 - e * cos)
    const v = periapsis.clone().multiplyScalar(-orbit.a * sin * rate).addScaledVector(side, orbit.a * factor * cos * rate)
    return { position: p, velocity: v, captured: false }
  }
  const toPlanet = (state, time) => {
    const p = state.position.clone().applyAxisAngle(polarAxis, -omega * time)
    const v = state.velocity.clone().sub(new Vector3().crossVectors(polarAxis.clone().multiplyScalar(omega), state.position))
      .applyAxisAngle(polarAxis, -omega * time)
    return { ...state, position: p, velocity: v }
  }
  return { ...orbit, radius, circularSpeed, entrySpeed, deltaV, apogeeTime, captureDuration, captureDistance, stationLength, endMargin,
    duration: apogeeTime + captureDuration + 60,
    ballisticStateAt: time => toPlanet(ballisticInertialAt(time), time),
    ballisticReturnTime: surfaceRadius => {
      if (!(surfaceRadius >= orbit.a * (1 - e) && surfaceRadius < radius)) return null
      let lo = apogeeTime, hi = (2 * Math.PI - initialM) / n
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2
        if (ballisticInertialAt(mid).position.length() > surfaceRadius) lo = mid; else hi = mid
      }
      return (lo + hi) / 2
    },
    inertialAt, stateAt: time => toPlanet(inertialAt(time), time),
    stationAt: time => {
      const angle = circularSpeed / radius * (time - apogeeTime) + endMargin / radius
      const leading = toPlanet(circularState(angle, circularSpeed), time)
      const centre = toPlanet(circularState(angle - stationLength / (2 * radius), circularSpeed), time)
      const captureStart = toPlanet(circularState(angle - endMargin / radius, circularSpeed), time)
      return { leading, centre, captureStart, axis: orbit.axis.clone().applyAxisAngle(polarAxis, -omega * time) }
    } }
}
