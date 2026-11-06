import * as THREE from 'three'
import { LineSuperCurve3 } from '../curves/SuperCurves.js'
import { ShapeUtils } from 'three'
import { VirtualObject, parameterSignature } from './VirtualObject.js'

export class massDriverBracketModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits) {

    this.update(dParamWithUnits)
    //this.massDriverBracketMaterial = new THREE.MeshPhongMaterial( {color: 0x71797E, transparent: true, opacity: 0.05})
    this.massDriverBracketMaterial = new THREE.MeshPhongMaterial( {color: 0x71797E})

  }
  
  update(dParamWithUnits) {

    this.bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
    this.shape = this.createShape(dParamWithUnits)
    this.lowDetailShape = this.createShape(dParamWithUnits, 4)

  }

  // The bracket between screw segments. The model's origin is where virtualMassDriverBracket places it:
  // the middle of a screw segment, less half a bracket (see addNewVirtualObjects), so the bracket, from
  // half a segment back, fills the gap of one bracket thickness that the screws leave at the start of
  // that segment. segmentSpacing: distance between screw segments. The model's forward is +y; the
  // track's curvature over half a segment is far too small to matter.
  createModel(segmentSpacing, shape = this.shape) {

    const tubePoints = [
      new THREE.Vector3(0, -segmentSpacing / 2 - this.bracketThickness / 2, 0),
      new THREE.Vector3(0, -segmentSpacing / 2 + this.bracketThickness / 2, 0),
    ]
    const upDirection = new THREE.Vector3(-1, 0, 0)
    const massDriverSegmentCurve = new LineSuperCurve3(tubePoints[0], tubePoints[1], upDirection, upDirection)
    const extrudeSettings = {
        steps: 2,
        depth: 1,
        extrudePath: massDriverSegmentCurve
    }
    const massDriverBracketGeometry = new THREE.ExtrudeGeometry( shape, extrudeSettings )
    massDriverBracketGeometry.name = "massDriverBracketGeometry"
    const massDriverBracketMesh = new THREE.Mesh(massDriverBracketGeometry, this.massDriverBracketMaterial)
    massDriverBracketMesh.name = "massDriverBracket"
    return massDriverBracketMesh
  }

  // arcSegments: segments per curved part of the outline (16 for full detail, fewer for distant brackets).
  createShape(dParamWithUnits, arcSegments = 16) {

    const railWidth = dParamWithUnits['launcherMassDriverRailWidth'].value
    const railHeight = dParamWithUnits['launcherMassDriverRailHeight'].value
    const railUpwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value //- dParamWithUnits['launchSledHeight'].value/2 //- dParamWithUnits['launcherMassDriverBracketHeight'].value/2
    const screwSidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
    const screwUpwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
    const shaftRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
    const bracketHeight = dParamWithUnits['launcherMassDriverBracketHeight'].value
    const ribWidth = dParamWithUnits['launcherMassDriverBracketRibWidth'].value
    const tubeInnerRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value

    const shape = new THREE.Shape()
    // The bracket shape is centered on the middle of the rail (for now) so we need to subtract railUpwardsOffset from all the points
    shape.moveTo( railWidth/4, -railHeight/2 )
    // Create an arc length tubeInnerRadius - ribWidth, from x = railWidth/# to y = screwUpwardsOffset - bracketHeight/2
    const innerRibRadius = tubeInnerRadius - ribWidth
    const outerRibRadius = tubeInnerRadius
    // Counter-clockwise from right side of the base of rail support to bottom of right screw support
    const arc1StartAngle = -Math.acos(railWidth/4/innerRibRadius)
    const arc1EndAngle = Math.asin((screwUpwardsOffset - bracketHeight/2)/innerRibRadius)
    for (let i = 0; i<=arcSegments; i++) {
      const a = arc1StartAngle + i*(arc1EndAngle-arc1StartAngle)/arcSegments
      shape.lineTo( innerRibRadius*Math.cos(a), innerRibRadius*Math.sin(a)-railUpwardsOffset )
    }
    // Clockwise circle around the inside of the right screw
    const screwShaft1StartAngle = -Math.asin(bracketHeight/2/shaftRadius)
    const screwShaft1EndAngle = -Math.PI*2 + Math.asin(bracketHeight/2/shaftRadius)
    for (let i = 0; i<=arcSegments; i++) {
      const a = screwShaft1StartAngle + i*(screwShaft1EndAngle-screwShaft1StartAngle)/arcSegments
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
    for (let i = 0; i<=arcSegments; i++) {
      const a = screwShaft2StartAngle + i*(screwShaft2EndAngle-screwShaft2StartAngle)/arcSegments
      shape.lineTo( -screwSidewaysOffset + Math.cos(a)*shaftRadius, screwUpwardsOffset-railUpwardsOffset + Math.sin(a)*shaftRadius )
    }
    // Counter-clockwise from bottom of right screw support to the left side of the rail support
    const arc3StartAngle = -Math.PI - Math.asin((screwUpwardsOffset - bracketHeight/2) / innerRibRadius) 
    const arc3EndAngle = -Math.PI + Math.acos(railWidth/4/innerRibRadius)
    for (let i = 0; i<=arcSegments; i++) {
      const a = arc3StartAngle + i*(arc3EndAngle-arc3StartAngle)/arcSegments
      shape.lineTo( innerRibRadius*Math.cos(a), innerRibRadius*Math.sin(a)-railUpwardsOffset )
    }
    shape.lineTo(-railWidth/4, -railHeight/2)
    shape.lineTo(+railWidth/4, -railHeight/2)
    return shape
  }

  genSpecs(dParamWithUnits, specs) {
    const shape = this.createShape(dParamWithUnits)
    const contour = []

    contour.push(shape.curves[0].v1)
    shape.curves.forEach(curve => {
      contour.push(curve.v2)
    })

    const bracketArea = Math.abs(ShapeUtils.area(contour))
    console.log("bracketArea:", bracketArea)
    specs['massDriverBracketArea'] = {value: bracketArea, units: "m2"}
    const bracketThickness = dParamWithUnits['launcherMassDriverScrewBracketThickness'].value
    const bracketVolume = bracketArea * bracketThickness
    specs['massDriverBracketVolume'] = {value: bracketVolume, units: "m3"}
    const densityOfMaterial = dParamWithUnits['launcherMassDriverScrewBracketDensity'].value
    const bracketMass = bracketVolume * densityOfMaterial
    specs['massDriverBracketMass'] = {value: bracketMass, units: "kg"}
    const costOfMaterial = dParamWithUnits['launcherMassDriverScrewBracketMaterialCost'].value
    const bracketCost = bracketMass * costOfMaterial
    specs['massDriverBracketMaterialCost'] = {value: bracketCost, units: "USD"}
    // contour.forEach(point => {
    //   console.log(point.x, point.y)
    // })

  }
}

