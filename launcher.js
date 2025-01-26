import * as THREE from 'three'
//import { XYChart } from './XYChart.js'
import { CatmullRomSuperCurve3, SuperCurvePath } from './SuperCurves.js'
import * as tram from './tram.js'
import { referenceFrame } from './ReferenceFrame.js'
import { launchVehicleModel, virtualLaunchVehicle } from './LaunchVehicle.js'
import { launchSledModel, virtualLaunchSled } from './LaunchSled.js'
import { adaptiveNutModel, virtualAdaptiveNut } from './AdaptiveNut.js'
import { massDriverTubeModel, virtualMassDriverTube } from './MassDriverTube.js'
import { massDriverRailModel, virtualMassDriverRail } from './MassDriverRail.js'
import { massDriverBracketModel, virtualMassDriverBracket } from './MassDriverBracket.js'
import { massDriverScrewModel, virtualMassDriverScrew } from './MassDriverScrew.js'
//import { evacuatedTubeModel, virtualEvacuatedTube } from './EvacuatedTube.js'
import * as LaunchTrajectoryUtils from './LaunchTrajectoryUtils.js'
import * as LaunchTrajectoryRocket from './launchTrajectoryRocket.js'
import * as OrbitMath from './OrbitMath.js'
import * as SaveGeometryAsSTL from './SaveGeometryAsSTL.js'
import * as EngineeringDetails from './EngineeringDetails.js'
import {getSpiralParameters, getSpiralCoordinates} from './spiral.js'

//import { arrow } from './markers.js'
//import { FrontSide } from 'three'

export class launcher {

