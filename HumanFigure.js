// HumanFigure.js
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

export class humanFigureModel extends THREE.Group {
  constructor({ url = '/models/Low_Poly_Human_V2.fbx', scale = 1.75 } = {}) {
    super()

    const loader = new FBXLoader()
    loader.load(
      url,
      (fbx) => {
        const model = fbx
        // Normalize to ~1.75m height
        const box = new THREE.Box3().setFromObject(model)
        const height = box.max.y - box.min.y
        const factor = scale / height
        model.scale.setScalar(factor)
        this.add(model)
      },
      undefined,
      (err) => {
        console.error('Error loading human figure:', err)
      }
    )
  }

  createModel(curve, index) {
    return this.clone() 
  }
}


export class virtualHumanFigure {
  constructor(d) {
    this.d = d
    this.model = null
  }

  // These parameters are required for all objects
  static updateParameters = []
  static tearDownParameters = []
  static unallocatedModels = []
  static numObjects = 0
  static refFrames = []
  static prevRefFrames = []
  static className = 'virtualHumanFigures'
  static modelsAreRecyleable = false
    
  static isTeardownRequired(dParamWithUnits) {
    const newNumObjects = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualHumanFigures'].value : 0
    return newNumObjects!==virtualHumanFigure.numObjects
  }

  static update(dParamWithUnits, versionNumber) {
    virtualHumanFigure.numObjects = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualHumanFigures'].value : 0
    virtualHumanFigure.isVisible = dParamWithUnits['showMassDriverTube'].value
    virtualHumanFigure.isDynamic =  false
    virtualHumanFigure.hasChanged = true
    virtualHumanFigure.versionNumber = versionNumber
  }

  static addNewVirtualObjects(refFrames, scene, humanFigureModelObject) {
    virtualHumanFigure.hasChanged = true
    const n = virtualHumanFigure.numObjects
    //let count = 0
    console.assert(refFrames.length==1)
    refFrames.forEach(refFrame => {
      // Add new human figure(s) to the launch system
      for (let i = 0; i < n; i++) {
        const d = (i+0.5)/n
        const vmdt = new virtualHumanFigure(d)
        vmdt.index = i
        vmdt.model = humanFigureModelObject.createModel(refFrame.curve, i)
        vmdt.model.name = 'humanFigure'
        const zoneIndex = refFrame.curve.getZoneIndexAt(d)
        if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
          refFrame.wedges[zoneIndex][virtualHumanFigure.className].push(vmdt)
          scene.add(vmdt.model)
          //count++
        }
        else {
          console.log('Error')
        }
      }
      refFrame.prevStartWedgeIndex = -1
      //console.log('added '+count+' '+virtualHumanFigure.className+' to '+refFrame.name)
    })
  }

  placeAndOrientModel(om, refFrame) {
    const d = this.d 
    if (d===undefined || (d<0) || (d>1)) {
      console.log("error!!!")
    }
    else {
      if (virtualHumanFigure.isVisible) {
        if (virtualHumanFigure.hasChanged || this.versionNumber!=virtualHumanFigure.versionNumber) {
          // Something about the design has been updated so this instance also needs to be updated
          const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
          const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
          // const forward = refFrame.curve.getTangentAt(d)
          // const upward = refFrame.curve.getNormalAt(d)
          // const rightward = refFrame.curve.getBinormalAt(d)
          this.position = refFrame.curve.getPointAt(d)
            // .add(rightward.clone().multiplyScalar(this.lr*virtualHumanFigure.sidewaysOffset))
            // .add(upward.clone().multiplyScalar(virtualHumanFigure.upwardsOffset))
          this.orientation = refFrame.curve.getQuaternionAt(d, modelForward, modelUpward)
          this.versionNumber = virtualHumanFigure.versionNumber
        }

        om.position.copy(this.position)
        om.setRotationFromQuaternion(this.orientation)
      }
      om.visible = virtualHumanFigure.isVisible
      om.matrixValid = false
      if (this.perfOptimizedThreeJS) om.freeze()
    }
  }

}
