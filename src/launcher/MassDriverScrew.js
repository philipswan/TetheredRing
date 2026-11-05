import * as THREE from 'three'
import { ScrewGeometry, screwLengthOffsets } from './ScrewGeometry.js'
import { buildScrewGeometry } from './ScrewGeometryBuilder.js'
import * as tram from '../utils/tram.js'
import { VirtualObject, parameterSignature } from './VirtualObject.js'
import { PixelLOD } from '../scene/PixelLOD.js'

// Screw levels of detail, chosen by the screw's on-screen diameter in pixels. The flights follow the
// thread model in launcherPhysics (threadTime: unrolled, the flight is a quadratic in the thread
// angle), which the grapplers target too. Each thread level samples it finely enough that the chords
// between rings of vertices stay within chordError (a fraction of the thread radius) of the true
// curve: about 0.25 px at the level's smallest size, and ~1 mm on a 0.5 m screw at full detail (50 rings
// per turn, as fine as the original fixed tessellation was on fast sections).
// Lengthwise steps are also at most 1/segmentsPerMeter. maxSegments bounds the vertex count; a
// segment whose pitch is too fine for that budget is drawn as a cylinder at that level, as are all
// screws below the last thread level (the threads are sub-pixel there).
const SCREW_LEVELS = [
  { minPixels: 48, segmentsPerMeter: 16, chordError: 0.002, maxSegments: 8192, cost: 'expensive' },  // full detail (close-ups)
  { minPixels: 12, segmentsPerMeter: 4, chordError: 0.01, maxSegments: 2048, cost: 'expensive' },
  // (The first thread level is started early, from an eighth of its size: a screw flashing past a camera
  // following the launch vehicle reaches it within a few frames of being given a model.)
  { minPixels: 3, segmentsPerMeter: 1, chordError: 0.04, maxSegments: 512, cost: 'cheap', prefetch: 0.125 },
  { minPixels: 0.75, cylinder: true, cost: 'cheap' },
].map(level => level.cylinder ? level : {
  ...level,
  // A chord spanning angle a deviates from the arc by r (1 - cos(a/2)).
  samplesPerTurn: Math.ceil(Math.PI / Math.acos(1 - level.chordError)),
})

export class massDriverScrewModel {

    constructor() {
    }

    // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
    // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
    // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
    // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
    createModel(dParamWithUnits, launcherMassDriverLength, massDriverScrewSegments, segmentIndex, massDriverScrewMaterials, highRes = false) {

        if (highRes) {
          console.log('High Res Mass Driver Screw')
        }
        const shaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
        const shaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
        const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
        const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
        const threadTaperRatio = dParamWithUnits['launcherMassDriverScrewThreadTaperRatio'].value
        const launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
        const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        const launcherMassDriver1InitialVelocity = dParamWithUnits['launcherMassDriver1InitialVelocity'].value
        const bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
        
        // ToDo: This doesn't scale well. Need to figure out how to make this work for any dimentions of the mass driver's screw.

        // Hack!!!
        const minLengthSegmentsPerMeter = ((!highRes) ? 16 : 512)
        //const minLengthSegmentsPerMeter = ((!highRes) ? 512 : 512)

        const segmentSpacing = launcherMassDriverLength / massDriverScrewSegments
        const baseDistanceAlongScrew = segmentIndex * segmentSpacing
        const threadStarts = Math.max(1, dParamWithUnits['launcherMassDriverScrewThreadStarts'].value)
        const screwLength = segmentSpacing - bracketThickness
        const initialDistance = dParamWithUnits['adaptiveNutBodyLength'].value / 2

        // The point of breaking the screw into segments relates to the need to display the brackets.
        const modelRadialSegments = ((!highRes) ? 12 : 96) / Math.min(threadStarts, 4)

        const massDriverScrewGeometry = new ScrewGeometry(
            screwLength,
            shaftOuterRadius,
            shaftInnerRadius,
            threadRadius,
            threadThickness,
            threadTaperRatio,
            threadStarts,
            baseDistanceAlongScrew,
            launcherMassDriver1InitialVelocity,
            initialDistance,
            launcherMassDriverScrewRevolutionsPerSecond,
            launcherMassDriverForwardAcceleration,
            modelRadialSegments,
            minLengthSegmentsPerMeter)
        const massDriverScrewMesh = new THREE.Mesh(massDriverScrewGeometry, massDriverScrewMaterials[segmentIndex%2])
        massDriverScrewMesh.name = "massDriverScrew"

        return massDriverScrewMesh
    }

