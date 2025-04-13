import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { SledGrapplerPlacementInfo, SledGrapplerGeometry } from './SledGrapplerGeometry.js'
import * as tram from './tram.js'

export class adaptiveNutModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, perfOptimizedThreeJS, massDriverScrewTexture) {
    // Manually Create the Launch Vehicle
    const width = dParamWithUnits['adaptiveNutWidth'].value
    const height = dParamWithUnits['adaptiveNutHeight'].value
    const radialSegments = 32
    const bodyLength = dParamWithUnits['adaptiveNutBodyLength'].value
    const grapplerLength = dParamWithUnits['adaptiveNutGrapplerLength'].value
    const adaptiveNutForwardsOffset = dParamWithUnits['adaptiveNutForwardsOffset'].value
    const numGrapplers = dParamWithUnits['adaptiveNutNumGrapplers'].value
    const objName = 'adaptiveNut'
    const adaptiveNutNumModels = dParamWithUnits['adaptiveNutNumModels'].value
    const ballJointClearance = dParamWithUnits['adaptiveNutGrapplerBallJointClearance'].value
    const ballJointRadius = dParamWithUnits['adaptiveNutGrapplerBallJointRadius'].value
    const cylinderRadius = dParamWithUnits['adaptiveNutGrapplerCylinderRadius'].value

    // Proceedurally generate the Launch Sled's body (note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
    const adaptiveNutBodyGeometry = new THREE.BoxGeometry(width, bodyLength, height, 1, 1, 1)
    adaptiveNutBodyGeometry.translate(0, bodyLength/2 - adaptiveNutForwardsOffset, 0)
    // const adaptiveNutBodyTexture = new THREE.TextureLoader().load('textures/adaptiveNutBodyTexture.jpg', function(texture) {adaptiveNutBodyMaterial.needsUpdate = true})
    // const adaptiveNutBodyMaterial = new THREE.MeshPhongMaterial( {map: adaptiveNutBodyTexture})
    const adaptiveNutBodyMaterial = new THREE.MeshPhongMaterial( {color: 0x7f6f7f})
    const adaptiveNutBodyMesh = new THREE.Mesh(adaptiveNutBodyGeometry, adaptiveNutBodyMaterial)
    adaptiveNutBodyMesh.name = 'body'
    const adaptiveNutMesh = new THREE.Group().add(adaptiveNutBodyMesh)
    addGrapplers(adaptiveNutMesh)
    adaptiveNutMesh.name = 'adaptiveNut'
    const scaleFactorVector = new THREE.Vector3(
      dParamWithUnits['launchSystemRightwardScaleFactor'].value,
      dParamWithUnits['launchSystemForwardScaleFactor'].value,
      dParamWithUnits['launchSystemUpwardScaleFactor'].value)

    decorateAndSave(adaptiveNutMesh, myScene, unallocatedModelsList, objName, scaleFactorVector, adaptiveNutNumModels, perfOptimizedThreeJS)

    // Load the Launch Sled's Mesh from a model, but then proceedurally generate the grapplers
    function prepareACallbackFunctionForFBXLoader (myScene) {
      // This is the additional work we want to do later, after the loader get's around to loading our model...
      return function(object) {
        object.children[0].scale.set(0.6, 1, 1.5)  // A bit hacky - Alastair's sled model is too wide and thin
        object.children[0].position.set(0, 0, 0) // reposition vertically after making the sled thicker
        object.scale.set(0.001, 0.001*1.62, 0.001)  // Correct for units - mm to m
        object.name = 'adaptiveNut_bodyFromModel'
        object.children[0].material.color.setHex(0x2f1f50)
        myScene.traverse(child=> {
          if (child.name=='adaptiveNut_body') {
            const parent = child.parent
            // parent.remove(child)
            parent.add(object.clone())
          }
        })
        unallocatedModelsList.forEach(element => {
          element.traverse(child => {
            if (child.name==='adaptiveNut_body') {
              const parent = child.parent
              // parent.remove(child)
              parent.add(object.clone())
            }
          })
        })
      }
    }

    const loader = new OBJLoader();

    const addAdaptiveNuts = prepareACallbackFunctionForFBXLoader (myScene)
    
    loader.load('models/AdaptiveNut.obj',
      // called when resource is loaded
      addAdaptiveNuts,
      // called when loading is in progresses
      function ( xhr ) {
        console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' )
      },
      // called when loading has errors
      function ( error ) {console.log( 'Error loading launch sled model')}
    )

