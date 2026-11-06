// A ramp designed from the passenger's specific force (a_inertial - gravity), rather than a circle.
// In the launch plane, theta is the load angle from the vehicle's nose toward its roof.
// See MIT OCW 8.01, chapter 31 for the rotating-frame acceleration transformation.
export const easeQuadInOut = u => { u = Math.max(0, Math.min(1, u)); return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2 }

export function interpolateSamples(samples, key, value) {
  let lo = 0, hi = samples.length - 1
  if (value <= samples[0][key]) return { ...samples[0] }
  if (value >= samples[hi][key]) return { ...samples[hi] }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m][key] <= value) lo = m; else hi = m }
  const u = (value - samples[lo][key]) / (samples[hi][key] - samples[lo][key])
  return Object.fromEntries(Object.keys(samples[lo]).map(k => [k, samples[lo][k] + u * (samples[hi][k] - samples[lo][k])]))
}

export function designRamp({ radius, exitRadius, entrySpeed, forwardAcceleration, upwardAcceleration,
  transitionSeconds = 2, upwardJerk = 240, mu, omega = 0, rotation = null, maxStep = 0.02 }) {
  if (![radius, exitRadius, entrySpeed, forwardAcceleration, upwardAcceleration, transitionSeconds, upwardJerk, mu, omega, maxStep].every(Number.isFinite) ||
      radius <= 0 || entrySpeed <= 0 || forwardAcceleration <= 0 || upwardAcceleration <= 0 || transitionSeconds <= 0 || upwardJerk <= 0 || mu <= 0 || maxStep <= 0 || exitRadius < radius ||
      (rotation !== null && (!Array.isArray(rotation) || rotation.length !== 3 || !rotation.every(Number.isFinite)))) throw new Error('Invalid ramp design parameters.')
  // Components are in the orthonormal basis (entry radial, entry downrange, launch-plane axis).
  // Keeping all three axes lets the ramp ease away lateral rotational support as well as upward load.
  const w = rotation ?? [0, 0, omega]
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const plus = (a, b, scale = 1) => a.map((x, i) => x + scale * b[i])
  const unit = a => { const n = Math.hypot(...a); return a.map(x => x / n) }
  const gravity = position => position.map(x => -mu * x / Math.hypot(...position) ** 3)
  const initialPosition = [radius, 0, 0], initialVelocity = [0, entrySpeed, 0]
  let initialForce = [-(entrySpeed ** 2) / radius, forwardAcceleration, 0]
  initialForce = plus(plus(plus(initialForce, cross(w, initialVelocity), 2), cross(w, cross(w, initialPosition))), gravity(initialPosition), -1)
  const initialMagnitude = Math.hypot(...initialForce)
  const initialAngle = Math.acos(Math.max(-1, Math.min(1, initialForce[0] / initialMagnitude)))
  const transverseMagnitude = Math.hypot(initialForce[1], initialForce[2])
  const transverse = unit([0, initialForce[1], initialForce[2]])
  // An elliptical force envelope keeps forward drive monotonic while the direction follows its
  // prescribed easing. Calibrate the ellipse to pass through the entry support load.
  const horizontalAxis = initialForce[0] > 0 && initialForce[0] < upwardAcceleration
    ? transverseMagnitude / Math.sqrt(1 - (initialForce[0] / upwardAcceleration) ** 2) : transverseMagnitude
  // The maximum slope of easeQuadInOut is 2. This makes the peak release jerk exactly upwardJerk.
  const releaseSeconds = 2 * upwardAcceleration / upwardJerk
  const forceAt = (t, hold, position, velocity) => {
    const tangent = unit(velocity)
    const radial = unit(position)
    const normal = unit(plus(radial, tangent, -dot(radial, tangent)))
    const axis = cross(normal, tangent)
    const e = easeQuadInOut(t / transitionSeconds)
    const angle = initialAngle * (1 - e)
    let magnitude
    if (t < transitionSeconds) {
      // At super-orbital speeds initial support points downward. Hold forward drive while that
      // component passes zero; its removal produces the unavoidable small initial magnitude dip.
      magnitude = angle > Math.PI / 2 ? transverseMagnitude / Math.sin(angle)
        : 1 / Math.hypot(Math.sin(angle) / horizontalAxis, Math.cos(angle) / upwardAcceleration)
    } else magnitude = upwardAcceleration * (1 - easeQuadInOut((t - transitionSeconds - hold) / releaseSeconds))
    const forward = t < transitionSeconds ? magnitude * Math.sin(angle) * transverse[1] : 0
    const upward = magnitude * Math.cos(angle)
    const sideways = t < transitionSeconds ? magnitude * Math.sin(angle) * transverse[2] : 0
    const force = plus(plus(normal.map(x => x * upward), tangent, forward), axis, sideways)
    return { force, forward, upward, magnitude, angle: magnitude > 1e-7 ? Math.atan2(upward, forward) : Math.PI / 2 }
  }
  const integrate = (hold, keep = false) => {
    let state = [...initialPosition, ...initialVelocity, 0]
    let t = 0
    const samples = []
    const derivative = (time, y) => {
      const position = y.slice(0, 3), velocity = y.slice(3, 6)
      const f = forceAt(time, hold, position, velocity)
      const acceleration = plus(plus(plus(f.force, gravity(position)), cross(w, velocity), -2), cross(w, cross(w, position)), -1)
      return [...velocity, ...acceleration, Math.hypot(...velocity)]
    }
    const end = transitionSeconds + hold + releaseSeconds
    const save = () => {
      const position = state.slice(0, 3), velocity = state.slice(3, 6)
      const rad = Math.hypot(...position), speed = Math.hypot(...velocity)
      const f = forceAt(t, hold, position, velocity)
      const derivativeNow = derivative(t, state)
      samples.push({ t, s: state[6], r: rad, phi: Math.atan2(state[1], state[0]), v: speed,
        gamma: Math.asin(Math.max(-1, Math.min(1, dot(position, velocity) / (rad * speed)))),
        px: state[0], py: state[1], pz: state[2], vx: state[3], vy: state[4], vz: state[5],
        ax: derivativeNow[3], ay: derivativeNow[4], az: derivativeNow[5], vd: dot(velocity, derivativeNow.slice(3, 6)) / speed, fx: f.force[0], fy: f.force[1], fz: f.force[2], forward: f.forward, upward: f.upward, magnitude: f.magnitude, angle: f.angle })
    }
    if (keep) save()
    while (t < end - 1e-10) {
      const nextBoundary = t < transitionSeconds - 1e-10 ? transitionSeconds : t < transitionSeconds + hold - 1e-10 ? transitionSeconds + hold : end
      const h = Math.min(maxStep, end - t, nextBoundary - t)
      const k1 = derivative(t, state)
      const k2 = derivative(t + h / 2, state.map((x, i) => x + h * k1[i] / 2))
      const k3 = derivative(t + h / 2, state.map((x, i) => x + h * k2[i] / 2))
      const k4 = derivative(t + h, state.map((x, i) => x + h * k3[i]))
      state = state.map((x, i) => x + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6)
      t += h
      if (!state.every(Number.isFinite) || Math.hypot(...state.slice(3, 6)) < 1 || t > 1000) throw new Error('The selected ramp cannot be reached at this entry speed and acceleration.')
      if (keep) save()
    }
    return { radius: Math.hypot(...state.slice(0, 3)), samples, duration: end }
  }
  // Both finite-duration transitions must fit before the requested exit altitude.
  if (integrate(0).radius > exitRadius + 1e-5) {
    throw new Error('The ramp is too short for the requested acceleration transitions. Raise its exit altitude, shorten launchVehicleAccelerationTransitionTime, or increase launcherMassDriverUpwardJerk.')
  }
  let lo = 0, hi = 1
  while (integrate(hi).radius < exitRadius && hi < 512) hi *= 2
  for (let i = 0; i < 35; i++) { const m = (lo + hi) / 2; if (integrate(m).radius < exitRadius) lo = m; else hi = m }
  const hold = (lo + hi) / 2
  const result = integrate(hold, true)
  const atTime = time => {
    const t = Math.max(0, Math.min(result.duration, time))
    let lo = 0, hi = result.samples.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (result.samples[m].t <= t) lo = m; else hi = m }
    const a = result.samples[lo], b = result.samples[hi], h = b.t - a.t, u = (t - a.t) / h
    // Quintic Hermite interpolation preserves position, velocity AND acceleration at every sample.
    const hermite = (p0, v0, a0, p1, v1, a1) => {
      const c0 = p0, c1 = v0 * h, c2 = a0 * h * h / 2
      const d = p1 - p0 - c1 - c2, dv = v1 * h - c1 - 2 * c2, da = (a1 - a0) * h * h
      const c3 = 10 * d - 4 * dv + da / 2, c4 = -15 * d + 7 * dv - da, c5 = 6 * d - 3 * dv + da / 2
      return [c0 + u * (c1 + u * (c2 + u * (c3 + u * (c4 + u * c5)))),
        (c1 + u * (2 * c2 + u * (3 * c3 + u * (4 * c4 + 5 * c5 * u)))) / h]
    }
    const position = [], velocity = []
    for (const k of ['x', 'y', 'z']) {
      const pv = hermite(a['p' + k], a['v' + k], a['a' + k], b['p' + k], b['v' + k], b['a' + k])
      position.push(pv[0]); velocity.push(pv[1])
    }
    const sv = hermite(a.s, a.v, a.vd, b.s, b.v, b.vd)
    const rad = Math.hypot(...position), v = Math.hypot(...velocity), f = forceAt(t, hold, position, velocity)
    return { t, s: sv[0], r: rad, v, phi: Math.atan2(position[1], position[0]),
      gamma: Math.asin(Math.max(-1, Math.min(1, dot(position, velocity) / (rad * v)))),
      px: position[0], py: position[1], pz: position[2], vx: velocity[0], vy: velocity[1], vz: velocity[2],
      fx: f.force[0], fy: f.force[1], fz: f.force[2], forward: f.forward, upward: f.upward, magnitude: f.magnitude, angle: f.angle }
  }
  const atDistance = distance => {
    const s = Math.max(0, Math.min(result.samples.at(-1).s, distance))
    let t = interpolateSamples(result.samples, 's', s).t
    for (let i = 0; i < 3; i++) { const a = atTime(t); t -= (a.s - s) / Math.max(1, a.v) }
    return atTime(t)
  }
  return { samples: result.samples, duration: result.duration, length: result.samples.at(-1).s,
    downrangeAngle: result.samples.at(-1).phi, exitSpeed: result.samples.at(-1).v, exitAngle: result.samples.at(-1).gamma,
    transitionSeconds, releaseSeconds, holdSeconds: hold, peakUpwardAcceleration: upwardAcceleration,
    detach: atTime(transitionSeconds), atTime, atDistance }
}


