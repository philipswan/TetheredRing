import * as THREE from 'three'

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { referenceFrame } from './ReferenceFrame.js'
import { virtualSolarArray } from './SolarArray.js'
import { virtualTransitTubeSegment } from './TransitTubeSegment.js'
import { virtualTransitVehicle } from './TransitVehicle.js'
import { virtualRingTerminus } from './RingTerminus.js'
import { virtualGroundTerminus } from './GroundTerminus.js'
import { virtualElevatorCar } from './ElevatorCar.js'
import { virtualHabitat } from './Habitat.js'
import { virtualStationaryRingSegment } from './StationaryRingSegment.js'
import { virtualMovingRingSegment } from './MovingRingSegment.js'
import { virtualElevatorCable } from './ElevatorCable.js'

// C:\Users\phils\Documents\repos\Three.js\TetheredRing\node_modules\three\examples\jsm\loaders
//import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
//import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/GLTFLoader.js'
//import { FBXLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/FBXLoader.js'

import * as tram from './tram.js'
import { dynamicallyManagedObject } from './dynamicallyManagedObject.js'
import { remove } from 'lodash'

export class transitSystem {

  // A transit vehicle system comprises four moving frames of refernence and each is divided into "numWedges" sections,
  // called "wedges". A large number of "virtual" transit vehicles are created and each is placed inside one wedge 
  // within one of the frames of reference. The frames-of-reference rotate. When a wedge enters the proximity of the camera,
  // the virtual vehicles in that wedge are allocated models of transit vehicles from a pool. Allocated models will be
  // made visible, positioned in the scene, and rendered. When a wedge leaves the proximity of the camera, its models
  // are retured to the pool. Virtual vehicles will also respond to timer events. These events will cause them to 
  // occassionally hop between two frames of reference.

  constructor(scene, dParamWithUnits, specs, genSpecs, trackOffsetsList, crv, ecv, radiusOfPlanet, mainRingCurve) {

    this.scene = scene
    this.unallocatedTransitVehicleModels = []
    this.unallocatedRingTerminusModels = []
    this.unallocatedGroundTerminusModels = []
    this.unallocatedElevatorCarModels = []
    this.unallocatedHabitatModels = []
    this.unallocatedStationaryRingSegmentModels = []
    this.unallocatedMovingRingSegmentModels = []
    this.unallocatedTransitTubeSegmentModels = []
    this.unallocatedDynamicallyManagedObjects = []
    this.unallocatedSolarArrayModels = []
    this.unallocatedElevatorCableModels = []
    this.numWedges = 1024
    this.actionFlags = new Array(this.numWedges).fill(0)
    this.perfOptimizedThreeJS = dParamWithUnits['perfOptimizedThreeJS'].value ? 1 : 0
    //const massDriverLength = dParamWithUnits['massDriverLength'].value
    this.ringSouthernMostPosition = 3/4 // Hack
    
    // Debug - ToDo clean this up when it's no longer needed

    // Creates a pool of transit vehicle models. Some these will be assigned to "virtual vehicles" that are within range of the camera.
    // The rest will be made invisible
    const v1 = dParamWithUnits['transitVehicleCruisingSpeed'].value
    const v3 = dParamWithUnits['movingRingsSpeedForRendering'].value

    this.refFrames = []

    // For vehicles cruising at a steady speed...
    const rf0 = new referenceFrame(mainRingCurve, this.numWedges, v1, 1, 1, 'transitVehiclesExpressClockwise')
    rf0.addVirtualObject('virtualTransitVehicles')
    rf0.initialize()
    this.refFrames.push(rf0)

    const rf1 = new referenceFrame(mainRingCurve, this.numWedges, v1, -1, 3, 'transitVehiclesExpressCounterClockwise')
    rf1.addVirtualObject('virtualTransitVehicles')
    rf1.initialize()
    this.refFrames.push(rf1)

    // For vehicles making stops at ringTerminuses...
    const rf2 = new referenceFrame(mainRingCurve, this.numWedges, v1, 1, 0, 'transitVehiclesCollectorClockwise')
    rf2.addVirtualObject('virtualTransitVehicles')
    rf2.initialize()
    this.refFrames.push(rf2)

    const rf3 = new referenceFrame(mainRingCurve, this.numWedges, v1, -1, 2, 'transitVehiclesCollectorCounterClockwise')
    rf3.addVirtualObject('virtualTransitVehicles')
    rf3.initialize()
    this.refFrames.push(rf3)

    // Static reference frame
    const rf4 = new referenceFrame(mainRingCurve, this.numWedges, 0, 1, 1, 'staticReferenceFrame')
    rf4.addVirtualObject('virtualRingTerminuses')
    rf4.addVirtualObject('virtualGroundTerminuses')
    rf4.addVirtualObject('virtualHabitats')
    rf4.addVirtualObject('virtualElevatorCars')
    rf4.addVirtualObject('virtualStationaryRingSegments')
    rf4.addVirtualObject('virtualTransitTubeSegments')
    rf4.addVirtualObject('virtualSolarArrays')
    rf4.addVirtualObject('virtualElevatorCables')
    rf4.addVirtualObject('dynamicallyManagedObjects')
    rf4.initialize()
    this.refFrames.push(rf4)

    // For Moving Rings
    const rf5 = new referenceFrame(mainRingCurve, this.numWedges, v3, -1, 0, 'movingRings')
    rf5.addVirtualObject('virtualMovingRingSegments')
    rf5.initialize()
    this.refFrames.push(rf5)

    // Static reference frame with much greater camera range
    const rf6 = new referenceFrame(mainRingCurve, this.numWedges, 0, 1, 1, 'staticReferenceFrameBigCameraRange')
    //rf6.addVirtualObject('virtualMovingRingSegments')
    rf6.initialize()
    this.refFrames.push(rf6)

    this.eventList = []

    this.numVirtualTransitVehicles = 0
    this.numVirtualHabitats = 0
    this.numVirtualRingTerminuses = 0
    this.numVirtualGroundTerminuses = 0
    this.numVirtualElevatorCables = 0
    this.numVirtualElevatorCars = 0
    this.numVirtualSolarArrays = 0
    this.numVirtualTransitTubeSegments = 0
    this.numVirtualStationaryRingSegments = 0
    this.numVirtualMovingRingSegments = 0

    function prepareACallbackFunctionForGLTFLoader(myScene, myList, objName, scale_Factor, n, perfOptimizedThreeJS) {
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
      } 
    }

