import * as THREE from 'three'
import {
  createShot, parseShot, serializeShot, shotDuration, sampleParameterTrack, validateShot, isWorldAnchor, sameAnchor,
  SHOT_FILE_EXTENSION, WORLD_ANCHOR,
} from './ShotFormat.js'
import { sampleCameraPath } from './CameraPath.js'
import { createTimeMap, solveSpeedFor } from './ShotTiming.js'
import { AnchorResolver, anchorKey } from './Anchors.js'
import { ShotPathOverlay } from './ShotPathOverlay.js'
import {
  VideoRecorder, resolveCodec, defaultBitrate, evenDimension, isRecordingSupported, CODEC_LABELS,
} from '../capture/VideoRecorder.js'
import { downloadText } from '../app/exports.js'
import { MotionBlur, subFrameTimes, adaptiveSubFrames } from '../capture/MotionBlur.js'
import { Supersampler, clampSupersample, maxRenderSize } from '../capture/Supersampler.js'
import { FrameCapture } from '../capture/FrameCapture.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { StructureLines } from '../scene/structureLines.js'
import { RenderQueueRunner } from './RenderQueueRunner.js'

const PENDING_SHOT_KEY = 'tetheredRing.pendingShot'
const AUTOSAVE_KEY = 'tetheredRing.shotAutosave'
const AUTOSAVE_DELAY_MS = 1000 // coalesce bursts of edits into one write
const TERRAIN_WAIT_TIMEOUT_MS = 15000
const MAX_REAL_STEP = 0.1 // s of wall-clock time per displayed frame (a backgrounded tab does not jump)
const PICK_RADIUS_PX = 30
export const PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 100, 300, 1000]

// The next display frame; in a hidden tab (no frames) the next task instead, so an unattended render
// carries on. (Timers are throttled in hidden tabs; messages are not.)
const nextFrame = () => new Promise((resolve) => {
  if (!document.hidden) { requestAnimationFrame(() => resolve()); return }
  const channel = new MessageChannel()
  channel.port1.onmessage = () => resolve()
  channel.port2.postMessage(null)
})
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const slug = (name) => (name.trim().replace(/[^\w.-]+/g, '_') || 'shot')
const clone = (value) => JSON.parse(JSON.stringify(value))

// Creates, edits, previews, records, exports and imports shots (see ShotFormat.js).
//
// The playhead is a time in the shot's video (`playhead`, seconds from the shot's start). It decides the
// simulated time through the shot's time warp (ShotTiming.js), so scrubbing the timeline, playing,
// rewinding and jumping all move the simulation. It may run before or after the shot to look for the
// right moment; simulated time never goes below 0.
//
// View modes:
//   free  - the orbit controls move the camera; the shot's path, keyframes and camera are drawn in the
//           scene (ShotPathOverlay) so the shot can be seen from outside
//   shot  - the camera is the shot's camera at the playhead, framed at the output aspect ratio
//
// Busy modes (a fixed-step loop drives the frames instead of App.frame()):
//   render    - renders the shot frame by frame and encodes it to video
//   live take - you fly the camera while the simulation advances at a fixed step; every frame's
//               camera pose (and any parameter you change) is recorded into a new shot
export class ShotController {
  constructor(app) {
    this.app = app
    this.resolver = new AnchorResolver(app)
    this.mode = 'idle'
    this.viewMode = 'free'
    this.playhead = 0
    this.rate = 1 // video seconds per second of wall-clock time; negative plays backwards (the scene runs on load)
    this.playbackSpeed = 1
    this.loop = false
    this.selected = -1
    this.cancelRequested = false
    this.stopRequested = false
    this.revision = 0
    this.listeners = new Set()
    this.prefs = {
      saveToDisk: typeof window.showSaveFilePicker === 'function',
      encodeLiveTake: true,
      showPath: true,
    }
    this.status = ''
    this.following = null
    this._lastWall = null
    this._timeMap = null
    this._timeMapRevision = -1
    this.overlay = new ShotPathOverlay(this)
    app.scene.add(this.overlay.group)
    this.shot = this.createShotNow()
    this.queue = new RenderQueueRunner(app, this)
    this._autosaveTimer = null
    // A reload can happen before the debounce timer fires, so flush any pending autosave on the way out.
    this._flushAutosaveOnExit = () => this.flushAutosave()
    window.addEventListener('pagehide', this._flushAutosaveOnExit)
    window.addEventListener('beforeunload', this._flushAutosaveOnExit)
  }

  // ---- Change notification ---------------------------------------------------------------------

  // fn(kind): 'shot' after any edit of the shot, 'status' when the status line changes, 'mode' when
  // the view or busy mode changes.
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(kind) {
    for (const fn of this.listeners) fn(kind)
  }

  changed() {
    this.revision++
    this.autosave()
    this.emit('shot')
  }

  setStatus(text) {
    this.status = text
    this.emit('status')
  }

  // Parameters changed (ring, launcher or transit rebuilt): anchored paths may have moved.
  onSceneChanged() {
    this.resolver.invalidate()
    this.overlay.invalidate()
  }

  // ---- State ----------------------------------------------------------------------------------

  // True while a fixed-step loop (render or live take) is driving frames instead of App.frame().
  get busy() { return this.mode === 'render' || this.mode === 'live' }
  // True while the camera follows the shot's path.
  get drivesCamera() {
    return this.mode === 'render' || (this.mode === 'idle' && this.viewMode === 'shot' && this.shot.camera.keyframes.length > 0)
  }
  get keyframes() { return this.shot.camera.keyframes }
  get duration() { return shotDuration(this.shot) }
  get fps() { return this.shot.output.fps }
  get playing() { return this.rate !== 0 }
  // Width / height of the output video, for framing the shot camera's view.
  get previewAspect() { return this.viewMode === 'shot' && this.mode === 'idle' ? this.shot.output.width / this.shot.output.height : null }

