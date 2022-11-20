import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

//import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'

class referenceFrame {
  constructor(numWedges) {
    this.timeSinceStart = 0
    this.startWedgeIndex = -1
    this.finishWedgeIndex = -1
    this.prevStartWedgeIndex = -1
    this.prevFinishWedgeIndex = -1
    const makePlaceHolderEntry = () => ({
      'virtualLaunchTubes': [],
      'virtualLaunchVehicles': []
    })
    this.wedges = new Array(numWedges).fill().map( makePlaceHolderEntry )
  }
}
class launchVehicleModel {
  constructor(dParamWithUnits) {
    // Manually Create the Launch Vehicle

    const lengthSegments = 2
    const radius = dParamWithUnits['launchVehicleRadius'].value
    const radialSegments = 32
    const bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    const noseConeLength = dParamWithUnits['launchVehicleNoseConeLength'].value
    const engineLength = bodyLength * 1.5

    // Create the vehicle's body
    const launchVehicleBodyGeometry = new THREE.CylinderGeometry(radius, radius, bodyLength, radialSegments, lengthSegments, false)
    launchVehicleBodyGeometry.name = "body"
    // Create the nose cone
    const launchVehicleNoseConeGeometry = new THREE.CylinderGeometry(0, radius, noseConeLength, radialSegments, lengthSegments, true)
    launchVehicleNoseConeGeometry.name = "noseCone"
    launchVehicleNoseConeGeometry.translate(0, (bodyLength+noseConeLength)/2, 0)
    // Create the vehicle's engine
    const launchVehicleFlameGeometry = new THREE.CylinderGeometry(radius*.9, radius*0.4, engineLength, radialSegments, lengthSegments, false)
    launchVehicleFlameGeometry.name = "rocketEngine"
    launchVehicleFlameGeometry.translate(0, -(bodyLength+engineLength)/2, 0)

    // Merge the nosecone into the body
    const launchVehicleGeometry = BufferGeometryUtils.mergeBufferGeometries([launchVehicleBodyGeometry, launchVehicleNoseConeGeometry])

    const launchVehicleMaterial = new THREE.MeshPhongMaterial( {color: 0x7f3f00})
    const launchVehicleFlameMaterial = new THREE.MeshPhongMaterial( {color: 0x000000, emissive: 0xdfa0df, emissiveIntensity: 1.25, transparent: true, opacity: 0.5})
    const launchVehicleBodyMesh = new THREE.Mesh(launchVehicleGeometry, launchVehicleMaterial)
    launchVehicleBodyMesh.name = 'body'
    const launchVehicleFlameMesh = new THREE.Mesh(launchVehicleFlameGeometry, launchVehicleFlameMaterial)
    launchVehicleFlameMesh.name = 'flame'
    const launchVehiclePointLightMesh = new THREE.Points(
      new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [0, 0, 0], 3) ),
      new THREE.PointsMaterial( { color: 0xFFFFFF } ) )
    launchVehiclePointLightMesh.name = 'pointLight'
    const launchVehicleMesh = new THREE.Group().add(launchVehicleBodyMesh).add(launchVehicleFlameMesh)
    launchVehiclePointLightMesh.visible = dParamWithUnits['showLaunchVehiclePointLight'].value
    launchVehicleMesh.add(launchVehiclePointLightMesh)
    return launchVehicleMesh
  }
}
class virtualLaunchVehicle {
  constructor(timeLaunched, unallocatedModelsArray) {
    // The virtual vehicle has a position along the launch trajectory curve.
    // 0 represents the beginning of the mass driver, 1 represents 't==launchTrajectoryCurveDuration'
    this.timeLaunched = timeLaunched
    this.unallocatedModels = unallocatedModelsArray
  }

