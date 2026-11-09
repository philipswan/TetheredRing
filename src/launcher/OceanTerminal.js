import * as THREE from 'three'
import { ecefToGeodetic, geodeticToECEF } from '../physics/geodesy.js'
import { windAt } from '../scene/seaPlacement.js'
import { terminalModel, terminalPretensionAttachments } from './terminalModel.js'
import { DEFAULT_SCHEDULE, siteSeed } from './terminalPort.js'
import { TerminalTraffic } from './TerminalTraffic.js'
import { AnchorCables } from './AnchorCables.js'
import { CONE_OUTER, setLampCount, setLamps, withPortLamps } from './portLamps.js'
import { track } from '../core/PendingWork.js'

// The ocean terminal at the breech of an underwater launcher (models/launcher_ocean_terminal.obj, read by
// terminalModel.js): a terminal building floating at the surface with a pier, an elevator shaft down to
// an underwater terminal at the launcher's breech, and mooring cables from the underwater terminal to
// the sea floor.
//
// - The underwater terminal is placed so that its launcher marker is at the start of the tube, along the
//   tube's direction (the model's -Z), level. The elevator shaft is stretched to reach it from the
//   surface, however deep the breech is.
// - The surface terminal and pier turn about the elevator shaft so that the pier points downwind (the
//   wind at the start date, as the ships and the sea's waves have it: seaPlacement.windAt); the
//   underwater terminal does not turn.
// - Two cables run from each anchor marker to the sea floor, splayed out diagonally from the terminal's
//   ends (AnchorCables.js).
// - Feeder ships call at the pier, and their containers go into the terminal (terminalPort.js,
//   TerminalTraffic.js), on the launcher's cadence (setSchedule; launchCadence.js).
// - Between dusk and dawn (the sun below LIGHTS_ON) the pier's floodlights shine on the pier (in the
//   shaders of the things on it: portLamps.js; their faint beams are drawn too), their lenses glow, and
//   so do the terminal's windows and doors.
//
// Everything is a function of the parameters and the simulated time. The model's coordinates are kept
// local (the terminal's position on the planet is its group's position), as planet coordinates are too
// large for float32.

export const MIN_DEPTH = 45          // m: the breech must be this far below the sea for the terminal to fit above it
const LIGHTS_ON = [2, -4]     // sun elevation (degrees): the lights fade on between these
const LAMP_COLOR = new THREE.Color(1.0, 0.86, 0.68)
const LAMP_INTENSITY = 140    // the lamps' intensity (light on a surface 1 m away, facing them; full sun is pi)
const BEAM_LENGTH = 10
const DETAIL_DISTANCE = 30000 // m: the cranes, AGVs and the containers on the pier are drawn within this
const MAX_DISTANCE = 400000   // m: nothing is drawn beyond this

const material = (color, options = {}) => withPortLamps(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options }))

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _sun = new THREE.Vector3()
const _target = new THREE.Vector3()
const _camera = new THREE.Vector3()

export class OceanTerminal {
  /**
   * parent: the planet's coordinate system; ellipsoid: { a, f }; sampleHeight(latDeg, lonDeg) -> {
   * heightMeters } | null (the sea floor for the anchors, from fixed data: null while it loads);
   * terrainVersion(): goes up as more of it arrives; containerShips: ContainerShips (builds the ships), or null.
   */
  constructor({ parent, ellipsoid, sampleHeight, terrainVersion = () => 0, containerShips, url = 'models/launcher_ocean_terminal.obj' }) {
    this.parent = parent
    this.ellipsoid = ellipsoid
    this.sampleHeight = sampleHeight
    this.terrainVersion = terrainVersion
    this.containerShips = containerShips
    this.root = new THREE.Group()
    this.root.name = 'oceanTerminal'
    this.root.visible = false
    parent.add(this.root)
    this.visible = true
    this.placed = null     // the breech it is placed at
    this.model = null
    this.schedule = DEFAULT_SCHEDULE
    this.site = null
    track(fetch(url).then((r) => r.text()).then((text) => this._build(terminalModel(text)))
      .catch((error) => console.warn('[oceanTerminal] model failed to load', error)))
  }

