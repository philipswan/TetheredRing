import * as THREE from 'three'
import * as tram from './tram.js'

export class statorMagnetSegmentModel {
  constructor(dParamWithUnits, crv, mainRingCurve) {

    const lengthSegments = 4

    // Procedurally generate the moving rings
    function getStatorMagnetSegmentCurve() {
      const segmentNumber = 0
      const totalSegments = dParamWithUnits['numVirtualStatorMagnetSegments'].value
      return tram.makeOffsetCurve(dParamWithUnits['mainRingOutwardOffset'].value, dParamWithUnits['mainRingUpwardOffset'].value, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    // Create stator magnet segments
    const mrdx = dParamWithUnits['movingRingThickness'].value / 2
    const mrdy = dParamWithUnits['movingRingHeight'].value / 2
    const smdx = dParamWithUnits['statorMagnetThickness'].value / 2
    const smdy = dParamWithUnits['statorMagnetHeight'].value / 2
    const smag = dParamWithUnits['statorMagnetAirGap'].value / 2
    const r = 2*smdx
    const statorMagnetShape = new THREE.Shape()
    const xOffset = -smag - mrdx - smdx
    statorMagnetShape.moveTo(xOffset+smdx, smdy)
    statorMagnetShape.lineTo(xOffset+smdx, -smdy)
    statorMagnetShape.lineTo(xOffset-smdx, -smdy)
    statorMagnetShape.arc(0, r, r, -Math.PI/2, -Math.PI, true)
    statorMagnetShape.lineTo(xOffset-smdx-r, 0-r)
    statorMagnetShape.arc(r, 0, r, -Math.PI, -3*Math.PI/2, true)

    statorMagnetShape.arc(0, r, r, -Math.PI/2, -Math.PI, true)
    statorMagnetShape.lineTo(xOffset-smdx-r, smdy-r)
    statorMagnetShape.arc(r, 0, r, -Math.PI, -3*Math.PI/2, true)
    statorMagnetShape.lineTo(xOffset-smdx, smdy)
    statorMagnetShape.closed = true

    const statorMagnetExtrudeSettings = {
      steps: lengthSegments,
      depth: 1,
      extrudePath: getStatorMagnetSegmentCurve()
    }

    const statorMagnetGeometry = new THREE.ExtrudeGeometry(statorMagnetShape, statorMagnetExtrudeSettings)
    const statorMagnetTexture = new THREE.TextureLoader().load( './textures/steelTexture.jpg' )
    const statorMagnetMaterial = new THREE.MeshPhongMaterial( {transparent: false, shininess: 10, map: statorMagnetTexture})
    const statorMagnetMesh = new THREE.Mesh(statorMagnetGeometry, statorMagnetMaterial)
    return statorMagnetMesh

  }

}

export class virtualStatorMagnetSegment {
    constructor(positionInFrameOfReference, index, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.index = index
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual habitats...
    static currentEquivalentLatitude
    static statorMagnetRotZ
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv) {
        const statorMagnetOutwardOffset = dParamWithUnits['mainRingOutwardOffset'].value
        const statorMagnetUpwardOffset = dParamWithUnits['mainRingUpwardOffset'].value
        virtualStatorMagnetSegment.mro = (dParamWithUnits['numMainRings'].value - 1)/2
        virtualStatorMagnetSegment.mainRingSpacing = dParamWithUnits['mainRingSpacing'].value
        virtualStatorMagnetSegment.statorMagnetRelativePosition_r = tram.offset_r(statorMagnetOutwardOffset, statorMagnetUpwardOffset, crv.currentEquivalentLatitude)
        virtualStatorMagnetSegment.statorMagnetRelativePosition_y = tram.offset_y(statorMagnetOutwardOffset, statorMagnetUpwardOffset, crv.currentEquivalentLatitude)
        virtualStatorMagnetSegment.mainRingSpacing = dParamWithUnits['mainRingSpacing'].value
        virtualStatorMagnetSegment.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualStatorMagnetSegment.statorMagnetRotZ = crv.currentEquivalentLatitude
        virtualStatorMagnetSegment.isVisible = dParamWithUnits['showStatorMagnets'].value
        virtualStatorMagnetSegment.isDynamic =  false
        virtualStatorMagnetSegment.hasChanged = true
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
                pointOnRingCurve.x + virtualStatorMagnetSegment.statorMagnetRelativePosition_r * Math.cos(angle),
                pointOnRingCurve.y + virtualStatorMagnetSegment.statorMagnetRelativePosition_y + (this.index-virtualStatorMagnetSegment.mro) * virtualStatorMagnetSegment.mainRingSpacing,
                pointOnRingCurve.z + virtualStatorMagnetSegment.statorMagnetRelativePosition_r * Math.sin(angle))
            om.rotation.set(0, -angle, virtualStatorMagnetSegment.statorMagnetRotZ)
            om.visible = virtualStatorMagnetSegment.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
}
  