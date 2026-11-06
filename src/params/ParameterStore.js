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
