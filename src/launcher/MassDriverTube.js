import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CatmullRomSuperCurve3 } from '../curves/SuperCurves.js'
import { VirtualObject } from './VirtualObject.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { SubPixelFade, withSubPixelFade } from '../scene/SubPixelFade.js'
import { MooringCables } from './MooringCables.js'
import { ecefToGeodetic } from '../physics/geodesy.js'
import { windAt } from '../scene/seaPlacement.js'
import { addTubeCoordinates, withTubeWallLook } from './tubeWallLook.js'

// Lift fans per instanced chunk (each chunk picks its own level of detail).
const LIFT_FAN_CHUNK = 32

// The lift fans lean into the wind (their thrust then has a component against it, holding the tube
// against the wind's drag): their axes tilt upwind from vertical by this much per m/s of wind, at most
// LIFT_FAN_MAX_TILT.
const LIFT_FAN_TILT_PER_WIND_SPEED = 1 * Math.PI / 180   // radians per m/s
const LIFT_FAN_MAX_TILT = 20 * Math.PI / 180

// On-screen tube diameter (px) below which a tube segment is drawn as a line.
const TUBE_LINE_BELOW_PIXELS = 1

// The lift fans' disks are drawn as the blur of a propeller spinning too fast for its blades to be
// seen. At each point of the disk the opacity is the fraction of the time a blade is in the line of
// sight. A blade is a strip pitched at angle phi to the disk, so seen face-on it covers its chord
// times cos(phi); seen obliquely its chord foreshortens on one side of the disk (down to the blade's
// thickness, where it is seen edge-on) and lengthens on the other. Radii are fractions of the disk's.
const PROPELLER = {
  blades: 4,
  pitchOverDiameter: 0.5,   // the distance a turn of the blades would screw through still air
  rootChord: 0.22,          // blade chord at the root (at PROPELLER_RINGS[0]), as a fraction of the radius
  tipChord: 0.12,           // ... and at the tip
  thickness: 0.12,          // blade thickness / chord
  tipRounding: 0.05,        // the blade tips are rounded off over this outermost part of the radius
}
// Radii (fractions of the disk's) of the disk geometry's rings. The opacity is worked out at each
// vertex and interpolated across the disk, so the rings are closest where it changes fastest (the
// root). The innermost is inside the hub, where the disk passes through it.
const PROPELLER_RINGS = [0.045, 0.15, 0.4, 0.95, 1]

// A flat disk of `radius` facing +z with `segments` round it, its rings at PROPELLER_RINGS.
function propellerDiskGeometry(radius, segments) {
  const geometry = new THREE.RingGeometry(PROPELLER_RINGS[0] * radius, radius, segments, PROPELLER_RINGS.length - 1)
  // RingGeometry spaces its rings evenly (ring j is vertices j*(segments+1) ...); move them.
  const position = geometry.attributes.position
  for (let k = 0; k < position.count; k++) {
    const r = PROPELLER_RINGS[Math.floor(k / (segments + 1))] * radius
    const length = Math.hypot(position.getX(k), position.getY(k))
    position.setXY(k, position.getX(k) * r / length, position.getY(k) * r / length)
  }
  geometry.deleteAttribute('uv')
  return geometry
}

