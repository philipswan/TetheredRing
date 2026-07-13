import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { SuperCurve } from './SuperCurve.js';

/**
 * EllipseSuperCurve3
 *
 * Models the curve formed by the intersection of a plane (passing through the
 * ellipsoid's center) with an ellipsoid. That intersection is exactly an ellipse,
 * so this class is the ellipsoidal analogue of CircleSuperCurve3 and "hugs" the
 * surface of an ellipsoid (e.g. a constant-geodetic-altitude shell modelled as
 * semi-axes (a+h, b+h, a+h), which is exactly what planet2's ocean shell uses).
 *
 * Math (see also the derivation notes):
 *   Let S = diag(semiAxes). The map X = S p turns the unit sphere into the
 *   ellipsoid. A plane through the origin cuts the sphere in a great circle;
 *   mapping that circle back through S yields the ellipse:
 *
 *       X(t) = centerPoint + cos(t) * g1 + sin(t) * g2
 *
 *   where g1, g2 are conjugate semi-diameters obtained from an orthonormal
 *   basis {e1, e2} of the plane in "sphere space":
 *       e1 = normalize(S^-1 * (pointOnEllipse - centerPoint))   // anchor at t=0
 *       e2 = normalize( normalize(S * axisOfRotation) x e1 )
 *       g1 = S * e1   (equals pointOnEllipse-centerPoint if the anchor is on the ellipsoid)
 *       g2 = S * e2
 *
 *   The plane normal in world space is axisOfRotation, which becomes the curve's
 *   binormal. Unlike a circle, arc length is NOT proportional to t, so an
 *   arc-length lookup table is built in update() to keep getPointAt(d) etc.
 *   parameterized by fractional distance d in [0, 1], matching CircleSuperCurve3.
 *
 * Constructor:
 *   centerPoint      Vector3  - center of the ellipsoid (e.g. planet center)
 *   axisOfRotation   Vector3  - normal of the (central) plane the curve lies in
 *   pointOnEllipse   Vector3  - anchor point; the curve passes through it at the
 *                               t=0 / d=0 end (length>0) or the d=1 end (length<0).
 *                               It is radially snapped onto the ellipsoid if it is
 *                               not exactly on the surface.
 *   semiAxes         Vector3  - ellipsoid semi-axes (sx, sy, sz). For WGS84 with
 *                               Y as the polar axis use (a+h, b+h, a+h).
 *   length           number   - arc length (meters) the curve spans. Positive: the
 *                               curve starts at pointOnEllipse. Negative: the curve
 *                               ends at pointOnEllipse (mirrors CircleSuperCurve3).
 *   normalInwards    boolean  - flip the surface normal/binormal inward.
 */
class EllipseSuperCurve3 extends SuperCurve {

  constructor(centerPoint, axisOfRotation, pointOnEllipse, semiAxes, length, normalInwards = false) {

    super();
    this.isEllipseSuperCurve3 = true;
    this.type = 'EllipseSuperCurve3';

    this.update(centerPoint, axisOfRotation, pointOnEllipse, semiAxes, length, normalInwards)

  }

  update(centerPoint, axisOfRotation, pointOnEllipse, semiAxes, length, normalInwards = false) {

    this.centerPoint = centerPoint
    this.axisOfRotation = axisOfRotation
    this.pointOnEllipse = pointOnEllipse
    this.semiAxes = semiAxes
    // ToDo: As with CircleSuperCurve3, the negative-length convention is a bit
    // awkward. Kept here for API parity.
    this.length = Math.abs(length)
    this.lengthSign = Math.sign(length)
    this._dir = this.lengthSign < 0 ? -1 : 1
    this.normalInwards = normalInwards
    this.duration = 0;

    // --- Build the ellipse basis (see class header) ---
    const semi = semiAxes.clone()
    const invSemi = new Vector3(1 / semi.x, 1 / semi.y, 1 / semi.z)
    this._semi = semi
    this._invSemi = invSemi

    const centerToP0 = pointOnEllipse.clone().sub(centerPoint)

    // Sphere-space anchor direction -> e1
    const pSphere = centerToP0.clone().multiply(invSemi)
    const e1 = pSphere.clone().normalize()

    // Sphere-space plane normal -> mHat; e2 completes the in-plane basis
    const nHat = axisOfRotation.clone().normalize()
    const mSphere = nHat.clone().multiply(semi)
    const mHat = mSphere.clone().normalize()
    const e2 = mHat.clone().cross(e1).normalize()

    this._e1 = e1
    this._e2 = e2

    // World-space conjugate semi-diameters
    const g1 = e1.clone().multiply(semi)
    const g2 = e2.clone().multiply(semi)
    this._g1 = g1
    this._g2 = g2
    this._gSq1 = g1.lengthSq()
    this._gSq2 = g2.lengthSq()
    this._gDot = g1.dot(g2)

    // Binormal is the world-space plane normal (perpendicular to the curve's plane)
    this.binormal = nHat

    // Mean radius, provided for rough compatibility with code that inspects .radius
    this.radius = 0.5 * (Math.sqrt(this._gSq1) + Math.sqrt(this._gSq2))

    // Determine the outward sign of (binormal x tangent) so the default normal
    // points away from the center, matching CircleSuperCurve3's convention.
    const tangent0 = g2.clone().normalize() // X'(0) = g2
    const n0 = this.binormal.clone().cross(tangent0)
    this._outwardSign = Math.sign(n0.dot(g1)) || 1

    // --- Build arc-length <-> angle lookup table ---
    this._buildArcTable()

  }

