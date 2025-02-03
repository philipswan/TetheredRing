import * as THREE from 'three'
import { ScrewGeometry } from './ScrewGeometry.js'
import * as tram from './tram.js'

export class massDriverScrewModel {

    constructor() {
    }

    // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
    // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
    // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
    // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
    createModel(dParamWithUnits, launcherMassDriverLength, massDriverScrewSegments, segmentIndex, massDriverScrewMaterials, highRes = false) {

        if (highRes) {
          console.log('High Res Mass Driver Screw')
        }
        const shaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
        const shaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
        const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
        const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
        const launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
        const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        const launcherMassDriver1InitialVelocity = dParamWithUnits['launcherMassDriver1InitialVelocity'].value
        const bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
        
        // ToDo: This doesn't scale well. Need to figure out how to make this work for any dimentions of the mass driver's screw.

        // Hack!!!
        const minLengthSegmentsPerMeter = ((!highRes) ? 16 : 512)
        //const minLengthSegmentsPerMeter = ((!highRes) ? 512 : 512)

        const segmentSpacing = launcherMassDriverLength / massDriverScrewSegments
        const baseDistanceAlongScrew = segmentIndex * segmentSpacing
        const threadStarts = tram.calculateThreadStarts(baseDistanceAlongScrew, dParamWithUnits['launcherMassDriverScrewThreadStarts'].value)
        const screwLength = segmentSpacing - bracketThickness
        const initialDistance = dParamWithUnits['adaptiveNutGrapplerLength'].value / 2

        // The point of breaking the screw into segments relates to the need to display the brackets.
        const modelRadialSegments = ((!highRes) ? 12 : 96) / Math.min(threadStarts, 4)

        const massDriverScrewGeometry = new ScrewGeometry(
            screwLength,
            shaftOuterRadius,
            shaftInnerRadius,
            threadRadius,
            threadThickness,
            threadStarts,
            baseDistanceAlongScrew,
            launcherMassDriver1InitialVelocity,
            initialDistance,
            launcherMassDriverScrewRevolutionsPerSecond,
            launcherMassDriverForwardAcceleration,
            modelRadialSegments,
            minLengthSegmentsPerMeter)
        const massDriverScrewMesh = new THREE.Mesh(massDriverScrewGeometry, massDriverScrewMaterials[segmentIndex%2])
        massDriverScrewMesh.name = "massDriverScrew"

        return massDriverScrewMesh
    }

    genSpecs(dParamWithUnits, specs) {

      const shaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
      const shaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
      const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      // ToDo: If the thread starts are variable, then we need a more complex calculation for the screw's volume.
      const threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      const screwRoughLength = dParamWithUnits['launcherMassDriverScrewRoughLength'].value

      const shaftInnerArea = Math.PI * shaftInnerRadius**2
      const shaftOuterArea = Math.PI * shaftOuterRadius**2
      const threadHeight = threadRadius - shaftOuterRadius
      
      const massDriverScrewCrosssectionalArea = shaftOuterArea - shaftInnerArea + threadHeight * threadThickness * threadStarts
      specs['massDrivermassDriverScrewCrosssectionalArea'] = {value: massDriverScrewCrosssectionalArea, units: "m2"}
      const massDriverScrewVolume = massDriverScrewCrosssectionalArea * screwRoughLength
      specs['massDriverScrewVolume'] = {value: massDriverScrewVolume, units: "m3"}
      const densityOfMaterial = dParamWithUnits['launcherMassDriverScrewBracketDensity'].value
      const massDriverScrewMass = massDriverScrewVolume * densityOfMaterial
      specs['massDriverScrewMass'] = {value: massDriverScrewMass, units: "kg"}
      const costOfMaterial = dParamWithUnits['launcherMassDriverScrewBracketMaterialCost'].value
      const screwCost = massDriverScrewMass * costOfMaterial
      specs['massDriverScrewMaterialCost'] = {value: screwCost, units: "USD"}  

    }
}

