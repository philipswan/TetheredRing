import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { URL } from 'node:url'
import console from 'node:console'
import { Blob } from 'node:buffer'
import { WritableStream } from 'node:stream/web'
import { RenderReview, reviewVideoPath } from '../../src/capture/RenderReview.js'
import '../support/rawImports.mjs'

const { structuredClone } = globalThis

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'virtual:render-build') {
      return { url: 'data:text/javascript,export const RENDER_BUILD_ID = "test"', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { ShotController } = await import('../../src/shots/ShotController.js')
const { ShotSidebar } = await import('../../src/ui/ShotSidebar.js')
const { parseShot, serializeShot } = await import('../../src/shots/ShotFormat.js')
const shotText = await readFile(new URL('../../shots/FollowLaunchVehicle.shot.json', import.meta.url), 'utf8')
const expectedShot = JSON.parse(shotText)

function controller() {
  const shots = Object.create(ShotController.prototype)
  shots.app = { presetId: 'toMarsHawaii' }
  shots.queue = { ready: Promise.resolve(), projectRecords: {}, save: async () => {} }
  shots.setStatus = text => { shots.status = text }
  shots.loadShot = shot => { shots.shot = shot; shots.setStatus('Shot loaded.') }
  return shots
}

function globalValue(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original)
    else delete globalThis[name]
  })
  Object.defineProperty(globalThis, name, { configurable: true, value })
}

function picker(t) {
  const inputs = []
  globalValue(t, 'document', {
    createElement() {
      return {
        value: '', files: [], listeners: {}, clicks: 0,
        addEventListener(kind, fn) { this.listeners[kind] = fn },
        click() { this.clicks++ },
      }
    },
    body: { append(input) { inputs.push(input) } },
  })
  return inputs
}

function sidebarFor(shots) {
  const sidebar = Object.create(ShotSidebar.prototype)
  sidebar.shots = shots
  sidebar.projectActions = []
  for (const key of ['projectSave', 'projectSaveAs', 'projectEdit', 'projectName', 'exportFolder', 'projectOutputRow', 'projectExportTo']) {
    sidebar[key] = {}
  }
  return sidebar
}

test('render progress is status-only while live takes keep their stop button', async t => {
  const overlays = []
  globalValue(t, 'document', {
    createElement(tagName) {
      return {
        tagName, children: [], listeners: {},
        append(...children) { this.children.push(...children) },
        addEventListener(kind, fn) { this.listeners[kind] = fn },
        remove() { this.removed = true },
      }
    },
    body: { appendChild(element) { overlays.push(element) } },
  })
  for (const mode of ['render', 'live']) {
    const shots = controller()
    shots.mode = mode
    let stops = 0
    shots.stop = () => { stops++ }
    shots.frameCanvas = () => ({
      getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
    })
    shots.app = {
      camera: { trackingMarker: { visible: true }, targetMarker: { visible: true }, orbitMarker: { visible: true } },
      renderer: {
        getContext: () => ({
          MAX_VIEWPORT_DIMS: 1, MAX_RENDERBUFFER_SIZE: 2,
          getParameter: parameter => parameter === 1 ? [4096, 4096] : 4096,
        }),
        capabilities: { maxTextureSize: 4096 },
        setAnimationLoop() {},
      },
      clock: { setFixedStep() {} },
      quality: { applyForRecording() {}, apply() {} },
      setRenderSize() {},
      onResizeAfterRecording() {},
    }
    await shots.runFixedStep({ width: 1, height: 1, fps: 30, perFrame: () => false })
    const overlay = overlays.at(-1)
    assert.equal(overlay.className, 'recording-overlay')
    assert.deepEqual(overlay.children.map(child => child.tagName), mode === 'render' ? ['span'] : ['span', 'button'])
    if (mode === 'live') {
      assert.equal(overlay.children[1].textContent, 'Stop live take')
      overlay.children[1].listeners.click()
      assert.equal(stops, 1)
    }
    assert.equal(overlay.removed, true)
  }
})

test('review assembles without a path prompt and distinguishes folder-relative locations from known absolute paths', async t => {
  globalValue(t, 'window', { prompt: () => assert.fail('Review must not request a typed path') })
  for (const rootPath of ['', 'C:\\Videos\\VideoCaptures']) {
    const shots = projectController()
    shots.mode = 'idle'
    shots.review = new RenderReview()
    shots.queue.supportsFolders = true
    shots.renderRoot = { name: 'VideoCaptures' }
    shots.renderRootPath = rootPath
    shots.renderJob = { savedFrames: 377, manifest: { fileName: 'FollowLaunchVehicle.mp4', shot: structuredClone(shots.shot) } }
    let fileName
    let result
    shots.assembleJob = async (job, writable, storage, options) => {
      assert.equal(job, shots.renderJob)
      fileName = options.fileName
    }
    shots.emit = kind => {
      if (kind === 'reviewReady') { result = shots.reviewResult; result.close() }
    }
    await shots.reviewSavedVideo()
    assert.match(fileName, /^FollowLaunchVehicle\.review-377-\d+\.mp4$/)
    assert.equal(result.path, reviewVideoPath(rootPath || 'VideoCaptures', fileName))
    assert.equal(result.isAbsolutePath, !!rootPath)
    assert.equal(result.frames, 377)
    assert.equal(shots.mode, 'idle')
    assert.equal(shots.review.running, false)
    assert.equal(shots.reviewResult, null)
    assert.equal(shots._reviewPreparing, false)
  }
})

test('review during rendering queues its checkpoint without asking for an absolute path', async t => {
  globalValue(t, 'window', { prompt: () => assert.fail('Review must not request a typed path') })
  const shots = projectController()
  shots.mode = 'render'
  shots.review = new RenderReview()
  shots.queue.supportsFolders = true
  shots.renderRoot = { name: 'VideoCaptures' }
  shots.renderRootPath = ''
  shots.renderJob = { savedFrames: 377, manifest: { fileName: 'FollowLaunchVehicle.mp4', shot: structuredClone(shots.shot) } }
  const events = []
  shots.activeRecorder = { checkpoint: async () => { events.push('checkpoint') } }
  shots.assembleJob = async () => { events.push('assemble') }
  shots.emit = kind => {
    if (kind === 'reviewReady') { events.push('popup'); shots.reviewResult.close() }
  }
  await shots.reviewSavedVideo()
  assert.equal(shots.review.requested, true)
  assert.deepEqual(events, [])
  await shots.review.service(shots.activeRecorder, () => shots.presentReviewVideo(shots.renderJob))
  assert.deepEqual(events, ['checkpoint', 'assemble', 'popup'])
  assert.match(shots.status, /Continuing rendering from the next frame/)
})

