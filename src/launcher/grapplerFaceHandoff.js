import { outAndBack, smootherstep } from './grapplerSwitchover.js'

const MOVE = [0.4, 0.6]
const ERROR = 'The grappler face handoff cannot retain engaged support within the acceleration/braking transition. Increase launchVehicleAccelerationTransitionTime, reduce adaptiveNutDecelerationJerk, or reduce adaptiveNutGrapplerSwitchoverTime.'

export function faceHandoffEnvelope(ramp, braking, horizontalTime, forwardAcceleration) {
  if (braking.rampTime === 0) return null
  const zero = horizontalTime + ramp.detach.t
  const drive = ramp.samples.filter(p => p.t <= ramp.detach.t).map(p => ({
    t: horizontalTime + p.t, fraction: Math.max(0, Math.min(1, p.forward / forwardAcceleration)),
  }))
  drive[0].fraction = 1
  drive.at(-1).fraction = 0
  const brake = braking.samples.filter(p => p.t <= braking.rampTime + 1e-10).map(p => ({
    t: zero + p.t, fraction: Math.max(0, Math.min(1, braking.brakingAt(p.t) / braking.deceleration)),
  }))
  brake.at(-1).t = zero + braking.rampTime
  brake.at(-1).fraction = 1
  return { start: horizontalTime, zero, end: zero + braking.rampTime, drive, brake }
}

function thresholdTime(samples, fraction, decreasing) {
  if (decreasing && fraction === 0) return samples.at(-1).t
  if (!decreasing && fraction === 0) return samples[0].t
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i]
    if (decreasing ? b.fraction <= fraction : b.fraction >= fraction) {
      // The force is monotonic between samples. Release at the later safe sample, and land
      // before the earlier one; interpolating a threshold could overestimate spare capacity.
      return decreasing ? b.t : a.t
    }
  }
  throw new Error(ERROR)
}

function validateEnvelope(samples, start, end, decreasing) {
  if (!Array.isArray(samples) || samples.length < 2 || samples[0].t !== start || samples.at(-1).t !== end ||
      samples[0].fraction !== (decreasing ? 1 : 0) || samples.at(-1).fraction !== (decreasing ? 0 : 1) ||
      samples.some((s, i) => !Number.isFinite(s.t) || !Number.isFinite(s.fraction) || s.fraction < 0 || s.fraction > 1 ||
        (i > 0 && (s.t <= samples[i - 1].t || (decreasing ? s.fraction > samples[i - 1].fraction : s.fraction < samples[i - 1].fraction))))) {
    throw new Error('Invalid grappler face-handoff force envelope.')
  }
}

// A contiguous sweep: only boundaries between the old and new banks split a strip. The timing
// reserves trailing grips for the declining drive and leading grips for the rising brake.
export class GrapplerFaceHandoffPlan {
  constructor(envelope, count, switchoverTime, strips = []) {
    const { start, zero, end, drive, brake } = envelope
    if (![start, zero, end, switchoverTime].every(Number.isFinite) || !(start < zero && zero < end) ||
        !Number.isInteger(count) || count < 2 || !(switchoverTime > 0)) throw new Error(ERROR)
    validateEnvelope(drive, start, zero, true)
    validateEnvelope(brake, zero, end, false)
    this.start = start
    this.zero = zero
    this.end = end
    this.count = count
    this.switchoverTime = switchoverTime
    const release = Array.from({ length: count + 1 }, (_, k) => thresholdTime(drive, 1 - k / count, true))
    const deadline = Array.from({ length: count + 1 }, (_, k) => thresholdTime(brake, k / count, false))
    const costs = Array(count + 1).fill(Infinity), previous = Array(count + 1).fill(-1)
    const largest = Array(count + 1).fill(Infinity)
    costs[0] = 0
    largest[0] = 0
    for (let to = 1; to <= count; to++) {
      for (let from = 0; from < to; from++) {
        if (!Number.isFinite(costs[from]) || release[to] + switchoverTime > deadline[from] + 1e-10) continue
        // Prefer keeping whole strips, then the fewest groups. Splitting a long strip is allowed
        // when its simultaneous transfer would remove too much coupling.
        const split = to < count && strips[to] !== undefined && strips[to] === strips[to - 1]
        const cost = costs[from] + 1 + (split ? count + 1 : 0)
        const size = Math.max(largest[from], to - from)
        if (cost < costs[to] || cost === costs[to] && size < largest[to]) {
          costs[to] = cost; previous[to] = from; largest[to] = size
        }
      }
    }
    if (previous[count] < 0) throw new Error(ERROR)
    this.groups = []
    for (let to = count; to > 0;) {
      const from = previous[to], start = release[to]
      this.groups.unshift({ from, to, start, end: start + switchoverTime })
      to = from
    }
    this.byIndex = Array(count)
    for (const group of this.groups) {
      for (let i = group.from; i < group.to; i++) this.byIndex[i] = group
    }
  }

  state(i, time) {
    const group = this.byIndex[i]
    if (!group || !Number.isFinite(time)) throw new Error('Invalid grappler face-handoff index or time.')
    const p = Math.max(0, Math.min(1, (time - group.start) / this.switchoverTime))
    return {
      mix: smootherstep((p - MOVE[0]) / (MOVE[1] - MOVE[0])),
      lift: outAndBack([0, 0.15], p),
      raise: outAndBack([0.12, 0.35], p),
      neutral: outAndBack([0.25, 0.4], p),
      transferring: time > group.start && time < group.end,
    }
  }

  pose(i, time, ordinary) {
    const state = this.state(i, time)
    return {
      ...ordinary,
      lift: Math.max(ordinary.lift, state.lift),
      raise: Math.max(ordinary.raise, state.raise),
      neutral: Math.max(ordinary.neutral, state.neutral),
      attached: ordinary.attached && !state.transferring,
    }
  }

  assertSupport(time, poses) {
    if (poses.length !== this.count) throw new Error('Incomplete grappler face-handoff poses.')
    if (time < this.groups[0].start || time > this.groups.at(-1).end) return
    let rear = 0, front = 0
    poses.forEach((pose, i) => {
      if (pose.attached) {
        if (this.state(i, time).mix === 0) rear++
        else if (this.state(i, time).mix === 1) front++
      }
    })
    if (!rear && !front || time < this.zero && !rear || time > this.zero && !front) throw new Error(ERROR)
  }
}

export function blendGrapplerPlacement(rear, front, mix) {
  rear.offset.θ += mix * (front.offset.θ - rear.offset.θ)
  rear.offset.y += mix * (front.offset.y - rear.offset.y)
  return rear
}
