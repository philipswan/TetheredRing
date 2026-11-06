import * as THREE from 'three'
import * as TWEEN from '@tweenjs/tween.js'
import { OrbitControls } from './OrbitControlsModified.js'
import { ObjectTracker, TRACKABLE_TYPES } from './ObjectTracker.js'

const _offset = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _q = new THREE.Quaternion()

// Everything that moves the camera: orbit controls, object tracking, tweened moves, the zoom/climb
// animations and the follow-elevator/transit modes. Interactive zoom and retargeting use real time,
// or an explicit fixed step during a live take; object motion follows simulated time.
//
// The orbit controls are a modified copy of three's OrbitControls with an `upDirection`, so the
// camera can orbit around a local vertical anywhere on the planet instead of the world Y axis.
export class ClassicCameraController {
  // app provides: scene, camera, domElement, planetRadius, store (parameters), nonGUIParams,
  //               planetCoordSys, getContext() for the object tracker
  constructor({ camera, domElement, planetRadius, store, nonGUIParams, getTrackerContext, enableVR }) {
    this.camera = camera
    this.planetRadius = planetRadius
    this.store = store
    this.nonGUIParams = nonGUIParams
    this.enableVR = enableVR
    this.tweens = new TWEEN.Group()
    this.tweeningTime = 2000 // ms
    this.tweeningActive = false
    // Number keys and P stay responsive independently of the shot's time warp or playback rate.
    this.tweenClockMs = 0
    this.lastWallMs = null

    this.controls = new OrbitControls(camera, domElement)
    this.controls.enableDamping = true
    this.controls.autoRotateSpeed = store.derived.orbitControlsRotateSpeed.value

    this.tracker = new ObjectTracker(getTrackerContext)
    this.stationaryTracking = false // '9' key: keep the camera still and pan to follow the object
    this.lastTrackingPoint = null
    this.lastTrackingFrame = null

    this.zoomDirection = 0 // -1 zoom in, +1 zoom out ('Z'/'X')
    this.climbRate = 0 // fraction of altitude per second ('U'/'D')
    this.followElevator = null // () => distance from planet centre, set by the app
    this.followTransitAngularSpeed = 0 // rad/s about followTransitAxis
    this.followTransitAxis = new THREE.Vector3(0, 1, 0)
    this.lockUpToRingAxis = false
    this.ringAxis = new THREE.Vector3(0, 1, 0)
    this.playbackActive = false // true while a shot drives the camera

    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x3f3f4f })
    this.trackingMarker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), markerMaterial)
    this.trackingMarker.name = 'trackingPointMarker'
    this.trackingMarker.visible = false
    this.targetMarker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x0000ff }))
    this.targetMarker.name = 'targetPointMarker'
    this.targetMarker.visible = false
    this.orbitMarker = new THREE.Mesh(new THREE.SphereGeometry(5 / 7, 16, 16), new THREE.MeshLambertMaterial({ color: 0x00ff00, transparent: true, opacity: 0.15 }))
    this.orbitMarker.name = 'orbitControlsMarker'
    this.orbitMarker.visible = false
  }

  addMarkersTo(parent) {
    parent.add(this.trackingMarker, this.targetMarker, this.orbitMarker)
  }

  // Initial placement from preset options (relative to a reference point such as the launcher).
  placeInitially(referencePoint) {
    const n = this.nonGUIParams
    const c = this.controls
    c.target.copy(referencePoint).add(n.orbitControlsTarget ?? new THREE.Vector3())
    c.object.position.copy(referencePoint).add(n.orbitControlsObjectPosition ?? new THREE.Vector3(0, 0, -30 * this.planetRadius / 8))
    if (c.target.lengthSq() > 0) c.upDirection.copy(c.target).normalize()
    if (n.orbitControlsUpDirection) c.upDirection.copy(n.orbitControlsUpDirection)
    this.camera.up.copy(n.cameraUp ?? c.upDirection)
    c.update()
    this.updateClippingPlanes()
  }

  // ---- Shots ---------------------------------------------------------------------------------

  getState() {
    const c = this.controls
    return {
      position: this.camera.position.toArray(),
      target: c.target.toArray(),
      up: this.camera.up.toArray(),
      orbitUp: c.upDirection.toArray(),
      fov: this.camera.fov,
    }
  }

  setState(state) {
    this.cancelTween()
    this.lastTrackingPoint = null
    this.lastTrackingFrame = null
    const c = this.controls
    this.camera.position.fromArray(state.position)
    c.target.fromArray(state.target)
    this.camera.up.fromArray(state.up)
    c.upDirection.fromArray(state.orbitUp ?? state.up)
    if (state.fov && state.fov !== this.camera.fov) {
      this.camera.fov = state.fov
      this.camera.updateProjectionMatrix()
    }
    this.camera.lookAt(c.target)
    this.updateClippingPlanes()
  }

  // ---- Tracking ------------------------------------------------------------------------------

  // Number keys: track the nearest object of TRACKABLE_TYPES[index]; pressing again releases it.
  toggleTracking(index, { toggle = true } = {}) {
    const type = TRACKABLE_TYPES[index]
    if (!type) return false
    if (toggle && this.tracker.type === type) {
      this.stopTracking()
      return true
    }
    if (!this.tracker.findNearest(type, this.camera.position)) return false
    return this.tweenToTrackedObject()
  }

  // ---- The calls the rest of the app makes of the smart controller (CameraController), done the
  // classic way, so either can be switched in (CameraControlSwitch).

  get isClassic() { return true }
  get focus() { return this.controls.target }
  get tracking() { return this.tracker.target !== null }

  // Follows an object (entry: { getPosition(dt), getFrame(dt) }, world): as the number keys do. With
  // `aim` (or `approach`), the orbit target moves to it.
  follow(entry, { aim = true, approach = false, trackerTarget = entry } = {}) {
    this.tracker.target = trackerTarget
    this.lastTrackingPoint = null
    this.lastTrackingFrame = null
    this.cancelTween()
    if (aim || approach) return this.tweenToTrackedObject()
    return true
  }

  stopTracking() {
    this.cancelTween()
    if (!this.tracker.target) return
    this.tracker.clear()
    this.stationaryTracking = false
    this.lastTrackingPoint = null
    this.lastTrackingFrame = null
    this.trackingReleased?.()
  }

  tweenToTrackedObject() {
    const point = this.tracker.getPosition(0)
    if (!point) {
      this.stopTracking()
      return false
    }
    this.lastTrackingPoint = null
    this.lastTrackingFrame = null
    this.tweenTo(point, this.tweenClockMs, () => this.tracker.getPosition(0))
    return true
  }

  setStationaryTracking(stationary) {
    this.stationaryTracking = stationary
  }

  updateTrackingParameters() {}

  lookAtPoint(point) {
    this.tweenTo(point)
  }

  // Smoothly moves the orbit target to `point`, re-orienting "up" to the local vertical.
  tweenTo(point, startMs = this.tweenClockMs, getPoint = null) {
    if (!point) return
    this.cancelTween()
    const c = this.controls
    const from = c.target.clone(), fromOrbitUp = c.upDirection.clone(), fromCameraUp = this.camera.up.clone()
    const end = point.clone(), progress = { value: 0 }
    this.tweeningActive = true
    new TWEEN.Tween(progress, this.tweens).to({ value: 1 }, this.tweeningTime).start(startMs).onUpdate(() => {
      const destination = getPoint ? getPoint() : end
      if (!destination) {
        this.stopTracking()
        return
      }
      c.target.lerpVectors(from, destination, progress.value)
      if (!this.stationaryTracking) {
        const up = this.lockUpToRingAxis ? this.ringAxis : destination.clone().normalize()
        c.upDirection.lerpVectors(fromOrbitUp, up, progress.value)
        this.camera.up.lerpVectors(fromCameraUp, up, progress.value)
      }
    }).onComplete(() => { this.tweeningActive = false })
  }

  cancelTween() {
    this.tweens.removeAll()
    this.tweeningActive = false
  }

  updateTracking() {
    const d = this.store.derived
    const point = this.tracker.getPosition(0)
    if (!point) {
      if (this.tracker.target) this.stopTracking()
      this.trackingMarker.visible = false
      this.lastTrackingPoint = null
      return
    }
    const frame = this.tracker.getFrame(0)
    const c = this.controls
    if (this.lastTrackingPoint && !this.tweeningActive) {
      _offset.copy(point).sub(this.lastTrackingPoint)
      if (this.stationaryTracking) {
        c.target.add(_offset)
      }
      else {
        if (d.trackingMode.value === 1 && frame && this.lastTrackingFrame) {
          // "Selfie stick": keep the camera fixed relative to the object's orientation.
          _q.setFromUnitVectors(this.lastTrackingFrame.forward.clone().normalize(), frame.forward.clone().normalize())
        }
        else {
          // "Drone": keep the camera fixed relative to the local vertical.
          _q.setFromUnitVectors(_a.copy(this.lastTrackingPoint).normalize(), _b.copy(point).normalize())
        }
        const cameraOffset = _a.copy(this.camera.position).sub(c.target).applyQuaternion(_q)
        c.target.add(_offset)
        c.upDirection.applyQuaternion(_q)
        this.camera.up.applyQuaternion(_q)
        this.camera.position.copy(c.target).add(cameraOffset)
      }
    }
    this.lastTrackingPoint = point.clone()
    this.lastTrackingFrame = frame ? Object.fromEntries(Object.entries(frame).map(([k, v]) => [k, v.clone()])) : null
    this.placeMarker(this.trackingMarker, point, d.showTrackingMarkers.value)
    this.placeMarker(this.orbitMarker, c.target, d.showTrackingMarkers.value)
  }

  placeMarker(marker, worldPoint, visible) {
    const parent = marker.parent
    marker.position.copy(worldPoint)
    if (parent) parent.worldToLocal(marker.position)
    marker.scale.setScalar(worldPoint.distanceTo(this.camera.position) / 64)
    marker.visible = visible
  }

  // ---- Per-frame update ----------------------------------------------------------------------

  update(simTime, dt, interactionDt) {
    const wallMs = performance.now()
    const wallDt = this.lastWallMs === null ? 0 : Math.max(0, (wallMs - this.lastWallMs) / 1000)
    this.lastWallMs = wallMs
    const clockDt = interactionDt ?? wallDt
    this.tweenClockMs += 1000 * clockDt
    const c = this.controls
    if (this.playbackActive) {
      this.updateClippingPlanes()
      return
    }
    this.updateTracking()

    if (this.zoomDirection !== 0) {
      // logZoomRate is the fractional change per 60 Hz frame; convert to a per-second rate.
      const perSecond = Math.log1p(10 ** this.store.derived.logZoomRate.value) * 60
      const scale = Math.exp(this.zoomDirection * perSecond * (interactionDt ?? Math.min(0.1, wallDt)))
      _offset.copy(this.camera.position).sub(c.target).multiplyScalar(scale)
      this.camera.position.copy(c.target).add(_offset)
    }

    if (this.climbRate !== 0) {
      const altitude = Math.max(1, this.camera.position.length() - this.planetRadius)
      const climb = altitude * (Math.exp(this.climbRate * dt) - 1)
      _a.copy(this.camera.position).normalize()
      this.camera.position.addScaledVector(_a, climb)
      c.target.addScaledVector(_a, climb)
    }

    if (this.followElevator) {
      const r = this.followElevator()
      this.camera.position.setLength(r)
      c.target.setLength(r)
    }

    if (this.followTransitAngularSpeed !== 0) {
      const angle = this.followTransitAngularSpeed * dt
      this.camera.position.applyAxisAngle(this.followTransitAxis, angle)
      c.target.applyAxisAngle(this.followTransitAxis, angle)
    }

    this.tweens.update(this.tweenClockMs)
    c.update()
    this.updateClippingPlanes()
  }

  // The logarithmic depth buffer keeps precision over a huge range, so the near plane can stay
  // close enough for metre-scale objects next to the camera.
  updateClippingPlanes() {
    const camera = this.camera
    const n = this.nonGUIParams
    if (n.overrideClipPlanes) {
      camera.near = n.nearClip
      camera.far = n.farClip
    }
    else {
      const distance = camera.getWorldPosition(_a).length()
      camera.near = this.enableVR ? 0.1 : THREE.MathUtils.clamp((distance - this.planetRadius) * 1e-4, 0.1, 1000)
      camera.far = distance + 2 * this.planetRadius
    }
    camera.updateProjectionMatrix()
  }
}
