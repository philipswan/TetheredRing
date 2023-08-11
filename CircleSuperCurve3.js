import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { SuperCurve } from './SuperCurve.js';

class CircleSuperCurve3 extends SuperCurve {

	constructor(centerPoint, axisOfRotation, pointOnCircle, length) {
		// If the length is positive, the curve starts at pointOnCircle. If the length is negative, the curve ends at pointOnCircle.
		super();
		this.isCircleSuperCurve3 = true;
		this.type = 'CircleSuperCurve3';
		this.centerPoint = centerPoint
		this.axisOfRotation = axisOfRotation // Perhaps this should be called "circleNormal"
		this.pointOnCircle = pointOnCircle
		this.length = length
		this.centerToPointOnCircle = pointOnCircle.clone().sub(centerPoint)
		this.radius = this.centerToPointOnCircle.length()
		this.normalizedCenterToPointOnCircle = this.centerToPointOnCircle.clone().normalize()
		this.binormal = this.axisOfRotation.normalize()
	}

	getLength() {
		return this.length
	}
	
	getPointAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const point = optionalTarget || new Vector3();
		const angle = (this.length>0) ? d * this.length / this.radius : (1-d) * this.length / this.radius
		point.copy(this.centerToPointOnCircle)
		point.applyAxisAngle(this.axisOfRotation, angle).add(this.centerPoint)
		return point
	}

	getTangentAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const vector = optionalTarget || new Vector3();
		const angle = (this.length>0) ? d * this.length / this.radius : (1-d) * this.length / this.radius
		vector.copy(this.normalizedCenterToPointOnCircle)
		vector.applyAxisAngle(this.axisOfRotation, angle + Math.PI/2)
		return vector
	}

	getNormalAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const vector = optionalTarget || new Vector3();
		const angle = (this.length>0) ? d * this.length / this.radius : (1-d) * this.length / this.radius
		vector.copy(this.normalizedCenterToPointOnCircle)
		vector.applyAxisAngle(this.axisOfRotation, angle)
		return vector
	}

	getBinormalAt(d, optionalTarget) {
		const vector = optionalTarget || new Vector3();
		vector.copy(this.binormal)
		return vector
	}
	
	addtTosConvertor(tTosConvertor) {
		this.tTos = tTosConvertor
	}

	addtTodConvertor(tTodConvertor) {
		this.tTod = tTodConvertor
	}

	getQuaternionAt(objectForward, objectUpward, d, optionalTarget) {
		const q1 = optionalTarget || new Quaternion
		const tangent = this.getTangentAt(d)
		const normal = this.getNormalAt(d)
        q1.setFromUnitVectors(objectForward, tangent)
		const rotatedObjectUpwardVector = objectUpward.clone().applyQuaternion(q1)
		const q2 = new Quaternion
		q2.setFromUnitVectors(rotatedObjectUpwardVector, normal)
		q2.multiply(q1)
		return q2
	}
}

export { CircleSuperCurve3 };
