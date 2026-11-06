import { specificForceAt, capsuleLoad } from './crewAcceleration.js'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FacesGeometry } from './FacesGeometry.js'
import * as tram from '../utils/tram.js'
import { quaternionFromFrame } from '../curves/SuperCurves.js'
import { MovingVirtualObject, curveFrameAtTime, parameterSignature } from './VirtualObject.js'

const MODEL_FORWARD = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
const MODEL_UPWARD = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

export class launchVehicleModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, _unusedLegacyFlag, _gravityAtLauncherLocation) {
    const radius = dParamWithUnits['launchVehicleRadius'].value
    const bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    const lengthSegments = 2
    const radialSegments = 32
    const noseconeLength = dParamWithUnits['launchVehicleNoseconeLength'].value
    const objName = 'launchVehicle'
    const launchVehicleNumModels = dParamWithUnits['launchVehicleNumModels'].value
    const isLunarLaunch = dParamWithUnits['launchFromPlanet']?.value === 'Moon'

    // Proceedurally generate the Launch Vehicle body and point light meshes. (Its plasma and exhaust
    // plume are drawn by LaunchVehicleGlow.js.)

    const profile = []
    // Move to the starting point which is at the back of the combustion chamber
    profile.push(new THREE.Vector2(0, 3.61674418604651))
    profile.push(new THREE.Vector2(0.178604651162791, 3.61674418604651))
    profile.push(new THREE.Vector2(0.20093023255814, 3.60558139534884))
    profile.push(new THREE.Vector2(0.223255813953488, 3.57209302325581))
    profile.push(new THREE.Vector2(0.234418604651163, 3.53860465116279))
    profile.push(new THREE.Vector2(0.234418604651163, 3.13674418604651))
    profile.push(new THREE.Vector2(0.223255813953488, 3.09209302325581))
    profile.push(new THREE.Vector2(0.156279069767442, 2.98046511627907))
    profile.push(new THREE.Vector2(0.133953488372093, 2.9246511627907))
    profile.push(new THREE.Vector2(0.133953488372093, 2.86883720930233))
    profile.push(new THREE.Vector2(0.167441860465116, 2.80186046511628))
    profile.push(new THREE.Vector2(0.312558139534884, 2.58976744186046))
    profile.push(new THREE.Vector2(0.491162790697674, 2.24372093023256))
    profile.push(new THREE.Vector2(0.658604651162791, 1.85302325581395))
    profile.push(new THREE.Vector2(0.814883720930233, 1.38418604651163))
    profile.push(new THREE.Vector2(0.937674418604651, 0.915348837209302))
    profile.push(new THREE.Vector2(1.02697674418605, 0.502325581395349))
    profile.push(new THREE.Vector2(1.11627906976744, 0))
    const totalLength = bodyLength+noseconeLength
    const CValue = 1.0 // The C value optimized the hull profile for a given length and radius to minimize drag. Formulas from Haack series (https://en.wikipedia.org/wiki/Nose_cone_design)
    for (let x = 0; x <= totalLength; x++) {
      const theta = Math.acos(1-2*(totalLength-x)/totalLength)
      const y = radius/Math.sqrt(Math.PI)*Math.sqrt(theta-Math.sin(2*theta)/2+CValue*Math.sin(theta)**3)
      //console.log(theta, y)
      profile.push(new THREE.Vector2(y, x))
    }
    const launchVehicleHullGeometry = new THREE.LatheGeometry(profile, 32)
    