export class virtualMassDriverBracket extends VirtualObject {
  constructor(d, index) {
    super()
    this.d = d
    this.index = index
  }

  static unallocatedModels = []
  static className = 'virtualMassDriverBrackets'
  static modelsAreRecyleable = true
  static highlightClass = 'massDriver'
  static isDynamic = false

  static signatureOf(dParamWithUnits) {
    return parameterSignature(dParamWithUnits,
      ['launcherMassDriverRail', 'launchRailUpwardsOffset', 'launcherMassDriverScrewSidewaysOffset', 'launcherMassDriverScrewUpwardsOffset',
        'launcherMassDriverScrewShaftOuterRadius', 'launcherMassDriverBracket', 'launcherMassDriverTubeInnerRadius', 'launcherMassDriverScrewBracketThickness'])
  }

  static isTeardownRequired(dParamWithUnits, massDriverAccelerationScrewSegments) {
    const newNumObjects = dParamWithUnits['showMassDriverBrackets'].value ? massDriverAccelerationScrewSegments : 0
    return newNumObjects!==virtualMassDriverBracket.numObjects
  }

  static update(dParamWithUnits, massDriverAccelerationScrewSegments, accelerationScrewLength, versionNumber) {
    virtualMassDriverBracket.numObjects = dParamWithUnits['showMassDriverBrackets'].value ? massDriverAccelerationScrewSegments : 0
    virtualMassDriverBracket.halfBracketThickness = (accelerationScrewLength > 0) ? dParamWithUnits['launcherMassDriverScrewBracketThickness'].value / 2 / accelerationScrewLength : 0
    virtualMassDriverBracket.isVisible = dParamWithUnits['showMassDriverBrackets'].value
    virtualMassDriverBracket.upwardsOffset = dParamWithUnits['launchRailUpwardsOffset'].value
    virtualMassDriverBracket.isDynamic = false
    virtualMassDriverBracket.hasChanged = true
    virtualMassDriverBracket.versionNumber = versionNumber
  }

  static addNewVirtualObjects(refFrames) {
    virtualMassDriverBracket.addEvenlySpacedObjects(refFrames, () => -virtualMassDriverBracket.halfBracketThickness)
  }

  placeAndOrientModel(om, refFrame) {
    this.placeAtD(om, refFrame, virtualMassDriverBracket.upwardsOffset)
  }
}