  constructor(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, xyChart, clock, specs, genLauncherKMLFile, kmlFile) {

    // this.worker = new Worker("worker.js")

    // this.worker.onmessage = function(e) {
    //   console.log('Message received from worker', e.data);
    // }
    
    // this.worker.postMessage("Hello World!");

    this.const_G = 0.0000000000667408;  // ToDo: Should get this from the universeSpec
    this.clock = clock
    this.versionNumber = 0

    // Possible User defined (e.g. if user changes the planet)
    this.const_g = 9.8
    this.mu = planetSpec.gravitationalParameter

    this.xyChart = xyChart

    // User defined parameters
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
    this.CoefficientOfDrag = 0.4;

    this.scene = planetCoordSys

    this.timeWithinMassDriver = dParamWithUnits['launcherMassDriverExitVelocity'].value / dParamWithUnits['launcherMassDriverForwardAcceleration'].value
  
    const redMaterial = new THREE.MeshLambertMaterial({color: 0xdf4040})
    const greenMaterial = new THREE.MeshLambertMaterial({color: 0x40df40})
    const blueMaterial = new THREE.MeshLambertMaterial({color: 0x4040df})
    const orangeMaterial = new THREE.MeshLambertMaterial({color: 'orange'})
    this.launchTrajectoryMarker0 = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), redMaterial)
    const launchTrajectoryMarkerSize = dParamWithUnits['launcherMarkerRadius'].value
    this.launchTrajectoryMarker0.scale.set(launchTrajectoryMarkerSize, launchTrajectoryMarkerSize, launchTrajectoryMarkerSize)
    this.launchTrajectoryRedMarker = this.launchTrajectoryMarker0.clone()
    this.launchTrajectoryRedMarker.material = redMaterial
    this.launchTrajectoryGreenMarker = this.launchTrajectoryMarker0.clone()
    this.launchTrajectoryGreenMarker.material = greenMaterial
    this.launchTrajectoryBlueMarker = this.launchTrajectoryMarker0.clone()
    this.launchTrajectoryBlueMarker.material = blueMaterial
    this.launchTrajectoryOrangeMarker = this.launchTrajectoryMarker0.clone()
    this.launchTrajectoryOrangeMarker.material = orangeMaterial
    this.launchTrajectoryMarker5 = this.launchTrajectoryMarker0.clone()
    this.launchTrajectoryMarker6 = this.launchTrajectoryMarker0.clone()
    planetCoordSys.add(this.launchTrajectoryMarker0)
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

    this.unallocatedLaunchVehicleModels = []
    this.unallocatedLaunchSledModels = []
    this.unallocatedAdaptiveNutModels = []
    this.unallocatedMassDriverTubeModels = []
    this.unallocatedMassDriverRailModels = []
    this.unallocatedMassDriver2BracketModels = []
    this.unallocatedMassDriverAccelerationScrewModels = []
    this.unallocatedEvacuatedTubeModels = []

    this.tubeModelObject = new massDriverTubeModel(dParamWithUnits)
    this.railModelObject = new massDriverRailModel(dParamWithUnits)
    this.bracketModelObject = new massDriverBracketModel(dParamWithUnits)

    this.cameraRange = []
    this.cameraRange[0] = dParamWithUnits['massDriverCameraRange'].value
    this.cameraRange[1] = dParamWithUnits['launchSledCameraRange'].value
    this.cameraRange[2] = dParamWithUnits['vehicleInTubeCameraRange'].value
    this.cameraRange[3] = dParamWithUnits['lauchVehicleCameraRange'].value

    // Create rail materials
    this.massDriverRailMaterials = []
    this.massDriverRailMaterials[0] = new THREE.MeshPhongMaterial( { color: 0x31313E } )
    this.massDriverRailMaterials[1] = new THREE.MeshPhongMaterial( { color: 0x79111E } )

    switch (dParamWithUnits['launchTrajectorySelector'].value) {
      default:
        this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
        break
      case 1:
        this.updateTrajectoryCurvesRocket(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
        break
      }

    this.numVirtualLaunchVehicles = 0
    this.numVirtualLaunchSleds = 0
    this.numVirtualAdaptiveNuts = 0
    this.numVirtualMassDriverTubes = 0
    this.numVirtualMassDriverRailsPerZone = 0
    this.numVirtualMassDriverBrackets = 0
    this.numVirtualMassDriverAccelerationScrews = 0
    //this.numVirtualEvacuatedTubes = 0

    // Thinking that later we'll need a second reference frame for the rails and sleds so that they can split off from the launch vehicles
    // at the end of the upward ramp, decellerate, and loop back around to the start of the mass driver.
    // const rf1 = new referenceFrame(launchCurve, numZones, this.cameraRange, 0, 0, 0, 'staticLaunchSledReferenceFrame')
    // rf1.addVirtualObject('virtualLaunchSleds')
    // rf1.addVirtualObject('virtualMassDriverRails')
    // this.refFrames.push(rf1)
    
    this.perfOptimizedThreeJS = dParamWithUnits['perfOptimizedThreeJS'].value ? 1 : 0

    // Next, create all of the virtual objects that will be placed along the launch trajectory curve

    this.massDriverScrewTexture = new THREE.TextureLoader().load( './textures/steelTexture.jpg' )

    // Add the virtual launch sleds and launch vehicles
    const tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
    
    // Create and add the launch sleds
    const launchSledMesh = new launchSledModel(
      dParamWithUnits,
      this.scene,
      this.unallocatedLaunchSledModels,
      this.perfOptimizedThreeJS,
      this.massDriverScrewTexture)

    // Create and add the adaptive nuts
    const adaptiveNutMesh = new adaptiveNutModel(
      dParamWithUnits,
      this.scene,
      this.unallocatedAdaptiveNutModels,
      this.perfOptimizedThreeJS,
      this.massDriverScrewTexture)

    // Create and add the launch vechicle models
    const launchVehicleMesh = new launchVehicleModel(dParamWithUnits, this.scene, this.unallocatedLaunchVehicleModels, this.perfOptimizedThreeJS)

    // Create a placeholder screw model (these models need to be generated on the fly though)
    this.massDriverScrewMaterials = []

    // Hack
    //this.massDriverScrewMaterials[0] = new THREE.MeshPhongMaterial({wireframe: true, color: 0xffffff})
    //this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({wireframe: true, color: 0x7f7f7f})
    this.massDriverScrewMaterials[0] = new THREE.MeshPhongMaterial({color: 0xffffff})
    this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({color: 0x7f7f7f})
    //this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({map: this.massDriverScrewTexture})

    this.numZones = 200
    this.updateReferenceFrames(dParamWithUnits, timeSinceStart, planetSpec, crv)
    //this.update(dParamWithUnits, timeSinceStart, planetSpec, crv)

    const screwModels = new THREE.Group()
    const screwModelObject = new massDriverScrewModel()
    screwModels.name = 'massDriverScrews'
    screwModels.userData = -1  // This is the index of the model starting from the breach of the mass driver. -1 is an invalid index which will force the model to be regenerated.
    const tempIndex = 0
    const leftModel = screwModelObject.createModel(dParamWithUnits, this.accelerationScrewLength, this.massDriverAccelerationScrewSegments, tempIndex, this.massDriverScrewMaterials, false)
    if (dParamWithUnits['saveMassDriverScrewSTL'].value) {
      const saveModel = screwModelObject.createModel(dParamWithUnits, this.accelerationScrewLength, this.massDriverAccelerationScrewSegments, tempIndex, this.massDriverScrewMaterials, true)
      this.saveGeometryAsSTL(saveModel, 'massDriverScrew.stl')
    }
    leftModel.userData = 0
    leftModel.scale.set(1, 1, 1)
    screwModels.add(leftModel)
    const rightModel = leftModel.clone()
    rightModel.userData = 1
    rightModel.scale.set(-1, 1, 1)
    screwModels.add(rightModel)
    this.unallocatedMassDriverAccelerationScrewModels.push(screwModels)

    // Create bracket models
    for (let i = 0; i<1; i++) {
      const tempModel = this.bracketModelObject.createModel(this.polyCurveForrf0, this.accelerationScrewLength, (this.massDriverAccelerationScrewSegments+1), i)
      tempModel.name = 'massDriver2Bracket'
      this.unallocatedMassDriver2BracketModels.push(tempModel)
    }

    this.coilCenterMarker = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), orangeMaterial)
    this.coilCenterMarker.name = 'coilCenterMarker'
    this.coilCenterMarker.visible = false
    this.scene.add(this.coilCenterMarker)

  }

  updateReferenceFrames(dParamWithUnits, timeSinceStart, planetSpec, crv) {

    this.prevRefFrames = this.refFrames
    this.refFrames = []
    const numZones = this.numZones

    // ToDo: We need another curve right before the mass driver curve for feeding the launch vehicles and sleds into the screws from
    this.polyCurveForrf0 = new SuperCurvePath()
    this.polyCurveForrf0.name = "massDriver2Path"
    this.polyCurveForrf0.add(this.massDriver1Curve)
    this.polyCurveForrf0.add(this.massDriver2Curve)
    this.polyCurveForrf0.subdivide(numZones)
    this.accelerationScrewLength = this.polyCurveForrf0.getLength()
    const rf0 = new referenceFrame(this.polyCurveForrf0, numZones, this.cameraRange[0], 0, 0, 0, 'massDriver2RefFrame')

    this.polyCurveForrf1 = new SuperCurvePath()
    this.polyCurveForrf1.name = "adaptiveNutPath"
    this.polyCurveForrf1.add(this.feederRailCurve)
    this.polyCurveForrf1.add(this.massDriver1Curve)
    this.polyCurveForrf1.add(this.massDriver2Curve)
    this.polyCurveForrf1.add(this.launchRampCurve ? this.launchRampCurve[0] : null)
    this.polyCurveForrf1.subdivide(numZones)
    const rf1 = new referenceFrame(this.polyCurveForrf1, numZones, this.cameraRange[1], 0, 0, 0, 'adaptiveNutRefFrame')

    this.polyCurveForrf2 = new SuperCurvePath()
    this.polyCurveForrf2.name = "launchSledPath"
    this.polyCurveForrf2.add(this.feederRailCurve)
    this.polyCurveForrf2.add(this.massDriver1Curve)
    this.polyCurveForrf2.add(this.massDriver2Curve)
    this.polyCurveForrf2.add(this.launchRampCurve ? this.launchRampCurve[1] : null)
    this.polyCurveForrf2.add(this.launchSledReturnCurve)
    this.polyCurveForrf2.subdivide(numZones)
    const rf2 = new referenceFrame(this.polyCurveForrf2, numZones, this.cameraRange[1], 0, 0, 0, 'launchSledRefFrame')

    this.polyCurveForrf3 = new SuperCurvePath()
    this.polyCurveForrf3.name = "launchVehicleInTubePath"
    this.polyCurveForrf3.add(this.feederRailCurve)
    this.polyCurveForrf3.add(this.massDriver1Curve)
    this.polyCurveForrf3.add(this.massDriver2Curve)
    this.polyCurveForrf3.add(this.launchRampCurve ? this.launchRampCurve[1] : null)
    if (this.animateElevatedEvacuatedTubeDeployment) {
      this.polyCurveForrf3.add(this.coiledElevatedEvacuatedTubeCurve)
    }
    else {
      this.polyCurveForrf3.add(this.evacuatedTubeCurve)
    }
      //this.polyCurveForrf3.add(this.launchSledReturnCurve)
    this.polyCurveForrf3.subdivide(numZones)
    const rf3 = new referenceFrame(this.polyCurveForrf3, numZones, this.cameraRange[2], 0, 0, 0, 'launchVehicleInTubeRefFrame')

    this.polyCurveForrf4 = new SuperCurvePath()
    this.polyCurveForrf4.name = "launchVehiclePath"
    this.polyCurveForrf4.add(this.feederRailCurve)
    this.polyCurveForrf4.add(this.massDriver1Curve)
    this.polyCurveForrf4.add(this.massDriver2Curve)
    this.polyCurveForrf4.add(this.launchRampCurve ? this.launchRampCurve[1] : null)
    this.polyCurveForrf4.add(this.evacuatedTubeCurve)
    this.polyCurveForrf4.add(this.freeFlightPositionCurve)
    this.polyCurveForrf4.subdivide(numZones)
    const rf4 = new referenceFrame(this.polyCurveForrf4, numZones, this.cameraRange[3], 0, 0, 0, 'launchVehicleRefFrame')

    // For debugging the curves
    // function quickLog(paramName) {
    //   console.log(paramName, dParamWithUnits[paramName].value)
    // }
    // Object.keys(dParamWithUnits).forEach(key => {
    //   if (key.includes("launcher") && (key.includes("Acceleration")||key.includes("Velocity")||key.includes("Length"))) quickLog(key)
    // })
    // let count = 0
    // Object.keys(dParamWithUnits).forEach(key => {
    //   if (key.includes("launch") || key.includes("adaptive") || key.includes("massDriver")) count++
    // })
    // console.log('#### Launcher Parameters', count)

    // const polyCurves = [this.polyCurveForrf0, this.polyCurveForrf1, this.polyCurveForrf2, this.polyCurveForrf3, this.polyCurveForrf4]
    // THREE.Vector3.prototype[Symbol.iterator] = function () {
    //   return [this.x, this.y, this.z][Symbol.iterator]();
    // };
    // function getLon(vec) {return tram.ecefToGeodetic(...vec, planetSpec.ellipsoid).lon}
    // polyCurves.forEach(polyCurve => {
    //   console.log(polyCurve.name)
    //   let p0, p1, lastP0, lastP1
    //   lastP0 = lastP1 = null
    //   polyCurve.superCurves.forEach(curve => {
    //     p0 = curve.getPointAt(0)
    //     p1 = curve.getPointAt(1)
    //     if (lastP0) console.log(p0.distanceTo(lastP0), p0.distanceTo(lastP1))
    //     const lon0 = getLon(p0)
    //     const lon1 = getLon(p1)
    //     console.log(lon0, lon1, lon1-lon0, p0.distanceTo(p1), curve.name)
    //     lastP0 = p0
    //     lastP1 = p1
    //   })
    // })

    rf0.addVirtualObject('virtualMassDriverBrackets')
    rf0.addVirtualObject('virtualMassDriverAccelerationScrews')
    rf1.addVirtualObject('virtualAdaptiveNuts')
    rf2.addVirtualObject('virtualMassDriverRails')
    rf2.addVirtualObject('virtualLaunchSleds')
    rf3.addVirtualObject('virtualMassDriverTubes')
    //rf3.addVirtualObject('virtualEvacuatedTubes')
    rf4.addVirtualObject('virtualLaunchVehicles')

    rf0.initialize()
    rf1.initialize()
    rf2.initialize()
    rf3.initialize()
    rf4.initialize()
    this.refFrames.push(rf0, rf1, rf2, rf3, rf4)

    let maxNumZones = 0
    this.refFrames.forEach(refFrame => {
      maxNumZones = Math.max(maxNumZones, refFrame.numZones)
    })
    this.actionFlags = new Array(maxNumZones).fill(0)

    this.update(dParamWithUnits, timeSinceStart, planetSpec, crv)

    // ToDo: Why is this line here? It's also at the top of the function. Delete???
    this.prevRefFrames = this.refFrames

  }

  removeOldMassDriverTubes() {
    if (this.numVirtualMassDriverTubes > 0) {
      // Remove old virtual mass driver tubes
      const refFrame = this.prevRefFrames[2]
      this.removeOldVirtualObjects(this.scene, [refFrame], 'virtualMassDriverTubes', this.unallocatedMassDriverTubeModels)
      // Destroy all of the massdriver tube models since these can't be reused when we change the shape of the tube
      this.unallocatedMassDriverTubeModels.forEach(model => {
        this.scene.remove(model)
        model.geometry.dispose()
        model = null
      })
      this.unallocatedMassDriverTubeModels.splice(0, this.unallocatedMassDriverTubeModels.length)
    }
  }
  
  generateNewMassDriverTubes() {
    if (this.newNumVirtualMassDriverTubes>0) {
      virtualMassDriverTube.hasChanged = true
      // Add new mass driver tubes to the launch system
      const refFrame = this.refFrames[3]
      const n = this.newNumVirtualMassDriverTubes
      for (let i = 0; i < n; i++) {
        const d = (i+0.5)/n
        const vmdt = new virtualMassDriverTube(d, this.unallocatedMassDriverTubeModels)
        vmdt.model = this.tubeModelObject.createModel(refFrame.curve, i)
        vmdt.model.name = 'massDriverTube'
        const zoneIndex = refFrame.curve.getZoneIndexAt(d)
        if (zoneIndex>=this.numZones) {
          console.log(refFrame.curve, d)
          console.log('Error')
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
        }
        if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
          refFrame.wedges[zoneIndex]['virtualMassDriverTubes'].push(vmdt)
          this.scene.add(vmdt.model)
        }
        else {
          console.log('Error')
        }
      }
      refFrame.prevStartWedgeIndex = -1
    }
  }

  update(dParamWithUnits, timeSinceStart, planetSpec, crv) {
    this.versionNumber++

    // Todo: We should detect whether an update of the curves is called for as it's a time consuming operation...
    //this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

    this.planetRadius = tram.radiusAtLatitude(dParamWithUnits['launcherRampEndLatitude'].value*Math.PI/180, planetSpec.ellipsoid)

    // Indicate that the curve path's cached values are no longer valid
    this.polyCurveForrf0.updateArcLengths()
    this.polyCurveForrf1.updateArcLengths()
    this.polyCurveForrf2.updateArcLengths()
    this.polyCurveForrf3.updateArcLengths()
    this.polyCurveForrf4.updateArcLengths()

    this.tubeModelObject.update(dParamWithUnits)
    this.railModelObject.update(dParamWithUnits)
    this.bracketModelObject.update(dParamWithUnits)

    // ToDo: updateReferenceFrames is calling this function. Is this circular?
    this.refFrames.forEach(refFrame => {
      // ToDo: We should detect whether we need to call update - this is a potentially time consuming operation
      refFrame.update()
      refFrame.timeSinceStart = timeSinceStart
    })

    virtualMassDriverTube.update(dParamWithUnits, this.versionNumber)
    virtualMassDriverRail.update(dParamWithUnits, this.versionNumber)
    virtualMassDriverBracket.update(dParamWithUnits, this.polyCurveForrf0, this.versionNumber)
    virtualMassDriverScrew.update(dParamWithUnits, this.accelerationScrewLength, this.massDriverAccelerationScrewSegments, this.massDriverScrewMaterials, this.versionNumber)
    //virtualEvacuatedTube.update(dParamWithUnits, this.evacuatedTubeCurve)
    virtualAdaptiveNut.update(dParamWithUnits, this.accelerationScrewLength, this.scene, this.clock)
    virtualLaunchSled.update(dParamWithUnits, this.accelerationScrewLength, this.scene, this.clock)
    virtualLaunchVehicle.update(dParamWithUnits, planetSpec)
    this.animateLaunchVehicles = dParamWithUnits['animateLaunchVehicles'].value ? 1 : 0
    this.animateLaunchSleds = dParamWithUnits['animateLaunchSleds'].value ? 1 : 0
    this.animateAdaptiveNuts = dParamWithUnits['animateAdaptiveNuts'].value ? 1 : 0
    this.animateElevatedEvacuatedTubeDeployment = dParamWithUnits['animateElevatedEvacuatedTubeDeployment'].value
    this.lastElevatedEvacuatedTubeDeploymentAlpha = -1
    this.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    this.showMarkers = dParamWithUnits['showMarkers'].value
    
    // Shared values...
    const tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
    const halfBracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value / 2 / this.accelerationScrewLength
    const numBrackets = dParamWithUnits['launcherMassDriverScrewNumBrackets'].value  // This is a limit to the number of bracket we'll render. After this number they will be moving too fast to bee seen.
    const tStart = 0 // sec

    let changeOccured

    // Update the number of launch vehicles
    const newNumVirtualLaunchVehicles = dParamWithUnits['showLaunchVehicles'].value ? dParamWithUnits['numVirtualLaunchVehicles'].value : 0
    changeOccured = (this.numVirtualLaunchVehicles != newNumVirtualLaunchVehicles) || (this.refFrames!==this.prevRefFrames)
    if (changeOccured) {
      if (this.numVirtualLaunchVehicles > 0) {
        const refFrame = this.prevRefFrames[3]
        // Remove old virtual launch vehicles
        this.removeOldVirtualObjects(this.scene, [refFrame], 'virtualLaunchVehicles', this.unallocatedLaunchVehicleModels)
      }
      if (newNumVirtualLaunchVehicles > 0) {
        // Add new virtual launch vehicles onto the launch system
        const refFrame = this.refFrames[4]
        virtualLaunchVehicle.hasChanged = true
        const n1 = newNumVirtualLaunchVehicles
        
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
        // Going backwards in time since we want to add vehicles that were launched in the past.
        const durationOfLaunchTrajectory = refFrame.curve.getDuration()
        for (let t = tStart, i = 0; (t > -(tStart+durationOfLaunchTrajectory)) && (i<n1); t -= tInc, i++) {
          // Calculate where along the launcher to place the vehicle.
          const deltaT = adjustedTimeSinceStart - t
          const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex]['virtualLaunchVehicles'].push(new virtualLaunchVehicle(t, this.unallocatedLaunchVehicleModels))
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualLaunchVehicles = newNumVirtualLaunchVehicles

    // Update the number of launch sleds
    const newNumVirtualLaunchSleds = dParamWithUnits['showLaunchSleds'].value ? dParamWithUnits['numVirtualLaunchSleds'].value : 0
    changeOccured = (this.numVirtualLaunchSleds != newNumVirtualLaunchSleds) || (this.refFrames!==this.prevRefFrames)
    if (changeOccured) {
      if (this.numVirtualLaunchSleds > 0) {
        // Remove old virtual launch sleds
        const refFrame = this.prevRefFrames[2]
        this.removeOldVirtualObjects(this.scene, [refFrame], 'virtualLaunchSleds', this.unallocatedLaunchSledModels)
      }
      if (newNumVirtualLaunchSleds > 0) {
        virtualLaunchSled.hasChanged = true
        // Add new virtual launch sleds onto the launch system
        const refFrame = this.refFrames[2]
        const n1 = newNumVirtualLaunchSleds
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
        // Going backwards in time since we want to add vehicles that were launched in the past.
        const durationOfSledTrajectory = refFrame.curve.getDuration()
        for (let t = tStart, i = 0; (t > -(tStart+durationOfSledTrajectory)) && (i<n1); t -= tInc, i++) {
          // Calculate where along the launcher to place the vehicle. 
          const deltaT = adjustedTimeSinceStart - t
          const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          if (!zoneIndex && (zoneIndex!==0)) {
            console.log('Error')
            const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          }
          if (zoneIndex>=this.numZones) {
            console.log(refFrame.curve, deltaT)
            console.log('Error')
            const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          }

          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex]['virtualLaunchSleds'].push(new virtualLaunchSled(t, this.unallocatedLaunchSledModels))
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualLaunchSleds = newNumVirtualLaunchSleds
    
    // Update the number of adaptive nuts
    const newNumVirtualAdaptiveNuts = dParamWithUnits['showAdaptiveNuts'].value ? dParamWithUnits['numVirtualAdaptiveNuts'].value : 0
    changeOccured = (this.numVirtualAdaptiveNuts != newNumVirtualAdaptiveNuts) || (this.refFrames!==this.prevRefFrames)
    if (changeOccured) {
      if (this.numVirtualAdaptiveNuts > 0) {
        // Remove old virtual launch sleds
        const refFrame = this.prevRefFrames[1]
        this.removeOldVirtualObjects(this.scene, [refFrame], 'virtualAdaptiveNuts', this.unallocatedAdaptiveNutModels)
      }
      if (newNumVirtualAdaptiveNuts > 0) {
        virtualAdaptiveNut.hasChanged = true
        // Add new virtual launch sleds onto the launch system
        const refFrame = this.refFrames[1]
        const n1 = newNumVirtualAdaptiveNuts
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
        // Going backwards in time since we want to add vehicles that were launched in the past.
        const durationOfSledTrajectory = refFrame.curve.getDuration()
        for (let t = tStart, i = 0; (t > -(tStart+durationOfSledTrajectory)) && (i<n1); t -= tInc, i++) {
          // Calculate where along the launcher to place the vehicle. 
          const deltaT = adjustedTimeSinceStart - t
          const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          if (!zoneIndex && (zoneIndex!==0)) {
            console.log('Error')
            const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          }
          if (zoneIndex>=this.numZones) {
            console.log(refFrame.curve, deltaT)
            console.log('Error')
            const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          }

          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex]['virtualAdaptiveNuts'].push(new virtualAdaptiveNut(t, this.unallocatedAdaptiveNutModels))
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualAdaptiveNuts = newNumVirtualAdaptiveNuts
    
    // Update the number of mass driver tubes
    this.newNumVirtualMassDriverTubes = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualMassDriverTubes'].value : 0
    changeOccured = true || (this.numVirtualMassDriverTubes != newNumVirtualMassDriverTubes) || (this.refFrames!==this.prevRefFrames) || true  // We'll just assume that a change occured if update was called
    if (changeOccured) {
      this.removeOldMassDriverTubes()
      this.generateNewMassDriverTubes()
    }
    this.numVirtualMassDriverTubes = this.newNumVirtualMassDriverTubes

    // Update the number of mass driver rails
    const newNumVirtualMassDriverRailsPerZone = dParamWithUnits['showMassDriverRail'].value ? dParamWithUnits['numVirtualMassDriverRailsPerZone'].value : 0
    changeOccured = (this.numVirtualMassDriverRailsPerZone != newNumVirtualMassDriverRailsPerZone) || (this.refFrames!==this.prevRefFrames) || true  // We'll just assume that a change occured if update was called
    if (changeOccured) {
      if (this.numVirtualMassDriverRailsPerZone > 0) {
        // Remove old virtual mass driver rails
        const refFrame = this.prevRefFrames[2]
        this.removeOldVirtualObjects(this.scene, [refFrame], 'virtualMassDriverRails', this.unallocatedMassDriverRailModels)
        // Destroy all of the massdriver rail models since these can't be reused when we change the shape of the tube
        this.unallocatedMassDriverRailModels.forEach(model => {this.scene.remove(model)})
        this.unallocatedMassDriverRailModels.splice(0, this.unallocatedMassDriverRailModels.length)
      }
      if (newNumVirtualMassDriverRailsPerZone > 0) {
        const nrpz = newNumVirtualMassDriverRailsPerZone   // Number of rails per zone
        virtualMassDriverRail.hasChanged = true
        // Add new mass driver rails to the launch system
        const refFrame = this.refFrames[2]
        const totalCurveLength = refFrame.curve.getLength()
        refFrame.curve.superCurves.forEach((subCurve, subCurveIndex) => {
          const lengthOfSubCurve = subCurve.getLength()
          const lengthOffsetToSubcurve = (subCurveIndex==0) ? 0 : refFrame.curve.cacheLengths[subCurveIndex-1]
          const nscz = refFrame.curve.numZones[subCurveIndex]  // Number of subCurve zones
          const zoneIndexOffset = refFrame.curve.startZone[subCurveIndex]
          for (let i = 0; i < nscz ; i++) {
            const zoneIndex = zoneIndexOffset + i
            for (let j = 0; j < nrpz ; j++) {
              const d = (lengthOffsetToSubcurve + (i*nrpz+j+0.5)/(nscz*nrpz) * lengthOfSubCurve) / totalCurveLength
              const vmdr = new virtualMassDriverRail(d, this.unallocatedMassDriverRailModels)
              vmdr.model = this.railModelObject.createModel(subCurve, i*nrpz+j, nscz*nrpz, this.massDriverRailMaterials)
              vmdr.model.name = 'MassDriverRail'
              if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
                refFrame.wedges[zoneIndex]['virtualMassDriverRails'].push(vmdr)
                this.scene.add(vmdr.model)
              }
              else {
                console.log('Error')
              }
              //vmdr.model.scale.set(100,1,1) // This is a hack to make the rail larger and more visible
            }
          }
        })
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualMassDriverRailsPerZone = newNumVirtualMassDriverRailsPerZone

    // Update the number of mass driver screws
    const newNumVirtualMassDriverAccelerationScrews = dParamWithUnits['showMassDriverAccelerationScrews'].value ? this.massDriverAccelerationScrewSegments : 0
    changeOccured = (this.numVirtualMassDriverAccelerationScrews != newNumVirtualMassDriverAccelerationScrews) || (this.refFrames!==this.prevRefFrames)
    if (changeOccured) {
      if (this.numVirtualMassDriverAccelerationScrews > 0) {
        // Remove old virtual mass driver screws
        const refFrame = this.prevRefFrames[0]
        this.removeOldVirtualObjects(this.scene, [refFrame], 'virtualMassDriverAccelerationScrews', this.unallocatedMassDriverAccelerationScrewModels)
      }
      if (newNumVirtualMassDriverAccelerationScrews > 0) {
        virtualMassDriverScrew.hasChanged = true
        // Add new mass driver screws to the launch system
        const refFrame = this.refFrames[0]
        const n = newNumVirtualMassDriverAccelerationScrews
        let d
        for (let i = 0; i < n; i++) {
          // This if statement is part of a solution to make the brackets disappear a certain distance down
          // the track. At high speeds they temporally alias and this makes it harder to figure out what's going on.
          if (i<numBrackets) {
            d = (i+0.5)/n - halfBracketThickness
          }
          else {
            d = (i+0.5)/n
          }
          const vmdas = new virtualMassDriverScrew(d, i, this.unallocatedMassDriverAccelerationScrewModels)
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex]['virtualMassDriverAccelerationScrews'].push(vmdas)
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualMassDriverAccelerationScrews = newNumVirtualMassDriverAccelerationScrews

    // Update the number of mass driver brackets
    const newNumVirtualMassDriverBrackets = dParamWithUnits['showMassDriverBrackets'].value ? this.massDriverAccelerationScrewSegments : 0
    changeOccured = (this.numVirtualMassDriverBrackets != newNumVirtualMassDriverBrackets) || (this.refFrames!==this.prevRefFrames)
    if (changeOccured) {
      if (this.numVirtualMassDriverBrackets > 0) {
        // Remove old virtual mass driver brackets
        const refFrame = this.prevRefFrames[0]
        this.removeOldVirtualObjects(this.scene, [refFrame], 'virtualMassDriverBrackets', this.unallocatedMassDriver2BracketModels)
      }
      if (newNumVirtualMassDriverBrackets > 0) {
        virtualMassDriverBracket.hasChanged = true
        // Add new mass driver brackets to the launch system
        const refFrame = this.refFrames[0]
        const n = newNumVirtualMassDriverBrackets
        for (let i = 0; i < Math.min(n, numBrackets); i++) {
          const d = (i+0.5)/n - halfBracketThickness
          //const zoneIndex = Math.floor(d * refFrame.numZones) % refFrame.numZones
          const vmdb = new virtualMassDriverBracket(d, this.unallocatedMassDriver2BracketModels)
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex]['virtualMassDriverBrackets'].push(vmdb)
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualMassDriverBrackets = newNumVirtualMassDriverBrackets

    // Update launch trajectory markers
    this.launchTrajectoryMarker0.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryRedMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryGreenMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryBlueMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryOrangeMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryMarker5.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryMarker6.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value

    // Update 2D chart
    this.xyChart.visible = dParamWithUnits['showXYChart'].value

  }

  removeOldVirtualObjects(scene, refFrames, objectName, unallocatedModelsArray) {
    refFrames.forEach(refFrame => {
      for (let zoneIndex = 0; zoneIndex < refFrame.wedges.length; zoneIndex++) {
        if (objectName in refFrame.wedges[zoneIndex]) {
          const wedgeList = refFrame.wedges[zoneIndex][objectName]
          wedgeList.forEach(vobj => {
            if (vobj.model) {
              vobj.model.visible = false
              unallocatedModelsArray.push(vobj.model)
              scene.remove(vobj.model)
            }
          })
          wedgeList.splice(0, wedgeList.length)
        }
        else {
          // This isn't actually an error condition since we may not have any objects of this type in this wedge.
          // console.log('Error: ' + objectName + ' not found in wedge ' + zoneIndex + ' of refFrame ' + refFrame.name)
        }
      }
    })
  }

  drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys) {

    const color = new THREE.Color()
    const launchTrajectoryPoints = []
    const launchTrajectoryColors = []
    const totalDuration = this.polyCurveForrf4.getDuration()

    let prevVehiclePosition, currVehiclePosition
    
    let tStep = 1 // second
    let deltaT = 0
    let res, relevantCurve, i

    res = this.polyCurveForrf4.findRelevantCurve(deltaT)
    relevantCurve = res.relevantCurve
    // d = Math.max(0, Math.min(1, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength))
    i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
    const refPosition = relevantCurve.getPoint(i)

    res = this.polyCurveForrf4.findRelevantCurve(deltaT)
    relevantCurve = res.relevantCurve
    i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
    prevVehiclePosition = relevantCurve.getPoint(i).sub(refPosition)

    deltaT += tStep

    for (; deltaT < totalDuration; deltaT += tStep) {
      res = this.polyCurveForrf4.findRelevantCurve(deltaT)
      relevantCurve = res.relevantCurve
      //d = Math.max(0, Math.min(1, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength))
      //const i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
      //const t = deltaT - res.relevantCurveStartTime
      const d = Math.max(0, Math.min(1, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength))
      try {
        //currVehiclePosition = relevantCurve.getPoint(t).sub(refPosition)
        currVehiclePosition = relevantCurve.getPointAt(d).sub(refPosition)
      }
      catch (e) {
        console.log(e)
        //currVehiclePosition = relevantCurve.getPoint(t).sub(refPosition)
        currVehiclePosition = relevantCurve.getPointAt(d).sub(refPosition)
      } 
      launchTrajectoryPoints.push(prevVehiclePosition)
      launchTrajectoryPoints.push(currVehiclePosition)
      prevVehiclePosition = currVehiclePosition.clone()
      // This code adds major thick hash marks to the line every 60 seconds, and thin hash marks every 10 seconds.
      const floorT = Math.floor(deltaT)
      if ((floorT%10==9) || (floorT%60==58)) {
        color.setHSL(0.0 , 0.8, 0.7 )
      }
      else {
        color.setHSL(0.35 , 0.8, 0.3 )
      }
      launchTrajectoryColors.push(color.r, color.g, color.b)
      launchTrajectoryColors.push(color.r, color.g, color.b)
    }

    const launchTrajectoryGeometry = new THREE.BufferGeometry().setFromPoints(launchTrajectoryPoints)
    launchTrajectoryGeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( launchTrajectoryColors, 3 ) )
  
    var launchTrajectoryMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: dParamWithUnits['launchTrajectoryVisibility'].value
    })

    if (this.launchTrajectoryMesh) {
      planetCoordSys.remove( this.launchTrajectoryMesh )
    }
    this.launchTrajectoryMesh = new THREE.LineSegments(launchTrajectoryGeometry, launchTrajectoryMaterial)
    this.launchTrajectoryMesh.name = 'launchTrajectory'
    this.launchTrajectoryMesh.visible = dParamWithUnits['showLaunchTrajectory'].value
    this.launchTrajectoryMesh.renderOrder = 1
    this.launchTrajectoryMesh.position.copy(refPosition)
    planetCoordSys.add( this.launchTrajectoryMesh )

  }

  animate(timeSinceStart, cameraPosition, elevatedEvacuatedTubeDeploymentAlpha) {
    // Move the virtual models of the launched vehicles along the launch trajectory
    let zoneIndex
    const assignModelList = []
    const removeModelList = []
    const updateModelList = []


    // Debug printout
    // const launcherRefFrame = this.refFrames[4]
    // launcherRefFrame.wedges.forEach((wedge, zoneIndex) => {
    //   if (zoneIndex<10) {
    //     Object.entries(wedge).forEach(([objectKey, objectValue]) => {
    //       if (objectKey=='virtualLaunchVehicles') {
    //         objectValue.forEach(launchVehicle => {
    //           console.log(zoneIndex, launchVehicle.timeLaunched, launchVehicle.model)
    //         })
    //       }
    //     })
    //   }
    // })
    //console.log("")

    if (this.animateElevatedEvacuatedTubeDeployment && (elevatedEvacuatedTubeDeploymentAlpha != this.lastElevatedEvacuatedTubeDeploymentAlpha)) {
      const originalTubeLength = this.evacuatedTubeCurve.getLength()
      const animatedEvacuatedTubeCurveControlPoints = []
      // We need to create a curve that follows the original curve to some fraction "Alpha" of it's length to a point
      // "A", after which it will spiral around a point "B" that is a distance "C" to the side of point A, where C is
      // proportional to the spiral's inner diameter, "r0" plus (E-r0)(1-Alpha), where E is the spiral's outer diameter.
      
      const alpha = Math.max(0.05, elevatedEvacuatedTubeDeploymentAlpha)
      const alpha2 = 1 - Math.min(0.05, elevatedEvacuatedTubeDeploymentAlpha) / 0.05
      const r0 = 1000 // m
      const rInc = -25 // m
      const A = this.evacuatedTubeCurve.getPointAt(alpha)
      const tangent = this.evacuatedTubeCurve.getTangentAt(alpha)
      const biNormal = tangent.clone().cross(A.clone().normalize())
      //const B = A.clone().add(biNormal.clone().multiplyScalar(-C))
      const P0 = this.evacuatedTubeCurve.getPointAt(0)
      const P0Length = P0.length()
      for (let alphaI = 0; alphaI<alpha; alphaI+=0.001) {
        const P = this.evacuatedTubeCurve.getPointAt(alphaI)
        const PLength = P.length()
        const scaleBy = (P0Length-3*(PLength-P0Length)*alpha2)/P0Length
        animatedEvacuatedTubeCurveControlPoints.push(P.multiplyScalar(scaleBy))
      }
      const coilCenterPoint = A.clone().add(biNormal.clone().multiplyScalar(-r0))
      const coilCenterPointLength = coilCenterPoint.length()
      const scaleBy = (P0Length-3*(coilCenterPointLength-P0Length)*alpha2)/P0Length
      this.coilCenterMarker.position.copy(coilCenterPoint.multiplyScalar(scaleBy))
      const arcLength = originalTubeLength * (1-alpha)
      const spiralParameters = getSpiralParameters(r0, rInc, arcLength)
      //console.log(arcLength, spiralParameters)
      for (let k = 0; k<1024; k++) {
        const theta = spiralParameters.totalTheta * k/1023
        const spiralXY = getSpiralCoordinates(spiralParameters, theta);
        const P = A.clone()
          .add(biNormal.clone().multiplyScalar(spiralXY.x))
          .add(tangent.clone().multiplyScalar(spiralXY.y))
        const PLength = P.length()
        const scaleBy = (P0Length-3*(PLength-P0Length)*alpha2)/P0Length  // "scaleBy" is a factor that is used to lower the coiled tube to the ground
        animatedEvacuatedTubeCurveControlPoints.push(P.multiplyScalar(scaleBy))
      }

      this.coiledElevatedEvacuatedTubeCurve.setPoints(animatedEvacuatedTubeCurveControlPoints)
      this.coiledElevatedEvacuatedTubeCurve.updateArcLengths()
      this.removeOldMassDriverTubes()
      this.generateNewMassDriverTubes()
      this.lastElevatedEvacuatedTubeDeploymentAlpha = elevatedEvacuatedTubeDeploymentAlpha
    }

    // Very hacky trick to make the mass driver brackets disappear a certain distance down the track. At high speeds they temporally alias and this makes it harder to figure out what's going on.
    //this.bracketModelObject.massDriverBracketMaterial.opacity = Math.max(0, Math.min(1, 0.25 / timeSinceStart - 0.05))

    // For objects that are moving around within their reference frame, we need to check whether they are still in the correct zone and reassign them if they are not.
    const movingObjects = ['virtualLaunchVehicles', 'virtualLaunchSleds', 'virtualAdaptiveNuts']

    this.refFrames.forEach(refFrame => {
      const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
      const curveDuration = refFrame.curve.getDuration()
      Object.entries(refFrame.placeholderEntries).forEach(([objectKey, objectValue]) => {
        if (movingObjects.includes(objectKey)) {
          const movingObject = objectKey
          const reassignList = []
          for (let zoneIndex = 0; zoneIndex < refFrame.numZones; zoneIndex++) {
            const keepList = []
            refFrame.wedges[zoneIndex][movingObject].forEach(object => {
              // Calculate where along the launcher to place the vehicle.
              const deltaT = adjustedTimeSinceStart - object.timeLaunched
              // Convert deltaT to a zoneIndex along the curveList.
              if (deltaT<=curveDuration) {
                // if ((objectKey=='virtualLaunchVehicles') && (object.timeLaunched==0.1)) {
                //   console.log(correctZoneIndex)
                // }
                const correctZoneIndex = refFrame.curve.getZoneIndex(deltaT)
                if ((correctZoneIndex>=0) && (correctZoneIndex<refFrame.numZones)) {
                  if (zoneIndex==correctZoneIndex) {
                    keepList.push(object)
                  }
                  else {
                    reassignList.push({correctZoneIndex, object})
                  }
                }
                else {
                  console.error("Error: correctZoneIndex out of range")
                }
              }
              else {
                // Object has travelled out of the linear range of the curve. Discard it.
                console.log("Discarding object " + movingObject)
                if (object.model) {
                  object.model.visible = false
                  object.unallocatedModels.push(object.model)
                  object.model = null
                }
                // To discard the virtual object we simply do not assign it to either keepList or reassignList 
              }
            })
            const pntrToArray = refFrame.wedges[zoneIndex][movingObject]
            pntrToArray.splice(0, pntrToArray.length)  // Delete the entire old list of items
            refFrame.wedges[zoneIndex][movingObject] = keepList
          }

          // Reassign the rest of the sleds to the correct wedges
          reassignList.forEach(reassignedObject => {
            const zoneIndex = reassignedObject['correctZoneIndex']
            refFrame.wedges[zoneIndex][movingObject].push(reassignedObject['object'])
          })
        }
      })
    })

    // let plot = ""
    // for (let zoneIndex = 0; zoneIndex < 130; zoneIndex++) {
    //   plot += launcherRefFrame.wedges[zoneIndex]['virtualLaunchVehicles'].length
    // }
    // console.log(plot)

    // End of moving object zone reassignment

    this.refFrames.forEach((refFrame, index) => {

      // Determine a start zone and finish zone along the curve for the launcher.
      // Note that this code assumes a fairly continuous path. It can't yet handle a more loopy path that enters the camera's range sphere more than once.
      let startZoneIndex = -1
      let finishZoneIndex = -1

      refFrame.curve.superCurves.forEach((superCurve, index) => {
        const cameraPos = cameraPosition.clone()
        let zoneStartFinishDValues, zoneStartFinishDValues2
        try {
          zoneStartFinishDValues = superCurve.getStartFinishZoneIndices( cameraPos, refFrame.cameraRange )
        }
        catch (e) {
          zoneStartFinishDValues2 = superCurve.getStartFinishZoneIndices( cameraPos, refFrame.cameraRange )
        }
        const numZones = refFrame.curve.numZones[index]
        const startZone = refFrame.curve.startZone[index]
        if (zoneStartFinishDValues.length==2) {
          const szi = startZone + Math.max(0, (Math.min(numZones-1, Math.floor(zoneStartFinishDValues[0] * numZones))))
          const fzi = startZone + Math.max(0, (Math.min(numZones-1, Math.floor(zoneStartFinishDValues[1] * numZones))))
    
          // Seek the smallest zone index that is not -1
          startZoneIndex = (startZoneIndex==-1) ? szi : Math.min(startZoneIndex, szi)
          finishZoneIndex = (finishZoneIndex==-1) ? fzi : Math.max(finishZoneIndex, fzi)
        }

        // Debug visualization code...
        // if (index==0) {
        //   if (zoneStartFinishDValues.length==2) {
        //     this.wedgeMarker0.position.copy(superCurve.getPointAt(zoneStartFinishDValues[0]))
        //     this.wedgeMarker0.visible = this.showMarkers
        //     this.wedgeMarker1.position.copy(superCurve.getPointAt(zoneStartFinishDValues[1]))
        //     this.wedgeMarker1.visible = this.showMarkers
        //   }
        //   else {
        //     this.wedgeMarker0.visible = false
        //     this.wedgeMarker1.visible = false
        //   }
        // }
        // End debug visualization code

      })

      refFrame.startWedgeIndex = startZoneIndex
      refFrame.finishWedgeIndex = finishZoneIndex
      //console.log(refFrame.startWedgeIndex, refFrame.finishWedgeIndex)

      // ToDo: Why check the flags for this?
      if (this.animateLaunchVehicles || this.animateLaunchSleds || this.animateAdaptiveNuts) {
        refFrame.timeSinceStart = timeSinceStart
      }
      const clearFlagsList = []
      
      // Set bit0 of actionFlags if wedge is currently visible
      if (refFrame.startWedgeIndex!=-1) {
        for (zoneIndex = refFrame.startWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          this.actionFlags[zoneIndex] |= 1
          clearFlagsList.push(zoneIndex)
          if (zoneIndex == refFrame.finishWedgeIndex) break
        }
      }
      // Set bit1 of actionFlags if wedge was previously visible
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (zoneIndex = refFrame.prevStartWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          this.actionFlags[zoneIndex] |= 2
          clearFlagsList.push(zoneIndex)
          if (zoneIndex == refFrame.prevFinishWedgeIndex) break
        }
      }

      if (refFrame.startWedgeIndex!=-1) {
        for (zoneIndex = refFrame.startWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          if (this.actionFlags[zoneIndex]==1) {
            // Wedge wasn't visible before and it became visible, assign it the assignModel list
            assignModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex})
          }
          if (this.actionFlags[zoneIndex] & 1 == 1) {
            // Wedge is currently visible, assign it the updateModel list
            updateModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex})
          }
          if (zoneIndex == refFrame.finishWedgeIndex) break
        }
      }
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (zoneIndex = refFrame.prevStartWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          if (this.actionFlags[zoneIndex]==2) {
            // Wedge was visible before and it became invisible, add it to the removeModel list
            removeModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex})
          }
          if (zoneIndex == refFrame.prevFinishWedgeIndex) break
        }
      }
      
      // Debug - ToDo clean this up when it's no longer needed
      // let different = false
      // for (let j=0; j<this.actionFlags.length; j++) {
      //   if (this.actionFlags[j]!=refFrame.prevActionFlags[j]) {
      //     different = true
      //     break
      //   }
      // }
      // if (different) {
      //   let prstr = ''
      //   for (let j = 0; j<this.actionFlags.length; j++) {
      //     prstr += String(this.actionFlags[j])
      //   }
      //   console.log(prstr)
      // }
      // for (let j=0; j<this.actionFlags.length; j++) {
      //   refFrame.prevActionFlags[j] = this.actionFlags[j]
      // }

      refFrame.prevStartWedgeIndex = refFrame.startWedgeIndex
      refFrame.prevFinishWedgeIndex = refFrame.finishWedgeIndex

      clearFlagsList.forEach(zoneIndex => {
        this.actionFlags[zoneIndex] = 0  // Clear the action flags to ready them for future reuse
      })
    })


    // Reassign models to/from virtual models based on which objects are in range of the camera
    // Place and orient all of the active models
    if (removeModelList.length > 0) {
      // console.log(
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
      //console.log('Removing ' + removeModelList.length)
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
      //console.log('Adding ' + assignModelList.length)
    }

    // Free models that are in wedges that are no longer near the camera
    removeModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([objectKey, objectValue]) => {
        objectValue.forEach(object => {
          if (object.model) {
            object.model.visible = false
            object.unallocatedModels.push(object.model)
            object.model = null
          }
        })
      })
    })

    // Assign models to virtual objects that have just entered the region near the camera
    assignModelList.forEach(entry => {
      const ranOutOfModelsInfo = {}
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([objectKey, objectValue]) => {
        if (objectValue.length>0) {
          objectValue.forEach(object => {
            if (!object.model) {
              // if (objectKey=='virtualLaunchVehicles') {
              //   console.log("")
              // }
              if (object.unallocatedModels.length==1) {
                // if (objectKey=='virtualLaunchVehicles') {
                //   console.log("")
                // }
                // This is the last model. Duplicate it so that we don't run out.
                const tempModel = object.unallocatedModels[0].clone()
                object.unallocatedModels.push(tempModel)
                //console.log('Duplicating model for ' + objectKey)
              }
              if (object.unallocatedModels.length>0) {
                // if (objectKey=='virtualMassDriverAccelerationScrews') {
                //   console.log("")
                // }
                object.model = object.unallocatedModels.pop()
                object.model.visible = object.isVisible
                this.scene.add(object.model)
              }
              else {
                if (objectKey in ranOutOfModelsInfo) {
                  ranOutOfModelsInfo[objectKey]++
                }
                else {
                  ranOutOfModelsInfo[objectKey] = 1
                }
              }
            }
            else {
              object.model.visible = object.isVisible
            }
          })
          const classIsDynamic = objectValue[0].constructor.isDynamic
          const classHasChanged = objectValue[0].constructor.hasChanged
          if (!classIsDynamic && !classHasChanged) {
            // Static object so we will place the model (just once) at the same time we assign it to a virtual object
            objectValue.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, entry['refFrame'])
              }
            })
          }
        }
      })
      let allGood = true
      Object.entries(ranOutOfModelsInfo).forEach(([k, v]) => {
        if (v>0) {
          console.log('Ran out of ' + k + ' models (needed ' + v + ' more)')
          allGood = false
        }
      })
      if (!allGood) {
        console.log('Problem Assigning Models')
      }
      else {
        // Success!! We can remove this entry from the list now
        //assignModelList.splice(index, 1)
      }
    })
    // Now adjust the models position and rotation in all of the active wedges

    updateModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([objectKey, objectValue]) => {
        // if ((objectKey=='virtualLaunchSleds') && (objectValue.length>0)) {
        //   console.log("")
        // }
        if (objectValue.length>0) {
          const classIsDynamic = objectValue[0].constructor.isDynamic
          const classHasChanged = objectValue[0].constructor.hasChanged
          if (classIsDynamic || classHasChanged) {
            // Call the placement method for each active instance (unless the model class is static and unchanged)
            objectValue.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, entry['refFrame'])
              }
            })
          }
        }
      })
    })

    if (removeModelList.length > 0) {
      // console.log(
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
    }

    // Clear all of the "hasChanged" flags
    virtualMassDriverTube.hasChanged = false
    virtualMassDriverRail.hasChanged = false
    virtualMassDriverBracket.hasChanged = false
    virtualMassDriverScrew.hasChanged = false
    virtualLaunchVehicle.hasChanged = false
    virtualLaunchSled.hasChanged = false
    virtualAdaptiveNut.hasChanged = false

    // Debug stuff...
    // console.log(ringTerminusModels)
    // if (transitVehicleShortageCount>0) {
    //   console.log('transitVehicleShortageCount was ' + transitVehicleShortageCount)
    // }
    // // console.log("vehicles unallocated: " + this.unallocatedTransitVehicleModels.length)
    // if (removeModelList.length) {
    //   console.log("removing " + removeModelList.length + " wedge")
    // }
    // if (assignModelList.length) {
    //   console.log("assigning " + assignModelList.length + " wedge")
    // }
    
  }


  Update() {
      // TBD these parameters should come from "the universe"
      console.error('Executing unused code!')
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
}

