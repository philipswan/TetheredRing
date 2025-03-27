import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { SuperCurve } from './SuperCurve.js';

/**
 * Centripetal CatmullRom Curve - which is useful for avoiding
 * cusps and self-intersections in non-uniform catmull rom curves.
 * http://www.cemyuksel.com/research/catmullrom_param/catmullrom.pdf
 *
 * curve.type accepts centripetal(default), chordal and catmullrom
 * curve.tension is used for catmullrom which defaults to 0.5
 */


/*
Based on an optimized c++ solution in
 - http://stackoverflow.com/questions/9489736/catmull-rom-curve-with-no-cusps-and-no-self-intersections/
 - http://ideone.com/NoEbVM

This CubicPoly class could be used for reusing some variables and calculations,
but for three.js curve use, it could be possible inlined and flatten into a single function call
which can be placed in CurveUtils.
*/

function CubicPoly() {

	let c0 = 0, c1 = 0, c2 = 0, c3 = 0;

	/*
	 * Compute coefficients for a cubic polynomial
	 *   p(s) = c0 + c1*s + c2*s^2 + c3*s^3
	 * such that
	 *   p(0) = x0, p(1) = x1
	 *  and
	 *   p'(0) = t0, p'(1) = t1.
	 */
	function init( x0, x1, t0, t1 ) {

		c0 = x0;
		c1 = t0;
		c2 = - 3 * x0 + 3 * x1 - 2 * t0 - t1;
		c3 = 2 * x0 - 2 * x1 + t0 + t1;

	}

	return {

		initCatmullRom: function ( x0, x1, x2, x3, tension ) {

			init( x1, x2, tension * ( x2 - x0 ), tension * ( x3 - x1 ) );

		},

		initNonuniformCatmullRom: function ( x0, x1, x2, x3, dt0, dt1, dt2 ) {

			// compute tangents when parameterized in [t1,t2]
			let t1 = ( x1 - x0 ) / dt0 - ( x2 - x0 ) / ( dt0 + dt1 ) + ( x2 - x1 ) / dt1;
			let t2 = ( x2 - x1 ) / dt1 - ( x3 - x1 ) / ( dt1 + dt2 ) + ( x3 - x2 ) / dt2;

			// rescale tangents for parametrization in [0,1]
			t1 *= dt1;
			t2 *= dt1;

			init( x1, x2, t1, t2 );

		},

		calc: function ( t ) {

			const t2 = t * t;
			const t3 = t2 * t;
			return c3 * t3 + c2 * t2 + c1 * t + c0;

		},

		calcFirstDerivative: function ( t ) {

			const t2 = t * t;
			return 3 * c3 * t2 + 2 * c2 * t + c1;

		},

		calcSecondDerivative: function ( t ) {

			return 6 * c3 * t + 2 * c2;

		}

	};

}

//

const tmp = /*@__PURE__*/ new Vector3();
const px = /*@__PURE__*/ new CubicPoly();
const py = /*@__PURE__*/ new CubicPoly();
const pz = /*@__PURE__*/ new CubicPoly();

class CatmullRomSuperCurve3 extends SuperCurve {

	constructor( points = [], closed = false, curveType = 'centripetal', tension = 0.5 ) {

		super();

		this.isCatmullRomSuperCurve3 = true;
		this.type = 'CatmullRomSuperCurve3';

		this.points = points;
		this.closed = closed;
		this.curveType = curveType;
		this.tension = tension;

		this.duration = 0;
    this.normalMode = null

	}

  setAlwaysAwayNormalMode() {
    this.normalMode = 'alwaysAway'
  }

	setPoints( points ) {

		this.points = points

	}

