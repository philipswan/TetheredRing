import * as THREE from 'three'

// Things the camera can lock onto. The number keys 0-5 select them in this order.
export const TRACKABLE_TYPES = ['launchVehicle', 'adaptiveNut', 'launchSled', 'transitVehicle', 'elevatorCar', 'coilCenterMarker']

const SOURCES = {
  launchVehicle: { system: 'launch', className: 'virtualLaunchVehicles', frame: 'world' },
  adaptiveNut: { system: 'launch', className: 'virtualAdaptiveNuts', frame: 'world' },
  launchSled: { system: 'launch', className: 'virtualLaunchSleds', frame: 'world' },
  transitVehicle: { system: 'transit', className: 'virtualTransitVehicles', frame: 'ring' },
  elevatorCar: { system: 'transit', className: 'virtualElevatorCars', frame: 'ring' },
}

const finiteVector = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)

// Finds the nearest object of a given type and reports where it is (and will be) in world space.
// Moving objects live in the launch/transit systems' reference frames ("wedges") as virtual
// objects with getFuturePosition(refFrame, dt) / getFutureFrame(refFrame, dt).
export class ObjectTracker {
  // getContext() -> { scene, launchSystem, transitSystem, ringRefCoordSys }
  constructor(getContext) {
    this.getContext = getContext
    this.target = null
  }

  get type() { return this.target?.type ?? null }

  clear() {
    this.target = null
  }

  *candidates(type) {
    const ctx = this.getContext()
    const source = SOURCES[type]
    if (source) {
      const system = source.system === 'launch' ? ctx.launchSystem : ctx.transitSystem
      if (typeof system?.getTrackableObjects === 'function') {
        for (const entry of system.getTrackableObjects(type)) yield { type, ...entry, frame: source.frame }
        return
      }
      for (const refFrame of system?.refFrames ?? []) {
        for (const wedge of refFrame.wedges ?? []) {
          for (const trackableObject of wedge[source.className] ?? []) {
            yield {
              type,
              frame: source.frame,
              refFrame,
              getPosition: (dt) => trackableObject.getFuturePosition(refFrame, dt),
              getFrame: typeof trackableObject.getFutureFrame === 'function' ? (dt) => trackableObject.getFutureFrame(refFrame, dt) : null,
            }
          }
        }
      }
    }
    else if (type === 'coilCenterMarker') {
      const markers = []
      ctx.scene.traverse((child) => { if (child.name === 'coilCenterMarker') markers.push(child) })
      for (const marker of markers) {
        yield { type, frame: 'world', getPosition: () => marker.getWorldPosition(new THREE.Vector3()), getFrame: null }
      }
    }
  }

  toWorld(entry, position) {
    if (!position) return null
    const p = position.clone()
    return entry.frame === 'ring' ? this.getContext().ringRefCoordSys.localToWorld(p) : p
  }

  // Selects the object of `type` closest to `nearPoint` (world). Returns true if one was found.
  findNearest(type, nearPoint) {
    let best = null
    let bestDistance = Infinity
    for (const entry of this.candidates(type)) {
      const position = this.toWorld(entry, entry.getPosition(0))
      if (!finiteVector(position)) continue
      const distance = nearPoint.distanceTo(position)
      if (distance < bestDistance) {
        best = entry
        bestDistance = distance
      }
    }
    this.target = best
    return best !== null
  }

  // World position of the tracked object `dt` seconds from now (null if nothing tracked).
  getPosition(dt = 0) {
    if (!this.target) return null
    const position = this.toWorld(this.target, this.target.getPosition(dt))
    return finiteVector(position) ? position : null
  }

  // Orientation frame of the tracked object (vehicles only) in world directions, or null.
  getFrame(dt = 0) {
    return this.target ? this.frameOf(this.target, dt) : null
  }

  frameOf(entry, dt) {
    const f = entry.getFrame ? entry.getFrame(dt) : null
    if (!f?.forward) return null
    if (entry.frame !== 'ring') return { forward: f.forward.clone(), upward: f.upward?.clone() ?? null }
    const ring = this.getContext().ringRefCoordSys
    ring.updateWorldMatrix(true, false)
    return {
      forward: f.forward.clone().transformDirection(ring.matrixWorld),
      upward: f.upward ? f.upward.clone().transformDirection(ring.matrixWorld) : null,
    }
  }

  // The selected object as { getPosition(dt), getFrame(dt) } in world coordinates (what the camera follows).
  worldEntry(entry = this.target) {
    if (!entry) return null
    return {
      type: entry.type,
      getPosition: (dt = 0) => {
        const p = this.toWorld(entry, entry.getPosition(dt))
        return finiteVector(p) ? p : null
      },
      getFrame: (dt = 0) => this.frameOf(entry, dt),
    }
  }
}
