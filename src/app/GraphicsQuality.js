import { PixelLOD } from '../scene/PixelLOD.js'
import { AerialPerspective } from '../planet/aerialPerspective.js'

// Rendering quality presets. Level-of-detail decisions are always made in real drawing-buffer pixels
// (CSS size x pixel ratio), so a 4K or high-DPI screen gets correspondingly finer detail; these
// presets trade that resolution for speed on slower machines.
//   maxPixelRatio  cap on the device pixel ratio used for the drawing buffer
//   lodBias        multiplies every pixel-size LOD threshold (higher = coarser sooner)
//   terrainSse     planet tile refinement threshold (pixels per texel)
//   clouds         the volumetric clouds' render target, as a share of the drawing buffer's size across
//                  (softer clouds, for much less work: their cost grows with its pixels)
//   cloudFeatures  the clouds' lighter shader parts (Clouds.setFeatures): a smaller shader, which small
//                  GPUs (integrated graphics) run several times faster
//   seaLite        the sea's lighter shader (fewer wave trains and noise octaves; Planet.setSeaLite)
//   hazeSamples    samples of the air along each line of sight for the haze over everything, from below
//                  12 km (aerialPerspective.js: from higher, always 8). (4 at High too: by tools/perceptual_diff.py
//                  no different from 8 in any of the bench's cloud, mountain or photo views.)
//   hazeLut        from higher, the haze read from a table of lines of sight worked out once a frame
//                  (Planet.setGroundHazeLut) rather than marched
//   hazeVolume     from higher, the haze over the ground and the sea read from a table of lines of sight
//                  down to the ground, by where along them each point is (Planet.setHazeVolume; in place of
//                  hazeLut's there): closer than 8 samples to the haze marched with many, and faster (not
//                  for Low, whose cheaper table was faster still on the i7-1355U)
export const QUALITY_PRESETS = {
  high: { label: 'High', maxPixelRatio: 2, lodBias: 1, terrainSse: 1.5, clouds: 0.5, cloudFeatures: [], seaLite: false, hazeSamples: 4, hazeLut: false, hazeVolume: true },
  balanced: { label: 'Balanced', maxPixelRatio: 1.5, lodBias: 1.5, terrainSse: 2, clouds: 0.4,
    cloudFeatures: ['CLOUD_LITE_LIGHT', 'CLOUD_LITE_MURK', 'CLOUD_LITE_SHADOW', 'CLOUD_LITE_COLUMNS'], seaLite: true, hazeSamples: 4, hazeLut: false, hazeVolume: true },
  low: { label: 'Low', maxPixelRatio: 1, lodBias: 2.5, terrainSse: 3, clouds: 0.25,
    cloudFeatures: ['CLOUD_LITE_LIGHT', 'CLOUD_LITE_MURK', 'CLOUD_LITE_SHADOW', 'CLOUD_LITE_MID', 'CLOUD_LITE_HIGH', 'CLOUD_LITE_CELLS', 'CLOUD_LITE_COLUMNS',
      'CLOUD_LITE_FLAT', 'CLOUD_LITE_DETAIL'],
    seaLite: true, hazeSamples: 4, hazeLut: true, hazeVolume: false },
}
const TIERS = ['high', 'balanced', 'low']

