import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shockLayerEmission, boundaryLayerThickness, plasmaWakeRadius, plasmaTrailPoint, sheathEmissivity,
  prandtlMeyer, machFromAreaRatio, isentropicPressureRatio, exhaustPlume,
  PLASMA_REFERENCE_SPEED, PLASMA_REFERENCE_DENSITY,
} from '../../src/launcher/hypersonicGlow.js'
import { earthDensity, earthPressure } from '../../src/physics/atmosphere.js'

const close = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected}`)

test('gas dynamics: textbook values for air (gamma 1.4)', () => {
  close(machFromAreaRatio(1.6875, 1.4), 2, 1e-6, 'A/A* = 1.6875 at Mach 2')
  close(prandtlMeyer(2, 1.4) * 180 / Math.PI, 26.38, 0.01, 'nu(2)')
  close(isentropicPressureRatio(2, 1.4), 0.1278, 1e-4, 'p/p0 at Mach 2')
  assert.equal(prandtlMeyer(1), 0)
})

test('shock-layer emission: 1 at the reference, linear in density, as the fourth power of speed', () => {
  close(shockLayerEmission(PLASMA_REFERENCE_SPEED, PLASMA_REFERENCE_DENSITY), 1, 1e-12)
  close(shockLayerEmission(PLASMA_REFERENCE_SPEED, 2 * PLASMA_REFERENCE_DENSITY), 2, 1e-12)
  close(shockLayerEmission(2 * PLASMA_REFERENCE_SPEED, PLASMA_REFERENCE_DENSITY), 16, 1e-12)
  assert.equal(shockLayerEmission(7600, 0), 0)
  assert.equal(shockLayerEmission(0, 1), 0)
})

test('the plasma fades by about a hundred times between leaving the tube (32 km) and 65 km', () => {
  const ratio = shockLayerEmission(7550, earthDensity(65000)) / shockLayerEmission(7600, earthDensity(31700))
  assert.ok(ratio > 1 / 300 && ratio < 1 / 30, `ratio ${ratio}`)
})

test('boundary layer: tens of centimetres at the base, thicker in thinner air', () => {
  const base = boundaryLayerThickness(45, PLASMA_REFERENCE_SPEED, PLASMA_REFERENCE_DENSITY)
  assert.ok(base > 0.1 && base < 1, `thickness ${base}`)
  close(boundaryLayerThickness(45, PLASMA_REFERENCE_SPEED, PLASMA_REFERENCE_DENSITY / 32) / base, 2, 1e-9, 'Re^-0.2')
  assert.ok(boundaryLayerThickness(1, 7600, 0.0184) < base)
  assert.equal(boundaryLayerThickness(0, 7600, 0.0184), 0)
})

test('wake: starts as a core of the base, grows as the cube root of the distance', () => {
  const shape = { bodyRadius: 2, dragArea: 0.4 }
  close(plasmaWakeRadius(0, shape), 0.9, 1e-12)
  const far = plasmaWakeRadius(1e6, shape), farther = plasmaWakeRadius(8e6, shape)
  close(farther / far, 2, 1e-3, 'cube root')
  for (let x = 1; x < 1e5; x *= 3) assert.ok(plasmaWakeRadius(x * 3, shape) > plasmaWakeRadius(x, shape))
})

test('trail: dark at the base, then fading and reddening with age; scaled by the brightness', () => {
  const shape = { bodyRadius: 1.8, dragArea: 0.36 }
  const at = (age, x) => { const rgb = [0, 0, 0]; plasmaTrailPoint(age, x, 1, 1.5, shape, 1, rgb); return rgb }
  assert.deepEqual(at(0, 0), [0, 0, 0])
  const young = at(0.002, 15), old = at(3, 23000)
  assert.ok(young[0] > old[0] * 5)
  assert.ok(old[0] / old[2] > young[0] / young[2], 'redder when older')
  const bright = at(0.002, 15)
  const brighter = [0, 0, 0]
  plasmaTrailPoint(0.002, 15, 1, 1.5, shape, 2, brighter)
  close(brighter[0], 2 * bright[0], 1e-12, 'brightness parameter')
  assert.ok(sheathEmissivity(1, 1, [0, 0, 0])[0] > 0)
})

test('exhaust plume: none without flow; wider and longer into thinner air; a Mach disk only near sea level', () => {
  const engine = { exitRadius: 1.67, throatRadius: 0.2, lipAngle: 0.18, chamberPressure: 20.6e6, referenceMassFlowRate: 20 }
  const flowAt = (altitude, massFlowRate = 15) => ({
    massFlowRate, exhaustVelocity: 4400, ambientPressure: earthPressure(altitude),
    airDensity: earthDensity(altitude), airSpeed: altitude > 0 ? 7600 : 300, wakeRadius: 2.2,
  })
  assert.equal(exhaustPlume(engine, flowAt(32000, 0)), null)
  const low = exhaustPlume(engine, flowAt(32000)), high = exhaustPlume(engine, flowAt(90000))
  assert.ok(high.length > low.length)
  assert.ok(high.radiusAt(50) > low.radiusAt(50))
  close(low.radiusAt(0), engine.exitRadius, 1e-9, 'starts at the nozzle exit')
  // Confined by the oncoming air low down: no wider than the base's wake
  assert.ok(low.radiusAt(low.length) <= 2.2 + 1e-9)
  // Brighter with more flow
  const rgbLow = low.lineEmissionAt(1, [0, 0, 0])
  const rgbMore = exhaustPlume(engine, flowAt(32000, 30)).lineEmissionAt(1, [0, 0, 0])
  close(rgbMore[2], 2 * rgbLow[2], 1e-9)
  // At sea level the Mach disk is a bright band a few metres behind the nozzle
  const sea = exhaustPlume(engine, { ...flowAt(0), airSpeed: 0 })
  const machDisk = 0.67 * 2 * engine.throatRadius * Math.sqrt(engine.chamberPressure / earthPressure(0))
  assert.ok(sea.lineEmissionAt(machDisk, [0, 0, 0])[0] > 2 * sea.lineEmissionAt(machDisk * 0.5, [0, 0, 0])[0])
})
