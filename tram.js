import * as THREE from 'three'
//import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'

import * as tram from './tram.js'

// Tethered Ring Arcitectural Model (TRAM)

// Useful functions
export function lerp (start, end, amt) {
  return (1-amt)*start+amt*end
}

export function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max)
}

export function sign(num) {
  if (num<0) {
    return -1
  }
  else if (num>0) {
    return 1
  }
  else {
    return 0
  }
}

export function posFrac(num) {
  return num - Math.floor(num)
}

// Returns a "delta r" in the ring-centered cylindrical coordinate space relative to the middlemost main ring  
export function offset_r(outwardOffset, upwardOffset, currentEquivalentLatitude) {
  return outwardOffset * Math.sin(currentEquivalentLatitude) + upwardOffset * Math.cos(currentEquivalentLatitude)
}

// Returns a "delta y" in the ring-centered cylindrical coordinate space relative to the middlemost main ring  
export function offset_y(outwardOffset, upwardOffset, currentEquivalentLatitude) {
  return outwardOffset * -Math.cos(currentEquivalentLatitude) + upwardOffset * Math.sin(currentEquivalentLatitude)
}

export class forceVector {
  constructor(ρ, φ, z) {
    this.ρ = ρ            // Distance from the ring's axis of symmetry
    this.φ = φ            // Angle around the ring's axis of symmetry
    this.z = z            // Distance along the ring's axis of symmetry from the center of the ring
  }
}

export class cateneryVector {
  constructor(x, y, s, θ, T, crossSectionalArea) {
    this.x = x            // Distance from the origin (center of planet)
    this.y = y            // Angle from the ring's axis of symmetry
    this.s = s            // Distance along the catenery from the anchor point (Point B)
    this.θ = θ
    this.T = T
  }
}

export class CatenaryPolarVec3 {
  constructor(r, ω, s, crossSectionalArea) {
    this.r = r            // Distance from the origin (center of planet)
    this.ω = ω            // Angle from the ring's axis of symmetry
    this.s = s            // Distance along the tether measured from x=0 on the catenary
    this.crossSectionalArea = crossSectionalArea   // The cross-sectional area of a cable of constant stress, following this catenary curve
  }
}

export class latLonAlt {
  constructor(lat, lon, alt) {
    this.lat = lat
    this.lon = lon
    this.alt = alt            // altitude in meters
  }
}

export class Vector3 {
  constructor(x, y, z) {
    this.x = x
    this.y = y
    this.z = z            // altitude in meters
  }
}

// Helper function to calculate the magnitude squared of a vector.
Vector3.prototype.magnitudeSquared = function () {
  return this.x * this.x + this.y * this.y + this.z * this.z;
};

export function airDensityAtAltitude(a) {
  // Input in meters
  const c_4	= -3.957854E-19
  const c_3	= 6.657616E-14
  const c_2	= -3.47217E-09
  const c_1	= -8.61651E-05
  const c_0	= 2.16977E-01
  const airDensityAtAltitude = Math.exp(c_4 * a**4 + c_3 * a**3 + c_2 * a**2 + c_1 * a + c_0)
  return airDensityAtAltitude  // In kg/m^3
}

export function solveQuadratic(a, b, c) {
    var result1 = (-1 * b + Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a)
    var result2 = (-1 * b - Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a)
    return [result1, result2]
}

export class commonRingVariables {
  constructor(gravitationalConstant, massOfPlanet, radiusOfPlanet, ringFinalAltitude, equivalentLatitude, ringAmountRaisedFactor) {
    this.gravitationalConstant = gravitationalConstant
    this.massOfPlanet = massOfPlanet
    this.radiusOfPlanet = radiusOfPlanet
    this.ringFinalAltitude = ringFinalAltitude
    this.equivalentLatitude = equivalentLatitude
    this.ringAmountRaisedFactor = ringAmountRaisedFactor
    this.update()
  }

  update() {
    this.mainRingRadius = (this.radiusOfPlanet + this.ringFinalAltitude) * Math.cos(this.equivalentLatitude)
    this.constructionEquivalentLatitude = Math.acos(this.mainRingRadius / this.radiusOfPlanet)
    this.yf = (this.radiusOfPlanet + this.ringFinalAltitude) * Math.sin(this.equivalentLatitude)
    this.y0 = Math.sin(this.constructionEquivalentLatitude) * this.radiusOfPlanet
    this.yc = lerp(this.y0, this.yf, this.ringAmountRaisedFactor**2)
    this.currentEquivalentLatitude = Math.atan2(this.yc, this.mainRingRadius)
    this.currentMainRingAltitude = Math.sqrt(this.yc**2 + this.mainRingRadius**2) - this.radiusOfPlanet
  }
}

export class commonTetherVariables {
  constructor() {
    this.gravityForceAtRing = []
    this.tensileForceAtRing = []
    this.inertialForceAtRing = []
  }
}

export class elevatorCableVariables {
  constructor() {}
  update() {
    this.massRingSideTerminus = 0
    this.massElevatorCar = 0
    this.massElevatorCable = 0
    this.massAeronauticStabilizer = 0
    this.numAeronauticStabilizers = 4
    this.AdditionalTensioningForce = 0
    this.totalStaticLoad = 0 
  }
}
  
export class elevatorCarVariables {
  constructor(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv) {
    this.gravitationalConstant = gravitationalConstant
    this.massOfPlanet = massOfPlanet
    this.radiusOfPlanet = radiusOfPlanet
    this.dParamWithUnits = dParamWithUnits
    this.crv = crv
    this.update()
  }
  update() {
    // Not verified yet!!!
    this.waitTime = 30 // seconds - a bit short for people to disembark/embark but will suffice for now
    this.energyRequirementPerKg = (this.gravitationalConstant * 1 * this.massOfPlanet) * (1/this.radiusOfPlanet - 1/(this.radiusOfPlanet+this.crv.currentMainRingAltitude))
    this.batterySpecificEnergy = 265 // Wh/kg
    this.driveSystemEfficiency = 0.8
    this.batteryMassPerKg = this.energyRequirementPerKg / (this.batterySpecificEnergy * 3600 * this.driveSystemEfficiency)
    this.travelDistance = this.crv.currentMainRingAltitude + this.dParamWithUnits['transitTubeUpwardOffset'].value + this.dParamWithUnits['ringTerminusUpwardOffset'].value + this.dParamWithUnits['elevatorCarUpwardOffset'].value - this.dParamWithUnits['groundTerminusUpwardOffset'].value   // May need to subtract the altitude of the terestrial terminus
    this.maxAccelleration = this.dParamWithUnits['elevatorCarMaxAcceleration'].value
    this.maxSpeed = this.dParamWithUnits['elevatorCarMaxSpeed'].value
    this.accellerationTime = this.maxSpeed / this.maxAccelleration
    this.accellerationDistance = Math.min(this.travelDistance/2, 0.5 * this.maxAccelleration * this.accellerationTime**2)
    this.accellerationTime = Math.sqrt(2 * this.accellerationDistance / this.maxAccelleration)
    this.steadySpeedDistance = (this.crv.currentMainRingAltitude + this.dParamWithUnits['transitTubeUpwardOffset'].value) - 2*this.accellerationDistance
    this.steadySpeedTime = this.steadySpeedDistance / this.maxSpeed
    this.totalTravelTime = this.steadySpeedTime + 2 * this.accellerationTime
  }
}

export class accellerationElement {
  constructor(isDVOrA, valueDVOrA, t) {
    this.isDVOrA = isDVOrA
    this.valueDVOrA = valueDVOrA
    this.t = t
  }
}

class accellerationProfile {
  constructor() {
    this.accellerationProfile = []
  }

  addElement(elementType, elementValue, duration) {
    // elementType must be "D", "V", or "A"
    // elementValue must be m, m/s, or m/s2
    // duration is a value in seconds
    this.accellerationProfile.push(new accellerationElement(elementType, elementValue, duration))
  }

  getTotalTime() {
    let totalTime = 0
    for (let i = 0; i<this.accellerationProfile.length; i++) {
      totalTime += this.accellerationProfile[i].t
    }
    return totalTime
  }

  getDVAAtTime(t) {
    let d = 0
    let v = 0
    let a = 0
    let tStep
    let tPrev = 0
  
    for (let i = 0; i<this.accellerationProfile.length; i++) {
      tStep = Math.min(t - tPrev, this.accellerationProfile[i].t)
      if (this.accellerationProfile[i].isDVOrA=="D") {
        a = 0
        v = 0
        d = this.accellerationProfile[i].valueDVOrA
      }
      else {
        if (this.accellerationProfile[i].isDVOrA=="V") {
          a = 0
          v = this.accellerationProfile[i].valueDVOrA
          d += v * tStep
        }
        else {
          if (this.accellerationProfile[i].isDVOrA=="A") {
            a = this.accellerationProfile[i].valueDVOrA
            d += v * tStep + 0.5 * a * tStep**2
            v += a * tStep
          }
          else {
            // ToDo - we could add another term, jerk, for easing the accelleration
            consiole.assert("isDVOrA was not D, V, or A")
          }
        }
      }
      if (tStep<this.accellerationProfile[i].t) break
      tPrev += this.accellerationProfile[i].t
    }
    return [d, v, a]
  }

  getDistanceTraveledAtTime(t) {
    let d, v, a
    [d, v, a] = this.getDVAAtTime(t)
    return d
  }

  getSpeedAtTime(t) {
    let d, v, a
    [d, v, a] = this.getDVAAtTime(t)
    return v
  }
}

export class elevatorPositionCalculator {
  constructor(dParamWithUnits, crv, ecv) {
    this.accProfile = new accellerationProfile()
    this.accProfile.addElement("D", crv.currentMainRingAltitude, ecv.waitTime)
    this.accProfile.addElement("A", -ecv.maxAccelleration, ecv.accellerationTime)
    this.accProfile.addElement("V", -ecv.maxSpeed, ecv.steadySpeedTime)
    this.accProfile.addElement("A", ecv.maxAccelleration, ecv.accellerationTime)
    this.accProfile.addElement("D", dParamWithUnits['groundTerminusUpwardOffset'].value, ecv.waitTime)
    this.accProfile.addElement("A", ecv.maxAccelleration, ecv.accellerationTime)
    this.accProfile.addElement("V", ecv.maxSpeed, ecv.steadySpeedTime)
    this.accProfile.addElement("A", -ecv.maxAccelleration, ecv.accellerationTime)
    this.cycleTime = (ecv.totalTravelTime + ecv.waitTime) * 2  
    //console.log(ecv.totalTravelTime/60)
  }

  calculateElevatorPosition(t) {
    const tWithinCycle = t % this.cycleTime
    const elevatorPosition = this.accProfile.getDistanceTraveledAtTime(tWithinCycle)
    return elevatorPosition
  }
}

