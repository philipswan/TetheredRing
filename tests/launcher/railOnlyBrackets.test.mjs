import test from 'node:test'
import assert from 'node:assert/strict'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { massDriverBracketModel, virtualRailOnlyBracket } from '../../src/launcher/MassDriverBracket.js'

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-5, `${a} != ${b}`)

test('rail-only bracket spans the tube wall and rail underside without depending on screw mounts', () => {
  const p = createParameterDefinitions(), model = new massDriverBracketModel(p)
  const shapes = model.createRailSupportShapes(p)
  const points = shapes.map(shape => shape.extractPoints().shape)
  assert.equal(shapes[0].holes.length, 1)
  near(Math.max(...points[1].map(v=>v.y)), -p.launcherMassDriverRailHeight.value/2)
  for(const point of points[0]) near(Math.hypot(point.x,point.y+p.launchRailUpwardsOffset.value), p.launcherMassDriverTubeInnerRadius.value)
  for(const key of ['launcherMassDriverScrewSidewaysOffset','launcherMassDriverScrewUpwardsOffset','launcherMassDriverScrewShaftOuterRadius','launcherMassDriverBracketHeight']) p[key].value *= 3
  assert.deepEqual(model.createRailSupportShapes(p).map(s=>s.extractPoints().shape), points)
  const mesh = model.createModel(0, shapes)
  assert.ok(mesh.geometry.getAttribute('position').array.every(Number.isFinite))
  mesh.geometry.computeBoundingBox()
  const box=mesh.geometry.boundingBox
  near(box.max.y-box.min.y, p.launcherMassDriverScrewBracketThickness.value)
  near(box.max.x-box.min.x, 2*p.launcherMassDriverTubeInnerRadius.value)
  mesh.geometry.dispose(); mesh.material.dispose()
})

test('rail-only supports follow bracket visibility and place themselves at the rail elevation', t => {
  const saved=Object.getOwnPropertyDescriptors(virtualRailOnlyBracket)
  t.after(()=>Object.defineProperties(virtualRailOnlyBracket,saved))
  const p=createParameterDefinitions()
  p.showMassDriverBrackets.value=true
  p.launcherMassDriverScrewRoughLength.value=5
  virtualRailOnlyBracket.update(p,434,1)
  assert.equal(virtualRailOnlyBracket.numObjects,87)
  assert.equal(virtualRailOnlyBracket.isTeardownRequired(p),false)
  p.launcherMassDriverScrewRoughLength.value=10
  assert.equal(virtualRailOnlyBracket.isTeardownRequired(p),true)
  virtualRailOnlyBracket.update(p,434,2)
  assert.equal(virtualRailOnlyBracket.numObjects,44)
  assert.equal(virtualRailOnlyBracket.isTeardownRequired(p),false)
  const support=new virtualRailOnlyBracket(0.5,0)
  let offset
  support.placeAtD=(model,frame,z)=>{offset=z}
  support.placeAndOrientModel({}, {})
  near(offset,p.launchRailUpwardsOffset.value)
  p.showMassDriverBrackets.value=false
  assert.equal(virtualRailOnlyBracket.isTeardownRequired(p),true)
  virtualRailOnlyBracket.update(p,434,3)
  assert.equal(virtualRailOnlyBracket.numObjects,0)
  assert.equal(virtualRailOnlyBracket.isVisible,false)
})
