import * as THREE from 'three'
import { BoxGeometry } from 'three'
import { Quaternion } from 'three/src/math/Quaternion.js'
//import { XYChart } from './XYChart.js'
import { CatmullRomSuperCurve3 } from './SuperCurves.js'
import { CircleSuperCurve3 } from './SuperCurves.js'
import { SuperCurvePath } from './SuperCurves.js'
import * as kmlutils from './kmlutils.js'
import * as tram from './tram.js'
import { referenceFrame } from './ReferenceFrame.js'
import { launchVehicleModel, virtualLaunchVehicle } from './LaunchVehicle.js'
import { launchSledModel, virtualLaunchSled } from './LaunchSled.js'
import { massDriverTubeModel, virtualMassDriverTube } from './MassDriverTube.js'
import { massDriverRailModel, virtualMassDriverRail } from './MassDriverRail.js'
import { massDriverBracketModel, virtualMassDriverBracket } from './MassDriverBracket.js'
import { massDriverScrewModel, virtualMassDriverScrew } from './MassDriverScrew.js'
import { evacuatedTubeModel, virtualEvacuatedTube } from './EvacuatedTube.js'
//import * as LaunchTrajectoryUtils from './LaunchTrajectoryUtils.js'

//import { arrow } from './markers.js'
//import { FrontSide } from 'three'

export class launcher {