  get timeMap() {
    if (this._timeMapRevision !== this.revision) {
      this._timeMap = createTimeMap(this.keyframes)
      this._timeMapRevision = this.revision
    }
    return this._timeMap
  }

  simTimeAt(videoTime) {
    return this.shot.simulation.startTime + this.timeMap.simOffsetAt(videoTime)
  }

  videoTimeAt(simTime) {
    return this.timeMap.videoTimeAt(simTime - this.shot.simulation.startTime)
  }

  // The earliest playhead time (simulated time 0).
  get minPlayhead() {
    return this.videoTimeAt(0)
  }

  speedAt(videoTime) {
    return this.timeMap.speedAt(videoTime)
  }

  // ---- Time control ---------------------------------------------------------------------------

  // Moves the playhead (and the simulation clock). Returns the simulated time step taken.
  setPlayhead(videoTime) {
    this.playhead = Math.max(this.minPlayhead, videoTime)
    return this.app.clock.moveTo(Math.max(0, this.simTimeAt(this.playhead)))
  }

  jumpToSimTime(simTime) {
    this.setPlayhead(this.videoTimeAt(Math.max(0, simTime)))
  }

  play(direction = 1, { throughShot = false } = {}) {
    this.playingShot = throughShot
    this.rate = direction * this.playbackSpeed
    this._lastWall = null
    this.emit('mode')
  }

  pause() {
    this.rate = 0
    this.playingShot = false
    this.emit('mode')
  }

  togglePlay() {
    if (this.playing) this.pause()
    else this.play(1)
  }

  setPlaybackSpeed(speed) {
    this.playbackSpeed = speed
    if (this.rate !== 0) this.rate = Math.sign(this.rate) * speed
    this.emit('mode')
  }

  stepFrames(n) {
    this.pause()
    this.setPlayhead(Math.round(this.playhead * this.fps + n) / this.fps)
  }

  // Plays the whole shot through the shot camera.
  playShot() {
    this.setViewMode('shot')
    this.setPlayhead(0)
    this.setPlaybackSpeed(1)
    this.play(1, { throughShot: true })
  }

  // Called by App.frame() once per displayed frame: advances the playhead by the wall-clock time
  // (times the playback rate) and returns the simulated time step for App.step().
  tick(wallTimeMs) {
    const wallDelta = this._lastWall === null ? 0 : Math.min(MAX_REAL_STEP, Math.max(0, (wallTimeMs - this._lastWall) / 1000))
    this._lastWall = wallTimeMs
    if (this.rate === 0) return this.setPlayhead(this.playhead)
    const before = this.playhead
    let next = before + wallDelta * this.rate
    // Playing the shot (or looping it) stops at its end or starts it again; otherwise play carries on
    // through, so the simulation runs freely to find the right moment.
    const end = this.duration
    if ((this.playingShot || this.loop) && this.rate > 0 && before < end && next >= end) {
      if (this.loop) next = 0
      else { next = end; this.pause() }
    }
    else if (this.loop && this.rate < 0 && before > 0 && next <= 0) next = end
    if (next < this.minPlayhead) this.pause()
    return this.setPlayhead(next)
  }

  // ---- View -------------------------------------------------------------------------------------

  setViewMode(mode) {
    if (mode === this.viewMode) return
    this.viewMode = mode
    this.app.onResize()
    this.emit('mode')
  }

  // Puts the free camera where the shot camera is at the playhead.
  moveViewToShotCamera() {
    const pose = this.poseAt(this.playhead)
    if (pose) this.app.camera.setState(pose)
  }

  // Makes the free camera move with an anchor's object (the world anchor stops following). With
  // `aim`, the camera also turns to centre the object; otherwise the view stays as composed. With
  // `approach`, it also flies in close to the object.
  // With `capture`, the camera eases into riding along (see CameraController.follow).
  followAnchor(anchor, { aim = false, approach = false, capture = false } = {}) {
    const camera = this.app.camera
    if (isWorldAnchor(anchor)) {
      if (camera.tracker.type === 'shotAnchor') camera.stopTracking()
      this.following = null
      this.emit('mode')
      return
    }
    this.following = anchor
    const objectAt = (dt) => this.resolver.objectFrame(anchor, this.app.clock.time + dt)
    const v = (a) => a && new THREE.Vector3(...a)
    const entry = {
      type: 'shotAnchor',
      frame: 'world',
      getPosition: (dt = 0) => v(objectAt(dt)?.position),
      getFrame: (dt = 0) => {
        const f = objectAt(dt)
        return f && { forward: v(f.forward), upward: v(f.upward) }
      },
    }
    camera.follow(entry, { aim: aim || approach, approach, capture })
    this.emit('mode')
  }

  // ---- Camera path ----------------------------------------------------------------------------

  // World pose of the shot camera at video time t (null without keyframes).
  poseAt(t) {
    const simTime = this.simTimeAt(t)
    return sampleCameraPath(this.shot.camera, t, (key) => this.resolver.resolveKey(key, simTime))
  }

  // World pose of keyframe i at its own moment.
  keyframePose(i) {
    const key = this.keyframes[i]
    return key ? this.resolver.resolveKey(key, this.simTimeAt(key.time)) : null
  }

  // Called at the start of App.step(): places the shot camera before anything is animated, so the
  // objects near it get their models in this frame rather than the next.
  beforeStep() {
    this.app.camera.controls.enabled = !this.drivesCamera
    if (!this.drivesCamera) return
    const pose = this.poseAt(this.playhead)
    if (pose) this.app.camera.setState(pose)
    this.applyParameterTracks(this.playhead)
  }

