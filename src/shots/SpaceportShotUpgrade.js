// Earlier Spaceport presets accidentally saved a 100 km exit and disabled
// propulsion. Correct only that exact obsolete configuration during Open or
// autosave recovery; custom physics, camera keys and timing remain untouched.
export function upgradeSpaceportAtmosphere(shot, baseline) {
  const p = shot.parameters
  if (shot.preset !== 'SpaceportLauncher' || !p ||
      p.launcherEvacuatedTubeExitAltitude !== 100000 ||
      p.launchVehicleCoefficientOfDrag !== 0 ||
      p.launchVehiclePropellantMassFlowRate !== 0 ||
      p.launchVehiclePropellantMass !== 0) return false
  const keys = ['launcherEvacuatedTubeExitAltitude', 'launchVehicleCoefficientOfDrag',
    'launchVehiclePropellantMassFlowRate', 'launchVehiclePropellantMass', 'launchVehicleAdaptiveThrust']
  if (!baseline || !keys.every(key => Object.hasOwn(baseline, key)) ||
      !(baseline.launcherEvacuatedTubeExitAltitude < 100000 && baseline.launchVehicleCoefficientOfDrag > 0 &&
        baseline.launchVehiclePropellantMassFlowRate > 0 && baseline.launchVehiclePropellantMass > 0)) return false
  if (keys.some(key => shot.parameterTracks?.[key]?.length)) return false
  for (const key of keys) p[key] = baseline[key]
  return true
}
