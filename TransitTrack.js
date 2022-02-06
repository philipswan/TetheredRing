import {
	BufferAttribute,
	BufferGeometry,
	Quaternion,
	Vector3
} from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js';

export class mainRingTubeGeometry extends BufferGeometry {

	constructor( curve, start, end, referencePoint, divisions, mainRingOffset, tubeRadius ) {
		super();

		const vertices = [];
		const normals = [];
		const colors = [];

		const color1 = [ 1, 1, 1 ];
		const color2 = [ 1, 1, 0 ];

		const up = new Vector3( 0, 1, 0 );
        
		const forward = new Vector3();
		const right = new Vector3();

		const quaternion = new Quaternion();
		const prevQuaternion = new Quaternion();
		prevQuaternion.setFromAxisAngle( up, Math.PI / 2 );

    // The reference point is used to help make sure that all of the positional vectors are small numbers. This reduces jitters due to insufficient precision of floats

    const point = new Vector3()
		const prevPoint = new Vector3()
		prevPoint.copy( curve.getPointAt( start ) ).sub(referencePoint)

		const PI2 = Math.PI * 2;

    // Define the tube's cross section
    const tube = []
		let sides = 16
		for ( let i = 0; i < sides; i++ ) {
			const angle = ( i / sides ) * PI2;
			tube.push( new Vector3( Math.sin( angle ) * tubeRadius, Math.cos( angle ) * tubeRadius, 0 ) );
		}

		const vector = new Vector3();
		const normal = new Vector3();

    const vector1 = new Vector3();
		const vector2 = new Vector3();
		const vector3 = new Vector3();
		const vector4 = new Vector3();

		const normal1 = new Vector3();
		const normal2 = new Vector3();
		const normal3 = new Vector3();
		const normal4 = new Vector3();

		function extrudeTubeShape( shape, offset, color ) {

			for ( let j = 0, jl = shape.length; j < jl; j ++ ) {
				const point1 = shape[ j ].clone().add(offset)
				const point2 = shape[ ( j + 1 ) % jl ].clone().add(offset)

				vector1.copy( point ).add( point1 )
				vector2.copy( point ).add( point2 )
				vector3.copy( prevPoint ).add( point2 )
				vector4.copy( prevPoint ).add( point1 )

				vertices.push( vector1.x, vector1.y, vector1.z );
				vertices.push( vector2.x, vector2.y, vector2.z );
				vertices.push( vector4.x, vector4.y, vector4.z );

				vertices.push( vector2.x, vector2.y, vector2.z );
				vertices.push( vector3.x, vector3.y, vector3.z );
				vertices.push( vector4.x, vector4.y, vector4.z );
			}

		}

		const offset = new Vector3();

		for ( let i = 1; i <= divisions; i ++ ) {

			point.copy( curve.getPointAt( start + (end-start) * i / divisions ) )

      up.copy(point).normalize()
      point.sub(referencePoint)

      forward.subVectors( point, prevPoint ).normalize();
			right.crossVectors( up, forward ).normalize();
            
      extrudeTubeShape(tube, offset.set( 0, mainRingOffset, 0 ), color1 );
			prevPoint.copy( point );
		}

		this.setAttribute( 'position', new BufferAttribute( new Float32Array( vertices ), 3 ) );
		//this.setAttribute( 'normal', new BufferAttribute( new Float32Array( normals ), 3 ) );
		//this.setAttribute( 'color', new BufferAttribute( new Float32Array( colors ), 3 ) );

	}

}

export class transitTubeGeometry extends BufferGeometry {