  // The following properties are common to all virtual vehicles...
  static launchTrajectoryCurve
  static launchTrajectoryCurveDuration
  //static launchVehicleRelativePosition_r = []
  //static launchVehicleRelativePosition_y = []
  static currentEquivalentLatitude
  static isVisible
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, launchTrajectoryCurve, launchTrajectoryCurveDuration, timeWithinMassDriver, timeWithinSuspendedEvacuatedTube) {
    virtualLaunchVehicle.launchTrajectoryCurve = launchTrajectoryCurve
    virtualLaunchVehicle.launchTrajectoryCurveDuration = launchTrajectoryCurveDuration
    virtualLaunchVehicle.timeInsideLaunchSystem = timeWithinMassDriver + timeWithinSuspendedEvacuatedTube
    const outwardOffset = dParamWithUnits['launcherOutwardOffset'].value
    const upwardOffset = dParamWithUnits['launcherUpwardOffset'].value
    //virtualLaunchVehicle.launchVehicleRelativePosition_r = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    //virtualLaunchVehicle.launchVehicleRelativePosition_y  = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    //virtualLaunchVehicle.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualLaunchVehicle.isVisible = dParamWithUnits['showLaunchVehicles'].value
    virtualLaunchVehicle.showLaunchVehiclePointLight = dParamWithUnits['showLaunchVehiclePointLight'].value
    virtualLaunchVehicle.slowDownTime = dParamWithUnits['launcherSlowDownTime'].value
    virtualLaunchVehicle.isDynamic =  true
    virtualLaunchVehicle.hasChanged = true
    //virtualLaunchVehicle.ringSouthernMostPosition = ringSouthernMostPosition
  }

  placeAndOrientModel(om, refFrame) {
    const modelsCurvePosition = (refFrame.timeSinceStart*virtualLaunchVehicle.slowDownTime - this.timeLaunched) / virtualLaunchVehicle.launchTrajectoryCurveDuration
    if (modelsCurvePosition==='undefined' || (modelsCurvePosition<0) || (modelsCurvePosition>1)) {
      console.log("error!!!")
    }
    else {
      const pointOnLaunchTrajectoryCurve = virtualLaunchVehicle.launchTrajectoryCurve.getPoint(modelsCurvePosition)
      const tangentToLaunchTrajectoryCurve = virtualLaunchVehicle.launchTrajectoryCurve.getTangent(modelsCurvePosition)
      om.position.set(
        pointOnLaunchTrajectoryCurve.x,
        pointOnLaunchTrajectoryCurve.y,
        pointOnLaunchTrajectoryCurve.z)
      const straightUpVector = new THREE.Vector3(0, 1, 0)
      const q = new THREE.Quaternion().setFromUnitVectors(straightUpVector, tangentToLaunchTrajectoryCurve)
      om.rotation.setFromQuaternion(q)
      om.visible = virtualLaunchVehicle.isVisible

      // Turn on the flame at the exit of the launch tube
      // ToDo: Using hard coded indicies for parts of teh model is not good for code maintainability - improve this but without degrading performance.
      if (refFrame.timeSinceStart*virtualLaunchVehicle.slowDownTime - this.timeLaunched > virtualLaunchVehicle.timeInsideLaunchSystem) {
        om.children[1].visible = true
      }
      else {
        om.children[1].visible = false
      }
      om.children[2].visible = virtualLaunchVehicle.showLaunchVehiclePointLight
      om.matrixValid = false
    }
  }
}

class launchTubeModel {
  constructor(dParamWithUnits, launchTrajectoryCurve) {
    // Manually create the launch tube
    function getLaunchTubeSegmentCurve() {
      const lengthSegments = 4
      const segmentNumber = 0
      const totalSegments = 16
      return launchTrajectoryCurve
    }

    const lengthSegments = 4
    const radius = dParamWithUnits['launcherTubeRadius'].value
    const radialSegments = 32
    const launchTubeGeometry = new THREE.TubeGeometry(getLaunchTubeSegmentCurve(), lengthSegments, radius, radialSegments, false)
    const launchTubeMaterial = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, transparent: true, opacity: 0.25})
    const launchTubeMesh = new THREE.Mesh(launchTubeGeometry, launchTubeMaterial)
    return launchTubeMesh
  }
}

export class launcher {