const STORAGE_KEY = 'tetheredRing.graphicsQuality'
// Auto (the default mode) chooses the tier and the render resolution by the GPU's own time for each frame
// (EXT_disjoint_timer_query_webgl2, around App.render), not by the time between frames, which also holds the
// CPU's and the browser's work, loading, shader compiling and the wait for the display's refresh (a frame the
// GPU is 18 ms on waits for the next refresh, at 33 ms): none of them would a lighter tier shorten, and judged
// by them, Auto ended at Low at half resolution on GPUs that run Balanced well. (Without the extension, the time
// between frames.)
// - Once a second it judges the GPU's time over the last JUDGE_WINDOW_MS (its 80th percentile) against
//   BUDGET_MS (30 frames a second). Not until SETTLE_MS after it changed anything or a new shader program
//   appeared (compiling, and the program's first frames), nor STARTUP_SETTLE_MS after the page started.
// - Over the budget by STEP_DOWN: a lighter tier; at the lightest, a lower resolution (to MIN_RENDER_SCALE).
// - Under SCALE_UP of it with the resolution lowered: more resolution.
// - Under STEP_UP of it at full resolution: the next tier up, on trial. Over the budget there, it goes back,
//   and does not try that tier again in this session.
// - A tier is remembered (AUTO_TIER_KEY) once judged within the budget, so the next session starts there: on a
//   small GPU, starting at High could take seconds a frame and have the GPU reset (watchContextLoss).
// - A run of EMERGENCY_RUN frames each over EMERGENCY_MS steps down at once, settled or not.
// (A new key: tiers remembered by the frame-interval judging, mostly Low from loading, are not to be trusted.)
const AUTO_TIER_KEY = 'tetheredRing.autoTier2'
const BUDGET_MS = 1000 / 30
const STEP_DOWN = 1.15
const SCALE_UP = 0.7
const STEP_UP = 0.35
const JUDGE_INTERVAL_MS = 1000
const JUDGE_WINDOW_MS = 2000
const SETTLE_MS = 2500
const STARTUP_SETTLE_MS = 6000
const MIN_RENDER_SCALE = 0.5
const EMERGENCY_MS = 500
const EMERGENCY_RUN = 4

// Chooses the drawing-buffer resolution and LOD bias (see Auto above). Everything downstream (LOD, terrain,
// instanced pools) reads the resulting drawing-buffer size, so detail always matches what is on screen.
export class GraphicsQuality {
  constructor(app, requested) {
    this.app = app
    this.mode = this.readInitialMode(requested)
    this.renderScale = 1
    this.autoTier = this.readAutoTier()
    this._lastFrame = null
    this._samples = []           // { t, ms }: the GPU's (or the frame's) time, by when the frame started
    this._settleUntil = performance.now() + STARTUP_SETTLE_MS
    this._lastJudged = 0
    this._programs = 0
    this._trial = null           // the tier being tried, if any
    this._failed = new Set()     // tiers tried and found over the budget in this session
    this._timeNext = false
    this._queries = []           // [query, frame start]
    this._emergency = 0
    this.lastGpuMs = null        // (the last judgement's 80th percentile, for diagnostics)
    this.watchDevicePixelRatio()
  }

  readAutoTier() {
    try {
      const stored = localStorage.getItem(AUTO_TIER_KEY)
      if (TIERS.includes(stored)) return stored
    }
    catch { /* unavailable */ }
    return 'high'
  }

  rememberAutoTier() {
    try { localStorage.setItem(AUTO_TIER_KEY, this.autoTier) }
    catch { /* not persisted */ }
  }

  // Auto: to another tier (settling first), or a different resolution.
  setAutoTier(tier, now, why) {
    console.info(`[quality] Auto: ${this.autoTier} -> ${tier} (${why})`)
    this.autoTier = tier
    this.renderScale = 1
    this.settle(now)
    this.apply()
  }

  setRenderScale(scale, now, why) {
    console.info(`[quality] Auto: resolution ${Math.round(this.renderScale * 100)}% -> ${Math.round(scale * 100)}% (${why})`)
    this.renderScale = scale
    this.settle(now)
    this.app.onResize()
  }

  settle(now) {
    this._settleUntil = Math.max(this._settleUntil, now + SETTLE_MS)
    this._samples = []
  }

