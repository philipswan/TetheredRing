import { massDriverBracketModel } from "./MassDriverBracket"
import { massDriverScrewModel } from "./MassDriverScrew"
import * as tram from './tram.js'

export function define_genLauncherSpecs() {

  return function (dParamWithUnits, specs, planetSpec) {

    const massDriverLength = this.launcherMassDriver1Length+this.launcherMassDriver2Length
    const rampLength = this.launcherRampLength
    const elevatedVacuumTubeLength = this.launcherSuspendedEvacuatedTubeLength
    const screwSpacing = dParamWithUnits['launcherMassDriverScrewRoughLength'].value + dParamWithUnits['launcherMassDriverScrewBracketThickness'].value

    const tempBracketObject = new massDriverBracketModel(dParamWithUnits, this.massDriver2Curve, this.launcherMassDriver2Length, (this.massDriverScrewSegments+1), 0)
    tempBracketObject.genSpecs(dParamWithUnits, specs)
    const massDriverNumBrackets = massDriverLength / screwSpacing
    const launcherMassDriverBracketsTotalMass = specs['massDriverBracketMass'].value * massDriverNumBrackets
    specs['launcherMassDriverBracketsTotalMass'] = {value: launcherMassDriverBracketsTotalMass, units: "kg"}
    const massDriverBracketsCostOfMaterials = dParamWithUnits['launcherMassDriverScrewBracketMaterialCost'].value * launcherMassDriverBracketsTotalMass
    specs['massDriverBracketsCostOfMaterials'] = {value: massDriverBracketsCostOfMaterials, units: "USD"}

    this.railModelObject.genSpecs(dParamWithUnits, specs)
    const massDriverRailMaterialDensity = dParamWithUnits['launcherMassDriverRailMaterialDensity'].value
    const launcherMassDriverRailTotalMass = specs['massDriverRailCrosssectionalArea'].value * massDriverLength * massDriverRailMaterialDensity
    specs['launcherMassDriverRailTotalMass'] = {value: launcherMassDriverRailTotalMass, units: "kg"}
    const massDriverRailsCostOfMaterials = launcherMassDriverRailTotalMass * dParamWithUnits['launcherMassDriverRailMaterialCost'].value
    specs['massDriverRailsCostOfMaterials'] = {value: massDriverRailsCostOfMaterials, units: "USD"}
    
    const tempScrewObject = new massDriverScrewModel()
    tempScrewObject.genSpecs(dParamWithUnits, specs)
    const launcherMassDriverScrewsTotalMass = specs['massDriverScrewMass'].value * this.massDriverScrewSegments * 2
    specs['launcherMassDriverScrewsTotalMass'] = {value: launcherMassDriverScrewsTotalMass, units: "kg"}
    const massDriverScrewsCostOfMaterials = specs['massDriverScrewMaterialCost'].value * this.massDriverScrewSegments * 2
    specs['massDriverScrewsCostOfMaterials'] = {value: massDriverScrewsCostOfMaterials, units: "USD"}

    // Steel vacuum tube. Currently the assumption is that this steel tube is directly imersed in the sea water. Another possibility is that
    // The steel tube is housed inside a concrete tube which is then imersed in the sea water. This would allow for maintenance access to the
    // outside of the smaller steel tube, would protect the steel tube from sea water, and would allow the position of the steel tube to be adjusted
    // within the concrete tube.
    this.tubeModelObject.genSpecs(dParamWithUnits, specs)
    const massDriverTubeWallTotalVolume = specs['massDriverTubeWallCrosssectionalArea'].value * massDriverLength
    specs['massDriverTubeWallTotalVolume'] = {value: massDriverTubeWallTotalVolume, units: "m3"}
    const launcherMassDriverTubeMaterial0Density = dParamWithUnits['launcherMassDriverTubeMaterial0Density'].value
    const launcherMassDriverTubeWallTotalMass = launcherMassDriverTubeMaterial0Density * massDriverTubeWallTotalVolume
    specs['launcherMassDriverTubeWallTotalMass'] = {value: launcherMassDriverTubeWallTotalMass, units: "kg"}
    const launcherMassDriverTubeMaterial0Cost = dParamWithUnits['launcherMassDriverTubeMaterial0Cost'].value
    const massDriverTubeWallCostOfMaterials = launcherMassDriverTubeWallTotalMass * launcherMassDriverTubeMaterial0Cost
    specs['massDriverTubeWallCostOfMaterials'] = {value: massDriverTubeWallCostOfMaterials, units: "USD"}

    const massDriverTubeLinerTotalVolume = specs['massDriverTubeLinerCrosssectionalArea'].value * (this.launcherMassDriver1Length+this.launcherMassDriver2Length+this.launcherRampLength)
    specs['massDriverTubeLinerTotalVolume'] = {value: massDriverTubeLinerTotalVolume, units: "m3"}
    const launcherMassDriverTubeMaterial1Density = dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    const launcherMassDriverTubeLinerTotalMass = launcherMassDriverTubeMaterial1Density * massDriverTubeLinerTotalVolume
    specs['launcherMassDriverTubeLinerTotalMass'] = {value: launcherMassDriverTubeLinerTotalMass, units: "kg"}
    const launcherMassDriverTubeMaterial1Cost = dParamWithUnits['launcherMassDriverTubeMaterial1Cost'].value
    const massDriverTubeLinerCostOfMaterials = launcherMassDriverTubeLinerTotalMass * launcherMassDriverTubeMaterial1Cost
    specs['massDriverTubeLinerCostOfMaterials'] = {value: massDriverTubeLinerCostOfMaterials, units: "USD"}

    console.print("launcherMassDriver1Length, ", Math.round(this.launcherMassDriver1Length), "m")
    console.print("launcherMassDriver2Length, ", Math.round(this.launcherMassDriver2Length), "m")
    console.print("launcherRampLength, ", Math.round(this.launcherRampLength), "m")
    console.print("elevatedVacuumTubeLength, ", Math.round(elevatedVacuumTubeLength), "m")

    console.print("massDriverBracketsCostOfMaterials, ", Math.round(specs['massDriverBracketsCostOfMaterials'].value/1e6)/1e3, "B USD")
    console.print("massDriverRailsCostOfMaterials, ", Math.round(specs['massDriverRailsCostOfMaterials'].value/1e6)/1e3, "B USD")
    console.print("massDriverScrewsCostOfMaterials, ", Math.round(specs['massDriverScrewsCostOfMaterials'].value/1e6)/1e3, "B USD")
    console.print("massDriverTubeWallCostOfMaterials, ", Math.round(specs['massDriverTubeWallCostOfMaterials'].value/1e6)/1e3, "B USD")
    console.print("massDriverTubeLinerCostOfMaterials, ", Math.round(specs['massDriverTubeLinerCostOfMaterials'].value/1e6)/1e3, "B USD")

    const launcherMassDriverTotalMass = 
      launcherMassDriverTubeWallTotalMass +
      launcherMassDriverTubeLinerTotalMass +
      launcherMassDriverBracketsTotalMass + 
      launcherMassDriverRailTotalMass +
      launcherMassDriverScrewsTotalMass

    specs['launcherMassDriverTotalMass'] = {value: launcherMassDriverTotalMass, units: "kg"}
    console.print("launcherMassDriverTotalMass", Math.round(launcherMassDriverTotalMass/1e6)/1e3, " B kg")

    const launcherMassDriverTotalMassPerMeter = launcherMassDriverTotalMass / massDriverLength
    specs['launcherMassDriverTotalMassPerMeter'] = {value: launcherMassDriverTotalMassPerMeter, units: "kg"}
    console.print("launcherMassDriverTotalMassPerMeter", launcherMassDriverTotalMassPerMeter, "kg")

    const steelTubeOuterRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value + dParamWithUnits['launcherMassDriverTubeWallThickness'].value + dParamWithUnits['launcherMassDriverTubeLinerThickness'].value
    const massDriverTubeTotalVolume = Math.PI * steelTubeOuterRadius**2 * massDriverLength
    const densityOfSeaWater = 1025 // kg/m3
    const massOfDisplacedSeaWaterPerMeter = massDriverTubeTotalVolume / massDriverLength * densityOfSeaWater
    specs['massOfDisplacedSeaWaterPerMeter'] = {value: massOfDisplacedSeaWaterPerMeter, units: "kg/m"}
    console.print("massOfDisplacedSeaWaterPerMeter", massOfDisplacedSeaWaterPerMeter, "kg/m")

    const launcherMassDriverTotalMaterialsCost = 
      massDriverTubeWallCostOfMaterials +
      massDriverTubeLinerCostOfMaterials +
      massDriverBracketsCostOfMaterials + 
      massDriverRailsCostOfMaterials +
      massDriverScrewsCostOfMaterials

    console.print("launcherMassDriverTotalMaterialsCost, ", Math.round(launcherMassDriverTotalMaterialsCost/1e6)/1e3, "B USD")
    const launcherMassDriverTotalMaterialsCostPerMeter = launcherMassDriverTotalMaterialsCost / massDriverLength
    specs['launcherMassDriverTotalMaterialsCostPerMeter'] = {value: launcherMassDriverTotalMaterialsCostPerMeter, units: "USD/m"}
    console.print("launcherMassDriverTotalMaterialsCostPerMeter, ", Math.round(launcherMassDriverTotalMaterialsCostPerMeter), "USD/m")

    const screwMotorUnitCost = dParamWithUnits['launcherMassDriverScrewMotorCost'].value
    const launcherMassDriverScrewMotorsCost = screwMotorUnitCost * this.massDriverScrewSegments * 2
    specs['launcherMassDriverScrewMotorsCost'] = {value: launcherMassDriverScrewMotorsCost, units: "USD"}
    console.print("launcherMassDriverScrewMotorsCost, ", Math.round(launcherMassDriverScrewMotorsCost/1e6)/1e3, "B USD")

    const massDriverManufacturingFactor = 2 // Placeholder
    const launcherMassDriverTotalCost = launcherMassDriverTotalMaterialsCost * massDriverManufacturingFactor + launcherMassDriverScrewMotorsCost
    specs['launcherMassDriverTotalCost'] = {value: launcherMassDriverTotalCost, units: "USD"}
    console.print("launcherMassDriverTotalCost, ", Math.round(launcherMassDriverTotalCost/1e6)/1e3, "B USD")

    // Ramp costs
    // Tube walls
    // Todo: Borrowing the tube wall cross-section from the massdriver for the ramp, but ramp should probably have its own unique design.
    const rampTubeWallTotalVolume = specs['massDriverTubeWallCrosssectionalArea'].value * this.launcherRampLength
    specs['rampTubeWallTotalVolume'] = {value: rampTubeWallTotalVolume, units: "m3"}
    const rampTubeWallTotalMass = launcherMassDriverTubeMaterial0Density * rampTubeWallTotalVolume
    specs['rampTubeWallTotalMass'] = {value: rampTubeWallTotalMass, units: "kg"}
    const rampTubeWallCostOfMaterials = rampTubeWallTotalMass * launcherMassDriverTubeMaterial0Cost
    specs['rampTubeWallCostOfMaterials'] = {value: rampTubeWallCostOfMaterials, units: "USD"}
    console.print("rampTubeWallCostOfMaterials, ", Math.round(rampTubeWallCostOfMaterials/1e6)/1e3, "B USD")

    // Brackets
    // Todo: Borrowing the bracket cross-section from the massdriver for the ramp, but ramp should probably have its own unique design.
    const rampNumBrackets = rampLength / screwSpacing
    const rampBracketsTotalMass = specs['massDriverBracketMass'].value * rampNumBrackets
    specs['rampBracketsTotalMass'] = {value: rampBracketsTotalMass, units: "kg"}
    const rampBracketsCostOfMaterials = dParamWithUnits['launcherMassDriverScrewBracketMaterialCost'].value * rampBracketsTotalMass
    specs['rampBracketsCostOfMaterials'] = {value: rampBracketsCostOfMaterials, units: "USD"}
    console.print("rampBracketsCostOfMaterials, ", Math.round(rampBracketsCostOfMaterials/1e6)/1e3, "B USD")

    // Rails
    // Todo: Borrowing the rail cross-section from the massdriver for the ramp, but ramp should probably have its own unique design.
    const rampRailsTotalVolume = specs['massDriverRailCrosssectionalArea'].value * this.launcherRampLength
    specs['rampRailsTotalVolume'] = {value: rampRailsTotalVolume, units: "m3"}
    const rampRailsTotalMass = rampRailsTotalVolume * massDriverRailMaterialDensity
    specs['rampRailsTotalMass'] = {value: rampRailsTotalMass, units: "kg"}
    const rampRailsCostOfMaterials = rampRailsTotalMass * dParamWithUnits['launcherMassDriverRailMaterialCost'].value
    specs['rampRailsCostOfMaterials'] = {value: rampRailsCostOfMaterials, units: "USD"}
    console.print("rampRailsCostOfMaterials, ", Math.round(rampRailsCostOfMaterials/1e6)/1e3, "B USD")

    // Tunneling costs
    const tunnelRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value + 1.0
    const tunnelingCostPerMeter = tram.tunnelingCostPerMeter(tunnelRadius)
    const rampTunnelingCost = tunnelingCostPerMeter * (this.launcherRampLength)
    specs['rampTunnelingCost'] = {value: rampTunnelingCost, units: "USD"}
    console.print("rampTunnelingCost, ", Math.round(rampTunnelingCost/1e6)/1e3, "B USD")

    // ToDo: Tunnelling isn't really a "materials cost"...
    const launcherRampTotalMaterialsCost = 
      rampTubeWallCostOfMaterials +
      rampBracketsCostOfMaterials +
      rampRailsCostOfMaterials
    specs['launcherRampTotalMaterialsCost'] = {value: launcherRampTotalMaterialsCost, units: "USD"}
    console.print("launcherRampTotalMaterialsCost, ", Math.round(launcherMassDriverTotalMaterialsCost/1e6)/1e3, "B USD/m")
      
    const rampManufacturingCostFactor = 2 // Placeholder
    const launcherRampTotalCost = launcherRampTotalMaterialsCost*rampManufacturingCostFactor + rampTunnelingCost
    specs['launcherRampTotalCost'] = {value: launcherRampTotalCost, units: "USD"}
    console.print("launcherRampTotalCost, ", Math.round(launcherRampTotalCost/1e6)/1e3, "B USD")

    const launcherRampTotalCostPerMeter = launcherRampTotalCost / rampLength
    specs['launcherRampTotalCostPerMeter'] = {value: launcherRampTotalCostPerMeter, units: "USD/m"}
    console.print("launcherRampTotalCostPerMeter, ", Math.round(launcherRampTotalCostPerMeter), "USD/m")

    // Elevated Vacuum Tube (EVT) - Aeronautically Supported Case
    // Evacuated Tube
    const elevatedVacuumTubeTubeCostPerMeter = 6047.9 * 1e6 / 52582 // "Spirit Aerosystems Annual Report and Form 10-K", https://investor.spiritaero.com/filings-financials/FinancialDocs/default.aspx net revenues divided by meters of fuselage they produced in 2023.
    specs['elevatedVacuumTubeTubeCostPerMeter'] = {value: elevatedVacuumTubeTubeCostPerMeter, units: "USD/m"}
    console.print("elevatedVacuumTubeTubeCostPerMeter, ", Math.round(elevatedVacuumTubeTubeCostPerMeter), "USD/m")
    const launcherElevatedVacuumTubeTubeCost = elevatedVacuumTubeTubeCostPerMeter * elevatedVacuumTubeLength
    specs['launcherElevatedVacuumTubeTubeCost'] = {value: launcherElevatedVacuumTubeTubeCost, units: "USD"}
    console.print("launcherElevatedVacuumTubeTubeCost, ", Math.round(launcherElevatedVacuumTubeTubeCost/1e6)/1e3, "B USD")
    const id = dParamWithUnits['elevatedVacuumTubeInnerRadius'].value
    const od = id + dParamWithUnits['elevatedVacuumTubeThickness'].value
    const elevatedVacuumTubeCrosssectionalArea = Math.PI * (od**2 - id**2)
    const massOfElevatedVacuumTubeTube = elevatedVacuumTubeLength * elevatedVacuumTubeCrosssectionalArea * dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    specs['massOfElevatedVacuumTubeTube'] = {value: massOfElevatedVacuumTubeTube, units: "kg"}
    console.print("massOfElevatedVacuumTubeTube, ", Math.round(massOfElevatedVacuumTubeTube), "kg")

    const buoyancyOfElevatedVacuumTubePerMeter = od**2 * Math.PI * planetSpec.airDensityAtAltitude(dParamWithUnits['launcherRampExitAltitude'].value) 
    specs['buoyancyOfElevatedVacuumTubePerMeter'] = {value: buoyancyOfElevatedVacuumTubePerMeter, units: "kg/m"}
    console.print("buoyancyOfElevatedVacuumTubePerMeter, ", Math.round(buoyancyOfElevatedVacuumTubePerMeter), "kg/m")

    // Lift Nacells
    // Cost per kg supported calculation for a quadcopter (https://www.tytorobotics.com/blogs/articles/the-drone-design-loop-for-brushless-motors-and-propellers?srsltid=AfmBOooBz13gKru7SlW1_dhMBbeBSmaH4XScp-2CpOyOJeFcZDF39_9m)
    // const motorMass = 0.148
    // const propellerMass = 0.0135
  
    // Payload mass is calculated by subtracting dry mass (not including batteries) from maximum takeoff mass
    // Base this on XAGV40, which has a maximum takeoff mass of 44 kg, a dry mass of 20 kg, and costs $5000
    const XAGV40MaxTakeoffMass = 44 // kg
    const XAGV40DryMass = 20 // kg
    const XAGV40VehicleCost = 5000 // USD
    const XAGV40PayloadMass = XAGV40MaxTakeoffMass - XAGV40DryMass
    const aeronauticLiftCapitalCostPerKgOfPayload = XAGV40VehicleCost / XAGV40PayloadMass
    console.print("aeronauticLiftCapitalCostPerKgOfPayload, ", Math.round(aeronauticLiftCapitalCostPerKgOfPayload), "USD/kg")
    const launcherAeronauticLiftTotalCapitalCost = aeronauticLiftCapitalCostPerKgOfPayload * massOfElevatedVacuumTubeTube
    specs['launcherAeronauticLiftTotalCapitalCost'] = {value: launcherAeronauticLiftTotalCapitalCost, units: "USD"}
    console.print("launcherAeronauticLiftTotalCapitalCost, ", Math.round(launcherAeronauticLiftTotalCapitalCost/1e6)/1e3, "B USD")
    
    const elevatedVacuumTubeTotalCost = launcherElevatedVacuumTubeTubeCost + launcherAeronauticLiftTotalCapitalCost
    specs['elevatedVacuumTubeTotalCost'] = {value: elevatedVacuumTubeTotalCost, units: "USD"}
    console.print("elevatedVacuumTubeTotalCost, ", Math.round(elevatedVacuumTubeTotalCost/1e6)/1e3, "B USD")

    // Total Launcher Capital Cost
    const launcherTotalCapitalCost = launcherMassDriverTotalCost + launcherRampTotalCost + elevatedVacuumTubeTotalCost
    specs['launcherTotalCapitalCost'] = {value: launcherTotalCapitalCost, units: "USD"}
    console.print("launcherTotalCapitalCost, ", Math.round(launcherTotalCapitalCost/1e6)/1e3, "B USD")

    const massDriverCostPerMeter = launcherMassDriverTotalCost / massDriverLength
    specs['massDriverCostPerMeter'] = {value: massDriverCostPerMeter, units: "USD/m"}
    console.print("massDriverCostPerMeter, ", Math.round(massDriverCostPerMeter), "USD/m")
    const rampCostPerMeter = launcherRampTotalCost / rampLength
    specs['rampCostPerMeter'] = {value: rampCostPerMeter, units: "USD/m"}
    console.print("rampCostPerMeter, ", Math.round(rampCostPerMeter), "USD/m")
    const elevatedVacuumTubeCostPerMeter = elevatedVacuumTubeTotalCost / elevatedVacuumTubeLength
    specs['elevatedVacuumTubeCostPerMeter'] = {value: elevatedVacuumTubeCostPerMeter, units: "USD/m"}
    console.print("elevatedVacuumTubeCostPerMeter, ", Math.round(elevatedVacuumTubeCostPerMeter), "USD/m")

    // Operating costs

    // Aeronautic lift
    const costOfGeneratingLiftAeronautically = 7e-7 // USD/N/s  From below Eq.42 in "The Techno-Economic Viability of Actively Supported Structures for Terrestrial Transit and Space Launch"
    const forceOfGravityOnTube = massOfElevatedVacuumTubeTube * 9.81
    const liftForceRequired = forceOfGravityOnTube
    const marsTransferWindowsDuration = 14*24*3600 // 14 days
    const numLaunchesPerMarsTransferWindow = dParamWithUnits['numLaunchesPerMarsTransferWindow'].value
    const numberOfMarsTransferWindows = dParamWithUnits['numberOfMarsTransferWindows'].value
    const liftDuration = numberOfMarsTransferWindows * marsTransferWindowsDuration // 10 mars transfer windows times 14 days per window
    const costOfAeronauticLift = liftForceRequired * liftDuration * costOfGeneratingLiftAeronautically
    specs['costOfAeronauticLift'] = {value: costOfAeronauticLift, units: "USD"}
    console.print("costOfAeronauticLift, ", Math.round(costOfAeronauticLift/1e6)/1e3, "B USD")

    // Initial creation of the vacuum in the vacuum tubes
    // Vacuum Pump specs from: https://www.growinglabs.com/products/rvp-110-two-stage-rotary-vane-vacuum-pump?gad_source=1&gclid=CjwKCAjwl6-3BhBWEiwApN6_kj5CbITtjhMf7N07NNGxm2SC6dTHPM1wDLe9_f_T0EQ-Wnv4t35kShoCtz4QAvD_BwE
    const vacuumPumpPower = 3700 // W
    const vacuumPumpPumpingSpeed = 108/3600 // m^3/s
    const vacuumPumpUltimateTotalPressure = 3.75e-3 * 133.322 // torr converted to Pa
    const vacuumPumpUnitCost = 12129 // USD
    const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value

    const numberOfVacuumPumps = 10000
    const vacuumPumpingSpeed = vacuumPumpPumpingSpeed * numberOfVacuumPumps // m^3/s
    const outsidePressure = 101325 // Pa
    const insidePressure = dParamWithUnits['evacuatedTubeInteriorPressure'].value // Pa
    const interiorVolumeOfMassDiverTube = Math.PI * dParamWithUnits['launcherMassDriverTubeInnerRadius'].value**2 * massDriverLength
    const interiorVolumeOfRampTube = Math.PI * dParamWithUnits['launcherMassDriverTubeInnerRadius'].value**2 * rampLength
    const interiorVolumeOfElevatedVacuumTube = Math.PI * id**2 * elevatedVacuumTubeLength
    const interiorVolumeOfVacuumTubes = interiorVolumeOfMassDiverTube + interiorVolumeOfRampTube + interiorVolumeOfElevatedVacuumTube
    specs['interiorVolumeOfVacuumTubes'] = {value: interiorVolumeOfVacuumTubes, units: "m3"}
    console.print("interiorVolumeOfVacuumTubes, ", Math.round(interiorVolumeOfVacuumTubes), "m3")

    const pumpDownTime = interiorVolumeOfVacuumTubes / vacuumPumpingSpeed * Math.log(outsidePressure/insidePressure)  // https://www.youtube.com/watch?v=bb7E2HAIqp4
    specs['pumpDownTime'] = {value: pumpDownTime, units: "s"}
    console.print("pumpDownTime, ", Math.round(pumpDownTime/2300/24), "days")  

    const capitalCostOfPullingVacuumInsideTubes = vacuumPumpUnitCost * numberOfVacuumPumps
    specs['capitalCostOfPullingVacuumInsideTubes'] = {value: capitalCostOfPullingVacuumInsideTubes, units: "USD"}
    console.print("capitalCostOfPullingVacuumInsideTubes, ", Math.round(capitalCostOfPullingVacuumInsideTubes/1e6)/1e3, "B USD")

    const operatingCostOfPullingVacuumInsideTubes = pumpDownTime * vacuumPumpPower * wholesaleCostOfElectricity * numberOfVacuumPumps * numberOfMarsTransferWindows
    specs['operatingCostOfPullingVacuumInsideTubes'] = {value: operatingCostOfPullingVacuumInsideTubes, units: "USD"}
    console.print("operatingCostOfPullingVacuumInsideTubes, ", Math.round(operatingCostOfPullingVacuumInsideTubes/1e6)/1e3, "B USD")

    // Maintaining the vacuum in the vacuum tubes
    // After each launch we will need to re-evacuate the airlock portion of the tube
    const airlockLength = 1000 // m
    const airlockVolume = Math.PI * id**2 * airlockLength
    const airlockPumpDownTime = airlockVolume / vacuumPumpingSpeed * Math.log(outsidePressure/insidePressure)
    specs['airlockPumpDownTime'] = {value: airlockPumpDownTime, units: "s"}
    console.print("airlockPumpDownTime, ", Math.round(airlockPumpDownTime/2300/24), "days")

    const energyToPullVacuumInsideAirlock = airlockPumpDownTime * vacuumPumpPower * numberOfVacuumPumps
    specs['energyToPullVacuumInsideAirlock'] = {value: energyToPullVacuumInsideAirlock, units: "J"}
    console.print("energyToPullVacuumInsideAirlock, ", Math.round(energyToPullVacuumInsideAirlock), "J")

    const operatingCostOfPullingVacuumInsideAirlock = energyToPullVacuumInsideAirlock * wholesaleCostOfElectricity
    specs['operatingCostOfPullingVacuumInsideAirlock'] = {value: operatingCostOfPullingVacuumInsideAirlock, units: "USD"}
    console.print("operatingCostOfPullingVacuumInsideAirlock, ", Math.round(operatingCostOfPullingVacuumInsideAirlock), "USD")

    // Accelerating Vehicles
    const mVehicle = dParamWithUnits['launchVehicleEmptyMass'].value
    const mPayload = dParamWithUnits['launchVehiclePayloadMass'].value
    const initialPropellantMass = dParamWithUnits['launchVehiclePropellantMass'].value
    const mSled = dParamWithUnits['launchVehicleSledMass'].value
    const mAdaptiveNut = dParamWithUnits['launcherAdaptiveNutMass'].value
    const acceleratedMass = mVehicle + mPayload + initialPropellantMass + mSled
    const regenerativelyDeceleratedMass = mAdaptiveNut
    const massDriverExitSpeed = dParamWithUnits['launcherMassDriverExitVelocity'].value
    const launcherAccelerationEfficiency = dParamWithUnits['launcherAccelerationEfficiency'].value
    const launcherDecelerationEfficiency = dParamWithUnits['launcherDecelerationEfficiency'].value // Assume regenerative breaking is as efficient as accelerating

    const kineticEnergyOfLaunch = 0.5 * acceleratedMass * massDriverExitSpeed**2  // One half m v^2
    const kineticEnergyRecovered = 0.5 * regenerativelyDeceleratedMass * massDriverExitSpeed**2 // One half m v^2
    const massDriverEnergyConsumedPerLaunch = kineticEnergyOfLaunch / launcherAccelerationEfficiency - kineticEnergyRecovered * launcherDecelerationEfficiency
    const massDriverEnergyCostPerLaunch = massDriverEnergyConsumedPerLaunch * wholesaleCostOfElectricity
    specs['massDriverEnergyCostPerLaunch'] = {value: massDriverEnergyCostPerLaunch, units: "USD"}
    console.print("massDriverEnergyCostPerLaunch, ", Math.round(massDriverEnergyCostPerLaunch), "USD")

    const totalEnergyPerLaunch = massDriverEnergyConsumedPerLaunch + energyToPullVacuumInsideAirlock
    specs['totalEnergyPerLaunch'] = {value: totalEnergyPerLaunch, units: "J"}
    console.print("totalEnergyPerLaunch, ", Math.round(totalEnergyPerLaunch), "J")

    const totalEnergyCostPerLaunch = operatingCostOfPullingVacuumInsideAirlock + massDriverEnergyCostPerLaunch
    specs['totalEnergyCostPerLaunch'] = {value: totalEnergyCostPerLaunch, units: "USD"}
    console.print("totalEnergyCostPerLaunch, ", Math.round(totalEnergyCostPerLaunch), "USD")

    const totalEnergyDuringLaunchWindow = totalEnergyPerLaunch * numLaunchesPerMarsTransferWindow
    specs['totalEnergyDuringLaunchWindow'] = {value: totalEnergyDuringLaunchWindow, units: "J"}
    console.print("totalEnergyDuringLaunchWindow, ", (totalEnergyDuringLaunchWindow/1e9).toLocaleString('en-US', {maximumFractionDigits:2}), "GJ")

    const powerRequirementsDuringLaunchWindow = totalEnergyDuringLaunchWindow / marsTransferWindowsDuration
    specs['powerRequirementsDuringLaunchWindow'] = {value: powerRequirementsDuringLaunchWindow, units: "W"}
    console.print("powerRequirementsDuringLaunchWindow, ", (powerRequirementsDuringLaunchWindow/1e6).toLocaleString('en-US', {maximumFractionDigits:2}), "MW")

    const totalEnergyCostForAllLaunches = totalEnergyCostPerLaunch * numberOfMarsTransferWindows * numLaunchesPerMarsTransferWindow
    specs['totalEnergyCostForAllLaunches'] = {value: totalEnergyCostForAllLaunches, units: "USD"}
    console.print("totalEnergyCostForAllLaunches, ", totalEnergyCostForAllLaunches.toLocaleString('en-US', {maximumFractionDigits:2}), "USD")

    // There's are additional startup costs to spin up the screws, keep them spinning in a vaccum, and then stop them.
    // As the screws can serve as a spinning reserve for the national grid, these costs mght be offset by selling grid stabilization services
    // to power utilities. This is a complex calculation that is beyond the scope of this model.

    // Cost to produce the launch vehicles. Does not include the cost of ECLS systems, which are included in the payload mass.
    const launchVehicleCost = dParamWithUnits['launchVehicleCostPerKg'].value * dParamWithUnits['launchVehicleEmptyMass'].value
    specs['launchVehicleCost'] = {value: launchVehicleCost, units: "USD"}
    console.print("launchVehicleCost, ", launchVehicleCost.toLocaleString('en-US', {maximumFractionDigits:2}), "USD")

    const totalLaunchVehicleCosts = launchVehicleCost * numLaunchesPerMarsTransferWindow * numberOfMarsTransferWindows
    specs['totalLaunchVehicleCosts'] = {value: totalLaunchVehicleCosts, units: "USD"}
    console.print("totalLaunchVehicleCosts, ", (totalLaunchVehicleCosts/1e9).toLocaleString('en-US', {maximumFractionDigits:2}), "B USD")

    // Total Captital Costs
    const totalCapitalCosts = launcherTotalCapitalCost + capitalCostOfPullingVacuumInsideTubes
    specs['totalCapitalCosts'] = {value: totalCapitalCosts, units: "USD"}
    console.print("*** totalCapitalCosts, ", (totalCapitalCosts/1e9).toLocaleString('en-US', {maximumFractionDigits:2}), "B USD")
    
    // Total Operating Costs
    const totalOperatingCosts = totalEnergyCostForAllLaunches + totalLaunchVehicleCosts
    specs['totalOperatingCosts'] = {value: totalOperatingCosts, units: "USD"}
    console.print("totalOperatingCosts, ", (totalOperatingCosts/1e9).toLocaleString('en-US', {maximumFractionDigits:2}), "B USD")
    
    console.print("numLaunchesPerMarsTransferWindow", numLaunchesPerMarsTransferWindow)
    console.print("numberOfMarsTransferWindows", numberOfMarsTransferWindows)
    console.print("payloadLandedOnMarsPerLaunch", mPayload.toLocaleString('en-US', {maximumFractionDigits:0}))

    const totalPayloadLandedOnMars = mPayload * numberOfMarsTransferWindows * numLaunchesPerMarsTransferWindow
    specs['totalPayloadLandedOnMars'] = {value: totalPayloadLandedOnMars, units: "kg"}
    console.print("totalPayloadLandedOnMars, ", totalPayloadLandedOnMars.toLocaleString('en-US', {maximumFractionDigits:0}), "kg")

    const costPerKgLandedOnMars = (totalCapitalCosts + totalOperatingCosts) / totalPayloadLandedOnMars
    specs['costPerKgLandedOnMars'] = {value: costPerKgLandedOnMars, units: "USD"}
    console.print("costPerKgLandedOnMars, ", costPerKgLandedOnMars.toLocaleString('en-US', {maximumFractionDigits:2}), "USD")
  }

}
