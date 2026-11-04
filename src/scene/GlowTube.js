import * as THREE from 'three'

// A tube of light about a curved axis (a plasma trail, an exhaust plume), rebuilt from a list of rings
// whenever it changes. Each ring has a centre, a radius sigma (m) and an emissivity at the centre
// (RGB, display units per metre of path); the light falls off across the tube as exp(-d^2 / sigma^2).
// The mesh is a tube bounding the light (BOUND_SIGMAS sigma out), closed at both ends; glowMaterials.js
// draws its far side and integrates the light along each line of sight (src/shaders/glowTube.frag.glsl),
// within the tube's length.
//
// Centres are given in the parent's coordinates, as float64. The mesh is placed at `origin` and its
// vertices are offsets from it, so the float32 geometry stays precise near the planet's surface.
//
//   tube.begin(origin)
//   tube.addRing(x, y, z, sigma, r, g, b)   // at least two, at most maxRings
//   tube.end()

export const BOUND_SIGMAS = 2.4   // exp(-2.4^2) = 0.3% of the centre's light is cut off

export class GlowTube extends THREE.Mesh {

  constructor(maxRings, material, { sides = 12, name = 'glowTube' } = {}) {
    const geometry = new THREE.BufferGeometry()
    super(geometry, material)
    this.name = name
    this.maxRings = maxRings
    this.sides = sides
    this.rings = new Float64Array(maxRings * 7)   // x, y, z (offsets from origin), sigma, r, g, b
    this.count = 0
    this.origin = new THREE.Vector3()

    const n = maxRings * sides + 2   // (and the centres of the end caps)
    const attribute = (size) => new THREE.BufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', attribute(3))
    geometry.setAttribute('axisPoint', attribute(3))
    geometry.setAttribute('axisDir', attribute(3))
    geometry.setAttribute('sigma', attribute(1))
    geometry.setAttribute('emission', attribute(3))
    geometry.setAttribute('axial', attribute(2))
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(((maxRings - 1) * 2 + 2) * sides * 3), 1))
    this.indexRings = 0
    geometry.setDrawRange(0, 0)
    // The tube changes every frame and is small: not worth a bounding sphere.
    this.frustumCulled = false
    this.matrixAutoUpdate = false
  }

  // Triangles of a tube of `rings` rings of `sides` vertices, closed at each end by a fan about the
  // vertices `startCentre` and `endCentre`, wound counter-clockwise seen from outside. (Ring vertices go
  // anticlockwise about the direction from the first ring to the last.)
  static tubeIndex(rings, sides, startCentre = rings * sides, endCentre = rings * sides + 1) {
    const index = []
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j, b = i * sides + (j + 1) % sides
        const c = a + sides, d = b + sides
        index.push(a, b, c, b, d, c)
      }
    }
    const last = (rings - 1) * sides
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides
      index.push(startCentre, k, j)
      index.push(endCentre, last + j, last + k)
    }
    return index
  }

  begin(origin) {
    this.origin.copy(origin)
    this.count = 0
  }

  addRing(x, y, z, sigma, r, g, b) {
    if (this.count >= this.maxRings) return
    const k = this.count++ * 7
    const v = this.rings
    v[k] = x - this.origin.x
    v[k + 1] = y - this.origin.y
    v[k + 2] = z - this.origin.z
    v[k + 3] = sigma
    v[k + 4] = r
    v[k + 5] = g
    v[k + 6] = b
  }

  // Builds the vertices: each ring is a polygon around its centre, in a frame carried along the axis by
  // parallel transport (so the tube does not twist), wide enough to enclose a circle of BOUND_SIGMAS sigma.
  end() {
    const n = this.count
    const geometry = this.geometry
    if (n < 2) {
      geometry.setDrawRange(0, 0)
      this.visible = false
      return
    }
    this.visible = true
    const v = this.rings, sides = this.sides
    const pos = geometry.attributes.position.array
    const axisPoint = geometry.attributes.axisPoint.array
    const axisDir = geometry.attributes.axisDir.array
    const sigma = geometry.attributes.sigma.array
    const emission = geometry.attributes.emission.array
    const axial = geometry.attributes.axial.array
    const grow = BOUND_SIGMAS / Math.cos(Math.PI / sides)
    // Length along the axis from the first ring and to the last
    let length = 0
    for (let i = 1; i < n; i++) length += Math.hypot(v[i * 7] - v[i * 7 - 7], v[i * 7 + 1] - v[i * 7 - 6], v[i * 7 + 2] - v[i * 7 - 5])
    let along = 0
    let nx = 0, ny = 0, nz = 0   // the transported normal
    for (let i = 0; i < n; i++) {
      // Tangent from the neighbouring centres
      const i0 = Math.max(0, i - 1) * 7, i1 = Math.min(n - 1, i + 1) * 7
      let tx = v[i1] - v[i0], ty = v[i1 + 1] - v[i0 + 1], tz = v[i1 + 2] - v[i0 + 2]
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl; ty /= tl; tz /= tl
      if (i === 0) {
        // Any normal: the axis least aligned with the tangent, made perpendicular to it
        const ax = Math.abs(tx), ay = Math.abs(ty), az = Math.abs(tz)
        nx = ax <= ay && ax <= az ? 1 : 0
        ny = nx === 0 && ay <= az ? 1 : 0
        nz = nx === 0 && ny === 0 ? 1 : 0
      }
      const d = nx * tx + ny * ty + nz * tz
      nx -= d * tx; ny -= d * ty; nz -= d * tz
      const nl = Math.hypot(nx, ny, nz) || 1
      nx /= nl; ny /= nl; nz /= nl
      // Binormal = tangent x normal
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx
      const k = i * 7
      const cx = v[k], cy = v[k + 1], cz = v[k + 2], s = v[k + 3]
      if (i > 0) along += Math.hypot(cx - v[k - 7], cy - v[k - 6], cz - v[k - 5])
      const radius = s * grow
      for (let j = 0; j < sides; j++) {
        const theta = 2 * Math.PI * j / sides
        const c = Math.cos(theta) * radius, sn = Math.sin(theta) * radius
        const o = i * sides + j
        pos[o * 3] = cx + c * nx + sn * bx
        pos[o * 3 + 1] = cy + c * ny + sn * by
        pos[o * 3 + 2] = cz + c * nz + sn * bz
        axisPoint[o * 3] = cx; axisPoint[o * 3 + 1] = cy; axisPoint[o * 3 + 2] = cz
        axisDir[o * 3] = tx; axisDir[o * 3 + 1] = ty; axisDir[o * 3 + 2] = tz
        sigma[o] = s
        emission[o * 3] = v[k + 4]; emission[o * 3 + 1] = v[k + 5]; emission[o * 3 + 2] = v[k + 6]
        axial[o * 2] = along; axial[o * 2 + 1] = length - along
      }
      // The end caps' centres
      if (i === 0 || i === n - 1) {
        const from = i * sides, o = n * sides + (i === 0 ? 0 : 1)
        for (const [name, size] of [['axisPoint', 3], ['axisDir', 3], ['sigma', 1], ['emission', 3], ['axial', 2]]) {
          const a = geometry.attributes[name].array
          for (let c = 0; c < size; c++) a[o * size + c] = a[from * size + c]
        }
        pos[o * 3] = cx; pos[o * 3 + 1] = cy; pos[o * 3 + 2] = cz
      }
    }
    if (this.indexRings !== n) {
      geometry.index.array.set(GlowTube.tubeIndex(n, sides))
      geometry.index.needsUpdate = true
      this.indexRings = n
    }
    const used = n * sides + 2
    for (const name of ['position', 'axisPoint', 'axisDir', 'sigma', 'emission', 'axial']) {
      const attribute = geometry.attributes[name]
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(0, used * attribute.itemSize)
      attribute.needsUpdate = true
    }
    geometry.setDrawRange(0, ((n - 1) * 2 + 2) * sides * 3)
    this.position.copy(this.origin)
    this.updateMatrix()
  }

  dispose() {
    this.geometry.dispose()
  }
}
