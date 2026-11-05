import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blob } from 'node:buffer'
import { WritableStream } from 'node:stream/web'
import { createShot } from '../../src/shots/ShotFormat.js'
import { RenderJob, DirectoryStorage, RENDER_JOB_FILE, segmentName, renderFolderName, validateRenderJob, compatibleDecoderConfig } from '../../src/capture/RenderJob.js'

const { structuredClone, DOMException } = globalThis

function fixture() {
  const files = new Map()
  const storage = {
    files, failWrite: false,
    async read(name) { return files.get(name) ?? null },
    async list() { return [...files.keys()] },
    async remove(name) { files.delete(name) },
    async createWritable(name) {
      const chunks = []
      return new WritableStream({
        write(chunk) { chunks.push(chunk) },
        close() {
          if (storage.failWrite) throw new Error('disk full')
          files.set(name, new Blob(chunks))
        },
      })
    },
  }
  const shot = createShot({ name: 'Test', preset: 'default', parameters: {}, startTime: 0 })
  Object.assign(shot.output, { width: 320, height: 180, fps: 30, duration: 2 })
  shot.camera.keyframes.push({ time: 0, position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] })
  const settings = { shot, fileName: 'Test.mp4', codec: 'av1', buildId: 'test-build' }
  return { storage, settings }
}

const config = { codec: 'av01.0.08M.08', codedWidth: 320, codedHeight: 180 }

test('AV1 decoder compatibility permits only lower levels/tiers with otherwise identical settings', () => {
  const original = { ...config, codec: 'av01.0.12H.08', colorSpace: { fullRange: false }, description: [1, 2] }
  assert.equal(compatibleDecoderConfig(original, { ...original, codec: 'av01.0.08M.08' }), true)
  for (const changed of [
    { codec: 'av01.0.13H.08' },
    { codec: 'av01.1.08M.08' },
    { codec: 'av01.0.08M.10' },
    { codec: 'av01.0.08M.08.0.110.01.13.01.0' },
    { codedWidth: 640 },
    { colorSpace: { fullRange: true } },
    { description: [1, 3] },
  ]) assert.equal(compatibleDecoderConfig(original, { ...original, ...changed }), false)
  assert.equal(compatibleDecoderConfig(config, { ...config, codec: 'av01.0.08H.08' }), false)
})

test('appending lower-level AV1 segments retains the original decoder requirements', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const original = { ...config, codec: 'av01.0.12H.08' }
  storage.files.set(segmentName(0, 'mp4'), new Blob(['first']))
  await job.commit(17, original)
  storage.files.set(segmentName(1, 'mp4'), new Blob(['second']))
  await job.commit(30, config)
  assert.deepEqual(job.manifest.decoderConfig, original)
  assert.equal((await RenderJob.open(storage, settings)).savedFrames, 30)
})

test('a job freezes the shot, starts empty, and stores its manifest independently of clips', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  settings.shot.name = 'Edited'
  assert.equal(job.manifest.shot.name, 'Test')
  assert.equal(job.savedFrames, 0)
  assert.equal(job.complete, false)
  assert.equal(storage.files.size, 1)
  assert.ok(storage.files.has(RENDER_JOB_FILE))
})

test('display paths do not invalidate rendered frames within the same project', async () => {
  const { storage, settings } = fixture()
  settings.shot.project = { id: 'saved-project' }
  await RenderJob.open(storage, settings)
  settings.shot.project = { id: 'saved-project', renderFolder: 'Test.render', outputPath: 'C:\\Videos\\Test.render' }
  assert.equal((await RenderJob.open(storage, settings)).savedFrames, 0)
  settings.shot.output.width = 640
  await assert.rejects(RenderJob.open(storage, settings), /different shot or output settings/)
})

