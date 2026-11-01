import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { SledGrapplerPlacementInfo, SledGrapplerGeometry } from './SledGrapplerGeometry.js'
import * as tram from '../utils/tram.js'
import { quaternionFromFrame } from '../curves/SuperCurves.js'
import { MovingVirtualObject, curveFrameAtTime, parameterSignature } from './VirtualObject.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { grapplerPose, followingAngle, grapplerSequencingModes } from './grapplerPlacement.js'
import { SubPixelFade, withSubPixelFade } from '../scene/SubPixelFade.js'
import { GrapplerLatticePlan, effectivePhase } from './grapplerLattice.js'

const MODEL_FORWARD = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
const MODEL_UPWARD = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

// Grappler hardware per grappler slot: for each of the two (top/bottom) grappler rows, each side
// (left/right) has three (inner/middle/outer) ball-joint pivots, posts, piston rods (struts) and
// piston cylinders. All of it is drawn as one InstancedParts per nut; the pads are a second one.
const GRAPPLER_ROWS = [0.5, 0] // midwayRotation for the top and bottom rows
const SIDES = [-1, 1]          // leftRightSign
const INNER_MIDDLE_OUTER = [
  { sign1: -2, sign2: -2 },  // inner
  { sign1: 0.5, sign2: -1 }, // middle
  { sign1: 2, sign2: 2 },    // outer
]
const HARDWARE_PARTS = ['pivot', 'post', 'strut', 'cylinder']
// A grappler's angle (radians, from the middle of its travel, fixed to the nut, within [-pi, pi)) if
// following the nearest flight, comes from followingAngle in grapplerPlacement.js.

// The pads and the hardware fade out by their own on-screen size (SubPixelFade.js), each part by its
// thickness, and their levels of detail stop drawing them once the part that stays visible longest is
// all but invisible (at this opacity), so the arms stay as long as they show, as the pads do.
const FADED_OUT_OPACITY = 0.04       // compact parts (pads, ball joints): by area
const FADED_OUT_LINE_OPACITY = 0.1   // rods and cylinders: by width

// Returns a copy of `geometry` mirrored in x, with the triangle winding reversed so that front faces
// stay front faces (instances cannot use negative scale for mirroring).
function mirrorGeometryX(geometry) {
  const mirrored = geometry.clone()
  mirrored.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1))
  if (mirrored.index) {
    const index = mirrored.index.array
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t
    }
    mirrored.index.needsUpdate = true
  }
  else {
    for (const attribute of Object.values(mirrored.attributes)) {
      const a = attribute.array, size = attribute.itemSize
      for (let v = 0; v < attribute.count; v += 3) {
        for (let k = 0; k < size; k++) {
          const t = a[(v + 1) * size + k]; a[(v + 1) * size + k] = a[(v + 2) * size + k]; a[(v + 2) * size + k] = t
        }
      }
      attribute.needsUpdate = true
    }
  }
  return mirrored
}

// A set of parts drawn as one InstancedMesh per shape, addressed like a BatchedMesh (addGeometry,
// addInstance, setMatrixAt, setVisibleAt, setColorAt, setGeometryAt). (Instanced meshes are plain
// WebGL, where a BatchedMesh depends on its draw number to find each part's matrix.)
class InstancedParts extends THREE.Group {
  constructor(material, { colors = false } = {}) {
    super()
    this.material = material
    this.colors = colors
    this.shapes = []      // per geometry id: { geometry, mesh (made by finish()), count }
    this.instances = []   // per instance id: { shape, index, visible }
  }

  // (A shape may have its own material, e.g. one faded by that shape's size.)
  addGeometry(geometry, material = this.material) {
    this.shapes.push({ geometry, material, mesh: null, count: 0 })
    return this.shapes.length - 1
  }

  addInstance(geometryId) {
    const shape = this.shapes[geometryId]
    this.instances.push({ shape, index: shape.count++, visible: true, matrix: new THREE.Matrix4() })
    return this.instances.length - 1
  }

  // Makes the meshes, once every geometry and instance has been added.
  finish() {
    for (const shape of this.shapes) {
      const mesh = new THREE.InstancedMesh(shape.geometry, shape.material, Math.max(1, shape.count))
      mesh.count = shape.count
      mesh.name = this.name
      mesh.castShadow = this.castShadow
      mesh.frustumCulled = false // its bounding sphere would have to follow the parts every frame
      if (this.colors) for (let i = 0; i < shape.count; i++) mesh.setColorAt(i, _white)
      shape.mesh = mesh
      this.add(mesh)
    }
  }

  setMatrixAt(id, matrix) {
    const instance = this.instances[id]
    instance.matrix.copy(matrix)
    if (instance.visible) this._write(instance, matrix)
  }

  // (Hidden parts are scaled to nothing.)
  setVisibleAt(id, visible) {
    const instance = this.instances[id]
    if (instance.visible === visible) return
    instance.visible = visible
    this._write(instance, visible ? instance.matrix : _hidden)
  }

  setColorAt(id, color) {
    const { shape, index } = this.instances[id]
    shape.mesh.setColorAt(index, color)
    shape.mesh.instanceColor.needsUpdate = true
  }

