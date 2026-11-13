import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector2, Raycaster, Vector3, Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import { projectCallout, placeCallouts, rectanglesOverlap, planetHidesPoint, claimsFor, GLOBAL_TOPICS, LAUNCHER_PARTS, CalloutMotionGate, EvidenceLedgerCallouts, claimApplies, wrapCalloutText, sectionAnchor, leadersCross, leaderHitsRect, leaderEndpoint, projectedOutline, meshSurfaceEndpoint } from '../../src/scene/EvidenceLedgerCallouts.js'
import { InstancedProxyPool } from '../../src/scene/InstancedProxyPool.js'
import { applyLauncherVisualScale } from '../../src/launcher/launcherVisuals.js'
import ledger from '../../src/scene/evidenceLedgerClaims.json' with { type: 'json' }
import { EvidenceLedgerLinks } from '../../src/presets/EvidenceLedgerLinks.js'
import { toMarsHawaiiLauncherPresets } from '../../src/presets/toMarsHawaiiLauncherPresets.js'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'

function camera() {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 10000)
  camera.updateMatrixWorld(true)
  return camera
}

test('callouts require an identifiable, unclipped feature in front of the camera', () => {
  const cam = camera(), project = (p, size) => projectCallout(new Vector3(...p), size, cam, 1280, 720)
  assert.ok(project([0, 0, -100], 10))
  assert.equal(project([0, 0, 100], 10), null)
  assert.equal(project([1000, 0, -100], 10), null)
  assert.equal(project([0, 0, -100], 0.1), null)
  assert.equal(project([0, 0, -1], 10), null)
})

test('layout avoids UI, other cards and feature points, and is deterministic', () => {
  const candidates = Array.from({ length: 12 }, (_, i) => ({ id: String(i), x: 500 + i * 10, y: 250 + i * 16, priority: 20 - i, height: 121 }))
  const blocked = [{ x: 0, y: 0, width: 200, height: 720 }]
  const cards = placeCallouts(candidates, 1280, 720, blocked)
  assert.ok(cards.length > 0 && cards.length <= 5)
  assert.deepEqual(cards, placeCallouts(candidates, 1280, 720, blocked))
  for (const [i, card] of cards.entries()) {
    assert.ok(!rectanglesOverlap(card.rect, blocked[0]))
    for (const other of cards.slice(i + 1)) assert.ok(!rectanglesOverlap(card.rect, other.rect))
  }
})

test('the opposite side of the planet cannot acquire a floating label', () => {
  assert.ok(planetHidesPoint(new Vector3(0, 0, 20), new Vector3(0, 0, -11), 10))
  assert.ok(!planetHidesPoint(new Vector3(0, 0, 20), new Vector3(0, 0, 11), 10))
  assert.ok(!planetHidesPoint(new Vector3(0, 0, 20), new Vector3(20, 0, 20), 10))
})

test('all reviewed VPSL claims have component or fixed-icon assignments and safe destinations', () => {
  assert.equal(ledger.claims.length, 48)
  const targets = new Set(['vehicle', 'nut', 'sled', 'screws', 'rail', 'fans', 'tube', 'terminal', 'airlock', 'engine', 'ramp', 'acceleration', 'mountain', ...GLOBAL_TOPICS.map(topic => topic.id)])
  for (const claim of ledger.claims) {
    assert.ok(targets.has(claim.target), claim.label)
    const url = new URL(claim.url)
    assert.equal(url.origin, 'https://evidence-ledger.project-atlantis.com')
    assert.ok(url.pathname.startsWith('/claim/'))
  }
  assert.ok(claimsFor('airlock').some(c => c.url.endsWith('53c2c9')))
  assert.ok(claimsFor('vehicle').some(c => c.label.includes('aggregation')))
  assert.equal(claimsFor('brackets').length, 0)
})

test('the new preset preserves Hawaii engineering and disables expensive scenery and effects', () => {
  const base = createParameterDefinitions(), preset = createParameterDefinitions()
  assert.equal(base.showObjectLabels.value, false)
  assert.equal(base.showEvidenceLedgerLinks.value, false)
  toMarsHawaiiLauncherPresets(base, {})
  EvidenceLedgerLinks(preset, {})
  assert.equal(preset.showLiftFans.value, true)
  for (const key of ['showClouds', 'showEarthsAtmosphere', 'showOcean', 'showSeaIce', 'showSailboats', 'showContainerShips', 'showTransitSystem', 'showLaunchVehiclePlasma', 'showLaunchVehicleExhaust']) assert.equal(preset[key].value, false, key)
  for (const [key, def] of Object.entries(base)) {
    if (['showObjectLabels', 'showEvidenceLedgerLinks'].includes(key)) assert.equal(preset[key].value, true)
    else if (!key.startsWith('show')) assert.deepEqual(preset[key].value, def.value, key)
  }
})


