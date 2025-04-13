import {
  Float32BufferAttribute,
  BufferGeometry,
  Vector3
} from 'three'

import { CylindricalVector3 } from './tram.js'

import * as Curves from 'three/src/extras/curves/Curves.js';

class SledGrapplerPlacementInfo {
  constructor(
    shaftRadius = 1,
    threadRadius = 2,
    threadThickness = .2,
    threadStarts = 2,
    revolutionsPerSecond = 1,
    acceleration = 0,
    initialVelocity = 1,
    initialDistance = 0,
    distanceToSledAft = 0,
    bodyLength = 1,
    numGrapplers = 10,
    magnetThickness = 0.05,
    betweenGrapplerFactor = 0.1,
    shaftToGrapplerPad = 0.01, // m
    additionalRotation = 0,
    launchSledGrapplerMaxRangeOfMotion = 0.5, // Full range of motion is (+/-) 0.5. By design, the grapplers can engage only a fraction of the full circumference of the screws. This value represents half of that fraction.
    launchSledGrapplerTopDeadCenterRotation = 0.5, // The rotation that we'll define as the top dead center
    minMaxArray = [0, 0]) {

    this.shaftRadius = shaftRadius
    this.threadRadius = threadRadius
    this.threadThickness = threadThickness
    this.threadStarts = threadStarts
    this.revolutionsPerSecond = revolutionsPerSecond
    this.acceleration = acceleration
    this.initialVelocity = initialVelocity
    this.initialDistance = initialDistance
    this.distanceToSledAft = distanceToSledAft
    this.bodyLength = bodyLength
    this.numGrapplers = numGrapplers
    this.magnetThickness = magnetThickness
    this.betweenGrapplerFactor = betweenGrapplerFactor
    this.shaftToGrapplerPad = shaftToGrapplerPad
    this.additionalRotation = additionalRotation

    this.numGrapplerSegments = 8 // Must be an even number
    this.midRib = this.numGrapplerSegments/2  // Assumes that numGrapplerSegments is an even number
    const grapplerSpacing = 1.0 / this.numGrapplers * this.bodyLength
    const betweenGrapplerSpacing = grapplerSpacing * this.betweenGrapplerFactor
    this.grapplerMidOffset = betweenGrapplerSpacing/2 + this.midRib * (grapplerSpacing - betweenGrapplerSpacing) / this.numGrapplerSegments
    this.offset = null // Later will be new Vector3()
    this.orientation = null // Later will be new Quaternion()
    this.stowed = false
    this.switchoverSignal = null // Later will be an number from 0 to 1
    this.screwPitch = null // Later will be a number from 0 to 1
    this.launchSledGrapplerMaxRangeOfMotion = launchSledGrapplerMaxRangeOfMotion
    this.launchSledGrapplerTopDeadCenterRotation = launchSledGrapplerTopDeadCenterRotation
    this.minMaxArray = minMaxArray

  }