test('Resume permits older application versions and explains other disabled states', () => {
  const shots = projectController()
  shots.review = { requested: false, running: false }
  Object.assign(shots.shot.output, { fps: 30, supersample: 2, motionBlur: 'adaptive', motionBlurMaxSamples: 1024 })
  shots.renderJob = {
    savedFrames: 30, complete: false,
    manifest: {
      buildId: 'previous-build', frames: Math.round(shots.duration * shots.shot.output.fps), segments: [{}],
      shot: { ...structuredClone(shots.shot), name: 'Saved shot' },
    },
  }
  const sidebar = sidebarFor(shots)
  for (const key of ['renderSummary', 'renderResumeReason', 'renderButton', 'renderResume', 'renderRestart', 'renderAbort', 'renderReview', 'renderExport', 'renderOpen']) sidebar[key] = {}
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, false)
  assert.equal(sidebar.renderResume.hidden, false)
  assert.equal(sidebar.renderRestart.hidden, false)
  assert.equal(sidebar.renderRestart.disabled, false)
  assert.equal(sidebar.renderButton.hidden, true)
  assert.equal(sidebar.renderResumeReason.hidden, true)
  assert.equal(sidebar.renderResumeReason.textContent, '')
  assert.equal(sidebar.renderResume.title, 'Continue from the next unsaved frame')
  assert.equal(sidebar.renderReview.disabled, false)
  assert.equal(sidebar.renderExport.disabled, false)
  assert.doesNotMatch(sidebar.renderSummary.textContent, /different build/)

  shots.renderJob.manifest.buildId = 'test'
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, false)
  assert.equal(sidebar.renderResumeReason.hidden, true)
  assert.equal(sidebar.renderResumeReason.textContent, '')

  shots.setOutput({ supersample: 1, motionBlurMaxSamples: 4 })
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, false)
  assert.equal(sidebar.renderResumeReason.hidden, false)
  assert.match(sidebar.renderResumeReason.textContent, /Resume will use your current rendering settings.*saved segments are kept unchanged/)
  assert.equal(shots.renderJob.manifest.shot.output.supersample, 2)
  assert.equal(shots.renderJob.manifest.shot.output.motionBlurMaxSamples, 1024)

  shots.renderJob.complete = true
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, true)
  assert.match(sidebar.renderResumeReason.textContent, /Rendering is complete.*Export full video/)
  assert.equal(sidebar.renderRestart.disabled, false)

  shots.shot.output.duration = shots.duration + 1
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, false)
  shots.shot.output.duration = shots.renderJob.manifest.shot.output.duration

  shots.mode = 'render'
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, true)
  assert.equal(sidebar.renderRestart.disabled, true)
  assert.match(sidebar.renderResumeReason.textContent, /rendering or recording is active/)

  shots.mode = 'idle'
  shots.renderJob = null
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, true)
  assert.equal(sidebar.renderResume.hidden, true)
  assert.equal(sidebar.renderRestart.hidden, true)
  assert.equal(sidebar.renderButton.hidden, false)
  assert.equal(sidebar.renderButton.disabled, false)
  assert.equal(sidebar.renderResumeReason.hidden, true)

  shots.queue.projectRecords[shots.shot.project.id] = { lastRender: { name: 'Saved shot' } }
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.disabled, false)
  assert.equal(sidebar.renderResumeReason.hidden, true)
  assert.equal(sidebar.renderRestart.hidden, false)
  assert.equal(sidebar.renderButton.hidden, true)
})

test('Restart confirms deletion before dispatching and cancellation leaves the render untouched', async t => {
  const shots = projectController()
  shots.mode = 'idle'
  shots.renderRoot = { name: 'Test.render' }
  Object.assign(shots.shot.output, { supersample: 2, motionBlur: 'adaptive', motionBlurMaxSamples: 1024 })
  shots.renderJob = { savedFrames: 30, manifest: { shot: structuredClone(shots.shot) } }
  const job = shots.renderJob
  shots.setOutput({ supersample: 1, motionBlurMaxSamples: 4 })
  let confirmed = false
  let started = 0
  globalValue(t, 'window', {
    confirm(message) {
      assert.match(message, /permanently deletes.*prior video segments/)
      assert.match(message, /frame 0/)
      assert.match(message, /Existing exported videos are not deleted/)
      return confirmed
    },
  })
  shots.renderShotUnattended = async (shot, options) => {
    started++
    assert.notEqual(shot, job.manifest.shot)
    assert.notEqual(shot, shots.shot)
    assert.deepEqual(shot, shots.shot)
    assert.equal(shot.output.supersample, 1)
    assert.equal(shot.output.motionBlurMaxSamples, 4)
    assert.equal(job.manifest.shot.output.supersample, 2)
    assert.equal(job.manifest.shot.output.motionBlurMaxSamples, 1024)
    assert.equal(options.job, job)
    assert.equal(options.directory, shots.renderRoot)
    assert.equal(options.restart, true)
  }
  await shots.restartRender()
  assert.equal(started, 0)
  assert.equal(job.savedFrames, 30)
  confirmed = true
  await shots.restartRender()
  assert.equal(started, 1)
  shots.mode = 'render'
  await shots.restartRender()
  assert.equal(started, 1)
})

test('renderFrames passes no supersampling and enforces the edited maximum of four motion-blur sub-frames', async () => {
  const shots = projectController()
  shots.mode = 'idle'
  shots.playhead = 0
  shots.pause = () => {}
  shots.app.camera3d = { fov: 60 }
  shots.poseAt = time => ({ position: [1000 + time * 1000, 0, 0], target: [0, 0, 0] })
  shots.setPlayhead = time => { shots.playhead = time; return 1 / 60 }
  shots.supersampleFactor = output => output.supersample
  shots.setOutput({ supersample: 1, motionBlur: 'adaptive', motionBlurSamples: 16, motionBlurMaxSamples: 4 })
  let checked = false
  shots.runFixedStep = async options => {
    assert.equal(options.supersample, 1)
    assert.equal(options.blur, true)
    for (const i of [0, 1, 100]) {
      options.perFrame(i, 0)
      assert.equal(options.subFrames(i), 4)
    }
    checked = true
  }
  assert.equal(await shots.renderFrames(null), null)
  assert.equal(checked, true)
})

