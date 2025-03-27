import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { SuperCurve } from './SuperCurve.js';
import * as tram from './tram.js'

class CircleSuperCurve3 extends SuperCurve {

  constructor(centerPoint, axisOfRotation, pointOnCircle, length, normalInwards = false) {

    // If the length is positive, the curve starts at pointOnCircle. If the length is negative, the curve ends at pointOnCircle.
    super();
    this.isCircleSuperCurve3 = true;
    this.type = 'CircleSuperCurve3';

    this.update(centerPoint, axisOfRotation, pointOnCircle, length, normalInwards)

  }

  update(centerPoint, axisOfRotation, pointOnCircle, length, normalInwards = false) {

    this.centerPoint = centerPoint
    this.axisOfRotation = axisOfRotation // Perhaps this should be called "circleNormal"
    this.pointOnCircle = pointOnCircle
    // ToDo: Don't like this API where negative lengths are allowed. Better to add another parameter.
    this.length = Math.abs(length)
    this.lengthSign = Math.sign(length)
    this.normalInwards = normalInwards
    this.centerToPointOnCircle = pointOnCircle.clone().sub(centerPoint)
    this.radius = this.centerToPointOnCircle.length()
    this.normalizedCenterToPointOnCircle = this.centerToPointOnCircle.clone().normalize()
    this.binormal = this.axisOfRotation.normalize()
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
    const angle = (this.lengthSign>0) ? d * this.length / this.radius : (-1 + d) * this.length / this.radius
    point.copy(this.centerToPointOnCircle)
    point.applyAxisAngle(this.axisOfRotation, angle).add(this.centerPoint)
    return point
  }

  getTangent(i, optionalTarget) {
    return this.getTangentAt(i, optionalTarget)
  }

  getTangentAt(d, optionalTarget) {
    // d is a number from 0 to 1 which indicates the desired distance along the curve 
    const vector = optionalTarget || new Vector3();
    const angle = (this.lengthSign>0) ? d * this.length / this.radius : (-1 + d) * this.length / this.radius
    vector.copy(this.normalizedCenterToPointOnCircle)
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
    vector.copy(this.normalizedCenterToPointOnCircle)
    vector.applyAxisAngle(this.axisOfRotation, angle)
    if (this.normalInwards) vector.negate()
    return vector
  }

  getBinormal(i, optionalTarget) {
    const vector = optionalTarget || new Vector3();
    vector.copy(this.binormal)
    return vector
  }

  getBinormalAt(d, optionalTarget) {
    const vector = optionalTarget || new Vector3();
    vector.copy(this.binormal)
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

    const circleCenter = this.centerPoint.clone()
    const circleNormal = this.axisOfRotation.clone().normalize()
    const circleRadius = this.radius
    const intersections = tram.findCircleSphereIntersections(circleCenter, circleNormal, circleRadius, sphereCenter, sphereRadius)

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
      console.log("Warning: Circle curve really should not have only one intersetion point with a sphere if the algorithm is working correctly...")
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

export { CircleSuperCurve3 };
