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

    const launcherMassDriverLength = this.launcherMassDriver1Length+this.launcherMassDriver2Length
    specs['launcherMassDriverLength'] = {value: launcherMassDriverLength, units: "m"}
    console.print("launcherMassDriverLength", myFormat(launcherMassDriverLength/1000, 2), "km")
    const launcherRampLength = this.launcherRampLength
    specs['launcherRampLength'] = {value: launcherRampLength, units: "m"}
    console.print("launcherRampLength", myFormat(launcherRampLength/1000, 2), "km")
    const launcherElevatedEvacuatedTubeLength = this.launcherElevatedEvacuatedTubeLength
    specs['launcherElevatedEvacuatedTubeLength'] = {value: launcherElevatedEvacuatedTubeLength, units: "m"}
    console.print("launcherElevatedEvacuatedTubeLength", myFormat(launcherElevatedEvacuatedTubeLength/1000, 2), "km")

    const massDriverNumBrackets = this.massDriverAccelerationScrewSegments + 1
    const rampNumBrackets = this.rampDeccelerationScrewSegments + 1
    
    const tempBracketObject = new massDriverBracketModel(dParamWithUnits)
    tempBracketObject.genSpecs(dParamWithUnits, specs)
    const launcherMassDriverBracketsTotalMass = specs['massDriverBracketMass'].value * massDriverNumBrackets
    specs['launcherMassDriverBracketsTotalMass'] = {value: launcherMassDriverBracketsTotalMass, units: "kg"}
    const launcherMassDriverBracketsCostOfMaterials = dParamWithUnits['launcherMassDriverScrewBracketMaterialCost'].value * launcherMassDriverBracketsTotalMass
    specs['launcherMassDriverBracketsCostOfMaterials'] = {value: launcherMassDriverBracketsCostOfMaterials, units: "USD"}

    this.railModelObject.genSpecs(dParamWithUnits, specs)
    const massDriverRailMaterialDensity = dParamWithUnits['launcherMassDriverRailMaterialDensity'].value
    const launcherMassDriverRailTotalMass = specs['massDriverRailCrosssectionalArea'].value * launcherMassDriverLength * massDriverRailMaterialDensity
    specs['launcherMassDriverRailTotalMass'] = {value: launcherMassDriverRailTotalMass, units: "kg"}
    const launcherMassDriverRailsCostOfMaterials = launcherMassDriverRailTotalMass * dParamWithUnits['launcherMassDriverRailMaterialCost'].value
    specs['launcherMassDriverRailsCostOfMaterials'] = {value: launcherMassDriverRailsCostOfMaterials, units: "USD"}
    
    const tempScrewObject = new massDriverScrewModel()
    tempScrewObject.genSpecs(dParamWithUnits, specs)
    //const massDriverScrewCrosssectionalArea = specs['massDriverScrewCrosssectionalArea'].value
    const massDriverScrewCrosssectionalArea = 0.1384 + 0.0155 // Value from vpslScrewSim for a screw segment near the end of acceleration section
    console.print("massDriverScrewCrosssectionalArea", myFormat(massDriverScrewCrosssectionalArea, 2), "m2")

    specs['massDriverAccelerationScrewSegmentExactLength'] = {value: this.massDriverAccelerationScrewSegmentExactLength, units: "m"}
    console.print("massDriverAccelerationScrewSegmentExactLength", myFormat(this.massDriverAccelerationScrewSegmentExactLength, 2), "m")

    specs['rampDeccelerationScrewSegmentExactLength'] = {value: this.rampDeccelerationScrewSegmentExactLength, units: "m"}
    console.print("rampDeccelerationScrewSegmentExactLength", myFormat(this.rampDeccelerationScrewSegmentExactLength, 2), "m")

    const launcherMassDriverScrewMaterialDensity = dParamWithUnits['launcherMassDriverScrewMaterialDensity'].value
    const launcherMassDriverScrewMaterialPricePerKgBuy = dParamWithUnits['launcherMassDriverScrewMaterialPricePerKgBuy'].value
    const launcherMassDriverScrewMaterialPricePerKgSell = dParamWithUnits['launcherMassDriverScrewMaterialPricePerKgSell'].value
    const launcherMassDriverNumScrews = dParamWithUnits['launcherMassDriverNumScrews'].value

    // Need to improve:
    // 1) The pitch and number of starts will effect the volume of individual screws.
    // 2) During manufacture, there may be some waste as surface material is removed during finishing. Presumably the scrap will be recycled.
    const launcherMassDriverScrewVolume = massDriverScrewCrosssectionalArea * this.massDriverAccelerationScrewSegmentExactLength
    specs['launcherMassDriverScrewVolume'] = {value: launcherMassDriverScrewVolume, units: "m3"}
    console.print("launcherMassDriverScrewVolume", myFormat(launcherMassDriverScrewVolume), "m3")

    const launcherMassDriverScrewMass = launcherMassDriverScrewVolume * launcherMassDriverScrewMaterialDensity
    specs['launcherMassDriverScrewMass'] = {value: launcherMassDriverScrewMass, units: "kg"}
    console.print("launcherMassDriverScrewMass", myFormat(launcherMassDriverScrewMass), "kg")

    const launcherMassDriverScrewMaterialCost = launcherMassDriverScrewMass * launcherMassDriverScrewMaterialPricePerKgBuy
    specs['launcherMassDriverScrewMaterialCost'] = {value: launcherMassDriverScrewMaterialCost, units: "USD"}
    console.print("launcherMassDriverScrewMaterialCost", myFormat(launcherMassDriverScrewMaterialCost), "USD")

    const launcherMassDriverScrewMaterialProceedsFromRecycling = launcherMassDriverScrewMass * launcherMassDriverScrewMaterialPricePerKgSell
    specs['launcherMassDriverScrewMaterialProceedsFromRecycling'] = {value: launcherMassDriverScrewMaterialProceedsFromRecycling, units: "USD"}
    console.print("launcherMassDriverScrewMaterialProceedsFromRecycling", myFormat(launcherMassDriverScrewMaterialProceedsFromRecycling), "USD")

    const launcherMassDriverScrewsTotalMass =  this.massDriverAccelerationScrewSegments * launcherMassDriverNumScrews * launcherMassDriverScrewMass
    specs['launcherMassDriverScrewsTotalMass'] = {value: launcherMassDriverScrewsTotalMass, units: "kg"}
    console.print("launcherMassDriverScrewsTotalMass", myFormat(launcherMassDriverScrewsTotalMass/1e9, 2), "B kg")

    const launcherMassDriverScrewsCostOfMaterials  = launcherMassDriverScrewMaterialCost * this.massDriverAccelerationScrewSegments * 2
    specs['launcherMassDriverScrewsCostOfMaterials'] = {value: launcherMassDriverScrewsCostOfMaterials, units: "USD"}
    console.print('launcherMassDriverScrewsCostOfMaterials', myFormat(launcherMassDriverScrewsCostOfMaterials/1e9, 3), "B USD")

    const launcherMassDriverScrewsProceedsFromRecycling = launcherMassDriverScrewMaterialProceedsFromRecycling * this.massDriverAccelerationScrewSegments * 2
    specs['launcherMassDriverScrewsProceedsFromRecycling'] = {value: launcherMassDriverScrewsProceedsFromRecycling, units: "USD"}
    console.print('launcherMassDriverScrewsProceedsFromRecycling', myFormat(launcherMassDriverScrewsProceedsFromRecycling/1e9, 3), "B USD")

    // Steel vacuum tube. Currently the assumption is that this steel tube is directly imersed in the sea water. Another possibility is that
    // The steel tube is housed inside a concrete tube which is then imersed in the sea water. This would allow for maintenance access to the
    // outside of the smaller steel tube, would protect the steel tube from sea water, and would allow the position of the steel tube to be adjusted
    // within the concrete tube.
    this.tubeModelObject.genSpecs(dParamWithUnits, specs)
    const massDriverTubeWallTotalVolume = specs['massDriverTubeWallCrosssectionalArea'].value * launcherMassDriverLength
    specs['massDriverTubeWallTotalVolume'] = {value: massDriverTubeWallTotalVolume, units: "m3"}
    const launcherMassDriverTubeMaterial0Density = dParamWithUnits['launcherMassDriverTubeMaterial0Density'].value
    const launcherMassDriverTubeWallTotalMass = launcherMassDriverTubeMaterial0Density * massDriverTubeWallTotalVolume
    specs['launcherMassDriverTubeWallTotalMass'] = {value: launcherMassDriverTubeWallTotalMass, units: "kg"}
    const launcherMassDriverTubeMaterial0Cost = dParamWithUnits['launcherMassDriverTubeMaterial0Cost'].value
    const launcherMassDriverTubeWallCostOfMaterials = launcherMassDriverTubeWallTotalMass * launcherMassDriverTubeMaterial0Cost
    specs['launcherMassDriverTubeWallCostOfMaterials'] = {value: launcherMassDriverTubeWallCostOfMaterials, units: "USD"}

    const massDriverTubeLinerTotalVolume = specs['massDriverTubeLinerCrosssectionalArea'].value * (this.launcherMassDriver1Length+this.launcherMassDriver2Length+this.launcherRampLength)
    specs['massDriverTubeLinerTotalVolume'] = {value: massDriverTubeLinerTotalVolume, units: "m3"}
    const launcherMassDriverTubeMaterial1Density = dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    const launcherMassDriverTubeLinerTotalMass = launcherMassDriverTubeMaterial1Density * massDriverTubeLinerTotalVolume
    specs['launcherMassDriverTubeLinerTotalMass'] = {value: launcherMassDriverTubeLinerTotalMass, units: "kg"}
    const launcherMassDriverTubeMaterial1Cost = dParamWithUnits['launcherMassDriverTubeMaterial1Cost'].value
    const launcherMassDriverTubeLinerCostOfMaterials = launcherMassDriverTubeLinerTotalMass * launcherMassDriverTubeMaterial1Cost
    specs['launcherMassDriverTubeLinerCostOfMaterials'] = {value: launcherMassDriverTubeLinerCostOfMaterials, units: "USD"}

    console.print("launcherMassDriver1Length, ", myFormat(this.launcherMassDriver1Length), "m")
    console.print("launcherMassDriver2Length, ", myFormat(this.launcherMassDriver2Length), "m")
    console.print("launcherRampLength, ", myFormat(this.launcherRampLength), "m")
    console.print("launcherElevatedEvacuatedTubeLength, ", myFormat(launcherElevatedEvacuatedTubeLength), "m")

    console.print("launcherMassDriverBracketsCostOfMaterials, ", myFormat(specs['launcherMassDriverBracketsCostOfMaterials'].value/1e9, 3), "B USD")
    console.print("launcherMassDriverRailsCostOfMaterials, ", myFormat(specs['launcherMassDriverRailsCostOfMaterials'].value/1e9, 3), "B USD")
    console.print("launcherMassDriverScrewsCostOfMaterials, ", myFormat(specs['launcherMassDriverScrewsCostOfMaterials'].value/1e9, 3), "B USD")
    console.print("launcherMassDriverTubeWallCostOfMaterials, ", myFormat(specs['launcherMassDriverTubeWallCostOfMaterials'].value/1e9, 3), "B USD")
    console.print("launcherMassDriverTubeLinerCostOfMaterials, ", myFormat(specs['launcherMassDriverTubeLinerCostOfMaterials'].value/1e9, 3), "B USD")

    const launcherMassDriverTotalMass = 
      launcherMassDriverTubeWallTotalMass +
      launcherMassDriverTubeLinerTotalMass +
      launcherMassDriverBracketsTotalMass + 
      launcherMassDriverRailTotalMass +
      launcherMassDriverScrewsTotalMass

    specs['launcherMassDriverTotalMass'] = {value: launcherMassDriverTotalMass, units: "kg"}
    console.print("launcherMassDriverTotalMass", myFormat(launcherMassDriverTotalMass/1e9, 2), " B kg")

    const launcherMassDriverTotalMassPerMeter = launcherMassDriverTotalMass / launcherMassDriverLength
    specs['launcherMassDriverTotalMassPerMeter'] = {value: launcherMassDriverTotalMassPerMeter, units: "kg"}
    console.print("launcherMassDriverTotalMassPerMeter", launcherMassDriverTotalMassPerMeter, "kg")

    const steelTubeOuterRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value + dParamWithUnits['launcherMassDriverTubeWallThickness'].value + dParamWithUnits['launcherMassDriverTubeLinerThickness'].value
    const massDriverTubeTotalVolume = Math.PI * steelTubeOuterRadius**2 * launcherMassDriverLength
    const densityOfSeaWater = 1025 // kg/m3
    const massOfDisplacedSeaWaterPerMeter = massDriverTubeTotalVolume / launcherMassDriverLength * densityOfSeaWater
    specs['massOfDisplacedSeaWaterPerMeter'] = {value: massOfDisplacedSeaWaterPerMeter, units: "kg/m"}
    console.print("massOfDisplacedSeaWaterPerMeter", massOfDisplacedSeaWaterPerMeter, "kg/m")

    const launcherMassDriverTotalMaterialsCost = 
      launcherMassDriverTubeWallCostOfMaterials +
      launcherMassDriverTubeLinerCostOfMaterials +
      launcherMassDriverBracketsCostOfMaterials + 
      launcherMassDriverRailsCostOfMaterials +
      launcherMassDriverScrewsCostOfMaterials 

    specs['launcherMassDriverTotalMaterialsCost'] = {value: launcherMassDriverTotalMaterialsCost, units: "USD"}
    console.print("launcherMassDriverTotalMaterialsCost, ", myFormat(launcherMassDriverTotalMaterialsCost/1e9, 3), "B USD")

    const launcherMassDriverTotalMaterialsCostPerMeter = launcherMassDriverTotalMaterialsCost / launcherMassDriverLength
    specs['launcherMassDriverTotalMaterialsCostPerMeter'] = {value: launcherMassDriverTotalMaterialsCostPerMeter, units: "USD/m"}
    console.print("launcherMassDriverTotalMaterialsCostPerMeter, ", myFormat(launcherMassDriverTotalMaterialsCostPerMeter), "USD/m")

    const screwMotorUnitCost = dParamWithUnits['launcherMassDriverScrewMotorCost'].value
    const launcherMassDriverScrewMotorsCost = screwMotorUnitCost * this.massDriverAccelerationScrewSegments * 2
    specs['launcherMassDriverScrewMotorsCost'] = {value: launcherMassDriverScrewMotorsCost, units: "USD"}
    console.print("launcherMassDriverScrewMotorsCost, ", myFormat(launcherMassDriverScrewMotorsCost/1e9, 3), "B USD")

    const massDriverManufacturingFactor = 2 // Placeholder
    const launcherMassDriverTotalCost = launcherMassDriverTotalMaterialsCost * massDriverManufacturingFactor + launcherMassDriverScrewMotorsCost
    specs['launcherMassDriverTotalCost'] = {value: launcherMassDriverTotalCost, units: "USD"}
    console.print("launcherMassDriverTotalCost, ", myFormat(launcherMassDriverTotalCost/1e9, 3), "B USD")

    // Ramp costs
    // Tube walls
    // Todo: Borrowing the tube wall cross-section from the massdriver for the ramp, but ramp should probably have its own unique design.
    const rampTubeWallTotalVolume = specs['massDriverTubeWallCrosssectionalArea'].value * this.launcherRampLength
    specs['rampTubeWallTotalVolume'] = {value: rampTubeWallTotalVolume, units: "m3"}
    const rampTubeWallTotalMass = launcherMassDriverTubeMaterial0Density * rampTubeWallTotalVolume
    specs['rampTubeWallTotalMass'] = {value: rampTubeWallTotalMass, units: "kg"}
    const launcherRampTubeWallCostOfMaterials = rampTubeWallTotalMass * launcherMassDriverTubeMaterial0Cost
    specs['launcherRampTubeWallCostOfMaterials'] = {value: launcherRampTubeWallCostOfMaterials, units: "USD"}
    console.print("launcherRampTubeWallCostOfMaterials, ", myFormat(launcherRampTubeWallCostOfMaterials/1e9, 3), "B USD")

    // Brackets
    // Todo: Borrowing the bracket cross-section from the massdriver for the ramp, but ramp should probably have its own unique design.
    const rampBracketsTotalMass = specs['massDriverBracketMass'].value * rampNumBrackets
    specs['rampBracketsTotalMass'] = {value: rampBracketsTotalMass, units: "kg"}
    const launcherRampBracketsCostOfMaterials = dParamWithUnits['launcherMassDriverScrewBracketMaterialCost'].value * rampBracketsTotalMass
    specs['launcherRampBracketsCostOfMaterials'] = {value: launcherRampBracketsCostOfMaterials, units: "USD"}
    console.print("launcherRampBracketsCostOfMaterials, ", myFormat(launcherRampBracketsCostOfMaterials/1e9, 3), "B USD")

    // Rails
    // Todo: Borrowing the rail cross-section from the massdriver for the ramp, but ramp should probably have its own unique design.
    const rampRailsTotalVolume = specs['massDriverRailCrosssectionalArea'].value * this.launcherRampLength
    specs['rampRailsTotalVolume'] = {value: rampRailsTotalVolume, units: "m3"}
    const rampRailsTotalMass = rampRailsTotalVolume * massDriverRailMaterialDensity
    specs['rampRailsTotalMass'] = {value: rampRailsTotalMass, units: "kg"}
    const launcherRampRailsCostOfMaterials = rampRailsTotalMass * dParamWithUnits['launcherMassDriverRailMaterialCost'].value
    specs['launcherRampRailsCostOfMaterials'] = {value: launcherRampRailsCostOfMaterials, units: "USD"}
    console.print("launcherRampRailsCostOfMaterials, ", myFormat(launcherRampRailsCostOfMaterials/1e9, 3), "B USD")

    // Deceleration Screws
    // Borrowing the ramp values for screws from launcherMassDriver...
    const launcherRampScrewMass = launcherMassDriverScrewMass
    const launcherRampScrewMaterialCost = launcherMassDriverScrewMaterialCost
    const launcherRampScrewMaterialProceedsFromRecycling = launcherMassDriverScrewMaterialProceedsFromRecycling

    const launcherRampScrewsTotalMass =  this.rampDeccelerationScrewSegments * launcherMassDriverNumScrews * launcherRampScrewMass
    specs['launcherRampScrewsTotalMass'] = {value: launcherRampScrewsTotalMass, units: "kg"}
    console.print("launcherRampScrewsTotalMass", myFormat(launcherRampScrewsTotalMass/1e9, 2), "B kg")

    const launcherRampScrewsCostOfMaterials = launcherRampScrewMaterialCost * this.rampDeccelerationScrewSegments * 2
    specs['launcherRampScrewsCostOfMaterials'] = {value: launcherRampScrewsCostOfMaterials, units: "USD"}
    console.print('launcherRampScrewsCostOfMaterials', myFormat(launcherRampScrewsCostOfMaterials/1e9, 3), "B USD")

    const launcherRampScrewsProceedsFromRecycling = launcherRampScrewMaterialProceedsFromRecycling * this.rampDeccelerationScrewSegments * 2
    specs['launcherRampScrewsProceedsFromRecycling'] = {value: launcherRampScrewsProceedsFromRecycling, units: "USD"}
    console.print('launcherRampScrewsProceedsFromRecycling', myFormat(launcherRampScrewsProceedsFromRecycling/1e9, 3), "B USD")

    // Ramp mass
    const totalRampMass = rampBracketsTotalMass + rampRailsTotalMass + rampTubeWallTotalMass + launcherRampScrewsTotalMass

    const rampMassPerMeter = totalRampMass / this.launcherRampLength
    specs['rampMassPerMeter'] = {value: rampMassPerMeter, units: "kg/m"}
    console.print("rampMassPerMeter, ", myFormat(rampMassPerMeter), "kg/m")

    // Tunneling costs
    const tunnelRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value + 1.0
    const tunnelingCostPerMeter = tram.tunnelingCostPerMeter(tunnelRadius)
    const launcherRampTunnelingCost = tunnelingCostPerMeter * (this.launcherRampLength)
    specs['launcherRampTunnelingCost'] = {value: launcherRampTunnelingCost, units: "USD"}
    console.print("launcherRampTunnelingCost, ", myFormat(launcherRampTunnelingCost/1e9, 3), "B USD")

    // ToDo: Tunnelling isn't really a "materials cost"...
    const launcherRampTotalMaterialsCost = 
      launcherRampTubeWallCostOfMaterials +
      launcherRampBracketsCostOfMaterials +
      launcherRampRailsCostOfMaterials +
      launcherRampScrewsCostOfMaterials
    specs['launcherRampTotalMaterialsCost'] = {value: launcherRampTotalMaterialsCost, units: "USD"}
    console.print("launcherRampTotalMaterialsCost, ", myFormat(launcherRampTotalMaterialsCost/1e9, 2), "B USD/m")
      
    const rampManufacturingCostFactor = 2 // Placeholder
    const launcherRampTotalCost = launcherRampTotalMaterialsCost*rampManufacturingCostFactor + launcherRampTunnelingCost
    specs['launcherRampTotalCost'] = {value: launcherRampTotalCost, units: "USD"}
    console.print("launcherRampTotalCost, ", myFormat(launcherRampTotalCost/1e9, 3), "B USD")

    // Elevated Evacuated Tube (EVT) - Aeronautically Supported Case
    // Evacuated Tube
    const launcherElevatedEvacuatedTubeTubeCostPerMeter = 6047.9 * 1e6 / 52582 // "Spirit Aerosystems Annual Report and Form 10-K", https://investor.spiritaero.com/filings-financials/FinancialDocs/default.aspx net revenues divided by meters of fuselage they produced in 2023.
    specs['launcherElevatedEvacuatedTubeTubeCostPerMeter'] = {value: launcherElevatedEvacuatedTubeTubeCostPerMeter, units: "USD/m"}
    console.print("launcherElevatedEvacuatedTubeTubeCostPerMeter, ", myFormat(launcherElevatedEvacuatedTubeTubeCostPerMeter), "USD/m")

    const launcherElevatedEvacuatedTubeTubeCost = launcherElevatedEvacuatedTubeTubeCostPerMeter * launcherElevatedEvacuatedTubeLength
    specs['launcherElevatedEvacuatedTubeTubeCost'] = {value: launcherElevatedEvacuatedTubeTubeCost, units: "USD"}
    console.print("launcherElevatedEvacuatedTubeTubeCost, ", myFormat(launcherElevatedEvacuatedTubeTubeCost/1e9, 3), "B USD")

    const id = dParamWithUnits['elevatedEvacuatedTubeInnerRadius'].value
    const od = id + dParamWithUnits['elevatedEvacuatedTubeThickness'].value
    const elevatedEvacuatedTubeCrosssectionalArea = Math.PI * (od**2 - id**2)
    const launcherElevatedEvacuatedTubeTubeMass = launcherElevatedEvacuatedTubeLength * elevatedEvacuatedTubeCrosssectionalArea * dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    specs['launcherElevatedEvacuatedTubeTubeMass'] = {value: launcherElevatedEvacuatedTubeTubeMass, units: "kg"}
    console.print("launcherElevatedEvacuatedTubeTubeMass, ", myFormat(launcherElevatedEvacuatedTubeTubeMass), "kg")

    const launcherElevatedEvacuatedTubeBuoyancyPerMeter = od**2 * Math.PI * planetSpec.airDensityAtAltitude(dParamWithUnits['launcherRampExitAltitude'].value) 
    specs['launcherElevatedEvacuatedTubeBuoyancyPerMeter'] = {value: launcherElevatedEvacuatedTubeBuoyancyPerMeter, units: "kg/m"}
    console.print("launcherElevatedEvacuatedTubeBuoyancyPerMeter, ", myFormat(launcherElevatedEvacuatedTubeBuoyancyPerMeter), "kg/m")

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
    specs['aeronauticLiftCapitalCostPerKgOfPayload'] = {value: aeronauticLiftCapitalCostPerKgOfPayload, units: "USD/kg"}
    console.print("aeronauticLiftCapitalCostPerKgOfPayload, ", myFormat(aeronauticLiftCapitalCostPerKgOfPayload), "USD/kg")
    const launcherAeronauticLiftTotalCapitalCost = aeronauticLiftCapitalCostPerKgOfPayload * launcherElevatedEvacuatedTubeTubeMass
    specs['launcherAeronauticLiftTotalCapitalCost'] = {value: launcherAeronauticLiftTotalCapitalCost, units: "USD"}
    console.print("launcherAeronauticLiftTotalCapitalCost, ", myFormat(launcherAeronauticLiftTotalCapitalCost/1e9, 3), "B USD")

    const elevatedEvacuatedTubeTotalMass = launcherElevatedEvacuatedTubeTubeMass * XAGV40MaxTakeoffMass / (XAGV40MaxTakeoffMass - XAGV40DryMass)
    specs['elevatedEvacuatedTubeTotalMass'] = {value: elevatedEvacuatedTubeTotalMass, units: "kg"}
    console.print("elevatedEvacuatedTubeTotalMass, ", myFormat(elevatedEvacuatedTubeTotalMass/1e6, 2), "M kg")

    const elevatedEvacuatedTubeTotalMassPerMeter = elevatedEvacuatedTubeTotalMass / launcherElevatedEvacuatedTubeLength
    specs['elevatedEvacuatedTubeTotalMassPerMeter'] = {value: elevatedEvacuatedTubeTotalMassPerMeter, units: "kg/m"}
    console.print("elevatedEvacuatedTubeTotalMassPerMeter, ", myFormat(elevatedEvacuatedTubeTotalMassPerMeter), "kg/m")

    const launcherElevatedEvacuatedTubeTotalCost = launcherElevatedEvacuatedTubeTubeCost + launcherAeronauticLiftTotalCapitalCost
    specs['launcherElevatedEvacuatedTubeTotalCost'] = {value: launcherElevatedEvacuatedTubeTotalCost, units: "USD"}
    console.log("launcherElevatedEvacuatedTubeTotalCost, ", myFormat(launcherElevatedEvacuatedTubeTotalCost/1e9, 3), "B USD")

    // Total Launcher Capital Cost
    const launcherTotalCapitalCost = launcherMassDriverTotalCost + launcherRampTotalCost + launcherElevatedEvacuatedTubeTotalCost
    specs['launcherTotalCapitalCost'] = {value: launcherTotalCapitalCost, units: "USD"}
    console.print("launcherTotalCapitalCost, ", myFormat(launcherTotalCapitalCost/1e9, 3), "B USD")

    // Per Meter Costs
    const launcherMassDriverTotalCostPerMeter = launcherMassDriverTotalCost / launcherMassDriverLength
    specs['launcherMassDriverTotalCostPerMeter'] = {value: launcherMassDriverTotalCostPerMeter, units: "USD/m"}
    console.print("launcherMassDriverTotalCostPerMeter, ", myFormat(launcherMassDriverTotalCostPerMeter), "USD/m")

    const launcherRampTotalCostPerMeter = launcherRampTotalCost / launcherRampLength
    specs['launcherRampTotalCostPerMeter'] = {value: launcherRampTotalCostPerMeter, units: "USD/m"}
    console.print("launcherRampTotalCostPerMeter, ", myFormat(launcherRampTotalCostPerMeter), "USD/m")

    const launcherElevatedEvacuatedTubeTotalCostPerMeter = launcherElevatedEvacuatedTubeTotalCost / launcherElevatedEvacuatedTubeLength
    specs['launcherElevatedEvacuatedTubeTotalCostPerMeter'] = {value: launcherElevatedEvacuatedTubeTotalCostPerMeter, units: "USD/m"}
    console.print("launcherElevatedEvacuatedTubeTotalCostPerMeter, ", myFormat(launcherElevatedEvacuatedTubeTotalCostPerMeter), "USD/m")

    // Total proceeds from recycling
    const launcherTotalProceedsFromRecycling =
      launcherMassDriverScrewsProceedsFromRecycling + 
      launcherRampScrewsProceedsFromRecycling
    specs['launcherTotalProceedsFromRecycling'] = {value: launcherTotalProceedsFromRecycling, units: "USD"}
    console.print("launcherTotalProceedsFromRecycling, ", myFormat(launcherTotalProceedsFromRecycling/1e9, 3), "B USD")

    // Total Capital Cost after subtracting proceeds from recycling
    const launcherTotalCapitalCostAfterRecycling = launcherTotalCapitalCost - launcherTotalProceedsFromRecycling
    specs['launcherTotalCapitalCostAfterRecycling'] = {value: launcherTotalCapitalCostAfterRecycling, units: "USD"}
    console.print("launcherTotalCapitalCostAfterRecycling, ", myFormat(launcherTotalCapitalCostAfterRecycling/1e9, 3), "B USD")

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
    console.print("maxLaunchesPerMarsTransferWindow, ", myFormat(maxLaunchesPerMarsTransferWindow), "launches")
    const numberOfMarsTransferSeasons = dParamWithUnits['numberOfMarsTransferSeasons'].value
    const launchSpacingDuringWindow = marsTransferWindowDuration / (maxLaunchesPerMarsTransferWindow-1) // sec // Note: Subtracting 1 because we can launch at the begining and end of the window.
    specs['launchSpacingDuringWindow'] = {value: launchSpacingDuringWindow, units: "sec"}
    console.print("launchSpacingDuringWindow, ", myFormat(launchSpacingDuringWindow), "sec")
    const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value

    // Aeronautic lift
    const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value
    console.print("wholesaleCostOfElectricity, ", myFormat(wholesaleCostOfElectricity, 6), "USD/J")

    const costOfGeneratingLiftAeronautically = 7e-7 // USD/N/s  From below Eq.42 in "The Techno-Economic Viability of Actively Supported Structures for Terrestrial Transit and Space Launch"
    const forceOfGravityOnTube = launcherElevatedEvacuatedTubeTubeMass * 9.81
    const liftForceRequired = forceOfGravityOnTube
    const costOfAeronauticLiftPerSeason = liftForceRequired * marsTransferSeasonDuration * costOfGeneratingLiftAeronautically
    specs['costOfAeronauticLiftPerSeason'] = {value: costOfAeronauticLiftPerSeason, units: "USD"}
    console.print("costOfAeronauticLiftPerSeason, ", myFormat(costOfAeronauticLiftPerSeason/1e9, 3), "B USD")
    const liftDuration = numberOfMarsTransferSeasons * marsTransferSeasonDuration // 10 mars transfer seasons times 14 days per season
    const launcherAeronauticLiftTotalOperatingCost = liftForceRequired * liftDuration * costOfGeneratingLiftAeronautically
    specs['launcherAeronauticLiftTotalOperatingCost'] = {value: launcherAeronauticLiftTotalOperatingCost, units: "USD"}
    console.print("launcherAeronauticLiftTotalOperatingCost", myFormat(launcherAeronauticLiftTotalOperatingCost/1e9, 3), "B USD")

    const powerDrawOfLiftNacels = liftForceRequired * costOfGeneratingLiftAeronautically / wholesaleCostOfElectricity
    specs['powerDrawOfLiftNacels'] = {value: powerDrawOfLiftNacels, units: "W"}
    console.print("powerDrawOfLiftNacels", myFormat(powerDrawOfLiftNacels/1e9, 2), "GW")

    const hvdcCableVoltage = dParamWithUnits['elevatedEvacuatedTubeHvdcCableVoltage'].value
    const hvdcCableCurrent = powerDrawOfLiftNacels / hvdcCableVoltage // A
    const hvdcCableAllowableCurrentDensity = dParamWithUnits['elevatedEvacuatedTubeHvdcCableCurrentDensity'].value // Ohm/m
    const hvdcCableCrossSectionalArea = hvdcCableCurrent / hvdcCableAllowableCurrentDensity // m^2
    const hvdcCableDiameter = Math.sqrt(hvdcCableCrossSectionalArea / Math.PI) * 2 // m
    specs['hvdcCableDiameter'] = {value: hvdcCableDiameter, units: "m"}
    console.print("hvdcCableDiameter", myFormat(hvdcCableDiameter, 3), "m")

    const hvdcCableMaterialDensity = dParamWithUnits['elevatedEvacuatedTubeHvdcCableMaterialDensity'].value // kg/m^3
    const hvdcCableMaterialCost = dParamWithUnits['elevatedEvacuatedTubeHvdcCableMaterialCost'].value // USD/kg
    // Multiply by two for the two cables (one for each direction of current), or by one if we use the elevated evacuated tube itself as a return path for the current
    // Divide by two because we can taper the cables down to almost zero at the ends of the tube
    const hvdcCablesMass = hvdcCableMaterialDensity * Math.PI * (hvdcCableDiameter/2)**2 * launcherElevatedEvacuatedTubeLength * 2 / 2 // kg
    specs['hvdcCablesMass'] = {value: hvdcCablesMass, units: "kg"}
    console.print("hvdcCablesMass", myFormat(hvdcCablesMass), "kg")
    const hvdcCablesCost = hvdcCablesMass * hvdcCableMaterialCost // USD
    specs['hvdcCablesCost'] = {value: hvdcCablesCost, units: "USD"}
    console.print("hvdcCablesCost", myFormat(hvdcCablesCost/1e9, 3), "B USD")

    const hvdcCableMassPortion = hvdcCablesMass / (hvdcCablesMass+launcherElevatedEvacuatedTubeTubeMass)
    specs['hvdcCableMassPortion'] = {value: hvdcCableMassPortion, units: "kg/kg"}
    console.print("hvdcCableMassPortion", myFormat(hvdcCableMassPortion, 2), "kg/kg")

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
    console.print("entranceAirlockLength, ", myFormat(entranceAirlockLength), "m")
    const entranceAirlockVolume = Math.PI * entranceAirlockInnerRadius**2 * entranceAirlockLength
    specs['entranceAirlockVolume'] = {value: entranceAirlockVolume, units: "m3"}
    console.print("entranceAirlockVolume, ", myFormat(entranceAirlockVolume), "m3")
    //const entranceAirlockPumpDownTime = entranceAirlockVolume / vacuumPumpingSpeed * Math.log(outsidePressure/vacuumPumpUltimateTotalPressure)  // https://www.youtube.com/watch?v=bb7E2HAIqp4

    // Tube Evacuation
    const numberOfVacuumPumps = 10000
    const vacuumPumpingSpeed = vacuumPumpPumpingSpeed * numberOfVacuumPumps // m^3/s
    const outsidePressure = 101325 // Pa
    const insidePressure = dParamWithUnits['evacuatedTubeInteriorPressure'].value // Pa
    const interiorVolumeOfMassDiverTube = Math.PI * dParamWithUnits['launcherMassDriverTubeInnerRadius'].value**2 * launcherMassDriverLength
    const interiorVolumeOfRampTube = Math.PI * dParamWithUnits['launcherMassDriverTubeInnerRadius'].value**2 * launcherRampLength
    const interiorVolumeOfElevatedEvacuatedTube = Math.PI * id**2 * launcherElevatedEvacuatedTubeLength
    const interiorVolumeOfEvacuatedTubes = interiorVolumeOfMassDiverTube + interiorVolumeOfRampTube + interiorVolumeOfElevatedEvacuatedTube
    specs['interiorVolumeOfEvacuatedTubes'] = {value: interiorVolumeOfEvacuatedTubes, units: "m3"}
    console.print("interiorVolumeOfEvacuatedTubes, ", myFormat(interiorVolumeOfEvacuatedTubes), "m3")
    const volumeOfNasasSpacePowerFacility = 22653 //m^3
    const tubeVolumeRelativeToNasaSpacePowerFacility = interiorVolumeOfEvacuatedTubes / volumeOfNasasSpacePowerFacility
    console.print("tubeVolumeRelativeToNasaSpacePowerFacility, ", myFormat(tubeVolumeRelativeToNasaSpacePowerFacility, 2), "times larger")
    specs['tubeVolumeRelativeToNasaSpacePowerFacility'] = {value: tubeVolumeRelativeToNasaSpacePowerFacility, units: "m3"}

    const launcherVacuumPumpsCapitalCost = vacuumPumpUnitCost * numberOfVacuumPumps
    specs['launcherVacuumPumpsCapitalCost'] = {value: launcherVacuumPumpsCapitalCost, units: "USD"}
    console.print("launcherVacuumPumpsCapitalCost, ", myFormat(launcherVacuumPumpsCapitalCost/1e9, 3), "B USD")

    const evacuatedTubesPumpDownTime = interiorVolumeOfEvacuatedTubes / vacuumPumpingSpeed * Math.log(outsidePressure/insidePressure)  // https://www.youtube.com/watch?v=bb7E2HAIqp4
    specs['evacuatedTubesPumpDownTime'] = {value: evacuatedTubesPumpDownTime, units: "s"}
    console.print("evacuatedTubesPumpDownTime, ", myFormat(evacuatedTubesPumpDownTime/2300/24), "days")  

    const powerToVacuumPumps = vacuumPumpPower * numberOfVacuumPumps // W
    specs['powerToVacuumPumps'] = {value: powerToVacuumPumps, units: "W"}
    console.print("powerToVacuumPumps, ", myFormat(powerToVacuumPumps/1e6, 2), "MW")

    const energyCostOfInitiallyPullingVacuumInsideTubes = evacuatedTubesPumpDownTime * powerToVacuumPumps * wholesaleCostOfElectricity
    specs['energyCostOfInitiallyPullingVacuumInsideTubes'] = {value: energyCostOfInitiallyPullingVacuumInsideTubes, units: "USD"}
    console.print("energyCostOfInitiallyPullingVacuumInsideTubes, ", myFormat(energyCostOfInitiallyPullingVacuumInsideTubes/1e9, 3), "B USD")

    // Maintaining the vacuum in the vacuum tubes

    // Airlock Evacuation

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
    console.print("exitAirlockLength, ", myFormat(exitAirlockLength), "m")

    const exitAirlockVolume = Math.PI * id**2 * exitAirlockLength
    specs['exitAirlockVolume'] = {value: exitAirlockVolume, units: "m3"}
    console.print("exitAirlockVolume, ", myFormat(exitAirlockVolume), "m3")

    const exitAirlockPumpDownTime = exitAirlockVolume / vacuumPumpingSpeed * Math.log(outsidePressure/insidePressure)
    specs['exitAirlockPumpDownTime'] = {value: exitAirlockPumpDownTime, units: "s"}
    console.print("exitAirlockPumpDownTime, ", myFormat(exitAirlockPumpDownTime/60), "minutes")

    const energyToPullVacuumInsideExitAirlock = exitAirlockPumpDownTime * vacuumPumpPower * numberOfVacuumPumps
    specs['energyToPullVacuumInsideExitAirlock'] = {value: energyToPullVacuumInsideExitAirlock, units: "J"}
    console.print("energyToPullVacuumInsideExitAirlock, ", myFormat(energyToPullVacuumInsideExitAirlock), "J")

    const operatingCostOfPullingVacuumInsideExitAirlock = energyToPullVacuumInsideExitAirlock * wholesaleCostOfElectricity
    specs['operatingCostOfPullingVacuumInsideExitAirlock'] = {value: operatingCostOfPullingVacuumInsideExitAirlock, units: "USD"}
    console.print("operatingCostOfPullingVacuumInsideExitAirlock, ", myFormat(operatingCostOfPullingVacuumInsideExitAirlock), "USD")

    // Accelerating Vehicles
    const mVehicle = dParamWithUnits['launchVehicleEmptyMass'].value
    const mPayload = dParamWithUnits['launchVehiclePayloadMass'].value
    const initialPropellantMass = dParamWithUnits['launchVehiclePropellantMass'].value
    const mSled = dParamWithUnits['launchVehicleSledMass'].value
    const mAdaptiveNut = dParamWithUnits['launcherAdaptiveNutMass'].value
    const m0 = mVehicle + mPayload + initialPropellantMass
    specs['launchVehicleInitialMass'] = {value: m0, units: "kg"}
    console.print("launchVehicleInitialMass, ", myFormat(m0), "kg")
    const launchTrainMass = mAdaptiveNut + mSled + mVehicle + mPayload + initialPropellantMass
    specs['launchTrainMass'] = {value: launchTrainMass, units: "kg"}
    console.print("launchTrainMass, ", myFormat(launchTrainMass), "kg")
    const regenerativelyDeceleratedMass = mAdaptiveNut
    const massDriverExitSpeed = dParamWithUnits['launcherMassDriverExitVelocity'].value
    console.log("##### launcherMassDriverExitVelocity", massDriverExitSpeed)
    const launcherAccelerationEfficiency = dParamWithUnits['launcherAccelerationEfficiency'].value
    const launcherDecelerationEfficiency = dParamWithUnits['launcherDecelerationEfficiency'].value // Assume regenerative breaking is as efficient as accelerating

    specs['energyLostToDragWhileInTube'] = {value: this.energyLostToDragWhileInTube, units: 'J'}
    console.print("energyLostToDragWhileInTube, ", myFormat(this.energyLostToDragWhileInTube/1e9, 2), "GJ")
    specs['energyLostToDragWhileInAtmosphere'] = {value: this.energyLostToDragWhileInAtmosphere, units: 'J'}
    console.print("energyLostToDragWhileInAtmosphere, ", myFormat(this.energyLostToDragWhileInAtmosphere/1e9, 2), "GJ")

    const kineticEnergyOfLaunch = 0.5 * launchTrainMass * massDriverExitSpeed**2  // One half m v^2
    const kineticEnergyRecovered = 0.5 * regenerativelyDeceleratedMass * massDriverExitSpeed**2 // One half m v^2
    const massDriverEnergyConsumedPerLaunch = kineticEnergyOfLaunch / launcherAccelerationEfficiency - kineticEnergyRecovered * launcherDecelerationEfficiency
    specs['massDriverEnergyConsumedPerLaunch'] = {value: massDriverEnergyConsumedPerLaunch, units: "J"}
    console.print("massDriverEnergyConsumedPerLaunch, ", myFormat(massDriverEnergyConsumedPerLaunch/1e9, 2), "GJ")

    const massDriverPowerPerLaunch = massDriverEnergyConsumedPerLaunch / launchSpacingDuringWindow
    specs['massDriverPowerPerLaunch'] = {value: massDriverPowerPerLaunch, units: "W"}
    console.print("massDriverPowerPerLaunch, ", myFormat(massDriverPowerPerLaunch/1e9, 2), "GJ")

    const massDriverEnergyCostPerLaunch = massDriverEnergyConsumedPerLaunch * wholesaleCostOfElectricity
    specs['massDriverEnergyCostPerLaunch'] = {value: massDriverEnergyCostPerLaunch, units: "USD"}
    console.print("massDriverEnergyCostPerLaunch, ", myFormat(massDriverEnergyCostPerLaunch), "USD")

    const totalEnergyPerLaunch = massDriverEnergyConsumedPerLaunch + energyToPullVacuumInsideExitAirlock
    specs['totalEnergyPerLaunch'] = {value: totalEnergyPerLaunch, units: "J"}
    console.print("totalEnergyPerLaunch, ", myFormat(totalEnergyPerLaunch/1e9), "GJ")

    const portionOfEnergyLostToDragInTube = this.energyLostToDragWhileInTube / kineticEnergyOfLaunch
    specs['portionOfEnergyLostToDragInTube'] = {value: portionOfEnergyLostToDragInTube, units: "J/J"}
    console.print("portionOfEnergyLostToDragInTube, ", myFormat(portionOfEnergyLostToDragInTube, 6), "J/J")

    const powerRequirementsDuringLaunch = totalEnergyPerLaunch / launchSpacingDuringWindow // This is the power we need to supply, which get's absorbed by the flywheels in the screws.
    specs['powerRequirementsDuringLaunch'] = {value: powerRequirementsDuringLaunch, units: "W"}
    console.print("powerRequirementsDuringLaunch, ", (powerRequirementsDuringLaunch/1e6).toLocaleString('en-US', {maximumFractionDigits:2}), "MW")

    // Calculate the power from the launch train's mass, acceleration, exit speed, and energy conversion efficiency
    const earlierEMLaunchersEnergyConversionEfficiency = 0.5
    const peakPowerRequirementsOfEarlierEMLaunchers = launchTrainMass * launcherMassDriverForwardAcceleration * massDriverExitSpeed / earlierEMLaunchersEnergyConversionEfficiency
    specs['peakPowerRequirementsOfEarlierEMLaunchers'] = {value: peakPowerRequirementsOfEarlierEMLaunchers, units: "W"}
    console.print("peakPowerRequirementsOfEarlierEMLaunchers, ", (peakPowerRequirementsOfEarlierEMLaunchers/1e6).toLocaleString('en-US', {maximumFractionDigits:2}), "MW")
  
    const totalEnergyCostPerLaunch = operatingCostOfPullingVacuumInsideExitAirlock + massDriverEnergyCostPerLaunch
    specs['totalEnergyCostPerLaunch'] = {value: totalEnergyCostPerLaunch, units: "USD"}
    console.print("totalEnergyCostPerLaunch, ", myFormat(totalEnergyCostPerLaunch), "USD")

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
    const launchVehicleCost = dParamWithUnits['launchVehicleCostPerKg'].value * mVehicle
    specs['launchVehicleCost'] = {value: launchVehicleCost, units: "USD"}
    console.print("launchVehicleCost, ", myFormat(launchVehicleCost/1e6, 2), "M USD")

    const totalLaunchVehicleCosts = launchVehicleCost * numLaunchesPerMarsTransferSeason * numberOfMarsTransferSeasons
    specs['totalLaunchVehicleCosts'] = {value: totalLaunchVehicleCosts, units: "USD"}
    console.print("totalLaunchVehicleCosts, ", myFormat(totalLaunchVehicleCosts/1e9, 3), "B USD")

    // Total Captital Costs
    const totalCapitalCosts = launcherTotalCapitalCost + launcherVacuumPumpsCapitalCost
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

    const costPerKgOfPayloadLandedOnMars = (totalCapitalCosts + totalOperatingCosts) / totalPayloadLandedOnMars
    specs['costPerKgOfPayloadLandedOnMars'] = {value: costPerKgOfPayloadLandedOnMars, units: "USD"}
    console.print("costPerKgOfPayloadLandedOnMars, ", costPerKgOfPayloadLandedOnMars.toLocaleString('en-US', {maximumFractionDigits:2}), "USD")

    // Hoop stress estimate within the screw shaft
    const ro = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
    const ri = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
    const σ_y = dParamWithUnits['launcherMassDriverScrewMaterialYieldStrength'].value
    const ρ = dParamWithUnits['launcherMassDriverScrewMaterialDensity'].value
    const f = dParamWithUnits['launcherMassDriverScrewEngineeringFactor'].value

    const maxHoopStress = σ_y/f
    specs['maxHoopStress'] = {value: maxHoopStress, units: "Pa"}
    console.print("maxHoopStress, ", myFormat(maxHoopStress/1e6), "MPa")

    const screwShaftMaxRateOfRotation = Math.sqrt(σ_y/f/ρ/(ro**2-ri**2))  // Units are radians per second
    specs['screwShaftMaxRateOfRotation'] = {value: screwShaftMaxRateOfRotation, units: "rad/s"}
    const screwShaftMaxRateOfRotationRPM = screwShaftMaxRateOfRotation * 60 / (2 * Math.PI) // Convert to RPM
    console.print("screwShaftMaxRateOfRotation, ", myFormat(screwShaftMaxRateOfRotation, 2), "rad/s", myFormat(screwShaftMaxRateOfRotationRPM), "RPM")

    // Note - this does not yet consider the additional stress due to the mass of the screw flights or extra speed at the ends of the flights.
    const screwShaftMaxRimSpeed = screwShaftMaxRateOfRotation * ro
    specs['screwShaftMaxRimSpeed'] = {value: screwShaftMaxRimSpeed, units: "m/s"}
    console.print("screwShaftMaxRimSpeed, ", myFormat(screwShaftMaxRimSpeed, 2), "m/s")

    const s2gp = dParamWithUnits['adaptiveNutShaftToGrapplerPad'].value
    const tr = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
    const midPadRadius = (ro + s2gp + tr)/2
    const screwThreadFaceSpeed = screwShaftMaxRateOfRotation * midPadRadius
    specs['screwThreadFaceSpeed'] = {value: screwThreadFaceSpeed, units: "m/s"}
    console.print("screwThreadFaceSpeed, ", myFormat(screwThreadFaceSpeed, 2), "m/s")

    const screwFlightMaxSlope = massDriverExitSpeed / screwThreadFaceSpeed
    specs['screwFlightMaxSlope'] = {value: screwFlightMaxSlope, units: "m/m"}
    console.print("screwFlightMaxSlope, ", screwFlightMaxSlope, "m/m")

    const accelleratedMass =  mAdaptiveNut + mSled + mVehicle + initialPropellantMass + mPayload
    const forwardForce = accelleratedMass * launcherMassDriverForwardAcceleration
    specs['forwardForce'] = {value: forwardForce, units: "N"}
    console.print("forwardForce, ", forwardForce, "N")

    const maxForceOnScrewFlights = forwardForce * screwFlightMaxSlope
    specs['maxForceOnScrewFlights'] = {value: maxForceOnScrewFlights, units: "N"}
    console.print("maxForceOnScrewFlights, ", maxForceOnScrewFlights, "N")

    const numFlightsContactedPerScrew = dParamWithUnits['launcherMassDriverNumFlightsContactedPerScrew'].value

    const maxTorqueOnEachScrew = maxForceOnScrewFlights / midPadRadius / launcherMassDriverNumScrews
    specs['maxTorqueOnEachScrew'] = {value: maxTorqueOnEachScrew, units: "N*m"}
    console.print("maxTorqueOnEachScrew, ", myFormat(maxTorqueOnEachScrew), "N*m")

    const maxTorquePerMMOfEachScrew = maxTorqueOnEachScrew / adaptiveNutLength / 1000 // N*m/m
    specs['maxTorquePerMMOfEachScrew'] = {value: maxTorquePerMMOfEachScrew, units: "N*m/m"}
    console.print("maxTorquePerMMOfEachScrew, ", myFormat(maxTorquePerMMOfEachScrew), "N*m/m")

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
    console.print('launcherGrapplerAttractiveForcePerMeterSquared', myFormat(launcherGrapplerAttractiveForcePerMeterSquared), "N/m^2")

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
    console.print('peakEddyCurrentPowerLossPerStrip', myFormat(peakEddyCurrentPowerLossPerStrip), "W/kg")

    const peakRateOfKineticEnergyTransfer = accelleratedMass * massDriverExitSpeed * launcherMassDriverForwardAcceleration
    specs['peakRateOfKineticEnergyTransfer'] = {value: peakRateOfKineticEnergyTransfer, units: 'W'}
    console.print('peakRateOfKineticEnergyTransfer', myFormat(peakRateOfKineticEnergyTransfer), "W")

    // This is very rough - we really need to tally up the mass of Secondaries (the part of screw flights that engages with the grappler pads) in the easing zones.
    const screwFlightDepth = 0.01 // m - The thickness of the part of the screw flight that engages with the grappler pad
    const massOfSecondariesInEasingZones = grapplerPadStripEasingLength * 2 * grapplerPadContactWidth * screwFlightDepth * dParamWithUnits['launcherMassDriverScrewMaterialDensity'].value // kg
    // Assuming just one strip of grappler pads per screw flight near the end of the launcher.
    const peakEddyCurrentPowerLoss = peakEddyCurrentPowerLossPerStrip * launcherGrapplerTotalContactFlights * massOfSecondariesInEasingZones
    specs['peakEddyCurrentPowerLoss'] = {value: peakEddyCurrentPowerLoss, units: 'W'}
    console.print('peakEddyCurrentPowerLoss', myFormat(peakEddyCurrentPowerLoss), "W")

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
    // console.print("orbitalRingMass, ", myFormat(orbitalRingMass), "kg")
    // const orbitalRingCost = orbitalRingMass * 4000 // USD/kg
    // specs['orbitalRingCost'] = {value: orbitalRingCost, units: "USD"}
    // console.print("orbitalRingCost, ", myFormat(orbitalRingCost/1e9, 3), "B USD")
    
    const postFreeFlightVehicleMass = mVehicle + mPayload + this.remainingPropellantAfterFreeFlight
    const fleetMass = numLaunchesPerMarsTransferSeason * postFreeFlightVehicleMass
    specs['fleetMass'] = {value: fleetMass, units: "kg"}
    console.print("fleetMass, ", myFormat(fleetMass), "kg")

    const estimatedFleetHabitableVolume = numLaunchesPerMarsTransferSeason * 40  // m^3
    const shellInnerRadius = Math.pow(estimatedFleetHabitableVolume * 3 / 4 / Math.PI, 0.333)  // V = 4/3 Pi r^3
    const densityOfWater = 1000 // kg/m^3
    const equivalentShellOfWaterThickness = Math.pow(fleetMass/densityOfWater/3*4/Math.PI + shellInnerRadius**3, 0.333) - shellInnerRadius // fleetMass = rho 4/3 Pi (r1^3 - r0^3)
    specs['equivalentShellOfWaterThickness'] = {value: equivalentShellOfWaterThickness, units: "m"}
    console.log("equivalentShellOfWaterThickness, ", myFormat(equivalentShellOfWaterThickness, 2), "m")

    const launchFromPlanet = dParamWithUnits['launchFromPlanet'].value
    const launchToPlanet = dParamWithUnits['launchToPlanet'].value
    console.print("In our cost model, each spacecraft has an initial mass of", myFormat(mVehicle + mPayload + initialPropellantMass), "kg")
    console.print("and places", myFormat(mPayload), "kg on", launchToPlanet, ".")
    console.print("Launching", myFormat(numLaunchesPerMarsTransferSeason), "spacecraft per transfer window over", myFormat(numberOfMarsTransferSeasons), "windows yields", myFormat((numLaunchesPerMarsTransferSeason * numberOfMarsTransferSeasons * mPayload)/1e6, 2), "million kg delivered.")
    console.print("The screw flights move at", myFormat(screwThreadFaceSpeed), "m/s,")
    console.print("and the launch train’s peak speed is", myFormat(massDriverExitSpeed), "m/s;")
    console.print("setting the max thread slope to", myFormat(screwFlightMaxSlope, 2), "m/m.")
    console.print("The launch train requires", myFormat(forwardForce/1e6, 2), "MN of thrust, resulting in", myFormat(maxForceOnScrewFlights/1e6, 2), "MN of maximum lateral force spread across", myFormat(numFlightsContactedPerScrew*launcherMassDriverNumScrews), "screw flights.")
    console.print("With a magnetic flux density of", myFormat(launcherScrewFlightAverageMagneticFluxDensity, 2), "T,")
    console.print("the attractive force per square meter is", myFormat(launcherGrapplerAttractiveForcePerMeterSquared/1e6, 2), "MN/m^2")
    console.print("requiring a magnetic pad interface area of", myFormat(launcherGrapplerTotalContactArea), "m^2.")
    console.print("Assuming a pad radial length of", myFormat(grapplerPadContactWidth, 2), "m,")
    console.print("the adaptive nut must be", myFormat(grapplerPadContactLength), "m long.")
    console.print("At", myFormat(launcherMassDriverForwardAcceleration, 2), "m/s^2 of acceleration,")
    console.print("the launch section must be", myFormat(launcherMassDriverLength/1000), "km long,")
    console.print("with a", myFormat(launcherRampLength/1000), "km ramp and a", myFormat(launcherElevatedEvacuatedTubeLength/1000), "km elevated evacuated tube to reach an altitude of", myFormat(launcherEvacuatedTubeExitAltitude/1000), "km.")

    console.print("The mass driver cost is", myFormat(launcherMassDriverTotalCost/1e9, 2), "B USD (", myFormat(launcherMassDriverTotalCostPerMeter), "USD/m),")
    console.print("the ramp cost is", myFormat(launcherRampTotalCost/1e9, 2), "B USD (", myFormat(launcherRampTotalCostPerMeter), "USD/m),")
    console.print("and the elevated evacuated tube cost is", myFormat(launcherElevatedEvacuatedTubeTotalCost/1e9, 2), "B USD (", myFormat(launcherElevatedEvacuatedTubeTotalCostPerMeter), "USD/m).")
    console.print("The mass-per-meter of these components is", myFormat(launcherMassDriverTotalMassPerMeter), "kg, ", myFormat(rampMassPerMeter), "kg, and", myFormat(elevatedEvacuatedTubeTotalMassPerMeter), "kg, respectively.")

    console.print("The cost of aeronautic lift is", myFormat(launcherAeronauticLiftTotalOperatingCost/1e9, 2), "B USD.")
    console.print("The cost of aeronautic lift per window is", myFormat(costOfAeronauticLiftPerSeason/1e9, 2), "B USD.")
    console.print("The cost of the launch vehicle is", myFormat(launchVehicleCost/1e6, 2), "M USD.")
    console.print("The total cost of all launch vehicles is", myFormat(totalLaunchVehicleCosts/1e9, 2), "B USD.")
    console.print("The total capital cost of the launch system is", myFormat(totalCapitalCosts/1e9, 2), "B USD.")
    console.print("The operating costs over ~20 years of operation are", myFormat(totalOperatingCosts/1e9, 2), "B USD.")
    console.print("The cost per kg landed on Mars is", myFormat(costPerKgOfPayloadLandedOnMars), "USD.")

    const variableNames = [
      "launcherMassDriverLength",
      "launcherRampLength",
      "launcherElevatedEvacuatedTubeLength",

      "launcherMassDriverBracketsCostOfMaterials",
      "launcherMassDriverRailsCostOfMaterials",
      "launcherMassDriverScrewsCostOfMaterials",
      "launcherMassDriverTubeWallCostOfMaterials",
      "launcherMassDriverTubeLinerCostOfMaterials",
      "launcherMassDriverTotalMaterialsCost",
      "launcherMassDriverTotalMaterialsCostPerMeter",
      "launcherMassDriverScrewMotorsCost",
      "launcherMassDriverTotalCost",
      "launcherMassDriverTotalCostPerMeter",
      
      "launcherRampTubeWallCostOfMaterials",
      "launcherRampBracketsCostOfMaterials",
      "launcherRampRailsCostOfMaterials",
      "launcherRampTunnelingCost",
      "launcherRampTotalMaterialsCost",
      "launcherRampTotalCost",
      "launcherRampTotalCostPerMeter",

      "launcherElevatedEvacuatedTubeTubeMass",
      "launcherElevatedEvacuatedTubeBuoyancyPerMeter",
      "launcherAeronauticLiftTotalCapitalCost",
      "aeronauticLiftCapitalCostPerKgOfPayload",
      "launcherElevatedEvacuatedTubeTubeCost",
      "launcherElevatedEvacuatedTubeTubeCostPerMeter",
      "launcherElevatedEvacuatedTubeTotalCost",
      "launcherElevatedEvacuatedTubeTotalCostPerMeter",

      "launcherVacuumPumpsCapitalCost",
      "energyCostOfInitiallyPullingVacuumInsideTubes",
      "launcherTotalCapitalCost",

      "interiorVolumeOfEvacuatedTubes",
      "evacuatedTubesPumpDownTime",
      "launcherAeronauticLiftTotalOperatingCost",
      "exitAirlockPumpDownTime",
      "operatingCostOfPullingVacuumInsideExitAirlock",
      "totalEnergyCostPerLaunch",
      "totalEnergyCostForAllLaunches",
      "launchVehicleCost",
      "totalCapitalCosts",
      "totalOperatingCosts",
      "totalPayloadLandedOnMars",
      "costPerKgOfPayloadLandedOnMars"
    ]

    const descriptions = {
      launcherMassDriverLength: "Accelerator Length",
      launcherRampLength: "Ramp Length",
      launcherElevatedEvacuatedTubeLength: "Elevated Evacuated Tube Length",

      launcherMassDriverBracketsCostOfMaterials: "Brackets Cost of Materials",
      launcherMassDriverRailsCostOfMaterials: "Rails Cost of Materials",
      launcherMassDriverScrewsCostOfMaterials: "Screws Cost of Materials",
      launcherMassDriverTubeWallCostOfMaterials: "Tube Wall Cost of Materials",
      launcherMassDriverTubeLinerCostOfMaterials: "Tube Liner Cost of Materials",
      launcherMassDriverTotalMaterialsCost: "Total Materials Cost",
      launcherMassDriverTotalMaterialsCostPerMeter: "Total Materials Cost Per Meter",
      launcherMassDriverScrewMotorsCost: "Screw Motors Cost",
      launcherMassDriverTotalCost: "Accelerator Total Cost",
      launcherMassDriverTotalCostPerMeter: "Accelerator Cost Per Meter",
      
      launcherRampTubeWallCostOfMaterials: "Ramp Tube Wall Cost of Materials",
      launcherRampBracketsCostOfMaterials: "Ramp Brackets Cost of Materials",
      launcherRampRailsCostOfMaterials: "Ramp Rails Cost of Materials",
      launcherRampTunnelingCost: "Ramp Tunneling Cost",
      launcherRampTotalMaterialsCost: "Ramp Total Materials Cost",
      launcherRampTotalCost: "Ramp Total Cost",
      launcherRampTotalCostPerMeter: "Ramp Total Cost Per Meter",

      launcherElevatedEvacuatedTubeTubeMass: "Elevated Evacuated Tube Tube Mass",
      launcherElevatedEvacuatedTubeBuoyancyPerMeter: "Elevated Evacuated Tube Buoyancy Per Meter",
      launcherAeronauticLiftTotalCapitalCost: "Aeronautic Lift Total Capital Cost",
      aeronauticLiftCapitalCostPerKgOfPayload: "Aeronautic Lift Capital Cost Per Kg of Payload",
      launcherElevatedEvacuatedTubeTubeCost: "Elevated Evacuated Tube Tube Cost",
      launcherElevatedEvacuatedTubeTubeCostPerMeter: "Elevated Evacuated Tube Tube Cost Per Meter",
      launcherElevatedEvacuatedTubeTotalCost: "Elevated Evacuated Tube Total Cost",
      launcherElevatedEvacuatedTubeTotalCostPerMeter: "Elevated Evacuated Tube Total Cost Per Meter",

      launcherVacuumPumpsCapitalCost: "Capital Cost of Vacuum Pumps",
      launcherTotalCapitalCost: "System Total Capital Cost",

      interiorVolumeOfEvacuatedTubes: "Interior Volume of Evacuated Tubes",
      evacuatedTubesPumpDownTime: "Pump Down Time",
      launcherAeronauticLiftTotalOperatingCost: "Cost of Aeronautic Lift",
      energyCostOfInitiallyPullingVacuumInsideTubes: "Energy Cost of Initially Pulling Vacuum",
      exitAirlockPumpDownTime: "Exit Airlock Pump Down Time",

      operatingCostOfPullingVacuumInsideExitAirlock: "Operating Cost of Pulling Vacuum Inside Airlock",
      totalEnergyCostPerLaunch: "Total Energy Cost Per Launch",
      totalEnergyCostForAllLaunches: "Total Energy Cost For All Launches",
      launchVehicleCost: "Launch Vehicle Cost",
      totalCapitalCosts: "Total Capital Costs",
      totalOperatingCosts: "Total Operating Costs",
      totalPayloadLandedOnMars: "Total Payload Landed on Mars",
      costPerKgOfPayloadLandedOnMars: "Cost Per Kg of Payload Landed on Mars"
    }
    
    console.print("===========================================")
    variableNames.forEach(v => {
      const spec = specs[v]
      const label = descriptions[v] || v
      if (spec) {
        if (spec.units == "USD") {
          if (spec.value >= 1e8) {
            console.print(label + ":", myFormat(spec.value / 1e9, 3), "B", spec.units)
          } else if (spec.value >= 1e5) {
            console.print(label + ":", myFormat(spec.value / 1e6, 3), "M", spec.units)
          } else {
            console.print(label + ":", myFormat(spec.value), spec.units)
          }
        }
        else if (spec.units == "m") {
          if (spec.value >= 1e3) {
            console.print(label + ":", myFormat(spec.value / 1e3), "km")
          } else {
            console.print(label + ":", myFormat(spec.value), spec.units)
          }
        }
        else if (spec.units == "s") {
          if (spec.value >= 3600*24) {
            console.print(label + ":", myFormat(spec.value / 3600 / 24, 1), "days")
          }
          else if (spec.value >= 3600) {
            console.print(label + ":", myFormat(spec.value / 3600, 1), "hr")
          }
          else if (spec.value >= 60) {
            console.print(label + ":", myFormat(spec.value / 60, 1), "min")
          }
          else {
            console.print(label + ":", myFormat(spec.value), spec.units)
          }
        }
        else if ((spec.units == "kg") || (spec.units == "USD/m") || (spec.units == "kg/m") || (spec.units == "s") || (spec.units == "m3")) {
          console.print(label + ":", myFormat(spec.value), spec.units)
        }
        else {
          console.print(label + ":", myFormat(spec.value, 3), spec.units)
        }
      } else {
        console.print(label + ": (no data)")
      }
    })
    
  }

}
