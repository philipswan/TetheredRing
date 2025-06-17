class RotorEngineering {
  constructor({
    rInner = 0.15,          // meters, cylinder inner radius
    rOuter = 0.5,           // meters, paddle outer tip radius
    tPaddleTip = 0.01,      // meters, paddle thickness at tip
    paddleWidth = 1,        // meters
    nPaddles = 8,           // number of paddles
    rho = 7850,             // kg/m^3, steel density
    sigmaMaragingSteel = 2400e6, // Pa
    engineeringFactor = 1.5 // safety factor
  }) {
    this.rInner = rInner
    this.rOuter = rOuter
    this.tPaddleTip = tPaddleTip
    this.paddleWidth = paddleWidth
    this.nPaddles = nPaddles
    this.rho = rho
    this.sigmaMaragingSteel = sigmaMaragingSteel
    this.engineeringFactor = engineeringFactor
    this.sigmaAllowable = this.sigmaMaragingSteel / this.engineeringFactor

    this.dr = 0.001 // meters (1 mm radial increments)
    this.omega = 0 // will be set after optimization
  }

  thickness(r) {
    if (r >= this.rOuter) return this.tPaddleTip
    return this.tPaddleTip * Math.pow(this.rOuter / r, 2)
  }

  selfHoopStress(r) {
    return this.rho * this.omega * this.omega * r * r
  }

  centrifugalForcePerPaddle(rBase) {
    const nRSteps = 100
    const drLocal = (this.rOuter - rBase) / nRSteps
    let totalForce = 0
    let t = this.tPaddleTip
    for (let i = 0; i < nRSteps; i++) {
      const r = rBase + (i / nRSteps) * (this.rOuter - rBase)
      const area = t * this.paddleWidth
      const dMass = this.rho * area * drLocal
      const dForce = dMass * r * this.omega * this.omega
      totalForce += dForce
      const tMin = totalForce / this.sigmaAllowable / this.paddleWidth
      t = Math.max(t, tMin)
    }
    const tBase = t
    const totalStress = totalForce / (t * this.paddleWidth)
    return { totalForce, totalStress, tBase }
  }

  computeCylinderWallThickness() {
    let rCurrent = this.rInner
    let cumulativePressureSupport = 0

    while (rCurrent < this.rOuter) {
      const { totalForce } = this.centrifugalForcePerPaddle(rCurrent)
      const totalForceAll = totalForce * this.nPaddles
      const circumference = 2 * Math.PI * rCurrent

      const pRequired = totalForceAll / (circumference * this.paddleWidth)

      const sigmaSelf = this.selfHoopStress(rCurrent)
      const sigmaMargin = this.sigmaAllowable - sigmaSelf

      if (sigmaMargin <= 0) {
        return NaN
      }

      const pSupport = (sigmaMargin * this.dr) / rCurrent

      cumulativePressureSupport += pSupport
      if (cumulativePressureSupport >= pRequired) {
        break
      }

      rCurrent += this.dr
    }

    const tCylinder = rCurrent - this.rInner
    return tCylinder
  }

  findMaxOmega() {
    let omegaLow = 0
    let omegaHigh = 100000
    const tolerance = 0.1
    let bestOmega = 0

    while (omegaHigh - omegaLow > tolerance) {
      const omegaMid = (omegaLow + omegaHigh) / 2
      if (this.isSafeOmega(omegaMid)) {
        bestOmega = omegaMid
        omegaLow = omegaMid
      } else {
        omegaHigh = omegaMid
      }
    }

    return bestOmega
  }

  isSafeOmega(testOmega) {
    let rCurrent = this.rInner
    let cumulativePressureSupport = 0

    while (rCurrent < this.rOuter) {
      const sigmaSelf = this.rho * testOmega * testOmega * rCurrent * rCurrent
      const sigmaMargin = this.sigmaAllowable - sigmaSelf

      if (sigmaMargin <= 0) {
        return false
      }

      const { totalForce } = this.centrifugalForcePerPaddleWithOmega(rCurrent, testOmega)
      const totalForceAll = totalForce * this.nPaddles
      const circumference = 2 * Math.PI * rCurrent

      const pRequired = totalForceAll / (circumference * this.paddleWidth)
      const pSupport = (sigmaMargin * this.dr) / rCurrent

      cumulativePressureSupport += pSupport

      if (cumulativePressureSupport >= pRequired) {
        return true
      }

      rCurrent += this.dr
    }

    return false
  }

  centrifugalForcePerPaddleWithOmega(rBase, testOmega) {
    const nRSteps = 100
    const drLocal = (this.rOuter - rBase) / nRSteps
    let totalForce = 0
    let t = this.tPaddleTip
    for (let i = 0; i < nRSteps; i++) {
      const r = rBase + (i / nRSteps) * (this.rOuter - rBase)
      const area = t * this.paddleWidth
      const dMass = this.rho * area * drLocal
      const dForce = dMass * r * testOmega * testOmega
      totalForce += dForce
      const tMin = totalForce / this.sigmaAllowable / this.paddleWidth
      t = Math.max(t, tMin)
    }
    const tBase = t
    const totalStress = totalForce / (t * this.paddleWidth)
    return { totalForce, totalStress, tBase }
  }
}
