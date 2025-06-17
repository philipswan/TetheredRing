import * as THREE from 'three'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { googleEarthStudioProvidedBackground } from './googleEarthStudioProvidedBackground.js'
import { toMarsFromEarthLauncherArchitecture } from './toMarsFromEarthLauncherArchitecture.js'

export function edwardsAirforceBasePresets(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  // Uses Monna Kea launch location
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74.34
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value =  0.681

  // Location specific parameters that will affect the architecture
  // Edwards Airforce Base
  const launcherRampEndLatitude = 34.924 // °N
  const launcherRampEndLongitude = -117.8912 + .048056 // moving the end of the ramp a little bit east 
  const massDriverAltitude = 1000 // m
  const rampExitAltitude = 4000 // m
  toMarsFromEarthLauncherArchitecture(guidParamWithUnits, launcherRampEndLatitude, launcherRampEndLongitude, massDriverAltitude, rampExitAltitude)
  // guidParamWithUnits['launcherMassDriver1InitialVelocity'].value = 50
  // guidParamWithUnits['launcherMassDriver2InitialVelocity'].value = 50
  guidParamWithUnits['massDriverCameraRange'].value = 1000

  // Edwards Airforce Base
  const cameraCoordinateFromGoogle = {latitude: 34.950194550261486, longitude: -117.84735078185807, altitude: 717.4493901517701}
  const feederRailEntranceOffsets = {latitude: -0.38939244075872637, longitude: -9.275988800095632, altitude: -7433.665042882785}

  const angle = Math.PI*8/8 //11.6/8
  const distance = 0.1
  guidParamWithUnits['launcherRampEndLatitude'].value = cameraCoordinateFromGoogle.latitude - feederRailEntranceOffsets.latitude + 0.0033 //+ distance * Math.cos(angle) // 35.3
  guidParamWithUnits['launcherRampEndLongitude'].value = cameraCoordinateFromGoogle.longitude - feederRailEntranceOffsets.longitude + .05 //+ distance * Math.sin(angle) // -108.8 // moving the end of the ranp a little bit east 

  guidParamWithUnits['numLaunchesPerMarsTransferSeason'].value = 14*4 // 14 days, four lauches per day
  guidParamWithUnits['numberOfMarsTransferSeasons'].value = 10
  //guidParamWithUnits['launcherMarkerRadius'].value = 500
  
  //guidParamWithUnits['launcherMassDriverScrewRotationRate'].value = 200

  // Grappler Parameters
  guidParamWithUnits['adaptiveNutNumGrapplers'].value = 64
  guidParamWithUnits['adaptiveNutGrapplerMagnetThickness'].value = 0.06  // m
  guidParamWithUnits['adaptiveNutShaftToGrapplerPad'].value = 0.02
  guidParamWithUnits['adaptiveNutGrapplerPadLiftAwayDistance'].value = 0.01
  guidParamWithUnits['adaptiveNutGrapplerPadLiftAwayPortion'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerClearanceFactor'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerPadTwistPortion'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerBallJointClearance'].value = 0.1
  guidParamWithUnits['adaptiveNutGrapplerBallJointRadius'].value = 0.04
  guidParamWithUnits['adaptiveNutGrapplerRangeFactor'].value = .01
  guidParamWithUnits['adaptiveNutGrapplerMaxRangeOfMotion'].value = 0.125
  guidParamWithUnits['adaptiveNutGrapplerTopDeadCenterRotation'].value = 0.5
 
  // Parameters that are going to effect the launch system's performance...
  // Launch Angle (launcherRampUpwardAcceleration)
  // Propellant Mass (launchVehiclePropellantMass)
  // Altitude of Ramp Exit
  // Altitude of Evauated Tube Exit
  // Desired Orbital Altitude

  // The optimiztion loop will need to adjust the launch angle and propellant mass to achieve the desired orbit
  // So first, pick a launch angle. Then adjust propellant mass to achive an eliptical orbit with the desired appogee.
  // We need to keep some propellant in reserve to perform a circularization burn at that orbit's appogee.

  // Launch Trajectory Parameters

  
  googleEarthStudioProvidedBackground(guidParamWithUnits, nonGUIParams)
  //guidParamWithUnits['jsonFileCameraControlHelper'].value = true
  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)
  //guidParamWithUnits['showLaunchTrajectory'].value = true
  guidParamWithUnits['showEarthsSurface'].value = false
  guidParamWithUnits['showEarthsAtmosphere'].value = false
  //guidParamWithUnits['showLaunchTrajectory'].value = true
  //guidParamWithUnits['showMarkers'].value = true
  // guidParamWithUnits['launcherMarkerRadius'].value = 2
  guidParamWithUnits['launcherCoastTime'].value = 100*20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = .02
  guidParamWithUnits['launchVehicleScaleFactor'].value = 1.5
  guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 4.5

  // Hack to speed up the simulation
  // guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
  // guidParamWithUnits['showMassDriverBrackets'].value = false

  // Edwards Airforce Base
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-3007.1148136202246, -6264.6731445984915, 1022.8777029900812)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.724222884105926, 0.5714761030146778, -0.38589671911076434)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-67470.68359927274, -38125.01118784398, -28221.66436792817)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.724222884105926, 0.5714761030146778, -0.38589671911076434)

  // Top view
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(1091.1735583106056, -982.7729875501245, 1166.9221079312265)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.7247731808452249, 0.5728030388844629, -0.3828844668724749)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2091.077505604364, 1532.219485245645, -514.2026279103011)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.7247731808452249, 0.5728030388844629, -0.3828844668724749)

  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    ((i==4) && (j==3))
  )} 

}