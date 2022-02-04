import {
	BufferGeometry,
	Vector3
} from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
import * as tram from './tram.js'

class virtualVehicle (theta, v) {
    // The virtual vehicle has a position around the ring, a transitTubeLevel, and an innerOuterTrackFactor
    // A 0 indicates the lower level, and a 1 indicates the upper level
    // A 0 indicates the inner track and a 1 indicates the outer track. Values between 0 and 1 indicate that the vehicle is changing tracks.
    // Distance around the track is a value from 0 to 2*PI
    level
    innerOuterTrackFactor
    distanceAroundTrack
    speed
    accelleration
    position
    modelIndex
}

class virtualTranistVehicles {

    constructor() {
        // Creates a pool of transit vehicle models. Some these will be assigned to "virtual vehicles" that are within range of the camera.
        // The rest will be made invisible
        const v = dParamWithUnits['transitVehicleCruisingSpeed'].value
        const step = 1.0/dParamWithUnits['numTransitVehicles'].value
        for (let theta = 0, i = 0; i<dParamWithUnits['numTransitVehicles'].value; theta+=step, i++) {
            virtualTransitVehicles.push(new virtualVehicle(theta, v))
            virtualTransitVehicles.push(new virtualVehicle(theta, -v))
        }
    }

    animate(timeSinceStart) {
        
        do {
            if (eventList[0].triggerTime < timeSinceStart) {
                // Process events

                eventList.shift()
            }
            else {
                break
            }
        } while(true)

        // There are time window based lists to indicate which vehicles are due to start manuevering
        // Walk these lists and add any registered vehicles to the list of vehicles executing a manuever.



        // By default, all of the vehicles that are cruising at steady state will advance by the
        // same amount. This is taken care of by incrementing a single constant. Only those vehicles that
        // are executing a manuever (such as stoppoing at a terinus) need to be processed individually

        // Update its position
        maneveringVehicles.forEach(vehicle => {

        })

        // Determine if it is visible based on distance from the camera

        // If it was visible before and it became invisible, add it to the removeModel list

        // If it wasn't visible before and it became visible, assign it the assignModel list

        // If it is visible, assign it to the updatePosition list 

        removeModel.forEach(vehicle =>{
            
        })
        removeModel.splice(0, removeModel.length)

        assignModel.forEach(vehicle =>{

        })
        assignModel.splice(0, assignModel.length)

        updatePosition.forEach(vehicle =>{

        })
        updatePosition.splice(0, updatePosition.length)
    }

}