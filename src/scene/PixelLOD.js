import * as THREE from 'three'

const _cameraPosition = new THREE.Vector3()
const _objectPosition = new THREE.Vector3()

// Level of detail chosen by on-screen size (pixels) rather than by distance, so a narrow-FOV close-up
// gets full detail and the same object seen from far away does not. three.js calls update(camera)
// for every LOD in the scene while rendering, so no extra per-frame plumbing is needed.
//
//   const lod = new PixelLOD(objectSizeInMetres)
//   lod.addLevel(48, () => buildHighDetailMesh())   // shown when the object is >= 48 px
//   lod.addLevel(4, () => buildLowDetailMesh())
//   (below the smallest threshold nothing is drawn)
//
// Level contents are built lazily the first time they are needed. Expensive builds are rate
// limited per frame (PixelLOD.buildBudget, in milliseconds of build time per frame) so a camera move
// does not stall on dozens of high-detail rebuilds: until a level is built the next coarser built
// level is shown. A time budget (rather than a count) lets many cheap builds through when the camera
// races along a launcher, while a few slow ones still cannot stall a frame.
// Recording sets an unlimited budget so every frame is rendered at its intended detail.
export class PixelLOD extends THREE.LOD {
  // Drawing-buffer height in pixels; the App keeps this up to date.
  static viewportHeight = 1080
  // Multiplies every threshold (1 = as designed; >1 switches to coarser levels sooner). Set by the
  // graphics-quality setting; always 1 while recording.
  static lodBias = 1
  // Milliseconds per frame that expensive lazy level builds may take (Infinity while recording). A
  // build is started only while the frame's total is below the budget.
  static buildBudget = 6
  // Prefetch levels (see addLevel) start building at this fraction of their threshold (4x the distance:
  // a slow machine following a launch vehicle moves tens of metres per frame).
  static prefetchFactor = 0.25
  // An object whose on-screen size changes by more than this factor from one frame to the next (a
  // screw flashing past a camera following a launch vehicle) is at any one size for only a frame or
  // so: its expensive levels are not built or prefetched (they could not be ready in time, and would
  // hold up the cheap levels it does show); the best built level is shown instead.
  static fleetingRatio = 1.25
  static _buildMsThisFrame = 0
  static _frame = -1
  static _frameCount = 0

  // Call once per rendered frame (before rendering) to reset the build budget.
  static beginFrame(frameNumber) {
    PixelLOD._frame = frameNumber
    PixelLOD._frameCount++   // (renderer frame numbers advance once per render call, several per frame)
    PixelLOD._buildMsThisFrame = 0
  }

  static updateScene(scene, camera) {
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    scene.traverseVisible(object => {
      if (object instanceof PixelLOD) object.update(camera)
    })
  }

  static async prepareScene(scene, camera) {
    for (;;) {
      PixelLOD.updateScene(scene, camera)
      const pending = []
      scene.traverseVisible(object => {
        if (!(object instanceof PixelLOD)) return
        const wanted = object.pixelLevels.find(level => object.onScreenPixels >= level.minPixels)
        if (wanted?.pending) pending.push(wanted.pending.promise)
      })
      if (!pending.length) return
      await Promise.all(pending)
    }
  }

  // size: characteristic size (m) whose projection is compared with the level thresholds.
  // extent: radius (m) of the region the LOD's contents span around its origin. Distance is measured
  // to the nearest point of that region, so a long chunk of objects is judged by its closest member.
  constructor(size, { extent = 0 } = {}) {
    super()
    this.type = 'PixelLOD'
    this.size = size
    this.extent = extent
    this.pixelLevels = [] // [{ minPixels, factory, object, cost }], sorted by minPixels descending
    this.currentPixelLevel = -1
    this.onScreenPixels = 0
    this._previousPixels = 0
    this._previousFrame = -2
    this.pixelGrowth = 1
  }

  // factory() returns an Object3D (or null for "draw nothing"), or a Promise of one for levels built
  // in the background (e.g. by a worker); until it resolves the level counts as not built. `cost` is
  // 'expensive' for builds that should count against the per-frame budget. `prefetch` starts building
  // the level once the object is PixelLOD.prefetchFactor of the way to its threshold, so a background
  // build is ready by the time it is needed. `prefetch` may instead be that fraction itself.
  addLevel(minPixels, factory, { cost = 'cheap', prefetch = false } = {}) {
    const level = { minPixels, factory: typeof factory === 'function' ? factory : () => factory, object: undefined, cost, prefetch, pending: null }
    if (typeof factory !== 'function') this._attach(level, factory)
    this.pixelLevels.push(level)
    this.pixelLevels.sort((a, b) => b.minPixels - a.minPixels)
    return this
  }

  _attach(level, object) {
    level.object = object ?? null
    if (level.object) {
      level.object.visible = false
      this.add(level.object)
      // The renderer updates this LOD while drawing, after the scene's world matrices were updated, so a
      // level built now would be drawn this frame without its world transform (far from where it
      // belongs). Lift fan chunks crossing their threshold one after another at speed showed this as a
      // gap at a fixed distance ahead of a camera following the launch vehicle.
      level.object.updateMatrixWorld(true)
    }
  }

