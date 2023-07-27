import * as THREE from 'three'
import { SledGrapplerPlacementInfo, SledGrapplerGeometry } from './SledGrapplerGeometry.js'

export class virtualLaunchSled {
    constructor(timeLaunched, unallocatedModelsArray) {
      // The virtual vehicle has a position along the launch trajectory curve.
      // 0 represents the begginning of the mass driver, 1 represents 't==durationOfLaunchTrajectory'
      this.timeLaunched = timeLaunched
      this.unallocatedModels = unallocatedModelsArray
    }
  
    static update(dParamWithUnits, massDriverSuperCurve, launcherMassDriverLength, scene, clock) {
      virtualLaunchSled.clock = clock
      virtualLaunchSled.updatePeriod = 3  // seconds
  
      virtualLaunchSled.timeOfLastUpdate = clock.getElapsedTime() - virtualLaunchSled.updatePeriod
      virtualLaunchSled.massDriverSuperCurve = massDriverSuperCurve
      virtualLaunchSled.launcherMassDriverLength = launcherMassDriverLength
      virtualLaunchSled.launchSledBodyLength = dParamWithUnits['launchSledBodyLength'].value
      virtualLaunchSled.sidewaysOffset = dParamWithUnits['launchSledSidewaysOffset'].value
      virtualLaunchSled.upwardsOffset = dParamWithUnits['launchSledUpwardsOffset'].value
      virtualLaunchSled.isVisible = dParamWithUnits['showLaunchSleds'].value
      virtualLaunchSled.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
      virtualLaunchSled.launchSledNumGrapplers = dParamWithUnits['launchSledNumGrapplers'].value
      virtualLaunchSled.magnetThickness = dParamWithUnits['launchSledGrapplerMagnetThickness'].value
      virtualLaunchSled.shaftToGrapplerPad = dParamWithUnits['launchSledShaftToGrapplerPad'].value
      virtualLaunchSled.launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
      virtualLaunchSled.launcherMassDriverInitialVelocity = dParamWithUnits['launcherMassDriverInitialVelocity'].value
  
      // Because the sled inferfaces with the screw, we need to obtains some screw parameters as well...
      virtualLaunchSled.screwRevolutionsPerSecond = dParamWithUnits['launcherMassDriverScrewRevolutionsPerSecond'].value
      virtualLaunchSled.launcherMassDriverScrewShaftRadius = dParamWithUnits['launcherMassDriverScrewShaftRadius'].value
      virtualLaunchSled.launcherMassDriverScrewThreadRadius =  dParamWithUnits['launcherMassDriverScrewThreadRadius'].value
      virtualLaunchSled.launcherMassDriverScrewThreadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value
      virtualLaunchSled.launcherMassDriverScrewThreadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value
      virtualLaunchSled.launcherMassDriverScrewSidewaysOffset = dParamWithUnits['launcherMassDriverScrewSidewaysOffset'].value
      virtualLaunchSled.launcherMassDriverScrewUpwardsOffset = dParamWithUnits['launcherMassDriverScrewUpwardsOffset'].value
      virtualLaunchSled.padRActuation = virtualLaunchSled.launcherMassDriverScrewThreadRadius - virtualLaunchSled.launcherMassDriverScrewShaftRadius
      virtualLaunchSled.padYActuation = dParamWithUnits['launcherGrapplerPadLiftAwayDistance'].value
      
  
      virtualLaunchSled.isDynamic =  true
      virtualLaunchSled.hasChanged = true
      virtualLaunchSled.scene = scene
    }
  
