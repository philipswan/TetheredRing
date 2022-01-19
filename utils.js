
export const getBounds = (
    planetMesh,
    camera,
    radiusOfPlanet
) => {
    const point = camera.position.clone().setLength(radiusOfPlanet);

    const distanceToPlanet = planetMesh.position.distanceTo(camera.position) - radiusOfPlanet;
    const percentOfScreen = distanceToPlanet / 10000000;
    const zoom = Math.max(Math.floor(Math.log2(1 / percentOfScreen)) + 3, 0)

    const x = point.z
    const y = point.x
    const z = point.y

    const latRad = Math.atan2(z, Math.sqrt(x * x + y * y))
    const lonRad = Math.atan2(y, x)
    const latDeg = latRad * 180 / Math.PI
    let lonDeg = (lonRad * 180 / Math.PI) + 180
    if (lonDeg > 180) {
        lonDeg -= 360
    }

    const numSegments = Math.pow(2, zoom)
    const latSegmentSize = 180 / numSegments;
    const lonSegmentSize = 360 / numSegments;
    const roundedLongitude = Math.round(lonDeg / lonSegmentSize) * lonSegmentSize;
    const roundedLatitude = Math.round(latDeg / latSegmentSize) * latSegmentSize;
    const latMin = roundedLatitude - latSegmentSize * 2;
    const latMax = roundedLatitude + latSegmentSize * 2;
    const lonMin = roundedLongitude - lonSegmentSize * 2;
    const lonMax = roundedLongitude + lonSegmentSize * 2;


    return [lonMin, latMin, lonMax, latMax]
}