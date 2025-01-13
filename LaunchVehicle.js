import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { FacesGeometry } from './FacesGeometry.js'
import * as tram from './tram.js'

export class launchVehicleModel {
  constructor(dParamWithUnits, myScene, unallocatedModelsList, perfOptimizedThreeJS) {
    const radius = dParamWithUnits['launchVehicleRadius'].value
    const bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    const flameLength = dParamWithUnits['launchVehicleFlameLength'].value
    const lengthSegments = 2
    const radialSegments = 32
    const noseconeLength = dParamWithUnits['launchVehicleNoseconeLength'].value
    const shockwaveConeLength = dParamWithUnits['launchVehicleShockwaveConeLength'].value
    const objName = 'launchVehicle'
    const launchVehicleNumModels = dParamWithUnits['launchVehicleNumModels'].value

    // Proceedurally generate the Launch Vehicle body, flame, and point light meshes

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
    const launchVehicleFin0Geometry = new FacesGeometry(finVertices, finIndices)
    launchVehicleFin0Geometry.rotateY(Math.PI/3)
    launchVehicleFin0Geometry.name = "fin0"
    const launchVehicleFin1Geometry = launchVehicleFin0Geometry.clone()
    launchVehicleFin1Geometry.name = "fin1"
    launchVehicleFin1Geometry.rotateY(Math.PI*2/3)
    const launchVehicleFin2Geometry = launchVehicleFin0Geometry.clone()
    launchVehicleFin2Geometry.name = "fin2"
    launchVehicleFin2Geometry.rotateY(-Math.PI*2/3)
    // Merge the nosecone into the body
    // Temporary model until the real one loads...
    const launchVehicleGeometry = mergeGeometries([launchVehicleHullGeometry, launchVehicleFin0Geometry, launchVehicleFin1Geometry, launchVehicleFin2Geometry], false)
    //const launchVehicleTexture = new THREE.TextureLoader().load('textures/launchVehicleTexture.jpg', function(texture) {launchVehicleMaterial.needsUpdate = true})
    const launchVehicleMaterial = new THREE.MeshPhongMaterial( {color: 0xcfd4d9})
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

    const launchVehicleFlameMesh = makeFlame()
    const launchVehiclePointLightMesh = makePointLight()
    const launchVehicleShockwaveConeMesh = makeShockwaveCone()
    const launchVehicleMesh = assemble(launchVehicleBodyMesh, launchVehicleFlameMesh, launchVehiclePointLightMesh, launchVehicleShockwaveConeMesh)

    const scaleFactor = dParamWithUnits['launchVehicleScaleFactor'].value
    const scaleFactorVector = new THREE.Vector3(
      dParamWithUnits['launchSystemRightwardScaleFactor'].value * scaleFactor,
      dParamWithUnits['launchSystemForwardScaleFactor'].value * scaleFactor,
      dParamWithUnits['launchSystemUpwardScaleFactor'].value * scaleFactor)

    decorateAndSave(launchVehicleMesh, myScene, unallocatedModelsList, objName, scaleFactorVector, launchVehicleNumModels, perfOptimizedThreeJS)
    console.log("Created " + launchVehicleNumModels + " launch vehicle models")

    // Load the launch vehicle body mesh from a model, and replace the proceedurally generated body with the body from the model
    function prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, scaleFactor, n, perfOptimizedThreeJS) {

      // This is the additional work we want to do later, after the loader gets around to loading our model...
      return function(object) {
        object.scale.set(scaleFactor, scaleFactor, scaleFactor)
        object.name = 'launchVehicle_bodyFromModel'
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
        if (perfOptimizedThreeJS) object.children.forEach(child => child.freeze())
      }

    }

    //const loader = new FBXLoader();
    const loader = new OBJLoader();

    const modelScaleFactor = 0.001 // Because Alastair's launch vehicle model used mm instead of meters
    const addLaunchVehicles = prepareACallbackFunctionForFBXLoader (myScene, unallocatedModelsList, objName, modelScaleFactor, launchVehicleNumModels, perfOptimizedThreeJS)
        
    //loader.loadAsync('models/LaunchVehicle.obj').then(addLaunchVehicles)

    function makeFlame() {

      // Create the vehicle's flame
      const launchVehicleFlameGeometry = new THREE.CylinderGeometry(radius*0.95, radius*0.4, flameLength, radialSegments, lengthSegments, false)
      launchVehicleFlameGeometry.name = "rocketEngine"
      const launchVehicleFlameMaterial = new THREE.MeshPhongMaterial( {color: 0x000000, emissive: 0xdfa0df, emissiveIntensity: 1.25, transparent: true, opacity: 0.5})
      const launchVehicleFlameMesh = new THREE.Mesh(launchVehicleFlameGeometry, launchVehicleFlameMaterial)
      launchVehicleFlameMesh.position.set(0, -flameLength/2, 0)
      launchVehicleFlameMesh.name = 'flame'
      return launchVehicleFlameMesh
    
    }

