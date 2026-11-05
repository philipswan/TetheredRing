import * as THREE from 'three'
import { ecefToGeodetic, ellipsoidSurfaceScale } from '../physics/geodesy.js'
import { PixelLOD } from '../scene/PixelLOD.js'

// The roots of the tethers: each tether's trunk below its first fork, which is the same for every copy
// of the shared tether geometry, run down along its catenary until it meets the ground under it (the
// terrain: mountains, or the sea floor). A tether under tension cannot hang below the lowest point of
// its catenary, so where the ground is deeper than that the root ends there (`unreachable`).
//
// The ground is the planet's finest, from fixed data (Planet.sampleFixedGround: the generated ground where
// there is region data, else the finest baked terrain), not the terrain drawn just now: a root is fitted
// once and stays put whatever level of detail the terrain around it is drawn at, and comes out the same in
// every render. That data loads as it is asked for; a root whose ground had not all loaded is fitted again
// (taking it to be at sea level meanwhile) when more arrives: all of them at once while recording, else up
// to CHECKS_PER_FRAME a frame.
const VERTICES_PER_ROOT = 48
const CHECKS_PER_FRAME = 256
const COPIES_PER_CHUNK = 64 // vertices are relative to a nearby origin (precision)
const HIGHEST_GROUND = 9000 // m
const MIN_STEP_DROP = 30 // m: the smallest drop in height between ground samples
const _p = new THREE.Vector3()

export class TetherRoots {
  // copies: [{matrix, position, profiles}], how each copy of the tether geometry is placed in the ring
  // frame (matrix; position is its translation), and its geometry's
  // rootProfiles (TetherGeometry; per tether type, null entries have no root).
  constructor({ copies, refCoordSys, ringToPlanetQuaternion, ellipsoid, material }) {
    this.copies = copies
    this.quaternion = ringToPlanetQuaternion
    this.ellipsoid = ellipsoid
    this.sampleHeight = null
    this.terrainVersion = () => 0
    this.unfitted = new Set() // roots whose ground had not all loaded when last fitted
    this.roots = []    // {copy, type, chunk, slot}
    this.chunks = []
    this.meshes = []
    if (copies.length === 0) return
    const types = copies[0].profiles.map((profile, type) => profile ? type : -1).filter(type => type >= 0)
    if (types.length === 0) return
    for (let first = 0; first < copies.length; first += COPIES_PER_CHUNK) {
      const last = Math.min(copies.length, first + COPIES_PER_CHUNK)
      const count = (last - first) * types.length
      const geometry = new THREE.BufferGeometry()
      const positions = new THREE.BufferAttribute(new Float32Array(count * VERTICES_PER_ROOT * 3), 3)
      const diameters = new THREE.BufferAttribute(new Float32Array(count * VERTICES_PER_ROOT), 1)
      geometry.setAttribute('position', positions)
      geometry.setAttribute('diameter', diameters)
      geometry.setAttribute('strands', new THREE.BufferAttribute(new Float32Array(count * VERTICES_PER_ROOT).fill(1), 1))
      const indices = []
      for (let r = 0; r < count; r++) {
        for (let v = 1; v < VERTICES_PER_ROOT; v++) indices.push(r * VERTICES_PER_ROOT + v - 1, r * VERTICES_PER_ROOT + v)
      }
      geometry.setIndex(indices)
      const chunk = { geometry, positions, diameters, origin: copies[first].position.clone() }
      this.chunks.push(chunk)
      let slot = 0
      for (let copy = first; copy < last; copy++) {
        for (const type of types) this.roots.push({ copy, type, chunk, slot: slot++, end: -1 })
      }
      const mesh = new THREE.LineSegments(geometry, material)
      mesh.name = 'tetherRoots'
      mesh.renderOrder = 1
      mesh.position.copy(chunk.origin)
      refCoordSys.add(mesh)
      this.meshes.push(mesh)
    }
    this.unreachable = new Uint8Array(this.roots.length)
    // Bounds that hold for any ground: the roots down to their catenaries' lowest points.
    for (let i = 0; i < this.roots.length; i++) this.write(i, this.profileOf(this.roots[i]).points.length - 1)
    for (const chunk of this.chunks) chunk.geometry.computeBoundingSphere()
    for (let i = 0; i < this.roots.length; i++) this.check(i)
  }

