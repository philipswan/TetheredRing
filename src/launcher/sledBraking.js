// The launch sled's braking run along the track inside the elevated evacuated tube.
//
// The sled couples the launch vehicle to the track, so it stays with the vehicle over the ramp (it is what
// lets the vehicle make the ramp's high-g turn). At the ramp's end the vehicle carries on along its ballistic
// trajectory, and the sled brakes on the track, which follows that trajectory inside the tube. It brakes at a
// constant rate, chosen so that the braking and gravity (the track climbs) together bring it to a stop
// `stopDistance` along the track.
//
// Speeds and distances are along the track, which is fixed to the planet; gravity is the planet's alone
// (as on the ramp, see launcherRamp.js), with no allowance for the planet's rotation.
//
//   initialSpeed: the sled's speed at the ramp's end (m/s)
//   stopDistance: how far along the track it must stop (m)
//   radiusAt(s):  distance from the planet's centre of the point `s` metres along the track
//   mu:           the planet's gravitational parameter (m^3/s^2)
//
// Returns { deceleration (the braking, m/s^2), stopDistance (where it actually stops: sooner, if gravity alone
// stops it), duration (s), tTod(t), tTos(t) } with t the time since the ramp's end.
export function sledBrakingProfile({ initialSpeed, stopDistance, radiusAt, mu, segments = 1000 }) {
  const potential = (s) => -mu / radiusAt(s)   // per unit mass
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
