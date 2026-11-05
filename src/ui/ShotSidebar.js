import * as THREE from 'three'
import * as tram from '../utils/tram.js'
import { advanceDate, sunElevation } from '../physics/solar.js'
import { CODEC_LABELS, CONTAINERS, isRecordingSupported } from '../capture/VideoRecorder.js'
import { SUPERSAMPLE_FACTORS } from '../capture/Supersampler.js'
import { ANCHOR_KINDS } from '../shots/Anchors.js'
import { isWorldAnchor, WORLD_ANCHOR, ANCHOR_ORIENTS } from '../shots/ShotFormat.js'
import { PLAYBACK_SPEEDS } from '../shots/ShotController.js'
import { formatDuration } from '../shots/RenderQueueRunner.js'
import { DEFAULT_CORNER_SECONDS } from '../shots/CameraPath.js'
import { Timeline } from './Timeline.js'

const STORAGE_KEY = 'tetheredRing.shotSidebar'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const RESOLUTIONS = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [1080, 1920], [1080, 1080]]
const FRAME_RATES = [24, 25, 30, 48, 50, 60, 120]
const SUPERSAMPLE_OPTIONS = SUPERSAMPLE_FACTORS.map(f => [f, f === 1 ? 'Off (antialiasing only)' : `${f} × ${f}${f === 2 ? ' (recommended)' : ''}`])
const TIME_SPEEDS = [0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
const ORIENT_LABELS = { follow: 'Turns with the object', level: 'Level, turns with its heading', translate: 'Moves with it, never turns' }
const MOTION_LABELS = { auto: 'Auto (orbit when zooming or circling)', direct: 'Direct (straight path)', orbit: 'Orbit & zoom around target' }

const _v = new THREE.Vector3()

// Transport icons (24 x 24 viewBox), drawn rather than taken from a font so they look the same everywhere.
const ICONS = {
  start: 'M6 5h2v14H6zM20 5v14L9 12z',
  reverse: 'M18 5v14L7 12z',
  stepBack: 'M15 6v12l-7-6zM17 6h2v12h-2z',
  play: 'M7 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  stepForward: 'M9 6v12l7-6zM5 6h2v12H5z',
  end: 'M16 5h2v14h-2zM4 5v14l11-7z',
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'ss-svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICONS[name])
  svg.append(path)
  return svg
}

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {} }
  catch { return {} }
}

function writeStore(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
  catch { /* not persisted */ }
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k in e) e[k] = v
    else e.setAttribute(k, v)
  }
  e.append(...children.filter(c => c !== null && c !== undefined))
  return e
}

const pad = (n) => String(n).padStart(2, '0')
function clockText(hours) {
  const h = ((hours % 24) + 24) % 24
  const s = Math.floor(h * 3600 + 1e-6)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
}
function dateText(dayOfYear) {
  const day = Math.floor(dayOfYear)
  let m = 11
  while (m > 0 && MONTH_STARTS[m] >= day) m--
  return `${MONTHS[m]} ${day - MONTH_STARTS[m]}`
}
function speedText(s) {
  if (s === 0) return 'frozen'
  return `${Number(s.toPrecision(3))}x`
}
function secondsText(t) {
  return `${t.toFixed(2)} s`
}