  // sampleHeight(latDeg, lonDeg) -> {heightMeters} | null (null while its data loads), or null for none;
  // version(): goes up whenever more of that data arrives.
  setTerrain(sampleHeight, version = () => 0) {
    this.sampleHeight = sampleHeight
    this.terrainVersion = version
    this.fittedVersion = null
    for (let i = 0; i < this.roots.length; i++) this.unfitted.add(i)
  }

  get unreachableCount() {
    return this.unreachable?.reduce((sum, v) => sum + v, 0) ?? 0
  }

  // Once per frame: roots whose ground had not all loaded are fitted again once more of it has.
  update() {
    if (!this.unfitted.size) return
    const version = this.terrainVersion()
    if (version === this.fittedVersion && !this.resume) return
    // (All of them while recording: what a frame shows must not depend on how many frames came before.)
    const limit = PixelLOD.buildBudget === Infinity ? Infinity : CHECKS_PER_FRAME
    let n = 0
    this.resume = false
    for (const i of [...this.unfitted]) {
      if (n++ >= limit) { this.resume = true; break }
      this.check(i)
    }
    if (!this.resume) this.fittedVersion = version
  }

  profileOf(root) {
    return this.copies[root.copy].profiles[root.type]
  }

  // Point `index` (fractional) of a root's profile, in the ring frame, into `target`.
  profilePoint(root, index, target) {
    const points = this.profileOf(root).points
    const k = Math.min(points.length - 2, Math.floor(index))
    target.lerpVectors(points[k], points[k + 1], index - k)
    const copy = this.copies[root.copy]
    return target.applyMatrix4(copy.matrix)
  }

  // Height above the ground (m) of point `index` of a root's profile.
  clearance(root, index) {
    const p = this.profilePoint(root, index, _p).applyQuaternion(this.quaternion)
    const r = p.length()
    const height = r - r * ellipsoidSurfaceScale(p.x, p.y, p.z, this.ellipsoid)
    if (height > HIGHEST_GROUND || !this.sampleHeight) return height
    const g = ecefToGeodetic(p.x, p.y, p.z, this.ellipsoid)
    const ground = this.sampleHeight(g.lat, g.lon)
    if (!ground) this._missing = true
    return height - (ground?.heightMeters ?? 0)
  }

  // Finds where root i meets the ground and redraws it if that has moved.
  check(i) {
    this._missing = false
    this._check(i)
    if (this._missing) this.unfitted.add(i)
    else this.unfitted.delete(i)
  }

  _check(i) {
    const root = this.roots[i]
    const { heights } = this.profileOf(root)
    const last = heights.length - 1
    let gap = this.clearance(root, 0)
    let end = last
    this.unreachable[i] = 0
    if (gap > 0) {
      // Step down the profile, by half the remaining clearance (at least MIN_STEP_DROP) at a time.
      let k = 0
      for (;;) {
        const drop = Math.max(MIN_STEP_DROP, gap / 2)
        let next = k + 1
        while (next < last && heights[k] - heights[next] < drop) next++
        const nextGap = this.clearance(root, next)
        if (nextGap <= 0) {
          // The ground is between k and next: bisect.
          let lo = k, hi = next
          for (let b = 0; b < 8; b++) {
            const mid = (lo + hi) / 2
            if (this.clearance(root, mid) > 0) lo = mid
            else hi = mid
          }
          end = hi
          break
        }
        if (next >= last) {
          this.unreachable[i] = 1
          break
        }
        k = next
        gap = nextGap
      }
    }
    else end = 0
    if (Math.abs(end - root.end) > 0.01) this.write(i, end)
  }

  // Draws root i from its fork down to profile point `end`.
  write(i, end) {
    const root = this.roots[i]
    root.end = end
    const { areas } = this.profileOf(root)
    const { positions, diameters, origin } = root.chunk
    for (let v = 0; v < VERTICES_PER_ROOT; v++) {
      const index = end * v / (VERTICES_PER_ROOT - 1)
      this.profilePoint(root, index, _p).sub(origin)
      const vertex = root.slot * VERTICES_PER_ROOT + v
      positions.setXYZ(vertex, _p.x, _p.y, _p.z)
      const k = Math.min(areas.length - 2, Math.floor(index))
      const area = areas[k] + (areas[k + 1] - areas[k]) * (index - k)
      diameters.setX(vertex, 2 * Math.sqrt(area / Math.PI))
    }
    positions.needsUpdate = true
    diameters.needsUpdate = true
  }

  dispose() {
    for (const mesh of this.meshes) mesh.parent?.remove(mesh)
    for (const chunk of this.chunks) chunk.geometry.dispose()
    this.meshes = []
    this.chunks = []
  }
}
