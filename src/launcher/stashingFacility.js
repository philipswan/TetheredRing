import * as THREE from 'three'
import { rampRecoveryDistance } from './fallBack.js'

export const TRANSFER_SEASON_DAYS = 14
export const STASH_WAIT = 5
export const STASH_TRANSFER = 10
export const STASH_LIFT = 3
export const STASH_TRAVERSE = 4
export const STASH_PARKING_CLEARANCE = 0.5
export const STASH_CLEARANCE = 2

export function dailyStashingCapacity(params) {
  return Math.max(1, Math.ceil(params.numLaunchesPerDay.value))
}

// Default to the upper ramp, 300 vertical metres below its top. Terrain fitting
// moves it farther along the curve until the entire facility clears the mountain.
export function stashingRampStation(profile, portalDistance = null) {
  const rise = profile.atDistance(profile.length).r - profile.atDistance(0).r
  const upperStation = rampRecoveryDistance({ rampStart: 0, rampEnd: profile.length,
    radiusAt: s => profile.atDistance(s).r, drop: Math.min(300, rise / 2) })
  return Number.isFinite(portalDistance) ? Math.max(0, Math.min(profile.length, portalDistance)) : upperStation
}

// One closed box contains the tube, receiving positions, parked assemblies,
// and the full crane sweep. Its floor follows the lowest receiving geometry;
// its roof follows the highest lifted assembly, with only working clearance.
export function planStashingStorage({ capacity, halfSizes, stopCentres, tubeRadius,
  screwTop = 0, tubeTop = tubeRadius, tubeBounds = null, side = 1 }) {
  const slots = { nut: [], sled: [] }, transferHeights = {}
  const bounds = new THREE.Box3(), transferBounds = new THREE.Box3()
  const include = (box, centre, halfSize) => box.union(new THREE.Box3().setFromCenterAndSize(centre,
    halfSize.clone().multiplyScalar(2)))
  for (const kind of ['nut', 'sled']) include(bounds, stopCentres[kind], halfSizes[kind])
  const tube = tubeBounds?.clone() ?? new THREE.Box3(
    new THREE.Vector3(-tubeRadius, bounds.min.y, -tubeRadius),
    new THREE.Vector3(tubeRadius, bounds.max.y, tubeTop))
  bounds.union(tube)
  const storageFloor = bounds.min.z - STASH_PARKING_CLEARANCE
  let edge = (side > 0 ? bounds.max.x : -bounds.min.x) + STASH_PARKING_CLEARANCE
  let parkedTop = -Infinity
  for (let i = 0; i < capacity; i++) for (const kind of ['nut', 'sled']) {
    const half = halfSizes[kind]
    const centre = new THREE.Vector3(side * (edge + half.x), stopCentres[kind].y,
      storageFloor + STASH_PARKING_CLEARANCE + half.z)
    slots[kind].push(centre)
    include(bounds, centre, half)
    parkedTop = Math.max(parkedTop, centre.z + half.z)
    edge += 2 * half.x + STASH_PARKING_CLEARANCE
  }
  for (const kind of ['nut', 'sled']) {
    const half = halfSizes[kind]
    const height = Math.max(tube.max.z, tubeTop, screwTop, parkedTop) + half.z + STASH_PARKING_CLEARANCE
    transferHeights[kind] = Math.max(stopCentres[kind].z, height)
    include(transferBounds, stopCentres[kind], half)
    const raised = stopCentres[kind].clone(); raised.z = transferHeights[kind]
    include(transferBounds, raised, half)
    for (const target of slots[kind]) {
      const above = target.clone(); above.z = transferHeights[kind]
      include(transferBounds, above, half)
      include(transferBounds, target, half)
    }
  }
  bounds.union(transferBounds).expandByScalar(STASH_PARKING_CLEARANCE)
  return { slots, bounds, tubeBounds: tube, transferBounds, transferHeights, storageFloor,
    size: bounds.getSize(new THREE.Vector3()), centre: bounds.getCenter(new THREE.Vector3()) }
}

