// Interpolates a shot's camera keyframes at an arbitrary (video) time.
//
// 'smooth' is a cubic Hermite spline through the keyframes, with non-uniform Catmull-Rom tangents
// (the slope of the parabola through each key and its neighbours, weighted by the keyframe *times*),
// so the camera passes through every keyframe exactly when it was set and moves without speed jumps.
// A keyframe with `ease: true` has zero velocity there (the camera eases in and out of it).
// 'linear' is used for densely sampled paths recorded from a live take.
//
// Each segment (from keyframe i to i+1) moves the camera in one of two ways, chosen by keyframe i's
// `motion`:
//   'direct' - the camera position and its target each follow the spline. A fly-by stays a straight
//              line past the target.
//   'orbit'  - the target follows the spline; the camera is placed from the target by a direction and
//              a distance, with the *logarithm* of the distance on the spline. A zoom from 50 m to
//              30,000 km then takes equal time per factor of ten instead of leaving the subject at
//              thousands of km/s. While the distance changes, the target moves in proportion to the
//              distance (not to time), so a subject stays in frame while the camera pulls away from it.
//   'auto'   - (the default) 'orbit' where the camera's distance to its target changes by more than
//              ORBIT_RATIO over the segment, or the direction it views its target from turns by more
//              than ORBIT_ANGLE (a move round the subject), otherwise 'direct'.
//
// Keyframes may be relative to moving objects (see Anchors.js). The caller passes `resolve(key)`,
// which returns the key's world-space pose *at the current simulation time*; every keyframe the
// spline needs is resolved at that same moment. Where neighbouring keys share an anchor this is the
// same as interpolating in the anchor's frame, so a camera keyed to a vehicle rides along with it.
// A keyframe's tangent only uses neighbours tied to the same objects: a world-fixed neighbour of a
// keyframe that rides with a rocket would otherwise lend the rocket's ground speed to the spline, and
// the camera would swing kilometres away between two keyframes that are both close to the rocket.
//
// All arithmetic is on plain JS numbers (float64), so world coordinates of ~6.4e6 m keep
// sub-millimetre precision.
export const ORBIT_RATIO = 3
export const ORBIT_ANGLE = Math.PI / 3
// Default half-width (seconds) of the eased corner at each keyframe in the 'linearEased' mode.
export const DEFAULT_CORNER_SECONDS = 1

import { sameAnchor } from './ShotFormat.js'

const identity = (key) => key

// True when two keyframes are tied to the same objects (so their values can share a tangent).
function linked(a, b) {
  return sameAnchor(a.anchor, b.anchor) && sameAnchor(a.lookAt ?? a.anchor, b.lookAt ?? b.anchor)
}