    placeAndOrientModel(om, refFrame) {
      if (virtualLaunchSled.isVisible) {
        const deltaT = refFrame.timeSinceStart * virtualLaunchSled.slowDownPassageOfTime - this.timeLaunched
        const acceleration = virtualLaunchSled.launcherMassDriverForwardAcceleration
        const initialVelocity = virtualLaunchSled.launcherMassDriverInitialVelocity
        const sledBackDistance = virtualLaunchSled.massDriverSuperCurve.tTod(deltaT, initialVelocity, acceleration)
        const bodyLength = virtualLaunchSled.launchSledBodyLength
        const d = (sledBackDistance + bodyLength/2) / virtualLaunchSled.launcherMassDriverLength
        const pointOnMassDriverCurve = virtualLaunchSled.massDriverSuperCurve.getPointAt(d)
        const forward = virtualLaunchSled.massDriverSuperCurve.getTangentAt(d)
        const upward = virtualLaunchSled.massDriverSuperCurve.getNormalAt(d)
        const rightward = virtualLaunchSled.massDriverSuperCurve.getBinormalAt(d)
        const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
        const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
        const orientation = virtualLaunchSled.massDriverSuperCurve.getQuaternionAt(modelForward, modelUpward, d)
  
        // Next we need to position the launch sled's legs so that they interface with the screws
        // First, working from the back of the launch sled towards the front, we need to virtually recreate the back face of the screw thread, but only the 
        // parts of the that back face that are within the reach of the launch sled's legs.
  
        const screwRevolutionsPerSecond = virtualLaunchSled.screwRevolutionsPerSecond
        const threadRadius = virtualLaunchSled.launcherMassDriverScrewThreadRadius
        const threadStarts = virtualLaunchSled.launcherMassDriverScrewThreadStarts
        const threadThickness = virtualLaunchSled.launcherMassDriverScrewThreadThickness
        const shaftRadius = virtualLaunchSled.launcherMassDriverScrewShaftRadius
        const upwardsOffset = virtualLaunchSled.upwardsOffset
        const screwSidewaysOffset = virtualLaunchSled.launcherMassDriverScrewSidewaysOffset
        const screwUpwardsOffset = virtualLaunchSled.launcherMassDriverScrewUpwardsOffset
        const numGrapplers = virtualLaunchSled.launchSledNumGrapplers
        const magnetThickness = virtualLaunchSled.magnetThickness
        const shaftToGrapplerPad = virtualLaunchSled.shaftToGrapplerPad
        const grapplersSidewaysOffset = screwSidewaysOffset
        const grapplerUpwardsOffset = screwUpwardsOffset
        const grapplerRadius = (shaftRadius + threadRadius)/2
  
        // Create a new screw geometry to represent the adaptive nut
        const additionalRotation = (deltaT * screwRevolutionsPerSecond) % 1
        const timeNow = virtualLaunchSled.clock.getElapsedTime()
        const updateNow = (timeNow>virtualLaunchSled.timeOfLastUpdate+virtualLaunchSled.updatePeriod)
        if (updateNow) {
          virtualLaunchSled.timeOfLastUpdate += virtualLaunchSled.updatePeriod
        }
  
        let grapplerGeometry = []
        let grapplerOffset = []
        let grapplerSwitchoverSignal = []
  
        const firstGrapplerDistance =   0
        const lastGrapplerDistance = bodyLength
        const grapplerSpacing = 1.0 / numGrapplers * bodyLength
  
        const info = new SledGrapplerPlacementInfo(
          shaftRadius,
          threadRadius,
          threadThickness,
          threadStarts,
          screwRevolutionsPerSecond,
          acceleration,
          initialVelocity,
          sledBackDistance,
          bodyLength,
          numGrapplers,
          magnetThickness,
          shaftToGrapplerPad,
          additionalRotation
        )
  
        for (let i = 0, grapplerDistance = firstGrapplerDistance; grapplerDistance<lastGrapplerDistance; i++, grapplerDistance += grapplerSpacing) {
          info.generatePlacementInfo(grapplerDistance)
          grapplerOffset[i] = info.offset
          grapplerSwitchoverSignal[i] = info.switchoverSignal
          if (updateNow) {
            grapplerGeometry[i] = new SledGrapplerGeometry(
              shaftRadius,
              threadRadius,
              threadThickness,
              threadStarts,
              screwRevolutionsPerSecond,
              acceleration,
              initialVelocity,
              sledBackDistance,
              bodyLength,
              numGrapplers,
              magnetThickness,
              shaftToGrapplerPad,
              additionalRotation,
              grapplerDistance,
              info.offset
            )
          }
        }
  
        om.children.forEach(child => {
          if (child.name=='launchSled_leftGrappler') {
            if (updateNow) {
              child.geometry.dispose()
              child.geometry = grapplerGeometry[child.userData]
            }
            const offset = grapplerOffset[child.userData]
            const switchoverSignal = grapplerSwitchoverSignal[child.userData]
            const padRActuation = Math.max(0, Math.min(1, (switchoverSignal*4-1))) * virtualLaunchSled.padRActuation
            const padThetaFactor = 1 - Math.max(0, Math.min(1, (switchoverSignal*4-2)/2))
            const padYActuation = Math.min(1, switchoverSignal*4) * virtualLaunchSled.padYActuation
            const rOffset = offset.x + padRActuation
            const rawTheta = offset.z
            const thetaOffset = Math.atan2(Math.sin(rawTheta), Math.cos(rawTheta)) * padThetaFactor
            const xOffset = rOffset * -Math.sin(thetaOffset)
            const zOffset = rOffset * Math.cos(thetaOffset)
            const yOffset = offset.y - padYActuation
            child.position.copy(pointOnMassDriverCurve)
              .add(rightward.clone().multiplyScalar(grapplersSidewaysOffset - xOffset)) // ToDo: This should be a parameter
              .add(upward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
              .add(forward.clone().multiplyScalar(yOffset))
            const combinedOrientation = orientation.clone() //.multiply(child.geometry.userData.orientation)
            child.setRotationFromQuaternion(combinedOrientation)
            child.rotateY(-thetaOffset)
          }
          else if (child.name=='launchSled_rightGrappler') {
            if (updateNow) {
              child.geometry.dispose()
              child.geometry = grapplerGeometry[child.userData]
            }
            const offset = grapplerOffset[child.userData]
            const switchoverSignal = grapplerSwitchoverSignal[child.userData]
            const padRActuation = Math.max(0, Math.min(1, (switchoverSignal*4-1))) * virtualLaunchSled.padRActuation
            const padThetaFactor = 1 - Math.max(0, Math.min(1, (switchoverSignal*4-2)/2))
            const padYActuation = Math.min(1, switchoverSignal*4) * virtualLaunchSled.padYActuation
            const rOffset = offset.x + padRActuation
            const rawTheta = offset.z
            const thetaOffset = Math.atan2(Math.sin(rawTheta), Math.cos(rawTheta)) * padThetaFactor
            const xOffset = rOffset * -Math.sin(thetaOffset)
            const zOffset = rOffset * Math.cos(thetaOffset)
            const yOffset = offset.y - padYActuation
            child.position.copy(pointOnMassDriverCurve)
              .add(rightward.clone().multiplyScalar(-grapplersSidewaysOffset + xOffset)) // ToDo: This should be a parameter
              .add(upward.clone().multiplyScalar(grapplerUpwardsOffset + zOffset))
              .add(forward.clone().multiplyScalar(yOffset))
            const combinedOrientation = orientation.clone() //.multiply(child.geometry.userData.orientation)
            child.setRotationFromQuaternion(combinedOrientation)
            child.rotateY(thetaOffset)
          }
          else if (child.name=='launchSled_body') {
            child.position.copy(pointOnMassDriverCurve)
              .add(rightward.clone().multiplyScalar(virtualLaunchSled.sidewaysOffset))
              .add(upward.clone().multiplyScalar(virtualLaunchSled.upwardsOffset))
            child.setRotationFromQuaternion(orientation)
          }
          child.visible = true
        })
        om.matrixValid = false
      }
      om.visible = virtualLaunchSled.isVisible
    }
  }
  