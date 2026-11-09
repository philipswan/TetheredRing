import { createRailWrappingSledGeometry, launchSledLayout } from './LaunchSledGeometry.js'
import { adaptiveNutBodyEnvelope } from './launchAssemblyLayout.js'

// Geometry is local to the body node, which placement offsets inside the nut.
// Reuse the sled section so rail, pedestal and capture-lip clearances stay identical.
export function createAdaptiveNutBodyGeometry(params) {
  const p = key => params[key].value
  const envelope = adaptiveNutBodyEnvelope(params)
  const d = launchSledLayout(params)
  const railX = -p('adaptiveNutSidewaysOffset')
  const bodyZ = p('adaptiveNutUpwardsOffset')
  const dz = p('launchSledUpwardsOffset')-bodyZ
  const geometry = createRailWrappingSledGeometry({...d,
    length:envelope.length, flatTop:true, top:p('adaptiveNutHeight')/2,
    vehicleX:0, railX,
    halfWidth:Math.max(p('adaptiveNutWidth')/2,d.railHalfWidth+d.clearance+d.thickness),
    railTop:d.railTop+dz,railBottom:d.railBottom+dz,bottom:d.bottom+dz})
  geometry.translate(0,envelope.aft-p('adaptiveNutForwardsOffset'),0)
  return geometry
}