test('main-component registry excludes scenery and treats the ocean terminus as one object', () => {
  const names = LAUNCHER_PARTS.flatMap(part => part[2])
  for (const name of ['sailboatHull', 'containerShip', 'terminalShip', 'terminal', 'elevatorShaft', 'pier', 'underwaterTerminalHull', 'transitVehicle']) assert.ok(!names.includes(name), name)
  assert.deepEqual(LAUNCHER_PARTS.find(part => part[0] === 'terminal')[2], ['oceanTerminal'])
})

test('fast screen motion is hidden, while a tracked spacecraft remains labeled', () => {
  const gate = new CalloutMotionGate()
  assert.equal(gate.accept('vehicle', {x: 600, y: 400}, 0, 720), false)
  assert.equal(gate.accept('vehicle', {x: 601, y: 401}, 0.25, 720), true)
  assert.equal(gate.accept('mooring', {x: 200, y: 300}, 0, 720), false)
  assert.equal(gate.accept('mooring', {x: 400, y: 300}, 0.1, 720), false)
  assert.equal(gate.accept('mooring', {x: 600, y: 300}, 0.2, 720), false)
  assert.equal(gate.accept('mooring', {x: 600, y: 300}, 0.3, 720), false)
  assert.equal(gate.accept('mooring', {x: 600, y: 300}, 0.45, 720), true)
  // Seeking or changing clocks must not reuse a stale visible state.
  assert.equal(gate.accept('vehicle', {x: 600, y: 400}, -1, 720), false)
})

test('anchors follow current local geometry after a pooled model rotates and moves its parts', () => {
  const root = new Group(), part = new Mesh(new BoxGeometry(2, 4, 2), new MeshBasicMaterial())
  part.position.set(3, 0, 0); root.add(part); root.position.set(100, 200, 300)
  root.updateMatrixWorld(true)
  const labels = Object.create(EvidenceLedgerCallouts.prototype)
  const first = labels.nodeBounds(root)
  assert.ok(first.position.distanceTo(part.getWorldPosition(new Vector3())) < 1e-8)
  root.rotation.z = Math.PI / 3; part.position.y = 20; root.updateMatrixWorld(true)
  const next = labels.nodeBounds(root)
  assert.ok(next.position.distanceTo(part.getWorldPosition(new Vector3())) < 1e-8)
  part.geometry.dispose(); part.material.dispose()
})


test('full claim statements wrap without shortening or dropping text', () => {
  for (const claim of ledger.claims) {
    assert.ok(claim.title.length >= claim.label.length || claim.title.length > 20)
    assert.ok(claim.display.instructions)
    const lines = wrapCalloutText(claim.title, 48, text => text.length)
    assert.equal(lines.join(' '), claim.title.replace(/\s+/g, ' '))
    assert.ok(lines.every(line => line.length <= 48))
  }
})

test('sonic-boom claims require supersonic atmospheric free flight, not merely a visible spacecraft', () => {
  const claim = ledger.claims.find(c => c.label === 'Sonic-boom exposure')
  const flight = { curveName: 'freeFlightPositionCurve', altitude: 15000, airSpeed: 7600, speedOfSound: 295, density: 0.19 }
  assert.equal(claimApplies(claim, flight), true)
  assert.equal(claimApplies(claim, {...flight, curveName: 'massDriver2Curve'}), false)
  assert.equal(claimApplies(claim, {...flight, curveName: 'elevatedEvacuatedTube'}), false)
  assert.equal(claimApplies(claim, {...flight, altitude: 300000}), false)
  assert.equal(claimApplies(claim, {...flight, airSpeed: 100}), false)
  assert.equal(claimApplies(claim), false)
  const aggregation = ledger.claims.find(c => c.label.includes('aggregation'))
  assert.equal(claimApplies(aggregation, flight), false)
  assert.equal(claimApplies(aggregation, {...flight, altitude: 150000}), true)
})


