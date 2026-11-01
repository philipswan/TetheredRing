// Pure maths for camera navigation (no DOM, no scene): kept separate so it can be unit tested.
//
// Conventions: a three.js camera looks along its local -Z with +Y up. Positions are world
// coordinates (float64 JS numbers, about 6.4e6 m from the planet centre at the origin).
import * as THREE from 'three'

const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _h = new THREE.Vector3()
const _p = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _qb = new THREE.Quaternion()
const _qc = new THREE.Quaternion()
const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
// Zero velocity and acceleration at both ends.
export const smootherstep = (x) => {
  const t = clamp(x, 0, 1)
  return t * t * t * (t * (6 * t - 15) + 10)
}

// Any unit vector perpendicular to `v` (unit).
export function anyPerpendicular(v, out = new THREE.Vector3()) {
  out.set(Math.abs(v.x) < 0.9 ? 1 : 0, Math.abs(v.x) < 0.9 ? 0 : 1, 0)
  return out.sub(_p.copy(v).multiplyScalar(out.dot(v))).normalize()
}

// The camera "up" for a view along `forward` (unit) that keeps the horizon level: the vertical
// (unit) projected onto the screen plane. Looking (nearly) straight up or down that projection
// vanishes, so there the previous up (`previousUp`) is kept instead, blending between the two over
// the last LEVEL_CONE of tilt. The result is continuous however the view direction moves.
export const LEVEL_CONE = 0.2 // sin of the angle off the vertical below which the previous up is kept
export function levelUp(forward, vertical, previousUp, out = new THREE.Vector3()) {
  _h.copy(vertical).addScaledVector(forward, -vertical.dot(forward))
  const w = _h.length()
  _p.copy(previousUp).addScaledVector(forward, -previousUp.dot(forward))
  if (_p.lengthSq() < 1e-12) anyPerpendicular(forward, _p)
  else _p.normalize()
  if (w < 1e-9) return out.copy(_p)
  _h.multiplyScalar(1 / w)
  const a = smoothstep(0, LEVEL_CONE, w)
  if (a >= 1) return out.copy(_h)
  out.copy(_p).multiplyScalar(1 - a).addScaledVector(_h, a)
  if (out.lengthSq() < 1e-12) return out.copy(_h)
  return out.normalize()
}

// Quaternion of a camera looking along `forward` (unit) with `up` (need not be perpendicular).
export function lookRotation(forward, up, out = new THREE.Quaternion()) {
  _z.copy(forward).negate()
  _x.crossVectors(up, _z)
  if (_x.lengthSq() < 1e-18) anyPerpendicular(_z, _x)
  _x.normalize()
  _y.crossVectors(_z, _x)
  _m.makeBasis(_x, _y, _z)
  return out.setFromRotationMatrix(_m)
}

