import * as THREE from 'three'
import { ObjectTracker, TRACKABLE_TYPES } from './ObjectTracker.js'
import { PointerNavigation } from './PointerNavigation.js'
import { ecefToGeodetic } from '../physics/geodesy.js'
import {
  clamp, smoothstep, smootherstep, levelUp, lookRotation, aimRotation, framingFromDirection, slerpUnit,
  zoomPanPath, transitionSeconds, anyPerpendicular,
} from './cameraMath.js'

// Everything that moves the free camera (shots place it themselves through setState).
//
// One model covers every distance and target, so nothing visibly switches between control schemes:
//
// * A *rig* says where the camera is. A FreeRig is a position and an orientation. A TrackRig follows a
//   moving object: its position is (1 - follow) * a fixed point + follow * (the object + an offset held
//   in a frame carried by the object), so follow = 1 rides along at a fixed distance and bearing,
//   follow = 0 stays put and only turns, and anything between drifts after it. The camera always aims
//   so the object stays where it is in the frame (a yaw and pitch away from the centre).
// * The horizon is kept level about the local vertical (away from the ground) everywhere; looking
//   straight down or up, where "level" means nothing, the previous roll is kept (cameraMath.levelUp),
//   so a view of the whole planet keeps its north as the camera moves round it.
// * Changing target or rig is a *transition*: both rigs are evaluated every frame at the current
//   simulated time and the camera is blended from one to the other. The new rig is evaluated where its
//   object is now, so it is caught exactly when the blend ends however fast the object moves: there is
//   no chasing, hunting or overshoot. Moves that only turn the camera blend the pose directly; moves
//   that travel follow a Van Wijk-Nuij zoom-and-pan path (zooming out, across and back in, at a steady
//   perceived speed), aimed at a focus point that slides from the old subject to the new.
// * Mouse, touchpad and touch gestures (PointerNavigation) act on what is under the pointer: zooming
//   moves a fraction of the distance to that point, panning keeps the grabbed point under the pointer
//   and orbiting turns about it. So their speed always matches the scale of what is being pointed at,
//   from a bolt on the ring to the whole planet. High above the planet the orbit pivot slides to the
//   planet's centre (and its axis to the polar axis), so the globe turns like a globe.
// * The camera is kept above the terrain (cameraMinGroundClearance).
//
// The controller's clock for transitions (tweenClockMs) follows simulated time while that moves (so
// a live take records a move at the shot's pace) and wall-clock time while paused, and never runs
// backwards, so a move completes while the shot playhead is paused, rewinding or jumped.

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _u = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _ndc = new THREE.Vector2()
const Y = new THREE.Vector3(0, 1, 0)
const MIN_ZOOM_DISTANCE = 0.3 // m from the point being zoomed towards
const MAX_RADIUS_FACTOR = 200 // the camera stays within this many planet radii of the centre

const forwardOf = (q, out = new THREE.Vector3()) => out.set(0, 0, -1).applyQuaternion(q)

// ---- Rigs ------------------------------------------------------------------------------------------

class FreeRig {
  constructor(position, quaternion, focusDistance) {
    this.position = position.clone()
    this.quaternion = quaternion.clone()
    this.focusDistance = Math.max(1, focusDistance)
  }

  get isFree() { return true }

  evaluate(ctl) {
    const forward = forwardOf(this.quaternion, _v)
    const up = levelUp(forward, ctl.verticalAt(this.position, _w), ctl.upHint, _u)
    lookRotation(forward, up, this.quaternion)
    return {
      position: this.position.clone(),
      quaternion: this.quaternion.clone(),
      focus: this.position.clone().addScaledVector(forward, this.focusDistance),
      yaw: 0,
      pitch: 0,
    }
  }

  rebase(ctl, position, quaternion, focus = null) {
    this.position.copy(position)
    this.quaternion.copy(quaternion)
    if (focus) this.focusDistance = Math.max(1, focus.distanceTo(position))
  }
}

class TrackRig {
  // entry: { getPosition(dt), getFrame(dt) } in world coordinates (see ObjectTracker).
  constructor(entry, follow, mode) {
    this.entry = entry
    this.follow = follow
    this.mode = mode
    this.anchor = new THREE.Vector3() // world-fixed point (the follow = 0 part)
    this.offset = new THREE.Vector3() // camera offset in the carrier frame (the follow = 1 part)
    this.yaw = 0
    this.pitch = 0
    this.object = new THREE.Vector3()
    this.carrier = new THREE.Quaternion()
  }

  get isFree() { return false }

  // The object's position and carrier frame now; false if the object is gone.
  locate(ctl) {
    const p = this.entry.getPosition(0)
    if (!p || !Number.isFinite(p.x)) return false
    this.object.copy(p)
    ctl.carrierFrame(this.entry, this.object, this.mode, this.carrier)
    return true
  }

  positionNow(out = new THREE.Vector3()) {
    out.copy(this.offset).applyQuaternion(this.carrier).add(this.object).multiplyScalar(this.follow)
    return out.addScaledVector(this.anchor, 1 - this.follow)
  }

  evaluate(ctl) {
    if (!this.locate(ctl)) return null
    const position = this.positionNow()
    return {
      position,
      quaternion: aimRotation(position, this.object, ctl.verticalAt(position, _w), ctl.upHint, this.yaw, this.pitch),
      focus: this.object.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
    }
  }

