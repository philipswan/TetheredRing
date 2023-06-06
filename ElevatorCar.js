import * as tram from './tram.js'

export class virtualElevatorCar {
    constructor(positionInFrameOfReference, unallocatedModelsArray) {
        this.p = positionInFrameOfReference
        this.unallocatedModels = unallocatedModelsArray
    }

    // The following properties are common to all virtual elevators...
    static elevatorCarOutwardOffset
    static elevatorCarUpwardOffset
    static elevatorCarForwardOffset
    static elevatorCarPosition_dr
    static elevatorCarPosition_dy
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged

    static update(dParamWithUnits, crv) {
        virtualElevatorCar.elevatorCarOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorCableOutwardOffset'].value
        virtualElevatorCar.elevatorCarUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value + dParamWithUnits['elevatorCarUpwardOffset'].value
        virtualElevatorCar.elevatorCarForwardOffset = dParamWithUnits['elevatorCableForwardOffset'].value
        virtualElevatorCar.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualElevatorCar.elevatorCarRotZ = crv.currentEquivalentLatitude - Math.PI/2
        virtualElevatorCar.isVisible = dParamWithUnits['showElevatorCars'].value
        virtualElevatorCar.isDynamic =  true
        virtualElevatorCar.hasChanged = true
    }

    static animate(elevatorAltitude, crv) {
        virtualElevatorCar.elevatorCarPosition_dr = tram.offset_r(virtualElevatorCar.elevatorCarOutwardOffset, virtualElevatorCar.elevatorCarUpwardOffset + elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
        virtualElevatorCar.elevatorCarPosition_dy = tram.offset_y(virtualElevatorCar.elevatorCarOutwardOffset, virtualElevatorCar.elevatorCarUpwardOffset + elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
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
                pointOnRingCurve.x + virtualElevatorCar.elevatorCarPosition_dr * Math.cos(angle) + virtualElevatorCar.elevatorCarForwardOffset * -Math.sin(angle),
                pointOnRingCurve.y + virtualElevatorCar.elevatorCarPosition_dy,
                pointOnRingCurve.z + virtualElevatorCar.elevatorCarPosition_dr * Math.sin(angle) + virtualElevatorCar.elevatorCarForwardOffset * Math.cos(angle))
            //console.log('Car ' + virtualElevatorCar.elevatorCableForwardOffset)
            om.rotation.set(0, -angle, virtualElevatorCar.elevatorCarRotZ)
            //om.rotateY(-Math.PI)
            om.visible = virtualElevatorCar.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }

}
  