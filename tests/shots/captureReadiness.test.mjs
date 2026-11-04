import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { PixelLOD } from '../../src/scene/PixelLOD.js'
import { InstancedProxyPool } from '../../src/scene/InstancedProxyPool.js'
import '../support/rawImports.mjs'
import { GoogleEarthCameraPlayback } from '../../src/camera/GoogleEarthCameraPlayback.js'
// (After the hook above: it imports shaders with ?raw.)
const { GraphicsQuality } = await import('../../src/app/GraphicsQuality.js')

function sceneWithLOD() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  const lod = new PixelLOD(1)
  lod.position.z = -10
  scene.add(lod)
  return { scene, camera, lod }
}

test('recording waits for the desired asynchronous detail, not its already-built coarse fallback', async () => {
  const budget = PixelLOD.buildBudget
  PixelLOD.buildBudget = Infinity
  try {
    const { scene, camera, lod } = sceneWithLOD()
    const detail = new THREE.Object3D()
    let builds = 0
    lod.addLevel(1, async () => { builds++; await new Promise(resolve => setImmediate(resolve)); return detail })
    lod.addLevel(0, new THREE.Object3D())
    await PixelLOD.prepareScene(scene, camera)
    assert.equal(lod.currentPixelLevel, 0)
    assert.equal(detail.visible, true)
    assert.equal(builds, 1)
  }
  finally { PixelLOD.buildBudget = budget }
})

test('required geometry failures abort preparation, while hidden geometry is not awaited', async () => {
  const { scene, camera, lod } = sceneWithLOD()
  lod.addLevel(1, () => Promise.reject(new Error('geometry failed')))
  await assert.rejects(PixelLOD.prepareScene(scene, camera), /geometry failed/)
  lod.visible = false
  await PixelLOD.prepareScene(scene, camera)
})

test('LOD preparation includes nested lazy levels attached by an asynchronous factory', async () => {
  const { scene, camera, lod } = sceneWithLOD()
  const nested = new PixelLOD(1)
  const detail = new THREE.Object3D()
  nested.addLevel(1, async () => detail)
  lod.addLevel(1, async () => nested)
  await PixelLOD.prepareScene(scene, camera)
  assert.equal(detail.visible, true)
  assert.equal(nested.currentPixelLevel, 0)
})

test('new and hidden LOD proxies are reflected in the same frame before drawing', () => {
  const { scene, camera, lod } = sceneWithLOD()
  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshBasicMaterial()
  const pool = new InstancedProxyPool({ name: 'test', levels: [{ geometry, material, minPixels: 0 }], size: 1, parent: scene })
  try {
    lod.addLevel(1, () => pool.createProxy())
    PixelLOD.updateScene(scene, camera)
    pool.sync(camera, PixelLOD.viewportHeight)
    assert.equal(pool.meshes[0].count, 1)
    lod.size = 0
    PixelLOD.updateScene(scene, camera)
    pool.sync(camera, PixelLOD.viewportHeight)
    assert.equal(pool.meshes[0].count, 0)
    lod.size = 1
    lod.reset({ dispose: false })
    PixelLOD.updateScene(scene, camera)
    pool.sync(camera, PixelLOD.viewportHeight)
    assert.equal(pool.meshes[0].count, 1)
  }
  finally { pool.dispose(); geometry.dispose(); material.dispose() }
})

test('quality changes cannot lower recording detail or supersampled terrain quality', () => {
  const bias = PixelLOD.lodBias
  const app = { shots: { recordingSize: { pixelRatio: 2 } }, planet: { lod: {}, setSeaLite: () => {} }, onResize: () => assert.fail('interactive resize') }
  const quality = Object.create(GraphicsQuality.prototype)
  quality.app = app
  quality.mode = 'low'
  try {
    quality.apply()
    assert.equal(PixelLOD.lodBias, 1)
    assert.equal(app.planet.lod.sseThreshold, 3)
  }
  finally { PixelLOD.lodBias = bias }
})

test('Google Earth playback restores size through the application resize callback', () => {
  const camera = new THREE.PerspectiveCamera()
  const sizes = []
  const playback = new GoogleEarthCameraPlayback({
    camera, renderer: { setClearAlpha() {}, setSize() { assert.fail('direct renderer resize') } },
    planetCoordSys: new THREE.Group(), store: {}, resize: (w, h) => sizes.push([w, h]),
  })
  playback.saved = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 45, clearAlpha: 1, width: 640, height: 360 }
  playback.stop()
  assert.deepEqual(sizes, [[640, 360]])
})