	prepareInterpolator(t) {

		const points = this.points;
		const l = points.length;

		const p = ( l - ( this.closed ? 0 : 1 ) ) * t;
		let intPoint = Math.floor( p );
		let weight = p - intPoint;

		if ( this.closed ) {

			intPoint += intPoint > 0 ? 0 : ( Math.floor( Math.abs( intPoint ) / l ) + 1 ) * l;

		} else if ( weight === 0 && intPoint === l - 1 ) {

			intPoint = l - 2;
			weight = 1;

		}

		let p0, p3; // 4 points (p1 & p2 defined below)

		if ( this.closed || intPoint > 0 ) {

			p0 = points[ ( intPoint - 1 ) % l ];

		} else {

			// extrapolate first point
			tmp.subVectors( points[ 0 ], points[ 1 ] ).add( points[ 0 ] );
			p0 = tmp;

		}

		const p1 = points[ intPoint % l ];
		const p2 = points[ ( intPoint + 1 ) % l ];

		if ( this.closed || intPoint + 2 < l ) {

			p3 = points[ ( intPoint + 2 ) % l ];

		} else {

			// extrapolate last point
			tmp.subVectors( points[ l - 1 ], points[ l - 2 ] ).add( points[ l - 1 ] );
			p3 = tmp;

		}

		if ( this.curveType === 'centripetal' || this.curveType === 'chordal' ) {

			// init Centripetal / Chordal Catmull-Rom
			const pow = this.curveType === 'chordal' ? 0.5 : 0.25;
			let dt0 = Math.pow( p0.distanceToSquared( p1 ), pow );
			let dt1 = Math.pow( p1.distanceToSquared( p2 ), pow );
			let dt2 = Math.pow( p2.distanceToSquared( p3 ), pow );

			// safety check for repeated points
			if ( dt1 < 1e-4 ) dt1 = 1.0;
			if ( dt0 < 1e-4 ) dt0 = dt1;
			if ( dt2 < 1e-4 ) dt2 = dt1;

			px.initNonuniformCatmullRom( p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2 );
			py.initNonuniformCatmullRom( p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2 );
			pz.initNonuniformCatmullRom( p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2 );

		} else if ( this.curveType === 'catmullrom' ) {

			px.initCatmullRom( p0.x, p1.x, p2.x, p3.x, this.tension );
			py.initCatmullRom( p0.y, p1.y, p2.y, p3.y, this.tension );
			pz.initCatmullRom( p0.z, p1.z, p2.z, p3.z, this.tension );

		}
		return weight;

	}

	// No overload needed for now, base class implementation is sufficient
	// getLength() {}

	setDuration(duration) {
		this.duration = duration
	}

	getDuration() {
		return this.duration
	}

	getPoint( t, optionalTarget = new Vector3() ) {

		const point = optionalTarget;
		const weight = this.prepareInterpolator( t );

		point.set(
			px.calc( weight ),
			py.calc( weight ),
			pz.calc( weight )
		);

		return point;

	}

	// Aborted attempt to solve a bug by recoding the getPoint function...
	// getPoint( t, optionalTarget = new Vector3() ) {
	// 	const points = this.points
	// 	const l = points.length
	// 	let indexP1, weight
	// 	if (t == 1) {
	// 		indexP1 = l - 2
	// 		weight = 1
	// 	}
	// 	else {
	// 		indexP1 = Math.floor( t * ( l - 1 ) )
	// 		weight = t * ( l - 1 ) - indexP1
	// 	}
	// 	let p0, p1, p2, p3
	// 	if (indexP1>0) {
	// 		p0 = points[ indexP1 - 1 ].clone();
	// 	}
	// 	else {
	// 		p0 = points[indexP1].clone().multiplyScalar(2).sub(points[indexP1+1]);
	// 	}
	// 	p1 = points[ indexP1 ].clone();
	// 	p2 = points[ indexP1 + 1 ].clone();
	// 	if (indexP1 + 2 < l) {
	// 		p3 = points[ indexP1 + 2 ].clone();
	// 	}
	// 	else {
	// 		p3 = points[indexP1 + 1].clone().multiplyScalar(2).sub(points[indexP1]);
	// 	}

	// 	const t2 = weight * weight;
	// 	const t3 = t2 * weight;

	// 	const pow = this.curveType === 'chordal' ? 0.5 : 0.25;
	// 	let dt0 = Math.pow( p0.distanceToSquared( p1 ), pow );
	// 	let dt1 = Math.pow( p1.distanceToSquared( p2 ), pow );
	// 	let dt2 = Math.pow( p2.distanceToSquared( p3 ), pow );

	// 	let c0, c1, c2, c3; // coefficients of the cubic polynomial
	// 	const outPoint = optionalTarget;

	// 	outPoint.x = nonuniformCatmullRom( p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2 );
	// 	outPoint.y = nonuniformCatmullRom( p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2 );
	// 	outPoint.z = nonuniformCatmullRom( p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2 );

