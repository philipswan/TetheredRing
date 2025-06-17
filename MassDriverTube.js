import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CatmullRomSuperCurve3 } from './SuperCurves'
import { arrow } from './markers'

export class massDriverTubeModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits) {
    this.update(dParamWithUnits)
    // this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, color: 0x7fffff, transparent: true, depthWrite: false, opacity: 0.25})
    // this.massDriverTubeMaterial2 = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, color: 0x7f5050, transparent: true, depthWrite: false, opacity: 0.25})
    //this.massDriverTubeMaterial = new THREE.MeshPhongMaterial( {wireframe: true})
    //this.tubeTexture = new THREE.TextureLoader().load('textures/TubeTexture.png')
    this.tubeTexture = new THREE.TextureLoader().load('textures/TubeTexture2.png')
    this.tubeTexture.repeat.set(4, 4)
    this.tubeTexture.wrapS = THREE.MirroredRepeatWrapping
    this.tubeTexture.wrapT = THREE.MirroredRepeatWrapping
    //this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( {map: this.tubeTexture, side: THREE.FrontSide, transparent: true, opacity: 1, shininess: 0.5} )
    //this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( {side: THREE.FrontSide, color: 0x7fffff, transparent: true, opacity: 1, shininess: 0.5} )
    this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( { side: THREE.DoubleSide, transparent: true, opacity: 0.15, shininess: 0.5} )
    this.massDriverTubeMaterial2 = new THREE.MeshPhongMaterial( { side: THREE.DoubleSide, transparent: true, opacity: 0.5, shininess: 0.5, color: 0x000000} )
    this.massDriverTubeMaterial3 = new THREE.MeshPhongMaterial( { side: THREE.FrontSide, shininess: 0.5} )
    this.massDriverTubeMaterial4 = new THREE.MeshPhongMaterial( { side: THREE.FrontSide, transparent: true, opacity: 0.5, shininess: 0.5} )
    // this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( { map: this.tubeTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.6, shininess: 0.5} )
    // this.massDriverTubeMaterial2 = new THREE.MeshPhongMaterial( { side: THREE.DoubleSide, color: 0x101015, transparent: true, opacity: 0.95, shininess: 0.5} )

    this.liftFanRoughSpacing = this.radius * 4 // This is the distance between lift fans along the elevated evacuated.

