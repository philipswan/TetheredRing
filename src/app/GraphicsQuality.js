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
//                  12 km (aerialPerspective.js: from higher, always 8)
export const QUALITY_PRESETS = {
  high: { label: 'High', maxPixelRatio: 2, lodBias: 1, terrainSse: 1.5, clouds: 0.5, cloudFeatures: [], seaLite: false, hazeSamples: 8 },
  balanced: { label: 'Balanced', maxPixelRatio: 1.5, lodBias: 1.5, terrainSse: 2, clouds: 0.4,
    cloudFeatures: ['CLOUD_LITE_LIGHT', 'CLOUD_LITE_MURK', 'CLOUD_LITE_SHADOW'], seaLite: true, hazeSamples: 4 },
  low: { label: 'Low', maxPixelRatio: 1, lodBias: 2.5, terrainSse: 3, clouds: 0.3,
    cloudFeatures: ['CLOUD_LITE_LIGHT', 'CLOUD_LITE_MURK', 'CLOUD_LITE_SHADOW', 'CLOUD_NO_MID', 'CLOUD_LITE_HIGH', 'CLOUD_LITE_CELLS'],
    seaLite: true, hazeSamples: 4 },
}
const TIERS = ['high', 'balanced', 'low']

const STORAGE_KEY = 'tetheredRing.graphicsQuality'
const SLOW_FRAME_MS = 24      // below ~42 fps: reduce resolution
const FAST_FRAME_MS = 17.5    // at the display's refresh rate (60 Hz): try more resolution
const MIN_RENDER_SCALE = 0.5  // never render below half the preset's resolution
const ADJUST_INTERVAL_MS = 1000
const UPGRADE_AFTER_MS = 5000
const UPGRADE_COOLDOWN_MS = 30000
// Auto's tier: it starts at the tier remembered from before (AUTO_TIER_KEY; High the first time), and steps
// down a tier (never up, in a session) when the median frame takes longer than TIER_SLOW_MS, or
// SLOW_RUN frames in a row take longer than STALL_MS (on a small GPU every frame can, which used to be
// ignored as stalls: the GPU could take seconds a frame and be reset). The tier is changed before the
// resolution is lowered, and the frames for TIER_SETTLE_MS after a change (its shaders compiling) are not
// counted. Remembered, so a slow machine starts at its tier next time.
const AUTO_TIER_KEY = 'tetheredRing.autoTier'
const TIER_SLOW_MS = 45
const STALL_MS = 250
const SLOW_RUN = 4
const TIER_SETTLE_MS = 3000

// Chooses the drawing-buffer resolution and LOD bias. In 'auto' mode (the default) it starts at High
// and lowers the render resolution in steps while frames take longer than SLOW_FRAME_MS, then raises
// it again when frames are consistently fast. Everything downstream (LOD, terrain, instanced pools)
// reads the resulting drawing-buffer size, so detail always matches what is actually on screen.
export class GraphicsQuality {
  constructor(app, requested) {
    this.app = app
    this.mode = this.readInitialMode(requested)
    this.renderScale = 1
    this._lastFrame = null
    this._samples = []
    this._lastAdjust = 0
    this._fastSince = null
    this._lastDowngrade = -Infinity
    this._slowRun = 0
    this._settleUntil = 0
    this.autoTier = this.readAutoTier()
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

  // Auto: one tier lighter (see AUTO_TIER_KEY). Returns false at the lightest.
  stepDownTier(now) {
    const next = TIERS[TIERS.indexOf(this.autoTier) + 1]
    if (!next) return false
    this.autoTier = next
    try { localStorage.setItem(AUTO_TIER_KEY, next) }
    catch { /* not persisted */ }
    this._samples = []
    this._slowRun = 0
    this._settleUntil = now + TIER_SETTLE_MS
    this.apply()
    return true
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
      try { localStorage.removeItem(AUTO_TIER_KEY) }
      catch { /* unavailable */ }
    }
    try { localStorage.setItem(STORAGE_KEY, mode) }
    catch { /* not persisted */ }
    this.apply()
  }

  // Pushes the current settings to the renderer, LOD system and terrain.
  apply() {
    PixelLOD.lodBias = this.preset.lodBias
    if (this.app.planet?.lod) this.app.planet.lod.sseThreshold = this.preset.terrainSse
    if (this.app.clouds) {
      this.app.clouds.resolution = this.preset.clouds
      this.app.clouds.setFeatures(this.preset.cloudFeatures)
    }
    this.app.planet?.setSeaLite(this.preset.seaLite)
    AerialPerspective.setLowSamples(this.preset.hazeSamples)
    this.app.onResize()
  }

  // Full quality regardless of mode (recording): identical output on every machine.
  applyForRecording() {
    PixelLOD.lodBias = 1
    if (this.app.planet?.lod) this.app.planet.lod.sseThreshold = QUALITY_PRESETS.high.terrainSse
    if (this.app.clouds) {
      this.app.clouds.resolution = QUALITY_PRESETS.high.clouds
      this.app.clouds.setFeatures(QUALITY_PRESETS.high.cloudFeatures)
    }
    this.app.planet?.setSeaLite(false)
    AerialPerspective.setLowSamples(QUALITY_PRESETS.high.hazeSamples)
  }

  // Called once per displayed frame with the frame's timestamp (ms).
  onFrame(now) {
    if (this._lastFrame === null || document.hidden) {
      this._lastFrame = now
      return
    }
    const frameMs = now - this._lastFrame
    this._lastFrame = now
    if (this.mode !== 'auto' || now < this._settleUntil) return
    // (A long frame alone is a stall (a tab switch, loading); a run of them is a GPU that slow.)
    this._slowRun = frameMs > STALL_MS ? this._slowRun + 1 : 0
    if (this._slowRun >= SLOW_RUN && this.stepDownTier(now)) return
    if (frameMs > STALL_MS) return
    this._samples.push(frameMs)
    if (now - this._lastAdjust < ADJUST_INTERVAL_MS) return
    this._lastAdjust = now
    const sorted = [...this._samples].sort((a, b) => a - b)
    this._samples = []
    if (sorted.length < 10) return
    const median = sorted[Math.floor(sorted.length / 2)]
    if (median > TIER_SLOW_MS && this.stepDownTier(now)) return
    if (median > SLOW_FRAME_MS && this.renderScale > MIN_RENDER_SCALE) {
      this.renderScale = Math.max(MIN_RENDER_SCALE, this.renderScale * 0.85)
      this._lastDowngrade = now
      this._fastSince = null
      this.app.onResize()
    }
    else if (median <= FAST_FRAME_MS && this.renderScale < 1) {
      this._fastSince ??= now
      if (now - this._fastSince >= UPGRADE_AFTER_MS && now - this._lastDowngrade >= UPGRADE_COOLDOWN_MS) {
        this.renderScale = Math.min(1, this.renderScale / 0.85)
        this._fastSince = null
        this.app.onResize()
      }
    }
    else {
      this._fastSince = null
    }
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
