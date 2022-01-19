import * as THREE from "https://cdn.skypack.dev/three@0.133.1/build/three.module.js";

export const getBounds = (
    planetMesh,
    camera,
    radiusOfPlanet
) => {
    const ray = new THREE.Ray(camera, planetMesh.position.clone().sub(camera.position).normalize());
    const point = ray.intersectSphere(new THREE.Sphere(planetMesh.position, radiusOfPlanet), new THREE.Vector3());

    const distanceToPlanet = planetMesh.position.distanceTo(camera.position) - radiusOfPlanet;
    const percentOfScreen = distanceToPlanet / 10000000;
    const zoom = Math.max(Math.floor(Math.log2(1 / percentOfScreen)), 0)

    const x = point.z
    const y = point.x
    const z = point.y

    const latRad = Math.atan2(z, Math.sqrt(x * x + y * y))
    const lonRad = Math.atan2(y, x)
    const latDeg = latRad * 180 / Math.PI
    const lonDeg = lonRad * 180 / Math.PI

}