  readInitialMode(requested) {
    const valid = (m) => m === 'auto' || m in QUALITY_PRESETS
    if (valid(requested)) return requested
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (valid(stored)) return stored
    }
    catch {
      // Storage can be unavailable (private windows); fall back to auto.
    }
    return 'auto'
  }

  get preset() {
    return QUALITY_PRESETS[this.mode === 'auto' ? this.autoTier : this.mode]
  }

  // Pixel ratio for the drawing buffer right now.
  pixelRatio() {
    return Math.max(0.25, Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio) * this.renderScale)
  }

  setMode(mode) {
    this.mode = mode
    this.renderScale = 1
    this._samples = []
    // (Choosing Auto again starts it from High: it finds the tier again.)
    if (mode === 'auto') {
      this.autoTier = 'high'
      this._trial = null
      this._failed.clear()
      this.settle(performance.now())
      try { localStorage.removeItem(AUTO_TIER_KEY) }
      catch { /* unavailable */ }
    }
    try { localStorage.setItem(STORAGE_KEY, mode) }
    catch { /* not persisted */ }
    this.apply()
  }

  // Pushes the current settings to the renderer, LOD system and terrain.
  apply() {
    if (this.app.shots?.recordingSize) {
      this.applyForRecording()
      return
    }
    PixelLOD.lodBias = this.preset.lodBias
    if (this.app.planet?.lod) this.app.planet.lod.sseThreshold = this.preset.terrainSse
    this.app.planet?.setDeterministic?.(false)
    if (this.app.clouds) {
      this.app.clouds.resolution = this.preset.clouds
      this.app.clouds.setFeatures(this.preset.cloudFeatures)
    }
    this.app.planet?.setSeaLite(this.preset.seaLite)
    AerialPerspective.setLowSamples(this.preset.hazeSamples)
    this.app.planet?.setGroundHazeLut?.(this.preset.hazeLut)
    this.app.planet?.setHazeVolume?.(this.preset.hazeVolume)
    this.app.onResize()
  }

  // Full quality regardless of mode (recording): identical output on every machine.
  applyForRecording() {
    PixelLOD.lodBias = 1
    if (this.app.planet?.lod) this.app.planet.lod.sseThreshold = QUALITY_PRESETS.high.terrainSse * (this.app.shots?.recordingSize?.pixelRatio ?? 1)
    this.app.planet?.setDeterministic?.(true)
    if (this.app.clouds) {
      this.app.clouds.resolution = QUALITY_PRESETS.high.clouds
      this.app.clouds.setFeatures(QUALITY_PRESETS.high.cloudFeatures)
    }
    this.app.planet?.setSeaLite(false)
    AerialPerspective.setLowSamples(QUALITY_PRESETS.high.hazeSamples)
    this.app.planet?.setGroundHazeLut?.(false)
    this.app.planet?.setHazeVolume?.(QUALITY_PRESETS.high.hazeVolume)
  }

  // Called once per displayed frame with the frame's timestamp (ms), before App.render (whose GPU time
  // beginGpuFrame and endGpuFrame measure).
  onFrame(now) {
    const frameMs = this._lastFrame === null ? null : now - this._lastFrame
    this._lastFrame = now
    const gl = this.app.renderer.getContext()
    if (this.mode !== 'auto' || document.hidden) {
      this._timeNext = false
      for (const [query] of this._queries) gl.deleteQuery(query)
      this._queries.length = 0
      return
    }
    this._timer ??= gl.getExtension('EXT_disjoint_timer_query_webgl2') ?? false
    this.collectGpuTimes(gl)
    // (Without the extension, the time between frames.)
    if (!this._timer && frameMs !== null) this.addSample(now - frameMs, frameMs, now)
    this._timeNext = !!this._timer
    // A new shader program: compiling, and its first frames.
    const programs = this.app.renderer.info.programs?.length ?? 0
    if (programs !== this._programs) {
      this._programs = programs
      this._programAt = now
      this.settle(now)
    }
    if (now < this._settleUntil || now - this._lastJudged < JUDGE_INTERVAL_MS) return
    this._lastJudged = now
    this.judge(now)
  }

  addSample(t, ms, now) {
    // (A run of frames each far over the budget: a GPU that slow, whether settled or not; but not frames just after a
    // new shader program, which can wait on its compiling.)
    this._emergency = ms > EMERGENCY_MS && t > (this._programAt ?? -Infinity) + 1000 ? this._emergency + 1 : 0
    if (this._emergency >= EMERGENCY_RUN) {
      this._emergency = 0
      const lighter = TIERS[TIERS.indexOf(this.autoTier) + 1]
      if (lighter) {
        this._failed.add(this.autoTier)
        this._trial = null
        this.setAutoTier(lighter, now, `${EMERGENCY_RUN} frames over ${EMERGENCY_MS} ms`)
        this.rememberAutoTier()
        return
      }
    }
    if (t >= this._settleUntil) this._samples.push({ t, ms })
  }

  judge(now) {
    this._samples = this._samples.filter((s) => s.t >= now - JUDGE_WINDOW_MS)
    // (At a few frames a second, the window holds only a few: enough to tell.)
    if (this._samples.length < 4) return
    const sorted = this._samples.map((s) => s.ms).sort((a, b) => a - b)
    const ms = sorted[Math.floor(sorted.length * 0.8)]
    this.lastGpuMs = ms
    const index = TIERS.indexOf(this.autoTier)
    const why = `the GPU ${ms.toFixed(1)} ms a frame, for ${BUDGET_MS.toFixed(1)}`
    if (ms > BUDGET_MS * STEP_DOWN) {
      if (index < TIERS.length - 1) {
        if (this._trial === this.autoTier) this._failed.add(this.autoTier)
        this._trial = null
        this.setAutoTier(TIERS[index + 1], now, why)
        this.rememberAutoTier()
      }
      else if (this.renderScale > MIN_RENDER_SCALE) this.setRenderScale(Math.max(MIN_RENDER_SCALE, this.renderScale * 0.85), now, why)
      return
    }
    // Within the budget: this tier is remembered (a trial passed).
    if (ms <= BUDGET_MS) {
      this._trial = null
      this.rememberAutoTier()
    }
    if (ms < BUDGET_MS * SCALE_UP && this.renderScale < 1) this.setRenderScale(Math.min(1, this.renderScale / 0.85), now, why)
    else if (ms < BUDGET_MS * STEP_UP && this.renderScale >= 1 && index > 0 && !this._failed.has(TIERS[index - 1])) {
      this._trial = TIERS[index - 1]
      this.setAutoTier(TIERS[index - 1], now, `${why}: trying it`)
    }
  }

  // Around App.render: the GPU's time for the frame (in Auto, for frames onFrame asks for).
  beginGpuFrame() {
    if (!this._timeNext || this._activeQuery) return
    const gl = this.app.renderer.getContext()
    const query = gl.createQuery()
    gl.beginQuery(this._timer.TIME_ELAPSED_EXT, query)
    this._activeQuery = query
    this._activeStart = this._lastFrame
  }

  endGpuFrame() {
    if (!this._activeQuery) return
    const gl = this.app.renderer.getContext()
    gl.endQuery(this._timer.TIME_ELAPSED_EXT)
    this._queries.push([this._activeQuery, this._activeStart])
    this._activeQuery = null
    this._timeNext = false
  }

  // The GPU times that have come back (a few frames later); none from a disjoint period (the GPU's clock
  // changed, or it was taken over), which are not to be trusted.
  collectGpuTimes(gl) {
    if (!this._timer) return
    const disjoint = gl.getParameter(this._timer.GPU_DISJOINT_EXT)
    const now = performance.now()
    while (this._queries.length) {
      const [query, start] = this._queries[0]
      if (!disjoint && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break
      if (!disjoint) this.addSample(start, gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6, now)
      gl.deleteQuery(query)
      this._queries.shift()
    }
  }

  // A frame that keeps the GPU busy for too long (a couple of seconds) makes the driver reset it, and the
  // browser takes the WebGL context away: everything drawn is lost. In Auto, a lighter tier is remembered
  // and the page reloaded, so it starts at that tier (at the lightest already, it is left as it is).
  watchContextLoss(canvas) {
    canvas.addEventListener('webglcontextlost', () => {
      console.warn('GraphicsQuality: the WebGL context was lost (the GPU was reset)')
      const next = TIERS[TIERS.indexOf(this.autoTier) + 1]
      if (this.mode !== 'auto' || !next) return
      try { localStorage.setItem(AUTO_TIER_KEY, next) }
      catch { return }  // (not remembered: reloading would only lose it again)
      console.warn(`GraphicsQuality: reloading at ${next}`)
      window.location.reload()
    })
  }

  // Moving the window to a monitor with a different scale factor changes devicePixelRatio, which
  // does not always fire a resize event.
  watchDevicePixelRatio() {
    const listen = () => {
      const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      query.addEventListener('change', () => { this.app.onResize(); listen() }, { once: true })
    }
    if (typeof window.matchMedia === 'function') listen()
  }
}
