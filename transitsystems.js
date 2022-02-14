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
    const makePlaceHolderEntry = () => ({'virtualTransitVehicles': [], 'virtualTerminuses': [], 'virtualHabitats': [], 'virtualElevatorCars': []})
    this.wedges = new Array(numWedges).fill().map( makePlaceHolderEntry )
    // Debug
    //this.prevActionFlags = new Array(this.numWedges).fill(0)

  }
}

class virtualVehicle {
  constructor(positionInFrameOfReference, v) {
    // The virtual vehicle has a position around the ring, a transitTubeLevel, and an innerOuterTrackFactor
    // A 0 indicates the lower level, and a 1 indicates the upper level
    // A 0 indicates the inner track and a 1 indicates the outer track. Values between 0 and 1 indicate that the vehicle is changing tracks.
    // Distance around the track is a value from 0 to 2*PI
    this.p = positionInFrameOfReference
    // level
    // innerOuterTrackFactor
    // distanceAroundTrack
    // speed
    // accelleration
    // position
    // modelIndex
  }
}
class virtualTerminus {
  constructor(positionInFrameOfReference, v) {
    this.p = positionInFrameOfReference
  }
}

class virtualElevatorCar {
  constructor(positionInFrameOfReference, v) {
    this.p = positionInFrameOfReference
  }
}

