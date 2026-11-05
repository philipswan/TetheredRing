import * as THREE from 'three'
import { ecefToGeodetic, geodeticToECEF } from '../physics/geodesy.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { StructureLines } from '../scene/structureLines.js'
import { Highlights } from '../scene/Highlights.js'
import { catenaryPoints } from './catenary.js'

// Mooring cables for one tube segment. Where the mass-driver tube runs under the sea it is buoyant
// and held down by cables to the sea floor, in inverted Vs so that they also resist sideways
// currents: at each mooring two legs run up from anchors on either side, each offset sideways by
// (depth below the tube) x spread, to the bottom of the tube. Each leg hangs as a catenary between its
// anchor and the tube (see catenaryPoints).
//
// Like the ring's tethers, each leg forks on its way up, so that it holds the tube at many points
// without more anchors: it forks in two halfway up, each branch again halfway along the rest, and so on
// (the given attachments: 2^levels points spread along the tube). After each fork a branch heads
// straight (relative to the leg's catenary) for the middle of the attachments it holds, and the last
// ones for their own; each fork halves the cable's cross-section.
//
// The anchors sit on the sea floor from fixed data (Planet.sampleFixedGround: the planet's finest), not the
// terrain drawn just now, so they stay put whatever level of detail it is drawn at and come out the same in
// every render. That data loads as it is asked for, so a set whose sea floor had not all loaded re-samples
// its anchors when more has (MooringCables.refreshSome, once per frame) and rebuilds if they moved.
//
// The legs are drawn like the ring's tethers, as glowing lines at their real diameter that fade with
// their pixel coverage (src/scene/structureLines.js), so they can be followed all the way down to the
// sea floor, where each ends at an anchor block. Close up they are also drawn as solid cable.
const SEGMENTS_PER_FINEST = 4   // line segments along the last stretch (above the last fork) of a leg
const LINES_MIN_PIXELS = 1 / 2000
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0)
cylinderGeometry.userData.shared = true
const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.4 })
const ANCHOR_SIZE = 20 // m: anchor blocks on the sea floor (oversized, like the tethers, so they show from the tube)
// Pale and slightly self-lit, and fading 8x more slowly in the from-above sea fog (seaDarkening.js),
// so they still show from above the sea, even kilometres down.
const anchorGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
anchorGeometry.userData.shared = true
const anchorMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d3c4, emissive: 0x3a3832, roughness: 0.9 })
anchorMaterial.onBeforeCompile = (shader) => {
  // fog = 1 - exp(-path / L), so fading 8x more slowly is 1 - (1 - fog)^(1/8).
  shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>',
    THREE.ShaderChunk.fog_fragment.replace('seaTint, vSeaFog)', 'seaTint, 1.0 - pow(1.0 - vSeaFog, 0.125))'))
}
anchorMaterial.customProgramCacheKey = () => 'mooringAnchor'
// Lines at the cables' real diameter, glowing like the tethers and fading in the sea (see
// src/scene/structureLines.js). Created on first use (after the app has set the haze up).
let lineMaterial = null
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _yAxis = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _s = new THREE.Vector3()

export class MooringCables {
  static sets = new Set()
  // () -> number: goes up whenever more of the sea floor's data has loaded (setTerrainSampler in launcher.js).
  static terrainVersion = () => 0

