import { queuedTrainState } from './launchQueue.js'
// Shared base classes for the launcher's "virtual objects".
//
// A virtual object is a lightweight record (position along a reference-frame curve, launch time...)
// that only borrows a three.js model while it is near the camera. Each subclass is used through its
// static members (the class itself acts as the registry for all of its instances):
//
//   static className            key used in referenceFrame.wedges[zone]
//   static unallocatedModels    pool of spare models (recyclable classes); MUST be redeclared per subclass
//   static modelsAreRecyleable  true: models are interchangeable and pooled; false: each model is built
//                               for one position (createUniqueModel) and disposed when released
//   static isDynamic            true: placeAndOrientModel() is called every frame while visible
//   static hasChanged           set by update(); forces visible models to be re-placed once
//   static numObjects, refFrames, updateParameters, tearDownParameters, addObjectsParameters
//
// Moving objects (vehicles, sleds, nuts) are not stored persistently: every frame the set of objects
// in flight is derived from the animation time alone (the k-th launch happens at k * launch spacing),
// so the animation is a pure function of (parameters, time). At a launcher with an ocean terminal, each
// launch first spends egress.duration being drawn out of the underwater terminal (launchCadence.js):
// deltaT, the time since the launch started accelerating, runs from -egress.duration.

import * as tram from '../utils/tram.js'
import { egressDistanceBehind } from './launchCadence.js'

// Disposes the GPU resources of a set of models exactly once each. Geometries/materials flagged with
// userData.shared = true (owned by a model factory or another model) are left alone.
export function disposeModels(models, { geometries = true, materials = false, includeShared = false } = {}) {
  const geometrySet = new Set()
  const materialSet = new Set()
  models.forEach(model => {
    if (!model) return
    if (model.parent) model.parent.remove(model)
    model.traverse(child => {
      // Instanced and batched meshes also own per-instance GPU buffers.
      if (child.isInstancedMesh || child.isBatchedMesh) child.dispose()
      if (geometries && child.geometry && (includeShared || !child.geometry.userData?.shared)) geometrySet.add(child.geometry)
      if (materials && child.material) {
        (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => {
          if (m.userData?.keep) return
          if (includeShared || !m.userData?.shared) materialSet.add(m)
        })
      }
    })
  })
  geometrySet.forEach(g => g.dispose())
  materialSet.forEach(m => {
    Object.values(m).forEach(v => { if (v && v.isTexture && !v.userData?.shared) v.dispose() })
    m.dispose()
  })
}

// Marks every geometry (and optionally material) under root as shared so that releasing a model that
// references it does not dispose it.
export function markShared(root, { materials = true } = {}) {
  root.traverse(child => {
    if (child.geometry) child.geometry.userData.shared = true
    if (materials && child.material) {
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => { m.userData.shared = true })
    }
  })
}

