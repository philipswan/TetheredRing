import * as THREE from 'three'

// The launcher's ocean terminal model (models/launcher_ocean_terminal.obj, metres, +Y up, sea level at
// y = 0), read into geometry and the points OceanTerminal.js needs from it.
//
// The model has no materials, so its parts are told apart by object name and by shape:
//  - Terminal: its windows are the 3 m x 1 m recessed panes in its walls, and its doors the 5 m x 5 m
//    ones at the pier's level (WINDOW_AREA, DOOR_AREA).
//  - Light: the lamp heads on the lampposts; the face of each that looks down (the lens) is a lamp.
//  - _marker_*: rings of edges marking the launcher's breech (_marker_launcher_connection) and where
//    the anchor chains are made fast (_marker_anchor_rear, _marker_anchor_front).
//  - Elevator_Shaft: a vertical cylinder from the terminal down into the underwater terminal; its axis
//    is the pivot the terminal and pier turn about.
//  - Underwater_Terminal: a cylinder along Z, flat at the launcher's end (-Z) and rounded at the other.
//    It is redrawn as a pill with two hemispherical ends (underwaterHull), keeping its original extent.
//
// The file's normals are flat (one per face). The elevator shaft and the underwater terminal are curved
// surfaces, so they are smooth-shaded: across edges sharper than CREASE_ANGLE (the shaft's rims, the
// hull's flat end) they stay hard.
//
// Its walls are n-gons with holes for the windows (bridged into one outline), so they are triangulated by
// ear clipping rather than as fans (three.js's OBJLoader would fan them, covering the windows).

const WINDOW_AREA = [2.5, 3.5]
const DOOR_AREA = [24, 26]
const CREASE_ANGLE = 40 * Math.PI / 180
const HULL_SEGMENTS = 80        // round the underwater terminal (as many as the model has)
const HULL_DOME_RINGS = 20      // from the hemisphere's rim to its tip

/** Parses OBJ text into { name: { polygons: [{ points, normals, uvs }], lines: [Vector3] } }. */
export function parseObj(text) {
  const v = [], vn = [], vt = []
  const objects = {}
  let current = null
  const object = (name) => (objects[name] ??= { polygons: [], lines: [] })
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line[0] === '#') continue
    const parts = line.split(/\s+/)
    switch (parts[0]) {
      case 'o': case 'g': current = object(parts.slice(1).join(' ')); break
      case 'v': v.push(new THREE.Vector3(+parts[1], +parts[2], +parts[3])); break
      case 'vn': vn.push(new THREE.Vector3(+parts[1], +parts[2], +parts[3])); break
      case 'vt': vt.push(new THREE.Vector2(+parts[1], +parts[2])); break
      case 'f': {
        const corners = parts.slice(1).map((c) => c.split('/').map((i) => (i ? parseInt(i, 10) : 0)))
        const index = (i, list) => (i > 0 ? i - 1 : list.length + i)
        current ??= object('')
        current.polygons.push({
          points: corners.map(([p]) => v[index(p, v)]),
          normals: corners.map(([, , n]) => (n ? vn[index(n, vn)] : null)),
          uvs: corners.map(([, t]) => (t ? vt[index(t, vt)] : null)),
        })
        break
      }
      case 'l': {
        current ??= object('')
        const points = parts.slice(1).map((c) => v[index1(parseInt(c, 10), v)])
        for (let i = 0; i < points.length - 1; i++) current.lines.push(points[i], points[i + 1])
        break
      }
    }
  }
  return objects
}

const index1 = (i, list) => (i > 0 ? i - 1 : list.length + i)

/** A polygon's normal (Newell's method; unit length) and area. */
export function polygonNormal(points) {
  const n = new THREE.Vector3()
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    n.x += (a.y - b.y) * (a.z + b.z)
    n.y += (a.z - b.z) * (a.x + b.x)
    n.z += (a.x - b.x) * (a.y + b.y)
  }
  const area = n.length() / 2
  return { normal: area > 0 ? n.divideScalar(2 * area) : n, area }
}

