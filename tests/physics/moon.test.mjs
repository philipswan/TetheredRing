import { test } from 'node:test'
import assert from 'node:assert/strict'
import { julianDate, greenwichSiderealAngle, moonEcliptic, moonPositionECEF } from '../../src/physics/moon.js'
import { subsolarPoint } from '../../src/physics/solar.js'

const DEG = Math.PI / 180

test('julianDate', () => {
  assert.equal(julianDate(2000, 1, 12), 2451545)
  assert.equal(julianDate(1992, 103, 0), 2448724.5) // 12 April 1992
})

test('Greenwich sidereal time (Meeus example 12.a: 1987 April 10, 0h UT, 13h10m46.3668s)', () => {
  const g = greenwichSiderealAngle(julianDate(1987, 100, 0)) / DEG / 15
  assert.ok(Math.abs(g - (13 + 10 / 60 + 46.3668 / 3600)) < 1e-4, `${g}`)
})

test('the Moon (Meeus example 47.a: 1992 April 12, 0h: 133.163, -3.229 degrees, 368,410 km)', () => {
  const m = moonEcliptic(julianDate(1992, 103, 0))
  assert.ok(Math.abs(m.longitude / DEG - 133.163) < 0.4, `${m.longitude / DEG}`)
  assert.ok(Math.abs(m.latitude / DEG + 3.229) < 0.3, `${m.latitude / DEG}`)
  assert.ok(Math.abs(m.distance / 1000 - 368410) < 1000, `${m.distance / 1000}`)
})

// Angle between the Moon and the Sun seen from the Earth's centre.
function elongation(year, dayOfYear, utcHours) {
  const m = moonPositionECEF(julianDate(year, dayOfYear, utcHours))
  const s = subsolarPoint(dayOfYear, utcHours)
  const sun = [Math.cos(s.lat * DEG) * Math.cos(s.lon * DEG), Math.cos(s.lat * DEG) * Math.sin(s.lon * DEG), Math.sin(s.lat * DEG)]
  const r = Math.hypot(m.x, m.y, m.z)
  return Math.acos((m.x * sun[0] + m.y * sun[1] + m.z * sun[2]) / r) / DEG
}

test('new and full moons line up with the sun', () => {
  assert.ok(elongation(2024, 11, 11.95) < 6, 'new moon, 11 January 2024 11:57 UTC')
  assert.ok(elongation(2024, 25, 17.9) > 174, 'full moon, 25 January 2024 17:54 UTC')
  assert.ok(elongation(2026, 48, 12.0) < 6, 'new moon, 17 February 2026 12:01 UTC')
})
