import * as THREE from 'three'
//import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
export class launcher {

    constructor() {
        this.const_G = 0.0000000000667408;

        // Possible User defined (e.g. if user changes the planet)
        this.const_g = 9.8;
        this.const_M = 5.9722E+24;
        this.mu = this.const_G * this.const_M;
        this.R_Earth = 6371000;

        // User defined parameters
        this.MPayload = 60000;
        this.Alt_LEO = 400000;
        this.Alt_Perigee = 48000;
        this.WholesaleElectricityCost = 0.05;
        this.LiquidHydrogenCostPerGallon = 0.98;
        this.LiquidOxygenCostPerGallon = 0.67;
        this.MassOfOneGallonOfLiquidHydrogen = 0.2679; // kg / Gallon
        this.MassOfOneGallonOfLiquidOxygen = 4.322; // kg / Gallon
        this.MassOfHydrogen = 384071 * this.MassOfOneGallonOfLiquidHydrogen;
        this.MassOfOxygen = 141750 * this.MassOfOneGallonOfLiquidOxygen;
        this.FuelCostPerkg = (this.MassOfHydrogen / this.MassOfOneGallonOfLiquidHydrogen * this.LiquidHydrogenCostPerGallon + this.MassOfOxygen / this.MassOfOneGallonOfLiquidOxygen * this.LiquidOxygenCostPerGallon) / (this.MassOfHydrogen + this.MassOfOxygen);
        this.EstimatedCostToFuelSLSToLEO = ((979452 - 85270) + (30710 - 3490)) * this.FuelCostPerkg / 95000;
        this.RocketsSpecificImpulse = 452; // RS-25
        this.RocketEnginesMass = 3527; // RS-25
        this.LauncherEfficiency = 0.75;
        this.MaxGees = 3;
        this.LauncherAltitude = 32000;
        this.Alt_EvacuatedTube = 32000;
        this.VehicleRadius = 2.4/2; // Assuming a cylindrically shaped vehicle the diameter of an RS-25 Rocket Engine
        this.CoefficientOfDrag = 0.4;
    }

