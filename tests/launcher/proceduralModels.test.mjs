import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Box3, BoxGeometry, Mesh, Raycaster, Triangle, Scene, Vector3 } from 'three'
import { createAdaptiveNutBodyGeometry } from '../../src/launcher/AdaptiveNutGeometry.js'
import { adaptiveNutBodyEnvelope, launchBodyColors, nutToSledGap } from '../../src/launcher/launchAssemblyLayout.js'
import { adaptiveNutFrontReach } from '../../src/launcher/AdaptiveNut.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ParameterStore } from '../../src/params/ParameterStore.js'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { createLaunchVehicleGeometry, launchVehicleModel, launchVehicleNozzleDimensions } from '../../src/launcher/LaunchVehicle.js'
import { createLaunchSledGeometry, launchSledLayout } from '../../src/launcher/LaunchSledGeometry.js'
import { launchSledModel, launchSledFrontReach, virtualLaunchSled } from '../../src/launcher/LaunchSled.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`)
const params = values => {
  const p = createParameterDefinitions()
  for (const [key, value] of Object.entries({ launchVehicleShowCrew: false, launchVehicleNumModels: 1, launchSledNumModels: 1, ...values })) p[key].value = value
  return p
}

test('vehicle geometry uses exact body and nose lengths, including a sub-metre fractional nose', () => {
  for (const nose of [0.1, 0.375, 7.25]) {
    const p = params({ launchVehicleBodyLength: 12.3, launchVehicleNoseconeLength: nose, launchVehicleRadius: 2 })
    const g = createLaunchVehicleGeometry(p)
    g.computeBoundingBox()
    near(g.boundingBox.min.y, 0)
    near(g.boundingBox.max.y, 12.3 + nose)
    const positions = g.getAttribute('position')
    assert.ok(positions.array.every(Number.isFinite))
    // A full-radius cylindrical hull ends exactly where the separately sized nose starts.
    const shoulder = []
    for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getY(i) - 12.3) < 1e-5) shoulder.push(Math.hypot(positions.getX(i), positions.getZ(i)))
    assert.ok(shoulder.length > 20)
    shoulder.forEach(r => near(r, 2))
    g.dispose()
  }
})

test('vehicle radial dimensions and nozzle grow with radius without changing body length', () => {
  const p = params({ launchVehicleRadius: 1.2 })
  const a = createLaunchVehicleGeometry(p), nozzleA = launchVehicleNozzleDimensions(p)
  p.launchVehicleRadius.value *= 2
  const b = createLaunchVehicleGeometry(p), nozzleB = launchVehicleNozzleDimensions(p)
  const pa = a.getAttribute('position'), pb = b.getAttribute('position')
  assert.equal(pa.count, pb.count)
  for (let i = 0; i < pa.count; i++) {
    near(pb.getX(i), pa.getX(i) * 2)
    near(pb.getY(i), pa.getY(i))
    near(pb.getZ(i), pa.getZ(i) * 2)
  }
  near(nozzleB.exitRadius, nozzleA.exitRadius * 2)
  near(nozzleB.throatRadius, nozzleA.throatRadius * 2)
  assert.equal(nozzleB.length, nozzleA.length)
  a.dispose(); b.dispose()
})

test('vehicle model builds synchronously at actual size without body asset loading', () => {
  const p = params({ launchVehicleBodyLength: 10, launchVehicleNoseconeLength: 5 })
  const models = []
  new launchVehicleModel(p, new Scene(), models)
  assert.equal(models.length, 1)
  assert.deepEqual(models[0].scale.toArray(), [1, 1, 1])
  const body = models[0].getObjectByName('launchVehicle_body')
  assert.ok(body.isMesh)
  assert.ok(body.renderOrder > 2, 'vehicle renders after the ocean underside')
  near(new Box3().setFromObject(body).getSize(new Vector3()).y, 15)
})

