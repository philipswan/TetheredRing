import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves'

export class massDriverTubeModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits, massDriverSuperCurve, segmentIndex) {

    const massDriverTubeSegments = dParamWithUnits['numVirtualMassDriverTubes'].value
    const radius = dParamWithUnits['launcherMassDriverTubeRadius'].value
    const modelLengthSegments = 32    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
    const modelRadialSegments = 32
    const tubePoints = []

    // Now we need a reference point in the middle of this segment of the whole mass driver
    const modelsCurvePosition = (segmentIndex + 0.5) / massDriverTubeSegments
    const refPoint = massDriverSuperCurve.getPointAt(modelsCurvePosition)
    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
    const orientation = massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, modelsCurvePosition).invert()

    // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
    for (let i = 0; i<=modelLengthSegments; i++) {
      const modelsCurvePosition = (segmentIndex + i/modelLengthSegments) / massDriverTubeSegments
      tubePoints.push(massDriverSuperCurve.getPointAt(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
    }
    const massDriverSegementCurve = new CatmullRomSuperCurve3(tubePoints)
    const massDriverTubeGeometry = new THREE.TubeGeometry(massDriverSegementCurve, modelLengthSegments, radius, modelRadialSegments, false)
    const massDriverTubeMaterial = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, transparent: true, opacity: 0.25})
    const massDriverTubeMesh = new THREE.Mesh(massDriverTubeGeometry, massDriverTubeMaterial)
    return massDriverTubeMesh
  }
}

export class virtualMassDriverTube {
    constructor(d) {
      this.d = d
      this.model = null
    }
  
    static update(dParamWithUnits, massDriverSuperCurve, versionNumber) {
      virtualMassDriverTube.massDriverSuperCurve = massDriverSuperCurve
      virtualMassDriverTube.isVisible = dParamWithUnits['showMassDriverTube'].value
      virtualMassDriverTube.isDynamic =  false
      virtualMassDriverTube.hasChanged = true
      virtualMassDriverTube.versionNumber = versionNumber
    }
  
    placeAndOrientModel(om, refFrame) {
      const d = this.d 
      if (d==='undefined' || (d<0) || (d>1)) {
        console.log("error!!!")
      }
      else {
        if (virtualMassDriverTube.isVisible) {
          if (this.versionNumber!=virtualMassDriverTube.versionNumber) {
            // Something about the design has been updated so this instance also needs to be updated
            const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
            const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
            // const forward = virtualMassDriverTube.massDriverSuperCurve.getTangentAt(d)
            // const upward = virtualMassDriverTube.massDriverSuperCurve.getNormalAt(d)
            // const rightward = virtualMassDriverTube.massDriverSuperCurve.getBinormalAt(d)
            this.position = virtualMassDriverTube.massDriverSuperCurve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverTube.sidewaysOffset))
              // .add(upward.clone().multiplyScalar(virtualMassDriverTube.upwardsOffset))
            this.orientation = virtualMassDriverTube.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
            this.versionNumber = virtualMassDriverTube.versionNumber
          }
  
          om.position.copy(this.position)
          om.setRotationFromQuaternion(this.orientation)
        }
        om.visible = virtualMassDriverTube.isVisible
        om.matrixValid = false
        if (this.perfOptimizedThreeJS) om.freeze()
      }
    }
  
  }
  