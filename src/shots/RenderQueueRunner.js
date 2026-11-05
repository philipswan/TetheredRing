// Runs the render queue (RenderQueue.js) in the browser, unattended: each waiting shot in turn is
// loaded, rendered at the fixed step (ShotController.renderShotUnattended) and saved, and a shot that
// fails is logged and skipped.
//
// Each shot needs its own preset, and presets set construction-time options, so the page reloads to
// switch (and, by default, before every shot, so each starts from a freshly built scene with fresh
// memory). The queue, the run's state, the log and the chosen output folder live in IndexedDB, so the
// run carries on after the reload; it also survives closing the tab (open the page again to resume).
//
// Videos and per-shot .render subfolders go into a folder chosen once (Chrome, Edge); elsewhere
// segments are retained in browser storage. Browsers keep folder access for the session; if it lapses after a
// reload the run pauses until "Continue" grants it again.
//
// Overnight: a hidden or minimised tab is throttled by the browser, so the run asks for a screen wake
// lock and the fixed-step loop yields without animation frames while hidden, but keeping the tab
// visible is safest. scripts/render-shots.mjs (npm run render) renders a queue file headless instead.
import {
  createQueue, addToQueue, removeFromQueue, moveInQueue, resetItem, findItem, nextPending, markInterrupted,
  outputFileNames, itemFrames, summarize, validateQueue, serializeQueue, parseShotOrQueue, QUEUE_FILE_EXTENSION,
} from './RenderQueue.js'
import { serializeShot } from './ShotFormat.js'
import { downloadText } from '../app/exports.js'
import { randomUUID } from '../utils/randomUUID.js'

