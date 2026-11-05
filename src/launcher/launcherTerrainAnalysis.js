import * as THREE from 'three'
import { print } from '../utils/print.js'

// Analyzes the launcher ramp altitude against terrain displacement
// This hack plots the altitude of the ramp section of the launcher alongside the distance above sea level,
// of the terrain above or below the ramp section's curve.

// samplePlanetTerrainHeight(lat, lon) -> {heightMeters, face, lod, tileId, u, v} | null (planet2 terrain).
// (The legacy planet.js displacement-map branch was removed together with planet.js.)
export function analyzeLauncherTerrainDisplacement(launchSystemObject, planetMeshes, planetSpec, tram, scene, samplePlanetTerrainHeight = null) {
  if (!samplePlanetTerrainHeight) {
    console.warn('analyzeLauncherTerrainDisplacement: no terrain height sampler provided')
    return
  }

  function sampleTerrainDisplacement(point) {
    // Convert world point to geodetic (lat, lon) and map to tile/pixel via equirectangular projection
    const geo = tram.ecefToGeodetic(point.x, point.y, point.z, planetSpec.ellipsoid)
    let lon = geo.lon  // degrees
    if (lon < -180) lon += 360
    if (lon >= 180) lon -= 360
    {
      const result = samplePlanetTerrainHeight(geo.lat, lon)
      if (!result) return null
      return {
        displacement: result.heightMeters,
        face: result.face,
        lod: result.lod,
        tileId: result.tileId,
        u: result.u,
        v: result.v,
      }
    }
  }
  
  //console.log(launchSystemObject.launchRampCurve[0])
  for (let i = 0; i<1; i+=0.0025) {
    const point = launchSystemObject.launchRampCurve[0].getPoint(i)
    // Altitude above the ellipsoid, measured along the geodetic normal. (This used to subtract a radius
    // evaluated at the geocentric latitude, an error of up to ~70 m.)
    const geo = tram.ecefToGeodetic(point.x, point.y, point.z, planetSpec.ellipsoid)
    const altitude = geo.alt  // This is the altitude above sea level of the ramp section of the launcher
    const terrainResult = sampleTerrainDisplacement(point)
    if (terrainResult !== null) {
      //print(i.toFixed(2), altitude, terrainResult.displacement, `tile(${terrainResult.ti},${terrainResult.tj})`, `px=${terrainResult.px}`, `py=${terrainResult.py}`, `tex=${terrainResult.texValue.toFixed(4)}`)
      print(i.toFixed(5), altitude, terrainResult.displacement)
      // Place a debug sphere at the terrain surface point
      const terrainECEF = tram.geodeticToECEF(geo.lat, geo.lon, terrainResult.displacement, planetSpec.ellipsoid)
      const terrainPoint = new THREE.Vector3(terrainECEF.x, terrainECEF.y, terrainECEF.z)
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(50, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      )
      sphere.position.copy(terrainPoint)
      scene.add(sphere)
    }
  }

  // Place a debug sphere at the summit of Mauna Kea (19.8207°N, 155.4680°W, 4205m)
  const maunaKeaECEF = tram.geodeticToECEF(19.8207, -155.4680, 4205, planetSpec.ellipsoid)
  const maunaKeaPoint = new THREE.Vector3(maunaKeaECEF.x, maunaKeaECEF.y, maunaKeaECEF.z)
  const maunaKeaSphere = new THREE.Mesh(
    new THREE.SphereGeometry(500, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  )
  maunaKeaSphere.position.copy(maunaKeaPoint)
  scene.add(maunaKeaSphere)
}
