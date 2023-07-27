import * as THREE from 'three'

export class virtualMassDriverBracket {
    constructor(d) {
        this.d = d
        this.model = null
    }

    static update(dParamWithUnits, massDriverSuperCurve, versionNumber) {
        virtualMassDriverBracket.massDriverSuperCurve = massDriverSuperCurve
        virtualMassDriverBracket.isVisible = dParamWithUnits['showMassDriverBracket'].value
        virtualMassDriverBracket.upwardsOffset = dParamWithUnits['launchSledUpwardsOffset'].value - dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverBracketHeight'].value/2
        virtualMassDriverBracket.isDynamic =  false
        virtualMassDriverBracket.hasChanged = true
        virtualMassDriverBracket.versionNumber = versionNumber
    }

    placeAndOrientModel(om, refFrame) {
        const d = this.d 
        if (d==='undefined' || (d<0) || (d>1)) {
            console.log("error!!!")
        }
        else {
            if (virtualMassDriverBracket.isVisible) {
                if (this.versionNumber!=virtualMassDriverBracket.versionNumber) {
                    // Something about the design has been updated so this instance also needs to be updated
                    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
                    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
                    // const forward = virtualMassDriverBracket.massDriverSuperCurve.getTangentAt(d)
                    const upward = virtualMassDriverBracket.massDriverSuperCurve.getNormalAt(d)
                    // const rightward = virtualMassDriverBracket.massDriverSuperCurve.getBinormalAt(d)
                    this.position = virtualMassDriverBracket.massDriverSuperCurve.getPointAt(d)
                        // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverBracket.sidewaysOffset))
                        .add(upward.clone().multiplyScalar(virtualMassDriverBracket.upwardsOffset))
                    this.orientation = virtualMassDriverBracket.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
                    this.versionNumber = virtualMassDriverBracket.versionNumber
                }

                om.position.copy(this.position)
                om.setRotationFromQuaternion(this.orientation)
            }
            om.visible = virtualMassDriverBracket.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }

}
  