// Makes `material` draw a propellerDiskGeometry of `radius` as a spinning propeller's blur (see
// PROPELLER). The opacity is worked out per vertex, so it costs no more per pixel than a plain disk.
// The propellers spin anticlockwise about +z (their thrust); an instance whose matrix is a mirror
// image spins the other way (and its blades are mirrored too, as on a counter-rotating propeller).
function withPropellerBlur(material, radius) {
  const f = (x) => x.toFixed(6)
  const previousOnBeforeCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile.call(material, shader, renderer)
    shader.uniforms.propellerRadius = { value: radius }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float propellerRadius;
varying float vPropellerCoverage;`)
      // A mirrored instance's triangles wind the other way, so on a double-sided material it would be
      // lit from behind; flipping its normal undoes that.
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
  objectNormal *= sign(determinant(mat3(instanceMatrix)));
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
#ifdef USE_INSTANCING
  mat3 propellerToView = mat3(modelViewMatrix) * mat3(instanceMatrix);
#else
  mat3 propellerToView = mat3(modelViewMatrix);
#endif
  vec3 view = normalize(mvPosition.xyz);
  float x = length(transformed.xy) / propellerRadius;
  // The view direction along the axis and along the blade's motion here.
  float va = dot(view, normalize(propellerToView * vec3(0.0, 0.0, 1.0)));
  float vt = dot(view, normalize(propellerToView * vec3(-transformed.y, transformed.x, 0.0)));
  va = va >= 0.0 ? max(va, 1e-4) : min(va, -1e-4);
  float q = vt / va;
  float tanPitch = ${f(PROPELLER.pitchOverDiameter)} / (PI * x);
  float cosPitch = inversesqrt(1.0 + tanPitch * tanPitch);
  float sinPitch = tanPitch * cosPitch;
  float chord = mix(${f(PROPELLER.rootChord)}, ${f(PROPELLER.tipChord)}, (x - ${f(PROPELLER_RINGS[0])}) / ${f(1 - PROPELLER_RINGS[0])});
  // Seen along the view direction, the blades' chords and thicknesses projected onto the disk, as a
  // fraction of the circumference here.
  float projected = abs(cosPitch - sinPitch * q) + ${f(PROPELLER.thickness)} * abs(sinPitch + cosPitch * q);
  vPropellerCoverage = min(1.0, ${f(PROPELLER.blades)} * chord / (2.0 * PI * x) * projected)
    * clamp((1.0 - x) / ${f(PROPELLER.tipRounding)}, 0.0, 1.0);
}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vPropellerCoverage;`)
      .replace('#include <alphatest_fragment>', `diffuseColor.a *= vPropellerCoverage;
#include <alphatest_fragment>`)
  }
  material.customProgramCacheKey = () => `${previousCacheKey.call(material)}:propellerBlur`
  material.opacity = 1
  // A flat disk has one face, so it must be drawn from behind too.
  material.side = THREE.DoubleSide
  // Most of the disk is nearly clear: it must not hide what is drawn after it (the sky, the haze).
  material.depthWrite = false
  return material
}

export class massDriverTubeModel {
  // Each model along the mass driver curve is unique, since the pitch of the mass driver's drive thread changes along it's length
  // so instead of dynamically allocating models from a pool of identical unallocated models, we need to create a unique model for each portion of the mass driver curve.
  // We can't dynamically reallocate these models, since each model always has to be placed in the location that it was designed for.
  // However, we can still hide and models, and also not update them, when they are too far from the camera to be visible.
  constructor(dParamWithUnits) {
    this.update(dParamWithUnits)
    // this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, color: 0x7fffff, transparent: true, depthWrite: false, opacity: 0.25})
    // this.massDriverTubeMaterial2 = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, color: 0x7f5050, transparent: true, depthWrite: false, opacity: 0.25})
    //this.massDriverTubeMaterial = new THREE.MeshPhongMaterial( {wireframe: true})
    this.tubeTexture = new THREE.TextureLoader().load('textures/TubeTexture.png')
    //this.tubeTexture = new THREE.TextureLoader().load('textures/TubeTexture2.png')
    this.tubeTexture.repeat.set(4, 1)
    this.tubeTexture.wrapS = THREE.MirroredRepeatWrapping
    this.tubeTexture.wrapT = THREE.MirroredRepeatWrapping
    //this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( {map: this.tubeTexture, side: THREE.FrontSide, transparent: true, opacity: 1, shininess: 0.5} )
    //this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( {side: THREE.FrontSide, color: 0x7fffff, transparent: true, opacity: 1, shininess: 0.5} )
    
    // The wall: clear, with a faint surface (see tubeWallLook.js).
    this.massDriverTubeMaterial1 = withTubeWallLook(new THREE.MeshPhongMaterial( { side: THREE.DoubleSide, transparent: true, opacity: 0.15, shininess: 0.5} ))
    //this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( { side: THREE.DoubleSide, shininess: 0.5} )

    this.massDriverTubeMaterial2 = new THREE.MeshPhongMaterial( { side: THREE.DoubleSide, transparent: true, opacity: 0.5, shininess: 0.5, color: 0x000000} )
    this.massDriverTubeMaterial3 = new THREE.MeshPhongMaterial( { side: THREE.FrontSide, shininess: 0.5} )
    this.massDriverTubeMaterial4 = new THREE.MeshPhongMaterial( { side: THREE.FrontSide, transparent: true, opacity: 0.5, shininess: 0.5} )
    this.massDriverTubeMaterial5 = new THREE.LineBasicMaterial( { color: 0x4897f8, transparent: true, opacity: 0.5 })
    // The far-away line (see createModel's PixelLOD) is drawn over the sea surface. Under the sea
    // it fades out by the water in front of it (seaDarkening.js's vSeaFog), as the structure lines do,
    // rather than darkening: towards the horizon the water hides it, and a dark line would show over the
    // sky the sea reflects there.
    this.massDriverTubeMaterial5.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
#ifdef USE_FOG
  gl_FragColor.a *= 1.0 - vSeaFog;
#endif`)
    }
    this.massDriverTubeMaterial5.customProgramCacheKey = () => 'massDriverTubeLine'
    // this.massDriverTubeMaterial1 = new THREE.MeshPhongMaterial( { map: this.tubeTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.6, shininess: 0.5} )
    // this.massDriverTubeMaterial2 = new THREE.MeshPhongMaterial( { side: THREE.DoubleSide, color: 0x101015, transparent: true, opacity: 0.95, shininess: 0.5} )