// The floating panel on the left for setting up and making videos: simulated time, the sun, the
// camera views, the shot's keyframes and timeline, and video export. It only drives the
// ShotController (and a few App parameters); it is ordinary page content, so it never appears in
// recordings, which capture the canvas alone.
export class ShotSidebar {
  constructor(app) {
    this.app = app
    this.shots = app.shots
    this.state = { collapsed: false, sections: {}, ...readStore() }
    this.syncs = []
    this.build()
    this.shots.subscribe((kind) => this.onChange(kind))
    this.shots.queue.subscribe((kind) => this.onQueueChange(kind))
    app.renderer.domElement.addEventListener('pointerdown', () => {
      if (this.shots.drivesCamera && this.shots.mode === 'idle') this.shots.setStatus('This is the shot camera\'s view. Switch to the free view (B) to move the camera.')
    })
    this.onChange('shot')
    this.onChange('mode')
    this.onChange('status')
    this.rebuildQueue()
    const loop = () => {
      this.updateLive()
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  get selectedKey() { return this.shots.keyframes[this.shots.selected] ?? null }

  save() {
    writeStore(this.state)
  }

  // ---- Small builders ------------------------------------------------------------------------

  // Re-reads a control's value from the model, unless the user is editing it.
  bind(element, get) {
    const sync = () => {
      if (document.activeElement === element) return
      const value = get()
      if (element.type === 'checkbox') element.checked = !!value
      else if (element.value !== String(value)) element.value = String(value)
    }
    this.syncs.push(sync)
    return element
  }

  button(text, onClick, { title = '', cls = '', iconName = null } = {}) {
    const b = el('button', { type: 'button', class: `ss-button ${cls}`, title, textContent: text })
    if (iconName) b.append(icon(iconName))
    b.addEventListener('click', (e) => {
      onClick(e)
      b.blur() // so Space (play/pause) is not also a click on this button
    })
    return b
  }

  select(options, get, onChange, { title = '' } = {}) {
    const s = el('select', { class: 'ss-select', title })
    for (const [value, label] of options) s.append(el('option', { value: String(value), textContent: label }))
    s.addEventListener('change', () => { onChange(s.value); s.blur() })
    return this.bind(s, get)
  }

  number(get, onChange, { step = 'any', min = '', max = '', title = '', width = '' } = {}) {
    const input = el('input', { type: 'number', class: 'ss-number', step, title })
    if (min !== '') input.min = min
    if (max !== '') input.max = max
    if (width) input.style.width = width
    input.addEventListener('change', () => {
      const v = Number(input.value)
      if (Number.isFinite(v)) onChange(v)
      input.blur()
    })
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
    return this.bind(input, get)
  }

  checkbox(label, get, onChange, { title = '' } = {}) {
    const input = el('input', { type: 'checkbox' })
    input.addEventListener('change', () => { onChange(input.checked); input.blur() })
    this.bind(input, get)
    return el('label', { class: 'ss-check', title }, input, label)
  }

  range(min, max, step, get, onInput, { title = '' } = {}) {
    const input = el('input', { type: 'range', class: 'ss-range', min, max, step, title })
    input.addEventListener('input', () => onInput(Number(input.value)))
    input.addEventListener('change', () => input.blur())
    return this.bind(input, get)
  }

  row(label, ...controls) {
    return el('div', { class: 'ss-row' }, el('span', { class: 'ss-label', textContent: label }), el('div', { class: 'ss-controls' }, ...controls))
  }

  section(id, title, open, ...children) {
    const details = el('details', { class: 'ss-section' })
    details.open = this.state.sections[id] ?? open
    details.addEventListener('toggle', () => {
      this.state.sections[id] = details.open
      this.save()
    })
    details.append(el('summary', { textContent: title }), ...children.filter(c => c !== null && c !== undefined))
    return details
  }

  // ---- Layout ---------------------------------------------------------------------------------

  build() {
    this.root = el('aside', { class: 'shot-sidebar' })
    this.tab = el('button', { type: 'button', class: 'shot-sidebar-tab', title: 'Show the shot and video panel', textContent: '🎬 Shots' })
    this.tab.addEventListener('click', () => this.setCollapsed(false))
    const header = el('header', { class: 'ss-header' },
      el('span', { class: 'ss-title', textContent: '🎬 Shot & video' }),
      this.button('—', () => this.setCollapsed(true), { title: 'Minimize the panel', cls: 'ss-icon' }))
    this.body = el('div', { class: 'ss-body' },
      this.buildTimeSection(),
      this.buildSunSection(),
      this.buildViewSection(),
      this.buildKeyframeSection(),
      this.buildShotSection(),
      this.buildExportSection(),
      this.buildQueueSection())
    this.statusLine = el('div', { class: 'ss-status' })
    this.root.append(header, this.body, this.statusLine)
    document.body.append(this.root, this.tab)
    this.setCollapsed(this.state.collapsed)
  }

  setCollapsed(collapsed) {
    this.state.collapsed = collapsed
    this.root.hidden = collapsed
    this.tab.hidden = !collapsed
    document.body.classList.toggle('shot-sidebar-open', !collapsed)
    this.save()
  }

  buildTimeSection() {
    const s = this.shots
    this.simTimeText = el('div', { class: 'ss-big' })
    this.dateText = el('div', { class: 'ss-sub' })
    this.shotTimeText = el('div', { class: 'ss-sub' })
    this.playButton = this.button('', () => s.togglePlay(), { title: 'Play / pause (Space)', cls: 'ss-icon', iconName: 'play' })
    this.reverseButton = this.button('', () => (s.rate < 0 ? s.pause() : s.play(-1)), { title: 'Play backwards (rewind)', cls: 'ss-icon', iconName: 'reverse' })
    const transport = el('div', { class: 'ss-transport' },
      this.button('', () => { s.pause(); s.setPlayhead(0) }, { title: 'Go to the start of the shot', cls: 'ss-icon', iconName: 'start' }),
      this.reverseButton,
      this.button('', () => s.stepFrames(-1), { title: 'Back one frame (,)', cls: 'ss-icon', iconName: 'stepBack' }),
      this.playButton,
      this.button('', () => s.stepFrames(1), { title: 'Forward one frame (.)', cls: 'ss-icon', iconName: 'stepForward' }),
      this.button('', () => { s.pause(); s.setPlayhead(s.duration) }, { title: 'Go to the end of the shot', cls: 'ss-icon', iconName: 'end' }),
      this.select(PLAYBACK_SPEEDS.map(v => [v, `${v}x`]), () => s.playbackSpeed, (v) => s.setPlaybackSpeed(Number(v)), { title: 'Playback speed (fast forward / rewind rate)' }))
    this.eventSelect = el('select', { class: 'ss-select ss-grow', title: 'Jump to a moment' })
    this.eventSelect.addEventListener('change', () => {
      const t = Number(this.eventSelect.value)
      if (Number.isFinite(t)) { s.pause(); s.jumpToSimTime(t) }
      this.eventSelect.value = ''
      this.eventSelect.blur()
    })
    this.eventsLabel = el('div', { class: 'ss-sub' })
    const jumpSim = this.jumpSim = this.number(() => this.app.clock.time.toFixed(2), (v) => { s.pause(); s.jumpToSimTime(v) }, { min: 0, title: 'Simulated time to jump to (s)' })
    const jumpShot = this.jumpShot = this.number(() => s.playhead.toFixed(2), (v) => { s.pause(); s.setPlayhead(v) }, { title: 'Shot time to jump to (s)' })
    return this.section('time', 'Time', true,
      this.simTimeText, this.dateText, this.shotTimeText,
      transport,
      this.checkbox('Loop the shot', () => s.loop, (v) => { s.loop = v }),
      this.row('Simulated time (s)', jumpSim),
      this.row('Shot time (s)', jumpShot),
      this.eventsLabel,
      el('div', { class: 'ss-line' },
        this.button('◀ Previous', () => this.jumpEvent(-1), { title: 'Jump to the previous event' }),
        this.eventSelect,
        this.button('Next ▶', () => this.jumpEvent(1), { title: 'Jump to the next event' })))
  }

  buildSunSection() {
    const store = this.app.store
    const setParam = (name, value) => {
      store.set(name, value)
      store.derive()
      this.app.gui.refresh()
    }
    this.dayText = el('span', { class: 'ss-value' })
    this.timeOfDayText = el('span', { class: 'ss-value' })
    this.sunInfo = el('div', { class: 'ss-sub' })
    const enabled = this.app.sunFollowsDate
    const section = this.section('sun', 'Sun', false,
      this.row('Day of year', this.range(1, 365, 1, () => Math.max(1, store.get('sunDayOfYear')), (v) => setParam('sunDayOfYear', v)), this.dayText),
      this.row('Time of day (UTC)', this.range(0, 24, 0.05, () => Math.max(0, store.get('sunTimeOfDayUTC')), (v) => setParam('sunTimeOfDayUTC', v)), this.timeOfDayText),
      this.sunInfo,
      el('div', { class: 'ss-hint', textContent: enabled
        ? 'The date and time at simulated time 0. The sun then moves on with simulated time (a time warp moves it faster).'
        : 'This preset places the sun itself, so these have no effect here.' }))
    return section
  }

  buildViewSection() {
    const s = this.shots
    const camera = this.app.camera3d
    this.freeButton = this.button('Free view', () => s.setViewMode('free'), { title: 'Fly the camera with the mouse; the shot\'s path is shown in the scene (B)', cls: 'ss-toggle' })
    this.shotButton = this.button('Shot camera', () => s.setViewMode('shot'), { title: 'See what the shot\'s camera sees at the playhead, framed like the video (B)', cls: 'ss-toggle' })
    this.followText = el('div', { class: 'ss-sub' })
    this.fovRange = this.range(5, 120, 0.5, () => camera.fov.toFixed(1), (v) => {
      camera.fov = v
      camera.updateProjectionMatrix()
    }, { title: 'The free camera\'s field of view; keyframes take it' })
    return this.section('view', 'View', true,
      el('div', { class: 'ss-line' }, this.freeButton, this.shotButton),
      this.button('▶ Play the shot from the start', () => s.playShot(), { cls: 'ss-wide ss-primary' }),
      this.row('Field of view (°)', this.fovRange),
      this.checkbox('Show the shot\'s path in the free view', () => s.prefs.showPath, (v) => { s.prefs.showPath = v }),
      el('div', { class: 'ss-line' },
        this.button('Move view to shot camera', () => { s.setViewMode('free'); s.moveViewToShotCamera() }, { title: 'Put the free camera where the shot camera is at the playhead' }),
        this.button('Stop following', () => s.followAnchor(WORLD_ANCHOR), { title: 'Stop moving the free camera with an object' })),
      this.followText)
  }

  buildKeyframeSection() {
    const s = this.shots
    this.timeline = new Timeline(s)
    this.keyList = el('div', { class: 'ss-keylist' })
    this.editor = this.buildKeyEditor()
    return this.section('keys', 'Keyframes', true,
      this.timeline.canvas,
      el('div', { class: 'ss-line' },
        this.button('Fit', () => this.timeline.fit(), { title: 'Fit the shot in the timeline (wheel zooms, shift+wheel or middle-drag pans)' }),
        this.button('+ Add keyframe', () => s.addKeyframe(), { title: 'Add a keyframe at the playhead from the current view (A)', cls: 'ss-primary ss-grow' })),
      this.keyList,
      this.editor)
  }

  // The anchor menu: the world, each kind of object (choosing one takes the object of that kind
  // nearest the middle of the keyframe's view), or the current object.
  anchorOptions(includeSame) {
    const options = []
    if (includeSame) options.push(['same', 'Same as camera'])
    options.push(['world', 'World (fixed to the planet)'])
    for (const [type, kind] of Object.entries(ANCHOR_KINDS)) options.push([type, `${kind.label} (nearest in view)`])
    return options
  }

  anchorSelect(field) {
    const s = this.shots
    const select = el('select', { class: 'ss-select ss-grow' })
    const fill = (current) => {
      select.replaceChildren()
      const options = this.anchorOptions(field === 'lookAt')
      if (current && !isWorldAnchor(current)) options.unshift(['current', s.resolver.label(current)])
      for (const [value, label] of options) select.append(el('option', { value, textContent: label }))
    }
    select.addEventListener('change', () => {
      const i = s.selected
      const v = select.value
      select.blur()
      if (v === 'current') return
      if (v === 'same') { s.setKeyframeProps(i, { lookAt: null }); return }
      if (v === 'world') { s.setKeyframeProps(i, { [field]: WORLD_ANCHOR }); return }
      const anchor = s.nearestAnchorForKeyframe(i, v)
      if (!anchor) {
        s.setStatus(`There is no ${ANCHOR_KINDS[v].label.toLowerCase()} at this keyframe's moment. Jump to a time when one exists (see the events under Time).`)
        this.syncEditor()
        return
      }
      this.applyAnchor(field, anchor)
    })
    const sync = () => {
      const key = this.selectedKey
      if (!key || document.activeElement === select) return
      const current = field === 'lookAt' ? key.lookAt : key.anchor
      fill(current)
      select.value = current && !isWorldAnchor(current) ? 'current' : (field === 'lookAt' && !current ? 'same' : 'world')
    }
    this.editorSyncs.push(sync)
    return select
  }

  applyAnchor(field, anchor) {
    const s = this.shots
    const key = this.selectedKey
    if (!key) return
    if (field === 'anchor') anchor = { ...anchor, orient: key.anchor?.orient ?? anchor.orient }
    s.setKeyframeProps(s.selected, { [field]: anchor })
    s.setStatus(`Keyframe ${s.selected + 1}: ${field === 'lookAt' ? 'looks at' : 'camera moves with'} ${s.resolver.label(anchor)}.`)
    if (field === 'anchor' && s.viewMode === 'free') s.followAnchor(anchor)
  }

  pickButton(field) {
    const s = this.shots
    return this.button('🎯 Pick', () => {
      if (s.picking) { s.cancelPick(); return }
      s.setViewMode('free')
      s.setStatus('Click a vehicle, sled, nut or elevator car in the view (Esc cancels).')
      s.startPick((anchor) => {
        if (anchor === undefined) s.setStatus('Picking cancelled.')
        else if (!anchor) s.setStatus('Nothing to pick there: click closer to a vehicle, sled, nut or elevator car.')
        else this.applyAnchor(field, anchor)
      })
    }, { title: 'Pick the object by clicking it in the view' })
  }

  buildKeyEditor() {
    const s = this.shots
    this.editorSyncs = []
    const key = () => this.selectedKey ?? {}
    const set = (patch) => s.setKeyframeProps(s.selected, patch)
    const field = (control, get) => {
      this.editorSyncs.push(() => {
        if (document.activeElement === control) return
        const v = get()
        if (control.type === 'checkbox') control.checked = !!v
        else control.value = String(v)
      })
      return control
    }
    const plain = (tag, props) => el(tag, props)
    const time = field(plain('input', { type: 'number', class: 'ss-number', step: 'any', min: 0 }), () => (key().time ?? 0).toFixed(3))
    time.addEventListener('change', () => { set({ time: Number(time.value) }); time.blur() })
    const orient = field(plain('select', { class: 'ss-select ss-grow' }), () => key().anchor?.orient ?? 'follow')
    for (const o of ANCHOR_ORIENTS) orient.append(el('option', { value: o, textContent: ORIENT_LABELS[o] }))
    orient.addEventListener('change', () => { set({ anchor: { ...key().anchor, orient: orient.value } }); orient.blur() })
    this.orientRow = this.row('Camera frame', orient)
    const speed = field(plain('select', { class: 'ss-select' }), () => key().speed ?? 1)
    const speedNumber = field(plain('input', { type: 'number', class: 'ss-number', step: 'any', min: 0 }), () => key().speed ?? 1)
    const fillSpeeds = () => {
      const current = key().speed ?? 1
      speed.replaceChildren(...[...new Set([...TIME_SPEEDS, current])].sort((a, b) => a - b).map(v => el('option', { value: String(v), textContent: speedText(v) })))
    }
    this.editorSyncs.unshift(fillSpeeds)
    speed.addEventListener('change', () => { set({ speed: Number(speed.value) }); speed.blur() })
    speedNumber.addEventListener('change', () => { const v = Number(speedNumber.value); if (v >= 0) set({ speed: v }); speedNumber.blur() })
    const ease = field(plain('input', { type: 'checkbox' }), () => key().ease)
    ease.addEventListener('change', () => { set({ ease: ease.checked }); ease.blur() })
    const motion = field(plain('select', { class: 'ss-select ss-grow' }), () => key().motion ?? 'auto')
    for (const [v, label] of Object.entries(MOTION_LABELS)) motion.append(el('option', { value: v, textContent: label }))
    motion.addEventListener('change', () => { set({ motion: motion.value }); motion.blur() })
    const fov = field(plain('input', { type: 'number', class: 'ss-number', step: 'any', min: 1, max: 170 }), () => (key().fov ?? 45).toFixed(1))
    fov.addEventListener('change', () => { set({ fov: Number(fov.value) }); fov.blur() })
    this.editorTitle = el('div', { class: 'ss-editor-title' })
    const simTime = field(plain('input', { type: 'number', class: 'ss-number', step: 'any', min: 0, title: 'The simulated moment of this keyframe. Changing it sets this keyframe\'s time speed (or, for the first, the shot\'s start).' }),
      () => (this.selectedKey ? s.simTimeAt(this.selectedKey.time) : 0).toFixed(2))
    const adjust = plain('select', { class: 'ss-select ss-grow', title: 'Which time speed changes when you set the simulated time' })
    adjust.append(el('option', { value: 'previous', textContent: 'Previous keyframe\'s speed' }), el('option', { value: 'this', textContent: 'This keyframe\'s speed' }))
    adjust.addEventListener('change', () => adjust.blur())
    simTime.addEventListener('change', () => { s.setKeyframeSimTime(s.selected, Number(simTime.value), { adjust: adjust.value }); simTime.blur() })
    const simNow = this.button('Now', () => s.setKeyframeSimTime(s.selected, this.app.clock.time, { adjust: adjust.value }), { title: 'Make this keyframe happen at the current simulated time (jump there first, for example to an event under Time)' })
    this.adjustRow = this.row('…by changing', adjust)
    this.anchorText = el('div', { class: 'ss-sub ss-anchor-text' })
    return el('div', { class: 'ss-editor' },
      this.editorTitle,
      this.row('Time in shot (s)', time),
      this.row('Simulated time (s)', simTime, simNow),
      this.adjustRow,
      this.row('Camera moves with', this.anchorSelect('anchor'), this.pickButton('anchor')),
      this.anchorText,
      this.orientRow,
      this.row('Looks at', this.anchorSelect('lookAt'), this.pickButton('lookAt')),
      this.row('Time speed', speed, speedNumber),
      this.row('Field of view (°)', fov),
      this.row('Path to next', motion),
      el('label', { class: 'ss-check', title: 'The camera slows to a stop at this keyframe and starts off gently' }, ease, 'Ease in and out (stop here)'),
      el('div', { class: 'ss-line' },
        this.button('Go to', () => s.goToKeyframe(s.selected), { title: 'Move the playhead and the free camera to this keyframe' }),
        this.button('Update from view', () => s.updateKeyframeFromView(), { title: 'Set this keyframe to the current view, relative to its objects as they are now' }),
        this.button('Delete', () => s.deleteKeyframe(), { title: 'Delete this keyframe (K)', cls: 'ss-danger' })))
  }

  syncEditor() {
    const key = this.selectedKey
    this.editor.hidden = !key
    if (!key) return
    const s = this.shots
    this.editorTitle.textContent = `Keyframe ${s.selected + 1} of ${s.keyframes.length}`
    this.orientRow.hidden = isWorldAnchor(key.anchor)
    this.anchorText.textContent = [key.anchor, key.lookAt].filter(a => a && !isWorldAnchor(a)).map((a, n) => `${n === 0 && !isWorldAnchor(key.anchor) ? 'Moves with' : 'Looks at'}: ${s.resolver.label(a)}`).join('\n')
    this.adjustRow.hidden = s.selected === 0
    for (const sync of this.editorSyncs) sync()
  }

  rebuildKeyList() {
    const s = this.shots
    const rows = s.keyframes.map((k, i) => {
      const label = s.resolver.label(k.anchor)
      const row = el('div', { class: `ss-key${i === s.selected ? ' selected' : ''}`, title: 'Go to this keyframe' },
        el('span', { class: 'ss-key-index', textContent: String(i + 1) }),
        el('span', { class: 'ss-key-time', textContent: secondsText(k.time) }),
        el('span', { class: 'ss-key-anchor', textContent: label }),
        el('span', { class: 'ss-key-speed', textContent: (k.speed ?? 1) === 1 ? '' : speedText(k.speed) }))
      row.addEventListener('click', () => s.goToKeyframe(i))
      return row
    })
    if (!rows.length) rows.push(el('div', { class: 'ss-hint', textContent: 'No keyframes yet. Frame a view, move the playhead, and press "+ Add keyframe" (A).' }))
    this.keyList.replaceChildren(...rows)
  }

  buildShotSection() {
    const s = this.shots
    const name = el('input', { type: 'text', class: 'ss-text ss-grow' })
    name.addEventListener('change', () => { s.setName(name.value); name.blur() })
    this.bind(name, () => s.shot.name)
    return this.section('shot', 'Shot', false,
      this.row('Name', name),
      this.row('Starts at sim time (s)',
        this.number(() => s.shot.simulation.startTime.toFixed(2), (v) => s.setStartTime(v), { min: 0 }),
        this.button('Now', () => s.setStartToNow(), { title: 'Start the shot at the current simulated time' })),
      this.row('Duration (s)',
        this.number(() => s.shot.output.duration, (v) => s.setOutput({ duration: Math.max(0.1, v) }), { min: 0.1 }),
        this.button('Fit', () => { const last = s.keyframes.at(-1); if (last) s.setOutput({ duration: Math.max(0.1, last.time) }) }, { title: 'End the shot at the last keyframe' })),
      this.row('Interpolation', this.select([['smooth', 'Smooth spline'], ['linearEased', 'Linear, eased corners'], ['linear', 'Linear (live takes)']], () => s.shot.camera.interpolation, (v) => s.setInterpolation(v))),
      this.cornerRow = this.row('Corner length (s)',
        this.number(() => s.shot.camera.cornerSeconds ?? DEFAULT_CORNER_SECONDS, (v) => s.setCornerSeconds(v), { min: 0, step: 0.1, title: 'How long (± seconds) the camera eases around each keyframe, blending the straight line in with the straight line out' })),
      el('div', { class: 'ss-line' },
        this.button('New shot', () => { if (!s.keyframes.length || confirm('Start a new shot? The current keyframes will be discarded unless you export them.')) s.newShot() }, { title: 'An empty shot starting at the current simulated time' }),
        this.button('Import…', () => s.chooseShotFile(), { title: 'Load a .shot.json file' }),
        this.button('Export…', () => s.exportShot(), { title: 'Save the shot (with every parameter) as a .shot.json file' })))
  }

  buildExportSection() {
    const s = this.shots
    const o = () => s.shot.output
    const resolutionValue = () => {
      const match = RESOLUTIONS.find(([w, h]) => w === o().width && h === o().height)
      return match ? `${match[0]}x${match[1]}` : 'custom'
    }
    const resolution = this.select([...RESOLUTIONS.map(([w, h]) => [`${w}x${h}`, `${w} × ${h}${h > w ? ' (portrait)' : ''}`]), ['custom', 'Custom']], resolutionValue, (v) => {
      if (v === 'custom') return
      const [width, height] = v.split('x').map(Number)
      s.setOutput({ width, height })
    })
    const codecs = Object.entries(CODEC_LABELS).map(([k, v]) => [k, v])
    const containers = Object.entries(CONTAINERS).map(([k, v]) => [k, v.label])
    this.renderButton = this.button('⏺ Render video', () => s.renderShot(), { cls: 'ss-wide ss-primary', title: 'Render the shot frame by frame and save it as a video' })
    this.liveButton = this.button('Start live take', () => (s.mode === 'live' ? s.stop() : s.startLiveTake()), { title: 'Record the camera as you fly it (replaces the current shot)' })
    return this.section('export', 'Video export', false,
      this.row('Resolution', resolution),
      this.row('Width × height',
        this.number(() => o().width, (v) => s.setOutput({ width: Math.round(v) }), { min: 16, step: 2, width: '5.5em' }),
        this.number(() => o().height, (v) => s.setOutput({ height: Math.round(v) }), { min: 16, step: 2, width: '5.5em' })),
      this.row('Frame rate', this.select(FRAME_RATES.map(f => [f, `${f} fps`]), () => o().fps, (v) => s.setOutput({ fps: Number(v) }))),
      this.row('Codec (preferred)', this.select(codecs, () => o().codec, (v) => s.setOutput({ codec: v }))),
      this.row('Container', this.select(containers, () => o().container, (v) => s.setOutput({ container: v }))),
      this.row('Bitrate (Mbps, 0 = auto)', this.number(() => o().bitrateMbps ?? 0, (v) => s.setOutput({ bitrateMbps: v > 0 ? v : null }), { min: 0 })),
      this.row('Motion blur', this.select([['off', 'Off'], ['adaptive', 'Adaptive (by camera motion)'], ['fixed', 'Fixed sub-frames']], () => o().motionBlur, (v) => s.setOutput({ motionBlur: v }), { title: 'Average several renders per frame, spread over the shutter time, so fast motion past repeated structures blurs instead of strobing. Rendering takes as many times longer as there are sub-frames.' })),
      this.blurRows = el('div', { class: 'ss-editor' },
        this.row('Shutter angle', this.select([[90, '90°'], [180, '180° (film look)'], [270, '270°'], [360, '360° (no gaps)']], () => o().shutterAngle, (v) => s.setOutput({ shutterAngle: Number(v) }), { title: 'How much of each frame\'s time the sub-frames cover. 360° leaves no gaps between frames, which removes the most strobing.' })),
        this.blurSamplesRow = this.row('Sub-frames', this.number(() => o().motionBlurSamples, (v) => s.setOutput({ motionBlurSamples: Math.max(1, Math.round(v)) }), { min: 1, step: 1 })),
        this.blurAdaptiveRows = el('div', {},
          this.row('Camera step near things (m)', this.number(() => o().motionBlurMaxStep, (v) => v > 0 && s.setOutput({ motionBlurMaxStep: v }), { min: 0.01, title: 'How far the camera may move between sub-frames close to things. Keep it below about half the spacing of the repeated structures it passes (mass-driver brackets are about 5 m apart). Further from everything the step grows, keeping the nearest scenery moving no more than the pixel limit below.' })),
          this.row('Scenery motion per sub-frame (px)', this.number(() => o().motionBlurMaxPixels, (v) => v > 0 && s.setOutput({ motionBlurMaxPixels: v }), { min: 0.1 })),
          this.row('Most sub-frames per frame', this.number(() => o().motionBlurMaxSamples, (v) => s.setOutput({ motionBlurMaxSamples: Math.max(1, Math.round(v)) }), { min: 1, step: 1 }))),
        this.blurHint = el('div', { class: 'ss-hint' }),
        this.button('Preview this frame', () => this.previewFrame(), { title: 'Render the video frame at the playhead as the recording will (with motion blur) and show it', cls: 'ss-wide' })),
      this.row('Supersampling', this.select(SUPERSAMPLE_OPTIONS, () => o().supersample ?? 1, (v) => s.setOutput({ supersample: Number(v) }), { title: 'Render each frame at a higher resolution and filter it down to the video size: smoother edges, tethers and fine detail than antialiasing alone. 2 × 2 takes about four times as long and much more graphics memory (at 4K, about 1.5 GB more).' })),
      this.supersampleHint = el('div', { class: 'ss-hint' }),
      this.checkbox('Wait for terrain tiles', () => o().waitForTerrain, (v) => s.setOutput({ waitForTerrain: v }), { title: 'Each frame waits for the terrain it shows to load (slower, but no blurry tiles)' }),
      typeof window.showSaveFilePicker === 'function'
        ? this.checkbox('Stream to a file (large videos)', () => s.prefs.saveToDisk, (v) => { s.prefs.saveToDisk = v })
        : null,
      isRecordingSupported() ? null : el('div', { class: 'ss-hint', textContent: 'This browser has no WebCodecs video encoder, so videos cannot be rendered here. Shots can still be made, previewed and exported.' }),
      this.renderButton,
      el('div', { class: 'ss-line' }, this.liveButton, this.checkbox('Encode the live take', () => s.prefs.encodeLiveTake, (v) => { s.prefs.encodeLiveTake = v })))
  }

  // The render queue: shots (with their own output settings) rendered one after another, unattended.
  buildQueueSection() {
    const q = this.shots.queue
    this.queueList = el('div', { class: 'ss-queue' })
    this.queueSummary = el('div', { class: 'ss-sub' })
    this.queueProgress = el('div', { class: 'ss-queue-progress' })
    this.queueFolder = el('span', { class: 'ss-grow ss-queue-folder' })
    this.queueStart = this.button('▶ Render the queue', () => (q.running ? q.stop() : q.start()), { cls: 'ss-wide ss-primary', title: 'Render every waiting shot, one after another, and save each video. The page reloads between shots (each shot\'s preset and scene are set up afresh).' })
    this.queueContinue = this.button('Continue (allow folder access)', () => q.continueRun(), { cls: 'ss-wide ss-primary', title: 'The browser needs your permission again to save into the output folder' })
    this.queueLog = el('pre', { class: 'ss-queue-log' })
    const folderRow = q.supportsFolders
      ? this.row('Save videos in', this.queueFolder,
        this.button('Choose…', () => q.chooseFolder(), { title: 'Choose the folder the videos are saved in (no dialog per video)' }))
      : el('div', { class: 'ss-hint', textContent: 'Each video is downloaded when it is finished (this browser cannot write into a folder; Chrome and Edge can). The browser may ask once whether the page can download several files.' })
    return this.section('queue', 'Render queue', false,
      el('div', { class: 'ss-line' },
        this.button('+ This shot', () => q.addCurrentShot(), { title: 'Add a copy of the current shot (with its output settings and the scene as it is now) to the queue', cls: 'ss-grow' }),
        this.button('+ Shot files…', () => q.chooseFiles(), { title: 'Add .shot.json files (or the shots of a .queue.json file)', cls: 'ss-grow' })),
      this.queueList,
      this.queueSummary,
      folderRow,
      this.checkbox('Fresh page for every shot', () => q.run.freshPage, (v) => { q.run.freshPage = v; q.save() }, { title: 'Reload the page before each shot, so each starts from a freshly built scene with fresh memory (otherwise the page only reloads to change preset)' }),
      this.queueStart,
      this.queueContinue,
      this.queueProgress,
      el('div', { class: 'ss-line' },
        this.button('Clear finished', () => q.clearFinished(), { title: 'Remove the shots that are done or failed' }),
        this.button('Export queue…', () => q.exportQueue(), { title: 'Save the queue as a .queue.json file, to render it from the command line (npm run render) or on another computer' })),
      el('details', { class: 'ss-queue-details' }, el('summary', { textContent: 'Log' }), this.queueLog),
      el('div', { class: 'ss-hint', textContent: 'Rendering runs best with this tab visible and the computer kept awake. For long unattended runs, npm run render renders an exported queue headless (see the README).' }))
  }

  onQueueChange(kind) {
    if (kind === 'progress') { this.updateQueueProgress(); return }
    if (this._queueFrame) return
    this._queueFrame = requestAnimationFrame(() => {
      this._queueFrame = null
      this.rebuildQueue()
    })
  }

  queueItemText(item) {
    const o = item.shot.output
    const ss = (o.supersample ?? 1) > 1 ? ` · ${o.supersample}×${o.supersample} SS` : ''
    const blur = o.motionBlur !== 'off' ? ' · blur' : ''
    return `${item.shot.preset} · ${o.width}×${o.height} @ ${o.fps} · ${(this.shots.queue.framesOf(item) / o.fps).toFixed(1)} s · ${CODEC_LABELS[o.codec]} ${CONTAINERS[o.container]?.label ?? ''}${ss}${blur}`
  }

  rebuildQueue() {
    const q = this.shots.queue
    const names = q.fileNames()
    const statusLabels = { pending: 'waiting', rendering: 'rendering', done: 'done', failed: 'failed', skipped: 'skipped' }
    const rows = q.items.map((item, i) => {
      const open = this._queueOpen === item.id
      const row = el('div', { class: `ss-queue-item ss-queue-${item.status}${open ? ' open' : ''}` })
      const head = el('div', { class: 'ss-queue-head' },
        el('span', { class: 'ss-key-index', textContent: String(i + 1) }),
        el('span', { class: 'ss-queue-name', textContent: item.shot.name, title: names.get(item.id) }),
        el('span', { class: 'ss-queue-status', textContent: statusLabels[item.status] }),
        this.button('▲', () => q.move(item.id, -1), { cls: 'ss-icon', title: 'Move up' }),
        this.button('▼', () => q.move(item.id, 1), { cls: 'ss-icon', title: 'Move down' }),
        this.button('✎', () => { this._queueOpen = open ? null : item.id; this.rebuildQueue() }, { cls: 'ss-icon', title: 'Output settings' }),
        this.button('✕', () => q.remove(item.id), { cls: 'ss-icon ss-danger', title: 'Remove from the queue' }))
      row.append(head, el('div', { class: 'ss-hint', textContent: this.queueItemText(item) }))
      if (item.error) row.append(el('div', { class: 'ss-hint ss-queue-error', textContent: item.error }))
      if (item.status === 'done' && item.outputFile) row.append(el('div', { class: 'ss-hint', textContent: `Saved ${item.outputFile}` }))
      if (open) row.append(this.buildQueueItemEditor(item, names.get(item.id)))
      return row
    })
    if (!rows.length) rows.push(el('div', { class: 'ss-hint', textContent: 'The queue is empty. Set up a shot and press "+ This shot", or add shot files.' }))
    this.queueList.replaceChildren(...rows)
    const c = q.counts
    this.queueSummary.textContent = q.items.length ? `${c.pending} waiting, ${c.done} done${c.failed ? `, ${c.failed} failed` : ''}${c.rendering ? ', 1 rendering' : ''}.` : ''
    if (this.queueFolder) this.queueFolder.textContent = q.folder ? `📁 ${q.folder.name}` : 'Downloads (no folder chosen)'
    this.queueStart.textContent = q.running ? '■ Stop the queue' : '▶ Render the queue'
    this.queueStart.disabled = !q.running && !c.pending
    this.queueContinue.hidden = !q.waitingForPermission
    this.queueLog.textContent = q.log.slice(-40).join('\n')
    this.updateQueueProgress()
  }

  // Output settings of one queued shot (they are the shot's own; the editor's shot is not changed).
  buildQueueItemEditor(item, fileName) {
    const q = this.shots.queue
    const o = item.shot.output
    const set = (patch) => q.setOutput(item.id, patch)
    const resolutionValue = RESOLUTIONS.find(([w, h]) => w === o.width && h === o.height)
    const plainSelect = (options, value, onChange) => {
      const select = el('select', { class: 'ss-select ss-grow' })
      for (const [v, label] of options) select.append(el('option', { value: String(v), textContent: label }))
      select.value = String(value)
      select.addEventListener('change', () => onChange(select.value))
      return select
    }
    const numberInput = (value, onChange, props = {}) => {
      const input = el('input', { type: 'number', class: 'ss-number', value: String(value), ...props })
      input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v)) onChange(v) })
      return input
    }
    const name = el('input', { type: 'text', class: 'ss-text ss-grow', value: item.fileName, placeholder: fileName })
    name.addEventListener('change', () => q.setFileName(item.id, name.value.trim()))
    const terrain = el('input', { type: 'checkbox', checked: o.waitForTerrain })
    terrain.addEventListener('change', () => set({ waitForTerrain: terrain.checked }))
    return el('div', { class: 'ss-editor' },
      this.row('File name', name),
      this.row('Resolution', plainSelect([...RESOLUTIONS.map(([w, h]) => [`${w}x${h}`, `${w} × ${h}`]), ['custom', 'Custom']], resolutionValue ? `${resolutionValue[0]}x${resolutionValue[1]}` : 'custom', (v) => {
        if (v === 'custom') return
        const [width, height] = v.split('x').map(Number)
        set({ width, height })
      })),
      this.row('Width × height',
        numberInput(o.width, (v) => set({ width: Math.max(16, Math.round(v)) }), { min: 16, step: 2 }),
        numberInput(o.height, (v) => set({ height: Math.max(16, Math.round(v)) }), { min: 16, step: 2 })),
      this.row('Frame rate', plainSelect(FRAME_RATES.map(f => [f, `${f} fps`]), o.fps, (v) => set({ fps: Number(v) }))),
      this.row('Codec (preferred)', plainSelect(Object.entries(CODEC_LABELS), o.codec, (v) => set({ codec: v }))),
      this.row('Container', plainSelect(Object.entries(CONTAINERS).map(([k, v]) => [k, v.label]), o.container, (v) => set({ container: v }))),
      this.row('Bitrate (Mbps, 0 = auto)', numberInput(o.bitrateMbps ?? 0, (v) => set({ bitrateMbps: v > 0 ? v : null }), { min: 0 })),
      this.row('Supersampling', plainSelect(SUPERSAMPLE_OPTIONS, o.supersample ?? 1, (v) => set({ supersample: Number(v) }))),
      this.row('Motion blur', plainSelect([['off', 'Off'], ['adaptive', 'Adaptive'], ['fixed', 'Fixed sub-frames']], o.motionBlur, (v) => set({ motionBlur: v }))),
      el('label', { class: 'ss-check' }, terrain, 'Wait for terrain tiles'),
      el('div', { class: 'ss-line' },
        this.button('Open in the editor', () => q.edit(item.id), { title: 'Load this shot to change its camera or timing (add it again afterwards)' }),
        item.status === 'pending' ? null : this.button('Render again', () => q.renderAgain(item.id), { title: 'Put this shot back in the queue' })))
  }

  updateQueueProgress() {
    const q = this.shots.queue
    const p = q.progress
    if (!q.running) { this.queueProgress.textContent = ''; return }
    if (!p) { this.queueProgress.textContent = q.waitingForPermission ? 'Paused: waiting for folder access.' : 'Preparing the next shot…'; return }
    const item = q.items.find(i => i.id === p.id)
    const left = q.secondsLeft
    this.queueProgress.textContent = `${item?.shot.name ?? ''}: frame ${p.frame} / ${p.frames}${left === null ? '' : `, about ${formatDuration(left)} left`}`
  }

  // ---- Updates --------------------------------------------------------------------------------

  onChange(kind) {
    const s = this.shots
    if (kind === 'shot') {
      this.updateBlurRows()
      this.updateSupersampleHint()
      this.cornerRow.hidden = s.shot.camera.interpolation !== 'linearEased'
      this.rebuildKeyList()
      this.syncEditor()
      for (const sync of this.syncs) sync()
      this._eventsKey = null
    }
    if (kind === 'mode') {
      this.freeButton.classList.toggle('active', s.viewMode === 'free')
      this.shotButton.classList.toggle('active', s.viewMode === 'shot')
      this.root.classList.toggle('busy', s.busy)
      this.liveButton.textContent = s.mode === 'live' ? 'Stop live take' : 'Start live take'
      for (const sync of this.syncs) sync()
    }
    if (kind === 'status') this.statusLine.textContent = s.status
  }

  async previewFrame() {
    const image = await this.shots.previewFrame()
    if (!image) return
    const overlay = el('div', { class: 'ss-still', title: 'Click to close' },
      el('img', { src: image, alt: 'The video frame at the playhead' }),
      el('div', { class: 'ss-still-caption', textContent: `Frame at ${this.shots.playhead.toFixed(2)} s, as recorded. Click to close.` }))
    overlay.addEventListener('click', () => overlay.remove())
    document.body.append(overlay)
  }

  // Says when the GPU cannot supersample this much at the output size.
  updateSupersampleHint() {
    const o = this.shots.shot.output
    const factor = this.shots.supersampleFactor(o)
    this.supersampleHint.hidden = factor === (o.supersample ?? 1)
    this.supersampleHint.textContent = `This graphics card renders at most ${(factor * o.width).toFixed(0)} pixels across at this size, so ${factor === 1 ? 'there will be no supersampling' : `it will be ${factor} × ${factor}`}.`
  }

  // Shows the motion blur settings that apply, and how much rendering they cost for this shot.
  updateBlurRows() {
    const s = this.shots
    const o = s.shot.output
    this.blurRows.hidden = o.motionBlur === 'off'
    this.blurAdaptiveRows.hidden = o.motionBlur !== 'adaptive'
    this.blurSamplesRow.querySelector('.ss-label').textContent = o.motionBlur === 'adaptive' ? 'Fewest sub-frames' : 'Sub-frames'
    if (o.motionBlur === 'off') return
    clearTimeout(this._blurEstimate)
    this._blurEstimate = setTimeout(() => {
      const { total, most, frames } = s.estimateSubFrames()
      this.blurHint.textContent = `This shot: ${total.toLocaleString()} renders for ${frames.toLocaleString()} frames (up to ${most} per frame), about ${(total / frames).toFixed(1)}x the time of rendering without blur.`
    }, 300)
  }

  // The anchor whose events the Time section offers: the selected keyframe's object (or what it looks
  // at), else the launches.
  eventsAnchor() {
    const key = this.selectedKey
    if (key && !isWorldAnchor(key.anchor)) return key.anchor
    if (key?.lookAt && !isWorldAnchor(key.lookAt)) return key.lookAt
    return WORLD_ANCHOR
  }

  refreshEvents() {
    const s = this.shots
    const anchor = this.eventsAnchor()
    const now = this.app.clock.time
    const key = `${JSON.stringify(anchor)}|${s.revision}|${Math.floor(now / 30)}`
    if (key === this._eventsKey) return
    this._eventsKey = key
    this.events = s.eventsFor(anchor)
    this.eventsLabel.textContent = `Events: ${isWorldAnchor(anchor) ? 'launches' : s.resolver.label(anchor)}`
    const options = [el('option', { value: '', textContent: this.events.length ? 'Jump to…' : 'No events nearby' })]
    for (const e of this.events) options.push(el('option', { value: String(e.simTime), textContent: `${e.simTime.toFixed(1)} s  ${e.name}` }))
    this.eventSelect.replaceChildren(...options)
    this.eventSelect.value = ''
  }

  jumpEvent(direction) {
    const s = this.shots
    this._eventsKey = null
    this.refreshEvents()
    const now = this.app.clock.time
    const events = direction > 0 ? this.events.filter(e => e.simTime > now + 1e-3) : this.events.filter(e => e.simTime < now - 1e-3).reverse()
    const e = events[0]
    if (!e) { s.setStatus('No more events in that direction (within two hours).'); return }
    s.pause()
    s.jumpToSimTime(e.simTime)
    s.setStatus(`${e.name} at ${e.simTime.toFixed(2)} s.`)
  }

  setIcon(button, name) {
    if (button.dataset.icon === name) return
    button.dataset.icon = name
    button.replaceChildren(icon(name))
  }

  // The place in view (for local times): the orbit target, or the point below the camera.
  viewLatLon() {
    const app = this.app
    let p = app.planetCoordSys.worldToLocal(app.camera.controls.target.clone())
    if (p.length() < app.planetRadius / 2) p = app.planetCoordSys.worldToLocal(app.camera3d.getWorldPosition(_v).clone())
    return tram.ecefToGeodetic(p.x, p.y, p.z, app.planetSpec.ellipsoid)
  }

  // Per animation frame: readouts that change continuously.
  updateLive() {
    if (this.state.collapsed) return
    const s = this.shots
    const app = this.app
    const now = app.clock.time
    this.simTimeText.textContent = `Sim time ${secondsText(now)}`
    const speed = s.speedAt(s.playhead)
    const inShot = s.playhead >= 0 && s.playhead <= s.duration
    this.shotTimeText.textContent = `Shot ${secondsText(s.playhead)} of ${secondsText(s.duration)}${inShot ? '' : ' (outside the shot)'} · time speed ${speedText(speed)}`
    this.setIcon(this.playButton, s.rate > 0 ? 'pause' : 'play')
    this.setIcon(this.reverseButton, s.rate < 0 ? 'pause' : 'reverse')
    for (const [input, value] of [[this.jumpSim, now], [this.jumpShot, s.playhead]]) {
      if (document.activeElement !== input) input.value = value.toFixed(2)
    }
    this.playButton.classList.toggle('active', s.rate > 0)
    this.reverseButton.classList.toggle('active', s.rate < 0)
    const following = app.camera.tracker.type === 'shotAnchor' && s.following
    this.followText.textContent = following ? `Free camera moves with: ${s.resolver.label(s.following)}` : ''
    this.fovRange.disabled = s.viewMode === 'shot'

    const store = app.store
    const day = Math.max(1, store.get('sunDayOfYear'))
    const hours = Math.max(0, store.get('sunTimeOfDayUTC'))
    this.dayText.textContent = dateText(day)
    this.timeOfDayText.textContent = clockText(hours)
    if (app.sunFollowsDate) {
      const date = advanceDate(day, hours, now)
      this.dateText.textContent = `${dateText(date.dayOfYear)}, ${clockText(date.utcHours)} UTC`
      if ((this._sunFrame = (this._sunFrame ?? 0) + 1) % 10 === 0) {
        const geo = this.viewLatLon()
        const local = date.utcHours + geo.lon / 15
        const elevation = sunElevation(geo.lat, geo.lon, date.dayOfYear, date.utcHours)
        this.sunInfo.textContent = `Now, at the place in view (${geo.lat.toFixed(1)}°, ${geo.lon.toFixed(1)}°): ${clockText(local)} local solar time, sun ${elevation.toFixed(1)}° ${elevation >= 0 ? 'above' : 'below'} the horizon.`
      }
    }
    else this.dateText.textContent = ''

    this.refreshEvents()
    this.timeline.draw()
  }
}
