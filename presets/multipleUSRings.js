import * as THREE from 'three'
import * as tram from '../tram.js'

export function multipleUSRings(guidParamWithUnits, nonGUIParams) {

    // guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
    // guidParamWithUnits['numTethers'].value = 1300
    // guidParamWithUnits['numForkLevels'].value = 10
    const allFeaturesOn = false
    guidParamWithUnits['showLogo'].value = false // It will automatically turn off later to indicate that the launch delay timer is about to expire...
    guidParamWithUnits['showXYChart'].value = false
    guidParamWithUnits['showEarthsSurface'].value = true
    guidParamWithUnits['showEarthsAtmosphere'].value = true
    guidParamWithUnits['showMoon'].value = false
    guidParamWithUnits['showStars'].value = false
    guidParamWithUnits['showEarthAxis'].value = false
    guidParamWithUnits['showBackgroundPatch'].value = false
    guidParamWithUnits['showEarthEquator'].value = false
    guidParamWithUnits['showMainRingCurve'].value = true
    guidParamWithUnits['showGravityForceArrows'].value = false
    guidParamWithUnits['showGyroscopicForceArrows'].value = false
    guidParamWithUnits['showTethers'].value = true
    guidParamWithUnits['showTransitSystem'].value = allFeaturesOn
    guidParamWithUnits['showStationaryRings'].value = true
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
    guidParamWithUnits['numForkLevels'].value = 6
    guidParamWithUnits['numVirtualTransitVehicles'].value = 4000 * 8
    guidParamWithUnits['numVirtualGroundTerminuses'].value = 4000
    guidParamWithUnits['numVirtualRingTerminuses'].value = 4000
    guidParamWithUnits['numElevatorCables'].value = 4000
    guidParamWithUnits['numVirtualHabitats'].value = 0
    guidParamWithUnits['tetherMinOpacity'].value = 0
    guidParamWithUnits['tetherDistanceFactor'].value = -21
    guidParamWithUnits['ringFinalAltitude'].value = 12000  // m

    // From space, above North America's West Coast
    nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(0, 0, 0)
    nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(0, 1, 0)
    nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-7095472.177860912, 6454902.16853429, -537481.9822720655)
    nonGUIParams['cameraUp'] = new THREE.Vector3(0, 1, 0)

    // nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    //   ((i==3) && (j==2)) ||  // Seattle??
    //   ((i==4) && (j==2)) ||  // Seattle??
    //   ((i==1) && (j==4)))} // Hawaii??

    // nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    //   ((i==3) && (j==3)) ||  // California
    //   ((i==4) && (j==3)) ||  // 
    //   ((i==5) && (j==3)) ||  // 
    //   ((i==6) && (j==3)) ||  // East Coast
    //   ((i==1) && (j==4)))} // Hawaii??
      
    nonGUIParams['overrideOrbitControlsUpDirection'] = true
    const coordinates = [{lat: -36.9, lon: 269.64, eqLat: 10},
                        {lat: -9, lon: 275, eqLat: 37},
                        {lat: -9, lon: 273, eqLat: 39},
                        {lat: -25, lon: 260, eqLat: 20},
                        {lat: -40.8, lon: 255, eqLat: 10},
                        {lat: -45.4, lon: 250.8, eqLat: 10}]
    // guidParamWithUnits['finalLocationRingCenterLatitude'].value = coordinates[0].lat
    // guidParamWithUnits['finalLocationRingCenterLongitude'].value = coordinates[0].lon
    // guidParamWithUnits['equivalentLatitude'].value = coordinates[0].eqLat

    nonGUIParams['getRingSpecs'] = () => {
      const tetheredRingSpecs = []
      coordinates.forEach(coord => {
        tetheredRingSpecs.push(
          {locationSpec: {buildLat: -19.2, buildLon:213.7, finalLat: coord.lat, finalLon: coord.lon}, eqLat: coord.eqLat}
        )
      })
      return tetheredRingSpecs
    }

    nonGUIParams['overrideClipPlanes'] = true
    nonGUIParams['nearClip'] = 10000
    nonGUIParams['farClip'] = 100000000

  }
