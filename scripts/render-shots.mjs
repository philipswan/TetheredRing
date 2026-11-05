// Renders shots to video from the command line, unattended (for example overnight): starts the Vite
// dev server, then for each shot opens a fresh page of the app in headless Chrome/Chromium/Edge with
// the shot's preset, renders it at the fixed step exactly as the panel's "Render video" does, and
// streams the encoded file into the output folder. A shot that fails (or stops making progress) is
// logged and skipped; the browser is restarted after a failure. Completed videos are skipped, while
// interrupted shots resume from committed clips in their .render subfolders.
//
//   npm run render -- [options] <file.shot.json | file.queue.json> ...
//
//   --out <folder>          where the videos go (default: renders); a log is kept there too
//   --overwrite             start a new render subfolder, preserving earlier clips
//   --settle <s>            seconds to let each page settle before rendering (default 5)
//   --stall-minutes <m>     give up on a shot after this long without a finished frame (default 30)
//   --load-minutes <m>      give up on a page that has not started after this long (default 5)
//   --workers <n>           render each shot in n browsers at once, a range of frames each (default 1).
//                           One browser keeps one CPU core busy but leaves the GPU mostly idle, so a few
//                           workers (up to about the GPU's headroom and the CPU cores) render faster.
//   --chunk-seconds <s>     with --workers: seconds of video in each range (default 5)
//   Output overrides for every shot (otherwise each shot's own settings are used):
//   --width <px> --height <px> --fps <n> --codec av1|avc|hevc|vp9 --container mp4|mkv
//   --bitrate <Mbps>         0 uses studio-quality constant quantization; positive values target a bitrate
//   --supersample 1|1.5|2|3|4 --motion-blur off|fixed|adaptive
//   --motion-blur-jitter on|off  jittered sub-frame times (see subFrameTimes in src/capture/MotionBlur.js)
//   --angle <backend>       ANGLE backend (Linux default gl-egl; Windows and macOS use the browser's default)
//   --headful               show the browser window
//
// Queue files are exported from the panel's Render queue section ("Export queue…"); their items'
// file names and output settings are used, and their status is ignored (what is in --out counts).
// Set CHROME_PATH if Chrome/Chromium/Edge is not found automatically.
/* global window, document */ // (inside page.evaluate)
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createQueue, addToQueue, outputFileNames, parseShotOrQueue, itemFrames } from '../src/shots/RenderQueue.js'
import { serializeShot } from '../src/shots/ShotFormat.js'
import { renderFolderName, RenderJob, segmentName } from '../src/capture/RenderJob.js'
import { chunkName, chunkRecordName, finishedChunks, planChunks, appendableChunks } from '../src/capture/RenderChunks.js'

const argv = process.argv.slice(2)
const flags = new Set(['overwrite', 'headful'])
const options = {}
const files = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) { files.push(a); continue }
  const name = a.slice(2)
  if (flags.has(name)) options[name] = true
  else options[name] = argv[++i]
}
if (!files.length) {
  console.log('Usage: npm run render -- [--out <folder>] [options] <file.shot.json | file.queue.json> ...\nSee the top of scripts/render-shots.mjs for the options.')
  process.exit(2)
}

const outDir = path.resolve(options.out ?? 'renders')
const settleSeconds = Number(options.settle ?? 5)
const stallMs = Number(options['stall-minutes'] ?? 30) * 60_000
const workerCount = Math.max(1, Math.round(Number(options.workers ?? 1)) || 1)
const chunkSeconds = Number(options['chunk-seconds'] ?? 5)
if (!(chunkSeconds > 0)) {
  console.error('--chunk-seconds must be a positive number of seconds.')
  process.exit(2)
}
const loadMs = Number(options['load-minutes'] ?? 5) * 60_000
fs.mkdirSync(outDir, { recursive: true })
const logFile = path.join(outDir, 'render-log.txt')