export class vehicleReferenceFrameTrackPositionCalculator {
  constructor(dParamWithUnits, mainRingCurve, crv) {
    this.accProfile = new accellerationProfile()
    const accellerationTime = dParamWithUnits['transitVehicleCruisingSpeed'].value / dParamWithUnits['transitVehicleMaxAcceleration'].value
    this.accProfile.addElement("V", 0, dParamWithUnits['transitVehicleStopDuration'].value)
    this.accProfile.addElement("A", dParamWithUnits['transitVehicleMaxAcceleration'].value, accellerationTime)
    this.accProfile.addElement("V", dParamWithUnits['transitVehicleCruisingSpeed'].value, dParamWithUnits['transitVehicleMergeTime'].value)
    this.accProfile.addElement("V", dParamWithUnits['transitVehicleCruisingSpeed'].value, dParamWithUnits['transitVehicleMergeTime'].value)
    this.accProfile.addElement("A", -dParamWithUnits['transitVehicleMaxAcceleration'].value, accellerationTime)
    this.cycleTime = this.accProfile.getTotalTime()
    this.cycleDistance = this.accProfile.getDistanceTraveledAtTime(this.cycleTime)

    // Calculate the lenngth of the transit track (future-proofed method used here does not assume that the curve is a near-perfect circle)
    let l = 0
    let P
    let prevP = null
    const transitVehicleRelativePosition_r = offset_r(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
    const transitVehicleRelativePosition_y = offset_y(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
    for (let i = 0; i<=8192; i++) {
      const trackPosition = i/8192
      const P = mainRingCurve.getPointAt(trackPosition)
      // ToDo - need to add the track's upward and outward offsets from the mainRing's curve
      P.x += transitVehicleRelativePosition_r * Math.cos(trackPosition)
      P.y += transitVehicleRelativePosition_y
      P.z += transitVehicleRelativePosition_r * Math.sin(trackPosition)

      if (prevP) {
        l += prevP.distanceTo(P)
      }
      prevP = P
    }
    this.transitTubeCircumference = l
  }

  calcTrackPosition(t) {
    const tAtCycleStart = Math.floor(t/this.cycleTime)
    const tWithinCycle = t % this.cycleTime
    const trackPosition = ( (tAtCycleStart * this.cycleDistance + this.accProfile.getDistanceTraveledAtTime(tWithinCycle)) / this.transitTubeCircumference ) % 1
    return trackPosition
  }

  calcTrackSpeed(t) {
    const tAtCycleStart = Math.floor(t/this.cycleTime)
    const tWithinCycle = t % this.cycleTime
    const trackSpeed = this.accProfile.getSpeedAtTime(tWithinCycle)
    return trackSpeed
  }

}

export class transitVehicleVariables {
  constructor(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv) {
    this.gravitationalConstant = gravitationalConstant
    this.massOfPlanet = massOfPlanet
    this.radiusOfPlanet = radiusOfPlanet
    this.dParamWithUnits = dParamWithUnits
    this.crv = crv
    this.update()
  }
  update() {
    // Not verified yet!!!
    this.waitTime = 20 // seconds - a bit short for people to disembark/embark but will suffice for now
  }  
}

export function getTransitVehiclePosition(dParamWithUnits, crv, ecv, t) {
  return t*1100   // m/s
}

export function xyz2lla(x,y,z) {
  // Function to convert ECEF (xyz) to lat-lon-altitude (llh)
  //convert cartesian coordinate into geographic coordinate
  //ellipsoid definition: WGS84
  //   a = 6,378,137m
  //   f = 1/298.257

  // Input
  //   x: coordinate X meters
  //   y: coordinate y meters
  //   z: coordinate z meters
  // Output
  //   lat: latitude rad
  //   lon: longitude rad
  //   h: height meters
  // '''

  // Note that z is toward the north pole in the ECEF coordinate system, and x is toward the equator below Greenwich
  const ECEF_x = z
  const ECEF_y = x
  const ECEF_z = y
  const equitorialRadiusOfEarth = 6378137.0
  const flattening = 0 // 1.0 / 298.257223563
  // --- derived constants
  const b = equitorialRadiusOfEarth - flattening*equitorialRadiusOfEarth
  const e = Math.sqrt(Math.pow(equitorialRadiusOfEarth,2.0)-Math.pow(b,2.0))/equitorialRadiusOfEarth
  const clambda = Math.atan2(ECEF_y,ECEF_x)
  const p = Math.sqrt(Math.pow(ECEF_x,2.0)+Math.pow(ECEF_y,2))
  let h_old = 0.0
  // first guess with h=0 meters
  let theta = Math.atan2(z,p*(1.0-Math.pow(e,2.0)))
  let cs = Math.cos(theta)
  let sn = Math.sin(theta)
  let N = Math.pow(equitorialRadiusOfEarth,2.0)/Math.sqrt(Math.pow(equitorialRadiusOfEarth*cs,2.0)+Math.pow(b*sn,2.0))
  let h = p/cs - N
  while (Math.abs(h-h_old) > 1.0e-6) {
      h_old = h
      theta = Math.atan2(ECEF_z,p*(1.0-Math.pow(e,2.0)*N/(N+h)))
      cs = Math.cos(theta)
      sn = Math.sin(theta)
      N = Math.pow(equitorialRadiusOfEarth,2.0)/Math.sqrt(Math.pow(equitorialRadiusOfEarth*cs,2.0)+Math.pow(b*sn,2.0))
      h = p/cs - N
  }
  const lla = new latLonAlt(theta * 180 / Math.PI, clambda * 180 / Math.PI, h)
  //llh = {'lon':clambda, 'lat':theta, 'height': h}
  return lla
}

export function lla2xyz(lat, lon, alt) {
  
  // Function to convert lat-lon-altitude (llh) to three.js model xyz

  const equitorialRadiusOfEarth = 6378137.0
  const flattening = 0// 1.0 / 298.257223563

  const cosLat = Math.cos(lat * Math.PI / 180)
  const sinLat = Math.sin(lat * Math.PI / 180)

  const cosLong = Math.cos(lon * Math.PI / 180)
  const sinLong = Math.sin(lon * Math.PI / 180)

  const c = 1 / Math.sqrt(cosLat * cosLat + (1 - flattening) * (1 - flattening) * sinLat * sinLat)
  const s = (1 - flattening) * (1 - flattening) * c

  const ECEF_x = (equitorialRadiusOfEarth*c + alt) * cosLat * cosLong
  const ECEF_y = (equitorialRadiusOfEarth*c + alt) * cosLat * sinLong
  const ECEF_z = (equitorialRadiusOfEarth*s + alt) * sinLat

  // The coordinate system used in the 3D model is different then the ECEF coordinate system 
  const z = ECEF_x
  const x = ECEF_y
  const y = ECEF_z

  return new Vector3(x, y, z)

}

export function habitatDesign(dParamWithUnits, specs, genSpecs, habitatFloorspace, numFloors, floorToCeilingSpacing, floorThickness) {
  // Assums that within the habitat's "bubble", there is a "roof level" and "basement level" that are not included in the habitat floorspace.
  // Roof can be used for plants, and as a garden. Basement can be used for equipment and storage.
  // Floorspace is only included when it extends from floor to ceiling, so some floorspace near the bubble wall may not qualify.  
  let h = []

  // Create an array containing the heights of all the floors and ceilings (that is, the vertical coordinate for the top and bottom of each partion)
  for (let i = 0; i<=numFloors; i++) {
    const j = numFloors / 2 - Math.floor(i/2)
    const k = (numFloors+1) / 2 - Math.floor((i+1)/2)
    h[i] = j * floorToCeilingSpacing + k * floorThickness
    h[numFloors*2 + 1 - i] = -h[i]
  }

  // The following code should work for 1 to 4 floors inclusive...
  // habitatFloorspace = (2 * (habitatBubbleInnerRadius**2 - h[1]**2) + 2 * (habitatBubbleInnerRadius**2 - h[3]**2)) * Math.PI 
  // habitatFloorspace = (2 * habitatBubbleInnerRadius**2 + 2 * habitatBubbleInnerRadius**2 - 2 * h[1]**2 - 1 * h[3]**2) * Math.PI 
  // habitatFloorspace = (numFloors * habitatBubbleInnerRadius**2 - 2 * h[1]**2 - 2 * h[3]**2) * Math.PI 
  // habitatFloorspace / Math.PI = numFloors * habitatBubbleInnerRadius**2 - 2 * h[1]**2 - 2 * h[3]**2 
  // (habitatFloorspace / Math.PI + 2 * h[1]**2 + 2 * h[3]**2) = numFloors * habitatBubbleInnerRadius**2 
  // (habitatFloorspace / Math.PI + 2 * h[1]**2 + 2 * h[3]**2) / numFloors = habitatBubbleInnerRadius**2 
  const n1 = Math.floor(numFloors / 2)
  const n2 = numFloors - n1
  const habitatBubbleInnerRadius = Math.sqrt((habitatFloorspace / Math.PI + n1 * h[1]**2 + n2 * h[3]**2) / numFloors )

  if (genSpecs) {
    const habitatBubbleInteriorVolume = 4 / 3 * Math.PI * habitatBubbleInnerRadius**3
    const habitatBubbleMaterialTensileStrength = dParamWithUnits['habitatBubbleMaterialTensileStrength'].value * 1000000
    const habitatBubbleMaterialDensity = dParamWithUnits['habitatBubbleMaterialDensity'].value
    const habitatBubbleMaterialEngineeringFactor = dParamWithUnits['habitatBubbleMaterialEngineeringFactor'].value
    const habitatBubbleMaterialCost = dParamWithUnits['habitatBubbleMaterialCost'].value
    const altitude = dParamWithUnits['ringFinalAltitude'].value
    const airDensityAtAltitude = tram.airDensityAtAltitude(altitude)
    const idealGasConstant = dParamWithUnits['idealGasConstant'].value
    const temperatureAtAltitue = 272  // K
    const airPressureAtRingAltitude = idealGasConstant * airDensityAtAltitude * temperatureAtAltitue
    const habitatAirPressure = dParamWithUnits['habitatAirPressure'].value
    const habitatAirPressureDifference = habitatAirPressure - airPressureAtRingAltitude
    const habitatAirPressureStress = habitatAirPressureDifference * Math.PI * habitatBubbleInnerRadius**2
    // Math.PI * ((habitatBubbleInnerRadius+habitatBubbleThickness)**2 - habitatBubbleInnerRadius**2) * habitatBubbleMaterialTensileStrength / habitatBubbleMaterialEngineeringFactor = Math.PI * (habitatAirPressure * habitatBubbleInnerRadius**2 - airPressureAtRingAltitude * (habitatBubbleInnerRadius+habitatBubbleThickness)**2)
    // ((habitatBubbleInnerRadius+habitatBubbleThickness)**2 - habitatBubbleInnerRadius**2) * habitatBubbleMaterialTensileStrength / habitatBubbleMaterialEngineeringFactor = (habitatAirPressure * habitatBubbleInnerRadius**2 - airPressureAtRingAltitude * (habitatBubbleInnerRadius+habitatBubbleThickness)**2)
    // ((ir+t)**2 - ir**2) * TS / EF = Pinside * ir**2 - Poutside * (ir+t)**2
    // (ir**2 + 2*ir*t + t**2 - ir**2) * TS / EF = Pinside * ir**2 - Poutside * (ir**2 + 2*ir*t + t**2)
    // (2*ir*t + t**2) * TS / EF                 = Pinside * ir**2 - Poutside*ir**2 - 2*Poutside*ir*t - Poutside*t**2
    // 0 = (Pinside - Poutside) * ir**2 + (-2*ir*TS/EF - 2*Poutside*ir)*t + (-TS/EF - Poutside)*t**2
    // c = (Pinside - Poutside) * ir**2
    // b = -2*ir*TS/EF - 2*Poutside*ir
    // a = -TS/EF - Poutside
    const a = -habitatBubbleMaterialTensileStrength/habitatBubbleMaterialEngineeringFactor - airPressureAtRingAltitude
    const b = -2*habitatBubbleInnerRadius*habitatBubbleMaterialTensileStrength/habitatBubbleMaterialEngineeringFactor - 2*airPressureAtRingAltitude*habitatBubbleInnerRadius
    const c = (habitatAirPressure - airPressureAtRingAltitude) * habitatBubbleInnerRadius**2
    const result = tram.solveQuadratic(a, b, c)
    const habitatBubbleThickness = Math.max(result[0], result[1])
    const habitatBubbleWallVolume = Math.PI * 4 / 3 * ((habitatBubbleInnerRadius + habitatBubbleThickness)**3 - habitatBubbleInnerRadius**3)
    const habitatBubbleMass = habitatBubbleWallVolume * habitatBubbleMaterialDensity
    const habitatBubbleCost = habitatBubbleMass * habitatBubbleMaterialCost
    let capitalCostPerKgSupported
    if (capitalCostPerKgSupported in specs) {
      capitalCostPerKgSupported = specs['capitalCostPerKgSupported'].value
    }
    else {
      console.log("Error: Value not yet calculated. Assuming 100.")
      capitalCostPerKgSupported = 100
    }
    const habitatBubbleCostWithLiftCost = habitatBubbleCost + capitalCostPerKgSupported * habitatBubbleMass
    const habitatBubbleCostPerSquareMeter = habitatBubbleCostWithLiftCost / habitatFloorspace

    // Used for checking math...
    const habitatBubbleMaterialTensileStress = habitatAirPressureStress / (Math.PI * 2 * habitatBubbleInnerRadius * habitatBubbleThickness) 

    specs['habitatBubbleInnerRadius'] = {value: habitatBubbleInnerRadius, units: "m"}
    specs['habitatBubbleThickness'] = {value: habitatBubbleThickness, units: "m"}
    specs['habitatFloorspace'] = {value: habitatFloorspace, units: "m2"}
    specs['habitatBubbleInteriorVolume'] = {value: habitatBubbleInteriorVolume, units: "m3"}
    specs['habitatAirPressureDifference'] = {value: habitatAirPressureDifference, units: "m"}
    specs['habitatBubbleMaterialEngineeringFactor'] = {value: habitatBubbleMaterialEngineeringFactor, units: "m"}
    specs['habitatBubbleMaterialTensileStress'] = {value: habitatBubbleMaterialTensileStress, units: "m"}
    specs['airPressureAtRingAltitude'] = {value: airPressureAtRingAltitude, units: "m"}
    specs['habitatAirPressure'] = {value: habitatAirPressure, units: "m"}
    specs['habitatBubbleMass'] = {value: habitatBubbleMass, units: "m"}
    specs['habitatBubbleCost'] = {value: habitatBubbleCost, units: "m"}
    specs['habitatBubbleCostWithLiftCost'] = {value: habitatBubbleCostWithLiftCost, units: "m"}
    specs['habitatBubbleCostPerSquareMeter'] = {value: habitatBubbleCostPerSquareMeter, units: "m"}
  }

  const habitatDesignParameters = {
    'numFloors': numFloors,
    'floorToCeilingSpacing': floorToCeilingSpacing,
    'floorThickness': floorThickness,
    'habitatBubbleInnerRadius': habitatBubbleInnerRadius,
    'heightArray': h,
  }
  return habitatDesignParameters
}

export function generateHabitatMeshes(dParamWithUnits, specs, genSpecs) {
  const habitatFloorspace = 325  // m2
  const numFloors = 2
  const floorToCeilingSpacing = 3.15 // m
  const floorThickness = 0.2 // m
  const habitatDesignParameters = habitatDesign(dParamWithUnits, specs, genSpecs, habitatFloorspace, numFloors, floorToCeilingSpacing, floorThickness)
  //console.log(habitatDesignParameters)

  const habitatMeshes = new THREE.Group()
  // Add a sphere
  const habitatBubbleGeometry = new THREE.SphereGeometry(habitatDesignParameters['habitatBubbleInnerRadius'], 64, 32)
  const habitatBubbleMaterial = new THREE.MeshPhongMaterial({
    //roughness: 1,
    //metalness: 0,
    // blending: THREE.CustomBlending,
    // blendEquation: THREE.AddEquation, //default
    // blendSrc: THREE.SrcAlphaFactor, //default
    // blendDst: THREE.OneMinusSrcAlphaFactor, //default
    //blendSrcAlpha: 0.1,
    color: 0x302070,
    transparent: true,
    opacity: 0.5
  })
  const tempBubbleMesh = new THREE.Mesh(habitatBubbleGeometry, habitatBubbleMaterial)
  tempBubbleMesh.name = "habitatBubble"
  tempBubbleMesh.position.set(dParamWithUnits['habitatOutwardOffset'].value, dParamWithUnits['habitatUpwardOffset'].value, dParamWithUnits['habitatForwardOffset'].value)
  habitatMeshes.add(tempBubbleMesh)

  const stairwellGeometry = new THREE.CylinderGeometry(1, 1, 1.2 * habitatDesignParameters['habitatBubbleInnerRadius'], 32, 1, true, 0, Math.PI * 1.8)
  const stairwellMaterial = new THREE.MeshLambertMaterial({color: 0xc0c0c0, transparent: false})
  stairwellMaterial.side = THREE.DoubleSide
  const tempStairwellMesh = new THREE.Mesh(stairwellGeometry, stairwellMaterial)
  tempStairwellMesh.rotation.y = Math.PI * 1.1
  tempStairwellMesh.name = "stairwell"
  tempStairwellMesh.position.set(dParamWithUnits['habitatOutwardOffset'].value, dParamWithUnits['habitatUpwardOffset'].value, dParamWithUnits['habitatForwardOffset'].value)
  habitatMeshes.add(tempStairwellMesh)

  // Add tapered cylinders for each floor
  const floorMaterial = new THREE.MeshLambertMaterial({color: 0x878681, transparent: false})
  const ir = habitatDesignParameters['habitatBubbleInnerRadius']
  const h = habitatDesignParameters['heightArray']
  //console.log(h, ir, h.length)
  let floorSpace = 0
  for (let i = 0; i<h.length; i+=2) {
    const r0 = Math.sqrt(ir**2 - h[i+0]**2)
    const r1 = Math.sqrt(ir**2 - h[i+1]**2)
    //console.log(r0, r1)
    const floorGeometry = new THREE.CylinderGeometry(r0, r1, floorThickness, 32, 1)
    const tempFloorMesh = new THREE.Mesh(floorGeometry, floorMaterial)
    tempFloorMesh.position.set(dParamWithUnits['habitatOutwardOffset'].value, dParamWithUnits['habitatUpwardOffset'].value + (h[i+0] + h[i+1]) / 2, dParamWithUnits['habitatForwardOffset'].value)
    tempFloorMesh.name = 'floor' + (h.length/2 - i/2)
    tempFloorMesh.userData = {'upwardOffset': (h[i+0] + h[i+1]) / 2}
    habitatMeshes.add(tempFloorMesh)
    if (i>0) floorSpace += Math.PI * r0**2
  }
  //console.log(floorSpace)
  return habitatMeshes
}

export function makeOffsetCurve(outwardOffset, upwardOffset, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments) {
  // Create a curve to represent the path we want the tube to take
  console.assert(lengthSegments % 2 == 0, "lengthSegments must be even")
  const tubePoints = []
  const dr = tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
  const dy = tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
  for (let i = -lengthSegments/2; i<=lengthSegments/2; i++) {
    const modelsTrackPosition = (segmentNumber + i/lengthSegments)/totalSegments
    const pointOnRingCurve = mainRingCurve.getPoint(modelsTrackPosition)
    const angle = 2 * Math.PI * modelsTrackPosition
    tubePoints.push( new THREE.Vector3(pointOnRingCurve.x + dr * Math.cos(angle), pointOnRingCurve.y + dy, pointOnRingCurve.z + dr * Math.sin(angle)) )
  }
  const refPoint = tubePoints[lengthSegments/2].clone()
  tubePoints.forEach(point => {point.sub(refPoint)})
  return new THREE.CatmullRomCurve3(tubePoints)
}

export function updateLauncherSpecs(dParamWithUnits, crv, launcher, specs) {

  // Launcher Design Length
  const launcherMassDriverForwardAcceleration = dParamWithUnits['launcherMassDriverForwardAcceleration'].value
  const launcherMassDriverExitVelocity = dParamWithUnits['launcherMassDriverExitVelocity'].value
  //console.log('launcherMassDriverExitVelocity', launcherMassDriverExitVelocity)

  specs['launcherMassDriverLength'] = {value: launcher.launcherMassDriverLength, units: "m"}
  //console.log('launcherMassDriverLength', launcher.launcherMassDriverLength)

  specs['timeWithinMassDriver'] = {value: launcher.timeWithinMassDriver, units: "s"}
  //console.log('timeWithinMassDriver', launcher.timeWithinMassDriver)
  
  const timeWithinMassDriverMinutes = launcher.timeWithinMassDriver / 60
  specs['timeWithinMassDriverMinutes'] = {value: timeWithinMassDriverMinutes, units: "minutes"}
  //console.log('timeWithinMassDriverMinutes', timeWithinMassDriverMinutes)

  const launcherScrewRadius = dParamWithUnits['launcherScrewRadius'].value // m
  const launcherScrewToothRadius = dParamWithUnits['launcherScrewToothRadius'].value // m
  const launcherScrewRotationRate = dParamWithUnits['launcherScrewRotationRate'].value // rad/s
  const launcherScrewToothCircumference = 2 * Math.PI * launcherScrewToothRadius
  const launcherScrewToothSpeed = launcherScrewToothCircumference * launcherScrewRotationRate
  //console.log('launcherScrewToothSpeed', launcherScrewToothSpeed)
  specs['launcherScrewToothSpeed'] = {value: launcherScrewToothSpeed, units: "m/s"}
  // The GE-90 has a fan diameter of 3124 mm and a rotational speed of 3475 RPM. Their circumferential velocity is d·π·57.917 = 568 m/s
  const GE90TurboFanDiameter = 3.124 // m
  const GE90TurboFanRotationRate = 3475 // RPM
  const GE90TurboFanCircumferentialVelocity = GE90TurboFanDiameter * Math.PI * GE90TurboFanRotationRate / 60
  specs['GE90TurboFanCircumferentialVelocity'] = {value: GE90TurboFanCircumferentialVelocity, units: "m/s"}
  //console.log('GE90TurboFanCircumferentialVelocity', GE90TurboFanCircumferentialVelocity)
  
  const launcherScrewThreadPitchAtExit = launcherMassDriverExitVelocity / launcherScrewToothSpeed
  //console.log('launcherScrewThreadPitchAtExit', launcherScrewThreadPitchAtExit)
  //const launchSledBodyLength = dParamWithUnits['launchSledBodyLength'].value // m
  const launchVehicleRadius = dParamWithUnits['launchVehicleRadius'].value // m

  // Launcher Propellant Mass Calculation
  const vehicleCrossSectionalArea = Math.PI * launchVehicleRadius*2
  const launchVehicleCoefficientOfDrag = dParamWithUnits['launchVehicleCoefficientOfDrag'].value // Coefficient of drag for hypersonic vehicle witha very pointy nose.
  const launchVehicleRocketExhaustVelocity = dParamWithUnits['launchVehicleSeaLevelRocketExhaustVelocity'].value // m/s
  const launcherMassDriverAltitude = dParamWithUnits['launcherMassDriverAltitude'].value // m
  const launcherMassDriverExitAngleInDegrees = 0 // dParamWithUnits['launcherMassDriverExitAngleInDegrees'].value * 180 / Math.PI
  console.log('Error: Unfinished Code')  // ToDo: These calculations need to be updated
  const launcherMassDriverExitAngleInRadians = launcherMassDriverExitAngleInDegrees * Math.PI / 180
  const R0 = new THREE.Vector2(0, crv.radiusOfPlanet + launcherMassDriverAltitude)
  const V0 = new THREE.Vector2(
    launcherMassDriverExitVelocity * Math.cos(launcherMassDriverExitAngleInRadians),
    launcherMassDriverExitVelocity * Math.sin(launcherMassDriverExitAngleInRadians))
  const tStep = 0.125

  let propellantConsumed = 0 
  let lastVehiclePositionVector = new THREE.Vector2(R0.x, R0.y)
  let launcherSuspendedTubeLength = 0
  for (let t = 0; t < 100; t += tStep) {
    // Determine the altitude and velocity of the vehicle. 't' in this case represents the time relative to the initial conditions, R0_x, R0_y, V0_x, V0_y
    const RV = launcher.RV_from_R0V0andt(R0, V0, t)

    const vehiclePositionVector = new THREE.Vector2(RV.R.x, RV.R.y)
    const vehicleAltitude = vehiclePositionVector.length() - crv.radiusOfPlanet
    const vehicleDownrangeDistance = Math.atan2(vehiclePositionVector.x, vehiclePositionVector.y) * crv.radiusOfPlanet
    const vehicleVelocityVector = new THREE.Vector2(RV.V.x, RV.V.y)
    const vehicleUpwardAngleInDegrees = (Math.atan2(vehiclePositionVector.x, vehiclePositionVector.y) - (Math.atan2(vehicleVelocityVector.x, vehicleVelocityVector.y) - Math.PI/2)  ) * 180 / Math.PI
    const vehicleSpeed = vehicleVelocityVector.length()
    const airDensityAtCurrentAltitude = (vehicleAltitude > crv.currentMainRingAltitude) ? tram.airDensityAtAltitude(vehicleAltitude) : 0   // Probably should use a more accurate value for pressure of the vacuum inside the launch tube
    const launchVehicleAerodynamicDragForce = 0.5 * launchVehicleCoefficientOfDrag * airDensityAtCurrentAltitude * vehicleSpeed**2 * vehicleCrossSectionalArea
    const launchVehicleRocketFuelFlowRate = launchVehicleAerodynamicDragForce / launchVehicleRocketExhaustVelocity
    const thrustRS25 = 2279000  // N
    propellantConsumed += launchVehicleRocketFuelFlowRate * tStep
    if (vehicleAltitude <= crv.currentMainRingAltitude) {
      launcherSuspendedTubeLength += vehiclePositionVector.clone().sub(lastVehiclePositionVector).length()
      lastVehiclePositionVector.copy(vehiclePositionVector)     
    }
    if ((t%1==0) || ((vehicleAltitude>31000) && (vehicleAltitude<33000))) {
      //console.log(Math.atan2(vehicleVelocityVector.x, vehicleVelocityVector.y) - Math.PI/2, Math.atan2(vehiclePositionVector.x, vehiclePositionVector.y))
      //console.log(t, Math.round(vehicleAltitude/10)/100, Math.round(vehicleDownrangeDistance/1000)/100, vehicleUpwardAngleInDegrees, Math.round(vehicleSpeed/10)/100, Math.round(launchVehicleAerodynamicDragForce/1000)/100, Math.round(propellantConsumed)/100)
    }
  }
  specs['launcherSuspendedTubeLength'] = {value: launcherSuspendedTubeLength, units: "m"} 
  // End Launcher Propellant Mass Calculation

  const launchSledEmptyMass = dParamWithUnits['launchSledEmptyMass'].value // kg
  const launchVehicleEmptyMass = dParamWithUnits['launchVehicleEmptyMass'].value // kg
  const launchVehiclePropellantMass = dParamWithUnits['launchVehiclePropellantMass'].value // kg
  const launchVehiclePayloadMass = dParamWithUnits['launchVehiclePayloadMass'].value // kg
  const launchVehicleNonPayloadMass = dParamWithUnits['launchVehicleNonPayloadMass'].value // kg

  const launchSledAndVehicleTotalMass = launchSledEmptyMass + launchVehicleEmptyMass + launchVehiclePropellantMass + launchVehiclePayloadMass // kg
  //console.log('launchSledAndVehicleTotalMass', launchSledAndVehicleTotalMass)
  specs['launchSledAndVehicleTotalMass'] = {value: launchSledAndVehicleTotalMass, units: 'kg'}
  // Because most of the vehicle is needed to land at the destination, or because it is made from materials that we would need to ship anyway, we are classifying most of its mass as "mission payload", except for a small amount called "launchVehicleNonPayloadMass".
  // Propellant that is consumed during accent through the Earth's the atmosphere is not clasified as payload mass, but propelants reserved for maneuvering to and landing at the destination is.
  const launchVehicleClassifiedAsPayloadMass = (launchVehicleEmptyMass - launchVehicleNonPayloadMass) + (launchVehiclePropellantMass - propellantConsumed) + launchVehiclePayloadMass  // kg 
  specs['launchVehicleClassifiedAsPayloadMass'] = {value: launchVehicleClassifiedAsPayloadMass, units: 'kg'}

  // Per kg Propelant Costs
  // Fuel cost per kg calculation
  const liquidHydrogenCostPerKg = dParamWithUnits['liquidHydrogenCostPerKg'].value
  const liquidHeliumCostPerKg = dParamWithUnits['liquidHeliumCostPerKg'].value
  const liquidOxygenCostPerKg = dParamWithUnits['liquidOxygenCostPerKg'].value
  const massOfOneGallonOfLiquidHydrogen = 0.2679 // kg / Gallon http://www.uigi.com/h2_conv.html#:~:text=0.5906-,0.2679,-113.4
  const massOfOneGallonOfLiquidOxygen = 4.322 // kg / Gallon  http://www.uigi.com/o2_conv.html#:~:text=9.527-,4.322,-115.1
  const massOfHydrogen = 384071 * massOfOneGallonOfLiquidHydrogen
  const massOfOxygen = 141750 * massOfOneGallonOfLiquidOxygen
  const propellantCostPerKgOfPropellant = (massOfHydrogen * liquidHydrogenCostPerKg + massOfOxygen * liquidOxygenCostPerKg) / (massOfHydrogen + massOfOxygen)
  specs['propellantCostPerKgOfPropellant'] = {value: propellantCostPerKgOfPropellant, units: 'USD'}
  const propellantCostPerKgOfPayload = propellantCostPerKgOfPropellant * propellantConsumed / launchVehicleClassifiedAsPayloadMass
  specs['propellantCostPerKgOfPayload'] = {value: propellantCostPerKgOfPayload, units: 'USD'}
  
  //const launchVehiclePropellantMassFlowRate = dParamWithUnits['launchVehiclePropellantMassFlowRate'].value // kg/s
  const launchSledDriveForce = launchSledAndVehicleTotalMass * launcherMassDriverForwardAcceleration
  //console.log('launchSledDriveForce', launchSledDriveForce)
  specs['launchSledDriveForce'] = {value: launchSledDriveForce, units: 'N'}
  const numScrews = 2  // 2 counter-rotating screws per launch tube
  const launchSledSidewaysForceAtExit = launchSledDriveForce * launcherScrewThreadPitchAtExit / numScrews
  specs['launchSledSidewaysForceAtExit'] = {value: launchSledSidewaysForceAtExit, units: 'N'}
  //console.log('launchSledSidewaysForceAtExit', launchSledSidewaysForceAtExit)
  const tensileStrengthOfCarbonFiberStrut = 3500000000 // Pa
  const crossSectionalAreaOfCarbonFiberStrut = launchSledSidewaysForceAtExit / tensileStrengthOfCarbonFiberStrut
  const diameterOfCarbonFiberStrut = 2 * Math.sqrt(crossSectionalAreaOfCarbonFiberStrut/Math.PI)
  specs['diameterOfCarbonFiberStrut'] = {value: diameterOfCarbonFiberStrut, units: 'm'}
  //console.log('diameterOfCarbonFiberStrut', diameterOfCarbonFiberStrut)

  const permeabilityOfFreeSpace = dParamWithUnits['permeabilityOfFreeSpace'].value // H/m
  const launchSledAMBMaxMagneticFluxDensity = dParamWithUnits['launchSledAMBMaxMagneticFluxDensity'].value // T 
  const launchSledAMBMagneticFluxDensityPortion = dParamWithUnits['launchSledAMBMagneticFluxDensityPortion'].value // T 
  const launchSledAMBAverageMagneticFluxDensity = launchSledAMBMaxMagneticFluxDensity * launchSledAMBMagneticFluxDensityPortion
  specs['launchSledAMBAverageMagneticFluxDensity'] = {value: launchSledAMBAverageMagneticFluxDensity, units: 'T'}
  //console.log('launchSledAMBAverageMagneticFluxDensity', launchSledAMBAverageMagneticFluxDensity)

  const launchVehicleAreaOfAirgap = launchSledSidewaysForceAtExit * permeabilityOfFreeSpace / launchSledAMBAverageMagneticFluxDensity**2
  specs['launchVehicleAreaOfAirgap'] = {value: launchVehicleAreaOfAirgap, units: 'm^2'}
  //console.log('launchVehicleAreaOfAirgap', launchVehicleAreaOfAirgap)

  const launcherScrewToothContactPatchWidth = dParamWithUnits['launcherScrewToothContactPatchWidth'].value // m
  const launcherScrewToothContactPatchLength = launchVehicleAreaOfAirgap / launcherScrewToothContactPatchWidth
  specs['launcherScrewToothContactPatchLength'] = {value: launcherScrewToothContactPatchLength, units: 'm'}
  //console.log('launcherScrewToothContactPatchLength', launcherScrewToothContactPatchLength)

  const threadTurnsOverCouplingPatchLength = launcherScrewToothContactPatchLength / launcherScrewThreadPitchAtExit / (2 * launcherScrewToothRadius * Math.PI)
  specs['threadTurnsOverCouplingPatchLength'] = {value: threadTurnsOverCouplingPatchLength, units: 'turns'}
  //console.log('threadTurnsOverCouplingPatchLength', threadTurnsOverCouplingPatchLength)

  const launchSledBodyLength = launcherScrewToothContactPatchLength

  const launchSledSidewaysForcePerMeterOfScrewAtExit = launchSledSidewaysForceAtExit / launchSledBodyLength
  specs['launchSledSidewaysForcePerMeterOfScrewAtExit'] = {value: launchSledSidewaysForcePerMeterOfScrewAtExit, units: 'N'}
  //console.log('launchSledSidewaysForcePerMeterOfScrewAtExit', launchSledSidewaysForcePerMeterOfScrewAtExit)

  // The flywheelDecelerationTime is the time that the vehicle's body is adjacent to the flywheel
  const flywheelDecelerationTimeAtExit = launchSledBodyLength / launcherMassDriverExitVelocity
  specs['flywheelDecelerationTimeAtExit'] = {value: flywheelDecelerationTimeAtExit, units: 's'}
  //console.log('flywheelDecelerationTimeAtExit', flywheelDecelerationTimeAtExit)

  //const launcherFlywheelMassPerMeter = dParamWithUnits['launcherFlywheelMassPerMeter'].value // kg/m
  const launcherFlywheelRadius = dParamWithUnits['launcherFlywheelRadius'].value // m  (This is the distance to the center of the rim, probably would be better to use moments of inertia here...)
  const launcherFlywheelThickness = dParamWithUnits['launcherFlywheelThickness'].value // kg/m
  const launcherFlywheelDensity = dParamWithUnits['launcherFlywheelDensity'].value // kg/m
  const launcherFlywheelMassPerMeter = 2 * Math.PI * launcherFlywheelRadius * launcherFlywheelThickness * launcherFlywheelDensity
  // ToDo: this math could be improved by using more accurate formulas for flywheel engineering
  specs['launcherFlywheelMassPerMeter'] = {value: launcherFlywheelMassPerMeter, units: 'kg/m'}
  //console.log('launcherFlywheelMassPerMeter', launcherFlywheelMassPerMeter)
  const flywheelToThreadRadiusRatio = launcherFlywheelRadius / launcherScrewToothRadius
  const flywheelDecelerationRateAtExit = launchSledSidewaysForcePerMeterOfScrewAtExit / flywheelToThreadRadiusRatio / launcherFlywheelMassPerMeter  // m/s^2
  specs['flywheelDecelerationRateAtExit'] = {value: flywheelDecelerationRateAtExit, units: 'm/s2'}
  //console.log('flywheelDecelerationRateAtExit', flywheelDecelerationRateAtExit)
    
  const flywheelInitialRelativeRimSpeed = flywheelDecelerationRateAtExit * flywheelDecelerationTimeAtExit
  specs['flywheelInitialRelativeRimSpeed'] = {value: flywheelInitialRelativeRimSpeed, units: 'm/s'}
  //console.log('flywheelInitialRelativeRimSpeed', flywheelInitialRelativeRimSpeed)

  const flywheelInitialRelativeRotationRate = flywheelInitialRelativeRimSpeed / (2 * launcherFlywheelRadius * Math.PI)
  specs['flywheelInitialRelativeRotationRate'] = {value: flywheelInitialRelativeRotationRate, units: 's-1'}
  //console.log('flywheelInitialRelativeRotationRate', flywheelInitialRelativeRotationRate)

  const flywheelFinalAbsoluteRimSpeed = launcherScrewToothSpeed / launcherScrewToothRadius * launcherFlywheelRadius
  const flywheelInitialAbsoluteRimSpeed = flywheelFinalAbsoluteRimSpeed + flywheelInitialRelativeRimSpeed
  const flywheelKineticEnergyChangePerMeterOfScrewAtExit = 0.5 * launcherFlywheelMassPerMeter * (flywheelInitialAbsoluteRimSpeed**2 - flywheelFinalAbsoluteRimSpeed**2)
  //console.log('flywheelKineticEnergyChangePerMeterOfScrewAtExit', flywheelKineticEnergyChangePerMeterOfScrewAtExit)
  specs['flywheelKineticEnergyChangePerMeterOfScrewAtExit'] = {value:flywheelKineticEnergyChangePerMeterOfScrewAtExit, units: 'J'}
  
  // Eddy Current Power Losses in the twin screw launcher
  const peakMagneticField = launchSledAMBAverageMagneticFluxDensity * 2
  const thicknessOfSheet = 0.0001  // m
  const frequencyOfField = launcherMassDriverExitVelocity / launchSledBodyLength  // Hz (assumes that the linear Bearing is continuous and its length equals the launch vehicle's body length)
  const constantK = 1
  const materialResistivity = 4.6e-7  // Ohm*m, for Grain-oriented electrical steel rom https://www.thoughtco.com/table-of-electrical-resistivity-conductivity-608499
  const materialDensity = 7650  // kg/m3
  const launcherEddyCurrentPowerLossesPerKg = 2 * (Math.PI * peakMagneticField * thicknessOfSheet * frequencyOfField)**2 / (6 * constantK * materialResistivity * materialDensity)
  specs['launcherEddyCurrentPowerLossesPerKg'] = {value: launcherEddyCurrentPowerLossesPerKg, units: 'W'}
  //console.log('launcherEddyCurrentPowerLossesPerKg', launcherEddyCurrentPowerLossesPerKg)

  // Per kg Energy Costs
  const kineticEnergyPerKilogram = 0.5 * launcherMassDriverExitVelocity**2
  const launcherEfficiency = dParamWithUnits['launcherEfficiency'].value
  const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value
  const launcherEnergyCostPerKilogram = kineticEnergyPerKilogram * launchSledAndVehicleTotalMass * wholesaleCostOfElectricity / launchVehicleClassifiedAsPayloadMass / launcherEfficiency
  specs['launcherEnergyCostPerKilogram'] = {value: launcherEnergyCostPerKilogram, units: 'USD/kg'}
  //console.log('launcherEnergyCostPerKilogram', launcherEnergyCostPerKilogram)

  // Per kg Total Costs
  const launcherTotalCostPerKilogram = launcherEnergyCostPerKilogram + propellantCostPerKgOfPayload
  specs['launcherTotalCostPerKilogram'] = {value: launcherTotalCostPerKilogram, units: 'USD/kg'}
  //console.log('launcherTotalCostPerKilogram', launcherTotalCostPerKilogram)

  const costOfSteel = dParamWithUnits['costOfSteel'].value
  const costOfConcrete = dParamWithUnits['costOfConcrete'].value
  const costOfAluminum = dParamWithUnits['costOfAluminum'].value
  //const costOfCarbonFiber = dParamWithUnits['costOfCarbonFiber'].value
  const densityOfConcrete = dParamWithUnits['densityOfConcrete'].value

  const launcherMassDriverConcreteTubeInnerRadius = dParamWithUnits['launcherMassDriverConcreteTubeInnerRadius'].value // m
  const launcherMassDriverConcreteTubeOuterRadius = dParamWithUnits['launcherMassDriverConcreteTubeOuterRadius'].value // m
  const launcherMassDriverConcreteTubeJacketThickness = dParamWithUnits['launcherMassDriverConcreteTubeJacketThickness'].value // m
  const launcherMassDriverScrewThreadRadius = dParamWithUnits['launcherMassDriverScrewThreadRadius'].value // m
  const launcherMassDriverScrewShaftOuterRadius = dParamWithUnits['launcherMassDriverScrewShaftOuterRadius'].value // m
  const launcherMassDriverScrewShaftInnerRadius = dParamWithUnits['launcherMassDriverScrewShaftInnerRadius'].value // m
  const launcherMassDriverScrewThreadThickness = dParamWithUnits['launcherMassDriverScrewThreadThickness'].value // m
  const launcherMassDriverScrewThreadStarts = dParamWithUnits['launcherMassDriverScrewThreadStarts'].value // m
  const launcherConcreteTubeJacketMassPerMeter = Math.PI * launcherMassDriverConcreteTubeOuterRadius * launcherMassDriverConcreteTubeJacketThickness
  const launcherBracketsMassPerMeter = dParamWithUnits['launcherBracketsMassPerMeter'].value // kg/m
  const launcherRailsMassPerMeter = dParamWithUnits['launcherRailsMassPerMeter'].value // kg/m
  const launcherScrewsMassPerMeter = 
    (launcherMassDriverScrewThreadRadius - launcherMassDriverScrewShaftOuterRadius) * launcherMassDriverScrewThreadThickness * launcherMassDriverScrewThreadStarts
    + Math.PI * (launcherMassDriverScrewShaftOuterRadius**2 - (launcherMassDriverScrewShaftInnerRadius)**2)
  const launcherTorqueConvertorsMassPerMeter = dParamWithUnits['launcherTorqueConvertorsMassPerMeter'].value // kg/m
  const launcherMotorMass = dParamWithUnits['launcherMotorMass'].value // kg/m
  const launcherMotorCost = dParamWithUnits['launcherMotorCost'].value // kg/m
  const launcherMotorsPerMeter = dParamWithUnits['launcherMotorsPerMeter'].value
  const launcherVacuumPumpMass = dParamWithUnits['launcherVacuumPumpMass'].value // kg/m
  const launcherVacuumPumpCost = dParamWithUnits['launcherVacuumPumpCost'].value // kg/m
  const launcherVacuumPumpsPerMeter = dParamWithUnits['launcherVacuumPumpsPerMeter'].value
  const launcherConcreteTubeVolumePerMeter = Math.PI * (launcherMassDriverConcreteTubeOuterRadius**2 - launcherMassDriverConcreteTubeInnerRadius**2)


  // Mass Driver Steel Mass
  const launcherMassDriverSteelMassPerMeter = launcherConcreteTubeJacketMassPerMeter + launcherBracketsMassPerMeter + launcherRailsMassPerMeter + launcherScrewsMassPerMeter + launcherTorqueConvertorsMassPerMeter
  const launcherMassDriverSteelCost = launcherConcreteTubeVolumePerMeter * costOfSteel * launcher.launcherMassDriverLength
  specs['launcherMassDriverSteelCost'] = {value: launcherMassDriverSteelCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverSteelCost', launcherMassDriverSteelCost/1e6, 'M USD')

  // Mass Driver Motors
  const launcherMassDriverMotorsCost = launcherMotorCost * launcherMotorsPerMeter * launcher.launcherMassDriverLength
  specs['launcherMassDriverMotorsCost'] = {value: launcherMassDriverMotorsCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverMotorsCost', launcherMassDriverMotorsCost/1e6, 'M USD')

  // Mass Driver Vacuum Pumps
  const launcherMassDriverVacuumPumpsCost = launcherVacuumPumpCost * launcherVacuumPumpsPerMeter * launcher.launcherMassDriverLength
  specs['launcherMassDriverVacuumPumpsCost'] = {value: launcherMassDriverVacuumPumpsCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverVacuumPumpsCost', launcherMassDriverVacuumPumpsCost/1e6, 'M USD')

  // Mass Driver Concrete Tube
  const launcherMassDriverConcreteTubeVolume = launcherConcreteTubeVolumePerMeter * launcher.launcherMassDriverLength
  const launcherMassDriverConcreteTubeMass = launcherMassDriverConcreteTubeVolume * densityOfConcrete
  const launcherMassDriverConcreteTubeCost = launcherMassDriverConcreteTubeMass * costOfConcrete
  specs['launcherMassDriverConcreteTubeCost'] = {value: launcherMassDriverConcreteTubeCost/1e6, units: 'M USD'}
  //console.log('launcherMassDriverConcreteTubeCost', launcherMassDriverConcreteTubeCost/1e6, 'M USD')

  // Ramp Steel Mass
  const launcherRampSteelMassPerMeter = launcherConcreteTubeJacketMassPerMeter + launcherBracketsMassPerMeter + launcherRailsMassPerMeter
  const launcherRampSteelCost = launcherRampSteelMassPerMeter * costOfSteel * launcher.launcherRampLength
  specs['launcherRampSteelCost'] = {value: launcherRampSteelCost/1e6, units: 'M USD'}
  //console.log('launcherRampSteelCost', launcherRampSteelCost/1e6, 'M USD')

  // Ramp Vacuum Pumps
  const launcherRampVacuumPumpsCost = launcherVacuumPumpCost * launcherVacuumPumpsPerMeter * launcher.launcherRampLength
  specs['launcherRampVacuumPumpsCost'] = {value: launcherRampVacuumPumpsCost/1e6, units: 'M USD'}
  //console.log('launcherRampVacuumPumpsCost', launcherRampVacuumPumpsCost/1e6, 'M USD')

  // Ramp Concrete Tube
  const launcherRampConcreteTubeVolume = launcherConcreteTubeVolumePerMeter * launcher.launcherRampLength
  const launcherRampConcreteTubeMass = launcherRampConcreteTubeVolume * densityOfConcrete
  const launcherRampConcreteTubeCost = launcherRampConcreteTubeMass * costOfConcrete
  specs['launcherRampConcreteTubeCost'] = {value: launcherRampConcreteTubeCost/1e6, units: 'M USD'}
  //console.log('launcherRampConcreteTubeCost', launcherRampConcreteTubeCost/1e6, 'M USD')

  // Suspended Evacuated Tube
  const launcherSuspendedTubeMassPerMeter = dParamWithUnits['launcherSuspendedTubeMassPerMeter'].value // kg/m
  const capitalCostPerKgSupported = (specs.hasOwnProperty('capitalCostPerKgSupported')) ? specs['capitalCostPerKgSupported'].value: dParamWithUnits['defaultcapitalCostPerKgSupported'].value
  //console.log('capitalCostPerKgSupported', capitalCostPerKgSupported)
  const launcherSuspendedTubeCost = launcherSuspendedTubeMassPerMeter * (costOfAluminum + capitalCostPerKgSupported) * launcher.launcherEvacuatedTubeLength
  specs['launcherSuspendedTubeCost'] = {value: launcherSuspendedTubeCost/1e6, units: 'M USD'}
  //console.log('launcherSuspendedTubeCost', launcherSuspendedTubeCost/1e6, 'M USD')

  // Suspended Evacuated Tube Vacuum Pumps
  const launcherEvacuatedTubeVacuumPumpsCost = launcherVacuumPumpCost * launcherVacuumPumpsPerMeter * launcher.launcherEvacuatedTubeLength

  const launcherFactoryCost = dParamWithUnits['launcherFactoryCost'].value
  specs['launcherFactoryCost'] = {value: launcherFactoryCost/1e6, units: 'M USD'}
  //console.log('launcherFactoryCost', launcherFactoryCost/1e6, 'M USD')

  const launcherSteelCost = launcherMassDriverSteelCost + launcherRampSteelCost
  const launcherMotorsCost = launcherMassDriverMotorsCost
  const launcherVacuumPumpsCost = launcherMassDriverVacuumPumpsCost + launcherRampVacuumPumpsCost + launcherEvacuatedTubeVacuumPumpsCost
  const launcherConcreteTubeCost = launcherMassDriverConcreteTubeCost + launcherRampConcreteTubeCost

  const launcherMassDriverCost = launcherMassDriverSteelCost + launcherMassDriverConcreteTubeCost + launcherMassDriverMotorsCost + launcherMassDriverVacuumPumpsCost
  const launcherRampCost = launcherRampSteelCost + launcherRampConcreteTubeCost + launcherRampVacuumPumpsCost
  const launcherEvacuatedTubeCost = launcherSuspendedTubeCost + launcherEvacuatedTubeVacuumPumpsCost
  //console.log('launcherMassDriverCost', launcherMassDriverCost/1e6, 'M USD')
  //console.log('launcherRampCost ', launcherRampCost/1e6, 'M USD')
  //console.log('launcherEvacuatedTubeCost', launcherEvacuatedTubeCost/1e6, 'M USD')

  const launcherTotalCost = launcherSteelCost + launcherMotorsCost + launcherVacuumPumpsCost + launcherConcreteTubeCost + launcherSuspendedTubeCost + launcherFactoryCost
  specs['launcherTotalCost'] = {value: launcherTotalCost/1e6, units: 'M USD'}
  //console.log('launcherTotalCost', launcherTotalCost/1e6, 'M USD')

}

export function updateMovingRingSpecs(dParamWithUnits, crv, specs) {

  // Eddy Current Power Losses in the Moving Rings
  if (!specs.hasOwnProperty('movingRingsSpeed')) {
    console.error('Error: movingRingSpeed not defined')
  }
  if (!specs.hasOwnProperty('ringMaglevCoreMassPerMeter')) {
    console.error('Error: ringMaglevCoreMassPerMeter not defined')
  }
  const movingRingSpeed = specs['movingRingsSpeed'].value // m/s
  const ringMaglevCoreMassPerMeter = specs['ringMaglevCoreMassPerMeter'].value // kg/m
  const movingRingNonuniformityLength = 1  // m - this means that the magnetic field is non-uniform over a length of 1 meter
  const movingRingAverageMagneticFieldVariation = 0.000005 // T  Assuming field uniformity is on average +/-5 ppm from nominal
  const movingRingNominalMagneticField = 0.1 // T 
  const peakMagneticField = movingRingAverageMagneticFieldVariation * movingRingNominalMagneticField
  const thicknessOfSheets = 0.001  // m
  const frequencyOfField = movingRingSpeed / movingRingNonuniformityLength  // Hz (assumes that the linear Bearing is continuous and its length equals the launch vehicle's body length)
  const constantK = 1  // This is constant for a thin sheet. We will assume that the core is laminated to reduce eddy current losses
  const materialResistivity = 4.6e-7  // Ohm*m, for Grain-oriented electrical steel rom https://www.thoughtco.com/table-of-electrical-resistivity-conductivity-608499
  const materialDensity = 7650  // kg/m3
  // From: https://en.wikipedia.org/wiki/Eddy_current
  const movingRingEddyCurrentPowerLossesPerKg = (Math.PI * peakMagneticField * thicknessOfSheets * frequencyOfField)**2 / (6 * constantK * materialResistivity * materialDensity)
  specs['movingRingEddyCurrentPowerLossesPerKg'] = {value: movingRingEddyCurrentPowerLossesPerKg, units: 'W'}
  // We'll assume that there is a primary magnet that pulls inwards and two half-mass secondary magnets that can activate and pull outwards to keep the moving ring centered
  const movingRingEddyCurrentPowerLossesPerMeter = movingRingEddyCurrentPowerLossesPerKg * ringMaglevCoreMassPerMeter * (1 + 0.5 + 0.5)
  specs['movingRingEddyCurrentPowerLossesPerMeter'] = {value: movingRingEddyCurrentPowerLossesPerMeter, units: 'W/m'}
  const ringCircumference = crv.mainRingRadius * 2 * Math.PI
  const movingRingEddyCurrentPowerLossesTotal = movingRingEddyCurrentPowerLossesPerMeter * ringCircumference
  specs['movingRingEddyCurrentPowerLossesTotal'] = {value: movingRingEddyCurrentPowerLossesTotal, units: 'W'}
}


export function updateTransitSystemSpecs(dParamWithUnits, crv, specs) {
  const metersPerKilometer = 1000
  const ringCircumference = crv.mainRingRadius * 2 * Math.PI
  const secondsPerYear = 3600 * 24 * 365
  const amortizationPeriod = 20
  //const secondsOfTimeOverAmortizationPeriod = secondsPerYear * amortizationPeriod
  const absoluteTemperatureInsideTransitTube = 273.3 + 100 // ˚K  (We're assuming here that the transit vehicles heat up the hydrogen in the tube to around 100˚C - ToDo: This is a wild-assed-guess)
  const absoluteTemperatureOutsideTransitTube = 273.3 - 40 // ˚K
  const molarMassOfAir = 0.02897 // kg/mol
  
  const capitalCostPerKgSupported = (specs.hasOwnProperty('capitalCostPerKgSupported')) ? specs['capitalCostPerKgSupported'].value: dParamWithUnits['defaultcapitalCostPerKgSupported'].value
  const operatingCostPerKgUniformStaticMassSupported = 0 // ToDo: Need to calculate this!!  = specs['operatingCostPerKgUniformStaticMassSupported'].value
  const operatingCostOfAeronaticThruster = 7.1e-7 //  USD/(N·s)
  const transitTubeTubeRadius = dParamWithUnits['transitTubeTubeRadius'].value
  const transitTubeTubeWallThickness = dParamWithUnits['transitTubeTubeWallThickness'].value
  const transitTubeTubeWallMaterialDensity = dParamWithUnits['transitTubeTubeWallMaterialDensity'].value // Todo - Random guess for something like mylar
  const transitTubeTubeSurfaceArea = 2 * Math.PI * transitTubeTubeRadius * ringCircumference
  const transitTubeTubeInteriorVolumePerMeter = Math.PI * (transitTubeTubeRadius - transitTubeTubeWallThickness)**2
  const transitTubeTubeInteriorVolume = transitTubeTubeInteriorVolumePerMeter * ringCircumference
  const transitTubeTubeWallVolumePerMeter = Math.PI * (transitTubeTubeRadius**2 - (transitTubeTubeRadius - transitTubeTubeWallThickness)**2)
  const transitTubeTubeWallVolume  = transitTubeTubeWallVolumePerMeter * ringCircumference
  const transitTubeTubeWallMassPerMeter = transitTubeTubeWallVolumePerMeter * transitTubeTubeWallMaterialDensity
  const transitTubeTubeWallMass = transitTubeTubeWallMassPerMeter * ringCircumference
  const transitTubeTubeWallMaterialCost = dParamWithUnits['transitTubeTubeWallMaterialCost'].value // USD/kg  // Vinal Resin 

  const transitTubeMassPerMeter = transitTubeTubeWallMassPerMeter + 0 // Add rails, stringers, etc. 
  const pressure = 3546 // Pa    ToDo - This needs to be a function of altitude
  const idealGasConstant = 8.31446261815324 // m3⋅Pa⋅K−1⋅mol−1
  const densityOfAir = pressure * molarMassOfAir / idealGasConstant / absoluteTemperatureOutsideTransitTube
  const overPressureFactor = 1.02

  let lightGasMolarMass
  let lightGasCostPerKg
  let lightGasMoleculeMass
  const lightGas = 'hydrogen'
  switch (lightGas) {
    case 'hydrogen':
      lightGasMolarMass = 0.002016 // kg/mol
      lightGasMoleculeMass = 3.32e-27 // kg
      lightGasCostPerKg = dParamWithUnits['liquidHydrogenCostPerKg'].value
      break
    case 'helium':
      lightGasMolarMass = 0.004 // kg/mol
      lightGasMoleculeMass = 6.6423e-27 // kg
      lightGasCostPerKg = dParamWithUnits['liquidHeliumCostPerKg'].value
      break
  }
  const lightGasDensity = pressure * overPressureFactor * lightGasMolarMass / idealGasConstant / absoluteTemperatureInsideTransitTube

  const buoyancyOfHydrogenInTubePerMeter = Math.PI * transitTubeTubeRadius**2 * (densityOfAir-lightGasDensity) // kg/m
  //console.log('buoyancyOfHydrogenInTubePerMeter', buoyancyOfHydrogenInTubePerMeter)
  specs['buoyancyOfHydrogenInTubePerMeter'] = {value: buoyancyOfHydrogenInTubePerMeter, units: 'kg/m'}

  const transitTerminusMassPerMeter = 30 // kg/m

  //console.log('transitTubeMassPerMeter', transitTubeMassPerMeter)
  let transitSystemUniformStaticMass = (transitTubeMassPerMeter - buoyancyOfHydrogenInTubePerMeter + transitTerminusMassPerMeter) * ringCircumference
  // Need to add the mass of the rails, brackets, and stringers...
  // Still need to add the masses of the elevators and terminuses...
  
  // Capital cost of supportting tubes
  // Operating cost of supportting tubes
  // Capital cost of supporting the aeronautic stabilizers
  // Operating cost of supporting the dynamic loads

  // Availible passenger kilometers and revenue passenger kilometers per year calculation
  const transitVehicleCruisingSpeed = dParamWithUnits['transitVehicleCruisingSpeed'].value
  const transitVehicleRadius = dParamWithUnits['transitVehicleRadius'].value
  const transitVehicleCrossSectionalArea = Math.PI * transitVehicleRadius**2
  const transitVehicleCoefficientOfDrag = dParamWithUnits['transitVehicleCoefficientOfDrag'].value
  const transitSystemEfficiencyAtCruisingSpeed = dParamWithUnits['transitSystemEfficiencyAtCruisingSpeed'].value

  const numExpressTracks = 2
  const minimumVehicleSpacing = 500 //m (just considering the express lanes)
  const maximumPassengersPerVehicle = 8
  const maxPassengersPerMeterOfRing = maximumPassengersPerVehicle * numExpressTracks / minimumVehicleSpacing
  const totalVehiclesInExpressLanes = ringCircumference * numExpressTracks / minimumVehicleSpacing
  // Need to account for the fact that the ring transit system doesn't take the most direct route
  const indirectRouteFactor = Math.sqrt(2) / (Math.PI/2) // Assumes that the average trip is one quarter of the way around the ring
  const availablePassengerKilometersPerYear = ringCircumference * indirectRouteFactor * maxPassengersPerMeterOfRing * transitVehicleCruisingSpeed * secondsPerYear / metersPerKilometer
  // ToDo: Add the number of passenger kilometers contributed by the collector lanes
  //console.log('availablePassengerKilometersPerYear', availablePassengerKilometersPerYear/1e9, 'B')
  specs['availablePassengerKilometersPerYear'] = {value: availablePassengerKilometersPerYear, units: 'km/year'}

  const numPassengersInTransitSystem = ringCircumference * maxPassengersPerMeterOfRing
  //console.log('numPassengersInTransitSystem', numPassengersInTransitSystem/1e6, 'M people')
  specs['numPassengersInTransitSystem'] = {value: numPassengersInTransitSystem, units: 'people'}
  // ToDo: Need to figure out if the elevators can keep up with this many passengers
  const totalAvailableMarket = 2e11 // revenue passenger km/year

  const revenuePassengerKilometersPerYear = Math.min(availablePassengerKilometersPerYear * 0.25, totalAvailableMarket)

  // ToDo: Check that this doesn't exeed the total availible market 

  const gamma = 7/5 // = 1.400 for diatomic gases (https://en.wikipedia.org/wiki/Speed_of_sound)
  const boltzmannConstant = 1.38e-23 // J/˚K
  const speedOfSoundInTube = Math.sqrt(gamma * boltzmannConstant * absoluteTemperatureInsideTransitTube / lightGasMoleculeMass)
  //console.log('speedOfSoundInTube', speedOfSoundInTube, 'm/s')
  specs['speedOfSoundInTube'] = {value: speedOfSoundInTube, units: 'm/s'}
  const speedOfSoundInTubeInKPH = speedOfSoundInTube * 3.6
  //console.log('speedOfSoundInTubeInKPH', speedOfSoundInTubeInKPH, 'm/s')
  specs['speedOfSoundInTubeInKPH'] = {value: speedOfSoundInTubeInKPH, units: 'm/s'}


  const lightGasLeakageRate = 0 // ToDo: Need to calculate this!!
  const ringTerminusCost = dParamWithUnits['ringTerminusCost'].value
  const elevatorCableCost = dParamWithUnits['elevatorCableCost'].value
  const elevatorCarCost = dParamWithUnits['elevatorCarCost'].value
  const groundTerminusCost = dParamWithUnits['groundTerminusCost'].value
  const numElevatorCables = dParamWithUnits['numElevatorCables'].value
  const costOfRingTerminuses = ringTerminusCost * numElevatorCables
  const costOfElevatorCables = elevatorCableCost * numElevatorCables
  const costOfElevatorCars = elevatorCarCost * numElevatorCables
  const costOfGroundTerminuses = groundTerminusCost * numElevatorCables

  //const averageVehicleSpacing = 500 //m (just considering the express lanes)
  //const averagePassengersPerVehicle = 16

  // transitTubeTubeSurfaceArea
  // transitTubeTubeInteriorVolume
  // transitTubeWallVolume

  let capitalCostOfTransitSystem = 0
  capitalCostOfTransitSystem += capitalCostPerKgSupported * transitSystemUniformStaticMass
  capitalCostOfTransitSystem += transitTubeTubeWallMass * transitTubeTubeWallMaterialCost
  capitalCostOfTransitSystem += transitTubeTubeInteriorVolume * lightGasDensity * lightGasCostPerKg
  capitalCostOfTransitSystem += costOfRingTerminuses
  capitalCostOfTransitSystem += costOfElevatorCables
  capitalCostOfTransitSystem += costOfElevatorCars
  capitalCostOfTransitSystem += costOfGroundTerminuses
  //console.log('capitalCostOfTransitSystem', capitalCostOfTransitSystem/1e9, 'B USD')
  specs['capitalCostOfTransitSystem'] = {value: capitalCostOfTransitSystem/1e9, units: 'B USD'}

  const capitalCostPerKmOfTransitSystem = capitalCostOfTransitSystem / ringCircumference * metersPerKilometer
  //console.log('capitalCostPerKmOfTransitSystem', capitalCostPerKmOfTransitSystem, 'USD/km')
  specs['capitalCostPerKmOfTransitSystem'] = {value: capitalCostPerKmOfTransitSystem, units: 'USD/km'}

  let operatingCostOfTransitSystem = 0
  operatingCostOfTransitSystem += operatingCostPerKgUniformStaticMassSupported * transitSystemUniformStaticMass   // cost of supporting the transit system
  operatingCostOfTransitSystem += transitTubeTubeSurfaceArea * lightGasLeakageRate * lightGasCostPerKg   // cost of replacing leaked gas
  //console.log('operatingCostOfTransitSystem', operatingCostOfTransitSystem/1e9, 'B USD / year')
  specs['operatingCostOfTransitSystem'] = {value: operatingCostOfTransitSystem/1e9, units: 'B USD / year'}

  const capitalCostPerAvailibleSeatKilometer = capitalCostOfTransitSystem / (availablePassengerKilometersPerYear * amortizationPeriod)
  //console.log('capitalCostPerAvailibleSeatKilometer', capitalCostPerAvailibleSeatKilometer)
  specs['capitalCostPerAvailibleSeatKilometer'] = {value: capitalCostPerAvailibleSeatKilometer, units: 'USD/km'}
  const capitalCostPerRevenuePassengerKilometer = transitSystemUniformStaticMass * capitalCostPerKgSupported / (revenuePassengerKilometersPerYear * amortizationPeriod)
  //console.log('capitalCostPerRevenuePassengerKilometer', capitalCostPerRevenuePassengerKilometer)
  specs['capitalCostPerRevenuePassengerKilometer'] = {value: capitalCostPerRevenuePassengerKilometer, units: 'USD/km'}

  // This is a very rough estimate of the power the vehicle uses just to overcome aerodynamic drag. It doesn't include accellerating, regenerative braking, levitation, and the operating cost of dynamic loading on the ring yet.
  const transitVehicleAerodynamicDragForce = 0.5 * transitVehicleCoefficientOfDrag * lightGasDensity * transitVehicleCruisingSpeed**2 * transitVehicleCrossSectionalArea
  const transitVehicleDrivePower = transitVehicleAerodynamicDragForce * transitVehicleCruisingSpeed / transitSystemEfficiencyAtCruisingSpeed

  // const operatingCostPerAvailibleSeatKilometer = 0 // TBD
  // const costPerAvailibleSeatKilometer = capitalCostPerAvailibleSeatKilometer + operatingCostPerAvailibleSeatKilometer
  // console.log('costPerAvailibleSeatKilometer', costPerAvailibleSeatKilometer)
  // specs['costPerAvailibleSeatKilometer'] = {value: costPerAvailibleSeatKilometer, units: 'USD/m'}

  // Cost per Available Seat Mile (CASK) calculation
  // FS stands for "Full-Service", LC stands for "Low-Cost", TR stands for "Tethered Ring"
  const CASK = []
  CASK['SeatsPerVehicle'] = []
  CASK['SeatsPerVehicle']['FS'] = {value: 156, units: 'seats/vehicle'}
  CASK['SeatsPerVehicle']['LC'] = {value: 180, units: 'seats/vehicle'}
  CASK['SeatsPerVehicle']['TR'] = {value: maximumPassengersPerVehicle, units: 'seats/vehicle'}
  CASK['TripLength'] = []
  CASK['TripLength']['FS'] = {value: 1280, units: 'seats/vehicle'}
  CASK['TripLength']['LC'] = {value: 1280, units: 'seats/vehicle'}
  CASK['TripLength']['TR'] = {value: 1280, units: 'seats/vehicle'}
  CASK['LoadFactor'] = []
  CASK['LoadFactor']['FS'] = {value: 0.65, units: 'seats/vehicle'}
  CASK['LoadFactor']['LC'] = {value: 0.85, units: 'seats/vehicle'}
  CASK['LoadFactor']['TR'] = {value: 0.5, units: 'seats/vehicle'}
  CASK['VehicleCost'] = []
  CASK['VehicleCost']['FS'] = {value: 340000, units: 'USD/month'}
  CASK['VehicleCost']['LC'] = {value: 195000, units: 'USD/month'}
  CASK['VehicleCost']['TR'] = {value: 50000, units: 'USD/month'}
  CASK['CorridorCapitalCost'] = []
  CASK['CorridorCapitalCost']['FS'] = {value: 0, units: 'USD/month'}
  CASK['CorridorCapitalCost']['LC'] = {value: 0, units: 'USD/month'}
  CASK['CorridorCapitalCost']['TR'] = {value: capitalCostOfTransitSystem, units: 'USD/month'}
  CASK['CorridorOperatingCost'] = []   // Includes costs for powering and maintain the coridor, but not the cost of powering or maintaining the vehicles
  CASK['CorridorOperatingCost']['FS'] = {value: 0, units: 'USD/month'}
  CASK['CorridorOperatingCost']['LC'] = {value: 0, units: 'USD/month'}
  CASK['CorridorOperatingCost']['TR'] = {value: operatingCostOfTransitSystem, units: 'USD/month'}
  CASK['OperatingTime'] = []
  CASK['OperatingTime']['FS'] = {value: 8, units: 'blockhours/day'}  // Need to figureout what the correct term is for the number of hours that the vehicle is actually carrying passengers (gate-to-gate time)
  CASK['OperatingTime']['LC'] = {value: 12, units: 'blockhours/day'}
  CASK['OperatingTime']['TR'] = {value: 23.5, units: 'blockhours/day'}  // formally esitmate or justify this
  CASK['KilometersPerBlockHour'] = []
  CASK['KilometersPerBlockHour']['FS'] = {value: 500, units: 'km/hour'}
  CASK['KilometersPerBlockHour']['LC'] = {value: 500, units: 'km/hour'}
  CASK['KilometersPerBlockHour']['TR'] = {value: 3500, units: 'km/hour'}
  CASK['Fuel'] = []
  CASK['Fuel']['FS'] = {value: 820, units: 'gallons/blockhour'}
  CASK['Fuel']['LC'] = {value: 800, units: 'gallons/blockhour'}
  CASK['Fuel']['TR'] = {value: 0, units: 'gallons/blockhour'}
  CASK['Electricity'] = []
  CASK['Electricity']['FS'] = {value: 0, units: 'J/blockhour'}
  CASK['Electricity']['LC'] = {value: 0, units: 'J/blockhour'}
  CASK['Electricity']['TR'] = {value: transitVehicleDrivePower * 3600, units: 'J/blockhour'}  // ToDo need to formally estimate this!!
  CASK['CarbonOffset'] = []
  CASK['CarbonOffset']['FS'] = {value: 82, units: 'J/blockhour'}  // ToDo: Need to estimate this based on the fuel used, etc.
  CASK['CarbonOffset']['LC'] = {value: 80, units: 'J/blockhour'}
  CASK['CarbonOffset']['TR'] = {value: 0, units: 'J/blockhour'} 
  CASK['Maintenance'] = []
  CASK['Maintenance']['FS'] = {value: 700, units: 'USD/blockhour'}
  CASK['Maintenance']['LC'] = {value: 600, units: 'USD/blockhour'}
  CASK['Maintenance']['TR'] = {value: 10, units: 'USD/blockhour'}  // ToDo need to formally estimate this!!
  CASK['CockpitCrewSalary'] = []
  CASK['CockpitCrewSalary']['FS'] = {value: 120000, units: 'USD/year'}
  CASK['CockpitCrewSalary']['LC'] = {value: 100000, units: 'USD/year'}
  CASK['CockpitCrewSalary']['TR'] = {value: 120000, units: 'USD/year'}  // N/A, No pilots
  CASK['CockpitCrewNumber'] = []
  CASK['CockpitCrewNumber']['FS'] = {value: 2, units: ''}
  CASK['CockpitCrewNumber']['LC'] = {value: 2, units: ''}
  CASK['CockpitCrewNumber']['TR'] = {value: 0, units: ''}
  CASK['CockpitCrewBenefitLoad'] = []
  CASK['CockpitCrewBenefitLoad']['FS'] = {value: 0.35, units: ''}
  CASK['CockpitCrewBenefitLoad']['LC'] = {value: 0.25, units: ''}
  CASK['CockpitCrewBenefitLoad']['TR'] = {value: 0.35, units: ''}
  CASK['CockpitCrewAnnualTraining'] = []
  CASK['CockpitCrewAnnualTraining']['FS'] = {value: 15000, units: 'USD/year'}
  CASK['CockpitCrewAnnualTraining']['LC'] = {value: 15000, units: 'USD/year'}
  CASK['CockpitCrewAnnualTraining']['TR'] = {value: 15000, units: 'USD/year'}
  CASK['CockpitCrewTimeSpentInFlight'] = []
  CASK['CockpitCrewTimeSpentInFlight']['FS'] = {value: 60, units: 'blockhours/month'}
  CASK['CockpitCrewTimeSpentInFlight']['LC'] = {value: 65, units: 'blockhours/month'}
  CASK['CockpitCrewTimeSpentInFlight']['TR'] = {value: 60, units: 'blockhours/month'} // N/A, No pilots
  CASK['CabinCrewSalary'] = []
  CASK['CabinCrewSalary']['FS'] = {value: 50000, units: 'USD/year'}
  CASK['CabinCrewSalary']['LC'] = {value: 40000, units: 'USD/year'}
  CASK['CabinCrewSalary']['TR'] = {value: 50000, units: 'USD/year'}
  CASK['CabinCrewBenefitLoad'] = []
  CASK['CabinCrewBenefitLoad']['FS'] = {value: 0.35, units: ''}
  CASK['CabinCrewBenefitLoad']['LC'] = {value: 0.25, units: ''}
  CASK['CabinCrewBenefitLoad']['TR'] = {value: 0.35, units: ''}
  CASK['CabinCrewNumber'] = []
  CASK['CabinCrewNumber']['FS'] = {value: 6, units: ''}
  CASK['CabinCrewNumber']['LC'] = {value: 4, units: ''}
  CASK['CabinCrewNumber']['TR'] = {value: 1, units: ''}
  CASK['CabinCrewTimeSpentInFlight'] = []
  CASK['CabinCrewTimeSpentInFlight']['FS'] = {value: 60, units: 'blockhours/month'}
  CASK['CabinCrewTimeSpentInFlight']['LC'] = {value: 65, units: 'blockhours/month'}
  CASK['CabinCrewTimeSpentInFlight']['TR'] = {value: 60, units: 'blockhours/month'} // Need to estimate how the crew will transfer from vehicle to vehicle
  CASK['CrewHotelAccomodations'] = []
  CASK['CrewHotelAccomodations']['FS'] = {value: 150, units: 'USD/crewmember/day'}
  CASK['CrewHotelAccomodations']['LC'] = {value: 0, units: 'USD/crewmember/day'}
  CASK['CrewHotelAccomodations']['TR'] = {value: 0, units: 'USD/crewmember/day'} // Need to estimate how the crew will transfer from vehicle to vehicle
  CASK['AirportNavTurnCosts'] = []
  CASK['AirportNavTurnCosts']['FS'] = {value: 2500, units: 'USD/turn'}
  CASK['AirportNavTurnCosts']['LC'] = {value: 2000, units: 'USD/turn'}
  CASK['AirportNavTurnCosts']['TR'] = {value: 0, units: 'USD/turn'} // Need to estimate how the crew will transfer from vehicle to vehicle
  CASK['AirportNavLegCosts'] = []
  CASK['AirportNavLegCosts']['FS'] = {value: 750, units: 'USD/leg'}
  CASK['AirportNavLegCosts']['LC'] = {value: 500, units: 'USD/leg'}
  CASK['AirportNavLegCosts']['TR'] = {value: 0, units: 'USD/leg'} // Need to estimate how the crew will transfer from vehicle to vehicle
  CASK['AirportNavHandlingCosts'] = []
  CASK['AirportNavHandlingCosts']['FS'] = {value: 5, units: 'USD/passenger'}
  CASK['AirportNavHandlingCosts']['LC'] = {value: 3.5, units: 'USD/passenger'}
  CASK['AirportNavHandlingCosts']['TR'] = {value: 0, units: 'USD/passenger'} // Need to estimate how the crew will transfer from vehicle to vehicle
  CASK['OnboardCosts'] = []
  CASK['OnboardCosts']['FS'] = {value: 5, units: 'USD/passenger'}
  CASK['OnboardCosts']['LC'] = {value: 1, units: 'USD/passenger'}
  CASK['OnboardCosts']['TR'] = {value: 0, units: 'USD/passenger'} // Need to estimate how the crew will transfer from vehicle to vehicle
  CASK['SalesAndDistribution'] = []
  CASK['SalesAndDistribution']['FS'] = {value: 15, units: 'USD/passenger'}
  CASK['SalesAndDistribution']['LC'] = {value: 5, units: 'USD/passenger'}
  CASK['SalesAndDistribution']['TR'] = {value: 0, units: 'USD/passenger'} // Need to estimate how the crew will transfer from vehicle to vehicle
  CASK['GeneralAndAdministrative'] = []
  CASK['GeneralAndAdministrative']['FS'] = {value: 10, units: 'USD/passenger'}
  CASK['GeneralAndAdministrative']['LC'] = {value: 5, units: 'USD/passenger'}
  CASK['GeneralAndAdministrative']['TR'] = {value: 0, units: 'USD/passenger'} // Need to estimate how the crew will transfer from vehicle to vehicle

  const monthsPerYear = 12
  const daysPerMonth = 30
  const jetFuelCostPerGallon = dParamWithUnits['jetFuelCostPerGallon'].value // USD/Gallon
  const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value
  const corridorAmortizationPeriod = 20
  // ToDo: Can we more accurately account for time spent taxiing, waiting, borading and disembarling, accellerating and decellerating, circling, etc.?
  // ToDo: Could be a bit confusing to add CASK values to some parameters and not others. Might want to come up with a better system.
  Object.entries(CASK['VehicleCost']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['SeatsPerVehicle'][k].value / CASK['KilometersPerBlockHour'][k].value / CASK['OperatingTime'][k].value / daysPerMonth
  })
  Object.entries(CASK['CorridorCapitalCost']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['SeatsPerVehicle'][k].value / totalVehiclesInExpressLanes / CASK['KilometersPerBlockHour'][k].value / CASK['OperatingTime'][k].value / daysPerMonth / monthsPerYear / corridorAmortizationPeriod
  })
  Object.entries(CASK['CorridorOperatingCost']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['SeatsPerVehicle'][k].value / totalVehiclesInExpressLanes / CASK['KilometersPerBlockHour'][k].value / CASK['OperatingTime'][k].value / daysPerMonth / monthsPerYear
  })
  Object.entries(CASK['Fuel']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['SeatsPerVehicle'][k].value / CASK['KilometersPerBlockHour'][k].value * jetFuelCostPerGallon
  })
  Object.entries(CASK['Electricity']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['SeatsPerVehicle'][k].value / CASK['KilometersPerBlockHour'][k].value * wholesaleCostOfElectricity
  })
  Object.entries(CASK['Maintenance']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['SeatsPerVehicle'][k].value / CASK['KilometersPerBlockHour'][k].value
  })
  Object.entries(CASK['CockpitCrewSalary']).forEach(([k, v]) => {
    v['CASK'] = v.value * CASK['CockpitCrewNumber'][k].value / monthsPerYear / CASK['CockpitCrewTimeSpentInFlight'][k].value / CASK['KilometersPerBlockHour'][k].value / CASK['SeatsPerVehicle'][k].value
  })
  Object.entries(CASK['CockpitCrewBenefitLoad']).forEach(([k, v]) => {
    v['CASK'] = v.value * CASK['CockpitCrewSalary'][k].value * CASK['CockpitCrewNumber'][k].value / monthsPerYear / CASK['CockpitCrewTimeSpentInFlight'][k].value / CASK['KilometersPerBlockHour'][k].value / CASK['SeatsPerVehicle'][k].value
  })
  Object.entries(CASK['CabinCrewSalary']).forEach(([k, v]) => {
    v['CASK'] = v.value * CASK['CabinCrewNumber'][k].value / monthsPerYear / CASK['CabinCrewTimeSpentInFlight'][k].value / CASK['KilometersPerBlockHour'][k].value / CASK['SeatsPerVehicle'][k].value
  })
  Object.entries(CASK['CabinCrewBenefitLoad']).forEach(([k, v]) => {
    v['CASK'] = v.value * CASK['CabinCrewSalary'][k].value * CASK['CabinCrewNumber'][k].value / monthsPerYear / CASK['CabinCrewTimeSpentInFlight'][k].value / CASK['KilometersPerBlockHour'][k].value / CASK['SeatsPerVehicle'][k].value
  })
  Object.entries(CASK['CrewHotelAccomodations']).forEach(([k, v]) => {
    v['CASK'] = v.value * (CASK['CockpitCrewNumber'][k].value + CASK['CabinCrewNumber'][k].value) / CASK['OperatingTime'][k].value / CASK['KilometersPerBlockHour'][k].value / CASK['SeatsPerVehicle'][k].value
  })
  Object.entries(CASK['AirportNavTurnCosts']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['TripLength'][k].value / CASK['SeatsPerVehicle'][k].value // ToDo: Is this the right formula?
  })
  Object.entries(CASK['AirportNavLegCosts']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['TripLength'][k].value / CASK['SeatsPerVehicle'][k].value  // ToDo: Is this the right formula?
  })
  Object.entries(CASK['AirportNavHandlingCosts']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['TripLength'][k].value
  })
  Object.entries(CASK['OnboardCosts']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['TripLength'][k].value
  })
  Object.entries(CASK['SalesAndDistribution']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['TripLength'][k].value
  })
  Object.entries(CASK['GeneralAndAdministrative']).forEach(([k, v]) => {
    v['CASK'] = v.value / CASK['TripLength'][k].value
  })

  Object.entries(CASK).forEach(([k, v]) => {
    let string = k
    let printThis = false
    Object.entries(v).forEach(([k2, v2]) => {
      if (v2.hasOwnProperty('CASK')) {
        v2['CASK'] = v2.CASK.toFixed(6)
        string += ' ' + v2['CASK']
        printThis = true
      }
    })
    if (printThis) {
      //console.log(string)
    }
  })

}

