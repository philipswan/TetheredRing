import {
  BufferGeometry,
  Vector3
} from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
import * as tram from './tram.js'

import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/GLTFLoader.js'

class referenceFrame {
  constructor(numWedges, v, d, trackIndex) {
    this.p = 0
    this.v = v
    this.d = d
    this.trackIndex = trackIndex
    this.startWedgeIndex = -1
    this.finishWedgeIndex = -1
    this.prevStartWedgeIndex = -1
    this.prevFinishWedgeIndex = -1
    // In each frame-of-reference, create an array of wedges. In each wedge, create an empty array for storing virtual transit vehicles
    const makePlaceHolderEntry = () => ({'virtualTransitVehicles': [] })
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
    this.v = v
    // level
    // innerOuterTrackFactor
    // distanceAroundTrack
    // speed
    // accelleration
    // position
    // modelIndex
  }
}

export class transitVehicleSystem {

  // A transit vehicle system comprises four moving frames of refernence and each is divided into "numWedges" sections,
  // called "wedges". A large number of "virtual" transit vehicles are created and each is placed inside one wedge 
  // within one of the frames of reference. The frames-of-reference rotate. When a wedge enters the proximity of the camera,
  // the virtual vehicles in that wedge are allocated models of transit vehicles from a pool. Allocated models will be
  // made visible, positioned in the scene, and rendered. When a wedge leaves the proximity of the camera, its models
  // are retured to the pool. Virtual vehicles will also respond to timer events. These events will cause them to 
  // occassionally hop between two frames of reference.

  constructor(scene, dParamWithUnits, trackOffsetsList) {

    this.scene = scene
    this.unallocatedTransitVehicleModels = []
    this.numWedges = 1024
    this.trackOffsetsList = trackOffsetsList

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
      new referenceFrame(this.numWedges, v, 1, 0),
      new referenceFrame(this.numWedges, v, -1, 2)
    ]

    this.eventList = []

    const step = 1.0 / (dParamWithUnits['numVirtualTransitVehicles'].value/2)
    // We will only place virtual vehicles on the express lanes initially. Timer events will later move vehicles
    // over to the collector lanes
    const firstTwo = [this.refFrames[0], this.refFrames[1]]
    firstTwo.forEach(refFrame => {
      for (let positionInFrameOfReference = 0, i = 0; i < dParamWithUnits['numVirtualTransitVehicles'].value / 2; positionInFrameOfReference += step, i++) {
        const randomizedPositionInFrameOfReference = positionInFrameOfReference + (step * 0.8 * Math.random())
        const wedgeIndex = Math.floor(randomizedPositionInFrameOfReference * this.numWedges) % this.numWedges
        refFrame.wedges[wedgeIndex]['virtualTransitVehicles'].push(new virtualVehicle(randomizedPositionInFrameOfReference))
      }
    })
  
    function prepareACallbackFunctionForLoader(myScene, myList) {
      return function( {scene} ) {
        const object = scene.children[0]
        object.visible = false
        //console.log(object.scale)
        //object.scale.set(6, 6, .3)
        for (let i=0; i<dParamWithUnits['numTransitVehicleModels'].value; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          myList.push(tempModel)
        }
      } 
    }
    const addTransitVehicles = prepareACallbackFunctionForLoader(this.scene, this.unallocatedTransitVehicleModels)