// Small deterministic hash -> [0, 1). Used instead of Math.random() for per-frame visual noise so that
// renders are reproducible.
export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7FEB352D) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846CA68B) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Builds a string that changes whenever any parameter whose name starts with one of `prefixes` (and
// does not contain one of `excludes`) changes. Used to decide when pooled models must be rebuilt.
export function parameterSignature(dParamWithUnits, prefixes, excludes = []) {
  const parts = []
  Object.keys(dParamWithUnits).sort().forEach(key => {
    if (prefixes.some(p => key.startsWith(p)) && !excludes.some(e => key.includes(e))) {
      parts.push(key + '=' + JSON.stringify(dParamWithUnits[key].value))
    }
  })
  return parts.join('|')
}

export class VirtualObject {

  constructor() {
    this.model = null
  }

  static className = 'virtualObjects'
  static unallocatedModels = []
  static modelsAreRecyleable = true
  static isDynamic = false
  static hasChanged = false
  static isVisible = true
  static numObjects = 0
  static refFrames = []
  static updateParameters = []
  static tearDownParameters = []
  static addObjectsParameters = []
  static modelFactory = null     // object with createModel(curve, index) for non-recyclable classes
  static scene = null            // three.js parent that in-use models are added to
  static highlightClass = undefined // Highlights class of the models (src/scene/Highlights.js)

  // Returns a model for `obj` (or null if none can be provided).
  static acquireModel(obj, refFrame) {
    let model = null
    if (this.modelsAreRecyleable) {
      const pool = this.unallocatedModels
      if (pool.length === 0) return null
      // Never hand out the last model: keep it as the template for further clones. (Loader callbacks
      // that swap in higher-detail meshes update the pool and the scene, so the template stays current.)
      // Grow the pool. Classes whose models hold per-model state (e.g. LOD caches) provide
      // createPooledModel(); the rest are cloned from the template.
      if (pool.length === 1) pool.push(typeof this.createPooledModel === 'function' ? this.createPooledModel() : pool[0].clone())
      model = pool.pop()
    }
    else {
      if (!this.modelFactory) return null
      model = this.modelFactory.createModel(refFrame.curve, obj.index)
      model.name = this.className
    }
    if (this.highlightClass) model.userData.highlight = this.highlightClass
    if (model.parent !== this.scene && this.scene) this.scene.add(model)
    model.visible = this.isVisible
    return model
  }

  // Returns a model to the pool (recyclable) or disposes it (unique models).
  static releaseModel(model) {
    if (!model) return
    model.visible = false
    if (this.modelsAreRecyleable) {
      this.unallocatedModels.push(model)
    }
    else {
      disposeModels([model])
    }
  }

  // Releases every model currently held by this class's virtual objects and empties the wedge lists.
  static removeAllVirtualObjects() {
    this.refFrames.forEach(refFrame => {
      if (!refFrame.wedges) return
      refFrame.wedges.forEach(wedge => {
        const list = wedge[this.className]
        if (!list) return
        list.forEach(obj => {
          if (obj.model) {
            this.releaseModel(obj.model)
            obj.model = null
          }
        })
        list.length = 0
      })
    })
  }

  // Disposes every pooled model (used before rebuilding the pool with new parameters).
  // The whole family of clones is being destroyed, so shared (template) resources go too, except
  // module-level materials that are flagged `userData.keep`.
  static disposePool({ materials = true } = {}) {
    disposeModels(this.unallocatedModels, { geometries: true, materials, includeShared: true })
    this.unallocatedModels.length = 0
  }

  // Default static-object placement helper: places the model at curve fraction this.d.
  placeAtD(om, refFrame, upwardsOffset = 0) {
    const ctor = this.constructor
    if (this.versionNumber !== ctor.versionNumber || !this.position) {
      const curve = refFrame.curve
      this.position = curve.getPointAt(this.d)
      if (upwardsOffset) this.position.addScaledVector(curve.getNormalAt(this.d), upwardsOffset)
      this.orientation = curve.getQuaternionAt(this.d)
      this.versionNumber = ctor.versionNumber
    }
    om.position.copy(this.position)
    om.quaternion.copy(this.orientation)
    om.visible = ctor.isVisible
  }

  // Places statically positioned objects (rails, brackets, tubes...) evenly along the reference frame:
  // object i sits at d = (i + 0.5) / n + dOffset(i).
  static addEvenlySpacedObjects(refFrames, dOffset = () => 0) {
    this.hasChanged = true
    const n = this.numObjects
    refFrames.forEach(refFrame => {
      for (let i = 0; i < n; i++) {
        const d = Math.max(0, Math.min(1, (i + 0.5) / n + dOffset(i)))
        const obj = new this(d, i)
        obj.index = i
        const zoneIndex = refFrame.curve.getZoneIndexAt(d)
        refFrame.wedges[zoneIndex][this.className].push(obj)
      }
      refFrame.forceVisibilityRefresh = true
    })
  }
}

export class MovingVirtualObject extends VirtualObject {

  constructor(launchIndex) {
    super()
    this.launchIndex = launchIndex
    this.timeLaunched = launchIndex * this.constructor.tInc
  }

  static isDynamic = true
  static tInc = 1
  static slowDownPassageOfTime = 1
  static launcherStartDelayInSeconds = 0
  static launchStride = 1         // Only every launchStride-th launch is shown (see launcher.updateLaunchStride)
  static prepopulatedLaunches = 0 // Include launches before t=0, as in the original launcher presets.
  static stagedLaunches = 0       // Finite staged queue; 0 retains the repeating launch cadence.
  static queueMotion = null
  static egress = null            // { duration, distance, endSpeed } (launchCadence.js), shared by every moving class; set by the launcher

  // Launcher time each launch spends leaving the terminal before it starts accelerating (0 without a terminal).
  static get egressDuration() {
    return MovingVirtualObject.egress?.duration ?? 0
  }
  static activeObjects = new Map() // launchIndex -> virtual object; MUST be redeclared per subclass

  // The launcher's clock. It stands at 0 until the start delay is over (the screws wait for it too), except
  // with a terminal to leave: then the first launch's egress runs during the delay, before the screws start.
  static adjustedTime(timeSinceStart) {
    if (MovingVirtualObject.egress) return (timeSinceStart - this.launcherStartDelayInSeconds) * this.slowDownPassageOfTime
    return tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, timeSinceStart, this.launcherStartDelayInSeconds)
  }

  // Minimum stride so that no more than `numObjects` launches are in flight over `duration` seconds.
  // (`duration` includes the egress.)
  static strideNeeded(duration) {
    const n = this.numObjects
    if (!(n > 0) || !(this.tInc > 0) || !(duration > 0)) return 1
    return Math.floor(duration / (n * this.tInc)) + 1
  }

  // Launch indices in flight (or leaving the terminal) at adjusted time `adj` on a trajectory lasting
  // `duration` seconds.
  static activeLaunchIndices(adj, duration) {
    const indices = []
    if (!(this.numObjects > 0) || !Number.isFinite(adj)) return indices
    if (MovingVirtualObject.stagedLaunches > 0) {
      for (let k = 0; k < Math.min(this.numObjects, MovingVirtualObject.stagedLaunches); k++) {
        if (adj - k * this.tInc <= duration) indices.push(k)
      }
      return indices
    }
    if (MovingVirtualObject.prepopulatedLaunches > 0 && this.tInc > 0 && duration >= 0) {
      const last = Math.floor(adj / this.tInc)
      const first = Math.max(1 - MovingVirtualObject.prepopulatedLaunches,
        Math.ceil((adj - duration) / this.tInc), last - this.numObjects + 1)
      for (let k = first; k <= last; k++) indices.push(k)
      return indices
    }
    const lead = this.egressDuration
    if (!(this.tInc > 0) || !(duration >= 0)) {
      // Degenerate spacing: a single launch at t = 0
      if (adj >= -lead && adj <= Math.max(0, duration)) indices.push(0)
      return indices
    }
    const m = Math.max(1, this.launchStride | 0)
    const step = m * this.tInc
    const jMax = Math.floor((adj + lead) / step)
    const jMin = Math.max(Math.ceil((adj - duration) / step), jMax - this.numObjects + 1)
    for (let j = jMin; j <= jMax; j++) indices.push(j * m)
    return indices
  }

  // Rebuilds this class's virtual objects for the current animation time, moves them into the right
  // wedges, hands models to the ones in visible zones, takes models back from the rest, and places the
  // visible models. visibleZones is a Uint8Array indexed by zone.
  static syncToTime(refFrame, visibleZones) {
    const adj = this.adjustedTime(refFrame.timeSinceStart)
    const duration = pathDuration(refFrame.curve)
    const previous = this.activeObjects
    const next = new Map()
    this.activeLaunchIndices(adj, duration).forEach(k => {
      next.set(k, previous.get(k) || new this(k))
    })
    previous.forEach((obj, k) => {
      if (!next.has(k) && obj.model) {
        this.releaseModel(obj.model)
        obj.model = null
      }
    })
    refFrame.wedges.forEach(wedge => { wedge[this.className].length = 0 })
    next.forEach(obj => {
      // (While leaving the terminal it is in the zone of the start of its path.)
      const zoneIndex = pathZoneIndex(refFrame.curve, adj - obj.timeLaunched)
      refFrame.wedges[zoneIndex][this.className].push(obj)
      const visible = this.isVisible && visibleZones[zoneIndex] === 1
      if (visible && !obj.model) obj.model = this.acquireModel(obj, refFrame)
      else if (!visible && obj.model) {
        this.releaseModel(obj.model)
        obj.model = null
      }
      if (obj.model) obj.placeAndOrientModel(obj.model, refFrame)
    })
    this.activeObjects = next
  }

  static removeAllVirtualObjects() {
    super.removeAllVirtualObjects()
    this.activeObjects.forEach(obj => {
      if (obj.model) {
        this.releaseModel(obj.model)
        obj.model = null
      }
    })
    this.activeObjects = new Map()
  }

  // Moving objects are created on demand by syncToTime(); nothing to add up front.
  static addNewVirtualObjects(refFrames) {
    this.hasChanged = true
    refFrames.forEach(refFrame => { refFrame.forceVisibilityRefresh = true })
  }

  static queueLead() {
    return MovingVirtualObject.stagedLaunches > 0 ? Math.max(0, MovingVirtualObject.stagedLaunches - 1) * this.tInc : this.egressDuration
  }

  // Time along this object's trajectory at (refFrame time + dt) (negative while leaving the terminal), or
  // null if it is not in flight.
  deltaTAt(refFrame, timeDeltaInSeconds = 0) {
    const ctor = this.constructor
    const adj = ctor.adjustedTime(refFrame.timeSinceStart + timeDeltaInSeconds)
    const deltaT = adj - this.timeLaunched
    return (deltaT >= -ctor.queueLead() && deltaT <= pathDuration(refFrame.curve)) ? deltaT : null
  }

  // Time along this object's trajectory at refFrame's time, kept to it (from its egress to its end).
  clampedDeltaT(refFrame) {
    const ctor = this.constructor
    const deltaT = ctor.adjustedTime(refFrame.timeSinceStart) - this.timeLaunched
    return Math.max(-ctor.queueLead(), Math.min(pathDuration(refFrame.curve), deltaT))
  }

  // Default getFutureFrame: frameAt() is implemented by subclasses and returns the rendered model's
  // centre and axes.
  getFuturePosition(refFrame, timeDeltaInSeconds) {
    const frame = this.getFutureFrame(refFrame, timeDeltaInSeconds)
    return frame ? frame.position : null
  }

  getFutureFrame(refFrame, timeDeltaInSeconds) {
    let deltaT = this.deltaTAt(refFrame, timeDeltaInSeconds)
    if (deltaT === null) {
      // Clamp to the trajectory so that trackers following an object that just finished get its end point
      const adj = this.constructor.adjustedTime(refFrame.timeSinceStart + timeDeltaInSeconds)
      deltaT = Math.max(-this.constructor.queueLead(), Math.min(pathDuration(refFrame.curve), adj - this.timeLaunched))
    }
    const frame = this.frameAt(refFrame, deltaT)
    return {
      position: frame.centre,
      forward: frame.forward,
      upward: frame.upward,
      rightward: frame.rightward,
      orientation: frame.orientation,
    }
  }
}

