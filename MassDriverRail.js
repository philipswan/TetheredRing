import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves'

export class massDriverRailModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits, massDriverSuperCurve, segmentIndex) {

    const massDriverRailSegments = dParamWithUnits['numVirtualMassDriverRails'].value
    const width = dParamWithUnits['launcherMassDriverRailWidth'].value
    const height = dParamWithUnits['launcherMassDriverRailHeight'].value
    const modelLengthSegments = 32    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
    const modelRadialSegments = 32
    const tubePoints = []
    const shape = new THREE.Shape()
    shape.moveTo( width/2 , height/2 )
    shape.lineTo( width/2 , -height/2 )
    shape.lineTo( -width/2 , -height/2 )
    shape.lineTo( -width/2 , height/2 )
    shape.lineTo( width/2 , height/2 )
    // Now we need a reference point in the middle of this segment of the whole mass driver
    const modelsCurvePosition = (segmentIndex + 0.5) / massDriverRailSegments
    const refPoint = massDriverSuperCurve.getPointAt(modelsCurvePosition)
    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
    const orientation = massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, modelsCurvePosition).invert()

    // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
    for (let i = 0; i<=modelLengthSegments; i++) {
      const modelsCurvePosition = (segmentIndex + i/modelLengthSegments) / massDriverRailSegments
      tubePoints.push(massDriverSuperCurve.getPointAt(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
    }
    const massDriverSegementCurve = new CatmullRomSuperCurve3(tubePoints)
    const extrudeSettings = {
      steps: 2,
      depth: 1,
      extrudePath: massDriverSegementCurve
    }
    const massDriverRailGeometry = new THREE.ExtrudeGeometry( shape, extrudeSettings )
    const massDriverRailMaterial = new THREE.MeshPhongMaterial( {color: 0x71797E })
    const massDriverRailMesh = new THREE.Mesh(massDriverRailGeometry, massDriverRailMaterial)
    return massDriverRailMesh
  }
}

export class virtualMassDriverRail {
    constructor(d) {
      this.d = d
      this.model = null
    }
  
    static update(dParamWithUnits, massDriverSuperCurve, versionNumber) {
      virtualMassDriverRail.massDriverSuperCurve = massDriverSuperCurve
      virtualMassDriverRail.isVisible = dParamWithUnits['showMassDriverRail'].value
      virtualMassDriverRail.upwardsOffset = dParamWithUnits['launchSledUpwardsOffset'].value - dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverRailHeight'].value/2
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
            // const forward = virtualMassDriverRail.massDriverSuperCurve.getTangentAt(d)
            const upward = virtualMassDriverRail.massDriverSuperCurve.getNormalAt(d)
            // const rightward = virtualMassDriverRail.massDriverSuperCurve.getBinormalAt(d)
            this.position = virtualMassDriverRail.massDriverSuperCurve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverRail.sidewaysOffset))
              .add(upward.clone().multiplyScalar(virtualMassDriverRail.upwardsOffset))
            this.orientation = virtualMassDriverRail.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
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
  