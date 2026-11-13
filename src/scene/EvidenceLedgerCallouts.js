import * as THREE from 'three'
import ledger from './evidenceLedgerClaims.json' with { type: 'json' }
import { InstancedProxyPool } from './InstancedProxyPool.js'
import { geodeticToECEF } from '../physics/geodesy.js'

// All evidence annotations live here: semantic scene adapters, projection, eligibility,
// layout, video-visible graphics, and accessible browser links. No annotations alter physics.
export const LAUNCHER_PARTS = [
  ['vehicle', 'Spacecraft', ['launchVehicle', 'virtualLaunchVehicles'], 100],
  ['nut', 'Adaptive nut', ['adaptiveNut', 'virtualAdaptiveNuts'], 98],
  ['sled', 'Launch sled', ['launchSled', 'virtualLaunchSleds'], 96],
  ['screws', 'Variable-pitch screws', ['massDriverScrew'], 85],
  ['rail', 'Maglev guideway', ['massDriverRail', 'virtualMassDriverRails'], 75],
  ['fans', 'Electric lift fans', ['liftFans'], 88],
  ['terminal', 'Ocean terminus', ['oceanTerminal'], 80],
  ['mooring', 'Mooring lines', ['mooringCableLines', 'anchorCableLines'], 84],
  ['pretension', 'Pretensioning cables', ['pretensionCableLines'], 83],
  ['anchor', 'Seabed anchors', ['mooringAnchor'], 60],
  ['stash', 'Stashing Facility', ['stashingFacilityWalls'], 78],
]
export const GLOBAL_TOPICS = [
  { id: 'economy', label: 'Economy', icon: '$' },
  { id: 'environment', label: 'Environment', icon: '\u2667' },
  { id: 'industry', label: 'Industry', icon: '\u2699' },
]
const TRAIN_PARTS = new Set(['vehicle', 'nut', 'sled'])

const BY_NAME = new Map(LAUNCHER_PARTS.flatMap(([id, label, names, priority]) => names.map(name => [name, { id, label, priority }])))
const value = (app, key, fallback = 1) => app.d?.[key]?.value ?? fallback
export const claimsFor = id => ledger.claims.filter(claim => claim.target === id)

function calloutTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

// Declarative rules live beside the claim text; this is the single rule interpreter.
export function claimApplies(claim, flight = {}) {
  const rule = claim.display ?? { phase: 'visible' }
  switch (rule.phase) {
    case 'visible': case 'topic': return true
    case 'onLauncher': return !!flight.curveName && flight.curveName !== 'freeFlightPositionCurve'
    case 'atmosphericFlight': return flight.curveName === 'freeFlightPositionCurve' &&
      flight.altitude >= 0 && flight.altitude < (rule.maxAltitude ?? 100000) &&
      flight.density > 0 && flight.airSpeed >= (rule.minMach ?? 1) * flight.speedOfSound
    case 'spaceFlight': return flight.curveName === 'freeFlightPositionCurve' && flight.altitude >= (rule.minAltitude ?? 100000)
    case 'poweredFlight': return flight.curveName === 'freeFlightPositionCurve' && flight.massFlowRate > 0
    default: return false
  }
}

export function wrapCalloutText(text, maxWidth, measure) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && measure(line + ' ' + word) > maxWidth) { lines.push(line); line = '' }
    let rest = word
    while (measure(rest) > maxWidth && rest.length > 1) {
      let end = 1
      while (end < rest.length && measure(rest.slice(0, end + 1)) <= maxWidth) end++
      if (line) { lines.push(line); line = '' }
      lines.push(rest.slice(0, end)); rest = rest.slice(end)
    }
    line = line ? line + ' ' + rest : rest
  }
  if (line) lines.push(line)
  return lines
}

export function rectanglesOverlap(a, b, gap = 8) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}

// Reject clipped, unresolved and camera-filling objects. Screen size, rather than a
// single world-distance cutoff, works for both a small nut and a large terminal.
export function projectCallout(position, diameter, camera, width, height, { minPixels = 12, maxFraction = 0.7 } = {}) {
  const local = position.clone().applyMatrix4(camera.matrixWorldInverse)
  if (-local.z <= camera.near || -local.z >= camera.far) return null
  const ndc = position.clone().project(camera)
  if (Math.abs(ndc.x) > 0.94 || Math.abs(ndc.y) > 0.9 || ndc.z < -1 || ndc.z > 1) return null
  const pixels = diameter * camera.projectionMatrix.elements[5] * height / (2 * -local.z)
  if (pixels < minPixels || pixels > height * maxFraction) return null
  return { x: (ndc.x + 1) * width / 2, y: (1 - ndc.y) * height / 2, pixels }
}

// Stable screen-relative slots: geometry moves the leader, while a change in
// clutter never sends a card to the opposite side or another row. Conflicts hide.
const LABEL_SLOTS = {
  vehicle: [1, -160], nut: [-1, -90], sled: [1, 90], engine: [-1, 100],
  acceleration: [1, 170], ramp: [-1, -100], tube: [1, 160],
  evacuatedTube: [-1, 170], grapplers: [-1, 170], airlock: [1, -70], fans: [1, 110], screws: [-1, 90], rail: [1, 80],
  pretension: [1, 150], terminal: [1, -110], mooring: [-1, 100], anchor: [1, -90], stash: [-1, -110],
  mountain: [-1, -130],
}

// Test the exact polylines that are drawn, including touches and collinear overlaps.
// Two cards for one object may share an endpoint, but no length of leader.
export function leadersCross(a, b) {
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6
  const within = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-6 &&
    p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 &&
    p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const p = a[i - 1], q = a[i], r = b[j - 1], s = b[j]
    if (same(p, q) || same(r, s)) continue
    const contacts = [p, q].filter(t => within(r, s, t)).concat([r, s].filter(t => within(p, q, t)))
    if (contacts.some(t => !(i === 1 && j === 1 && same(p, r) && same(t, p)))) return true
    if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true
  }
  return false
}

export function leaderHitsRect(leader, rect, gap = 3) {
  const x = rect.x - gap, y = rect.y - gap, w = rect.width + 2 * gap, h = rect.height + 2 * gap
  const inside = p => p.x > x && p.x < x + w && p.y > y && p.y < y + h
  return leader.some(inside) || leadersCross(leader, [
    {x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}, {x, y},
  ])
}