    function prepareACallbackFunctionForFBXLoader(myScene, myList, objName, scaleFactor, n, perfOptimizedThreeJS) {
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
          myScene.add(tempModel)
          myList.push(tempModel)
        }
      }
    }

    const addTransitVehicles = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedTransitVehicleModels, 'transitVehicle', 1, dParamWithUnits['transitVehicleNumModels'].value, this.perfOptimizedThreeJS)
    const addRingTerminuses = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedRingTerminusModels, 'ringTerminus', 1.25, dParamWithUnits['ringTerminusNumModels'].value, this.perfOptimizedThreeJS)
    const addGroundTerminuses = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedGroundTerminusModels, 'groundTerminus', 1.25, dParamWithUnits['groundTerminusNumModels'].value, this.perfOptimizedThreeJS)
    //const addGroundTerminuses = prepareACallbackFunctionForGLTFLoader(this.scene, this.unallocatedGroundTerminusModels, 'groundTerminus', 1.25, dParamWithUnits['groundTerminusNumModels'].value, this.perfOptimizedThreeJS)
    const addElevatorCars = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedElevatorCarModels,'elevatorCar', 1.04, dParamWithUnits['elevatorCarNumModels'].value, this.perfOptimizedThreeJS)
    //const addElevatorCars = prepareACallbackFunctionForGLTFLoader(this.scene, this.unallocatedElevatorCarModels,'elevatorCar', 1.04, dParamWithUnits['elevatorCarNumModels'].value, this.perfOptimizedThreeJS)
    const addHabitats = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedHabitatModels, 'habitat', 1.25, dParamWithUnits['habitatNumModels'].value, this.perfOptimizedThreeJS)
    const addStationaryRingSegments = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedStationaryRingSegmentModels, 'stationaryRing', 1, dParamWithUnits['stationaryRingNumModels'].value, this.perfOptimizedThreeJS)
    const addMovingRingSegments = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedMovingRingSegmentModels, 'movingRing', 1, dParamWithUnits['movingRingNumModels'].value, this.perfOptimizedThreeJS)
    const addTransitTubes = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedTransitTubeSegmentModels, 'transitTube', 1, dParamWithUnits['transitTubeNumModels'].value, this.perfOptimizedThreeJS)
    const addSolarArrays = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedSolarArrayModels, 'solarArray', 1, dParamWithUnits['numVirtualSolarArrays'].value, this.perfOptimizedThreeJS)
    const addDynamicallyManagedObjects = prepareACallbackFunctionForFBXLoader(this.scene, this.unallocatedDynamicallyManagedObjects, 'dynamicallyManagedObject', 1, dParamWithUnits['dynamicallyManagedObjectNumModels'].value, this.perfOptimizedThreeJS)
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
    console.log('Loading TransitCar.fbx')
    fbxloader.load('models/TransitCar.fbx', addTransitVehicles, progressFunction, errorFunction )
    console.log('Loading RingTerminus.fbx')
    fbxloader.load('models/RingTerminus.fbx', addRingTerminuses, progressFunction, errorFunction )
    console.log('Loading GroundTerminus.fbx')
    fbxloader.load('models/GroundTerminus.fbx', addGroundTerminuses, progressFunction, errorFunction )
    //gltfloader.load('models/GroundTerminus.gltf', addGroundTerminuses, progressFunction, errorFunction )
    fbxloader.load('models/RingTerminus.fbx', addHabitats, progressFunction, errorFunction )  // This is hacky - borrowed RingTerminus model and modified it to make a habitat
    console.log('Loading Elevator.fbx')
    fbxloader.load('models/Elevator.fbx', addElevatorCars, progressFunction, errorFunction )
    //gltfloader.load('models/Elevator.gltf', addElevatorCars, progressFunction, errorFunction )

    // Manually create the stationary rings
    const nt = dParamWithUnits['numVirtualRingTerminuses'].value
    const nh = dParamWithUnits['numVirtualHabitats'].value
    const numTransitStops = nt + nh

    function getStationaryRingSegmentCurve() {
      const lengthSegments = 4
      const segmentNumber = 0
      const totalSegments = numTransitStops
      return tram.makeOffsetCurve(dParamWithUnits['mainRingOutwardOffset'].value, dParamWithUnits['mainRingUpwardOffset'].value, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    // Need to use numMainRings
    lengthSegments = 4
    radius = dParamWithUnits['stationaryRingTubeRadius'].value
    radialSegments = 32
    const stationaryRingGeometry = new THREE.TubeGeometry(getStationaryRingSegmentCurve(), lengthSegments, radius, radialSegments, false)
    const stationaryRingMaterial = new THREE.MeshPhongMaterial( {transparent: true, opacity: 0.9})
    const stationaryRingMesh = new THREE.Mesh(stationaryRingGeometry, stationaryRingMaterial)
    addStationaryRingSegments(stationaryRingMesh)

    // Manually create the moving rings
    function getMovingRingSegmentCurve() {
      const lengthSegments = 4
      const segmentNumber = 0
      const totalSegments = numTransitStops
      return tram.makeOffsetCurve(dParamWithUnits['mainRingOutwardOffset'].value, dParamWithUnits['mainRingUpwardOffset'].value, crv, lengthSegments, mainRingCurve, segmentNumber, totalSegments)
    }

    // Need to use numMainRings
    lengthSegments = 4
    radius = dParamWithUnits['movingRingTubeRadius'].value
    radialSegments = 32
    const movingRingGeometry = new THREE.TubeGeometry(getMovingRingSegmentCurve(), lengthSegments, radius, radialSegments, false)
    const movingRingTexture = new THREE.TextureLoader().load( './textures/movingRingTexture.jpg' )
    const movingRingMaterial = new THREE.MeshPhongMaterial( {transparent: false, shininess: 10, map: movingRingTexture})
    const movingRingMesh = new THREE.Mesh(movingRingGeometry, movingRingMaterial)
    addMovingRingSegments(movingRingMesh)

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
    const transitTubeMaterial = new THREE.MeshPhongMaterial( {transparent: true, opacity: 0.25})
    const transitTubeMesh = new THREE.Mesh(transitTubeGeometry, transitTubeMaterial)
    addTransitTubes(transitTubeMesh)

    fbxloader.load('models/Elevator.fbx', addDynamicallyManagedObjects, progressFunction, errorFunction )
    
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

    const pointSet = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]
    const cableMaterial = new THREE.LineBasicMaterial({
      vertexColors: false,
      //color: 0x4897f8,
      transparent: true,
      opacity: dParamWithUnits['cableVisibility'].value
    })
    const elevatorCableModel = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pointSet), cableMaterial)
    elevatorCableModel.visible = false
    elevatorCableModel.name = 'elevatorCable'
    for (let i = 0; i<dParamWithUnits['numElevatorCableModels'].value; i++) {
      const tempModel = elevatorCableModel.clone()
      this.unallocatedElevatorCableModels.push(tempModel)
      this.scene.add(tempModel)
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
    this.update(dParamWithUnits, specs, genSpecs, trackOffsetsList, crv, radiusOfPlanet, mainRingCurve)
  }

  update(dParamWithUnits, specs, genSpecs, trackOffsetsList, crv, radiusOfPlanet, mainRingCurve, timeSinceStart) {

    virtualTransitVehicle.update(dParamWithUnits, trackOffsetsList, crv, mainRingCurve)
    virtualRingTerminus.update(dParamWithUnits, crv, mainRingCurve)
    virtualGroundTerminus.update(dParamWithUnits, crv, mainRingCurve)
    virtualElevatorCar.update(dParamWithUnits, crv, mainRingCurve)
    virtualHabitat.update(dParamWithUnits, crv, mainRingCurve)
    virtualStationaryRingSegment.update(dParamWithUnits, crv, mainRingCurve)
    virtualMovingRingSegment.update(dParamWithUnits, crv, mainRingCurve)
    virtualTransitTubeSegment.update(dParamWithUnits, crv, mainRingCurve)
    virtualSolarArray.update(dParamWithUnits, crv, mainRingCurve)
    virtualElevatorCable.update(dParamWithUnits, crv, mainRingCurve)
    dynamicallyManagedObject.update(dParamWithUnits, crv, mainRingCurve)
 
    function removeOldVirtualObjects(refFrames, objectName, unallocatedModelsArray) {
      refFrames.forEach(refFrame => {
        for (let wedgeIndex = 0; wedgeIndex < refFrame.wedges.length; wedgeIndex++) {
          if (objectName in refFrame.wedges[wedgeIndex]) {
            const wedgeList = refFrame.wedges[wedgeIndex][objectName]
            wedgeList.forEach(vobj => {
              if (vobj.model) {
                vobj.model.visible = false
                unallocatedModelsArray.push(vobj.model)
              }
            })
            wedgeList.splice(0, wedgeList.length)
          }
          else {
            console.log('Error: ' + objectName + ' not found in wedge ' + wedgeIndex + ' of refFrame ' + refFrame.name)
          }
        }
      })
    }

    // Update the number of transit vehicles
    const newNumVirtualTransitVehicles = dParamWithUnits['showTransitVehicles'].value ? dParamWithUnits['numVirtualTransitVehicles'].value : 0
    // Remove old virtual transit vehicles
    const allTracks = [this.refFrames[0], this.refFrames[1], this.refFrames[2], this.refFrames[3]]
    let changeOccured = (this.numVirtualTransitVehicles != newNumVirtualTransitVehicles)
    if (changeOccured && (this.numVirtualTransitVehicles > 0)) {
      removeOldVirtualObjects(allTracks, 'virtualTransitVehicles', this.unallocatedTransitVehicleModels)
    }

    // Add new virtual transit vehicles
    const outerTracks = [this.refFrames[0], this.refFrames[1]]
    const innerTracks = [this.refFrames[2], this.refFrames[3]]

    if (changeOccured && (newNumVirtualTransitVehicles > 0)) {
      // Add new virtual transit vehicles to express lane tracks
      const n1 = newNumVirtualTransitVehicles * 10 / 40
      const step1 = 1.0 / n1
      outerTracks.forEach(refFrame => {
        for (let i = 0; i < n1; i++) {
          const positionInFrameOfReference = i * step1
          const randomizedPositionInFrameOfReference = positionInFrameOfReference + (step1 * 0.8 * Math.random())
          const wedgeIndex = Math.floor(randomizedPositionInFrameOfReference * this.numWedges) % this.numWedges
          refFrame.wedges[wedgeIndex]['virtualTransitVehicles'].push(new virtualTransitVehicle(randomizedPositionInFrameOfReference, this.unallocatedTransitVehicleModels))
        }
        refFrame.prevStartWedgeIndex = -1
      })

      // Add new virtual transit vehicles to collector lane tracks
      const n2 = newNumVirtualTransitVehicles * 10 / 40
      const step2 = 1.0 / n2
      innerTracks.forEach(refFrame => {
        for (let i = 0; i < n2; i++) {
          const positionInFrameOfReference = i * step2
          const randomizedPositionInFrameOfReference = positionInFrameOfReference + (step2 * 0.8 * Math.random())
          const wedgeIndex = Math.floor(randomizedPositionInFrameOfReference * this.numWedges) % this.numWedges
          refFrame.wedges[wedgeIndex]['virtualTransitVehicles'].push(new virtualTransitVehicle(randomizedPositionInFrameOfReference, this.unallocatedTransitVehicleModels))
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualTransitVehicles = newNumVirtualTransitVehicles

    // Update virtual objects residing in the static reference frame
    const staticRefFrame = [this.refFrames[4]]

    // Facilities (habitats, terminuses, elevator cables, elevator cars)
    const nt = dParamWithUnits['numVirtualRingTerminuses'].value
    const nh = dParamWithUnits['numVirtualHabitats'].value
    const numTransitStops = nt + nh

    // Since habitats and terminuses are interspersed, changing either causes a major teardown of not only
    // habitatis and ring terminuses, but also elevator cables, cars, and ground terminuses
    const showRingTerminuses = dParamWithUnits['showRingTerminuses'].value
    const showHabitats = dParamWithUnits['showHabitats'].value
    const showElevatorCables = dParamWithUnits['showElevatorCables'].value
    const showElevatorCars = dParamWithUnits['showElevatorCars'].value
    const showGroundTerminuses = dParamWithUnits['showGroundTerminuses'].value

    const newNumVirtualRingTerminuses = showRingTerminuses ? dParamWithUnits['numVirtualRingTerminuses'].value : 0
    const newNumVirtualHabitats = showHabitats ? dParamWithUnits['numVirtualHabitats'].value : 0
    const newNumVirtualElevatorCables = showElevatorCables ? dParamWithUnits['numVirtualRingTerminuses'].value : 0
    const newNumVirtualElevatorCars = showElevatorCars ? dParamWithUnits['numVirtualRingTerminuses'].value : 0
    const newNumVirtualGroundTerminuses = showGroundTerminuses ? dParamWithUnits['numVirtualRingTerminuses'].value : 0

    // If a needed, remove all of the existing virtual facilities
    changeOccured = (this.numVirtualRingTerminuses != newNumVirtualRingTerminuses) || 
                    (this.numVirtualHabitats != newNumVirtualHabitats) ||
                    (this.numVirtualElevatorCables != newNumVirtualElevatorCables) || 
                    (this.numVirtualElevatorCars != newNumVirtualElevatorCars) || 
                    (this.numVirtualGroundTerminuses != newNumVirtualGroundTerminuses)
    if (changeOccured && (this.numVirtualRingTerminuses > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualRingTerminuses', this.unallocatedRingTerminusModels)
    }
    if (changeOccured && (this.numVirtualHabitats > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualHabitats', this.unallocatedHabitatModels)
    }
    if (changeOccured && (this.numVirtualElevatorCables > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualElevatorCables', this.unallocatedElevatorCableModels)
    }
    if (changeOccured && (this.numVirtualElevatorCars > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualElevatorCars', this.unallocatedElevatorCarModels)
    }
    if (changeOccured && (this.numVirtualGroundTerminuses > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualGroundTerminuses', this.unallocatedGroundTerminusModels)
    }

    // Add new facilities
    if (changeOccured) {
      // Place static reference frame objects such as ringTerminuses, elevatorCars, habitats, transit tubes, launch tubes, main rings, etc...
      let step3 = 1.0 / numTransitStops
      let prevFloorS = -1
      staticRefFrame.forEach(refFrame => {
        for (let i = 0; i < numTransitStops; i++) {
          const positionInFrameOfReference = i * step3
          const wedgeIndex = Math.floor(positionInFrameOfReference * this.numWedges) % this.numWedges
          const currFloorS = Math.floor(i * nt / numTransitStops)
          if (currFloorS == prevFloorS) {
            if (showHabitats) refFrame.wedges[wedgeIndex]['virtualHabitats'].push(new virtualHabitat(positionInFrameOfReference, this.unallocatedHabitatModels))
          }
          else {
            if (showRingTerminuses) refFrame.wedges[wedgeIndex]['virtualRingTerminuses'].push(new virtualRingTerminus(positionInFrameOfReference, this.unallocatedRingTerminusModels))
            if (showGroundTerminuses) refFrame.wedges[wedgeIndex]['virtualGroundTerminuses'].push(new virtualGroundTerminus(positionInFrameOfReference, this.unallocatedGroundTerminusModels))
            if (showElevatorCars) refFrame.wedges[wedgeIndex]['virtualElevatorCars'].push(new virtualElevatorCar(positionInFrameOfReference, this.unallocatedElevatorCarModels))
            //if (showElevatorCables) refFrame.wedges[wedgeIndex]['virtualElevatorCables'].push(new virtualElevatorCable(positionInFrameOfReference, this.unallocatedElevatorCableModels))
          }
          prevFloorS = currFloorS
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualRingTerminuses = newNumVirtualRingTerminuses
    this.numVirtualHabitats = newNumVirtualHabitats
    this.numVirtualElevatorCables = newNumVirtualElevatorCables
    this.numVirtualElevatorCars = newNumVirtualElevatorCars
    this.numVirtualGroundTerminuses = newNumVirtualGroundTerminuses
    
    // Transit Tube Segments
    const newNumVirtualTransitTubeSegments = dParamWithUnits['showTransitTube'].value ? numTransitStops : 0
    changeOccured = (this.numVirtualTransitTubeSegments != newNumVirtualTransitTubeSegments)


    if (changeOccured && (this.numVirtualTransitTubeSegments > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualTransitTubeSegments', this.unallocatedTransitTubeSegmentModels)
    }

    if (changeOccured && (newNumVirtualTransitTubeSegments > 0)) {
      const nt = dParamWithUnits['numVirtualRingTerminuses'].value
      const nh = dParamWithUnits['numVirtualHabitats'].value
      const numTransitStops = nt + nh
      let step3 = 1.0 / numTransitStops

      staticRefFrame.forEach(refFrame => {
        for (let i = 0; i < numTransitStops; i++) {
          const positionInFrameOfReference = i * step3
          const wedgeIndex = Math.floor(positionInFrameOfReference * this.numWedges) % this.numWedges
          for (let j = 0; j<dParamWithUnits['numMainRings2'].value; j++) {
            refFrame.wedges[wedgeIndex]['virtualTransitTubeSegments'].push(new virtualTransitTubeSegment(positionInFrameOfReference, this.unallocatedTransitTubeSegmentModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualTransitTubeSegments = newNumVirtualTransitTubeSegments
  
    // Stationary Ring Segments
    const newNumVirtualStationaryRingSegments = dParamWithUnits['showStationaryRings'].value ? dParamWithUnits['numVirtualStationaryRingSegments'].value : 0
    changeOccured = (this.numStationaryRingSegments != newNumVirtualStationaryRingSegments)

    if (changeOccured && (this.numVirtualStationaryRingSegments > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualStationaryRingSegments', this.unallocatedStationaryRingSegmentModels)
      // ToDo: We need to remove the models as well, because the length of the model depends on the number of virtual ring segments
    }

    if (changeOccured && (newNumVirtualStationaryRingSegments > 0)) {
      const nsr = newNumVirtualStationaryRingSegments
      let step4 = 1.0 / nsr

      staticRefFrame.forEach(refFrame => {
        for (let i = 0; i < nsr; i++) {
          const positionInFrameOfReference = i * step4
          const wedgeIndex = Math.floor(positionInFrameOfReference * this.numWedges) % this.numWedges
          for (let j = 0; j<dParamWithUnits['numMainRings2'].value; j++) {
            refFrame.wedges[wedgeIndex]['virtualStationaryRingSegments'].push(new virtualStationaryRingSegment(positionInFrameOfReference, j, this.unallocatedStationaryRingSegmentModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
      // ToDo: We will need to recreate the models as well, if the number of virtual ring segments has changed.
    }
    this.numVirtualStationaryRingSegments = newNumVirtualStationaryRingSegments

    // Solar Arrays
    const newNumVirtualSolarArrays = dParamWithUnits['showSolarArrays'].value ? dParamWithUnits['numVirtualSolarArrays'].value : 0
    changeOccured = (this.numVirtualSolarArrays != newNumVirtualSolarArrays)

    if (changeOccured && (this.numVirtualSolarArrays > 0)) {
      removeOldVirtualObjects(staticRefFrame, 'virtualSolarArrays', this.unallocatedSolarArrayModels)
    }

    if (changeOccured && (newNumVirtualSolarArrays > 0)) {
      const nsa = dParamWithUnits['numVirtualSolarArrays'].value
      let step4 = 1.0 / nsa

      staticRefFrame.forEach(refFrame => {
        if (dParamWithUnits['showSolarArrays'].value) {
          for (let i = 0; i < nsa; i++) {
            const positionInFrameOfReference = i * step4
            const wedgeIndex = Math.floor(positionInFrameOfReference * this.numWedges) % this.numWedges
            refFrame.wedges[wedgeIndex]['virtualSolarArrays'].push(new virtualSolarArray(positionInFrameOfReference, this.unallocatedSolarArrayModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
    }
    this.numVirtualSolarArrays = newNumVirtualSolarArrays

    // Moving Rings' frame of reference
    const movingRingReferenceFrame = [this.refFrames[5]]

    // Moving Ring Segments
    const newNumVirtualMovingRingSegments = dParamWithUnits['showMovingRings'].value ? dParamWithUnits['numVirtualMovingRingSegments'].value : 0
    changeOccured = (this.numVirtualMovingRingSegments != newNumVirtualMovingRingSegments)

    if (changeOccured && (this.numVirtualMovingRingSegments > 0)) {
      removeOldVirtualObjects(movingRingReferenceFrame, 'virtualMovingRingSegments', this.unallocatedMovingRingSegmentModels)
      // ToDo: We need to remove the models as well, because the length of the model depends on the number of virtual ring segments
    }

    if (changeOccured && (newNumVirtualMovingRingSegments > 0)) {
      let step5 = 1.0 / newNumVirtualMovingRingSegments
      movingRingReferenceFrame.forEach(refFrame => {
        for (let i = 0; i < newNumVirtualMovingRingSegments; i++) {
          const positionInFrameOfReference = i * step5
          const wedgeIndex = Math.floor(positionInFrameOfReference * this.numWedges) % this.numWedges
          // For now, all of the rings are the same diameter, so we can get away with using the same models and virtual objects for all of them.
          // In the final design, the rings will likely have slightly different diameters.
          for (let j = 0; j<dParamWithUnits['numMainRings2'].value; j++) {
            refFrame.wedges[wedgeIndex]['virtualMovingRingSegments'].push(new virtualMovingRingSegment(positionInFrameOfReference, j, this.unallocatedMovingRingSegmentModels))
          }
        }
        refFrame.prevStartWedgeIndex = -1
      })
      // ToDo: We will need to recreate the models as well, if the number of virtual ring segments has changed.
    }
    this.numVirtualMovingRingSegments = newNumVirtualMovingRingSegments

    // Still to do...
    // Elevator Cars


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

  animate(timeSinceStart, tetheredRingRefCoordSys, cameraPosition, mainRingCurve, dParamWithUnits) {
    
    let wedgeIndex

    while ((this.eventList.length>0) && (this.eventList[0].triggerTime < timeSinceStart)) {
      // Process timer events - these events will mainly cause various virtualTransitVehicles to change from one frame of reference to another

      this.eventList.shift()
    }

    // Update the frames of reference. Frames of reference include: 
    //   1) the travelling at full speed frame, 
    //   2) the making a stop frame, and
    //   3) the making a "delay manuever" frame

    const timePerCompleteRevolution0 = 2 * Math.PI * this.crv.mainRingRadius / this.refFrames[0].v
    this.refFrames[0].p = (this.animateTransitVehicles * timeSinceStart / timePerCompleteRevolution0) % 1
    this.refFrames[1].p = 1 - this.refFrames[0].p
    // TBD - need a more sophisticated motion profile... 
    const trackDistance = this.refFrameCalculator.calcTrackPosition(this.animateTransitVehicles * timeSinceStart)
    this.refFrames[2].p = trackDistance
    this.refFrames[3].p = 1 - trackDistance
    this.refFrames[4].p = 0 // This is the stationary reference frame 

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
    const cameraRange = 60000 // +/- 50km
    //const distanceToCenterOfEarth = cameraPosition.length()
    //const cameraAltitude = distanceToCenterOfEarth - this.radiusOfPlanet
    //let cameraTrackPosition

    // Convert pointOnEarthsSurface into tetheredRingRefCoordSys
    const localCameraLocation = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone())
    // Then compute it's theta value and convert it to a 0 to 1 value 
    const nearestTrackPositionToCamera = (Math.atan2(localCameraLocation.z, localCameraLocation.x) / (2*Math.PI) + 1) % 1
    const pointOnRingAtNearestTrackPosition = mainRingCurve.getPoint(nearestTrackPositionToCamera)
    const distanceFromCameraToRing = pointOnRingAtNearestTrackPosition.distanceTo(localCameraLocation)

    // if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
    //   const localPoint = tetheredRingRefCoordSys.worldToLocal(cameraPosition.clone()).normalize()
    //   // Then compute it's track position value (as a value from 0.0 to 1.0)...
    //   cameraTrackPosition = (Math.atan2(localPoint.z, localPoint.x) / (2*Math.PI) + 1) % 1
    // }
    // else {
    //   cameraTrackPosition = 0
    // }
    // Then figure out starting and finishing wedges for that position
    const cameraRangeDelta = cameraRange / (2 * Math.PI * this.crv.mainRingRadius)
    const cameraRangeStart = (nearestTrackPositionToCamera - cameraRangeDelta + 1) % 1
    const cameraRangeFinish = (nearestTrackPositionToCamera + cameraRangeDelta + 1) % 1

    // let transitVehicleShortageCount
    // let ringTerminusShortageCount
    // let groundTerminusShortageCount
    // let elevatorCarShortageCount
    // let habitatShortageCount
    const assignModelList = []
    const removeModelList = []
    const updateModelList = []

    // First we determine which wedges in each of the reference frames are entering and leaving the proximity of the camera
    let cameraRangeStartForFrame
    let cameraRangeFinishForFrame
    this.refFrames.forEach((refFrame, index) => {
      const clearFlagsList = []
      //if (cameraAltitude<this.crv.currentMainRingAltitude+cameraRange) {
      
      // Hack
      if (distanceFromCameraToRing<=cameraRange) {
        // Subtract the current rotationalPosition of the reference frame from the cameraRangeStart and cameraRangeFinish values
        cameraRangeStartForFrame = (cameraRangeStart - refFrame.p + 1 ) % 1
        cameraRangeFinishForFrame = (cameraRangeFinish - refFrame.p + 1 ) % 1
        refFrame.startWedgeIndex = Math.floor(cameraRangeStartForFrame * this.numWedges)
        refFrame.finishWedgeIndex = Math.floor(cameraRangeFinishForFrame * this.numWedges)
      }
      else {
        refFrame.startWedgeIndex = -1
        refFrame.finishWedgeIndex = -1
      }
  
      // Set bit0 of actionFlags if wedge is currently visible
      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          this.actionFlags[wedgeIndex] |= 1
          clearFlagsList.push(wedgeIndex)
          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
      // Set bit1 of actionFlags if wedge was previously visible
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          this.actionFlags[wedgeIndex] |= 2
          clearFlagsList.push(wedgeIndex)
          if (wedgeIndex == refFrame.prevFinishWedgeIndex) break
        }
      }

      if (refFrame.startWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.startWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          if (this.actionFlags[wedgeIndex]==1) {
              // Wedge wasn't visible before and it became visible, assign it the assignModel list
              assignModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (this.actionFlags[wedgeIndex] & 1 == 1) {
            // Wedge is currently visible, assign it the updateModel list
            updateModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (wedgeIndex == refFrame.finishWedgeIndex) break
        }
      }
      if (refFrame.prevStartWedgeIndex!=-1) {
        for (wedgeIndex = refFrame.prevStartWedgeIndex; ; wedgeIndex = (wedgeIndex + 1) % this.numWedges) {
          if (this.actionFlags[wedgeIndex]==2) {
            // Wedge was visible before and it became invisible, add it to the removeModel list
            removeModelList.push({'refFrame': refFrame, 'wedgeIndex': wedgeIndex})
          }
          if (wedgeIndex == refFrame.prevFinishWedgeIndex) break
        }
      }
      
      // Debug - ToDo clean this up when it's no longer needed
      // let different = false
      // for (let j=0; j<this.actionFlags.length; j++) {
      //   if (this.actionFlags[j]!=refFrame.prevActionFlags[j]) {
      //     different = true
      //     break
      //   }
      // }
      // if (different) {
      //   let prstr = ''
      //   for (let j = 0; j<this.actionFlags.length; j++) {
      //     prstr += String(this.actionFlags[j])
      //   }
      //   console.log(prstr)
      // }
      // for (let j=0; j<this.actionFlags.length; j++) {
      //   refFrame.prevActionFlags[j] = this.actionFlags[j]
      // }

      refFrame.prevStartWedgeIndex = refFrame.startWedgeIndex
      refFrame.prevFinishWedgeIndex = refFrame.finishWedgeIndex

      clearFlagsList.forEach(wedgeIndex => {
        this.actionFlags[wedgeIndex] = 0  // Clear the action flags to ready them for future reuse
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
      //   this.unallocatedSolarArrayModels.length,
      //   this.unallocatedElevatorCableModels.length,
      // )
      //console.log('Adding ' + assignModelList.length)
    }

    // Free models that are in wedges that have recently left the region near the camera
    removeModelList.forEach(entry => {
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
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

    // Assign models to virtual objects that have just entered the region near the camera
    assignModelList.forEach(entry => {
      const ranOutOfModelsInfo = {}
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
        if (objectValue.length>0) {
          objectValue.forEach(object => {
            if (!object.model) {
              if (object.unallocatedModels.length==1) {
                // This is the last model. Duplicate it so that we don't run out.
                const tempModel = object.unallocatedModels[0].clone()
                object.unallocatedModels.push(tempModel)
                this.scene.add(tempModel)
                console.log('Duplicating model for ' + objectKey)
              }
              if (object.unallocatedModels.length>0) {
                object.model = object.unallocatedModels.pop()
                object.model.visible = object.isVisible
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
                object.placeAndOrientModel(object.model, entry['refFrame'])
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
      Object.entries(entry['refFrame'].wedges[entry['wedgeIndex']]).forEach(([objectKey, objectValue]) => {
        if (objectValue.length>0) {
          const classIsDynamic = objectValue[0].constructor.isDynamic
          const classHasChanged = objectValue[0].constructor.hasChanged
          if (true || classIsDynamic || classHasChanged) {
            // Call the placement method for each active instance (unless the model class is static and unchanged)
            objectValue.forEach(object => {
              if (object.model) {
                object.placeAndOrientModel(object.model, entry['refFrame'])
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
    dynamicallyManagedObject.hasChanged = false
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