    constructor(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, radiusOfPlanet, mainRingCurve, crv, ringToPlanetRotation, specs) {
      this.const_G = 0.0000000000667408;

      // Possible User defined (e.g. if user changes the planet)
      this.const_g = 9.8;
      this.const_M = 5.9722E+24;
      this.mu = this.const_G * this.const_M;
      this.R_Earth = 6371000;

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
      // const greenMaterial = new THREE.MeshLambertMaterial({color: 0x005f00})
      // this.launcherExitMarker1 = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), greenMaterial)
      // const launcherExitMarkerSize = 3000
      // this.launcherExitMarker1.scale.set(launcherExitMarkerSize, launcherExitMarkerSize, launcherExitMarkerSize)
      // planetCoordSys.add(this.launcherExitMarker1)
      // this.launcherExitMarker2 = this.launcherExitMarker1.clone()
      // planetCoordSys.add(this.launcherExitMarker2)
      this.launchTrajectoryCurve = null
      this.launchTrajectoryCurveDuration = dParamWithUnits['launcherAccelerationTime'].value + dParamWithUnits['launcherCoastTime'].value
      this.launchTrajectoryMesh = null

      this.numWedges = 1
      this.unallocatedLaunchVehicleModels = []
      this.unallocatedLaunchTubeModels = []
      this.refFrames = [
        // For vehicles cruising at a steady speed...
        new referenceFrame(this.numWedges)
      ]
      this.actionFlags = new Array(this.numWedges).fill(0)
      this.perfOptimizedThreeJS = dParamWithUnits['perfOptimizedThreeJS'].value ? 1 : 0

      this.updateCurve(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, radiusOfPlanet, mainRingCurve, crv, ringToPlanetRotation, specs)

      // Next, create all of the virtual objects that will be placed along the launch trajectory curve
      
      // Add the virtual launch vehicles
      const tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
      let t, n
      // Put all of the launch vehicles into the same wedge for now
      let wedgeIndex = 0
      const refFrame = this.refFrames[0]
      for (t = 0, n = 0; t<this.launchTrajectoryCurveDuration; t += tInc, n++) {
        refFrame.wedges[wedgeIndex]['virtualLaunchVehicles'].push(new virtualLaunchVehicle(-t, this.unallocatedLaunchVehicleModels))
      }

      // Create and add the launch vechicle models
      const launchVehicleMesh = new launchVehicleModel(dParamWithUnits)
      // n = dParamWithUnits['launchVehicleNumModels'].value
      addLaunchVehicles(launchVehicleMesh, this.scene, this.unallocatedLaunchVehicleModels, 'launchVehicle',  1, n, this.perfOptimizedThreeJS)

      function addLaunchVehicles(object, myScene, unallocatedModelsList, objName, scaleFactor, n, perfOptimizedThreeJS) {
        object.updateMatrixWorld()
        object.visible = false
        object.name = objName
        object.traverse(child => {
          if (child!==object) {
            child.name = objName+'_'+child.name
          }
        })
        if (perfOptimizedThreeJS) object.children.forEach(child => child.freeze())
        object.scale.set(scaleFactor, scaleFactor, scaleFactor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          unallocatedModelsList.push(tempModel)
        }
      }

      // Create and add the launch tube models
      const launchTubeMesh = new launchTubeModel(dParamWithUnits, this.launchTrajectoryCurve)
      addLaunchTubes(launchTubeMesh, this.scene, this.unallocatedLaunchTubeModels, 'launcherTube', 1, dParamWithUnits['launcherTubeNumModels'].value, this.perfOptimizedThreeJS)

      function addLaunchTubes(object, myScene, unallocatedModelsList, objName, scaleFactor, n, perfOptimizedThreeJS) {
        object.updateMatrixWorld()
        object.visible = false
        object.name = objName
        object.traverse(child => {
          if (child!==object) {
            child.name = objName+'_'+child.name
          }
        })
        if (perfOptimizedThreeJS) object.children.forEach(child => child.freeze())
        object.scale.set(scaleFactor, scaleFactor, scaleFactor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          unallocatedModelsList.push(tempModel)
        }
      }

    }

