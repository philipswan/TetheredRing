// The physics behind the launch vehicle's glow (drawn by LaunchVehicleGlow.js): the hot gas over the
// hull (the plasma sheath), in its wake (the plasma trail), and the hydrolox exhaust plume. Pure
// functions of SI quantities, so the glow, like everything animated, is a function of the parameters
// and the time. Light is in display units: the shaders show light L as 1 - exp(-L).
//
// The trail and plume are drawn as tubes of light with a Gaussian cross-section (src/scene/GlowTube.js).
// Each point along a tube has a radius sigma (m, where the light has fallen to 1/e of the centre's) and a
// line emission (display units x m: the light of a metre of the tube); its emissivity at the centre is
// the line emission over pi sigma^2, so light that spreads out (a widening wake) keeps its total and dims.

// The shock layer's emission: as the radiative heating at the nose (calculateQRad in launcherPhysics.js,
// rho v^4), relative to 7.6 km/s through air at 30 km (0.0184 kg/m^3). It falls with the density as the
// vehicle climbs, by about 100 times between leaving the tube at 32 km and 65 km.
export const PLASMA_REFERENCE_SPEED = 7600      // m/s
export const PLASMA_REFERENCE_DENSITY = 0.0184  // kg/m^3

export function shockLayerEmission(airSpeed, airDensity) {
  if (!(airSpeed > 0) || !(airDensity > 0)) return 0
  return (airSpeed / PLASMA_REFERENCE_SPEED) ** 4 * (airDensity / PLASMA_REFERENCE_DENSITY)
}

// Line emission (display units x m) of the wake as it leaves the base, and emissivity (display units
// per metre of path) of the hot boundary layer on the body, at the reference shock-layer emission.
const PLASMA_LINE_EMISSION = 1.2
const SHEATH_EMISSIVITY = 0.35

// The hot gas around a slender body at hypersonic speed is not behind its shock, which is attached and
// weak (at Mach 25 a 3 degree cone's shock has a normal Mach number of about 1.3), but in its boundary
// layer, heated by friction towards the flow's stagnation temperature (thousands of kelvin). It is a
// skin over the hull, thinnest and hottest at the nose (turbulent: thickness 0.37 x Re_x^-0.2), which
// leaves the base as the core of the wake.
const AIR_VISCOSITY = 1.6e-5   // Pa s, near enough between 30 and 80 km

export function boundaryLayerThickness(x, airSpeed, airDensity) {
  if (!(x > 0) || !(airSpeed > 0) || !(airDensity > 0)) return 0
  const reynolds = airDensity * airSpeed * x / AIR_VISCOSITY
  return 0.37 * x * Math.max(reynolds, 1e3) ** -0.2
}

// Spreading of the far wake: its radius grows as the cube root of the distance behind the vehicle times
// the vehicle's drag area (the classic hypersonic far wake, b ~ k (Cd A x)^(1/3)), from the boundary
// layer's gas leaving the base, about WAKE_CORE body radii across.
const WAKE_SPREAD = 0.8
const WAKE_CORE = 0.45

// Radius (sigma, m) of the wake `x` metres behind the base.
export function plasmaWakeRadius(x, { bodyRadius, dragArea }) {
  return Math.cbrt((WAKE_CORE * bodyRadius) ** 3 + WAKE_SPREAD ** 3 * dragArea * Math.max(0, x))
}

// Colours of the plasma: the boundary layer and the young wake are white-hot with the pink of excited
// nitrogen and oxygen; the wake cools through orange to a dull red. `u` is the age over the cooling time.
export const PLASMA_HOT = [1.0, 0.78, 0.95]
const PLASMA_WARM = [1.0, 0.5, 0.25]
const PLASMA_COOL = [0.85, 0.2, 0.08]

