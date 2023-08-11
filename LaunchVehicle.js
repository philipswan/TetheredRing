import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { FacesGeometry } from './FacesGeometry.js'
import * as tram from './tram.js'

export class launchVehicleModel {
    constructor(dParamWithUnits, myScene, unallocatedModelsList, perfOptimizedThreeJS) {
        const radius = dParamWithUnits['launchVehicleRadius'].value
        const bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
        const flameLength = bodyLength * 1.5
        const lengthSegments = 2
        const radialSegments = 32
        const noseConeLength = dParamWithUnits['launchVehicleNoseConeLength'].value
        const objName = 'launchVehicle'
        const launchVehicleNumModels = dParamWithUnits['launchVehicleNumModels'].value

        if (false) {
            // Proceedurally generate the Launch Vehicle body, flame, and point light meshes

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
            // Merge the nosecone into the body
            const launchVehicleGeometry = BufferGeometryUtils.mergeBufferGeometries([launchVehicleBodyGeometry, launchVehicleNoseConeGeometry, launchVehicleFin0Geometry, launchVehicleFin1Geometry, launchVehicleFin2Geometry], false)
            const launchVehicleMaterial = new THREE.MeshPhongMaterial( {color: 0x7f3f00})
            const launchVehicleBodyMesh = new THREE.Mesh(launchVehicleGeometry, launchVehicleMaterial)
            launchVehicleBodyMesh.name = 'body'

            const launchVehicleFlameMesh = makeFlame()
            const launchVehiclePointLightMesh = makePointLight()
            const launchVehicleMesh = assemble(launchVehicleBodyMesh, launchVehicleFlameMesh, launchVehiclePointLightMesh)
            const scaleFactor = 1
            decorateAndSave(launchVehicleMesh, myScene, unallocatedModelsList, objName, scaleFactor, launchVehicleNumModels, perfOptimizedThreeJS)
        }
        else {
            // Load the Launch Vehicle Body Mesh from a model, but then proceedurally generate and add the flame and point light 
            function prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, scaleFactor, n, perfOptimizedThreeJS) {
                // This is the additional work we want to do later, after the loader get's around to loading our model...
                return function(object) {
                    object.scale.set(scaleFactor, scaleFactor, scaleFactor)
                    object.name = 'body'
                    object.children[0].material.color.setHex(0xcfd4d9)
                    const launchVehicleBodyMesh = object
                    const launchVehicleFlameMesh = makeFlame()
                    const launchVehiclePointLightMesh = makePointLight()
                    const launchVehicleMesh = assemble(launchVehicleBodyMesh, launchVehicleFlameMesh, launchVehiclePointLightMesh)
                    decorateAndSave(launchVehicleMesh, myScene, unallocatedModelsList, objName, 1, n, perfOptimizedThreeJS)
                    return launchVehicleMesh
                }
            }
  
            //const loader = new FBXLoader();
            const loader = new OBJLoader();

            const scaleFactor = 0.001 // Because Alastair's launch vehicle model used mm instead of meters
            const addLaunchVehicles = prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, scaleFactor, launchVehicleNumModels, perfOptimizedThreeJS)
            
            loader.load('models/launchVehicle.obj',
                // called when resource is loaded
                addLaunchVehicles,
                // called when loading is in progresses
                function ( xhr ) {
                    console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' )
                },
                // called when loading has errors
                function ( error ) {console.log( 'Error loading launch vehicle model')}
            )
        }

        function makeFlame() {
            // Create the vehicle's flame
            const launchVehicleFlameGeometry = new THREE.CylinderGeometry(radius*.9, radius*0.4, flameLength, radialSegments, lengthSegments, false)
            launchVehicleFlameGeometry.name = "rocketEngine"
            launchVehicleFlameGeometry.translate(0, -(bodyLength+flameLength)/2 + bodyLength/2, 0)

            const launchVehicleFlameMaterial = new THREE.MeshPhongMaterial( {color: 0x000000, emissive: 0xdfa0df, emissiveIntensity: 1.25, transparent: true, opacity: 0.5})
            const launchVehicleFlameMesh = new THREE.Mesh(launchVehicleFlameGeometry, launchVehicleFlameMaterial)
            launchVehicleFlameMesh.name = 'flame'
            return launchVehicleFlameMesh
        }

        function makePointLight() {
            const launchVehiclePointLightMesh = new THREE.Points(
                new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [0, 0, 0], 3) ),
                new THREE.PointsMaterial( { color: 0xFFFFFF } ) )
            launchVehiclePointLightMesh.name = 'pointLight'
            return launchVehiclePointLightMesh
        }

        function assemble(launchVehicleBodyMesh, launchVehicleFlameMesh, launchVehiclePointLightMesh) {

            const launchVehicleMesh = new THREE.Group().add(launchVehicleBodyMesh).add(launchVehicleFlameMesh)
            launchVehicleMesh.name = 'launchVehicle'
            launchVehiclePointLightMesh.visible = dParamWithUnits['showLaunchVehiclePointLight'].value
            launchVehicleMesh.add(launchVehiclePointLightMesh)
            return launchVehicleMesh
        }

        function decorateAndSave(object, myScene, unallocatedModelsList, objName, scaleFactor, n, perfOptimizedThreeJS) {
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
}
  