    updateCurve(dParamWithUnits, planetCoordSys, tetheredRingRefCoordSys, radiusOfPlanet, mainRingCurve, crv, ringToPlanetRotation, specs) {
      // The goal is to position the suspended portion of the evacuated launch tube under the tethered ring's tethers. The portion of the launch tube that contains the mass driver will be on the planet's surface.
      // Let's start by defining the sothern most point on the ring as the end of the mass driver. Then we can create a curve that initially follows the surface of the Earth and then, from the end of teh mass driver,
      // follows a hyperbolic trajectory away from the earth.
    
      // Let's define the end of the mass driver as the launcher's exit position, since from that point on the vehicles will be coasting. 
      const launcherExitPositionAroundRing = dParamWithUnits['launcherExitPositionAroundRing'].value
      const massDriverExitPosition = mainRingCurve.getPoint(launcherExitPositionAroundRing)
      // Adjust the position to place the exit position on the earth's surface
      massDriverExitPosition.multiplyScalar(radiusOfPlanet / (radiusOfPlanet + crv.currentMainRingAltitude))
      // Convert the position into the planet's coordinate system 
      const massDriverExitPosition2 = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(massDriverExitPosition.clone()))
      //this.launcherExitMarker1.position.copy(massDriverExitPosition2)

      // We also need to find another point downrange of the mass driver that is at the altitiude of the ring, and we need this point to be just under the ring,
      // so that the ring and its tetheres can support the lightweight evacuated tube that the launched vehicles will coast through.
      const R0 = new THREE.Vector2(radiusOfPlanet, 0)  // This is the vehicle's altitude (measured from the plantet's center) and downrange position at the exit of the launcher
      const V0 = new THREE.Vector2(0, dParamWithUnits['launcherExitVelocity'].value) // This is the vehicle's velocity vector at the exit of the launcher

