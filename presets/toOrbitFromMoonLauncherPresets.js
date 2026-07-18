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

  // Smooth mare west of Moltke crater. The cached LOLA DEM samples the launcher
  // exit at about -1663.5 m; Moltke lies roughly 15 km downrange to the east.
  const launcherRampEndLatitude = -0.60
  const launcherRampEndLongitude = 23.435
  const massDriverAltitude = -1612 // 1.5 m above the sampled local terrain
  const rampExitAltitude = -1602

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
  const cameraPosition = surfacePoint.clone()
    .addScaledVector(localUp, 12000)
    .addScaledVector(localEast, 18000)
  nonGUIParams['orbitControlsObjectPosition'] = cameraPosition
  nonGUIParams['cameraUp'] = localUp
  // Fallback light placement used until the launch curves exist. main.js then
  // replaces this with the launch-track-relative direction below.
  const sunDirection = localEast.clone().negate()
    .addScaledVector(localUp, 0.22).normalize()
  nonGUIParams['sunLightPosition'] = surfacePoint.clone()
    .addScaledVector(sunDirection, 300000)
  nonGUIParams['sunLightTarget'] = surfacePoint
  // Direction from the launcher toward the Sun in the launch-track frame.
  // Positive forward is down-track, positive right is track-right, and positive
  // up is away from the lunar surface.
  nonGUIParams['launchTrackLightDirection'] = {
    forward: -1,
    right: 1,
    up: 0.3111269837
  }

  showMassDriver(guidParamWithUnits)
  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)
  // The adaptive nut shares the sled range. Keep both available over the same
  // camera range as the launch vehicle for this long-lens shot.
  guidParamWithUnits['launchSledCameraRange'].value =
    guidParamWithUnits['lauchVehicleCameraRange'].value
  //guidParamWithUnits['launcherMassDriverTubeInnerRadius'].value = 100
  guidParamWithUnits['showEarthsAtmosphere'].value = false

  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['showMoon'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100 * 20
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showMarkers'].value = false
  guidParamWithUnits['showLogo'].value = false

  nonGUIParams['usePlanet2'] = true
  nonGUIParams['planet2Assets'] = ['moon', 'moon_tranquillitatis']
  nonGUIParams['planet2RequireKtx2'] = false
  nonGUIParams['planet2TextureAnisotropy'] = 16
  nonGUIParams['planet2SurfaceColor'] = 0xffffff
  nonGUIParams['enableSurfaceShadows'] = true
  nonGUIParams['surfaceShadowMapSize'] = 4096
  nonGUIParams['softSurfaceShadows'] = true
  // The shadow camera follows the tracked vehicle, so a tight frustum provides
  // sub-metre texels instead of spreading 4096 samples across many kilometres.
  nonGUIParams['surfaceShadowExtent'] = 1200
  nonGUIParams['surfaceShadowFar'] = 500000
  nonGUIParams['tileSegments'] = 64
  nonGUIParams['planet2SurfaceDetail'] = {
    enabled: true,
    nearMeters: 1500,
    farMeters: 90000,
    normalStrength: 0.84,
    albedoStrength: 0.22,
    roughnessStrength: 0.14
  }
  // Preset-local lunar exposure: retain grazing directional relief while adding
  // enough neutral fill to keep the vehicle and shadow-facing terrain readable.
  // Other planetary presets continue to use main.js's defaults (1 and 2).
  nonGUIParams['sunLightIntensity'] = 3.0
  nonGUIParams['ambientLightIntensity'] = 0.2
  nonGUIParams['imageryAttribution'] =
    'NASA Scientific Visualization Studio; LRO LROC/LOLA'
  nonGUIParams['useXHREarthTexture'] = false
  nonGUIParams['useXHREarthDisplacement'] = false
  nonGUIParams['locationInterests'] = [
    { name: 'Mare Tranquillitatis mass driver', lat: launcherRampEndLatitude,
      lon: launcherRampEndLongitude, radiusKm: 120, lodBoost: 2 }
  ]
  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 100000000
  nonGUIParams['initialTrackingHotkey'] = '0'
  //nonGUIParams['frameCaptureStartDelayInSeconds'] = 10
  //nonGUIParams['frameCaptureDurationInSeconds'] = 20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  guidParamWithUnits['launcherStartDelayInSeconds'].value = 10
  guidParamWithUnits['orbitControlsRotateSpeed'].value = -.1
  guidParamWithUnits['logZoomRate'].value = -3
  guidParamWithUnits['cameraFieldOfView'].value = 3

  // Camera coordinates in the launch-track frame, anchored at the feeder-rail
  // entrance. The target is at the end of the straight mass-driver rail.
  // Components are forward, right, and up.
  nonGUIParams['launchTrackCamera'] = {
    // target: {forward: 38, right: 0, up: 0},
    // position: {forward: -42.671451, right: -72.765857, up: 40.546889},
    // cameraUp: {forward: 0.000022, right: 0, up: 1}
    // target: {forward: 47.165741, right: 0, up: -0.000225},
    // position: {forward: -61.000779, right: -28.550766, up: 30.522895},
    // cameraUp: {forward: 0.000027, right: 0, up: 1}
    // target: {forward: 1014.715398, right: -165.905576, up: -6.402137},
    // position: {forward: 2204.262002, right: 233.850051, up: 111.337474},
    // cameraUp: {forward: 0.000022, right: 0, up: 1}
    target: {forward: 38, right: 0, up: 0},
    position: {forward: 11220.930161, right: 1207.207986, up: 574.759283},
    cameraUp: {forward: 0.000022, right: 0, up: 1}
  }
}
