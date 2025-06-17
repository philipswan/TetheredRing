import * as THREE from 'three'
import * as tram from './Tram.js'
import * as regression from 'regression'
import bspline from 'b-spline'
// import { StarshipIFT1 } from './datasets/StarshipIFT1.js'
// import { StarshipIFT2 } from './datasets/StarshipIFT2.js'
// import { StarshipIFT3 } from './datasets/StarshipIFT3.js'
// import { StarshipIFT4 } from './datasets/StarshipIFT4.js'
// import { StarshipIFT5 } from './datasets/StarshipIFT5.js'
// import { StarshipIFT6 } from './datasets/StarshipIFT6.js'
// import { StarshipIFT7 } from './datasets/StarshipIFT7.js'
import { StarshipIFT8 } from './datasets/StarshipIFT8.js'

export class ExtractedTelemetryLoader {
  constructor() {
  }

  loadExtractedTelemetry(dParamWithUnits, xyChart) {

    const empiricalData = {}

    const curves = []
    //curves.push({prefix: "IFT1", dataset: StarshipIFT1, color: tram.tab10Colors[1].hex, colorName: tram.tab10Colors[1].name})
    //curves.push({prefix: "IFT2", dataset: StarshipIFT2, color: tram.tab10Colors[2].hex, colorName: tram.tab10Colors[2].name})
    //curves.push({prefix: "IFT3", dataset: StarshipIFT3, color: tram.tab10Colors[3].hex, colorName: tram.tab10Colors[3].name})
    //curves.push({prefix: "IFT4", dataset: StarshipIFT4, color: tram.tab10Colors[4].hex, colorName: tram.tab10Colors[4].name})
    //curves.push({prefix: "IFT5", dataset: StarshipIFT5, color: tram.tab10Colors[5].hex, colorName: tram.tab10Colors[5].name})
    //curves.push({prefix: "IFT6", dataset: StarshipIFT6, color: tram.tab10Colors[6].hex, colorName: tram.tab10Colors[6].name})
    //curves.push({prefix: "IFT7", dataset: StarshipIFT7, color: tram.tab10Colors[8].hex, colorName: tram.tab10Colors[8].name})
    curves.push({ prefix: "IFT8", dataset: StarshipIFT8, color: tram.tab10Colors[9].hex, colorName: tram.tab10Colors[9].name })

    curves.forEach(curve => {
      curve.dataset.forEach(entry => {
        if ((entry.boost_speed != "NaN") && (entry.boost_speed_conf > 75)) {
          if (curve.boostSpeed === undefined) curve.boostSpeed = []
          curve.boostSpeed.push(new THREE.Vector3(entry.timeInSec, entry.boost_speed / 3.6))
          const l = curve.boostSpeed.length
          if ((l > 2) && (Math.abs(curve.boostSpeed[l - 1].y - curve.boostSpeed[l - 2].y) > 100)) {
            console.log("boostSpeed", entry.timeInSec, entry.boost_speed)
          }
        }

        if ((entry.boost_alt != "NaN") && (entry.boost_alt_conf > 90)) {
          if (curve.boostAlt === undefined) curve.boostAlt = []
          curve.boostAlt.push(new THREE.Vector3(entry.timeInSec, entry.boost_alt * 1000))
          const l = curve.boostAlt.length
          if ((l > 2) && (Math.abs(curve.boostAlt[l - 1].y - curve.boostAlt[l - 2].y) > 1000)) {
            console.log("boostAlt", entry.timeInSec, entry.boost_alt)
          }
        }

        if ((entry.ship_speed != "NaN") && (entry.ship_speed_conf > 90)) {
          if (curve.shipSpeed === undefined) curve.shipSpeed = []
          // Ship data is not reliable until after the booster has separated
          if ((Math.abs(entry.ship_speed - entry.boost_speed) > 2) && (entry.timeInSec < 140)) {
            entry.ship_speed = entry.boost_speed
          }
          curve.shipSpeed.push(new THREE.Vector3(entry.timeInSec, entry.ship_speed / 3.6))
          const l = curve.shipSpeed.length
          if ((l > 2) && (Math.abs(curve.shipSpeed[l - 1].y - curve.shipSpeed[l - 2].y) > 100)) {
            console.log("shipSpeed", entry.timeInSec, entry.ship_speed)
          }
        }

        if ((entry.ship_alt != "NaN") && (entry.ship_alt_conf > 90)) {
          // Ship data is not reliable until after the booster has separated
          if ((Math.abs(entry.ship_alt - entry.boost_alt) > 2) && (entry.timeInSec < 140)) {
            entry.ship_alt = entry.boost_alt
          }
          if (curve.shipAlt === undefined) curve.shipAlt = []
          curve.shipAlt.push(new THREE.Vector3(entry.timeInSec, entry.ship_alt * 1000))
          const l = curve.shipAlt.length
          // if ((l > 2) && (Math.abs(curve.shipAlt[l - 1].y - curve.shipAlt[l - 2].y) > 1000)) {
          //   console.log("ShipAlt", entry.timeInSec, entry.ship_alt)
          // }
        }

        const s1PropMass = dParamWithUnits['rocketStage1PropellantMass'].value
        const s2PropMass = dParamWithUnits['rocketStage2PropellantMass'].value
        const fuelPortion = dParamWithUnits['rocketFuelPortion'].value 
        if ((entry.boost_lox != "NaN") && (entry.boost_lox_conf > 98)) {
          if (curve.boostLOX === undefined) curve.boostLOX = []
          const boostLOXMass = (1-fuelPortion) * s1PropMass
          curve.boostLOX.push(new THREE.Vector3(entry.timeInSec, entry.boost_lox * boostLOXMass))
        }

        if ((entry.boost_ch4 != "NaN") && (entry.boost_ch4_conf > 98)) {
          if (curve.boostCH4 === undefined) curve.boostCH4 = []
          const boostCH4Mass = fuelPortion * s1PropMass
          curve.boostCH4.push(new THREE.Vector3(entry.timeInSec, entry.boost_ch4 * boostCH4Mass))
        }

        if ((entry.ship_lox != "NaN") && (entry.ship_lox_conf > 98)) {
          if (curve.shipLOX === undefined) curve.shipLOX = []
          const shipLOXMass = (1-fuelPortion) * s2PropMass
          curve.shipLOX.push(new THREE.Vector3(entry.timeInSec, entry.ship_lox * shipLOXMass))
        }

        if ((entry.ship_ch4 != "NaN") && (entry.ship_ch4_conf > 98)) {
          if (curve.shipCH4 === undefined) curve.shipCH4 = []
          const shipCH4Mass = fuelPortion * s2PropMass
          curve.shipCH4.push(new THREE.Vector3(entry.timeInSec, entry.ship_ch4 * shipCH4Mass))
        }

        if ((entry.ship_angle != "NaN") && (entry.ship_angle_conf > 90)) {
          if (curve.shipAngle === undefined) curve.shipAngle = []
          // Ship data is not reliable until after the booster has separated
          if ((Math.abs(entry.ship_angle - entry.boost_angle) > 2) && (entry.timeInSec < 140)) {
            entry.ship_angle = entry.boost_angle
          }
          curve.shipAngle.push(new THREE.Vector3(entry.timeInSec, entry.ship_angle))
        }

        if ((entry.boost_angle != "NaN") && (entry.boost_angle_conf > 90) && (entry.timeInSec < 450)) {
          if (curve.boostAngle === undefined) curve.boostAngle = []
          curve.boostAngle.push(new THREE.Vector3(entry.timeInSec, entry.boost_angle))
        }

      })

      // xyChart.addCurve(curve.prefix+" Booster Altitude", "m", "km", curve.boostAlt, (y)=>y*0.001, curve.color, curve.colorName, curve.prefix+" Booster Altitude (km)")
      // xyChart.addCurve(curve.prefix+" Booster Air Speed", "m/s", "100's m/s", curve.boostSpeed, (y)=>y*0.01, curve.color, curve.colorName, curve.prefix+" Booster Air Speed (100's m/s)")
      // xyChart.addCurve(curve.prefix+" Starship Altitude", "m", "km", curve.shipAlt, (y)=>y*0.001, curve.color, curve.colorName, curve.prefix+" Starship Altitude (km)")
      // xyChart.addCurve(curve.prefix+" Starship Air Speed", "m/s", "100's m/s", curve.shipSpeed, (y)=>y*0.01, curve.color, curve.colorName, curve.prefix+" Starship Air Speed (100's m/s)")
      xyChart.addCurve(curve.prefix + " Starship Altitude", "m", "km", curve.shipAlt, (y) => y * 0.001, tram.tab10Colors[2].hex, tram.tab10Colors[2].name, curve.prefix + " Starship Altitude (km)")
      xyChart.addCurve(curve.prefix + " Booster Altitude", "m", "km", curve.boostAlt, (y) => y * 0.001, tram.tab10Colors[0].hex, tram.tab10Colors[0].name, curve.prefix + " Booster Altitude (km)")
      xyChart.addCurve(curve.prefix + " Starship Air Speed", "m/s", "100's m/s", curve.shipSpeed, (y) => y * 0.01, tram.tab10Colors[3].hex, tram.tab10Colors[3].name, curve.prefix + " Starship Air Speed (100's m/s)")
      xyChart.addCurve(curve.prefix + " Booster Air Speed", "m/s", "100's m/s", curve.boostSpeed, (y) => y * 0.01, tram.tab10Colors[1].hex, tram.tab10Colors[1].name, curve.prefix + " Booster Air Speed (100's m/s)")
      xyChart.addCurve(curve.prefix + " Starship LOX", "kg", "20000's kg", curve.shipLOX, (y) => y * 0.00005, tram.tab10Colors[4].hex, tram.tab10Colors[4].name, curve.prefix + " Starship LOX (20000's kg)")
      xyChart.addCurve(curve.prefix + " Starship CH4", "kg", "20000's kg", curve.shipCH4, (y) => y * 0.00005, tram.tab10Colors[5].hex, tram.tab10Colors[5].name, curve.prefix + " Starship CH4 (20000's kg)")
      xyChart.addCurve(curve.prefix + " Booster LOX", "kg", "20000's kg", curve.boostLOX, (y) => y * 0.00005, tram.tab10Colors[6].hex, tram.tab10Colors[6].name, curve.prefix + " Booster LOX (20000's kg)")
      xyChart.addCurve(curve.prefix + " Booster CH4", "kg", "20000's kg", curve.boostCH4, (y) => y * 0.00005, tram.tab10Colors[7].hex, tram.tab10Colors[7].name, curve.prefix + " Booster CH4 (20000's kg)")
      xyChart.addCurve(curve.prefix + " Starship Angle", "degrees", "degrees", curve.shipAngle, (y) => y / 2 + 80, tram.tab10Colors[8].hex, tram.tab10Colors[8].name, curve.prefix + " Starship Angle (degrees)")
      //xyChart.addCurve(curve.prefix + " Booster Angle", "degrees", "degrees", curve.boostAngle, (y) => y / 2 + 80, tram.tab10Colors[9].hex, tram.tab10Colors[9].name, curve.prefix + " Booster Angle (degrees)")

      function smoothCurve(curve) {
        const smoothedCurve = []
        let lastY = 0
        curve.forEach((entry, index) => {
          if (index == 0) {
            smoothedCurve.push(entry)
            lastY = entry.y
          }
          else if (entry.y != lastY) {
            smoothedCurve.push(entry)
            lastY = entry.y
          }
        })
        return smoothedCurve
      }

      function regressCurve(curve) {
        // Now create a set of points that we'll used to define a smooth spline curve to represent the emperical data.
        const tMin = 0
        const tMax = curve[curve.length - 1].x
        const numPoints = 60
        const tStep = (tMax - tMin) / numPoints
        const smoothedData = []
        const regressions = []
        
        for (let i = 0; i <= numPoints; i++) {
          const t = tMin + i * (tMax - tMin) / numPoints
          const regressionData = curve.filter(entry => (entry.x >= t - tStep * 6) && (entry.x <= t + tStep * 6)).map(entry => [entry.x, Math.max(0, entry.y)])
          regressions[i] = regression.polynomial(regressionData, { order: 4, precision: 10 })
          const predictedPoint = regressions[i].predict(t)
          smoothedData.push(new THREE.Vector3(...predictedPoint, 0))
        }
        return [smoothedData, { tMin, tMax, regressions }]
      }

      const smoothedShipAlt = smoothCurve(curve.shipAlt)
      const [starshipAltitude, altitudeRegressionData] = regressCurve(smoothedShipAlt)
      empiricalData['starshipAltitude'] = tram.interpolateCurve(starshipAltitude, 0.25)
      empiricalData['altitudeRegressionData'] = altitudeRegressionData

      empiricalData['starshipSpeed'] = tram.interpolateCurve(curve.shipSpeed, 0.25)
      empiricalData['boosterCH4Mass'] = tram.interpolateCurve(curve.boostCH4, 0.25)
      empiricalData['boosterLOXMass'] = tram.interpolateCurve(curve.boostLOX, 0.25)
      empiricalData['starshipCH4Mass'] = tram.interpolateCurve(curve.shipCH4, 0.25)
      empiricalData['starshipLOXMass'] = tram.interpolateCurve(curve.shipLOX, 0.25)
      empiricalData['boosterOrientation'] = tram.interpolateCurve(curve.boostAngle, 0.25)
      empiricalData['starshipOrientation'] = tram.interpolateCurve(curve.shipAngle, 0.25)

      //empiricalData['starshipAltitude'] = tram.interpolateCurve(smoothedShipAlt2, 0.25)
      // xyChart.addCurve("Empirical Starship IFT Speed", "m/s", "100's m/s",empiricalData.starshipSpeed, 0.01, tram.tab10Colors[4].hex, tram.tab10Colors[4].name, "Empirical Starship IFT Speed (100's m/s)")
      //xyChart.addCurve("Empirical Starship IFT Altitude", "m", "km",smoothedShipAlt, (y) => y * 0.001, tram.tab10Colors[5].hex, tram.tab10Colors[5].name, "Empirical Starship IFT Altitude (km)")
      xyChart.addCurve("Empirical Starship IFT Altitude", "m", "km",empiricalData.starshipAltitude, (y) => y * 0.001, tram.tab10Colors[5].hex, tram.tab10Colors[5].name, "Empirical Starship IFT Altitude (km)")
      //xyChart.addCurve("Empirical Starship IFT Altitude", "m", "km", plotData, (y) => y * 0.001, tram.tab10Colors[5].hex, tram.tab10Colors[5].name, "Empirical Starship IFT Altitude (km)")
      xyChart.addCurve("Empirical Starship Orientation", "degrees", "degrees", empiricalData.starshipOrientation, (y) => y / 2 + 80, tram.tab10Colors[9].hex, tram.tab10Colors[9].name, "Empirical Starship Orientation (degrees)")
    })

    return empiricalData

  }
}
