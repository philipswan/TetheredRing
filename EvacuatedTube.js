import * as THREE from 'three'

export class virtualEvacuatedTube {
    constructor(positionInFrameOfReference, orientation) {
      this.p = positionInFrameOfReference
      this.orientation = orientation
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
  