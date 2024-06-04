import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { SledGrapplerPlacementInfo, SledGrapplerGeometry } from './SledGrapplerGeometry.js'
import * as tram from './tram.js'

export class launchSledModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, perfOptimizedThreeJS, massDriverScrewTexture) {
    // Manually Create the Launch Vehicle
    const width = dParamWithUnits['launchSledWidth'].value
    const height = dParamWithUnits['launchSledHeight'].value
    const radialSegments = 32
    const bodyLength = dParamWithUnits['launchSledBodyLength'].value
    const numGrapplers = dParamWithUnits['launchSledNumGrapplers'].value
    const objName = 'launchSled'
    const launchSledNumModels = dParamWithUnits['launchSledNumModels'].value
    const ballJointClearance = dParamWithUnits['launchSledGrapplerBallJointClearance'].value
    const ballJointRadius = dParamWithUnits['launchSledGrapplerBallJointRadius'].value

    // Proceedurally generate the Launch Sled's body (note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
    const launchSledBodyGeometry = new THREE.BoxGeometry(width, bodyLength, height, 1, 1, 1)
    launchSledBodyGeometry.translate(0, bodyLength/2, 0)
    const launchSledBodyMaterial = new THREE.MeshPhongMaterial( {color: 0x7f3f00})
    const launchSledBodyMesh = new THREE.Mesh(launchSledBodyGeometry, launchSledBodyMaterial)
    launchSledBodyMesh.name = 'body'
    const launchSledMesh = new THREE.Group().add(launchSledBodyMesh)
    addGrapplers(launchSledMesh)
    launchSledMesh.name = 'launchSled'
    const scaleFactorVector = new THREE.Vector3(
      dParamWithUnits['launchSystemRightwardScaleFactor'].value,
      dParamWithUnits['launchSystemForwardScaleFactor'].value,
      dParamWithUnits['launchSystemUpwardScaleFactor'].value)

    decorateAndSave(launchSledMesh, myScene, unallocatedModelsList, objName, scaleFactorVector, launchSledNumModels, perfOptimizedThreeJS)

    // Load the Launch Sled's Mesh from a model, but then proceedurally generate the grapplers
    function prepareACallbackFunctionForFBXLoader (myScene) {
      // This is the additional work we want to do later, after the loader get's around to loading our model...
      return function(object) {
        object.children[0].scale.set(0.6, 1, 2)  // A bit hacky - Alastair's sled model is too wide and thin
        object.children[0].position.set(0, 0, 1400) // reposition vertically after making the sled thicker
        object.scale.set(0.001, 0.001, 0.001)  // Correct for units - mm to m
        object.name = 'launchSled_bodyFromModel'
        object.children[0].material.color.setHex(0x2f1f50)
        myScene.traverse(child=> {
          if (child.name=='launchSled_body') {
            const parent = child.parent
            parent.remove(child)
            parent.add(object.clone())
          }
        })
        unallocatedModelsList.forEach(element => {
          element.traverse(child => {
            if (child.name==='launchSled_body') {
              const parent = child.parent
              parent.remove(child)
              parent.add(object.clone())
            }
          })
        })
      }
    }

    const loader = new OBJLoader();

    const addLaunchSleds = prepareACallbackFunctionForFBXLoader (myScene)
    
    loader.load('models/LaunchSled.obj',
      // called when resource is loaded
      addLaunchSleds,
      // called when loading is in progresses
      function ( xhr ) {
        console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' )
      },
      // called when loading has errors
      function ( error ) {console.log( 'Error loading launch sled model')}
    )