export function plasmaWakeColour(u, out = [0, 0, 0]) {
  const a = Math.min(1, u)                         // hot -> warm over the first cooling time
  const b = Math.min(1, Math.max(0, (u - 1) / 2))  // warm -> cool over the next two
  for (let i = 0; i < 3; i++) {
    const c = PLASMA_HOT[i] + (PLASMA_WARM[i] - PLASMA_HOT[i]) * a
    out[i] = c + (PLASMA_COOL[i] - c) * b
  }
  return out
}

// The wake at one point of the trail. `age` (s) is how long ago the base passed it, `x` (m) how far
// behind the base it is now, `emission` the shock-layer emission (shockLayerEmission) when the vehicle
// passed it, `coolingTime` (s) the wake's e-folding time. Writes the line emission (RGB, display units
// x m) into `rgb` and returns the radius.
export function plasmaTrailPoint(age, x, emission, coolingTime, shape, brightness, rgb) {
  plasmaWakeColour(age / coolingTime, rgb)
  // (The hot gas comes off the edge of the base and meets on the axis about a body radius behind it.)
  const neck = 1 - Math.exp(-Math.max(0, x) / shape.bodyRadius)
  const k = PLASMA_LINE_EMISSION * brightness * emission * Math.exp(-age / coolingTime) * neck
  for (let i = 0; i < 3; i++) rgb[i] *= k
  return plasmaWakeRadius(x, shape)
}

// Emissivity (RGB, display units per metre of path) of the boundary layer at the base; it rises towards
// the nose (see plasmaSheath.frag.glsl).
export function sheathEmissivity(emission, brightness, rgb) {
  const k = SHEATH_EMISSIVITY * brightness * emission
  for (let i = 0; i < 3; i++) rgb[i] = k * PLASMA_HOT[i]
  return rgb
}

// ---- Exhaust plume -------------------------------------------------------------------------------

// Hydrolox exhaust: ratio of specific heats, and the colour of its faint blue-violet core and of the
// white of a Mach disk.
export const HYDROLOX_GAMMA = 1.2
const PLUME_CORE = [0.55, 0.62, 1.0]
const PLUME_DISK = [1.0, 0.9, 0.82]
const PLUME_LINE_EMISSION = 0.8   // display units x m at the reference mass flow rate
const PLUME_MAX_LENGTH = 400      // m: how far behind the nozzle the plume is drawn, at most

// Prandtl-Meyer function (rad): the angle a supersonic flow turns through expanding from Mach 1 to M.
export function prandtlMeyer(M, gamma = HYDROLOX_GAMMA) {
  if (!(M > 1)) return 0
  const g = (gamma + 1) / (gamma - 1)
  const m = Math.sqrt(M * M - 1)
  return Math.sqrt(g) * Math.atan(m / Math.sqrt(g)) - Math.atan(m)
}

// Supersonic Mach number of the flow through a nozzle of exit-to-throat area ratio `areaRatio`.
export function machFromAreaRatio(areaRatio, gamma = HYDROLOX_GAMMA) {
  const f = (M) => (1 / M) * ((2 / (gamma + 1)) * (1 + (gamma - 1) / 2 * M * M)) ** ((gamma + 1) / (2 * (gamma - 1)))
  if (!(areaRatio > 1)) return 1
  let lo = 1, hi = 50
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < areaRatio) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// Static over stagnation pressure at Mach M (isentropic).
export function isentropicPressureRatio(M, gamma = HYDROLOX_GAMMA) {
  return (1 + (gamma - 1) / 2 * M * M) ** (-gamma / (gamma - 1))
}