test('Resume takes current rendering settings without deleting segments or replacing the saved camera path', async t => {
  const shots = projectController()
  shots.mode = 'idle'
  Object.assign(shots.shot.output, { supersample: 2, motionBlur: 'adaptive', motionBlurMaxSamples: 1024 })
  shots.renderJob = { savedFrames: 30, manifest: { shot: structuredClone(shots.shot) } }
  shots.setOutput({ supersample: 1, motionBlurMaxSamples: 4, bitrateMbps: 25 })
  shots.shot.camera.keyframes[0].position = [4, 5, 6]
  globalValue(t, 'window', { confirm: () => assert.fail('Resume must not request deletion') })
  let started = false
  shots.renderShotUnattended = async (shot, options) => {
    assert.equal(options.restart, false)
    assert.equal(options.job, shots.renderJob)
    assert.equal(shot.output.supersample, 1)
    assert.equal(shot.output.motionBlurMaxSamples, 4)
    assert.equal(shot.output.bitrateMbps, 25)
    assert.deepEqual(shot.camera, shots.renderJob.manifest.shot.camera)
    assert.notEqual(shot.output, shots.shot.output)
    assert.equal(shots.renderJob.savedFrames, 30)
    started = true
  }
  await shots.resumeRender()
  assert.equal(started, true)
})

test('Resume retains edited rendering settings across a required preset switch', async () => {
  const shots = projectController()
  shots.mode = 'idle'
  shots.renderJob = { manifest: { shot: structuredClone(shots.shot) } }
  shots.renderJob.manifest.shot.preset = 'other-preset'
  shots.setOutput({ supersample: 1, motionBlurMaxSamples: 4 })
  let imported
  shots.importShotText = async text => { imported = parseShot(text) }
  shots.renderShotUnattended = () => assert.fail('Render must wait for the preset reload')
  await shots.resumeRender()
  assert.equal(imported.preset, 'other-preset')
  assert.equal(imported.output.supersample, 1)
  assert.equal(imported.output.motionBlurMaxSamples, 4)
})

test('Resume does not request deletion and remembered renders are loaded before Restart confirmation', async t => {
  const shots = projectController()
  shots.mode = 'idle'
  shots.queue.projectRecords[shots.shot.project.id] = { lastRender: { name: 'Remembered' } }
  const calls = []
  shots.loadRenderRecord = async record => {
    assert.equal(record, shots.projectRenderRecord)
    calls.push('load')
    shots.renderJob = { manifest: { shot: shots.shot } }
  }
  globalValue(t, 'window', { confirm: () => { calls.push('confirm'); return true } })
  shots.renderShotUnattended = async (shot, options) => { calls.push(options.restart ? 'restart' : 'resume') }
  await shots.restartRender()
  assert.deepEqual(calls, ['load', 'confirm', 'restart'])
  calls.length = 0
  await shots.resumeRender()
  assert.deepEqual(calls, ['resume'])
})

test('Restart runs inside the existing cross-tab render lock and a denied lock never starts it', async t => {
  const shots = projectController()
  shots.mode = 'idle'
  let available = false
  let started = 0
  globalValue(t, 'navigator', {
    locks: { request: async (name, options, action) => {
      assert.equal(name, 'tetheredRing.render')
      assert.equal(options.ifAvailable, true)
      return action(available ? {} : null)
    } },
  })
  shots.renderShotSession = async (shot, options) => { assert.equal(options.restart, true); started++ }
  await assert.rejects(shots.renderShotUnattended(shots.shot, { restart: true }), /Another browser tab/)
  assert.equal(started, 0)
  available = true
  await shots.renderShotUnattended(shots.shot, { restart: true })
  assert.equal(started, 1)
  assert.equal(shots.busy, false)
})

test('current shot label shows none until a project exists and follows its name', () => {
  const sidebar = sidebarFor({ hasProject: false, shot: { name: 'Untitled shot' }, projectRecord: null, renderFolderName: 'Untitled_shot.render' })
  sidebar.updateProjectUI()
  assert.equal(sidebar.projectName.textContent, 'Current Shot Name: <none>')
  assert.equal(sidebar.exportFolder.textContent, 'No folder selected in this browser.')
  assert.equal(sidebar.projectExportTo.textContent, 'Choose…')
  assert.equal(sidebar.projectSave.disabled, true)
  sidebar.shots.hasProject = true
  sidebar.shots.shot.name = 'FollowLaunchVehicle'
  sidebar.updateProjectUI()
  assert.equal(sidebar.projectName.textContent, 'Current Shot Name: FollowLaunchVehicle')
  assert.equal(sidebar.projectSave.disabled, false)
  sidebar.shots.shot.name = 'Renamed shot'
  sidebar.updateProjectUI()
  assert.equal(sidebar.projectName.textContent, 'Current Shot Name: Renamed shot')
})

