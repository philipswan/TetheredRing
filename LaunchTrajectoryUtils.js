import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves.js'
import { CircleSuperCurve3 } from './SuperCurves.js'
import * as kmlutils from './kmlutils.js'
import * as tram from './tram.js'

export function defineUpdateTrajectoryCurves () {
  return function (dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

    // LaunchTrajectoryUtils.updateLaunchTrajectory(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

    // The goal is to position the suspended portion of the evacuated launch tube under the tethered ring's tethers. The portion of the launch tube that contains the mass driver will be on the planet's surface.
    // Let's start by defining the sothern most point on the ring as the end of the mass driver. Then we can create a curve that initially follows the surface of the Earth and then, from the end of the mass driver,
    // follows a hyperbolic trajectory away from the earth.

    // console.print: console.log without filename/line number
    console.print = function (...args) {
      queueMicrotask (console.log.bind (console, ...args));
    }

    // ***************************************************************
    // Design the mass driver
    // ***************************************************************

    let forwardAcceleration
    let upwardAcceleration
    let timeNow = this.clock.getElapsedTime()
    function gotStuckCheck(clock, timeNow, t, msg) {
      if (t%2==0) {
        if (timeNow + 2 < clock.getElapsedTime()) {
          console.log('Stuck in ', msg)
          return true
        }
        else {
          return false
        }
      }
      else {
        return false
      }
    }

    const launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
    const launcherMassDriverExitVelocity = dParamWithUnits['launcherMassDriverExitVelocity'].value
    const launcherMassDriverAltitude = dParamWithUnits['launcherMassDriverAltitude'].value
    const launcherEvacuatedTubeExitAltitude = dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value
    const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value

    forwardAcceleration = launcherMassDriverForwardAcceleration

    // Determine the time in the mass driver from acceleration, initial velocity, and final velocity
    // vf = v0 + at, therefore t = (vf-v0)/a
    const launcherMassDriverAccelerationTime = (launcherMassDriverExitVelocity - launcherMassDriverInitialVelocity) / forwardAcceleration
    specs['launcherMassDriverAccelerationTime'] = {value: launcherMassDriverAccelerationTime, units: 's'}
    this.timeWithinMassDriver = launcherMassDriverAccelerationTime

    const launcherMassDriverLength = launcherMassDriverInitialVelocity * launcherMassDriverAccelerationTime + 0.5 * forwardAcceleration * launcherMassDriverAccelerationTime**2
    specs['launcherMassDriverLength'] = {value: launcherMassDriverLength, units: 's'}
    this.launcherMassDriverLength = launcherMassDriverLength
    this.launcherMassDriverScrewModelRoughLength = dParamWithUnits['launcherMassDriverScrewModelRoughLength'].value  // This is the length we want to specify for dynamic model allocation purposes, not a real dimension used to specify the hardware.
    this.massDriverScrewSegments = Math.ceil(launcherMassDriverLength / this.launcherMassDriverScrewModelRoughLength)

    // ***************************************************************
    // Design the ramp. The ramp is positioned at the end of the mass driver to divert the vehicle's trajectory skwards.
    // ***************************************************************
    // Clamp the altitude of the ramp to be between the altitude of the launcher and the altitude of the main ring.
    const launcherRampExitAltitude = Math.max(launcherMassDriverAltitude, Math.min(dParamWithUnits['launcherRampExitAltitude'].value, launcherEvacuatedTubeExitAltitude))
    const launcherMassDriverUpwardAcceleration = dParamWithUnits['launcherMassDriverUpwardAcceleration'].value
    const launcherSledDownwardAcceleration = dParamWithUnits['launcherSledDownwardAcceleration'].value
    const accelerationOfGravity = 9.8 // m/s2 // ToDo: Should make this a function of the selected planet
    const allowableUpwardTurningRadius = launcherMassDriverExitVelocity**2 / (launcherMassDriverUpwardAcceleration - accelerationOfGravity)

    // For the launchRamp, make a triangle ABC where A is the center of the planet, B is the end of the ramp, and C is the center of the circle that defines the allowable turning radius
    const triangleSideAB = crv.radiusOfPlanet + launcherRampExitAltitude
    const triangleSideAC = crv.radiusOfPlanet + launcherMassDriverAltitude + allowableUpwardTurningRadius
    const triangleSideBC = allowableUpwardTurningRadius
    // Use law of cosines to find the angles at C and B
    const angleACB = Math.acos((triangleSideAC**2 + triangleSideBC**2 - triangleSideAB**2) / (2*triangleSideAC*triangleSideBC))
    const angleABC = Math.acos((triangleSideAB**2 + triangleSideBC**2 - triangleSideAC**2) / (2*triangleSideAB*triangleSideBC))
    const angleBAC = Math.PI - angleACB - angleABC
    const upwardAngleAtEndOfRamp = Math.PI - angleABC

    const rampBaseLength = angleBAC * (crv.radiusOfPlanet + launcherMassDriverAltitude) // This is the length along the base of the ramp, measured at ground level, assuming the altitude of the ground is the same as the altitude of the launcher

    // console.log('triangleSideAB', triangleSideAB)
    // console.log('triangleSideAC', triangleSideAC)
    // console.log('triangleSideBC', triangleSideBC)
    // console.log('angleACB', angleACB, angleACB*180/Math.PI)
    // console.log('upwardAngleAtEndOfRamp', upwardAngleAtEndOfRamp, upwardAngleAtEndOfRamp*180/Math.PI)

    this.launcherRampLength = angleACB * allowableUpwardTurningRadius
    this.curveUpTimeOld = this.launcherRampLength / launcherMassDriverExitVelocity // ToDo: This is inaccurate as it does not take into account the loss of speed due to coasting up teh ramp.

    // Let's define the end of the ramp as the launcher's exit position, since from that point on the vehicles will either be coasting or accelerating under their own power.
    // Also, it's a position that we can stick at the top of a mountain ridge and from their adjust parameters like launcer accelleration, etc.
    
    const evacuatedTubeEntrancePositionAroundRing = dParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value
    const evacuatedTubeEntrancePositionInRingRefCoordSys = mainRingCurve.getPoint(evacuatedTubeEntrancePositionAroundRing)
    // Adjust the altitude of the positions to place it the correct distance above the earth's surface
    const evacuatedTubeEntrancePosition = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(evacuatedTubeEntrancePositionInRingRefCoordSys.clone()))
    evacuatedTubeEntrancePosition.normalize().multiplyScalar(crv.radiusOfPlanet + launcherRampExitAltitude)
    // ***************************************************************
    // Now design the evacuated tube that the vehicles will travel within from the end of the ramp to the altitude of the main ring.  
    // ***************************************************************

    const R0 = new THREE.Vector3(crv.radiusOfPlanet + launcherRampExitAltitude, 0, 0)  // This is the vehicle's altitude (measured from the plantet's center) and downrange position at the exit of the launcher
    
    // for (let launcherMassDriverExitVelocity = 100; launcherMassDriverExitVelocity<8000; launcherMassDriverExitVelocity+=100) {
    //   const V0 = new THREE.Vector3(launcherMassDriverExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launcherMassDriverExitVelocity * Math.cos(upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher
    //   const coe = this.orbitalElementsFromStateVector(R0, V0)
    //   const c = coe.semimajorAxis * coe.eccentricity
    //   const apogeeDistance = coe.semimajorAxis + c
    //   const speedAtApogee = Math.sqrt(this.mu * (2 / apogeeDistance - 1 / coe.semimajorAxis))
    //   const speedOfCircularizedOrbit = Math.sqrt(this.mu / apogeeDistance)
    //   const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
    //   const launchVehicleRocketExhaustVelocity = dParamWithUnits['launchVehicleRocketExhaustVelocity'].value
    //   const m0Overmf = Math.exp(deltaVNeededToCircularizeOrbit / launchVehicleRocketExhaustVelocity)
    //   console.print(launcherMassDriverExitVelocity, Math.round(apogeeDistance - crv.radiusOfPlanet), Math.round(deltaVNeededToCircularizeOrbit), Math.round(m0Overmf * 100)/100)
    // }

    let V0 = new THREE.Vector3(launcherMassDriverExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launcherMassDriverExitVelocity * Math.cos(upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher
    const coe = this.orbitalElementsFromStateVector(R0, V0)
    const c = coe.semimajorAxis * coe.eccentricity
    const apogeeDistance = coe.semimajorAxis + c
    const speedAtApogee = Math.sqrt(this.mu * (2 / apogeeDistance - 1 / coe.semimajorAxis))
    const speedOfCircularizedOrbit = Math.sqrt(this.mu / apogeeDistance)
    const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
    const launchVehicleRocketExhaustVelocity = dParamWithUnits['launchVehicleRocketExhaustVelocity'].value
    const m0Overmf = Math.exp(deltaVNeededToCircularizeOrbit / launchVehicleRocketExhaustVelocity)
    //console.log(coe)
    console.log('speedAtApogee', speedAtApogee)
    console.log('apogeeAltitude', apogeeDistance - crv.radiusOfPlanet)
    console.log('deltaVNeededToCircularizeOrbit', deltaVNeededToCircularizeOrbit)
    console.log('m0Overmf', m0Overmf)

    // Better V0 calculation - we need to take into account the rotation of the planet...
    //const V0 = new THREE.Vector2(launcherMassDriverExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launcherMassDriverExitVelocity * Math.cos(upwardAngleAtEndOfRamp)) // This is the vehicle's velocity vector at the exit of the launcher
    //console.log(R0, V0)

    // We want to find the exact time and downrange distance where the vehicle's altitude is equal to the desired suspended evacuated tube exit altitude (or the ground, if it's not going fast enough).
    // We will solve for this iteratively, although there's probably a better way...
    // We will also assume that the vehicle will coast (i.e. it will not accellerate using its rocket engine) within the evacuated tube.
    let t = 0
    let tStep = .1 // second
    let RV, distSquared
    let converging = true
    let lastDifference = -1

    // First, determine if the orbit's appogee or the altitude of the tethered ring is greater.
    if (apogeeDistance>0 && apogeeDistance<=launcherRampExitAltitude) {
      console.log("Error: rampExitAltitude too high")
    }
    // ToDo: Need a better calculation of the optimal height of the evacuated tube's exit in case it can't reach the altitude of the ring.
    let evacuatedTubeExitR = crv.radiusOfPlanet + launcherEvacuatedTubeExitAltitude
    if (apogeeDistance>0) {
      // Eliptical orbit - check if the apogee is higher than the altitude of the ring
      // ToDo: Need a better calculation of the optimal height of the evacuated tube's exit in case it can't reach the altitude of the ring.
      const maxOrbitalR = tram.lerp(crv.radiusOfPlanet + launcherRampExitAltitude, apogeeDistance, 0.8) // No point in going all the way to appogee as this would cause the flight to level out to horizontal.
      evacuatedTubeExitR = Math.min(maxOrbitalR, evacuatedTubeExitR)
    }
    const evacuatedTubeExitRSquared = evacuatedTubeExitR**2

    for (t = 0; (Math.abs(tStep)>0.01) && t<dParamWithUnits['launcherCoastTime'].value && converging; t+=tStep) {
      RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t)
      distSquared = RV.R.x**2 + RV.R.y**2
      if ((distSquared < evacuatedTubeExitRSquared) ^ (tStep>0)) {
        tStep = -tStep/2
      }
      else {
        // Check that we're converging towards (as opposed to diverging from) a solution
        const difference = Math.abs(distSquared - evacuatedTubeExitRSquared)
        if ((lastDifference !== -1) && (difference > lastDifference)) {
          converging = false
        }
        else {
          lastDifference = difference
        }
      }
      if (gotStuckCheck(this.clock, timeNow, t, 'the downrange distance calculation')) break
    }

    // const planetRadiusSquared = crv.radiusOfPlanet**2
    // const ringDistSquared = (crv.radiusOfPlanet + launcherEvacuatedTubeExitAltitude)**2
    // //console.log('Calculating downrange distance from end of ramp to a point on the hyperbolic trajectory at the ring\'s altitude')
    // for (t = 0; (Math.abs(tStep)>0.01) && t<dParamWithUnits['launcherCoastTime'].value && converging; t+=tStep) {
    //   RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t)
    //   distSquared = RV.R.x**2 + RV.R.y**2
    //   const withinBoundaries = (distSquared < ringDistSquared) && (distSquared > planetRadiusSquared) 
    //   if (withinBoundaries ^ (tStep>0)) {
    //     tStep = -tStep/2
    //   }
    //   else {
    //     // Check that we're converging towards (as opposed to diverging from) a solution
    //     const difference = Math.abs(distSquared - ringDistSquared)
    //     if ((lastDifference !== -1) && (difference > lastDifference)) {
    //       converging = false
    //     }
    //     else {
    //       lastDifference = difference
    //     }
    //   }
    //   if (gotStuckCheck(this.clock, timeNow, t, 'the downrange distance calculation')) break
    // }
    // if (!converging) {
    //   console.log('Warning: The downrange distance calculation did not converge')
    // }

    this.timeWithinEvacuatedTube = t
    const evacuatedTubeDownrangeAngle = Math.atan2(RV.R.y, RV.R.x)  // This is the angle subtending the end of the ramp, center of the earth, and the end of the evacuated tube
    //console.log('done')


    // ***************************************************************
    // Next we need to place the end of the ramp and the end of the evacuated tube at locations that are directly under the ring, 
    // so that the lightweight evacuated tube that the launched vehicles will inititially coast through can be suspended from the ring.

    // Convert the angle relative to the center of the Earth to an angle relative to the center of the ring 
    const straightLineHalfDistance = Math.sin(evacuatedTubeDownrangeAngle/2) * (crv.radiusOfPlanet + launcherEvacuatedTubeExitAltitude)
    const evacuatedTubeRingAngle = Math.asin(straightLineHalfDistance / crv.mainRingRadius) * 2

    const evacuatedTubeExitPositionAroundRing = (1 + evacuatedTubeEntrancePositionAroundRing - evacuatedTubeRingAngle / (2*Math.PI)) % 1
    const evacuatedTubeExitPositionInRingRefCoordSys = mainRingCurve.getPoint(evacuatedTubeExitPositionAroundRing)
    // Adjust the altitude of the positions to place it the correct distance above the earth's surface
    evacuatedTubeExitPositionInRingRefCoordSys.multiplyScalar((crv.radiusOfPlanet + launcherEvacuatedTubeExitAltitude) / (crv.radiusOfPlanet + launcherEvacuatedTubeExitAltitude))
    // Convert thes positions into the planet's coordinate system 
    const evacuatedTubeExitPosition = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(evacuatedTubeExitPositionInRingRefCoordSys.clone()))

    // Generate an axis of rotation for define the curvatures of the mass driver and the ramp
    this.axisOfRotation = new THREE.Vector3().crossVectors(evacuatedTubeEntrancePosition, evacuatedTubeExitPosition.clone().sub(evacuatedTubeEntrancePosition)).normalize()

    // Calculate a vector that points to the exit of the mass drive (and the entrance to the ramp)
    const massDriverExitPosition = evacuatedTubeEntrancePosition.clone().applyAxisAngle(this.axisOfRotation, -rampBaseLength / (crv.radiusOfPlanet + launcherMassDriverAltitude))
    massDriverExitPosition.multiplyScalar((crv.radiusOfPlanet + launcherMassDriverAltitude) / (crv.radiusOfPlanet + launcherRampExitAltitude))

    // Position markers at the end of the mass driver and at entrance and exit positions of the evacuated tube
    this.LaunchTrajectoryMarker1.position.copy(massDriverExitPosition)
    this.LaunchTrajectoryMarker2.position.copy(evacuatedTubeEntrancePosition)
    this.LaunchTrajectoryMarker3.position.copy(evacuatedTubeExitPosition)

    // Calculate parameters for the circle that defines the upward arcing launch ramp
    const l1 = massDriverExitPosition.length()   // Distance from the center of the planet to the end of the mass driver
    const rampCircleCenter = massDriverExitPosition.clone().multiplyScalar((allowableUpwardTurningRadius + l1) / l1)  // Points to the center of the circle that defines the ramp's curve
    const rampCircleVector = massDriverExitPosition.clone().multiplyScalar(-allowableUpwardTurningRadius / l1)     // A vector from the center of the circle that defines the ramp back to the mass driver's exit position.
    const rampCircleVectorRotated = rampCircleVector.clone().applyAxisAngle(this.axisOfRotation, -angleACB)
    const rampEndPoint = rampCircleCenter.clone().add(rampCircleVectorRotated)

    this.LaunchTrajectoryMarker4.position.copy(rampCircleCenter)

    // We have the shape of the mass driver and ramp, but we need to get some more information about the vehicle's speed and distance versus time while on the ramp.... 
    // In support of the curve for the ramp, we need to create a lookup table that converts time to speed and distance travelled...
    // Assuming a frictionless ramp with a circular profile, we can calculate the vehicle's speed and position as a function of time and initial velocity.
    let speed = launcherMassDriverExitVelocity
    const unitMass = 1
    const initialKineticEnergy = 0.5 * unitMass * speed**2
    // Add the potential energy...
    const initialPotentialEnergy = -crv.gravitationalConstant * crv.massOfPlanet * unitMass / (crv.radiusOfPlanet + launcherMassDriverAltitude) 
    const minAllowableRampSpeed = 10 // m/s
    let deltaT = 0.1
    let angle = 0
    let lastAngle = 0
    let distance = 0
    let kineticEnergy = initialKineticEnergy
    let potentialEnergy = initialPotentialEnergy
    const rampConversionCurvePoints = []
    for (let t = 0; (lastAngle<angleACB) && (speed>minAllowableRampSpeed); t+=deltaT) {
      rampConversionCurvePoints.push(new THREE.Vector3(speed, distance, t))
      //console.log(t, kineticEnergy, potentialEnergy, speed, angle)
      // Change in angular position...
      const deltaAngle = speed * deltaT / allowableUpwardTurningRadius
      lastAngle = angle
      angle += deltaAngle
      distance = allowableUpwardTurningRadius * angle
      const dValue = distance / this.launcherRampLength 
      const newR = crv.radiusOfPlanet + launcherMassDriverAltitude + allowableUpwardTurningRadius * (1 - Math.cos(angle))
      const newPotentialEnergy = -crv.gravitationalConstant * crv.massOfPlanet * unitMass / newR
      const deltaPE = newPotentialEnergy - potentialEnergy
      // This change in potential energy results in a corresponding loss of kinetic energy... 
      const deltaKE = -deltaPE
      const newKineticEnergy = kineticEnergy + deltaKE
      speed = Math.sqrt(2 * newKineticEnergy / unitMass)
      potentialEnergy = newPotentialEnergy
      kineticEnergy = newKineticEnergy
      // Special check to calculate the curveUp time accurately
      if (angle>=angleACB) {
        const remainingDeltaT = deltaT * (angleACB - lastAngle) / deltaAngle
        this.curveUpTime = t + remainingDeltaT
      }
    }
    if (speed<=minAllowableRampSpeed) {
      console.log('Warning: The vehicle is not going fast enough to make it up the ramp.')
    }
    const rampConversionCurve = new THREE.CatmullRomCurve3(rampConversionCurvePoints)

    const launchRamptTosConvertor = function tTos(t) {
      const tForLookup = t / ((rampConversionCurvePoints.length-1) * deltaT)
      const interpolatedPoint = rampConversionCurve.getPoint(tForLookup)
      const speed = interpolatedPoint.x
      return speed
    }
    const launchRamptTodConvertor = function(t) {
      const tForLookup = t / ((rampConversionCurvePoints.length-1) * deltaT)
      const interpolatedPoint = rampConversionCurve.getPoint(tForLookup)
      const distance = interpolatedPoint.y
      return distance
    }
    const launchRampExitVelocity = launchRamptTosConvertor(this.curveUpTime)

    console.log('launcherRampLength', this.launcherRampLength, 'curveUpTime', this.curveUpTime, this.curveUpTimeOld)
    console.log("launcherMassDriverExitVelocity", launcherMassDriverExitVelocity)
    console.log("launchRampExitVelocity", launchRampExitVelocity)
    // Next design the downward arcing part of the sled's return path

    const allowableDownwardTurningRadius = launchRampExitVelocity**2 / (launcherSledDownwardAcceleration - accelerationOfGravity)
    // For the downward arcing part of the sled's return path we need the rampEndPoint from above and
    // a circle center point that's allowableDownwardTurningRadius further away from the center of the ramp's curve.
    const sledReturnCircleStartPoint = rampEndPoint
    const sledReturnScaleFactor = (allowableUpwardTurningRadius + allowableDownwardTurningRadius) / allowableUpwardTurningRadius
    const sledReturnCircleCenter = rampCircleCenter.clone().add(rampCircleVectorRotated.clone().multiplyScalar(sledReturnScaleFactor))
    const sledReturnCircleLength = Math.PI * 2 * 0.125 * allowableDownwardTurningRadius // The 0.125 fator is just an rough estimate - we'll need to calculated it later.
    this.curveDownTime = sledReturnCircleLength / launchRampExitVelocity // ToDo: This is inaccurate as it does not take into account the increase in speed due to coasting down the ramp.

    this.LaunchTrajectoryMarker5.position.copy(sledReturnCircleCenter)

    // ***************************************************************
    // Next we need to capture some curves and data sets for plotting
    // ***************************************************************

    const launchTrajectoryCurveControlPoints = []
    const freeFlightCurveControlPoints = []
    const evacuatedTubeCurveControlPoints = []

    const altitudeVesusTimeData = []
    const speedVersusTimeData = []
    const downrangeDistanceVersusTimeData = []
    const forwardAccelerationVersusTimeData = []
    const lateralAccelerationVersusTimeData = []
    const aerodynamicDragVersusTimeData = []
    const totalMassVerusTimeData = []

    const t1 = this.timeWithinMassDriver
    console.log("timeWithinMassDriver", this.timeWithinMassDriver)
    const t2 = t1 + this.curveUpTime
    const t3 = t2 + this.timeWithinEvacuatedTube
    const t4 = t3 + dParamWithUnits['launcherCoastTime'].value

    let vehiclePosition
    let vehicleAirSpeed
    let distanceTravelled
    let altitude

    // Prep the vehicle's initial conditions
    const mVehicle = dParamWithUnits['launchVehicleEmptyMass'].value
    const mPayload = dParamWithUnits['launchVehiclePayloadMass'].value
    let mPropellant = dParamWithUnits['launchVehiclePropellantMass'].value
    let m0 = mVehicle + mPayload + mPropellant // mass of vehicle, payload, and propellant

    t = 0
    tStep = .1 // second

    // ***************************************************************
    // Create the part of the trajectory where the vehicle is within mass driver near the planet's surface
    // ***************************************************************
    this.massDriverCurve = new CircleSuperCurve3(new THREE.Vector3(0, 0, 0), this.axisOfRotation, massDriverExitPosition, -launcherMassDriverLength, false)
    const massDrivertTosConvertor = function tTos(t) {
      return launcherMassDriverInitialVelocity + launcherMassDriverForwardAcceleration * t  // 1/2 at^2
    }
    this.massDriverCurve.addtTosConvertor(massDrivertTosConvertor)
    const massDrivertTodConvertor = function(t) {
      return launcherMassDriverInitialVelocity * t + 0.5 * launcherMassDriverForwardAcceleration * t * t  // v0*t + 1/2 at^2
    }
    this.massDriverCurve.addtTodConvertor(massDrivertTodConvertor)
    this.massDriverCurve.setDuration(this.timeWithinMassDriver)
    this.massDriverCurve.name = "massDriverCurve"

    // Start the launch trajectory curve at the beginning of the mass driver.
    //console.log('Creating mass driver part of trajectory.')
    upwardAcceleration = 0   // This does not include the acceleration of gravity from the planet
    altitude = launcherMassDriverAltitude

    for (t = 0; t < this.timeWithinMassDriver; t += tStep) {
      vehicleAirSpeed = this.massDriverCurve.tTos(t, launcherMassDriverInitialVelocity, forwardAcceleration)
      distanceTravelled = this.massDriverCurve.tTod(t, launcherMassDriverInitialVelocity, forwardAcceleration)
      // Rotate the massDriverExitPosition around the axisOfRotation using the angle derived from the distance travelled
      //vehiclePosition = massDriverExitPosition.clone().applyAxisAngle(this.axisOfRotation, (distanceTravelled - launcherMassDriverLength) / (crv.radiusOfPlanet + launcherMassDriverAltitude))
      //console.log('old angle', (distanceTravelled - launcherMassDriverLength) / (crv.radiusOfPlanet + launcherMassDriverAltitude))
      const vehiclePosition = this.massDriverCurve.getPointAt(distanceTravelled/launcherMassDriverLength)
      if (t==0) {
        this.startOfMassDriverPosition = vehiclePosition.clone()
      }
      launchTrajectoryCurveControlPoints.push(vehiclePosition)
      altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
      downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, distanceTravelled, 0))
      speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
      forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
      lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
      aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
      totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))
    }
    //console.log('done')

    // ***************************************************************
    // Create the part of the trajectory where the vehicle is travelling along the upward curving ramp
    // ***************************************************************
    this.launchRampCurve = new CircleSuperCurve3(rampCircleCenter.clone(), this.axisOfRotation.clone().negate(), massDriverExitPosition.clone(), this.launcherRampLength, true)
    this.launchRampCurve.addtTosConvertor(launchRamptTosConvertor)
    this.launchRampCurve.addtTodConvertor(launchRamptTodConvertor)
    this.launchRampCurve.setDuration(this.curveUpTime)
    this.launchRampCurve.name = "launchRampCurve"

    // Test the convertors...
    // angle = 0
    // lastAngle = 0
    // distance = 0
    // kineticEnergy = initialKineticEnergy
    // potentialEnergy = initialPotentialEnergy
    // for (let t = 0; lastAngle<angleACB; t+=deltaT) {
    //   const lutSpeed = launchRamptTosConvertor(t)
    //   const lutDistance = launchRamptTodConvertor(t)
    //   console.print(t, speed, lutSpeed, distance, lutDistance)
    //   // Change in angular position...
    //   const deltaAngle = speed * deltaT / allowableUpwardTurningRadius
    //   lastAngle = angle
    //   angle += deltaAngle
    //   distance = allowableUpwardTurningRadius * angle
    //   const dValue = distance / this.launcherRampLength 
    //   const newR = crv.radiusOfPlanet + launcherMassDriverAltitude + allowableUpwardTurningRadius * (1 - Math.cos(angle))
    //   const newPotentialEnergy = -crv.gravitationalConstant * crv.massOfPlanet * m0 / newR
    //   const deltaPE = newPotentialEnergy - potentialEnergy
    //   // This change in potential energy results in a corresponding loss of kinetic energy... 
    //   const deltaKE = -deltaPE
    //   const newKineticEnergy = kineticEnergy + deltaKE
    //   speed = Math.sqrt(2 * newKineticEnergy / m0)
    //   potentialEnergy = newPotentialEnergy
    //   kineticEnergy = newKineticEnergy
    // }



    // ***************************************************************
    // Create a downward arching curve for the launch sled to travel on after the vehicle detaches.
    // ***************************************************************

    this.launchSledReturnCurve = new CircleSuperCurve3(sledReturnCircleCenter.clone(), this.axisOfRotation.clone(), sledReturnCircleStartPoint.clone(), sledReturnCircleLength, false)
    const launchSledReturntTosConvertor = function tTos(t) {
      // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      return launcherMassDriverExitVelocity
    }
    this.launchSledReturnCurve.addtTosConvertor(launchSledReturntTosConvertor)
    const launchSledReturntTodConvertor = function(t) {
      // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      return launcherMassDriverExitVelocity * t
    }
    this.launchSledReturnCurve.addtTodConvertor(launchSledReturntTodConvertor)
    this.launchSledReturnCurve.setDuration(this.curveDownTime)
    this.launchSledReturnCurve.name = "launchSledReturnCurve"

    forwardAcceleration = 0
    upwardAcceleration = launcherMassDriverUpwardAcceleration

    //console.log('Creating ramp part of trajectory.')
    for (; t<Math.min(t2, 10000); t+=tStep) {   // Hack - Min function added to prevent endless loop in case of bug
      const distanceTravelled = this.launchRampCurve.tTod(t - this.timeWithinMassDriver)
      const d = distanceTravelled / this.launcherRampLength
      vehiclePosition = this.launchRampCurve.getPointAt(d)
      vehicleAirSpeed = this.launchRampCurve.tTos(t - this.timeWithinMassDriver)
      altitude = vehiclePosition.length() - crv.radiusOfPlanet
      const downrangeAngle = massDriverExitPosition.angleTo(vehiclePosition)
      const downrangeDistance = launcherMassDriverLength + downrangeAngle * (crv.radiusOfPlanet + launcherMassDriverAltitude)
      launchTrajectoryCurveControlPoints.push(vehiclePosition)
      altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
      downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
      speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
      forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
      lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, upwardAcceleration, 0))
      aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
      totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))
    }
    //console.log('done')

    //this.LaunchTrajectoryMarker2.position.copy(rampEndPoint)
    const downrangeAngle = massDriverExitPosition.angleTo(rampEndPoint)
    const downrangeDistanceTravelledOnRamp = downrangeAngle * crv.radiusOfPlanet
    distanceTravelled += angleACB * allowableUpwardTurningRadius

    // ***************************************************************
    // Create the part of the trajectory where the vehicle coasts on an eliptical or hyperbolic trajectory within the evacuated tube
    // ***************************************************************
    let distanceTravelledWithinEvacuatedTube = 0
    let lastR = R0
    V0 = new THREE.Vector3(launchRampExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launchRampExitVelocity * Math.cos(upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher

    const evacuatedTubeConversionCurvePoints = []
    const l2 = R0.length()
    const totalSplinePoints = Math.floor((t4-t2)/tStep) // Place spline points at roughly tStep intervals along the launch path (warning - this is not exact)
    const numEvacuatedTubeSplinePoints = Math.floor(totalSplinePoints * (t3-t2) / (t4-t2))
    const tStep1 = (t3 - t2) / (numEvacuatedTubeSplinePoints - 1)
    for (let i = 0; i<numEvacuatedTubeSplinePoints; i++ ) {
      const t = t2 + i * tStep1
      const t5 = i * tStep1  // t5 is the time from the end of the ramp
      const RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t5)
      const downrangeAngle = Math.atan2(RV.R.y, RV.R.x)
      // Calculate the vehicle's position relative to where R0 and V0 were when the vehicle was at R0.
      vehiclePosition = evacuatedTubeEntrancePosition.clone().applyAxisAngle(this.axisOfRotation, downrangeAngle).multiplyScalar(RV.R.length() / l2)
      vehicleAirSpeed = Math.sqrt(RV.V.y**2 + RV.V.x**2) // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
      altitude = Math.sqrt(RV.R.y**2 + RV.R.x**2) - crv.radiusOfPlanet
      const aerodynamicDrag = 0
      const deltaDistanceTravelled = Math.sqrt((RV.R.x-lastR.x)**2 + (RV.R.y-lastR.y)**2) // ToDo: Would be better to find the equation for distance traveled along a hyperbolic path versus time.
      distanceTravelledWithinEvacuatedTube += deltaDistanceTravelled

      const downrangeDistance = launcherMassDriverLength + rampBaseLength + downrangeAngle * (crv.radiusOfPlanet + launcherMassDriverAltitude)
      // Collect control points for curves
      evacuatedTubeConversionCurvePoints.push(new THREE.Vector3(vehicleAirSpeed, distanceTravelledWithinEvacuatedTube, t5))
      launchTrajectoryCurveControlPoints.push(vehiclePosition)
      evacuatedTubeCurveControlPoints.push(vehiclePosition)
      // Save telemery...
      altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
      downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
      speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
      forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
      lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
      aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
      totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))
      lastR = RV.R
    }
    this.launcherEvacuatedTubeLength = distanceTravelledWithinEvacuatedTube
    distanceTravelled += distanceTravelledWithinEvacuatedTube
    const totalLengthOfLaunchSystem = distanceTravelled

    const evacuatedTubeConversionCurve = new THREE.CatmullRomCurve3(evacuatedTubeConversionCurvePoints)

    const evacuatedTubetTosConvertor = function tTos(t) {
      const tForLookup = t / ((evacuatedTubeConversionCurvePoints.length-1) * tStep1)
      const interpolatedPoint = evacuatedTubeConversionCurve.getPoint(tForLookup)
      const speed = interpolatedPoint.x
      return speed
    }
    const evacuatedTubetTodConvertor = function(t) {
      const tForLookup = t / ((evacuatedTubeConversionCurvePoints.length-1) * tStep1)
      const interpolatedPoint = evacuatedTubeConversionCurve.getPoint(tForLookup)
      const distance = interpolatedPoint.y
      return distance
    }
    const evacuatedTubeExitVelocity = evacuatedTubetTosConvertor(this.curveUpTime)


    // ***************************************************************
    // Create the part of the trajectory where the vehicle coasts on an eliptical or hyperbolic trajectory after it leaves the evacuated tube
    // ***************************************************************
    // We'll need to generate some parameters to help us calculate the aerodynamic drag on the vehicle while it's travelling through the rarified upper atmosphere 
    const launchVehicleRadius = dParamWithUnits['launchVehicleRadius'].value
    const launchVehicleBodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    const launchVehicleNoseconeLength = dParamWithUnits['launchVehicleNoseconeLength'].value
    const noseconeAngle = Math.atan2(launchVehicleRadius, launchVehicleNoseconeLength)
    const freeFlightConversionCurvePoints = []
    const numFreeFlightSplinePoints = totalSplinePoints - numEvacuatedTubeSplinePoints
    const tStep2 = (t4 - t3) / (numFreeFlightSplinePoints - 1)
    let distanceTravelledOutsideLaunchSystem = 0
    let warningAlreadyGiven = false

    //console.log('Creating hyprebolic part of trajectory.')
    for (let i = 0; i<numFreeFlightSplinePoints; i++ ) {
      const t = t3 + i * tStep2
      const t5 = t3 - t2 + i * tStep2  // t5 is the time from the end of the ramp
      const RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t5)
      const downrangeAngle = Math.atan2(RV.R.y, RV.R.x)
      // Calculate the vehicle's position relative to where R0 and V0 were when the vehicle was at R0.
      vehiclePosition = evacuatedTubeEntrancePosition.clone().applyAxisAngle(this.axisOfRotation, downrangeAngle).multiplyScalar(RV.R.length() / l2)
      vehicleAirSpeed = Math.sqrt(RV.V.y**2 + RV.V.x**2) // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
      altitude = Math.sqrt(RV.R.y**2 + RV.R.x**2) - crv.radiusOfPlanet
      const deltaDistanceTravelled = Math.sqrt((RV.R.x-lastR.x)**2 + (RV.R.y-lastR.y)**2) // ToDo: Would be better to find the equation for distance traveled along a hyperbolic path versus time.
      const downrangeDistance = launcherMassDriverLength + rampBaseLength + downrangeAngle * (crv.radiusOfPlanet + launcherMassDriverAltitude)
      distanceTravelledOutsideLaunchSystem += deltaDistanceTravelled
      const aerodynamicDrag = this.GetAerodynamicDrag_ChatGPT(altitude, vehicleAirSpeed, noseconeAngle, launchVehicleRadius, launchVehicleBodyLength)
      const fuelFlowRate = aerodynamicDrag / launchVehicleRocketExhaustVelocity
      mPropellant = Math.max(0, mPropellant - fuelFlowRate * tStep2)
      if ((mPropellant == 0) && !warningAlreadyGiven) {
        console.log("Out of propellant!")
        warningAlreadyGiven = true
      }
      m0 = mVehicle + mPayload + mPropellant

      // Collect control points for curves
      freeFlightConversionCurvePoints.push(new THREE.Vector3(vehicleAirSpeed, distanceTravelledOutsideLaunchSystem, t5))
      if (i!=0) {
        // ToDo: This is a bit inaccurate because the temporal spacing of these points differs slightly from that of the points we added earlier
        launchTrajectoryCurveControlPoints.push(vehiclePosition)
      }
      freeFlightCurveControlPoints.push(vehiclePosition)
      // Save telemery...
      altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
      downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
      speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
      forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
      lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
      aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
      totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))
      lastR = RV.R
    }
    //console.log('done')
    this.durationOfLaunchTrajectory = t4
    this.durationOfFreeFlight = t4 - t3
    distanceTravelled += distanceTravelledOutsideLaunchSystem

    const freeFlightConversionCurve = new THREE.CatmullRomCurve3(freeFlightConversionCurvePoints)

    const freeFlighttTosConvertor = function tTos(t) {
      const tForLookup = t / ((freeFlightConversionCurvePoints.length-1) * tStep2)
      const interpolatedPoint = freeFlightConversionCurve.getPoint(tForLookup)
      const speed = interpolatedPoint.x
      return speed
    }
    const freeFlighttTodConvertor = function(t) {
      const tForLookup = t / ((freeFlightConversionCurvePoints.length-1) * tStep2)
      const interpolatedPoint = freeFlightConversionCurve.getPoint(tForLookup)
      const distance = interpolatedPoint.y
      return distance
    }


    // Make a curve for the entire start-to-finish launch trajectory
    this.launchTrajectoryCurve = new CatmullRomSuperCurve3(launchTrajectoryCurveControlPoints)
    this.launchTrajectoryCurve.curveType = 'centripetal'
    this.launchTrajectoryCurve.closed = false
    this.launchTrajectoryCurve.tension = 0

    // Make a curve for the suspended evacuated tube
    this.evacuatedTubeCurve = new CatmullRomSuperCurve3(evacuatedTubeCurveControlPoints)
    this.evacuatedTubeCurve.curveType = 'centripetal'
    this.evacuatedTubeCurve.closed = false
    this.evacuatedTubeCurve.tension = 0

    this.evacuatedTubeCurve.addtTosConvertor(evacuatedTubetTosConvertor)
    this.evacuatedTubeCurve.addtTodConvertor(evacuatedTubetTodConvertor)
    this.evacuatedTubeCurve.setDuration(this.timeWithinEvacuatedTube)
    this.evacuatedTubeCurve.name = "evacuatedTubeCurve"

    // Make a curve for the entire free flight portion of the launch trajectory starting from the end of the evacuated tube
    this.freeFlightCurve = new CatmullRomSuperCurve3(freeFlightCurveControlPoints)
    this.freeFlightCurve.curveType = 'centripetal'
    this.freeFlightCurve.closed = false
    this.freeFlightCurve.tension = 0

    this.freeFlightCurve.addtTosConvertor(freeFlighttTosConvertor)
    this.freeFlightCurve.addtTodConvertor(freeFlighttTodConvertor)
    this.freeFlightCurve.setDuration(this.durationOfFreeFlight)
    this.freeFlightCurve.name = "freeFlightCurve"

    this.xyChart.drawAxes()
    this.xyChart.labelAxes()
    this.xyChart.addCurve("Altitude", "m", altitudeVesusTimeData, 0xff0000, "Red")  // Red Curve
    this.xyChart.addCurve("Downrange Distance", "m", downrangeDistanceVersusTimeData, 0xff00ff, "Purple")  // Purple Curve
    this.xyChart.addCurve("Speed", "m/s", speedVersusTimeData, 0x00ffff, "Cyan")  // Cyan Curve
    this.xyChart.addCurve("Aerodynmic Drag", "N", aerodynamicDragVersusTimeData, 0x80ff80, "Bright Green") // Bright Green Curve
    this.xyChart.addCurve("Vehicle Mass", "kg", totalMassVerusTimeData, 0x0000ff, "Blue") // Blue Curve
    this.xyChart.addCurve("Forward Accelleration", "m/s2", forwardAccelerationVersusTimeData, 0xffff00, "Yellow") // Yellow Curve
    this.xyChart.addCurve("Lateral Accelleration", "m/s2", lateralAccelerationVersusTimeData, 0xff8000, "Orange") // Orange Curve

    console.print('========================================')
    let peakAerodynamicDrag = 0
    this.xyChart.curveInfo.forEach(curve =>{
      console.print(curve.name, '(', curve.colorName, ')', curve.maxY)
      if (curve.name == 'Aerodynmic Drag') {
        peakAerodynamicDrag = curve.maxY
      }
    })
    console.print("Vehicle Peak Aerodynamic Drag", Math.round(peakAerodynamicDrag/1000), 'kN')
    console.print("RS-25 Engine Thrust 2279 kN")
    console.print("Vehicle Initial Mass", Math.round(m0), 'kg')
    console.print("MassDriver Time", Math.round(launcherMassDriverAccelerationTime*100/60)/100, 'min')
    console.print("Ramp Time", Math.round(this.curveUpTime*10)/10, 'sec')
    console.print("Evacuate Tube Time", Math.round(this.timeWithinEvacuatedTube*10)/10, 'sec')
    console.print("MassDriver Length", Math.round(this.launcherMassDriverLength/1000), 'km')
    console.print("Ramp Base Length", Math.round(rampBaseLength/1000), 'km')
    console.print("Evacuate Tube Length", Math.round(distanceTravelledWithinEvacuatedTube/1000), 'km')
    console.print("Total Length Of Launch System", Math.round(totalLengthOfLaunchSystem/1000), 'km')
    console.print('========================================')

    if (genLauncherKMLFile) {
      // Start a polyline...
      kmlFile = kmlutils.kmlLauncherPlacemarkHeader

      // launchTrajectoryCurveControlPoints.forEach(point => {
      //   const xyzPlanet = planetCoordSys.worldToLocal(point.clone())
      //   const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
      //   const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
      //   kmlFile = kmlFile.concat(coordString)
      // })
      const numSupports = 100
      // To make the line for the mass driver... 
      for (let i = 0; i<numSupports; i++) {
        const d = i / (numSupports-1)
        const pointOnCurve = this.massDriverCurve.getPointAt(d)
        // You'll need to convert each point to lla with this code...
        const xyzPlanet = planetCoordSys.worldToLocal(pointOnCurve.clone())
        const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
        const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
        kmlFile = kmlFile.concat(coordString)
      }

      // Extend the line for the ramp...
      for (let i = 1; i<numSupports; i++) {
        const d = i / (numSupports-1)
        const pointOnCurve = this.launchRampCurve.getPointAt(d)
        // You'll need to convert each point to lla with this code...
        const xyzPlanet = planetCoordSys.worldToLocal(pointOnCurve.clone())
        const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
        const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
        kmlFile = kmlFile.concat(coordString)
      }

      // Finish the poly line...
      kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)

      // To make the supports...
      for (let i = 0; i<numSupports; i++) {
        const d = i / (numSupports-1)
        const pointOnCurve = this.launchRampCurve.getPointAt(d)
        const tanget = this.launchRampCurve.getTangentAt(d)
        const normal = this.launchRampCurve.getNormalAt(d)
        const binormal = this.launchRampCurve.getBinormalAt(d)
        const pointOnCurveAltitude = pointOnCurve.length() - crv.radiusOfPlanet
        const pointOnGround = pointOnCurve.clone().multiplyScalar(crv.radiusOfPlanet / pointOnCurve.length())
        const pointToLeft = pointOnGround.clone().sub(binormal.clone().multiplyScalar(0.3 * pointOnCurveAltitude))
        const pointToRight = pointOnGround.clone().add(binormal.clone().multiplyScalar(0.3 * pointOnCurveAltitude))

        const crossbarPoint = pointOnCurve.clone().multiplyScalar((crv.radiusOfPlanet + 100)/ pointOnCurve.length())
        const crossbarPointToLeft = pointOnGround.clone().sub(binormal.clone().multiplyScalar(0.3 * pointOnCurveAltitude))
        const crossbarPointToRight = pointOnGround.clone().add(binormal.clone().multiplyScalar(0.3 * pointOnCurveAltitude))
        // To make the support, draw polyline from pointToLeft to pointOnCurve to pointToRight...
        const pointList = [pointToLeft, pointOnCurve, pointToRight]
        const crossbarPointList = [crossbarPointToLeft, crossbarPointToRight]

        // Start a polyline
        kmlFile = kmlFile.concat(kmlutils.kmlRampSupportPlacemarkHeader)

        // You'll need to convert each point to lla with this code...
        pointList.forEach(point => {
          const xyzPlanet = planetCoordSys.worldToLocal(point.clone())
          const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
          const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
          kmlFile = kmlFile.concat(coordString)
        })
        
        // End the polyline
        kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)

        // draw crossbar

        // Start a polyline
        kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader)
        
        crossbarPointList.forEach(point => {
          const xyzPlanet = planetCoordSys.worldToLocal(point.clone())
          const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
          const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
          kmlFile = kmlFile.concat(coordString)
        })

        // End the polyline
        kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)

        
      }
      this.kmlFile = kmlFile;
    }
  }
}