// The shape and light of the exhaust plume, from the engine and the air around the vehicle:
//   engine: { exitRadius, throatRadius, lipAngle (rad), chamberPressure (Pa), referenceMassFlowRate }
//   flow:   { massFlowRate (kg/s), exhaustVelocity (m/s), ambientPressure (Pa), airDensity, airSpeed,
//             wakeRadius (m: the vehicle's shock layer at its base, which shields the plume) }
// Returns null when the engine is off, else { length, radiusAt(x), lineEmissionAt(x, rgb) } for x metres
// behind the nozzle.
//
// - The exhaust leaves the nozzle at the exit Mach number of its area ratio. Into lower pressure it
//   expands round the nozzle's lip by the Prandtl-Meyer angle to the Mach number at which it matches the
//   air's pressure: a few tens of degrees as the vehicle leaves the tube, up to the limit in vacuum.
// - It spreads until the oncoming air confines it, where its thrust balances the dynamic pressure on its
//   cross-section, or to the base's wake when that is wider. Above most of the air nothing confines it
//   and it balloons, which is how high-altitude plumes look; its light thins out with its area.
// - Its light fades over a few Mach-disk distances (0.67 throat diameters x sqrt(chamber / ambient
//   pressure), the usual correlation for an underexpanded jet). The Mach disk itself is a bright band
//   while it is close enough to the nozzle to be seen (pressure ratios up to about 10^4).
export function exhaustPlume(engine, flow, brightness = 1) {
  const { exitRadius, throatRadius, lipAngle, chamberPressure, referenceMassFlowRate } = engine
  const { massFlowRate, exhaustVelocity, ambientPressure, airDensity, airSpeed, wakeRadius } = flow
  if (!(massFlowRate > 0) || !(exitRadius > 0)) return null
  const gamma = HYDROLOX_GAMMA
  const areaRatio = (exitRadius / throatRadius) ** 2
  const exitMach = machFromAreaRatio(areaRatio, gamma)
  const exitPressure = chamberPressure * isentropicPressureRatio(exitMach, gamma)
  const pa = Math.max(ambientPressure, 1e-6)

  // Expansion angle of the plume's boundary at the lip
  const stagnation = 1 + (gamma - 1) / 2 * exitMach * exitMach
  const boundaryMach = Math.sqrt(Math.max(0, (stagnation * (exitPressure / pa) ** ((gamma - 1) / gamma) - 1) * 2 / (gamma - 1)))
  const turning = prandtlMeyer(Math.max(boundaryMach, 1), gamma) - prandtlMeyer(exitMach, gamma)
  const angle = Math.min(80 * Math.PI / 180, Math.max(2 * Math.PI / 180, lipAngle + turning))

  // How far it is drawn and where the Mach disk is
  const machDisk = 0.67 * 2 * throatRadius * Math.sqrt(chamberPressure / pa)
  const length = Math.min(PLUME_MAX_LENGTH, Math.max(6 * exitRadius, 2.5 * machDisk))
  const diskStrength = Math.min(1, Math.max(0, (4.5 - Math.log10(chamberPressure / pa)) / 1.5))
  const diskWidth = 0.12 * machDisk

  // Widest radius: confined by the oncoming air (thrust over dynamic pressure), or the wake's
  const thrust = massFlowRate * exhaustVelocity
  const q = 0.5 * Math.max(0, airDensity) * airSpeed * airSpeed
  const confined = q > 0 ? Math.sqrt(thrust / (Math.PI * q)) : Infinity
  const widest = Math.max(exitRadius * 1.05, Math.min(Math.max(confined, wakeRadius), length * Math.tan(angle)))
  const spread = widest - exitRadius
  const slope = Math.tan(angle)

  const k = PLUME_LINE_EMISSION * brightness * massFlowRate / Math.max(1e-9, referenceMassFlowRate)
  return {
    length,
    radiusAt(x) {
      return exitRadius + spread * (1 - Math.exp(-x * slope / spread))
    },
    lineEmissionAt(x, rgb) {
      const core = Math.exp(-3 * x / length) * (1 - x / length)
      const disk = diskStrength > 0 && diskWidth > 0 ? 4 * diskStrength * Math.exp(-(((x - machDisk) / diskWidth) ** 2)) : 0
      for (let i = 0; i < 3; i++) rgb[i] = k * (core * PLUME_CORE[i] + disk * PLUME_DISK[i])
      return rgb
    },
  }
}
