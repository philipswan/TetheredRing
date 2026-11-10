import test from 'node:test'
import assert from 'node:assert/strict'
import { Blob } from 'node:buffer'
import { WritableStream } from 'node:stream/web'
import {
  Output, BufferTarget, Mp4OutputFormat, MkvOutputFormat, EncodedVideoPacketSource,
  EncodedPacket, Input, BlobSource, ALL_FORMATS, EncodedPacketSink,
} from 'mediabunny'
import { createShot } from '../../src/shots/ShotFormat.js'
import { RenderJob, segmentName, replacementSegmentName } from '../../src/capture/RenderJob.js'
import { assembleRender } from '../../src/capture/SegmentedRecorder.js'

const decoder = { codec: 'vp09.00.10.08', codedWidth: 320, codedHeight: 180 }

async function clip(container, marker) {
  const target = new BufferTarget()
  const output = new Output({ target, format: container === 'mp4' ? new Mp4OutputFormat() : new MkvOutputFormat() })
  const source = new EncodedVideoPacketSource('vp9')
  output.addVideoTrack(source, { frameRate: 1 })
  await output.start()
  // Opaque encoded payloads test lossless packet assembly, without needing a video encoder.
  await source.add(new EncodedPacket(new Uint8Array([marker, 2, 3]), 'key', 0, 1), { decoderConfig: decoder })
  await output.finalize()
  return new Blob([target.buffer])
}

for (const container of ['mp4', 'mkv']) {
  test(`assembly replaces the existing ${container} output with the manifest's regenerated segments`, async () => {
    const files = new Map()
    const storage = {
      read: async name => files.get(name) ?? null,
      async createWritable(name) {
        let bytes = new Uint8Array()
        return new WritableStream({
          write({ position, data }) {
            if (position + data.length > bytes.length) {
              const next = new Uint8Array(position + data.length)
              next.set(bytes); bytes = next
            }
            bytes.set(data, position)
          },
          close() { files.set(name, new Blob([bytes])) },
        })
      },
    }
    // Render manifests use plain JSON writes; assembly uses positioned writes.
    const manifestStorage = { ...storage, async createWritable(name) {
      const chunks = []
      return new WritableStream({ write: chunk => chunks.push(chunk), close: () => files.set(name, new Blob(chunks)) })
    } }
    const shot = createShot({ name: 'Regeneration', preset: 'default', parameters: {}, startTime: 0 })
    Object.assign(shot.output, { container, codec: 'vp9', fps: 1, width: 320, height: 180, duration: 3 })
    const fileName = `Regeneration.${container}`
    const job = await RenderJob.open(manifestStorage, { shot, fileName, codec: 'vp9', buildId: 'test' })
    for (let i = 0; i < 3; i++) {
      files.set(segmentName(i, container), await clip(container, 10 + i))
      await job.commit(i + 1, decoder)
    }
    const assemble = async () => {
      const reopened = await RenderJob.read(manifestStorage)
      await assembleRender(reopened, await storage.createWritable(fileName))
      const input = new Input({ source: new BlobSource(files.get(fileName)), formats: ALL_FORMATS })
      try {
        const track = await input.getPrimaryVideoTrack(), packets = []
        for await (const packet of new EncodedPacketSink(track).packets()) packets.push([packet.timestamp, packet.data[0]])
        return packets
      } finally { input.dispose() }
    }
    assert.deepEqual(await assemble(), [[0, 10], [1, 11], [2, 12]])
    const originalOutput = await files.get(fileName).arrayBuffer()
    const name = replacementSegmentName(1, container, 'new-generation')
    files.set(name, await clip(container, 99))
    await job.replaceSegment(1, job.manifest.segments[1], name, decoder, { shot, generation: 'new-generation', buildId: 'test' })
    assert.deepEqual(await assemble(), [[0, 10], [1, 99], [2, 12]])
    assert.notDeepEqual(await files.get(fileName).arrayBuffer(), originalOutput)
    assert.ok(files.has(segmentName(1, container)), 'original remains a recovery copy')
  })
}
