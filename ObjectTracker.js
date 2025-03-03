export class ObjectTracker {

  constructor() {

    this.pressedHotkeyToTrackableObject = new Map ([
      // The numbers below are the ASCII codes for the hotkeys associated with vatious different types of objects
      [48, 'launchVehicle'], /*0*/
      [49, 'adaptiveNut'], /*1*/
      [50, 'launchSled'], /*2*/
      [51, 'transitVehicle'], /*3*/
      [52, 'elevatorCar'], /*4*/
      [53, 'coilCenterMarker'] /*5*/
    ])

    // Assuming that the array for values will be created in the same order as the array for keys...
    this.hotkeyLookupTable = Array.from(this.pressedHotkeyToTrackableObject.keys())
    this.objectTypeLookupTable = Array.from(this.pressedHotkeyToTrackableObject.values())

    this.closestTrackedObject = []
    this.closestTrackedObject.length = this.pressedHotkeyToTrackableObject.size
    this.closestTrackedObject.fill(null, 0, this.closestTrackedObject.length)

    this.trackingPoint = null    // This is the location of the object which was under the sprite when user last pressed the 'P' key  
    this.lastTrackingPoint = null
    this.trackingFrame = null
    this.lastTrackingFrame = null
  
  }

  convertHotkeyToObjectIndex(key) {
    return this.hotkeyLookupTable.indexOf(key)
  }

  convertHotkeyToObjectType(key) {
    return this.pressedHotkeyToTrackableObject.get(key)
  }

  convertObjectTypeToIndex(objectType) {
    return this.objectTypeLookupTable.indexOf(objectType)
  }

  findNearestObject(dParamWithUnits, scene, objectType, nearestToPosition, tetheredRingRefCoordSys, launchSystemObject, transitSystemObject, trackingPointMarkerMesh, tweeningTime) {

    const objectIndex = this.convertObjectTypeToIndex(objectType)
    let systemObject
    let virtualObjectName
    let isInReferenceFrame = false
    
    switch (objectType) {
      case 'launchVehicle':
        systemObject = launchSystemObject
        virtualObjectName = 'virtualLaunchVehicles'
        isInReferenceFrame = true
        break
      case 'adaptiveNut':
        systemObject = launchSystemObject
        virtualObjectName = 'virtualAdaptiveNuts'
        isInReferenceFrame = true
        break
      case 'launchSled':
        systemObject = launchSystemObject
        virtualObjectName = 'virtualLaunchSleds'
        isInReferenceFrame = true
        break
      case 'transitVehicle':
        systemObject = transitSystemObject
        virtualObjectName = 'virtualTransitVehicles'
        isInReferenceFrame = true
        break
      case 'elevatorCar':
        systemObject = transitSystemObject
        virtualObjectName = 'virtualElevatorCars'
        isInReferenceFrame = true
        break
      case 'coilCenterMarker':
        systemObject = launchSystemObject
        virtualObjectName = 'launchSystemObject'
        isInReferenceFrame - false
        break
    }

    let closestSoFar = -1
    this.closestTrackedObject[objectIndex] = null
    if (isInReferenceFrame) {
      systemObject.refFrames.forEach(refFrame => {
        refFrame.wedges.forEach(wedge => {
          Object.entries(wedge).forEach(([objectKey, objectValue]) => {
            if (objectKey==virtualObjectName) {
              objectValue.forEach(trackableObject => {
                let tmpPosition = trackableObject.getFuturePosition(refFrame, 0)
                if ((objectType=='transitVehicle') || (objectType=='elevatorCar')) {
                  tmpPosition = tetheredRingRefCoordSys.localToWorld(tmpPosition)
                }
                if ((tmpPosition.x!=="NaN") && (tmpPosition.y!=="NaN") && (tmpPosition.z!=="NaN")) {
                  const distanceAway = nearestToPosition.distanceTo(tmpPosition)
                  if ((closestSoFar==-1) || (distanceAway<closestSoFar)) {
                    this.closestTrackedObject[objectIndex] = {trackableObject, refFrame}
                    closestSoFar = distanceAway
                  }
                }
              })
            }
          })
        })
      })
    }
    else {
      scene.traverse(child => {
        if (child.name==='coilCenterMarker') {
          const tmpLocalPosition = child.position.clone()
          const tmpPosition = tetheredRingRefCoordSys.localToWorld(tmpLocalPosition)
          console.log(tmpLocalPosition, tmpPosition)
          if ((tmpPosition.x!=="NaN") && (tmpPosition.y!=="NaN") && (tmpPosition.z!=="NaN")) {
            const distanceAway = nearestToPosition.distanceTo(tmpPosition)
            if ((closestSoFar==-1) || (distanceAway<closestSoFar)) {
              this.closestTrackedObject[objectIndex] = child
              closestSoFar = distanceAway
            }
          }
        }
      })
    }

    if (this.closestTrackedObject[objectIndex]!==null) {
      // If the object has a getFuturePosition method, then call that, else just use the object's position
      let rawPoint
      if (('trackableObject' in this.closestTrackedObject[objectIndex]) && 
          ('getFuturePosition' in this.closestTrackedObject[objectIndex].trackableObject) && 
          (typeof this.closestTrackedObject[objectIndex].trackableObject.getFuturePosition === 'function')) {
        rawPoint = this.closestTrackedObject[objectIndex].trackableObject.getFuturePosition(this.closestTrackedObject[objectIndex].refFrame, tweeningTime/1000)
      }
      else {
        rawPoint = this.closestTrackedObject[objectIndex].position
      }
      if ((objectType=='transitVehicle') || (objectType=='elevatorCar')) {
        this.trackingPoint = tetheredRingRefCoordSys.localToWorld(rawPoint.clone())
      }
      else {
        this.trackingPoint = rawPoint
      }
      // We can only track one object at a time, so stop tracking the other objects
      this.pressedHotkeyToTrackableObject.forEach((tableObjectType, tableHotkey) => {
        if (tableObjectType!==objectType) {
          this.closestTrackedObject[this.convertHotkeyToObjectIndex(tableHotkey)] = null
        }
      })
      trackingPointMarkerMesh.position.copy(this.trackingPoint)
      const trackingPointDistanceToCamera = trackingPointMarkerMesh.position.clone().sub(nearestToPosition).length()
      trackingPointMarkerMesh.scale.set(trackingPointDistanceToCamera/64, trackingPointDistanceToCamera/64, trackingPointDistanceToCamera/64)
      trackingPointMarkerMesh.visible = dParamWithUnits['showTrackingMarkers'].value
    }

  }


}