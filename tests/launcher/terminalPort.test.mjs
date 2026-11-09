import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { shipVisit, visitsAt, shipPose, craneAt, agvAt, containerAt, containerTimes, RACK_Z, CRANE, PIER, CONTAINER, siteSeed } from '../../src/launcher/terminalPort.js'
import { terminalModel, terminalPretensionAttachments } from '../../src/launcher/terminalModel.js'

const SITE = siteSeed(19.6234, -163.4055)
const VISITS = Array.from({ length: 40 }, (_, k) => shipVisit(k - 10, SITE))

test('a visit is the same from the same seed, and unloads 5 to 10 containers, each off the top of its stack', () => {
  for (const visit of VISITS) {
    assert.equal(shipVisit(visit.n, SITE), visit)
    const count = visit.containers.length
    assert.ok(count >= 5 && count <= 10, `ship ${visit.n}: ${count} containers`)
    // Each is the top of its stack when it is lifted: any box above it was lifted before.
    const boxes = visit.design.boxes
    visit.containers.forEach(({ box }, j) => {
      for (let i = 0; i < boxes.length / 4; i++) {
        const above = boxes[4 * i] === boxes[4 * box] && boxes[4 * i + 2] === boxes[4 * box + 2] && boxes[4 * i + 1] > boxes[4 * box + 1]
        if (above) assert.ok(visit.containers.slice(0, j).some((c) => c.box === i), `ship ${visit.n}: box ${box} is under box ${i}`)
      }
    })
  }
})

test('ships alternate berths, and a berth is clear before the next ship comes alongside', () => {
  for (const visit of VISITS) {
    const next = VISITS.find((v) => v.n === visit.n + 2)
    if (!next) continue
    assert.equal(next.side, visit.side)
    assert.notEqual(VISITS.find((v) => v.n === visit.n + 1).side, visit.side)
    assert.ok(visit.away < next.berthed - 180, `ship ${visit.n} leaves at ${visit.away}, ship ${next.n} comes alongside at ${next.berthed - 180}`)
  }
})

test('ships keep clear of the pier and the terminal, and move smoothly', () => {
  // The pier and the terminal (seen from above), and points around a ship's hull at its waterline.
  const solid = [{ x: PIER.edge, z0: -161.5, z1: 84 }, { x: 56, z0: 78, z1: 184 }]
  const hull = (visit, pose) => {
    const { halfBeam, stern, bow } = visit.dims
    const along = { x: Math.sin(pose.heading), z: Math.cos(pose.heading) }
    const points = []
    for (let k = 0; k <= 40; k++) {
      const s = stern + (bow - stern) * k / 40
      for (const b of [-halfBeam, halfBeam]) points.push({ x: pose.x + s * along.x + b * along.z, z: pose.z + s * along.z - b * along.x })
    }
    return points
  }
  for (const visit of VISITS.slice(0, 8)) {
    let previous = null
    for (let t = visit.arrive; t < visit.end; t += 1) {
      const pose = shipPose(visit, t)
      if (previous) assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) < 6, `ship ${visit.n} jumps at ${t}`)
      for (const p of hull(visit, pose)) {
        for (const box of solid) {
          assert.ok(!(Math.abs(p.x) < box.x - 0.01 && p.z > box.z0 && p.z < box.z1), `ship ${visit.n} hits the pier or terminal at ${t}`)
        }
      }
      previous = pose
    }
  }
})

test('each container goes ship, crane, rack, AGV, then into the terminal', () => {
  const order = ['ship', 'crane', 'rack', 'agv', 'gone']
  for (const visit of VISITS.slice(5, 15)) {
    visit.containers.forEach((c, j) => {
      let stage = 0
      for (let t = c.cycle - 10; t < c.cycle + 400; t += 0.5) {
        const where = order.indexOf(containerAt(visit, j, t, SITE).where)
        assert.ok(where >= stage, `ship ${visit.n} container ${j} goes back from ${order[stage]} to ${order[where]} at ${t}`)
        stage = where
      }
      assert.equal(order[stage], 'gone')
    })
  }
})

test('the crane works within its reach, and sets each container down on the rack while no AGV is out', () => {
  for (const visit of VISITS.slice(5, 15)) {
    for (let t = visit.containers[0].cycle; t < visit.leave; t += 1) {
      const crane = craneAt(visit.side, t, SITE)
      const radius = Math.hypot(crane.x - visit.side * CRANE.x, crane.z - CRANE.z)
      assert.ok(radius >= CRANE.reach[0] - 1e-9 && radius <= CRANE.reach[1] + 1e-9, `ship ${visit.n}: hook at ${radius} m at ${t}`)
    }
    visit.containers.forEach((c, j) => {
      const times = containerTimes(visit, j)
      const crane = craneAt(visit.side, times.set - 1, SITE)
      assert.ok(Math.abs(crane.z - RACK_Z) < 1e-9)
      assert.ok(Math.abs(crane.y - CONTAINER.height - (PIER.deck + 1.8)) < 1e-9)
      if (j > 0) assert.ok(containerTimes(visit, j - 1).agvEnd < times.set - 12, `ship ${visit.n}: container ${j} set down while AGV ${j - 1} is out`)
      // While carrying, the AGV is between the rack and the door.
      for (let t = times.agvLift; t < times.agvEnd; t += 1) {
        const agv = agvAt(visit.side, t, SITE)
        if (agv) assert.ok(agv.z >= RACK_Z - 1e-9)
      }
    })
  }
})