function log(text) {
  const line = `${new Date().toISOString()}  ${text}`
  console.log(line)
  fs.appendFileSync(logFile, line + '\n')
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = process.platform === 'win32'
    ? [
        `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']
  const found = candidates.find((p) => p && fs.existsSync(p))
  if (!found) throw new Error('Chrome/Chromium/Edge not found. Set CHROME_PATH to its executable.')
  return found
}

// ---- The shots ----------------------------------------------------------------------------------

const queue = createQueue()
for (const file of files) {
  try {
    const { shots, queue: fileQueue } = parseShotOrQueue(fs.readFileSync(file, 'utf8'))
    for (const shot of shots) addToQueue(queue, shot)
    for (const item of fileQueue?.items ?? []) addToQueue(queue, item.shot, { fileName: item.fileName })
  }
  catch (err) {
    console.error(`${file}: ${err.message}`)
    process.exit(2)
  }
}
const overrides = {
  width: options.width && Number(options.width),
  height: options.height && Number(options.height),
  fps: options.fps && Number(options.fps),
  codec: options.codec,
  container: options.container,
  bitrateMbps: options.bitrate && Number(options.bitrate),
  supersample: options.supersample && Number(options.supersample),
  motionBlur: options['motion-blur'],
  motionBlurJitter: options['motion-blur-jitter'] === undefined ? undefined : !['off', 'false', 'no', '0'].includes(String(options['motion-blur-jitter']).toLowerCase()),
}
for (const item of queue.items) {
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined && v !== null && v !== '') item.shot.output[k] = v
}
const names = outputFileNames(queue)

// ---- The browser --------------------------------------------------------------------------------

const server = await createServer({ server: { port: 0 }, logLevel: 'error' })
await server.listen()
const origin = `http://localhost:${server.httpServer.address().port}`

let browser = null
async function launchBrowser() {
  const angle = options.angle ?? (process.platform === 'linux' ? 'gl-egl' : null)
  return puppeteer.launch({
    executablePath: findChrome(),
    headless: !options.headful,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', ...(angle ? [`--use-angle=${angle}`] : []), '--window-size=1280,720',
      // Keep rendering at full speed when the window is hidden or covered.
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    defaultViewport: { width: 1280, height: 720 },
    protocolTimeout: 0,
    // Ctrl+C saves completed frames before closing; committed clips are retained.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  })
}

async function closeBrowser() {
  const b = browser
  browser = null
  await closeBrowserInstance(b)
}

async function closeBrowserInstance(b) {
  if (!b) return
  // (close() can hang on a browser that is stuck; then it is killed.)
  const closed = b.close().then(() => true, () => false)
  if (!(await Promise.race([closed, new Promise((resolve) => setTimeout(() => resolve(false), 10_000))]))) b.process()?.kill('SIGKILL')
}

// The pages currently rendering (stopped on Ctrl+C), every browser started for the current shot, and
// the current shot's render (settled once its pages have stopped and closed).
const activePages = new Set()
const liveBrowsers = new Set()
let activeRenderDone = null

// Runs in the page: window.__renderStorageFor(scope) is the render storage interface (RenderJob.js)
// over __renderStorage, which reads and writes files here: 'segments' in the render folder, 'output'
// the video itself.
function installPageStorage() {
  const base64 = (data) => {
    if (data.toBase64) return data.toBase64()
    let s = ''
    for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000))
    return btoa(s)
  }
  window.__renderStorageFor = scope => ({
    async read(name) {
      const text = await window.__renderStorage('read', scope, name)
      return text === null ? null : new Blob([Uint8Array.from(atob(text), c => c.charCodeAt(0))])
    },
    async createWritable(name) {
      await window.__renderStorage('open', scope, name)
      return new WritableStream({
        write(chunk) {
          const data = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk.data ?? chunk
          return window.__renderStorage('write', scope, name, chunk.position ?? null, base64(data))
        },
        close: () => window.__renderStorage('close', scope, name),
        abort: () => window.__renderStorage('abort', scope, name),
      })
    },
  })
}

// Opens the app with `item`'s preset in a new page of `browser`, with render storage for `segmentDir`
// (and `file` for the finished video) and progress reported to onProgress(frame, frames). Returns
// { page, failed, outputBytes(), close() }; `failed` rejects if the page crashes.
async function openAppPage(browser, item, { segmentDir, file, onProgress }) {
  const page = await browser.newPage()
  const streams = new Map()
  let outputBytes = 0
  let fail
  const failed = new Promise((resolve, reject) => { fail = reject })
  failed.catch(() => {}) // (only ever raced)
  const close = async () => {
    for (const stream of streams.values()) {
      fs.closeSync(stream.fd)
      fs.rmSync(stream.temporary, { force: true })
    }
    streams.clear()
    activePages.delete(page)
    await page.close().catch(() => {})
  }
  try {
    page.on('pageerror', (err) => log(`  page error: ${err.message}`))
    page.on('console', (msg) => { if (msg.type() === 'error') log(`  console: ${msg.text()}`) })
    page.on('error', (err) => fail(new Error(`The page crashed: ${err.message}`)))
    await page.exposeFunction('__renderStorage', (op, scope, name, position, base64) => {
      if (!['segments', 'output'].includes(scope) || !/^[a-zA-Z0-9._-]+$/.test(name) || name === '.' || name === '..') throw new Error('Invalid render storage path.')
      const destination = scope === 'output' ? file : path.join(segmentDir, name)
      const key = `${scope}:${name}`
      if (op === 'read') return fs.existsSync(destination) ? fs.readFileSync(destination).toString('base64') : null
      if (op === 'open') {
        if (streams.has(key)) throw new Error('Render file is already open.')
        const temporary = destination + '.writing'
        streams.set(key, { fd: fs.openSync(temporary, 'w'), destination, temporary, position: 0 })
        return
      }
      const stream = streams.get(key)
      if (!stream) throw new Error('Render file is not open.')
      if (op === 'write') {
        const data = Buffer.from(base64, 'base64')
        const offset = position ?? stream.position
        let written = 0
        while (written < data.length) written += fs.writeSync(stream.fd, data, written, data.length - written, offset + written)
        stream.position = offset + written
        if (scope === 'output') outputBytes = Math.max(outputBytes, stream.position)
      }
      else if (op === 'close' || op === 'abort') {
        fs.fsyncSync(stream.fd)
        fs.closeSync(stream.fd)
        streams.delete(key)
        if (op === 'close') fs.renameSync(stream.temporary, stream.destination)
        else fs.rmSync(stream.temporary, { force: true })
      }
      else throw new Error('Unknown render storage operation.')
    })
    await page.exposeFunction('__renderProgress', onProgress)
    activePages.add(page)
    const url = `${origin}/?preset=${encodeURIComponent(item.shot.preset)}`
    await Promise.race([page.goto(url, { waitUntil: 'load', timeout: loadMs }), failed])
    // window.tetheredRing is set once App.init() has finished (or failed).
    await Promise.race([page.waitForFunction(() => window.tetheredRing, { timeout: loadMs, polling: 500 }), failed])
    const started = await page.evaluate(() => !!window.tetheredRing.app.shots)
    if (!started) throw new Error(`The app did not start: ${await page.evaluate(() => document.querySelector('.startup-error')?.textContent ?? 'unknown error')}`)
    await page.evaluate(installPageStorage)
    return { page, failed, outputBytes: () => outputBytes, close }
  }
  catch (error) {
    await close()
    throw error
  }
}

function renderFolderFor(file) {
  const folderName = renderFolderName(path.basename(file).replace(/\.part$/, ''))
  const dir = path.join(outDir, options.overwrite ? `${folderName}-${Date.now()}` : folderName)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Renders one item into `file` in one browser, retaining independently committed segment files.
async function renderItem(item, file) {
  browser ??= await launchBrowser()
  let signalDone
  activeRenderDone = new Promise(resolve => { signalDone = resolve })
  const fileName = path.basename(file).replace(/\.part$/, '')
  const segmentDir = renderFolderFor(file)
  let lastProgress = Date.now()
  let frameText = ''
  let firstFrameAt = null // (the first frame includes waiting for terrain; the rate is timed after it)
  let lastFrameAt = null
  let stalled
  const stall = new Promise((resolve, reject) => { stalled = reject })
  stall.catch(() => {})
  const watchdog = setInterval(() => {
    if (Date.now() - lastProgress > stallMs) stalled(new Error(`No progress for ${options['stall-minutes'] ?? 30} minutes${frameText ? ` (last:${frameText})` : ''}.`))
  }, 10_000)
  let app = null
  try {
    app = await Promise.race([openAppPage(browser, item, {
      segmentDir, file,
      onProgress: (frame, frames) => {
        lastProgress = Date.now()
        if (frame === 1) firstFrameAt = lastProgress
        lastFrameAt = lastProgress
        const text = `  frame ${frame} / ${frames}`
        if (process.stdout.isTTY) process.stdout.write(`\r${text}   `)
        else if (frame === frames || frame % 100 === 0) console.log(text)
        frameText = text
      },
    }), stall])
    lastProgress = Date.now() + settleSeconds * 1000
    const result = await Promise.race([app.page.evaluate(async (shotText, fileName, settle) => {
      const r = await window.tetheredRing.app.shots.renderShotUnattended(JSON.parse(shotText), {
        storage: window.__renderStorageFor('segments'),
        outputStorage: window.__renderStorageFor('output'),
        fileName,
        settleSeconds: settle,
        onProgress: ({ frame, frames }) => window.__renderProgress(frame, frames),
      })
      return { frames: r.frames, codec: r.codec }
    }, serializeShot(item.shot), fileName, settleSeconds), app.failed, stall])
    if (process.stdout.isTTY) process.stdout.write('\n')
    const msPerFrame = result.frames > 1 && firstFrameAt ? (lastFrameAt - firstFrameAt) / (result.frames - 1) : null
    return { ...result, bytes: app.outputBytes(), msPerFrame }
  }
  finally {
    clearInterval(watchdog)
    await app?.close()
    signalDone()
  }
}

// Node's side of the render folder, for RenderJob (the manifest and committed segments).
function folderStorage(dir) {
  return {
    async read(name) {
      const file = path.join(dir, name)
      return fs.existsSync(file) ? fs.openAsBlob(file) : null
    },
    async createWritable(name) {
      const destination = path.join(dir, name)
      const temporary = destination + '.writing'
      const fd = fs.openSync(temporary, 'w')
      return new WritableStream({
        write(chunk) { fs.writeSync(fd, typeof chunk === 'string' ? chunk : Buffer.from(chunk)) },
        close() { fs.fsyncSync(fd); fs.closeSync(fd); fs.renameSync(temporary, destination) },
        abort() { fs.closeSync(fd); fs.rmSync(temporary, { force: true }) },
      })
    },
    async list() { return fs.readdirSync(dir) },
    async remove(name) { fs.rmSync(path.join(dir, name)) },
  }
}

// Renders one item into `file` with `workerCount` browsers at once (see "Rendering in several browsers
// at once" in src/shots/ShotController.js and src/capture/RenderChunks.js). The segments are the same
// as a one-browser render would save, so either kind of run can resume the other.
async function renderItemParallel(item, file) {
  let signalDone
  activeRenderDone = new Promise(resolve => { signalDone = resolve })
  const fileName = path.basename(file).replace(/\.part$/, '')
  const segmentDir = renderFolderFor(file)
  const storage = folderStorage(segmentDir)
  const workers = []
  let job = null
  let shotText = null
  const queue = [] // chunks waiting for a worker
  const done = []  // finished chunks not yet appended to the segments
  let appending = Promise.resolve()
  let lastPrinted = -1
  const started = Date.now()
  let framesAtStart = 0

  const framesSoFar = () => (job?.savedFrames ?? 0) + done.reduce((n, c) => n + c.to - c.from, 0) +
    workers.reduce((n, w) => n + (w.current?.frame ?? 0), 0)
  const report = () => {
    if (!job) return
    const frames = framesSoFar()
    const text = `  frame ${frames} / ${job.manifest.frames} (${workers.filter(w => w.current).length} of ${workerCount} workers busy)`
    if (process.stdout.isTTY) process.stdout.write(`\r${text}   `)
    else if (Math.floor(frames / 100) > lastPrinted || frames === job.manifest.frames) {
      lastPrinted = Math.floor(frames / 100)
      console.log(text)
    }
  }

  async function startWorker(w) {
    w.browser = await launchBrowser()
    liveBrowsers.add(w.browser)
    w.lastProgress = Date.now()
    w.app = await openAppPage(w.browser, item, {
      segmentDir, file,
      onProgress: (frame) => {
        w.lastProgress = Date.now()
        if (w.current) w.current.frame = frame
        report()
      },
    })
  }

  async function stopWorker(w) {
    await w.app?.close()
    w.app = null
    if (w.browser) {
      liveBrowsers.delete(w.browser)
      await closeBrowserInstance(w.browser)
      w.browser = null
    }
  }

  // Appends finished chunks that continue the saved frames, one at a time and in order.
  const appendReady = () => (appending = appending.then(async () => {
    const container = job.manifest.shot.output.container
    for (const c of appendableChunks(job.savedFrames, done)) {
      const segment = segmentName(job.manifest.segments.length, container)
      fs.renameSync(path.join(segmentDir, chunkName(c.from, c.to, container)), path.join(segmentDir, segment))
      await job.commit(c.to, c.decoderConfig)
      fs.rmSync(path.join(segmentDir, chunkRecordName(c.from, c.to)), { force: true })
      done.splice(done.indexOf(c), 1)
    }
  }))

  async function runWorker(w) {
    const container = job.manifest.shot.output.container
    const settled = new Set() // (a worker settles once, before its first chunk)
    while (!stopping) {
      const chunk = queue.shift()
      if (!chunk) return
      w.current = { chunk, frame: 0 }
      w.lastProgress = Date.now() + (settled.has(w.app) ? 0 : settleSeconds * 1000)
      const name = chunkName(chunk.from, chunk.to, container)
      try {
        let stalled
        const stall = new Promise((resolve, reject) => { stalled = reject })
        stall.catch(() => {})
        w.stall = stalled
        const r = await Promise.race([w.app.page.evaluate(async (shotText, from, to, codec, name, settle) => {
          const r = await window.tetheredRing.app.shots.renderRangeUnattended(JSON.parse(shotText), {
            from, to, codec, name, settleSeconds: settle,
            storage: window.__renderStorageFor('segments'),
            onProgress: ({ frame }) => window.__renderProgress(frame),
          })
          return { frames: r.frames, decoderConfig: r.decoderConfig }
        }, shotText, chunk.from, chunk.to, job.manifest.codec, name, settleSeconds), w.app.failed, stall])
        settled.add(w.app)
        fs.writeFileSync(path.join(segmentDir, chunkRecordName(chunk.from, chunk.to)), JSON.stringify({ from: chunk.from, to: chunk.to, decoderConfig: r.decoderConfig }, null, 2))
        w.current = null
        done.push({ from: chunk.from, to: chunk.to, decoderConfig: r.decoderConfig })
        await appendReady()
        report()
      }
      catch (error) {
        w.current = null
        // An abandoned range can leave a closed but unfinished video behind; without its record it is
        // never used, so remove it.
        if (!fs.existsSync(path.join(segmentDir, chunkRecordName(chunk.from, chunk.to)))) fs.rmSync(path.join(segmentDir, name), { force: true })
        if (stopping) return
        chunk.attempts = (chunk.attempts ?? 0) + 1
        log(`  worker ${w.index + 1}: frames ${chunk.from}-${chunk.to} failed: ${error.message}`)
        if (chunk.attempts > 1) throw new Error(`Frames ${chunk.from}-${chunk.to} failed twice; last: ${error.message}`)
        queue.unshift(chunk)
        log(`  worker ${w.index + 1}: restarting its browser`)
        await stopWorker(w)
        await startWorker(w)
      }
    }
  }

  const watchdog = setInterval(() => {
    for (const w of workers) {
      if (w.current && Date.now() - w.lastProgress > stallMs) w.stall?.(new Error(`No progress for ${options['stall-minutes'] ?? 30} minutes.`))
    }
  }, 10_000)
  try {
    for (let i = 0; i < workerCount; i++) workers.push({ index: i, browser: null, app: null, current: null, lastProgress: Date.now() })
    // The first browser works out the codec, and the job is opened (or resumed) before the others start.
    await startWorker(workers[0])
    const settings = await workers[0].app.page.evaluate(async (shotText) => window.tetheredRing.app.shots.renderSettings(JSON.parse(shotText)), serializeShot(item.shot))
    job = await RenderJob.open(storage, { shot: settings.shot, fileName, codec: settings.codec, buildId: settings.buildId })
    shotText = JSON.stringify(job.manifest.shot)
    framesAtStart = job.savedFrames
    const container = job.manifest.shot.output.container
    const size = Math.max(1, Math.round(chunkSeconds * job.manifest.shot.output.fps))
    const plan = planChunks({ start: job.savedFrames, end: job.manifest.frames, size, finished: finishedChunks(fs.readdirSync(segmentDir), container) })
    for (const c of plan) {
      if (c.finished) done.push({ from: c.from, to: c.to, decoderConfig: JSON.parse(fs.readFileSync(path.join(segmentDir, chunkRecordName(c.from, c.to)), 'utf8')).decoderConfig })
      else queue.push({ from: c.from, to: c.to })
    }
    await appendReady()
    if (job.savedFrames) log(`  resuming at frame ${job.savedFrames} of ${job.manifest.frames}`)
    if (queue.length) {
      log(`  ${queue.length} ranges of up to ${size} frames for ${workerCount} workers`)
      // Start the other browsers while the first one renders.
      const others = workers.slice(1, Math.max(1, Math.min(workerCount, queue.length)))
      const runs = [runWorker(workers[0])]
      for (const w of others) runs.push(startWorker(w).then(() => runWorker(w)))
      const outcomes = await Promise.allSettled(runs)
      const failure = outcomes.find(o => o.status === 'rejected')
      await appendReady()
      if (failure) throw failure.reason
    }
    if (stopping || !job.complete) throw new Error(`Stopped with ${job.savedFrames} of ${job.manifest.frames} frames saved.`)
    if (process.stdout.isTTY) process.stdout.write('\n')
    const rendered = job.savedFrames - framesAtStart
    const elapsed = Date.now() - started
    // Join the segments into the video, in the first browser (the same way a one-browser render ends).
    const result = await Promise.race([workers[0].app.page.evaluate(async (shotText, fileName) => {
      const r = await window.tetheredRing.app.shots.renderShotUnattended(JSON.parse(shotText), {
        storage: window.__renderStorageFor('segments'),
        outputStorage: window.__renderStorageFor('output'),
        fileName,
      })
      return { frames: r.frames, codec: r.codec }
    }, shotText, fileName), workers[0].app.failed])
    return { ...result, bytes: workers[0].app.outputBytes(), msPerFrame: rendered > 0 ? elapsed / rendered : null }
  }
  finally {
    clearInterval(watchdog)
    await Promise.all(workers.map(w => stopWorker(w).catch(() => {})))
    signalDone()
  }
}

// ---- Run ----------------------------------------------------------------------------------------

let stopping = false
let currentPartial = null
function interrupted(signal) {
  if (stopping) process.exit(130)
  stopping = true
  log(`Interrupted (${signal}); saving completed frames (press Ctrl+C again to quit at once).`)
  Promise.race([
    Promise.all([...activePages].map(page => page.evaluate(() => window.tetheredRing?.app.shots.stop()).catch(() => {}))).then(() => activeRenderDone),
    new Promise(resolve => setTimeout(resolve, 30000)),
  ]).catch(error => log(`Could not finish the active segment: ${error.message}`)).finally(() => closeBrowser())
    .finally(() => Promise.all([...liveBrowsers].map(b => closeBrowserInstance(b)))).finally(() => server.close()).finally(() => {
    if (currentPartial) fs.rmSync(currentPartial, { force: true })
    process.exit(130)
  })
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => interrupted(signal))

log(`Rendering ${queue.items.length} shot${queue.items.length === 1 ? '' : 's'} into ${outDir}`)
const results = { done: 0, skipped: 0, failed: 0 }
for (const [index, item] of queue.items.entries()) {
  if (stopping) break
  const name = names.get(item.id)
  const file = path.join(outDir, name)
  const o = item.shot.output
  const label = `[${index + 1}/${queue.items.length}] "${item.shot.name}" (${item.shot.preset}, ${o.width}x${o.height} @ ${o.fps} fps, ${itemFrames(item)} frames${o.supersample > 1 ? `, ${o.supersample}x supersampled` : ''}${o.motionBlur !== 'off' ? `, motion blur ${o.motionBlur}${o.motionBlurJitter ? ' (jittered)' : ''}` : ''})`
  if (fs.existsSync(file) && !options.overwrite) {
    log(`${label}: ${name} exists; skipped.`)
    results.skipped++
    continue
  }
  const partial = file + '.part'
  currentPartial = partial
  const start = Date.now()
  log(`${label} -> ${name}`)
  try {
    const r = workerCount > 1 ? await renderItemParallel(item, partial) : await renderItem(item, partial)
    fs.renameSync(partial, file)
    const rate = r.msPerFrame ? ` (${Math.round(r.msPerFrame)} ms per frame${workerCount > 1 ? ` with ${workerCount} workers` : ' after the first'})` : ''
    log(`  saved ${name}: ${r.frames} frames, ${r.codec}, ${(r.bytes / 1e6).toFixed(1)} MB, in ${((Date.now() - start) / 60000).toFixed(1)} min${rate}`)
    results.done++
  }
  catch (err) {
    if (process.stdout.isTTY) process.stdout.write('\n')
    fs.rmSync(partial, { force: true })
    if (stopping) break
    log(`  FAILED: ${err.message}`)
    results.failed++
    // Start the next shot in a new browser, in case this one is in a bad state.
    await closeBrowser()
  }
  currentPartial = null
}
// (Interrupted: the signal handler cleans up and exits.)
if (stopping) await new Promise(() => {})
await closeBrowser()
await server.close()
log(`Finished: ${results.done} rendered, ${results.skipped} skipped (already there), ${results.failed} failed.`)
process.exit(results.failed ? 1 : 0)
