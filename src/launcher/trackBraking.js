// Braking along the launcher's track: the adaptive nut after its drive tapers to zero on the ramp, and the
// launch sled along the track inside the elevated evacuated tube, once it has let the vehicle go at the top
// of the ramp. Each brakes at a constant rate, chosen so that the braking and gravity (the track climbs)
// together bring it to a stop `stopDistance` along the track. (Then it falls back: see fallBack.js.)
//
// Speeds and distances are along the track fixed to the planet. Optional omega includes the
// centrifugal potential in the launch plane; the normal Coriolis force does no work.
//
//   initialSpeed: its speed where it starts braking (m/s)
//   stopDistance: how far along the track it must stop (m)
//   radiusAt(s):  distance from the planet's centre of the point `s` metres along the track
//   mu:           the planet's gravitational parameter (m^3/s^2)
//
// Returns { deceleration (the braking, m/s^2), stopDistance (where it actually stops: sooner, if gravity alone
// stops it), duration (s), tTod(t), tTos(t) } with t the time since the ramp's end.
export function brakingProfile({ initialSpeed, stopDistance, radiusAt, mu, omega = 0, rotationPotentialAt = null, segments = 1000 }) {
  const potential = s => -mu / radiusAt(s) + (rotationPotentialAt ? rotationPotentialAt(s) : -0.5 * omega ** 2 * radiusAt(s) ** 2)   // per unit mass
  const p0 = potential(0)
  const deceleration = Math.max(0, (initialSpeed ** 2 / 2 - (potential(stopDistance) - p0)) / stopDistance)
  // Sampled at even distances; between samples the deceleration is taken to be constant, so a sample's
  // time follows from the mean of its and the previous sample's speeds.
  const s = [0], v = [initialSpeed], t = [0]
  for (let i = 1; i <= segments; i++) {
    const si = stopDistance * i / segments
    const vSquared = initialSpeed ** 2 - 2 * deceleration * si - 2 * (potential(si) - p0)
    const vi = (i === segments || !(vSquared > 0)) ? 0 : Math.sqrt(vSquared)
    const vSum = v[i - 1] + vi
    s.push(si)
    v.push(vi)
    t.push(t[i - 1] + (vSum > 0 ? 2 * (si - s[i - 1]) / vSum : 0))
    if (vi === 0) break
  }
  const last = s.length - 1
  const duration = t[last]

  // The sample interval holding time `time`, and the time into it.
  const locate = (time) => {
    const tc = Math.max(0, Math.min(duration, time))
    let low = 0, high = last
    while (high - low > 1) {
      const mid = (low + high) >> 1
      if (t[mid] <= tc) low = mid
      else high = mid
    }
    const dt = t[low + 1] - t[low]
    const acceleration = dt > 0 ? (v[low + 1] - v[low]) / dt : 0
    return { k: low, tau: tc - t[low], acceleration }
  }
  const tTod = (time) => {
    if (last === 0) return 0
    const { k, tau, acceleration } = locate(time)
    return Math.min(s[last], s[k] + v[k] * tau + acceleration * tau * tau / 2)
  }
  const tTos = (time) => {
    if (last === 0) return 0
    const { k, tau, acceleration } = locate(time)
    return Math.max(0, v[k] + acceleration * tau)
  }
  return { deceleration, stopDistance: s[last], duration, tTod, tTos }
}


