import { PixelLOD } from '../scene/PixelLOD.js'

// Rendering quality presets. Level-of-detail decisions are always made in real drawing-buffer pixels
// (CSS size x pixel ratio), so a 4K or high-DPI screen gets correspondingly finer detail; these
// presets trade that resolution for speed on slower machines.
//   maxPixelRatio  cap on the device pixel ratio used for the drawing buffer
//   lodBias        multiplies every pixel-size LOD threshold (higher = coarser sooner)
//   terrainSse     planet tile refinement threshold (pixels per texel)
export const QUALITY_PRESETS = {
  high: { label: 'High', maxPixelRatio: 2, lodBias: 1, terrainSse: 1.5 },
  balanced: { label: 'Balanced', maxPixelRatio: 1.5, lodBias: 1.5, terrainSse: 2 },
  low: { label: 'Low', maxPixelRatio: 1, lodBias: 2.5, terrainSse: 3 },
}

const STORAGE_KEY = 'tetheredRing.graphicsQuality'
const SLOW_FRAME_MS = 24      // below ~42 fps: reduce resolution
const FAST_FRAME_MS = 17.5    // at the display's refresh rate (60 Hz): try more resolution
const MIN_RENDER_SCALE = 0.5  // never render below half the preset's resolution
const ADJUST_INTERVAL_MS = 1000
const UPGRADE_AFTER_MS = 5000
const UPGRADE_COOLDOWN_MS = 30000

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
    this.watchDevicePixelRatio()
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
    return QUALITY_PRESETS[this.mode === 'auto' ? 'high' : this.mode]
  }

  // Pixel ratio for the drawing buffer right now.
  pixelRatio() {
    return Math.max(0.25, Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio) * this.renderScale)
  }

  setMode(mode) {
    this.mode = mode
    this.renderScale = 1
    this._samples = []
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
    this.app.onResize()
  }

  // Full quality regardless of mode (recording): identical output on every machine.
  applyForRecording() {
    PixelLOD.lodBias = 1
    if (this.app.planet?.lod) this.app.planet.lod.sseThreshold = QUALITY_PRESETS.high.terrainSse * (this.app.shots?.recordingSize?.pixelRatio ?? 1)
  }

  // Called once per displayed frame with the frame's timestamp (ms).
  onFrame(now) {
    if (this._lastFrame === null || document.hidden) {
      this._lastFrame = now
      return
    }
    const frameMs = now - this._lastFrame
    this._lastFrame = now
    if (this.mode !== 'auto' || frameMs > 250) return // ignore stalls (tab switches, loading hitches)
    this._samples.push(frameMs)
    if (now - this._lastAdjust < ADJUST_INTERVAL_MS) return
    this._lastAdjust = now
    const sorted = [...this._samples].sort((a, b) => a - b)
    this._samples = []
    if (sorted.length < 10) return
    const median = sorted[Math.floor(sorted.length / 2)]
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