  // Replaces a shape's geometry (with a copy: the caller keeps and disposes its own).
  setGeometryAt(geometryId, geometry) {
    const shape = this.shapes[geometryId]
    const copy = geometry.clone()
    shape.mesh.geometry.dispose()
    shape.mesh.geometry = copy
    shape.geometry = copy
  }

  _write({ shape, index }, matrix) {
    shape.mesh.setMatrixAt(index, matrix)
    shape.mesh.instanceMatrix.needsUpdate = true
  }
}

const _white = new THREE.Color(1, 1, 1)
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0)

// The slant of a pad shape's length (radians): from round the screw (its local x) towards along it (y),
// from the centre of one end to the other's, within (-pi/2, pi/2]. A pad gripping a flight follows its
// helix; parked, or hopping, it is turned back by this to line up with its actuators.
function padSlant(geometry) {
  const pos = geometry.attributes.position
  let dx = 0, dy = 0
  for (let k = 0; k < 4; k++) { dx += pos.getX(k + 4) - pos.getX(k); dy += pos.getY(k + 4) - pos.getY(k) }
  let slant = Math.atan2(dy, dx)
  if (slant > Math.PI / 2) slant -= Math.PI
  if (slant <= -Math.PI / 2) slant += Math.PI
  return slant
}

export class adaptiveNutModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList) {
    const p = (name) => dParamWithUnits[name].value
    const width = p('adaptiveNutWidth')
    const height = p('adaptiveNutHeight')
    const bodyLength = p('adaptiveNutBodyLength')
    const grapplerLength = p('adaptiveNutGrapplerLength')
    const forwardsOffset = p('adaptiveNutForwardsOffset')
    const numGrapplers = Math.max(0, Math.round(p('adaptiveNutNumGrapplers')))
    const ballJointClearance = p('adaptiveNutGrapplerBallJointClearance')
    const ballJointRadius = p('adaptiveNutGrapplerBallJointRadius')
    const cylinderRadius = p('adaptiveNutGrapplerCylinderRadius')
    const scaleFactor = new THREE.Vector3(p('launchSystemRightwardScaleFactor'), p('launchSystemForwardScaleFactor'), p('launchSystemUpwardScaleFactor'))

    // Shared by every pooled nut (y-axis is forward, z-axis is up).
    const bodyGeometry = new THREE.BoxGeometry(width, bodyLength, height, 1, 1, 1)
    bodyGeometry.translate(0, bodyLength/2 - forwardsOffset, 0)
    bodyGeometry.userData.shared = true
    const bodyMaterial = new THREE.MeshPhongMaterial({color: 0x7f6f7f})
    const hardwareMaterial = new THREE.MeshPhongMaterial({color: 0x7f3f00})
    // Pad colour comes from per-instance colours (engaged green / disengaged red).
    const padMaterial = new THREE.MeshPhongMaterial({color: 0xffffff})

