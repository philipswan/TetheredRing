/* global window */
// npm run smoke -- --url-params "preset=toMarsHawaii&quality=low" --steps tests/browser/stashingFacility.steps.mjs
export default async function ({page}) {
  const report = await page.evaluate(async () => {
    const {launchSystem: l, app} = window.tetheredRing
    if (!l?.stashingFacility) throw new Error('Missing stashing facility')
    // Exercise the asynchronous terrain rebuild with a known mountain portal.
    const { ecefToGeodetic } = await import('/src/physics/geodesy.js')
    const ramp = l.launchRampCurve[1]
    const desiredPortal = l.stashingRampDistance - 100
    const portalPoint = ramp.getPointAt(desiredPortal / ramp.getLength())
    const portal = ecefToGeodetic(portalPoint.x, portalPoint.y, portalPoint.z, l.planetSpec.ellipsoid)
    const oldHeight = l.fixedTerrainHeight
    l.fixedTerrainHeight = async () => portal.alt
    l.updateTerrainFits()
    await l.terrainReady
    l.fixedTerrainHeight = oldHeight
    if (l.stashingRampDistance <= desiredPortal) throw new Error('Facility did not move uphill past the mountain exit')
    const screwEnd = l.launchScrewRampCurve.getLength()
    if (!(screwEnd < l.adaptiveNutRampStopDistance)) throw new Error('Braking screws extend through the electromagnetic stop section')
    if (Math.abs(l.adaptiveNutElectromagneticEntrySpeed - 200) > 1e-4) throw new Error('Electromagnetic handoff is not at 200 m/s')
    if (Math.abs(l.polyCurveForrf0.getLength() - l.massDriver2Curve.getLength() - screwEnd) > 1e-3) throw new Error('Screw path did not shorten to handoff')
    const f = l.stashingFacility
    const spacing = app.d.launchVehicleSpacingInSeconds.value
    const count = app.d.launcherStagedLaunches.value || f.capacity
    const latestStop = Math.max(...Object.values(f.components).map(c => c.stopTime))
    const update = time => f.update({time, spacing, firstLaunch: 0, lastLaunch: count - 1})
    update(latestStop + (count - 1) * spacing + 15)
    if (f.entries.size !== count * 2) throw new Error(`Expected ${count*2} parked models; got ${f.entries.size}`)
    f.root.updateWorldMatrix(true, true)
    const inverse = f.root.matrixWorld.clone().invert()
    let vertices = 0
    for (const {model} of f.entries.values()) model.traverse(node => {
      if (!node.geometry) return
      const points = node.geometry.attributes.position
      if (!points) return
      // Instanced parts carry a bounding box including their posed instances.
      const matrix = inverse.clone().multiply(node.matrixWorld)
      const box = node.isInstancedMesh ? (node.computeBoundingBox(), node.boundingBox) :
        (node.geometry.computeBoundingBox(), node.geometry.boundingBox)
      const b = box.clone().applyMatrix4(matrix)
      const padded = f.plan.bounds.clone().expandByScalar(0.01)
      if (!padded.containsBox(b)) throw new Error('A parked component intersects a facility wall')
      vertices += points.count
    })
    if (vertices === 0) throw new Error('Storage models have no geometry')
    update(-1)
    if (f.entries.size) throw new Error('Rewind left stored models behind')
    update(latestStop + (count - 1) * spacing + 15)
    const nut = f.components.nut
    update(nut.stopTime + 5)
    const entry = f.entries.get('nut:0')
    const centre = nut.localCentre.clone().applyQuaternion(entry.model.quaternion).add(entry.model.position)
    if (centre.distanceTo(nut.startCentre) > 1e-5) throw new Error('Nut moved during five-second hold')
    update(nut.stopTime + 10)
    const middle = nut.localCentre.clone().applyQuaternion(entry.model.quaternion).add(entry.model.position)
    if (Math.abs(middle.z - f.plan.transferHeights.nut) > 1e-4) throw new Error('Crane horizontal traverse changed height')
    if (middle.z - f.layoutInput.halfSizes.nut.z < f.layoutInput.tubeTop + 0.5 - 1e-4) throw new Error('Nut has not cleared tube and walls')
    const expectedMiddle = nut.startCentre.clone().lerp(f.plan.slots.nut[0], 0.5)
    if (Math.abs(middle.x - expectedMiddle.x) > 1e-4 || Math.abs(middle.y - expectedMiddle.y) > 1e-4) throw new Error('Horizontal crane timing is wrong')
    update(nut.stopTime + 6.5)
    const lifting = nut.localCentre.clone().applyQuaternion(entry.model.quaternion).add(entry.model.position)
    if (Math.abs(lifting.x - nut.startCentre.x) > 1e-4 || Math.abs(lifting.y - nut.startCentre.y) > 1e-4) throw new Error('Crane lift is not vertical')
    update(nut.stopTime + 13.5)
    const lowering = nut.localCentre.clone().applyQuaternion(entry.model.quaternion).add(entry.model.position)
    if (Math.abs(lowering.x - f.plan.slots.nut[0].x) > 1e-4 || Math.abs(lowering.y - f.plan.slots.nut[0].y) > 1e-4) throw new Error('Crane lowering is not vertical')
    if (!(lowering.z < f.plan.transferHeights.nut && lowering.z > f.plan.slots.nut[0].z)) throw new Error('Crane did not lower hardware into its slot')
    if (entry.model.quaternion.angleTo(nut.startOrientation) > 1e-6) throw new Error('Storage transfer rotated the nut')
    if (f.box.geometry.index.count !== 36) throw new Error('Facility must have a containing roof')
    const tangent = l.launchRampCurve[1].getTangentAt(l.stashingRampDistance / l.launchRampCurve[1].getLength())
    const localForward = f.root.quaternion.clone()
    const forwardAxis = f.root.position.clone().set(0, 1, 0).applyQuaternion(localForward)
    if (forwardAxis.dot(tangent) < 1 - 1e-6) throw new Error('Facility is not aligned to its SuperCurve')
    if (!f.plan.bounds.containsBox(f.plan.tubeBounds)) throw new Error('Facility does not encompass the tube')
    for (const kind of ['nut', 'sled']) {
      const component = f.components[kind]
      for (let i = 0; i <= 40; i++) {
        update(component.stopTime + 5 + i / 4)
        const model = f.entries.get(`${kind}:0`).model
        const centre = component.localCentre.clone().applyQuaternion(model.quaternion).add(model.position)
        const half = f.layoutInput.halfSizes[kind]
        for (const axis of ['x', 'y', 'z']) if (centre[axis] - half[axis] < f.plan.bounds.min[axis] - 0.01
          || centre[axis] + half[axis] > f.plan.bounds.max[axis] + 0.01) throw new Error('Crane transfer escaped facility box')
      }
    }
    for (let ix = 0; ix <= 8; ix++) for (let iy = 0; iy <= 8; iy++) {
      const position = f.root.position.clone().set(
        f.plan.bounds.min.x + (f.plan.bounds.max.x - f.plan.bounds.min.x) * ix / 8,
        f.plan.bounds.min.y + (f.plan.bounds.max.y - f.plan.bounds.min.y) * iy / 8, f.plan.bounds.min.z)
        .applyQuaternion(f.root.quaternion).add(f.root.position)
      const geo = ecefToGeodetic(position.x, position.y, position.z, l.planetSpec.ellipsoid)
      if (geo.alt < portal.alt + 0.49) throw new Error('Facility footprint remains below ground')
    }
    return {capacity: f.capacity, count, vertices, station: l.stashingRampDistance,
      nutStop: l.adaptiveNutRampStopDistance, sledReturn: l.launchSledCoastBackToRampTime,
      size: f.plan.size.toArray(), terrainFitted: l.stashingSiteOverride?.key === l.stashingSiteKey}
  })
  console.log('Stashing lifecycle:', JSON.stringify(report))
}
