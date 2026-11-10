import {Vector3} from 'three'

// Register camera targets here. Tracking, shot-anchor menus and JSON validation
// all derive their supported types from this registry. Custom targets supply a
// frameAt(context, anchor, simTime) provider in world coordinates; singleton
// targets need no identity fields or candidate enumerator.
export const TRACKED_OBJECTS = {
  launchVehicle: {label: 'Launch vehicle', system: 'launch', className: 'virtualLaunchVehicles', sourceFrame: 'world', anchorGroup: 'launch', anchorFields: ['launchIndex']},
  adaptiveNut: {label: 'Adaptive nut', system: 'launch', className: 'virtualAdaptiveNuts', sourceFrame: 'world', anchorGroup: 'launch', anchorFields: ['launchIndex']},
  launchSled: {label: 'Launch sled', system: 'launch', className: 'virtualLaunchSleds', sourceFrame: 'world', anchorGroup: 'launch', anchorFields: ['launchIndex']},
  transitVehicle: {label: 'Transit vehicle', system: 'transit', className: 'virtualTransitVehicles', sourceFrame: 'ring', anchorFields: ['lane', 'p']},
  elevatorCar: {label: 'Elevator car', system: 'transit', className: 'virtualElevatorCars', sourceFrame: 'ring', anchorFields: ['p']},
  coilCenterMarker: {label: 'Launcher coil centre', anchorFields: ['markerIndex'],
    anchors: context => coilMarkers(context).map((_, markerIndex) => ({type: 'coilCenterMarker', markerIndex, orient: 'follow'})),
    frameAt: (context, anchor) => {
      const marker = coilMarkers(context)[anchor.markerIndex]
      if (!marker) return null
      marker.updateWorldMatrix(true, false)
      return {position: marker.getWorldPosition(new Vector3()),
        forward: new Vector3(0, 1, 0).transformDirection(marker.matrixWorld),
        upward: new Vector3(0, 0, 1).transformDirection(marker.matrixWorld)}
    }},
  spaceport: {label: 'Spaceport', anchorFields: [],
    liveTime: context => context.simTime ?? context.launchSystem?.movingObjectClass?.('virtualLaunchVehicles')?.refFrames?.[0]?.timeSinceStart ?? 0,
    frameAt: (context, anchor, simTime) => {
      const launch = context.launchSystem, station = launch?.spaceportStation
      const vehicle = launch?.movingObjectClass?.('virtualLaunchVehicles')
      if (!station || !vehicle) return null
      const time = vehicle.adjustedTime(launch.animationTimeAt?.(simTime) ?? simTime) - launch.spaceportReleaseTime
      return worldFrame(station.frameAt(time), station.root.parent)
    }},
}

function coilMarkers(context) {
  const markers = []
  context.scene?.traverse(node => { if (node.name === 'coilCenterMarker') markers.push(node) })
  return markers
}

function worldFrame(frame, parent) {
  if (!frame) return null
  const result = {position: frame.position.clone(), forward: frame.forward.clone(), upward: frame.upward.clone()}
  if (parent) {
    parent.updateWorldMatrix(true, false)
    result.position.applyMatrix4(parent.matrixWorld)
    result.forward.transformDirection(parent.matrixWorld)
    result.upward.transformDirection(parent.matrixWorld)
  }
  return result
}