    const postLength = .02 + ballJointClearance + ballJointRadius*5 // +2 cm so there is no gap between pad and post
    // ToDo: compute the strut length properly (the 1.25 factor makes it a little longer than the gap).
    const strutLength = (p('launcherMassDriverScrewSidewaysOffset') + p('launcherMassDriverScrewThreadRadius') * 1.25 - width / 2) / 2
    const hardwareGeometries = {
      pivot: new THREE.SphereGeometry(ballJointRadius, 16, 8),
      post: new THREE.CylinderGeometry(ballJointRadius/2, ballJointRadius/2, postLength, 16, 1).translate(0, postLength/2, 0),
      strut: new THREE.CylinderGeometry(cylinderRadius/2, cylinderRadius/2, strutLength, 16, 1).translate(0, strutLength/2, 0),
      cylinder: new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, strutLength, 16, 1).translate(0, strutLength/2, 0),
    }
    for (const g of Object.values(hardwareGeometries)) g.userData.shared = true // used by every pooled nut
    // Each part fades by its thickness: the ball joints like a dot, the rest like a line.
    const hardwareFade = {
      pivot: { size: 2 * ballJointRadius, exponent: 2 },
      post: { size: ballJointRadius, exponent: 1 },
      strut: { size: cylinderRadius, exponent: 1 },
      cylinder: { size: 2 * cylinderRadius, exponent: 1 },
    }
    const hardwareMaterials = Object.fromEntries(HARDWARE_PARTS.map(part =>
      [part, withSubPixelFade(hardwareMaterial.clone(), hardwareFade[part])]))
    // The nut's on-screen width (px) at which a part of this size has faded out.
    const fadedOutAt = ({ size, exponent }) => (size > 0)
      ? width / size * SubPixelFade.minimumPixels(1.5, exponent === 1 ? FADED_OUT_LINE_OPACITY : FADED_OUT_OPACITY, exponent)
      : Infinity
    const hardwareMinPixels = Math.min(...HARDWARE_PARTS.map(part => fadedOutAt(hardwareFade[part])))

    // Pad geometry for each grappler where the thread begins (regenerated per speed while running), with
    // the screw's thread layout: the starts it has there (the starts parameter may be 0, for its default)
    // and where the thread starts (before that the screw is a plain shaft, with no pitch to shape a pad to).
    const templatePads = []
    {
      const layout = tram.screwThreadLayout(dParamWithUnits)
      const templateDistance = Number.isFinite(layout.threadStartDistance) ? Math.max(0, layout.threadStartDistance) : 0
      const info = makeGrapplerPlacementInfo(dParamWithUnits, layout, templateDistance, grapplerLength, numGrapplers, 0)
      const firstGrapplerDistance = (bodyLength-grapplerLength) / 2
      for (let i = 0; i < numGrapplers; i++) {
        const distance = firstGrapplerDistance + i * grapplerLength / numGrapplers
        info.generatePlacementInfo(distance, 1)
        templatePads.push(makeGrapplerGeometry(dParamWithUnits, layout, templateDistance, grapplerLength, numGrapplers, info.threadStarts, distance, info.offset))
      }
    }
    // A pad is a plate: it fades like a square of the same area as its two larger extents.
    let padSize = 0
    if (templatePads.length) {
      templatePads[0].computeBoundingBox()
      const extents = templatePads[0].boundingBox.getSize(new THREE.Vector3()).toArray().sort((a, b) => b - a)
      padSize = Math.sqrt(extents[0] * extents[1])
    }
    const padFadedMaterial = withSubPixelFade(padMaterial, { size: padSize })
    const padsMinPixels = fadedOutAt({ size: padSize, exponent: 2 })

    let loadedBody = null
    const buildModel = () => {
      const nut = new THREE.Group()
      nut.name = 'adaptiveNut'
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.name = 'adaptiveNut_body'
      body.castShadow = true
      nut.add(body)
      if (loadedBody) nut.add(loadedBody.clone())

      // Pads: geometry i is grappler i, geometry numGrapplers + i its mirror image.
      const pads = new InstancedParts(padFadedMaterial, { colors: true })
      pads.name = 'adaptiveNut_grappler'
      pads.castShadow = true
      pads.padGeometryIds = []
      for (let i = 0; i < numGrapplers; i++) pads.padGeometryIds[i] = pads.addGeometry(templatePads[i].clone())
      for (let i = 0; i < numGrapplers; i++) pads.padGeometryIds[numGrapplers + i] = pads.addGeometry(mirrorGeometryX(templatePads[i]))
      pads.slants = templatePads.map(padSlant)
      pads.instanceIds = []
      for (let i = 0; i < numGrapplers; i++) {
        for (let row = 0; row < GRAPPLER_ROWS.length; row++) {
          for (let s = 0; s < SIDES.length; s++) {
            // The right-hand pads (side +1) are the mirrored ones.
            const geometryId = pads.padGeometryIds[(SIDES[s] > 0 ? numGrapplers : 0) + i]
            pads.instanceIds.push(pads.addInstance(geometryId))
          }
        }
      }
      pads.finish()

      const hardware = new InstancedParts(hardwareMaterial)
      hardware.name = 'adaptiveNut_hardware'
      hardware.castShadow = true
      const partIds = Object.fromEntries(HARDWARE_PARTS.map(part => [part, hardware.addGeometry(hardwareGeometries[part], hardwareMaterials[part])]))
      hardware.instanceIds = []
      for (let k = 0; k < numGrapplers * GRAPPLER_ROWS.length * SIDES.length * INNER_MIDDLE_OUTER.length; k++) {
        for (const part of HARDWARE_PARTS) hardware.instanceIds.push(hardware.addInstance(partIds[part]))
      }
      hardware.finish()

      // Pixel-size LODs measured on the nut's width; extent covers the nut's length.
      const padsLod = new PixelLOD(width, { extent: bodyLength })
      padsLod.name = 'adaptiveNut_padsLod'
      padsLod.addLevel(padsMinPixels, pads)
      const hardwareLod = new PixelLOD(width, { extent: bodyLength })
      hardwareLod.name = 'adaptiveNut_hardwareLod'
      hardwareLod.addLevel(hardwareMinPixels, hardware)
      nut.add(padsLod, hardwareLod)
      nut.grappler = { pads, hardware, padsLod, hardwareLod, numGrapplers, key: null }

      nut.scale.copy(scaleFactor)
      nut.visible = false
      return nut
    }

    virtualAdaptiveNut.createPooledModel = buildModel
    const count = Math.max(1, p('adaptiveNutNumModels')) // at least one model: the pool's template
    for (let i = 0; i < count; i++) unallocatedModelsList.push(buildModel())

    // Higher-detail body from a model file, added to every nut (pooled or in the scene) once loaded.
    new OBJLoader().load('models/AdaptiveNut.obj', (object) => {
      object.children[0].scale.set(0.6, 1, 1.5)  // the source model is too wide and thin
      object.children[0].position.set(0, 0, 0)
      object.scale.set(0.001, 0.001*1.62, 0.001)  // mm -> m
      object.name = 'adaptiveNut_bodyFromModel'
      object.traverse(child => { if (child.isMesh) child.castShadow = true })
      object.children[0].material.color.setHex(0x2f1f50)
      loadedBody = object
      const nuts = new Set(unallocatedModelsList)
      myScene.traverse(child => { if (child.name === 'adaptiveNut' && child.grappler) nuts.add(child) })
      nuts.forEach(nut => nut.add(object.clone()))
    }, undefined, () => console.log('Error loading adaptive nut model'))
  }
}

