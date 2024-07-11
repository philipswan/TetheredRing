

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