    function makePointLight() {

      const launchVehiclePointLightMesh = new THREE.Points(
        new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [0, 0, 0], 3) ),
        new THREE.PointsMaterial( { color: 0xFFFFFF } ) )
      launchVehiclePointLightMesh.name = 'pointLight'
      return launchVehiclePointLightMesh
    
    }

    function makeShockwaveCone() {
        
        // ToDo: *4 factor below should be a parameter or calculated from the launchVehicle's airspeed
        const launchVehicleShockwaveConeGeometry = new THREE.ConeGeometry(radius*4, shockwaveConeLength, radialSegments, lengthSegments, true)
        launchVehicleShockwaveConeGeometry.name = "shockwaveCone"
        const launchVehicleShockwaveConeMaterial = new THREE.MeshPhongMaterial( {color: 0x000000, side: THREE.DoubleSide, emissive: 0x7f7f7f, emissiveIntensity: 1.25, transparent: true, opacity: 0.15})
        const launchVehicleShockwaveConeMesh = new THREE.Mesh(launchVehicleShockwaveConeGeometry, launchVehicleShockwaveConeMaterial)
        launchVehicleShockwaveConeMesh.position.set(0, bodyLength + noseconeLength - shockwaveConeLength/2, 0)
        launchVehicleShockwaveConeMesh.name = 'shockwaveCone'
        return launchVehicleShockwaveConeMesh

      }

    function assemble(launchVehicleBodyMesh, launchVehicleFlameMesh, launchVehiclePointLightMesh, launchVehicleShockwaveConeMesh) {

      const launchVehicleMesh = new THREE.Group().add(launchVehicleBodyMesh).add(launchVehicleFlameMesh).add(launchVehicleShockwaveConeMesh)
      launchVehicleMesh.name = 'launchVehicle'
      launchVehiclePointLightMesh.visible = dParamWithUnits['showLaunchVehiclePointLight'].value
      launchVehicleMesh.add(launchVehiclePointLightMesh)
      return launchVehicleMesh

    }

    function decorateAndSave(object, myScene, unallocatedModelsList, objName, scaleFactorVector, n, perfOptimizedThreeJS) {
      
      object.scale.set(scaleFactorVector.x, scaleFactorVector.y, scaleFactorVector.z)
      object.visible = false
      object.name = objName
      object.traverse(child => {
      if (child!==object) {
        child.name = objName+'_'+child.name
      }
      })
      object.updateMatrixWorld()
      if (perfOptimizedThreeJS) object.children.forEach(child => child.freeze())
      for (let i=0; i<n; i++) {
        const tempModel = object.clone()
        unallocatedModelsList.push(tempModel)
      }
      
    }
  }
}
  

export class virtualLaunchVehicle {

  constructor(timeLaunched, unallocatedModelsArray) {

    // The virtual vehicle has a position along the launch trajectory curve.
    this.timeLaunched = timeLaunched
    this.unallocatedModels = unallocatedModelsArray
    this.model = null

  }
  
  // The following properties are common to all virtual vehicles...
  static currentEquivalentLatitude
  static isVisible
  static isDynamic
  static hasChanged
  
  static update(dParamWithUnits, planetSpec) {

    virtualLaunchVehicle.planetSpec = planetSpec
    virtualLaunchVehicle.planetRadius = tram.radiusAtLatitude(dParamWithUnits['launcherRampEndLatitude'].value*Math.PI/180, planetSpec.ellipsoid)

    virtualLaunchVehicle.sidewaysOffset = dParamWithUnits['launchVehicleSidewaysOffset'].value
    virtualLaunchVehicle.upwardsOffset = dParamWithUnits['launchVehicleUpwardsOffset'].value
    virtualLaunchVehicle.forwardsOffset = dParamWithUnits['launchVehicleForwardsOffset'].value
    virtualLaunchVehicle.bodyLength = dParamWithUnits['launchVehicleBodyLength'].value
    virtualLaunchVehicle.noseconeLength = dParamWithUnits['launchVehicleNoseconeLength'].value
    virtualLaunchVehicle.flameLength = dParamWithUnits['launchVehicleFlameLength'].value
    virtualLaunchVehicle.shockwaveConeLength = dParamWithUnits['launchVehicleShockwaveConeLength'].value
    virtualLaunchVehicle.isVisible = dParamWithUnits['showLaunchVehicles'].value
    virtualLaunchVehicle.showLaunchVehiclePointLight = dParamWithUnits['showLaunchVehiclePointLight'].value
    virtualLaunchVehicle.slowDownPassageOfTime = dParamWithUnits['launcherSlowDownPassageOfTime'].value
    virtualLaunchVehicle.launchVehicleAdaptiveThrust = dParamWithUnits['launchVehicleAdaptiveThrust'].value
    virtualLaunchVehicle.maxPropellantMassFlowRate = dParamWithUnits['launchVehiclePropellantMassFlowRate'].value

    virtualLaunchVehicle.isDynamic =  true
    virtualLaunchVehicle.hasChanged = true

  }