    constructor(dParamWithUnits, timeSinceStart, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, xyChart, clock, specs, genLauncherKMLFile, kmlFile) {
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
      this.LaunchTrajectoryMarker1 = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), redMaterial)
      const LaunchTrajectoryMarkerSize = dParamWithUnits['launcherMarkerRadius'].value
      this.LaunchTrajectoryMarker1.scale.set(LaunchTrajectoryMarkerSize, LaunchTrajectoryMarkerSize, LaunchTrajectoryMarkerSize)
      this.LaunchTrajectoryMarker2 = this.LaunchTrajectoryMarker1.clone()
      this.LaunchTrajectoryMarker2.material = greenMaterial
      this.LaunchTrajectoryMarker3 = this.LaunchTrajectoryMarker1.clone()
      this.LaunchTrajectoryMarker3.material = blueMaterial
      this.LaunchTrajectoryMarker4 = this.LaunchTrajectoryMarker1.clone()
      this.LaunchTrajectoryMarker5 = this.LaunchTrajectoryMarker1.clone()
      planetCoordSys.add(this.LaunchTrajectoryMarker1)
      planetCoordSys.add(this.LaunchTrajectoryMarker2)
      planetCoordSys.add(this.LaunchTrajectoryMarker3)
      planetCoordSys.add(this.LaunchTrajectoryMarker4)
      planetCoordSys.add(this.LaunchTrajectoryMarker5)

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

      this.cameraRange = 2000

      this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

      this.refFrames = []
      const numWedges = 200
      const numZones = 200 // We're going to switch terminology from "Wedges" to "Zones"...
      //this.polyCurveForrf0 = this.massDriverCurve
      // ToDo: We need another curve right before the mass driver curve for feeding the launch vehicles and sleds into teh screws from
      this.polyCurveForrf0 = new SuperCurvePath()
      this.polyCurveForrf0.name = "massDriverPath"
      this.polyCurveForrf0.add(this.massDriverCurve)
      this.polyCurveForrf0.subdivide(numZones)
      const rf0 = new referenceFrame(this.polyCurveForrf0, numWedges, this.cameraRange, 0, 0, 0, 'massDriverRefFrame')

      this.polyCurveForrf1 = new SuperCurvePath()
      this.polyCurveForrf1.name = "launchSledPath"
      this.polyCurveForrf1.add(this.massDriverCurve)
      this.polyCurveForrf1.add(this.launchRampCurve)
      this.polyCurveForrf1.add(this.launchSledReturnCurve)
      this.polyCurveForrf1.subdivide(numZones)
      const rf1 = new referenceFrame(this.polyCurveForrf1, numWedges, this.cameraRange, 0, 0, 0, 'launchSledRefFrame')

      this.polyCurveForrf2 = new SuperCurvePath()
      this.polyCurveForrf2.name = "launchVehicleInTubePath"
      this.polyCurveForrf2.add(this.massDriverCurve)
      this.polyCurveForrf2.add(this.launchRampCurve)
      this.polyCurveForrf2.add(this.evacuatedTubeCurve)
      //this.polyCurveForrf2.add(this.launchSledReturnCurve)
      this.polyCurveForrf2.subdivide(numZones)
      const rf2 = new referenceFrame(this.polyCurveForrf2, numWedges, this.cameraRange * 20, 0, 0, 0, 'launchVehicleInTubeRefFrame')

      this.polyCurveForrf3 = new SuperCurvePath()
      this.polyCurveForrf3.name = "launchVehiclePath"
      this.polyCurveForrf3.add(this.massDriverCurve)
      this.polyCurveForrf3.add(this.launchRampCurve)
      this.polyCurveForrf3.add(this.evacuatedTubeCurve)
      this.polyCurveForrf3.add(this.freeFlightCurve)
      this.polyCurveForrf3.subdivide(numZones)
      const rf3 = new referenceFrame(this.polyCurveForrf3, numWedges, this.cameraRange * 10, 0, 0, 0, 'launchVehicleRefFrame')

      rf3.addVirtualObject('virtualLaunchVehicles')
      rf0.addVirtualObject('virtualLaunchSleds')
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
        this.massDriverCurve,
        this.launcherMassDriverLength,
        this.massDriverScrewSegments,
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
      const leftModel = new massDriverScrewModel(dParamWithUnits, this.launcherMassDriverLength, this.massDriverScrewSegments, tempIndex, this.massDriverScrewMaterials)
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
        const tempModel = new massDriverBracketModel(dParamWithUnits, this.massDriverCurve, this.launcherMassDriverLength, (this.massDriverScrewSegments+1), i)
        tempModel.name = 'massDriverBracket'
        this.unallocatedMassDriverBracketModels.push(tempModel)
        this.scene.add(tempModel)
      }

      this.update(dParamWithUnits, timeSinceStart)
    }

    update(dParamWithUnits, timeSinceStart) {
      this.versionNumber++

      // Todo: We should detect whether an update of the curves is called for as it's a time consuming operation...
      //this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

      this.refFrames.forEach(refFrame => {
        // ToDo: We should detect whether we need to call update - this is a potentially time consuming operation
        refFrame.update()
        refFrame.timeSinceStart = timeSinceStart
      })

      virtualMassDriverTube.update(dParamWithUnits, this.versionNumber)
      virtualMassDriverRail.update(dParamWithUnits, this.versionNumber)
      virtualMassDriverBracket.update(dParamWithUnits, this.massDriverCurve, this.versionNumber)
      virtualMassDriverScrew.update(dParamWithUnits, this.launcherMassDriverLength, this.massDriverScrewSegments, this.massDriverScrewMaterials, this.versionNumber)
      virtualEvacuatedTube.update(dParamWithUnits, this.evacuatedTubeCurve)
      virtualLaunchSled.update(dParamWithUnits, this.launcherMassDriverLength, this.scene, this.clock)
      virtualLaunchVehicle.update(
        dParamWithUnits, 
        this.timeWithinMassDriver,
        this.curveUpTime, 
        this.timeWithinEvacuatedTube)

      this.animateLaunchVehicles = dParamWithUnits['animateLaunchVehicles'].value ? 1 : 0
      this.animateLaunchSleds = dParamWithUnits['animateLaunchSleds'].value ? 1 : 0
      this.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
      this.acceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
      this.initialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
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
      const halfBracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value / 2 / this.launcherMassDriverLength
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
          removeOldVirtualObjects(refFrame, 'virtualLaunchVehicles', this.unallocatedLaunchVehicleModels)
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
        const refFrame = this.refFrames[0]
        if (this.numVirtualLaunchSleds > 0) {
          // Remove old virtual launch sleds
          removeOldVirtualObjects(refFrame, 'virtualLaunchSleds', this.unallocatedLaunchSledModels)
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
          removeOldVirtualObjects(refFrame, 'virtualMassDriverTubes', this.unallocatedMassDriverTubeModels)
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
          removeOldVirtualObjects(refFrame, 'virtualMassDriverRails', this.unallocatedMassDriverRailModels)
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
          removeOldVirtualObjects(refFrame, 'virtualMassDriverScrews', this.unallocatedMassDriverScrewModels)
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
          removeOldVirtualObjects(refFrame, 'virtualMassDriverBrackets', this.unallocatedMassDriverBracketModels)
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
      this.LaunchTrajectoryMarker1.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
      this.LaunchTrajectoryMarker2.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
      this.LaunchTrajectoryMarker3.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
      this.LaunchTrajectoryMarker4.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
      this.LaunchTrajectoryMarker5.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value

      // Update 2D chart
      this.xyChart.chartGroup.visible = dParamWithUnits['showXYChart'].value

    }

    updateTrajectoryCurves(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

      // LaunchTrajectoryUtils.updateLaunchTrajectory(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

      // The goal is to position the suspended portion of the evacuated launch tube under the tethered ring's tethers. The portion of the launch tube that contains the mass driver will be on the planet's surface.
      // Let's start by defining the sothern most point on the ring as the end of the mass driver. Then we can create a curve that initially follows the surface of the Earth and then, from the end of the mass driver,
      // follows a hyperbolic trajectory away from the earth.

      // console.print: console.log without filename/line number
      console.print = function (...args) {
        queueMicrotask (console.log.bind (console, ...args));
      }

      // ***************************************************************
      // Design the mass driver
      // ***************************************************************

      let forwardAcceleration
      let upwardAcceleration
      let timeNow = this.clock.getElapsedTime()
      function gotStuckCheck(clock, timeNow, t, msg) {
        if (t%2==0) {
          if (timeNow + 2 < clock.getElapsedTime()) {
            console.log('Stuck in ', msg)
            return true
          }
          else {
            return false
          }
        }
        else {
          return false
        }
      }

      const launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
      const launcherMassDriverExitVelocity = dParamWithUnits['launcherMassDriverExitVelocity'].value
      const launcherMassDriverAltitude = dParamWithUnits['launcherMassDriverAltitude'].value
      const launcherEvacuatedTubeExitAltitude = dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value
      const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value

      forwardAcceleration = launcherMassDriverForwardAcceleration

      // Determine the time in the mass driver from acceleration, initial velocity, and final velocity
      // vf = v0 + at, therefore t = (vf-v0)/a
      const launcherMassDriverAccelerationTime = (launcherMassDriverExitVelocity - launcherMassDriverInitialVelocity) / forwardAcceleration
      specs['launcherMassDriverAccelerationTime'] = {value: launcherMassDriverAccelerationTime, units: 's'}
      this.timeWithinMassDriver = launcherMassDriverAccelerationTime

      const launcherMassDriverLength = launcherMassDriverInitialVelocity * launcherMassDriverAccelerationTime + 0.5 * forwardAcceleration * launcherMassDriverAccelerationTime**2
      specs['launcherMassDriverLength'] = {value: launcherMassDriverLength, units: 's'}
      this.launcherMassDriverLength = launcherMassDriverLength
      this.launcherMassDriverScrewModelRoughLength = dParamWithUnits['launcherMassDriverScrewModelRoughLength'].value  // This is the length we want to specify for dynamic model allocation purposes, not a real dimension used to specify the hardware.
      this.massDriverScrewSegments = Math.ceil(launcherMassDriverLength / this.launcherMassDriverScrewModelRoughLength)

      // ***************************************************************
      // Design the ramp. The ramp is positioned at the end of the mass driver to divert the vehicle's trajectory skwards.
      // ***************************************************************
      // Clamp the altitude of the ramp to be between the altitude of the launcher and the altitude of the main ring.
      const launcherRampExitAltitude = Math.max(launcherMassDriverAltitude, Math.min(dParamWithUnits['launcherRampExitAltitude'].value, launcherEvacuatedTubeExitAltitude))
      const launcherMassDriverUpwardAcceleration = dParamWithUnits['launcherMassDriverUpwardAcceleration'].value
      const launcherSledDownwardAcceleration = dParamWithUnits['launcherSledDownwardAcceleration'].value
      const accelerationOfGravity = 9.8 // m/s2 // ToDo: Should make this a function of the selected planet
      const allowableUpwardTurningRadius = launcherMassDriverExitVelocity**2 / (launcherMassDriverUpwardAcceleration - accelerationOfGravity)

      // For the launchRamp, make a triangle ABC where A is the center of the planet, B is the end of the ramp, and C is the center of the circle that defines the allowable turning radius
      const triangleSideAB = crv.radiusOfPlanet + launcherRampExitAltitude
      const triangleSideAC = crv.radiusOfPlanet + launcherMassDriverAltitude + allowableUpwardTurningRadius
      const triangleSideBC = allowableUpwardTurningRadius
      // Use law of cosines to find the angles at C and B
      const angleACB = Math.acos((triangleSideAC**2 + triangleSideBC**2 - triangleSideAB**2) / (2*triangleSideAC*triangleSideBC))
      const angleABC = Math.acos((triangleSideAB**2 + triangleSideBC**2 - triangleSideAC**2) / (2*triangleSideAB*triangleSideBC))
      const angleBAC = Math.PI - angleACB - angleABC
      const upwardAngleAtEndOfRamp = Math.PI - angleABC

      const rampBaseLength = angleBAC * (crv.radiusOfPlanet + launcherMassDriverAltitude) // This is the length along the base of the ramp, measured at ground level, assuming the altitude of the ground is the same as the altitude of the launcher

      // console.log('triangleSideAB', triangleSideAB)
      // console.log('triangleSideAC', triangleSideAC)
      // console.log('triangleSideBC', triangleSideBC)
      // console.log('angleACB', angleACB, angleACB*180/Math.PI)
      // console.log('upwardAngleAtEndOfRamp', upwardAngleAtEndOfRamp, upwardAngleAtEndOfRamp*180/Math.PI)

      this.launcherRampLength = angleACB * allowableUpwardTurningRadius
      this.curveUpTimeOld = this.launcherRampLength / launcherMassDriverExitVelocity // ToDo: This is inaccurate as it does not take into account the loss of speed due to coasting up teh ramp.

      // Let's define the end of the ramp as the launcher's exit position, since from that point on the vehicles will either be coasting or accelerating under their own power.
      // Also, it's a position that we can stick at the top of a mountain ridge and from their adjust parameters like launcer accelleration, etc.
      
      const evacuatedTubeEntrancePositionAroundRing = dParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value
      const evacuatedTubeEntrancePositionInRingRefCoordSys = mainRingCurve.getPoint(evacuatedTubeEntrancePositionAroundRing)
      // Adjust the altitude of the positions to place it the correct distance above the earth's surface
      evacuatedTubeEntrancePositionInRingRefCoordSys.multiplyScalar((crv.radiusOfPlanet + launcherRampExitAltitude) / (crv.radiusOfPlanet + crv.currentMainRingAltitude))
      const evacuatedTubeEntrancePosition = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(evacuatedTubeEntrancePositionInRingRefCoordSys.clone()))

      // ***************************************************************
      // Now design the evacuated tube that the vehicles will travel within from the end of the ramp to the altitude of the main ring.  
      // ***************************************************************

      const R0 = new THREE.Vector3(crv.radiusOfPlanet + launcherRampExitAltitude, 0, 0)  // This is the vehicle's altitude (measured from the plantet's center) and downrange position at the exit of the launcher
      
      // for (let launcherMassDriverExitVelocity = 100; launcherMassDriverExitVelocity<8000; launcherMassDriverExitVelocity+=100) {
      //   const V0 = new THREE.Vector3(launcherMassDriverExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launcherMassDriverExitVelocity * Math.cos(upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher
      //   const coe = this.orbitalElementsFromStateVector(R0, V0)
      //   const c = coe.semimajorAxis * coe.eccentricity
      //   const apogeeDistance = coe.semimajorAxis + c
      //   const speedAtApogee = Math.sqrt(this.mu * (2 / apogeeDistance - 1 / coe.semimajorAxis))
      //   const speedOfCircularizedOrbit = Math.sqrt(this.mu / apogeeDistance)
      //   const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
      //   const launchVehicleRocketExhaustVelocity = dParamWithUnits['launchVehicleRocketExhaustVelocity'].value
      //   const m0Overmf = Math.exp(deltaVNeededToCircularizeOrbit / launchVehicleRocketExhaustVelocity)
      //   console.print(launcherMassDriverExitVelocity, Math.round(apogeeDistance - crv.radiusOfPlanet), Math.round(deltaVNeededToCircularizeOrbit), Math.round(m0Overmf * 100)/100)
      // }

      let V0 = new THREE.Vector3(launcherMassDriverExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launcherMassDriverExitVelocity * Math.cos(upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher
      const coe = this.orbitalElementsFromStateVector(R0, V0)
      const c = coe.semimajorAxis * coe.eccentricity
      const apogeeDistance = coe.semimajorAxis + c
      const speedAtApogee = Math.sqrt(this.mu * (2 / apogeeDistance - 1 / coe.semimajorAxis))
      const speedOfCircularizedOrbit = Math.sqrt(this.mu / apogeeDistance)
      const deltaVNeededToCircularizeOrbit = speedOfCircularizedOrbit - speedAtApogee
      const launchVehicleRocketExhaustVelocity = dParamWithUnits['launchVehicleRocketExhaustVelocity'].value
      const m0Overmf = Math.exp(deltaVNeededToCircularizeOrbit / launchVehicleRocketExhaustVelocity)
      //console.log(coe)
      console.log('speedAtApogee', speedAtApogee)
      console.log('apogeeAltitude', apogeeDistance - crv.radiusOfPlanet)
      console.log('deltaVNeededToCircularizeOrbit', deltaVNeededToCircularizeOrbit)
      console.log('m0Overmf', m0Overmf)

      // Better V0 calculation - we need to take into account the rotation of the planet...
      //const V0 = new THREE.Vector2(launcherMassDriverExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launcherMassDriverExitVelocity * Math.cos(upwardAngleAtEndOfRamp)) // This is the vehicle's velocity vector at the exit of the launcher
      //console.log(R0, V0)

      // We want to find the exact time and downrange distance where the vehicle's altitude is equal to the desired suspended evacuated tube exit altitude (or the ground, if it's not going fast enough).
      // We will solve for this iteratively, although there's probably a better way...
      // We will also assume that the vehicle will coast (i.e. it will not accellerate using its rocket engine) within the evacuated tube.
      let t = 0
      let tStep = .1 // second
      let RV, distSquared
      let converging = true
      let lastDifference = -1

      // First, determine if the orbit's appogee or the altitude of the tethered ring is greater.
      if (apogeeDistance<=launcherRampExitAltitude) {
        console.log("Error: rampExitAltitude too high")
      }
      // ToDo: Need a better calculation of the optimal height of the evacuated tube's exit in case it can't reach the altitude of the ring.
      const maxOrbitalR = tram.lerp(crv.radiusOfPlanet + launcherRampExitAltitude, apogeeDistance, 0.8) // No point in going all the way to appogee as this would cause the flight to level out to horizontal.
      const evacuatedTubeExitR = Math.min(maxOrbitalR , crv.radiusOfPlanet + crv.currentMainRingAltitude)
      const evacuatedTubeExitRSquared = evacuatedTubeExitR ** 2

      for (t = 0; (Math.abs(tStep)>0.01) && t<dParamWithUnits['launcherCoastTime'].value && converging; t+=tStep) {
        RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t)
        distSquared = RV.R.x**2 + RV.R.y**2
        if ((distSquared < evacuatedTubeExitRSquared) ^ (tStep>0)) {
          tStep = -tStep/2
        }
        else {
          // Check that we're converging towards (as opposed to diverging from) a solution
          const difference = Math.abs(distSquared - evacuatedTubeExitRSquared)
          if ((lastDifference !== -1) && (difference > lastDifference)) {
            converging = false
          }
          else {
            lastDifference = difference
          }
        }
        if (gotStuckCheck(this.clock, timeNow, t, 'the downrange distance calculation')) break
      }

      // const planetRadiusSquared = crv.radiusOfPlanet**2
      // const ringDistSquared = (crv.radiusOfPlanet + launcherEvacuatedTubeExitAltitude)**2
      // //console.log('Calculating downrange distance from end of ramp to a point on the hyperbolic trajectory at the ring\'s altitude')
      // for (t = 0; (Math.abs(tStep)>0.01) && t<dParamWithUnits['launcherCoastTime'].value && converging; t+=tStep) {
      //   RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t)
      //   distSquared = RV.R.x**2 + RV.R.y**2
      //   const withinBoundaries = (distSquared < ringDistSquared) && (distSquared > planetRadiusSquared) 
      //   if (withinBoundaries ^ (tStep>0)) {
      //     tStep = -tStep/2
      //   }
      //   else {
      //     // Check that we're converging towards (as opposed to diverging from) a solution
      //     const difference = Math.abs(distSquared - ringDistSquared)
      //     if ((lastDifference !== -1) && (difference > lastDifference)) {
      //       converging = false
      //     }
      //     else {
      //       lastDifference = difference
      //     }
      //   }
      //   if (gotStuckCheck(this.clock, timeNow, t, 'the downrange distance calculation')) break
      // }
      // if (!converging) {
      //   console.log('Warning: The downrange distance calculation did not converge')
      // }

      this.timeWithinEvacuatedTube = t
      const evacuatedTubeDownrangeAngle = Math.atan2(RV.R.y, RV.R.x)  // This is the angle subtending the end of the ramp, center of the earth, and the end of the evacuated tube
      //console.log('done')


      // ***************************************************************
      // Next we need to place the end of the ramp and the end of the evacuated tube at locations that are directly under the ring, 
      // so that the lightweight evacuated tube that the launched vehicles will inititially coast through can be suspended from the ring.

      // Convert the angle relative to the center of the Earth to an angle relative to the center of the ring 
      const straightLineHalfDistance = Math.sin(evacuatedTubeDownrangeAngle/2) * (crv.radiusOfPlanet + crv.currentMainRingAltitude)
      const evacuatedTubeRingAngle = Math.asin(straightLineHalfDistance / crv.mainRingRadius) * 2

      const evacuatedTubeExitPositionAroundRing = (1 + evacuatedTubeEntrancePositionAroundRing - evacuatedTubeRingAngle / (2*Math.PI)) % 1
      const evacuatedTubeExitPositionInRingRefCoordSys = mainRingCurve.getPoint(evacuatedTubeExitPositionAroundRing)
      // Adjust the altitude of the positions to place it the correct distance above the earth's surface
      evacuatedTubeExitPositionInRingRefCoordSys.multiplyScalar((crv.radiusOfPlanet + launcherEvacuatedTubeExitAltitude) / (crv.radiusOfPlanet + crv.currentMainRingAltitude))
      // Convert thes positions into the planet's coordinate system 
      const evacuatedTubeExitPosition = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(evacuatedTubeExitPositionInRingRefCoordSys.clone()))

      // Generate an axis of rotation for define the curvatures of the mass driver and the ramp
      this.axisOfRotation = new THREE.Vector3().crossVectors(evacuatedTubeEntrancePosition, evacuatedTubeExitPosition.clone().sub(evacuatedTubeEntrancePosition)).normalize()

      // Calculate a vector that points to the exit of the mass drive (and the entrance to the ramp)
      const massDriverExitPosition = evacuatedTubeEntrancePosition.clone().applyAxisAngle(this.axisOfRotation, -rampBaseLength / (crv.radiusOfPlanet + launcherMassDriverAltitude))
      massDriverExitPosition.multiplyScalar((crv.radiusOfPlanet + launcherMassDriverAltitude) / (crv.radiusOfPlanet + launcherRampExitAltitude))

      // Position markers at the end of the mass driver and at entrance and exit positions of the evacuated tube
      this.LaunchTrajectoryMarker1.position.copy(massDriverExitPosition)
      this.LaunchTrajectoryMarker2.position.copy(evacuatedTubeEntrancePosition)
      this.LaunchTrajectoryMarker3.position.copy(evacuatedTubeExitPosition)

      // Calculate parameters for the circle that defines the upward arcing launch ramp
      const l1 = massDriverExitPosition.length()   // Distance from the center of the planet to the end of the mass driver
      const rampCircleCenter = massDriverExitPosition.clone().multiplyScalar((allowableUpwardTurningRadius + l1) / l1)  // Points to the center of the circle that defines the ramp's curve
      const rampCircleVector = massDriverExitPosition.clone().multiplyScalar(-allowableUpwardTurningRadius / l1)     // A vector from the center of the circle that defines the ramp back to the mass driver's exit position.
      const rampCircleVectorRotated = rampCircleVector.clone().applyAxisAngle(this.axisOfRotation, -angleACB)
      const rampEndPoint = rampCircleCenter.clone().add(rampCircleVectorRotated)

      this.LaunchTrajectoryMarker4.position.copy(rampCircleCenter)

      // We have the shape of the mass driver and ramp, but we need to get some more information about the vehicle's speed and distance versus time while on the ramp.... 
      // In support of the curve for the ramp, we need to create a lookup table that converts time to speed and distance travelled...
      // Assuming a frictionless ramp with a circular profile, we can calculate the vehicle's speed and position as a function of time and initial velocity.
      let speed = launcherMassDriverExitVelocity
      const unitMass = 1
      const initialKineticEnergy = 0.5 * unitMass * speed**2
      // Add the potential energy...
      const initialPotentialEnergy = -crv.gravitationalConstant * crv.massOfPlanet * unitMass / (crv.radiusOfPlanet + launcherMassDriverAltitude) 
      const minAllowableRampSpeed = 10 // m/s
      let deltaT = 0.1
      let angle = 0
      let lastAngle = 0
      let distance = 0
      let kineticEnergy = initialKineticEnergy
      let potentialEnergy = initialPotentialEnergy
      const rampConversionCurvePoints = []
      for (let t = 0; (lastAngle<angleACB) && (speed>minAllowableRampSpeed); t+=deltaT) {
        rampConversionCurvePoints.push(new THREE.Vector3(speed, distance, t))
        //console.log(t, kineticEnergy, potentialEnergy, speed, angle)
        // Change in angular position...
        const deltaAngle = speed * deltaT / allowableUpwardTurningRadius
        lastAngle = angle
        angle += deltaAngle
        distance = allowableUpwardTurningRadius * angle
        const dValue = distance / this.launcherRampLength 
        const newR = crv.radiusOfPlanet + launcherMassDriverAltitude + allowableUpwardTurningRadius * (1 - Math.cos(angle))
        const newPotentialEnergy = -crv.gravitationalConstant * crv.massOfPlanet * unitMass / newR
        const deltaPE = newPotentialEnergy - potentialEnergy
        // This change in potential energy results in a corresponding loss of kinetic energy... 
        const deltaKE = -deltaPE
        const newKineticEnergy = kineticEnergy + deltaKE
        speed = Math.sqrt(2 * newKineticEnergy / unitMass)
        potentialEnergy = newPotentialEnergy
        kineticEnergy = newKineticEnergy
        // Special check to calculate the curveUp time accurately
        if (angle>=angleACB) {
          const remainingDeltaT = deltaT * (angleACB - lastAngle) / deltaAngle
          this.curveUpTime = t + remainingDeltaT
        }
      }
      if (speed<=minAllowableRampSpeed) {
        console.log('Warning: The vehicle is not going fast enough to make it up the ramp.')
      }
      const rampConversionCurve = new THREE.CatmullRomCurve3(rampConversionCurvePoints)

      const launchRamptTosConvertor = function tTos(t) {
        const tForLookup = t / ((rampConversionCurvePoints.length-1) * deltaT)
        const interpolatedPoint = rampConversionCurve.getPoint(tForLookup)
        const speed = interpolatedPoint.x
        return speed
      }
      const launchRamptTodConvertor = function(t) {
        const tForLookup = t / ((rampConversionCurvePoints.length-1) * deltaT)
        const interpolatedPoint = rampConversionCurve.getPoint(tForLookup)
        const distance = interpolatedPoint.y
        return distance
      }
      const launchRampExitVelocity = launchRamptTosConvertor(this.curveUpTime)

      console.log('launcherRampLength', this.launcherRampLength, 'curveUpTime', this.curveUpTime, this.curveUpTimeOld)
      console.log("launcherMassDriverExitVelocity", launcherMassDriverExitVelocity)
      console.log("launchRampExitVelocity", launchRampExitVelocity)
      // Next design the downward arcing part of the sled's return path

      const allowableDownwardTurningRadius = launchRampExitVelocity**2 / (launcherSledDownwardAcceleration - accelerationOfGravity)
      // For the downward arcing part of the sled's return path we need the rampEndPoint from above and
      // a circle center point that's allowableDownwardTurningRadius further away from the center of the ramp's curve.
      const sledReturnCircleStartPoint = rampEndPoint
      const sledReturnScaleFactor = (allowableUpwardTurningRadius + allowableDownwardTurningRadius) / allowableUpwardTurningRadius
      const sledReturnCircleCenter = rampCircleCenter.clone().add(rampCircleVectorRotated.clone().multiplyScalar(sledReturnScaleFactor))
      const sledReturnCircleLength = Math.PI * 2 * 0.125 * allowableDownwardTurningRadius // The 0.125 fator is just an rough estimate - we'll need to calculated it later.
      this.curveDownTime = sledReturnCircleLength / launchRampExitVelocity // ToDo: This is inaccurate as it does not take into account the increase in speed due to coasting down the ramp.

      this.LaunchTrajectoryMarker5.position.copy(sledReturnCircleCenter)

      // ***************************************************************
      // Next we need to capture some curves and data sets for plotting
      // ***************************************************************

      const launchTrajectoryCurveControlPoints = []
      const freeFlightCurveControlPoints = []
      const evacuatedTubeCurveControlPoints = []

      const altitudeVesusTimeData = []
      const speedVersusTimeData = []
      const downrangeDistanceVersusTimeData = []
      const forwardAccelerationVersusTimeData = []
      const lateralAccelerationVersusTimeData = []
      const aerodynamicDragVersusTimeData = []
      const totalMassVerusTimeData = []

      const t1 = this.timeWithinMassDriver
      const t2 = t1 + this.curveUpTime
      const t3 = t2 + this.timeWithinEvacuatedTube
      const t4 = t3 + dParamWithUnits['launcherCoastTime'].value

      let vehiclePosition
      let vehicleAirSpeed
      let distanceTravelled
      let altitude

      // Prep the vehicle's initial conditions
      const mVehicle = dParamWithUnits['launchVehicleEmptyMass'].value
      const mPayload = dParamWithUnits['launchVehiclePayloadMass'].value
      let mPropellant = dParamWithUnits['launchVehiclePropellantMass'].value
      let m0 = mVehicle + mPayload + mPropellant // mass of vehicle, payload, and propellant

      t = 0
      tStep = .1 // second

      // ***************************************************************
      // Create the part of the trajectory where the vehicle is within mass driver near the planet's surface
      // ***************************************************************
      this.massDriverCurve = new CircleSuperCurve3(new THREE.Vector3(0, 0, 0), this.axisOfRotation, massDriverExitPosition, -launcherMassDriverLength, false)
      const massDrivertTosConvertor = function tTos(t) {
        return launcherMassDriverInitialVelocity + launcherMassDriverForwardAcceleration * t  // 1/2 at^2
      }
      this.massDriverCurve.addtTosConvertor(massDrivertTosConvertor)
      const massDrivertTodConvertor = function(t) {
        return launcherMassDriverInitialVelocity * t + 0.5 * launcherMassDriverForwardAcceleration * t * t  // v0*t + 1/2 at^2
      }
      this.massDriverCurve.addtTodConvertor(massDrivertTodConvertor)
      this.massDriverCurve.setDuration(this.timeWithinMassDriver)
      this.massDriverCurve.name = "massDriverCurve"

      // Start the launch trajectory curve at the beginning of the mass driver.
      //console.log('Creating mass driver part of trajectory.')
      upwardAcceleration = 0   // This does not include the acceleration of gravity from the planet
      altitude = launcherMassDriverAltitude

      for (t = 0; t < this.timeWithinMassDriver; t += tStep) {
        vehicleAirSpeed = this.massDriverCurve.tTos(t, launcherMassDriverInitialVelocity, forwardAcceleration)
        distanceTravelled = this.massDriverCurve.tTod(t, launcherMassDriverInitialVelocity, forwardAcceleration)
        // Rotate the massDriverExitPosition around the axisOfRotation using the angle derived from the distance travelled
        vehiclePosition = massDriverExitPosition.clone().applyAxisAngle(this.axisOfRotation, (distanceTravelled - launcherMassDriverLength) / (crv.radiusOfPlanet + launcherMassDriverAltitude))
        //console.log('old angle', (distanceTravelled - launcherMassDriverLength) / (crv.radiusOfPlanet + launcherMassDriverAltitude))
        const vp2 = this.massDriverCurve.getPointAt(distanceTravelled/launcherMassDriverLength)
        if (t==0) {
          this.startOfMassDriverPosition = vp2.clone()
        }
        launchTrajectoryCurveControlPoints.push(vp2)
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, distanceTravelled, 0))
        speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
        totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))
      }
      //console.log('done')

      // ***************************************************************
      // Create the part of the trajectory where the vehicle is travelling along the upward curving ramp
      // ***************************************************************
      this.launchRampCurve = new CircleSuperCurve3(rampCircleCenter.clone(), this.axisOfRotation.clone().negate(), massDriverExitPosition.clone(), this.launcherRampLength, true)
      this.launchRampCurve.addtTosConvertor(launchRamptTosConvertor)
      this.launchRampCurve.addtTodConvertor(launchRamptTodConvertor)
      this.launchRampCurve.setDuration(this.curveUpTime)
      this.launchRampCurve.name = "launchRampCurve"

      // Test the convertors...
      // angle = 0
      // lastAngle = 0
      // distance = 0
      // kineticEnergy = initialKineticEnergy
      // potentialEnergy = initialPotentialEnergy
      // for (let t = 0; lastAngle<angleACB; t+=deltaT) {
      //   const lutSpeed = launchRamptTosConvertor(t)
      //   const lutDistance = launchRamptTodConvertor(t)
      //   console.print(t, speed, lutSpeed, distance, lutDistance)
      //   // Change in angular position...
      //   const deltaAngle = speed * deltaT / allowableUpwardTurningRadius
      //   lastAngle = angle
      //   angle += deltaAngle
      //   distance = allowableUpwardTurningRadius * angle
      //   const dValue = distance / this.launcherRampLength 
      //   const newR = crv.radiusOfPlanet + launcherMassDriverAltitude + allowableUpwardTurningRadius * (1 - Math.cos(angle))
      //   const newPotentialEnergy = -crv.gravitationalConstant * crv.massOfPlanet * m0 / newR
      //   const deltaPE = newPotentialEnergy - potentialEnergy
      //   // This change in potential energy results in a corresponding loss of kinetic energy... 
      //   const deltaKE = -deltaPE
      //   const newKineticEnergy = kineticEnergy + deltaKE
      //   speed = Math.sqrt(2 * newKineticEnergy / m0)
      //   potentialEnergy = newPotentialEnergy
      //   kineticEnergy = newKineticEnergy
      // }



      // ***************************************************************
      // Create a downward arching curve for the launch sled to travel on after the vehicle detaches.
      // ***************************************************************

      this.launchSledReturnCurve = new CircleSuperCurve3(sledReturnCircleCenter.clone(), this.axisOfRotation.clone(), sledReturnCircleStartPoint.clone(), sledReturnCircleLength, false)
      const launchSledReturntTosConvertor = function tTos(t) {
        // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
        return launcherMassDriverExitVelocity
      }
      this.launchSledReturnCurve.addtTosConvertor(launchSledReturntTosConvertor)
      const launchSledReturntTodConvertor = function(t) {
        // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
        return launcherMassDriverExitVelocity * t
      }
      this.launchSledReturnCurve.addtTodConvertor(launchSledReturntTodConvertor)
      this.launchSledReturnCurve.setDuration(this.curveDownTime)
      this.launchSledReturnCurve.name = "launchSledReturnCurve"

      forwardAcceleration = 0
      upwardAcceleration = launcherMassDriverUpwardAcceleration

      //console.log('Creating ramp part of trajectory.')

      // Totally incorrect code inside this for loop!!!

      for (; t<Math.min(t2, 10000); t+=tStep) {   // Hack - Min function added to prevent endless loop in case of bug
        const distanceTravelled = this.launchRampCurve.tTod(t - this.timeWithinMassDriver)
        const d = distanceTravelled / this.launcherRampLength
        vehiclePosition = this.launchRampCurve.getPointAt(d)
        vehicleAirSpeed = this.launchRampCurve.tTos(t - this.timeWithinMassDriver)
        altitude = vehiclePosition.length() - crv.radiusOfPlanet
        const downrangeAngle = massDriverExitPosition.angleTo(vehiclePosition)
        const downrangeDistance = launcherMassDriverLength + downrangeAngle * (crv.radiusOfPlanet + launcherMassDriverAltitude)
        launchTrajectoryCurveControlPoints.push(vehiclePosition)
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
        speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, forwardAcceleration, 0))
        lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, upwardAcceleration, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, 0, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the mass drivers evacuated tube
        totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))

      }
      //console.log('done')

      //this.LaunchTrajectoryMarker2.position.copy(rampEndPoint)
      const downrangeAngle = massDriverExitPosition.angleTo(rampEndPoint)
      const downrangeDistanceTravelledOnRamp = downrangeAngle * crv.radiusOfPlanet
      distanceTravelled += angleACB * allowableUpwardTurningRadius

      // ***************************************************************
      // Create the part of the trajectory where the vehicle coasts on an eliptical or hyperbolic trajectory within the evacuated tube
      // ***************************************************************
      let distanceTravelledWithinEvacuatedTube = 0
      let lastR = R0
      V0 = new THREE.Vector3(launchRampExitVelocity * Math.sin(upwardAngleAtEndOfRamp), launchRampExitVelocity * Math.cos(upwardAngleAtEndOfRamp), 0) // This is the vehicle's velocity vector at the exit of the launcher

      const evacuatedTubeConversionCurvePoints = []
      const l2 = evacuatedTubeEntrancePosition.length()
      const totalSplinePoints = Math.floor((t4-t2)/tStep) // Place spline points at roughly tStep intervals along the launch path (warning - this is not exact)
      const numEvacuatedTubeSplinePoints = Math.floor(totalSplinePoints * (t3-t2) / (t4-t2))
      const tStep1 = (t3 - t2) / (numEvacuatedTubeSplinePoints - 1)
      for (let i = 0; i<numEvacuatedTubeSplinePoints; i++ ) {
        const t5 = i * tStep1  // t5 is the time from the end of the ramp
        const RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t5)
        const downrangeAngle = Math.atan2(RV.R.y, RV.R.x)
        // Calculate the vehicle's position relative to where R0 and V0 were when the vehicle was at R0.
        vehiclePosition = evacuatedTubeEntrancePosition.clone().applyAxisAngle(this.axisOfRotation, downrangeAngle).multiplyScalar(RV.R.length() / l2)
        vehicleAirSpeed = Math.sqrt(RV.V.y**2 + RV.V.x**2) // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
        altitude = Math.sqrt(RV.R.y**2 + RV.R.x**2) - crv.radiusOfPlanet
        const aerodynamicDrag = 0
        const deltaDistanceTravelled = Math.sqrt((RV.R.x-lastR.x)**2 + (RV.R.y-lastR.y)**2) // ToDo: Would be better to find the equation for distance traveled along a hyperbolic path versus time.
        distanceTravelledWithinEvacuatedTube += deltaDistanceTravelled

        const downrangeDistance = launcherMassDriverLength + rampBaseLength + downrangeAngle * (crv.radiusOfPlanet + launcherMassDriverAltitude)
        // Collect control points for curves
        evacuatedTubeConversionCurvePoints.push(new THREE.Vector3(vehicleAirSpeed, distanceTravelledWithinEvacuatedTube, t5))
        launchTrajectoryCurveControlPoints.push(vehiclePosition)
        evacuatedTubeCurveControlPoints.push(vehiclePosition)
        // Save telemery...
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
        speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
        totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))
        lastR = RV.R
      }
      this.launcherEvacuatedTubeLength = distanceTravelledWithinEvacuatedTube
      distanceTravelled += distanceTravelledWithinEvacuatedTube
      const totalLengthOfLaunchSystem = distanceTravelled

      const evacuatedTubeConversionCurve = new THREE.CatmullRomCurve3(evacuatedTubeConversionCurvePoints)

      const evacuatedTubetTosConvertor = function tTos(t) {
        const tForLookup = t / ((evacuatedTubeConversionCurvePoints.length-1) * tStep1)
        const interpolatedPoint = evacuatedTubeConversionCurve.getPoint(tForLookup)
        const speed = interpolatedPoint.x
        return speed
      }
      const evacuatedTubetTodConvertor = function(t) {
        const tForLookup = t / ((evacuatedTubeConversionCurvePoints.length-1) * tStep1)
        const interpolatedPoint = evacuatedTubeConversionCurve.getPoint(tForLookup)
        const distance = interpolatedPoint.y
        return distance
      }
      const evacuatedTubeExitVelocity = evacuatedTubetTosConvertor(this.curveUpTime)


      // ***************************************************************
      // Create the part of the trajectory where the vehicle coasts on an eliptical or hyperbolic trajectory after it leaves the evacuated tube
      // ***************************************************************
      // We'll need to generate some parameters to help us calculate the aerodynamic drag on the vehicle while it's travelling through the rarified upper atmosphere 
      const launchVehicleRadius = dParamWithUnits['launchVehicleRadius'].value
      const launchVehicleBodyLength = dParamWithUnits['launchVehicleBodyLength'].value
      const launchVehicleNoseConeLength = dParamWithUnits['launchVehicleNoseConeLength'].value
      const noseConeAngle = Math.atan2(launchVehicleRadius, launchVehicleNoseConeLength)
      const freeFlightConversionCurvePoints = []
      const numFreeFlightSplinePoints = totalSplinePoints - numEvacuatedTubeSplinePoints
      const tStep2 = (t4 - t3) / (numFreeFlightSplinePoints - 1)
      let distanceTravelledOutsideLaunchSystem = 0
      let warningAlreadyGiven = false

      //console.log('Creating hyprebolic part of trajectory.')
      for (let i = 0; i<numFreeFlightSplinePoints; i++ ) {
        const t5 = t3 - t2 + i * tStep2  // t5 is the time from the end of the ramp
        const RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t5)
        const downrangeAngle = Math.atan2(RV.R.y, RV.R.x)
        // Calculate the vehicle's position relative to where R0 and V0 were when the vehicle was at R0.
        vehiclePosition = evacuatedTubeEntrancePosition.clone().applyAxisAngle(this.axisOfRotation, downrangeAngle).multiplyScalar(RV.R.length() / l2)
        vehicleAirSpeed = Math.sqrt(RV.V.y**2 + RV.V.x**2) // ToDo: The speed due to the planet's rotation needs to be calculated and factored in
        altitude = Math.sqrt(RV.R.y**2 + RV.R.x**2) - crv.radiusOfPlanet
        const deltaDistanceTravelled = Math.sqrt((RV.R.x-lastR.x)**2 + (RV.R.y-lastR.y)**2) // ToDo: Would be better to find the equation for distance traveled along a hyperbolic path versus time.
        const downrangeDistance = launcherMassDriverLength + rampBaseLength + downrangeAngle * (crv.radiusOfPlanet + launcherMassDriverAltitude)
        distanceTravelledOutsideLaunchSystem += deltaDistanceTravelled
        const aerodynamicDrag = this.GetAerodynamicDrag_ChatGPT(altitude, vehicleAirSpeed, noseConeAngle, launchVehicleRadius, launchVehicleBodyLength)
        const fuelFlowRate = aerodynamicDrag / launchVehicleRocketExhaustVelocity
        mPropellant = Math.max(0, mPropellant - fuelFlowRate * tStep2)
        if ((mPropellant == 0) && !warningAlreadyGiven) {
          console.log("Out of propellant!")
          warningAlreadyGiven = true
        }
        m0 = mVehicle + mPayload + mPropellant

        // Collect control points for curves
        freeFlightConversionCurvePoints.push(new THREE.Vector3(vehicleAirSpeed, distanceTravelledOutsideLaunchSystem, t5))
        if (i!=0) {
          // ToDo: This is a bit inaccurate because the temporal spacing of these points differs slightly from that of the points we added earlier
          launchTrajectoryCurveControlPoints.push(vehiclePosition)
        }
        freeFlightCurveControlPoints.push(vehiclePosition)
        // Save telemery...
        altitudeVesusTimeData.push(new THREE.Vector3(t, altitude, 0))
        downrangeDistanceVersusTimeData.push(new THREE.Vector3(t, downrangeDistance, 0))
        speedVersusTimeData.push(new THREE.Vector3(t, vehicleAirSpeed, 0))
        forwardAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        lateralAccelerationVersusTimeData.push(new THREE.Vector3(t, 0, 0))
        aerodynamicDragVersusTimeData.push(new THREE.Vector3(t, aerodynamicDrag, 0)) // ToDo: Should make this a function of the level of vacuum and type of gas inside the suspended evacuated tube
        totalMassVerusTimeData.push(new THREE.Vector3(t, m0, 0))
        lastR = RV.R
      }
      //console.log('done')
			this.durationOfLaunchTrajectory = t4
      this.durationOfFreeFlight = t4 - t3
      distanceTravelled += distanceTravelledOutsideLaunchSystem

      const freeFlightConversionCurve = new THREE.CatmullRomCurve3(freeFlightConversionCurvePoints)

      const freeFlighttTosConvertor = function tTos(t) {
        const tForLookup = t / ((freeFlightConversionCurvePoints.length-1) * tStep2)
        const interpolatedPoint = freeFlightConversionCurve.getPoint(tForLookup)
        const speed = interpolatedPoint.x
        return speed
      }
      const freeFlighttTodConvertor = function(t) {
        const tForLookup = t / ((freeFlightConversionCurvePoints.length-1) * tStep2)
        const interpolatedPoint = freeFlightConversionCurve.getPoint(tForLookup)
        const distance = interpolatedPoint.y
        return distance
      }


      // Make a curve for the entire start-to-finish launch trajectory
      this.launchTrajectoryCurve = new CatmullRomSuperCurve3(launchTrajectoryCurveControlPoints)
      this.launchTrajectoryCurve.curveType = 'centripetal'
      this.launchTrajectoryCurve.closed = false
      this.launchTrajectoryCurve.tension = 0

      // Make a curve for the suspended evacuated tube
      this.evacuatedTubeCurve = new CatmullRomSuperCurve3(evacuatedTubeCurveControlPoints)
      this.evacuatedTubeCurve.curveType = 'centripetal'
      this.evacuatedTubeCurve.closed = false
      this.evacuatedTubeCurve.tension = 0

      // const evacuatedTubetTosConvertor = function tTos(t) {
      //   // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      //   return launcherMassDriverExitVelocity
      // }
      this.evacuatedTubeCurve.addtTosConvertor(evacuatedTubetTosConvertor)
      // const evacuatedTubetTodConvertor = function(t) {
      //   // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      //   return Math.min(distanceTravelledWithinEvacuatedTube, launcherMassDriverExitVelocity * t)
      // }
      this.evacuatedTubeCurve.addtTodConvertor(evacuatedTubetTodConvertor)

      this.evacuatedTubeCurve.setDuration(this.timeWithinEvacuatedTube)
      this.evacuatedTubeCurve.name = "evacuatedTubeCurve"

      // Make a curve for the entire free flight portion of the launch trajectory starting from the end of the evacuated tube
      this.freeFlightCurve = new CatmullRomSuperCurve3(freeFlightCurveControlPoints)
      this.freeFlightCurve.curveType = 'centripetal'
      this.freeFlightCurve.closed = false
      this.freeFlightCurve.tension = 0

      // const freeFlighttTosConvertor = function tTos(t) {
      //   // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      //   return launcherMassDriverExitVelocity
      // }
      this.freeFlightCurve.addtTosConvertor(freeFlighttTosConvertor)
      // const freeFlighttTodConvertor = function(t) {
      //   // We're ignoring the effect of earth's gravity here so this is a poor approximation at the moment. Need to derive the equation for a pendulum in a gravity field...
      //   return Math.min(distanceTravelledOutsideLaunchSystem, launcherMassDriverExitVelocity * t)
      // }
      this.freeFlightCurve.addtTodConvertor(freeFlighttTodConvertor)

      this.freeFlightCurve.setDuration(this.durationOfFreeFlight)
      this.freeFlightCurve.name = "freeFlightCurve"

      this.xyChart.drawAxes()
      this.xyChart.labelAxes()
      this.xyChart.addCurve("Altitude", "m", altitudeVesusTimeData, 0xff0000, "Red")  // Red Curve
      this.xyChart.addCurve("Downrange Distance", "m", downrangeDistanceVersusTimeData, 0xff00ff, "Purple")  // Purple Curve
      this.xyChart.addCurve("Speed", "m/s", speedVersusTimeData, 0x00ffff, "Cyan")  // Cyan Curve
      this.xyChart.addCurve("Aerodynmic Drag", "N", aerodynamicDragVersusTimeData, 0x80ff80, "Bright Green") // Bright Green Curve
      this.xyChart.addCurve("Vehicle Mass", "kg", totalMassVerusTimeData, 0x0000ff, "Blue") // Blue Curve
      this.xyChart.addCurve("Forward Accelleration", "m/s2", forwardAccelerationVersusTimeData, 0xffff00, "Yellow") // Yellow Curve
      this.xyChart.addCurve("Lateral Accelleration", "m/s2", lateralAccelerationVersusTimeData, 0xff8000, "Orange") // Orange Curve

      console.print('========================================')
      let peakAerodynamicDrag = 0
      this.xyChart.curveInfo.forEach(curve =>{
        console.print(curve.name, '(', curve.colorName, ')', curve.maxY)
        if (curve.name == 'Aerodynmic Drag') {
          peakAerodynamicDrag = curve.maxY
        }
      })
      console.print("Vehicle Peak Aerodynamic Drag", Math.round(peakAerodynamicDrag/1000), 'kN')
      console.print("RS-25 Engine Thrust 2279 kN")
      console.print("Vehicle Initial Mass", Math.round(m0), 'kg')
      console.print("MassDriver Time", Math.round(launcherMassDriverAccelerationTime*100/60)/100, 'min')
      console.print("Ramp Time", Math.round(this.curveUpTime*10)/10, 'sec')
      console.print("Evacuate Tube Time", Math.round(this.timeWithinEvacuatedTube*10)/10, 'sec')
      console.print("MassDriver Length", Math.round(this.launcherMassDriverLength/1000), 'km')
      console.print("Ramp Base Length", Math.round(rampBaseLength/1000), 'km')
      console.print("Evacuate Tube Length", Math.round(distanceTravelledWithinEvacuatedTube/1000), 'km')
      console.print("Total Length Of Launch System", Math.round(totalLengthOfLaunchSystem/1000), 'km')
      console.print('========================================')

      if (genLauncherKMLFile) {
        // Start a polyline...
        kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader)

        // launchTrajectoryCurveControlPoints.forEach(point => {
        //   const xyzPlanet = planetCoordSys.worldToLocal(point.clone())
        //   const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
        //   const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
        //   kmlFile = kmlFile.concat(coordString)
        // })
        const numSupports = 100
        // To make the line for the mass driver... 
        for (let i = 0; i<numSupports; i++) {
          const d = i / (numSupports-1)
          const pointOnCurve = this.massDriverCurve.getPointAt(d)
          // You'll need to convert each point to lla with this code...
          const xyzPlanet = planetCoordSys.worldToLocal(pointOnCurve.clone())
          const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
          const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
          kmlFile = kmlFile.concat(coordString)
        }

        // Extend the line for the ramp...
        for (let i = 1; i<numSupports; i++) {
          const d = i / (numSupports-1)
          const pointOnCurve = this.launchRampCurve.getPointAt(d)
          // You'll need to convert each point to lla with this code...
          const xyzPlanet = planetCoordSys.worldToLocal(pointOnCurve.clone())
          const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
          const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
          kmlFile = kmlFile.concat(coordString)
        }

        // Finish the poly line...
        kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)

        // To make the supports...
        for (let i = 0; i<numSupports; i++) {
          const d = i / (numSupports-1)
          const pointOnCurve = this.launchRampCurve.getPointAt(d)
          const tanget = this.launchRampCurve.getTangentAt(d)
          const normal = this.launchRampCurve.getNormalAt(d)
          const binormal = this.launchRampCurve.getBinormalAt(d)
          const pointOnCurveAltitude = pointOnCurve.length() - crv.radiusOfPlanet
          const pointOnGround = pointOnCurve.clone().multiplyScalar(crv.radiusOfPlanet / pointOnCurve.length())
          const pointToLeft = pointOnGround.clone().sub(binormal.clone().multiplyScalar(0.3 * pointOnCurveAltitude))
          const pointToRight = pointOnGround.clone().add(binormal.clone().multiplyScalar(0.3 * pointOnCurveAltitude))

          // To make the support, draw polyline from pointToLeft to pointOnCurve to pointToRight...
          const pointList = [pointToLeft, pointOnCurve, pointToRight]

          // Start a polyline
          kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader)

          // You'll need to convert each point to lla with this code...
          pointList.forEach(point => {
            const xyzPlanet = planetCoordSys.worldToLocal(point.clone())
            const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
            const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
            kmlFile = kmlFile.concat(coordString)
          })

          // End the polyline
          kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)
        }

      }
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
                  console.log("Discarding object")
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
                  const recursive = true
                  const tempModel = object.unallocatedModels[0].clone(recursive)
                  object.unallocatedModels.push(tempModel)
                  this.scene.add(tempModel)
                  //console.log('Duplicating model for ' + objectKey)
                }
                if (object.unallocatedModels.length>0) {
                  // if (objectKey=='virtualMassDriverScrews') {
                  //   console.log("")
                  // }
                  object.model = object.unallocatedModels.pop()
                  object.model.visible = object.isVisible
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
        this.CurveUpTime = this.CurveUpDistance / this.EllipticalOrbitPerigeeVelocity;
        this.CurveDownTime = this.CurveDownDistance / this.EllipticalOrbitPerigeeVelocity;
        this.TotalTimeInLaunchSystem = this.AccelerationTime + this.CurveUpTime + this.CurveDownTime;
        this.VehicleCrossSectionalAreaForDrag = Math.PI * this.VehicleRadius ** 2
    }

    // The following functions were ported from 	// Equation 3.66c, http://www.nssc.ac.cn/wxzygx/weixin/201607/P020160718380095698873.pdf

    stumpC(z) {
        let c

        if (z > 0) {
            c = (1 - Math.cos(Math.sqrt(z))) / z
        }
        else if (z < 0) {
            c = (Math.cosh(Math.sqrt(-z)) - 1) / (-z)
        }
        else {
            c = 1 / 2
        }
        return c
    }

    stumpS(z) {

        let s

        if (z > 0) {
            const sqrtz = Math.sqrt(z)
            s = (sqrtz - Math.sin(sqrtz)) / Math.pow(sqrtz, 3)
        }
        else if (z < 0) {
            const sqrtmz = Math.sqrt(-z)
            s = (Math.sinh(sqrtmz) - sqrtmz) / Math.pow(sqrtmz, 3)
        }
        else {
            s = 1 / 6
        }
        return s
    }

    f_and_g(x, t, ro, a)
    {
        const fg = new THREE.Vector2()

        const z = a * x**2
        //Equation 3.66a:
        fg.x = 1 - x**2 / ro * this.stumpC(z)
        //Equation 3.66b:
        fg.y = t - 1 / Math.sqrt(this.mu) * x*x*x * this.stumpS(z)
        return fg
    }

    fDot_and_gDot(x, r, ro, a)
    {
        const fdotgdot = new THREE.Vector2()

        const z = a * x**2
        // Equation 3.66c:
        fdotgdot.x = Math.sqrt(this.mu) / r / ro * (z*this.stumpS(z) - 1)*x
        // Equation 3.66d:
        fdotgdot.y = 1 - x**2 / r * this.stumpC(z)
        return fdotgdot
    }

    kepler_U(dt, ro, vro, a) {
        let C, S, F
        let dFdx

        // Set an error tolerance and a limit on the number of iterations
        const error = 1e-8
        const nMax = 1000
        // Starting value for x
        let x = Math.sqrt(this.mu)*Math.abs(a)*dt
        // Iterate on Equation 3.62 until convergence occurs within the error tolerance
        let n = 0
        let ratio = 1

        while ((Math.abs(ratio) > error) && (n <= nMax)) {
            n = n + 1
            C = this.stumpC(a * x**2)
            S = this.stumpS(a * x**2)
            F = ro * vro / Math.sqrt(this.mu) * x**2 * C + (1 - a * ro) * x*x*x * S + ro * x - Math.sqrt(this.mu)*dt
            dFdx = ro * vro / Math.sqrt(this.mu) * x * (1 - a * x**2 * S) + (1 - a * ro) * x**2 * C + ro
            ratio = F / dFdx
            x = x - ratio
        }
        return x
    }

    RV_from_R0V0andt(R0_x, R0_y, V0_x, V0_y, t) {

        const R0 = new THREE.Vector2(R0_x, R0_y)
        const V0 = new THREE.Vector2(V0_x, V0_y)
        const RV = {
            R: new THREE.Vector2(0, 0),
            V: new THREE.Vector2(0, 0)
        }
        // mu - gravitational parameter(kmˆ3 / sˆ2)
        // R0 - initial position vector(km)
        // V0 - initial velocity vector(km / s)
        // t - elapsed time(s)
        // R - final position vector(km)
        // V - final velocity vector(km / s)
        // User M - functions required : kepler_U, f_and_g, fDot_and_gDot

        //Magnitudes of R0 and V0
        const r0 = R0.length()
        const v0 = V0.length()
        //Initial radial velocity
        const vr0 = R0.dot(V0) / r0

        // Reciprocal of the semimajor axis(from the energy equation)
        const alpha = 2 / r0 - v0**2 / this.mu
        // Compute the universal anomaly
        const x = this.kepler_U(t, r0, vr0, alpha)
        // Compute the f and g functions
        const fg = this.f_and_g(x, t, r0, alpha)

        // Compute the final position vector
        RV.R.x = fg.x * R0.x + fg.y * V0.x
        RV.R.y = fg.x * R0.y + fg.y * V0.y

        // Compute the magnitude of R
        const r = RV.R.length()
        
        // Compute the derivatives of f and g
        const fdotgdot = this.fDot_and_gDot(x, r, r0, alpha)

        // Compute the final velocity
        RV.V.x = fdotgdot.x * R0.x + fdotgdot.y * V0.x
        RV.V.y = fdotgdot.x * R0.y + fdotgdot.y * V0.y

        return RV
    }

    orbitalElementsFromStateVector(R, V) {
      // This function computes the classical orbital elements (coe)
      // from the state vector (R,V) using Algorithm 4.1.

      // mu - gravitational parameter (kmˆ3/sˆ2)
      // R - position vector in the geocentric equatorial frame
      // (km)
      // V - velocity vector in the geocentric equatorial frame
      // (km)
      // r, v - the magnitudes of R and V
      // vr - radial velocity component (km/s)
      // H - the angular momentum vector (kmˆ2/s)
      // h - the magnitude of H (kmˆ2/s)
      // incl - inclination of the orbit (rad)
      // N - the node line vector (kmˆ2/s)
      // n - the magnitude of N
      // cp - cross product of N and R
      // RA - right ascension of the ascending node (rad)
      // E - eccentricity vector
      // e - eccentricity (magnitude of E)
      // eps - a small number below which the eccentricity is
      // considered to be zero
      // w - argument of perigee (rad)
      // TA - true anomaly (rad)
      // a - semimajor axis (km)
      // pi - 3.1415926...
      // coe - vector of orbital elements [h e RA incl w TA a]

      // User M-functions required: None
      const eps = 1.e-10
      const r = R.length()
      const v = V.length()
      const vr = R.clone().dot(V) / r
      const H = R.clone().cross(V)
      const h = H.length()

      // Equation 4.7:
      const incl = Math.acos(H.z/h);

      // Equation 4.8:
      const N = new THREE.Vector3(0, 0, 1).cross(H)
      const n = N.length()

      // Equation 4.9:
      let RA
      if (n != 0) {
        RA = Math.acos(N.x/n)
        if (N.z < 0) {
          RA = 2*Math.PI - RA
        }
      }
      else {
        RA = 0
      }

      // Equation 4.10:
      const E = R.clone().multiplyScalar((v**2 - this.mu/r)).sub(V.clone().multiplyScalar(r*vr)).multiplyScalar(1/this.mu)
      const e = E.length()

      // Equation 4.12 (incorporating the case e = 0):
      let w
      if (n != 0) {
        if (e > eps) {
          w = Math.acos(N.clone().dot(E)/n/e)
          if (E.z < 0) {
            w = 2*Math.PI - w
          }
        }
        else {
          w = 0
        }
      }
      else {
        w = 0
      }

      // Equation 4.13a (incorporating the case e = 0):
      let TA
      if (e > eps) {
        TA = Math.acos(E.clone().dot(R)/e/r)
        if (vr < 0) {
          TA = 2*Math.PI - TA
        }
      }
      else {
        const cp = N.clone().cross(R)
        if (cp.z >= 0) {
          TA = Math.acos(N.clone().dot(R)/n/r)
        }
        else {
          TA = 2*Math.PI - Math.acos(N.clone().dot(R)/n/r)
        }
      }

      // Equation 2.61 (a < 0 for a hyperbola):
      const a = h**2/this.mu/(1 - e**2)

      return {
        'angularMomentumVector': h,
        'eccentricity': e,
        'rightAscensionOfTheAscendingNode': RA,
        'inclination': incl,
        'argumentOfPerigee': w,
        'trueAnomaly': TA,
        'semimajorAxis': a
      }
    }

    GetAltitudeDistanceAndVelocity(CurrentTime)
    {
        let ADAndV = {
            Altitude: 0,
            Distance: 0,
            Velocity: 0
        }

        if (CurrentTime <= this.AccelerationTime) {
            ADAndV.Altitude = this.LauncherAltitude
            ADAndV.Distance = 0.5 * this.MaxGees * this.const_g * CurrentTime**2
            ADAndV.Velocity = this.MaxGees * this.const_g * CurrentTime
        }
        else if (CurrentTime <= this.AccelerationTime + this.CurveUpTime) {
            ADAndV.Altitude = Math.sqrt((this.R_Earth + this.LauncherAltitude + this.AllowableUpwardTurningRadius)**2 + this.AllowableUpwardTurningRadius**2 - 2 * (this.R_Earth + this.LauncherAltitude + this.AllowableUpwardTurningRadius)*this.AllowableUpwardTurningRadius*Math.cos(Math.max(0, CurrentTime - this.AccelerationTime)*this.EllipticalOrbitPerigeeVelocity / this.AllowableUpwardTurningRadius)) - this.R_Earth;
            // ToDo: This is too rough and approximation
            ADAndV.Distance = this.LauncherTrackLength + (CurrentTime - this.AccelerationTime) * this.EllipticalOrbitPerigeeVelocity
            ADAndV.Velocity = this.EllipticalOrbitPerigeeVelocity
        }
        else if (CurrentTime <= this.TotalTimeInLaunchSystem) {
            ADAndV.Altitude = Math.sqrt((this.R_Earth + this.Alt_Perigee - this.AllowableDownwardTurningRadius)**2 + this.AllowableDownwardTurningRadius**2 - 2 * (this.R_Earth + this.Alt_Perigee - this.AllowableDownwardTurningRadius)*this.AllowableDownwardTurningRadius*Math.cos(Math.PI + Math.min(0, CurrentTime - this.TotalTimeInLaunchSystem)*this.EllipticalOrbitPerigeeVelocity / this.AllowableDownwardTurningRadius)) - this.R_Earth
            // ToDo: This is too rough and approximation
            ADAndV.Distance = this.LauncherTrackLength + (CurrentTime - this.AccelerationTime) * this.EllipticalOrbitPerigeeVelocity
            ADAndV.Velocity = this.EllipticalOrbitPerigeeVelocity
        }
        else {
            const Time = CurrentTime - this.TotalTimeInLaunchSystem
            const R0 = new THREE.Vector2(0, (this.R_Earth + this.Alt_Perigee) / 1000)
            const V0 = new THREE.Vector2(this.EllipticalOrbitPerigeeVelocity / 1000, 0)
            // TBD - need to figure out the altitude while on the eliptical orbit's path

            // Note: The distance units in the RV_from_R0V0andt function and its sub functions are km, not meters.
            const RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, Time)

            ADAndV.Altitude = RV.R.length() * 1000 - this.R_Earth
            ADAndV.Distance = Math.atan2(RV.R.x, RV.R.y) * RV.R.length() * 1000
            ADAndV.Velocity = RV.V.length() * 1000
        }
        return ADAndV
    }

    GetAirDensity(Altitude)
    {
        let T, P
        if (Altitude < 11000.0) {
            T = 15.04 - 0.00649*Altitude
            P = 101.29 * Math.pow((T + 273.1) / 288.08, 5.256)
        }
        else if (Altitude < 25000.0) {
            T = -56.46
            P = 22.65*Math.exp(1.73 - 0.000157*Altitude)
        }
        else {
            T = -131.21 + 0.00299*Altitude
            P = 2.488*Math.pow((T + 273.1) / 216.6, -11.388)
        }
        const Density = P / (0.2869*(T + 273.1))

        return Density

        // Reference https://www.grc.nasa.gov/WWW/k-12/airplane/atmosmet.html
    }

    GetAerodynamicDrag(CurrentAirDensity, Speed)
    {
        const DragForce = CoefficientOfDrag * VehicleCrossSectionalAreaForDrag * (Speed - EarthsRimSpeed)**2 / 2 * CurrentAirDensity
        return DragForce;
    }

    // ChatGPT version
    GetAerodynamicDrag_ChatGPT(altitude, speed, noseConeAngle, radius, length) {
      // Calculate the atmospheric density at the given altitude using the barometric formula
      const density = this.GetAirDensity(altitude)
    
      // Calculate the drag coefficient based on the nose cone angle and length
      // const dragCoefficient = 0.5 * Math.pow(Math.cos(noseConeAngle), 2) + (length / (Math.PI * radius * radius)) // Suspect this formula is BS
      const dragCoefficient = 0.035  // From page 23 of https://upcommons.upc.edu/bitstream/handle/2117/328318/REPORT_556.pdf?sequence=1&isAllowed=y
    
      // Calculate the cross-sectional area of the object
      const crossSectionalArea = Math.PI * radius * radius
    
      // Calculate the drag force using the drag equation
      const dragForce = 0.5 * dragCoefficient * density * speed * speed * crossSectionalArea
    
      return dragForce;
    }
}