    // Create the fins
    const finLength = bodyLength * 0.5
    const finThickness = 0.2
    const finHeight = radius * 0.5
    const finVertices = [
        new THREE.Vector3(0, finLength, radius),   // Leading edge of fin
        new THREE.Vector3(finThickness/2, 0.1, radius),  // Left trailing edge of fin
        new THREE.Vector3(-finThickness/2, 0.1, radius),  // Right trailing edge of fin
        new THREE.Vector3(0, 0, radius+finHeight)  // Back trailing edge of fin
    ]
    const finIndices = [
        0, 1, 2,
        0, 2, 3,
        0, 3, 1,
        3, 2, 1
    ]
    const launchVehicleTopFinGeometry = new FacesGeometry(finVertices, finIndices)
    launchVehicleTopFinGeometry.rotateY(Math.PI*4/3)
    launchVehicleTopFinGeometry.name = "topFin"
    const launchVehicleRightFinGeometry = launchVehicleTopFinGeometry.clone()
    launchVehicleRightFinGeometry.name = "rightFin"
    launchVehicleRightFinGeometry.rotateY(Math.PI*2/3)
    const launchVehicleLeftFinGeometry = launchVehicleTopFinGeometry.clone()
    launchVehicleLeftFinGeometry.name = "leftFin"
    launchVehicleLeftFinGeometry.rotateY(-Math.PI*2/3)
    // Lunar mass-driver vehicles do not need an aerodynamic nose, fins, or an
    // atmospheric rocket nozzle. Preserve the configured diameter, shorten the
    // body-plus-nose length by 40%, and round both ends into a pressure hull.
    let launchVehicleGeometry
    let lunarTotalLength = totalLength
    if (isLunarLaunch) {
      lunarTotalLength = totalLength * 0.6
      const cylindricalLength = Math.max(0, lunarTotalLength - 2 * radius)
      launchVehicleGeometry = new THREE.CapsuleGeometry(
        radius, cylindricalLength, 16, radialSegments)
      // CapsuleGeometry is centered on the origin; the conventional vehicle
      // geometry runs from y=0 at the tail toward positive y at the nose.
      launchVehicleGeometry.translate(0, lunarTotalLength / 2, 0)
      launchVehicleGeometry.name = 'lunarPillHullGeometry'
    }
    else {
      // Merge the atmospheric nosecone, body, and fins.
      launchVehicleGeometry = mergeGeometries([
        launchVehicleHullGeometry,
        launchVehicleTopFinGeometry,
        launchVehicleRightFinGeometry,
        launchVehicleLeftFinGeometry
      ], false)
    }
    //const launchVehicleTexture = new THREE.TextureLoader().load('textures/launchVehicleTexture.jpg', function(texture) {launchVehicleMaterial.needsUpdate = true})
    const launchVehicleMaterial = isLunarLaunch
      ? new THREE.MeshPhysicalMaterial({
        color: 0xb8c0c7,
        metalness: 0.92,
        roughness: 0.34,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
        anisotropy: 0.65,
        anisotropyRotation: Math.PI / 2
      })
      : new THREE.MeshPhongMaterial({color: 0xcfd4d9})
    // Cutaway view: make the hull semi-transparent so an interior scale figure is visible.
    const showCrew = dParamWithUnits['launchVehicleShowCrew']?.value ?? true
    if (showCrew) {
      launchVehicleMaterial.transparent = true
      launchVehicleMaterial.opacity = 0.35
      launchVehicleMaterial.side = THREE.DoubleSide
      launchVehicleMaterial.depthWrite = false
    }
    // const launchVehicleMaterial = new THREE.MeshPhysicalMaterial( {
    //   clearcoat: 1.0,
    //   clearcoatRoughness: 0.1,
    //   metalness: 0.9,
    //   roughness: 0.5,
    //   color: 0x0000ff,
    //   normalMap: normalMap3,
    //   normalScale: new THREE.Vector2( 0.15, 0.15 )
    // } );
    let launchVehicleBodyMesh = new THREE.Mesh(launchVehicleGeometry, launchVehicleMaterial)
    launchVehicleBodyMesh.name = 'body'
    // Harmless when shadow maps are disabled; lunar close-up presets enable them
    // so the tracked vehicle can cast a real projected shadow on Planet2 terrain.
    launchVehicleBodyMesh.castShadow = true
    if (isLunarLaunch) addLunarDecals(launchVehicleBodyMesh)