    function addGrapplers(adaptiveNutMesh) {
      // Create the sled's grapplers
      const distanceToSledAft = 0
      const firstGrapplerDistance = (bodyLength-grapplerLength) / 2
      const grapplerSpacing = 1.0 / numGrapplers * grapplerLength
    
      const midwayPositionList = ['top', 'bottom']
      midwayPositionList.forEach(midwayPosition => {
        const midwayRotation = (midwayPosition==='top') ? 0.5 : 0
        for (let i = 0, grapplerDistance = firstGrapplerDistance; i<numGrapplers; i++, grapplerDistance += grapplerSpacing) {
          const grapplerGroup = new THREE.Group()
          grapplerGroup.name = 'grappler'
          grapplerGroup.userData = {index: i, midwayRotation: midwayRotation}  // Save the index of the grappler here
          adaptiveNutMesh.add(grapplerGroup)

          const adaptiveNutGrapplerMesh = createSledGrapplerMesh(dParamWithUnits, distanceToSledAft, grapplerLength, midwayRotation, grapplerDistance, massDriverScrewTexture)
          adaptiveNutGrapplerMesh.name = 'grappler'

          const adaptiveNutPivotGeometry = new THREE.SphereGeometry(ballJointRadius, 16, 8)
          const adaptiveNutPivotMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
          const adaptiveNutPivot = new THREE.Mesh(adaptiveNutPivotGeometry, adaptiveNutPivotMaterial)
          adaptiveNutPivot.name = 'pivot'

          // Hack - Adding 2 cm so that there's no gap between the pad and the post
          const postLength = .02 + ballJointClearance + ballJointRadius*5
          const adaptiveNutPostGeometry = new THREE.CylinderGeometry(ballJointRadius/2, ballJointRadius/2, postLength, 16, 1)
          adaptiveNutPostGeometry.translate(0, postLength/2, 0)
          const adaptiveNutPostMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
          const adaptiveNutPost = new THREE.Mesh(adaptiveNutPostGeometry, adaptiveNutPostMaterial)
          adaptiveNutPost.name = 'post'

          // Hack - need to calculate the length properly...
          // Hack - Added a 1.25 factor to make the strut a little longer
          const strutLength = (dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value + dParamWithUnits['launcherMassDriverScrewThreadRadius'].value * 1.25 - dParamWithUnits['adaptiveNutWidth'].value / 2) / 2
          const adaptiveNutStrutGeometry = new THREE.CylinderGeometry(cylinderRadius/2, cylinderRadius/2, strutLength, 16, 1)
          adaptiveNutStrutGeometry.translate(0, strutLength/2, 0)
          const adaptiveNutStrutMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
          const adaptiveNutStrut = new THREE.Mesh(adaptiveNutStrutGeometry, adaptiveNutStrutMaterial)
          adaptiveNutStrut.name = 'strut'
          
          const cylinderLength = strutLength
          const adaptiveNutCylinderGeometry = new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderLength, 16, 1)
          adaptiveNutCylinderGeometry.translate(0, cylinderLength/2, 0)
          const adaptiveNutCylinderMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
          const adaptiveNutCylinder = new THREE.Mesh(adaptiveNutCylinderGeometry, adaptiveNutCylinderMaterial)
          adaptiveNutCylinder.name = 'cylinder'
          
          const leftRightList = ['left', 'right']
          const innerOuterList = ['Inner', 'Middle', 'Outer']
          leftRightList.forEach(leftRight => {
            const leftRightSign = (leftRight==='left') ? -1 : 1
            const tempAdaptiveNutGrapplerMesh = adaptiveNutGrapplerMesh.clone()
            tempAdaptiveNutGrapplerMesh.userData = {leftRightSign: leftRightSign}
            tempAdaptiveNutGrapplerMesh.scale.set(-leftRightSign, 1, 1)
            grapplerGroup.add(tempAdaptiveNutGrapplerMesh)

            innerOuterList.forEach(innerOuter => {
              const innerMiddleOuterSign1 = (innerOuter==='Inner') ? -2 : (innerOuter==='Middle') ? 0.5 : 2
              const innerMiddleOuterSign2 = (innerOuter==='Inner') ? -2 : (innerOuter==='Middle') ? -1 : 2
              const tempPivot = adaptiveNutPivot.clone()
              tempPivot.userData = {leftRightSign: leftRightSign, innerMiddleOuterSign1: innerMiddleOuterSign1}  
              grapplerGroup.add(tempPivot)
              const tempPost = adaptiveNutPost.clone()
              tempPost.userData = {leftRightSign: leftRightSign}
              grapplerGroup.add(tempPost)
              const tempStrut = adaptiveNutStrut.clone()
              tempStrut.userData = {
                topBottomOffset: (midwayPosition==='top') ? -1: 1,
                leftRightSign: leftRightSign,
                innerMiddleOuterSign1: innerMiddleOuterSign1,
                innerMiddleOuterSign2: innerMiddleOuterSign2}
              grapplerGroup.add(tempStrut)
              const tempCylinder = adaptiveNutCylinder.clone()
              tempCylinder.userData = {
                topBottomOffset: (midwayPosition==='top') ? -1: 1,
                leftRightSign: leftRightSign,
                innerMiddleOuterSign1: innerMiddleOuterSign1,
                innerMiddleOuterSign2: innerMiddleOuterSign2}
              grapplerGroup.add(tempCylinder)
            })
          })
        }
      })
    }

    function createSledGrapplerMesh(dParamWithUnits, distanceToSledAft, grapplerLength, midwayRotation, grapplerDistance, massDriverScrewTexture) {
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
      const launcherMassDriver1InitialVelocity = dParamWithUnits['launcherMassDriver1InitialVelocity'].value
      const initialDistance = dParamWithUnits['adaptiveNutBodyLength'].value / 2
      const numGrapplers = dParamWithUnits['adaptiveNutNumGrapplers'].value
      const magnetThickness = dParamWithUnits['adaptiveNutGrapplerMagnetThickness'].value
      const betweenGrapplerFactor = dParamWithUnits['adaptiveNutBetweenGrapplerFactor'].value
      const shaftToGrapplerPad = dParamWithUnits['adaptiveNutShaftToGrapplerPad'].value
      const additionalRotation = 0
      const adaptiveNutGrapplerMaxRangeOfMotion = dParamWithUnits['adaptiveNutGrapplerMaxRangeOfMotion'].value
      const adaptiveNutGrapplerTopDeadCenterRotation = dParamWithUnits['adaptiveNutGrapplerTopDeadCenterRotation'].value
    
      const info = new SledGrapplerPlacementInfo(
        shaftOuterRadius,
        threadRadius,
        threadThickness,
        threadStarts,
        launcherMassDriverScrewRevolutionsPerSecond,
        launcherMassDriverForwardAcceleration,
        launcherMassDriver1InitialVelocity,
        initialDistance,
        distanceToSledAft,
        grapplerLength,
        numGrapplers,
        magnetThickness,
        betweenGrapplerFactor,
        shaftToGrapplerPad,
        additionalRotation,
        adaptiveNutGrapplerMaxRangeOfMotion,
        adaptiveNutGrapplerTopDeadCenterRotation,
        virtualAdaptiveNut.minMaxArray
      )
      info.generatePlacementInfo(grapplerDistance, 1)
    
      const sledGrapplerGeometry = new SledGrapplerGeometry(
        shaftOuterRadius,
        threadRadius,
        threadThickness,
        threadStarts,
        launcherMassDriverScrewRevolutionsPerSecond,
        launcherMassDriverForwardAcceleration,
        launcherMassDriver1InitialVelocity,
        initialDistance,
        distanceToSledAft,
        grapplerLength,
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

export class virtualAdaptiveNut {
    constructor(timeLaunched) {
        // The virtual vehicle has a position along the launch trajectory curve.
        // 0 represents the begginning of the mass driver, 1 represents 't==durationOfLaunchTrajectory'
        this.timeLaunched = timeLaunched
        this.model = null
    }

    // These parameters are required for all objects
    static updateParameters = []
    static unallocatedModels = []
    static numObjects = 0
    static refFrames = []
    static prevRefFrames = []
    static className = 'virtualAdaptiveNuts'
    static modelsAreRecyleable = true

    static isTeardownRequired(dParamWithUnits) {
      const newNumObjects = dParamWithUnits['showAdaptiveNuts'].value ? dParamWithUnits['numVirtualAdaptiveNuts'].value : 0
      return newNumObjects!==virtualAdaptiveNut.numObjects
    }

    static update(dParamWithUnits, launcherMassDriverLength, scene, clock) {
      virtualAdaptiveNut.numObjects = dParamWithUnits['showAdaptiveNuts'].value ? dParamWithUnits['numVirtualAdaptiveNuts'].value : 0
      virtualAdaptiveNut.clock = clock
      virtualAdaptiveNut.updatePeriod = 1  // seconds (really we need to vary this depending on how far along the mass driver we are...)
      virtualAdaptiveNut.tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
  
      virtualAdaptiveNut.timeOfLastUpdate = clock.getElapsedTime() - virtualAdaptiveNut.updatePeriod
      virtualAdaptiveNut.launcherMassDriverLength = launcherMassDriverLength
      virtualAdaptiveNut.adaptiveNutBodyLength = dParamWithUnits['adaptiveNutBodyLength'].value
      virtualAdaptiveNut.adaptiveNutGrapplerLength = dParamWithUnits['adaptiveNutGrapplerLength'].value
      virtualAdaptiveNut.sidewaysOffset = dParamWithUnits['adaptiveNutSidewaysOffset'].value
      virtualAdaptiveNut.upwardsOffset = dParamWithUnits['adaptiveNutUpwardsOffset'].value
      virtualAdaptiveNut.forwardsOffset = dParamWithUnits['adaptiveNutForwardsOffset'].value
      virtualAdaptiveNut.forwardScaleFactor = dParamWithUnits['launchSystemForwardScaleFactor'].value
      virtualAdaptiveNut.upwardScaleFactor = dParamWithUnits['launchSystemUpwardScaleFactor'].value
      virtualAdaptiveNut.rightwardScaleFactor = dParamWithUnits['launchSystemRightwardScaleFactor'].value
      virtualAdaptiveNut.isVisible = dParamWithUnits['showAdaptiveNuts'].value
      virtualAdaptiveNut.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
      virtualAdaptiveNut.adaptiveNutNumGrapplers = dParamWithUnits['adaptiveNutNumGrapplers'].value
      virtualAdaptiveNut.magnetThickness = dParamWithUnits['adaptiveNutGrapplerMagnetThickness'].value
      virtualAdaptiveNut.betweenGrapplerFactor = dParamWithUnits['adaptiveNutBetweenGrapplerFactor'].value
      virtualAdaptiveNut.shaftToGrapplerPad = dParamWithUnits['adaptiveNutShaftToGrapplerPad'].value
      virtualAdaptiveNut.ballJointClearance = dParamWithUnits['adaptiveNutGrapplerBallJointClearance'].value
      virtualAdaptiveNut.ballJointRadius = dParamWithUnits['adaptiveNutGrapplerBallJointRadius'].value
      virtualAdaptiveNut.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
      virtualAdaptiveNut.launcherMassDriver1InitialVelocity = dParamWithUnits['launcherMassDriver1InitialVelocity'].value
      virtualAdaptiveNut.initialDistance = dParamWithUnits['adaptiveNutBodyLength'].value / 2
      virtualAdaptiveNut.adaptiveNutGrapplerRangeFactor = dParamWithUnits['adaptiveNutGrapplerRangeFactor'].value

      // Because the sled inferfaces with the screw, we need to obtains some screw parameters as well...
      virtualAdaptiveNut.screwRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
      virtualAdaptiveNut.launcherMassDriverScrewShaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
      virtualAdaptiveNut.launcherMassDriverScrewShaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
      virtualAdaptiveNut.intraAnchorUpwardsSeparation = dParamWithUnits['adaptiveNutIntraAnchorUpwardsSeparation'].value // We could make this the function of launcherMassDriverScrewThreadRadius and the adaptiveNutGrapplerClearanceFactor
      virtualAdaptiveNut.interAnchorUpwardsSeparation = dParamWithUnits['adaptiveNutInterAnchorUpwardsSeparation'].value
      virtualAdaptiveNut.launcherMassDriverScrewThreadRadius =  dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      virtualAdaptiveNut.launcherMassDriverScrewThreadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      virtualAdaptiveNut.launcherMassDriverScrewThreadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      virtualAdaptiveNut.launcherMassDriverScrewSidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
      virtualAdaptiveNut.launcherMassDriverScrewUpwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
      virtualAdaptiveNut.padLiftActuation = dParamWithUnits['adaptiveNutGrapplerPadLiftAwayDistance'].value
      virtualAdaptiveNut.padLiftPortion = dParamWithUnits['adaptiveNutGrapplerPadLiftAwayPortion'].value
      const r1 = virtualAdaptiveNut.launcherMassDriverScrewThreadRadius
      const r2 = virtualAdaptiveNut.launcherMassDriverScrewShaftOuterRadius
      virtualAdaptiveNut.padRadialActuation = (r1 - r2) * (1 + dParamWithUnits['adaptiveNutGrapplerClearanceFactor'].value)
      virtualAdaptiveNut.padTwistPortion = dParamWithUnits['adaptiveNutGrapplerPadTwistPortion'].value
      virtualAdaptiveNut.adaptiveNutWidth = dParamWithUnits['adaptiveNutWidth'].value
      virtualAdaptiveNut.adaptiveNutGrapplerMaxRangeOfMotion = dParamWithUnits['adaptiveNutGrapplerMaxRangeOfMotion'].value
      virtualAdaptiveNut.adaptiveNutGrapplerTopDeadCenterRotation = dParamWithUnits['adaptiveNutGrapplerTopDeadCenterRotation'].value
      virtualAdaptiveNut.minMaxArray = [0, 0]

      virtualAdaptiveNut.isDynamic =  true
      virtualAdaptiveNut.hasChanged = true
      virtualAdaptiveNut.scene = scene
      virtualAdaptiveNut.greenMaterial = new THREE.MeshPhongMaterial({color: 0x00ff00})
      virtualAdaptiveNut.redMaterial = new THREE.MeshPhongMaterial({color: 0xff0000})
    }
  
    static addNewVirtualObjects(refFrames) {
      virtualAdaptiveNut.hasChanged = true
      const n1 = virtualAdaptiveNut.numObjects
      const tStart = 0
      const tInc = virtualAdaptiveNut.tInc
      
      console.assert(refFrames.length==1)
      refFrames.forEach(refFrame => {
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
        // Going backwards in time since we want to add vehicles that were launched in the past.
        const durationOfSledTrajectory = refFrame.curve.getDuration()
        for (let t = tStart, i = 0; (t > -(tStart+durationOfSledTrajectory)) && (i<n1); t -= tInc, i++) {
          // Calculate where along the launcher to place the vehicle. 
          const deltaT = adjustedTimeSinceStart - t
          const zoneIndex = refFrame.curve.getZoneIndex(deltaT)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex][virtualAdaptiveNut.className].push(new virtualAdaptiveNut(t))
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }

    placeAndOrientModel(om, refFrame) {
      if (virtualAdaptiveNut.isVisible) {
        const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualAdaptiveNut.slowDownPassageOfTime, refFrame.timeSinceStart)
        const deltaT = adjustedTimeSinceStart - this.timeLaunched
        const res = refFrame.curve.findRelevantCurve(deltaT)
        const relevantCurve = res.relevantCurve
        const distanceDownRelevantCurve = relevantCurve.tTod(deltaT - res.relevantCurveStartTime)
        const d = distanceDownRelevantCurve / res.relevantCurveLength
        // This next line assumes that there is only one other supercurve before the start of the screw
        let massDriver1StartDistance = 0;
        for (const superCurve of refFrame.curve.superCurves) {
          if (superCurve.name !== 'massDriver1Curve') {
            massDriver1StartDistance += superCurve.length;
          } else {
            break;
          }
        }
        const distanceToSledAft = res.relevantCurveStartDistance + distanceDownRelevantCurve - massDriver1StartDistance

        const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
        const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

        const pointOnRelevantCurve = relevantCurve.getPointAt(d)
        const forward = relevantCurve.getTangentAt(d).multiplyScalar(virtualAdaptiveNut.forwardScaleFactor)
        const upward = relevantCurve.getNormalAt(d).multiplyScalar(virtualAdaptiveNut.upwardScaleFactor)
        const rightward = relevantCurve.getBinormalAt(d).multiplyScalar(virtualAdaptiveNut.rightwardScaleFactor)
        const orientation = relevantCurve.getQuaternionAt(d, modelForward, modelUpward)

        const acceleration = virtualAdaptiveNut.launcherMassDriverForwardAcceleration
        const initialVelocity = virtualAdaptiveNut.launcherMassDriver1InitialVelocity
        const initialDistance = virtualAdaptiveNut.initialDistance
        const adaptiveNutWidthDiv2 = virtualAdaptiveNut.adaptiveNutWidth / 2
  
        // Next we need to position the launch sled's legs so that they interface with the screws
        // First, working from the back of the launch sled towards the front, we need to virtually recreate the back face of the screw thread, but only the 
        // parts of the that back face that are within the reach of the launch sled's legs.
  
        const screwRevolutionsPerSecond = virtualAdaptiveNut.screwRevolutionsPerSecond
        const threadRadius = virtualAdaptiveNut.launcherMassDriverScrewThreadRadius
        const threadStarts = tram.calculateThreadStarts(distanceToSledAft, virtualAdaptiveNut.launcherMassDriverScrewThreadStarts)
        const threadThickness = virtualAdaptiveNut.launcherMassDriverScrewThreadThickness
        const shaftOuterRadius = virtualAdaptiveNut.launcherMassDriverScrewShaftOuterRadius
        const shaftInnerRadius = virtualAdaptiveNut.launcherMassDriverScrewShaftInnerRadius
        const upwardsOffsetToAnchors = virtualAdaptiveNut.launcherMassDriverScrewUpwardsOffset // Anchors' upward position will track the screws'
        const intraAnchorUpwardsSeparation = virtualAdaptiveNut.intraAnchorUpwardsSeparation
        const interAnchorUpwardsSeparation = virtualAdaptiveNut.interAnchorUpwardsSeparation
        const screwSidewaysOffset = virtualAdaptiveNut.launcherMassDriverScrewSidewaysOffset
        const screwUpwardsOffset = virtualAdaptiveNut.launcherMassDriverScrewUpwardsOffset
        const numGrapplers = virtualAdaptiveNut.adaptiveNutNumGrapplers
        const magnetThickness = virtualAdaptiveNut.magnetThickness
        const betweenGrapplerFactor = virtualAdaptiveNut.betweenGrapplerFactor
        const shaftToGrapplerPad = virtualAdaptiveNut.shaftToGrapplerPad
        const ballJointClearance = virtualAdaptiveNut.ballJointClearance
        const ballJointRadius = virtualAdaptiveNut.ballJointRadius
        const adaptiveNutGrapplerMaxRangeOfMotion = virtualAdaptiveNut.adaptiveNutGrapplerMaxRangeOfMotion
        const adaptiveNutGrapplerTopDeadCenterRotation = virtualAdaptiveNut.adaptiveNutGrapplerTopDeadCenterRotation 
        const grapplersSidewaysOffset = screwSidewaysOffset
        const grapplerUpwardsOffset = screwUpwardsOffset
        const padCenterToEdge = (threadRadius - (shaftOuterRadius + shaftToGrapplerPad))/2

        // Create a new screw geometry to represent the adaptive nut
        const additionalRotation = (deltaT * screwRevolutionsPerSecond) % 1
        const timeNow = virtualAdaptiveNut.clock.getElapsedTime()
        const updateNow = (timeNow>virtualAdaptiveNut.timeOfLastUpdate+virtualAdaptiveNut.updatePeriod)
        if (updateNow) {
          virtualAdaptiveNut.timeOfLastUpdate += virtualAdaptiveNut.updatePeriod
        }
  
        let grapplerGeometry = []
        let grapplerOffset = []
        let grapplerSwitchoverSignal = []
        let grapplerThreadPitch = []
  
        const bodyLength = virtualAdaptiveNut.adaptiveNutBodyLength
        const grapplerLength = virtualAdaptiveNut.adaptiveNutGrapplerLength
        const firstGrapplerDistance = (bodyLength-grapplerLength) / 2
        const grapplerSpacing = 1.0 / numGrapplers * grapplerLength

        // ToDo: Probably a bit wasteful to recreate this object every time update the model
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
          grapplerLength,
          numGrapplers,
          magnetThickness,
          betweenGrapplerFactor,
          shaftToGrapplerPad,
          additionalRotation,
          adaptiveNutGrapplerMaxRangeOfMotion,
          adaptiveNutGrapplerTopDeadCenterRotation,
          virtualAdaptiveNut.minMaxArray
        )
  
        for (let i = 0, grapplerDistance = firstGrapplerDistance; i<numGrapplers; i++, grapplerDistance += grapplerSpacing) {
          info.generatePlacementInfo(grapplerDistance, virtualAdaptiveNut.adaptiveNutGrapplerRangeFactor)
          grapplerOffset[i] = info.offset
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
              grapplerLength,
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
          if (child.name==='adaptiveNut_grappler') {

            // ToDo: Now that we're using unit vectors internally, we should be able to improve the performance of this code
    
            const grapplerIndex = child.userData.index
            const midwayRotation = child.userData.midwayRotation
            const offset = grapplerOffset[grapplerIndex]
            // Engage the grapplers only if we're on the part of the curve path that has the twin-screws
            const switchoverSignal = ((res.relevantCurve.name=='massDriver1Curve') || (res.relevantCurve.name=='massDriver2Curve')) ? grapplerSwitchoverSignal[grapplerIndex]: 1
            const threadPitch = grapplerThreadPitch[grapplerIndex]
            
            // The switchover signal pushed the grappler back towards the top dead center position
            // It's range is divided into three parts:
            // The first, padLiftPortion, causes the pad to move away from the screw face,
            // The second, padTwistPortion, causes the pad to move radially outwards,
            // The third (the remainder) causes the pad to move circumferentially back towards top dead center
            virtualAdaptiveNut.adaptiveNutGrapplerLiftAwayPortion

            // Forwards motion of the grappler's magnetic pad
            const padLiftActuation = Math.min(1, switchoverSignal/virtualAdaptiveNut.padLiftPortion) * virtualAdaptiveNut.padLiftActuation
            // Radial (outwards) motion of the grappler's magnetic pad also occurs during the liftPortion
            const padRadialActuation = Math.max(0, Math.min(1, (switchoverSignal)/virtualAdaptiveNut.padLiftPortion)) * virtualAdaptiveNut.padRadialActuation

            const padTwistActuation = Math.max(0, Math.min(1, (switchoverSignal-virtualAdaptiveNut.padLiftPortion)/virtualAdaptiveNut.padTwistPortion)) * Math.atan(threadPitch)
            // Angular (circumferencial) motion of the grappler's magnetic pad
            const alreadyUsedPortion = virtualAdaptiveNut.padLiftPortion + virtualAdaptiveNut.padTwistPortion
            const remainingPortion = 1 - alreadyUsedPortion
            const padThetaFactor = 1 - Math.max(0, Math.min(1, (switchoverSignal-alreadyUsedPortion)/remainingPortion))

            const grapplerScrewAngle = Math.atan(threadPitch)
            const padLiftActuationThetaComponent = padLiftActuation * Math.sin(grapplerScrewAngle)
            const padLiftActuationYComponent = padLiftActuation * Math.cos(grapplerScrewAngle)
            const rOffset = offset.r + padRadialActuation

            const rawTheta = offset.θ
            const midTheta = 2*Math.PI * midwayRotation
            const thetaOffset = ((rawTheta + 3*Math.PI) % (2*Math.PI) - Math.PI) * padThetaFactor + padLiftActuationThetaComponent
            const sinThetaOffset = Math.sin(thetaOffset + midTheta)
            const cosThetaOffset = Math.cos(thetaOffset + midTheta)

            // Precalculated values for all pivot points...
            const rOffsetPlus = rOffset + padCenterToEdge + ballJointClearance + ballJointRadius * 3
            const pivotPointYComponent = 0//0.8 * magnetThickness * Math.cos(grapplerScrewAngle)

            child.children.forEach(grapplerComponent => {
              if (grapplerComponent.name==='adaptiveNut_grappler') {
                const leftRightSign = grapplerComponent.userData.leftRightSign
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
                grapplerComponent.rotateY(leftRightSign*thetaOffset + midTheta)
                grapplerComponent.rotateZ(-leftRightSign*padTwistActuation)
                grapplerComponent.material = (switchoverSignal==0) ? virtualAdaptiveNut.redMaterial : virtualAdaptiveNut.greenMaterial
              }
              else if (grapplerComponent.name==='adaptiveNut_pivot') {
                // Update the positions of the ends of the struts that are attached to the grapplers
                const leftRightSign = grapplerComponent.userData.leftRightSign
                const innerMiddleOuterSign1 = grapplerComponent.userData.innerMiddleOuterSign1
                const rOffsetPlusMinus = rOffsetPlus + innerMiddleOuterSign1*ballJointRadius
                const xOffset = rOffsetPlusMinus * -sinThetaOffset
                const zOffset = rOffsetPlusMinus * cosThetaOffset
                const yOffset = offset.y - padLiftActuationYComponent + pivotPointYComponent

                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
                  .add(internalForward.clone().multiplyScalar(yOffset))
              }
              else if (grapplerComponent.name==='adaptiveNut_post') {
                // Update the positions of the ends of the post that connects the pads to the pivots
                const leftRightSign = grapplerComponent.userData.leftRightSign
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
              else if (grapplerComponent.name==='adaptiveNut_strut') {  // Strut means the piston part
                // Update the positions of the ends of the struts that are attached to the grapplers
                const topBottomOffset = grapplerComponent.userData.topBottomOffset
                const leftRightSign = grapplerComponent.userData.leftRightSign
                const innerMiddleOuterSign1 = grapplerComponent.userData.innerMiddleOuterSign1
                const innerMiddleOuterSign2 = grapplerComponent.userData.innerMiddleOuterSign2
                const rOffsetPlusMinus = rOffsetPlus + innerMiddleOuterSign1*ballJointRadius
                const xOffset = rOffsetPlusMinus * -sinThetaOffset
                const zOffset = rOffsetPlusMinus * cosThetaOffset
                const yOffset = offset.y - padLiftActuationYComponent + pivotPointYComponent

                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
                  .add(internalForward.clone().multiplyScalar(yOffset))

                const anchorPoint = internalPosition.clone()
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*adaptiveNutWidthDiv2))
                  .add(internalUpward.clone().multiplyScalar(upwardsOffsetToAnchors + topBottomOffset*intraAnchorUpwardsSeparation + topBottomOffset*innerMiddleOuterSign2*interAnchorUpwardsSeparation ))
                  .add(internalForward.clone().multiplyScalar(offset.y))
                // Create a unit vector towards the anchorPoint
                const q1 = new THREE.Quaternion
                const tangent = anchorPoint.clone().sub(grapplerComponent.position).normalize()
                q1.setFromUnitVectors(grapplerComponent.up, tangent)
                grapplerComponent.setRotationFromQuaternion(q1)
              }
              else if (grapplerComponent.name==='adaptiveNut_cylinder') {  // cylinder means the piston cylinder part
                // Update the positions of the ends of the cylinders that are attached to the grapplers
                const topBottomOffset = grapplerComponent.userData.topBottomOffset
                const leftRightSign = grapplerComponent.userData.leftRightSign
                const innerMiddleOuterSign1 = grapplerComponent.userData.innerMiddleOuterSign1
                const innerMiddleOuterSign2 = grapplerComponent.userData.innerMiddleOuterSign2
                const rOffsetPlusMinus = rOffsetPlus + innerMiddleOuterSign1*ballJointRadius
                const xOffset = rOffsetPlusMinus * -sinThetaOffset
                const zOffset = rOffsetPlusMinus * cosThetaOffset
                const yOffset = offset.y - padLiftActuationYComponent + pivotPointYComponent

                const anchorPoint = internalPosition.clone()
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*(grapplersSidewaysOffset - xOffset))) // ToDo: This should be a parameter
                  .add(internalUpward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
                  .add(internalForward.clone().multiplyScalar(yOffset))

                grapplerComponent.position.copy(internalPosition)
                  .add(internalRightward.clone().multiplyScalar(leftRightSign*adaptiveNutWidthDiv2))
                  .add(internalUpward.clone().multiplyScalar(upwardsOffsetToAnchors + topBottomOffset*intraAnchorUpwardsSeparation + topBottomOffset*innerMiddleOuterSign2*interAnchorUpwardsSeparation))
                  .add(internalForward.clone().multiplyScalar(offset.y))

                // Create a unit vector towards the anchorPoint
                const q1 = new THREE.Quaternion
                const tangent = anchorPoint.clone().sub(grapplerComponent.position).normalize()
                q1.setFromUnitVectors(grapplerComponent.up, tangent)
                grapplerComponent.setRotationFromQuaternion(q1)
              }
            })
          }
          else if ((child.name==='adaptiveNut_body') || (child.name==='adaptiveNut_bodyFromModel')) {
            child.position.copy(internalPosition)
              .add(internalRightward.clone().multiplyScalar(virtualAdaptiveNut.sidewaysOffset))
              .add(internalUpward.clone().multiplyScalar(virtualAdaptiveNut.upwardsOffset))
              .add(internalForward.clone().multiplyScalar(virtualAdaptiveNut.forwardsOffset))
            child.setRotationFromQuaternion(internalOrientation)
          }
          child.visible = true
        })
        om.matrixValid = false
      }
      om.visible = virtualAdaptiveNut.isVisible
    }

    getFuturePosition(refFrame, timeDeltaInSeconds) {

      const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualAdaptiveNut.slowDownPassageOfTime, refFrame.timeSinceStart + timeDeltaInSeconds)
      const deltaT = adjustedTimeSinceStart - this.timeLaunched
      if (deltaT<=refFrame.curve.getDuration()) {
        const res = refFrame.curve.findRelevantCurve(deltaT)
        const relevantCurve = res.relevantCurve
        const d = relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength
        //const i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
        const pointOnRelevantCurve = relevantCurve.getPointAt(Math.max(0, d))
        return pointOnRelevantCurve
      }
      else {
        return null
      }
  
    }
  
  }
  
  