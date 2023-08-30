import * as THREE from 'three'
import * as tram from './tram.js'   // Tethered Ring Architectural Model (a collection of functions useful for building a tethered ring system)
import {mainRingCurve} from './mainRingCurve.js'

export class tetheredRingSystem {
  constructor(dParamWithUnits, universeSpec, planetSpec, ringSpec, index, genKMLFile, kmlFile) {

    this.create(dParamWithUnits, universeSpec, planetSpec, ringSpec, index, genKMLFile, kmlFile)
    
  }

  create(dParamWithUnits, universeSpec, planetSpec, ringSpec, index, genKMLFile, kmlFile) {

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

    // Calculate some of the basic dimensions of the tethered ring
    const gravitationalConstant = universeSpec.gravitationalConstant
    const massOfPlanet = planetSpec.mass
    const radiusOfPlanet = planetSpec.radius
    this.crv = new tram.commonRingVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value)

    // Create a curve to represent the shape of the tethered ring system
    this.mainRingCurve = new mainRingCurve(dParamWithUnits, planetSpec, this.crv, index, genKMLFile, kmlFile)

    // Create a line for visualizing the main ring's curve
    // const mainRingCurveVisualizer = new 
    // this.children.push({mainRingCurveVisualizer})
    // this.tetheredRingRefCoordSys.add(mainRingCurveVisualizer.getMesh())

    // Setup the dynamic model management engine for the tethered ring system

    // Add various objects to the dynamic model management system
    // Tethers
    // Stationary Rings
    // Moving Rings
    // Solar Panels
    // Transit Tube
    // Transit Tracks
    // Transit Tube Stations
    // Habitats
    // Elevator Cables
    // Elevator Cars
    // Ground Terminuses

  }

  destroy() {

    // Last of all...
    if (this.tetheredRingRefCoordSys.parent) {
      this.tetheredRingRefCoordSys.parent.remove(this.tetheredRingRefCoordSys)
      // this.tetheredRingRefCoordSys.removeFromParent()
    }

  }

  getMesh() {
    return this.tetheredRingRefCoordSys
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