class virtualHabitat {
  constructor(positionInFrameOfReference, v) {
    this.p = positionInFrameOfReference
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

  constructor(scene, dParamWithUnits, trackOffsetsList, crv, ecv, radiusOfPlanet, mainRingCurve) {

    this.scene = scene
    this.unallocatedTransitVehicleModels = []
    this.unallocatedTerminusModels = []
    this.unallocatedElevatorCarModels = []
    this.unallocatedHabitatModels = []
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
      // // For vehicles making a stop at a terminus...
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
        refFrame.wedges[wedgeIndex]['virtualTransitVehicles'].push(new virtualVehicle(randomizedPositionInFrameOfReference))
      }
    })

    // Putting few cars in collector lanes for testing...
    let step2 = 1.0 / (n*10/40)
    const innerTracks = [this.refFrames[2], this.refFrames[3]]
    innerTracks.forEach(refFrame => {
      for (let positionInFrameOfReference = 0, i = 0; i < n * 10 / 40; positionInFrameOfReference += step2, i++) {
        const randomizedPositionInFrameOfReference = positionInFrameOfReference + (step2 * 0.8 * Math.random())
        const wedgeIndex = Math.floor(randomizedPositionInFrameOfReference * this.numWedges) % this.numWedges
        refFrame.wedges[wedgeIndex]['virtualTransitVehicles'].push(new virtualVehicle(randomizedPositionInFrameOfReference))
      }
    })

    // Place terminuses, elevatorCars, and habitats...
    const nt = dParamWithUnits['numVirtualTerminuses'].value
    const nh = dParamWithUnits['numVirtualHabitats'].value
    const totalFacilities = nt + nh
    let step3 = 1.0 / totalFacilities
    let prevFloorS = -1
    const staticFrame = [this.refFrames[4]]
    staticFrame.forEach(refFrame => {
      for (let positionInFrameOfReference = 0, i = 0; i < totalFacilities; positionInFrameOfReference += step3, i++) {
        const wedgeIndex = Math.floor(positionInFrameOfReference * this.numWedges) % this.numWedges
        const currFloorS = Math.floor(i * nt / totalFacilities)
        if (currFloorS == prevFloorS) {
          refFrame.wedges[wedgeIndex]['virtualHabitats'].push(new virtualHabitat(positionInFrameOfReference))
        }
        else {
          refFrame.wedges[wedgeIndex]['virtualTerminuses'].push(new virtualTerminus(positionInFrameOfReference))
          refFrame.wedges[wedgeIndex]['virtualElevatorCars'].push(new virtualElevatorCar(positionInFrameOfReference))
        }
        prevFloorS = currFloorS
      }
    })
      
    function prepareACallbackFunctionForGLTFLoader(myScene, myList, scale_Factor, n) {
      return function( {scene} ) {
        const object = scene.children[0]
        object.visible = false
        object.scale.set(scale_Factor, scale_Factor, scale_Factor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          myList.push(tempModel)
        }
      } 
    }

    function prepareACallbackFunctionForFBXLoader(myScene, myList, scaleFactor, n) {
      return function( object ) {
        object.visible = false
        object.scale.set(scaleFactor, scaleFactor, scaleFactor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          myList.push(tempModel)
        }
      } 
    }

    const addTransitVehicles = prepareACallbackFunctionForGLTFLoader(this.scene, this.unallocatedTransitVehicleModels, 0.0254 * 1.25, dParamWithUnits['numTransitVehicleModels'].value)
    const addTerminuses = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedTerminusModels, 1.25, dParamWithUnits['numTerminusModels'].value)
    const addElevatorCars = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedElevatorCarModels, 1.04, dParamWithUnits['numElevatorCarModels'].value)
    const addHabitats = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedHabitatModels, 3, dParamWithUnits['numHabitatModels'].value)
    const progressFunction = function ( xhr ) {
      console.log( ( xhr.loaded / xhr.total * 100 ) + '% model loaded' );
    }
    const errorFunction = function ( error ) {
      console.log( 'An error happened', error );
    }

    const gltfloader = new GLTFLoader()
    // Note: looks like maybe the TransitCar model was created in units of inches and then a 0.02539 scaling factor was applied
    gltfloader.load('models/TransitCar.glb', addTransitVehicles, progressFunction, errorFunction )

    const fbxloader = new FBXLoader()//
    fbxloader.load('models/TransitTerminus.fbx', addTerminuses, progressFunction, errorFunction )
    fbxloader.load('models/Elevator.fbx', addHabitats, progressFunction, errorFunction )
    fbxloader.load('models/Elevator.fbx', addElevatorCars, progressFunction, errorFunction )

    // This calculator computes the position of the collector lane reference frames as a function of time
    this.refFrameCalculator = new tram.vehicleReferenceFrameTrackPositionCalculator(dParamWithUnits, mainRingCurve, crv)

    this.transitVehicleRelativePosition_r = []
    this.transitVehicleRelativePosition_y = []
    this.terminusRelativePosition_r = 0
    this.terminusRelativePosition_y = 0
    this.update(dParamWithUnits, trackOffsetsList, crv, ecv, radiusOfPlanet)
  }

  update(dParamWithUnits, trackOffsetsList, crv, ecv, radiusOfPlanet) {
    this.refFrames[0].v = dParamWithUnits['transitVehicleCruisingSpeed'].value
    this.refFrames[1].v = dParamWithUnits['transitVehicleCruisingSpeed'].value
    for (let trackIndex = 0; trackIndex<trackOffsetsList.length; trackIndex++) {
      const outwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + trackOffsetsList[trackIndex][0]
      const upwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['terminusUpwardOffset'].value + trackOffsetsList[trackIndex][1] + dParamWithUnits['transitVehicleUpwardOffset'].value  // Last is half of the track height
      this.transitVehicleRelativePosition_r[trackIndex] = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
      this.transitVehicleRelativePosition_y[trackIndex]  = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    }
    this.showTransitVehicles = dParamWithUnits['showTransitVehicles'].value
    this.animateTransitVehicles = dParamWithUnits['animateTransitVehicles'].value ? 1 : 0

    const terminusOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['terminusOutwardOffset'].value
    const terminusUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['terminusUpwardOffset'].value
    this.terminusRelativePosition_r = tram.offset_r(terminusOutwardOffset, terminusUpwardOffset, crv.currentEquivalentLatitude)
    this.terminusRelativePosition_y = tram.offset_y(terminusOutwardOffset, terminusUpwardOffset, crv.currentEquivalentLatitude)

    this.cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorCableOutwardOffset'].value
    this.elevatorCableForwardOffset = dParamWithUnits['elevatorCableForwardOffset'].value
    this.animateElevatorCars = dParamWithUnits['animateElevatorCars'].value ? 1 : 0

    const habitatOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['habitatOutwardOffset'].value
    const habitatUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['habitatUpwardOffset'].value
    this.habitatRelativePosition_r = tram.offset_r(habitatOutwardOffset, habitatUpwardOffset, crv.currentEquivalentLatitude)
    this.habitatRelativePosition_y = tram.offset_y(habitatOutwardOffset, habitatUpwardOffset, crv.currentEquivalentLatitude)

    this.crv = crv
    this.ecv = ecv

    this.radiusOfPlanet = radiusOfPlanet
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
    const cameraRange = 30000 // +/- 50km
    const distanceToCenterOfEarth = cameraPosition.length()
    const cameraAltitude = distanceToCenterOfEarth - this.radiusOfPlanet
    let cameraTrackPosition

    if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
      const localPoint = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone()).normalize()
      // Then compute it's track position value (as a value from 0.0 to 1.0)...
      cameraTrackPosition = (Math.atan2(localPoint.z, localPoint.x) / (2*Math.PI) + 1) % 1
    }
    else {
      cameraTrackPosition = 0
    }
    // Then figure out starting and finishing wedges for that position
    const cameraRangeDelta = cameraRange / (2 * Math.PI * this.crv.mainRingRadius)
    const cameraRangeStart = cameraTrackPosition - cameraRangeDelta
    const cameraRangeFinish = cameraTrackPosition + cameraRangeDelta

    let transitVehicleShortageCount
    let terminusShortageCount
    let elevatorCarShortageCount
    let habitatShortageCount
    const assignModelList = []
    const removeModelList = []

    // First we determine which wedges in each of the reference frames are entering and leaving the proximity of the camera
    this.refFrames.forEach(refFrame => {
      const clearFlagsList = []
      if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
        // Subtract the current rotationalPosition of the reference frame from the cameraRangeStart and cameraRangeFinish values
        const cameraRangeStartForFrame = (cameraRangeStart - refFrame.p + 1 ) % 1
        const cameraRangeFinishForFrame = (cameraRangeFinish - refFrame.p + 1 ) % 1
        refFrame.startWedgeIndex = Math.floor(cameraRangeStartForFrame * this.numWedges) % this.numWedges
        refFrame.finishWedgeIndex = Math.floor(cameraRangeFinishForFrame * this.numWedges) % this.numWedges
      }
      else {
        refFrame.startWedgeIndex = -1
        refFrame.finishWedgeIndex = -1
      }

      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          this.actionFlags[wedgeIndex] = 1
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
      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          if (this.actionFlags[wedgeIndex]==1) {
              // Wedge wasn't visible before and it became visible, assign it the assignModel list
              assignModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
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
        this.actionFlags[wedgeIndex] = 0  // Clear the action flags to redy them for future reuse
      })
  
    })

    // Free models assigned to virtualVehicles that are in wedges that have recently left the region near the camera
    removeModelList.forEach(entry => {
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualTransitVehicles.forEach(object => {
        if (object.model) {
          object.model.visible = false
          this.unallocatedTransitVehicleModels.push(object.model)
          object.model = null
        }
      })
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualTerminuses.forEach(object => {
        if (object.model) {
          object.model.visible = false
          this.unallocatedTerminusModels.push(object.model)
          object.model = null
        }
      })
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualElevatorCars.forEach(object => {
        if (object.model) {
          object.model.visible = false
          this.unallocatedElevatorCarModels.push(object.model)
          object.model = null
        }
      })
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualHabitats.forEach(object => {
        if (object.model) {
          object.model.visible = false
          this.unallocatedHabitatModels.push(object.model)
          object.model = null
        }
      })
    })

    // Assign models to virtualVehicles that have just entered the region near the camera
    let ranOutOfVehicleModels = 0
    let ranOutOfTerminusModels = 0
    let ranOutOfElevatorCarModels = 0
    let ranOutOfHabitatModels = 0

    assignModelList.forEach(entry => {
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualTransitVehicles.forEach(object => {
        if (this.unallocatedTransitVehicleModels.length>0) {
          object.model = this.unallocatedTransitVehicleModels.pop()
          object.model.visible = true
        }
        else {
          ranOutOfVehicleModels++
        }
      })
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualTerminuses.forEach(virtualTerminus => {
        if (this.unallocatedTerminusModels.length>0) {
          virtualTerminus.model = this.unallocatedTerminusModels.pop()
          virtualTerminus.model.visible = true
        }
        else {
          ranOutOfTerminusModels++
        }
      })
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualElevatorCars.forEach(object => {
        if (this.unallocatedElevatorCarModels.length>0) {
          object.model = this.unallocatedElevatorCarModels.pop()
          object.model.visible = true
        }
        else {
          ranOutOfElevatorCarModels++
        }
      })
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualHabitats.forEach(object => {
        if (this.unallocatedHabitatModels.length>0) {
          object.model = this.unallocatedHabitatModels.pop()
          object.model.visible = true
        }
        else {
          ranOutOfHabitatModels++
        }
      })
    })
    if (ranOutOfVehicleModels>0) {
      console.log('ranOutOfVehicleModels ' + ranOutOfVehicleModels)
    }
    if (ranOutOfTerminusModels>0) {
      console.log('ranOutOfTerminusModels ' + ranOutOfTerminusModels)
    }
    if (ranOutOfElevatorCarModels>0) {
      console.log('ranOutOfElevatorCarModels ' + ranOutOfElevatorCarModels)
    }
    if (ranOutOfHabitatModels>0) {
      console.log('ranOutOfHabitatModels ' + ranOutOfHabitatModels)
    }

    // Now adjust the models position and rotation in all of the active wedges
    transitVehicleShortageCount = 0
    terminusShortageCount = 0
    elevatorCarShortageCount = 0
    habitatShortageCount = 0

    // All elevators are will be at the same height for now...
    const elevatorAltitude = tram.getElevatorCarAltitude(dParamWithUnits, this.crv, this.ecv, this.animateElevatorCars * timeSinceStart)

    this.refFrames.forEach(refFrame => {
      if (refFrame.startWedgeIndex!=-1) {
        const trackIndex = refFrame.trackIndex
        const r1 = this.transitVehicleRelativePosition_r[trackIndex]
        const y1 = this.transitVehicleRelativePosition_y[trackIndex]
        const r2 = this.terminusRelativePosition_r
        const y2 = this.terminusRelativePosition_y

        const elevatorCarPosition_dr = tram.offset_r(this.cableOutwardOffset, elevatorAltitude-this.crv.currentMainRingAltitude, this.crv.currentEquivalentLatitude)
        const elevatorCarPosition_dy = tram.offset_y(this.cableOutwardOffset, elevatorAltitude-this.crv.currentMainRingAltitude, this.crv.currentEquivalentLatitude)
        const elevatorCarPosition_da = this.elevatorCableForwardOffset / (2 * Math.PI * this.crv.mainRingRadius)

        const tempPointOnRingCurve = mainRingCurve.getPoint(0)
        const angle = 2 * Math.PI * 0
        // console.log('elevatorCarPosition_da new', 
        //   elevatorCarPosition_da, 
        //   this.crv.mainRingRadius+elevatorCarPosition_dr, 
        //   tempPointOnRingCurve.x,
        //   tempPointOnRingCurve.x + elevatorCarPosition_dr * Math.cos(angle))
        const elevatorCarRotZ = this.crv.currentEquivalentLatitude - Math.PI/2

        const r4 = this.habitatRelativePosition_r
        const y4 = this.habitatRelativePosition_y

        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          refFrame.wedges[wedgeIndex].virtualTransitVehicles.forEach(virtualTransitVehicle => {
            if (virtualTransitVehicle.model) {
              // Update the position and rotation of the model that is assigned to the virtualTransitVehicle
              const modelsTrackPosition = (virtualTransitVehicle.p + refFrame.p) %1 
              
              if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
                console.log("error!!!")
              }
              else {
                const pointOnRingCurve = mainRingCurve.getPoint(modelsTrackPosition)
                const angle = 2 * Math.PI * modelsTrackPosition
                virtualTransitVehicle.model.position.set(
                  pointOnRingCurve.x + r1 * Math.cos(angle),
                  pointOnRingCurve.y + y1,
                  pointOnRingCurve.z + r1 * Math.sin(angle) )
                virtualTransitVehicle.model.rotation.set(0, -angle, this.crv.currentEquivalentLatitude)
                virtualTransitVehicle.model.rotateZ(-Math.PI/2)
              }
            }
            else {
              // If we find ourselves here, then this means that there were not enough models in the pool to assign on to every virtual vehicle that needs one
              transitVehicleShortageCount++
            }
          })
          refFrame.wedges[wedgeIndex].virtualTerminuses.forEach(virtualTerminus => {
            if (virtualTerminus.model) {
              // Update the position and rotation of the model that is assigned to the virtualTerminus
              const modelsTrackPosition = (virtualTerminus.p + refFrame.p) %1 
              if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
                console.log("error!!!")
              }
              else {
                const pointOnRingCurve = mainRingCurve.getPoint(modelsTrackPosition)
                const angle = 2 * Math.PI * modelsTrackPosition
                virtualTerminus.model.position.set(
                  pointOnRingCurve.x + r2 * Math.cos(angle),
                  pointOnRingCurve.y + y2,
                  pointOnRingCurve.z + r2 * Math.sin(angle) )
                  virtualTerminus.model.rotation.set(0, -angle, this.crv.currentEquivalentLatitude)
                  virtualTerminus.model.rotateZ(-Math.PI/2)
                  virtualTerminus.model.rotateY(-Math.PI/2)
                }
            }
            else {
              // If we find ourselves here, then this means that there were not enough models in the pool to assign on to every virtual vehicle that needs one
              terminusShortageCount++
            }
          })
          refFrame.wedges[wedgeIndex].virtualElevatorCars.forEach(virtualElevatorCar => {
            if (virtualElevatorCar.model) {
              // Update the position and rotation of the model that is assigned to the virtualElevatorCar
              const modelsTrackPosition = (virtualElevatorCar.p + refFrame.p + elevatorCarPosition_da/(2*Math.PI)) %1 
              //const modelsTrackPosition = (virtualElevatorCar.p + refFrame.p) %1 
              if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
                console.log("error!!!")
              }
              else {
                const pointOnRingCurve = mainRingCurve.getPoint(modelsTrackPosition)
                const angle = 2 * Math.PI * modelsTrackPosition
                const checkPoint = new THREE.Vector3().set(
                  this.crv.mainRingRadius * Math.cos(angle),
                  this.crv.yc,
                  this.crv.mainRingRadius * Math.sin(angle))
                virtualElevatorCar.model.position.set(
                  pointOnRingCurve.x + elevatorCarPosition_dr * Math.cos(angle),
                  pointOnRingCurve.y + elevatorCarPosition_dy,
                  pointOnRingCurve.z + elevatorCarPosition_dr * Math.sin(angle) )
                  virtualElevatorCar.model.rotation.set(0, -angle, elevatorCarRotZ)
                }
            }
            else {
              // If we find ourselves here, then this means that there were not enough models in the pool to assign on to every virtual vehicle that needs one
              elevatorCarShortageCount++
            }
          })
          refFrame.wedges[wedgeIndex].virtualHabitats.forEach(virtualHabitat => {
            if (virtualHabitat.model) {
              // Update the position and rotation of the model that is assigned to the virtualHabitat
              const modelsTrackPosition = (virtualHabitat.p + refFrame.p) %1 
              if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
                console.log("error!!!")
              }
              else {
                const pointOnRingCurve = mainRingCurve.getPoint(modelsTrackPosition)
                const angle = 2 * Math.PI * modelsTrackPosition
                virtualHabitat.model.position.set(
                  pointOnRingCurve.x + r4 * Math.cos(angle),
                  pointOnRingCurve.y + y4,
                  pointOnRingCurve.z + r4 * Math.sin(angle) )
                  virtualHabitat.model.rotation.set(0, -angle, this.crv.currentEquivalentLatitude)
                  virtualHabitat.model.rotateZ(-Math.PI/2)
                  virtualHabitat.model.rotateY(Math.PI/2)
                }
            }
            else {
              // If we find ourselves here, then this means that there were not enough models in the pool to assign on to every virtual vehicle that needs one
              habitatShortageCount++
            }
          })

          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
    })

    // Debug stuff...
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