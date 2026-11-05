import * as THREE from 'three'

// A whole-scene matrix update that recomputes only what changed.
//
// three.js's Object3D.updateMatrixWorld recomposes every object's local matrix from its position,
// rotation and scale, and multiplies every world matrix, each time it runs, and a frame runs it on
// the whole scene several times (PixelLOD.updateScene forces one, every renderer.render does one).
// The scene holds about 18,000 objects, of which a few thousand move from one frame to the next (the
// mass driver's spinning screws) and, away from the launcher, a few dozen. installChangedMatrixUpdates
// replaces the scene's own updateMatrixWorld with updateChangedMatrices, which leaves every matrix
// exactly as a forced three.js update would (`scene.updateMatrixWorld(true)`), but skips objects whose
// inputs are what they were at its last visit:
//
//   - its position, quaternion and scale (when matrixAutoUpdate), or else its local matrix;
//   - its local matrix and world matrix as this update left them (so a matrix written by other code,
//     or updated with three.js's own updateMatrixWorld in between, is noticed);
//   - its parent's world matrix (a changed parent updates the whole subtree).
//
// matrixWorldNeedsUpdate is cleared but not relied on: three.js sets it in updateMatrix(), which
// updateWorldMatrix() (and so every getWorldPosition()) calls without clearing it, so the scene and
// planetCoordSys have it set almost every time. Every real change is found by comparing values instead.
//
// A skipped object's matrices are bit-for-bit what recomputing them would give, because they are the
// result of the same three.js operations (Matrix4.compose, multiplyMatrices) on the same numbers.
// Objects with their own updateMatrixWorld (cameras, skinned meshes, helpers) get it called, so their
// extra work (a camera's matrixWorldInverse) still happens; their subtrees are then updated by three.js.

const CACHE = Symbol('changedMatrices')
const objectUpdate = THREE.Object3D.prototype.updateMatrixWorld
const objectUpdateMatrix = THREE.Object3D.prototype.updateMatrix

// Cache layout per object: [0..9] position, quaternion, scale last composed; [10..25] local matrix;
// [26..41] world matrix.
const LOCAL = 10
const WORLD = 26

function same(cache, offset, e) {
  return cache[offset] === e[0] && cache[offset + 1] === e[1] && cache[offset + 2] === e[2] && cache[offset + 3] === e[3] &&
    cache[offset + 4] === e[4] && cache[offset + 5] === e[5] && cache[offset + 6] === e[6] && cache[offset + 7] === e[7] &&
    cache[offset + 8] === e[8] && cache[offset + 9] === e[9] && cache[offset + 10] === e[10] && cache[offset + 11] === e[11] &&
    cache[offset + 12] === e[12] && cache[offset + 13] === e[13] && cache[offset + 14] === e[14] && cache[offset + 15] === e[15]
}

function store(cache, offset, e) {
  for (let i = 0; i < 16; i++) cache[offset + i] = e[i]
}

// Updates `object` and its descendants. `parentChanged`: the parent's world matrix differs from what
// this object's world matrix was last computed from.
export function updateChangedMatrices(object, parentChanged = false) {
  if (object.updateMatrixWorld !== objectUpdate && object.updateMatrixWorld !== sceneUpdate) {
    object.updateMatrixWorld(true) // (its own update, forced: few objects, with small subtrees)
    return
  }
  let cache = object[CACHE]
  const fresh = !cache
  if (fresh) cache = object[CACHE] = new Float64Array(42)
  let changed = fresh || parentChanged
  object.matrixWorldNeedsUpdate = false
  const matrix = object.matrix.elements
  if (object.matrixAutoUpdate) {
    if (object.updateMatrix !== objectUpdateMatrix) {
      object.updateMatrix()
      changed = true
    }
    else {
      const p = object.position, q = object.quaternion, s = object.scale
      if (fresh || cache[0] !== p.x || cache[1] !== p.y || cache[2] !== p.z || cache[3] !== q._x || cache[4] !== q._y ||
          cache[5] !== q._z || cache[6] !== q._w || cache[7] !== s.x || cache[8] !== s.y || cache[9] !== s.z || !same(cache, LOCAL, matrix)) {
        object.matrix.compose(p, q, s)
        cache[0] = p.x; cache[1] = p.y; cache[2] = p.z
        cache[3] = q._x; cache[4] = q._y; cache[5] = q._z; cache[6] = q._w
        cache[7] = s.x; cache[8] = s.y; cache[9] = s.z
        changed = true
      }
    }
  }
  else if (!same(cache, LOCAL, matrix)) changed = true
  const world = object.matrixWorld.elements
  // (A world matrix written by other code since: a forced update recomputes it, unless the object
  // manages its own, and either way what is below it must follow.)
  if (!changed && !same(cache, WORLD, world)) changed = true
  if (changed) {
    if (object.matrixWorldAutoUpdate === true) {
      if (object.parent === null) object.matrixWorld.copy(object.matrix)
      else object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix)
    }
    store(cache, LOCAL, matrix)
    store(cache, WORLD, world)
  }
  const children = object.children
  for (let i = 0, n = children.length; i < n; i++) updateChangedMatrices(children[i], changed)
}

function sceneUpdate() {
  updateChangedMatrices(this, false)
}

// Makes `scene.updateMatrixWorld(...)` (as PixelLOD and the renderer call it) use updateChangedMatrices.
export function installChangedMatrixUpdates(scene) {
  scene.updateMatrixWorld = sceneUpdate
}
