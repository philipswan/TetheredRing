import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { ecefToGeodetic, geodeticToECEF } from '../physics/geodesy.js'
import { seaIceConcentrationAt } from '../planet/seaIce.js'
import { SeaDarkening } from '../planet/seaDarkening.js'
import { hash, pickWeighted, random, vesselBasis, windAt } from './seaPlacement.js'
import shipping from '../data/shippingLanes.json' with { type: 'json' }
import { track } from '../core/PendingWork.js'
import { PixelLOD } from './PixelLOD.js'

// Container ships near the camera: under way along the shipping lanes of src/data/shippingLanes.json,
// and at anchor off major ports waiting to offload.
//
// The model (models/container_ship.obj, 1:10, +Y up, bow along +Z, waterline at y = 0) is a 287 m ship
// with 1002 FEU on deck: 21 slots along the deck (20 bays of 40 ft containers and the superstructure's),
// 11 rows across, 5 tiers. Ships are built from it in three sizes (SIZES): the hull's parallel midbody
// is lengthened or shortened by whole slots (the stern and bow, and the bays there, which the hull
// narrows, are kept), its beam scaled to the number of rows and its depth to the size, and the
// superstructure placed in one of the midbody slots, tall enough to see over the stacks. The containers
// are one instanced box per ship; each stack's height is drawn from the ship's load, its bay's and its
// own (and a bay's wing stacks are often lower).
//
// Everything is a function of the lane data, the terrain and the simulated time, so recorded shots show
// the same ships on every machine:
//  - Each lane has shipsPer100km ships in each direction, spaced along it, sailing at their own speeds
//    and keeping LANE_OFFSET to starboard of the line (less through narrow straits); they leave the lane
//    at one end and come back in at the other (out of sight: hidden within PORT_HIDE of the ends).
//  - Ships at anchor lie within their anchorage, in at least ANCHOR_DEPTH of water (from fixed terrain
//    tiles: Planet.fixedHeightSampler) and apart from each other, heading into the wind.
//  - The launcher, where the scenes look, gets ships of its own (setLauncherTraffic): one lying near its
//    start, and, along its mass driver's underwater stretch, a dozen sailing to and fro within 10 km of it.
//    A launcher on land gets a small anchorage at the nearest deep water and a short lane past it.
//    All are checked against the terrain.
// Ships are drawn within a radius of the camera's ground point that grows with its height, while it is
// below MAX_ALTITUDE, relative to an origin near the camera (planet coordinates are too large for
// float32).
//
// Cutters (models/warship.obj, in metres, loosely a coast guard cutter) are white for the coast guard or
// haze grey for the navy. A few sail each lane (CUTTERS_PER_1000KM each way), about half the anchorages
// have a coast guard cutter lying off them, and an underwater launcher has two coast guard cutters
// patrolling it, back and forth: one the whole corridor, one a beat of START_PATROL either side of its
// start.
//
// From above the sea, a hull fades into the deep-water colour below the waterline (over UNDERWATER_FADE),
// as water this clear would hide it; the sea's own darkening of what is under it (seaDarkening.js) is
// much gentler, to keep the submerged launcher tube in view.

const SHIP_SCALE = 10                 // model units to metres
const EARTH_RADIUS = 6371000          // the lanes are great circles on a sphere (as in tools/check_shipping_lanes.py)
const LANE_OFFSET = 1500
const PORT_HIDE = 2000
const ANCHOR_DEPTH = 10
const ANCHOR_SPACING = 600
const HEIGHT_LOD = 10
const MAX_ALTITUDE = 150000
const MAX_RADIUS = 250000
const KNOT = 0.514444
const BUILDS_PER_FRAME = 8           // new ships built per frame (the rest appear over the next frames)
const UNDERWATER_FADE = 2.5          // m below the waterline for a hull to fade 63% into the water
// Local traffic (setLauncherTraffic): deep water searched for out to LOCAL_SEARCH; for a launcher on land,
// a lane LOCAL_LANES long (or shorter, if that does not fit) whose ships are hidden within LOCAL_HIDE of its
// ends. Along an underwater launcher, CORRIDOR_SHIPS ships between CORRIDOR_OFFSET from it, on a corridor
// from CORRIDOR_LEAD before its start to where the water within the outer offset gets shallower than
// CORRIDOR_DEPTH.
const LOCAL_SEARCH = [3000, 6000, 10000, 15000, 20000, 30000, 40000]
const LOCAL_DEPTH = 15
const LOCAL_LANES = [100000, 60000]
const LOCAL_HIDE = 8000
const START_SHIP = [2000, 4000]
const CORRIDOR_SHIPS = 12
const CORRIDOR_OFFSET = [2000, 10000]
const CORRIDOR_LEAD = 40000
const CORRIDOR_DEPTH = 30
const CORRIDOR_MIN = 20000
const CORRIDOR_HIDE = 3000
const CUTTER_COLORS = { coastGuard: 0xf1f1ee, navy: 0x7d848a }
const CUTTERS_PER_1000KM = 0.5
const CUTTER_ANCHORAGE_CHANCE = 0.5
const START_PATROL = 15000
const PATROL_OFFSET = [1000, 3000]