    const loader = new GLTFLoader()
    loader.load('models/TransitCar.glb',  // Note: looks like maybe this model was created in units of inches and then a 0.02539 scaling factor was applied
      // pass in the callback function that was created within a closure
      addTransitVehicles,
      // called when loading is in progresses
      function ( xhr ) {
        console.log( ( xhr.loaded / xhr.total * 100 ) + '% transit car loaded' );
      },
      // called when loading has errors
      function ( error ) {
        console.log( 'An error happened', error );
      }
    )
  }

  update(dParamWithUnits) {
    this.refFrames[0].v = dParamWithUnits['transitVehicleCruisingSpeed'].value
    this.refFrames[1].v = dParamWithUnits['transitVehicleCruisingSpeed'].value
  }

  animate(timeSinceStart, crv, tetheredRingRefCoordSys, cameraPosition, radiusOfPlanet, ringCurve, dParamWithUnits) {

    let wedgeIndex

    while ((this.eventList.length>0) && (this.eventList[0].triggerTime < timeSinceStart)) {
      // Process timer events - these events will mainly cause various virtualVehicles to change from one frame of reference to another

      this.eventList.shift()
    }

    // Update the frames of reference. Frames of reference include: 
    //   1) the travelling at full speed frame, 
    //   2) the making a stop frame, and
    //   3) the making a "delay manuever" frame

    const timePerCompleteRevolution = 2 * Math.PI * crv.mainRingRadius / this.refFrames[0].v

    this.refFrames[0].p = (timeSinceStart / timePerCompleteRevolution) % 1
    this.refFrames[1].p = 1 - this.refFrames[0].p
    // TBD - need a more sophisticated motion profile... 
    this.refFrames[2].p = (timeSinceStart / (timePerCompleteRevolution*4)) % 1
    this.refFrames[3].p = 1 - this.refFrames[2].p

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
    const cameraAltitude = distanceToCenterOfEarth - radiusOfPlanet
    let cameraTrackPosition

    // Hack - extra *10 was added in two places is to help with debugging...
    if (cameraAltitude<crv.currentMainRingAltitude+cameraRange*10) {
      const localPoint = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone()).normalize()
      // Then compute it's track position value (as a value from 0.0 to 1.0)...
      cameraTrackPosition = (Math.atan2(localPoint.z, localPoint.x) / (2*Math.PI) + 1) % 1
    }
    else {
      cameraTrackPosition = 0
    }
    // Then figure out starting and finishing wedges for that position
    const cameraRangeDelta = cameraRange / (2 * Math.PI * crv.mainRingRadius)
    const cameraRangeStart = cameraTrackPosition - cameraRangeDelta
    const cameraRangeFinish = cameraTrackPosition + cameraRangeDelta

    let transitVehicleShortageCount
    const assignModelList = []
    const removeModelList = []

    // First we determine which wedges in each of the reference frames are entering and leaving the proximity of the camera
    this.refFrames.forEach(refFrame => {
      const clearFlagsList = []
      if (cameraAltitude<crv.currentMainRingAltitude+cameraRange*10) {
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
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualTransitVehicles.forEach(virtualTransitVehicle => {
        if (virtualTransitVehicle.model) {
          virtualTransitVehicle.model.visible = false
          this.unallocatedTransitVehicleModels.push(virtualTransitVehicle.model)
          virtualTransitVehicle.model = null
        }
      })
    })

    // Assign models to virtualVehicles that have just entered the region near the camera
    let ranOutOfModels = 0
    assignModelList.forEach(entry => {
      entry['refFrame'].wedges[entry['wedgeIndex']].virtualTransitVehicles.forEach(virtualTransitVehicle => {
        if (this.unallocatedTransitVehicleModels.length>0) {
          virtualTransitVehicle.model = this.unallocatedTransitVehicleModels.pop()
          virtualTransitVehicle.model.visible = true
        }
        else {
          ranOutOfModels++
        }
      })
    })
    if (ranOutOfModels>0) {
      console.log('ranOutOfModels '+ranOutOfModels)
    }

    // Now adjust the models position and rotation in all of the active wedges
    transitVehicleShortageCount = 0


    this.refFrames.forEach(refFrame => {
      const trackIndex = refFrame.trackIndex
      const outwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + this.trackOffsetsList[trackIndex][0] * dParamWithUnits['transitTubeTubeRadius'].value
      const upwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + this.trackOffsetsList[trackIndex][1] * dParamWithUnits['transitTubeTubeRadius'].value - dParamWithUnits['transitVehicleRadius'].value - 0.35  // Last is half of the track height
      const transitVehicleRelativePosition_r = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
      const transitVehicleRelativePosition_y = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          refFrame.wedges[wedgeIndex].virtualTransitVehicles.forEach(virtualTransitVehicle => {
            if (virtualTransitVehicle.model) {
              // Update the position and rotation of the model that is assigned to the virtualTransitVehicle
              const modelsTrackPosition = (virtualTransitVehicle.p + refFrame.p) %1 
              if (modelsTrackPosition==='undefined' || (modelsTrackPosition<0) || (modelsTrackPosition>1)) {
                console.log("error!!!")
              }
              else {
                const pointOnRingCurve = ringCurve.getPointAt(modelsTrackPosition)
                const angle = 2 * Math.PI * modelsTrackPosition
                virtualTransitVehicle.model.position.set(
                  pointOnRingCurve.x + transitVehicleRelativePosition_r * Math.cos(angle),
                  pointOnRingCurve.y + transitVehicleRelativePosition_y,
                  pointOnRingCurve.z + transitVehicleRelativePosition_r * Math.sin(angle) )
                virtualTransitVehicle.model.rotation.set(0, -angle, crv.currentEquivalentLatitude)
                virtualTransitVehicle.model.rotateZ(-Math.PI/2)
              }
            }
            else {
              // If we find ourselves here, then this means that there were not enough models in the pool to assign on to every virtual vehicle that needs one
              transitVehicleShortageCount++
            }
          })
          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
    })
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