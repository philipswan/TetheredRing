import { brakingProfile } from './trackBraking.js'

// An adaptive nut or launch sled that has stopped on the launcher's track falls back down it: it slides
// backwards from rest under gravity alone (the track is frictionless: it is levitated), from path distance
// `startDistance` to `endDistance` (< startDistance), where it disappears (underground).
//
// Gravity is the planet's alone, with no allowance for its rotation during the slow return.
//
//   radiusAt(s): distance from the planet's centre of the point at path distance `s`
//   mu:          the planet's gravitational parameter (m^3/s^2)
//
// Returns { duration (s), distanceAt(tau), speedAt(tau) } with tau the time since it started falling back
// (speedAt is the speed backwards along the path).
export function fallBackProfile({ startDistance, endDistance, radiusAt, mu, segments = 2000, minimumSpeed = 1 }) {
  const length = startDistance - endDistance
  if (!(length > 0)) return { duration: 0, distanceAt: () => startDistance, speedAt: () => 0 }
  const potential = (s) => -mu / radiusAt(s)   // per unit mass
  const p0 = potential(startDistance)
  // Sampled at even distances back from the start; between samples the acceleration is taken to be
  // constant, so a sample's time follows from the mean of its and the previous sample's speeds. (Where the
  // path behind it climbs higher than where it stopped, it could not get back; it creeps on at minimumSpeed.)
  const s = [startDistance], v = [0], t = [0]
  let creeping = false
  for (let i = 1; i <= segments; i++) {
    const si = startDistance - length * i / segments
    let vi = Math.sqrt(Math.max(0, 2 * (p0 - potential(si))))
    if (vi < minimumSpeed) {
      vi = minimumSpeed
      creeping = true
    }
    s.push(si)
    v.push(vi)
    t.push(t[i - 1] + 2 * (s[i - 1] - si) / (v[i - 1] + vi))
  }
  if (creeping) console.warn('fallBackProfile: the track climbs on the way back down; that part is crept over')
  const duration = t[segments]

  // The sample interval holding time `tau`, and the time into it.
  const locate = (tau) => {
    const tc = Math.max(0, Math.min(duration, tau))
    let low = 0, high = segments
    while (high - low > 1) {
      const mid = (low + high) >> 1
      if (t[mid] <= tc) low = mid
      else high = mid
    }
    const dt = t[low + 1] - t[low]
    const acceleration = dt > 0 ? (v[low + 1] - v[low]) / dt : 0
    return { k: low, tau: tc - t[low], acceleration }
  }
  const distanceAt = (tau) => {
    const { k, tau: x, acceleration } = locate(tau)
    return Math.max(endDistance, s[k] - (v[k] * x + acceleration * x * x / 2))
  }
  const speedAt = (tau) => {
    const { k, tau: x, acceleration } = locate(tau)
    return v[k] + acceleration * x
  }
  return { duration, distanceAt, speedAt }
}

// Coast under gravity, then brake on the final stretch to rest at the recovery point.
export function sledReturnProfile(options) {
  const { startDistance, endDistance, radiusAt, mu } = options
  const length = startDistance - endDistance
  if (!(length > 0)) return fallBackProfile(options)
  const brakingDistance = Math.min(1000, length / 4)
  const brakingStart = endDistance + brakingDistance
  const coast = fallBackProfile({ ...options, endDistance: brakingStart })
  const braking = brakingProfile({ initialSpeed: coast.speedAt(coast.duration),
    stopDistance: brakingDistance, radiusAt: s => radiusAt(brakingStart - s), mu })
  const duration = coast.duration + braking.duration
  return { duration, coastDuration: coast.duration, brakingDuration: braking.duration,
    distanceAt: t => t >= duration ? endDistance : t <= coast.duration
      ? coast.distanceAt(t) : brakingStart - braking.tTod(t - coast.duration),
    speedAt: t => t >= duration ? 0 : t <= coast.duration
      ? coast.speedAt(t) : braking.tTos(t - coast.duration) }
}

// Conservative headway: the next train's nose must not reach the recovery corridor
// until the returning object has stopped and despawned. Forward and return motion
// are monotone, so clearance at the return endpoint ensures clearance throughout.
export function recoveryHeadway({ returnEndTime, returnEndDistance, frontReach, outboundDuration, distanceAt }) {
  const limit = returnEndDistance - frontReach
  let lo = 0, hi = outboundDuration
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (distanceAt(mid) < limit) lo = mid
    else hi = mid
  }
  return Math.max(0, returnEndTime - lo)
}

// Locate a recovery point on a rising ramp by vertical drop from its top.
export function rampRecoveryDistance({ rampStart, rampEnd, radiusAt, drop = 300 }) {
  const target = radiusAt(rampEnd) - drop
  if (radiusAt(rampStart) > target) throw new Error(`The ramp needs at least ${drop} m of rise for sled recovery.`)
  let lo = rampStart, hi = rampEnd
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (radiusAt(mid) <= target) lo = mid
    else hi = mid
  }
  return lo
}
