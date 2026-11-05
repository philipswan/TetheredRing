import * as THREE from 'three'
import * as tram from '../utils/tram.js'
import * as markers from '../ring/markers.js'
import { tetheredRingSystem } from '../ring/tetheredRingSystem.js'
import { TetherGeometry, balancedPointBxAvePercent } from '../ring/tethers.js'
import { placeAtHeightInRingPlane } from '../ring/ringGeometry.js'
import { TetherRoots } from '../ring/TetherRoots.js'
import { StructureLines } from '../scene/structureLines.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { Highlights } from '../scene/Highlights.js'

const UNIVERSE = { gravitationalConstant: 6.67408e-11 }
// Distant tether forks are merged once their branches would be less than this far apart on screen.
const TETHER_MERGE_PIXELS = 0.1
// Tether copies whose force-balanced designs (tetherPointBxAvePercent) are this close share geometry.
const TETHER_DESIGN_STEP = 0.2 // percentage points (about 11 m of anchor position, 0.05% of the force)
const SEA_WATER_DENSITY = 1025 // kg/m^3

// Owns the tethered ring structure itself: one tetheredRingSystem per ring (presets can request
// several), their tethers, and the diagnostic markers (planet axis, equator, ring curve, force
// arrows). rebuild() tears everything down and recreates it from the current derived parameters.
export class RingAssembly {
  constructor({ store, planetSpec, planetCoordSys, ringSpecs, specs }) {
    this.store = store
    this.planetSpec = planetSpec
    this.planetRadius = tram.radiusAtLatitude(0, planetSpec.ellipsoid)
    this.planetCoordSys = planetCoordSys
    this.ringSpecs = ringSpecs
    this.specs = specs
    // Tethers are drawn relative to a point near each tether so their vertices stay small (float32
    // precision); the exact path is only needed for KML export, which uses absolute coordinates.
    this.fastTetherRender = true
    this.systems = []
    this.tethers = []
    this.ctv = new tram.commonTetherVariables()
    this.forceArrowFlags = { tensile: false, gravity: false, inertial: false }

    const d = store.derived
    // Tethers are drawn at their real diameters (see src/scene/structureLines.js).
    this.tetherMaterial = StructureLines.createMaterial(store.get('tetherColor'))

    this.createSystems()
    // Tethers first: computing them fills this.ctv, which the force arrows read.
    this.constructTethers()
    this.earthAxis = new markers.earthAxisObject(planetCoordSys, d, this.planetRadius)
    this.earthEquator = new markers.earthEquatorObject(planetCoordSys, d, this.planetRadius)
    this.mainRingCurveMarker = new markers.mainRingCurveObject(this.refCoordSys, d, this.mainRingCurve, this.referencePoint())
    this.gravityForceArrows = new markers.gravityForceArrowsObject(planetCoordSys, d, this.mainRingCurve, this.crv, this.ctv, this.planetRadius, this.ringToPlanetRotation)
    this.gyroscopicForceArrows = new markers.gyroscopicForceArrowsObject(planetCoordSys, d, this.mainRingCurve, this.crv, this.planetRadius, this.ringToPlanetRotation, this.movingRingSpeed())
  }

  // The first ring drives the transit system, launcher and camera helpers.
  get primary() { return this.systems[0] }
  get refCoordSys() { return this.primary.getMesh() }
  get crv() { return this.primary.crv }
  get mainRingCurve() { return this.primary.mainRingCurve }
  get ringToPlanetRotation() { return this.primary.ringToPlanetQuaternion }

  referencePoint() {
    return new THREE.Vector3(0, this.planetRadius + this.crv.currentMainRingAltitude, 0)
  }

  createSystems({ genKMLFile = false, kmlFile = '' } = {}) {
    const d = this.store.derived
    this.ringSpecs.forEach((ringSpec, index) => {
      const system = new tetheredRingSystem(d, UNIVERSE, this.planetSpec, ringSpec, index, genKMLFile, kmlFile)
      this.systems.push(system)
      this.planetCoordSys.add(system.getMesh())
      // The ring's highlight from afar, where its segments are not drawn.
      system.highlightStandIn = Highlights.curveStandIn(system.mainRingCurve, 'ring', { closed: true, chunks: 128 })
      system.getMesh().add(system.highlightStandIn)
    })
    this.planetCoordSys.updateWorldMatrix(true)
    for (const system of this.systems) system.getMesh().updateMatrixWorld(true)
  }