export class virtualLaunchVehicle {

    constructor(timeLaunched, unallocatedModelsArray) {
        // The virtual vehicle has a position along the launch trajectory curve.
        this.timeLaunched = timeLaunched
        this.unallocatedModels = unallocatedModelsArray
        this.model = null
    }
    
    // The following properties are common to all virtual vehicles...
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged
    
    static update(
        dParamWithUnits,
        massDriverSuperCurve,
        launchRampSuperCurve,
        freeFlightSuperCurve,
        launcherMassDriverLength,
        timeWithinMassDriver,
        curveUpTime,
        launcherRampLength,
        timeWithinEvacuatedTube) {

        virtualLaunchVehicle.massDriverSuperCurve = massDriverSuperCurve
        virtualLaunchVehicle.launchRampSuperCurve = launchRampSuperCurve
        virtualLaunchVehicle.freeFlightSuperCurve = freeFlightSuperCurve
        virtualLaunchVehicle.launcherMassDriverLength = launcherMassDriverLength
        virtualLaunchVehicle.timeWithinMassDriver = timeWithinMassDriver
        virtualLaunchVehicle.curveUpTime = curveUpTime
        virtualLaunchVehicle.launcherRampLength = launcherRampLength
        virtualLaunchVehicle.timeWithinEvacuatedTube = timeWithinEvacuatedTube
    
        //const outwardOffset = dParamWithUnits['launcherOutwardOffset'].value
        //const upwardOffset = dParamWithUnits['launcherUpwardOffset'].value
        //virtualLaunchVehicle.launchVehicleRelativePosition_r = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        //virtualLaunchVehicle.launchVehicleRelativePosition_y  = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        //virtualLaunchVehicle.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualLaunchVehicle.sidewaysOffset = dParamWithUnits['launchVehicleSidewaysOffset'].value
        virtualLaunchVehicle.upwardsOffset = dParamWithUnits['launchVehicleUpwardsOffset'].value
        virtualLaunchVehicle.forwardsOffset = dParamWithUnits['launchVehicleForwardsOffset'].value
        virtualLaunchVehicle.bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
        virtualLaunchVehicle.isVisible = dParamWithUnits['showLaunchVehicles'].value
        virtualLaunchVehicle.showLaunchVehiclePointLight = dParamWithUnits['showLaunchVehiclePointLight'].value
        virtualLaunchVehicle.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
        virtualLaunchVehicle.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        virtualLaunchVehicle.launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
        virtualLaunchVehicle.launcherMassDriverExitVelocity = dParamWithUnits['launcherMassDriverExitVelocity'].value
        virtualLaunchVehicle.isDynamic =  true
        virtualLaunchVehicle.hasChanged = true
        //virtualLaunchVehicle.ringSouthernMostPosition = ringSouthernMostPosition
    }
    
