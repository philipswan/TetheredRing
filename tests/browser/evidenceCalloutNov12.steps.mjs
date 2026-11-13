/* global window */
const view = {
  preset: 'EvidenceLedgerLinks', time: 27.3076, sunDayOfYear: 131, sunTimeOfDayUTC: 4,
  camera: {position: [-1702089.283, 2127242.916, -5764189.077],
    target: [-1702692.061, 2127737.861, -5763780.44],
    up: [-0.267108, 0.333736, -0.904032], orbitUp: [-0.267108, 0.333736, -0.904032], fov: 45},
  parameters: {sunDayOfYear: 131},
}
export default async function ({page, screenshot}) {
  await page.waitForFunction(() => window.tetheredRing?.app?.evidenceCallouts, {timeout: 120000})
  await page.evaluate(async view => {
    const {applyViewState} = await import('/src/ui/ViewStatus.js')
    const app = window.tetheredRing.app
    applyViewState(app, view); app.step(0); app.render()
  }, view)
  await new Promise(resolve => setTimeout(resolve, 12000))
  console.log(JSON.stringify(await page.evaluate(async () => {
    const app = window.tetheredRing.app, labels = app.evidenceCallouts
    const {Vector2, Raycaster} = await window.tetheredRing.THREE
    const {projectCallout} = await import('/src/scene/EvidenceLedgerCallouts.js')
    const size = app.renderer.getSize(new Vector2())
    const accept = labels.motion.accept
    labels.motion.accept = () => true
    app.step(0); app.render()
    let candidates = labels.candidates(size.x, size.y)
    await new Promise(resolve => setTimeout(resolve, 1000))
    app.render()
    candidates = labels.candidates(size.x, size.y)
    const cylinder = app.scene.getObjectByName('elevatorShaft')
    const bounds = cylinder && labels.nodeBounds(cylinder)
    const tubes = []
    app.scene.traverseVisible(node => {if (['massDriverTubeSegment', 'massDriverTubeLine'].includes(node.name)) tubes.push(node)})
    const cards = labels.visibleCallouts.map(c => ({id:c.id, source:c.source, x:c.x, y:c.y, rect:c.rect, leader:c.leader}))
    const tubeCard = labels.visibleCallouts.find(c => c.targetId === 'evacuatedTube')
    let tubeHit
    if (tubeCard) {
      const tip = tubeCard.leader[0], ray = new Raycaster()
      ray.setFromCamera(new Vector2(tip.x / size.x * 2 - 1, 1 - tip.y / size.y * 2), app.camera3d)
      ray.params.Line.threshold = 0.25
      tubeHit = ray.intersectObjects(tubes).length
    }
    const cables = []
    app.scene.traverseVisible(node => {
      if (['mooringCableLines', 'anchorCableLines', 'pretensionCableLines'].includes(node.name)) cables.push({name:node.name, count:node.geometry.attributes.position.count})
    })
    const result = {candidates:candidates.map(c=>({id:c.id,source:c.source,x:c.x,y:c.y,pixels:c.pixels,outline:c.outline})),
      cards, tubeHit, tubeMeshes:tubes.length, cables,
      parameters:Object.fromEntries(['launcherMassDriverTubeInnerRadius','exagerateNonElevatedTubeFactor','launcherVisualRadiusScale','launchVehicleBodyLength','launchVehicleNoseconeLength'].map(key=>[key,app.d[key].value])),
      curves:['massDriver1Curve','massDriver2Curve','evacuatedTubeCurve'].map(key=>({key,length:app.launchSystem[key]?.getLength(),start:app.launchSystem[key]?.getPointAt(0).toArray()})),
      cylinder:bounds && {position:bounds.position.toArray(),diameter:bounds.diameter,
        ndc:bounds.position.clone().project(app.camera3d).toArray(),
        projection:projectCallout(bounds.position,bounds.diameter,app.camera3d,size.x,size.y)},
      camera:app.camera.getState()}
    for (const id of ['evacuatedTube', 'mooring', 'terminal']) {
      if (!cards.some(card => card.id === `label:${id}`)) throw new Error(`Missing ${id} label in the reported view: ${JSON.stringify(result)}`)
    }
    if (!(tubeHit > 0)) throw new Error(`Evacuated tube leader does not touch rendered tube geometry: ${JSON.stringify(result)}`)
    labels.motion.accept = accept
    return {labels: cards.map(card=>card.id), tubeHit, camera: result.camera, cableSets: cables.length}
  })))
  await screenshot('view')
}