test('Video Output Folder shows browser-provided names and explains how to restore a missing selection', () => {
  const shots = projectController()
  const sidebar = sidebarFor(shots)
  shots.shot.project.renderFolder = shots.renderFolderName
  for (const parent of ['C:\\Videos\\', 'C:\\', '\\\\server\\share\\', '/videos/', '/']) {
    shots.shot.project.outputPath = `${parent}${shots.renderFolderName}`
    sidebar.updateProjectUI()
    assert.equal(sidebar.exportFolder.textContent, 'No folder selected in this browser.')
    assert.match(sidebar.projectOutputRow.title, /Choose the folder containing "FollowLaunchVehicle.render" to restore this shot's output location\./)
    assert.equal(sidebar.projectExportTo.textContent, 'Choose…')
  }
  const parentName = 'VideoCaptures'
  shots.queue.projectRecords[shots.shot.project.id] = { directory: {}, parent: { name: parentName } }
  sidebar.updateProjectUI()
  assert.equal(sidebar.exportFolder.textContent, parentName)
  assert.equal(sidebar.projectExportTo.textContent, 'Change…')
  assert.equal(sidebar.projectOutputRow.title, 'Browser can only show the selected folder\'s name, not its full Windows path. Video and recovery files are saved inside a shot-specific subfolder under the Video Output Folder.\nCapture subfolder: "FollowLaunchVehicle.render".')
  shots.shot.name = 'Renamed shot'
  sidebar.updateProjectUI()
  assert.match(sidebar.projectOutputRow.title, /FollowLaunchVehicle.render/)
  delete shots.shot.project.outputPath
  sidebar.updateProjectUI()
  assert.equal(sidebar.exportFolder.textContent, parentName)
  delete shots.queue.projectRecords[shots.shot.project.id]
  sidebar.updateProjectUI()
  assert.equal(sidebar.exportFolder.textContent, 'No folder selected in this browser.')
})

test('shot picker stays attached, is reused, and permits reimporting the same file', async t => {
  const inputs = picker(t)
  const shots = controller()
  shots.chooseShotFile()
  const input = inputs[0]
  assert.equal(input.hidden, true)
  assert.equal(input.clicks, 1)
  input.files = [{ name: 'FollowLaunchVehicle.shot.json', text: async () => shotText }]
  await input.onchange()
  assert.equal(shots.shot.name, expectedShot.name)
  assert.equal(shots.shot.camera.keyframes.length, expectedShot.camera.keyframes.length)
  assert.equal(shots.shot.output.duration, expectedShot.output.duration)
  input.value = 'FollowLaunchVehicle.shot.json'
  shots.chooseShotFile()
  assert.equal(inputs.length, 1)
  assert.equal(input.value, '')
  assert.equal(input.clicks, 2)
  await input.onchange()
  assert.equal(shots.status, 'Shot loaded.')
  input.listeners.cancel()
  assert.equal(shots.status, 'Shot import cancelled.')
})

test('file read failures appear in the shot status instead of escaping the callback', async t => {
  picker(t)
  t.mock.method(console, 'error', () => {})
  const shots = controller()
  shots.chooseShotFile()
  shots.shotFileInput.files = [{
    name: 'unreadable.shot.json',
    text: async () => { throw new Error('Access denied') },
  }]
  await shots.shotFileInput.onchange()
  assert.match(shots.status, /Could not read shot "unreadable.shot.json": Access denied/)
})

test('invalid shot JSON and scene restoration failures are reported', async t => {
  t.mock.method(console, 'error', () => {})
  const shots = controller()
  const original = { name: 'Unsaved work' }
  shots.shot = original
  await shots.importShotText('{')
  assert.equal(shots.shot, original)
  assert.match(shots.status, /Could not import shot:/)
  shots.loadShot = () => { throw new Error('Scene restoration failed') }
  await shots.importShotText(shotText)
  assert.equal(shots.status, 'Could not import shot: Scene restoration failed')
})

function projectController() {
  const shots = controller()
  shots.shot = parseShot(shotText)
  shots.ensureProject()
  shots.queue = { ready: Promise.resolve(), projectRecords: {}, save: async () => {} }
  shots.emit = () => {}
  shots.syncShotFromApp = () => {}
  shots.writeAutosave = () => {}
  shots.changed = () => {}
  return shots
}

function fileHandle(name) {
  return {
    name, text: '',
    async createWritable() {
      return {
        write: async text => { this.pending = text },
        close: async () => { this.text = this.pending },
        abort: async () => {},
      }
    },
  }
}

test('Save updates the current file while Save as chooses a new file', async t => {
  const shots = projectController()
  const first = fileHandle('first.shot.json')
  const second = fileHandle('second.shot.json')
  let picks = 0
  globalValue(t, 'window', { showSaveFilePicker: async () => ++picks === 1 ? first : second })
  await shots.saveProject()
  assert.equal(picks, 1)
  assert.equal(parseShot(first.text).project.id, shots.shot.project.id)
  const firstId = shots.shot.project.id
  shots.shot.name = 'Edited shot'
  await shots.saveProject()
  assert.equal(picks, 1)
  assert.equal(parseShot(first.text).name, 'Edited shot')
  await shots.saveProject(true)
  assert.equal(picks, 2)
  assert.equal(shots.projectRecord.fileHandle, second)
  assert.equal(parseShot(second.text).name, 'Edited shot')
  assert.notEqual(parseShot(second.text).project.id, firstId)
  assert.equal(shots.queue.projectRecords[firstId].fileHandle, first)
})

test('a failed Save as does not replace the current project file', async t => {
  t.mock.method(console, 'error', () => {})
  const shots = projectController()
  const original = fileHandle('original.shot.json')
  shots.queue.projectRecords[shots.shot.project.id] = { fileHandle: original }
  globalValue(t, 'window', { showSaveFilePicker: async () => ({
    createWritable: async () => { throw new Error('Disk full') },
  }) })
  await shots.saveProject(true)
  assert.equal(shots.projectRecord.fileHandle, original)
  assert.match(shots.status, /Disk full/)
})

test('choosing an output folder remembers it and reopens the picker there on the next change', async t => {
  const shots = projectController()
  const handle = fileHandle('project.shot.json')
  shots.queue.projectRecords[shots.shot.project.id] = { fileHandle: handle }
  const directory = {
    name: 'FollowLaunchVehicle.render',
    getFileHandle: async () => { throw Object.assign(new Error('Missing'), { name: 'NotFoundError' }) },
    isSameEntry: async other => other === directory,
  }
  const parent = {
    name: 'Videos',
    async getDirectoryHandle(name, options) {
      assert.equal(name, 'FollowLaunchVehicle.render')
      assert.deepEqual(options, { create: true })
      return directory
    },
  }
  const picks = []
  globalValue(t, 'window', {
    showDirectoryPicker: async options => { picks.push(options); return parent },
    prompt: () => assert.fail('Selecting a folder must not require typing its path'),
  })
  assert.equal(await shots.chooseProjectExport(), true)
  assert.equal(picks[0].startIn, 'videos')
  assert.equal(shots.projectRecord.directory, directory)
  assert.equal(shots.projectRecord.parent, parent)
  assert.equal(shots.projectRecord.fileHandle, handle)
  const saved = parseShot(serializeShot(shots.shot))
  assert.equal(saved.project.renderFolder, 'FollowLaunchVehicle.render')
  assert.equal(JSON.stringify(saved).includes('getDirectoryHandle'), false)
  const sidebar = sidebarFor(shots)
  sidebar.updateProjectUI()
  assert.equal(sidebar.exportFolder.textContent, 'Videos')
  shots.shot.project.outputPath = 'C:\\Videos\\FollowLaunchVehicle.render'
  assert.equal(await shots.chooseProjectExport(), true)
  assert.equal(picks[1].startIn, parent)
  assert.equal(shots.shot.project.outputPath, 'C:\\Videos\\FollowLaunchVehicle.render')
})

test('Video Output Folder has a single chooser without manual path entry', async t => {
  const shots = projectController()
  let selections = 0
  shots.chooseProjectExport = async () => { selections++; return true }
  shots.enterOutputFolderPath = () => assert.fail('Choosing a folder must not ask for a typed path')
  globalValue(t, 'document', { createElement: () => ({ append() {}, setAttribute() {} }) })
  const sidebar = sidebarFor(shots)
  let choose
  const buttons = []
  const rows = []
  sidebar.button = (label, action) => { buttons.push(label); if (label === 'Choose…') choose = action; return null }
  sidebar.row = (label, ...controls) => { rows.push({ label, controls }); return { classList: { add() {} } } }
  for (const method of ['select', 'number', 'checkbox', 'section']) sidebar[method] = () => null
  sidebar.buildExportSettings()
  assert.equal(rows[0].label, 'Video Output Folder:')
  assert.equal(rows[0].controls[0], sidebar.exportFolder)
  assert.equal(rows[0].controls[1], sidebar.projectExportTo)
  assert.equal(buttons.filter(label => label === 'Choose…').length, 1)
  assert.equal(buttons.some(label => /Edit|Full path/.test(label)), false)
  await choose()
  assert.equal(selections, 1)
})

test('cancelling output-folder selection does not request a typed path', async t => {
  const shots = projectController()
  globalValue(t, 'window', {
    showDirectoryPicker: async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }) },
    prompt: () => assert.fail('A cancelled folder selection must not prompt for a path'),
  })
  assert.equal(await shots.chooseProjectExport(), false)
  assert.equal(shots.status, 'Export folder selection cancelled.')
})

