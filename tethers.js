import {
	BufferGeometry,
	Vector3,
	BufferAttribute
} from 'three'
//} from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'

import * as tram from './tram.js'
import * as kmlutils from './kmlutils.js'

class TetherGeometry extends BufferGeometry {

	constructor(radiusOfPlanet, gravitationalConstant, massOfPlanet, crv, ctv, dParamWithUnits, specs, fastTetherRender, genKMLFile, kmlFile, genSpecs, planetCoordSys, tetheredRingRefCoordSys) {
		super();

    const tetherPoints = []
    const tetherThicknesses = []
    const tetherIndices = []  // These indices index points in tetherPoints, reusing them to save memory
    const tetherStrips = []   // This array will store other arrays that will each define a "strip" of points
    const tetherStripThicknesses = []   // This array will store other arrays that will each define a "strip" of points
    const tetherStripCrossSectionalAreas = []   // This array will store other arrays that will each define a "strip" of points
    const mrr = 10000 //crv.mainRingRadius
    const finalCatenaryTypes = [[], []]                          // Shape of the catenary after the ring is raised to full height - used to "design" the thethers.
    const currentCatenaryTypes = [[], []]                        // Shape of the catenery for the portion of the tethers that are off the ground when the ring is less than fully elevated   
    const verbose = false

    // Tethered Ring Math
    // Inputs:
    // gravitationalConstant, radiusOfPlanet, massOfPlanet
    // dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value, dParamWithUnits['massPerMeterOfRing'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['tetherEngineeringFactor'].value, dParamWithUnits['numForkLevels'].value, dParamWithUnits['tetherPointBxAvePercent'].value, dParamWithUnits['tetherPointBxDeltaPercent'].value
    // tetherFiberDensity, tetherStress

    const final_r = radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value

    const totalMassPerMeterOfRings = dParamWithUnits['totalMassPerMeterOfRings'].value
    // Note: The following formula is an approximation that assumes a non-rotating and perfectly spherical planet. It will need to be improved later.
    const forceExertedByGravityOnRing = gravitationalConstant * massOfPlanet * totalMassPerMeterOfRings / (final_r**2)
    if (genSpecs) {
      specs['forceExertedByGravityOnRing'] = {value: forceExertedByGravityOnRing, units: "N/m"}
    }
    // The following three vectors are for a unit length section of the ring and are specified in a ring-centered cylindrical coordinates
    const fG = new tram.forceVector() // Vector representing the force of gravity
    const fT = new tram.forceVector() // Vector representing the tensile  force
    const fI = new tram.forceVector() // Vector representing the inertial force

    fG.ρ = -forceExertedByGravityOnRing * Math.cos(dParamWithUnits['equivalentLatitude'].value)
    fG.φ = 0
    fG.z = -forceExertedByGravityOnRing * Math.sin(dParamWithUnits['equivalentLatitude'].value)
    fT.z = -fG.z                     // Eq 6

    // const factor = dParamWithUnits['tetherFiberTensileStrength'].prefixfactor
    const tetherStress = dParamWithUnits['tetherFiberTensileStrength'].value*1000000 / dParamWithUnits['tetherEngineeringFactor'].value
    const accelerationOfGravityAtSeaLevel = gravitationalConstant * massOfPlanet / ((radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value)**2)  // Accelleration of gravity at altitude halfway up to the ring is used as an engineering approximation (Eq 17)
    const accelerationOfGravityAtRing = gravitationalConstant * massOfPlanet / ((radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value)**2)  // Accelleration of gravity at altitude halfway up to the ring is used as an engineering approximation (Eq 17)
    const accelerationOfGravityApproximation = gravitationalConstant * massOfPlanet / ((radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value / 2)**2)  // Accelleration of gravity at altitude halfway up to the ring is used as an engineering approximation (Eq 17)
    const howMuchLessThingsWeighAtRing = accelerationOfGravityAtRing / accelerationOfGravityAtSeaLevel
    if (genSpecs) {
      //specs['accelerationOfGravityApproximation'] = {value: accelerationOfGravityApproximation, units: "m/s2"}
      specs['accelerationOfGravityAtRing'] = {value: accelerationOfGravityAtRing, units: "m/s2"}
      specs['howMuchLessThingsWeighAtRing'] = {value: howMuchLessThingsWeighAtRing, units: ""}
    }
    const c = tetherStress / dParamWithUnits['tetherFiberDensity'].value / accelerationOfGravityApproximation
    
    // Initially we will assume that PointB is at x=0 on the catenary. This is done just so that we can calculate a temporary "PointP.x", 
    // and then set PointB.x as a percentage of this temporarty PointP.x. 
    const tempPointP = new tram.cateneryVector()
    tempPointP.y = dParamWithUnits['ringFinalAltitude'].value
    tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y/c))      // Eq 11
    tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y/c))      // Eq 13b
    
    const tetherTypes = [[], []]
    const finalTetherLength = []
    const currentTetherLength = []
    const numTetherSegments = (2 ** (dParamWithUnits['numForkLevels'].value+1)) - 1       // Starting from anchor, after each fork the distance to the next fork (or attacment point) is halved
    const numTetherPoints = numTetherSegments + 1                // Because, for example, it takes 5 points to speify 4 segments
    const Nappt = [[], []]
    const F = [[], []]
    const Acs = [[], []]
    const L = []
    const V = []
    const M = []
    const I = []
    const tetherSpacing = 2 * crv.mainRingRadius * Math.PI / dParamWithUnits['numTethers'].value
    if (genSpecs) {
      specs['tetherSpacing'] = {value: tetherSpacing, units: "m"}
    }

    finalCatenaryTypes.forEach((catenaryType, j) => {
      const pointB = new tram.cateneryVector()
      const pointP = new tram.cateneryVector()
      const pointA = new tram.cateneryVector()
      const minusplus = [-1, 1]
      pointB.x = tempPointP.x * (dParamWithUnits['tetherPointBxAvePercent'].value + minusplus[j] * dParamWithUnits['tetherPointBxDeltaPercent'].value/2)/100
      pointB.θ = pointB.x / c                              // Eq 12
      pointB.y = c * Math.log(1.0/Math.cos(pointB.x/c))    // Eq 10
      pointB.s = c * Math.acosh(Math.exp(pointB.y/c))      // Eq 13b
      pointP.y = pointB.y + dParamWithUnits['ringFinalAltitude'].value
      pointP.x = c * Math.acos(Math.exp(-pointP.y/c))      // Eq 11
      pointP.s = c * Math.acosh(Math.exp(pointP.y/c))      // Eq 13b
      pointP.θ = pointP.x / c                              // Eq 12
      const ω_P = -(Math.PI/2 - (dParamWithUnits['equivalentLatitude'].value))
      fT.ρ = fT.z / (Math.tan(pointP.θ+ω_P))               // Eq 20
      fI.ρ = -fG.ρ - fT.ρ                                  // Eq 21
      pointP.T = Math.sqrt(fT.ρ**2 + fT.z**2)
      pointA.T = pointP.T * Math.cos(pointP.θ)             // Eq 17, Note: pointA.T is also referred to as 'T0'
      pointB.T = pointA.T / Math.cos(pointB.θ)             // Eq 17, Note: pointA.T is also referred to as 'T0'
      finalTetherLength[j] = pointP.s - pointB.s

      if (genSpecs) {
        const CatenaryEndpoints = [pointB, pointP]
        const label = ['B', 'P']
        CatenaryEndpoints.forEach((point, k) => {
          // These are simplifed rough calculations. They will help to reveal errors in more precice calculations performed later.
          // There's a cosine effect that will increase stress on the tethers in proportion to their ω angle

          // Calcualte the number of attachment points for the tether
          Nappt[j][k] = 2**(k*dParamWithUnits['numForkLevels'].value)
          specs['numAttachmentPointsPerTether_'+label[k]+j] = {value: Nappt[j][k], units: ""}
          specs['tetherAngleAtAttachmentPoint_'+label[k]+j] = {value: point.θ, units: "radians"}
          specs['tetherTensileForcePerMeterOfRingAtAttachmentPoint_'+label[k]+j] = {value: point.T, units: "N"}
          F[j][k] = point.T * tetherSpacing / Nappt[j][k]
          specs['tetherTensileForceAtAttachmentPoint_'+label[k]+j] = {value: F[j][k], units: "N"}
          Acs[j][k] = F[j][k] / tetherStress
          specs['tetherCrossSectionalAreaAtAttachmentPoint_'+label[k]+j] = {value: Acs[j][k], units: "m2"}
          specs['tetherDiameter_'+label[k]+j] = {value: 2 * Math.sqrt(Acs[j][k] / 2 / Math.PI), units: "m"}  // because: d = 2*r = 2*sqrt(a/2/pi)
          specs['tetherForce_'+label[k]+j] = {value: Acs[j][k] * tetherStress, units: "N"}
        })
        specs['NASAsCrawlerTransporterMass'] = {value: 2721000, units: "kg"}
        L[j] = pointP.s - pointB.s       // Note: Does not account for length increase due to forks - assumes closely-spaced tethers
        specs['tetherLength'+j] = {value: L[j], units: "m"}
        I[j] = fI.ρ
      }
    })

    // At this point the final length of the tethers (measured along the catenary) is known, but the tethers current shape is still
    // a function of its state of deployment.
    // The next steps involve calculating the catenary for the current state of deployment, and then mapping the tether design onto that catenary. 

    const r = Math.sqrt(crv.yc**2 + crv.mainRingRadius**2)

    tempPointP.y = r - radiusOfPlanet
    tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y/c))      // Eq 11
    tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y/c))      // Eq 13b
    
    const pointB_s = []
    const ω_P = -(Math.PI/2 - crv.currentEquivalentLatitude)   // negative rotation angle because the angle increases in clockwise direction
    
    currentCatenaryTypes.forEach((catenaryType, j) => {
      const pointB = new tram.cateneryVector()
      const pointP = new tram.cateneryVector()
      const minusplus = [-1, 1]
      pointB.x = tempPointP.x * (dParamWithUnits['tetherPointBxAvePercent'].value + minusplus[j] * dParamWithUnits['tetherPointBxDeltaPercent'].value/2)/100
      pointB.y = c * Math.log(1.0/Math.cos(pointB.x/c))    // Eq 10
      pointB.s = c * Math.acosh(Math.exp(pointB.y/c))      // Eq 13b
      pointB_s[j] = pointB.s  // We'll need to use this later
      pointP.y = pointB.y + crv.currentMainRingAltitude
      pointP.x = c * Math.acos(Math.exp(-pointP.y/c))      // Eq 11
      pointP.s = c * Math.acosh(Math.exp(pointP.y/c))      // Eq 13b
      pointP.θ = pointP.x / c                                  // Eq 12
      // These are the forces at the ring, that is, at PointP.
      fT.ρ = fT.z / (Math.tan(pointP.θ+ω_P))         // Eq 20
      fI.ρ = -fG.ρ - fT.ρ                           // Eq 21
      fI.z = 0
      fI.φ = 0
      fT.φ = 0
      fG.φ = 0

      currentTetherLength[j] = pointP.s - pointB.s
      
      ctv.gravityForceAtRing[j] = structuredClone(fG)
      ctv.tensileForceAtRing[j] = structuredClone(fT)
      ctv.inertialForceAtRing[j] = structuredClone(fI)
      // console.log(ctv.gravityForceAtRing[j])
      // console.log("ctv.tensileForceAtRing", j, ctv.tensileForceAtRing[j], fT)
      // console.log(ctv.inertialForceAtRing[j])

      for (let i = 0; i<=numTetherPoints-1; i++) {
        const sFraction = i / (numTetherPoints-1)
        const s = pointB.s + currentTetherLength[j] - finalTetherLength[j] * (1 - sFraction)
        // Compute a distance from the center of the planet and a angle from the ring's axis of symmetry
        const x = 2 * c * Math.atan(Math.exp(s/c)) - (c * Math.PI / 2)   // Eq 15
        const y = c * Math.log(Math.cosh(s/c))                           // Eq 16
        const r = radiusOfPlanet + (y - pointB.y)
        const ω_anchor = ω_P + (pointP.x-pointB.x) / radiusOfPlanet     // Left this unreduced to make it a bit easier to understand the logic
        const ω = ω_anchor - (x-pointB.x) / radiusOfPlanet
        const θ = x / c
        const tensileForcePerMeterRhoComponentAtX = fT.z / Math.tan(θ + ω_P)
        const tensileForcePerMeterAtX = Math.sqrt(fT.z**2 + tensileForcePerMeterRhoComponentAtX**2)
        const crossSectionalArea = tensileForcePerMeterAtX * tetherSpacing / tetherStress
        catenaryType.push(new tram.CatenaryPolarVec3(r, ω, s, crossSectionalArea))
      }
    })

    // Dang it!!! I reused 'θ' here so now it has two meanings. It has one meaning in the catenary-of-constant-stress formula and another in the spherical coordinate system in which the tethers are generated.
    // Super sorry! Will add to my backlog.
    class Branch {
      constructor(base_point, base_dr, base_dω, base_dθ, target_point, target_dr, target_dω, target_dθ, crossSectionalAreaFraction, cosineFactor) {
        this.base_point = base_point
        this.base_dr = base_dr                   // This is the distance from the root tether segment to the base of the current branch in the r-axis
        this.base_dω = base_dω                   // This is the distance from the root tether segment to the base of the current branch in the r-axis
        this.base_dθ = base_dθ                   // This is the distance from the root tether segment to the base of the current branch in the θ-axis
        this.target_point = target_point
        this.target_dr = target_dr               // This is the distance from the root tether segment to point on the ring that the current segment is heading towards, in the r-axis
        this.target_dω = target_dω               // This is the distance from the root tether segment to point on the ring that the current segment is heading towards, in the r-axis
        this.target_dθ = target_dθ               // This is the distance from the root tether segment to point on the ring that the current segment is heading towards, in the θ-axis
        this.dr_0 = base_dr
        this.dr_1 = 0
        this.dω_0 = base_dω
        this.dω_1 = 0
        this.dθ_0 = base_dθ
        this.dθ_1 = 0
        this.stripIndex = -1     // '-1' indicates that a strip has not been started for this branch yet
        this.crossSectionalAreaDivider = crossSectionalAreaFraction
        this.cosineFactor = cosineFactor
      }
    }

    const numMainRings = dParamWithUnits['numMainRings'].value
    const mainRingSpacing = dParamWithUnits['mainRingSpacing'].value
    const whenToForkVertically = dParamWithUnits['whenToForkVertically'].value
    const numForkLevels = dParamWithUnits['numForkLevels'].value
    const numTethers = dParamWithUnits['numTethers'].value
    const tetherSpanOverlapFactor = dParamWithUnits['tetherSpanOverlapFactor'].value
    const tetherFiberDensity = dParamWithUnits['tetherFiberDensity'].value
    let tetherBranchesLength = [1]  // Using a one element array because we want the function to return a value
    let tetherVolume = [1]

    if (fastTetherRender) {
      // The 'j' index is used to stagger the tethers 
      // We are assuming here that the ring has a constant altitude, so we can create just two types of tethers and reuse them over and over again, all the way around the ring. 
      // This improves model performance, but it is not accurate for at least two reasons. 1) The earth is a obique spheroid. 2) Economics will no doubt favor a design that is
      // not perfectly circular nor at a constant atitude.
      const referencePoint = new Vector3().setFromSphericalCoords(radiusOfPlanet + crv.currentMainRingAltitude, -(Math.PI/2 - crv.currentEquivalentLatitude), 0)
      tetherTypes.forEach((tetherType, j) => {
        const jModNumTypes = j % currentCatenaryTypes.length
        const catenaryPoints = currentCatenaryTypes[jModNumTypes]
        const selectedPointB_s = pointB_s[jModNumTypes]
        const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
        makeTetherStrips(θ, referencePoint, catenaryPoints, selectedPointB_s, numTetherPoints, numMainRings, mainRingSpacing, whenToForkVertically, numForkLevels, numTethers, tetherSpanOverlapFactor, tetherFiberDensity, genSpecs, specs, tetherBranchesLength, tetherVolume)
        if (genSpecs) {
          V[j] = tetherVolume[0]
          M[j] = tetherVolume[0] * tetherFiberDensity
  
          specs['tetherBranchesLength'+j] = {value: tetherBranchesLength[0], units: "m"}
          specs['tetherVolume_'+j] = {value: tetherVolume[0], units: "m^3"}
          specs['tetherMass_'+j] = {value: M[j], units: "kg"}
        }
      })
    }
    else {
      for (let j = 0; j<dParamWithUnits['numTethers'].value; j++) {
      //for (let j = dParamWithUnits['numTethers'].value*28/32; j<dParamWithUnits['numTethers'].value*29/32; j++) {
        const jModNumTypes = j % currentCatenaryTypes.length
        const catenaryPoints = currentCatenaryTypes[jModNumTypes]
        const selectedPointB_s = pointB_s[jModNumTypes]
        const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
        const referencePoint = new Vector3(0, 0, 0)
        makeTetherStrips(θ, referencePoint, catenaryPoints, selectedPointB_s, numTetherPoints, numMainRings, mainRingSpacing, whenToForkVertically, numForkLevels, numTethers, tetherSpanOverlapFactor, tetherFiberDensity, genSpecs, specs, tetherBranchesLength, tetherVolume)
        if (genSpecs && (j < tetherTypes.length)) {
          V[j] = tetherVolume[0]
          M[j] = tetherVolume[0] * tetherFiberDensity
  
          specs['tetherBranchesLength'+j] = {value: tetherBranchesLength[0], units: "m"}
          specs['tetherVolume_'+j] = {value: tetherVolume[0], units: "m^3"}
          specs['tetherMass_'+j] = {value: M[j], units: "kg"}
        }
      }
    }

    function makeTetherStrips(θ, referencePoint, catenaryPoints, pointB_s, numTetherPoints, numMainRings, mainRingSpacing, whenToForkVertically, numForkLevels, numTethers, tetherSpanOverlapFactor, tetherFiberDensity, genSpecs, specs, tetherBranchesLength, tetherVolume) {
      const tetherSpan = 2 * Math.PI / numTethers * tetherSpanOverlapFactor

      // Spherical coordinates (r, ω, θ) are defined using three.js convention, where ω is the polar angle, θ is the equitorial angle 
      let r_0 = catenaryPoints[0].r
      let ω_0 = catenaryPoints[0].ω
      let s_0 = catenaryPoints[0].s
      let crossSectionalArea_0 = catenaryPoints[0].crossSectionalArea
      let r_1
      let ω_1
      let s_1
      let crossSectionalArea_1
      let branches = []
      tetherBranchesLength[0] = 0
      tetherVolume[0] = 0

      // The first "branch" is the main trunck of the tether.
      branches.push(new Branch(0, 0.0, 0.0, 0.0, numTetherPoints, 0.0, 0.0, 0.0, 1.0, 1.0))  // This defines the trunk of the tether

      const mro = (numMainRings - 1)/2

      // Generate a (very) rough estimate of the maximum thickness of the tether
      let maxThickness = 2 * Math.sqrt(catenaryPoints[catenaryPoints.length>>1].crossSectionalArea / Math.PI)
      
      let crossSectionalAreaFraction = 1.0

      for (let i = 0; i<=numTetherPoints-2; i++) {
        r_1 = catenaryPoints[i+1].r
        ω_1 = catenaryPoints[i+1].ω
        s_1 = catenaryPoints[i+1].s
        crossSectionalArea_1 = catenaryPoints[i+1].crossSectionalArea

        if ((s_0<pointB_s) && (pointB_s<s_1)) {
          // Since part of this tether segment is still on the spool, we need to recalculate the r_0, ω_0, and crossSectionalArea_0 values more accurately by using lerps...
          const frac = (pointB_s-s_0)/(s_1-s_0)
          r_0 = tram.lerp(r_0, r_1, frac)
          ω_0 = tram.lerp(ω_0, ω_1, frac)
          crossSectionalArea_0 = tram.lerp(crossSectionalArea_0, crossSectionalArea_1, frac)
        }

        const logOfDistanceFromTether = Math.log2(numTetherPoints-i)
        if ((i>0) && (Number.isInteger(logOfDistanceFromTether))) {      // If we're at a point where the tether segments fork...
          const logNumStays = numForkLevels + 1 - logOfDistanceFromTether
          const target_dθ_Alteration = tetherSpan/(2**(logNumStays+1))
          if (logOfDistanceFromTether!=whenToForkVertically) {
            crossSectionalAreaFraction *= 0.5
          }
          else {
            crossSectionalAreaFraction *= 0.5/numMainRings
          }
          branches.forEach((branch, index) => {
            if (logOfDistanceFromTether!=whenToForkVertically) {
              //const checkCrossSectionalAreaFraction =  2**(-logNumStays)
              // Create two new branches (left and right), then delete the original
              branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ + target_dθ_Alteration, crossSectionalAreaFraction, 1.0))
              branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ - target_dθ_Alteration, crossSectionalAreaFraction, 1.0))
            }
            else {
              // For the branching where we also fork vertically, create numMainRings up/down branches to connect to the rings
              for (let k = 0; k<numMainRings; k++) {
                const target_dr_Alteration = (k-mro)*mainRingSpacing * Math.sin(crv.constructionEquivalentLatitude)
                const target_dω_Alteration = (k-mro)*mainRingSpacing * Math.cos(crv.constructionEquivalentLatitude) / r_0    // Dividing by r_0 is an approximation, a better r value may be needed for perfect accuracy
                branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr + target_dr_Alteration, branch.target_dω + target_dω_Alteration, branch.target_dθ + target_dθ_Alteration, crossSectionalAreaFraction, 1.0))
                branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr + target_dr_Alteration, branch.target_dω + target_dω_Alteration, branch.target_dθ - target_dθ_Alteration, crossSectionalAreaFraction, 1.0))
              }
            }
            delete branches[index]    // Some advice out there says not to use delete because then len() will return wrong results, but it's efficient at this task
          })
        }

        // As we travel up the catenery curve, we use the branch descriptions to generate "tether strips" which are lists of 3D points that define the tether's geometry.
        branches.forEach((branch) => {
          const alpha = (i+1 - branch.base_point)/(numTetherPoints-1 - branch.base_point)
          branch.dr_1 = tram.lerp(branch.base_dr, branch.target_dr, alpha)
          branch.dω_1 = tram.lerp(branch.base_dω, branch.target_dω, alpha)
          branch.dθ_1 = tram.lerp(branch.base_dθ, branch.target_dθ, alpha)
          if (s_1>pointB_s) {   // When raising the ring, points on the parts of the tether that are on the spool have all have the same coordinates (i.e. the spool's coordinates).
            let branch_r0, branch_r1, branch_ω0, branch_ω1, branch_θ0, branch_θ1, branch_s0, branch_s1
            if (s_0<pointB_s) {
              // We need to recalculate the branch.dr_0 and branch.dθ_0 values more accurately by using a lerp...
              // Note, this code doesn't recalculate the values correctly for the final tether branches that fork away vertically 
              const frac = (pointB_s-s_0)/(s_1-s_0)
              branch.dr_0 = tram.lerp(branch.dr_0, branch.dr_1, frac)
              branch.dω_0 = tram.lerp(branch.dω_0, branch.dω_1, frac)
              branch.dθ_0 = tram.lerp(branch.dθ_0, branch.dθ_1, frac)
              branch_s0 = pointB_s
            }
            else {
              branch_s0 = s_0
            }

            branch_s1 = s_1 
            branch_r0 = r_0 + branch.dr_0
            branch_r1 = r_1 + branch.dr_1
            branch_ω0 = ω_0 + branch.dω_0
            branch_ω1 = ω_1 + branch.dω_1
            branch_θ0 = θ + branch.dθ_0
            branch_θ1 = θ + branch.dθ_1

            // The cosine factor is used to adjust for the increased thickness of the various tether branches due to fanout.
            const branchCurveLength = branch_s1-branch_s0

            const firstPointFlag = (branch.stripIndex==-1) 
            if (firstPointFlag) {
              // Start a new array for the strip, add it to the array of arrays, and register its index with the branch object 
              branch.stripIndex = tetherStrips.push( [] ) - 1
              tetherStripCrossSectionalAreas.push( [] )
              tetherStripThicknesses.push( [] )
              // Push the branch's first point onto the tether stirps array 
              const absolutePoint = new Vector3().setFromSphericalCoords(branch_r0, branch_ω0, branch_θ0)
              tetherStrips[branch.stripIndex].push( absolutePoint.sub(referencePoint) )
            }
            const absolutePoint = new Vector3().setFromSphericalCoords(branch_r1, branch_ω1, branch_θ1)
            tetherStrips[branch.stripIndex].push( absolutePoint.sub(referencePoint) )
            const stripSegmentLength = tetherStrips[branch.stripIndex][tetherStrips[branch.stripIndex].length-1].distanceTo(tetherStrips[branch.stripIndex][tetherStrips[branch.stripIndex].length-2])
            
            // Cross sectional area increases as we travel up the catenary of constant stress.
            // It decreases (that is, it is distributed across multiple branches) when the tether forks.
            // It also increases when the tether branches are not perpendicular to the ring (the one-over-cosine factor).
            const thicknessCosineFactor = stripSegmentLength/branchCurveLength
            // a = pi*(d/2)^2, so d = 2*sqrt(a/pi)
            if (firstPointFlag) {
              const branchCrossSectionalArea = crossSectionalArea_0 * branch.crossSectionalAreaDivider * thicknessCosineFactor
              tetherStripCrossSectionalAreas[branch.stripIndex].push(branchCrossSectionalArea)
              tetherStripThicknesses[branch.stripIndex].push(2 * Math.sqrt(branchCrossSectionalArea / Math.PI) / maxThickness)
            }
            const branchCrossSectionalArea = crossSectionalArea_1 * branch.crossSectionalAreaDivider * thicknessCosineFactor
            tetherStripCrossSectionalAreas[branch.stripIndex].push(branchCrossSectionalArea)
            tetherStripThicknesses[branch.stripIndex].push(2 * Math.sqrt(branchCrossSectionalArea / Math.PI) / maxThickness)

            if (genSpecs) {
              const csAreas = tetherStripCrossSectionalAreas[branch.stripIndex]
              const n = csAreas.length
              tetherBranchesLength[0] += stripSegmentLength
              tetherVolume[0] += (csAreas[n-2] + csAreas[n-1]) / 2 * stripSegmentLength
            }
  
          }
          branch.dr_0 = branch.dr_1
          branch.dω_0 = branch.dω_1
          branch.dθ_0 = branch.dθ_1
        })
        r_0 = r_1
        ω_0 = ω_1
        s_0 = s_1
      }
    }

    // Convert all of the tetherStrips into indexed lines
    let numIndices = 0
      
    tetherStrips.forEach((strip, stripIndex) => {
      const tetherStripThickness = tetherStripThicknesses[stripIndex]

      strip.forEach((point, i) => {
        tetherPoints.push(point)
        tetherThicknesses.push(tetherStripThickness[i])
        if (i>0) {
          tetherIndices.push(numIndices-1)
          tetherIndices.push(numIndices)
        }
        numIndices++
      })
    })
    
    // Add tether points to KML file
    let overflow = 0
    if (genKMLFile) {
      planetCoordSys.updateWorldMatrix(true)
      tetheredRingRefCoordSys.updateMatrixWorld(true)

      this.kmlFile  = ''
      tetherStrips.forEach(strip => {
        if (this.kmlFile.length<1000000) {   // Don't let the file get too big
          this.kmlFile.concat(kmlutils.kmlTetherPlacemarkHeader)
          strip.forEach((point) => {
            const xyzWorld = tetheredRingRefCoordSys.localToWorld(point.clone())
            const xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
            const lla = tram.ecefToGeodetic(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z, planetSpec.ellipsoid)
            //const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
            const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
            this.kmlFile.concat(coordString)
          })
          this.kmlFile.concat(kmlutils.kmlPlacemarkFooter)
        }
        else {
          overflow++
        }
      })
      console.log('KML file too big by ' + overflow + ' strips')
    }
  
    this.userData['catenaryTypes'] = currentCatenaryTypes
    this.setFromPoints(tetherPoints)
    const numThicknessComponents = 1
    const thicknessAttribute = new BufferAttribute(new Float32Array(tetherThicknesses), numThicknessComponents)
    this.setAttribute('thickness', thicknessAttribute)
    this.setIndex(tetherIndices)
    // this.setAttribute( 'position', new THREE.Float32BufferAttribute( tetherPoints, 3 ) );
    // this.setAttribute( 'color', new THREE.Float32BufferAttribute( tetherColors, 3 ) );
    this.computeBoundingSphere()
    tetherPoints.splice(0, tetherPoints.length)   // Frees the memory used for these points
    tetherIndices.splice(0, tetherIndices.length)   // Frees the memory used for these points
    tetherStrips.splice(0, tetherStrips.length)   // Frees the memory used for these points
    tetherThicknesses.splice(0, tetherThicknesses.length)   // Frees the memory used for these points
    tetherStripThicknesses.splice(0, tetherStripThicknesses.length)   // Frees the memory used for these points
    tetherStripCrossSectionalAreas.splice(0, tetherStripCrossSectionalAreas.length)   // Frees the memory used for these points

    if (genSpecs) {
      let stationaryRingBillOfMaterials = []
      let movingRingBillOfMaterials = []

      specs['mainRingRadius'] = {value: crv.mainRingRadius, units: "m"}
      const mainRingCircumference = 2 * Math.PI * crv.mainRingRadius
      specs['mainRingCircumference'] = {value: mainRingCircumference, units: "m"}
      // A lot of these calculation are really more about the moving ring than the tethers. Probably should move them elsewhere
      const tetherFiberTotalMass = (M[0] + M[1]) / 2 * dParamWithUnits['numTethers'].value
      specs['tetherFiberTotalMass'] = {value: tetherFiberTotalMass, units: "kg"}
      const tetherFiberMassPerMeterOfRing = tetherFiberTotalMass / mainRingCircumference
      specs['tetherFiberMassPerMeterOfRing'] = {value: tetherFiberMassPerMeterOfRing, units: "kg"}
      const tetherEqCO2TotalMass = tetherFiberTotalMass * 44/12
      specs['tetherEqCO2TotalMass'] = {value: tetherEqCO2TotalMass, units: "kg"}
      const oneBillion = 1000000000
      const tetherFiberTotalCost = tetherFiberTotalMass * dParamWithUnits['tetherFiberCost'].value / oneBillion
      //console.log(tetherFiberTotalMass, tetherFiberTotalCost, tetherFiberTotalCost/tetherFiberTotalMass)
      specs['tetherFiberTotalCost'] = {value: tetherFiberTotalCost, units: "Billion USD"}
      //specs['tenileAverageForceDirection'] = {value: (Theta[0][1] + Theta[1][1])/2, units: "radians"}
      // Calculate the required inertial force
      const inertialForcePerMeter =  (I[0] + I[1]) / 2
      specs['inertialForcePerMeter'] = {value: inertialForcePerMeter, units: "N"}
      // F = mv2/r

      const movingRingsMassPortion = dParamWithUnits['movingRingsMassPortion'].value
      const movingRingsMassPerMeter = movingRingsMassPortion * totalMassPerMeterOfRings // Note this mass is shared by the number of rings 
      specs['movingRingsMassPerMeter'] = {value: movingRingsMassPerMeter, units: "kg"}
      const movingRingsAverageDensity = dParamWithUnits['movingRingsAverageDensity'].value
      const movingRingsVolumePerMeter = movingRingsMassPerMeter / movingRingsAverageDensity // Note this volume is shared by the number of rings 
      specs['movingRingsVolumePerMeter'] = {value: movingRingsVolumePerMeter, units: "m3"}
      const oneMeter = 1
      const numMainRings = dParamWithUnits['numMainRings'].value
      const movingRingsRadius = Math.sqrt(movingRingsVolumePerMeter / numMainRings / oneMeter / Math.PI)
      specs['movingRingsRadius'] = {value: movingRingsRadius, units: "m"}
      // We probably should have separate parameters for ringMaglevAirGap and the d value for air friction's' evacuated volume calculations
      const evacuatedVolumePerMeter = 2 * Math.PI * movingRingsRadius * dParamWithUnits['ringMaglevAirGap'].value
      specs['evacuatedVolumePerMeter'] = {value: evacuatedVolumePerMeter, units: "m3"}

      const movingRingsSpeed = Math.sqrt(inertialForcePerMeter * crv.mainRingRadius / movingRingsMassPerMeter)
      specs['movingRingsSpeed'] = {value: movingRingsSpeed, units: "m/s"}
      const movingRingsRotationalPeriod = mainRingCircumference / movingRingsSpeed
      specs['movingRingsRotationalPeriod'] = {value: movingRingsRotationalPeriod, units: "s"}
      const movingRingMinutesPerRotation = movingRingsRotationalPeriod / 60
      specs['movingRingMinutesPerRotation'] = {value: movingRingMinutesPerRotation, units: "minutes"}
      const movingRingsMassFlowRate = movingRingsMassPerMeter * movingRingsSpeed
      specs['movingRingsMassFlowRate'] = {value: movingRingsMassFlowRate, units: "kg/s"}
      const movingRingsTotalMass = movingRingsMassPerMeter * mainRingCircumference
      specs['movingRingsTotalMass'] = {value: movingRingsTotalMass, units: "kg"}
      const movingRingMaterialDensity = 3500 // kg/m3
      const movingRingsDiameterIfMadeIntoSphere = Math.pow(movingRingsTotalMass/movingRingMaterialDensity*3/4/Math.PI, 1/3) * 2
      specs['movingRingsDiameterIfMadeIntoSphere'] = {value: movingRingsDiameterIfMadeIntoSphere, units: "m"}
      const movingRingsTotalKineticEnergy = 0.5 * movingRingsTotalMass * movingRingsSpeed**2
      specs['movingRingsTotalKineticEnergy'] = {value: movingRingsTotalKineticEnergy, units: "J"}
      const movingRingsTotalKineticEnergyTWh = movingRingsTotalKineticEnergy / 3.6e+15
      //console.log(movingRingsTotalKineticEnergy, movingRingsTotalKineticEnergyTWh)
      specs['movingRingsTotalKineticEnergyTWh'] = {value: movingRingsTotalKineticEnergyTWh, units: "TWh"}
      const movingRingsTotalKineticEnergyEquivalentAntimatter = movingRingsTotalKineticEnergy / (180 * 1000000 * 1e9) // 180 MJ/microgram converted to J/kg
      specs['movingRingsTotalKineticEnergyEquivalentAntimatter'] = {value: movingRingsTotalKineticEnergyEquivalentAntimatter, units: "kg"}
      const movingRingsTotalKineticEnergyEquivalentHuricaneHours = movingRingsTotalKineticEnergy / (5.2E19 / 24) // https://science.howstuffworks.com/environmental/energy/energy-hurricane-volcano-earthquake1.htm#:~:text=If%20we%20crunch%20the%20numbers,generating%20capacity%20on%20the%20planet!
      specs['movingRingsTotalKineticEnergyEquivalentHuricaneHours'] = {value: movingRingsTotalKineticEnergyEquivalentHuricaneHours, units: "HuricaneHours"}
      const movingRingsKineticEnergyPerMeterOfRing = movingRingsTotalKineticEnergy / mainRingCircumference
      specs['movingRingsKineticEnergyPerMeterOfRing'] = {value: movingRingsKineticEnergyPerMeterOfRing, units: "J"}
      const wholesaleCostOfElectricity = dParamWithUnits['wholesaleCostOfElectricity'].value
      const movingRingsTotalKineticEnergyCost = movingRingsTotalKineticEnergy * wholesaleCostOfElectricity / oneBillion
      specs['movingRingsTotalKineticEnergyCost'] = {value: movingRingsTotalKineticEnergyCost, units: "Billion USD"}
      const movingRingsKineticEnergyCostPerMeterOfRing = movingRingsTotalKineticEnergyCost * oneBillion / mainRingCircumference
      specs['movingRingsKineticEnergyCostPerMeterOfRing'] = {value: movingRingsKineticEnergyCostPerMeterOfRing, units: "USD"}

      // Consider the case of an emergency shutdown of one ring where that ring's energy is transferred to the other rings. 
      const energyTransferEfficiency = 0.9
      const energyLostDuringTransfer = movingRingsTotalKineticEnergy/numMainRings*(1-energyTransferEfficiency)
      const energyRemainingAfterTransfer = movingRingsTotalKineticEnergy - energyLostDuringTransfer
      const speedOfOtherRingsAfterOneRingToOthersEnergyTransfer = Math.sqrt(energyRemainingAfterTransfer/0.5/(movingRingsTotalMass*(numMainRings-1)/numMainRings))
      specs['speedOfOtherRingsAfterOneRingToOthersEnergyTransfer'] = {value: speedOfOtherRingsAfterOneRingToOthersEnergyTransfer, units: "m/s"}
      const powerTransferTime = 24*3600 // seconds (one day)
      const powerDissipatedDuringOneRingToOthersEnergyTransferPerMeterOfRing = energyLostDuringTransfer / powerTransferTime / mainRingCircumference
      specs['powerDissipatedDuringOneRingToOthersEnergyTransferPerMeterOfRing'] = {value: powerDissipatedDuringOneRingToOthersEnergyTransferPerMeterOfRing, units: "W"}

      // Power to accellerate the moving ring
      const movingRingLinearMotorEfficiency = dParamWithUnits['movingRingLinearMotorEfficiency'].value
      const solarPanelReferenceTemperature = dParamWithUnits['solarPanelReferenceTemperature'].value
      const solarPanelAverageTemperature = dParamWithUnits['solarPanelAverageTemperature'].value  // ToDo: We need to compute this based on the ring's Altitude
      const solarPanelTemperatureEfficiencyFactor = dParamWithUnits['solarPanelTemperatureEfficiencyFactor'].value
      const solarPanelEfficiencyAtReferenceTemperature = dParamWithUnits['solarPanelEfficiencyAtReferenceTemperature'].value
      const solarPanelEfficiency = solarPanelEfficiencyAtReferenceTemperature * (1 - solarPanelTemperatureEfficiencyFactor * (solarPanelAverageTemperature - solarPanelReferenceTemperature))
      //console.log('solarPanelEfficiency', solarPanelEfficiency)
      const solarPanelMassPerMeterSquared = dParamWithUnits['solarPanelMassPerMeterSquared'].value
      const solarPanelCostPerWatt = dParamWithUnits['solarPanelCostPerWatt'].value
      const solarPanelMountMassPerMeterSquared = dParamWithUnits['solarPanelMountMassPerMeterSquared'].value
      const solarPanelPeakSolarPowerPerMeterSquared = dParamWithUnits['solarPanelPeakSolarPowerPerMeterSquared'].value
      const solarPowerAvailibilityFactor = dParamWithUnits['solarPowerAvailibilityFactor'].value
      const solarPanelWidth = dParamWithUnits['solarPanelWidth'].value
      const solarPanelsTotalSurfaceArea = solarPanelWidth * mainRingCircumference
      const solarPanelsTotalMass = solarPanelsTotalSurfaceArea * (solarPanelMassPerMeterSquared * solarPanelMountMassPerMeterSquared)
      specs['solarPanelTotalMass'] = {value: solarPanelsTotalMass, units: "kg"}
      const solarPanelsTotalPowerOutput = solarPanelsTotalSurfaceArea * solarPanelPeakSolarPowerPerMeterSquared * solarPanelEfficiency * solarPowerAvailibilityFactor
      specs['solarPanelsTotalPowerOutput'] = {value: solarPanelsTotalPowerOutput, units: "W"}
      const solarPanelsTotalPowerOutputPerMeterOfRing = solarPanelsTotalPowerOutput / mainRingCircumference
      specs['solarPanelsTotalPowerOutputPerMeterOfRing'] = {value: solarPanelsTotalPowerOutputPerMeterOfRing, units: "W"}
      const solarPanelPowerTransmissionLossFactor = 0.99 // 1% loss
      const windTurbinesTotalPowerOutput = 0  // ToDo
      const windTurbinePowerTransmissionLossFactor = 0.9 // ToDo: This represents the portion of wind turbine genrated power received at the ring after transmission line and transformer losses are acconted for
      const totalPowerToLinearMotors = solarPanelsTotalPowerOutput * solarPanelPowerTransmissionLossFactor + windTurbinesTotalPowerOutput * windTurbinePowerTransmissionLossFactor
      specs['totalPowerToLinearMotors'] = {value: totalPowerToLinearMotors, units: "W"}
      const timeToAccellerateMovingRings = movingRingsTotalKineticEnergy / (totalPowerToLinearMotors * movingRingLinearMotorEfficiency)
      specs['timeToAccellerateMovingRings'] = {value: timeToAccellerateMovingRings, units: "s"}
      const timeToAccellerateMovingRingsDays = timeToAccellerateMovingRings / (3600*24)
      // This is misleading because the ring will be sped up using terrestrial power soures while it's under the surface of the ocean, and then allowed to float upwards.
      // We only need to add power to increase it's altitude and speed while it's above the surface of the ocean, and to overcome losses.
      specs['timeToAccellerateMovingRingsDays'] = {value: timeToAccellerateMovingRingsDays, units: "days"}
      //console.log('timeToAccellerateMovingRingsDays', timeToAccellerateMovingRingsDays)
      const timeToAccellerateMovingRingsYears = timeToAccellerateMovingRingsDays / 365
      specs['timeToAccellerateMovingRingsYears'] = {value: timeToAccellerateMovingRingsYears, units: "years"}
      //console.log('timeToAccellerateMovingRingsYears', timeToAccellerateMovingRingsYears)

      const solarPanelMassPerMeterOfRing = solarPanelsTotalMass / mainRingCircumference
      specs['solarPanelMassPerMeterOfRing'] = {value: solarPanelMassPerMeterOfRing, units: "kg/m"}
      const ratedWattsPerKilogram = solarPanelEfficiencyAtReferenceTemperature * solarPanelPeakSolarPowerPerMeterSquared * solarPanelMassPerMeterSquared
      specs['ratedWattsPerKilogram'] = {value: ratedWattsPerKilogram, units: "W/kg"}
      const solarPanelsCostPerKg = solarPanelCostPerWatt / ratedWattsPerKilogram
      specs['solarPanelsCostPerKg'] = {value: solarPanelsCostPerKg, units: "USD/kg"}

      // Calculate the force of gravity acting on the moving ring...
      const fM = new tram.forceVector() // Vector representing the steady state magnetic levitation force aplied to the moving ring
      fM.z = fG.z * movingRingsMassPortion  // Note: fI.z is zero
      fM.ρ = fG.ρ * movingRingsMassPortion + fI.ρ
      fM.φ = 0   // No poloidal accellerations during steady state operation
      specs['magneticForceZComponent'] = {value: fM.z, units: "N"}
      specs['magneticForceRhoComponent'] = {value: fM.ρ, units: "N"}

      const magneticForcePerMeter = Math.sqrt(fM.z**2 + fM.ρ**2)
      specs['magneticForcePerMeter'] = {value: magneticForcePerMeter, units: "N"}

      // Check...
      // const fM2 = new tram.forceVector() // Vector representing the steady state magnetic levitation force aplied to the moving ring
      // fM2.z = fG.z * (1-movingRingsMassPortion) + fT.z
      // fM2.ρ = fG.ρ * (1-movingRingsMassPortion) + fT.ρ
      // const magneticForcePerMeter2 = Math.sqrt(fM2.z**2 + fM2.ρ**2)
      // if (verbose) console.log(magneticForcePerMeter)
      // if (verbose) console.log(magneticForcePerMeter2)

      // Calculate the current needed to generate the required magnetic forces, assuming here that we do not use permenant magnets for this
      const u_0 = dParamWithUnits['permeabilityOfFreeSpace'].value
      const u_r = dParamWithUnits['relativePermeabilityOfCore'].value
      const l_Fe = dParamWithUnits['ringMaglevFieldLoopLength'].value   // This is the length of the part of the portion of the magnetic field that travels through the core material in meters
      const s = dParamWithUnits['ringMaglevAirGap'].value
      const coreLength = dParamWithUnits['ringMaglevCoreCrossSectionLength'].value
      const coreWidth = dParamWithUnits['ringMaglevCoreCrossSectionWidth'].value
      const A = coreLength * coreWidth
      const n = dParamWithUnits['ringMaglevCoilsNumLoops'].value
      const magneticForcePerCore = magneticForcePerMeter * coreLength
      const alpha = 0
      // magneticForcePerCore = u_0 * (n*i / (l_Fe/u_r + 2*s))**2 * A * cos(alpha)
      // Rearrange to calculate the current...
      const currentPerElectromagnet = (l_Fe/u_r + 2*s) / n * Math.sqrt(magneticForcePerCore / (u_0 * A * Math.cos(alpha)))
      const currentPerMeterOfRing = currentPerElectromagnet / coreLength
      specs['currentPerMeterOfRing'] = {value: currentPerMeterOfRing, units: "A"}

      // Field strength within the air gap
      const airgapAreaPerMeter = coreWidth * 2
      const magneticFieldStrengthInAirgap = Math.sqrt(magneticForcePerMeter * u_0 / airgapAreaPerMeter)
      //const magneticFieldStrengthInAirgap = u_0 * (n * currentPerElectromagnet / (l_Fe/u_r + 2*s)) // (Some code that co-pilot suggested)
      specs['magneticFieldStrengthInAirgap'] = {value: magneticFieldStrengthInAirgap, units: "T"}

      // Calculate the current needed to generate the magnetic field
      const wireRadius = dParamWithUnits['wireRadius'].value
      const wireLength = n * (2 * (coreLength+2*wireRadius) + 2 * (coreWidth+2*wireRadius))
      let resistivityOfCoilConductor = dParamWithUnits['coilConductorMaterialResistivity'].value
      let densityOfCoilConductor = dParamWithUnits['coilConductorMaterialDensity'].value
      let costOfConductor = dParamWithUnits['coilConductorMaterialCost'].value
      const wireCrossSectionalArea = Math.PI * wireRadius**2
      const coilResistance = resistivityOfCoilConductor * wireLength / wireCrossSectionalArea
      specs['coilResistance'] = {value: coilResistance, units: "Ohms"}
      const coilPower = currentPerElectromagnet**2 * coilResistance
      specs['coilPower'] = {value: coilPower, units: "Watts"}
      const coilPowerPerMeterOfRing = coilPower / coreLength
      specs['coilPowerPerMeterOfRing'] = {value: coilPowerPerMeterOfRing, units: "Watts"}
      const totalCoilPower = coilPowerPerMeterOfRing * 2 * Math.PI * crv.mainRingRadius
      specs['totalCoilPower'] = {value: totalCoilPower, units: "Watts"}
      const totalCoilPowerPerYear = totalCoilPower * 365 * 24 * 3600
      specs['totalCoilPowerPerYear'] = {value: totalCoilPowerPerYear, units: "Joules"}
      const totalCoilPowerCostPerYear = totalCoilPowerPerYear * wholesaleCostOfElectricity / oneBillion
      specs['totalCoilPowerCostPerYear'] = {value: totalCoilPowerCostPerYear, units: "Billion USD"}
      const coilVolume = wireLength * Math.PI * wireRadius**2
      const coilMass = coilVolume * densityOfCoilConductor
      const coilMassPerMeterOfRing = coilMass / coreLength
      specs['coilMassPerMeterOfRing'] = {value: coilMassPerMeterOfRing, units: "kg"}
      const totalCoilMaterialCost = coilMassPerMeterOfRing * 2 * Math.PI * crv.mainRingRadius * costOfConductor / oneBillion
      specs['totalCoilMaterialCost'] = {value: totalCoilMaterialCost, units: "Billion USD"}

      // Calculate the mass of the core
      const portionOfCoreOnStationaryRing = dParamWithUnits['portionOfCoreOnStationaryRing'].value
      const coreLoopAverageRadius = l_Fe / Math.PI / 2
      const coreLoopInnerRadius = coreLoopAverageRadius - coreWidth/2
      const coreLoopOuterRadius = coreLoopAverageRadius + coreWidth/2
      const coreVolumePerMeter = Math.PI * (coreLoopOuterRadius**2 - coreLoopInnerRadius**2)
      const coreMaterialDensityIron = dParamWithUnits['coreMaterialDensityIron'].value
      const ringMaglevCoreMassPerMeter = coreVolumePerMeter * coreMaterialDensityIron
      specs['ringMaglevCoreMassPerMeter'] = {value: ringMaglevCoreMassPerMeter, units: "kg"}
      const totalCoreMaterialCost = ringMaglevCoreMassPerMeter * 2 * Math.PI * crv.mainRingRadius * dParamWithUnits['coreMaterialCostIron'].value / oneBillion
      specs['totalCoreMaterialCost'] = {value: totalCoreMaterialCost, units: "Billion USD"}
      stationaryRingBillOfMaterials.push({name: 'primaryMagnetCores', massPerMeter: ringMaglevCoreMassPerMeter * portionOfCoreOnStationaryRing, units: 'kg', costPerkg: dParamWithUnits['coreMaterialCostIron'].value})
      stationaryRingBillOfMaterials.push({name: 'secondaryMagnetCores', massPerMeter: ringMaglevCoreMassPerMeter * portionOfCoreOnStationaryRing, units: 'kg', costPerkg: dParamWithUnits['coreMaterialCostIron'].value})
      stationaryRingBillOfMaterials.push({name: 'primaryMagnetCoils', massPerMeter: coilMassPerMeterOfRing, units: 'kg', costPerkg: costOfConductor})
      stationaryRingBillOfMaterials.push({name: 'secondaryMagnetCoils', massPerMeter: coilMassPerMeterOfRing, units: 'kg', costPerkg: costOfConductor})
      stationaryRingBillOfMaterials.push({name: 'tubeWalls', massPerMeter: 1, units: 'kg', costPerkg: .50})
      stationaryRingBillOfMaterials.push({name: 'tubeAirfoil', massPerMeter: 1, units: 'kg', costPerkg: .50})
      stationaryRingBillOfMaterials.push({name: 'electronics', massPerMeter: 1, units: 'kg', costPerkg: 10})
      stationaryRingBillOfMaterials.push({name: 'thermalManagement', massPerMeter: 1, units: 'kg', costPerkg: 1})
      stationaryRingBillOfMaterials.push({name: 'vacuumPumps', massPerMeter: 1, units: 'kg', costPerkg: 1})
      stationaryRingBillOfMaterials.push({name: 'mechanicalIsolation', massPerMeter: 1, units: 'kg', costPerkg: 1})
      stationaryRingBillOfMaterials.push({name: 'aeronaticStabilizers', massPerMeter: 1, units: 'kg', costPerkg: 10})
      stationaryRingBillOfMaterials.push({name: 'solarPanels', massPerMeter: solarPanelMassPerMeterOfRing, units: 'kg', costPerkg: solarPanelsCostPerKg})
      
      // Operating Costs - Air friction
      const massOfGasMolucule = 4.65e-26 // kg for N2 
      const boltzmannConstant = 1.38e-23 // J/˚K
      const absoluteTemperatureInsideStationaryRing = 273.3 // ˚K
      const wallToWallDistance = 0.001
      const rootMeanSquareSpeedOfGasMolecule = Math.sqrt(3 * boltzmannConstant * absoluteTemperatureInsideStationaryRing / massOfGasMolucule)
      const wallToWallSpeedOfGasMolecule = rootMeanSquareSpeedOfGasMolecule / 3
      specs['rootMeanSquareSpeedOfGasMolecule'] = {value: rootMeanSquareSpeedOfGasMolecule, units: "m/s"}

      const roundTripTimeOfGasMolecule = 2 * wallToWallDistance / wallToWallSpeedOfGasMolecule
      specs['roundTripTimeOfGasMolecule'] = {value: roundTripTimeOfGasMolecule, units: "s"}
      const kineticEnergyTransferredToGasMolecule = 1/2 * massOfGasMolucule * movingRingsSpeed**2
      specs['kineticEnergyTransferredToGasMolecule'] = {value: kineticEnergyTransferredToGasMolecule, units: "Joules"}
      const PowerLossPerMolecule = kineticEnergyTransferredToGasMolecule / roundTripTimeOfGasMolecule
      specs['PowerLossPerMolecule'] = {value: PowerLossPerMolecule, units: "Watts"}
      // Note: Confusing, but PerMeterOfRing" refers to all 'numMainRings' rings as opposed to an individual ring
      const volumeOfVacuumPerMeterOfRing = Math.PI * ((movingRingsRadius+wallToWallDistance)**2 - movingRingsRadius**2) * oneMeter * numMainRings
      specs['volumeOfVacuumPerMeterOfRing'] = {value: volumeOfVacuumPerMeterOfRing, units: "m^3/m"}
      const numMoleculesInVacuumPerUnitOfPressure = volumeOfVacuumPerMeterOfRing / boltzmannConstant / absoluteTemperatureInsideStationaryRing 
      specs['numMoleculesInVacuumPerUnitOfPressure'] = {value: numMoleculesInVacuumPerUnitOfPressure, units: "molecules/m/Pa"}
      const powerLossPerMeterOfRingPerUnitOfPressure = PowerLossPerMolecule * numMoleculesInVacuumPerUnitOfPressure
      specs['powerLossPerMeterOfRingPerUnitOfPressure'] = {value: powerLossPerMeterOfRingPerUnitOfPressure, units: "Watts/m/Pa"}
      const vaccumeLevelForLIGOInTorr = 1e-9 // same as 10**-9
      const vaccumeLevelForLIGOInPa = vaccumeLevelForLIGOInTorr * 133.322
      const powerLossPerMeterOfRingAtLIGOVacuumLevel = powerLossPerMeterOfRingPerUnitOfPressure * vaccumeLevelForLIGOInPa
      specs['powerLossPerMeterOfRingAtLIGOVacuumLevel'] = {value: powerLossPerMeterOfRingAtLIGOVacuumLevel, units: "Watts/m"}

      movingRingBillOfMaterials.push({name: 'primaryMagnetCores', massPerMeter: ringMaglevCoreMassPerMeter * (1 - portionOfCoreOnStationaryRing), units: 'kg', costPerkg: dParamWithUnits['coreMaterialCostIron'].value})
      // ToDo - Assuming here that secondary magnet cores total same mass as primary but need more accurate calculation...
      movingRingBillOfMaterials.push({name: 'secondaryMagnetCore', massPerMeter: ringMaglevCoreMassPerMeter * (1 - portionOfCoreOnStationaryRing), units: 'kg', costPerkg: dParamWithUnits['coreMaterialCostIron'].value})
      movingRingBillOfMaterials.push({name: 'primaryMagnetPermanentMagnets', massPerMeter: 1, units: 'kg', costPerkg: 10})  // TBD
      let movingRingComponentsMass = 0
      movingRingBillOfMaterials.forEach(material => {
        movingRingComponentsMass += material['massPerMeter']
      })
      let remainingMass = movingRingsMassPerMeter - movingRingComponentsMass
      const bulkMaterialCost = dParamWithUnits['bulkMaterialCost'].value
      movingRingBillOfMaterials.push({name: 'bulkMaterial', massPerMeter: remainingMass, units: 'kg', costPerkg: bulkMaterialCost})
      // ToDo - Should add a check here to make sure that the remaining mass is not too small, or less than zero

      let stationaryRingsMassPerMeter = 0
      let stationaryRingsCostPerMeter = 0
      stationaryRingBillOfMaterials.forEach(material => {
        stationaryRingsMassPerMeter += material['massPerMeter']
        material['costPerMeter'] = material['massPerMeter'] * material['costPerkg']
        stationaryRingsCostPerMeter += material['costPerMeter']
      })
      specs['stationaryRingsMassPerMeter'] = {value: stationaryRingsMassPerMeter, units: "kg"}
      specs['stationaryRingsCostPerMeter'] = {value: stationaryRingsCostPerMeter, units: "USD"}
      const stationaryRingsTotalMass = stationaryRingsMassPerMeter * mainRingCircumference
      specs['stationaryRingsTotalMass'] = {value: stationaryRingsTotalMass, units: "kg"}
      const stationaryRingsMassPortion = stationaryRingsMassPerMeter / totalMassPerMeterOfRings
      specs['stationaryRingsMassPortion'] = {value: stationaryRingsMassPortion, units: ""}

      let movingRingsMassPerMeter2 = 0
      let movingRingsCostPerMeter2 = 0
      movingRingBillOfMaterials.forEach(material => {
        movingRingsMassPerMeter2 += material['massPerMeter']
        material['costPerMeter'] = material['massPerMeter'] * material['costPerkg']
        movingRingsCostPerMeter2 += material['costPerMeter']
      })
      specs['movingRingsMassPerMeter2'] = {value: movingRingsMassPerMeter2, units: "kg"}
      specs['movingRingsCostPerMeter2'] = {value: movingRingsCostPerMeter2, units: "USD"}
      const movingRingsTotalMass2 = movingRingsMassPerMeter2 * mainRingCircumference
      specs['movingRingsTotalMass2'] = {value: movingRingsTotalMass2, units: "kg"}
      
      const tetheredRingMassPerMeterOfRingUnloaded = stationaryRingsMassPerMeter + movingRingsMassPerMeter2 + tetherFiberMassPerMeterOfRing
      specs['tetheredRingMassPerMeterOfRingUnloaded'] = {value: tetheredRingMassPerMeterOfRingUnloaded, units: 'kg'}
      if (verbose) console.log('stationaryRingsMassPerMeter', stationaryRingsMassPerMeter)
      if (verbose) console.log('movingRingsMassPerMeter2', movingRingsMassPerMeter2)
      if (verbose) console.log('tetherFiberMassPerMeterOfRing', tetherFiberMassPerMeterOfRing)
      if (verbose) console.log('tetheredRingMassPerMeterOfRingUnloaded', tetheredRingMassPerMeterOfRingUnloaded)
      const tetheredRingTotalMassUnloaded = tetheredRingMassPerMeterOfRingUnloaded * mainRingCircumference
      specs['tetheredRingTotalMassUnloaded'] = {value: tetheredRingTotalMassUnloaded, units: 'kg'}
      if (verbose) console.log('tetheredRingTotalMassUnloaded', tetheredRingTotalMassUnloaded)
      //if (verbose) console.log('currentPerMeterOfRing', currentPerMeterOfRing)

      const loadMassPerMeter = totalMassPerMeterOfRings - movingRingsMassPerMeter2 - stationaryRingsMassPerMeter
      specs['loadMassPerMeter'] = {value: loadMassPerMeter, units: "kg"}
      if (verbose) console.log('loadMassPerMeter', loadMassPerMeter)
      const totalLoadMass = loadMassPerMeter * mainRingCircumference
      specs['totalLoadMass'] = {value: totalLoadMass, units: "kg"}
      const loadMassPortion = loadMassPerMeter / totalMassPerMeterOfRings  // Not including the tethers
      specs['loadMassPortion'] = {value: loadMassPortion, units: ""}
      if (verbose) console.log('loadMassPortion', loadMassPortion)

      let sumOfAllCapitalCosts = 0
      sumOfAllCapitalCosts += tetherFiberTotalCost
      sumOfAllCapitalCosts += movingRingsTotalKineticEnergyCost
      sumOfAllCapitalCosts += totalCoilMaterialCost
      sumOfAllCapitalCosts += totalCoreMaterialCost
      // Need to estimate and add the cost of the tubes

      specs['sumOfAllCapitalCosts'] = {value: sumOfAllCapitalCosts, units: "Billion USD"}
      const capitalCostPerMeter = sumOfAllCapitalCosts / mainRingCircumference * oneBillion
      specs['capitalCostPerMeter'] = {value: capitalCostPerMeter, units: "USD"}
      const capitalCostPerKgSupported = capitalCostPerMeter / Math.max(0.00001, loadMassPerMeter)
      specs['capitalCostPerKgSupported'] = {value: capitalCostPerKgSupported, units: "USD/kg"}
      if (verbose) console.log('capitalCostPerKgSupported', capitalCostPerKgSupported)

      const energyStorageCost = sumOfAllCapitalCosts*1000000000 / movingRingsTotalKineticEnergy
      specs['energyStorageCost'] = {value: energyStorageCost, units: "USD/J"}
      const energyStorageCostPerKWh = energyStorageCost * 3600000
      specs['energyStorageCostPerKWh'] = {value: energyStorageCostPerKWh, units: "USD/KWh"}

      if (verbose) console.log('Stationary Ring BOM', stationaryRingBillOfMaterials)
      if (verbose) console.log('Moving Ring BOM', movingRingBillOfMaterials)

      // const transitSystemMassPerMeter = dParamWithUnits['transitSystemMassPerMeter'].value
      // const transitSystemCostPerMeter = transitSystemMassPerMeter * capitalCostPerKgSupported + dParamWithUnits['transitSystemMaterialsCostPerMeter'].value
      // specs['transitSystemCostPerMeter'] = {value: transitSystemCostPerMeter, units: "USD/m"}

      const maglevComponentMassOverForceRatio = (movingRingComponentsMass + stationaryRingsMassPerMeter) / magneticForcePerMeter
      specs['maglevComponentMassOverForceRatio'] = {value: maglevComponentMassOverForceRatio, units: "kg/N"}
      //console.log('maglevComponentMassOverForceRatio', maglevComponentMassOverForceRatio)

      // Solar Panel Station Keeping Costs
      const a = dParamWithUnits['ringFinalAltitude'].value
      const airDensityAtAltitude = tram.airDensityAtAltitude(a)
      specs['airDensityAtAltitude'] = {value: airDensityAtAltitude, units: "kg/m3"}
      //console.log('airDensityAtAltitude', airDensityAtAltitude)
      const Cd = 1.28 // Coefficient of drag for a flat plate.
      const windSpeed = 28 // m/s
      const area = 1 // m2
      const forceAppliedByWind = 0.5 * Cd * airDensityAtAltitude * windSpeed**2 * area 
      specs['forceAppliedByWind'] = {value: forceAppliedByWind, units: "N"}
      //console.log('forceAppliedByWind', forceAppliedByWind)
      const propulsivePowerRequired = 0.5 * Cd * airDensityAtAltitude * windSpeed**3 * area   // This is the power it takes to propel the plate through an airstream. 
      specs['propulsivePowerRequired'] = {value: propulsivePowerRequired, units: "W"}
      //console.log('propulsivePowerRequired', propulsivePowerRequired)
    }

  }
}

export {TetherGeometry}