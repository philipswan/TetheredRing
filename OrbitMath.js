import * as THREE from 'three'
import { Vector2 } from 'three/src/math/Vector2.js'
import { Vector3 } from 'three/src/math/Vector3.js'

// The following functions were ported from 	// Equation 3.66c, http://www.nssc.ac.cn/wxzygx/weixin/201607/P020160718380095698873.pdf

export function define_stumpC () {
  return function (z) {
    let c

    if (z > 0) {
      c = (1 - Math.cos(Math.sqrt(z))) / z
    }
    else if (z < 0) {
      c = (Math.cosh(Math.sqrt(-z)) - 1) / (-z)
    }
    else {
      c = 1 / 2
    }
    return c
  }
}

export function define_stumpS() {
  return function (z) {

    let s

    if (z > 0) {
      const sqrtz = Math.sqrt(z)
      s = (sqrtz - Math.sin(sqrtz)) / Math.pow(sqrtz, 3)
    }
    else if (z < 0) {
      const sqrtmz = Math.sqrt(-z)
      s = (Math.sinh(sqrtmz) - sqrtmz) / Math.pow(sqrtmz, 3)
    }
    else {
      s = 1 / 6
    }
    return s
  }
}

export function define_f_and_g() {
  return function (x, t, ro, a) {
    const fg = new Vector2()

    const z = a * x**2
    //Equation 3.66a:
    const f = 1 - x**2 / ro * this.stumpC(z)
    //Equation 3.66b:
    const g = t - 1 / Math.sqrt(this.mu) * x*x*x * this.stumpS(z)
    return [f, g]
  }
}

export function define_fDot_and_gDot() {
  return function (x, r, ro, a) {
    const fdotgdot = new Vector2()

    const z = a * x**2
    // Equation 3.66c:
    const fdot = Math.sqrt(this.mu) / r / ro * (z*this.stumpS(z) - 1)*x
    // Equation 3.66d:
    const gdot = 1 - x**2 / r * this.stumpC(z)
    return [fdot, gdot]
  }
}

export function define_kepler_U() {
  return function (dt, ro, vro, a) {
    let C, S, F
    let dFdx

    // Set an error tolerance and a limit on the number of iterations
    const error = 1e-8
    const nMax = 1000
    // Starting value for x
    let x = Math.sqrt(this.mu)*Math.abs(a)*dt
    // Iterate on Equation 3.62 until convergence occurs within the error tolerance
    let n = 0
    let ratio = 1
    const sqrtMu = Math.sqrt(this.mu)
    const sqrtMuTimesDt = sqrtMu * dt
    const roTimesvroDivSqrtMu = ro * vro / sqrtMu
    const oneMinusATimesRo = 1 - a * ro

    while ((Math.abs(ratio) > error) && (n <= nMax)) {
      n = n + 1
      const xSqrd = x*x
      const aTimesXSqrd = a * xSqrd
      C = this.stumpC(aTimesXSqrd)
      S = this.stumpS(aTimesXSqrd)
      const xSqrdTimesC = xSqrd * C
      const xSqrdTimesS = xSqrd * S
      F = roTimesvroDivSqrtMu * xSqrdTimesC + oneMinusATimesRo * xSqrdTimesS * x + ro * x - sqrtMuTimesDt
      dFdx = roTimesvroDivSqrtMu * x * (1 - a * xSqrdTimesS) + oneMinusATimesRo * xSqrdTimesC + ro
      ratio = F / dFdx
      x = x - ratio
    }

    return x
  }
}

export function define_RV_from_R0V0Aandt() {
  return function (R0, V0, A, t) { // A = Acceleration vector

    const RV = {
      R: new Vector2(0, 0),
      V: new Vector2(0, 0)
    }

    // Compute magnitudes
    const r0 = R0.length()
    const v0 = V0.length()
    const vr0 = R0.dot(V0) / r0

    // Reciprocal of the semimajor axis (from the energy equation)
    const alpha = 2 / r0 - v0**2 / this.mu

    // Compute the universal anomaly
    const x = this.kepler_U(t, r0, vr0, alpha)

    // Compute the f and g functions
    let f, g
    [f, g] = this.f_and_g(x, t, r0, alpha)

    // Compute the final position vector (including acceleration contribution)
    RV.R = R0.clone().multiplyScalar(f)
             .add(V0.clone().multiplyScalar(g))
             .add(A.clone().multiplyScalar(0.5 * t**2)) // Acceleration term

    // Compute the magnitude of R
    const r = RV.R.length()

    // Compute the derivatives of f and g
    let fdot, gdot
    [fdot, gdot] = this.fDot_and_gDot(x, r, r0, alpha)

    // Compute the final velocity (including acceleration contribution)
    RV.V = R0.clone().multiplyScalar(fdot)
             .add(V0.clone().multiplyScalar(gdot))
             .add(A.clone().multiplyScalar(t)) // Acceleration term

    return RV
  }
}

