import { GRAPPLER_CURVES, grapplerTelemetry } from './grapplerTelemetry.js'
import { screwStateAtDistance } from './rampMotion.js'
import * as THREE from 'three'
//import { XYChart } from '../scene/XYChart.js'
import { SuperCurvePath } from '../curves/SuperCurves.js'
import * as tram from '../utils/tram.js'
import { MovingVirtualObject, disposeModels, pathDuration } from './VirtualObject.js'
import { fallBackProfile } from './fallBack.js'
import { coiledTubeShape } from './launcherAnimate.js'
import { referenceFrame } from '../core/ReferenceFrame.js'
import { launchVehicleModel, virtualLaunchVehicle } from './LaunchVehicle.js'
import { launchSledModel, virtualLaunchSled } from './LaunchSled.js'
import { adaptiveNutModel, virtualAdaptiveNut } from './AdaptiveNut.js'
import { massDriverTubeModel, virtualMassDriverTube } from './MassDriverTube.js'
import { massDriverRailModel, virtualMassDriverRail } from './MassDriverRail.js'
import { massDriverBracketModel, virtualMassDriverBracket } from './MassDriverBracket.js'
import { massDriverScrewModel, virtualMassDriverScrew, createScrewModelPair } from './MassDriverScrew.js'
import { InstancedProxyPool } from '../scene/InstancedProxyPool.js'
import { Highlights } from '../scene/Highlights.js'
import { humanFigureModel, virtualHumanFigure } from './HumanFigure.js'
//import { evacuatedTubeModel, virtualEvacuatedTube } from './EvacuatedTube.js'
import * as LauncherAnimate from './launcherAnimate.js'
import * as LaunchTrajectoryUtils from './LaunchTrajectoryUtils.js'
import * as LaunchTrajectoryRocket from './launchTrajectoryRocket.js'
import * as OrbitMath from './OrbitMath.js'
import * as SaveGeometryAsSTL from '../export/SaveGeometryAsSTL.js'
import * as EngineeringDetails from './EngineeringDetails.js'
import { ExtractedTelemetryLoader } from './ExtractedTelemetryLoader.js'
import { nearestOnCurve } from '../curves/curveDistance.js'
import { launchCadence } from './launchCadence.js'
import { terminalSchedule } from './terminalPort.js'
import { MIN_DEPTH } from './OceanTerminal.js'
import { LaunchVehicleGlow } from './LaunchVehicleGlow.js'
import { splitPositions, withRelativeToEye } from '../scene/relativeToEye.js'
import { track } from '../core/PendingWork.js'
import { MooringCables } from './MooringCables.js'

//import { arrow } from '../ring/markers.js'
//import { FrontSide } from 'three'

// How far above the ground the elevated evacuated tube rests while it is fully coiled up (see findCoilRest).
const COIL_REST_CLEARANCE = 10 // m

export class launcher {

