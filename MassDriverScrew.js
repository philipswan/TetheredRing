import * as THREE from 'three'
import { ScrewGeometry } from './ScrewGeometry.js'
import * as tram from './tram.js'

export class massDriverScrewModel {
    // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
    // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
    // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
    // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
    constructor(dParamWithUnits, launcherMassDriverLength, massDriverScrewSegments, segmentIndex, massDriverScrewMaterials) {

        const shaftRadius = dParamWithUnits['launcherMassDriverScrewShaftRadius'].value
        const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
        const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
        const threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
        const launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
        const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        const launcherMassDriver2InitialVelocity = dParamWithUnits['launcherMassDriver2InitialVelocity'].value
        const bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
        
        // The point of breaking the screw into segments relates to the need to display the brackets.
        const modelRadialSegments = 24 / Math.min(threadStarts, 4)

        const segmentSpacing = launcherMassDriverLength / massDriverScrewSegments
        const baseDistanceAlongScrew = segmentIndex * segmentSpacing
        const screwLength = segmentSpacing - bracketThickness
        const initialDistance = dParamWithUnits['launchSledBodyLength'].value / 2

        const massDriverScrewGeometry = new ScrewGeometry(
            screwLength,
            shaftRadius,
            threadRadius,
            threadThickness,
            threadStarts,
            baseDistanceAlongScrew,
            launcherMassDriver2InitialVelocity,
            initialDistance,
            launcherMassDriverScrewRevolutionsPerSecond,
            launcherMassDriverForwardAcceleration,
            modelRadialSegments)
        const massDriverScrewMesh = new THREE.Mesh(massDriverScrewGeometry, massDriverScrewMaterials[segmentIndex%2])

        return massDriverScrewMesh
    }
}

export class virtualMassDriverScrew {
    constructor(d, index, unallocatedModelsArray) {
        this.d = d
        this.index = index
        this.unallocatedModels = unallocatedModelsArray
        this.model = null
        this.versionNumber = 0
        this.position = []
    }

    static update(dParamWithUnits, launcherMassDriverLength, massDriverScrewSegments, massDriverScrewMaterials, versionNumber) {
        virtualMassDriverScrew.launcherMassDriverLength = launcherMassDriverLength
        virtualMassDriverScrew.massDriverScrewSegments = massDriverScrewSegments
        virtualMassDriverScrew.massDriverScrewMaterials = massDriverScrewMaterials
        virtualMassDriverScrew.shaftRadius = dParamWithUnits['launcherMassDriverScrewShaftRadius'].value
        virtualMassDriverScrew.threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
        virtualMassDriverScrew.threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
        virtualMassDriverScrew.threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
        virtualMassDriverScrew.launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
        virtualMassDriverScrew.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        virtualMassDriverScrew.launcherMassDriver2InitialVelocity = dParamWithUnits['launcherMassDriver2InitialVelocity'].value
        
        virtualMassDriverScrew.bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
        virtualMassDriverScrew.numBrackets = dParamWithUnits['launcherMassDriverScrewNumBrackets'].value
        virtualMassDriverScrew.initialDistance = dParamWithUnits['launchSledBodyLength'].value / 2

        virtualMassDriverScrew.isVisible = dParamWithUnits['showMassDriverScrews'].value
        virtualMassDriverScrew.isDynamic =  true
        virtualMassDriverScrew.hasChanged = true
        virtualMassDriverScrew.sidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
        virtualMassDriverScrew.upwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
        virtualMassDriverScrew.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
        virtualMassDriverScrew.versionNumber = versionNumber
        
    }

    placeAndOrientModel(om, refFrame) {
        const d = this.d 
        if (d===undefined || (d<0) || (d>1)) {
            console.log("error!!!")
        }
        else {
            if (virtualMassDriverScrew.isVisible) {
                if (this.versionNumber!=virtualMassDriverScrew.versionNumber) {
                    // Something about the design has been updated so this instance also needs to be updated
                    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
                    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
                    const forward = refFrame.curve.getTangentAt(d)
                    const upward = refFrame.curve.getNormalAt(d)
                    const rightward = refFrame.curve.getBinormalAt(d)
                    this.position[0] = refFrame.curve.getPointAt(d)
                        .add(rightward.clone().multiplyScalar(virtualMassDriverScrew.sidewaysOffset))
                        .add(upward.clone().multiplyScalar(virtualMassDriverScrew.upwardsOffset))
                    this.position[1] = refFrame.curve.getPointAt(d)
                        .add(rightward.clone().multiplyScalar(-virtualMassDriverScrew.sidewaysOffset))
                        .add(upward.clone().multiplyScalar(virtualMassDriverScrew.upwardsOffset))
                    this.orientation = refFrame.curve.getQuaternionAt(d, modelForward, modelUpward)
                    this.versionNumber = virtualMassDriverScrew.versionNumber
                }

                // Check that we have the correct model for this position. If we don't, regenerate the model.
                if (om.userData!=this.index) {
                    // Assigned model's geometry is the wrong shape and needs to be regenerated
                    // Check that the geometries for left and right screws are the same
                    // console.log('Regenerating Screw Geometry')
                    const segmentSpacing = virtualMassDriverScrew.launcherMassDriverLength / virtualMassDriverScrew.massDriverScrewSegments
                    const baseDistanceAlongScrew = this.index * segmentSpacing
                    let screwLength
                    if (this.index<virtualMassDriverScrew.numBrackets) {
                        screwLength = segmentSpacing - virtualMassDriverScrew.bracketThickness
                    }
                    else {
                        screwLength = segmentSpacing
                    }
                    const modelRadialSegments = 24 / Math.min(virtualMassDriverScrew.threadStarts, 4)
                    // Get rid of the previous geometries...
                    om.children[0].geometry.dispose()
                    om.children[1].geometry.dispose()
                    // Generate new geometries
                    om.children[0].geometry = new ScrewGeometry(
                        screwLength,
                        virtualMassDriverScrew.shaftRadius,
                        virtualMassDriverScrew.threadRadius,
                        virtualMassDriverScrew.threadThickness,
                        virtualMassDriverScrew.threadStarts,
                        baseDistanceAlongScrew,
                        virtualMassDriverScrew.launcherMassDriver2InitialVelocity,
                        virtualMassDriverScrew.initialDistance,
                        virtualMassDriverScrew.launcherMassDriverScrewRevolutionsPerSecond,
                        virtualMassDriverScrew.launcherMassDriverForwardAcceleration,
                        modelRadialSegments)
                    om.children[1].geometry = om.children[0].geometry
                    const select = (((this.index % 1024) <= 32) && (this.index<256*128)) ? 1 : 0
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
  