test('resume starts at the next committed frame, ignoring an interrupted or orphaned next clip', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['first clip']))
  await job.commit(17, config)
  storage.files.set(segmentName(1, 'mp4'), new Blob(['unfinished clip']))
  const resumed = await RenderJob.open(storage, settings)
  assert.equal(resumed.savedFrames, 17)
  storage.files.set(segmentName(1, 'mp4'), new Blob(['replacement clip']))
  await resumed.commit(60, config)
  assert.equal(resumed.complete, true)
  assert.deepEqual(resumed.manifest.segments.map(s => [s.from, s.to]), [[0, 17], [17, 60]])
  assert.equal((await RenderJob.open(storage, settings)).savedFrames, 60)
})

test('a failed manifest commit does not advance either durable or in-memory progress', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['clip']))
  storage.failWrite = true
  await assert.rejects(job.commit(17, config), /disk full/)
  assert.equal(job.savedFrames, 0)
  storage.failWrite = false
  assert.equal((await RenderJob.open(storage, settings)).savedFrames, 0)
})

test('restart deletes only this render container\'s segments, including unfinished clips, and resets durable progress', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['first clip']))
  await job.commit(17, config)
  storage.files.set(segmentName(1, 'mp4'), new Blob(['unfinished clip']))
  for (const name of ['Test.mp4', 'Test.review-17-1.mp4', 'notes.txt', 'segment-000000.mkv', 'other/segment-000000.mp4']) {
    storage.files.set(name, new Blob(['keep']))
  }
  await job.restart({ buildId: 'new-build' })
  assert.equal(job.savedFrames, 0)
  assert.equal(job.manifest.decoderConfig, null)
  assert.equal(job.manifest.buildId, 'new-build')
  assert.deepEqual(job.manifest.shot, settings.shot)
  assert.equal(storage.files.has(segmentName(0, 'mp4')), false)
  assert.equal(storage.files.has(segmentName(1, 'mp4')), false)
  assert.equal(storage.files.size, 6)
  assert.equal((await RenderJob.open(storage, settings)).savedFrames, 0)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['fresh clip']))
  await job.commit(30, config)
  assert.deepEqual(job.manifest.segments.map(s => [s.from, s.to]), [[0, 30]])
})

test('resuming with edited rendering quality preserves every saved segment and its exact next-frame position', async () => {
  const { storage, settings } = fixture()
  Object.assign(settings.shot.output, { supersample: 2, motionBlur: 'adaptive', motionBlurMaxSamples: 1024 })
  const job = await RenderJob.open(storage, settings)
  const first = segmentName(0, 'mp4')
  const clip = new Blob(['saved clip'])
  storage.files.set(first, clip)
  await job.commit(17, config)
  const segments = structuredClone(job.manifest.segments)
  const output = { ...job.manifest.shot.output, supersample: 1, motionBlurMaxSamples: 4, bitrateMbps: 25 }
  await job.updateOutput(output)
  assert.equal(job.savedFrames, 17)
  assert.equal(storage.files.get(first), clip)
  assert.deepEqual(job.manifest.segments, segments)
  assert.deepEqual(job.manifest.decoderConfig, config)
  assert.equal(job.manifest.buildId, settings.buildId)
  output.supersample = 4
  const resumed = await RenderJob.open(storage, { existingOnly: true })
  assert.equal(resumed.manifest.shot.output.supersample, 1)
  assert.equal(resumed.manifest.shot.output.motionBlurMaxSamples, 4)
  assert.equal(resumed.manifest.shot.output.bitrateMbps, 25)
  storage.files.set(segmentName(1, 'mp4'), new Blob(['next clip']))
  await resumed.commit(30, config)
  assert.deepEqual(resumed.manifest.segments.map(s => [s.from, s.to]), [[0, 17], [17, 30]])
})

