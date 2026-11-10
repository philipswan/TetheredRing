import {getAerodynamicDrag} from './launcherPhysics.js'

// Equal, opposite rocket thrust cancels aerodynamic drag along the air-relative
// velocity. The resulting motion remains the designed ballistic trajectory;
// propellant, thrust limits and drag energy are still accounted for physically.
export function spaceportAtmosphere(mission, planet, params, referenceRadius, tubeTime) {
  if (!(tubeTime < mission.apogeeTime)) throw new Error('Spaceport tube exit must precede apogee.')
  const p = name => params[name].value
  const initialPropellant = p('launchVehiclePropellantMass')
  const dryMass = p('launchVehicleEmptyMass') + p('launchVehiclePayloadMass')
  const at = time => {
    const state = mission.stateAt(time)
    const altitude = state.position.length() - referenceRadius
    const airSpeed = state.velocity.length()
    const density = time >= tubeTime ? planet.airDensityAtAltitude(altitude) : 0
    const drag = getAerodynamicDrag(density, p('launchVehicleCoefficientOfDrag'), airSpeed,
      p('launchVehicleRadius'), p('launchVehicleBodyLength'))
    const pressure = planet.airPressureAtAltitude(altitude)
    const fraction = Math.max(0, Math.min(1, pressure / 101325))
    const exhaustVelocity = p('launchVehicleVacuumRocketExhaustVelocity') * (1 - fraction)
      + p('launchVehicleSeaLevelRocketExhaustVelocity') * fraction
    const massFlowRate = time < mission.apogeeTime && drag > 0 ? drag / exhaustVelocity : 0
    return {altitude, airSpeed, density, drag, exhaustVelocity, massFlowRate,
      thrust: massFlowRate * exhaustVelocity}
  }
  const count = Math.max(1, Math.ceil((mission.apogeeTime - tubeTime) / 0.1))
  const dt = (mission.apogeeTime - tubeTime) / count
  const samples = [{time: tubeTime, consumed: 0}]
  let previous = at(tubeTime), consumed = 0, dragEnergy = 0, deltaV = 0
  let peakFlow = previous.massFlowRate, peakDrag = previous.drag
  for (let i = 1; i <= count; i++) {
    const time = tubeTime + dt * i, next = at(time)
    const fuel = (previous.massFlowRate + next.massFlowRate) * dt / 2
    const mass = dryMass + initialPropellant - consumed - fuel / 2
    deltaV += (previous.thrust + next.thrust) * dt / (2 * Math.max(1, mass))
    consumed += fuel
    dragEnergy += (previous.drag * previous.airSpeed + next.drag * next.airSpeed) * dt / 2
    peakFlow = Math.max(peakFlow, next.massFlowRate); peakDrag = Math.max(peakDrag, next.drag)
    samples.push({time, consumed}); previous = next
  }
  if (peakFlow > p('launchVehiclePropellantMassFlowRate') + 1e-6) {
    throw new Error(`Spaceport drag compensation needs ${peakFlow.toFixed(1)} kg/s, above the configured rocket flow limit.`)
  }
  if (consumed > initialPropellant + 1e-6) {
    throw new Error(`Spaceport drag compensation needs ${consumed.toFixed(1)} kg of propellant, above the configured supply.`)
  }
  const consumedAt = time => {
    const x = Math.max(0, Math.min(count, (time - tubeTime) / dt)), i = Math.min(count - 1, Math.floor(x))
    return samples[i].consumed + (samples[i + 1].consumed - samples[i].consumed) * (x - i)
  }
  return {at, consumedAt, consumed, remaining: initialPropellant - consumed, dragEnergy, deltaV, peakFlow, peakDrag}
}
