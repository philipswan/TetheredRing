import {
	Float32BufferAttribute,
	BufferGeometry,
	Vector2,
	Vector3
} from 'three'

import * as Curves from 'three/src/extras/curves/Curves.js';

class ScrewGeometry extends BufferGeometry {

	constructor(
		path = new Curves[ 'QuadraticBezierCurve3' ] ( 
			new Vector3( - 1, - 1, 0 ),
			new Vector3( - 1, 1, 0 ),
			new Vector3( 1, 1, 0 ) ),
		tubularSegments = 128,
		shaftRadius = 1,
		threadRadius = 2,
		threadThickness = .2,
		threadStarts = 2,
		baseDistanceAlongScrew = 0,
		initialVelocity = 1,
		revolutionsPerSecond = 1,
		acceleration = 0,
		radialSegments = 8,
		initialRotation = 0) {

		super();

		this.type = 'ScrewGeometry';

		this.parameters = {
			path: path,
			tubularSegments: tubularSegments,
			shaftRadius: shaftRadius,
			threadRadius: threadRadius,
			threadThickness: threadThickness,
			threadStarts: threadStarts,
			baseDistanceAlongScrew: baseDistanceAlongScrew,  // This the distance from the start of the mass driver to the start of this segment of the screw.
			initialVelocity: initialVelocity,
			revolutionsPerSecond: revolutionsPerSecond,
			acceleration: acceleration,
			radialSegments: radialSegments,
			initialRotation: initialRotation,
		};

		const frames = path.computeFrenetFrames( tubularSegments, closed );

		// expose internals

		this.tangents = frames.tangents;
		this.normals = frames.normals;
		this.binormals = frames.binormals;

		// helper variables

		const vertex = new Vector3();
		const normal = new Vector3();
		const uv = new Vector2();
		const vertexArray = [];
		const uvArray = [];

		let P = new Vector3();

		// buffer

		const vertices = [];
		const normals = [];
		const uvs = [];
		const indices = [];

		// create buffer data

		generateBufferData();

		// build geometry

		this.setIndex( indices );
		this.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
		this.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );

		// functions

		function generateBufferData() {

			const curveLength = path.getLength();

			for ( let i = 0; i <= tubularSegments; i++) {
				generateSegmentsAndUVs( i, curveLength, 0);
			}
			// Need an extra vertices at each end of the screw to construct the flat surfaces that cap the ends
			generateSegmentsAndUVs( 0, curveLength, 1);
			generateSegmentsAndUVs( tubularSegments, curveLength, 2);

			// Need an extra vertex at the center of each end of the screw. These will be used to construct the flat surfaces that cap the ends
			for (let i = 0; i <= tubularSegments; i+=tubularSegments) {
				P = path.getPointAt( i / tubularSegments, P );
				vertices.push( P.x, P.y, P.z );
				const T = frames.tangents[ i ];
				if (i==0) {
					normals.push( -T.x, -T.y, -T.z );
				}
				else {
					normals.push( T.x, T.y, T.z );
				}
			}

			//generateUVs();
			// finally create faces
			generateIndices();

		}

