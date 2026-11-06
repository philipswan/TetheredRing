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
  VideoRecorder, resolveCodec, evenDimension, isRecordingSupported, CODEC_LABELS, CONTAINERS, downloadBlob,
} from '../capture/VideoRecorder.js'
import { downloadText } from '../app/exports.js'
import { MotionBlur, subFrameTimes, shutterTimes, adaptiveSubFrames } from '../capture/MotionBlur.js'
import { Supersampler, clampSupersample, maxRenderSize } from '../capture/Supersampler.js'
import { FrameCapture } from '../capture/FrameCapture.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { StructureLines } from '../scene/structureLines.js'
import { RenderQueueRunner } from './RenderQueueRunner.js'
import { RenderJob, DirectoryStorage, renderFolderName, assertRenderProject, matchesLegacyRenderShot, canonical } from '../capture/RenderJob.js'
import { SegmentedRecorder, SegmentReplacementRecorder, assembleRender, inspectSegment } from '../capture/SegmentedRecorder.js'
import { RenderReview, outputFolderPath, reviewVideoPath, reviewVideoName } from '../capture/RenderReview.js'
import { RENDER_BUILD_ID } from 'virtual:render-build'
import { pendingWork, finishedWork } from '../core/PendingWork.js'
import { randomUUID } from '../utils/randomUUID.js'

