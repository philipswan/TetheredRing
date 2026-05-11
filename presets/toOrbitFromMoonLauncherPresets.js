import * as THREE from 'three'
import { actualSizeDollyShot } from './actualSizeDollyShot.js'
import { showMassDriver } from './cameraShotHelperFunctions'
import { toAFromBLauncherArchitecture } from './toAFromBLauncherArchitecture.js'

export function toOrbitFromMoonLauncherPresets(guidParamWithUnits, guidParam, gui, nonGUIParams) {

  // Mirror the Hawaii launch location pattern used by toMarsHawaiiLauncherPresets.
  guidParamWithUnits['finalLocationRingCenterLatitude'].value = 74.34
  guidParamWithUnits['finalLocationRingCenterLongitude'].value = 203
  guidParamWithUnits['evacuatedTubeEntrancePositionAroundRing'].value = 0.681
  guidParamWithUnits['planetName'].value = "Moon"

  const launcherRampEndLatitude = 19.820667
  const launcherRampEndLongitude = -155.468056 + 0.048056
  const massDriverAltitude = 1000
  const rampExitAltitude = 1500

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

  // Keep camera and framing consistent with the existing Hawaii launcher preset family.
  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2485252.833291091, 2139838.026337634, -5469810.453140184)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2004542.2348935166, 1914991.4645450646, -6064638.482857945)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)

  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return (
    ((i == 1) && (j == 4)) ||
    ((i == 2) && (j == 4)) ||
    ((i == 3) && (j == 4))
  )}

  showMassDriver(guidParamWithUnits)
  actualSizeDollyShot(guidParamWithUnits, nonGUIParams)

  guidParamWithUnits['showStars'].value = true
  guidParamWithUnits['launcherCoastTime'].value = 100 * 20
  guidParamWithUnits['launcherSlowDownPassageOfTime'].value = 1
  guidParamWithUnits['orbitControlsRotateSpeed'].value = 1
  guidParamWithUnits['logZoomRate'].value = -3
  guidParamWithUnits['showXYChart'].value = false
  guidParamWithUnits['showMarkers'].value = true

  nonGUIParams['overrideClipPlanes'] = true
  nonGUIParams['nearClip'] = 1
  nonGUIParams['farClip'] = 100000000
}