		function generateSegmentsAndUVs( i, curveLength, sideOrEndsSelector ) {

			// we use getPointAt to sample evenly distributed points from the given path

			P = path.getPointAt( i / tubularSegments, P );

			// retrieve corresponding normal and binormal

			const T = frames.tangents[ i ];
			const N = frames.normals[ i ];
			const B = frames.binormals[ i ];

			// Figure out the start angle and end angle given the thickness, pitch, and the number of starts of the thread.
			const distanceAlongScrew = baseDistanceAlongScrew + i / tubularSegments * curveLength
			//0 = 0.5 * a * t**2 + v0 * t - d
			const cA = 0.5 * acceleration
			const cB = initialVelocity
			const cC = -distanceAlongScrew
			const time = (-cB - Math.sqrt(cB**2 - 4*cA*cC)) / (2*cA)

			const rotations = revolutionsPerSecond * time
			const rateOfChangeInRotationalDistance = 2 * Math.PI * threadRadius * Math.abs(revolutionsPerSecond)
			const rateOfChangeInForwardDisplacement = initialVelocity + acceleration * time   // We're going to assume that the launch sled does not start from zero velocity because this would require an thread pitch of zero, which is not manufacturable.
			const threadPitch = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance
	
			const threadHalfOfCrossWidth = Math.min(threadThickness/2 * Math.sqrt(threadPitch**2+1) / Math.abs(threadPitch), shaftRadius/2);
			const threadBaseHalfAngle = Math.asin(threadHalfOfCrossWidth/shaftRadius);
			const threadBaseEndAngle = 2 * Math.PI / threadStarts - threadBaseHalfAngle;
			const threadTopHalfAngle = Math.asin(threadHalfOfCrossWidth/threadRadius);
			// generate normals and vertices for the current segment
			const angularStep1 = (threadBaseEndAngle - threadBaseHalfAngle) / radialSegments;

			const x0 = Math.cos(threadBaseHalfAngle) * shaftRadius
			const y0 = Math.sin(threadBaseHalfAngle) * shaftRadius
			const x1 = Math.cos(threadTopHalfAngle) * threadRadius
			const y1 = Math.sin(threadTopHalfAngle) * threadRadius
			const threadSideWallHeight = Math.sqrt((x1-x0)**2 + (y1-y0)**2)
			const perimeterLength = (2 * Math.PI - threadStarts * 2 * threadBaseHalfAngle) * shaftRadius + threadStarts * (2 * threadSideWallHeight + threadThickness)

			for (let k = 0; k < threadStarts; k++) {
				const precomputedPartOfAngle1 = 2 * Math.PI * ((initialRotation + rotations + k / threadStarts) );
				const precomputedPartOfAngle2 = precomputedPartOfAngle1 + threadBaseHalfAngle;
				const precomputedPartOfAngle3 = 2 * Math.PI * ((initialRotation + rotations + ((k+1) / threadStarts))%1 );

				// Generate the normals and vertices for the three faces of the thread
				const v = []
				v.push(precomputedPartOfAngle3 - threadBaseHalfAngle);
				v.push(precomputedPartOfAngle3 - threadTopHalfAngle);
				v.push(precomputedPartOfAngle3 + threadTopHalfAngle);
				v.push(precomputedPartOfAngle3 + threadBaseHalfAngle);

				// Generate the normals and vertices that define the curves surface of the shaft
				for (let j = 0; j <= radialSegments; j++) {

					const v = precomputedPartOfAngle2 + j * angularStep1;

					const sin = Math.sin( v );
					const cos = -Math.cos( v );

					// normal
					normal.x = ( cos * N.x + sin * B.x );
					normal.y = ( cos * N.y + sin * B.y );
					normal.z = ( cos * N.z + sin * B.z );
					normal.normalize();  // Really needed?

					switch (sideOrEndsSelector) {
					case 0:
						normals.push( normal.x, normal.y, normal.z );
						break;
					case 1:
						normals.push( -T.x, -T.y, -T.z );
						break;
					case 2:
						normals.push( T.x, T.y, T.z );
						break;
					}

					// vertex

					vertex.x = P.x + shaftRadius * normal.x;
					vertex.y = P.y + shaftRadius * normal.y;
					vertex.z = P.z + shaftRadius * normal.z;

					vertices.push( vertex.x, vertex.y, vertex.z );

				}

				// Thread Faces
				for (let j = 0; j<3; j++) {
					const nv = precomputedPartOfAngle3 + ((j-1) * Math.PI/2)
					const sin = Math.sin(nv);
					const cos = -Math.cos(nv);
					normal[j] = new Vector3()
					normal[j].x = cos * N.x + sin * B.x;
					normal[j].y = cos * N.y + sin * B.y;
					normal[j].z = cos * N.z + sin * B.z;
					normal[j].normalize();
				}

				for (let j = 0; j<4; j++) {
					const vv = v[j]
					const sin = Math.sin(vv);
					const cos = -Math.cos(vv);
					vertexArray[j] = new Vector3()
					const r = (j==0 || j==3) ? shaftRadius : threadRadius;
					vertexArray[j].x = P.x + r * (cos * N.x + sin * B.x);
					vertexArray[j].y = P.y + r * (cos * N.y + sin * B.y);
					vertexArray[j].z = P.z + r * (cos * N.z + sin * B.z);
				}

				// Thread back face
				vertices.push( vertexArray[0].x, vertexArray[0].y, vertexArray[0].z );
				vertices.push( vertexArray[1].x, vertexArray[1].y, vertexArray[1].z );

				// Thread top face
				vertices.push( vertexArray[1].x, vertexArray[1].y, vertexArray[1].z );
				vertices.push( vertexArray[2].x, vertexArray[2].y, vertexArray[2].z );

				// Thread front face
				vertices.push( vertexArray[2].x, vertexArray[2].y, vertexArray[2].z );
				vertices.push( vertexArray[3].x, vertexArray[3].y, vertexArray[3].z );

				switch (sideOrEndsSelector) {
				case 0:
					// Thread back face
					normals.push( normal[0].x, normal[0].y, normal[0].z );
					normals.push( normal[0].x, normal[0].y, normal[0].z );

					// Thread top face
					normals.push( normal[1].x, normal[1].y, normal[1].z );
					normals.push( normal[1].x, normal[1].y, normal[1].z );

					// Thread front face
					normals.push( normal[2].x, normal[2].y, normal[2].z );
					normals.push( normal[2].x, normal[2].y, normal[2].z );
					break;
				case 1:
					for (let j = 0; j<6; j++) {
						normals.push( -T.x, -T.y, -T.z );
					}
					break;
				case 2:
					for (let j = 0; j<6; j++) {
						normals.push( T.x, T.y, T.z );
					}
					break;
				}


				// Now compute the UVs
				switch (sideOrEndsSelector) {
				case 0:
					for ( let j = 0; j <= radialSegments; j++ ) {
						uv.x = i / tubularSegments;
						uv.y = Math.abs(initialRotation + rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * j / radialSegments * shaftRadius) / perimeterLength) % 1;
						uvs.push( uv.x, uv.y );
					}

					// Back face
					uv.x = i / tubularSegments;
					uv.y = Math.abs(initialRotation + rotations + ( k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftRadius) / perimeterLength) % 1;
					uvs.push( uv.x, uv.y );

					uv.x = i / tubularSegments;
					uv.y = Math.abs(initialRotation + rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftRadius + threadSideWallHeight) / perimeterLength) % 1;
					uvs.push( uv.x, uv.y );

					// Top face
					uvs.push( uv.x, uv.y );
					uv.x = i / tubularSegments;
					uv.y = Math.abs(initialRotation + rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftRadius + threadSideWallHeight + threadThickness) / perimeterLength) % 1;
					uvs.push( uv.x, uv.y );

