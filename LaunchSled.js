import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { SledGrapplerPlacementInfo, SledGrapplerGeometry } from './SledGrapplerGeometry.js'
import * as tram from './tram.js'

export class launchSledModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, perfOptimizedThreeJS, massDriverSuperCurve, launcherMassDriverLength, massDriverScrewSegments, massDriverScrewTexture) {
    // Manually Create the Launch Vehicle
    const width = dParamWithUnits['launchSledWidth'].value
    const height = dParamWithUnits['launchSledHeight'].value
    const radialSegments = 32
    const bodyLength = dParamWithUnits['launchSledBodyLength'].value
    const numGrapplers = dParamWithUnits['launchSledNumGrapplers'].value
    const objName = 'launchSled'
    const launchSledNumModels = dParamWithUnits['launchSledNumModels'].value

    if (false) {
      // Proceedurally generate the Launch Sled's body (note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
      const launchSledBodyGeometry = new THREE.BoxGeometry(width, bodyLength, height, 1, 1, 1)
      launchSledBodyGeometry.translate(0, bodyLength/2, 0)
      const launchSledBodyMaterial = new THREE.MeshPhongMaterial( {color: 0x7f3f00})
      const launchSledBodyMesh = new THREE.Mesh(launchSledBodyGeometry, launchSledBodyMaterial)
      launchSledBodyMesh.name = 'body'
      const launchSledMesh = new THREE.Group().add(launchSledBodyMesh)
      addGrapplers(launchSledMesh)
      launchSledMesh.name = 'launchSled'
      const scaleFactor = 1
      decorateAndSave(launchSledMesh, myScene, unallocatedModelsList, objName, scaleFactor, launchSledNumModels, perfOptimizedThreeJS)
    }
    else {
      // Load the Launch Sled's Mesh from a model, but then proceedurally generate the grapplers
      function prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, scaleFactor, n, perfOptimizedThreeJS) {
        // This is the additional work we want to do later, after the loader get's around to loading our model...
        return function(object) {
            object.scale.set(scaleFactor*0.7, scaleFactor, scaleFactor)  // A bit hacky - Alastair's sled model is too wide
            object.name = 'body'
            object.children[0].material.color.setHex(0x2f1f50)
            const launchSledBodyMesh = object
            const launchSledMesh = new THREE.Group().add(launchSledBodyMesh)
            addGrapplers(launchSledMesh)
            decorateAndSave(launchSledMesh, myScene, unallocatedModelsList, objName, 1, n, perfOptimizedThreeJS)
            return launchSledMesh
        }
      }

      const loader = new OBJLoader();

