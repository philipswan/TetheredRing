import * as THREE from 'three'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { showMassDriver } from './cameraShotHelperFunctions.js'
import { toAFromBLauncherArchitecture } from './toAFromBLauncherArchitecture.js'

export function toOrbitFromMoonLauncherPresets(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  // Mirror the Hawaii launch location pattern used by toMarsHawaiiLauncherPresets.
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74.34
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value = 0.681
  guidParamWithUnits['planetName'].value = "Moon"

  // Broad, relatively flat floor inside Korolev basin near the center of the
  // lunar far side. The Moon Kit LOLA base samples this point at about +2575 m
  // and varies by about 183 m across the surrounding one-degree (~30 km) window.
  const launcherRampEndLatitude = -3.062
  const launcherRampEndLongitude = -158.25
  const massDriverAltitude = 2765-100 // ~190 m above the coarse global DEM
  const rampExitAltitude = 2765-90

  toAFromBLauncherArchitecture(
    guidParamWithUnits,
    launcherRampEndLatitude,
    launcherRampEndLongitude,
    massDriverAltitude,
    rampExitAltitude,
    'Moon',
    'Low Moon Orbit'
  )

  guidParamWithUnits['launcherMassDriverScrewNumBrackets'].value = 80000
  guidParamWithUnits['launcherFeederRailLength'].value = 0
  guidParamWithUnits['launcherMarkerRadius'].value = 500
  guidParamWithUnits['adaptiveNutNumGrapplers'].value = 64
  guidParamWithUnits['adaptiveNutGrapplerMagnetThickness'].value = 0.06

  // Frame the lunar site instead of reusing Earth-radius Hawaii vectors.
  const lat = THREE.MathUtils.degToRad(launcherRampEndLatitude)
  const lon = THREE.MathUtils.degToRad(launcherRampEndLongitude)
  const localUp = new THREE.Vector3(
    Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))
  const localEast = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon))
  const surfacePoint = localUp.clone().multiplyScalar(1737400 + massDriverAltitude)
  nonGUIParams['orbitControlsTarget'] = surfacePoint
  nonGUIParams['orbitControlsUpDirection'] = localUp
  nonGUIParams['orbitControlsObjectPosition'] = surfacePoint.clone()
    .addScaledVector(localUp, 12000)
    .addScaledVector(localEast, 18000)
  nonGUIParams['cameraUp'] = localUp
  // Grazing sunlight produces the long, hard-edged relief cues characteristic
  // of airless lunar photography at this site.
  nonGUIParams['sunLightPosition'] = localUp.clone().multiplyScalar(1737400)
    .addScaledVector(localEast, 4 * 1737400)

  showMassDriver(guidParamWithUnits)
  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)
  guidParamWithUnits['showEarthsAtmosphere'].value = false

  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100 * 20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  guidParamWithUnits['orbitControlsRotateSpeed'].value = 1
  guidParamWithUnits['logZoomRate'].value = -3
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showMarkers'].value = true

  nonGUIParams['usePlanet2'] = true
  nonGUIParams['planet2Assets'] = ['moon', 'moon_korolev']
  nonGUIParams['planet2RequireKtx2'] = false
  nonGUIParams['tileSegments'] = 64
  nonGUIParams['planet2SurfaceDetail'] = {
    enabled: true,
    nearMeters: 1500,
    farMeters: 90000,
    normalStrength: 0.72,
    albedoStrength: 0.18,
    roughnessStrength: 0.14
  }
  // Lunar scenes need hard directional relief; the old ambient intensity of 2
  // washes out craters and makes the surface look uniformly gray.
  nonGUIParams['sunLightIntensity'] = 2.2
  nonGUIParams['ambientLightIntensity'] = 0.08
  nonGUIParams['imageryAttribution'] =
    'NASA Scientific Visualization Studio; LRO LROC/LOLA'
  nonGUIParams['useXHREarthTexture'] = false
  nonGUIParams['useXHREarthDisplacement'] = false
  nonGUIParams['locationInterests'] = [
    { name: 'Korolev mass driver', lat: launcherRampEndLatitude,
      lon: launcherRampEndLongitude, radiusKm: 120, lodBoost: 2 }
  ]
  nonGUIParams['tileSegments'] = 64

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 100000000
}
