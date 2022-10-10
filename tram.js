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

export function airDensityAtRingAltitude(a) {
  const c_4	= -3.957854E-19
  const c_3	= 6.657616E-14
  const c_2	= -3.47217E-09
  const c_1	= -8.61651E-05
  const c_0	= 2.16977E-01
  const airDensityAtRingAltitude = Math.exp(c_4 * a**4 + c_3 * a**3 + c_2 * a**2 + c_1 * a + c_0)
  return airDensityAtRingAltitude
}

export function solveQuadratic(a, b, c) {
    var result1 = (-1 * b + Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a)
    var result2 = (-1 * b - Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a)
    return [result1, result2]
}

export function generateMainRingControlPoints(dParamWithUnits, crv, radiusOfPlanet, ringToPlanetRotation, planetCoordSys) {
  const controlPoints = []

  const e = dParamWithUnits['ringEccentricity'].value

  const centerOfRing = new THREE.Vector3(0, crv.yc, 0).applyQuaternion(ringToPlanetRotation)
  const lengthOfSiderealDay = 86160 // s
  const Ω = new THREE.Vector3(0, -2 * Math.PI / lengthOfSiderealDay, 0)

  for (let a = 0, i = 0; i<dParamWithUnits['numControlPoints'].value; a+=Math.PI*2/dParamWithUnits['numControlPoints'].value, i++) {
    const angleInRingCoordSys = Math.acos(crv.mainRingRadius / (radiusOfPlanet+crv.currentMainRingAltitude)) * Math.sqrt((e*Math.cos(a))**2 + (1/e*Math.sin(a))**2)
    const rInRingCoordSys = (radiusOfPlanet+crv.currentMainRingAltitude) * Math.cos(angleInRingCoordSys)
    const positionInRingCoordSys = new Vector3()
    positionInRingCoordSys.y = (radiusOfPlanet+crv.currentMainRingAltitude) * Math.sin(angleInRingCoordSys)
    positionInRingCoordSys.x = rInRingCoordSys * Math.cos(a)
    positionInRingCoordSys.z = rInRingCoordSys * Math.sin(a)
    controlPoints.push(new Vector3(positionInRingCoordSys.x, positionInRingCoordSys.y, positionInRingCoordSys.z))
  }
  return controlPoints
}

export class commonRingVariables {
  constructor(radiusOfPlanet, ringFinalAltitude, equivalentLatitude, ringAmountRaisedFactor) {
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
    this.waitTime = 20 // seconds - a bit short for people to disembark/embark but will suffice for now
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
    this.accProfile.addElement("V", dParamWithUnits['transitVehicleCruisingSpeed'].value, dParamWithUnits['transitVehicleMergeTime'].value)
    this.accProfile.addElement("A", -dParamWithUnits['transitVehicleMaxAcceleration'].value, accellerationTime)
    this.accProfile.addElement("V", 0, dParamWithUnits['transitVehicleStopDuration'].value)
    this.accProfile.addElement("A", dParamWithUnits['transitVehicleMaxAcceleration'].value, accellerationTime)
    this.accProfile.addElement("V", dParamWithUnits['transitVehicleCruisingSpeed'].value, dParamWithUnits['transitVehicleMergeTime'].value)
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
    const airDensityAtRingAltitude = tram.airDensityAtRingAltitude(altitude)
    const idealGasConstant = dParamWithUnits['idealGasConstant'].value
    const temperatureAtAltitue = 272  // K
    const airPressureAtRingAltitude = idealGasConstant * airDensityAtRingAltitude * temperatureAtAltitue
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
  const tubePoints = []
  // Create a curve to represent the path we want the tube to take
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
