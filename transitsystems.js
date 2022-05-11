import * as THREE from '../three.js'

import { GLTFLoader } from '../three.js/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from '../three.js/examples/jsm/loaders/FBXLoader.js'
// import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/GLTFLoader.js'
// import { FBXLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/FBXLoader.js'

import * as tram from './tram.js'

class referenceFrame {
  constructor(numWedges, v, direction, trackIndex) {
    this.p = 0
    this.v = v
    this.direction = direction
    this.trackIndex = trackIndex
    this.startWedgeIndex = -1
    this.finishWedgeIndex = -1
    this.prevStartWedgeIndex = -1
    this.prevFinishWedgeIndex = -1
    // In each frame-of-reference, create an array of wedges. In each wedge, create an empty array for storing virtual transit vehicles
    const makePlaceHolderEntry = () => ({
      'virtualTransitVehicles': [],
      'virtualRingTerminuses': [],
      'virtualHabitats': [],
      'virtualElevatorCars': [],
      'virtualTransitTubes': [],
      'virtualElevatorCables': [],
    })
    this.wedges = new Array(numWedges).fill().map( makePlaceHolderEntry )

    // Debug
    //this.prevActionFlags = new Array(this.numWedges).fill(0)

  }
}

class virtualVehicle {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    // The virtual vehicle has a position around the ring, a transitTubeLevel, and an innerOuterTrackFactor
    // A 0 indicates the lower level, and a 1 indicates the upper level
    // A 0 indicates the inner track and a 1 indicates the outer track. Values between 0 and 1 indicate that the vehicle is changing tracks.
    // Distance around the track is a value from 0 to 2*PI
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
    // level
    // innerOuterTrackFactor
    // distanceAroundTrack
    // speed
    // accelleration
    // position
    // modelIndex
  }

  // The following properties are common to all virtual vehicles...
  static mainRingCurve
  static transitVehicleRelativePosition_r = []
  static transitVehicleRelativePosition_y = []
  static currentEquivalentLatitude
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, trackOffsetsList, crv, mainRingCurve) {
    virtualVehicle.mainRingCurve = mainRingCurve
    for (let trackIndex = 0; trackIndex<trackOffsetsList.length; trackIndex++) {
      const outwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + trackOffsetsList[trackIndex][0]
      const upwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value + trackOffsetsList[trackIndex][1] + dParamWithUnits['transitVehicleUpwardOffset'].value  // Last is half of the track height
      virtualVehicle.transitVehicleRelativePosition_r[trackIndex] = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
      virtualVehicle.transitVehicleRelativePosition_y[trackIndex]  = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    }
    virtualVehicle.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualVehicle.isDynamic =  true
    virtualVehicle.hasChanged = true
  }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = (this.p + refFrame.p) % 1 
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const trackIndex = refFrame.trackIndex
      const r1 = virtualVehicle.transitVehicleRelativePosition_r[trackIndex]
      const y1 = virtualVehicle.transitVehicleRelativePosition_y[trackIndex]
      const pointOnRingCurve = virtualVehicle.mainRingCurve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      om.position.set(
        pointOnRingCurve.x + r1 * Math.cos(angle),
        pointOnRingCurve.y + y1,
        pointOnRingCurve.z + r1 * Math.sin(angle) )
      om.rotation.set(0, -angle, virtualVehicle.currentEquivalentLatitude)
      om.rotateZ(-Math.PI/2)
      om.matrixValid = false
    }
  }
}

class virtualRingTerminus {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
  }

  // The following properties are common to all virtual ringTerminuses...
  static mainRingCurve
  static ringTerminusRelativePosition_r
  static ringTerminusRelativePosition_y
  static currentEquivalentLatitude
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, crv, mainRingCurve) {
    virtualRingTerminus.mainRingCurve = mainRingCurve
    const ringTerminusOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['ringTerminusOutwardOffset'].value
    const ringTerminusUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value
    virtualRingTerminus.ringTerminusRelativePosition_r = tram.offset_r(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
    virtualRingTerminus.ringTerminusRelativePosition_y = tram.offset_y(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
    virtualRingTerminus.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualRingTerminus.isDynamic =  false
    virtualRingTerminus.hasChanged = true
  }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = (this.p + refFrame.p) % 1 
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const pointOnRingCurve = virtualRingTerminus.mainRingCurve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      om.position.set(
        pointOnRingCurve.x + virtualRingTerminus.ringTerminusRelativePosition_r * Math.cos(angle),
        pointOnRingCurve.y + virtualRingTerminus.ringTerminusRelativePosition_y,
        pointOnRingCurve.z + virtualRingTerminus.ringTerminusRelativePosition_r * Math.sin(angle) )
      om.rotation.set(0, -angle, virtualRingTerminus.currentEquivalentLatitude)
      om.rotateZ(-Math.PI/2)
      om.rotateY(-Math.PI/2)
      om.matrixValid = false
      om.freeze()
    }
  }
}

