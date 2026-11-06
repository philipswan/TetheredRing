import test from 'node:test'
import assert from 'node:assert/strict'
import { Blob } from 'node:buffer'
import { WritableStream } from 'node:stream/web'
import { createShot, validateShot, parseShot, serializeShot } from '../../src/shots/ShotFormat.js'
import { RenderJob, segmentName, replacementSegmentName, segmentsInWindow, validateRenderJob } from '../../src/capture/RenderJob.js'

const { structuredClone } = globalThis
const decoder = { codec: 'av01.0.08M.08', codedWidth: 320, codedHeight: 180 }

async function fixture() {
  const files = new Map()
  const storage = {
    failWrite: false,
    read: async name => files.get(name) ?? null,
    list: async () => [...files.keys()],
    remove: async name => files.delete(name),
    async createWritable(name) {
      const chunks = []
      return new WritableStream({
        write: chunk => chunks.push(chunk),
        close() { if (storage.failWrite) throw new Error('disk full'); files.set(name, new Blob(chunks)) },
      })
    },
  }
  const shot = createShot({ name: 'Window', preset: 'default', parameters: {}, startTime: 0 })
  shot.project = { id: 'project-a' }
  Object.assign(shot.output, { fps: 30, width: 320, height: 180, duration: 3 })
  shot.camera.keyframes = [{ time: 0, position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] }]
  const job = await RenderJob.open(storage, { shot, fileName: 'Window.mp4', codec: 'av1', buildId: 'old' })
  for (let i = 0; i < 3; i++) {
    files.set(segmentName(i, 'mp4'), new Blob([`original-${i}`]))
    await job.commit((i + 1) * 30, decoder)
  }
  return { job, storage, files, shot }
}

function stage(files, index = 1, generation = 'new') {
  const name = replacementSegmentName(index, 'mp4', generation)
  files.set(name, new Blob([`replacement-${index}-${generation}`]))
  return name
}

test('window intersection selects complete segments and excludes boundaries that merely touch', async () => {
  const { job } = await fixture()
  for (const [start, end, indices] of [[1, 2, [1]], [0.99, 2.01, [0, 1, 2]], [0, 1, [0]], [2, 3, [2]], [3, 4, []]]) {
    assert.deepEqual(segmentsInWindow(job.manifest, start, end).map(s => s.index), indices)
  }
  for (const [start, end] of [[0, 0], [2, 1], [-1, 2], [0, Infinity], [NaN, 2]]) {
    assert.throws(() => segmentsInWindow(job.manifest, start, end), /window end/)
  }
})

test('regeneration planning rejects format, duration, project and empty-window changes without writes', async () => {
  const { job, files, shot } = await fixture()
  const before = new Map(files)
  for (const patch of [{ width: 640 }, { height: 360 }, { fps: 60 }, { container: 'mkv' }, { duration: 4 }, { codec: 'hevc' }]) {
    const changed = structuredClone(shot)
    Object.assign(changed.output, patch)
    assert.throws(() => job.regenerationPlan(changed, 1, 2), /regeneration/)
  }
  const other = structuredClone(shot); other.project.id = 'project-b'
  assert.throws(() => job.regenerationPlan(other, 1, 2), /different shot project/)
  assert.throws(() => job.regenerationPlan(shot, 3, 4), /does not intersect/)
  assert.deepEqual(files, before)
})

test('replacement commits only the selected entry, preserves old clips, and reopens with full provenance', async () => {
  const { job, files, shot, storage } = await fixture()
  const before = structuredClone(job.manifest)
  const edited = structuredClone(shot)
  edited.parameters.showLaunchVehiclePlasma = false
  edited.camera.keyframes[0].position = [7, 8, 9]
  edited.output.supersample = 2
  const target = job.regenerationPlan(edited, 1, 2)[0]
  const name = stage(files)
  await job.replaceSegment(target.index, target.segment, name, decoder, { shot: edited, generation: 'new', buildId: 'current' })
  assert.deepEqual(job.manifest.segments[0], before.segments[0])
  assert.deepEqual(job.manifest.segments[2], before.segments[2])
  assert.deepEqual([job.manifest.segments[1].from, job.manifest.segments[1].to], [30, 60])
  assert.equal(job.manifest.segments[1].name, name)
  assert.equal(await files.get('segment-000001.mp4').text(), 'original-1')
  assert.deepEqual(job.manifest.shot, before.shot)
  assert.deepEqual(job.manifest.regenerations.new, { shot: edited, buildId: 'current' })
  const reopened = await RenderJob.open(storage, { existingOnly: true })
  assert.equal(reopened.savedFrames, 90)
  assert.equal(reopened.complete, true)
  await reopened.verify()
  await reopened.updateOutput({ ...shot.output, duration: 4 })
  assert.equal(reopened.manifest.frames, 120)
})