	// 	function nonuniformCatmullRom( x0, x1, x2, x3, dt0, dt1, dt2 ) {

	// 		// compute tangents when parameterized in [t1,t2]
	// 		let t1 = ( x1 - x0 ) / dt0 - ( x2 - x0 ) / ( dt0 + dt1 ) + ( x2 - x1 ) / dt1;
	// 		let t2 = ( x2 - x1 ) / dt1 - ( x3 - x1 ) / ( dt1 + dt2 ) + ( x3 - x2 ) / dt2;

	// 		// rescale tangents for parametrization in [0,1]
	// 		t1 *= dt1;
	// 		t2 *= dt1;

	// 		const c0 = x1;
	// 		const c1 = t1;
	// 		const c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2;
	// 		const c3 = 2 * x1 - 2 * x2 + t1 + t2;
	// 		return c3 * t3 + c2 * t2 + c1 * t + c0;

	// 	}

	// 	return outPoint;

	// }

	getTangent( t, optionalTarget = new Vector3() ) {

		const tangent = optionalTarget;
		const weight = this.prepareInterpolator( t );

		tangent.set(
			px.calcFirstDerivative( weight ),
			py.calcFirstDerivative( weight ),
			pz.calcFirstDerivative( weight )
		);
		tangent.normalize();

		return tangent;

	}

	getRawNormal( t, optionalTarget = new Vector3() ) {

		const rawNormal = optionalTarget;
		const weight = this.prepareInterpolator( t );

		const firstDerivative = new Vector3(
			px.calcFirstDerivative( weight ),
			py.calcFirstDerivative( weight ),
			pz.calcFirstDerivative( weight )
		); 
		const secondDerivative = new Vector3(
			px.calcSecondDerivative( weight ),
			py.calcSecondDerivative( weight ),
			pz.calcSecondDerivative( weight )
		);
		const sum = firstDerivative.clone().add(secondDerivative);
		const axisOfRotation = sum.cross(firstDerivative);
		rawNormal.copy(firstDerivative).cross(axisOfRotation);

		return rawNormal;

	}

	getNormal( t, optionalTarget = new Vector3() ) {
    
    if (this.normalMode === 'alwaysAway') {
      const tangent = this.getTangent(t)
      const position = this.getPoint(t)
      const binormal = tangent.clone().cross(position).normalize()
      const normal = binormal.clone().cross(tangent)
      return normal
    }
    else {
  		return this.getRawNormal(t, optionalTarget).normalize();
    }

	}
	
	getRawBinormal( t, optionalTarget = new Vector3() ) {

		const rawBinormal = optionalTarget;
		const rawNormal = this.getRawNormal(t);
		const tangent = this.getTangent(t);
		rawBinormal.copy(tangent).cross(rawNormal);

		return rawBinormal;
	}

	getBinormal( t, optionalTarget = new Vector3() ) {

    if (this.normalMode === 'alwaysAway') {
      const tangent = this.getTangent(t)
      const position = this.getPoint(t)
      const binormal = tangent.clone().cross(position).normalize()
      return binormal
    }
    else {
  		return this.getRawBinormal(t, optionalTarget).normalize();
    }

	}
	
	getUtoTmapping( u, distance ) {

		const arcLengths = this.getLengths();

		let i = 0;
		const il = arcLengths.length;

		let targetArcLength; // The targeted u distance value to get

		if ( distance ) {

			targetArcLength = distance;

		} else {

			targetArcLength = u * arcLengths[ il - 1 ];

		}

		// binary search for the index with largest value smaller than target u distance

		let low = 0, high = il - 1, comparison;

		while ( low <= high ) {

			i = Math.floor( low + ( high - low ) / 2 ); // less likely to overflow, though probably not issue here, JS doesn't really have integers, all numbers are floats

			comparison = arcLengths[ i ] - targetArcLength;

			if ( comparison < 0 ) {

				low = i + 1;

			} else if ( comparison > 0 ) {

				high = i - 1;

			} else {

				high = i;
				break;

				// DONE

			}

		}

		i = high;

		if ( arcLengths[ i ] === targetArcLength ) {

			return i / ( il - 1 );

		}

		// we could get finer grain at lengths, or use simple interpolation between two points

		const lengthBefore = arcLengths[ i ];
		const lengthAfter = arcLengths[ i + 1 ];

		const segmentLength = lengthAfter - lengthBefore;

		// determine where we are between the 'before' and 'after' points

		const segmentFraction = ( targetArcLength - lengthBefore ) / segmentLength;

		// add that fractional amount to t

		const t = ( i + segmentFraction ) / ( il - 1 );

		return t;

	}