    const launchVehiclePointLightMesh = makePointLight()
    const launchVehicleMesh = assemble(launchVehicleBodyMesh, launchVehiclePointLightMesh)

    const scaleFactor = dParamWithUnits['launchVehicleScaleFactor'].value
    const scaleFactorVector = new THREE.Vector3(
      dParamWithUnits['launchSystemRightwardScaleFactor'].value * scaleFactor,
      dParamWithUnits['launchSystemForwardScaleFactor'].value * scaleFactor,
      dParamWithUnits['launchSystemUpwardScaleFactor'].value * scaleFactor)

    decorateAndSave(launchVehicleMesh, unallocatedModelsList, objName, scaleFactorVector, launchVehicleNumModels, _unusedLegacyFlag)
    console.log("Created " + launchVehicleNumModels + " launch vehicle models")

    if (showCrew) {
      addHumanCrew(myScene, unallocatedModelsList, objName, isLunarLaunch ? lunarTotalLength : totalLength, radius, scaleFactorVector)
    }

    // Load the launch vehicle body mesh from a model, and replace the proceedurally generated body with the body from the model

    function addLunarDecals(bodyMesh) {
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 256
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#111820'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '700 68px Arial, sans-serif'
      context.fillText('First Frontier Corp', canvas.width / 2, 88)
      context.font = '500 42px Arial, sans-serif'
      context.fillText('Container# L5-621-0', canvas.width / 2, 170)

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: THREE.FrontSide
      })
      const decalLength = lunarTotalLength * 0.68
      const decalHeight = Math.min(radius * 1.5, decalLength / 4)
      const geometry = new THREE.PlaneGeometry(decalLength, decalHeight)
      geometry.rotateZ(Math.PI / 2)

      const sideOffset = radius + Math.max(0.002, radius * 0.003)
      const firstSide = new THREE.Mesh(geometry, material)
      firstSide.name = 'lunarContainerDecal'
      firstSide.position.set(sideOffset, lunarTotalLength / 2, 0)
      firstSide.rotation.y = Math.PI / 2
      firstSide.renderOrder = 2
      bodyMesh.add(firstSide)

      const secondSide = new THREE.Mesh(geometry, material)
      secondSide.name = 'lunarContainerDecal'
      secondSide.position.set(-sideOffset, lunarTotalLength / 2, 0)
      secondSide.rotation.y = -Math.PI / 2
      secondSide.renderOrder = 2
      bodyMesh.add(secondSide)
    }

    function prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, scaleFactor, n, _unusedLegacyFlag) {

      // This is the additional work we want to do later, after the loader gets around to loading our model...
      return function(object) {
        object.scale.set(scaleFactor, scaleFactor, scaleFactor)
        object.name = 'launchVehicle_bodyFromModel'
        object.traverse(child => {
          if (child.isMesh) child.castShadow = true
        })
        //object.children[0].material.color.setHex(0xcfd4d9)
        //object.children[0].material.map = launchVehicleTexture
        object.children[0].material = launchVehicleMaterial
        //object.children[0].material.wireframe = true
        object.needsUpdate = true
        myScene.traverse(child=> {
          if (child.name==='launchVehicle_body') {
            const parent = child.parent
            parent.remove(child)
            parent.add(object.clone())
          }
        })
        unallocatedModelsList.forEach(element => {
          element.traverse(child => {
            if (child.name==='launchVehicle_body') {
              const parent = child.parent
              parent.remove(child)
              parent.add(object.clone())
            }
          })
        })
      }

    }

    const loader = new OBJLoader();

    const modelScaleFactor = 0.001 // Because Alastair's launch vehicle model used mm instead of meters
    const addLaunchVehicles = prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, modelScaleFactor, launchVehicleNumModels, _unusedLegacyFlag)
        
    //loader.loadAsync('models/LaunchVehicle.obj').then(addLaunchVehicles)

    function addHumanCrew(scene, unallocatedModelsList, objName, axialLength, vehicleRadius, scaleFactorVector) {
      // Place passenger scale figures inside every launch-vehicle body so the
      // semi-transparent hull reveals them. Occupants alternate male/female.
      const maleUrl = 'models/male_mannequin.glb'
      const femaleUrl = 'models/female_mannequin.glb'

      const containerRadius = dParamWithUnits['launchVehicleCrewCapsuleDiameter'].value / 2
      const containerLength = dParamWithUnits['launchVehicleCrewCapsuleLength'].value
      const figureCount = Math.round(dParamWithUnits['launchVehicleCrewCount'].value)
      const forwardSpacing = dParamWithUnits['launchVehicleCrewForwardSpacing'].value

      // Passenger orientation (shared by both sexes): lying on the side, head to the
      // vehicle's left, initially facing the nose. The complete capsule assembly
      // pivots at placement time to put the current proper load along the body's Gx axis.
      const modelUp = new THREE.Vector3(0, 1, 0)             // head direction in model space
      const modelFace = new THREE.Vector3(1, 0, 0)           // look direction in model space
      const worldHead = new THREE.Vector3(-1, 0, 0)          // head to the vehicle's left
      const worldFace = new THREE.Vector3(0, 1, 0) // capsule pivot supplies the time-dependent load alignment
      const a1 = modelUp.clone().normalize()
      const a2 = modelFace.clone().projectOnPlane(a1).normalize()
      const a3 = new THREE.Vector3().crossVectors(a1, a2)
      const b1 = worldHead.clone().normalize()
      const b2 = worldFace.clone().projectOnPlane(b1).normalize()
      const b3 = new THREE.Vector3().crossVectors(b1, b2)
      const modelBasis = new THREE.Matrix4().makeBasis(a1, a2, a3)
      const worldBasis = new THREE.Matrix4().makeBasis(b1, b2, b3)
      const orientation = new THREE.Quaternion().setFromRotationMatrix(
        worldBasis.multiply(modelBasis.transpose()))

      const humanLoader = new GLTFLoader()
      const loadFigure = (url) => new Promise((resolve, reject) => {
        humanLoader.load(url, (gltf) => {
          const model = gltf.scene
          // Render at native size; only recentre so the figure pivots about its own centre when laid down.
          const centre = new THREE.Vector3()
          new THREE.Box3().setFromObject(model).getCenter(centre)
          model.position.sub(centre)
          model.traverse(child => { if (child.isMesh) child.castShadow = false })
          const figure = new THREE.Group()
          figure.name = 'Crew'
          figure.quaternion.copy(orientation)
          figure.add(model)
          resolve(figure)
        }, undefined, reject)
      })

      Promise.all([loadFigure(maleUrl), loadFigure(femaleUrl)])
        .then(([maleFigure, femaleFigure]) => {
          const figures = [maleFigure, femaleFigure]

          // Containment capsule, axis aligned with the passenger's spine (the vehicle's cross axis).
          const containerGeometry = new THREE.CylinderGeometry(containerRadius, containerRadius, containerLength, 24, 1, true)
          containerGeometry.rotateZ(Math.PI / 2)
          const containerMaterial = new THREE.MeshStandardMaterial({
            color: 0x99bbdd, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false
          })

          const baseForward = Math.max(vehicleRadius, axialLength * 0.12) * 3
          const figureAssembly = new THREE.Group()
          figureAssembly.name = 'Crews'
          // The vehicle model carries a non-uniform scale (scaleFactorVector); counter its
          // anisotropy here so the passengers stay rigid and their tilt isn't sheared.
          figureAssembly.scale.set(
            scaleFactorVector.y / scaleFactorVector.x,
            1,
            scaleFactorVector.y / scaleFactorVector.z)
          for (let i = 0; i < figureCount; i++) {
            const pod = new THREE.Group()
            pod.name = 'CrewCapsule'
            pod.position.set(0, baseForward + (i - (figureCount - 1) / 2) * forwardSpacing, 0)
            pod.add(figures[i % 2].clone())
            pod.add(new THREE.Mesh(containerGeometry, containerMaterial))
            figureAssembly.add(pod)
          }

          const attachTo = (root) => {
            root.traverse(child => {
              if (child.name === objName + '_body') child.add(figureAssembly.clone())
            })
          }
          unallocatedModelsList.forEach(attachTo)
          scene.traverse(child => { if (child.name === objName) attachTo(child) })
        })
        .catch(err => console.error('Error loading human scale figure:', err))
    }

    function makePointLight() {

      const launchVehiclePointLightMesh = new THREE.Points(
        new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [0, 0, 0], 3) ),
        new THREE.PointsMaterial( { color: 0xFFFFFF } ) )
      launchVehiclePointLightMesh.name = 'pointLight'
      return launchVehiclePointLightMesh
    
    }

    function assemble(launchVehicleBodyMesh, launchVehiclePointLightMesh) {

      const launchVehicleMesh = new THREE.Group().add(launchVehicleBodyMesh)
      launchVehicleMesh.name = 'launchVehicle'
      launchVehiclePointLightMesh.visible = dParamWithUnits['showLaunchVehiclePointLight'].value
      launchVehicleMesh.add(launchVehiclePointLightMesh)
      return launchVehicleMesh

    }

    function decorateAndSave(object, unallocatedModelsList, objName, scaleFactorVector, n, _unusedLegacyFlag) {
      
      object.scale.set(scaleFactorVector.x, scaleFactorVector.y, scaleFactorVector.z)
      object.visible = false
      object.name = objName
      object.traverse(child => {
      if (child!==object) {
        child.name = objName+'_'+child.name
      }
      })
      object.updateMatrixWorld()
      for (let i=0; i<Math.max(1, n); i++) {  // at least one model: the pool's template
        const tempModel = object.clone()
        unallocatedModelsList.push(tempModel)
      }
      
    }
  }
}
  