const DB_NAME = 'tetheredRing.renderQueue'
const STORE = 'kv'
const LOG_LIMIT = 500
const RESUME_DELAY_MS = 1500

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function dbRequest(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export class RenderQueueRunner {
  constructor(app, shots) {
    this.app = app
    this.shots = shots
    this.queue = createQueue()
    // running: a run is in progress (carries over reloads); freshPage: reload before every shot;
    // returnShot: the shot being edited when the run started, loaded again when it ends.
    this.run = { running: false, freshPage: true, settleSeconds: 5, returnShot: null, renderedInPage: 0 }
    this.folder = null
    this.folderPath = ''
    this.projectRecords = {}
    this.legacyRender = null // migration input only; never used directly by render actions
    this.log = []
    this.progress = null // { id, frame, frames, startedAt (ms, page clock) }
    this.waitingForPermission = false
    this.listeners = new Set()
    this.ready = this.load()
  }

  get supportsFolders() { return typeof window.showDirectoryPicker === 'function' }
  get running() { return this.run.running }
  get items() { return this.queue.items }
  get counts() { return summarize(this.queue) }

  // fn(kind): 'queue' after any change to the queue, the run or the log; 'progress' as frames finish.
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(kind = 'queue') {
    for (const fn of this.listeners) fn(kind)
  }

  // ---- Persistence -----------------------------------------------------------------------------

  async load() {
    try {
      this.db = await openDb()
      const [queue, run, folder, log, folderPath, projectRecords, legacyRender] = await Promise.all(['queue', 'run', 'folder', 'log', 'folderPath', 'projectRecords', 'lastRender'].map(k => dbRequest(this.db, 'readonly', s => s.get(k))))
      if (queue) this.queue = validateQueue(queue)
      if (run) this.run = { ...this.run, ...run, renderedInPage: 0 }
      this.folder = folder ?? null
      this.log = log ?? []
      this.folderPath = folderPath ?? ''
      this.projectRecords = projectRecords ?? {}
      this.legacyRender = legacyRender ?? null
    }
    catch (err) {
      console.warn('The render queue could not be loaded:', err)
    }
    this.emit()
  }

  async save({ strict = false } = {}) {
    this.emit()
    if (!this.db) {
      if (strict) throw new Error('Browser storage is unavailable; project file and folder permissions cannot be remembered.')
      return
    }
    try {
      const { renderedInPage, ...run } = this.run
      await dbRequest(this.db, 'readwrite', (s) => {
        s.put(this.queue, 'queue')
        s.put(run, 'run')
        s.put(this.folder, 'folder')
        s.put(this.folderPath, 'folderPath')
        s.put(this.projectRecords, 'projectRecords')
        return s.put(this.log, 'log')
      })
    }
    catch (err) {
      console.warn('The render queue could not be saved:', err)
      if (strict) throw err
    }
  }

  note(text) {
    const line = `${new Date().toLocaleString()}  ${text}`
    this.log.push(line)
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT)
    console.info(`Render queue: ${text}`)
  }

  // ---- Editing the queue -----------------------------------------------------------------------

  // Adds the shot being edited (with the scene as it is now, like an export).
  async addCurrentShot() {
    await this.ready
    if (!this.shots.shot.camera.keyframes.length) { this.shots.setStatus('Add at least one keyframe before queueing the shot.'); return null }
    this.shots.syncShotFromApp()
    const item = addToQueue(this.queue, this.shots.shot)
    this.note(`Added "${item.shot.name}".`)
    await this.save()
    return item
  }

  // Adds shot files and the items of queue files.
  async addFiles(files) {
    await this.ready
    for (const file of files) {
      try {
        const { shots, queue } = parseShotOrQueue(await file.text())
        if (shots.some(shot => !shot.camera.keyframes.length)) throw new Error('the shot has no keyframes')
        for (const shot of shots) addToQueue(this.queue, shot)
        for (const item of queue?.items ?? []) addToQueue(this.queue, item.shot, { fileName: item.fileName })
        this.note(`Added ${file.name}${queue ? ` (${queue.items.length} shots)` : ''}.`)
      }
      catch (err) {
        this.note(`Could not add ${file.name}: ${err.message}`)
      }
    }
    await this.save()
  }

  chooseFiles() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.json,application/json'
    input.onchange = () => this.addFiles([...input.files])
    input.click()
  }

  remove(id) {
    if (this.progress?.id === id) return
    removeFromQueue(this.queue, id)
    return this.save()
  }

  move(id, delta) {
    moveInQueue(this.queue, id, delta)
    return this.save()
  }

  renderAgain(id) {
    const item = findItem(this.queue, id)
    if (item && item.status !== 'rendering') {
      if (item.status === 'done') item.fileName = `${item.fileName || item.shot.name}_${randomUUID().slice(0, 8)}`
      resetItem(item)
    }
    return this.save()
  }

  clearFinished() {
    this.queue.items = this.queue.items.filter(i => i.status === 'pending' || i.status === 'rendering')
    return this.save()
  }

  // Changes an item's output settings (the shot's own `output`) or its file name.
  setOutput(id, patch) {
    const item = findItem(this.queue, id)
    if (!item) return
    Object.assign(item.shot.output, patch)
    return this.save()
  }

  setFileName(id, fileName) {
    const item = findItem(this.queue, id)
    if (!item) return
    item.fileName = fileName
    return this.save()
  }

  // Loads an item's shot into the editor (switching preset if needed).
  edit(id) {
    const item = findItem(this.queue, id)
    if (item) this.shots.importShotText(serializeShot(item.shot))
  }

  fileNames() {
    return outputFileNames(this.queue)
  }

  framesOf(item) {
    return itemFrames(item)
  }

  exportQueue() {
    downloadText(serializeQueue(this.queue), 'render' + QUEUE_FILE_EXTENSION, 'application/json')
  }

  async chooseFolder() {
    if (!this.supportsFolders) return
    try {
      this.folder = await window.showDirectoryPicker({ id: 'tetheredRingRenderQueue', mode: 'readwrite', startIn: 'videos' })
      this.folderPath = ''
      this.note(`Videos will be saved in the folder "${this.folder.name}".`)
    }
    catch (err) {
      if (err.name !== 'AbortError') this.note(`Could not use that folder: ${err.message}`)
    }
    await this.save()
  }

  forgetFolder() {
    this.folder = null
    this.folderPath = ''
    return this.save()
  }

  // ---- Running --------------------------------------------------------------------------------

  async start({ freshPage = this.run.freshPage } = {}) {
    await this.ready
    if (this.running || this.shots.busy || this.shots._projectIO || this.shots.mode !== 'idle') return
    if (!nextPending(this.queue)) { this.note('Nothing is waiting to be rendered.'); await this.save(); return }
    if (!this.folder && !(await this.shots.outputFolder(true))) return
    // Folder access is granted in this click, so it carries over the reloads.
    if (this.folder && !(await this.ensureFolderAccess(true))) return
    this.shots.syncShotFromApp()
    this.run = { ...this.run, running: true, freshPage, returnShot: serializeShot(this.shots.shot), renderedInPage: 0 }
    const c = this.counts
    this.note(`Started: ${c.pending} shot${c.pending === 1 ? '' : 's'} to render${this.folder ? ` into "${this.folder.name}"` : ' (downloaded)'}.`)
    await this.save()
    this.loop()
  }

  // Pauses rendering after saving completed frames; the shot waits to resume.
  async stop() {
    if (!this.running) return
    this.run.running = false
    this.waitingForPermission = false
    this.stopRequested = true
    if (this.shots.mode === 'render') this.shots.stop()
    this.note('Pausing rendering; completed frames are being saved.')
    await this.save()
  }

  // Called once the page has started: carries on with a run that was in progress.
  resumeSoon() {
    setTimeout(async () => {
      await this.ready
      if (!this.running) return
      markInterrupted(this.queue)
      this.note(`Page loaded with preset "${this.app.presetId}"; carrying on.`)
      await this.save()
      if (this.folder && !(await this.ensureFolderAccess(false))) return
      this.loop()
    }, RESUME_DELAY_MS)
  }

  // Folder access: true if granted. `ask` only works during a click.
  async ensureFolderAccess(ask) {
    const options = { mode: 'readwrite' }
    try {
      if (!this.folder.queryPermission || (await this.folder.queryPermission(options)) === 'granted') return true
      if (ask && (await this.folder.requestPermission(options)) === 'granted') return true
    }
    catch (err) {
      this.note(`Folder access failed: ${err.message}`)
    }
    if (!ask) {
      this.waitingForPermission = true
      this.note('Waiting for access to the output folder: press Continue.')
      await this.save()
    }
    return false
  }

  // The Continue button: grants folder access again (a click) and carries on.
  async continueRun() {
    if (!this.running) return
    if (this.folder && !(await this.ensureFolderAccess(true))) return
    this.waitingForPermission = false
    this.emit()
    this.loop()
  }

  // Reloads the page with `presetId` (keeping its other URL parameters); the run resumes after it.
  reloadWith(presetId) {
    const url = new URL(window.location.href)
    url.searchParams.set('preset', presetId)
    window.location.assign(url.toString())
  }

  async loop() {
    if (this._looping) return
    this._looping = true
    this.stopRequested = false
    const wakeLock = await navigator.wakeLock?.request('screen').catch(() => null)
    try {
      while (this.running && !this.stopRequested) {
        const item = nextPending(this.queue)
        if (!item) { await this.finish(); return }
        if (item.shot.preset !== this.app.presetId || (this.run.freshPage && this.run.renderedInPage > 0)) {
          this.note(`Reloading the page for "${item.shot.name}" (preset "${item.shot.preset}").`)
          await this.save()
          this.reloadWith(item.shot.preset)
          return
        }
        await this.renderItem(item)
        this.run.renderedInPage++
        await this.save()
      }
    }
    finally {
      this._looping = false
      wakeLock?.release().catch(() => {})
    }
  }

  async renderItem(item) {
    const fileName = this.fileNames().get(item.id)
    Object.assign(item, { status: 'rendering', error: null, startedAt: new Date().toISOString(), finishedAt: null })
    this.progress = { id: item.id, frame: 0, frames: itemFrames(item), startedAt: performance.now() }
    this.note(`Rendering "${item.shot.name}" to ${fileName}.`)
    await this.save()
    try {
      const result = await this.shots.renderShotUnattended(item.shot, {
        directory: this.folder,
        fileName,
        settleSeconds: this.run.settleSeconds,
        onProgress: ({ frame, frames }) => {
          Object.assign(this.progress, { frame, frames })
          this.emit('progress')
        },
      })
      const seconds = (performance.now() - this.progress.startedAt) / 1000
      Object.assign(item, { status: 'done', outputFile: result.fileName, frames: result.frames, finishedAt: new Date().toISOString() })
      this.note(`Saved ${result.fileName}: ${result.frames} frames in ${formatDuration(seconds)}.`)
    }
    catch (err) {
      if (this.stopRequested) {
        resetItem(item)
        this.note(`Stopped "${item.shot.name}"; it is waiting again.`)
      }
      else {
        Object.assign(item, { status: 'failed', error: err.message ?? String(err), finishedAt: new Date().toISOString() })
        this.note(`Failed: "${item.shot.name}": ${item.error}`)
        console.error(err)
      }
    }
    this.progress = null
  }

  async finish() {
    const c = this.counts
    this.run.running = false
    this.note(`Finished: ${c.done} done, ${c.failed} failed.`)
    const returnShot = this.run.returnShot
    this.run.returnShot = null
    await this.save()
    // Back to the shot that was being edited (reloading for its preset if needed).
    if (returnShot) await this.shots.importShotText(returnShot)
  }

  // Seconds left for the item rendering now, from its progress so far (null before it has started).
  get secondsLeft() {
    const p = this.progress
    if (!p || p.frame < 2) return null
    const elapsed = (performance.now() - p.startedAt) / 1000
    return elapsed / p.frame * (p.frames - p.frame)
  }
}

export function formatDuration(seconds) {
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${s % 60} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
