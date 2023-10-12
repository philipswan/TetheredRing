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
      threadStarts: threadStarts,
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

    const minimumTubularSegments = Math.floor(minLengthSegmentsPerMeter * screwLength)
    const tubularSegments = Math.ceil(Math.sqrt(rateOfChangeInRotationalDistance**2 + rateOfChangeInForwardDisplacement**2) / rateOfChangeInForwardDisplacement * minimumTubularSegments)

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

      for ( let i = 0; i <= tubularSegments; i++) {
        generateSegmentsAndUVs( i, screwLength, 0);
      }
      // Need an extra vertices at each end of the screw to construct the flat surfaces that cap the ends
      generateSegmentsAndUVs(0, screwLength, 1);
      generateSegmentsAndUVs(tubularSegments, screwLength, 2);

      if (!renderInnerSurface) {
        // Need an extra vertex at the center of each end of the screw. These will be used to construct the flat surfaces that cap the ends
        for (let i = 0; i <= tubularSegments; i+=tubularSegments) {
          P = new Vector3(0, (i / tubularSegments - 0.5) * screwLength, 0);
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

      //generateUVs();
      // finally create faces
      generateIndices();

    }

    function generateSegmentsAndUVs( i, screwLength, sideOrEndsSelector ) {

      // we use getPointAt to sample evenly distributed points from the given path

      P = new Vector3(0, (i / tubularSegments - 0.5) * screwLength, 0 );
            // Note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
      const T = new Vector3(0, 1, 0)
      const N = new Vector3(-1, 0, 0)  // z-axis is down
      const B = new Vector3(0, 0, 1)   // x-axis is to the right when looking at the back of the launcher

      // Figure out the start angle and end angle given the thickness, pitch, and the number of starts of the thread.
      const distanceAlongScrew = baseDistanceAlongScrew + i / tubularSegments * screwLength
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

        if (renderInnerSurface) {
          // Generate the normals and vertices that define the curves for the inner surface of the shaft
          for (let j = 0; j <= radialSegments; j++) {

            const v = precomputedPartOfAngle2 + j * angularStep1;

            const sin = Math.sin( v );
            const cos = Math.cos( v );

            // normal
            normal.x = ( cos * B.x + sin * N.x );
            normal.y = ( cos * B.y + sin * N.y );
            normal.z = ( cos * B.z + sin * N.z );
            normal.normalize();  // Really needed?

            switch (sideOrEndsSelector) {
            case 0:
              normals.push( -normal.x, -normal.y, -normal.z );
              break;
            case 1:
              normals.push( -T.x, -T.y, -T.z );
              break;
            case 2:
              normals.push( T.x, T.y, T.z );
              break;
            }
            //normalsTag.push( 'inn' + j, 'inn' + j, 'inn' + j);

            // vertex

            vertex.x = P.x + shaftInnerRadius * normal.x;
            vertex.y = P.y + shaftInnerRadius * normal.y;
            vertex.z = P.z + shaftInnerRadius * normal.z;

            vertices.push( vertex.x, vertex.y, vertex.z );
            //verticesTag.push( 'inn' + j, 'inn' + j, 'inn' + j);

          }
        }

        // Now compute the UVs
        switch (sideOrEndsSelector) {
          // Side faces
          case 0:
            // Screw flight back face
            uv.x = i / tubularSegments;
            uv.y = Math.abs(rotations + ( k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tbf0', 'tbf0', 'tbf0');

            uv.x = i / tubularSegments;
            uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius + threadSideWallHeight) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tbf1', 'tbf1', 'tbf1');

            // Screw flight top face
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'ttf1', 'ttf1', 'ttf1');
            uv.x = i / tubularSegments;
            uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius + threadSideWallHeight + threadThickness) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'ttf2', 'ttf2', 'ttf2');

            // Screw flight front face
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tff2', 'tff2', 'tff2');
            uv.x = i / tubularSegments;
            uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * shaftOuterRadius + threadSideWallHeight + threadThickness + threadSideWallHeight) / perimeterLength) % 1;
            uvs.push( uv.x, uv.y );
            //uvsTag.push( 'tff3', 'tff3', 'tff3');

            // Outer surface of shaft
            for ( let j = 0; j <= radialSegments; j++ ) {
              uv.x = i / tubularSegments;
              uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * j / radialSegments * shaftOuterRadius) / perimeterLength) % 1;
              uvs.push( uv.x, uv.y );
              //uvsTag.push( 'out' + j, 'out' + j, 'out' + j);
            }

            if (renderInnerSurface) {
              // Inner surface of shaft
              for ( let j = 0; j <= radialSegments; j++ ) {
                uv.x = i / tubularSegments;
                uv.y = Math.abs(rotations + (k * perimeterLength / threadStarts + (threadBaseEndAngle - threadBaseHalfAngle) * j / radialSegments * shaftOuterRadius) / perimeterLength) % 1;
                uvs.push( uv.x, uv.y );
                //uvsTag.push( 'inn' + j, 'inn' + j, 'inn' + j);
              }
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

            if (renderInnerSurface) {
              for ( let j = 0; j <= radialSegments; j++ ) {
                const v = precomputedPartOfAngle2 + j * angularStep1;
                const sin = Math.sin( v );
                const cos = Math.cos( v );
                uv.x = shaftInnerRadius * cos
                uv.y = shaftInnerRadius * sin
                uvs.push( uv.x, uv.y );
                //uvsTag.push( 'inn' + j, 'inn' + j, 'inn' + j);
              }
            }

            break;
        }
      }
    }

    function generateIndices() {

      let verticesPerThread
      if (renderInnerSurface) {
        verticesPerThread = 2*(radialSegments + 1) + 6  // Part of shaft (outer and inner) plus each thread comprises 3 faces with 2 verticies per face 
      }
      else {
        verticesPerThread = (radialSegments + 1) + 6  // Part of shaft (outer) plus each thread comprises 3 faces with 2 verticies per face
      }
      const extraOffsetToOuterShaftFirstVertex = 6
      const extraOffsetToInnerShaftFirstVertex = (radialSegments + 1) + 6
      for (let i = 1; i <= tubularSegments; i++) {
        for (let k = 0; k < threadStarts; k++) {

          // Generate the indices for the thread
          for (let j = 0; j < 3; j++) {
            let l = k * verticesPerThread + j * 2 + 1
            const a = verticesPerThread * threadStarts * ( i - 1 ) + ( l - 1 );
            const b = verticesPerThread * threadStarts * i + ( l - 1 );
            const c = verticesPerThread * threadStarts * i + l;
            const d = verticesPerThread * threadStarts * ( i - 1 ) + l;

            indices.push( a, b, c );
            indices.push( c, d, a );
          }
          
          // Generate the indices for the outer shaft
          for ( let j = 1; j <= radialSegments; j++) {
            let l = extraOffsetToOuterShaftFirstVertex + k * verticesPerThread + j
            const a = verticesPerThread * threadStarts * ( i - 1 ) + ( l - 1 );
            const b = verticesPerThread * threadStarts * i + ( l - 1 );
            const c = verticesPerThread * threadStarts * i + l;
            const d = verticesPerThread * threadStarts * ( i - 1 ) + l;

            indices.push( a, b, c );
            indices.push( c, d, a );
          }
        }

        if (renderInnerSurface) {
          // Generate the indices for the inner shaft
          for (let k = 0; k < threadStarts; k++) {
            for ( let j = 0; j <= radialSegments; j++) {
              let l0, l1
              l1 = extraOffsetToInnerShaftFirstVertex + k * verticesPerThread + j
              // Awkward code to handle the wrap around case...
              if (j===0) {
                l0 = extraOffsetToInnerShaftFirstVertex + ((k + threadStarts - 1) % threadStarts) * verticesPerThread + radialSegments
              }
              else {
                l0 = l1 - 1
              }
              const a = verticesPerThread * threadStarts * ( i - 1 ) + ( l0 );
              const b = verticesPerThread * threadStarts * i + ( l0 );
              const c = verticesPerThread * threadStarts * i + l1;
              const d = verticesPerThread * threadStarts * ( i - 1 ) + l1;

              indices.push( c, b, a );
              indices.push( a, d, c );
            }
          }
        }

      }

      // Next create the triangles needed to cover the ends of the screws
      
      if (renderInnerSurface) {
        let l
        for (let ii = 0; ii < 2; ii++) {
          // Iterating through the two ends of the screw...
          const i = tubularSegments + 1 + ii
          // Select one of the two extra vertices located at the center of each end of the screw
          const offsetToTubularSegment = verticesPerThread * threadStarts * i 

          // Cap the ends of the flights
          for (let k = 0; k < threadStarts; k++) {
            const ss = offsetToTubularSegment + k * verticesPerThread
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

          // Cap the ends of the shaft
          let a = offsetToTubularSegment + extraOffsetToOuterShaftFirstVertex
          let c = offsetToTubularSegment + extraOffsetToInnerShaftFirstVertex
          for (let k = 0; k < threadStarts; k++) {
            const extraOffsetToThread = k * verticesPerThread
            for ( let j = 0; j <= radialSegments; j++) {
              const b = offsetToTubularSegment + extraOffsetToThread + extraOffsetToOuterShaftFirstVertex + j
              const d = offsetToTubularSegment + extraOffsetToThread + extraOffsetToInnerShaftFirstVertex + j
              if (ii==0) {
                indices.push( a, b, c );
                indices.push( c, b, d );
              }
              else {
                indices.push( b, a, d );
                indices.push( d, a, c );
              }
              a = b
              c = d
            }
          }

          // Wrap around to the beginning to close the face
          const b = offsetToTubularSegment + extraOffsetToOuterShaftFirstVertex
          const d = offsetToTubularSegment + extraOffsetToInnerShaftFirstVertex
          if (ii==0) {
            indices.push( a, b, c );
            indices.push( c, b, d );
          }
          else {
            indices.push( b, a, d );
            indices.push( d, a, c );
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
          const a = (tubularSegments+3) * threadStarts * verticesPerThread + ii
          b = verticesPerThread * threadStarts * i
          for (let k = 0; k < threadStarts; k++) {
            for (let j = 0; j < 2; j ++ ) {
              // Just need to hit the verticies at (radialSegments+1)+1 and (radialSegments+1)+3 to reach the top of the thread
              l = k * verticesPerThread + j * 2 + 1
              const c = verticesPerThread * threadStarts * i + l;
              if (ii==0) {
                indices.push( a, b, c );
              }
              else {
                indices.push( c, b, a );
              }
              b = c
            }
            for ( let j = 0; j <= radialSegments; j++) {
              l = 6 + k * verticesPerThread + j
              const c = verticesPerThread * threadStarts * i + l;
              if (ii==0) {
                indices.push( a, b, c );
              }
              else {
                indices.push( c, b, a );
              }
              b = c
            }
          }
          const c = verticesPerThread * threadStarts * i
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