    determineCurveAndD(deltaT) {
        // Figure out which curve we're on
        const t1 = virtualLaunchVehicle.timeWithinMassDriver
        const t2 = t1 + virtualLaunchVehicle.curveUpTime
        const t3 = t2 + virtualLaunchVehicle.timeWithinEvacuatedTube
        const t4 = t3 + virtualLaunchVehicle.timeInFreeFlight
        const onMassDriverSuperCurve = (deltaT <= t1)
        const onLaunchRampSuperCurve = ((deltaT > t1) && (deltaT <= t2))
        const onEvacuatedTubeCurve = ((deltaT > t2) && (deltaT <= t3))
        const onFreeFlightCurve = ((deltaT > t3) && (deltaT <= t4))
        let relevantCurve
        let d  // This is a distance-from-start fraction for the relevant curve

        if (onMassDriverSuperCurve) {
            relevantCurve = virtualLaunchVehicle.massDriverSuperCurve
            const acceleration = virtualLaunchVehicle.launcherMassDriverForwardAcceleration
            const initialVelocity = virtualLaunchVehicle.launcherMassDriverInitialVelocity
            const distanceToVehicleAft = relevantCurve.tTod(deltaT, initialVelocity, acceleration)
            d = distanceToVehicleAft / virtualLaunchVehicle.launcherMassDriverLength
        }
        else if (onLaunchRampSuperCurve) {
            relevantCurve = virtualLaunchVehicle.launchRampSuperCurve
            const initialVelocity = virtualLaunchVehicle.launcherMassDriverExitVelocity
            const distanceToVehicleAft = relevantCurve.tTod(deltaT - t1, initialVelocity)
            d = distanceToVehicleAft / virtualLaunchVehicle.launcherRampLength
        }
        // else if (onEvacuatedTubeCurve) {
        //     relevantCurve = virtualLaunchVehicle.evacuatdTubeSuperCurve
        //     const initialVelocity = virtualLaunchVehicle.launcherMassDriverExitVelocity
        //     const distanceToVehicleAft = relevantCurve.tTod(deltaT - t2, initialVelocity) // Hack - need proper parameters
        //     d = distanceToVehicleAft / virtualLaunchVehicle.launcherRampLength
        // }
        // else {
        //     // Assume that the vehicle is on the free flight curve
        //     relevantCurve = virtualLaunchVehicle.freeFlightSuperCurve
        //     const initialVelocity = virtualLaunchVehicle.launcherMassDriverExitVelocity
        //     const distanceToVehicleAft = relevantCurve.tTod(deltaT - t2, initialVelocity) // Hack - need proper parameters
        //     d = distanceToVehicleAft / virtualLaunchVehicle.launcherRampLength
        // }
        return {relevantCurve, d}
    }

    placeAndOrientModel(om, refFrame) {
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchVehicle.slowDownPassageOfTime, refFrame.timeSinceStart)
        const deltaT = adjustedTimeSinceStart - this.timeLaunched
        const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
        const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

        const res = this.determineCurveAndD(deltaT)
        const relevantCurve = res.relevantCurve
        const d = res.d

        const pointOnRelevantCurve = relevantCurve.getPointAt(d)
        const forward = relevantCurve.getTangentAt(d)
        const upward = relevantCurve.getNormalAt(d)
        const rightward = relevantCurve.getBinormalAt(d)
        const orientation = relevantCurve.getQuaternionAt(modelForward, modelUpward, d)
    
        om.position.copy(pointOnRelevantCurve)
            .add(rightward.clone().multiplyScalar(virtualLaunchVehicle.sidewaysOffset))
            .add(upward.clone().multiplyScalar(virtualLaunchVehicle.upwardsOffset))
            .add(forward.clone().multiplyScalar(virtualLaunchVehicle.forwardsOffset))
        om.setRotationFromQuaternion(orientation)
    
        om.visible = virtualLaunchVehicle.isVisible
    
        // Turn on the flame at the exit of the launch tube
        // ToDo: Using hard coded array indicies for parts of the model is not good for code maintainability - improve this but without degrading performance.
        const t1 = virtualLaunchVehicle.timeWithinMassDriver
        const t2 = t1 + virtualLaunchVehicle.curveUpTime
        const t3 = t2 + virtualLaunchVehicle.timeWithinEvacuatedTube
        om.children[1].visible = (deltaT > t3)
        om.children[2].visible = virtualLaunchVehicle.showLaunchVehiclePointLight
        om.matrixValid = false
    }

    getFuturePosition(refFrame, timeDeltaInSeconds) {
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchVehicle.slowDownPassageOfTime, refFrame.timeSinceStart + timeDeltaInSeconds)
        const deltaT = adjustedTimeSinceStart - this.timeLaunched

        const res = this.determineCurveAndD(deltaT)
        const relevantCurve = res.relevantCurve
        const d = res.d

        const pointOnRelevantCurve = relevantCurve.getPointAt(d)
        return pointOnRelevantCurve
    }
      
}
