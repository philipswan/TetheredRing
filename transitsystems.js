import * as THREE from 'three'

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { referenceFrame } from './ReferenceFrame.js'
import { virtualSolarArray } from './SolarArray.js'
import { virtualTransitTubeSegment } from './TransitTubeSegment.js'
import { virtualTransitTrackSegment } from './TransitTrackSegment.js'
import { virtualTransitVehicle } from './TransitVehicle.js'
import { virtualRingTerminus } from './RingTerminus.js'
import { virtualGroundTerminus } from './GroundTerminus.js'
import { virtualElevatorCar } from './ElevatorCar.js'
import { virtualHabitat } from './Habitat.js'
import { stationaryRingSegmentModel, virtualStationaryRingSegment } from './StationaryRingSegment.js'
import { movingRingSegmentModel, virtualMovingRingSegment } from './MovingRingSegment.js'
import { statorMagnetSegmentModel, virtualStatorMagnetSegment } from './StatorMagnetSegment.js'
import { virtualElevatorCable } from './ElevatorCable.js'

// C:\Users\phils\Documents\repos\Three.js\TetheredRing\node_modules\three\examples\jsm\loaders
//import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
//import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/GLTFLoader.js'
//import { FBXLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/FBXLoader.js'

import * as tram from './tram.js'
//import { dynamicallyManagedObject } from './dynamicallyManagedObject.js'
//import { remove } from 'lodash'

export class transitSystem {

  // A transit vehicle system comprises four moving frames of refernence and each is divided into "numZones" sections,
  // called "wedges". A large number of "virtual" transit vehicles are created and each is placed inside one wedge 
  // within one of the frames of reference. The frames-of-reference rotate. When a wedge enters the proximity of the camera,
  // the virtual vehicles in that wedge are allocated models of transit vehicles from a pool. Allocated models will be
  // made visible, positioned in the scene, and rendered. When a wedge leaves the proximity of the camera, its models
  // are retured to the pool. Virtual vehicles will also respond to timer events. These events will cause them to 
  // occassionally hop between two frames of reference.