test('Render video without a project export folder reminds the user and does not render', async t => {
  const shots = projectController()
  shots.mode = 'idle'
  let reminder
  globalValue(t, 'window', { alert: text => { reminder = text } })
  shots.renderShotUnattended = () => assert.fail('Rendering must not start')
  await shots.renderShot()
  assert.match(reminder, /Choose a Video Output Folder.*Shot settings/)
  assert.equal(shots.status, reminder)
})

test('native Open remembers the file for subsequent Save, including legacy shots', async t => {
  const shots = projectController()
  const handle = { name: 'legacy.shot.json', getFile: async () => ({ name: 'legacy.shot.json', text: async () => shotText }) }
  globalValue(t, 'window', { showOpenFilePicker: async () => [handle] })
  await shots.openShotProject()
  assert.equal(shots.shot.camera.keyframes.length, expectedShot.camera.keyframes.length)
  assert.equal(shots.projectRecord.fileHandle, handle)
})

test('native Open requests read permission before reading the selected file', async t => {
  const shots = projectController()
  const calls = []
  const handle = {
    queryPermission: async options => { calls.push(['query', options]); return 'prompt' },
    requestPermission: async options => { calls.push(['request', options]); return 'granted' },
    getFile: async () => {
      calls.push(['read'])
      return { name: 'shot.json', text: async () => shotText }
    },
  }
  globalValue(t, 'window', { showOpenFilePicker: async () => [handle] })
  await shots.openShotProject()
  assert.deepEqual(calls, [['query', { mode: 'read' }], ['request', { mode: 'read' }], ['read']])
  assert.equal(shots.projectRecord.fileHandle, handle)
})

test('blocked native reads fall back to the attached picker and load the complete shot', async t => {
  const inputs = picker(t)
  t.mock.method(console, 'warn', () => {})
  const shots = projectController()
  let nativePicks = 0
  globalValue(t, 'window', { showOpenFilePicker: async () => {
    nativePicks++
    return [{ getFile: async () => { throw Object.assign(new Error('Access blocked'), { name: 'NotAllowedError' }) } }]
  } })
  const original = shots.shot
  await shots.openShotProject()
  assert.equal(shots.shot, original)
  assert.equal(shots._projectIO, false)
  assert.match(shots.status, /browser blocked direct file access/)
  assert.equal(inputs[0].clicks, 1)
  inputs[0].files = [{ name: 'FollowLaunchVehicle.shot.json', text: async () => shotText }]
  await inputs[0].onchange()
  assert.equal(shots.shot.camera.keyframes.length, expectedShot.camera.keyframes.length)
  assert.equal(shots.shot.output.duration, expectedShot.output.duration)
  assert.match(shots.status, /Shot loaded.*Save will ask for a destination/)
  assert.equal(shots.projectRecord, null)
  await shots.openShotProject()
  assert.equal(nativePicks, 1)
  assert.equal(inputs[0].clicks, 2)
})

test('denied read permission uses the standard picker without reading the native handle', async t => {
  const inputs = picker(t)
  t.mock.method(console, 'warn', () => {})
  const shots = projectController()
  globalValue(t, 'window', { showOpenFilePicker: async () => [{
    queryPermission: async () => 'prompt',
    requestPermission: async () => 'denied',
    getFile: async () => assert.fail('A denied file must not be read'),
  }] })
  await shots.openShotProject()
  assert.equal(inputs[0].clicks, 1)
  assert.equal(shots._projectIO, false)
})

test('cancelling native Open preserves the project and does not open a second picker', async t => {
  const inputs = picker(t)
  const shots = projectController()
  const original = shots.shot
  globalValue(t, 'window', { showOpenFilePicker: async () => {
    throw Object.assign(new Error('Cancelled'), { name: 'AbortError' })
  } })
  await shots.openShotProject()
  assert.equal(shots.shot, original)
  assert.equal(inputs.length, 0)
  assert.equal(shots.status, 'Open cancelled.')
  assert.equal(shots._projectIO, false)
})