    Update() {
        // TBD these parameters should come from "the universe"
        this.R_LEO = this.R_Earth + this.Alt_LEO;

        this.PotentialEnergy_Joules = -this.const_G * this.const_M * this.MPayload / this.R_Earth;
        this.PotentialEnergy_kWh = this.PotentialEnergy_Joules / 3600000;
        this.CostOfPotentialEnergyToEscape = -this.PotentialEnergy_kWh * this.WholesaleElectricityCost;
        this.CostPerkgToEscape = this.CostOfPotentialEnergyToEscape / this.MPayload;
        this.LEOOrbitVelocity = Math.sqrt(this.const_G*this.const_M / (this.R_Earth + this.Alt_LEO));
        this.Alt_Apogee = this.Alt_LEO;
        this.EllipseMajorAxisLength = this.Alt_Perigee + this.R_Earth * 2 + this.Alt_Apogee;
        this.EllipseSemiMajorAxisLength = this.EllipseMajorAxisLength / 2;
        this.Eccentricity = 1.0 - (this.R_Earth + this.Alt_Perigee) / this.EllipseSemiMajorAxisLength;
        this.EllipseSemiMinorAxisLength = this.EllipseSemiMajorAxisLength * Math.sqrt(1 - this.Eccentricity**2);

        this.EllipticalOrbitPerigeeVelocity = Math.sqrt(this.const_G*this.const_M*(2 / (this.R_Earth + this.Alt_Perigee) - 2 / this.EllipseMajorAxisLength));
        this.EllipticalOrbitApogeeVelocity = Math.sqrt(this.const_G*this.const_M*(2 / (this.R_Earth + this.Alt_Apogee) - 2 / this.EllipseMajorAxisLength));
        this.EllipticalOrbitVelocityAtLauncherExit = Math.sqrt(this.const_G * this.const_M * (2 / (this.R_Earth + this.Alt_EvacuatedTube) - (1 / this.EllipseSemiMajorAxisLength)));
        this.EllipticalOrbitPeriod = 2 * Math.PI * Math.sqrt(Math.pow(this.EllipseSemiMajorAxisLength, 3) / (this.const_G * this.const_M));
        this.EarthsRimSpeed = 2 * Math.PI*(this.R_Earth + this.Alt_Perigee) / 24 / 3600;  // ToDo: This needs to be a function of where edge of ring is
        this.DeltaVeeToCircularizeOrbit = this.LEOOrbitVelocity - this.EllipticalOrbitApogeeVelocity;
        this.DeltaVeeToDeCircularizeOrbit = this.DeltaVeeToCircularizeOrbit; // Need this much DeltaV to return to Earth
        this.TotalDeltaV = this.DeltaVeeToCircularizeOrbit + this.DeltaVeeToDeCircularizeOrbit;
        this.M0OverMf = Math.exp(this.TotalDeltaV / (this.RocketsSpecificImpulse*this.const_g));
        this.FueledVehicleMassAtApogee = (this.MPayload + this.RocketEnginesMass)*this.M0OverMf;
        this.FueledVehiclesKineticEnergyAtPerigee_Joules = 0.5*this.FueledVehicleMassAtApogee*(this.EllipticalOrbitPerigeeVelocity - this.EarthsRimSpeed)**2;
        this.FueledVehiclesKineticEnergyAtPerigee_kWh = this.FueledVehiclesKineticEnergyAtPerigee_Joules / 3600000;
        this.CostToLaunchFueledVehicle = this.FueledVehiclesKineticEnergyAtPerigee_kWh * this.LauncherEfficiency * this.WholesaleElectricityCost;
        this.CostPerkgOfPayload = this.CostToLaunchFueledVehicle / this.MPayload;

        // Next, we will work out the length of the launcher's track and the launch time...
        this.LauncherTrackLength = 0.5*(this.EllipticalOrbitPerigeeVelocity - this.EarthsRimSpeed)**2 / (this.MaxGees*this.const_g);
        this.AccelerationTime = Math.sqrt(2 * this.LauncherTrackLength / (this.MaxGees*this.const_g));
        // A rough approximation here - assuming that the S curve is close to flat so we can just subtract or add one Gee to account for Earth's Gravity 
        this.AllowableUpwardTurningRadius = this.EllipticalOrbitPerigeeVelocity**2 / ((this.MaxGees - 1)*this.const_g);
        this.AllowableDownwardTurningRadius = this.EllipticalOrbitPerigeeVelocity**2 / ((this.MaxGees + 1)*this.const_g);
        if (this.Alt_Perigee > this.LauncherAltitude) {
            // In this case we know that the optimal release point is at the orbit's perigee.
            const TriangleSideA = this.R_Earth + this.Alt_Perigee - this.AllowableDownwardTurningRadius;
            const TriangleSideB = this.R_Earth + this.LauncherAltitude + this.AllowableUpwardTurningRadius;
            const TriangleSideC = this.AllowableUpwardTurningRadius + this.AllowableDownwardTurningRadius;
            const AngleA = Math.acos((TriangleSideA**2 - TriangleSideB**2 - TriangleSideC**2) / (-2 * TriangleSideB*TriangleSideC));
            const AngleB = Math.acos((TriangleSideB**2 - TriangleSideA**2 - TriangleSideC**2) / (-2 * TriangleSideA*TriangleSideC));
            const AngleD = Math.PI - AngleB;
            this.CurveUpDistance = AngleA * this.AllowableUpwardTurningRadius;
            this.CurveDownDistance = AngleD * this.AllowableDownwardTurningRadius;
        }
        else {
            // In this case the optimal release point is not the eliptical orbit's perigee, but rather the point where the eliptical orbit 
            // intercects with Alt_EvacuatedTubeHeight, or the highest altitude at which it is feasible to use the launch system to alter
            // the tragectory of the vehicle. We need to figure out the location of this point and the velocity vector at that point.

            this.CurveUpDistance = 0;
            this.CurveDownDistance = 0;
        }
        this.TotalSCurveDistance = this.CurveUpDistance + this.CurveDownDistance;
        this.CurveUpTime = this.CurveUpDistance / this.EllipticalOrbitPerigeeVelocity;
        this.CurveDownTime = this.CurveDownDistance / this.EllipticalOrbitPerigeeVelocity;
        this.TotalTimeInLaunchSystem = this.AccelerationTime + this.CurveUpTime + this.CurveDownTime;
        this.VehicleCrossSectionalAreaForDrag = Math.PI * this.VehicleRadius ** 2
    }