// The nut time law measured from the first horizontal screw, shared with geometry workers.
// Hermite distance/time interpolation keeps thread phase and lead consistent with each other even
// near the braking end, where linear interpolation of distance would produce a large phase error.
function nutInterval(samples, key, value) {
  let lo = 0, hi = samples.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m][key] <= value) lo = m; else hi = m }
  return [samples[lo], samples[hi]]
}
function nutStateBetween(a, b, time) {
  const h = b.t - a.t, u = Math.max(0, Math.min(1, (time - a.t) / h))
  let c1 = a.v * h, c2, c3, c4 = 0, c5 = 0
  if (Number.isFinite(a.a) && Number.isFinite(b.a)) {
    c2 = a.a * h * h / 2
    const delta = b.s - a.s - c1 - c2, dv = b.v * h - c1 - 2 * c2, da = (b.a - a.a) * h * h
    c3 = 10 * delta - 4 * dv + da / 2; c4 = -15 * delta + 7 * dv - da; c5 = 6 * delta - 3 * dv + da / 2
  } else {
    const delta = b.s - a.s
    c2 = 3 * delta - (2 * a.v + b.v) * h; c3 = -2 * delta + (a.v + b.v) * h
  }
  return { t: a.t + u * h, s: a.s + u * (c1 + u * (c2 + u * (c3 + u * (c4 + u * c5)))),
    v: Math.max(0, (c1 + u * (2 * c2 + u * (3 * c3 + u * (4 * c4 + 5 * c5 * u)))) / h),
    a: (2 * c2 + u * (6 * c3 + u * (12 * c4 + 20 * c5 * u))) / (h * h) }
}
export function screwStateAtTime(motion, t) {
  const { initialVelocity: v0, acceleration: a, samples } = motion
  if (t < 0) return { t, s: v0 * t, v: v0 }
  if (t <= motion.horizontalTime) return { t, s: v0 * t + a * t * t / 2, v: Math.max(1, v0 + a * t) }
  if (t >= samples.at(-1).t) return { ...samples.at(-1) }
  const [before, after] = nutInterval(samples, 't', t)
  return nutStateBetween(before, after, t)
}
export function screwStateAtDistance(motion, s) {
  const { initialVelocity: v0, acceleration: a, samples } = motion
  if (s < 0) return { s, t: s / v0, v: v0 }
  if (s <= motion.horizontalLength) {
    const v = Math.sqrt(Math.max(1, v0 * v0 + 2 * a * s))
    return { s, v, t: 2 * s / (v0 + v) }
  }
  if (s >= samples.at(-1).s) return { ...samples.at(-1) }
  const [before, after] = nutInterval(samples, 's', s)
  let t = before.t + (after.t - before.t) * (s - before.s) / (after.s - before.s)
  for (let i = 0; i < 6; i++) {
    const state = nutStateBetween(before, after, t)
    t = Math.max(before.t, Math.min(after.t, t - (state.s - s) / Math.max(1e-6, state.v)))
  }
  return nutStateBetween(before, after, t)
}


