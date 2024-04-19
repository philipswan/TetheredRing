import * as THREE from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CircleSuperCurve3 } from './CircleSuperCurve3'
// import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
// import { mergeBufferGeometries } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/utils/BufferGeometryUtils.js'

export class earthAxisObject {
  constructor(planetCoordSys, dParamWithUnits, radiusOfPlanet) {
    this.axisMesh = null
    this.planetCoordSys = planetCoordSys
    this.update(dParamWithUnits, radiusOfPlanet)
  }

  update(dParamWithUnits, radiusOfPlanet) {
    const axisThickness = radiusOfPlanet * 0.004
    if (dParamWithUnits['showEarthAxis'].value) {
      const axisGeometry = new THREE.CylinderGeometry(axisThickness, axisThickness, 2.5*radiusOfPlanet, 4, 1, false)
      this.axisMesh = new THREE.Mesh(axisGeometry, new THREE.MeshBasicMaterial({color: 0x3f3f4f}))
      this.axisMesh.name = 'axis'
      this.planetCoordSys.add(this.axisMesh)
    }
    else if (this.axisMesh) {
      this.planetCoordSys.remove(this.axisMesh)
      this.axisMesh.geometry.dispose()
      this.axisMesh.material.dispose()
      this.axisMesh = null
    }
  }
}

export class earthEquatorObject {
  constructor(planetCoordSys, dParamWithUnits, radiusOfPlanet) {
    this.equatorMesh = null
    this.planetCoordSys = planetCoordSys
    this.update(dParamWithUnits, radiusOfPlanet)
  }

  update(dParamWithUnits, radiusOfPlanet) {
    const equatorThickness = radiusOfPlanet * 0.004
    if (dParamWithUnits['showEarthEquator'].value) {
      this.equatorMesh = new THREE.Group()
      const equatorMaterial = new THREE.MeshBasicMaterial({color: 0x3f3f4f})
      for (let a = 0; a<=0; a+=10) {
        const latitude = a * Math.PI / 180
        const equatorGeometry = new THREE.TorusGeometry(radiusOfPlanet * Math.cos(latitude), equatorThickness, 8, 128)
        const mesh = new THREE.Mesh(equatorGeometry, equatorMaterial)
        mesh.name = 'equator'
        mesh.position.y = radiusOfPlanet * Math.sin(latitude)
        mesh.rotation.x = Math.PI/2
        this.equatorMesh.add(mesh)
      }
      this.planetCoordSys.add(this.equatorMesh)
    }
    else if (this.equatorMesh) {
      this.planetCoordSys.remove(this.equatorMesh)
      this.equatorMesh.geometry.dispose()
      this.equatorMesh.material.dispose()
      this.equatorMesh = null
    }
  }
}

export class mainRingCurveObject {
  constructor(tetheredRingRefCoordSys, dParamWithUnits, mainRingCurve, referencePoint = new THREE.Vector3(0, 0, 0)) {
    this.mainRingCurveMeshes = []
    this.tetheredRingRefCoordSys = tetheredRingRefCoordSys
    this.update(tetheredRingRefCoordSys, dParamWithUnits, mainRingCurve, referencePoint)
  }

  update(tetheredRingRefCoordSys, dParamWithUnits, mainRingCurve, referencePoint = new THREE.Vector3(0, 0, 0)) {
    // Dispose of the old object(s) in the old scene...
    this.mainRingCurveMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      this.tetheredRingRefCoordSys.remove(mesh)
    })
    this.mainRingCurveMeshes.splice(0, this.mainRingCurveMeshes.length)

    // Update the pointer to the scene
    this.tetheredRingRefCoordSys = tetheredRingRefCoordSys

    if (dParamWithUnits['showMainRingCurve'].value) {
      const numPointsOnMainRingCurve = 256
      const points = mainRingCurve.getPoints( numPointsOnMainRingCurve )
      points.forEach(point => point.sub(referencePoint))
    
      // Debug - Draw a loop along the curve to check that it is correctly positioned
      let mainRingCurveMesh
      const drawTubeAlongMainRingCurve = true
      if (drawTubeAlongMainRingCurve) {
        const localCurve = new THREE.CatmullRomCurve3(points)
        mainRingCurveMesh = new THREE.Mesh(
          new THREE.TubeGeometry( localCurve, numPointsOnMainRingCurve, 2, 8, true ),
          new THREE.MeshPhongMaterial({color: 0x3d3d3c})
        )
      }
      else {
        mainRingCurveMesh = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints( points ),
          new THREE.LineBasicMaterial( { color: 0x00ff00 })
        )
      }

      mainRingCurveMesh.name = 'mainRingCurve'
      mainRingCurveMesh.position.copy(referencePoint)
      this.mainRingCurveMeshes.push(mainRingCurveMesh)
      this.mainRingCurveMeshes.forEach(mesh => this.tetheredRingRefCoordSys.add(mesh))
    }
  }
}