// Search uphill using clearance for the complete box footprint, not just the
// point at its centre. Null means terrain is missing or no fitting station exists.
export async function aboveGroundStashingStation({ startDistance, endDistance, clearanceAt, step = 50 }) {
  const first = await clearanceAt(startDistance)
  if (first === null) return null
  if (first >= STASH_PARKING_CLEARANCE) return startDistance
  let lo = startDistance
  while (lo < endDistance) {
    const high = Math.min(endDistance, lo + step)
    const clearance = await clearanceAt(high)
    if (clearance === null) return null
    if (clearance >= STASH_PARKING_CLEARANCE) {
      let low = lo, hi = high
      for (let i = 0; i < 24 && hi - low > 0.1; i++) {
        const mid = (low + hi) / 2, value = await clearanceAt(mid)
        if (value === null) return null
        if (value >= STASH_PARKING_CLEARANCE) hi = mid; else low = mid
      }
      return Math.min(endDistance, hi + 1)
    }
    lo = high
  }
  return null
}

export function stashingTransferPose({ startCentre, startOrientation, targetCentre,
  transferHeight = Math.max(startCentre.z, targetCentre.z), elapsed }) {
  const ease = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }
  const movingTime = elapsed - STASH_WAIT
  const lift = ease(movingTime / STASH_LIFT)
  const slide = ease((movingTime - STASH_LIFT) / STASH_TRAVERSE)
  const lower = ease((movingTime - STASH_LIFT - STASH_TRAVERSE) / (STASH_TRANSFER - STASH_LIFT - STASH_TRAVERSE))
  const centre = startCentre.clone()
  centre.z = THREE.MathUtils.lerp(startCentre.z, transferHeight, lift)
  if (movingTime > STASH_LIFT + STASH_TRAVERSE) centre.z = THREE.MathUtils.lerp(transferHeight, targetCentre.z, lower)
  centre.x = THREE.MathUtils.lerp(startCentre.x, targetCentre.x, slide)
  centre.y = THREE.MathUtils.lerp(startCentre.y, targetCentre.y, slide)
  return { centre, orientation: startOrientation.clone(), fraction: ease(movingTime / STASH_TRANSFER) }
}

function storageBoxGeometry(size) {
  return new THREE.BoxGeometry(...size.toArray())
}

// Last transition from underground to open air while travelling uphill. Null
// means the configured ramp top remains the provisional siting reference.
export async function mountainPortalDistance({ length, clearanceAt, samples = 64 }) {
  let high = length, highClearance = await clearanceAt(high)
  if (highClearance === null || highClearance < 0) return null
  for (let i = 1; i <= samples; i++) {
    const low = length * (1 - i / samples)
    const clearance = await clearanceAt(low)
    if (clearance === null) return null
    if (clearance < 0 && highClearance >= 0) {
      let lo = low, hi = high
      for (let j = 0; j < 24 && hi - lo > 0.1; j++) {
        const mid = (lo + hi) / 2, value = await clearanceAt(mid)
        if (value === null) return null
        if (value < 0) lo = mid; else hi = mid
      }
      return (lo + hi) / 2
    }
    high = low
    highClearance = clearance
  }
  return null
}

