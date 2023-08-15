import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves'

export class massDriverTubeModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits, curve, segmentIndex) {

    const massDriverTubeSegments = dParamWithUnits['numVirtualMassDriverTubes'].value
    const radius = dParamWithUnits['launcherMassDriverTubeRadius'].value
    const modelLengthSegments = 32    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
    const modelRadialSegments = 32
    const tubePoints = []

    // Now we need a reference point in the middle of this segment of the whole mass driver
    const modelsCurvePosition = (segmentIndex + 0.5) / massDriverTubeSegments
    const res = curve.findRelevantCurveAt(modelsCurvePosition)
    if (res==2) {
      console.log('sledReturn')
    }
    // Debug code
    // const subCurveD = curve.getSubcurveD(modelsCurvePosition, res.relevantCurveStartPosition, res.relevantCurveLength)
    // const t = curve.superCurves[0].getUtoTmapping(subCurveD)
    // console.log(modelsCurvePosition, subCurveD, t)

    const refPoint = curve.getPointAt(modelsCurvePosition)
    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
    const orientation = curve.getQuaternionAt(modelsCurvePosition, modelForward, modelUpward).invert()

    // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
    for (let i = 0; i<=modelLengthSegments; i++) {
      const modelsCurvePosition = (segmentIndex + i/modelLengthSegments) / massDriverTubeSegments
      if (modelsCurvePosition>1) console.log(modelsCurvePosition)
      try {
        tubePoints.push(curve.getPointAt(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
      }
      catch (e) {
        console.log('error!!!')
        curve.getPointAt(modelsCurvePosition)
      }
    }
    const massDriverSegementCurve = new CatmullRomSuperCurve3(tubePoints)
    const massDriverTubeGeometry = new THREE.TubeGeometry(massDriverSegementCurve, modelLengthSegments, radius, modelRadialSegments, false)
    const massDriverTubeMaterial = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, transparent: true, opacity: 0.25})
    const massDriverTubeMesh = new THREE.Mesh(massDriverTubeGeometry, massDriverTubeMaterial)

    // Debug code
    // const blueMaterial = new THREE.MeshLambertMaterial({color: 0x4040df})
    // const massDriverTubeMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), blueMaterial)
    // massDriverTubeMesh.position.copy(refPoint)

    return massDriverTubeMesh
  }
}

export class virtualMassDriverTube {
    constructor(d, unallocatedModelsArray) {
      this.d = d
      this.unallocatedModels = unallocatedModelsArray
      this.model = null
    }
  
    static update(dParamWithUnits, versionNumber) {
      virtualMassDriverTube.isVisible = dParamWithUnits['showMassDriverTube'].value
      virtualMassDriverTube.isDynamic =  false
      virtualMassDriverTube.hasChanged = true
      virtualMassDriverTube.versionNumber = versionNumber
    }
  
    placeAndOrientModel(om, refFrame) {
      const d = this.d 
      if (d===undefined || (d<0) || (d>1)) {
        console.log("error!!!")
      }
      else {
        if (virtualMassDriverTube.isVisible) {
          if (this.versionNumber!=virtualMassDriverTube.versionNumber) {
            // Something about the design has been updated so this instance also needs to be updated
            const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
            const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
            // const forward = refFrame.curve.getTangentAt(d)
            // const upward = refFrame.curve.getNormalAt(d)
            // const rightward = refFrame.curve.getBinormalAt(d)
            this.position = refFrame.curve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverTube.sidewaysOffset))
              // .add(upward.clone().multiplyScalar(virtualMassDriverTube.upwardsOffset))
            this.orientation = refFrame.curve.getQuaternionAt(d, modelForward, modelUpward)
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
  