export function arrow(position, direction, arrowSize = 1000000, vectorMagnitude = 1, skinnyFactor = 1, color = 0x3f3f4f) {
  const straightUpVector = new THREE.Vector3(0, 1, 0)
  const arrowParts = []
  const absVectorMagnitude = Math.abs(vectorMagnitude)
  const maxArrowheadPortion = 0.75
  const arrowHeadLength = Math.min(0.2, absVectorMagnitude * maxArrowheadPortion)
  const arrowShaftLength = absVectorMagnitude - arrowHeadLength
  arrowParts.push(new THREE.SphereGeometry(0.02, 32, 16))
  arrowParts.push(new THREE.CylinderGeometry( 0.01, 0.01, arrowShaftLength, 12 ).translate(0, arrowShaftLength/2, 0))  // arrow shaft
  arrowParts.push(new THREE.CylinderGeometry( 0, 0.04, arrowHeadLength, 12 ).translate(0, arrowShaftLength + arrowHeadLength/2, 0))   // arrow head
  const arrowGeometry = mergeBufferGeometries(arrowParts)
  const arrow = new THREE.Mesh(arrowGeometry, new THREE.MeshPhongMaterial({color: color}))
  arrow.scale.set(arrowSize * skinnyFactor, arrowSize * Math.sign(vectorMagnitude), arrowSize * skinnyFactor)
  arrow.position.copy(position)
  arrow.name = 'arrow'
  const q = new THREE.Quaternion().setFromUnitVectors(straightUpVector, direction.clone().normalize())
  arrow.rotation.setFromQuaternion(q)
  return arrow
}

export class gyroscopicForceArrowsObject {
  constructor(planetCoordSys, dParamWithUnits, mainRingCurve, crv, radiusOfPlanet, ringToPlanetRotation) {
    this.gyroscopicForceArrowMeshes = []
    this.planetCoordSys = planetCoordSys
    this.update(dParamWithUnits, mainRingCurve, crv, radiusOfPlanet, ringToPlanetRotation)
  }

