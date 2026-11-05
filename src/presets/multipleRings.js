import * as THREE from 'three'
import * as tram from '../utils/tram.js'

// A repeatable value in [0, 1) for index i (an integer hash), in place of Math.random().
function scatter(i) {
  let x = Math.imul(i + 1, 0x9e3779b9) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return x / 4294967296
}

export function multipleRings(guidParamWithUnits, nonGUIParams) {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    const allFeaturesOn = false
    guidParamWithUnits['showLogo'].value = true // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = true
    guidParamWithUnits['showMoon'].value = true
    guidParamWithUnits['showStars'].value = true
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showEarthEquator'].value = false
    guidParamWithUnits['showMainRingCurve'].value = false
    guidParamWithUnits['showGravityForceArrows'].value = false
    guidParamWithUnits['showGyroscopicForceArrows'].value = false
    guidParamWithUnits['showTethers'].value = true
    guidParamWithUnits['showTransitSystem'].value = allFeaturesOn
    guidParamWithUnits['showStationaryRings'].value = allFeaturesOn
    guidParamWithUnits['showMovingRings'].value = false
    guidParamWithUnits['showTransitTube'].value = allFeaturesOn
    guidParamWithUnits['showTransitVehicles'].value = allFeaturesOn
    guidParamWithUnits['showRingTerminuses'].value = allFeaturesOn
    guidParamWithUnits['showGroundTerminuses'].value = false
    guidParamWithUnits['showElevatorCables'].value = allFeaturesOn
    guidParamWithUnits['showElevatorCars'].value = allFeaturesOn
    guidParamWithUnits['showHabitats'].value = false
    guidParamWithUnits['showSolarArrays'].value = false
    guidParamWithUnits['showLaunchTrajectory'].value = false
    guidParamWithUnits['showMassDriverTube'].value = false
    guidParamWithUnits['showMassDriverAccelerationScrews'].value = false
    guidParamWithUnits['showMassDriverDecelerationScrews'].value = false
    guidParamWithUnits['showMassDriverRail'].value = false
    guidParamWithUnits['showMassDriverBrackets'].value = false
    guidParamWithUnits['showLaunchSleds'].value = false
    guidParamWithUnits['showLaunchVehicles'].value = false
    guidParamWithUnits['showLaunchVehiclePointLight'].value = false
    guidParamWithUnits['pKeyAltitudeFactor'].value = 1
    guidParamWithUnits['showMarkers'].value = false

    guidParamWithUnits['massDriverCameraRange'].value = 1000
    guidParamWithUnits['launchSledCameraRange'].value = 10000
    guidParamWithUnits['vehicleInTubeCameraRange'].value = 1000000
    guidParamWithUnits['lauchVehicleCameraRange'].value = 1000000
    guidParamWithUnits['orbitControlsRotateSpeed'].value = 1
    guidParamWithUnits['logZoomRate'].value = -2.5
    guidParamWithUnits['transitTubeOpacity'].value = 0.05
    guidParamWithUnits['transitVehicleCruisingSpeed'].value = 4000
    guidParamWithUnits['transitVehicleStopDuration'].value = 42
    guidParamWithUnits['transitVehicleRandomizeStartPositions'].value = false

    guidParamWithUnits['numTethers'].value = 2000
    guidParamWithUnits['numForkLevels'].value = 2
    guidParamWithUnits['numVirtualTransitVehicles'].value = 4000 * 8
    guidParamWithUnits['numVirtualGroundTerminuses'].value = 4000
    guidParamWithUnits['numVirtualRingTerminuses'].value = 4000
    guidParamWithUnits['numElevatorCables'].value = 4000
    guidParamWithUnits['numVirtualHabitats'].value = 0
    guidParamWithUnits['numForkLevels'].value = 2


    // From space, above North America's West Coast
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0, 1, 0)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-21029602, 4606144, -3608743)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0, 1, 0)

    nonGUIParams['getRingSpecs'] = () => {
      const tetheredRingSpecs = []
      const coordinates = tram.getDodecahedronFaceCoordinates();
      coordinates.forEach(coord => {
        coord['eqLat'] = guidParamWithUnits['equivalentLatitude'].value
        // (A fixed scatter, not Math.random(): every page, and every worker of a parallel render, must place the
        // rings in the same places.)
        const k = tetheredRingSpecs.length
        const lat = coord.lat*180/Math.PI + scatter(2 * k)*10
        const lon = coord.lon*180/Math.PI + scatter(2 * k + 1)*10
        tetheredRingSpecs.push(
          {locationSpec: {buildLat: -19.2, buildLon:213.7, finalLat: lat, finalLon: lon}, eqLat: coord.eqLat}
        )
      })
      return tetheredRingSpecs
    }

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 10000
    nonGUIParams['farClip'] = 100000000

  }
