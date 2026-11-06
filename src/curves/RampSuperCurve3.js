import { Vector3 } from 'three'
import { SuperCurve, quaternionFromFrame } from './SuperCurve.js'

// Geometry is parametrized by true distance, independently of the vehicle/nut's time laws.
export class RampSuperCurve3 extends SuperCurve {
  constructor(profile, start, axis) {
    super()
    this.profile = profile
    this.start = start.clone().normalize()
    this.axis = axis.clone().normalize()
    this.downrange = new Vector3().crossVectors(this.axis, this.start)
    this.specificForceAt = t => { const a = profile.atTime(t); return this.toWorld(a.fx, a.fy, a.fz) }
    this.length = profile.length
    this.duration = profile.duration
    this.tTod = t => profile.atTime(t).s
    this.tTos = t => profile.atTime(t).v
    this.tToi = t => this.tTod(t) / this.length
  }
  getLength() { return this.length }
  getLengths(divisions = 200) { return Array.from({ length: divisions + 1 }, (_, i) => this.length * i / divisions) }
  getUtoTmapping(u) { return u }
  state(u) { return this.profile.atDistance(Math.max(0, Math.min(1, u)) * this.length) }
  toWorld(x, y, z, target = new Vector3()) { return target.copy(this.start).multiplyScalar(x).addScaledVector(this.downrange, y).addScaledVector(this.axis, z) }
  getPoint(u, target = new Vector3()) { const a = this.state(u); return this.toWorld(a.px, a.py, a.pz, target) }
  getPointAt(u, target) { return this.getPoint(u, target) }
  getTangent(u, target = new Vector3()) {
    const a = this.state(u)
    return this.toWorld(a.vx, a.vy, a.vz, target).normalize()
  }
  getTangentAt(u, target) { return this.getTangent(u, target) }
  getNormal(u, target = new Vector3()) { const point = this.getPoint(u), tangent = this.getTangent(u); return target.copy(point).addScaledVector(tangent, -point.dot(tangent)).normalize() }
  getNormalAt(u, target) { return this.getNormal(u, target) }
  getBinormal(u, target = new Vector3()) {
    // Match CircleSuperCurve3's track-side convention: outward normal cross forward.
    // Reversing this swaps the left/right screws (and therefore their handedness) at ramp entry.
    return target.crossVectors(this.getNormal(u), this.getTangent(u)).normalize()
  }
  getBinormalAt(u, target) { return this.getBinormal(u, target) }
  getQuaternion(u, forward, upward, target) { return quaternionFromFrame(this.getTangent(u), this.getNormal(u), forward, upward, target) }
  getQuaternionAt(u, forward, upward, target) { return this.getQuaternion(u, forward, upward, target) }
  getStartFinishZoneIndices(centre, radius) {
    // Conservative bounds around the dense design samples; include the gap to the next sample so
    // visibility cannot disappear when a small camera sphere falls between two design points.
    this.zoneSamples ??= this.profile.samples.map(a => ({ s: a.s, point: this.toWorld(a.px, a.py, a.pz) }))
    let start = Infinity, end = -Infinity
    for (let i = 0; i < this.zoneSamples.length - 1; i++) {
      const a = this.zoneSamples[i], b = this.zoneSamples[i + 1]
      if (a.point.distanceTo(centre) <= radius + b.s - a.s) { start = Math.min(start, a.s); end = Math.max(end, b.s) }
    }
    return end < start ? [] : [start / this.length, end / this.length]
  }
  addtTodConvertor(fn) { this.tTod = fn }
  addtTosConvertor(fn) { this.tTos = fn }
  addtToiConvertor(fn) { this.tToi = fn }
  setDuration(t) { this.duration = t }
  getDuration() { return this.duration }
}