// Rendered vehicle model (pooled; see VirtualObject.js). The k-th launch happens at k * launch spacing.
export class virtualLaunchVehicle extends MovingVirtualObject {

  static unallocatedModels = []
  static activeObjects = new Map()
  static className = 'virtualLaunchVehicles'
  static modelsAreRecyleable = true
  static highlightClass = 'launchVehicle'
  static isDynamic = true
  static useT = true

  // Parameters that change the procedurally generated vehicle model (offsets/spacing only affect placement).
  static signatureOf(dParamWithUnits) {
    return parameterSignature(dParamWithUnits,
      ['launchVehicle', 'launchSystem', 'launchFromPlanet', 'showLaunchVehiclePointLight', 'launchVehicleMassDriverForwardAcceleration'],
      ['Spacing', 'Offset', 'CameraRange', 'Mass', 'Thrust', 'FlowRate', 'Exhaust', 'Desired', 'Drag', 'TipRadius', 'Plasma', 'ChamberPressure'])
  }

  static isTeardownRequired(dParamWithUnits) {
    const newNumObjects = dParamWithUnits['showLaunchVehicles'].value ? dParamWithUnits['numVirtualLaunchVehicles'].value : 0
    return newNumObjects!==virtualLaunchVehicle.numObjects
  }

  static update(dParamWithUnits, planetSpec) {
    const v = virtualLaunchVehicle
    v.numObjects = dParamWithUnits['showLaunchVehicles'].value ? dParamWithUnits['numVirtualLaunchVehicles'].value : 0

    v.planetSpec = planetSpec
    // radiusAtLatitude takes degrees (it used to be given radians, putting the vehicle's altitude for
    // air-density purposes ~10 km too low at 45 degrees)
    v.planetRadius = tram.radiusAtLatitude(dParamWithUnits['launcherRampEndLatitude'].value, planetSpec.ellipsoid)

    v.tInc = dParamWithUnits['launchVehicleSpacingInSeconds'].value
    v.sidewaysOffset = dParamWithUnits['launchVehicleSidewaysOffset'].value
    v.upwardsOffset = dParamWithUnits['launchVehicleUpwardsOffset'].value
    v.forwardsOffset = dParamWithUnits['launchVehicleForwardsOffset'].value
    v.bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    v.noseconeLength = dParamWithUnits['launchVehicleNoseconeLength'].value
    v.isVisible = dParamWithUnits['showLaunchVehicles'].value
    v.showLaunchVehiclePointLight = dParamWithUnits['showLaunchVehiclePointLight'].value
    v.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    v.launcherStartDelayInSeconds = dParamWithUnits['launcherStartDelayInSeconds'].value
    // Distance (in model units) from the model origin (tail) to the middle of the hull
    const isLunarLaunch = dParamWithUnits['launchFromPlanet']?.value === 'Moon'
    v.hullCentre = (v.bodyLength + v.noseconeLength) / 2 * (isLunarLaunch ? 0.6 : 1)
    v.forwardScale = dParamWithUnits['launchSystemForwardScaleFactor'].value * dParamWithUnits['launchVehicleScaleFactor'].value

    v.isDynamic = true
    v.hasChanged = true
  }

