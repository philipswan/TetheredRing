import * as THREE from 'three'

export class virtualMassDriverScrew {
    constructor(d, lr) {
        this.d = d
        this.model = null
        this.lr = lr    // left or right screw
        this.versionNumber = 0
    }

    static update(dParamWithUnits, massDriverSuperCurve, versionNumber) {
        virtualMassDriverScrew.massDriverSuperCurve = massDriverSuperCurve
        virtualMassDriverScrew.isVisible = dParamWithUnits['showMassDriverScrews'].value
        virtualMassDriverScrew.isDynamic =  false
        virtualMassDriverScrew.hasChanged = true
        virtualMassDriverScrew.sidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
        virtualMassDriverScrew.upwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
        virtualMassDriverScrew.screwRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
        virtualMassDriverScrew.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
        virtualMassDriverScrew.versionNumber = versionNumber
    }

    placeAndOrientModel(om, refFrame) {
        const d = this.d 
        if (d==='undefined' || (d<0) || (d>1)) {
            console.log("error!!!")
        }
        else {
            if (virtualMassDriverScrew.isVisible) {
                if (this.versionNumber!=virtualMassDriverScrew.versionNumber) {
                    // Something about the design has been updated so this instance also needs to be updated
                    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
                    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
                    const forward = virtualMassDriverScrew.massDriverSuperCurve.getTangentAt(d)
                    const upward = virtualMassDriverScrew.massDriverSuperCurve.getNormalAt(d)
                    const rightward = virtualMassDriverScrew.massDriverSuperCurve.getBinormalAt(d)
                    this.position = virtualMassDriverScrew.massDriverSuperCurve.getPointAt(d)
                        .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverScrew.sidewaysOffset))
                        .add(upward.clone().multiplyScalar(virtualMassDriverScrew.upwardsOffset))
                    this.orientation = virtualMassDriverScrew.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
                    this.versionNumber = virtualMassDriverScrew.versionNumber
                }

                om.position.copy(this.position)
                om.setRotationFromQuaternion(this.orientation)
                const deltaT = refFrame.timeSinceStart * virtualMassDriverScrew.slowDownPassageOfTime
                om.rotateY(((-this.lr * deltaT * virtualMassDriverScrew.screwRevolutionsPerSecond) % 1) * 2 * Math.PI)
            }
            om.visible = virtualMassDriverScrew.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }

    }
  