test('cards keep their side and row when the anchor crosses the screen centre', () => {
  const candidate = {id: 'label:vehicle', targetId: 'vehicle', type: 'object', x: 639, y: 400, width: 140, height: 45, priority: 100}
  const [before] = placeCallouts([candidate], 1280, 720)
  const [after] = placeCallouts([{...candidate, x: 641}], 1280, 720)
  assert.equal(before.side, after.side)
  assert.equal(after.rect.x - before.rect.x, 2)
  assert.equal(after.rect.y, before.rect.y)
  const blocked = [{...after.rect}]
  assert.equal(placeCallouts([{...candidate, x: 641}], 1280, 720, blocked).length, 0, 'a blocked card hides rather than jumping to another slot')
})

test('section anchors move smoothly instead of hopping between coarse samples', () => {
  const curve = {getPointAt: t => new Vector3(t * 800000, 0, 0)}
  const before = sectionAnchor(curve, new Vector3(399999, 100, 0))
  const after = sectionAnchor(curve, new Vector3(400001, 100, 0))
  assert.ok(Math.abs(before.x - 399999) < 0.2)
  assert.ok(Math.abs(after.x - 400001) < 0.2)
  assert.ok(after.distanceTo(before) < 2.4)
})


test('main section label slots stay clear of the open shot panel', () => {
  const blocked = [{x: 0, y: 0, width: 380, height: 720}]
  for (const targetId of ['acceleration', 'ramp', 'tube']) {
    const card = {id: `label:${targetId}`, targetId, type: 'object', x: 640, y: 360, width: 200, height: 45, priority: 92}
    const [placed] = placeCallouts([card], 1280, 720, blocked)
    assert.ok(placed, targetId)
    assert.ok(!rectanglesOverlap(placed.rect, blocked[0]))
  }
})


test('slow frames and duplicate render passes do not repeatedly hide quiet labels', () => {
  const gate = new CalloutMotionGate()
  assert.equal(gate.accept('vehicle', {x: 600, y: 400}, 0, 720, 'wall'), false)
  assert.equal(gate.accept('vehicle', {x: 600, y: 400}, 1, 720, 'wall'), true)
  assert.equal(gate.accept('vehicle', {x: 600.3, y: 400}, 1.001, 720, 'wall'), true)
  assert.equal(gate.accept('vehicle', {x: 601, y: 400}, 1.05, 720, 'wall'), true)
})

// Minimal scene fixture exercises discovery/projection, not just a math helper.
function calloutScene() {
  const scene = new Group(), cam = camera()
  const params = {showObjectLabels: {value: true}, showEvidenceLedgerLinks: {value: true}, showMassDriverTube: {value: false}}
  const labels = Object.create(EvidenceLedgerCallouts.prototype)
  Object.assign(labels, {nodeAnchors: new WeakMap(), sectionAnchors: new Map(), selectedSources: new Map(), motion: {accept: () => true}})
  labels.app = {scene, camera3d: cam, camera: {getState: () => ({target: [0, 0, -100]})},
    planetCoordSys: new Group(), planetRadius: 0, d: params, launchSystem: {}}
  return {labels, scene, cam}
}

test('camera-sorted GPU slots cannot steal a screw anchor from its physical proxy', () => {
  const {labels, scene, cam} = calloutScene()
  const geometry = new BoxGeometry(10, 10, 10), material = new MeshBasicMaterial()
  const pool = new InstancedProxyPool({name: 'massDriverScrew', parent: scene, size: 10, levels: [{geometry, material, minPixels: 0}]})
  try {
    const left = pool.createProxy(), right = pool.createProxy()
    left.position.set(-12, 0, -100); right.position.set(12, 0, -100)
    scene.add(left, right)
    const view = x => {
      cam.position.x = x; cam.lookAt(0, 0, -100)
      scene.updateMatrixWorld(true); cam.updateMatrixWorld(true); pool.sync(cam, 720)
      return labels.candidates(1280, 720).find(c => c.id === 'screws')
    }
    const before = view(-30)
    assert.ok([left.uuid, right.uuid].includes(before.source), 'must bind a logical proxy, never a batch/slot')
    const after = view(30)
    assert.equal(after.source, before.source, 'the distance-sort order reversed, but the physical source must stay put')
    assert.ok(after.position.distanceTo(before.position) < 1e-9)
  } finally {pool.dispose(); geometry.dispose(); material.dispose()}
})

test('a change of LOD cannot change an established component attachment point', () => {
  const {labels, scene} = calloutScene(), root = new Group()
  root.name = 'liftFans'; root.position.z = -100
  const geometry = new BoxGeometry(4, 4, 4), material = new MeshBasicMaterial()
  const near = new Mesh(geometry, material), far = new Mesh(geometry, material)
  near.position.x = 2; far.position.x = -2; far.visible = false
  root.add(near, far); scene.add(root); scene.updateMatrixWorld(true)
  const before = labels.candidates(1280, 720).find(c => c.id === 'fans')
  near.visible = false; far.visible = true
  const after = labels.candidates(1280, 720).find(c => c.id === 'fans')
  assert.ok(after.position.distanceTo(before.position) < 1e-9)
  geometry.dispose(); material.dispose()
})