/** Triangulates polygons into a BufferGeometry (positions, normals, uvs; flat normals where the file has none). */
export function polygonsToGeometry(polygons) {
  const position = [], normal = [], uv = []
  const u = new THREE.Vector3(), w = new THREE.Vector3()
  for (const polygon of polygons) {
    const { points } = polygon
    const { normal: n } = polygonNormal(points)
    let triangles
    if (points.length === 3) triangles = [[0, 1, 2]]
    else {
      // Ear clipping in the polygon's plane.
      u.set(1, 0, 0)
      if (Math.abs(n.x) > 0.9) u.set(0, 1, 0)
      u.addScaledVector(n, -u.dot(n)).normalize()
      w.crossVectors(n, u)
      const flat = points.map((p) => new THREE.Vector2(p.dot(u), p.dot(w)))
      // In (u, w) the polygon winds anticlockwise (u x w is its normal); so must each triangle.
      triangles = THREE.ShapeUtils.triangulateShape(flat, []).map(([a, b, c]) =>
        THREE.ShapeUtils.area([flat[a], flat[b], flat[c]]) < 0 ? [a, c, b] : [a, b, c])
    }
    for (const triangle of triangles) {
      for (const i of triangle) {
        const p = points[i]
        position.push(p.x, p.y, p.z)
        const pn = polygon.normals[i] ?? n
        normal.push(pn.x, pn.y, pn.z)
        const t = polygon.uvs[i]
        uv.push(t?.x ?? 0, t?.y ?? 0)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Gives each polygon smooth normals (in place): at each corner, the area-weighted average of the normals
 * of the polygons sharing that point that are within creaseAngle of this polygon's own.
 */
export function smoothNormals(polygons, creaseAngle = CREASE_ANGLE) {
  const key = (p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`
  const faces = polygons.map((polygon) => polygonNormal(polygon.points))
  const atPoint = new Map()   // point -> indices of the polygons that have it
  polygons.forEach((polygon, i) => {
    for (const p of polygon.points) {
      const k = key(p)
      if (!atPoint.has(k)) atPoint.set(k, [])
      atPoint.get(k).push(i)
    }
  })
  const cosCrease = Math.cos(creaseAngle)
  polygons.forEach((polygon, i) => {
    const own = faces[i].normal
    polygon.normals = polygon.points.map((p) => {
      const n = new THREE.Vector3()
      for (const j of atPoint.get(key(p))) {
        if (faces[j].normal.dot(own) >= cosCrease) n.addScaledVector(faces[j].normal, faces[j].area)
      }
      return n.lengthSq() > 0 ? n.normalize() : own.clone()
    })
  })
  return polygons
}

/**
 * The underwater terminal's hull: a cylinder along Z with hemispherical ends, preserving the
 * model's radius and axis. Extend the -Z end to center the shaft when supplied.
 */
export function underwaterHull(polygons, shaftZ) {
  const box = new THREE.Box3()
  for (const polygon of polygons) for (const p of polygon.points) box.expandByPoint(p)
  const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2
  const radius = (box.max.y - box.min.y) / 2
  const front = shaftZ === undefined ? box.min.z : Math.min(box.min.z, 2 * shaftZ - box.max.z)
  const tip = box.max.z
  const domeStart = Math.max(front, tip - radius)
  // Rings run from the -Z dome through the cylinder to the +Z dome.
  const rings = []
  const ring = (z, r, normalAt) => {
    const points = [], normals = []
    for (let i = 0; i < HULL_SEGMENTS; i++) {
      const a = 2 * Math.PI * i / HULL_SEGMENTS
      const c = Math.cos(a), s = Math.sin(a)
      points.push(new THREE.Vector3(cx + r * c, cy + r * s, z))
      normals.push(normalAt(c, s))
    }
    rings.push({ points, normals })
  }
  const frontDomeCentre = front + radius
  for (let j = HULL_DOME_RINGS - 1; j > 0; j--) {
    const phi = (Math.PI / 2) * j / HULL_DOME_RINGS
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi)
    ring(frontDomeCentre - radius * sinPhi, radius * cosPhi,
      (c, s) => new THREE.Vector3(c * cosPhi, s * cosPhi, -sinPhi))
  }
  ring(frontDomeCentre, radius, (c, s) => new THREE.Vector3(c, s, 0))
  ring(domeStart, radius, (c, s) => new THREE.Vector3(c, s, 0))
  for (let j = 1; j < HULL_DOME_RINGS; j++) {
    const phi = (Math.PI / 2) * j / HULL_DOME_RINGS   // from the rim towards the tip
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi)
    ring(domeStart + radius * sinPhi, radius * cosPhi, (c, s) => new THREE.Vector3(c * cosPhi, s * cosPhi, sinPhi))
  }
  const out = []
  // Quads between rings, wound so that their fronts face out (anticlockwise seen from outside).
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1]
    for (let i = 0; i < HULL_SEGMENTS; i++) {
      const i1 = (i + 1) % HULL_SEGMENTS
      out.push({
        points: [a.points[i], a.points[i1], b.points[i1], b.points[i]],
        normals: [a.normals[i], a.normals[i1], b.normals[i1], b.normals[i]],
        uvs: [null, null, null, null],
      })
    }
  }
  // The tip: triangles to the point on the axis.
  const last = rings[rings.length - 1]
  const tipPoint = new THREE.Vector3(cx, cy, domeStart + radius)
  const tipNormal = new THREE.Vector3(0, 0, 1)
  for (let i = 0; i < HULL_SEGMENTS; i++) {
    const i1 = (i + 1) % HULL_SEGMENTS
    out.push({ points: [last.points[i], last.points[i1], tipPoint], normals: [last.normals[i], last.normals[i1], tipNormal], uvs: [null, null, null] })
  }
  // The -Z tip, with the reverse winding of the +Z tip.
  const first = rings[0]
  const frontPoint = new THREE.Vector3(cx, cy, front)
  const frontNormal = new THREE.Vector3(0, 0, -1)
  for (let i = 0; i < HULL_SEGMENTS; i++) {
    const i1 = (i + 1) % HULL_SEGMENTS
    out.push({ points: [first.points[i1], first.points[i], frontPoint],
      normals: [first.normals[i1], first.normals[i], frontNormal], uvs: [null, null, null] })
  }
  return out
}

const centroid = (points) => points.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(points.length)
const within = (x, [lo, hi]) => x >= lo && x <= hi

/**
 * The terminal model from its OBJ text: geometry for each part, and
 *  - markers: { launcher, anchorRear, anchorFront } (Vector3, the centres of the marker rings)
 *  - shaft: { x, z, top, bottom } (the elevator shaft's axis and ends)
 *  - lamps: [{ position, direction }] (each lamp's lens and the way it faces)
 * Parts: geometries.{ Pier, Lamppost, Flagpoll, Elevator_Shaft, Underwater_Terminal, terminalWalls,
 * terminalWindows, terminalDoors, lampHousings, lampLenses }.
 */
export function terminalModel(text) {
  const objects = parseObj(text)
  const geometries = {}
  for (const name of ['Pier', 'Lamppost', 'Flagpoll']) {
    if (objects[name]) geometries[name] = polygonsToGeometry(objects[name].polygons)
  }
  if (objects.Elevator_Shaft) geometries.Elevator_Shaft = polygonsToGeometry(smoothNormals(objects.Elevator_Shaft.polygons))
  if (objects.Underwater_Terminal) geometries.Underwater_Terminal = polygonsToGeometry(underwaterHull(objects.Underwater_Terminal.polygons,
    new THREE.Box3().setFromBufferAttribute(geometries.Elevator_Shaft.attributes.position).getCenter(new THREE.Vector3()).z))

  // The terminal's windows and doors: recessed vertical panes of their sizes.
  const walls = [], windows = [], doors = []
  for (const polygon of objects.Terminal?.polygons ?? []) {
    const { normal, area } = polygonNormal(polygon.points)
    const vertical = Math.abs(normal.y) < 0.1
    if (vertical && polygon.points.length === 4 && within(area, WINDOW_AREA)) windows.push(polygon)
    else if (vertical && polygon.points.length === 4 && within(area, DOOR_AREA)) doors.push(polygon)
    else walls.push(polygon)
  }
  geometries.terminalWalls = polygonsToGeometry(walls)
  geometries.terminalWindows = polygonsToGeometry(windows)
  geometries.terminalDoors = polygonsToGeometry(doors)

  // The lamps: the downward faces of the lamp heads.
  const housings = [], lenses = [], lamps = []
  for (const polygon of objects.Light?.polygons ?? []) {
    const { normal } = polygonNormal(polygon.points)
    if (normal.y < -0.5) {
      lenses.push(polygon)
      lamps.push({ position: centroid(polygon.points), direction: normal.clone() })
    }
    else housings.push(polygon)
  }
  geometries.lampHousings = polygonsToGeometry(housings)
  geometries.lampLenses = polygonsToGeometry(lenses)

  const marker = (name) => {
    const points = objects[name]?.lines ?? []
    return points.length ? centroid(points) : null
  }
  const markers = {
    launcher: marker('_marker_launcher_connection'),
    anchorRear: marker('_marker_anchor_rear'),
    anchorFront: marker('_marker_anchor_front'),
  }

  const box = new THREE.Box3().setFromBufferAttribute(geometries.Elevator_Shaft.attributes.position)
  const shaft = { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, top: box.max.y, bottom: box.min.y }
  return { geometries, markers, shaft, lamps }
}

// Closely spaced fairleads on the outer (+Z, away from the ramp) dome.
export function terminalPretensionAttachments(model) {
  const box = new THREE.Box3().setFromBufferAttribute(model.geometries.Underwater_Terminal.attributes.position)
  const centre = box.getCenter(new THREE.Vector3())
  const radius = (box.max.y - box.min.y) / 2
  const z = box.max.z - 2
  const axial = radius - 2
  return [-2, 2].map(x => new THREE.Vector3(centre.x + x,
    centre.y - Math.sqrt(radius * radius - axial * axial - x * x), z))
}
