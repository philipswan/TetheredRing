import * as tram from './tram.js'

export class virtualTransitTrackSegment {
    constructor(positionInFrameOfReference, unallocatedModelsArray) {
      this.p = positionInFrameOfReference
      this.unallocatedModels = unallocatedModelsArray
    }
  
    // The following properties are common to all track sections...
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged
  
    static update(dParamWithUnits, crv) {
      const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
      const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value
  
      virtualTransitTrackSegment.transitTrackRelativePosition_r = []
      virtualTransitTrackSegment.transitTrackRelativePosition_y = []
      for (let j = 0; j < ttnut; j++) {
        const ttuof = j - (ttnut - 1)/2  // Transit Track Upward Offset Factor
        const transitTrackUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['transitTrackUpwardOffset'].value + ttuof * dParamWithUnits['transitTrackUpwardSpacing'].value
        virtualTransitTrackSegment.transitTrackRelativePosition_r[j] = []
        virtualTransitTrackSegment.transitTrackRelativePosition_y[j] = []
        for (let i = 0; i < ttnot; i++) {
          const ttoof = i - (ttnot - 1)/2  // Transit Track Outward Offset Factor
          const transitTrackOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + dParamWithUnits['transitTrackOutwardOffset'].value + ttoof * dParamWithUnits['transitTrackOutwardSpacing'].value
          virtualTransitTrackSegment.transitTrackRelativePosition_r[j][i] = tram.offset_r(transitTrackOutwardOffset, transitTrackUpwardOffset, crv.currentEquivalentLatitude)
          virtualTransitTrackSegment.transitTrackRelativePosition_y[j][i] = tram.offset_y(transitTrackOutwardOffset, transitTrackUpwardOffset, crv.currentEquivalentLatitude)
        }
      }

      virtualTransitTrackSegment.currentEquivalentLatitude = crv.currentEquivalentLatitude
      virtualTransitTrackSegment.isVisible = dParamWithUnits['showTransitTrack'].value
      virtualTransitTrackSegment.isDynamic =  false
      virtualTransitTrackSegment.hasChanged = true
    }
  
    placeAndOrientModel(om, refFrame, wedgeToCameraDistance) {
      const modelsTrackPosition = (this.p + refFrame.p) % 1 
      if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
        console.log("error!!!")
      }
      else {
        const pointOnRingCurve = refFrame.curve.getPoint(modelsTrackPosition)
        const angle = 2 * Math.PI * modelsTrackPosition
        const j = om.userData.upwardIndex
        const i = om.userData.outwardIndex
        om.position.set(
          pointOnRingCurve.x + virtualTransitTrackSegment.transitTrackRelativePosition_r[j][i] * Math.cos(angle),
          pointOnRingCurve.y + virtualTransitTrackSegment.transitTrackRelativePosition_y[j][i],
          pointOnRingCurve.z + virtualTransitTrackSegment.transitTrackRelativePosition_r[j][i] * Math.sin(angle))
        om.rotation.set(0, -angle, virtualTransitTrackSegment.currentEquivalentLatitude)
        om.visible = virtualTransitTrackSegment.isVisible
        om.matrixValid = false
        if (this.perfOptimizedThreeJS) om.freeze()
      }
    }
  }
  