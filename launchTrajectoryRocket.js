import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves.js'
import * as tram from './tram.js'
import { simRocketFlight } from './simRocketFlight.js'

export function defineUpdateTrajectoryCurvesRocket () {
  return function (dParamWithUnits, planetSpec) {

    // console.print: console.log without filename/line number
    console.print = function (...args) {
      queueMicrotask (console.log.bind (console, ...args));
    }
  
    const lat = dParamWithUnits['rocketLaunchPadLatitude'].value
    const lon = dParamWithUnits['rocketLaunchPadLongitude'].value
    let rocketRadius = dParamWithUnits['rocketRadius'].value
    let rocketEffectiveRadius = dParamWithUnits['rocketEffectiveRadius'].value  // Used for shock heating calculations
    let rocketStage1BodyLength = dParamWithUnits['rocketStage1BodyLength'].value
    let rocketStage2BodyLength = dParamWithUnits['rocketStage2BodyLength'].value
    let rocketNoseConeLength = dParamWithUnits['rocketNoseConeLength'].value
    let rocketDesiredOrbitalAltitude = dParamWithUnits['rocketDesiredOrbitalAltitude'].value
    let rocketStage1DryMass = dParamWithUnits['rocketStage1DryMass'].value
    let rocketStage2DryMass = dParamWithUnits['rocketStage2DryMass'].value
    let initialStage1PropellantMass = dParamWithUnits['rocketStage1PropellantMass'].value
    let initialStage2PropellantMass = dParamWithUnits['rocketStage2PropellantMass'].value
    let rocketStage1RecoveryPropellantMass = dParamWithUnits['rocketStage1RecoveryPropellantMass'].value
    let rocketStage2RecoveryPropellantMass = dParamWithUnits['rocketStage2RecoveryPropellantMass'].value
    let rocketPayloadMass = dParamWithUnits['rocketPayloadMass'].value
    let rocketStage1StructuralLoadLimit = dParamWithUnits['rocketStage1StructuralLoadLimit'].value
    let rocketStage2StructuralLoadLimit = dParamWithUnits['rocketStage2StructuralLoadLimit'].value
    let rocketStage2MaxAcceleration = dParamWithUnits['rocketStage2MaxAcceleration'].value
    let rocketExhaustVelocityVacEngInVac = dParamWithUnits['rocketExhaustVelocityVacEngInVac'].value
    let rocketExhaustVelocityVacEngAtSeaLevel = dParamWithUnits['rocketExhaustVelocityVacEngAtSeaLevel'].value
    let rocketExhaustVelocitySLEngInVac = dParamWithUnits['rocketExhaustVelocitySLEngInVac'].value
    let rocketExhaustVelocitySLEngAtSeaLevel = dParamWithUnits['rocketExhaustVelocitySLEngAtSeaLevel'].value
    let rocketVacuumEnginePropellantFlowRate = dParamWithUnits['rocketVacuumEnginePropellantFlowRate'].value
    let rocketSeaLevelEnginePropellantFlowRate = dParamWithUnits['rocketSeaLevelEnginePropellantFlowRate'].value
    let rocketStage1SeaLevelEngines = dParamWithUnits['rocketStage1SeaLevelEngines'].value
    let rocketStage1VacuumEngines = dParamWithUnits['rocketStage1VacuumEngines'].value
    let rocketStage2SeaLevelEngines = dParamWithUnits['rocketStage2SeaLevelEngines'].value
    let rocketStage2VacuumEngines = dParamWithUnits['rocketStage2VacuumEngines'].value
    let rocketSeaLevelEngineRadius = dParamWithUnits['rocketSeaLevelEngineRadius'].value
    let rocketVacuumEngineRadius = dParamWithUnits['rocketVacuumEngineRadius'].value
    let rocketCoefficientOfDrag = dParamWithUnits['rocketCoefficientOfDrag'].value
    let rocketSeparationDelay = dParamWithUnits['rocketSeparationDelay'].value
    let useCycloidFactor = 0.1 //dParamWithUnits['useCycloidFactor'].value
    let cycloidRadius = 200000*0.55 // 

    const rocketCoastTime = dParamWithUnits['rocketCoastTime'].value
    const launcherXyChartMaxT = dParamWithUnits['launcherXyChartMaxT'].value
    const verbose = dParamWithUnits['verboseLogging'].value

    let tStep = .25 // second

    // Hack
    let speedMaxTime = 480 // seconds (IFT8)
    let altMaxTime = 480 // seconds (IFT8)
 
    let RV
    let velocityDueToPlanetsRotation

    // Estimate the exhaust velocity of the SpaceX Raptor Engine
    const gamma = 1.20            // ratio of specific heats
    const Tc = 3600               // combustion temperature (K), typical methane/LOX
    const M = 0.020               // molar mass (kg/mol), typical for methane/LOX combustion products
    const Pc = 350*101325         // chamber pressure (Pa), 300 bar
    const PeSL = 1*101325           // exit pressure (Pa), 1 bar
    const PeVac = 0

    const engineParams = {
      targetThrust: 2200000,       // Desired thrust (N)
      Pc_max: 350 * 100000,    // Peak chamber pressure (Pa)
      Pe: 101325,       // Nozzle exit pressure (Pa)
      P0: 101325,       // Ambient pressure (Pa)
      Ae: Math.PI * rocketSeaLevelEngineRadius**2,          // Nozzle exit area (m^2)
      Tc: 3500,         // Chamber temperature (K)
      gamma: 1.22,      // Heat capacity ratio
      R: 8.314,         // Universal gas constant (J/(mol·K))
      M: 0.023,         // Molar mass of exhaust gas (kg/mol) (e.g., CH4/LOX)
      mdot_max: rocketSeaLevelEnginePropellantFlowRate,    // Peak mass flow rate (kg/s)
      ve_max: rocketExhaustVelocitySLEngAtSeaLevel,        // Peak exhaust velocity (m/s)
    }

    const ch4Fraction = 800/(800+2800)
    const loxFraction = 2800/(800+2800)

    // engineParams.P0 = 0
    // for (let mdot = 0; mdot <= engineParams.mdot_max; mdot += engineParams.mdot_max/64) {
    //   engineParams.mdot = mdot
    //   const {inertialThrust, pressureThrust, ve} = tram.calculateThrustAndExitVelocity(engineParams)
    //   console.print(mdot, inertialThrust, pressureThrust, ve)
    // }
    
    // const maxThrust = tram.calculateMaxThrust(engineParams)
    // console.log('Max Thrust', maxThrust)
    // for (let targetThrust = maxThrust; targetThrust >= 61413 ; targetThrust -= maxThrust/64) {
    //   engineParams.targetThrust = targetThrust
    //   engineParams.P0 = 0
    //   const flowRate1 = tram.solveForMassFlowRate(engineParams)
    //   engineParams.P0 = 101325
    //   const flowRate2 = tram.solveForMassFlowRate(engineParams)
    //   console.print(targetThrust, flowRate1, flowRate2)
    // }

    const spacexRaptorIdealExhaustVelocitySLEng = tram.exhaustVelocity(gamma, Tc, M, Pc, PeSL)
    const spacexRaptorIdealExhaustVelocityVacEng = tram.exhaustVelocity(gamma, Tc, M, Pc, PeVac)

    console.log(`Raptor ideal exhaust velocity at sea level: ${spacexRaptorIdealExhaustVelocitySLEng.toFixed(2)} m/s ${(spacexRaptorIdealExhaustVelocitySLEng/9.8).toFixed(2)} s`);
    console.log(`Raptor ideal exhaust velocity in vacuum: ${spacexRaptorIdealExhaustVelocityVacEng.toFixed(2)} m/s ${(spacexRaptorIdealExhaustVelocityVacEng/9.8).toFixed(2)} s`);
    
    const planetsRotationRateInHz = 1/planetSpec.lengthOfSiderealDay
    // Calculate the planet'a radius at the launch pad
    const seaLevelAtPad = tram.geodeticToECEF(lat, lon, 0, planetSpec.ellipsoid)
    const planetRadius = new THREE.Vector3(seaLevelAtPad.x, seaLevelAtPad.y, seaLevelAtPad.z).length()
    this.planetRadius = planetRadius

    const launchPadAltitude = dParamWithUnits['rocketLaunchPadAltitude'].value
    let launchPadLocation = tram.geodeticToECEF(lat, lon, launchPadAltitude, planetSpec.ellipsoid)
    const R0 = new THREE.Vector3(launchPadLocation.x, launchPadLocation.y, launchPadLocation.z)
    const V0 = new THREE.Vector3(0, 0, 0) // Rocket starts out at rest on the launch pad
    velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI * planetsRotationRateInHz, 0).cross(R0)
    const V0PlusPlanetRotation = V0.clone().add(velocityDueToPlanetsRotation)
    console.log('Velocity Due To Planet\'s Rotation', velocityDueToPlanetsRotation.length())
    RV = {R: R0, V: V0PlusPlanetRotation}

    this.launchTrajectoryWhiteMarker.position.copy(R0)  // For Debug

    const empiricalStarshipIFTAltitude = this.empiricalStarshipIFTAltitude
    const empiricalaltitudeRegressionData = this.empiricalaltitudeRegressionData
    const empiricalStarshipIFTSpeed = this.empiricalStarshipIFTSpeed
    const empiricalBoosterCH4Mass = this.empiricalBoosterCH4Mass
    const empiricalBoosterLOXMass = this.empiricalBoosterLOXMass
    const empiricalStarshipCH4Mass = this.empiricalStarshipCH4Mass
    const empiricalStarshipLOXMass = this.empiricalStarshipLOXMass
    const empericalBoosterOrientation = this.empericalBoosterOrientation
    const empericalStarshipOrientation = this.empericalStarshipOrientation
    const empiricalMECOTime = 154  // Value for IFT7

    const orbitalElementsFromStateVector = this.getOrbitalElementsFromStateVectorWrapper()
    const RV_from_R0V0Aandt = this.getRV_from_R0V0AandtWrapper()
    const empiricalData = this.empiricalData

    const simInputParamters = {
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
    }

    let simResults
    const autoTuneSimParams = false
    if (autoTuneSimParams) {
      const tunableParams = [
        //{ key: "rocketDesiredOrbitalAltitude", min: rocketDesiredOrbitalAltitude-100000, max: rocketDesiredOrbitalAltitude+100000 },
        // { key: "rocketStage1DryMass", min: rocketStage1DryMass*0.8, max: rocketStage1DryMass*1.25 },
        // { key: "rocketStage2DryMass", min: rocketStage2DryMass*0.8, max: rocketStage2DryMass*1.25 },
        //{ key: "rocketPayloadMass", min: rocketPayloadMass*0.8, max: rocketPayloadMass*1.25 },
        { key: "initialStage1PropellantMass", min: initialStage1PropellantMass*0.8, max: initialStage1PropellantMass*1.25 },
        // { key: "initialStage2PropellantMass", min: initialStage2PropellantMass*0.8, max: initialStage2PropellantMass*1.25 },
        //{ key: "rocketSeaLevelEnginePropellantFlowRate", min: rocketSeaLevelEnginePropellantFlowRate*0.8, max: rocketSeaLevelEnginePropellantFlowRate*1.25 },
        //{ key: "rocketVacuumEnginePropellantFlowRate", min: rocketVacuumEnginePropellantFlowRate*0.8, max: rocketVacuumEnginePropellantFlowRate*1.25 },
        // { key: "rocketExhaustVelocitySLEngInVac", min: rocketExhaustVelocitySLEngInVac*0.8, max: rocketExhaustVelocitySLEngInVac*1.25 },
        // { key: "rocketExhaustVelocitySLEngAtSeaLevel", min: rocketExhaustVelocitySLEngAtSeaLevel*0.8, max: rocketExhaustVelocitySLEngAtSeaLevel*1.25 },
        // { key: "rocketExhaustVelocityVacEngInVac", min: rocketExhaustVelocityVacEngInVac*0.8, max: rocketExhaustVelocityVacEngInVac*1.25 },
        // { key: "rocketExhaustVelocityVacEngAtSeaLevel", min: rocketExhaustVelocityVacEngAtSeaLevel*0.8, max: rocketExhaustVelocityVacEngAtSeaLevel*1.25 },
        // { key: "rocketCoefficientOfDrag", min: rocketCoefficientOfDrag*0.8, max: rocketCoefficientOfDrag*1.25 },
        // { key: "rocketStage1StructuralLoadLimit", min: rocketStage1StructuralLoadLimit*0.8, max: rocketStage1StructuralLoadLimit*1.25 },
        // { key: "rocketStage2StructuralLoadLimit", min: rocketStage2StructuralLoadLimit*0.8, max: rocketStage2StructuralLoadLimit*1.25 },
        // { key: "rocketStage1RecoveryPropellantMass", min: rocketStage1RecoveryPropellantMass*0.8, max: rocketStage1RecoveryPropellantMass*1.25 },
        // { key: "rocketStage2RecoveryPropellantMass", min: rocketStage2RecoveryPropellantMass*0.8, max: rocketStage2RecoveryPropellantMass*1.25 },
        //{ key: "rocketSeparationDelay", min: rocketSeparationDelay-2, max: rocketSeparationDelay+2 }
        //{ key: "useCycloidFactor", min: 0, max: .5 },
        //{ key: "cycloidRadius", min: 50000, max: 200000 }
      ]

      // Create a copy of the original tunable parameters
      const originalTunableParams = Object.fromEntries(
        tunableParams.map(({ key }) => [key, simInputParamters[key]])
      )

      console.log("Original Tunable Parameters:", originalTunableParams)

      function testFunction(simInputParamters) {
        const simResults = simRocketFlight(simInputParamters)
        //return simResults.rootMeanSquaredErrorSpeed + simResults.rootMeanSquaredErrorAlt + Math.abs(simResults.mecoTime-empiricalMECOTime)*40
        return simResults.rootMeanSquaredErrorAlt
        //return Math.abs(simResults.mecoTime-empiricalMECOTime)*10
      }

      const bestSimParams = tram.adamOptimize(testFunction, simInputParamters, tunableParams)
      
      simResults = simRocketFlight(bestSimParams)
      // Report the tuneable parameters versus the original parameters
      console.log("Optimization Values: ", simResults.rootMeanSquaredErrorSpeed, Math.abs(simResults.mecoTime-empiricalMECOTime)*10)
      const finalTunableParams = Object.fromEntries(
        tunableParams.map(({ key }) => [key, bestSimParams[key]])
      )
      tunableParams.forEach(({ key }) => {
        console.log(`${key}: ${originalTunableParams[key]} -> ${finalTunableParams[key]}`)
      })
      tunableParams.forEach(({ key }) => {
        console.print(`guidParamWithUnits['${key}'].value = ${finalTunableParams[key]}`)
      })
    }
    else {
      simResults = simRocketFlight(simInputParamters, this.scene)
    }

    // Expand simResults
    const {freeFlightConversionCurveControlPoints,
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

      angularMomentumVectorVersusTimeData,
      eccentricityVersusTimeData,
      rightAscensionOfAscendingNodeVersusTimeData,
      inclinationVersusTimeData,
      argumentOfPerigeeVersusTimeData,
      trueAnomalyVersusTimeData,
      semimajorAxisVersusTimeData,

      predictedAltitudeVersusTime,
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
      rootMeanSquaredErrorAlt} = simResults
  
    this.durationOfFreeFlight = rocketCoastTime
    //console.log('done')

    const freeFlightConversionCurve = new THREE.CatmullRomCurve3(freeFlightConversionCurveControlPoints)

    const freeFlighttToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      return t / ((freeFlightConversionCurveControlPoints.length-1) * tStep)
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

    // freeFlightPositionCurveControlPoints.forEach(point => {
    //   console.log('freeFlightPositionCurveControlPoints', point.length() - this.planetRadius)
    // })
    // Make a curve for the entire free flight portion of the launch trajectory starting from the end of the evacuated tube
    if (!this.freeFlightPositionCurve) {
      this.freeFlightPositionCurve = new CatmullRomSuperCurve3(freeFlightPositionCurveControlPoints)
      this.freeFlightPositionCurve.setAlwaysAwayNormalMode()

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

    if (dParamWithUnits['showForwardAccelerationVersusTime'].value) { 
      this.xyChart.removeCurve("Forward Acceleration")
      this.xyChart.addCurve("Forward Acceleration", "m/s2", "m/s2", forwardAccelerationVersusTimeData, (y)=>y*1, 0xff0000, "Bright Red", "Forward Acceleration (m/s2)")
    }
    
    if (dParamWithUnits['showUpwardAccelerationVersusTime'].value) {
      this.xyChart.removeCurve("Upward Acceleration")
      this.xyChart.addCurve("Upward Acceleration", "m/s2", "m/s2", upwardAccelerationVersusTimeData, (y)=>y*1, 0x00ff00, "Bright Green", "Upward Acceleration (m/s2)")
    }
    
    if (dParamWithUnits['showAltitudeVersusTime'].value)  {
      this.xyChart.removeCurve("Altitude")
      this.xyChart.addCurve("Altitude", "m", "km", altitudeVersusTimeData, (y)=>y*0.001, 0x80ff00, "Bright Lime", "Altitude (km)")
    }
    
    const airPressureAtSeaLevel = planetSpec.airPressureAtAltitude(0)
    if (dParamWithUnits['showAirPressureVersusTime'].value) {
      this.xyChart.removeCurve("Air Pressure")
      this.xyChart.addCurve("Air Pressure", "Pa", "% of Sea Level", airPressureVersusTimeData, (y)=>y*100/airPressureAtSeaLevel, 0xff8000, "Bright Orange", "Air Pressure (% of sea level)")
    }
    
    if (dParamWithUnits['showDownrangeDistanceVersusTime'].value) {
      this.xyChart.removeCurve("Downrange Distance")
      this.xyChart.addCurve("Downrange Distance", "m", "100's of km", downrangeDistanceVersusTimeData, (y)=>y*.00001, 0xff00ff, "Bright Magenta", "Downrange Distance (100's of km)")
    }
    
    if (dParamWithUnits['showAirSpeedVersusTime'].value) {
      this.xyChart.removeCurve("Air Speed")
      this.xyChart.addCurve("Air Speed", "m/s", "100's m/s", airSpeedVersusTimeData, (y)=>y*0.01, 0x00ffff, "Bright Cyan", "Air Speed (100's m/s)")
    }
    
    if (dParamWithUnits['showAerodynamicDragVersusTime'].value) {
      this.xyChart.removeCurve("Aerodynamic Drag")
      this.xyChart.addCurve("Aerodynamic Drag", "N", "100's of kN", aerodynamicDragVersusTimeData, (y)=>y*0.00001, 0xff00ff, "Bright Magenta", "Aerodynamic Drag (100's of kN)")
    }
    
    if (dParamWithUnits['showPropellantMassFlowRateVersusTime'].value) {
      this.xyChart.removeCurve("Propellant Mass Flow Rate")
      this.xyChart.addCurve("Propellant Mass Flow Rate", "kg/s", "1000's of kg/s", propellantMassFlowRateVersusTimeData, (y)=>y*0.001, 0x00ff80, "Bright Teal", "Propellant Mass Flow Rate (1000's of kg/s)")
    }
    
    if (dParamWithUnits['showTotalMassVersusTime'].value) {
      this.xyChart.removeCurve("Vehicle Mass")
      this.xyChart.addCurve("Vehicle Mass", "kg", "100000's of kg", totalMassVersusTimeData, (y)=>y*1e-5, 0xff007f, "Bright Pink", "Vehicle Mass (100000's of kg)")
    }

    if (dParamWithUnits['showBoosterCH4MassVersusTime'].value) {
      this.xyChart.removeCurve("Booster CH4 Mass")
      this.xyChart.addCurve("Booster CH4 Mass", "kg", "1000's of kg", boosterCH4MassVersusTimeData, (y)=>y*0.00005, 0x00ff80, "Bright Teal", "Booster CH4 Mass (20000's of kg)")
    }

    if (dParamWithUnits['showBoosterLOXMassVersusTime'].value) {
      this.xyChart.removeCurve("Booster LOX Mass")
      this.xyChart.addCurve("Booster LOX Mass", "kg", "1000's of kg", boosterLOXMassVersusTimeData, (y)=>y*0.00005, 0xff007f, "Bright Pink", "Booster LOX Mass (20000's of kg)")
    }

    if (dParamWithUnits['showShipCH4MassVersusTime'].value) {
      this.xyChart.removeCurve("Ship CH4 Mass")
      this.xyChart.addCurve("Ship CH4 Mass", "kg", "1000's of kg", shipCH4MassVersusTimeData, (y)=>y*0.00005, 0x00ff80, "Bright Teal", "Ship CH4 Mass (20000's of kg)")
    }

    if (dParamWithUnits['showShipLOXMassVersusTime'].value) {
      this.xyChart.removeCurve("Ship LOX Mass")
      this.xyChart.addCurve("Ship LOX Mass", "kg", "1000's of kg", shipLOXMassVersusTimeData, (y)=>y*0.00005, 0xff007f, "Bright Pink", "Ship LOX Mass (20000's of kg)")
    }
    
    if (dParamWithUnits['showApogeeAltitudeVersusTime'].value) {
      this.xyChart.removeCurve("Orbital Apogee Altitude")
      this.xyChart.addCurve("Orbital Apogee Altitude", "m", "100's km", apogeeAltitudeVersusTimeData, (y)=>y*5e-4, 0x0000ff, "Bright Blue", "Orbital Apogee Distance (100's km)")
    }
    
    if (dParamWithUnits['showPerigeeAltitudeVersusTime'].value) {
      this.xyChart.removeCurve("Orbital Perigee Distance")
      this.xyChart.addCurve("Orbital Perigee Distance", "m", "100's km", perigeeAltitudeVersusTimeData, (y)=>y*1e-5, 0xffc000, "Bright Golden", "Orbital Perigee Distance (100's km)")
    }

    if (dParamWithUnits['showCloseApsisVersusTime'].value) {
      this.xyChart.removeCurve("Close Apsis")
      this.xyChart.addCurve("Close Apsis", "m", "100's km", closeApsisVersusTimeData, (y)=>y*1e-5, 0x0000ff, "Bright Blue", "Close Apsis (100's km)")
    }
    
    if (dParamWithUnits['showFarApsisVersusTime'].value) {
      this.xyChart.removeCurve("Far Apsis")
      this.xyChart.addCurve("Far Apsis", "m", "100's km", farApsisVersusTimeData, (y)=>y*1e-5, 0xffc000, "Bright Golden", "Far Apsis (100's km)")
    }

    if (dParamWithUnits['showOrbitalAltitudeVersusTime'].value) {
      const a = planetRadius + rocketDesiredOrbitalAltitude
      const orbitalAltitudeData = [new THREE.Vector3(0, a, 0), new THREE.Vector3(700, a, 0)]
      this.xyChart.removeCurve("Orbital Altitude")
      this.xyChart.addCurve("Orbital Altitude", "m", "100's km", orbitalAltitudeData, (y)=>y*1e-5, tram.tab10Colors[3].hex, tram.tab10Colors[3].name, "Orbital Altitude (100's of km)")
    }
    
    //if (dParamWithUnits['showConvectiveHeatingVersusTime'].value) {
    //  this.xyChart.removeCurve("Convective Heating")
    //  this.xyChart.addCurve("Convective Heating", "W/m2", "W/m2", convectiveHeatingVersusTimeData, (y)=>y*1, 0xffff7f, "Bright Light Yellow", "Convective Heating (W/m2)")
    // }
    
    //if (dParamWithUnits['showRadiativeHeatingVersusTime'].value) {
    //  this.xyChart.removeCurve("Convective Heating")
    //  this.xyChart.addCurve("Radiative Heating", "W/m2", "W/m2", radiativeHeatingVersusTimeData, (y)=>y*1, 0xffc080, "Bright Light Orange", "Radiative Heating (W/m2)")
    // }

    if (dParamWithUnits['showDeltaVVersusTime'].value) {
      this.xyChart.removeCurve("Delta-V")
      this.xyChart.addCurve("Delta-V", "m/s", "100's m/s", deltaVVersusTimeData, (y)=>y*0.01, 0xff00ff, "Bright Magenta", "Delta-V (100's m/s)")
    }

    if (dParamWithUnits['showOrientationCorrectionVersusTime'].value) {
      this.xyChart.removeCurve("Orientation Correction")
      this.xyChart.addCurve("Orientation Correction", "rad", "rad", orientationCorrectionVersusTimeData, (y)=>y*1, 0x0000ff, "Bright Blue", "Orientation Correction (rad)")
    }

    if (dParamWithUnits['showAngularMomentumVectorVersusTime'].value) {
      this.xyChart.removeCurve("Angular Momentum Vector")
      this.xyChart.addCurve("Angular Momentum Vector", "km2/s", "1000's km2/s", angularMomentumVectorVersusTimeData, (y)=>y*1e-6, 0xff00ff, "Bright Magenta", "Angular Momentum Vector (1000's km2/s)")
    }

    if (dParamWithUnits['showEccentricityVersusTime'].value) {
      this.xyChart.removeCurve("Eccentricity")
      this.xyChart.addCurve("Eccentricity", "", "", eccentricityVersusTimeData, (y)=>y*100, 0xff0000, "Bright Red", "Eccentricity")
    }

    if (dParamWithUnits['showRightAscensionOfAscendingNodeVersusTime'].value) {
      this.xyChart.removeCurve("Right Ascension Of Ascending Node")
      this.xyChart.addCurve("Right Ascension Of Ascending Node", "rad", "rad", simResults.rightAscensionOfAscendingNodeVersusTimeData, (y)=>y*1, 0x00ff00, "Bright Green", "Right Ascension Of Ascending Node (rad)")
    }

    if (dParamWithUnits['showInclinationVersusTime'].value) {
      this.xyChart.removeCurve("Inclination")
      this.xyChart.addCurve("Inclination", "rad", "rad", inclinationVersusTimeData, (y)=>y*100, 0xff8000, "Bright Orange", "Inclination (rad)")
    }

    if (dParamWithUnits['showArgumentOfPerigeeVersusTime'].value) {
      this.xyChart.removeCurve("Argument Of Perigee")
      this.xyChart.addCurve("Argument Of Perigee", "rad", "rad", argumentOfPerigeeVersusTimeData, (y)=>y*1000, 0x00ff00, "Bright Green", "Argument Of Perigee (rad)")
    }

    if (dParamWithUnits['showTrueAnomalyVersusTime'].value) {
      this.xyChart.removeCurve("True Anomaly")
      this.xyChart.addCurve("True Anomaly", "rad", "rad", trueAnomalyVersusTimeData, (y)=>y*10, 0xffc000, "Bright Golden", "True Anomaly (rad)")
    }

    if (dParamWithUnits['showSemimajorAxisVersusTime'].value) {
      this.xyChart.removeCurve("Semimajor Axis")
      this.xyChart.addCurve("Semimajor Axis", "m", "m", semimajorAxisVersusTimeData, (y)=>y*1e-5, 0x00ff00, "Bright Green", "Semimajor Axis (m)")
    }

    if (dParamWithUnits['showPredictedAltitudeVersusTime'].value) {
      this.xyChart.removeCurve("Predicted Altitude")
      this.xyChart.addCurve("Predicted Altitude", "m", "km", predictedAltitudeVersusTime, (y)=>y*0.001, 0xff8000, "Bright Orange", "Predicted Altitude (km)")
    }
    
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

    }

  }
}