class virtualElevatorCar {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
  }

  // The following properties are common to all virtual elevators...
  static mainRingCurve
  static elevatorCarOutwardOffset
  static elevatorCarUpwardOffset
  static elevatorCarForwardOffset
  static elevatorCarPosition_dr
  static elevatorCarPosition_dy
  static currentEquivalentLatitude
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, crv, mainRingCurve) {
    virtualElevatorCar.mainRingCurve = mainRingCurve
    virtualElevatorCar.elevatorCarOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorCableOutwardOffset'].value
    virtualElevatorCar.elevatorCarUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value + dParamWithUnits['elevatorCarUpwardOffset'].value
    virtualElevatorCar.elevatorCarForwardOffset = dParamWithUnits['elevatorCableForwardOffset'].value
    virtualElevatorCar.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualElevatorCar.elevatorCarRotZ = crv.currentEquivalentLatitude - Math.PI/2
    virtualElevatorCar.isDynamic =  true
    virtualElevatorCar.hasChanged = true
  }

  static animate(elevatorAltitude, crv) {
    virtualElevatorCar.elevatorCarPosition_dr = tram.offset_r(virtualElevatorCar.elevatorCarOutwardOffset, virtualElevatorCar.elevatorCarUpwardOffset + elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
    virtualElevatorCar.elevatorCarPosition_dy = tram.offset_y(virtualElevatorCar.elevatorCarOutwardOffset, virtualElevatorCar.elevatorCarUpwardOffset + elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = (this.p + refFrame.p) % 1 
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const pointOnRingCurve = virtualElevatorCar.mainRingCurve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      om.position.set(
        pointOnRingCurve.x + virtualElevatorCar.elevatorCarPosition_dr * Math.cos(angle) + virtualElevatorCar.elevatorCarForwardOffset * -Math.sin(angle),
        pointOnRingCurve.y + virtualElevatorCar.elevatorCarPosition_dy,
        pointOnRingCurve.z + virtualElevatorCar.elevatorCarPosition_dr * Math.sin(angle) + virtualElevatorCar.elevatorCarForwardOffset * Math.cos(angle))
      //console.log('Car ' + virtualElevatorCar.elevatorCableForwardOffset)
      om.rotation.set(0, -angle, virtualElevatorCar.elevatorCarRotZ)
      //om.rotateY(-Math.PI)
      om.matrixValid = false
      om.freeze()
    }
  }

}

