// Cloud benchmark and visual regression check: opens each view in tests/bench/cloudViews.json (views as
// the view status's Copy view link holds them: preset, time, camera, parameters), waits for the terrain
// and the clouds to load, measures the GPU time of the cloud pass and of the whole frame, and saves a
// screenshot of the canvas. With --baseline, compares each screenshot with the one of the same name
// there and reports how much they differ (and writes an amplified difference image).
//
//   npm run bench:clouds -- [--out .scratch/bench/now] [--baseline .scratch/bench/base] [--only name,name]
//                           [--frames 60] [--width 1280 --height 720]
//   BENCH_PASSES=1  also times each pass (sky, scene, the clouds' distance, march and composite, ...)
//   BENCH_COST=1    the march's work per pixel (counts and a heat map; see Clouds.setCostView)
//   BENCH_MOTION=kind:amount:frames  a camera move's frames, for tools/motion_artifacts.py
//
// Uses the GPU (like SMOKE_GPU=1). Timings vary with the GPU's clock: compare runs on the same machine,
// and look at the cloud pass's median rather than one number. It prints the GPU it ran on: headless Chrome
// on Linux takes the first GPU it finds, which on a machine with two may be the weaker one. There,
// --render-node /dev/dri/renderD129 (see /dev/dri/by-path for which is which) runs it in bubblewrap
// (bwrap) with only that GPU's render node visible.
//
// PowerShell:  npm run bench:clouds -- --out .scratch\bench\now --baseline .scratch\bench\base
// (.scratch/ is ignored by Git.)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback }
const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(arg('out', path.join('.scratch', 'bench', 'now')))
const baseline = arg('baseline', null)
const viewsFile = path.resolve(arg('views', path.join(here, '..', 'tests', 'bench', 'cloudViews.json')))
const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'))
const only = arg('only', null)?.split(',')
const selected = only ? views.filter(v => only.includes(v.name)) : views
if (!selected.length) { console.log('No views selected.'); process.exit(1) }
fs.mkdirSync(out, { recursive: true })

// One browser session for all the views (they share the preset: the first view's).
const presets = new Set(selected.map(v => v.view.preset))
if (presets.size > 1) { console.log('The views must share a preset (run them separately with --only).'); process.exit(1) }
const env = {
  ...process.env,
  SMOKE_GPU: process.env.SMOKE_GPU ?? '1',
  BENCH_VIEWS: JSON.stringify(selected),
  BENCH_OUT: out,
  BENCH_BASELINE: baseline ? path.resolve(baseline) : '',
  BENCH_FRAMES: arg('frames', '60'),
}
const renderNode = arg('render-node', null)
const command = renderNode ? 'bwrap' : process.execPath
const wrap = renderNode ? ['--dev-bind', '/', '/', '--tmpfs', '/dev/dri', '--dev-bind', renderNode, renderNode, process.execPath] : []
const result = spawnSync(command, [...wrap, path.join(here, 'smoke.mjs'), '--url-params', `preset=${[...presets][0]}`, '--wait', arg('wait', '20'),
  '--out', path.join(out, '_last.png'), '--steps', path.join(here, 'bench', 'cloudBenchSteps.mjs'),
  '--width', arg('width', '1280'), '--height', arg('height', '720')], { encoding: 'utf8', env, maxBuffer: 1 << 26 })
const text = result.stdout + result.stderr
const lines = text.split('\n')
const report = lines.filter(l => l.startsWith('BENCH ')).map(l => JSON.parse(l.slice(6)))
if (!report.length) { console.log(text); process.exit(1) }
fs.rmSync(path.join(out, '_last.png'), { force: true })
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 1) + '\n')
const pad = (s, n) => String(s).padEnd(n)
console.log(`GPU: ${report[0].gpu}`)
console.log(pad('view', 22) + pad('clouds ms', 11) + pad('frame ms', 10) + (baseline ? 'diff: mean  >8/255  max' : ''))
for (const r of report) {
  console.log(pad(r.name, 22) + pad(r.clouds.median.toFixed(2), 11) + pad(r.frame.median.toFixed(2), 10)
    + (r.diff ? `      ${r.diff.mean.toFixed(2).padEnd(6)}${(r.diff.over8 * 100).toFixed(2).padStart(6)}%  ${r.diff.max}` : ''))
  if (r.passes && Object.keys(r.passes).length) console.log('  passes (ms/frame): ' + Object.entries(r.passes).map(([k, v]) => `${k} ${v}`).join(', '))
}
const errors = lines.filter(l => /error/i.test(l) && !l.startsWith('BENCH '))
if (result.status !== 0 || errors.length) { console.log(errors.join('\n')); process.exit(1) }