test('failed manifest persistence, incompatible codec and stale replacement commits preserve originals', async () => {
  const { job, files, shot, storage } = await fixture()
  const expected = structuredClone(job.manifest.segments[1])
  const originalManifest = await files.get('render.json').text()
  const name = stage(files)
  storage.failWrite = true
  await assert.rejects(job.replaceSegment(1, expected, name, decoder, { shot, generation: 'new', buildId: 'current' }), /disk full/)
  assert.equal(await files.get('render.json').text(), originalManifest)
  assert.deepEqual(job.manifest.segments[1], expected)
  storage.failWrite = false
  await assert.rejects(job.replaceSegment(1, expected, name, { ...decoder, codec: 'avc1.640028' }, { shot, generation: 'new', buildId: 'current' }), /incompatible/)
  await job.replaceSegment(1, expected, name, decoder, { shot, generation: 'new', buildId: 'current' })
  const staleName = stage(files, 1, 'stale')
  await assert.rejects(job.replaceSegment(1, expected, staleName, decoder, { shot, generation: 'stale', buildId: 'current' }), /changed during regeneration/)
  assert.equal(job.manifest.segments[1].name, name)
})

test('replacement paths are validated and restart removes revision clips only within this render', async () => {
  const { job, files, shot } = await fixture()
  const name = stage(files)
  await job.replaceSegment(1, job.manifest.segments[1], name, decoder, { shot, generation: 'new', buildId: 'current' })
  const invalid = structuredClone(job.manifest)
  invalid.segments[1].name = '../other.mp4'
  assert.throws(() => validateRenderJob(invalid), /segments/)
  invalid.segments[1].name = replacementSegmentName(2, 'mp4', 'new')
  assert.throws(() => validateRenderJob(invalid), /segments/)
  assert.throws(() => replacementSegmentName(1, 'mp4', '../bad'), /Invalid regeneration/)
  files.set('Window.mp4', new Blob(['assembled']))
  files.set('unrelated.mp4', new Blob(['keep']))
  await job.restart()
  assert.equal(files.has(name), false)
  assert.equal(files.has('segment-000001.mp4'), false)
  assert.equal(files.has('Window.mp4'), true)
  assert.equal(files.has('unrelated.mp4'), true)
  assert.deepEqual(job.manifest.regenerations, {})
})

test('window controls round-trip independently of render identity and permit editing bounds before running', async () => {
  const { job, shot, storage } = await fixture()
  shot.regenerateWindow = { enabled: true, start: 1, end: 2, continueUnfinished: true }
  assert.deepEqual(parseShot(serializeShot(shot)).regenerateWindow, shot.regenerateWindow)
  assert.equal((await RenderJob.open(storage, { shot })).savedFrames, job.savedFrames)
  const edited = structuredClone(shot); edited.regenerateWindow.end = 0
  assert.doesNotThrow(() => validateShot(edited))
  assert.throws(() => job.regenerationPlan(edited, 1, 0), /window end/)
  for (const window of [{ enabled: 'yes', start: 0, end: 1 }, { enabled: true, start: -1, end: 1 }, { enabled: true, start: 0, end: NaN }, { enabled: true, start: 0, end: 1, continueUnfinished: 'yes' }]) {
    assert.throws(() => validateShot({ ...structuredClone(shot), regenerateWindow: window }), /regenerateWindow/)
  }
})


test('an unfinished render can continue when the window has no saved segments to replace', async () => {
  const { job, shot } = await fixture()
  await job.updateOutput({ ...shot.output, duration: 4 })
  shot.output.duration = 4
  shot.regenerateWindow = { enabled: true, start: 3, end: 4, continueUnfinished: true }
  assert.deepEqual(job.regenerationPlan(shot, 3, 4), [])
  shot.regenerateWindow.continueUnfinished = false
  assert.throws(() => job.regenerationPlan(shot, 3, 4), /does not intersect/)
})
