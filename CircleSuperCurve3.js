import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { SuperCurve } from './SuperCurve.js';

class CircleSuperCurve3 extends SuperCurve {

	constructor(centerPoint, axisOfRotation, pointOnCircle, length) {
		// If the length is positive, the curve starts at pointOnCircle. If the length is negative, the curve ends at pointOnCircle.
		super();
		this.isCircleSuperCurve3 = true;
		this.type = 'CircleSuperCurve3';
		this.radius = pointOnCircle.clone().sub(centerPoint).length()
		this.centerPoint = centerPoint
		this.axisOfRotation = axisOfRotation
		this.pointOnCircle = pointOnCircle
		this.normalizedPointOnCircle = pointOnCircle.clone().normalize()
		this.length = length
		this.binormal = this.axisOfRotation.normalize()
	}

	getPointAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const point = optionalTarget || new Vector3();
		const angle = (this.length>0) ? d * this.length / this.radius : (1-d) * this.length / this.radius
		point.copy(this.pointOnCircle)
		point.applyAxisAngle(this.axisOfRotation, angle)
		return point
	}

	getTangentAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const vector = optionalTarget || new Vector3();
		const angle = (this.length>0) ? d * this.length / this.radius : (1-d) * this.length / this.radius
		vector.copy(this.normalizedPointOnCircle)
		vector.applyAxisAngle(this.axisOfRotation, angle + Math.PI/2)
		return vector
	}

	getNormalAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const vector = optionalTarget || new Vector3();
		const angle = (this.length>0) ? d * this.length / this.radius : (1-d) * this.length / this.radius
		vector.copy(this.normalizedPointOnCircle)
		vector.applyAxisAngle(this.axisOfRotation, angle)
		return vector
	}

	getBinormalAt(d, optionalTarget) {
		const vector = optionalTarget || new Vector3();
		vector.copy(this.binormal)
		return vector
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
