import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FacesGeometry } from './FacesGeometry.js'
import * as tram from './tram.js'

export class launchVehicleModel {
    constructor(dParamWithUnits) {
        // Manually Create the Launch Vehicle

        const lengthSegments = 2
        const radius = dParamWithUnits['launchVehicleRadius'].value
        const radialSegments = 32
        const bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
        const noseConeLength = dParamWithUnits['launchVehicleNoseConeLength'].value
        const flameLength = bodyLength * 1.5

        // Create the vehicle's body
        const launchVehicleBodyGeometry = new THREE.CylinderGeometry(radius, radius, bodyLength, radialSegments, lengthSegments, false)
        launchVehicleBodyGeometry.name = "body"
        launchVehicleBodyGeometry.translate(0, bodyLength/2, 0)
        // Create the nose cone
        const launchVehicleNoseConeGeometry = new THREE.ConeGeometry(radius, noseConeLength, radialSegments, lengthSegments, true)
        launchVehicleNoseConeGeometry.name = "noseCone"
        launchVehicleNoseConeGeometry.translate(0, (bodyLength+noseConeLength)/2 + bodyLength/2, 0)
        // Create the fins
        const finLength = bodyLength * 0.5
        const finThickness = 0.2
        const finHeight = radius * 0.5
        const finVertices = [
            new THREE.Vector3(0, finLength, radius),   // Leading edge of fin
            new THREE.Vector3(finThickness/2, 0.1, radius),  // Left trailing edge of fin
            new THREE.Vector3(-finThickness/2, 0.1, radius),  // Right trailing edge of fin
            new THREE.Vector3(0, 0, radius+finHeight)  // Back trailing edge of fin
        ]
        const finIndices = [
            0, 1, 2,
            0, 2, 3,
            0, 3, 1,
            3, 2, 1
        ]
        const launchVehicleFin0Geometry = new FacesGeometry(finVertices, finIndices)

        launchVehicleFin0Geometry.name = "fin0"
        const launchVehicleFin1Geometry = launchVehicleFin0Geometry.clone()
        launchVehicleFin1Geometry.name = "fin1"
        launchVehicleFin1Geometry.rotateY(Math.PI*2/3)
        const launchVehicleFin2Geometry = launchVehicleFin0Geometry.clone()
        launchVehicleFin2Geometry.name = "fin2"
        launchVehicleFin2Geometry.rotateY(-Math.PI*2/3)

        // Create the vehicle's flame
        const launchVehicleFlameGeometry = new THREE.CylinderGeometry(radius*.9, radius*0.4, flameLength, radialSegments, lengthSegments, false)
        launchVehicleFlameGeometry.name = "rocketEngine"
        launchVehicleFlameGeometry.translate(0, -(bodyLength+flameLength)/2 + bodyLength/2, 0)

        // Merge the nosecone into the body
        const launchVehicleGeometry = BufferGeometryUtils.mergeBufferGeometries([launchVehicleBodyGeometry, launchVehicleNoseConeGeometry, launchVehicleFin0Geometry, launchVehicleFin1Geometry, launchVehicleFin2Geometry])

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
        launchVehicleMesh.name = 'launchVehicle'
        launchVehiclePointLightMesh.visible = dParamWithUnits['showLaunchVehiclePointLight'].value
        launchVehicleMesh.add(launchVehiclePointLightMesh)
        return launchVehicleMesh
    }
}
  

export class virtualLaunchVehicle {

    constructor(timeLaunched, unallocatedModelsArray) {
        // The virtual vehicle has a position along the launch trajectory curve.
        // 0 represents the beginning of the mass driver, 1 represents 't==durationOfLaunchTrajectory'
        this.timeLaunched = timeLaunched
        this.unallocatedModels = unallocatedModelsArray
        this.model = null
    }
    
    // The following properties are common to all virtual vehicles...
    static launchTrajectoryCurve
    static durationOfLaunchTrajectory
    //static launchVehicleRelativePosition_r = []
    //static launchVehicleRelativePosition_y = []
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged
    
