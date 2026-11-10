import { solveSpaceportSizing } from '../launcher/spaceportOrbit.js'
import { adaptiveNutContactSizing } from '../launcher/adaptiveNutEngineering.js'
import { launchTrainOffsets } from '../launcher/launchAssemblyLayout.js'
import { lerp } from '../utils/math.js'
import { tetherFibers, coilConductorMaterials } from './parameterDefinitions.js'

export const parameterAliases = { launcherMassDriverForwardAcceleration: 'launchVehicleMassDriverForwardAcceleration', launcherRampUpwardAcceleration: 'launchVehicleRampUpwardAcceleration' }

// Holds every tunable parameter and the derived parameter set that subsystems consume.
//
//   store.definitions  { key: { value, units, ... } }  the authoritative values (a.k.a. guidParamWithUnits)
//   store.values       { key: value }                  live view used by lil-gui; reading/writing it
//                                                      reads/writes definitions[key].value directly
//   store.derived      { key: { value, units } }       what subsystems read (a.k.a. dParamWithUnits);
//                                                      refreshed by derive()
//
// There is a single copy of each value, so nothing ever needs to be synchronised by hand.
export class ParameterStore {
  constructor(definitions) {
    this.definitions = definitions
    this.derived = {}
    this.values = {}
    for (const key of Object.keys(definitions)) {
      Object.defineProperty(this.values, key, {
        enumerable: true,
        get: () => this.definitions[key].value,
        set: (v) => { this.definitions[key].value = v },
      })
    }
    this.derive()
  }

  get(key) {
    return this.definitions[parameterAliases[key] ?? key].value
  }

  set(key, value) {
    key = parameterAliases[key] ?? key
    if (!(key in this.definitions)) throw new Error(`Unknown parameter "${key}"`)
    this.definitions[key].value = value
  }

  // Recomputes the derived parameter set from the current values.
  derive() {
    const p = this.definitions
    const d = this.derived
    for (const [k, v] of Object.entries(p)) {
      if (v.autoMap) d[k] = { value: v.value, units: v.units }
    }
    if (d.spaceportRendezvousEnabled?.value) {
      const sizing = solveSpaceportSizing(d)
      d.launcherMassDriverExitVelocity = {value: sizing.entrySpeed, units: 'm/s'}
      d.launchVehicleRampUpwardAcceleration = {value: sizing.upwardAcceleration, units: 'm/s2'}
      d.launchVehicleDesiredOrbitalAltitude = {value: d.spaceportApogeeAltitude.value, units: 'm'}
    }
    if (p.adaptiveNutAutoSize?.value && p.launchTrajectorySelector.value !== 1) {
      const sizing = adaptiveNutContactSizing(d)
      // Zero force or disabled magnetic contact has no useful positive sizing result.
      if (Number.isFinite(sizing.grapplerPadContactLength) && sizing.grapplerPadContactLength > 0) {
        d.adaptiveNutBodyLength = {value:sizing.grapplerPadContactLength,units:'m'}
        d.adaptiveNutGrapplerLength = {value:sizing.grapplerPadContactLength,units:'m'}
        // Retain the configured pad density when contact sizing lengthens the nut.
        // An even count keeps a grappler centred on the screw's reference trajectory.
        const count = p.adaptiveNutNumGrapplers.value
        d.adaptiveNutNumGrapplers = {value:Math.max(count,2*Math.ceil(count*sizing.grapplerPadContactLength/p.adaptiveNutGrapplerLength.value/2)),units:''}
      }
    }
    d.launchVehicleForwardsOffset = {value:launchTrainOffsets(d).vehicleForward,units:'m'}
    d.launchSledBodyLength = { value: p.launchVehicleBodyLength.value * p.launchVehicleScaleFactor.value * 1.75, units: 'm' }
    if (p.launcherProportionalTubeRadius?.value) {
      const radius = p.launchVehicleRadius.value * p.launcherTubeRadiusToVehicleRadius.value
      for (const key of ['launcherMassDriverTubeInnerRadius', 'elevatedEvacuatedTubeInnerRadius', 'elevateEvacuatedTubeInnerRadius']) {
        d[key] = { value: radius, units: 'm' }
      }
    }
    d.equivalentLatitude = { value: p.equivalentLatitude.value / 180 * Math.PI, units: 'radians' }
    d.ringEccentricity = {
      value: lerp(p.buildLocationRingEccentricity.value, p.finalLocationRingEccentricity.value, p.moveRingFactor.value),
      units: '',
    }
    d.massDriverLength = {
      value: d.launcherMassDriverExitVelocity.value ** 2 / 2 / d.launchVehicleMassDriverForwardAcceleration.value,
      units: 'm',
    }

    const fiberSuffix = { [tetherFibers.CarbonFiber]: 'CarbonFiber', [tetherFibers.Graphene]: 'Graphene', [tetherFibers.Custom]: 'Custom' }[p.tetherFiber.value]
    for (const property of ['Density', 'TensileStrength', 'Cost']) {
      const source = p[`tetherFiber${property}${fiberSuffix}`]
      d[`tetherFiber${property}`] = { value: source.value, units: source.units }
    }

    const conductorSuffix = { [coilConductorMaterials.Copper]: 'Copper', [coilConductorMaterials.Aluminum]: 'Aluminum', [coilConductorMaterials.Custom]: 'Custom' }[p.coilConductorMaterial.value]
    for (const property of ['Resistivity', 'Density', 'Cost']) {
      const source = p[`coilConductorMaterial${property}${conductorSuffix}`]
      d[`coilConductorMaterial${property}`] = { value: source.value, units: source.units }
    }
    return d
  }

  // Plain { key: value } copy of every parameter, suitable for JSON.
  snapshot() {
    const out = {}
    for (const [k, v] of Object.entries(this.definitions)) out[k] = v.value
    return out
  }

  // Applies a snapshot. Unknown keys (e.g. from a newer/older version) are returned, not thrown.
  restore(snapshot) {
    const unknown = []
    for (const [oldKey, value] of Object.entries(snapshot)) {
      const k = parameterAliases[oldKey] ?? oldKey
      if (oldKey !== k && Object.hasOwn(snapshot, k)) continue
      if (k in this.definitions) this.definitions[k].value = value
      else unknown.push(k)
    }
    this.derive()
    return unknown
  }

  // Keys whose value differs from the given baseline snapshot.
  diff(baseline) {
    const out = {}
    for (const [k, v] of Object.entries(this.definitions)) {
      if (!Object.is(v.value, baseline[k])) out[k] = v.value
    }
    return out
  }
}