test('the rendered attachment follows model translation, rotation, visual scale and a crane parent', () => {
  const {labels, scene} = calloutScene(), root = new Group(), crane = new Group()
  root.position.set(100, 10, -200); root.rotation.z = 0.7; root.scale.set(2, 3, 4)
  const frame = {position: root.position.clone(), orientation: root.quaternion.clone()}
  frame.centre = new Vector3(0, 6, 0).applyQuaternion(frame.orientation).add(frame.position)
  const marker = new Group(); marker.position.set(0, 2, 0); root.add(marker)
  const body = new Mesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial()); root.add(body)
  crane.add(root); scene.add(crane)
  applyLauncherVisualScale(root, {radius: 5, length: 9}, frame.centre)
  // The actual rendered model is moved independently of the trajectory.
  root.position.x += 30; crane.rotation.x = 0.2; crane.position.y = 20
  scene.updateMatrixWorld(true)
  const point = labels.renderedCentre(root, frame)
  const anchor = labels.nodeAnchor(root, 'sled:0', point)
  assert.ok(anchor.position.distanceTo(marker.getWorldPosition(new Vector3())) < 1e-8)
  assert.ok(anchor.position.distanceTo(frame.centre) > 10, 'an analytic trajectory point would detach here')
  body.geometry.dispose(); body.material.dispose()
})

test('section attachment stays at the same curve point while the camera focus moves', () => {
  const {labels, cam} = calloutScene()
  labels.app.d.launchVehicleBodyLength = {value: 0.1}
  labels.app.d.launchVehicleNoseconeLength = {value: 0.1}
  labels.app.d.showMassDriverTube.value = true
  labels.app.launchSystem.massDriver1Curve = {getLength: () => 80, getPointAt: t => new Vector3(-40 + 80 * t, 0, -100)}
  const before = labels.candidates(1280, 720).find(c => c.id === 'acceleration')
  assert.ok(before)
  labels.app.camera.getState = () => ({target: [20, 0, -100]})
  cam.position.x = 10; cam.updateMatrixWorld(true)
  const after = labels.candidates(1280, 720).find(c => c.id === 'acceleration')
  assert.ok(after)
  assert.equal(before.source, after.source)
  assert.ok(before.position.distanceTo(after.position) < 1e-9)
  assert.notEqual(before.x, after.x, 'project again using the new camera')
})

test('leaders may share an attachment dot, but may not cross or overlap', () => {
  const p = (x, y) => ({x, y})
  assert.ok(leadersCross([p(0, 0), p(10, 10)], [p(0, 10), p(10, 0)]))
  assert.ok(!leadersCross([p(0, 0), p(10, 10)], [p(0, 0), p(10, -10)]))
  assert.ok(leadersCross([p(0, 0), p(10, 10)], [p(0, 0), p(5, 5)]))
  assert.ok(leaderHitsRect([p(0, 0), p(100, 100)], {x: 40, y: 40, width: 20, height: 20}))
  // Previously these two cards fitted, but their leaders crossed in empty space.
  const cards = placeCallouts([
    {id: 'label:vehicle', targetId: 'vehicle', type: 'object', x: 600, y: 480, width: 140, height: 45, priority: 100},
    {id: 'label:sled', targetId: 'sled', type: 'object', x: 600, y: 300, width: 140, height: 45, priority: 90},
  ], 1280, 720)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].targetId, 'vehicle', 'retain the priority card without moving either attachment')
})

test('source changes require a new quiet interval even if the new object occupies the same pixel', () => {
  const gate = new CalloutMotionGate(), point = {x: 600, y: 400, source: 'screw:0'}
  gate.accept('screws', point, 0, 720, 'wall')
  assert.ok(gate.accept('screws', point, 0.25, 720, 'wall'))
  assert.equal(gate.accept('screws', {...point, source: 'screw:1'}, 0.3, 720, 'wall'), false)
})