function lerp3(a, b, u) {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function length3(v) {
  return Math.hypot(v[0], v[1], v[2])
}

function normalize3(v, fallback = v) {
  const l = length3(v)
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : fallback
}

// Smooth 0..1 ramp with zero first and second derivative at both ends (Ken Perlin's smootherstep).
function smootherstep(x) {
  const c = Math.min(1, Math.max(0, x))
  return c * c * c * (c * (c * 6 - 15) + 10)
}

// 'linearEased' sampling: straight lines between keyframes, with a short eased corner (half-width `w`
// seconds, clamped so neighbouring corners never overlap) that blends the incoming and outgoing
// straight-line motion at each keyframe. Each corner only mixes the two segments it joins, so the path
// cannot bow toward a distant neighbour the way a spline tangent can; it passes through every keyframe
// exactly and reaches each keyframe's own velocity by the time the corner ends. `motion` and per-key
// `ease` are not used in this mode (the corner does the easing). `resolve`, r1 and r2 are as in
// sampleCameraPath; i is the segment [keys[i], keys[i+1]] containing t.
function sampleLinearEased(keys, i, t, resolve, r1, r2, w) {
  const cache = new Map([[i, r1], [i + 1, r2]])
  const resolved = (idx) => {
    if (!cache.has(idx)) cache.set(idx, resolve(keys[idx]))
    return cache.get(idx)
  }
  // Straight-line pose of segment [a, a+1], extrapolated to time `at`.
  const segment = (a, at) => {
    const kA = keys[a], kB = keys[a + 1]
    const rA = resolved(a), rB = resolved(a + 1)
    const span = kB.time - kA.time
    const s = span > 0 ? (at - kA.time) / span : 0
    const fA = kA.fov ?? kB.fov, fB = kB.fov ?? kA.fov
    return {
      position: lerp3(rA.position, rB.position, s),
      target: lerp3(rA.target, rB.target, s),
      up: lerp3(rA.up, rB.up, s),
      orbitUp: lerp3(rA.orbitUp ?? rA.up, rB.orbitUp ?? rB.up, s),
      fov: fA + (fB - fA) * s,
    }
  }
  const finish = (p) => ({
    time: t,
    position: p.position,
    target: p.target,
    up: normalize3(p.up, r1.up),
    orbitUp: normalize3(p.orbitUp, r1.orbitUp ?? r1.up),
    fov: Math.min(170, Math.max(0.01, p.fov)),
  })
  const mix = (pA, pB, s) => finish({
    position: lerp3(pA.position, pB.position, s),
    target: lerp3(pA.target, pB.target, s),
    up: lerp3(pA.up, pB.up, s),
    orbitUp: lerp3(pA.orbitUp, pB.orbitUp, s),
    fov: pA.fov + (pB.fov - pA.fov) * s,
  })
  const k1 = keys[i], k2 = keys[i + 1]
  // Corner half-width on one side, never more than half the gap it reaches into (so corners meet but
  // never overlap, leaving a straight middle whenever the gaps are longer than 2w).
  const half = (ta, tb) => Math.min(w, (tb - ta) / 2)

  // Eased corner at k1, blending the previous segment with this one (only if a previous segment exists).
  if (i >= 1) {
    const back = half(keys[i - 1].time, k1.time)
    const fwd = half(k1.time, k2.time)
    if (back + fwd > 0 && t < k1.time + fwd) {
      return mix(segment(i - 1, t), segment(i, t), smootherstep((t - (k1.time - back)) / (back + fwd)))
    }
  }
  // Eased corner at k2, blending this segment with the next one (only if a next segment exists).
  if (i + 2 < keys.length) {
    const back = half(k1.time, k2.time)
    const fwd = half(k2.time, keys[i + 2].time)
    if (back + fwd > 0 && t > k2.time - back) {
      return mix(segment(i, t), segment(i + 1, t), smootherstep((t - (k2.time - back)) / (back + fwd)))
    }
  }
  // Straight middle of the segment.
  return finish(segment(i, t))
}

// Tangent (per second) at the middle of three values with times ta, tb, tc. Missing neighbours
// (null) give the one-sided slope.
function tangent(va, vb, vc, ta, tb, tc, dims) {
  const out = new Array(dims)
  for (let k = 0; k < dims; k++) {
    const left = va !== null && tb > ta ? (vb[k] - va[k]) / (tb - ta) : null
    const right = vc !== null && tc > tb ? (vc[k] - vb[k]) / (tc - tb) : null
    if (left === null) out[k] = right ?? 0
    else if (right === null) out[k] = left
    else out[k] = (left * (tc - tb) + right * (tb - ta)) / (tc - ta)
  }
  return out
}

// One spline segment over four (possibly null at the ends) values of `dims` components.
// ease1/ease2: zero tangent at the segment's start/end. link01/link12/link23: whether neighbouring
// values may share a tangent (see linked()).
function hermite(v0, v1, v2, v3, t0, t1, t2, t3, t, ease1, ease2, [link01, link12, link23], dims) {
  const L = t2 - t1
  if (!(L > 0)) return v1.slice()
  const m1 = ease1 ? new Array(dims).fill(0) : tangent(link01 ? v0 : null, v1, link12 ? v2 : null, t0, t1, t2, dims)
  const m2 = ease2 ? new Array(dims).fill(0) : tangent(link12 ? v1 : null, v2, link23 ? v3 : null, t1, t2, t3, dims)
  const s = (t - t1) / L
  const s2 = s * s
  const s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1
  const h10 = s3 - 2 * s2 + s
  const h01 = -2 * s3 + 3 * s2
  const h11 = s3 - s2
  const out = new Array(dims)
  for (let k = 0; k < dims; k++) out[k] = h00 * v1[k] + h10 * L * m1[k] + h01 * v2[k] + h11 * L * m2[k]
  return out
}

// The motion a segment uses, given its two resolved end keys.
export function segmentMotion(key, a, b) {
  const motion = key.motion ?? 'auto'
  if (motion !== 'auto') return motion
  const oa = sub3(a.position, a.target)
  const ob = sub3(b.position, b.target)
  const da = length3(oa)
  const db = length3(ob)
  const lo = Math.min(da, db)
  if (!(lo > 0)) return 'direct'
  if (Math.max(da, db) / lo > ORBIT_RATIO) return 'orbit'
  const cos = (oa[0] * ob[0] + oa[1] * ob[1] + oa[2] * ob[2]) / (da * db)
  return cos < Math.cos(ORBIT_ANGLE) ? 'orbit' : 'direct'
}

function poseOf(key, resolved, time) {
  return {
    time,
    position: resolved.position.slice(),
    target: resolved.target.slice(),
    up: resolved.up.slice(),
    orbitUp: (resolved.orbitUp ?? resolved.up).slice(),
    fov: key.fov,
  }
}

// Index i of the segment [keys[i], keys[i+1]] containing t (keys sorted by time, t inside the range).
function segmentIndex(keys, t) {
  let lo = 0
  let hi = keys.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (keys[mid].time <= t) lo = mid
    else hi = mid
  }
  return lo
}