	constructor( curve, start, end, referencePoint, divisions, outwardOffset, upwardOffset, tubeRadius ) {
		super();

		const vertices = [];
		const normals = [];
		const colors = [];

		const color1 = [ .4, .6, .8 ];
		const color2 = [ 1, 1, 0 ];

		const up = new Vector3( 0, 1, 0 );
        
		const forward = new Vector3();
		const right = new Vector3();

		const quaternion = new Quaternion();
		const prevQuaternion = new Quaternion();
		prevQuaternion.setFromAxisAngle( up, Math.PI / 2 );

    // The reference point is used to help make sure that all of the positional vectors are small numbers. This reduces jitters due to insufficient precision of floats

    const point = new Vector3()
		const prevPoint = new Vector3()
		prevPoint.copy( curve.getPointAt( start ) ).sub(referencePoint)

		const PI2 = Math.PI * 2;

    // Define the tube's cross section
    const tube = []
		let sides = 16
		for ( let i = 0; i < sides; i++ ) {
			const angle = ( i / sides ) * PI2;
			tube.push( new Vector3( Math.sin( angle ) * tubeRadius, Math.cos( angle ) * tubeRadius, 0 ) );
		}

		const vector = new Vector3();
		const normal = new Vector3();

    const vector1 = new Vector3();
		const vector2 = new Vector3();
		const vector3 = new Vector3();
		const vector4 = new Vector3();

		const normal1 = new Vector3();
		const normal2 = new Vector3();
		const normal3 = new Vector3();
		const normal4 = new Vector3();

		function extrudeTubeShape( shape, offset, color ) {

			for ( let j = 0, jl = shape.length; j < jl; j ++ ) {
				const point1 = shape[ j ]
				const point2 = shape[ ( j + 1 ) % jl ]
				const point1b = point1.clone().add(offset)
				const point2b = point2.clone().add(offset)

				vector1.copy( point ).add( right.clone().multiplyScalar(point1b.x) ).add(up.clone().multiplyScalar(point1b.y))
				vector2.copy( point ).add( right.clone().multiplyScalar(point2b.x) ).add(up.clone().multiplyScalar(point2b.y))
				vector3.copy( prevPoint ).add( right.clone().multiplyScalar(point2b.x) ).add(up.clone().multiplyScalar(point2b.y))
				vector4.copy( prevPoint ).add( right.clone().multiplyScalar(point1b.x) ).add(up.clone().multiplyScalar(point1b.y))

				vertices.push( vector1.x, vector1.y, vector1.z );
				vertices.push( vector2.x, vector2.y, vector2.z );
				vertices.push( vector4.x, vector4.y, vector4.z );

				vertices.push( vector2.x, vector2.y, vector2.z );
				vertices.push( vector3.x, vector3.y, vector3.z );
				vertices.push( vector4.x, vector4.y, vector4.z );

				normal1.copy( point1 );
				normal1.applyQuaternion( quaternion );
				normal1.normalize();

				normal2.copy( point2 );
				normal2.applyQuaternion( quaternion );
				normal2.normalize();

				normal3.copy( point2 );
				normal3.applyQuaternion( prevQuaternion );
				normal3.normalize();

				normal4.copy( point1 );
				normal4.applyQuaternion( prevQuaternion );
				normal4.normalize();

				normals.push( normal1.x, normal1.y, normal1.z );
				normals.push( normal2.x, normal2.y, normal2.z );
				normals.push( normal4.x, normal4.y, normal4.z );

				normals.push( normal2.x, normal2.y, normal2.z );
				normals.push( normal3.x, normal3.y, normal3.z );
				normals.push( normal4.x, normal4.y, normal4.z );

				colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
				colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
				colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );

				colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
				colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
				colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );

			}

		}

		const offset = new Vector3();

		for ( let i = 1; i <= divisions; i ++ ) {

			point.copy( curve.getPointAt( start + (end-start) * i / divisions ) )

      up.copy(point).normalize()
      point.sub(referencePoint)

      forward.subVectors( point, prevPoint ).normalize();
			right.crossVectors( up, forward ).normalize();
            
      extrudeTubeShape(tube, offset.set( outwardOffset, upwardOffset, 0 ), color1 );
			prevPoint.copy( point );
		}

		this.setAttribute( 'position', new BufferAttribute( new Float32Array( vertices ), 3 ) );
		this.setAttribute( 'normal', new BufferAttribute( new Float32Array( normals ), 3 ) );
		this.setAttribute( 'color', new BufferAttribute( new Float32Array( colors ), 3 ) );

	}

}