  // moorings: [{ apex: Vector3 (planet coordinates, bottom of the tube), side: Vector3 (unit, sideways),
  //   attachments: [Vector3] (where the legs' forks hold the bottom of the tube: 2^levels of them, in
  //   order along it; or none, for an unforked leg to the apex) }]
  // toLocal(planetPoint, target): converts planet coordinates to the segment model's coordinates.
  // getSampler(): the terrain height sampler (latDeg, lonDeg) -> { heightMeters } | null, if any yet.
  // shape: catenary constant as a multiple of each leg's length (see catenaryPoints).
  constructor({ moorings, toLocal, ellipsoid, getSampler, cableRadius, spread, shape, extent }) {
    this.moorings = moorings
    this.toLocal = toLocal
    this.ellipsoid = ellipsoid
    this.getSampler = getSampler
    this.cableRadius = cableRadius
    this.spread = spread
    this.shape = shape
    this.signature = null

    this.root = new THREE.Group()
    this.root.name = 'mooringCables'
    Highlights.tag(this.root, 'massDriverTethers')
    this.near = new THREE.Group()
    this.lines = new THREE.Group()
    // Solid cable (with the lines) where it is at least a pixel across; the lines alone below that,
    // until the cable is 1/2000 of a pixel wide (hundreds of km, where its coverage has all but hidden
    // it anyway).
    this.lod = new PixelLOD(2 * cableRadius, { extent })
    this.lod.addLevel(1, this.near)
    this.lod.addLevel(LINES_MIN_PIXELS, this.lines)
    this.root.add(this.lod)
    // Anchor blocks while they are at least half a pixel across.
    this.anchors = new THREE.Group()
    this.anchorLod = new PixelLOD(ANCHOR_SIZE, { extent })
    this.anchorLod.addLevel(0.5, this.anchors)
    this.root.add(this.anchorLod)
    this.refresh()
    MooringCables.sets.add(this)
  }

  // Re-samples the sea floor and rebuilds the cables if it has changed. Returns true if rebuilt. `complete`:
  // all of the sea floor it needed had loaded.
  refresh() {
    const sample = this.getSampler()
    this.complete = false
    if (!sample) return false
    let complete = true
    const legs = []
    const heightAt = (point) => {
      const geo = ecefToGeodetic(point.x, point.y, point.z, this.ellipsoid)
      const height = sample(geo.lat, geo.lon)?.heightMeters ?? null
      if (height === null) complete = false
      return { geo, height }
    }
    for (const { apex, side, attachments } of this.moorings) {
      const below = heightAt(apex)
      if (below.height === null) continue                 // terrain not loaded yet
      const depth = below.geo.alt - below.height
      if (depth < 0.5) continue                            // the tube rests on (or in) the ground here
      for (const sign of [-1, 1]) {
        _p.copy(apex).addScaledVector(side, sign * depth * this.spread)
        const at = heightAt(_p)
        const height = at.height ?? below.height
        const anchor = geodeticToECEF(at.geo.lat, at.geo.lon, height, this.ellipsoid)
        legs.push([apex, new THREE.Vector3(anchor.x, anchor.y, anchor.z), attachments?.length ? attachments : [apex]])
      }
    }
    this.complete = complete
    const signature = legs.map(([, anchor]) => `${anchor.x.toFixed(1)},${anchor.y.toFixed(1)},${anchor.z.toFixed(1)}`).join(';')
    if (signature === this.signature) return false
    this.signature = signature
    this.build(legs)
    return true
  }

  build(legs) {
    this.clear()
    if (legs.length === 0) return
    const curves = legs.flatMap(([apex, anchor, attachments]) => this.branches(apex, anchor, attachments))

    // Lines (always), with the tether fade
    const positions = []
    const diameters = []
    let reach = 0
    for (const { points, radius } of curves) {
      for (let i = 0; i < points.length - 1; i++) {
        positions.push(points[i].x, points[i].y, points[i].z, points[i + 1].x, points[i + 1].y, points[i + 1].z)
        diameters.push(2 * radius, 2 * radius)
      }
      for (const p of points) reach = Math.max(reach, p.length())
    }
    const count = positions.length / 3
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    StructureLines.constantAttributes(lineGeometry, count, 2 * this.cableRadius)
    lineGeometry.setAttribute('diameter', new THREE.Float32BufferAttribute(diameters, 1))
    lineGeometry.computeBoundingSphere()
    lineMaterial ??= StructureLines.createMaterial(0x9a9a9a, { referenceDiameter: 2 * this.cableRadius, fog: true })
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
    lines.name = 'mooringCableLines'
    lines.renderOrder = 1 // like the tethers
    this.lines.add(lines)

    // Solid cable close up: one cylinder per line segment
    const cylinders = new THREE.InstancedMesh(cylinderGeometry, cableMaterial, count / 2)
    cylinders.name = 'mooringCable'
    let n = 0
    for (const { points, radius } of curves) {
      for (let i = 0; i < points.length - 1; i++) {
        _dir.subVectors(points[i + 1], points[i])
        const length = _dir.length()
        _q.setFromUnitVectors(_yAxis, _dir.divideScalar(length))
        _s.set(radius, length, radius)
        cylinders.setMatrixAt(n++, _m.compose(points[i], _q, _s))
      }
    }
    cylinders.count = n
    cylinders.computeBoundingSphere()
    this.near.add(cylinders)
    this.near.add(lines.clone()) // (shares the geometry)

    // Anchor blocks where the legs meet the sea floor, upright on the local vertical
    const anchors = new THREE.InstancedMesh(anchorGeometry, anchorMaterial, legs.length)
    anchors.name = 'mooringAnchor'
    legs.forEach(([, anchor], i) => {
      const base = this.toLocal(anchor, new THREE.Vector3())
      const top = this.toLocal(_p.copy(anchor).multiplyScalar(1 + ANCHOR_SIZE / anchor.length()), new THREE.Vector3())
      _q.setFromUnitVectors(_yAxis, _dir.subVectors(top, base).normalize())
      _s.setScalar(ANCHOR_SIZE)
      anchors.setMatrixAt(i, _m.compose(base, _q, _s))
    })
    anchors.computeBoundingSphere()
    this.anchors.add(anchors)
    // The LOD is judged by the nearest part of the cables, which reach down and out to the anchors.
    this.lod.extent = reach
    this.anchorLod.extent = reach
  }

