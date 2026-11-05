import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import * as sky from '../../src/scene/skyIrradiance.js'

const glsl = readFileSync(new URL('../../src/shaders/atmosphereCommon.glsl', import.meta.url), 'utf8')
const glslConst = (name) => {
  const m = glsl.match(new RegExp(`const (?:float|vec3) ${name} = (?:vec3\\()?([^;)]+)`))
  assert.ok(m, name)
  const values = m[1].split(',').map(Number)
  return values.length === 1 ? values[0] : values
}
const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

test('the constants match the shader model (atmosphereCommon.glsl)', () => {
  assert.deepEqual(sky.ATMO_BETA_R, glslConst('ATMO_BETA_R'))
  assert.equal(sky.ATMO_BETA_M, glslConst('ATMO_BETA_M'))
  assert.equal(sky.ATMO_HEIGHT_R, glslConst('ATMO_HEIGHT_R'))
  assert.equal(sky.ATMO_HEIGHT_M, glslConst('ATMO_HEIGHT_M'))
  assert.equal(sky.ATMO_MIE_G, glslConst('ATMO_MIE_G'))
  assert.equal(sky.ATMO_MIE_MULTIPLE, glslConst('ATMO_MIE_MULTIPLE'))
  assert.deepEqual(sky.ATMO_MIE_MULTIPLE_TINT, glslConst('ATMO_MIE_MULTIPLE_TINT'))
})

test('a clear noon sky gives roughly a tenth of the sun\'s light, and is blue', () => {
  const noon = sky.skyIrradiance(1)
  const ratio = luminance(noon) / luminance(sky.sunTransmittance(1))
  assert.ok(ratio > 0.05 && ratio < 0.2, `sky/sun = ${ratio}`)
  assert.ok(noon[2] > noon[1] && noon[1] > noon[0])
})

test('the sky dims as the sun sets and is dark well below the horizon', () => {
  const table = sky.skyIrradianceTable()
  assert.equal(table.length, sky.SKY_SAMPLES)
  for (let i = 1; i < table.length; i++) assert.ok(luminance(table[i]) >= luminance(table[i - 1]), `sample ${i}`)
  assert.ok(luminance(table[0]) < 1e-4)
})

test('the sun reddens towards the horizon and is gone below it', () => {
  const high = sky.sunTransmittance(1)
  const low = sky.sunTransmittance(0.1)
  assert.ok(low[2] / low[0] < high[2] / high[0])
  assert.deepEqual(sky.sunTransmittance(-0.05), [0, 0, 0])
})

test('the daylight white balance makes noon sun plus sky white without changing its brightness', () => {
  const w = sky.daylightWhiteBalance()
  const noon = sky.sunTransmittance(1).map((s, c) => (s + sky.skyIrradiance(1)[c]) * w[c])
  assert.ok(Math.abs(noon[0] - noon[2]) < 1e-9 && Math.abs(noon[1] - noon[2]) < 1e-9)
  assert.ok(Math.abs(luminance(w) - 1) < 0.05)
})