					// Front Face
					uvs.push( uv.x, uv.y );
					uv.x = i / tubularSegments;
					uv.y = Math.abs(initialRotation + rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftRadius + threadSideWallHeight + threadThickness + threadSideWallHeight) / perimeterLength) % 1;
					uvs.push( uv.x, uv.y );
					break;
				case 1: case 2:
					for ( let j = 0; j <= radialSegments; j++ ) {
						const v = precomputedPartOfAngle2 + j * angularStep1;
						const sin = Math.sin( v );
						const cos = -Math.cos( v );
						uv.x = shaftRadius * cos
						uv.y = shaftRadius * sin
						uvs.push( uv.x, uv.y );
					}
					for (let j = 0; j<4; j++) {
						const vv = v[j]
						const sin = Math.sin(vv);
						const cos = -Math.cos(vv);
						uvArray[j] = new Vector2()
						const r = (j==0 || j==3) ? shaftRadius : threadRadius;
						uvArray[j].x = r * cos;
						uvArray[j].y = r * sin;
					}
	
					// Thread back edge
					uvs.push( uvArray[0].x, uvArray[0].y );
					uvs.push( uvArray[1].x, uvArray[1].y );
	
					// Thread top edge
					uvs.push( uvArray[1].x, uvArray[1].y );
					uvs.push( uvArray[2].x, uvArray[2].y );
	
					// Thread front edge
					uvs.push( uvArray[2].x, uvArray[2].y );
					uvs.push( uvArray[3].x, uvArray[3].y );
	
					break;

				}
			}
		}

		function generateIndices() {

			const verticiesPerThread = radialSegments + 1 + 6  // Part of shaft plus each thread comprises 3 faces with 2 verticies per face 
			for (let i = 1; i <= tubularSegments; i++) {
				for (let k = 0; k < threadStarts; k++) {
					
					// Generate the indices for the shaft
					for ( let j = 1; j <= radialSegments; j++) {
						let l = k * verticiesPerThread + j
						const a = verticiesPerThread * threadStarts * ( i - 1 ) + ( l - 1 );
						const b = verticiesPerThread * threadStarts * i + ( l - 1 );
						const c = verticiesPerThread * threadStarts * i + l;
						const d = verticiesPerThread * threadStarts * ( i - 1 ) + l;

						// faces
						indices.push( a, b, d );
						indices.push( b, c, d );
					}

					// Generate the indices for the thread
					for (let j = 0; j < 3; j++) {
						let l = k * verticiesPerThread + (radialSegments + 1) + j * 2 + 1
						const a = verticiesPerThread * threadStarts * ( i - 1 ) + ( l - 1 );
						const b = verticiesPerThread * threadStarts * i + ( l - 1 );
						const c = verticiesPerThread * threadStarts * i + l;
						const d = verticiesPerThread * threadStarts * ( i - 1 ) + l;

						// faces
						indices.push( a, b, d );
						indices.push( b, c, d );
					}
				}
			}

			// Next create the triangles needed to cover the ends of the screws
			// For texture mapping, it might look better if we created an additional set of vericies so that we could then assign unique UV values to them 
			let b
			let l
			for (let ii = 0; ii < 2; ii++) {
				const i = tubularSegments + 1 + ii
				// Select one of the two extra vertices located at the center of each end of the screw
				const a = (tubularSegments+3) * threadStarts * verticiesPerThread + ii
				b = verticiesPerThread * threadStarts * i
				for (let k = 0; k < threadStarts; k++) {
					for ( let j = 0; j <= radialSegments; j++) {
						l = k * verticiesPerThread + j
						const c = verticiesPerThread * threadStarts * i + l;
						if (ii==0) {
							indices.push( a, b, c );
						}
						else {
							indices.push( c, b, a );
						}
						b = c
					}
					for (let j = 0; j < 2; j ++ ) {
						// Just need to hit the verticies at (radialSegments+1)+1 and (radialSegments+1)+3 to reach the top of the thread
						l = k * verticiesPerThread + (radialSegments + 1) + j * 2 + 1
						const c = verticiesPerThread * threadStarts * i + l;
						if (ii==0) {
							indices.push( a, b, c );
						}
						else {
							indices.push( c, b, a );
						}
						b = c
					}
				}
				const c = verticiesPerThread * threadStarts * i
				if (ii==0) {
					indices.push( a, b, c );
				}
				else {
					indices.push( c, b, a );
				}
			}

		}

	}

	toJSON() {

		const data = super.toJSON();

		data.path = this.parameters.path.toJSON();

		return data;

	}

	static fromJSON( data ) {

		// This only works for built-in curves (e.g. CatmullRomCurve3).
		// User defined curves or instances of CurvePath will not be deserialized.
		return new ScrewGeometry(
			new Curves[ data.path.type ]().fromJSON( data.path ),
			data.tubularSegments,
			data.shaftRadius,
			data.radialSegments,
			data.closed
		);

	}

}


export { ScrewGeometry };
