import * as THREE from 'three'

export class virtualMassDriverRail {
    constructor(d) {
      this.d = d
      this.model = null
    }
  
    static update(dParamWithUnits, massDriverSuperCurve, versionNumber) {
      virtualMassDriverRail.massDriverSuperCurve = massDriverSuperCurve
      virtualMassDriverRail.isVisible = dParamWithUnits['showMassDriverRail'].value
      virtualMassDriverRail.upwardsOffset = dParamWithUnits['launchSledUpwardsOffset'].value - dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverRailHeight'].value/2
      virtualMassDriverRail.isDynamic =  false
      virtualMassDriverRail.hasChanged = true
      virtualMassDriverRail.versionNumber = versionNumber
    }
  
    placeAndOrientModel(om, refFrame) {
      const d = this.d 
      if (d==='undefined' || (d<0) || (d>1)) {
        console.log("error!!!")
      }
      else {
        if (virtualMassDriverRail.isVisible) {
          if (this.versionNumber!=virtualMassDriverRail.versionNumber) {
            // Something about the design has been updated so this instance also needs to be updated
            const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
            const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
            // const forward = virtualMassDriverRail.massDriverSuperCurve.getTangentAt(d)
            const upward = virtualMassDriverRail.massDriverSuperCurve.getNormalAt(d)
            // const rightward = virtualMassDriverRail.massDriverSuperCurve.getBinormalAt(d)
            this.position = virtualMassDriverRail.massDriverSuperCurve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverRail.sidewaysOffset))
              .add(upward.clone().multiplyScalar(virtualMassDriverRail.upwardsOffset))
            this.orientation = virtualMassDriverRail.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
            this.versionNumber = virtualMassDriverRail.versionNumber
          }
  
          om.position.copy(this.position)
          om.setRotationFromQuaternion(this.orientation)
        }
        om.visible = virtualMassDriverRail.isVisible
        om.matrixValid = false
        if (this.perfOptimizedThreeJS) om.freeze()
      }
    }
  
  }
  