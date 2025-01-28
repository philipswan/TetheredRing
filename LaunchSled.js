import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import * as tram from './tram.js'

export class launchSledModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, perfOptimizedThreeJS, massDriverScrewTexture) {
    // Manually Create the Launch Vehicle
    const width = dParamWithUnits['launchSledWidth'].value
    const height = dParamWithUnits['launchSledHeight'].value
    const bodyLength = dParamWithUnits['launchSledBodyLength'].value
    const objName = 'launchSled'
    const launchSledNumModels = dParamWithUnits['launchSledNumModels'].value

    // Proceedurally generate the Launch Sled's body (note: y-axis is in the direction the rocket is pointing, z-axis is up when the rocket is lying on it's side)
    const launchSledBodyGeometry = new THREE.BoxGeometry(width, bodyLength, height, 1, 1, 1)
    launchSledBodyGeometry.translate(0, bodyLength/2, 0)
    const launchSledBodyMaterial = new THREE.MeshPhongMaterial( {color: 0x7f3f00})
    const launchSledBodyMesh = new THREE.Mesh(launchSledBodyGeometry, launchSledBodyMaterial)
    launchSledBodyMesh.name = 'body'
    const launchSledMesh = new THREE.Group().add(launchSledBodyMesh)
    launchSledMesh.name = 'launchSled'
    const scaleFactorVector = new THREE.Vector3(
      dParamWithUnits['launchSystemRightwardScaleFactor'].value,
      dParamWithUnits['launchSystemForwardScaleFactor'].value*1.75,
      dParamWithUnits['launchSystemUpwardScaleFactor'].value)

    decorateAndSave(launchSledMesh, unallocatedModelsList, objName, scaleFactorVector, launchSledNumModels, perfOptimizedThreeJS)

    // Load the Launch Sled's Mesh from a model, but then proceedurally generate the grapplers
    function prepareACallbackFunctionForFBXLoader (myScene) {
      // This is the additional work we want to do later, after the loader get's around to loading our model...
      return function(object) {
        object.children[0].scale.set(0.6, 1, 1.5)  // A bit hacky - Alastair's sled model is too wide and thin
        object.children[0].position.set(0, 0, 0) // reposition vertically after making the sled thicker
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

    function decorateAndSave(object, unallocatedModelsList, objName, scaleFactorVector, n, perfOptimizedThreeJS) {
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
    constructor(timeLaunched) {
        // The virtual vehicle has a position along the launch trajectory curve.
        // 0 represents the begginning of the mass driver, 1 represents 't==durationOfLaunchTrajectory'
        this.timeLaunched = timeLaunched
        this.model = null
    }

    // These parameters are required for all objects
    static unallocatedModels = []
    
    static update(dParamWithUnits, launcherMassDriverLength, scene, clock) {
      virtualLaunchSled.clock = clock
      virtualLaunchSled.updatePeriod = 1  // seconds (really we need to vary this depending on how far along the mass driver we are...)
  
      virtualLaunchSled.timeOfLastUpdate = clock.getElapsedTime() - virtualLaunchSled.updatePeriod
      virtualLaunchSled.sidewaysOffset = dParamWithUnits['launchSledSidewaysOffset'].value
      virtualLaunchSled.upwardsOffset = dParamWithUnits['launchSledUpwardsOffset'].value
      virtualLaunchSled.forwardsOffset = dParamWithUnits['launchSledForwardsOffset'].value
      virtualLaunchSled.isVisible = dParamWithUnits['showLaunchSleds'].value
      virtualLaunchSled.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value

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
        const orientation = relevantCurve.getQuaternionAt(d, modelForward, modelUpward)
  
        // Create a new screw geometry to represent the adaptive nut
        const timeNow = virtualLaunchSled.clock.getElapsedTime()
        const updateNow = (timeNow>virtualLaunchSled.timeOfLastUpdate+virtualLaunchSled.updatePeriod)
        if (updateNow) {
          virtualLaunchSled.timeOfLastUpdate += virtualLaunchSled.updatePeriod
        }
      
        om.position.copy(pointOnRelevantCurve)
        om.setRotationFromQuaternion(orientation)
        const internalPosition = new THREE.Vector3(0, 0, 0)
        const internalRightward = new THREE.Vector3(1, 0, 0)
        const internalUpward = new THREE.Vector3(0, 0, 1)
        const internalForward = new THREE.Vector3(0, 1, 0)
        const internalOrientation = new THREE.Quaternion().identity()

        om.children.forEach(child => {
          if ((child.name==='launchSled_body') || (child.name==='launchSled_bodyFromModel')) {
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
  
  