  // The branches of one leg, from `anchor` up to the tube (forking towards `attachments`, 2^levels points
  // along the bottom of the tube, around `apex`), as [{ points (the segment model's coordinates), radius }].
  branches(apex, anchor, attachments) {
    const levels = Math.round(Math.log2(attachments.length))
    const segments = SEGMENTS_PER_FINEST * 2 ** levels
    const up = apex.clone().add(anchor).normalize() // local vertical (geocentric is close enough here)
    // The leg's catenary to the apex, from the anchor (t = 0) to the tube (t = 1); forks at t = 1 - 2^-j.
    const path = catenaryPoints(apex, anchor, up, this.shape, segments)
    const offsets = attachments.map(a => a.clone().sub(apex))
    const out = []
    // A branch holding attachments [first, first + size), from its fork at point `from` (where it is
    // `base` off the catenary), heading for their middle; it forks again halfway along the rest.
    const grow = (first, size, from, base, level) => {
      const target = new THREE.Vector3()
      for (let k = first; k < first + size; k++) target.add(offsets[k])
      target.divideScalar(size)
      const to = size > 1 ? segments - (segments - from) / 2 : segments
      const at = (i) => _p.copy(base).lerp(target, (i - from) / (segments - from))
      const points = []
      for (let i = from; i <= to; i++) points.push(this.toLocal(path[i].clone().add(at(i)), new THREE.Vector3()))
      out.push({ points, radius: this.cableRadius * Math.SQRT1_2 ** level })
      if (size > 1) {
        const fork = at(to).clone()
        grow(first, size / 2, to, fork, level + 1)
        grow(first + size / 2, size / 2, to, fork, level + 1)
      }
    }
    grow(0, 2 ** levels, 0, new THREE.Vector3(), 0)
    return out
  }

  clear() {
    for (const group of [this.near, this.lines, this.anchors]) {
      for (const child of [...group.children]) {
        group.remove(child)
        if (child.isInstancedMesh) child.dispose()
        else child.geometry.dispose()
      }
    }
  }

  dispose() {
    this.clear()
    MooringCables.sets.delete(this)
  }

  // Sets whose sea floor had not all loaded when last refreshed are refreshed again once more of it has (all
  // of them while recording, else a few a frame). Sets whose tube segment has been released (removed from the
  // scene and disposed, see VirtualObject.releaseModel) are forgotten.
  static refreshSome(count = 8) {
    const version = MooringCables.terrainVersion()
    const limit = PixelLOD.buildBudget === Infinity ? Infinity : count
    let n = 0
    for (const set of [...MooringCables.sets]) {
      if (set.complete || set.refreshedAt === version) continue
      if (!isInScene(set.root)) { MooringCables.sets.delete(set); continue }
      if (n++ >= limit) break
      set.refreshedAt = version
      set.refresh()
    }
  }
}

function isInScene(object) {
  let o = object
  while (o.parent) o = o.parent
  return o.isScene === true
}
