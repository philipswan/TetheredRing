import { adaptiveNutBodyEnvelope, launchTrainOffsets } from './launchAssemblyLayout.js'
import { launchSledLayout } from './LaunchSledGeometry.js'
import { LineSuperCurve3 } from '../curves/SuperCurves.js'

// Shared physical layout for the staged entrance queue, in metres along the launch direction.
export function launchQueueLayout(params) {
  const p = key => params[key].value
  const count = Math.max(0, Math.round(p('launcherStagedLaunches')))
  const scale = p('launchSystemForwardScaleFactor')
  const vehicleForward = launchTrainOffsets(params).vehicleForward
  const front = Math.max(vehicleForward + (p('launchVehicleBodyLength')
    + p('launchVehicleNoseconeLength')) * scale * p('launchVehicleScaleFactor'),
  (launchSledLayout(params).aft + launchSledLayout(params).length) * scale,
  adaptiveNutBodyEnvelope(params).front * scale)
  const aft = Math.min(adaptiveNutBodyEnvelope(params).aft * scale,0, vehicleForward, launchSledLayout(params).aft * scale)
  const spacing = (front - aft) + 10
  const period = p('launchVehicleSpacingInSeconds')
  const advanceDelay = params.launcherQueueAdvanceDelay?.value ?? 2
  const advanceDuration = params.launcherQueueAdvanceDuration?.value ?? 10
  if (count > 0 && (!(advanceDuration > 0) || advanceDelay < 0 || advanceDelay + advanceDuration > period)) {
    throw new Error('The queue launch interval must allow the advance delay and advance duration.')
  }
  const queueLength = Math.max(0, count - 1) * spacing
  return { count, front, aft, spacing, period, advanceDelay, advanceDuration, queueLength,
    tubeLength: count > 1 ? queueLength - aft + 10 : 0,
    terminalForward: -queueLength + front + 10 }
}

// Static infrastructure extends behind the moving paths; launch timing and screw phase stay unchanged.
export function launchQueueInfrastructure(params, entranceCurve) {
  const layout = launchQueueLayout(params)
  if (!(layout.tubeLength > 0)) return null
  const origin = entranceCurve.getPointAt(0)
  const forward = entranceCurve.getTangentAt(0).normalize()
  const up = entranceCurve.getNormalAt(0)
  const curve = new LineSuperCurve3(origin.clone().addScaledVector(forward, -layout.tubeLength), origin, up)
  curve.name = 'launchQueueTube'
  return { ...layout, curve, terminalFrame: {
    point: origin.clone().addScaledVector(forward, layout.terminalForward), tangent: forward,
  } }
}


// deltaT is relative to this train's launch. All waiting trains advance together after each departure.
// Quintic easing gives zero speed and acceleration at both ends of the advance.
export function queuedTrainState(deltaT, { period, spacing, advanceDelay = 2, advanceDuration = 10 }) {
  if (deltaT >= 0) return { behind: 0, speed: 0, acceleration: 0 }
  const slots = Math.ceil(-deltaT / period)
  const phase = deltaT + slots * period
  const u = Math.max(0, Math.min(1, (phase - advanceDelay) / advanceDuration))
  const progress = u ** 3 * (10 + u * (-15 + 6 * u))
  return { behind: (slots - progress) * spacing,
    speed: spacing / advanceDuration * 30 * u ** 2 * (1 - u) ** 2,
    acceleration: spacing / advanceDuration ** 2 * 60 * u * (1 - u) * (1 - 2 * u) }
}
