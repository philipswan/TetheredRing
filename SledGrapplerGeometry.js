import { forEach } from 'lodash';
import {
	Float32BufferAttribute,
	BufferGeometry,
	Vector2,
	Vector3,
    RGBA_ASTC_6x5_Format
} from 'three'

import * as Curves from 'three/src/extras/curves/Curves.js';

class SledGrapplerGeometry extends BufferGeometry {

	constructor(
		shaftRadius = 1,
		threadRadius = 2,
		threadThickness = .2,
		threadStarts = 2,
		revolutionsPerSecond = 1,
		acceleration = 0,
		initialVelocity = 1,
		baseDistanceAlongScrew = 0,
		bodyLength = 1,
        numGrapplers = 10,
        additionalRotation  = 0) {

		super();

		this.type = 'SledGrapplerGeometry';

		this.parameters = {
			shaftRadius: shaftRadius,
			threadRadius: threadRadius,
			threadThickness: threadThickness,
			threadStarts: threadStarts,
			revolutionsPerSecond: revolutionsPerSecond,
			acceleration: acceleration,
			initialVelocity: initialVelocity,
			baseDistanceAlongScrew: baseDistanceAlongScrew,  // This the distance from the start of the mass driver to the start of this segment of the screw.
			bodyLength: bodyLength,
            numGrapplers: numGrapplers,
			additionalRotation : additionalRotation,
		};

		// const frames = path.computeFrenetFrames( tubularSegments, closed );

		// expose internals

		// this.tangents = frames.tangents;
		// this.normals = frames.normals;
		// this.binormals = frames.binormals;

		// helper variables

		const tubularSegments = 128;
        const radialSegments = 24 / Math.min(threadStarts, 4);

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
		const shaftRadiusPlus = shaftRadius * 1.05

		// create buffer data

		generateBufferData();

		// build geometry

		this.setIndex( indices );
		this.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
		this.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );

		// functions

		function generateBufferData() {

            const firstGrapplerDistance = -bodyLength/2 + 0.0 / numGrapplers * bodyLength
            const lastGrapplerDistance = bodyLength/2
            const grapplerSpacing = 1.0 / numGrapplers * bodyLength
			const betweenGrapplerSpacing = grapplerSpacing * 0.1
            const midDistance = baseDistanceAlongScrew + bodyLength/2
            const cA = 0.5 * acceleration
            const cB = initialVelocity
            const cBSqrd = initialVelocity**2
            const nearTopRange = 0.125 * threadStarts
            const rateOfChangeInRotationalDistance1 = 2 * Math.PI * shaftRadius * Math.abs(revolutionsPerSecond)
            const rateOfChangeInRotationalDistance2 = 2 * Math.PI * threadRadius * Math.abs(revolutionsPerSecond)
			const gList = []
			const nearestThread = []
			const rotations = []
			const rotationsFrac = []
			const innerThreadPitch = []
			const outerThreadPitch = []

			const angleRange1 = 0.5/threadStarts
			const angleRange2 = 0.125*threadStarts
			const angleRange3 = 1 - angleRange2

            for (let g = firstGrapplerDistance; g<lastGrapplerDistance; g += grapplerSpacing) {
				for (let i = 0; i<2; i++) {
					// Figure out the screw's rotation at the locaton of each grappler
					//0 = 0.5 * a * t**2 + v0 * t - d
					const gPlus = g + i * (grapplerSpacing - betweenGrapplerSpacing)
					const cC = -(midDistance + gPlus)
					const time = (-cB - Math.sqrt(cBSqrd - 4*cA*cC)) / (2*cA)
					rotations[i] = additionalRotation + revolutionsPerSecond * time
					const rotationsTimesThreadStarts = rotations[i] * threadStarts
					rotationsFrac[i] = rotationsTimesThreadStarts - Math.floor(rotationsTimesThreadStarts)
					const rotationsWithTwist = rotations[i] - angleRange1
					nearestThread[i] = (threadStarts-1) - Math.floor((rotationsWithTwist - Math.floor(rotationsWithTwist )) * threadStarts)
					gList[i] = gPlus
	                const rateOfChangeInForwardDisplacement = initialVelocity + acceleration * time   // We're going to assume that the launch sled does not start from zero velocity because this would require an thread pitch of zero, which is not manufacturable.
                    innerThreadPitch[i] = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance1
                    outerThreadPitch[i] = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance2
				}
                //if (true || distanceFromTop<nearTopRange) {
                if ((rotationsFrac[0] < angleRange2) || (rotationsFrac[0] > angleRange3)) {
                    generateGrappler(gList, nearestThread, rotations, innerThreadPitch, outerThreadPitch)
                }
            }
            SledGrapplerGeometry.alreadyPrinted = true
		}

