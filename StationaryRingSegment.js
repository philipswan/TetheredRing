import * as THREE from 'three'
import * as tram from './tram.js'

export class stationaryRingSegmentModel {
  constructor(dParamWithUnits, crv, mainRingCurve) {

    const lengthSegments = 4

    function getStationaryRingSegmentCurve() {
      const segmentNumber = 0
      const totalSegments = dParamWithUnits['numVirtualStationaryRingSegments'].value
      return tram.makeOffsetCurve(dParamWithUnits['mainRingOutwardOffset'].value, dParamWithUnits['mainRingUpwardOffset'].value, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    // Need to use numMainRings
    const radius = dParamWithUnits['stationaryRingTubeRadius'].value
    const radialSegments = 32
    const stationaryRingGeometry = new THREE.TubeGeometry(getStationaryRingSegmentCurve(), lengthSegments, radius, radialSegments, false)
    const stationaryRingMaterial = new THREE.MeshPhongMaterial( {transparent: true, side: THREE.DoubleSide, opacity: 0.4})
    const stationaryRingMesh = new THREE.Mesh(stationaryRingGeometry, stationaryRingMaterial)
    return stationaryRingMesh
  }

}

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

  placeAndOrientModel(om, refFrame, wedgeToCameraDistance) {

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