  // Frame of the rendered model `deltaT` seconds after launch.
  // position: model origin (tail, at the nozzle's exit) including offsets; centre: middle of the hull (what
  // trackers aim at); modelForward: the direction the nose points.
  frameAt(refFrame, deltaT) {
    const v = virtualLaunchVehicle
    const f = curveFrameAtTime(refFrame.curve, deltaT, v.useT)
    const forward = f.forward
    const upward = f.upward
    if (upward.dot(f.point) < 0) {
      // When there isn't enough curvature the curve's normal can point down; keep "up" away from the planet
      upward.negate()
    }
    const rightward = new THREE.Vector3().crossVectors(forward, upward)
    const position = f.point.clone()
      .addScaledVector(rightward, v.sidewaysOffset)
      .addScaledVector(upward, v.upwardsOffset)
      .addScaledVector(forward, v.forwardsOffset)

    let orientation
    let modelForward = forward
    if (f.curve.name === 'freeFlightPositionCurve' && f.curve.freeFlightOrientationCurve) {
      // The orientation curve's "points" are direction vectors (vehicle orientation relative to the planet)
      const oc = f.curve.freeFlightOrientationCurve
      const orientationVector = (f.byT ? oc.getPoint(f.i) : oc.getPointAt(f.d)).normalize()
      modelForward = orientationVector
      orientation = quaternionFromFrame(orientationVector, rightward.clone().cross(orientationVector), MODEL_FORWARD, MODEL_UPWARD)
    }
    else {
      orientation = quaternionFromFrame(forward, upward, MODEL_FORWARD, MODEL_UPWARD)
    }
    const centre = position.clone().addScaledVector(modelForward, v.hullCentre * v.forwardScale)
    return { f, position, centre, forward, upward, rightward, orientation, modelForward }
  }

  placeAndOrientModel(om, refFrame) {
    const v = virtualLaunchVehicle
    const deltaT = this.clampedDeltaT(refFrame)   // (negative while leaving the terminal)
    const frame = this.frameAt(refFrame, deltaT)

    om.position.copy(frame.position)
    om.quaternion.copy(frame.orientation)
    om.visible = v.isVisible

    // Cache the sub-meshes (Object3D.clone() does not copy custom properties, so each model caches its own)
    if (!om._parts) {
      om._parts = {
        pointLight: om.getObjectByName('launchVehicle_pointLight'),
      }
    }
    const { pointLight: pointlight_model } = om._parts

    if (pointlight_model) pointlight_model.visible = v.showLaunchVehiclePointLight
    // Figures arrive asynchronously, including on models already in use.
    om._crewRoot ??= om.getObjectByName('Crews')
    if (om._crewRoot) {
      const force = specificForceAt(frame.f.curve, frame.f.t, v.planetSpec)
      const load = capsuleLoad(force, frame.orientation)
      om._crewRoot.children.forEach(pod => pod.quaternion.copy(load.orientation))
    }
  }
}