  _buildArcTable() {

    this._angTable = [0]
    this._arcTable = [0]

    if (this.length <= 0) return

    const gLen1 = Math.sqrt(this._gSq1)
    const gLen2 = Math.sqrt(this._gSq2)
    const minG = Math.min(gLen1, gLen2) || 1
    // Integrate a little past the requested length so convertPointToDValue() can
    // resolve points slightly beyond the curve's end.
    const arcLimit = this.length * 1.25
    const samples = 2000
    const dt = (arcLimit / minG) / samples || 1
    const dir = this._dir
    const maxSteps = samples * 3

    let spPrev = this._speed(0)
    let accum = 0
    for (let k = 1; k <= maxSteps; k++) {
      const a = k * dt * dir
      const sp = this._speed(a)
      accum += 0.5 * (spPrev + sp) * dt // dt is the positive angular step
      this._angTable.push(k * dt)       // store |angle|
      this._arcTable.push(accum)
      spPrev = sp
      if (accum >= arcLimit) break
    }

  }

  // |X'(t)| at signed angle a
  _speed(a) {
    const s = Math.sin(a)
    const c = Math.cos(a)
    const v = this._gSq1 * s * s + this._gSq2 * c * c - 2 * this._gDot * s * c
    return Math.sqrt(v > 0 ? v : 0)
  }

  _pointAtAngle(a, target) {
    target.copy(this.centerPoint)
    target.addScaledVector(this._g1, Math.cos(a))
    target.addScaledVector(this._g2, Math.sin(a))
    return target
  }

  _tangentAtAngle(a, target) {
    target.set(0, 0, 0)
    target.addScaledVector(this._g1, -Math.sin(a))
    target.addScaledVector(this._g2, Math.cos(a))
    return target.normalize()
  }

