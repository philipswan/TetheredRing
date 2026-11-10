import * as THREE from 'three'
import { GlowTube } from '../scene/GlowTube.js'
import { glowTubeMaterial } from '../scene/glowMaterials.js'
import { virtualLaunchVehicle, launchVehicleNozzleDimensions } from './LaunchVehicle.js'
import { exhaustPlume, plasmaTrailPoint, shockLayerEmission } from './hypersonicGlow.js'

// The light of the launch vehicles in flight through the air (physics in hypersonicGlow.js), from the
// moment each leaves the evacuated tube:
// - the plasma: an envelope of hot gas around each vehicle from the tip of its nose, and the glowing
//   wake it leaves behind it. Each point of the trail shines as the air was heated when the vehicle
//   passed it (emission ~ density x speed^4) and cools with its age, so the trail fades out as the
//   vehicle climbs out of the air;
// - the hydrolox exhaust plume behind the nozzle, while the engine is burning.
//
// Nothing is remembered from frame to frame: the trail is rebuilt each frame from the vehicle's
// trajectory at earlier times (frameAt), so it is a function of the parameters and the time, like
// everything animated, and any moment of a shot can be rendered on its own.
//
// The glow is not in the main scene. It is light without a surface, so the clouds' distance prepass
// (which draws the main scene) must not see it, and it is drawn over the clouds when they are below it:
// App.render draws `scene` before the clouds with the camera under the cloud tops and after them above.

const TRAIL_RINGS = 96
const PLUME_RINGS = 40
const TRAIL_COOLING_TIMES = 6        // the trail is drawn back to this many cooling times (e^-6 = 0.25%)
const MIN_EMISSION = 1e-4            // a trail or plume whose emissivity stays below this is not drawn

const STANDARD_PRESSURE = 101325  // Pa

