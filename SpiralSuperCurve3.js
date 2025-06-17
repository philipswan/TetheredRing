import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { SuperCurve } from './SuperCurve.js';
import * as tram from './tram.js'

class SpiralSuperCurve3 extends SuperCurve {

  constructor(centerPoint, axisOfRotation, startPointOnSpiral, rStep, length, normalInwards = false) {

    // If the length is positive, the curve starts at startPointOnSpiral. If the length is negative, the curve ends at startPointOnSpiral.
    super();
    this.isSpiralSuperCurve3 = true;
    this.type = 'SpiralSuperCurve3';

    this.update(centerPoint, axisOfRotation, startPointOnSpiral, rStep, length, normalInwards)

  }

  update(centerPoint, axisOfRotation, startPointOnSpiral, rStep, length, normalInwards = false) {

    this.centerPoint = centerPoint
    this.axisOfRotation = axisOfRotation // Perhaps this should be called "spiralNormal"
    this.startPointOnSpiral = startPointOnSpiral
    this.rStep = rStep
    // ToDo: Don't like this API where negative lengths are allowed. Better to add another parameter.
    this.length = Math.abs(length)
    this.lengthSign = Math.sign(length)
    this.normalInwards = normalInwards
    this.centerToPointOnSpiral = startPointOnSpiral.clone().sub(centerPoint)
    this.radius = this.centerToPointOnSpiral.length()
    this.normalizedCenterToPointOnSpiral = this.centerToPointOnSpiral.clone().normalize()
    if (this.normalInwards) {
      this.binormal = this.axisOfRotation.normalize()
    }
    else {
      this.normal = this.axisOfRotation.normalize()
    }
    this.duration = 0;

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
    // d is a number from 0 to 1 which indicates the desired distance along the curve 

    const point = optionalTarget || new Vector3();
    // Convert d to theta
    const theta = (this.lengthSign>0) ? d * this.length / this.radius : (-1 + d) * this.length / this.radius  // This is wrong - need to use rInc value
    point.copy(this.centerToPointOnSpiral)
    point.applyAxisAngle(this.axisOfRotation, theta).add(this.centerPoint)
    return point
  }

  getTangent(i, optionalTarget) {
    return this.getTangentAt(i, optionalTarget)
  }

  getTangentAt(d, optionalTarget) {
    // d is a number from 0 to 1 which indicates the desired distance along the curve 
    const vector = optionalTarget || new Vector3();
    const angle = (this.lengthSign>0) ? d * this.length / this.radius : (-1 + d) * this.length / this.radius
    vector.copy(this.normalizedCenterToPointOnSpiral)
    vector.applyAxisAngle(this.axisOfRotation, angle + Math.PI/2)
    return vector
  }

  getNormal(i, optionalTarget) {
    return this.getNormalAt(i, optionalTarget)
  }

  getNormalAt(d, optionalTarget) {
    // d is a number from 0 to 1 which indicates the desired distance along the curve 
    const vector = optionalTarget || new Vector3();
    const angle = (this.lengthSign>0) ? d * this.length / this.radius : (-1 + d) * this.length / this.radius
    vector.copy(this.normalizedCenterToPointOnSpiral)
    vector.applyAxisAngle(this.axisOfRotation, angle)
    if (this.normalInwards) vector.negate()
    return vector
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

  getQuaternion(i, objectForward = new Vector3(0, 1, 0), objectUpward = new Vector3(0, 0, 1), optionalTarget = new Quaternion() ) {
    return this.getQuaternionAt(i, objectForward, objectUpward, optionalTarget)
  }

  getQuaternionAt(d, objectForward = new Vector3(0, 1, 0), objectUpward = new Vector3(0, 0, 1), optionalTarget = new Quaternion() ) {

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

    const spiralCenter = this.centerPoint.clone()
    const spiralNormal = this.axisOfRotation.clone().normalize()
    const spiralRadius = this.radius
    const intersections = tram.findSpiralSphereIntersections(spiralCenter, spiralNormal, spiralRadius, sphereCenter, sphereRadius)

    const dValues = []
    intersections.forEach(intersection => {
      const dValue = this.convertPointToDValue(intersection)
      if (dValue>=0 && dValue<=1) dValues.push(dValue)
    })

    const startPoint = this.getPointAt(0)

    // Check if either of the curve's endpoints are inside (or on) the sphere...
    if (startPoint.distanceTo(sphereCenter) <= sphereRadius) {
      dValues.push(0)
    }
    const endPoint = this.getPointAt(1)
    if (endPoint.distanceTo(sphereCenter) <= sphereRadius) {
      dValues.push(1)
    }

    if (dValues.length==1) {
      console.log("Warning: Spiral curve really should not have only one intersetion point with a sphere if the algorithm is working correctly...")
      // But we'll handle it anyway...
      dValues.push(dValues[0])
    }
    if (dValues.length>=2) {
      dValues.sort()
      return [dValues[0], dValues[dValues.length-1]]
    }
    else {
      return []
    }

  }

  convertPointToDValue(point) {

    const zeroVector = this.getPointAt(0).sub(this.centerPoint)
    const pointVector = point.clone().sub(this.centerPoint)
    const angle = Math.asin(zeroVector.clone().cross(pointVector).dot(this.axisOfRotation)/zeroVector.length()/pointVector.length())
    //const posAngle = (Math.PI*2 + angle) % (Math.PI*2)
    const dValue = angle * this.radius / this.length
    return dValue

  }

}

export { SpiralSuperCurve3 };
