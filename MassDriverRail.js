import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves'

export class massDriverRailModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits, curve, index, count, massDriverRailMaterials) {

    const width = dParamWithUnits['launcherMassDriverRailWidth'].value
    const height = dParamWithUnits['launcherMassDriverRailHeight'].value
    const modelLengthSegments = 32    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
    const modelRadialSegments = 32
    const tubePoints = []
    const shape = new THREE.Shape()

    // This is minor repeated work and duplicated memory - same shape can be used for all models
    shape.moveTo( width/2 , height/2 )
    shape.lineTo( width/2 , -height/2 )
    shape.lineTo( -width/2 , -height/2 )
    shape.lineTo( -width/2 , height/2 )
    shape.lineTo( width/2 , height/2 )

    // Now we need a reference point in the middle of this segment of the whole mass driver
    const modelCenterPosition = (index + 0.5) / count
    const refPoint = curve.getPointAt(modelCenterPosition)
    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
    const orientation = curve.getQuaternionAt(modelCenterPosition, modelForward, modelUpward).invert()

    // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
    for (let i = 0; i<=modelLengthSegments; i++) {
      const modelPointPosition = (index*modelLengthSegments + i) / (modelLengthSegments*count)
      tubePoints.push(curve.getPointAt(modelPointPosition).sub(refPoint).applyQuaternion(orientation))
    }
    const massDriverSegmentCurve = new CatmullRomSuperCurve3(tubePoints)
    const extrudeSettings = {
      steps: modelLengthSegments,
      depth: 1,
      extrudePath: massDriverSegmentCurve
    }
    const massDriverRailGeometry = new THREE.ExtrudeGeometry( shape, extrudeSettings )
    massDriverRailGeometry.name = "massDriverRailGeometry"
    // ToDo: We are creating multiple identical materials here.  We should create one material and reuse it.
    const massDriverRailMaterial = massDriverRailMaterials[(index % 16 == 0) ? 1 : 0]
    const massDriverRailMesh = new THREE.Mesh(massDriverRailGeometry, massDriverRailMaterial)
    return massDriverRailMesh
  }
}

export class virtualMassDriverRail {
    constructor(d, unallocatedModelsArray) {
      this.d = d
      this.unallocatedModels = unallocatedModelsArray
      this.model = null
    }
  
    static update(dParamWithUnits, versionNumber) {
      virtualMassDriverRail.isVisible = dParamWithUnits['showMassDriverRail'].value
      virtualMassDriverRail.upwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value //- dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverRailHeight'].value/2
      virtualMassDriverRail.isDynamic =  false
      virtualMassDriverRail.hasChanged = true
      virtualMassDriverRail.versionNumber = versionNumber
    }
  
    placeAndOrientModel(om, refFrame) {
      const d = this.d 
      if (d==='undefined' || (d<0) || (d>1)) {
        console.log("error!!!")
      }
      else {
        if (virtualMassDriverRail.isVisible) {
          if (this.versionNumber!=virtualMassDriverRail.versionNumber) {
            // Something about the design has been updated so this instance also needs to be updated
            const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
            const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

            // ToDo: Could be more efficienct to call gerRelevantCurve once and then use the result for normal, position, and orientation
            // const forward = refFrame.curve.getTangentAt(d)
            const upward = refFrame.curve.getNormalAt(d)
            // const rightward = refFrame.curve.getBinormalAt(d)
            this.position = refFrame.curve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverRail.sidewaysOffset))
              .add(upward.clone().multiplyScalar(virtualMassDriverRail.upwardsOffset))
            this.orientation = refFrame.curve.getQuaternionAt(d, modelForward, modelUpward)
            this.versionNumber = virtualMassDriverRail.versionNumber
          }
  
          om.position.copy(this.position)
          om.setRotationFromQuaternion(this.orientation)
        }
        om.visible = virtualMassDriverRail.isVisible
        om.matrixValid = false
        if (this.perfOptimizedThreeJS) om.freeze()
      }
    }
  
  }
  