  update(dParamWithUnits, mainRingCurve, crv, radiusOfPlanet, ringToPlanetRotation) {

    this.gyroscopicForceArrowMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      this.planetCoordSys.remove(mesh)
    })
    this.gyroscopicForceArrowMeshes.splice(0, this.gyroscopicForceArrowMeshes.length)

    if (dParamWithUnits['showGyroscopicForceArrows'].value) {
      const centerOfRing = new THREE.Vector3(0, crv.yc, 0).applyQuaternion(ringToPlanetRotation)
      const lengthOfSiderealDay = 86160 // s
      const Ω = new THREE.Vector3(0, -2 * Math.PI / lengthOfSiderealDay, 0)
      const n = dParamWithUnits['numForceArrows'].value
      for (let i = 0; i<n; i++) {
        const positionInRingCoordSys = mainRingCurve.getPoint(i / n)
        const positionInPlanetCoordSys = new THREE.Vector3()
        positionInPlanetCoordSys.copy(positionInRingCoordSys).applyQuaternion(ringToPlanetRotation)
        const upwardUnitVector = positionInPlanetCoordSys.clone().normalize()
        const inertialDirectionVector = positionInPlanetCoordSys.clone().sub(centerOfRing).normalize()
        const forwardUnitVector = upwardUnitVector.clone().cross(inertialDirectionVector).normalize()
        const outwardUnitVector = forwardUnitVector.clone().cross(upwardUnitVector).normalize()
        this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, upwardUnitVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f3f3f))  // Arrow pointing away from center of planet
        // this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, inertialDirectionVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f7f7f))  // Arrow pointing away from center of ring
        this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, forwardUnitVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f3f3f))  // Arrow tangential to the ring
        this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, outwardUnitVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f3f3f))  // Arrow pointing away from the ring towards the horizon
  
        // The moving frame of reference shall be defined so that x and y are measured positive eastward and northward along the local latitude and meridian.
        // The z axis is the local vertical (straight up) and it is directed radially outward from the center of the earth.
        const localPosition = new THREE.Vector3()
        const localVelocity = new THREE.Vector3()
        const localAccelleration = new THREE.Vector3()
        // Calcualte the local position and velocity
  
        const latitude = Math.atan2(positionInPlanetCoordSys.y, Math.sqrt(positionInPlanetCoordSys.x**2 + positionInPlanetCoordSys.z**2))
        const lonitude = Math.atan2(positionInPlanetCoordSys.x, positionInPlanetCoordSys.z)
        const ringSpeed = 18222.22222  // ToDo: Need to obtain this value from the place where it is formally calculated
        localPosition.copy(positionInPlanetCoordSys) 
        localVelocity.x = forwardUnitVector.x * ringSpeed
        localVelocity.y = forwardUnitVector.y * ringSpeed
        localVelocity.z = forwardUnitVector.z * ringSpeed
        localAccelleration.x = 0
        localAccelleration.y = 0
        localAccelleration.z = 0
        
        // Calculate the absolute velocity, and acceleration
        const rRing = radiusOfPlanet+crv.currentMainRingAltitude
        const absoluteVelocity = localVelocity.clone().add(Ω.clone().cross(localPosition))
  
        const absoluteAccelleration = Ω.clone().cross(Ω.clone().cross(localPosition)).add(Ω.clone().cross(localVelocity).multiplyScalar(2)).add(localAccelleration)
        // absoluteAccelleration.x = localAccelleration.x + localVelocity.x * (localVelocity.z - localVelocity.y*Math.tan(latitude)) / rRing + 2 * Ω * (localVelocity.z * Math.cos(latitude) - localVelocity.y * Math.sin(latitude))
        // absoluteAccelleration.y = localAccelleration.y + (localVelocity.y * localVelocity.z + localVelocity.x**2 * Math.tan(latitude)) / rRing + Ω * Math.sin(latitude) * (Ω * rRing * Math.cos(latitude) + 2 * localVelocity.x)
        // absoluteAccelleration.z = localAccelleration.z - (localVelocity.x**2 + localVelocity.y**2) / rRing - Ω * Math.cos(latitude) * (Ω * rRing * Math.cos(latitude) + 2 * localVelocity.x)
        //this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, absoluteVelocity, dParamWithUnits['forceArrowSize'].value, 1, 1, 0x00ff00))  // Arrow pointing away from center of planet
        const l = absoluteAccelleration.length()
        //console.log(latitude * 180/Math.PI, lonitude * 180/Math.PI, l, upwardUnitVector.dot(absoluteAccelleration), outwardUnitVector.dot(absoluteAccelleration), forwardUnitVector.dot(absoluteAccelleration))
        //console.log(upwardUnitVector.dot(absoluteAccelleration) / l)
        //console.log(outwardUnitVector.dot(absoluteAccelleration) / l, l)
        //console.log(forwardUnitVector.dot(absoluteAccelleration) / l)
        //console.log(upwardUnitVector.length(), outwardUnitVector.length(), forwardUnitVector.length())
        this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, absoluteAccelleration, dParamWithUnits['forceArrowSize'].value, l, 1, 0x00ff00))  // Arrow pointing away from center of planet
        this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, forwardUnitVector, dParamWithUnits['forceArrowSize'].value, forwardUnitVector.dot(absoluteAccelleration), 1, 0x0000ff))  // Arrow tangential to the ring
        this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, outwardUnitVector, dParamWithUnits['forceArrowSize'].value, outwardUnitVector.dot(absoluteAccelleration), 1, 0x7f7fff))  // Arrow pointing towards horizon on the side that is away from the center of ring
        this.gyroscopicForceArrowMeshes.push(arrow(positionInPlanetCoordSys, upwardUnitVector, dParamWithUnits['forceArrowSize'].value, upwardUnitVector.dot(absoluteAccelleration), 1, 0xff0000))  // Arrow pointing away from center of planet, toward zenith
        
      
      }
      this.gyroscopicForceArrowMeshes.forEach(mesh => this.planetCoordSys.add(mesh))
    }
    else if (this.gyroscopicForceArrowMeshes.length > 0) {
      this.gyroscopicForceArrowMeshes.forEach(mesh => {
        mesh.geometry.dispose()
        mesh.material.dispose()
        this.planetCoordSys.remove(mesh)
      })
      this.gyroscopicForceArrowMeshes.splice(0, this.gyroscopicForceArrowMeshes.length)
    }
  }
}


