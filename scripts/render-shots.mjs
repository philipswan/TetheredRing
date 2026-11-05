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
import { renderFolderName } from '../src/capture/RenderJob.js'

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
  if (!b) return
  // (close() can hang on a browser that is stuck; then it is killed.)
  const closed = b.close().then(() => true, () => false)
  if (!(await Promise.race([closed, new Promise((resolve) => setTimeout(() => resolve(false), 10_000))]))) b.process()?.kill('SIGKILL')
}

let activePage = null
let activeRenderDone = null

// Renders one item into `file`, retaining independently committed segment files.
async function renderItem(item, file) {
  browser ??= await launchBrowser()
  const page = await browser.newPage()
  activePage = page
  let signalDone
  activeRenderDone = new Promise(resolve => { signalDone = resolve })
  const fileName = path.basename(file).replace(/\.part$/, '')
  const folderName = renderFolderName(fileName)
  const segmentDir = path.join(outDir, options.overwrite ? `${folderName}-${Date.now()}` : folderName)
  fs.mkdirSync(segmentDir, { recursive: true })
  const streams = new Map()
  let lastProgress = Date.now()
  let frameText = ''
  let bytes = 0
  let firstFrameAt = null // (the first frame includes waiting for terrain; the rate is timed after it)
  let lastFrameAt = null
  const fail = { reject: null }
  const failed = new Promise((resolve, reject) => { fail.reject = reject })
  failed.catch(() => {}) // (only ever raced)
  try {
    page.on('pageerror', (err) => log(`  page error: ${err.message}`))
    page.on('console', (msg) => { if (msg.type() === 'error') log(`  console: ${msg.text()}`) })
    page.on('error', (err) => fail.reject(new Error(`The page crashed: ${err.message}`)))
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
        if (scope === 'output') bytes = Math.max(bytes, stream.position)
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
    await page.exposeFunction('__renderProgress', (frame, frames) => {
      lastProgress = Date.now()
      if (frame === 1) firstFrameAt = lastProgress
      lastFrameAt = lastProgress
      const text = `  frame ${frame} / ${frames}`
      if (process.stdout.isTTY) process.stdout.write(`\r${text}   `)
      else if (frame === frames || frame % 100 === 0) console.log(text)
      frameText = text
    })
    const watchdog = setInterval(() => {
      if (Date.now() - lastProgress > stallMs) fail.reject(new Error(`No progress for ${options['stall-minutes'] ?? 30} minutes${frameText ? ` (last:${frameText})` : ''}.`))
    }, 10_000)
    try {
      const url = `${origin}/?preset=${encodeURIComponent(item.shot.preset)}`
      await Promise.race([page.goto(url, { waitUntil: 'load', timeout: loadMs }), failed])
      // window.tetheredRing is set once App.init() has finished (or failed).
      await Promise.race([page.waitForFunction(() => window.tetheredRing, { timeout: loadMs, polling: 500 }), failed])
      const started = await page.evaluate(() => !!window.tetheredRing.app.shots)
      if (!started) throw new Error(`The app did not start: ${await page.evaluate(() => document.querySelector('.startup-error')?.textContent ?? 'unknown error')}`)
      lastProgress = Date.now() + settleSeconds * 1000
      const result = await Promise.race([page.evaluate(async (shotText, fileName, settle) => {
        const base64 = (data) => {
          if (data.toBase64) return data.toBase64()
          let s = ''
          for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000))
          return btoa(s)
        }
        const storageFor = scope => ({
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
        const shots = window.tetheredRing.app.shots
        const r = await shots.renderShotUnattended(JSON.parse(shotText), {
          storage: storageFor('segments'),
          outputStorage: storageFor('output'),
          fileName,
          settleSeconds: settle,
          onProgress: ({ frame, frames }) => window.__renderProgress(frame, frames),
        })
        return { frames: r.frames, codec: r.codec }
      }, serializeShot(item.shot), fileName, settleSeconds), failed])
      if (process.stdout.isTTY) process.stdout.write('\n')
      const msPerFrame = result.frames > 1 && firstFrameAt ? (lastFrameAt - firstFrameAt) / (result.frames - 1) : null
      return { ...result, bytes, msPerFrame }
    }
    finally {
      clearInterval(watchdog)
    }
  }
  finally {
    for (const stream of streams.values()) {
      fs.closeSync(stream.fd)
      fs.rmSync(stream.temporary, { force: true })
    }
    await page.close().catch(() => {})
    activePage = null
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
    Promise.resolve(activePage?.evaluate(() => window.tetheredRing?.app.shots.stop())).then(() => activeRenderDone),
    new Promise(resolve => setTimeout(resolve, 30000)),
  ]).catch(error => log(`Could not finish the active segment: ${error.message}`)).finally(() => closeBrowser()).finally(() => server.close()).finally(() => {
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
    const r = await renderItem(item, partial)
    fs.renameSync(partial, file)
    log(`  saved ${name}: ${r.frames} frames, ${r.codec}, ${(r.bytes / 1e6).toFixed(1)} MB, in ${((Date.now() - start) / 60000).toFixed(1)} min${r.msPerFrame ? ` (${Math.round(r.msPerFrame)} ms per frame after the first)` : ''}`)
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