  // Given an arc-length magnitude s (>=0), return the |angle| via the table
  _angleMagForArc(s) {
    const arc = this._arcTable
    const ang = this._angTable
    const n = arc.length
    if (n < 2 || s <= 0) return 0
    if (s >= arc[n - 1]) return ang[n - 1]
    let lo = 0, hi = n - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (arc[mid] <= s) lo = mid; else hi = mid
    }
    const denom = (arc[hi] - arc[lo]) || 1
    const f = (s - arc[lo]) / denom
    return ang[lo] + f * (ang[hi] - ang[lo])
  }

  // Given an |angle|, return the arc-length magnitude via the table
  _arcForAngleMag(am) {
    const arc = this._arcTable
    const ang = this._angTable
    const n = ang.length
    if (n < 2 || am <= 0) return 0
    if (am >= ang[n - 1]) return arc[n - 1]
    let lo = 0, hi = n - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (ang[mid] <= am) lo = mid; else hi = mid
    }
    const denom = (ang[hi] - ang[lo]) || 1
    const f = (am - ang[lo]) / denom
    return arc[lo] + f * (arc[hi] - arc[lo])
  }

  // Map fractional distance d in [0,1] to the signed angle along the curve
  _angleForD(d) {
    const s = (this.lengthSign > 0) ? d * this.length : (1 - d) * this.length
    return this._dir * this._angleMagForArc(s)
  }

  getLength() {
    return this.length
  }

  setDuration(duration) {
    this.duration = duration
  }

  getDuration() {
    return this.duration
  }

  getPoint(i, optionalTarget) {
    return this.getPointAt(i, optionalTarget)
  }

  getPointAt(d, optionalTarget) {
    // d is a number from 0 to 1 indicating the desired fractional distance along the curve
    const point = optionalTarget || new Vector3();
    const angle = this._angleForD(d)
    return this._pointAtAngle(angle, point)
  }

  getTangent(i, optionalTarget) {
    return this.getTangentAt(i, optionalTarget)
  }

  getTangentAt(d, optionalTarget) {
    const vector = optionalTarget || new Vector3();
    const angle = this._angleForD(d)
    return this._tangentAtAngle(angle, vector)
  }

  getNormal(i, optionalTarget) {
    return this.getNormalAt(i, optionalTarget)
  }

  getNormalAt(d, optionalTarget) {
    const vector = optionalTarget || new Vector3();
    const angle = this._angleForD(d)
    const tangent = this._tangentAtAngle(angle, new Vector3())
    // In-plane normal perpendicular to the tangent (binormal x tangent), oriented outward
    vector.crossVectors(this.binormal, tangent)
    vector.multiplyScalar(this._outwardSign)
    if (this.normalInwards) vector.negate()
    return vector.normalize()
  }

  getBinormal(i, optionalTarget) {
    const vector = optionalTarget || new Vector3();
    vector.copy(this.binormal)
    if (this.normalInwards) vector.negate()
    return vector
  }

  getBinormalAt(d, optionalTarget) {
    const vector = optionalTarget || new Vector3();
    vector.copy(this.binormal)
    if (this.normalInwards) vector.negate()
    return vector
  }

  addtToiConvertor(tToiConvertor) {
    this.tToi = tToiConvertor
  }

  addtTodConvertor(tTodConvertor) {
    this.tTod = tTodConvertor
  }

  addtTosConvertor(tTosConvertor) {
    this.tTos = tTosConvertor
  }

  getQuaternion(i, objectForward = new Vector3(0, 1, 0), objectUpward = new Vector3(0, 0, 1), optionalTarget = new Quaternion()) {
    return this.getQuaternionAt(i, objectForward, objectUpward, optionalTarget)
  }

  getQuaternionAt(d, objectForward = new Vector3(0, 1, 0), objectUpward = new Vector3(0, 0, 1), optionalTarget = new Quaternion()) {

    const q1 = optionalTarget
    const tangent = this.getTangentAt(d)
    const normal = this.getNormalAt(d)
    q1.setFromUnitVectors(objectForward, tangent)
    const rotatedObjectUpwardVector = objectUpward.clone().applyQuaternion(q1)
    const q2 = new Quaternion
    q2.setFromUnitVectors(rotatedObjectUpwardVector, normal)
    q2.multiply(q1)
    return q2
  }

  getStartFinishZoneIndices(sphereCenter, sphereRadius) {

    // No closed-form ellipse/sphere helper exists, so resolve the in/out span
    // numerically by sampling and refining the boundaries.
    const N = 256
    const r2 = sphereRadius * sphereRadius
    const p = new Vector3()
    let firstIn = -1, lastIn = -1

    for (let k = 0; k <= N; k++) {
      this.getPointAt(k / N, p)
      if (p.distanceToSquared(sphereCenter) <= r2) {
        if (firstIn < 0) firstIn = k
        lastIn = k
      }
    }

    if (firstIn < 0) return []

    const refine = (kInside, kOutside) => {
      let dIn = kInside / N
      let dOut = kOutside / N
      for (let it = 0; it < 24; it++) {
        const dm = 0.5 * (dIn + dOut)
        this.getPointAt(dm, p)
        if (p.distanceToSquared(sphereCenter) <= r2) dIn = dm; else dOut = dm
      }
      return dIn
    }

    const dStart = (firstIn === 0) ? 0 : refine(firstIn, firstIn - 1)
    const dFinish = (lastIn === N) ? 1 : refine(lastIn, lastIn + 1)
    return [dStart, dFinish]

  }

  convertPointToDValue(point) {

    // Project the point into sphere space and read off its angle on the unit circle
    const pSph = point.clone().sub(this.centerPoint).multiply(this._invSemi)
    const cosT = pSph.dot(this._e1)
    const sinT = pSph.dot(this._e2)
    const t = Math.atan2(sinT, cosT)
    const arc = this._arcForAngleMag(Math.abs(t))
    const dValue = (this.lengthSign > 0) ? arc / this.length : 1 - arc / this.length
    return dValue

  }

}

export { EllipseSuperCurve3 };