// Smooth screw-applied braking, with quadratic ease-in/out and peak |d(braking)/dt| = jerk.
// Both peak braking and plateau time are solved: simply easing the old constant braking value
// would overshoot. Gravity/rotation act throughout; Coriolis is normal to motion and does no work.
export function jerkLimitedBrakingProfile({ initialSpeed, stopDistance, radiusAt, mu, omega = 0, rotationPotentialAt = null, jerk, segments = 1000 }) {
  if (![initialSpeed, stopDistance, mu, omega, jerk].every(Number.isFinite) || initialSpeed <= 0 || stopDistance <= 0 || mu < 0 || jerk <= 0 || !Number.isInteger(segments) || segments < 3) {
    throw new Error('Invalid jerk-limited braking parameters.')
  }
  const potential = s => -mu / radiusAt(s) + (rotationPotentialAt ? rotationPotentialAt(s) : -0.5 * omega ** 2 * radiusAt(s) ** 2)
  const p0 = potential(0), spacing = stopDistance / segments
  const energy = Array.from({ length: segments + 1 }, (_, i) => potential(i * spacing) - p0)
  if (!energy.every(Number.isFinite)) throw new Error('Non-finite track potential in adaptive nut braking.')
  // If gravity alone stops the nut sooner, there is no screw braking to ramp.
  if (energy.at(-1) >= initialSpeed ** 2 / 2) {
    const coast = brakingProfile({ initialSpeed, stopDistance, radiusAt, mu, omega, rotationPotentialAt, segments })
    return { ...coast, jerk, rampTime: 0, holdTime: 0, brakingAt: () => 0,
      samples: Array.from({ length: segments + 1 }, (_, i) => {
        const t = coast.duration * i / segments
        return { t, s: coast.tTod(t), v: coast.tTos(t) }
      }) }
  }
  // Interpolate potential with Hermite slopes. Its derivative is continuous, so the numerical
  // gravity field introduces no acceleration steps while the jerk-limited brake is acting.
  const slope = energy.map((_, i) => i === 0 ? (-3 * energy[0] + 4 * energy[1] - energy[2]) / (2 * spacing)
    : i === segments ? (3 * energy[i] - 4 * energy[i - 1] + energy[i - 2]) / (2 * spacing)
      : (energy[i + 1] - energy[i - 1]) / (2 * spacing))
  const gravity = s => {
    const position = Math.max(0, Math.min(stopDistance, s)) / spacing
    const i = Math.min(segments - 1, Math.floor(position)), u = position - i
    const delta = (energy[i + 1] - energy[i]) / spacing
    return slope[i] + u * (2 * (3 * delta - 2 * slope[i] - slope[i + 1]) + u * 3 * (-2 * delta + slope[i] + slope[i + 1]))
  }
  const ease = u => u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2
  const brake = (time, peak, duration) => {
    const ramp = 2 * peak / jerk
    if (!(ramp > 0) || time <= 0 || time >= duration) return 0
    if (time < ramp) return peak * ease(time / ramp)
    if (time > duration - ramp) return peak * ease((duration - time) / ramp)
    return peak
  }
  const integrate = (peak, duration, keep = false) => {
    let t = 0, s = 0, v = initialSpeed
    const ramp = 2 * peak / jerk
    // Split at each change of polynomial so the quadratic jerk ramps are integrated accurately.
    const boundaries = [...new Set([ramp / 2, ramp, duration - ramp, duration - ramp / 2, duration])].filter(t => t > 0 && t <= duration).sort((a, b) => a - b)
    const samples = []
    const save = () => samples.push({ t, s, v, a: -brake(t, peak, duration) - gravity(s) })
    if (keep) save()
    const step = duration / (keep ? 1600 : 400)
    for (const end of boundaries) {
      while (t < end - 1e-12) {
        const h = Math.min(step, end - t)
        const a1 = -brake(t, peak, duration) - gravity(s)
        const v2 = v + h * a1 / 2, s2 = s + h * v / 2
        const a2 = -brake(t + h / 2, peak, duration) - gravity(s2)
        const v3 = v + h * a2 / 2, s3 = s + h * v2 / 2
        const a3 = -brake(t + h / 2, peak, duration) - gravity(s3)
        const v4 = v + h * a3, s4 = s + h * v3
        const a4 = -brake(t + h, peak, duration) - gravity(s4)
        s += h * (v + 2 * v2 + 2 * v3 + v4) / 6
        v += h * (a1 + 2 * a2 + 2 * a3 + a4) / 6
        t += h
        if (keep) save()
      }
    }
    return { s, v, samples }
  }
  // The shortest member of this family has no constant-braking plateau. If it does not fit,
  // increasing peak braking alone cannot fix it: its jerk-limited ramps would also get longer.
  let low = 0, high = Math.sqrt(8 * initialSpeed / jerk)
  for (let i = 0; integrate(jerk * high / 4, high).v > 0; i++) {
    if (i > 30) throw new Error('Could not solve the adaptive nut stopping time.')
    high *= 2
  }
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2
    if (integrate(jerk * middle / 4, middle).v > 0) low = middle; else high = middle
  }
  const minimumTime = high, minimumDistance = integrate(jerk * high / 4, high).s
  if (minimumDistance > stopDistance + 1e-5) throw new Error(`adaptiveNutDecelerationJerk is too low to stop on the ramp: at least ${Math.ceil(minimumDistance)} m is needed, with ${Math.floor(stopDistance)} m available. Increase the jerk or extend the ramp.`)
  const atDuration = duration => {
    let lo = 0, hi = jerk * duration / 4
    for (let i = 0; i < 40; i++) {
      const peak = (lo + hi) / 2
      if (integrate(peak, duration).v > 0) lo = peak; else hi = peak
    }
    const peak = (lo + hi) / 2
    return { peak, ...integrate(peak, duration) }
  }
  low = minimumTime
  high = Math.max(minimumTime, 2 * stopDistance / initialSpeed)
  for (let i = 0; atDuration(high).s < stopDistance; i++) {
    if (i > 30) throw new Error('Could not solve adaptive nut braking within the ramp.')
    high *= 1.25
  }
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2
    if (atDuration(middle).s < stopDistance) low = middle; else high = middle
  }
  const duration = (low + high) / 2, { peak } = atDuration(duration)
  const { samples } = integrate(peak, duration, true)
  const last = samples.at(-1)
  if (Math.abs(last.s - stopDistance) > 0.001 || Math.abs(last.v) > 0.001) throw new Error('Adaptive nut braking failed its stopping check; increase the ramp length or jerk.')
  last.s = stopDistance; last.v = 0
  const atTime = time => {
    const t = Math.max(0, Math.min(duration, time))
    let lo = 0, hi = samples.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].t <= t) lo = m; else hi = m }
    const a = samples[lo], b = samples[hi], h = b.t - a.t, u = (t - a.t) / h
    // Quintic distance interpolation matches velocity and acceleration at both ends.
    const c1 = a.v * h, c2 = a.a * h * h / 2
    const delta = b.s - a.s - c1 - c2, dv = b.v * h - c1 - 2 * c2, da = (b.a - a.a) * h * h
    const c3 = 10 * delta - 4 * dv + da / 2, c4 = -15 * delta + 7 * dv - da, c5 = 6 * delta - 3 * dv + da / 2
    return { s: Math.max(0, Math.min(stopDistance, a.s + u * (c1 + u * (c2 + u * (c3 + u * (c4 + u * c5)))))),
      v: t >= duration ? 0 : Math.max(0, (c1 + u * (2 * c2 + u * (3 * c3 + u * (4 * c4 + 5 * c5 * u)))) / h) }
  }
  return { deceleration: peak, jerk, stopDistance, duration, rampTime: 2 * peak / jerk,
    holdTime: Math.max(0, duration - 4 * peak / jerk), samples,
    brakingAt: t => brake(t, peak, duration), tTod: t => atTime(t).s, tTos: t => atTime(t).v }
}
