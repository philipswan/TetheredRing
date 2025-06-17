import { massDriverBracketModel } from "./MassDriverBracket"
import { massDriverScrewModel } from "./MassDriverScrew"
import * as tram from './tram.js'

export function define_genLauncherSpecs() {

  return function (dParamWithUnits, specs, planetSpec) {

    const myFormat = function (value, fractionDigits = 0) {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
      })
    }

    const massDriverLength = this.launcherMassDriver1Length+this.launcherMassDriver2Length
    const rampLength = this.launcherRampLength
    const elevatedEvacuatedTubeLength = this.launcherSuspendedEvacuatedTubeLength
    const screwSpacing = dParamWithUnits['launcherMassDriverScrewRoughLength'].value + dParamWithUnits['launcherMassDriverScrewBracketThickness'].value

    const tempBracketObject = new massDriverBracketModel(dParamWithUnits)
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
    const launcherMassDriverScrewsTotalMass = specs['massDriverScrewMass'].value * this.massDriverAccelerationScrewSegments * 2
    specs['launcherMassDriverScrewsTotalMass'] = {value: launcherMassDriverScrewsTotalMass, units: "kg"}
    const massDriverScrewsCostOfMaterials = specs['massDriverScrewMaterialCost'].value * this.massDriverAccelerationScrewSegments * 2
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
    console.print("elevatedEvacuatedTubeLength, ", Math.round(elevatedEvacuatedTubeLength), "m")

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
    const launcherMassDriverScrewMotorsCost = screwMotorUnitCost * this.massDriverAccelerationScrewSegments * 2
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

    // Ramp mass
    const totalRampMass = rampBracketsTotalMass + rampRailsTotalMass + rampTubeWallTotalMass

    const rampMassPerMeter = totalRampMass / this.launcherRampLength
    specs['rampMassPerMeter'] = {value: rampMassPerMeter, units: "kg/m"}
    console.print("rampMassPerMeter, ", Math.round(rampMassPerMeter), "kg/m")

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
    console.print("launcherRampTotalMaterialsCost, ", Math.round(launcherRampTotalMaterialsCost/1e6)/1e3, "B USD/m")
      
    const rampManufacturingCostFactor = 2 // Placeholder
    const launcherRampTotalCost = launcherRampTotalMaterialsCost*rampManufacturingCostFactor + rampTunnelingCost
    specs['launcherRampTotalCost'] = {value: launcherRampTotalCost, units: "USD"}
    console.print("launcherRampTotalCost, ", Math.round(launcherRampTotalCost/1e6)/1e3, "B USD")

    // Elevated Evacuated Tube (EVT) - Aeronautically Supported Case
    // Evacuated Tube
    const elevatedEvacuatedTubeTubeCostPerMeter = 6047.9 * 1e6 / 52582 // "Spirit Aerosystems Annual Report and Form 10-K", https://investor.spiritaero.com/filings-financials/FinancialDocs/default.aspx net revenues divided by meters of fuselage they produced in 2023.
    specs['elevatedEvacuatedTubeTubeCostPerMeter'] = {value: elevatedEvacuatedTubeTubeCostPerMeter, units: "USD/m"}
    console.print("elevatedEvacuatedTubeTubeCostPerMeter, ", Math.round(elevatedEvacuatedTubeTubeCostPerMeter), "USD/m")

    const launcherElevatedEvacuatedTubeTubeCost = elevatedEvacuatedTubeTubeCostPerMeter * elevatedEvacuatedTubeLength
    specs['launcherElevatedEvacuatedTubeTubeCost'] = {value: launcherElevatedEvacuatedTubeTubeCost, units: "USD"}
    console.print("launcherElevatedEvacuatedTubeTubeCost, ", Math.round(launcherElevatedEvacuatedTubeTubeCost/1e6)/1e3, "B USD")

    const id = dParamWithUnits['elevatedEvacuatedTubeInnerRadius'].value
    const od = id + dParamWithUnits['elevatedEvacuatedTubeThickness'].value
    const elevatedEvacuatedTubeCrosssectionalArea = Math.PI * (od**2 - id**2)
    const massOfElevatedEvacuatedTube = elevatedEvacuatedTubeLength * elevatedEvacuatedTubeCrosssectionalArea * dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    specs['massOfElevatedEvacuatedTube'] = {value: massOfElevatedEvacuatedTube, units: "kg"}
    console.print("massOfElevatedEvacuatedTube, ", Math.round(massOfElevatedEvacuatedTube), "kg")

    const buoyancyOfElevatedEvacuatedTubePerMeter = od**2 * Math.PI * planetSpec.airDensityAtAltitude(dParamWithUnits['launcherRampExitAltitude'].value) 
    specs['buoyancyOfElevatedEvacuatedTubePerMeter'] = {value: buoyancyOfElevatedEvacuatedTubePerMeter, units: "kg/m"}
    console.print("buoyancyOfElevatedEvacuatedTubePerMeter, ", Math.round(buoyancyOfElevatedEvacuatedTubePerMeter), "kg/m")

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
    const launcherAeronauticLiftTotalCapitalCost = aeronauticLiftCapitalCostPerKgOfPayload * massOfElevatedEvacuatedTube
    specs['launcherAeronauticLiftTotalCapitalCost'] = {value: launcherAeronauticLiftTotalCapitalCost, units: "USD"}
    console.print("launcherAeronauticLiftTotalCapitalCost, ", Math.round(launcherAeronauticLiftTotalCapitalCost/1e6)/1e3, "B USD")

    const elevatedEvacuatedTubeTotalMass = massOfElevatedEvacuatedTube * XAGV40MaxTakeoffMass / (XAGV40MaxTakeoffMass - XAGV40DryMass)
    specs['elevatedEvacuatedTubeTotalMass'] = {value: elevatedEvacuatedTubeTotalMass, units: "kg"}
    console.print("elevatedEvacuatedTubeTotalMass, ", Math.round(elevatedEvacuatedTubeTotalMass/1e9), "B kg")

    const elevatedEvacuatedTubeTotalMassPerMeter = elevatedEvacuatedTubeTotalMass / elevatedEvacuatedTubeLength
    specs['elevatedEvacuatedTubeTotalMassPerMeter'] = {value: elevatedEvacuatedTubeTotalMassPerMeter, units: "kg/m"}
    console.print("elevatedEvacuatedTubeTotalMassPerMeter, ", Math.round(elevatedEvacuatedTubeTotalMassPerMeter), "kg/m")

    const elevatedEvacuatedTubeTotalCost = launcherElevatedEvacuatedTubeTubeCost + launcherAeronauticLiftTotalCapitalCost
    specs['elevatedEvacuatedTubeTotalCost'] = {value: elevatedEvacuatedTubeTotalCost, units: "USD"}
    console.log("elevatedEvacuatedTubeTotalCost, ", Math.round(elevatedEvacuatedTubeTotalCost/1e6)/1e3, "B USD")

    // Total Launcher Capital Cost
    const launcherTotalCapitalCost = launcherMassDriverTotalCost + launcherRampTotalCost + elevatedEvacuatedTubeTotalCost
    specs['launcherTotalCapitalCost'] = {value: launcherTotalCapitalCost, units: "USD"}
    console.print("launcherTotalCapitalCost, ", Math.round(launcherTotalCapitalCost/1e6)/1e3, "B USD")

    const massDriverCostPerMeter = launcherMassDriverTotalCost / massDriverLength
    specs['massDriverCostPerMeter'] = {value: massDriverCostPerMeter, units: "USD/m"}
    console.print("massDriverCostPerMeter, ", Math.round(massDriverCostPerMeter), "USD/m")
    const rampCostPerMeter = launcherRampTotalCost / rampLength
    specs['rampCostPerMeter'] = {value: rampCostPerMeter, units: "USD/m"}
    console.print("rampCostPerMeter, ", Math.round(rampCostPerMeter), "USD/m")
    const elevatedEvacuatedTubeCostPerMeter = elevatedEvacuatedTubeTotalCost / elevatedEvacuatedTubeLength
    specs['elevatedEvacuatedTubeCostPerMeter'] = {value: elevatedEvacuatedTubeCostPerMeter, units: "USD/m"}
    console.print("elevatedEvacuatedTubeCostPerMeter, ", Math.round(elevatedEvacuatedTubeCostPerMeter), "USD/m")

    // Operating costs

    const marsTransferSeasonDurationInDays = 14 // days
    const marsTransferSeasonDuration = marsTransferSeasonDurationInDays * 24 * 3600 // sec
    const marsTransferWindowDurationInHours = 2 // hours
    const marsTransferWindowDuration = marsTransferWindowDurationInHours * 3600 // sec
    const marsTransferWindowsDuration = 14*24*3600 // 14 days
    const numLaunchesPerMarsTransferSeason = dParamWithUnits['numLaunchesPerMarsTransferSeason'].value
    const averageLaunchesPerMarsTransferWindow = numLaunchesPerMarsTransferSeason / marsTransferSeasonDurationInDays
    const maxLaunchesPerMarsTransferWindow = Math.ceil(averageLaunchesPerMarsTransferWindow)
    specs['maxLaunchesPerMarsTransferWindow'] = {value: maxLaunchesPerMarsTransferWindow, units: "launches"}
    console.print("maxLaunchesPerMarsTransferWindow, ", Math.round(maxLaunchesPerMarsTransferWindow), "launches")
    const numberOfMarsTransferSeasons = dParamWithUnits['numberOfMarsTransferSeasons'].value
    const launchSpacingDuringWindow = marsTransferWindowDuration / (maxLaunchesPerMarsTransferWindow-1) // sec // Note: Subtracting 1 because we can launch at the begining and end of the window.
    specs['launchSpacingDuringWindow'] = {value: launchSpacingDuringWindow, units: "sec"}
    console.print("launchSpacingDuringWindow, ", Math.round(launchSpacingDuringWindow), "sec")
    const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value

    // Aeronautic lift
    const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value
    console.print("wholesaleCostOfElectricity, ", myFormat(wholesaleCostOfElectricity, 3), "USD/J")

    const costOfGeneratingLiftAeronautically = 7e-7 // USD/N/s  From below Eq.42 in "The Techno-Economic Viability of Actively Supported Structures for Terrestrial Transit and Space Launch"
    const forceOfGravityOnTube = massOfElevatedEvacuatedTube * 9.81
    const liftForceRequired = forceOfGravityOnTube
    const costOfAeronauticLiftPerSeason = liftForceRequired * marsTransferSeasonDuration * costOfGeneratingLiftAeronautically
    specs['costOfAeronauticLiftPerSeason'] = {value: costOfAeronauticLiftPerSeason, units: "USD"}
    console.print("costOfAeronauticLiftPerSeason, ", Math.round(costOfAeronauticLiftPerSeason/1e6)/1e3, "B USD")
    const liftDuration = numberOfMarsTransferSeasons * marsTransferSeasonDuration // 10 mars transfer seasons times 14 days per season
    const costOfAeronauticLift = liftForceRequired * liftDuration * costOfGeneratingLiftAeronautically
    specs['costOfAeronauticLift'] = {value: costOfAeronauticLift, units: "USD"}
    console.print("costOfAeronauticLift", Math.round(costOfAeronauticLift/1e6)/1e3, "B USD")

    const powerDrawOfLiftNacels = liftForceRequired * costOfGeneratingLiftAeronautically / wholesaleCostOfElectricity
    specs['powerDrawOfLiftNacels'] = {value: powerDrawOfLiftNacels, units: "W"}
    console.print("powerDrawOfLiftNacels", Math.round(powerDrawOfLiftNacels / 1e6) / 1e3, "GW")

    const hvdcCableVoltage = dParamWithUnits['elevatedEvacuatedTubeHvdcCableVoltage'].value
    const hvdcCableCurrent = powerDrawOfLiftNacels / hvdcCableVoltage // A
    const hvdcCableAllowableCurrentDensity = dParamWithUnits['elevatedEvacuatedTubeHvdcCableCurrentDensity'].value // Ohm/m
    const hvdcCableCrossSectionalArea = hvdcCableCurrent / hvdcCableAllowableCurrentDensity // m^2
    const hvdcCableDiameter = Math.sqrt(hvdcCableCrossSectionalArea / Math.PI) * 2 // m
    specs['hvdcCableDiameter'] = {value: hvdcCableDiameter, units: "m"}
    console.print("hvdcCableDiameter", Math.round(hvdcCableDiameter*1000)/1000, "m")

    const hvdcCableMaterialDensity = dParamWithUnits['elevatedEvacuatedTubeHvdcCableMaterialDensity'].value // kg/m^3
    const hvdcCableMaterialCost = dParamWithUnits['elevatedEvacuatedTubeHvdcCableMaterialCost'].value // USD/kg
    // Multiply by two for the two cables (one for each direction of current), or by one if we use the elevated evacuated tube itself as a return path for the current
    // Divide by two because we can taper the cables down to almost zero at the ends of the tube
    const hvdcCablesMass = hvdcCableMaterialDensity * Math.PI * (hvdcCableDiameter/2)**2 * elevatedEvacuatedTubeLength * 2 / 2 // kg
    specs['hvdcCablesMass'] = {value: hvdcCablesMass, units: "kg"}
    console.print("hvdcCablesMass", Math.round(hvdcCablesMass), "kg")
    const hvdcCablesCost = hvdcCablesMass * hvdcCableMaterialCost // USD
    specs['hvdcCablesCost'] = {value: hvdcCablesCost, units: "USD"}
    console.print("hvdcCablesCost", Math.round(hvdcCablesCost/1e6)/1e3, "B USD")

    const hvdcCableMassPortion = hvdcCablesMass / (hvdcCablesMass+massOfElevatedEvacuatedTube)
    specs['hvdcCableMassPortion'] = {value: hvdcCableMassPortion, units: "kg/kg"}
    console.print("hvdcCableMassPortion", Math.round(hvdcCableMassPortion*100)/100, "kg/kg")

    // Initial creation of the vacuum in the vacuum tubes
    // Vacuum Pump specs from: https://www.growinglabs.com/products/rvp-110-two-stage-rotary-vane-vacuum-pump?gad_source=1&gclid=CjwKCAjwl6-3BhBWEiwApN6_kj5CbITtjhMf7N07NNGxm2SC6dTHPM1wDLe9_f_T0EQ-Wnv4t35kShoCtz4QAvD_BwE
    const vacuumPumpPower = 3700 // W
    const vacuumPumpPumpingSpeed = 108/3600 // m^3/s
    const vacuumPumpUltimateTotalPressure = 3.75e-3 * 133.322 // torr converted to Pa
    const vacuumPumpUnitCost = 12129 // USD

    const entranceAirlockInnerRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value
    const launchVehicleLength = dParamWithUnits['launchVehicleBodyLength'].value + dParamWithUnits['launchVehicleNoseconeLength'].value
    const adaptiveNutLength = dParamWithUnits['adaptiveNutBodyLength'].value
    const entranceAirlockLength = launchVehicleLength + adaptiveNutLength + dParamWithUnits['launcherEntranceAirlockAdditionalLength'].value
    specs['entranceAirlockLength'] = {value: entranceAirlockLength, units: "m"}
    console.print("entranceAirlockLength, ", Math.round(entranceAirlockLength), "m")
    const entranceAirlockVolume = Math.PI * entranceAirlockInnerRadius**2 * entranceAirlockLength
    specs['entranceAirlockVolume'] = {value: entranceAirlockVolume, units: "m3"}
    console.print("entranceAirlockVolume, ", Math.round(entranceAirlockVolume), "m3")
    //const entranceAirlockPumpDownTime = entranceAirlockVolume / vacuumPumpingSpeed * Math.log(outsidePressure/vacuumPumpUltimateTotalPressure)  // https://www.youtube.com/watch?v=bb7E2HAIqp4

    // Tube Evacuation
    const numberOfVacuumPumps = 10000
    const vacuumPumpingSpeed = vacuumPumpPumpingSpeed * numberOfVacuumPumps // m^3/s
    const outsidePressure = 101325 // Pa
    const insidePressure = dParamWithUnits['evacuatedTubeInteriorPressure'].value // Pa
    const interiorVolumeOfMassDiverTube = Math.PI * dParamWithUnits['launcherMassDriverTubeInnerRadius'].value**2 * massDriverLength
    const interiorVolumeOfRampTube = Math.PI * dParamWithUnits['launcherMassDriverTubeInnerRadius'].value**2 * rampLength
    const interiorVolumeOfElevatedEvacuatedTube = Math.PI * id**2 * elevatedEvacuatedTubeLength
    const interiorVolumeOfEvacuatedTubes = interiorVolumeOfMassDiverTube + interiorVolumeOfRampTube + interiorVolumeOfElevatedEvacuatedTube
    specs['interiorVolumeOfEvacuatedTubes'] = {value: interiorVolumeOfEvacuatedTubes, units: "m3"}
    console.print("interiorVolumeOfEvacuatedTubes, ", Math.round(interiorVolumeOfEvacuatedTubes), "m3")
    const volumeOfNasasSpacePowerFacility = 22653 //m^3
    const tubeVolumeRelativeToNasaSpacePowerFacility = interiorVolumeOfEvacuatedTubes / volumeOfNasasSpacePowerFacility
    console.print("tubeVolumeRelativeToNasaSpacePowerFacility, ", Math.round(tubeVolumeRelativeToNasaSpacePowerFacility*100)/100, "times larger")
    specs['tubeVolumeRelativeToNasaSpacePowerFacility'] = {value: tubeVolumeRelativeToNasaSpacePowerFacility, units: "m3"}

    const tubePumpDownTime = interiorVolumeOfEvacuatedTubes / vacuumPumpingSpeed * Math.log(outsidePressure/insidePressure)  // https://www.youtube.com/watch?v=bb7E2HAIqp4
    specs['tubePumpDownTime'] = {value: tubePumpDownTime, units: "s"}
    console.print("tubePumpDownTime, ", Math.round(tubePumpDownTime/2300/24), "days")  

    const capitalCostOfPullingVacuumInsideTubes = vacuumPumpUnitCost * numberOfVacuumPumps
    specs['capitalCostOfPullingVacuumInsideTubes'] = {value: capitalCostOfPullingVacuumInsideTubes, units: "USD"}
    console.print("capitalCostOfPullingVacuumInsideTubes, ", Math.round(capitalCostOfPullingVacuumInsideTubes/1e6)/1e3, "B USD")

    // Airlock Evacuation
    const powerToAirlockPumps = vacuumPumpPower * numberOfVacuumPumps // W
    specs['powerToAirlockPumps'] = {value: powerToAirlockPumps, units: "W"}
    console.print("powerToAirlockPumps, ", myFormat(powerToAirlockPumps/1e6, 2), "MW")

    const operatingCostOfPullingVacuumInsideTubes = tubePumpDownTime * powerToAirlockPumps * wholesaleCostOfElectricity
    specs['operatingCostOfPullingVacuumInsideTubes'] = {value: operatingCostOfPullingVacuumInsideTubes, units: "USD"}
    console.print("operatingCostOfPullingVacuumInsideTubes, ", Math.round(operatingCostOfPullingVacuumInsideTubes/1e6)/1e3, "B USD")

    // Maintaining the vacuum in the vacuum tubes
    // After each launch we will need to re-evacuate the airlock portion of the tube
    const adiabaticIndex = 1.4
    const launcherEvacuatedTubeExitAltitude = dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value
    const airPressure = planetSpec.airPressureAtAltitude(launcherEvacuatedTubeExitAltitude)
    const airDensity = planetSpec.airDensityAtAltitude(launcherEvacuatedTubeExitAltitude)
    const speedOfSoundAtTubeExit = Math.sqrt(adiabaticIndex * airPressure / airDensity) // m/s
    const airlockDoorCloseTime = 1 // s
    const vehicleSpeedAtExit = this.launchVehicleAirSpeedAtExit
    // the air will travel into the tube at the speed of sound when the launched vehicle bursts through the disk. The doors need to start closing
    // immediately after the vehicle passes them and be finished closing before the ambient air rushing into the tube reaches them.
    // So, solve this equation...
    // airlockDoorCloseTime = distanceFromTubeExitToAirlock / speedOfSoundAtTubeExit + distanceFromTubeExitToAirlock / vehicleSpeedAtExit
    const distanceFromTubeExitToAirlock = (airlockDoorCloseTime * speedOfSoundAtTubeExit * vehicleSpeedAtExit) / (speedOfSoundAtTubeExit + vehicleSpeedAtExit)
    const exitAirlockLength = distanceFromTubeExitToAirlock
    specs['exitAirlockLength'] = {value: exitAirlockLength, units: "m"}
    console.print("exitAirlockLength, ", Math.round(exitAirlockLength), "m")

    const exitAirlockVolume = Math.PI * id**2 * exitAirlockLength
    specs['exitAirlockVolume'] = {value: exitAirlockVolume, units: "m3"}
    console.print("exitAirlockVolume, ", Math.round(exitAirlockVolume), "m3")

    const exitAirlockPumpDownTime = exitAirlockVolume / vacuumPumpingSpeed * Math.log(outsidePressure/insidePressure)
    specs['exitAirlockPumpDownTime'] = {value: exitAirlockPumpDownTime, units: "s"}
    console.print("exitAirlockPumpDownTime, ", Math.round(exitAirlockPumpDownTime/60), "minutes")

    const energyToPullVacuumInsideExitAirlock = exitAirlockPumpDownTime * vacuumPumpPower * numberOfVacuumPumps
    specs['energyToPullVacuumInsideExitAirlock'] = {value: energyToPullVacuumInsideExitAirlock, units: "J"}
    console.print("energyToPullVacuumInsideExitAirlock, ", Math.round(energyToPullVacuumInsideExitAirlock), "J")

    const operatingCostOfPullingVacuumInsideAirlock = energyToPullVacuumInsideExitAirlock * wholesaleCostOfElectricity
    specs['operatingCostOfPullingVacuumInsideAirlock'] = {value: operatingCostOfPullingVacuumInsideAirlock, units: "USD"}
    console.print("operatingCostOfPullingVacuumInsideAirlock, ", Math.round(operatingCostOfPullingVacuumInsideAirlock), "USD")

    // Accelerating Vehicles
    const mVehicle = dParamWithUnits['launchVehicleEmptyMass'].value
    const mPayload = dParamWithUnits['launchVehiclePayloadMass'].value
    const initialPropellantMass = dParamWithUnits['launchVehiclePropellantMass'].value
    const mSled = dParamWithUnits['launchVehicleSledMass'].value
    const mAdaptiveNut = dParamWithUnits['launcherAdaptiveNutMass'].value
    const m0 = mVehicle + mPayload + initialPropellantMass
    specs['launchVehicleInitialMass'] = {value: m0, units: "kg"}
    console.print("launchVehicleInitialMass, ", Math.round(m0), "kg")
    const launchTrainMass = mAdaptiveNut + mSled + mVehicle + mPayload + initialPropellantMass
    specs['launchTrainMass'] = {value: launchTrainMass, units: "kg"}
    console.print("launchTrainMass, ", Math.round(launchTrainMass), "kg")
    const regenerativelyDeceleratedMass = mAdaptiveNut
    const massDriverExitSpeed = dParamWithUnits['launcherMassDriverExitVelocity'].value
    console.log("##### launcherMassDriverExitVelocity", massDriverExitSpeed)
    const launcherAccelerationEfficiency = dParamWithUnits['launcherAccelerationEfficiency'].value
    const launcherDecelerationEfficiency = dParamWithUnits['launcherDecelerationEfficiency'].value // Assume regenerative breaking is as efficient as accelerating

    specs['energyLostToDragWhileInTube'] = {value: this.energyLostToDragWhileInTube, units: 'J'}
    console.print("energyLostToDragWhileInTube, ", Math.round(this.energyLostToDragWhileInTube/1e6)/1e3, "GJ")
    specs['energyLostToDragWhileInAtmosphere'] = {value: this.energyLostToDragWhileInAtmosphere, units: 'J'}
    console.print("energyLostToDragWhileInAtmosphere, ", Math.round(this.energyLostToDragWhileInAtmosphere/1e6)/1e3, "GJ")

    const kineticEnergyOfLaunch = 0.5 * launchTrainMass * massDriverExitSpeed**2  // One half m v^2
    const kineticEnergyRecovered = 0.5 * regenerativelyDeceleratedMass * massDriverExitSpeed**2 // One half m v^2
    const massDriverEnergyConsumedPerLaunch = kineticEnergyOfLaunch / launcherAccelerationEfficiency - kineticEnergyRecovered * launcherDecelerationEfficiency
    specs['massDriverEnergyConsumedPerLaunch'] = {value: massDriverEnergyConsumedPerLaunch, units: "J"}
    console.print("massDriverEnergyConsumedPerLaunch, ", Math.round(massDriverEnergyConsumedPerLaunch/1e6)/1e3, "GJ")

    const massDriverPowerPerLaunch = massDriverEnergyConsumedPerLaunch / launchSpacingDuringWindow
    specs['massDriverPowerPerLaunch'] = {value: massDriverPowerPerLaunch, units: "W"}
    console.print("massDriverPowerPerLaunch, ", Math.round(massDriverPowerPerLaunch/1e6)/1e3, "GJ")

    const massDriverEnergyCostPerLaunch = massDriverEnergyConsumedPerLaunch * wholesaleCostOfElectricity
    specs['massDriverEnergyCostPerLaunch'] = {value: massDriverEnergyCostPerLaunch, units: "USD"}
    console.print("massDriverEnergyCostPerLaunch, ", Math.round(massDriverEnergyCostPerLaunch), "USD")

    const totalEnergyPerLaunch = massDriverEnergyConsumedPerLaunch + energyToPullVacuumInsideExitAirlock
    specs['totalEnergyPerLaunch'] = {value: totalEnergyPerLaunch, units: "J"}
    console.print("totalEnergyPerLaunch, ", Math.round(totalEnergyPerLaunch), "J")

    const portionOfEnergyLostToDragInTube = this.energyLostToDragWhileInTube / kineticEnergyOfLaunch
    specs['portionOfEnergyLostToDragInTube'] = {value: portionOfEnergyLostToDragInTube, units: "J/J"}
    console.print("portionOfEnergyLostToDragInTube, ", Math.round(portionOfEnergyLostToDragInTube*1e6)/1e6, "J/J")

    const powerRequirementsDuringLaunch = totalEnergyPerLaunch / launchSpacingDuringWindow // This is the power we need to supply, which get's absorbed by the flywheels in the screws.
    specs['powerRequirementsDuringLaunch'] = {value: powerRequirementsDuringLaunch, units: "W"}
    console.print("powerRequirementsDuringLaunch, ", (powerRequirementsDuringLaunch/1e6).toLocaleString('en-US', {maximumFractionDigits:2}), "MW")

    // Calculate the power from the launch train's mass, acceleration, exit speed, and energy conversion efficiency
    const earlierEMLaunchersEnergyConversionEfficiency = 0.5
    const peakPowerRequirementsOfEarlierEMLaunchers = launchTrainMass * launcherMassDriverForwardAcceleration * massDriverExitSpeed / earlierEMLaunchersEnergyConversionEfficiency
    specs['peakPowerRequirementsOfEarlierEMLaunchers'] = {value: peakPowerRequirementsOfEarlierEMLaunchers, units: "W"}
    console.print("peakPowerRequirementsOfEarlierEMLaunchers, ", (peakPowerRequirementsOfEarlierEMLaunchers/1e6).toLocaleString('en-US', {maximumFractionDigits:2}), "MW")
  
    const totalEnergyCostPerLaunch = operatingCostOfPullingVacuumInsideAirlock + massDriverEnergyCostPerLaunch
    specs['totalEnergyCostPerLaunch'] = {value: totalEnergyCostPerLaunch, units: "USD"}
    console.print("totalEnergyCostPerLaunch, ", Math.round(totalEnergyCostPerLaunch), "USD")

    const totalEnergyDuringLaunchSeason = totalEnergyPerLaunch * numLaunchesPerMarsTransferSeason
    specs['totalEnergyDuringLaunchSeason'] = {value: totalEnergyDuringLaunchSeason, units: "J"}
    console.print("totalEnergyDuringLaunchSeason, ", (totalEnergyDuringLaunchSeason/1e9).toLocaleString('en-US', {maximumFractionDigits:2}), "GJ")

    const powerRequirementsDuringLaunchSeason = totalEnergyPerLaunch * maxLaunchesPerMarsTransferWindow / (24*3600) // W
    specs['powerRequirementsDuringLaunchSeason'] = {value: powerRequirementsDuringLaunchSeason, units: "W"}
    console.print("powerRequirementsDuringLaunchSeason, ", (powerRequirementsDuringLaunchSeason/1e6).toLocaleString('en-US', {maximumFractionDigits:2}), "MW")

    const totalEnergyCostForAllLaunches = totalEnergyCostPerLaunch * numberOfMarsTransferSeasons * numLaunchesPerMarsTransferSeason
    specs['totalEnergyCostForAllLaunches'] = {value: totalEnergyCostForAllLaunches, units: "USD"}
    console.print("totalEnergyCostForAllLaunches, ", totalEnergyCostForAllLaunches.toLocaleString('en-US', {maximumFractionDigits:2}), "USD")

    // There's are additional startup costs to spin up the screws, keep them spinning in a vaccum, and then stop them.
    // As the screws can serve as a spinning reserve for the national grid, these costs mght be offset by selling grid stabilization services
    // to power utilities. This is a complex calculation that is beyond the scope of this model.

    // Cost to produce the launch vehicles. Does not include the cost of ECLS systems, which are included in the payload mass.
    const launchVehicleCost = dParamWithUnits['launchVehicleCostPerKg'].value * dParamWithUnits['launchVehicleEmptyMass'].value
    specs['launchVehicleCost'] = {value: launchVehicleCost, units: "USD"}
    console.print("launchVehicleCost, ", launchVehicleCost.toLocaleString('en-US', {maximumFractionDigits:2}), "USD")

    const totalLaunchVehicleCosts = launchVehicleCost * numLaunchesPerMarsTransferSeason * numberOfMarsTransferSeasons
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
    
    console.print("numLaunchesPerMarsTransferSeason", numLaunchesPerMarsTransferSeason)
    console.print("numberOfMarsTransferSeasons", numberOfMarsTransferSeasons)

    const propellantNeededForLandingOnMars = dParamWithUnits['propellantNeededForLandingOnMars'].value
    const payloadLandedOnMarsPerLaunch = Math.max(0, this.payloadPlusRemainingPropellant - propellantNeededForLandingOnMars)
    console.print("payloadLandedOnMarsPerLaunch", payloadLandedOnMarsPerLaunch.toLocaleString('en-US', {maximumFractionDigits:0}), "kg")

    const totalPayloadLandedOnMars = payloadLandedOnMarsPerLaunch * numberOfMarsTransferSeasons * numLaunchesPerMarsTransferSeason
    specs['totalPayloadLandedOnMars'] = {value: totalPayloadLandedOnMars, units: "kg"}
    console.print("totalPayloadLandedOnMars, ", totalPayloadLandedOnMars.toLocaleString('en-US', {maximumFractionDigits:0}), "kg")

    const costPerKgLandedOnMars = (totalCapitalCosts + totalOperatingCosts) / totalPayloadLandedOnMars
    specs['costPerKgLandedOnMars'] = {value: costPerKgLandedOnMars, units: "USD"}
    console.print("costPerKgLandedOnMars, ", costPerKgLandedOnMars.toLocaleString('en-US', {maximumFractionDigits:2}), "USD")

    // Hoop stress in the screw shaft
    const ro = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
    const ri = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
    const σ_y = dParamWithUnits['launcherMassDriverScrewMaterialYieldStrength'].value
    const ρ = dParamWithUnits['launcherMassDriverScrewMaterialDensity'].value
    const f = dParamWithUnits['launcherMassDriverScrewEngineeringFactor'].value

    const maxHoopStress = σ_y/f
    specs['maxHoopStress'] = {value: maxHoopStress, units: "Pa"}
    console.print("maxHoopStress, ", Math.round(maxHoopStress/1e6), "MPa")

    const screwShaftMaxRateOfRotation = Math.sqrt(σ_y/f/ρ/(ro**2-ri**2))  // Units are radians per second
    specs['screwShaftMaxRateOfRotation'] = {value: screwShaftMaxRateOfRotation, units: "rad/s"}
    const screwShaftMaxRateOfRotationRPM = screwShaftMaxRateOfRotation * 60 / (2 * Math.PI) // Convert to RPM
    console.print("screwShaftMaxRateOfRotation, ", Math.round(screwShaftMaxRateOfRotation), "rad/s", Math.round(screwShaftMaxRateOfRotationRPM), "RPM")

    // Note - this does not yet consider the additional stress due to the mass of the screw flights or extra speed at the ends of the flights.
    const screwShaftMaxRimSpeed = screwShaftMaxRateOfRotation * ro
    specs['screwShaftMaxRimSpeed'] = {value: screwShaftMaxRimSpeed, units: "m/s"}
    console.print("screwShaftMaxRimSpeed, ", screwShaftMaxRimSpeed, "m/s")

    const s2gp = dParamWithUnits['adaptiveNutShaftToGrapplerPad'].value
    const tr = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
    const midPadRadius = (ro + s2gp + tr)/2
    const screwThreadFaceRimSpeed = screwShaftMaxRateOfRotation * midPadRadius
    specs['screwThreadFaceRimSpeed'] = {value: screwThreadFaceRimSpeed, units: "m/s"}
    console.print("screwThreadFaceRimSpeed, ", screwThreadFaceRimSpeed, "m/s")

    const screwFlightMaxSlope = massDriverExitSpeed / screwThreadFaceRimSpeed
    specs['screwFlightMaxSlope'] = {value: screwFlightMaxSlope, units: "m/m"}
    console.print("screwFlightMaxSlope, ", screwFlightMaxSlope, "m/m")

    const accelleratedMass =  mAdaptiveNut + mSled + mVehicle + initialPropellantMass + mPayload
    const forwardForce = accelleratedMass * launcherMassDriverForwardAcceleration
    specs['forwardForce'] = {value: forwardForce, units: "N"}
    console.print("forwardForce, ", forwardForce, "N")

    const maxForceOnScrewFlights = forwardForce * screwFlightMaxSlope
    specs['maxForceOnScrewFlights'] = {value: maxForceOnScrewFlights, units: "N"}
    console.print("maxForceOnScrewFlights, ", maxForceOnScrewFlights, "N")

    const launcherMassDriverNumScrews = dParamWithUnits['launcherMassDriverNumScrews'].value
    const numFlightsContactedPerScrew = dParamWithUnits['launcherMassDriverNumFlightsContactedPerScrew'].value

    const maxTorqueOnEachScrew = maxForceOnScrewFlights / midPadRadius / launcherMassDriverNumScrews
    specs['maxTorqueOnEachScrew'] = {value: maxTorqueOnEachScrew, units: "N*m"}
    console.print("maxTorqueOnEachScrew, ", Math.round(maxTorqueOnEachScrew), "N*m")

    const maxTorquePerMMOfEachScrew = maxTorqueOnEachScrew / adaptiveNutLength / 1000 // N*m/m
    specs['maxTorquePerMMOfEachScrew'] = {value: maxTorquePerMMOfEachScrew, units: "N*m/m"}
    console.print("maxTorquePerMMOfEachScrew, ", Math.round(maxTorquePerMMOfEachScrew), "N*m/m")

    const electromagneticClutchWattsPerNmOfTorque = dParamWithUnits['electromagneticClutchWattsPerNmOfTorque'].value // W/N*m
    const powerToClutches = maxTorqueOnEachScrew * electromagneticClutchWattsPerNmOfTorque * launcherMassDriverNumScrews // W
    specs['powerToClutches'] = {value: powerToClutches, units: "W"}
    console.print("powerToClutches, ", myFormat(powerToClutches/1e9, 3), "GW")

    const permeabilityOfFreeSpace = dParamWithUnits['permeabilityOfFreeSpace'].value // H/m
    const launcherMassDriverScrewFlightSaturationFluxDensity = dParamWithUnits['launcherMassDriverScrewFlightSaturationFluxDensity'].value // T 
    const launcherMassDriverScrewFlightMagneticFluxDensityPortion = dParamWithUnits['launcherMassDriverScrewFlightMagneticFluxDensityPortion'].value // T 
    const launcherScrewFlightAverageMagneticFluxDensity = launcherMassDriverScrewFlightSaturationFluxDensity * launcherMassDriverScrewFlightMagneticFluxDensityPortion
    specs['launcherScrewFlightAverageMagneticFluxDensity'] = {value: launcherScrewFlightAverageMagneticFluxDensity, units: 'T'}
    console.print('launcherScrewFlightAverageMagneticFluxDensity', launcherScrewFlightAverageMagneticFluxDensity)
  
    const launcherGrapplerAttractiveForcePerMeterSquared = launcherScrewFlightAverageMagneticFluxDensity**2 / permeabilityOfFreeSpace
    specs['launcherGrapplerAttractiveForcePerMeterSquared'] = {value: launcherGrapplerAttractiveForcePerMeterSquared, units: 'N/m^2'}
    console.print('launcherGrapplerAttractiveForcePerMeterSquared', Math.round(launcherGrapplerAttractiveForcePerMeterSquared), "N/m^2")

    const launcherGrapplerTotalContactArea = maxForceOnScrewFlights / launcherGrapplerAttractiveForcePerMeterSquared
    specs['launcherGrapplerTotalContactArea'] = {value: launcherGrapplerTotalContactArea, units: 'm^2'}
    console.print('launcherGrapplerTotalContactArea', launcherGrapplerTotalContactArea)

    const launcherGrapplerTotalContactFlights = launcherMassDriverNumScrews * numFlightsContactedPerScrew
    const grapplerPadContactWidth = tr - (ro + s2gp) // The width of the contact area on the grappler pad is the screw thread radius minus the distance from the screw shaft to the grappler pad
    specs['grapplerPadContactWidth'] = {value: grapplerPadContactWidth, units: 'm'}
    console.print('grapplerPadContactWidth', grapplerPadContactWidth)

    const grapplerPadContactLength = launcherGrapplerTotalContactArea / grapplerPadContactWidth / launcherGrapplerTotalContactFlights
    specs['grapplerPadContactLength'] = {value: grapplerPadContactLength, units: 'm'}
    console.print('grapplerPadContactLength', grapplerPadContactLength)

    //const grapplerPowerPerNewton = dParamWithUnits['launcherGrapplerPowerPerNewton'].value // W/N
    let grapplerPowerPerNewton = 0
    grapplerPowerPerNewton += (12*0.1) / (60*9.8) // Based on a 12V, 0.1A Electric Magnetic Lock that generates 60kg of holding force
    grapplerPowerPerNewton += (12*0.5) / (5338) // Based on a 12V, 0.5A Electric Magnetic Lock that generates 1200 lbf of holding force
    grapplerPowerPerNewton += (24*0.2) / (8007) // Based on a 24V, 0.2A Electric Magnetic Lock that generates 1800 lbf of holding force
    grapplerPowerPerNewton /= 3 // Take the avreage of the three maglog examples above

    specs['grapplerPowerPerNewton'] = {value: grapplerPowerPerNewton, units: 'W/N'}
    console.print('grapplerPowerPerNewton', myFormat(grapplerPowerPerNewton, 6), "W/N")

    const grapplerPeakPower = maxForceOnScrewFlights * grapplerPowerPerNewton
    specs['grapplerPeakPower'] = {value: grapplerPeakPower, units: 'W'}
    console.print('grapplerPeakPower', myFormat(grapplerPeakPower/1e3, 3), "kW")

    const grapplerTotalEnergy = grapplerPeakPower * (this.timeWithinMassDriver1 + this.timeWithinMassDriver2 + this.adaptiveNutTimeWithinRamp) / 2
    specs['grapplerTotalEnergy'] = {value: grapplerTotalEnergy, units: 'J'}
    console.print('grapplerTotalEnergy', myFormat(grapplerTotalEnergy/1e6, 3), "MJ")
    console.print('grapplerTotalEnergy', myFormat(grapplerTotalEnergy/3600000, 3), "kWh")

    // Convert the total energy into Li-Ion battery Ampere-hours
    const batteryVoltage = 3.7 // V - Typical Li-Ion battery voltage
    const batteryAmpereHours = grapplerTotalEnergy / batteryVoltage / 3600 // Convert J to Wh, then to Ah
    specs['batteryAmpereHours'] = {value: batteryAmpereHours, units: 'Ah'}
    console.print('batteryAmpereHours', myFormat(batteryAmpereHours, 3), "Ah")

    const B = launcherScrewFlightAverageMagneticFluxDensity
    specs['launcherScrewFlightAverageMagneticFluxDensity'] = {value: B, units: 'T'}
    console.print('launcherScrewFlightAverageMagneticFluxDensity', B)

    const d = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value

    const grapplerPadStripEasingLength = 2 // m - At the ends of each grappler strip, there is an "EasingLength" long section where magnetic field strength will ease-in and ease-out using a sinusoidal easing function.
    const grapplerPadStripEasingTime = grapplerPadStripEasingLength / massDriverExitSpeed
    const equivalentFieldFrequency = 1 / (2*grapplerPadStripEasingTime) // Hz
    specs['equivalentFieldFrequency'] = {value: equivalentFieldFrequency, units: 'Hz'}
    console.print('equivalentFieldFrequency', equivalentFieldFrequency)

    const Cm = 7.3e-3 // W/kg
    // const alpha = 1.71  // 3% Si Electrical Steel
    // const beta = 1.36  // 3% Si Electrical Steel 
    const alpha = 2.1   // Guess for 350 Maraging Steel 
    const beta = 3.0    // Guess for 350 Maraging Steel

    // Steinmetz equation for eddy current power loss in the screw flights
    const peakEddyCurrentPowerLossPerStrip = Cm * B**alpha * equivalentFieldFrequency**beta
    specs['eddyCurrentPowerLoss'] = {value: peakEddyCurrentPowerLossPerStrip, units: 'W/kg'}
    console.print('peakEddyCurrentPowerLossPerStrip', Math.round(peakEddyCurrentPowerLossPerStrip), "W/kg")

    const peakRateOfKineticEnergyTransfer = accelleratedMass * massDriverExitSpeed * launcherMassDriverForwardAcceleration
    specs['peakRateOfKineticEnergyTransfer'] = {value: peakRateOfKineticEnergyTransfer, units: 'W'}
    console.print('peakRateOfKineticEnergyTransfer', Math.round(peakRateOfKineticEnergyTransfer), "W")

    // This is very rough - we really need to tally up the mass of Secondaries (the part of screw flights that engages with the grappler pads) in the easing zones.
    const screwFlightDepth = 0.01 // m - The thickness of the part of the screw flight that engages with the grappler pad
    const massOfSecondariesInEasingZones = grapplerPadStripEasingLength * 2 * grapplerPadContactWidth * screwFlightDepth * dParamWithUnits['launcherMassDriverScrewMaterialDensity'].value // kg
    // Assuming just one strip of grappler pads per screw flight near the end of the launcher.
    const peakEddyCurrentPowerLoss = peakEddyCurrentPowerLossPerStrip * launcherGrapplerTotalContactFlights * massOfSecondariesInEasingZones
    specs['peakEddyCurrentPowerLoss'] = {value: peakEddyCurrentPowerLoss, units: 'W'}
    console.print('peakEddyCurrentPowerLoss', Math.round(peakEddyCurrentPowerLoss), "W")

    const eddyCurrentLossOverRateOfKineticEnergyGain = peakEddyCurrentPowerLoss / peakRateOfKineticEnergyTransfer
    specs['eddyCurrentLossOverRateOfKineticEnergyGain'] = {value: eddyCurrentLossOverRateOfKineticEnergyGain, units: 'W/W'}
    console.print('eddyCurrentLossOverRateOfKineticEnergyGain', myFormat(eddyCurrentLossOverRateOfKineticEnergyGain, 12), "W/W")

    // Calculate the temperature increase in the screw flights due to eddy currents...

    // const electricalResistivity = dParamWithUnits['launcherMassDriverScrewMaterialElectricalResistivity'].value
    // const powerLossDueToEddyCurrents = B**2 * d**2 * v**2 / 6 / electricalResistivity
    // debugger

    // const orbitalRingCircumference = 2 * Math.PI * (planetSpec.ellipsoid.a+300000)
    // const orbitalRingMass = orbitalRingCircumference * 0.01**2 * Math.PI * dParamWithUnits['launcherMassDriverScrewMaterialDensity'].value
    // specs['orbitalRingMass'] = {value: orbitalRingMass, units: "kg"}
    // console.print("orbitalRingMass, ", Math.round(orbitalRingMass), "kg")
    // const orbitalRingCost = orbitalRingMass * 4000 // USD/kg
    // specs['orbitalRingCost'] = {value: orbitalRingCost, units: "USD"}
    // console.print("orbitalRingCost, ", Math.round(orbitalRingCost/1e6)/1e3, "B USD")
    
    const postFreeFlightVehicleMass = mVehicle + mPayload + this.remainingPropellantAfterFreeFlight
    const fleetMass = numLaunchesPerMarsTransferSeason * postFreeFlightVehicleMass
    specs['fleetMass'] = {value: fleetMass, units: "kg"}
    console.print("fleetMass, ", Math.round(fleetMass), "kg")

    const estimatedFleetHabitableVolume = numLaunchesPerMarsTransferSeason * 40  // m^3
    const shellInnerRadius = Math.pow(estimatedFleetHabitableVolume * 3 / 4 / Math.PI, 0.333)  // V = 4/3 Pi r^3
    const densityOfWater = 1000 // kg/m^3
    const equivalentShellOfWaterThickness = Math.pow(fleetMass/densityOfWater/3*4/Math.PI + shellInnerRadius**3, 0.333) - shellInnerRadius // fleetMass = rho 4/3 Pi (r1^3 - r0^3)
    specs['equivalentShellOfWaterThickness'] = {value: equivalentShellOfWaterThickness, units: "m"}
    console.log("equivalentShellOfWaterThickness, ", Math.round(equivalentShellOfWaterThickness*100)/100, "m")

    const launchFromPlanet = dParamWithUnits['launchFromPlanet'].value
    const launchToPlanet = dParamWithUnits['launchToPlanet'].value
    console.print("In our cost model, each spacecraft has an initial mass of", myFormat(mVehicle + mPayload + initialPropellantMass), "kg")
    console.print("and places", myFormat(mPayload), "kg on", launchToPlanet, ".")
    console.print("Launching", myFormat(numLaunchesPerMarsTransferSeason), "spacecraft per transfer window over", myFormat(numberOfMarsTransferSeasons), "windows yields", myFormat((numLaunchesPerMarsTransferSeason * numberOfMarsTransferSeasons * mPayload)/1e6, 2), "million kg delivered.")
    console.print("The screw flights move at", myFormat(screwThreadFaceRimSpeed), "m/s,")
    console.print("and the launch train’s peak speed is", myFormat(massDriverExitSpeed), "m/s;")
    console.print("setting the max thread slope to", myFormat(screwFlightMaxSlope, 2), "m/m.")
    console.print("The launch train requires", myFormat(forwardForce/1e6, 2), "MN of thrust, resulting in", myFormat(maxForceOnScrewFlights/1e6, 2), "MN of maximum lateral force spread across", myFormat(numFlightsContactedPerScrew*launcherMassDriverNumScrews), "screw flights.")
    console.print("With a magnetic flux density of", myFormat(launcherScrewFlightAverageMagneticFluxDensity, 2), "T,")
    console.print("the attractive force per square meter is", myFormat(launcherGrapplerAttractiveForcePerMeterSquared/1e6, 2), "MN/m^2")
    console.print("requiring a magnetic pad interface area of", myFormat(launcherGrapplerTotalContactArea), "m^2.")
    console.print("Assuming a pad width of", myFormat(grapplerPadContactWidth, 2), "m,")
    console.print("the adaptive nut must be", myFormat(grapplerPadContactLength), "m long.")
    console.print("At", myFormat(launcherMassDriverForwardAcceleration, 2), "m/s^2 of acceleration,")
    console.print("the launch section must be", myFormat(massDriverLength/1000), "km long,")
    console.print("with a", myFormat(rampLength/1000), "km ramp and a", myFormat(elevatedEvacuatedTubeLength/1000), "km elevated evacuated tube to reach an altitude of", myFormat(launcherEvacuatedTubeExitAltitude/1000), "km.")

    console.print("The mass driver cost is", myFormat(launcherMassDriverTotalCost/1e9, 2), "B USD (", myFormat(massDriverCostPerMeter), "USD/m),")
    console.print("the ramp cost is", myFormat(launcherRampTotalCost/1e9, 2), "B USD (", myFormat(rampCostPerMeter), "USD/m),")
    console.print("and the elevated evacuated tube cost is", myFormat(elevatedEvacuatedTubeTotalCost/1e9, 2), "B USD (", myFormat(elevatedEvacuatedTubeCostPerMeter), "USD/m).")
    console.print("The mass-per-meter of these components is", myFormat(launcherMassDriverTotalMassPerMeter), "kg, ", myFormat(rampMassPerMeter), "kg, and", myFormat(elevatedEvacuatedTubeTotalMassPerMeter), "kg, respectively.")

    console.print("The cost of aeronautic lift is", myFormat(costOfAeronauticLift/1e9, 2), "B USD.")
    console.print("The cost of aeronautic lift per window is", myFormat(costOfAeronauticLiftPerSeason/1e9, 2), "B USD.")
    console.print("The cost of the launch vehicle is", myFormat(launchVehicleCost/1e6, 2), "M USD.")
    console.print("The total cost of all launch vehicles is", myFormat(totalLaunchVehicleCosts/1e9, 2), "B USD.")
    console.print("The total capital cost of the launch system is", myFormat(totalCapitalCosts/1e9, 2), "B USD.")
    console.print("The operating costs over ~20 years of operation are", myFormat(totalOperatingCosts/1e9, 2), "B USD.")
    console.print("The cost per kg landed on Mars is", myFormat(costPerKgLandedOnMars), "USD.")

  }

}
