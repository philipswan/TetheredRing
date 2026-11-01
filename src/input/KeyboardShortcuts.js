// Keyboard shortcuts. Each binding maps a KeyboardEvent.code to an App method, so the bindings,
// the help text and the implementation cannot drift apart.
export const KEY_BINDINGS = [
  { code: 'KeyO', label: 'O', help: 'Look at the planet centre', action: (app) => app.orbitPlanetCentre() },
  { code: 'KeyI', label: 'I', help: 'Look at the ring centre', action: (app) => app.orbitRingCentre() },
  { code: 'KeyP', label: 'P', help: 'Look at the object or surface point under the mouse (follows moving objects)', action: (app) => app.orbitPointUnderMouse() },
  { code: 'Digit0', label: '0', help: 'Track the nearest launch vehicle', action: (app) => app.camera.toggleTracking(0) },
  { code: 'Digit1', label: '1', help: 'Track the nearest adaptive nut', action: (app) => app.camera.toggleTracking(1) },
  { code: 'Digit2', label: '2', help: 'Track the nearest launch sled', action: (app) => app.camera.toggleTracking(2) },
  { code: 'Digit3', label: '3', help: 'Track the nearest transit vehicle', action: (app) => app.camera.toggleTracking(3) },
  { code: 'Digit4', label: '4', help: 'Track the nearest elevator car', action: (app) => app.camera.toggleTracking(4) },
  { code: 'Digit5', label: '5', help: 'Track the launcher coil centre marker', action: (app) => app.camera.toggleTracking(5) },
  { code: 'Digit6', label: '6', help: 'Log a count of scene objects by name to the console', action: (app) => app.logObjectCounts() },
  { code: 'Digit7', label: '7', help: 'Analyse terrain clearance under the launcher ramp (console)', action: (app) => app.analyseLauncherTerrain() },
  { code: 'Digit8', label: '8', help: 'Place the Moon (or Earth, on the Moon) in view behind the camera target', action: (app) => app.placeCompanionBodyInView() },
  { code: 'Digit9', label: '9', help: 'Toggle stationary tracking (camera stays put and turns to follow)', action: (app) => app.toggleStationaryTracking() },
  { code: 'Escape', label: 'Esc', help: 'Stop following the tracked object', action: (app) => app.stopTracking() },
  { code: 'KeyQ', label: 'Q', help: 'Toggle auto-rotation around the orbit target', action: (app) => app.toggleAutoRotate() },
  { code: 'KeyR', label: 'R', help: 'Raise the ring (or deploy the evacuated tube)', action: (app) => app.toggleRaise(+1) },
  { code: 'KeyL', label: 'L', help: 'Lower the ring (or retract the evacuated tube)', action: (app) => app.toggleRaise(-1) },
  { code: 'KeyU', label: 'U', help: 'Climb: increase the camera altitude rate (press repeatedly)', action: (app) => app.adjustClimbRate(+0.1) },
  { code: 'KeyD', label: 'D', help: 'Descend: decrease the camera altitude rate (press repeatedly)', action: (app) => app.adjustClimbRate(-0.1) },
  { code: 'KeyZ', label: 'Z', help: 'Toggle slow zoom in', action: (app) => app.toggleZoom(-1) },
  { code: 'KeyX', label: 'X', help: 'Toggle slow zoom out', action: (app) => app.toggleZoom(+1) },
  { code: 'KeyW', label: 'W', help: 'Warp the camera to the selected camera preset (Camera folder)', action: (app) => app.warpToCameraPreset() },
  { code: 'KeyN', label: 'N', help: 'Print the camera position as preset code (console)', action: (app) => app.printCameraPosition() },
  { code: 'KeyV', label: 'V', help: 'Toggle locking "up" to the ring axis when retargeting', action: (app) => app.toggleLockUpToRingAxis() },
  { code: 'KeyE', label: 'E', help: 'Toggle following the elevator cars up and down', action: (app) => app.toggleFollowElevators() },
  { code: 'KeyC', label: 'C', help: 'Toggle following the transit vehicles around the ring', action: (app) => app.toggleFollowTransitVehicles() },
  { code: 'KeyJ', label: 'J', help: 'Move the camera to the start of the launch trajectory', action: (app) => app.moveToLaunchTrajectory() },
  { code: 'KeyS', label: 'S', help: 'Recompute the engineering specs summary', action: (app) => app.updateSpecsSummary() },
  { code: 'KeyF', label: 'F', help: 'Cycle illustration settings', action: (app) => app.cycleIllustrationSettings() },
  { code: 'KeyM', label: 'M', help: 'Move the launcher ramp to the next mountain in the mountain list', action: (app) => app.nextMountainLaunchSite() },
  { code: 'KeyH', label: 'H', help: 'Sweep ramp acceleration and log launcher cost/length (console)', action: (app) => app.runRampAccelerationSweep() },
  { code: 'KeyT', label: 'T', help: 'Switch the Earth imagery between the original and new tile sets (A/B)', action: (app) => app.toggleEarthTiles() },
  { code: 'KeyY', label: 'Y', help: 'Start/stop the launch trajectory trial sweep (console)', action: (app) => app.toggleLaunchTrialSweep() },
  { code: 'KeyG', label: 'G', help: 'Play/stop camera path from a Google Earth Studio JSON export', action: (app) => app.toggleGoogleEarthCamera() },
  { code: 'KeyA', label: 'A', help: 'Shot: add a camera keyframe at the playhead from the current view', action: (app) => app.shots.addKeyframe() },
  { code: 'KeyK', label: 'K', help: 'Shot: delete the selected keyframe', action: (app) => app.shots.deleteKeyframe() },
  { code: 'KeyB', label: 'B', help: 'Shot: switch between the free view and the shot camera', action: (app) => app.shots.setViewMode(app.shots.viewMode === 'shot' ? 'free' : 'shot') },
  { code: 'Comma', label: ',', help: 'Shot: back one frame', action: (app) => app.shots.stepFrames(-1) },
  { code: 'Period', label: '.', help: 'Shot: forward one frame', action: (app) => app.shots.stepFrames(1) },
  { code: 'Space', label: 'Space', help: 'Play / pause (the shot playhead, which drives the simulated time)', action: (app) => app.togglePause() },
]

export function keyboardHelpText() {
  return KEY_BINDINGS.map(b => `${b.label.padEnd(6)} ${b.help}`).join('\n')
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function installKeyboardShortcuts(app, target = document) {
  const byCode = new Map(KEY_BINDINGS.map(b => [b.code, b]))
  const onKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
    const binding = byCode.get(event.code)
    if (!binding) return
    event.preventDefault()
    binding.action(app, event)
  }
  target.addEventListener('keydown', onKeyDown)
  return () => target.removeEventListener('keydown', onKeyDown)
}