test('the ship stays at its berth while the crane works on it', () => {
  for (const visit of VISITS.slice(5, 15)) {
    for (const c of visit.containers) {
      const pose = shipPose(visit, c.cycle + 36)
      assert.equal(pose.x, visit.berth.x)
      assert.equal(pose.z, visit.berth.z)
    }
  }
})

test('there is a ship at the terminal at the start, and a steady stream after', () => {
  for (let t = 0; t < 20000; t += 300) assert.ok(visitsAt(t, SITE).length >= 2, `${visitsAt(t, SITE).length} ships at ${t}`)
  assert.ok(visitsAt(0, SITE).some((v) => craneAt(v.side, 0, SITE).carrying || containerAt(v, 0, 0, SITE).where !== 'ship'))
})

test('the model has its markers, lamps, windows and doors', () => {
  const model = terminalModel(fs.readFileSync(new globalThis.URL('../../models/launcher_ocean_terminal.obj', import.meta.url), 'utf8'))
  assert.ok(model.markers.launcher && model.markers.anchorRear && model.markers.anchorFront)
  assert.equal(model.lamps.length, 24)
  for (const lamp of model.lamps) assert.ok(lamp.direction.y < -0.5)
  assert.equal(model.geometries.terminalWindows.attributes.position.count, 60 * 6)
  assert.equal(model.geometries.terminalDoors.attributes.position.count, 2 * 6)
  assert.ok(model.shaft.top > model.shaft.bottom)
})

test('the underwater terminal has two hemispherical ends, and it and the shaft are smooth-shaded with outward normals', () => {
  const model = terminalModel(fs.readFileSync(new globalThis.URL('../../models/launcher_ocean_terminal.obj', import.meta.url), 'utf8'))
  const outward = (geometry, centreOf) => {
    const p = geometry.attributes.position, n = geometry.attributes.normal
    let smoothCorners = 0
    for (let t = 0; t < p.count; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => [p.getX(t + k), p.getY(t + k), p.getZ(t + k)])
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const length = Math.hypot(...face)
      if (length < 1e-9) continue
      const centre = centreOf(a)
      for (let k = 0; k < 3; k++) {
        const normal = [n.getX(t + k), n.getY(t + k), n.getZ(t + k)]
        const d = (face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2]) / length
        assert.ok(d > 0.5, `normal against its face (${d})`)
        if (d < 0.9999) smoothCorners++
      }
      const out = [a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]]
      assert.ok(face[0] * out[0] + face[1] * out[1] + face[2] * out[2] >= -1e-6 * length * Math.hypot(...out), 'face turned inwards')
    }
    return smoothCorners
  }
  const hull = model.geometries.Underwater_Terminal
  hull.computeBoundingBox()
  const { min, max } = hull.boundingBox
  const radius = (max.y - min.y) / 2, cy = (max.y + min.y) / 2
  const domeCentre = max.z - radius
  // Both end caps lie on hemispheres of the same radius.
  const p = hull.attributes.position
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < min.z + radius - 1e-3) assert.ok(Math.abs(Math.hypot(p.getX(i), p.getY(i) - cy, p.getZ(i) - (min.z + radius)) - radius) < 1e-3)
    if (p.getZ(i) > domeCentre + 1e-3) assert.ok(Math.abs(Math.hypot(p.getX(i), p.getY(i) - cy, p.getZ(i) - domeCentre) - radius) < 1e-3)
  }
  assert.ok(outward(hull, ([, , z]) => [0, cy, Math.min(Math.max(z, min.z + radius), domeCentre)]) > 0)
  assert.ok(outward(model.geometries.Elevator_Shaft, ([, y]) => [model.shaft.x, y, model.shaft.z]) > 0)
})

test('the shaft is centered along the extended hull and pretension fairleads sit together on the outer dome', () => {
  const model = terminalModel(fs.readFileSync(new globalThis.URL('../../models/launcher_ocean_terminal.obj', import.meta.url), 'utf8'))
  const hull = model.geometries.Underwater_Terminal
  hull.computeBoundingBox()
  const { min, max } = hull.boundingBox
  assert.ok(Math.abs((min.z + max.z) / 2 - model.shaft.z) < 1e-4)
  const attachments = terminalPretensionAttachments(model)
  assert.equal(attachments.length, 2)
  assert.equal(attachments[0].distanceTo(attachments[1]), 4)
  const radius = (max.y - min.y) / 2
  for (const p of attachments) {
    assert.ok(p.z > model.shaft.z, 'fairleads face away from the ramp')
    assert.ok(Math.abs(Math.hypot(p.x, p.y - (min.y + max.y) / 2,
      p.z - (max.z - radius)) - radius) < 1e-4, 'fairlead lies on the dome')
  }
})
