import { screwStateAtDistance } from './rampMotion.js'
// Launcher specs, rocket engine models and vehicle sizing helpers.
import * as THREE from 'three'
import * as tram from '../utils/tram.js'

export function updateLauncherSpecs(dParamWithUnits, crv, launcher, specs) {

  // Launcher Design Length
  const launchVehicleMassDriverForwardAcceleration = dParamWithUnits['launchVehicleMassDriverForwardAcceleration'].value
  const launcherMassDriverExitVelocity = dParamWithUnits['launcherMassDriverExitVelocity'].value
  //console.log('launcherMassDriverExitVelocity', launcherMassDriverExitVelocity)

  specs['launcherMassDriver1Length'] = {value: launcher.launcherMassDriver1Length, units: "m"}
  specs['launcherMassDriver2Length'] = {value: launcher.launcherMassDriver2Length, units: "m"}
  specs['launcherRampLength'] = {value: launcher.launcherRampLength, units: "m"}
  specs['launcherElevatedEvacuatedTubeLength'] = {value: launcher.launcherElevatedEvacuatedTubeLength, units: "m"}
  specs['totalLengthOfLaunchSystem'] = {value: launcher.totalLengthOfLaunchSystem, units: "m"}
  specs['totalLengthOfLaunchSystem'] = {value: launcher.totalLengthOfLaunchSystem, units: "m"}

  specs['launcherTimeWIthinFeederRail'] = {value: launcher.timeWithinFeederRail, units: "s"}
  specs['launcherTimeWithinMassDriver1'] = {value: launcher.timeWithinMassDriver1, units: "s"}
  specs['launcherTimeWithinMassDriver2'] = {value: launcher.timeWithinMassDriver2, units: "s"}
  specs['launcherTimeWithinRamp'] = {value: launcher.launchVehicleTimeWithinRamp, units: "s"}
  specs['launcherTimeWithinSuspendedEvacuatedTube'] = {value: launcher.timeWithinSuspendedEvacuatedTube, units: "s"}
  specs['totalTimeWithinLaunchSystem'] = {value: launcher.totalTimeWithinLaunchSystem, units: "s"}

  //console.log('timeWithinMassDriver', launcher.timeWithinMassDriver)
  
  const timeWithinMassDriverMinutes = launcher.timeWithinMassDriver / 60
  specs['timeWithinMassDriverMinutes'] = {value: timeWithinMassDriverMinutes, units: "minutes"}
  //console.log('timeWithinMassDriverMinutes', timeWithinMassDriverMinutes)

  const launcherMassDriverScrewThreadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value // m
  const launcherMassDriverScrewRotationRate = dParamWithUnits['launcherMassDriverScrewRotationRate'].value // rad/s
  const launcherScrewThreadCircumference = 2 * Math.PI * launcherMassDriverScrewThreadRadius
  const launcherScrewThreadRimSpeed = launcherScrewThreadCircumference * launcherMassDriverScrewRotationRate
  console.log('launcherScrewThreadRimSpeed', launcherScrewThreadRimSpeed)
  specs['launcherScrewThreadRimSpeed'] = {value: launcherScrewThreadRimSpeed, units: "m/s"}
  // The GE-90 has a fan diameter of 3124 mm and a rotational speed of 3475 RPM. Their circumferential velocity is d·π·57.917 = 568 m/s
  const GE90TurboFanDiameter = 3.124 // m
  const GE90TurboFanRotationRate = 3475 // RPM
  const GE90TurboFanCircumferentialVelocity = GE90TurboFanDiameter * Math.PI * GE90TurboFanRotationRate / 60
  specs['GE90TurboFanCircumferentialVelocity'] = {value: GE90TurboFanCircumferentialVelocity, units: "m/s"}
  console.log('GE90TurboFanCircumferentialVelocity', GE90TurboFanCircumferentialVelocity)
  
  const launcherScrewThreadPitchAtExit = launcherMassDriverExitVelocity / launcherScrewThreadRimSpeed
  console.log('launcherScrewThreadPitchAtExit', launcherScrewThreadPitchAtExit)
  //const launchSledBodyLength = dParamWithUnits['launchSledBodyLength'].value // m
  const launchVehicleRadius = dParamWithUnits['launchVehicleRadius'].value // m

  // Launcher Propellant Mass Calculation
  const vehicleCrossSectionalArea = Math.PI * launchVehicleRadius*2
  const launchVehicleCoefficientOfDrag = dParamWithUnits['launchVehicleCoefficientOfDrag'].value // Coefficient of drag for hypersonic vehicle with a very pointy nose.
  const launchVehicleRocketExhaustVelocity = dParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value // m/s
  const launcherMassDriverAltitude = dParamWithUnits['launcherMassDriverAltitude'].value // m
  const R0 = new THREE.Vector2(0, crv.radiusOfPlanet + launcherMassDriverAltitude)
  const V0 = new THREE.Vector2(
    launcherMassDriverExitVelocity * Math.cos(this.upwardAngleAtEndOfRamp),
    launcherMassDriverExitVelocity * Math.sin(this.upwardAngleAtEndOfRamp))
  const tStep = 0.125

  let propellantConsumed = 0 
  let lastVehiclePositionVector = new THREE.Vector2(R0.x, R0.y)
  let launcherSuspendedTubeLength = 0
  const acceleration = new THREE.Vector3(0, 0, 0)
  for (let t = 0; t < 100; t += tStep) {
    // Determine the altitude and velocity of the vehicle. 't' in this case represents the time relative to the initial conditions, R0_x, R0_y, V0_x, V0_y
    const RV = launcher.RV_from_R0V0Aandt(R0, V0, acceleration, t)

    const vehiclePositionVector = new THREE.Vector2(RV.R.x, RV.R.y)
    const vehicleAltitude = vehiclePositionVector.length() - crv.radiusOfPlanet
    const vehicleDownrangeDistance = Math.atan2(vehiclePositionVector.x, vehiclePositionVector.y) * crv.radiusOfPlanet
    const vehicleVelocityVector = new THREE.Vector2(RV.V.x, RV.V.y)
    const vehicleUpwardAngleInDegrees = (Math.atan2(vehiclePositionVector.x, vehiclePositionVector.y) - (Math.atan2(vehicleVelocityVector.x, vehicleVelocityVector.y) - Math.PI/2)  ) * 180 / Math.PI
    const vehicleSpeed = vehicleVelocityVector.length()
    const airDensityAtCurrentAltitude = (vehicleAltitude > crv.currentMainRingAltitude) ? tram.airDensityAtAltitude(vehicleAltitude) : 0   // Probably should use a more accurate value for pressure of the vacuum inside the launch tube
    const launchVehicleAerodynamicDragForce = 0.5 * launchVehicleCoefficientOfDrag * airDensityAtCurrentAltitude * vehicleSpeed**2 * vehicleCrossSectionalArea
    const launchVehicleRocketFuelFlowRate = launchVehicleAerodynamicDragForce / launchVehicleRocketExhaustVelocity
    const thrustRS25 = 2279000  // N
    propellantConsumed += launchVehicleRocketFuelFlowRate * tStep
    if (vehicleAltitude <= crv.currentMainRingAltitude) {
      launcherSuspendedTubeLength += vehiclePositionVector.clone().sub(lastVehiclePositionVector).length()
      lastVehiclePositionVector.copy(vehiclePositionVector)     
    }
    if ((t%1==0) || ((vehicleAltitude>31000) && (vehicleAltitude<33000))) {
      //console.log(Math.atan2(vehicleVelocityVector.x, vehicleVelocityVector.y) - Math.PI/2, Math.atan2(vehiclePositionVector.x, vehiclePositionVector.y))
      //console.log(t, Math.round(vehicleAltitude/10)/100, Math.round(vehicleDownrangeDistance/1000)/100, vehicleUpwardAngleInDegrees, Math.round(vehicleSpeed/10)/100, Math.round(launchVehicleAerodynamicDragForce/1000)/100, Math.round(propellantConsumed)/100)
    }
  }
  specs['launcherSuspendedTubeLength'] = {value: launcherSuspendedTubeLength, units: "m"} 
  // End Launcher Propellant Mass Calculation

  const launchSledMass = dParamWithUnits['launchSledMass'].value // kg
  const launchVehicleEmptyMass = dParamWithUnits['launchVehicleEmptyMass'].value // kg
  const launchVehiclePropellantMass = dParamWithUnits['launchVehiclePropellantMass'].value // kg
  const launchVehiclePayloadMass = dParamWithUnits['launchVehiclePayloadMass'].value // kg
  const launchVehicleNonPayloadMass = dParamWithUnits['launchVehicleNonPayloadMass'].value // kg

  const launchSledAndVehicleTotalMass = launchSledMass + launchVehicleEmptyMass + launchVehiclePropellantMass + launchVehiclePayloadMass // kg
  //console.log('launchSledAndVehicleTotalMass', launchSledAndVehicleTotalMass)
  specs['launchSledAndVehicleTotalMass'] = {value: launchSledAndVehicleTotalMass, units: 'kg'}
  // Because most of the vehicle is needed to land at the destination, or because it is made from materials that we would need to ship anyway, we are classifying most of its mass as "mission payload", except for a small amount called "launchVehicleNonPayloadMass".
  // Propellant that is consumed during accent through the Earth's the atmosphere is not clasified as payload mass, but propelants reserved for maneuvering to and landing at the destination is.
  const launchVehicleClassifiedAsPayloadMass = (launchVehicleEmptyMass - launchVehicleNonPayloadMass) + (launchVehiclePropellantMass - propellantConsumed) + launchVehiclePayloadMass  // kg 
  specs['launchVehicleClassifiedAsPayloadMass'] = {value: launchVehicleClassifiedAsPayloadMass, units: 'kg'}

  // Per kg Propellant Costs
  // Fuel cost per kg calculation
  const liquidHydrogenCostPerKg = dParamWithUnits['liquidHydrogenCostPerKg'].value
  const liquidHeliumCostPerKg = dParamWithUnits['liquidHeliumCostPerKg'].value
  const liquidOxygenCostPerKg = dParamWithUnits['liquidOxygenCostPerKg'].value
  const massOfOneGallonOfLiquidHydrogen = 0.2679 // kg / Gallon http://www.uigi.com/h2_conv.html#:~:text=0.5906-,0.2679,-113.4
  const massOfOneGallonOfLiquidOxygen = 4.322 // kg / Gallon  http://www.uigi.com/o2_conv.html#:~:text=9.527-,4.322,-115.1
  const massOfHydrogen = 384071 * massOfOneGallonOfLiquidHydrogen
  const massOfOxygen = 141750 * massOfOneGallonOfLiquidOxygen
  const propellantCostPerKgOfPropellant = (massOfHydrogen * liquidHydrogenCostPerKg + massOfOxygen * liquidOxygenCostPerKg) / (massOfHydrogen + massOfOxygen)
  specs['propellantCostPerKgOfPropellant'] = {value: propellantCostPerKgOfPropellant, units: 'USD'}
  const propellantCostPerKgOfPayload = propellantCostPerKgOfPropellant * propellantConsumed / launchVehicleClassifiedAsPayloadMass
  specs['propellantCostPerKgOfPayload'] = {value: propellantCostPerKgOfPayload, units: 'USD'}
  
  //const launchVehiclePropellantMassFlowRate = dParamWithUnits['launchVehiclePropellantMassFlowRate'].value // kg/s
  const launchSledDriveForce = launchSledAndVehicleTotalMass * launchVehicleMassDriverForwardAcceleration
  //console.log('launchSledDriveForce', launchSledDriveForce)
  specs['launchSledDriveForce'] = {value: launchSledDriveForce, units: 'N'}
  const numScrews = 2  // 2 counter-rotating screws per launch tube
  const launchSledSidewaysForceAtExit = launchSledDriveForce * launcherScrewThreadPitchAtExit / numScrews
  specs['launchSledSidewaysForceAtExit'] = {value: launchSledSidewaysForceAtExit, units: 'N'}
  //console.log('launchSledSidewaysForceAtExit', launchSledSidewaysForceAtExit)
  const tensileStrengthOfCarbonFiberStrut = 3500000000 // Pa
  const crossSectionalAreaOfCarbonFiberStrut = launchSledSidewaysForceAtExit / tensileStrengthOfCarbonFiberStrut
  const diameterOfCarbonFiberStrut = 2 * Math.sqrt(crossSectionalAreaOfCarbonFiberStrut/Math.PI)
  specs['diameterOfCarbonFiberStrut'] = {value: diameterOfCarbonFiberStrut, units: 'm'}
  //console.log('diameterOfCarbonFiberStrut', diameterOfCarbonFiberStrut)

  const permeabilityOfFreeSpace = dParamWithUnits['permeabilityOfFreeSpace'].value // H/m
  const launcherMassDriverScrewFlightSaturationFluxDensity = dParamWithUnits['launcherMassDriverScrewFlightSaturationFluxDensity'].value // T 
  const launcherMassDriverScrewFlightMagneticFluxDensityPortion = dParamWithUnits['launcherMassDriverScrewFlightMagneticFluxDensityPortion'].value // T 
  const launchSledAMBAverageMagneticFluxDensity = launcherMassDriverScrewFlightSaturationFluxDensity * launcherMassDriverScrewFlightMagneticFluxDensityPortion
  specs['launchSledAMBAverageMagneticFluxDensity'] = {value: launchSledAMBAverageMagneticFluxDensity, units: 'T'}
  //console.log('launchSledAMBAverageMagneticFluxDensity', launchSledAMBAverageMagneticFluxDensity)

  const launchVehicleAreaOfAirgap = launchSledSidewaysForceAtExit * permeabilityOfFreeSpace / launchSledAMBAverageMagneticFluxDensity**2
  specs['launchVehicleAreaOfAirgap'] = {value: launchVehicleAreaOfAirgap, units: 'm^2'}
  //console.log('launchVehicleAreaOfAirgap', launchVehicleAreaOfAirgap)

  const launcherMassDriverScrewGrapplePadStartRadius = dParamWithUnits['launcherMassDriverScrewGrapplePadStartRadius'].value // m
  const launcherScrewToothContactPatchWidth = launcherMassDriverScrewThreadRadius - launcherMassDriverScrewGrapplePadStartRadius
  const launcherScrewToothContactPatchLength = launchVehicleAreaOfAirgap / launcherScrewToothContactPatchWidth
  specs['launcherScrewToothContactPatchLength'] = {value: launcherScrewToothContactPatchLength, units: 'm'}
  //console.log('launcherScrewToothContactPatchLength', launcherScrewToothContactPatchLength)

  // const threadTurnsOverCouplingPatchLength = launcherScrewToothContactPatchLength / launcherScrewThreadPitchAtExit / (2 * launcherScrewToothRadius * Math.PI)
  // specs['threadTurnsOverCouplingPatchLength'] = {value: threadTurnsOverCouplingPatchLength, units: 'turns'}
  //console.log('threadTurnsOverCouplingPatchLength', threadTurnsOverCouplingPatchLength)

  const launchSledBodyLength = launcherScrewToothContactPatchLength

  const launchSledSidewaysForcePerMeterOfScrewAtExit = launchSledSidewaysForceAtExit / launchSledBodyLength
  specs['launchSledSidewaysForcePerMeterOfScrewAtExit'] = {value: launchSledSidewaysForcePerMeterOfScrewAtExit, units: 'N'}
  //console.log('launchSledSidewaysForcePerMeterOfScrewAtExit', launchSledSidewaysForcePerMeterOfScrewAtExit)

  // The flywheelDecelerationTime is the time that the vehicle's body is adjacent to the flywheel
  const flywheelDecelerationTimeAtExit = launchSledBodyLength / launcherMassDriverExitVelocity
  specs['flywheelDecelerationTimeAtExit'] = {value: flywheelDecelerationTimeAtExit, units: 's'}
  //console.log('flywheelDecelerationTimeAtExit', flywheelDecelerationTimeAtExit)

  //const launcherFlywheelMassPerMeter = dParamWithUnits['launcherFlywheelMassPerMeter'].value // kg/m
  const launcherFlywheelRadius = dParamWithUnits['launcherFlywheelRadius'].value // m  (This is the distance to the center of the rim, probably would be better to use moments of inertia here...)
  const launcherFlywheelThickness = dParamWithUnits['launcherFlywheelThickness'].value // kg/m
  const launcherFlywheelDensity = dParamWithUnits['launcherFlywheelDensity'].value // kg/m
  const launcherFlywheelMassPerMeter = 2 * Math.PI * launcherFlywheelRadius * launcherFlywheelThickness * launcherFlywheelDensity
  // ToDo: this math could be improved by using more accurate formulas for flywheel engineering
  specs['launcherFlywheelMassPerMeter'] = {value: launcherFlywheelMassPerMeter, units: 'kg/m'}
  //console.log('launcherFlywheelMassPerMeter', launcherFlywheelMassPerMeter)
  const flywheelToThreadRadiusRatio = launcherFlywheelRadius / launcherMassDriverScrewThreadRadius
  const flywheelDecelerationRateAtExit = launchSledSidewaysForcePerMeterOfScrewAtExit / flywheelToThreadRadiusRatio / launcherFlywheelMassPerMeter  // m/s^2
  specs['flywheelDecelerationRateAtExit'] = {value: flywheelDecelerationRateAtExit, units: 'm/s2'}
  //console.log('flywheelDecelerationRateAtExit', flywheelDecelerationRateAtExit)
    
  const flywheelInitialRelativeRimSpeed = flywheelDecelerationRateAtExit * flywheelDecelerationTimeAtExit
  specs['flywheelInitialRelativeRimSpeed'] = {value: flywheelInitialRelativeRimSpeed, units: 'm/s'}
  //console.log('flywheelInitialRelativeRimSpeed', flywheelInitialRelativeRimSpeed)

  const flywheelInitialRelativeRotationRate = flywheelInitialRelativeRimSpeed / (2 * launcherFlywheelRadius * Math.PI)
  specs['flywheelInitialRelativeRotationRate'] = {value: flywheelInitialRelativeRotationRate, units: 's-1'}
  //console.log('flywheelInitialRelativeRotationRate', flywheelInitialRelativeRotationRate)

  const flywheelFinalAbsoluteRimSpeed = launcherScrewThreadRimSpeed / launcherMassDriverScrewThreadRadius * launcherFlywheelRadius
  const flywheelInitialAbsoluteRimSpeed = flywheelFinalAbsoluteRimSpeed + flywheelInitialRelativeRimSpeed
  const flywheelKineticEnergyChangePerMeterOfScrewAtExit = 0.5 * launcherFlywheelMassPerMeter * (flywheelInitialAbsoluteRimSpeed**2 - flywheelFinalAbsoluteRimSpeed**2)
  //console.log('flywheelKineticEnergyChangePerMeterOfScrewAtExit', flywheelKineticEnergyChangePerMeterOfScrewAtExit)
  specs['flywheelKineticEnergyChangePerMeterOfScrewAtExit'] = {value:flywheelKineticEnergyChangePerMeterOfScrewAtExit, units: 'J'}
  
  // Eddy Current Power Losses in the twin screw launcher
  const peakMagneticField = launchSledAMBAverageMagneticFluxDensity * 2
  const thicknessOfSheet = 0.0001  // m
  const frequencyOfField = launcherMassDriverExitVelocity / launchSledBodyLength  // Hz (assumes that the linear Bearing is continuous and its length equals the launch vehicle's body length)
  const constantK = 1
  const materialResistivity = 4.6e-7  // Ohm*m, for Grain-oriented electrical steel rom https://www.thoughtco.com/table-of-electrical-resistivity-conductivity-608499
  const materialDensity = 7650  // kg/m3
  const launcherEddyCurrentPowerLossesPerKg = 2 * (Math.PI * peakMagneticField * thicknessOfSheet * frequencyOfField)**2 / (6 * constantK * materialResistivity * materialDensity)
  specs['launcherEddyCurrentPowerLossesPerKg'] = {value: launcherEddyCurrentPowerLossesPerKg, units: 'W'}
  //console.log('launcherEddyCurrentPowerLossesPerKg', launcherEddyCurrentPowerLossesPerKg)

  // Per kg Energy Costs
  const kineticEnergyPerKilogram = 0.5 * launcherMassDriverExitVelocity**2
  const launcherAccelerationEfficiency = dParamWithUnits['launcherAccelerationEfficiency'].value
  const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value
  const launcherEnergyCostPerKilogram = kineticEnergyPerKilogram * launchSledAndVehicleTotalMass * wholesaleCostOfElectricity / launchVehicleClassifiedAsPayloadMass / launcherAccelerationEfficiency
  specs['launcherEnergyCostPerKilogram'] = {value: launcherEnergyCostPerKilogram, units: 'USD/kg'}
  //console.log('launcherEnergyCostPerKilogram', launcherEnergyCostPerKilogram)

  // Per kg Total Costs
  const launcherTotalCostPerKilogram = launcherEnergyCostPerKilogram + propellantCostPerKgOfPayload
  specs['launcherTotalCostPerKilogram'] = {value: launcherTotalCostPerKilogram, units: 'USD/kg'}
  //console.log('launcherTotalCostPerKilogram', launcherTotalCostPerKilogram)

  const costOfSteel = dParamWithUnits['costOfSteel'].value
  const costOfConcrete = dParamWithUnits['costOfConcrete'].value
  const costOfAluminum = dParamWithUnits['costOfAluminum'].value
  //const costOfCarbonFiber = dParamWithUnits['costOfCarbonFiber'].value
  const densityOfConcrete = dParamWithUnits['densityOfConcrete'].value

  const launcherMassDriverConcreteTubeInnerRadius = dParamWithUnits['launcherMassDriverConcreteTubeInnerRadius'].value // m
  const launcherMassDriverConcreteTubeOuterRadius = dParamWithUnits['launcherMassDriverConcreteTubeOuterRadius'].value // m
  const launcherMassDriverConcreteTubeJacketThickness = dParamWithUnits['launcherMassDriverConcreteTubeJacketThickness'].value // m
  const launcherMassDriverScrewShaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value // m
  const launcherMassDriverScrewShaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value // m
  const launcherMassDriverScrewThreadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value // m
  const launcherMassDriverScrewThreadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value // m
  const launcherConcreteTubeJacketMassPerMeter = Math.PI * launcherMassDriverConcreteTubeOuterRadius * launcherMassDriverConcreteTubeJacketThickness
  const launcherBracketsMassPerMeter = dParamWithUnits['launcherBracketsMassPerMeter'].value // kg/m
  const launcherRailsMassPerMeter = dParamWithUnits['launcherRailsMassPerMeter'].value // kg/m
  const launcherScrewsMassPerMeter = 
    (launcherMassDriverScrewThreadRadius - launcherMassDriverScrewShaftOuterRadius) * launcherMassDriverScrewThreadThickness * launcherMassDriverScrewThreadStarts
    + Math.PI * (launcherMassDriverScrewShaftOuterRadius**2 - (launcherMassDriverScrewShaftInnerRadius)**2)
  const launcherTorqueConvertorsMassPerMeter = dParamWithUnits['launcherTorqueConvertorsMassPerMeter'].value // kg/m
  const launcherMotorMass = dParamWithUnits['launcherMotorMass'].value // kg/m
  const launcherMotorCost = dParamWithUnits['launcherMotorCost'].value // kg/m
  const launcherMotorsPerMeter = dParamWithUnits['launcherMotorsPerMeter'].value
  const launcherVacuumPumpMass = dParamWithUnits['launcherVacuumPumpMass'].value // kg/m
  const launcherVacuumPumpCost = dParamWithUnits['launcherVacuumPumpCost'].value // kg/m
  const launcherVacuumPumpsPerMeter = dParamWithUnits['launcherVacuumPumpsPerMeter'].value
  const launcherConcreteTubeVolumePerMeter = Math.PI * (launcherMassDriverConcreteTubeOuterRadius**2 - launcherMassDriverConcreteTubeInnerRadius**2)


  // Mass Driver Steel Mass
  const launcherMassDriverSteelMassPerMeter = launcherConcreteTubeJacketMassPerMeter + launcherBracketsMassPerMeter + launcherRailsMassPerMeter + launcherScrewsMassPerMeter + launcherTorqueConvertorsMassPerMeter
  const launcherMassDriverSteelCost = launcherConcreteTubeVolumePerMeter * costOfSteel * launcher.launcherMassDriverLength
  specs['launcherMassDriverSteelCost'] = {value: launcherMassDriverSteelCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverSteelCost', launcherMassDriverSteelCost/1e6, 'M USD')

  // Mass Driver Motors
  const launcherMassDriverMotorsCost = launcherMotorCost * launcherMotorsPerMeter * launcher.launcherMassDriverLength
  specs['launcherMassDriverMotorsCost'] = {value: launcherMassDriverMotorsCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverMotorsCost', launcherMassDriverMotorsCost/1e6, 'M USD')

  // Mass Driver Vacuum Pumps
  const launcherMassDriverVacuumPumpsCost = launcherVacuumPumpCost * launcherVacuumPumpsPerMeter * launcher.launcherMassDriverLength
  specs['launcherMassDriverVacuumPumpsCost'] = {value: launcherMassDriverVacuumPumpsCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverVacuumPumpsCost', launcherMassDriverVacuumPumpsCost/1e6, 'M USD')

  // Mass Driver Concrete Tube
  const launcherMassDriverConcreteTubeVolume = launcherConcreteTubeVolumePerMeter * launcher.launcherMassDriverLength
  const launcherMassDriverConcreteTubeMass = launcherMassDriverConcreteTubeVolume * densityOfConcrete
  const launcherMassDriverConcreteTubeCost = launcherMassDriverConcreteTubeMass * costOfConcrete
  specs['launcherMassDriverConcreteTubeCost'] = {value: launcherMassDriverConcreteTubeCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverConcreteTubeCost', launcherMassDriverConcreteTubeCost/1e6, 'M USD')

  // Ramp Steel Mass
  const launcherRampSteelMassPerMeter = launcherConcreteTubeJacketMassPerMeter + launcherBracketsMassPerMeter + launcherRailsMassPerMeter
  const launcherRampSteelCost = launcherRampSteelMassPerMeter * costOfSteel * launcher.launcherRampLength
  specs['launcherRampSteelCost'] = {value: launcherRampSteelCost/1e6, units: 'M USD'}
  //console.log('launcherRampSteelCost', launcherRampSteelCost/1e6, 'M USD')

  // Ramp Vacuum Pumps
  const launcherRampVacuumPumpsCost = launcherVacuumPumpCost * launcherVacuumPumpsPerMeter * launcher.launcherRampLength
  specs['launcherRampVacuumPumpsCost'] = {value: launcherRampVacuumPumpsCost/1e6, units: 'M USD'}
  //console.log('launcherRampVacuumPumpsCost', launcherRampVacuumPumpsCost/1e6, 'M USD')

  // Ramp Concrete Tube
  const launcherRampConcreteTubeVolume = launcherConcreteTubeVolumePerMeter * launcher.launcherRampLength
  const launcherRampConcreteTubeMass = launcherRampConcreteTubeVolume * densityOfConcrete
  const launcherRampConcreteTubeCost = launcherRampConcreteTubeMass * costOfConcrete
  specs['launcherRampConcreteTubeCost'] = {value: launcherRampConcreteTubeCost/1e6, units: 'M USD'}
  //console.log('launcherRampConcreteTubeCost', launcherRampConcreteTubeCost/1e6, 'M USD')

  // Suspended Evacuated Tube
  const launcherSuspendedTubeMassPerMeter = dParamWithUnits['launcherSuspendedTubeMassPerMeter'].value // kg/m
  const capitalCostPerKgSupported = (specs.hasOwnProperty('capitalCostPerKgSupported')) ? specs['capitalCostPerKgSupported'].value: dParamWithUnits['defaultcapitalCostPerKgSupported'].value
  //console.log('capitalCostPerKgSupported', capitalCostPerKgSupported)
  const launcherSuspendedTubeCost = launcherSuspendedTubeMassPerMeter * (costOfAluminum + capitalCostPerKgSupported) * launcher.launcherEvacuatedTubeLength
  specs['launcherSuspendedTubeCost'] = {value: launcherSuspendedTubeCost/1e6, units: 'M USD'}
  //console.log('launcherSuspendedTubeCost', launcherSuspendedTubeCost/1e6, 'M USD')

  // Suspended Evacuated Tube Vacuum Pumps
  const launcherEvacuatedTubeVacuumPumpsCost = launcherVacuumPumpCost * launcherVacuumPumpsPerMeter * launcher.launcherEvacuatedTubeLength

  const launcherFactoryCost = dParamWithUnits['launcherFactoryCost'].value
  specs['launcherFactoryCost'] = {value: launcherFactoryCost/1e6, units: 'M USD'}
  //console.log('launcherFactoryCost', launcherFactoryCost/1e6, 'M USD')

  const launcherSteelCost = launcherMassDriverSteelCost + launcherRampSteelCost
  const launcherMotorsCost = launcherMassDriverMotorsCost
  const launcherVacuumPumpsCost = launcherMassDriverVacuumPumpsCost + launcherRampVacuumPumpsCost + launcherEvacuatedTubeVacuumPumpsCost
  const launcherConcreteTubeCost = launcherMassDriverConcreteTubeCost + launcherRampConcreteTubeCost

  const launcherMassDriverCost = launcherMassDriverSteelCost + launcherMassDriverConcreteTubeCost + launcherMassDriverMotorsCost + launcherMassDriverVacuumPumpsCost
  const launcherRampCost = launcherRampSteelCost + launcherRampConcreteTubeCost + launcherRampVacuumPumpsCost
  const launcherEvacuatedTubeCost = launcherSuspendedTubeCost + launcherEvacuatedTubeVacuumPumpsCost
  //console.log('launcherMassDriverCost', launcherMassDriverCost/1e6, 'M USD')
  //console.log('launcherRampCost ', launcherRampCost/1e6, 'M USD')
  //console.log('launcherEvacuatedTubeCost', launcherEvacuatedTubeCost/1e6, 'M USD')

  const launcherTotalCost = launcherSteelCost + launcherMotorsCost + launcherVacuumPumpsCost + launcherConcreteTubeCost + launcherSuspendedTubeCost + launcherFactoryCost
  specs['launcherTotalCost'] = {value: launcherTotalCost/1e6, units: 'M USD'}
  //console.log('launcherTotalCost', launcherTotalCost/1e6, 'M USD')

}

export function adjustedTimeSinceStart(slowDownPassageOfTime, timeSinceStart,
                                       launcherStartDelayInSeconds = 25) {
  return Math.max(0, timeSinceStart - launcherStartDelayInSeconds) * slowDownPassageOfTime
}

// Returns x with its magnitude raised to at least `min` (0 maps to +min). Used to keep the screw and
// grappler geometry finite when the GUI sets screw speed or acceleration to 0: a non-rotating screw or
// a non-accelerating sled has no meaningful variable-pitch thread, so the geometry is only indicative.
export function nonZero(x, min) {
  if (!Number.isFinite(x)) return min
  return (x < 0) ? Math.min(x, -min) : Math.max(x, min)
}

// The screw thread's phase and pitch at a distance along the screw are set by the adaptive nut's
// motion: its centre starts at initialDistance (half the nut's length) moving at initialVelocity and
// accelerates uniformly, and the thread at each point matches the nut's speed as its centre passes.
// The thread behind initialDistance is only ever run over by the nut's rear grapplers; it continues
// at the initial pitch (as if the nut had been moving at initialVelocity before launch), so the pitch
// is continuous and never zero there. (It used to have no solution there: the thread ran straight
// along the screw, and the grapplers divided by a zero pitch.)
//
// threadTime returns the time (s) in the convention the screw and grappler geometry have always used:
// the negative root of d = d0 + v0 t + a t^2 / 2, which mirrors the helix (t = -t_launch - 2 v0 / a).
// threadSpeed returns the matching signed forward speed (m/s), v0 + a t, whose magnitude is the
// nut's speed. Callers apply nonZero() / Math.max(1, ...) to acceleration and initialVelocity.
export function threadTime(distance, initialVelocity, initialDistance, acceleration, motion = null) {
  if (motion && distance - initialDistance >= motion.horizontalLength) return -2 * initialVelocity / acceleration - screwStateAtDistance(motion, distance - initialDistance).t
  const ahead = distance - initialDistance
  if (ahead >= 0) return (-initialVelocity - Math.sqrt(Math.max(0, initialVelocity**2 + 2 * acceleration * ahead))) / acceleration
  return -2 * initialVelocity / acceleration - ahead / initialVelocity
}

export function threadSpeed(distance, initialVelocity, initialDistance, acceleration, motion = null) {
  if (motion && distance - initialDistance >= motion.horizontalLength) return -Math.max(1e-3, screwStateAtDistance(motion, distance - initialDistance).v)
  const ahead = distance - initialDistance
  if (ahead >= 0) return -Math.sqrt(Math.max(0, initialVelocity**2 + 2 * acceleration * ahead))
  return -initialVelocity
}

// Angular extent of the flight's forward (+along-track) face at a pad radius.
// ScrewGeometry's other face is at phase zero. Intersect its straight tapered wall with the circle
// at radius, so pads agree with the actual mesh rather than treating a flight as infinitely thin.
export function screwFlightFrontAngle(radius, shaftRadius, threadRadius, threadThickness, taperRatio, outerPitch) {
  const crossWidth = Math.min(threadThickness * Math.hypot(outerPitch, 1) / Math.max(1e-12, Math.abs(outerPitch)), shaftRadius / 2)
  const rootAngle = Math.asin(crossWidth / shaftRadius)
  const tipAngle = Math.asin(crossWidth * taperRatio / threadRadius)
  if (radius <= shaftRadius) return rootAngle
  if (radius >= threadRadius) return tipAngle
  const x = shaftRadius * Math.cos(rootAngle), y = shaftRadius * Math.sin(rootAngle)
  const dx = threadRadius * Math.cos(tipAngle) - x, dy = threadRadius * Math.sin(tipAngle) - y
  const a = dx * dx + dy * dy, b = x * dx + y * dy
  const u = Math.max(0, Math.min(1, (-b + Math.sqrt(Math.max(0, b * b + a * (radius * radius - shaftRadius * shaftRadius)))) / a))
  return Math.atan2(y + u * dy, x + u * dx)
}

// Magnetic attraction pulls a trailing pad forward during acceleration and a leading pad backward
// during braking. This changes contact face, never the helix handedness.
export function screwContactSide(motion, distance) {
  return motion && motion.brakingDeceleration !== 0 && Number.isFinite(motion.brakingStartDistance) && distance >= motion.brakingStartDistance ? 1 : -1
}

// Distance along the screw from which a thread with threadStarts flights can drive the nut. A grappler pad engages by sitting
// in the groove between two adjacent flights, so the groove must fit the pad and the clearance it
// lifts away by. The groove is measured square to the flight faces at the pad's inner edge (radius
// padInnerRadius, where it is narrowest), as (lead / threadStarts) * cos(leadAngle) - flight thickness,
// with lead = speed / rev/s, tan(leadAngle) = lead / (2 pi padInnerRadius), and the flight thickness
// tapering from threadThickness at the shaft to threadThickness * threadTaperRatio at the tips.
// Near the breech the nut is slow, the lead is tiny and the flights would overlap; there the screw is
// a plain shaft and the pads stay disengaged.
// Returns -Infinity if the thread is valid from the breech, Infinity if a pad can never fit.
export function threadStartDistance({ initialVelocity, initialDistance, acceleration, revolutionsPerSecond,
  threadStarts, shaftRadius, threadRadius, threadThickness, threadTaperRatio, padInnerRadius, padThickness }) {
  initialVelocity = Math.max(1, initialVelocity)
  const radius = Math.min(threadRadius, Math.max(shaftRadius, padInnerRadius))
  const heightFraction = (threadRadius > shaftRadius) ? (radius - shaftRadius) / (threadRadius - shaftRadius) : 0
  const flightThickness = threadThickness * (1 - (1 - threadTaperRatio) * heightFraction)
  const width = flightThickness + padThickness
  const circumference = 2 * Math.PI * radius
  const n = Math.max(1, threadStarts)
  if (circumference <= n * width) return Infinity
  const minimumLead = n * width * circumference / Math.sqrt(circumference**2 - (n * width)**2)
  const minimumSpeed = Math.abs(nonZero(revolutionsPerSecond, 1e-3)) * minimumLead
  if (initialVelocity >= minimumSpeed) return -Infinity
  if (!(acceleration > 0)) return Infinity
  return initialDistance + (minimumSpeed**2 - initialVelocity**2) / (2 * acceleration)
}

// How the screw's thread is laid out along its length (shared by the screws, the adaptive nuts and
// the specs). The screw always uses the largest number of starts (flights) in its doubling sequence
// that still leaves room for a grappler pad between adjacent flights (see threadStartDistance).
// Flight k of n sits at phase k / n, so doubling n keeps the existing flights and starts new ones
// halfway between them. The grapplers need an even number of flights (which also keeps the screw
// balanced), so every number in the sequence is even. It is set by the launcherMassDriverScrewThreadStarts
// parameter, the maximum M (rounded down to an even number, at least 2): M halved for as long as the
// result stays even (8: 2, 4, 8; 12: 6, 12; 10: 10). 0 means 8, about the most the current flight and
// pad geometry allows. The thread begins where the first number in the sequence fits; before that the
// screw is a plain shaft.
// segmentLength: when given, extra starts begin at the next screw segment boundary, so each segment
// has a single number of starts (the first flight can begin mid-segment).
export function screwThreadLayout(dParamWithUnits, segmentLength = 0, segmentOrigin = 0) {
  const p = (name) => dParamWithUnits[name].value
  const common = {
    initialVelocity: p('launcherMassDriver1InitialVelocity'),
    initialDistance: p('adaptiveNutBodyLength') / 2,
    acceleration: nonZero(p('launchVehicleMassDriverForwardAcceleration'), 1e-3),
    revolutionsPerSecond: p('launcherMassDriverScrewRevolutionsPerSecond'),
    shaftRadius: p('launcherMassDriverScrewShaftOuterRadius'),
    threadRadius: p('launcherMassDriverScrewThreadRadius'),
    threadThickness: p('launcherMassDriverScrewThreadThickness'),
    threadTaperRatio: p('launcherMassDriverScrewThreadTaperRatio'),
    padInnerRadius: p('launcherMassDriverScrewShaftOuterRadius') + p('adaptiveNutShaftToGrapplerPad'),
    padThickness: p('adaptiveNutGrapplerMagnetThickness') + p('adaptiveNutGrapplerPadLiftAwayDistance'),
  }
  const requested = Math.round(p('launcherMassDriverScrewThreadStarts'))
  const maxStarts = (requested >= 1) ? Math.max(2, requested - (requested % 2)) : 8
  let firstStarts = maxStarts
  while (firstStarts % 4 === 0) firstStarts /= 2
  // steps[i]: { starts, distance } where that many starts begin; distances increase with starts.
  const steps = []
  for (let starts = firstStarts; starts <= maxStarts; starts *= 2) {
    let distance = threadStartDistance({ ...common, threadStarts: starts })
    if (distance === Infinity) break
    if (starts > firstStarts && segmentLength > 0 && Number.isFinite(distance)) distance = segmentOrigin + Math.ceil((distance - segmentOrigin) / segmentLength - 1e-9) * segmentLength
    steps.push({ starts, distance })
  }
  const threadStart = steps.length ? steps[0].distance : Infinity
  // Starts in use at distance d (the first in the sequence on the plain shaft before the thread).
  const startsAt = (d) => {
    let starts = firstStarts
    for (const step of steps) if (d >= step.distance - 1e-6) starts = step.starts
    return starts
  }
  return {
    threadStartDistance: threadStart,
    steps,
    startsAt,
    flightsAt: (d) => (d >= threadStart) ? startsAt(d) : 0,
  }
}

export function tunnelingCostPerMeter(tunnelRadius) {
  //from "Cost Overruns in Tunnelling Projects: Investigating the Impact of Geological and Geotechnical Uncertainty Using Case Studies", Figure 4a
  // file:///C:/Users/phils/Downloads/infrastructures-05-00073-v2%20(4).pdf
  // Line slope is very roughly 60 million pounds stering per km, or 60,000 pounds per 18 meters diameter tunnel
  
  // Convert Great Britain Pounds to US Dollars
  const GBPtoUSD = 1.31

  return tunnelRadius*2 * 60000 / 18 * GBPtoUSD
}

export function exhaustVelocity(gamma, Tc, M, Pc, Pe) {

  // Computes exhaust velocity (ve) from chamber conditions
  // gamma: ratio of specific heats (e.g., 1.20 for methane/LOX)
  // Tc: combustion chamber temperature (Kelvin)
  // M: molar mass of exhaust gas (kg/mol)
  // Pc: chamber pressure (Pascals)
  // Pe: exit pressure at nozzle (Pascals)

  const R = 8.314 // Universal gas constant J/(mol·K)

  const term1 = (2 * gamma * R * Tc) / ((gamma - 1) * M)
  const pressureRatio = Math.pow(Pe / Pc, (gamma - 1) / gamma)
  const term2 = 1 - pressureRatio

  return Math.sqrt(term1 * term2) // exhaust velocity (m/s)

}

export function calculateExhaustVelocity(engineParams) {
  const { gamma, R, M, Tc, Pe, Pc_max } = engineParams
  
  return Math.sqrt(
    (2 * gamma) / (gamma - 1) * (R / M) * Tc * 
    (1 - Math.pow(Pe / Pc_max, (gamma - 1) / gamma))
  )
}

export function calculateMaxThrust(engineParams) {
  const { mdot_max, Pe, P0, Ae } = engineParams
  const ve = calculateExhaustVelocity(engineParams)
  
  return mdot_max * ve + (Pe - P0) * Ae
}

export function calculateThrustAndExitVelocity(engineParams) {
  // Destructure the engine parameters
  const { Pc_max, Pe, P0, Ae, Tc, gamma, R, M, mdot_max, mdot } = engineParams

  // Recalculate chamber pressure Pc using the original formula
  const Pc = Pc_max * Math.pow(mdot / mdot_max, (gamma - 1) / gamma)

  // Recalculate exit pressure Pe dynamically using isentropic relations
  const Pe_dynamic = Pe * Math.pow(Pc / Pc_max, (gamma - 1) / gamma)

  const Pratio = (Pe_dynamic==0) ? 1 : Pe_dynamic / Pc

  // Calculate exit velocity ve
  const ve = Math.sqrt(
    (2 * gamma) / (gamma - 1) * (R / M) * Tc * 
    (1 - Math.pow(Pratio, (gamma - 1) / gamma))
  )

  // Calculate thrust
  const inertialThrust = mdot * ve
  const pressureThrust = (Pe_dynamic - P0) * Ae
  return {inertialThrust, pressureThrust, ve}
}


export function solveForMassFlowRate({
  targetThrust,        // Desired thrust (N)
  Pc_max,   // Peak chamber pressure (Pa)
  Pe,       // Nozzle exit pressure (Pa)
  P0,       // Ambient pressure (Pa)
  Ae,       // Nozzle exit area (m^2)
  Tc,       // Chamber temperature (K)
  gamma,    // Heat capacity ratio
  R,        // Universal gas constant (J/(mol·K))
  M,        // Molar mass of exhaust gas (kg/mol)
  mdot_max, // Peak mass flow rate (kg/s)
  ve_max,   // Peak exhaust velocity (m/s)
}) {
  // Thrust increases monotonically with mass flow rate, so bisect on mdot in [0, mdot_max].
  // Returns {mdot, thrust} so the caller can use the thrust that is actually achievable: when the
  // requested thrust exceeds the engine's maximum the result is clamped to mdot_max (it used to
  // return 0 on non-convergence, giving full thrust with zero propellant flow).
  const maxIterations = 100
  const tolerance = 1e-6
  const thrustAt = (mdot) => {
    const {inertialThrust, pressureThrust} = calculateThrustAndExitVelocity({
      Pc_max, Pe, P0, Ae, Tc, gamma, R, M, mdot_max, mdot
    })
    return inertialThrust + pressureThrust
  }
  if (!(mdot_max > 0) || !(targetThrust > 0)) return {mdot: 0, thrust: 0}
  const maxThrust = thrustAt(mdot_max)
  if (targetThrust >= maxThrust) return {mdot: mdot_max, thrust: maxThrust}

  let mdot_low = 0   // Lower bound for flow rate
  let mdot_high = mdot_max // Upper bound
  let mdot = (mdot_low + mdot_high) / 2
  let thrust = thrustAt(mdot)
  for (let i = 0; i < maxIterations; i++) {
    const error = thrust - targetThrust
    if (Math.abs(error) < tolerance) break
    if (error > 0) mdot_high = mdot
    else mdot_low = mdot
    mdot = (mdot_low + mdot_high) / 2
    thrust = thrustAt(mdot)
  }
  return {mdot, thrust}
}

export function getAerodynamicDrag(airDensity, coefficientOfDrag, speed, radius, length) {
  // Calculate the atmospheric density at the given altitude using the barometric formula

  // Calculate the cross-sectional area of the object
  const crossSectionalArea = Math.PI * radius * radius

  // Calculate the drag force using the drag equation
  const dragForce = 0.5 * coefficientOfDrag * airDensity * speed * speed * crossSectionalArea

  return dragForce
}

export function cycloid3D(s, r, startPos, initialDirection) {
    
  const theta = 2 * Math.acos(1 - s / (4 * r)) // Rolling angle based on arc length

  const planetRadius = startPos.length()

  // Compute rolling point in polar coordinates
  const rollingPointR = planetRadius
  const rollingPointPhi = r * theta / planetRadius

  // Compute cycloid position in polar coordinates
  const cycloidR = rollingPointR + r * (1 - Math.cos(theta)) // Height above planet
  const cycloidPhi = rollingPointPhi - r * Math.sin(theta) / planetRadius

  const rotationAxis = new THREE.Vector3().crossVectors(startPos, initialDirection).normalize()

  const cycloidPosition = startPos.clone().applyAxisAngle(rotationAxis, cycloidPhi).multiplyScalar(cycloidR/planetRadius)

  // Compute Tangent Vector
  const topOfCircleR = rollingPointR + 2*r
  const topOfCirclePos = startPos.clone().applyAxisAngle(rotationAxis, rollingPointPhi).multiplyScalar(topOfCircleR/planetRadius)
  const cycloidTangent = (theta==Math.PI) ? initialDirection.clone() : topOfCirclePos.clone().sub(cycloidPosition).normalize()

  if (Number.isNaN(cycloidPosition.x + cycloidPosition.y + cycloidPosition.z) ||
      Number.isNaN(cycloidTangent.x + cycloidTangent.y + cycloidTangent.z)) {
    console.warn('cycloid3D produced NaN', s, r)
  }
  return { cycloidPosition, cycloidTangent }
}


// // Usage Example
// const sampleData = {
//   x: [0, 1, 2, 3, 4, 5],
//   y: [10, 20, 15, 25, 30, 40]
// };

// tram.openPlotWindow(sampleData)
//   .then(() => console.log("Plot window opened successfully"))
//   .catch(err => console.error(err));

export function estimateVehicleVolumeMass(radius, bodyLength, noseconeLength, rocketEngineLength) {
  // Estimte the launchVehicle's volume and dry mass from its mass diameter and length
  const r = radius
  const bl = bodyLength
  const ncl = noseconeLength
  const rel = rocketEngineLength
  
  const π = Math.PI
  const interiorVolume = r**2 * π * (bl - rel  + ncl/3)
  const surfaceArea = 2 * π * r * bl + π * r * Math.sqrt(ncl**2 + r**2)
  const skinThickness = 0.003  // Includes any ribs, stringers, etc as well as skin
  const skinMaterialDensity = 8000 // kg/m3
  const rocketEngineMass = 3177 // kg (based on RS-25)
  const avionicsEtcMass = 1000 // kg

  const dryMass = skinMaterialDensity * surfaceArea * skinThickness + rocketEngineMass + avionicsEtcMass
  return {interiorVolume, dryMass}
}

// export function openPlotWindow(data) {
//   // Create a new window
//   const plotWindow = window.open("", "_blank", "width=800,height=600")
  
//   // Basic HTML template with Plotly.js
//   plotWindow.document.write(`
//     <html>
//     <head>
//       <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
//     </head>
//     <body>
//       <div id="plot" style="width:100%;height:100%;"></div>
//       <script>
//         const trace = {
//           x: ${JSON.stringify(data.x)},
//           y: ${JSON.stringify(data.y)},
//           mode: 'lines+markers',
//           type: 'scatter'
//         };
//         Plotly.newPlot('plot', [trace]);
//       </script>
//     </body>
//     </html>
//   `)
// }

export function calculateQConv(vehicleAirSpeed, airDensity, launchVehicleNoseConeTipRadius) {
  const kConv = 1.83e-4  //W·s3·m-2·kg1/2
  const qConv = kConv * vehicleAirSpeed**3 * (airDensity/launchVehicleNoseConeTipRadius)**0.5
  return qConv
}

export function calculateQRad(vehicleAirSpeed, airDensity) {
  const kRad = 2e-7 //W·s4·m-6·kg-1
  const qRad = kRad * vehicleAirSpeed**4 * airDensity
  return qRad
}
