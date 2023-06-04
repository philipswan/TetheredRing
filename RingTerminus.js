import * as tram from './tram.js'

export class virtualRingTerminus {
    constructor(positionInFrameOfReference, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual ringTerminuses...
    static mainRingCurve
    static ringTerminusRelativePosition_r
    static ringTerminusRelativePosition_y
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv, mainRingCurve) {
        virtualRingTerminus.mainRingCurve = mainRingCurve
        const ringTerminusOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['ringTerminusOutwardOffset'].value
        const ringTerminusUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value
        virtualRingTerminus.ringTerminusRelativePosition_r = tram.offset_r(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
        virtualRingTerminus.ringTerminusRelativePosition_y = tram.offset_y(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
        virtualRingTerminus.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualRingTerminus.isVisible = dParamWithUnits['showRingTerminuses'].value
        virtualRingTerminus.isDynamic =  false
        virtualRingTerminus.hasChanged = true
    }

    placeAndOrientModel(om, refFrame) {
        const modelsTrackPosition = (this.p + refFrame.p) % 1 
        if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
            console.log("error!!!")
        }
        else {
            const pointOnRingCurve = virtualRingTerminus.mainRingCurve.getPoint(modelsTrackPosition)
            const angle = 2 * Math.PI * modelsTrackPosition
            om.position.set(
                pointOnRingCurve.x + virtualRingTerminus.ringTerminusRelativePosition_r * Math.cos(angle),
                pointOnRingCurve.y + virtualRingTerminus.ringTerminusRelativePosition_y,
                pointOnRingCurve.z + virtualRingTerminus.ringTerminusRelativePosition_r * Math.sin(angle) )
            om.rotation.set(0, -angle, virtualRingTerminus.currentEquivalentLatitude)
            om.rotateZ(-Math.PI/2)
            om.rotateY(-Math.PI/2)
            om.visible = virtualRingTerminus.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
}
  