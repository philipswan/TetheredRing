import {
  Input, BlobSource, ALL_FORMATS, EncodedPacketSink, EncodedVideoPacketSource,
  Output, StreamTarget, Mp4OutputFormat, MkvOutputFormat,
} from 'mediabunny'
import { VideoRecorder } from './VideoRecorder.js'
import { SEGMENT_SECONDS, CHECKPOINT_MS, segmentName, replacementSegmentName } from './RenderJob.js'

function configJSON(config) {
  const { description, ...rest } = config
  if (description) {
    const bytes = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description)
    rest.description = [...bytes]
  }
  return rest
}

async function openSegment(job, segment) {
  const blob = await job.storage.read(segment.name)
  if (!blob) throw new Error(`Missing segment ${segment.name}.`)
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    const o = job.manifest.shot.output
    if (!track || track.codec !== job.manifest.codec || track.displayWidth !== o.width || track.displayHeight !== o.height) {
      throw new Error(`Unexpected codec or dimensions in ${segment.name}.`)
    }
    return { input, track, sink: new EncodedPacketSink(track), config: await track.getDecoderConfig() }
  }
  catch (error) { input.dispose(); throw error }
}

export async function inspectSegment(job, name, frames) {
  const { input, sink, config } = await openSegment(job, { name })
  try {
    const timestamps = []
    for await (const packet of sink.packets()) {
      if (!timestamps.length && packet.type !== 'key') throw new Error('A segment must start with an independently decodable keyframe.')
      timestamps.push(packet.timestamp)
    }
    if (timestamps.length !== frames) throw new Error(`Expected ${frames} frames in ${name}, found ${timestamps.length}.`)
    timestamps.sort((a, b) => a - b).forEach((time, i) => {
      if (Math.abs(time - i / job.manifest.shot.output.fps) > 0.0001) throw new Error('Unexpected segment timestamps; this encoder cannot be resumed safely.')
    })
    return configJSON(config)
  }
  finally { input.dispose() }
}

export class SegmentedRecorder {
  constructor(job, canvas, onSaved = () => {}) {
    this.job = job
    this.canvas = canvas
    this.options = { ...job.manifest.shot.output, codec: job.manifest.codec }
    this.frameCount = job.savedFrames
    this.current = null
    this.onSaved = onSaved
  }

  async addFrame() {
    if (!this.current) {
      const o = this.options
      const name = segmentName(this.job.manifest.segments.length, o.container)
      const writable = await this.job.storage.createWritable(name)
      this.current = new VideoRecorder({
        ...o, canvas: this.canvas, fileName: name, writable,
        bitrate: o.bitrateMbps ? o.bitrateMbps * 1e6 : null,
      })
      try {
        await this.current.prepareTarget()
        await this.current.start(o.codec)
      }
      catch (error) {
        try { await this.current.output?.cancel(); await writable.abort() }
        catch (cleanupError) { console.error('Could not release the unfinished segment:', cleanupError) }
        this.current = null
        throw error
      }
      this.segmentStarted = performance.now()
    }
    await this.current.addFrame()
    this.frameCount++
    if (this.current.frameCount >= Math.round(this.options.fps * SEGMENT_SECONDS) ||
        performance.now() - this.segmentStarted >= CHECKPOINT_MS) await this.checkpoint()
  }

  async checkpoint() {
    if (!this.current) return
    const recorder = this.current
    await recorder.finish()
    const config = await inspectSegment(this.job, recorder.fileName, recorder.frameCount)
    await this.job.commit(this.frameCount, config)
    this.current = null
    await this.onSaved(this.job)
  }

  async finish() {
    await this.checkpoint()
    return { fileName: this.job.manifest.fileName, frames: this.frameCount, codec: this.options.codec }
  }

  async cancel() {
    await this.current?.cancel()
    this.current = null
  }
}

export class SegmentReplacementRecorder {
  constructor(job, canvas, { index, segment }, shot, generation, buildId) {
    this.job = job
    this.canvas = canvas
    this.index = index
    this.segment = segment
    this.shot = shot
    this.generation = generation
    this.buildId = buildId
    this.options = { ...shot.output, codec: job.manifest.codec }
    this.fileName = replacementSegmentName(index, this.options.container, generation)
    this.frameCount = 0
    this.current = null
  }

  async addFrame() {
    if (!this.current) {
      if (await this.job.storage.read(this.fileName)) throw new Error('The replacement filename already exists; the saved clip has not been overwritten.')
      const writable = await this.job.storage.createWritable(this.fileName)
      this.current = new VideoRecorder({
        ...this.options, canvas: this.canvas, fileName: this.fileName, writable,
        bitrate: this.options.bitrateMbps ? this.options.bitrateMbps * 1e6 : null,
      })
      try { await this.current.prepareTarget(); await this.current.start(this.options.codec) }
      catch (error) {
        try { await this.current.output?.cancel(); await writable.abort() }
        catch (cleanupError) { console.error('Could not release the unfinished replacement:', cleanupError) }
        this.current = null
        throw error
      }
    }
    await this.current.addFrame()
    this.frameCount++
  }

  async finish() {
    if (this.frameCount !== this.segment.to - this.segment.from) throw new Error('The replacement segment is incomplete; the original clip is unchanged.')
    await this.current.finish()
    const config = await inspectSegment(this.job, this.fileName, this.frameCount)
    await this.job.replaceSegment(this.index, this.segment, this.fileName, config, {
      shot: this.shot, generation: this.generation, buildId: this.buildId,
    })
    this.current = null
  }

  async cancel() {
    await this.current?.cancel()
    this.current = null
  }
}

export async function assembleRender(job, writable, onProgress = () => {}, shouldAbort = () => false) {
  let output
  try {
    await job.verify()
    if (!job.savedFrames) throw new Error('There are no saved segments to export.')
    const { manifest } = job
    output = new Output({
      format: manifest.shot.output.container === 'mkv' ? new MkvOutputFormat() : new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(writable, { chunked: true }),
    })
    const source = new EncodedVideoPacketSource(manifest.codec)
    output.addVideoTrack(source, { frameRate: manifest.shot.output.fps })
    await output.start()
    for (const segment of manifest.segments) {
      const { input, sink, config } = await openSegment(job, segment)
      try {
        const offset = segment.from / manifest.shot.output.fps
        for await (const packet of sink.packets()) {
          if (shouldAbort()) throw new DOMException('Assembly aborted; saved segments are unchanged.', 'AbortError')
          await source.add(packet.clone({ timestamp: packet.timestamp + offset }), { decoderConfig: config })
        }
      }
      finally { input.dispose() }
      onProgress(segment.to, manifest.frames)
    }
    await output.finalize()
    return { fileName: manifest.fileName, frames: job.savedFrames, codec: manifest.codec, bytes: null }
  }
  catch (error) {
    if (output) await output.cancel()
    try { await writable.abort() }
    catch (abortError) { console.error('Could not abort video assembly:', abortError) }
    throw error
  }
}