class virtualHabitat {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
  }

  // The following properties are common to all virtual habitats...
  static mainRingCurve
  static habitatRelativePosition_r
  static habitatRelativePosition_y
  static habitatOutwardOffset
  static habitatUpwardOffset
  static habitatForwardOffset
  static currentEquivalentLatitude
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, crv, mainRingCurve) {
    virtualHabitat.mainRingCurve = mainRingCurve
    const ringTerminusOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['ringTerminusOutwardOffset'].value
    const ringTerminusUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['ringTerminusUpwardOffset'].value
    virtualHabitat.habitatOutwardOffset = dParamWithUnits['habitatOutwardOffset'].value
    virtualHabitat.habitatUpwardOffset = dParamWithUnits['habitatUpwardOffset'].value
    virtualHabitat.habitatForwardOffset = dParamWithUnits['habitatForwardOffset'].value
    virtualHabitat.habitatRelativePosition_r = tram.offset_r(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
    virtualHabitat.habitatRelativePosition_y = tram.offset_y(ringTerminusOutwardOffset, ringTerminusUpwardOffset, crv.currentEquivalentLatitude)
    virtualHabitat.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualHabitat.isDynamic =  false
    virtualHabitat.hasChanged = true
  }

  // static update(dParamWithUnits, crv, mainRingCurve) {
  //   virtualHabitat.mainRingCurve = mainRingCurve 
  //   virtualHabitat.habitatRelativePosition_r = tram.offset_r(habitatOutwardOffset, habitatUpwardOffset, crv.currentEquivalentLatitude)
  //   virtualHabitat.habitatRelativePosition_y = tram.offset_y(habitatOutwardOffset, habitatUpwardOffset, crv.currentEquivalentLatitude)
  //   virtualHabitat.habitatForwardOffset = dParamWithUnits['habitatForwardOffset'].value
  //   virtualHabitat.currentEquivalentLatitude = crv.currentEquivalentLatitude
  //   virtualHabitat.isDynamic =  false
  //   virtualHabitat.hasChanged = true
  // }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = (this.p + refFrame.p) % 1 
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const pointOnRingCurve = virtualHabitat.mainRingCurve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      om.position.set(
        pointOnRingCurve.x + virtualHabitat.habitatRelativePosition_r * Math.cos(angle),
        pointOnRingCurve.y + virtualHabitat.habitatRelativePosition_y,
        pointOnRingCurve.z + virtualHabitat.habitatRelativePosition_r * Math.sin(angle) )
      om.rotation.set(0, -angle, virtualHabitat.currentEquivalentLatitude)
      om.rotateZ(-Math.PI/2)
      om.rotateY(-Math.PI/2)
      om.matrixValid = false
      om.children[0].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset, virtualHabitat.habitatOutwardOffset)
      om.children[1].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset, virtualHabitat.habitatOutwardOffset)
      om.children[2].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset + om.children[2].userData['upwardOffset'], virtualHabitat.habitatOutwardOffset)
      om.children[3].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset + om.children[3].userData['upwardOffset'], virtualHabitat.habitatOutwardOffset)
      om.children[4].position.set(virtualHabitat.habitatForwardOffset, virtualHabitat.habitatUpwardOffset + om.children[4].userData['upwardOffset'], virtualHabitat.habitatOutwardOffset)
      om.updateMatrixWorld()
      om.freeze()
    }
  }

  // placeAndOrientModel(om, refFrame) {
  //   const modelsTrackPosition = (this.p + refFrame.p) % 1 
  //   if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
  //     console.log("error!!!")
  //   }
  //   else {
  //     const pointOnRingCurve = virtualHabitat.mainRingCurve.getPoint(modelsTrackPosition)
  //     const angle = 2 * Math.PI * modelsTrackPosition
  //     om.position.set(
  //       pointOnRingCurve.x + virtualHabitat.habitatRelativePosition_r * Math.cos(angle) + virtualHabitat.habitatForwardOffset * -Math.sin(angle),
  //       pointOnRingCurve.y + virtualHabitat.habitatRelativePosition_y,
  //       pointOnRingCurve.z + virtualHabitat.habitatRelativePosition_r * Math.sin(angle) + virtualHabitat.habitatForwardOffset * Math.cos(angle) )
  //     om.rotation.set(0, -angle, virtualHabitat.currentEquivalentLatitude)
  //     om.rotateZ(-Math.PI/2)
  //     om.rotateY(Math.PI/2)
  //     om.matrixValid = false
  //     om.freeze()
  //   }
  // }
}
class virtualTransitTube {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
  }

  // The following properties are common to all virtual habitats...
  static mainRingCurve
  static habitatRelativePosition_r
  static habitatRelativePosition_y
  static currentEquivalentLatitude
  static elevatorCarRotZ
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, crv, mainRingCurve) {
    virtualTransitTube.mainRingCurve = mainRingCurve 
    const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorCableOutwardOffset'].value
    const habitatUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['habitatUpwardOffset'].value
    virtualTransitTube.habitatRelativePosition_r = tram.offset_r(cableOutwardOffset, habitatUpwardOffset, crv.currentEquivalentLatitude)
    virtualTransitTube.habitatRelativePosition_y = tram.offset_y(cableOutwardOffset, habitatUpwardOffset, crv.currentEquivalentLatitude)
    virtualTransitTube.currentEquivalentLatitude = crv.currentEquivalentLatitude
    virtualTransitTube.elevatorCarRotZ = crv.currentEquivalentLatitude - Math.PI/2
    virtualTransitTube.isDynamic =  false
    virtualTransitTube.hasChanged = true
  }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = (this.p + refFrame.p) % 1 
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const pointOnRingCurve = virtualTransitTube.mainRingCurve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      om.position.set(
        pointOnRingCurve.x + virtualTransitTube.habitatRelativePosition_r * Math.cos(angle) + -11 * -Math.sin(angle),
        pointOnRingCurve.y + virtualTransitTube.habitatRelativePosition_y + -20,
        pointOnRingCurve.z + virtualTransitTube.habitatRelativePosition_r * Math.sin(angle) + -11 * Math.cos(angle) )
      om.rotation.set(0, -angle, virtualTransitTube.elevatorCarRotZ)
      om.matrixValid = false
      om.freeze()
    }
  }
}

class virtualElevatorCable {
  constructor(positionInFrameOfReference, unallocatedModelsArray) {
    this.p = positionInFrameOfReference
    this.unallocatedModels = unallocatedModelsArray
  }

  // The following properties are common to all virtual habitats...
  static mainRingCurve
  static elevatorCableUpperAttachPnt_dr
  static elevatorCableLowerAttachPnt_dr
  static elevatorCableUpperAttachPnt_dy
  static elevatorCableLowerAttachPnt_dy
  static elevatorCableForwardOffset
  static isVisible
  static isDynamic
  static hasChanged