  _build(model) {
    this.model = model
    const g = model.geometries
    const { shaft } = model
    setLampCount(model.lamps.length)
    this.lamps = model.lamps

    // The surface terminal and pier, turning about the shaft; in model coordinates inside `surface`.
    this.pivot = new THREE.Group()
    this.pivot.name = 'terminalPivot'
    this.surface = new THREE.Group()
    this.surface.position.set(-shaft.x, 0, -shaft.z)
    this.pivot.add(this.surface)
    this.root.add(this.pivot)
    const concrete = material(0xa9a59c, { roughness: 0.9 })
    const walls = material(0xdcdcd6, { roughness: 0.7 })
    const metal = material(0x6f7377, { roughness: 0.5, metalness: 0.5 })
    this.windowMaterial = withPortLamps(new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.12, metalness: 0.6, emissive: 0xffcf8e, emissiveIntensity: 0 }))
    this.doorMaterial = withPortLamps(new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.9, emissive: 0xffd8a0, emissiveIntensity: 0 }))
    this.lensMaterial = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.3, emissive: 0xfff2dc, emissiveIntensity: 0 })
    const add = (geometry, mat, name) => {
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.name = name
      this.surface.add(mesh)
      return mesh
    }
    add(g.Pier, concrete, 'pier')
    add(g.terminalWalls, walls, 'terminal')
    add(g.terminalWindows, this.windowMaterial, 'terminalWindows')
    add(g.terminalDoors, this.doorMaterial, 'terminalDoors')
    add(g.Lamppost, metal, 'lampposts')
    add(g.lampHousings, metal, 'lampHousings')
    add(g.lampLenses, this.lensMaterial, 'lampLenses')
    add(g.Flagpoll, material(0xf4f4f0), 'flagpole')
    this._buildFlag(g.Flagpoll)
    this._buildBeams()

    // See the staged vehicles through the submerged hull and shaft, from either side.
    const submergedSurface = { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }
    // The underwater terminal and the shaft (stretched to it in place())
    this.underwater = new THREE.Group()
    this.underwater.name = 'underwaterTerminal'
    this.root.add(this.underwater)
    const hull = new THREE.Mesh(g.Underwater_Terminal, material(0x8b9096, { roughness: 0.6, metalness: 0.3, ...submergedSurface }))
    hull.name = 'underwaterTerminalHull'
    // Ocean's translucent underside draws at order 2. These submerged surfaces must blend
    // over it when viewed from below; its opaque depth pass still occludes surfaces behind it.
    hull.renderOrder = 3
    this.underwater.add(hull)
    this.shaftGeometry = g.Elevator_Shaft
    this.shaftHeights = Float32Array.from({ length: g.Elevator_Shaft.attributes.position.count }, (_, i) => g.Elevator_Shaft.attributes.position.getY(i))
    this.shaft = new THREE.Mesh(g.Elevator_Shaft.clone(), material(0x9c9a94, { roughness: 0.85, ...submergedSurface }))
    this.shaft.name = 'elevatorShaft'
    this.shaft.renderOrder = 3
    this.root.add(this.shaft)

    this.traffic = new TerminalTraffic(this.surface, this.containerShips, shaft.z)
    if (this.pending) this.place(this.pending)
  }

  // A flag at the top of the flagpole, streaming downwind (along the pier, -Z in the model).
  _buildFlag(pole) {
    const box = new THREE.Box3().setFromBufferAttribute(pole.attributes.position)
    const geometry = new THREE.PlaneGeometry(2.4, 1.5, 12, 1).rotateY(Math.PI / 2).translate(0, 0, -1.2)
    this.flagRest = geometry.attributes.position.array.slice()
    this.flag = new THREE.Mesh(geometry, withPortLamps(new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.8, side: THREE.DoubleSide })))
    this.flag.position.set((box.min.x + box.max.x) / 2, box.max.y - 0.8, (box.min.z + box.max.z) / 2)
    this.flag.name = 'flag'
    this.surface.add(this.flag)
  }

  // Faint beams of light below the lamps at night (additive cones from each lens).
  _buildBeams() {
    const radius = BEAM_LENGTH * Math.tan(CONE_OUTER * 0.8)
    const geometry = new THREE.ConeGeometry(radius, BEAM_LENGTH, 24, 1, true).translate(0, -BEAM_LENGTH / 2, 0)
    // Brightest at the lens, fading towards the ground.
    const colors = []
    const p = geometry.attributes.position
    for (let i = 0; i < p.count; i++) {
      const f = 1 + p.getY(i) / BEAM_LENGTH
      colors.push(f * f, f * f, f * f)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: LAMP_COLOR, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
    const beams = new THREE.InstancedMesh(geometry, this.beamMaterial, this.lamps.length)
    const down = new THREE.Vector3(0, -1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1)
    this.lamps.forEach((lamp, i) => beams.setMatrixAt(i, m.compose(lamp.position, q.setFromUnitVectors(down, lamp.direction), one)))
    beams.computeBoundingSphere()
    beams.name = 'lampBeams'
    beams.renderOrder = 2
    this.beams = beams
    this.surface.add(beams)
  }

  /** The ships' timetable (terminalPort.terminalSchedule), which keeps up with the launches. */
  setSchedule(schedule = DEFAULT_SCHEDULE) {
    this.schedule = schedule
    if (this.traffic && this.site !== null) this.traffic.setSite(this.site, schedule)
  }

  setVisible(visible) {
    this.visible = !!visible
    if (!this.visible) this.root.visible = false
  }

  /**
   * Places the terminal at a launcher's breech: { point, tangent } (planet coordinates; Launcher.startFrame).
   * Returns whether there is a terminal there (the breech is under the sea, deep enough).
   */
  place(breech) {
    if (!this.model) {
      this.pending = breech
      return false
    }
    if (this.placed && this.placed.point.equals(breech.point) && this.placed.tangent.equals(breech.tangent)) return this.active
    this.placed = { point: breech.point.clone(), tangent: breech.tangent.clone() }
    const { markers, shaft } = this.model
    const geo = ecefToGeodetic(breech.point.x, breech.point.y, breech.point.z, this.ellipsoid)
    this.active = geo.alt <= -MIN_DEPTH
    this.cables?.dispose()
    this.cables = null
    if (!this.active) {
      this.root.visible = false
      return false
    }
    // The terminal's axes: up, and +Z back from the breech along the tube (level).
    const up = upAt(geo.lat, geo.lon, new THREE.Vector3())
    const back = breech.tangent.clone().addScaledVector(up, -breech.tangent.dot(up)).normalize().negate()
    // Its origin: at sea level on the shaft's axis.
    const behind = shaft.z - markers.launcher.z
    const onAxis = breech.point.clone().addScaledVector(back, behind)
    const axis = ecefToGeodetic(onAxis.x, onAxis.y, onAxis.z, this.ellipsoid)
    const o = geodeticToECEF(axis.lat, axis.lon, 0, this.ellipsoid)
    this.root.position.set(o.x, o.y, o.z)
    upAt(axis.lat, axis.lon, up)
    back.addScaledVector(up, -back.dot(up)).normalize()
    const x = new THREE.Vector3().crossVectors(up, back)
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, back))
    this.root.updateMatrix()
    this.geo = axis

    // The underwater terminal: its launcher marker at the breech's depth.
    const drop = geo.alt - markers.launcher.y
    this.underwater.position.set(-shaft.x, drop, -shaft.z)
    // The shaft: from its top (in the floating terminal) down to the underwater terminal.
    const p = this.shaft.geometry.attributes.position
    const span = shaft.top - shaft.bottom
    for (let i = 0; i < p.count; i++) {
      const y = this.shaftHeights[i]
      p.setY(i, shaft.top - (shaft.top - y) * (span - drop) / span)
    }
    p.needsUpdate = true
    this.shaft.geometry.computeBoundingSphere()   // (its walls are vertical, so their normals stay as they are)
    this.shaft.position.set(-shaft.x, 0, -shaft.z)

    // The mooring cables: two from each anchor marker, splayed diagonally out from the ends.
    this.root.updateMatrixWorld(true)
    const toPlanet = (local) => local.applyMatrix4(this.root.matrix)
    const toLocal = (planet, target) => target.copy(planet).applyMatrix4(_inverse.copy(this.root.matrix).invert())
    const east = new THREE.Vector3(), north = new THREE.Vector3()
    eastNorth(axis.lat, axis.lon, east, north)
    const legs = []
    for (const [marker, outward] of [[markers.anchorRear, -1], [markers.anchorFront, 1]]) {
      for (const sideways of [-1, 1]) {
        const top = toPlanet(new THREE.Vector3(marker.x - shaft.x, marker.y + drop, marker.z - shaft.z))
        const direction = new THREE.Vector3(sideways, 0, outward).normalize().applyQuaternion(this.root.quaternion)
        legs.push({ top, east: direction.dot(east), north: direction.dot(north) })
      }
    }
    // +Z points back from the breech, away from the ramp. The pair shares that
    // direction so its seabed anchors remain close together rather than splaying out.
    const pretensionDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion)
    for (const fairlead of terminalPretensionAttachments(this.model)) {
      const top = toPlanet(fairlead.add(new THREE.Vector3(-shaft.x, drop, -shaft.z)))
      legs.push({ top, east: pretensionDirection.dot(east), north: pretensionDirection.dot(north),
        scope: 1 / Math.tan(5 * Math.PI / 180), shape: 100 })
    }
    this.cables = new AnchorCables({ parent: this.root, toLocal, legs, ellipsoid: this.ellipsoid, sampleHeight: this.sampleHeight })
    this.site = siteSeed(geo.lat, geo.lon)
    this.traffic.setSite(this.site, this.schedule)
    this.windKey = null
    return true
  }

  /** Updates for simulated time t, seen by `camera`, with the sun in direction `sunWorld` (world axes). */
  update(t, camera, sunWorld) {
    if (!this.model || !this.active || !this.visible) {
      this.root.visible = false
      return
    }
    this.root.updateWorldMatrix(true, false)
    const distance = camera.getWorldPosition(_camera).distanceTo(this.root.getWorldPosition(_v))
    this.root.visible = distance < MAX_DISTANCE
    if (!this.root.visible) return

    // The pier points downwind.
    const wind = windAt(this.geo.lat, this.geo.lon)
    const key = `${wind.east.toFixed(4)},${wind.north.toFixed(4)}`
    if (key !== this.windKey) {
      this.windKey = key
      const east = new THREE.Vector3(), north = new THREE.Vector3()
      eastNorth(this.geo.lat, this.geo.lon, east, north)
      const downwind = east.multiplyScalar(wind.east).addScaledVector(north, wind.north)
      if (downwind.lengthSq() < 1e-9) downwind.copy(north).negate()
      downwind.applyQuaternion(_q.copy(this.root.quaternion).invert())
      // The pier is along -Z; turning by a about +Y takes -Z to (-sin a, 0, -cos a).
      this.pivot.rotation.y = Math.atan2(-downwind.x, -downwind.z)
    }

    // Day or night
    _w.set(0, 1, 0).transformDirection(this.root.matrixWorld)
    const elevation = Math.asin(THREE.MathUtils.clamp(_sun.copy(sunWorld).normalize().dot(_w), -1, 1)) * 180 / Math.PI
    const on = smoothstep(LIGHTS_ON[0], LIGHTS_ON[1], elevation)
    this.windowMaterial.emissiveIntensity = 1.1 * on
    this.doorMaterial.emissiveIntensity = 0.35 * on
    this.lensMaterial.emissiveIntensity = 4 * on
    this.beamMaterial.opacity = 0.12 * on
    this.beams.visible = on > 0.01
    camera.updateMatrixWorld()
    this.surface.updateMatrixWorld(true)
    setLamps(this.lamps, this.surface, camera, _color.copy(LAMP_COLOR).multiplyScalar(LAMP_INTENSITY * on))

    const near = distance < DETAIL_DISTANCE
    if (near) this._waveFlag(t, windAt(this.geo.lat, this.geo.lon).speed)
    this.traffic.update(t, near)
    // (The anchors' sea floor is fixed data: once it has all loaded they stay put.)
    const version = this.terrainVersion()
    if (this.cables && !this.cables.complete && this.cables.refreshedAt !== version) {
      this.cables.refreshedAt = version
      this.cables.refresh()
    }
  }

  // The flag ripples, more in a stronger wind.
  _waveFlag(t, speed) {
    const p = this.flag.geometry.attributes.position
    const rest = this.flagRest
    const amplitude = 0.08 + 0.02 * Math.min(speed, 15)
    for (let i = 0; i < p.count; i++) {
      const along = -rest[3 * i + 2]   // 0 at the pole, 2.4 at the fly
      p.setX(i, rest[3 * i] + amplitude * along * Math.sin(3.2 * along - (2 + 0.3 * speed) * t))
    }
    p.needsUpdate = true
  }

  dispose() {
    this.cables?.dispose()
    this.traffic?.dispose()
    this.root.removeFromParent()
  }
}

const _inverse = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _color = new THREE.Color()

function smoothstep(edge0, edge1, x) {
  const f = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return f * f * (3 - 2 * f)
}

// The local vertical at (lat, lon), in three.js planet axes (x east of Greenwich, y the polar axis, z the
// Greenwich meridian).
function upAt(lat, lon, out) {
  const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180
  return out.set(Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda))
}

function eastNorth(lat, lon, east, north) {
  const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180
  east.set(Math.cos(lambda), 0, -Math.sin(lambda))
  north.set(-Math.sin(phi) * Math.sin(lambda), Math.cos(phi), -Math.sin(phi) * Math.cos(lambda))
}
