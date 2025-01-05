import * as THREE from 'three';

export class EllipsoidGeometry extends THREE.BufferGeometry {
    /**
     * Creates an ellipsoid geometry aligned with Three.js conventions, using geodetic distance-based remapping for both V and vertices.
     * @param {object} ellipsoid - Ellipsoid parameters.
     * @param {number} ellipsoid.a - Semi-major axis (equatorial radius).
     * @param {number} ellipsoid.f - Flattening factor (e.g., WGS84: ~1/298.257223563).
     * @param {number} widthSegments - Number of width segments.
     * @param {number} heightSegments - Number of height segments.
     * @param {number} phiStart - Horizontal starting angle (default 0).
     * @param {number} phiLength - Horizontal sweep angle (default 2π).
     * @param {number} thetaStart - Vertical starting angle (default 0).
     * @param {number} thetaLength - Vertical sweep angle (default π).
     */
    constructor(
        ellipsoid,
        widthSegments = 32,
        heightSegments = 16,
        phiStart = 0,
        phiLength = Math.PI * 2,
        thetaStart = 0,
        thetaLength = Math.PI
    ) {
        super();

        const { a, f } = ellipsoid;
        const b = a * (1 - f); // Semi-minor axis (polar radius)

        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let index = 0;

        const grid = [];

        // Helper function: Numerically integrate the geodetic arc length
        const geodeticArcLength = (theta) => {
            const n = 100; // Number of steps for numerical integration
            const dTheta = theta / n;
            let arcLength = 0;

            for (let i = 0; i < n; i++) {
                const t = i * dTheta;
                const sinT = Math.sin(t);
                const cosT = Math.cos(t);
                const integrand = Math.sqrt(a * a * cosT * cosT + b * b * sinT * sinT);
                arcLength += integrand * dTheta;
            }

            return arcLength;
        };

        const quarterArcLength = geodeticArcLength(Math.PI / 2);
        const arcStart = geodeticArcLength(Math.PI / 2 - thetaStart);
        const arcEnd = geodeticArcLength(Math.PI / 2 - (thetaStart + thetaLength));
        const totalArcLength = arcEnd - arcStart;

        // Generate vertices, normals, and UVs
        for (let iy = 0; iy <= heightSegments; iy++) {
            const verticesRow = [];
            const v = iy / heightSegments;

            // Map theta to latitude directly
            const theta = thetaStart + v * thetaLength;
            const equatorialDistance = geodeticArcLength(Math.PI / 2 - theta);
            const remappedTheta = Math.PI / 2 * (1 - equatorialDistance / quarterArcLength);

            for (let ix = 0; ix <= widthSegments; ix++) {
                const u = ix / widthSegments;
                const phi = phiStart + u * phiLength;

                // Vertex position on the ellipsoid
                const x = -a * Math.cos(phi) * Math.sin(remappedTheta);
                const y = b * Math.cos(remappedTheta); // Use semi-minor axis for Z (polar)
                const z = a * Math.sin(phi) * Math.sin(remappedTheta);

                vertices.push(x, y, z);

                // Normals
                const nx = x / a;
                const ny = y / b;
                const nz = z / a;
                const normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz);
                normals.push(nx / normalLength, ny / normalLength, nz / normalLength);

                // UVs
                const mappedV = 1 - (equatorialDistance - arcStart) / totalArcLength;
                uvs.push(u, mappedV);

                verticesRow.push(index++);
            }

            grid.push(verticesRow);
        }

        // Generate indices for triangles
        for (let iy = 0; iy < heightSegments; iy++) {
            for (let ix = 0; ix < widthSegments; ix++) {
                const a = grid[iy][ix + 1];
                const b = grid[iy][ix];
                const c = grid[iy + 1][ix];
                const d = grid[iy + 1][ix + 1];

                if (iy !== 0 || thetaStart > 0) indices.push(a, b, d);
                if (iy !== heightSegments - 1 || thetaStart + thetaLength < Math.PI) indices.push(b, c, d);
            }
        }

        // Build geometry
        this.setIndex(indices);
        this.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        this.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
}
