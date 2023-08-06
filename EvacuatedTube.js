import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves'

export class evacuatedTubeModel {
    // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
    // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
    // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
    // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
    constructor(dParamWithUnits, evacuatedTubeCurve, segmentIndex) {
  
        const evacuatedTubeSegments = dParamWithUnits['launcherEvacuatedTubeNumModels'].value
        const radius = dParamWithUnits['launcherEvacuatedTubeRadius'].value
        const modelLengthSegments = 32
        const modelRadialSegments = 32
        const tubePoints = []
    
        // Now we need a reference point in the middle of this segment of the whole mass driver
        const modelsCurvePosition = (segmentIndex + 0.5) / evacuatedTubeSegments
        const refPoint = evacuatedTubeCurve.getPoint(modelsCurvePosition)
        const orientation = new THREE.Quaternion()
        orientation.setFromUnitVectors(evacuatedTubeCurve.getTangent(modelsCurvePosition), new THREE.Vector3(0, 1, 0))
    
        // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
        for (let i = 0; i<=modelLengthSegments; i++) {
            const modelsCurvePosition = (segmentIndex + i/modelLengthSegments) / evacuatedTubeSegments
            tubePoints.push(evacuatedTubeCurve.getPoint(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
        }
    
        const evacuatedTubeSegementCurve = new CatmullRomSuperCurve3(tubePoints)
        const evacuatedTubeTubeGeometry = new THREE.TubeGeometry(evacuatedTubeSegementCurve, modelLengthSegments, radius, modelRadialSegments, false)
        const evacuatedTubeTubeMaterial = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, transparent: true, opacity: 0.25})
        const evacuatedTubeTubeMesh = new THREE.Mesh(evacuatedTubeTubeGeometry, evacuatedTubeTubeMaterial)
    
        return evacuatedTubeTubeMesh
    }
}
  
  
export class virtualEvacuatedTube {
    constructor(positionInFrameOfReference, orientation, unallocatedModelsArray) {
      this.p = positionInFrameOfReference
      this.orientation = orientation
      this.unallocatedModels = unallocatedModelsArray
      this.model = null
    }
  
    static update(dParamWithUnits, evacuatedTubeCurve) {
        virtualEvacuatedTube.evacuatedTubeCurve = evacuatedTubeCurve
        virtualEvacuatedTube.isVisible = dParamWithUnits['showEvacuatedTube'].value
        virtualEvacuatedTube.isDynamic =  false
        virtualEvacuatedTube.hasChanged = true
    }

    placeAndOrientModel(om, refFrame) {
        const modelsCurvePosition = this.p 
        if (modelsCurvePosition==='undefined' || (modelsCurvePosition<0) || (modelsCurvePosition>1)) {
            console.log("error!!!")
        }
        else {
            const pointOnEvacuatedTubeCurve = virtualEvacuatedTube.evacuatedTubeCurve.getPoint(modelsCurvePosition)
            //const tangentToEvacuatedTubeCurve = virtualEvacuatedTube.evacuatedTubeCurve.getTangent(modelsCurvePosition)
            om.position.set(
                pointOnEvacuatedTubeCurve.x,
                pointOnEvacuatedTubeCurve.y,
                pointOnEvacuatedTubeCurve.z)
            om.rotation.setFromQuaternion(this.orientation)
            om.visible = virtualEvacuatedTube.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
  
}
  