      const scaleFactor = 0.001 // Because Alastair's launch sled model used mm instead of meters
      const addLaunchSleds = prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, scaleFactor, launchSledNumModels, perfOptimizedThreeJS)
      
      loader.load('models/launchSled.obj',
        // called when resource is loaded
        addLaunchSleds,
        // called when loading is in progresses
        function ( xhr ) {
            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' )
        },
        // called when loading has errors
        function ( error ) {console.log( 'Error loading launch sled model')}
      )
    }

    function addGrapplers(launchSledMesh) {
      // Create the sled's grapplers
      const distanceToSledAft = 0
      const firstGrapplerDistance = 0
      const lastGrapplerDistance = bodyLength
      const grapplerSpacing = 1.0 / numGrapplers * bodyLength
      
      for (let i = 0, grapplerDistance = firstGrapplerDistance; grapplerDistance<lastGrapplerDistance; i++, grapplerDistance += grapplerSpacing) {
        const launchSledGrapplerMesh = createSledGrapplerMesh(dParamWithUnits, distanceToSledAft, bodyLength, grapplerDistance, massDriverScrewTexture)
        launchSledGrapplerMesh.name = 'leftGrappler'
        launchSledGrapplerMesh.userData = i
        launchSledMesh.add(launchSledGrapplerMesh.clone())
        launchSledGrapplerMesh.name = 'rightGrappler'
        launchSledGrapplerMesh.userData = i
        launchSledGrapplerMesh.scale.set(-1, 1, 1)
        launchSledMesh.add(launchSledGrapplerMesh.clone())
      }
    }

    function createSledGrapplerMesh(dParamWithUnits, distanceToSledAft, bodyLength, grapplerDistance, massDriverScrewTexture) {
      // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
      // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
      // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
      // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
      const shaftRadius = dParamWithUnits['launcherMassDriverScrewShaftRadius'].value
      const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      const threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      const launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
      const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
      const launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
      const initialDistance = dParamWithUnits['launchSledBodyLength'].value / 2
      const numGrapplers = dParamWithUnits['launchSledNumGrapplers'].value
      const magnetThickness = dParamWithUnits['launchSledGrapplerMagnetThickness'].value
      const betweenGrapplerFactor = dParamWithUnits['launchSledBetweenGrapplerFactor'].value
      const shaftToGrapplerPad = dParamWithUnits['launchSledShaftToGrapplerPad'].value
      const additionalRotation = 0
    
      const info = new SledGrapplerPlacementInfo(
        shaftRadius,
        threadRadius,
        threadThickness,
        threadStarts,
        launcherMassDriverScrewRevolutionsPerSecond,
        launcherMassDriverForwardAcceleration,
        launcherMassDriverInitialVelocity,
        initialDistance,
        distanceToSledAft,
        bodyLength,
        numGrapplers,
        magnetThickness,
        betweenGrapplerFactor,
        shaftToGrapplerPad,
        additionalRotation
      )
      info.generatePlacementInfo(grapplerDistance)
    
      const sledGrapplerGeometry = new SledGrapplerGeometry(
        shaftRadius,
        threadRadius,
        threadThickness,
        threadStarts,
        launcherMassDriverScrewRevolutionsPerSecond,
        launcherMassDriverForwardAcceleration,
        launcherMassDriverInitialVelocity,
        initialDistance,
        distanceToSledAft,
        bodyLength,
        numGrapplers,
        magnetThickness,
        betweenGrapplerFactor,
        shaftToGrapplerPad,
        additionalRotation,
        grapplerDistance,
        info.offset
      )
    
      const sledGrapplerMaterial = new THREE.MeshPhongMaterial({wireframe: false, color: 0x3f7f3f})
      //const sledGrapplerMaterial = new THREE.MeshStandardMaterial({map: massDriverScrewTexture})
      return new THREE.Mesh(sledGrapplerGeometry, sledGrapplerMaterial)
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

export class virtualLaunchSled {
    constructor(timeLaunched, unallocatedModelsArray) {
        // The virtual vehicle has a position along the launch trajectory curve.
        // 0 represents the begginning of the mass driver, 1 represents 't==durationOfLaunchTrajectory'
        this.timeLaunched = timeLaunched
        this.unallocatedModels = unallocatedModelsArray
        this.model = null
    }
  
    static update(dParamWithUnits, launcherMassDriverLength, scene, clock) {
      virtualLaunchSled.clock = clock
      virtualLaunchSled.updatePeriod = .5  // seconds
  
      virtualLaunchSled.timeOfLastUpdate = clock.getElapsedTime() - virtualLaunchSled.updatePeriod
      virtualLaunchSled.launcherMassDriverLength = launcherMassDriverLength
      virtualLaunchSled.launchSledBodyLength = dParamWithUnits['launchSledBodyLength'].value
      virtualLaunchSled.sidewaysOffset = dParamWithUnits['launchSledSidewaysOffset'].value
      virtualLaunchSled.upwardsOffset = dParamWithUnits['launchSledUpwardsOffset'].value
      virtualLaunchSled.forwardsOffset = dParamWithUnits['launchSledForwardsOffset'].value
      virtualLaunchSled.isVisible = dParamWithUnits['showLaunchSleds'].value
      virtualLaunchSled.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
      virtualLaunchSled.launchSledNumGrapplers = dParamWithUnits['launchSledNumGrapplers'].value
      virtualLaunchSled.magnetThickness = dParamWithUnits['launchSledGrapplerMagnetThickness'].value
      virtualLaunchSled.betweenGrapplerFactor = dParamWithUnits['launchSledBetweenGrapplerFactor'].value
      virtualLaunchSled.shaftToGrapplerPad = dParamWithUnits['launchSledShaftToGrapplerPad'].value
      virtualLaunchSled.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
      virtualLaunchSled.launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
      virtualLaunchSled.initialDistance = dParamWithUnits['launchSledBodyLength'].value / 2
  
      // Because the sled inferfaces with the screw, we need to obtains some screw parameters as well...
      virtualLaunchSled.screwRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
      virtualLaunchSled.launcherMassDriverScrewShaftRadius = dParamWithUnits['launcherMassDriverScrewShaftRadius'].value
      virtualLaunchSled.launcherMassDriverScrewThreadRadius =  dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      virtualLaunchSled.launcherMassDriverScrewThreadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      virtualLaunchSled.launcherMassDriverScrewThreadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      virtualLaunchSled.launcherMassDriverScrewSidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
      virtualLaunchSled.launcherMassDriverScrewUpwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
      virtualLaunchSled.padRActuation = virtualLaunchSled.launcherMassDriverScrewThreadRadius - virtualLaunchSled.launcherMassDriverScrewShaftRadius
      virtualLaunchSled.padLiftActuation = dParamWithUnits['launcherGrapplerPadLiftAwayDistance'].value
      
      virtualLaunchSled.isDynamic =  true
      virtualLaunchSled.hasChanged = true
      virtualLaunchSled.scene = scene
    }
  
    placeAndOrientModel(om, refFrame) {
      if (virtualLaunchSled.isVisible) {
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchSled.slowDownPassageOfTime, refFrame.timeSinceStart)
        const deltaT = adjustedTimeSinceStart - this.timeLaunched
        const res = refFrame.curve.findRelevantCurve(deltaT)
        const relevantCurve = res.relevantCurve
        const distanceToSledAft = relevantCurve.tTod(deltaT - res.relevantCurveStartTime)
        const d = distanceToSledAft / res.relevantCurveLength

        const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
        const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

        const pointOnRelevantCurve = relevantCurve.getPointAt(d)
        const forward = relevantCurve.getTangentAt(d)
        const upward = relevantCurve.getNormalAt(d)
        const rightward = relevantCurve.getBinormalAt(d)
        const orientation = relevantCurve.getQuaternionAt(d, modelForward, modelUpward)

        const acceleration = virtualLaunchSled.launcherMassDriverForwardAcceleration
        const initialVelocity = virtualLaunchSled.launcherMassDriverInitialVelocity
        const initialDistance = virtualLaunchSled.initialDistance
        const bodyLength = virtualLaunchSled.launchSledBodyLength
  
        // Next we need to position the launch sled's legs so that they interface with the screws
        // First, working from the back of the launch sled towards the front, we need to virtually recreate the back face of the screw thread, but only the 
        // parts of the that back face that are within the reach of the launch sled's legs.
  
        const screwRevolutionsPerSecond = virtualLaunchSled.screwRevolutionsPerSecond
        const threadRadius = virtualLaunchSled.launcherMassDriverScrewThreadRadius
        const threadStarts = virtualLaunchSled.launcherMassDriverScrewThreadStarts
        const threadThickness = virtualLaunchSled.launcherMassDriverScrewThreadThickness
        const shaftRadius = virtualLaunchSled.launcherMassDriverScrewShaftRadius
        const upwardsOffset = virtualLaunchSled.upwardsOffset
        const screwSidewaysOffset = virtualLaunchSled.launcherMassDriverScrewSidewaysOffset
        const screwUpwardsOffset = virtualLaunchSled.launcherMassDriverScrewUpwardsOffset
        const numGrapplers = virtualLaunchSled.launchSledNumGrapplers
        const magnetThickness = virtualLaunchSled.magnetThickness
        const betweenGrapplerFactor = virtualLaunchSled.betweenGrapplerFactor
        const shaftToGrapplerPad = virtualLaunchSled.shaftToGrapplerPad
        const grapplersSidewaysOffset = screwSidewaysOffset
        const grapplerUpwardsOffset = screwUpwardsOffset
        const grapplerRadius = (shaftRadius + threadRadius)/2
  
        // Create a new screw geometry to represent the adaptive nut
        const additionalRotation = (deltaT * screwRevolutionsPerSecond) % 1
        const timeNow = virtualLaunchSled.clock.getElapsedTime()
        const updateNow = (timeNow>virtualLaunchSled.timeOfLastUpdate+virtualLaunchSled.updatePeriod)
        if (updateNow) {
          virtualLaunchSled.timeOfLastUpdate += virtualLaunchSled.updatePeriod
        }
  
        let grapplerGeometry = []
        let grapplerOffset = []
        let grapplerSwitchoverSignal = []
        let grapplerThreadPitch = []
  
        const firstGrapplerDistance =   0
        const lastGrapplerDistance = bodyLength
        const grapplerSpacing = 1.0 / numGrapplers * bodyLength
  
        const info = new SledGrapplerPlacementInfo(
          shaftRadius,
          threadRadius,
          threadThickness,
          threadStarts,
          screwRevolutionsPerSecond,
          acceleration,
          initialVelocity,
          initialDistance,
          distanceToSledAft,
          bodyLength,
          numGrapplers,
          magnetThickness,
          betweenGrapplerFactor,
          shaftToGrapplerPad,
          additionalRotation
        )
  
        for (let i = 0, grapplerDistance = firstGrapplerDistance; grapplerDistance<lastGrapplerDistance; i++, grapplerDistance += grapplerSpacing) {
          info.generatePlacementInfo(grapplerDistance)
          grapplerOffset[i] = info.offset
          grapplerSwitchoverSignal[i] = info.switchoverSignal
          grapplerThreadPitch[i] = info.threadPitch
          if (updateNow) {
            grapplerGeometry[i] = new SledGrapplerGeometry(
              shaftRadius,
              threadRadius,
              threadThickness,
              threadStarts,
              screwRevolutionsPerSecond,
              acceleration,
              initialVelocity,
              initialDistance,
              distanceToSledAft,
              bodyLength,
              numGrapplers,
              magnetThickness,
              betweenGrapplerFactor,
              shaftToGrapplerPad,
              additionalRotation,
              grapplerDistance,
              info.offset
            )
          }
        }
  
        om.children.forEach(child => {
          if (child.name=='launchSled_leftGrappler') {
            if (updateNow) {
              child.geometry.dispose()
              child.geometry = grapplerGeometry[child.userData]
            }
            const offset = grapplerOffset[child.userData]
            const switchoverSignal = (res.relevantCurveIndex==0) ? grapplerSwitchoverSignal[child.userData]: 1
            const threadPitch = grapplerThreadPitch[child.userData]
            const padRActuation = Math.max(0, Math.min(1, (switchoverSignal*4-1))) * virtualLaunchSled.padRActuation
            const padThetaFactor = 1 - Math.max(0, Math.min(1, (switchoverSignal*4-2)/2))
            const padLiftActuation = Math.min(1, switchoverSignal*4) * virtualLaunchSled.padLiftActuation
            const grapplerScrewAngle = Math.atan(threadPitch)
            const padLiftActuationThetaComponent = padLiftActuation * Math.sin(grapplerScrewAngle)
            const padLiftActuationYComponent = padLiftActuation * Math.cos(grapplerScrewAngle)
            const rOffset = offset.x + padRActuation
            const rawTheta = offset.z
            const thetaOffset = ((rawTheta + 3*Math.PI) % (2*Math.PI) - Math.PI) * padThetaFactor + padLiftActuationThetaComponent
            const xOffset = rOffset * -Math.sin(thetaOffset)
            const zOffset = rOffset * Math.cos(thetaOffset)
            const yOffset = offset.y - padLiftActuationYComponent
            child.position.copy(pointOnRelevantCurve)
              .add(rightward.clone().multiplyScalar(grapplersSidewaysOffset - xOffset)) // ToDo: This should be a parameter
              .add(upward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
              .add(forward.clone().multiplyScalar(yOffset))
            const combinedOrientation = orientation.clone() //.multiply(child.geometry.userData.orientation)
            child.setRotationFromQuaternion(combinedOrientation)
            child.rotateY(-thetaOffset)
          }
          else if (child.name=='launchSled_rightGrappler') {
            if (updateNow) {
              child.geometry.dispose()
              child.geometry = grapplerGeometry[child.userData]
            }
            const offset = grapplerOffset[child.userData]
            const switchoverSignal = (res.relevantCurveIndex==0) ? grapplerSwitchoverSignal[child.userData]: 1
            const threadPitch = grapplerThreadPitch[child.userData]
            const padRActuation = Math.max(0, Math.min(1, (switchoverSignal*4-1))) * virtualLaunchSled.padRActuation
            const padThetaFactor = 1 - Math.max(0, Math.min(1, (switchoverSignal*4-2)/2))
            const padLiftActuation = Math.min(1, switchoverSignal*4) * virtualLaunchSled.padLiftActuation
            const grapplerScrewAngle = Math.atan(threadPitch)
            const padLiftActuationThetaComponent = padLiftActuation * Math.sin(grapplerScrewAngle)
            const padLiftActuationYComponent = padLiftActuation * Math.cos(grapplerScrewAngle)
            const rOffset = offset.x + padRActuation
            const rawTheta = offset.z
            const thetaOffset = ((rawTheta + 3*Math.PI) % (2*Math.PI) - Math.PI) * padThetaFactor + padLiftActuationThetaComponent
            const xOffset = rOffset * -Math.sin(thetaOffset)
            const zOffset = rOffset * Math.cos(thetaOffset)
            const yOffset = offset.y - padLiftActuationYComponent
            // if (child.userData==0) {
            //   const plotTheta = Math.floor(thetaOffset/(2*Math.PI)*100)
            //   const printValue = Math.floor(thetaOffset/(2*Math.PI)*10000)/100
            //   console.log(' '.repeat(50+plotTheta)+'*'+'    '+printValue)
            // }
            child.position.copy(pointOnRelevantCurve)
              .add(rightward.clone().multiplyScalar(-grapplersSidewaysOffset + xOffset)) // ToDo: This should be a parameter
              .add(upward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
              .add(forward.clone().multiplyScalar(yOffset))
            const combinedOrientation = orientation.clone() //.multiply(child.geometry.userData.orientation)
            child.setRotationFromQuaternion(combinedOrientation)
            child.rotateY(thetaOffset)
          }
          else if (child.name=='launchSled_body') {
            child.position.copy(pointOnRelevantCurve)
              .add(rightward.clone().multiplyScalar(virtualLaunchSled.sidewaysOffset))
              .add(upward.clone().multiplyScalar(virtualLaunchSled.upwardsOffset))
              .add(forward.clone().multiplyScalar(virtualLaunchSled.forwardsOffset))
            child.setRotationFromQuaternion(orientation)
          }
          child.visible = true
        })
        om.matrixValid = false
      }
      om.visible = virtualLaunchSled.isVisible
    }
  }
  
  