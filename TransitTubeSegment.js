import * as tram from './tram.js'

export class virtualTransitTubeSegment {
    constructor(positionInFrameOfReference, unallocatedModelsArray) {
      this.p = positionInFrameOfReference
      this.unallocatedModels = unallocatedModelsArray
    }
  
    // The following properties are common to all tube sections...
    static currentEquivalentLatitude
    static transitTubeRotZ
    static isVisible
    static isDynamic
    static hasChanged
  
    static update(dParamWithUnits, crv) {
      const transitTubeOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value
      const transitTubeUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value
      virtualTransitTubeSegment.transitTubeRelativePosition_r = tram.offset_r(transitTubeOutwardOffset, transitTubeUpwardOffset, crv.currentEquivalentLatitude)
      virtualTransitTubeSegment.transitTubeRelativePosition_y = tram.offset_y(transitTubeOutwardOffset, transitTubeUpwardOffset, crv.currentEquivalentLatitude)
      virtualTransitTubeSegment.currentEquivalentLatitude = crv.currentEquivalentLatitude
      virtualTransitTubeSegment.isVisible = dParamWithUnits['showTransitTube'].value
      virtualTransitTubeSegment.isDynamic =  false
      virtualTransitTubeSegment.hasChanged = true
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
          pointOnRingCurve.x + virtualTransitTubeSegment.transitTubeRelativePosition_r * Math.cos(angle),
          pointOnRingCurve.y + virtualTransitTubeSegment.transitTubeRelativePosition_y,
          pointOnRingCurve.z + virtualTransitTubeSegment.transitTubeRelativePosition_r * Math.sin(angle))
        om.rotation.set(0, -angle, virtualTransitTubeSegment.currentEquivalentLatitude)
        om.visible = virtualTransitTubeSegment.isVisible
        om.matrixValid = false
        if (this.perfOptimizedThreeJS) om.freeze()
      }
    }
  }
  