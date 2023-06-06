import * as tram from './tram.js'

export class virtualStationaryRingSegment {
    constructor(positionInFrameOfReference, index, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.index = index
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual habitats...
    static currentEquivalentLatitude
    static stationaryRingRotZ
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv) {
        const stationaryRingOutwardOffset = dParamWithUnits['mainRingOutwardOffset'].value
        const stationaryRingUpwardOffset = dParamWithUnits['mainRingUpwardOffset'].value
        virtualStationaryRingSegment.mro = (dParamWithUnits['numMainRings'].value - 1)/2
        virtualStationaryRingSegment.mainRingSpacing = dParamWithUnits['mainRingSpacing'].value
        virtualStationaryRingSegment.stationaryRingRelativePosition_r = tram.offset_r(stationaryRingOutwardOffset, stationaryRingUpwardOffset, crv.currentEquivalentLatitude)
        virtualStationaryRingSegment.stationaryRingRelativePosition_y = tram.offset_y(stationaryRingOutwardOffset, stationaryRingUpwardOffset, crv.currentEquivalentLatitude)
        virtualStationaryRingSegment.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualStationaryRingSegment.stationaryRingRotZ = crv.currentEquivalentLatitude - Math.PI/2
        virtualStationaryRingSegment.isVisible = dParamWithUnits['showStationaryRings'].value
        virtualStationaryRingSegment.isDynamic =  false
        virtualStationaryRingSegment.hasChanged = true
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
                pointOnRingCurve.x + virtualStationaryRingSegment.stationaryRingRelativePosition_r * Math.cos(angle),
                pointOnRingCurve.y + virtualStationaryRingSegment.stationaryRingRelativePosition_y + (this.index-virtualStationaryRingSegment.mro) * virtualStationaryRingSegment.mainRingSpacing,
                pointOnRingCurve.z + virtualStationaryRingSegment.stationaryRingRelativePosition_r * Math.sin(angle))
            om.rotation.set(0, -angle, virtualStationaryRingSegment.stationaryRingRotZ)
            om.visible = virtualStationaryRingSegment.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
}
  