  constructTethers({ genSpecs = false, genKMLFile = false, kmlFile = '' } = {}) {
    const d = this.store.derived
    this.tetherGeometries = []
    this.tetherRoots = []
    for (const system of this.systems) {
      const list = []
      if (d.showTethers.value || genSpecs) {
        const refCoordSys = system.getMesh()
        const crv = system.crv
        const fast = this.fastTetherRender && !genKMLFile
        const seaWaterDensity = this.planetSpec.hasOcean ? SEA_WATER_DENSITY : 0
        // The nominal design (a circular ring on the equatorial-radius sphere): the specs, and the
        // forces from which the moving ring's speed was found.
        const geometry = new TetherGeometry(this.planetSpec, crv, this.ctv, d, this.specs, fast, genKMLFile, kmlFile, genSpecs, this.planetCoordSys, refCoordSys, { separateRoots: fast, seaWaterDensity })
        this.tetherGeometries.push(geometry)
        if (fast) {
          // Copies of a tether geometry (from the first forks up), instanced around the ring by rotation
          // about the ring axis and moved onto the ring (see mainRingCurve). Each copy picks how many of
          // its last forks to merge from how far apart those branches are on screen. The roots below
          // the first forks reach the ground under each copy (TetherRoots).
          const n = d.numTethers.value
          const k = 2 * Math.PI * 2 / n
          const designs = new Map()
          const designFor = (step, axialTension) => {
            if (!designs.has(step)) {
              const g = new TetherGeometry(this.planetSpec, crv, new tram.commonTetherVariables(), d, {}, true, false, '', false, this.planetCoordSys, refCoordSys, { separateRoots: true, seaWaterDensity, pointBxAvePercent: step * TETHER_DESIGN_STEP, axialTension })
              this.tetherGeometries.push(g)
              const levels = [g, ...g.mergedForkGeometries]
              for (const level of levels) level.userData.shared = true
              designs.set(step, { levels, fanWidths: g.forkFanWidths, rootProfiles: g.rootProfiles })
            }
            return designs.get(step)
          }
          const copies = []
          for (let i = 0; i < n / 2; i++) {
            const theta = i * k
            const { top, matrix, axialTension, radialTension } = this.ringForcesAt(system, theta)
            const step = Math.round(balancedPointBxAvePercent(this.planetSpec, crv, d, axialTension, radialTension) / TETHER_DESIGN_STEP)
            const design = designFor(step, axialTension)
            const tether = this.createTetherLOD(design.levels, design.fanWidths)
            tether.position.copy(top)
            tether.matrixAutoUpdate = false
            tether.matrix.copy(matrix)
            copies.push({ matrix, position: top, profiles: design.rootProfiles })
            list.push(tether)
            refCoordSys.add(tether)
          }
          // The thickest member (the trunks just below the first forks) gets the full glow.
          const thickest = Math.max(...copies.flatMap(copy => copy.profiles.filter(Boolean).map(profile => 2 * Math.sqrt(Math.max(...profile.areas) / Math.PI))))
          if (thickest > 0) StructureLines.setReferenceDiameter(this.tetherMaterial, thickest)
          const roots = new TetherRoots({ copies, refCoordSys, ringToPlanetQuaternion: system.ringToPlanetQuaternion, ellipsoid: this.planetSpec.ellipsoid, material: this.tetherMaterial })
          if (this.terrainSampler) roots.setTerrain(this.terrainSampler, this.terrainVersion)
          this.tetherRoots.push(roots)
          list.push(...roots.meshes)
        }
        else {
          // Exact (per-tether) path: geometry comes in chunks, each relative to its own origin.
          for (const { origin, geometry: chunk } of geometry.localChunks ?? []) {
            const tether = new THREE.LineSegments(chunk, this.tetherMaterial)
            tether.name = 'tether'
            tether.renderOrder = 1
            tether.position.copy(origin)
            list.push(tether)
            refCoordSys.add(tether)
          }
        }
      }
      list.forEach(tether => Highlights.tag(tether, 'tethers'))
      this.tethers.push(list)
    }
  }

  // Level v is the full geometry (v = 0) or a merged-fork variant (see TetherGeometry). It is used
  // while the next variant's merged fan (forkFanWidths[v+1]) would be wider than TETHER_MERGE_PIXELS.
  // PixelLOD with a 1 m size measures pixels per metre at the tether's ring end, where the forks are.
  createTetherLOD(levelGeometries, forkFanWidths) {
    const lod = new PixelLOD(1)
    lod.name = 'tether'
    levelGeometries.forEach((g, level) => {
      const nextFan = forkFanWidths[level + 1]
      lod.addLevel(nextFan ? TETHER_MERGE_PIXELS / nextFan : 0, () => {
        const line = new THREE.LineSegments(g, this.tetherMaterial)
        line.name = 'tether'
        line.renderOrder = 1 // after the planet, so the ring is visible through it
        return line
      })
    })
    return lod
  }