  placeAndOrientModel(om, refFrame) {

    const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchVehicle.slowDownPassageOfTime, refFrame.timeSinceStart)
    const deltaT = adjustedTimeSinceStart - this.timeLaunched
    const res = refFrame.curve.findRelevantCurve(deltaT)
    const relevantCurve = res.relevantCurve
    const d = Math.max(0, Math.min(1, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength))
    //const i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))

    const modelForward = new THREE.Vector3(0, 1, 0) // The direction that the model considers "forward"
    const modelUpward = new THREE.Vector3(0, 0, 1)  // The direction that the model considers "upward"

    const pointOnRelevantCurve = relevantCurve.getPointAt(d)
    const forward = relevantCurve.getTangentAt(d)
    const upward = relevantCurve.getNormalAt(d)
    const rightward = relevantCurve.getBinormalAt(d)
    if (upward.clone().dot(pointOnRelevantCurve)<0) {
      // Sometimes the normal and binormal vectors point in the wrong direction when there isn't enough curvature. This check fixes that issue.
      upward.negate()
      rightward.negate()
    }

    const orientation = new THREE.Quaternion()
    let tangent = new THREE.Vector3(0, 0, 0)
    // Hack
    if (false && (relevantCurve.name==='freeFlightPositionCurve')) {
      tangent = relevantCurve.freeFlightOrientationCurve.getPointAt(d)  // This curve's "positions" are made from of tangent vectors
      const normal = rightward.clone().cross(tangent)
      const q1 = new THREE.Quaternion()
      q1.setFromUnitVectors(modelForward, tangent)
      const rotatedObjectUpwardVector = modelUpward.clone().applyQuaternion(q1)
      orientation.setFromUnitVectors(rotatedObjectUpwardVector, normal)
      orientation.multiply(q1)
    }
    else {
      relevantCurve.getQuaternionAt(d, modelForward, modelUpward, orientation)
    }
    if ((relevantCurve.name==='launchRampCurve1') || (relevantCurve.name==='evacuatedTubeCurve') || (relevantCurve.name==='freeFlightPositionCurve')) {
      //console.log('tangent:', tangent, 'orientation:', orientation, relevantCurve.name)
      //console.print(deltaT, upward, pointOnRelevantCurve.length()-virtualLaunchVehicle.planetRadius, relevantCurve.name)
    }

    om.position.copy(pointOnRelevantCurve)
        .add(rightward.clone().multiplyScalar(virtualLaunchVehicle.sidewaysOffset))
        .add(upward.clone().multiplyScalar(virtualLaunchVehicle.upwardsOffset))
        .add(forward.clone().multiplyScalar(virtualLaunchVehicle.forwardsOffset))
    om.setRotationFromQuaternion(orientation)

    om.visible = virtualLaunchVehicle.isVisible

    const altitude = pointOnRelevantCurve.length() - virtualLaunchVehicle.planetRadius
    const airDensity = virtualLaunchVehicle.planetSpec.airDensityAtAltitude(altitude)
    let speedOfSound = 1000
    if (virtualLaunchVehicle.planetSpec.speedOfSoundAtAltitude!==undefined) {
      speedOfSound = virtualLaunchVehicle.planetSpec.speedOfSoundAtAltitude(altitude)
    }