function makeGrapplerPlacementInfo(dParamWithUnits, layout, distanceToSledAft, grapplerLength, numGrapplers, additionalRotation) {
  const p = (name) => dParamWithUnits[name].value
  return new SledGrapplerPlacementInfo(
    p('launcherMassDriverScrewShaftOuterRadius'), p('launcherMassDriverScrewThreadRadius'), p('launcherMassDriverScrewThreadThickness'),
    layout.startsAt, p('launcherMassDriverScrewRevolutionsPerSecond'), p('launcherMassDriverForwardAcceleration'),
    p('launcherMassDriver1InitialVelocity'), p('adaptiveNutBodyLength') / 2, distanceToSledAft, grapplerLength, numGrapplers,
    p('adaptiveNutGrapplerMagnetThickness'), p('adaptiveNutBetweenGrapplerFactor'), p('adaptiveNutShaftToGrapplerPad'), additionalRotation,
    p('adaptiveNutGrapplerMaxRangeOfMotion'), p('adaptiveNutGrapplerTopDeadCenterRotation'), virtualAdaptiveNut.minMaxArray, layout.threadStartDistance)
}

function makeGrapplerGeometry(dParamWithUnits, layout, distanceToSledAft, grapplerLength, numGrapplers, threadStarts, grapplerDistance, offset) {
  const p = (name) => dParamWithUnits[name].value
  return new SledGrapplerGeometry(
    p('launcherMassDriverScrewShaftOuterRadius'), p('launcherMassDriverScrewThreadRadius'), p('launcherMassDriverScrewThreadThickness'),
    threadStarts, p('launcherMassDriverScrewRevolutionsPerSecond'), p('launcherMassDriverForwardAcceleration'),
    p('launcherMassDriver1InitialVelocity'), p('adaptiveNutBodyLength') / 2, distanceToSledAft, grapplerLength, numGrapplers,
    p('adaptiveNutGrapplerMagnetThickness'), p('adaptiveNutBetweenGrapplerFactor'), p('adaptiveNutShaftToGrapplerPad'), 0, grapplerDistance, offset,
    layout.threadStartDistance)
}

// Grappler pad geometry is regenerated when the nut's speed has changed by this fraction since the
// geometry was built (the pads follow the thread pitch, which is proportional to speed).
const GRAPPLER_REGEN_RELATIVE_SPEED_STEP = 0.01

export class virtualAdaptiveNut extends MovingVirtualObject {

  static unallocatedModels = []
  static activeObjects = new Map()
  static className = 'virtualAdaptiveNuts'
  static modelsAreRecyleable = true
  static highlightClass = 'massDriver'
  static isDynamic = true
  static minMaxArray = [0, 0]

  static signatureOf(dParamWithUnits) {
    return parameterSignature(dParamWithUnits,
      ['adaptiveNut', 'launcherMassDriverScrew', 'launchSystem', 'launcherMassDriverForwardAcceleration', 'launcherMassDriver1InitialVelocity'],
      ['Offset', 'CameraRange', 'RoughLength', 'NumBrackets', 'Bracket', 'Material', 'Density', 'Cost'])
  }

  static isTeardownRequired(dParamWithUnits) {
    const newNumObjects = dParamWithUnits['showAdaptiveNuts'].value ? dParamWithUnits['numVirtualAdaptiveNuts'].value : 0
    return newNumObjects!==virtualAdaptiveNut.numObjects
  }

