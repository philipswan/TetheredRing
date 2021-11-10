// Tethered Ring Arcitectural Model (TRAM)

// Useful functions
export function lerp (start, end, amt) {
  return (1-amt)*start+amt*end
}

// Returns a "delta r" in the ring-centered cylindrical coordinate space relative to the middlemost main ring  
export function offset_r(outwardOffset, upwardOffset, currentEquivalentLatitude) {
  return outwardOffset * Math.sin(currentEquivalentLatitude) + upwardOffset * Math.cos(currentEquivalentLatitude)
}

// Returns a "delta y" in the ring-centered cylindrical coordinate space relative to the middlemost main ring  
export function offset_y(outwardOffset, upwardOffset, currentEquivalentLatitude) {
  return outwardOffset * -Math.cos(currentEquivalentLatitude) + upwardOffset * Math.sin(currentEquivalentLatitude)
}


export class CateneryVec3 {
  constructor(x, y, s) {
    this.x = x            // Distance from the origin (center of planet)
    this.y = y            // Angle from the ring's axis of symmetry
    this.s = s            // Distance along the catenery from the anchor point (Point B)
  }
}

export class CatenaryPolarVec3 {
  constructor(r, φ, s) {
    this.r = r            // Distance from the origin (center of planet)
    this.φ = φ            // Angle from the ring's axis of symmetry
    this.s = s            // Distance along the tether measured from x=0 on the catenary
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
    this.yc = lerp(this.y0, this.yf, this.ringAmountRaisedFactor)
    this.currentEquivalentLatitude = Math.atan2(this.yc, this.mainRingRadius)
    this.currentMainRingAltitude = Math.sqrt(this.yc**2 + this.mainRingRadius**2) - this.radiusOfPlanet
  }
}

export class elevatorCarVariables {
  constructor(gravitationalConstant, massOfPlanet, radiusOfPlanet, ringFinalAltitude, equivalentLatitude, ringAmountRaisedFactor, dParam, crv) {
    this.gravitationalConstant = gravitationalConstant
    this.massOfPlanet = massOfPlanet
    this.radiusOfPlanet = radiusOfPlanet
    this.ringFinalAltitude = ringFinalAltitude
    this.equivalentLatitude = equivalentLatitude
    this.ringAmountRaisedFactor = ringAmountRaisedFactor
    this.dParam = dParam
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
    this.travelDistance = this.crv.currentMainRingAltitude + this.dParam.transitTubeUpwardOffset    // May need to subtract the altitude of the terestrial terminus
    this.maxAccelleration = 2 // m/s2
    this.maxSpeed = 200 // m/s
    this.accellerationTime = this.maxSpeed / this.maxAccelleration
    this.accellerationDistance = Math.min(this.travelDistance/2, 0.5 * this.maxAccelleration * this.accellerationTime**2)
    this.accellerationTime = Math.sqrt(2 * this.accellerationDistance / this.maxAccelleration)
    this.steadySpeedDistance = (this.crv.currentMainRingAltitude + this.dParam.transitTubeUpwardOffset) - 2*this.accellerationDistance
    this.steadySpeedTime = this.steadySpeedDistance / this.maxSpeed
    this.totalTravelTime = this.steadySpeedTime + 2 * this.accellerationTime
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
  

export class accellerationElement {
  constructor(isDVOrA, valueDVOrA, t) {
    this.isDVOrA = isDVOrA
    this.valueDVOrA = valueDVOrA
    this.t = t
  }
}

export function getElevatorCarAltitude(dParam, crv, cev, t) {
  const cycleTime = (cev.totalTravelTime + cev.waitTime) * 2
  const tt = t % cycleTime

  const accellerationProfile = []
  accellerationProfile.push(new accellerationElement("D", crv.currentMainRingAltitude + dParam.transitTubeUpwardOffset, cev.waitTime))
  accellerationProfile.push(new accellerationElement("A", -cev.maxAccelleration, cev.accellerationTime))
  accellerationProfile.push(new accellerationElement("V", -cev.maxSpeed, cev.steadySpeedTime))
  accellerationProfile.push(new accellerationElement("A", cev.maxAccelleration, cev.accellerationTime))
  accellerationProfile.push(new accellerationElement("D", 0, cev.waitTime))
  accellerationProfile.push(new accellerationElement("A", cev.maxAccelleration, cev.accellerationTime))
  accellerationProfile.push(new accellerationElement("V", cev.maxSpeed, cev.steadySpeedTime))
  accellerationProfile.push(new accellerationElement("A", -cev.maxAccelleration, cev.accellerationTime))

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