test('scene associations replace generic topics where the claim describes visible hardware or geography', () => {
  const target = fragment => ledger.claims.find(c => c.url.includes(fragment))?.target
  assert.equal(target('a-suitable-site'), 'mountain')
  assert.equal(target('capable-of-launching-four'), 'vehicle')
  assert.equal(target('momentum-transfer-is-cheaper'), 'screws')
  assert.equal(target('when-not-launching-spacecraft'), 'screws')
  assert.equal(target('unobtainium'), 'acceleration')
  assert.equal(target('land-use-and-externality'), 'mountain')
  assert.equal(claimsFor('operations').length, 0)
  for (const topic of GLOBAL_TOPICS) assert.ok(claimsFor(topic.id).length)
})

test('an occluded preferred instance yields to a visible physical instance', () => {
  const {labels, scene} = calloutScene(), near = new Group(), other = new Group()
  near.name = other.name = 'liftFans'; near.size = other.size = 10
  near.position.set(0, 0, -100); other.position.set(20, 0, -100)
  scene.add(near, other); scene.updateMatrixWorld(true)
  assert.equal(labels.candidates(1280, 720).find(c => c.id === 'fans').source, near.uuid)
  labels.app.planet = {raycast: ray => ray.ray.direction.x < 0.1 ? [{}] : []}
  assert.equal(labels.candidates(1280, 720).find(c => c.id === 'fans').source, other.uuid)
})


test('train parts share spacecraft range and select the furthest visible instance over the previous source', () => {
  const {labels, scene} = calloutScene()
  labels.app.planetSpec = {}
  const activeObjects = new Map()
  for (const [index, name] of ['launchVehicle', 'adaptiveNut', 'launchSled'].entries()) {
    for (let n = 0; n < 2; n++) {
      const model = new Group()
      model.name = name; model.size = index ? 0.1 : 30
      model.position.set(n * 8, index * 4, -500)
      scene.add(model)
      const obj = {model, launchIndex: n, getFutureFrame() {}, clampedDeltaT: () => 0,
        frameAt: () => ({position: model.position.clone(), centre: model.position.clone(), orientation: model.quaternion.clone(),
          f: {curve: {name: 'massDriver1Curve'}, res: {relevantCurveStartPosition: n * 100}, distance: 10}})}
      activeObjects.set(name + n, obj)
      if (!n) labels.selectedSources.set(['vehicle', 'nut', 'sled'][index], `${model.uuid}/0`)
    }
  }
  labels.app.launchSystem.objectClasses = [{refFrames: [{}], activeObjects}]
  scene.updateMatrixWorld(true)
  const candidates = labels.candidates(1280, 720)
  for (const id of ['vehicle', 'nut', 'sled']) {
    const chosen = candidates.find(c => c.id === id)
    assert.ok(chosen, id)
    assert.ok(chosen.source.endsWith('/1'), 'furthest instance must override source stickiness')
    assert.equal(chosen.eligibility.rangeDiameter, 30)
  }
})

test('ocean terminus centre follows the vertical cylinder rather than the hull or rotating buildings', () => {
  const {labels, scene} = calloutScene(), root = new Group()
  root.name = 'oceanTerminal'; root.position.z = -200
  const hull = new Mesh(new BoxGeometry(30, 20, 60), new MeshBasicMaterial())
  hull.name = 'underwaterTerminalHull'; hull.position.x = 30; root.add(hull)
  const cylinder = new Mesh(new BoxGeometry(8, 60, 8), new MeshBasicMaterial())
  cylinder.name = 'elevatorShaft'; cylinder.position.set(4, 10, 0); root.add(cylinder)
  scene.add(root); scene.updateMatrixWorld(true)
  const candidate = labels.candidates(1280, 720).find(c => c.id === 'terminal')
  assert.ok(candidate)
  assert.ok(candidate.position.distanceTo(cylinder.getWorldPosition(new Vector3())) < 1e-9)
  assert.ok(candidate.outline.radiusY > candidate.outline.radiusX)
  cylinder.geometry.scale(1, 2, 1); cylinder.geometry.computeBoundingSphere(); cylinder.geometry.computeBoundingBox()
  cylinder.position.y = -10; scene.updateMatrixWorld(true)
  const moved = labels.candidates(1280, 720).find(c => c.id === 'terminal')
  assert.ok(moved.position.distanceTo(cylinder.getWorldPosition(new Vector3())) < 1e-9)
  assert.ok(moved.outline.radiusY > candidate.outline.radiusY)
  hull.geometry.dispose(); hull.material.dispose(); cylinder.geometry.dispose(); cylinder.material.dispose()
})

