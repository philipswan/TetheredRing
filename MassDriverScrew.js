import * as THREE from 'three'
import { ScrewGeometry } from './ScrewGeometry.js'

export class massDriverScrewModel {
    // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
    // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
    // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
    // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
    constructor(dParamWithUnits, launcherMassDriverLength, massDriverScrewSegments, segmentIndex, massDriverScrewTexture) {

        const shaftRadius = dParamWithUnits['launcherMassDriverScrewShaftRadius'].value
        const threadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
        const threadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
        const threadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
        const launcherMassDriverScrewRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
        const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        const launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
        const bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
        
        // The point of breaking the screw into segments relates to the need to display the brackets.
        const modelLengthSegments = 256 // this needs to be related to the number of turns per segment, and more segments are needed when the pitch is finer
        const modelRadialSegments = 24 / Math.min(threadStarts, 4)

        const segmentSpacing = launcherMassDriverLength / massDriverScrewSegments
        const baseDistanceAlongScrew = segmentIndex * segmentSpacing
        const screwLength = segmentSpacing - bracketThickness
        const initialDistance = dParamWithUnits['launchSledBodyLength'].value / 2

        const massDriverScrewGeometry = new ScrewGeometry(
        screwLength,
        modelLengthSegments,
        shaftRadius,
        threadRadius,
        threadThickness,
        threadStarts,
        baseDistanceAlongScrew,
        launcherMassDriverInitialVelocity,
        initialDistance,
        launcherMassDriverScrewRevolutionsPerSecond,
        launcherMassDriverForwardAcceleration,
        modelRadialSegments)
        const massDriverScrewMaterial = new THREE.MeshPhongMaterial()
        //const massDriverScrewMaterial = new THREE.MeshPhongMaterial( {map: massDriverScrewTexture})
        const massDriverScrewMesh = new THREE.Mesh(massDriverScrewGeometry, massDriverScrewMaterial)

        return massDriverScrewMesh
    }
}

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
                const slowDownPassageOfTime = Math.min(1, virtualMassDriverScrew.slowDownPassageOfTime + Math.min(1, 2**(Math.max(0, refFrame.timeSinceStart-20)-60)))
                const deltaT = refFrame.timeSinceStart * slowDownPassageOfTime
                om.rotateY(((-this.lr * deltaT * virtualMassDriverScrew.screwRevolutionsPerSecond) % 1) * 2 * Math.PI)
            }
            om.visible = virtualMassDriverScrew.isVisible
            om.matrixValid = false
            if (this.perfOptimizedThreeJS) om.freeze()
        }
    }

}
  