// Pick a deterministic geometry anchor on the same ramp branch as the nut. A speed occurs once
// while accelerating and again while braking; the horizontal inverse is wrong for the latter.
export function screwGeometryDistance(motion, speed, distance) {
  if (distance < motion.horizontalLength) return Math.max(0, (speed * speed - motion.initialVelocity ** 2) / (2 * motion.acceleration))
  const braking = distance >= motion.brakingStartDistance
  const samples = motion.samples.filter(a => braking ? a.s >= motion.brakingStartDistance - 1e-6 : a.s <= motion.brakingStartDistance + 1e-6)
  let best = samples.reduce((a, b) => Math.abs(a.v - speed) <= Math.abs(b.v - speed) ? a : b)
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i]
    if ((a.v - speed) * (b.v - speed) > 0) continue
    let lo = a.t, hi = b.t
    const increasing = b.v >= a.v
    for (let j = 0; j < 35; j++) {
      const mid = (lo + hi) / 2
      if ((screwStateAtTime(motion, mid).v < speed) === increasing) lo = mid; else hi = mid
    }
    const candidate = screwStateAtTime(motion, (lo + hi) / 2)
    if (Math.abs(candidate.v - speed) < Math.abs(best.v - speed) + 1e-9) best = candidate
  }
  return best.s
}