test('launch-train views use one Evacuated Tube label; overview views use section names', () => {
  const {labels, cam} = calloutScene()
  labels.app.d.showMassDriverTube.value = true
  const curve = {getLength: () => 10000, getPointAt: t => new Vector3(-5000 + 10000 * t, 0, -100)}
  Object.assign(labels.app.launchSystem, {massDriver1Curve: curve, launchRampCurve: [null, curve], evacuatedTubeCurve: curve})
  // Even a thin tube gets the local name while a spacecraft is resolvable.
  for (const radius of [1, 5]) {
    labels.app.d.launcherMassDriverTubeInnerRadius = {value: radius}
    const detail = labels.candidates(1280, 720)
    assert.equal(detail.filter(c => c.id === 'evacuatedTube').length, 1)
    assert.equal(detail.find(c => c.id === 'evacuatedTube').label, 'Evacuated Tube')
    for (const id of ['acceleration', 'ramp', 'tube']) assert.ok(!detail.some(c => c.id === id), id)
  }
  cam.position.z = 3000; cam.updateMatrixWorld(true)
  const wide = labels.candidates(1280, 720)
  for (const [id, label] of [['acceleration', 'Horizontal Acceleration Section'], ['ramp', 'Ramp Section'], ['tube', 'Elevated Evacuated Tube']]) {
    assert.equal(wide.find(c => c.id === id)?.label, label)
  }
  assert.ok(!wide.some(c => c.id === 'evacuatedTube'))
})

test('close views label a rendered grappler pad and wide views hide fine hardware', () => {
  const {labels, scene, cam} = calloutScene()
  labels.app.planetSpec = {}
  const nut = new Group(), pads = new Group(), lod = new Group()
  nut.name = 'adaptiveNut'; nut.size = 10; nut.position.z = -50
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
  pads.add(mesh); lod.add(pads); nut.add(lod); scene.add(nut)
  pads.instances = [{visible: true, shape: {geometry: mesh.geometry, mesh}, matrix: mesh.matrix.clone()}]
  nut.grappler = {pads, padsLod: lod}
  const obj = {model: nut, launchIndex: 0, getFutureFrame() {}, clampedDeltaT: () => 0,
    frameAt: () => ({position: nut.position.clone(), centre: nut.position.clone(), orientation: nut.quaternion.clone(),
      f: {curve: {name: 'massDriver1Curve'}, distance: 50}})}
  labels.app.launchSystem.objectClasses = [{refFrames: [{}], activeObjects: new Map([[0, obj]])}]
  const screw = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
  screw.name = 'massDriverScrew'; screw.position.set(5, 0, -50); scene.add(screw)
  const rail = screw.clone(); rail.name = 'massDriverRail'; rail.position.x = -5; scene.add(rail)
  scene.updateMatrixWorld(true)
  const close = labels.candidates(1280, 720)
  for (const id of ['grapplers', 'screws', 'rail']) assert.ok(close.some(c => c.id === id), id)
  const point = close.find(c => c.id === 'grapplers').position
  assert.ok(point.distanceTo(mesh.getWorldPosition(new Vector3())) < 1e-8)
  cam.position.z = 2000; cam.updateMatrixWorld(true)
  const wide = labels.candidates(1280, 720)
  for (const id of ['grapplers', 'screws', 'rail']) assert.ok(!wide.some(c => c.id === id), id)
  mesh.geometry.dispose(); mesh.material.dispose(); screw.geometry.dispose(); screw.material.dispose()
})


test('leader endpoints meet the projected periphery and remain aimed at the centre', () => {
  const centre = {x: 600, y: 350}, outline = {radiusX: 35, radiusY: 70}
  const [card] = placeCallouts([{...centre, outline, id: 'label:vehicle', targetId: 'vehicle',
    type: 'object', width: 140, height: 45, priority: 100}], 1280, 720)
  assert.ok(card)
  const [tip, elbow] = card.leader
  const dx = tip.x - centre.x, dy = tip.y - centre.y
  assert.ok(Math.abs((dx / 35) ** 2 + (dy / 70) ** 2 - 1) < 1e-10)
  assert.ok(Math.abs(dx * (elbow.y - centre.y) - dy * (elbow.x - centre.x)) < 1e-9)
  assert.ok(dx * (elbow.x - centre.x) + dy * (elbow.y - centre.y) > 0)
  assert.deepEqual(leaderEndpoint(centre, elbow), centre, 'existing peripheral points remain fixed')
  assert.equal(leaderEndpoint(centre, centre, outline), null)
})


