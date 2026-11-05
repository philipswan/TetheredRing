// Visual seam check: renders views (by default a sample of scripts/check-seams.mjs's sweep) in headless Chrome on the
// GPU, and looks along every on-screen boundary between two terrain tiles for a step in the colour that stands out from
// the colour's variation within each tile (scripts/bench/visualSeamSteps.mjs). Where the shape checker
// (scripts/check-seams.mjs) proves the tiles meet, this finds where they do not look as if they do: imagery, cover,
// normals or shading that change at a tile's edge. Screenshots of views with seams go to --out.
//
//   POSIX:      node scripts/check-visual-seams.mjs [--every 8] [--out .scratch/visual-seams] [--views file.json]
//                 [--render-node /dev/dri/renderD129] [--url-params groundDebug=2]
//   PowerShell: node scripts\check-visual-seams.mjs [--every 8] [--out .scratch\visual-seams]
//   SEAM_MIN_RELATIVE (the step in brightness across, relative to the brightness; default 0.02), SEAM_RATIO (the step
//   to its noise, the variation within the tiles over the root of its length; 2.5),
//   SEAM_MASKING (how far a step must stand out from the texture's variation beside it; 0.3), SEAM_MIN_LENGTH
//   (boundary pixels; 24)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback }
const out = path.resolve(arg('out', path.join('.scratch', 'visual-seams')))
fs.mkdirSync(out, { recursive: true })
let viewsFile = arg('views', null)
if (!viewsFile) {
  viewsFile = path.join(out, 'views.json')
  const r = spawnSync(process.execPath, [path.join(here, 'check-seams.mjs'), ...(process.argv.includes('--quick') ? ['--quick'] : []),
    '--write-views', viewsFile, '--every', arg('every', '8')], { encoding: 'utf8' })
  if (r.status !== 0) { console.log(r.stdout + r.stderr); process.exit(1) }
}
const env = { ...process.env, SMOKE_GPU: process.env.SMOKE_GPU ?? '1', SEAM_VIEWS: path.resolve(viewsFile), SEAM_OUT: out }
const renderNode = arg('render-node', null)
const command = renderNode ? 'bwrap' : process.execPath
const wrap = renderNode ? ['--dev-bind', '/', '/', '--tmpfs', '/dev/dri', '--dev-bind', renderNode, renderNode, process.execPath] : []
const result = spawnSync(command, [...wrap, path.join(here, 'smoke.mjs'), '--url-params', `preset=bigIslandLauncher${arg('url-params', '') ? '&' + arg('url-params', '') : ''}`, '--wait', '20',
  '--out', path.join(out, '_last.png'), '--steps', path.join(here, 'bench', 'visualSeamSteps.mjs'),
  '--width', arg('width', '1280'), '--height', arg('height', '720')], { encoding: 'utf8', env, maxBuffer: 1 << 28 })
const lines = (result.stdout + result.stderr).split('\n')
const reports = lines.filter((l) => l.startsWith('SEAMS ')).map((l) => JSON.parse(l.slice(6)))
if (!reports.length) { console.log(lines.slice(-40).join('\n')); process.exit(1) }
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(reports, null, 1) + '\n')
const bad = reports.filter((r) => r.seams.length)
console.log(`${reports.length} views, ${reports.reduce((n, r) => n + r.boundaries, 0)} tile boundaries on screen; ${bad.length} views with visual seams.`)
const kinds = {}
for (const r of bad) for (const s of r.seams) {
  const k = `${s.aGenerated ? 'generated' : 'baked'}-${s.bGenerated ? 'generated' : 'baked'}`
  kinds[k] = (kinds[k] ?? 0) + 1
}
console.log('Seams by the kinds of tile on each side:', JSON.stringify(kinds))
if (process.env.SEAM_SELFTEST) {
  const expected = reports.reduce((n, r) => n + r.tintedPairs, 0), found = reports.reduce((n, r) => n + r.seams.length, 0)
  console.log(`Self-test: ${found} seams found of ${expected} boundaries between a darkened tile and another.`)
}
for (const r of bad.slice(0, 30)) console.log(`  ${r.name} ${JSON.stringify(r.pose)}: ${r.seams.slice(0, 3).map((s) => `${s.a}|${s.b} step ${s.step} (within ${s.within}) over ${s.pixels} px at ${s.at}`).join('; ')}`)
process.exit(bad.length ? 1 : 0)
