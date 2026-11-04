import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GlowTube, BOUND_SIGMAS } from '../../src/scene/GlowTube.js'

const material = new THREE.MeshBasicMaterial()
const vec = (attribute, i) => new THREE.Vector3().fromBufferAttribute(attribute, i)

// A straight tube along +x, far from the origin (as the trails are, near the planet's surface).
function straightTube(rings = 3, sides = 8) {
  const tube = new GlowTube(rings + 2, material, { sides })
  const origin = new THREE.Vector3(6.4e6, 1e3, -2e3)
  tube.begin(origin)
  for (let i = 0; i < rings; i++) tube.addRing(origin.x + 10 * i, origin.y, origin.z, 1 + i, 1, 0.5, 0.25)
  tube.end()
  return { tube, origin, sides, rings }
}

test('vertices are offsets from the origin, which the mesh is placed at', () => {
  const { tube, origin } = straightTube()
  assert.ok(tube.position.equals(origin))
  const p = vec(tube.geometry.attributes.axisPoint, 0)
  assert.ok(p.length() < 1e-9)
})

test('rings enclose BOUND_SIGMAS sigma; per-vertex axis, sigma, emission and lengths along the axis', () => {
  const { tube, sides } = straightTube()
  const g = tube.geometry.attributes
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < sides; j++) {
      const o = i * sides + j
      const across = vec(g.position, o).sub(vec(g.axisPoint, o))
      assert.ok(Math.abs(across.x) < 1e-9, 'ring is square to the axis')
      assert.ok(Math.abs(across.length() - (1 + i) * BOUND_SIGMAS / Math.cos(Math.PI / sides)) < 1e-4)
      assert.ok(vec(g.axisDir, o).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9)
      assert.equal(g.sigma.getX(o), 1 + i)
      assert.deepEqual([g.emission.getX(o), g.emission.getY(o), g.emission.getZ(o)], [1, 0.5, 0.25])
      assert.deepEqual([g.axial.getX(o), g.axial.getY(o)], [10 * i, 20 - 10 * i])
    }
  }
})

test('every triangle faces outwards: the sides away from the axis, the caps away from the ends', () => {
  const { tube, sides, rings } = straightTube()
  const g = tube.geometry
  const index = g.index.array
  const count = g.drawRange.count
  assert.equal(count, ((rings - 1) * 2 + 2) * sides * 3)
  const centre = new THREE.Vector3(10, 0, 0)   // middle of the tube
  for (let t = 0; t < count; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map(i => vec(g.attributes.position, i))
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const middle = a.clone().add(b).add(c).divideScalar(3)
    assert.ok(normal.dot(middle.sub(centre)) > 0, `triangle ${t / 3} faces inwards`)
  }
})

test('fewer than two rings draws nothing', () => {
  const tube = new GlowTube(4, material)
  tube.begin(new THREE.Vector3())
  tube.addRing(0, 0, 0, 1, 1, 1, 1)
  tube.end()
  assert.equal(tube.visible, false)
  assert.equal(tube.geometry.drawRange.count, 0)
})