test('standard-picker Open forgets an unverified overwrite handle but retains the render folder', async t => {
  picker(t)
  const shots = projectController()
  const directory = { name: 'test.render' }
  shots.queue.projectRecords[shots.shot.project.id] = { directory, fileHandle: fileHandle('original.json') }
  const text = serializeShot(shots.shot)
  shots.chooseShotFile()
  shots.shotFileInput.files = [{ name: 'copy.shot.json', text: async () => text }]
  await shots.shotFileInput.onchange()
  assert.equal(shots.projectRecord.directory, directory)
  assert.equal(shots.projectRecord.fileHandle, undefined)
  assert.equal(shots.status, 'Shot loaded.')
})

test('project metadata round-trips, legacy shots remain readable, and folder paths are rejected', () => {
  const legacy = parseShot(shotText)
  assert.equal(legacy.project, undefined)
  legacy.project = { id: 'example-project', renderFolder: 'Example.render', outputPath: 'C:\\Videos\\Example.render' }
  assert.deepEqual(parseShot(serializeShot(legacy)).project, legacy.project)
  legacy.project.renderFolder = '..\\outside.render'
  assert.throws(() => parseShot(serializeShot(legacy)), /project.renderFolder/)
})


function emptyDirectory(name) {
  const files = new Map()
  return {
    name, files,
    async getFileHandle(file, { create = false } = {}) {
      if (!files.has(file)) {
        if (!create) throw Object.assign(new Error('Missing'), { name: 'NotFoundError' })
        files.set(file, '')
      }
      return {
        getFile: async () => new Blob([files.get(file)]),
        async createWritable() {
          let content = ''
          return new WritableStream({ write: text => { content += text }, close: () => files.set(file, content) })
        },
      }
    },
  }
}

async function renderDirectory(shots, name = 'Test.render') {
  const { RenderJob, writeJSON, RENDER_JOB_FILE } = await import('../../src/capture/RenderJob.js')
  const directory = emptyDirectory(name)
  directory.isSameEntry = async other => other === directory
  const manifest = {
    format: 'tethered-ring-render', version: 1, buildId: 'test',
    shot: structuredClone(shots.shot), fileName: 'Test.mp4', codec: 'av1',
    frames: Math.max(1, Math.round(shots.duration * shots.shot.output.fps)),
    decoderConfig: null, segments: [],
  }
  // Use real manifest validation so these exercise the same ownership checks as actual files.
  const job = new RenderJob({
    directory,
    read: async name => directory.files.has(name) ? new Blob([directory.files.get(name)]) : null,
    createWritable: async name => new WritableStream({ write: text => directory.files.set(name, text) }),
  }, manifest)
  await writeJSON(job.storage, RENDER_JOB_FILE, job.manifest)
  return { directory, job }
}

function renderSidebar(shots) {
  const sidebar = sidebarFor(shots)
  for (const key of ['renderSummary', 'renderResumeReason', 'renderButton', 'renderResume', 'renderRestart', 'renderAbort', 'renderReview', 'renderExport', 'renderOpen']) sidebar[key] = {}
  return sidebar
}

test('New project detaches the prior render and shows Start without touching its files', async () => {
  const shots = projectController()
  shots.review = new RenderReview()
  const { directory, job } = await renderDirectory(shots)
  const id = shots.shot.project.id
  const files = new Map(directory.files)
  shots.queue.projectRecords[id] = { directory, lastRender: { directory, name: 'Project A' } }
  shots.renderJob = job
  shots.renderRoot = directory
  shots.createShotNow = () => { const shot = structuredClone(shots.shot); delete shot.project; return shot }
  const next = shots.newShot()
  assert.notEqual(next.project.id, id)
  assert.equal(shots.currentRenderJob, null)
  assert.equal(shots.projectRenderRecord, null)
  assert.equal(shots.renderRoot, null)
  const sidebar = renderSidebar(shots)
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderButton.hidden, false)
  assert.equal(sidebar.renderResume.hidden, true)
  assert.equal(sidebar.renderRestart.hidden, true)
  assert.deepEqual(directory.files, files)
  assert.equal(shots.queue.projectRecords[id].lastRender.directory, directory)
})

test('opening project B restores only B and never restores global render history', async () => {
  const shots = projectController()
  shots.review = new RenderReview()
  const a = await renderDirectory(shots, 'A.render')
  const idA = shots.shot.project.id
  shots.queue.projectRecords[idA] = { directory: a.directory, lastRender: { directory: a.directory, name: 'A' } }
  shots.renderJob = a.job
  shots.renderRoot = a.directory
  shots.queue.lastRender = { directory: a.directory, name: 'Old global history' }
  const b = structuredClone(shots.shot)
  b.project = { id: 'project-b' }
  shots.restoreStart = shots.setPlayhead = () => {}
  shots.poseAt = () => null
  ShotController.prototype.loadShot.call(shots, b)
  await shots.restoreProjectRender()
  assert.equal(shots.currentRenderJob, null)
  assert.equal(shots.renderRoot, null)
  assert.equal(shots.projectRenderRecord, null)
  const sidebar = renderSidebar(shots)
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderButton.hidden, false)
  ShotController.prototype.loadShot.call(shots, a.job.manifest.shot)
  await shots.restoreProjectRender()
  assert.equal(shots.currentRenderJob.manifest.shot.project.id, idA)
  assert.equal(shots.renderRoot, a.directory)
})

test('stale project A render state cannot dispatch Resume, Restart, Review or Export from B', async t => {
  t.mock.method(console, 'error', () => {})
  const shots = projectController()
  shots.review = new RenderReview()
  const { job } = await renderDirectory(shots)
  shots.renderJob = job
  shots.shot = structuredClone(shots.shot)
  shots.shot.project.id = 'project-b'
  shots.renderShotUnattended = shots.assembleJob = () => assert.fail('A foreign render must not run')
  globalValue(t, 'window', { confirm: () => assert.fail('Foreign segments must not be offered for deletion') })
  await shots.resumeRender()
  await shots.restartRender()
  await shots.exportSavedVideo()
  await shots.reviewSavedVideo()
  assert.equal(shots.currentRenderJob, null)
  assert.equal(shots.review.requested, false)
})