      // We want to find the downrange distance where the vehicle's altitude is equal to the desired launchTube exit altitude. We solve for this iteratively, although there's probably a better way...
      let t = 0
      let tStep = 1 // second
      let RV, distSquared 
      const ringDistSquared = (radiusOfPlanet + crv.currentMainRingAltitude + dParamWithUnits['launcherEvacuatedTubeExitUpwardOffset'].value)**2
      for (t = 0; Math.abs(tStep)>0.01; t+=tStep) {
        RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t)
        distSquared = RV.R.x**2 + RV.R.y**2
        if ((distSquared < ringDistSquared) ^ (tStep>0)) {
          tStep = -tStep/2
        }
      }
      this.timeWithinSuspendedEvacuatedTube = t

      const downRangeAngle = Math.atan2(RV.R.y, RV.R.x)
      const downRangeStraightLineDistance = 2 * radiusOfPlanet * Math.sin(downRangeAngle/2)
      const mainRingProjectionRadius = radiusOfPlanet * crv.mainRingRadius / (radiusOfPlanet + crv.currentMainRingAltitude)
      const aroundTheRingAngle = 2 * Math.asin(downRangeStraightLineDistance / 2 / mainRingProjectionRadius)
      // Assume that the ring is circular for now
      const launcherEvacuatedTubeExitPosition = mainRingCurve.getPoint(launcherExitPositionAroundRing - aroundTheRingAngle/(2*Math.PI))
      //launcherEvacuatedTubeExitPosition.multiplyScalar(radiusOfPlanet / (radiusOfPlanet + crv.currentMainRingAltitude))
      // Convert to the planet's coordinate system
      const launcherEvacuatedTubeExitPosition2 = planetCoordSys.worldToLocal(tetheredRingRefCoordSys.localToWorld(launcherEvacuatedTubeExitPosition.clone()))
      // this.launcherExitMarker2.position.copy(launcherEvacuatedTubeExitPosition2)
      // this.launcherExitMarker2.scale.set(100, 100, 100)
      // console.log(Math.sqrt(distSquared) - radiusOfPlanet, downRangeAngle * radiusOfPlanet)

      // Now we need to define a direction. We can use the cross product of the position and the planet's axis of rotation for this. 
      // const planetAxisOfRotation = new THREE.Vector3(0, 1, 0)
      // const ringAxisOfRotation = planetAxisOfRotation.applyQuaternion(ringToPlanetRotation)
      // const launcherExitDirection = new THREE.Vector3().crossVectors(ringAxisOfRotation, massDriverExitPosition2).normalize()
      // Draw and arrow to show the direction
      // const arrowHelper = new THREE.ArrowHelper(launcherExitDirection, massDriverExitPosition2, 1000000, 0x00ff00)
      // planetCoordSys.add(arrowHelper)
    
      // Next we need an axis of rotation to define the curvature of the mass driver
      const massDriverAxisOfRotation = new THREE.Vector3().crossVectors(massDriverExitPosition2, launcherEvacuatedTubeExitPosition2.clone().sub(massDriverExitPosition2)).normalize()
    
      const launcherAccelerationTime = dParamWithUnits['launcherExitVelocity'].value / dParamWithUnits['launcherAcceleration'].value
      specs['launcherAccelerationTime'] = {value: launcherAccelerationTime, units: 's'}
    
      const launchTrajectoryCurveControlPoints = []
      t = 0
      tStep = 1 // second
      let vehiclePosition
      // Create the part of the trajectory where the mass driver is at the planet's surface
      // Start the launch trajectory curve at the beginning of the mass driver.
      for (t = 0; t<dParamWithUnits['launcherAccelerationTime'].value; t+=tStep) {
        const distanceTravelled = 0.5 * dParamWithUnits['launcherAcceleration'].value * t * t   // 1/2 at^2
        // Rotate the massDriverExitPosition2 around the massDriverAxisOfRotation using the angle derived from the distance travelled
        vehiclePosition = massDriverExitPosition2.clone().applyAxisAngle(massDriverAxisOfRotation, (distanceTravelled - dParamWithUnits['launcherLength'].value) / radiusOfPlanet)
        launchTrajectoryCurveControlPoints.push(vehiclePosition)
      }
      this.timeWithinMassDriver = dParamWithUnits['launcherAccelerationTime'].value

      // Create the part of the trajectory where the vehicle coasts on a hyperbolic trajectory
      for (; t < dParamWithUnits['launcherAccelerationTime'].value + dParamWithUnits['launcherCoastTime'].value; t+=tStep) {
        const t2 = t - dParamWithUnits['launcherAccelerationTime'].value
        const RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, t2)
        const downRangeAngle = Math.atan2(RV.R.y, RV.R.x)
        vehiclePosition = massDriverExitPosition2.clone().applyAxisAngle(massDriverAxisOfRotation, downRangeAngle).multiplyScalar(RV.R.length() / radiusOfPlanet)
        launchTrajectoryCurveControlPoints.push(vehiclePosition)
        //console.log(RV, downRangeAngle, RV.R.length() / radiusOfPlanet)

        // We'll assume that the force of drag is offset by rocket thrust for now, so the following lines of unfinished code can be commented out
        // const currentAltitude = 32000
        // const airDensity = launcher.GetAirDensity(currentAltitude)
        // const vehicleVelocity = 8000  // ToDo
        // const vehicleCrossSectionalArea = Math.PI * dParamWithUnits['launchVehicleRadius'].value**2
        // const forceOfDrag = dParamWithUnits['launchVehicleCoefficientOfDrag'].value * airDensity * vehicleCrossSectionalArea * vehicleVelocity**2
        // const powerToOvercomeDrag = forceOfDrag * vehicleVelocity
      }

      this.launchTrajectoryCurve = new THREE.CatmullRomCurve3(launchTrajectoryCurveControlPoints)
      this.launchTrajectoryCurveDuration = t
      this.launchTrajectoryCurve.curveType = 'centripetal'
      this.launchTrajectoryCurve.closed = false
      this.launchTrajectoryCurve.tension = 0

      this.update(dParamWithUnits)
    }
    
    update(dParamWithUnits) {
      //virtualLaunchTube.update(dParamWithUnits, crv, mainRingCurve)
      virtualLaunchVehicle.update(dParamWithUnits, this.launchTrajectoryCurve, this.launchTrajectoryCurveDuration, this.timeWithinMassDriver, this.timeWithinSuspendedEvacuatedTube)
      this.animateLaunchVehicles = dParamWithUnits['animateLaunchVehicles'].value ? 1 : 0    
    }

    drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys) {
      let tStep = 1 // second
      let t = 0
      let prevVehiclePosition, currVehiclePosition
      
      prevVehiclePosition = this.launchTrajectoryCurve.getPoint(t / this.launchTrajectoryCurveDuration)
      t += tStep

      const color = new THREE.Color()
      const launchTrajectoryPoints = []
      const launchTrajectoryColors = []
      

      for (; t < dParamWithUnits['launcherAccelerationTime'].value + dParamWithUnits['launcherCoastTime'].value; t+=tStep) {
        currVehiclePosition = this.launchTrajectoryCurve.getPoint(t / this.launchTrajectoryCurveDuration)
        launchTrajectoryPoints.push(prevVehiclePosition)
        launchTrajectoryPoints.push(currVehiclePosition)
        prevVehiclePosition = currVehiclePosition.clone()
        // This code adds major thick hash marks to the line every 60 seconds, and thin hash marks every 10 seconds.
        color.setHSL(0.5 , 0.5, 1.0 * ((t%10==9) || (t%60==58)))
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

    animate(timeSinceStart) {
      // Move the virtual models of the launched vehicles along the launch trajectory
      let wedgeIndex
      const assignModelList = []
      const removeModelList = []
      const updateModelList = []
  
      this.unallocatedLaunchVehicleModels = []

      this.refFrames.forEach((refFrame, index) => {
        if (this.animateLaunchVehicles) {
          refFrame.timeSinceStart = timeSinceStart
        }
        const clearFlagsList = []
        //if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
        
        // Hack - We'll just scan all of the wedges for now
        refFrame.startWedgeIndex = 0
        refFrame.finishWedgeIndex = this.numWedges - 1
    
        // Set bit0 of actionFlags if wedge is currently visible
        if (refFrame.startWedgeIndex!=-1) {
          for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
            this.actionFlags[wedgeIndex] |= 1
            clearFlagsList.push(wedgeIndex)
            if (wedgeIndex == refFrame.finishWedgeIndex) break
          }
        }
        // Set bit1 of actionFlags if wedge was previously visible
        if (refFrame.prevStartWedgeIndex!=-1) {
          for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
            this.actionFlags[wedgeIndex] |= 2
            clearFlagsList.push(wedgeIndex)
            if (wedgeIndex == refFrame.prevFinishWedgeIndex) break
          }
        }
  
        if (refFrame.startWedgeIndex!=-1) {
          for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
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
          for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
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
        //   this.unallocatedLaunchTubeModels.length,
        //   this.unallocatedLaunchVehicleModels.length,
        // )
        //console.log('Removing ' + removeModelList.length)
      }
      if (assignModelList.length > 0) {
        // console.log(
        //   this.unallocatedLaunchTubeModels.length,
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
                if (object.unallocatedModels.length==1) {
                  // This is the last model. Duplicate it so that we don't run out.
                  const tempModel = object.unallocatedModels[0].clone()
                  object.unallocatedModels.push(tempModel)
                  this.scene.add(tempModel)
                  console.log('Duplicating model for ' + objectKey)
                }
                if (object.unallocatedModels.length>0) {
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
          if (objectValue.length>0) {
            const classIsDynamic = objectValue[0].constructor.isDynamic
            const classHasChanged = objectValue[0].constructor.hasChanged
            if (true || classIsDynamic || classHasChanged) {
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
        //   this.unallocatedLaunchTubeModels.length,
        //   this.unallocatedLaunchVehicleModels.length,
        // )
      }
      if (assignModelList.length > 0) {
        // console.log(
        //   this.unallocatedLaunchTubeModels.length,
        //   this.unallocatedLaunchVehicleModels.length,
        // )
      }
  
      // Clear all of the "hasChanged" flags
      //virtualLaunchTube.hasChanged = false
      virtualLaunchVehicle.hasChanged = false
  
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
}