export class virtualMassDriverScrew {
  constructor(d, index) {
      this.d = d
      this.index = index
      this.model = null
      this.versionNumber = 0
      this.position = []
  }

  // These parameters are required for all objects
  static updateParameters = []
  static tearDownParameters = []
  static unallocatedModels = []
  static numObjects = 0
  static refFrames = []
  static prevRefFrames = []
  static className = 'virtualMassDriverScrews'
  static modelsAreRecyleable = true

  static isTeardownRequired(dParamWithUnits, massDriverAccelerationScrewSegments) {
    const newNumVirtualMassDriverAccelerationScrews = dParamWithUnits['showMassDriverAccelerationScrews'].value ? massDriverAccelerationScrewSegments : 0
    return newNumVirtualMassDriverAccelerationScrews!==virtualMassDriverScrew.numObjects
  }
      
  static update(dParamWithUnits, launcherMassDriverLength, massDriverScrewSegments, accelerationScrewLength, massDriverScrewMaterials, versionNumber) {
    virtualMassDriverScrew.numObjects = dParamWithUnits['showMassDriverAccelerationScrews'].value ? massDriverScrewSegments : 0
    virtualMassDriverScrew.halfBracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value / 2 / accelerationScrewLength
    virtualMassDriverScrew.launcherMassDriverLength = launcherMassDriverLength
    virtualMassDriverScrew.massDriverScrewSegments = massDriverScrewSegments
    virtualMassDriverScrew.massDriverScrewMaterials = massDriverScrewMaterials
    virtualMassDriverScrew.shaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
    virtualMassDriverScrew.shaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
    virtualMassDriverScrew.threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
    virtualMassDriverScrew.threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
    virtualMassDriverScrew.threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
    virtualMassDriverScrew.launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
    virtualMassDriverScrew.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
    virtualMassDriverScrew.launcherMassDriver1InitialVelocity = dParamWithUnits['launcherMassDriver1InitialVelocity'].value
    
    virtualMassDriverScrew.bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
    virtualMassDriverScrew.numBrackets = dParamWithUnits['launcherMassDriverScrewNumBrackets'].value
    virtualMassDriverScrew.initialDistance = dParamWithUnits['adaptiveNutGrapplerLength'].value / 2

    virtualMassDriverScrew.isVisible = dParamWithUnits['showMassDriverAccelerationScrews'].value
    virtualMassDriverScrew.isDynamic =  true
    virtualMassDriverScrew.hasChanged = true
    virtualMassDriverScrew.sidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
    virtualMassDriverScrew.upwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
    virtualMassDriverScrew.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    virtualMassDriverScrew.versionNumber = versionNumber
  }

  static addNewVirtualObjects(refFrames) {
    virtualMassDriverScrew.hasChanged = true
    const n = virtualMassDriverScrew.numObjects
    let d
    console.assert(refFrames.length==1)
    refFrames.forEach(refFrame => {
      // Add new mass driver screws to the launch system
      for (let i = 0; i < n; i++) {
        if (i<virtualMassDriverScrew.numBrackets) {
          d = (i+0.5)/n - virtualMassDriverScrew.halfBracketThickness
        }
        else {
          d = (i+0.5)/n
        }
        const vmdas = new virtualMassDriverScrew(d, i)
        const zoneIndex = refFrame.curve.getZoneIndexAt(d)
        if ((zoneIndex>=0) && (zoneIndex<refFrame.numZones)) {
          refFrame.wedges[zoneIndex][virtualMassDriverScrew.className].push(vmdas)
        }
        else {
          console.log('Error')
        }
      }
      refFrame.prevStartWedgeIndex = -1
    })
  }