  // The point on a ring at azimuth theta about its axis (ring frame), and the pull its tethers must give
  // there (N per metre of ring, in the ring's cylindrical frame) for the forces on it to cancel:
  // gravity, and the centrifugal load of the moving ring, which moves at one speed all the way round,
  // so that load goes as the ring's curvature (the ring is a slightly elliptical section of the
  // flattened planet). Scaled from the nominal design's forces (this.ctv: a circle of mainRingRadius on
  // the equatorial-radius sphere), which is what the moving ring's speed was found from.
  ringForcesAt(system, theta) {
    const crv = system.crv
    const yAxis = new THREE.Vector3(0, 1, 0)
    const reference = new THREE.Vector3().setFromSphericalCoords(this.planetRadius + crv.currentMainRingAltitude, -(Math.PI / 2 - crv.currentEquivalentLatitude), 0)
    const pointAt = (angle) => placeAtHeightInRingPlane(reference.clone().applyAxisAngle(yAxis, angle), crv.currentMainRingAltitude, system.ringToPlanetQuaternion, this.planetSpec.ellipsoid, system.mainRingCurve.planeOffset)
    const top = pointAt(theta)
    // Curvature: the circle through the ring points either side.
    const p0 = pointAt(theta - 0.01), p2 = pointAt(theta + 0.01)
    const a = p0.clone().sub(p2), b = top.clone().sub(p2)
    const axb = a.clone().cross(b)
    const center = b.clone().multiplyScalar(a.lengthSq()).sub(a.clone().multiplyScalar(b.lengthSq())).cross(axb).divideScalar(2 * axb.lengthSq()).add(p2)
    const outward = top.clone().sub(center)
    const curvature = 1 / outward.length()
    outward.normalize()
    const nominalGravity = this.ctv.gravityForceAtRing[0]
    const types = this.ctv.inertialForceAtRing
    const nominalCentrifugal = types.reduce((sum, f) => sum + f.ρ, 0) / types.length
    const gravity = top.clone().normalize().multiplyScalar(-Math.hypot(nominalGravity.ρ, nominalGravity.z) * (reference.length() / top.length())**2)
    const centrifugal = outward.multiplyScalar(nominalCentrifugal * crv.mainRingRadius * curvature)
    // The ring has no stiffness of its own (only the moving ring's hoop load, which acts along the
    // curve's normal), so the tethers must cancel every component, including the small one of gravity
    // along the ring (the planet's centre is not quite square to an elliptical ring). A tether hangs in
    // a vertical plane: turn that plane about the local vertical at its top until it holds the pull.
    // (Applied as a shear, below, so that the tops stay on the rings.)
    const pull = gravity.add(centrifugal).negate()
    const up = top.clone().normalize()
    const radial0 = new THREE.Vector3(top.x, 0, top.z).normalize()   // away from the ring's axis
    const side0 = yAxis.clone().cross(radial0)
    const turn = new THREE.Quaternion()
    let angle = 0
    for (let i = 0; i < 4; i++) {
      turn.setFromAxisAngle(up, angle)
      const side = side0.clone().applyQuaternion(turn)
      angle -= pull.dot(side) / pull.dot(up.clone().cross(side))
    }
    turn.setFromAxisAngle(up, angle)
    // The copy's placement in the ring frame: moved onto the ring, about the ring axis to its azimuth,
    // and two shears of the tether (in its own frame, before the rotation):
    // - the turn: each point moves along the ring by the turn times its horizontal distance out from
    //   the ring, as the turn would move it, except that its tops, which fan out along the ring for
    //   kilometres, stay on the rings;
    // - the fan onto the ring: the tops were designed along a circle about the ring axis, but the
    //   (elliptical) ring there runs at a slight angle to it, so each point moves in the ring's plane
    //   by that angle times its distance along the ring.
    const up0 = reference.clone().normalize()
    const out0 = new THREE.Vector3(reference.x, 0, reference.z).normalize()   // in the ring's plane
    const horizontal0 = out0.clone().addScaledVector(up0, -out0.dot(up0)).normalize()
    const along0 = up0.clone().cross(horizontal0)
    const tangent0 = p2.clone().sub(p0).applyAxisAngle(yAxis, -theta).normalize()
    const fanAngle = tangent0.dot(out0) / tangent0.dot(along0)
    const m = [0, 1, 2].map(i => [0, 1, 2].map(j =>
      angle * along0.getComponent(i) * horizontal0.getComponent(j) + fanAngle * out0.getComponent(i) * along0.getComponent(j)))
    const shear = new THREE.Matrix4().set(
      1 + m[0][0], m[0][1], m[0][2], 0,
      m[1][0], 1 + m[1][1], m[1][2], 0,
      m[2][0], m[2][1], 1 + m[2][2], 0,
      0, 0, 0, 1)
    const matrix = new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromAxisAngle(yAxis, theta), new THREE.Vector3(1, 1, 1)).multiply(shear)
    return {
      top,
      matrix,
      sidewaysTurn: angle,
      axialTension: pull.dot(yAxis.clone().applyQuaternion(turn)),
      radialTension: pull.dot(radial0.applyQuaternion(turn)),
    }
  }

  // sampleHeight(latDeg, lonDeg) -> {heightMeters} | null (null while its data loads) and version() (goes
  // up as it does), so the tether roots reach the ground (see TetherRoots).
  setTerrain(sampleHeight, version) {
    this.terrainSampler = sampleHeight
    this.terrainVersion = version
    for (const roots of this.tetherRoots) roots.setTerrain(sampleHeight, version)
  }

  // Once per frame.
  update() {
    for (const roots of this.tetherRoots) roots.update()
  }

  disposeTethers() {
    for (const list of this.tethers) {
      for (const tether of list) tether.parent?.remove(tether)
    }
    // Clones share one geometry per ring; the material is shared by all rings and kept.
    for (const geometry of this.tetherGeometries ?? []) {
      geometry.dispose()
      for (const chunk of geometry.localChunks ?? []) chunk.geometry.dispose()
      for (const merged of geometry.mergedForkGeometries ?? []) merged.dispose()
    }
    for (const roots of this.tetherRoots) roots.dispose()
    this.tethers = []
    this.tetherGeometries = []
    this.tetherRoots = []
  }

  // Rebuilds rings and tethers from the current parameters. Returns KML text when requested.
  rebuild({ genSpecs = false, genKMLFile = false } = {}) {
    this.disposeTethers()
    for (const system of this.systems) {
      Highlights.disposeStandIn(system.highlightStandIn)
      system.destroy()
    }
    this.systems = []
    this.store.derive()
    const kmlFile = ''
    this.createSystems({ genKMLFile, kmlFile })
    this.constructTethers({ genSpecs, genKMLFile, kmlFile })
    this.updateMarkers()
    if (genSpecs) tram.updateMovingRingSpecs(this.store.derived, this.crv, this.specs)
    tram.updateTransitSystemSpecs(this.store.derived, this.crv, this.specs)
    const ringKml = this.systems.map(system => system.kmlFile ?? '').join('')
    return ringKml + (this.tetherGeometries ?? []).map(g => g.kmlFile ?? '').join('')
  }

  updateMarkers() {
    const d = this.store.derived
    this.earthAxis.update(d, this.planetRadius)
    this.earthEquator.update(d, this.planetRadius)
    this.mainRingCurveMarker.update(this.refCoordSys, d, this.mainRingCurve, this.referencePoint())
    const f = this.forceArrowFlags
    this.gravityForceArrows.update(d, this.mainRingCurve, this.crv, this.ctv, this.planetRadius, this.ringToPlanetRotation, f.tensile, f.gravity, f.inertial)
    this.gyroscopicForceArrows.update(d, this.mainRingCurve, this.crv, this.planetRadius, this.ringToPlanetRotation, this.movingRingSpeed())
  }

  // Physical moving-ring speed from the specs, once the tether/ring maths has computed it.
  movingRingSpeed() {
    return this.specs.movingRingsSpeed?.value
  }

  showAllForceArrows() {
    this.forceArrowFlags = { tensile: true, gravity: true, inertial: true }
    this.updateMarkers()
  }

  // Moves ring `index` between its build and final locations (parameters with suffix '' or '2').
  adjustLatLon(index) {
    const d = this.store.derived
    const suffix = index === 0 ? '' : String(index + 1)
    const system = this.systems[index]
    if (!system) return
    system.adjustLatLon({
      buildLat: d[`buildLocationRingCenterLatitude${suffix}`].value,
      buildLon: d[`buildLocationRingCenterLongitude${suffix}`].value,
      finalLat: d[`finalLocationRingCenterLatitude${suffix}`].value,
      finalLon: d[`finalLocationRingCenterLongitude${suffix}`].value,
    }, d[`moveRingFactor${suffix}`].value)
  }

  setTetherUniforms() {
    this.tetherMaterial.uniforms.color.value.set(this.store.get('tetherColor'))
  }

  // Short summary shown in the GUI "TextOutput" folder after a specs update.
  specsSummaryHtml() {
    const s = this.specs
    const fmt = (key) => s[key] ? `${s[key].value.toFixed(2)} ${s[key].units}` : 'n/a'
    return [
      "(Press 'S' to update)",
      `<i>Total Tethered Ring Cost</i>: ${fmt('sumOfAllCapitalCosts')}`,
      `<i>Total Tethered Ring Cost Per Kg Supported</i>: ${fmt('capitalCostPerKgSupported')}`,
      `<i>Total Stored Energy in TWh</i>: ${fmt('movingRingsTotalKineticEnergyTWh')}`,
      `<i>Moving Ring's Speed</i>: ${fmt('movingRingsSpeed')}`,
    ].join('<br/>')
  }
}