    static update(dParamWithUnits, launchTrajectoryCurve, massDriverSuperCurve, launcherMassDriverLength, durationOfLaunchTrajectory, timeWithinMassDriver, curveUpTime, timeWithinEvacuatedTube) {
        virtualLaunchVehicle.launchTrajectoryCurve = launchTrajectoryCurve
        virtualLaunchVehicle.massDriverSuperCurve = massDriverSuperCurve
        virtualLaunchVehicle.launcherMassDriverLength = launcherMassDriverLength
    
        virtualLaunchVehicle.durationOfLaunchTrajectory = durationOfLaunchTrajectory
        virtualLaunchVehicle.timeInsideLaunchSystem = timeWithinMassDriver + curveUpTime + timeWithinEvacuatedTube
        //const outwardOffset = dParamWithUnits['launcherOutwardOffset'].value
        //const upwardOffset = dParamWithUnits['launcherUpwardOffset'].value
        //virtualLaunchVehicle.launchVehicleRelativePosition_r = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        //virtualLaunchVehicle.launchVehicleRelativePosition_y  = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        //virtualLaunchVehicle.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualLaunchVehicle.sidewaysOffset = dParamWithUnits['launchVehicleSidewaysOffset'].value
        virtualLaunchVehicle.upwardsOffset = dParamWithUnits['launchVehicleUpwardsOffset'].value
        virtualLaunchVehicle.bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
        virtualLaunchVehicle.isVisible = dParamWithUnits['showLaunchVehicles'].value
        virtualLaunchVehicle.showLaunchVehiclePointLight = dParamWithUnits['showLaunchVehiclePointLight'].value
        virtualLaunchVehicle.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
        virtualLaunchVehicle.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        virtualLaunchVehicle.launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
        virtualLaunchVehicle.isDynamic =  true
        virtualLaunchVehicle.hasChanged = true
        //virtualLaunchVehicle.ringSouthernMostPosition = ringSouthernMostPosition
    }
    
    placeAndOrientModel(om, refFrame) {
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchVehicle.slowDownPassageOfTime, refFrame.timeSinceStart)
        const deltaT = adjustedTimeSinceStart - this.timeLaunched
        const acceleration = virtualLaunchVehicle.launcherMassDriverForwardAcceleration
        const initialVelocity = virtualLaunchVehicle.launcherMassDriverInitialVelocity
        const distanceToVehicleAft = virtualLaunchVehicle.massDriverSuperCurve.tTod(deltaT, initialVelocity, acceleration)
        const bodyLength = virtualLaunchVehicle.bodyLength
        const d = distanceToVehicleAft / virtualLaunchVehicle.launcherMassDriverLength
        const pointOnMassDriverCurve = virtualLaunchVehicle.massDriverSuperCurve.getPointAt(d)
        const forward = virtualLaunchVehicle.massDriverSuperCurve.getTangentAt(d)
        const upward = virtualLaunchVehicle.massDriverSuperCurve.getNormalAt(d)
        const rightward = virtualLaunchVehicle.massDriverSuperCurve.getBinormalAt(d)
        const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
        const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
        const orientation = virtualLaunchVehicle.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
    
        om.position.copy(pointOnMassDriverCurve)
        .add(rightward.clone().multiplyScalar(virtualLaunchVehicle.sidewaysOffset))
        .add(upward.clone().multiplyScalar(virtualLaunchVehicle.upwardsOffset))
        om.setRotationFromQuaternion(orientation)
    
        om.visible = virtualLaunchVehicle.isVisible
    
        // Turn on the flame at the exit of the launch tube
        // ToDo: Using hard coded indicies for parts of the model is not good for code maintainability - improve this but without degrading performance.
        if (deltaT > virtualLaunchVehicle.timeInsideLaunchSystem) {
        om.children[1].visible = true
        }
        else {
        om.children[1].visible = false
        }
        om.children[2].visible = virtualLaunchVehicle.showLaunchVehiclePointLight
        om.matrixValid = false
    }

    getFuturePosition(refFrame, timeDeltaInSeconds) {
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchVehicle.slowDownPassageOfTime, refFrame.timeSinceStart + timeDeltaInSeconds)
        const deltaT = adjustedTimeSinceStart - this.timeLaunched
        const acceleration = virtualLaunchVehicle.launcherMassDriverForwardAcceleration
        const initialVelocity = virtualLaunchVehicle.launcherMassDriverInitialVelocity
        const distanceToVehicleAft = virtualLaunchVehicle.massDriverSuperCurve.tTod(deltaT, initialVelocity, acceleration)
        const bodyLength = virtualLaunchVehicle.bodyLength
        const d = distanceToVehicleAft / virtualLaunchVehicle.launcherMassDriverLength
        const pointOnMassDriverCurve = virtualLaunchVehicle.massDriverSuperCurve.getPointAt(d)
        return pointOnMassDriverCurve
    }
      
}