  constructor(scene, dParamWithUnits, specs, genSpecs, crv, ecv, radiusOfPlanet, mainRingCurve) {

    this.scene = scene
    this.unallocatedTransitVehicleModels = []
    this.unallocatedRingTerminusModels = []
    this.unallocatedGroundTerminusModels = []
    this.unallocatedElevatorCarModels = []
    this.unallocatedHabitatModels = []
    this.unallocatedStationaryRingSegmentModels = []
    this.unallocatedMovingRingSegmentModels = []
    this.unallocatedStatorMagnetSegmentModels = []
    this.unallocatedTransitTubeSegmentModels = []
    this.unallocatedTransitTrackSegmentModels = 
      [...Array(dParamWithUnits['transitTracksNumUpwardTracks'].value)].map(() => 
        [...Array(dParamWithUnits['transitTracksNumOutwardTracks'].value)].map(() =>
          [...Array(0)]
        )
      )
    this.unallocatedDynamicallyManagedObjects = []
    this.unallocatedSolarArrayModels = []
    this.unallocatedElevatorCableModels = []
    const numZones = dParamWithUnits['transitSystemNumZones'].value
    
    this.perfOptimizedThreeJS = dParamWithUnits['perfOptimizedThreeJS'].value ? 1 : 0
    //const massDriverLength = dParamWithUnits['massDriverLength'].value
    this.ringSouthernMostPosition = 3/4 // Hack
    
    // Debug - ToDo clean this up when it's no longer needed

    // Creates a pool of transit vehicle models. Some these will be assigned to "virtual vehicles" that are within range of the camera.
    // The rest will be made invisible
    const v1 = dParamWithUnits['transitVehicleCruisingSpeed'].value
    const v3 = dParamWithUnits['movingRingsSpeedForRendering'].value
    const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
    const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value

    this.refFrames = []

    // For vehicles cruising at a steady speed...
    const rf0 = new referenceFrame(mainRingCurve, numZones, 10000, v1, 1, 1, 'transitVehiclesExpressClockwise')
    rf0.addVirtualObject('virtualTransitVehicles')
    rf0.initialize()
    this.refFrames.push(rf0)

    const rf1 = new referenceFrame(mainRingCurve, numZones, 10000, v1, -1, 3, 'transitVehiclesExpressCounterClockwise')
    rf1.addVirtualObject('virtualTransitVehicles')
    rf1.initialize()
    this.refFrames.push(rf1)

    // For vehicles making stops at ringTerminuses...
    const rf2 = new referenceFrame(mainRingCurve, numZones, 10000, v1, 1, 0, 'transitVehiclesCollectorClockwise')
    rf2.addVirtualObject('virtualTransitVehicles')
    rf2.initialize()
    this.refFrames.push(rf2)

    const rf3 = new referenceFrame(mainRingCurve, numZones, 10000, v1, -1, 2, 'transitVehiclesCollectorCounterClockwise')
    rf3.addVirtualObject('virtualTransitVehicles')
    rf3.initialize()
    this.refFrames.push(rf3)

    // Static reference frame
    const rf4 = new referenceFrame(mainRingCurve, numZones, 20000, 0, 1, 1, 'staticMediumRangeRefFrame')
    rf4.addVirtualObject('virtualStationaryRingSegments')
    rf4.addVirtualObject('virtualRingTerminuses')
    rf4.addVirtualObject('virtualGroundTerminuses')
    rf4.addVirtualObject('virtualHabitats')
    rf4.addVirtualObject('virtualElevatorCars')
    for (let j = 0; j < ttnut; j++) {
      for (let i = 0; i < ttnot; i++) {
        rf4.addVirtualObject('virtualTransitTrackSegments_' + j + '_' + i)
      }
    }
    rf4.addVirtualObject('virtualSolarArrays')
    //rf4.addVirtualObject('dynamicallyManagedObjects')
    rf4.initialize()
    this.refFrames.push(rf4)

    // For Moving Rings
    const rf5 = new referenceFrame(mainRingCurve, numZones, 1000, v3, -1, 0, 'movingRings')
    rf5.addVirtualObject('virtualMovingRingSegments')
    rf5.initialize()
    this.refFrames.push(rf5)

    // Static reference frame with much greater camera range
    const rf6 = new referenceFrame(mainRingCurve, numZones, 500000, 0, 1, 1, 'staticLongRangeRefFrame')
    rf6.addVirtualObject('virtualTransitTubeSegments')
    rf6.addVirtualObject('virtualElevatorCables')
    rf6.initialize()
    this.refFrames.push(rf6)

    // Static reference frame with much shorter camera range
    const rf7 = new referenceFrame(mainRingCurve, numZones, 1000, 0, 1, 1, 'staticShortRangeRefFrame')
    rf7.addVirtualObject('virtualStatorMagnetSegments')
    rf7.initialize()
    this.refFrames.push(rf7)

    let maxNumZones = 0
    this.refFrames.forEach(refFrame => {
      maxNumZones = Math.max(maxNumZones, refFrame.numZones)
    })
    this.actionFlags = new Array(maxNumZones).fill(0)

    this.invalidateWedgeHistory = [false]
    this.eventList = []

    this.numVirtualTransitVehicles = 0
    this.numVirtualRingTerminuses = 0
    this.numVirtualHabitats = 0
    this.numVirtualElevatorCars = 0
    this.numVirtualGroundTerminuses = 0
    this.numVirtualTransitTrackSegments = 0
    this.numVirtualSolarArrays = 0
    this.numVirtualElevatorCables = 0
    this.numVirtualStationaryRingSegments = 0
    this.numVirtualTransitTubeSegments = 0
    this.numVirtualMovingRingSegments = 0
    this.numVirtualStatorMagnetSegments = 0

    this.stationaryRingDependantParameters = [{name: 'ringFinalAltitude', lastValue: null}]

    // this.nearestPositionMarker1 = new THREE.Mesh(new THREE.SphereGeometry(1000, 16, 16), new THREE.MeshBasicMaterial({color: 0xff0000}))
    // this.scene.add(this.nearestPositionMarker1)
    // this.nearestPositionMarker2 = new THREE.Mesh(new THREE.SphereGeometry(1000, 16, 16), new THREE.MeshBasicMaterial({color: 0x00ff00}))
    // this.scene.add(this.nearestPositionMarker2)
    // this.nearestPositionMarker3 = new THREE.Mesh(new THREE.SphereGeometry(1000, 16, 16), new THREE.MeshBasicMaterial({color: 0x00ff00}))
    // this.scene.add(this.nearestPositionMarker3)

    function prepareACallbackFunctionForGLTFLoader(myScene, myList, objName, scale_Factor, n, invalidateWedgeHistory, perfOptimizedThreeJS) {
      return function( {scene} ) {
        const object = scene.children[0]
        object.visible = false
        object.name = objName
        object.traverse(child => {
          if (child!==object) {
            child.name = objName+'_'+child.name
          }
        })
        if (perfOptimizedThreeJS) object.children.forEach(child => child.freeze())
        object.scale.set(scale_Factor, scale_Factor, scale_Factor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myScene.add(tempModel)
          myList.push(tempModel)
        }
        invalidateWedgeHistory[0] = true
      }
    }

    function prepareACallbackFunctionForFBXLoader(myScene, myList, objName, scaleFactor, n, invalidateWedgeHistory, perfOptimizedThreeJS) {
      return function( object ) {
        if (objName == 'ringTerminus') {
          // Delete the tube and tracks from the model
          for (let i = 0; i<5; i++) {
            object.children[i].visible = false
          }
        }
        if (objName == 'habitat') {
          // Create the habitat, then using the transit terminus model as a starting point, delete everything except the connecting passageways, and add those the the habitat model.
          const tempHabitat = tram.generateHabitatMeshes(dParamWithUnits, specs, genSpecs)
          for (let i = 5; i<=8; i++) {
            tempHabitat.add(object.children[i].clone())
          }
          for (let i = 13; i<=27; i++) {
            tempHabitat.add(object.children[i].clone())
          }
          for (let i = 42; i<=42; i++) {
            tempHabitat.add(object.children[i].clone())
          }
          object = tempHabitat
        }
        if (objName == 'groundTerminus') {
          object.children.forEach(child => {
            if (child.type == 'DirectionalLight') {
              child.visible = false
            }
          })
        }
        object.updateMatrixWorld()
        object.visible = false
        object.name = objName
        object.traverse(child => {
          if (child!==object) {
            child.name = objName+'_'+child.name
          }
        })
        if (perfOptimizedThreeJS) object.children.forEach(child => child.freeze())
        object.scale.set(scaleFactor, scaleFactor, scaleFactor)
        for (let i=0; i<n; i++) {
          const tempModel = object.clone()
          myList.push(tempModel)
        }
        // Since the dynamic model engine may have already started, we need force it to
        // reallocate models to all virtual objects by invalidating the wedge
        // history for all of the reference frames.
        invalidateWedgeHistory[0] = true
      }
    }

    const addTransitVehicles = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedTransitVehicleModels, 'transitVehicle', 1, dParamWithUnits['transitVehicleNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addRingTerminuses = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedRingTerminusModels, 'ringTerminus', 1.25, dParamWithUnits['ringTerminusNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addGroundTerminuses = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedGroundTerminusModels, 'groundTerminus', 1.25, dParamWithUnits['groundTerminusNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    //const addGroundTerminuses = prepareACallbackFunctionForGLTFLoader(this.scene, this.unallocatedGroundTerminusModels, 'groundTerminus', 1.25, dParamWithUnits['groundTerminusNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addElevatorCars = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedElevatorCarModels,'elevatorCar', 1.04, dParamWithUnits['elevatorCarNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    //const addElevatorCars = prepareACallbackFunctionForGLTFLoader(this.scene, this.unallocatedElevatorCarModels,'elevatorCar', 1.04, dParamWithUnits['elevatorCarNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addHabitats = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedHabitatModels, 'habitat', 1.25, dParamWithUnits['habitatNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addStationaryRingSegments = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedStationaryRingSegmentModels, 'stationaryRing', 1, dParamWithUnits['stationaryRingNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addMovingRingSegments = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedMovingRingSegmentModels, 'movingRing', 1, dParamWithUnits['movingRingNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addStatorMagnetSegments = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedStatorMagnetSegmentModels, 'statorMagnet', 1, dParamWithUnits['statorMagnetNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addTransitTubes = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedTransitTubeSegmentModels, 'transitTube', 1, dParamWithUnits['transitTubeNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    //const addTransitTracks = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedTransitTrackSegmentModels, 'transitTrack', 1, dParamWithUnits['transitTrackNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const addSolarArrays = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedSolarArrayModels, 'solarArray', 1, dParamWithUnits['solarArrayNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    //const addDynamicallyManagedObjects = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedDynamicallyManagedObjects, 'dynamicallyManagedObject', 1, dParamWithUnits['dynamicallyManagedObjectNumModels'].value, this.invalidateWedgeHistory, this.perfOptimizedThreeJS)
    const progressFunction = function ( xhr ) {
      console.log( ( xhr.loaded / xhr.total * 100 ) + '% model loaded' );
    }
    const errorFunction = function ( error ) {
      console.log( 'An error happened', error );
    }

    let lengthSegments, radius, radialSegments

    // Each line of the following code loads a model, and then the loader calls a callback function that creates a number of copies, adds them
    // to an array of unallocated models, and sets each to be invisible. Later, models from this pool will be dynamically reallocated to 
    // various "virtual objects" and made visible when the virtual objects are deemed to be near enough to the scene's camera.
    const gltfloader = new GLTFLoader()
    // Note: looks like maybe the TransitCar model was created in units of inches and then a 0.02539 scaling factor was applied
    //gltfloader.load('models/TransitCar.glb', addTransitVehicles, progressFunction, errorFunction )

    const fbxloader = new FBXLoader()
    if (dParamWithUnits['showTransitVehicles'].value) {
      console.log('Loading TransitCar.fbx')
      fbxloader.load('models/TransitCar.fbx', addTransitVehicles, progressFunction, errorFunction )
    }
    if (dParamWithUnits['showRingTerminuses'].value) {
      console.log('Loading RingTerminus.fbx')
      fbxloader.load('models/RingTerminus.fbx', addRingTerminuses, progressFunction, errorFunction )
    }
    if (dParamWithUnits['showGroundTerminuses'].value) {
      console.log('Loading GroundTerminus.fbx')
      fbxloader.load('models/GroundTerminus.fbx', addGroundTerminuses, progressFunction, errorFunction )
      //gltfloader.load('models/GroundTerminus.gltf', addGroundTerminuses, progressFunction, errorFunction )
    }
    if (dParamWithUnits['showHabitats'].value) {
      fbxloader.load('models/RingTerminus.fbx', addHabitats, progressFunction, errorFunction )  // This is hacky - borrowed RingTerminus model and modified it to make a habitat
      console.log('Loading Elevator.fbx')
    }
    if (dParamWithUnits['showElevatorCars'].value) {
      fbxloader.load('models/Elevator.fbx', addElevatorCars, progressFunction, errorFunction )
      //gltfloader.load('models/Elevator.gltf', addElevatorCars, progressFunction, errorFunction )
    }

    // Manually create the stationary rings
    const nt = dParamWithUnits['numVirtualRingTerminuses'].value
    const nh = dParamWithUnits['numVirtualHabitats'].value
    const numTransitStops = nt + nh

    const stationaryRingMesh = new stationaryRingSegmentModel(dParamWithUnits, crv, mainRingCurve)
    addStationaryRingSegments(stationaryRingMesh)

    const movingRingMesh = new movingRingSegmentModel(dParamWithUnits, crv, mainRingCurve)
    addMovingRingSegments(movingRingMesh)

    const statorMagnetMesh = new statorMagnetSegmentModel(dParamWithUnits, crv, mainRingCurve)
    addStatorMagnetSegments(statorMagnetMesh)

    // Manually create the transit tube 
    function getTransitTubeSegmentCurve() {
      const lengthSegments = 4
      const segmentNumber = 0
      const totalSegments = numTransitStops
      return tram.makeOffsetCurve(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    lengthSegments = 4
    radius = dParamWithUnits['transitTubeTubeRadius'].value
    radialSegments = 32
    const transitTubeGeometry = new THREE.TubeGeometry(getTransitTubeSegmentCurve(), lengthSegments, radius, radialSegments, false)
    //const transitTubeMaterial = new THREE.MeshPhongMaterial( {transparent: true, opacity: 0.25})
    const transitTubeMaterial = new THREE.MeshPhongMaterial( {side: THREE.FrontSide, transparent: true, opacity: dParamWithUnits['transitTubeOpacity'].value})
    const transitTubeMesh = new THREE.Mesh(transitTubeGeometry, transitTubeMaterial)
    addTransitTubes(transitTubeMesh)

    // fbxloader.load('models/Elevator.fbx', addDynamicallyManagedObjects, progressFunction, errorFunction )
    
    // Create transit track segments
    const dx = dParamWithUnits['transitTrackWidth'].value / 2
    const dy = dParamWithUnits['transitTrackHeight'].value / 2
    const trackShape = new THREE.Shape()
    trackShape.moveTo(dx, dy)
    trackShape.lineTo(dx, -dy)
    trackShape.lineTo(-dx, -dy)
    trackShape.lineTo(-dx, dy)
    trackShape.closed = true

    function getTransitTrackSegmentCurve(transitTrackOutwardOffset, transitTrackUpwardOffset) {
      const lengthSegments = 4
      const segmentNumber = 0
      const totalSegments = numTransitStops
      return tram.makeOffsetCurve(transitTrackOutwardOffset, transitTrackUpwardOffset, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    const ttnm = dParamWithUnits['transitTrackNumModels'].value

    for (let j = 0; j < ttnut; j++) {
      const ttuof = j - (ttnut - 1) / 2  // Transit Track Upward Offset Factor
      const transitTrackUpwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['transitTrackUpwardOffset'].value + ttuof * dParamWithUnits['transitTrackUpwardSpacing'].value
      for (let i = 0; i < ttnot; i++) {
        const ttoof = i - (ttnot - 1) / 2  // Transit Track Outward Offset Factor
        const transitTrackOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + dParamWithUnits['transitTrackOutwardOffset'].value + ttoof * dParamWithUnits['transitTrackOutwardSpacing'].value
  
        const trackExtrudeSettings = {
          steps: 16,
          depth: 1,
          extrudePath: getTransitTrackSegmentCurve(transitTrackOutwardOffset, transitTrackUpwardOffset)
        }
        const transitTrackGeometry = new THREE.ExtrudeGeometry(trackShape, trackExtrudeSettings)
        transitTrackGeometry.name = 'transitTrackGeometry_' + j + '_' + i
        //const transitTrackMaterial = new THREE.MeshPhongMaterial( {transparent: true, opacity: 0.25})
        const transitTrackMaterial = new THREE.MeshPhongMaterial( {color: 0x3f3f3f})
        const transitTrackMesh = new THREE.Mesh(transitTrackGeometry, transitTrackMaterial)
        transitTrackMesh.userData.upwardIndex = j
        transitTrackMesh.userData.outwardIndex = i
        transitTrackMesh.name = 'transitTrack_' + j + '_' + i
        transitTrackMesh.visible = false
        transitTrackMesh.updateMatrixWorld()
        if (this.perfOptimizedThreeJS) transitTrackMesh.freeze()
        for (let k=0; k<ttnm; k++) {
          const tempModel = transitTrackMesh.clone()
          this.unallocatedTransitTrackSegmentModels[j][i].push(tempModel)
        }
      }
    }

    // fbxloader.load('models/Elevator.fbx', addDynamicallyManagedObjects, progressFunction, errorFunction )
    
    // Manually create the solar arrays
    function getSolarArraySegmentCurve() {
      const lengthSegments = 4
      const segmentNumber = 0
      const totalSegments = numTransitStops
      return tram.makeOffsetCurve(dParamWithUnits['solarArrayOutwardOffset'].value, dParamWithUnits['solarArrayUpwardOffset'].value, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    lengthSegments = 4
    const solarArrayWidth = dParamWithUnits['solarArrayWidth'].value
    const solarArrayHeight = dParamWithUnits['solarArrayHeight'].value
    radialSegments = 32
    const solarArrayGeometry = new THREE.PlaneGeometry(solarArrayWidth, solarArrayHeight, 1, 1)
    const solarArrayTexture = new THREE.TextureLoader().load( './textures/SolarPanelTexture.jpg' )
    const solarArrayMaterial = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide, map: solarArrayTexture})
    const solarArrayMesh = new THREE.Mesh(solarArrayGeometry, solarArrayMaterial)
    addSolarArrays(solarArrayMesh)

    const pointSet = [new THREE.Vector3(0, -100, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 100, 0)]
    const elevatorCableMaterial = new THREE.LineBasicMaterial({
      vertexColors: false,
      color: 0x4897f8,
      transparent: true, // Must be set to true if you want to change the opacity later
      opacity: dParamWithUnits['elevatorCableOpacity'].value
    })
    const elevatorCableGeometry = new THREE.BufferGeometry().setFromPoints(pointSet)

    for (let i = 0; i<dParamWithUnits['numElevatorCableModels'].value; i++) {
      const elevatorCableModel = new THREE.LineSegments(elevatorCableGeometry, elevatorCableMaterial.clone())
      elevatorCableModel.visible = false
      elevatorCableModel.name = 'elevatorCable'
      elevatorCableModel.renderOrder = 1
      this.unallocatedElevatorCableModels.push(elevatorCableModel)
    }

    // This calculator computes the position of the collector lane reference frames as a function of time
    this.refFrameCalculator = new tram.vehicleReferenceFrameTrackPositionCalculator(dParamWithUnits, mainRingCurve, crv)
    this.elevatorPosCalc = new tram.elevatorPositionCalculator(dParamWithUnits, crv, ecv)

    this.transitVehicleRelativePosition_r = []
    this.transitVehicleRelativePosition_y = []
    this.ringTerminusRelativePosition_r = 0
    this.ringTerminusRelativePosition_y = 0
    this.groundTerminusRelativePosition_r = 0
    this.groundTerminusRelativePosition_y = 0
    this.animateElevatorCarsStartTimeOffset = 0
    this.previousAnimateElevatorCars = dParamWithUnits['animateElevatorCars'].value
    this.update(dParamWithUnits, scene, specs, genSpecs, crv, radiusOfPlanet, mainRingCurve)
  }

  update(dParamWithUnits, scene, specs, genSpecs, crv, radiusOfPlanet, mainRingCurve, timeSinceStart) {

    this.scene = scene

    const nt = dParamWithUnits['numVirtualRingTerminuses'].value
    const nh = dParamWithUnits['numVirtualHabitats'].value
    const numTransitStops = nt + nh

    this.refFrames.forEach(refFrame => {refFrame.update()})
    // ToDo: Updating the curve will leave some models it the wrong positions or worse. We need to
    // call placeAndOrient and possibly reassign all of the virtual models to wedges.

    virtualTransitVehicle.update(dParamWithUnits, crv)
    virtualRingTerminus.update(dParamWithUnits, crv)
    virtualGroundTerminus.update(dParamWithUnits, crv)
    virtualElevatorCar.update(dParamWithUnits, crv)
    virtualHabitat.update(dParamWithUnits, crv)
    virtualStationaryRingSegment.update(dParamWithUnits, crv)
    virtualMovingRingSegment.update(dParamWithUnits, crv)
    virtualStatorMagnetSegment.update(dParamWithUnits, crv)
    virtualTransitTubeSegment.update(dParamWithUnits, crv)
    virtualTransitTrackSegment.update(dParamWithUnits, crv)
    virtualSolarArray.update(dParamWithUnits, crv)
    virtualElevatorCable.update(dParamWithUnits, crv)
    //dynamicallyManagedObject.update(dParamWithUnits, crv)
    
    let changeOccured

    // Update the number of transit vehicles
    const newNumVirtualTransitVehicles = dParamWithUnits['showTransitVehicles'].value ? dParamWithUnits['numVirtualTransitVehicles'].value : 0
    // Remove old virtual transit vehicles
    const allTracks = [this.refFrames[0], this.refFrames[1], this.refFrames[2], this.refFrames[3]]
    changeOccured = (this.numVirtualTransitVehicles != newNumVirtualTransitVehicles)
    if (changeOccured && (this.numVirtualTransitVehicles > 0)) {
      this.removeOldVirtualObjects(allTracks, 'virtualTransitVehicles', this.unallocatedTransitVehicleModels)
    }

    // Add new virtual transit vehicles
    const outerTracks = [this.refFrames[0], this.refFrames[1]]
    const innerTracks = [this.refFrames[2], this.refFrames[3]]

    if (changeOccured && (newNumVirtualTransitVehicles > 0)) {
      // Add new virtual transit vehicles to express lane tracks
      const randOn = (dParamWithUnits['transitVehicleRandomizeStartPositions'].value) ? 1 : 0;
      const n1 = newNumVirtualTransitVehicles * 1 / 40
      const step1 = 1.0 / n1
      outerTracks.forEach(refFrame => {
        for (let i = 0; i < n1; i++) {
          const positionInFrameOfReference = i * step1
          const randomizedPositionInFrameOfReference = positionInFrameOfReference + randOn*(step1 * 0.8 * Math.random())
          const zoneIndex = Math.floor(randomizedPositionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          refFrame.wedges[zoneIndex]['virtualTransitVehicles'].push(new virtualTransitVehicle(randomizedPositionInFrameOfReference, this.unallocatedTransitVehicleModels))
        }
        refFrame.prevStartWedgeIndex = -1
      })

      // Add new virtual transit vehicles to collector lane tracks
      const n2 = newNumVirtualTransitVehicles * 10 / 40
      const step2 = 1.0 / n2
      innerTracks.forEach(refFrame => {
        for (let i = 0; i < n2; i++) {
          const positionInFrameOfReference = i * step2
          const randomizedPositionInFrameOfReference = positionInFrameOfReference + randOn*(step2 * 0.8 * Math.random())
          const zoneIndex = Math.floor(randomizedPositionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          refFrame.wedges[zoneIndex]['virtualTransitVehicles'].push(new virtualTransitVehicle(randomizedPositionInFrameOfReference, this.unallocatedTransitVehicleModels))
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualTransitVehicles = newNumVirtualTransitVehicles

    // Update virtual objects residing in the short camera range static reference frame
    // That is, "facilities" (habitats, terminuses, elevator cars), but not ultra long segments such as elevator cables

    const staticMediumRangeRefFrame = [this.refFrames[4]]

    // Since habitats and terminuses are interspersed, changing either causes a major teardown of not only
    // habitats and ring terminuses, but also elevator cables, cars, and ground terminuses
    const showRingTerminuses = dParamWithUnits['showRingTerminuses'].value
    const showHabitats = dParamWithUnits['showHabitats'].value
    const showElevatorCars = dParamWithUnits['showElevatorCars'].value
    const showGroundTerminuses = dParamWithUnits['showGroundTerminuses'].value

    const newNumVirtualRingTerminuses = showRingTerminuses ? dParamWithUnits['numVirtualRingTerminuses'].value : 0
    const newNumVirtualHabitats = showHabitats ? dParamWithUnits['numVirtualHabitats'].value : 0
    const newNumVirtualElevatorCars = showElevatorCars ? dParamWithUnits['numVirtualRingTerminuses'].value : 0
    const newNumVirtualGroundTerminuses = showGroundTerminuses ? dParamWithUnits['numVirtualRingTerminuses'].value : 0

    // If a needed, remove all of the existing virtual facilities
    changeOccured = (this.numVirtualRingTerminuses != newNumVirtualRingTerminuses) || 
                    (this.numVirtualHabitats != newNumVirtualHabitats) ||
                    (this.numVirtualElevatorCars != newNumVirtualElevatorCars) || 
                    (this.numVirtualGroundTerminuses != newNumVirtualGroundTerminuses)
    if (changeOccured && (this.numVirtualRingTerminuses > 0)) {
      this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualRingTerminuses', this.unallocatedRingTerminusModels)
    }
    if (changeOccured && (this.numVirtualHabitats > 0)) {
      this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualHabitats', this.unallocatedHabitatModels)
    }
    if (changeOccured && (this.numVirtualElevatorCars > 0)) {
      this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualElevatorCars', this.unallocatedElevatorCarModels)
    }
    if (changeOccured && (this.numVirtualGroundTerminuses > 0)) {
      this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualGroundTerminuses', this.unallocatedGroundTerminusModels)
    }

    // Add new facilities
    if (changeOccured) {
      // Place static reference frame objects such as ringTerminuses, elevatorCars, habitats, transit tubes, launch tubes, main rings, etc...
      let step3 = 1.0 / numTransitStops
      let prevFloorS = -1
      staticMediumRangeRefFrame.forEach(refFrame => {
        for (let i = 0; i < numTransitStops; i++) {
          const positionInFrameOfReference = i * step3
          const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          const currFloorS = Math.floor(i * nt / numTransitStops)
          if (currFloorS == prevFloorS) {
            if (showHabitats) refFrame.wedges[zoneIndex]['virtualHabitats'].push(new virtualHabitat(positionInFrameOfReference, this.unallocatedHabitatModels))
          }
          else {
            if (showRingTerminuses) refFrame.wedges[zoneIndex]['virtualRingTerminuses'].push(new virtualRingTerminus(positionInFrameOfReference, this.unallocatedRingTerminusModels))
            if (showGroundTerminuses) refFrame.wedges[zoneIndex]['virtualGroundTerminuses'].push(new virtualGroundTerminus(positionInFrameOfReference, this.unallocatedGroundTerminusModels))
            if (showElevatorCars) refFrame.wedges[zoneIndex]['virtualElevatorCars'].push(new virtualElevatorCar(positionInFrameOfReference, this.unallocatedElevatorCarModels))
          }
          prevFloorS = currFloorS
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualRingTerminuses = newNumVirtualRingTerminuses
    this.numVirtualHabitats = newNumVirtualHabitats
    this.numVirtualElevatorCars = newNumVirtualElevatorCars
    this.numVirtualGroundTerminuses = newNumVirtualGroundTerminuses
    
    // Transit Track Segments
    const newNumVirtualTransitTrackSegments = dParamWithUnits['showTransitTracks'].value ? numTransitStops : 0
    changeOccured = (this.numVirtualTransitTrackSegments != newNumVirtualTransitTrackSegments)

    if (changeOccured && (this.numVirtualTransitTrackSegments > 0)) {
      const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
      const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value
      for (let j = 0; j < ttnut; j++) {
        for (let i = 0; i < ttnot; i++) {
          this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualTransitTrackSegments_' + j + '_' + i, this.unallocatedTransitTrackSegmentModels[j][i])
        }
      }
    }

    if (changeOccured && (newNumVirtualTransitTrackSegments > 0)) {
      let step3 = 1.0 / numTransitStops
      const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
      const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value

      staticMediumRangeRefFrame.forEach(refFrame => {
        for (let i = 0; i < numTransitStops; i++) {
          const positionInFrameOfReference = i * step3
          const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          for (let j = 0; j < ttnut; j++) {
            for (let i = 0; i < ttnot; i++) {
              refFrame.wedges[zoneIndex]['virtualTransitTrackSegments_' + j + '_' + i].push(new virtualTransitTrackSegment(positionInFrameOfReference, this.unallocatedTransitTrackSegmentModels[j][i]))
            }
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualTransitTrackSegments = newNumVirtualTransitTrackSegments
  
    // Solar Arrays
    const newNumVirtualSolarArrays = dParamWithUnits['showSolarArrays'].value ? dParamWithUnits['numVirtualSolarArrays'].value : 0
    changeOccured = (this.numVirtualSolarArrays != newNumVirtualSolarArrays)

    if (changeOccured && (this.numVirtualSolarArrays > 0)) {
      this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualSolarArrays', this.unallocatedSolarArrayModels)
    }

    if (changeOccured && (newNumVirtualSolarArrays > 0)) {
      const nsa = dParamWithUnits['numVirtualSolarArrays'].value
      let step4 = 1.0 / nsa

      staticMediumRangeRefFrame.forEach(refFrame => {
        if (dParamWithUnits['showSolarArrays'].value) {
          for (let i = 0; i < nsa; i++) {
            const positionInFrameOfReference = i * step4
            const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
            refFrame.wedges[zoneIndex]['virtualSolarArrays'].push(new virtualSolarArray(positionInFrameOfReference, this.unallocatedSolarArrayModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualSolarArrays = newNumVirtualSolarArrays


    // Update virtual objects residing in the short camera range static reference frame
    const staticLongRangeRefFrame = [this.refFrames[6]]

    // Since habitats and terminuses are interspersed, changing either causes a major teardown of not only
    // habitatis and ring terminuses, but also elevator cables, cars, and ground terminuses
    const showElevatorCables = dParamWithUnits['showElevatorCables'].value
    const newNumVirtualElevatorCables = showElevatorCables ? dParamWithUnits['numVirtualRingTerminuses'].value : 0

    // If a needed, remove all of the existing virtual facilities
    changeOccured = (this.numVirtualElevatorCables != newNumVirtualElevatorCables)
    if (changeOccured && (this.numVirtualElevatorCables > 0)) {
      this.removeOldVirtualObjects(staticLongRangeRefFrame, 'virtualElevatorCables', this.unallocatedElevatorCableModels)
    }

    // Add new facilities
    if (changeOccured) {
      // Place static reference frame objects such as ringTerminuses, elevatorCars, habitats, transit tubes, launch tubes, main rings, etc...
      let step3 = 1.0 / numTransitStops
      let prevFloorS = -1
      staticLongRangeRefFrame.forEach(refFrame => {
        for (let i = 0; i < numTransitStops; i++) {
          const positionInFrameOfReference = i * step3
          const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          const currFloorS = Math.floor(i * nt / numTransitStops)
          if (currFloorS == prevFloorS) {
          }
          else {
            if (showElevatorCables) refFrame.wedges[zoneIndex]['virtualElevatorCables'].push(new virtualElevatorCable(positionInFrameOfReference, this.unallocatedElevatorCableModels))
          }
          prevFloorS = currFloorS
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualElevatorCables = newNumVirtualElevatorCables
    
    // Stationary Ring Segments
    const showStationaryRings = dParamWithUnits['showStationaryRings'].value
    const newNumVirtualStationaryRingSegments = showStationaryRings ? dParamWithUnits['numVirtualStationaryRingSegments'].value : 0
    changeOccured = (this.numStationaryRingSegments != newNumVirtualStationaryRingSegments)
    this.stationaryRingDependantParameters.forEach(dependantParameter => {
      if (dependantParameter.lastValue===null || dParamWithUnits[dependantParameter.name].value!==dependantParameter.lastValue) {
        changeOccured |= true
        dependantParameter.lastValue = dParamWithUnits[dependantParameter.name].value
      }
    })

    if (changeOccured && (this.numVirtualStationaryRingSegments > 0)) {
      this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualStationaryRingSegments', this.unallocatedStationaryRingSegmentModels)
      // ToDo: We need to remove the models as well, because the length of the model depends on the number of virtual ring segments
    }

    if (changeOccured && (newNumVirtualStationaryRingSegments > 0)) {
      const nsr = newNumVirtualStationaryRingSegments
      let step4 = 1.0 / nsr

      staticMediumRangeRefFrame.forEach(refFrame => {
        for (let i = 0; i < nsr; i++) {
          const positionInFrameOfReference = i * step4
          const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          for (let j = 0; j<dParamWithUnits['numMainRings'].value; j++) {
            refFrame.wedges[zoneIndex]['virtualStationaryRingSegments'].push(new virtualStationaryRingSegment(positionInFrameOfReference, j, this.unallocatedStationaryRingSegmentModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
      // ToDo: We will need to recreate the models as well, if the number of virtual ring segments has changed.
    }
    this.numVirtualStationaryRingSegments = newNumVirtualStationaryRingSegments

    // Transit Tube Segments
    const showTransitTube = dParamWithUnits['showTransitTube'].value
    const newNumVirtualTransitTubeSegments = showTransitTube ? numTransitStops : 0
    changeOccured = (this.numVirtualTransitTubeSegments != newNumVirtualTransitTubeSegments)

    if (changeOccured && (this.numVirtualTransitTubeSegments > 0)) {
      this.removeOldVirtualObjects(staticLongRangeRefFrame, 'virtualTransitTubeSegments', this.unallocatedTransitTubeSegmentModels)
    }

    if (changeOccured && (newNumVirtualTransitTubeSegments > 0)) {
      let step3 = 1.0 / numTransitStops

      staticLongRangeRefFrame.forEach(refFrame => {
        for (let i = 0; i < numTransitStops; i++) {
          const positionInFrameOfReference = i * step3
          const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          for (let j = 0; j<dParamWithUnits['numMainRings'].value; j++) {
            refFrame.wedges[zoneIndex]['virtualTransitTubeSegments'].push(new virtualTransitTubeSegment(positionInFrameOfReference, this.unallocatedTransitTubeSegmentModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualTransitTubeSegments = newNumVirtualTransitTubeSegments
  


    // Moving Rings' frame of reference
    const movingRingReferenceFrame = [this.refFrames[5]]

    // Moving Ring Segments
    const newNumVirtualMovingRingSegments = dParamWithUnits['showMovingRings'].value ? dParamWithUnits['numVirtualMovingRingSegments'].value : 0
    changeOccured = (this.numVirtualMovingRingSegments != newNumVirtualMovingRingSegments)

    if (changeOccured && (this.numVirtualMovingRingSegments > 0)) {
      this.removeOldVirtualObjects(movingRingReferenceFrame, 'virtualMovingRingSegments', this.unallocatedMovingRingSegmentModels)
      // ToDo: We need to remove the models as well, because the length of the model depends on the number of virtual ring segments
    }

    if (changeOccured && (newNumVirtualMovingRingSegments > 0)) {
      let step5 = 1.0 / newNumVirtualMovingRingSegments
      movingRingReferenceFrame.forEach(refFrame => {
        for (let i = 0; i < newNumVirtualMovingRingSegments; i++) {
          const positionInFrameOfReference = i * step5
          const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          // For now, all of the rings are the same diameter, so we can get away with using the same models and virtual objects for all of them.
          // In the final design, the rings will likely have slightly different diameters.
          for (let j = 0; j<dParamWithUnits['numMainRings'].value; j++) {
            refFrame.wedges[zoneIndex]['virtualMovingRingSegments'].push(new virtualMovingRingSegment(positionInFrameOfReference, j, this.unallocatedMovingRingSegmentModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
      // ToDo: We will need to recreate the models as well, if the number of virtual ring segments has changed.
    }
    this.numVirtualMovingRingSegments = newNumVirtualMovingRingSegments

    // Stator Magnets
    const staticShortRangeRefFrame = [this.refFrames[7]]
    const newNumVirtualStatorMagnetSegments = dParamWithUnits['showStatorMagnets'].value ? dParamWithUnits['numVirtualStatorMagnetSegments'].value : 0
    changeOccured = (this.numVirtualStatorMagnetSegments != newNumVirtualStatorMagnetSegments)

    if (changeOccured && (this.numVirtualStatorMagnetSegments > 0)) {
      this.removeOldVirtualObjects(staticShortRangeRefFrame, 'virtualStatorMagnetSegments', this.unallocatedStatorMagnetSegmentModels)
    }

    if (changeOccured && (newNumVirtualStatorMagnetSegments > 0)) {
      let step5 = 1.0 / newNumVirtualStatorMagnetSegments
      staticShortRangeRefFrame.forEach(refFrame => {
        for (let i = 0; i < newNumVirtualStatorMagnetSegments; i++) {
          const positionInFrameOfReference = i * step5
          const zoneIndex = Math.floor(positionInFrameOfReference * refFrame.numZones) % refFrame.numZones
          // For now, all of the rings are the same diameter, so we can get away with using the same models and virtual objects for all of them.
          // In the final design, the rings will likely have slightly different diameters.
          for (let j = 0; j<dParamWithUnits['numMainRings'].value; j++) {
            refFrame.wedges[zoneIndex]['virtualStatorMagnetSegments'].push(new virtualStatorMagnetSegment(positionInFrameOfReference, j, this.unallocatedStatorMagnetSegmentModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualStatorMagnetSegments = newNumVirtualStatorMagnetSegments



    this.refFrames[0].v = dParamWithUnits['transitVehicleCruisingSpeed'].value
    this.refFrames[1].v = dParamWithUnits['transitVehicleCruisingSpeed'].value
    this.refFrames[5].v = dParamWithUnits['movingRingsSpeedForRendering'].value

    this.animateMovingRingSegments = dParamWithUnits['animateMovingRingSegments'].value ? 1 : 0    
    this.animateTransitVehicles = dParamWithUnits['animateTransitVehicles'].value ? 1 : 0
    this.animateElevatorCars = dParamWithUnits['animateElevatorCars'].value ? 1 : 0
    this.perfOptimizedThreeJS = dParamWithUnits['perfOptimizedThreeJS'].value ? 1 : 0

    this.crv = crv

    this.radiusOfPlanet = radiusOfPlanet

    if (genSpecs) {
      // Call the function just to populate the specs structure. This doesn't update the model yet, unfortunately.
      // ToDo: Update the habitat models if its design parameters change
      tram.generateHabitatMeshes(dParamWithUnits, specs, genSpecs)
    }

    if (!this.previousAnimateElevatorCars && dParamWithUnits['animateElevatorCars'].value) {
      this.animateElevatorCarsStartTimeOffset = this.elevatorPosCalc.cycleTime - (timeSinceStart % this.elevatorPosCalc.cycleTime) + this.elevatorPosCalc.cycleTime - 30
    }
    this.previousAnimateElevatorCars = dParamWithUnits['animateElevatorCars'].value
  }

  destroy(dParamWithUnits) {

    // This doesn't actually destroy the objects, but rather hides them and moves them to their unallocated lists.
    const allTracks = [this.refFrames[0], this.refFrames[1], this.refFrames[2], this.refFrames[3]]
    this.removeOldVirtualObjects(allTracks, 'virtualTransitVehicles', this.unallocatedTransitVehicleModels)
    const staticMediumRangeRefFrame = [this.refFrames[4]]
    this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualStationaryRingSegments', this.unallocatedStationaryRingSegmentModels)
    this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualRingTerminuses', this.unallocatedRingTerminusModels)
    this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualHabitats', this.unallocatedHabitatModels)
    this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualElevatorCars', this.unallocatedElevatorCarModels)
    this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualGroundTerminuses', this.unallocatedGroundTerminusModels)
    const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
    const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value
    for (let j = 0; j < ttnut; j++) {
      for (let i = 0; i < ttnot; i++) {
        this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualTransitTrackSegments_' + j + '_' + i, this.unallocatedTransitTrackSegmentModels[j][i])
      }
    }
    this.removeOldVirtualObjects(staticMediumRangeRefFrame, 'virtualSolarArrays', this.unallocatedSolarArrayModels)
    const staticLongRangeRefFrame = [this.refFrames[6]]
    this.removeOldVirtualObjects(staticLongRangeRefFrame, 'virtualElevatorCables', this.unallocatedElevatorCableModels)
    this.removeOldVirtualObjects(staticLongRangeRefFrame, 'virtualTransitTubeSegments', this.unallocatedTransitTubeSegmentModels)
    const movingRingReferenceFrame = [this.refFrames[5]]
    this.removeOldVirtualObjects(movingRingReferenceFrame, 'virtualMovingRingSegments', this.unallocatedMovingRingSegmentModels)
    const staticShortRangeRefFrame = [this.refFrames[7]]
    this.removeOldVirtualObjects(staticShortRangeRefFrame, 'virtualStatorMagnetSegments', this.unallocatedStatorMagnetSegments)
    
    this.numVirtualTransitVehicles = 0
    this.numVirtualRingTerminuses = 0
    this.numVirtualHabitats = 0
    this.numVirtualElevatorCars = 0
    this.numVirtualGroundTerminuses = 0
    this.numVirtualTransitTrackSegments = 0
    this.numVirtualSolarArrays = 0
    this.numVirtualElevatorCables = 0
    this.numVirtualStationaryRingSegments = 0
    this.numVirtualTransitTubeSegments = 0
    this.numVirtualMovingRingSegments = 0

  }

  removeOldVirtualObjects(refFrames, objectName, unallocatedModelsArray) {
    refFrames.forEach(refFrame => {
      for (let zoneIndex = 0; zoneIndex < refFrame.wedges.length; zoneIndex++) {
        if (objectName in refFrame.wedges[zoneIndex]) {
          const wedgeList = refFrame.wedges[zoneIndex][objectName]
          wedgeList.forEach(vobj => {
            if (vobj.model) {
              vobj.model.visible = false
              unallocatedModelsArray.push(vobj.model)
            }
          })
          wedgeList.splice(0, wedgeList.length)
        }
        else {
          console.log('Error: ' + objectName + ' not found in wedge ' + zoneIndex + ' of refFrame ' + refFrame.name)
        }
      }
    })
  }

  animate(timeSinceStart, tetheredRingRefCoordSys, cameraPosition, mainRingCurve, dParamWithUnits) {
    
    let zoneIndex

    while ((this.eventList.length>0) && (this.eventList[0].triggerTime < timeSinceStart)) {
      // Process timer events - these events will mainly cause various virtualTransitVehicles to change from one frame of reference to another

      this.eventList.shift()
    }

    // Update the frames of reference. Frames of reference include: 
    //   1) the traveling at full speed frame, 
    //   2) the making a stop frame, and
    //   3) the making a "delay manuever" frame

    const timePerCompleteRevolution0 = 2 * Math.PI * this.crv.mainRingRadius / this.refFrames[0].v
    this.refFrames[0].p = (this.animateTransitVehicles * timeSinceStart / timePerCompleteRevolution0) % 1
    this.refFrames[1].p = 1 - this.refFrames[0].p

    // The collector lanes require a more sophisticated motion profile... 
    const trackDistance = this.refFrameCalculator.calcTrackPosition(this.animateTransitVehicles * timeSinceStart)
    this.refFrames[2].p = trackDistance
    this.refFrames[3].p = 1 - trackDistance

    const trackSpeed = this.refFrameCalculator.calcTrackSpeed(this.animateTransitVehicles * timeSinceStart)
    this.refFrames[2].v = trackSpeed
    this.refFrames[3].v = -trackSpeed

    this.refFrames[4].p = 0 // Just to emphsize that this is the stationary reference frame...

    const timePerCompleteRevolution6 = 2 * Math.PI * this.crv.mainRingRadius / this.refFrames[5].v
    this.refFrames[5].p = (this.animateMovingRingSegments * timeSinceStart / timePerCompleteRevolution6) % 1 // This is the stationary reference frame 

    // There are time window based lists to indicate which vehicles are due to start manuevering
    // Walk these lists and add any registered vehicles to the list of vehicles executing a manuever.

    // By default, all of the vehicles that are cruising at steady state will advance by the
    // same amount. This is taken care of by incrementing a single constant. Only those vehicles that
    // are executing a manuever (such as stoppoing at a terinus) need to be processed individually


    // Determine if each wedge is visible based on distance from the camera
    // Convert pointOnEarthsSurface into tetheredRingRefCoordSys

    // ToDo : We first need to figure out if the camera is close enough to the ring for there to be any wedges in range...

    //const distanceToCenterOfEarth = cameraPosition.length()
    //const cameraAltitude = distanceToCenterOfEarth - this.radiusOfPlanet
    //let cameraTrackPosition

    // Convert pointOnEarthsSurface into tetheredRingRefCoordSys
    const localCameraLocation = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone())
    // Then compute it's theta value and convert it to a 0 to 1 value 
    // Note: There is an implicate assumption here that mainRingCurve is a circle, so this code will need
    // to be upgraded if we want to implement a non-circular mainRingCurve.
    const nearestTrackPositionToCamera = (Math.atan2(localCameraLocation.z, localCameraLocation.x) / (2*Math.PI) + 1) % 1
    const pointOnRingAtNearestTrackPosition = mainRingCurve.getPoint(nearestTrackPositionToCamera)

    //this.nearestPositionMarker1.position.copy(pointOnRingAtNearestTrackPosition)

    const distanceFromCameraToRing = pointOnRingAtNearestTrackPosition.distanceTo(localCameraLocation)

    // if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
    //   const localPoint = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone()).normalize()
    //   // Then compute it's track position value (as a value from 0.0 to 1.0)...
    //   cameraTrackPosition = (Math.atan2(localPoint.z, localPoint.x) / (2*Math.PI) + 1) % 1
    // }
    // else {
    //   cameraTrackPosition = 0
    // }

    // let transitVehicleShortageCount
    // let ringTerminusShortageCount
    // let groundTerminusShortageCount
    // let elevatorCarShortageCount
    // let habitatShortageCount
    const assignModelList = []
    const removeModelList = []
    const updateModelList = []

    // Late-arriving models from teh loaders trigger a clearing of wedge history.
    // This forces all active wedges to be checked to see if the virtual objects need models to be assigned
    if (this.invalidateWedgeHistory[0]) {
      this.refFrames.forEach(refFrame => {
        refFrame.prevStartWedgeIndex = -1
      })
      this.invalidateWedgeHistory[0] = false
    }

    // First we determine which wedges in each of the reference frames are entering and leaving the proximity of the camera
    this.refFrames.forEach((refFrame, index) => {
      const clearFlagsList = []

      if (distanceFromCameraToRing<=refFrame.cameraRange) {
        // Then figure out starting and finishing wedges for that position
        const cameraRangeDelta = refFrame.cameraRange / (2 * Math.PI * this.crv.mainRingRadius)
        let cameraRangeStartForFrame
        let cameraRangeFinishForFrame
        if (cameraRangeDelta<0.25) {
          const cameraRangeStart = (nearestTrackPositionToCamera - cameraRangeDelta + 1) % 1
          const cameraRangeFinish = (nearestTrackPositionToCamera + cameraRangeDelta + 1) % 1
          cameraRangeStartForFrame = (cameraRangeStart - refFrame.p + 1 ) % 1
          cameraRangeFinishForFrame = (cameraRangeFinish - refFrame.p + 1 ) % 1
          // if (refFrame.name==='staticLongRangeRefFrame') {
          //   const pointOnRingAtNearestTrackPosition2 = mainRingCurve.getPoint(cameraRangeStartForFrame)
          //   const pointOnRingAtNearestTrackPosition3 = mainRingCurve.getPoint(cameraRangeFinishForFrame)
          //   this.nearestPositionMarker2.position.copy(pointOnRingAtNearestTrackPosition2)
          //   this.nearestPositionMarker3.position.copy(pointOnRingAtNearestTrackPosition3)
          // }
        }
        else {
          // Most of the ring is within the range of the camera, so we will just process the whole ring
          cameraRangeStartForFrame = 0
          cameraRangeFinishForFrame = 1
        }

        // Subtract the current rotationalPosition of the reference frame from the cameraRangeStart and cameraRangeFinish values
        refFrame.startWedgeIndex = Math.floor((cameraRangeStartForFrame * (refFrame.numZones-1) + 0.5) % refFrame.numZones)
        refFrame.finishWedgeIndex = Math.floor((cameraRangeFinishForFrame * (refFrame.numZones-1) + 0.5) % refFrame.numZones)
        if ((refFrame.startWedgeIndex<0) || (refFrame.startWedgeIndex>=refFrame.numZones)) {
          console.error('Error: startWedgeIndex is ' + refFrame.startWedgeIndex)
        }
        if ((refFrame.finishWedgeIndex<0) || (refFrame.finishWedgeIndex>=refFrame.numZones)) {
          console.error('Error: finishWedgeIndex is ' + refFrame.finishWedgeIndex)
        }
      }
      else {
        refFrame.startWedgeIndex = -1
        refFrame.finishWedgeIndex = -1
      }
  
      // Set bit0 of actionFlags if wedge is currently visible
      if (refFrame.startWedgeIndex!=-1) {
        for (zoneIndex = refFrame.startWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          this.actionFlags[zoneIndex] |= 1
          clearFlagsList.push(zoneIndex)
          if (zoneIndex===refFrame.finishWedgeIndex) break
        }
      }
      // Set bit1 of actionFlags if wedge was previously visible
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (zoneIndex = refFrame.prevStartWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          this.actionFlags[zoneIndex] |= 2
          clearFlagsList.push(zoneIndex)
          if (zoneIndex===refFrame.prevFinishWedgeIndex) break
        }
      }

      if (refFrame.startWedgeIndex<-1) {
        console.log('Error: startWedgeIndex is ' + refFrame.startWedgeIndex)
      }
      if (refFrame.startWedgeIndex!=-1) {
        for (zoneIndex = refFrame.startWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          if (this.actionFlags[zoneIndex] & 1 == 1) {
            const wedgeCenterLocation = mainRingCurve.getPoint( ((refFrame.p + (zoneIndex + 0.5) / refFrame.numZones)) % 1 )
            const wedgeToCameraDistance = wedgeCenterLocation.distanceTo(localCameraLocation)
            // Wedge is currently visible, assign it the updateModel list
            updateModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex, 'wedgeToCameraDistance': wedgeToCameraDistance})
            if (this.actionFlags[zoneIndex]==1) {
                // Wedge wasn't visible before and it became visible, assign it the assignModel list
                assignModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex, 'wedgeToCameraDistance': wedgeToCameraDistance})
            }
          }
          if (zoneIndex===refFrame.finishWedgeIndex) break
        }
      }
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (zoneIndex = refFrame.prevStartWedgeIndex; ; zoneIndex = (zoneIndex + 1) % refFrame.numZones) {
          if (this.actionFlags[zoneIndex]==2) {
            // Wedge was visible before and it became invisible, add it to the removeModel list
            removeModelList.push({'refFrame': refFrame, 'zoneIndex': zoneIndex})
          }
          if (zoneIndex===refFrame.prevFinishWedgeIndex) break
        }
      }
      
      refFrame.prevStartWedgeIndex = refFrame.startWedgeIndex
      refFrame.prevFinishWedgeIndex = refFrame.finishWedgeIndex

      clearFlagsList.forEach(zoneIndex => {
        this.actionFlags[zoneIndex] = 0  // Clear the action flags to ready them for future reuse
      })
  
    })
    if (removeModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedGroundTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedStationaryRingSegmentModels.length,
      //   this.unallocatedMovingRingSegmentModels.length,
      //   this.unallocatedTransitTubeSegmentModels.length,
      // const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
      // const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value
      // for (let j = 0; j < ttnut; j++) {
      //   for (let i = 0; i < ttnot; i++) {
      //     this.unallocatedTransitTrackSegmentModels[j][i].length
      //   }
      // }
      //   this.unallocatedSolarArrayModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
      //console.log('Removing ' + removeModelList.length)
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedGroundTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedStationaryRingSegmentModels.length,
      //   this.unallocatedMovingRingSegmentModels.length,
      //   this.unallocatedTransitTubeSegmentModels.length,
      // const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
      // const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value
      // for (let j = 0; j < ttnut; j++) {
      //   for (let i = 0; i < ttnot; i++) {
      //     this.unallocatedTransitTrackSegmentModels[j][i].length
      //   }
      // }
      //   this.unallocatedSolarArrayModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
      //console.log('Adding ' + assignModelList.length)
    }

    // Free models that are in wedges that have recently left the region near the camera
    removeModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([objectKey, objectValue]) => {
        objectValue.forEach(object => {
          if (object.model) {
            object.model.visible = false
            object.unallocatedModels.push(object.model)
            object.model = null
          }
        })
      })
    })

    // Calcuate some constants that we will use later... 

    // All elevators are will be at the same height for now...
    const elevatorAltitude = this.elevatorPosCalc.calculateElevatorPosition(this.animateElevatorCars * (timeSinceStart + this.animateElevatorCarsStartTimeOffset))
    // Hack
    //const elevatorAltitude = this.crv.currentMainRingAltitude // this.elevatorPosCalc.calculateElevatorPosition(this.animateElevatorCars * timeSinceStart)
    virtualElevatorCar.animate(elevatorAltitude, this.crv)
    virtualElevatorCable.animate(elevatorAltitude, this.crv)

    // Assign models to virtual objects that have just entered the region near the camera
    assignModelList.forEach(entry => {
      const wedgeToCameraDistance = entry['wedgeToCameraDistance']
      const ranOutOfModelsInfo = {}
      if (!entry['refFrame'].wedges[entry['zoneIndex']]) {
        console.error('Error: entry[\'refFrame\'].wedges[entry[\'zoneIndex\']]===null')
      }
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([objectKey, objectValue]) => {
        if (objectValue.length>0) {
          objectValue.forEach(object => {
            if (!object.model) {
              if (object.unallocatedModels.length==1) {
                // This is the last model. Duplicate it so that we don't run out.
                const tempModel = object.unallocatedModels[0].clone()
                object.unallocatedModels.push(tempModel)
                // if (objectKey==='virtualStatorMagnetSegments') {
                //   console.log('Duplicating model for ' + objectKey)
                // }
              }
              if (object.unallocatedModels.length>0) {
                object.model = object.unallocatedModels.pop()
                object.model.visible = object.isVisible
                this.scene.add(object.model)
              }
              else {
                if (objectKey in ranOutOfModelsInfo) {
                  ranOutOfModelsInfo[objectKey]++
                }
                else {
                  ranOutOfModelsInfo[objectKey] = 1
                }
              }
            }
          })
          const classIsDynamic = objectValue[0].constructor.isDynamic
          const classHasChanged = objectValue[0].constructor.hasChanged
          if (!classIsDynamic && !classHasChanged) {
            // Static object so we will place the model (just once) at the same time we assign it to a virtual object
            objectValue.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, entry['refFrame'], wedgeToCameraDistance)
              }
            })
          }
        }
      })
      let allGood = true
      Object.entries(ranOutOfModelsInfo).forEach(([k, v]) => {
        if (v>0) {
          console.log('Ran out of ' + k + ' models (needed ' + v + ' more)')
          allGood = false
        }
      })
      if (!allGood) {
        console.log('Problem Assigning Models')
      }
      else {
        // Success!! We can remove this entry from the list now
        //assignModelList.splice(index, 1)
      }
    })
    // Now adjust the models position and rotation in all of the active wedges
    // transitVehicleShortageCount = 0
    // ringTerminusShortageCount = 0
    // groundTerminusShortageCount = 0
    // elevatorCarShortageCount = 0
    // habitatShortageCount = 0

    updateModelList.forEach(entry => {
      const wedgeToCameraDistance = entry['wedgeToCameraDistance']
      Object.entries(entry['refFrame'].wedges[entry['zoneIndex']]).forEach(([objectKey, objectValue]) => {
        if (objectValue.length>0) {
          const classIsDynamic = objectValue[0].constructor.isDynamic
          const classHasChanged = objectValue[0].constructor.hasChanged
          if (classIsDynamic || classHasChanged) {
            // Call the placement method for each active instance (unless the model class is static and unchanged)
            objectValue.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, entry['refFrame'], wedgeToCameraDistance)
              }
            })
          }
        }
      })
    })

    if (removeModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedGroundTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedStationaryRingSegmentModels.length,
      //   this.unallocatedMovingRingSegmentModels.length,
      //   this.unallocatedTransitTubeSegmentModels.length,
      // const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
      // const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value
      // for (let j = 0; j < ttnut; j++) {
      //   for (let i = 0; i < ttnot; i++) {
      //     this.unallocatedTransitTrackSegmentModels[j][i].length
      //   }
      // }
      //   this.unallocatedSolarArrayModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
    }
    if (assignModelList.length > 0) {
      // console.log(
      //   //this.unallocatedTransitVehicleModels.length,
      //   this.unallocatedRingTerminusModels.length,
      //   this.unallocatedGroundTerminusModels.length,
      //   this.unallocatedElevatorCarModels.length,
      //   this.unallocatedHabitatModels.length,
      //   this.unallocatedStationaryRingSegmentModels.length,
      //   this.unallocatedMovingRingSegmentModels.length,
      //   this.unallocatedTransitTubeSegmentModels.length,
      // const ttnut = dParamWithUnits['transitTracksNumUpwardTracks'].value
      // const ttnot = dParamWithUnits['transitTracksNumOutwardTracks'].value
      // for (let j = 0; j < ttnut; j++) {
      //   for (let i = 0; i < ttnot; i++) {
      //     this.unallocatedTransitTrackSegmentModels[j][i].length
      //   }
      // }
      //   this.unallocatedSolarArrayModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
    }

    // Clear all of the "hasChanged" flags
    virtualTransitVehicle.hasChanged = false
    virtualRingTerminus.hasChanged = false
    virtualGroundTerminus.hasChanged = false
    virtualHabitat.hasChanged = false
    virtualElevatorCable.hasChanged = false
    virtualElevatorCar.hasChanged = false
    virtualStationaryRingSegment.hasChanged = false
    virtualMovingRingSegment.hasChanged = false
    virtualTransitTubeSegment.hasChanged = false
    virtualTransitTrackSegment.hasChanged = false
    //dynamicallyManagedObject.hasChanged = false
    virtualSolarArray.hasChanged = false
    
    // Debug stuff...
    // console.log(ringTerminusModels)
    // if (transitVehicleShortageCount>0) {
    //   console.log('transitVehicleShortageCount was ' + transitVehicleShortageCount)
    // }
    // // console.log("vehicles unallocated: " + this.unallocatedTransitVehicleModels.length)
    // if (removeModelList.length) {
    //   console.log("removing " + removeModelList.length + " wedge")
    // }
    // if (assignModelList.length) {
    //   console.log("assigning " + assignModelList.length + " wedge")
    // }
    
  }

}
