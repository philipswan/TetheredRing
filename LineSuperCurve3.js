import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { SuperCurve } from './SuperCurve.js';
import { Matrix4 } from 'three/src/math/Matrix4.js';

class LineSuperCurve3 extends SuperCurve {

	constructor(startPoint, endPoint, startPointUpDirection, endPointUpDirection) {
		// If the length is positive, the curve starts at pointOnCircle. If the length is negative, the curve ends at pointOnCircle.
		super();
		this.isLineSuperCurve3 = true;
		this.type = 'LineSuperCurve3';
		this.startPoint = startPoint
		this.endPoint = endPoint
		this.startPointUpDirection = startPointUpDirection
		this.endPointUpDirection = endPointUpDirection || startPointUpDirection // Optional. Copy startPointUpDirection if its not given
	}

	getPointAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const point = optionalTarget || new Vector3();
		point.copy(this.startPoint).lerp(this.endPoint, d)
		return point
	}

	getTangentAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve. The parameter  is not actually used in this call, but included for api consistancy
		const vector = optionalTarget || new Vector3();
		vector.copy(this.endPoint).sub(this.startPoint).normalize()
		return vector
	}

	getNormalAt(d, optionalTarget) {
		// d is a number from 0 to 1 which indicates the desired distance along the curve 
		const vector = optionalTarget || new Vector3();
		vector.copy(this.startPointUpDirection).lerp(this.endPointUpDirection, d).normalize()
		return vector
	}

	getBinormalAt(d, optionalTarget) {
		const vector = optionalTarget || new Vector3();
        this.getTangentAt(d, vector)
        vector.cross(this.getNormalAt(d)).normalize()
		return vector
	}

    computeFrenetFrames( segments, closed ) {
        // Note: A LineSuperCurve cannot be closed, but the parameter is provided for API consistency
        const tangents = []
		const normals = []
		const binormals = []

        const t = this.getTangentAt(0)
        // It is weird that the first point in this array is 1 and not zero, but this seems to be a decision that was made by the original API.
        // To be compatible with function that use this array, we will keep the same convention.
		for ( let i = 0; i <= segments+1; i++ ) {
            const d = Math.min(0, Math.max(1, (i-1)/(segments-1)))
			tangents[ i ] = t.clone()
            normals[ i ] = this.getNormalAt(d)
			binormals[ i ] = this.getBinormalAt(d)
        }

		return {
			tangents: tangents,
			normals: normals,
			binormals: binormals
		}
    }    

	addtTodConvertor(tTodConvertor) {
		this.tTod = tTodConvertor
	}

	getQuaternionAt(d, objectForward = new Vector3(0, 1, 0), objectUpward = new Vector3(0, 0, 1), optionalTarget = new Quaternion() ) {

		const q1 = optionalTarget
		const tangent = this.getTangentAt(d)
		const normal = this.getNormalAt(d)
    q1.setFromUnitVectors(objectForward, tangent)
		const rotatedObjectUpwardVector = objectUpward.clone().applyQuaternion(q1)
		const q2 = new Quaternion.setFromUnitVectors(rotatedObjectUpwardVector, normal)
		q2.multiply(q1)
		return q2
		
	}
}

export { LineSuperCurve3 };
