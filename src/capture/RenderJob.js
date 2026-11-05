import { validateShot, shotDuration } from '../shots/ShotFormat.js'

export const RENDER_JOB_FILE = 'render.json'
export const RENDER_JOB_VERSION = 1
export const SEGMENT_SECONDS = 10
export const CHECKPOINT_MS = 120000

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function compatibleDecoderConfig(original, next) {
  if (canonical(original) === canonical(next)) return true
  const previous = original.codec.match(/^av01\.(\d)\.(\d{2})([MH])\.(\d{2})(\..*)?$/)
  const current = next.codec.match(/^av01\.(\d)\.(\d{2})([MH])\.(\d{2})(\..*)?$/)
  if (!previous || !current || previous[1] !== current[1] || previous[4] !== current[4] ||
      previous[5] !== current[5] || Number(current[2]) > Number(previous[2]) ||
      (previous[3] === 'M' && current[3] === 'H')) return false
  // A lower AV1 level/tier fits the original decoder requirements; all other fields must match.
  return canonical(original) === canonical({ ...next, codec: original.codec })
}

export function assertRenderProject(renderShot, shot) {
  if (renderShot.project?.id !== shot.project?.id) {
    throw new Error('This render belongs to a different shot project. Open its shot project to use it; saved files have not been changed.')
  }
}

function renderIdentity(shot) {
  const copy = validateShot(structuredClone(shot))
  delete copy.project
  return canonical(copy)
}

export function matchesLegacyRenderShot(renderShot, shot) {
  return !renderShot.project && renderIdentity(renderShot) === renderIdentity(shot)
}

export function renderFolderName(fileName) {
  return `${fileName.replace(/\.(mp4|mkv)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'shot'}.render`
}

export function segmentName(index, container) {
  return `segment-${String(index).padStart(6, '0')}.${container}`
}

export async function checksum(blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('')
}

export class DirectoryStorage {
  constructor(directory) { this.directory = directory }

  async read(name) {
    try { return await (await this.directory.getFileHandle(name)).getFile() }
    catch (error) {
      if (error.name === 'NotFoundError') return null
      throw error
    }
  }

  async createWritable(name) {
    return (await this.directory.getFileHandle(name, { create: true })).createWritable()
  }

  async list() {
    const names = []
    for await (const entry of this.directory.values()) {
      if (entry.kind === 'file') names.push(entry.name)
    }
    return names
  }

  async remove(name) {
    await this.directory.removeEntry(name)
  }
}

export async function writeJSON(storage, name, value) {
  const writable = await storage.createWritable(name)
  const writer = writable.getWriter()
  try {
    await writer.write(JSON.stringify(value, null, 2))
    await writer.close()
  }
  catch (error) {
    try { await writer.abort() }
    catch (abortError) { console.error('Could not abort the render manifest write:', abortError) }
    throw error
  }
  finally { writer.releaseLock() }
}

export function validateRenderJob(value) {
  if (value?.format !== 'tethered-ring-render' || value.version !== RENDER_JOB_VERSION) throw new Error('Unsupported render manifest.')
  const shot = validateShot(structuredClone(value.shot))
  const total = Math.max(1, Math.round(shotDuration(shot) * shot.output.fps))
  if (value.frames !== total || !['av1', 'avc', 'hevc', 'vp9'].includes(value.codec) ||
      typeof value.buildId !== 'string' || typeof value.fileName !== 'string' ||
      !/^[a-zA-Z0-9._-]+\.(mp4|mkv)$/.test(value.fileName) ||
      !value.fileName.endsWith(`.${shot.output.container}`) || !Array.isArray(value.segments)) {
    throw new Error('Invalid render manifest.')
  }
  let next = 0
  value.segments.forEach((segment, i) => {
    if (segment.name !== segmentName(i, shot.output.container) || segment.from !== next ||
        !Number.isInteger(segment.to) || segment.to <= next || segment.to > total ||
        !Number.isInteger(segment.bytes) || segment.bytes <= 0 || !/^[a-f0-9]{64}$/.test(segment.sha256)) {
      throw new Error('Invalid or non-contiguous render segments.')
    }
    next = segment.to
  })
  if (value.segments.length && (typeof value.decoderConfig?.codec !== 'string' ||
      !(value.decoderConfig.codedWidth > 0) || !(value.decoderConfig.codedHeight > 0))) {
    throw new Error('Invalid render decoder configuration.')
  }
  return { ...value, shot }
}

export class RenderJob {
  constructor(storage, manifest) {
    this.storage = storage
    this.manifest = validateRenderJob(manifest)
  }

  static async read(storage) {
    const file = await storage.read(RENDER_JOB_FILE)
    return file ? new RenderJob(storage, JSON.parse(await file.text())) : null
  }

  static async open(storage, { shot, fileName, codec, buildId, existingOnly = false }) {
    const saved = await RenderJob.read(storage)
    if (saved) {
      const job = saved
      if (shot) assertRenderProject(job.manifest.shot, shot)
      if (shot && renderIdentity(shot) !== renderIdentity(job.manifest.shot)) {
        throw new Error('This render folder contains a different shot or output settings. Open it to resume the saved shot, or choose another output folder.')
      }
      await job.verify()
      return job
    }
    if (existingOnly) throw new Error('No render.json was found in that render subfolder.')
    const frozen = validateShot(structuredClone(shot))
    if (await storage.read(segmentName(0, frozen.output.container))) {
      throw new Error('This folder contains segments without a manifest. Choose another output folder; existing clips have not been overwritten.')
    }
    const job = new RenderJob(storage, {
      format: 'tethered-ring-render', version: RENDER_JOB_VERSION, buildId, fileName,
      shot: frozen, codec, frames: Math.max(1, Math.round(shotDuration(frozen) * frozen.output.fps)),
      decoderConfig: null, segments: [],
    })
    await writeJSON(storage, RENDER_JOB_FILE, job.manifest)
    return job
  }