  // ToDo: I don't think we need launchSledGrapplerRangeFactor as a parameter. It should be a property of the class.
  generatePlacementInfo(grapplerDistance, launchSledGrapplerRangeFactor) {
    // See LauncherMathDocumentation.docx for the derivation of the following equations

    const cA = 0.5 * this.acceleration
    const cB = this.initialVelocity
    const cBSqrd = this.initialVelocity**2

    // Grappler distance is the distance from the back of the adaptive nut to back of the grappler pad.
    // We need the distance to the middle of the grappler pad. We'll call this "gPlus"
    const gPlus = grapplerDistance + this.grapplerMidOffset
    const cC = this.initialDistance - (this.distanceToSledAft + gPlus)
    let time
    if (cBSqrd - 4*cA*cC < 0) {
      // This part of the sled is at a location that doesn't satisfy the distance = f{t, a, v0, d0} equation.
      time = (-cB - 0) / (2*cA)
    }
    else {
      time = (-cB - Math.sqrt(cBSqrd - 4*cA*cC)) / (2*cA)
    }

    const rateOfChangeInForwardDisplacement = this.initialVelocity + this.acceleration * time   // We're going to assume that the launch sled does not start from zero velocity because this would require an thread pitch of zero, which is not manufacturable.
    const rateOfChangeInRotationalDistance1 = 2 * Math.PI * this.shaftRadius * Math.abs(this.revolutionsPerSecond)
    const rateOfChangeInRotationalDistance2 = 2 * Math.PI * this.threadRadius * Math.abs(this.revolutionsPerSecond)
    const innerThreadPitch = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance1
    const outerThreadPitch = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance2

    // Code to calculate how rapidly the grapplers are moving at the given grapplerDistance
    //const midGrapplerDistance = this.bodyLength / 2
    //const gPlus_Mid = midGrapplerDistance + betweenGrapplerSpacing/2 + this.midRib * (grapplerSpacing - betweenGrapplerSpacing) / this.numGrapplerSegments
    //const cC_Mid = this.initialDistance - (this.distanceToSledAft + gPlus_Mid)
    //const deltaAngle = ( -Math.sqrt(cBSqrd - 4*cA*cC)  + Math.sqrt(cBSqrd - 4*cA*cC_Mid)) / (2*cA) * this.revolutionsPerSecond

    const rotations = this.additionalRotation + this.revolutionsPerSecond * time
    // Calculate the maximum theoretical value for rotationAwayFromMidPoint
    const maxRotationAwayFromMidPoint = 0.5 / this.threadStarts

    const rotationsWithTwist = rotations - maxRotationAwayFromMidPoint
    const rotationsWithTwistFrac = rotationsWithTwist - Math.floor(rotationsWithTwist)
    // Only need the midRib version of the next two signals, but we'll calculate it for all of them for now.
    const rotationsMeasuredInThreadStartsInt = Math.floor(rotationsWithTwistFrac * this.threadStarts)
    const rotationsMeasuredInThreadStartsFrac = rotationsWithTwistFrac * this.threadStarts - rotationsMeasuredInThreadStartsInt
    const nearestThread = (this.threadStarts-1) - rotationsMeasuredInThreadStartsInt

    // Convert the 0 to 1 value to a -0.5 to +0.5 value, annd then scale it down by the number of thread starts
    const rotationAwayFromMidPoint = (rotationsMeasuredInThreadStartsFrac - 0.5) / this.threadStarts
    // The first range limit is the specified maximum range of motion of the grapplers (a value of +/- 0.5 would represent be "unlimited range of motion").
    const rangeLimit1 = this.launchSledGrapplerMaxRangeOfMotion
    // The second range limit is needed to cause the grappler move from thread to thread even before the grappler's range of motion is exceeded. 
    const rangeLimit2 = Math.max(0, maxRotationAwayFromMidPoint - launchSledGrapplerRangeFactor / Math.abs(outerThreadPitch))
    const rotationAwayLimit = Math.min(rangeLimit1, rangeLimit2)

    // Before the grappler rotates away from the midpoint all the way to maxRotationAwayFromMidPoint, it will hit rotationAwayLimit. At this point it
    // will start to move from thread to adjacent thread. The switchover a signal is a number from 0 to 1 that represents how much the grapper is pushed back towards
    // the midpoint position. It will push the grappler to the midpoimt and then allow it to return to the rotationAwayLimit position on the adjacent thread.
    if (this.stowed) {
      this.switchoverSignal = 1
    }
    else {
      this.switchoverSignal = Math.max(0, Math.abs(rotationAwayFromMidPoint) - rotationAwayLimit) / (maxRotationAwayFromMidPoint - rotationAwayLimit)
    }

    //chartRow = ''
    // for (let i = 0; i<=this.switchoverSignal; i++) {
    //   chartRow += ' ' + Math.round(1000 * this.switchoverSignal) / 1000
    // }
    //console.log(grapplerDistance, this.switchoverSignal)

    this.threadPitch = (innerThreadPitch + outerThreadPitch) / 2

    const shaftRadiusPlus = this.shaftRadius + this.shaftToGrapplerPad
    const r0 = shaftRadiusPlus - this.shaftToGrapplerPad/2
    const r1 = (shaftRadiusPlus + this.threadRadius) / 2
    const r2 = this.threadRadius + this.shaftToGrapplerPad/2
    const precomputedPartOfAngle1 = 2 * Math.PI * ((rotations + nearestThread / this.threadStarts) % 1)
    const outerThreadPitchAngle = Math.atan(outerThreadPitch)
    const innerThreadPitchAngle = Math.atan(innerThreadPitch)
    const averagePitchAngle = (outerThreadPitchAngle + innerThreadPitchAngle) / 2
    const theta = precomputedPartOfAngle1 + this.magnetThickness / 2 / r1 * Math.sin(averagePitchAngle)
    const y = gPlus - this.magnetThickness / 2 * Math.cos(averagePitchAngle)
    this.offset = new CylindricalVector3(r1, theta, y)
  }
}

