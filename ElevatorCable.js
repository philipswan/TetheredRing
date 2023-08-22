import * as THREE from 'three'
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
        //virtualElevatorCable.elevatorCableLowerAttachPnt_dr = tram.offset_r(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCableLowerAttachPnt_dr = tram.offset_r(cableOutwardOffset, -300, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCableUpperAttachPnt_dy = tram.offset_y(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
        //virtualElevatorCable.elevatorCableLowerAttachPnt_dy = tram.offset_y(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCableLowerAttachPnt_dy = tram.offset_y(cableOutwardOffset, -300, crv.currentEquivalentLatitude)

        virtualElevatorCable.elevatorCableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorCableOutwardOffset'].value
        virtualElevatorCable.elevatorCableUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value + dParamWithUnits['elevatorCarUpwardOffset'].value
        virtualElevatorCable.elevatorCableForwardOffset = dParamWithUnits['elevatorCableForwardOffset'].value
        virtualElevatorCable.elevatorCableTopAltitude = crv.currentMainRingAltitude + dParamWithUnits['additionalUpperElevatorCable'].value

        virtualElevatorCable.elevatorCableOpacity = dParamWithUnits['elevatorCableOpacity'].value

        virtualElevatorCable.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualElevatorCable.elevatorCableRotZ = crv.currentEquivalentLatitude - Math.PI/2
        virtualElevatorCable.isVisible = dParamWithUnits['showElevatorCables'].value
        virtualElevatorCable.isDynamic =  true
        virtualElevatorCable.hasChanged = true
    }

    static animate(elevatorAltitude, crv) {
        virtualElevatorCable.elevatorCablePosition_dr = tram.offset_r(virtualElevatorCable.elevatorCableOutwardOffset, virtualElevatorCable.elevatorCableUpwardOffset + elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorCablePosition_dy = tram.offset_y(virtualElevatorCable.elevatorCableOutwardOffset, virtualElevatorCable.elevatorCableUpwardOffset + elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
        virtualElevatorCable.elevatorAltitude = elevatorAltitude
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
                pointOnRingCurve.x + virtualElevatorCable.elevatorCablePosition_dr * Math.cos(angle) + virtualElevatorCable.elevatorCableForwardOffset * -Math.sin(angle),
                pointOnRingCurve.y + virtualElevatorCable.elevatorCablePosition_dy,
                pointOnRingCurve.z + virtualElevatorCable.elevatorCablePosition_dr * Math.sin(angle) + virtualElevatorCable.elevatorCableForwardOffset * Math.cos(angle))
            om.rotation.set(0, -angle, virtualElevatorCable.elevatorCableRotZ)

            // Feels a little clunky, but seems to work well enough...
            const p3 = new THREE.Vector3(0, virtualElevatorCable.elevatorCableTopAltitude - virtualElevatorCable.elevatorAltitude, 0)
            const p1 = new THREE.Vector3(0, 0, 0)
            const p2 = new THREE.Vector3(0, 0, 0)
            const p0 = new THREE.Vector3(0, -virtualElevatorCable.elevatorAltitude, 0)
            const pointSet = [p0, p1, p2, p3]
            om.geometry.setFromPoints(pointSet)
            om.geometry.computeBoundingSphere()
            // om.geometry.frustumCulled = false

            // Hack
            let opacity
            if (Math.abs(this.p - 0.3477777777777778) < 0.0001) {
              //console.log(wedgeToCameraDistance)
              opacity = 1
            }
            else {
              opacity = virtualElevatorCable.elevatorCableOpacity * Math.min(1, 20000 / wedgeToCameraDistance)
            }

            opacity = virtualElevatorCable.elevatorCableOpacity
            om.material.setValues({color: 0x4897f8, transparent: true, opacity: opacity})
            om.visible = virtualElevatorCable.isVisible && (opacity > 0.01)
            om.updateMatrix()
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }

    getFuturePosition(refFrame, timeDeltaInSeconds) {

      // timeDeltaInSeconds is not supported yet...
      const modelsTrackPosition = (this.p + refFrame.p) % 1
      const pointOnRingCurve = refFrame.curve.getPoint(modelsTrackPosition)
      return pointOnRingCurve

    }

}
  