    function addGrapplers(launchSledMesh) {
      // Create the sled's grapplers
      const distanceToSledAft = 0
      const firstGrapplerDistance = 0
      const lastGrapplerDistance = bodyLength
      const grapplerSpacing = 1.0 / numGrapplers * bodyLength
      
      for (let i = 0, grapplerDistance = firstGrapplerDistance; grapplerDistance<lastGrapplerDistance; i++, grapplerDistance += grapplerSpacing) {
        const grapplerGroup = new THREE.Group()
        grapplerGroup.name = 'grappler'
        grapplerGroup.userData = i  // Save the index of the grappler here
        launchSledMesh.add(grapplerGroup)
        for (let leftRight = -1; leftRight<=1; leftRight+=2) {
          const launchSledGrapplerMesh = createSledGrapplerMesh(dParamWithUnits, distanceToSledAft, bodyLength, grapplerDistance, massDriverScrewTexture)
          launchSledGrapplerMesh.name = 'grappler'
          launchSledGrapplerMesh.userData = leftRight
          launchSledGrapplerMesh.scale.set(-leftRight, 1, 1)
          grapplerGroup.add(launchSledGrapplerMesh.clone())
        }
        const launchSledPivotGeometry = new THREE.SphereGeometry(ballJointRadius, 16, 8)
        const launchSledPivotMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
        const launchSledPivot = new THREE.Mesh(launchSledPivotGeometry, launchSledPivotMaterial)

        // Hack - Adding 2 cm so that there's no gap between the pad and the post
        const postLength = .02 + ballJointClearance + ballJointRadius*5
        const launchSledPostGeometry = new THREE.CylinderGeometry(ballJointRadius/2, ballJointRadius/2, postLength, 16, 1)
        launchSledPostGeometry.translate(0, postLength/2, 0)
        const launchSledPostMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
        const launchSledPost = new THREE.Mesh(launchSledPostGeometry, launchSledPostMaterial)

        // Hack - need to calculate the length properly...
        // Hack - Added a 1.25 factor to make the strut a little longer
        const strutLength = (dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value + dParamWithUnits['launcherMassDriverScrewThreadRadius'].value * 1.25 - dParamWithUnits['launchSledWidth'].value / 2) / 2
        const launchSledStrutGeometry = new THREE.CylinderGeometry(ballJointRadius/2, ballJointRadius/2, strutLength, 16, 1)
        launchSledStrutGeometry.translate(0, strutLength/2, 0)
        const launchSledStrutMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
        const launchSledStrut = new THREE.Mesh(launchSledStrutGeometry, launchSledStrutMaterial)
        
        const cylinderLength = strutLength
        const launchSledCylinderGeometry = new THREE.CylinderGeometry(ballJointRadius, ballJointRadius, cylinderLength, 16, 1)
        launchSledCylinderGeometry.translate(0, cylinderLength/2, 0)
        const launchSledCylinderMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
        const launchSledCylinder = new THREE.Mesh(launchSledCylinderGeometry, launchSledCylinderMaterial)
        
        const leftRightList = ['left', 'right']
        const innerOuterList = ['Inner', 'Middle', 'Outer']
        leftRightList.forEach(leftRight => {
          innerOuterList.forEach(innerOuter => {
            const tempPivot = launchSledPivot.clone()
            tempPivot.name = 'pivot'
            tempPivot.userData = {leftRightSign: (leftRight==='left') ? -1 : 1, innerMiddleOuterSign: (innerOuter==='Inner') ? -1 : (innerOuter==='Middle') ? 0 : 1}  
            grapplerGroup.add(tempPivot)
            const tempPost = launchSledPost.clone()
            tempPost.name = 'post'
            tempPost.userData = {leftRightSign: (leftRight==='left') ? -1 : 1}
            grapplerGroup.add(tempPost)
            const tempStrut = launchSledStrut.clone()
            tempStrut.name = 'strut'
            tempStrut.userData = {leftRightSign: (leftRight==='left') ? -1 : 1, innerMiddleOuterSign: (innerOuter==='Inner') ? -1 : (innerOuter==='Middle') ? 0 : 1}
            grapplerGroup.add(tempStrut)
            const tempCylinder = launchSledCylinder.clone()
            tempCylinder.name = 'cylinder'
            tempCylinder.userData = {leftRightSign: (leftRight==='left') ? -1 : 1, innerMiddleOuterSign: (innerOuter==='Inner') ? -1 : (innerOuter==='Middle') ? 0 : 1}
            grapplerGroup.add(tempCylinder)
          })
        })
      }
    }