  _build(level) {
    if (level.object !== undefined) return true
    const recording = PixelLOD.buildBudget === Infinity
    if (level.cost === 'expensive' && this._fleeting && !recording) return false
    // A background build still running: wait for it, except while recording, where every frame must
    // be complete (the factory then builds synchronously).
    if (level.pending && !recording) return false
    level.pending = null
    if (level.cost === 'expensive' && PixelLOD._buildMsThisFrame >= PixelLOD.buildBudget) return false
    const start = performance.now()
    const result = level.factory()
    if (level.cost === 'expensive') PixelLOD._buildMsThisFrame += performance.now() - start
    if (typeof result?.then !== 'function') {
      this._attach(level, result)
      return true
    }
    const token = { promise: result }
    level.pending = token
    result.then(
      (object) => { if (level.pending === token) { level.pending = null; this._attach(level, object) } },
      () => { if (level.pending === token) level.pending = null }) // retried on a later frame
    return false
  }

  // Projected size in pixels of `size` metres at this object's distance from the camera.
  pixelsFor(camera) {
    _cameraPosition.setFromMatrixPosition(camera.matrixWorld)
    _objectPosition.setFromMatrixPosition(this.matrixWorld)
    const distance = Math.max(1e-3, _cameraPosition.distanceTo(_objectPosition) - this.extent)
    // projectionMatrix[5] = 1 / tan(fovY / 2); half the viewport spans that.
    const pixelsPerRadian = camera.projectionMatrix.elements[5] * PixelLOD.viewportHeight / 2
    return this.size / distance * pixelsPerRadian / PixelLOD.lodBias
  }

  update(camera) {
    if (!this.pixelLevels.length) return
    const pixels = this.pixelsFor(camera)
    // Changing size fast (between consecutive frames)? Worked out once per frame (an LOD may be updated
    // more than once in a frame).
    if (this._previousFrame !== PixelLOD._frameCount) {
      const ratio = Math.max(pixels, 1e-9) / Math.max(this._previousPixels, 1e-9)
      // How much its on-screen size grew since the last frame (1 if unknown).
      this.pixelGrowth = this._previousFrame === PixelLOD._frameCount - 1 ? ratio : 1
      this._fleeting = this._previousFrame === PixelLOD._frameCount - 1 && (ratio > PixelLOD.fleetingRatio || ratio < 1 / PixelLOD.fleetingRatio)
      this._previousPixels = pixels
      this._previousFrame = PixelLOD._frameCount
    }
    this.onScreenPixels = pixels
    let wanted = this.pixelLevels.findIndex(level => pixels >= level.minPixels)
    if (wanted === -1) wanted = this.pixelLevels.length // smaller than every threshold: nothing
    // Use the wanted level if it can be built now, otherwise the nearest coarser built level, and
    // failing that the nearest finer built level (better too detailed than a hole).
    let shown = -1
    for (let i = wanted; i < this.pixelLevels.length; i++) {
      if (this._build(this.pixelLevels[i])) { shown = i; break }
    }
    if (shown === -1 && wanted < this.pixelLevels.length) {
      for (let i = wanted - 1; i >= 0; i--) if (this.pixelLevels[i].object !== undefined) { shown = i; break }
    }
    // Start building the next finer level that asked for it ahead of time (from `prefetch` of its
    // threshold, or PixelLOD.prefetchFactor), skipping finer levels without prefetch (such as one
    // drawn as soon as the object is drawn at all).
    for (let i = Math.min(wanted, this.pixelLevels.length) - 1; i >= 0; i--) {
      const next = this.pixelLevels[i]
      if (!next.prefetch) continue
      const factor = next.prefetch === true ? PixelLOD.prefetchFactor : next.prefetch
      if (next.object === undefined && !next.pending && pixels >= next.minPixels * factor) this._build(next)
      break
    }
    this.currentPixelLevel = shown
    this.pixelLevels.forEach((level, i) => { if (level.object) level.object.visible = (i === shown) })
  }

  // Drops built levels (e.g. when the parameters they were built from change).
  reset({ dispose = true } = {}) {
    for (const level of this.pixelLevels) {
      if (level.object?.instancedProxyPool) {
        level.object.instancedProxyPool.releaseProxy(level.object)
      }
      else if (level.object) {
        this.remove(level.object)
        if (dispose) level.object.traverse(o => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose() })
      }
      level.object = undefined
      level.pending = null // a background build still running is discarded when it finishes
    }
  }

  // THREE.LOD only raycasts its distance-based levels; raycast whichever level is shown.
  raycast(raycaster, intersects) {
    const level = this.pixelLevels[this.currentPixelLevel]
    if (level?.object) level.object.raycast(raycaster, intersects)
  }

  getCurrentLevel() {
    return this.currentPixelLevel
  }
}
