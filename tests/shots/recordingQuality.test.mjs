import test from 'node:test'
import assert from 'node:assert/strict'
import { CODEC_FALLBACK_ORDER, listEncodableCodecs, recordingQuality } from '../../src/capture/VideoRecorder.js'

function probeEncoder(t, accepts) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder')
  const configs = []
  Object.defineProperty(globalThis, 'VideoEncoder', {
    configurable: true,
    value: class {
      static async isConfigSupported(config) {
        configs.push(config)
        return { supported: accepts(config), config }
      }
    },
  })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'VideoEncoder', original)
    else delete globalThis.VideoEncoder
  })
  return configs
}

test('default recording probes require constant quantization for every fallback codec', async t => {
  const configs = probeEncoder(t, () => true)
  assert.deepEqual(await listEncodableCodecs({ width: 320, height: 180, fps: 60 }), CODEC_FALLBACK_ORDER)
  assert.equal(configs.length, CODEC_FALLBACK_ORDER.length)
  for (const config of configs) {
    assert.equal(config.bitrateMode, 'quantizer')
    assert.equal(config.bitrate, undefined)
    assert.equal(config.framerate, 60)
  }
})

test('unsupported constant-quality encoding never silently falls back to a bitrate', async t => {
  const configs = probeEncoder(t, config => config.bitrateMode === 'variable')
  assert.deepEqual(await listEncodableCodecs({ width: 322, height: 180, fps: 60, bitrateMbps: null }), [])
  assert.equal(configs.length, CODEC_FALLBACK_ORDER.length)
  assert.ok(configs.every(config => config.bitrateMode === 'quantizer'))
})

test('explicit bitrate overrides use the same target in shot settings and recorder probes', async t => {
  const configs = probeEncoder(t, () => true)
  for (const settings of [{ width: 324, bitrateMbps: 12 }, { width: 326, bitrate: 12e6 }]) {
    assert.deepEqual(await listEncodableCodecs({ height: 180, fps: 60, ...settings }), CODEC_FALLBACK_ORDER)
  }
  assert.equal(configs.length, CODEC_FALLBACK_ORDER.length * 2)
  for (const config of configs) {
    assert.equal(config.bitrateMode, 'variable')
    assert.equal(config.bitrate, 12e6)
  }
})

test('undefined studio-quality targets are reported explicitly', () => {
  assert.throws(() => recordingQuality('unknown'), /No constant-quality target/)
})