// The model's deck: slot k (from the stern) is centred at z = FIRST_SLOT + k * SLOT. Slots 0-2 (where
// the hull narrows aft) have 6, 4 and 2 fewer rows than the rest; the bow's two slots 2 fewer rows and
// one fewer tier. MID_SLOTS slots between are the parallel midbody (slot 3 is the superstructure's).
const SLOT = 1.2242
const FIRST_SLOT = -11.58
const STERN_SLOTS = 3
const BOW_SLOTS = 2
const MID_SLOTS = 16
const ROW = 0.2632
const TIER = 0.314
const CONTAINER = [0.244, 0.299, 1.2]
const CONTAINER_BASE = 0.882          // the bottom of the lowest tier
const HALF_BEAM = 1.48
const BEAM_MARGIN = HALF_BEAM - 5 * ROW
const SUPERSTRUCTURE = { z: -7.905, base: 1.117, top: 2.867 }
const BRIDGE_CLEARANCE = 0.45         // the bridge's height above the highest tier

// Rows, slots (including the superstructure's), tiers, hull depth (relative to the model) and FEU on deck.
// Feeders are the small ships that call at the launcher's ocean terminal (OceanTerminal.js).
const SIZES = {
  feeder: { rows: [6, 7], slots: [7, 9], tiers: [2, 3], depth: 0.7, feu: [0, Infinity] },
  small: { rows: [7, 8], slots: [9, 12], tiers: [3, 4], depth: 0.8, feu: [200, 400] },
  medium: { rows: [11, 11], slots: [21, 21], tiers: [5, 5], depth: 1, feu: [0, Infinity] },
  large: { rows: [19, 23], slots: [26, 30], tiers: [7, 9], depth: 1.25, feu: [2500, Infinity] },
}

// Hull colours (sRGB) by line, with weights, and container colours: the same, and a few more.
const HULLS = [
  ['black', 0x1b1d20, 2],     // Hapag-Lloyd, MSC
  ['teal', 0x2a8a96, 1],      // Maersk
  ['white', 0xe9e9e4, 1],     // COSCO
  ['blue', 0x1d3d7c, 1],      // CMA CGM
  ['pink', 0xc0166e, 0.6],    // ONE
  ['green', 0x1e6a3b, 0.8],   // Evergreen
]
const CONTAINERS = {
  black: [0x2a2c2f, 0.5], teal: [0x3a9aa6, 1], white: [0xdedbd2, 0.8], blue: [0x23468e, 1], pink: [0xc8287c, 0.7],
  green: [0x2f7a3f, 0.9], yellow: [0xd9a91a, 0.6], red: [0x9e2a22, 0.8], orange: [0xd9621c, 0.7], grey: [0x8a8d8f, 0.6],
  brown: [0x6a3424, 0.6],
}
const OWN_LINE = 0.35        // the share of a ship's containers in its own line's colour
const SUPERSTRUCTURE_COLOR = 0xf2f2ee
// The model's hull: stern and bow (z), and keel (y).
const HULL_STERN = -12.794
const HULL_BOW = 15.959
const HULL_KEEL = -0.776
const ANTIFOULING = 0x7a2b25
const HOLD = 0x2e3033          // the inside of an open hull

const range = (r, [lo, hi]) => lo + Math.floor(r * (hi - lo + 1))

// A ship's design and cargo, from its seed. `loaded` is the range its load factor is drawn from.
export function shipDesign(seed, sizeWeights, loaded) {
  const r = random(seed)
  const size = pickWeighted(sizeWeights, r())
  const spec = SIZES[size]
  let rows, slots, tiers, bridge, bays, feu
  for (let attempt = 0; ; attempt++) {
    rows = range(r(), spec.rows)
    slots = range(r(), spec.slots)
    tiers = range(r(), spec.tiers)
    // Most superstructures are at the after end of the midbody, the rest anywhere along it.
    bridge = STERN_SLOTS + (r() < 0.5 ? 0 : Math.floor(r() * (slots - STERN_SLOTS - BOW_SLOTS)))
    bays = deckPlan(rows, slots, tiers).filter((b) => b.slot !== bridge)
    feu = bays.reduce((n, b) => n + b.rows * b.tiers, 0)
    if ((feu >= spec.feu[0] && feu <= spec.feu[1]) || attempt > 20) break
  }
  const hull = pickWeighted(HULLS.map((h) => [h, h[2]]), r())
  const design = { size, rows, slots, tiers, depth: spec.depth, bridge, hull: hull[1], feu }

  // Cargo: the ship's load, each bay's around it, each stack's around its bay's; wing stacks are often
  // lower. Containers are in the ship's line's colour or any other.
  const load = loaded[0] + (loaded[1] - loaded[0]) * r()
  const containerColors = Object.values(CONTAINERS)
  const own = CONTAINERS[hull[0]][0]
  const boxes = []
  const base = CONTAINER_BASE * spec.depth + CONTAINER[1] / 2
  for (const bay of bays) {
    const fill = Math.min(1, Math.max(0, load + 0.5 * (r() - 0.5)))
    for (let row = 0; row < bay.rows; row++) {
      const wing = Math.min(row, bay.rows - 1 - row) < 2 && r() < 0.4 ? 1 : 0
      const height = Math.max(0, Math.min(bay.tiers, Math.round(bay.tiers * fill + 1.6 * (r() - 0.5)) - wing))
      const x = (row - (bay.rows - 1) / 2) * ROW
      for (let tier = 0; tier < height; tier++) {
        boxes.push(x, base + tier * TIER, bay.z, r() < OWN_LINE ? own : pickWeighted(containerColors, r()))
      }
    }
  }
  design.boxes = boxes
  return design
}