    genSpecs(dParamWithUnits, specs) {

      const shaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
      const shaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
      const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      const threadTaperRatio = dParamWithUnits['launcherMassDriverScrewThreadTaperRatio'].value
      // ToDo: If the thread starts are variable, then we need a more complex calculation for the screw's volume.
      const threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      const screwRoughLength = dParamWithUnits['launcherMassDriverScrewRoughLength'].value

      const shaftInnerArea = Math.PI * shaftInnerRadius**2
      const shaftOuterArea = Math.PI * shaftOuterRadius**2
      const threadHeight = threadRadius - shaftOuterRadius
      
      const massDriverScrewCrosssectionalArea = shaftOuterArea - shaftInnerArea + threadHeight * threadThickness*(1+threadTaperRatio)/2 * threadStarts
      specs['massDriverScrewCrosssectionalArea'] = {value: massDriverScrewCrosssectionalArea, units: "m2"}

    }
}

// Builds the pooled screw model: a group holding the left and right screws, each a PixelLOD whose
// levels share per-level geometry for the screw segment the model is currently placed at.
// cylinderPool: optional InstancedProxyPool drawing the far (cylinder) level of every screw in one
// draw call; without it each screw draws its own cylinder mesh.
export function createScrewModelPair(materials, threadRadius, cylinderPool = null) {
  const group = new THREE.Group()
  group.name = 'massDriverScrews'
  // Per-model state lives in plain properties: Object3D.clone() would JSON-copy userData.
  group.screwGeometries = new Map()
  group.screwRotations = new Map()   // level -> rotation of a shared geometry onto this segment
  group.screwSegment = null
  for (let side = 0; side < 2; side++) {
    const lod = new PixelLOD(2 * threadRadius, { extent: 0 })
    lod.name = 'massDriverScrew'
    lod.userData = side
    if (side === 1) lod.scale.set(-1, 1, 1)
    SCREW_LEVELS.forEach((level, levelIndex) => {
      lod.addLevel(level.minPixels, () => {
        if (level.cylinder && cylinderPool) {
          const proxy = cylinderPool.createProxy()
          proxy.scale.y = lod.parent.screwSegment.screwLength / cylinderPool.nominalLength
          return proxy
        }
        const makeMesh = (geometry) => {
          const mesh = new THREE.Mesh(geometry, materials[0])
          mesh.name = 'massDriverScrew'
          mesh.rotation.y = lod.parent.screwRotations.get(levelIndex) ?? 0
          return mesh
        }
        const geometry = screwGeometryFor(lod.parent, levelIndex)
        return (typeof geometry.then === 'function') ? geometry.then(makeMesh) : makeMesh(geometry)
      }, { cost: level.cost, prefetch: level.cylinder ? false : (level.prefetch ?? true) })
    })
    group.add(lod)
  }
  return group
}

// Fast screw segments hold under a turn of the thread, and neighbouring ones differ by little more
// than where the thread starts round the shaft: at 10 km/s some 2000 segments a second pass a camera
// following the launch vehicle, far more than can each be built. Segments of up to MAX_SHARED_TURNS
// turns therefore share one geometry per SHARED_SPEED_STEP (relative) of thread speed, built at the
// distance where the speed is exactly the bucket's, and rotated about the screw's axis onto each
// segment's thread phase. The thread then runs off by at most about SHARED_SPEED_STEP / 2 *
// MAX_SHARED_TURNS turns (~1 mm at the tips) at the far end of a segment. Kept for the most recently
// used MAX_SHARED_GEOMETRIES (key -> geometry or Promise; Map order is age).
const SHARED_SPEED_STEP = 0.001
const MAX_SHARED_TURNS = 1
const MAX_SHARED_GEOMETRIES = 400
const sharedGeometries = new Map()

// The shared geometry for a segment starting `distance` along the screw, `length` long: its bucket,
// the distance it is built at, and the rotation (about the screw's axis) onto the segment; or null if
// the segment is not shared. thread: {initialVelocity, initialDistance, acceleration,
// revolutionsPerSecond, threadStartDistance}.
export function sharedScrewBucket(distance, length, thread) {
  const { initialVelocity: v0, initialDistance: x0, acceleration: a, revolutionsPerSecond: rps, threadStartDistance: start } = thread
  if (!(a > 0) || distance < x0 || !(distance >= start)) return null
  const speed = Math.abs(tram.threadSpeed(distance, v0, x0, a))
  if (!(Math.abs(rps) * length / speed <= MAX_SHARED_TURNS)) return null
  const bucket = Math.round(Math.log(speed) / SHARED_SPEED_STEP)
  const bucketSpeed = Math.exp(bucket * SHARED_SPEED_STEP)
  const bucketDistance = x0 + (bucketSpeed ** 2 - v0 ** 2) / (2 * a)
  if (bucketDistance < x0 || bucketDistance < start) return null
  const phase = 2 * Math.PI * rps * (tram.threadTime(distance, v0, x0, a) - tram.threadTime(bucketDistance, v0, x0, a))
  return { bucket, bucketDistance, rotation: -phase }
}