        function generateGrappler(g, nearestThread, rotations, innerThreadPitch, outerThreadPitch) {

			const l = vertices.length / 3
			const vertexArray = []
			// Note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
			const T = new Vector3(0, 1, 0)
			const N = new Vector3(-1, 0, 0)  // z-axis is up
			const B = new Vector3(0, 0, 1)   // x-axis is to the right when looking at the back of the launcher
			// Angles are counterclockwise, basically for the left screw, looking at it from the back, rotations are similar to cartesian coordinates except y is replaced with z.
			const magnetThickness = 0.05

			for (let i = 0; i<2; i++) {
				P = new Vector3(0, g[i], 0 );

				const threadHalfOfCrossWidth = Math.min(threadThickness * Math.sqrt(outerThreadPitch[i]**2+1) / Math.abs(outerThreadPitch[i]), shaftRadius/2);
				const threadBaseHalfAngle = Math.asin(threadHalfOfCrossWidth/shaftRadius);
				const threadTopHalfAngle = Math.asin(threadHalfOfCrossWidth/threadRadius);

				const precomputedPartOfAngle1 = 2 * Math.PI * (rotations[i] + nearestThread[0] / threadStarts)
				const precomputedPartOfAngle2 = precomputedPartOfAngle1 + magnetThickness * outerThreadPitch[i]
				const precomputedPartOfAngle3 = precomputedPartOfAngle1 + magnetThickness * innerThreadPitch[i]
				//console.log('grappler', precomputedPartOfAngle1, rotations[i], nearestThread)
				//const precomputedPartOfAngle2 = precomputedPartOfAngle1 - threadBaseHalfAngle;
				const v = []
				v.push(precomputedPartOfAngle1);
				v.push(precomputedPartOfAngle1);
				v.push(precomputedPartOfAngle2);
				v.push(precomputedPartOfAngle3);

				for (let j = 0; j<4; j++) {
					const vv = v[j]
					const sin = Math.sin(vv);
					const cos = Math.cos(vv);
					const vertex = new Vector3()
					const r = ((j==0) || (j==3)) ? shaftRadiusPlus : threadRadius;
					const z = (j>=2) ? -magnetThickness : 0
					vertex.x = P.x + r * (cos * B.x + sin * N.x) + z * T.x;
					vertex.y = P.y + r * (cos * B.y + sin * N.y) + z * T.y;
					vertex.z = P.z + r * (cos * B.z + sin * N.z) + z * T.z;
					vertexArray[i*4+j] = vertex
					vertices.push( vertex.x, vertex.y, vertex.z );
					vertices.push( vertex.x, vertex.y, vertex.z );
					vertices.push( vertex.x, vertex.y, vertex.z );
				}
			}
			// Generate Normals
			const p = [
				[3, 0], [4, 0], [2, 0],
				[2, 1], [5, 1], [0, 1],
				[1, 2], [6, 2], [3, 2],
				[0, 3], [7, 3], [2, 3],
				[7, 4], [0, 4], [6, 4],
				[6, 5], [1, 5], [4, 5],
				[5, 6], [2, 6], [7, 6],
				[4, 7], [3, 7], [6, 7],
			]
			for (let i = 0; i<24; i++) {
				const normal = vertexArray[p[i][0]].clone().sub(vertexArray[p[i][1]]).normalize()
				normals.push(normal.x, normal.y, normal.z)
			}
			generateFaceFromFourPoints(l+0*3+0, l+4*3+0, l+5*3+0, l+1*3+0)
			generateFaceFromFourPoints(l+0*3+1, l+1*3+1, l+2*3+1, l+3*3+1)
			generateFaceFromFourPoints(l+1*3+2, l+5*3+2, l+6*3+2, l+2*3+2)
			generateFaceFromFourPoints(l+4*3+1, l+7*3+1, l+6*3+1, l+5*3+1)
			generateFaceFromFourPoints(l+0*3+2, l+3*3+2, l+7*3+2, l+4*3+2)
			generateFaceFromFourPoints(l+3*3+0, l+2*3+0, l+6*3+0, l+7*3+0)
        }

		function generateFaceFromFourPoints(a, b, c, d) {
			indices.push(a, c, b)
			indices.push(a, d, c)
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
		return new SledGrapplerGeometry(
			new Curves[ data.path.type ]().fromJSON( data.path ),
			data.tubularSegments,
			data.shaftRadius,
			data.radialSegments,
			data.closed
		);

	}

}


export { SledGrapplerGeometry };
