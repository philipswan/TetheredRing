import * as tram from './tram.js'

export class virtualElevatorCable {
    constructor(positionInFrameOfReference, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual habitats...
    static elevatorCableUpperAttachPnt_dr
    static elevatorCableLowerAttachPnt_dr
    static elevatorCableUpperAttachPnt_dy
    static elevatorCableLowerAttachPnt_dy
    static elevatorCableForwardOffset
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv) {
        const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorCableOutwardOffset'].value
        virtualElevatorCable.elevatorCableUpperAttachPnt_dr = tram.offset_r(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCableLowerAttachPnt_dr = tram.offset_r(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCableUpperAttachPnt_dy = tram.offset_y(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCableLowerAttachPnt_dy = tram.offset_y(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCableForwardOffset = dParamWithUnits['elevatorCableForwardOffset'].value
        virtualElevatorCable.isVisible = dParamWithUnits['showElevatorCables'].value
        virtualElevatorCable.isDynamic =  false
        virtualElevatorCable.hasChanged = true
    }

    placeAndOrientModel(om, refFrame) {
        const modelsTrackPosition = (this.p + refFrame.p) % 1     
        if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
            console.log("error!!!")
        }
        else {
            const pointOnRingCurve = refFrame.curve.getPoint(modelsTrackPosition)
            const angle = 2 * Math.PI * modelsTrackPosition
            const elevatorCableUpperAttachPnt = new THREE.Vector3(
                virtualElevatorCable.elevatorCableUpperAttachPnt_dr * Math.cos(angle) + virtualElevatorCable.elevatorCableForwardOffset * -Math.sin(angle),
                virtualElevatorCable.elevatorCableUpperAttachPnt_dy,
                virtualElevatorCable.elevatorCableUpperAttachPnt_dr * Math.sin(angle) + virtualElevatorCable.elevatorCableForwardOffset * Math.cos(angle),
            )
            const elevatorCableLowerAttachPnt = new THREE.Vector3(
                virtualElevatorCable.elevatorCableLowerAttachPnt_dr * Math.cos(angle) + virtualElevatorCable.elevatorCableForwardOffset * -Math.sin(angle),
                virtualElevatorCable.elevatorCableLowerAttachPnt_dy,
                virtualElevatorCable.elevatorCableLowerAttachPnt_dr * Math.sin(angle) + virtualElevatorCable.elevatorCableForwardOffset * Math.cos(angle),
            )
            const pointSet = [elevatorCableUpperAttachPnt, elevatorCableLowerAttachPnt]
            om.geometry.setFromPoints(pointSet)
            om.position.set(
                pointOnRingCurve.x,
                pointOnRingCurve.y,
                pointOnRingCurve.z)
            //om.rotation.set(0, 0, 0)
            om.visible = virtualElevatorCable.isVisible
            om.updateMatrix()
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }
}
  