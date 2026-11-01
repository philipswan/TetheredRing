// Headless smoke test: starts the Vite dev server, loads the app in Chrome/Chromium,
// waits for it to render, then reports console errors and saves a screenshot.
//
//   npm run smoke -- [--url-params "preset=default"] [--wait 15] [--out smoke.png] [--width 1280 --height 720 --dpr 1]
//                    [--cpu-throttle 4]   (slow the CPU down 4x, roughly a low-end laptop)
//                    [--init "<js>"]      (run before the page's own scripts, e.g. to hide a WebGL extension)
//                    [--steps <file.mjs>] (after the wait: runs the module's default export, an async function
//                                          given { page, screenshot(name) }, for checks with several steps)
//
// Set CHROME_PATH if Chrome/Chromium/Edge is not found automatically.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = process.platform === 'win32'
    ? [
        `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']
  const found = candidates.find((p) => p && fs.existsSync(p))
  if (!found) throw new Error('Chrome/Chromium not found. Set CHROME_PATH to its executable.')
  return found
}

const waitSeconds = Number(arg('wait', '15'))
const urlParams = arg('url-params', '')
const out = arg('out', 'smoke.png')
const evalExpr = arg('eval', null)
// Viewport in CSS pixels and device pixel ratio, e.g. --width 1920 --height 1080 --dpr 2 for a 4K screen.
const width = Number(arg('width', '1280'))
const height = Number(arg('height', '720'))
const deviceScaleFactor = Number(arg('dpr', '1'))
const cpuThrottle = Number(arg('cpu-throttle', '1'))
const initExpr = arg('init', null)

const server = await createServer({ server: { port: 0 }, logLevel: 'error' })
await server.listen()
const port = server.httpServer.address().port
const pagePath = arg('page', '/')
const url = `http://localhost:${port}${pagePath}${urlParams ? `?${urlParams}` : ''}`

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  // SMOKE_GPU=1 uses the real GPU (much faster KTX2/terrain); the default software renderer works anywhere.
  args: [...(process.env.SMOKE_CHROME_ARGS?.split(' ').filter(Boolean) ?? [])].concat(process.env.SMOKE_GPU
    ? ['--enable-gpu', '--use-angle=' + (process.env.SMOKE_ANGLE ?? 'gl-egl'), '--ignore-gpu-blocklist', `--window-size=${width},${height}`]
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${width},${height}`]),
  // SMOKE_CHROME_ARGS: more browser flags, space-separated (e.g. --disable-gpu-sandbox).
  ignoreDefaultArgs: false,
  defaultViewport: { width, height, deviceScaleFactor },
  // SMOKE_DUMPIO=1 passes the browser's own stdout/stderr through (e.g. a GPU driver's shader statistics).
  dumpio: !!process.env.SMOKE_DUMPIO,
})

const errors = []
let exitCode = 0
try {
  const page = await browser.newPage()
  if (cpuThrottle > 1) await page.emulateCPUThrottling(cpuThrottle)
  if (initExpr) await page.evaluateOnNewDocument(initExpr)
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
    if (process.env.SMOKE_VERBOSE) console.log(`[${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack ?? ''}`))
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await new Promise((r) => setTimeout(r, waitSeconds * 1000))
  if (evalExpr) console.log('eval:', JSON.stringify(await page.evaluate(evalExpr), null, 2))
  const stepsFile = arg('steps', null)
  if (stepsFile) {
    const { pathToFileURL } = await import('node:url')
    const steps = (await import(pathToFileURL(path.resolve(stepsFile)).href)).default
    const outBase = out.replace(/\.png$/i, '')
    await steps({
      page,
      screenshot: async (name) => {
        const file = path.resolve(`${outBase}-${name}.png`)
        await page.screenshot({ path: file })
        console.log(`Screenshot: ${file}`)
      },
    })
  }
  await page.screenshot({ path: path.resolve(out) })
  console.log(`Screenshot: ${path.resolve(out)}`)
} catch (e) {
  errors.push(`harness: ${e.message}`)
} finally {
  await browser.close()
  await server.close()
}

if (errors.length) {
  console.log(`\n${errors.length} error(s):`)
  for (const e of errors) console.log(`- ${e}`)
  exitCode = 1
} else {
  console.log('No errors.')
}
process.exit(exitCode)