export function sampleCameraPath(camera, t, resolve = identity) {
  const keys = camera.keyframes
  if (!keys.length) return null
  if (keys.length === 1 || t <= keys[0].time) return poseOf(keys[0], resolve(keys[0]), t)
  const last = keys[keys.length - 1]
  if (t >= last.time) return poseOf(last, resolve(last), t)

  const i = segmentIndex(keys, t)
  const k1 = keys[i]
  const k2 = keys[i + 1]
  const r1 = resolve(k1)
  if (t === k1.time) return poseOf(k1, r1, t)
  const r2 = resolve(k2)
  const span = k2.time - k1.time
  const u = span > 0 ? (t - k1.time) / span : 0
  const fov1 = k1.fov ?? k2.fov
  const fov2 = k2.fov ?? k1.fov
  const orbitUp = normalize3(lerp3(r1.orbitUp ?? r1.up, r2.orbitUp ?? r2.up, u), r1.orbitUp ?? r1.up)

  if (camera.interpolation === 'linear') {
    return {
      time: t,
      position: lerp3(r1.position, r2.position, u),
      target: lerp3(r1.target, r2.target, u),
      up: normalize3(lerp3(r1.up, r2.up, u), r1.up),
      orbitUp,
      fov: fov1 + (fov2 - fov1) * u,
    }
  }

  if (camera.interpolation === 'linearEased') {
    return sampleLinearEased(keys, i, t, resolve, r1, r2, Math.max(0, camera.cornerSeconds ?? DEFAULT_CORNER_SECONDS))
  }

  const k0 = keys[i - 1] ?? null
  const k3 = keys[i + 2] ?? null
  const r0 = k0 && resolve(k0)
  const r3 = k3 && resolve(k3)
  const t0 = k0?.time ?? 0
  const t3 = k3?.time ?? 0
  const e1 = !!k1.ease
  const e2 = !!k2.ease
  const links = [!!k0 && linked(k0, k1), linked(k1, k2), !!k3 && linked(k2, k3)]
  const spline = (pick, dims, at = t) => hermite(r0 && pick(r0, k0), pick(r1, k1), pick(r2, k2), r3 && pick(r3, k3), t0, k1.time, k2.time, t3, at, e1, e2, links, dims)

  const up = normalize3(spline(r => r.up, 3), r1.up)
  const fov = Math.min(170, Math.max(0.01, spline((r, k) => [k.fov ?? fov1], 1)[0]))

  if (segmentMotion(k1, r1, r2) === 'direct') {
    return { time: t, position: spline(r => r.position, 3), target: spline(r => r.target, 3), up, orbitUp, fov }
  }

  // Orbit: direction and log-distance from the target.
  const offset = (r) => sub3(r.position, r.target)
  const logDistance = (r) => [Math.log(Math.max(1e-6, length3(offset(r))))]
  const direction = (r) => normalize3(offset(r), [0, 0, 1])
  const distance = Math.exp(spline(logDistance, 1)[0])
  const dir = normalize3(spline(direction, 3), direction(r1))
  // Move the target in step with the distance, so a subject stays in frame during a zoom.
  const d1 = Math.exp(logDistance(r1)[0])
  const d2 = Math.exp(logDistance(r2)[0])
  let targetTime = t
  if (Math.abs(d2 - d1) > 1e-9 * Math.max(d1, d2)) {
    const w = Math.min(1, Math.max(0, (distance - d1) / (d2 - d1)))
    targetTime = k1.time + w * span
  }
  const target = spline(r => r.target, 3, targetTime)
  const position = [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance]
  return { time: t, position, target, up, orbitUp, fov }
}
