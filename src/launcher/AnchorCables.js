import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ecefToGeodetic, geodeticToECEF } from '../physics/geodesy.js'
import { offsetLatLon } from '../scene/seaPlacement.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { StructureLines } from '../scene/structureLines.js'
import { Highlights } from '../scene/Highlights.js'
import { catenaryPoints } from './catenary.js'

// The ocean terminal's mooring cables (OceanTerminal.js): each runs from a fairlead on the underwater
// terminal down to an anchor on the sea floor, SCOPE x the depth below the fairlead away, hanging as a
// catenary that meets the sea floor level at the anchor (catenaryPoints with a slack shape), as a heavy
// cable does when its last stretch rests on the bottom.
//
// Like the launcher's mooring cables (MooringCables.js), they are drawn as solid cable (one mesh for all
// of them) where they are at least CABLE_PIXELS across, and everywhere as lines at their real width that
// glow like the tethers (src/scene/structureLines.js), so they can be followed down from the surface.
//
// The anchors sit on the terrain, which streams in and refines, so the sea floor is re-sampled from
// time to time (refresh) and the cables rebuilt when it has moved.

const DIAMETER = 0.2
const CABLE_PIXELS = 1
const SCOPE = 1.2
const ANCHOR_SIZE = 8
const SEGMENTS = 256

const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x3f3d3a, roughness: 0.6, metalness: 0.4 })
const anchorMaterial = new THREE.MeshStandardMaterial({ color: 0x5b5752, roughness: 0.9 })
let lineMaterial = null

const _up = new THREE.Vector3()
const _p = new THREE.Vector3()

export class AnchorCables {
  /**
   * parent: the Object3D the cables are drawn in; toLocal(planetPoint, target) converts planet coordinates
   * to its coordinates. legs: [{ top: Vector3 (planet coordinates), east, north (the direction to its
   * anchor) }]. sampleHeight(latDeg, lonDeg) -> { heightMeters } | null: the sea floor.
   */
  constructor({ parent, toLocal, legs, ellipsoid, sampleHeight }) {
    this.toLocal = toLocal
    this.legs = legs
    this.ellipsoid = ellipsoid
    this.sampleHeight = sampleHeight
    this.signature = null
    this.group = new THREE.Group()
    this.group.name = 'anchorCables'
    Highlights.tag(this.group, 'massDriverTethers')
    parent.add(this.group)
    lineMaterial ??= StructureLines.createMaterial(0x8a8580, { referenceDiameter: DIAMETER, fog: true })
    this.refresh()
  }

  // The sea floor at a point (planet coordinates): { lat, lon, alt, floor } (floor null if not loaded).
  _floor(point) {
    const g = ecefToGeodetic(point.x, point.y, point.z, this.ellipsoid)
    return { ...g, floor: this.sampleHeight(g.lat, g.lon)?.heightMeters ?? null }
  }

  /**
   * Re-samples the sea floor; rebuilds the cables if their anchors have moved. Returns true if rebuilt.
   * `complete`: all of the sea floor it needed had loaded.
   */
  refresh() {
    const ends = []
    this.complete = false
    for (const leg of this.legs) {
      const below = this._floor(leg.top)
      if (below.floor === null) return false
      const depth = below.alt - below.floor
      if (depth < 1) continue
      const reach = (leg.scope ?? SCOPE) * depth
      const [lat, lon] = offsetLatLon(this.ellipsoid, below.lat, below.lon, leg.east * reach, leg.north * reach)
      const at = this.sampleHeight(lat, lon)?.heightMeters ?? null
      if (at === null) return false
      const p = geodeticToECEF(lat, lon, Math.min(at, below.alt - 1), this.ellipsoid)
      ends.push({ top: leg.top, anchor: new THREE.Vector3(p.x, p.y, p.z), shape: leg.shape ?? 0.01 })
    }
    this.complete = true
    const signature = ends.map(({ anchor }) => anchor.toArray().map((x) => x.toFixed(0)).join(',')).join(';')
    if (signature === this.signature) return false
    this.signature = signature
    this.build(ends)
    return true
  }

  build(ends) {
    this.clear()
    const positions = [], tubes = []
    let reach = 0
    for (const { top, anchor, shape } of ends) {
      const a = this.toLocal(top, new THREE.Vector3())
      const b = this.toLocal(anchor, new THREE.Vector3())
      _up.copy(top).normalize()
      this.toLocal(_p.copy(top).add(_up), _up).sub(a).normalize()
      const points = catenaryPoints(a, b, _up, shape, SEGMENTS)
      for (let i = 0; i < points.length - 1; i++) positions.push(...points[i].toArray(), ...points[i + 1].toArray())
      for (const p of points) reach = Math.max(reach, p.length())
      tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), SEGMENTS, DIAMETER / 2, 6, false))
      const block = new THREE.Mesh(new THREE.BoxGeometry(ANCHOR_SIZE, ANCHOR_SIZE / 2, ANCHOR_SIZE), anchorMaterial)
      block.position.copy(b).addScaledVector(_up, ANCHOR_SIZE / 4)
      block.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _up)
      block.name = 'anchor'
      this.group.add(block)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    StructureLines.constantAttributes(geometry, positions.length / 3, DIAMETER)
    geometry.computeBoundingSphere()
    const lines = new THREE.LineSegments(geometry, lineMaterial)
    lines.name = 'anchorCableLines'
    lines.renderOrder = 1
    this.group.add(lines)
    if (tubes.length === 0) return
    // The solid cables, while they are at least CABLE_PIXELS across at their nearest point.
    const cables = new THREE.Mesh(mergeGeometries(tubes), cableMaterial)
    cables.name = 'anchorCables'
    tubes.forEach((g) => g.dispose())
    const lod = new PixelLOD(DIAMETER, { extent: reach })
    lod.addLevel(CABLE_PIXELS, cables)
    this.group.add(lod)
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.traverse((o) => o.geometry?.dispose())
    }
  }

  dispose() {
    this.clear()
    this.group.removeFromParent()
  }
}
