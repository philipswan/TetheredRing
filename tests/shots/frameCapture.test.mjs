import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FrameCapture } from '../../src/capture/FrameCapture.js'

function fixture({ width = 2, height = 2, factor = 1 } = {}) {
  const state = { pixels: new Uint8Array(width * height * 4), error: 0, lost: false, target: null, published: null, reads: 0 }
  const gl = {
    drawingBufferWidth: width * factor, drawingBufferHeight: height * factor,
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, NO_ERROR: 0,
    isContextLost: () => state.lost,
    getError: () => state.error,
    readPixels(x, y, w, h, format, type, destination) {
      assert.deepEqual([x, y, w, h, format, type], [0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE])
      state.reads++
      destination.set(state.pixels)
    },
  }
  const canvas = {
    getContext(type, options) {
      assert.equal(type, '2d')
      assert.deepEqual(options, { alpha: false, willReadFrequently: true })
      return {
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: image => { state.published = image.data.slice() },
      }
    },
  }
  const renderer = { getContext: () => gl, getRenderTarget: () => state.target }
  return { state, gl, canvas, capture: new FrameCapture(renderer, canvas, width, height, width * factor, height * factor) }
}

test('capture reads the output corner, flips rows and makes pixels opaque without changing RGB', () => {
  for (const factor of [1, 2, 4]) {
    const { state, canvas, capture } = fixture({ factor })
    state.pixels.set([1, 2, 3, 0, 4, 5, 6, 128, 7, 8, 9, 255, 10, 11, 12, 0])
    assert.equal(capture.capture(), canvas)
    assert.deepEqual([...state.published], [7, 8, 9, 255, 10, 11, 12, 255, 1, 2, 3, 255, 4, 5, 6, 255])
    const snapshot = state.published
    state.pixels.fill(42)
    capture.capture()
    assert.equal(snapshot[0], 7)
    assert.equal(state.published[0], 42)
  }
})

test('capture rejects incomplete, resized or lost framebuffers rather than encoding a degraded frame', () => {
  for (const axis of ['drawingBufferWidth', 'drawingBufferHeight']) {
    const { state, gl, capture } = fixture()
    gl[axis] = 1
    assert.throws(() => capture.capture(), /drawing buffer changed/)
    assert.equal(state.reads, 0)
  }
  const { state, canvas, capture } = fixture()
  canvas.width = 1
  assert.throws(() => capture.capture(), /output canvas changed/)
  canvas.width = 2
  state.lost = true
  assert.throws(() => capture.capture(), /context lost/)
  state.lost = false
  state.target = {}
  assert.throws(() => capture.capture(), /default framebuffer/)
  state.target = null
  state.error = 0x0502
  assert.throws(() => capture.capture(), /readback failed/)
  assert.equal(state.published, null)
})

test('capture reports failure to allocate its CPU canvas', () => {
  assert.throws(() => new FrameCapture({}, { getContext: () => null }, 2, 2), /Could not create/)
})