// The cache's keys (see sharedScrewGeometry) only tell apart segments of one screw design. When the design changes (a thread or
// trajectory parameter), the screw pool is rebuilt (virtualMassDriverScrew.disposePool), every screw
// model having been released, and the shared geometries are freed with it so none built for the old
// design is served again. Queued builds are cancelled.
export function clearSharedScrewGeometries() {
  for (const geometry of sharedGeometries.values()) {
    if (typeof geometry.then === 'function') geometry.cancel?.()
    else geometry.dispose()
  }
  sharedGeometries.clear()
}

export function sharedScrewGeometry(segment, levelIndex, level, sync) {
  const v = virtualMassDriverScrew
  const a = v.launcherMassDriverForwardAcceleration, v0 = v.launcherMassDriver1InitialVelocity
  const x0 = v.initialDistance, rps = v.launcherMassDriverScrewRevolutionsPerSecond
  const start = v.threadLayout.threadStartDistance
  const share = sharedScrewBucket(segment.baseDistanceAlongScrew, segment.screwLength,
    { initialVelocity: v0, initialDistance: x0, acceleration: a, revolutionsPerSecond: rps, threadStartDistance: start })
  if (!share) return null
  const { bucket, bucketDistance } = share
  const key = [levelIndex, segment.threadStarts, segment.screwLength.toFixed(4), segment.radialSegments, bucket].join(':')
  let geometry = sharedGeometries.get(key)
  if (geometry && sync && typeof geometry.then === 'function') geometry = undefined   // recording: build it now
  if (geometry) {
    sharedGeometries.delete(key)   // (most recently used last)
    sharedGeometries.set(key, geometry)
  }
  else {
    geometry = buildScrewGeometry([
      segment.screwLength, v.shaftOuterRadius, v.shaftInnerRadius, v.threadRadius, v.threadThickness,
      v.threadTaperRatio, segment.threadStarts, bucketDistance, v0, x0, rps, a,
      segment.radialSegments, level.segmentsPerMeter, level.samplesPerTurn, level.maxSegments, start],
      { async: !sync, priority: Infinity })   // (serves many segments)
    sharedGeometries.set(key, geometry)
    if (typeof geometry.then === 'function') {
      const promise = geometry
      promise.sharedScrew = true
      promise.then((built) => {
        built.userData.sharedScrew = true
        if (sharedGeometries.get(key) === promise) sharedGeometries.set(key, built)
      }, () => { if (sharedGeometries.get(key) === promise) sharedGeometries.delete(key) })
    }
    else geometry.userData.sharedScrew = true
    for (const [oldKey, old] of sharedGeometries) {
      if (sharedGeometries.size <= MAX_SHARED_GEOMETRIES) break
      sharedGeometries.delete(oldKey)
      if (typeof old.dispose === 'function') old.dispose()   // (re-uploaded if a model still draws it)
    }
  }
  return { geometry, rotation: share.rotation }
}