export class transitTrackGeometry extends BufferGeometry {

	constructor( curve, start, end, referencePoint, divisions, outwardOffset, upwardOffset, trackHalfWidth, trackHalfHeight ) {
		super();

		const vertices = [];
		const normals = [];
		const colors = [];

		const color1 = [ 1, 1, 1 ];
		const color2 = [ 1, 1, 0 ];

		const up = new Vector3( 0, 1, 0 );
        
		const forward = new Vector3();
		const right = new Vector3();

		const quaternion = new Quaternion();
		const prevQuaternion = new Quaternion();
		prevQuaternion.setFromAxisAngle( up, Math.PI / 2 );

        // The reference point is used to help make sure that all of the positional vectors are small numbers. This reduces jitters due to insufficient precision of floats

    const point = new Vector3()
		const prevPoint = new Vector3()
		prevPoint.copy( curve.getPointAt( start ) ).sub(referencePoint)

		const PI2 = Math.PI * 2;

    // Define the track's cross section
    const track = []
		let sides = 4
    const sign1 = [-1, 1, 1, -1]
    const sign2 = [-1, -1, 1, 1]
		for ( let i = 0; i < sides; i++ ) {
			track.push( new Vector3( trackHalfWidth * sign1[i], trackHalfHeight * sign2[i], 0 ) )
		}

		const vector = new Vector3();
		const normal = new Vector3();

    const vector1 = new Vector3();
		const vector2 = new Vector3();
		const vector3 = new Vector3();
		const vector4 = new Vector3();

		const normal1 = new Vector3();
		const normal2 = new Vector3();
		const normal3 = new Vector3();
		const normal4 = new Vector3();

		function extrudeTrackShape( shape, offset, color ) {

			for ( let j = 0, jl = shape.length; j < jl; j ++ ) {
				const point1 = shape[ j ].clone().add(offset)
				const point2 = shape[ ( j + 1 ) % jl ].clone().add(offset)

				vector1.copy( point ).add( right.clone().multiplyScalar(point1.x) ).add(up.clone().multiplyScalar(point1.y))
				vector2.copy( point ).add( right.clone().multiplyScalar(point2.x) ).add(up.clone().multiplyScalar(point2.y))
				vector3.copy( prevPoint ).add( right.clone().multiplyScalar(point2.x) ).add(up.clone().multiplyScalar(point2.y))
				vector4.copy( prevPoint ).add( right.clone().multiplyScalar(point1.x) ).add(up.clone().multiplyScalar(point1.y))

				vertices.push( vector1.x, vector1.y, vector1.z );
				vertices.push( vector2.x, vector2.y, vector2.z );
				vertices.push( vector4.x, vector4.y, vector4.z );

				vertices.push( vector2.x, vector2.y, vector2.z );
				vertices.push( vector3.x, vector3.y, vector3.z );
				vertices.push( vector4.x, vector4.y, vector4.z );
			}

		}

		const offset = new Vector3();

		for ( let i = 1; i <= divisions; i ++ ) {

			point.copy( curve.getPointAt( start + (end-start) * i / divisions ) )

      up.copy(point).normalize()
      point.sub(referencePoint)

      forward.subVectors( point, prevPoint ).normalize();
			right.crossVectors( up, forward ).normalize();
            
      extrudeTrackShape(track, offset.set( outwardOffset, upwardOffset, 0 ), color1 );
			prevPoint.copy( point );
		}

		this.setAttribute( 'position', new BufferAttribute( new Float32Array( vertices ), 3 ) );
		//this.setAttribute( 'normal', new BufferAttribute( new Float32Array( normals ), 3 ) );
		//this.setAttribute( 'color', new BufferAttribute( new Float32Array( colors ), 3 ) );

	}

}