  static update(dParamWithUnits, crv, mainRingCurve) {
    virtualElevatorCable.mainRingCurve = mainRingCurve
    const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorCableOutwardOffset'].value
    virtualElevatorCable.elevatorCableUpperAttachPnt_dr = tram.offset_r(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
    virtualElevatorCable.elevatorCableLowerAttachPnt_dr = tram.offset_r(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
    virtualElevatorCable.elevatorCableUpperAttachPnt_dy = tram.offset_y(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
    virtualElevatorCable.elevatorCableLowerAttachPnt_dy = tram.offset_y(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
    virtualElevatorCable.elevatorCableForwardOffset = dParamWithUnits['elevatorCableForwardOffset'].value
    virtualElevatorCable.isVisible = dParamWithUnits['showElevatorCables'].value
    virtualElevatorCable.isDynamic =  false
    virtualElevatorCable.hasChanged = true
  }

  placeAndOrientModel(om, refFrame) {
    const modelsTrackPosition = (this.p + refFrame.p) % 1     
    if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
      console.log("error!!!")
    }
    else {
      const pointOnRingCurve = virtualElevatorCable.mainRingCurve.getPoint(modelsTrackPosition)
      const angle = 2 * Math.PI * modelsTrackPosition
      const elevatorCableUpperAttachPnt = new THREE.Vector3(
        virtualElevatorCable.elevatorCableUpperAttachPnt_dr * Math.cos(angle) + virtualElevatorCable.elevatorCableForwardOffset * -Math.sin(angle),
        virtualElevatorCable.elevatorCableUpperAttachPnt_dy,
        virtualElevatorCable.elevatorCableUpperAttachPnt_dr * Math.sin(angle) + virtualElevatorCable.elevatorCableForwardOffset * Math.cos(angle),
      )
      const elevatorCableLowerAttachPnt = new THREE.Vector3(
        virtualElevatorCable.elevatorCableLowerAttachPnt_dr * Math.cos(angle) + virtualElevatorCable.elevatorCableForwardOffset * -Math.sin(angle),
        virtualElevatorCable.elevatorCableLowerAttachPnt_dy,
        virtualElevatorCable.elevatorCableLowerAttachPnt_dr * Math.sin(angle) + virtualElevatorCable.elevatorCableForwardOffset * Math.cos(angle),
      )
      const pointSet = [elevatorCableUpperAttachPnt, elevatorCableLowerAttachPnt]
      om.geometry.setFromPoints(pointSet)
      om.position.set(
        pointOnRingCurve.x,
        pointOnRingCurve.y,
        pointOnRingCurve.z)
      //om.rotation.set(0, 0, 0)
      om.visible = virtualElevatorCable.isVisible
      om.updateMatrix()
      om.matrixValid = false
      om.freeze()

      //console.log('New Cable ', om, modelsTrackPosition, angle, pointOnRingCurve, virtualElevatorCable.elevatorCableLowerAttachPnt_dr, virtualElevatorCable.elevatorCableLowerAttachPnt_dy, elevatorCableLowerAttachPnt)

    }
  }
}

export class transitSystem {

  // A transit vehicle system comprises four moving frames of refernence and each is divided into "numWedges" sections,
  // called "wedges". A large number of "virtual" transit vehicles are created and each is placed inside one wedge 
  // within one of the frames of reference. The frames-of-reference rotate. When a wedge enters the proximity of the camera,
  // the virtual vehicles in that wedge are allocated models of transit vehicles from a pool. Allocated models will be
  // made visible, positioned in the scene, and rendered. When a wedge leaves the proximity of the camera, its models
  // are retured to the pool. Virtual vehicles will also respond to timer events. These events will cause them to 
  // occassionally hop between two frames of reference.

  constructor(scene, dParamWithUnits, specs, genSpecs, trackOffsetsList, crv, ecv, radiusOfPlanet, mainRingCurve) {

    this.scene = scene
    this.unallocatedTransitVehicleModels = []
    this.unallocatedRingTerminusModels = []
    this.unallocatedElevatorCarModels = []
    this.unallocatedHabitatModels = []
    this.unallocatedTransitTubeModels = []
    this.unallocatedElevatorCableModels = []
    this.numWedges = 1024
    this.actionFlags = new Array(this.numWedges).fill(0)

    // Debug - ToDo clean this up when it's no longer needed

    // Creates a pool of transit vehicle models. Some these will be assigned to "virtual vehicles" that are within range of the camera.
    // The rest will be made invisible
    const v = dParamWithUnits['transitVehicleCruisingSpeed'].value
    this.refFrames = [
      // For vehicles cruising at a steady speed...
      new referenceFrame(this.numWedges, v, 1, 1),
      new referenceFrame(this.numWedges, v, -1, 3),
      // // For vehicles making a stop at a ringTerminus...
      new referenceFrame(this.numWedges, v/10, 1, 0),
      new referenceFrame(this.numWedges, v/10, -1, 2),
      new referenceFrame(this.numWedges, 0, 1, 1),
    ]

    this.eventList = []

    const n = dParamWithUnits['numVirtualTransitVehicles'].value
    let step1 = 1.0 / (n*10/40)
    // We will only place virtual vehicles on the express lanes initially. Timer events will later move vehicles
    // over to the collector lanes
    const outerTracks = [this.refFrames[0], this.refFrames[1]]
    outerTracks.forEach(refFrame => {
      for (let positionInFrameOfReference = 0, i = 0; i < n * 10 / 40; positionInFrameOfReference += step1, i++) {
        const randomizedPositionInFrameOfReference = positionInFrameOfReference + (step1 * 0.8 * Math.random())
        const wedgeIndex = Math.floor(randomizedPositionInFrameOfReference * this.numWedges) % this.numWedges
        refFrame.wedges[wedgeIndex]['virtualTransitVehicles'].push(new virtualVehicle(randomizedPositionInFrameOfReference, this.unallocatedTransitVehicleModels))
      }
    })

    // Putting few cars in collector lanes for testing...
    let step2 = 1.0 / (n*10/40)
    const innerTracks = [this.refFrames[2], this.refFrames[3]]
    innerTracks.forEach(refFrame => {
      for (let positionInFrameOfReference = 0, i = 0; i < n * 10 / 40; positionInFrameOfReference += step2, i++) {
        const randomizedPositionInFrameOfReference = positionInFrameOfReference + (step2 * 0.8 * Math.random())
        const wedgeIndex = Math.floor(randomizedPositionInFrameOfReference * this.numWedges) % this.numWedges
        refFrame.wedges[wedgeIndex]['virtualTransitVehicles'].push(new virtualVehicle(randomizedPositionInFrameOfReference, this.unallocatedTransitVehicleModels))
      }
    })

    // Place ringTerminuses, elevatorCars, and habitats...
    const nt = dParamWithUnits['numVirtualRingTerminuses'].value
    const nh = dParamWithUnits['numVirtualHabitats'].value
    const totalFacilities = nt + nh
    let step3 = 1.0 / totalFacilities
    let prevFloorS = -1
    const staticFrame = [this.refFrames[4]]
    let positionInFrameOfReference
    staticFrame.forEach(refFrame => {
      for (let i = 0; i < totalFacilities; i++) {
        positionInFrameOfReference = i * step3
        const wedgeIndex = Math.floor(positionInFrameOfReference * this.numWedges) % this.numWedges
        const currFloorS = Math.floor(i * nt / totalFacilities)
        if (currFloorS == prevFloorS) {
          refFrame.wedges[wedgeIndex]['virtualHabitats'].push(new virtualHabitat(positionInFrameOfReference, this.unallocatedHabitatModels))
        }
        else {
          refFrame.wedges[wedgeIndex]['virtualRingTerminuses'].push(new virtualRingTerminus(positionInFrameOfReference, this.unallocatedRingTerminusModels))
          refFrame.wedges[wedgeIndex]['virtualElevatorCars'].push(new virtualElevatorCar(positionInFrameOfReference, this.unallocatedElevatorCarModels))
          refFrame.wedges[wedgeIndex]['virtualElevatorCables'].push(new virtualElevatorCable(positionInFrameOfReference, this.unallocatedElevatorCableModels))
        }
        refFrame.wedges[wedgeIndex]['virtualTransitTubes'].push(new virtualTransitTube(positionInFrameOfReference, this.unallocatedTransitTubeModels))
        prevFloorS = currFloorS
      }
    })
      
    function prepareACallbackFunctionForGLTFLoader(myScene, myList, objName, scale_Factor, n) {
      return function( {scene} ) {
        const object = scene.children[0]
        object.visible = false
        object.name = objName
        object.traverse(child => {child.name = objName+'_'+child.name})
        object.children.forEach(child => child.freeze())
        object.scale.set(scale_Factor, scale_Factor, scale_Factor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          myList.push(tempModel)
        }
      } 
    }

    function prepareACallbackFunctionForFBXLoader(myScene, myList, objName, scaleFactor, n) {
      return function( object ) {
        if (objName == 'ringTerminus') {
          // Delete the tube and tracks from the model
          for (let i = 0; i<5; i++) {
            object.children[i].visible = false
          }
        }
        if (objName == 'habitat') {
          const tempHabitat = tram.generateHabitatMeshes(dParamWithUnits, specs, genSpecs)
          for (let i = 5; i<=8; i++) {
            tempHabitat.add(object.children[i].clone())
          }
          for (let i = 13; i<=27; i++) {
            tempHabitat.add(object.children[i].clone())
          }
          for (let i = 42; i<=42; i++) {
            tempHabitat.add(object.children[i].clone())
          }
          object = tempHabitat
        }
        object.updateMatrixWorld()
        object.visible = false
        object.name = objName
        object.traverse(child => {child.name = objName+'_'+child.name})
        object.children.forEach(child => child.freeze())
        object.scale.set(scaleFactor, scaleFactor, scaleFactor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          myList.push(tempModel)
        }
      }
    }

    const addTransitVehicles = prepareACallbackFunctionForGLTFLoader(this.scene, this.unallocatedTransitVehicleModels, 'transitVehicle',  0.0254 * 1.25, dParamWithUnits['numTransitVehicleModels'].value)
    const addRingTerminuses = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedRingTerminusModels, 'ringTerminus', 1.25, dParamWithUnits['numRingTerminusModels'].value)
    const addElevatorCars = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedElevatorCarModels,'elevatorCar', 1.04, dParamWithUnits['numElevatorCarModels'].value)
    const addHabitats = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedHabitatModels, 'habitat', 1.25, dParamWithUnits['numHabitatModels'].value)
    const addTransitTubes = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedTransitTubeModels, 'transitTube', .03, dParamWithUnits['numTransitTubeModels'].value)
    const progressFunction = function ( xhr ) {
      console.log( ( xhr.loaded / xhr.total * 100 ) + '% model loaded' );
    }
    const errorFunction = function ( error ) {
      console.log( 'An error happened', error );
    }