  applyParameterTracks(t) {
    let changed = false
    for (const [name, track] of Object.entries(this.shot.parameterTracks ?? {})) {
      const value = sampleParameterTrack(track, t)
      if (value !== undefined && !Object.is(this.app.store.get(name), value)) {
        this.app.store.set(name, value)
        changed = true
      }
    }
    if (changed) {
      this.app.store.derive()
      this.app.applyAllParameters()
    }
  }

  // ---- Building a shot ------------------------------------------------------------------------

  createShotNow(name = 'Untitled shot') {
    const app = this.app
    return createShot({
      name,
      preset: app.presetId,
      parameters: app.store.snapshot(),
      startTime: app.clock.time,
      animationState: app.getAnimationState(),
    })
  }

  // A new, empty shot starting at the current simulated time.
  newShot() {
    const output = this.shot?.output
    this.shot = this.createShotNow(this.shot?.name)
    if (output) Object.assign(this.shot.output, output)
    this.selected = -1
    this.playhead = 0
    this.changed()
    this.setStatus('New shot: it starts at the current simulated time.')
    return this.shot
  }

  // Moves the shot's start to `simTime` (keyframes keep their times within the shot).
  setStartTime(simTime) {
    this.shot.simulation.startTime = Math.max(0, simTime)
    this.changed()
    this.setPlayhead(this.videoTimeAt(this.app.clock.time))
  }

  // Sets where the shot ends (at least one frame long).
  setDuration(videoTime) {
    const duration = Math.max(1 / this.fps, Math.round(videoTime * this.fps) / this.fps)
    if (duration === this.shot.output.duration) return
    this.shot.output.duration = duration
    this.changed()
  }

  // Where the shot's start can be moved to (video time, snapped to frames): not before simulated time
  // 0, not after the first keyframe, and leaving the shot at least a frame long.
  clampShotStart(videoTime) {
    let t = Math.max(this.minPlayhead, videoTime)
    const first = this.keyframes[0]
    if (first) t = Math.min(t, first.time)
    t = Math.min(t, this.duration - 1 / this.fps)
    return Math.round(t * this.fps) / this.fps
  }

  // Moves the shot's start to video time `videoTime` (which becomes 0). The keyframes, the end and the
  // playhead keep their simulated moments.
  moveShotStart(videoTime) {
    const d = this.clampShotStart(videoTime)
    if (d === 0) return
    this.shot.simulation.startTime = this.simTimeAt(d)
    for (const key of this.keyframes) key.time = Math.round((key.time - d) * 1e9) / 1e9
    this.shot.output.duration = Math.max(1 / this.fps, this.shot.output.duration - d)
    this.playhead -= d
    this.changed()
    this.setPlayhead(this.playhead)
  }

  setStartToNow() {
    this.setStartTime(this.app.clock.time)
  }

  // The current view, as a world pose.
  currentWorldPose() {
    return this.app.camera.getState()
  }

  // The keyframe whose settings a new keyframe at video time t inherits: the selected one, else the
  // nearest one before t, else the first.
  templateKeyframe(t) {
    const keys = this.keyframes
    if (keys[this.selected]) return keys[this.selected]
    let template = null
    for (const k of keys) if (k.time <= t) template = k
    return template ?? keys[0] ?? null
  }

  // Adds a keyframe at the playhead from the current view (or updates the one already there).
  addKeyframe() {
    const t = Math.round(this.playhead * this.fps) / this.fps
    const keys = this.keyframes
    const existing = keys.findIndex(k => Math.abs(k.time - t) < 0.5 / this.fps)
    if (existing >= 0) {
      this.selected = existing
      this.updateKeyframeFromView(existing)
      return existing
    }
    const template = this.templateKeyframe(t)
    // The new keyframe keeps the speed the shot already has here, so adding it does not change the timing.
    const key = {
      time: t,
      anchor: clone(template?.anchor ?? WORLD_ANCHOR),
      ...(template?.lookAt ? { lookAt: clone(template.lookAt) } : {}),
      speed: keys.length ? this.speedAt(t) : 1,
      ease: false,
      motion: template?.motion ?? 'auto',
      fov: this.app.camera3d.fov,
    }
    this.resolver.localizeKey(key, this.currentWorldPose(), this.simTimeAt(t))
    keys.push(key)
    keys.sort((a, b) => a.time - b.time)
    this.selected = keys.indexOf(key)
    if (t > this.shot.output.duration) this.shot.output.duration = Math.ceil(t * 10) / 10
    this.changed()
    this.setStatus(`Keyframe ${this.selected + 1} added at ${t.toFixed(2)} s.`)
    return this.selected
  }

  // Sets keyframe i's view to the current view. The view is taken relative to the keyframe's anchors
  // as they are now, so composing a shot of a moving object works at any playhead time.
  updateKeyframeFromView(i = this.selected) {
    const key = this.keyframes[i]
    if (!key) return
    key.fov = this.app.camera3d.fov
    this.resolver.localizeKey(key, this.currentWorldPose(), this.app.clock.time)
    this.changed()
    this.setStatus(`Keyframe ${i + 1} updated from the view.`)
  }

  deleteKeyframe(i = this.selected) {
    const keys = this.keyframes
    if (!keys[i]) return
    keys.splice(i, 1)
    this.selected = Math.min(i, keys.length - 1)
    this.changed()
  }

  removeLastKeyframe() {
    this.deleteKeyframe(this.keyframes.length - 1)
  }

  clearKeyframes() {
    this.keyframes.length = 0
    this.selected = -1
    this.changed()
  }

  selectKeyframe(i) {
    this.selected = i >= 0 && i < this.keyframes.length ? i : -1
    this.emit('shot')
  }

