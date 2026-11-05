import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { quaternionFromFrame } from '../curves/SuperCurves.js'
import { MovingVirtualObject, curveFrameAtTime, parameterSignature } from './VirtualObject.js'

const MODEL_FORWARD = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
const MODEL_UPWARD = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
const MODEL_FORWARD_STRETCH = 1.75  // The sled's model is stretched lengthwise by this much

// How far ahead of the point on its path the front of the launch sled is (m).
export function launchSledFrontReach(dParamWithUnits) {
  return (dParamWithUnits['launchSledForwardsOffset'].value + dParamWithUnits['launchSledBodyLength'].value)
    * dParamWithUnits['launchSystemForwardScaleFactor'].value * MODEL_FORWARD_STRETCH
}

export class launchSledModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, _unusedLegacyFlag, massDriverScrewTexture) {
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
      dParamWithUnits['launchSystemForwardScaleFactor'].value*MODEL_FORWARD_STRETCH,
      dParamWithUnits['launchSystemUpwardScaleFactor'].value)

    decorateAndSave(launchSledMesh, unallocatedModelsList, objName, scaleFactorVector, launchSledNumModels, _unusedLegacyFlag)

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

    function decorateAndSave(object, unallocatedModelsList, objName, scaleFactorVector, n, _unusedLegacyFlag) {
      object.scale.set(scaleFactorVector.x, scaleFactorVector.y, scaleFactorVector.z)
      object.visible = false
      object.name = objName
      object.traverse(child => {
      if (child!==object) {
          child.name = objName+'_'+child.name
      }
      })
      object.updateMatrixWorld()
      for (let i=0; i<Math.max(1, n); i++) {  // at least one model: the pool's template
          const tempModel = object.clone()
          unallocatedModelsList.push(tempModel)
      }
    }

  }
  
}

export class virtualLaunchSled extends MovingVirtualObject {

  static unallocatedModels = []
  static activeObjects = new Map()
  static className = 'virtualLaunchSleds'
  static modelsAreRecyleable = true
  static highlightClass = 'massDriver'
  static isDynamic = true

  static signatureOf(dParamWithUnits) {
    return parameterSignature(dParamWithUnits, ['launchSled', 'launchSystem'], ['Offset', 'CameraRange'])
  }

  static isTeardownRequired(dParamWithUnits) {
    const newNumObjects = dParamWithUnits['showLaunchSleds'].value ? dParamWithUnits['numVirtualLaunchSleds'].value : 0
    return newNumObjects!==virtualLaunchSled.numObjects
  }

  static update(dParamWithUnits) {
    const v = virtualLaunchSled
    v.numObjects = dParamWithUnits['showLaunchSleds'].value ? dParamWithUnits['numVirtualLaunchSleds'].value : 0
    v.tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
    v.sidewaysOffset = dParamWithUnits['launchSledSidewaysOffset'].value
    v.upwardsOffset = dParamWithUnits['launchSledUpwardsOffset'].value
    v.forwardsOffset = dParamWithUnits['launchSledForwardsOffset'].value
    v.bodyLength = dParamWithUnits['launchSledBodyLength'].value
    v.rightwardScale = dParamWithUnits['launchSystemRightwardScaleFactor'].value
    v.forwardScale = dParamWithUnits['launchSystemForwardScaleFactor'].value * MODEL_FORWARD_STRETCH  // matches the model's scale
    v.upwardScale = dParamWithUnits['launchSystemUpwardScaleFactor'].value
    v.isVisible = dParamWithUnits['showLaunchSleds'].value
    v.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    v.launcherStartDelayInSeconds = dParamWithUnits['launcherStartDelayInSeconds'].value
    v.isDynamic = true
    v.hasChanged = true
  }

  frameAt(refFrame, deltaT) {
    const v = virtualLaunchSled
    const f = curveFrameAtTime(refFrame.curve, deltaT, false)
    const forward = f.forward
    const upward = f.upward
    const rightward = new THREE.Vector3().crossVectors(forward, upward)
    const orientation = quaternionFromFrame(forward, upward, MODEL_FORWARD, MODEL_UPWARD)
    const position = f.point.clone()
    // The body is offset inside the (scaled) model; its centre is half a body length further forward.
    const centre = position.clone()
      .addScaledVector(rightward, v.sidewaysOffset * v.rightwardScale)
      .addScaledVector(upward, v.upwardsOffset * v.upwardScale)
      .addScaledVector(forward, (v.forwardsOffset + v.bodyLength / 2) * v.forwardScale)
    return { f, position, centre, forward, upward, rightward, orientation }
  }

  placeAndOrientModel(om, refFrame) {
    const v = virtualLaunchSled
    om.visible = v.isVisible
    if (!v.isVisible) return
    const deltaT = this.clampedDeltaT(refFrame)   // (negative while leaving the terminal)
    const frame = this.frameAt(refFrame, deltaT)
    om.position.copy(frame.position)
    om.quaternion.copy(frame.orientation)
    om.children.forEach(child => {
      if ((child.name==='launchSled_body') || (child.name==='launchSled_bodyFromModel')) {
        // Model axes: x = rightward, y = forward, z = upward
        child.position.set(v.sidewaysOffset, v.forwardsOffset, v.upwardsOffset)
        child.quaternion.identity()
      }
      child.visible = true
    })
  }
}