  static update(dParamWithUnits, launcherMassDriverLength) {
    const v = virtualAdaptiveNut
    const p = (name) => dParamWithUnits[name].value
    v.numObjects = p('showAdaptiveNuts') ? p('numVirtualAdaptiveNuts') : 0
    v.tInc = p('launchVehicleSpacingInSeconds')
    v.launcherMassDriverLength = launcherMassDriverLength
    v.adaptiveNutBodyLength = p('adaptiveNutBodyLength')
    v.adaptiveNutGrapplerLength = p('adaptiveNutGrapplerLength')
    v.sidewaysOffset = p('adaptiveNutSidewaysOffset')
    v.upwardsOffset = p('adaptiveNutUpwardsOffset')
    v.forwardsOffset = p('adaptiveNutForwardsOffset')
    v.forwardScaleFactor = p('launchSystemForwardScaleFactor')
    v.upwardScaleFactor = p('launchSystemUpwardScaleFactor')
    v.rightwardScaleFactor = p('launchSystemRightwardScaleFactor')
    v.isVisible = p('showAdaptiveNuts')
    v.slowDownPassageOfTime = p('launcherSlowDownPassageOfTime')
    v.launcherStartDelayInSeconds = p('launcherStartDelayInSeconds')
    v.adaptiveNutNumGrapplers = Math.max(0, Math.round(p('adaptiveNutNumGrapplers')))
    v.magnetThickness = p('adaptiveNutGrapplerMagnetThickness')
    v.betweenGrapplerFactor = p('adaptiveNutBetweenGrapplerFactor')
    v.shaftToGrapplerPad = p('adaptiveNutShaftToGrapplerPad')
    v.ballJointClearance = p('adaptiveNutGrapplerBallJointClearance')
    v.ballJointRadius = p('adaptiveNutGrapplerBallJointRadius')
    v.launcherMassDriverForwardAcceleration = p('launcherMassDriverForwardAcceleration')
    v.launcherMassDriver1InitialVelocity = p('launcherMassDriver1InitialVelocity')
    v.initialDistance = p('adaptiveNutBodyLength') / 2
    v.adaptiveNutGrapplerRangeFactor = p('adaptiveNutGrapplerRangeFactor')

    // Because the nut inferfaces with the screw, we need to obtains some screw parameters as well...
    v.screwRevolutionsPerSecond = p('launcherMassDriverScrewRevolutionsPerSecond')
    v.launcherMassDriverScrewShaftOuterRadius = p('launcherMassDriverScrewShaftOuterRadius')
    v.launcherMassDriverScrewShaftInnerRadius = p('launcherMassDriverScrewShaftInnerRadius')
    v.intraAnchorUpwardsSeparation = p('adaptiveNutIntraAnchorUpwardsSeparation')
    v.interAnchorUpwardsSeparation = p('adaptiveNutInterAnchorUpwardsSeparation')
    v.launcherMassDriverScrewThreadRadius = p('launcherMassDriverScrewThreadRadius')
    v.launcherMassDriverScrewThreadThickness = p('launcherMassDriverScrewThreadThickness')
    v.launcherMassDriverScrewThreadStarts = p('launcherMassDriverScrewThreadStarts')
    v.launcherMassDriverScrewSidewaysOffset = p('launcherMassDriverScrewSidewaysOffset')
    v.launcherMassDriverScrewUpwardsOffset = p('launcherMassDriverScrewUpwardsOffset')
    v.padLiftActuation = p('adaptiveNutGrapplerPadLiftAwayDistance')
    v.switchoverTime = p('adaptiveNutGrapplerSwitchoverTime')
    // Which algorithm sequences the grapplers (see grapplerPlacement.js), and the 'original' algorithm's
    // switchover portions.
    v.sequencingMode = p('adaptiveNutGrapplerSequencingMode')
    v.padLiftPortion = p('adaptiveNutGrapplerPadLiftAwayPortion')
    v.padTwistPortion = p('adaptiveNutGrapplerPadTwistPortion')
    const r1 = v.launcherMassDriverScrewThreadRadius
    const r2 = v.launcherMassDriverScrewShaftOuterRadius
    v.padRadialActuation = (r1 - r2) * (1 + p('adaptiveNutGrapplerClearanceFactor'))
    v.adaptiveNutWidth = p('adaptiveNutWidth')
    v.adaptiveNutGrapplerMaxRangeOfMotion = p('adaptiveNutGrapplerMaxRangeOfMotion')
    v.adaptiveNutGrapplerTopDeadCenterRotation = p('adaptiveNutGrapplerTopDeadCenterRotation')
    v.minMaxArray = [0, 0]

    v.isDynamic = true
    v.hasChanged = true
    v.plans = new Map()   // launch turn -> GrapplerLatticePlan (made when first needed)
  }

  // Which flight each grappler grips, and how it moves between them (grapplerLattice.js), for a nut
  // launched when the screw's turn is launchTurn (rotations): the same for every such launch.
  static gripPlan(launchTurn) {
    const v = virtualAdaptiveNut
    const key = launchTurn.toFixed(6)
    if (v.plans.has(key)) return v.plans.get(key)
    const a = v.launcherMassDriverForwardAcceleration, v0 = v.launcherMassDriver1InitialVelocity
    const N = v.adaptiveNutNumGrapplers
    const first = (v.adaptiveNutBodyLength - v.adaptiveNutGrapplerLength) / 2, spacing = N > 0 ? v.adaptiveNutGrapplerLength / N : 0
    const distanceAt = (t) => v0 * t + a * t * t / 2
    const end = (a > 0) ? (-v0 + Math.sqrt(v0 * v0 + 2 * a * v.launcherMassDriverLength)) / a : v.launcherMassDriverLength / Math.max(1, v0)
    const sampleAt = (t) => {
      const distance = distanceAt(t)
      const info = new SledGrapplerPlacementInfo(
        v.launcherMassDriverScrewShaftOuterRadius, v.launcherMassDriverScrewThreadRadius, v.launcherMassDriverScrewThreadThickness,
        v.threadLayout.startsAt, v.screwRevolutionsPerSecond, a, v0, v.initialDistance, distance, v.adaptiveNutGrapplerLength, N,
        v.magnetThickness, v.betweenGrapplerFactor, v.shaftToGrapplerPad, (launchTurn + t * v.screwRevolutionsPerSecond) % 1,
        v.adaptiveNutGrapplerMaxRangeOfMotion, v.adaptiveNutGrapplerTopDeadCenterRotation, v.minMaxArray, v.threadLayout.threadStartDistance)
      info.nutSpeed = Math.sqrt(Math.max(1, v0 ** 2 + 2 * a * Math.max(0, distance)))
      const out = []
      for (let i = 0; i < N; i++) {
        info.generatePlacementInfo(first + i * spacing, v.adaptiveNutGrapplerRangeFactor)
        info.alpha = followingAngle(info)
        out.push({ phase: effectivePhase(info), rate: info.rotationRate, n: info.threadStarts, engageable: info.engageable })
      }
      return out
    }
    const plan = new GrapplerLatticePlan(sampleAt, end, {
      holdLimit: v.adaptiveNutGrapplerMaxRangeOfMotion, switchoverTime: v.switchoverTime,
      // (A grappler cannot land on flights drifting past faster than this: cycles/s.)
      fastestDrift: 0.8 / v.switchoverTime,
    })
    v.plans.set(key, plan)
    return plan
  }

