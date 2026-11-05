// In-browser video encoding using WebCodecs (via mediabunny). Frames are pulled from the CPU capture
// canvas one at a time, so recording is independent of the real-time frame rate: the caller renders a
// frame, then awaits addFrame() before advancing the simulation by exactly 1/fps seconds.
//
// Output is written straight to disk when the File System Access API is available (Chrome/Edge),
// which keeps multi-gigabyte high-bitrate recordings out of memory. Other browsers buffer the file in
// memory and download it when recording finishes. A caller can also hand in its own WritableStream
// (`writable`): the render queue writes into a chosen folder that way, and the command-line renderer
// streams the file out of the browser.
import {
  Output,
  Mp4OutputFormat,
  MkvOutputFormat,
  BufferTarget,
  StreamTarget,
  CanvasSource,
  Quality,
  canEncodeVideo,
} from 'mediabunny'

export const STUDIO_QUANTIZERS = {
  av1: 32,
  hevc: 16,
  vp9: 16,
  avc: 16,
}

// Order of preference when the requested codec is not available. AV1 gives the best quality per bit;
// H.264 in MP4 plays everywhere.
export const CODEC_FALLBACK_ORDER = ['av1', 'avc', 'hevc', 'vp9']

export const CONTAINERS = {
  mp4: { label: 'MP4', extension: '.mp4', mimeType: 'video/mp4', codecs: ['av1', 'avc', 'hevc', 'vp9'] },
  mkv: { label: 'MKV', extension: '.mkv', mimeType: 'video/x-matroska', codecs: ['av1', 'avc', 'hevc', 'vp9'] },
}

export const CODEC_LABELS = {
  av1: 'AV1',
  avc: 'H.264',
  hevc: 'H.265',
  vp9: 'VP9',
}

export function recordingQuality(codec, bitrate) {
  if (bitrate > 0) return new Quality({ bitrate, bitrateMode: 'variable' })
  const quantizer = STUDIO_QUANTIZERS[codec]
  if (!Number.isFinite(quantizer)) throw new Error(`No constant-quality target is defined for codec "${codec}".`)
  return new Quality({ quantizer })
}

// Encoders require even dimensions for 4:2:0 chroma subsampling.
export function evenDimension(value) {
  const v = Math.max(2, Math.round(value))
  return v % 2 === 0 ? v : v + 1
}

export function isRecordingSupported() {
  return typeof window !== 'undefined' && typeof window.VideoEncoder === 'function'
}

// Returns the codecs (in fallback order) that this browser can encode at the given settings.
export async function listEncodableCodecs({ width, height, fps, bitrate, bitrateMbps }) {
  const supported = []
  for (const codec of CODEC_FALLBACK_ORDER) {
    const quality = recordingQuality(codec, bitrate ?? (bitrateMbps ? bitrateMbps * 1e6 : null))
    try {
      if (await canEncodeVideo(codec, { width, height, frameRate: fps, quality })) supported.push(codec)
    } catch {
      // Treat probe errors as "not supported".
    }
  }
  return supported
}

// Picks the requested codec if possible, otherwise the first encodable one in CODEC_FALLBACK_ORDER.
export async function resolveCodec(requested, settings) {
  const supported = await listEncodableCodecs(settings)
  if (!supported.length) return null
  return supported.includes(requested) ? requested : supported[0]
}

async function openFileTarget(suggestedName, container) {
  if (typeof window.showSaveFilePicker !== 'function') return null
  const info = CONTAINERS[container]
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: `${info.label} video`, accept: { [info.mimeType]: [info.extension] } }],
  })
  const writable = await handle.createWritable()
  return { target: new StreamTarget(writable, { chunked: true }), writable, name: handle.name }
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export class VideoRecorder {
  // options: { canvas, width, height, fps, codec, container, bitrate, fileName, saveToDisk, writable }
  // codec must already be resolved with resolveCodec(); container is 'mp4' or 'mkv'. `writable`
  // (optional) is a WritableStream taking mediabunny's { type: 'write', data, position } chunks, such
  // as a FileSystemWritableFileStream: the file goes there, without a save dialog.
  constructor(options) {
    this.options = { ...options }
    this.frameCount = 0
    this.output = null
    this.source = null
    this.fileTarget = null
    this.state = 'idle'
  }

  get fileName() {
    const { fileName, container } = this.options
    return fileName.endsWith(CONTAINERS[container].extension) ? fileName : fileName + CONTAINERS[container].extension
  }

  // Opens the save dialog when saveToDisk is set and the browser supports it. Call this first,
  // directly from the click handler: browsers only show the dialog during a user gesture.
  // Returns false if the user cancelled the dialog.
  async prepareTarget() {
    const { container, saveToDisk, writable } = this.options
    if (writable) {
      this.fileTarget = { target: new StreamTarget(writable, { chunked: true }), writable, name: this.fileName }
      return true
    }
    if (!saveToDisk || typeof window.showSaveFilePicker !== 'function') return true
    try {
      this.fileTarget = await openFileTarget(this.fileName, container)
      return true
    }
    catch (err) {
      if (err.name === 'AbortError') return false
      throw err
    }
  }

  // Starts encoding. `codec` must come from resolveCodec(); it may differ from the requested one.
  async start(codec = this.options.codec) {
    this.options.codec = codec
    const { canvas, container, bitrate, fps } = this.options

    const format = container === 'mkv'
      ? new MkvOutputFormat()
      : new Mp4OutputFormat({ fastStart: this.fileTarget ? false : 'in-memory' })
    this.bufferTarget = this.fileTarget ? null : new BufferTarget()
    this.output = new Output({ format, target: this.fileTarget ? this.fileTarget.target : this.bufferTarget })
    this.source = new CanvasSource(canvas, {
      codec,
      quality: recordingQuality(codec, bitrate),
      keyFrameInterval: 2,
      latencyMode: 'quality',
    })
    this.output.addVideoTrack(this.source, { frameRate: fps })
    await this.output.start()
    this.state = 'recording'
  }

  // Captures the canvas as the next frame. Await this before rendering the following frame; it
  // resolves when the encoder is ready for more input.
  async addFrame() {
    if (this.state !== 'recording') throw new Error('Recorder is not recording')
    const { fps } = this.options
    await this.source.add(this.frameCount / fps, 1 / fps)
    this.frameCount++
  }

  // Finalizes the file. Returns { fileName, bytes } where bytes is null for files streamed to disk.
  async finish() {
    if (this.state !== 'recording') return null
    this.state = 'finishing'
    await this.output.finalize()
    this.state = 'done'
    if (this.fileTarget) return { fileName: this.fileTarget.name, bytes: null }
    const buffer = this.bufferTarget.buffer
    downloadBlob(new Blob([buffer], { type: CONTAINERS[this.options.container].mimeType }), this.fileName)
    return { fileName: this.fileName, bytes: buffer.byteLength }
  }

  async cancel() {
    if (this.state !== 'recording' && this.state !== 'finishing') return
    this.state = 'cancelled'
    try {
      await this.output.cancel()
    } finally {
      if (this.fileTarget) await this.fileTarget.writable.abort().catch(() => {})
    }
  }
}
