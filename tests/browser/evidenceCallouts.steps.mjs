/* global window, document */
export default async function ({ page }) {
  await page.waitForFunction(() => window.tetheredRing?.app?.evidenceCallouts, { timeout: 120000 })
  await page.waitForFunction(() => window.tetheredRing.app.evidenceCallouts.visibleCallouts?.some(c => c.type === 'object'), {timeout: 30000})
  console.log(await page.evaluate(async () => {
    const app = window.tetheredRing.app, labels = app.evidenceCallouts
    const {leadersCross, leaderHitsRect} = await import('/src/scene/EvidenceLedgerCallouts.js')
    const checkLeaders = () => {
      for (const [i, card] of labels.visibleCallouts.entries()) {
        const [tip, elbow] = card.leader
        const dx = tip.x - card.x, dy = tip.y - card.y
        if (Math.abs(dx * (elbow.y - card.y) - dy * (elbow.x - card.x)) > 1e-5) throw new Error('Leader no longer points toward its object centre')
        for (const other of labels.visibleCallouts.slice(i + 1)) {
          if (leadersCross(card.leader, other.leader) || leaderHitsRect(card.leader, other.rect) || leaderHitsRect(other.leader, card.rect)) throw new Error('Callout leaders cross or pass through another card')
        }
      }
    }
    if (!app.d.showLiftFans.value) throw new Error('Lift fans were not reenabled')
    if (!app.d.showObjectLabels.value || !app.d.showEvidenceLedgerLinks.value) throw new Error('Preset flags missing')
    const buttons = document.querySelectorAll('.evidence-topic-button')
    if (buttons.length !== 3) throw new Error('Only Economy, Environment and Industry retain project-wide claims')
    checkLeaders()
    buttons[0].click()
    if (!document.querySelector('.evidence-claim-panel a[href*="evidence-ledger"]')) throw new Error('Economy claim links missing')
    labels.closeDetails()
    const dock = labels.dock
    const blocked = labels.blockedRects(labels.canvas.width / Math.min(2, app.renderer.getPixelRatio()), labels.canvas.height / Math.min(2, app.renderer.getPixelRatio()))
    if (blocked.some(r => dock.x < r.x + r.width && dock.x + dock.width > r.x && dock.y < r.y + r.height && dock.y + dock.height > r.y)) throw new Error('Fixed claim icons hidden by UI')
    const visible = labels.visibleCallouts.map(c => `${c.type}: ${c.label}`)
    if (labels.visibleCallouts.some(c => !['object', 'claim'].includes(c.type) || (c.type === 'object' && c.claims.length))) throw new Error('Object labels and claims must be separate callouts')
    for (const card of labels.visibleCallouts.filter(c => c.type === 'claim')) {
      if (card.titleLines.join(' ') !== card.claims[0].title) throw new Error('Claim title was truncated')
      if (card.claims.some(c => c.label === 'Sonic-boom exposure')) throw new Error('Sonic boom shown while still in the launch tube')
    }
    app.store.set('showEvidenceLedgerLinks', false); app.store.derive(); app.render()
    if (!labels.links.hidden) throw new Error('Links toggle did not hide interactive links')
    if (labels.visibleCallouts.some(c => c.claims.length)) throw new Error('Labels-only mode retained claim cards')
    app.store.set('showObjectLabels', false); app.store.derive(); app.render()
    if (labels.visibleCallouts.length) throw new Error('Both flags off retained labels')
    app.store.set('showEvidenceLedgerLinks', true); app.store.derive(); app.render()
    if (labels.visibleCallouts.some(c => !c.claims.length)) throw new Error('Claims-only mode retained unrelated components')
    app.store.set('showObjectLabels', true); app.store.derive(); app.render()
    const Vehicle = app.launchSystem.movingObjectClass('virtualLaunchVehicles')
    const shownVehicle = labels.visibleCallouts.find(c => c.targetId === 'vehicle')
    const obj = [...Vehicle.activeObjects.values()].find(obj => obj.model?.uuid === shownVehicle?.source.split('/')[0]) ?? [...Vehicle.activeObjects.values()].find(obj => obj.model?.visible)
    if (!obj) throw new Error('No spacecraft available for orbit regression')
    const beforeOrbit = app.camera.getState(), accept = labels.motion.accept
    const centre = app.planetCoordSys.localToWorld(obj.getFutureFrame(Vehicle.refFrames[0], 0).position.clone())
    const upAxis = centre.clone().normalize()
    const initialOffset = app.camera3d.position.clone().sub(centre)
    try {
      labels.motion.accept = () => true
      for (const angle of [0.4, 0.9, 1.4, 2.1, 2.8]) {
        const position = centre.clone().add(initialOffset.clone().applyAxisAngle(upAxis, angle))
        app.camera.setState({position: position.toArray(), target: centre.toArray(), up: upAxis.toArray()})
        app.step(0); app.render()
        const anchor = labels.candidates(1280, 720).find(c => c.id === 'vehicle')
        if (!anchor) throw new Error('Spacecraft anchor lost while orbiting')
        const anchored = [...Vehicle.activeObjects.values()].find(obj => obj.model?.uuid === anchor.source.split('/')[0])
        if (!anchored) throw new Error('Anchor points to a pooled model without an active spacecraft')
        const hull = anchored.model.getObjectByName('launchVehicle_body')
        if (!hull?.geometry) throw new Error('No rendered hull for attachment comparison')
        if (!hull.geometry.boundingBox) hull.geometry.computeBoundingBox()
        const box = hull.geometry.boundingBox
        // Measure the rendered hull, independently of the trajectory/anchor adapter.
        const currentCentre = hull.localToWorld(centre.clone().set(0, (box.min.y + box.max.y) / 2, 0))
        if (anchor.position.distanceTo(currentCentre) > 1e-5) throw new Error('Anchor detached from spacecraft during orbit')
        const ndc = currentCentre.project(app.camera3d)
        if (Math.hypot(anchor.x - (ndc.x + 1) * 640, anchor.y - (1 - ndc.y) * 360) > 0.01) throw new Error('Leader did not reproject during orbit')
        checkLeaders()
      }
    } finally { labels.motion.accept = accept; app.camera.setState(beforeOrbit); app.step(0); app.render() }
    // Exercise the user's example at its actual tube endpoint, not a mock object.
    app.shots.pause(); app.clock.paused = true
    const savedCamera = app.camera.getState()
    const curve = app.launchSystem.evacuatedTubeCurve
    const target = app.planetCoordSys.localToWorld(curve.getPointAt(1))
    const up = target.clone().normalize()
    const side = curve.getTangentAt(1).cross(up).normalize()
    app.camera.setState({ position: target.clone().addScaledVector(side, 250).addScaledVector(up, 80).toArray(), target: target.toArray(), up: up.toArray() })
    app.step(0); app.render()
    await new Promise(resolve => window.setTimeout(resolve, 350))
    app.render()
    const airlock = labels.visibleCallouts.find(c => c.type === 'claim' && c.targetId === 'airlock')
    const closeCamera = app.camera.getState()
    app.camera.setState({position: target.clone().addScaledVector(side, 25000).addScaledVector(up, 8000).toArray(), target: target.toArray(), up: up.toArray()})
    app.step(0); app.render()
    const motionAccept = labels.motion.accept
    let overviewCandidates
    try {
      // The camera just jumped between scales; test range eligibility independently of its settling delay.
      labels.motion.accept = () => true
      overviewCandidates = labels.candidates(1280, 720)
    } finally { labels.motion.accept = motionAccept }
    if (!overviewCandidates.some(c => c.id === 'tube' && c.label === 'Elevated Evacuated Tube')) throw new Error('Elevated tube section label missing at overview range')
    app.camera.setState(closeCamera); app.step(0); app.render()
    await new Promise(resolve => window.setTimeout(resolve, 350))
    app.render()
    if (!labels.visibleCallouts.some(c => c.type === 'object' && c.targetId === 'airlock')) throw new Error('Separate airlock object label missing')
    if (!airlock?.claims.some(c => c.url.endsWith('53c2c9'))) throw new Error('Exit-airlock claim did not follow the tube endpoint')
    checkLeaders()
    // A fresh recording/regeneration frame must not need motion history.
    const savedMode = app.shots.mode, savedPoseAt = app.shots.poseAt
    const heldCamera = app.camera.getState()
    try {
      app.shots.mode = 'render'; app.shots.poseAt = () => heldCamera
      labels.motion.samples.clear(); app.render()
      if (!labels.visibleCallouts.some(c => c.type === 'claim' && c.targetId === 'airlock')) throw new Error('Recording resumed with a label gap')
    } finally { app.shots.mode = savedMode; app.shots.poseAt = savedPoseAt }
    // Review the new geography association against the real terrain and camera.
    const {geodeticToECEF} = await import('/src/physics/geodesy.js')
    const site = app.nonGUIParams.evidenceLedgerSite
    const p = geodeticToECEF(site.lat, site.lon, site.altitude * app.d.terrainExaggeration.value + 10, app.planetSpec.ellipsoid)
    const summit = app.planetCoordSys.localToWorld(target.clone().set(p.x, p.y, p.z))
    const summitUp = summit.clone().normalize(), summitSide = side.clone().normalize()
    const savedAccept = labels.motion.accept
    try {
      labels.motion.accept = () => true
      for (const angle of [0, 0.6, 1.2]) {
        const offset = summitSide.clone().multiplyScalar(20000).applyAxisAngle(summitUp, angle).addScaledVector(summitUp, 40000)
        app.camera.setState({position: summit.clone().add(offset).toArray(), target: summit.toArray(), up: summitUp.toArray()})
        app.step(0); app.render()
        const mountain = labels.candidates(1280, 720).find(c => c.id === 'mountain')
        if (!mountain?.claims.some(c => c.url.includes('a-suitable-site'))) throw new Error('Site-suitability claim not associated with visible Mauna Kea')
        if (mountain.position.distanceTo(summit) > 1e-5) throw new Error('Mountain anchor moved while orbiting')
        checkLeaders()
      }
    } finally {labels.motion.accept = savedAccept; app.camera.setState(heldCamera); app.step(0); app.render()}
    const captureMode = app.shots.mode
    app.shots.mode = 'live'; app.render()
    const withLabels = app.renderer.domElement.toDataURL()
    app.store.set('showObjectLabels', false); app.store.set('showEvidenceLedgerLinks', false); app.store.derive(); app.render()
    if (withLabels === app.renderer.domElement.toDataURL()) throw new Error('Callouts were not drawn into the recordable canvas')
    app.store.set('showObjectLabels', true); app.store.set('showEvidenceLedgerLinks', true); app.store.derive()
    app.shots.mode = captureMode
    app.camera.setState(savedCamera); app.step(0); app.render()
    return { preset: app.presetId, visible, exitAirlockClaim: true, mountainAssociation: true, recordedOverlay: true }
  }))
}