// Geometry for one level of the segment this pooled model currently represents (cached per model).
// Thread levels are built by worker threads (a Promise is returned and cached until it resolves),
// except while recording, where every frame must be complete.
function screwGeometryFor(group, levelIndex) {
  const cache = group.screwGeometries
  const sync = PixelLOD.buildBudget === Infinity
  const cached = cache.get(levelIndex)
  if (cached && !(sync && typeof cached.then === 'function')) return cached
  const v = virtualMassDriverScrew
  const segment = group.screwSegment
  const level = SCREW_LEVELS[levelIndex]
  const lod = group.children[0]
  const screwIndex = group._screwIndex
  let geometry, shared
  group.screwRotations.delete(levelIndex)
  const threadsFit = !level.cylinder && screwLengthOffsets(segment.screwLength, segment.baseDistanceAlongScrew,
    v.launcherMassDriver1InitialVelocity, v.initialDistance, v.launcherMassDriverForwardAcceleration,
    v.launcherMassDriverScrewRevolutionsPerSecond, level.segmentsPerMeter, level.samplesPerTurn, level.maxSegments, v.threadLayout.threadStartDistance) !== null
  if (!threadsFit) {
    // Thread envelope, slightly thinner than the tips to account for the gaps between flights.
    geometry = new THREE.CylinderGeometry(v.threadRadius * 0.9, v.threadRadius * 0.9, segment.screwLength, 12, 1, false)
  }
  else if ((shared = sharedScrewGeometry(segment, levelIndex, level, sync))) {
    group.screwRotations.set(levelIndex, shared.rotation)
    geometry = shared.geometry
  }
  else {
    geometry = buildScrewGeometry([
      segment.screwLength, v.shaftOuterRadius, v.shaftInnerRadius, v.threadRadius, v.threadThickness,
      v.threadTaperRatio, segment.threadStarts, segment.baseDistanceAlongScrew, v.launcherMassDriver1InitialVelocity,
      v.initialDistance, v.launcherMassDriverScrewRevolutionsPerSecond, v.launcherMassDriverForwardAcceleration,
      segment.radialSegments, level.segmentsPerMeter, level.samplesPerTurn, level.maxSegments, v.threadLayout.threadStartDistance],
      // The screws nearest to needing this level first; dropped once the screw is going away and smaller
      // than the level, or the model has moved to another segment.
      { async: !sync, priority: () => lod.onScreenPixels / level.minPixels, wanted: () => group._screwIndex === screwIndex && (lod.pixelGrowth >= 1 || lod.onScreenPixels >= level.minPixels) })
  }
  cache.set(levelIndex, geometry)
  if (typeof geometry.then === 'function') {
    const promise = geometry
    promise.then((built) => {
      // Keep it if this model still wants it; otherwise (moved to another segment, or replaced by a
      // synchronous build) free it, unless it is shared.
      if (cache.get(levelIndex) === promise) cache.set(levelIndex, built)
      else if (!built.userData.sharedScrew) built.dispose()
    }, () => { if (cache.get(levelIndex) === promise) cache.delete(levelIndex) })
  }
  return geometry
}

export class virtualMassDriverScrew extends VirtualObject {
  constructor(d, index) {
    super()
    this.d = d
    this.index = index
    this.versionNumber = 0
    this.position = []
  }

  static unallocatedModels = []
  static className = 'virtualMassDriverScrews'
  static modelsAreRecyleable = true   // pooled, but the geometry is regenerated for each segment index
  static highlightClass = 'massDriver'
  static isDynamic = true             // the screws spin

  static signatureOf(dParamWithUnits) {
    return parameterSignature(dParamWithUnits,
      ['launcherMassDriverScrew', 'launcherMassDriverForwardAcceleration', 'launcherMassDriver1InitialVelocity', 'adaptiveNutBodyLength',
        'adaptiveNutGrapplerMagnetThickness', 'adaptiveNutGrapplerPadLiftAwayDistance', 'adaptiveNutShaftToGrapplerPad'],
      ['SidewaysOffset', 'UpwardsOffset', 'Material', 'Density', 'Cost', 'STL'])
  }

  static disposePool(options) {
    super.disposePool(options)
    clearSharedScrewGeometries()
  }

  static isTeardownRequired(dParamWithUnits, massDriverAccelerationScrewSegments) {
    const newNumVirtualMassDriverAccelerationScrews = dParamWithUnits['showMassDriverAccelerationScrews'].value ? massDriverAccelerationScrewSegments : 0
    return newNumVirtualMassDriverAccelerationScrews!==virtualMassDriverScrew.numObjects
  }

  static update(dParamWithUnits, launcherMassDriverLength, massDriverScrewSegments, accelerationScrewLength, massDriverScrewMaterials, versionNumber) {
    const v = virtualMassDriverScrew
    v.numObjects = dParamWithUnits['showMassDriverAccelerationScrews'].value ? massDriverScrewSegments : 0
    v.halfBracketThickness = (accelerationScrewLength > 0) ? dParamWithUnits['launcherMassDriverScrewBracketThickness'].value / 2 / accelerationScrewLength : 0
    v.launcherMassDriverLength = launcherMassDriverLength
    v.massDriverScrewSegments = Math.max(1, massDriverScrewSegments)
    v.massDriverScrewMaterials = massDriverScrewMaterials
    v.shaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
    v.shaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
    v.threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
    v.threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
    v.threadTaperRatio = dParamWithUnits['launcherMassDriverScrewThreadTaperRatio'].value
    v.threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
    v.launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
    v.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
    v.launcherMassDriver1InitialVelocity = dParamWithUnits['launcherMassDriver1InitialVelocity'].value
    v.bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
    v.numBrackets = dParamWithUnits['launcherMassDriverScrewNumBrackets'].value
    v.initialDistance = dParamWithUnits['adaptiveNutBodyLength'].value / 2
    v.isVisible = dParamWithUnits['showMassDriverAccelerationScrews'].value
    v.isDynamic = true
    v.hasChanged = true
    v.sidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
    v.upwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
    v.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    v.launcherStartDelayInSeconds = dParamWithUnits['launcherStartDelayInSeconds'].value
    v.versionNumber = versionNumber
  }