// Framing: where a tracked object sits on screen, as a yaw and pitch (radians) of the camera away
// from looking straight at it. The camera is Q0 * Ry(yaw) * Rx(pitch), where Q0 looks at the object
// with a level horizon; the object is then at camera-space direction framingDirection(yaw, pitch).
export function framingRotation(yaw, pitch, out = new THREE.Quaternion()) {
  return out.setFromAxisAngle(AXIS_Y, yaw).multiply(_qc.setFromAxisAngle(AXIS_X, pitch))
}
export function framingDirection(yaw, pitch, out = new THREE.Vector3()) {
  return out.set(Math.sin(yaw), -Math.cos(yaw) * Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
}
// Inverse of framingDirection: the framing that puts the object at camera-space direction `d`.
export function framingFromDirection(d) {
  const l = d.length()
  if (!(l > 0)) return { yaw: 0, pitch: 0 }
  return { yaw: Math.asin(clamp(d.x / l, -1, 1)), pitch: Math.atan2(-d.y, -d.z) }
}

// Orientation of a camera at `position` keeping `subject` at the framing (yaw, pitch), level about
// `vertical`, continuous with `previousUp`.
export function aimRotation(position, subject, vertical, previousUp, yaw, pitch, out = new THREE.Quaternion()) {
  const forward = new THREE.Vector3().subVectors(subject, position)
  if (forward.lengthSq() < 1e-18) forward.set(0, 0, -1)
  forward.normalize()
  const up = levelUp(forward, vertical, previousUp, new THREE.Vector3())
  lookRotation(forward, up, out)
  if (yaw !== 0 || pitch !== 0) out.multiply(framingRotation(yaw, pitch, _qb))
  return out
}

// Spherical interpolation of unit vectors (falls back to a perpendicular for opposite vectors).
export function slerpUnit(a, b, t, out = new THREE.Vector3()) {
  const cos = clamp(a.dot(b), -1, 1)
  const angle = Math.acos(cos)
  if (angle < 1e-9) return out.copy(a)
  let axis
  if (Math.PI - angle < 1e-6) axis = anyPerpendicular(a, new THREE.Vector3())
  else axis = new THREE.Vector3().crossVectors(a, b).normalize()
  return out.copy(a).applyAxisAngle(axis, angle * t)
}

// Van Wijk & Nuij, "Smooth and efficient zooming and panning" (2003): the path between two views
// (centres u0 = 0 and u1 = d apart, view widths w0 and w1) that zooms out, pans and zooms in so the
// perceived motion is smallest and steady. Returns { S, at(s) -> { u, w } } for s in [0, S]; S is the
// path's length in its own perceptual units (so a duration can be proportional to it).
export function zoomPanPath(w0, w1, d, rho = Math.SQRT2) {
  const r2 = rho * rho
  if (!(d > 1e-9 * Math.max(w0, w1))) {
    const k = Math.log(w1 / w0)
    const S = Math.abs(k) / rho
    return { S, at: (s) => ({ u: 0, w: S > 0 ? w0 * Math.exp(Math.sign(k) * rho * s) : w0 }) }
  }
  const b = (wi, sign) => (w1 * w1 - w0 * w0 + sign * r2 * r2 * d * d) / (2 * wi * r2 * d)
  const r = (bi) => Math.log(-bi + Math.sqrt(bi * bi + 1))
  const r0 = r(b(w0, 1))
  const r1 = r(b(w1, -1))
  const S = (r1 - r0) / rho
  const c0 = Math.cosh(r0)
  const s0 = Math.sinh(r0)
  return {
    S,
    at: (s) => ({
      u: (w0 / r2) * (c0 * Math.tanh(rho * s + r0) - s0),
      w: (w0 * c0) / Math.cosh(rho * s + r0),
    }),
  }
}

// How long a move along a zoomPanPath of length S, that also turns the view by `turn` radians,
// takes (seconds), times `scale`.
export function transitionSeconds(S, turn, scale = 1) {
  return scale * clamp(0.7 + 0.35 * S + 0.5 * turn / Math.PI, 0.7, 5)
}

// Mouse wheel or touchpad? A mouse wheel moves in whole notches (deltaMode lines/pages, or pixel
// deltas of 50 and more with no sideways part); a touchpad scrolls in small, often fractional, steps and
// sideways too, and a pinch arrives as a wheel event with ctrlKey. `recent` is what the previous
// event of the same burst was classified as (touchpads send long bursts; one ambiguous event in the
// middle of a burst keeps the burst's classification).
export function classifyWheel(event, recent = null) {
  if (event.ctrlKey) return 'pinch'
  if (event.deltaMode !== 0) return 'wheel'
  const dx = Math.abs(event.deltaX)
  const dy = Math.abs(event.deltaY)
  if (dx > 0) return 'touchpad'
  if (!Number.isInteger(event.deltaY)) return 'touchpad'
  if (dy >= 50) return 'wheel'
  return recent ?? 'touchpad'
}
