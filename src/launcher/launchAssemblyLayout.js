// Physical body envelope; grappler timing coordinates remain unchanged.
export function adaptiveNutBodyEnvelope(params) {
  const p = key => params[key].value
  const first = (p('adaptiveNutBodyLength')-p('adaptiveNutGrapplerLength'))/2
  const margin = Math.max(0.25,2*p('adaptiveNutGrapplerBallJointRadius'))
  const aft = first-margin, front = first+p('adaptiveNutGrapplerLength')+margin
  return {aft,front,length:front-aft,margin}
}
export const launchBodyColors = {sled:0x527a67,adaptiveNut:0x8a648e}
export const nutToSledGap = 0

// The vehicle tail and sled rear move together when the nut contact span changes.
export function launchTrainOffsets(params) {
  const scale = params.launchSystemForwardScaleFactor.value
  const sledAft = adaptiveNutBodyEnvelope(params).front+nutToSledGap/scale
  return {sledAft,vehicleForward:sledAft*scale}
}
