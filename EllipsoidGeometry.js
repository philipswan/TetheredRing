import * as THREE from 'three'

export class EllipsoidGeometry extends THREE.BufferGeometry {
  constructor(
    ellipsoid,
    widthSegments = 32,
    heightSegments = 16,
    phiStart = 0,
    phiLength = Math.PI * 2,
    thetaStart = 0,
    thetaLength = Math.PI
  ) {
    super()

    const { a, f } = ellipsoid
    const e2 = 2 * f - f * f

    const vertices = []
    const normals = []
    const uvs = []
    const indices = []
    const grid = []
    let index = 0

    for (let iy = 0; iy <= heightSegments; iy++) {
      const row = []
      const v = iy / heightSegments
      const theta = thetaStart + v * thetaLength

      // Three.js sphere-style theta:
      // theta = 0 at north pole, pi/2 at equator, pi at south pole
      const lat = Math.PI / 2 - theta

      const sinLat = Math.sin(lat)
      const cosLat = Math.cos(lat)

      const N = a / Math.sqrt(1 - e2 * sinLat * sinLat)

      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments
        const phi = phiStart + u * phiLength

        const sinLon = Math.sin(phi)
        const cosLon = Math.cos(phi)

        const x = -N * cosLat * cosLon
        const y = N * (1 - e2) * sinLat
        const z = N * cosLat * sinLon

        vertices.push(x, y, z)

        const nx = -cosLat * cosLon
        const ny = sinLat
        const nz = cosLat * sinLon
        normals.push(nx, ny, nz)

        uvs.push(u, 1 - v)

        row.push(index++)
      }

      grid.push(row)
    }

    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const aIndex = grid[iy][ix + 1]
        const bIndex = grid[iy][ix]
        const cIndex = grid[iy + 1][ix]
        const dIndex = grid[iy + 1][ix + 1]

        if (iy !== 0 || thetaStart > 0) indices.push(aIndex, bIndex, dIndex)
        if (iy !== heightSegments - 1 || thetaStart + thetaLength < Math.PI) indices.push(bIndex, cIndex, dIndex)
      }
    }

    this.setIndex(indices)
    this.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    this.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    this.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  }
}