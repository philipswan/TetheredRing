import { createLaunchSledBody, launchSledLayout } from './LaunchSledGeometry.js'
import * as THREE from 'three'
import { quaternionFromFrame } from '../curves/SuperCurves.js'
import { MovingVirtualObject, curveFrameAtTime, parameterSignature } from './VirtualObject.js'

const MODEL_FORWARD = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
const MODEL_UPWARD = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

// How far ahead of the point on its path the front of the launch sled is (m).
export function launchSledFrontReach(dParamWithUnits) {
  const layout = launchSledLayout(dParamWithUnits)
  return (layout.aft + layout.length)
    * dParamWithUnits['launchSystemForwardScaleFactor'].value
}

export class launchSledModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, _unusedLegacyFlag, massDriverScrewTexture) {
    const objName = 'launchSled'
    const launchSledNumModels = dParamWithUnits['launchSledNumModels'].value
    const launchSledBodyMesh = createLaunchSledBody(dParamWithUnits)
    const launchSledMesh = new THREE.Group().add(launchSledBodyMesh)
    launchSledMesh.name = 'launchSled'
    const scaleFactorVector = new THREE.Vector3(
      dParamWithUnits['launchSystemRightwardScaleFactor'].value,
      dParamWithUnits['launchSystemForwardScaleFactor'].value,
      dParamWithUnits['launchSystemUpwardScaleFactor'].value)

    decorateAndSave(launchSledMesh, unallocatedModelsList, objName, scaleFactorVector, launchSledNumModels, _unusedLegacyFlag)

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
    return parameterSignature(dParamWithUnits, ['launchSled', 'launchSystem', 'launchVehicleRadius', 'launchVehicleScaleFactor', 'launchVehicleBodyLength',
      'launchVehicleUpwardsOffset', 'launchVehicleSidewaysOffset', 'launchVehicleForwardsOffset', 'launchRailUpwardsOffset',
      'launcherMassDriverRail', 'adaptiveNutBodyLength', 'adaptiveNutGrapplerLength', 'adaptiveNutGrapplerBallJointRadius'], ['CameraRange'])
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
    v.forwardsOffset = launchSledLayout(dParamWithUnits).aft
    v.centreZ = launchSledLayout(dParamWithUnits).centreZ
    v.bodyLength = launchSledLayout(dParamWithUnits).length
    v.rightwardScale = dParamWithUnits['launchSystemRightwardScaleFactor'].value
    v.forwardScale = dParamWithUnits['launchSystemForwardScaleFactor'].value  // matches the model's scale
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
      .addScaledVector(upward, (v.upwardsOffset + v.centreZ) * v.upwardScale)
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
      if (child.name==='launchSled_body') {
        // Model axes: x = rightward, y = forward, z = upward
        child.position.set(v.sidewaysOffset, v.forwardsOffset, v.upwardsOffset)
        child.quaternion.identity()
      }
      child.visible = true
    })
  }
}
