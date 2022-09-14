import {
	BufferAttribute,
	Float32BufferAttribute,
	BufferGeometry,
	Quaternion,
	Vector2,
	Vector3,
	Shape,
	ShapeUtils
} from '../three.js/build/three.module.js';
//} from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js';

import * as Curves from '../three.js/build/three.module.js';
//import * as Curves from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js';

//import { BufferGeometry } from '../core/BufferGeometry.js';
//import { Float32BufferAttribute } from '../core/BufferAttribute.js';
//import * as Curves from '../extras/curves/Curves.js';
//import { Vector2 } from '../math/Vector2.js';
//import { Vector3 } from '../math/Vector3.js';
//import { Shape } from '../extras/core/Shape.js';
//import { ShapeUtils } from '../extras/ShapeUtils.js';

class simpleExtrudeGeometry extends BufferGeometry {

	constructor( shapes = new Shape( [ new Vector2( 0.5, 0.5 ), new Vector2( - 0.5, 0.5 ), new Vector2( - 0.5, - 0.5 ), new Vector2( 0.5, - 0.5 ) ] ), options = {} ) {

		super();

		this.type = 'simpleExtrudeGeometry';

		this.parameters = {
			shapes: shapes,
			options: options
		};

		shapes = Array.isArray( shapes ) ? shapes : [ shapes ];

		const scope = this;

		const verticesArray = [];
		const uvArray = [];

		for ( let i = 0, l = shapes.length; i < l; i ++ ) {

			const shape = shapes[ i ];
			addShape( shape );

		}

		// build geometry

		this.setAttribute( 'position', new Float32BufferAttribute( verticesArray, 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute( uvArray, 2 ) );

		this.computeVertexNormals();

		// functions

		function addShape( shape ) {

			const placeholder = [];

			// options

			const curveSegments = options.curveSegments !== undefined ? options.curveSegments : 12;
			const steps = options.steps !== undefined ? options.steps : 1;
			const depth = options.depth !== undefined ? options.depth : 1;

			const extrudePath = options.extrudePath;

			const uvgen = options.UVGenerator !== undefined ? options.UVGenerator : WorldUVGenerator;

			//

			let extrudePts, extrudeByPath = false;
			let splineTube, binormal, normal, position2;

			if ( extrudePath ) {

				// ToDo: Need to modeify this so that it uses a portion of the entire path as specified in the options.
				extrudePts = extrudePath.getSpacedPoints( steps );

				extrudeByPath = true;

				// SETUP TNB variables

				// TODO1 - have a .isClosed in spline?

				splineTube = extrudePath.computeFrenetFrames( steps, false );

				// console.log(splineTube, 'splineTube', splineTube.normals.length, 'steps', steps, 'extrudePts', extrudePts.length);

				binormal = new Vector3();
				normal = new Vector3();
				position2 = new Vector3();

			}

			// Variables initialization

			//const shapePoints = shape.extractPoints( curveSegments );
			const shapePoints = {
				shape: this.getPoints( divisions ),
				holes: this.getPointsHoles( divisions )
			};

			let vertices = shapePoints.shape;
			const holes = shapePoints.holes;

			const reverse = ! ShapeUtils.isClockWise( vertices );

			if ( reverse ) {

				vertices = vertices.reverse();

				// Maybe we should also check if holes are in the opposite direction, just to be safe ...

				for ( let h = 0, hl = holes.length; h < hl; h ++ ) {

					const ahole = holes[ h ];

					if ( ShapeUtils.isClockWise( ahole ) ) {

						holes[ h ] = ahole.reverse();

					}

				}

			}


			const faces = ShapeUtils.triangulateShape( vertices, holes );

			/* Vertices */

			const contour = vertices; // vertices has all points but contour has only points of circumference

			for ( let h = 0, hl = holes.length; h < hl; h ++ ) {

				const ahole = holes[ h ];

				vertices = vertices.concat( ahole );

			}


			function scalePt2( pt, vec, size ) {

				if ( ! vec ) console.error( 'THREE.simpleExtrudeGeometry: vec does not exist' );

				return vec.clone().multiplyScalar( size ).add( pt );

			}

			const vlen = vertices.length, flen = faces.length;

			/* Faces */

			// Sides faces
			buildSideFaces();

			/////  Internal functions

			// Create faces for the z-sides of the shape

			function buildSideFaces() {

				const start = verticesArray.length / 3;
				let layeroffset = 0;
				sidewalls( contour, layeroffset );
				layeroffset += contour.length;

				for ( let h = 0, hl = holes.length; h < hl; h ++ ) {

					const ahole = holes[ h ];
					sidewalls( ahole, layeroffset );

					//, true
					layeroffset += ahole.length;

				}


				scope.addGroup( start, verticesArray.length / 3 - start, 1 );


			}

			function sidewalls( contour, layeroffset ) {

				let i = contour.length;

				while ( -- i >= 0 ) {

					const j = i;
					let k = i - 1;
					if ( k < 0 ) k = contour.length - 1;

					//console.log('b', i,j, i-1, k,vertices.length);

					for ( let s = 0, sl = steps; s < sl; s ++ ) {

						const slen1 = vlen * s;
						const slen2 = vlen * ( s + 1 );

						const a = layeroffset + j + slen1,
							b = layeroffset + k + slen1,
							c = layeroffset + k + slen2,
							d = layeroffset + j + slen2;

						f4( a, b, c, d );

					}

				}

			}

			function v( x, y, z ) {

				placeholder.push( x );
				placeholder.push( y );
				placeholder.push( z );

			}


			function f3( a, b, c ) {

				addVertex( a );
				addVertex( b );
				addVertex( c );

				const nextIndex = verticesArray.length / 3;
				const uvs = uvgen.generateTopUV( scope, verticesArray, nextIndex - 3, nextIndex - 2, nextIndex - 1 );

				addUV( uvs[ 0 ] );
				addUV( uvs[ 1 ] );
				addUV( uvs[ 2 ] );

			}

			function f4( a, b, c, d ) {

				addVertex( a );
				addVertex( b );
				addVertex( d );

				addVertex( b );
				addVertex( c );
				addVertex( d );


				const nextIndex = verticesArray.length / 3;
				const uvs = uvgen.generateSideWallUV( scope, verticesArray, nextIndex - 6, nextIndex - 3, nextIndex - 2, nextIndex - 1 );

				addUV( uvs[ 0 ] );
				addUV( uvs[ 1 ] );
				addUV( uvs[ 3 ] );

				addUV( uvs[ 1 ] );
				addUV( uvs[ 2 ] );
				addUV( uvs[ 3 ] );

			}

			function addVertex( index ) {

				verticesArray.push( placeholder[ index * 3 + 0 ] );
				verticesArray.push( placeholder[ index * 3 + 1 ] );
				verticesArray.push( placeholder[ index * 3 + 2 ] );

			}


			function addUV( vector2 ) {

				uvArray.push( vector2.x );
				uvArray.push( vector2.y );

			}

		}

	}

	toJSON() {

		const data = super.toJSON();

		const shapes = this.parameters.shapes;
		const options = this.parameters.options;

		return toJSON( shapes, options, data );

	}

	static fromJSON( data, shapes ) {

		const geometryShapes = [];
		for ( let j = 0, jl = data.shapes.length; j < jl; j ++ ) {
			const shape = shapes[ data.shapes[ j ] ];
			geometryShapes.push( shape );
		}

		const extrudePath = data.options.extrudePath;
		if ( extrudePath !== undefined ) {
			data.options.extrudePath = new Curves[ extrudePath.type ]().fromJSON( extrudePath );
		}

		return new simpleExtrudeGeometry( geometryShapes, data.options );

	}

}

const WorldUVGenerator = {

	generateSideWallUV: function ( geometry, vertices, indexA, indexB, indexC, indexD ) {

		const a_x = vertices[ indexA * 3 ];
		const a_y = vertices[ indexA * 3 + 1 ];
		const a_z = vertices[ indexA * 3 + 2 ];
		const b_x = vertices[ indexB * 3 ];
		const b_y = vertices[ indexB * 3 + 1 ];
		const b_z = vertices[ indexB * 3 + 2 ];
		const c_x = vertices[ indexC * 3 ];
		const c_y = vertices[ indexC * 3 + 1 ];
		const c_z = vertices[ indexC * 3 + 2 ];
		const d_x = vertices[ indexD * 3 ];
		const d_y = vertices[ indexD * 3 + 1 ];
		const d_z = vertices[ indexD * 3 + 2 ];

		if ( Math.abs( a_y - b_y ) < Math.abs( a_x - b_x ) ) {

			return [
				new Vector2( a_x, 1 - a_z ),
				new Vector2( b_x, 1 - b_z ),
				new Vector2( c_x, 1 - c_z ),
				new Vector2( d_x, 1 - d_z )
			];

		} else {

			return [
				new Vector2( a_y, 1 - a_z ),
				new Vector2( b_y, 1 - b_z ),
				new Vector2( c_y, 1 - c_z ),
				new Vector2( d_y, 1 - d_z )
			];

		}

	}

};

function toJSON( shapes, options, data ) {

	data.shapes = [];
	if ( Array.isArray( shapes ) ) {
		for ( let i = 0, l = shapes.length; i < l; i ++ ) {
			const shape = shapes[ i ];
			data.shapes.push( shape.uuid );
		}
	} else {
		data.shapes.push( shapes.uuid );
	}

	data.options = Object.assign( {}, options );
	if ( options.extrudePath !== undefined ) data.options.extrudePath = options.extrudePath.toJSON();
	return data;

}

export { simpleExtrudeGeometry, simpleExtrudeGeometry as simpleExtrudeBufferGeometry };