import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves.js'
import { CircleSuperCurve3 } from './SuperCurves.js'
import * as kmlutils from './kmlutils.js'
import * as tram from './tram.js'
import * as LauncherRamp from './launcherRamp.js'

export function defineUpdateTrajectoryCurves () {
  return function (dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

    // LaunchTrajectoryUtils.updateLaunchTrajectory(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

    // The goal is to position the suspended portion of the evacuated launch tube under the tethered ring's tethers. The portion of the launch tube that contains the mass driver will be on the planet's surface.
    // Let's start by defining the sothern most point on the ring as the end of the mass driver. Then we can create a curve that initially follows the surface of the Earth and then, from the end of the mass driver,
    // follows a hyperbolic trajectory away from the planet.

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
    function gotStuckCheck(clock, timeNow, msg) {
      if (timeNow + 2 < clock.getElapsedTime()) {
        console.log('Stuck in ', msg)
        return true
      }
      else {
        return false
      }
    }

    const launcherFeederRailLength = dParamWithUnits['launcherFeederRailLength'].value
    const launcherMassDriver1InitialVelocity = dParamWithUnits['launcherMassDriver1InitialVelocity'].value
    const launcherMassDriver2InitialVelocity = dParamWithUnits['launcherMassDriver2InitialVelocity'].value
    const launcherMassDriverExitVelocity = dParamWithUnits['launcherMassDriverExitVelocity'].value
    const launcherMassDriverAltitude = dParamWithUnits['launcherMassDriverAltitude'].value
    const launcherEvacuatedTubeExitAltitude = dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value
    const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
    const launchVehicleSeaLevelRocketExhaustVelocity = dParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value
    const launchVehicleVacuumRocketExhaustVelocity = dParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value
    const launchVehicleDesiredOrbitalAltitude = dParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value
    const launcherCoastTime = dParamWithUnits['launcherCoastTime'].value
    const launcherXyChartMaxT = dParamWithUnits['launcherXyChartMaxT'].value
    const launchVehicleEffectiveRadius = dParamWithUnits['launchVehicleEffectiveRadius'].value
    const verbose = dParamWithUnits['verboseLogging'].value

    forwardAcceleration = launcherMassDriverForwardAcceleration

    // Determine the time in the mass driver from acceleration, initial velocity, and final velocity
    // vf = v0 + at, therefore t = (vf-v0)/a
    const launcherMassDriver2AccelerationTime = (launcherMassDriverExitVelocity - launcherMassDriver2InitialVelocity) / forwardAcceleration
    const launcherMassDriver1AccelerationTime = (launcherMassDriver2InitialVelocity - launcherMassDriver1InitialVelocity) / forwardAcceleration
    specs['launcherMassDriver1AccelerationTime'] = {value: launcherMassDriver1AccelerationTime, units: 's'}
    specs['launcherMassDriver2AccelerationTime'] = {value: launcherMassDriver2AccelerationTime, units: 's'}
    this.timeWithinFeederRail = launcherFeederRailLength / launcherMassDriver1InitialVelocity
    this.timeWithinMassDriver1 = launcherMassDriver1AccelerationTime
    this.timeWithinMassDriver2 = launcherMassDriver2AccelerationTime

    const launcherMassDriver1Length = launcherMassDriver1InitialVelocity * launcherMassDriver1AccelerationTime + 0.5 * forwardAcceleration * launcherMassDriver1AccelerationTime**2
    const launcherMassDriver2Length = launcherMassDriver2InitialVelocity * launcherMassDriver2AccelerationTime + 0.5 * forwardAcceleration * launcherMassDriver2AccelerationTime**2
    specs['launcherMassDriver1Length'] = {value: launcherMassDriver1Length, units: 'm'}
    specs['launcherMassDriver2Length'] = {value: launcherMassDriver2Length, units: 'm'}
    this.launcherMassDriver1Length = launcherMassDriver1Length
    this.launcherMassDriver2Length = launcherMassDriver2Length
    this.launcherMassDriverScrewRoughLength = dParamWithUnits['launcherMassDriverScrewRoughLength'].value  // This is the length we want to specify for dynamic model allocation purposes, not a real dimension used to specify the hardware.
    this.massDriverAccelerationScrewSegments = Math.ceil(launcherMassDriver2Length / this.launcherMassDriverScrewRoughLength)
    this.totalLengthOfLaunchSystem = launcherFeederRailLength + launcherMassDriver1Length + launcherMassDriver2Length
    this.animateElevatedEvacuatedTubeDeployment = dParamWithUnits['animateElevatedEvacuatedTubeDeployment'].value

    // ******************************************************************************************************************************
    // ******************************************************************************************************************************
    // Design the ramp. The ramp is positioned at the end of the mass driver to divert the vehicle's trajectory skwards.
    // ******************************************************************************************************************************
    // ******************************************************************************************************************************
    // Clamp the altitude of the ramp to be between the altitude of the launcher and the altitude of the main ring.
    const launcherRampExitAltitude = Math.max(launcherMassDriverAltitude, Math.min(dParamWithUnits['launcherRampExitAltitude'].value, launcherEvacuatedTubeExitAltitude))
    const launcherRampUpwardAcceleration = dParamWithUnits['launcherRampUpwardAcceleration'].value
    const launcherSledDownwardAcceleration = dParamWithUnits['launcherSledDownwardAcceleration'].value
    const accelerationOfGravity = 9.8 // m/s2 // ToDo: Should make this a function of the selected planet
    // Limit the allowable turning radius basd on the altitude at the end of the ramp
    let allowableUpwardTurningRadius
    if (dParamWithUnits['launcherRampDesignMode'].value===0) {
      // Base the allowable turning radius on the upwards acceleration limit
      allowableUpwardTurningRadius = Math.max(launcherRampExitAltitude-launcherMassDriverAltitude, launcherMassDriverExitVelocity**2 / (launcherRampUpwardAcceleration - accelerationOfGravity))
    }
    else {
      allowableUpwardTurningRadius = dParamWithUnits['launcherRampTurningRadius'].value
    }
    
    // For the launchRamp, make a triangle ABC where A is the center of the planet, B is the end of the ramp, and C is the center of the circle that defines the allowable turning radius
    //const triangleSideAB = this.planetRadius + launcherRampExitAltitude
    const lat = dParamWithUnits['launcherRampEndLatitude'].value*Math.PI/180
    const lon = dParamWithUnits['launcherRampEndLongitude'].value*Math.PI/180
    const launcherRampEndLocation = tram.geodeticToECEF(lat, lon, launcherRampExitAltitude, planetSpec.ellipsoid)
    const launcherRampEndDistance = (new THREE.Vector3(launcherRampEndLocation.x, launcherRampEndLocation.y, launcherRampEndLocation.z)).length()
    const launcherRampStartLocation = tram.geodeticToECEF(lat, lon, launcherMassDriverAltitude, planetSpec.ellipsoid) // Not perfectly accurate as launcherMassDriverAltitude is not located at the end of the ramp, but close enough
    const launcherRampStartDistance = (new THREE.Vector3(launcherRampStartLocation.x, launcherRampStartLocation.y, launcherRampStartLocation.z)).length()
    const triangleSideAB = launcherRampEndDistance
    //const triangleSideAC = this.planetRadius + launcherMassDriverAltitude + allowableUpwardTurningRadius
    const triangleSideAC = launcherRampStartDistance + allowableUpwardTurningRadius
    const triangleSideBC = allowableUpwardTurningRadius
    // Use law of cosines to find the angles at C and B
    const angleACB = Math.acos((triangleSideAC**2 + triangleSideBC**2 - triangleSideAB**2) / (2*triangleSideAC*triangleSideBC))
    const angleABC = Math.acos((triangleSideAB**2 + triangleSideBC**2 - triangleSideAC**2) / (2*triangleSideAB*triangleSideBC))
    const angleBAC = Math.PI - angleACB - angleABC
    this.upwardAngleAtEndOfRamp = Math.PI - angleABC

    //const rampBaseLength = angleBAC * (this.planetRadius + launcherMassDriverAltitude) // This is the length along the base of the ramp, measured at the altitude of the mass driver (ToDo: Assuming the altitude of "the base" is the same as the altitude of the mass driver may be confusing.)
    const rampBaseLength = angleBAC * launcherRampStartDistance // This is the length along the base of the ramp, measured at the altitude of the mass driver (ToDo: Assuming the altitude of "the base" is the same as the altitude of the mass driver may be confusing.)

    // console.log('triangleSideAB', triangleSideAB)
    // console.log('triangleSideAC', triangleSideAC)
    // console.log('triangleSideBC', triangleSideBC)
    // console.log('angleACB', angleACB, angleACB*180/Math.PI)
    // console.log('upwardAngleAtEndOfRamp', this.upwardAngleAtEndOfRamp, this.upwardAngleAtEndOfRamp*180/Math.PI)

    this.launcherRampLength = angleACB * allowableUpwardTurningRadius
    this.totalLengthOfLaunchSystem += this.launcherRampLength

    // We'll define the end of the ramp as the launcher's official "exit position", since from that point on the vehicles will either be coasting
    // or accelerating under their own power. Also, it's a position that we can site at the top of a mountain and, from their, adjust parameters
    // like launcher acceleration, etc.
    let evacuatedTubeEntrancePosition
    const evacuatedTubeEntrancePositionAroundRing = dParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value
    if (dParamWithUnits['launcherLocationMode'].value==0) {
      const evacuatedTubeEntrancePositionInRingRefCoordSys = mainRingCurve.getPoint(evacuatedTubeEntrancePositionAroundRing)
      // Adjust the altitude of the positions to place it the correct distance above the planet's surface
      if (planetCoordSys.matrixWorldNeedsUpdate) planetCoordSys.updateMatrixWorld(true)
      if (tetheredRingRefCoordSys.matrixWorldNeedsUpdate) tetheredRingRefCoordSys.updateMatrixWorld(true)
      console.assert(planetCoordSys.matrixWorldNeedsUpdate===false, 'planetCoordSys.matrixWorldNeedsUpdate===false')
      const evacuatedTubeEntrancePositionInWorldCoordSystem = tetheredRingRefCoordSys.localToWorld(evacuatedTubeEntrancePositionInRingRefCoordSys.clone())
      const tempP1 = planetCoordSys.worldToLocal(evacuatedTubeEntrancePositionInWorldCoordSystem)
      const tempp2 = tram.ecefToGeodetic(tempP1.x, tempP1.y, tempP1.z, planetSpec.ellipsoid)
      const tempP3 = tram.geodeticToECEF(tempp2.lat, tempp2.lon, launcherRampExitAltitude, planetSpec.ellipsoid)
      evacuatedTubeEntrancePosition = new THREE.Vector3(tempP3.x, tempP3.y, tempP3.z)
    }
    else if (dParamWithUnits['launcherLocationMode'].value==1) {
      const lat = dParamWithUnits['launcherRampEndLatitude'].value
      const lon = dParamWithUnits['launcherRampEndLongitude'].value
      const alt = launcherRampExitAltitude
      const tempVec = tram.geodeticToECEF(lat, lon, alt, planetSpec.ellipsoid)
      evacuatedTubeEntrancePosition = new THREE.Vector3(tempVec.x, tempVec.y, tempVec.z)
    }
    else {
      console.error('Invalid launcherLocationMode')
    }
    this.planetRadius = evacuatedTubeEntrancePosition.length() - launcherRampExitAltitude
  
    // ***************************************************************
    // Now design the evacuated tube that the vehicles will travel within from the end of the ramp to the altitude of the main ring.  
    // ***************************************************************
    let apogeeDistance
    let perigeeDistance

    const R0_2D = new THREE.Vector3(evacuatedTubeEntrancePosition.length(), 0, 0)  // This is the vehicle's altitude (measured from the plantet's center) and downrange position at the exit of the launcher
    
    // for (let launcherMassDriverExitVelocity = 100; launcherMassDriverExitVelocity<8000; launcherMassDriverExitVelocity+=100) {
    //   const V0 = new THREE.Vector3(launcherMassDriverExitVelocity * Math.sin(this.upwardAngleAtEndOfRamp), launcherMassDriverExitVelocity * Math.cos(this.upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher
    //   const coe = this.orbitalElementsFromStateVector(R0_2D, V0)
    //   const c = coe.semimajorAxis * coe.eccentricity
    //   const apogeeDistance = coe.semimajorAxis + c
    //   const speedAtApogee = Math.sqrt(this.mu * (2 / apogeeDistance - 1 / coe.semimajorAxis))
    //   const speedOfCircularizedOrbit = Math.sqrt(this.mu / apogeeDistance)
    //   const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
    //   const launchVehicleRocketExhaustVelocity = dParamWithUnits['launchVehicleRocketExhaustVelocity'].value
    //   const m0Overmf = Math.exp(deltaVNeededToCircularizeOrbit / launchVehicleRocketExhaustVelocity)
    //   console.print(launcherMassDriverExitVelocity, Math.round(apogeeDistance - this.planetRadius), Math.round(deltaVNeededToCircularizeOrbit), Math.round(m0Overmf * 100)/100)
    // }

    // Need a vector normal to planet's axis that points to the evacuated tube's entrance
    const planetAxisToEvacuatedTubeEntrancePosition = new THREE.Vector3(evacuatedTubeEntrancePosition.x, 0, evacuatedTubeEntrancePosition.z)

    this.speedFromPlanetsRotation = planetAxisToEvacuatedTubeEntrancePosition.length() * 2 * Math.PI / (planetSpec.lengthOfSiderealDay)
    // This is a rather rough calculation. It assmues that the launcher points directly east.
    // It also doesn't take into account speed lost traveling up the ramp. We're just using it to estimate how far
    // downrange the vehicle will be when it reaches the altitude of the ring to help orient the launcher so that the
    // evacuated tube is entirely under the ring.
    const V0_2D = new THREE.Vector3(
      launcherMassDriverExitVelocity * Math.sin(this.upwardAngleAtEndOfRamp),
      launcherMassDriverExitVelocity * Math.cos(this.upwardAngleAtEndOfRamp) + this.speedFromPlanetsRotation,
      0) 

    const coeRough = this.orbitalElementsFromStateVector(R0_2D, V0_2D)
    const c = coeRough.semimajorAxis * coeRough.eccentricity
    if (coeRough.semimajorAxis<0) {
      // Hyperbolic trajectory
      apogeeDistance = Infinity
    }
    else if (coeRough.semimajorAxis===0) {
      // Parabolic trajectory
      apogeeDistance = Infinity
    }
    else {
      // Eliptical trajectory
      apogeeDistance = Math.max(R0_2D.length(), coeRough.semimajorAxis + c)
      // First, determine if the orbit's apogee or the altitude of the tethered ring is greater.
      if ((apogeeDistance>this.planetRadius) && (apogeeDistance<=this.planetRadius+launcherRampExitAltitude)) {
        console.log("Error: rampExitAltitude too high")
      }
    }
    // const speedAtApogee = Math.sqrt(this.mu * (2 / apogeeDistance - 1 / coeRough.semimajorAxis))
    // const speedOfCircularizedOrbit = Math.sqrt(this.mu / apogeeDistance)
    // const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
    // const m0Overmf = Math.exp(deltaVNeededToCircularizeOrbit / launchVehicleRocketExhaustVelocity)
    // console.log(coeRough, V0_2D.length())
    // console.log('speedAtApogee', speedAtApogee)
    // console.log('apogeeAltitude', apogeeDistance - this.planetRadius)
    // console.log('deltaVNeededToCircularizeOrbit', deltaVNeededToCircularizeOrbit)
    // console.log('m0Overmf', m0Overmf)

    // We want to find the exact time and downrange distance where the vehicle's altitude is equal to the desired suspended evacuated tube exit altitude (or the ground, if it's not going fast enough).
    // We will solve for this iteratively, although there's probably a better way...
    // We will also assume that the vehicle will coast (i.e. it will not accellerate using its rocket engine) within the evacuated tube.
    let t = 0
    let tStep = .1 // second
    let RV

    // ToDo: Need a better calculation of the optimal height of the evacuated tube's exit in case it can't reach the altitude of the ring.
    let evacuatedTubeExitR = this.planetRadius + launcherEvacuatedTubeExitAltitude
    if (apogeeDistance>0) {
      // Eliptical orbit - check if the apogee is higher than the altitude of the ring
      // ToDo: Need a better calculation of the optimal height of the evacuated tube's exit in case it can't reach the altitude of the ring.
      const maxOrbitalR = tram.lerp(this.planetRadius + launcherRampExitAltitude, apogeeDistance, 0.8) // No point in going all the way to apogee as this would cause the flight to level out to horizontal.
      evacuatedTubeExitR = Math.min(maxOrbitalR, evacuatedTubeExitR)
    }
    
    let timeOut
    let evacuatedTubeDownrangeAngle
    if (R0_2D.length() < evacuatedTubeExitR) {
      for (t = 0, timeOut = 0; (Math.abs(tStep)>0.01) && (t<launcherCoastTime) && (timeOut<10000); t+=tStep, timeOut++) {
        RV = this.RV_from_R0V0andt(R0_2D, V0_2D, t)
        if ((RV.R.length() < evacuatedTubeExitR) ^ (tStep>0)) {
          tStep = -tStep/2
        }
      }
      if (timeOut>=10000) {
        console.log('timeOut', timeOut)
      }
      evacuatedTubeDownrangeAngle = Math.atan2(RV.R.y, RV.R.x)  // This is the angle subtending the end of the ramp, center of the planet, and the end of the evacuated tube
    }
    else {
      t = 0
      evacuatedTubeDownrangeAngle = 0
    }
    this.timeWithinEvacuatedTube = t
    if (t<0) {
      console.log('Error: t<0')
    }
    //console.log('done')


    // ******************************************************************************************************************************
    // Next we need to place the start and end of the elevated evacuated tube at locations that are directly under the ring, 
    // so that it can be suspended underneath teh tethered ring.
    // ******************************************************************************************************************************

    // Convert the angle relative to the center of the Earth to an angle relative to the center of the ring 

    // The evacuated tube entrance and evacuated tube exit are both directly under points on the ring.
    // Calculate half of the straight-line distance between those two points. 
    const straightLineHalfDistance = Math.sin(evacuatedTubeDownrangeAngle/2) * (this.planetRadius + crv.currentMainRingAltitude)
    // Now convert that distance into an angle around the ring and multiply the angle by two.
    const evacuatedTubeRingAngle = Math.asin(Math.min(0.5, straightLineHalfDistance / crv.mainRingRadius)) * 2

    // Next find the poisition on the ring's curve that's directly above the evacuated tube's exit position (note: assumes the ring is a perfect circle)
    let evacuatedTubeExitPosition
    if (dParamWithUnits['launcherLocationMode'].value==0) {
      const evacuatedTubeExitPositionAroundRing = (1 + evacuatedTubeEntrancePositionAroundRing - evacuatedTubeRingAngle / (2*Math.PI)) % 1
      if (isNaN(evacuatedTubeExitPositionAroundRing)) {
        console.log('Nan Error')
      }
      const evacuatedTubeExitPositionInRingRefCoordSys = mainRingCurve.getPoint(evacuatedTubeExitPositionAroundRing)
      // Adjust the altitude of the positions to place it the correct distance above the planet's surface
      evacuatedTubeExitPositionInRingRefCoordSys.multiplyScalar((this.planetRadius + launcherEvacuatedTubeExitAltitude) / (this.planetRadius + launcherEvacuatedTubeExitAltitude))
      // Convert these positions into the planet's coordinate system 
      evacuatedTubeExitPosition = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(evacuatedTubeExitPositionInRingRefCoordSys.clone()))
    }
    else if (dParamWithUnits['launcherLocationMode'].value==1) {
      // ToDo: Using a hardcoded value of 1000 m here is a bit hacky. Improve.
      evacuatedTubeExitPosition = evacuatedTubeEntrancePosition.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 100000/this.planetRadius)
    }
    else {
      console.error('Invalid launcherLocationMode')
    }

    // Generate an axis of rotation to define the curvatures of the mass driver and the ramp
    this.axisOfRotation = new THREE.Vector3().crossVectors(evacuatedTubeEntrancePosition, evacuatedTubeExitPosition.clone().sub(evacuatedTubeEntrancePosition)).normalize()
    if (dParamWithUnits['launcherLocationMode'].value==0) {
      if (dParamWithUnits['finalLocationRingCenterLatitude'].value<0) {
        this.axisOfRotation.negate()
      }
    }

    // Calculate a vector that points to the exit of the mass driver (and the entrance to the ramp)
    const altAdjust = (this.planetRadius + launcherMassDriverAltitude)/(this.planetRadius + launcherRampExitAltitude)
    const massDriver2ExitPosition = evacuatedTubeEntrancePosition.clone().multiplyScalar(altAdjust).applyAxisAngle(this.axisOfRotation, angleBAC)
    //massDriver2ExitPosition.multiplyScalar((this.planetRadius + launcherMassDriverAltitude) / (this.planetRadius + launcherRampExitAltitude))

    const massDriver1ExitPosition = massDriver2ExitPosition.clone().applyAxisAngle(this.axisOfRotation, -launcherMassDriver2Length / (this.planetRadius + launcherMassDriverAltitude))
    const feederRailExitPosition = massDriver1ExitPosition.clone().applyAxisAngle(this.axisOfRotation, -launcherMassDriver1Length / (this.planetRadius + launcherMassDriverAltitude))
    const feederRailEntrancePosition = feederRailExitPosition.clone().applyAxisAngle(this.axisOfRotation, -launcherFeederRailLength / (this.planetRadius + launcherMassDriverAltitude))
    this.feederRailEntrancePosition = feederRailEntrancePosition
    const feederRailEntranceCoordinates = tram.ecefToGeodetic(feederRailEntrancePosition.x, feederRailEntrancePosition.y, feederRailEntrancePosition.z, planetSpec.ellipsoid)
    //console.log('feederRailEntranceCoordinates', feederRailEntranceCoordinates)
    const feederRailEntranceOffsets = {
      latitude: feederRailEntranceCoordinates.lat-dParamWithUnits['launcherRampEndLatitude'].value,
      longitude: feederRailEntranceCoordinates.lon-dParamWithUnits['launcherRampEndLongitude'].value,
      altitude: feederRailEntranceCoordinates.alt-launcherMassDriverAltitude}
    //console.log('feederRailEntranceOffsets', feederRailEntranceOffsets)

    // Position markers at the end of the mass driver and at entrance and exit positions of the evacuated tube
    this.launchTrajectoryMarker0.position.copy(feederRailEntrancePosition)
    this.launchTrajectoryMarker0.position.copy(feederRailExitPosition)
    this.launchTrajectoryMarker1.position.copy(massDriver1ExitPosition)
    this.launchTrajectoryMarker2.position.copy(massDriver2ExitPosition)
    this.launchTrajectoryMarker3.position.copy(evacuatedTubeEntrancePosition)
    this.launchTrajectoryMarker4.position.copy(evacuatedTubeExitPosition)

    const rampEngineeringParameters = LauncherRamp.EngineerRamp(massDriver2ExitPosition, allowableUpwardTurningRadius, this.axisOfRotation, angleACB)

    this.launchTrajectoryMarker5.position.copy(rampEngineeringParameters.rampCircleCenter)

    // We have the info that defines the physical shape of the mass driver and ramp curves, but we need to get
    // some more information about the vehicle's speed and distance versus time while on these curves...
    // In support of the curve for the ramp, we need to create a lookup table that converts time to
    // speed and distance travelled. Assuming a frictionless ramp with a circular profile, we can calculate
    // the vehicle's speed and position as a function of time and initial velocity.

    const launchVehicleRampAcceleration = 0 
    let launchVehicleRampConversionCurvePoints, launchVehicleTimeWithinRamp
    [launchVehicleRampConversionCurvePoints, launchVehicleTimeWithinRamp] = new LauncherRamp.CalculateSpeedAndPositionVersusTime(
      launcherMassDriverExitVelocity,
      launcherMassDriverAltitude,
      this.planetRadius,
      planetSpec,
      allowableUpwardTurningRadius,
      angleACB,
      launchVehicleRampAcceleration)
    this.launchVehicleTimeWithinRamp = launchVehicleTimeWithinRamp

    let launchVehicleRamptToiConvertor, launchVehicleRamptTodConvertor, launchVehicleRamptTosConvertor
    [launchVehicleRamptToiConvertor, launchVehicleRamptTodConvertor, launchVehicleRamptTosConvertor] = new LauncherRamp.CreateConversionFunctions(launchVehicleRampConversionCurvePoints, launchVehicleTimeWithinRamp)
    const launchRampExitVelocity = launchVehicleRamptTosConvertor(launchVehicleTimeWithinRamp)

    // We would like to decelerate the adaptive nut and bring it to a stop while it's on the ramp.
    // Afterwards it should be able to slide backwards down the ramp and then coast back to the start of the launcher.

    //const adaptiveNutRampAcceleration = dParamWithUnits['adaptiveNutRampAcceleration'].value 
    const rampLength = allowableUpwardTurningRadius * angleACB
    // Adding a fudge factor of 0.9 to force the adaptive nut to continue past the end of the ramp to avoid an unhandled edge case
    const adaptiveNutRampAcceleration = -(launcherMassDriverExitVelocity**2)/2/rampLength*1 // v^2=2ax, therefore a=v^2/(2x) 
    //console.log('adaptiveNutRampAcceleration', adaptiveNutRampAcceleration)
    let adaptiveNutRampConversionCurvePoints, adaptiveNutTimeWithinRamp
    [adaptiveNutRampConversionCurvePoints, adaptiveNutTimeWithinRamp] = new LauncherRamp.CalculateSpeedAndPositionVersusTime(
      launcherMassDriverExitVelocity,
      launcherMassDriverAltitude,
      this.planetRadius,
      planetSpec,
      allowableUpwardTurningRadius,
      angleACB,
      adaptiveNutRampAcceleration)
    this.adaptiveNutTimeWithinRamp = adaptiveNutTimeWithinRamp

    let adaptiveNutRamptToiConvertor, adaptiveNutRamptTodConvertor, adaptiveNutRamptTosConvertor
    [adaptiveNutRamptToiConvertor, adaptiveNutRamptTodConvertor, adaptiveNutRamptTosConvertor] = new LauncherRamp.CreateConversionFunctions(adaptiveNutRampConversionCurvePoints, adaptiveNutTimeWithinRamp)

    // Next design the downward arcing part of the sled's return path

    const allowableDownwardTurningRadius = launchRampExitVelocity**2 / (launcherSledDownwardAcceleration - accelerationOfGravity)
    // For the downward arcing part of the sled's return path we need the rampEndPoint from above and
    // a circle center point that's allowableDownwardTurningRadius further away from the center of the ramp's curve.
    const sledReturnCircleStartPoint = rampEngineeringParameters.rampEndPoint
    const sledReturnScaleFactor = (allowableUpwardTurningRadius + allowableDownwardTurningRadius) / allowableUpwardTurningRadius
    const sledReturnCircleCenter = rampEngineeringParameters.rampCircleCenter.clone().add(rampEngineeringParameters.rampCircleVectorRotated.clone().multiplyScalar(sledReturnScaleFactor))
    const sledReturnCircleLength = Math.PI * 2 * 0.125 * allowableDownwardTurningRadius // The 0.125 fator is just an rough estimate - we'll need to calculated it later.
    this.curveDownTime = sledReturnCircleLength / launchRampExitVelocity // ToDo: This is inaccurate as it does not take into account the increase in speed due to coasting down the ramp.

    this.launchTrajectoryMarker6.position.copy(sledReturnCircleCenter)

    // ***************************************************************
    // Next we need to capture some curves and data sets for plotting
    // ***************************************************************

    const freeFlightPositionCurveControlPoints = []
    const freeFlightConversionCurveControlPoints = []
    const freeFlightOrientationCurveControlPoints = []
    const freeFlightTelemetryCurveControlPoints = []
    this.evacuatedTubeCurveControlPoints = [] // We need to need to keep these to animate the deployment of the elevated evacuated tube

    const altitudeVesusTimeData = []
    const airPressurVesusTimeData = []
    const airSpeedVersusTimeData = []
    const downrangeDistanceVersusTimeData = []
    const forwardAccelerationVersusTimeData = []
    const upwardAccelerationVersusTimeData = []
    const aerodynamicDragVersusTimeData = []
    const fuelMassFlowRateVersusTimeData = []
    const totalMassVersusTimeData = []
    const apogeeAltitudeVersusTimeData = []
    const perigeeAltitudeVersusTimeData = []
    const convectiveHeatingVersusTimeData = []
    const radiativeHeatingVersusTimeData = []

    const t0 = 0
    const t1 = t0 + this.timeWithinFeederRail
    const t2 = t1 + this.timeWithinMassDriver1
    const t3 = t2 + this.timeWithinMassDriver2
    const t4 = t3 + this.launchVehicleTimeWithinRamp
    const t5a = t4 + this.timeWithinEvacuatedTube
    const t5b = t4 + this.curveDownTime
    const t6a = t5a + launcherCoastTime

    let vehiclePosition
    let vehicleSpeed
    let vehicleAirSpeed
    let distanceTravelled
    let altitude
    let airPressureInPascals
    const airPressureAtSeaLevel = planetSpec.airPressureAtAltitude(0)

    // Prep the vehicle's initial conditions
    const mVehicle = dParamWithUnits['launchVehicleEmptyMass'].value
    const mPayload = dParamWithUnits['launchVehiclePayloadMass'].value
    const initialPropellantMass = dParamWithUnits['launchVehiclePropellantMass'].value
    //console.log('initialPropellantMass', initialPropellantMass)
    let mPropellant = initialPropellantMass
    let m0 = mVehicle + mPayload + mPropellant // mass of vehicle, payload, and propellant

    t = 0
    tStep = 1 // second

    // ***************************************************************
    // Create the part of the trajectory where the vehicles are on a feeder rail waiting to be launched
    // ***************************************************************
    const planetCenter = new THREE.Vector3(0, 0, 0)
    if (!this.feederRailCurve) {
      this.feederRailCurve = new CircleSuperCurve3(planetCenter, this.axisOfRotation, feederRailExitPosition, -launcherFeederRailLength, false)
    }
    else {
      this.feederRailCurve.update(planetCenter, this.axisOfRotation, feederRailExitPosition, -launcherFeederRailLength, false)
    }

    const feederRailCurvetToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      return t
    }
    const feederRailCurvetTodConvertor = function (t) {
      const tt = feederRailCurvetToiConvertor(t)
      return launcherMassDriver1InitialVelocity * tt
    }
    const feederRailCurvetTosConvertor = function (t) {
      // Time to speed conversion
      return launcherMassDriver1InitialVelocity
    }
    this.feederRailCurve.addtToiConvertor(feederRailCurvetToiConvertor)
    this.feederRailCurve.addtTodConvertor(feederRailCurvetTodConvertor)
    this.feederRailCurve.addtTosConvertor(feederRailCurvetTosConvertor)
    this.feederRailCurve.setDuration(this.timeWithinFeederRail)
    this.feederRailCurve.name = "feederRailCurve"

    // Start the launch trajectory curve at the beginning of the mass driver.
    //console.log('Creating mass driver part of trajectory.')
    upwardAcceleration = 0   // This does not include the acceleration of gravity from the planet
    altitude = launcherMassDriverAltitude
    airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)

    // The curves use are Earth-Centered-Earth-Fixed (ECEF) speeds and distances, not inertial frame speeds and distances
    for (t = t0; t < t1; t += tStep) {
      vehicleAirSpeed = this.feederRailCurve.tTos(t - t0)
      distanceTravelled = this.feederRailCurve.tTod(t - t0)
      const vehiclePosition = this.feederRailCurve.getPointAt(distanceTravelled/launcherFeederRailLength)
      if (t==0) {
        // This is used in main.js to warp the camera over to the location where the mass driver starts
        this.startOfMassDriver1Position = vehiclePosition.clone()
      }
      if (t<=launcherXyChartMaxT) {
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressurVesusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, distanceTravelled/100000, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        // totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        // convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qconv, 0))
        // radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qrad, 0))
      }
    }
    //console.log('done')

    // ***************************************************************
    // Create the part of the trajectory where the vehicle is within a traditional electromagnetic mass driver near the planet's surface
    // ***************************************************************
    if (!this.massDriver1Curve) {
      this.massDriver1Curve = new CircleSuperCurve3(planetCenter, this.axisOfRotation, massDriver1ExitPosition, -launcherMassDriver1Length, false)
    }
    else {
      this.massDriver1Curve.update(planetCenter, this.axisOfRotation, massDriver1ExitPosition, -launcherMassDriver1Length, false)
    }

    const massDriver1tToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      return t
    }
    const massDriver1tTosConvertor = function (t) {
      const tt = massDriver1tToiConvertor(t)
      return launcherMassDriver1InitialVelocity + launcherMassDriverForwardAcceleration * tt
    }
    const massDriver1tTodConvertor = function (t) {
      const tt = massDriver1tToiConvertor(t)
      return launcherMassDriver1InitialVelocity * tt + 0.5 * launcherMassDriverForwardAcceleration * tt * tt  // v0*t + 1/2 at^2
    }
    this.massDriver1Curve.addtToiConvertor(massDriver1tToiConvertor)
    this.massDriver1Curve.addtTosConvertor(massDriver1tTosConvertor)
    this.massDriver1Curve.addtTodConvertor(massDriver1tTodConvertor)
    this.massDriver1Curve.setDuration(this.timeWithinMassDriver1)
    this.massDriver1Curve.name = "massDriver1Curve"

    // Start the launch trajectory curve at the beginning of the mass driver.
    //console.log('Creating mass driver part of trajectory.')
    upwardAcceleration = 0   // This does not include the acceleration of gravity from the planet
    altitude = launcherMassDriverAltitude
    airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)

    for (t = t1; t < t2; t += tStep) {
      // These are curve speeds and distances, not absolute speeds and distances
      vehicleAirSpeed = this.massDriver1Curve.tTos(t - t1)
      distanceTravelled = this.massDriver1Curve.tTod(t - t1)
      const vehiclePosition = this.massDriver1Curve.getPointAt(distanceTravelled/launcherMassDriver1Length)
      if (t<=launcherXyChartMaxT) {
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressurVesusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, distanceTravelled/100000, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        // convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qconv, 0))
        // radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qrad, 0))
      }
    }
    //console.log('done')

    // ***************************************************************
    // Create the part of the trajectory where the vehicle is within the twin-screw mass driver near the planet's surface
    // ***************************************************************
    if (!this.massDriver2Curve) {
      this.massDriver2Curve = new CircleSuperCurve3(planetCenter, this.axisOfRotation, massDriver2ExitPosition, -launcherMassDriver2Length, false)
    }
    else {
      this.massDriver2Curve.update(planetCenter, this.axisOfRotation, massDriver2ExitPosition, -launcherMassDriver2Length, false)
    }

    const massDriver2tToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      return t
    }
    const massDriver2tTosConvertor = function (t) {
      const tt = massDriver2tToiConvertor(t)
      return launcherMassDriver2InitialVelocity + launcherMassDriverForwardAcceleration * tt  // 1/2 at^2
    }
    this.massDriver2Curve.addtTosConvertor(massDriver2tTosConvertor)
    const massDriver2tTodConvertor = function (t) {
      const tt = massDriver2tToiConvertor(t)
      return launcherMassDriver2InitialVelocity * tt + 0.5 * launcherMassDriverForwardAcceleration * tt * tt  // v0*t + 1/2 at^2
    }
    this.massDriver2Curve.addtToiConvertor(massDriver2tToiConvertor)
    this.massDriver2Curve.addtTodConvertor(massDriver2tTodConvertor)
    this.massDriver2Curve.addtTosConvertor(massDriver2tTosConvertor)
    this.massDriver2Curve.setDuration(this.timeWithinMassDriver2)
    this.massDriver2Curve.name = "massDriver2Curve"

    // Start the launch trajectory curve at the beginning of the mass driver.
    //console.log('Creating mass driver part of trajectory.')
    upwardAcceleration = 0   // This does not include the acceleration of gravity from the planet
    altitude = launcherMassDriverAltitude
    airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)

    for (t = t2; t < t3; t += tStep) {
      // These are curve speeds and distances, not absolute speeds and distances
      vehicleAirSpeed = this.massDriver2Curve.tTos(t - t2, launcherMassDriver2InitialVelocity, forwardAcceleration)
      distanceTravelled = this.massDriver2Curve.tTod(t - t2, launcherMassDriver2InitialVelocity, forwardAcceleration)
      const vehiclePosition = this.massDriver2Curve.getPointAt(distanceTravelled/launcherMassDriver2Length)
      if (t<=launcherXyChartMaxT) {
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressurVesusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, distanceTravelled/100000, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        // convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qconv, 0))
        // radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qrad, 0))
      }
    }
    //console.log('done')

    // ***************************************************************
    // Create the part of the trajectory where the vehicle is traveling along the upward curving ramp
    // ***************************************************************
    this.launchRampCurve = [null, null]
    for (let launchRampCurveIndex = 0; launchRampCurveIndex < 2; launchRampCurveIndex++) {
      if (!this.launchRampCurve[launchRampCurveIndex]) {
        this.launchRampCurve[launchRampCurveIndex] = new CircleSuperCurve3(rampEngineeringParameters.rampCircleCenter.clone(), this.axisOfRotation.clone().negate(), massDriver2ExitPosition.clone(), this.launcherRampLength, true)
      }
      else {
        this.launchRampCurve[launchRampCurveIndex].update(rampEngineeringParameters.rampCircleCenter.clone(), this.axisOfRotation.clone().negate(), massDriver2ExitPosition.clone(), this.launcherRampLength, true)
      }
      this.launchRampCurve[launchRampCurveIndex].addtToiConvertor((launchRampCurveIndex) ? launchVehicleRamptToiConvertor : adaptiveNutRamptToiConvertor)
      this.launchRampCurve[launchRampCurveIndex].addtTodConvertor((launchRampCurveIndex) ? launchVehicleRamptTodConvertor : adaptiveNutRamptTodConvertor)
      this.launchRampCurve[launchRampCurveIndex].addtTosConvertor((launchRampCurveIndex) ? launchVehicleRamptTosConvertor : adaptiveNutRamptTosConvertor)
      this.launchRampCurve[launchRampCurveIndex].setDuration((launchRampCurveIndex) ? this.launchVehicleTimeWithinRamp : this.adaptiveNutTimeWithinRamp)
      this.launchRampCurve[launchRampCurveIndex].name = "launchRampCurve" + launchRampCurveIndex
    }

    // Test the convertors...
    // angle = 0
    // lastAngle = 0
    // distance = 0
    // kineticEnergy = initialKineticEnergy
    // potentialEnergy = initialPotentialEnergy
    // for (let t = 0; lastAngle<angleACB; t+=deltaT) {
    //   const lutSpeed = launchVehicleRamptTosConvertor(t)
    //   const lutDistance = launchVehicleRamptTodConvertor(t)
    //   console.print(t, speed, lutSpeed, distance, lutDistance)
    //   // Change in angular position...
    //   const deltaAngle = speed * deltaT / allowableUpwardTurningRadius
    //   lastAngle = angle
    //   angle += deltaAngle
    //   distance = allowableUpwardTurningRadius * angle
    //   const newR = this.planetRadius + launcherMassDriverAltitude + allowableUpwardTurningRadius * (1 - Math.cos(angle))
    //   const newPotentialEnergy = -planetSpec.gravitationalParameter * m0 / newR
    //   const deltaPE = newPotentialEnergy - potentialEnergy
    //   // This change in potential energy results in a corresponding loss of kinetic energy... 
    //   const deltaKE = -deltaPE
    //   const newKineticEnergy = kineticEnergy + deltaKE
    //   speed = Math.sqrt(2 * newKineticEnergy / m0)
    //   potentialEnergy = newPotentialEnergy
    //   kineticEnergy = newKineticEnergy
    // }

    forwardAcceleration = 0
    upwardAcceleration = launcherRampUpwardAcceleration
    this.peakUpwardAcceleration = upwardAcceleration

    //console.log('Creating upward curving ramp part of trajectory.')
    // ToDo: t5b is the time when the vehicle reaches the end of the evacuated tube. Need a new t? for when teh launch sled reaches the sledReturnCircle
    console.assert(t4<10000)
    for (t = t3; t<Math.min(t4, 10000); t+=tStep) {   // Hack - Min function added to prevent endless loop in case of bug
      vehicleAirSpeed = this.launchRampCurve[1].tTos(t - t3)
      distanceTravelled = this.launchRampCurve[1].tTod(t - t3)
      vehiclePosition = this.launchRampCurve[1].getPointAt(distanceTravelled / this.launcherRampLength)
      altitude = vehiclePosition.length() - this.planetRadius
      airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)
      const downrangeAngle = massDriver2ExitPosition.angleTo(vehiclePosition)
      const downrangeDistance = launcherMassDriver1Length + launcherMassDriver2Length + downrangeAngle * (this.planetRadius + launcherMassDriverAltitude)
      if (t<=launcherXyChartMaxT) {
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressurVesusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, upwardAcceleration, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        // convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qconv, 0))
        // radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qrad, 0))
      }
    }
    //console.log('done')

    //this.launchTrajectoryMarker2.position.copy(rampEngineeringParameters.rampEndPoint)
    const downrangeAngle = massDriver2ExitPosition.angleTo(rampEngineeringParameters.rampEndPoint)
    const downrangeDistanceTravelledOnRamp = downrangeAngle * this.planetRadius
    distanceTravelled += angleACB * allowableUpwardTurningRadius

    // ***************************************************************
    // Create a downward arching curve for the launch sled to travel on after the vehicle detaches.
    // ***************************************************************
    if (!this.launchSledReturnCurve) {
      this.launchSledReturnCurve = new CircleSuperCurve3(sledReturnCircleCenter.clone(), this.axisOfRotation.clone(), sledReturnCircleStartPoint.clone(), sledReturnCircleLength, false)
    }
    else {
      this.launchSledReturnCurve.update(sledReturnCircleCenter.clone(), this.axisOfRotation.clone(), sledReturnCircleStartPoint.clone(), sledReturnCircleLength, false)
    }
    const launchSledReturntToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      return t  // ToDo - Incorrect - need to fix
    }
    const launchSledReturntTosConvertor = function (t) {
      // We're ignoring the effect of planet's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      return launchRampExitVelocity
    }
    this.launchSledReturnCurve.addtTosConvertor(launchSledReturntTosConvertor)
    const launchSledReturntTodConvertor = function (t) {
      // We're ignoring the effect of planet's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      return launchRampExitVelocity * launchSledReturntToiConvertor(t)
    }
    this.launchSledReturnCurve.addtToiConvertor(launchSledReturntToiConvertor)
    this.launchSledReturnCurve.addtTodConvertor(launchSledReturntTodConvertor)
    this.launchSledReturnCurve.setDuration(this.curveDownTime)
    this.launchSledReturnCurve.name = "launchSledReturnCurve"

    forwardAcceleration = 0
    upwardAcceleration = launcherRampUpwardAcceleration

    //console.log('Creating downward arching sled return part of trajectory.')
    console.assert(t5b<10000)
    for (t = t4; t<Math.min(t5b, 10000); t+=tStep) {   // Hack - Min function added to prevent endless loop in case of bug
      vehicleAirSpeed = this.launchRampCurve[1].tTos(t - t4)
      distanceTravelled = this.launchRampCurve[1].tTod(t - t4)
      vehiclePosition = this.launchRampCurve[1].getPointAt(distanceTravelled / sledReturnCircleLength)
      altitude = vehiclePosition.length() - this.planetRadius
      airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)
      // Just to be explicate that we're not including downward arching part of the sled's return path in the launch trajectory curve and telemetry for the xychart
      // const downrangeAngle = massDriver2ExitPosition.angleTo(vehiclePosition)
      // const downrangeDistance = launcherMassDriver1Length + launcherMassDriver2Length + downrangeAngle * (this.planetRadius + launcherMassDriverAltitude)
      //if (t<=launcherXyChartMaxT) {
      // altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
      // airPressurVesusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
      // downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
      // airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
      // forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
      // upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, upwardAcceleration, 0))
      // aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
      // fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
      // totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
      //}
    }
    //console.log('done')

    // ***************************************************************
    // Create the part of the trajectory where the vehicle coasts on an elliptical or hyperbolic trajectory within the evacuated tube
    // ***************************************************************
    this.launcherSuspendedEvacuatedTubeLength = 0

    // const R0 = evacuatedTubeEntrancePosition.clone()
    const R0 = this.launchRampCurve[1].getPointAt(1)
    const velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0).cross(R0)
    const V0 = this.launchRampCurve[1].getTangentAt(1).multiplyScalar(launchRampExitVelocity)
    const V0PlusPlanetRotation = V0.clone().add(velocityDueToPlanetsRotation)
    //console.log('Launch Velocity', V0, 'Velocity Due To Planet\'s Rotation', velocityDueToPlanetsRotation, 'Sum', V0PlusPlanetRotation)
    
    // Hack!!!!
    // Test the math with no ramp to see if its calculating the C3 value correctly
    // const R0 = this.massDriver2Curve.getPointAt(1)
    // const velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0).cross(R0)
    // const V0 = this.massDriver2Curve.getTangentAt(1).multiplyScalar(launcherMassDriverExitVelocity)
    // const V0PlusPlanetRotation = V0.clone().add(velocityDueToPlanetsRotation)

    console.log('Launch Velocity', V0.length(), 'Velocity Due To Planet\'s Rotation', velocityDueToPlanetsRotation.length(), 'Sum', V0PlusPlanetRotation.length())


    const printOrbitalElements = verbose && true
    const coe = this.orbitalElementsFromStateVector(R0, V0PlusPlanetRotation)

    // Test code
    const launchVehiclePerigeeSpeed = V0PlusPlanetRotation.length()
    const g_earth = planetSpec.gravitationalParameter
    const r_earth = this.planetRadius
    const semimajorAxis = g_earth / (launchVehiclePerigeeSpeed**2 - g_earth * 2 / (r_earth+launcherMassDriverAltitude))
    console.log('g_earth', g_earth, 'r_earth', r_earth)
    console.log('semimajorAxis', semimajorAxis)
    // End test code

    const initial_c = coe.semimajorAxis * coe.eccentricity
    let initialApogeeDistance
    let initialPerigeeDistance
    if (coe.eccentricity>1) {
      // Hyperbolic orbit
    }
    else if (coe.eccentricity==1) {
      // Parabolic orbit
    }
    else if (coe.eccentricity<1) {
      // Elliptical orbit
      initialApogeeDistance = coe.semimajorAxis + initial_c
      initialPerigeeDistance = coe.semimajorAxis - initial_c
      this.initialApogeeDistance = initialApogeeDistance
    }

    if (printOrbitalElements) {
      const speedAtApogee = Math.sqrt(this.mu * (2 / initialApogeeDistance - 1 / coe.semimajorAxis))
      const speedOfCircularizedOrbit = Math.sqrt(this.mu / initialApogeeDistance)
      const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
      const m0Overmf = Math.exp(deltaVNeededToCircularizeOrbit / launchVehicleSeaLevelRocketExhaustVelocity)
      const C3 = this.mu / Math.abs(coe.semimajorAxis)
      console.log(coe)
      console.log('velocityDueToPlanetsRotation', velocityDueToPlanetsRotation)
      console.log('speedAtApogee', speedAtApogee)
      console.log('apogeeAltitude', initialApogeeDistance - this.planetRadius)
      console.log('DeltaV Needed To Circularize Orbit', deltaVNeededToCircularizeOrbit)
      console.log('Circularization m0Overmf', m0Overmf)
      console.log('C3', C3/1e6, 'km^2/s^2')
    }
    
    //V0 = new THREE.Vector3(launchRampExitVelocity * Math.sin(this.upwardAngleAtEndOfRamp), launchRampExitVelocity * Math.cos(this.upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher
    const totalSplinePoints = Math.floor((t6a-t4)/tStep) // Place spline points at roughly tStep intervals along the launch path (warning - this is not exact)

    let evacuatedTubetToiConvertor = null
    let evacuatedTubetTodConvertor = null
    let evacuatedTubetTosConvertor = null
    let lastVehiclePositionRelativeToPlanet = R0.clone()
    let numEvacuatedTubeSplinePoints

    if (t5a-t4>0) {
      const evacuatedTubeConversionCurvePoints = []
      numEvacuatedTubeSplinePoints = Math.max(4, Math.floor(totalSplinePoints * (t5a-t4) / (t6a-t4)))
      const tStep1 = (t5a - t4) / (numEvacuatedTubeSplinePoints-1)

      for (let i = 0; i<numEvacuatedTubeSplinePoints; i++ ) {
        const t = t4 + i * tStep1
        const t6a = i * tStep1  // t6a is the time from the end of the ramp
        RV = this.RV_from_R0V0andt(R0, V0PlusPlanetRotation, t6a)
        const downrangeAngle = Math.atan2(RV.R.y, RV.R.x)
        // Calculate the vehicle's position relative to where R0 and V0PlusPlanetRotation were when the vehicle was at R0.
        const vehiclePosition = RV.R.clone()
        const vehicleVelocity = RV.V.clone()
        const velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0).cross(vehiclePosition)
        const vehicleVelocityRelativeToAir = vehicleVelocity.clone().sub(velocityDueToPlanetsRotation)
        vehicleSpeed = RV.V.length() // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
        vehicleAirSpeed = vehicleVelocityRelativeToAir.length()  // Yes, we're calculating this even though the evacuated tube is evacuated. Need it for tTos and so we can plot it on the xychart
        const vehiclePositionRelativeToPlanet = vehiclePosition.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -2*Math.PI*t6a/planetSpec.lengthOfSiderealDay)
        altitude = RV.R.length() - this.planetRadius
        airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)

        const aerodynamicDrag = 0
        // const airDensity = 0
        // const qconv = 0
        // const qrad = 0

        const deltaDistanceTravelled = lastVehiclePositionRelativeToPlanet.distanceTo(vehiclePositionRelativeToPlanet) // ToDo: Would be better to find the equation for distance traveled along a hyperbolic path versus time.
        this.launcherSuspendedEvacuatedTubeLength += deltaDistanceTravelled

        const downrangeDistance = launcherMassDriver1Length + launcherMassDriver2Length + rampBaseLength + downrangeAngle * (this.planetRadius + launcherMassDriverAltitude)
        if (isNaN(vehicleAirSpeed) || isNaN(this.launcherSuspendedEvacuatedTubeLength) || isNaN(vehiclePositionRelativeToPlanet.x) || isNaN(vehiclePositionRelativeToPlanet.y) || isNaN(vehiclePositionRelativeToPlanet.z)) {
          console.log('Nan Error')
        }
        // Collect control points for curves
        evacuatedTubeConversionCurvePoints.push(new THREE.Vector3(vehicleAirSpeed, this.launcherSuspendedEvacuatedTubeLength, t6a))
        this.evacuatedTubeCurveControlPoints.push(vehiclePositionRelativeToPlanet)
        if (t<=launcherXyChartMaxT) {
          // Save telemery...
          altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
          airPressurVesusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
          downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
          airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
          forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
          upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
          aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
          fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
          totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
          if (coe.eccentricity<1) {
            apogeeAltitudeVersusTimeData.push(new THREE.Vector3(t, initialApogeeDistance - this.planetRadius, 0))
            perigeeAltitudeVersusTimeData.push(new THREE.Vector3(t, initialPerigeeDistance, 0))
          }
          // convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qconv, 0))
          // radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qrad, 0))
        }
        lastVehiclePositionRelativeToPlanet = vehiclePositionRelativeToPlanet
      }
      this.totalLengthOfLaunchSystem += this.launcherSuspendedEvacuatedTubeLength

      const evacuatedTubeConversionCurve = new THREE.CatmullRomCurve3(evacuatedTubeConversionCurvePoints)

      evacuatedTubetTosConvertor = function (t) {
        const tForLookup = t / ((evacuatedTubeConversionCurvePoints.length-1) * tStep1)
        try {
          const interpolatedPoint = evacuatedTubeConversionCurve.getPoint(tForLookup)
          const speed = interpolatedPoint.x
          return speed
        }
        catch (e) {
          console.log('tForLookup', tForLookup, 'evacuatedTubeConversionCurvePoints.length', evacuatedTubeConversionCurvePoints.length, 'tStep1', tStep1)
        }
      }

      evacuatedTubetToiConvertor = function (t) {
        // Time to "interpolation distance" conversion
        return t / ((evacuatedTubeConversionCurvePoints.length-1) * tStep1)
      }
      evacuatedTubetTodConvertor = function (t) {
        const iForLookup = evacuatedTubetToiConvertor(t)
        const interpolatedPoint = evacuatedTubeConversionCurve.getPoint(iForLookup)
        const distance = interpolatedPoint.y
        return distance
      }
    }
    else {
      numEvacuatedTubeSplinePoints = 0
    }

    // ***************************************************************
    // Create the part of the trajectory where the vehicle coasts on an eliptical or hyperbolic trajectory after it leaves the evacuated tube
    // ***************************************************************
    // We'll need to generate some parameters to help us calculate the aerodynamic drag on the vehicle while it's traveling through the rarified upper atmosphere 
    const launchVehicleRadius = dParamWithUnits['launchVehicleRadius'].value
    const launchVehicleBodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    const launchVehicleNoseconeLength = dParamWithUnits['launchVehicleNoseconeLength'].value
    const adaptiveThrust = dParamWithUnits['launchVehicleAdaptiveThrust'].value
    const maxFuelFlowRate = dParamWithUnits['launchVehiclePropellantMassFlowRate'].value
    const launcherMaxEyesInAcceleration = dParamWithUnits['launcherMaxEyesInAcceleration'].value
    const launcherMaxEyesOutAcceleration = dParamWithUnits['launcherMaxEyesOutAcceleration'].value

    let fuelFlowRate = maxFuelFlowRate
    let mTotal = mVehicle + mPayload + mPropellant
    const noseconeAngle = Math.atan2(launchVehicleRadius, launchVehicleNoseconeLength)
    const numFreeFlightSplinePoints = Math.max(4, totalSplinePoints - numEvacuatedTubeSplinePoints)
    const tStep2 = (t6a - t5a) / (numFreeFlightSplinePoints - 1)
    let accellerateToRaisePerigee = false
    let distanceTravelledOutsideLaunchSystem = 0
    let warningAlreadyGiven = false
    let warning2AlreadyGiven = false
    let peakFuelFlowRate = 0
    let thrustState = 2
    let apogeeError
    let orbitalSpeedError
    let accelerateControlSignal = false
    this.rocketTotalDeltaV = 0
    this.peakDecelleration = 0
    let abortFreeFlight = false

    //console.log('Creating hyperbolic part of trajectory.')
    for (let i = 0; (i<numFreeFlightSplinePoints) && !abortFreeFlight; i++ ) {
      t = t5a + i * tStep2
      const t6a = (t5a - t4) + i * tStep2  // t6a is the time from the end of the ramp
      if (adaptiveThrust && (i!==0)) {
        if (!isFinite(RV.R.length()) || !isFinite(RV.V.length())) {
          console.error('Error - RV is not finite')
        }
        RV = this.RV_from_R0V0andt(RV.R, RV.V, tStep2)
      }
      else {
        RV = this.RV_from_R0V0andt(R0, V0PlusPlanetRotation, t6a)
      }
      if (!isFinite(RV.R.length()) || !isFinite(RV.V.length())) {
        console.error('Error - RV is not finite')
      }
      const downrangeAngle = Math.atan2(RV.R.y, RV.R.x)
      // Calculate the vehicle's position relative to where R0 and V0PlusPlanetRotation were when the vehicle was at R0.
      const vehiclePosition = RV.R.clone()
      const vehicleVelocity = RV.V.clone()
      const velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0).cross(vehiclePosition)
      const vehicleVelocityRelativeToAir = vehicleVelocity.clone().sub(velocityDueToPlanetsRotation)
      vehicleSpeed = RV.V.length() // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
      altitude = RV.R.length() - this.planetRadius
      airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)
      vehicleAirSpeed = vehicleVelocityRelativeToAir.length()
      const vehiclePositionRelativeToPlanet = vehiclePosition.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -2*Math.PI*t6a/planetSpec.lengthOfSiderealDay)

      const deltaDistanceTravelled = lastVehiclePositionRelativeToPlanet.distanceTo(vehiclePositionRelativeToPlanet) // ToDo: Would be better to find the equation for distance traveled along an eclipse versus time.
      const downrangeDistance = launcherMassDriver1Length + launcherMassDriver2Length + rampBaseLength + downrangeAngle * (this.planetRadius + launcherMassDriverAltitude)
      distanceTravelledOutsideLaunchSystem += deltaDistanceTravelled

      if (isNaN(airPressureInPascals)) {
        console.error('NaN Error')
        const airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)
      }
      const airPressureInAtmospheres = airPressureInPascals / 101325
      const launchVehicleRocketExhaustVelocity = tram.lerp(launchVehicleVacuumRocketExhaustVelocity, launchVehicleSeaLevelRocketExhaustVelocity, airPressureInAtmospheres)
  
      const airDensity = planetSpec.airDensityAtAltitude(altitude)

      const aerodynamicDrag = this.getAerodynamicDrag(airDensity, vehicleAirSpeed, noseconeAngle, launchVehicleRadius, launchVehicleBodyLength)
      const qconv = vehicleAirSpeed**3 * (airDensity/launchVehicleEffectiveRadius)**0.5
      const qrad = vehicleAirSpeed**8 * airDensity**1.2 * launchVehicleEffectiveRadius**0.5

      const maxPossibleRocketThrust = maxFuelFlowRate * launchVehicleRocketExhaustVelocity
      const insignificantAerodynamicDrag = maxPossibleRocketThrust * 0.00001
      const maxPossibleThrustMinusDrag = maxPossibleRocketThrust - aerodynamicDrag
      const maxPossibleForwardAcceleration = maxPossibleThrustMinusDrag / mTotal
      
      let forwardAcceleration
      let vehicleOrientation

      if (adaptiveThrust) {
        // With "Constant Thrust" we calculate the fuel flow rate based on what will keep the vehicle from exceeding the maximum allowed forward acceleration
        // and what is needed to increase the orbital apogee to the desired altitude. At apogee, we will need to execute a circularization burn.
        const coe = this.orbitalElementsFromStateVector(RV.R, RV.V)
        const c = coe.semimajorAxis * coe.eccentricity
        if (coe.eccentricity>1) {
          // Hyperbolic orbit
          apogeeDistance = Infinity

        }
        else if (coe.eccentricity==1) {
          // Parabolic orbit
          apogeeDistance = Infinity
        }
        else if (coe.eccentricity<1) {
          // Elliptical orbit
          apogeeDistance = coe.semimajorAxis + c
          if (!isFinite(apogeeDistance)) {
            console.error('Error - apogeeDistance is not finite')
            abortFreeFlight = true
          }
          perigeeDistance = coe.semimajorAxis - c
          if (apogeeDistance<0) {
            console.error('Error')
          }
        }
        const targetOrbitDistance = this.planetRadius + launchVehicleDesiredOrbitalAltitude
        apogeeError = apogeeDistance - targetOrbitDistance
        const perigeeError = perigeeDistance - targetOrbitDistance
        const speedAtApogee = Math.sqrt(this.mu * (2 / apogeeDistance - 1 / coe.semimajorAxis))
        const speedOfCircularizedOrbit = Math.sqrt(this.mu / apogeeDistance)
        const apogeeAltitudeMargin = 10

        const targetedOrbitalSpeed = speedOfCircularizedOrbit + 1 // Add a little extra speed to account for the fact that we will shut off the rocket when we reach the speedOfCircularizedOrbit

        orbitalSpeedError = RV.V.length() - targetedOrbitalSpeed
        const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
        const perigeeOfDeorbitOrbit = this.planetRadius + 80000
        const apogeeOfDeorbitOrbit = targetOrbitDistance
        const semiMajorAxisOfDeorbitOrbit = (perigeeOfDeorbitOrbit + apogeeOfDeorbitOrbit) / 2
        const velocityAtApogeeOfDeorbitOrbit = Math.sqrt(this.mu * (2 / targetOrbitDistance - 1 / semiMajorAxisOfDeorbitOrbit))
        const deltaVNeededToDeorbit = speedOfCircularizedOrbit - velocityAtApogeeOfDeorbitOrbit

        // const massOfISS = 420000 // kg
        // const deorbitRocketExhaustVelocity = 3050 // m/s (Merlin Vacuum Engine)
        // const propellantNeededToDeorbit = massOfISS * (Math.exp(deltaVNeededToDeorbit / deorbitRocketExhaustVelocity) - 1)
        // console.log('deltaVNeededToDeorbit', deltaVNeededToDeorbit, 'propellantNeededToDeorbit', propellantNeededToDeorbit)

        const straightUpDirection = RV.R.clone().normalize()
        const velocityDirectionInECEFReferencFrame = vehicleVelocityRelativeToAir.normalize()
        const upwardComponentOfVelocity = RV.V.clone().dot(straightUpDirection)

        const circularOrbitDirection = RV.R.clone().cross(RV.V).cross(RV.R).normalize()
        const speedInOrbitalDirection = RV.V.clone().dot(circularOrbitDirection)
        const centripitalAcceleration = (speedInOrbitalDirection ** 2) / RV.R.length()
        const gravityAcceleration = planetSpec.gravitationalParameter / (RV.R.length() ** 2)
        const upwardsAcceleration = centripitalAcceleration - gravityAcceleration  // Will be negative if we're on a ballistic trajectory

        // ToDo: When we run out of propellant, we should decelerate the launchVehicle due to aerodnamic drag
        // ToDo: We really need to interpolate between steps here to more accurately determine when to adjust fuel flow rate.
        // ToDo: In practice the rocket will not be able to throttle down all the way to zero thrust. We need another way to account for this.
        // ToDo: Ideally we should introduce the idea of "MaxQ" where we throttle down the rocket to prevent the aerodynamic drag from creating excessive airframe strain.
        // ToDo: "The competition" would jettison the fairings to improve mass ratio.
        // ToDo: "The competition" would use at least two stages.
        // if (RV.R.length() > apogeeDistance - 10) {
        //   console.log('Apogee Reached')
        // }
        if (mPropellant>0) {
          switch(thrustState) {
          case 0:  // Veritical Ascent in the zenith direction
          case 1:  // Pitchover Maneuver
          case 2:  // Gravity Turn (accelerate or decelerate as needed to adjust apogee)
            const proportionalControlConstant1 = 300   // Not tuned up yet
            accelerateControlSignal = Math.max(-1, Math.min(1, apogeeError / targetOrbitDistance * -proportionalControlConstant1))
            // ToDo: Using this is a bit hacky, need a better state change rule here.
            //if (verbose>0) console.log('2:','ApErr (abs)',  apogeeError, 'ApErr (Frac)', apogeeDistance/targetOrbitDistance)
            if ((Math.abs(apogeeError)<apogeeAltitudeMargin) && (aerodynamicDrag < insignificantAerodynamicDrag)) {
              thrustState = 3
            }
            break
          case 3: // "Coast" to apogee, although the engine will thrust as much as is needed to compensate for aerodynamic drag 
            const averageDistance = (RV.R.length() + apogeeDistance) / 2
            const averageSpeed = (RV.V.length() + speedAtApogee) / 2
            const roughTimeToApogee = averageDistance * (Math.PI - coe.trueAnomaly) / averageSpeed
            const timeNeededToCircularizeOrbit = deltaVNeededToCircularizeOrbit / maxPossibleForwardAcceleration
            //if (verbose>0) console.log('roughTimeToApogee', roughTimeToApogee, 'timeNeededToCircularizeOrbit', timeNeededToCircularizeOrbit)
            // Hacky
            //if (verbose>0) console.log('3:','ApErr (abs)',  apogeeError, 'ApErr (Frac)', apogeeDistance/targetOrbitDistance)
            if (roughTimeToApogee>timeNeededToCircularizeOrbit) {
              // Wait until we drift closer to orbital apogee before we start burning again
              accelerateControlSignal = 0
            }
            else {
              thrustState = 4
              accelerateControlSignal = 1
            }
            break
          case 4: // Orbit Circularization (Raise Perigee)
            // Apogee and perigee might swap so we'll just accellerate until we're going the right speed
            const proportionalControlConstant2 = 60 // Not tuned up yet
            accelerateControlSignal  = Math.max(-1, Math.min(1, orbitalSpeedError / targetedOrbitalSpeed * -proportionalControlConstant2))
            //if (verbose>0) console.log('4:','ApErr (abs)',  apogeeError, 'ApErr (Frac)', apogeeDistance/targetOrbitDistance, 'Orbit V Err', orbitalSpeedError)
            if (RV.V.length()>=speedOfCircularizedOrbit) {
              thrustState = 5
            }
            break
          case 5: // Shut down controller and coast - hopefully in circular orbit
            break
          }

          // ToDo: Implement a deceleration burn if/when decellerateToLowerApogee is true to circularize the orbit
          // const decellerateToLowerApogee = (RV.R.length() < perigeeDistance + altitudeMargin) && (apogeeDistance > this.planetRadius + launchVehicleDesiredOrbitalAltitude)

          let forwardAccelerationLimit
          if (accelerateControlSignal>=0) {
            forwardAccelerationLimit = Math.min(maxPossibleForwardAcceleration, launcherMaxEyesInAcceleration)  // ToDo: We might want a separate parameter for this limit
          }
          else {
             forwardAccelerationLimit = -launcherMaxEyesOutAcceleration
          }
      
          const limitedThrustMinusDrag = forwardAccelerationLimit * mTotal * Math.abs(accelerateControlSignal)
          const limitedRocketThrust = Math.max(0, limitedThrustMinusDrag + aerodynamicDrag) // Limit to >= zero since the rocket can only generate positive forward thrust
          fuelFlowRate = Math.min(maxFuelFlowRate, limitedRocketThrust / launchVehicleRocketExhaustVelocity)   // m/s2 * kg / m/s = kg/s
          const minFuelFlowRate = 0 // ToDo - Facing some challenges getting this to work with a reasonable min fuel rate. Punting for now. // 0.02 * maxFuelFlowRate
          if (fuelFlowRate<minFuelFlowRate) {
            fuelFlowRate = 0
          }
          const rocketThrust = fuelFlowRate * launchVehicleRocketExhaustVelocity
          const thrustMinusDrag = rocketThrust - aerodynamicDrag
          forwardAcceleration = thrustMinusDrag / Math.max(1, mTotal)  // Some divide-by-zero protection in case the dry mass of the vehicle is set to zero

          // console.log(
          //   Math.round(apogeeError*1e6)/1e6, 
          //   Math.round(accelerateControlSignal*1e6)/1e6, 
          //   Math.round(forwardAcceleration*1e6)/1e6,
          //   t)

          // Some warnings and telemetry
          if ((maxPossibleForwardAcceleration<-launcherMaxEyesOutAcceleration) && !warning2AlreadyGiven) {
            if (verbose>0) console.log('Too much aerodynamic drag!')
            warning2AlreadyGiven = true
          }

        }
        else {
          fuelFlowRate = 0
          forwardAcceleration = -aerodynamicDrag / Math.max(1, mTotal)  // Some divide-by-zero protection in case the dry mass of the vehicle is set to zero
        }

        const upwardAccelerationPlusControlCorrection = upwardsAcceleration + (RV.R.length() - targetOrbitDistance) * 0
        //if (verbose>0) console.log('upAcc', upwardsAcceleration, upwardAccelerationPlusControlCorrection, 'up Vel', upwardComponentOfVelocity, 'AltErr', RV.R.length() - targetOrbitDistance, 'Ap Dist', apogeeDistance-targetOrbitDistance)
        const circularOrbitDirectionAcceleration = Math.sqrt(Math.max(0, forwardAcceleration ** 2 - upwardAccelerationPlusControlCorrection ** 2))

        this.peakDecelleration = Math.max(this.peakDecelleration, Math.round(-forwardAcceleration*10)/10)

        if (fuelFlowRate<0) {
          if (verbose>0) console.log('Negative fuel flow rate!')
        }

        // Convert the fuel flow into a incremntal delta-v for the rocket

        let tBurnClipped
        if (thrustState===4) {
          // We're circularizing the orbit so we need to cut the burn short early to avoid overshooting the target orbit
          const burnTimeNeededToCircularizeOrbit = deltaVNeededToCircularizeOrbit/forwardAcceleration
          //console.log('deltaVToCircOrbit', deltaVNeededToCircularizeOrbit, 'burnTimeNeeded', burnTimeNeededToCircularizeOrbit, RV.R.length() / (this.planetRadius+launchVehicleDesiredOrbitalAltitude), RV.V.length() / speedOfCircularizedOrbit)
          tBurnClipped = Math.min(tStep2, burnTimeNeededToCircularizeOrbit)
        }
        else {
          tBurnClipped = tStep2
        }
        const tBurn = (fuelFlowRate===0) ? 0 : Math.min(tBurnClipped, mPropellant / fuelFlowRate)

        const rocketIncrementalDeltaV = fuelFlowRate * launchVehicleRocketExhaustVelocity / mTotal * tBurn
        this.rocketTotalDeltaV += rocketIncrementalDeltaV

        // Orient the acceleration vactor to align with the orbital path
        if (isNaN(forwardAcceleration) || isNaN(tBurn)) {
          console.log('Error')
        }
        let deltaVFromAcceleration

        // Hacky...
        // Note: "vehicleOrientation" is defined here to mean "the direction we want to go", not the direction the rocket exhaust is traveling

        if (thrustState===0) {
          // Fly straight relative to the planet's surface
          if (upwardComponentOfVelocity<=0) {
            // Thrust away from the center of the earth
            vehicleOrientation = RV.R.clone().normalize()
          }
          else {
            vehicleOrientation = RV.V.clone() //velocityDirectionInECEFReferencFrame
          }
        }
        else if (thrustState===1) {
          // Do the pitchover maneuver (under construction)
          // Temporary hack
          if (upwardComponentOfVelocity<=0) {
            // Thrust away from the center of the earth
            vehicleOrientation = RV.R.clone().normalize()
          }
          else {
            vehicleOrientation = RV.V.clone() //velocityDirectionInECEFReferencFrame
          }
        }
        else if (thrustState===2) {
          if (upwardComponentOfVelocity<=0) {
            // If we're falling, thrust directly away from the center of the earth
            vehicleOrientation = RV.R.clone().normalize()
          }
          else {
            // Thrust in the velocity direction in the Earth Centered Inertial Reference Frame
            vehicleOrientation = RV.V.clone() //velocityDirectionInECEFReferencFrame
          }
        } 
        else if (thrustState===3) {
          vehicleOrientation = RV.V.clone().normalize()
        }
        else if (thrustState===4) {
          //console.log(coe.trueAnomaly, altitude/launchVehicleDesiredOrbitalAltitude)
          const circularOrbitDirection = RV.R.clone().cross(RV.V).cross(RV.R).normalize()
          // If still we're on the way up, thrust in the direction of the circular orbit
          // if (upwardComponentOfVelocity>0) {
          //   vehicleOrientation = circularOrbitDirection.clone()
          // }
          // else {
          //   // In this state we need to maintain the apogee, which means that we may need to vector some of the thrust downwards
          //   // vehicleOrientation = RV.V.clone().normalize()
          //   vehicleOrientation = circularOrbitDirection.clone().multiplyScalar(circularOrbitDirectionAcceleration).add(straightUpDirection.clone().multiplyScalar(-upwardsAcceleration)).normalize()
          // }

          // Search for the orientation that will result in in increase in perigee but no increase in appoee.
          function calcVehicleOrientation(theta, circularOrbitDirection, straightUpDirection) {
            const vehicleOrientation = circularOrbitDirection.clone().multiplyScalar(Math.cos(theta)).add(straightUpDirection.clone().multiplyScalar(Math.sin(theta)))
            return vehicleOrientation
          }
          const predictApogeeError = (theta) => {
            const vehicleOrientation = calcVehicleOrientation(theta, circularOrbitDirection, straightUpDirection)
            const experimentalRV_V = RV.V.clone().add(vehicleOrientation.clone().multiplyScalar(rocketIncrementalDeltaV))
            const experimentalCOE = this.orbitalElementsFromStateVector(RV.R, experimentalRV_V)
            const c = experimentalCOE.semimajorAxis * experimentalCOE.eccentricity
            const apogeeDistance = experimentalCOE.semimajorAxis + c
            const apogeeError = apogeeDistance - targetOrbitDistance
            return apogeeError
          }

          if (Math.abs(apogeeError) > apogeeAltitudeMargin*100) {
            // Search for the angle that minimizes the change to the apogee
            let smallestApogeeError = 0
            let bestAngle = null
            for (let angle = -Math.PI/2; angle<Math.PI/2; angle+=0.01) {
              const apogeeError = predictApogeeError(angle)
              if ((bestAngle===null) || (Math.abs(apogeeError)<smallestApogeeError)) {
                smallestApogeeError = Math.abs(apogeeError)
                bestAngle = angle
              }
            }

            vehicleOrientation = calcVehicleOrientation(bestAngle, circularOrbitDirection, straightUpDirection)
          }
          else {
            vehicleOrientation = circularOrbitDirection.clone().multiplyScalar(circularOrbitDirectionAcceleration).add(straightUpDirection.clone().multiplyScalar(-upwardsAcceleration)).normalize()
          }

        }
        else {
          vehicleOrientation = RV.V.clone().normalize()
        }

        const changeInSpeed = forwardAcceleration * tBurn
        if (!isFinite(changeInSpeed)) {
          console.error('Error: changeInSpeed is not finite')
        }
        deltaVFromAcceleration = vehicleOrientation.clone().multiplyScalar(changeInSpeed)
        // Add the acceleration vector to the velocity vector
        if (!isFinite(deltaVFromAcceleration.length())) {
          console.error('Error: deltaVFromAcceleration is not finite')
        }
        RV.V.add(deltaVFromAcceleration)
      }
      else {
        // With the simpler "Variable Thust" model we calculate the fuel flow rate based on the thrust required to exactly cancel out the aerodynamic drag.
        fuelFlowRate = aerodynamicDrag / launchVehicleRocketExhaustVelocity
        vehicleOrientation = RV.V.clone().normalize()
        forwardAcceleration = 0
      }

      const vehicleOrientationRelativeToPlanet = vehicleOrientation.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -2*Math.PI*t6a/planetSpec.lengthOfSiderealDay)

      mPropellant = Math.max(0, mPropellant - fuelFlowRate * tStep2)
      if ((mPropellant == 0) && !warningAlreadyGiven) {
        if (verbose>0) console.log("Out of propellant!")
        warningAlreadyGiven = true
      }
      mTotal = mVehicle + mPayload + mPropellant

      // ToDo: For the freeFlight part of the curve, it makes less sense to use the vehicle's position relative to the planet. Possibly this choice should be an option. 

      // Collect control points for curves
      if (isNaN(vehicleAirSpeed)) {
        console.log('Error')
      }
      if (distanceTravelledOutsideLaunchSystem===NaN) {
        console.log('Error')
      }
      if (fuelFlowRate===NaN) {
        console.log('Error')
      }
      const vehicleTelemetry = new THREE.Vector3(vehicleAirSpeed, aerodynamicDrag, fuelFlowRate)

      freeFlightConversionCurveControlPoints.push(new THREE.Vector3(vehicleAirSpeed, distanceTravelledOutsideLaunchSystem, fuelFlowRate))
      freeFlightPositionCurveControlPoints.push(vehiclePositionRelativeToPlanet)
      freeFlightOrientationCurveControlPoints.push(vehicleOrientationRelativeToPlanet.normalize())
      freeFlightTelemetryCurveControlPoints.push(vehicleTelemetry)
      // Record telemery for plots...
      if (t<=launcherXyChartMaxT) {
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressurVesusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, fuelFlowRate, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
        totalMassVersusTimeData.push(new THREE.Vector3(t, mTotal, 0))
        if (coe.eccentricity<1) {
          apogeeAltitudeVersusTimeData.push(new THREE.Vector3(t, apogeeDistance - this.planetRadius, 0))
          perigeeAltitudeVersusTimeData.push(new THREE.Vector3(t, perigeeDistance, 0))
        }
        convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qconv, 0))
        radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qrad, 0))
      }
      lastVehiclePositionRelativeToPlanet = vehiclePositionRelativeToPlanet

      if ((altitude<launcherMassDriverAltitude) && (i>4)) {
        if (verbose>0) console.log('Vehicle has returned to the planet\'s surface!')
        mPropellant = 0
        break
      }
    }
    this.durationOfFreeFlight = t - t5a
    //console.log('done')

    distanceTravelled += distanceTravelledOutsideLaunchSystem

    // ToDo: This is probably the "payloadFraction". Check terms.
    if (adaptiveThrust) {
      if ((Math.abs(apogeeError)<10000) && (Math.abs(orbitalSpeedError)<100)) {
        this.massFraction = (mVehicle + mPayload + mPropellant) / (mVehicle + mPayload + initialPropellantMass)
        this.payloadFraction = mPayload / (mVehicle + mPayload + initialPropellantMass)
      }
      else {
        if (verbose>0) console.log('Vehicle didn\'t reach target orbit.')
        this.massFraction = 0
        this.payloadFraction = 0
      }
    }
    else {
      this.massFraction = (mVehicle + mPayload + mPropellant) / (mVehicle + mPayload + initialPropellantMass)
      this.payloadFraction = mPayload / (mVehicle + mPayload + initialPropellantMass)
    }

    this.propellantConsumed = initialPropellantMass - mPropellant
    this.payloadPlusRemainingPropellant = mPayload + mPropellant
    const mSled = 28000
    const mLoadedVehicle = 28000
    const eff = 0.9
    const electricalEnergyPerLaunch = 0.5*(mSled/eff + mLoadedVehicle/eff - mSled*eff) * launcherMassDriverExitVelocity**2
    const electricalEnergyPerKg = electricalEnergyPerLaunch / mPayload
    const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value
    const costOfElecticalEnergyPerKg = electricalEnergyPerKg * wholesaleCostOfElectricity
    const payloadPerGWHour = 1e9*3600 / electricalEnergyPerKg
    const marsWindowLengthDays = 20
    const marsWindowHoursPerDay = 4
    const marsWindowLengthHours = marsWindowLengthDays * marsWindowHoursPerDay
    const totalPowerInGW = 10
    const payloadPerMarsWindow = payloadPerGWHour * marsWindowLengthHours * totalPowerInGW
    const vehicleCost = 10e6
    const capitalCost = 7e9
    const numLaunchWindows = 10
    const fullyConsideredCostPerKg = costOfElecticalEnergyPerKg + vehicleCost/mPayload + capitalCost / (payloadPerMarsWindow*numLaunchWindows)
    const equivalentCostWithRockets = payloadPerMarsWindow * 1.2e6
    console.log('Electrical Energy Per Launch', Math.round(electricalEnergyPerLaunch/1e9)/1e3, 'TJoules')
    console.log('Electrical Energy Per Kg of Payload', Math.round(electricalEnergyPerKg/1e6)/1e3, 'GJoules')
    console.log('Cost of Electical Energy Per Kg of Payload', Math.round(costOfElecticalEnergyPerKg*100)/100, 'USD')
    console.log('Payload Per GWHour', Math.round(payloadPerGWHour*100)/100, 'kg')
    console.log('Payload Per Mars Window', Math.round(payloadPerMarsWindow), 'kg')
    console.log('Equivalent Cost With Rockets', Math.round(equivalentCostWithRockets/1e12)*1e3, 'Billion USD')
    console.log('Fully Considered Cost Per Kg', Math.round(fullyConsideredCostPerKg*100)/100, 'USD')


    if (verbose) {
      console.log('Peak Fuel Flow Rate', peakFuelFlowRate, dParamWithUnits['launchVehiclePropellantMassFlowRate'].value )

      // Let's assume that the remaining propellant is considered to be payload mass
      console.log('Vehicle Dry Mass', Math.round(mVehicle))
      console.log('Payload Mass', Math.round(mPayload))
      console.log('Remaining Propellant Mass', Math.round(mPropellant))
      console.log('Propellant Consumed', Math.round(this.propellantConsumed))
      console.log('Initial Total Mass', Math.round(mVehicle + mPayload + initialPropellantMass))
      console.log('Payload + Remaining Propellant', Math.round(this.payloadPlusRemainingPropellant))
      console.log('Mass Fraction', Math.round(1000 * this.massFraction)/1000)
      console.log('Payload Fraction', Math.round(1000 * this.payloadFraction)/1000)
      console.log('Rocket Total Delta-V', Math.round(this.rocketTotalDeltaV))
      
    }

    const freeFlightConversionCurve = new THREE.CatmullRomCurve3(freeFlightConversionCurveControlPoints)

    const freeFlighttToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      return t / ((freeFlightConversionCurveControlPoints.length-1) * tStep2)
    }
    const freeFlighttTosConvertor = function (t) {
      const iForLookup = freeFlighttToiConvertor(t)
      const interpolatedPoint = freeFlightConversionCurve.getPoint(iForLookup)
      const speed = interpolatedPoint.x
      return speed
    }
    const freeFlighttTodConvertor = function (t) {
      const iForLookup = freeFlighttToiConvertor(t)
      const interpolatedPoint = freeFlightConversionCurve.getPoint(iForLookup)
      const distance = interpolatedPoint.y
      return distance
    }

    // Make a curve for the Elevated Evacuated Tube
    if (t5a-t4>0) {
      if (!this.evacuatedTubeCurve) {
        this.evacuatedTubeCurve = new CatmullRomSuperCurve3(this.evacuatedTubeCurveControlPoints)
      }
      else {
        this.evacuatedTubeCurve.setPoints(this.evacuatedTubeCurveControlPoints)
        this.evacuatedTubeCurve.updateArcLengths()
      }
      this.evacuatedTubeCurve.curveType = 'centripetal'
      this.evacuatedTubeCurve.closed = false
      this.evacuatedTubeCurve.tension = 0
      if (this.animateElevatedEvacuatedTubeDeployment) {
        // We need a second curve that we can animate while referring to the original curve to obtain coordinates
        this.coiledElevatedEvacuatedTubeCurve = new CatmullRomSuperCurve3(this.evacuatedTubeCurveControlPoints)
        this.coiledElevatedEvacuatedTubeCurve.curveType = 'centripetal'
        this.coiledElevatedEvacuatedTubeCurve.closed = false
        this.coiledElevatedEvacuatedTubeCurve.tension = 0
      }  

      this.evacuatedTubeCurve.addtToiConvertor(evacuatedTubetToiConvertor)
      this.evacuatedTubeCurve.addtTodConvertor(evacuatedTubetTodConvertor)
      this.evacuatedTubeCurve.addtTosConvertor(evacuatedTubetTosConvertor)
      this.evacuatedTubeCurve.setDuration(this.timeWithinEvacuatedTube)
      this.evacuatedTubeCurve.name = "evacuatedTubeCurve"
    }
    else {
      this.evacuatedTubeCurve = null
    }

    // Make a curve for the entire free flight portion of the launch trajectory starting from the end of the evacuated tube
    if (!this.freeFlightPositionCurve) {
      this.freeFlightPositionCurve = new CatmullRomSuperCurve3(freeFlightPositionCurveControlPoints)
    }
    else {
      this.freeFlightPositionCurve.setPoints(freeFlightPositionCurveControlPoints)
      this.freeFlightPositionCurve.updateArcLengths()
    }
    this.freeFlightPositionCurve.curveType = 'centripetal'
    this.freeFlightPositionCurve.closed = false
    this.freeFlightPositionCurve.tension = 0

    this.freeFlightPositionCurve.addtToiConvertor(freeFlighttToiConvertor)
    this.freeFlightPositionCurve.addtTodConvertor(freeFlighttTodConvertor)
    this.freeFlightPositionCurve.addtTosConvertor(freeFlighttTosConvertor)
    this.freeFlightPositionCurve.setDuration(this.durationOfFreeFlight)
    this.freeFlightPositionCurve.name = "freeFlightPositionCurve"

    // Make a curve for the entire free flight portion of the launch trajectory starting from the end of the evacuated tube
    if (!this.freeFlightOrientationCurve) {
      this.freeFlightOrientationCurve = new CatmullRomSuperCurve3(freeFlightOrientationCurveControlPoints)
    }
    else {
      this.freeFlightOrientationCurve.setPoints(freeFlightOrientationCurveControlPoints)
      this.freeFlightOrientationCurve.updateArcLengths()
    }
    this.freeFlightOrientationCurve.curveType = 'centripetal'
    this.freeFlightOrientationCurve.closed = false
    this.freeFlightOrientationCurve.tension = 0

    this.freeFlightOrientationCurve.addtToiConvertor(freeFlighttToiConvertor)
    this.freeFlightOrientationCurve.addtTodConvertor(freeFlighttTodConvertor)
    this.freeFlightOrientationCurve.addtTosConvertor(freeFlighttTosConvertor)
    this.freeFlightOrientationCurve.setDuration(this.durationOfFreeFlight)
    this.freeFlightOrientationCurve.name = "freeFlightOrientationCurve"

    // Make a curve for the entire free flight portion of the launch trajectory starting from the end of the evacuated tube
    if (!this.freeFlightTelemetryCurve) {
      this.freeFlightTelemetryCurve = new CatmullRomSuperCurve3(freeFlightTelemetryCurveControlPoints)
    }
    else {
      this.freeFlightTelemetryCurve.setPoints(freeFlightTelemetryCurveControlPoints)
      this.freeFlightTelemetryCurve.updateArcLengths()
    }
    this.freeFlightTelemetryCurve.curveType = 'centripetal'
    this.freeFlightTelemetryCurve.closed = false
    this.freeFlightTelemetryCurve.tension = 0

    this.freeFlightTelemetryCurve.addtToiConvertor(freeFlighttToiConvertor)
    this.freeFlightTelemetryCurve.addtTodConvertor(freeFlighttTodConvertor)
    this.freeFlightTelemetryCurve.addtTosConvertor(freeFlighttTosConvertor)
    this.freeFlightTelemetryCurve.setDuration(this.durationOfFreeFlight)
    this.freeFlightTelemetryCurve.name = "freeFlightTelemetryCurve"

    // Add the orientation curve to the position curve
    this.freeFlightPositionCurve.freeFlightOrientationCurve = this.freeFlightOrientationCurve
    this.freeFlightPositionCurve.freeFlightTelemetryCurve = this.freeFlightTelemetryCurve

    this.xyChart.clearCurves()
    if (dParamWithUnits['showForwardAccelerationVersusTime'].value) this.xyChart.addCurve("Forward Acceleration", "m/s2", "m/s2", forwardAccelerationVersusTimeData, 1, 0xffff00, "Yellow", "Forward Acceleration (m/s2)")
    if (dParamWithUnits['showUpwardAccelerationVersusTime'].value) this.xyChart.addCurve("Upward Acceleration", "m/s2", "m/s2", upwardAccelerationVersusTimeData, 1, 0xff8000, "Orange", "Upward Acceleration (m/s2)")
    if (dParamWithUnits['showAltitudeVersusTime'].value) this.xyChart.addCurve("Altitude", "m", "km", altitudeVesusTimeData, 0.001, 0xffc080, "Light Brown", "Altitude (km)")
    if (dParamWithUnits['showAirPressureVersusTime'].value) this.xyChart.addCurve("Air Pressure", "Pa", "% of Sea Level", airPressurVesusTimeData, 100/airPressureAtSeaLevel, 0xff0000, "Red", "Air Pressure (% of sea level)")
    if (dParamWithUnits['showDownrangeDistanceVersusTime'].value) this.xyChart.addCurve("Downrange Distance", "m", "100's of km", downrangeDistanceVersusTimeData, .00001, 0x0000ff, "Blue", "Downrange Distance (100's of km)")
    if (dParamWithUnits['showAirSpeedVersusTime'].value) this.xyChart.addCurve("Air Speed", "m/s", "km/s", airSpeedVersusTimeData, 0.001, 0x00ffff, "Cyan", "Air Speed (km/s)")
    if (dParamWithUnits['showAerodynamicDragVersusTime'].value) this.xyChart.addCurve("Aerodynamic Drag", "N", "100's of kN", aerodynamicDragVersusTimeData, 0.00001, 0x80ff80, "Bright Green", "Aerodynamic Drag (100's of kN)")
    if (dParamWithUnits['showFuelMassFlowRateVersusTime'].value) this.xyChart.addCurve("Propellant Mass Flow Rate", "kg/s", "10's of kg/s", fuelMassFlowRateVersusTimeData, 0.1, 0x7f7fff, "Blue", "Propellant Mass Flow Rate (10's of kg/s)")
    if (dParamWithUnits['showTotalMassVersusTime'].value) this.xyChart.addCurve("Vehicle Mass", "kg", "1000's of kg", totalMassVersusTimeData, 0.001, 0xff7fff, "Purple", "Vehicle Mass (1000's of kg)")
    if (dParamWithUnits['showApogeeAltitudeVersusTime'].value) this.xyChart.addCurve("Orbital Apogee Altiude", "m", "m", apogeeAltitudeVersusTimeData, 1, 0xffffff, "White", launchVehicleDesiredOrbitalAltitude, "Orbital Apogee Altitude (km)")
    if (dParamWithUnits['showPerigeeAltitudeVersusTime'].value) this.xyChart.addCurve("Orbital Perigee Distance", "m", "m", perigeeAltitudeVersusTimeData, 1, 0xffff7f, "White", this.planetRadius + launchVehicleDesiredOrbitalAltitude, "Orbital Perigee Distance (km)")
    //if (dParamWithUnits['showConvectiveHeatingVersusTime'].value) this.xyChart.addCurve("Convective Heating", "W/m2", "W/m2",  convectiveHeatingVersusTimeData, 1, 0xffff7f, "LightYellow", "Convective Heating (W/m2)")
    //if (dParamWithUnits['showRadiativeHeatingVersusTime'].value) this.xyChart.addCurve("Radiative Heating", "W/m2", "W/m2", radiativeHeatingVersusTimeData, 1, 0xffc080, "LightOrange", "Radiative Heating (W/m2)")
    this.xyChart.drawLegend(14, 22)

    // forwardAccelerationVersusTimeData.forEach(point => {
    //   if (point.y<0) {
    //     console.print(point.x, -point.y)
    //   }
    // })
    if (verbose) {
      console.print('========= Chart Legend and Y-Axis Values ==========')
      //let peakAerodynamicDrag = 0
      this.xyChart.curveInfo.forEach(curve =>{
        if (curve.name == 'Aerodynamic Drag') {
          console.print(curve.name, '(', curve.colorName, ')', Math.round(curve.largestY), curve.units)
          console.print('   (Equivalent to ' + Math.round(curve.largestY/2279000*100)/100 + ' RS-25 Space Shuttle Main Engines)')
          console.print('   (Equivalent to ' + Math.round(curve.largestY/2520000*100)/100 + ' SpaceX Raptor2 Vacuum Engines)')
          //peakAerodynamicDrag = curve.maxY
        }
        else {
          console.print(curve.name, '(', curve.colorName, ')', Math.round(curve.largestY*curve.yScale), curve.scaledUnits)
        }
      })
      console.print('===================================================')
      // console.print("Vehicle Peak Aerodynamic Drag", Math.round(peakAerodynamicDrag/1000000), 'MN')
      // console.print("RS-25 Engine Thrust 2279 kN")
      console.print("Vehicle Initial Mass", Math.round(m0), 'kg')
      console.print("MassDriver1 Time", Math.round(launcherMassDriver1AccelerationTime*10)/10, 'sec')
      console.print("MassDriver2 Time", Math.round(launcherMassDriver2AccelerationTime*10)/10, 'sec (' + Math.round(launcherMassDriver2AccelerationTime*100/60)/100, 'min)')
      console.print("Ramp Time", Math.round(this.launchVehicleTimeWithinRamp*10)/10, 'sec')
      console.print("Evacuate Tube Time", Math.round(this.timeWithinEvacuatedTube*10)/10, 'sec')
      console.print("Total Time on Chart X-Axis", Math.round(t6a), 'sec (' + Math.round(t6a/6)/10 + ' min)')
      console.print("MassDriver1 Length", Math.round(this.launcherMassDriver1Length/10)/100, 'km (',  Math.round(this.launcherMassDriver1Length/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      console.print("MassDriver2 Length", Math.round(this.launcherMassDriver2Length/10)/100, 'km (',  Math.round(this.launcherMassDriver2Length/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      console.print("Ramp Length", Math.round(this.launcherRampLength/10)/100, 'km (',  Math.round(this.launcherRampLength/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      console.print("Suspended Evacuated Tube Length", Math.round(this.launcherSuspendedEvacuatedTubeLength/10)/100, 'km (',  Math.round(this.launcherSuspendedEvacuatedTubeLength/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      console.print("Suspended Evacuated Tube Exit Altitude", Math.round(launcherEvacuatedTubeExitAltitude/10)/100, 'km')
      console.print("Total Length Of Launch System", Math.round(this.totalLengthOfLaunchSystem/10)/100, 'km')

      // const massDriverCost = (this.launcherMassDriver1Length + this.launcherMassDriver2Length) * massDriverCostPerMeter
      // const rampCost = this.launcherRampLength * rampCostPerMeter
      // const suspendedEvacuatedTubeCost = this.launcherSuspendedEvacuatedTubeLength * suspendedEvacuatedTubeCostPerMeter
      // console.print("MassDriver Cost", Math.round(massDriverCost/1e6)/1e3, 'billion USD')
      // console.print("Ramp Cost", Math.round(rampCost/1e6)/1e3, 'billion USD')
      // console.print("Suspended Evacuated Tube Cost", Math.round(suspendedEvacuatedTubeCost/1e6)/1e3, 'billion USD')
      // console.print('==================================================')
    }

    if (genLauncherKMLFile) {
      // Start a polyline...
      kmlFile = kmlutils.kmlLauncherPlacemarkHeader

      const numSupports = 100
      // To make the line for the mass driver... 
      for (let i = 0; i<numSupports; i++) {
        const d = i / (numSupports-1)
        const pointOnCurve = this.massDriver2Curve.getPointAt(d)
        // You'll need to convert each point to lla with this code...
        const xyzPlanet = planetCoordSys.worldToLocal(pointOnCurve.clone())
        const lla = tram.ecefToGeodetic(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z, planetSpec.ellipsoid)
        const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
        kmlFile = kmlFile.concat(coordString)
        //console.log('mass', lla.alt, xyzPlanet.length()-this.planetRadius)

      }

      // Extend the line for the ramp...
      for (let i = 1; i<numSupports; i++) {
        const d = i / (numSupports-1)
        const pointOnCurve = this.launchRampCurve[1].getPointAt(d)
        // You'll need to convert each point to lla with this code...
        const xyzPlanet = planetCoordSys.worldToLocal(pointOnCurve.clone())
        const lla = tram.ecefToGeodetic(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z, planetSpec.ellipsoid)
        const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
        kmlFile = kmlFile.concat(coordString)
        //console.log('ramp', lla.alt, xyzPlanet.length()-this.planetRadius)
      }

      // Finish the poly line...
      kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)

      // To make the supports...
      for (let i = 0; i<numSupports; i++) {
        const d = i / (numSupports-1)
        const pointOnCurve = this.launchRampCurve[1].getPointAt(d)
        const tanget = this.launchRampCurve[1].getTangentAt(d)
        const normal = this.launchRampCurve[1].getNormalAt(d)
        const binormal = this.launchRampCurve[1].getBinormalAt(d)
        const pointGeodetic = tram.ecefToGeodetic(pointOnCurve.x, pointOnCurve.y, pointOnCurve.z, planetSpec.ellipsoid)

        const tempBaseMiddle = tram.geodeticToECEF(pointGeodetic.lat, pointGeodetic.lon, -2000, planetSpec.ellipsoid)
        const baseMiddle = new THREE.Vector3(tempBaseMiddle.x, tempBaseMiddle.y, tempBaseMiddle.z)
        const basePointToLeft = baseMiddle.clone().sub(binormal.clone().multiplyScalar(0.3 * (pointGeodetic.alt+2000)))
        const basePointToRight = baseMiddle.clone().add(binormal.clone().multiplyScalar(0.3 * (pointGeodetic.alt+2000)))

        const tempCrossbarMiddle = tram.geodeticToECEF(pointGeodetic.lat, pointGeodetic.lon, (-2000 + pointGeodetic.alt)*0.95, planetSpec.ellipsoid)
        const crossbarMiddle = new THREE.Vector3(tempCrossbarMiddle.x, tempCrossbarMiddle.y, tempCrossbarMiddle.z)
        const crossbarPointToLeft = crossbarMiddle.clone().sub(binormal.clone().multiplyScalar(0.3 * (pointGeodetic.alt+2000)*0.95))
        const crossbarPointToRight = crossbarMiddle.clone().add(binormal.clone().multiplyScalar(0.3 * (pointGeodetic.alt+2000)*0.95))
        // To make the support, draw polyline from pointToLeft to pointOnCurve to pointToRight...
        const pointList = [basePointToLeft, pointOnCurve, basePointToRight]
        const crossbarPointList = [crossbarPointToLeft, crossbarPointToRight]

        // Start a polyline
        kmlFile = kmlFile.concat(kmlutils.kmlRampSupportPlacemarkHeader)

        // You'll need to convert each point to lla with this code...
        pointList.forEach(point => {
          const xyzPlanet = planetCoordSys.worldToLocal(point.clone())
          const lla = tram.ecefToGeodetic(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z, planetSpec.ellipsoid)
          const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
          kmlFile = kmlFile.concat(coordString)
        })
        
        // End the polyline
        kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)

        // draw crossbar

        // Start a polyline
        kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader)
        
        crossbarPointList.forEach(point => {
          const xyzPlanet = planetCoordSys.worldToLocal(point.clone())
          const lla = tram.ecefToGeodetic(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z, planetSpec.ellipsoid)
          const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
          kmlFile = kmlFile.concat(coordString)
        })

        // End the polyline
        kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)

        
      }
      this.kmlFile = kmlFile;
    }
  }
}