    function createSledGrapplerMesh(dParamWithUnits, distanceToSledAft, bodyLength, grapplerDistance, massDriverScrewTexture) {
      // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
      // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
      // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
      // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
      const shaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
      const shaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
      const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      const threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      const launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
      const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
      const launcherMassDriver2InitialVelocity = dParamWithUnits['launcherMassDriver2InitialVelocity'].value
      const initialDistance = dParamWithUnits['launchSledBodyLength'].value / 2
      const numGrapplers = dParamWithUnits['launchSledNumGrapplers'].value
      const magnetThickness = dParamWithUnits['launchSledGrapplerMagnetThickness'].value
      const betweenGrapplerFactor = dParamWithUnits['launchSledBetweenGrapplerFactor'].value
      const shaftToGrapplerPad = dParamWithUnits['launchSledShaftToGrapplerPad'].value
      const additionalRotation = 0
      const launchSledGrapplerMaxRangeOfMotion = dParamWithUnits['launchSledGrapplerMaxRangeOfMotion'].value
      const launchSledGrapplerTopDeadCenterRotation = dParamWithUnits['launchSledGrapplerTopDeadCenterRotation'].value
    
      const info = new SledGrapplerPlacementInfo(
        shaftOuterRadius,
        threadRadius,
        threadThickness,
        threadStarts,
        launcherMassDriverScrewRevolutionsPerSecond,
        launcherMassDriverForwardAcceleration,
        launcherMassDriver2InitialVelocity,
        initialDistance,
        distanceToSledAft,
        bodyLength,
        numGrapplers,
        magnetThickness,
        betweenGrapplerFactor,
        shaftToGrapplerPad,
        additionalRotation,
        launchSledGrapplerMaxRangeOfMotion,
        launchSledGrapplerTopDeadCenterRotation,
        virtualLaunchSled.minMaxArray
      )
      info.generatePlacementInfo(grapplerDistance, 1)
    
      const sledGrapplerGeometry = new SledGrapplerGeometry(
        shaftOuterRadius,
        threadRadius,
        threadThickness,
        threadStarts,
        launcherMassDriverScrewRevolutionsPerSecond,
        launcherMassDriverForwardAcceleration,
        launcherMassDriver2InitialVelocity,
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

    function decorateAndSave(object, myScene, unallocatedModelsList, objName, scaleFactorVector, n, perfOptimizedThreeJS) {
      object.scale.set(scaleFactorVector.x, scaleFactorVector.y, scaleFactorVector.z)
      object.visible = false
      object.name = objName
      object.traverse(child => {
      if (child!==object) {
          child.name = objName+'_'+child.name
      }
      })
      object.updateMatrixWorld()
      if (perfOptimizedThreeJS) object.children.forEach(child => child.freeze())
      for (let i=0; i<n; i++) {
          const tempModel = object.clone()
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
      virtualLaunchSled.forwardScaleFactor = dParamWithUnits['launchSystemForwardScaleFactor'].value
      virtualLaunchSled.upwardScaleFactor = dParamWithUnits['launchSystemUpwardScaleFactor'].value
      virtualLaunchSled.rightwardScaleFactor = dParamWithUnits['launchSystemRightwardScaleFactor'].value
      virtualLaunchSled.isVisible = dParamWithUnits['showLaunchSleds'].value
      virtualLaunchSled.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
      virtualLaunchSled.launchSledNumGrapplers = dParamWithUnits['launchSledNumGrapplers'].value
      virtualLaunchSled.magnetThickness = dParamWithUnits['launchSledGrapplerMagnetThickness'].value
      virtualLaunchSled.betweenGrapplerFactor = dParamWithUnits['launchSledBetweenGrapplerFactor'].value
      virtualLaunchSled.shaftToGrapplerPad = dParamWithUnits['launchSledShaftToGrapplerPad'].value
      virtualLaunchSled.ballJointClearance = dParamWithUnits['launchSledGrapplerBallJointClearance'].value
      virtualLaunchSled.ballJointRadius = dParamWithUnits['launchSledGrapplerBallJointRadius'].value
      virtualLaunchSled.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
      virtualLaunchSled.launcherMassDriver2InitialVelocity = dParamWithUnits['launcherMassDriver2InitialVelocity'].value
      virtualLaunchSled.initialDistance = dParamWithUnits['launchSledBodyLength'].value / 2
      virtualLaunchSled.launchSledGrapplerRangeFactor = dParamWithUnits['launchSledGrapplerRangeFactor'].value

      // Because the sled inferfaces with the screw, we need to obtains some screw parameters as well...
      virtualLaunchSled.screwRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
      virtualLaunchSled.launcherMassDriverScrewShaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
      virtualLaunchSled.launcherMassDriverScrewShaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
      virtualLaunchSled.launcherMassDriverScrewThreadRadius =  dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      virtualLaunchSled.launcherMassDriverScrewThreadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      virtualLaunchSled.launcherMassDriverScrewThreadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      virtualLaunchSled.launcherMassDriverScrewSidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
      virtualLaunchSled.launcherMassDriverScrewUpwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
      virtualLaunchSled.padLiftActuation = dParamWithUnits['launchSledGrapplerPadLiftAwayDistance'].value
      virtualLaunchSled.padLiftPortion = dParamWithUnits['launchSledGrapplerPadLiftAwayPortion'].value
      const r1 = virtualLaunchSled.launcherMassDriverScrewThreadRadius
      const r2 = virtualLaunchSled.launcherMassDriverScrewShaftOuterRadius
      virtualLaunchSled.padRadialActuation = (r1 - r2) * (1 + dParamWithUnits['launchSledGrapplerClearanceFactor'].value)
      virtualLaunchSled.padTwistPortion = dParamWithUnits['launchSledGrapplerPadTwistPortion'].value
      virtualLaunchSled.launchSledWidth = dParamWithUnits['launchSledWidth'].value
      virtualLaunchSled.launchSledGrapplerMaxRangeOfMotion = dParamWithUnits['launchSledGrapplerMaxRangeOfMotion'].value
      virtualLaunchSled.launchSledGrapplerTopDeadCenterRotation = dParamWithUnits['launchSledGrapplerTopDeadCenterRotation'].value
      virtualLaunchSled.minMaxArray = [0, 0]
      
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
        const forward = relevantCurve.getTangentAt(d).multiplyScalar(virtualLaunchSled.forwardScaleFactor)
        const upward = relevantCurve.getNormalAt(d).multiplyScalar(virtualLaunchSled.upwardScaleFactor)
        const rightward = relevantCurve.getBinormalAt(d).multiplyScalar(virtualLaunchSled.rightwardScaleFactor)
        const orientation = relevantCurve.getQuaternionAt(d, modelForward, modelUpward)

        const acceleration = virtualLaunchSled.launcherMassDriverForwardAcceleration
        const initialVelocity = virtualLaunchSled.launcherMassDriver2InitialVelocity
        const initialDistance = virtualLaunchSled.initialDistance
        const bodyLength = virtualLaunchSled.launchSledBodyLength
        const launchSledWidthDiv2 = virtualLaunchSled.launchSledWidth / 2
  
        // Next we need to position the launch sled's legs so that they interface with the screws
        // First, working from the back of the launch sled towards the front, we need to virtually recreate the back face of the screw thread, but only the 
        // parts of the that back face that are within the reach of the launch sled's legs.
  
        const screwRevolutionsPerSecond = virtualLaunchSled.screwRevolutionsPerSecond
        const threadRadius = virtualLaunchSled.launcherMassDriverScrewThreadRadius
        const threadStarts = virtualLaunchSled.launcherMassDriverScrewThreadStarts
        const threadThickness = virtualLaunchSled.launcherMassDriverScrewThreadThickness
        const shaftOuterRadius = virtualLaunchSled.launcherMassDriverScrewShaftOuterRadius
        const shaftInnerRadius = virtualLaunchSled.launcherMassDriverScrewShaftInnerRadius
        const upwardsOffsetToAnchors = virtualLaunchSled.upwardsOffset - 1.35
        const anchorUpwardsSeparation = 0.1 //virtualLaunchSled.anchorUpwardsSeparation
        const screwSidewaysOffset = virtualLaunchSled.launcherMassDriverScrewSidewaysOffset
        const screwUpwardsOffset = virtualLaunchSled.launcherMassDriverScrewUpwardsOffset
        const numGrapplers = virtualLaunchSled.launchSledNumGrapplers
        const magnetThickness = virtualLaunchSled.magnetThickness
        const betweenGrapplerFactor = virtualLaunchSled.betweenGrapplerFactor
        const shaftToGrapplerPad = virtualLaunchSled.shaftToGrapplerPad
        const ballJointClearance = virtualLaunchSled.ballJointClearance
        const ballJointRadius = virtualLaunchSled.ballJointRadius
        const launchSledGrapplerMaxRangeOfMotion = virtualLaunchSled.launchSledGrapplerMaxRangeOfMotion
        const launchSledGrapplerTopDeadCenterRotation = virtualLaunchSled.launchSledGrapplerTopDeadCenterRotation 
        const grapplersSidewaysOffset = screwSidewaysOffset
        const grapplerUpwardsOffset = screwUpwardsOffset
        const padCenterToEdge = (threadRadius - (shaftOuterRadius + shaftToGrapplerPad))/2

        // Create a new screw geometry to represent the adaptive nut
        const additionalRotation = (deltaT * screwRevolutionsPerSecond) % 1
        const timeNow = virtualLaunchSled.clock.getElapsedTime()
        const updateNow = (timeNow>virtualLaunchSled.timeOfLastUpdate+virtualLaunchSled.updatePeriod)
        if (updateNow) {
          virtualLaunchSled.timeOfLastUpdate += virtualLaunchSled.updatePeriod
        }
  
        let grapplerGeometry = []
        let grapplerOffset = []
        let grapplerPivotPoints = []
        let grapplerSwitchoverSignal = []
        let grapplerThreadPitch = []
  
        const firstGrapplerDistance =   0
        const lastGrapplerDistance = bodyLength
        const grapplerSpacing = 1.0 / numGrapplers * bodyLength
  
        const info = new SledGrapplerPlacementInfo(
          shaftOuterRadius,
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
          launchSledGrapplerMaxRangeOfMotion,
          launchSledGrapplerTopDeadCenterRotation,
          virtualLaunchSled.minMaxArray
        )
  
        for (let i = 0, grapplerDistance = firstGrapplerDistance; grapplerDistance<lastGrapplerDistance; i++, grapplerDistance += grapplerSpacing) {
          info.generatePlacementInfo(grapplerDistance, virtualLaunchSled.launchSledGrapplerRangeFactor)
          grapplerOffset[i] = info.offset
          grapplerPivotPoints[i] = info.pivotPoints
          grapplerSwitchoverSignal[i] = info.switchoverSignal
          grapplerThreadPitch[i] = info.threadPitch
          if (updateNow) {
            grapplerGeometry[i] = new SledGrapplerGeometry(
              shaftOuterRadius,
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
  
        om.position.copy(pointOnRelevantCurve)
        om.setRotationFromQuaternion(orientation)
        const internalPosition = new THREE.Vector3(0, 0, 0)
        const internalRightward = new THREE.Vector3(1, 0, 0)
        const internalUpward = new THREE.Vector3(0, 0, 1)
        const internalForward = new THREE.Vector3(0, 1, 0)
        const internalOrientation = new THREE.Quaternion().identity()

        // Now we need to position the grappler components
        om.children.forEach(child => {
          if (child.name==='launchSled_grappler') {

            // ToDo: Now that we're using unit vectors internally, we should be able to improve the performance of this code
    
            const grapplerIndex = child.userData
            const offset = grapplerOffset[grapplerIndex]
            // Engage the grapplers only if we're on the part of the curve path that has the twin-screws
            const switchoverSignal = (res.relevantCurve.name=='massDriver2Curve') ? grapplerSwitchoverSignal[grapplerIndex]: 1
            const threadPitch = grapplerThreadPitch[grapplerIndex]
            
            // The switchover signal pushed the grappler back towards the top dead center position
            // It's range is divided into three parts:
            // The first, padLiftPortion, causes the pad to move away from the screw face,
            // The second, padTwistPortion, causes the pad to move radially outwards,
            // The third (the remainder) causes the pad to move circumferentially back towards top dead center
            virtualLaunchSled.launchSledGrapplerLiftAwayPortion

            // Forwards motion of the grappler's magnetic pad
            const padLiftActuation = Math.min(1, switchoverSignal/virtualLaunchSled.padLiftPortion) * virtualLaunchSled.padLiftActuation
            // Radial (outwards) motion of the grappler's magnetic pad also occurs during the liftPortion
            const padRadialActuation = Math.max(0, Math.min(1, (switchoverSignal)/virtualLaunchSled.padLiftPortion)) * virtualLaunchSled.padRadialActuation

            const padTwistActuation = Math.max(0, Math.min(1, (switchoverSignal-virtualLaunchSled.padLiftPortion)/virtualLaunchSled.padTwistPortion)) * Math.atan(threadPitch)
            // Angular (circumferencial) motion of the grappler's magnetic pad
            const alreadyUsedPortion = virtualLaunchSled.padLiftPortion + virtualLaunchSled.padTwistPortion
            const remainingPortion = 1 - alreadyUsedPortion
            const padThetaFactor = 1 - Math.max(0, Math.min(1, (switchoverSignal-alreadyUsedPortion)/remainingPortion))

            const grapplerScrewAngle = Math.atan(threadPitch)
            const padLiftActuationThetaComponent = padLiftActuation * Math.sin(grapplerScrewAngle)
            const padLiftActuationYComponent = padLiftActuation * Math.cos(grapplerScrewAngle)
            const rOffset = offset.x + padRadialActuation

            const rawTheta = offset.z
            const thetaOffset = ((rawTheta + 3*Math.PI) % (2*Math.PI) - Math.PI) * padThetaFactor + padLiftActuationThetaComponent
            const sinThetaOffset = Math.sin(thetaOffset)
            const cosThetaOffset = Math.cos(thetaOffset)

            // Precalculated values for all pivot points...
            const rOffsetPlus = rOffset + padCenterToEdge + ballJointClearance + ballJointRadius * 3
            const pivotPointYComponent = 0//0.8 * magnetThickness * Math.cos(grapplerScrewAngle)

            child.children.forEach(grapplerComponent => {
              if (grapplerComponent.name==='launchSled_grappler') {
                const leftRightSign = grapplerComponent.userData
                if (updateNow) {
                  grapplerComponent.geometry.dispose()
                  grapplerComponent.geometry = grapplerGeometry[grapplerIndex]
                }
                const xOffset = rOffset * -sinThetaOffset
                const zOffset = rOffset * cosThetaOffset
                const yOffset = offset.y - padLiftActuationYComponent
                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
                  .add(internalForward.clone().multiplyScalar(yOffset))
                grapplerComponent.setRotationFromQuaternion(internalOrientation)
                grapplerComponent.rotateY(leftRightSign*thetaOffset)
                grapplerComponent.rotateZ(-leftRightSign*padTwistActuation)
              }
              else if (grapplerComponent.name==='launchSled_pivot') {
                // Update the positions of the ends of the struts that are attached to the grapplers
                const leftRightSign = grapplerComponent.userData.leftRightSign
                const innerMiddleOuterSign = grapplerComponent.userData.innerMiddleOuterSign
                const rOffsetPlusMinus = rOffsetPlus + innerMiddleOuterSign*ballJointRadius*2
                const xOffset = rOffsetPlusMinus * -sinThetaOffset
                const zOffset = rOffsetPlusMinus * cosThetaOffset
                const yOffset = offset.y - padLiftActuationYComponent + pivotPointYComponent

                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
                  .add(internalForward.clone().multiplyScalar(yOffset))
              }
              else if (grapplerComponent.name==='launchSled_post') {
                // Update the positions of the ends of the post that connects the pads to the pivots
                const leftRightSign = grapplerComponent.userData.leftRightSign
                const innerMiddleOuterSign = 1
                const rOffsetPlusMinus0 = rOffset + padCenterToEdge
                const xOffset0 = rOffsetPlusMinus0 * -sinThetaOffset
                const zOffset0 = rOffsetPlusMinus0 * cosThetaOffset
                const yOffset0 = offset.y - padLiftActuationYComponent + pivotPointYComponent
                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset0))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset0))
                  .add(internalForward.clone().multiplyScalar(yOffset0))

                const rOffsetPlusMinus1 = rOffset + padCenterToEdge + ballJointClearance + ballJointRadius * 5
                const xOffset1 = rOffsetPlusMinus1 * -sinThetaOffset
                const zOffset1 = rOffsetPlusMinus1 * cosThetaOffset
                const yOffset1 = offset.y - padLiftActuationYComponent + pivotPointYComponent
                const outerPivotPoint = internalPosition.clone()
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset1))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset1))
                  .add(internalForward.clone().multiplyScalar(yOffset1))

                // Create a unit vector towards the outerPivotPoint
                const q0 = new THREE.Quaternion
                const tangent = outerPivotPoint.clone().sub(grapplerComponent.position).normalize()
                q0.setFromUnitVectors(grapplerComponent.up, tangent)
                grapplerComponent.setRotationFromQuaternion(q0)
              }
              else if (grapplerComponent.name==='launchSled_strut') {
                // Update the positions of the ends of the struts that are attached to the grapplers
                const leftRightSign = grapplerComponent.userData.leftRightSign
                const innerMiddleOuterSign = grapplerComponent.userData.innerMiddleOuterSign
                const rOffsetPlusMinus = rOffsetPlus + innerMiddleOuterSign*ballJointRadius*2
                const xOffset = rOffsetPlusMinus * -sinThetaOffset
                const zOffset = rOffsetPlusMinus * cosThetaOffset
                const yOffset = offset.y - padLiftActuationYComponent + pivotPointYComponent

                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
                  .add(internalForward.clone().multiplyScalar(yOffset))

                const forwardAnchorOffset = (innerMiddleOuterSign==0) ? grapplerSpacing/2 : 0
                const anchorPoint = internalPosition.clone()
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*launchSledWidthDiv2))
                  .add(internalUpward.clone().multiplyScalar(upwardsOffsetToAnchors + innerMiddleOuterSign*anchorUpwardsSeparation))
                  .add(internalForward.clone().multiplyScalar(offset.y + forwardAnchorOffset))
                // Create a unit vector towards the anchorPoint
                const q1 = new THREE.Quaternion
                const tangent = anchorPoint.clone().sub(grapplerComponent.position).normalize()
                q1.setFromUnitVectors(grapplerComponent.up, tangent)
                grapplerComponent.setRotationFromQuaternion(q1)
              }
              else if (grapplerComponent.name==='launchSled_cylinder') {
                // Update the positions of the ends of the cylinders that are attached to the grapplers
                const leftRightSign = grapplerComponent.userData.leftRightSign
                const innerMiddleOuterSign = grapplerComponent.userData.innerMiddleOuterSign
                const rOffsetPlusMinus = rOffsetPlus + innerMiddleOuterSign*ballJointRadius*2
                const xOffset = rOffsetPlusMinus * -sinThetaOffset
                const zOffset = rOffsetPlusMinus * cosThetaOffset
                const yOffset = offset.y - padLiftActuationYComponent + pivotPointYComponent

                const anchorPoint = internalPosition.clone()
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
                  .add(internalForward.clone().multiplyScalar(yOffset))

                const forwardAnchorOffset = (innerMiddleOuterSign==0) ? grapplerSpacing/2 : 0
                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*launchSledWidthDiv2))
                  .add(internalUpward.clone().multiplyScalar(upwardsOffsetToAnchors + innerMiddleOuterSign*anchorUpwardsSeparation))
                  .add(internalForward.clone().multiplyScalar(offset.y + forwardAnchorOffset))

                // Create a unit vector towards the anchorPoint
                const q1 = new THREE.Quaternion
                const tangent = anchorPoint.clone().sub(grapplerComponent.position).normalize()
                q1.setFromUnitVectors(grapplerComponent.up, tangent)
                grapplerComponent.setRotationFromQuaternion(q1)
              }
            })
          }
          else if ((child.name==='launchSled_body') || (child.name==='launchSled_bodyFromModel')) {
            child.position.copy(internalPosition)
              .add(internalRightward.clone().multiplyScalar(virtualLaunchSled.sidewaysOffset))
              .add(internalUpward.clone().multiplyScalar(virtualLaunchSled.upwardsOffset))
              .add(internalForward.clone().multiplyScalar(virtualLaunchSled.forwardsOffset))
            child.setRotationFromQuaternion(internalOrientation)
          }
          child.visible = true
        })
        om.matrixValid = false
      }
      om.visible = virtualLaunchSled.isVisible
    }
  }
  
  