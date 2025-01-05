import * as THREE from 'three'


export function EngineerRamp(massDriver2ExitPosition, allowableUpwardTurningRadius, axisOfRotation, angleACB) {

    // Calculate parameters for the circle that defines the upward arcing launch ramp
    const l1 = massDriver2ExitPosition.length()   // Distance from the center of the planet to the end of the mass driver
    const rampCircleCenter = massDriver2ExitPosition.clone().multiplyScalar((allowableUpwardTurningRadius + l1) / l1)  // Points to the center of the circle that defines the ramp's curve
    // Create a vector from the ramp circle center to teh start of the ramp
    const rampCircleVector = massDriver2ExitPosition.clone().multiplyScalar(-allowableUpwardTurningRadius / l1)     // A vector from the center of the circle that defines the ramp back to the mass driver's exit position.
    // Rotate the vector by -angleACB to make it point to the end of the ramp
    const rampCircleVectorRotated = rampCircleVector.clone().applyAxisAngle(axisOfRotation, -angleACB)
    // Calculate the end point of the ramp
    const rampEndPoint = rampCircleCenter.clone().add(rampCircleVectorRotated)

    return {rampCircleCenter, rampCircleVectorRotated, rampEndPoint}
  
}

export class CalculateSpeedAndPositionVersusTime {
  constructor(
    launcherMassDriverExitVelocity,
    launcherMassDriverAltitude,
    planetRadius,
    planetSpec,
    allowableUpwardTurningRadius,
    angleACB,
    acceleration  // When negative, this represents the deceleration due to intentional braking or possibly friction
  ) {
    let speed = launcherMassDriverExitVelocity
    const unitMass = 1
    const initialKineticEnergy = 0.5 * unitMass * speed ** 2
    // Add the potential energy...
    const initialPotentialEnergy = -planetSpec.gravitationalParameter * unitMass / (planetRadius + launcherMassDriverAltitude)
    const minAllowableRampSpeed = 0.01 // m/s
    let launchRampTStep = 0.1
    let numSteps = 0
    let currAngleACB
    let lastAngleACB
    let distance
    let kineticEnergy
    let newKineticEnergy
    let potentialEnergy
    let deltaAngle
    const rampConversionCurvePoints = []
    let timeWithinRamp

    for (let iteration = 0; iteration < 2; iteration++) {
      currAngleACB = 0
      lastAngleACB = 0
      distance = 0
      speed = launcherMassDriverExitVelocity
      kineticEnergy = initialKineticEnergy
      potentialEnergy = initialPotentialEnergy
      let t
      for (let i = 0; (iteration == 0) ? ((lastAngleACB < angleACB) && (speed > minAllowableRampSpeed)) : i <= numSteps; i++) {
        t = i * launchRampTStep
        if (iteration == 1) {
          rampConversionCurvePoints.push(new THREE.Vector3(distance, speed, t))
        }
        //console.log(t, kineticEnergy, potentialEnergy, speed, currAngleACB)
        // Change in angular position...
        deltaAngle = speed * launchRampTStep / allowableUpwardTurningRadius
        lastAngleACB = currAngleACB
        currAngleACB += deltaAngle
        distance = allowableUpwardTurningRadius * currAngleACB
        // ToDo: This next line isn't perfectly accurate. Since we have an currAngleACB and two sides of a triangle, we should be able to calculate
        // the third side of the triangle, which is the distance from the vehicle to the center of the earth, by using the
        // law of cosines.
        // For the launchRamp, make a triangle ABC where A is the center of the planet, B is a point on the ramp, and C is the center
        // of the circle that defines the allowable turning radius. "currAngleACB" is the currAngleACB at C. We want to find the distance from A to B.
        const triangleSideAC = planetRadius + launcherMassDriverAltitude + allowableUpwardTurningRadius
        const triangleSideBC = allowableUpwardTurningRadius
        const triangleSideAB = Math.sqrt(triangleSideAC ** 2 + triangleSideBC ** 2 - 2 * triangleSideAC * triangleSideBC * Math.cos(currAngleACB))
        const newPotentialEnergy = -planetSpec.gravitationalParameter * unitMass / triangleSideAB
        const deltaPE = newPotentialEnergy - potentialEnergy
        // This change in potential energy results in a corresponding loss of kinetic energy... 
        const deltaKE = -deltaPE
        newKineticEnergy = kineticEnergy + deltaKE
        speed = Math.sqrt(2 * newKineticEnergy / unitMass)
        if ((acceleration < 0) && (speed > 0)) {
          speed = speed - ((speed>0) ? Math.min(speed, -acceleration*launchRampTStep) : 0)
          //console.log('Decelerating: ', speed, currAngleACB/angleACB)
        }
        newKineticEnergy = 0.5 * unitMass * speed**2
        potentialEnergy = newPotentialEnergy
        kineticEnergy = newKineticEnergy
      }
      if (iteration == 0) {
        // Special check to calculate the curveUp time super accurately
        if (currAngleACB >= angleACB) {
          const remainingDeltaT = launchRampTStep * (angleACB - lastAngleACB) / deltaAngle
          timeWithinRamp = t + remainingDeltaT
        }
        else {
          timeWithinRamp = t
        }
        numSteps = Math.ceil(timeWithinRamp / launchRampTStep)
        launchRampTStep = timeWithinRamp / numSteps
      }
    }
    if (currAngleACB < angleACB) {
      console.log('Warning: The launch vehicle was not going fast enough to make it up the ramp.')
      // Not accurate, but we're in an error condition at this point.
      //timeWithinRamp = this.launcherRampLength / launcherMassDriverExitVelocity
    }

    return [rampConversionCurvePoints, timeWithinRamp]

  }
}

export class CreateConversionFunctions {
  constructor(rampConversionCurvePoints, timeWithinRamp) {
    const rampConversionCurve = new THREE.CatmullRomCurve3(rampConversionCurvePoints)

    const launchRamptToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      // Interpolation distance is a value that is useful for interpolating between points on the curve,
      // in this case the rampConversionCurve.
      return t / timeWithinRamp
    }
    const launchRamptTodConvertor = function (t) {
      // Time to Distance Convertor
      const iForLookup = launchRamptToiConvertor(t)
      const interpolatedPoint = rampConversionCurve.getPoint(iForLookup)
      const distance = interpolatedPoint.x
      return distance
    }
    const launchRamptTosConvertor = function (t) {
      // Time to Speed Convertor
      const iForLookup = launchRamptToiConvertor(t)
      const interpolatedPoint = rampConversionCurve.getPoint(iForLookup)
      const speed = interpolatedPoint.y
      return speed
    }
    return [launchRamptToiConvertor, launchRamptTodConvertor, launchRamptTosConvertor]
  }
}