launcher.prototype.updateTrajectoryCurves = LaunchTrajectoryUtils.defineUpdateTrajectoryCurves()
launcher.prototype.updateTrajectoryCurvesRocket = LaunchTrajectoryRocket.defineUpdateTrajectoryCurvesRocket()

// Methods from OrbitMath.js
launcher.prototype.stumpC = OrbitMath.define_stumpC()
launcher.prototype.stumpS = OrbitMath.define_stumpS()
launcher.prototype.f_and_g = OrbitMath.define_f_and_g()
launcher.prototype.fDot_and_gDot = OrbitMath.define_fDot_and_gDot()
launcher.prototype.kepler_U = OrbitMath.define_kepler_U()
launcher.prototype.RV_from_R0V0andt = OrbitMath.define_RV_from_R0V0andt()
launcher.prototype.orbitalElementsFromStateVector = OrbitMath.define_orbitalElementsFromStateVector()
//launcher.prototype.calculateTimeToApogeeFromOrbitalElements = OrbitMath.define_calculateTimeToApogeeFromOrbitalElements()
launcher.prototype.getAltitudeDistanceAndVelocity = OrbitMath.define_getAltitudeDistanceAndVelocity()
launcher.prototype.getAirDensity = OrbitMath.define_getAirDensity()
launcher.prototype.getAerodynamicDrag = OrbitMath.define_getAerodynamicDrag()
launcher.prototype.saveGeometryAsSTL = SaveGeometryAsSTL.define_SaveGeometryAsSTL()
launcher.prototype.genLauncherSpecs = EngineeringDetails.define_genLauncherSpecs()