    // Each line of the following code loads a model, and then the loader calls a callback function that creates a number of copies, adds them
    // to an array of unallocated models, and sets each to be invisible. Later, models from this pool will be dynamically reallocated to 
    // various "virtual objects" and made visible when the virtual objects are deemed to be near enough to the scene's camera.
    const gltfloader = new GLTFLoader()
    // Note: looks like maybe the TransitCar model was created in units of inches and then a 0.02539 scaling factor was applied
    gltfloader.load('models/TransitCar.glb', addTransitVehicles, progressFunction, errorFunction )

    const fbxloader = new FBXLoader()//
    fbxloader.load('models/RingTerminus.fbx', addRingTerminuses, progressFunction, errorFunction )
    fbxloader.load('models/RingTerminus.fbx', addHabitats, progressFunction, errorFunction )
    fbxloader.load('models/Elevator.fbx', addElevatorCars, progressFunction, errorFunction )
    fbxloader.load('models/Elevator.fbx', addTransitTubes, progressFunction, errorFunction )

    const pointSet = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]
    const cableMaterial = new THREE.LineBasicMaterial({
      vertexColors: THREE.VertexColors,
      //color: 0x4897f8,
      transparent: true,
      opacity: dParamWithUnits['cableVisibility'].value
    })
    const elevatorCableModel = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pointSet), cableMaterial)
    elevatorCableModel.visible = false
    elevatorCableModel.name = 'elevatorCable'
    for (let i = 0; i<dParamWithUnits['numElevatorCableModels'].value; i++) {
      const tempModel = elevatorCableModel.clone()
      this.unallocatedElevatorCableModels.push(tempModel)
      this.scene.add(tempModel)
    }

    // This calculator computes the position of the collector lane reference frames as a function of time
    this.refFrameCalculator = new tram.vehicleReferenceFrameTrackPositionCalculator(dParamWithUnits, mainRingCurve, crv)
    this.elevatorPosCalc = new tram.elevatorPositionCalculator(dParamWithUnits, crv, ecv)

    this.transitVehicleRelativePosition_r = []
    this.transitVehicleRelativePosition_y = []
    this.ringTerminusRelativePosition_r = 0
    this.ringTerminusRelativePosition_y = 0
    this.update(dParamWithUnits, trackOffsetsList, crv, radiusOfPlanet, mainRingCurve)
  }

  update(dParamWithUnits, specs, genSpecs, trackOffsetsList, crv, radiusOfPlanet, mainRingCurve) {
    this.refFrames[0].v = dParamWithUnits['transitVehicleCruisingSpeed'].value
    this.refFrames[1].v = dParamWithUnits['transitVehicleCruisingSpeed'].value

    virtualVehicle.update(dParamWithUnits, trackOffsetsList, crv, mainRingCurve)
    virtualRingTerminus.update(dParamWithUnits, crv, mainRingCurve)
    virtualElevatorCar.update(dParamWithUnits, crv, mainRingCurve)
    virtualHabitat.update(dParamWithUnits, crv, mainRingCurve)
    virtualTransitTube.update(dParamWithUnits, crv, mainRingCurve)
    virtualElevatorCable.update(dParamWithUnits, crv, mainRingCurve)

    this.showTransitVehicles = dParamWithUnits['showTransitVehicles'].value
    this.animateTransitVehicles = dParamWithUnits['animateTransitVehicles'].value ? 1 : 0    
    this.animateElevatorCars = dParamWithUnits['animateElevatorCars'].value ? 1 : 0

    this.crv = crv

    this.radiusOfPlanet = radiusOfPlanet

    if (genSpecs) {
      // Call the function just to populate the specs structure. This doesn't update the model yet, unfortunately.
      // ToDo: Update the habitat models if its design parameters change
      tram.generateHabitatMeshes(dParamWithUnits, specs, genSpecs)
    }
  }

  animate(timeSinceStart, tetheredRingRefCoordSys, cameraPosition, mainRingCurve, dParamWithUnits) {
    
    let wedgeIndex

    while ((this.eventList.length>0) && (this.eventList[0].triggerTime < timeSinceStart)) {
      // Process timer events - these events will mainly cause various virtualVehicles to change from one frame of reference to another

      this.eventList.shift()
    }

    // Update the frames of reference. Frames of reference include: 
    //   1) the travelling at full speed frame, 
    //   2) the making a stop frame, and
    //   3) the making a "delay manuever" frame

    const timePerCompleteRevolution = 2 * Math.PI * this.crv.mainRingRadius / this.refFrames[0].v

    this.refFrames[0].p = (this.animateTransitVehicles * timeSinceStart / timePerCompleteRevolution) % 1
    this.refFrames[1].p = 1 - this.refFrames[0].p
    // TBD - need a more sophisticated motion profile... 
    const trackDistance = this.refFrameCalculator.calcTrackPosition(this.animateTransitVehicles * timeSinceStart)
    this.refFrames[2].p = trackDistance
    this.refFrames[3].p = 1 - trackDistance
    this.refFrames[4].p = 0 // This is the stationary reference frame 

    // There are time window based lists to indicate which vehicles are due to start manuevering
    // Walk these lists and add any registered vehicles to the list of vehicles executing a manuever.



    // By default, all of the vehicles that are cruising at steady state will advance by the
    // same amount. This is taken care of by incrementing a single constant. Only those vehicles that
    // are executing a manuever (such as stoppoing at a terinus) need to be processed individually


    // Determine if each wedge is visible based on distance from the camera
    // Convert pointOnEarthsSurface into tetheredRingRefCoordSys

    // ToDo : We first need to figure out if the camera is close enough to the ring for there to be any wedges in range...
    const cameraRange = 60000 // +/- 50km
    //const distanceToCenterOfEarth = cameraPosition.length()
    //const cameraAltitude = distanceToCenterOfEarth - this.radiusOfPlanet
    //let cameraTrackPosition

    // Convert pointOnEarthsSurface into tetheredRingRefCoordSys
    const localCameraLocation = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone())
    // Then compute it's theta value and convert it to a 0 to 1 value 
    const nearestTrackPositionToCamera = (Math.atan2(localCameraLocation.z, localCameraLocation.x) / (2*Math.PI) + 1) % 1
    const pointOnRingAtNearestTrackPosition = mainRingCurve.getPoint(nearestTrackPositionToCamera)
    const distanceFromCameraToRing = pointOnRingAtNearestTrackPosition.distanceTo(localCameraLocation)

    // if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
    //   const localPoint = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone()).normalize()
    //   // Then compute it's track position value (as a value from 0.0 to 1.0)...
    //   cameraTrackPosition = (Math.atan2(localPoint.z, localPoint.x) / (2*Math.PI) + 1) % 1
    // }
    // else {
    //   cameraTrackPosition = 0
    // }
    // Then figure out starting and finishing wedges for that position
    const cameraRangeDelta = cameraRange / (2 * Math.PI * this.crv.mainRingRadius)
    const cameraRangeStart = (nearestTrackPositionToCamera - cameraRangeDelta + 1) % 1
    const cameraRangeFinish = (nearestTrackPositionToCamera + cameraRangeDelta + 1) % 1

    // let transitVehicleShortageCount
    // let ringTerminusShortageCount
    // let elevatorCarShortageCount
    // let habitatShortageCount
    const assignModelList = []
    const removeModelList = []
    const updateModelList = []

    // First we determine which wedges in each of the reference frames are entering and leaving the proximity of the camera
    // Hack
    // const tempRF = [this.refFrames[4]]
    // tempRF.forEach(refFrame => {
    this.refFrames.forEach(refFrame => {
      const clearFlagsList = []
      //if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
      if (distanceFromCameraToRing<=cameraRange) {
        // Subtract the current rotationalPosition of the reference frame from the cameraRangeStart and cameraRangeFinish values
        const cameraRangeStartForFrame = (cameraRangeStart - refFrame.p + 1 ) % 1
        const cameraRangeFinishForFrame = (cameraRangeFinish - refFrame.p + 1 ) % 1
        refFrame.startWedgeIndex = Math.floor(cameraRangeStartForFrame * this.numWedges)
        refFrame.finishWedgeIndex = Math.floor(cameraRangeFinishForFrame * this.numWedges)
      }
      else {
        refFrame.startWedgeIndex = -1
        refFrame.finishWedgeIndex = -1
      }

      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          this.actionFlags[wedgeIndex] |= 1
          clearFlagsList.push(wedgeIndex)
          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          this.actionFlags[wedgeIndex] |= 2
          clearFlagsList.push(wedgeIndex)
          if (wedgeIndex == refFrame.prevFinishWedgeIndex) break
        }
      }
      if (refFrame===this.refFrames[4]) {
        let flags = ""
        for (let i = 340; i<380; i++) {
          flags += '' + this.actionFlags[i]
        }
        //console.log(flags)
      }
      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          if (this.actionFlags[wedgeIndex]==1) {
              // Wedge wasn't visible before and it became visible, assign it the assignModel list
              assignModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (this.actionFlags[wedgeIndex] & 1 == 1) {
            // Wedge is currently visible, assign it the updateModel list
            updateModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          if (this.actionFlags[wedgeIndex]==2) {
            // Wedge was visible before and it became invisible, add it to the removeModel list
            removeModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (wedgeIndex == refFrame.prevFinishWedgeIndex) break
        }
      }
      
      // Debug - ToDo clean this up when it's no longer needed
      // let different = false
      // for (let j=0; j<this.actionFlags.length; j++) {
      //   if (this.actionFlags[j]!=refFrame.prevActionFlags[j]) {
      //     different = true
      //     break
      //   }
      // }
      // if (different) {
      //   let prstr = ''
      //   for (let j = 0; j<this.actionFlags.length; j++) {
      //     prstr += String(this.actionFlags[j])
      //   }
      //   console.log(prstr)
      // }
      // for (let j=0; j<this.actionFlags.length; j++) {
      //   refFrame.prevActionFlags[j] = this.actionFlags[j]
      // }

      refFrame.prevStartWedgeIndex = refFrame.startWedgeIndex
      refFrame.prevFinishWedgeIndex = refFrame.finishWedgeIndex

      clearFlagsList.forEach(wedgeIndex => {
        this.actionFlags[wedgeIndex] = 0  // Clear the action flags to ready them for future reuse
      })
  
    })
    if (removeModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedTransitTubeModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
      //console.log('Removing ' + removeModelList.length)
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedTransitTubeModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
      //console.log('Adding ' + assignModelList.length)
    }

    // Free models that are in wedges that have recently left the region near the camera
    removeModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
        objectValue.forEach(object => {
          if (object.model) {
            object.model.visible = false
            object.unallocatedModels.push(object.model)
            object.model = null
          }
        })
      })
    })

    // Calcuate some constants that we will use later... 

    // All elevators are will be at the same height for now...
    const elevatorAltitude = this.elevatorPosCalc.calculateElevatorPosition(this.animateElevatorCars * timeSinceStart)
    // Hack
    //const elevatorAltitude = this.crv.currentMainRingAltitude // this.elevatorPosCalc.calculateElevatorPosition(this.animateElevatorCars * timeSinceStart)
    virtualElevatorCar.animate(elevatorAltitude, this.crv)

    // Assign models to virtualVehicles that have just entered the region near the camera
    assignModelList.forEach(entry => {
      const ranOutOfModelsInfo = {}
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
        if (objectValue.length>0) {
          objectValue.forEach(object => {
            if (!object.model) {
              if (object.unallocatedModels.length>0) {
                object.model = object.unallocatedModels.pop()
                object.model.visible = true
              }
              else {
                if (objectKey in ranOutOfModelsInfo) {
                  ranOutOfModelsInfo[objectKey]++
                }
                else {
                  ranOutOfModelsInfo[objectKey] = 1
                }
              }
            }
          })
          const classIsDynamic = objectValue[0].constructor.isDynamic
          const classHasChanged = objectValue[0].constructor.hasChanged
          if (!classIsDynamic && !classHasChanged) {
            // Static object so we will place the model (just once) at the same time we assign it to a virtual object
            objectValue.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, entry['refFrame'])
              }
            })
          }
        }
      })
      let allGood = true
      Object.entries(ranOutOfModelsInfo).forEach(([k, v]) => {
        if (v>0) {
          console.log('Ran out of ' + k + ' models (needed ' + v + ' more)')
          allGood = false
        }
      })
      if (!allGood) {
        console.log('Problem Assigning Models')
      }
      else {
        // Success!! We can remove this entry from the list now
        //assignModelList.splice(index, 1)
      }
    })
    // Now adjust the models position and rotation in all of the active wedges
    // transitVehicleShortageCount = 0
    // ringTerminusShortageCount = 0
    // elevatorCarShortageCount = 0
    // habitatShortageCount = 0

    updateModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
        if (objectValue.length>0) {
          const classIsDynamic = objectValue[0].constructor.isDynamic
          const classHasChanged = objectValue[0].constructor.hasChanged
          if (true || classIsDynamic || classHasChanged) {
            // Call the placement method for each active instance (unless the model class is static and unchanged)
            objectValue.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, entry['refFrame'])
              }
            })
          }
        }
      })
    })

    if (removeModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedTransitTubeModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedTransitTubeModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
    }

    // Clear all of the "hasChanged" flags
    virtualVehicle.hasChanged = false
    virtualRingTerminus.hasChanged = false
    virtualHabitat.hasChanged = false
    virtualElevatorCar.hasChanged = false
    virtualTransitTube.hasChanged = false
    virtualElevatorCable.hasChanged = false

    // Debug stuff...
    // console.log(ringTerminusModels)
    // if (transitVehicleShortageCount>0) {
    //   console.log('transitVehicleShortageCount was ' + transitVehicleShortageCount)
    // }
    // // console.log("vehicles unallocated: " + this.unallocatedTransitVehicleModels.length)
    // if (removeModelList.length) {
    //   console.log("removing " + removeModelList.length + " wedge")
    // }
    // if (assignModelList.length) {
    //   console.log("assigning " + assignModelList.length + " wedge")
    // }
    
  }

}