test('sled spans the rail and vehicle, clears the nut, and agrees with stopping clearance', t => {
  const saved = Object.getOwnPropertyDescriptors(virtualLaunchSled)
  t.after(() => {
    for (const key of Object.getOwnPropertyNames(virtualLaunchSled)) if (!(key in saved)) delete virtualLaunchSled[key]
    Object.defineProperties(virtualLaunchSled, saved)
  })
  for (const [width, length, height, scale] of [[2, 10, 0.25, 1], [3.4, 7.3, 0.7, 2], [0.1, 0.1, 0.1, 1]]) {
    const p = params({ launchSledWidth: width, launchVehicleBodyLength: length, launchSledBodyLength: 99, launchSledHeight: height,
      launchSystemForwardScaleFactor: scale, launchSledForwardsOffset: 13 })
    const models = []
    new launchSledModel(p, new Scene(), models)
    const body = models[0].getObjectByName('launchSled_body')
    assert.ok(body.isGroup && body.children.length === 1)
    const bounds = new Box3().setFromObject(models[0])
    const size = bounds.getSize(new Vector3())
    const layout = launchSledLayout(p)
    near(size.y, length * scale * 1.75)
    assert.ok(size.z > height, 'supports bridge the vehicle-to-rail gap')
    near(bounds.min.z, layout.bottom)
    assert.ok(bounds.max.z > layout.top)
    assert.ok(bounds.max.z < layout.vehicleZ)
    assert.ok(layout.aft >= p.adaptiveNutBodyLength.value)
    assert.ok(layout.aft * scale < p.launchVehicleForwardsOffset.value * scale)
    for (const child of body.children) assert.ok(child.geometry.getAttribute('position').array.every(Number.isFinite))
    assert.ok(body.getObjectByName('launchSled_referenceBody'))
    near(bounds.min.y, 0)
    near(launchSledFrontReach(p), (layout.aft + length * 1.75) * scale)
    virtualLaunchSled.update(p)
    near(virtualLaunchSled.forwardScale, scale)
    near(virtualLaunchSled.bodyLength, length * 1.75)
  }
})

test('lunar capsule remains finite when the requested length is shorter than its diameter', () => {
  const p = params({ launchFromPlanet: 'Moon', launchVehicleRadius: 2, launchVehicleBodyLength: 0.1, launchVehicleNoseconeLength: 0.1 })
  const g = createLaunchVehicleGeometry(p)
  g.computeBoundingBox()
  near(g.boundingBox.min.y, 0)
  near(g.boundingBox.max.y, 4)
  assert.ok(g.getAttribute('position').array.every(Number.isFinite))
  g.dispose()
})


test('sled wraps below the rail and rebuilds with vehicle radius', () => {
  const p = params({}), models = []
  new launchSledModel(p, new Scene(), models)
  const body = models[0].getObjectByName('launchSled_body'), d = launchSledLayout(p)
  const bounds = new Box3().setFromObject(body)
  near(bounds.min.z, d.railBottom-d.clearance-d.thickness)
  assert.ok(bounds.max.z > d.vehicleZ-d.vehicleRadius)
  near(bounds.max.x-bounds.min.x,d.halfWidth*2)
  const oldSignature = virtualLaunchSled.signatureOf(p)
  p.launchVehicleRadius.value *= 1.5
  const larger = launchSledLayout(p)
  near(larger.vehicleRadius, d.vehicleRadius*1.5)
  assert.notEqual(virtualLaunchSled.signatureOf(p),oldSignature)
  p.launchRailUpwardsOffset.value -= 1
  near(launchSledLayout(p).railTop,d.railTop-1)
})

