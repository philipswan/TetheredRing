// Camera anchors: what a shot keyframe's camera position is relative to.
//
// An anchor is plain JSON (see ShotFormat.js): the world, or one particular moving object, such as
// launch 74's vehicle or the collector-lane transit vehicle at p = 0.25. Its frame at any simulated
// time is a pure function of the parameters and that time, so a keyframe tied to a vehicle can be
// evaluated at any moment of the shot, whether or not the vehicle is on screen.
//
// Frames are { origin: [x, y, z], axes: [x, y, z] } in world coordinates (float64 arrays), where the
// axes are the frame's unit vectors: x to the object's left, y up, z forward (a right-handed rotation).
// A keyframe vector v in the anchor's frame is origin + axes * v in the world.
//
// Orientation (anchor.orient):
//   follow     axes turn with the object (pitch, heading and roll)
//   level      y is the local vertical at the object, z its heading along the horizon
//   translate  world axes: the frame moves with the object but does not turn
import * as THREE from 'three'
import { WORLD_ANCHOR, isWorldAnchor } from './ShotFormat.js'

export const ANCHOR_KINDS = {
  launchVehicle: { label: 'Launch vehicle', className: 'virtualLaunchVehicles' },
  launchSled: { label: 'Launch sled', className: 'virtualLaunchSleds' },
  adaptiveNut: { label: 'Adaptive nut', className: 'virtualAdaptiveNuts' },
  transitVehicle: { label: 'Transit vehicle' },
  elevatorCar: { label: 'Elevator car' },
}
const LAUNCH_KINDS = ['launchVehicle', 'launchSled', 'adaptiveNut']
const LANE_NAMES = ['express, clockwise', 'express, anticlockwise', 'collector, clockwise', 'collector, anticlockwise']
const STAGE_NAMES = {
  egress: 'Leaves the terminal',
  feederRailCurve: 'Enters the feeder rail',
  massDriver1Curve: 'Enters the first mass driver',
  massDriver2Curve: 'Enters the mass driver',
  launchRampCurve0: 'Enters the ramp',
  launchRampCurve1: 'Enters the ramp',
  elevatedEvacuatedTube: 'Enters the evacuated tube',
  freeFlightPositionCurve: 'Free flight',
  launchSledBrakingCurve: 'Sled starts braking',
  end: 'End of the path',
}

const IDENTITY = Object.freeze({ origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] })
const _v = new THREE.Vector3()

const toArray = (v) => [v.x, v.y, v.z]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2])
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : null
}

export function anchorKey(anchor) {
  return isWorldAnchor(anchor) ? 'world' : JSON.stringify([anchor.type, anchor.orient ?? 'follow', anchor.launchIndex, anchor.lane, anchor.p])
}

// Applies a frame to a local vector: a point (origin + axes * v) or a direction (axes * v).
export function frameToWorld(frame, v, isDirection = false) {
  const [x, y, z] = frame.axes
  const o = isDirection ? [0, 0, 0] : frame.origin
  return [0, 1, 2].map(i => o[i] + x[i] * v[0] + y[i] * v[1] + z[i] * v[2])
}

export function frameToLocal(frame, w, isDirection = false) {
  const d = isDirection ? w : [w[0] - frame.origin[0], w[1] - frame.origin[1], w[2] - frame.origin[2]]
  return frame.axes.map(axis => dot(axis, d))
}

export class AnchorResolver {
  constructor(app) {
    this.app = app
    this.cache = new Map()
    this.cacheTime = null
  }

  get launchSystem() { return this.app.launchSystem }
  get transitSystem() { return this.app.transitSystem }

  // Call when parameters change (the objects' paths may have moved).
  invalidate() {
    this.cache.clear()
    this.cacheTime = null
  }

