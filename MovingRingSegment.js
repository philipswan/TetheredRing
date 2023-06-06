import * as tram from './tram.js'

export class virtualMovingRingSegment {
    constructor(positionInFrameOfReference, index, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.index = index
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual habitats...
    static currentEquivalentLatitude
    static movingRingRotZ
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv) {
        const movingRingOutwardOffset = dParamWithUnits['mainRingOutwardOffset'].value
        const movingRingUpwardOffset = dParamWithUnits['mainRingUpwardOffset'].value
        virtualMovingRingSegment.mro = (dParamWithUnits['numMainRings'].value - 1)/2
        virtualMovingRingSegment.mainRingSpacing = dParamWithUnits['mainRingSpacing'].value
        virtualMovingRingSegment.movingRingRelativePosition_r = tram.offset_r(movingRingOutwardOffset, movingRingUpwardOffset, crv.currentEquivalentLatitude)
        virtualMovingRingSegment.movingRingRelativePosition_y = tram.offset_y(movingRingOutwardOffset, movingRingUpwardOffset, crv.currentEquivalentLatitude)
        virtualMovingRingSegment.mainRingSpacing = dParamWithUnits['mainRingSpacing'].value
        virtualMovingRingSegment.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualMovingRingSegment.movingRingRotZ = crv.currentEquivalentLatitude - Math.PI/2
        virtualMovingRingSegment.isVisible = dParamWithUnits['showMovingRings'].value
        virtualMovingRingSegment.isDynamic =  false
        virtualMovingRingSegment.hasChanged = true
    }

    placeAndOrientModel(om, refFrame) {
        const modelsTrackPosition = (this.p + refFrame.p) % 1 
        if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
            console.log("error!!!")
        }
        else {
            const pointOnRingCurve = refFrame.curve.getPoint(modelsTrackPosition)
            const angle = 2 * Math.PI * modelsTrackPosition
            om.position.set(
                pointOnRingCurve.x + virtualMovingRingSegment.movingRingRelativePosition_r * Math.cos(angle),
                pointOnRingCurve.y + virtualMovingRingSegment.movingRingRelativePosition_y + (this.index-virtualMovingRingSegment.mro) * virtualMovingRingSegment.mainRingSpacing,
                pointOnRingCurve.z + virtualMovingRingSegment.movingRingRelativePosition_r * Math.sin(angle))
            om.rotation.set(0, -angle, virtualMovingRingSegment.movingRingRotZ)
            om.visible = virtualMovingRingSegment.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
}
  