// Compare against the actual asset, not dimensions restated from the generator.
test('procedural sled surface matches the original OBJ in both directions', () => {
  const vertices = [], triangles = []
  for (const line of readFileSync(new URL('../../models/LaunchSled.obj',import.meta.url),'utf8').split(/\r?\n/)) {
    const [kind,...fields] = line.trim().split(/\s+/)
    if (kind === 'v') vertices.push(new Vector3(...fields.map(v=>Number(v)/1000)))
    if (kind === 'f') {
      const ids = fields.map(f=>Number(f.split('/')[0])-1)
      for (let i = 1; i < ids.length-1; i++) triangles.push(new Triangle(vertices[ids[0]],vertices[ids[i]],vertices[ids[i+1]]))
    }
  }
  const bounds = new Box3().setFromPoints(vertices), size = bounds.getSize(new Vector3())
  const geometry = createLaunchSledGeometry({width:size.x,length:size.y,height:size.z})
  const positions = geometry.getAttribute('position'), generated = [], generatedTriangles = []
  for (let i = 0; i < positions.count; i++) generated.push(new Vector3().fromBufferAttribute(positions,i).add(new Vector3(0,0,bounds.min.z)))
  for (let i = 0; i < geometry.index.count; i += 3) generatedTriangles.push(new Triangle(...[0,1,2].map(j=>generated[geometry.index.getX(i+j)])))
  const closest = new Vector3()
  const distance = (point,faces) => Math.sqrt(Math.min(...faces.filter(face=>face.getArea()>1e-12).map(face=>face.closestPointToPoint(point,closest).distanceToSquared(point))))
  const referenceError = Math.max(...vertices.map(v=>distance(v,generatedTriangles)))
  const generatedError = Math.max(...generated.map(v=>distance(v,triangles)))
  // The procedural circular arcs are smooth; the OBJ approximates them with large facets.
  assert.ok(referenceError < 0.02, `OBJ-to-procedural error ${referenceError} m`)
  assert.ok(generatedError < 0.02, `procedural-to-OBJ error ${generatedError} m`)
  // Check surface winding on nondegenerate top and bottom triangles.
  const rayNormal = new Vector3()
  for (const face of generatedTriangles) {
    const centre = face.getMidpoint(new Vector3())
    if (Math.abs(centre.x) > 0.6 && Math.abs(centre.x) < 1.5 && centre.y > 4 && centre.y < 12) {
      face.getNormal(rayNormal)
      assert.ok(centre.z > -1.4 ? rayNormal.z > 0 : rayNormal.z < 0)
    }
  }
})



test('sled top follows the hull and capture lips clear both rail and pedestal', () => {
  for (const radius of [1.2,1.8]) {
    const p = params({launchVehicleRadius:radius}), models = []
    new launchSledModel(p,new Scene(),models)
    const body = models[0].getObjectByName('launchSled_body'), d = launchSledLayout(p)
    body.updateMatrixWorld(true)
    const ray = new Raycaster()
    for (const fraction of [-0.65,0,0.65]) {
      const x = fraction*d.vehicleRadius
      ray.set(new Vector3(d.vehicleX+x,d.length/2,d.vehicleZ+1),new Vector3(0,0,-1))
      const hit = ray.intersectObject(body,true)[0]
      assert.ok(hit)
      assert.ok(Math.abs(Math.hypot(hit.point.x-d.vehicleX,hit.point.z-d.vehicleZ)-(d.vehicleRadius+d.clearance)) < 0.001)
    }
    // Rays across the rail envelope and down through the pedestal slot meet no sled.
    ray.set(new Vector3(d.railX-d.railHalfWidth,d.length/2,(d.railTop+d.railBottom)/2),new Vector3(1,0,0))
    ray.far = 2*d.railHalfWidth
    assert.equal(ray.intersectObject(body,true).length,0)
    ray.set(new Vector3(d.railX,d.length/2,d.railBottom),new Vector3(0,0,-1))
    ray.far = Infinity
    assert.equal(ray.intersectObject(body,true).length,0)
    // A shoulder beneath either edge is captured by an inward-facing lip.
    for (const side of [-1,1]) {
      ray.set(new Vector3(d.railX+side*d.railHalfWidth*0.8,d.length/2,d.railBottom),new Vector3(0,0,-1))
      const hit = ray.intersectObject(body,true)[0]
      assert.ok(hit)
      near(hit.point.z,d.railBottom-d.clearance)
    }
  }
  near(params({}).launcherMassDriverRailWidth.value,1.5)
})


test('sled length follows the scaled vehicle body, including recovered legacy lengths', () => {
  const p = params({launchVehicleBodyLength:24,launchVehicleScaleFactor:1.5,launchSystemForwardScaleFactor:2,launchSledBodyLength:3})
  const models = []
  new launchSledModel(p,new Scene(),models)
  near(new Box3().setFromObject(models[0]).getSize(new Vector3()).y,126)
  const layout = launchSledLayout(p)
  near(layout.length,63)
  near(launchSledFrontReach(p),(layout.aft+63)*2)
  const store = new ParameterStore(p)
  near(store.derived.launchSledBodyLength.value,63)
  const oldSignature = virtualLaunchSled.signatureOf(p)
  p.launchVehicleBodyLength.value = 30
  assert.notEqual(virtualLaunchSled.signatureOf(p),oldSignature)
  near(launchSledLayout(p).length,78.75)
  near(store.derive().launchSledBodyLength.value,78.75)
})


