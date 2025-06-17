import * as THREE from 'three'
import * as tram from './tram.js'

THREE.Vector3.prototype.isFinite = function () {
  return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
}

export function simRocketFlight(simInputParameters, scene, verbose) {

  // Expand the input parameters into individual variables
  const {
    // Static Parameters
    planetSpec,
    planetRadius,
    planetsRotationRateInHz,
    R0,
    V0PlusPlanetRotation,
    rocketCoastTime,
    tStep,
    speedMaxTime,
    altMaxTime,
    empiricalData,
    orbitalElementsFromStateVector,
    RV_from_R0V0Aandt,
    launcherXyChartMaxT,
    rocketStage1SeaLevelEngines,
    rocketStage1VacuumEngines,
    rocketStage2SeaLevelEngines,
    rocketStage2VacuumEngines,
    rocketRadius,
    rocketStage1BodyLength,
    rocketEffectiveRadius,
    // Potentially Tunable Parameters
    engineParams,
    ch4Fraction,
    loxFraction,
    rocketDesiredOrbitalAltitude,
    rocketStage1DryMass,
    rocketStage2DryMass,
    rocketPayloadMass,
    initialStage1PropellantMass,
    initialStage2PropellantMass,
    rocketStage1RecoveryPropellantMass,
    rocketStage2RecoveryPropellantMass,
    rocketSeaLevelEnginePropellantFlowRate,
    rocketVacuumEnginePropellantFlowRate,
    rocketExhaustVelocitySLEngInVac,
    rocketExhaustVelocitySLEngAtSeaLevel,
    rocketExhaustVelocityVacEngInVac,
    rocketExhaustVelocityVacEngAtSeaLevel,
    rocketCoefficientOfDrag,
    rocketStage1StructuralLoadLimit,
    rocketStage2StructuralLoadLimit,
    rocketSeparationDelay,
    useCycloidFactor,
    cycloidRadius
  } = simInputParameters;

  let vehiclePosition
  let vehicleSpeed
  let vehicleAirSpeed
  let altitude
  let forwardAcceleration = 0
  let upwardAcceleration = 0
  let airPressureInPascals
  let distanceTravelled = 0
  let coe
  let apogeeDistance
  let perigeeDistance
  let closeApsis
  let farApsis
  let mecoTime
  let estimatedTimeToMECO
  let t
  let deltaV = 0
  let gravityLosses = 0
  let RV = { R: R0.clone(), V: V0PlusPlanetRotation.clone() }
  
  const freeFlightPositionCurveControlPoints = []
  const freeFlightConversionCurveControlPoints = []
  const freeFlightOrientationCurveControlPoints = []
  const freeFlightTelemetryCurveControlPoints = []

  const altitudeVersusTimeData = []
  const airPressureVersusTimeData = []
  const airSpeedVersusTimeData = []
  const downrangeDistanceVersusTimeData = []
  const forwardAccelerationVersusTimeData = []
  const upwardAccelerationVersusTimeData = []
  const aerodynamicDragVersusTimeData = []
  const propellantMassFlowRateVersusTimeData = []
  const totalMassVersusTimeData = []
  const boosterCH4MassVersusTimeData = []
  const boosterLOXMassVersusTimeData = []
  const shipCH4MassVersusTimeData = []
  const shipLOXMassVersusTimeData = []
  const apogeeAltitudeVersusTimeData = []
  const perigeeAltitudeVersusTimeData = []
  const closeApsisVersusTimeData = []
  const farApsisVersusTimeData = []
  const convectiveHeatingVersusTimeData = []
  const radiativeHeatingVersusTimeData = []
  const deltaVVersusTimeData = []
  const orientationCorrectionVersusTimeData = []

  const angularMomentumVectorVersusTimeData = []
  const eccentricityVersusTimeData = []
  const rightAscensionOfAscendingNodeVersusTimeData = []
  const inclinationVersusTimeData = []
  const argumentOfPerigeeVersusTimeData = []
  const trueAnomalyVersusTimeData = []
  const semimajorAxisVersusTimeData = []
  const predictedAltitudeVersusTime = []

  const printOrbitalElements = verbose && true
  
  const totalSplinePoints = Math.floor(rocketCoastTime/tStep) // Place spline points at roughly tStep intervals along the launch path (warning - this is not exact)

  let lastVehiclePositionRelativeToPlanet = R0.clone()

  // ***************************************************************
  // Create the part of the trajectory where the vehicle coasts on an eliptical or hyperbolic trajectory after it leaves the evacuated tube
  // ***************************************************************
  // We'll need to generate some parameters to help us calculate the aerodynamic drag on the vehicle while it's traveling through the rarified upper atmosphere 

  const initialMass = rocketStage1DryMass + initialStage1PropellantMass + rocketStage2DryMass + initialStage2PropellantMass + rocketPayloadMass
  let mTotal = initialMass
  let rocketStage1PropellantMass = initialStage1PropellantMass
  let rocketStage2PropellantMass = initialStage2PropellantMass
  const numFreeFlightSplinePoints = Math.max(4, totalSplinePoints)
  let accellerateToRaisePerigee = false
  let distanceTravelledAlongTrajectory = 0
  let warningAlreadyGiven = false
  let warning2AlreadyGiven = false
  let propellantFlowRate
  let thrust
  let rocketTotalDeltaV = 0
  let abortFreeFlight = false
  let vehicleOrientation

  const padVelocityDueToEarthsRotation = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0).cross(R0)
  const downrangeDirection = R0.clone().cross(padVelocityDueToEarthsRotation).cross(R0).normalize()

  const targetOrbitDistance = planetRadius + rocketDesiredOrbitalAltitude

  // this.scene.add(arrow(R0, downrangeDirection, 1000))
  // const rotationAxis = new THREE.Vector3().crossVectors(R0, downrangeDirection).normalize()    
  // this.scene.add(arrow(R0, rotationAxis, 1000))

  // Hack
  const pitchOverAltitude = rocketDesiredOrbitalAltitude * 0.5

  let rocketState = 0
  let orientationCorrectionAngle = -0.1

  // for (let d = 0; d <100000; d+=1000) {
  //   const cycloidResult = tram.cycloid3D(d, cycloidRadius, R0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0001), downrangeDirection)
  //   this.scene.add(arrow(cycloidResult.cycloidPosition, cycloidResult.cycloidTangent, 200, 2, 2, 0xff0000))
  // }

  for (let i = 0; (i<numFreeFlightSplinePoints) && !abortFreeFlight; i++ ) {
    t = i * tStep
    
    // console.log('distanceTravelledAlongTrajectory', distanceTravelledAlongTrajectory)
    //console.log('t', Math.floor(t), 'd', Math.floor(distanceTravelledAlongTrajectory), cycloidResult.position.length()-planetRadius, R0.clone().angleTo(cycloidResult.cycloidTangent)*180/Math.PI)

    coe = orbitalElementsFromStateVector(RV.R, RV.V)
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
      [closeApsis, farApsis] = findCloseAndFarApsis(coe, RV.R, scene, true)
      const c = coe.semimajorAxis * coe.eccentricity
      apogeeDistance = coe.semimajorAxis + c
      perigeeDistance = coe.semimajorAxis - c
    }
    const apogeeError = apogeeDistance - targetOrbitDistance
    const perigeeError = perigeeDistance - targetOrbitDistance
    const speedAtApogee = Math.sqrt(planetSpec.gravitationalParameter * (2 / apogeeDistance - 1 / coe.semimajorAxis))
    const speedOfCircularizedOrbit = Math.sqrt(planetSpec.gravitationalParameter / apogeeDistance)
    const straightUpDirection = RV.R.clone().normalize()
    const circularOrbitDirection = RV.R.clone().cross(RV.V).cross(RV.R).normalize()
    const speedInOrbitalDirection = RV.V.clone().dot(circularOrbitDirection)
    const centripitalAcceleration = (speedInOrbitalDirection ** 2) / RV.R.length()
    const gravityAcceleration = planetSpec.gravitationalParameter / (RV.R.length() ** 2)
    const upwardsAcceleration = centripitalAcceleration - gravityAcceleration  // Will be negative if we're on a ballistic trajectory
    const apogeeAltitudeMargin = 10

    const vehiclePosition = RV.R.clone()
    const vehicleVelocity = RV.V.clone()
    const velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI * planetsRotationRateInHz, 0).cross(vehiclePosition)
    const vehicleVelocityRelativeToAir = vehicleVelocity.clone().sub(velocityDueToPlanetsRotation)
    vehicleSpeed = RV.V.length() // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
    altitude = RV.R.length() - planetRadius
    airPressureInPascals = planetSpec.airPressureAtAltitude(altitude)
    vehicleAirSpeed = vehicleVelocityRelativeToAir.length()

    let numSeaLevelEngines, numVacuumEngines
    switch (rocketState) {
      case 0:
        // First stage burn
        numSeaLevelEngines = rocketStage1SeaLevelEngines
        numVacuumEngines = rocketStage1VacuumEngines
        mTotal = rocketStage1DryMass + rocketStage1PropellantMass + rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        break
      default:
        numSeaLevelEngines = rocketStage2SeaLevelEngines
        numVacuumEngines = rocketStage2VacuumEngines
        mTotal = rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        break
    }

    const maxPropellantFlowRate = rocketSeaLevelEnginePropellantFlowRate * numSeaLevelEngines + rocketVacuumEnginePropellantFlowRate * numVacuumEngines
    const averageSeaLevelEngineExhaustVelocity = tram.lerp(rocketExhaustVelocitySLEngInVac, rocketExhaustVelocitySLEngAtSeaLevel, airPressureInPascals/101325)
    const averageVacuumEngineExhaustVelocity = tram.lerp(rocketExhaustVelocityVacEngInVac, rocketExhaustVelocityVacEngAtSeaLevel, airPressureInPascals/101325)
    let averageExhaustVelocity = tram.lerp(averageSeaLevelEngineExhaustVelocity, averageVacuumEngineExhaustVelocity, numVacuumEngines/(numSeaLevelEngines+numVacuumEngines))
    const airDensity = planetSpec.airDensityAtAltitude(altitude)
    const aerodynamicDrag = tram.getAerodynamicDrag(airDensity, rocketCoefficientOfDrag, vehicleAirSpeed, rocketRadius, rocketStage1BodyLength)
    const qconv = vehicleAirSpeed**3 * (airDensity/rocketEffectiveRadius)**0.5
    const qrad = vehicleAirSpeed**8 * airDensity**1.2 * rocketEffectiveRadius**0.5
       

    function calcThrustAndFlowRate(structuralLoadLimit, aerodynamicDrag, load, numSeaLevelEngines, numVacuumEngines, rocketSeaLevelEnginePropellantFlowRate, rocketVacuumEnginePropellantFlowRate, engineParams, altitude) {
      // (Note: Potentially good inforamtion on rocket engine performance analysys here: https://exrocketman.blogspot.com/2024/07/requests-for-rocket-engine-estimator.html)
      // We need to limit the acceleration to avoid exceeding the structural load limit on the booster, so solve the following eqauation for acceleration:
      // rocketStage1StructuralLoadLimit <= aerodynamicDrag + acceleration * (rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass)
      const maxAllowableAcceleration = (structuralLoadLimit - aerodynamicDrag*6) / load
      // Next solve for the maximum allowable thrust
      const maxAllowableThrust = maxAllowableAcceleration * mTotal
      // Next figure out what the maximum possible thrust for one engine is
      engineParams.P0 = planetSpec.airPressureAtAltitude(altitude)
      engineParams.mdot = rocketSeaLevelEnginePropellantFlowRate
      const {inertialThrust, pressureThrust, ve} = tram.calculateThrustAndExitVelocity(engineParams)
      const maximumPossibleThrust = (numSeaLevelEngines+numVacuumEngines) * (inertialThrust + pressureThrust)
      engineParams.targetThrust = maxAllowableThrust / (numSeaLevelEngines+numVacuumEngines)
      if (maximumPossibleThrust > maxAllowableThrust) {
        thrust = maxAllowableThrust
        engineParams.targetThrust = maxAllowableThrust / (numSeaLevelEngines+numVacuumEngines)
        propellantFlowRate = tram.solveForMassFlowRate(engineParams) * (numSeaLevelEngines+numVacuumEngines)
      }
      else {
        thrust = maximumPossibleThrust
        propellantFlowRate = rocketSeaLevelEnginePropellantFlowRate * numSeaLevelEngines + rocketVacuumEnginePropellantFlowRate * numVacuumEngines
      }
      return [thrust, propellantFlowRate]
    }

    switch (rocketState) {
      case 0:
        // First stage burn
        // ToDo: We also need to calculate the exhaust velocity if we want to plot that information
        [thrust, propellantFlowRate] = calcThrustAndFlowRate(
          rocketStage1StructuralLoadLimit, 
          aerodynamicDrag, 
          rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass,
          numSeaLevelEngines,
          numVacuumEngines,
          rocketSeaLevelEnginePropellantFlowRate,
          rocketVacuumEnginePropellantFlowRate,
          engineParams,
          altitude)
        mTotal = rocketStage1DryMass + rocketStage1PropellantMass + rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        if (rocketStage1PropellantMass <= rocketStage1RecoveryPropellantMass) {
          //console.log('******** airSpeed at MECO', Math.round(vehicleAirSpeed*3.6), 'km/h')
          rocketState = 1
          mecoTime = t - tStep + estimatedTimeToMECO
        }
        break
      case 1:
        // MECO and Stage Separation
        // Reduce stage 2 thrust and exhaust velocity during hot staging
        averageExhaustVelocity = 0.25*tram.lerp(averageSeaLevelEngineExhaustVelocity, averageVacuumEngineExhaustVelocity, numVacuumEngines/(numSeaLevelEngines+numVacuumEngines))
        propellantFlowRate = 0.25*maxPropellantFlowRate
        thrust = propellantFlowRate * averageExhaustVelocity
        mTotal = rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        if (t-mecoTime>=rocketSeparationDelay) {
          rocketState = 2
        }
        break
      case 2:
        // Second stage burn
        [thrust, propellantFlowRate] = calcThrustAndFlowRate(
          rocketStage2StructuralLoadLimit, 
          aerodynamicDrag, 
          rocketStage2DryMass * 0.5 + rocketStage2PropellantMass*0.22 + rocketPayloadMass,  // We'll assume that load is dry mass of second tank and everything above it, the fraction of the propellant that is fuel, plus the payload.
          numSeaLevelEngines,
          numVacuumEngines,
          rocketSeaLevelEnginePropellantFlowRate,
          rocketVacuumEnginePropellantFlowRate,
          engineParams,
          altitude)
        mTotal = rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        if (rocketStage2PropellantMass <= rocketStage2RecoveryPropellantMass) {
          rocketState = 3
        }
        break
      case 3:
        // Coast to apogee
        averageExhaustVelocity = tram.lerp(averageSeaLevelEngineExhaustVelocity, averageVacuumEngineExhaustVelocity, numVacuumEngines/(numSeaLevelEngines+numVacuumEngines))
        propellantFlowRate = 0
        thrust = propellantFlowRate * averageExhaustVelocity
        mTotal = rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        //console.log(t, 'coe.trueAnomaly', coe.trueAnomaly)
        const reachedApogee = (coe.trueAnomaly>=Math.PI)
        if (reachedApogee) {
          rocketState = 4
        }
        break
      case 4:
        // Circularization burn
        averageExhaustVelocity = tram.lerp(averageSeaLevelEngineExhaustVelocity, averageVacuumEngineExhaustVelocity, numVacuumEngines/(numSeaLevelEngines+numVacuumEngines))
        propellantFlowRate = maxPropellantFlowRate
        thrust = propellantFlowRate * averageExhaustVelocity
        mTotal = rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        //console.log(t, 'coe.trueAnomaly', coe.trueAnomaly)
        const reachedPerigee = (coe.trueAnomaly>=0)
        if (reachedPerigee) {
          rocketState = 5
        }
        break
      case 5:
        // Leo Orbit
        averageExhaustVelocity = tram.lerp(averageSeaLevelEngineExhaustVelocity, averageVacuumEngineExhaustVelocity, numVacuumEngines/(numSeaLevelEngines+numVacuumEngines))
        propellantFlowRate = 0
        thrust = propellantFlowRate * averageExhaustVelocity
        mTotal = rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass
        break
    }

    const vehiclePositionRelativeToPlanet = vehiclePosition.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -2*Math.PI*t*planetsRotationRateInHz)
    const deltaDistanceTravelled = lastVehiclePositionRelativeToPlanet.distanceTo(vehiclePositionRelativeToPlanet) // ToDo: Would be better to find the equation for distance traveled along an eclipse versus time.
    distanceTravelledAlongTrajectory += deltaDistanceTravelled 
    lastVehiclePositionRelativeToPlanet = vehiclePositionRelativeToPlanet

    // Aerodynamic drag force
    const dragVector = vehicleVelocityRelativeToAir.clone().normalize().multiplyScalar(-aerodynamicDrag)
    const rotationAxis = new THREE.Vector3().crossVectors(R0, downrangeDirection).normalize()

    const flightProfile = 2
    let minAngle, maxAngle
    switch (flightProfile) {
    case 0:
      if (distanceTravelledAlongTrajectory<cycloidRadius*useCycloidFactor) {
        const cycloidResult = tram.cycloid3D(distanceTravelledAlongTrajectory, cycloidRadius, R0, downrangeDirection)
        vehicleOrientation = cycloidResult.cycloidTangent.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -2*Math.PI*t*planetsRotationRateInHz)
        //console.log('vehicleOrientation', t, vehicleOrientation.angleTo(RV.R)*180/Math.PI)
      }
      else {
        minAngle = Math.max(orientationCorrectionAngle - 0.1, -Math.PI/6)
        maxAngle = Math.min(orientationCorrectionAngle + 0.1, Math.PI/6)
        const initialAngle = 0
        //const empiricalAltitudeDatapoint = empiricalData.starshipAltitude.find(point => point.x === t+tStep*40)
        const regressionData = empiricalData.altitudeRegressionData
        // Predict the altitude with the two nearest regressions, and then blend the results in proportion to the points distance from the two regreesions
        const tMin = regressionData.tMin
        const tMax = regressionData.tMax
        const futureT = t+tStep*50

        if ((futureT>=tMin) && (futureT<=tMax)) {
          const numRegressions = regressionData.regressions.length
          const pos = numRegressions*(futureT-tMin)/(tMax-tMin)
          const intPos = Math.floor(pos)
          const intPosPlus1 = Math.min(intPos+1, numRegressions-1)
          const frac = pos-intPos
          const predictedAlt0 = regressionData.regressions[intPos].predict(futureT)[1]
          const predictedAlt1 = regressionData.regressions[intPosPlus1].predict(futureT)[1]
          const predictedAltitude = tram.lerp(predictedAlt0, predictedAlt1, frac)
          const targetDistance = planetRadius + predictedAltitude
          predictedAltitudeVersusTime.push(new THREE.Vector3(futureT, predictedAltitude, 0))

          orientationCorrectionAngle = optimizeOrientation(
            minAngle,
            maxAngle,
            targetDistance,
            RV,
            dragVector,
            thrust,
            mTotal,
            tStep*50,
            rotationAxis,
            RV_from_R0V0Aandt
          )
          //console.log('t:', t, 'orientationCorrectionAngle', orientationCorrectionAngle*180/Math.PI)
        }
        vehicleOrientation = RV.V.clone().normalize().applyAxisAngle(rotationAxis, orientationCorrectionAngle)
      }
      break
    case 1:
      if (distanceTravelledAlongTrajectory<cycloidRadius*useCycloidFactor) {
        const cycloidResult = tram.cycloid3D(distanceTravelledAlongTrajectory, cycloidRadius, R0, downrangeDirection)
        vehicleOrientation = cycloidResult.cycloidTangent.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -2*Math.PI*t*planetsRotationRateInHz)
        //console.log('vehicleOrientation', t, vehicleOrientation.angleTo(RV.R)*180/Math.PI)
      }
      else {
        // Find the orientation that will shrink the apogeeError and perigeeError by the same factor.
        const targetCloseApsis = planetRadius + 100000
        const targetFarApsis = planetRadius + 200000
        minAngle = -0.1
        maxAngle = 0.1
        orientationCorrectionAngle = optimizeOrientation2(
          minAngle,
          maxAngle,
          RV,
          dragVector,
          thrust,
          mTotal,
          tStep,
          rotationAxis,
          targetCloseApsis,
          targetFarApsis
        )
        vehicleOrientation = RV.V.clone().normalize().applyAxisAngle(rotationAxis, orientationCorrectionAngle)
      }
      break
    case 2:
      // Use the orientation obtained from emerical data
      const empericalShipOrientationInDegrees = interpolatePoint(empiricalData.starshipOrientation, t)
      const empiricalShipOrientationInRadians = empericalShipOrientationInDegrees.y * Math.PI / 180
      vehicleOrientation = RV.R.clone().normalize().applyAxisAngle(rotationAxis, empiricalShipOrientationInRadians)
      break
    }

    // if (t%3==0) {
    //   this.scene.add(arrow(vehiclePositionRelativeToPlanet, vehicleOrientation.clone(), 100, 1, 1, 0xff0000))
    //   this.scene.add(arrow(vehiclePositionRelativeToPlanet, vehicleVelocityRelativeToAir.clone(), 100, 1, 1, 0x00ff00))
    // }

    const vehicleTelemetry = new THREE.Vector3(vehicleAirSpeed, aerodynamicDrag, propellantFlowRate)
    const downrangeAngle = R0.angleTo(RV.R)
    const downrangeDistance = downrangeAngle * planetRadius

    if (vehiclePositionRelativeToPlanet.isFinite()) {
      freeFlightConversionCurveControlPoints.push(new THREE.Vector3(vehicleAirSpeed, distanceTravelledAlongTrajectory, propellantFlowRate))
      freeFlightPositionCurveControlPoints.push(vehiclePositionRelativeToPlanet)
      freeFlightOrientationCurveControlPoints.push(vehicleOrientation.clone())
      freeFlightTelemetryCurveControlPoints.push(vehicleTelemetry)
    }

    // Calculate the vehicle's acceleration
    // Force of gravity - This is taken care of by the orbital mechanics math, so we don't need to calculate it here
    // const forceOfGravity = mTotal * planetSpec.gravitationalParameter / vehiclePosition.length()**2

    // Calculculate the magnitude of the vehicle's thrust
    const thrustVector = vehicleOrientation.clone().multiplyScalar(thrust)
    deltaV += thrust*tStep/mTotal
    //gravityLosses += 

    // We want to calculate the vehicle's orientation so that the combined force is in the direction of the vehicle's velocity vector
    const combinedForceVector = dragVector.clone().add(thrustVector)
    const acceleration = combinedForceVector.clone().divideScalar(mTotal)

    const drag = dragVector.length()/1e6
    const thrustForce = thrustVector.length()/1e6
    const totalForce = combinedForceVector.length()/1e6
    const totalAcceleration = acceleration.length()

    // Calculate the change in position and velocity
    RV = RV_from_R0V0Aandt(RV.R, RV.V, acceleration, tStep)
    if (!RV.R.isFinite()) {
      debugger
    }

    // Record telemery for plots...
    if (t<=launcherXyChartMaxT) {
      altitudeVersusTimeData.push(new THREE.Vector3(t, altitude, 0))
      airPressureVersusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
      downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
      airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
      forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
      upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, upwardAcceleration, 0))
      aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
      propellantMassFlowRateVersusTimeData.push(new THREE.Vector3(t, propellantFlowRate, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
      totalMassVersusTimeData.push(new THREE.Vector3(t, mTotal, 0))
      boosterCH4MassVersusTimeData.push(new THREE.Vector3(t, rocketStage1PropellantMass*ch4Fraction, 0))
      boosterLOXMassVersusTimeData.push(new THREE.Vector3(t, rocketStage1PropellantMass*loxFraction, 0))
      shipCH4MassVersusTimeData.push(new THREE.Vector3(t, rocketStage2PropellantMass*ch4Fraction, 0))
      shipLOXMassVersusTimeData.push(new THREE.Vector3(t, rocketStage2PropellantMass*loxFraction, 0))
      if (coe.eccentricity<1) {
        apogeeAltitudeVersusTimeData.push(new THREE.Vector3(t, Math.max(0, apogeeDistance-planetRadius), 0))
        perigeeAltitudeVersusTimeData.push(new THREE.Vector3(t, Math.max(0, perigeeDistance), 0))
        closeApsisVersusTimeData.push(new THREE.Vector3(t, Math.max(0, closeApsis), 0))
        farApsisVersusTimeData.push(new THREE.Vector3(t, Math.max(0, farApsis), 0))
      }
      convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qconv, 0))
      radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qrad, 0))
      deltaVVersusTimeData.push(new THREE.Vector3(t, deltaV, 0))
      orientationCorrectionVersusTimeData.push(new THREE.Vector3(t, 60+orientationCorrectionAngle*180/Math.PI, 0))
      
      angularMomentumVectorVersusTimeData.push(new THREE.Vector3(t, coe.angularMomentumVector, 0))
      eccentricityVersusTimeData.push(new THREE.Vector3(t, coe.eccentricity, 0))
      rightAscensionOfAscendingNodeVersusTimeData.push(new THREE.Vector3(t, coe.rightAscensionOfAscendingNode, 0))
      inclinationVersusTimeData.push(new THREE.Vector3(t, coe.inclination, 0))
      argumentOfPerigeeVersusTimeData.push(new THREE.Vector3(t, coe.argumentOfPerigee, 0))
      trueAnomalyVersusTimeData.push(new THREE.Vector3(t, coe.trueAnomaly, 0))
      semimajorAxisVersusTimeData.push(new THREE.Vector3(t, coe.semimajorAxis, 0))
    }

    // Update the propellant mass
    switch (rocketState) {
      case 0:
        // First stage burn
        estimatedTimeToMECO = (rocketStage1PropellantMass - rocketStage1RecoveryPropellantMass)/propellantFlowRate
        rocketStage1PropellantMass = Math.max(rocketStage1RecoveryPropellantMass, rocketStage1PropellantMass - propellantFlowRate*tStep)
        break
      default:
        rocketStage2PropellantMass = Math.max(rocketStage2RecoveryPropellantMass, rocketStage2PropellantMass - propellantFlowRate*tStep)
        break
    }


  }
  distanceTravelled += distanceTravelledAlongTrajectory
  // this.massFraction = (rocketStage1DryMass + rocketStage1PropellantMass + rocketStage2DryMass + rocketStage2PropellantMass + rocketPayloadMass) / initialMass
  // this.payloadFraction = rocketPayloadMass / initialMass
  // this.propellantConsumed = initialStage1PropellantMass - rocketStage1PropellantMass + initialStage2PropellantMass - rocketStage2PropellantMass
  // this.payloadPlusRemainingPropellant = rocketPayloadMass + rocketStage2PropellantMass - rocketStage2RecoveryPropellantMass

  if (verbose) {
    console.log('Propellant Flow Rate', propellantFlowRate, dParamWithUnits['launchVehiclePropellantMassFlowRate'].value )

    // Let's assume that the remaining propellant is considered to be payload mass
    console.log('Stage 1 Dry Mass', Math.round(rocketStage1DryMass))
    console.log('Stage 2 Dry Mass', Math.round(rocketStage2DryMass))
    console.log('Payload Mass', Math.round(rocketPayloadMass))
    console.log('Stage 1 Recovery Propellant Mass', Math.round(rocketStage1RecoveryPropellantMass))
    console.log('Stage 2 Recovery Propellant Mass', Math.round(rocketStage2RecoveryPropellantMass))
    console.log('Initial Mass', Math.round(initialMass))
    console.log('Payload + Remaining Propellant', Math.round(this.payloadPlusRemainingPropellant))
    console.log('Mass Fraction', Math.round(1000 * this.massFraction)/1000)
    console.log('Payload Fraction', Math.round(1000 * this.payloadFraction)/1000)
    console.log('Rocket Total Delta-V', Math.round(rocketTotalDeltaV))
    
  }

  const rootMeanSquaredErrorSpeed = tram.diffTwoCurves(empiricalData.starshipSpeed, airSpeedVersusTimeData, speedMaxTime)
  const rootMeanSquaredErrorAlt = tram.diffTwoCurves(empiricalData.starshipAltitude, altitudeVersusTimeData, altMaxTime)

  return {
    freeFlightConversionCurveControlPoints,
    freeFlightPositionCurveControlPoints,
    freeFlightOrientationCurveControlPoints,
    freeFlightTelemetryCurveControlPoints,
    altitudeVersusTimeData,
    airPressureVersusTimeData,
    downrangeDistanceVersusTimeData,
    airSpeedVersusTimeData,
    forwardAccelerationVersusTimeData,
    upwardAccelerationVersusTimeData,
    aerodynamicDragVersusTimeData,
    propellantMassFlowRateVersusTimeData,
    convectiveHeatingVersusTimeData,
    radiativeHeatingVersusTimeData,
    deltaVVersusTimeData,
    orientationCorrectionVersusTimeData,
    totalMassVersusTimeData,
    boosterCH4MassVersusTimeData,
    boosterLOXMassVersusTimeData,
    shipCH4MassVersusTimeData,
    shipLOXMassVersusTimeData,
    apogeeAltitudeVersusTimeData,
    perigeeAltitudeVersusTimeData,
    closeApsisVersusTimeData,
    farApsisVersusTimeData,
    rootMeanSquaredErrorSpeed,
    rootMeanSquaredErrorAlt,
    angularMomentumVectorVersusTimeData,
    eccentricityVersusTimeData,
    rightAscensionOfAscendingNodeVersusTimeData,
    inclinationVersusTimeData,
    argumentOfPerigeeVersusTimeData,
    trueAnomalyVersusTimeData,
    semimajorAxisVersusTimeData,
    predictedAltitudeVersusTime,
    mecoTime
  }

  function optimizeOrientation(
    minAngle,
    maxAngle,
    targetDistance,
    RV,
    dragVector,
    thrust,
    mTotal,
    tStep,
    rotationAxis,
    RV_from_R0V0Aandt,
    tolerance = 1e-6,
    maxIterations = 50
  ) {
    let left = minAngle
    let right = maxAngle
    let bestAngle = (left + right) / 2
    let bestCost = Infinity
  
    for (let iter = 0; iter < maxIterations; iter++) {
      let midAngle = (left + right) / 2
      let midCost = evaluateOrientation(midAngle)
  
      let leftAngle = midAngle - tolerance
      let rightAngle = midAngle + tolerance
  
      let leftCost = evaluateOrientation(leftAngle)
      let rightCost = evaluateOrientation(rightAngle)
  
      if (midCost < bestCost) {
        bestCost = midCost
        bestAngle = midAngle
      }
      
      // Adjust search range
      if (leftCost < rightCost) {
        right = midAngle
      } else {
        left = midAngle
      }
  
      // Stop if search range is too small
      if (Math.abs(right - left) < tolerance) break
    }
    
    //console.log("Distance Error: ", bestCost)

    return bestAngle
  
    // Function to evaluate cost given an angle
    function evaluateOrientation(orientationCorrectionAngle) {
      let vehicleOrientation = RV.V.clone().normalize().applyAxisAngle(rotationAxis, orientationCorrectionAngle)
  
      const thrustVector = vehicleOrientation.clone().multiplyScalar(thrust)
      const combinedForceVector = dragVector.clone().add(thrustVector)
      const acceleration = combinedForceVector.clone().divideScalar(mTotal)
  
      const experimentalRV = RV_from_R0V0Aandt(RV.R, RV.V, acceleration, tStep)
      const distanceError = Math.abs(experimentalRV.R.length() - targetDistance)
  
      return distanceError
    }
  }

  function optimizeOrientation2(
    minAngle,
    maxAngle,
    RV,
    dragVector,
    thrust,
    mTotal,
    tStep,
    rotationAxis,
    targetCloseApsis,
    targetFarApsis
  ){
    const maxIterations = 10
    const tolerance = 1e-6
    const currentCOE = orbitalElementsFromStateVector(RV.R, RV.V)
    const [currentCloseApsis, currentFarApsis] = calculateNextTwoApsides(currentCOE)
    const currentCloseApsisError = Math.abs(currentCloseApsis - targetCloseApsis)
    const currentFarApsisError = Math.abs(currentFarApsis - targetFarApsis)

    // Search for the most optimal orientationCorrectionAngle
    let left = minAngle
    let right = maxAngle
    let bestAngle = (left + right) / 2
    let bestCost = Infinity
  
    for (let iter = 0; iter < maxIterations; iter++) {
      let midAngle = (left + right) / 2
      let midCost = determineOptimality(midAngle)
  
      let leftAngle = midAngle - tolerance
      let rightAngle = midAngle + tolerance
  
      let leftCost = determineOptimality(leftAngle)
      let rightCost = determineOptimality(rightAngle)
  
      if (midCost < bestCost) {
        bestCost = midCost
        bestAngle = midAngle
      }
      
      // Adjust search range
      if (leftCost < rightCost) {
        right = midAngle
      } else {
        left = midAngle
      }
  
      // Stop if search range is too small
      if (Math.abs(right - left) < tolerance) break
    }
    
    //console.log("Distance Error: ", bestCost)

    return bestAngle
  
    function determineOptimality(orientationCorrectionAngle) {
      const experimentalRV = generateNextRV(orientationCorrectionAngle)
      const experimentalCOE = orbitalElementsFromStateVector(experimentalRV.R, experimentalRV.V)
      const experimentalApogee = experimentalCOE.semimajorAxis * (1 + experimentalCOE.eccentricity)
      const tTotal = 500
      const targetPerigeeAltitude = 148000
      const targetApogee = planetRadius + Math.pow(t/tTotal, 0.5) * targetPerigeeAltitude
      const closeApsisError = Math.abs(targetApogee - experimentalApogee)
      return closeApsisError
    }

    // Function to evaluate cost given an angle
    function generateNextRV(orientationCorrectionAngle) {
      let vehicleOrientation = RV.V.clone().normalize().applyAxisAngle(rotationAxis, orientationCorrectionAngle)
  
      const thrustVector = vehicleOrientation.clone().multiplyScalar(thrust)
      const combinedForceVector = dragVector.clone().add(thrustVector)
      const acceleration = combinedForceVector.clone().divideScalar(mTotal)
  
      const experimentalRV = RV_from_R0V0Aandt(RV.R, RV.V, acceleration, tStep)
      return experimentalRV
    }

  }

  function interpolatePoint(points, t) {
    if (!Array.isArray(points) || points.length < 2) return null
  
    // Find two closest points that bound t
    let lower = null
    let upper = null
  
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      if (p1.x <= t && p2.x >= t) {
        lower = p1
        upper = p2
        break
      }
    }
  
    if (!lower || !upper) {
      // t is outside the range — clamp to the closest point
      if (t < points[0].x) return points[0]
      if (t > points[points.length - 1].x) return points[points.length - 1]
    }
  
    // Interpolate between lower and upper
    const alpha = (t - lower.x) / (upper.x - lower.x)
    const interpolatedPoint = new THREE.Vector3().lerpVectors(lower, upper, alpha)
  
    return interpolatedPoint
  }
  
  function calculateNextTwoApsides(COE) {
    // Compute the flight path angle (γ)
    const nu = COE.trueAnomaly
    const e = COE.eccentricity
    const a = COE.semimajorAxis
    const gamma = Math.atan((e * Math.sin(nu)) / (1 + e * Math.cos(nu)))
    // Calculate the first and second apsis of the orbit
    let closeApsis, farApsis
    if (gamma>0) {
      closeApsis = a * (1 + e)
      farApsis = a * (1 - e)
    }
    else {
      closeApsis = a * (1 - e)
      farApsis = a * (1 + e)
    }
    return [closeApsis, farApsis]
  }

  function computeApsisPositions(coe) {
    const { semimajorAxis: a, eccentricity: e, inclination: i, 
            rightAscensionOfTheAscendingNode: RA, argumentOfPerigee: w } = coe
  
    // Compute periapsis and apoapsis distances
    const rPeriapsis = a * (1 - e)
    const rApoapsis = a * (1 + e)
  
    // Predefine orbital plane positions (no need for cos/sin calculations)
    const periapsisOrbital = new THREE.Vector3(rPeriapsis, 0, 0)
    const apoapsisOrbital = new THREE.Vector3(-rApoapsis, 0, 0)
  
    // Compute rotation matrix for full transformation (3-1-3 sequence)
    const rotationMatrix = computeRotationMatrix(RA, i, w)
  
    // Apply rotation to transform into inertial space
    const periapsisInertial = applyMatrixToVector(rotationMatrix, periapsisOrbital)
    const apoapsisInertial = applyMatrixToVector(rotationMatrix, apoapsisOrbital)
  
    return { periapsisInertial, apoapsisInertial }
  }
  
  // Function to determine closest and farthest apsis
  function findCloseAndFarApsis(coe, R, scene = null, verbose = false) {
    // Compute apsis positions
    const { periapsisInertial, apoapsisInertial } = computeApsisPositions(coe)
  
    // Compute distances to R
    const distToPeriapsis = periapsisInertial.distanceTo(R)
    const distToApoapsis = apoapsisInertial.distanceTo(R)
    if (verbose) {
      // Add a shere to the scene to visualize the apsides
      // const marker = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 0.01, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ff00 }))
      // marker.position.copy(periapsisInertial)
      // scene.add(marker.clone())
      // marker.material.color.setHex(0xff0000)
      // marker.position.copy(apoapsisInertial)
      // scene.add(marker)
      // scene.add(new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 })).position.copy(periapsisInertial))
      // scene.add(new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x0000ff })).position.copy(apoapsisInertial))
      const apoapsis = coe.semimajorAxis * (1 + coe.eccentricity)
      const periapsis = coe.semimajorAxis * (1 - coe.eccentricity)
      //console.log('distToPeriapsis', Math.round(distToPeriapsis), 'distToApoapsis', Math.round(distToApoapsis), Math.round(apoapsis), Math.round(periapsis), (distToPeriapsis < distToApoapsis)?"P":"A")
    }
  
    // Determine closest apsis
    if (distToPeriapsis < distToApoapsis) {
      return [periapsisInertial, apoapsisInertial]
    }
    else {
      return [apoapsisInertial, periapsisInertial]
    }
  }
  
  // Compute 3-1-3 Rotation Matrix (Ω, i, ω)
  function computeRotationMatrix(RA, i, w) {
    const cosRA = Math.cos(RA), sinRA = Math.sin(RA)
    const cosI = Math.cos(i), sinI = Math.sin(i)
    const cosW = Math.cos(w), sinW = Math.sin(w)
  
    return [
      [
        cosRA * cosW - sinRA * sinW * cosI,
        -cosRA * sinW - sinRA * cosW * cosI,
        sinRA * sinI
      ],
      [
        sinRA * cosW + cosRA * sinW * cosI,
        -sinRA * sinW + cosRA * cosW * cosI,
        -cosRA * sinI
      ],
      [
        sinW * sinI,
        cosW * sinI,
        cosI
      ]
    ]
  }
  
  // Apply 3x3 Matrix to a 3D Vector
  function applyMatrixToVector(matrix, vector) {
    const x = matrix[0][0] * vector.x + matrix[0][1] * vector.y + matrix[0][2] * vector.z
    const y = matrix[1][0] * vector.x + matrix[1][1] * vector.y + matrix[1][2] * vector.z
    const z = matrix[2][0] * vector.x + matrix[2][1] * vector.y + matrix[2][2] * vector.z
    return new THREE.Vector3(x, y, z)
  }  
  
}