    // The following functions were ported from 	// Equation 3.66c, http://www.nssc.ac.cn/wxzygx/weixin/201607/P020160718380095698873.pdf

    stumpC(z) {
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

    stumpS(z) {

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

    f_and_g(x, t, ro, a)
    {
        const fg = new THREE.Vector2()

        const z = a * x**2
        //Equation 3.66a:
        fg.x = 1 - x**2 / ro * this.stumpC(z)
        //Equation 3.66b:
        fg.y = t - 1 / Math.sqrt(this.mu) * x*x*x * this.stumpS(z)
        return fg
    }

    fDot_and_gDot(x, r, ro, a)
    {
        const fdotgdot = new THREE.Vector2()

        const z = a * x**2
        // Equation 3.66c:
        fdotgdot.x = Math.sqrt(this.mu) / r / ro * (z*this.stumpS(z) - 1)*x
        // Equation 3.66d:
        fdotgdot.y = 1 - x**2 / r * this.stumpC(z)
        return fdotgdot
    }

    kepler_U(dt, ro, vro, a) {
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

        while ((Math.abs(ratio) > error) && (n <= nMax)) {
            n = n + 1
            C = this.stumpC(a * x**2)
            S = this.stumpS(a * x**2)
            F = ro * vro / Math.sqrt(this.mu) * x**2 * C + (1 - a * ro) * x*x*x * S + ro * x - Math.sqrt(this.mu)*dt
            dFdx = ro * vro / Math.sqrt(this.mu) * x * (1 - a * x**2 * S) + (1 - a * ro) * x**2 * C + ro
            ratio = F / dFdx
            x = x - ratio
        }
        return x
    }

    RV_from_R0V0andt(R0_x, R0_y, V0_x, V0_y, t) {

        const R0 = new THREE.Vector2(R0_x, R0_y)
        const V0 = new THREE.Vector2(V0_x, V0_y)
        const RV = {
            R: new THREE.Vector2(0, 0),
            V: new THREE.Vector2(0, 0)
        }
        // mu - gravitational parameter(kmˆ3 / sˆ2)
        // R0 - initial position vector(km)
        // V0 - initial velocity vector(km / s)
        // t - elapsed time(s)
        // R - final position vector(km)
        // V - final velocity vector(km / s)
        // User M - functions required : kepler_U, f_and_g, fDot_and_gDot

        //Magnitudes of R0 and V0
        const r0 = R0.length()
        const v0 = V0.length()
        //Initial radial velocity
        const vr0 = R0.dot(V0) / r0

        // Reciprocal of the semimajor axis(from the energy equation)
        const alpha = 2 / r0 - v0**2 / this.mu
        // Compute the universal anomaly
        const x = this.kepler_U(t, r0, vr0, alpha)
        // Compute the f and g functions
        const fg = this.f_and_g(x, t, r0, alpha)

        // Compute the final position vector
        RV.R.x = fg.x * R0.x + fg.y * V0.x
        RV.R.y = fg.x * R0.y + fg.y * V0.y

        // Compute the magnitude of R
        const r = RV.R.length()
        
        // Compute the derivatives of f and g
        const fdotgdot = this.fDot_and_gDot(x, r, r0, alpha)

        // Compute the final velocity
        RV.V.x = fdotgdot.x * R0.x + fdotgdot.y * V0.x
        RV.V.y = fdotgdot.x * R0.y + fdotgdot.y * V0.y

        return RV
    }

    GetAltitudeDistanceAndVelocity(CurrentTime)
    {
        let ADAndV = {
            Altitude: 0,
            Distance: 0,
            Velocity: 0
        }

        if (CurrentTime <= this.AccelerationTime) {
            ADAndV.Altitude = this.LauncherAltitude
            ADAndV.Distance = 0.5 * this.MaxGees * this.const_g * CurrentTime**2
            ADAndV.Velocity = this.MaxGees * this.const_g * CurrentTime
        }
        else if (CurrentTime <= this.AccelerationTime + this.CurveUpTime) {
            ADAndV.Altitude = Math.sqrt((this.R_Earth + this.LauncherAltitude + this.AllowableUpwardTurningRadius)**2 + this.AllowableUpwardTurningRadius**2 - 2 * (this.R_Earth + this.LauncherAltitude + this.AllowableUpwardTurningRadius)*this.AllowableUpwardTurningRadius*Math.cos(Math.max(0, CurrentTime - this.AccelerationTime)*this.EllipticalOrbitPerigeeVelocity / this.AllowableUpwardTurningRadius)) - this.R_Earth;
            // ToDo: This is too rough and approximation
            ADAndV.Distance = this.LauncherTrackLength + (CurrentTime - this.AccelerationTime) * this.EllipticalOrbitPerigeeVelocity
            ADAndV.Velocity = this.EllipticalOrbitPerigeeVelocity
        }
        else if (CurrentTime <= this.TotalTimeInLaunchSystem) {
            ADAndV.Altitude = Math.sqrt((this.R_Earth + this.Alt_Perigee - this.AllowableDownwardTurningRadius)**2 + this.AllowableDownwardTurningRadius**2 - 2 * (this.R_Earth + this.Alt_Perigee - this.AllowableDownwardTurningRadius)*this.AllowableDownwardTurningRadius*Math.cos(Math.PI + Math.min(0, CurrentTime - this.TotalTimeInLaunchSystem)*this.EllipticalOrbitPerigeeVelocity / this.AllowableDownwardTurningRadius)) - this.R_Earth
            // ToDo: This is too rough and approximation
            ADAndV.Distance = this.LauncherTrackLength + (CurrentTime - this.AccelerationTime) * this.EllipticalOrbitPerigeeVelocity
            ADAndV.Velocity = this.EllipticalOrbitPerigeeVelocity
        }
        else {
            const Time = CurrentTime - this.TotalTimeInLaunchSystem
            const R0 = new THREE.Vector2(0, (this.R_Earth + this.Alt_Perigee) / 1000)
            const V0 = new THREE.Vector2(this.EllipticalOrbitPerigeeVelocity / 1000, 0)
            // TBD - need to figure out the altitude while on the eliptical orbit's path

            // Note: The distance units in the RV_from_R0V0andt function and its sub functions are km, not meters.
            const RV = this.RV_from_R0V0andt(R0.x, R0.y, V0.x, V0.y, Time)

            ADAndV.Altitude = RV.R.length() * 1000 - this.R_Earth
            ADAndV.Distance = Math.atan2(RV.R.x, RV.R.y) * RV.R.length() * 1000
            ADAndV.Velocity = RV.V.length() * 1000
        }
        return ADAndV
    }

    GetAirDensity(Altitude)
    {
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

    GetAerodynamicDrag(CurrentAirDensity, Speed)
    {
        const DragForce = CoefficientOfDrag * VehicleCrossSectionalAreaForDrag * (Speed - EarthsRimSpeed)**2 / 2 * CurrentAirDensity
        return DragForce;
    }
}