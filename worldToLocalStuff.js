
    //TetheredRingRefCoordSys.localToWorld(elevatorCableUpperAttachPnt)
    //console.log(TetheredRingRefCoordSys.localToWorld(elevatorCableUpperAttachPnt),
    //  TetheredRingLonCoordSys.worldToLocal(TetheredRingRefCoordSys.localToWorld(elevatorCableUpperAttachPnt)),
    //  TetheredRingLatCoordSys.worldToLocal(TetheredRingRefCoordSys.localToWorld(elevatorCableUpperAttachPnt)))
    xyzWorld = TetheredRingRefCoordSys.localToWorld(elevatorCableUpperAttachPnt.clone())
    xyzLat = TetheredRingLatCoordSys.worldToLocal(xyzWorld.clone())
    xyzLon = TetheredRingLonCoordSys.worldToLocal(xyzWorld.clone())
    xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
    // planetCoordSys
    if (a==0) {
      const rayOrigin = TetheredRingRefCoordSys.localToWorld(elevatorCableUpperAttachPnt.clone())
      const rayDirection = TetheredRingRefCoordSys.localToWorld(elevatorCableLowerAttachPnt.clone()).sub(rayOrigin).normalize()
      const ray = new THREE.Raycaster(rayOrigin, rayDirection)
      const intersections = ray.intersectObjects(planetMeshes, true)
      console.log(xyzWorld, xyzLat, xyzLon, xyzPlanet)
      //console.log(TetheredRingRefCoordSys.matrix, TetheredRingLatCoordSys.matrix, TetheredRingLonCoordSys.matrix, planetCoordSys.matrix)
      console.log(intersections.length)
      console.log(intersections)
      xyzPoint = planetCoordSys.worldToLocal(intersections[0].point.clone())

      
      console.log(xyzPoint.x, xyzPoint.y, xyzPoint.z)
      console.log(tram.xyz2llh(xyzPoint.z, xyzPoint.x, xyzPoint.y))

      ringMarker = new THREE.Mesh(new THREE.SphereGeometry(0.001*radiusOfPlanet, 32, 16), greenMaterial)
      ringMarker.position.set(rayOrigin.x, rayOrigin.y, rayOrigin.z)
      planetCoordSys.add(ringMarker.clone())
      ringMarker.position.set(xyzPoint.x, xyzPoint.y, xyzPoint.z)
      planetCoordSys.add(ringMarker.clone())
    }

    //ringMarker.position.set(xyzLon.x, xyzLon.y, xyzLon.z)
    //TetheredRingLonCoordSys.add(ringMarker.clone())
  
    //ringMarker.position.set(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
    //planetCoordSys.add(ringMarker.clone())
  
    //const earthObject = TetheredRingRefCoordSys.parent.parent
    //var earthCoordinate = new THREE.Vector3()
    //earthCoordinate.getPositionFromMatrix(
    //console.log(earthObject,setPositionFromMatrix(TetheredRingRefCoordSys.getWorldPosition(elevatorCableUpperAttachPnt).getPositionFromMatrix))