export class gravityForceArrowsObject {
  constructor(planetCoordSys, dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation) {
    this.gravityForceArrowMeshes = []
    this.planetCoordSys = planetCoordSys
    this.update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, false, false, false)
  }

  update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, showTensileForceArrows, showGravityForceArrows, showInertialForceArrows) {

    this.gravityForceArrowMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      this.planetCoordSys.remove(mesh)
    })
    this.gravityForceArrowMeshes.splice(0, this.gravityForceArrowMeshes.length)

    if (dParamWithUnits['showGravityForceArrows'].value) {
      const centerOfRing = new THREE.Vector3(0, crv.yc, 0).applyQuaternion(ringToPlanetRotation)
      const lengthOfSiderealDay = 86160 // s
      const Ω = new THREE.Vector3(0, -2 * Math.PI / lengthOfSiderealDay, 0)
      // Hack: Only using the first tether's forces for now. Need to merge forces from both tethers later.
      const gravityForce = -Math.sqrt(ctv.gravityForceAtRing[0]['ρ']**2+ctv.gravityForceAtRing[0]['z']**2) / 1000
      const inertialForce = Math.sqrt(ctv.inertialForceAtRing[0]['ρ']**2+ctv.inertialForceAtRing[0]['z']**2) / 1000
      const tensileForce = Math.sqrt(ctv.tensileForceAtRing[0]['ρ']**2+ctv.tensileForceAtRing[0]['z']**2) / 1000
      // console.log(ctv.gravityForceAtRing[0]['ρ'], ctv.gravityForceAtRing[0]['z'], Math.sqrt(ctv.gravityForceAtRing[0]['ρ']**2+ctv.gravityForceAtRing[0]['z']**2), gravityForce)
      // console.log(ctv.gravityForceAtRing[1]['ρ'], ctv.gravityForceAtRing[1]['z'], Math.sqrt(ctv.gravityForceAtRing[1]['ρ']**2+ctv.gravityForceAtRing[1]['z']**2), gravityForce)
      // console.log(ctv.tensileForceAtRing[0]['ρ'], ctv.tensileForceAtRing[0]['z'], Math.sqrt(ctv.tensileForceAtRing[0]['ρ']**2+ctv.tensileForceAtRing[0]['z']**2), tensileForce)
      // console.log(ctv.tensileForceAtRing[1]['ρ'], ctv.tensileForceAtRing[1]['z'], Math.sqrt(ctv.tensileForceAtRing[1]['ρ']**2+ctv.tensileForceAtRing[1]['z']**2), tensileForce)
      // console.log(ctv.inertialForceAtRing[0]['ρ'], ctv.inertialForceAtRing[0]['z'], Math.sqrt(ctv.inertialForceAtRing[0]['ρ']**2+ctv.inertialForceAtRing[0]['z']**2), inertialForce)
      // console.log(ctv.inertialForceAtRing[1]['ρ'], ctv.inertialForceAtRing[1]['z'], Math.sqrt(ctv.inertialForceAtRing[1]['ρ']**2+ctv.inertialForceAtRing[1]['z']**2), inertialForce)
  
      const n = dParamWithUnits['numForceArrows'].value
      for (let i = 0; i<n; i++) {
        const positionInRingCoordSys = mainRingCurve.getPoint(i / n)
        const positionInPlanetCoordSys = new THREE.Vector3()
        positionInPlanetCoordSys.copy(positionInRingCoordSys).applyQuaternion(ringToPlanetRotation)
        const upwardUnitVector = positionInPlanetCoordSys.clone().normalize()
        const inertialDirectionVector = positionInPlanetCoordSys.clone().sub(centerOfRing).normalize()
        const tensileDirectionVector = upwardUnitVector.clone().multiplyScalar(gravityForce).add(inertialDirectionVector.clone().multiplyScalar(inertialForce)).multiplyScalar(-1)
        //const forwardUnitVector = upwardUnitVector.clone().cross(inertialDirectionVector).normalize()
        //const outwardUnitVector = forwardUnitVector.clone().cross(upwardUnitVector).normalize()
        // Draw unit vectors
        //this.gravityForceArrowMeshes.push(arrow(positionInPlanetCoordSys, upwardUnitVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f3f3f))  // Arrow pointing away from center of planet
        // this.gravityForceArrowMeshes.push(arrow(positionInPlanetCoordSys, inertialDirectionVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f7f7f))  // Arrow pointing away from center of ring
        //this.gravityForceArrowMeshes.push(arrow(positionInPlanetCoordSys, forwardUnitVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f3f3f))  // Arrow tangential to the ring
        //this.gravityForceArrowMeshes.push(arrow(positionInPlanetCoordSys, outwardUnitVector, dParamWithUnits['forceArrowSize'].value, 1, 0.5, 0x3f3f3f))  // Arrow pointing away from the ring towards the horizon
  
        // The moving frame of reference shall be defined so that x and y are measured positive eastward and northward along the local latitude and meridian.
        // The z axis is the local vertical (straight up) and it is directed radially outward from the center of the earth.
        const localPosition = new THREE.Vector3()
        const localVelocity = new THREE.Vector3()
        const localAccelleration = new THREE.Vector3()

        // Calcualte the local position and velocity
        const latitude = Math.atan2(positionInPlanetCoordSys.y, Math.sqrt(positionInPlanetCoordSys.x**2 + positionInPlanetCoordSys.z**2))
        const lonitude = Math.atan2(positionInPlanetCoordSys.x, positionInPlanetCoordSys.z)
        if (showGravityForceArrows) {
          this.gravityForceArrowMeshes.push(arrow(positionInPlanetCoordSys, upwardUnitVector, dParamWithUnits['forceArrowSize'].value, gravityForce, 1, 0x00ff00))  // Arrow pointing away from center of planet, toward zenith
        }
        if (showInertialForceArrows) {
          this.gravityForceArrowMeshes.push(arrow(positionInPlanetCoordSys, inertialDirectionVector, dParamWithUnits['forceArrowSize'].value, inertialForce, 1, 0xff0000))  // Arrow pointing away from center of planet, toward zenith
        }
        if (showTensileForceArrows) {
          this.gravityForceArrowMeshes.push(arrow(positionInPlanetCoordSys, tensileDirectionVector, dParamWithUnits['forceArrowSize'].value, tensileForce, 1, 0x0000ff))  // Arrow pointing away from center of planet, toward zenith
        }
      }
      this.gravityForceArrowMeshes.forEach(mesh => this.planetCoordSys.add(mesh))
    }
  }
}