export function define_orbitalElementsFromStateVector() {
  return function (R, V) {
    // This function computes the classical orbital elements (coe)
    // from the state vector (R,V) using Algorithm 4.1.

    // mu - gravitational parameter (kmˆ3/sˆ2)
    // R - position vector in the geocentric equatorial frame
    // (km)
    // V - velocity vector in the geocentric equatorial frame
    // (km)
    // r, v - the magnitudes of R and V
    // vr - radial velocity component (km/s)
    // H - the angular momentum vector (kmˆ2/s)
    // h - the magnitude of H (kmˆ2/s)
    // incl - inclination of the orbit (rad)
    // N - the node line vector (kmˆ2/s)
    // n - the magnitude of N
    // cp - cross product of N and R
    // RA - right ascension of the ascending node (rad)
    // E - eccentricity vector
    // e - eccentricity (magnitude of E)
    // eps - a small number below which the eccentricity is
    // considered to be zero
    // w - argument of perigee (rad)
    // TA - true anomaly (rad)
    // a - semimajor axis (km)
    // pi - 3.1415926...
    // coe - vector of orbital elements [h e RA incl w TA a]

    // User M-functions required: None
    const eps = 1.e-10
    const r = R.length()
    const v = V.length()
    const vr = R.clone().dot(V) / r
    const H = R.clone().cross(V)
    const h = H.length()

    // Equation 4.7:
    const incl = Math.acos(H.z/h)

    // Equation 4.8:
    const N = new Vector3(0, 0, 1).cross(H)
    const n = N.length()

    // Equation 4.9:
    let RA
    if (n != 0) {
      RA = Math.acos(N.x/n)
      if (N.z < 0) {
        RA = 2*Math.PI - RA
      }
    }
    else {
      RA = 0
    }

    // Equation 4.10:
    const E = R.clone().multiplyScalar((v**2 - this.mu/r)).sub(V.clone().multiplyScalar(r*vr)).multiplyScalar(1/this.mu)
    const e = E.length()

    // Equation 4.12 (incorporating the case e = 0):
    let w
    if (n != 0) {
      if (e > eps) {
        w = Math.acos(N.clone().dot(E)/n/e)
        if (E.z < 0) {
          w = 2*Math.PI - w
        }
      }
      else {
        w = 0
      }
    }
    else {
      w = 0
    }

    // Equation 4.13a (incorporating the case e = 0):
    let TA
    if (e > eps) {
      TA = Math.acos(E.clone().dot(R)/e/r)
      if (vr < 0) {
        TA = 2*Math.PI - TA
      }
    }
    else {
      const cp = N.clone().cross(R)
      if (cp.z >= 0) {
        TA = Math.acos(N.clone().dot(R)/n/r)
      }
      else {
        TA = 2*Math.PI - Math.acos(N.clone().dot(R)/n/r)
      }
    }

    // Equation 2.61 (a < 0 for a hyperbola):
    const a = h**2/this.mu/(1 - e**2)

    return {
      'angularMomentumVector': h,
      'eccentricity': e,
      'rightAscensionOfTheAscendingNode': RA,
      'inclination': incl,
      'argumentOfPerigee': w,
      'trueAnomaly': TA,
      'semimajorAxis': a
    }
  }
}

// This function doesn't work, but some of the conversions in it might be useful later...
// export function define_calculateTimeToApogeeFromOrbitalElements() {
//   return function (orbitalElements, mu) {
//     // Calculate the mean anomaly from the true anomaly, eccentricity, and argument of perigee.
//     const e = orbitalElements.eccentricity
//     const π = Math.PI
//     const a = orbitalElements.semimajorAxis
//     const eccentricAnomaly = Math.atan2(
//       Math.sqrt(1 - e**2) * Math.sin(orbitalElements.trueAnomaly),
//       e + Math.cos(orbitalElements.trueAnomaly))
//     const meanAnomaly = eccentricAnomaly - e * Math.sin(eccentricAnomaly)

//     // Calculate the time to apogee.
//     // const timeToApogee = Math.PI * orbitalElements.semimajorAxis ** 1.5 / Math.sqrt(1 - e ** 2) * (
//     //     meanAnomaly - e * Math.sin(meanAnomaly));

