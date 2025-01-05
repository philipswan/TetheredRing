import * as THREE from 'three'
import * as tram from './tram.js'
import * as kmlutils from './kmlutils.js'

export class mainRingCurve {
    constructor(dParamWithUnits, planetSpec, crv, index, genKMLFile, kmlFile) {

    this.curveControlPoints = this.generateMainRingControlPoints(dParamWithUnits, crv, planetSpec)
  
    const mainRingCurve = new THREE.CatmullRomCurve3(this.curveControlPoints)
    mainRingCurve.curveType = 'centripetal'
    mainRingCurve.closed = true
    mainRingCurve.tension = 0
  
    if (index===0 && genKMLFile) {
      this.genKML(kmlFile)
    }

    return mainRingCurve
  
  }
  
  generateMainRingControlPoints(dParamWithUnits, crv, planetSpec) {
  
    const n = dParamWithUnits['numControlPoints'].value
    const e = dParamWithUnits['ringEccentricity'].value
  
    const controlPoints = []
    const roughPlanetRadius = planetSpec.ellipsoid.a

    // const centerOfRing = new THREE.Vector3(0, crv.yc, 0).applyQuaternion(ringToPlanetRotation)
    // const lengthOfSiderealDay = 86160 // s
    // const Ω = new THREE.Vector3(0, -2 * Math.PI / lengthOfSiderealDay, 0)
  
    for (let a = 0, i = 0; i<n; a += Math.PI*2/n, i++) {
      const angleInRingCoordSys = Math.acos(crv.mainRingRadius / (roughPlanetRadius + crv.currentMainRingAltitude)) * Math.sqrt((e*Math.cos(a))**2 + (1/e*Math.sin(a))**2)
      const rInRingCoordSys = (roughPlanetRadius + crv.currentMainRingAltitude) * Math.cos(angleInRingCoordSys)
      const positionInRingCoordSys = new THREE.Vector3()
      positionInRingCoordSys.y = (roughPlanetRadius + crv.currentMainRingAltitude) * Math.sin(angleInRingCoordSys)
      positionInRingCoordSys.x = rInRingCoordSys * Math.cos(a)
      positionInRingCoordSys.z = rInRingCoordSys * Math.sin(a)
      controlPoints.push(positionInRingCoordSys)
    }

    return controlPoints

  }
  
  genKML(kmlFile) {
    const numPointsOnMainRingCurve = 8192
    const points = mainRingCurve.getPoints( numPointsOnMainRingCurve )

    //KML file placemark creation code for the ring and elevator cables.
    kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader)
    let xyzWorld, xyzPlanet
    let coordString, firstCoordString

    planetCoordSys.updateWorldMatrix(true)
    tetheredRingRefCoordSys.updateMatrixWorld(true)
    points.forEach((point, i) => {
      xyzWorld = tetheredRingRefCoordSys.localToWorld(point.clone())
      xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
      const lla = tram.ecefToGeodetic(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z, planetSpec.ellipsoid)
      coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
      if (i==0) {
        firstCoordString = coordString
      }
      kmlFile = kmlFile.concat(coordString)
    })
    kmlFile = kmlFile.concat(firstCoordString)  // We need to repeat the first coordinate to close the loop
    kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)
  }

  

}