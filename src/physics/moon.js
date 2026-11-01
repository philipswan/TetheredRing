// Where the Moon is, and how the Earth is turned relative to the stars, at a date.
//
// The Moon's geocentric position is the Astronomical Almanac's low-precision series (good to about
// 0.3 degrees in direction and a few hundred km in distance, which is far below what shows on screen
// except in a close-up of its limb against the stars). The Earth's rotation is the Greenwich mean
// sidereal time. Both take a Julian date (UT; the difference from TT is a minute or so).

const DEG = Math.PI / 180
const EARTH_RADIUS_KM = 6378.14
export const OBLIQUITY_J2000 = 23.439291 * DEG

// Julian date of a day of the year (1 = 1 January) and UTC hours, in a (Gregorian) year.
export function julianDate(year, dayOfYear, utcHours) {
  const y = year - 1
  const jan1 = 1721425.5 + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)
  return jan1 + (dayOfYear - 1) + utcHours / 24
}

// Greenwich mean sidereal time (radians, 0..2pi): the angle the Earth has turned from the March equinox.
export function greenwichSiderealAngle(jd) {
  const deg = 280.46061837 + 360.98564736629 * (jd - 2451545)
  return (((deg % 360) + 360) % 360) * DEG
}

const sinD = (x) => Math.sin(x * DEG)
const cosD = (x) => Math.cos(x * DEG)

// The Moon's geocentric ecliptic longitude and latitude (radians) and distance (m).
export function moonEcliptic(jd) {
  const T = (jd - 2451545) / 36525
  const longitude = 218.32 + 481267.881 * T
    + 6.29 * sinD(135.0 + 477198.87 * T) - 1.27 * sinD(259.3 - 413335.36 * T)
    + 0.66 * sinD(235.7 + 890534.22 * T) + 0.21 * sinD(269.9 + 954397.74 * T)
    - 0.19 * sinD(357.5 + 35999.05 * T) - 0.11 * sinD(186.5 + 966404.03 * T)
  const latitude = 5.13 * sinD(93.3 + 483202.02 * T) + 0.28 * sinD(228.2 + 960400.89 * T)
    - 0.28 * sinD(318.3 + 6003.15 * T) - 0.17 * sinD(217.6 - 407332.21 * T)
  const parallax = 0.9508 + 0.0518 * cosD(135.0 + 477198.87 * T) + 0.0095 * cosD(259.3 - 413335.36 * T)
    + 0.0078 * cosD(235.7 + 890534.22 * T) + 0.0028 * cosD(269.9 + 954397.74 * T)
  return { longitude: (((longitude % 360) + 360) % 360) * DEG, latitude: latitude * DEG, distance: 1000 * EARTH_RADIUS_KM / sinD(parallax) }
}

// The Moon's geocentric position (m) in the Earth-fixed frame (ECEF: x towards 0 degrees longitude on the
// equator, z towards the north pole).
export function moonPositionECEF(jd) {
  const { longitude: l, latitude: b, distance } = moonEcliptic(jd)
  const e = OBLIQUITY_J2000
  // Ecliptic to equatorial (inertial, x towards the March equinox)...
  const x = Math.cos(b) * Math.cos(l)
  const y = Math.cos(e) * Math.cos(b) * Math.sin(l) - Math.sin(e) * Math.sin(b)
  const z = Math.sin(e) * Math.cos(b) * Math.sin(l) + Math.cos(e) * Math.sin(b)
  // ...then turned with the Earth.
  const g = greenwichSiderealAngle(jd)
  return {
    x: distance * (x * Math.cos(g) + y * Math.sin(g)),
    y: distance * (-x * Math.sin(g) + y * Math.cos(g)),
    z: distance * z,
  }
}
