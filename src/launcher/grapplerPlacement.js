// Where each grappler's magnetic pad is as it hops from one flight of the screw to the next.
// Interchangeable algorithms live here so they can be compared directly; a scene picks one with the
// adaptiveNutGrapplerSequencingMode parameter, and AdaptiveNut.js asks for a pose through grapplerPose().
//
// All return the same pose, read the same way by AdaptiveNut.js:
//   { lift, raise, neutral, alpha, attached }
//     lift     0 (pad on the flight's face) -> 1 (lifted clear, forwards)
//     raise    0 (on the flight) -> 1 (raised radially clear of the flights)
//     neutral  0 (twisted to the flight's pitch) -> 1 (untwisted)
//     alpha    the pad's angle (radians) from the middle of its travel
//     attached whether it is gripping a flight
//
//   'original'  (originalGrapplerPose): the pre-refactor rule. Each grappler is a stateless function of
//               its own position, so evenly spaced grapplers switch over in lockstep: the strips of
//               gripping grapplers stay the same length and never gap. Driven straight from the
//               switchoverSignal that SledGrapplerGeometry.generatePlacementInfo still computes, so the
//               hop gets quicker as the vehicle speeds up (the pad crosses the switchover region faster).
//   'originalConstantRate': the original pose and flight selection, with a phase threshold calculated
//               from the time available before handover minus half the configured hop duration.
//   'scheduled': the lattice planner in grapplerLattice.js. The saved parameter value is retained
//               for compatibility; the legacy integrated scheduler and vehicle lead are no longer used.

// The selectable algorithms (label -> value, for the GUI dropdown and parameter).
export const grapplerSequencingModes = { Original: 'original', OriginalConstantRate: 'originalConstantRate', Scheduled: 'scheduled' }

// The pad's angle (radians, wrapped to [-pi, pi]) when it simply follows the flight it is over.
export const followingAngle = (info) => ((info.offset.θ + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI

// The pre-refactor pose mapping, shared by both 'original' modes: a switchover signal (0 while gripping,
// up to 1 at a handover) becomes a pose by splitting the hop into three successive portions:
//   padLiftPortion   the pad lifts off the face (and raises radially clear of the flights),
//   padTwistPortion  the pad untwists to neutral,
//   the remainder    the pad swings circumferentially back to the middle of its travel.
// followingAngle(info) jumps by one flight spacing at a handover, where the signal is 1 and the swing has
// pulled the pad to the middle (thetaFactor 0), so the pad's angle stays continuous across it.
function poseFromSwitchoverSignal(info, s, padLiftPortion, padTwistPortion, out) {
  const liftSpan = Math.max(1e-9, padLiftPortion)
  const twistSpan = Math.max(1e-9, padTwistPortion)
  const lift = Math.min(1, s / liftSpan)
  const raise = Math.max(0, Math.min(1, s / liftSpan))
  const neutral = Math.max(0, Math.min(1, (s - padLiftPortion) / twistSpan))
  const usedPortion = padLiftPortion + padTwistPortion
  const remainingPortion = Math.max(1e-9, 1 - usedPortion)
  const thetaFactor = 1 - Math.max(0, Math.min(1, (s - usedPortion) / remainingPortion))
  const alpha = followingAngle(info) * thetaFactor
  return Object.assign(out, { lift, raise, neutral, alpha, attached: s === 0 })
}

// The pre-refactor sequencing: the pose comes entirely from info.switchoverSignal (0 while gripping, up
// to 1 at the point halfway to the next flight). Because every grappler follows this same rule against
// its own position, neighbouring grapplers hand over together and the gripping strips stay equal length.
export function originalGrapplerPose(info, padLiftPortion, padTwistPortion, out = {}) {
  return poseFromSwitchoverSignal(info, info.switchoverSignal, padLiftPortion, padTwistPortion, out)
}

// Rotations and rotations/s are both relative to the nut, not the screw's absolute rotation.
// This is a local constant-drift estimate; acceleration can change the timing during a hop.
export function originalConstantRateSwitchoverSignal(info, switchoverTime) {
  if (!info.engageable) return 1
  const rate = Math.abs(info.rotationRate)
  const away = Math.abs(info.rotationAway)
  const limit = info.maxRotationAway
  if (rate === 0) return away <= info.launchSledGrapplerMaxRangeOfMotion ? 0 : 1
  const a = limit / rate
  const b = switchoverTime / 2
  // No room for a grip plus a full hop: stay retracted instead of compressing the motion.
  if (a <= b) return 1
  const start = Math.min((a - b) * rate, info.launchSledGrapplerMaxRangeOfMotion)
  return Math.max(0, Math.min(1, (away - start) / (limit - start)))
}

export function originalConstantRateGrapplerPose(info, padLiftPortion, padTwistPortion, switchoverTime, out = {}) {
  return poseFromSwitchoverSignal(info, originalConstantRateSwitchoverSignal(info, switchoverTime), padLiftPortion, padTwistPortion, out)
}

// Picks the algorithm named by `mode` (see grapplerSequencingModes). ctx carries what each one needs:
//   { info, i, deltaT, plan, switchoverTime, padLiftPortion, padTwistPortion }
// Only 'scheduled' needs a lattice plan. Both original modes use the original pose mapping.
export function grapplerPose(mode, ctx, out = {}) {
  if (mode === grapplerSequencingModes.Scheduled) {
    return ctx.plan.pose(ctx.i, ctx.deltaT, ctx.info, out)
  }
  if (mode === grapplerSequencingModes.OriginalConstantRate) {
    return originalConstantRateGrapplerPose(ctx.info, ctx.padLiftPortion, ctx.padTwistPortion, ctx.switchoverTime, out)
  }
  return originalGrapplerPose(ctx.info, ctx.padLiftPortion, ctx.padTwistPortion, out)
}