  // Distance from the start of mass driver 1 to the back of the nut, `deltaT` after launch.
  static distanceAlongScrews(path, frame) {
    let massDriver1StartDistance = 0
    for (const superCurve of path.superCurves) {
      if (superCurve.name === 'massDriver1Curve') break
      massDriver1StartDistance += superCurve.getLength()
    }
    return frame.res.relevantCurveStartDistance + frame.distance - massDriver1StartDistance
  }

  frameAt(refFrame, deltaT) {
    const v = virtualAdaptiveNut
    const f = curveFrameAtTime(refFrame.curve, deltaT, false)
    const forward = f.forward
    const upward = f.upward
    const rightward = new THREE.Vector3().crossVectors(forward, upward)
    const orientation = quaternionFromFrame(forward, upward, MODEL_FORWARD, MODEL_UPWARD)
    const position = f.point.clone()
    // The body geometry spans y in [-forwardsOffset, bodyLength - forwardsOffset] and is then offset by
    // (sideways, forwards, upwards) inside the scaled model, so its centre is at y = bodyLength/2.
    const centre = position.clone()
      .addScaledVector(rightward, v.sidewaysOffset * v.rightwardScaleFactor)
      .addScaledVector(upward, v.upwardsOffset * v.upwardScaleFactor)
      .addScaledVector(forward, v.adaptiveNutBodyLength / 2 * v.forwardScaleFactor)
    return { f, position, centre, forward, upward, rightward, orientation }
  }