	getPointAt(u, optionalTarget = new Vector3() ) {

		const t = this.getUtoTmapping( u );
		return this.getPoint( t, optionalTarget );

	}

	getTangentAt(u, optionalTarget = new Vector3() ) {

		const t = this.getUtoTmapping( u );
		return this.getTangent(t, optionalTarget );

	}

	getRawNormalAt(u, optionalTarget = new Vector3() ) {

		const t = this.getUtoTmapping( u );
		return this.getRawNormal(t, optionalTarget );

	}

	getNormalAt(u, optionalTarget = new Vector3() ) {

		const t = this.getUtoTmapping( u );
		return this.getNormal(t, optionalTarget).normalize();
	
	}

	getRawBinormalAt(u, optionalTarget = new Vector3() ) {

		const t = this.getUtoTmapping( u );
		return this.getRawBinormal(t, optionalTarget );

	}
	
	getBinormalAt(u, optionalTarget = new Vector3() ) {

		const t = this.getUtoTmapping( u );
		return this.getBinormal(t, optionalTarget).normalize();
	
	}

	getQuaternion( t, objectForward = new Vector3(0, 1, 0), objectUpward = new Vector3(0, 0, 1), optionalTarget = new Quaternion() ) {

		const q1 = optionalTarget
		const tangent = this.getTangent(t)
		const normal = this.getNormal(t)
		q1.setFromUnitVectors(objectForward, tangent)
		const rotatedObjectUpwardVector = objectUpward.clone().applyQuaternion(q1)
		const q2 = new Quaternion
		q2.setFromUnitVectors(rotatedObjectUpwardVector, normal)
		q2.multiply(q1)
		return q2
		
	}

	getQuaternionAt(u, objectForward = new Vector3(0, 1, 0), objectUpward = new Vector3(0, 0, 1), optionalTarget = new Quaternion() ) {

		const t = this.getUtoTmapping( u );
		return this.getQuaternion( t, objectForward, objectUpward, optionalTarget );
	
	}

	getStartFinishZoneIndices( sphereCenter, sphereRadius ) {

		let startDValue = null
		let finishDValue = null
		// ToDo: Need a more efficient and reliable algorithm here...
		for (let d = 0; d<=1; d+=0.001) {
			const point = this.getPointAt(d)
			const distance = point.distanceTo(sphereCenter)
			if (distance < sphereRadius) {
				if (startDValue === null) {
					startDValue = d
				}
				finishDValue = d
			}
		}
		if ((startDValue === null) || (finishDValue === null)) {
			return []
		}
		else {
			return [startDValue, finishDValue]
		}

	}

	addtToiConvertor( tToiConvertor ) {
		this.tToi = tToiConvertor
	}

	addtTodConvertor( tTodConvertor ) {
		this.tTod = tTodConvertor
	}

	addtTosConvertor( tTosConvertor ) {
		this.tTos = tTosConvertor
	}

	copy( source ) {

		super.copy( source );

		this.points = [];

		for ( let i = 0, l = source.points.length; i < l; i ++ ) {

			const point = source.points[ i ];

			this.points.push( point.clone() );

		}

		this.closed = source.closed;
		this.curveType = source.curveType;
		this.tension = source.tension;

		return this;

	}

	toJSON() {

		const data = super.toJSON();

		data.points = [];

		for ( let i = 0, l = this.points.length; i < l; i ++ ) {

			const point = this.points[ i ];
			data.points.push( point.toArray() );

		}

		data.closed = this.closed;
		data.curveType = this.curveType;
		data.tension = this.tension;

		return data;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.points = [];

		for ( let i = 0, l = json.points.length; i < l; i ++ ) {

			const point = json.points[ i ];
			this.points.push( new Vector3().fromArray( point ) );

		}

		this.closed = json.closed;
		this.curveType = json.curveType;
		this.tension = json.tension;

		return this;

	}

}

export { CatmullRomSuperCurve3 };
