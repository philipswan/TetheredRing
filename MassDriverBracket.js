import * as THREE from 'three'
import { LineSuperCurve3 } from './SuperCurves'

export class massDriverBracketModel {
    // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
    // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
    // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
    // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
    constructor(dParamWithUnits, massDriverSuperCurve, launcherMassDriverLength, massDriverScrewSegments, segmentIndex) {

        const railWidth = dParamWithUnits['launcherMassDriverRailWidth'].value
        const railHeight = dParamWithUnits['launcherMassDriverRailHeight'].value
        const bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
        const railUpwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value - dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverBracketHeight'].value/2
        const screwSidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
        const screwUpwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
        const shaftRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value

        const segmentSpacing = launcherMassDriverLength / massDriverScrewSegments

        const modelLengthSegments = 1    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
        const modelRadialSegments = 32
        const shape = new THREE.Shape()
        shape.moveTo( railWidth/2, railHeight/2 )
        shape.lineTo( -railWidth/2, railHeight/2 )
        for (let a = 8; a<=24; a++) {
            shape.lineTo( -screwSidewaysOffset + Math.cos(a/16*Math.PI)*shaftRadius, (screwUpwardsOffset-railUpwardsOffset) + Math.sin(a/16*Math.PI)*shaftRadius )
        }
        shape.lineTo(-railWidth/2, -railHeight/2)
        shape.lineTo(+railWidth/2, -railHeight/2)
        for (let a = 24; a<=40; a++) {
            shape.lineTo( +screwSidewaysOffset + Math.cos(a/16*Math.PI)*shaftRadius, (screwUpwardsOffset-railUpwardsOffset) + Math.sin(a/16*Math.PI)*shaftRadius )
        }
        shape.lineTo( railWidth/2, railHeight/2 )
        // Now we need a reference point in the middle of this segment of the whole mass driver
        const modelsCurvePosition = (segmentIndex + 0.5) / massDriverScrewSegments
        const refPoint = massDriverSuperCurve.getPointAt(modelsCurvePosition)
        const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
        const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
        const orientation = massDriverSuperCurve.getQuaternionAt(modelsCurvePosition, modelForward, modelUpward).invert()

        // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
        const tubePoints = []
        for (let i = 0; i<=modelLengthSegments; i++) {
            const modelsCurvePosition = (segmentIndex + (i-modelLengthSegments/2)/modelLengthSegments * bracketThickness/segmentSpacing) / massDriverScrewSegments
            tubePoints.push(massDriverSuperCurve.getPointAt(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
        }
        const upDirection = new THREE.Vector3(-1, 0, 0)
        const massDriverSegmentCurve = new LineSuperCurve3(tubePoints[0], tubePoints[1], upDirection, upDirection)
        const extrudeSettings = {
            steps: 2,
            depth: 1,
            extrudePath: massDriverSegmentCurve
        }
        const massDriverBracketGeometry = new THREE.ExtrudeGeometry( shape, extrudeSettings )
        massDriverBracketGeometry.name = "massDriverBracketGeometry"
        const massDriverBracketMaterial = new THREE.MeshPhongMaterial( {color: 0x71797E})
        const massDriverBracketMesh = new THREE.Mesh(massDriverBracketGeometry, massDriverBracketMaterial)
        return massDriverBracketMesh
    }
}

export class virtualMassDriverBracket {
    constructor(d, unallocatedModelsArray) {
        this.d = d
        this.unallocatedModels = unallocatedModelsArray
        this.model = null
    }

    static update(dParamWithUnits, massDriverSuperCurve, versionNumber) {
        virtualMassDriverBracket.massDriverSuperCurve = massDriverSuperCurve
        virtualMassDriverBracket.isVisible = dParamWithUnits['showMassDriverBrackets'].value
        virtualMassDriverBracket.upwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value - dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverBracketHeight'].value/2
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
                    this.orientation = virtualMassDriverBracket.massDriverSuperCurve.getQuaternionAt(d, modelForward, modelUpward)
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
  