const PENDING_SHOT_KEY = 'tetheredRing.pendingShot'
const AUTOSAVE_KEY = 'tetheredRing.shotAutosave'
const AUTOSAVE_DELAY_MS = 1000 // coalesce bursts of edits into one write
const TERRAIN_WAIT_TIMEOUT_MS = 15000
const SETTLE_STALL_MS = 60000 // settleScene gives up after this long without anything arriving
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
      showPath: false,
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
    this.review = new RenderReview()
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
    if (this.renderJob && this.renderJob.manifest.shot.project?.id !== this.shot.project?.id) this.clearProjectRender()
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
  get busy() { return !!this._renderOperation || this.mode === 'render' || this.mode === 'live' }
  get hasProject() { return !!this.shot.project }
  get projectRecord() {
    const records = this.queue.projectRecords
    const id = this.shot.project?.id
    return records && Object.hasOwn(records, id) ? records[id] : null
  }
  get currentRenderJob() {
    const id = this.shot.project?.id
    return id && this.renderJob?.manifest.shot.project?.id === id ? this.renderJob : null
  }
  get projectRenderRecord() {
    return (this._renderDiscovery?.projectId === this.shot.project?.id ? this._renderDiscovery : null) ??
      this.projectRecord?.lastRender ?? null
  }

  clearProjectRender() {
    this.renderJob = null
    this.renderRoot = null
    this.renderRootPath = ''
    this.renderFrame = null
    this._renderDiscovery = null
    if (this.review) this.review.requested = false
  }

  async restoreProjectRender() {
    const projectId = this.shot.project?.id
    await this.queue.ready
    if (!projectId || this.shot.project?.id !== projectId || this.busy) return
    let record = this.projectRenderRecord
    const directory = this.projectRecord?.directory
    const legacy = this.queue.legacyRender
    if (!record && legacy?.directory) {
      // The old global pointer is only a candidate. Link it through a known project directory or
      // a readable manifest with the current project id, then run the normal ownership checks.
      const sameDirectory = directory && (directory === legacy.directory || await directory.isSameEntry(legacy.directory))
      if (sameDirectory) record = legacy
      else if (!legacy.directory.queryPermission || await legacy.directory.queryPermission({ mode: 'readwrite' }) === 'granted') {
        try {
          const saved = await RenderJob.read(new DirectoryStorage(legacy.directory))
          if (saved && (saved.manifest.shot.project?.id === projectId || matchesLegacyRenderShot(saved.manifest.shot, this.shot))) record = legacy
        }
        catch {
          // An unreadable, unassociated legacy pointer provides no evidence of this project's render.
        }
      }
    }
    if (this.shot.project?.id !== projectId || this.busy) return
    if (!record && !directory) return
    record ??= { directory, root: directory, rootPath: this.shot.project.outputPath ?? '', name: this.shot.name }
    if (record === legacy) record = { ...record, fromLegacySession: true }
    try { await this.loadRenderRecord(record, false, projectId) }
    catch (error) {
      if (['NotAllowedError', 'SecurityError'].includes(error.name) && this.shot.project?.id === projectId && !this.busy) {
        this.deferRenderDiscovery(record, projectId)
        return
      }
      throw error
    }
  }

  deferRenderDiscovery(record, projectId, legacyJob = null) {
    this._renderDiscovery = {
      ...record, projectId, name: record.name ?? this.shot.name, needsDiscovery: true,
      ...(legacyJob ? { needsMigration: true, savedFrames: legacyJob.savedFrames, frames: legacyJob.manifest.frames } : {}),
    }
    this.emit('renderJob')
  }

  async checkPreviousRender() {
    if (this.busy || this._projectIO || !this.hasProject || !this.queue.legacyRender) return
    this._projectIO = true
    this.emit('project')
    try { await this.loadRenderRecord({ ...this.queue.legacyRender, fromLegacySession: true }) }
    catch (error) { console.error(error); this.setStatus(`Could not recover the previous render: ${error.message}`) }
    finally { this._projectIO = false; this.emit('project') }
  }

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
    if (this.busy || this._projectIO) return
    const output = this.shot?.output
    this.shot = this.createShotNow(this.shot?.name)
    if (output) Object.assign(this.shot.output, output)
    this.ensureProject()
    this.clearProjectRender()
    this.selected = -1
    this.playhead = 0
    this.changed()
    this.setStatus('New shot: it starts at the current simulated time.')
    return this.shot
  }

  ensureProject() {
    this.shot.project ??= { id: randomUUID() }
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
    this.ensureProject()
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

  get regenerationWindow() {
    return this.shot.regenerateWindow ?? { enabled: false, start: 0, end: this.duration }
  }

  setRegenerationWindow(patch) {
    if (this.busy || this._projectIO) return
    const next = { ...this.regenerationWindow, ...patch }
    if ((next.continueUnfinished !== undefined && typeof next.continueUnfinished !== 'boolean') ||
        typeof next.enabled !== 'boolean' || !Number.isFinite(next.start) || next.start < 0 || !Number.isFinite(next.end) || next.end < 0) return
    this.shot.regenerateWindow = next
    this.changed()
  }

  regenerateWindow() {
    if (!this.regenerationWindow.enabled) { this.setStatus('Enable Regenerate window first.'); return }
    return this.resumeRender()
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

  // Waits until nothing that changes what is drawn is still loading or being built: the terrain the camera needs now
  // (Planet.pendingWork), and models, textures, fixed ground data and scenery (PendingWork.js). If anything was, the
  // scene is stepped and prepared again at the same moment (app.step(0), app.prepareRender(); every animated system
  // is a function of the time) until that leaves nothing pending, so every system has used what arrived. Called for
  // every sub-frame, after its step and prepareRender: what is drawn must not depend on how long any load took.
  // (A slow wait, with many loads, carries on as long as some finish: it gives up only after SETTLE_STALL_MS without
  // any progress.)
  async settleScene() {
    const pending = () => (this.app.planet?.pendingWork() ?? 0) + pendingWork()
    if (!pending()) return
    const progress = () => `${pending()} ${finishedWork()} ${this.app.planet?.getDebugStats().loadedTiles ?? 0}`
    let last = progress()
    let lastChange = performance.now()
    for (;;) {
      await sleep(30)
      this.app.step(0)
      this.app.prepareRender()
      if (!pending()) return
      const now = progress()
      if (now !== last) { last = now; lastChange = performance.now() }
      else if (performance.now() - lastChange > SETTLE_STALL_MS) throw new Error('Gave up waiting for terrain, models or scenery to finish loading: nothing has arrived for a minute.')
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
      progress = new ProgressOverlay(this.mode === 'live' ? () => this.stop() : null)
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
          app.prepareRender()
          if (waitForTerrain) await this.settleScene()
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
            supersampler?.restoreDisplay()
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
        supersampler?.restoreDisplay()
        afterFrame?.(i, canvas)
        if (recorder) await recorder.addFrame()
        if (recorder === this.activeRecorder && this.review.requested) {
          try { await this.review.service(recorder, () => this.presentReviewVideo(recorder.job)) }
          finally { this.emit('renderJob') }
        }
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
    const settings = { width: output.width, height: output.height, fps: output.fps, bitrate: output.bitrateMbps ? output.bitrateMbps * 1e6 : null }
    const recorder = new VideoRecorder({
      canvas,
      ...settings,
      codec: output.codec,
      container: output.container,
      fileName,
      saveToDisk,
      writable,
    })
    if (!(await recorder.prepareTarget())) return null
    const codec = await resolveCodec(output.codec, settings)
    if (!codec) throw new Error('No video encoder supports the requested quality at this resolution. Try another codec or a positive bitrate override.')
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
    if (this.busy || this._projectIO) return
    if (this.regenerationWindow.enabled) return this.regenerateWindow()
    this._projectIO = true
    this.emit('project')
    try {
      await this.queue.ready
      const directory = this.projectRecord?.directory
      if (!this.shot.project?.renderFolder || !directory) {
        const message = 'Choose a Video Output Folder in Shot settings before rendering video. If this project was opened in another browser, select its parent folder again.'
        this.setStatus(message)
        window.alert(message)
        return
      }
      if (!isRecordingSupported()) { this.setStatus('Recording needs a browser with WebCodecs (Chrome, Edge, Safari 17+, Firefox 130+).'); return }
      const shot = this.shot
      if (!shot.camera.keyframes.length) { this.setStatus('Add at least one keyframe before rendering.'); return }
      this.syncShotFromApp()
      if (directory.requestPermission && await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow access to the project render folder before rendering.')
      this._projectIO = false
      await this.renderShotUnattended(clone(shot), { directory, storage: new DirectoryStorage(directory) })
    }
    catch (err) {
      if (err.name !== 'AbortError') console.error('Rendering failed:', err)
      this.setStatus(`Rendering stopped: ${err.message}`)
    }
    finally { this._projectIO = false; this.emit('project') }
  }

  async outputFolder(interactive = false) {
    await this.queue.ready
    if (!this.queue.folder) {
      if (this.queue.supportsFolders) {
        if (!interactive) throw new Error('Choose an output folder before rendering.')
        await this.queue.chooseFolder()
        if (!this.queue.folder) return null
      }
      else {
        if (!navigator.storage?.getDirectory) throw new Error('This browser cannot store resumable render segments.')
        this.queue.folder = await navigator.storage.getDirectory()
        this.setStatus('Segments are stored in browser storage. Export the saved video to keep an external copy.')
      }
    }
    if (this.queue.folder.queryPermission && !(await this.queue.ensureFolderAccess(interactive))) {
      throw new Error('Folder access is required before rendering can continue.')
    }
    return this.queue.folder
  }

  async rememberRender(job, root = this.renderRoot, rootPath) {
    if (job.manifest.shot.project) assertRenderProject(job.manifest.shot, this.shot)
    if (rootPath !== undefined) this.renderRootPath = rootPath
    else if (root !== this.renderRoot) {
      const sameFolder = root && this.queue.folder && (root === this.queue.folder || await root.isSameEntry(this.queue.folder))
      this.renderRootPath = sameFolder ? this.queue.folderPath : ''
    }
    this.renderJob = job
    this.renderRoot = root
    const projectId = job.manifest.shot.project?.id
    if (projectId && job.storage.directory) {
      const previous = Object.hasOwn(this.queue.projectRecords, projectId) ? this.queue.projectRecords[projectId] : null
      const lastRender = { directory: job.storage.directory, root, rootPath: this.renderRootPath ?? '', name: job.manifest.shot.name }
      this.queue.projectRecords = { ...this.queue.projectRecords, [projectId]: { ...previous, lastRender } }
      await this.queue.save()
    }
    this.emit('renderJob')
  }

  async openRender() {
    if (this.busy || this._projectIO || !this.hasProject) return
    this._projectIO = true
    this.emit('project')
    try {
      if (!window.showDirectoryPicker) throw new Error('Use Resume for renders saved in this browser.')
      const directory = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'videos' })
      await this.loadRenderRecord({ directory, root: null })
    }
    catch (error) {
      if (error.name !== 'AbortError') { console.error(error); this.setStatus(`Could not open render: ${error.message}`) }
    }
    finally { this._projectIO = false; this.emit('project') }
  }

  async loadRenderRecord(record, ask = true, projectId = this.shot.project?.id) {
    const directory = record.directory
    if (directory.queryPermission && await directory.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      if (!ask) {
        if (this.shot.project?.id === projectId && !this.busy) this.deferRenderDiscovery(record, projectId)
        return
      }
      if (await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow folder access to resume or review this render.')
    }
    const job = await RenderJob.read(new DirectoryStorage(directory))
    if (this.shot.project?.id !== projectId || (!ask && this.busy)) return
    if (!job) {
      this._renderDiscovery = null
      if (this.projectRecord?.lastRender?.directory === record.directory) {
        delete this.projectRecord.lastRender
        await this.queue.save()
      }
      this.emit('renderJob')
      if (ask) this.setStatus('No saved render was found in this project folder. Use Start render to begin.')
      return
    }
    const recoveringLegacy = matchesLegacyRenderShot(job.manifest.shot, this.shot)
    if (recoveringLegacy) {
      if (!ask) { this.deferRenderDiscovery(record, projectId, job); return }
      const recover = async () => {
        await job.verify()
        if (this.shot.project?.id !== projectId) throw new Error('The current project changed during render recovery.')
        await job.adoptProject(this.shot)
      }
      if (navigator.locks) {
        await navigator.locks.request('tetheredRing.render', { ifAvailable: true }, lock => {
          if (!lock) throw new Error('Another browser tab is rendering. Pause it before recovering this render.')
          return recover()
        })
      }
      else await recover()
    }
    else {
      assertRenderProject(job.manifest.shot, this.shot)
      await job.verify()
    }
    if (this.shot.project?.id !== projectId || (!ask && this.busy)) return
    if (recoveringLegacy || record.fromLegacySession) {
      // Legacy runs exported into a shared parent. Project actions now keep output in this capture folder.
      const sameRoot = record.root && (record.root === directory || await record.root.isSameEntry(directory))
      if (this.shot.project?.id !== projectId || (!ask && this.busy)) return
      const previous = this.projectRecord
      this.queue.projectRecords = {
        ...this.queue.projectRecords,
        [projectId]: { ...previous, directory, ...(!sameRoot && record.root ? { parent: record.root } : {}) },
      }
      record = { ...record, root: directory, rootPath: this.shot.project.outputPath ?? '' }
      this.shot.project.renderFolder ??= directory.name
      this.changed()
    }
    this._renderDiscovery = null
    await this.rememberRender(job, record.root ?? directory, record.rootPath ?? '')
    this.setStatus(`${job.manifest.shot.name}: ${job.savedFrames} / ${job.manifest.frames} frames saved. Resume or review the saved segments.`)
  }

  async restartRender() {
    return this.resumeRender({ restart: true })
  }

  async resumeRender({ restart = false } = {}) {
    if (this.busy || this._projectIO) return
    this._projectIO = true
    this.emit('project')
    try {
      await this.queue.ready
      const discoverOnly = this.projectRenderRecord?.needsDiscovery
      if (!this.currentRenderJob && this.projectRenderRecord) await this.loadRenderRecord(this.projectRenderRecord)
      if (discoverOnly) return
      const job = this.currentRenderJob
      if (!job) throw new Error('Open a saved render subfolder first.')
      const regenerate = this.regenerationWindow.enabled
      if (regenerate) { restart = false; this.syncShotFromApp() }
      const resumed = regenerate ? clone(this.shot) : { ...clone(job.manifest.shot), output: clone(this.shot.output), regenerateWindow: clone(this.regenerationWindow) }
      if (!restart && job.manifest.shot.preset !== this.app.presetId) {
        await this.importShotText(serializeShot(resumed))
        return
      }
      if (restart) {
        if (!window.confirm(`Restart "${this.shot.name}" from the beginning using the current shot and render settings?\n\nThis permanently deletes the prior video segments for "${job.manifest.shot.name}", including any unfinished segment. Rendering starts again from frame 0 with your current edits. Existing exported videos are not deleted, but the normal output video will be replaced when rendering finishes.\n\nDelete the prior segments and restart?`)) return
        this.syncShotFromApp()
      }
      const shot = restart ? clone(this.shot) : resumed
      this._projectIO = false
      await this.renderShotUnattended(shot, { job, directory: this.renderRoot, restart })
    }
    catch (error) { if (error.name !== 'AbortError') console.error(error); this.setStatus(error.name === 'AbortError' ? error.message : `Could not ${restart ? 'restart' : 'resume'} rendering: ${error.message}`) }
    finally { this._projectIO = false; this.emit('project') }
  }

  async exportSavedVideo() {
    if (this.busy || this._projectIO || !this.currentRenderJob?.savedFrames) return
    this.mode = 'render'
    this.cancelRequested = false
    this.emit('mode')
    try {
      await this.assembleJob(this.renderJob)
    }
    catch (error) { if (error.name !== 'AbortError') console.error(error); this.setStatus(`Video export stopped: ${error.message}`) }
    finally { this.mode = 'idle'; this.emit('mode') }
  }

  async enterOutputFolderPath(root = this.queue.folder) {
    try {
      if (!root) throw new Error('Choose an output folder first.')
      const sameEntry = async other => !!other && (root === other || await root.isSameEntry(other))
      const queueFolder = await sameEntry(this.queue.folder)
      const renderFolder = await sameEntry(this.renderRoot)
      const projectFolder = await sameEntry(this.projectRecord?.directory)
      const current = projectFolder ? this.shot.project.outputPath : queueFolder ? this.queue.folderPath : renderFolder ? this.renderRootPath : ''
      const entered = window.prompt(`Enter the absolute path to the output folder "${root.name}". The browser only supplies the folder name, not its parent path, and cannot verify the full path. This location will be remembered.`, current ?? '')
      if (entered === null) return false
      const path = outputFolderPath(entered, root.name)
      if (queueFolder) this.queue.folderPath = path
      if (renderFolder) this.renderRootPath = path
      if (projectFolder) { this.shot.project.outputPath = path; this.changed() }
      if (await sameEntry(this.projectRenderRecord?.root)) this.projectRenderRecord.rootPath = path
      await this.queue.save({ strict: projectFolder })
      this.setStatus('Full output-folder path saved.')
      return true
    }
    catch (error) {
      console.error(error)
      this.setStatus(`Could not save output-folder path: ${error.message}`)
      return false
    }
  }

  async reviewSavedVideo() {
    if (this._projectIO || this._reviewPreparing || this.review.requested || this.review.running) return
    if (!this.currentRenderJob || (this.busy && !this.activeRecorder)) {
      this.setStatus('Review is available while rendering frames or after a render has stopped.')
      return
    }
    this._reviewPreparing = true
    this.emit('renderJob')
    try {
      if (!this.queue.supportsFolders) throw new Error('Review requires a browser with output-folder access, such as Chrome or Edge. You can still export the saved video.')
      if (!this.renderRoot) {
        const directory = this.currentRenderJob.storage.directory
        if (!directory) throw new Error('This project has no accessible render folder.')
        await this.rememberRender(this.currentRenderJob, directory)
      }
      if (this.busy && !this.activeRecorder) {
        this.setStatus('The render is finishing. Review the saved video once it has finished.')
        return
      }
      this.review.request()
      if (this.activeRecorder) {
        this.setStatus('Review requested: finishing the current frame and saving its segment…')
      }
      else {
        this.mode = 'render'
        this.cancelRequested = false
        this.emit('mode')
        try { await this.review.service(null, () => this.presentReviewVideo(this.renderJob)) }
        finally { this.mode = 'idle'; this.emit('mode') }
      }
    }
    catch (error) {
      if (error.name !== 'AbortError') console.error(error)
      this.setStatus(`Could not prepare review: ${error.message}`)
    }
    finally { this._reviewPreparing = false; this.emit('renderJob') }
  }

  async presentReviewVideo(job) {
    try {
      if (!job.savedFrames) throw new Error('No completed frames are available to review.')
      const fileName = reviewVideoName(job.manifest.fileName, job.savedFrames)
      await this.assembleJob(job, null, null, { fileName })
      const isAbsolutePath = !!this.renderRootPath
      const path = reviewVideoPath(this.renderRootPath || this.renderRoot.name, fileName)
      await new Promise((resolve, reject) => {
        this.reviewResult = { path, isAbsolutePath, frames: job.savedFrames, close: error => error ? reject(error) : resolve() }
        try { this.emit('reviewReady') }
        catch (error) { reject(error) }
      })
      this.setStatus(this.activeRecorder && !this.cancelRequested ? 'Review closed. Continuing rendering from the next frame.' : `Review video saved: ${path}`)
    }
    catch (error) {
      if (error.name !== 'AbortError') console.error(error)
      this.setStatus(`Review stopped: ${error.message}. Saved segments are retained.`)
    }
    finally { this.reviewResult = null }
  }

  async assembleJob(job, writable = null, outputStorage = null, { fileName } = {}) {
    if (!this._renderOperation) assertRenderProject(job.manifest.shot, this.shot)
    // Check the directory again before opening an output file: another session may have replaced its manifest.
    const latest = await RenderJob.read(job.storage)
    if (!latest) throw new Error('The render manifest is missing; no output has been written.')
    assertRenderProject(latest.manifest.shot, job.manifest.shot)
    job.manifest = latest.manifest
    const name = fileName ?? (job.complete ? job.manifest.fileName : job.manifest.fileName.replace(/\.(mp4|mkv)$/, '.partial.$1'))
    if (!writable) {
      if (outputStorage) writable = await outputStorage.createWritable(name)
      else if (this.renderRoot) writable = await new DirectoryStorage(this.renderRoot).createWritable(name)
      else {
        if (!window.showSaveFilePicker) throw new Error('Exporting a combined video needs a writable output folder. The saved segments are still available for review.')
        writable = await (await window.showSaveFilePicker({ suggestedName: name })).createWritable()
      }
    }
    this.setStatus('Assembling saved segments without re-encoding…')
    const result = await assembleRender(job, writable, (frame, frames) => {
      this.setStatus(`Assembling video: ${frame} / ${frames} frames.`)
    }, () => this.cancelRequested)
    if (!outputStorage && this.renderRoot && !this.queue.supportsFolders) {
      const file = await new DirectoryStorage(this.renderRoot).read(name)
      if (!file) throw new Error('The assembled video could not be read for downloading. Saved segments are unchanged.')
      downloadBlob(file, name)
    }
    this.setStatus(`Saved ${name}: ${result.frames} frames. Segment files have been retained.`)
    return { ...result, fileName: name }
  }

  // Both interactive and unattended rendering use the same durable segment checkpoints.
  async renderShotUnattended(shot, options = {}) {
    return this.withRenderLock(() => this.renderShotSession(shot, options))
  }

  // Runs `session` as this tab's one render operation (one per browser, across tabs).
  async withRenderLock(session) {
    if (this.busy) throw new Error('Another recording is running.')
    this._renderOperation = true
    this.cancelRequested = false
    this.emit('mode')
    try {
      if (navigator.locks) {
        return await navigator.locks.request('tetheredRing.render', { ifAvailable: true }, lock => {
          if (!lock) throw new Error('Another browser tab is rendering. Pause it before starting this render.')
          return session()
        })
      }
      return await session()
    }
    finally { this._renderOperation = false; this.emit('mode') }
  }

  // Waits `seconds` for the scene to settle after loading a shot, and on for up to 30 s more until the
  // clouds are ready. Stop ends the wait.
  async settle(seconds) {
    const settleEnd = performance.now() + seconds * 1000
    while (!this.cancelRequested && (performance.now() < settleEnd ||
      (this.app.clouds?.enabled && !this.app.clouds.realClouds?.ready && performance.now() < settleEnd + 30000))) await sleep(100)
  }

  async renderShotSession(shot, { job = null, directory = null, storage = null, outputStorage = null, writable = null, fileName = slug(shot.name), settleSeconds = 0, onProgress = null, restart = false } = {}) {
    if (!isRecordingSupported()) throw new Error('This browser has no WebCodecs video encoder.')
    if (shot.preset !== this.app.presetId) throw new Error(`The shot needs preset "${shot.preset}", but "${this.app.presetId}" is loaded.`)
    if (!shot.camera.keyframes.length) throw new Error('The shot has no keyframes.')
    if (this.cancelRequested) throw new DOMException('Rendering paused before starting.', 'AbortError')
    this.mode = 'render'
    this.emit('mode')
    try {
      this.pause()
      shot = clone(shot)
      shot.output.width = evenDimension(shot.output.width)
      shot.output.height = evenDimension(shot.output.height)
      const extension = CONTAINERS[shot.output.container].extension
      const outputName = fileName.endsWith(extension) ? fileName : fileName + extension
      if (job) {
        const latest = await RenderJob.open(job.storage, { existingOnly: true })
        assertRenderProject(latest.manifest.shot, shot)
        job.manifest = latest.manifest
      }
      if (shot.regenerateWindow?.enabled) {
        if (!job) {
          if (!storage) {
            directory ??= await this.outputFolder()
            storage = new DirectoryStorage(await directory.getDirectoryHandle(renderFolderName(fileName)))
          }
          job = await RenderJob.open(storage, { existingOnly: true })
        }
        return await this.regenerateSegments(job, shot, { directory, writable, outputStorage, settleSeconds, onProgress })
      }
      if (restart) {
        if (!job) throw new Error('Open a saved render before restarting.')
        const codec = await resolveCodec(shot.output.codec, shot.output)
        if (!codec) throw new Error('No video encoder supports the requested quality. Prior segments have not been deleted.')
        this.setStatus('Deleting prior video segments and restarting from frame 0…')
        await job.restart({ shot, fileName: outputName, codec, buildId: RENDER_BUILD_ID })
      }
      if (!job) {
        if (!storage) {
          directory ??= await this.outputFolder()
          const subfolder = await directory.getDirectoryHandle(renderFolderName(fileName), { create: true })
          storage = new DirectoryStorage(subfolder)
        }
        const codec = await resolveCodec(shot.output.codec, shot.output)
        if (!codec) throw new Error('No video encoder supports the requested quality at this resolution. Try another codec or a positive bitrate override.')
        job = await RenderJob.open(storage, {
          shot, codec, buildId: RENDER_BUILD_ID,
          fileName: outputName,
        })
      }
      const latest = await RenderJob.open(job.storage, { existingOnly: true })
      assertRenderProject(latest.manifest.shot, shot)
      job.manifest = latest.manifest
      if (!restart) {
        const preferred = shot.output.codec === job.manifest.shot.output.codec ? job.manifest.codec : shot.output.codec
        const codec = await resolveCodec(preferred, shot.output)
        if (!codec) throw new Error('No video encoder supports the requested quality. Saved segments are unchanged.')
        await job.updateOutput(shot.output, { codec })
      }
      this.loadShot({ ...clone(job.manifest.shot), ...(shot.project ? { project: clone(shot.project) } : {}), ...(shot.regenerateWindow ? { regenerateWindow: clone(shot.regenerateWindow) } : {}) })
      await this.rememberRender(job, directory, shot.project?.outputPath)
      this.setViewMode('shot')
      const output = this.shot.output
      await this.settle(settleSeconds)
      await this.generateUnfinishedSegments(job, output, onProgress)
      return await this.assembleJob(job, writable, outputStorage)
    }
    finally {
      this.review.requested = false
      this.mode = 'idle'
      this.renderFrame = null
      this.emit('mode')
      this.emit('renderJob')
    }
  }

  async generateUnfinishedSegments(job, output, onProgress = null) {
    let recorder
    try {
      if (!job.complete) {
        recorder = new SegmentedRecorder(job, this.frameCanvas(output), saved => this.rememberRender(saved))
        this.activeRecorder = recorder
        let failed
        try {
          failed = await this.renderFrames(recorder, {
            from: job.savedFrames, keepBusy: true,
            afterFrame: i => { this.renderFrame = i + 1; this.emit('renderProgress'); onProgress?.({ frame: i + 1, frames: job.manifest.frames }) },
          })
        }
        finally { this.activeRecorder = null }
        if (failed) { await recorder.cancel(); throw failed }
        this.setStatus('Saving the final completed frames…')
        await recorder.finish()
      }
      if (this.cancelRequested) {
        this.setStatus(`Rendering paused. ${job.savedFrames} / ${job.manifest.frames} frames saved; Resume continues from the next frame.`)
        throw new DOMException(`Rendering paused; ${job.savedFrames} frames retained.`, 'AbortError')
      }
    }
    catch (error) {
      if (recorder?.current) await recorder.cancel()
      throw error
    }
  }

  async regenerateSegments(job, shot, { directory = this.renderRoot, writable = null, outputStorage = null, settleSeconds = 0, onProgress = null } = {}) {
    const window = shot.regenerateWindow
    const selected = job.regenerationPlan(shot, window.start, window.end)
    const codec = await resolveCodec(job.manifest.codec, shot.output)
    if (codec !== job.manifest.codec) throw new Error('Window regeneration needs the saved video codec at the current quality. Adjust quality settings or use a full restart.')
    this.loadShot(clone(shot))
    await this.rememberRender(job, directory, shot.project?.outputPath)
    this.setViewMode('shot')
    await this.settle(settleSeconds)
    const generation = crypto.randomUUID()
    let completed = 0
    this._regenerating = true
    this.emit('renderJob')
    try {
      for (const target of selected) {
        if (this.cancelRequested) break
        this.setStatus(`Regenerating segment ${completed + 1} / ${selected.length}: ${(target.segment.from / shot.output.fps).toFixed(2)}–${(target.segment.to / shot.output.fps).toFixed(2)} s.`)
        const recorder = new SegmentReplacementRecorder(job, this.frameCanvas(shot.output), target, shot, generation, RENDER_BUILD_ID)
        try {
          const failed = await this.renderFrames(recorder, {
            from: target.segment.from, to: target.segment.to, keepBusy: true,
            afterFrame: i => { this.renderFrame = i + 1; this.emit('renderProgress'); onProgress?.({ frame: i + 1, frames: job.manifest.frames }) },
          })
          if (failed) throw failed
          if (this.cancelRequested) { await recorder.cancel(); break }
          await recorder.finish()
          completed++
          await this.rememberRender(job)
        }
        catch (error) { await recorder.cancel(); throw error }
      }
      if (this.cancelRequested) throw new DOMException(`Window regeneration paused after ${completed} / ${selected.length} segments. Completed replacements are saved; unfinished segments keep their original clips.`, 'AbortError')
      if (window.continueUnfinished && !job.complete) {
        this.setStatus(`Regenerated ${completed} segments. Continuing from frame ${job.savedFrames}…`)
        await job.updateOutput(shot.output, { codec })
        await this.generateUnfinishedSegments(job, shot.output, onProgress)
      }
      this.setStatus(`Regenerated ${completed} segments. Assembling all saved segments…`)
      return await this.assembleJob(job, writable, outputStorage)
    }
    finally { this._regenerating = false; this.emit('renderJob') }
  }

  // ---- Rendering in several browsers at once --------------------------------------------------
  //
  // One browser renders a frame at a time, and most of each sub-frame's time goes on JavaScript on its
  // one main thread, so the GPU is mostly idle. `npm run render -- --workers N` (scripts/render-shots.mjs)
  // runs N browsers on the same shot instead: each renders ranges of frames into files of its own with
  // renderRangeUnattended, and the script appends finished ranges, in order, to the render's segments
  // (RenderJob.commit) as one browser's checkpoints would be. A shot is a function of simulated time,
  // so a range that starts partway through renders the same frames as a render that got there from
  // the start, just as when a render is resumed.

  // What a render of `shot` uses: { shot (as rendered: even video dimensions), codec, buildId }.
  async renderSettings(shot) {
    if (!isRecordingSupported()) throw new Error('This browser has no WebCodecs video encoder.')
    shot = clone(shot)
    shot.output.width = evenDimension(shot.output.width)
    shot.output.height = evenDimension(shot.output.height)
    const codec = await resolveCodec(shot.output.codec, shot.output)
    if (!codec) throw new Error('No video encoder supports the requested quality at this resolution. Try another codec or a positive bitrate override.')
    return { shot, codec, buildId: RENDER_BUILD_ID }
  }

  // Renders frames [from, to) of `shot` (as returned by renderSettings) into the file `name` in
  // `storage`, encoded with `codec`, and returns { frames, decoderConfig } once the file is complete
  // and checked. The shot stays loaded for the next range, so the page settles (`settleSeconds`) only
  // when it changes. Stop abandons the range and removes its file.
  async renderRangeUnattended(shot, options) {
    return this.withRenderLock(() => this.renderRangeSession(shot, options))
  }

  async renderRangeSession(shot, { from, to, codec, storage, name, settleSeconds = 0, onProgress = null }) {
    if (!isRecordingSupported()) throw new Error('This browser has no WebCodecs video encoder.')
    if (shot.preset !== this.app.presetId) throw new Error(`The shot needs preset "${shot.preset}", but "${this.app.presetId}" is loaded.`)
    if (!shot.camera.keyframes.length) throw new Error('The shot has no keyframes.')
    if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to > from)) throw new Error(`Invalid frame range ${from}-${to}.`)
    if (this.cancelRequested) throw new DOMException('Rendering paused before starting.', 'AbortError')
    this.mode = 'render'
    this.emit('mode')
    let recorder = null
    try {
      this.pause()
      const key = canonical(validateShot(clone(shot)))
      if (this._rangeShotKey !== key) {
        this._rangeShotKey = null
        this.loadShot(clone(shot))
        this.setViewMode('shot')
        await this.settle(settleSeconds)
        if (this.cancelRequested) throw new DOMException('Rendering paused before starting.', 'AbortError')
        this._rangeShotKey = key
      }
      const output = this.shot.output
      const frames = Math.max(1, Math.round(shotDuration(this.shot) * output.fps))
      if (to > frames) throw new Error(`The shot has ${frames} frames, so frames ${from}-${to} are outside it.`)
      const writable = await storage.createWritable(name)
      recorder = new VideoRecorder({
        ...output, canvas: this.frameCanvas(output), fileName: name, writable,
        bitrate: output.bitrateMbps ? output.bitrateMbps * 1e6 : null,
      })
      await recorder.prepareTarget()
      try { await recorder.start(codec) }
      catch (error) {
        try { await recorder.output?.cancel(); await writable.abort() }
        catch (cleanupError) { console.error('Could not release the unfinished range:', cleanupError) }
        recorder = null
        throw error
      }
      const failed = await this.renderFrames(recorder, {
        from, to, keepBusy: true,
        afterFrame: i => { this.renderFrame = i + 1; this.emit('renderProgress'); onProgress?.({ frame: i + 1 - from, frames: to - from }) },
      })
      if (failed) throw failed
      if (this.cancelRequested || recorder.frameCount !== to - from) {
        throw new DOMException(`Rendering paused; the unfinished frames ${from}-${to} were discarded.`, 'AbortError')
      }
      await recorder.finish()
      recorder = null
      const decoderConfig = await inspectSegment({ storage, manifest: { shot: this.shot, codec } }, name, to - from)
      return { frames: to - from, decoderConfig }
    }
    catch (error) {
      if (recorder) await recorder.cancel()
      throw error
    }
    finally {
      this.mode = 'idle'
      this.renderFrame = null
      this.emit('mode')
    }
  }

  // Sub-frames for video frame i under the shot's motion blur settings (1 without blur).
  subFramesFor(i) {
    const o = this.shot.output
    if (o.motionBlur === 'fixed') return o.motionBlurSamples
    if (o.motionBlur !== 'adaptive') return 1
    // The shot camera's poses across the frame's whole shutter interval, opening to closing (the
    // sub-frames' own moments would miss its ends and undercount the motion).
    const poses = shutterTimes(i, o.fps, 9, o.shutterAngle).map(t => this.poseAt(t)).filter(Boolean)
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
  async renderFrames(recorder, { from = 0, to = Infinity, afterFrame = null, keepBusy = false } = {}) {
    const shot = this.shot
    const output = shot.output
    const playhead = this.playhead
    this.pause()
    this.mode = 'render'
    if (!keepBusy) this.cancelRequested = false
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
            times = n > 1 ? subFrameTimes(i, output.fps, n, output.shutterAngle, output.motionBlurJitter) : [i / output.fps]
          }
          return this.setPlayhead(times[s])
        },
        progressLabel: (k) => `${queueLabel}Rendering "${shot.name}": frame ${from + k + 1} / ${frames}${recorder ? ` (${CODEC_LABELS[recorder.options.codec]} ${output.width}x${output.height} @ ${output.fps} fps${ssLabel}${n > 1 ? `, ${n} sub-frames` : ''})` : ''}`,
      })
    }
    catch (err) {
      failed = err
    }
    if (!keepBusy) this.mode = 'idle'
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
    if (this.busy || this._projectIO || this.mode !== 'idle') return
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

  get renderFolderName() { return renderFolderName(slug(this.shot.name)) }

  async chooseProjectExport() {
    if (!this.hasProject || this.busy || this._projectIO) return
    this._projectIO = true
    this.emit('project')
    try {
      if (!window.showDirectoryPicker) throw new Error('Selecting a project export folder requires Chrome or Edge with filesystem access.')
      const parent = await window.showDirectoryPicker({ id: 'tetheredRingShotExport', mode: 'readwrite', startIn: this.projectRecord?.parent ?? 'videos' })
      await this.queue.ready
      let renderFolder = this.shot.project.renderFolder || this.renderFolderName
      let directory = await parent.getDirectoryHandle(renderFolder, { create: true })
      const belongsElsewhere = async candidate => {
        const saved = await RenderJob.read(new DirectoryStorage(candidate))
        if (saved?.manifest.shot.project) return saved.manifest.shot.project.id !== this.shot.project.id
        if (saved && matchesLegacyRenderShot(saved.manifest.shot, this.shot)) return false
        for (const [id, record] of Object.entries(this.queue.projectRecords)) {
          if (id !== this.shot.project.id && record.directory && await candidate.isSameEntry(record.directory)) return true
        }
        return !!saved
      }
      if (await belongsElsewhere(directory)) {
        renderFolder = renderFolderName(`${slug(this.shot.name)}-${this.shot.project.id}`)
        directory = await parent.getDirectoryHandle(renderFolder, { create: true })
        if (await belongsElsewhere(directory)) throw new Error('That render folder belongs to another shot project.')
      }
      const previous = this.projectRecord
      const same = previous?.directory && await directory.isSameEntry(previous.directory)
      this.queue.projectRecords = { ...this.queue.projectRecords, [this.shot.project.id]: { ...previous, parent, directory } }
      this.shot.project.renderFolder = renderFolder
      if (!same) {
        this.shot.project.outputPath = ''
        delete this.projectRecord.lastRender
        this.clearProjectRender()
      }
      this.changed()
      await this.queue.save({ strict: true })
      await this.restoreProjectRender()
      this.setStatus(`Video capture project: ${renderFolder}. Save the shot project to keep its export settings.`)
      return true
    }
    catch (error) {
      if (error.name !== 'AbortError') console.error('Could not select project export folder:', error)
      this.setStatus(error.name === 'AbortError' ? 'Export folder selection cancelled.' : `Could not select export folder: ${error.message}`)
      return false
    }
    finally { this._projectIO = false; this.emit('project') }
  }

  async openShotProject() {
    if (this.busy || this._projectIO) return
    if (this._nativeOpenBlocked || !window.showOpenFilePicker) { this.chooseShotFile(); return }
    this._projectIO = true
    this.emit('project')
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Shot project', accept: { 'application/json': ['.json'] } }],
      })
      if (handle.queryPermission && await handle.queryPermission({ mode: 'read' }) !== 'granted' &&
          (!handle.requestPermission || await handle.requestPermission({ mode: 'read' }) !== 'granted')) {
        throw new DOMException('The browser denied direct access to the selected file.', 'NotAllowedError')
      }
      const file = await handle.getFile()
      this.setStatus(`Opening "${file.name}"…`)
      await this.importShotText(await file.text(), { fileHandle: handle, fromFile: true })
    }
    catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        console.warn('Direct shot-file access is unavailable; using the standard file picker:', error)
        this._nativeOpenBlocked = true
        this._projectIO = false
        this.emit('project')
        this.chooseShotFile('The browser blocked direct file access. Select the shot in the standard picker. If it does not open, click Open again. Save will ask for a destination.')
        return
      }
      if (error.name !== 'AbortError') console.error('Could not open shot project:', error)
      this.setStatus(error.name === 'AbortError' ? 'Open cancelled.' : `Could not open shot project: ${error.message}`)
    }
    finally { this._projectIO = false; this.emit('project') }
  }

  async saveProject(saveAs = false) {
    if (!this.hasProject || this.busy || this._projectIO) return
    this._projectIO = true
    this.emit('project')
    let writable
    try {
      await this.queue.ready
      this.syncShotFromApp()
      if (!window.showSaveFilePicker) {
        if (saveAs) { this.shot.project = { id: randomUUID() }; this.clearProjectRender(); this.changed() }
        this.exportShot()
        this.setStatus('Shot project downloaded. This browser cannot update the original file; each Save downloads a copy.')
        return
      }
      const previous = this.projectRecord
      let handle = saveAs ? null : previous?.fileHandle
      if (!handle) handle = await window.showSaveFilePicker({
        suggestedName: slug(this.shot.name) + SHOT_FILE_EXTENSION,
        types: [{ description: 'Shot project', accept: { 'application/json': ['.json'] } }],
      })
      if (handle.requestPermission && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow write access to save this shot project.')
      const sameFile = previous?.fileHandle && (handle === previous.fileHandle ||
        (handle.isSameEntry && await handle.isSameEntry(previous.fileHandle)))
      const savedShot = clone(this.shot)
      const fork = saveAs && !sameFile
      if (fork) savedShot.project = { id: randomUUID() }
      writable = await handle.createWritable()
      await writable.write(serializeShot(savedShot))
      await writable.close()
      writable = null
      if (fork) { this.shot.project = savedShot.project; this.clearProjectRender(); this.changed() }
      this.queue.projectRecords = { ...this.queue.projectRecords, [this.shot.project.id]: { ...(fork ? {} : previous), fileHandle: handle } }
      await this.queue.save({ strict: true })
      this.writeAutosave()
      this.setStatus(`Saved shot project "${handle.name}".`)
    }
    catch (error) {
      if (writable) {
        try { await writable.abort() }
        catch (abortError) { console.error('Could not abort the project write:', abortError) }
      }
      if (error.name !== 'AbortError') console.error('Could not save shot project:', error)
      this.setStatus(error.name === 'AbortError' ? 'Save cancelled.' : `Could not save shot project: ${error.message}`)
    }
    finally { this._projectIO = false; this.emit('project') }
  }

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
    if (shot.preset !== this.app.presetId || (!shot.camera.keyframes.length && !shot.project)) return false
    this.loadShot(shot)
    this.setStatus('Recovered your shot project from the previous session. Save it to keep an external copy.')
    return true
  }

  exportShot() {
    this.syncShotFromApp()
    downloadText(serializeShot(this.shot), slug(this.shot.name) + SHOT_FILE_EXTENSION, 'application/json')
  }

  chooseShotFile(message = 'Choose a .shot.json file to import.') {
    if (!this.shotFileInput) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
      input.hidden = true
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) { this.setStatus('Shot import cancelled.'); return }
        this.setStatus(`Loading shot "${file.name}"…`)
        try {
          const loaded = await this.importShotText(await file.text(), { fromFile: true })
          if (loaded && this._nativeOpenBlocked) this.setStatus('Shot loaded using the standard file picker. Save will ask for a destination because this browser blocked direct file access.')
        }
        catch (error) {
          console.error('Could not read shot file:', error)
          this.setStatus(`Could not read shot "${file.name}": ${error.message}`)
        }
      }
      input.addEventListener('cancel', () => this.setStatus('Shot import cancelled.'))
      document.body.append(input)
      this.shotFileInput = input
    }
    this.shotFileInput.value = ''
    this.setStatus(message)
    this.shotFileInput.click()
  }

  async importShotText(text, { fileHandle, fromFile = false } = {}) {
    if (this.busy) return false
    try {
      const shot = parseShot(text)
      if (!shot.project && fileHandle) {
        await this.queue.ready
        for (const [id, record] of Object.entries(this.queue.projectRecords)) {
          const previous = record.fileHandle
          if (previous && (previous === fileHandle || (fileHandle.isSameEntry && await fileHandle.isSameEntry(previous)))) {
            shot.project = { id, ...(record.directory ? { renderFolder: record.directory.name } : {}) }
            break
          }
        }
      }
      shot.project ??= { id: randomUUID() }
      if (fileHandle || fromFile) {
        await this.queue.ready
        const previous = Object.hasOwn(this.queue.projectRecords, shot.project.id) ? this.queue.projectRecords[shot.project.id] : null
        if (fileHandle || previous?.fileHandle) {
          this.queue.projectRecords = { ...this.queue.projectRecords, [shot.project.id]: { ...previous, fileHandle } }
          await this.queue.save({ strict: !!fileHandle })
        }
      }
      if (shot.preset !== this.app.presetId) {
        // Presets configure construction-time options, so switching needs a reload.
        sessionStorage.setItem(PENDING_SHOT_KEY, serializeShot(shot))
        this.setStatus(`Loading shot with preset "${shot.preset}"…`)
        this.app.switchPreset(shot.preset)
        return
      }
      this.loadShot(shot)
      return true
    }
    catch (err) {
      console.error('Could not import shot:', err)
      this.setStatus(`Could not import shot: ${err.message}`)
      return false
    }
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
    const previousProject = this.shot?.project?.id
    this.shot = validateShot(shot)
    this.ensureProject()
    this.selected = -1
    this.restoreStart(this.shot)
    this.changed()
    this.setPlayhead(0)
    const first = this.poseAt(0)
    if (first) this.app.camera.setState(first)
    this.setStatus('Shot loaded. Play it with the shot camera, or render it.')
    if (previousProject !== this.shot.project.id) this.clearProjectRender()
    if (!this.currentRenderJob) {
      const projectId = this.shot.project.id
      this.restoreProjectRender().catch(error => {
        console.error(error)
        if (this.shot.project?.id === projectId) this.setStatus(`Saved render: ${error.message}`)
      })
    }
  }

  // Called when the page has started: loads a shot imported across a preset switch, and carries on
  // with a render queue run.
  async resumePendingShot() {
    this.queue.resumeSoon()
    this.queue.ready.then(async () => {
      if (!this.queue.running) await this.restoreProjectRender()
    }).catch(error => { console.error(error); this.setStatus(`Saved render: ${error.message}`) })
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
  constructor(onCancel = null) {
    this.element = document.createElement('div')
    this.element.className = 'recording-overlay'
    this.label = document.createElement('span')
    this.element.append(this.label)
    if (onCancel) {
      const button = document.createElement('button')
      button.textContent = 'Stop live take'
      button.addEventListener('click', onCancel)
      this.element.append(button)
    }
    document.body.appendChild(this.element)
  }

  update(text) {
    this.label.textContent = text
  }

  remove() {
    this.element.remove()
  }
}
