import * as THREE from 'three'
import * as tram from './tram.js'

export class movingRingSegmentModel {
  constructor(dParamWithUnits, crv, mainRingCurve) {

    const lengthSegments = 4

    // Procedurally generate the moving rings
    function getMovingRingSegmentCurve() {
      const segmentNumber = 0
      const totalSegments = dParamWithUnits['numVirtualMovingRingSegments'].value
      return tram.makeOffsetCurve(dParamWithUnits['mainRingOutwardOffset'].value, dParamWithUnits['mainRingUpwardOffset'].value, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    // Create moving ring segments
    const mrdx = dParamWithUnits['movingRingThickness'].value / 2
    const mrdy = dParamWithUnits['movingRingHeight'].value / 2
    const movingRingShape = new THREE.Shape()
    movingRingShape.moveTo(mrdx, mrdy)
    movingRingShape.lineTo(mrdx, -mrdy)
    movingRingShape.lineTo(-mrdx, -mrdy)
    movingRingShape.lineTo(-mrdx, mrdy)
    movingRingShape.closed = true

    const movingRingExtrudeSettings = {
      steps: lengthSegments,
      depth: 1,
      extrudePath: getMovingRingSegmentCurve()
    }

    const movingRingGeometry = new THREE.ExtrudeGeometry(movingRingShape, movingRingExtrudeSettings)
    const movingRingTexture = new THREE.TextureLoader().load( './textures/steelTexture.jpg' )
    const movingRingMaterial = new THREE.MeshPhongMaterial( {transparent: false, shininess: 10, map: movingRingTexture})
    const movingRingMesh = new THREE.Mesh(movingRingGeometry, movingRingMaterial)
    return movingRingMesh

  }

}

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
        virtualMovingRingSegment.movingRingRotZ = crv.currentEquivalentLatitude
        virtualMovingRingSegment.isVisible = dParamWithUnits['showMovingRings'].value
        virtualMovingRingSegment.isDynamic =  true
        virtualMovingRingSegment.hasChanged = true
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
  