  // Screws further away than this are under half the smallest drawn size (see SCREW_LEVELS), so they get
  // no model at all (with one segment of margin). The models of nearer ones are given out early so that
  // their first thread level (prefetched from an eighth of its size) is built by the time it is needed.
  // pixelsPerRadian: drawing-buffer pixels per radian.
  static modelRange(pixelsPerRadian) {
    const v = virtualMassDriverScrew
    const smallestPixels = SCREW_LEVELS[SCREW_LEVELS.length - 1].minPixels * PixelLOD.lodBias / 2
    return 2 * v.threadRadius * pixelsPerRadian / smallestPixels + v.launcherMassDriverLength / v.massDriverScrewSegments
  }

  static addNewVirtualObjects(refFrames) {
    const v = virtualMassDriverScrew
    v.addEvenlySpacedObjects(refFrames, (i) => (i < v.numBrackets) ? -v.halfBracketThickness : 0)
  }

  placeAndOrientModel(om, refFrame) {
    const v = virtualMassDriverScrew
    om.visible = v.isVisible
    if (!v.isVisible) return
    const d = this.d
    if ((this.versionNumber!=v.versionNumber) || (this.position.length==0)) {
      // Something about the design has been updated so this instance also needs to be updated
      const upward = refFrame.curve.getNormalAt(d)
      const rightward = refFrame.curve.getBinormalAt(d)
      const vs = rightward.clone().multiplyScalar(v.sidewaysOffset)
      const vu = upward.clone().multiplyScalar(v.upwardsOffset)
      const p0 = refFrame.curve.getPointAt(d).add(vu)
      const p1 = p0.clone()
      this.position[0] = p0.add(vs)
      this.position[1] = p1.sub(vs)
      this.orientation = refFrame.curve.getQuaternionAt(d)
      this.versionNumber = v.versionNumber
    }

    // Pooled models represent one segment at a time. When reused elsewhere, drop the cached level
    // geometry; the PixelLOD children rebuild whichever level they need, when they need it.
    if (om._screwIndex !== this.index) {
      const segmentSpacing = v.launcherMassDriverLength / v.massDriverScrewSegments
      const baseDistanceAlongScrew = this.index * segmentSpacing
      // (Each segment has a single number of starts: see screwThreadLayout.)
      const threadStarts = v.threadLayout.startsAt(baseDistanceAlongScrew)
      om.screwSegment = {
        baseDistanceAlongScrew,
        threadStarts,
        screwLength: Math.max(0.01, (this.index < v.numBrackets) ? segmentSpacing - v.bracketThickness : segmentSpacing),
        radialSegments: Math.max(3, Math.round(12 / Math.min(Math.max(1, threadStarts), 4))),
      }
      const cache = om.screwGeometries
      // Free built levels, and drop builds for the old segment that have not started (those that have
      // free themselves when they finish).
      cache.forEach(geometry => {
        if (geometry.userData?.sharedScrew || geometry.sharedScrew) return   // shared with other segments
        if (typeof geometry.dispose === 'function') geometry.dispose()
        else geometry.cancel?.()
      })
      om.screwRotations.clear()
      cache.clear()
      om.children.forEach(lod => {
        lod.reset({ dispose: false })
        lod.extent = om.screwSegment.screwLength / 2
      })
      om._screwIndex = this.index
    }

    // The screw angle is a function of the launcher's global (adjusted) clock; the adaptive nuts use the
    // same time origin so their grapplers stay in phase with the thread.
    // NOTE: at e.g. 169 rev/s the rotation is far above the frame rate, so the rendered spin is aliased
    // (it can appear stationary or to turn backwards). That is inherent to sampling at 30-60 fps.
    const time = v.adjustedTime(refFrame.timeSinceStart)
    const turns = (time * v.launcherMassDriverScrewRevolutionsPerSecond) % 1
    om.children.forEach(child => {
      const index = child.userData
      const lr = 1 - index*2
      child.position.copy(this.position[index])
      child.quaternion.copy(this.orientation)
      child.rotateY(-lr * turns * 2 * Math.PI)
    })
  }

  static adjustedTime(timeSinceStart) {
    return tram.adjustedTimeSinceStart(virtualMassDriverScrew.slowDownPassageOfTime, timeSinceStart, virtualMassDriverScrew.launcherStartDelayInSeconds)
  }
}