    this.liftFanRoughSpacing = this.radius * 4 // This is the distance between lift fans along the elevated evacuated tube.
        
    this.liftFanHubGeometry = new THREE.SphereGeometry(this.radius * 0.1, 16, 16)
    this.liftFanHubGeometry.scale(1, 1, 3)
    // The fan disks are flat (the blur of a spinning propeller: see withPropellerBlur), facing +z
    // along the fan's axis, so they shade evenly.
    this.liftFanDiskGeometry = propellerDiskGeometry(this.radius * 1.5, 64)
    // Low-detail versions for fans a few pixels across (see createLiftFans).
    this.liftFanHubGeometryLow = new THREE.SphereGeometry(this.radius * 0.1, 6, 4)
    this.liftFanHubGeometryLow.scale(1, 1, 3)
    this.liftFanDiskGeometryLow = propellerDiskGeometry(this.radius * 1.5, 16)
    // this.liftFanCowlingGeometry = new THREE.TorusGeometry(this.radius*1.6, this.radius/32, 16, 64)
    // this.liftFanCowlingGeometry.scale(1, 1, 4)
    // this.liftFanGeometry = mergeGeometries([this.liftFanHubGeometry, this.liftFanCowlingGeometry])

    this.liftFanPylonGeometry = new THREE.CylinderGeometry(this.radius/16, this.radius/8, this.radius*2, 16)
    this.liftFanPylonGeometry.rotateZ(Math.PI/2)
    this.liftFanPylonGeometryLow = new THREE.CylinderGeometry(this.radius/16, this.radius/8, this.radius*2, 5, 1, true)
    this.liftFanPylonGeometryLow.rotateZ(Math.PI/2)
    // These geometries and materials are shared by every tube segment; releasing a segment must not dispose them.
    ;[this.liftFanHubGeometry, this.liftFanDiskGeometry, this.liftFanPylonGeometry,
      this.liftFanHubGeometryLow, this.liftFanDiskGeometryLow, this.liftFanPylonGeometryLow].forEach(g => { g.userData.shared = true })
    ;[this.massDriverTubeMaterial1, this.massDriverTubeMaterial2, this.massDriverTubeMaterial3, this.massDriverTubeMaterial4, this.massDriverTubeMaterial5].forEach(m => { m.userData.shared = true })

