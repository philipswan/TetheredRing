import { screwStateAtTime } from './rampMotion.js'

export const GRAPPLER_CURVES = ['Grapplers engaged', 'Grappler 1 angle', 'Grappler 1 lift', 'Grappler 1 radial travel']

// Sample the first nut's real poses at a bounded cost, refining automatically when the user zooms.
export function grapplerTelemetry(nut, start, end, feederTime) {
  const data = GRAPPLER_CURVES.map(() => [])
  if (!nut.motion || !nut.threadLayout || !nut.adaptiveNutNumGrapplers) return data
  start = Math.max(0, start)
  end = Math.min(end, feederTime + nut.motion.duration)
  if (end < start) return data
  const count = Math.max(1, Math.min(1600, Math.ceil((end - start) / Math.max(0.001, nut.switchoverTime / 16))))
  for (let i = 0; i <= count; i++) {
    const t = start + (end - start) * i / count
    const state = screwStateAtTime(nut.motion, t - feederTime)
    const onScrews = t >= feederTime && nut.threadLayout.flightsAt(state.s + nut.initialDistance) > 0
    // Rotation and planner time use the same launch clock as AdaptiveNut.placeAndOrientModel.
    const { grapplerPoses } = nut.grapplerStateAt(state.s, (t * nut.screwRevolutionsPerSecond) % 1, t, 0, onScrews, state.v)
    const first = grapplerPoses[0]
    const values = [100 * grapplerPoses.filter(p => p.attached).length / grapplerPoses.length,
      first.alpha * 180 / Math.PI, first.lift * nut.padLiftActuation, first.raise * nut.padRadialActuation]
    values.forEach((y, j) => data[j].push({ x: t, y }))
  }
  return data
}
