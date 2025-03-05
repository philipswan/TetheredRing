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
import * as LauncherAnimate from './launcherAnimate.js'
import * as LaunchTrajectoryUtils from './LaunchTrajectoryUtils.js'
import * as LaunchTrajectoryRocket from './launchTrajectoryRocket.js'
import * as OrbitMath from './OrbitMath.js'
import * as SaveGeometryAsSTL from './SaveGeometryAsSTL.js'
import * as EngineeringDetails from './EngineeringDetails.js'
import regression from 'regression'
import { StarshipIFT1 } from './datasets/StarshipIFT1.js'
import { StarshipIFT2 } from './datasets/StarshipIFT2.js'
import { StarshipIFT3 } from './datasets/StarshipIFT3.js'
import { StarshipIFT4 } from './datasets/StarshipIFT4.js'
import { StarshipIFT5 } from './datasets/StarshipIFT5.js'
import { StarshipIFT6 } from './datasets/StarshipIFT6.js'
import { StarshipIFT7 } from './datasets/StarshipIFT7.js'
import { get } from 'lodash'

//import { arrow } from './markers.js'
//import { FrontSide } from 'three'

export class launcher {

  constructor(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, xyChart, clock, specs, genLauncherKMLFile, kmlFile) {

    // this.worker = new Worker("worker.js")

    // this.worker.onmessage = function(e) {
    //   console.log('Message received from worker', e.data);
    // }
    
    // this.worker.postMessage("Hello World!");

    this.clock = clock
    this.versionNumber = 0

    this.const_g = 9.8  // Earth gravity, used for ISP and g-force calculations
    this.mu = planetSpec.gravitationalParameter

    this.xyChart = xyChart

    this.scene = planetCoordSys
    this.objectClasses = []

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
        this.railModelObject = new massDriverRailModel(dParamWithUnits)
        this.bracketModelObject = new massDriverBracketModel(dParamWithUnits)

        // Create rail materials
        this.massDriverRailMaterials = []
        this.massDriverRailMaterials[0] = new THREE.MeshPhongMaterial( { color: 0x31313E } )
        this.massDriverRailMaterials[1] = new THREE.MeshPhongMaterial( { color: 0x79111E } )

        // Thinking that later we'll need a second reference frame for the rails and sleds so that they can split off from the launch vehicles
        // at the end of the upward ramp, decellerate, and loop back around to the start of the mass driver.
        // const rf1 = new referenceFrame(launchCurve, numZones, this.cameraRange, 0, 0, 0, 'staticLaunchSledReferenceFrame')
        // rf1.addVirtualObject('virtualLaunchSleds')
        // rf1.addVirtualObject('virtualMassDriverRails')
        // this.refFrames.push(rf1)
        
        this.perfOptimizedThreeJS = dParamWithUnits['perfOptimizedThreeJS'].value ? 1 : 0

        // Next, create all of the virtual objects that will be placed along the launch trajectory curve

        this.massDriverScrewTexture = new THREE.TextureLoader().load( './textures/steelTexture.jpg' )

        // Create and add the launch sleds
        new launchSledModel(
          dParamWithUnits,
          this.scene,
          virtualLaunchSled.unallocatedModels,
          this.perfOptimizedThreeJS,
          this.massDriverScrewTexture)

        // Create and add the adaptive nuts
        new adaptiveNutModel(
          dParamWithUnits,
          this.scene,
          virtualAdaptiveNut.unallocatedModels,
          this.perfOptimizedThreeJS,
          this.massDriverScrewTexture)

        // Create and add the launch vechicle models
        new launchVehicleModel(dParamWithUnits, this.scene, virtualLaunchVehicle.unallocatedModels, this.perfOptimizedThreeJS)

        // Create a placeholder screw model (these models need to be generated on the fly though)
        this.massDriverScrewMaterials = []

        // Hack
        //this.massDriverScrewMaterials[0] = new THREE.MeshPhongMaterial({wireframe: true, color: 0xffffff})
        //this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({wireframe: true, color: 0x7f7f7f})
        this.massDriverScrewMaterials[0] = new THREE.MeshPhongMaterial({color: 0xffffff})
        this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({color: 0x7f7f7f})
        //this.massDriverScrewMaterials[1] = new THREE.MeshPhongMaterial({map: this.massDriverScrewTexture})

        this.update(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

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
        virtualMassDriverScrew.unallocatedModels.push(screwModels)

        // Create bracket models
        for (let i = 0; i<1; i++) {
          const tempModel = this.bracketModelObject.createModel(this.polyCurveForrf0, this.accelerationScrewLength, (this.massDriverAccelerationScrewSegments+1), i)
          tempModel.name = 'massDriver2Bracket'
          virtualMassDriverBracket.unallocatedModels.push(tempModel)
        }

        this.coilCenterMarker = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), orangeMaterial)
        this.coilCenterMarker.name = 'coilCenterMarker'
        this.coilCenterMarker.visible = false
        this.scene.add(this.coilCenterMarker)

