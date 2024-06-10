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
        const railUpwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value //- dParamWithUnits['launchSledHeight'].value/2 //- dParamWithUnits['launcherMassDriverBracketHeight'].value/2
        const screwSidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
        const screwUpwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
        const shaftRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
        const bracketHeight = dParamWithUnits['launcherMassDriverBracketHeight'].value
        const ribWidth = dParamWithUnits['launcherMassDriverBracketRibWidth'].value
        const tubeOuterRadius = dParamWithUnits['launcherMassDriverTubeOuterRadius'].value
        const tubeThickness = dParamWithUnits['launcherMassDriverTubeThickness'].value

        const segmentSpacing = launcherMassDriverLength / massDriverScrewSegments

        const modelLengthSegments = 1    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
        const modelRadialSegments = 32
        const shape = new THREE.Shape()
        // The bracket shape is centered on the middle of the rail (for now) so we need to subtract railUpwardsOffset from all the points
        shape.moveTo( railWidth/4, -railHeight/2 )
        // Create an arc length tubeOuterRadius - ribWidth, from x = railWidth/# to y = screwUpwardsOffset - bracketHeight/2
        const innerRibRadius = tubeOuterRadius - tubeThickness - ribWidth
        const outerRibRadius = tubeOuterRadius - tubeThickness
        // Counter-clockwise from right side of the base of rail support to bottom of right screw support
        const arc1StartAngle = -Math.acos(railWidth/4/innerRibRadius)
        const arc1EndAngle = Math.asin((screwUpwardsOffset - bracketHeight/2)/innerRibRadius)
        for (let i = 0; i<=16; i++) {
          const a = arc1StartAngle + i*(arc1EndAngle-arc1StartAngle)/16
          shape.lineTo( innerRibRadius*Math.cos(a), innerRibRadius*Math.sin(a)-railUpwardsOffset )
        }
        // Clockwise circle around the inside of the right screw
        const screwShaft1StartAngle = -Math.asin(bracketHeight/2/shaftRadius)
        const screwShaft1EndAngle = -Math.PI*2 + Math.asin(bracketHeight/2/shaftRadius)
        for (let i = 0; i<=16; i++) {
          const a = screwShaft1StartAngle + i*(screwShaft1EndAngle-screwShaft1StartAngle)/16
          shape.lineTo( screwSidewaysOffset + Math.cos(a)*shaftRadius, screwUpwardsOffset-railUpwardsOffset + Math.sin(a)*shaftRadius )
        }
        // Clockwise circle around the inside of the tube to the left screw
        const arc2StartAngle = Math.asin((screwUpwardsOffset + bracketHeight/2)/outerRibRadius)
        const arc2EndAngle = -Math.PI - Math.asin((screwUpwardsOffset + bracketHeight/2)/outerRibRadius)
        for (let i = 0; i<=64; i++) {
          const a = arc2StartAngle + i*(arc2EndAngle-arc2StartAngle)/64
          shape.lineTo( outerRibRadius*Math.cos(a), outerRibRadius*Math.sin(a)-railUpwardsOffset )
        }
        // Counter-clockwise circle around the inside of the left screw
        const screwShaft2StartAngle = 3*Math.PI - Math.asin(bracketHeight/2/shaftRadius)
        const screwShaft2EndAngle = Math.PI + Math.asin(bracketHeight/2/shaftRadius)
        for (let i = 0; i<=16; i++) {
          const a = screwShaft2StartAngle + i*(screwShaft2EndAngle-screwShaft2StartAngle)/16
          shape.lineTo( -screwSidewaysOffset + Math.cos(a)*shaftRadius, screwUpwardsOffset-railUpwardsOffset + Math.sin(a)*shaftRadius )
        }
        // Counter-clockwise from bottom of right screw support to the left side of the rail support
        const arc3StartAngle = -Math.PI - Math.asin((screwUpwardsOffset - bracketHeight/2) / innerRibRadius) 
        const arc3EndAngle = -Math.PI + Math.acos(railWidth/4/innerRibRadius)
        for (let i = 0; i<=16; i++) {
          const a = arc3StartAngle + i*(arc3EndAngle-arc3StartAngle)/16
          shape.lineTo( innerRibRadius*Math.cos(a), innerRibRadius*Math.sin(a)-railUpwardsOffset )
        }
        shape.lineTo(-railWidth/4, -railHeight/2)
        shape.lineTo(+railWidth/4, -railHeight/2)

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
        virtualMassDriverBracket.upwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value //- dParamWithUnits['launchSledHeight'].value/2 - dParamWithUnits['launcherMassDriverBracketHeight'].value/2
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
  