// A design's hull, in metres from the model's origin: half its beam, its stern and bow (z) and its draft.
export function shipDimensions(design) {
  return {
    halfBeam: SHIP_SCALE * ((design.rows - 1) / 2 * ROW + BEAM_MARGIN),
    stern: SHIP_SCALE * HULL_STERN,
    bow: SHIP_SCALE * (HULL_BOW + (design.slots - STERN_SLOTS - BOW_SLOTS - MID_SLOTS) * SLOT),
    draft: -SHIP_SCALE * HULL_KEEL * design.depth,
  }
}

// The bays of a ship with `slots` slots (the superstructure's included): { slot, z, rows, tiers }.
function deckPlan(rows, slots, tiers) {
  const bays = []
  for (let k = 0; k < slots; k++) {
    const stern = k < STERN_SLOTS ? 2 * (STERN_SLOTS - k) : 0
    const bow = k >= slots - BOW_SLOTS
    bays.push({
      slot: k,
      z: FIRST_SLOT + k * SLOT,
      rows: Math.max(2, rows - stern - (bow ? 2 : 0)),
      tiers: tiers - (bow ? 1 : 0),
    })
  }
  return bays
}

// The hull and superstructure geometry for a design, from the model's: the midbody stretched to the
// design's slots, the beam to its rows, the depth to its size.
function reshape(geometry, design, { superstructure = false } = {}) {
  const g = geometry.clone()
  const mid = design.slots - STERN_SLOTS - BOW_SLOTS
  const zStart = FIRST_SLOT + (STERN_SLOTS - 0.5) * SLOT
  const zEnd = zStart + MID_SLOTS * SLOT
  const beam = ((design.rows - 1) / 2 * ROW + BEAM_MARGIN) / HALF_BEAM
  // The superstructure rises above the stacks; it is moved to its slot.
  const top = CONTAINER_BASE * design.depth + design.tiers * TIER + BRIDGE_CLEARANCE
  const base = SUPERSTRUCTURE.base * design.depth
  const rise = Math.max(1, (top - base) / (SUPERSTRUCTURE.top - SUPERSTRUCTURE.base))
  const shift = FIRST_SLOT + design.bridge * SLOT - SUPERSTRUCTURE.z
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * beam
    let y = p.getY(i), z = p.getZ(i)
    if (superstructure) {
      y = base + (y - SUPERSTRUCTURE.base) * rise
      z += shift
    }
    else {
      y *= design.depth
      z = z < zStart ? z : z < zEnd ? zStart + (z - zStart) * mid / MID_SLOTS : z + (mid - MID_SLOTS) * SLOT
    }
    p.setXYZ(i, x, y, z)
  }
  g.deleteAttribute('normal')
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

// A cap on the unit sphere holding every ship of `lane`: its waypoints, the great-circle arcs between them, and the
// ships' offsets to starboard. { centre, radius (radians; PI when no smaller cap holds it), ships: the lane's ship count }.
function laneCap(lane) {
  const centre = new THREE.Vector3()
  for (const p of lane.points) centre.add(p)
  let radius = Math.PI
  if (centre.lengthSq() > 1e-12) {
    centre.normalize()
    radius = 0
    for (const p of lane.points) radius = Math.max(radius, centre.angleTo(p))
    // (A cap under a hemisphere holds the shorter arcs between its points; a larger one might not.)
    if (radius >= Math.PI / 2) radius = Math.PI
    else {
      let offset = 0
      for (const s of lane.separation) offset = Math.max(offset, s)
      for (const ship of lane.ships) offset = Math.max(offset, ship.offset ?? 0)
      radius += offset / EARTH_RADIUS + 1e-6
    }
  }
  return { centre, radius, ships: lane.ships.length }
}