        break
      case 1:
        // Add the curves from Starship's televised telemetry
        if (dParamWithUnits['showStarshipIFT6Telemetry'].value) {
          const ift1BoosterAlititudeVersusTimeData = []
          const ift1BboosterAirSpeedVersusTimeData = []
          const ift1StarshipAlititudeVersusTimeData = []
          const ift1StarshipAirSpeedVersusTimeData = []
          const ift2BoosterAlititudeVersusTimeData = []
          const ift2BboosterAirSpeedVersusTimeData = []
          const ift2StarshipAlititudeVersusTimeData = []
          const ift2StarshipAirSpeedVersusTimeData = []
          const ift3BoosterAlititudeVersusTimeData = []
          const ift3BboosterAirSpeedVersusTimeData = []
          const ift3StarshipAlititudeVersusTimeData = []
          const ift3StarshipAirSpeedVersusTimeData = []
          const ift4BoosterAlititudeVersusTimeData = []
          const ift4BboosterAirSpeedVersusTimeData = []
          const ift4StarshipAlititudeVersusTimeData = []
          const ift4StarshipAirSpeedVersusTimeData = []
          const ift5BoosterAlititudeVersusTimeData = []
          const ift5BboosterAirSpeedVersusTimeData = []
          const ift5StarshipAlititudeVersusTimeData = []
          const ift5StarshipAirSpeedVersusTimeData = []
          const ift6BoosterAlititudeVersusTimeData = []
          const ift6BboosterAirSpeedVersusTimeData = []
          const ift6StarshipAlititudeVersusTimeData = []
          const ift6StarshipAirSpeedVersusTimeData = []
          const ift7BoosterAlititudeVersusTimeData = []
          const ift7BboosterAirSpeedVersusTimeData = []
          const ift7StarshipAlititudeVersusTimeData = []
          const ift7StarshipAirSpeedVersusTimeData = []

          const curves = []
          //curves.push({prefix: "IFT1", dataset: StarshipIFT1, boostAlt: ift1BoosterAlititudeVersusTimeData, boostSpeed: ift1BboosterAirSpeedVersusTimeData, shipAlt: ift1StarshipAlititudeVersusTimeData, shipSpeed: ift1StarshipAirSpeedVersusTimeData, color: tram.tab10Colors[1].hex, colorName: tram.tab10Colors[1].name})
          //curves.push({prefix: "IFT2", dataset: StarshipIFT2, boostAlt: ift2BoosterAlititudeVersusTimeData, boostSpeed: ift2BboosterAirSpeedVersusTimeData, shipAlt: ift2StarshipAlititudeVersusTimeData, shipSpeed: ift2StarshipAirSpeedVersusTimeData, color: tram.tab10Colors[2].hex, colorName: tram.tab10Colors[2].name})
          //curves.push({prefix: "IFT3", dataset: StarshipIFT3, boostAlt: ift3BoosterAlititudeVersusTimeData, boostSpeed: ift3BboosterAirSpeedVersusTimeData, shipAlt: ift3StarshipAlititudeVersusTimeData, shipSpeed: ift3StarshipAirSpeedVersusTimeData, color: tram.tab10Colors[3].hex, colorName: tram.tab10Colors[3].name})
          //curves.push({prefix: "IFT4", dataset: StarshipIFT4, boostAlt: ift4BoosterAlititudeVersusTimeData, boostSpeed: ift4BboosterAirSpeedVersusTimeData, shipAlt: ift4StarshipAlititudeVersusTimeData, shipSpeed: ift4StarshipAirSpeedVersusTimeData, color: tram.tab10Colors[4].hex, colorName: tram.tab10Colors[4].name})
          //curves.push({prefix: "IFT5", dataset: StarshipIFT5, boostAlt: ift5BoosterAlititudeVersusTimeData, boostSpeed: ift5BboosterAirSpeedVersusTimeData, shipAlt: ift5StarshipAlititudeVersusTimeData, shipSpeed: ift5StarshipAirSpeedVersusTimeData, color: tram.tab10Colors[5].hex, colorName: tram.tab10Colors[5].name})
          //curves.push({prefix: "IFT6", dataset: StarshipIFT6, boostAlt: ift6BoosterAlititudeVersusTimeData, boostSpeed: ift6BboosterAirSpeedVersusTimeData, shipAlt: ift6StarshipAlititudeVersusTimeData, shipSpeed: ift6StarshipAirSpeedVersusTimeData, color: tram.tab10Colors[6].hex, colorName: tram.tab10Colors[6].name})
          curves.push({prefix: "IFT7", dataset: StarshipIFT7, boostAlt: ift7BoosterAlititudeVersusTimeData, boostSpeed: ift7BboosterAirSpeedVersusTimeData, shipAlt: ift7StarshipAlititudeVersusTimeData, shipSpeed: ift7StarshipAirSpeedVersusTimeData, color: tram.tab10Colors[8].hex, colorName: tram.tab10Colors[8].name})
          curves.forEach(curve => {
            curve.dataset.forEach(entry => {
              if ((entry.boost_speed != "NaN") && (entry.boost_speed_confidence > 75)) {
                curve.boostSpeed.push(new THREE.Vector3(entry.timeInSec, entry.boost_speed / 3.6))
                const l = curve.boostSpeed.length
                if ((l>2) && (Math.abs(curve.boostSpeed[l-1].y - curve.boostSpeed[l-2].y) > 100)) {
                  console.log("boostSpeed", entry.timeInSec, entry.boost_speed)
                }
              }
              
              if ((entry.boost_alt != "NaN") && (entry.boost_alt_confidence > 90)) {
                curve.boostAlt.push(new THREE.Vector3(entry.timeInSec, entry.boost_alt * 1000))
                const l = curve.boostAlt.length
                if ((l>2) && (Math.abs(curve.boostAlt[l-1].y - curve.boostAlt[l-2].y) > 1000)) {
                  console.log("boostAlt", entry.timeInSec, entry.boost_alt)
                }
              }
              
              if ((entry.ship_speed != "NaN") && (entry.ship_speed_confidence > 90)) {
                curve.shipSpeed.push(new THREE.Vector3(entry.timeInSec, entry.ship_speed / 3.6))
                const l = curve.shipSpeed.length
                if ((l>2) && (Math.abs(curve.shipSpeed[l-1].y - curve.shipSpeed[l-2].y) > 100)) {
                  console.log("shipSpeed", entry.timeInSec, entry.ship_speed)
                }
              }
              
              if ((entry.ship_alt != "NaN") && (entry.ship_alt_confidence > 90)) {
                curve.shipAlt.push(new THREE.Vector3(entry.timeInSec, entry.ship_alt * 1000))
                const l = curve.shipAlt.length
                if ((l>2) && (Math.abs(curve.shipAlt[l-1].y - curve.shipAlt[l-2].y) > 1000)) {
                  console.log("ShipAlt", entry.timeInSec, entry.ship_alt)
                }
              }
            })
        
            // this.xyChart.addCurve(curve.prefix+" Booster Altitude", "m", "km", curve.boostAlt, 0.001, curve.color, curve.colorName, curve.prefix+" Booster Altitude (km)")
            // this.xyChart.addCurve(curve.prefix+" Booster Air Speed", "m/s", "100's m/s", curve.boostSpeed, 0.01, curve.color, curve.colorName, curve.prefix+" Booster Air Speed (100's m/s)")
            // this.xyChart.addCurve(curve.prefix+" Starship Altitude", "m", "km", curve.shipAlt, 0.001, curve.color, curve.colorName, curve.prefix+" Starship Altitude (km)")
            // this.xyChart.addCurve(curve.prefix+" Starship Air Speed", "m/s", "100's m/s", curve.shipSpeed, 0.01, curve.color, curve.colorName, curve.prefix+" Starship Air Speed (100's m/s)")
            this.xyChart.addCurve(curve.prefix+" Starship Altitude", "m", "km", curve.shipAlt, 0.001, tram.tab10Colors[2].hex, tram.tab10Colors[2].name, curve.prefix+" Starship Altitude (km)")
            this.xyChart.addCurve(curve.prefix+" Booster Altitude", "m", "km", curve.boostAlt, 0.001, tram.tab10Colors[0].hex, tram.tab10Colors[0].name, curve.prefix+" Booster Altitude (km)")
            this.xyChart.addCurve(curve.prefix+" Starship Air Speed", "m/s", "100's m/s", curve.shipSpeed, 0.01, tram.tab10Colors[3].hex, tram.tab10Colors[3].name, curve.prefix+" Starship Air Speed (100's m/s)")
            this.xyChart.addCurve(curve.prefix+" Booster Air Speed", "m/s", "100's m/s", curve.boostSpeed, 0.01, tram.tab10Colors[1].hex, tram.tab10Colors[1].name, curve.prefix+" Booster Air Speed (100's m/s)")

            const smoothedShipAlt = []
            let lastShipAlt = 0
            curve.shipAlt.forEach((entry, index) => {
              if (index == 0) {
                smoothedShipAlt.push(entry)
                lastShipAlt = entry.y
              }
              else if (entry.y != lastShipAlt) {
                smoothedShipAlt.push(entry)
                lastShipAlt = entry.y
              }
            })
            const regressionData = smoothedShipAlt.map(entry => [entry.x, entry.y/1000])
            this.shipAltRegression = regression.polynomial(regressionData, {order: 6, precision: 20})
            console.log(this.shipAltRegression)
            // smoothedShipAlt.length = 0
            // for (let t = 0; t < regressionData[regressionData.length-1][0]; t+=.1) {
            //   const y = this.shipAltRegression.predict(t)[1] * 1000
            //   smoothedShipAlt.push(new THREE.Vector3(t, y, 0))
            // }

            this.empiricalStarshipIFTSpeed = tram.interpolateCurve(curve.shipSpeed, 0.25)
            this.empiricalStarshipIFTAltitude = tram.interpolateCurve(smoothedShipAlt, 0.25)

            // this.xyChart.addCurve("Empirical Starship IFT Speed", "m/s", "100's m/s", this.empiricalStarshipIFTSpeed, 0.01, tram.tab10Colors[4].hex, tram.tab10Colors[4].name, "Empirical Starship IFT Speed (100's m/s)")
            this.xyChart.addCurve("Empirical Starship IFT Altitude", "m", "km", this.empiricalStarshipIFTAltitude, 0.001, tram.tab10Colors[5].hex, tram.tab10Colors[5].name, "Empirical Starship IFT Altitude (km)")
          })
        }