export function interplanetaryDeltaV() {
  const earthOrbitRadius = 1.4959787e11
  const marsOrbitRadius = (206650000 + 249261000) / 2
  const massOfTheSun = 1.989e30 // kg
  const velocityOfEarth = Math.sqrt(G * massOfTheSun / earthOrbitRadius) 
  const velocityOfMars = Math.sqrt(G * massOfTheSun / marsOrbitRadius)
  const deltaVAtEarth = Math.sqrt(G * massOfTheSun / earthOrbitRadius) * (Math.sqrt(2 * marsOrbitRadius / (earthOrbitRadius+marsOrbitRadius)) - 1)
  const deltaVAtMars = Math.sqrt(G * massOfTheSun / marsOrbitRadius) * (1 - Math.sqrt(2 * earthOrbitRadius / (earthOrbitRadius+marsOrbitRadius)))
}

export function adjustedTimeSinceStart(slowDownPassageOfTime, timeSinceStart) {
  return Math.max(0, timeSinceStart - 20) * slowDownPassageOfTime
}

export function findCircleSphereIntersections(circleCenter, circleNormal, circleRadius, sphereCenter, sphereRadius) {
  // Step 2: Find the intersection of the circle plane and the sphere (a circle on the sphere's surface).
  // Project the sphere center onto the circle plane.
  const circleCenterToSphereCenter = new THREE.Vector3(sphereCenter.x - circleCenter.x, sphereCenter.y - circleCenter.y, sphereCenter.z - circleCenter.z);
  const projectionLength = circleCenterToSphereCenter.x * circleNormal.x + circleCenterToSphereCenter.y * circleNormal.y + circleCenterToSphereCenter.z * circleNormal.z;
  if (Math.abs(projectionLength)>sphereRadius) {
    // Sphere too far away...
    return [];
  }
  else {
    const projection = new THREE.Vector3(circleNormal.x * projectionLength, circleNormal.y * projectionLength, circleNormal.z * projectionLength);
    const projectedSphereCenterOnCirclePlane = new THREE.Vector3(sphereCenter.x - projection.x, sphereCenter.y - projection.y, sphereCenter.z - projection.z);
    const radiusOfCircleOfIntercetion = Math.sin(Math.acos(projectionLength/sphereRadius)) * sphereRadius 

    let c1, r1, c2, r2
    if (circleRadius>=radiusOfCircleOfIntercetion) {
      c1 = projectedSphereCenterOnCirclePlane
      r1 = radiusOfCircleOfIntercetion
      c2 = circleCenter
      r2 = circleRadius
    }
    else {
      c1 = circleCenter
      r1 = circleRadius
      c2 = projectedSphereCenterOnCirclePlane
      r2 = radiusOfCircleOfIntercetion
    }
    const cdiff = c1.clone().sub(c2)
    const cdifflen = cdiff.length()
    if ((cdifflen+r1<=r2) || (cdifflen-r1>=r2)) {
      // Sphere too far away...
      return [];
    }
    else {
      const cdiffnorm = cdiff.clone().normalize() //unit vector
      const cdiffperp = cdiffnorm.clone().cross(circleNormal)
      const q = cdifflen**2 + r2**2 - r1**2
      const dx = 1/2 * q / cdifflen
      const dy = 1/2 * Math.sqrt(4 * cdifflen**2 * r2**2 - q**2) / cdifflen
      const dxvect = cdiffnorm.clone().multiplyScalar(dx)
      const dyvect = cdiffperp.clone().multiplyScalar(dy)
      const intersection1 = c2.clone().add(dxvect).add(dyvect)
      const intersection2 = c2.clone().add(dxvect).sub(dyvect)

      if (Number.isNaN(dy)) {
        console.log("Nan Error")
      }

      return [intersection1, intersection2];
    }
  }
}

export function getDodecahedronFaceCoordinates() {
  const phi = (1 + Math.sqrt(5)) / 2; // The golden ratio
  const a = 1;

  const vertices = [
    [0, a, phi * a],
    [0, -a, phi * a],
    [0, a, -phi * a],
    [0, -a, -phi * a],

    [a, phi * a, 0],
    [-a, phi * a, 0],
    [a, -phi * a, 0],
    [-a, -phi * a, 0],

    [phi * a, 0, a],
    [-phi * a, 0, a],
    [phi * a, 0, -a],
    [-phi * a, 0, -a]
  ];

  const faceCoordinates = vertices.map(vertex => ({
    lat: Math.atan2(vertex[2], Math.sqrt(vertex[0] * vertex[0] + vertex[1] * vertex[1])),
    lon: Math.atan2(vertex[1], vertex[0])
  }));

  return faceCoordinates;
}

