import {
  Float32BufferAttribute,
  BufferGeometry,
  Vector2,
  Vector3
} from 'three'

import * as Curves from 'three/src/extras/curves/Curves.js';

class ScrewGeometry extends BufferGeometry {

  constructor(
    screwLength = 1,
    shaftOuterRadius = 1,
    shaftInnerRadius = 0.8,
    threadRadius = 2,
    threadThickness = .2,
    threadStarts = 2,
    baseDistanceAlongScrew = 0,
    initialVelocity = 1,
    initialDistance = 5,
    revolutionsPerSecond = 1,
    acceleration = 0,
    radialSegments = 8,
    minLengthSegmentsPerMeter = 4) {

    super();

    this.type = 'ScrewGeometry';

    this.parameters = {
      screwLength: screwLength,
      shaftOuterRadius: shaftOuterRadius,
      shaftInnerRadius: shaftInnerRadius,
      threadRadius: threadRadius,
      threadThickness: threadThickness,
      threadStarts: threadStarts,   // Indicates how many flights the thread has. 1 means that the thread is a single helix. 2 means that the thread is a double helix. 3 means that the thread is a triple helix. etc.
      baseDistanceAlongScrew: baseDistanceAlongScrew,  // This the distance from the start of the mass driver to the start of this segment of the screw.
      initialVelocity: initialVelocity,
      initialDistance: initialDistance, 
      revolutionsPerSecond: revolutionsPerSecond,
      acceleration: acceleration,
      radialSegments: radialSegments,
      minLengthSegmentsPerMeter: minLengthSegmentsPerMeter
    };

    // helper variables
    const vertex = new Vector3()
    const normal = new Vector3()
    const uv = new Vector2()
    const vertexArray = []
    const uvArray = []

    let P = new Vector3()

    // buffer
    const vertices = []
    const normals = []
    const uvs = []
    const indices = []
    // We'll create arrays of points each of which represents an edge of one of the the screw's flights.
    // Each flight is a helix that wraps around the screw's shaft.
    const screwFlightEdgeVerticies = []
    const screwFlightEdgeNormals = []
    const screwFlightEdgeUVs = []
    const numScrewFlightEdges = 4
    const numScrewFlightFaces = 3
    const numFlightStarts = threadStarts
    for (let flightStartIndex = 0; flightStartIndex<numFlightStarts; flightStartIndex++) {
      // Each flight has four edges
      for (let flightEdgeIndex = 0; flightEdgeIndex<numScrewFlightEdges; flightEdgeIndex++) {
        screwFlightEdgeVerticies.push([])
        screwFlightEdgeUVs.push([])
      }
      // Each thread has three faces, and each face has two edges, so there are six arrays containing normals per flight
      for (let flightEdgeIndex = 0; flightEdgeIndex<numScrewFlightFaces*2; flightEdgeIndex++) {
        screwFlightEdgeNormals.push([])
      }
    }

    const renderInnerSurface = shaftInnerRadius > 0

    // const verticesTag = []
    // const normalsTag = []
    // const uvsTag = []
    // const indicesTag = []

    // Estimate how many length segments we will need to properly represent the screw
    const distanceAlongScrew = baseDistanceAlongScrew + 0.5 * screwLength
    //0 = 0.5 * a * t**2 + v0 * t - d
    const cA = 0.5 * acceleration
    const cB = initialVelocity
    const cC = initialDistance - distanceAlongScrew
    let time
    if (cB**2 - 4*cA*cC < 0) {
      time = 0
    }
    else {
      const time0 = (-cB + Math.sqrt(cB**2 - 4*cA*cC)) / (2*cA)
      const time1 = (-cB - Math.sqrt(cB**2 - 4*cA*cC)) / (2*cA)
      time = Math.max(time0, time1)
    }
    const rotations = revolutionsPerSecond * time
    const rateOfChangeInRotationalDistance = 2 * Math.PI * threadRadius * Math.abs(revolutionsPerSecond)
    const rateOfChangeInForwardDisplacement = initialVelocity + acceleration * time   // We're going to assume that the launch sled does not start from zero velocity because this would require an thread pitch of zero, which is not manufacturable.

    const minimumTubularSegments = Math.ceil(minLengthSegmentsPerMeter * screwLength)
    // Increase the number of segment based on the pitch of the screw
    const tubularSegments = Math.ceil(minimumTubularSegments * Math.sqrt(rateOfChangeInRotationalDistance**2 + rateOfChangeInForwardDisplacement**2) / rateOfChangeInForwardDisplacement)

    // create buffer data
    generateBufferData();

    // console.log(vertices.length, normals.length, uvs.length, verticesTag.length, normalsTag.length, uvsTag.length)
    // let c = 0
    // vertices.forEach((v, i) => {
    // //for (let i = 0; i<1000; i++) {
    //   if ((c<1000) && ((verticesTag[i]!==normalsTag[i]) || (verticesTag[i]!==uvsTag[i]))) {
    //     console.log(i, verticesTag[i], normalsTag[i], uvsTag[i])
    //     c++
    //   }
    // })


    // build geometry

    this.setIndex( indices );
    this.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
    this.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );
    this.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );

    // functions

    function generateBufferData() {

      const twoPi = 2 * Math.PI

      for ( let i = 0; i <= tubularSegments; i++) {
        const screwSegmentLengthOffset = i / tubularSegments
        generateSegmentsAndUVs( screwSegmentLengthOffset, screwLength, 0);
      }
      // Need an extra vertices at each end of the screw to construct the flat surfaces that cap the ends
      const vertexAnglesBreachEnd = []
      const vertexAnglesMuzzleEnd = []
      generateSegmentsAndUVs(0.0, screwLength, 1, vertexAnglesBreachEnd);
      generateSegmentsAndUVs(1.0, screwLength, 2, vertexAnglesMuzzleEnd);

      if (renderInnerSurface) {
        const interiorPlateMuzzleEndInset = 0.003 * screwLength/0.25
        const nubOuterRadius = 0.008 * screwLength/0.25
        const nubInnerRadius = 0.005 * screwLength/0.25
        const bracketThickness = 0.002 * screwLength/0.25
        const motorMountingDiskThickness = 0.01 * screwLength/0.25
        const interiorPlateBreachEndInset = 0.052 * screwLength/0.25
        const motorShaftRadius = 0.0025 * screwLength/0.25

        const profilePoints = []
        // Start at the muzzle-facing end of the screw and work back towards the breach-facing end
        // Shaft end face
        profilePoints.push({r: shaftInnerRadius, y: 0.5 * screwLength, normalAngleOffset: Math.PI/2})
        // Interior Shaft Wall
        profilePoints.push({r: shaftInnerRadius, y: 0.5 * screwLength, normalAngleOffset: -Math.PI})
        const drawScrewInternalStructure = false
        if (drawScrewInternalStructure) {
          profilePoints.push({r: shaftInnerRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset, normalAngleOffset: -Math.PI})
          // Motor mounting disk muzzle facing face 
          profilePoints.push({r: shaftInnerRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset, normalAngleOffset: Math.PI/2})
          profilePoints.push({r: nubOuterRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset, normalAngleOffset: Math.PI/2})
          // Nub outer wall
          profilePoints.push({r: nubOuterRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset, normalAngleOffset: 0})
          profilePoints.push({r: nubOuterRadius, y: 0.5 * screwLength + bracketThickness, normalAngleOffset: 0})
          // Nub muzzle facing face
          profilePoints.push({r: nubOuterRadius, y: 0.5 * screwLength + bracketThickness, normalAngleOffset: Math.PI/2})
          profilePoints.push({r: nubInnerRadius, y: 0.5 * screwLength + bracketThickness, normalAngleOffset: Math.PI/2})
          // Nub inner wall
          profilePoints.push({r: nubInnerRadius, y: 0.5 * screwLength + bracketThickness, normalAngleOffset: -Math.PI})
          profilePoints.push({r: nubInnerRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset - motorMountingDiskThickness, normalAngleOffset: -Math.PI})
          // Motor mounting disk breach facing face
          profilePoints.push({r: nubInnerRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset - motorMountingDiskThickness, normalAngleOffset: -Math.PI/2})
          profilePoints.push({r: shaftInnerRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset - motorMountingDiskThickness - shaftInnerRadius, normalAngleOffset: -Math.PI/2})
          // Interior shaft wall
          profilePoints.push({r: shaftInnerRadius, y: 0.5 * screwLength - interiorPlateMuzzleEndInset - motorMountingDiskThickness - shaftInnerRadius, normalAngleOffset: -Math.PI})
          profilePoints.push({r: shaftInnerRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset + motorMountingDiskThickness, normalAngleOffset: -Math.PI})
          // Motor mounting disk muzzle facing face
          profilePoints.push({r: shaftInnerRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset + motorMountingDiskThickness, normalAngleOffset: Math.PI/2})
          profilePoints.push({r: motorShaftRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset + motorMountingDiskThickness, normalAngleOffset: Math.PI/2})
          // Motor shaft inner wall
          profilePoints.push({r: motorShaftRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset + motorMountingDiskThickness, normalAngleOffset: -Math.PI})
          profilePoints.push({r: motorShaftRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset, normalAngleOffset: -Math.PI})
          // Motor mounting disk breach facing face
          profilePoints.push({r: motorShaftRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset, normalAngleOffset: -Math.PI/2})
          profilePoints.push({r: shaftInnerRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset, normalAngleOffset: -Math.PI/2})
          // Interior shaft wall
          profilePoints.push({r: shaftInnerRadius, y: -0.5 * screwLength + interiorPlateBreachEndInset, normalAngleOffset: -Math.PI})
        }
        profilePoints.push({r: shaftInnerRadius, y: -0.5 * screwLength, normalAngleOffset: -Math.PI})
        // Shaft end face
        profilePoints.push({r: shaftInnerRadius, y: -0.5 * screwLength, normalAngleOffset: -Math.PI/2})

        const T = new Vector3(0, 1, 0)
        const N = new Vector3(-1, 0, 0)  // z-axis is down
        const B = new Vector3(0, 0, 1)   // x-axis is to the right when looking at the back of the launcher
        const extraOffsetToOuterShaftFirstVertex = 6
        const verticesPerFlightOnShaft = (radialSegments + 1)
        const verticesPerFlight = extraOffsetToOuterShaftFirstVertex + verticesPerFlightOnShaft  // Each flight comprises 3 faces with 2 verticies per face plus the vertices on the shaft between two adjacent flights
        const numPointsOuter = verticesPerFlightOnShaft * threadStarts
        const numPointsInner = (radialSegments + 1) * threadStarts * 2
        const lastProfileEntry = profilePoints.length-1

        const ringOfVerticesOffset = []

        ringOfVerticesOffset[0] = verticesPerFlight * threadStarts * (tubularSegments+3-1) // Offset to the start of the vertices for the tubular segment for the muzzle-facing face
        profilePoints.forEach((profilePoint, k) => {
          P = new Vector3(0, profilePoint.y, 0);
          ringOfVerticesOffset[k+1] = addRingOfVertices(P, T, N, B, numPointsInner, profilePoint.r, profilePoint.normalAngleOffset, 0.5+profilePoint.y, threadRadius, vertices, normals, uvs)
        })
        ringOfVerticesOffset[lastProfileEntry+2] = 0 //verticesPerFlight * threadStarts * (tubularSegments+1)  // Offset to the start of the vertices for the tubular segment for the breach-facing face
        
        let indexGenerator1, indexGenerator2, angleGenerator1, angleGenerator2

        // Muzzle end faces
        // We only want to connect the endpoints that are on the screw shaft. The following function skips over the six points on the screw's flights.
        indexGenerator1 = (i) => {return ringOfVerticesOffset[1]+i}
        indexGenerator2 = (i) => {return ringOfVerticesOffset[0] + (Math.floor(i / verticesPerFlightOnShaft) * verticesPerFlight) + extraOffsetToOuterShaftFirstVertex + (i%verticesPerFlightOnShaft)}
        angleGenerator1 = (i) => {return i * twoPi / numPointsInner}
        angleGenerator2 = (i) => {return vertexAnglesMuzzleEnd[i]}
        smartStitch(indexGenerator1, indexGenerator2, angleGenerator1, angleGenerator2, numPointsInner, numPointsOuter, indices)
        
        // Inner profile of shaft
        for (let k = 2; k < lastProfileEntry; k+=2) {
          indexGenerator1 = (i) => {return ringOfVerticesOffset[k]+i}
          indexGenerator2 = (i) => {return ringOfVerticesOffset[k+1]+i}
          dumbStitch(indexGenerator1, indexGenerator2, numPointsInner, indices, true)
        }

        // Breach end faces
        indexGenerator1 = (i) => {return ringOfVerticesOffset[lastProfileEntry+1]+i}
        indexGenerator2 = (i) => {return ringOfVerticesOffset[lastProfileEntry+2] + (Math.floor(i / verticesPerFlightOnShaft) * verticesPerFlight) + extraOffsetToOuterShaftFirstVertex + (i%verticesPerFlightOnShaft)}
        angleGenerator1 = (i) => {return i * twoPi / numPointsInner}
        angleGenerator2 = (i) => {return vertexAnglesBreachEnd[i]}
        smartStitch(indexGenerator1, indexGenerator2, angleGenerator1, angleGenerator2, numPointsInner, numPointsOuter, indices)
      }
      else {
        // Need an extra vertex at the center of each end of the screw. These will be used to construct the flat surfaces that cap the ends
        for (let screwSegmentLengthOffset = 0; screwSegmentLengthOffset <= 1.0; screwSegmentLengthOffset+=1.0) {
          P = new Vector3(0, (screwSegmentLengthOffset - 0.5) * screwLength, 0);
          vertices.push( P.x, P.y, P.z );
          //verticesTag.push( 'end' + i, 'end' + i, 'end' + i);
          const T = new Vector3(0, 1, 0);
          if (i==0) {
            normals.push( -T.x, -T.y, -T.z );
            //normalsTag.push( 'end' + i, 'end' + i, 'end' + i);
          }
          else {
            normals.push( T.x, T.y, T.z );
            //normalsTag.push( 'end' + i, 'end' + i, 'end' + i);
          }
          uvs.push( 0.5, 0.5 );
          //uvsTag.push( 'end' + i, 'end' + i, 'end' + i);
        }
      }

      generateIndices()

    }

    function generateSegmentsAndUVs( screwSegmentLengthOffset, screwLength, sideOrEndsSelector, vertexAngles = null) {

      // we use getPointAt to sample evenly distributed points from the given path

      P = new Vector3(0, (screwSegmentLengthOffset - 0.5) * screwLength, 0 );
      // Note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
      const T = new Vector3(0, 1, 0)
      const N = new Vector3(-1, 0, 0)  // z-axis is down
      const B = new Vector3(0, 0, 1)   // x-axis is to the right when looking at the back of the launcher

      // Figure out the start angle and end angle given the thickness, pitch, and the number of starts of the thread.
      const distanceAlongScrew = baseDistanceAlongScrew + screwSegmentLengthOffset * screwLength
      //0 = 0.5 * a * t**2 + v0 * t - d
      const cA = 0.5 * acceleration
      const cB = initialVelocity
      const cC = initialDistance - distanceAlongScrew
      let time
      if (cB**2 - 4*cA*cC < 0) {
        time = 0
      }
      else {
        time = (-cB - Math.sqrt(cB**2 - 4*cA*cC)) / (2*cA)
      }
      // const time0 = (-cB + Math.sqrt(cB**2 - 4*cA*cC)) / (2*cA)
      // const time1 = (-cB - Math.sqrt(cB**2 - 4*cA*cC)) / (2*cA)
      // const time = Math.max(time0, time1)
  
      const rotations = revolutionsPerSecond * time
      const rateOfChangeInRotationalDistance = 2 * Math.PI * threadRadius * Math.abs(revolutionsPerSecond)
      const rateOfChangeInForwardDisplacement = initialVelocity + acceleration * time   // We're going to assume that the launch sled does not start from zero velocity because this would require an thread pitch of zero, which is not manufacturable.
      const threadPitch = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance
  
      const threadHalfOfCrossWidth = Math.min(threadThickness * Math.sqrt(threadPitch**2+1) / Math.abs(threadPitch), shaftOuterRadius/2);
      const threadBaseHalfAngle = Math.asin(threadHalfOfCrossWidth/shaftOuterRadius)
      const threadBaseEndAngle = 2 * Math.PI / threadStarts
      const threadTopHalfAngle = Math.asin(threadHalfOfCrossWidth/threadRadius)
      // generate normals and vertices for the current segment
      const angularStep1 = (threadBaseEndAngle - threadBaseHalfAngle) / radialSegments

      const x0 = Math.cos(threadBaseHalfAngle) * shaftOuterRadius
      const y0 = Math.sin(threadBaseHalfAngle) * shaftOuterRadius
      const x1 = Math.cos(threadTopHalfAngle) * threadRadius
      const y1 = Math.sin(threadTopHalfAngle) * threadRadius
      const threadSideWallHeight = Math.sqrt((x1-x0)**2 + (y1-y0)**2)
      const perimeterLength = (2 * Math.PI - threadStarts * 2 * threadBaseHalfAngle) * shaftOuterRadius + threadStarts * (2 * threadSideWallHeight + threadThickness)

      for (let k = 0; k < threadStarts; k++) {
        const precomputedPartOfAngle1 = 2 * Math.PI * ((rotations + k / threadStarts) )
        const precomputedPartOfAngle2 = precomputedPartOfAngle1 + threadBaseHalfAngle

        // Thread Faces

        // Generate the normals and vertices for the three faces of each flight of the screw thread
        const v = []
        v.push(precomputedPartOfAngle1)
        v.push(precomputedPartOfAngle1)
        v.push(precomputedPartOfAngle1 + threadTopHalfAngle)
        v.push(precomputedPartOfAngle1 + threadBaseHalfAngle)

        for (let j = 0; j<3; j++) {
          const nv = precomputedPartOfAngle1 + ((j-1) * Math.PI/2)
          const sin = Math.sin(nv)
          const cos = Math.cos(nv)
          normal[j] = new Vector3()
          normal[j].x = cos * B.x + sin * N.x
          normal[j].y = cos * B.y + sin * N.y
          normal[j].z = cos * B.z + sin * N.z
          normal[j].normalize()
        }

        for (let j = 0; j<4; j++) {
          const vv = v[j]
          const sin = Math.sin(vv)
          const cos = Math.cos(vv)
          vertexArray[j] = new Vector3()
          const r = (j==0 || j==3) ? shaftOuterRadius : threadRadius
          vertexArray[j].x = P.x + r * (cos * B.x + sin * N.x)
          vertexArray[j].y = P.y + r * (cos * B.y + sin * N.y)
          vertexArray[j].z = P.z + r * (cos * B.z + sin * N.z)
        }

        // Thread back face
        vertices.push( vertexArray[0].x, vertexArray[0].y, vertexArray[0].z )
        //verticesTag.push( 'tbf0', 'tbf0', 'tbf0')
        vertices.push( vertexArray[1].x, vertexArray[1].y, vertexArray[1].z )
        //verticesTag.push( 'tbf1', 'tbf1', 'tbf1')

        // Thread top face
        vertices.push( vertexArray[1].x, vertexArray[1].y, vertexArray[1].z )
        //verticesTag.push( 'ttf1', 'ttf1', 'ttf1')
        vertices.push( vertexArray[2].x, vertexArray[2].y, vertexArray[2].z )
        //verticesTag.push( 'ttf2', 'ttf2', 'ttf2')

        // Thread front face
        vertices.push( vertexArray[2].x, vertexArray[2].y, vertexArray[2].z )
        //verticesTag.push( 'tff2', 'tff2', 'tff2')
        vertices.push( vertexArray[3].x, vertexArray[3].y, vertexArray[3].z )
        //verticesTag.push( 'tff3', 'tff3', 'tff3')

        switch (sideOrEndsSelector) {
        case 0:
          // Flight side faces
          // Thread back face
          normals.push( normal[0].x, normal[0].y, normal[0].z )
          //normalsTag.push( 'tbf0', 'tbf0', 'tbf0')
          normals.push( normal[0].x, normal[0].y, normal[0].z )
          //normalsTag.push( 'tbf1', 'tbf1', 'tbf1')

          // Thread top face
          normals.push( normal[1].x, normal[1].y, normal[1].z )
          //normalsTag.push( 'ttf1', 'ttf1', 'ttf1')
          normals.push( normal[1].x, normal[1].y, normal[1].z )
          //normalsTag.push( 'ttf2', 'ttf2', 'ttf2')

          // Thread front face
          normals.push( normal[2].x, normal[2].y, normal[2].z )
          //normalsTag.push( 'tff2', 'tff2', 'tff2')
          normals.push( normal[2].x, normal[2].y, normal[2].z )
          //normalsTag.push( 'tff3', 'tff3', 'tff3')
          break;
        case 1:
          // Flight backward end faces
          for (let j = 0; j<6; j++) {
            normals.push( -T.x, -T.y, -T.z )
            //const label = ((j<2) ? 'tbf' : (j<4) ? 'ttf' : 'tff' ) + [0, 1, 1, 2, 2, 3][j]
            //normalsTag.push( label, label, label)
          }
          break;
        case 2:
          // Flight forward end faces
          for (let j = 0; j<6; j++) {
            normals.push( T.x, T.y, T.z );
            //const label = ((j<2) ? 'tbf' : (j<4) ? 'ttf' : 'tff' ) + [0, 1, 1, 2, 2, 3][j]
            //normalsTag.push( label, label, label)
          }
          break;
        }

        // Generate the normals and vertices that define the curves for the outer surface of the shaft
        for (let j = 0; j <= radialSegments; j++) {

          const v = precomputedPartOfAngle2 + j * angularStep1;
          if (v==="NaN") {
            console.error('v is NaN')
          }
          if (vertexAngles!==null) {
            vertexAngles.push(v)
          }

          const sin = Math.sin( v );
          const cos = Math.cos( v );

          // normal
          normal.x = ( cos * B.x + sin * N.x );
          normal.y = ( cos * B.y + sin * N.y );
          normal.z = ( cos * B.z + sin * N.z );
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
          //normalsTag.push( 'out' + j, 'out' + j, 'out' + j);

          // vertex

          vertex.x = P.x + shaftOuterRadius * normal.x;
          vertex.y = P.y + shaftOuterRadius * normal.y;
          vertex.z = P.z + shaftOuterRadius * normal.z;

          vertices.push( vertex.x, vertex.y, vertex.z );
          //verticesTag.push( 'out' + j, 'out' + j, 'out' + j);

        }


        // Now compute the UVs
        switch (sideOrEndsSelector) {
          // Side faces
          case 0:
            // Screw flight back face
            uv.x = screwSegmentLengthOffset;
            uv.y = Math.abs(rotations + ( k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tbf0', 'tbf0', 'tbf0');

            uv.x = screwSegmentLengthOffset;
            uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius + threadSideWallHeight) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tbf1', 'tbf1', 'tbf1');

            // Screw flight top face
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'ttf1', 'ttf1', 'ttf1');
            uv.x = screwSegmentLengthOffset;
            uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius + threadSideWallHeight + threadThickness) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'ttf2', 'ttf2', 'ttf2');

            // Screw flight front face
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tff2', 'tff2', 'tff2');
            uv.x = screwSegmentLengthOffset;
            uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius + threadSideWallHeight + threadThickness + threadSideWallHeight) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tff3', 'tff3', 'tff3');

            // Outer surface of shaft
            for ( let j = 0; j <= radialSegments; j++ ) {
              uv.x = screwSegmentLengthOffset;
              uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * j / radialSegments * shaftOuterRadius) / perimeterLength) % 1;
              uvs.push( uv.x, uv.y );
              //uvsTag.push( 'out' + j, 'out' + j, 'out' + j);
            }

            break;
          case 1: case 2:
            // End faces
            for (let j = 0; j<4; j++) {
              const vv = v[j]
              const sin = Math.sin(vv);
              const cos = Math.cos(vv);
              uvArray[j] = new Vector2()
              const r = (j==0 || j==3) ? shaftOuterRadius : threadRadius;
              uvArray[j].x = r * cos;
              uvArray[j].y = r * sin;
            }
    
            // Screw flight back edge
            uvs.push( uvArray[0].x, uvArray[0].y );
            //uvsTag.push( 'tbf0', 'tbf0', 'tbf0');
            uvs.push( uvArray[1].x, uvArray[1].y );
            //uvsTag.push( 'tbf1', 'tbf1', 'tbf1');
    
            // Screw flight top edge
            uvs.push( uvArray[1].x, uvArray[1].y );
            //uvsTag.push( 'ttf1', 'ttf1', 'ttf1');
            uvs.push( uvArray[2].x, uvArray[2].y );
            //uvsTag.push( 'ttf2', 'ttf2', 'ttf2');
    
            // Screw flight front edge
            uvs.push( uvArray[2].x, uvArray[2].y );
            //uvsTag.push( 'tff2', 'tff2', 'tff2');
            uvs.push( uvArray[3].x, uvArray[3].y );
            //uvsTag.push( 'tff3', 'tff3', 'tff3');
    
            for ( let j = 0; j <= radialSegments; j++ ) {
              const v = precomputedPartOfAngle2 + j * angularStep1;
              const sin = Math.sin( v );
              const cos = Math.cos( v );
              uv.x = shaftOuterRadius * cos
              uv.y = shaftOuterRadius * sin
              uvs.push( uv.x, uv.y );
              //uvsTag.push( 'out' + j, 'out' + j, 'out' + j);
            }

            break;
        }
      }
    }

    function addRingOfVertices(P, T, N, B, numPoints, radius, normalAngleOffset, axialPosition, maxRadius, vertices, normals, uvs) {

      // normalAngleOffset indicates how much to tilt the normals away from being perpendicular to the curve and towards being more tangential to the curve.
      const normalCos = Math.cos(normalAngleOffset)
      const normalSin = Math.sin(normalAngleOffset)
      const pathNormal = new Vector3()
      const lightingNormal = new Vector3()
      const vertex = new Vector3()
      const isSide = Math.abs(normalAngleOffset) < Math.PI/4

      const pointerToVertices = vertices.length / 3
      const angularStep = 2 * Math.PI / numPoints

      for (let j = 0; j < numPoints; j++) {
        const v = j * angularStep
        const sin = Math.sin( v )
        const cos = Math.cos( v )

        // A direction perpendicular to the path
        pathNormal.x = cos * B.x + sin * N.x
        pathNormal.y = cos * B.y + sin * N.y
        pathNormal.z = cos * B.z + sin * N.z

        // vertex
        vertex.x = P.x + radius * pathNormal.x
        vertex.y = P.y + radius * pathNormal.y
        vertex.z = P.z + radius * pathNormal.z
        vertices.push( vertex.x, vertex.y, vertex.z )
        //verticesTag.push( 'out' + j, 'out' + j, 'out' + j)

        // vertex normal (for lighting calculations)
        lightingNormal.x = normalCos * pathNormal.x + normalSin * T.x
        lightingNormal.y = normalCos * pathNormal.y + normalSin * T.y
        lightingNormal.z = normalCos * pathNormal.z + normalSin * T.z

        normals.push( lightingNormal.x, lightingNormal.y, lightingNormal.z )
        //normalsTag.push( 'out' + j, 'out' + j, 'out' + j)

        // Now compute the UVs
        if (isSide) {
          uv.x = axialPosition
          uv.y = j / (numPoints-1)
        }
        else {
          // ... is end
          uv.x = cos * radius / maxRadius * 0.5 + 0.5
          uv.y = sin * radius / maxRadius * 0.5 + 0.5
        }
        uvs.push( uv.x, uv.y )
        //uvsTag.push( 'out' + j, 'out' + j, 'out' + j)

      }
      return pointerToVertices

    }

    function angleDiff(a, b) {

      const twoPi = 2 * Math.PI
      const diff = a - b
      const diff_ab = (twoPi + diff) % twoPi
      const diff_ba = (twoPi - diff) % twoPi
      return Math.min(diff_ab, diff_ba)

    }

    function smartStitch(indexGenerator1, indexGenerator2, angleGenerator1, angleGenerator2, numPoints1, numPoints2, indices) {
      
      // This function creates a set of triangles between two rings of verticies. It analyzes the angles associated
      // with the verticies to determine how to construct the triangles optimally.
      const twoPi = 2 * Math.PI
      let a, b, c, d  // These are values in the range of 0 to numPoints-1
      let angleA, angleB, angleC, angleD  // These are values in the range of 0 to 2*PI
      let indexA, indexB, indexC, indexD  // These are pointers into the array of vertices.

      a = 0
      angleA = angleGenerator1(a)
      angleA = angleA - Math.floor(angleA / twoPi) * twoPi
      indexA = indexGenerator1(a)
      
      // Find the index on the second ring that is closest to the first index of the first ring
      let bestFirstB = 0
      let bestAngleB = 0
      let smallestDifference
      for (let i = 0; i<numPoints2; i++) {
        angleB = angleGenerator2(i)
        angleB = angleB - Math.floor(angleB / twoPi) * twoPi
        // Determine the absolute value of the difference between the two angles in a manner that handles the wrap arond case
        const angleDifference = angleDiff(angleA, angleB)
        if ((bestFirstB==0) || (angleDifference < smallestDifference)) {
          bestFirstB = i
          bestAngleB = angleB
          smallestDifference = angleDifference
        }
      }
      b = bestFirstB
      angleB = bestAngleB
      indexB = indexGenerator2(b)

      c = (b+1) % numPoints2
      d = (a+1) % numPoints1
      angleC = angleGenerator2(c)
      angleC = angleC - Math.floor(angleC / twoPi) * twoPi
      angleD = angleGenerator1(d)
      angleD = angleD - Math.floor(angleD / twoPi) * twoPi
      indexC = indexGenerator2(c)
      indexD = indexGenerator1(d)

      let moreCs = true
      let moreDs = true
      let k = 0

      do {
        const angleDiffAC = angleDiff(angleA, angleC)
        const angleDiffBD = angleDiff(angleB, angleD)
        const useC = !moreCs ? false : !moreDs ? true : (angleDiffAC < angleDiffBD)
        if (useC) {
          // Use point C to complete the triangle
          indices.push( indexA, indexB, indexC );
          k++
          b = c
          angleB = angleC
          indexB = indexC
          moreCs = (c != bestFirstB)
          if (moreCs) {
            c = (b+1) % numPoints2
            angleC = angleGenerator2(c)
            angleC = angleC - Math.floor(angleC / twoPi) * twoPi
            indexC = indexGenerator2(c)
          }
        }
        else {
          // Use point D to complete the triangle
          indices.push( indexA, indexB, indexD );
          //console.log(a, b, d, angleA, angleB, angleD)
          k++
          a = d
          angleA = angleD
          indexA = indexD
          moreDs = (d != 0)
          if (moreDs) {
            d = (a+1) % numPoints1
            angleD = angleGenerator1(d)
            angleD = angleD - Math.floor(angleD / twoPi) * twoPi
            indexD = indexGenerator1(d)
          }
        }
      } while (moreCs || moreDs)
      //console.log('k = ' + k, numPoints1+numpoints2)

    }

    function dumbStitch(indexGenerator1, indexGenerator2, numPoints, indices, wrapAround = false) {
      for (let i=0; i<numPoints + (wrapAround?1:0); i++) {
        const indexA = indexGenerator1(i)
        const indexB = indexGenerator2(i)
        const indexC = indexGenerator2((i+1)%numPoints)
        const indexD = indexGenerator1((i+1)%numPoints)
        indices.push( indexA, indexB, indexC );
        indices.push( indexC, indexD, indexA );
      }
    }

    function generateIndices() {

      let verticesPerFlight
      if (false && renderInnerSurface) {
        verticesPerFlight = 2*(radialSegments + 1) + 6  // Part of shaft (outer and inner) plus each thread comprises 3 faces with 2 verticies per face 
      }
      else {
        verticesPerFlight = (radialSegments + 1) + 6  // Part of shaft (outer) plus each thread comprises 3 faces with 2 verticies per face
      }
      const extraOffsetToOuterShaftFirstVertex = 6
      const extraOffsetToInnerShaftFirstVertex = (radialSegments + 1) + 6
      for (let i = 1; i <= tubularSegments; i++) {
        for (let k = 0; k < threadStarts; k++) {

          // Generate the indices for the thread
          for (let j = 0; j < 3; j++) {
            let l = k * verticesPerFlight + j * 2 + 1
            const a = verticesPerFlight * threadStarts * ( i - 1 ) + ( l - 1 );
            const b = verticesPerFlight * threadStarts * i + ( l - 1 );
            const c = verticesPerFlight * threadStarts * i + l;
            const d = verticesPerFlight * threadStarts * ( i - 1 ) + l;

            indices.push( a, b, c );
            indices.push( c, d, a );
          }
          
          // Generate the indices for the outer shaft
          for ( let j = 1; j <= radialSegments; j++) {
            let l = extraOffsetToOuterShaftFirstVertex + k * verticesPerFlight + j
            const a = verticesPerFlight * threadStarts * ( i - 1 ) + ( l - 1 );
            const b = verticesPerFlight * threadStarts * i + ( l - 1 );
            const c = verticesPerFlight * threadStarts * i + l;
            const d = verticesPerFlight * threadStarts * ( i - 1 ) + l;

            indices.push( a, b, c );
            indices.push( c, d, a );
          }
        }

      }

      // Next create the triangles needed to cover the ends of the flights
      if (renderInnerSurface) {
        let l
        for (let ii = 0; ii < 2; ii++) {
          // Iterating through the two ends of the screw...
          const i = tubularSegments + 1 + ii
          // Select one of the two extra vertices located at the center of each end of the screw
          const offsetToTubularSegment = verticesPerFlight * threadStarts * i 

          // Cap the ends of the flights
          for (let k = 0; k < threadStarts; k++) {
            const ss = offsetToTubularSegment + k * verticesPerFlight
            for (let j = 0; j < 2; j++) {
              const a = ss + 0
              const b = ss + 1
              const c = ss + 4
              const d = ss + 5
              if (ii==0) {
                //indices.push( a, b, c );
                indices.push( a, b, c );
                indices.push( c, d, a );
              }
              else {
                //indices.push( c, b, a );
                indices.push( c, b, a );
                indices.push( a, d, c );
              }
            }
          }
        }
      }
      else {
        // Next create the triangles needed to cover the ends of the screws
        // For texture mapping, it might look better if we created an additional set of vericies so that we could then assign unique UV values to them 
        let b
        let l
        for (let ii = 0; ii < 2; ii++) {
          const i = tubularSegments + 1 + ii
          // Select one of the two extra vertices located at the center of each end of the screw
          const a = (tubularSegments+3) * threadStarts * verticesPerFlight + ii
          b = verticesPerFlight * threadStarts * i
          for (let k = 0; k < threadStarts; k++) {
            for (let j = 0; j < 2; j ++ ) {
              // Just need to hit the verticies at (radialSegments+1)+1 and (radialSegments+1)+3 to reach the top of the thread
              l = k * verticesPerFlight + j * 2 + 1
              const c = verticesPerFlight * threadStarts * i + l;
              if (ii==0) {
                indices.push( a, b, c );
              }
              else {
                indices.push( c, b, a );
              }
              b = c
            }
            for ( let j = 0; j <= radialSegments; j++) {
              l = 6 + k * verticesPerFlight + j
              const c = verticesPerFlight * threadStarts * i + l;
              if (ii==0) {
                indices.push( a, b, c );
              }
              else {
                indices.push( c, b, a );
              }
              b = c
            }
          }
          const c = verticesPerFlight * threadStarts * i
          if (ii==0) {
            indices.push( a, b, c );
          }
          else {
            indices.push( c, b, a );
          }
        }

      }

    }

  }


}


export { ScrewGeometry };