test('Open render rejects a foreign manifest before attaching or remembering its folder', async () => {
  const shots = projectController()
  const { directory } = await renderDirectory(shots)
  shots.shot.project.id = 'project-b'
  await assert.rejects(shots.loadRenderRecord({ directory, root: directory }), /different shot project/)
  assert.equal(shots.renderJob, undefined)
  assert.equal(shots.projectRenderRecord, null)
})

test('an in-flight restore for A cannot attach itself after switching to B', async () => {
  const shots = projectController()
  const { directory } = await renderDirectory(shots)
  let release
  directory.queryPermission = () => new Promise(resolve => { release = resolve })
  const loading = shots.loadRenderRecord({ directory, root: directory }, false)
  shots.shot = structuredClone(shots.shot)
  shots.shot.project.id = 'project-b'
  release('granted')
  await loading
  assert.equal(shots.renderJob, undefined)
  assert.equal(shots.projectRenderRecord, null)
})

test('Save as creates an independent project without A render files or output handles', async t => {
  const shots = projectController()
  shots.review = new RenderReview()
  const { directory, job } = await renderDirectory(shots)
  const idA = shots.shot.project.id
  shots.shot.project.renderFolder = directory.name
  shots.shot.project.outputPath = 'C:\\Videos\\Test.render'
  const oldRecord = { fileHandle: fileHandle('A.shot.json'), directory, lastRender: { directory, name: 'A' } }
  shots.queue.projectRecords[idA] = oldRecord
  shots.renderJob = job
  shots.renderRoot = directory
  const saved = fileHandle('B.shot.json')
  globalValue(t, 'window', { showSaveFilePicker: async () => saved })
  await shots.saveProject(true)
  assert.notEqual(shots.shot.project.id, idA)
  assert.deepEqual(shots.projectRecord, { fileHandle: saved })
  assert.deepEqual(Object.keys(parseShot(saved.text).project), ['id'])
  assert.equal(shots.currentRenderJob, null)
  assert.equal(shots.renderRoot, null)
  assert.equal(shots.queue.projectRecords[idA], oldRecord)
})

test('different projects with the same shot name get separate output subfolders', async t => {
  const shots = projectController()
  const a = await renderDirectory(shots, 'FollowLaunchVehicle.render')
  const idA = shots.shot.project.id
  shots.queue.projectRecords[idA] = { directory: a.directory }
  shots.shot = structuredClone(shots.shot)
  shots.shot.project = { id: 'project-b' }
  const directoryB = emptyDirectory('FollowLaunchVehicle-project-b.render')
  directoryB.isSameEntry = async other => other === directoryB
  const requested = []
  const parent = { getDirectoryHandle: async name => { requested.push(name); return name === a.directory.name ? a.directory : directoryB } }
  globalValue(t, 'window', { showDirectoryPicker: async () => parent })
  assert.equal(await shots.chooseProjectExport(), true)
  assert.deepEqual(requested, [a.directory.name, directoryB.name])
  assert.equal(shots.projectRecord.directory, directoryB)
  assert.equal(shots.queue.projectRecords[idA].directory, a.directory)
})


test('render records are persisted by project id and cannot be attached to another current project', async () => {
  const shots = projectController()
  const { directory, job } = await renderDirectory(shots)
  const id = shots.shot.project.id
  await shots.rememberRender(job, directory)
  assert.equal(shots.projectRenderRecord.directory, directory)
  assert.equal(shots.projectRenderRecord.root, directory)
  assert.equal(shots.queue.lastRender, undefined)
  shots.shot = structuredClone(shots.shot)
  shots.shot.project.id = 'project-b'
  const foreignRecord = shots.queue.projectRecords[id]
  await assert.rejects(shots.rememberRender(job, directory), /different shot project/)
  assert.equal(shots.projectRenderRecord, null)
  assert.equal(shots.queue.projectRecords[id], foreignRecord)
})

test('Export checks the stored manifest owner before opening an output file', async () => {
  const shots = projectController()
  const { directory, job } = await renderDirectory(shots)
  const foreign = structuredClone(job.manifest)
  foreign.shot.project.id = 'project-b'
  directory.files.set('render.json', JSON.stringify(foreign))
  shots.renderRoot = { getFileHandle: () => assert.fail('No output file may be opened') }
  await assert.rejects(shots.assembleJob(job), /different shot project/)
})

test('Save as without a native save picker still creates a project without inherited outputs', async t => {
  const shots = projectController()
  const id = shots.shot.project.id
  shots.shot.project.renderFolder = 'Original.render'
  shots.queue.projectRecords[id] = { directory: { name: 'Original.render' } }
  globalValue(t, 'window', {})
  let exported
  shots.exportShot = () => { exported = structuredClone(shots.shot) }
  await shots.saveProject(true)
  assert.notEqual(exported.project.id, id)
  assert.deepEqual(Object.keys(exported.project), ['id'])
  assert.equal(shots.projectRecord, null)
})


test('project creation and live takes wait for a pending project file operation', async () => {
  const shots = projectController()
  shots.mode = 'idle'
  shots._projectIO = true
  const original = shots.shot
  shots.createShotNow = shots.pause = () => assert.fail('The current project must stay in place during file operations')
  assert.equal(shots.newShot(), undefined)
  await shots.startLiveTake()
  assert.equal(shots.shot, original)
})


test('the previous global render record migrates only when its manifest belongs to the current project', async () => {
  const shots = projectController()
  const { directory, job } = await renderDirectory(shots)
  directory.files.set('segment-000000.mp4', 'saved frames')
  await job.commit(15, { codec: 'av01.0.08M.08', codedWidth: shots.shot.output.width, codedHeight: shots.shot.output.height })
  shots.queue.legacyRender = { directory, root: directory, name: shots.shot.name }
  await shots.restoreProjectRender()
  assert.equal(shots.currentRenderJob.savedFrames, 15)
  assert.equal(shots.projectRenderRecord.directory, directory)
  const idA = shots.shot.project.id
  const recordA = shots.projectRecord
  shots.shot = structuredClone(shots.shot)
  shots.shot.project = { id: 'project-b' }
  shots.clearProjectRender()
  await shots.restoreProjectRender()
  assert.equal(shots.currentRenderJob, null)
  assert.equal(shots.projectRenderRecord, null)
  assert.equal(shots.queue.projectRecords[idA], recordA)
})

