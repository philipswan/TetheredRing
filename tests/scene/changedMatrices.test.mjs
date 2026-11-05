import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { updateChangedMatrices, installChangedMatrixUpdates } from '../../src/scene/ChangedMatrices.js'

// A small deterministic random generator (the test must not depend on Math.random).
function generator(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sameMatrices(a, b, label) {
  assert.equal(a.length, b.length)
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(Array.from(a[i].matrix.elements), Array.from(b[i].matrix.elements), `${label}: local matrix of object ${i}`)
    assert.deepEqual(Array.from(a[i].matrixWorld.elements), Array.from(b[i].matrixWorld.elements), `${label}: world matrix of object ${i}`)
    if (a[i].isCamera) assert.deepEqual(Array.from(a[i].matrixWorldInverse.elements), Array.from(b[i].matrixWorldInverse.elements), `${label}: camera inverse ${i}`)
  }
}

test('updating only changed matrices gives exactly what a forced three.js update gives', () => {
  for (let round = 0; round < 20; round++) {
    // The same graph twice: one updated with updateChangedMatrices (as the scene's own update), one
    // with three.js's forced update.
    const build = (seed) => {
      const random = generator(seed)
      const scene = new THREE.Scene()
      const objects = [scene]
      for (let i = 0; i < 300; i++) {
        const o = random() < 0.05 ? new THREE.PerspectiveCamera(50, 1.5, 0.1, 100) : new THREE.Object3D()
        o.position.set(random() * 100 - 50, random() * 100 - 50, random() * 1e6)
        o.quaternion.setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6))
        o.scale.setScalar(0.5 + random())
        if (random() < 0.1) { o.matrixAutoUpdate = false; o.updateMatrix() }
        if (random() < 0.05) o.matrixWorldAutoUpdate = false
        objects[Math.floor(random() * objects.length)].add(o)
        objects.push(o)
      }
      return objects
    }
    const fast = build(round + 1)
    const reference = build(round + 1)
    installChangedMatrixUpdates(fast[0])
    const steps = generator(1000 + round)
    for (let step = 0; step < 30; step++) {
      // The same changes to both.
      const changes = []
      const n = Math.floor(steps() * 12)
      for (let k = 0; k < n; k++) changes.push({ index: 1 + Math.floor(steps() * 300), kind: steps(), a: steps(), b: steps() })
      for (const objects of [fast, reference]) {
        for (const c of changes) {
          const o = objects[c.index]
          if (c.kind < 0.3) o.position.x += c.a * 10
          else if (c.kind < 0.45) o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.a * 6)
          else if (c.kind < 0.55) o.scale.y = 0.5 + c.b
          else if (c.kind < 0.65) { o.matrix.makeTranslation(c.a, c.b, 3) } // written directly (auto objects overwrite it)
          else if (c.kind < 0.72) { o.matrix.makeRotationZ(c.a); o.matrixWorldNeedsUpdate = true }
          else if (c.kind < 0.8) { o.position.z -= c.b; o.updateMatrixWorld() } // three.js's own update of a subtree
          else if (c.kind < 0.85) o.matrixWorld.makeScale(c.a + 1, 1, 1) // world written directly
          else if (c.kind < 0.9) o.visible = !o.visible
          // (otherwise unchanged)
        }
      }
      // The fast scene is updated the way PixelLOD and the renderer call it (forced or not); the
      // reference with three.js's forced update.
      fast[0].updateMatrixWorld(steps() < 0.5)
      reference[0].updateMatrixWorld(true)
      sameMatrices(fast, reference, `round ${round}, step ${step}`)
      // Calling it again with nothing changed leaves everything as it is.
      fast[0].updateMatrixWorld()
      sameMatrices(fast, reference, `round ${round}, step ${step} (again)`)
    }
  }
})

test('a subtree can be updated on its own', () => {
  const root = new THREE.Object3D()
  const child = new THREE.Object3D()
  child.position.set(1, 2, 3)
  root.add(child)
  root.position.set(10, 0, 0)
  updateChangedMatrices(root)
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld).toArray(), [11, 2, 3])
  root.position.x = 20
  updateChangedMatrices(root)
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld).toArray(), [21, 2, 3])
})