  constructor(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, xyChart, clock, specs, genLauncherKMLFile, kmlFile) {

    // this.worker = new Worker("worker.js")

    // this.worker.onmessage = function(e) {
    //   console.log('Message received from worker', e.data);
    // }
    
    // this.worker.postMessage("Hello World!");
    // console.log("AmbientPressure at 15km", planetSpec.airPressureAtAltitude(15000))

    this.clock = clock  // THREE.Clock; NOT used for animation (animation is a pure function of timeSinceStart)
    this.versionNumber = 0
    this.frozenTimeSinceStart = timeSinceStart  // animation time used while all animate* flags are off
    this.launchStride = 1
    this.lastElevatedEvacuatedTubeDeploymentAlpha = -1

    this.const_g = 9.8  // Earth gravity, used for ISP and g-force calculations
    this.mu = planetSpec.gravitationalParameter

    // Local gravitational acceleration at the launcher site (used to tilt the passenger pose).
    // radiusAtLatitude takes geodetic latitude in degrees.
    const launcherRadius = tram.radiusAtLatitude(dParamWithUnits['launcherRampEndLatitude'].value, planetSpec.ellipsoid) + dParamWithUnits['launcherMassDriverAltitude'].value
    this.gravityAtLauncherLocation = this.mu / (launcherRadius * launcherRadius)

    this.xyChart = xyChart

    this.scene = planetCoordSys
    this.objectClasses = []
    // The launch vehicles' plasma and exhaust, drawn apart from the main scene (see App.render)
    this.glow = new LaunchVehicleGlow()

    const whiteMaterial = new THREE.MeshLambertMaterial({color: 0xffffff})
    const redMaterial = new THREE.MeshLambertMaterial({color: 0xdf4040})
    const greenMaterial = new THREE.MeshLambertMaterial({color: 0x40df40})
    const blueMaterial = new THREE.MeshLambertMaterial({color: 0x4040df})
    const orangeMaterial = new THREE.MeshLambertMaterial({color: 'orange'})
    this.launchTrajectoryWhiteMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), whiteMaterial)
    const launchTrajectoryMarkerSize = dParamWithUnits['launcherMarkerRadius'].value
    this.launchTrajectoryWhiteMarker.scale.set(launchTrajectoryMarkerSize, launchTrajectoryMarkerSize, launchTrajectoryMarkerSize)
    this.launchTrajectoryRedMarker = this.launchTrajectoryWhiteMarker.clone()
    this.launchTrajectoryRedMarker.material = redMaterial
    this.launchTrajectoryGreenMarker = this.launchTrajectoryWhiteMarker.clone()
    this.launchTrajectoryGreenMarker.material = greenMaterial
    this.launchTrajectoryBlueMarker = this.launchTrajectoryWhiteMarker.clone()
    this.launchTrajectoryBlueMarker.material = blueMaterial
    this.launchTrajectoryOrangeMarker = this.launchTrajectoryWhiteMarker.clone()
    this.launchTrajectoryOrangeMarker.material = orangeMaterial
    this.launchTrajectoryMarker5 = this.launchTrajectoryWhiteMarker.clone()
    this.launchTrajectoryMarker6 = this.launchTrajectoryWhiteMarker.clone()
    planetCoordSys.add(this.launchTrajectoryWhiteMarker)
    planetCoordSys.add(this.launchTrajectoryRedMarker)
    planetCoordSys.add(this.launchTrajectoryGreenMarker)
    planetCoordSys.add(this.launchTrajectoryBlueMarker)
    planetCoordSys.add(this.launchTrajectoryOrangeMarker)
    planetCoordSys.add(this.launchTrajectoryMarker5)
    planetCoordSys.add(this.launchTrajectoryMarker6)

    this.wedgeMarker0 = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), redMaterial)
    this.wedgeMarker1 = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), blueMaterial)
    this.wedgeMarker2 = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), greenMaterial)
    planetCoordSys.add(this.wedgeMarker0)
    planetCoordSys.add(this.wedgeMarker1)
    planetCoordSys.add(this.wedgeMarker2)
    this.wedgeMarker0.visible = false
    this.wedgeMarker1.visible = false
    this.wedgeMarker2.visible = false

    this.launchTrajectoryCurve = null
    this.launchTrajectoryMesh = null
    this.previousTrajectoryCurvesParameters = new Map();
    this.cameraRange = []
    this.cameraRange[0] = dParamWithUnits['massDriverCameraRange'].value
    this.cameraRange[1] = dParamWithUnits['launchSledCameraRange'].value
    this.cameraRange[2] = dParamWithUnits['vehicleInTubeCameraRange'].value
    this.cameraRange[3] = dParamWithUnits['lauchVehicleCameraRange'].value
    this.numZones = 200

    switch (dParamWithUnits['launchTrajectorySelector'].value) {
      default:
        this.tubeModelObject = new massDriverTubeModel(dParamWithUnits)
        this.tubeModelObject.ellipsoid = planetSpec.ellipsoid  // for the mooring cables (see setTerrainSampler)
        this.railModelObject = new massDriverRailModel(dParamWithUnits)
        this.bracketModelObject = new massDriverBracketModel(dParamWithUnits)
        this.humanFigureModelObject = new humanFigureModel()  // loads its FBX lazily, on first use

        // Thinking that later we'll need a second reference frame for the rails and sleds so that they can split off from the launch vehicles
        // at the end of the upward ramp, decellerate, and loop back around to the start of the mass driver.
        // const rf1 = new referenceFrame(launchCurve, numZones, this.cameraRange, 0, 0, 0, 'staticLaunchSledReferenceFrame')
        // rf1.addVirtualObject('virtualLaunchSleds')
        // rf1.addVirtualObject('virtualMassDriverRails')
        // this.refFrames.push(rf1)
        
        // Next, create all of the virtual objects that will be placed along the launch trajectory curve

        this.massDriverScrewTexture = new THREE.TextureLoader().load( './textures/steelTexture.jpg' )

        this.massDriverScrewMaterials = []
        this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({color: 0xffffff})
        this.massDriverScrewMaterials[0] = new THREE.MeshPhongMaterial({color: 0x4f4faf})
        this.massDriverScrewMaterials.forEach(m => { m.userData.keep = true })

        this.coilCenterMarker = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), orangeMaterial)
        this.coilCenterMarker.name = 'coilCenterMarker'
        this.coilCenterMarker.visible = false
        this.scene.add(this.coilCenterMarker)

        this.update(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

        break
      case 1:
        // Add the curves from Starship's televised telemetry
        if (dParamWithUnits['showStarshipIFT6Telemetry'].value) {
          // Loaded asynchronously; the rocket trajectory is recomputed once the telemetry arrives.
          new ExtractedTelemetryLoader().loadExtractedTelemetry(dParamWithUnits, this.xyChart).then((empiricalData) => {
            this.empiricalData = empiricalData
            this.update(dParamWithUnits, this.timeSinceStart ?? timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
          }).catch((err) => console.error('Failed to load Starship telemetry', err))
        }

        this.update(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
        break
    }

  }

  // Rebuilds the trajectory curves, the reference frames and every virtual object. Safe to call on its
  // own (main.js's parameter sweep does): existing models are released first.
  updateReferenceFrames(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

    this.objectClasses.forEach(objectClass => objectClass.removeAllVirtualObjects())

    this.planetSpec = planetSpec
    this.refFrames = []
    const numZones = this.numZones
    Highlights.disposeStandIn(this.highlightStandIn)
    this.highlightStandIn = null

    const makePath = (name, curves) => {
      const path = new SuperCurvePath()
      path.name = name
      curves.forEach(curve => path.add(curve))
      path.updateArcLengths()
      path.subdivide(numZones)
      return path
    }

    switch (dParamWithUnits['launchTrajectorySelector'].value) {
      default: {
        this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
        const rampCurve = (i) => this.launchRampCurve ? this.launchRampCurve[i] : null
        // While the elevated evacuated tube deployment is animated, the vehicles follow the drawn (coiled) tube.
        const tubeCurve = (this.animateElevatedEvacuatedTubeDeployment && this.coiledElevatedEvacuatedTubeCurve) ? this.coiledElevatedEvacuatedTubeCurve : this.evacuatedTubeCurve
        // ToDo: We need another curve right before the mass driver curve for feeding the launch vehicles and sleds into the screws from
        this.polyCurveForrf0 = makePath("massDriver2Path", [this.massDriver1Curve, this.massDriver2Curve, rampCurve(0)])
        this.accelerationScrewLength = this.polyCurveForrf0.getLength()
        this.polyCurveForrf1 = makePath("adaptiveNutPath", [this.feederRailCurve, this.massDriver1Curve, this.massDriver2Curve, rampCurve(0)])
        // The sled stays with the vehicle over the ramp, then brakes on the track in the elevated evacuated tube.
        this.polyCurveForrf2 = makePath("launchSledPath", [this.feederRailCurve, this.massDriver1Curve, this.massDriver2Curve, rampCurve(1), this.launchSledBrakingCurve])
        this.polyCurveForrf3 = makePath("launchVehicleInTubePath", [this.feederRailCurve, this.massDriver1Curve, this.massDriver2Curve, rampCurve(1), tubeCurve])
        this.polyCurveForrf4 = makePath("launchVehiclePath", [this.feederRailCurve, this.massDriver1Curve, this.massDriver2Curve, rampCurve(1), tubeCurve, this.freeFlightPositionCurve])

        this.refFrames.push(
          new referenceFrame(this.polyCurveForrf0, numZones, this.cameraRange[0], 0, 0, 0, 'massDriver2RefFrame'),
          new referenceFrame(this.polyCurveForrf1, numZones, this.cameraRange[1], 0, 0, 0, 'adaptiveNutRefFrame'),
          new referenceFrame(this.polyCurveForrf2, numZones, this.cameraRange[1], 0, 0, 0, 'launchSledRefFrame'),
          new referenceFrame(this.polyCurveForrf3, numZones, this.cameraRange[2], 0, 0, 0, 'launchVehicleInTubeRefFrame'),
          new referenceFrame(this.polyCurveForrf4, numZones, this.cameraRange[3], 0, 0, 0, 'launchVehicleRefFrame'))
        this.launchTrajectoryLine = this.polyCurveForrf4
        this.updateTerrainFits()

        // Which reference frame each class of virtual object lives in
        this.classRefFrameIndex = new Map([
          [virtualMassDriverTube, 3], [virtualMassDriverRail, 2], [virtualMassDriverBracket, 0], [virtualMassDriverScrew, 0],
          [virtualAdaptiveNut, 1], [virtualLaunchSled, 2], [virtualLaunchVehicle, 4], [virtualHumanFigure, 0]])
        this.virtualMassDriverTube = virtualMassDriverTube
        // The mass driver's highlight from afar, where its models are not drawn.
        this.highlightStandIn = Highlights.curveStandIn(this.polyCurveForrf3, 'massDriver', { chunks: 128 })
        planetCoordSys.add(this.highlightStandIn)
        break
      }
      case 1:
        this.updateTrajectoryCurvesRocket(dParamWithUnits, planetSpec)
        this.polyCurveForrf0 = makePath("freeFlightCurve", [this.freeFlightPositionCurve])
        this.accelerationScrewLength = this.polyCurveForrf0.getLength()
        this.refFrames.push(new referenceFrame(this.polyCurveForrf0, numZones, this.cameraRange[3], 0, 0, 0, 'rocketLaunchRefFrame'))
        this.launchTrajectoryLine = this.polyCurveForrf0
        this.classRefFrameIndex = new Map([[virtualLaunchVehicle, 0]])
        break
    }
    this.objectClasses = Array.from(this.classRefFrameIndex.keys())
    this.launchTrajectoryCurve = this.launchTrajectoryLine
    this.durationOfLaunchTrajectory = this.launchTrajectoryLine.getDuration()

    this.objectClasses.forEach(objectClass => {
      const refFrame = this.refFrames[this.classRefFrameIndex.get(objectClass)]
      refFrame.addVirtualObject(objectClass.className)
      objectClass.refFrames = [refFrame]
      objectClass.scene = this.scene
    })
    this.refFrames.forEach(refFrame => {
      refFrame.initialize()
      refFrame.timeSinceStart = timeSinceStart
      refFrame.forceVisibilityRefresh = true
    })

    this.configureObjectClasses(dParamWithUnits, planetSpec)
    this.buildModelPools(dParamWithUnits)
    this.objectClasses.forEach(objectClass => {
      if (objectClass.numObjects > 0) objectClass.addNewVirtualObjects(objectClass.refFrames)
    })
  }

  // Pushes the current parameter values into every virtual object class. Called on every update() so that
  // values such as the version number are never captured stale.
  // Parameters with the trajectory's edge-case clamps applied (so screws/nuts match the trajectory).
  effectiveParams(dParamWithUnits) {
    if (this.effectiveForwardAcceleration === undefined) return dParamWithUnits
    return {
      ...dParamWithUnits,
      launchVehicleMassDriverForwardAcceleration: { ...dParamWithUnits['launchVehicleMassDriverForwardAcceleration'], value: this.effectiveForwardAcceleration },
      launcherMassDriver1InitialVelocity: { ...dParamWithUnits['launcherMassDriver1InitialVelocity'], value: this.effectiveMassDriver1InitialVelocity },
    }
  }

  configureObjectClasses(dParamWithUnits, planetSpec) {
    dParamWithUnits = this.effectiveParams(dParamWithUnits)
    const segments = this.massDriverScrewSegments
    const length = this.accelerationScrewLength
    this.tubeInnerRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value
    // One thread layout (where the thread starts and how many starts it has where) for the screws and
    // the nuts' grapplers, so they always agree.
    this.threadLayout = tram.screwThreadLayout(dParamWithUnits, length / Math.max(1, segments))
    this.threadLayout.motion = this.screwMotion
    // Use the same clearance sequence while the pitch decreases on the braking screws.
    const originalStartsAt = this.threadLayout.startsAt
    this.threadLayout.startsAt = d => {
      if (!this.screwMotion || d <= this.screwMotion.horizontalLength) return originalStartsAt(d)
      const centre = Math.floor(d / (length / segments)) * (length / segments)
      const speed = screwStateAtDistance(this.screwMotion, centre).v
      const equivalentDistance = dParamWithUnits['adaptiveNutBodyLength'].value / 2 + (speed ** 2 - this.effectiveMassDriver1InitialVelocity ** 2) / (2 * this.effectiveForwardAcceleration)
      return originalStartsAt(equivalentDistance)
    }
    this.threadLayout.flightsAt = d => {
      if (!this.screwMotion || d <= this.screwMotion.horizontalLength) return d >= this.threadLayout.threadStartDistance ? this.threadLayout.startsAt(d) : 0
      const speed = screwStateAtDistance(this.screwMotion, d).v
      const equivalentDistance = dParamWithUnits['adaptiveNutBodyLength'].value / 2 + (speed ** 2 - this.effectiveMassDriver1InitialVelocity ** 2) / (2 * this.effectiveForwardAcceleration)
      return equivalentDistance >= this.threadLayout.threadStartDistance ? this.threadLayout.startsAt(d) : 0
    }
    virtualMassDriverScrew.motion = this.screwMotion
    virtualAdaptiveNut.motion = this.screwMotion
    virtualMassDriverScrew.threadLayout = this.threadLayout
    virtualAdaptiveNut.threadLayout = this.threadLayout
    this.objectClasses.forEach(objectClass => {
      switch (objectClass) {
        case virtualLaunchVehicle: objectClass.update(dParamWithUnits, planetSpec); break
        case virtualLaunchSled: objectClass.update(dParamWithUnits); break
        case virtualAdaptiveNut: objectClass.update(dParamWithUnits, length); break
        case virtualMassDriverBracket: objectClass.update(dParamWithUnits, segments, length, this.versionNumber); break
        case virtualMassDriverScrew: objectClass.update(dParamWithUnits, length, segments, length, this.massDriverScrewMaterials, this.versionNumber); break
        case virtualMassDriverRail: objectClass.update(dParamWithUnits, this.versionNumber); objectClass.modelFactory = this.railModelObject; break
        case virtualMassDriverTube: objectClass.update(dParamWithUnits, this.versionNumber); objectClass.modelFactory = this.tubeModelObject; break
        case virtualHumanFigure: objectClass.update(dParamWithUnits, this.versionNumber); objectClass.modelFactory = this.humanFigureModelObject; break
      }
    })
    this.updateCadence(dParamWithUnits, planetSpec)
    this.updateLaunchStride()
  }

  // The launch cadence (launchCadence.js): whether the launches leave from an ocean terminal (the breech
  // deep enough under the sea for one: OceanTerminal.js; whether it is drawn does not matter), so are
  // drawn out of it first, and the timetable of the ships that bring their cargo.
  updateCadence(dParamWithUnits, planetSpec) {
    const breech = this.objectClasses.includes(virtualMassDriverTube) ? this.startFrame() : null
    let terminal = false
    if (breech && planetSpec.hasOcean) {
      const geo = tram.ecefToGeodetic(breech.point.x, breech.point.y, breech.point.z, planetSpec.ellipsoid)
      terminal = geo.alt <= -MIN_DEPTH
    }
    this.cadence = launchCadence({
      spacing: dParamWithUnits['launchVehicleSpacingInSeconds'].value,
      slowDown: dParamWithUnits['launcherSlowDownPassageOfTime'].value,
      startDelay: dParamWithUnits['launcherStartDelayInSeconds'].value,
      egressDuration: dParamWithUnits['launcherTerminalEgressDuration'].value,
      endSpeed: dParamWithUnits['launcherMassDriver1InitialVelocity'].value,
      terminal,
    })
    MovingVirtualObject.egress = this.cadence.egress
    this.shipSchedule = terminalSchedule(terminal ? this.cadence : null)
  }

  // The ocean terminal's timetable (terminalPort.js), on the launch cadence.
  terminalSchedule() {
    return this.shipSchedule ?? terminalSchedule(null)
  }

  // If numVirtual* is too small to hold every launch that is in flight at the configured spacing, only
  // every launchStride-th launch is shown. A single stride is shared by vehicles, sleds and nuts so that
  // each shown launch has all three. At an ocean terminal it is a whole number of ships, so that the
  // launches shown are each the first a ship brings cargo for (launchCadence.js).
  updateLaunchStride() {
    const moving = this.objectClasses.filter(c => c.prototype instanceof MovingVirtualObject)
    let stride = 1
    moving.forEach(c => {
      if (c.numObjects > 0 && c.refFrames[0]) stride = Math.max(stride, c.strideNeeded(pathDuration(c.refFrames[0].curve) + c.egressDuration))
    })
    const perShip = this.cadence?.terminal ? this.cadence.launchesPerShip : 1
    stride = Math.ceil(stride / perShip) * perShip
    moving.forEach(c => { c.launchStride = stride })
    this.launchStride = stride
  }

  // (Re)builds the pooled models of recyclable classes whose model-defining parameters have changed
  // (e.g. adaptiveNutNumGrapplers). The old pool is released and disposed first.
  buildModelPools(dParamWithUnits) {
    dParamWithUnits = this.effectiveParams(dParamWithUnits)
    const builders = new Map([
      [virtualLaunchVehicle, () => new launchVehicleModel(dParamWithUnits, this.scene, virtualLaunchVehicle.unallocatedModels, 0, this.gravityAtLauncherLocation)],
      [virtualLaunchSled, () => new launchSledModel(dParamWithUnits, this.scene, virtualLaunchSled.unallocatedModels, 0, this.massDriverScrewTexture)],
      [virtualAdaptiveNut, () => new adaptiveNutModel(dParamWithUnits, this.scene, virtualAdaptiveNut.unallocatedModels, 0, this.massDriverScrewTexture)],
      [virtualMassDriverScrew, () => {
        if (dParamWithUnits['saveMassDriverScrewSTL'].value) {
          const screwModelObject = new massDriverScrewModel()
          const saveModel = screwModelObject.createModel(dParamWithUnits, this.accelerationScrewLength, this.massDriverScrewSegments, 0, this.massDriverScrewMaterials, true)
          this.saveGeometryAsSTL(saveModel, 'massDriverScrew.stl')
        }
        const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
        // Distant screws are plain cylinders; draw all of them with one instanced mesh.
        virtualMassDriverScrew.cylinderPool?.dispose()
        const nominalLength = this.accelerationScrewLength / Math.max(1, this.massDriverScrewSegments)
        const cylinderGeometry = new THREE.CylinderGeometry(threadRadius * 0.9, threadRadius * 0.9, nominalLength, 12, 1, false)
        const cylinderPool = new InstancedProxyPool({
          name: 'massDriverScrew',
          highlight: 'massDriver',
          parent: this.scene,
          size: 2 * threadRadius,
          levels: [{ geometry: cylinderGeometry, material: this.massDriverScrewMaterials[0], minPixels: 0 }],
        })
        cylinderPool.nominalLength = nominalLength
        virtualMassDriverScrew.cylinderPool = cylinderPool
        virtualMassDriverScrew.createPooledModel = () => createScrewModelPair(this.massDriverScrewMaterials, threadRadius, cylinderPool)
        const screwModels = virtualMassDriverScrew.createPooledModel()
        screwModels.visible = false
        virtualMassDriverScrew.unallocatedModels.push(screwModels)
      }],
      [virtualMassDriverBracket, () => {
        // Brackets are identical, so they are drawn instanced: the pooled "models" are proxies whose
        // transforms InstancedProxyPool copies into a full-detail and a low-detail InstancedMesh.
        virtualMassDriverBracket.instancePool?.dispose()
        const segmentSpacing = this.accelerationScrewLength / Math.max(1, this.massDriverScrewSegments)
        const high = this.bracketModelObject.createModel(segmentSpacing)
        const low = this.bracketModelObject.createModel(segmentSpacing, this.bracketModelObject.lowDetailShape)
        const pool = new InstancedProxyPool({
          name: 'massDriver2Bracket',
          highlight: 'massDriver',
          parent: this.scene,
          size: 2 * dParamWithUnits['launcherMassDriverTubeInnerRadius'].value,
          castShadow: true,
          levels: [
            { geometry: high.geometry, material: high.material, minPixels: 40 },
            { geometry: low.geometry, material: low.material, minPixels: 1 },
          ],
        })
        virtualMassDriverBracket.instancePool = pool
        virtualMassDriverBracket.createPooledModel = () => {
          const proxy = pool.createProxy()
          proxy.visible = false
          return proxy
        }
        virtualMassDriverBracket.unallocatedModels.push(virtualMassDriverBracket.createPooledModel())
      }],
    ])
    this.objectClasses.forEach(objectClass => {
      const build = builders.get(objectClass)
      if (!build) return
      // Screw and bracket templates are shaped by the trajectory curves too
      const curveDependent = (objectClass === virtualMassDriverScrew) || (objectClass === virtualMassDriverBracket)
      const signature = objectClass.signatureOf(dParamWithUnits) + (curveDependent ? '|' + this.trajectoryVersion : '')
      if (signature !== objectClass.poolSignature || objectClass.unallocatedModels.length === 0) {
        objectClass.removeAllVirtualObjects()
        objectClass.disposePool()
        build()
        objectClass.poolSignature = signature
        objectClass.needsObjects = true
      }
    })
  }

  // ---- Fitting the launcher to the terrain ------------------------------------------------------
  // Where the nuts and sleds go out of sight underground (updateFallBacks) and how low the coiled-up tube rests
  // (updateCoilRest) come from fixed terrain data (setFixedTerrainHeight), which loads asynchronously; until it
  // has, the nuts and sleds fall back to the bottom of the ramp and the coil rests where it was designed to.
  // terrainReady resolves once the terrain has been consulted. Recordings wait for it, also when a shot's
  // parameter track rebuilds the launcher partway through (it counts as pending work: PendingWork.js).

  updateTerrainFits() {
    const generation = this.terrainFitGeneration = (this.terrainFitGeneration ?? 0) + 1
    this.terrainReady = track(Promise.all([this.updateFallBacks(generation), this.updateCoilRest(generation)])
      .catch(error => console.warn('Could not fit the launcher to the terrain:', error)))
  }

  // Once it has stopped, each adaptive nut and launch sled falls back down its path (fallBack.js) until it is
  // out of sight: it disappears at the first point on the way down where the path is underground (or, on a
  // planet with an ocean, under the sea), or failing that at the bottom of the ramp. The Moon's launcher is
  // still to be redesigned: there they just disappear when they stop, as before.
  updateFallBacks(generation) {
    const paths = (this.planetSpec?.name === 'Moon') ? [] : [this.polyCurveForrf1, this.polyCurveForrf2].filter(Boolean)
    paths.forEach(path => { path.fallBack = this.fallBackFor(path, this.rampStartDistance(path)) })
    if (!this.fixedTerrainHeight || paths.length === 0) return Promise.resolve()
    return Promise.all(paths.map(async path => {
      const end = await this.groundEntryDistance(path)
      if (generation === this.terrainFitGeneration && end !== null) path.fallBack = this.fallBackFor(path, end)
    })).then(() => {
      if (generation !== this.terrainFitGeneration) return
      this.updateLaunchStride()
      this.refFrames.forEach(refFrame => { refFrame.forceVisibilityRefresh = true })
    })
  }

  // While it is fully coiled up (its deployment is animated), the elevated evacuated tube rests as close to the
  // ground as it can without touching it: COIL_REST_CLEARANCE above it (see findCoilRest).
  updateCoilRest(generation) {
    this.coilRestDrop = 0
    this.lastElevatedEvacuatedTubeDeploymentAlpha = -1   // (reshape it: see animate)
    if (!this.fixedTerrainHeight || !this.animateElevatedEvacuatedTubeDeployment || !this.evacuatedTubeCurve) return Promise.resolve()
    return this.findCoilRest().then(drop => {
      if (generation !== this.terrainFitGeneration) return
      this.coilRestDrop = drop
      this.lastElevatedEvacuatedTubeDeploymentAlpha = -1
    })
  }

  // How much further down (negative: up) the fully coiled-up tube must be brought (coiledTubeShape's restDrop) for
  // the bottom of the tube, wherever there is ground under it or its lift fans, to be COIL_REST_CLEARANCE above it.
  async findCoilRest() {
    const tube = this.evacuatedTubeCurve
    const count = Math.min(60000, Math.max(4096, Math.ceil(tube.getLength() / 15)))   // (every 15 m or so)
    const { points, weights } = coiledTubeShape(tube, 0, { count })
    const radius = this.tubeModelObject.radius
    const halfWidth = 4.5 * radius   // to the rims of the lift fans' disks (see MassDriverTube.createLiftFans)
    const ellipsoid = this.planetSpec.ellipsoid
    const along = new THREE.Vector3(), side = new THREE.Vector3(), p = new THREE.Vector3()
    let drop = Infinity
    for (let i = 0; i < count; i++) {
      // (Next to the tube's fixed start, bringing the coil down hardly moves it.)
      if (weights[i] < 0.05) continue
      along.subVectors(points[Math.min(count - 1, i + 1)], points[Math.max(0, i - 1)])
      side.crossVectors(along, points[i]).normalize()
      let ground = null
      for (const k of [-1, 0, 1]) {
        p.copy(points[i]).addScaledVector(side, k * halfWidth)
        const { lat, lon } = tram.ecefToGeodetic(p.x, p.y, p.z, ellipsoid)
        const height = await this.fixedTerrainHeight(lat, lon)
        if (height !== null) ground = Math.max(ground ?? -Infinity, height)
      }
      if (ground === null) continue
      const { alt } = tram.ecefToGeodetic(points[i].x, points[i].y, points[i].z, ellipsoid)
      drop = Math.min(drop, (alt - radius - ground - COIL_REST_CLEARANCE) / weights[i])
    }
    return Number.isFinite(drop) ? drop : 0
  }

  // Path distance at which the object on `path` stops: where the motion along its last sub-curve ends.
  stopDistance(path) {
    const curves = path.superCurves
    const last = curves[curves.length - 1]
    const before = curves.slice(0, -1).reduce((sum, curve) => sum + curve.getLength(), 0)
    return before + Math.max(0, Math.min(last.getLength(), last.tTod(last.getDuration())))
  }

  // Path distance of the start (the bottom) of the ramp on `path`.
  rampStartDistance(path) {
    let distance = 0
    for (const curve of path.superCurves) {
      if (curve.name.startsWith('launchRampCurve')) return distance
      distance += curve.getLength()
    }
    return distance
  }

  fallBackFor(path, endDistance) {
    const length = path.getLength()
    return fallBackProfile({
      startDistance: this.stopDistance(path),
      endDistance,
      radiusAt: (s) => path.getPointAt(Math.max(0, Math.min(1, s / length))).length(),
      mu: this.mu,
    })
  }

  // The first path distance below where the object on `path` stops at which the path is out of sight under
  // the ground (or the sea), searching down the ramp; null if it never is.
  async groundEntryDistance(path) {
    const rampStart = this.rampStartDistance(path)
    const ramp = path.superCurves.find(curve => curve.name.startsWith('launchRampCurve'))
    if (!ramp) return null
    const length = path.getLength()
    const ellipsoid = this.planetSpec.ellipsoid
    const hasOcean = this.planetSpec.hasOcean === true
    const hidden = async (s) => {
      const p = path.getPointAt(s / length)
      const { lat, lon, alt } = tram.ecefToGeodetic(p.x, p.y, p.z, ellipsoid)
      const ground = await this.fixedTerrainHeight(lat, lon)
      return (ground !== null && alt < ground) || (hasOcean && alt < 0)
    }
    const step = 50 // m
    let open = Math.min(this.stopDistance(path), rampStart + ramp.getLength())
    if (await hidden(open)) return open
    for (let s = open - step; s > rampStart - step; s -= step) {
      let under = Math.max(rampStart, s)
      if (await hidden(under)) {
        // Narrow down where it goes under (to within a few metres).
        while (open - under > 2) {
          const mid = (open + under) / 2
          if (await hidden(mid)) under = mid
          else open = mid
        }
        return under
      }
      open = under
    }
    return null
  }

  // fixedTerrainHeight(latDeg, lonDeg) -> Promise<metres | null>: the ground's height from fixed data (the same
  // wherever the camera has been: Planet.fixedGroundHeight), to fit the launcher to (updateTerrainFits).
  setFixedTerrainHeight(fixedTerrainHeight) {
    this.fixedTerrainHeight = fixedTerrainHeight
    this.updateTerrainFits()
  }

  // sampleTerrainHeight(latDeg, lonDeg) -> { heightMeters } | null (null while its data loads): where the
  // tube's mooring cables find the sea floor; version(): goes up as more of that data arrives. Tube segments
  // built before it is set (or before their sea floor has loaded) place their anchors later (see MooringCables).
  setTerrainSampler(sampleTerrainHeight, version = () => 0) {
    if (this.tubeModelObject) this.tubeModelObject.sampleTerrainHeight = sampleTerrainHeight
    MooringCables.terrainVersion = version
  }

  // The weather date changed (seaPlacement.setWeatherDate): the lift fans lean into the new wind.
  resetWeather() {
    this.tubeModelObject?.resetLiftFans(this.scene)
  }

  // Where the launcher begins: the start of its tube (planet coordinates), or null before it is built.
  startPoint() {
    const curve = virtualMassDriverTube.refFrames?.[0]?.curve?.superCurves?.[0]
    return curve ? curve.getPointAt(0, new THREE.Vector3()) : null
  }

  // The breech: the start of the tube and its direction there ({ point, tangent }, planet coordinates), or
  // null before it is built.
  startFrame() {
    const curve = virtualMassDriverTube.refFrames?.[0]?.curve?.superCurves?.[0]
    return curve ? { point: curve.getPointAt(0, new THREE.Vector3()), tangent: curve.getTangentAt(0, new THREE.Vector3()).normalize() } : null
  }

  // Points along the launcher's tube from its start, every `step` metres (planet coordinates); empty
  // before it is built.
  pathPoints(step = 1000) {
    const points = []
    for (const curve of virtualMassDriverTube.refFrames?.[0]?.curve?.superCurves ?? []) {
      const n = Math.max(1, Math.ceil(curve.getLength() / step))
      for (let i = points.length ? 1 : 0; i <= n; i++) points.push(curve.getPointAt(i / n, new THREE.Vector3()))
    }
    return points
  }

  // The evacuated tube near `localPoint` (planet coordinates), within maxDistance of its axis: { point,
  // tangent (its axis's nearest point and direction there, planet coordinates), radius (inside) }, or null.
  // (Inside it there is vacuum rather than water: used for the underwater view.)
  tubeNear(localPoint, maxDistance) {
    const refFrame = virtualMassDriverTube.refFrames?.[0]
    if (!refFrame || !virtualMassDriverTube.isVisible || !this.tubeInnerRadius) return null
    let best = null, bestCurve = null
    for (const curve of refFrame.curve.superCurves) {
      const nearest = nearestOnCurve(curve, localPoint, maxDistance)
      if (nearest && (!best || nearest.distance < best.distance)) { best = nearest; bestCurve = curve }
    }
    if (!best || best.distance > maxDistance) return null
    return { point: bestCurve.getPointAt(best.u, new THREE.Vector3()), tangent: bestCurve.getTangentAt(best.u, new THREE.Vector3()).normalize(), radius: this.tubeInnerRadius }
  }

  // Animation state beyond (parameters, timeSinceStart): the time at which the animation is frozen while
  // all animate* flags are off. Plain JSON, for recordings replayed elsewhere.
  getAnimationState() {
    return { frozenTimeSinceStart: this.frozenTimeSinceStart }
  }

  setAnimationState(state) {
    if (state && Number.isFinite(state.frozenTimeSinceStart)) this.frozenTimeSinceStart = state.frozenTimeSinceStart
  }

  // ---- Moving objects at any simulated time (camera anchors in shots) ----------------------------
  // Every launch is a pure function of time (the k-th launch leaves at k * spacing), so where a given
  // launch's vehicle, sled or nut is at any moment can be worked out without it being on screen.

  movingObjectClass(className) {
    return this.objectClasses?.find(c => c.className === className && c.refFrames?.[0]) ?? null
  }

  // The time the animation shows at simulated time `simTime` (it is frozen while every animate* flag is off).
  animationTimeAt(simTime) {
    return (this.animateLaunchVehicles || this.animateLaunchSleds || this.animateAdaptiveNuts) ? simTime : this.frozenTimeSinceStart
  }

  // { position (the object's centre), forward, upward, rightward } in planet coordinates, for launch
  // `launchIndex` at `simTime` (before the launch: in the terminal, or at the start of its path without
  // one; after: at the end), or null.
  movingObjectFrameAt(className, launchIndex, simTime) {
    const objectClass = this.movingObjectClass(className)
    if (!objectClass) return null
    const refFrame = objectClass.refFrames[0]
    const adj = objectClass.adjustedTime(this.animationTimeAt(simTime))
    const deltaT = Math.max(-objectClass.egressDuration, Math.min(pathDuration(refFrame.curve), adj - launchIndex * objectClass.tInc))
    const object = Object.create(objectClass.prototype)
    object.launchIndex = launchIndex
    object.timeLaunched = launchIndex * objectClass.tInc
    const frame = object.frameAt(refFrame, deltaT)
    return { position: frame.centre, forward: frame.forward, upward: frame.upward, rightward: frame.rightward }
  }

  // Launch indices of `className` objects in flight at simTime (only every launchStride-th launch is shown).
  activeLaunchIndicesAt(className, simTime) {
    const objectClass = this.movingObjectClass(className)
    if (!objectClass || !(objectClass.numObjects > 0)) return []
    return objectClass.activeLaunchIndices(objectClass.adjustedTime(this.animationTimeAt(simTime)), pathDuration(objectClass.refFrames[0].curve))
  }

  // Simulated time at which launch `launchIndex` has been on its path for `deltaT` seconds.
  launchSimTime(className, launchIndex, deltaT = 0) {
    const objectClass = this.movingObjectClass(className)
    if (!objectClass || !(objectClass.slowDownPassageOfTime > 0)) return null
    return objectClass.launcherStartDelayInSeconds + (launchIndex * objectClass.tInc + deltaT) / objectClass.slowDownPassageOfTime
  }

  // The shown launch (a multiple of the launch stride) that starts first at or after simTime.
  nextLaunchIndex(className, simTime) {
    const objectClass = this.movingObjectClass(className)
    if (!objectClass || !(objectClass.tInc > 0) || !(objectClass.numObjects > 0)) return null
    const step = Math.max(1, objectClass.launchStride | 0)
    const adj = (simTime - objectClass.launcherStartDelayInSeconds) * objectClass.slowDownPassageOfTime
    return Math.max(0, Math.ceil(adj / (step * objectClass.tInc) - 1e-9)) * step
  }

  // Named stages of a launch's path: [{ name, deltaT }], from the sub-curves of the object's path (and
  // its egress from the terminal, before it, at negative deltaT).
  launchStages(className) {
    const objectClass = this.movingObjectClass(className)
    if (!objectClass) return []
    const path = objectClass.refFrames[0].curve
    const stages = []
    if (objectClass.egressDuration > 0) stages.push({ name: 'egress', deltaT: -objectClass.egressDuration })
    let t = 0
    for (const curve of path.superCurves) {
      stages.push({ name: curve.name, deltaT: t })
      t += curve.getDuration()
    }
    if (path.fallBack?.duration > 0) {
      stages.push({ name: 'fallBack', deltaT: t })
      t += path.fallBack.duration
    }
    stages.push({ name: 'end', deltaT: t })
    return stages
  }

  update(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

    this.versionNumber++

    // radiusAtLatitude takes geodetic latitude in degrees
    this.planetRadius = tram.radiusAtLatitude(dParamWithUnits['launcherRampEndLatitude'].value, planetSpec.ellipsoid)

    const massDriverMode = (dParamWithUnits['launchTrajectorySelector'].value !== 1)
    if (massDriverMode) {
      this.tubeModelObject.update(dParamWithUnits)
      this.railModelObject.update(dParamWithUnits)
      this.bracketModelObject.update(dParamWithUnits)
    }

    this.animateLaunchVehicles = dParamWithUnits['animateLaunchVehicles'].value ? 1 : 0
    this.animateLaunchSleds = dParamWithUnits['animateLaunchSleds'].value ? 1 : 0
    this.animateAdaptiveNuts = dParamWithUnits['animateAdaptiveNuts'].value ? 1 : 0
    this.animateElevatedEvacuatedTubeDeployment = dParamWithUnits['animateElevatedEvacuatedTubeDeployment'].value
    this.lastElevatedEvacuatedTubeDeploymentAlpha = -1
    this.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    this.launcherStartDelayInSeconds = dParamWithUnits['launcherStartDelayInSeconds'].value
    this.showMarkers = dParamWithUnits['showMarkers'].value
    this.massDriverTubeSegments = dParamWithUnits['numVirtualMassDriverTubes'].value
    this.massDriverRailSegments = dParamWithUnits['numVirtualMassDriverRails'].value
    this.frozenTimeSinceStart = timeSinceStart

    this.refFramesChanged = massDriverMode ? this.trajectoryCurvesParametersHaveChanged(dParamWithUnits, this.previousTrajectoryCurvesParameters) : true

    if (this.refFramesChanged || !this.refFrames) {
      this.trajectoryVersion = (this.trajectoryVersion || 0) + 1
      this.updateReferenceFrames(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
    }
    else {
      // Shape-only or count changes: tear down just the affected classes
      const changed = new Set()
      this.objectClasses.forEach(objectClass => {
        if (objectClass.isTeardownRequired(dParamWithUnits, this.massDriverScrewSegments)) {
          objectClass.removeAllVirtualObjects()
          changed.add(objectClass)
        }
        objectClass.needsObjects = false
      })
      this.buildModelPools(dParamWithUnits)  // sets needsObjects on classes whose pools were rebuilt
      this.objectClasses.forEach(objectClass => { if (objectClass.needsObjects) changed.add(objectClass) })
      // Non-recyclable models (tubes, rails, humans) are built from factory parameters; rebuild visible ones.
      ;[virtualMassDriverTube, virtualMassDriverRail, virtualHumanFigure].forEach(objectClass => {
        if (this.objectClasses.includes(objectClass)) {
          objectClass.removeAllVirtualObjects()
          changed.add(objectClass)
        }
      })
      this.configureObjectClasses(dParamWithUnits, planetSpec)
      changed.forEach(objectClass => {
        if (objectClass.numObjects > 0) objectClass.addNewVirtualObjects(objectClass.refFrames)
      })
      this.refFrames.forEach(refFrame => { refFrame.forceVisibilityRefresh = true })
    }

    // Update launch trajectory markers
    const showMarkers = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    ;[this.launchTrajectoryWhiteMarker, this.launchTrajectoryRedMarker, this.launchTrajectoryGreenMarker, this.launchTrajectoryBlueMarker,
      this.launchTrajectoryOrangeMarker, this.launchTrajectoryMarker5, this.launchTrajectoryMarker6].forEach(marker => { marker.visible = showMarkers })

    this.glow.configure(this.effectiveParams(dParamWithUnits), planetSpec)

    // Re-sample on range or engineering changes, only when grappler curves are selected.
    this.xyChart.setProvider('grapplers', GRAPPLER_CURVES, (start, end) => {
      const data = massDriverMode ? grapplerTelemetry(virtualAdaptiveNut, start, end, this.timeWithinFeederRail) : GRAPPLER_CURVES.map(() => [])
      GRAPPLER_CURVES.forEach((name, i) => this.xyChart.addCurve(name, ['%', 'degrees', 'm', 'm'][i], data[i]))
    })
    this.chartTime = time => virtualAdaptiveNut.adjustedTime(time)
    this.xyChart.configure(dParamWithUnits)
    this.xyChart.visible = dParamWithUnits['showXYChart'].value

  }

  // Kept for compatibility: releases the models of one class of virtual objects.
  removeOldVirtualObjects(scene, refFrames, objectName) {
    const objectClass = this.objectClasses.find(c => c.className === objectName)
    if (objectClass) objectClass.removeAllVirtualObjects()
  }

  // Draws the trajectory as one LineSegments, relative to its start. It reaches orbit, thousands of kilometres
  // from there, where float32 vertex positions would only be good to ~0.1 m, so it is drawn relative to the
  // eye (see relativeToEye.js): exact to well under a millimetre near the camera, wherever it is along it.
  drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys) {

    if (this.launchTrajectoryMesh) {
      planetCoordSys.remove(this.launchTrajectoryMesh)
      disposeModels([this.launchTrajectoryMesh], { geometries: true, materials: true })
      this.launchTrajectoryMesh = null
    }

    const color = new THREE.Color()
    const totalDuration = this.launchTrajectoryLine.getDuration()
    const tStep = 1 // second

    const pointAt = (deltaT) => {
      const res = this.launchTrajectoryLine.findRelevantCurve(deltaT)
      const relevantCurve = res.relevantCurve
      const length = res.relevantCurveLength
      const d = (length > 0) ? Math.max(0, Math.min(1, relevantCurve.tTod(Math.max(0, deltaT - res.relevantCurveStartTime)) / length)) : 0
      return relevantCurve.getPointAt(d)
    }

    const group = new THREE.Group()
    group.name = 'launchTrajectory'
    group.visible = dParamWithUnits['showLaunchTrajectory'].value
    group.renderOrder = 1

    const origin = pointAt(0)
    const offsets = []   // (float64, relative to origin)
    const colors = []
    let prev = origin
    if (Number.isFinite(totalDuration)) {
      for (let deltaT = tStep; deltaT < totalDuration; deltaT += tStep) {
        const curr = pointAt(deltaT)
        offsets.push(prev.x - origin.x, prev.y - origin.y, prev.z - origin.z)
        offsets.push(curr.x - origin.x, curr.y - origin.y, curr.z - origin.z)
        // Major hash marks every 60 seconds and minor ones every 10 seconds
        const floorT = Math.floor(deltaT)
        if ((floorT%10==9) || (floorT%60==58)) color.setHSL(0.0, 0.8, 0.7)
        else color.setHSL(0.35, 0.8, 0.3)
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
        prev = curr
      }
    }
    if (offsets.length > 0) {
      const { high, low } = splitPositions(offsets)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(high, 3))
      geometry.setAttribute('positionLow', new THREE.BufferAttribute(low, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      const material = withRelativeToEye(new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: dParamWithUnits['launchTrajectoryVisibility'].value
      }))
      const line = new THREE.LineSegments(geometry, material)
      line.name = 'launchTrajectoryLine'
      line.position.copy(origin)
      line.renderOrder = 1
      line.onBeforeRender = (renderer, scene, camera) => material.userData.setCamera(line, camera)
      group.add(line)
    }

    this.launchTrajectoryMesh = group
    planetCoordSys.add(group)
  }

  unusedCalculations() {
      // TBD these parameters should come from "the universe"
      console.error('Executing unused code!')

      this.MPayload = 60000;
      this.Alt_LEO = 400000;
      this.Alt_Perigee = 48000;
      this.WholesaleElectricityCost = 0.05;
      this.LiquidHydrogenCostPerGallon = 0.98;
      this.LiquidOxygenCostPerGallon = 0.67;
      this.MassOfOneGallonOfLiquidHydrogen = 0.2679; // kg / Gallon
      this.MassOfOneGallonOfLiquidOxygen = 4.322; // kg / Gallon
      this.MassOfHydrogen = 384071 * this.MassOfOneGallonOfLiquidHydrogen;
      this.MassOfOxygen = 141750 * this.MassOfOneGallonOfLiquidOxygen;
      this.FuelCostPerkg = (this.MassOfHydrogen / this.MassOfOneGallonOfLiquidHydrogen * this.LiquidHydrogenCostPerGallon + this.MassOfOxygen / this.MassOfOneGallonOfLiquidOxygen * this.LiquidOxygenCostPerGallon) / (this.MassOfHydrogen + this.MassOfOxygen);
      this.EstimatedCostToFuelSLSToLEO = ((979452 - 85270) + (30710 - 3490)) * this.FuelCostPerkg / 95000;
      this.RocketsSpecificImpulse = 452; // RS-25
      this.RocketEnginesMass = 3527; // RS-25
      this.LauncherEfficiency = 0.75;
      this.MaxGees = 3;
      this.LauncherAltitude = 32000;
      this.Alt_EvacuatedTube = 32000;
      this.VehicleRadius = 2.4/2; // Assuming a cylindrically shaped vehicle the diameter of an RS-25 Rocket Engine

      this.R_LEO = this.planetRadius + this.Alt_LEO;

      this.PotentialEnergy_Joules = -this.mu * this.MPayload / this.planetRadius;
      this.PotentialEnergy_kWh = this.PotentialEnergy_Joules / 3600000;
      this.CostOfPotentialEnergyToEscape = -this.PotentialEnergy_kWh * this.WholesaleElectricityCost;
      this.CostPerkgToEscape = this.CostOfPotentialEnergyToEscape / this.MPayload;
      this.LEOOrbitVelocity = Math.sqrt(this.mu / (this.planetRadius + this.Alt_LEO));
      this.Alt_Apogee = this.Alt_LEO;
      this.EllipseMajorAxisLength = this.Alt_Perigee + this.planetRadius * 2 + this.Alt_Apogee;
      this.EllipseSemiMajorAxisLength = this.EllipseMajorAxisLength / 2;
      this.Eccentricity = 1.0 - (this.planetRadius + this.Alt_Perigee) / this.EllipseSemiMajorAxisLength;
      this.EllipseSemiMinorAxisLength = this.EllipseSemiMajorAxisLength * Math.sqrt(1 - this.Eccentricity**2);

      this.EllipticalOrbitPerigeeVelocity = Math.sqrt(this.mu*(2 / (this.planetRadius + this.Alt_Perigee) - 2 / this.EllipseMajorAxisLength));
      this.EllipticalOrbitApogeeVelocity = Math.sqrt(this.mu*(2 / (this.planetRadius + this.Alt_Apogee) - 2 / this.EllipseMajorAxisLength));
      this.EllipticalOrbitVelocityAtLauncherExit = Math.sqrt(this.mu * (2 / (this.planetRadius + this.Alt_EvacuatedTube) - (1 / this.EllipseSemiMajorAxisLength)));
      this.EllipticalOrbitPeriod = 2 * Math.PI * Math.sqrt(Math.pow(this.EllipseSemiMajorAxisLength, 3) / (this.mu));
      this.EarthsRimSpeed = 2 * Math.PI*(this.planetRadius + this.Alt_Perigee) / 24 / 3600;  // ToDo: This needs to be a function of where edge of ring is
      this.DeltaVeeToCircularizeOrbit = this.LEOOrbitVelocity - this.EllipticalOrbitApogeeVelocity;
      this.DeltaVeeToDeCircularizeOrbit = this.DeltaVeeToCircularizeOrbit; // Need this much DeltaV to return to Earth
      this.TotalDeltaV = this.DeltaVeeToCircularizeOrbit + this.DeltaVeeToDeCircularizeOrbit;
      this.M0OverMf = Math.exp(this.TotalDeltaV / (this.RocketsSpecificImpulse*this.const_g));
      this.FueledVehicleMassAtApogee = (this.MPayload + this.RocketEnginesMass)*this.M0OverMf;
      this.FueledVehiclesKineticEnergyAtPerigee_Joules = 0.5*this.FueledVehicleMassAtApogee*(this.EllipticalOrbitPerigeeVelocity - this.EarthsRimSpeed)**2;
      this.FueledVehiclesKineticEnergyAtPerigee_kWh = this.FueledVehiclesKineticEnergyAtPerigee_Joules / 3600000;
      this.CostToLaunchFueledVehicle = this.FueledVehiclesKineticEnergyAtPerigee_kWh * this.LauncherEfficiency * this.WholesaleElectricityCost;
      this.CostPerkgOfPayload = this.CostToLaunchFueledVehicle / this.MPayload;

      // Next, we will work out the length of the launcher's track and the launch time...
      this.LauncherTrackLength = 0.5*(this.EllipticalOrbitPerigeeVelocity - this.EarthsRimSpeed)**2 / (this.MaxGees*this.const_g);
      this.AccelerationTime = Math.sqrt(2 * this.LauncherTrackLength / (this.MaxGees*this.const_g));
      // A rough approximation here - assuming that the S curve is close to flat so we can just subtract or add one Gee to account for Earth's Gravity 
      this.AllowableUpwardTurningRadius = this.EllipticalOrbitPerigeeVelocity**2 / ((this.MaxGees - 1)*this.const_g);
      this.AllowableDownwardTurningRadius = this.EllipticalOrbitPerigeeVelocity**2 / ((this.MaxGees + 1)*this.const_g);
      if (this.Alt_Perigee > this.LauncherAltitude) {
          // In this case we know that the optimal release point is at the orbit's perigee.
          const TriangleSideA = this.planetRadius + this.Alt_Perigee - this.AllowableDownwardTurningRadius;
          const TriangleSideB = this.planetRadius + this.LauncherAltitude + this.AllowableUpwardTurningRadius;
          const TriangleSideC = this.AllowableUpwardTurningRadius + this.AllowableDownwardTurningRadius;
          const AngleA = Math.acos((TriangleSideA**2 - TriangleSideB**2 - TriangleSideC**2) / (-2 * TriangleSideB*TriangleSideC));
          const AngleB = Math.acos((TriangleSideB**2 - TriangleSideA**2 - TriangleSideC**2) / (-2 * TriangleSideA*TriangleSideC));
          const AngleD = Math.PI - AngleB;
          this.CurveUpDistance = AngleA * this.AllowableUpwardTurningRadius;
          this.CurveDownDistance = AngleD * this.AllowableDownwardTurningRadius;
      }
      else {
          // In this case the optimal release point is not the eliptical orbit's perigee, but rather the point where the eliptical orbit 
          // intercects with Alt_EvacuatedTubeHeight, or the highest altitude at which it is feasible to use the launch system to alter
          // the tragectory of the vehicle. We need to figure out the location of this point and the velocity vector at that point.

          this.CurveUpDistance = 0;
          this.CurveDownDistance = 0;
      }
      this.TotalSCurveDistance = this.CurveUpDistance + this.CurveDownDistance;
      this.launchVehicleTimeWithinRamp = this.CurveUpDistance / this.EllipticalOrbitPerigeeVelocity;
      this.CurveDownTime = this.CurveDownDistance / this.EllipticalOrbitPerigeeVelocity;
      this.TotalTimeInLaunchSystem = this.AccelerationTime + this.launchVehicleTimeWithinRamp + this.CurveDownTime;
      this.VehicleCrossSectionalAreaForDrag = Math.PI * this.VehicleRadius ** 2
  }

  getOrbitalElementsFromStateVectorWrapper() {
    return (...args) => this.orbitalElementsFromStateVector(...args)
  }
  getRV_from_R0V0AandtWrapper() {
    return (...args) => this.RV_from_R0V0Aandt(...args)
  }
  
}