export class ContainerShips {
  /**
   * planet: Planet (for the terrain at anchorages); parent: the planet's coordinate system (three.js
   * planet axes); ellipsoid: { a, f }.
   */
  constructor(planet, parent, ellipsoid, { url = 'models/container_ship.obj', cutterUrl = 'models/warship.obj' } = {}) {
    this.planet = planet
    this.ellipsoid = ellipsoid
    this.group = new THREE.Group()
    this.group.name = 'containerShips'
    parent.add(this.group)
    this.visible = true
    this.model = null
    this.ships = new Map()          // id -> { design, object }
    this.geometries = new Map()
    this.hullMaterials = new Map()
    this.lanes = shipping.lanes.map((lane, i) => this._lane(lane, i))
    this.anchorages = shipping.anchorages.map((a) => ({ ...a, ships: null, building: null, count: a.ships }))
    this.lastOrigin = null
    track(new OBJLoader().loadAsync(url).then((object) => {
      const parts = {}
      object.traverse((o) => { if (o.isMesh) parts[o.name] = o.geometry })
      this.model = parts
      this.box = new THREE.BoxGeometry(...CONTAINER)
      this.containerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 })
      this.superstructureMaterial = new THREE.MeshStandardMaterial({ color: SUPERSTRUCTURE_COLOR, roughness: 0.6, side: THREE.DoubleSide })
    }).catch((error) => console.warn('[ships] model failed to load', error)))
    this.cutter = null
    track(new OBJLoader().loadAsync(cutterUrl).then((object) => {
      object.traverse((o) => { if (o.isMesh) this.cutter = o.geometry })
    }).catch((error) => console.warn('[ships] cutter model failed to load', error)))
  }

  setVisible(visible) {
    this.visible = !!visible
    this.group.visible = this.visible
  }

  // --- Lanes ----------------------------------------------------------------------------------

  _lane(lane, index) {
    const points = lane.waypoints.map(([lat, lon]) => unitVector(lat, lon))
    const separation = lane.waypoints.map((w) => (w.length > 2 ? w[2] * 1000 : LANE_OFFSET))
    const cumulative = [0]
    for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i - 1].angleTo(points[i]) * EARTH_RADIUS)
    const length = cumulative[cumulative.length - 1]
    const density = lane.shipsPer100km
    // Busier lanes carry bigger ships.
    const sizes = density >= 3 ? [['small', 0.15], ['medium', 0.45], ['large', 0.4]]
      : density >= 1 ? [['small', 0.35], ['medium', 0.45], ['large', 0.2]]
        : [['small', 0.6], ['medium', 0.4]]
    const ships = []
    const count = Math.max(1, Math.round(length / 100000 * density))
    for (const direction of [1, -1]) {
      for (let k = 0; k < count; k++) {
        const r = random(hash(index, direction, k, 5))
        ships.push({
          id: `lane${index}:${direction}:${k}`, direction, seed: hash(index, direction, k, 6), sizes,
          phase: (k + 0.8 * r()) / count * length, speed: (14 + 7 * r()) * KNOT,
        })
      }
      const cutters = density > 0 ? Math.round(length / 1e6 * CUTTERS_PER_1000KM) : 0
      for (let k = 0; k < cutters; k++) {
        const r = random(hash(index, direction, k, 13))
        ships.push({
          id: `lane${index}:${direction}:cutter${k}`, direction, kind: 'cutter', service: r() < 0.5 ? 'coastGuard' : 'navy',
          phase: (k + r()) / cutters * length, speed: (15 + 7 * r()) * KNOT,
        })
      }
    }
    return { name: lane.name, points, separation, cumulative, length, ships }
  }

  // Where a lane ship is at time t: { lat, lon, heading } (or null near the lane's ends). A ship with a
  // `patrol` [from, to] (distances along the lane) sails back and forth between them.
  _laneShipPose(lane, ship, t) {
    let s, direction = ship.direction
    if (ship.patrol) {
      const [from, to] = ship.patrol, beat = to - from
      let u = (ship.phase + ship.speed * t) % (2 * beat)
      if (u < 0) u += 2 * beat
      direction = u < beat ? 1 : -1
      s = from + (u < beat ? u : 2 * beat - u)
    }
    else {
      s = (ship.phase + direction * ship.speed * t) % lane.length
      if (s < 0) s += lane.length
      const hide = lane.hide ?? PORT_HIDE
      if (s < hide || s > lane.length - hide) return null
    }
    const c = lane.cumulative
    let i = 0, j = c.length - 1
    while (j - i > 1) {
      const m = (i + j) >> 1
      if (c[m] <= s) i = m
      else j = m
    }
    const a = lane.points[i], b = lane.points[i + 1]
    const angle = a.angleTo(b)
    const f = angle > 0 ? (s - c[i]) / (c[i + 1] - c[i]) : 0
    // Position and direction of travel along the great circle a -> b.
    const sa = Math.sin((1 - f) * angle), sb = Math.sin(f * angle), sin = Math.sin(angle) || 1
    _p.copy(a).multiplyScalar(sa / sin).addScaledVector(b, sb / sin).normalize()
    _t.copy(a).multiplyScalar(-Math.cos((1 - f) * angle)).addScaledVector(b, Math.cos(f * angle)).normalize()
    if (direction < 0) _t.negate()
    // Keep to starboard.
    _r.crossVectors(_t, _p).normalize()
    const offset = (ship.offset ?? lane.separation[i]) / EARTH_RADIUS
    _p.multiplyScalar(Math.cos(offset)).addScaledVector(_r, Math.sin(offset)).normalize()
    const lat = Math.asin(_p.z) * 180 / Math.PI, lon = Math.atan2(_p.y, _p.x) * 180 / Math.PI
    const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180
    const east = -Math.sin(lambda) * _t.x + Math.cos(lambda) * _t.y
    const north = -Math.sin(phi) * Math.cos(lambda) * _t.x - Math.sin(phi) * Math.sin(lambda) * _t.y + Math.cos(phi) * _t.z
    return { lat, lon, heading: Math.atan2(east, north) }
  }

  // --- Local traffic --------------------------------------------------------------------------

  /**
   * Ships around a launcher, where the scenes look. `track`: [lat, lon, altitude] along its tube from the
   * start (every km or so). One ship lies START_SHIP from the start; along the tube's underwater stretch
   * (if it is at least CORRIDOR_MIN long), CORRIDOR_SHIPS sail to and fro; otherwise the nearest deep
   * water gets a small anchorage and a lane past it. Replaces the previous launcher's traffic.
   */
  async setLauncherTraffic(track) {
    if (!track.length) return
    const [lat, lon] = track[0]
    const key = `${lat.toFixed(4)},${lon.toFixed(4)},${track.length}`
    if (this.localKey === key) return
    this.localKey = key
    this.lanes = this.lanes.filter((lane) => !lane.local)
    this.anchorages = this.anchorages.filter((a) => !a.local)
    const seed = hash(Math.round(lat * 1e4), Math.round(lon * 1e4), 11)
    const r = random(seed)
    const turn = r() * 2 * Math.PI
    // The underwater stretch, from the start until the tube comes out of the sea.
    let wet = 0
    while (wet < track.length && track[wet][2] < 0) wet++
    const underwater = track.slice(0, wet)
    if (underwater.length * 1000 >= CORRIDOR_MIN) {
      await this._startShip(lat, lon, r, seed, key)
      await this._corridor(underwater, r, seed, key)
      return
    }
    await this._localLane(lat, lon, turn, seed, key)
  }

  // One ship lying near the launcher's start.
  async _startShip(lat, lon, r, seed, key) {
    const distance = START_SHIP[0] + (START_SHIP[1] - START_SHIP[0]) * r()
    const turn = r() * 2 * Math.PI
    for (let k = 0; k < 16; k++) {
      const [lat1, lon1] = this._along(lat, lon, turn + k * Math.PI / 8, distance)
      const h = await this._height(lat1, lon1)
      if (this.localKey !== key) return
      if (h === null || h > -LOCAL_DEPTH) continue
      this.anchorages.push({ name: 'launcher start', lat: lat1, lon: lon1, radiusKm: 0.3, count: 1, ships: null, building: null, local: true, seed: seed + 1 })
      return
    }
  }

  // Ships sailing to and fro along the launcher's underwater stretch.
  async _corridor(track, r, seed, key) {
    // Where the water either side of the track stays deep enough.
    let end = track.length - 1
    for (let i = 0; i < track.length; i += 2) {
      const next = track[Math.min(track.length - 1, i + 1)], here = track[i]
      const bearing = this._bearing(here, next)
      let ok = true
      for (const side of [-1, 0, 1]) {
        const h = await this._height(...this._along(here[0], here[1], bearing + Math.PI / 2, side * CORRIDOR_OFFSET[1]))
        if (h === null || h > -CORRIDOR_DEPTH) { ok = false; break }
      }
      if (this.localKey !== key) return
      if (!ok) { end = i; break }
    }
    if (end * 1000 < CORRIDOR_MIN) return
    // The corridor: a lead-in before the start, then the track every 5 km.
    const back = this._bearing(track[1] ?? track[0], track[0])
    const waypoints = [this._along(track[0][0], track[0][1], back, CORRIDOR_LEAD)]
    for (let i = 0; i < end; i += 5) waypoints.push(track[i].slice(0, 2))
    waypoints.push(track[end].slice(0, 2))
    const lane = this._lane({ name: 'launcher', shipsPer100km: 0, waypoints }, seed)
    lane.local = true
    lane.hide = CORRIDOR_HIDE
    // Spread along the stretch past the start, each at its own distance to starboard of the tube.
    lane.ships = Array.from({ length: CORRIDOR_SHIPS }, (_, k) => {
      const d = [r(), r(), r(), r()]
      return {
        id: `launcher${seed}:${k}`, direction: d[0] < 0.5 ? 1 : -1, seed: hash(seed, k, 12),
        sizes: [['small', 0.4], ['medium', 0.45], ['large', 0.15]],
        phase: CORRIDOR_LEAD + (k + d[1]) / CORRIDOR_SHIPS * (lane.length - CORRIDOR_LEAD),
        speed: (14 + 6 * d[2]) * KNOT,
        offset: CORRIDOR_OFFSET[0] + (CORRIDOR_OFFSET[1] - CORRIDOR_OFFSET[0]) * d[3],
      }
    })
    // Coast guard cutters patrolling the launcher: the whole corridor, and a beat around its start.
    const patrols = [[CORRIDOR_HIDE + 1000, lane.length - CORRIDOR_HIDE - 1000], [CORRIDOR_LEAD - START_PATROL, CORRIDOR_LEAD + START_PATROL]]
    patrols.forEach((patrol, k) => {
      const d = [r(), r(), r()]
      lane.ships.push({
        id: `launcher${seed}:patrol${k}`, kind: 'cutter', service: 'coastGuard', patrol,
        phase: d[0] * 2 * (patrol[1] - patrol[0]), speed: (12 + 4 * d[1]) * KNOT,
        offset: PATROL_OFFSET[0] + (PATROL_OFFSET[1] - PATROL_OFFSET[0]) * d[2],
      })
    })
    this.lanes.push(lane)
  }

  _bearing([lat0, lon0], [lat1, lon1]) {
    const phi0 = lat0 * Math.PI / 180, phi1 = lat1 * Math.PI / 180, dl = (lon1 - lon0) * Math.PI / 180
    return Math.atan2(Math.sin(dl) * Math.cos(phi1), Math.cos(phi0) * Math.sin(phi1) - Math.sin(phi0) * Math.cos(phi1) * Math.cos(dl))
  }

  // A small anchorage at the nearest deep water to (lat, lon), and a lane past it.
  async _localLane(lat, lon, turn, seed, key) {
    let spot = null
    search: for (const distance of LOCAL_SEARCH) {
      for (let k = 0; k < 16; k++) {
        const bearing = turn + k * Math.PI / 8
        const [lat1, lon1] = this._along(lat, lon, bearing, distance)
        const h = await this._height(lat1, lon1)
        if (h !== null && h <= -LOCAL_DEPTH) { spot = [lat1, lon1]; break search }
      }
    }
    if (!spot || this.localKey !== key) return
    this.anchorages.push({ name: 'local', lat: spot[0], lon: spot[1], radiusKm: 3, count: 3, ships: null, building: null, local: true, seed })
    for (const length of LOCAL_LANES) {
      for (let k = 0; k < 8; k++) {
        const bearing = turn + k * Math.PI / 8
        const ends = [this._along(...spot, bearing, length / 2), this._along(...spot, bearing + Math.PI, length / 2)]
        if (!(await this._laneInWater(ends))) continue
        if (this.localKey !== key) return
        const lane = this._lane({ name: 'local', shipsPer100km: 200000 / length, waypoints: ends }, seed)
        lane.local = true
        lane.hide = LOCAL_HIDE
        this.lanes.push(lane)
        return
      }
    }
  }

  // The point `distance` m from (lat, lon) along the great circle at `bearing` (clockwise from north).
  _along(lat, lon, bearing, distance) {
    const p = unitVector(lat, lon), d = distance / EARTH_RADIUS
    const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180
    const east = new THREE.Vector3(-Math.sin(lambda), Math.cos(lambda), 0)
    const north = new THREE.Vector3(-Math.sin(phi) * Math.cos(lambda), -Math.sin(phi) * Math.sin(lambda), Math.cos(phi))
    const t = north.multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing))
    p.multiplyScalar(Math.cos(d)).addScaledVector(t, Math.sin(d))
    return [Math.asin(p.z) * 180 / Math.PI, Math.atan2(p.y, p.x) * 180 / Math.PI]
  }

  // Whether a lane between two points, and the tracks either side of it, are all in deep enough water.
  async _laneInWater([a, b]) {
    const pa = unitVector(...a), pb = unitVector(...b)
    const steps = Math.ceil(pa.angleTo(pb) * EARTH_RADIUS / 2000)
    for (let i = 0; i <= steps; i++) {
      const p = pa.clone().lerp(pb, i / steps).normalize()
      const lat = Math.asin(p.z) * 180 / Math.PI, lon = Math.atan2(p.y, p.x) * 180 / Math.PI
      const bearing = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2
      for (const side of [-1, 0, 1]) {
        const h = await this._height(...this._along(lat, lon, bearing, side * LANE_OFFSET))
        if (h === null || h > -LOCAL_DEPTH) return false
      }
    }
    return true
  }

  // --- Anchorages -----------------------------------------------------------------------------

  /** Re-anchors the ships in the new weather (seaPlacement.setWeatherDate): they lie to the wind. */
  resetWeather() {
    for (const anchorage of this.anchorages) {
      anchorage.ships = null
      anchorage.building = null
    }
  }

  async _buildAnchorage(anchorage, index) {
    const build = anchorage.building = {}
    const r = random(anchorage.seed ?? hash(index, 9))
    const wind = windAt(anchorage.lat, anchorage.lon)
    const ships = []
    for (let k = 0; k < anchorage.count * 3 && ships.length < anchorage.count; k++) {
      const d = [r(), r(), r(), r()]
      const radius = anchorage.radiusKm * 1000 * Math.sqrt(d[0]), angle = 2 * Math.PI * d[1]
      const north = radius * Math.cos(angle), east = radius * Math.sin(angle)
      if (ships.some((s) => Math.hypot(s.east - east, s.north - north) < ANCHOR_SPACING)) continue
      const lat = anchorage.lat + north / 111320
      const lon = anchorage.lon + east / (111320 * Math.cos(anchorage.lat * Math.PI / 180))
      const h = await this._height(lat, lon)
      if (h === null || h > -ANCHOR_DEPTH) continue
      ships.push({
        id: `anchor${anchorage.seed ?? index}:${k}`, lat, lon, east, north, heading: wind.from + (d[2] - 0.5) * 0.6,
        seed: hash(anchorage.seed ?? index, k, 10), sizes: [['small', 0.3], ['medium', 0.4], ['large', 0.3]],
      })
    }
    // About half the ports have a coast guard cutter lying off the anchorage.
    if (!anchorage.local && r() < CUTTER_ANCHORAGE_CHANCE) {
      const angle = 2 * Math.PI * r(), radius = anchorage.radiusKm * 1100
      const north = radius * Math.cos(angle), east = radius * Math.sin(angle)
      const lat = anchorage.lat + north / 111320
      const lon = anchorage.lon + east / (111320 * Math.cos(anchorage.lat * Math.PI / 180))
      const h = await this._height(lat, lon)
      if (h !== null && h <= -ANCHOR_DEPTH) {
        ships.push({ id: `anchor${anchorage.seed ?? index}:cutter`, lat, lon, heading: wind.from + (r() - 0.5) * 0.6, kind: 'cutter', service: 'coastGuard' })
      }
    }
    if (anchorage.building === build) { // (not if resetWeather has been called since)
      anchorage.ships = ships
      anchorage.building = null
    }
  }

  async _height(lat, lon) {
    const p = geodeticToECEF(lat, lon, 0, this.ellipsoid)
    const direction = new THREE.Vector3(p.z, p.y, -p.x).normalize()   // the planet renderer's tile frame
    const sampler = await this.planet.fixedHeightSampler(direction, HEIGHT_LOD)
    return sampler ? sampler(direction) : null
  }

  // --- Ships ----------------------------------------------------------------------------------

  _geometry(key, make) {
    let g = this.geometries.get(key)
    if (!g) {
      g = make()
      this.geometries.set(key, g)
    }
    return g
  }

  // A hull's material: `color` above the waterline (model y = 0), antifouling below it; `scale` is
  // metres per model unit. `doubleSided` for the container ship's hull (and its superstructure), which
  // are partly open surfaces rather than closed shells and would show holes from behind; the cutter's
  // hull is closed.
  _hullMaterial(color, scale = SHIP_SCALE, doubleSided = true) {
    const key = `${color}:${scale}:${doubleSided}`
    let material = this.hullMaterials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide })
      // Antifouling red below the waterline (model y < 0); inside an open hull, the hold's dark grey.
      material.onBeforeCompile = (shader) => {
        shader.uniforms.shipSeaParams = SeaDarkening.uniforms().seaParams
        shader.uniforms.shipSeaTint = SeaDarkening.uniforms().seaTint
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vShipModelY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShipModelY = position.y;')
        const red = new THREE.Color(ANTIFOULING), hold = new THREE.Color(HOLD)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vShipModelY;\nuniform vec2 shipSeaParams;\nuniform vec3 shipSeaTint;')
          .replace('#include <color_fragment>', `#include <color_fragment>
if (vShipModelY < -0.02) diffuseColor.rgb = vec3(${red.r.toFixed(4)}, ${red.g.toFixed(4)}, ${red.b.toFixed(4)});
if (!gl_FrontFacing) diffuseColor.rgb = vec3(${hold.r.toFixed(4)}, ${hold.g.toFixed(4)}, ${hold.b.toFixed(4)});`)
          // From above the sea (shipSeaParams.y), the hull below the waterline fades into the water.
          .replace('#include <opaque_fragment>', `if (shipSeaParams.y > 0.5 && vShipModelY < 0.0)
  outgoingLight = mix(outgoingLight, shipSeaTint, 1.0 - exp(vShipModelY * ${(scale / UNDERWATER_FADE).toFixed(3)}));
#include <opaque_fragment>`)
      }
      material.customProgramCacheKey = () => `shipHull:${scale}`
      this.hullMaterials.set(key, material)
    }
    return material
  }

  /** Whether the container ship model has loaded (buildShip needs it). */
  get ready() {
    return this.model !== null
  }

  /**
   * A container ship (a group, in metres: +Y up, bow along +Z, waterline at y = 0) for a shipDesign. Its
   * containers are its last child, an InstancedMesh with one instance per design box, in order.
   */
  buildShip(design) {
    return this._buildShip(design)
  }

  _buildShip(design) {
    if (design.kind === 'cutter') {
      const cutter = new THREE.Mesh(this.cutter, this._hullMaterial(design.color, 1, false))
      cutter.name = 'cutter'
      const root = new THREE.Group()
      root.add(cutter)
      return root
    }
    const root = new THREE.Group()
    root.name = 'containerShip'
    root.scale.setScalar(SHIP_SCALE)
    const shape = `${design.rows}:${design.slots}:${design.depth}`
    const hull = this._geometry(`hull:${shape}`, () => reshape(this.model.Hull, design))
    const superstructure = this._geometry(`super:${shape}:${design.tiers}:${design.bridge}`,
      () => reshape(this.model.Superstructure, design, { superstructure: true }))
    root.add(new THREE.Mesh(hull, this._hullMaterial(design.hull)))
    root.add(new THREE.Mesh(superstructure, this.superstructureMaterial))
    const n = design.boxes.length / 4
    if (n > 0) {
      const containers = new THREE.InstancedMesh(this.box, this.containerMaterial, n)
      const m = new THREE.Matrix4(), color = new THREE.Color()
      for (let i = 0; i < n; i++) {
        const [x, y, z, c] = design.boxes.slice(4 * i, 4 * i + 4)
        containers.setMatrixAt(i, m.makeTranslation(x, y, z))
        containers.setColorAt(i, color.setHex(c))
      }
      containers.computeBoundingSphere()
      root.add(containers)
    }
    return root
  }

  // Shows `vessel` (a lane or anchorage ship) at (lat, lon), building it the first time; `loaded` is the
  // range a container ship's load is drawn from.
  _show(vessel, loaded, lat, lon, heading, seen) {
    const id = vessel.id
    let ship = this.ships.get(id)
    if (!ship) {
      const cutter = vessel.kind === 'cutter'
      if ((cutter && !this.cutter) || (!cutter && !this.model) || this.builds-- <= 0) return
      const design = cutter ? { kind: 'cutter', color: CUTTER_COLORS[vessel.service] } : shipDesign(vessel.seed, vessel.sizes, loaded)
      ship = { design, object: this._buildShip(design) }
      this.ships.set(id, ship)
      this.group.add(ship.object)
    }
    const p = geodeticToECEF(lat, lon, 0, this.ellipsoid)
    vesselBasis(lat, lon, heading, _m)
    ship.object.quaternion.setFromRotationMatrix(_m)
    ship.object.position.set(p.x, p.y, p.z).sub(this.group.position)
    ship.object.visible = true
    ship.pose = { lat, lon, heading }
    seen.add(id)
  }

  /** Places the ships for simulated time t (s) as seen from `camera`. */
  update(t, camera) {
    if (!this.model && !this.cutter) return
    const parent = this.group.parent
    parent.updateWorldMatrix(true, false)
    const cam = parent.worldToLocal(camera.getWorldPosition(new THREE.Vector3()))
    const geo = ecefToGeodetic(cam.x, cam.y, cam.z, this.ellipsoid)
    const seen = new Set()
    // (While recording, every ship in range is built at once: a frame must not depend on which came before.)
    this.builds = PixelLOD.buildBudget === Infinity ? Infinity : BUILDS_PER_FRAME
    if (this.visible && geo.alt < MAX_ALTITUDE) {
      // The instances are relative to an origin near the camera: the nearest point of a 0.1 degree grid (so a
      // function of where the camera is, not of where it was when the origin last moved).
      const lat0 = Math.round(geo.lat * 10) / 10, lon0 = Math.round(geo.lon * 10) / 10
      if (!this.lastOrigin || this.lastOrigin.lat !== lat0 || this.lastOrigin.lon !== lon0) {
        const o = geodeticToECEF(lat0, lon0, 0, this.ellipsoid)
        this.group.position.set(o.x, o.y, o.z)
        this.lastOrigin = { lat: lat0, lon: lon0 }
      }
      const radius = Math.min(MAX_RADIUS, 60000 + 1.5 * Math.max(0, geo.alt))
      const cosRadius = Math.cos(radius / EARTH_RADIUS)
      const here = unitVector(geo.lat, geo.lon)
      const near = (lat, lon) => unitVector(lat, lon, _q).dot(here) > cosRadius && seaIceConcentrationAt(lat, lon) < 0.15
      for (const lane of this.lanes) {
        // (A lane none of whose ships can be in range is skipped whole: the same ships are shown.)
        if (lane.cap?.ships !== lane.ships.length) lane.cap = laneCap(lane)
        if (lane.cap.radius < Math.PI / 2 && here.angleTo(lane.cap.centre) > lane.cap.radius + radius / EARTH_RADIUS) continue
        for (const ship of lane.ships) {
          const pose = this._laneShipPose(lane, ship, t)
          if (pose && near(pose.lat, pose.lon)) this._show(ship, [0.35, 1], pose.lat, pose.lon, pose.heading, seen)
        }
      }
      this.anchorages.forEach((anchorage, index) => {
        const within = unitVector(anchorage.lat, anchorage.lon, _q).dot(here) > Math.cos((radius + anchorage.radiusKm * 1000) / EARTH_RADIUS)
        if (!within) return
        if (!anchorage.ships && !anchorage.building) {
          track(this._buildAnchorage(anchorage, index).catch((error) => console.warn('[ships]', error)))
        }
        for (const ship of anchorage.ships ?? []) {
          if (near(ship.lat, ship.lon)) this._show(ship, [0.75, 1], ship.lat, ship.lon, ship.heading, seen)
        }
      })
    }
    for (const [id, ship] of this.ships) {
      if (seen.has(id)) continue
      ship.object.visible = false
    }
    // Ships long out of sight are dropped (their shared geometry is kept).
    if (this.ships.size > 2 * seen.size + 100) {
      for (const [id, ship] of this.ships) {
        if (seen.has(id)) continue
        ship.object.removeFromParent()
        for (const child of ship.object.children) if (child.isInstancedMesh) child.dispose()
        this.ships.delete(id)
      }
    }
  }
}

function unitVector(lat, lon, out = new THREE.Vector3()) {
  const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180
  return out.set(Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi))
}

const _p = new THREE.Vector3()
const _t = new THREE.Vector3()
const _r = new THREE.Vector3()
const _q = new THREE.Vector3()
const _m = new THREE.Matrix4()