export class StashingFacility {
  constructor({ parent, frame, capacity, tubeRadius, screwTop = 0, tubeTop = tubeRadius, obstacleBoundsAtRange, side = 1, components }) {
    this.components = components
    this.capacity = capacity
    this.entries = new Map()
    this.root = new THREE.Group()
    this.root.name = 'stashingFacility'
    this.root.position.copy(frame.point)
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.rightward, frame.forward, frame.upward))
    parent.add(this.root)
    const inverse = this.root.quaternion.clone().invert()
    const halfSizes = {}, stopCentres = {}
    for (const kind of ['nut', 'sled']) {
      const component = components[kind]
      const model = component.create()
      component.pose(model)
      const position = model.position.clone().sub(frame.point).applyQuaternion(inverse)
      const orientation = inverse.clone().multiply(model.quaternion)
      model.position.set(0, 0, 0)
      model.quaternion.identity()
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      component.localCentre = box.getCenter(new THREE.Vector3())
      const orientedBox = box.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(orientation))
      halfSizes[kind] = orientedBox.getSize(new THREE.Vector3()).multiplyScalar(0.5)
      component.startOrientation = orientation
      stopCentres[kind] = position.add(component.localCentre.clone().applyQuaternion(orientation))
      component.startCentre = stopCentres[kind]
      component.release(model)
    }
    let tubeBounds = null
    if (obstacleBoundsAtRange) {
      const lo = Math.min(...['nut', 'sled'].map(kind => stopCentres[kind].y - halfSizes[kind].y))
      const hi = Math.max(...['nut', 'sled'].map(kind => stopCentres[kind].y + halfSizes[kind].y))
      tubeBounds = obstacleBoundsAtRange(lo, hi)
      tubeTop = tubeBounds.max.z
    }
    this.layoutInput = { halfSizes, stopCentres, tubeRadius, screwTop, tubeTop, tubeBounds, side }
    this.plan = planStashingStorage({ capacity, ...this.layoutInput })
    const geometry = storageBoxGeometry(this.plan.size)
    const material = new THREE.MeshPhongMaterial({ color: 0x80bdce, transparent: true,
      opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
    this.box = new THREE.Mesh(geometry, material)
    this.box.name = 'stashingFacilityWalls'
    this.box.position.copy(this.plan.centre)
    this.box.renderOrder = 3
    this.root.add(this.box)
  }

  update({ time, spacing, firstLaunch = 0, lastLaunch, visible = true }) {
    this.root.visible = visible
    const wanted = new Set()
    // Keep every recovered assembly until a return service is modelled. If a
    // continuous simulation exceeds its planned daily traffic, extend the racks
    // without moving any existing slot or allowing two objects to share a slot.
    const needed = Math.max(this.capacity, lastLaunch - firstLaunch + 1)
    if (needed > this.capacity) {
      this.capacity = needed
      this.plan = planStashingStorage({ capacity: needed, ...this.layoutInput })
      this.box.geometry.dispose()
      this.box.geometry = storageBoxGeometry(this.plan.size)
      this.box.position.copy(this.plan.centre)
    }
    for (let k = firstLaunch; k <= lastLaunch; k++) {
      for (const kind of ['nut', 'sled']) {
        const component = this.components[kind]
        const elapsed = time - k * spacing - component.stopTime
        if (elapsed < 0 || !component.visible()) continue
        const key = `${kind}:${k}`
        wanted.add(key)
        let entry = this.entries.get(key)
        if (!entry) {
          const model = component.create()
          component.pose(model, k)
          this.root.add(model)
          entry = { model, component }
          this.entries.set(key, entry)
        }
        const pose = stashingTransferPose({ startCentre: component.startCentre,
          startOrientation: component.startOrientation, targetCentre: this.plan.slots[kind][k - firstLaunch],
          transferHeight: this.plan.transferHeights[kind], elapsed })
        entry.model.visible = true
        entry.model.quaternion.copy(pose.orientation)
        entry.model.position.copy(pose.centre).sub(component.localCentre.clone().applyQuaternion(pose.orientation))
      }
    }
    for (const [key, entry] of this.entries) {
      if (!wanted.has(key)) {
        entry.model.removeFromParent()
        entry.component.release(entry.model)
        this.entries.delete(key)
      }
    }
  }

  dispose() {
    for (const { model, component } of this.entries.values()) {
      model.removeFromParent()
      component.release(model)
    }
    this.entries.clear()
    this.box.geometry.dispose()
    this.box.material.dispose()
    this.root.removeFromParent()
  }
}