    this.exagerateNonElevatedTubeFactor = dParamWithUnits['exagerateNonElevatedTubeFactor'].value

  }

  update(dParamWithUnits) {
    this.massDriverTubeSegments = dParamWithUnits['numVirtualMassDriverTubes'].value
    this.radius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value
    this.showLiftFans = dParamWithUnits['showLiftFans'].value
    this.showMooringCables = dParamWithUnits['showMooringCables'].value
    this.mooringSpacing = dParamWithUnits['launcherMassDriverMooringSpacing'].value
    this.mooringCableRadius = dParamWithUnits['launcherMassDriverMooringCableRadius'].value
    this.mooringSpread = dParamWithUnits['launcherMassDriverMooringSpread'].value
    this.mooringCatenary = dParamWithUnits['launcherMassDriverMooringCatenary'].value
    this.mooringForkLevels = Math.max(0, Math.round(dParamWithUnits['launcherMassDriverMooringForkLevels'].value))
  }
  
  createModel(curve, segmentIndex) {

    let modelLengthSegments    // This model, which is a segment of the whole mass driver, is itself divided into this many lengthwise segments
    const modelRadialSegments = 32
    const tubePoints = []

    // Now we need a reference point in the middle of this segment of the whole mass driver
    const modelsCurvePosition = (segmentIndex + 0.5) / this.massDriverTubeSegments
    const refPoint = curve.getPointAt(modelsCurvePosition)

    // Figure out the length of this segment - this might not work well when the elevated evacuated tube is coiled...
    let tubeSegmentLength = 0
    let p0, p1
    p0 = curve.getPointAt((segmentIndex + 0) / this.massDriverTubeSegments)
    for (let i = 1; i<=20; i++) {
      p1 = curve.getPointAt((segmentIndex + i/20) / this.massDriverTubeSegments)
      tubeSegmentLength += p0.distanceTo(p1)
      p0 = p1
    }

    // We need to orient the model so that it is aligned with the curve at this point
    // Hack - make the part of the tube that's off in the distance larger to make it more visible.
    const res = curve.findRelevantCurveAt(modelsCurvePosition)
    let exagerateTubeFactor = 1
    let aboveGround = true
    if ((res.relevantCurve.name!='elevatedEvacuatedTube') && (res.relevantCurve.name!='coiledElevatedEvacuatedTube')) {
      // Not elevated evacuated tube
      exagerateTubeFactor = this.exagerateNonElevatedTubeFactor
      modelLengthSegments = 4
      aboveGround = false
    }
    else {
      exagerateTubeFactor = 1
      modelLengthSegments = 64
      aboveGround = true
    }
    // End Hack
    //modelLengthSegments = 4

    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"
    const orientation = curve.getQuaternionAt(modelsCurvePosition, modelForward, modelUpward).invert()

    // We need to define a curve for this segment of the mass driver, and then use that curve to create a tube geometry for this model
    for (let i = 0; i<=modelLengthSegments; i++) {
      const modelsCurvePosition = (segmentIndex + i/modelLengthSegments) / this.massDriverTubeSegments
      tubePoints.push(curve.getPointAt(modelsCurvePosition).sub(refPoint).applyQuaternion(orientation))
    }

    const massDriverSegmentCurve = new CatmullRomSuperCurve3(tubePoints)
    let massDriverTubeGeometry, massDriverTubeMaterial
    // const lodEnabled = false
    // if (!lodEnabled) {
      massDriverTubeGeometry = addTubeCoordinates(new THREE.TubeGeometry(massDriverSegmentCurve, modelLengthSegments, this.radius * exagerateTubeFactor, modelRadialSegments, false), tubeSegmentLength)
      massDriverTubeMaterial = this.massDriverTubeMaterial1
    // }
    // else {
    //   // LOD enabled - doesn't work - unreolved bug
    //   const linePoints = []
    //   for (let i = 0; i<modelLengthSegments; i++) {
    //     linePoints.push(massDriverSegmentCurve.getPointAt(i/modelLengthSegments))
    //   }
    //   console.log(linePoints)
    //   massDriverTubeGeometry = new THREE.BufferGeometry().setFromPoints(linePoints)
    //   massDriverTubeMaterial = this.massDriverTubeMaterial5
    // }
    // massDriverTubeGeometry.computeBoundingSphere() // No benefit seen
    //const massDriverTubeMesh = new THREE.Mesh(massDriverTubeGeometry, (segmentIndex%10==0) ? this.massDriverTubeMaterial1 : this.massDriverTubeMaterial2)
    // Hack for Olympus Mons clip
    //aboveGround = (segmentIndex<=126 || segmentIndex>250)
    // Hack for Hawaii clip
    //aboveGround = (segmentIndex<=211 || segmentIndex>228)  // That is, not in a tunnel
    //const tubeMesh = new THREE.Mesh(massDriverTubeGeometry, (!aboveGround) ? this.massDriverTubeMaterial1 : this.massDriverTubeMaterial2)
    const tubeMesh = new THREE.Mesh(massDriverTubeGeometry, massDriverTubeMaterial)
    tubeMesh.name = "massDriverTubeSegment"
    // Once the tube is under about a pixel across, draw it as a line along its centre instead, so the
    // track stays visible from far away (as a 1 px line) without exaggerating its size up close.
    const tubeLod = new PixelLOD(2 * this.radius * exagerateTubeFactor, { extent: tubeSegmentLength / 2 })
    tubeLod.name = 'massDriverTube'
    tubeLod.addLevel(TUBE_LINE_BELOW_PIXELS, tubeMesh)
    tubeLod.addLevel(0, () => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tubePoints), this.massDriverTubeMaterial5)
      line.name = 'massDriverTubeLine'
      return line
    })
    const massDriverTubeMesh = new THREE.Group().add(tubeLod)
    const liftFansPerSegment = Math.round(tubeSegmentLength / this.liftFanRoughSpacing)

    if (this.showLiftFans) {
      this.createLiftFans(massDriverTubeMesh, curve, segmentIndex, liftFansPerSegment, refPoint, orientation)
    }
    if (this.showMooringCables && this.ellipsoid) {
      this.createMooringCables(massDriverTubeMesh, curve, segmentIndex, refPoint, orientation, this.radius * exagerateTubeFactor, tubeSegmentLength)
    }

    massDriverTubeMesh.renderOrder = 999

    // Debug code
    // const blueMaterial = new THREE.MeshLambertMaterial({color: 0x4040df})
    // const massDriverTubeMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), blueMaterial)
    // massDriverTubeMesh.position.copy(refPoint)

    return massDriverTubeMesh
  }

  // Mooring cables for the part of this segment that is under the sea (the tube's centre below sea
  // level): a mooring every mooringSpacing metres along the whole tube, half a spacing in from its start
  // (so the spacing does not depend on segment boundaries), each an inverted V of cables from anchors on the sea floor, each leg forking
  // mooringForkLevels times on its way up to hold the bottom of the tube at 2^mooringForkLevels points
  // spread evenly over the spacing. See MooringCables.js.
  createMooringCables(segmentGroup, curve, segmentIndex, refPoint, orientation, tubeRadius, tubeSegmentLength) {
    const totalLength = curve.getLength()
    const start = segmentIndex / this.massDriverTubeSegments * totalLength
    const end = (segmentIndex + 1) / this.massDriverTubeSegments * totalLength
    const moorings = []
    // (Half a spacing in from the end of the tube, so that each holds the whole of its spacing.)
    for (let s = (Math.ceil(start / this.mooringSpacing - 0.5) + 0.5) * this.mooringSpacing; s < end; s += this.mooringSpacing) {
      const fraction = s / totalLength
      const point = curve.getPointAt(fraction)
      if (ecefToGeodetic(point.x, point.y, point.z, this.ellipsoid).alt >= 0) continue
      const upward = curve.getNormalAt(fraction)
      // Where the forks of its legs hold the tube: the bottom of the tube, evenly over the spacing.
      const count = 2 ** this.mooringForkLevels
      const attachments = []
      for (let k = 0; k < count; k++) {
        const at = Math.min(1, Math.max(0, (s + ((k + 0.5) / count - 0.5) * this.mooringSpacing) / totalLength))
        attachments.push(curve.getPointAt(at).addScaledVector(curve.getNormalAt(at), -tubeRadius))
      }
      moorings.push({ apex: point.addScaledVector(upward, -tubeRadius), side: curve.getBinormalAt(fraction), attachments })
    }
    if (moorings.length === 0) return
    const cables = new MooringCables({
      moorings,
      toLocal: (p, target) => target.copy(p).sub(refPoint).applyQuaternion(orientation),
      ellipsoid: this.ellipsoid,
      getSampler: () => this.sampleTerrainHeight,
      cableRadius: this.mooringCableRadius,
      spread: this.mooringSpread,
      shape: this.mooringCatenary,
      extent: tubeSegmentLength / 2,
    })
    segmentGroup.add(cables.root)
  }

  // Lift fans: every ~4 tube radii along the elevated tube there is a fan on each side (hub, disk and
  // pylon). There are tens of thousands along the tube, so they are drawn as instanced meshes in chunks
  // of LIFT_FAN_CHUNK fans, each chunk with a pixel-size LOD: full geometry when a fan is large on
  // screen, low-poly geometry when it is a few pixels across, and nothing when it is sub-pixel.
  // Each chunk's fans lean into the wind at its centre (seaPlacement.windAt: the wind at the weather
  // date), worked out when the chunk is built; resetLiftFans() rebuilds them when the weather changes.
  createLiftFans(segmentGroup, curve, segmentIndex, liftFansPerSegment, refPoint, orientation) {
    const parts = { pylon: [] }
    const fans = []      // per fan: { hubPos, fanPos (model coordinates), axis (planet coordinates) }
    const centres = []
    const dummy = new THREE.Object3D()
    // The matrix placing a part at `position` with its +z towards `lookTarget`, its +y as near `up` as that
    // allows (by default, the model's forward: the tube's direction at the middle of the segment).
    const matrixOf = (position, lookTarget, scale, up = THREE.Object3D.DEFAULT_UP) => {
      dummy.position.copy(position)
      dummy.scale.copy(scale)
      dummy.quaternion.identity()
      dummy.up.copy(up)
      dummy.lookAt(lookTarget)
      dummy.updateMatrix()
      return dummy.matrix.clone()
    }
    const unit = new THREE.Vector3(1, 1, 1)
    for (let i = 0; i<liftFansPerSegment; i++) {
      const modelsCurvePosition = (segmentIndex + (i+0.5)/liftFansPerSegment) / this.massDriverTubeSegments
      const res = curve.findRelevantCurveAt(modelsCurvePosition)
      if ((res.relevantCurve.name!='elevatedEvacuatedTube') && (res.relevantCurve.name!='coiledElevatedEvacuatedTube')) continue
      const point = curve.getPointAt(modelsCurvePosition)
      const tangent = curve.getTangentAt(modelsCurvePosition)
      const normal = curve.getNormalAt(modelsCurvePosition)
      const binormal = curve.getBinormalAt(modelsCurvePosition)
      for (let lr = -1; lr<=1; lr+=2) {
        const hubPos = point.clone().add(binormal.clone().multiplyScalar(lr*this.radius*3)).add(normal.clone().multiplyScalar(this.radius*.2))
        const fanPos = hubPos.clone().add(normal.clone().multiplyScalar(this.radius*.2))
        const pylonPos = point.clone().add(binormal.clone().multiplyScalar(lr*this.radius*2)).add(normal.clone().multiplyScalar(this.radius*.1))
        const relHubPos = hubPos.clone().sub(refPoint).applyQuaternion(orientation)
        const relFanPos = fanPos.clone().sub(refPoint).applyQuaternion(orientation)
        const relPylonPos = pylonPos.clone().sub(refPoint).applyQuaternion(orientation)
        const fanDirection = fanPos.clone().normalize()
        const pylonOrientation = fanDirection.clone().applyAxisAngle(tangent, -lr*Math.PI/32).applyQuaternion(orientation)
        fanDirection.applyAxisAngle(tangent, Math.PI/32) // Rotate the fan direction to be perpendicular to the tube
        fans.push({ hubPos: relHubPos, fanPos: relFanPos, axis: fanDirection, side: lr })
        // The arm reaches sideways from the tube to the hub: square to the tube where it is, which is not its
        // direction at the middle of the segment where the tube curves (round the coil, while it deploys).
        const localForward = tangent.clone().applyQuaternion(orientation)
        parts.pylon.push(matrixOf(relPylonPos, relPylonPos.clone().add(pylonOrientation), new THREE.Vector3(-lr, .25, 1), localForward))
        centres.push(relFanPos)
      }
    }
    // Where model coordinates are on the planet (for the wind at a chunk).
    const toPlanet = orientation.clone().invert()
    // The propellers on one side of the tube spin one way and those on the other side the other
    // way: one side's disks are mirror images (see withPropellerBlur).
    const diskScale = { [-1]: new THREE.Vector3(-1, 1, 1), [1]: new THREE.Vector3(1, 1, 1) }
    // The hubs and disks of fans start..end, leaning into the wind at `centre` (model coordinates).
    const leanIntoWind = (start, end, centre) => {
      const axes = fans.slice(start, end).map(fan => fan.axis.clone())
      if (this.ellipsoid) {
        const planetCentre = centre.clone().applyQuaternion(toPlanet).add(refPoint)
        const { lat, lon } = ecefToGeodetic(planetCentre.x, planetCentre.y, planetCentre.z, this.ellipsoid)
        const wind = windAt(lat, lon)
        const tilt = Math.min(LIFT_FAN_MAX_TILT, wind.speed * LIFT_FAN_TILT_PER_WIND_SPEED)
        if (tilt > 0) {
          // Upwind, in planet coordinates (x east of Greenwich, y north, z the Greenwich meridian).
          const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180
          const sp = Math.sin(phi), cp = Math.cos(phi), sl = Math.sin(lambda), cl = Math.cos(lambda)
          const up = new THREE.Vector3(cp * sl, sp, cp * cl)
          const upwind = new THREE.Vector3(cl, 0, -sl).multiplyScalar(-wind.east)
            .add(new THREE.Vector3(-sp * sl, cp, -sp * cl).multiplyScalar(-wind.north)).normalize()
          // Turning about up x upwind takes the top of each axis upwind.
          const turnAxis = new THREE.Vector3().crossVectors(up, upwind).normalize()
          for (const axis of axes) axis.applyAxisAngle(turnAxis, tilt)
        }
      }
      const hub = [], disk = []
      axes.forEach((axis, k) => {
        const { hubPos, fanPos, side } = fans[start + k]
        axis.applyQuaternion(orientation)
        hub.push(matrixOf(hubPos, hubPos.clone().add(axis), unit))
        disk.push(matrixOf(fanPos, fanPos.clone().add(axis), diskScale[side]))
      })
      return { hub, disk }
    }

    const fanDiameter = this.radius * 3
    // Fans fade in by on-screen size rather than popping in at the LOD threshold (see SubPixelFade).
    if (this.liftFanFadeDiameter !== fanDiameter) {
      this.liftFanFadeDiameter = fanDiameter
      this.liftFanOpaqueMaterial = withSubPixelFade(this.massDriverTubeMaterial3.clone(), { size: fanDiameter })
      this.liftFanDiskMaterial = withPropellerBlur(withSubPixelFade(this.massDriverTubeMaterial4.clone(), { size: fanDiameter }), fanDiameter / 2)
      ;[this.liftFanOpaqueMaterial, this.liftFanDiskMaterial].forEach(m => { m.userData.shared = true })
    }
    const opaque = this.liftFanOpaqueMaterial
    const disk = this.liftFanDiskMaterial
    const chunk = new THREE.Vector3()
    for (let start = 0; start < centres.length; start += LIFT_FAN_CHUNK) {
      const end = Math.min(centres.length, start + LIFT_FAN_CHUNK)
      // Chunk origin at its centroid; instance matrices are stored relative to it (small numbers).
      chunk.set(0, 0, 0)
      for (let i = start; i < end; i++) chunk.add(centres[i])
      chunk.divideScalar(end - start)
      let extent = 0
      for (let i = start; i < end; i++) extent = Math.max(extent, centres[i].distanceTo(chunk))
      const toChunk = new THREE.Matrix4().makeTranslation(-chunk.x, -chunk.y, -chunk.z)
      const chunkCentre = chunk.clone()
      const build = (geometries) => () => {
        const matrices = { ...leanIntoWind(start, end, chunkCentre), pylon: parts.pylon.slice(start, end) }
        const group = new THREE.Group()
        for (const [part, geometry, material] of geometries) {
          const mesh = new THREE.InstancedMesh(geometry, material, end - start)
          mesh.name = part === 'hub' ? 'liftFanHub' : part === 'disk' ? 'liftFanDisk' : 'liftFanPylon'
          for (let i = start; i < end; i++) mesh.setMatrixAt(i - start, toChunk.clone().multiply(matrices[part][i - start]))
          mesh.computeBoundingSphere()
          group.add(mesh)
        }
        return group
      }
      const lod = new PixelLOD(fanDiameter, { extent: extent + fanDiameter })
      lod.name = 'liftFans'
      lod.position.copy(chunk)
      lod.addLevel(24, build([['hub', this.liftFanHubGeometry, opaque], ['disk', this.liftFanDiskGeometry, disk], ['pylon', this.liftFanPylonGeometry, opaque]]))
      lod.addLevel(SubPixelFade.minimumPixels(), build([['hub', this.liftFanHubGeometryLow, opaque], ['disk', this.liftFanDiskGeometryLow, disk], ['pylon', this.liftFanPylonGeometryLow, opaque]]))
      segmentGroup.add(lod)
    }
  }

  // Rebuilds the lift fans under `root` (as they come into view), leaning into the wind as it is now.
  resetLiftFans(root) {
    const lods = []
    root.traverse((object) => { if (object.name === 'liftFans' && object.isLOD) lods.push(object) })
    for (const lod of lods) {
      // (The geometries are shared; the instance matrices are each level's own.)
      for (const level of lod.pixelLevels) level.object?.traverse(o => { if (o.isInstancedMesh) o.dispose() })
      lod.reset()
    }
  }

  genSpecs(dParamWithUnits, specs) {
    const launcherMassDriverTubeInnerRadius = dParamWithUnits['launcherMassDriverTubeInnerRadius'].value
    const launcherMassDriverTubeWallThickness = dParamWithUnits['launcherMassDriverTubeWallThickness'].value
    const launcherMassDriverTubeLinerThickness = dParamWithUnits['launcherMassDriverTubeLinerThickness'].value
    // Let's assume that we want the tube to be buoyant. We'll use tension lines to moore it to the sea floor.
    // We need enough concrete to provide stuctural rigidity.

    const launcherMassDriverTubeMaterial0Density = dParamWithUnits['launcherMassDriverTubeMaterial0Density'].value
    const launcherMassDriverTubeMaterial0Cost = dParamWithUnits['launcherMassDriverTubeMaterial0Cost'].value
    const launcherMassDriverTubeMaterial1Density = dParamWithUnits['launcherMassDriverTubeMaterial1Density'].value
    const launcherMassDriverTubeMaterial1Cost = dParamWithUnits['launcherMassDriverTubeMaterial1Cost'].value

    const massDriverTubeWallCrosssectionalArea = Math.PI * ((launcherMassDriverTubeInnerRadius+launcherMassDriverTubeWallThickness)**2 - launcherMassDriverTubeInnerRadius**2)
    const massDriverTubeLinerCrosssectionalArea = Math.PI * ((launcherMassDriverTubeInnerRadius+launcherMassDriverTubeWallThickness+launcherMassDriverTubeLinerThickness)**2 - (launcherMassDriverTubeInnerRadius+launcherMassDriverTubeWallThickness)**2)
    specs['massDriverTubeWallCrosssectionalArea'] = {value: massDriverTubeWallCrosssectionalArea, units: "m2"}
    specs['massDriverTubeLinerCrosssectionalArea'] = {value: massDriverTubeLinerCrosssectionalArea, units: "m2"}
  }

}