// How long a moving object is on `path`: along it, and then (path.fallBack, which the launcher gives the
// nuts' and sleds' paths: see fallBack.js) back down it.
export function pathDuration(path) {
  return path.getDuration() + (path.fallBack?.duration ?? 0)
}

// The zone of `path` an object is in `deltaT` seconds after it entered it.
export function pathZoneIndex(path, deltaT) {
  if (path.fallBack && deltaT > path.getDuration()) {
    return path.getZoneIndexAt(path.fallBack.distanceAt(deltaT - path.getDuration()) / path.getLength())
  }
  return path.getZoneIndex(Math.max(0, deltaT))
}

// Position and orientation along a SuperCurvePath `deltaT` seconds after an object entered it.
// useT selects the curve's own spline parameter (tToi) instead of arc length (tTod); curves without a
// tToi converter, and the animated coiled tube (whose spline parameter does not match the converters
// of the uncoiled tube), always use arc length.
// Before the path (deltaT < 0, leaving the terminal: MovingVirtualObject.egress), the object is on the
// line of the path's start, `egress` behind it, and the result has egress: true and a negative distance.
// After the path's duration, an object whose path has a fallBack is falling back down it (fallingBack: true).
export function curveFrameAtTime(path, deltaT, useT = false) {
  if (deltaT < 0) {
    const f = curveFrameAtTime(path, 0, useT)
    const behind = MovingVirtualObject.stagedLaunches > 0
      ? queuedTrainState(deltaT, MovingVirtualObject.queueMotion).behind
      : egressDistanceBehind(deltaT, MovingVirtualObject.egress)
    f.point.addScaledVector(f.forward, -behind)
    f.distance -= behind
    f.egress = true
    return f
  }
  if (path.fallBack && deltaT > path.getDuration()) {
    // Falling back down the path (still facing along it), by distance along the whole path.
    const res = path.findRelevantCurveAt(path.fallBack.distanceAt(deltaT - path.getDuration()) / path.getLength())
    const curve = res.relevantCurve
    const length = res.relevantCurveLength
    const distance = path.fallBack.distanceAt(deltaT - path.getDuration()) - res.relevantCurveStartPosition
    const d = (length > 0) ? Math.max(0, Math.min(1, distance / length)) : 0
    const point = curve.getPointAt(d)
    const forward = curve.getTangentAt(d).normalize()
    const upward = curve.getNormalAt(d)
    upward.addScaledVector(forward, -upward.dot(forward)).normalize()
    res.relevantCurveStartDistance = res.relevantCurveStartPosition
    return { res, curve, t: null, i: d, d, distance, byT: false, point, forward, upward, egress: false, fallingBack: true }
  }
  const res = path.findRelevantCurve(deltaT)
  const curve = res.relevantCurve
  const t = Math.max(0, deltaT - res.relevantCurveStartTime)
  const length = res.relevantCurveLength
  const distance = curve.tTod ? curve.tTod(t) : 0
  const d = (length > 0) ? Math.max(0, Math.min(1, distance / length)) : 0
  const byT = useT && curve.tToi && (curve.name !== 'coiledElevatedEvacuatedTube')
  const i = byT ? Math.max(0, Math.min(1, curve.tToi(t))) : d
  const point = byT ? curve.getPoint(i) : curve.getPointAt(d)
  const forward = (byT ? curve.getTangent(i) : curve.getTangentAt(d)).normalize()
  const upward = (byT ? curve.getNormal(i) : curve.getNormalAt(d))
  upward.addScaledVector(forward, -upward.dot(forward)).normalize()
  return { res, curve, t, i, d, distance, byT, point, forward, upward, egress: false }
}
