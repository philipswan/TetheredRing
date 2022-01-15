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
    this.crossSectionalArea = crossSectionalArea   // The cross-sectional area of a cable of constant stress, following this catenary curve
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
    this.travelDistance = this.crv.currentMainRingAltitude + this.dParamWithUnits['transitTubeUpwardOffset'].value    // May need to subtract the altitude of the terestrial terminus
    this.maxAccelleration = 2 // m/s2
    this.maxSpeed = 200 // m/s
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

export function getElevatorCarAltitude(dParamWithUnits, crv, ecv, t) {
  const cycleTime = (ecv.totalTravelTime + ecv.waitTime) * 2
  const tt = t % cycleTime

  const accellerationProfile = []
  accellerationProfile.push(new accellerationElement("D", crv.currentMainRingAltitude + dParamWithUnits['transitTubeUpwardOffset'].value, ecv.waitTime))
  accellerationProfile.push(new accellerationElement("A", -ecv.maxAccelleration, ecv.accellerationTime))
  accellerationProfile.push(new accellerationElement("V", -ecv.maxSpeed, ecv.steadySpeedTime))
  accellerationProfile.push(new accellerationElement("A", ecv.maxAccelleration, ecv.accellerationTime))
  accellerationProfile.push(new accellerationElement("D", 0, ecv.waitTime))
  accellerationProfile.push(new accellerationElement("A", ecv.maxAccelleration, ecv.accellerationTime))
  accellerationProfile.push(new accellerationElement("V", ecv.maxSpeed, ecv.steadySpeedTime))
  accellerationProfile.push(new accellerationElement("A", -ecv.maxAccelleration, ecv.accellerationTime))

  let totalT
  let d = 0
  let v = 0
  let a = 0
  let tStep
  let tPrev = 0

  totalT = 0
  for (let i = 0; i<accellerationProfile.length; i++) {
    totalT += accellerationProfile[i].t
  }
  t = t % totalT  // This is done to make the elevators repeat their movement profile ad infinitum 

  for (let i = 0; i<accellerationProfile.length; i++) {
    tStep = Math.min(t - tPrev, accellerationProfile[i].t)
    if (accellerationProfile[i].isDVOrA=="D") {
      a = 0
      v = 0
      d = accellerationProfile[i].valueDVOrA
    }
    else {
      if (accellerationProfile[i].isDVOrA=="V") {
        a = 0
        v = accellerationProfile[i].valueDVOrA
        d += v * tStep
      }
      else {
        if (accellerationProfile[i].isDVOrA=="A") {
          a = accellerationProfile[i].valueDVOrA
          d += v * tStep + 0.5 * a * tStep**2
          v += a * tStep
        }
        else {
          consiole.assert("isDVOrA was not D, V, or A")
        }
      }
    }
    if (tStep<accellerationProfile[i].t) break
    tPrev += accellerationProfile[i].t
  }
  return d

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