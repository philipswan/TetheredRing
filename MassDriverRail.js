import * as THREE from 'three'
import { CatmullRomSuperCurve3 } from './SuperCurves'
import { ShapeUtils } from 'three'

export class massDriverRailModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits) {
    this.update(dParamWithUnits)
    // Create rail materials
    this.massDriverRailMaterials = []
    this.massDriverRailMaterials[0] = new THREE.MeshPhongMaterial( { color: 0x31313E } )
    this.massDriverRailMaterials[1] = new THREE.MeshPhongMaterial( { color: 0x79111E } )
  }

  update(dParamWithUnits) {
    this.shape = this.createShape(dParamWithUnits)
    this.massDriverRailSegments = dParamWithUnits['numVirtualMassDriverRails'].value
  }

  createModel(curve, segmentIndex) {

    const modelLengthSegments = 32    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
    const railPoints = []

    // Now we need a reference point in the middle of this segment of the whole mass driver
    const modelsCurvePosition = (segmentIndex + 0.5) / this.massDriverRailSegments
    const refPoint = curve.getPointAt(modelsCurvePosition)
    
    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
    const orientation = curve.getQuaternionAt(modelsCurvePosition, modelForward, modelUpward).invert()

    // We need to define a curve for this segment of the mass driver, and then use that curve to create a rail geometry for this model
    for (let i = 0; i<=modelLengthSegments; i++) {
      const modelsCurvePosition = (segmentIndex + i/modelLengthSegments) / this.massDriverRailSegments
      railPoints.push(curve.getPointAt(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
    }
    const massDriverSegmentCurve = new CatmullRomSuperCurve3(railPoints)
    const extrudeSettings = {
      steps: modelLengthSegments,
      depth: 1,
      extrudePath: massDriverSegmentCurve
    }
    let massDriverRailGeometry
    try {
      massDriverRailGeometry = new THREE.ExtrudeGeometry(this.shape, extrudeSettings)
    }
    catch (error) {
      debugger
      massDriverRailGeometry = new THREE.ExtrudeGeometry(this.shape, extrudeSettings)
    }
    massDriverRailGeometry.name = "massDriverRailGeometry"
    // ToDo: We are creating multiple identical materials here.  We should create one material and reuse it.
    // Hack for Hawaii clip
    //const massDriverRailMaterial = this.massDriverRailMaterials[(index % 16 == 0) ? 1 : 0] // This makes every 16th rail segment a different color
    const onRamp = (curve.name=="launchRampCurve")
    const massDriverRailMaterial = this.massDriverRailMaterials[(onRamp) ? 1 : 0]
    const massDriverRailMesh = new THREE.Mesh(massDriverRailGeometry, massDriverRailMaterial)
    massDriverRailMesh.castShadow = true
    return massDriverRailMesh
  }

  createShape(dParamWithUnits) {
    const width = dParamWithUnits['launcherMassDriverRailWidth'].value
    const height = dParamWithUnits['launcherMassDriverRailHeight'].value
    const shape = new THREE.Shape()

    shape.moveTo( width/2 , height/2 )
    shape.lineTo( width/2 , -height/2 )
    shape.lineTo( -width/2 , -height/2 )
    shape.lineTo( -width/2 , height/2 )
    shape.lineTo( width/2 , height/2 )

    return shape

  }

  genSpecs(dParamWithUnits, specs) {

    const shape = this.createShape(dParamWithUnits)
    const contour = []

    contour.push(shape.curves[0].v1)
    shape.curves.forEach(curve => {
      contour.push(curve.v2)
    })

    const massDriverRailCrosssectionalArea = Math.abs(ShapeUtils.area(contour))
    console.log("massDriverRailCrosssectionalArea:", massDriverRailCrosssectionalArea)
    specs['massDriverRailCrosssectionalArea'] = {value: massDriverRailCrosssectionalArea, units: "m2"}

  }

}

export class virtualMassDriverRail {
    constructor(d) {
      this.d = d
      this.model = null
    }
  
    // These parameters are required for all objects
    static unallocatedModels = []
    static tearDownParameters = []
    static unallocatedModels = []
    static numObjects = 0
    static refFrames = []
    static prevRefFrames = []
    static className = 'virtualMassDriverRails'
    static modelsAreRecyleable = false

    static isTeardownRequired(dParamWithUnits) {
      const newNumObjects = dParamWithUnits['showMassDriverRail'].value ? dParamWithUnits['numVirtualMassDriverRails'].value : 0
      return newNumObjects!==virtualMassDriverRail.numObjects
    }

    static update(dParamWithUnits, versionNumber) {
      virtualMassDriverRail.numObjects = dParamWithUnits['showMassDriverRail'].value ? dParamWithUnits['numVirtualMassDriverRails'].value : 0
      virtualMassDriverRail.isVisible = dParamWithUnits['showMassDriverRail'].value
      virtualMassDriverRail.upwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value //- dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverRailHeight'].value/2
      virtualMassDriverRail.isDynamic =  false
      virtualMassDriverRail.hasChanged = true
      virtualMassDriverRail.versionNumber = versionNumber
    }
  
    static addNewVirtualObjects(refFrames, scene, railModelObject) {
      virtualMassDriverRail.hasChanged = true

      const n = virtualMassDriverRail.numObjects   // Number of rails per zone
      // Add new mass driver rails to the launch system
      console.assert(refFrames.length==1)
      refFrames.forEach(refFrame => {
        for (let i = 0; i < n; i++) {
          const d = (i+0.5)/n
          const vmdr = new virtualMassDriverRail(d)
          vmdr.index = i
          vmdr.model = railModelObject.createModel(refFrame.curve, i)
          //vmdr.model = railModelObject.createModel( subCurve, i*n+j, nscz*n)
          vmdr.model.name = 'massDriverRail'
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex][virtualMassDriverRail.className].push(vmdr)
            scene.add(vmdr.model)
            //count++
          }
          else {
            console.log('Error')
          }
        }

        // const totalCurveLength = refFrame.curve.getLength()
        // refFrame.curve.superCurves.forEach((subCurve, subCurveIndex) => {
        //   const lengthOfSubCurve = subCurve.getLength()
        //   const lengthOffsetToSubcurve = (subCurveIndex==0) ? 0 : refFrame.curve.cacheLengths[subCurveIndex-1]
        //   const nscz = 1 //refFrame.curve.numZones[subCurveIndex]  // Number of subCurve zones
        //   const zoneIndexOffset = refFrame.curve.startZone[subCurveIndex]
        //   for (let i = 0; i < nscz ; i++) {
        //     const zoneIndex = zoneIndexOffset + i
        //     for (let j = 0; j < n ; j++) {
        //       const d = (lengthOffsetToSubcurve + (i*n+j+0.5)/(nscz*n) * lengthOfSubCurve) / totalCurveLength
        //       const vmdr = new virtualMassDriverRail(d)
        //       vmdr.model = railModelObject.createModel(subCurve, i*n+j, nscz*n, massDriverRailMaterials)
        //       vmdr.model.name = 'MassDriverRail'
        //       if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
        //         refFrame.wedges[zoneIndex][virtualMassDriverRail.className].push(vmdr)
        //         scene.add(vmdr.model)
        //       }
        //       else {
        //         console.log('Error')
        //       }
        //       //vmdr.model.scale.set(100,1,1) // This is a hack to make the rail larger and more visible
        //     }
        //   }
        // })
        refFrame.prevStartWedgeIndex = -1
      })
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

            // ToDo: Could be more efficienct to call gerRelevantCurve once and then use the result for normal, position, and orientation
            // const forward = refFrame.curve.getTangentAt(d)
            const upward = refFrame.curve.getNormalAt(d)
            // const rightward = refFrame.curve.getBinormalAt(d)
            this.position = refFrame.curve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverRail.sidewaysOffset))
              .add(upward.clone().multiplyScalar(virtualMassDriverRail.upwardsOffset))
            this.orientation = refFrame.curve.getQuaternionAt(d, modelForward, modelUpward)
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
