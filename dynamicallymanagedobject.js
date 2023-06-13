import * as tram from './tram.js'

export class dynamicallyManagedObject {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    this.p = positionInFrameOfReference  // The assumption here is that the object generally does not move in its frame of reference
    this.unallocatedModels = unallocatedModelsArray // Common to all
  }

  // The following properties are common to all tube sections...
  static mainRingCurve
  static currentEquivalentLatitude
  static transitTubeRotZ
  static isVisible
  static isDynamic
  static hasChanged

  // Update is called occasionally in response to user input or user input automation routines (for recording or sweeping values),
  // it is not meant to be called by real-time animation code

  // The object's position and orientation will be defined relative to a curve, such as the curve that defines the shape of teh main ring
  // The object's exact position on the curve is specified by using a value from 0 to 1
  // The object's frame of reference needs upwards, outwards, and forwards direction vectors

  static update(dParamWithUnits, crv, curve) {
    dynamicallyManagedObject.curve = curve
    const transitTubeOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value
    const transitTubeUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value
    dynamicallyManagedObject.isVisible = dParamWithUnits['showTransitTube'].value
    dynamicallyManagedObject.relativePosition_r = tram.offset_r(transitTubeOutwardOffset, transitTubeUpwardOffset, crv.currentEquivalentLatitude)
    dynamicallyManagedObject.relativePosition_y = tram.offset_y(transitTubeOutwardOffset, transitTubeUpwardOffset, crv.currentEquivalentLatitude)
    dynamicallyManagedObject.currentEquivalentLatitude = crv.currentEquivalentLatitude
    dynamicallyManagedObject.rotZ = crv.currentEquivalentLatitude - Math.PI/2
    dynamicallyManagedObject.isDynamic =  false
    dynamicallyManagedObject.hasChanged = true

  }

  repositionDynamicallyManagedObject(p) {
    this.p = p
  }

  updateReferenceFrame() {
    
  }

  placeAndOrientModel(om, refFrame, wedgeToCameraDistance) {
    const modelsCurvePosition = (this.p + refFrame.p) % 1
    const pointOnCurve = dynamicallyManagedObject.curve.getPoint(modelsCurvePosition)
    const tangentToCurve = dynamicallyManagedObject.curve.getTangent(modelsCurvePosition)
    //const normalToCurve = dynamicallyManagedObject.curve.getNormal(modelsCurvePosition)

    // Create a quaternion that will convert and {sidewards, forwards, upwards} vector into the local coordinates
    // Upwards can be obtained directly from the position coordinate and location of the planet's center of gravity is
    // For forwards we need a tangent to the curve
    // Sidewards could be obtained from the cross product of forwards and upwards
    // Outwards is the curve's normal, or the direction of the inertial force experienced by something alomgthe curve
    const upwards = 0
    const outwards = 0
    const forwards = 0

    const angle = 2 * Math.PI * modelsCurvePosition
    om.position.set(
      pointOnCurve.x + dynamicallyManagedObject.relativePosition_r * Math.cos(angle),
      pointOnCurve.y + dynamicallyManagedObject.relativePosition_y,
      pointOnCurve.z + dynamicallyManagedObject.relativePosition_r * Math.sin(angle))
    om.rotation.set(0, -angle, dynamicallyManagedObject.rotZ)
    om.visible = dynamicallyManagedObject.isVisible
    om.matrixValid = false
    if (this.perfOptimizedThreeJS) om.freeze()
  }
}

// Need to create a function that allows the object to decide whether it has come within visual range or not.
// Need to define the object in a way that allows it to be split up into separate parts
// When a virtual model comes into visible range, it might be necessary to great a customized real model for it.
// Need to automatically create the right number of needed models instead of having to do it manually

// Object.update(mainRingCurve)
// Object.placeAndOrientModel(om, refFrame, wedgeToCameraDistance)
