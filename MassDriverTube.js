import * as THREE from 'three'

export class virtualMassDriverTube {
    constructor(d) {
      this.d = d
      this.model = null
    }
  
    static update(dParamWithUnits, massDriverSuperCurve, versionNumber) {
      virtualMassDriverTube.massDriverSuperCurve = massDriverSuperCurve
      virtualMassDriverTube.isVisible = dParamWithUnits['showMassDriverTube'].value
      virtualMassDriverTube.isDynamic =  false
      virtualMassDriverTube.hasChanged = true
      virtualMassDriverTube.versionNumber = versionNumber
    }
  
    placeAndOrientModel(om, refFrame) {
      const d = this.d 
      if (d==='undefined' || (d<0) || (d>1)) {
        console.log("error!!!")
      }
      else {
        if (virtualMassDriverTube.isVisible) {
          if (this.versionNumber!=virtualMassDriverTube.versionNumber) {
            // Something about the design has been updated so this instance also needs to be updated
            const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
            const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
            // const forward = virtualMassDriverTube.massDriverSuperCurve.getTangentAt(d)
            // const upward = virtualMassDriverTube.massDriverSuperCurve.getNormalAt(d)
            // const rightward = virtualMassDriverTube.massDriverSuperCurve.getBinormalAt(d)
            this.position = virtualMassDriverTube.massDriverSuperCurve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverTube.sidewaysOffset))
              // .add(upward.clone().multiplyScalar(virtualMassDriverTube.upwardsOffset))
            this.orientation = virtualMassDriverTube.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
            this.versionNumber = virtualMassDriverTube.versionNumber
          }
  
          om.position.copy(this.position)
          om.setRotationFromQuaternion(this.orientation)
        }
        om.visible = virtualMassDriverTube.isVisible
        om.matrixValid = false
        if (this.perfOptimizedThreeJS) om.freeze()
      }
    }
  
  }
  