test('a legacy render in the known project directory stays discoverable after folder permission expires', async () => {
  const shots = projectController()
  shots.review = new RenderReview()
  const { directory } = await renderDirectory(shots)
  let granted = false
  let requested = 0
  directory.queryPermission = async () => granted ? 'granted' : 'prompt'
  directory.requestPermission = async () => { requested++; granted = true; return 'granted' }
  shots.queue.projectRecords[shots.shot.project.id] = { directory }
  shots.queue.legacyRender = { directory, root: directory, name: shots.shot.name }
  await shots.restoreProjectRender()
  assert.equal(requested, 0)
  assert.equal(shots.currentRenderJob, null)
  assert.equal(shots.projectRenderRecord.needsDiscovery, true)
  const sidebar = renderSidebar(shots)
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderButton.hidden, true)
  assert.equal(sidebar.renderResume.hidden, false)
  assert.equal(sidebar.renderResume.textContent, 'Check saved render')
  assert.equal(sidebar.renderRestart.disabled, true)
  shots.renderShotUnattended = () => assert.fail('Checking folder access must not start rendering')
  await shots.resumeRender()
  assert.equal(requested, 1)
  assert.equal(shots.currentRenderJob.manifest.shot.project.id, shots.shot.project.id)
  assert.equal(shots.projectRenderRecord.needsDiscovery, undefined)
})

test('checking an empty project folder clears discovery and restores Start render', async () => {
  const shots = projectController()
  shots.review = new RenderReview()
  const directory = emptyDirectory('Empty.render')
  let granted = false
  directory.queryPermission = async () => granted ? 'granted' : 'prompt'
  directory.requestPermission = async () => { granted = true; return 'granted' }
  shots.queue.projectRecords[shots.shot.project.id] = { directory }
  await shots.restoreProjectRender()
  assert.equal(shots.projectRenderRecord.needsDiscovery, true)
  await shots.resumeRender()
  assert.equal(shots.projectRenderRecord, null)
  const sidebar = renderSidebar(shots)
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderButton.hidden, false)
  assert.equal(sidebar.renderResume.hidden, true)
})

test('reopening the same legacy shot file reuses its browser project identity and render folder', async () => {
  const shots = projectController()
  const { directory } = await renderDirectory(shots)
  const id = shots.shot.project.id
  const handle = fileHandle('Legacy.shot.json')
  shots.queue.projectRecords[id] = { fileHandle: handle, directory }
  const reopened = { ...fileHandle('Legacy.shot.json'), isSameEntry: async other => other === handle }
  await shots.importShotText(shotText, { fileHandle: reopened, fromFile: true })
  assert.equal(shots.shot.project.id, id)
  assert.equal(shots.shot.project.renderFolder, directory.name)
  await shots.restoreProjectRender()
  assert.equal(shots.currentRenderJob.manifest.shot.project.id, id)
  assert.equal(shots.projectRecord.fileHandle, reopened)
})

test('a different legacy file with the same name cannot inherit the original project identity', async () => {
  const shots = projectController()
  const { directory } = await renderDirectory(shots)
  const id = shots.shot.project.id
  shots.queue.projectRecords[id] = { fileHandle: fileHandle('Legacy.shot.json'), directory }
  const other = { ...fileHandle('Legacy.shot.json'), isSameEntry: async () => false }
  await shots.importShotText(shotText, { fileHandle: other, fromFile: true })
  assert.notEqual(shots.shot.project.id, id)
  assert.equal(shots.projectRecord.directory, undefined)
  assert.equal(shots.projectRenderRecord, null)
})


test('the recovered autosave discovers an unowned legacy render despite a stale browser project id', async () => {
  const shots = projectController()
  shots.review = new RenderReview()
  const id = shots.shot.project.id
  const { directory, job } = await renderDirectory(shots)
  delete job.manifest.shot.project
  directory.files.set('segment-000000.mp4', 'existing saved video')
  await job.commit(3999, { codec: 'av01.0.08M.08', codedWidth: shots.shot.output.width, codedHeight: shots.shot.output.height })
  const original = structuredClone(job.manifest)
  const clip = directory.files.get('segment-000000.mp4')
  const parent = { name: 'VideoCaptures', isSameEntry: async () => false }
  shots.queue.projectRecords['old-browser-id'] = { directory, parent }
  shots.queue.legacyRender = { directory, root: parent, name: shots.shot.name }
  await shots.restoreProjectRender()
  assert.equal(shots.currentRenderJob, null)
  assert.equal(shots.projectRenderRecord.needsMigration, true)
  assert.equal(shots.projectRenderRecord.savedFrames, 3999)
  assert.equal(job.manifest.shot.project, undefined)
  const sidebar = renderSidebar(shots)
  sidebar.updateRenderCard()
  assert.equal(sidebar.renderResume.textContent, 'Recover saved render')
  assert.match(sidebar.renderSummary.textContent, /3999/)
  assert.equal(sidebar.renderRestart.disabled, true)
  shots.renderShotUnattended = () => assert.fail('Recovery must not start rendering')
  await shots.resumeRender()
  assert.equal(shots.currentRenderJob.savedFrames, 3999)
  assert.equal(shots.currentRenderJob.manifest.shot.project.id, id)
  assert.equal(shots.projectRecord.directory, directory)
  assert.equal(shots.projectRecord.parent, parent)
  assert.equal(shots.renderRoot, directory)
  assert.equal(directory.files.get('segment-000000.mp4'), clip)
  assert.deepEqual(JSON.parse(directory.files.get('render.before-project-migration.json')), original)
})

test('checking previous render cannot attach an owned foreign project or a different legacy shot', async t => {
  t.mock.method(console, 'error', () => {})
  for (const owned of [false, true]) {
    const shots = projectController()
    const { directory, job } = await renderDirectory(shots)
    if (owned) job.manifest.shot.project.id = 'foreign-owner'
    else { delete job.manifest.shot.project; job.manifest.shot.camera.keyframes[0].position = [9, 8, 7] }
    directory.files.set('render.json', JSON.stringify(job.manifest))
    const before = new Map(directory.files)
    shots.queue.legacyRender = { directory, root: directory, name: shots.shot.name }
    await shots.checkPreviousRender()
    assert.equal(shots.currentRenderJob, null)
    assert.equal(shots.projectRenderRecord, null)
    assert.deepEqual(directory.files, before)
    assert.match(shots.status, /different shot project/)
  }
})