test('crew retain native dimensions under uniform and nonuniform vehicle scaling and capsule tilt', async t => {
  t.mock.method(GLTFLoader.prototype,'load',(_url,onLoad) => {
    const scene = new Scene()
    scene.add(new Mesh(new BoxGeometry(0.4,1.8,0.3)))
    onLoad({scene})
  })
  for (const [vehicleScale,sx,sy,sz] of [[1,1,1,1],[2,1,1,1],[1.5,2,3,4]]) {
    const p = params({launchVehicleShowCrew:true,launchVehicleCrewCount:2,launchVehicleScaleFactor:vehicleScale,
      launchSystemRightwardScaleFactor:sx,launchSystemForwardScaleFactor:sy,launchSystemUpwardScaleFactor:sz})
    const models = []
    new launchVehicleModel(p,new Scene(),models)
    await new Promise(resolve=>setImmediate(resolve))
    const crews = models[0].getObjectByName('Crews')
    assert.equal(crews.children.length,2)
    for (const pod of crews.children) {
      pod.rotation.set(0.3,0.4,0.5)
      models[0].updateMatrixWorld(true)
      const figure = pod.getObjectByName('Crew')
      const scale = figure.getWorldScale(new Vector3())
      near(scale.x,1); near(scale.y,1); near(scale.z,1)
      const e = figure.matrixWorld.elements
      const axes = [0,4,8].map(i=>new Vector3(e[i],e[i+1],e[i+2]))
      near(axes[0].dot(axes[1]),0); near(axes[1].dot(axes[2]),0); near(axes[0].dot(axes[2]),0)
    }
    near(launchSledLayout(p).length,p.launchVehicleBodyLength.value*vehicleScale*1.75)
  }
})


test('nut body brackets the grappler span, shares the sled rail wrap and leaves a tight gap', () => {
  for (const span of [10,20,40]) {
    const p = params({adaptiveNutGrapplerLength:span})
    const envelope = adaptiveNutBodyEnvelope(p), d = launchSledLayout(p)
    const first = (p.adaptiveNutBodyLength.value-span)/2
    const nut = new Mesh(createAdaptiveNutBodyGeometry(p))
    nut.position.set(p.adaptiveNutSidewaysOffset.value,p.adaptiveNutForwardsOffset.value,p.adaptiveNutUpwardsOffset.value)
    const bounds = new Box3().setFromObject(nut)
    near(bounds.min.y,first-envelope.margin)
    near(bounds.max.y,first+span+envelope.margin)
    near(adaptiveNutFrontReach(p),bounds.max.y)
    near(d.aft-bounds.max.y,nutToSledGap)
    const models = []
    new launchSledModel(p,new Scene(),models)
    const sled = models[0]
    sled.position.set(p.launchSledSidewaysOffset.value,d.aft,p.launchSledUpwardsOffset.value)
    sled.updateMatrixWorld(true); nut.updateMatrixWorld(true)
    // Both inward lips are at the same physical elevation; the pedestal slot stays open.
    for (const body of [nut,sled]) {
      const y = new Box3().setFromObject(body).getCenter(new Vector3()).y
      const railBottom = p.launchRailUpwardsOffset.value-p.launcherMassDriverRailHeight.value/2
      for (const sign of [-1,1]) {
        const ray = new Raycaster(new Vector3(sign*p.launcherMassDriverRailWidth.value*0.4,y,railBottom),new Vector3(0,0,-1))
        near(ray.intersectObject(body,true)[0].point.z,railBottom-d.clearance)
      }
      const ray = new Raycaster(new Vector3(0,y,railBottom),new Vector3(0,0,-1))
      assert.equal(ray.intersectObject(body,true).length,0)
    }
  }
  assert.notEqual(launchBodyColors.sled,launchBodyColors.adaptiveNut)
})