test('resuming rejects only incompatible video-format changes without altering saved work', async () => {
  for (const changed of [{ width: 640 }, { height: 360 }, { fps: 60 }, { container: 'mkv' }]) {
    const { storage, settings } = fixture()
    const job = await RenderJob.open(storage, settings)
    const first = segmentName(0, 'mp4')
    storage.files.set(first, new Blob(['saved clip']))
    await job.commit(17, config)
    const original = JSON.stringify(job.manifest)
    await assert.rejects(job.updateOutput({ ...job.manifest.shot.output, ...changed }), /different video format/)
    await assert.rejects(job.updateOutput(job.manifest.shot.output, { codec: 'avc' }), /different codec/)
    assert.equal(JSON.stringify(job.manifest), original)
    assert.equal(JSON.stringify(JSON.parse(await (await storage.read(RENDER_JOB_FILE)).text())), original)
    assert.equal(await storage.files.get(first).text(), 'saved clip')
  }
})

test('duration can be extended on Resume, but cannot end before already saved frames', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['saved clip']))
  await job.commit(60, config)
  assert.equal(job.complete, true)
  await job.updateOutput({ ...job.manifest.shot.output, duration: 3 })
  assert.equal(job.manifest.frames, 90)
  assert.equal(job.complete, false)
  await assert.rejects(job.updateOutput({ ...job.manifest.shot.output, duration: 1 }), /ends before the saved frames/)
  assert.equal(job.savedFrames, 60)
  assert.equal(job.manifest.frames, 90)
})

test('failed settings persistence does not change the in-memory or durable render', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const original = structuredClone(job.manifest)
  storage.failWrite = true
  await assert.rejects(job.updateOutput({ ...job.manifest.shot.output, supersample: 2 }), /disk full/)
  assert.deepEqual(job.manifest, original)
  assert.deepEqual(JSON.parse(await (await storage.read(RENDER_JOB_FILE)).text()), original)
})

test('restart never deletes segments if resetting the manifest fails', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const name = segmentName(0, 'mp4')
  storage.files.set(name, new Blob(['saved clip']))
  await job.commit(17, config)
  storage.failWrite = true
  await assert.rejects(job.restart(), /disk full/)
  assert.equal(job.savedFrames, 17)
  assert.equal(await storage.files.get(name).text(), 'saved clip')
})

test('restart persists the current edited shot/settings and recomputes frames instead of restoring the old shot', async () => {
  const { storage, settings } = fixture()
  Object.assign(settings.shot.output, { supersample: 2, motionBlur: 'adaptive', motionBlurMaxSamples: 1024 })
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['saved clip']))
  await job.commit(17, config)
  const edited = structuredClone(settings.shot)
  edited.camera.keyframes[0].position = [4, 5, 6]
  Object.assign(edited.output, { supersample: 1, motionBlurMaxSamples: 4, fps: 60, duration: 3, container: 'mkv' })
  await job.restart({ shot: edited, fileName: 'Test.mkv', codec: 'vp9', buildId: 'new-build' })
  assert.equal(job.savedFrames, 0)
  assert.equal(job.manifest.frames, 180)
  assert.equal(job.manifest.fileName, 'Test.mkv')
  assert.equal(job.manifest.codec, 'vp9')
  assert.equal(storage.files.has(segmentName(0, 'mp4')), false)
  edited.output.supersample = 4
  const reopened = await RenderJob.open(storage, { existingOnly: true })
  assert.equal(reopened.manifest.shot.output.supersample, 1)
  assert.equal(reopened.manifest.shot.output.motionBlurMaxSamples, 4)
  assert.deepEqual(reopened.manifest.shot.camera.keyframes[0].position, [4, 5, 6])
})

test('invalid replacement settings cannot reset progress or delete saved segments', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const name = segmentName(0, 'mp4')
  storage.files.set(name, new Blob(['saved clip']))
  await job.commit(17, config)
  const edited = structuredClone(settings.shot)
  edited.output.fps = 0
  await assert.rejects(job.restart({ shot: edited }), /output.fps/)
  assert.equal(job.savedFrames, 17)
  assert.equal(await storage.files.get(name).text(), 'saved clip')
})