export class virtualMassDriverTube extends VirtualObject {
  constructor(d, index) {
    super()
    this.d = d
    this.index = index
  }

  static unallocatedModels = []
  static className = 'virtualMassDriverTubes'
  static modelsAreRecyleable = false  // each tube segment is built for its own stretch of the curve
  static highlightClass = 'massDriver'
  static isDynamic = false

  static isTeardownRequired(dParamWithUnits) {
    const newNumObjects = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualMassDriverTubes'].value : 0
    return newNumObjects!==virtualMassDriverTube.numObjects
  }

  static update(dParamWithUnits, versionNumber) {
    virtualMassDriverTube.numObjects = dParamWithUnits['showMassDriverTube'].value ? dParamWithUnits['numVirtualMassDriverTubes'].value : 0
    virtualMassDriverTube.isVisible = dParamWithUnits['showMassDriverTube'].value
    virtualMassDriverTube.isDynamic = false
    virtualMassDriverTube.hasChanged = true
    virtualMassDriverTube.versionNumber = versionNumber
  }

  static addNewVirtualObjects(refFrames) {
    virtualMassDriverTube.addEvenlySpacedObjects(refFrames)
  }

  placeAndOrientModel(om, refFrame) {
    if (virtualMassDriverTube.hasChanged) this.position = null  // the curve may have been reshaped
    this.placeAtD(om, refFrame)
  }
}