  // Selects keyframe i, moves the playhead to it and (in the free view) the camera to its view.
  goToKeyframe(i) {
    const key = this.keyframes[i]
    if (!key) return
    this.selected = i
    this.pause()
    this.setPlayhead(key.time)
    if (this.viewMode === 'free') {
      const pose = this.keyframePose(i)
      this.app.camera.setState({ ...pose, fov: key.fov })
      // Keep moving with the keyframe's object, so scrubbing from here keeps it in view.
      this.followAnchor(key.anchor ?? WORLD_ANCHOR)
    }
    this.emit('shot')
  }

  // Retimes keyframe i (keeps it selected). `final` false while dragging (no re-sort of the list UI).
  moveKeyframe(i, time) {
    const key = this.keyframes[i]
    if (!key) return
    key.time = Math.max(0, Math.round(time * this.fps) / this.fps)
    this.keyframes.sort((a, b) => a.time - b.time)
    this.selected = this.keyframes.indexOf(key)
    if (key.time > this.shot.output.duration) this.shot.output.duration = Math.ceil(key.time * 10) / 10
    this.changed()
  }

  // Changes keyframe settings. Changing its anchors keeps its view at its own moment; what changes is
  // how the view moves with the objects at other moments.
  setKeyframeProps(i, patch) {
    const key = this.keyframes[i]
    if (!key) return
    if ('anchor' in patch || 'lookAt' in patch) {
      const simTime = this.simTimeAt(key.time)
      const world = this.resolver.resolveKey(key, simTime)
      if ('anchor' in patch) key.anchor = clone(patch.anchor ?? WORLD_ANCHOR)
      if ('lookAt' in patch) {
        if (!patch.lookAt || sameAnchor(patch.lookAt, key.anchor)) delete key.lookAt
        else key.lookAt = clone(patch.lookAt)
      }
      this.resolver.localizeKey(key, world, simTime)
    }
    for (const field of ['speed', 'ease', 'motion', 'fov']) if (field in patch) key[field] = patch[field]
    if ('time' in patch) {
      this.moveKeyframe(i, patch.time)
      return
    }
    this.changed()
  }

  // Makes keyframe i happen at `simTime` without moving it in the video. The first keyframe moves the
  // shot's start. For any other, a time speed is changed: by default the previous keyframe's (so a
  // keyframe after a fast-forward keeps its own speed, typically 1x), or with `adjust: 'this'` its own.
  // Later keyframes keep their speeds, so set the moments from the first keyframe on.
  setKeyframeSimTime(i, simTime, { adjust = 'previous' } = {}) {
    const keys = this.keyframes
    const key = keys[i]
    if (!key) return
    const sim = this.shot.simulation
    if (i === 0) {
      sim.startTime = Math.max(0, sim.startTime + simTime - this.simTimeAt(key.time))
      this.changed()
      return
    }
    const j = adjust === 'this' ? i : i - 1
    const { speed, exact } = solveSpeedFor(keys, j, i, simTime - sim.startTime)
    keys[j].speed = Number(speed.toPrecision(9))
    this.changed()
    if (exact) this.setStatus(`Keyframe ${i + 1} is now at simulated time ${simTime.toFixed(2)} s (keyframe ${j + 1}'s time speed is ${Number(speed.toPrecision(3))}x).`)
    else this.setStatus(`Keyframe ${i + 1} cannot reach simulated time ${simTime.toFixed(2)} s by changing keyframe ${j + 1}'s time speed; it is as close as it gets. Move the keyframes further apart, or change other speeds.`)
  }

  setOutput(patch) {
    Object.assign(this.shot.output, patch)
    if ('width' in patch || 'height' in patch) this.app.onResize()
    this.changed()
  }

  setName(name) {
    this.shot.name = name
    this.changed()
  }

  setInterpolation(interpolation) {
    this.shot.camera.interpolation = interpolation
    this.changed()
  }

  setCornerSeconds(seconds) {
    this.shot.camera.cornerSeconds = Math.max(0, seconds)
    this.changed()
  }

  // Events (launch stages, stops, elevator departures) for an anchor around the playhead.
  eventsFor(anchor, before = 3600, after = 7200) {
    const now = this.app.clock.time
    return this.resolver.events(anchor, Math.max(0, now - before), now + after)
  }

  // ---- Choosing objects with the mouse ----------------------------------------------------------