    // Turn on the flame at the exit of the launch tube
    // ToDo: Some of this code does not need to be executed for every virtual vehicle.  We could improve performance it we can find a way to
    // execute it just once per animated frame.
    const flame_model = om.getObjectByName('launchVehicle_flame')
    const pointlight_model = om.getObjectByName('launchVehicle_pointLight')
    const shockwaveCone_model = om.getObjectByName('launchVehicle_shockwaveCone')
    let fuelFlowRateFactor
    let shockwaveConeSizeFactor
    let shockwaveConeLengthFactor
    if (relevantCurve.name==='freeFlightPositionCurve') {
      if (virtualLaunchVehicle.launchVehicleAdaptiveThrust) {
        const vehicleTelemetry = relevantCurve.freeFlightTelemetryCurve.getPointAt(d)
        const vehicleAirSpeed = vehicleTelemetry.x
        const aerodynamicDrag = vehicleTelemetry.y 
        const fuelFlowRate = vehicleTelemetry.z
        fuelFlowRateFactor = fuelFlowRate / virtualLaunchVehicle.maxPropellantMassFlowRate
        shockwaveConeSizeFactor = aerodynamicDrag / 2.279e6   // Using the max thrust of an RS-25 vacuum engine as a baseline
        shockwaveConeLengthFactor = vehicleAirSpeed / speedOfSound
        flame_model.visible = (fuelFlowRateFactor>0.01)
        if (vehicleAirSpeed>speedOfSound) {
          shockwaveCone_model.visible = true
        }
        else {
          shockwaveCone_model.visible = false
        }
      }
      else {
        const airDensityFactor = Math.min(1, airDensity/0.0184)     // 0.0184 kg/m^3 is rougly the air density at 30000m
        flame_model.visible = (airDensityFactor>0.1)
        fuelFlowRateFactor = airDensityFactor
        shockwaveCone_model.visible = (airDensityFactor>0.01)
        shockwaveConeSizeFactor = Math.min(1, airDensity/0.0184)   // Using the max thrust of an RS-25 vacuum engine as a baseline
        shockwaveConeLengthFactor = 1
      }

      if (flame_model.visible) {
        flame_model.position.set(0, -virtualLaunchVehicle.flameLength*fuelFlowRateFactor/2, 0)
        flame_model.scale.set(1, fuelFlowRateFactor, 1)
      }

      if (shockwaveCone_model.visible) {
        const shockwaveConeSizeFactorScaled = shockwaveConeSizeFactor * (0.9 + Math.random() * 0.2)
        const lengthScale = shockwaveConeSizeFactorScaled * shockwaveConeLengthFactor
        const widthScale = shockwaveConeSizeFactorScaled
        const yPos = virtualLaunchVehicle.bodyLength + virtualLaunchVehicle.noseconeLength - virtualLaunchVehicle.shockwaveConeLength*lengthScale/2
        shockwaveCone_model.position.set(0, yPos, 0)
        shockwaveCone_model.scale.set(widthScale, lengthScale, widthScale)
        shockwaveCone_model.updateMatrixWorld()
      }
    }
    else {
      flame_model.visible = false
      shockwaveCone_model.visible = false
    }

    pointlight_model.visible = virtualLaunchVehicle.showLaunchVehiclePointLight
    om.matrixValid = false

  }

  getFuturePosition(refFrame, timeDeltaInSeconds) {

    const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchVehicle.slowDownPassageOfTime, refFrame.timeSinceStart + timeDeltaInSeconds)
    const deltaT = adjustedTimeSinceStart - this.timeLaunched
    if (deltaT<=refFrame.curve.getDuration()) {
      const res = refFrame.curve.findRelevantCurve(deltaT)
      const relevantCurve = res.relevantCurve
      const d = relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength
      //const i = Math.max(0, relevantCurve.tToi(deltaT - res.relevantCurveStartTime))
      const pointOnRelevantCurve = relevantCurve.getPointAt(Math.max(0, d))
      return pointOnRelevantCurve
    }
    else {
      return null
    }

  }
  
  getFutureFrame(refFrame, timeDeltaInSeconds) {

    const adjustedTimeSinceStart = tram.adjustedTimeSinceStart(virtualLaunchVehicle.slowDownPassageOfTime, refFrame.timeSinceStart + timeDeltaInSeconds)
    const deltaT = adjustedTimeSinceStart - this.timeLaunched
    if (deltaT<=refFrame.curve.getDuration()) {
      const res = refFrame.curve.findRelevantCurve(deltaT)
      const relevantCurve = res.relevantCurve
      const d = Math.max(0, relevantCurve.tTod(deltaT - res.relevantCurveStartTime) / res.relevantCurveLength)
      const position = relevantCurve.getPointAt(d)
      const forward = relevantCurve.getTangentAt(d)
      const upward = relevantCurve.getNormalAt(d)
      const rightward = relevantCurve.getBinormalAt(d)
      const orientation = relevantCurve.getQuaternionAt(d)
      return {
        position: position,
        forward: forward,
        upward: upward,
        rightward: rightward,
        orientation: orientation
      }
    }
    else {
      return null
    }

  }
      
}
