import * as THREE from 'three'
//import { XYChart } from './XYChart.js'
import { SuperCurvePath } from './SuperCurves.js'
import * as tram from './tram.js'
import { referenceFrame } from './referenceFrame.js'
import { launchVehicleModel, virtualLaunchVehicle } from './LaunchVehicle.js'
import { launchSledModel, virtualLaunchSled } from './LaunchSled.js'
import { massDriverTubeModel, virtualMassDriverTube } from './MassDriverTube.js'
import { massDriverRailModel, virtualMassDriverRail } from './MassDriverRail.js'
import { massDriverBracketModel, virtualMassDriverBracket } from './MassDriverBracket.js'
import { massDriverScrewModel, virtualMassDriverScrew } from './MassDriverScrew.js'
//import { evacuatedTubeModel, virtualEvacuatedTube } from './EvacuatedTube.js'
import * as LaunchTrajectoryUtils from './LaunchTrajectoryUtils.js'
import * as OrbitMath from './OrbitMath.js'

//import { arrow } from './markers.js'
//import { FrontSide } from 'three'

export class launcher {

  constructor(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, xyChart, clock, specs, genLauncherKMLFile, kmlFile) {
    this.const_G = 0.0000000000667408;
    this.clock = clock
    this.versionNumber = 0

    // Possible User defined (e.g. if user changes the planet)
    this.const_g = 9.8;
    this.const_M = 5.9722E+24;
    this.mu = this.const_G * this.const_M;
    this.R_Earth = 6371000;

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
    this.LaunchTrajectoryMarker0 = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), redMaterial)
    const LaunchTrajectoryMarkerSize = dParamWithUnits['launcherMarkerRadius'].value
    this.LaunchTrajectoryMarker0.scale.set(LaunchTrajectoryMarkerSize, LaunchTrajectoryMarkerSize, LaunchTrajectoryMarkerSize)
    this.LaunchTrajectoryMarker1 = this.LaunchTrajectoryMarker0.clone()
    this.LaunchTrajectoryMarker1.material = greenMaterial
    this.LaunchTrajectoryMarker2 = this.LaunchTrajectoryMarker0.clone()
    this.LaunchTrajectoryMarker2.material = greenMaterial
    this.LaunchTrajectoryMarker3 = this.LaunchTrajectoryMarker0.clone()
    this.LaunchTrajectoryMarker3.material = blueMaterial
    this.LaunchTrajectoryMarker4 = this.LaunchTrajectoryMarker0.clone()
    this.LaunchTrajectoryMarker5 = this.LaunchTrajectoryMarker0.clone()
    this.LaunchTrajectoryMarker6 = this.LaunchTrajectoryMarker0.clone()
    planetCoordSys.add(this.LaunchTrajectoryMarker0)
    planetCoordSys.add(this.LaunchTrajectoryMarker1)
    planetCoordSys.add(this.LaunchTrajectoryMarker2)
    planetCoordSys.add(this.LaunchTrajectoryMarker3)
    planetCoordSys.add(this.LaunchTrajectoryMarker4)
    planetCoordSys.add(this.LaunchTrajectoryMarker5)
    planetCoordSys.add(this.LaunchTrajectoryMarker6)

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
    this.unallocatedMassDriverTubeModels = []
    this.unallocatedMassDriverRailModels = []
    this.unallocatedMassDriverBracketModels = []
    this.unallocatedMassDriverScrewModels = []
    this.unallocatedEvacuatedTubeModels = []

    this.cameraRange = []
    this.cameraRange[0] = dParamWithUnits['massDriverCameraRange'].value
    this.cameraRange[1] = dParamWithUnits['launchSledCameraRange'].value
    this.cameraRange[2] = dParamWithUnits['vehicleInTubeCameraRange'].value
    this.cameraRange[3] = dParamWithUnits['lauchVehicleCameraRange'].value

    this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

    this.refFrames = []
    const numWedges = 200
    const numZones = 200 // We're going to switch terminology from "Wedges" to "Zones"...
    // ToDo: We need another curve right before the mass driver curve for feeding the launch vehicles and sleds into the screws from
    this.polyCurveForrf0 = new SuperCurvePath()
    this.polyCurveForrf0.name = "massDriver2Path"
    this.polyCurveForrf0.add(this.massDriver2Curve)
    this.polyCurveForrf0.subdivide(numZones)
    const rf0 = new referenceFrame(this.polyCurveForrf0, numWedges, this.cameraRange[0], 0, 0, 0, 'massDriver2RefFrame')

    this.polyCurveForrf1 = new SuperCurvePath()
    this.polyCurveForrf1.name = "launchSledPath"
    this.polyCurveForrf1.add(this.feederRailCurve)
    this.polyCurveForrf1.add(this.massDriver1Curve)
    this.polyCurveForrf1.add(this.massDriver2Curve)
    this.polyCurveForrf1.add(this.launchRampCurve)
    this.polyCurveForrf1.add(this.launchSledReturnCurve)
    this.polyCurveForrf1.subdivide(numZones)
    const rf1 = new referenceFrame(this.polyCurveForrf1, numWedges, this.cameraRange[1], 0, 0, 0, 'launchSledRefFrame')

    this.polyCurveForrf2 = new SuperCurvePath()
    this.polyCurveForrf2.name = "launchVehicleInTubePath"
    this.polyCurveForrf2.add(this.feederRailCurve)
    this.polyCurveForrf2.add(this.massDriver1Curve)
    this.polyCurveForrf2.add(this.massDriver2Curve)
    this.polyCurveForrf2.add(this.launchRampCurve)
    this.polyCurveForrf2.add(this.evacuatedTubeCurve)
    //this.polyCurveForrf2.add(this.launchSledReturnCurve)
    this.polyCurveForrf2.subdivide(numZones)
    const rf2 = new referenceFrame(this.polyCurveForrf2, numWedges, this.cameraRange[2], 0, 0, 0, 'launchVehicleInTubeRefFrame')

    this.polyCurveForrf3 = new SuperCurvePath()
    this.polyCurveForrf3.name = "launchVehiclePath"
    this.polyCurveForrf3.add(this.feederRailCurve)
    this.polyCurveForrf3.add(this.massDriver1Curve)
    this.polyCurveForrf3.add(this.massDriver2Curve)
    this.polyCurveForrf3.add(this.launchRampCurve)
    this.polyCurveForrf3.add(this.evacuatedTubeCurve)
    this.polyCurveForrf3.add(this.freeFlightCurve)
    this.polyCurveForrf3.subdivide(numZones)
    const rf3 = new referenceFrame(this.polyCurveForrf3, numWedges, this.cameraRange[3], 0, 0, 0, 'launchVehicleRefFrame')

    rf3.addVirtualObject('virtualLaunchVehicles')
    rf1.addVirtualObject('virtualLaunchSleds')
    rf2.addVirtualObject('virtualMassDriverTubes')
    rf1.addVirtualObject('virtualMassDriverRails')
    rf0.addVirtualObject('virtualMassDriverBrackets')
    rf0.addVirtualObject('virtualMassDriverScrews')
    //rf2.addVirtualObject('virtualEvacuatedTubes')

    rf0.initialize()
    rf1.initialize()
    rf2.initialize()
    rf3.initialize()
    this.refFrames.push(rf0, rf1, rf2, rf3)

    this.numVirtualLaunchVehicles = 0
    this.numVirtualLaunchSleds = 0
    this.numVirtualMassDriverTubes = 0
    this.numVirtualMassDriverRails = 0
    this.numVirtualMassDriverBrackets = 0
    this.numVirtualMassDriverScrews = 0
    //this.numVirtualEvacuatedTubes = 0

    // Thinking that later we'll need a second reference frame for the rails and sleds so that they can split off from the launch vehicles
    // at the end of the upward ramp, decellerate, and loop back around to the start of the mass driver.
    // const rf1 = new referenceFrame(launchCurve, numWedges, this.cameraRange, 0, 0, 0, 'staticLaunchSledReferenceFrame')
    // rf1.addVirtualObject('virtualLaunchSleds')
    // rf1.addVirtualObject('virtualMassDriverRails')
    // this.refFrames.push(rf1)
    
    this.actionFlags = new Array(numWedges).fill(0)
    this.perfOptimizedThreeJS = dParamWithUnits['perfOptimizedThreeJS'].value ? 1 : 0

    // Next, create all of the virtual objects that will be placed along the launch trajectory curve

    // Hack
    this.massDriverScrewTexture = new THREE.TextureLoader().load( './textures/steelTexture.jpg' )

    // Add the virtual launch sleds and launch vehicles
    const tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
    let t, n, wedgeIndex
    const refFrame = this.refFrames[0]
    
    // Hack - remove "&& (n<150)"
    for (t = 0, n = 0; (t<this.durationOfLaunchTrajectory) && (n<500); t += tInc, n++) {
      //refFrame.wedges[wedgeIndex]['virtualLaunchSleds'].push(new virtualLaunchSled(-t, this.unallocatedLaunchSledModels))
      //refFrame.wedges[wedgeIndex]['virtualLaunchVehicles'].push(new virtualLaunchVehicle(-t, this.unallocatedLaunchVehicleModels))
    }

    // Create and add the launch sleds
    const launchSledMesh = new launchSledModel(
      dParamWithUnits,
      this.scene,
      this.unallocatedLaunchSledModels,
      this.perfOptimizedThreeJS,
      this.massDriverScrewTexture)

    // Create and add the launch vechicle models
    const launchVehicleMesh = new launchVehicleModel(dParamWithUnits, this.scene, this.unallocatedLaunchVehicleModels, this.perfOptimizedThreeJS)

    // Create a placeholder screw model (these models need to be generated on the fly though)
    this.massDriverScrewMaterials = []
    this.massDriverScrewMaterials[0] = new THREE.MeshPhongMaterial({color: 0xffffff})
    this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({color: 0x7f7f7f})
    //const massDriverScrewMaterial = new THREE.MeshPhongMaterial( {map: massDriverScrewTexture})

    const screwModels = new THREE.Group()
    screwModels.name = 'massDriverScrews'
    screwModels.userData = -1  // This is the index of the model starting from the breach of the mass driver. -1 is an invalid index which will force the model to be regenerated.
    const tempIndex = 0
    const leftModel = new massDriverScrewModel(dParamWithUnits, this.launcherMassDriver2Length, this.massDriverScrewSegments, tempIndex, this.massDriverScrewMaterials)
    leftModel.userData = 0
    leftModel.scale.set(1, 1, 1)
    screwModels.add(leftModel)
    const rightModel = leftModel.clone()
    rightModel.userData = 1
    rightModel.scale.set(-1, 1, 1)
    screwModels.add(rightModel)
    this.unallocatedMassDriverScrewModels.push(screwModels)

    // Create bracket models
    for (let i = 0; i<1; i++) {
      const tempModel = new massDriverBracketModel(dParamWithUnits, this.massDriver2Curve, this.launcherMassDriver2Length, (this.massDriverScrewSegments+1), i)
      tempModel.name = 'massDriverBracket'
      this.unallocatedMassDriverBracketModels.push(tempModel)
      this.scene.add(tempModel)
    }

    this.update(dParamWithUnits, timeSinceStart, crv)
  }

  update(dParamWithUnits, timeSinceStart, crv) {
    this.versionNumber++

    // Todo: We should detect whether an update of the curves is called for as it's a time consuming operation...
    //this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

    this.refFrames.forEach(refFrame => {
      // ToDo: We should detect whether we need to call update - this is a potentially time consuming operation
      refFrame.update()
      refFrame.timeSinceStart = timeSinceStart
    })

    virtualMassDriverTube.update(dParamWithUnits, this.versionNumber)
    virtualMassDriverRail.update(dParamWithUnits, this.versionNumber)
    virtualMassDriverBracket.update(dParamWithUnits, this.massDriver2Curve, this.versionNumber)
    virtualMassDriverScrew.update(dParamWithUnits, this.launcherMassDriver2Length, this.massDriverScrewSegments, this.massDriverScrewMaterials, this.versionNumber)
    //virtualEvacuatedTube.update(dParamWithUnits, this.evacuatedTubeCurve)
    virtualLaunchSled.update(dParamWithUnits, this.launcherMassDriver2Length, this.scene, this.clock)
    const timeAtEvacuatedTubeExit = this.timeWithinFeederRail + this.timeWithinMassDriver1 + this.timeWithinMassDriver2 + this.timeWithinRamp + this.timeWithinEvacuatedTube
    virtualLaunchVehicle.update(
      dParamWithUnits,
      timeAtEvacuatedTubeExit,
      this.tBurnOut,
      crv.radiusOfPlanet)
    this.animateLaunchVehicles = dParamWithUnits['animateLaunchVehicles'].value ? 1 : 0
    this.animateLaunchSleds = dParamWithUnits['animateLaunchSleds'].value ? 1 : 0
    this.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    this.showMarkers = dParamWithUnits['showMarkers'].value

    function removeOldVirtualObjects(refFrames, objectName, unallocatedModelsArray) {
      refFrames.forEach(refFrame => {
        for (let wedgeIndex = 0; wedgeIndex < refFrame.wedges.length; wedgeIndex++) {
          if (objectName in refFrame.wedges[wedgeIndex]) {
            const wedgeList = refFrame.wedges[wedgeIndex][objectName]
            wedgeList.forEach(vobj => {
              if (vobj.model) {
                vobj.model.visible = false
                unallocatedModelsArray.push(vobj.model)
              }
            })
            wedgeList.splice(0, wedgeList.length)
          }
          else {
            console.log('Error: ' + objectName + ' not found in wedge ' + wedgeIndex + ' of refFrame ' + refFrame.name)
          }
        }
      })
    }
    
    // Shared values...
    const tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
    const halfBracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value / 2 / this.launcherMassDriver2Length
    const numBrackets = dParamWithUnits['launcherMassDriverScrewNumBrackets'].value  // This is a limit to the number of bracket we'll render. After this number they will be moving too fast to bee seen.
    const tStart = 0 // sec

    let changeOccured

    // Update the number of launch vehicles
    const newNumVirtualLaunchVehicles = dParamWithUnits['showLaunchVehicles'].value ? dParamWithUnits['numVirtualLaunchVehicles'].value : 0
    changeOccured = (this.numVirtualLaunchVehicles != newNumVirtualLaunchVehicles)
    if (changeOccured) {
      const refFrame = this.refFrames[3]
      if (this.numVirtualLaunchVehicles > 0) {
        // Remove old virtual launch vehicles
        removeOldVirtualObjects([refFrame], 'virtualLaunchVehicles', this.unallocatedLaunchVehicleModels)
      }
      if (newNumVirtualLaunchVehicles > 0) {
        // Add new virtual launch vehicles onto the launch system
        virtualLaunchVehicle.hasChanged = true
        const n1 = newNumVirtualLaunchVehicles
        
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
        // Going backwards in time since we want to add vehicles that were launched in the past.
        for (let t = tStart, i = 0; (t>-(tStart+this.durationOfLaunchTrajectory)) && (i<n1); t -= tInc, i++) {
          // Calculate where along the launcher to place the vehicle.
          const deltaT = adjustedTimeSinceStart - t
          const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numWedges)) {
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
    changeOccured = (this.numVirtualLaunchSleds != newNumVirtualLaunchSleds)
    if (changeOccured) {
      const refFrame = this.refFrames[1]
      if (this.numVirtualLaunchSleds > 0) {
        // Remove old virtual launch sleds
        removeOldVirtualObjects([refFrame], 'virtualLaunchSleds', this.unallocatedLaunchSledModels)
      }
      if (newNumVirtualLaunchSleds > 0) {
        virtualLaunchSled.hasChanged = true
        // Add new virtual launch sleds onto the launch system
        const n1 = newNumVirtualLaunchSleds
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
        // Going backwards in time since we want to add vehicles that were launched in the past.
        for (let t = tStart, i = 0; (t>-(tStart+this.durationOfLaunchTrajectory)) && (i<n1); t -= tInc, i++) {
          // Calculate where along the launcher to place the vehicle. 
          const deltaT = adjustedTimeSinceStart - t
          const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numWedges)) {
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
    
    // Update the number of mass driver tubes
    const newNumVirtualMassDriverTubes = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualMassDriverTubes'].value : 0
    changeOccured = (this.numVirtualMassDriverTubes != newNumVirtualMassDriverTubes)
    if (changeOccured) {
      const refFrame = this.refFrames[2]
      if (this.numVirtualMassDriverTubes > 0) {
        // Remove old virtual mass driver tubes
        removeOldVirtualObjects([refFrame], 'virtualMassDriverTubes', this.unallocatedMassDriverTubeModels)
      }
      if (newNumVirtualMassDriverTubes > 0) {
        virtualMassDriverTube.hasChanged = true
        // Add new mass driver tubes to the launch system
        const n = newNumVirtualMassDriverTubes
        for (let i = 0; i < n; i++) {
          const d = (i+0.5)/n
          const vmdt = new virtualMassDriverTube(d, this.unallocatedMassDriverTubeModels)
          vmdt.model = new massDriverTubeModel(dParamWithUnits, refFrame.curve, i)
          vmdt.model.name = 'massDriverTube'
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numWedges)) {
            refFrame.wedges[zoneIndex]['virtualMassDriverTubes'].push(vmdt)
          }
          else {
            console.log('Error')
          }
          this.scene.add(vmdt.model)
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualMassDriverTubes = newNumVirtualMassDriverTubes

    // Update the number of mass driver rails
    const newNumVirtualMassDriverRails = dParamWithUnits['showMassDriverRail'].value ? dParamWithUnits['numVirtualMassDriverRails'].value : 0
    changeOccured = (this.numVirtualMassDriverRails != newNumVirtualMassDriverRails)
    if (changeOccured) {
      const refFrame = this.refFrames[1]
      if (this.numVirtualMassDriverRails > 0) {
        // Remove old virtual mass driver rails
        removeOldVirtualObjects([refFrame], 'virtualMassDriverRails', this.unallocatedMassDriverRailModels)
      }
      if (newNumVirtualMassDriverRails > 0) {
        virtualMassDriverRail.hasChanged = true
        // Add new mass driver rails to the launch system
        const n = newNumVirtualMassDriverRails
        for (let i = 0; i < n; i++) {
          const d = (i+0.5)/n
          const vmdr = new virtualMassDriverRail(d, this.unallocatedMassDriverRailModels)
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numWedges)) {
            refFrame.wedges[zoneIndex]['virtualMassDriverRails'].push(vmdr)
          }
          else {
            console.log('Error')
          }
          vmdr.model = new massDriverRailModel(dParamWithUnits, refFrame.curve, i)
          //vmdr.model.scale.set(100,1,1) // This is a hack to make the rail larger and more visible
          vmdr.model.name = 'MassDriverRail'
          this.scene.add(vmdr.model)
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualMassDriverRails = newNumVirtualMassDriverRails

    // Update the number of mass driver screws
    const newNumVirtualMassDriverScrews = dParamWithUnits['showMassDriverScrews'].value ? this.massDriverScrewSegments : 0
    changeOccured = (this.numVirtualMassDriverScrews != newNumVirtualMassDriverScrews)
    if (changeOccured) {
      const refFrame = this.refFrames[0]
      if (this.numVirtualMassDriverScrews > 0) {
        // Remove old virtual mass driver screws
        removeOldVirtualObjects([refFrame], 'virtualMassDriverScrews', this.unallocatedMassDriverScrewModels)
      }
      if (newNumVirtualMassDriverScrews > 0) {
        virtualMassDriverScrew.hasChanged = true
        // Add new mass driver screws to the launch system
        const n = newNumVirtualMassDriverScrews
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
          const vmds = new virtualMassDriverScrew(d, i, this.unallocatedMassDriverScrewModels)
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numWedges)) {
            refFrame.wedges[zoneIndex]['virtualMassDriverScrews'].push(vmds)
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
      }
    }
    this.numVirtualMassDriverScrews = newNumVirtualMassDriverScrews

    // Update the number of mass driver brackets
    const newNumVirtualMassDriverBrackets = dParamWithUnits['showMassDriverBrackets'].value ? (this.massDriverScrewSegments+1) : 0
    changeOccured = (this.numVirtualMassDriverBrackets != newNumVirtualMassDriverBrackets)
    if (changeOccured) {
      const refFrame = this.refFrames[0]
      if (this.numVirtualMassDriverBrackets > 0) {
        // Remove old virtual mass driver brackets
        removeOldVirtualObjects([refFrame], 'virtualMassDriverBrackets', this.unallocatedMassDriverBracketModels)
      }
      if (newNumVirtualMassDriverBrackets > 0) {
        virtualMassDriverBracket.hasChanged = true
        // Add new mass driver brackets to the launch system
        const n = newNumVirtualMassDriverBrackets
        for (let i = 0; i < numBrackets; i++) {
          const d = (i+0.5)/n - halfBracketThickness
          //const wedgeIndex = Math.floor(d * refFrame.numWedges) % refFrame.numWedges
          const vmdb = new virtualMassDriverBracket(d, this.unallocatedMassDriverBracketModels)
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numWedges)) {
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
    this.LaunchTrajectoryMarker0.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.LaunchTrajectoryMarker1.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.LaunchTrajectoryMarker2.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.LaunchTrajectoryMarker3.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.LaunchTrajectoryMarker4.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.LaunchTrajectoryMarker5.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.LaunchTrajectoryMarker6.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value

    // Update 2D chart
    this.xyChart.chartGroup.visible = dParamWithUnits['showXYChart'].value

  }


  drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys) {
    let tStep = 1 // second
    let t = 0
    let prevVehiclePosition, currVehiclePosition
    
    prevVehiclePosition = this.launchTrajectoryCurve.getPoint(t / this.durationOfLaunchTrajectory)
    t += tStep

    const color = new THREE.Color()
    const launchTrajectoryPoints = []
    const launchTrajectoryColors = []
    

    for (; t < this.timeWithinMassDriver + dParamWithUnits['launcherCoastTime'].value; t+=tStep) {
      currVehiclePosition = this.launchTrajectoryCurve.getPoint(t / this.durationOfLaunchTrajectory)
      launchTrajectoryPoints.push(prevVehiclePosition)
      launchTrajectoryPoints.push(currVehiclePosition)
      prevVehiclePosition = currVehiclePosition.clone()
      // This code adds major thick hash marks to the line every 60 seconds, and thin hash marks every 10 seconds.
      if ((t%10==9) || (t%60==58)) {
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
    this.launchTrajectoryMesh.visible = dParamWithUnits['showLaunchTrajectory'].value
    planetCoordSys.add( this.launchTrajectoryMesh )
  }

  animate(timeSinceStart, cameraPosition) {
    // Move the virtual models of the launched vehicles along the launch trajectory
    let wedgeIndex
    const assignModelList = []
    const removeModelList = []
    const updateModelList = []


    // Debug printout
    const launcherRefFrame = this.refFrames[3]
    launcherRefFrame.wedges.forEach((wedge, wedgeIndex) => {
      if (wedgeIndex<10) {
        Object.entries(wedge).forEach(([objectKey, objectValue]) => {
          if (objectKey=='virtualLaunchVehicles') {
            objectValue.forEach(launchVehicle => {
              //console.log(wedgeIndex, launchVehicle.timeLaunched, launchVehicle.model)
            })
          }
        })
      }
    })
    //console.log("")

    // For objects that are moving around within their reference frame, we need to check whether they are still in the correct zone and reassign them if they are not.
    const movingObjects = ['virtualLaunchVehicles', 'virtualLaunchSleds']

    this.refFrames.forEach(refFrame => {
      Object.entries(refFrame.placeholderEntries).forEach(([objectKey, objectValue]) => {
        if (movingObjects.includes(objectKey)) {
          const movingObject = objectKey
          const reassignList = []
          for (let zoneIndex = 0; zoneIndex < refFrame.numWedges; zoneIndex++) {
            const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
            const keepList = []
            refFrame.wedges[zoneIndex][movingObject].forEach(object => {
              // Calculate where along the launcher to place the vehicle.
              const deltaT = adjustedTimeSinceStart - object.timeLaunched
              // Convert deltaT to a zoneIndex along the curveList.
              const correctZoneIndex = refFrame.curve.getZoneIndex(deltaT)
              if ((correctZoneIndex>=0) && (correctZoneIndex<refFrame.numWedges)) {
                // if ((objectKey=='virtualLaunchVehicles') && (object.timeLaunched==0.1)) {
                //   console.log(correctZoneIndex)
                // }
                if (zoneIndex==correctZoneIndex) {
                  keepList.push(object)
                }
                else {
                  reassignList.push({correctZoneIndex, object})
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
            pntrToArray.push(...keepList)
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
        const zoneStartFinishDValues = superCurve.getStartFinishZoneIndices( cameraPos, refFrame.cameraRange )
        const zoneStartFinishDValues2 = superCurve.getStartFinishZoneIndices( cameraPos, refFrame.cameraRange )
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
      if (this.animateLaunchVehicles || this.animateLaunchSleds) {
        refFrame.timeSinceStart = timeSinceStart
      }
      const clearFlagsList = []
      
      // Set bit0 of actionFlags if wedge is currently visible
      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % refFrame.numWedges) {
          this.actionFlags[wedgeIndex] |= 1
          clearFlagsList.push(wedgeIndex)
          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
      // Set bit1 of actionFlags if wedge was previously visible
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % refFrame.numWedges) {
          this.actionFlags[wedgeIndex] |= 2
          clearFlagsList.push(wedgeIndex)
          if (wedgeIndex == refFrame.prevFinishWedgeIndex) break
        }
      }

      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % refFrame.numWedges) {
          if (this.actionFlags[wedgeIndex]==1) {
            // Wedge wasn't visible before and it became visible, assign it the assignModel list
            assignModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (this.actionFlags[wedgeIndex] & 1 == 1) {
            // Wedge is currently visible, assign it the updateModel list
            updateModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % refFrame.numWedges) {
          if (this.actionFlags[wedgeIndex]==2) {
            // Wedge was visible before and it became invisible, add it to the removeModel list
            removeModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (wedgeIndex == refFrame.prevFinishWedgeIndex) break
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

      clearFlagsList.forEach(wedgeIndex => {
        this.actionFlags[wedgeIndex] = 0  // Clear the action flags to ready them for future reuse
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
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
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
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
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
                // if (objectKey=='virtualMassDriverScrews') {
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
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
        // if ((objectKey=='virtualLaunchVehicles') && (objectValue.length>0) && (entry['wedgeIndex']>91)) {
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
      console.log('Executing unused code!')
      this.R_LEO = this.R_Earth + this.Alt_LEO;

      this.PotentialEnergy_Joules = -this.const_G * this.const_M * this.MPayload / this.R_Earth;
      this.PotentialEnergy_kWh = this.PotentialEnergy_Joules / 3600000;
      this.CostOfPotentialEnergyToEscape = -this.PotentialEnergy_kWh * this.WholesaleElectricityCost;
      this.CostPerkgToEscape = this.CostOfPotentialEnergyToEscape / this.MPayload;
      this.LEOOrbitVelocity = Math.sqrt(this.const_G*this.const_M / (this.R_Earth + this.Alt_LEO));
      this.Alt_Apogee = this.Alt_LEO;
      this.EllipseMajorAxisLength = this.Alt_Perigee + this.R_Earth * 2 + this.Alt_Apogee;
      this.EllipseSemiMajorAxisLength = this.EllipseMajorAxisLength / 2;
      this.Eccentricity = 1.0 - (this.R_Earth + this.Alt_Perigee) / this.EllipseSemiMajorAxisLength;
      this.EllipseSemiMinorAxisLength = this.EllipseSemiMajorAxisLength * Math.sqrt(1 - this.Eccentricity**2);

      this.EllipticalOrbitPerigeeVelocity = Math.sqrt(this.const_G*this.const_M*(2 / (this.R_Earth + this.Alt_Perigee) - 2 / this.EllipseMajorAxisLength));
      this.EllipticalOrbitApogeeVelocity = Math.sqrt(this.const_G*this.const_M*(2 / (this.R_Earth + this.Alt_Apogee) - 2 / this.EllipseMajorAxisLength));
      this.EllipticalOrbitVelocityAtLauncherExit = Math.sqrt(this.const_G * this.const_M * (2 / (this.R_Earth + this.Alt_EvacuatedTube) - (1 / this.EllipseSemiMajorAxisLength)));
      this.EllipticalOrbitPeriod = 2 * Math.PI * Math.sqrt(Math.pow(this.EllipseSemiMajorAxisLength, 3) / (this.const_G * this.const_M));
      this.EarthsRimSpeed = 2 * Math.PI*(this.R_Earth + this.Alt_Perigee) / 24 / 3600;  // ToDo: This needs to be a function of where edge of ring is
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
          const TriangleSideA = this.R_Earth + this.Alt_Perigee - this.AllowableDownwardTurningRadius;
          const TriangleSideB = this.R_Earth + this.LauncherAltitude + this.AllowableUpwardTurningRadius;
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
      this.timeWithinRamp = this.CurveUpDistance / this.EllipticalOrbitPerigeeVelocity;
      this.CurveDownTime = this.CurveDownDistance / this.EllipticalOrbitPerigeeVelocity;
      this.TotalTimeInLaunchSystem = this.AccelerationTime + this.timeWithinRamp + this.CurveDownTime;
      this.VehicleCrossSectionalAreaForDrag = Math.PI * this.VehicleRadius ** 2
  }
}

launcher.prototype.updateTrajectoryCurves = LaunchTrajectoryUtils.defineUpdateTrajectoryCurves()

// Methods from OrbitMath.js
launcher.prototype.stumpC = OrbitMath.define_stumpC()
launcher.prototype.stumpS = OrbitMath.define_stumpS()
launcher.prototype.f_and_g = OrbitMath.define_f_and_g()
launcher.prototype.fDot_and_gDot = OrbitMath.define_fDot_and_gDot()
launcher.prototype.kepler_U = OrbitMath.define_kepler_U()
launcher.prototype.RV_from_R0V0andt = OrbitMath.define_RV_from_R0V0andt()
launcher.prototype.orbitalElementsFromStateVector = OrbitMath.define_orbitalElementsFromStateVector()
launcher.prototype.GetAltitudeDistanceAndVelocity = OrbitMath.define_GetAltitudeDistanceAndVelocity()
launcher.prototype.GetAirDensity = OrbitMath.define_GetAirDensity()
launcher.prototype.GetAerodynamicDrag = OrbitMath.define_GetAerodynamicDrag()
launcher.prototype.GetAerodynamicDrag_ChatGPT = OrbitMath.define_GetAerodynamicDrag_ChatGPT()