        // Create and add the launch vechicle models
        new launchVehicleModel(dParamWithUnits, this.scene, virtualLaunchVehicle.unallocatedModels, this.perfOptimizedThreeJS)
        this.update(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
        break
    }

  }

  updateReferenceFrames(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

    this.refFrames = []
    const numZones = this.numZones

    let rf0, rf1, rf2, rf3, rf4

    function addVirtualObjectToReferenceFrame(refFrames, refFrameIndex, objectClass) {
      refFrames[refFrameIndex].addVirtualObject(objectClass.className)
      objectClass.refFrames = [refFrames[refFrameIndex]]
    }

    switch (dParamWithUnits['launchTrajectorySelector'].value) {
      default:
        this.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
        // ToDo: We need another curve right before the mass driver curve for feeding the launch vehicles and sleds into the screws from
        this.polyCurveForrf0 = new SuperCurvePath()
        this.polyCurveForrf0.name = "massDriver2Path"
        this.polyCurveForrf0.add(this.massDriver1Curve)
        this.polyCurveForrf0.add(this.massDriver2Curve)
        this.polyCurveForrf0.updateArcLengths()
        this.polyCurveForrf0.subdivide(numZones)
        this.accelerationScrewLength = this.polyCurveForrf0.getLength()
        rf0 = new referenceFrame(this.polyCurveForrf0, numZones, this.cameraRange[0], 0, 0, 0, 'massDriver2RefFrame')

        this.polyCurveForrf1 = new SuperCurvePath()
        this.polyCurveForrf1.name = "adaptiveNutPath"
        this.polyCurveForrf1.add(this.feederRailCurve)
        this.polyCurveForrf1.add(this.massDriver1Curve)
        this.polyCurveForrf1.add(this.massDriver2Curve)
        this.polyCurveForrf1.add(this.launchRampCurve ? this.launchRampCurve[0] : null)
        this.polyCurveForrf1.updateArcLengths()
        this.polyCurveForrf1.subdivide(numZones)
        rf1 = new referenceFrame(this.polyCurveForrf1, numZones, this.cameraRange[1], 0, 0, 0, 'adaptiveNutRefFrame')

        this.polyCurveForrf2 = new SuperCurvePath()
        this.polyCurveForrf2.name = "launchSledPath"
        this.polyCurveForrf2.add(this.feederRailCurve)
        this.polyCurveForrf2.add(this.massDriver1Curve)
        this.polyCurveForrf2.add(this.massDriver2Curve)
        this.polyCurveForrf2.add(this.launchRampCurve ? this.launchRampCurve[1] : null)
        this.polyCurveForrf2.add(this.launchSledReturnCurve)
        this.polyCurveForrf2.updateArcLengths()
        this.polyCurveForrf2.subdivide(numZones)
        rf2 = new referenceFrame(this.polyCurveForrf2, numZones, this.cameraRange[1], 0, 0, 0, 'launchSledRefFrame')

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
        this.polyCurveForrf3.updateArcLengths()
        this.polyCurveForrf3.subdivide(numZones)
        rf3 = new referenceFrame(this.polyCurveForrf3, numZones, this.cameraRange[2], 0, 0, 0, 'launchVehicleInTubeRefFrame')

        this.polyCurveForrf4 = new SuperCurvePath()
        this.polyCurveForrf4.name = "launchVehiclePath"
        this.polyCurveForrf4.add(this.feederRailCurve)
        this.polyCurveForrf4.add(this.massDriver1Curve)
        this.polyCurveForrf4.add(this.massDriver2Curve)
        this.polyCurveForrf4.add(this.launchRampCurve ? this.launchRampCurve[1] : null)
        this.polyCurveForrf4.add(this.evacuatedTubeCurve)
        this.polyCurveForrf4.add(this.freeFlightPositionCurve)
        this.polyCurveForrf4.updateArcLengths()
        this.polyCurveForrf4.subdivide(numZones)
        rf4 = new referenceFrame(this.polyCurveForrf4, numZones, this.cameraRange[3], 0, 0, 0, 'launchVehicleRefFrame')

        this.launchTrajectoryLine = this.polyCurveForrf4
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

        this.refFrames.push(rf0, rf1, rf2, rf3, rf4)

        addVirtualObjectToReferenceFrame(this.refFrames, 4, virtualLaunchVehicle)
        virtualLaunchVehicle.updateParameters = [dParamWithUnits, planetSpec]
        virtualLaunchVehicle.tearDownParameters = [dParamWithUnits]
        virtualLaunchVehicle.addObjectsParameters = []
        addVirtualObjectToReferenceFrame(this.refFrames, 2, virtualLaunchSled)
        virtualLaunchSled.updateParameters = [dParamWithUnits]
        virtualLaunchSled.tearDownParameters = [dParamWithUnits]
        virtualLaunchSled.addObjectsParameters = []
        addVirtualObjectToReferenceFrame(this.refFrames, 1, virtualAdaptiveNut)
        virtualAdaptiveNut.updateParameters = [dParamWithUnits, this.accelerationScrewLength, this.scene, this.clock]
        virtualAdaptiveNut.tearDownParameters = [dParamWithUnits]
        virtualAdaptiveNut.addObjectsParameters = []
        addVirtualObjectToReferenceFrame(this.refFrames, 0, virtualMassDriverBracket)
        virtualMassDriverBracket.updateParameters = [dParamWithUnits, this.massDriverAccelerationScrewSegments, this.accelerationScrewLength, this.versionNumber]
        virtualMassDriverBracket.tearDownParameters = [dParamWithUnits, this.massDriverAccelerationScrewSegments]
        virtualMassDriverBracket.addObjectsParameters = []
        addVirtualObjectToReferenceFrame(this.refFrames, 0, virtualMassDriverScrew)
        virtualMassDriverScrew.updateParameters = [dParamWithUnits, this.accelerationScrewLength, this.massDriverAccelerationScrewSegments, this.accelerationScrewLength, this.massDriverScrewMaterials, this.versionNumber]
        virtualMassDriverScrew.tearDownParameters = [dParamWithUnits, this.massDriverAccelerationScrewSegments]
        virtualMassDriverScrew.addObjectsParameters = []
        addVirtualObjectToReferenceFrame(this.refFrames, 2, virtualMassDriverRail)
        virtualMassDriverRail.updateParameters = [dParamWithUnits, this.versionNumber]
        virtualMassDriverRail.tearDownParameters = [dParamWithUnits]
        virtualMassDriverRail.addObjectsParameters = [this.scene, this.railModelObject, this.massDriverRailMaterials]
        addVirtualObjectToReferenceFrame(this.refFrames, 3, virtualMassDriverTube)
        virtualMassDriverTube.updateParameters = [dParamWithUnits, this.versionNumber]
        virtualMassDriverTube.tearDownParameters = [dParamWithUnits]
        virtualMassDriverTube.addObjectsParameters = [this.scene, this.tubeModelObject]

        this.refFrames.forEach(refFrame => {
          refFrame.initialize()
        })

        this.refFrames.forEach(refFrame => {
          // ToDo: We should detect whether we need to call update - this is a potentially time consuming operation
          refFrame.update()
          refFrame.timeSinceStart = timeSinceStart
        })

        this.objectClasses = [virtualMassDriverTube, virtualMassDriverRail, virtualMassDriverBracket, virtualMassDriverScrew, virtualAdaptiveNut, virtualLaunchSled, virtualLaunchVehicle]
        this.virtualMassDriverTube = virtualMassDriverTube
        break
      case 1:
        this.updateTrajectoryCurvesRocket(dParamWithUnits, planetSpec)

        // ToDo: We need another curve right before the mass driver curve for feeding the launch vehicles and sleds into the screws from
        this.polyCurveForrf0 = new SuperCurvePath()
        this.polyCurveForrf0.name = "freeFlightCurve"
        this.polyCurveForrf0.add(this.freeFlightPositionCurve)
        this.polyCurveForrf0.updateArcLengths()
        this.polyCurveForrf0.subdivide(numZones)
        this.accelerationScrewLength = this.polyCurveForrf0.getLength()
        rf0 = new referenceFrame(this.polyCurveForrf0, numZones, this.cameraRange[3], 0, 0, 0, 'rocketLaunchRefFrame')

        this.launchTrajectoryLine = this.polyCurveForrf0

        this.refFrames.push(rf0)

        addVirtualObjectToReferenceFrame(this.refFrames, 0, virtualLaunchVehicle)
        virtualLaunchVehicle.updateParameters = [dParamWithUnits, planetSpec]
        virtualLaunchVehicle.tearDownParameters = [dParamWithUnits]
        virtualLaunchVehicle.addObjectsParameters = []

        this.refFrames.forEach(refFrame => {
          refFrame.initialize()
          refFrame.update()
          refFrame.timeSinceStart = timeSinceStart
        })

        this.objectClasses = [virtualLaunchVehicle]

        break
    }


    let maxNumZones = 0
    this.refFrames.forEach(refFrame => {
      maxNumZones = Math.max(maxNumZones, refFrame.numZones)
    })
    this.actionFlags = new Array(maxNumZones).fill(0)

  }

  update(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile) {

    this.versionNumber++

    this.planetRadius = tram.radiusAtLatitude(dParamWithUnits['launcherRampEndLatitude'].value*Math.PI/180, planetSpec.ellipsoid)

    switch (dParamWithUnits['launchTrajectorySelector'].value) {
      default:
        this.tubeModelObject.update(dParamWithUnits)
        this.railModelObject.update(dParamWithUnits)
        this.bracketModelObject.update(dParamWithUnits)
        break
      case 1:
        break
    }

    this.animateLaunchVehicles = dParamWithUnits['animateLaunchVehicles'].value ? 1 : 0
    this.animateLaunchSleds = dParamWithUnits['animateLaunchSleds'].value ? 1 : 0
    this.animateAdaptiveNuts = dParamWithUnits['animateAdaptiveNuts'].value ? 1 : 0
    this.animateElevatedEvacuatedTubeDeployment = dParamWithUnits['animateElevatedEvacuatedTubeDeployment'].value
    this.lastElevatedEvacuatedTubeDeploymentAlpha = -1
    this.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    this.showMarkers = dParamWithUnits['showMarkers'].value

    switch (dParamWithUnits['launchTrajectorySelector'].value) {
      default:
        this.refFramesChanged = this.trajectoryCurvesParametersHaveChanged(dParamWithUnits, this.previousTrajectoryCurvesParameters)
        break
      case 1:
        this.refFramesChanged = true
        break
    }
    
    this.objectClasses.forEach(virtualObject => {
      const changeOccured = this.refFramesChanged || virtualObject.isTeardownRequired(...virtualObject.tearDownParameters)
      if (changeOccured) {
        if (virtualObject.numObjects>0) {
          this.removeOldVirtualObjects(this.scene, virtualObject.refFrames, virtualObject.className)
          // if (!virtualObject.modelsAreRecyleable) {
          //   // Get rid of the old models since they can't be reused
          //   virtualObject.unallocatedModels.forEach(model => {
          //     model.traverse(child=> {
          //       if (child.isMesh) child.geometry.dispose()
          //     })
          //     model = null
          //   })
          //   virtualObject.unallocatedModels.splice(0, virtualObject.unallocatedModels.length)
          // }
        }
      }
    })

    if (this.refFramesChanged) {
      this.updateReferenceFrames(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
    }

    this.objectClasses.forEach(virtualObject => {
      const changeOccured = this.refFramesChanged || virtualObject.isTeardownRequired(...virtualObject.tearDownParameters)
      virtualObject.update(...virtualObject.updateParameters)
      if (changeOccured) {
        if (virtualObject.numObjects>0) {
          // console.log('Adding ' + virtualObject.className)
          virtualObject.hasChanged = true
          virtualObject.addNewVirtualObjects(virtualObject.refFrames, ...virtualObject.addObjectsParameters)
        }
      }
    })
    
    // Update launch trajectory markers
    this.launchTrajectoryWhiteMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryRedMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryGreenMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryBlueMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryOrangeMarker.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryMarker5.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value
    this.launchTrajectoryMarker6.visible = dParamWithUnits['showLaunchTrajectory'].value && dParamWithUnits['showMarkers'].value

    // Update 2D chart
    this.xyChart.visible = dParamWithUnits['showXYChart'].value

  }

  removeOldVirtualObjects(scene, refFrames, objectName) {
    // let count1 = 0
    // let count2 = 0
    refFrames.forEach(refFrame => {
      for (let zoneIndex = 0; zoneIndex < refFrame.wedges.length; zoneIndex++) {
        if (objectName in refFrame.wedges[zoneIndex]) {
          const wedgeList = refFrame.wedges[zoneIndex][objectName]
          wedgeList.forEach(vobj => {
            if (vobj.model) {
              vobj.model.visible = false
              vobj.constructor.unallocatedModels.push(vobj.model)
              scene.remove(vobj.model)
              // count1++
            }
            // count2++
          })
          wedgeList.splice(0, wedgeList.length)
        }
        else {
          // This isn't actually an error condition since we may not have any objects of this type in this wedge.
          // console.log('Error: ' + objectName + ' not found in wedge ' + zoneIndex + ' of refFrame ' + refFrame.name)
        }
      }
      // console.log('Removed ' + count1 + ' ' + objectName + ' objects from ', refFrame.name)
      // console.log('Removed ' + count2 + ' ' + objectName + ' virtual objects from ', refFrame.name)
    })

  }

  drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys) {

    const color = new THREE.Color()
    const launchTrajectoryPoints = []
    const launchTrajectoryColors = []
    const totalDuration = this.launchTrajectoryLine.getDuration()

    let prevVehiclePosition, currVehiclePosition
    
    let tStep = 1 // second
    let deltaT = 0
    let res, relevantCurve, i

    res = this.launchTrajectoryLine.findRelevantCurve(deltaT)
    relevantCurve = res.relevantCurve
    // d = Math.max(0, Math.min(1, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength))
    i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
    const refPosition = relevantCurve.getPoint(i)

    res = this.launchTrajectoryLine.findRelevantCurve(deltaT)
    relevantCurve = res.relevantCurve
    i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
    prevVehiclePosition = relevantCurve.getPoint(i).sub(refPosition)

    deltaT += tStep

    for (; deltaT < totalDuration; deltaT += tStep) {
      res = this.launchTrajectoryLine.findRelevantCurve(deltaT)
      relevantCurve = res.relevantCurve
      //d = Math.max(0, Math.min(1, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength))
      //const i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
      //const t = deltaT - res.relevantCurveStartTime
      const d = Math.max(0, Math.min(1, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength))
      try {
        //currVehiclePosition = relevantCurve.getPoint(t).sub(refPosition)
        currVehiclePosition = relevantCurve.getPointAt(d).sub(refPosition)
        // console.log('Vehicle Altitude', currVehiclePosition.length())
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
        color.setHSL(0.0, 0.8, 0.7 )
      }
      else {
        color.setHSL(0.35, 0.8, 0.3 )
      }
      launchTrajectoryColors.push(color.r, color.g, color.b)
      launchTrajectoryColors.push(color.r, color.g, color.b)
    }

    // launchTrajectoryPoints.forEach(point => {
    //   console.log('launchTrajectoryPoints', point.length())
    // })

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
launcher.prototype.removeOldMassDriverTubes = LauncherAnimate.defineRemoveOldMassDriverTubes()
launcher.prototype.generateNewMassDriverTubes = LauncherAnimate.defineGenerateNewMassDriverTubes()
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