class SledGrapplerGeometry extends BufferGeometry {

  constructor(
    shaftRadius = 1,
    threadRadius = 2,
    threadThickness = .2,
    threadStarts = 2,
    revolutionsPerSecond = 1,
    acceleration = 0,
    initialVelocity = 1,
    initialDistance = 0,
    distanceToSledAft = 0,
    bodyLength = 1,
    numGrapplers = 10,
    magnetThickness = 0.05, // m
    betweenGrapplerFactor = 0.1,
    shaftToGrapplerPad = 0.01, // m
    additionalRotation  = 0,
    grapplerDistance = 0,
    offset = new CylindricalVector3(0, 0, 0)) {

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
      initialDistance: initialDistance,
      distanceToSledAft: distanceToSledAft,  // This the distance from the start of the mass driver to the start of this segment of the screw.
      bodyLength: bodyLength,
      numGrapplers: numGrapplers,
      magnetThickness: magnetThickness,
      betweenGrapplerFactor: betweenGrapplerFactor,
      shaftToGrapplerPad: shaftToGrapplerPad,
      additionalRotation : additionalRotation,
      grapplerDistance : grapplerDistance
    };

    const numGrapplerSegments = 8 // Must be an even number
    const midRib = numGrapplerSegments/2  // Assumes that numGrapplerSegments is an even number
    const grapplerSpacing = 1.0 / numGrapplers * bodyLength
    const betweenGrapplerSpacing = grapplerSpacing * betweenGrapplerFactor
    const segmentSpacing = (grapplerSpacing - betweenGrapplerSpacing) / numGrapplerSegments
    const grapplerMidOffset = betweenGrapplerSpacing/2 + midRib * segmentSpacing

    const vertices = []
    const normals = []
    const uvs = []
    const indices = []
    const shaftRadiusPlus = shaftRadius + shaftToGrapplerPad

    // create buffer data

    generateBufferData()

    // build geometry