  // The object's own frame (world coordinates): { position, forward, upward } as arrays, or null.
  objectFrame(anchor, simTime) {
    if (LAUNCH_KINDS.includes(anchor.type)) {
      const f = this.launchSystem?.movingObjectFrameAt(ANCHOR_KINDS[anchor.type].className, anchor.launchIndex, simTime)
      if (!f) return null
      const planet = this.app.planetCoordSys
      planet.updateWorldMatrix(true, false)
      return {
        position: toArray(f.position.clone().applyMatrix4(planet.matrixWorld)),
        forward: toArray(f.forward.clone().transformDirection(planet.matrixWorld)),
        upward: toArray(f.upward.clone().transformDirection(planet.matrixWorld)),
      }
    }
    const transit = this.transitSystem
    const f = anchor.type === 'transitVehicle' ? transit?.vehicleFrameAt(anchor.lane, anchor.p, simTime)
      : anchor.type === 'elevatorCar' ? transit?.elevatorCarFrameAt(anchor.p, simTime) : null
    if (!f) return null
    const ring = transit.scene
    ring.updateWorldMatrix(true, false)
    return {
      position: toArray(_v.copy(f.position).applyMatrix4(ring.matrixWorld)),
      forward: toArray(_v.copy(f.forward).transformDirection(ring.matrixWorld)),
      upward: toArray(_v.copy(f.upward).transformDirection(ring.matrixWorld)),
    }
  }

  // The anchor's frame at simTime (see the top of this file). Unknown or missing objects resolve to the world.
  frameAt(anchor, simTime) {
    if (isWorldAnchor(anchor)) return IDENTITY
    if (this.cacheTime !== simTime) {
      this.cache.clear()
      this.cacheTime = simTime
    }
    const key = anchorKey(anchor)
    let frame = this.cache.get(key)
    if (!frame) {
      frame = this.computeFrame(anchor, simTime)
      this.cache.set(key, frame)
    }
    return frame
  }

  computeFrame(anchor, simTime) {
    const object = this.objectFrame(anchor, simTime)
    if (!object) return IDENTITY
    const orient = anchor.orient ?? 'follow'
    if (orient === 'translate') return { origin: object.position, axes: IDENTITY.axes }
    let up
    let forward
    if (orient === 'level') {
      up = normalize(object.position) ?? [0, 1, 0]
      forward = normalize(object.forward.map((f, i) => f - dot(object.forward, up) * up[i]))
      // Heading straight up or down: keep the previous horizontal heading from the object's "up".
      forward ??= normalize(object.upward.map((f, i) => f - dot(object.upward, up) * up[i])) ?? normalize(cross(up, [0, 0, 1])) ?? [1, 0, 0]
    }
    else {
      forward = normalize(object.forward) ?? [0, 0, 1]
      up = normalize(object.upward.map((u, i) => u - dot(object.upward, forward) * forward[i])) ?? normalize(object.position)
    }
    return { origin: object.position, axes: [cross(up, forward), up, forward] }
  }

  // The world pose of a keyframe at simTime (what CameraPath's `resolve` returns).
  resolveKey(key, simTime) {
    const frame = this.frameAt(key.anchor, simTime)
    const targetFrame = key.lookAt ? this.frameAt(key.lookAt, simTime) : frame
    return {
      position: frameToWorld(frame, key.position),
      target: frameToWorld(targetFrame, key.target),
      up: frameToWorld(frame, key.up, true),
      orbitUp: frameToWorld(frame, key.orbitUp ?? key.up, true),
    }
  }

  // Re-expresses a world pose in a keyframe's anchors (inverse of resolveKey).
  localizeKey(key, world, simTime) {
    const frame = this.frameAt(key.anchor, simTime)
    const targetFrame = key.lookAt ? this.frameAt(key.lookAt, simTime) : frame
    key.position = frameToLocal(frame, world.position)
    key.target = frameToLocal(targetFrame, world.target)
    key.up = frameToLocal(frame, world.up, true)
    key.orbitUp = frameToLocal(frame, world.orbitUp ?? world.up, true)
    return key
  }

  // ---- Choosing objects ----------------------------------------------------------------------

  // Every object that can be an anchor at simTime: [{ anchor, position (world array) }].
  candidates(simTime, types = Object.keys(ANCHOR_KINDS)) {
    const list = []
    const add = (anchor) => {
      const f = this.objectFrame(anchor, simTime)
      if (f && f.position.every(Number.isFinite)) list.push({ anchor, position: f.position })
    }
    for (const type of types) {
      if (LAUNCH_KINDS.includes(type)) {
        for (const launchIndex of this.launchSystem?.activeLaunchIndicesAt(ANCHOR_KINDS[type].className, simTime) ?? []) add({ type, launchIndex, orient: 'follow' })
      }
      else if (type === 'transitVehicle') {
        for (const v of this.transitSystem?.listVehicles() ?? []) add({ type, lane: v.lane, p: v.p, orient: 'follow' })
      }
      else if (type === 'elevatorCar') {
        for (const c of this.transitSystem?.listElevatorCars() ?? []) add({ type, p: c.p, orient: 'level' })
      }
    }
    return list
  }

