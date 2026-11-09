// Magnetic contact sizing shared by parameter derivation and the engineering report.
export function adaptiveNutEngineering(params, specs = {}, maxForceOnScrewFlights) {
  const p = key => params[key].value
  const launcherScrewFlightAverageMagneticFluxDensity = p('launcherMassDriverScrewFlightSaturationFluxDensity')*p('launcherMassDriverScrewFlightMagneticFluxDensityPortion')
  const launcherGrapplerAttractiveForcePerMeterSquared = launcherScrewFlightAverageMagneticFluxDensity**2/p('permeabilityOfFreeSpace')
  const launcherGrapplerTotalContactArea = maxForceOnScrewFlights/launcherGrapplerAttractiveForcePerMeterSquared
  const launcherGrapplerTotalContactFlights = p('launcherMassDriverNumScrews')*p('launcherMassDriverNumFlightsContactedPerScrew')
  const grapplerPadContactWidth = p('launcherMassDriverScrewThreadRadius')-p('launcherMassDriverScrewShaftOuterRadius')-p('adaptiveNutShaftToGrapplerPad')
  const grapplerPadContactLength = launcherGrapplerTotalContactArea/grapplerPadContactWidth/launcherGrapplerTotalContactFlights
  const result = {launcherScrewFlightAverageMagneticFluxDensity,launcherGrapplerAttractiveForcePerMeterSquared,
    launcherGrapplerTotalContactArea,launcherGrapplerTotalContactFlights,grapplerPadContactWidth,grapplerPadContactLength}
  const units = ['T','N/m^2','m^2','','m','m']
  Object.entries(result).forEach(([key,value],i) => { specs[key] = {value,units:units[i]} })
  return result
}

export function adaptiveNutContactSizing(params) {
  const p = key => params[key].value
  const mass = ['launcherAdaptiveNutMass','launchSledMass','launchVehicleEmptyMass','launchVehiclePayloadMass','launchVehiclePropellantMass']
    .reduce((sum,key)=>sum+p(key),0)
  const midPadRadius = (p('launcherMassDriverScrewShaftOuterRadius')+p('adaptiveNutShaftToGrapplerPad')+p('launcherMassDriverScrewThreadRadius'))/2
  const angularVelocity = p('launcherMassDriverScrewMaxTipSpeed')/p('launcherMassDriverScrewThreadRadius')
  const maxForce = mass*p('launchVehicleMassDriverForwardAcceleration')*p('launcherMassDriverExitVelocity')/(angularVelocity*midPadRadius)
  return adaptiveNutEngineering(params,{},maxForce)
}
