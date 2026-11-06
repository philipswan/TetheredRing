import { specificForceAt, capsuleLoad } from './crewAcceleration.js'
import { quaternionFromFrame } from '../curves/SuperCurve.js'
import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from '../curves/SuperCurves.js'
import { CircleSuperCurve3 } from '../curves/SuperCurves.js'
import * as kmlutils from '../export/kmlutils.js'
import * as tram from '../utils/tram.js'
import { myFormat } from '../utils/tram.js'
import { designRamp, interpolateSamples } from './rampMotion.js'
import { RampSuperCurve3 } from '../curves/RampSuperCurve3.js'
import { arrow } from '../ring/markers.js'
import { exitAirlockDistanceFromTubeExit } from './EngineeringDetails.js'
import { launchSledFrontReach } from './LaunchSled.js'
import { brakingProfile, jerkLimitedBrakingProfile } from './trackBraking.js'
import { faceHandoffEnvelope } from './grapplerFaceHandoff.js'
import { adaptiveNutFrontReach } from './AdaptiveNut.js'
import { print } from '../utils/print.js'

// The points of the CatmullRomSuperCurve3 `curve` up to `fraction` of its length: its control points before
// there (none very close to it), then the point there.
export function curvePointsUpTo(curve, fraction) {
  const points = curve.points
  const endT = curve.getUtoTmapping(fraction)
  const result = points.filter((point, i) => endT * (points.length - 1) - i > 0.25)
  result.push(curve.getPoint(endT))
  if (result.length < 2) result.unshift(points[0].clone())
  return result
}

export function defineTrajectoryCurvesParametersHaveChanged() {
  return function (dParamWithUnits, previousValues) {
    let changed = false;
    const paramsToCheck = [
      'launcherFeederRailLength',
      'launcherMassDriver1InitialVelocity',
      'launcherMassDriver2InitialVelocity',
      'launcherMassDriverExitVelocity',
      'launcherMassDriverAltitude',
      'launcherEvacuatedTubeExitAltitude',
      'launchVehicleMassDriverForwardAcceleration',
      'launchVehicleSeaLevelRocketExhaustVelocity',
      'launchVehicleVacuumRocketExhaustVelocity',
      'launchVehicleDesiredOrbitalAltitude',
      'launcherCoastTime',
      'launcherXyChartMaxT',
      'launchVehicleNoseConeTipRadius',
      'verboseLogging',
      'launcherMassDriverScrewRoughLength',
      'animateElevatedEvacuatedTubeDeployment',
      'launcherRampExitAltitude',
      'launchVehicleRampUpwardAcceleration',
      'launchVehicleAccelerationTransitionTime',
      'launcherMassDriverUpwardJerk',
      'adaptiveNutDecelerationJerk',
      'adaptiveNutStopClearance',
      'adaptiveNutBodyLength',
      'adaptiveNutGrapplerLength',
      'launchSledStopClearance',
      'launchSledForwardsOffset',
      'launchSledBodyLength',
      'launchSystemForwardScaleFactor',
      'launcherRampTurningRadius',
      'launcherRampEndLatitude',
      'launcherRampEndLongitude',
      'evacuatedTubeEntrancePositionAroundRing',
      'launcherLocationMode',
      'finalLocationRingCenterLatitude',
      'launchVehicleEmptyMass',
      'launchVehiclePayloadMass',
      'launchVehiclePropellantMass',
      'launchVehicleRadius',
      'launchVehicleBodyLength',
      'launchVehicleNoseconeLength',
      'launchVehicleAdaptiveThrust',
      'launchVehiclePropellantMassFlowRate',
      'launcherMaxEyesInAcceleration',
      'launcherMaxEyesOutAcceleration',
      'wholesaleCostOfElectricity',
      'launchVehicleCoefficientOfDrag',
      'evacuatedTubeInteriorPressure',
      'launcherRampDesignMode',
      'launcherMassDriverScrewBracketThickness',
      'launcherFeederRailLength',
      'launchSledMass',
      'launchTrajectorySelector',
      'showStarshipIFT6Telemetry',
    ]
    // The chart series toggles (show...VersusTime) also require the trajectory and chart to be recomputed
    Object.keys(dParamWithUnits).forEach(key => {
      if (key.startsWith('show') && key.endsWith('VersusTime')) paramsToCheck.push(key)
    })

    for (const param of paramsToCheck) {
      const newValue = dParamWithUnits[param]?.value
      if (previousValues.has(param)) {
        if (previousValues.get(param) !== newValue) {
          console.log(`Parameter "${param}" changed from ${previousValues.get(param)} to ${newValue}`);
          changed = true;
        }
      }
      else {
        changed = true
      }
      previousValues.set(param, newValue);
    }

    return changed;
  }
}

