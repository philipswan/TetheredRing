import * as THREE from "https://cdn.skypack.dev/three@0.133.1/build/three.module.js";
import { getBounds } from "./utils";


export const makePlanetMesh = (orbitControls, camera, radiusOfPlanet, partial, planetWidthSegments, planetHeightSegments) => {

    const planetMesh = new THREE.Mesh(
        new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
        new THREE.ShaderMaterial({
            vertexShader: document.getElementById('vertexShader').textContent,
            fragmentShader: document.getElementById('fragmentShader').textContent,
            uniforms: {
                planetTexture: {
                    value: undefined,
                }
            },

        })
    )

    if (partial) {
        orbitControls.addEventListener("end", () => {
            const bounds = getBounds(planetMesh, camera, radiusOfPlanet);
            //Bounds to mesh is not working
            const phiStart = (bounds[0] + 180) * Math.PI / 180;
            const phiLength = (bounds[2] - bounds[0]) * Math.PI / 180;
            const thetaStart = (-bounds[1] - 90) * Math.PI / 180;
            const thetaLength = (bounds[3] - bounds[1]) * Math.PI / 180;

            console.log(phiStart, phiLength, thetaStart, thetaLength)
            planetMesh.geometry.dispose()
            planetMesh.geometry = new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments, phiStart, phiLength, thetaStart, thetaLength);
        })
    }

    return planetMesh;
};
