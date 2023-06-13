import * as tram from './tram.js'

export class virtualHabitat {
    constructor(positionInFrameOfReference, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual habitats...
    static habitatRelativePosition_r
    static habitatRelativePosition_y
    static habitatOutwardOffset
    static habitatUpwardOffset
    static habitatForwardOffset
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv) {
        const ringTerminusOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['ringTerminusOutwardOffset'].value
        const ringTerminusUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value
        virtualHabitat.habitatOutwardOffset = dParamWithUnits['habitatOutwardOffset'].value
        virtualHabitat.habitatUpwardOffset = dParamWithUnits['habitatUpwardOffset'].value
        virtualHabitat.habitatForwardOffset = dParamWithUnits['habitatForwardOffset'].value
        virtualHabitat.habitatRelativePosition_r = tram.offset_r(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
        virtualHabitat.habitatRelativePosition_y = tram.offset_y(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
        virtualHabitat.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualHabitat.isVisible = dParamWithUnits['showHabitats'].value
        virtualHabitat.isDynamic =  false
        virtualHabitat.hasChanged = true
    }

    placeAndOrientModel(om, refFrame, wedgeToCameraDistance) {
        const modelsTrackPosition = (this.p + refFrame.p) % 1 
        if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
          console.log("error!!!")
        }
        else {
            const pointOnRingCurve = refFrame.curve.getPoint(modelsTrackPosition)
            const angle = 2 * Math.PI * modelsTrackPosition
            om.position.set(
                pointOnRingCurve.x + virtualHabitat.habitatRelativePosition_r * Math.cos(angle),
                pointOnRingCurve.y + virtualHabitat.habitatRelativePosition_y,
                pointOnRingCurve.z + virtualHabitat.habitatRelativePosition_r * Math.sin(angle) )
            om.rotation.set(0, -angle, virtualHabitat.currentEquivalentLatitude)
            om.rotateZ(-Math.PI/2)
            om.rotateY(-Math.PI/2)
            om.visible = virtualHabitat.isVisible
            om.matrixValid = false
            om.children[0].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset, virtualHabitat.habitatOutwardOffset)
            om.children[1].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset, virtualHabitat.habitatOutwardOffset)
            om.children[2].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset + om.children[2].userData['upwardOffset'], virtualHabitat.habitatOutwardOffset)
            om.children[3].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset + om.children[3].userData['upwardOffset'], virtualHabitat.habitatOutwardOffset)
            om.children[4].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset + om.children[4].userData['upwardOffset'], virtualHabitat.habitatOutwardOffset)
            om.updateMatrixWorld()
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
}
  