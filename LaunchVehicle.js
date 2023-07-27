import * as THREE from 'three'

export class virtualLaunchVehicle {

    constructor(timeLaunched, unallocatedModelsArray) {
        // The virtual vehicle has a position along the launch trajectory curve.
        // 0 represents the beginning of the mass driver, 1 represents 't==durationOfLaunchTrajectory'
        this.timeLaunched = timeLaunched
        this.unallocatedModels = unallocatedModelsArray
    }
    
    // The following properties are common to all virtual vehicles...
    static launchTrajectoryCurve
    static durationOfLaunchTrajectory
    //static launchVehicleRelativePosition_r = []
    //static launchVehicleRelativePosition_y = []
    static currentEquivalentLatitude
    static isVisible
    static isDynamic
    static hasChanged
    
    static update(dParamWithUnits, launchTrajectoryCurve, massDriverSuperCurve, launcherMassDriverLength, durationOfLaunchTrajectory, timeWithinMassDriver, curveUpTime, timeWithinEvacuatedTube) {
        virtualLaunchVehicle.launchTrajectoryCurve = launchTrajectoryCurve
        virtualLaunchVehicle.massDriverSuperCurve = massDriverSuperCurve
        virtualLaunchVehicle.launcherMassDriverLength = launcherMassDriverLength
    
        virtualLaunchVehicle.durationOfLaunchTrajectory = durationOfLaunchTrajectory
        virtualLaunchVehicle.timeInsideLaunchSystem = timeWithinMassDriver + curveUpTime + timeWithinEvacuatedTube
        //const outwardOffset = dParamWithUnits['launcherOutwardOffset'].value
        //const upwardOffset = dParamWithUnits['launcherUpwardOffset'].value
        //virtualLaunchVehicle.launchVehicleRelativePosition_r = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        //virtualLaunchVehicle.launchVehicleRelativePosition_y  = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        //virtualLaunchVehicle.currentEquivalentLatitude = crv.currentEquivalentLatitude
        virtualLaunchVehicle.sidewaysOffset = dParamWithUnits['launchVehicleSidewaysOffset'].value
        virtualLaunchVehicle.upwardsOffset = dParamWithUnits['launchVehicleUpwardsOffset'].value
        virtualLaunchVehicle.bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
        virtualLaunchVehicle.isVisible = dParamWithUnits['showLaunchVehicles'].value
        virtualLaunchVehicle.showLaunchVehiclePointLight = dParamWithUnits['showLaunchVehiclePointLight'].value
        virtualLaunchVehicle.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
        virtualLaunchVehicle.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
        virtualLaunchVehicle.launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
        virtualLaunchVehicle.isDynamic =  true
        virtualLaunchVehicle.hasChanged = true
        //virtualLaunchVehicle.ringSouthernMostPosition = ringSouthernMostPosition
    }
    
    placeAndOrientModel(om, refFrame) {
        const deltaT = refFrame.timeSinceStart * virtualLaunchVehicle.slowDownPassageOfTime - this.timeLaunched
        const acceleration = virtualLaunchVehicle.launcherMassDriverForwardAcceleration
        const initialVelocity = virtualLaunchVehicle.launcherMassDriverInitialVelocity
        const vehicleBackDistance = virtualLaunchVehicle.massDriverSuperCurve.tTod(deltaT, initialVelocity, acceleration)
        const bodyLength = virtualLaunchVehicle.bodyLength
        const d = (vehicleBackDistance + bodyLength/2) / virtualLaunchVehicle.launcherMassDriverLength
        const pointOnMassDriverCurve = virtualLaunchVehicle.massDriverSuperCurve.getPointAt(d)
        const forward = virtualLaunchVehicle.massDriverSuperCurve.getTangentAt(d)
        const upward = virtualLaunchVehicle.massDriverSuperCurve.getNormalAt(d)
        const rightward = virtualLaunchVehicle.massDriverSuperCurve.getBinormalAt(d)
        const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
        const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
        const orientation = virtualLaunchVehicle.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
    
        om.position.copy(pointOnMassDriverCurve)
        .add(rightward.clone().multiplyScalar(virtualLaunchVehicle.sidewaysOffset))
        .add(upward.clone().multiplyScalar(virtualLaunchVehicle.upwardsOffset))
        om.setRotationFromQuaternion(orientation)
    
        om.visible = virtualLaunchVehicle.isVisible
    
        // Turn on the flame at the exit of the launch tube
        // ToDo: Using hard coded indicies for parts of the model is not good for code maintainability - improve this but without degrading performance.
        if (deltaT > virtualLaunchVehicle.timeInsideLaunchSystem) {
        om.children[1].visible = true
        }
        else {
        om.children[1].visible = false
        }
        om.children[2].visible = virtualLaunchVehicle.showLaunchVehiclePointLight
        om.matrixValid = false
    }
      
}