test('a failed segment deletion stops restart explicitly and leaves recoverable zero-frame progress', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const name = segmentName(0, 'mp4')
  storage.files.set(name, new Blob(['saved clip']))
  await job.commit(17, config)
  storage.remove = async () => { throw new Error('permission denied') }
  await assert.rejects(job.restart(), /Could not delete old segment.*permission denied/)
  assert.equal(job.savedFrames, 0)
  assert.equal((await RenderJob.open(storage, settings)).savedFrames, 0)
  assert.equal(await storage.files.get(name).text(), 'saved clip')
})

test('missing, truncated and same-length corrupted saved clips are never silently skipped', async () => {
  for (const damaged of [null, new Blob(['x']), new Blob(['evil'])]) {
    const { storage, settings } = fixture()
    const job = await RenderJob.open(storage, settings)
    storage.files.set(segmentName(0, 'mp4'), new Blob(['good']))
    await job.commit(17, config)
    if (damaged) storage.files.set(segmentName(0, 'mp4'), damaged)
    else storage.files.delete(segmentName(0, 'mp4'))
    await assert.rejects(RenderJob.open(storage, settings), /missing or damaged/)
  }
})

test('resume still refuses changed shots and incompatible encoder configurations across application builds', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const changed = structuredClone(settings.shot)
  changed.output.fps = 60
  await assert.rejects(RenderJob.open(storage, { ...settings, shot: changed, buildId: 'different' }), /different shot/)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['first']))
  await job.commit(17, config)
  storage.files.set(segmentName(1, 'mp4'), new Blob(['second']))
  await assert.rejects(job.commit(30, { ...config, codec: 'other' }), /encoder configuration changed/)
  assert.equal(job.savedFrames, 17)
})

test('malformed manifests, gaps and path substitutions fail validation', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['clip']))
  await job.commit(17, config)
  for (const mutate of [
    m => { m.segments[0].from = 1 },
    m => { m.segments[0].to = 100 },
    m => { m.segments[0].name = '..\\escape.mp4' },
    m => { m.fileName = '..\\escape.mp4' },
    m => { m.frames = 1 },
    m => { m.version = 100 },
    m => { m.decoderConfig = null },
  ]) {
    const manifest = structuredClone(job.manifest)
    mutate(manifest)
    assert.throws(() => validateRenderJob(manifest), /render|manifest/i)
  }
  assert.equal(renderFolderName('FollowLaunchVehicle.mp4'), 'FollowLaunchVehicle.render')
  assert.equal(segmentName(12, 'mkv'), 'segment-000012.mkv')
})

test('directory storage treats only missing files as absent, not permission failures', async () => {
  const storage = new DirectoryStorage({
    async getFileHandle() { throw new DOMException('missing', 'NotFoundError') },
  })
  assert.equal(await storage.read('render.json'), null)
  storage.directory.getFileHandle = async () => { throw new DOMException('denied', 'NotAllowedError') }
  await assert.rejects(storage.read('render.json'), /denied/)
})

test('starting in a folder with clips but no manifest does not overwrite the clips', async () => {
  const { storage, settings } = fixture()
  storage.files.set(segmentName(0, 'mp4'), new Blob(['protected material']))
  await assert.rejects(RenderJob.open(storage, settings), /without a manifest/)
  assert.equal(await storage.files.get(segmentName(0, 'mp4')).text(), 'protected material')
  assert.equal(storage.files.has(RENDER_JOB_FILE), false)
})

test('cross-build resume appends at the saved frame without modifying earlier segments or build provenance', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const firstClip = new Blob(['first clip'])
  storage.files.set(segmentName(0, 'mp4'), firstClip)
  await job.commit(17, config)
  const firstSegment = structuredClone(job.manifest.segments[0])
  const readable = await RenderJob.open(storage, { existingOnly: true })
  assert.equal(readable.manifest.buildId, settings.buildId)
  const resumed = await RenderJob.open(storage, { existingOnly: true, buildId: 'new-build' })
  assert.equal(resumed.savedFrames, 17)
  storage.files.set(segmentName(1, 'mp4'), new Blob(['second clip']))
  await resumed.commit(30, config)
  const reopened = await RenderJob.open(storage, { ...settings, buildId: 'another-build' })
  assert.equal(reopened.savedFrames, 30)
  assert.equal(reopened.manifest.buildId, settings.buildId)
  assert.deepEqual(reopened.manifest.segments[0], firstSegment)
  assert.deepEqual(reopened.manifest.segments.map(s => [s.from, s.to]), [[0, 17], [17, 30]])
  assert.equal(storage.files.get(segmentName(0, 'mp4')), firstClip)
})