    this.liftFanHubGeometry = new THREE.SphereGeometry(this.radius * 0.1, 16, 16)
    this.liftFanHubGeometry.scale(1, 1, 3)
    this.liftFanDiskGeometry = new THREE.SphereGeometry(this.radius * 1.5, 4, 64)
    this.liftFanDiskGeometry.scale(1, 1, 0.05)
    // this.liftFanCowlingGeometry = new THREE.TorusGeometry(this.radius*1.6, this.radius/32, 16, 64)
    // this.liftFanCowlingGeometry.scale(1, 1, 4)
    // this.liftFanGeometry = mergeGeometries([this.liftFanHubGeometry, this.liftFanCowlingGeometry])
    
  }

  update(dParamWithUnits) {
    this.massDriverTubeSegments = dParamWithUnits['numVirtualMassDriverTubes'].value
    this.radius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value
  }
  
  createModel(curve, segmentIndex) {

    let modelLengthSegments    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
    const modelRadialSegments = 32
    const tubePoints = []

    // Now we need a reference point in the middle of this segment of the whole mass driver
    const modelsCurvePosition = (segmentIndex + 0.5) / this.massDriverTubeSegments
    const refPoint = curve.getPointAt(modelsCurvePosition)

    // Figure out the length of this segment - this might not work well when the elevated evacuated tube is coiled...
    let tubeSegmentLength = 0
    let p0, p1
    p0 = curve.getPointAt((segmentIndex + 0) / this.massDriverTubeSegments)
    for (let i = 1; i<=20; i++) {
      p1 = curve.getPointAt((segmentIndex + i/20) / this.massDriverTubeSegments)
      tubeSegmentLength += p0.distanceTo(p1)
      p0 = p1
    }

    // We need to orient the model so that it is aligned with the curve at this point
    // Hack - make the part of the tube that's off in the distance larger to make it more visible.
    const res = curve.findRelevantCurveAt(modelsCurvePosition)
    let exagerateTubeFactor = 1
    let aboveGround = true
    if ((res.relevantCurve.name!='elevatedEvacuatedTube') && (res.relevantCurve.name!='coiledElevatedEvacuatedTube')) {
      // Not elevated evacuated tube
      exagerateTubeFactor = 1
      modelLengthSegments = 4
      aboveGround = false
    }
    else {
      exagerateTubeFactor = 5
      modelLengthSegments = 4
      aboveGround = true
    }
    // End Hack
    //modelLengthSegments = 4

    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
    const orientation = curve.getQuaternionAt(modelsCurvePosition, modelForward, modelUpward).invert()

    // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
    for (let i = 0; i<=modelLengthSegments; i++) {
      const modelsCurvePosition = (segmentIndex + i/modelLengthSegments) / this.massDriverTubeSegments
      try {
        tubePoints.push(curve.getPointAt(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
      }
      catch (e) {
        console.log('error!!!')
        curve.getPointAt(modelsCurvePosition)
      }
    }

    const massDriverSegmentCurve = new CatmullRomSuperCurve3(tubePoints)
    const massDriverTubeGeometry = new THREE.TubeGeometry(massDriverSegmentCurve, modelLengthSegments, this.radius * exagerateTubeFactor, modelRadialSegments, false)
    // massDriverTubeGeometry.computeBoundingSphere() // No benefit seen
    //const massDriverTubeMesh = new THREE.Mesh(massDriverTubeGeometry, (segmentIndex%10==0) ? this.massDriverTubeMaterial1 : this.massDriverTubeMaterial2)
    // Hack for Olympus Mons clip
    //aboveGround = (segmentIndex<=126 || segmentIndex>250)
    // Hack for Hawaii clip
    //aboveGround = (segmentIndex<=211 || segmentIndex>228)  // That is, not in a tunnel
    const tubeMesh = new THREE.Mesh(massDriverTubeGeometry, (!aboveGround) ? this.massDriverTubeMaterial1 : this.massDriverTubeMaterial2)
    const massDriverTubeMesh = new THREE.Group().add(tubeMesh)
    const liftFansPerSegment = Math.round(tubeSegmentLength / this.liftFanRoughSpacing)

    for (let i = 0; i<liftFansPerSegment; i++) {
      const modelsCurvePosition = (segmentIndex + (i+0.5)/liftFansPerSegment) / this.massDriverTubeSegments
      const res = curve.findRelevantCurveAt(modelsCurvePosition)
      if ((res.relevantCurve.name=='elevatedEvacuatedTube') || (res.relevantCurve.name=='coiledElevatedEvacuatedTube')) {
        const point = curve.getPointAt(modelsCurvePosition)
        const tangent = curve.getTangentAt(modelsCurvePosition)
        const normal = curve.getNormalAt(modelsCurvePosition)
        const binormal = curve.getBinormalAt(modelsCurvePosition)

        for (let lr = -1; lr<=1; lr+=2) {
          const fanPos = point.clone().add(binormal.clone().multiplyScalar(lr*this.radius*3))
          const relFanPos = fanPos.clone().sub(refPoint).applyQuaternion(orientation)
          const fanOrientation = fanPos.clone().normalize().applyQuaternion(orientation)

          const liftFanHubMesh = new THREE.Mesh(this.liftFanHubGeometry, this.massDriverTubeMaterial3)
          liftFanHubMesh.position.copy(relFanPos)
          liftFanHubMesh.lookAt(relFanPos.clone().add(fanOrientation))
          liftFanHubMesh.name = "liftFanHub"
          massDriverTubeMesh.add(liftFanHubMesh)
          
          const liftFanDiskMesh = new THREE.Mesh(this.liftFanDiskGeometry, this.massDriverTubeMaterial4)
          liftFanDiskMesh.position.copy(relFanPos)
          liftFanDiskMesh.lookAt(relFanPos.clone().add(fanOrientation))
          liftFanDiskMesh.scale.set(1, 1, 0.05)
          liftFanDiskMesh.name = "liftFanDisk"
          massDriverTubeMesh.add(liftFanDiskMesh)
          
          // const liftFanCowlingMesh = new THREE.Mesh(this.liftFanCowlingGeometry, this.massDriverTubeMaterial3)
          // liftFanCowlingMesh.position.copy(relFanPos)
          // liftFanCowlingMesh.lookAt(relFanPos.clone().add(fanOrientation))
          // liftFanCowlingMesh.scale.set(1, 1, 4)
          // liftFanCowlingMesh.name = "liftFanCowling"
          // massDriverTubeMesh.add(liftFanCowlingMesh)
        }
      }
    }

    massDriverTubeMesh.renderOrder = 999

    // Debug code
    // const blueMaterial = new THREE.MeshLambertMaterial({color: 0x4040df})
    // const massDriverTubeMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), blueMaterial)
    // massDriverTubeMesh.position.copy(refPoint)

    return massDriverTubeMesh
  }

  genSpecs(dParamWithUnits, specs) {
    const launcherMassDriverTubeInnerRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value
    const launcherMassDriverTubeWallThickness = dParamWithUnits['launcherMassDriverTubeWallThickness'].value
    const launcherMassDriverTubeLinerThickness = dParamWithUnits['launcherMassDriverTubeLinerThickness'].value
    // Let's assume that we want the tube to be buoyant. We'll use tension lines to moore it to the sea floor.
    // We need enough concrete to provide stuctural rigidity.

    const launcherMassDriverTubeMaterial0Density = dParamWithUnits['launcherMassDriverTubeMaterial0Density'].value
    const launcherMassDriverTubeMaterial0Cost = dParamWithUnits['launcherMassDriverTubeMaterial0Cost'].value
    const launcherMassDriverTubeMaterial1Density = dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    const launcherMassDriverTubeMaterial1Cost = dParamWithUnits['launcherMassDriverTubeMaterial1Cost'].value

    const massDriverTubeWallCrosssectionalArea = Math.PI * ((launcherMassDriverTubeInnerRadius+launcherMassDriverTubeWallThickness)**2 - launcherMassDriverTubeInnerRadius**2)
    const massDriverTubeLinerCrosssectionalArea = Math.PI * ((launcherMassDriverTubeInnerRadius+launcherMassDriverTubeWallThickness+launcherMassDriverTubeLinerThickness)**2 - (launcherMassDriverTubeInnerRadius+launcherMassDriverTubeWallThickness)**2)
    specs['massDriverTubeWallCrosssectionalArea'] = {value: massDriverTubeWallCrosssectionalArea, units: "m2"}
    specs['massDriverTubeLinerCrosssectionalArea'] = {value: massDriverTubeLinerCrosssectionalArea, units: "m2"}
  }

}

export class virtualMassDriverTube {
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
    static className = 'virtualMassDriverTubes'
    static modelsAreRecyleable = false
      
    static isTeardownRequired(dParamWithUnits) {
      const newNumObjects = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualMassDriverTubes'].value : 0
      return newNumObjects!==virtualMassDriverTube.numObjects
    }
  
    static update(dParamWithUnits, versionNumber) {
      virtualMassDriverTube.numObjects = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualMassDriverTubes'].value : 0
      virtualMassDriverTube.isVisible = dParamWithUnits['showMassDriverTube'].value
      virtualMassDriverTube.isDynamic =  true
      virtualMassDriverTube.hasChanged = true
      virtualMassDriverTube.versionNumber = versionNumber
    }

    static addNewVirtualObjects(refFrames, scene, tubeModelObject) {
      virtualMassDriverTube.hasChanged = true
      const n = virtualMassDriverTube.numObjects
      //let count = 0
      console.assert(refFrames.length==1)
      refFrames.forEach(refFrame => {
        // Add new mass driver tubes to the launch system
        for (let i = 0; i < n; i++) {
          const d = (i+0.5)/n
          const vmdt = new virtualMassDriverTube(d)
          vmdt.index = i
          vmdt.model = tubeModelObject.createModel(refFrame.curve, i)
          vmdt.model.name = 'massDriverTube'
          const zoneIndex = refFrame.curve.getZoneIndexAt(d)
          if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
            refFrame.wedges[zoneIndex][virtualMassDriverTube.className].push(vmdt)
            scene.add(vmdt.model)
            //count++
          }
          else {
            console.log('Error')
          }
        }
        refFrame.prevStartWedgeIndex = -1
        //console.log('added '+count+' '+virtualMassDriverTube.className+' to '+refFrame.name)
      })
    }
  
    placeAndOrientModel(om, refFrame) {
      const d = this.d 
      if (d===undefined || (d<0) || (d>1)) {
        console.log("error!!!")
      }
      else {
        if (virtualMassDriverTube.isVisible) {
          if (virtualMassDriverTube.hasChanged || this.versionNumber!=virtualMassDriverTube.versionNumber) {
            // Something about the design has been updated so this instance also needs to be updated
            const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
            const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
            // const forward = refFrame.curve.getTangentAt(d)
            // const upward = refFrame.curve.getNormalAt(d)
            // const rightward = refFrame.curve.getBinormalAt(d)
            this.position = refFrame.curve.getPointAt(d)
              // .add(rightward.clone().multiplyScalar(this.lr*virtualMassDriverTube.sidewaysOffset))
              // .add(upward.clone().multiplyScalar(virtualMassDriverTube.upwardsOffset))
            this.orientation = refFrame.curve.getQuaternionAt(d, modelForward, modelUpward)
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
  