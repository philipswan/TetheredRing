import * as tram from './tram.js'

export class virtualGroundTerminus {
    constructor(positionInFrameOfReference, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual groundTerminuses...
    static mainRingCurve
    static groundTerminusRelativePosition_r
    static groundTerminusRelativePosition_y
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv, mainRingCurve) {
        virtualGroundTerminus.mainRingCurve = mainRingCurve
        const groundTerminusOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['groundTerminusOutwardOffset'].value
        const groundTerminusUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['groundTerminusUpwardOffset'].value - crv.currentMainRingAltitude
        virtualGroundTerminus.groundTerminusRelativePosition_r = tram.offset_r(groundTerminusOutwardOffset, groundTerminusUpwardOffset, crv.currentEquivalentLatitude)
        virtualGroundTerminus.groundTerminusRelativePosition_y = tram.offset_y(groundTerminusOutwardOffset, groundTerminusUpwardOffset, crv.currentEquivalentLatitude)
        virtualGroundTerminus.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualGroundTerminus.isVisible = dParamWithUnits['showGroundTerminuses'].value
        virtualGroundTerminus.isDynamic =  false
        virtualGroundTerminus.hasChanged = true
    }

    placeAndOrientModel(om, refFrame) {
        const modelsTrackPosition = (this.p + refFrame.p) % 1 
        if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
            console.log("error!!!")
        }
        else {
            const pointOnRingCurve = virtualGroundTerminus.mainRingCurve.getPoint(modelsTrackPosition)
            const angle = 2 * Math.PI * modelsTrackPosition
            om.position.set(
                pointOnRingCurve.x + virtualGroundTerminus.groundTerminusRelativePosition_r * Math.cos(angle),
                pointOnRingCurve.y + virtualGroundTerminus.groundTerminusRelativePosition_y,
                pointOnRingCurve.z + virtualGroundTerminus.groundTerminusRelativePosition_r * Math.sin(angle) )
            om.rotation.set(0, -angle, virtualGroundTerminus.currentEquivalentLatitude)
            om.rotateZ(-Math.PI/2)
            om.rotateY(-Math.PI/2)
            om.visible = virtualGroundTerminus.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
}
