import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { ecefToGeodetic, geodeticToECEF } from '../physics/geodesy.js'
import { seaIceConcentrationAt } from '../planet/seaIce.js'
import { hash, offsetLatLon, pickWeighted, random, vesselBasis, windAt } from './seaPlacement.js'

// Sailboats on the sea near the camera, as references for scale: some at anchor close to the shore (no
// sails, pointing into the wind, still), the rest sailing, more of them near the shore than offshore.
//
// The model (models/sailboat.obj, metres, +Y up, bow along +Z) has its sails and spinnaker set to
// starboard (-X), for the wind from port; with the wind from starboard its rig is drawn mirrored. Its
// length is 8.5 m; boats are scaled to 6.5-13.5 m overall, more of them small.
//
// Everything is a pure function of the terrain data and the simulated time, so recorded shots show
// the same boats on every machine:
//  - The sea is divided into cells CELL_DEG of latitude high (and about as wide). Each cell has
//    CANDIDATES places, drawn from a random sequence seeded by the cell's indices. Each place is
//    classified from the terrain heights of a fixed tile (Planet.fixedHeightSampler: the deepest tile
//    covering it, down to HEIGHT_LOD, not whatever is loaded for display): it needs MIN_DEPTH of water
//    (and, where the ground is generated, to be SHORE_CLEARANCE off its coastline: Planet.coastDistance),
//    and is near the shore if there is land within NEAR_SHORE, mid-distance within MID_SHORE.
//  - The wind is the day's weather at the boat (seaPlacement.windAt).
//  - A sailing boat sails a "racetrack": a straight leg on a reach, a turn, the reciprocal leg, and a
//    turn back, at speeds from a simple polar for each leg's angle to the wind (capped at its hull
//    speed). A boat with a spinnaker flies it when the wind is well aft of the beam (and furls its jib).
//    It heels to leeward, in proportion to its speed and more on the wind than off it.
//  - No boats where there is sea ice at the date (seaIce.js).
// Boats are drawn within SPAWN_RADIUS of the camera's ground point while the camera is below
// MAX_ALTITUDE (further away they would be under a pixel), with instanced meshes placed relative to an
// origin near the camera (planet coordinates are too large for float32).
//
// They cast and receive shadows (the sails on the deck and on each other) from the sun's local shadows
// (Lighting.enableLocalShadows), centred on the boat nearest the camera (shadowFocus). three.js looks a
// shadow up from the float32 world position, which is only good to ~0.5 m this far from the planet's
// centre, so the boats' materials look it up from their position relative to the boats' origin instead,
// through boatShadowMatrix (the light's shadow matrix times the group's world matrix, in float64).

const CELL_DEG = 0.02
const CANDIDATES = 4
const HEIGHT_LOD = 10
const MIN_DEPTH = 3
const SHORE_CLEARANCE = 25 // (m from the generated ground's coastline, where there is one)
const NEAR_SHORE = 1000
const MID_SHORE = 4000
const SPAWN_RADIUS = 20000
const MAX_ALTITUDE = 30000
const MAX_BOATS = 2000
const MODEL_LENGTH = 8.5
// Chances, for each candidate place, of an anchored or a sailing boat.
const ANCHORED = { near: 0.3, mid: 0, off: 0 }
const SAILING = { near: 0.35, mid: 0.15, off: 0.01 }
const KITE_CHANCE = 0.35
// The shadows' focus is the nearest boat within this distance of the camera's ground point (m).
const SHADOW_FOCUS_RANGE = 3000