//     const timeToApogee1 = (π * a) / Math.sqrt(mu) * (1 - e**2)**(3/2) * (meanAnomaly - e * Math.sin(meanAnomaly))
//     const timeToApogee2 = (π * a) / Math.sqrt(mu) * (1 - e) * (1 + e) * Math.sqrt((1 - e) / (1 + e)) * (meanAnomaly - e * Math.sin(meanAnomaly))

//     console.log(orbitalElements.trueAnomaly, eccentricAnomaly, meanAnomaly, timeToApogee1, timeToApogee2)
//     return timeToApogee1;
//   }
// }

// export function define_getAltitudeDistanceAndVelocity() {
//   return function (currentTime) {
//     let ADAndV = {
//       Altitude: 0,
//       Distance: 0,
//       Velocity: 0
//     }

//     if (currentTime <= this.AccelerationTime) {
//       ADAndV.Altitude = this.LauncherAltitude
//       ADAndV.Distance = 0.5 * this.MaxGees * this.const_g * currentTime**2
//       ADAndV.Velocity = this.MaxGees * this.const_g * currentTime
//     }
//     else if (currentTime <= this.AccelerationTime + this.launchVehicleTimeWithinRamp) {
//       ADAndV.Altitude = Math.sqrt((this.planetRadius + this.LauncherAltitude + this.AllowableUpwardTurningRadius)**2 + this.AllowableUpwardTurningRadius**2 - 2 * (this.planetRadius + this.LauncherAltitude + this.AllowableUpwardTurningRadius)*this.AllowableUpwardTurningRadius*Math.cos(Math.max(0, currentTime - this.AccelerationTime)*this.EllipticalOrbitPerigeeVelocity / this.AllowableUpwardTurningRadius)) - this.planetRadius;
//       // ToDo: This is too rough and approximation
//       ADAndV.Distance = this.LauncherTrackLength + (currentTime - this.AccelerationTime) * this.EllipticalOrbitPerigeeVelocity
//       ADAndV.Velocity = this.EllipticalOrbitPerigeeVelocity
//     }
//     else if (currentTime <= this.TotalTimeInLaunchSystem) {
//       ADAndV.Altitude = Math.sqrt((this.planetRadius + this.Alt_Perigee - this.AllowableDownwardTurningRadius)**2 + this.AllowableDownwardTurningRadius**2 - 2 * (this.planetRadius + this.Alt_Perigee - this.AllowableDownwardTurningRadius)*this.AllowableDownwardTurningRadius*Math.cos(Math.PI + Math.min(0, currentTime - this.TotalTimeInLaunchSystem)*this.EllipticalOrbitPerigeeVelocity / this.AllowableDownwardTurningRadius)) - this.planetRadius
//       // ToDo: This is too rough and approximation
//       ADAndV.Distance = this.LauncherTrackLength + (currentTime - this.AccelerationTime) * this.EllipticalOrbitPerigeeVelocity
//       ADAndV.Velocity = this.EllipticalOrbitPerigeeVelocity
//     }
//     else {
//       const time = currentTime - this.TotalTimeInLaunchSystem
//       const R0 = new Vector2(0, (this.planetRadius + this.Alt_Perigee) / 1000)
//       const V0 = new Vector2(this.EllipticalOrbitPerigeeVelocity / 1000, 0)
//       // TBD - need to figure out the altitude while on the eliptical orbit's path

//       // Note: The distance units in the RV_from_R0V0Aandt function and its sub functions are km, not meters.
//       const RV = this.RV_from_R0V0Aandt(R0, V0, 0, time)

//       ADAndV.Altitude = RV.R.length() * 1000 - this.planetRadius
//       ADAndV.Distance = Math.atan2(RV.R.x, RV.R.y) * RV.R.length() * 1000 // ToDo: This assumes that angle at time zero is zero - possibly bad assumption/
//       ADAndV.Velocity = RV.V.length() * 1000
//     }
//     return ADAndV
//   }
// }

export function define_getAirDensity() {
  return function (Altitude) {
    let T, P
    if (Altitude < 11000.0) {
      T = 15.04 - 0.00649*Altitude
      P = 101.29 * Math.pow((T + 273.1) / 288.08, 5.256)
    }
    else if (Altitude < 25000.0) {
      T = -56.46
      P = 22.65*Math.exp(1.73 - 0.000157*Altitude)
    }
    else {
      T = -131.21 + 0.00299*Altitude
      P = 2.488*Math.pow((T + 273.1) / 216.6, -11.388)
    }
    const Density = P / (0.2869*(T + 273.1))

    return Density

    // Reference https://www.grc.nasa.gov/WWW/k-12/airplane/atmosmet.html
  }
}