  placeAndOrientModel(om, refFrame) {
    const v = virtualAdaptiveNut
    om.visible = v.isVisible
    if (!v.isVisible) return
    const adjustedTimeSinceStart = v.adjustedTime(refFrame.timeSinceStart)
    const deltaT = this.clampedDeltaT(refFrame)   // (negative while leaving the terminal)
    const frame = this.frameAt(refFrame, deltaT)
    const relevantCurve = frame.f.curve
    const distanceToSledAft = v.distanceAlongScrews(refFrame.curve, frame.f)

    om.position.copy(frame.position)
    om.quaternion.copy(frame.orientation)

    const acceleration = v.launcherMassDriverForwardAcceleration
    const initialVelocity = v.launcherMassDriver1InitialVelocity
    const initialDistance = v.initialDistance
    const adaptiveNutWidthDiv2 = v.adaptiveNutWidth / 2
    const screwRevolutionsPerSecond = v.screwRevolutionsPerSecond
    const threadRadius = v.launcherMassDriverScrewThreadRadius
    // Each grappler uses the number of starts of the screw segment it is over (see screwThreadLayout).
    const layout = v.threadLayout
    const threadThickness = v.launcherMassDriverScrewThreadThickness
    const shaftOuterRadius = v.launcherMassDriverScrewShaftOuterRadius
    const upwardsOffsetToAnchors = v.launcherMassDriverScrewUpwardsOffset // Anchors' upward position will track the screws'
    const intraAnchorUpwardsSeparation = v.intraAnchorUpwardsSeparation
    const interAnchorUpwardsSeparation = v.interAnchorUpwardsSeparation
    const numGrapplers = v.adaptiveNutNumGrapplers
    const ballJointClearance = v.ballJointClearance
    const ballJointRadius = v.ballJointRadius
    const grapplersSidewaysOffset = v.launcherMassDriverScrewSidewaysOffset
    const grapplerUpwardsOffset = v.launcherMassDriverScrewUpwardsOffset
    const padCenterToEdge = (threadRadius - (shaftOuterRadius + v.shaftToGrapplerPad))/2

    // The screws turn with the launcher's global (adjusted) clock (see MassDriverScrew.js), so the
    // grapplers must use the same time origin. (They used the time since this nut was launched, which
    // only lined up with the thread when rps * spacing * threadStarts was a whole number.)
    const additionalRotation = (adjustedTimeSinceStart * screwRevolutionsPerSecond) % 1

    const bodyLength = v.adaptiveNutBodyLength
    const grapplerLength = v.adaptiveNutGrapplerLength
    const firstGrapplerDistance = (bodyLength-grapplerLength) / 2
    const grapplerSpacing = (numGrapplers > 0) ? grapplerLength / numGrapplers : 0

    const makeInfo = (distance, rotation) => new SledGrapplerPlacementInfo(
      shaftOuterRadius, threadRadius, threadThickness, layout.startsAt, screwRevolutionsPerSecond,
      acceleration, initialVelocity, initialDistance, distance, grapplerLength, numGrapplers,
      v.magnetThickness, v.betweenGrapplerFactor, v.shaftToGrapplerPad, rotation,
      v.adaptiveNutGrapplerMaxRangeOfMotion, v.adaptiveNutGrapplerTopDeadCenterRotation, v.minMaxArray, layout.threadStartDistance)

    const g = om.grappler
    for (const child of om.children) {
      if ((child.name==='adaptiveNut_body') || (child.name==='adaptiveNut_bodyFromModel')) {
        child.position.set(v.sidewaysOffset, v.forwardsOffset, v.upwardsOffset)
        child.quaternion.identity()
      }
    }
    // Skip the grappler work when the LODs (from last frame's on-screen size) would not draw it, with
    // a 2x margin so parts are already posed when they appear. While recording, always pose them.
    const recording = PixelLOD.buildBudget === Infinity
    const padsWanted = recording || g.padsLod.onScreenPixels >= g.padsLod.pixelLevels[0].minPixels / 2
    const hardwareWanted = recording || g.hardwareLod.onScreenPixels >= g.hardwareLod.pixelLevels[0].minPixels / 2
    if (!padsWanted && !hardwareWanted) return
    const activeGrapplers = Math.min(numGrapplers, g.numGrapplers)

    // Engage the grapplers only if we're on the part of the curve path that has the twin-screws (not
    // while still leaving the terminal)
    const onScrews = !frame.f.egress && ((relevantCurve.name=='massDriver1Curve') || (relevantCurve.name=='massDriver2Curve'))
    const speed = Math.sqrt(Math.max(1, initialVelocity**2 + 2 * acceleration * Math.max(0, distanceToSledAft)))
    const info = makeInfo(distanceToSledAft, additionalRotation)
    info.nutSpeed = speed
    const plan = onScrews && v.sequencingMode === grapplerSequencingModes.Scheduled
      ? v.gripPlan((((this.timeLaunched * screwRevolutionsPerSecond) % 1) + 1) % 1)
      : null
    const grapplerOffset = []
    const grapplerPoses = []
    const grapplerThreadPitch = []
    const grapplerThreadStarts = []
    for (let i = 0, grapplerDistance = firstGrapplerDistance; i<numGrapplers; i++, grapplerDistance += grapplerSpacing) {
      info.generatePlacementInfo(grapplerDistance, v.adaptiveNutGrapplerRangeFactor)
      // Which flight it grips, or where it is in a hop between them (grapplerPlacement.js selects the
      // sequencing algorithm); off the screws, parked.
      info.alpha = followingAngle(info)
      grapplerPoses[i] = onScrews
        ? grapplerPose(v.sequencingMode, { info, i, deltaT, plan, switchoverTime: v.switchoverTime, padLiftPortion: v.padLiftPortion, padTwistPortion: v.padTwistPortion }, {})
        : { lift: 1, raise: 1, neutral: 1, alpha: 0, attached: false }
      grapplerOffset[i] = info.offset
      grapplerThreadPitch[i] = info.threadPitch
      grapplerThreadStarts[i] = info.threadStarts
    }


    // Regenerate the pad geometry deterministically: the key depends only on the nut's speed (a pure
    // function of time), and the geometry is built for the key's speed with zero phase (the phase is
    // applied by the per-frame rotations below).
    const regenKey = Math.floor(Math.log(speed) / GRAPPLER_REGEN_RELATIVE_SPEED_STEP) + ':' + grapplerThreadStarts.join(',')
    if (padsWanted && g.key !== regenKey) {
      const keySpeed = Math.exp(Math.floor(Math.log(speed) / GRAPPLER_REGEN_RELATIVE_SPEED_STEP) * GRAPPLER_REGEN_RELATIVE_SPEED_STEP)
      const keyDistance = (Math.abs(acceleration) > 1e-9) ? Math.max(0, (keySpeed**2 - initialVelocity**2) / (2 * acceleration)) : distanceToSledAft
      const geometryInfo = makeInfo(keyDistance, 0)
      for (let i = 0, grapplerDistance = firstGrapplerDistance; i<activeGrapplers; i++, grapplerDistance += grapplerSpacing) {
        geometryInfo.generatePlacementInfo(grapplerDistance, v.adaptiveNutGrapplerRangeFactor)
        const geometry = new SledGrapplerGeometry(
          shaftOuterRadius, threadRadius, threadThickness, grapplerThreadStarts[i], screwRevolutionsPerSecond,
          acceleration, initialVelocity, initialDistance, keyDistance, grapplerLength, numGrapplers,
          v.magnetThickness, v.betweenGrapplerFactor, v.shaftToGrapplerPad, 0, grapplerDistance, geometryInfo.offset, layout.threadStartDistance)
        const mirrored = mirrorGeometryX(geometry)
        // setGeometryAt takes its own copy.
        g.pads.setGeometryAt(g.pads.padGeometryIds[i], geometry)
        g.pads.slants[i] = padSlant(geometry)
        g.pads.setGeometryAt(g.pads.padGeometryIds[g.numGrapplers + i], mirrored)
        geometry.dispose()
        mirrored.dispose()
      }
      g.key = regenKey
    }

    // Model axes: x = rightward, y = forward, z = upward
    let padInstance = 0
    let hardwareInstance = 0
    for (let grapplerIndex = 0; grapplerIndex < g.numGrapplers; grapplerIndex++) {
      const active = grapplerIndex < activeGrapplers
      let offset, pose, threadPitch
      let padLiftActuation, padRadialActuation, padTwistActuation, padLiftActuationThetaComponent, padLiftActuationYComponent
      if (active) {
        offset = grapplerOffset[grapplerIndex]
        pose = grapplerPoses[grapplerIndex]
        threadPitch = grapplerThreadPitch[grapplerIndex]
        // The hop from flight to flight (grapplerSwitchover.js): lift off the face, raise clear of the
        // flights, untwist, move round, twist to the new flight, lower, attach.
        padLiftActuation = pose.lift * v.padLiftActuation
        padRadialActuation = pose.raise * v.padRadialActuation
        // (Untwisted: turned back by its shape's slant, so that it lines up with its actuators.)
        padTwistActuation = -pose.neutral * g.pads.slants[grapplerIndex]
        const grapplerScrewAngle = Math.atan(threadPitch)
        padLiftActuationThetaComponent = padLiftActuation * Math.sin(grapplerScrewAngle)
        padLiftActuationYComponent = padLiftActuation * Math.cos(grapplerScrewAngle)
      }
      for (const midwayRotation of GRAPPLER_ROWS) {
        const topBottomOffset = (midwayRotation === 0.5) ? -1 : 1
        let rOffset, rOffsetPlus, yOffset, thetaOffset, sinThetaOffset, cosThetaOffset, midTheta
        if (active) {
          rOffset = offset.r + padRadialActuation
          midTheta = 2*Math.PI * midwayRotation
          thetaOffset = pose.alpha + padLiftActuationThetaComponent
          sinThetaOffset = Math.sin(thetaOffset + midTheta)
          cosThetaOffset = Math.cos(thetaOffset + midTheta)
          rOffsetPlus = rOffset + padCenterToEdge + ballJointClearance + ballJointRadius * 3
          yOffset = offset.y - padLiftActuationYComponent
        }
        // Point on the grappler at radius r from the screw axis, on the given side
        const padPoint = (target, leftRightSign, r) => target.set(
          leftRightSign*(grapplersSidewaysOffset + r * sinThetaOffset),
          yOffset,
          grapplerUpwardsOffset + r * cosThetaOffset)
        const anchorPoint = (target, leftRightSign, innerMiddleOuterSign2) => target.set(
          leftRightSign*adaptiveNutWidthDiv2,
          offset.y,
          upwardsOffsetToAnchors + topBottomOffset*intraAnchorUpwardsSeparation + topBottomOffset*innerMiddleOuterSign2*interAnchorUpwardsSeparation)

        for (const leftRightSign of SIDES) {
          // Pad
          const padId = g.pads.instanceIds[padInstance++]
          g.pads.setVisibleAt(padId, active)
          if (active && padsWanted) {
            _object.position.copy(padPoint(_p0, leftRightSign, rOffset))
            _object.quaternion.identity()
            _object.rotateY(leftRightSign*thetaOffset + midTheta)
            _object.rotateZ(-leftRightSign*padTwistActuation)
            _object.updateMatrix()
            g.pads.setMatrixAt(padId, _object.matrix)
            g.pads.setColorAt(padId, pose.attached ? _disengagedColor : _engagedColor)
          }
          // Ball joints, posts, piston rods and cylinders
          for (let io = 0; io < INNER_MIDDLE_OUTER.length; io++) {
            const { sign1, sign2 } = INNER_MIDDLE_OUTER[io]
            const ids = g.hardware.instanceIds
            const pivotId = ids[hardwareInstance++], postId = ids[hardwareInstance++], strutId = ids[hardwareInstance++], cylinderId = ids[hardwareInstance++]
            g.hardware.setVisibleAt(pivotId, active)
            g.hardware.setVisibleAt(postId, active && io === 0) // the post is the same for all three joints
            g.hardware.setVisibleAt(strutId, active)
            g.hardware.setVisibleAt(cylinderId, active)
            if (!active || !hardwareWanted) continue
            const jointRadius = rOffsetPlus + sign1*ballJointRadius
            g.hardware.setMatrixAt(pivotId, _matrix.makeTranslation(padPoint(_p0, leftRightSign, jointRadius)))
            if (io === 0) {
              padPoint(_p0, leftRightSign, rOffset + padCenterToEdge)
              padPoint(_p1, leftRightSign, rOffset + padCenterToEdge + ballJointClearance + ballJointRadius * 5)
              g.hardware.setMatrixAt(postId, pointAlongMatrix(_p0, _p1))
            }
            padPoint(_p0, leftRightSign, jointRadius)
            anchorPoint(_p1, leftRightSign, sign2)
            g.hardware.setMatrixAt(strutId, pointAlongMatrix(_p0, _p1))      // piston rod: joint -> anchor
            g.hardware.setMatrixAt(cylinderId, pointAlongMatrix(_p1, _p0))   // piston cylinder: anchor -> joint
          }
        }
      }
    }
  }
}

// Matrix that places a +y-pointing part at `from`, aimed at `to`.
function pointAlongMatrix(from, to) {
  _dir.copy(to).sub(from).normalize()
  _quaternion.setFromUnitVectors(_up, _dir)
  return _matrix.compose(from, _quaternion, _unitScale)
}

const _object = new THREE.Object3D()
const _matrix = new THREE.Matrix4()
const _quaternion = new THREE.Quaternion()
const _unitScale = new THREE.Vector3(1, 1, 1)
const _engagedColor = new THREE.Color(0x00ff00)
const _disengagedColor = new THREE.Color(0xff0000)

const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