// Keep the orientation of long, thin objects instead of wrapping their screen AABB
// in an ellipse, which can place the endpoint well outside a diagonal body.
export function projectedOutline(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const half = values => {
    const hull = []
    for (const point of values) {
      while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop()
      hull.push(point)
    }
    return hull.slice(0, -1)
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

export function leaderEndpoint(centre, elbow, outline = {}) {
  const dx = elbow.x - centre.x, dy = elbow.y - centre.y
  const length = Math.hypot(dx, dy)
  if (!length) return null
  let fraction
  if (outline.points?.length >= 3) {
    const cross = (ax, ay, bx, by) => ax * by - ay * bx
    let hit = -Infinity
    for (let i = 0; i < outline.points.length; i++) {
      const a = outline.points[i], b = outline.points[(i + 1) % outline.points.length]
      const ex = b.x - a.x, ey = b.y - a.y
      const denominator = cross(dx, dy, ex, ey)
      if (Math.abs(denominator) < 1e-10) continue
      const ax = a.x - centre.x, ay = a.y - centre.y
      const t = cross(ax, ay, ex, ey) / denominator
      const u = cross(ax, ay, dx, dy) / denominator
      if (t >= 0 && u >= 0 && u <= 1) hit = Math.max(hit, t)
    }
    fraction = Number.isFinite(hit) ? hit : 0
  } else {
    const rx = outline.radiusX ?? 0, ry = outline.radiusY ?? 0
    if (!(rx > 0 && ry > 0)) return { x: centre.x, y: centre.y }
    fraction = 1 / Math.hypot(dx / rx, dy / ry)
  }
  if (!Number.isFinite(fraction) || fraction >= 1) return null
  // A small overlap avoids a hairline gap from antialiasing or conservative bounds.
  fraction = Math.max(0, fraction - (outline.inset ?? 0) / length)
  return { x: centre.x + dx * fraction, y: centre.y + dy * fraction }
}

// Resolve the tip against the actual component, including its current LOD/instance
// transform. Work only on the few layout candidates that reach this stage.
export function meshSurfaceEndpoint(mesh, camera, width, height, centre, elbow) {
  const ray = new THREE.Raycaster()
  const point = t => ({ x: centre.x + (elbow.x - centre.x) * t, y: centre.y + (elbow.y - centre.y) * t })
  const hits = t => {
    const p = point(t)
    ray.setFromCamera(new THREE.Vector2(p.x / width * 2 - 1, 1 - p.y / height * 2), camera)
    return ray.intersectObject(mesh, false).length > 0
  }
  let outside = 1
  for (let step = 1; step <= 32; step++) {
    const inside = 1 - step / 32
    if (hits(inside)) {
      let lo = inside, hi = outside
      for (let i = 0; i < 9; i++) {
        const middle = (lo + hi) / 2
        if (hits(middle)) lo = middle
        else hi = middle
      }
      return point(lo)
    }
    outside = inside
  }
  return { x: centre.x, y: centre.y }
}

export function placeCallouts(candidates, width, height, blocked = [], { cardWidth = 310, maxCards = 5 } = {}) {
  const placed = [], occupied = [...blocked]
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (placed.some(card => card.id === candidate.id)) continue
    if (candidate.type === 'claim' && placed.filter(card => card.type === 'claim').length >= 2) continue
    const w = candidate.width ?? cardWidth, h = candidate.height
    const [side, offset] = candidate.slot ?? LABEL_SLOTS[candidate.targetId ?? candidate.id] ?? [1, -100]
    const dy = candidate.type === 'claim' ? 28 : offset
    const x = Math.max(18, Math.min(width - w - 18, candidate.x + (side > 0 ? 42 + (candidate.outline?.radiusX ?? 0) : -42 - w - (candidate.outline?.radiusX ?? 0))))
    const y = Math.max(36, Math.min(height - h - 24, candidate.y + dy))
    const rect = { x, y, width: w, height: h }
    if (x + w > width - 18 || y + h > height - 24) continue
    if (occupied.some(other => rectanglesOverlap(rect, other))) continue
    if (candidates.some(other => rectanglesOverlap(rect, { x: other.x - 16, y: other.y - 16, width: 32, height: 32 }, 0))) continue
    // Clamping must not put the anchor behind its own card or reverse the elbow.
    if (side > 0 ? x <= candidate.x + 20 : x + w >= candidate.x - 20) continue
    const edge = side > 0 ? x : x + w, joinY = y + Math.min(30, h / 2)
    const elbow = { x: edge - side * 16, y: joinY }
    const endpoint = candidate.surfaceEndpoint ? candidate.surfaceEndpoint(candidate, elbow) : leaderEndpoint(candidate, elbow, candidate.outline)
    if (!endpoint) continue
    const leader = [endpoint, elbow, {x: edge, y: joinY}]
    if (occupied.some(other => leaderHitsRect(leader, other))) continue
    if (placed.some(other => leadersCross(leader, other.leader) || leaderHitsRect(other.leader, rect))) continue
    placed.push({ ...candidate, rect, side, leader }); occupied.push(rect)
    if (placed.length >= maxCards) break
  }
  return placed
}

// Find the closest point to the camera's focus continuously. Coarse samples only
// bracket the minimum; the final parameter is refined, so orbiting does not snap
// a section anchor between samples tens of kilometres apart.
export function sectionAnchor(curve, focus, forwardDistance = 0) {
  let best = 0, distance = Infinity
  const samples = 32
  for (let i = 0; i <= samples; i++) {
    const d = curve.getPointAt(i / samples).distanceToSquared(focus)
    if (d < distance) { distance = d; best = i }
  }
  let lo = Math.max(0, (best - 1) / samples), hi = Math.min(1, (best + 1) / samples)
  for (let i = 0; i < 30; i++) {
    const left = lo + (hi - lo) / 3, right = hi - (hi - lo) / 3
    if (curve.getPointAt(left).distanceToSquared(focus) <= curve.getPointAt(right).distanceToSquared(focus)) hi = right
    else lo = left
  }
  return curve.getPointAt(Math.min(1, (lo + hi) / 2 + (forwardDistance ? forwardDistance / curve.getLength() : 0)))
}

// Planet-body occlusion without a raycast through the full terrain/instanced scene.
export function planetHidesPoint(eye, point, radius) {
  if (!(eye.length() > radius && point.length() > radius)) return false
  const direction = point.clone().sub(eye), length = direction.length()
  direction.divideScalar(length)
  const b = eye.dot(direction), discriminant = b * b - (eye.lengthSq() - radius * radius)
  return discriminant >= 0 && -b - Math.sqrt(discriminant) < length - 1 && -b - Math.sqrt(discriminant) > 0
}

// Measure motion in screen space, so a fast spacecraft can keep its label when
// tracked while stationary hardware rushing past that camera loses its labels.
export class CalloutMotionGate {
  constructor() { this.samples = new Map() }
  accept(id, point, time, height, clock = 'video') {
    const old = this.samples.get(id)
    if (!old || old.source !== point.source || old.clock !== clock || time < old.time || (clock === 'video' && time - old.time > 0.5)) {
      this.samples.set(id, { ...point, time, clock, quietSince: time, visible: false })
      return false
    }
    const dt = time - old.time
    // Multiple render passes may occur a millisecond apart. Accumulate enough
    // time to avoid interpreting subpixel numerical noise as fast movement.
    if (dt < 1 / 30) return old.visible
    const speed = Math.hypot(point.x - old.x, point.y - old.y) / dt
    const quietSince = speed > height * 0.18 ? time : old.quietSince
    const visible = time - quietSince >= 0.2
    this.samples.set(id, { ...point, time, clock, quietSince, visible })
    return visible
  }
}

export class EvidenceLedgerCallouts {
  constructor(app) {
    this.app = app
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'evidence-callout-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
    Object.assign(this.canvas.style, {position: 'fixed', pointerEvents: 'none', zIndex: '2', display: 'none'})
    app.container.append(this.canvas)
    this.context = this.canvas.getContext('2d')
    this.texture = calloutTexture(this.canvas)
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2)
    this.camera.position.z = 1
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.scene.add(this.quad)
    this.links = document.createElement('div')
    this.links.className = 'evidence-callout-links'
    this.links.setAttribute('aria-label', 'Scene annotations and Evidence Ledger links')
    app.container.append(this.links)
    this.linkNodes = new Map()
    this.selectedSources = new Map()
    this.nodeAnchors = new WeakMap()
    this.sectionAnchors = new Map()
    this.motion = new CalloutMotionGate()
    this.lastSignature = ''
    this.onKey = event => { if (event.key === 'Escape') this.closeDetails() }
    this.onOutside = event => { if (!this.links.contains(event.target)) this.closeDetails() }
    document.addEventListener('keydown', this.onKey)
    document.addEventListener('pointerdown', this.onOutside)
  }

  nodeBounds(node) {
    if (node.geometry) {
      if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere?.()
      const sphere = node.geometry.boundingSphere
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox?.()
      if (sphere) return { box: node.geometry.boundingBox, position: sphere.center.clone().applyMatrix4(node.matrixWorld), diameter: 2 * sphere.radius * node.matrixWorld.getMaxScaleOnAxis() }
    }
    // PixelLOD has an explicit characteristic size; its off-screen/unbuilt levels
    // need not be inspected. This also supports instanced proxies with no geometry.
    if (node.size || node.instancedProxyPool) return {
      position: new THREE.Vector3().setFromMatrixPosition(node.matrixWorld),
      diameter: (node.size ?? node.instancedProxyPool.size) * node.matrixWorld.getMaxScaleOnAxis(),
    }
    // Compute bounds in the component's own frame. A cached world AABB becomes
    // incorrect when a pooled model rotates, changes LOD or moves its children.
    const box = new THREE.Box3(), inverse = node.matrixWorld.clone().invert()
    node.traverseVisible(child => {
      if (!child.geometry || (child.isInstancedMesh && !child.count)) return
      if (child.isInstancedMesh) child.computeBoundingBox()
      else if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
      const bounds = child.isInstancedMesh ? child.boundingBox : child.geometry.boundingBox
      if (bounds) box.union(bounds.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld)))
    })
    if (box.isEmpty()) return null
    return { box, position: box.getCenter(new THREE.Vector3()).applyMatrix4(node.matrixWorld),
      diameter: box.getSize(new THREE.Vector3()).length() * node.matrixWorld.getMaxScaleOnAxis() }
  }

  // Bind once in MODEL coordinates, then transform by the matrix actually used
  // to draw this frame. Never smooth a world/screen point: that makes it lag behind
  // its object. A different occupant of a recycled model requires a fresh binding.
  nodeAnchor(node, source, localPoint) {
    let binding = this.nodeAnchors.get(node)
    if (!binding || binding.source !== source || binding.geometry !== node.geometry) {
      const bounds = this.nodeBounds(node)
      if (!bounds) return null
      binding = { source, geometry: node.geometry, box: bounds.box?.clone(),
        point: node.worldToLocal(bounds.position.clone()),
        diameter: bounds.diameter / node.matrixWorld.getMaxScaleOnAxis() }
      this.nodeAnchors.set(node, binding)
    }
    return { box: binding.box, matrix: node.matrixWorld, position: (localPoint ?? binding.point).clone().applyMatrix4(node.matrixWorld),
      diameter: binding.diameter * node.matrixWorld.getMaxScaleOnAxis() }
  }

  renderedCentre(node, frame) {
    // frame.centre already includes the model's physical scale. Remove it to get
    // a local point, then let matrixWorld apply the final visual scale and parent.
    return frame.centre.clone().sub(frame.position).applyQuaternion(frame.orientation.clone().invert())
      .divide(node._physicalRenderScale ?? node.scale)
  }

  candidates(width, height) {
    const app = this.app, camera = app.camera3d, best = new Map()
    camera.updateWorldMatrix(true, false)
    const launch = app.launchSystem, moving = new Map(), stored = new Map(), renderedTubes = []
    for (const Class of launch?.objectClasses ?? []) {
      const ref = Class.refFrames?.[0]
      if (!ref || !Class.activeObjects) continue
      for (const obj of Class.activeObjects.values()) if (obj.model && obj.getFutureFrame) moving.set(obj.model.uuid, { obj, ref })
    }
    for (const [key, entry] of launch?.stashingFacility?.entries ?? []) stored.set(entry.model.uuid, { ...entry, key })
    // Instance slot numbers are draw addresses, not identities: sync() sorts them
    // again for every camera. Their ordinary scene proxies are the anchor sources.
    const renderBatches = new Set([...InstancedProxyPool.pools].flatMap(pool => pool.meshes))
    const video = app.shots?.mode === 'render' || app.shots?.drivesCamera
    const eye = camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(app.planetCoordSys.matrixWorld.clone().invert())
    const trainDiameter = (value(app, 'launchVehicleBodyLength', 10) + value(app, 'launchVehicleNoseconeLength', 20)) *
      value(app, 'launchVehicleScaleFactor') * value(app, 'launchSystemForwardScaleFactor') * value(app, 'launcherVisualLengthScale')
    const add = (definition, position, diameter, source, eligibility = {}, flight = {}) => {
      const projected = projectCallout(position, eligibility.rangeDiameter ?? diameter, camera, width, height, eligibility)
      if (!projected) return
      const fixed = app.planetCoordSys.worldToLocal(position.clone())
      if (planetHidesPoint(eye, fixed, app.planetRadius)) return
      // Prefer the previously selected physical source while it remains in view.
      const behindUI = this.layoutBlocked?.some(rect => projected.x >= rect.x && projected.x <= rect.x + rect.width && projected.y >= rect.y && projected.y <= rect.y + rect.height)
      const score = (behindUI ? 1e10 : 0) + Math.hypot(projected.x - width / 2, projected.y - height / 2) -
        (this.selectedSources.get(definition.id) === source ? 1e9 : 0)
      const extent = projectCallout(position, eligibility.outlineDiameter ?? diameter, camera, width, height, { minPixels: 0, maxFraction: Infinity })
      let outline = !eligibility.peripheral && extent ? { radiusX: extent.pixels / 2, radiusY: extent.pixels / 2, inset: 2 } : undefined
      if (eligibility.box) {
        let radiusX = 0, radiusY = 0
        const corners = []
        for (const x of [eligibility.box.min.x, eligibility.box.max.x])
          for (const y of [eligibility.box.min.y, eligibility.box.max.y])
            for (const z of [eligibility.box.min.z, eligibility.box.max.z]) {
              const corner = new THREE.Vector3(x, y, z).applyMatrix4(eligibility.matrix).project(camera)
              corners.push({ x: (corner.x + 1) * width / 2, y: (1 - corner.y) * height / 2 })
              radiusX = Math.max(radiusX, Math.abs((corner.x + 1) * width / 2 - projected.x))
              radiusY = Math.max(radiusY, Math.abs((1 - corner.y) * height / 2 - projected.y))
            }
        outline = { radiusX, radiusY, points: projectedOutline(corners), inset: 2 }
      }
      const claims = value(app, 'showEvidenceLedgerLinks', false) ? claimsFor(definition.claimTarget ?? definition.id).filter(claim => claimApplies(claim, flight)) : []
      if (!value(app, 'showObjectLabels', false) && !claims.length) return
      const choices = best.get(definition.id) ?? []
      choices.push({ ...definition, ...projected, score, source, claims, position, diameter, flight, eligibility, outline, surfaceEndpoint: eligibility.surfaceMesh ?
        (centre, elbow) => meshSurfaceEndpoint(eligibility.surfaceMesh, camera, width, height, centre, elbow) : undefined })
      choices.sort((a, b) => (TRAIN_PARTS.has(definition.id) || definition.id === 'grapplers' ? (b.flight.progress ?? -Infinity) - (a.flight.progress ?? -Infinity) : 0) || a.score - b.score || a.source.localeCompare(b.source))
      best.set(definition.id, TRAIN_PARTS.has(definition.id) ? choices : choices.slice(0, ['mooring', 'pretension'].includes(definition.id) ? 32 : 4))
    }
    app.scene.traverseVisible(node => {
      if (['massDriverTubeSegment', 'massDriverTubeLine'].includes(node.name)) renderedTubes.push(node)
      const definition = BY_NAME.get(node.name)
      if (!definition || renderBatches.has(node)) return
      if (definition.id === 'screws' && !node.isMesh && !node.instancedProxyPool) return
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (BY_NAME.get(parent.name)?.id === definition.id && definition.id !== 'screws') return
      }
      if (node.isInstancedMesh) {
        // Standalone batches such as seabed anchors have stable per-object indices.
        if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere()
        const sphere = node.geometry.boundingSphere, matrix = new THREE.Matrix4()
        for (let i = 0; i < node.count; i += Math.max(1, Math.ceil(node.count / 32))) {
          node.getMatrixAt(i, matrix); matrix.premultiply(node.matrixWorld)
          add(definition, sphere.center.clone().applyMatrix4(matrix), 2 * sphere.radius * matrix.getMaxScaleOnAxis(), `${node.uuid}/${i}`)
        }
        return
      }
      const tracked = moving.get(node.uuid)
      const parked = stored.get(node.uuid)
      if (['vehicle', 'nut', 'sled'].includes(definition.id) && !tracked && !parked) return
      const source = tracked ? `${node.uuid}/${tracked.obj.launchIndex}` : parked ? `stored:${parked.key}` :
        node.parent?.screwSegment ? `screw:${node.parent._screwIndex}:${node.userData}` : node.uuid
      let flight = {}, localPoint
      if (tracked) {
        const frame = tracked.obj.frameAt(tracked.ref, tracked.obj.clampedDeltaT(tracked.ref))
        localPoint = this.renderedCentre(node, frame)
        const air = launch.glow?.airAt(frame, launch.planetRadius) ?? {}
        flight = { ...air, curveName: frame.f.curve.name,
          progress: (frame.f.res?.relevantCurveStartDistance ?? frame.f.res?.relevantCurveStartPosition ?? 0) + (frame.f.distance ?? 0),
          speedOfSound: app.planetSpec.speedOfSoundAtAltitude?.(air.altitude) ?? 340 }
      } else if (parked) {
        localPoint = parked.component.localCentre.clone().divide(node._physicalRenderScale ?? node.scale)
      }
      if (definition.id === 'terminal') {
        // The vertical elevator cylinder defines the terminus centre, independently
        // of the rotating surface buildings and the evacuated tube inside the hull.
        const cylinder = node.getObjectByName('elevatorShaft')
        if (cylinder?.visible) {
          const bound = this.nodeBounds(cylinder)
          if (bound) add(definition, bound.position, bound.diameter, `${source}/elevatorShaft`,
            { box: bound.box, matrix: cylinder.matrixWorld, surfaceMesh: cylinder, maxFraction: Infinity })
        }
        return
      }
      const bound = this.nodeAnchor(node, source, localPoint)
      if (!bound) return
      if (['mooring', 'pretension'].includes(definition.id)) {
        // A bounds centre can lie in empty water between several mooring legs.
        // Attach to a real rendered vertex instead.
        const positions = node.geometry?.attributes.position
        const localFocus = node.worldToLocal(new THREE.Vector3().fromArray(app.camera.getState().target))
        if (positions) for (let i = 0; i + 1 < positions.count; i += 2 * Math.max(1, Math.floor(positions.count / 512))) {
          const a = new THREE.Vector3().fromBufferAttribute(positions, i)
          const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1)
          const point = new THREE.Line3(a, b).closestPointToPoint(localFocus, true, new THREE.Vector3())
          add(definition, point.applyMatrix4(node.matrixWorld),
            bound.diameter, `${node.uuid}/${i}`, { peripheral: true, minPixels: 0, maxFraction: Infinity })
        }
      } else add(definition, bound.position, bound.diameter, source,
        { box: bound.box, matrix: bound.matrix, surfaceMesh: definition.id === 'screws' && node.isMesh ? node : undefined,
          ...(TRAIN_PARTS.has(definition.id) ? { rangeDiameter: trainDiameter } :
            ['screws', 'rail'].includes(definition.id) ? { minPixels: 20, maxFraction: Infinity } : {}) }, flight)
      if (definition.id === 'nut' && node.grappler?.pads) {
        const pads = node.grappler.pads
        if (node.grappler.padsLod.visible && pads.visible) for (const [i, instance] of pads.instances.entries()) {
          if (!instance.visible) continue
          const geometry = instance.shape.geometry
          geometry.computeBoundingSphere()
          geometry.computeBoundingBox()
          const matrix = new THREE.Matrix4().multiplyMatrices(instance.shape.mesh.matrixWorld, instance.matrix)
          const surfaceMesh = new THREE.Mesh(geometry, instance.shape.mesh.material)
          surfaceMesh.matrixWorld.copy(matrix)
          add({ id: 'grapplers', label: 'Grapplers', priority: 86 },
            geometry.boundingSphere.center.clone().applyMatrix4(matrix),
            2 * geometry.boundingSphere.radius * matrix.getMaxScaleOnAxis(), `${source}/grappler:${i}`,
            { minPixels: 20, maxFraction: Infinity, box: geometry.boundingBox, matrix, surfaceMesh }, flight)
        }
      }
      if (definition.id === 'vehicle') {
        const tail = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld)
        add({ id: 'engine', label: 'Rocket engine', priority: 90 }, tail,
          2 * value(app, 'launchVehicleRadius') * node.matrixWorld.getMaxScaleOnAxis(), `${source}/engine`, {}, flight)
      }
    })
    const tubeDiameter = 2 * value(app, 'launcherMassDriverTubeInnerRadius') * value(app, 'launcherVisualRadiusScale')
    const showTube = value(app, 'showMassDriverTube', false)
    if (launch?.evacuatedTubeCurve && showTube) add({ id: 'airlock', label: 'Exit Airlock', priority: 110 },
      app.planetCoordSys.localToWorld(launch.evacuatedTubeCurve.getPointAt(1)), Math.max(tubeDiameter * 2, launch.evacuatedTubeCurve.getLength() * 0.015), 'tube-exit', { maxFraction: Infinity, outlineDiameter: tubeDiameter * 2 })
    const focus = app.planetCoordSys.worldToLocal(new THREE.Vector3().fromArray(app.camera.getState().target))
    // Match the scale used for the launch train, rather than the much thinner tube.
    const focusProjection = projectCallout(app.planetCoordSys.localToWorld(focus.clone()), trainDiameter,
      camera, width, height, { minPixels: 0, maxFraction: Infinity })
    const trainView = !!focusProjection && focusProjection.pixels >= 12
    // Keep local tube labels away from the train and prominent nearby structures.
    const tubeBlockers = ['vehicle', 'nut', 'sled', 'engine', 'terminal', 'stash', 'fans']
      .flatMap(id => best.get(id) ?? [])
    const tubeAnchorClear = point => {
      const screen = projectCallout(app.planetCoordSys.localToWorld(point.clone()), tubeDiameter,
        camera, width, height, { minPixels: 0, maxFraction: Infinity })
      return screen && tubeBlockers.every(object => {
        const rx = object.outline?.radiusX ?? object.pixels / 2
        const ry = object.outline?.radiusY ?? object.pixels / 2
        return Math.hypot(Math.max(0, Math.abs(screen.x - object.x) - rx),
          Math.max(0, Math.abs(screen.y - object.y) - ry)) >= 48
      })
    }
    if (trainView && renderedTubes.length) {
      let binding = this.sectionAnchors.get('renderedTube')
      if (!binding || !renderedTubes.includes(binding.node) ||
          !tubeAnchorClear(app.planetCoordSys.worldToLocal(binding.node.localToWorld(binding.localPoint.clone())))) {
        binding = null
        let closest = Infinity
        for (const node of renderedTubes) {
          this.tubePaths ??= new WeakMap()
          let path = node.geometry.parameters?.path
          if (!path && node.isLine) {
            path = this.tubePaths.get(node.geometry)
            if (!path) {
              const positions = node.geometry.attributes.position
              path = new THREE.CurvePath()
              for (let i = 1; i < positions.count; i++) {
                path.add(new THREE.LineCurve3(new THREE.Vector3().fromBufferAttribute(positions, i - 1),
                  new THREE.Vector3().fromBufferAttribute(positions, i)))
              }
              this.tubePaths.set(node.geometry, path)
            }
          }
          if (!path) continue
          const localFocus = node.worldToLocal(app.planetCoordSys.localToWorld(focus.clone()))
          const scale = node.matrixWorld.getMaxScaleOnAxis()
          for (const distance of [2, 3, 4, 6, 8, 12, 16]) {
            const localPoint = sectionAnchor(path, localFocus, distance * trainDiameter / scale)
            const fixed = app.planetCoordSys.worldToLocal(node.localToWorld(localPoint.clone()))
            if (!tubeAnchorClear(fixed)) continue
            const separation = fixed.distanceToSquared(focus)
            if (separation < closest) { closest = separation; binding = {node, localPoint} }
            break
          }
        }
        if (binding) this.sectionAnchors.set('renderedTube', binding)
      }
      if (binding) {
        const {node, localPoint} = binding
        const position = node.localToWorld(localPoint.clone())
        const diameter = Math.max(tubeDiameter, Math.min(1000, position.distanceTo(camera.position) * 0.08))
        add({id: 'evacuatedTube', label: 'Evacuated Tube', claimTarget: node.userData.calloutSection ?? 'acceleration', priority: 92},
          position, diameter, `rendered-tube:${node.uuid}/${localPoint.toArray().join(',')}`,
          {outlineDiameter: tubeDiameter, surfaceMesh: node.isMesh ? node : undefined, peripheral: !node.isMesh})
      }
    }
    const curvePart = (id, label, curve) => {
      if (trainView && renderedTubes.length) return
      if (!curve || !showTube || !(curve.getLength() > 0)) return
      let binding = this.sectionAnchors.get(id)
      if (!binding || binding.curve !== curve || binding.trainView !== trainView ||
          (trainView ? !tubeAnchorClear(binding.point) :
            !projectCallout(app.planetCoordSys.localToWorld(binding.point.clone()), tubeDiameter, camera, width, height, { minPixels: 0, maxFraction: Infinity }))) {
        let point
        if (trainView) {
          // Search forward in launch direction, starting two train lengths away.
          // Hide the tube label if the visible tube has no clear attachment point.
          for (const distance of [2, 3, 4, 6, 8]) {
            const candidate = sectionAnchor(curve, focus, distance * trainDiameter)
            if (tubeAnchorClear(candidate)) { point = candidate; break }
          }
          if (!point) return
        } else point = sectionAnchor(curve, focus)
        binding = { curve, point, trainView }
        this.sectionAnchors.set(id, binding)
      }
      const position = app.planetCoordSys.localToWorld(binding.point.clone())
      // A section is identifiable by its visible span, even when its tube is thin.
      const distance = position.distanceTo(camera.getWorldPosition(new THREE.Vector3()))
      const diameter = Math.max(tubeDiameter, Math.min(curve.getLength() * 0.12, distance * 0.08))
      add({ id: trainView ? 'evacuatedTube' : id, label: trainView ? 'Evacuated Tube' : label, claimTarget: id, priority: 92 }, position, diameter, `section:${id}/${binding.point.toArray().join(',')}`, { outlineDiameter: tubeDiameter })
    }
    const horizontalParts = [launch?.massDriver1Curve, launch?.massDriver2Curve].filter(curve => curve?.getLength() > 0)
    const horizontalLength = horizontalParts.reduce((sum, curve) => sum + curve.getLength(), 0)
    const horizontalKey = horizontalParts.map(curve => curve).every((curve, i) => curve === this.horizontalParts?.[i]) && horizontalParts.length === this.horizontalParts?.length
    const horizontal = horizontalKey ? this.horizontal : horizontalParts.length ? {
      getLength: () => horizontalLength,
      getPointAt: t => {
        let distance = t * horizontalLength
        for (const curve of horizontalParts) {
          if (distance <= curve.getLength()) return curve.getPointAt(distance / curve.getLength())
          distance -= curve.getLength()
        }
        return horizontalParts.at(-1).getPointAt(1)
      },
    } : null
    this.horizontal = horizontal; this.horizontalParts = horizontalParts
    curvePart('acceleration', 'Horizontal Acceleration Section', horizontal)
    curvePart('ramp', 'Ramp Section', launch?.launchRampCurve?.[1])
    curvePart('tube', 'Elevated Evacuated Tube', launch?.evacuatedTubeCurve)
    const site = app.nonGUIParams?.evidenceLedgerSite
    if (site && value(app, 'showEarthsSurface', true)) {
      const point = geodeticToECEF(site.lat, site.lon, site.altitude * value(app, 'terrainExaggeration') + 10, app.planetSpec.ellipsoid)
      add({ id: 'mountain', label: site.label, priority: 82 },
        app.planetCoordSys.localToWorld(new THREE.Vector3(point.x, point.y, point.z)), site.diameter, 'launch-site-mountain')
    }
    // The visible terrain tiles catch hills/ground that the planet-body test cannot.
    const ray = new THREE.Raycaster()
    const worldEye = camera.getWorldPosition(new THREE.Vector3())
    // During recording, evaluate nearby shot times instead of measuring previous
    // rendered frames. Resuming/regenerating a segment must not create a label gap.
    const motionSamples = video ? [-0.1, 0.1].map(offset => {
      const time = app.shots.playhead + offset, pose = app.shots.poseAt(time)
      if (!pose) return null
      const sampleCamera = camera.clone()
      sampleCamera.position.fromArray(pose.position); sampleCamera.up.fromArray(pose.up)
      sampleCamera.lookAt(new THREE.Vector3().fromArray(pose.target))
      sampleCamera.fov = pose.fov ?? camera.fov
      sampleCamera.updateProjectionMatrix(); sampleCamera.updateMatrixWorld(true)
      return { camera: sampleCamera, delta: (launch?.animationTimeAt?.(app.shots.simTimeAt(time)) ?? app.shots.simTimeAt(time)) - (launch?.animationTimeAt?.(app.clock.time) ?? app.clock.time) }
    }) : null
    const sampleTime = performance.now() / 1000
    const visible = []
    for (const choices of best.values()) {
      // Cull terrain BEFORE choosing a source so an obscured instance cannot
      // monopolize the category while other instances are clearly visible.
      const unobscured = choice => {
        const delta = choice.position.clone().sub(worldEye)
        ray.set(worldEye, delta.clone().normalize()); ray.far = Math.max(0, delta.length() - 2)
        return !value(app, 'showEarthsSurface', true) || !app.planet?.raycast?.(ray)?.length
      }
      const candidate = choices.find(unobscured)
      if (!candidate) continue
      this.selectedSources.set(candidate.id, candidate.source)
      if (motionSamples?.every(Boolean)) {
        const object = moving.get(candidate.source.split('/')[0])
        const current = object?.obj.getFutureFrame(object.ref, 0)?.position
        const projected = motionSamples.map(sample => {
          const point = candidate.position.clone()
          if (current) {
            const other = object.obj.getFutureFrame(object.ref, sample.delta)?.position
            if (!other) return null
            point.add(app.planetCoordSys.localToWorld(other.clone()).sub(app.planetCoordSys.localToWorld(current.clone())))
          }
          return projectCallout(point, candidate.eligibility.rangeDiameter ?? candidate.diameter, sample.camera, width, height, candidate.eligibility)
        })
        if (projected.some(point => !point) || Math.hypot(projected[1].x - projected[0].x, projected[1].y - projected[0].y) / 0.2 > height * 0.18) continue
      } else if (!this.motion.accept(candidate.id, candidate, sampleTime, height, 'wall')) continue
      if (['mooring', 'pretension'].includes(candidate.id)) {
        candidate.alternates = choices.filter(choice => choice !== candidate && unobscured(choice)).slice(0, 7)
      }
      visible.push(candidate)
    }
    return visible
  }

  blockedRects(width, height) {
    const rect = this.app.renderer.domElement.getBoundingClientRect()
    const scale = Math.min(rect.width / width, rect.height / height)
    const left = rect.left + (rect.width - width * scale) / 2, top = rect.top + (rect.height - height * scale) / 2
    this.screen = { scale, left, top }
    const blocked = []
    for (const node of document.querySelectorAll('.lil-gui.root, .shot-sidebar, .view-status, .chart-controls')) {
      const r = node.getBoundingClientRect()
      if (!r.width || !r.height || getComputedStyle(node).visibility === 'hidden') continue
      blocked.push({ x: (r.left - left) / scale, y: (r.top - top) / scale, width: r.width / scale, height: r.height / scale })
    }
    return blocked
  }

  render(renderer) {
    this.showEvidence = value(this.app, 'showEvidenceLedgerLinks', false)
    const showLabels = value(this.app, 'showObjectLabels', false)
    this.links.hidden = !this.showEvidence
    if (!this.showEvidence) this.closeDetails()
    const composite = !!this.app.shots?.recordingSize || ['render', 'live'].includes(this.app.shots?.mode)
    this.canvas.style.display = !composite && (this.showEvidence || showLabels) ? 'block' : 'none'
    if (!this.showEvidence && !showLabels) { this.visibleCallouts = []; return }
    const size = renderer.getSize(new THREE.Vector2()), width = Math.round(size.x), height = Math.round(size.y)
    if (!width || !height) return
    const blocked = this.blockedRects(width, height)
    this.layoutBlocked = blocked
    Object.assign(this.canvas.style, {left: `${this.screen.left}px`, top: `${this.screen.top}px`,
      width: `${width * this.screen.scale}px`, height: `${height * this.screen.scale}px`})
    this.dock = { x: 18, y: height - 58, width: this.showEvidence ? 68 + GLOBAL_TOPICS.length * 40 : 0, height: this.showEvidence ? 38 : 0 }
    const dockPositions = [18, ...blocked.map(rect => rect.x + rect.width + 18), width - this.dock.width - 18]
      .flatMap(x => [height - 58, height - 100, 42].map(y => ({ ...this.dock, x, y })))
    this.dock = dockPositions.find(rect => rect.x >= 18 && rect.x + rect.width <= width - 18 &&
      !blocked.some(other => rectanglesOverlap(rect, other))) ?? this.dock
    const anchors = this.candidates(width, height), candidates = []
    const claimWidth = Math.min(380, width * 0.42)
    for (const anchor of anchors) {
      if (showLabels) {
        this.context.font = '600 15px system-ui, sans-serif'
        const labelWidth = Math.min(260, Math.max(115, this.context.measureText(anchor.label).width + 32))
        const label = { ...anchor, id: `label:${anchor.id}`, targetId: anchor.id, type: 'object', claims: [], width: labelWidth, height: 45 }
        candidates.push(label)
        // Cable attachments stay fixed; try alternate card positions if the startup UI crowds them.
        if (['mooring', 'pretension', 'terminal'].includes(anchor.id)) {
          for (const option of [anchor, ...(anchor.alternates ?? [])]) {
            for (const slot of [[1, -100], [-1, -160], [1, 90], [-1, 180], [1, -220], [-1, -60], [1, 230]]) {
              candidates.push({ ...label, ...option, id: label.id, claims: [], slot })
            }
          }
        }
      }
      if (this.showEvidence && anchor.claims.length) {
        this.context.font = '500 14px system-ui, sans-serif'
        const lines = wrapCalloutText(anchor.claims[0].title, claimWidth - 32, text => this.context.measureText(text).width)
        candidates.push({ ...anchor, id: `claim:${anchor.id}`, targetId: anchor.id, type: 'claim', priority: anchor.priority - (showLabels ? 20 : -5),
          titleLines: lines, width: claimWidth, height: 42 + lines.length * 20 })
      }
    }
    const cards = placeCallouts(candidates, width, height, [...blocked, this.dock], { maxCards: 8 })
    this.visibleCallouts = cards
    // Native display pixels stay independent of adaptive scene resolution. Captures
    // use the export buffer's scale so the same graphics remain in recorded frames.
    const ratio = composite ? renderer.getPixelRatio() : this.screen.scale * (window.devicePixelRatio || 1)
    const signature = JSON.stringify([width, height, ratio, this.showEvidence, showLabels, this.dock, cards.map(c => [c.id, c.x, c.y, c.leader, c.rect, c.titleLines, c.claims.map(claim => claim.url)])])
    if (signature !== this.lastSignature) {
      this.lastSignature = signature
      this.draw(cards, width, height, ratio)
    }
    this.updateLinks(cards)
    if (composite) { renderer.clearDepth(); renderer.render(this.scene, this.camera) }
  }

  text(text, x, y, maxWidth) {
    const ctx = this.context
    while (text.length && ctx.measureText(text).width > maxWidth) text = text.slice(0, -2).trimEnd() + '\u2026'
    ctx.fillText(text, x, y)
  }

  draw(cards, width, height, ratio = (this.screen?.scale ?? 1) * (window.devicePixelRatio || 1)) {
    const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio))
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight
      // WebGL allocates immutable storage on a texture's first upload. A smaller
      // canvas only updates part of that old storage; a larger one cannot fit.
      // Display resizing, monitor DPR and recording can change these sizes.
      const previous = this.texture
      this.texture = calloutTexture(this.canvas)
      this.material.map = this.texture
      previous.dispose()
    }
    const ctx = this.context
    ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0)
    ctx.clearRect(0, 0, width, height)
    for (const card of cards) {
      const { x, y, rect: r, claims } = card
      ctx.strokeStyle = card.type === 'claim' ? 'rgba(168,221,238,.8)' : 'rgba(224,233,238,.65)'; ctx.lineWidth = 1
      ctx.beginPath(); card.leader.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke()
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5
      ctx.fillStyle = 'rgba(10,22,34,.93)'; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.width, r.height, 6); ctx.fill()
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
      ctx.strokeStyle = 'rgba(165,211,231,.24)'; ctx.stroke()
      ctx.fillStyle = '#78d9ef'; ctx.fillRect(r.x, r.y + 14, 2, r.height - 28)
      if (card.type === 'object') {
        ctx.font = '600 15px system-ui, sans-serif'; ctx.fillStyle = '#f3f8fc'
        ctx.fillText(card.label, r.x + 16, r.y + 27)
      } else {
        ctx.font = '500 14px system-ui, sans-serif'; ctx.fillStyle = '#b6ebfc'
        card.titleLines.forEach((line, index) => ctx.fillText(line, r.x + 16, r.y + 25 + index * 20))
        ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#adc1ce'
        ctx.fillText(claims.length > 1 ? `View claim \u2197     + ${claims.length - 1} related claims` : 'View claim \u2197', r.x + 16, r.y + r.height - 13)
      }
    }
    const dock = this.dock
    if (this.showEvidence) {
      ctx.fillStyle = 'rgba(10,22,34,.88)'; ctx.beginPath(); ctx.roundRect(dock.x, dock.y, dock.width, dock.height, 6); ctx.fill()
      ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#96b3c4'; ctx.fillText('VPSL', dock.x + 12, dock.y + 23)
      GLOBAL_TOPICS.forEach((topic, i) => {
        ctx.fillStyle = this.detailsId === topic.id ? '#e6faff' : '#9fe5fa'
        ctx.font = '18px system-ui, sans-serif'; ctx.fillText(topic.icon, dock.x + 62 + i * 40, dock.y + 25)
      })
    }
    this.texture.needsUpdate = true
  }

  updateLinks(cards) {
    if (!this.topicButtons) {
      this.topicButtons = GLOBAL_TOPICS.map(topic => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'evidence-topic-button'
        button.setAttribute('aria-label', `${topic.label}: Evidence Ledger claims`)
        button.title = `${topic.label}: Evidence Ledger claims`; button.textContent = topic.icon
        button.addEventListener('click', () => this.openDetails(topic.id))
        this.links.append(button); return button
      })
    }
    this.topicButtons.forEach((button, i) => {
      const s = this.screen
      Object.assign(button.style, { left: `${s.left + (this.dock.x + 51 + i * 40) * s.scale}px`,
        top: `${s.top + this.dock.y * s.scale}px`, width: `${38 * s.scale}px`, height: `${38 * s.scale}px` })
    })
    const active = new Set(GLOBAL_TOPICS.map(topic => topic.id))
    for (const card of cards) {
      if (!card.claims.length) continue
      active.add(card.id)
      let element = this.linkNodes.get(card.id)
      if (!element) {
        element = document.createElement('div'); element.className = 'evidence-link-region'
        const link = document.createElement('a')
        link.className = 'evidence-primary-link'; link.target = '_blank'; link.rel = 'noopener noreferrer'
        element.append(link)
        const more = document.createElement('button'); more.type = 'button'; more.className = 'evidence-more-link'
        more.addEventListener('click', () => this.openDetails(card.id))
        element.append(more); this.links.append(element); this.linkNodes.set(card.id, element)
      }
      element.hidden = false
      const [link, more] = element.children
      link.href = card.claims[0].url; link.textContent = card.claims[0].title
      link.setAttribute('aria-label', card.claims[0].title)
      link.title = card.claims[0].title
      more.hidden = card.claims.length <= 1
      more.textContent = `All ${card.claims.length} claims for ${card.label}`
      const s = this.screen
      link.style.height = `${(card.rect.height - 28) * s.scale}px`
      more.style.top = `${(card.rect.height - 26) * s.scale}px`
      more.style.height = `${24 * s.scale}px`
      Object.assign(element.style, { left: `${s.left + card.rect.x * s.scale}px`, top: `${s.top + card.rect.y * s.scale}px`,
        width: `${card.rect.width * s.scale}px`, height: `${card.rect.height * s.scale}px`, '--callout-scale': s.scale })
    }
    for (const [id, element] of this.linkNodes) element.hidden = !active.has(id)
    if (this.details && !active.has(this.detailsId)) this.closeDetails()
  }

  openDetails(id) {
    this.closeDetails()
    const card = this.visibleCallouts.find(c => c.id === id) ?? GLOBAL_TOPICS.map(topic => ({ ...topic, claims: claimsFor(topic.id) })).find(topic => topic.id === id)
    if (!card) return
    this.detailsId = id
    const panel = document.createElement('section'); panel.className = 'evidence-claim-panel'
    panel.setAttribute('aria-label', `${card.label} evidence claims`)
    const heading = document.createElement('h2'); heading.textContent = card.label
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '\u00d7'; close.setAttribute('aria-label', 'Close related claims')
    close.addEventListener('click', () => { this.closeDetails(); (this.linkNodes.get(id)?.children[1] ?? this.topicButtons[GLOBAL_TOPICS.findIndex(topic => topic.id === id)])?.focus() })
    panel.append(close, heading)
    const intro = document.createElement('p'); intro.textContent = 'Related claims in the Evidence Ledger'; panel.append(intro)
    for (const claim of card.claims) {
      const a = document.createElement('a'); a.textContent = claim.title + ' \u2197'; a.href = claim.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; panel.append(a)
    }
    this.details = panel; this.links.append(panel); close.focus()
  }

  closeDetails() { this.details?.remove(); this.details = null; this.detailsId = null }

  dispose() {
    document.removeEventListener('keydown', this.onKey)
    document.removeEventListener('pointerdown', this.onOutside)
    this.canvas.remove(); this.links.remove(); this.quad.geometry.dispose(); this.material.dispose(); this.texture.dispose()
  }
}