export class randomFlightPathObject {

  constructor(planetCoordSys, dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation) {
    this.randomFlighPathMeshes = []
    this.planetCoordSys = planetCoordSys
    this.update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, false, false, false)
  }

  update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, showTensileForceArrows, showGravityForceArrows, showInertialForceArrows) {
    this.randomFlighPathMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      this.planetCoordSys.remove(mesh)
    })
    this.randomFlighPathMeshes.splice(0, this.randomFlighPathMeshes.length)

    // Extrude a number of random flight paths
    for (let i = 0; i<numFlightPaths; i++) {
      // Randomize altitude, direction, and the position where the path crosses under the ring
      const altitude = 1000 + 12000 * Math.random()
      const direction = 0
      const position = mainRingCurve.getPoint(i / n)

      const targetPosition = new THREE.Vector3(402701.22087436507, -4015908.319093469, -4952967.081153212)
      const targetPositionLocal = tetheredRingRefCoordSys.worldToLocal(targetPosition)
      // Then compute it's theta value and convert it to a 0 to 1 value 
      // Note: There is an implicate assumption here that mainRingCurve is a circle, so this code will need
      // to be upgraded if we want to implement a non-circular mainRingCurve.
      const nearestTrackPosition = (Math.atan2(targetPositionLocal.z, targetPositionLocal.x) / (2*Math.PI) + 1) % 1
      const pointOnRingAtNearestTrackPosition = mainRingCurve.getPoint(nearestTrackPosition)
      const axisOfRotation = mainRingCurve.getTangent(nearestTrackPosition)

      // Now move this point down to the randomly selected altitude
      const flightpathStartPoint = pointOnRingAtNearestTrackPosition.multiplyScalar((crv.radiusOfPlanet + altitude) / (crv.radiusOfPlanet + crv.currentMainRingAltitude))
      const flightPathCurve = new CircleSuperCurve3(new THREE.Vector3(0, 0, 0), axisOfRotation, flightpathStartPoint, 100000)

      // Create a curve to represent the flight path
      // Extrude a square tube to represent the flight path

    } 

    this.randomFlighPathMeshes.forEach(mesh => this.planetCoordSys.add(mesh))
  }

}
