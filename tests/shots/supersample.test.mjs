import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Supersampler, mitchell, clampSupersample } from '../../src/capture/Supersampler.js'
import { createShot, validateShot } from '../../src/shots/ShotFormat.js'

// (Not exactly 1 for other factors, so the shader divides by the sum of its weights.)
test('Mitchell filter weights over a sample grid sum to 1 at any offset, for whole factors', () => {
  for (const factor of [1, 2, 3, 4]) {
    for (const offset of [0, 0.25, 0.5, 0.9]) {
      let sum = 0
      for (let j = -20; j <= 20; j++) sum += mitchell((j + offset) / factor)
      assert.ok(Math.abs(sum / factor - 1) < 1e-9, `factor ${factor}, offset ${offset}: ${sum / factor}`)
    }
  }
  assert.equal(mitchell(2), 0)
  assert.equal(mitchell(-2.5), 0)
})

test('supersampling is limited to what the GPU can render', () => {
  assert.equal(clampSupersample(2, 1920, 1080, 16384), 2)
  assert.equal(clampSupersample(4, 3840, 2160, 16384), 4)
  assert.equal(clampSupersample(4, 3840, 2160, 8192), 2)
  assert.equal(clampSupersample(3, 3840, 2160, 8192), 2)
  assert.equal(clampSupersample(2, 3840, 2160, 4096), 1)
  assert.equal(clampSupersample(undefined, 1920, 1080, 8192), 1)
})

test('shots default to no supersampling and reject out-of-range factors', () => {
  const shot = createShot({ preset: 'default', parameters: {}, startTime: 0 })
  assert.equal(validateShot(shot).output.supersample, 1)
  delete shot.output.supersample
  assert.equal(validateShot(shot).output.supersample, 1)
  shot.output.supersample = 8
  assert.throws(() => validateShot(shot), /supersample/)
})

test('supersampling restores the full display without changing subsequent filtering or renderer state', () => {
  const viewport = new THREE.Vector4(1, 2, 4, 2)
  let target = null
  let fail = false
  const draws = []
  const renderer = {
    getDrawingBufferSize: size => size.set(8, 4),
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value },
    getViewport: value => value.copy(viewport),
    setViewport: (x, y, w, h) => x.isVector4 ? viewport.copy(x) : viewport.set(x, y, w, h),
    getPixelRatio: () => 2,
    copyFramebufferToTexture() {},
    render(scene) {
      draws.push({ viewport: viewport.toArray(), displayOnly: scene.children[0].material.uniforms.displayOnly.value })
      if (fail) throw new Error('render failed')
    },
  }
  const canvas = {
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }),
  }
  const ss = new Supersampler(renderer, canvas)
  try {
    ss.begin(4, 2)
    ss.resolve()
    ss.restoreDisplay()
    ss.resolve()
    assert.deepEqual(draws, [
      { viewport: [0, 0, 2, 1], displayOnly: false },
      { viewport: [0, 0, 4, 2], displayOnly: true },
      { viewport: [0, 0, 2, 1], displayOnly: false },
    ])
    assert.deepEqual(viewport.toArray(), [1, 2, 4, 2])
    assert.equal(target, null)
    assert.equal(ss.canvas, canvas)
    fail = true
    assert.throws(() => ss.restoreDisplay(), /render failed/)
    assert.equal(ss.material.uniforms.displayOnly.value, false)
  }
  finally { ss.dispose() }
})
