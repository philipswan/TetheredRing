import * as THREE from 'three'

// Work still running whose result changes what is drawn: models, textures and data loading, scenery
// being built in the background. A recording waits until there is none before it draws each
// sub-frame (ShotController.settleScene), so no frame depends on how long any of it took.
//
// Loads through three.js loaders are counted through THREE.DefaultLoadingManager (trackLoadingManager,
// installed when this module is imported): an item ends after the loader's onLoad callback has run.
// Other work is counted with track(promise), for its whole chain up to where its result is in place (a
// fetched file read and decoded, a model built and added), not just its network request.
//
// Terrain is counted by the planet itself (Planet.pendingWork).

let pending = 0
let finished = 0
const end = () => { pending--; finished++ }

/** How much tracked work is still running. */
export function pendingWork() {
  return pending
}

/** How much tracked work has finished so far (for telling a slow wait from a stuck one). */
export function finishedWork() {
  return finished
}

/** Counts `promise` as pending work until it settles. Returns it. */
export function track(promise) {
  pending++
  promise.then(end, end)
  return promise
}

const trackedManagers = new WeakSet()

/** Counts the items `manager` loads (three.js loaders use THREE.DefaultLoadingManager unless given another). */
export function trackLoadingManager(manager = THREE.DefaultLoadingManager) {
  if (trackedManagers.has(manager)) return
  trackedManagers.add(manager)
  const itemStart = manager.itemStart
  const itemEnd = manager.itemEnd
  // (Loaders report an error with itemError and then itemEnd, so start and end pair up either way.)
  manager.itemStart = (url) => { pending++; itemStart.call(manager, url) }
  manager.itemEnd = (url) => { pending--; finished++; itemEnd.call(manager, url) }
}

// (On import: main.js imports this module first, before any module that loads something when it is imported.)
trackLoadingManager()
