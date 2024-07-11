import { massDriverBracketModel } from "./MassDriverBracket"
import { massDriverScrewModel } from "./MassDriverScrew"
import { massDriverTubeModel } from "./MassDriverTube"


export function define_genLauncherSpecs() {

  return function (dParamWithUnits, specs) {
    const tempBracketObject = new massDriverBracketModel(dParamWithUnits, this.massDriver2Curve, this.launcherMassDriver2Length, (this.massDriverScrewSegments+1), 0)
    tempBracketObject.genSpecs(dParamWithUnits, specs)
    const massDriverBracketsTotalMass = specs['massDriverBracketMass'].value * this.numVirtualMassDriverBrackets
    specs['massDriverBracketsTotalMass'] = {value: massDriverBracketsTotalMass, units: "kg"}
    const massDriverBracketsTotalMaterialCost = specs['massDriverBracketMaterialCost'].value * this.numVirtualMassDriverBrackets
    specs['massDriverBracketsTotalMaterialCost'] = {value: massDriverBracketsTotalMaterialCost, units: "USD"}

    const tempScrewObject = new massDriverScrewModel()
    tempScrewObject.genSpecs(dParamWithUnits, specs)
    const massDriverScrewsTotalMass = specs['massDriverScrewMass'].value * this.massDriverScrewSegments * 2
    specs['massDriverScrewsTotalMass'] = {value: massDriverScrewsTotalMass, units: "kg"}
    const massDriverScrewsTotalMaterialCost = specs['massDriverScrewMaterialCost'].value * this.massDriverScrewSegments * 2
    specs['massDriverScrewsTotalMaterialCost'] = {value: massDriverScrewsTotalMaterialCost, units: "USD"}

    const tempTubeObject = new massDriverTubeModel()
    tempTubeObject.genSpecs(dParamWithUnits, specs)
    const massDriverTubeWallTotalVolume = specs['massDriverTubeWallCrosssectionalArea'].value * (this.launcherMassDriver1Length+this.launcherMassDriver2Length+this.launcherRampLength)
    specs['massDriverTubeWallTotalVolume'] = {value: massDriverTubeWallTotalVolume, units: "m3"}
    const launcherMassDriverTubeMaterial0Density = dParamWithUnits['launcherMassDriverTubeMaterial0Density'].value
    const launcherMassDriverTubeWallTotalMass = launcherMassDriverTubeMaterial0Density * massDriverTubeWallTotalVolume
    specs['launcherMassDriverTubeWallTotalMass'] = {value: launcherMassDriverTubeWallTotalMass, units: "kg"}
    const launcherMassDriverTubeMaterial0Cost = dParamWithUnits['launcherMassDriverTubeMaterial0Cost'].value
    const massDriverTubeWallTotalMaterialCost = launcherMassDriverTubeWallTotalMass * launcherMassDriverTubeMaterial0Cost
    specs['massDriverTubeWallTotalMaterialCost'] = {value: massDriverTubeWallTotalMaterialCost, units: "USD"}

    const massDriverTubeLinerTotalVolume = specs['massDriverTubeLinerCrosssectionalArea'].value * (this.launcherMassDriver1Length+this.launcherMassDriver2Length+this.launcherRampLength)
    specs['massDriverTubeLinerTotalVolume'] = {value: massDriverTubeLinerTotalVolume, units: "m3"}
    const launcherMassDriverTubeMaterial1Density = dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    const launcherMassDriverTubeLinerTotalMass = launcherMassDriverTubeMaterial1Density * massDriverTubeLinerTotalVolume
    specs['launcherMassDriverTubeLinerTotalMass'] = {value: launcherMassDriverTubeLinerTotalMass, units: "kg"}
    const launcherMassDriverTubeMaterial1Cost = dParamWithUnits['launcherMassDriverTubeMaterial1Cost'].value
    const massDriverTubeLinerTotalMaterialCost = launcherMassDriverTubeLinerTotalMass * launcherMassDriverTubeMaterial1Cost
    specs['massDriverTubeLinerTotalMaterialCost'] = {value: massDriverTubeLinerTotalMaterialCost, units: "USD"}

    console.log("launcherMassDriver1Length:", Math.round(this.launcherMassDriver1Length))
    console.log("launcherMassDriver2Length:", Math.round(this.launcherMassDriver2Length))
    console.log("launcherRampLength:", Math.round(this.launcherRampLength))
    console.log("massDriverBracketsTotalMaterialCost:", Math.round(specs['massDriverBracketsTotalMaterialCost'].value/1e6)/1e3)
    console.log("massDriverScrewsTotalMaterialCost:", Math.round(specs['massDriverScrewsTotalMaterialCost'].value/1e6)/1e3)
    console.log("massDriverTubeWallTotalMaterialCost:", Math.round(specs['massDriverTubeWallTotalMaterialCost'].value/1e6)/1e3)
    console.log("massDriverTubeLinerTotalMaterialCost:", Math.round(specs['massDriverTubeLinerTotalMaterialCost'].value/1e6)/1e3)

    const launcherMassDriverCostPerMeter = Math.round((specs['massDriverBracketsTotalMaterialCost'].value+specs['massDriverScrewsTotalMaterialCost'].value)/this.launcherMassDriver2Length)
    console.log("launcherMassDriverCostPerMeter:", launcherMassDriverCostPerMeter)
    const launcherMassDriverMaterialsCost = launcherMassDriverCostPerMeter * (this.launcherMassDriver1Length+this.launcherMassDriver2Length+this.launcherRampLength)
    specs['launcherMassDriverMaterialsCost'] = {value: launcherMassDriverMaterialsCost, units: "USD"}
    console.log("launcherMassDriverMaterialsCost:", Math.round(launcherMassDriverMaterialsCost/1e6)/1e3, "B USD")
  }

}
