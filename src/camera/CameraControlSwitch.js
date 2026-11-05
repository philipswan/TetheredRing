// Switches between two camera control schemes at run time (the cameraControlScheme parameter):
//
//   classic  ClassicCameraController: three's orbit controls (modified for a local "up") about an orbit
//            target, number-key tracking and tweened retargeting. The original scheme.
//   smart    CameraController: rigs, transitions and pointer gestures that act on what the user means
//            (see the top of CameraController.js).
//
// Both are built over the same camera and canvas; only the active one takes input and moves the camera.
// The rest of the app keeps talking to `app.camera`, which is a Proxy forwarding every property and
// method to the active controller, so nothing else needs to know which one it is. Switching hands the
// current view (and the keyboard-driven motions) to the other controller, so the picture does not jump;
// anything followed is let go.

export const CAMERA_SCHEMES = { 'Classic (orbit controls)': 'classic', 'Smart (new)': 'smart' }

// Plain values the app sets on the controller, carried over on a switch.
const SHARED_VALUES = ['zoomDirection', 'climbRate', 'followElevator', 'followTransitAngularSpeed', 'lockUpToRingAxis', 'stationaryTracking', 'tweeningTime']
// Vectors the app changes in place (camera.ringAxis.set(...)), copied over on a switch.
const SHARED_VECTORS = ['ringAxis', 'followTransitAxis']
// Set on both controllers whenever the app sets them on the active one.
const BOTH = new Set(['trackingReleased'])

// The classic scheme orbits about an "up" through its target: the local vertical there (or the planet's
// axis for a target near the planet's centre, as the O key sets). The orbit controls cannot turn about
// an up along the view (dragging would only spin the picture), so where that is nearly so, the planet's
// axis, or else the camera's own up, is used instead.
function classicOrbitUp(view, smart) {
  const unit = ([x, y, z]) => {
    const l = Math.hypot(x, y, z)
    return l > 0 ? [x / l, y / l, z / l] : null
  }
  const along = unit(view.target.map((t, i) => t - view.position[i]))
  const vertical = Math.hypot(...view.target) > 1e6 ? unit(view.target) : null
  const polar = smart.polarAxis?.().toArray() ?? [0, 1, 0]
  for (const up of [vertical, polar, view.up]) {
    if (up && (!along || Math.abs(up[0] * along[0] + up[1] * along[1] + up[2] * along[2]) < 0.95)) return up
  }
  return view.up
}

export function createCameraControlSwitch({ classic, smart, scheme = 'classic' }) {
  const controllers = { classic, smart }
  const state = {
    active: controllers[scheme] ?? classic,
    get scheme() { return state.active === smart ? 'smart' : 'classic' },
    get isClassic() { return state.active === classic },
    controllers,

    // Makes `name` ('classic' or 'smart') the active scheme.
    setScheme(name) {
      const next = controllers[name]
      const previous = state.active
      if (!next || next === previous) return
      previous.stopTracking?.()
      for (const key of SHARED_VALUES) next[key] = previous[key]
      for (const key of SHARED_VECTORS) next[key]?.copy?.(previous[key])
      next.controls.autoRotate = previous.controls.autoRotate
      next.controls.autoRotateSpeed = previous.controls.autoRotateSpeed
      next.playbackActive = previous.playbackActive
      if ('lastSunFrame' in next) next.lastSunFrame = null // (the sun has moved on while it was idle)
      const view = previous.getState()
      if (next === classic) view.orbitUp = classicOrbitUp(view, previous)
      next.controls.stopMotion?.()
      previous.controls.stopMotion?.()
      next.setState(view)
      previous.controls.enabled = false
      next.controls.enabled = !previous.playbackActive
      for (const marker of [previous.trackingMarker, previous.targetMarker, previous.orbitMarker]) if (marker) marker.visible = false
      state.active = next
    },
  }
  for (const controller of Object.values(controllers)) controller.controls.enabled = controller === state.active

  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key]
      const value = target.active[key]
      return typeof value === 'function' ? value.bind(target.active) : value
    },
    set(target, key, value) {
      if (key === 'active') target.active = value
      else if (BOTH.has(key)) for (const c of Object.values(controllers)) c[key] = value
      else target.active[key] = value
      return true
    },
    has(target, key) {
      return key in target || key in target.active
    },
  })
}
