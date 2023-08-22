import * as THREE from 'three'
import * as tram from './tram.js'   // Tethered Ring Architectural Model (a collection of functions useful for building a tethered ring system)

export class tetheredRingSystem {
  constructor(universeSpec, planetSpec, ringSpec, dParamWithUnits, index) {
    this.universeSepc = universeSpec
    this.planetSpec = planetSpec
    this.ringSpec = ringSpec

    // Create a coordinate system for the tethered ring system where the origin is at the center
    // of the rings (e.g. center of ring 2 of we have rings 0 thru 4) and
    // the y-axis is normal to the plane of the rings and away from the center of the planet.
    this.tetheredRingRefCoordSys = new THREE.Group();
    this.tetheredRingRefCoordSys.name = 'tetheredRingRefCoordSys_' + index
    const moveRingFactor = dParamWithUnits['moveRingFactor'].value

    this.ringCenterLat = 0
    this.ringCenterLon = 0
    this.ringToPlanetQuaternion = new THREE.Quaternion()
    this.adjustLatLon(ringSpec.locationSpec, moveRingFactor)    // Note: sets this.ringCenterLat and this.ringCenterLon and calls gimbalTo which modifies this.ringToPlanetQuaternion

  }

  getMesh() {
    return this.tetheredRingRefCoordSys
  }

  destroy() {

  }

  create() {

  }

  adjustLatLon(ringLocationSpec, moveRingFactor) {
    const lat = tram.lerp(ringLocationSpec.buildLat, ringLocationSpec.finalLat, moveRingFactor)
    const lon = tram.lerp(ringLocationSpec.buildLon, ringLocationSpec.finalLon, moveRingFactor)
    this.ringCenterLat = lat
    this.ringCenterLon = lon
    this.gimbalTo(lat, lon)
    //this.updateRing()  // We will need to do this work (or schedule this work?) to adapt the ring to the planet's eccentricity and surface contours
  }
  
  gimbalTo(lat, lon) {
    // "Gimbal" code for orienting a coordinate system such as the tetheredRingRefCoordSys
    // Note: There's additional work that needs to be done if we want to adapt the ring to the planet's eccentricity and surface contours
    // Convert Degrees to Radians
    const latRadians = lat * Math.PI / 180
    const lonRadians = lon * Math.PI / 180
    const v1 = new THREE.Vector3(0, 1, 0)  // Planet up
    const v2 = new THREE.Vector3().setFromSphericalCoords(1, Math.PI/2 - latRadians, lonRadians)
    this.ringToPlanetQuaternion.setFromUnitVectors(v1, v2)
    this.tetheredRingRefCoordSys.setRotationFromQuaternion(this.ringToPlanetQuaternion)
    // ToDo: This call massively impacts UI responsiveness - is it really needed???
    this.tetheredRingRefCoordSys.updateMatrixWorld(true)
  }

}