const KNOT = 0.514444
// Hull colours (sRGB) and their weights: mostly white.
const HULL_COLORS = [
  [0xf4f4f0, 5], [0xefe6cf, 1], [0x1d2b4f, 1.5], [0x1f4d3a, 1], [0x9c2b23, 1], [0x8fb8d8, 0.7],
  [0x1a1a1a, 0.6], [0x8a9096, 0.6], [0xe3c34a, 0.3],
]
// Spinnakers: horizontal bands [from, to, colour] in the sail's height (its texture's v runs from 0.25
// at the foot to 1 at the head).
const SPINNAKERS = [
  [[0.25, 0.5, '#1e3f8f'], [0.5, 0.75, '#f2f2f2'], [0.75, 1, '#c8202a']],
  [[0.25, 0.86, '#152a52'], [0.86, 1, '#f2f2f2']],
  [[0.25, 0.8, '#f2c21b'], [0.8, 1, '#c8202a']],
  [[0.25, 0.375, '#6a2c91'], [0.375, 0.5, '#1f6fc4'], [0.5, 0.625, '#2e9d4a'], [0.625, 0.75, '#f2d21b'], [0.75, 0.875, '#f08a1c'], [0.875, 1, '#d6262d']],
  [[0.25, 1, '#f2f2f2'], [0.5, 0.56, '#1f4fa8'], [0.66, 0.72, '#1f4fa8']],
  [[0.25, 0.44, '#2a7d3c'], [0.44, 0.62, '#f2f2f2'], [0.62, 0.81, '#2a7d3c'], [0.81, 1, '#f2f2f2']],
]

// Angle in (-pi, pi].
function wrap(angle) {
  return angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI))
}

// Fraction of a boat's top speed at `beta` radians off the wind.
function polar(beta) {
  const deg = beta * 180 / Math.PI
  if (deg < 35) return 0
  if (deg < 50) return 0.8 * (deg - 35) / 15
  if (deg < 90) return 0.8 + 0.2 * (deg - 50) / 40
  if (deg < 130) return 1
  return 1 - 0.2 * (deg - 130) / 50
}

// Heel (radians) for a boat at `beta` off the wind making `speedKnots`: more on the wind than off it.
function heelFor(beta, speedKnots, k) {
  const upwind = beta < Math.PI / 2 ? 1 + 0.6 * Math.cos(beta) : 0.7 - 0.4 * (beta - Math.PI / 2) / (Math.PI / 2)
  return THREE.MathUtils.degToRad(Math.min(30, speedKnots * k * upwind))
}

// A copy of a geometry mirrored across x = 0 (with its triangles' winding kept outward).
function mirrored(geometry) {
  const g = geometry.clone()
  g.scale(-1, 1, 1)
  for (const attribute of Object.values(g.attributes)) {
    const a = attribute.array, n = attribute.itemSize
    for (let i = 0; i < attribute.count; i += 3) {
      for (let c = 0; c < n; c++) {
        const t = a[(i + 1) * n + c]
        a[(i + 1) * n + c] = a[(i + 2) * n + c]
        a[(i + 2) * n + c] = t
      }
    }
  }
  return g
}

const boatShadowMatrix = { value: new THREE.Matrix4() }
const SHADOW_COORD = 'vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;'
if (!THREE.ShaderChunk.shadowmap_vertex.includes(SHADOW_COORD)) console.warn('[sailboats] three.js shadowmap_vertex changed: boat shadows will be imprecise')

// Has a boat material look its shadow up from its position relative to the boats' origin.
function withLocalShadows(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.boatShadowMatrix = boatShadowMatrix
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 boatShadowMatrix;')
      .replace('#include <shadowmap_vertex>', THREE.ShaderChunk.shadowmap_vertex.replace(SHADOW_COORD,
        'vDirectionalShadowCoord[ i ] = boatShadowMatrix * ( instanceMatrix * vec4( transformed, 1.0 ) )' +
        ' + directionalShadowMatrix[ i ] * vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0.0 );'))
  }
  material.customProgramCacheKey = () => 'sailboatLocalShadows'
  return material
}