  // Re-expresses a camera position (and, if given, orientation) in this rig, so its pose there is unchanged.
  rebase(ctl, position, quaternion = null) {
    if (!this.locate(ctl)) return
    this.anchor.copy(position)
    this.offset.copy(position).sub(this.object).applyQuaternion(_q.copy(this.carrier).invert())
    if (quaternion) {
      const d = _v.copy(this.object).sub(position).applyQuaternion(_q.copy(quaternion).invert())
      const f = framingFromDirection(d)
      this.yaw = f.yaw
      this.pitch = f.pitch
    }
  }

  setFollow(ctl, follow) {
    if (!this.locate(ctl)) return
    const p = this.positionNow()
    this.follow = follow
    this.rebase(ctl, p)
  }

  setMode(ctl, mode) {
    if (!this.locate(ctl)) return
    const p = this.positionNow()
    this.mode = mode
    this.rebase(ctl, p)
  }
}

// ---- Controller ------------------------------------------------------------------------------------

export class CameraController {
  // planet: the Planet (raycast, sampleTerrainHeight); planetCoordSys: its frame; ellipsoid: the
  // planet's; getPickRoots(): objects the pointer can grab; followObjectAt(x, y): follows a moving
  // object near the pointer (client pixels) and returns true, or returns false if there is none.
  constructor({ camera, domElement, planetRadius, store, nonGUIParams, getTrackerContext, enableVR, planet, planetCoordSys, ellipsoid, getPickRoots, followObjectAt }) {
    this.camera = camera
    this.domElement = domElement
    this.planetRadius = planetRadius
    this.store = store
    this.nonGUIParams = nonGUIParams
    this.enableVR = enableVR
    this.planet = planet
    this.planetCoordSys = planetCoordSys
    this.ellipsoid = ellipsoid
    this.getPickRoots = getPickRoots ?? (() => [])
    this.followObjectAt = followObjectAt ?? (() => false)
    this.tweeningTime = 2000 // ms, for callers that predict where an object will be at the end of a move
    this.tweenClockMs = 0
    this.lastWallMs = null
    this.wallDt = 0

    this.tracker = new ObjectTracker(getTrackerContext)
    this.stationaryTracking = false // '9' key: keep the camera still and turn to follow the object
    this.zoomDirection = 0 // -1 zoom in, +1 zoom out ('Z'/'X')
    this.climbRate = 0 // fraction of altitude per second ('U'/'D')
    this.followElevator = null // () => distance from planet centre, set by the app
    this.followTransitAngularSpeed = 0 // rad/s about followTransitAxis
    this.followTransitAxis = new THREE.Vector3(0, 1, 0)
    this.lockUpToRingAxis = false
    this.ringAxis = new THREE.Vector3(0, 1, 0)
    this.playbackActive = false // true while a shot (or Google Earth playback) drives the camera
    this.wasPlayback = false

    this.upHint = camera.up.clone()
    this.focus = new THREE.Vector3()
    this.rig = new FreeRig(camera.position, camera.quaternion, 1000)
    this.transition = null
    this.followTween = null
    this.gesture = null
    this.pendingZoom = null
    this.raycaster = new THREE.Raycaster()
    this.dragCamera = new THREE.PerspectiveCamera().copy(camera, false)

    // What other code knew as the orbit controls: the target (the point being looked at) and a few flags.
    const self = this
    this.controls = {
      enabled: true,
      target: this.focus,
      upDirection: new THREE.Vector3(0, 1, 0),
      object: camera,
      autoRotate: false,
      autoRotateSpeed: store.derived.orbitControlsRotateSpeed.value,
      rotateSpeed: 1,
      maxPolarAngle: Math.PI,
      update() {
        camera.lookAt(self.focus)
        self.adoptCameraPose()
      },
      dispose() { self.navigation.dispose() },
    }
    this.navigation = new PointerNavigation(domElement, this.gestureHandler())

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

  get d() { return this.store.derived }
  param(name, fallback) {
    const v = this.d[name]?.value
    return v === undefined || v === null || Number.isNaN(v) ? fallback : v
  }

  get tracking() { return !this.rig.isFree }

  // Initial placement from preset options (relative to a reference point such as the launcher).
  placeInitially(referencePoint) {
    const n = this.nonGUIParams
    const target = referencePoint.clone().add(n.orbitControlsTarget ?? new THREE.Vector3())
    const position = referencePoint.clone().add(n.orbitControlsObjectPosition ?? new THREE.Vector3(0, 0, -30 * this.planetRadius / 8))
    const up = n.cameraUp ?? n.orbitControlsUpDirection ?? (target.lengthSq() > 0 ? target.clone().normalize() : Y)
    this.setState({ position: position.toArray(), target: target.toArray(), up: up.toArray() })
  }

  // ---- Shots ---------------------------------------------------------------------------------

  getState() {
    return {
      position: this.camera.position.toArray(),
      target: this.focus.toArray(),
      up: this.camera.up.toArray(),
      orbitUp: this.controls.upDirection.toArray(),
      fov: this.camera.fov,
    }
  }

  setState(state) {
    const camera = this.camera
    camera.position.fromArray(state.position)
    this.focus.fromArray(state.target)
    camera.up.fromArray(state.up)
    if (state.orbitUp) this.controls.upDirection.fromArray(state.orbitUp)
    if (state.fov && state.fov !== camera.fov) {
      camera.fov = state.fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(this.focus)
    camera.updateMatrixWorld()
    this.upHint.copy(camera.up)
    this.adoptCameraPose()
    this.updateClippingPlanes()
  }

  // Makes the current rig hold the camera exactly where it now is (after something else moved it).
  adoptCameraPose() {
    this.transition = null
    this.gesture = null
    this.pendingZoom = null
    const c = this.camera
    if (this.rig.isFree) this.rig.rebase(this, c.position, c.quaternion, this.focus)
    else this.rig.rebase(this, c.position, c.quaternion)
  }

  // ---- Frames and geometry -------------------------------------------------------------------

  polarAxis(out = new THREE.Vector3()) {
    return out.set(0, 1, 0).applyQuaternion(this.planetCoordSys.getWorldQuaternion(_q2))
  }

  // "Up" at a world point: away from the planet's centre (or along the ring axis, 'V' key).
  verticalAt(point, out = new THREE.Vector3()) {
    if (this.lockUpToRingAxis) return out.copy(this.ringAxis)
    const l = point.length()
    return l > 1 ? out.copy(point).multiplyScalar(1 / l) : this.polarAxis(out)
  }

  // Unit east, north (local horizontal) at a world point.
  eastNorth(point, east, north) {
    const up = this.verticalAt(point, new THREE.Vector3())
    east.crossVectors(this.polarAxis(new THREE.Vector3()), up)
    if (east.lengthSq() < 1e-12) anyPerpendicular(up, east)
    east.normalize()
    north.crossVectors(up, east)
  }

  // The frame a tracked object carries the camera's offset in (trackingMode):
  //   0  drone: level, keeping its compass bearing
  //   1  selfie stick: the object's own axes (turns with it)
  //   2  chase: level, turning with the object's heading
  carrierFrame(entry, object, mode, out) {
    const up = this.verticalAt(object, new THREE.Vector3())
    let forward = null
    let upward = null
    if (mode !== 0) {
      const frame = entry.getFrame?.(0)
      if (frame?.forward) {
        forward = frame.forward.clone().normalize()
        upward = frame.upward?.clone().normalize() ?? null
      }
      else {
        const later = entry.getPosition(0.5)
        if (later) {
          const v = later.clone().sub(object)
          if (v.length() > 0.05) forward = v.normalize()
        }
      }
    }
    if (mode === 1 && forward) {
      const y = (upward ?? up).clone().addScaledVector(forward, -(upward ?? up).dot(forward))
      if (y.lengthSq() < 1e-12) anyPerpendicular(forward, y)
      y.normalize()
      const x = new THREE.Vector3().crossVectors(y, forward)
      return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, forward))
    }
    let z = null
    if (mode === 2 && forward) {
      z = forward.clone().addScaledVector(up, -forward.dot(up))
      if (z.lengthSq() < 1e-6 && upward) z = upward.clone().addScaledVector(up, -upward.dot(up))
      if (z.lengthSq() < 1e-6) z = null
    }
    if (!z) {
      const east = new THREE.Vector3()
      z = new THREE.Vector3()
      this.eastNorth(object, east, z)
    }
    z.normalize()
    const x = new THREE.Vector3().crossVectors(up, z)
    return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z))
  }

  // Height of a world point above the terrain under it (metres; terrain not yet loaded counts as sea level).
  heightAboveGround(point) {
    const local = this.planetCoordSys.worldToLocal(_v.copy(point))
    const g = ecefToGeodetic(local.x, local.y, local.z, this.ellipsoid)
    const ground = this.planet?.sampleTerrainHeight(g.lat, g.lon)?.heightMeters ?? 0
    return g.alt - ground
  }

  altitude(point) {
    return point.length() - this.planetRadius
  }

  // Lifts a position that is too close to (or under) the ground. Returns true if it moved.
  keepAboveGround(position) {
    const clearance = this.param('cameraMinGroundClearance', 1.5)
    const h = this.heightAboveGround(position)
    if (!(h < clearance)) return false
    position.addScaledVector(this.verticalAt(position, _w), clearance - h)
    return true
  }

  // ---- Picking -------------------------------------------------------------------------------

  rayAt(clientX, clientY, camera = this.camera) {
    const rect = this.domElement.getBoundingClientRect()
    _ndc.set(2 * (clientX - rect.left) / rect.width - 1, 1 - 2 * (clientY - rect.top) / rect.height)
    camera.updateMatrixWorld()
    this.raycaster.setFromCamera(_ndc, camera)
    return this.raycaster.ray
  }

  // The nearest surface or structure under the pointer: { point, distance, terrain } or null.
  pick(clientX, clientY) {
    const ray = this.rayAt(clientX, clientY).clone()
    const raycaster = this.raycaster
    raycaster.far = Infinity
    let best = null
    const planetHits = this.planet?.raycast(raycaster) ?? []
    if (planetHits.length) best = { point: planetHits[0].point.clone(), distance: planetHits[0].distance, terrain: true }
    else {
      // Terrain not loaded (or hidden): the sea-level sphere.
      const sphere = new THREE.Sphere(new THREE.Vector3(), this.planetRadius)
      const p = ray.intersectSphere(sphere, new THREE.Vector3())
      if (p) best = { point: p, distance: p.distanceTo(ray.origin), terrain: true }
    }
    raycaster.far = best ? best.distance : Infinity
    const hits = []
    const skip = new Set([this.trackingMarker, this.targetMarker, this.orbitMarker, this.planet?.surface, this.planet?.atmosphere].filter(Boolean))
    const visit = (object) => {
      if (!object.visible || skip.has(object)) return
      if ((object.isMesh || object.isInstancedMesh) && !object.isLOD && raycaster.layers.test(object.layers)) {
        const m = object.material
        const material = Array.isArray(m) ? m[0] : m
        const ghost = !material || material.visible === false || (material.transparent && !material.depthWrite) || material.side === THREE.BackSide
        if (!ghost) object.raycast(raycaster, hits)
      }
      for (const child of object.children) visit(child)
    }
    for (const root of this.getPickRoots()) if (root) visit(root)
    raycaster.far = Infinity
    for (const h of hits) {
      if (!best || h.distance < best.distance) best = { point: h.point.clone(), distance: h.distance, terrain: false }
    }
    return best
  }

  // A point to act on when the pointer is over empty sky: along the pointer's ray at the focus distance.
  pointOnRay(clientX, clientY, distance) {
    return this.rayAt(clientX, clientY).at(distance, new THREE.Vector3())
  }

  focusDistance() {
    return Math.max(1, this.focus.distanceTo(this.camera.position))
  }

  // How far up the camera is, as 0 (near the ground) .. 1 (seeing the whole planet): the orbit pivot
  // slides from the point under the pointer to the planet's centre over this range.
  globeWeight(position = this.camera.position) {
    const R = this.planetRadius
    return smoothstep(0.05 * R, 0.8 * R, this.altitude(position))
  }

  // ---- Gestures ------------------------------------------------------------------------------

  gestureHandler() {
    return {
      enabled: () => this.controls.enabled && !this.playbackActive,
      beginDrag: (kind, x, y) => this.beginDrag(kind, x, y),
      drag: (kind, x, y, dx, dy) => this.drag(kind, x, y, dx, dy),
      endDrag: (kind) => this.endDrag(kind),
      zoomAt: (x, y, factor) => this.zoomAt(x, y, factor),
      twist: (x, y, angle) => this.twist(angle),
      doubleClick: (x, y) => this.doubleClick(x, y),
      scrollMode: () => this.param('cameraTouchpadScroll', 'auto'),
      zoomSpeed: () => this.param('cameraZoomSpeed', 1),
    }
  }

  // Ends any transition where it is now, so a gesture starts from what is on screen.
  settle() {
    if (this.transition) {
      const to = this.transition.to
      this.transition = null
      this.rig = to
      this.rig.rebase(this, this.camera.position, this.camera.quaternion, this.focus)
    }
  }

  radiansPerPixel() {
    const height = this.domElement.clientHeight || 1
    return THREE.MathUtils.degToRad(this.camera.fov) / height
  }

  beginDrag(kind, x, y) {
    this.settle()
    const camera = this.camera
    const g = { kind, x, y }
    this.dragCamera.copy(camera, false)
    this.dragCamera.updateMatrixWorld()
    g.startPosition = camera.position.clone()
    g.startQuaternion = camera.quaternion.clone()
    if (this.tracking) {
      g.pivot = this.rig.object.clone()
      g.axis = this.verticalAt(g.pivot)
    }
    else if (kind === 'orbit' || kind === 'pan' || kind === 'dolly') {
      const hit = this.pick(x, y)
      g.hit = hit
      const w = this.globeWeight()
      if (kind === 'orbit') {
        if (hit) {
          g.pivot = hit.point.clone().multiplyScalar(1 - w)
          g.axis = slerpUnit(this.verticalAt(hit.point), this.polarAxis(), w)
        }
        else if (w > 0.5) {
          g.pivot = new THREE.Vector3()
          g.axis = this.polarAxis()
        }
        else g.kind = 'look'
      }
      else {
        g.grab = hit ? hit.point.clone() : this.pointOnRay(x, y, this.focusDistance())
        const ray = this.rayAt(x, y)
        const r = g.grab.length()
        const grazing = hit ? Math.abs(ray.direction.dot(_v.copy(g.grab).normalize())) : 0
        g.sphere = hit && r > 0.5 * this.planetRadius && grazing > 0.25 ? r : 0
        g.planeNormal = forwardOf(camera.quaternion)
      }
    }
    if (g.kind === 'look') g.axis = null
    this.gesture = g
    this.placeMarker(this.targetMarker, g.pivot ?? g.grab ?? this.focus, this.param('showTrackingMarkers', false) && !!(g.pivot ?? g.grab))
  }

  drag(kind, x, y, dx, dy) {
    const g = this.gesture
    if (!g) return
    if (this.transition) this.settle()
    const rate = this.radiansPerPixel()
    const speed = this.param('cameraRotateSpeed', 1) * this.controls.rotateSpeed
    // Orbiting: dragging right swings the camera left round the pivot (the scene turns with the
    // pointer); dragging down raises the camera. Looking around: the sky follows the pointer.
    const orbitRate = 1.2 * Math.PI / (this.domElement.clientHeight || 1) * speed
    if (g.kind === 'orbit') this.orbit(g.pivot, g.axis, -dx * orbitRate, -dy * orbitRate)
    else if (g.kind === 'look') this.lookAround(dx * rate * speed, dy * rate * speed)
    else if (g.kind === 'pan') this.pan(g, x, y, dx, dy)
    else if (g.kind === 'dolly') this.zoomAt(g.x, g.y, Math.exp(dy * 0.005 * this.param('cameraZoomSpeed', 1)), g.hit?.point ?? g.grab)
  }

  endDrag() {
    const g = this.gesture
    this.gesture = null
    this.targetMarker.visible = false
    if (!g || this.tracking) return
    // The focus (the point looked at) becomes what the gesture was about, if it is ahead.
    const p = g.hit?.point ?? g.pivot
    if (p && p.lengthSq() > 0) {
      const ahead = _v.copy(p).sub(this.camera.position).dot(forwardOf(this.camera.quaternion, _w))
      if (ahead > 1) this.rig.focusDistance = ahead
    }
  }

  // Applies a world-space rotation about `pivot` to the camera.
  rotateCameraAbout(pivot, rotation) {
    const rig = this.rig
    const camera = this.camera
    const position = camera.position.clone().sub(pivot).applyQuaternion(rotation).add(pivot)
    if (rig.isFree) {
      const q = rotation.clone().multiply(camera.quaternion)
      rig.rebase(this, position, q)
      this.upHint.applyQuaternion(rotation)
    }
    else rig.rebase(this, position)
    this.applyPose(rig.evaluate(this))
  }

  orbit(pivot, axis, azimuth, elevation) {
    const camera = this.camera
    const offset = camera.position.clone().sub(pivot)
    if (offset.lengthSq() < 1e-12) return this.lookAround(azimuth, elevation)
    const rotation = new THREE.Quaternion().setFromAxisAngle(axis, azimuth)
    // Elevation: about the horizontal axis across the view, limited so the camera never passes over the
    // pivot's vertical (which would flip the view).
    const r = offset.clone().applyQuaternion(rotation)
    const across = new THREE.Vector3().crossVectors(axis, r)
    if (across.lengthSq() > 1e-12) {
      across.normalize()
      const polar = Math.acos(clamp(r.clone().normalize().dot(axis), -1, 1))
      const minPolar = THREE.MathUtils.degToRad(0.5)
      const maxPolar = Math.min(this.controls.maxPolarAngle, Math.PI - minPolar)
      const next = clamp(polar + elevation, minPolar, maxPolar)
      rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(across, polar - next))
    }
    this.rotateCameraAbout(pivot, rotation)
  }

  // Turns the camera where it stands (yaw about the vertical, pitch about its horizontal axis).
  lookAround(yaw, pitch) {
    if (this.tracking) return
    const camera = this.camera
    const up = this.verticalAt(camera.position)
    const q = new THREE.Quaternion().setFromAxisAngle(up, yaw).multiply(camera.quaternion)
    const forward = forwardOf(q)
    const right = new THREE.Vector3().crossVectors(forward, up)
    if (right.lengthSq() > 1e-12) {
      right.normalize()
      const elevation = Math.asin(clamp(forward.dot(up), -1, 1))
      const limit = THREE.MathUtils.degToRad(89.5)
      const next = clamp(elevation + pitch, -limit, limit)
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(right, next - elevation))
    }
    this.upHint.applyQuaternion(_q.setFromAxisAngle(up, yaw))
    this.rig.rebase(this, camera.position, q)
    this.applyPose(this.rig.evaluate(this))
  }

  pan(g, x, y, dx, dy) {
    if (this.tracking) {
      // Following an object: panning moves the object on screen (its framing).
      const rate = this.radiansPerPixel()
      const limit = THREE.MathUtils.degToRad(this.camera.fov)
      this.rig.yaw = clamp(this.rig.yaw + dx * rate, -limit, limit)
      this.rig.pitch = clamp(this.rig.pitch + dy * rate, -limit, limit)
      this.applyPose(this.rig.evaluate(this))
      return
    }
    // Rays through the pointer from where the camera was when the drag began, so the grabbed point
    // follows the pointer exactly, without drift.
    const ray = this.rayAt(x, y, this.dragCamera)
    let rotation = null
    let translation = null
    if (g.sphere) {
      const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), g.sphere), new THREE.Vector3())
      if (hit) rotation = new THREE.Quaternion().setFromUnitVectors(hit.normalize(), g.grab.clone().normalize())
      else g.sphere = 0
    }
    if (!rotation) {
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(g.planeNormal, g.grab)
      const hit = ray.intersectPlane(plane, new THREE.Vector3())
      if (!hit) return
      translation = g.grab.clone().sub(hit)
    }
    const position = g.startPosition.clone()
    const q = g.startQuaternion.clone()
    if (rotation) {
      position.applyQuaternion(rotation)
      q.premultiply(rotation)
    }
    else position.add(translation)
    this.rig.rebase(this, position, q)
    this.applyPose(this.rig.evaluate(this))
  }

  twist(angle) {
    if (this.transition) this.settle()
    const g = this.gesture
    const pivot = g?.pivot ?? g?.grab ?? (this.tracking ? this.rig.object : this.focus)
    this.rotateCameraAbout(pivot.clone(), new THREE.Quaternion().setFromAxisAngle(this.verticalAt(pivot), angle))
  }

  // Moves the camera towards (factor < 1) or away from a point, along the line to it, so the point
  // stays where it is on screen. Smoothed over a few frames (see applyPendingZoom).
  zoomAt(x, y, factor, point = null) {
    if (!(factor > 0) || factor === 1) return
    this.settle()
    const now = performance.now()
    let z = this.pendingZoom
    const moved = !z || Math.hypot(x - z.x, y - z.y) > 4 || now - z.time > 400
    if (moved || point) {
      const target = point ?? (this.tracking ? null : (this.pick(x, y)?.point ?? this.pointOnRay(x, y, this.focusDistance())))
      z = { x, y, time: now, point: target, log: z && !moved ? z.log : 0 }
      this.pendingZoom = z
    }
    z.time = now
    z.log += Math.log(factor)
  }

  applyPendingZoom(wallDt) {
    const z = this.pendingZoom
    if (!z) return
    const k = 1 - Math.exp(-Math.max(wallDt, 1 / 240) / 0.07)
    let step = z.log * k
    if (Math.abs(z.log) < 1e-4) {
      step = z.log
      this.pendingZoom = null
    }
    z.log -= step
    this.scaleDistance(Math.exp(step), z.point)
  }

  // Multiplies the camera's distance from `point` (or, following an object, from the object) by `factor`.
  scaleDistance(factor, point = null) {
    const camera = this.camera
    const rig = this.rig
    const centre = rig.isFree ? (point ?? this.focus) : rig.object
    const offset = camera.position.clone().sub(centre)
    const distance = offset.length()
    if (!(distance > 0)) return
    const limit = MAX_RADIUS_FACTOR * this.planetRadius
    let next = clamp(distance * factor, MIN_ZOOM_DISTANCE, limit)
    if (factor < 1 && next > distance) next = distance
    const position = centre.clone().addScaledVector(offset, next / distance)
    if (position.length() > limit) return
    if (rig.isFree) {
      const ahead = centre.clone().sub(position).dot(forwardOf(camera.quaternion, _w))
      rig.rebase(this, position, camera.quaternion)
      if (ahead > 1) rig.focusDistance = ahead
    }
    else rig.rebase(this, position)
    this.applyPose(rig.evaluate(this))
  }

  doubleClick(x, y) {
    this.settle()
    if (this.followObjectAt(x, y)) return
    const hit = this.pick(x, y)
    if (hit) this.flyTo(hit.point, { distance: hit.distance * 0.3 })
  }

  // ---- Moves ---------------------------------------------------------------------------------

  startTransition(to, kind, { durationScale = 1 } = {}) {
    const from = this.transition ? this.currentAsFreeRig() : this.rig
    const a = from.evaluate(this)
    const b = to.evaluate(this)
    if (!a || !b) {
      this.rig = to
      this.transition = null
      return
    }
    const turn = forwardOf(a.quaternion).angleTo(forwardOf(b.quaternion))
    let S = 0
    if (kind === 'fly') S = this.flightPath(a, b).path.S
    const seconds = transitionSeconds(S, turn, durationScale * this.param('cameraTransitionTime', 1))
    this.transition = { from, to, kind, start: this.tweenClockMs, duration: 1000 * seconds }
  }

  // A rig frozen at the current (mid-transition) pose, to start a new transition from.
  currentAsFreeRig() {
    return new FreeRig(this.camera.position, this.camera.quaternion, this.focusDistance())
  }

  // Turns (without moving) to look at a point, which becomes the focus.
  lookAtPoint(point) {
    if (!point) return
    this.settle()
    this.releaseTracking()
    const p = this.camera.position
    const q = aimRotation(p, point, this.verticalAt(p), this.upHint, 0, 0)
    this.startTransition(new FreeRig(p, q, point.distanceTo(p)), 'aim')
  }

  // Flies to view `point` from `distance` (default: the current distance), from about the same direction.
  flyTo(point, { distance = null } = {}) {
    this.settle()
    this.releaseTracking()
    const p = this.camera.position
    const d = Math.max(MIN_ZOOM_DISTANCE * 10, distance ?? point.distanceTo(p))
    const dir = this.viewDirectionFrom(point, p)
    const position = point.clone().addScaledVector(dir, d)
    this.keepAboveGround(position)
    const q = aimRotation(position, point, this.verticalAt(position), this.upHint, 0, 0)
    this.startTransition(new FreeRig(position, q, point.distanceTo(position)), 'fly')
  }

  // The direction to view `point` from: towards the camera at `from`, but at least a little above the
  // point's horizon for points on or near the ground.
  viewDirectionFrom(point, from) {
    const dir = from.clone().sub(point)
    if (dir.lengthSq() < 1e-12) dir.copy(this.verticalAt(point))
    dir.normalize()
    if (this.altitude(point) < 0.01 * this.planetRadius) {
      const up = this.verticalAt(point)
      const minSin = Math.sin(THREE.MathUtils.degToRad(8))
      const s = dir.dot(up)
      if (s < minSin) {
        const horizontal = dir.clone().addScaledVector(up, -s)
        if (horizontal.lengthSq() < 1e-12) anyPerpendicular(up, horizontal)
        horizontal.normalize()
        dir.copy(horizontal).multiplyScalar(Math.cos(Math.asin(minSin))).addScaledVector(up, minSin)
      }
    }
    return dir
  }

  // Follows a moving object (entry: { getPosition(dt), getFrame(dt) }, world coordinates).
  //   aim       turn to put the object in the middle of the view (otherwise the view stays as composed)
  //   approach  also fly closer (to `distance`, default min(current, ~250 m))
  follow(entry, { aim = true, approach = false, distance = null, trackerTarget = entry } = {}) {
    this.settle()
    this.tracker.target = trackerTarget
    const rig = new TrackRig(entry, this.stationaryTracking ? 0 : this.param('trackingFollow', 1), this.param('trackingMode', 0) | 0)
    if (!rig.locate(this)) {
      this.tracker.clear()
      return false
    }
    const p = this.camera.position.clone()
    const object = rig.object
    if (approach) {
      const d = distance ?? Math.min(p.distanceTo(object), 250)
      const position = object.clone().addScaledVector(this.viewDirectionFrom(object, p), d)
      rig.rebase(this, position, aimRotation(position, object, this.verticalAt(position), this.upHint, 0, 0))
      this.startTransition(rig, 'fly')
    }
    else if (aim) {
      rig.rebase(this, p, aimRotation(p, object, this.verticalAt(p), this.upHint, 0, 0))
      this.startTransition(rig, 'aim')
    }
    else {
      rig.rebase(this, p, this.camera.quaternion)
      this.rig = rig
      this.transition = null
    }
    return true
  }

  releaseTracking() {
    if (this.rig.isFree) return
    this.tracker.clear()
    this.followTween = null
    this.rig = new FreeRig(this.camera.position, this.camera.quaternion, this.focusDistance())
  }

  // Number keys: track the nearest object of TRACKABLE_TYPES[index]; pressing again releases it.
  toggleTracking(index, { toggle = true } = {}) {
    const type = TRACKABLE_TYPES[index]
    if (!type) return false
    if (toggle && this.tracker.type === type) {
      this.settle()
      this.releaseTracking()
      return true
    }
    if (!this.tracker.findNearest(type, this.camera.position)) return false
    const raw = this.tracker.target
    return this.follow(this.tracker.worldEntry(raw), { aim: true, trackerTarget: raw })
  }

  stopTracking() {
    this.settle()
    this.releaseTracking()
  }

  // Legacy entry point: turn to look at a point (followed objects are handled by follow()).
  tweenTo(point) {
    this.lookAtPoint(point)
  }

  // '9': between riding along with the tracked object and staying put (turning to follow it).
  setStationaryTracking(stationary) {
    this.stationaryTracking = stationary
    if (this.rig.isFree) return
    this.followTween = { from: this.rig.follow, to: stationary ? 0 : this.param('trackingFollow', 1), start: this.tweenClockMs, duration: 1200 }
  }

  // Parameters changed (trackingMode, trackingFollow).
  updateTrackingParameters() {
    if (this.rig.isFree) return
    this.rig.setMode(this, this.param('trackingMode', 0) | 0)
    if (!this.stationaryTracking && !this.followTween) this.rig.setFollow(this, this.param('trackingFollow', 1))
  }

  // ---- Per-frame update ----------------------------------------------------------------------

  update(simTime, dt) {
    const wallMs = performance.now()
    const wallDt = this.lastWallMs === null ? 0 : Math.min(0.1, Math.max(0, (wallMs - this.lastWallMs) / 1000))
    this.lastWallMs = wallMs
    const clockDt = dt !== 0 ? Math.abs(dt) : wallDt
    this.tweenClockMs += 1000 * clockDt
    if (this.playbackActive) {
      this.wasPlayback = true
      this.updateClippingPlanes()
      return
    }
    if (this.wasPlayback) {
      this.wasPlayback = false
      this.adoptCameraPose()
    }

    const rig = this.rig
    if (!rig.isFree && !rig.locate(this)) {
      // The tracked object has gone.
      this.transition = null
      this.releaseTracking()
    }
    if (this.followTween && !this.rig.isFree) {
      const t = this.followTween
      const s = smootherstep((this.tweenClockMs - t.start) / t.duration)
      this.rig.setFollow(this, t.from + (t.to - t.from) * s)
      if (s >= 1) this.followTween = null
    }

    this.applyPendingZoom(wallDt)
    this.applyKeyMotions(dt, clockDt)

    const pose = this.evaluate()
    if (pose) {
      if (this.keepAboveGround(pose.position) && this.rig.isFree && !this.transition) this.rig.position.copy(pose.position)
      this.applyPose(pose)
    }
    if (!this.rig.isFree) this.placeMarker(this.trackingMarker, this.rig.object, this.param('showTrackingMarkers', false))
    else this.trackingMarker.visible = false
    this.placeMarker(this.orbitMarker, this.focus, this.param('showTrackingMarkers', false))
    this.updateClippingPlanes()
  }

  // Keyboard-driven motions: slow zoom (Z/X), climb (U/D), auto-rotation (Q), following the elevators
  // or transit vehicles (E/C).
  applyKeyMotions(dt, clockDt) {
    const rig = this.rig
    const camera = this.camera
    if (this.zoomDirection !== 0) {
      // logZoomRate is the fractional change per 60 Hz frame; convert to a per-second rate.
      const perSecond = Math.log1p(10 ** this.param('logZoomRate', -2)) * 60
      this.scaleDistance(Math.exp(this.zoomDirection * perSecond * clockDt), rig.isFree ? this.focus.clone() : null)
    }
    if (this.controls.autoRotate) {
      const pivot = rig.isFree ? this.focus.clone() : rig.object.clone()
      const axis = pivot.length() > 0.5 * this.planetRadius ? this.verticalAt(pivot) : this.polarAxis()
      const angle = 2 * Math.PI / 60 * this.controls.autoRotateSpeed * clockDt
      this.rotateCameraAbout(pivot, new THREE.Quaternion().setFromAxisAngle(axis, angle))
    }
    const moves = this.climbRate !== 0 || this.followElevator || this.followTransitAngularSpeed !== 0
    if (!moves) return
    this.settle()
    const position = camera.position.clone()
    const q = camera.quaternion.clone()
    if (this.climbRate !== 0) {
      const altitude = Math.max(1, this.altitude(position))
      position.addScaledVector(this.verticalAt(position, _v), altitude * (Math.exp(this.climbRate * dt) - 1))
    }
    if (this.followElevator) position.setLength(this.followElevator())
    if (this.followTransitAngularSpeed !== 0) {
      const r = _q.setFromAxisAngle(this.followTransitAxis, this.followTransitAngularSpeed * dt)
      position.applyQuaternion(r)
      q.premultiply(r)
      this.upHint.applyQuaternion(r)
    }
    rig.rebase(this, position, rig.isFree ? q : null)
  }

  // The camera pose this frame, from the rig or the transition between two rigs.
  evaluate() {
    const t = this.transition
    if (!t) return this.rig.evaluate(this)
    const a = t.from.evaluate(this)
    const b = t.to.evaluate(this)
    const s = clamp((this.tweenClockMs - t.start) / t.duration, 0, 1)
    if (!a || !b || s >= 1) {
      this.rig = t.to
      this.transition = null
      return b ?? this.rig.evaluate(this)
    }
    const e = smootherstep(s)
    if (t.kind === 'aim') {
      const position = a.position.clone().lerp(b.position, e)
      const quaternion = a.quaternion.clone().slerp(b.quaternion, e)
      const focus = a.focus.clone().lerp(b.focus, e)
      return { position, quaternion, focus }
    }
    const { path, d, focusAt, wScale } = this.flightPath(a, b)
    const { u, w } = path.at(e * path.S)
    const frac = d > 0 ? clamp(u / d, 0, 1) : e
    const focus = focusAt(frac)
    const distance = w / wScale
    const dirA = a.position.clone().sub(a.focus).normalize()
    const dirB = b.position.clone().sub(b.focus).normalize()
    const dir = slerpUnit(dirA, dirB, path.S > 0 && d > 0 ? frac : e)
    // Mid-flight, while zoomed out beyond both ends, tip the view towards looking down, so a long
    // flight goes up and over rather than through the planet.
    const wa = a.position.distanceTo(a.focus)
    const wb = b.position.distanceTo(b.focus)
    const bump = clamp(distance / Math.max(wa, wb) - 1, 0, 2)
    if (bump > 0 && focus.length() > 0.5 * this.planetRadius) dir.addScaledVector(this.verticalAt(focus), bump).normalize()
    const position = focus.clone().addScaledVector(dir, distance)
    const yaw = a.yaw + (b.yaw - a.yaw) * e
    const pitch = a.pitch + (b.pitch - a.pitch) * e
    const quaternion = aimRotation(position, focus, this.verticalAt(position), this.upHint, yaw, pitch)
    return { position, quaternion, focus }
  }

  // The zoom-and-pan path between two poses' focus points (see cameraMath.zoomPanPath). Points on or
  // above the planet travel along a great circle; others in a straight line.
  flightPath(a, b) {
    const fA = a.focus
    const fB = b.focus
    const rA = fA.length()
    const rB = fB.length()
    const R = this.planetRadius
    let d
    let focusAt
    if (rA > 0.5 * R && rB > 0.5 * R) {
      const uA = fA.clone().multiplyScalar(1 / rA)
      const uB = fB.clone().multiplyScalar(1 / rB)
      const angle = Math.acos(clamp(uA.dot(uB), -1, 1))
      d = Math.hypot(angle * (rA + rB) / 2, rB - rA)
      focusAt = (f) => slerpUnit(uA, uB, f).multiplyScalar(rA + (rB - rA) * f)
    }
    else {
      d = fA.distanceTo(fB)
      focusAt = (f) => fA.clone().lerp(fB, f)
    }
    const wScale = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    const wa = Math.max(MIN_ZOOM_DISTANCE, a.position.distanceTo(fA)) * wScale
    const wb = Math.max(MIN_ZOOM_DISTANCE, b.position.distanceTo(fB)) * wScale
    return { path: zoomPanPath(wa, wb, d), d, focusAt, wScale }
  }

  applyPose(pose) {
    if (!pose) return
    const camera = this.camera
    camera.position.copy(pose.position)
    camera.quaternion.copy(pose.quaternion)
    camera.up.copy(Y).applyQuaternion(camera.quaternion)
    this.upHint.copy(camera.up)
    this.focus.copy(pose.focus)
    this.verticalAt(this.focus.lengthSq() > 1 ? this.focus : camera.position, this.controls.upDirection)
    camera.updateMatrixWorld()
  }

  placeMarker(marker, worldPoint, visible) {
    const parent = marker.parent
    marker.position.copy(worldPoint)
    if (parent) parent.worldToLocal(marker.position)
    marker.scale.setScalar(Math.max(1e-3, worldPoint.distanceTo(this.camera.position) / 64))
    marker.visible = visible
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
      const distance = camera.getWorldPosition(_v).length()
      camera.near = this.enableVR ? 0.1 : THREE.MathUtils.clamp((distance - this.planetRadius) * 1e-4, 0.1, 1000)
      camera.far = distance + 2 * this.planetRadius
    }
    camera.updateProjectionMatrix()
  }
}