launcher.prototype.animate = LauncherAnimate.defineAnimate()
launcher.prototype.updateCoiledEvacuatedTube = LauncherAnimate.defineUpdateCoiledEvacuatedTube()
launcher.prototype.updateMassDriverTubes = LauncherAnimate.defineUpdateMassDriverTubes()
launcher.prototype.updateStaticModels = LauncherAnimate.defineUpdateStaticModels()
launcher.prototype.trajectoryCurvesParametersHaveChanged = LaunchTrajectoryUtils.defineTrajectoryCurvesParametersHaveChanged()
launcher.prototype.updateTrajectoryCurves = LaunchTrajectoryUtils.defineUpdateTrajectoryCurves()
launcher.prototype.updateTrajectoryCurvesRocket = LaunchTrajectoryRocket.defineUpdateTrajectoryCurvesRocket()

// Methods from OrbitMath.js
launcher.prototype.stumpC = OrbitMath.define_stumpC()
launcher.prototype.stumpS = OrbitMath.define_stumpS()
launcher.prototype.f_and_g = OrbitMath.define_f_and_g()
launcher.prototype.fDot_and_gDot = OrbitMath.define_fDot_and_gDot()
launcher.prototype.kepler_U = OrbitMath.define_kepler_U()
launcher.prototype.RV_from_R0V0Aandt = OrbitMath.define_RV_from_R0V0Aandt()
launcher.prototype.orbitalElementsFromStateVector = OrbitMath.define_orbitalElementsFromStateVector()

//launcher.prototype.calculateTimeToApogeeFromOrbitalElements = OrbitMath.define_calculateTimeToApogeeFromOrbitalElements()
//launcher.prototype.getAltitudeDistanceAndVelocity = OrbitMath.define_getAltitudeDistanceAndVelocity()
launcher.prototype.getAirDensity = OrbitMath.define_getAirDensity()
launcher.prototype.saveGeometryAsSTL = SaveGeometryAsSTL.define_SaveGeometryAsSTL()
launcher.prototype.genLauncherSpecs = EngineeringDetails.define_genLauncherSpecs()