  async adoptProject(shot) {
    if (!shot.project) throw new Error('Open a shot project before recovering a legacy render.')
    const latest = await RenderJob.read(this.storage)
    if (!latest) throw new Error('The saved render manifest is missing.')
    if (latest.manifest.shot.project) {
      assertRenderProject(latest.manifest.shot, shot)
      this.manifest = latest.manifest
      return
    }
    if (!matchesLegacyRenderShot(latest.manifest.shot, shot)) {
      throw new Error('This legacy render does not match the current shot. Its project metadata has not been changed.')
    }
    const next = validateRenderJob({
      ...latest.manifest,
      shot: { ...latest.manifest.shot, project: structuredClone(shot.project) },
    })
    const backup = 'render.before-project-migration.json'
    if (!(await this.storage.read(backup))) await writeJSON(this.storage, backup, latest.manifest)
    await writeJSON(this.storage, RENDER_JOB_FILE, next)
    this.manifest = next
  }

  get savedFrames() { return this.manifest.segments.at(-1)?.to ?? 0 }
  get complete() { return this.savedFrames === this.manifest.frames }

  async verify() {
    for (const segment of this.manifest.segments) {
      const file = await this.storage.read(segment.name)
      if (!file || file.size !== segment.bytes || await checksum(file) !== segment.sha256) {
        throw new Error(`Saved segment ${segment.name} is missing or damaged; it has not been skipped or overwritten.`)
      }
    }
  }

  async updateOutput(output, { codec = this.manifest.codec } = {}) {
    const { manifest } = this
    const shot = validateShot({ ...structuredClone(manifest.shot), output: structuredClone(output) })
    if (this.savedFrames) {
      for (const field of ['width', 'height', 'fps', 'container']) {
        if (shot.output[field] !== manifest.shot.output[field]) {
          throw new Error(`Cannot change ${field} while appending to saved video. Use Restart for a different video format; saved segments are unchanged.`)
        }
      }
      if (codec !== manifest.codec) throw new Error('Cannot append a different codec to saved video. Use Restart to change codecs; saved segments are unchanged.')
    }
    const frames = Math.max(1, Math.round(shotDuration(shot) * shot.output.fps))
    if (frames < this.savedFrames) throw new Error('The new duration ends before the saved frames. Extend the duration or use Restart; saved segments are unchanged.')
    const next = validateRenderJob({
      ...manifest, shot, codec, frames,
      fileName: manifest.fileName.replace(/\.(mp4|mkv)$/, `.${shot.output.container}`),
    })
    if (canonical(next) === canonical(manifest)) return
    await writeJSON(this.storage, RENDER_JOB_FILE, next)
    this.manifest = next
  }

  async restart({ shot = this.manifest.shot, fileName = this.manifest.fileName, codec = this.manifest.codec, buildId = this.manifest.buildId } = {}) {
    const frozen = validateShot(structuredClone(shot))
    assertRenderProject(this.manifest.shot, frozen)
    const latest = await RenderJob.read(this.storage)
    if (!latest) throw new Error('The render manifest is missing; no segments have been deleted.')
    assertRenderProject(latest.manifest.shot, frozen)
    const pattern = new RegExp(`^segment-\\d{6,}\\.${this.manifest.shot.output.container}$`)
    const names = (await this.storage.list()).filter(name => pattern.test(name))
    const next = validateRenderJob({
      ...this.manifest, shot: frozen, fileName, codec, buildId,
      frames: Math.max(1, Math.round(shotDuration(frozen) * frozen.output.fps)),
      decoderConfig: null, segments: [],
    })
    // Reset progress before deleting so an interruption cannot leave a manifest referencing deleted clips.
    await writeJSON(this.storage, RENDER_JOB_FILE, next)
    this.manifest = next
    for (const name of names) {
      try { await this.storage.remove(name) }
      catch (error) {
        throw new Error(`Could not delete old segment "${name}". Restart stopped; some prior segments may already have been deleted. ${error.message}`, { cause: error })
      }
    }
  }

  async commit(to, decoderConfig) {
    const { manifest } = this
    if (manifest.decoderConfig && !compatibleDecoderConfig(manifest.decoderConfig, decoderConfig)) {
      throw new Error('The encoder configuration changed. Earlier segments are safe, but this segment cannot be appended.')
    }
    const name = segmentName(manifest.segments.length, manifest.shot.output.container)
    const file = await this.storage.read(name)
    if (!file?.size) throw new Error(`Segment ${name} was not saved.`)
    const next = validateRenderJob({
      ...manifest, decoderConfig: manifest.decoderConfig ?? decoderConfig,
      segments: [...manifest.segments, { name, from: this.savedFrames, to, bytes: file.size, sha256: await checksum(file) }],
    })
    await writeJSON(this.storage, RENDER_JOB_FILE, next)
    this.manifest = next
  }
}