export class LaunchVehicleGlow {

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.name = 'launchVehicleGlow'
    // Stands in for planetCoordSys: its matrix is copied from it before drawing.
    this.root = new THREE.Group()
    this.root.matrixAutoUpdate = false
    this.scene.add(this.root)
    this.material = glowTubeMaterial()
    this.inUse = new Map()     // launch index -> { trail, plume }
    // (One pair from the start, so that App.precompileShaders finds the material before it is needed.)
    this.spare = [this.newTubes()]
    this.anyVisible = false
    this.rgb = [0, 0, 0]
    this.visualRadiusScale = 1
    this.visualLengthScale = 1
    this.showPlasma = false
    this.showExhaust = false
  }

  configure(d, planetSpec) {
    this.planetSpec = planetSpec
    this.visualRadiusScale = d.launcherVisualRadiusScale?.value ?? 1
    this.visualLengthScale = d.launcherVisualLengthScale?.value ?? 1
    this.showPlasma = d['showLaunchVehiclePlasma']?.value ?? true
    this.showExhaust = d['showLaunchVehicleExhaust']?.value ?? true
    this.plasmaBrightness = d['launchVehiclePlasmaBrightness'].value
    this.coolingTime = Math.max(1e-3, d['launchVehiclePlasmaCoolingTime'].value)
    this.exhaustBrightness = d['launchVehicleExhaustBrightness'].value
    this.seaLevelExhaustVelocity = d['launchVehicleSeaLevelRocketExhaustVelocity'].value
    this.vacuumExhaustVelocity = d['launchVehicleVacuumRocketExhaustVelocity'].value
    const isLunar = d['launchFromPlanet']?.value === 'Moon'

    // The vehicle as drawn (LaunchVehicle.js): its scale factors, length, radius and drag area.
    const scale = d['launchVehicleScaleFactor'].value
    const forwardScale = d['launchSystemForwardScaleFactor'].value * scale
    const radialScale = 0.5 * (d['launchSystemRightwardScaleFactor'].value + d['launchSystemUpwardScaleFactor'].value) * scale
    const bodyRadius = d['launchVehicleRadius'].value * radialScale
    const hullLength = d['launchVehicleBodyLength'].value + d['launchVehicleNoseconeLength'].value
    this.noseToBase = (isLunar ? Math.max(hullLength * 0.6, 2 * d['launchVehicleRadius'].value) : hullLength) * forwardScale
    this.shape = {
      noseToBase: this.noseToBase,
      bodyRadius,
      dragArea: d['launchVehicleCoefficientOfDrag'].value * Math.PI * bodyRadius * bodyRadius,
    }
    // The lunar vehicle has no nozzle.
    const nozzle = launchVehicleNozzleDimensions(d)
    this.engine = isLunar ? null : {
      exitRadius: nozzle.exitRadius * radialScale,
      throatRadius: nozzle.throatRadius * radialScale,
      lipAngle: Math.atan2(Math.tan(nozzle.lipAngle) * radialScale, forwardScale),
      chamberPressure: d['launchVehicleEngineChamberPressure'].value,
      referenceMassFlowRate: d['launchVehiclePropellantMassFlowRate'].value,
    }
  }

  // Rebuilds the glow of every launch in flight at the launch vehicles' reference frame's time.
  update() {
    const v = virtualLaunchVehicle
    const refFrame = v.refFrames?.[0]
    const planetRadius = v.planetRadius   // altitudes as the vehicle class measures them
    const used = new Set()
    this.anyVisible = false
    if (refFrame && v.isVisible && v.numObjects > 0 && this.planetSpec && (this.showPlasma || this.showExhaust)) {
      v.activeObjects.forEach((obj, launchIndex) => {
        const deltaT = obj.deltaTAt(refFrame)
        if (deltaT === null) return
        const now = obj.frameAt(refFrame, deltaT)
        if (now.f.curve.name !== 'freeFlightPositionCurve') return   // still in the tube (or on the ramp)
        const tubes = this.tubesFor(launchIndex)
        const trail = this.showPlasma && this.buildTrail(tubes.trail, obj, refFrame, deltaT, now, planetRadius)
        const plume = this.showExhaust && this.buildPlume(tubes.plume, now, planetRadius)
        if (trail || plume) {
          used.add(launchIndex)
          this.anyVisible = true
        }
      })
    }
    // Return the tubes of launches no longer glowing
    this.inUse.forEach((tubes, launchIndex) => {
      if (used.has(launchIndex)) return
      tubes.trail.visible = false
      tubes.plume.visible = false
      this.spare.push(tubes)
      this.inUse.delete(launchIndex)
    })
  }

  newTubes() {
    const tubes = {
      trail: new GlowTube(TRAIL_RINGS, this.material, { name: 'launchVehiclePlasma' }),
      plume: new GlowTube(PLUME_RINGS, this.material, { name: 'launchVehicleExhaust' }),
    }
    tubes.trail.visible = false
    tubes.plume.visible = false
    this.root.add(tubes.trail, tubes.plume)
    return tubes
  }

  tubesFor(launchIndex) {
    let tubes = this.inUse.get(launchIndex)
    if (!tubes) {
      tubes = this.spare.pop() ?? this.newTubes()
      this.inUse.set(launchIndex, tubes)
    }
    tubes.trail.visible = false
    tubes.plume.visible = false
    return tubes
  }

  // Air speed (m/s) and density (kg/m^3) at a point of the free flight.
  airAt(frame, planetRadius) {
    const f = frame.f
    const altitude = f.point.length() - planetRadius
    const density = this.planetSpec.airDensityAtAltitude(altitude)
    const tc = f.curve.freeFlightTelemetryCurve
    const telemetry = f.curve.telemetryAtTime?.(f.t) ?? (tc ? (f.byT ? tc.getPoint(f.i) : tc.getPointAt(f.d)) : null)
    return { altitude, density, airSpeed: telemetry ? telemetry.x : 0, massFlowRate: telemetry ? telemetry.z : 0 }
  }

  displayPoint(frame, point) {
    const offset = point.clone().sub(frame.centre)
    const along = offset.dot(frame.modelForward)
    return frame.centre.clone().addScaledVector(offset, this.visualRadiusScale)
      .addScaledVector(frame.modelForward, along * (this.visualLengthScale - this.visualRadiusScale))
  }

  nose(frame) {
    return frame.position.clone().addScaledVector(frame.modelForward, this.noseToBase)
  }

  // The plasma trail: rings from the nose back along the path the nose has taken, closely spaced near
  // the vehicle (ages growing as the cube of the ring number) and reaching back TRAIL_COOLING_TIMES
  // cooling times, or to the tube's exit if the vehicle left it more recently.
  buildTrail(tube, obj, refFrame, deltaT, now, planetRadius) {
    const sinceExit = now.f.t
    const span = Math.min(TRAIL_COOLING_TIMES * this.coolingTime, sinceExit)
    if (!(span > 0)) return false
    const head = this.nose(now)
    tube.begin(head)
    const rgb = this.rgb
    let s = 0
    let previous = head
    let peak = 0
    for (let k = 0; k < TRAIL_RINGS; k++) {
      const age = span * (k / (TRAIL_RINGS - 1)) ** 3
      const frame = k === 0 ? now : obj.frameAt(refFrame, deltaT - age)
      const p = k === 0 ? head : this.nose(frame)
      s += p.distanceTo(previous)
      previous = p
      const air = this.airAt(frame, planetRadius)
      const emission = shockLayerEmission(air.airSpeed, air.density)
      const sigma = plasmaTrailPoint(age, s, emission, this.coolingTime, this.shape, this.plasmaBrightness, rgb)
      const area = Math.PI * sigma * sigma
      // At the tube's exit the trail starts: fade its last ring out so it does not end in a disc.
      const end = (k === TRAIL_RINGS - 1 && span >= sinceExit) ? 0 : 1
      const displayed = this.displayPoint(frame, p).addScaledVector(frame.modelForward,
        -Math.min(s, this.noseToBase) * (this.visualLengthScale - 1))
      // Enlarge the envelope around the displayed hull, but keep the wake's additional
      // spreading in metres. Scaling that spreading too makes a kilometre-wide flare.
      const envelope = 1.2 * this.shape.bodyRadius
      const displayedSigma = Math.min(sigma, envelope) * this.visualRadiusScale + Math.max(0, sigma - envelope)
      tube.addRing(displayed.x, displayed.y, displayed.z, displayedSigma,
        end * rgb[0] / area, end * rgb[1] / area, end * rgb[2] / area)
      peak = Math.max(peak, rgb[0] / area)
    }
    tube.end()
    if (peak < MIN_EMISSION) tube.visible = false
    return tube.visible
  }

  // The exhaust plume: rings straight back from the nozzle's exit (the model's tail), closer together
  // near the nozzle.
  buildPlume(tube, now, planetRadius) {
    if (!this.engine) return false
    const air = this.airAt(now, planetRadius)
    const ambientPressure = this.planetSpec.airPressureAtAltitude?.(air.altitude) ?? 0
    const exhaustVelocity = THREE.MathUtils.lerp(this.vacuumExhaustVelocity, this.seaLevelExhaustVelocity, Math.min(1, ambientPressure / STANDARD_PRESSURE))
    const plume = exhaustPlume(this.engine, {
      massFlowRate: air.massFlowRate,
      exhaustVelocity,
      ambientPressure,
      airDensity: air.density,
      airSpeed: air.airSpeed,
      wakeRadius: 1.2 * this.shape.bodyRadius,
    }, this.exhaustBrightness)
    if (!plume) return false
    const exit = this.displayPoint(now, now.position)
    const back = now.modelForward
    tube.begin(exit)
    const rgb = this.rgb
    let peak = 0
    for (let k = 0; k < PLUME_RINGS; k++) {
      const x = plume.length * (k / (PLUME_RINGS - 1)) ** 1.6
      // The boundary of the plume is about 1.5 sigma out.
      const sigma = plume.radiusAt(x) / 1.5
      plume.lineEmissionAt(x, rgb)
      const area = Math.PI * sigma * sigma
      tube.addRing(exit.x - back.x * x * this.visualLengthScale, exit.y - back.y * x * this.visualLengthScale, exit.z - back.z * x * this.visualLengthScale, sigma * this.visualRadiusScale, rgb[0] / area, rgb[1] / area, rgb[2] / area)
      peak = Math.max(peak, rgb[2] / area)
    }
    tube.end()
    if (peak < MIN_EMISSION) tube.visible = false
    return tube.visible
  }

  // Draws the glow over what has been drawn so far, in the frame of `parent` (planetCoordSys).
  render(renderer, camera, parent) {
    if (!this.anyVisible) return
    const size = renderer.getDrawingBufferSize(this.bufferSize ??= new THREE.Vector2())
    this.material.uniforms.glowPixelAngle.value = 2 / (camera.projectionMatrix.elements[5] * Math.max(1, size.y))
    this.root.matrix.copy(parent.matrixWorld)
    this.root.matrixWorldNeedsUpdate = true
    renderer.render(this.scene, camera)
  }

  dispose() {
    this.inUse.forEach(tubes => this.spare.push(tubes))
    this.inUse.clear()
    this.spare.forEach(({ trail, plume }) => { trail.dispose(); plume.dispose() })
    this.spare = []
    this.root.clear()
  }
}