  // The candidate nearest to the ray from `origin` along `direction` (world arrays): smallest angle off
  // the ray, within maxAngle (radians) and maxDistance (m). Returns { anchor, position, angle } or null.
  nearestToRay(simTime, origin, direction, maxAngle, types, maxDistance = Infinity) {
    const dir = normalize(direction)
    let best = null
    for (const c of this.candidates(simTime, types)) {
      const d = [c.position[0] - origin[0], c.position[1] - origin[1], c.position[2] - origin[2]]
      const distance = Math.hypot(d[0], d[1], d[2])
      if (!(distance > 0) || distance > maxDistance) continue
      const angle = Math.acos(Math.min(1, Math.max(-1, dot(d, dir) / distance)))
      if (angle > maxAngle) continue
      if (!best || angle < best.angle - 1e-9 || (Math.abs(angle - best.angle) <= 1e-9 && distance < best.distance)) best = { ...c, angle, distance }
    }
    return best
  }

  // The candidate nearest to `point` (world array).
  nearestToPoint(simTime, point, types) {
    let best = null
    for (const c of this.candidates(simTime, types)) {
      const distance = Math.hypot(c.position[0] - point[0], c.position[1] - point[1], c.position[2] - point[2])
      if (!best || distance < best.distance) best = { ...c, distance }
    }
    return best
  }

  // ---- Labels and events ---------------------------------------------------------------------

  label(anchor) {
    if (isWorldAnchor(anchor)) return 'World (fixed to the planet)'
    const kind = ANCHOR_KINDS[anchor.type]?.label ?? anchor.type
    if (LAUNCH_KINDS.includes(anchor.type)) {
      const launchTime = this.launchSystem?.launchSimTime(ANCHOR_KINDS[anchor.type].className, anchor.launchIndex)
      return `${kind}, launch #${anchor.launchIndex}${Number.isFinite(launchTime) ? ` (leaves at ${launchTime.toFixed(1)} s)` : ''}`
    }
    if (anchor.type === 'transitVehicle') return `${kind}, ${LANE_NAMES[anchor.lane] ?? `lane ${anchor.lane}`} lane, p ${anchor.p.toFixed(5)}`
    if (anchor.type === 'elevatorCar') {
      const numStops = this.transitSystem?.stopLayout?.numStops
      return `${kind} at ${numStops ? `stop ${Math.round(anchor.p * numStops) % numStops}` : `p ${anchor.p.toFixed(5)}`}`
    }
    return kind
  }

  // Moments worth jumping to for an anchor (or, for the world, the launches) within
  // [fromSimTime, toSimTime]: [{ simTime, name }], sorted.
  events(anchor, fromSimTime, toSimTime) {
    let events = []
    const launch = this.launchSystem
    if (isWorldAnchor(anchor)) {
      const className = ANCHOR_KINDS.launchVehicle.className
      let k = launch?.nextLaunchIndex(className, fromSimTime)
      for (let n = 0; k !== null && k !== undefined && n < 50; n++) {
        const t = launch.launchSimTime(className, k)
        if (!(t <= toSimTime)) break
        events.push({ simTime: t, name: `Launch #${k}` })
        k += Math.max(1, launch.movingObjectClass(className).launchStride | 0)
      }
    }
    else if (LAUNCH_KINDS.includes(anchor.type)) {
      const className = ANCHOR_KINDS[anchor.type].className
      for (const stage of launch?.launchStages(className) ?? []) {
        events.push({ simTime: launch.launchSimTime(className, anchor.launchIndex, stage.deltaT), name: STAGE_NAMES[stage.name] ?? stage.name })
      }
      const start = events.find(e => e.name !== STAGE_NAMES.egress)
      if (start) start.name = 'Launch'
    }
    else if (anchor.type === 'transitVehicle') {
      events = this.transitSystem?.collectorStopEvents(anchor.lane, anchor.p, fromSimTime, toSimTime) ?? []
    }
    else if (anchor.type === 'elevatorCar') {
      events = this.transitSystem?.elevatorEvents(fromSimTime, toSimTime) ?? []
    }
    return events.filter(e => Number.isFinite(e.simTime) && e.simTime >= fromSimTime && e.simTime <= toSimTime).sort((a, b) => a.simTime - b.simTime)
  }
}

export { WORLD_ANCHOR }
