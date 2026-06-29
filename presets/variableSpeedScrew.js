import * as THREE from 'three'
import { myFormat } from '../tram.js'

export function variableSpeedScrew(guidParamWithUnits, guidParam, gui, nonGUIParams) {
  
  const a_a = 80 // m/s2 (acceleration during acceleration)
  const l_d = 82840
  const v = 11123 // m/s
  const l_a = 0.5 *v**2 / a_a
  const a_d = -(v**2 / 2 / l_d) // m/s2 (acceleration during deceleration)
  const padCenterRadius = .45 //m
  const screwAngularVelocity = 2*Math.PI * guidParamWithUnits['launcherMassDriverScrewRotationRate'].value // rad/s
  const ro = guidParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value
  const ri = guidParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value
  const σ_y = guidParamWithUnits['launcherMassDriverScrewMaterialYieldStrength'].value
  const ρ = guidParamWithUnits['launcherMassDriverScrewMaterialDensity'].value
  const f = guidParamWithUnits['launcherMassDriverScrewEngineeringFactor'].value
  const s2gp = guidParamWithUnits['adaptiveNutShaftToGrapplerPad'].value
  const tr = guidParamWithUnits['launcherMassDriverScrewThreadRadius'].value
  const mVehicle = guidParamWithUnits['launchVehicleEmptyMass'].value
  const mPayload = guidParamWithUnits['launchVehiclePayloadMass'].value
  const initialPropellantMass = guidParamWithUnits['launchVehiclePropellantMass'].value
  const mSled = guidParamWithUnits['launchSledMass'].value
  const mAdaptiveNut = guidParamWithUnits['launcherAdaptiveNutMass'].value
  const mNut = guidParamWithUnits['launcherNutMass'].value
  const numScrews = guidParamWithUnits['launcherMassDriverNumScrews'].value
  const screwLength = guidParamWithUnits['launcherMassDriverScrewRoughLength'].value
  const flywheelOuterRadius = guidParamWithUnits['launcherMassDriverFlywheelOuterRadius'].value
  const flywheelInnerRadius = guidParamWithUnits['launcherMassDriverFlywheelInnerRadius'].value
  const launcherMassDriverScrewRoughLength = guidParamWithUnits['launcherMassDriverScrewRoughLength'].value
  const flywheelLengthFactor = guidParamWithUnits['launcherMassDriverFlywheelLengthFactor'].value
  const flywheelDensity = guidParamWithUnits['launcherMassDriverFlywheelMaterialDensity'].value
  const flywheelYieldStrength = guidParamWithUnits['launcherMassDriverFlywheelMaterialYieldStrength'].value
  const flywheelEngineeringFactor = guidParamWithUnits['launcherMassDriverFlywheelEngineeringFactor'].value
  const flywheelLength = launcherMassDriverScrewRoughLength * flywheelLengthFactor
  const flywheelVolume = Math.PI * flywheelLength * (flywheelOuterRadius**2 - flywheelInnerRadius**2)
  const flywheelMass = flywheelVolume * flywheelDensity
  const flywheelMomentOfInertia = 0.5 * Math.PI * flywheelDensity * flywheelLength * (flywheelOuterRadius**4 - flywheelInnerRadius**4)
  const flywheelMaxAngularVelocity = Math.sqrt(flywheelYieldStrength/flywheelEngineeringFactor/flywheelDensity/(flywheelOuterRadius**2 + flywheelInnerRadius**2))  // Units are radians per second

  const nutLength = 100 //guidParamWithUnits['adaptiveNutGrapplerLength'].value
  const launchTrainMass = mVehicle + mPayload + initialPropellantMass + mSled + mAdaptiveNut
  const screwMomentOfInertia = 0.5 * ρ * Math.PI * (ro**4 - ri**4) // Doesn't include the flights yet...
  const nSteps = 30
  const screwFlightSpeed = screwAngularVelocity * padCenterRadius

  console.log('flywheelMaxAngularVelocity=', flywheelMaxAngularVelocity)
  // Variable Pitch Screw
  for (let i = 0; i < nSteps; i++) {
    const d = i*l_a/(nSteps-1)
    const v_d = Math.sqrt(2*a_a*d)
    const t_d = v_d / a_a
    const slope = v_d / screwFlightSpeed
    const Fy_d = launchTrainMass * a_a
    const Fx_d = Fy_d * slope
    const T_d = Fx_d * padCenterRadius / numScrews
    const nutPassageTime = nutLength / v_d
    console.log(i, myFormat(d, 2), myFormat(slope, 2), myFormat(T_d, 0), myFormat(nutPassageTime, 4))
  }

  // Variable Speed Screw - Acceleration
  const slope = v / screwFlightSpeed
  console.log("#", "d", "nutPassageTime", "screwInitialAngularVelocity", "screwFinalAngularVelocity", "flywheelInitialAngularVelocity", "flywheelFinalAngularVelocity")
  for (let i = 0; i < nSteps; i++) {
    const d0 = i*l_a/(nSteps-1)
    const v_d0 = Math.sqrt(2*a_a*d0)
    const screwFlightSpeed0 = v_d0 / slope
    const screwInitialAngularVelocity = screwFlightSpeed0 / padCenterRadius

    const d1 = d0 + screwLength
    const v_d1 = Math.sqrt(2*a_a*d1)
    const screwFlightSpeed1 = v_d1 / slope
    const screwFinalAngularVelocity = screwFlightSpeed1 / padCenterRadius

    const nutPassageTime = nutLength / (v_d0+v_d1)/2
    // Compute the flywheel start and end speeds and the energy change

    const kineticEnergyAddedToLaunchTrainByScrewSegment = launchTrainMass * a_a * screwLength / numScrews
    const kineticEnergyAddedToScrewSegment = screwMomentOfInertia * (screwFinalAngularVelocity**2 - screwInitialAngularVelocity**2) / 2
    const kineticEnergyTransferredToScrew = kineticEnergyAddedToLaunchTrainByScrewSegment + kineticEnergyAddedToScrewSegment  // We're assuming that the nut-to-screw coupling mechanism is lossless here...
    const powerToScrew = kineticEnergyTransferredToScrew / nutPassageTime
    const screwAngularDisplacement = 0.5 * (screwInitialAngularVelocity + screwFinalAngularVelocity) * nutPassageTime
    const torque = kineticEnergyTransferredToScrew / screwAngularDisplacement
    const screwAngularImpulse = torque * nutPassageTime
    // Now work out how facst the flywheel needs to be spinning initially...    
    const flywheelAngularImpulse = -screwAngularImpulse
    const flywheelFinalAngularVelocity = screwFinalAngularVelocity
    const flywheelInitialAngularVelocity = torque * nutPassageTime / flywheelMomentOfInertia + flywheelFinalAngularVelocity
    const flywheelInitialKineticEnergy = 0.5 * flywheelMomentOfInertia * flywheelInitialAngularVelocity**2
    const flywheelFinalKineticEnergy = 0.5 * flywheelMomentOfInertia * flywheelFinalAngularVelocity**2
    const changeInFlywheelKineticEnergy = flywheelFinalKineticEnergy - flywheelInitialKineticEnergy
    const energyLostToHeat = kineticEnergyTransferredToScrew - changeInFlywheelKineticEnergy
    const changeInFlywheelAngularVelocity = flywheelInitialAngularVelocity - flywheelFinalAngularVelocity

    console.log(i, 
      "d=" + myFormat(d0, 2),
      "t=" + myFormat(nutPassageTime, 4),
      "E=" + myFormat(kineticEnergyTransferredToScrew/1e6, 2) + "MJ",
      "P=" + myFormat(powerToScrew/1e6, 2) + "MW",
      "ω0_s=" + myFormat(screwInitialAngularVelocity, 2),
      "ω1_s=" + myFormat(screwFinalAngularVelocity, 2),
      "τ=" + myFormat(torque),
      "ω0_fw=" + myFormat(flywheelInitialAngularVelocity, 2), 
      "ω1_fw=" + myFormat(flywheelFinalAngularVelocity, 2),
      "Δω_fw=" + myFormat(changeInFlywheelAngularVelocity, 2),
      "ΔE_fw=" + myFormat(changeInFlywheelKineticEnergy/1e6, 2) + "MJ",
      "heat=" + myFormat(energyLostToHeat/1e6, 2) + "MJ",
    )
  }

  // Variable Speed Screw - Deceleration
  console.log("#", "d", "nutPassageTime", "screwInitialAngularVelocity", "screwFinalAngularVelocity", "flywheelInitialAngularVelocity", "flywheelFinalAngularVelocity")
  for (let i = 0; i < nSteps; i++) {
    const s0 = i*l_d/(nSteps-1)
    const d0 = l_a + s0
    // Velocity in the decelertion section
    const v_d0 = Math.sqrt(v**2 + 2*a_d*s0)
    //v_d0 = Math.sqrt(Math.max(0, v**2 + 2*aDecel*s0))
    const screwFlightSpeed0 = v_d0 / slope
    const screwInitialAngularVelocity = screwFlightSpeed0 / padCenterRadius

    const s1 = s0 + screwLength
    const v_d1 = Math.sqrt(v**2 + 2*a_d*s1)
    const screwFlightSpeed1 = v_d1 / slope
    const screwFinalAngularVelocity = screwFlightSpeed1 / padCenterRadius

    const nutPassageTime = nutLength / (v_d0+v_d1)/2
    // Compute the flywheel start and end speeds and the energy change

    const kineticEnergyRecoveredFromNutByScrewSegment = mNut * a_d * screwLength / numScrews
    const kineticEnergyTakenFromScrewSegment = screwMomentOfInertia * (screwFinalAngularVelocity**2 - screwInitialAngularVelocity**2) / 2
    const kineticEnergyTransferredFromScrew = kineticEnergyRecoveredFromNutByScrewSegment + kineticEnergyTakenFromScrewSegment  // We're assuming that the nut-to-screw coupling mechanism is lossless here...
    const powerFromScrew = kineticEnergyTransferredFromScrew / nutPassageTime
    const screwAngularDisplacement = 0.5 * (screwInitialAngularVelocity + screwFinalAngularVelocity) * nutPassageTime
    const torque = kineticEnergyTransferredFromScrew / screwAngularDisplacement
    const screwAngularImpulse = torque * nutPassageTime
    // Now work out how facst the flywheel needs to be spinning initially...    
    const flywheelAngularImpulse = -screwAngularImpulse
    const flywheelFinalAngularVelocity = screwFinalAngularVelocity
    const flywheelInitialAngularVelocity = torque * nutPassageTime / flywheelMomentOfInertia + flywheelFinalAngularVelocity
    const flywheelInitialKineticEnergy = 0.5 * flywheelMomentOfInertia * flywheelInitialAngularVelocity**2
    const flywheelFinalKineticEnergy = 0.5 * flywheelMomentOfInertia * flywheelFinalAngularVelocity**2
    const changeInFlywheelKineticEnergy = flywheelFinalKineticEnergy - flywheelInitialKineticEnergy
    const energyLostToHeat = changeInFlywheelKineticEnergy - kineticEnergyTransferredFromScrew
    const changeInFlywheelAngularVelocity = flywheelInitialAngularVelocity - flywheelFinalAngularVelocity

    console.log(i, 
      "d=" + myFormat(d0, 2),
      "t=" + myFormat(nutPassageTime, 4),
      "E=" + myFormat(kineticEnergyTransferredFromScrew/1e6, 2) + "MJ",
      "P=" + myFormat(powerFromScrew/1e6, 2) + "MW",
      "ω0_s=" + myFormat(screwInitialAngularVelocity, 2),
      "ω1_s=" + myFormat(screwFinalAngularVelocity, 2),
      "τ=" + myFormat(torque),
      "ω0_fw=" + myFormat(flywheelInitialAngularVelocity, 2), 
      "ω1_fw=" + myFormat(flywheelFinalAngularVelocity, 2),
      "Δω_fw=" + myFormat(changeInFlywheelAngularVelocity, 2),
      "ΔE_fw=" + myFormat(changeInFlywheelKineticEnergy/1e6, 2) + "MJ",
      "heat=" + myFormat(energyLostToHeat/1e6, 2) + "MJ",
    )
  }

  // Hawaii Big Island
  nonGUIParams['getCapturePresetRegions'] = (i, j) => { return ( 
    ((i==1) && (j==4)) ||
    ((i==2) && (j==4)) ||
    ((i==3) && (j==4))
  )} 

  nonGUIParams['orbitControlsTarget'] = new THREE.Vector3(-2485252.833291091, 2139838.026337634, -5469810.453140184)
  nonGUIParams['orbitControlsUpDirection'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)
  nonGUIParams['orbitControlsObjectPosition'] = new THREE.Vector3(-2004542.2348935166, 1914991.4645450646, -6064638.482857945)
  nonGUIParams['cameraUp'] = new THREE.Vector3(-0.3896218876085459, 0.33561868621277463, -0.8576449627679072)

}