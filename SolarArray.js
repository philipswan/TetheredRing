import * as tram from './tram.js'

export class virtualSolarArray {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
  }

  // The following properties are common to all virtual habitats...
  static mainRingCurve
  static currentEquivalentLatitude
  static solarArrayRotZ
  static isVisible
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, crv, mainRingCurve) {
    virtualSolarArray.mainRingCurve = mainRingCurve 
    const solarArrayOutwardOffset = dParamWithUnits['solarArrayOutwardOffset'].value
    const solarArrayUpwardOffset = dParamWithUnits['solarArrayUpwardOffset'].value
    virtualSolarArray.solarArrayRelativePosition_r = tram.offset_r(solarArrayOutwardOffset, solarArrayUpwardOffset, crv.currentEquivalentLatitude)
    virtualSolarArray.solarArrayRelativePosition_y = tram.offset_y(solarArrayOutwardOffset, solarArrayUpwardOffset, crv.currentEquivalentLatitude)
    virtualSolarArray.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualSolarArray.solarArrayRotZ = crv.currentEquivalentLatitude - Math.PI/2
    virtualSolarArray.isVisible = dParamWithUnits['showSolarArrays'].value
    virtualSolarArray.isDynamic =  false
    virtualSolarArray.hasChanged = true
  }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = (this.p + refFrame.p) % 1 
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const pointOnRingCurve = virtualSolarArray.mainRingCurve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      om.position.set(
        pointOnRingCurve.x + virtualSolarArray.solarArrayRelativePosition_r * Math.cos(angle),
        pointOnRingCurve.y + virtualSolarArray.solarArrayRelativePosition_y,
        pointOnRingCurve.z + virtualSolarArray.solarArrayRelativePosition_r * Math.sin(angle))
      om.rotation.set(0, -angle, virtualSolarArray.solarArrayRotZ)
      om.rotateX(-Math.PI/4)
      om.visible = virtualSolarArray.isVisible
      om.matrixValid = false
      if (this.perfOptimizedThreeJS) om.freeze()
    }
  }
}