function spinnakerTexture(bands) {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  for (const [from, to, color] of bands) {
    ctx.fillStyle = color
    ctx.fillRect(0, Math.floor((1 - to) * canvas.height), canvas.width, Math.ceil((to - from) * canvas.height))
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class Sailboats {
  /**
   * planet: Planet (for the terrain); parent: the planet's coordinate system (three.js planet axes:
   * x east of Greenwich, y the polar axis, z the Greenwich meridian); ellipsoid: { a, f }.
   */
  constructor(planet, parent, ellipsoid, { url = 'models/sailboat.obj' } = {}) {
    this.planet = planet
    this.ellipsoid = ellipsoid
    this.group = new THREE.Group()
    this.group.name = 'sailboats'
    parent.add(this.group)
    this.visible = true
    this.cells = new Map()       // cell key -> boats (an array, once its terrain has been read)
    this.active = []
    this.lastRefresh = null
    this.meshes = null
    this.shadowLight = null      // see setShadowLight
    this.shadowFocus = null      // the nearest boat (world axes), or null
    this._nearest = new THREE.Vector3()
    new OBJLoader().loadAsync(url).then((object) => this._build(object))
      .catch((error) => console.warn('[sailboats] model failed to load', error))
  }

  /** The light whose shadows the boats cast and receive (Lighting.enableLocalShadows). */
  setShadowLight(light) {
    this.shadowLight = light
  }

  setVisible(visible) {
    this.visible = !!visible
    this.group.visible = this.visible
  }

  _build(object) {
    const parts = {}
    object.traverse((o) => { if (o.isMesh) parts[o.name] = o.geometry })
    // At anchor the boom is along the centreline: swung about the mast from where the model has it.
    const boom = parts.Boom.clone()
    boom.computeBoundingBox()
    const pivotZ = boom.boundingBox.max.z
    const p = boom.attributes.position
    let aft = 0
    for (let i = 1; i < p.count; i++) if (p.getZ(i) < p.getZ(aft)) aft = i
    const angle = Math.atan(-p.getX(aft) / (p.getZ(aft) - pivotZ))
    boom.translate(0, 0, -pivotZ).rotateY(angle).translate(0, 0, pivotZ)

    const hull = withLocalShadows(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }))
    const metal = withLocalShadows(new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.6 }))
    // Sailcloth: a little sheen, so the sails' curve shows; the jib a slightly different cloth from the
    // main, as it often is, so the two can be told apart where they overlap.
    const main = withLocalShadows(new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.6, side: THREE.DoubleSide }))
    const jib = withLocalShadows(new THREE.MeshStandardMaterial({ color: 0xdedacf, roughness: 0.6, side: THREE.DoubleSide }))
    const setShadowMatrix = () => {
      if (this.shadowLight) boatShadowMatrix.value.multiplyMatrices(this.shadowLight.shadow.matrix, this.group.matrixWorld)
    }
    const mesh = (geometry, material, name) => {
      const m = new THREE.InstancedMesh(geometry, material, MAX_BOATS)
      m.name = name
      m.count = 0
      m.frustumCulled = false
      m.castShadow = true
      m.receiveShadow = true
      m.onBeforeRender = setShadowMatrix
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(m)
      return m
    }
    const pair = (geometry, material, name) => [mesh(geometry, material, name), mesh(mirrored(geometry), material, `${name}Mirrored`)]
    this.meshes = {
      hull: mesh(parts.Hull, hull, 'sailboatHull'),
      mast: mesh(parts.Mast, metal, 'sailboatMast'),
      boomCentred: mesh(boom, metal, 'sailboatBoom'),
      boom: pair(parts.Boom, metal, 'sailboatBoomOut'),
      main: pair(parts.Mainsail, main, 'sailboatMainsail'),
      jib: pair(parts.Jib, jib, 'sailboatJib'),
      kites: SPINNAKERS.map((bands, i) => pair(parts.Spinnaker, withLocalShadows(
        new THREE.MeshStandardMaterial({ map: spinnakerTexture(bands), roughness: 0.6, side: THREE.DoubleSide })), `sailboatSpinnaker${i}`)),
    }
    this.meshes.hull.setColorAt(0, new THREE.Color())   // creates instanceColor
  }

  // --- Geometry on the ellipsoid --------------------------------------------------------------

  _point(lat, lon, out = new THREE.Vector3()) {
    const p = geodeticToECEF(lat, lon, 0, this.ellipsoid)
    return out.set(p.x, p.y, p.z)
  }

  // Unit direction of a point in the planet renderer's tile frame (see CubedSpherePlanetRenderer).
  _tileDirection(lat, lon) {
    const p = this._point(lat, lon)
    return new THREE.Vector3(p.z, p.y, -p.x).normalize()
  }

  // The point `east` and `north` metres from (lat, lon) along the surface (small offsets).
  _offset(lat, lon, east, north) {
    return offsetLatLon(this.ellipsoid, lat, lon, east, north)
  }

  async _height(lat, lon) {
    const direction = this._tileDirection(lat, lon)
    const sampler = await this.planet.fixedHeightSampler(direction, HEIGHT_LOD)
    return sampler ? sampler(direction) : null
  }

  async _water(lat, lon) {
    const h = await this._height(lat, lon)
    if (h === null || h > -MIN_DEPTH) return false
    // Where the ground is generated (Planet.coastDistance), its coastline, which is much sharper than the tile's.
    const coast = await this.planet.coastDistance?.(lat, lon)
    return coast === null || coast === undefined || coast < -SHORE_CLEARANCE
  }

  async _landWithin(lat, lon, distance) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4
      const h = await this._height(...this._offset(lat, lon, distance * Math.sin(a), distance * Math.cos(a)))
      if (h !== null && h > 0) return true
    }
    return false
  }

  // --- Placement ------------------------------------------------------------------------------

  _cellCount(i) {
    const lat = -90 + (i + 0.5) * CELL_DEG
    return Math.max(1, Math.floor(360 * Math.cos(lat * Math.PI / 180) / CELL_DEG))
  }

  async _buildCell(i, j) {
    const count = this._cellCount(i)
    const r = random(hash(i, j, 1))
    // Every candidate draws the same numbers whatever its terrain, so the result does not depend on
    // which places turn out to be water.
    const draws = Array.from({ length: CANDIDATES }, () => Array.from({ length: 12 }, r))
    const boats = []
    for (const d of draws) {
      const lat = -90 + (i + d[0]) * CELL_DEG
      const lon = -180 + (j + d[1]) * 360 / count
      if (!(await this._water(lat, lon))) continue
      const zone = (await this._landWithin(lat, lon, NEAR_SHORE)) ? 'near'
        : (await this._landWithin(lat, lon, MID_SHORE)) ? 'mid' : 'off'
      const anchored = d[2] < ANCHORED[zone]
      if (!anchored && d[2] >= ANCHORED[zone] + SAILING[zone]) continue
      const wind = windAt(lat, lon)
      const length = 6.5 + 7 * Math.pow(d[3], 1.8)
      const boat = {
        lat, lon, anchored, wind,
        scale: length / MODEL_LENGTH,
        color: new THREE.Color(pickWeighted(HULL_COLORS, d[4])),
        heelK: 1.6 + d[5],
        kite: d[6] < KITE_CHANCE ? Math.floor(d[7] * SPINNAKERS.length) : -1,
      }
      if (anchored) {
        boat.heading = wind.from + (d[8] - 0.5) * 0.5
      } else if (!(await this._track(boat, length, d))) {
        continue
      }
      boats.push(boat)
    }
    return boats
  }

  // A sailing boat's racetrack, shortened (up to twice) until it is all on water. False if none fits.
  async _track(boat, length, d) {
    const { wind } = boat
    // Leg A's angle off the wind: a reach; a boat with a spinnaker sails leg A broad enough to fly it.
    const alpha = THREE.MathUtils.degToRad(boat.kite >= 0 ? 100 + 40 * d[8] : 55 + 70 * d[8])
    const side = d[9] < 0.5 ? -1 : 1
    const heading = wind.from + side * alpha
    const hullSpeed = 1.34 * Math.sqrt(0.85 * length * 3.281)
    const top = Math.min(hullSpeed, 1 + 0.55 * wind.knots)
    const legSpeed = (beta) => Math.max(1.5, top * polar(beta) * (boat.kite >= 0 && beta > Math.PI * 0.53 ? 1.1 : 1))
    const speedA = Math.min(hullSpeed, legSpeed(alpha)), speedB = Math.min(hullSpeed, legSpeed(Math.PI - alpha))
    let leg = 300 + 2700 * d[10]
    const radius = 15 + 25 * d[11] * boat.scale
    const along = (e, n, s) => [e + Math.sin(heading) * s, n + Math.cos(heading) * s]
    const right = [Math.sin(heading + Math.PI / 2), Math.cos(heading + Math.PI / 2)]
    for (let attempt = 0; attempt < 3; attempt++, leg /= 2) {
      const checks = []
      for (const s of [0, leg / 2, leg]) {
        for (const k of [0, 2]) {
          const [e, n] = along(right[0] * radius * k, right[1] * radius * k, s)
          checks.push(this._offset(boat.lat, boat.lon, e, n))
        }
      }
      let ok = true
      for (const [lat, lon] of checks) if (!(await this._water(lat, lon))) { ok = false; break }
      if (!ok) continue
      const vA = speedA * KNOT, vB = speedB * KNOT, vT = 0.55 * Math.min(vA, vB)
      const turn = Math.PI * radius / vT
      boat.track = { heading, leg, radius, vA, vB, tA: leg / vA, tB: leg / vB, turn, right }
      boat.track.period = boat.track.tA + boat.track.tB + 2 * turn
      boat.track.phase = d[11] * boat.track.period
      boat.top = top
      return true
    }
    return false
  }

  // Where a sailing boat is at time t: [east, north] from its start, and its heading.
  _alongTrack(track, t) {
    const { heading: H, leg, radius: r, tA, tB, turn, right } = track
    const d = [Math.sin(H), Math.cos(H)]
    let s = (t + track.phase) % track.period
    if (s < 0) s += track.period
    if (s < tA) {
      const x = leg * s / tA
      return [d[0] * x, d[1] * x, H]
    }
    s -= tA
    if (s < turn) {
      const phi = Math.PI * s / turn
      const c = [d[0] * leg + right[0] * r, d[1] * leg + right[1] * r]
      return [c[0] - right[0] * r * Math.cos(phi) + d[0] * r * Math.sin(phi),
        c[1] - right[1] * r * Math.cos(phi) + d[1] * r * Math.sin(phi), H + phi]
    }
    s -= turn
    if (s < tB) {
      const x = leg * (1 - s / tB)
      return [d[0] * x + right[0] * 2 * r, d[1] * x + right[1] * 2 * r, H + Math.PI]
    }
    s -= tB
    const phi = Math.PI * s / turn
    return [right[0] * r + right[0] * r * Math.cos(phi) - d[0] * r * Math.sin(phi),
      right[1] * r + right[1] * r * Math.cos(phi) - d[1] * r * Math.sin(phi), H + Math.PI + phi]
  }

  // --- Per frame ------------------------------------------------------------------------------

  // The cells near the camera's ground point, building those not yet built (asynchronously).
  _refreshCells(lat, lon) {
    const dLat = SPAWN_RADIUS / 111000
    const i0 = Math.floor((lat - dLat + 90) / CELL_DEG), i1 = Math.floor((lat + dLat + 90) / CELL_DEG)
    const keep = new Set()
    this.active = []
    for (let i = i0; i <= i1; i++) {
      const count = this._cellCount(i)
      const cellLat = -90 + (i + 0.5) * CELL_DEG
      const dLon = SPAWN_RADIUS / (111000 * Math.max(0.01, Math.cos(cellLat * Math.PI / 180)))
      const j0 = Math.floor((lon - dLon + 180) / 360 * count), j1 = Math.floor((lon + dLon + 180) / 360 * count)
      for (let jj = j0; jj <= j1; jj++) {
        const j = ((jj % count) + count) % count
        const key = `${i}:${j}`
        keep.add(key)
        let cell = this.cells.get(key)
        if (!cell) {
          cell = { boats: null }
          this.cells.set(key, cell)
          this._buildCell(i, j).then((boats) => { cell.boats = boats })
            .catch((error) => { cell.boats = []; console.warn('[sailboats]', error) })
        }
        this.active.push(cell)
      }
    }
    if (this.cells.size > 4 * keep.size + 1000) {
      for (const key of [...this.cells.keys()]) if (!keep.has(key)) this.cells.delete(key)
    }
  }

  /** Forgets the boats placed so far (they are placed again, in the new weather: seaPlacement.setWeatherDate). */
  resetWeather() {
    this.cells.clear()
  }

  /** Places the boats for simulated time t (s) as seen from `camera`. */
  update(t, camera) {
    if (!this.meshes) return
    const counts = new Map()
    // Adds an instance of `mesh`; returns its index.
    const add = (mesh, matrix) => {
      const n = counts.get(mesh) ?? 0
      mesh.setMatrixAt(n, matrix)
      counts.set(mesh, n + 1)
      return n
    }
    const camWorld = camera.getWorldPosition(_v1)
    const parent = this.group.parent
    parent.updateWorldMatrix(true, false)
    const cam = parent.worldToLocal(camWorld.clone())
    const geo = ecefToGeodetic(cam.x, cam.y, cam.z, this.ellipsoid)
    if (this.visible && geo.alt < MAX_ALTITUDE) {
      const moved = this.lastRefresh ? Math.hypot(...this._metresBetween(this.lastRefresh, geo)) : Infinity
      if (moved > 500) {
        this._refreshCells(geo.lat, geo.lon)
        this.lastRefresh = { lat: geo.lat, lon: geo.lon }
        // The instances are placed relative to the point below the camera.
        this._point(geo.lat, geo.lon, this.group.position)
      }
      this.shadowFocus = this._placeBoats(t, add, geo) ? this.group.localToWorld(this._nearest.clone()) : null
    }
    else {
      this.shadowFocus = null
    }
    for (const m of this._allMeshes()) {
      m.count = counts.get(m) ?? 0
      if (m.count) m.instanceMatrix.needsUpdate = true
    }
    if (this.meshes.hull.instanceColor) this.meshes.hull.instanceColor.needsUpdate = true
  }

  _metresBetween(a, b) {
    return [(b.lon - a.lon) * 111000 * Math.cos(a.lat * Math.PI / 180), (b.lat - a.lat) * 111000]
  }

  _allMeshes() {
    const m = this.meshes
    return [m.hull, m.mast, m.boomCentred, ...m.boom, ...m.main, ...m.jib, ...m.kites.flat()]
  }

  // Places the boats; returns whether one is within SHADOW_FOCUS_RANGE (it is then in this._nearest).
  _placeBoats(t, add, camera) {
    const m = this.meshes
    let n = 0, nearest = SHADOW_FOCUS_RANGE * SHADOW_FOCUS_RANGE, found = false
    for (const cell of this.active) {
      if (!cell.boats) continue
      for (const boat of cell.boats) {
        if (n >= MAX_BOATS) return found
        let lat = boat.lat, lon = boat.lon, heading = boat.heading, heel = 0, windFromPort = true, kite = false
        if (!boat.anchored) {
          const [east, north, psi] = this._alongTrack(boat.track, t)
          ;[lat, lon] = this._offset(boat.lat, boat.lon, east, north)
          heading = psi
          const offWind = wrap(boat.wind.from - psi)       // where the wind comes from, relative to the bow
          const beta = Math.abs(offWind)
          windFromPort = offWind < 0
          kite = boat.kite >= 0 && beta > Math.PI * 0.53
          heel = heelFor(beta, boat.top * polar(beta), boat.heelK) * (windFromPort ? 1 : -1)
        }
        const [dEast, dNorth] = this._metresBetween(camera, { lat, lon })
        const d2 = dEast * dEast + dNorth * dNorth
        if (d2 > SPAWN_RADIUS * SPAWN_RADIUS) continue
        if (seaIceConcentrationAt(lat, lon) > 0.15) continue
        this._boatMatrix(lat, lon, heading, heel, boat.scale, _matrix)
        if (d2 < nearest) {
          nearest = d2
          found = true
          this._nearest.setFromMatrixPosition(_matrix)
        }
        m.hull.setColorAt(add(m.hull, _matrix), boat.color)
        add(m.mast, _matrix)
        const side = windFromPort ? 0 : 1
        if (boat.anchored) {
          add(m.boomCentred, _matrix)
        } else {
          add(m.boom[side], _matrix)
          add(m.main[side], _matrix)
          if (kite) add(m.kites[boat.kite][side], _matrix)
          else add(m.jib[side], _matrix)
        }
        n++
      }
    }
    return found
  }

  // The model's matrix for a boat at (lat, lon) with `heading` (radians clockwise from north), heeled by
  // `heel` (radians about the bow axis; positive lowers the starboard side), relative to the group.
  _boatMatrix(lat, lon, heading, heel, scale, out) {
    vesselBasis(lat, lon, heading, out)
    out.multiply(_heel.makeRotationZ(heel))
    out.scale(_scale.setScalar(scale))
    this._point(lat, lon, _v2).sub(this.group.position)
    out.setPosition(_v2)
    return out
  }
}

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _scale = new THREE.Vector3()
const _matrix = new THREE.Matrix4()
const _heel = new THREE.Matrix4()
