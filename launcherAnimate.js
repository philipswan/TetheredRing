import * as THREE from 'three'
import * as tram from './tram.js'
import {getSpiralParameters, getSpiralCoordinates} from './spiral.js'

export function defineAnimate () {

  return function (timeSinceStart, cameraPosition, elevatedEvacuatedTubeDeploymentAlpha) {
    // Move the virtual models of the launched vehicles along the launch trajectory

    let zoneIndex
    const assignModelList = []
    const removeModelList = []
    const updateModelList = []


    // Debug printout
    // const launcherRefFrame = this.refFrames[4]
    // launcherRefFrame.wedges.forEach((wedge, zoneIndex) => {
    //   if (zoneIndex<10) {
    //     Object.entries(wedge).forEach(([virtualObjectClassName, virtualObjectList]) => {
    //       if (virtualObjectClassName=='virtualLaunchVehicles') {
    //         virtualObjectList.forEach(launchVehicle => {
    //           console.log(zoneIndex, launchVehicle.timeLaunched, launchVehicle.model)
    //         })
    //       }
    //     })
    //   }
    // })
    //console.log("")

    if (this.animateElevatedEvacuatedTubeDeployment && (elevatedEvacuatedTubeDeploymentAlpha != this.lastElevatedEvacuatedTubeDeploymentAlpha)) {
      const originalTubeLength = this.evacuatedTubeCurve.getLength()
      // We need to create a curve that follows the original curve to some fraction "Alpha" of it's length to a point
      // "A", after which it will spiral around a point "B" that is a distance "C" to the side of point A, where C is
      // proportional to the spiral's inner diameter, "r0" plus (E-r0)(1-Alpha), where E is the spiral's outer diameter.
      
      // "alpha" is the extent to which the tube is uncoiled.
      // "alpha2" is the extent to which the coiled tube is elevated above its landing platform.
      // "neverCoiledPortion" is the portion of the tube near the base that will always remain uncoiled.
      // It is also the split between time spent levitating the coiled tube verticlly off of its platform and time spent unwinding the coil.
      const neverCoiledPortion = 0.05
      const alpha = Math.max(neverCoiledPortion, elevatedEvacuatedTubeDeploymentAlpha)
      const alpha2 = 1 - Math.min(neverCoiledPortion, elevatedEvacuatedTubeDeploymentAlpha) / neverCoiledPortion
      const r0 = 2000 // m - represents the inner radius of the coiled elevated evacuated tube
      const rInc = 0 //-50 // m - represents the distance between adjacent tubes in the coiled elevated evacuated tube
      const A = this.evacuatedTubeCurve.getPointAt(alpha)
      const tangent = this.evacuatedTubeCurve.getTangentAt(alpha)
      const biNormal = tangent.clone().cross(A.clone().normalize())
      //const B = A.clone().add(biNormal.clone().multiplyScalar(-C))
      const P0 = this.evacuatedTubeCurve.getPointAt(0)
      const P0Length = P0.length()
      // Map points along the original evacuated tube curve to a new set of roughly equaly spaced points.
      // For the uncoiled portion of the coiled evacuated tube curve, we can obtain these points from the original evacuated tube curve.
      const totalNumebrOfNewPoints = 4096
      const animatedEvacuatedTubeCurveControlPoints = []
      const coilCenterPoint = A.clone().add(biNormal.clone().multiplyScalar(-r0))
      const coilCenterPointLength = coilCenterPoint.length()
      const arcLength = originalTubeLength * (1-alpha)
      const spiralParameters = getSpiralParameters(r0, rInc, arcLength)

      for (let i = 0; i<totalNumebrOfNewPoints; i++) {
        const alphaI = i / (totalNumebrOfNewPoints - 1)
        let P
        if (alphaI <= alpha) {
          // For the uncoiled portion of the coiled evacuated tube curve, we can obtain these points from the original evacuated tube curve.
          P = this.evacuatedTubeCurve.getPointAt(alphaI)
        }
        else {
          const alphaC = (alphaI - alpha)
          const theta = alphaC * originalTubeLength / r0  // ToDo: This is inaccurate, only works for rInc = 0
          const spiralXY = getSpiralCoordinates(spiralParameters, theta);
          P = A.clone()
            .add(biNormal.clone().multiplyScalar(spiralXY.x))
            .add(tangent.clone().multiplyScalar(spiralXY.y))
        }
        const PLength = P.length()
        const scaleBy = (P0Length-3*(PLength-P0Length)*alpha2)/P0Length  // "scaleBy" is a factor that is used to lower the coiled tube to the ground
        animatedEvacuatedTubeCurveControlPoints.push(P.multiplyScalar(scaleBy))
      }

      // Update the position of the coil center marker
      const scaleBy = (P0Length-3*(coilCenterPointLength-P0Length)*alpha2)/P0Length
      this.coilCenterMarker.position.copy(coilCenterPoint.multiplyScalar(scaleBy))

      this.coiledElevatedEvacuatedTubeCurve.setPoints(animatedEvacuatedTubeCurveControlPoints)
      this.coiledElevatedEvacuatedTubeCurve.updateArcLengths()
      //this.removeOldMassDriverTubes()
      //this.generateNewMassDriverTubes()
      const totalLen = this.polyCurveForrf3.getLength()
      const eetLen = this.coiledElevatedEvacuatedTubeCurve.getLength()
      const segLen = totalLen / this.massDriverTubeSegments
      const minD = Math.max(0, (totalLen - eetLen*(1-alpha) - segLen) / totalLen)
      const maxD = Math.min(1, (totalLen - eetLen*(1-alpha) + segLen) / totalLen)
      this.updateMassDriverTubes(minD, maxD)
      this.virtualMassDriverTube.hasChanged = true
      this.lastElevatedEvacuatedTubeDeploymentAlpha = elevatedEvacuatedTubeDeploymentAlpha
    }

    // Very hacky trick to make the mass driver brackets disappear a certain distance down the track. At high speeds they temporally alias and this makes it harder to figure out what's going on.
    //this.bracketModelObject.massDriverBracketMaterial.opacity = Math.max(0, Math.min(1, 0.25 / timeSinceStart - 0.05))

    // For objects that are moving around within their reference frame, we need to check whether they are still in the correct zone and reassign them if they are not.
    const movingObjects = ['virtualLaunchVehicles', 'virtualLaunchSleds', 'virtualAdaptiveNuts']

    const debugString = ""
    this.refFrames.forEach(refFrame => {
      const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(this.slowDownPassageOfTime, refFrame.timeSinceStart)
      const curveDuration = refFrame.curve.getDuration()
      Object.entries(refFrame.placeholderEntries).forEach(([objectKey, objectValue]) => {
        if (movingObjects.includes(objectKey)) {
          const movingObject = objectKey
          const reassignList = []
          for (let zoneIndex = 0; zoneIndex < refFrame.numZones; zoneIndex++) {
            const keepList = []
            refFrame.wedges[zoneIndex][movingObject].forEach(object => {
              // Calculate where along the launcher to place the vehicle.
              const deltaT = adjustedTimeSinceStart - object.timeLaunched
              // Convert deltaT to a zoneIndex along the curveList.
              if (deltaT<=curveDuration) {
                // if ((objectKey=='virtualLaunchVehicles') && (object.timeLaunched==0.1)) {
                //   console.log(correctZoneIndex)
                // }
                const correctZoneIndex = refFrame.curve.getZoneIndex(deltaT)
                if ((correctZoneIndex>=0) && (correctZoneIndex<refFrame.numZones)) {
                  if (zoneIndex==correctZoneIndex) {
                    keepList.push(object)
                  }
                  else {
                    reassignList.push({correctZoneIndex, object})
                  }
                }
                else {
                  console.error("Error: correctZoneIndex out of range")
                  debugger
                  console.log(deltaT, refFrame.curve)
                  const correctZoneIndex2 = refFrame.curve.getZoneIndex(deltaT)
                }
              }
              else {
                // Object has travelled out of the linear range of the curve. Discard it.
                console.log("Discarding object " + movingObject)
                if (object.model) {
                  object.model.visible = false
                  object.constructor.unallocatedModels.push(object.model)
                  object.model = null
                }
                // To discard the virtual object we simply do not assign it to either keepList or reassignList 
              }
            })
            // console.log(keepList.length)
            const pntrToArray = refFrame.wedges[zoneIndex][movingObject]
            pntrToArray.splice(0, pntrToArray.length)  // Delete the entire old list of items
            refFrame.wedges[zoneIndex][movingObject] = keepList
          }

          // Reassign the rest of the sleds to the correct wedges
          reassignList.forEach(reassignedObject => {
            const zoneIndex = reassignedObject['correctZoneIndex']
            refFrame.wedges[zoneIndex][movingObject].push(reassignedObject['object'])
          })
        }
      })
    })

    // let plot = ""
    // for (let zoneIndex = 0; zoneIndex < 130; zoneIndex++) {
    //   plot += launcherRefFrame.wedges[zoneIndex]['virtualLaunchVehicles'].length
    // }
    // console.log(plot)

    // End of moving object zone reassignment

    this.refFrames.forEach((refFrame, index) => {

      // Determine a start zone and finish zone along the curve for the launcher.
      // Note that this code assumes a fairly continuous path. It can't yet handle a more loopy path that enters the camera's range sphere more than once.
      let startZoneIndex = -1
      let finishZoneIndex = -1

      refFrame.curve.superCurves.forEach((superCurve, index) => {
        const cameraPos = cameraPosition.clone()
        let zoneStartFinishDValues, zoneStartFinishDValues2
        try {
          zoneStartFinishDValues = superCurve.getStartFinishZoneIndices( cameraPos, refFrame.cameraRange )
        }
        catch (e) {
          zoneStartFinishDValues2 = superCurve.getStartFinishZoneIndices( cameraPos, refFrame.cameraRange )
        }
        const numZones = refFrame.curve.numZones[index]
        const startZone = refFrame.curve.startZone[index]
        if (zoneStartFinishDValues.length==2) {
          const szi = startZone + Math.max(0, (Math.min(numZones-1, Math.floor(zoneStartFinishDValues[0] * numZones))))
          const fzi = startZone + Math.max(0, (Math.min(numZones-1, Math.floor(zoneStartFinishDValues[1] * numZones))))
    
          // Seek the smallest zone index that is not -1
          startZoneIndex = (startZoneIndex==-1) ? szi : Math.min(startZoneIndex, szi)
          finishZoneIndex = (finishZoneIndex==-1) ? fzi : Math.max(finishZoneIndex, fzi)
        }

        // Debug visualization code...
        // if (index==0) {
        //   if (zoneStartFinishDValues.length==2) {
        //     this.wedgeMarker0.position.copy(superCurve.getPointAt(zoneStartFinishDValues[0]))
        //     this.wedgeMarker0.visible = this.showMarkers
        //     this.wedgeMarker1.position.copy(superCurve.getPointAt(zoneStartFinishDValues[1]))
        //     this.wedgeMarker1.visible = this.showMarkers
        //   }
        //   else {
        //     this.wedgeMarker0.visible = false
        //     this.wedgeMarker1.visible = false
        //   }
        // }
        // End debug visualization code

      })

      refFrame.startWedgeIndex = startZoneIndex
      refFrame.finishWedgeIndex = finishZoneIndex
      //console.log(refFrame.startWedgeIndex, refFrame.finishWedgeIndex)

      // ToDo: Why check the flags for this?
      if (this.animateLaunchVehicles || this.animateLaunchSleds || this.animateAdaptiveNuts) {
        refFrame.timeSinceStart = timeSinceStart
      }
      const clearFlagsList = []
      
      // Set bit0 of actionFlags if wedge is currently visible
      if (refFrame.startWedgeIndex!=-1) {
        for (zoneIndex = refFrame.startWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          this.actionFlags[zoneIndex] |= 1
          clearFlagsList.push(zoneIndex)
          if (zoneIndex == refFrame.finishWedgeIndex) break
        }
      }
      // Set bit1 of actionFlags if wedge was previously visible
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (zoneIndex = refFrame.prevStartWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          this.actionFlags[zoneIndex] |= 2
          clearFlagsList.push(zoneIndex)
          if (zoneIndex == refFrame.prevFinishWedgeIndex) break
        }
      }

      if (refFrame.startWedgeIndex!=-1) {
        for (zoneIndex = refFrame.startWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          if (this.actionFlags[zoneIndex]==1) {
            // Wedge wasn't visible before and it became visible, assign it the assignModel list
            assignModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex})
          }
          if (this.actionFlags[zoneIndex] & 1 == 1) {
            // Wedge is currently visible, assign it the updateModel list
            updateModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex})
          }
          if (zoneIndex == refFrame.finishWedgeIndex) break
        }
      }
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (zoneIndex = refFrame.prevStartWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          if (this.actionFlags[zoneIndex]==2) {
            // Wedge was visible before and it became invisible, add it to the removeModel list
            removeModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex})
          }
          if (zoneIndex == refFrame.prevFinishWedgeIndex) break
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

      clearFlagsList.forEach(zoneIndex => {
        this.actionFlags[zoneIndex] = 0  // Clear the action flags to ready them for future reuse
      })
    })


    // Reassign models to/from virtual models based on which objects are in range of the camera
    // Place and orient all of the active models
    if (removeModelList.length > 0) {
      // console.log(
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
      //console.log('Removing ' + removeModelList.length)
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
      //console.log('Adding ' + assignModelList.length)
    }

    // Free models that are in wedges that are no longer near the camera
    removeModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([virtualObjectClassName, virtualObjectList]) => {
        virtualObjectList.forEach(object => {
          if (object.model) {
            object.model.visible = false
            object.constructor.unallocatedModels.push(object.model)
            object.model = null
          }
        })
      })
    })

    // Assign models to virtual objects that have just entered the region near the camera
    assignModelList.forEach(entry => {
      const ranOutOfModelsInfo = {}
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([virtualObjectClassName, virtualObjectList]) => {
        if (virtualObjectList.length>0) {
          const refFrame = entry['refFrame']
          const objectClass = virtualObjectList[0].constructor
          //let count = 0
          virtualObjectList.forEach(object => {
            if (object.model) {
              object.model.visible = object.isVisible
            }
            else {
              if (objectClass.modelsAreRecyleable) {
                // Assign a model from the unallocatedModels list
                // if (virtualObjectClassName=='virtualLaunchVehicles') {
                //   console.log("")
                // }
                if (objectClass.unallocatedModels.length==1) {
                  // if (virtualObjectClassName=='virtualLaunchVehicles') {
                  //   console.log("")
                  // }
                  // If this is the last model. Duplicate it so that we don't run out.
                  const tempModel = objectClass.unallocatedModels[0].clone()
                  objectClass.unallocatedModels.push(tempModel)
                  //console.log('Duplicating model for ' + virtualObjectClassName)
                }
                if (objectClass.unallocatedModels.length>0) {
                  // if (virtualObjectClassName=='virtualMassDriverAccelerationScrews') {
                  //   console.log("")
                  // }
                  object.model = objectClass.unallocatedModels.pop()
                  object.model.visible = object.isVisible
                  this.scene.add(object.model)
                  //count++
                }
                else {
                  if (virtualObjectClassName in ranOutOfModelsInfo) {
                    ranOutOfModelsInfo[virtualObjectClassName]++
                  }
                  else {
                    ranOutOfModelsInfo[virtualObjectClassName] = 1
                  }
                }
              }
              else {
                // Create a new model
                // object.model = objectClass.createModel(refFrame, object)
                // object.model.name = virtualObjectClassName
                // object.model.visible = object.isVisible
                // this.scene.add(object.model)
                // count++
              }
            }
          })
          if (!objectClass.isDynamic && !objectClass.hasChanged) {
            // Static object so we will place and orient the model (just once) at the same time we assign it to a virtual object that has come into range of the camera
            virtualObjectList.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, refFrame)
              }
            })
          }
          //console.log('added '+count+' '+objectClass.className+' objects to '+refFrame.name)
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

    updateModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([virtualObjectClassName, virtualObjectList]) => {
        // if ((virtualObjectClassName=='virtualLaunchSleds') && (virtualObjectList.length>0)) {
        //   console.log("")
        // }
        if (virtualObjectList.length>0) {
          const classIsDynamic = virtualObjectList[0].constructor.isDynamic
          const classHasChanged = virtualObjectList[0].constructor.hasChanged
          if (classIsDynamic || classHasChanged) {
            // Call the placement method for each active instance (unless the model class is static and unchanged)
            virtualObjectList.forEach(object => {
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
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   this.unallocatedMassDriverModels.length,
      //   this.unallocatedLaunchVehicleModels.length,
      // )
    }

    // Clear all of the "hasChanged" flags
    this.objectClasses.forEach(objectClass => {
      objectClass.hasChanged = false
    })

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

export function defineRemoveOldMassDriverTubes() {
  return function () {
    if (this.virtualMassDriverTube.numObjects > 0) {
      // Remove old virtual mass driver tubes
      this.removeOldVirtualObjects(this.scene, this.virtualMassDriverTube.refFrames, 'virtualMassDriverTubes')
      // Destroy all of the massdriver tube models since these can't be reused when we change the shape of the tube
      this.virtualMassDriverTube.unallocatedModels.forEach(model => {
        this.scene.remove(model)
        model.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose()
          }
        })
        model = null
      })
      this.virtualMassDriverTube.unallocatedModels.splice(0, this.virtualMassDriverTube.unallocatedModels.length)
    }
  }
}

export function defineUpdateMassDriverTubes() {
  return function (minD = 0, maxD = 1) {
    if (this.virtualMassDriverTube.numObjects > 0) {
      // Find and iterate through all of the virtual mass driver tubes
      const objectName = 'virtualMassDriverTubes'
      const refFrames = this.virtualMassDriverTube.refFrames
      refFrames.forEach(refFrame => {
        for (let zoneIndex = 0; zoneIndex < refFrame.wedges.length; zoneIndex++) {
          if (objectName in refFrame.wedges[zoneIndex]) {
            const wedgeList = refFrame.wedges[zoneIndex][objectName]
            wedgeList.forEach(vobj => {
              // Check whether the virtual object's d value is within the provided range
              if (vobj.d>=minD && vobj.d<=maxD) {
                const index = vobj.index
                if (vobj.model) this.scene.remove(vobj.model)
                // Create a new model that is fitted to new the shape of the curve
                vobj.model = this.tubeModelObject.createModel(refFrame.curve, index)
                this.scene.add(vobj.model)
              }
            })
          }
        }
      })
    }
    //console.timeEnd('UpdateMassDriverTubes')
  }
}


export function defineGenerateNewMassDriverTubes() {
  return function () {
    if (this.virtualMassDriverTube.numObjects>0) {
      this.virtualMassDriverTube.addNewVirtualObjects(this.virtualMassDriverTube.refFrames, ...this.virtualMassDriverTube.addObjectsParameters)
    }
  }
}