test('angled thin objects use their oriented outline rather than an oversized screen ellipse', () => {
  const centre = {x: 0, y: 0}, elbow = {x: 100, y: 0}
  const points = projectedOutline([
    {x: -51, y: -49}, {x: -49, y: -51}, {x: 51, y: 49}, {x: 49, y: 51},
    {x: 0, y: 0}, {x: -51, y: -49},
  ])
  assert.equal(points.length, 4)
  const tip = leaderEndpoint(centre, elbow, {points})
  assert.ok(Math.abs(tip.x - 2) < 1e-9)
  assert.equal(tip.y, 0)
  const inset = leaderEndpoint(centre, elbow, {points, inset: 1})
  assert.ok(Math.abs(inset.x - 1) < 1e-9)
  assert.ok(leaderEndpoint(centre, elbow, {radiusX: 51, radiusY: 51}).x > tip.x + 40)
})


test('local tube label anchors farther along the tube with clearance from the launch train', () => {
  const {labels, scene} = calloutScene()
  labels.app.planetSpec = {}
  labels.app.d.showMassDriverTube.value = true
  const curve = {getLength: () => 2000, getPointAt: t => new Vector3(-1000 + 2000 * t, 0, -200)}
  labels.app.launchSystem.massDriver1Curve = curve
  const model = new Group(); model.name = 'adaptiveNut'; model.size = 30; model.position.z = -200
  scene.add(model); scene.updateMatrixWorld(true)
  const obj = {model, launchIndex: 0, getFutureFrame() {}, clampedDeltaT: () => 0,
    frameAt: () => ({position: model.position.clone(), centre: model.position.clone(), orientation: model.quaternion.clone(),
      f: {curve: {name: 'massDriver1Curve'}, distance: 1000}})}
  labels.app.launchSystem.objectClasses = [{refFrames: [{}], activeObjects: new Map([[0, obj]])}]
  const before = labels.candidates(1280, 720).find(c => c.id === 'evacuatedTube')
  assert.ok(before)
  assert.ok(before.position.x >= 59.99, 'at least two train lengths ahead')
  assert.ok(before.x - 640 > 48)
  labels.app.camera.getState = () => ({target: [10, 0, -100]})
  const after = labels.candidates(1280, 720).find(c => c.id === 'evacuatedTube')
  assert.equal(after.source, before.source, 'retain a clear anchor while the focus moves')
})


test('visible cable segments are labeled even when their network fills the camera', async () => {
  const {BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial} = await import('three')
  const {labels, scene} = calloutScene()
  for (const [name, x] of [['mooringCableLines', -10], ['anchorCableLines', 0], ['pretensionCableLines', 10]]) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([x, -10000, -100, x, 10000, -100], 3))
    const line = new LineSegments(geometry, new LineBasicMaterial())
    line.name = name; scene.add(line)
  }
  scene.updateMatrixWorld(true)
  const candidates = labels.candidates(1280, 720)
  for (const id of ['mooring', 'pretension']) {
    assert.ok(candidates.some(c => c.id === id), id)
    assert.equal(candidates.find(c => c.id === id).outline, undefined, 'leader touches the actual cable segment')
  }
  scene.traverse(node => {node.geometry?.dispose(); node.material?.dispose()})
})

test('close-up screw discovery follows the visible mesh instead of the LOD wrapper origin', () => {
  const {labels, scene} = calloutScene(), lod = new Group()
  lod.name = 'massDriverScrew'; lod.size = 2
  const mesh = new Mesh(new BoxGeometry(4, 10, 4), new MeshBasicMaterial())
  mesh.name = 'massDriverScrew'; mesh.position.set(10, 0, -30); lod.add(mesh); scene.add(lod)
  scene.updateMatrixWorld(true)
  const screw = labels.candidates(1280, 720).find(c => c.id === 'screws')
  assert.ok(screw)
  assert.ok(screw.position.distanceTo(mesh.getWorldPosition(new Vector3())) < 1e-9)
  assert.equal(screw.eligibility.surfaceMesh, mesh)
  mesh.geometry.dispose(); mesh.material.dispose()
})

test('surface leader tips hit the rendered close-up mesh after rotation and translation', () => {
  const cam = camera(), mesh = new Mesh(new BoxGeometry(2, 14, 2), new MeshBasicMaterial())
  mesh.position.set(0, 0, -25); mesh.rotation.z = 0.6; mesh.updateMatrixWorld(true)
  const centre = projectCallout(mesh.position, 2, cam, 1280, 720, {minPixels: 0, maxFraction: Infinity})
  const tip = meshSurfaceEndpoint(mesh, cam, 1280, 720, centre, {x: 950, y: 100})
  assert.ok(tip.x > centre.x)
  // The returned point is just inside the true silhouette, not its bounding box.
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(tip.x / 1280 * 2 - 1, 1 - tip.y / 720 * 2), cam)
  assert.ok(ray.intersectObject(mesh).length > 0, 'tip touches the actual mesh')
  const length = Math.hypot(tip.x - centre.x, tip.y - centre.y)
  const outside = {x: tip.x + (tip.x - centre.x) / length, y: tip.y + (tip.y - centre.y) / length}
  ray.setFromCamera(new Vector2(outside.x / 1280 * 2 - 1, 1 - outside.y / 720 * 2), cam)
  assert.equal(ray.intersectObject(mesh).length, 0, 'one pixel farther out is outside the silhouette')
  mesh.geometry.dispose(); mesh.material.dispose()
})