  // The next click in the view picks the object nearest to it (within PICK_RADIUS_PX) and passes its
  // anchor to onPick (null if there was nothing there). Escape cancels.
  startPick(onPick, types) {
    this.cancelPick()
    const canvas = this.app.renderer.domElement
    let down = null
    const onDown = (event) => { if (event.button === 0) down = [event.clientX, event.clientY] }
    const onUp = (event) => {
      if (event.button !== 0 || !down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4) return
      const anchor = this.pickAt(event.clientX, event.clientY, types)
      this.cancelPick()
      onPick(anchor)
    }
    const onKey = (event) => { if (event.code === 'Escape') { this.cancelPick(); onPick(undefined) } }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    canvas.classList.add('picking')
    this._pick = () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
      canvas.classList.remove('picking')
    }
    this.emit('mode')
  }

  cancelPick() {
    this._pick?.()
    this._pick = null
    this.emit('mode')
  }

  get picking() { return !!this._pick }

  // radiusPx: how near the pointer (pixels); maxDistance: how far from the camera (m), e.g. no further than
  // the surface under the pointer, so objects behind it are not picked.
  pickAt(clientX, clientY, types, { radiusPx = PICK_RADIUS_PX, maxDistance = Infinity } = {}) {
    const camera = this.app.camera3d
    const rect = this.app.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(2 * (clientX - rect.left) / rect.width - 1, 1 - 2 * (clientY - rect.top) / rect.height)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)
    const pixelsPerRadian = camera.projectionMatrix.elements[5] * rect.height / 2
    const hit = this.resolver.nearestToRay(this.app.clock.time, raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(), radiusPx / pixelsPerRadian, types, maxDistance)
    return hit?.anchor ?? null
  }

  // The moving objects within radiusPx of the pointer and maxDistance of the camera, nearest on screen
  // first: [{ anchor, key, type, position (THREE.Vector3), distance (m), px (pixels from the pointer) }].
  objectsNear(clientX, clientY, radiusPx, maxDistance = Infinity) {
    const camera = this.app.camera3d
    const rect = this.app.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(2 * (clientX - rect.left) / rect.width - 1, 1 - 2 * (clientY - rect.top) / rect.height)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)
    const { origin, direction } = raycaster.ray
    const pixelsPerRadian = camera.projectionMatrix.elements[5] * rect.height / 2
    const out = []
    for (const c of this.resolver.candidates(this.app.clock.time)) {
      const position = new THREE.Vector3(...c.position)
      const d = position.clone().sub(origin)
      const distance = d.length()
      if (!(distance > 0) || distance > maxDistance) continue
      const px = d.angleTo(direction) * pixelsPerRadian
      if (px <= radiusPx) out.push({ anchor: c.anchor, key: anchorKey(c.anchor), type: c.anchor.type, position, distance, px })
    }
    return out.sort((a, b) => a.px - b.px)
  }

  // The object of `type` nearest to the middle of the view (or, failing that, to the camera).
  nearestAnchor(type) {
    const camera = this.app.camera3d
    const origin = camera.getWorldPosition(new THREE.Vector3()).toArray()
    const direction = camera.getWorldDirection(new THREE.Vector3()).toArray()
    const now = this.app.clock.time
    return (this.resolver.nearestToRay(now, origin, direction, Math.PI / 6, [type]) ?? this.resolver.nearestToPoint(now, origin, [type]))?.anchor ?? null
  }

  // The object of `type` nearest to the middle of keyframe i's view, at the keyframe's own moment.
  nearestAnchorForKeyframe(i, type) {
    const key = this.keyframes[i]
    if (!key) return null
    const simTime = this.simTimeAt(key.time)
    const pose = this.resolver.resolveKey(key, simTime)
    const direction = pose.target.map((x, j) => x - pose.position[j])
    return (this.resolver.nearestToRay(simTime, pose.position, direction, Math.PI / 6, [type]) ??
      this.resolver.nearestToPoint(simTime, pose.target, [type]))?.anchor ?? null
  }

  // ---- Fixed-step rendering ---------------------------------------------------------------------

  async waitForTerrain() {
    const planet = this.app.planet
    const start = performance.now()
    for (;;) {
      planet.update(this.app.camera3d)
      const stats = planet.getDebugStats()
      if (!(stats.queue > 0 || stats.inflight > 0 || stats.pendingUploads > 0)) return
      if (performance.now() - start > TERRAIN_WAIT_TIMEOUT_MS) throw new Error('Timed out waiting for terrain to finish loading and uploading.')
      await sleep(30)
    }
  }

  // The supersampling factor a recording at `output` gets on this GPU (see Supersampler.js).
  supersampleFactor(output) {
    return clampSupersample(output.supersample ?? 1, output.width, output.height, maxRenderSize(this.app.renderer))
  }

  // A stable, output-sized CPU canvas, never the live WebGL drawing buffer.
  frameCanvas(output) {
    this.outputCanvas ??= document.createElement('canvas')
    this.outputCanvas.width = output.width
    this.outputCanvas.height = output.height
    return this.outputCanvas
  }

  // Runs frames at a fixed step. perFrame(i, s) sets up sub-frame s of frame i and returns the
  // simulated time step to take, or false (at s = 0) to stop. subFrames(i) is how many sub-frames
  // frame i averages (motion blur, see MotionBlur.js); `blur` allocates the buffers for that.
  // `supersample` renders each sub-frame at that many times the resolution (Supersampler.js).
  // afterFrame(i, canvas) is called while frame i is finished on `canvas` (the one to encode).
  async runFixedStep({ width, height, fps, waitForTerrain, perFrame, recorder, progressLabel, subFrames = () => 1, blur: useBlur = false, afterFrame = null, supersample = 1 }) {
    const app = this.app
    if (this.recordingSize) throw new Error('A fixed-step capture is already running.')
    const factor = clampSupersample(supersample, width, height, maxRenderSize(app.renderer))
    const previousBuildBudget = PixelLOD.buildBudget
    const markers = [app.camera.trackingMarker, app.camera.targetMarker, app.camera.orbitMarker]
    const markerVisibility = markers.map(m => m.visible)
    let progress, blur, supersampler, capture
    let lastYield = performance.now()
    this.recordingSize = { width, height, pixelRatio: factor }
    try {
      // (Parts of the launcher are fitted to the terrain as it loads: see launcher.updateTerrainFits.)
      await app.launchSystem?.terrainReady
      app.renderer.setAnimationLoop(null)
      app.setRenderSize(width, height, { pixelRatio: factor })
      app.clock.setFixedStep(1 / fps)
      PixelLOD.buildBudget = Infinity
      app.quality.applyForRecording()
      StructureLines.setPixelScale(factor)
      if (app.clouds) app.clouds.pixelScale = factor
      markers.forEach(m => { m.visible = false })
      progress = new ProgressOverlay(() => this.stop())
      blur = useBlur ? new MotionBlur(app.renderer) : null
      blur?.begin(width, height)
      const canvas = this.frameCanvas({ width, height })
      supersampler = factor > 1 ? new Supersampler(app.renderer, canvas) : null
      supersampler?.begin(width, height)
      capture = supersampler?.capture ?? new FrameCapture(app.renderer, canvas, width, height)
      frames: for (let i = 0; ; i++) {
        let n = 1
        for (let s = 0; s < n; s++) {
          if (this.cancelRequested) break frames
          const dt = perFrame(i, s)
          if (dt === false) break frames
          if (s === 0) n = subFrames(i)
          app.step(i === 0 && s === 0 ? 0 : dt)
          // The sub-frames of one frame are close together; their terrain is the first one's.
          if (waitForTerrain && s === 0) await this.waitForTerrain()
          app.prepareRender()
          let timeout
          try {
            await Promise.race([
              PixelLOD.prepareScene(app.scene, app.camera3d),
              new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Timed out waiting for scene geometry.')), TERRAIN_WAIT_TIMEOUT_MS) }),
            ])
          }
          finally { clearTimeout(timeout) }
          if (this.cancelRequested) break frames
          capture.assertSize()
          app.render({ prepared: true })
          supersampler?.resolve()
          if (blur) {
            blur.add(s === 0, 1 / n)
            // Keep the page (and the Stop button) responsive through long runs of sub-frames, without
            // waiting for a display frame each time.
            if (performance.now() - lastYield > 100) {
              progress.update(`${progressLabel(i)}, sub-frame ${s + 1} / ${n}`)
              await sleep(0)
              lastYield = performance.now()
            }
          }
        }
        if (blur) blur.present()
        capture.capture()
        afterFrame?.(i, canvas)
        if (recorder) await recorder.addFrame()
        progress.update(progressLabel(i))
        // Yield so the page (and the live-take camera controls) stay responsive.
        await nextFrame()
        lastYield = performance.now()
      }
    }
    finally {
      blur?.dispose()
      supersampler?.dispose()
      StructureLines.setPixelScale(1)
      if (app.clouds) app.clouds.pixelScale = 1
      progress?.remove()
      markers.forEach((m, i) => { m.visible = markerVisibility[i] })
      PixelLOD.buildBudget = previousBuildBudget
      app.clock.setFixedStep(null)
      this.recordingSize = null
      app.quality.apply()
      app.onResizeAfterRecording()
      app.renderer.setAnimationLoop(() => app.frame())
    }
  }

  // `writable` (optional): a WritableStream to write the file to (no save dialog; see VideoRecorder).
  async createRecorder(output, fileName, { canvas = this.frameCanvas(output), writable = null, saveToDisk = this.prefs.saveToDisk } = {}) {
    const settings = { width: output.width, height: output.height, fps: output.fps }
    const recorder = new VideoRecorder({
      canvas,
      ...settings,
      codec: output.codec,
      container: output.container,
      bitrate: 0,
      fileName,
      saveToDisk,
      writable,
    })
    if (!(await recorder.prepareTarget())) return null
    const codec = await resolveCodec(output.codec, settings)
    if (!codec) throw new Error('No video encoder is available in this browser for that resolution.')
    recorder.options.bitrate = output.bitrateMbps ? output.bitrateMbps * 1e6 : defaultBitrate(codec, output.width, output.height, output.fps)
    if (codec !== output.codec) console.info(`${CODEC_LABELS[output.codec]} encoding is not available here; using ${CODEC_LABELS[codec]}.`)
    await recorder.start(codec)
    return recorder
  }

  // Brings the shot's record of the scene up to date: the parameters (including the sun) and
  // animation state as they are now, which is what the shot is being edited against.
  syncShotFromApp() {
    const shot = this.shot
    const app = this.app
    const output = shot.output
    output.width = evenDimension(output.width)
    output.height = evenDimension(output.height)
    shot.preset = app.presetId
    shot.parameters = app.store.snapshot()
    shot.simulation.animationState = app.getAnimationState()
  }

  async renderShot() {
    if (this.mode !== 'idle') return
    if (!isRecordingSupported()) { this.setStatus('Recording needs a browser with WebCodecs (Chrome, Edge, Safari 17+, Firefox 130+).'); return }
    const shot = this.shot
    if (!shot.camera.keyframes.length) { this.setStatus('Add at least one keyframe before rendering.'); return }
    this.syncShotFromApp()
    const output = shot.output
    let recorder
    try {
      recorder = await this.createRecorder(output, slug(shot.name))
    }
    catch (err) {
      this.setStatus(`Could not start recording: ${err.message}`)
      return
    }
    if (!recorder) return
    const failed = await this.renderFrames(recorder)
    await this.finishRecorder(recorder, failed)
  }

  // Renders `shot` without asking anything (the render queue and the command-line renderer): loads it
  // (its preset must be the current one), lets the scene settle for `settleSeconds`, renders it at the
  // fixed step and encodes it into `writable` (a WritableStream, see VideoRecorder; null buffers the
  // file in memory and downloads it). onProgress({ frame, frames }) after each frame. Resolves to
  // { fileName, frames, codec, bytes }; throws if it fails or is stopped.
  async renderShotUnattended(shot, { writable = null, fileName = slug(shot.name), settleSeconds = 0, onProgress = null } = {}) {
    if (this.mode !== 'idle') throw new Error('Another recording is running.')
    if (!isRecordingSupported()) throw new Error('This browser has no WebCodecs video encoder.')
    if (shot.preset !== this.app.presetId) throw new Error(`The shot needs preset "${shot.preset}", but "${this.app.presetId}" is loaded.`)
    if (!shot.camera.keyframes.length) throw new Error('The shot has no keyframes.')
    this.pause()
    this.loadShot(clone(shot))
    this.setViewMode('shot')
    const output = this.shot.output
    output.width = evenDimension(output.width)
    output.height = evenDimension(output.height)
    // Things that load in the background (the satellite cloud snapshot, models) should be there before
    // the first frame, so every render of the shot starts the same way.
    const settleEnd = performance.now() + settleSeconds * 1000
    while (performance.now() < settleEnd || (this.app.clouds?.enabled && !this.app.clouds.realClouds?.ready && performance.now() < settleEnd + 30000)) await sleep(100)
    const recorder = await this.createRecorder(output, fileName, { writable, saveToDisk: false })
    if (!recorder) throw new Error('Could not open the output file.')
    const frames = Math.max(1, Math.round(shotDuration(this.shot) * output.fps))
    const failed = await this.renderFrames(recorder, { afterFrame: (i) => onProgress?.({ frame: i + 1, frames }) })
    if (failed || this.cancelRequested) {
      await recorder.cancel().catch(() => {})
      throw failed ?? new Error('Stopped.')
    }
    const result = await recorder.finish()
    this.setStatus(`Saved ${result.fileName}: ${recorder.frameCount} frames, ${CODEC_LABELS[recorder.options.codec]}.`)
    return { ...result, frames: recorder.frameCount, codec: recorder.options.codec }
  }

  // Sub-frames for video frame i under the shot's motion blur settings (1 without blur).
  subFramesFor(i) {
    const o = this.shot.output
    if (o.motionBlur === 'fixed') return o.motionBlurSamples
    if (o.motionBlur !== 'adaptive') return 1
    // The shot camera's poses across the frame's shutter interval.
    const poses = subFrameTimes(i, o.fps, 9, o.shutterAngle).map(t => this.poseAt(t)).filter(Boolean)
    const fov = THREE.MathUtils.degToRad(poses[0]?.fov ?? this.app.camera3d.fov)
    return adaptiveSubFrames(poses, {
      maxStep: o.motionBlurMaxStep,
      maxPixels: o.motionBlurMaxPixels,
      pixelsPerRadian: o.height / 2 / Math.tan(fov / 2),
      planetRadius: this.app.planetRadius,
      minSamples: o.motionBlurSamples,
      maxSamples: o.motionBlurMaxSamples,
    })
  }

  // Sub-frames the whole shot needs: { total, most, frames }.
  estimateSubFrames() {
    const frames = Math.max(1, Math.round(this.duration * this.fps))
    let total = 0
    let most = 0
    for (let i = 0; i < frames; i++) {
      const n = this.subFramesFor(i)
      total += n
      most = Math.max(most, n)
    }
    return { total, most, frames }
  }

  // Renders frames [from, to) of the shot through `recorder` (null: render without encoding), calling
  // afterFrame(i) while each finished frame is on the canvas. Returns the error that stopped it, if any.
  async renderFrames(recorder, { from = 0, to = Infinity, afterFrame = null } = {}) {
    const shot = this.shot
    const output = shot.output
    const playhead = this.playhead
    this.pause()
    this.mode = 'render'
    this.cancelRequested = false
    this.emit('mode')
    const frames = Math.min(to, Math.max(1, Math.round(shotDuration(shot) * output.fps)))
    const blurred = (output.motionBlur ?? 'off') !== 'off'
    const ss = this.supersampleFactor(output)
    const ssLabel = ss > 1 ? `, ${ss}x${ss} supersampled` : ''
    const waiting = this.queue.running ? this.queue.counts.pending : 0
    const queueLabel = this.queue.running ? `Render queue (${waiting} more waiting) · ` : ''
    let n = 1
    let times = [0]
    let failed = null
    try {
      await this.runFixedStep({
        ...output,
        recorder,
        blur: blurred,
        supersample: output.supersample ?? 1,
        subFrames: () => n,
        afterFrame: afterFrame && ((k, canvas) => afterFrame(from + k, canvas)),
        perFrame: (k, s) => {
          const i = from + k
          if (i >= frames) return false
          if (s === 0) {
            n = blurred ? this.subFramesFor(i) : 1
            times = n > 1 ? subFrameTimes(i, output.fps, n, output.shutterAngle) : [i / output.fps]
          }
          return this.setPlayhead(times[s])
        },
        progressLabel: (k) => `${queueLabel}Rendering "${shot.name}": frame ${from + k + 1} / ${frames}${recorder ? ` (${CODEC_LABELS[recorder.options.codec]} ${output.width}x${output.height} @ ${output.fps} fps${ssLabel}${n > 1 ? `, ${n} sub-frames` : ''})` : ''}`,
      })
    }
    catch (err) {
      failed = err
    }
    this.mode = 'idle'
    this.setPlayhead(playhead)
    this.emit('mode')
    return failed
  }

  // Renders the video frame at the playhead exactly as a recording would (with motion blur) and returns
  // it as a PNG data URL, or null.
  async previewFrame() {
    if (this.mode !== 'idle' || !this.keyframes.length) return null
    const i = Math.max(0, Math.round(this.playhead * this.fps))
    let image = null
    const failed = await this.renderFrames(null, { from: i, to: i + 1, afterFrame: (k, canvas) => { image = canvas.toDataURL('image/png') } })
    if (failed) this.setStatus(`Preview failed: ${failed.message}`)
    return image
  }

  async finishRecorder(recorder, failed) {
    if (!recorder) return
    if (failed || this.cancelRequested) {
      await recorder.cancel()
      this.setStatus(failed ? `Recording failed: ${failed.message}` : 'Recording cancelled.')
      if (failed) console.error(failed)
      return
    }
    const result = await recorder.finish()
    const size = result.bytes ? ` (${(result.bytes / 1e6).toFixed(1)} MB)` : ''
    this.setStatus(`Saved ${result.fileName}${size}: ${recorder.frameCount} frames, ${CODEC_LABELS[recorder.options.codec]}.`)
  }

  // ---- Live take ------------------------------------------------------------------------------

  async startLiveTake() {
    if (this.mode !== 'idle') return
    this.pause()
    this.setViewMode('free')
    const shot = this.newShot()
    shot.camera.interpolation = 'linear'
    const output = shot.output
    let recorder = null
    if (this.prefs.encodeLiveTake) {
      if (!isRecordingSupported()) { this.setStatus('This browser cannot encode video; recording the camera path only.') }
      else {
        try {
          recorder = await this.createRecorder(output, slug(shot.name), { canvas: this.app.renderer.domElement })
          if (!recorder) return
        }
        catch (err) {
          this.setStatus(`Could not start recording: ${err.message}`)
          return
        }
      }
    }
    this.mode = 'live'
    this.cancelRequested = false
    this.emit('mode')
    const baseline = this.app.store.snapshot()
    let frames = 0
    let failed = null
    try {
      await this.runFixedStep({
        ...output,
        waitForTerrain: false,
        recorder,
        perFrame: (i) => {
          if (this.stopRequested) return false
          const t = i / output.fps
          const dt = this.app.clock.moveTo(shot.simulation.startTime + t)
          this.playhead = t
          shot.camera.keyframes.push({ time: t, ...this.app.camera.getState() })
          const current = this.app.store.snapshot()
          for (const [k, v] of Object.entries(current)) {
            if (Object.is(v, baseline[k]) && !shot.parameterTracks[k]) continue
            const track = (shot.parameterTracks[k] ??= [{ time: 0, value: baseline[k] }])
            if (!Object.is(track[track.length - 1].value, v)) track.push({ time: t, value: v })
          }
          frames = i + 1
          return dt
        },
        progressLabel: (i) => `Live take: ${(i / output.fps).toFixed(2)} s recorded. Fly the camera; press Stop to finish.`,
      })
    }
    catch (err) {
      failed = err
    }
    this.stopRequested = false
    this.mode = 'idle'
    output.duration = frames / output.fps
    this.changed()
    this.emit('mode')
    if (recorder) await this.finishRecorder(recorder, failed)
    else this.setStatus(`Live take captured: ${frames} frames. Export the shot to keep it.`)
  }

  stop() {
    if (this.mode === 'live') this.stopRequested = true
    else this.cancelRequested = true
    // (Stop while the render queue runs stops the queue.)
    if (this.queue.running) this.queue.stop()
  }

  // ---- Files ----------------------------------------------------------------------------------

  // Autosave keeps the working shot in localStorage so keyframing work survives a browser reload. It is
  // a recovery copy, not a substitute for exporting: writes are debounced so a burst of edits (dragging
  // a keyframe, a live take) costs one write, and it is flushed when the page is about to unload.
  autosave() {
    if (this._autosaveTimer) return
    this._autosaveTimer = setTimeout(() => {
      this._autosaveTimer = null
      this.writeAutosave()
    }, AUTOSAVE_DELAY_MS)
  }

  flushAutosave() {
    if (!this._autosaveTimer) return
    clearTimeout(this._autosaveTimer)
    this._autosaveTimer = null
    this.writeAutosave()
  }

  writeAutosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeShot(this.shot))
    }
    catch { /* storage full or unavailable: the recovery copy is best-effort */ }
  }

  // Restores the autosaved working shot after a reload, when it belongs to the current preset and has
  // keyframes worth recovering. Corrupt or empty autosaves are ignored.
  restoreAutosave() {
    let text
    try { text = localStorage.getItem(AUTOSAVE_KEY) }
    catch { return false }
    if (!text) return false
    let shot
    try { shot = parseShot(text) }
    catch { return false }
    if (shot.preset !== this.app.presetId || !shot.camera.keyframes.length) return false
    this.loadShot(shot)
    this.setStatus('Recovered your unsaved shot from the previous session. Export it to keep it, or start a new shot.')
    return true
  }

  exportShot() {
    this.syncShotFromApp()
    downloadText(serializeShot(this.shot), slug(this.shot.name) + SHOT_FILE_EXTENSION, 'application/json')
  }

  chooseShotFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) await this.importShotText(await file.text())
    }
    input.click()
  }

  async importShotText(text) {
    let shot
    try {
      shot = parseShot(text)
    }
    catch (err) {
      this.setStatus(err.message)
      return
    }
    if (shot.preset !== this.app.presetId) {
      // Presets configure construction-time options, so switching needs a reload.
      sessionStorage.setItem(PENDING_SHOT_KEY, text)
      this.app.switchPreset(shot.preset)
      return
    }
    this.loadShot(shot)
  }

  // Restores the parameters and simulation state the shot was made with.
  restoreStart(shot) {
    const app = this.app
    const current = app.store.snapshot()
    const changed = Object.keys(shot.parameters).some(k => !Object.is(shot.parameters[k], current[k]))
    const unknown = app.store.restore(shot.parameters)
    if (unknown.length) console.warn('Shot contains parameters this version does not know:', unknown)
    if (changed) app.applyAllParameters()
    app.setAnimationState(shot.simulation.animationState)
    app.stopInteractiveAnimations()
  }

  loadShot(shot) {
    this.shot = validateShot(shot)
    this.selected = -1
    this.restoreStart(this.shot)
    this.changed()
    this.setPlayhead(0)
    const first = this.poseAt(0)
    if (first) this.app.camera.setState(first)
    this.setStatus('Shot loaded. Play it with the shot camera, or render it.')
  }

  // Called when the page has started: loads a shot imported across a preset switch, and carries on
  // with a render queue run.
  async resumePendingShot() {
    this.queue.resumeSoon()
    const text = sessionStorage.getItem(PENDING_SHOT_KEY)
    if (!text) {
      this.restoreAutosave()
      return
    }
    sessionStorage.removeItem(PENDING_SHOT_KEY)
    try {
      this.loadShot(parseShot(text))
    }
    catch (err) {
      this.setStatus(err.message)
    }
  }
}

class ProgressOverlay {
  constructor(onCancel) {
    this.element = document.createElement('div')
    this.element.className = 'recording-overlay'
    this.label = document.createElement('span')
    const button = document.createElement('button')
    button.textContent = 'Stop'
    button.addEventListener('click', onCancel)
    this.element.append(this.label, button)
    document.body.appendChild(this.element)
  }

  update(text) {
    this.label.textContent = text
  }

  remove() {
    this.element.remove()
  }
}