    this.setIndex( indices )
    this.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) )
    this.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) )
    this.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) )
    this.userData = {offset: new CylindricalVector3(), switchoverSignal: 0, threadPitch: 0}

    // functions

    function generateBufferData() {

      const cA = 0.5 * acceleration
      const cB = initialVelocity
      const cBSqrd = initialVelocity**2
      const rateOfChangeInRotationalDistance1 = 2 * Math.PI * shaftRadius * Math.abs(revolutionsPerSecond)
      const rateOfChangeInRotationalDistance2 = 2 * Math.PI * threadRadius * Math.abs(revolutionsPerSecond)
      const gList = []
      const nearestThread = []
      const rotations = []    // List of values that represent the number of rotations of the screw's spiral path versus distance down the length of the screw.
      const rotationsFrac = []
      const innerThreadPitch = []
      const outerThreadPitch = []

      const maxRotationAwayFromMidPoint = 0.5 / threadStarts

      // Generate the offset to the pad in cylindrical coordinates

      let g = grapplerDistance

      function calcTime(cA, cB, cBSqrd, cC) {
        let time
        if (cBSqrd - 4*cA*cC < 0) {
          time = (-cB - 0) / (2*cA)
        }
        else {
          time = (-cB - Math.sqrt(cBSqrd - 4*cA*cC)) / (2*cA)
        }
        return time
      }

      // g, gPlus, and midwayGPlus are all distances measured from the start of the screw.
      const midwayGPlus = g + grapplerMidOffset
      const averageRadius = (shaftRadius + threadRadius) / 2
      const averageRadiusTimes2Pi = 2 * Math.PI * averageRadius

      // The following code calculates lengthOfScrewsSpiralPath at the location of each grappler.
      // ToDo: This might be too accurate and slow. We might be able to simplify this.
      for (let i = 0; i<=numGrapplerSegments; i++) {
        // i indexes the start (0) and end (1) of the downrange distance spanned by a single grappler.
        // Figure out the screw's rotation at the locaton of each grappler
        // 0 = 0.5 * a * t**2 + v0 * t + d0 - d
        const gPlus = g + betweenGrapplerSpacing/2 + i * segmentSpacing
        const cC = initialDistance - (distanceToSledAft + gPlus)
        const time = calcTime(cA, cB, cBSqrd, cC)
        gList[i] = gPlus
        rotations[i] = additionalRotation + revolutionsPerSecond * time
      }
      let lengthOfScrewsSpiralPath = 0
      for (let i = 1; i<=numGrapplerSegments; i++) {
        lengthOfScrewsSpiralPath += Math.sqrt((gList[i] - gList[i-1])**2 + ((rotations[i] - rotations[i-1])*averageRadiusTimes2Pi)**2)
      }

      // The following factor is the distance between adjacent grapplers divided by the length of the screw's sprial path over the same forward distance.
      const grapplerPadLengthFactor = grapplerSpacing / lengthOfScrewsSpiralPath

      for (let i = 0; i<=numGrapplerSegments; i++) {
        // i indexes the start (0) and end (1) of the downrange distance spanned by a single grappler.
        // Figure out the screw's rotation at the locaton of each grappler
        // 0 = 0.5 * a * t**2 + v0 * t + d0 - d

        // Reduce the arc length of the grappler's magnetic pad by a factor of grapplerPadLengthFactor
        const fullGPlus = g + betweenGrapplerSpacing/2 + i * segmentSpacing
        const gPlus = (fullGPlus - midwayGPlus)*grapplerPadLengthFactor + midwayGPlus
        const cC = initialDistance - (distanceToSledAft + gPlus)
        const time = calcTime(cA, cB, cBSqrd, cC)

        rotations[i] = additionalRotation + revolutionsPerSecond * time
        
        const rotationsTimesThreadStarts = rotations[i] * threadStarts
        rotationsFrac[i] = rotationsTimesThreadStarts - Math.floor(rotationsTimesThreadStarts)
        const rotationsWithTwist = rotations[i] - maxRotationAwayFromMidPoint
        const rotationsWithTwistFrac = rotationsWithTwist - Math.floor(rotationsWithTwist)
        // Only need the midRib version of the next two signals, but we'll calculate it for all of them for now.
        nearestThread[i] = (threadStarts-1) - Math.floor(rotationsWithTwistFrac * threadStarts)

        gList[i] = gPlus
        const rateOfChangeInForwardDisplacement = initialVelocity + acceleration * time   // We're going to assume that the launch sled does not start from zero velocity because this would require an thread pitch of zero, which is not manufacturable.
        innerThreadPitch[i] = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance1
        outerThreadPitch[i] = rateOfChangeInForwardDisplacement / rateOfChangeInRotationalDistance2
      }

      generateGrapplerMagneticPad(gList, nearestThread, rotations, innerThreadPitch, outerThreadPitch, magnetThickness)

      SledGrapplerGeometry.alreadyPrinted = true
    }

    function generateGrapplerMagneticPad(g, nearestThread, rotations, innerThreadPitch, outerThreadPitch, magnetThickness) {
      let l
      let rib
      const vertexArray = []
      const vertexArrayCylindrical = []

      // Note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
      const T = new Vector3(0, 1, 0)
      const N = new Vector3(-1, 0, 0)  // z-axis is up
      const B = new Vector3(0, 0, 1)   // x-axis is to the right when looking at the back of the launcher
      // Angles are counterclockwise, basically for the left screw, looking at it from the back, rotations are similar to cartesian coordinates except y is replaced with z.

      for (let i = 0; i<=numGrapplerSegments; i++) {
        // This loop is following the screw's thread
        const threadHalfOfCrossWidth = Math.min(threadThickness * Math.sqrt(outerThreadPitch[i]**2+1) / Math.abs(outerThreadPitch[i]), shaftRadius/2);

        const precomputedPartOfAngle1 = 2 * Math.PI * ((rotations[i] + nearestThread[midRib] / threadStarts) % 1)
        const outerThreadPitchAngle = Math.atan(outerThreadPitch[i])
        const innerThreadPitchAngle = Math.atan(innerThreadPitch[i])
        const precomputedPartOfAngle2 = precomputedPartOfAngle1 + magnetThickness/threadRadius * Math.sin(outerThreadPitchAngle)
        const precomputedPartOfAngle3 = precomputedPartOfAngle1 + magnetThickness/shaftRadiusPlus * Math.sin(innerThreadPitchAngle)

        // Create four verticies initially in cylindrical coordinates (r, theta, z), but then convert to cartisian coordinates
        const theta = []
        theta.push(precomputedPartOfAngle1); // Inner
        theta.push(precomputedPartOfAngle1); // Outer
        theta.push(precomputedPartOfAngle2); // Outer
        theta.push(precomputedPartOfAngle3); // Inner

        for (let j = 0; j<4; j++) {
          // This loop starts at the shaft-thread interface, goes away from the shaft along the thread face,
          // then moves away from the thread, then heads back toward the shaft.
          const r = ((j==0) || (j==3)) ? shaftRadiusPlus : threadRadius;
          const tempTheta = theta[j]
          const y = (j==2) ? -magnetThickness * Math.cos(outerThreadPitchAngle): (j==3) ? -magnetThickness * Math.cos(innerThreadPitchAngle) : 0   // Don't like this - doesn't look accurate...

          // Save as cylindrical coordinates...
          const vertexCylindrical = new CylindricalVector3()
          vertexCylindrical.r = r
          vertexCylindrical.θ = theta[j] 
          vertexCylindrical.y = g[i] + y
          vertexArrayCylindrical[i*4+j] = vertexCylindrical
        }
      }

      // Generate a center point, an up vector, and an away vector
      // let rib = midRib  // Assumes that numGrapplerSegments is an even number

      // const pivotPointCylindrical0 = vertexArrayCylindrical[rib*4 + 0].clone().add(vertexArrayCylindrical[rib*4 + 3]).multiplyScalar(0.5)
      // const pivotPointCylindrical1 = vertexArrayCylindrical[rib*4 + 1].clone().add(vertexArrayCylindrical[rib*4 + 2]).multiplyScalar(0.5)
      // const offsetCylindrical = pivotPointCylindrical0.clone().add(pivotPointCylindrical1).multiplyScalar(0.5)

      // const outwardFromShaft = pivotPoint1.clone().sub(pivotPoint0).normalize()
      // const midPoint0 = vertexArray[rib*4 + 0].clone().add(vertexArray[rib*4 + 1]).multiplyScalar(0.5)
      // const midPoint1 = vertexArray[rib*4 + 2].clone().add(vertexArray[rib*4 + 3]).multiplyScalar(0.5)
      // const towardThreadFace = midPoint0.clone().sub(midPoint1).normalize()

      // We want to position the grappler using a relative position vector, and orient it around that position. So, add position offset, then apply a quaternion.
      // During cretation we will need to apply the inverse quaterion and then add the inverse position offset.
      // orientation = calculateOrientationQuaternion(new Vector3(0, 1, 0), new Vector3(0, 0, 1), towardThreadFace, outwardFromShaft)
      // const invOrienttion = orientation.clone().invert()

      // function calculateOrientationQuaternion(localForward, localUpward, objectForward, objectUpward) {
      // 	const q1 = new Quaternion
      // 	q1.setFromUnitVectors(objectForward, localForward)
      // 	const rotatedObjectUpwardVector = objectUpward.clone().applyQuaternion(q1)
      // 	const q2 = new Quaternion
      // 	q2.setFromUnitVectors(rotatedObjectUpwardVector, localUpward)
      // 	q2.multiply(q1)
      // 	return q2
      // }

      // Subtract the offset from all of the verticies and then convert the risidual to cartisian coordinates
      //offset = offsetCylindrical

      for (let i = 0; i<=numGrapplerSegments; i++) {
        for (let j = 0; j<4; j++) {
          const r = vertexArrayCylindrical[i*4+j].r  // We won't subtract the 'r' offset as this would distort the geometry of the pad.
          const theta = vertexArrayCylindrical[i*4+j].θ - offset.θ
          const z = vertexArrayCylindrical[i*4+j].y - offset.y
          const sin = Math.sin(theta)
          const cos = Math.cos(theta)
          const vertex = new Vector3()
          vertex.x = r * (cos * B.x + sin * N.x) + z * T.x
          vertex.y = r * (cos * B.y + sin * N.y) + z * T.y
          vertex.z = r * (cos * B.z + sin * N.z) + z * T.z - offset.r
          vertexArray[i*4+j] = vertex
        }
      }

      // Generate first end caps' normals
      rib = 0
      l = vertices.length / 3
      for (let j = 0; j<4; j++) {
        const v = vertexArray[rib*4+j].clone()
        const v1 = v.clone().sub(vertexArray[rib*4+(j+1)%4]) 
        const v2 = v.clone().sub(vertexArray[rib*4+(j+3)%4])
        const normal = v1.cross(v2)
        normals.push(normal.x, normal.y, normal.z)
        vertices.push(v.x, v.y, v.z)
      }
      generateFaceFromFourPoints(l+0, l+1, l+2, l+3)

      rib = numGrapplerSegments
      l = vertices.length / 3
      for (let j = 3; j>=0; j--) {
        const v = vertexArray[rib*4+j].clone()
        const v1 = v.clone().sub(vertexArray[rib*4+(j+1)%4]) 
        const v2 = v.clone().sub(vertexArray[rib*4+(j+3)%4])
        const normal = v1.cross(v2)
        normals.push(normal.x, normal.y, normal.z)
        vertices.push(v.x, v.y, v.z)
      }
      generateFaceFromFourPoints(l+0, l+1, l+2, l+3)

      // Generate the side walls' verticies and normals
      l = vertices.length / 3
      for (rib = 0; rib<=numGrapplerSegments; rib++) {
        for (let j = 0; j<8; j++) {
          const prev = (Math.floor((j+1) / 2) + 3) % 4
          const curr = Math.floor((j+1) / 2) % 4
          const next = (Math.floor((j+3) / 2) + 1) % 4
          const v = vertexArray[rib*4 + curr].clone()
          vertices.push(v.x, v.y, v.z)
          const n = v.clone().sub(vertexArray[rib*4 + ((j%2) ? next : prev)])
          normals.push(n.x, n.y, n.z)
        }
      }

      // Generate the sidewall faces
      for (rib = 0; rib<numGrapplerSegments; rib++) {
        for (let j = 0; j<4; j++) {
          generateFaceFromFourPoints(
            l+(rib+0)*8+j*2,
            l+(rib+1)*8+j*2,
            l+(rib+1)*8+(j*2+1)%8,
            l+(rib+0)*8+(j*2+1)%8)
        }
      }

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


export { SledGrapplerPlacementInfo };
export { SledGrapplerGeometry };