test('terminal mooring and pretension lines retain distinct semantic geometry', async () => {
  await import('../support/rawImports.mjs')
  const {AnchorCables} = await import('../../src/launcher/AnchorCables.js')
  const cables = new AnchorCables({parent: new Group(), toLocal: (point, out) => out.copy(point),
    legs: [], ellipsoid: {}, sampleHeight: () => null})
  try {
    cables.build([
      {top: new Vector3(0, 100, 0), anchor: new Vector3(100, 0, 0), shape: 0.01},
      {top: new Vector3(0, 100, 0), anchor: new Vector3(1000, 0, 0), shape: 100, pretension: true},
    ])
    const mooring = cables.group.getObjectByName('anchorCableLines')
    const pretension = cables.group.getObjectByName('pretensionCableLines')
    assert.ok(mooring?.geometry.attributes.position.count > 0)
    assert.ok(pretension?.geometry.attributes.position.count > 0)
    assert.notEqual(mooring.geometry, pretension.geometry)
  } finally { cables.dispose() }
})


test('local tube labels follow rendered feeder geometry even when the acceleration curve is elsewhere', async () => {
  const {TubeGeometry, LineCurve3, DoubleSide} = await import('three')
  const {labels, scene, cam} = calloutScene()
  labels.app.d.showMassDriverTube.value = true
  labels.app.launchSystem.massDriver1Curve = {getLength: () => 1000,
    getPointAt: t => new Vector3(10000 + t * 1000, 0, -200)}
  const path = new LineCurve3(new Vector3(-150, 0, 0), new Vector3(150, 0, 0))
  const mesh = new Mesh(new TubeGeometry(path, 16, 3, 16, false), new MeshBasicMaterial({side: DoubleSide}))
  mesh.name = 'massDriverTubeSegment'; mesh.position.set(5, 0, -200); mesh.rotation.z = 0.2
  scene.add(mesh); scene.updateMatrixWorld(true)
  const candidate = labels.candidates(1280, 720).find(c => c.id === 'evacuatedTube')
  assert.ok(candidate, 'use the rendered feeder tube even without a visible analytical acceleration section')
  assert.equal(candidate.eligibility.surfaceMesh, mesh)
  const local = mesh.worldToLocal(candidate.position.clone())
  assert.ok(Math.abs(local.y) < 1e-8 && Math.abs(local.z) < 1e-8)
  const tip = candidate.surfaceEndpoint(candidate, {x: candidate.x - 100, y: candidate.y + 120})
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(tip.x / 1280 * 2 - 1, 1 - tip.y / 720 * 2), cam)
  assert.ok(ray.intersectObject(mesh).length > 0, 'the leader tip touches the drawn tube wall')
  mesh.geometry.dispose(); mesh.material.dispose()
})


test('line-LOD tube anchors lie on the drawn polyline between its vertices', async () => {
  const {BufferGeometry, Line, LineBasicMaterial, Line3} = await import('three')
  const {labels, scene} = calloutScene()
  labels.app.d.showMassDriverTube.value = true
  const points = [new Vector3(-150, 0, 0), new Vector3(0, 25, 0), new Vector3(150, -20, 0)]
  const node = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial())
  node.name = 'massDriverTubeLine'; node.position.z = -200
  scene.add(node); scene.updateMatrixWorld(true)
  const candidate = labels.candidates(1280, 720).find(c => c.id === 'evacuatedTube')
  assert.ok(candidate)
  const local = node.worldToLocal(candidate.position.clone())
  const distance = Math.min(...points.slice(1).map((point, i) =>
    new Line3(points[i], point).closestPointToPoint(local, true, new Vector3()).distanceTo(local)))
  assert.ok(distance < 1e-8, 'anchor lies on a straight drawn segment rather than a curved approximation')
  assert.equal(candidate.outline, undefined, 'line leader reaches the actual centreline')
  node.geometry.dispose(); node.material.dispose()
})
