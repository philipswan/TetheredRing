import * as THREE from 'three'
import * as tram from './tram.js'

export class virtualTransitVehicle {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    // The virtual vehicle has a position around the ring, a transitTubeLevel, and an innerOuterTrackFactor
    // A 0 indicates the lower level, and a 1 indicates the upper level
    // A 0 indicates the inner track and a 1 indicates the outer track. Values between 0 and 1 indicate that the vehicle is changing tracks.
    // Distance around the track is a value from 0 to 2*PI
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
    // level
    // innerOuterTrackFactor
    // distanceAroundTrack
    // speed
    // accelleration
    // position
    // modelIndex
  }

  // The following properties are common to all virtual vehicles...
  static transitVehicleRelativePosition_r = []
  static transitVehicleRelativePosition_y = []
  static currentEquivalentLatitude
  static isVisible
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, crv) {

    const dx = dParamWithUnits['transitTrackOuterOffset'].value
    const dy1 = dParamWithUnits['transitTrackUpperOffset1'].value
    const dy2 = dParamWithUnits['transitTrackUpperOffset2'].value
    const trackOffsetsList = [[-dx, dy1], [dx, dy1], [-dx, dy2], [dx, dy2]]
  
    for (let trackIndex = 0; trackIndex<trackOffsetsList.length; trackIndex++) {
      const outwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + trackOffsetsList[trackIndex][0]
      const upwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value + trackOffsetsList[trackIndex][1] + dParamWithUnits['transitVehicleUpwardOffset'].value  // Last is half of the track height
      virtualTransitVehicle.transitVehicleRelativePosition_r[trackIndex] = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
      virtualTransitVehicle.transitVehicleRelativePosition_y[trackIndex]  = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    }
    virtualTransitVehicle.systemForwardOffset = dParamWithUnits['transitSystemForwardOffset'].value / crv.mainRingRadius
    virtualTransitVehicle.forwardOffset = dParamWithUnits['transitVehicleForwardOffset'].value / crv.mainRingRadius
    virtualTransitVehicle.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualTransitVehicle.ringCircumference = crv.mainRingRadius * Math.PI * 2
    virtualTransitVehicle.isVisible = dParamWithUnits['showTransitVehicles'].value
    virtualTransitVehicle.isDynamic =  true
    virtualTransitVehicle.hasChanged = true
  }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = tram.posFrac(this.p + refFrame.p + virtualTransitVehicle.systemForwardOffset + refFrame.direction * virtualTransitVehicle.forwardOffset)
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const trackIndex = refFrame.trackIndex
      const r1 = virtualTransitVehicle.transitVehicleRelativePosition_r[trackIndex]
      const y1 = virtualTransitVehicle.transitVehicleRelativePosition_y[trackIndex]
      const pointOnRingCurve = refFrame.curve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      om.position.set(
        pointOnRingCurve.x + r1 * Math.cos(angle),
        pointOnRingCurve.y + y1,
        pointOnRingCurve.z + r1 * Math.sin(angle) )
      om.rotation.set(0, -angle, virtualTransitVehicle.currentEquivalentLatitude)
      if (refFrame.direction===-1) {
        om.rotateX(Math.PI)
      }
      om.visible = virtualTransitVehicle.isVisible
      om.matrixValid = false
    }
  }

  getFuturePosition(refFrame, timeDeltaInSeconds) {

    // Ideally we should account for accelleration when calculating the future position.
    // This simplified calculation assumes the vehicle is travelling at a steady speed.
    // As it is, the calculation leaves the camera a little bit off target at the end of the tweening opertion.
    const offsetToFuturePosition = (timeDeltaInSeconds * refFrame.v * -refFrame.direction) / virtualTransitVehicle.ringCircumference
    const modelsTrackPosition = tram.posFrac(this.p + refFrame.p + offsetToFuturePosition)
    const trackIndex = refFrame.trackIndex
    const r1 = virtualTransitVehicle.transitVehicleRelativePosition_r[trackIndex]
    const y1 = virtualTransitVehicle.transitVehicleRelativePosition_y[trackIndex]
    const pointOnRingCurve = refFrame.curve.getPoint(modelsTrackPosition)
    const angle = 2 * Math.PI * modelsTrackPosition
    pointOnRingCurve.add(new THREE.Vector3(r1 * Math.cos(angle), y1, r1 * Math.sin(angle) ))
    return pointOnRingCurve

  }

}
