import {
	BufferGeometry,
	Vector3
} from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
import * as tram from './tram.js'

class TetherGeometry extends BufferGeometry {

	constructor(radiusOfPlanet, gravitationalConstant, massOfPlanet, crv, dParamWithUnits, specs, fastTetherRender, genKMLFile, kmlFile) {
		super();

        const tetherPoints = []
        const tetherIndices = []  // These indices index points in tetherPoints, reusing them to save memory
        const tetherStrips = []   // This array will store other arrays that will each define a "strip" of points
        const mrr = 10000 //crv.mainRingRadius
        
        tetherMath()       // Regenerate the strips of points that define a forking tether
        // Tethered Ring Math
        function tetherMath() {
          // Inputs:
          // gravitationalConstant, radiusOfPlanet, massOfPlanet
          // dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value, dParamWithUnits['massPerMeterOfRing'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['tetherEngineeringFactor'].value, dParamWithUnits['numForkLevels'].value, dParamWithUnits['tetherPointBxAvePercent'].value, dParamWithUnits['tetherPointBxDeltaPercent'].value
          // tetherMaterialDensity, tetherStress
      
          const final_r = radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value
          console.log(final_r)
      
          const m = dParamWithUnits['massPerMeterOfRing'].value
          const fExertedByGravityOnRing = gravitationalConstant * massOfPlanet * m / (final_r**2)
          
          // The following vectors are cylindricl coordinates
          const fG = new tram.forceVector() // Vector representing the force of gravity at a point on the tether in ring-centered cylindrical coordinates
          const fT = new tram.forceVector() // Vector representing the tensile force exerted at a point on the tether in ring-centered cylindrical coordinates
          const fI = new tram.forceVector() // Vector representing the force of gravity at a point on the tether in ring-centered cylindrical coordinates
      
          fG.ρ = -fExertedByGravityOnRing * Math.cos(dParamWithUnits['equivalentLatitude'].value)
          fG.φ = 0
          fG.z = -fExertedByGravityOnRing * Math.sin(dParamWithUnits['equivalentLatitude'].value)
          fT.z = -fG.z                     // Eq 6
      
          const tetherStress = dParamWithUnits['tetherMaterialTensileStrength'].value*1000000 / dParamWithUnits['tetherEngineeringFactor'].value
          const aveForceOfGravity = gravitationalConstant * massOfPlanet * 1 / ((radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value / 2)**2)
          const c = tetherStress / dParamWithUnits['tetherMaterialDensity'].value / aveForceOfGravity  // We're using the average force of gravity here as an engineering approximation (Eq 17)
          
          // Initially we will assume that PointB is at x=0 on the catenary. This is done just so that we can calculate a temporary "PointP.x", 
          // and then set PointB.x as a percentage of this temporarty PointP.x. 
          const tempPointP = new tram.cateneryVector()
          tempPointP.y = dParamWithUnits['ringFinalAltitude'].value
          tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y/c))      // Eq 11
          tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y/c))      // Eq 13b
          
          const tetherTypes = [[], []]
          const finalCatenaryTypes = [[], []]                          // Shape of the catenary after the ring is raised to full height - used to "design" the thethers.
          const currentCatenaryTypes = [[], []]                        // Shape of the catenery for the portion of the tethers that are off the ground when the ring is less than fully elevated   
          const finalTetherLength = []
          const currentTetherLength = []
          const numTetherSegments = (2 ** (dParamWithUnits['numForkLevels'].value+1)) - 1       // Starting from anchor, after each fork the distance to the next fork (or attacment point) is halved
          const numTetherPoints = numTetherSegments + 1                // Because, for example, it takes 5 points to speify 4 segments
      
          specs['tetherSpacing'] = {value: 2 * crv.mainRingRadius * Math.PI / dParamWithUnits['numTethers'].value, units: "m"}
      
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
      
            const points = [pointB, pointP]
            const label = ['B', 'P']
            points.forEach((point, k) => {
              point.crossSectionalArea = point.T/tetherStress * Math.cosh(point.s/c)        // Eq 14
              // These are simplifed rough calculations. They will help to reveal errors in more precice calculations performed later.
              // There's a cosine effect that will increase stress on the tethers in proportion to their ω angle
              specs['numAnchorPoints_'+label[k]+j] = {value: 2**(k*dParamWithUnits['numForkLevels'].value), units: ""}
              specs['tetherCrossSectionalArea_'+label[k]+j] = {value: point.crossSectionalArea * specs['tetherSpacing'].value / specs['numAnchorPoints_'+label[k]+j].value, units: "m2"}
              specs['tetherDiameter_'+label[k]+j] = {value: 2 * Math.sqrt(specs['tetherCrossSectionalArea_'+label[k]+j].value / 2 / Math.PI), units: "m"}  // because: d = 2*r = 2*sqrt(a/2/pi)
              specs['tetherForce_'+label[k]+j] = {value: specs['tetherCrossSectionalArea_'+label[k]+j].value * tetherStress, units: "N"}
            })
            specs['tetherLength_Rough'+j] = {value: pointP.s - pointB.s, units: "m"}       // Note: Does not account for forks
            specs['tetherVolume_Rough'+j] = {
              value: specs['tetherLength_Rough'+j].value * (
                (specs['tetherCrossSectionalArea_'+label[0]+j].value * specs['numAnchorPoints_'+label[0]+j].value) +
                (specs['tetherCrossSectionalArea_'+label[1]+j].value * specs['numAnchorPoints_'+label[1]+j].value)
                ) / 2,
              units: "m3"}
            specs['tetherMass_Rough'+j] = {value: specs['tetherVolume_Rough'+j].value * dParamWithUnits['tetherMaterialDensity'].value, units: "kg"}
          })
          specs['tetherMaterialTotalMass_Rough'] = {value: (specs['tetherMass_Rough'+0].value + specs['tetherMass_Rough'+1].value) / 2 * dParamWithUnits['numTethers'].value, units: "kg"}
          specs['tetherEqCO2TotalMass_Rough'] = {value: specs['tetherMaterialTotalMass_Rough'].value * 44/12, units: "kg"}
          specs['tetherCost_Rough'] = {value: specs['tetherMaterialTotalMass_Rough'].value * dParamWithUnits['tetherMaterialCost'].value / 1000000000, units: "Billion USD"}
      
          // At this point the final length of the tethers (measured along the catenary) is known, but the tethers current shape is still
          // a function of its state of deployment.
          // The next steps involve calculating the catenary for the current state of deployment, and then mapping the tether design onto that catenary. 
      
          const r = Math.sqrt(crv.yc*crv.yc + crv.mainRingRadius*crv.mainRingRadius)
      
          tempPointP.y = r - radiusOfPlanet
          tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y/c))      // Eq 11
          tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y/c))      // Eq 13b
          
          const pointB_s = []
          
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
            const ω_P = -(Math.PI/2 - crv.currentEquivalentLatitude)   // negative because angle increases in clockwise direction
            fT.ρ = fT.z / (Math.tan(pointP.θ+ω_P))         // Eq 20
            fI.ρ = -fG.ρ - fT.ρ                           // Eq 21
      
            currentTetherLength[j] = pointP.s - pointB.s
            
            for (let i = 0; i<=numTetherPoints-1; i++) {
              const sFraction = i / (numTetherPoints-1)
              const s = pointB.s + currentTetherLength[j] - finalTetherLength[j] * (1 - sFraction)
              // Compute a distance from the center of the planet and a angle from the ring's axis of symmetry
              const x = 2 * c * Math.atan(Math.exp(s/c)) - (c * Math.PI / 2)   // Eq 15
              const y = c * Math.log(Math.cosh(s/c))                           // Eq 16
              const r = radiusOfPlanet + (y - pointB.y)
              const ω_anchor = ω_P + (pointP.x-pointB.x) / radiusOfPlanet     // Left this unreduced to make it a bit easier to understand the logic
              const ω = ω_anchor - (x-pointB.x) / radiusOfPlanet
              catenaryType.push(new tram.CatenaryPolarVec3(r, ω, s))
            }
          })
      
          // Dang it!!! I reused 'θ' here so now it has two meanings. It has one meaning in the catenary-of-constant-stress formula and another in the spherical coordinate system in which the tethers are generated.
          // Super sorry! Will add to my backlog.
          class Branch {
            constructor(base_point, base_dr, base_dω, base_dθ, target_point, target_dr, target_dω, target_dθ) {
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
            }
          }
      
          if (fastTetherRender) {
            // The 'j' index is used to stagger the tethers 
            // We are assuming here that the ring has a constant altitude, so we can create just two types of tethers and reuse them over and over again, all the way around the ring. 
            // This improves model performance, but it is not accurate for at least two reasons. 1) The earth is a obique spheroid. 2) Economics will no doubt favor a design that is
            // not perfectly circular nor at a constant atitude.
            const referencePoint = new Vector3().setFromSphericalCoords(radiusOfPlanet + crv.currentMainRingAltitude, -(Math.PI/2 - crv.currentEquivalentLatitude), 0)
            tetherTypes.forEach((tetherType, j) => {
              const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
              makeTetherStrips(j, θ, referencePoint)
            })
          }
          else {
            for (let j = 0; j<dParamWithUnits['numTethers'].value; j++) {
            //for (let j = dParamWithUnits['numTethers'].value*28/32; j<dParamWithUnits['numTethers'].value*29/32; j++) {
              const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
              const referencePoint = new Vector3(0, 0, 0)
              makeTetherStrips(j, θ, referencePoint)
            }
          }
      
          function makeTetherStrips(j, θ, referencePoint) {
            const jModNumTypes = j % currentCatenaryTypes.length
            const catenaryPoints = currentCatenaryTypes[jModNumTypes]
            // Spherical coordinates (r, ω, θ) are defined using three.js convention, where ω is the polar angle, θ is the equitorial angle 
            let r_0 = catenaryPoints[0].r
            let ω_0 = catenaryPoints[0].ω
            let s_0 = catenaryPoints[0].s
            let r_1
            let ω_1
            let s_1
            let branches = []
            branches.push(new Branch(0, 0.0, 0.0, 0.0, numTetherPoints, 0.0, 0.0, 0.0))  // This defines the trunk of the tether
      
            const mro = (dParamWithUnits['numMainRings'].value - 1)/2
            for (let i = 0; i<=numTetherPoints-2; i++) {
              r_1 = catenaryPoints[i+1].r
              ω_1 = catenaryPoints[i+1].ω
              s_1 = catenaryPoints[i+1].s
      
              if ((s_0<pointB_s[jModNumTypes]) && (pointB_s[jModNumTypes]<s_1)) {
                // We need to recalculate the r_0, ω_0 values more accurately by using lerps...
                const frac = (pointB_s[jModNumTypes]-s_0)/(s_1-s_0)
                r_0 = tram.lerp(r_0, r_1, frac)
                ω_0 = tram.lerp(ω_0, ω_1, frac)
              }
      
              if ((i>0) && (Number.isInteger(Math.log2(numTetherPoints-i)))) {      // If we're at a point where the tether segments fork...
                const logNumStays = dParamWithUnits['numForkLevels'].value + 1 - Math.log2(numTetherPoints-i)
                const tetherSpan = 2 * Math.PI / dParamWithUnits['numTethers'].value * dParamWithUnits['tetherSpanOverlapFactor'].value
                const target_dθ_Alteration = tetherSpan/(2**(logNumStays+1))
                branches.forEach((branch, index) => {
                  if (i<numTetherPoints-2) {
                    // Create two new branches, then delete the original
                    branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ + target_dθ_Alteration))
                    branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ - target_dθ_Alteration))
                  }
                  else {
                    for (let k = 0; k<dParamWithUnits['numMainRings'].value; k++) {
                      const target_dr_Alteration = (k-mro)*dParamWithUnits['mainRingSpacing'].value * Math.sin(crv.constructionEquivalentLatitude)
                      const target_dω_Alteration = (k-mro)*dParamWithUnits['mainRingSpacing'].value * Math.cos(crv.constructionEquivalentLatitude) / r_0    // Dividing by r_0 is an approximation, a better r value may be needed for perfect accuracy
                      branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr + target_dr_Alteration, branch.target_dω + target_dω_Alteration, branch.target_dθ + target_dθ_Alteration))
                      branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr - target_dr_Alteration, branch.target_dω - target_dω_Alteration, branch.target_dθ - target_dθ_Alteration))
                    }
                  }
                  delete branches[index]    // Some advice out there says not to use delete because then len() will return wrong results, but it's efficient at this task
                })
              }
              branches.forEach((branch) => {
                const alpha = (i+1 - branch.base_point)/(numTetherPoints-1 - branch.base_point)
                branch.dr_1 = tram.lerp(branch.base_dr, branch.target_dr, alpha)
                branch.dω_1 = tram.lerp(branch.base_dω, branch.target_dω, alpha)
                branch.dθ_1 = tram.lerp(branch.base_dθ, branch.target_dθ, alpha)
                if (s_1>pointB_s[jModNumTypes]) {   // When raising the ring, points on the parts of the tether that are on the spool have all have the same coordinates (i.e. the spool's coordinates).
                  if (s_0<pointB_s[jModNumTypes]) {
                    // We need to recalculate the branch.dr_0 and branch.dθ_0 values more accurately by using a lerp...
                    // Note, this code doesn't recalculate the values correctly for the final tether branches that fork away vertically 
                    const frac = (pointB_s[jModNumTypes]-s_0)/(s_1-s_0)
                    branch.dr_0 = tram.lerp(branch.dr_0, branch.dr_1, frac)
                    branch.dω_0 = tram.lerp(branch.dω_0, branch.dω_1, frac)
                    branch.dθ_0 = tram.lerp(branch.dθ_0, branch.dθ_1, frac)
                  }
                  if (branch.stripIndex==-1) {
                    // Start a new array for the strip, add it to the array of arrays, and register its index with the branch object 
                    branch.stripIndex = tetherStrips.push( [] ) - 1
                    // Push the branch's first point onto the tether stirps array 
                    const point = new Vector3().setFromSphericalCoords(r_0 + branch.dr_0, ω_0 + branch.dω_0, θ + branch.dθ_0)
                    const absolutePoint = new Vector3().setFromSphericalCoords(r_0 + branch.dr_0, ω_0 + branch.dω_0, θ + branch.dθ_0)
                    tetherStrips[branch.stripIndex].push( absolutePoint.sub(referencePoint) )
                  }
                  const absolutePoint = new Vector3().setFromSphericalCoords(r_1 + branch.dr_1, ω_1 + branch.dω_1, θ + branch.dθ_1)
                  tetherStrips[branch.stripIndex].push( absolutePoint.sub(referencePoint) )
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
          tetherStrips.forEach(strip => {
            strip.forEach((point, i) => {
              tetherPoints.push(point)
              if (i>0) {
                tetherIndices.push(numIndices-1)
                tetherIndices.push(numIndices)
              }
              numIndices++
            })
          })
          
          // Add tether points to KML file
          if (genKMLFile) {
            planetCoordSys.updateWorldMatrix(true)
            tetheredRingLonCoordSys.updateMatrixWorld(true)
            tetheredRingLatCoordSys.updateMatrixWorld(true)
            tetheredRingRefCoordSys.updateMatrixWorld(true)
      
            tetherStrips.forEach(strip => {
              kmlFile = kmlFile.concat(kmlutils.kmlTetherPlacemarkHeader)
              strip.forEach((point) => {
                const xyzWorld = tetheredRingRefCoordSys.localToWorld(point.clone())
                const xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
                const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
                //const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
                const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
                kmlFile = kmlFile.concat(coordString)
              })
              kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)
            })
            kmlFile = kmlFile.concat(kmlutils.kmlFileFooter)
          }
        }
      
        this.setFromPoints(tetherPoints)
        this.setIndex(tetherIndices)
        // this.setAttribute( 'position', new THREE.Float32BufferAttribute( tetherPoints, 3 ) );
        // this.setAttribute( 'color', new THREE.Float32BufferAttribute( tetherColors, 3 ) );
        this.computeBoundingSphere()
        tetherPoints.splice(0, tetherPoints.length)   // Frees the memory used for these points
        tetherIndices.splice(0, tetherIndices.length)   // Frees the memory used for these points
        tetherStrips.splice(0, tetherStrips.length)   // Frees the memory used for these points
    }
}

export {TetherGeometry}