  placeAndOrientModel(om, refFrame) {
    const d = this.d 
    if (d===undefined || (d<0) || (d>1)) {
      console.log("error!!!")
    }
    else {
      if (virtualMassDriverScrew.isVisible) {
        if ((this.versionNumber!=virtualMassDriverScrew.versionNumber) || (this.position.length==0)) {
          // Something about the design has been updated so this instance also needs to be updated
          const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
          const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
          const forward = refFrame.curve.getTangentAt(d)
          const upward = refFrame.curve.getNormalAt(d)
          const rightward = refFrame.curve.getBinormalAt(d)
          const vs = rightward.clone().multiplyScalar(virtualMassDriverScrew.sidewaysOffset)
          const vu = upward.clone().multiplyScalar(virtualMassDriverScrew.upwardsOffset)
          const p0 = refFrame.curve.getPointAt(d).add(vu)
          const p1 = p0.clone()
          this.position[0] = p0.add(vs)
          this.position[1] = p1.sub(vs)
          this.orientation = refFrame.curve.getQuaternionAt(d, modelForward, modelUpward)
          this.versionNumber = virtualMassDriverScrew.versionNumber
        }

        // Check that we have the correct model for this position. If we don't, regenerate the model.
        if ((om===null) || om.userData!=this.index) {
          // Assigned model's geometry is the wrong shape and needs to be regenerated
          // Check that the geometries for left and right screws are the same
          // console.log('Regenerating Screw Geometry')
          const segmentSpacing = virtualMassDriverScrew.launcherMassDriverLength / virtualMassDriverScrew.massDriverScrewSegments
          const baseDistanceAlongScrew = this.index * segmentSpacing
          const threadStarts = tram.calculateThreadStarts(baseDistanceAlongScrew, virtualMassDriverScrew.threadStarts)
          let screwLength
          if (this.index<virtualMassDriverScrew.numBrackets) {
            screwLength = segmentSpacing - virtualMassDriverScrew.bracketThickness
          }
          else {
            screwLength = segmentSpacing
          }
          const highRes = false
          //const modelRadialSegments = ((!highRes) ? 12 : 96) / Math.min(virtualMassDriverScrew.threadStarts, 4)
          const modelRadialSegments = ((!highRes) ? 12 : 96) / Math.min(threadStarts, 4)

          // Hack!!!
          const minLengthSegmentsPerMeter = ((!highRes) ? 16 : 512)
          //const minLengthSegmentsPerMeter = ((!highRes) ? 512 : 512)

          // Get rid of the previous geometries...
          om.children[0].geometry.dispose()
          om.children[1].geometry.dispose()
          // Generate new geometries
          om.children[0].geometry = new ScrewGeometry(
            screwLength,
            virtualMassDriverScrew.shaftOuterRadius,
            virtualMassDriverScrew.shaftInnerRadius,
            virtualMassDriverScrew.threadRadius,
            virtualMassDriverScrew.threadThickness,
            //virtualMassDriverScrew.threadStarts,
            threadStarts,
            baseDistanceAlongScrew,
            virtualMassDriverScrew.launcherMassDriver1InitialVelocity,
            virtualMassDriverScrew.initialDistance,
            virtualMassDriverScrew.launcherMassDriverScrewRevolutionsPerSecond,
            virtualMassDriverScrew.launcherMassDriverForwardAcceleration,
            modelRadialSegments,
            minLengthSegmentsPerMeter)
          om.children[1].geometry = om.children[0].geometry
          const select = (((this.index % 1024) <= 32) && (this.index<256*128)) ? 0 : 1
          om.children[0].material = virtualMassDriverScrew.massDriverScrewMaterials[select]
          om.children[1].material = virtualMassDriverScrew.massDriverScrewMaterials[select]
          om.userData = this.index
        }

        const deltaT = tram.adjustedTimeSinceStart(virtualMassDriverScrew.slowDownPassageOfTime, refFrame.timeSinceStart)

        om.children.forEach(child => {
          const index = child.userData
          const lr = 1 - index*2
          child.position.copy(this.position[index])
          child.setRotationFromQuaternion(this.orientation)
          child.rotateY(((-lr * deltaT * virtualMassDriverScrew.launcherMassDriverScrewRevolutionsPerSecond) % 1) * 2 * Math.PI)
        })                
      }
      om.visible = virtualMassDriverScrew.isVisible
      om.matrixValid = false
      if (this.perfOptimizedThreeJS) om.freeze()
    }
  }

}
  