export function defineUpdateTrajectoryCurves () {
  return function (dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

    // LaunchTrajectoryUtils.updateLaunchTrajectory(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

    // The goal is to position the suspended portion of the evacuated launch tube under the tethered ring's tethers. The portion of the launch tube that contains the mass driver will be on the planet's surface.
    // Let's start by defining the sothern most point on the ring as the end of the mass driver. Then we can create a curve that initially follows the surface of the Earth and then, from the end of the mass driver,
    // follows a hyperbolic trajectory away from the planet.

    // ***************************************************************
    // Design the mass driver
    // ***************************************************************

    let forwardAcceleration
    let upwardAcceleration
    // Edge-case guards: the GUI allows 0 for these, which used to give infinite times/lengths and an
    // infinite loop (page hang). Velocities are kept positive and non-decreasing along the launcher.
    const launcherFeederRailLength = Math.max(0, dParamWithUnits['launcherFeederRailLength'].value)
    const launcherMassDriver1InitialVelocity = Math.max(1, dParamWithUnits['launcherMassDriver1InitialVelocity'].value)
    const launcherMassDriver2InitialVelocity = Math.max(launcherMassDriver1InitialVelocity, dParamWithUnits['launcherMassDriver2InitialVelocity'].value)
    const launcherMassDriverExitVelocity = Math.max(launcherMassDriver2InitialVelocity, dParamWithUnits['launcherMassDriverExitVelocity'].value)
    const launcherMassDriverAltitude = dParamWithUnits['launcherMassDriverAltitude'].value
    const launcherEvacuatedTubeExitAltitude = dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value
    // A (near) zero acceleration gives a mass driver longer than the planet's circumference, with millions of
    // screw segments (the page ran out of memory). Raise the acceleration so that mass drivers 1 + 2 are at
    // most maxMassDriverLength long; such parameter values are outside the model's meaningful range anyway.
    const maxMassDriverLength = 1e7 // m
    const minimumForwardAcceleration = Math.max(0.1, (Math.max(1, dParamWithUnits['launcherMassDriverExitVelocity'].value)**2 - Math.max(1, dParamWithUnits['launcherMassDriver1InitialVelocity'].value)**2) / (2 * maxMassDriverLength))
    const launchVehicleMassDriverForwardAcceleration = Math.max(minimumForwardAcceleration, dParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value)
    const launchVehicleSeaLevelRocketExhaustVelocity = dParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value
    const launchVehicleVacuumRocketExhaustVelocity = dParamWithUnits['launchVehicleVacuumRocketExhaustVelocity'].value
    const launchVehicleDesiredOrbitalAltitude = dParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value
    const launcherCoastTime = dParamWithUnits['launcherCoastTime'].value
    const launcherXyChartMaxT = dParamWithUnits['launcherXyChartMaxT'].value
    const launchVehicleNoseConeTipRadius = dParamWithUnits['launchVehicleNoseConeTipRadius'].value
    const evacuatedTubeInteriorPressure = dParamWithUnits['evacuatedTubeInteriorPressure'].value
    const verbose = dParamWithUnits['verboseLogging'].value

    forwardAcceleration = launchVehicleMassDriverForwardAcceleration
    // Values actually used after the edge-case clamps; the screw and nut models use these too (launcher.effectiveParams)
    this.effectiveForwardAcceleration = launchVehicleMassDriverForwardAcceleration
    this.effectiveMassDriver1InitialVelocity = launcherMassDriver1InitialVelocity
    // Use the ideal gas formula to calculate the density of the evacuated tube's interior gas.
    // Assume the gas is air at 20 degrees C and evacuatedTubeInteriorPressure Pa.
    const launchVehicleRadius = dParamWithUnits['launchVehicleRadius'].value
    const launchVehicleBodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    const launchVehicleNoseconeLength = dParamWithUnits['launchVehicleNoseconeLength'].value
    const launchVehicleCoefficientOfDrag = dParamWithUnits['launchVehicleCoefficientOfDrag'].value
    const temperatureK = 20 + 273.15 // K
    const R_air = 287.05
    const kConv = 1.83e-4  //W·s3·m-2·kg1/2
    const kRad = 2e-7 //W·s4·m-6·kg-1

    const evacuatedTubeInteriorGasDensity = evacuatedTubeInteriorPressure / (R_air * temperatureK) // kg/m3
    const launchVehicleCrossSectionalArea = Math.PI * (launchVehicleRadius**2) // m2
    const aerodnamicDragFactor = launchVehicleCoefficientOfDrag * evacuatedTubeInteriorGasDensity * launchVehicleCrossSectionalArea / 2
    this.energyLostToDragWhileInTube = 0
    this.energyLostToDragWhileInAtmosphere = 0
    
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
    const launcherMassDriverScrewBracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
    this.totalLengthOfLaunchSystem = launcherFeederRailLength + launcherMassDriver1Length + launcherMassDriver2Length
    this.animateElevatedEvacuatedTubeDeployment = dParamWithUnits['animateElevatedEvacuatedTubeDeployment'].value

    // ******************************************************************************************************************************
    // ******************************************************************************************************************************
    // Design the ramp. The ramp is positioned at the end of the mass driver to divert the vehicle's trajectory skwards.
    // ******************************************************************************************************************************
    // ******************************************************************************************************************************
    // Clamp the altitude of the ramp to be between the altitude of the launcher and the altitude of the main ring.
    const launcherRampExitAltitude = Math.max(launcherMassDriverAltitude, Math.min(dParamWithUnits['launcherRampExitAltitude'].value, launcherEvacuatedTubeExitAltitude))
    const launchVehicleRampUpwardAcceleration = dParamWithUnits['launchVehicleRampUpwardAcceleration'].value
    const lat = dParamWithUnits['launcherRampEndLatitude'].value
    const lon = dParamWithUnits['launcherRampEndLongitude'].value
    const rampStartECEF = tram.geodeticToECEF(lat, lon, launcherMassDriverAltitude, planetSpec.ellipsoid)
    const rampStartRadius = new THREE.Vector3(rampStartECEF.x, rampStartECEF.y, rampStartECEF.z).length()
    const rampOptions = {
      radius: rampStartRadius, exitRadius: rampStartRadius + launcherRampExitAltitude - launcherMassDriverAltitude,
      entrySpeed: launcherMassDriverExitVelocity, forwardAcceleration,
      upwardAcceleration: dParamWithUnits['launcherRampDesignMode'].value === 0 ? launchVehicleRampUpwardAcceleration
        : launcherMassDriverExitVelocity ** 2 / Math.max(1, dParamWithUnits['launcherRampTurningRadius'].value) + planetSpec.gravitationalParameter / rampStartRadius ** 2,
      transitionSeconds: dParamWithUnits['launchVehicleAccelerationTransitionTime'].value,
      upwardJerk: dParamWithUnits['launcherMassDriverUpwardJerk'].value,
      mu: planetSpec.gravitationalParameter,
    }
    let rampProfile = designRamp(rampOptions)
    let angleBAC = rampProfile.downrangeAngle
    let rampBaseLength = angleBAC * rampStartRadius
    this.upwardAngleAtEndOfRamp = rampProfile.exitAngle
    this.launcherRampLength = rampProfile.length
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
    //   print(launcherMassDriverExitVelocity, Math.round(apogeeDistance - this.planetRadius), Math.round(deltaVNeededToCircularizeOrbit), Math.round(m0Overmf * 100)/100)
    // }

    // Need a vector normal to planet's axis that points to the evacuated tube's entrance
    const planetAxisToEvacuatedTubeEntrancePosition = new THREE.Vector3(evacuatedTubeEntrancePosition.x, 0, evacuatedTubeEntrancePosition.z)

    this.speedFromPlanetsRotation = planetAxisToEvacuatedTubeEntrancePosition.length() * 2 * Math.PI / (planetSpec.lengthOfSiderealDay)
    // SIMPLIFICATION (not fixed): this is a rough calculation in an inertial 2-D frame. It assumes the launcher
    // points due east (planet rotation simply added to the along-track speed) and uses the inertial downrange angle.
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
    const acceleration = new THREE.Vector3(0, 0, 0)

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
      for (t = 0, timeOut = 0; (Math.abs(tStep)>0.0001) && (t<launcherCoastTime) && (timeOut<10000); t+=tStep, timeOut++) {
        RV = this.RV_from_R0V0Aandt(R0_2D, V0_2D, acceleration, t)
        if ((RV.R.length() < evacuatedTubeExitR) ^ (tStep>0)) {
          tStep = -tStep/2
        }
      }
      if (timeOut>=10000) {
        console.log('timeOut', timeOut)
      }
      evacuatedTubeDownrangeAngle = Math.atan2(RV.R.y, RV.R.x)  // This is the angle subtending the end of the ramp, center of the planet, and the end of the evacuated tube
      const altitudeAtEvacuatedTubeExit = RV.R.length() - this.planetRadius
      console.log('evacuatedTubeExitR', evacuatedTubeExitR - this.planetRadius)
      console.log('altitudeAtEvacuatedTubeExit', altitudeAtEvacuatedTubeExit)
    }
    else {
      t = 0
      evacuatedTubeDownrangeAngle = 0
    }
    //this.timeWithinEvacuatedTube = t
    if (t<0) {
      console.log('Error: t<0')
    }
    console.log('done')


    // ******************************************************************************************************************************
    // Next we need to place the start and end of the elevated evacuated tube at locations that are directly under the ring, 
    // so that it can be suspended underneath the tethered ring.
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
      // Convert this position into the planet's coordinate system, then move it to the tube-exit altitude
      // directly below the ring. (The old code scaled by (R+alt)/(R+alt) = 1, leaving it at ring altitude.)
      const exitOnRing = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(evacuatedTubeExitPositionInRingRefCoordSys.clone()))
      const exitGeodetic = tram.ecefToGeodetic(exitOnRing.x, exitOnRing.y, exitOnRing.z, planetSpec.ellipsoid)
      const exitECEF = tram.geodeticToECEF(exitGeodetic.lat, exitGeodetic.lon, launcherEvacuatedTubeExitAltitude, planetSpec.ellipsoid)
      evacuatedTubeExitPosition = new THREE.Vector3(exitECEF.x, exitECEF.y, exitECEF.z)
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

    // Solve siting with the full planetary rotation vector. Rigidly adjust the entry frame so the
    // slightly non-planar eased ramp still ends at the configured geodetic exit position.
    const planetaryOmega = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0)
    rampOptions.omega = this.axisOfRotation.dot(planetaryOmega)
    rampOptions.radius = this.planetRadius + launcherMassDriverAltitude
    rampOptions.exitRadius = evacuatedTubeEntrancePosition.length()
    const entryRadial = evacuatedTubeEntrancePosition.clone().normalize().applyAxisAngle(this.axisOfRotation, -rampProfile.downrangeAngle)
    for (let i = 0; i < 5; i++) {
      const entryTangent = new THREE.Vector3().crossVectors(this.axisOfRotation, entryRadial)
      rampOptions.rotation = [planetaryOmega.dot(entryRadial), planetaryOmega.dot(entryTangent), planetaryOmega.dot(this.axisOfRotation)]
      rampProfile = designRamp(rampOptions)
      const end = rampProfile.samples.at(-1)
      const endDirection = entryRadial.clone().multiplyScalar(end.px).addScaledVector(entryTangent, end.py).addScaledVector(this.axisOfRotation, end.pz).normalize()
      const correction = new THREE.Quaternion().setFromUnitVectors(endDirection, evacuatedTubeEntrancePosition.clone().normalize())
      entryRadial.applyQuaternion(correction)
      this.axisOfRotation.applyQuaternion(correction)
      if (correction.angleTo(new THREE.Quaternion()) < 1e-11) break
    }
    this.totalLengthOfLaunchSystem += rampProfile.length - this.launcherRampLength
    this.rampProfile = rampProfile
    this.launcherRampLength = rampProfile.length
    this.upwardAngleAtEndOfRamp = rampProfile.exitAngle
    angleBAC = rampProfile.downrangeAngle
    rampBaseLength = angleBAC * rampStartRadius

    // Calculate a vector that points to the exit of the mass driver (and the entrance to the ramp)
    const massDriver2ExitPosition = entryRadial.clone().multiplyScalar(rampOptions.radius)

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
    this.launchTrajectoryWhiteMarker.position.copy(feederRailEntrancePosition)
    this.launchTrajectoryWhiteMarker.position.copy(feederRailExitPosition)
    this.launchTrajectoryRedMarker.position.copy(massDriver1ExitPosition)
    this.launchTrajectoryGreenMarker.position.copy(massDriver2ExitPosition)
    this.launchTrajectoryBlueMarker.position.copy(evacuatedTubeEntrancePosition)
    this.launchTrajectoryOrangeMarker.position.copy(evacuatedTubeExitPosition)

    this.launchTrajectoryMarker5.position.copy(massDriver2ExitPosition)
    this.launchVehicleTimeWithinRamp = rampProfile.duration
    const launchVehicleTimeWithinRamp = rampProfile.duration
    const launchRampExitVelocity = rampProfile.exitSpeed
    specs['launchVehicleTimeWithinRamp'] = {value: rampProfile.duration, units: 's'}
    const detach = rampProfile.detach
    const nutFrontReach = adaptiveNutFrontReach(dParamWithUnits)
    const nutStopClearance = dParamWithUnits['adaptiveNutStopClearance'].value
    const nutStopDistance = rampProfile.length - detach.s - nutFrontReach - nutStopClearance
    if (!(nutStopDistance > 0)) throw new Error('The ramp has no braking distance left after allowing for the adaptive nut body and stop clearance.')
    const nutBraking = jerkLimitedBrakingProfile({
      initialSpeed: detach.v, stopDistance: nutStopDistance, jerk: dParamWithUnits['adaptiveNutDecelerationJerk'].value,
      radiusAt: s => rampProfile.atDistance(detach.s + s).r,
      mu: planetSpec.gravitationalParameter,
      rotationPotentialAt: s => {
        const a = rampProfile.atDistance(detach.s + s), w = rampOptions.rotation
        return -0.5 * ((w[1] * a.pz - w[2] * a.py) ** 2 + (w[2] * a.px - w[0] * a.pz) ** 2 + (w[0] * a.py - w[1] * a.px) ** 2)
      },
    })
    this.adaptiveNutDetachTime = detach.t
    this.adaptiveNutDetachDistance = detach.s
    this.adaptiveNutBrakingDeceleration = nutBraking.deceleration
    this.adaptiveNutBrakingProfile = nutBraking
    this.adaptiveNutRampStopDistance = detach.s + nutBraking.stopDistance
    this.adaptiveNutTubeClearance = rampProfile.length - this.adaptiveNutRampStopDistance - nutFrontReach
    this.adaptiveNutTimeWithinRamp = detach.t + nutBraking.duration
    const adaptiveNutRamptTodConvertor = t => t <= detach.t ? rampProfile.atTime(t).s : detach.s + nutBraking.tTod(t - detach.t)
    const adaptiveNutRamptTosConvertor = t => t <= detach.t ? rampProfile.atTime(t).v : nutBraking.tTos(t - detach.t)
    const adaptiveNutRamptToiConvertor = t => adaptiveNutRamptTodConvertor(t) / rampProfile.length
    // Serializable time law for screw workers and grapplers, continuous with the original horizontal helix.
    const horizontalLength = launcherMassDriver1Length + launcherMassDriver2Length
    const horizontalTime = this.timeWithinMassDriver1 + this.timeWithinMassDriver2
    const nutSamples = rampProfile.samples.filter(p => p.t <= detach.t).map(p => ({ t: horizontalTime + p.t, s: horizontalLength + p.s, v: p.v, a: p.vd }))
    for (const sample of nutBraking.samples.slice(1)) {
      nutSamples.push({ ...sample, t: horizontalTime + detach.t + sample.t, s: horizontalLength + detach.s + sample.s })
    }
    this.screwMotion = { samples: nutSamples, horizontalLength, horizontalTime, brakingStartDistance: horizontalLength + detach.s, brakingStartTime: horizontalTime + detach.t, duration: horizontalTime + this.adaptiveNutTimeWithinRamp,
      initialVelocity: launcherMassDriver1InitialVelocity, acceleration: forwardAcceleration }
    this.screwMotion.faceHandoff = faceHandoffEnvelope(rampProfile, nutBraking, horizontalTime, forwardAcceleration)
    this.screwMotion.brakingDeceleration = nutBraking.deceleration
    this.screwDriveEndDistance = horizontalLength + detach.s
    specs['adaptiveNutDetachTime'] = {value: horizontalTime + detach.t, units: 's'}
    specs['adaptiveNutDetachDistance'] = {value: this.screwDriveEndDistance, units: 'm'}
    specs['adaptiveNutRampBrakingAcceleration'] = {value: -nutBraking.deceleration, units: 'm/s2'}
    specs['adaptiveNutBrakingRampTime'] = {value: nutBraking.rampTime, units: 's'}
    specs['adaptiveNutBrakingHoldTime'] = {value: nutBraking.holdTime, units: 's'}
    specs['adaptiveNutBrakingDuration'] = {value: nutBraking.duration, units: 's'}
    specs['adaptiveNutTubeClearance'] = {value: this.adaptiveNutTubeClearance, units: 'm'}

    // ***************************************************************
    // Next we need to capture some curves and data sets for plotting
    // ***************************************************************

    const freeFlightPositionCurveControlPoints = []
    const freeFlightConversionCurveControlPoints = []
    const freeFlightOrientationCurveControlPoints = []
    const freeFlightTelemetryCurveControlPoints = []
    const freeFlightForces = []
    this.evacuatedTubeCurveControlPoints = [] // We need to need to keep these to animate the deployment of the elevated evacuated tube

    const altitudeVersusTimeData = []
    const airPressureVersusTimeData = []
    const airSpeedVersusTimeData = []
    const downrangeDistanceVersusTimeData = []
    const forwardAccelerationVersusTimeData = []
    const upwardAccelerationVersusTimeData = []
    const aerodynamicDragVersusTimeData = []
    const fuelMassFlowRateVersusTimeData = []
    const totalMassVersusTimeData = []
    const boosterCH4MassVersusTimeData = []
    const boosterLOXMassVersusTimeData = []
    const shipCH4MassVersusTimeData = []
    const shipLOXMassVersusTimeData = []
    const apogeeAltitudeVersusTimeData = []
    const perigeeAltitudeVersusTimeData = []
    const convectiveHeatingVersusTimeData = []
    const radiativeHeatingVersusTimeData = []
    const heatShieldTemperatureVersusTimeData = []

    const t0 = 0
    const t1 = t0 + this.timeWithinFeederRail
    const t2 = t1 + this.timeWithinMassDriver1
    const t3 = t2 + this.timeWithinMassDriver2
    const t4 = t3 + this.launchVehicleTimeWithinRamp

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

    const densityHeatShield = 1800  // kg/m3
    const specificHeatCapacityHeatShield = 710  // J/kg/K
    const thermalPenetrationDepthHeatShield = 0.002 // m
    let heatShieldTemperature = 100 // K - Assume that the heat shield is precooled by circulating liquid hydrogen through it before launch

    t = 0
    tStep = .25 // second

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
      return (launcherMassDriver1InitialVelocity * t) / launcherFeederRailLength
    }
    const feederRailCurvetTodConvertor = function (t) {
      return launcherMassDriver1InitialVelocity * t
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
    airPressureInPascals = evacuatedTubeInteriorPressure

    // The curves use are Earth-Centered-Earth-Fixed (ECEF) speeds and distances, not inertial frame speeds and distances
    for (t = t0; t < t1; t += tStep) {
      vehicleAirSpeed = this.feederRailCurve.tTos(t - t0)
      distanceTravelled = this.feederRailCurve.tTod(t - t0)
      const vehiclePosition = this.feederRailCurve.getPointAt(distanceTravelled/launcherFeederRailLength)
      // ToDo - Still need to calculate the aerodynamic drag from the adaptive nut and the launch sled.
      const aerodynamicDrag = aerodnamicDragFactor * vehicleAirSpeed**2
      const powerUsedToOvercomeAerodynamicDrag = aerodynamicDrag * vehicleAirSpeed
      this.energyLostToDragWhileInTube += powerUsedToOvercomeAerodynamicDrag * tStep
      if (t==0) {
        // This is used in main.js to warp the camera over to the location where the mass driver starts
        this.startOfMassDriver1Position = vehiclePosition.clone()
      }
      const qConv = tram.calculateQConv(vehicleAirSpeed, evacuatedTubeInteriorGasDensity, launchVehicleNoseConeTipRadius)
      const qRad = tram.calculateQRad(vehicleAirSpeed, evacuatedTubeInteriorGasDensity)
      if (t<=launcherXyChartMaxT) {
        altitudeVersusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressureVersusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        // Downrange distance in metres measured from the start of mass driver 1 (all segments use the same units)
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, distanceTravelled - launcherFeederRailLength, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0))
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        // totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qConv, 0))
        radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qRad, 0))
        heatShieldTemperatureVersusTimeData.push(new THREE.Vector3(t, heatShieldTemperature, 0))
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
      return (launcherMassDriver1InitialVelocity * t + 0.5 * launchVehicleMassDriverForwardAcceleration * t * t) / launcherMassDriver1Length  // v0*t + 1/2 at^2
    }
    const massDriver1tTosConvertor = function (t) {
      return launcherMassDriver1InitialVelocity + launchVehicleMassDriverForwardAcceleration * t
    }
    const massDriver1tTodConvertor = function (t) {
      return launcherMassDriver1InitialVelocity * t + 0.5 * launchVehicleMassDriverForwardAcceleration * t * t  // v0*t + 1/2 at^2
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
    airPressureInPascals = evacuatedTubeInteriorPressure

    for (t = t1; t < t2; t += tStep) {
      // These are curve speeds and distances, not absolute speeds and distances
      vehicleAirSpeed = this.massDriver1Curve.tTos(t - t1)
      distanceTravelled = this.massDriver1Curve.tTod(t - t1)
      const vehiclePosition = this.massDriver1Curve.getPointAt(distanceTravelled/launcherMassDriver1Length)
      // ToDo - Still need to calculate the aerodynamic drag from the adaptive nut and the launch sled.
      const aerodynamicDrag = aerodnamicDragFactor * vehicleAirSpeed**2
      const powerUsedToOvercomeAerodynamicDrag = aerodynamicDrag * vehicleAirSpeed
      this.energyLostToDragWhileInTube += powerUsedToOvercomeAerodynamicDrag * tStep
      const qConv = tram.calculateQConv(vehicleAirSpeed, evacuatedTubeInteriorGasDensity, launchVehicleNoseConeTipRadius)
      const qRad = tram.calculateQRad(vehicleAirSpeed, evacuatedTubeInteriorGasDensity)
      if (t<=launcherXyChartMaxT) {
        altitudeVersusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressureVersusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, distanceTravelled, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0))
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qConv, 0))
        radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qRad, 0))
        heatShieldTemperatureVersusTimeData.push(new THREE.Vector3(t, heatShieldTemperature, 0))
      }
    }
    //console.log('done')

    // ***************************************************************
    // Create the part of the trajectory where the vehicle is within the variable pitch screw mass driver near the planet's surface
    // ***************************************************************
    if (!this.massDriver2Curve) {
      this.massDriver2Curve = new CircleSuperCurve3(planetCenter, this.axisOfRotation, massDriver2ExitPosition, -launcherMassDriver2Length, false)
    }
    else {
      this.massDriver2Curve.update(planetCenter, this.axisOfRotation, massDriver2ExitPosition, -launcherMassDriver2Length, false)
    }

    const massDriver2tToiConvertor = function (t) {
      // Time to "interpolation distance" conversion
      return (launcherMassDriver2InitialVelocity * t + 0.5 * launchVehicleMassDriverForwardAcceleration * t * t) / launcherMassDriver2Length  // v0*t + 1/2 at^2
    }
    const massDriver2tTosConvertor = function (t) {
      return launcherMassDriver2InitialVelocity + launchVehicleMassDriverForwardAcceleration * t  // 1/2 at^2
    }
    const massDriver2tTodConvertor = function (t) {
      return launcherMassDriver2InitialVelocity * t + 0.5 * launchVehicleMassDriverForwardAcceleration * t * t  // v0*t + 1/2 at^2
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
    airPressureInPascals = evacuatedTubeInteriorPressure

    for (t = t2; t < t3; t += tStep) {
      // These are curve speeds and distances, not absolute speeds and distances
      vehicleAirSpeed = this.massDriver2Curve.tTos(t - t2, launcherMassDriver2InitialVelocity, forwardAcceleration)
      distanceTravelled = this.massDriver2Curve.tTod(t - t2, launcherMassDriver2InitialVelocity, forwardAcceleration)
      const vehiclePosition = this.massDriver2Curve.getPointAt(distanceTravelled/launcherMassDriver2Length)
      // ToDo - Still need to calculate the aerodynamic drag from the adaptive nut and the launch sled.
      const aerodynamicDrag = aerodnamicDragFactor * vehicleAirSpeed**2
      const powerUsedToOvercomeAerodynamicDrag = aerodynamicDrag * vehicleAirSpeed
      this.energyLostToDragWhileInTube += powerUsedToOvercomeAerodynamicDrag * tStep
      const qConv = tram.calculateQConv(vehicleAirSpeed, evacuatedTubeInteriorGasDensity, launchVehicleNoseConeTipRadius)
      const qRad = tram.calculateQRad(vehicleAirSpeed, evacuatedTubeInteriorGasDensity)
      if (t<=launcherXyChartMaxT) {
        altitudeVersusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressureVersusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, launcherMassDriver1Length + distanceTravelled, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0))
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qConv, 0))
        radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qRad, 0))
        heatShieldTemperatureVersusTimeData.push(new THREE.Vector3(t, heatShieldTemperature, 0))
      }
    }
    print('Speed at the end of horizontal acceleration:', vehicleAirSpeed, 'm/s')

    //console.log('done')

    // ***************************************************************
    // Create the part of the trajectory where the vehicle is traveling along the upward curving ramp
    // ***************************************************************
    this.launchRampCurve = [0, 1].map(index => {
      const curve = new RampSuperCurve3(rampProfile, massDriver2ExitPosition, this.axisOfRotation)
      if (index === 0) {
        curve.addtTodConvertor(adaptiveNutRamptTodConvertor)
        curve.addtTosConvertor(adaptiveNutRamptTosConvertor)
        curve.addtToiConvertor(adaptiveNutRamptToiConvertor)
        curve.setDuration(this.adaptiveNutTimeWithinRamp)
      }
      curve.name = 'launchRampCurve' + index
      return curve
    })

    forwardAcceleration = 0
    upwardAcceleration = launchVehicleRampUpwardAcceleration
    this.peakUpwardAcceleration = rampProfile.peakUpwardAcceleration

    //console.log('Creating upward curving ramp part of trajectory.')
    console.assert(t4<10000)
    for (t = t3; t<Math.min(t4, 10000); t+=tStep) {   // Hack - Min function added to prevent endless loop in case of bug
      const rampState = rampProfile.atTime(t - t3)
      forwardAcceleration = rampState.forward
      upwardAcceleration = rampState.upward
      vehicleAirSpeed = this.launchRampCurve[1].tTos(t - t3)
      distanceTravelled = this.launchRampCurve[1].tTod(t - t3)
      vehiclePosition = this.launchRampCurve[1].getPointAt(distanceTravelled / this.launcherRampLength)
      altitude = vehiclePosition.length() - this.planetRadius
      airPressureInPascals = evacuatedTubeInteriorPressure
      // ToDo - Still need to calculate the aerodynamic drag from the adaptive nut and the launch sled.
      const aerodynamicDrag = aerodnamicDragFactor * vehicleAirSpeed**2
      const powerUsedToOvercomeAerodynamicDrag = aerodynamicDrag * vehicleAirSpeed
      this.energyLostToDragWhileInTube += powerUsedToOvercomeAerodynamicDrag * tStep
      const downrangeAngle = massDriver2ExitPosition.angleTo(vehiclePosition)
      const downrangeDistance = launcherMassDriver1Length + launcherMassDriver2Length + downrangeAngle * (this.planetRadius + launcherMassDriverAltitude)
      const qConv = tram.calculateQConv(vehicleAirSpeed, evacuatedTubeInteriorGasDensity, launchVehicleNoseConeTipRadius)
      const qRad = tram.calculateQRad(vehicleAirSpeed, evacuatedTubeInteriorGasDensity)
      if (t<=launcherXyChartMaxT) {
        altitudeVersusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressureVersusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
        airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, upwardAcceleration, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0))
        fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
        convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qConv, 0))
        radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qRad, 0))
        heatShieldTemperatureVersusTimeData.push(new THREE.Vector3(t, heatShieldTemperature, 0))
      }
    }
    //console.log('done')
    this.launcherRampExitSpeed = launchRampExitVelocity

    //this.launchTrajectoryGreenMarker.position.copy(rampEngineeringParameters.rampEndPoint)
    const downrangeAngle = rampProfile.downrangeAngle
    const downrangeDistanceTravelledOnRamp = downrangeAngle * this.planetRadius
    distanceTravelled = this.launcherRampLength

    // ***************************************************************
    // Create the part of the trajectory where the vehicle coasts on an elliptical or hyperbolic trajectory within the evacuated tube
    // ***************************************************************
    this.launcherElevatedEvacuatedTubeLength = 0

    // const R0 = evacuatedTubeEntrancePosition.clone()
    const R0 = this.launchRampCurve[1].getPointAt(1)
    const velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0).cross(R0)
    const V0 = this.launchRampCurve[1].getTangentAt(1).multiplyScalar(launchRampExitVelocity)
    const V0PlusPlanetRotation = V0.clone().add(velocityDueToPlanetsRotation)
    //console.log('Launch Velocity', V0, 'Velocity Due To Planet\'s Rotation', velocityDueToPlanetsRotation, 'Sum', V0PlusPlanetRotation)
    
    // Compute the time to reach the end of the elevated evacuated tube based on the vehicle's initial position and velocity
    if (R0.length() < evacuatedTubeExitR) {
      let tStep = 0.1
      for (t = 0, timeOut = 0; (Math.abs(tStep)>0.0001) && (t<launcherCoastTime) && (timeOut<10000); t+=tStep, timeOut++) {
        RV = this.RV_from_R0V0Aandt(R0, V0PlusPlanetRotation, acceleration, t)
        if ((RV.R.length() < evacuatedTubeExitR) ^ (tStep>0)) {
          tStep = -tStep/2
        }
      }
      if (timeOut>=10000) {
        console.log('timeOut', timeOut)
      }
      // Angle subtending the end of the ramp, the centre of the planet and the end of the evacuated tube.
      // R is 3-D here (Y is the polar axis), so use the angle between the vectors, not atan2(y, x).
      evacuatedTubeDownrangeAngle = R0.angleTo(RV.R)
    }
    else {
      t = 0
      evacuatedTubeDownrangeAngle = 0
    }
    this.timeWithinEvacuatedTube = t
    if (t<0) {
      console.log('Error: t<0')
    }

    const t5a = t4 + this.timeWithinEvacuatedTube
    const t6a = t5a + launcherCoastTime

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
    const semimajorAxis = g_earth / (g_earth * 2 / (r_earth+launcherMassDriverAltitude) - launchVehiclePerigeeSpeed**2)  // vis-viva: a = mu / (2 mu / r - v^2)
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
        RV = this.RV_from_R0V0Aandt(R0, V0PlusPlanetRotation, acceleration, t6a)
        // Calculate the vehicle's position relative to where R0 and V0PlusPlanetRotation were when the vehicle was at R0.
        const vehiclePosition = RV.R.clone()
        const vehicleVelocity = RV.V.clone()
        const velocityDueToPlanetsRotation = new THREE.Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0).cross(vehiclePosition)
        const vehicleVelocityRelativeToAir = vehicleVelocity.clone().sub(velocityDueToPlanetsRotation)
        vehicleSpeed = RV.V.length() // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
        vehicleAirSpeed = vehicleVelocityRelativeToAir.length()  // Yes, we're calculating this even though the evacuated tube is evacuated. Need it for tTos and so we can plot it on the xychart
        const vehiclePositionRelativeToPlanet = vehiclePosition.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -2*Math.PI*t6a/planetSpec.lengthOfSiderealDay)
        // Downrange angle over the rotating planet, measured from the end of the ramp
        const downrangeAngle = R0.angleTo(vehiclePositionRelativeToPlanet)
        altitude = RV.R.length() - this.planetRadius
        airPressureInPascals = evacuatedTubeInteriorPressure

        // ToDo - Potentially the aerodynamicDragFactor will drop as altitude increases - but with a frequent launch cadence, gas will probably be pushed up the tube.
        const aerodynamicDrag = aerodnamicDragFactor * vehicleAirSpeed**2
        const powerUsedToOvercomeAerodynamicDrag = aerodynamicDrag * vehicleAirSpeed
        this.energyLostToDragWhileInTube += powerUsedToOvercomeAerodynamicDrag * tStep1  // this loop's actual step
        const qConv = tram.calculateQConv(vehicleAirSpeed, evacuatedTubeInteriorGasDensity, launchVehicleNoseConeTipRadius)
        const qRad = tram.calculateQRad(vehicleAirSpeed, evacuatedTubeInteriorGasDensity)

        const deltaDistanceTravelled = lastVehiclePositionRelativeToPlanet.distanceTo(vehiclePositionRelativeToPlanet) // ToDo: Would be better to find the equation for distance traveled along a hyperbolic path versus time.
        this.launcherElevatedEvacuatedTubeLength += deltaDistanceTravelled

        const downrangeDistance = launcherMassDriver1Length + launcherMassDriver2Length + rampBaseLength + downrangeAngle * (this.planetRadius + launcherMassDriverAltitude)
        if (isNaN(vehicleAirSpeed) || isNaN(this.launcherElevatedEvacuatedTubeLength) || isNaN(vehiclePositionRelativeToPlanet.x) || isNaN(vehiclePositionRelativeToPlanet.y) || isNaN(vehiclePositionRelativeToPlanet.z)) {
          console.log('Nan Error')
        }
        // Collect control points for curves
        evacuatedTubeConversionCurvePoints.push(new THREE.Vector3(vehicleAirSpeed, this.launcherElevatedEvacuatedTubeLength, t6a))
        this.evacuatedTubeCurveControlPoints.push(vehiclePositionRelativeToPlanet)
        if (t<=launcherXyChartMaxT) {
          // Save telemery...
          altitudeVersusTimeData.push(new THREE.Vector3(t, altitude, 0))
          airPressureVersusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
          downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
          airSpeedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
          forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
          upwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
          aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0))
          fuelMassFlowRateVersusTimeData.push(new THREE.Vector3(t, 0, 0))
          totalMassVersusTimeData.push(new THREE.Vector3(t, m0, 0))
          if (coe.eccentricity<1) {
            apogeeAltitudeVersusTimeData.push(new THREE.Vector3(t, initialApogeeDistance - this.planetRadius, 0))
            perigeeAltitudeVersusTimeData.push(new THREE.Vector3(t, initialPerigeeDistance, 0))
          }
          convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qConv, 0))
          radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qRad, 0))
          heatShieldTemperatureVersusTimeData.push(new THREE.Vector3(t, heatShieldTemperature, 0))
        }
        lastVehiclePositionRelativeToPlanet = vehiclePositionRelativeToPlanet
      }
      this.totalLengthOfLaunchSystem += this.launcherElevatedEvacuatedTubeLength
      this.launchVehicleAirSpeedAtExit = vehicleAirSpeed

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
    const adaptiveThrust = dParamWithUnits['launchVehicleAdaptiveThrust'].value
    const maxFuelFlowRate = dParamWithUnits['launchVehiclePropellantMassFlowRate'].value
    const launcherMaxEyesInAcceleration = dParamWithUnits['launcherMaxEyesInAcceleration'].value
    const launcherMaxEyesOutAcceleration = dParamWithUnits['launcherMaxEyesOutAcceleration'].value

    let fuelFlowRate = maxFuelFlowRate
    let mTotal = mVehicle + mPayload + mPropellant
    const noseconeAngle = Math.atan2(launchVehicleRadius, launchVehicleNoseconeLength)
    print('noseconeAngle (deg)', noseconeAngle * 180 / Math.PI)
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
    this.peakDeceleration = 0
    let abortFreeFlight = false
    let peakAerodynamicDrag = 0

    //console.log('Creating hyperbolic part of trajectory.')
    for (let i = 0; (i<numFreeFlightSplinePoints) && !abortFreeFlight; i++ ) {
      let propellantBurnTime = tStep2  // time the engine actually burns during this step
      t = t5a + i * tStep2
      const t6a = (t5a - t4) + i * tStep2  // t6a is the time from the end of the ramp
      if (adaptiveThrust && (i!==0)) {
        if (!isFinite(RV.R.length()) || !isFinite(RV.V.length())) {
          console.error('Error - RV is not finite')
        }
        RV = this.RV_from_R0V0Aandt(RV.R, RV.V, acceleration, tStep2)
      }
      else {
        RV = this.RV_from_R0V0Aandt(R0, V0PlusPlanetRotation, acceleration, t6a)
      }
      if (!isFinite(RV.R.length()) || !isFinite(RV.V.length())) {
        console.error('Error - RV is not finite')
      }
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
      // Downrange angle over the rotating planet, measured from the end of the ramp (R is 3-D; Y is the pole)
      const downrangeAngle = R0.angleTo(vehiclePositionRelativeToPlanet)

      const deltaDistanceTravelled = lastVehiclePositionRelativeToPlanet.distanceTo(vehiclePositionRelativeToPlanet) // ToDo: Would be better to find the equation for distance traveled along an eclipse versus time.
      const downrangeDistance = launcherMassDriver1Length + launcherMassDriver2Length + rampBaseLength + downrangeAngle * (this.planetRadius + launcherMassDriverAltitude)
      distanceTravelledOutsideLaunchSystem += deltaDistanceTravelled

      const airPressureInAtmospheres = airPressureInPascals / 101325
      const launchVehicleRocketExhaustVelocity = tram.lerp(launchVehicleVacuumRocketExhaustVelocity, launchVehicleSeaLevelRocketExhaustVelocity, airPressureInAtmospheres)
  
      const airDensity = planetSpec.airDensityAtAltitude(altitude)

      const aerodynamicDrag = tram.getAerodynamicDrag(airDensity, launchVehicleCoefficientOfDrag, vehicleAirSpeed, launchVehicleRadius, launchVehicleBodyLength)
      peakAerodynamicDrag = Math.max(peakAerodynamicDrag, aerodynamicDrag)
      const powerUsedToOvercomeAerodynamicDrag = aerodynamicDrag * vehicleAirSpeed
      this.energyLostToDragWhileInAtmosphere += powerUsedToOvercomeAerodynamicDrag * tStep2  // this loop's actual step

      const dynamicPressure = 0.5 * airDensity * vehicleAirSpeed**2
      // Placeholder code
      let adiabaticWallTemperature = 0
      if (airDensity>0) {
        const prandtlNumberOfAir = 0.71
        const recoveryFactorLaminarFlow = Math.sqrt(prandtlNumberOfAir)
        const recoveryFactorTurbulentFlow = prandtlNumberOfAir**(1/3)
        const ratioOfSpecificHeatsOfAir = 1.4
        const tInfinity = planetSpec.airTemperatureInKelvinAtAltitude(altitude)
        const speedOfSound = Math.sqrt(ratioOfSpecificHeatsOfAir * planetSpec.specificGasConstantForAir * tInfinity)
        adiabaticWallTemperature = tInfinity * (1 + recoveryFactorTurbulentFlow * (ratioOfSpecificHeatsOfAir - 1) / 2 * (vehicleAirSpeed/speedOfSound)**2)
      }
      else {
        adiabaticWallTemperature = 0
      }
      //console.log('adiabaticWallTemperature at t=', myFormat(t), 's is', myFormat(adiabaticWallTemperature), 'K')
      
      const heatShieldEmissivity = 0.8
      const qConv = tram.calculateQConv(vehicleAirSpeed, airDensity, launchVehicleNoseConeTipRadius)
      const qConvTip = qConv * 4 * Math.PI * launchVehicleNoseConeTipRadius**2 / 2
      const qRad = tram.calculateQRad(vehicleAirSpeed, airDensity)
      // Radiative-equilibrium stagnation temperature from the convective (Sutton-Graves) and radiative heat
      // fluxes, capped at the adiabatic wall temperature. (This used to treat the whole freestream energy
      // flux 0.5*rho*v^3 as wall heating; real wall heating is only ~1-10% of that.)
      const stefanBoltzmann = 5.67e-8
      const radiativeEquilibriumTemperature = ((qConv + qRad) / (heatShieldEmissivity * stefanBoltzmann))**0.25
      const heatShieldTemperature = (adiabaticWallTemperature > 0) ? Math.min(adiabaticWallTemperature, radiativeEquilibriumTemperature) : radiativeEquilibriumTemperature

      // Print out some of the peak values that occur at the moment the vehicle leaves the evacuated tube
      if (i===0) {
        console.log('--- Vehicle State at Exit from Evacuated Tube ---')
        print('Vehicle Speed - Inertial Frame (m/s)', myFormat(vehicleSpeed))
        print('Vehicle Air Speed (m/s)', myFormat(vehicleAirSpeed))
        print('Vehicle Altitude (m)', myFormat(altitude))
        print('Air Pressure (atm)', myFormat(airPressureInAtmospheres, 3))
        print('Air Density (kg/m^3)', myFormat(airDensity, 3))
        print('Aerodynamic Drag (N)', myFormat(aerodynamicDrag))
        print('Dynamic Pressure (MPa)', myFormat(dynamicPressure/1e6, 2))
        print('Convective Heating Rate (W/mm^2)', myFormat(qConv/1e6, 3))
        print('Convective Heating At Tip (W)', myFormat(qConvTip, 3))
        print('Radiative Heating Rate (W/mm^2)', myFormat(qRad/1e6, 3))
        print('-----------------------------------------------')
      }

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

        this.peakDeceleration = Math.max(this.peakDeceleration, Math.round(-forwardAcceleration*10)/10)

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
        propellantBurnTime = tBurn

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
            vehicleOrientation = RV.V.clone().normalize() //velocityDirectionInECEFReferencFrame
          }
        }
        else if (thrustState===2) {
          if (upwardComponentOfVelocity<=0) {
            // If we're falling, thrust directly away from the center of the earth
            vehicleOrientation = RV.R.clone().normalize()
          }
          else {
            // Thrust in the velocity direction in the Earth Centered Inertial Reference Frame
            vehicleOrientation = RV.V.clone().normalize() //velocityDirectionInECEFReferencFrame
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
        deltaVFromAcceleration = vehicleOrientation.clone().normalize().multiplyScalar(changeInSpeed)
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

      // Only consume propellant for the time the engine actually burned (the burn can be cut short)
      mPropellant = Math.max(0, mPropellant - fuelFlowRate * propellantBurnTime)
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
      if (Number.isNaN(distanceTravelledOutsideLaunchSystem) || Number.isNaN(fuelFlowRate)) {
        console.log('Error: NaN in free-flight telemetry')
      }
      const vehicleTelemetry = new THREE.Vector3(vehicleAirSpeed, aerodynamicDrag, fuelFlowRate)

      freeFlightConversionCurveControlPoints.push(new THREE.Vector3(vehicleAirSpeed, distanceTravelledOutsideLaunchSystem, fuelFlowRate))
      freeFlightPositionCurveControlPoints.push(vehiclePositionRelativeToPlanet)
      freeFlightOrientationCurveControlPoints.push(vehicleOrientationRelativeToPlanet.normalize())
      freeFlightTelemetryCurveControlPoints.push(vehicleTelemetry)
      const loadVector = vehicleOrientationRelativeToPlanet.clone().multiplyScalar(forwardAcceleration)
      freeFlightForces.push({ t: t - t5a, x: loadVector.x, y: loadVector.y, z: loadVector.z })
      // Record telemery for plots...
      if (t<=launcherXyChartMaxT) {
        altitudeVersusTimeData.push(new THREE.Vector3(t, altitude, 0))
        airPressureVersusTimeData.push(new THREE.Vector3(t, airPressureInPascals, 0))
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
        convectiveHeatingVersusTimeData.push(new THREE.Vector3(t, qConv, 0))
        radiativeHeatingVersusTimeData.push(new THREE.Vector3(t, qRad, 0))
        heatShieldTemperatureVersusTimeData.push(new THREE.Vector3(t, heatShieldTemperature, 0))
      }
      lastVehiclePositionRelativeToPlanet = vehiclePositionRelativeToPlanet

      if ((altitude<launcherMassDriverAltitude) && (i>4)) {
        if (verbose>0) console.log('Vehicle has returned to the planet\'s surface!')
        mPropellant = 0
        break
      }
    }
    this.durationOfFreeFlight = t - t5a
    this.peakDecelleration = this.peakDeceleration  // main.js reads the misspelled name
    this.remainingPropellantAfterFreeFlight = mPropellant
    //console.log('done')

    print("Peak Aerodynamic Drag", Math.round(peakAerodynamicDrag/1e3)/1e3, "MN")
    const peakDeceleration = peakAerodynamicDrag / m0
    print("Peak Deceleration if Rocket Fails", Math.round(peakDeceleration), "m/s2")

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
    // (These masses used to be hard-coded to 28000 kg.)
    const mSled = dParamWithUnits['launchSledMass'].value
    const mLoadedVehicle = mVehicle + mPayload + initialPropellantMass
    const eff = 0.9  // ASSUMED mass-driver efficiency (no source data)
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
    console.log('Electrical Energy Per Launch', Math.round(electricalEnergyPerLaunch/1e9)/1e3, 'TJoules (', myFormat(electricalEnergyPerLaunch/3.6e12, 3), 'GWh)')
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
      const equivalentApolloPropellantMass = (mVehicle + mPayload + initialPropellantMass)*2970000/45000*0.9
      console.log('Apollo-Equivalent Propellant Consumed', Math.round(equivalentApolloPropellantMass)) // Apollo mass on pad over mass to moon * 0.9 factor to account for structural mass 
      console.log('Propellant required relative to Apollo', this.propellantConsumed/equivalentApolloPropellantMass)
      console.log('Initial Total Mass', Math.round(mVehicle + mPayload + initialPropellantMass))
      console.log('Final Mass After Burn', Math.round(mVehicle + mPayload + mPropellant))
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
        this.evacuatedTubeCurve.setAlwaysAwayNormalMode()
        this.evacuatedTubeCurve.name = 'elevatedEvacuatedTube'
        this.evacuatedTubeCurve.curveType = 'centripetal'
        this.evacuatedTubeCurve.closed = false
        this.evacuatedTubeCurve.tension = 0
      }
      else {
        this.evacuatedTubeCurve.setPoints(this.evacuatedTubeCurveControlPoints)
        this.evacuatedTubeCurve.updateArcLengths()
      }
      if (this.animateElevatedEvacuatedTubeDeployment) {
        if (!this.coiledElevatedEvacuatedTubeCurve) {
          // We need a second curve that we can animate while referring to the original curve to obtain coordinates
          this.coiledElevatedEvacuatedTubeCurve = new CatmullRomSuperCurve3(this.evacuatedTubeCurveControlPoints)
          this.coiledElevatedEvacuatedTubeCurve.name = 'coiledElevatedEvacuatedTube'
          this.coiledElevatedEvacuatedTubeCurve.setAlwaysAwayNormalMode()
          this.coiledElevatedEvacuatedTubeCurve.curveType = 'centripetal'
          this.coiledElevatedEvacuatedTubeCurve.closed = false
          this.coiledElevatedEvacuatedTubeCurve.tension = 0

          // console.log(this.evacuatedTubeCurveControlPoints)
          // const sc = this.coiledElevatedEvacuatedTubeCurve
          // for (let i = sc.points.length-10; i<sc.points.length; i++) {
          //   const controlPoint = sc.points[i]
          //   console.log(controlPoint)
          //   const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
          //   const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
          //   const controlPointMesh = new arrow(controlPoint, controlPoint.clone().normalize(), 20000, 0.5, 1, 0x7f5050)
          //   this.scene.add(controlPointMesh)
          // }

        }
        else {
          this.coiledElevatedEvacuatedTubeCurve.setPoints(this.evacuatedTubeCurveControlPoints)
          this.coiledElevatedEvacuatedTubeCurve.updateArcLengths()  // (was called on the points Array, which threw)
        }
      }  

      this.evacuatedTubeCurve.addtToiConvertor(evacuatedTubetToiConvertor)
      this.evacuatedTubeCurve.addtTodConvertor(evacuatedTubetTodConvertor)
      this.evacuatedTubeCurve.addtTosConvertor(evacuatedTubetTosConvertor)
      this.evacuatedTubeCurve.setDuration(this.timeWithinEvacuatedTube)
      this.evacuatedTubeCurve.name = "elevatedEvacuatedTube"
      if (this.coiledElevatedEvacuatedTubeCurve) {
        // The coiled tube has (approximately) the same arc length, so the vehicles can use the same
        // time-to-distance converters on it (placement uses arc length on this curve).
        this.coiledElevatedEvacuatedTubeCurve.addtToiConvertor(evacuatedTubetToiConvertor)
        this.coiledElevatedEvacuatedTubeCurve.addtTodConvertor(evacuatedTubetTodConvertor)
        this.coiledElevatedEvacuatedTubeCurve.addtTosConvertor(evacuatedTubetTosConvertor)
        this.coiledElevatedEvacuatedTubeCurve.setDuration(this.timeWithinEvacuatedTube)
      }
    }
    else {
      this.evacuatedTubeCurve = null
    }

    // ***************************************************************
    // The launch sled's braking run. The sled couples the vehicle to the track, so it stays with the vehicle
    // over the ramp (whose high-g turn it makes possible). From the end of the ramp the vehicle coasts on its
    // ballistic trajectory, and the sled brakes on the track inside the elevated evacuated tube, which follows
    // that trajectory. The track ends at the exit airlock's doors (they must be able to close across the
    // tube), and the sled stops with its front launchSledStopClearance short of them (see trackBraking.js).
    // ***************************************************************
    this.exitAirlockDistanceFromTubeExit = this.evacuatedTubeCurve ? exitAirlockDistanceFromTubeExit(dParamWithUnits, planetSpec, this.launchVehicleAirSpeedAtExit) : 0
    const tubeLength = this.evacuatedTubeCurve ? this.evacuatedTubeCurve.getLength() : 0
    const sledTrackLength = tubeLength - this.exitAirlockDistanceFromTubeExit
    if (sledTrackLength > 0) {
      // The track is the tube's curve up to the airlock. (While the tube's deployment is animated, it is
      // reshaped with the coiled tube: see launcherAnimate.js's updateCoiledEvacuatedTube.)
      this.sledTrackFraction = sledTrackLength / tubeLength
      const trackPoints = curvePointsUpTo(this.evacuatedTubeCurve, this.sledTrackFraction)
      if (!this.launchSledBrakingCurve) {
        this.launchSledBrakingCurve = new CatmullRomSuperCurve3(trackPoints)
        this.launchSledBrakingCurve.setAlwaysAwayNormalMode()
        this.launchSledBrakingCurve.curveType = 'centripetal'
        this.launchSledBrakingCurve.closed = false
        this.launchSledBrakingCurve.tension = 0
        this.launchSledBrakingCurve.name = 'launchSledBrakingCurve'
      }
      else {
        this.launchSledBrakingCurve.setPoints(trackPoints)
        this.launchSledBrakingCurve.updateArcLengths()
      }
      const track = this.launchSledBrakingCurve
      const trackLength = track.getLength()
      const requestedStopDistance = trackLength - launchSledFrontReach(dParamWithUnits) - dParamWithUnits['launchSledStopClearance'].value
      if (requestedStopDistance <= 0) console.warn('The elevated evacuated tube is too short for the launch sled to stop before the exit airlock')
      const braking = brakingProfile({
        initialSpeed: launchRampExitVelocity,
        stopDistance: Math.max(Math.min(1, trackLength), requestedStopDistance),
        radiusAt: (s) => track.getPointAt(Math.max(0, Math.min(1, s / trackLength))).length(),
        mu: planetSpec.gravitationalParameter,
      })
      track.addtTodConvertor(braking.tTod)
      track.addtTosConvertor(braking.tTos)
      track.addtToiConvertor((t) => braking.tTod(t) / trackLength)
      track.setDuration(braking.duration)
      this.launchSledBrakingDeceleration = braking.deceleration
      this.launchSledBrakingDistance = braking.stopDistance
      specs['launchSledBrakingDistance'] = {value: braking.stopDistance, units: 'm'}
      specs['launchSledBrakingTime'] = {value: braking.duration, units: 's'}
      this.launchTrajectoryMarker6.position.copy(track.getPointAt(1))  // the exit airlock's doors
    }
    else {
      this.launchSledBrakingCurve = null
      this.launchSledBrakingDeceleration = undefined
      this.launchSledBrakingDistance = undefined
    }

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
    this.freeFlightPositionCurve.specificForceAt = t => {
      const f = interpolateSamples(freeFlightForces, 't', t)
      return new THREE.Vector3(f.x, f.y, f.z)
    }

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

    // Use the same proper force and capsule alignment as the animated vehicle, including each
    // transition boundary in the sampling so short jerk ramps remain visible at wide chart scales.
    const crewSeries = { direction: [], magnitude: [], frontBack: [], sideways: [] }
    let chartStart = 0
    const accelerationCurves = [this.feederRailCurve, this.massDriver1Curve, this.massDriver2Curve,
      this.launchRampCurve[1], this.evacuatedTubeCurve, this.freeFlightPositionCurve].filter(Boolean)
    for (const curve of accelerationCurves) {
      const duration = curve.getDuration()
      if (!(duration > 0) || !(curve.getLength() > 0)) continue
      const times = new Set([0, duration])
      const step = curve.profile ? 0.02 : 0.25
      for (let time = 0; time < duration && chartStart + time <= launcherXyChartMaxT; time += step) times.add(time)
      for (const time of [...times].sort((a, b) => a - b)) {
        const t = chartStart + time
        if (t > launcherXyChartMaxT) continue
        const u = Math.max(0, Math.min(1, curve.tTod(time) / curve.getLength()))
        const forward = curve.getTangentAt(u), upward = curve.getNormalAt(u)
        const modelForward = curve === this.freeFlightPositionCurve ? this.freeFlightOrientationCurve.getPoint(freeFlighttToiConvertor(time)).normalize() : forward
        const right = new THREE.Vector3().crossVectors(forward, upward)
        const orientation = quaternionFromFrame(modelForward, right.cross(modelForward))
        const load = capsuleLoad(specificForceAt(curve, time, planetSpec), orientation)
        for (const key of Object.keys(crewSeries)) crewSeries[key].push(new THREE.Vector3(t, load[key], 0))
      }
      chartStart += duration
    }
    this.crewAccelerationData = crewSeries

    this.xyChart.clearCurves()
    if (dParamWithUnits['showForwardAccelerationVersusTime'].value) this.xyChart.addCurve("Forward Acceleration", "m/s2", "m/s2", forwardAccelerationVersusTimeData, (y)=>y*1, 0xffff00, "Yellow", "Forward Acceleration (m/s2)")
    if (dParamWithUnits['showUpwardAccelerationVersusTime'].value) this.xyChart.addCurve("Upward Acceleration", "m/s2", "m/s2", upwardAccelerationVersusTimeData, (y)=>y*1, 0xff8000, "Orange", "Upward Acceleration (m/s2)")
    if (dParamWithUnits['showAltitudeVersusTime'].value) this.xyChart.addCurve("Altitude", "m", "km", altitudeVersusTimeData, (y)=>y*0.001, 0xffc080, "Light Brown", "Altitude (km)")
    if (dParamWithUnits['showAirPressureVersusTime'].value) this.xyChart.addCurve("Air Pressure", "Pa", "% of Sea Level", airPressureVersusTimeData, (y)=>y*100/airPressureAtSeaLevel, 0xff0000, "Red", "Air Pressure (% of sea level)")
    if (dParamWithUnits['showDownrangeDistanceVersusTime'].value) this.xyChart.addCurve("Downrange Distance", "m", "100's of km", downrangeDistanceVersusTimeData, (y)=>y*.00001, 0x0000ff, "Blue", "Downrange Distance (100's of km)")
    if (dParamWithUnits['showAirSpeedVersusTime'].value) this.xyChart.addCurve("Air Speed", "m/s", "km/s", airSpeedVersusTimeData, (y)=>y*0.001, 0x00ffff, "Cyan", "Air Speed (km/s)")
    if (dParamWithUnits['showAerodynamicDragVersusTime'].value) this.xyChart.addCurve("Aerodynamic Drag", "N", "10's of kN", aerodynamicDragVersusTimeData, (y)=>y*0.0001, 0x80ff80, "Bright Green", "Aerodynamic Drag (10's of kN)")
    if (dParamWithUnits['showPropellantMassFlowRateVersusTime'].value) this.xyChart.addCurve("Propellant Mass Flow Rate", "kg/s", "10's of kg/s", fuelMassFlowRateVersusTimeData, (y)=>y*0.1, 0x7f7fff, "Blue", "Propellant Mass Flow Rate (10's of kg/s)")
    if (dParamWithUnits['showTotalMassVersusTime'].value) this.xyChart.addCurve("Vehicle Mass", "kg", "1000's of kg", totalMassVersusTimeData, (y)=>y*0.001, 0xff7fff, "Purple", "Vehicle Mass (1000's of kg)")
    if (dParamWithUnits['showApogeeAltitudeVersusTime'].value) this.xyChart.addCurve("Orbital Apogee Altiude", "m", "m", apogeeAltitudeVersusTimeData, (y)=>y*0.001, 0xffffff, "White", "Orbital Apogee Altitude (km)")
    if (dParamWithUnits['showPerigeeAltitudeVersusTime'].value) this.xyChart.addCurve("Orbital Perigee Distance", "m", "m", perigeeAltitudeVersusTimeData, (y)=>y*0.001, 0xffff7f, "White", "Orbital Perigee Distance (km)")
    if (dParamWithUnits['showConvectiveHeatingVersusTime'].value) this.xyChart.addCurve("Convective Heating", "W/m2", "W/m2",  convectiveHeatingVersusTimeData, (y)=>y*1, 0xffff7f, "Light Yellow", "Convective Heating (W/m2)")
    if (dParamWithUnits['showRadiativeHeatingVersusTime'].value) this.xyChart.addCurve("Radiative Heating", "W/m2", "W/m2", radiativeHeatingVersusTimeData, (y)=>y*1, 0xffc080, "Light Orange", "Radiative Heating (W/m2)")
    if (dParamWithUnits['showHeatShieldTemperatureVersusTime'].value) this.xyChart.addCurve("Heat Shield Temperature", "K", "K", heatShieldTemperatureVersusTimeData, (y)=>y*0.1, 0xff0000, "Red", "Heat Shield Temperature (10's K)")
    if (dParamWithUnits['showLaunchVehicleAccelerationDirectionVersusTime'].value) this.xyChart.addCurve('Vehicle load direction', 'degrees', 'degrees', crewSeries.direction, y => y, 0x80ffff, 'Pale cyan', 'Vehicle load direction (degrees from nose toward roof)')
    if (dParamWithUnits['showLaunchVehicleAccelerationMagnitudeVersusTime'].value) this.xyChart.addCurve('Vehicle load magnitude', 'm/s2', 'm/s2', crewSeries.magnitude, y => y, 0xffffff, 'White', 'Vehicle proper acceleration (m/s2)')
    if (dParamWithUnits['showCrewFrontBackAccelerationVersusTime'].value) this.xyChart.addCurve('Crew front-to-back acceleration', 'm/s2', 'm/s2', crewSeries.frontBack, y => y, 0x40ff80, 'Green', 'Crew front-to-back acceleration (m/s2)')
    if (dParamWithUnits['showCrewSidewaysAccelerationVersusTime'].value) this.xyChart.addCurve('Crew sideways acceleration', 'm/s2', 'm/s2', crewSeries.sideways, y => y, 0xff40ff, 'Magenta', 'Crew sideways acceleration (m/s2)')
    this.xyChart.drawLegend(14, 22)

    //print("Altitude (km)", "Air Pressure (Pa)", "Aerodynamic Drag (N)", "Convective Heating (W/mm2)")
    function list(array1, array2, array3, array4, array5) {
      for (let i = 0; i<array1.length; i++) {
        print(array1[i].x, array1[i].y, array2[i].y, array3[i].y, array4[i].y/1e6, array5[i].y/1e6)
      }
    }
    // print("altitudeVersusTimeData")
    // //list(altitudeVersusTimeData)
    // console.log("airPressureVersusTimeData")
    //list(altitudeVersusTimeData, airPressureVersusTimeData, aerodynamicDragVersusTimeData, convectiveHeatingVersusTimeData, radiativeHeatingVersusTimeData)
    // console.log(aerodynamicDragVersusTimeData)
    // console.log(convectiveHeatingVersusTimeData)
    // console.log(radiativeHeatingVersusTimeData)

    // forwardAccelerationVersusTimeData.forEach(point => {
    //   if (point.y<0) {
    //     print(point.x, -point.y)
    //   }
    // })
    if (verbose) {
      print('========= Chart Legend and Y-Axis Values ==========')
      //let peakAerodynamicDrag = 0
      this.xyChart.curveInfo.forEach(curve =>{
        if (curve.name == 'Aerodynamic Drag') {
          print(curve.name, '(', curve.colorName, ')', Math.round(curve.largestY), curve.units)
          print('   (Equivalent to ' + Math.round(curve.largestY/2279000*100)/100 + ' RS-25 Space Shuttle Main Engines)')
          print('   (Equivalent to ' + Math.round(curve.largestY/2520000*100)/100 + ' SpaceX Raptor2 Vacuum Engines)')
          //peakAerodynamicDrag = curve.maxY
        }
        else {
          print(curve.name, '(', curve.colorName, ')', Math.round(curve.largestY*curve.yScale), curve.scaledUnits)
        }
      })
      
      print('===================================================')
      // print("Vehicle Peak Aerodynamic Drag", Math.round(peakAerodynamicDrag/1000000), 'MN')
      // print("RS-25 Engine Thrust 2279 kN")
      //print("Vehicle Initial Mass", Math.round(m0), 'kg')
      print("MassDriver1 Time", Math.round(launcherMassDriver1AccelerationTime*10)/10, 'sec')
      print("MassDriver2 Time", Math.round(launcherMassDriver2AccelerationTime*10)/10, 'sec (' + Math.round(launcherMassDriver2AccelerationTime*100/60)/100, 'min)')
      print("Ramp Time", Math.round(this.launchVehicleTimeWithinRamp*10)/10, 'sec')
      print("Evacuate Tube Time", Math.round(this.timeWithinEvacuatedTube*10)/10, 'sec')
      print("Forward Acceleration", Math.round(launchVehicleMassDriverForwardAcceleration*10)/10, 'm/s2')
      print("Upward Acceleration", Math.round(launchVehicleRampUpwardAcceleration*10)/10, 'm/s2')
      print("Time at Elevated Evacuated Tube Exit", launcherMassDriver1AccelerationTime + launcherMassDriver2AccelerationTime + this.launchVehicleTimeWithinRamp + this.timeWithinEvacuatedTube, 'sec')
      print("Total Time on Chart X-Axis", Math.round(t6a), 'sec (' + Math.round(t6a/6)/10 + ' min)')
      print("MassDriver1 Length", Math.round(this.launcherMassDriver1Length/10)/100, 'km (',  Math.round(this.launcherMassDriver1Length/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      print("MassDriver2 Length", Math.round(this.launcherMassDriver2Length/10)/100, 'km (',  Math.round(this.launcherMassDriver2Length/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      print("Ramp Length", Math.round(this.launcherRampLength/10)/100, 'km (',  Math.round(this.launcherRampLength/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      print("Elevated Evacuated Tube Length", Math.round(this.launcherElevatedEvacuatedTubeLength/10)/100, 'km (',  Math.round(this.launcherElevatedEvacuatedTubeLength/this.totalLengthOfLaunchSystem*10000)/100, '%)')
      print("Elevated Evacuated Tube Exit Altitude", Math.round(launcherEvacuatedTubeExitAltitude/10)/100, 'km')
      print("Total Length Of Launch System", Math.round(this.totalLengthOfLaunchSystem/10)/100, 'km')
      print('Hit \'s\' to print out more specifications.')

      // const massDriverCost = (this.launcherMassDriver1Length + this.launcherMassDriver2Length) * massDriverCostPerMeter
      // const rampCost = this.launcherRampLength * rampCostPerMeter
      // const suspendedEvacuatedTubeCost = this.launcherElevatedEvacuatedTubeLength * suspendedEvacuatedTubeCostPerMeter
      // print("MassDriver Cost", Math.round(massDriverCost/1e6)/1e3, 'billion USD')
      // print("Ramp Cost", Math.round(rampCost/1e6)/1e3, 'billion USD')
      // print("Suspended Evacuated Tube Cost", Math.round(suspendedEvacuatedTubeCost/1e6)/1e3, 'billion USD')
      // print('==================================================')
    }

    // Note that each segment has launcherMassDriverNumScrews screws. The screws (and brackets) are spread
    // over both horizontal mass drivers and the ramp, with acceleration and braking accounted separately.
    // The rough length is clamped to avoid Infinity segments when it is set to 0.
    const screwRoughLength = Math.max(0.1, this.launcherMassDriverScrewRoughLength)
    const maxScrewSegments = 1e6
    const acceleratingLength = launcherMassDriver1Length + launcherMassDriver2Length + this.adaptiveNutDetachDistance
    const brakingLength = this.launcherRampLength - this.adaptiveNutDetachDistance
    this.massDriverScrewSegments = Math.min(maxScrewSegments, Math.max(2, Math.ceil(acceleratingLength / screwRoughLength) + Math.ceil(brakingLength / screwRoughLength)))
    this.massDriverAccelerationScrewSegments = Math.max(1, Math.min(this.massDriverScrewSegments - 1,
      Math.round(this.massDriverScrewSegments * acceleratingLength / (acceleratingLength + brakingLength))))
    this.rampDeccelerationScrewSegments = this.massDriverScrewSegments - this.massDriverAccelerationScrewSegments
    this.massDriverAccelerationScrewSegmentExactLength = acceleratingLength / this.massDriverAccelerationScrewSegments - launcherMassDriverScrewBracketThickness
    this.rampDeccelerationScrewSegmentExactLength = brakingLength / this.rampDeccelerationScrewSegments - launcherMassDriverScrewBracketThickness
    specs['launchVehicleAccelerationTransitionTime'] = {value: rampProfile.transitionSeconds, units: 's'}
    specs['launchVehicleRampReleaseTime'] = {value: rampProfile.releaseSeconds, units: 's'}
    specs['launchVehicleRampPeakUpwardAcceleration'] = {value: rampProfile.peakUpwardAcceleration, units: 'm/s2'}

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
