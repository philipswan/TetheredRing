import { SuperCurve } from './SuperCurve.js';
import * as SuperCurves from '.SuperCurves.js';

/**************************************************************
 *	SuperCurved Path - a SuperCurve path is simply a array of connected
 *  SuperCurves, but retains the api of a SuperCurve
 **************************************************************/

class SuperCurvePath extends SuperCurve {

	constructor() {

		super();

		this.type = 'SuperCurvePath';

		this.superCurves = [];
		this.autoClose = false; // Automatically closes the path

	}

	add( curve ) {

		this.superCurves.push( curve );

	}

	closePath() {

		// Add a line curve if start and end of lines are not connected
		const startPoint = this.superCurves[ 0 ].getPoint( 0 );
		const endPoint = this.superCurves[ this.superCurves.length - 1 ].getPoint( 1 );

		if ( ! startPoint.equals( endPoint ) ) {

			this.superCurves.push( new SuperCurves[ 'LineSuperCurve' ]( endPoint, startPoint ) );

		}

	}

	// To get accurate point with reference to
	// entire path distance at time t,
	// following has to be done:

	// 1. Length of each sub path have to be known
	// 2. Locate and identify type of curve
	// 3. Get t for the curve
	// 4. Return curve.getPointAt(t')

	getPoint( t, optionalTarget ) {

		const d = t * this.getLength();
		const curveLengths = this.getSuperCurveLengths();
		let i = 0;

		// To think about boundaries points.

		while ( i < curveLengths.length ) {

			if ( curveLengths[ i ] >= d ) {

				const diff = curveLengths[ i ] - d;
				const curve = this.superCurves[ i ];

				const segmentLength = curve.getLength();
				const u = segmentLength === 0 ? 0 : 1 - diff / segmentLength;

				return curve.getPointAt( u, optionalTarget );

			}

			i ++;

		}

		return null;

		// loop where sum != 0, sum > d , sum+1 <d

	}

	// We cannot use the default THREE.SuperCurve getPoint() with getLength() because in
	// THREE.SuperCurve, getLength() depends on getPoint() but in THREE.SuperCurvePath
	// getPoint() depends on getLength

	getLength() {

		const lens = this.getSuperCurveLengths();
		return lens[ lens.length - 1 ];

	}

	// cacheLengths must be recalculated.
	updateArcLengths() {

		this.needsUpdate = true;
		this.cacheLengths = null;
		this.getCurveLengths();

	}

	// Compute lengths and cache them
	// We cannot overwrite getLengths() because UtoT mapping uses it.

	getCurveLengths() {

		// We use cache values if superCurves and cache array are same length

		if ( this.cacheLengths && this.cacheLengths.length === this.superCurves.length ) {

			return this.cacheLengths;

		}

		// Get length of sub-curve
		// Push sums into cached array

		const lengths = [];
		let sums = 0;

		for ( let i = 0, l = this.superCurves.length; i < l; i ++ ) {

			sums += this.superCurves[ i ].getLength();
			lengths.push( sums );

		}

		this.cacheLengths = lengths;

		return lengths;

	}

	getSpacedPoints( divisions = 40 ) {

		const points = [];

		for ( let i = 0; i <= divisions; i ++ ) {

			points.push( this.getPoint( i / divisions ) );

		}

		if ( this.autoClose ) {

			points.push( points[ 0 ] );

		}

		return points;

	}

	getPoints( divisions = 12 ) {

		const points = [];
		let last;

		for ( let i = 0, superCurves = this.superCurves; i < superCurves.length; i ++ ) {

			const curve = superCurves[ i ];
			const resolution = curve.isEllipseSuperCurve ? divisions * 2
				: ( curve.isLineCurve || curve.isLineSuperCurve3 ) ? 1
					: curve.isSplineSuperCurve ? divisions * curve.points.length
						: divisions;

			const pts = curve.getPoints( resolution );

			for ( let j = 0; j < pts.length; j ++ ) {

				const point = pts[ j ];

				if ( last && last.equals( point ) ) continue; // ensures no consecutive points are duplicates

				points.push( point );
				last = point;

			}

		}

		if ( this.autoClose && points.length > 1 && ! points[ points.length - 1 ].equals( points[ 0 ] ) ) {

			points.push( points[ 0 ] );

		}

		return points;

	}

	copy( source ) {

		super.copy( source );

		this.superCurves = [];

		for ( let i = 0, l = source.superCurves.length; i < l; i ++ ) {

			const curve = source.superCurves[ i ];

			this.superCurves.push( curve.clone() );

		}

		this.autoClose = source.autoClose;

		return this;

	}

	toJSON() {

		const data = super.toJSON();

		data.autoClose = this.autoClose;
		data.superCurves = [];

		for ( let i = 0, l = this.superCurves.length; i < l; i ++ ) {

			const curve = this.superCurves[ i ];
			data.superCurves.push( curve.toJSON() );

		}

		return data;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.autoClose = json.autoClose;
		this.superCurves = [];

		for ( let i = 0, l = json.superCurves.length; i < l; i ++ ) {

			const curve = json.superCurves[ i ];
			this.superCurves.push( new SuperCurves[ curve.type ]().fromJSON( curve ) );

		}

		return this;

	}

}


export { SuperCurvePath };