test('identical shots in different projects cannot share a render manifest or restart each other', async () => {
  const { storage, settings } = fixture()
  settings.shot.project = { id: 'project-a' }
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['saved clip']))
  await job.commit(17, config)
  const before = new Map(storage.files)
  const other = structuredClone(settings.shot)
  other.project.id = 'project-b'
  await assert.rejects(RenderJob.open(storage, { ...settings, shot: other }), /different shot project/)
  await assert.rejects(job.restart({ shot: other }), /different shot project/)
  assert.deepEqual(storage.files, before)
  assert.equal(job.savedFrames, 17)
})


test('a stale job cannot restart a directory whose manifest now belongs to another project', async () => {
  const { storage, settings } = fixture()
  settings.shot.project = { id: 'project-a' }
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['saved clip']))
  await job.commit(17, config)
  const foreign = structuredClone(job.manifest)
  foreign.shot.project.id = 'project-b'
  storage.files.set(RENDER_JOB_FILE, new Blob([JSON.stringify(foreign)]))
  const before = new Map(storage.files)
  await assert.rejects(job.restart(), /different shot project/)
  assert.deepEqual(storage.files, before)
  assert.equal(job.savedFrames, 17)
})


test('legacy project adoption adds only project metadata and preserves saved frames with a backup', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  storage.files.set(segmentName(0, 'mp4'), new Blob(['legacy clip']))
  await job.commit(17, config)
  const original = structuredClone(job.manifest)
  const clip = storage.files.get(segmentName(0, 'mp4'))
  const current = structuredClone(settings.shot)
  current.project = { id: 'current-project' }
  await job.adoptProject(current)
  assert.equal(job.savedFrames, 17)
  assert.deepEqual(job.manifest, { ...original, shot: { ...original.shot, project: current.project } })
  assert.equal(storage.files.get(segmentName(0, 'mp4')), clip)
  assert.deepEqual(JSON.parse(await storage.files.get('render.before-project-migration.json').text()), original)
  assert.deepEqual((await RenderJob.read(storage)).manifest, job.manifest)
})

test('legacy recovery cannot transfer an owned render or adopt a different shot', async () => {
  for (const owned of [false, true]) {
    const { storage, settings } = fixture()
    if (owned) settings.shot.project = { id: 'original-owner' }
    const job = await RenderJob.open(storage, settings)
    const current = structuredClone(settings.shot)
    current.project = { id: 'other-project' }
    if (!owned) current.camera.keyframes[0].position = [4, 5, 6]
    const before = new Map(storage.files)
    await assert.rejects(job.adoptProject(current), owned ? /different shot project/ : /does not match/)
    assert.deepEqual(storage.files, before)
  }
})

test('legacy recovery rechecks manifest ownership and failed metadata writes preserve progress', async () => {
  const { storage, settings } = fixture()
  const job = await RenderJob.open(storage, settings)
  const current = structuredClone(settings.shot)
  current.project = { id: 'current-project' }
  storage.failWrite = true
  await assert.rejects(job.adoptProject(current), /disk full/)
  assert.equal(job.manifest.shot.project, undefined)
  assert.equal((await RenderJob.read(storage)).manifest.shot.project, undefined)
  storage.failWrite = false
  const foreign = structuredClone(job.manifest)
  foreign.shot.project = { id: 'another-owner' }
  storage.files.set(RENDER_JOB_FILE, new Blob([JSON.stringify(foreign)]))
  await assert.rejects(job.adoptProject(current), /different shot project/)
  assert.deepEqual((await RenderJob.read(storage)).manifest, foreign)
})
