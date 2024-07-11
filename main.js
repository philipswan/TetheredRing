
// Use when local
import * as THREE from 'three'
//import { GUI } from 'three/examples/jsm/libs/dat.gui.module'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'
import { TWEEN } from 'three/addons/libs/tween.module.min'
//import { TWEEN } from '../tween.js/dist/tween.esm.js'
import { Water } from 'three/examples/jsm/objects/Water.js'
//import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js'
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js'
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js'
import { XYChart } from './XYChart.js'

import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Use for website
// import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
// import { GUI } from 'https://cdn.skypack.dev/three@0.138.1/examples/jsm/libs/lil-gui.module.min.js'
// import { TWEEN } from 'https://cdn.skypack.dev/three@0.138.1/examples/jsm/libs/tween.module.min'
// import * as BufferGeometryUtils from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/utils/BufferGeometryUtils.js'

// Not used
//import { VRButton } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/webxr/VRButton.js'
//import { FBXLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/FBXLoader.js'
// import Stats from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/libs/stats.module.js'

// import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
// import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
// import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
// import Stats from 'three/examples/jsm/libs/stats.module.js'

import { planet } from './planet.js'
import { transitSystem } from './transitsystems.js'
import { TetherGeometry } from './tethers.js'
import { OrbitControls } from './OrbitControlsModified.js'

import * as tram from './tram.js'
import * as Launcher from './launcher.js'
import * as kmlutils from './kmlutils.js'
import * as markers from './markers.js'
import * as CapturePresets from './CapturePresets.js'

// load camera preset vectors from external file
import cameraPresets from './cameraPresets.json'
import cameraControlData from './components/CameraControl/cameraPath1.json'
import { trackPointLogger } from './trackPointLogger.js'
import googleEarthProjectFile from './components/CameraControl/googleEarthStudioSampleProjectFile.json'
import { tetheredRingSystem } from './tetheredRingSystem.js'
import { MultiModeTrial } from './MultiModeTrial.js'

//import { makePlanetTexture } from './planetTexture.js'

// Hack - just want to be able to browse the object in the console
console.log(googleEarthProjectFile)

// Get the URL of the current page
const url = new URL(window.location.href)
//console.log(url)
if (!window.Worker) console.error("Web Workers are not supported in this browser.")

// Get the value of the "action" query parameter
// To enable VR, add "?enableVR=true" to end of url. For example, http://localhost:5173/?enableVR=true
const enableVR = (url.searchParams.get("enableVR")=="true")

let verbose = false
let fPreset = 0
const enableKMLFileFeature = true
const enableSpecsFileFeature = true
let genKMLFile = false
let genLauncherKMLFile = false
let genSpecs = false
let genSpecsFile = false
let fastTetherRender = true   // Fast render also uses the jitter reduction technique of creating a mesh with coordinates relative to a point near the ring, and then setting these mesh positions near the ring as well. However, this technique generates coordinates that are not useful for kml file generation.
let majorRedesign = true // False enables work in progress...
let capturer = null
let trackPointLoggerObject = null
let animationState = 0
const keyFrames = []
let keyFrameDelay = 0
let previousKeyFrame
let followElevators = false
let followTransitVehicles = false
let followLaunchVehicles = false
let lastPointOnLaunchTrajectoryCurve
let followLaunchVehiclesStartTime
let flyToLocation = 0

const mtm = new MultiModeTrial()

// Useful constants that we never plan to change
// ToDo - We need to output these to the specs file as well.
const gravitationalConstant = 0.0000000000667408   // ToDo: Should add units here...
let massOfPlanet = 5.97E+24   // kg   using mass of Earth for now
let radiusOfPlanet = 6378100 // m   using radius of Earth for now
const WGS84FlattenningFactor = 298.257223563    // Used to specify the exact shape of earth, which is approximately an oblate spheroid
const lengthOfSiderealDay = 86164.0905 // seconds    using value for Earth for now

const gui = new GUI({width: 500})
//gui.width = 1000
gui.close()
const folderGeography = gui.addFolder('Location (V6)').close()
const folderEngineering = gui.addFolder('Engineering').close()
const folderLauncher = gui.addFolder('Launcher').close()
const folderGrapplers = gui.addFolder('Grapplers').close()
const folderMaterials = gui.addFolder('Materials').close()
const folderEconomics = gui.addFolder('Economics').close()
const folderRendering = gui.addFolder('Rendering').close()
const folderTextOutput = gui.addFolder('TextOutput').close()
const folderCamera = gui.addFolder('Camera').close()

const guiTextOutput = document.createElement( 'div' )
guiTextOutput.classList.add( 'gui-stats' )
guiTextOutput.innerHTML = [
  '(Press \'s\' to update)',
  '<i>Total Tethered Ring Cost</i>: ' + 0,
  '<i>Total Tethered Ring Cost Per Kg Supported</i>: ' + 0,
  '<i>Total Stored Energy in TWh</i>: ' + 0,
  '<i>Moving Ring Speed</i>: ' + 0
].join( '<br/>' )
//folderTextOutput.open()
//console.log(folderTextOutput, folderTextOutput.$children, guiTextOutput)
folderTextOutput.$children.appendChild( guiTextOutput );
//folderTextOutput.__ul.appendChild( guiTextOutput );

const targetRadius = 32800000 / Math.PI / 2   // 32800 km is the max size a perfectly circular ring can be and still fits within the Pacific Ocean

const equivalentLatitudePreset = Math.acos(targetRadius/(radiusOfPlanet + 32000)) * 180 / Math.PI

const defaultShows = true // Set to false to reduce loading time
// Hack - distort scale to better illustrate certain concepts
// radiusOfPlanet = 637810
// massOfPlanet = 5.97E+22

// Constants controlled by sliders
const guidParamWithUnits = {
  equivalentLatitude: {value: equivalentLatitudePreset, units: "degrees", autoMap: false, min: 0, max: 89.9999, updateFunction: adjustRingDesign, folder: folderGeography},
  buildLocationRingCenterLatitude: {value: -19.2, units: "degrees", autoMap: true, min: -90, max: 90, updateFunction: adjustRingLatLon, folder: folderGeography},
  buildLocationRingCenterLongitude: {value: 213.7, units: "degrees", autoMap: true, min: 0, max: 360, updateFunction: adjustRingLatLon, folder: folderGeography},
  finalLocationRingCenterLatitude: {value: 14.33, units: "degrees", autoMap: true, min: -90, max: 90, updateFunction: adjustRingLatLon, folder: folderGeography},
  finalLocationRingCenterLongitude: {value: 186.26, units: "degrees", autoMap: true, min: 0, max: 360, updateFunction: adjustRingLatLon, folder: folderGeography},
  moveRingFactor: {value: 1, units: "", autoMap: true, min: 0, max: 1, tweenable: true, updateFunction: adjustRingLatLon, folder: folderGeography},

  buildLocationRingCenterLatitude2: {value: 14.3, units: "degrees", autoMap: true, min: -90, max: 90, updateFunction: adjustRingLatLon2, folder: folderGeography},
  buildLocationRingCenterLongitude2: {value: 186.3, units: "degrees", autoMap: true, min: 0, max: 360, updateFunction: adjustRingLatLon2, folder: folderGeography},
  finalLocationRingCenterLatitude2: {value: 20.7, units: "degrees", autoMap: true, min: -90, max: 90, updateFunction: adjustRingLatLon2, folder: folderGeography},
  finalLocationRingCenterLongitude2: {value: 303.12, units: "degrees", autoMap: true, min: 0, max: 360, updateFunction: adjustRingLatLon2, folder: folderGeography},
  moveRingFactor2: {value: 1, units: "", autoMap: true, min: 0, max: 1, tweenable: true, updateFunction: adjustRingLatLon2, folder: folderGeography},

  // Build location (assumes equivalentLatitude = 35)
  buildLocationRingEccentricity: {value: 1, units: "", autoMap: false, min: 0.97, max: 1.03, step: 0.001, updateFunction: adjustRingDesign, folder: folderGeography},
  finalLocationRingEccentricity: {value: 1, units: "", autoMap: false, min: 0.97, max: 1.03, step: 0.001, updateFunction: adjustRingDesign, folder: folderGeography},
  // ToDo: moveRingFactor needs to call adjustRingDesign when buildLocationRingEccentricity differs from finalLocationRingEccentricity
  locationPresetIndex: {value: 0, units: "", autoMap: true, min: 0, max: 6, step: 1, tweenable: false, updateFunction: setRingLatLonWithPreset, folder: folderGeography},
  displacementBias: {value: -900, units: "", autoMap: true, min: -10000, max: 10000, tweenable: true, updateFunction: adjustDisplacementBias, folder: folderGeography},
  displacementScale: {value: 6400, units: "", autoMap: true, min: -10000, max: 10000, tweenable: true, updateFunction: adjustDisplacementScale, folder: folderGeography},

  // Physical Constants
  transitSystemForwardOffset: {value: 0.816, units: 'm', autoMap: true, min: -1, max: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleForwardOffset: {value: 2.0, units: 'm', autoMap: true, min: 1, max: 3, updateFunction: updateTransitsystem, folder: folderEngineering},

  permeabilityOfFreeSpace: {value: 4*Math.PI*1e-7, units: "N/A2", autoMap: true, min: 0, max: 0.0001, updateFunction: adjustRingDesign, folder: folderEngineering},

  // Engineering Parameters - Ring
  ringFinalAltitude: {value: 32000, units: "m", autoMap: true, min: 0, max: 200000, updateFunction: adjustRingDesign, folder: folderEngineering},
  ringAmountRaisedFactor: {value: 1, units: "", autoMap: true, min: 0, max: 5, tweenable: true, updateFunction: adjustRingDesign, folder: folderEngineering},
  //movingRingsRotationalPeriod: {value: 1800, units: "s", autoMap: true, min: 0, max: 3600, updateFunction: adjustRingDesign, folder: folderEngineering},
  movingRingsMassPortion: {value: 0.382, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  numControlPoints: {value: 256, units: '', autoMap: true, min: 4, max: 1024, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  totalMassPerMeterOfRings: {value: 100, units: "kg", autoMap: true, min: 1, max: 1000, updateFunction: adjustRingDesign, folder: folderEngineering},
  statorMassPerUnitOfLoad: {value: 0.02, units: "kg/N", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  relativePermeabilityOfCore: {value: 8000, units: "", autoMap: true, min: 0, max: 100000, updateFunction: adjustRingDesign, folder: folderEngineering},
  ringMaglevFieldLoopLength: {value: 0.1, units: "m", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  ringMaglevCoreCrossSectionLength: {value: 0.02, units: "m", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  ringMaglevCoreCrossSectionWidth: {value: 0.02, units: "m", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  ringMaglevAirGap: {value: 0.0005, units: "m", autoMap: true, min: 0, max: 0.01, updateFunction: adjustRingDesign, folder: folderEngineering},
  ringMaglevCoilsNumLoops: {value: 100, units: "", autoMap: true, min: 0, max: 1000, updateFunction: adjustRingDesign, folder: folderEngineering},
  wireRadius: {value: 0.0013, units: "", autoMap: true, min: 0, max: 0.01, updateFunction: adjustRingDesign, folder: folderEngineering},
  portionOfCoreOnStationaryRing: {value: 0.7, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},

  // Engineering Parameters - Tethers
  numTethers: {value: 3600, units: "", autoMap: true, min: 4, max: 7200, step: 2, updateFunction: adjustRingDesign, folder: folderEngineering},
  numForkLevels: {value: 7, units: "", autoMap: true, min: 0, max: 10, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},       // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from base to a single attachment point)
  whenToForkVertically: {value: 2, units: "", autoMap: true, min: 0, max: 10, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},       // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from base to a single attachment point)
  tetherSpanOverlapFactor: {value: 2, units: "%", autoMap: true, min: 0.5, max: 4, tweenable: true, updateFunction: adjustRingDesign, folder: folderEngineering},
  tetherPointBxAvePercent: {value: 50, units: "%", autoMap: true, min: 0, max: 100, tweenable: true, updateFunction: adjustRingDesign, folder: folderEngineering},
  tetherPointBxDeltaPercent: {value: 40, units: "%", autoMap: true, min: 0, max: 50, tweenable: true, updateFunction: adjustRingDesign, folder: folderEngineering},
  tetherEngineeringFactor: {value: 2.0, units: "", autoMap: true, min: 0.1, max: 10, tweenable: true, updateFunction: adjustRingDesign, folder: folderEngineering},
  defaultcapitalCostPerKgSupported: {value: 100.0, units: "USD/kg", autoMap: true, min: 1, max: 1000, tweenable: true, updateFunction: adjustRingDesign, folder: folderEngineering},

  // Engineering Parameters - Stationary Rings
  transitSystemNumZones: {value: 1024, units: "", autoMap: true, min: 1, max: 7, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  numMainRings: {value: 5, units: "", autoMap: true, min: 1, max: 7, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},

  mainRingTubeRadius: {value: 0.5, units: "m", autoMap: true, min: .1, max: 5, updateFunction: updateTransitsystem, folder: folderEngineering}, // ToDo - Retire this parameter

  mainRingSpacing: {value: 10, units: "m", autoMap: true, min: 0, max: 30, updateFunction: updateTransitsystem, folder: folderEngineering},

  mainRingUpwardOffset: {value: 0, units: "m", autoMap: true, min: -100, max: 100, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  mainRingOutwardOffset: {value: 0, units: 'm', autoMap: true, min: -10, max: 10, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  stationaryRingTubeRadius: {value: 0.25, units: 'm', autoMap: true, min: 0.1, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  movingRingHeight: {value: 0.3, units: 'm', autoMap: true, min: 0.01, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  movingRingThickness: {value: 0.05, units: 'm', autoMap: true, min: 0.01, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  movingRingTubeRadius: {value: 0.4, units: 'm', autoMap: true, min: 0.1, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  // ToDo: These are really a function of numMainRings. Should calculate them rather than specifying them.
  stationaryRingNumModels: {value: 512, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},

  // Engineering Parameters - Moving Ring and Stationary Rings
  movingRingNumModels: {value: 512, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  numVirtualStationaryRingSegments: {value: 40000, units: "", autoMap: true, min: 0, max: 400000, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  numVirtualMovingRingSegments: {value: 400000, units: "", autoMap: true, min: 0, max: 400000, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  movingRingsAverageDensity: {value: 8000, units: 'kg/m3', autoMap: true, min: 0, max: 4000, updateFunction: updateTransitsystem, folder: folderEngineering},

  statorMagnetHeight: {value: 0.3, units: 'm', autoMap: true, min: 0.1, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  statorMagnetThickness: {value: 0.05, units: 'm', autoMap: true, min: 0.1, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  statorMagnetAirGap: {value: 0.001, units: 'm', autoMap: true, min: 0.1, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  statorMagnetNumModels: {value: 512, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  numVirtualStatorMagnetSegments: {value: 400000, units: "", autoMap: true, min: 0, max: 400000, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  
  // Engineering Parameters - Transit System
  transitTubeTubeRadius: {value: 6, units: 'm', autoMap: true, min: 1, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeTubeWallThickness: {value: 0.001, units: 'm', autoMap: true, min: 0, max: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeUpwardOffset: {value: -100, units: "m", autoMap: true, min: -200, max: 0, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeOutwardOffset: {value: -15, units: 'm', autoMap: true, min: -11, max: -9, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeNumModels: {value:256, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},

  transitTrackWidth: {value: .3, units: 'm', autoMap: true, min: 0, max: 2, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackHeight: {value: .1, units: 'm', autoMap: true, min: 0, max: 2, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackNumModels: {value:256, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackUpwardOffset: {value: 2.38125, units: "m", autoMap: true, min: -200, max: 0, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackOutwardOffset: {value: 0, units: 'm', autoMap: true, min: -10, max: 10, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackUpwardSpacing: {value: 4.8125, units: "m", autoMap: true, min: -200, max: 0, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackOutwardSpacing: {value: 4.575, units: 'm', autoMap: true, min: 0, max: 20, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTracksNumUpwardTracks: {value: 2, units: '', autoMap: true, min: 1, max: 4, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTracksNumOutwardTracks: {value: 2, units: '', autoMap: true, min: 1, max: 4, updateFunction: updateTransitsystem, folder: folderEngineering},

  transitTrackOuterOffset: {value: 2.2875, units: "m", autoMap: true, min: 1.5, max: 2.5, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackUpperOffset1: {value: 4.7875, units: "m", autoMap: true, min: 2.5, max: 3.5, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTrackUpperOffset2: {value: -0.025, units: "m", autoMap: true, min: -1.0, max: -0.5, step: 0.001, updateFunction: updateTransitsystem, folder: folderEngineering},
  // ToDo - Need 4 sliders for adjusting the track vertical and horizontal spacing and offsets
  ringTerminusOutwardOffset: {value: -9.75, units: 'm', autoMap: true, min: -10, max: -5, updateFunction: updateTransitsystem, folder: folderEngineering},
  ringTerminusUpwardOffset: {value: -3.8, units: 'm', autoMap: true, min: -5, max: -3, updateFunction: updateTransitsystem, folder: folderEngineering},
  ringTerminusCost: {value: 10000000, units: 'USD', autoMap: true, min: 0, max: 10000000, updateFunction: updateTransitsystem, folder: folderEngineering},
  groundTerminusCost: {value: 20000000, units: 'USD', autoMap: true, min: 0, max: 10000000, updateFunction: updateTransitsystem, folder: folderEngineering},
  groundTerminusOutwardOffset: {value: -9.75, units: 'm', autoMap: true, min: -200, max: 200, updateFunction: updateTransitsystem, folder: folderEngineering},
  groundTerminusUpwardOffset: {value: 150, units: 'm', autoMap: true, min: -200, max: 200, updateFunction: updateTransitsystem, folder: folderEngineering},
  
  transitVehicleUpwardOffset: {value: 1.1, units: 'm', autoMap: true, min: -1, max: 2, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleCruisingSpeed: {value: 500, units: 'm/s', autoMap: true, min: 0, max: 2000, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleMaxAcceleration: {value: 10, units: 'm/s2', autoMap: true, min: 0, max: 50, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleMergeTime: {value: 1, units: 's', autoMap: true, min: 1, max: 30, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleStopDuration: {value: 30, units: 's', autoMap: true, min: 1, max: 300, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleRandomizeStartPositions: {value: true, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderEngineering},

  // ToDo: There are no calculations implemented yet that use the following parameters
  transitVehicleLength: {value: 20, units: 'm', autoMap: true, min: 1, max: 100, updateFunction: updateTransitsystem, folder: folderEngineering},
  // ToDo - Vehicle Radius doesn't do anything and probably does not match the model
  transitVehicleRadius: {value: 2, units: 'm', autoMap: true, min: 1, max: 10, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeInteriorPressure: {value: 10, units: 'Pa', autoMap: true, min: .1, max: 1000, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeInteriorGasMolecularWeight: {value: 29, units: 'kg/kgmole', autoMap: true, min: 1, max: 100, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeInteriorTemperature: {value: 20, units: 'C', autoMap: true, min: 0, max: 40, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitSystemEfficiencyAtCruisingSpeed: {value: 0.8, units: '', autoMap: true, min: 0.1, max: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleCoefficientOfDrag: {value: 0.25, units: '', autoMap: true, min: .1, max: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  //transitSystemMassPerMeter: {value:200, units: "kg", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  //transitSystemMaterialsCostPerMeter: {value:18000, units: "USD/m", autoMap: true, min: 1, max: 30000, updateFunction: updateTransitsystem, folder: folderEngineering},  // https://youtu.be/PeYIo91DlWo?t=490
  transitTubeTubeWallMaterialDensity: {value: 930, units: 'kg/m3', autoMap: true, min: 0, max: 4000, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitTubeTubeWallMaterialCost: {value: 0.75, units: "USD/kg", autoMap: true, min: 0.01, max: 1, updateFunction: updateTransitsystem, folder: folderEngineering},  // https://www.theplasticsexchange.com//Research/WeeklyReview.aspx

  // dynamicallyManagedObjectNumModels
  dynamicallyManagedObjectNumModels: {value: 256, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},

  // ToDo: these parameters are not properly updated yet
  numVirtualTransitVehicles: {value: 40000, units: '', autoMap: true, min: 0, max: 400000, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  transitVehicleNumModels: {value: 256, units: '', autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  numVirtualRingTerminuses: {value:1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  numVirtualGroundTerminuses: {value:1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  ringTerminusNumModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  groundTerminusNumModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},

  // Engineering Parameters - Elevators
  numElevatorCables: {value:1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  numElevatorCableModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  elevatorCableCost: {value: 1000000, units: 'USD', autoMap: true, min: 0, max: 10000000, updateFunction: adjustRingDesign, folder: folderEngineering},    // ToDo: Need a better estimate for the cost of an elevator cable and its drive system
  numVirtualElevatorCars: {value: 1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  elevatorCarNumModels: {value: 32, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  additionalUpperElevatorCable: {value: 20, units: 'm', autoMap: true, min: 0, max: 50, updateFunction: updateTransitsystem, folder: folderEngineering},
  elevatorCableOutwardOffset: {value: -24, units: 'm', autoMap: true, min: -30, max: -10, updateFunction: updateTransitsystem, folder: folderEngineering},
  elevatorCableForwardOffset: {value: -11, units: 'm', autoMap: true, min: -100, max: 0, updateFunction: updateTransitsystem, folder: folderEngineering},
  elevatorCarUpwardOffset: {value: 0.32, units: 'm', autoMap: true, min: -10, max: 10, updateFunction: updateTransitsystem, folder: folderEngineering},
  elevatorCarMaxSpeed: {value: 200, units: 'm/s', autoMap: true, min: 0, max: 2000, updateFunction: updateTransitsystem, folder: folderEngineering},
  elevatorCarMaxAcceleration: {value: 2, units: 'm/s2', autoMap: true, min: 0, max: 50, updateFunction: updateTransitsystem, folder: folderEngineering},
  elevatorCarCost: {value: 1000000, units: 'USD', autoMap: true, min: 0, max: 10000000, updateFunction: updateTransitsystem, folder: folderEngineering},  // ToDo: Need a better estimate for the cost of an elevator car

  // Habitats
  numVirtualHabitats: {value: 17100, units: "", autoMap: true, min: 0, max: 100000, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  habitatNumModels: {value: 256, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateTransitsystem, folder: folderEngineering},
  habitatUpwardOffset: {value: 3.66, units: 'm', autoMap: true, min: -10, max: 10, updateFunction: updateTransitsystem, folder: folderEngineering},
  habitatOutwardOffset: {value: 14.32, units: 'm', autoMap: true, min: 0, max: 20, updateFunction: updateTransitsystem, folder: folderEngineering},
  habitatForwardOffset: {value: 4.16, units: 'm', autoMap: true, min: 0, max: 10, updateFunction: updateTransitsystem, folder: folderEngineering},
  //habitatBubbleMaterialTensileStress: {value: 7000000, units: 'Pa', autoMap: true, min: 0, max: 100000000, updateFunction: updateTransitsystem, folder: folderEngineering},
  //habitatBubbleMaterialDensity: {value: 2500, units: 'kg/m3', autoMap: true, min: 0, max: 4000, updateFunction: updateTransitsystem, folder: folderEngineering},
  // Carbon Fiber
  // habitatBubbleMaterialTensileStress: {value: 7000000000, units: 'Pa', autoMap: true, min: 0, max: 100000000, updateFunction: updateTransitsystem, folder: folderEngineering},
  // habitatBubbleMaterialDensity: {value: 1790, units: 'kg/m3', autoMap: true, min: 0, max: 4000, updateFunction: updateTransitsystem, folder: folderEngineering},
  // Alon (Aluminium oxynitride)  Warner, Charles & Hartnett, Thomas & Fisher, Donald & Sunne, Wayne. (2005). Characterization of ALON (TM) optical ceramic. Proceedings of SPIE - The International Society for Optical Engineering. 5786. 10.1117/12.607596. 
  habitatBubbleMaterialTensileStrength: {value: 700, units: 'MPa', autoMap: true, min: 0, max: 100000000, updateFunction: updateTransitsystem, folder: folderEngineering},
  habitatBubbleMaterialDensity: {value: 3700, units: 'kg/m3', autoMap: true, min: 0, max: 4000, updateFunction: updateTransitsystem, folder: folderEngineering},
  habitatBubbleMaterialEngineeringFactor: {value: 2, units: '', autoMap: true, min: 0, max: 10, updateFunction: updateTransitsystem, folder: folderEngineering},
  habitatBubbleMaterialCost: {value: 35, units: 'USD/kg', autoMap: true, min: 0, max: 10, updateFunction: updateTransitsystem, folder: folderEngineering},   // This is a swag - 5X the glass values from here https://exportv.ru/price-index/laminated-glass
  habitatAirPressure: {value: 100000, units: 'Pa', autoMap: true, min: 0, max: 110000, updateFunction: updateTransitsystem, folder: folderEngineering},
  idealGasConstant: {value: 8.3145, units: 'Joules/mole/K', autoMap: true, min: 0, max: 10000, updateFunction: updateTransitsystem, folder: folderEngineering},

  // Solar Arrays
  numVirtualSolarArrays: {value: 100000, units: "", autoMap: true, min: 0, max: 1000000, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarArrayNumModels: {value: 2560, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarArrayWidth: {value: 15, units: "m", autoMap: true, min: 0, max: 100, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarArrayHeight: {value: 10, units: "m", autoMap: true, min: 0, max: 100, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarArrayOutwardOffset: {value: -60, units: "m", autoMap: true, min: -100, max: 100, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarArrayUpwardOffset: {value: -50, units: "m", autoMap: true, min: -100, max: 100, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  
  // Engineering Parameters - Launch System - Performance
  evacuatedTubeEntrancePositionAroundRing: {value: 0.76081, units: "", autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverForwardAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 1, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherRampUpwardAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 10, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMaxEyesInAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 10, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMaxEyesOutAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 10, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherRampTurningRadius: {value: 5000, units: 'm', autoMap: true, min: 10, max: 1000000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherRampDesignMode: {value: 0, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherGroundAssistLaunchMode: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderLauncher},
  launcherLaunchPadLatitude: {value: 25.9967, units: 'degrees', autoMap: true, min: -90, max: 90, updateFunction: updateLauncher, folder: folderLauncher},
  launcherLaunchPadLongitude: {value: 97.1549, units: 'degrees', autoMap: true, min: 0, max: 360, updateFunction: updateLauncher, folder: folderLauncher},
  launcherLaunchPadAltitude: {value: 20, units: 'm', autoMap: true, min: 0, max: 100000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherSledDownwardAcceleration: {value: 150, units: 'm*s-2', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverAltitude: {value: 100, units: 'm', autoMap: true, min: 0, max: 100000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherRampExitAltitude: {value: 2700, units: 'm', autoMap: true, min: 0, max: 50000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherEvacuatedTubeExitAltitude: {value: 31700, units: "m", autoMap: true, min: 0, max: 100000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriver1InitialVelocity: {value: 2, units: 'm/s', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriver2InitialVelocity: {value: 200, units: 'm/s', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverExitVelocity: {value: 8000-360, units: 'm/s', autoMap: true, min: 1, max: 50000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleSeaLevelRocketExhaustVelocity: {value: 3590, units: 'm/s', autoMap: true, min: 0, max: 20000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleVacuumRocketExhaustVelocity: {value: 4436, units: 'm/s', autoMap: true, min: 0, max: 20000, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledEmptyMass: {value: 1000, units: 'kg', autoMap: true, min: 0, max: 10000, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleDesiredOrbitalAltitude: {value: 420000, units: 'm', autoMap: true, min: 0, max: 10000000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleEffectiveRadius: {value: 0.01, units: 'm', autoMap: true, min: 0, max: 10, updateFunction: updateLauncher, folder: folderLauncher},
  launcherPayloadDeliveredToOrbit: {value: 100, units: 'kg', autoMap: true, min: 1, max: 10000, updateFunction: updateLauncher, folder: folderLauncher},

  launchVehiclePropellantMassFlowRate: {value: 20, units: 'kg/s', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleAdaptiveThrust: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleCoefficientOfDrag: {value: 0.05, units: '', autoMap: true, min: .1, max: 2, updateFunction: updateLauncher, folder: folderLauncher},
  launcherCoastTime: {value: 1250, units: 's', autoMap: true, min: 10, max: 5000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherXyChartMaxT: {value: 450, units: 's', autoMap: true, min: 10, max: 5000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherServiceLife: {value: 20, units: 'years', autoMap: true, min: 1, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  launcherLaunchesPerYear: {value: 500, units: '', autoMap: true, min: 1, max: 10000, updateFunction: updateLauncher, folder: folderLauncher},
  
  // Engineering Parameters - Launch System - Appearance
  launcherFeederRailLength: {value: 20, units: "m", autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launchSystemForwardScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launchSystemUpwardScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launchSystemRightwardScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleSidewaysOffset: {value: 0, units: 'm', autoMap: true, min: -20, max: 20, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleUpwardsOffset: {value: 0.2, units: 'm', autoMap: true, min: -20, max: 20, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleForwardsOffset: {value: -3, units: 'm', autoMap: true, min: -20, max: 20, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleRadius: {value: 1.2, units: 'm', autoMap: true, min: .1, max: 20, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleBodyLength: {value: 10, units: 'm', autoMap: true, min: .1, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleFlameLength: {value: 15, units: 'm', autoMap: true, min: .1, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleNoseconeLength: {value: 20, units: 'm', autoMap: true, min: .1, max: 50, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleRocketEngineLength: {value: 4.3, units: 'm', autoMap: true, min: .1, max: 50, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleShockwaveConeLength: {value: 30, units: 'm', autoMap: true, min: .1, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleEmptyMass: {value: 1000, units: 'kg', autoMap: true, min: 0, max: 100000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehiclePropellantMass: {value: 9500, units: 'kg', autoMap: true, min: 0, max: 100000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehiclePayloadMass: {value: 100, units: 'kg', autoMap: true, min: 0, max: 100000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleNonPayloadMass: {value: 400, units: 'kg', autoMap: true, min: 0, max: 100000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleScaleFactor: {value: 1, units: 'm', autoMap: true, min: .1, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleSpacingInSeconds: {value: 20, units: 's', autoMap: true, min: 0.1, max: 60, updateFunction: updateLauncher, folder: folderLauncher},
  numVirtualLaunchVehicles: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launchVehicleNumModels: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},

  launcherSlowDownPassageOfTime: {value: 1, units: '', autoMap: true, min: 0, max: 2, updateFunction: updateLauncher, folder: folderLauncher},
  launcherEvacuatedTubeRadius: {value: 4, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  numVirtualMassDriverTubes: {value: 256, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverRailWidth: {value: 1.0, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverRailHeight: {value: 0.25, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launchRailUpwardsOffset: {value: -3.5, units: 'm', autoMap: true, min: -200, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  numVirtualMassDriverRailsPerZone: {value: 1, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverBracketWidth: {value: 2.0, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverBracketHeight: {value: 0.3, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverBracketRibWidth: {value: 0.5, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverBracketNumModels: {value: 32, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewShaftOuterRadius: {value: 0.375, units: 'm', autoMap: true, min: .01, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewShaftInnerRadius: {value: 0.3, units: 'm', autoMap: true, min: 0, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewThreadRadius: {value: 0.5, units: 'm', autoMap: true, min: .01, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewThreadThickness: {value: 0.05, units: 'm', autoMap: true, min: .01, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewThreadStarts: {value: 4, units: '', autoMap: true, min: 1, max: 4, step: 1, updateFunction: updateLauncher, folder: folderLauncher},   // This is the number of individual threads in the screw
  launcherMassDriverScrewRoughLength: {value: 5, units: "", autoMap: true, min: 0, max: 10000, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewSidewaysOffset: {value: 3, units: "m", autoMap: true, min: -100, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewUpwardsOffset: {value: -1.75, units: "m", autoMap: true, min: -100, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewRevolutionsPerSecond: {value: 200, units: "", autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewBracketThickness: {value: 0.005, units: "m", autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewBracketDensity: {value: 7930, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewBracketMaterialCost: {value: 1, units: "USD/kg", autoMap: true, min: 0, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewNumBrackets: {value: 800, units: "", autoMap: true, min: 0, max: 20000, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewMaterialDensity: {value: 7930, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverScrewMaterialCost: {value: 1, units: "USD/kg", autoMap: true, min: 0, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  // Assuming Concrete with a stainless steel outer liner for the ,assdriver tube
  launcherMassDriverTubeInnerRadius: {value: 4.5, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverTubeLinerThickness: {value: 0.002, units: 'm', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverTubeWallThickness: {value: 0.01, units: 'm', autoMap: true, min: 0, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverTubeMaterial0Density: {value: 7930, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverTubeMaterial0Cost: {value: 1, units: "USD/kg", autoMap: true, min: 0, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverTubeMaterial1Density: {value: 2400, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverTubeMaterial1Cost: {value: 0.022425547, units: "USD/kg", autoMap: true, min: 0, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  launcherEvacuatedTubeNumModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMarkerRadius: {value: 50, units: "m", autoMap: true, min: 1, max: 10000, step: 1, updateFunction: updateLauncher, folder: folderLauncher},

  launchSledSpacingInSeconds: {value: 5, units: 's', autoMap: true, min: 0.1, max: 60, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledWidth: {value: 2, units: 'm', autoMap: true, min: .1, max: 20, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledHeight: {value: .25, units: 'm', autoMap: true, min: .1, max: 20, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledBodyLength: {value: 10, units: 'm', autoMap: true, min: .1, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledSidewaysOffset: {value: 0, units: 'm', autoMap: true, min: -200, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledUpwardsOffset: {value: 0.4, units: 'm', autoMap: true, min: -200, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledForwardsOffset: {value: -3, units: 'm', autoMap: true, min: -200, max: 200, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  numVirtualLaunchSleds: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledNumModels: {value: 40, units: '', autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderLauncher},

  // ToDo: Values for launchVehicleEmptyMass and launchVehiclePropellantMass will be calculated later from other parameters 
  launcherFlywheelRadius: {value: 0.225, units: 'm', autoMap: true, min: 0.01, max: 2, updateFunction: updateLauncher, folder: folderLauncher},
  launcherFlywheelThickness: {value: 0.06, units: 'm', autoMap: true, min: 0.01, max: 2, updateFunction: updateLauncher, folder: folderLauncher},
  launcherFlywheelDensity: {value: 8000, units: 'kg/m3', autoMap: true, min: 1000, max: 20000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherScrewToothContactPatchWidth: {value: 0.125, units: 'm', autoMap: true, min: 0.005, max: 2, updateFunction: updateLauncher, folder: folderLauncher},
  launcherScrewRotationRate: {value: 200, units: 's-1', autoMap: true, min: 1, max: 2000, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledAMBMaxMagneticFluxDensity: {value: 1.25, units: 'T', autoMap: true, min: 0.1, max: 20, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledAMBMagneticFluxDensityPortion: {value: 0.8, units: '', autoMap: true, min: 0.1, max: 1, updateFunction: updateLauncher, folder: folderLauncher},
  //launcherFlywheelMassPerMeter: {value: 1020, units: 'kg/m', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherBracketsMassPerMeter: {value: 40, units: 'kg/m', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherRailsMassPerMeter: {value: 100, units: 'kg/m', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherTorqueConvertorsMassPerMeter: {value: 100, units: 'kg/m', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMotorMass: {value: 100, units: 'kg', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMotorCost: {value: 2000, units: 'USD', autoMap: true, min: 0, max: 10000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMotorsPerMeter: {value: 0.02, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherVacuumPumpMass: {value: 100, units: 'kg', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher}, 
  launcherVacuumPumpCost: {value: 2000, units: 'USD', autoMap: true, min: 0, max: 10000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherVacuumPumpsPerMeter: {value: 0.02, units: '', autoMap: true, min: 0, max: 100, updateFunction: updateLauncher, folder: folderLauncher},
  launcherSuspendedTubeMassPerMeter: {value: 100, units: 'kg/m', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},
  launcherEfficiency: {value: 0.8, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverConcreteTubeInnerRadius: {value: 1, units: 'm', autoMap: true, min: 0.01, max: 2, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverConcreteTubeOuterRadius: {value: 1.125, units: 'm', autoMap: true, min: 0.01, max: 2, updateFunction: updateLauncher, folder: folderLauncher},
  launcherMassDriverConcreteTubeJacketThickness: {value: 0.002, units: 'm', autoMap: true, min: 0, max: 1000, updateFunction: updateLauncher, folder: folderLauncher},

  massDriverCameraRange: {value: 500, units: 'm', autoMap: true, min: 0, max: 1000000, updateFunction: updateLauncher, folder: folderLauncher},
  launchSledCameraRange: {value: 2000, units: 'm', autoMap: true, min: 0, max: 1000000, updateFunction: updateLauncher, folder: folderLauncher},
  vehicleInTubeCameraRange: {value: 1000000, units: 'm', autoMap: true, min: 0, max: 1000000, updateFunction: updateLauncher, folder: folderLauncher},
  lauchVehicleCameraRange: {value: 1000000, units: 'm', autoMap: true, min: 0, max: 1000000, updateFunction: updateLauncher, folder: folderLauncher},

  // Grapplers
  launchSledNumGrapplers: {value: 64, units: '', autoMap: true, min: 0, max: 3600, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerMagnetThickness: {value: 0.1, units: '', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledBetweenGrapplerFactor: {value: 0.01, units: '', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledShaftToGrapplerPad: {value: 0.02, units: 'm', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerPadLiftAwayDistance: {value: 0.01, units: 'm', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerPadLiftAwayPortion: {value: 0.1, units: 'm', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerClearanceFactor: {value: 0.1, units: '', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerPadTwistPortion: {value: 0.1, units: '', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerBallJointClearance: {value: 0.1, units: 'm', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerBallJointRadius: {value: 0.06, units: 'm', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerCylinderRadius: {value: 0.04, units: 'm', autoMap: true, min: 0, max: 1, step: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerRangeFactor: {value: .01, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerMaxRangeOfMotion: {value: 0.125, units: '', autoMap: true, min: 0, max: 0.5, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledGrapplerTopDeadCenterRotation: {value: 0.5, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledIntraAnchorUpwardsSeparation: {value: 0.85, units: 'm', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderGrapplers},
  launchSledInterAnchorUpwardsSeparation: {value: 0.12, units: 'm', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderGrapplers},

  // Engineering Parameters - Power
  powerRequirement: {value: 1000, units: "W/m", autoMap: true, min: 1, max: 10000, updateFunction: adjustRingDesign, folder: folderEngineering},   // This is the power that is consumed by the rings maglev systems and all equipment supported by the ring, per meter length of the ring.
  powerConductorDensity: {value: 2710, units: "kg*m-3", autoMap: true, min: 10, max: 10000, updateFunction: adjustRingDesign, folder: folderEngineering},  // Value for aluminum
  powerConductorConductivity: {value: 36900000, units: "Siemens*m-1", autoMap: true, min: 10000000, max: 100000000, updateFunction: adjustRingDesign, folder: folderEngineering}, // Value for Aliminum. One siemen is kg−1⋅m−2⋅s3⋅A2
  powerVoltageAcrossLoad: {value: 100000, units: "Volts", autoMap: true, min: 1, max: 10000000, updateFunction: adjustRingDesign, folder: folderEngineering},
  powerLostInConductorFactor: {value: 0.01, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},

  movingRingLinearMotorEfficiency: {value: 0.9, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelReferenceTemperature: {value: 25, units: "C", autoMap: true, min: -100, max: 100, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelAverageTemperature: {value: -40, units: "C", autoMap: true, min: -100, max: 100, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelTemperatureEfficiencyFactor: {value: 0.0045, units: "C-1", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelTemperatureCoefficient: {value: -0.47, units: "%/C", autoMap: true, min: -1, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelEfficiencyAtReferenceTemperature: {value: 0.2, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelMassPerMeterSquared: {value: 0.28, units: "kg/m2", autoMap: true, min: 0, max: 100, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelMountMassPerMeterSquared: {value: 0.1, units: "kg/m2", autoMap: true, min: 0, max: 100, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelCostPerWatt: {value: 2.5, units: "USD/W", autoMap: true, min: 0, max: 10, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelPeakSolarPowerPerMeterSquared: {value: 1361, units: "W/m2", autoMap: true, min: 0, max: 10000, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPowerAvailibilityFactor: {value: 0.5, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering},
  solarPanelWidth: {value: 10, units: "m", autoMap: true, min: 0, max: 10, updateFunction: adjustRingDesign, folder: folderEngineering},

  // Material Parameters - Tethers
  tetherFiberDensityCarbonFiber: {value: 1790, units: "kg*m-3", autoMap: false, min: 10, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},        // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherFiberTensileStrengthCarbonFiber: {value: 7000, units: "MPa", autoMap: false, min: 10, max: 100000, updateFunction: adjustRingDesign, folder: folderMaterials},   // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherFiberCostCarbonFiber: {value: 22, units: "USD/kg", autoMap: false, min: .01, max: 1000, updateFunction: adjustRingDesign, folder: folderMaterials},           // Note: Probably not accurate for Toray1100GC
  tetherFiberDensityGraphene: {value: 2090, units: "kg*m-3", autoMap: false, min: 10, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},        // 
  tetherFiberTensileStrengthGraphene: {value: 130500, units: "MPa", autoMap: false, min: 10, max: 100000, updateFunction: adjustRingDesign, folder: folderMaterials},   // 
  tetherFiberCostGraphene: {value: 220, units: "USD/kg", autoMap: false, min: .01, max: 1000, updateFunction: adjustRingDesign, folder: folderMaterials},           // 
  tetherFiberDensityCustom: {value: 1790, units: "kg*m-3", autoMap: false, min: 10, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  tetherFiberTensileStrengthCustom: {value: 7000, units: "MPa", autoMap: false, min: 10, max: 100000, updateFunction: adjustRingDesign, folder: folderMaterials},
  tetherFiberCostCustom: {value: 22, units: "USD/kg", autoMap: false, min: .01, max: 1000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialResistivityCopper: {value: 1.68e-8, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialResistivityAluminum: {value: 2.65e-8, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialResistivityCustom: {value: 2.65e-8, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialDensityCopper: {value: 8960, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialDensityAluminum: {value: 2700, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialDensityCustom: {value: 2700, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialCostCopper: {value: 9.7289, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialCostAluminum: {value: 3.3, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coilConductorMaterialCostCustom: {value: 3.3, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coreMaterialDensityIron: {value: 7874, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  coreMaterialCostIron: {value: 0.090, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  bulkMaterialCost: {value: 0.090, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  densityOfConcrete: {value: 2400, units: "kg/m3", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  costOfConcrete: {value: 0.022425547, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  costOfSteel: {value: 0.7, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},
  costOfAluminum: {value: 2.3, units: "USD/kg", autoMap: true, min: 0, max: 20000, updateFunction: adjustRingDesign, folder: folderMaterials},

  // Economics Parameters
  wholesaleCostOfElectricity: {value: 0.05 / 3.6e6, units: "USD/J", autoMap: true, min: 0, max: 0.1, updateFunction: adjustRingDesign, folder: folderEconomics},
  jetFuelCostPerGallon: {value: 5.29 , units: "USD/Gallon", autoMap: true, min: 0, max: 0.1, updateFunction: adjustRingDesign, folder: folderEconomics},
  liquidHydrogenCostPerKg: {value: 3.65, units: 'USD/kg', autoMap: true, min: 0, max: 1, updateFunction: updateTransitsystem, folder: folderEconomics},
  liquidHeliumCostPerKg: {value: 50, units: 'USD/kg', autoMap: true, min: 0, max: 1, updateFunction: updateTransitsystem, folder: folderEconomics},
  liquidOxygenCostPerKg: {value: 0.155, units: 'USD/kg', autoMap: true, min: 0, max: 1, updateFunction: updateTransitsystem, folder: folderEconomics},
  launcherFactoryCost: {value: 10000000, units: "USD", autoMap: true, min: 0, max: 1e10, updateFunction: adjustRingDesign, folder: folderEconomics},

  // Rendering Parameters
  parameterPresetNumber: {value: 1, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering},
  showLogo: {value: true, units: '', autoMap: true, updateFunction: updateLogoSprite, folder: folderRendering},
  showXYChart: {value: false, units: '', autoMap: true, updateFunction: updateXYChart, folder: folderRendering},

  // Hack
  backgroundOpacity: {value: 1, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustBackgroundOpacity, folder: folderRendering},
  showEarthsSurface: {value: defaultShows, units: '', autoMap: true, updateFunction: adjustEarthSurfaceVisibility, folder: folderRendering},
  showEarthsAtmosphere: {value: true, units: '', autoMap: true, updateFunction: adjustEarthAtmosphereVisibility, folder: folderRendering},
  earthTextureOpacity: {value: 1, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustEarthTextureOpacity, folder: folderRendering},
  tetherMinOpacity: {value: 0.03, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustTetherOpacity, folder: folderRendering},
  tetherMaxOpacity: {value: 0.70, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustTetherOpacity, folder: folderRendering},
  tetherDistanceFactor: {value: -14.5, units: '', autoMap: true, min: -30, max: -10, updateFunction: adjustTetherDistanceFactor, folder: folderRendering},
  showMoon: {value: defaultShows, units: '', autoMap: true, updateFunction: adjustMoonsVisibility, folder: folderRendering},
  showStars: {value: defaultShows, units: '', autoMap: true, updateFunction: adjustStarsVisibility, folder: folderRendering},
  showEarthAxis: {value: false, units: '', autoMap: true, updateFunction: earthAxisObjectUpdate, folder: folderRendering},
  showBackgroundPatch: {value: false, units: '', autoMap: true, updateFunction: updateBackgroundPatch, folder: folderRendering},
  showEarthEquator: {value: false, units: '', autoMap: true, updateFunction: earthEquatorObjectUpdate, folder: folderRendering},
  showMainRingCurve: {value: false, units: '', autoMap: true, updateFunction: mainRingCurveObjectUpdate, folder: folderRendering},
  showGravityForceArrows: {value: false, units: '', autoMap: true, updateFunction: gravityForceArrowsUpdate, folder: folderRendering},
  showGyroscopicForceArrows: {value: false, units: '', autoMap: true, updateFunction: gyroscopicForceArrowsUpdate, folder: folderRendering},
  forceArrowSize: {value: 50000, units: '', autoMap: true, min: 0, max: 1000000, tweenable: true, updateFunction: forceArrowsUpdate, folder: folderRendering},
  numForceArrows: {value: 32, units: '', autoMap: true, min: 0, max: 1024, step: 1, updateFunction: forceArrowsUpdate, folder: folderRendering},
  showTethers: {value: true, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering},
  showTransitSystem: {value: defaultShows, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering},
  showStationaryRings: {value: defaultShows, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showMovingRings: {value: false, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showStatorMagnets: {value: false, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  // Note: The following parameter is not the actual speed of the movng rings, but a lower speed selected to make the moving rings motion more visible 
  movingRingsSpeedForRendering: {value: 100, units: '', autoMap: true, min: 0, max: 100000, updateFunction: updateTransitsystem, folder: folderRendering},
  showTransitTube: {value: defaultShows, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  transitTubeOpacity: {value: 0.1, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showTransitTracks: {value: defaultShows, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showTransitVehicles: {value: defaultShows, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showRingTerminuses: {value: defaultShows, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showGroundTerminuses: {value: false, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showElevatorCables: {value: true, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering},
  showElevatorCars: {value: defaultShows, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showHabitats: {value: defaultShows, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showSolarArrays: {value: false, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  showLaunchTrajectory: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showMassDriverTube: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showMassDriverRail: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showMassDriverBrackets: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showMassDriverScrews: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  saveMassDriverScrewSTL: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showEvacuatedTube: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showLaunchSleds: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showLaunchVehicles: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showLaunchVehiclePointLight: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showMarkers: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showForwardAccelerationVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showUpwardAccelerationVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showAltitudeVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showAirPressureVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showDownrangeDistanceVersusTime: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showAirSpeedVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showAerodynamicDragVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showFuelMassFlowRateVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showTotalMassVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showApogeeAltitudeVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  showPerigeeAltitudeVersusTime: {value: true, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  //showConvectiveHeatingVersusTime: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  //showRadiativeHeatingVersusTime: {value: false, units: '', autoMap: true, updateFunction: updateLauncher, folder: folderRendering},
  animateMovingRingSegments: {value: true, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  animateElevatorCars: {value: true, units: '', autoMap: true, updateFunction: updateTransitsystem, folder: folderRendering},
  animateTransitVehicles: {value: true, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateTransitsystem, folder: folderRendering},
  animateLaunchSleds: {value: true, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderRendering},
  animateLaunchVehicles: {value: true, units: '', autoMap: true, min: 0, max: 1, updateFunction: updateLauncher, folder: folderRendering},
  elevatorCableOpacity: {value:0.3, units: "", autoMap: true, min: 0, max: 1, tweenable: true, updateFunction: updateTransitsystem, folder: folderRendering},
  launchTrajectoryVisibility: {value: 1, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustLaunchTrajectoryOpacity, folder: folderRendering},
  cameraFieldOfView: {value: 45, units: '', autoMap: true, min: 0, max: 90, tweenable: true, updateFunction: updateCamerFieldOfView, folder: folderRendering},
  orbitControlsAutoRotate: {value: false, units: '', autoMap: true, updateFunction: updateOrbitControlsRotateSpeed, folder: folderRendering},
  orbitControlsRotateSpeed: {value: 0.1, units: '', autoMap: true, min: -10, max: 10, updateFunction: updateOrbitControlsRotateSpeed, folder: folderRendering},
  logZoomRate: {value: -2, units: '', autoMap: true, min: -5, max: -1, updateFunction: updateOrbitControlsRotateSpeed, folder: folderRendering},
  perfOptimizedThreeJS: {value: false, units: '', autoMap: true, min: 5, max: 90, updateFunction: updatePerfOptimzation, folder: folderRendering},
  tweeningDuration: {value: 6000, units: '', autoMap: true, min: 0, max: 1000000, updateFunction: updatedParam, folder: folderRendering},
  pKeyAltitudeFactor: {value: 1, units: '', autoMap: true, min: 0, max: 2, updateFunction: updatedParam, folder: folderRendering},
  controlCameraFromJsonDuringCapture: {value: false, autoMap: true, updateFunction: updatedParam, folder: folderRendering},
  jsonFileCameraControlHelper: {value: false, autoMap: true, updateFunction: updatedParam, folder: folderRendering},
  //showStats: {value: false, units: '', autoMap: true, updateFunction: updateStats, folder: folderRendering},
  // showEarthClouds: {value: true, units: '', autoMap: true, updateFunction: adjustEarthCloudsVisibility, folder: folderRendering},
  // earthCloudsOpacity: {value: 1, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustEarthCloudsOpacity, folder: folderRendering},
  verboseLogging: {value: true, units: '', autoMap: true, folder: folderRendering},
}

function updatePerfOptimzation() {
  if (guidParam['perfOptimizedThreeJS']) {
    scene.matrixWorldAutoUpdate = false
  }
  else {
    scene.matrixWorldAutoUpdate = true
  }
}

const current = guidParamWithUnits['powerRequirement'].value / guidParamWithUnits['powerVoltageAcrossLoad'].value
const powerLostInConductor = guidParamWithUnits['powerRequirement'].value * guidParamWithUnits['powerLostInConductorFactor'].value
const voltageDropOverWires = powerLostInConductor / current
const wireResistance = voltageDropOverWires / current
const wireLength = 2*84354.4319347572  // This needs to be computed in the tether math section
const wireCrossSectionalArea = wireLength / guidParamWithUnits['powerConductorConductivity'].value / wireResistance
const wireCrossSectionalArea_mm2perkm = wireCrossSectionalArea * 1000 * 1000000
const wireDiameter = 2 * Math.sqrt(wireCrossSectionalArea_mm2perkm / Math.PI)

// A = S*V = kg−1⋅m−2⋅s3⋅A2*m-1 * kg·m2·s−3·A−1
// WireResistance = Voltage^2 / Power
// CrossSectionalArea = Length / Conductivity / WireResistance

// Override one of the initial values with a calcuated value...

// The GUI() object doesn't accept out key value pairs, so we need to create a simplified structure in order for GUI to work
const guidParam = {}
Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  guidParam[k] = v.value
})

// Add controls for color (perhaps we can add this to the dParamWithUnits structure?)
guidParam["tetherColor"] = "#8699c6"
guidParam["elevatorCableColor"] = "#598282"
folderRendering.addColor(guidParam, "tetherColor").name("tetherColor").onChange(()=>{
  // tetherMaterial.color.set(tetherColor)
  tetherMaterial.uniforms["color"].value = new THREE.Color(guidParam["tetherColor"]);
  tetherMaterial.uniformsNeedUpdate = true;
})
folderRendering.addColor(guidParam, "elevatorCableColor").name("elevatorCableColor").onChange(()=>{
  // elevatorCableMaterial.color.set(tetherColor)
  elevatorCableMaterial.uniforms["color"].value = new THREE.Color(guidParam["elevatorCableColor"]);
  elevatorCableMaterial.uniformsNeedUpdate = true;
})

const nonGUIParams = {}
CapturePresets.applyCapturePreset(guidParamWithUnits, guidParam, gui, nonGUIParams)

const enableLaunchSystem = nonGUIParams['enableLaunchSystem'] || true

// Add sliders for each entry in guidParamWithUnits to the gui...

// Constants controlled by pull-pown lists
const tetherFibers = {
  Custom: 'CUSTOM',
  CarbonFiber: 'CARBON_FIBER',
  Graphene: 'GRAPHENE',
};
const coilConductorMaterials = {
  Aluminum: 'ALUMINUM',
  Copper: 'COPPER',
  Custom: 'CUSTOM',
}

guidParam['tetherFiber'] = tetherFibers.CarbonFiber
guidParam['coilConductorMaterial'] = coilConductorMaterials.Aluminum
guidParam['cameraPreset'] = cameraPresets.Default
folderMaterials.add(guidParam, 'tetherFiber', tetherFibers).onChange(updateTetherFiber)
folderMaterials.add(guidParam, 'coilConductorMaterial', coilConductorMaterials ).onChange(updateCoilConductorMaterial)
folderCamera.add(guidParam, 'cameraPreset', cameraPresets)

// Add automapped sliders
Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  if (v.step) {
    guidParamWithUnits[k].folder.add(guidParam, k, v.min, v.max).onChange(v.updateFunction).step(v.step)
  }
  else {
    guidParamWithUnits[k].folder.add(guidParam, k, v.min, v.max).onChange(v.updateFunction)
  }
})

function updateTetherFiber() {
  switch (guidParam['tetherFiber']) {
    case tetherFibers.CarbonFiber:
      dParamWithUnits['tetherFiberDensity'] = {value: guidParamWithUnits['tetherFiberDensityCarbonFiber'].value, units: guidParamWithUnits['tetherFiberDensityCarbonFiber'].units}
      dParamWithUnits['tetherFiberTensileStrength'] = {value: guidParamWithUnits['tetherFiberTensileStrengthCarbonFiber'].value, units: guidParamWithUnits['tetherFiberTensileStrengthCarbonFiber'].units}
      dParamWithUnits['tetherFiberCost'] = {value: guidParamWithUnits['tetherFiberCostCarbonFiber'].value, units: guidParamWithUnits['tetherFiberCostCarbonFiber'].units}
      break;
    case tetherFibers.Graphene:
      dParamWithUnits['tetherFiberDensity'] = {value: guidParamWithUnits['tetherFiberDensityGraphene'].value, units: guidParamWithUnits['tetherFiberDensityGraphene'].units}
      dParamWithUnits['tetherFiberTensileStrength'] = {value: guidParamWithUnits['tetherFiberTensileStrengthGraphene'].value, units: guidParamWithUnits['tetherFiberTensileStrengthGraphene'].units}
      dParamWithUnits['tetherFiberCost'] = {value: guidParamWithUnits['tetherFiberCostGraphene'].value, units: guidParamWithUnits['tetherFiberCostGraphene'].units}
      break;
    case tetherFibers.Custom:
      dParamWithUnits['tetherFiberDensity'] = {value: guidParamWithUnits['tetherFiberDensityCustom'].value, units: guidParamWithUnits['tetherFiberDensityCustom'].units}
      dParamWithUnits['tetherFiberTensileStrength'] = {value: guidParamWithUnits['tetherFiberTensileStrengthCustom'].value, units: guidParamWithUnits['tetherFiberTensileStrengthCustom'].units}
      dParamWithUnits['tetherFiberCost'] = {value: guidParamWithUnits['tetherFiberCostCustom'].value, units: guidParamWithUnits['tetherFiberCostCustom'].units}
      break;
  }
}

function updateCoilConductorMaterial() {
  switch (guidParam['coilConductorMaterial']) {
    case coilConductorMaterials.Copper:
      dParamWithUnits['coilConductorMaterialResistivity'] = {value: guidParamWithUnits['coilConductorMaterialResistivityCopper'].value, units: guidParamWithUnits['coilConductorMaterialResistivityCopper'].units}
      dParamWithUnits['coilConductorMaterialDensity'] = {value: guidParamWithUnits['coilConductorMaterialDensityCopper'].value, units: guidParamWithUnits['coilConductorMaterialDensityCopper'].units}
      dParamWithUnits['coilConductorMaterialCost'] = {value: guidParamWithUnits['coilConductorMaterialCostCopper'].value, units: guidParamWithUnits['coilConductorMaterialCostCopper'].units}
      break;
    case coilConductorMaterials.Aluminum:
      dParamWithUnits['coilConductorMaterialResistivity'] = {value: guidParamWithUnits['coilConductorMaterialResistivityAluminum'].value, units: guidParamWithUnits['coilConductorMaterialResistivityAluminum'].units}
      dParamWithUnits['coilConductorMaterialDensity'] = {value: guidParamWithUnits['coilConductorMaterialDensityAluminum'].value, units: guidParamWithUnits['coilConductorMaterialDensityAluminum'].units}
      dParamWithUnits['coilConductorMaterialCost'] = {value: guidParamWithUnits['coilConductorMaterialCostAluminum'].value, units: guidParamWithUnits['coilConductorMaterialCostAluminum'].units}
      break;
    case coilConductorMaterials.Custom:
      dParamWithUnits['coilConductorMaterialResistivity'] = {value: guidParamWithUnits['coilConductorMaterialResistivityCustom'].value, units: guidParamWithUnits['coilConductorMaterialResistivityCustom'].units}
      dParamWithUnits['coilConductorMaterialDensity'] = {value: guidParamWithUnits['coilConductorMaterialDensityCustom'].value, units: guidParamWithUnits['coilConductorMaterialDensityCustom'].units}
      dParamWithUnits['coilConductorMaterialCost'] = {value: guidParamWithUnits['coilConductorMaterialCostCustom'].value, units: guidParamWithUnits['coilConductorMaterialCostCustom'].units}
      break;
  }
}

// Add an additional button to the gui to display instructions for the new user
function displayHelp() {
  alert(`"Z" and "X" keys zoom in and out.\n` +
        `"R/L" raises and lowers the ring.\n` +
        `"I" causes the camera to orbit around the center of the ring and makes "up" align with the ring's axis of rotation.\n` +
        `"O" causes the camera to orbit around the center of the planet and makes "up" align with the planet's axis of rotation.\n` +
        `"P" key moves the point that the simulation orbits around. New position will where the sprite intersects the object that its hovering over. Only a few objects are supported though (e.g. the planet\'s surface, some tubes)\n` +
        `"0" will track the nearest launch vehicle.\n` +
        `"1" will track the nearest transit vehicle.\n` +
        `"2" will track the nearest elecator car.\n` +
        `"8" places the moon in the background.\n` +
        `"9" will change camera from dolly tracking to pan and tilt.\n`)
}
guidParam['Help'] = displayHelp
gui.add(guidParam, 'Help')

// Actual Design Parameters derived from slider values
let dParamWithUnits = {}
const specs = {}
let kmlFile = ''
let specsFile = ''

function updatedParam() {   // Read as "update_dParam"
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    v.value = guidParam[k]
  })
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    if (v.autoMap) {
      dParamWithUnits[k] = {value: v.value, units: v.units}
    }
  })
  // The following parameters are mapped "manually" from the gui to the model
  dParamWithUnits['equivalentLatitude'] = {value: guidParamWithUnits['equivalentLatitude'].value / 180 * Math.PI, units: "radians"}
  const alpha = guidParamWithUnits['moveRingFactor'].value
  dParamWithUnits['ringEccentricity'] = {value: tram.lerp(guidParamWithUnits['buildLocationRingEccentricity'].value, guidParamWithUnits['finalLocationRingEccentricity'].value, alpha), units: ""}
  dParamWithUnits['massDriverLength'] = {value: dParamWithUnits['launcherMassDriverExitVelocity'].value**2 / 2 / dParamWithUnits['launcherMassDriverForwardAcceleration'].value, units: "m"}
  updateTetherFiber()
  updateCoilConductorMaterial()
}

updatedParam()

function updateTransitsystem() {
  updatedParam()
  crv = tetheredRingSystems[0].crv
  ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv)

  transitSystemObject.update(dParamWithUnits, tetheredRingRefCoordSys, specs, genSpecs, crv, radiusOfPlanet, mainRingCurve, timeSinceStart)
}

function updateLauncher() {
  updatedParam()
  launchSystemObject.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
  launchSystemObject.updateReferenceFrames(dParamWithUnits, timeSinceStart, planetSpec, crv)
  launchSystemObject.drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys)
  console.log(`renderer.info.memory: ${JSON.stringify(renderer.info.memory)}`)
}

function adjustRingDesign() {
  updateRing()
}

function adjustBackgroundOpacity() {
  updatedParam()
  renderer.setClearAlpha(guidParamWithUnits['backgroundOpacity'].value)
}

function adjustEarthSurfaceVisibility() {
  updatedParam()
  planetMeshes.visible = guidParamWithUnits['showEarthsSurface'].value
}

function adjustEarthAtmosphereVisibility() {
  updatedParam()
  atmosphereMesh.visible = guidParamWithUnits['showEarthsAtmosphere'].value
}

function adjustEarthTextureOpacity() {
  updatedParam()
  planetMeshes.traverse(child => {
    if (child.type==='Mesh') {
      if(child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms["opacity"].value = guidParamWithUnits['earthTextureOpacity'].value;
        child.material.uniformsNeedUpdate = true; 
        const newTransparent = child.material.uniforms["opacity"].value < 1.0 ? true : false;
        if(newTransparent != child.material.transparent) {
          child.material.transparent = newTransparent;
          child.material.needsUpdate = true;

        }    

      } else
        child.material.opacity = guidParamWithUnits['earthTextureOpacity'].value
    }
  })
}

function adjustTetherOpacity() {
  updatedParam()
  tetherMaterial.uniforms["tetherMinOpacity"].value = guidParamWithUnits['tetherMinOpacity'].value;
  tetherMaterial.uniforms["tetherMaxOpacity"].value = guidParamWithUnits['tetherMaxOpacity'].value;
  tetherMaterial.uniformsNeedUpdate = true
}

function adjustTetherDistanceFactor() {
  updatedParam()
  tetherMaterial.uniforms["tetherDistanceFactor"].value = 2**guidParamWithUnits['tetherDistanceFactor'].value;
  tetherMaterial.uniformsNeedUpdate = true
}

function adjustDisplacementBias() {
  updatedParam()
  planetMeshes.traverse(child => {
    if (child.type==='Mesh') {
      if (child.material.displacementMap) {
        child.material.uniforms["displacementBias"].value = guidParamWithUnits['displacementBias'].value
        child.material.uniformsNeedUpdate = true
      }
    }
  })
}

function adjustDisplacementScale() {
  updatedParam()
  planetMeshes.traverse(child => {
    if (child.type==='Mesh') {
      if (child.material.displacementMap) {
        child.material.uniforms["displacementScale"].value = guidParamWithUnits['displacementScale'].value
        child.material.uniformsNeedUpdate = true
      }
    }
  })
}

function adjustMoonsVisibility() {
  updatedParam()
  moonMesh.visible = guidParamWithUnits['showMoon'].value
}

function adjustStarsVisibility() {
  updatedParam()
  starsMesh.visible = guidParamWithUnits['showStars'].value
}

function adjustCableOpacity() {
  updatedParam()
}

function adjustLaunchTrajectoryOpacity() {
  updatedParam()
  //launchTrajectoryMaterial.opacity = dParamWithUnits['launchTrajectoryVisibility'].value
}

function adjustRingLatLon() {
  updatedParam()
  const ringLocationSpec = {
    buildLat: dParamWithUnits['buildLocationRingCenterLatitude'].value,
    buildLon: dParamWithUnits['buildLocationRingCenterLongitude'].value,
    finalLat: dParamWithUnits['finalLocationRingCenterLatitude'].value,
    finalLon: dParamWithUnits['finalLocationRingCenterLongitude'].value
  }
  const moveRingFactor = dParamWithUnits['moveRingFactor'].value
  tetheredRingSystems[0].adjustLatLon(ringLocationSpec, moveRingFactor)
}

function adjustRingLatLon2() {
  updatedParam()
  const ringLocationSpec = {
    buildLat: dParamWithUnits['buildLocationRingCenterLatitude2'].value,
    buildLon: dParamWithUnits['buildLocationRingCenterLongitude2'].value,
    finalLat: dParamWithUnits['finalLocationRingCenterLatitude2'].value,
    finalLon: dParamWithUnits['finalLocationRingCenterLongitude2'].value
  }
  const moveRingFactor = dParamWithUnits['moveRingFactor2'].value
  tetheredRingSystems[1].adjustLatLon(ringLocationSpec, moveRingFactor)
}

function setRingLatLonWithPreset() {
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    v.value = guidParam[k]
  })
  switch(guidParam['locationPresetIndex']) {
    case 0:
      // The most commonly depicted pacific ocean location. Crosses one small island in the pacific though. 
      guidParamWithUnits['equivalentLatitude'].value = equivalentLatitudePreset
      guidParamWithUnits['buildLocationRingCenterLongitude'].value = 213.7
      guidParamWithUnits['finalLocationRingCenterLongitude'].value = 186.3
      guidParamWithUnits['buildLocationRingCenterLatitude'].value = -19.2
      guidParamWithUnits['finalLocationRingCenterLatitude'].value = 14.2
      break
    case 1:
      // Alternate final location with the increased diameter needed to reach both US and China's coastlines (note: too large to construct in the Pacific Ocean)
      guidParamWithUnits['equivalentLatitude'].value = 30.8
      guidParamWithUnits['buildLocationRingCenterLongitude'].value = 213.7
      guidParamWithUnits['finalLocationRingCenterLongitude'].value = 182
      guidParamWithUnits['buildLocationRingCenterLatitude'].value = -19.2
      guidParamWithUnits['finalLocationRingCenterLatitude'].value = 11
      break
    case 2:
      // Alastair proposed a new ring construction location which is slightly bigger but does not cross any islands.
      guidParamWithUnits['equivalentLatitude'].value = 34
      guidParamWithUnits['buildLocationRingCenterLongitude'].value = 137
      guidParamWithUnits['finalLocationRingCenterLongitude'].value = 137
      guidParamWithUnits['buildLocationRingCenterLatitude'].value = -66.5
      guidParamWithUnits['finalLocationRingCenterLatitude'].value = -66.5
      break
    case 3:
      // This is a build location that only crosses northern Russia and Iceland. It really maximizes the diameter of the tethered ring and thus minimizes the costs.
      // Certainly, it could be an interesting option for Russia if they can negotiate the use of Antarctica for this would be willing to level some land in Siberia.
      guidParamWithUnits['equivalentLatitude'].value = 8.1
      guidParamWithUnits['buildLocationRingCenterLongitude'].value = 249.2
      guidParamWithUnits['finalLocationRingCenterLongitude'].value = 249.2
      guidParamWithUnits['buildLocationRingCenterLatitude'].value = 14.6
      guidParamWithUnits['finalLocationRingCenterLatitude'].value = 14.6
      break
    case 4:
      // This is a build location that only crosses the United States. Tricky to construct here because the Rocky Mountains would get in the way of the mass stream;
      // however, probably easier to solve this problem than to create the concentrated turn-a-round needed for a partial orbital ring or a lofstrom loop.
      guidParamWithUnits['equivalentLatitude'].value = 10
      guidParamWithUnits['buildLocationRingCenterLongitude'].value = 269.64
      guidParamWithUnits['finalLocationRingCenterLongitude'].value = 269.64
      guidParamWithUnits['buildLocationRingCenterLatitude'].value = -36.9
      guidParamWithUnits['finalLocationRingCenterLatitude'].value = -36.9
      break
    case 5:
      // This is a build location that only crosses Mexico. Tricky to construct here because mountains would get in the way of the mass-stream;
      // however, probably easier to solve this problem than to create the concentrated turn-a-round needed for a partial orbital ring or a Lofstrom Loop.
      guidParamWithUnits['equivalentLatitude'].value = 16
      guidParamWithUnits['buildLocationRingCenterLongitude'].value = 268
      guidParamWithUnits['finalLocationRingCenterLongitude'].value = 268
      guidParamWithUnits['buildLocationRingCenterLatitude'].value = -49
      guidParamWithUnits['finalLocationRingCenterLatitude'].value = -49
      break
    case 6:
      // This is a build location that only crosses Indonesia and Malaysia. Tricky to construct here because mountains would get in the way of the mass-stream;
      // however, probably easier to solve this problem than to create the concentrated turn-a-round needed for a partial orbital ring or a Lofstrom Loop.
      guidParamWithUnits['equivalentLatitude'].value = 16
      guidParamWithUnits['buildLocationRingCenterLongitude'].value = 170
      guidParamWithUnits['finalLocationRingCenterLongitude'].value = 170
      guidParamWithUnits['buildLocationRingCenterLatitude'].value = -36.6
      guidParamWithUnits['finalLocationRingCenterLatitude'].value = -36.6
      break
  }
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    guidParam[k] = v.value
  })
  updatedParam()
  adjustRingLatLon()
  //tetheredRingSystems[0].gimbalTo(dParamWithUnits['ringCenterLatitude'].value, dParamWithUnits['ringCenterLongitude'].value)
  adjustRingDesign()
}

// Three.js Rendering Setup
let simContainer = document.querySelector('#simContainer')

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster()
const scene = new THREE.Scene()
const renderToBuffer = false // Hack - needs a GUI control still

// Background image camera (will be created/defined during capture)
let backgroundCamera = null
let backgroundScene = null
let background = null
const backgroundTextureLoader = new THREE.TextureLoader()
let backgroundTexture = []
let backgroundMaterial
if (dParamWithUnits['controlCameraFromJsonDuringCapture'].value) {
  for (let i=0; i<400; i++) {
    backgroundTexture[i] = await backgroundTextureLoader.loadAsync(`./textures/googleEarthImages/NewZealandLaunchSite_${i.toString().padStart(3, '0')}.jpeg`, function(texture) {})
  }
}
else {
  // Hack to avoid error if above file is missing
    backgroundTexture[0] = await backgroundTextureLoader.loadAsync('./textures/myakka_oli_2022031_lrg.jpg', function(texture) {})
}

// Overlay an XY chart over the scene
let sceneOrtho = new THREE.Scene()
let logoSprite, logoSpriteWidth, logoSpriteHeight
const width = simContainer.offsetWidth
const height = simContainer.offsetHeight
let cameraOrtho = new THREE.OrthographicCamera( - width / 2, width / 2, height / 2, - height / 2, 1, 10 );
cameraOrtho.position.z = 10
const spriteTextureLoader = new THREE.TextureLoader()
const spriteMap = spriteTextureLoader.load( './textures/TransparentLogo.png', createLogoSprite)

function createLogoSprite(texture) {
  const spriteMaterial = new THREE.SpriteMaterial( { map: texture } )
  logoSpriteWidth = spriteMaterial.map.image.width / 8
  logoSpriteHeight = spriteMaterial.map.image.height / 8
  logoSprite = new THREE.Sprite( spriteMaterial )
  logoSprite.center.set( 0.5, 0.5 )
  logoSprite.scale.set( logoSpriteWidth, logoSpriteHeight, 1 )
  sceneOrtho.add( logoSprite )
  updateLogoSprite()
}

function updateLogoSprite() {
  if (logoSprite) {
    updatedParam()
    const width = simContainer.offsetWidth
    const height = simContainer.offsetHeight
    logoSprite.position.set( -width/2 + logoSpriteWidth/2, height/2 - logoSpriteHeight/2, 1 ) // top left  
    logoSprite.visible = dParamWithUnits['showLogo'].value
  }
}

const xyChart = new XYChart()
xyChart.setWidth(1000)
xyChart.setHeight(300)
xyChart.setMinX(0)
xyChart.setMinY(0)
xyChart.setMaxX(500)
xyChart.setMaxY(100)
xyChart.setMajorX(100)
xyChart.setMajorY(10)
xyChart.setMinorX(10)
xyChart.setMinorY(10)
xyChart.setLegendPosition(1000-300, 80)
xyChart.name = 'xyChart'
sceneOrtho.add(xyChart)

updateXYChart()

function updateXYChart() {
  updatedParam()
  const width = simContainer.offsetWidth
  const height = simContainer.offsetHeight
  xyChart.position.set(-width/2 + 0.15*xyChart.width/2, height/2 - 1.15*xyChart.height, 1 );
  xyChart.visible = dParamWithUnits['showXYChart'].value
  xyChart.drawAxes()
  xyChart.drawGridlines()
  xyChart.labelAxes("Time (s)", "")
}

// Used for saving the rendered images to series of numbered files
let bufferTexture
if (renderToBuffer) {
  const imageDumpWidth = 128
  const imageDumpHeight = 72
  bufferTexture = new THREE.WebGLRenderTarget( imageDumpWidth, imageDumpHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter});
  //bufferTexture = new THREE.WebGLRenderTarget( imageDumpWidth, imageDumpHeight, { samples: 4, type: THREE.HalfFloatType });
}

//scene.matrixAutoUpdate = false
scene.matrixWorldAutoUpdate = true

//scene.fog = new THREE.FogExp2(0x202040, 0.000005)

//scene.background = new THREE.Color( 0xffffff )
//scene.background = null
const fov = dParamWithUnits['cameraFieldOfView'].value
const aspectRatio = simContainer.offsetWidth/simContainer.offsetHeight
//console.log("W,H ", simContainer.offsetWidth, simContainer.offsetHeight)
let nearClippingPlane
if (enableVR) {
  // Bring the clipping plane in close so that the controller models don't get clipped.
  nearClippingPlane = 0.1
}
else {
  nearClippingPlane = 0.1 * radiusOfPlanet
}
let farClippingPlane = 10 * radiusOfPlanet
let extraDistanceForCamera = 10000

const camera = new THREE.PerspectiveCamera(fov, aspectRatio, nearClippingPlane, farClippingPlane)
camera.name = 'camera'

// The Camera group is a place where we will add things that should always be close to the user, wherever the user happens to be, such as VR controllers, for example, and maybe an in-VR gui for the user to interact with.
// We will also move the camera group rather than the camera when we're navigating around the scene, for example when interacting with the orbit controls.
const cameraGroup = new THREE.Group()
cameraGroup.name = 'cameraGroup'
cameraGroup.add(camera)
if (!enableVR) {
  camera.position.z = -30 * radiusOfPlanet/8
}
cameraGroup.matrixValid = false
camera.matrixValid = false

function updateCamerFieldOfView() {
  updatedParam()
  camera.fov = dParamWithUnits['cameraFieldOfView'].value
}

function updateOrbitControlsRotateSpeed() {
  updatedParam()
  orbitControls.autoRotate = dParamWithUnits['orbitControlsAutoRotate'].value
  orbitControls.autoRotateSpeed = dParamWithUnits['orbitControlsRotateSpeed'].value
}

// Need to add these two lines to have the planet apper in VR
if (enableVR) {
  cameraGroup.position.z = -1.005 * radiusOfPlanet
  cameraGroup.rotation.z = Math.PI / 2
  cameraGroup.rotation.y = -Math.PI / 2
  cameraGroup.rotateY(Math.PI)
  cameraGroup.matrixValid = false
}
scene.add(cameraGroup)

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: dParamWithUnits['backgroundOpacity'].value,  // Make the background transparent
  //logarithmicDepthBuffer: true,
  canvas: document.querySelector('canvas'),
  // These extra parameters may improve quaily. Need to test.
  // samples: 4,
  // type: THREE.HalfFloatType
})
//renderer.setSize(innerWidth, innerHeight)
renderer.setSize(simContainer.offsetWidth, simContainer.offsetHeight)
//renderer.setClearColor( 0x000000, 0 );
//console.log("W,H ", simContainer.offsetWidth, simContainer.offsetHeight)
renderer.setPixelRatio(window.devicePixelRatio)
if (enableVR) {
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType( 'local' )
}
renderer.autoClear = false


//document.body.appendChild(renderer.domElement)
//const stats = new Stats()
//simContainer.appendChild( stats.dom )

const orbitControls = new OrbitControls(camera, renderer.domElement)
orbitControls.addEventListener('change', orbitControlsEventHandler)

//orbitControls.autoRotate = true
orbitControls.autoRotateSpeed = dParamWithUnits['orbitControlsRotateSpeed'].value
orbitControls.enableDamping = true
//orbitControls.dampingFactor *= 0.1 
//orbitControls.enablePan = true


orbitControls.target.copy(nonGUIParams['orbitControlsTarget'])
orbitControls.upDirection.copy(nonGUIParams['orbitControlsUpDirection'])
orbitControls.object.position.copy(nonGUIParams['orbitControlsObjectPosition'])
camera.up.copy(nonGUIParams['cameraUp'])


const sunLight = new THREE.DirectionalLight(0x0f0f0f0, 1)
sunLight.name = 'sunlight'
sunLight.position.set(0, -6 * radiusOfPlanet/8, -20 * radiusOfPlanet/8)
//sunLight.position.set(0, 6 * radiusOfPlanet/8, -20 * radiusOfPlanet/8)
sunLight.matrixValid = false
if (guidParam['perfOptimizedThreeJS']) sunLight.freeze()
scene.add(sunLight)

const ambientLight = new THREE.AmbientLight(0x4f4f4f, 2)
ambientLight.name = 'ambientLight'
scene.add(ambientLight)

const planetCoordSys = new THREE.Group()
planetCoordSys.name = 'planetCoordSys'
if (dParamWithUnits['controlCameraFromJsonDuringCapture'].value) {
  // We need to modify the planet's shape from sperical to oblate spheroid to match Google Earth's shape
  // This modification seems to have undesirable side effects though, so lots more work will be needed to get this right.
planetCoordSys.scale.y = 1.0 - 1.0/WGS84FlattenningFactor // Squishes the earth (and everything else) by the correct flattening factor
}
else {
  planetCoordSys.scale.y = 1.0
}
scene.add(planetCoordSys)
if (enableVR) {
  planetCoordSys.rotation.y = Math.PI * -5.253 / 16
  planetCoordSys.rotation.x = Math.PI * -4 / 16
  planetCoordSys.matrixValid = false
}

const fakeCamera = new THREE.PerspectiveCamera(fov, aspectRatio, nearClippingPlane, farClippingPlane)
fakeCamera.name = 'fakeCamera'
fakeCamera.rotateX(Math.PI/2)
fakeCamera.rotateZ(Math.PI/2)
planetCoordSys.add(fakeCamera)
const fakeCameraHelper = new THREE.CameraHelper( fakeCamera )
fakeCameraHelper.name = 'fakeCameraHelper'
fakeCameraHelper.visible = false
planetCoordSys.add(fakeCameraHelper)
planetCoordSys.add(fakeCamera)

const planetSpec = tram.getPlanetSpec('Earth')


let planetMeshes, atmosphereMesh, backgroundPatchMesh
// ToDo: Need to modify this code so that we can enable/disable these objects at anytime.
if (dParamWithUnits['showEarthsSurface'].value || dParamWithUnits['showEarthsAtmosphere'].value || dParamWithUnits['showBackgroundPatch'].value) {
  [planetMeshes, atmosphereMesh, backgroundPatchMesh] = new planet(dParamWithUnits, planetSpec, enableVR, nonGUIParams)
  if (dParamWithUnits['showEarthsSurface']) planetCoordSys.add(planetMeshes)
  if (dParamWithUnits['showEarthsAtmosphere']) planetCoordSys.add(atmosphereMesh)
  if (dParamWithUnits['showBackgroundPatch']) planetCoordSys.add(backgroundPatchMesh)
}

let backgroundPatchActive = false
function updateBackgroundPatch() {

  updatedParam()
  if (!backgroundPatchActive && dParamWithUnits['showBackgroundPatch'].value) {
    planetCoordSys.add(backgroundPatchMesh)
    backgroundPatchActive = true
  }
  else if (backgroundPatchActive && !dParamWithUnits['showBackgroundPatch'].value) {
    planetCoordSys.remove(backgroundPatchMesh)
    backgroundPatchActive = false
  }
  
}

const moonTexture = new THREE.TextureLoader().load("./textures/moon.jpg")
moonTexture.name = 'moon'
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(radiusOfPlanet * 0.27, 64, 32),
  new THREE.MeshStandardMaterial({
    map: moonTexture,
  })
)
moonMesh.name = 'moon'
const moonOrbitDistance = 384467000 // m
moonMesh.position.set(moonOrbitDistance, 0, 0)
moonMesh.rotation.set(0, 0, 0)
moonMesh.visible = dParamWithUnits['showMoon'].value
planetCoordSys.add(moonMesh)



// "Cleaner Code" Section (under construction)
const universeSpec = {
  gravitationalConstant: 0.0000000000667408
}


const tetheredRingSpecs = nonGUIParams['getRingSpecs']()

// tetheredRingSpecs.push({locationSpec: {buildLat: -19.2, buildLon:213.7, finalLat: 14.33, finalLon: 186.3}})
// tetheredRingSpecs.push({locationSpec: {buildLat: -19.2, buildLon:213.7, finalLat: 22.5, finalLon: 304.365}})

// const n = 20
// for (let i = 0; i<n; i++) {
//   const finalLonValue = i / n * 360 
//   tetheredRingSpecs.push(
//     {locationSpec: {buildLat: -19.2, buildLon:213.7, finalLat: 14.33, finalLon: finalLonValue}}
//   )
// }

// const coordinates = tram.getDodecahedronFaceCoordinates();
// coordinates.forEach(coord => {
//   const lat = coord.lat*180/Math.PI + Math.random()*10
//   const lon = coord.lon*180/Math.PI + Math.random()*10
//   tetheredRingSpecs.push(
//     {locationSpec: {buildLat: -19.2, buildLon:213.7, finalLat: lat, finalLon: lon}}
//   )
// })

const tetheredRingSystems = []
tetheredRingSpecs.forEach((ringSpec, index) => {
  const tempTetheredRingSystem = new tetheredRingSystem(dParamWithUnits, universeSpec, planetSpec, ringSpec, index, genKMLFile, kmlFile)
  tetheredRingSystems.push(tempTetheredRingSystem)
  planetCoordSys.add(tempTetheredRingSystem.getMesh())
})

// End "Cleaner Code" Section

// Transitional code...

// ToDo: Still Necessary?
planetCoordSys.updateWorldMatrix(true)
tetheredRingSystems.forEach(tetheredRingSystem =>{
  const tetheredRingRefCoordSys = tetheredRingSystem.getMesh()  
  tetheredRingRefCoordSys.updateMatrixWorld(true)
})

let tetheredRingRefCoordSys = tetheredRingSystems[0].getMesh()
let ringToPlanetRotation = tetheredRingSystems[0].ringToPlanetQuaternion
let crv = tetheredRingSystems[0].crv
let mainRingCurve = tetheredRingSystems[0].mainRingCurve

// End Transitional code

const grayMaterial = new THREE.MeshBasicMaterial({color: 0x3f3f4f})
const whiteMaterial = new THREE.MeshBasicMaterial({color: 0x5f5f5f})
const greenMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00})
const blueMaterial = new THREE.MeshLambertMaterial({color: 0x0000ff})
const redMaterial = new THREE.MeshLambertMaterial({color: 0xff0000})
const metalicMaterial = new THREE.MeshBasicMaterial({color: 0x878681, transparent: false})
const transparentMaterial1 = new THREE.MeshPhongMaterial( {transparent: true, opacity: 0.55})
const transparentMaterial2 = new THREE.MeshLambertMaterial({color: 0xffff80, transparent: true, opacity: 0.35})
const transparentMaterial3 = new THREE.MeshLambertMaterial({color: 0xffff80, transparent: true, opacity: 0})

const tetherMaterial = new THREE.ShaderMaterial( {
  uniforms: {
    'tetherMinOpacity': { value: guidParamWithUnits['tetherMinOpacity'].value  },
    'tetherMaxOpacity': { value: guidParamWithUnits['tetherMaxOpacity'].value  },
    'tetherDistanceFactor': {value: 2**guidParamWithUnits['tetherDistanceFactor'].value },
    'color': {value: new THREE.Color(guidParam["tetherColor"]) }
  },
  vertexShader: document.getElementById( 'tetherVertexShader' ).textContent,
  fragmentShader: document.getElementById( 'tetherFragmentShader' ).textContent,
  transparent: true,
  blending: THREE.NormalBlending
} )

var cableMaterial = new THREE.LineBasicMaterial({
  vertexColors: false,
  //color: 0x4897f8,
  transparent: true,
  opacity: dParamWithUnits['elevatorCableOpacity'].value
})


const earthAxisObject = new markers.earthAxisObject(planetCoordSys, dParamWithUnits, radiusOfPlanet)
function earthAxisObjectUpdate() {updatedParam(); earthAxisObject.update(dParamWithUnits, radiusOfPlanet)}

const earthEquatorObject = new markers.earthEquatorObject(planetCoordSys, dParamWithUnits, radiusOfPlanet)
function earthEquatorObjectUpdate() {updatedParam(); earthEquatorObject.update(dParamWithUnits, radiusOfPlanet)}

// const orbitControlsCenterMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), grayMaterial)
// orbitControlsCenterMarker.name = 'orbitControlsCenterMarker'
// let orbitControlsCenterMarkerSize = 5000
// orbitControlsCenterMarker.position.x = 0
// orbitControlsCenterMarker.position.y = 0
// orbitControlsCenterMarker.position.z = -radiusOfPlanet
// orbitControlsCenterMarker.scale.x = orbitControlsCenterMarkerSize
// orbitControlsCenterMarker.scale.y = orbitControlsCenterMarkerSize
// orbitControlsCenterMarker.scale.z = orbitControlsCenterMarkerSize
// orbitControlsCenterMarker.matrixValid = false
// scene.add(orbitControlsCenterMarker)

// const orbitControlsSurfaceMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), greenMaterial)
// orbitControlsSurfaceMarker.name = 'orbitControlsSurfaceMarker'
// let orbitControlsSurfaceMarkerSize = 50000
// orbitControlsSurfaceMarker.position.x = 0
// orbitControlsSurfaceMarker.position.y = 0
// orbitControlsSurfaceMarker.position.z = -radiusOfPlanet
// orbitControlsSurfaceMarker.scale.x = orbitControlsSurfaceMarkerSize
// orbitControlsSurfaceMarker.scale.y = orbitControlsSurfaceMarkerSize
// orbitControlsSurfaceMarker.scale.z = orbitControlsSurfaceMarkerSize
// orbitControlsSurfaceMarker.visible = false
// orbitControlsSurfaceMarker.matrixValid = false
// scene.add(orbitControlsSurfaceMarker)

// Add Some Stars
const starGeometry = new THREE.BufferGeometry()
const starVertices = []
for ( let i = 0; i < 10000;) {
  // Probably should eliminate all of the stars that are too close to the planet 
  // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // x
  // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // y
  // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // z
  // Better code...
  // Create stars at random positions and then push them all 2,000,000 km away from the origin
  const XYZ = new THREE.Vector3(
    THREE.MathUtils.randFloat(-1, 1),
    THREE.MathUtils.randFloat(-1, 1),
    THREE.MathUtils.randFloat(-1, 1))
  if (XYZ.length()<=1) {
    // The random position needs to be not on the origin and also within a unit sphere
    XYZ.normalize().multiplyScalar(256 * radiusOfPlanet)
    starVertices.push(XYZ.x, XYZ.y, XYZ.z)
    i++
  }
}
starGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( starVertices, 3 ) )
const starsMesh = new THREE.Points( starGeometry, new THREE.PointsMaterial( { color: 0xFFFFFF } ) )
starsMesh.name = 'stars'
scene.add(starsMesh)  // Todo: This might make the stars rotate with planet. Maybe need another Group...

// Generate the main ring
let ctv = new tram.commonTetherVariables()
let ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv)
let tvv = new tram.transitVehicleVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv)


const referencePoint = new THREE.Vector3(0, radiusOfPlanet + crv.currentMainRingAltitude, 0)
const mainRingCurveObject = new markers.mainRingCurveObject(tetheredRingRefCoordSys, dParamWithUnits, mainRingCurve, referencePoint)

function mainRingCurveObjectUpdate() {
  updatedParam()
  mainRingCurveObject.update(tetheredRingRefCoordSys, dParamWithUnits, mainRingCurve, referencePoint)
}

let listsOfTethers = []

tetheredRingSystems.forEach((tetheredRingSystem, index) =>{
  const tetheredRingRefCoordSys = tetheredRingSystem.getMesh()  

  // Tethers
  const listOfTethers = constructTethers(tetheredRingRefCoordSys)
  listsOfTethers.push(listOfTethers)
  
})

function constructTethers(tetheredRingRefCoordSys) {
  const tethers = []
  if (dParamWithUnits['showTethers'].value || genSpecs) {
    if (verbose) console.log("Constructing Tethers")
    const tetherGeometry = new TetherGeometry(radiusOfPlanet, gravitationalConstant, massOfPlanet, crv, ctv, dParamWithUnits, specs, fastTetherRender, genKMLFile, kmlFile, genSpecs, planetCoordSys, tetheredRingRefCoordSys)
    const tempTetherMesh = new THREE.LineSegments(tetherGeometry, tetherMaterial)
    tempTetherMesh.name = 'tether'
    tempTetherMesh.renderOrder = 1  // Draws the ring after rendering the planet, so that you can see the entire ring through the planet.
    if (fastTetherRender) {
      const n = dParamWithUnits['numTethers'].value
      const k = 2 * Math.PI * 2 / n
      for (let i=0; i<n/2; i++) {     // Really should be currentCatenaryTypes.length, but that value is hidden from us here
        const theta = i * k
        const referencePoint = new THREE.Vector3().setFromSphericalCoords(radiusOfPlanet + crv.currentMainRingAltitude, -(Math.PI/2 - crv.currentEquivalentLatitude), theta)
        tempTetherMesh.position.copy(referencePoint)
        tempTetherMesh.rotation.y = theta
        tempTetherMesh.matrixValid = false
        tethers[i] = tempTetherMesh.clone()
        tetheredRingRefCoordSys.add(tethers[i])
      }
    }
    else {
      tethers[0] = tempTetherMesh.clone()
      tetheredRingRefCoordSys.add(tethers[0])
    }
  }
  return tethers
}

function forceArrowsUpdate() {
  gravityForceArrowsUpdate()
  gyroscopicForceArrowsUpdate()
}

const gravityForceArrowsObject = new markers.gravityForceArrowsObject(planetCoordSys, dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation)
function gravityForceArrowsUpdate() {
  updatedParam()
  showTensileForceArrows = true
  showGravityForceArrows = true
  showInertialForceArrows = true
  gravityForceArrowsObject.update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
}

const gyroscopicForceArrowsObject = new markers.gyroscopicForceArrowsObject(planetCoordSys, dParamWithUnits, mainRingCurve, crv, radiusOfPlanet, ringToPlanetRotation)
function gyroscopicForceArrowsUpdate() {
  updatedParam()
  gyroscopicForceArrowsObject.update(dParamWithUnits, mainRingCurve, crv, radiusOfPlanet, ringToPlanetRotation)
}

let trackingPoint = null  // This is the location of the object which was under the sprite when user last pressed the 'P' key  
let lastTrackingPoint = null
let stationaryCameraTrackingMode = false
let closestVirtualLaunchVehicle = null
let closestVirtualTransitVehicle = null
let closestVirtualElevatorCar = null
let tweeningTime = 2000
let tweeningActive = false

let cameraControlActive = false
let lastCameraControlActive = false
let cameraControlStartTime = 0
let savedPosition
let savedRotation
let savedFov
let savedRenderWidth
let savedRenderHeight
let savedRendererAlpha
let printLater = false

let trackingPointMarkerMesh = new THREE.Mesh(new THREE.BoxGeometry(700, 700, 700), grayMaterial)
trackingPointMarkerMesh.name = 'trackingPointMarkerMesh'
trackingPointMarkerMesh.visible = false
planetCoordSys.add(trackingPointMarkerMesh)
let targetPointMarkerMesh = new THREE.Mesh(new THREE.BoxGeometry(700, 700, 700), blueMaterial)
targetPointMarkerMesh.name = 'targetPointMarkerMesh'
targetPointMarkerMesh.visible = false
planetCoordSys.add(targetPointMarkerMesh)
let orbitControlsMarkerMesh = new THREE.Mesh(new THREE.SphereGeometry(500, 500, 500), greenMaterial)
orbitControlsMarkerMesh.visible = false
planetCoordSys.add(orbitControlsMarkerMesh)

const numWedges = 64   // Wedges are used to keep points within meshes from becoming too spread out, losing precision, and then starting to jitter

let start, end

console.log("V6")

const transitSystemObject = new transitSystem(tetheredRingRefCoordSys, dParamWithUnits, specs, genSpecs, crv, ecv, radiusOfPlanet, mainRingCurve)

// Launch Trajectory Line
let launchSystemObject = null
if (enableLaunchSystem) {
  const timeSinceStart = 0
  launchSystemObject = new Launcher.launcher(dParamWithUnits, timeSinceStart, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, xyChart, clock, specs, genLauncherKMLFile, kmlFile)
  launchSystemObject.drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys)
}

//calculateAdditionalSpecs()
function calculateAdditionalSpecs() {
  const transitTube_r = crv.mainRingRadius + tram.offset_r(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const transitTubeSurfaceArea = (2 * Math.PI * dParamWithUnits['transitTubeTubeRadius'].value) * (2 * Math.PI * transitTube_r)
  const transitTubeInteriorVolume = (Math.PI * dParamWithUnits['transitTubeTubeRadius'].value**2) * (2 * Math.PI * transitTube_r)
  specs['transitTubeSurfaceArea'] = {value: transitTubeSurfaceArea, units: "m2"}
  specs['transitTubeInteriorVolume'] = {value: transitTubeInteriorVolume, units: "m3"}

  // Calculate equivalent space elevator mass and cost
  let T
  for (let f = 0; f<1; f++) {
    T = dParamWithUnits['tetherFiberTensileStrength'].value*1000000 / dParamWithUnits['tetherEngineeringFactor'].value
    T *= 2**f
    const hoursInSiderealDay = 23.9344696
  	const ClimberEmptyMass = 1000 //kg
    const ClimberPayloadMass = 19000 //kg
    const ClimberFuelMass = 100 //kg
    const ClimberInitialAltitude = 0 // m
    const ClimberMaxAcceleration = 9.8 // m/s2
    const ClimberTotalMass = ClimberEmptyMass + ClimberPayloadMass + ClimberFuelMass
    const GravityForce = (gravitationalConstant * ClimberTotalMass * massOfPlanet) / (radiusOfPlanet + ClimberInitialAltitude)**2
    const CentripetalForce = -ClimberTotalMass * (2 * Math.PI * (radiusOfPlanet + ClimberInitialAltitude) / (hoursInSiderealDay * 3600))**2 / (radiusOfPlanet + ClimberInitialAltitude)
    const SurfaceTerminusAnchoringForce = 10000 // N
    const TotalLoadForce = GravityForce + CentripetalForce + ClimberMaxAcceleration * ClimberTotalMass + SurfaceTerminusAnchoringForce
    const A_s = TotalLoadForce / (T*1000000)
    const ρ = dParamWithUnits['tetherFiberDensity'].value
    const R = radiusOfPlanet
    const R_g = R+35786000 //m
    const R_a = R_g * 2
    const g = 9.8  // m/s2
    const step = 1
    let r
    let A
    let V
    V = 0
    let A_prev = A_s
    //console.log(A_s, T)
    for (r = R+step; r<R_a; r+=step) {
      A = A_s * Math.exp(ρ*g*R**2/T*(1/R + R**2/2/R_g**3 - 1/r - r**2/2/R_g**3))
      V += (A_prev + A)/2 * step
      A_prev = A
    }
    const M = V * ρ
    const spaceElevatorCost = M * dParamWithUnits['tetherFiberCost'].value

    if (f==1) {
      specs['spaceElevatorTetherVolumeWithSameMaterials'] = {value: V, units: "m3"}
      specs['spaceElevatorTetherMassWithSameMaterials'] = {value: M, units: "kg"}
      specs['spaceElevatorTetherCostWithSameMaterials'] = {value: spaceElevatorCost, units: "USD"}
      specs['spaceElevatorTetherCostPerKgOfLoadWithSameMaterials'] = {value: spaceElevatorCost / (ClimberPayloadMass/g), units: "USD"}
    }
  }
}

function updateRing() {

  listsOfTethers.forEach(listOfTethers => {
    listOfTethers.forEach(tether => {
      tether.geometry.dispose()
      tether.material.dispose()
      //tether.color.dispose()
      tetheredRingRefCoordSys.remove(tether)
    })
    listOfTethers.splice(0, listOfTethers.length)
  })
  if (verbose) console.log('disposed of tethers')

  transitSystemObject.destroy(dParamWithUnits)  // Actually doesn't destroy - just removes all of the models from the scene.

  tetheredRingSystems.forEach(tetheredRingSystem => {
    tetheredRingSystem.destroy()
  })
  tetheredRingSystems.splice(0, tetheredRingSystems.length)

  // Update the parameters prior to reconsrructing the scene
  updatedParam()
  if (genSpecsFile) {
    specsFile = specsFile.concat('// GUI Parameters\n')
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + ',' + v.value + ',' + v.units + '\n')
    })

    specsFile = specsFile.concat('// Design Parameters\n')
    Object.entries(dParamWithUnits).forEach(([k, v]) => {
      if (!guidParamWithUnits.hasOwnProperty(k) || guidParamWithUnits[k].autoMap===false) {
        specsFile = specsFile.concat(k + ',' + v.value + ',' + v.units + '\n')
      }
    })
  }

  // Reconstruction Section
 
  tetheredRingSpecs.forEach((ringSpec, index) => {
    const tempTetheredRingSystem = new tetheredRingSystem(dParamWithUnits, universeSpec, planetSpec, ringSpec, index, genKMLFile, kmlFile)
    tetheredRingSystems.push(tempTetheredRingSystem)
    planetCoordSys.add(tempTetheredRingSystem.getMesh())
    if (verbose) console.log('created tetheredRingSystem ' + index)
  })

  // Transition code
  // ToDo: Still Necessary?
  planetCoordSys.updateWorldMatrix(true)
  tetheredRingSystems.forEach(tetheredRingSystem =>{
    const tetheredRingRefCoordSys = tetheredRingSystem.getMesh()  
    tetheredRingRefCoordSys.updateMatrixWorld(true)
  })

  tetheredRingRefCoordSys = tetheredRingSystems[0].getMesh()
  ringToPlanetRotation = tetheredRingSystems[0].ringToPlanetQuaternion
  crv = tetheredRingSystems[0].crv
  mainRingCurve = tetheredRingSystems[0].mainRingCurve
  
  // ToDo, need to add crv parameters to the specs file. Specifically: crv.mainRingRadius, crv.mainRingCircumference, crv.mainRingMassPerMeter, 
  ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv)

  const referencePoint = new THREE.Vector3(0, radiusOfPlanet + crv.currentMainRingAltitude, 0)
  mainRingCurveObject.update(tetheredRingRefCoordSys, dParamWithUnits, mainRingCurve, referencePoint)
  transitSystemObject.update(dParamWithUnits, tetheredRingRefCoordSys, specs, genSpecs, crv, radiusOfPlanet, mainRingCurve, [timeSinceStart])
  if (verbose) console.log('transitSystemObject.update ')
  
  tetheredRingSystems.forEach(tetheredRingSystem => {
    const tetheredRingRefCoordSys = tetheredRingSystem.getMesh()  
  
    // Tethers
    const listOfTethers = constructTethers(tetheredRingRefCoordSys)
    listsOfTethers.push(listOfTethers)
  })
  if (verbose) console.log('constructTethers ')

  if (genSpecs) tram.updateMovingRingSpecs(dParamWithUnits, crv, specs)

  tram.updateTransitSystemSpecs(dParamWithUnits, crv, specs)

  if (enableLaunchSystem) {
    updateLauncher()
    if (genSpecs) {
      tram.updateLauncherSpecs(dParamWithUnits, crv, launchSystemObject, specs)
      launchSystemObject.genLauncherSpecs(dParamWithUnits, specs)
    }
  }

  gravityForceArrowsObject.update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
  gyroscopicForceArrowsObject.update(dParamWithUnits, mainRingCurve, crv, radiusOfPlanet, ringToPlanetRotation)
  //calculateAdditionalSpecs()

  if (genSpecs) {
    guiTextOutput.innerHTML = [
      '(Press \'s\' to update)',
      '<i>Total Tethered Ring Cost</i>: ' + specs['sumOfAllCapitalCosts'].value.toFixed(2) + ' ' + specs['sumOfAllCapitalCosts'].units,
      '<i>Total Tethered Ring Cost Per Kg Supported</i>: ' + specs['capitalCostPerKgSupported'].value.toFixed(2) + ' ' + specs['capitalCostPerKgSupported'].units,
      '<i>Total Stored Energy in TWh</i>: ' + specs['movingRingsTotalKineticEnergyTWh'].value.toFixed(2) + ' ' + specs['movingRingsTotalKineticEnergyTWh'].units,
      '<i>Moving Ring\'s Speed</i>: ' + specs['movingRingsSpeed'].value.toFixed(2) + ' ' + specs['movingRingsSpeed'].units
    ].join( '<br/>' )
  }

  if (genSpecsFile) {
    //if (verbose) console.log("Generating Specs File")
    specsFile = specsFile.concat('// Derived Specifications\n')
    Object.entries(specs).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + ',' + v.value + ',' + v.units + '\n')
    })
  }
  if (verbose) console.log('done ')
}

const mouse = {
  x: undefined,
  y: undefined
}
let intersectionPoint = new THREE.Vector3
let targetPoint = new THREE.Vector3
let animateRingRaising = false
let animateRingLowering = false
let animateRingMovingOut = false
let animateRingMovingBack = false
let animateZoomingIn = false
let animateZoomingOut = false
//let animateCameraGoingUp = false
//let animateCameraGoingDown = false
let cameraSpeed = 0
let showTensileForceArrows = false
let showGravityForceArrows = false
let showInertialForceArrows = false
let timeSinceStart = 0
let prevWeAreFar1 = NaN
let prevWeAreFar2 = NaN

function animate() {
  renderer.setAnimationLoop( renderFrame )
}

// Hack
console.userdata = {'capture': 0, 'matrixAutoUpdateData': {}, 'matrixWorldUpdateData': {}}
const elevatorPosCalc = new tram.elevatorPositionCalculator(dParamWithUnits, crv, ecv)

const worldDirection = new THREE.Vector3
const tempMatrix = new THREE.Matrix4()

function renderFrame() {

  // Object Histogram Code - useful for checking that we didn't accidentally create too many objects.
  // let counts = {}
  // planetCoordSys.children.forEach(child => {
  //   if (!counts[child.name]) counts[child.name] = 0
  //   counts[child.name]++
  // })
  // console.log(tetheredRingRefCoordSys.children.length, counts)

  if (enableVR) {
    // These two lines are for the VR hand controllers
    // handleController( controller1 )
    // handleController( controller2 )
    const controllers = [controller1, controller2]
    controllers.forEach((controller, controllerIndex) => {
      if (controller.inputEvents) {
          //console.log(controller1.inputEvents.data)
        controller.inputEvents.data.gamepad.buttons.forEach((button, buttonIndex) => {
          if (button.pressed) {
            // console.log(controllerIndex, buttonIndex)            
            // 0 (trigger), 1(squeeze), 3(thumb press), 4 (A), and 5 (B) are valid
            if ((controllerIndex==1) && (buttonIndex==0)) {
              tempMatrix.identity().extractRotation( controller.matrixWorld );
              worldDirection.set( 0, 0, -1000 ).applyMatrix4( tempMatrix );
              cameraGroup.position.add(worldDirection)
            }
          }
        })
        controller.inputEvents.data.gamepad.axes.forEach((axis, axisIndex) => {
          if (axis!=0) {
            // console.log(controllerIndex, axisIndex, axis)
            // 2 (left/right) and 3 (up/down) are valid
            if ((controllerIndex==0) && (axisIndex==2)) {
              cameraGroup.rotateZ(axis/100)
            }
            if ((controllerIndex==0) && (axisIndex==3)) {
              cameraGroup.rotateX(axis/100)
            }
            if ((controllerIndex==1) && (axisIndex==2)) {
              cameraGroup.rotateY(axis/100)
            }
            if ((controllerIndex==1) && (axisIndex==3)) {
              tempMatrix.identity().extractRotation( controller.matrixWorld );
              worldDirection.set( 0, 0, 10*axis ).applyMatrix4( tempMatrix );
              cameraGroup.position.add(worldDirection)
            }
          }
        })
      }
    })
  }

  if (orbitControlsEarthRingLerpFactor!=1) {
    //console.log("Lerping...")
    orbitControlsEarthRingLerpFactor = tram.clamp(orbitControlsEarthRingLerpFactor + orbitControlsEarthRingLerpSpeed, 0, 1)

    orbitControls.enabled = false
    orbitControls.target.lerpVectors(previousTargetPoint, orbitControlsTargetPoint, orbitControlsEarthRingLerpFactor)
    const upVector = new THREE.Vector3()
    upVector.lerpVectors(previousUpVector, orbitControlsTargetUpVector, orbitControlsEarthRingLerpFactor).normalize()
    camera.up.copy(upVector)
    orbitControls.upDirection.copy(upVector)
    upVector.lerpVectors(previousUpVector, orbitControlsTargetUpVector, orbitControlsEarthRingLerpFactor).normalize()
    camera.up.copy(upVector)
    orbitControls.upDirection.copy(upVector)
    orbitControls.screenSpacePanning = false
    orbitControls.enabled = true
    orbitControls.update()
  }
  else {
    orbitControls.maxPolarAngle = orbitControlsNewMaxPolarAngle
    // const offTarget = orbitControls.target.clone().sub(orbitControlsTargetPoint).length()
    // console.log(offTarget)
    // if ((offTarget>100) && (offTarget<10000) && (orbitControlsTargetPoint.length()>radiusOfPlanet)) {
    //   orbitControls.target.lerp(orbitControlsTargetPoint, 0.02)
    //   console.log("pulling towards last target")
    // }
  }
  
  const clockDelta = clock.getDelta()
  timeSinceStart += clockDelta

  // Cause the logo to disappear after a few seconds
  if ((timeSinceStart>10) && (guidParam['showLogo']===true)) {
    guidParam['showLogo'] = false
    updateLogoSprite()
  }

  if (enableLaunchSystem) {
    launchSystemObject.animate(timeSinceStart, camera.position.clone())
  }
  transitSystemObject.animate(timeSinceStart, tetheredRingRefCoordSys, camera.position.clone(), mainRingCurve, dParamWithUnits)

  if (trackingPoint) {
    if (lastTrackingPoint) {
      if (closestVirtualLaunchVehicle!==null) {
        trackingPoint = closestVirtualLaunchVehicle.launchVehicle.getFuturePosition(closestVirtualLaunchVehicle.refFrame, 0)
      }
      else if (closestVirtualTransitVehicle!==null) {
        const localTrackingPoint = closestVirtualTransitVehicle.transitVehicle.getFuturePosition(closestVirtualTransitVehicle.refFrame, 0)
        trackingPoint = tetheredRingRefCoordSys.localToWorld(localTrackingPoint)
      }
      else if (closestVirtualElevatorCar!==null) {
        const localTrackingPoint = closestVirtualElevatorCar.elevatorCar.getFuturePosition(closestVirtualElevatorCar.refFrame, 0)
        trackingPoint = tetheredRingRefCoordSys.localToWorld(localTrackingPoint)
      }

      if (trackingPoint) {
        trackingPointMarkerMesh.position.copy(trackingPoint)
        trackingPointMarkerMesh.visible = dParamWithUnits['showMarkers'].value

        if (stationaryCameraTrackingMode) {
          orbitControls.update()
          const offset = trackingPoint.clone().sub(lastTrackingPoint)
          if (!tweeningActive) {
            orbitControls.target.add(offset)
            orbitControls.enableDamping = true
          }
          else {
            orbitControls.enableDamping = false
          }
          orbitControls.rotationSpeed = 0.1
          orbitControls.enable = true
        }
        else {
          const offset = trackingPoint.clone().sub(lastTrackingPoint)
          const angleOffset = new THREE.Quaternion().setFromUnitVectors(lastTrackingPoint.clone().normalize(), trackingPoint.clone().normalize())

          if (!tweeningActive) {
            orbitControls.target.add(offset)
            orbitControls.upDirection.applyQuaternion(angleOffset)
            camera.up.applyQuaternion(angleOffset)
            orbitControls.object.position.add(offset)
            orbitControls.enableDamping = true
          }
          else {
            orbitControls.enableDamping = false
          }
          orbitControls.enableDamping = true
          orbitControls.rotationSpeed = 1
          orbitControls.enable = true
        }
        orbitControlsMarkerMesh.position.copy(orbitControls.target)
        orbitControlsMarkerMesh.visible = dParamWithUnits['showMarkers'].value
      }
      else {
        trackingPointMarkerMesh.visible = false
      }
    }
    lastTrackingPoint = (trackingPoint) ? trackingPoint.clone() : null
  }

  if (cameraControlActive) {
    orbitControls.enabled = false
    let cameraControlCurrentTime
    if (!lastCameraControlActive) {
      // Initialize the camera control variables
      cameraControlStartTime = timeSinceStart
      cameraControlCurrentTime = 0
      if (!dParamWithUnits['jsonFileCameraControlHelper'].value) {
        savedPosition = camera.position.clone()
        savedRotation = camera.rotation.clone()
        savedFov = camera.fov
        const contextAttributes = renderer.getContextAttributes()
        savedRendererAlpha = renderer.getClearAlpha() //contextAttributes.alpha
        const drawingBufferSize = new THREE.Vector2()
        renderer.getSize(drawingBufferSize)
        savedRenderWidth = drawingBufferSize.x
        savedRenderHeight = drawingBufferSize.y
        renderer.setClearAlpha(0)  // Make the background transparent
        const width = cameraControlData['width']
        const height = cameraControlData['height']
        renderer.setSize(width, height)
        planetMeshes.traverse(planetMesh => {
          planetMesh.visible = false
        })
        atmosphereMesh.visible = false
  
        backgroundScene = new THREE.Scene()
        backgroundCamera = new THREE.OrthographicCamera( - width / 2, width / 2, height / 2, - height / 2, 1, 100 );
        backgroundCamera.position.z = 10
        backgroundScene.add(backgroundCamera)
        // const backgroundTextureLoader = new THREE.TextureLoader()
        // const backgroundTexture = backgroundTextureLoader.load('./textures/googleEarthImages/NewZealandLaunchSite_000.jpeg')
        backgroundMaterial = new THREE.MeshBasicMaterial( { map: backgroundTexture[0] } )
        const backgroundWidth = backgroundMaterial.map.image.width
        const backgroundHeight = backgroundMaterial.map.image.height
        background = new THREE.Sprite( backgroundMaterial )
        background.center.set( 0.5, 0.5 )
        background.scale.set( backgroundWidth, backgroundHeight, 1 )
        backgroundScene.add( background )
      
        //backgroundCanvas = new THREE.CanvasTexture(document.getElementById('backgroundCanvas'))
        //sceneBackground.
        // ToDo: We probably add a feature to allow capturing at an integer multiple of the recolution from GoogleEarthStudio
      }
    }
    else {
      cameraControlCurrentTime = timeSinceStart - cameraControlStartTime
    }
    // Need to calculate which time indices that are "<= cameraControlCurrentTime" and ""> cameraControlCurrentTime"
    const cameraControlFrame = cameraControlCurrentTime * cameraControlData['frameRate']
    const prevFrame = Math.min(Math.floor(cameraControlFrame), cameraControlData['numFrames'] - 1)
    const nextFrame = Math.min(prevFrame+1, cameraControlData['numFrames'] - 1)
    if (prevFrame<400) {
      backgroundMaterial.map = backgroundTexture[prevFrame]
    }
    const alpha = Math.min(cameraControlFrame - prevFrame, 1)
    const prevData = cameraControlData['cameraFrames'][prevFrame]
    const nextData = cameraControlData['cameraFrames'][nextFrame]
    const pIOver180 = Math.PI/180
    const prevDataPosition = new THREE.Vector3(prevData['position'].y, prevData['position'].z, prevData['position'].x)
    const nextDataPosition = new THREE.Vector3(nextData['position'].y, nextData['position'].z, nextData['position'].x)
    const prevDataRotation = new THREE.Vector3(prevData['rotation'].y*pIOver180, prevData['rotation'].z*pIOver180, prevData['rotation'].x*pIOver180)
    const nextDataRotation = new THREE.Vector3(nextData['rotation'].y*pIOver180, nextData['rotation'].z*pIOver180, nextData['rotation'].x*pIOver180)
    const interpolatedPosition = new THREE.Vector3().lerpVectors(prevDataPosition, nextDataPosition, alpha)
    const interpolatedRotation = new THREE.Vector3().lerpVectors(prevDataRotation, nextDataRotation, alpha)
    const interpolatedFovVertical = THREE.MathUtils.lerp(prevData['fovVertical'], nextData['fovVertical'], alpha)
    // All json file rotation parameters are initially zero (because the camera is directly above the south pole, and up is at lon = 90)
    // Tilt Up from 0 to 90 degrees increases the rotate x parameter in the json file, which three.js interprets as the z parameter
    // Panning from -90 to 0 causes a counter-clockwise twist and increases the rotate z parameter in the json file, which three.js interprets as the y parameter
    if (dParamWithUnits['jsonFileCameraControlHelper'].value) {
      fakeCamera.position.copy(interpolatedPosition)
      fakeCamera.rotation.order = 'ZXY'  // z must be before y, so not 0, 2, or 3. 
      fakeCamera.rotation.setFromVector3(interpolatedRotation) // This is rotating around z by 90 degrees
      fakeCamera.rotateX(Math.PI/2)
      fakeCamera.rotateZ(Math.PI/2)
      fakeCamera.fov = interpolatedFovVertical
      fakeCamera.updateProjectionMatrix()
      fakeCameraHelper.visible = true
      fakeCameraHelper.update()
    }
    else {
      fakeCameraHelper.visible = false
      camera.position.copy(interpolatedPosition)
      camera.rotation.order = 'ZXY'
      camera.rotation.setFromVector3(interpolatedRotation)
      camera.rotateX(Math.PI/2)
      camera.rotateZ(Math.PI/2)
      camera.fov = interpolatedFovVertical
    }
    if (cameraControlFrame>cameraControlData['numFrames']) {
      cameraControlActive = false
    }
    printLater = !lastCameraControlActive
  }
  if (!cameraControlActive && lastCameraControlActive) {
    // Restore the camera back to its original position and rotation
    if (!dParamWithUnits['jsonFileCameraControlHelper'].value) {
      camera.position.copy(savedPosition)
      camera.rotation.copy(savedRotation)
      camera.fov = savedFov
      // If we are capturing a video, then stop the capture as well
      if (dParamWithUnits['controlCameraFromJsonDuringCapture'].value && capturer) captureStop()
      // Restore the renderer back to its original configuration
      renderer.setClearAlpha(savedRendererAlpha)
      renderer.setSize(savedRenderWidth, savedRenderHeight)
      // Restore the planet and atmosphere textures
      planetMeshes.traverse(planetMesh => {
        planetMesh.visible = dParamWithUnits['showEarthsSurface'].value
      })
      atmosphereMesh.visible = dParamWithUnits['showEarthsAtmosphere'].value
      backgroundScene.remove(backgroundCamera)
      backgroundScene.remove(background)
      backgroundScene = null
      backgroundCamera = null
      orbitControls.enabled = true
    }
    else {
      fakeCameraHelper.visible = false
    }
  }
  lastCameraControlActive = cameraControlActive

  //planetMesh.rotation.y += 0.000001
  if (animateZoomingIn || animateZoomingOut) {
    var offset = new THREE.Vector3
    offset.copy( orbitControls.object.position ).sub( orbitControls.target )
    if (animateZoomingIn) {
      offset.multiplyScalar(1 - 10**dParamWithUnits['logZoomRate'].value)
    } else if (animateZoomingOut) {
      offset.multiplyScalar(1 + 10**dParamWithUnits['logZoomRate'].value)
    }
    orbitControls.object.position.copy( orbitControls.target ).add( offset )
  }

  if (animateRingRaising || animateRingLowering) {
    if (verbose) console.log('Raise/Lower Start ' + clockDelta)
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      v.value = guidParam[k]
    })
    const ringRaiseRateFactor = 0.25
    if (animateRingRaising) {
      guidParamWithUnits['ringAmountRaisedFactor'].value = Math.min(1, guidParamWithUnits['ringAmountRaisedFactor'].value+clockDelta*ringRaiseRateFactor)
      if (guidParamWithUnits['ringAmountRaisedFactor'].value==1) animateRingRaising = false
    }
    if (animateRingLowering) {
      guidParamWithUnits['ringAmountRaisedFactor'].value = Math.max(0, guidParamWithUnits['ringAmountRaisedFactor'].value-clockDelta*ringRaiseRateFactor)
      if (guidParamWithUnits['ringAmountRaisedFactor'].value==0) animateRingLowering = false
    }
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      guidParam[k] = v.value
    })
    for (var i in gui.__controllers) {
      gui.__controllers[i].updateDisplay()
    }
    //adjustRingLatLon()
    updateTransitsystem()
  
    majorRedesign = true
    updateRing()
    majorRedesign = true
  }

  if (animateRingMovingOut || animateRingMovingBack) {
    if (verbose) console.log('Raise/Lower Start ' + clockDelta)
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      v.value = guidParam[k]
    })
    const ringRaiseRateFactor = 0.25
    if (animateRingMovingOut) {
      guidParamWithUnits['moveRingFactor'].value = Math.min(1, guidParamWithUnits['moveRingFactor'].value+clockDelta*ringRaiseRateFactor)
      if (guidParamWithUnits['moveRingFactor'].value==1) animateRingMovingOut = false
    }
    if (animateRingMovingBack) {
      guidParamWithUnits['moveRingFactor'].value = Math.max(0, guidParamWithUnits['moveRingFactor'].value-clockDelta*ringRaiseRateFactor)
      if (guidParamWithUnits['moveRingFactor'].value==0) animateRingMovingBack = false
    }
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      guidParam[k] = v.value
    })
    for (var i in gui.__controllers) {
      gui.__controllers[i].updateDisplay()
    }
    adjustRingLatLon()
  }

  if (mtm.active) {

    const evacuatedTubeExitAltitude = mtm.evtea[mtm.j]
    const massDriverExitSpeed = mtm.k * 1000
    //const massDriverExitSpeed = 8100 + mtm.k * 1000
    let rampUpwardAcceleration

    console.print = function (...args) {
      queueMicrotask (console.log.bind (console, ...args));
    }

    //console.print(JSON.stringify(mtm.angleOfAscent, null, 1))

    if (mtm.h===0) {
      dParamWithUnits['verboseLogging'].value = 0
      dParamWithUnits['launcherMassDriver1InitialVelocity'].value = 2       // m/s
      dParamWithUnits['launcherMassDriver2InitialVelocity'].value = 40      // m/s
      dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = evacuatedTubeExitAltitude
      dParamWithUnits['launcherMassDriverExitVelocity'].value = massDriverExitSpeed
      dParamWithUnits['launcherRampDesignMode'].value = 1
      if (massDriverExitSpeed===100) {
        dParamWithUnits['launcherRampExitAltitude'].value = 100
        dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = 110
      }
      else {
        dParamWithUnits['launcherRampExitAltitude'].value = guidParamWithUnits['launcherRampExitAltitude'].value
        dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = evacuatedTubeExitAltitude
      }

      // Search for the best ramp upward acceleration 
      mtm.bestMassFraction = -1
      const cachedAoA = mtm.checkCache()
      let start, finish
      if (cachedAoA===null) {
        start = 1
        finish = 90
      }
      else {
        start = Math.max(1, cachedAoA - 3)
        finish = Math.min(90, cachedAoA + 3)
      }

      for (let i=start; i<=finish; i++) {
        const angleOfAscent = i  // in degrees
        const rampExitAltitude = dParamWithUnits['launcherRampExitAltitude'].value
        const massDriverAltitude = dParamWithUnits['launcherMassDriverAltitude'].value
        const launchVehicleDesiredOrbitalAltitude = dParamWithUnits['launchVehicleDesiredOrbitalAltitude'].value
        const launcherRampTurningRadius = (rampExitAltitude-massDriverAltitude) / (1 - Math.cos(angleOfAscent * Math.PI / 180 ))
        const rampCentrifugalAcceleration = massDriverExitSpeed**2 / launcherRampTurningRadius
        //dParamWithUnits['launcherRampUpwardAcceleration'].value = rampUpwardAcceleration
        dParamWithUnits['launcherRampTurningRadius'].value = launcherRampTurningRadius
        launchSystemObject.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)

        if ((mtm.k===1) && (mtm.j===0)) {
          console.log(angleOfAscent, rampCentrifugalAcceleration, launchSystemObject.massFraction)
        }
        const someMargin = 200000  // Yeah, a lot of margin, I know...
        const validCandidate = (launchSystemObject.initialApogeeDistance < planetSpec.radius + launchVehicleDesiredOrbitalAltitude + someMargin)
        const betterCanditate = validCandidate && (launchSystemObject.massFraction > mtm.bestMassFraction)
        if ((mtm.bestMassFraction===-1) || betterCanditate) {
          mtm.bestMassFraction = launchSystemObject.massFraction
          mtm.bestRampCentrifugalAcceleration = rampCentrifugalAcceleration
          mtm.bestLauncherRampTurningRadius = launcherRampTurningRadius
          mtm.bestAngleOfAscent = angleOfAscent
        }
      }
      //rampUpwardAcceleration = mtm.bestRampUpwardAcceleration
      //dParamWithUnits['launcherRampUpwardAcceleration'].value = rampUpwardAcceleration
      
      dParamWithUnits['launcherRampTurningRadius'].value = mtm.bestLauncherRampTurningRadius
      dParamWithUnits['verboseLogging'].value = 1
      launchSystemObject.updateTrajectoryCurves(dParamWithUnits, planetCoordSys, planetSpec, tetheredRingRefCoordSys, mainRingCurve, crv, specs, genLauncherKMLFile, kmlFile)
      launchSystemObject.updateReferenceFrames(dParamWithUnits, timeSinceStart, planetSpec, crv)
      launchSystemObject.drawLaunchTrajectoryLine(dParamWithUnits, planetCoordSys)

      console.print('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', mtm.j, mtm.k)
      console.print('bestAngleOfAscent', mtm.bestAngleOfAscent)
      console.print('bestLauncherRampTurningRadius', mtm.bestLauncherRampTurningRadius)
      console.print('bestRampCentrifugalAcceleration', mtm.bestRampCentrifugalAcceleration)
      console.print('bestMassFraction', launchSystemObject.massFraction)
      // Save the best result
      mtm.massFraction[mtm.k-mtm.sk][mtm.j] = launchSystemObject.massFraction
      mtm.rocketTotalDeltaV[mtm.k-mtm.sk][mtm.j] = launchSystemObject.rocketTotalDeltaV
      mtm.peakCentrifugalAcceleration[mtm.k-mtm.sk][mtm.j] = mtm.bestRampCentrifugalAcceleration
      mtm.peakDecelleration[mtm.k-mtm.sk][mtm.j] = launchSystemObject.peakDecelleration
      mtm.angleOfAscent[mtm.k-mtm.sk][mtm.j] = {k: mtm.k, j: mtm.j, AoA: mtm.bestAngleOfAscent}
      console.log(mtm.bestMassFraction, mtm.bestRampCentrifugalAcceleration)

      if (mtm.lastTrial()) {
        console.print('massDriverExitSpeed', ...mtm.evtea, ...mtm.evtea, ...mtm.evtea, ...mtm.evtea)
        for (let k = 0; k<mtm.nk-mtm.sk; k++) {
          const massDriverExitSpeed = (mtm.sk + k) * 1000
          console.print(massDriverExitSpeed, ...mtm.massFraction[k], ...mtm.rocketTotalDeltaV[k], ...mtm.peakCentrifugalAcceleration[k], ...mtm.peakDecelleration[k])
        }
        dParamWithUnits['launcherEvacuatedTubeExitAltitude'].value = guidParamWithUnits['launcherEvacuatedTubeExitAltitude'].value
        dParamWithUnits['launcherMassDriverExitVelocity'].value = guidParamWithUnits['launcherMassDriverExitVelocity'].value
        //dParamWithUnits['launcherRampUpwardAcceleration'].value = guidParamWithUnits['launcherRampUpwardAcceleration'].value
        dParamWithUnits['launcherRampTurningRadius'].value = guidParamWithUnits['launcherRampTurningRadius'].value
        dParamWithUnits['launcherRampDesignMode'].value = guidParamWithUnits['launcherRampDesignMode'].value
        dParamWithUnits['launcherRampExitAltitude'].value = guidParamWithUnits['launcherRampExitAltitude'].value
        dParamWithUnits['verboseLogging'].value = guidParamWithUnits['verboseLogging'].value
        console.print(JSON.stringify(mtm.angleOfAscent))
      }
    }
    mtm.nextTrial()
  }

  // if (cameraSpeed!==0) {
  //   camera.position.multiplyScalar(1+cameraSpeed)
  //   camera.matrixValid = false
  //   orbitControls.target.multiplyScalar(1+cameraSpeed)
  //   if (camera.position.length()>=radiusOfPlanet + 100000) {
  //     animateCameraGoingUp = false
  //     cameraSpeed = 0
  //   }
  // }

  let cameraPostition
  if (enableVR) {
    cameraPostition = cameraGroup.position.clone()
  }
  else {
    cameraPostition = camera.position.clone()
  }
  transitSystemObject.animate(timeSinceStart, tetheredRingRefCoordSys, cameraPostition, mainRingCurve, dParamWithUnits)

  const weAreFar1 = (cameraGroup.position.length() > (radiusOfPlanet + crv.currentMainRingAltitude)*1.1)
  if (weAreFar1 !== prevWeAreFar1) {
    if (weAreFar1) {
      // To improve rendering performance when not zoomed out, make stars invisible
      starsMesh.visible = true
    }
    else {
      starsMesh.visible = false
    }
  }
  prevWeAreFar1 = weAreFar1

  if (console.userdata['capture']==1) { 
    console.userdata['matrixAutoUpdateData'] = {}
    console.userdata['matrixWorldUpdateData'] = {}
  }

  if (!scene.matrixWorldAutoUpdate) {
    // Performance improved less automatic version
    scene.selectivelyUpdateMatrixWorld()
  }

  if (renderToBuffer) {
    renderer.render(scene, camera, bufferTexture)
  }
  else {
    renderer.clear()
    if (backgroundScene && backgroundCamera) {
      renderer.render(backgroundScene, backgroundCamera)
      renderer.clearDepth()
    }
    renderer.render( scene, camera )
    renderer.clearDepth()
    renderer.render( sceneOrtho, cameraOrtho )
  }
  if (capturer) {
    capturer.capture( renderer.domElement );
    //capturer.capture( bufferTexture );  // Doesn't work because bufferTexture doesn't support the toBlob method
  }
  if (trackPointLoggerObject) {
    trackPointLoggerObject.capture(
      camera.position.clone(),
      camera.up.clone(),
      orbitControls.target.clone(),
      orbitControls.upDirection.clone()
    )
  }

  //requestAnimationFrame(animate)
  //simContainer = document.querySelector('#simContainer')
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)
  //renderer.setViewport( 0, 0, simContainer.offsetWidth, simContainer.offsetHeight )
  orbitControls.enabled = false
  TWEEN.update(timeSinceStart*1000)
  if (followElevators) {
    const elevatorDistanceFromEarthsCenter = elevatorPosCalc.calculateElevatorPosition(timeSinceStart)+radiusOfPlanet+dParamWithUnits['transitTubeUpwardOffset'].value
    camera.position.normalize().multiplyScalar(elevatorDistanceFromEarthsCenter)
    orbitControls.target.normalize().multiplyScalar(elevatorDistanceFromEarthsCenter)
  }
  if (followTransitVehicles) {
    const axis = new THREE.Vector3(0,1,0).applyQuaternion(ringToPlanetRotation)
    const driftFactor = 0.95
    const angle = driftFactor * clockDelta * dParamWithUnits['transitVehicleCruisingSpeed'].value / crv.mainRingRadius
    camera.position.applyAxisAngle(axis, angle)
    orbitControls.target.applyAxisAngle(axis, angle)
  }
  // if (followLaunchVehicles==2) {
  //   const pointOnLaunchTrajectoryCurve = launchSystemObject.launchTrajectoryCurve.getPoint((timeSinceStart - followLaunchVehiclesStartTime)/launchSystemObject.durationOfLaunchTrajectory)
  //   const trackingOffset = pointOnLaunchTrajectoryCurve.clone().sub(lastPointOnLaunchTrajectoryCurve)
  //   lastPointOnLaunchTrajectoryCurve = pointOnLaunchTrajectoryCurve.clone()
  //   camera.position.add(trackingOffset)
  //   orbitControls.target.add(trackingOffset)
  //   orbitControlsTargetPoint.add(trackingOffset)
  //   setOrbitControlsTargetUpVector()
  // }
  if (!cameraControlActive || dParamWithUnits['jsonFileCameraControlHelper'].value) {
    orbitControls.enabled = true
  }
  orbitControls.update()

  if (console.userdata['capture']==1) {
    if (verbose) console.log(console.userdata)
    console.userdata['capture'] = 2
  }

  //stats.update();

}

if (verbose) console.log("Adding resize event listener")
window.addEventListener( 'resize', onWindowResize )
function onWindowResize() {
  simContainer = document.querySelector('#simContainer')
  const width = simContainer.offsetWidth
  const height = simContainer.offsetHeight

  camera.aspect = width/height
  camera.updateProjectionMatrix()
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)

  cameraOrtho.left = - width / 2
  cameraOrtho.right = width / 2
  cameraOrtho.top = height / 2
  cameraOrtho.bottom = - height / 2
  cameraOrtho.updateProjectionMatrix()
  updateLogoSprite()
  updateXYChart()

  renderer.setSize(width, height)
  //console.log("resizing...", simContainer.offsetWidth, simContainer.offsetHeight)
}

if (verbose) console.log("Adding keydown event listener")
document.addEventListener( 'keydown', onKeyDown )

if (verbose) console.log("Adding mousemove event listener")
addEventListener('mousemove', (event) => {
  mouse.x = 2 * (event.clientX / simContainer.offsetWidth) - 1
  mouse.y = 1 - 2 * (event.clientY / simContainer.offsetHeight)
})

if (verbose) console.log("Adding keydown event listener")

if (enableVR) {
  if (verbose) console.log("Adding VR button")
  document.body.appendChild( VRButton.createButton( renderer ) )
}
  
let controller1, controller2
let controllerGrip1, controllerGrip2

function onSelectStart(event) {
  // console.log(event.data.gamepad.buttons[0].pressed,
  //   event.data.gamepad.buttons[1].pressed,
  //   event.data.gamepad.buttons[2].pressed,
  //   event.data.gamepad.buttons[3].pressed,
  //   event.data.gamepad.buttons[4].pressed,
  //   event.data.gamepad.buttons[5].pressed,
  //   event.data.gamepad.buttons[6].pressed)
  this.userData.isSelecting = true
}

function onSelectEnd() {
  this.userData.isSelecting = false
}

controller1 = renderer.xr.getController( 0 )
controller1.name = 'controller1'
controller1.addEventListener( 'selectstart', onSelectStart )
controller1.addEventListener( 'selectend', onSelectEnd )
controller1.addEventListener( 'connected', function ( event ) {
  this.add( buildController( event.data ) );
  controller1.inputEvents = event
  //console.log(controller1)
} )
controller1.addEventListener( 'disconnected', function () {
  this.remove( this.children[ 0 ] )
} )
if (enableVR) {
  cameraGroup.add( controller1 )
}

controller2 = renderer.xr.getController( 1 )
controller2.name = 'controller2'
controller2.addEventListener( 'selectstart', onSelectStart )
controller2.addEventListener( 'selectend', onSelectEnd )
controller2.addEventListener( 'connected', function ( event ) {
  this.add( buildController( event.data ) )
  controller2.inputEvents = event
  //console.log(controller2)
} )
controller2.addEventListener( 'disconnected', function () {
  this.remove( this.children[ 0 ] )
} )
if (enableVR) {
  cameraGroup.add( controller2 )
}

// The XRControllerModelFactory will automatically fetch controller models
// that match what the user is holding as closely as possible. The models
// should be attached to the object returned from getControllerGrip in
// order to match the orientation of the held device.

const controllerModelFactory = new XRControllerModelFactory()

controllerGrip1 = renderer.xr.getControllerGrip( 0 )
controllerGrip1.name = 'controllerGrip1'
controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) )
if (enableVR) {
  cameraGroup.add( controllerGrip1 )
}

controllerGrip2 = renderer.xr.getControllerGrip( 1 )
controllerGrip2.name = 'controllerGrip2'
controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) )
if (enableVR) {
  cameraGroup.add( controllerGrip2 )
}

function buildController( data ) {

  let geometry, material;

  switch ( data.targetRayMode ) {
  case 'tracked-pointer':
    geometry = new THREE.BufferGeometry()
    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ 0, 0, 0, 0, 0, - 1 ], 3 ) )
    geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( [ 0.5, 0.5, 0.5, 0, 0, 0 ], 3 ) )
    material = new THREE.LineBasicMaterial( { vertexColors: true, blending: THREE.AdditiveBlending } )
    return new THREE.Line( geometry, material )
  case 'gaze':
    geometry = new THREE.RingGeometry( 0.02, 0.04, 32 ).translate( 0, 0, - 1 )
    material = new THREE.MeshBasicMaterial( { opacity: 0.5, transparent: true } )
    return new THREE.Mesh( geometry, material )
  }

}

function handleController( controller ) {

  if ( controller.userData.isSelecting ) {
  }

}





if (verbose) console.log("Calling animate")
animate()

// function findNearestPointOnRing(intersectionPoint) {
//   // Goal is to find a point on the ring to use as the target point for the orbit controls, to mke it easier to zoom in close when starting from very far away.
//   // There is defintaely a more direct formula forthis - I'm being lazy!
//   // This apporoach involves zipping around the ring and finding the point that is closest to the point above the globe where the user's cursor was when they pressed 'P'
//   const r = radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value * dParamWithUnits['ringAmountRaisedFactor'].value
//   const ω = -(Math.PI/2 - dParamWithUnits['equivalentLatitude'].value)
//   let pointOnRing = new THREE.Vector3()
//   const cursorPoint = intersectionPoint.multiplyScalar((radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value * dParamWithUnits['ringAmountRaisedFactor'].value)/radiusOfPlanet)

//   let minDistace
//   let bestPoint = new THREE.Vector3()
//   for (let i = 0; i<dParamWithUnits['numTethers'].value; i+=dParamWithUnits['numTethers'].value/4) {
//     const θ = i / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
//     pointOnRing.setFromSphericalCoords(r, ω, θ).localToWorld()
//     //console.log(pointOnRing)
//     const d = pointOnRing.distanceTo(cursorPoint)
//     if ((i==0) || (d<minDistace)) {
//       minDistace = d
//       bestPoint.copy(pointOnRing)
//     }
//   }
//   return bestPoint
// }

function setOrbitControlsTargetUpVector() {
  if (lockUpToRingAxis) {
    orbitControlsTargetUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(ringToPlanetRotation)
  }
  else {
    planetCoordSys.updateWorldMatrix(true)
    tetheredRingRefCoordSys.updateMatrixWorld(true)
    orbitControlsTargetUpVector = planetCoordSys.worldToLocal(orbitControlsTargetPoint.clone()).normalize()
  }
}

function onKeyDown( event ) {
  // Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  //   v.value = guidParam[k]
  // })
  const RaiseLowerMode = true

  switch ( event.keyCode ) {
    case 79: /*O*/
      orbitControls.upDirection = new THREE.Vector3(0, 1, 0)
      camera.up.copy(orbitControls.upDirection)
      orbitControls.target.set(0, 0, 0)
      orbitControls.rotateSpeed = 1
      //setOrbitControlsTargetUpVector()
      orbitControls.maxPolarAngle = Math.PI
      orbitControlsNewMaxPolarAngle = Math.PI
      //camera.up.set(0, 1, 0)
      break;
    case 73: /*I*/
      orbitControls.upDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(ringToPlanetRotation)
      camera.up.copy(orbitControls.upDirection)
      orbitControls.target = orbitControls.upDirection.clone().multiplyScalar(crv.y0)

      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        v.value = guidParam[k]
      })
      guidParamWithUnits['logZoomRate'].value = -3
      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        guidParam[k] = v.value
      })

      orbitControls.rotateSpeed = 1
      //setOrbitControlsTargetUpVector()
      orbitControls.maxPolarAngle = Math.PI
      orbitControlsNewMaxPolarAngle = Math.PI
      //camera.up.set(0, 1, 0)
      break;
    case 80: /*P*/
      raycaster.setFromCamera(mouse, camera)
      let planetIntersects = []
      planetMeshes.traverse(child => {
        if (child.type==='Mesh') {
          planetIntersects.push.apply(planetIntersects, raycaster.intersectObject(child))
        }
      })
      let objectIntersects = []
      if (dParamWithUnits['showTransitTube'].value || dParamWithUnits['showMassDriverTube'].value || dParamWithUnits['showLaunchVehicles'].value) {
        planetCoordSys.children.forEach(mesh => {
          //console.log(mesh.name)
          if ((mesh.name==='massDriverTube') || (mesh.name==='evacuatedTube') || (mesh.name==='launchVehicle')) {
            objectIntersects.push.apply(objectIntersects, raycaster.intersectObject(mesh))
          }
        })
        tetheredRingRefCoordSys.children.forEach(mesh => {
          if ((mesh.name==='transitTube') || (mesh.name==='stationaryRing')) {
            objectIntersects.push.apply(objectIntersects, raycaster.intersectObject(mesh))
          }
        })
      }
      if (objectIntersects.length>0) {
        objectIntersects.forEach(intersect => {
          // A bit hacky - there's no guatentee that immediate parent of the object we interceted with is the 'launchVehicle' object that we want to track.
          // If the model becomes more cpmplicated, then we might need to search further up the heirarchy of objects to find it.
          if ((intersect.object.parent.name=='launchVehicle') || (intersect.object.parent.name=='elevatorCar') || (intersect.object.parent.name=='transitVehicle')) {
            trackingPoint = intersect.object.parent.position
          }
        })
        // if (trackingPoint) {
        //   trackingPointMarkerMesh.position.copy(trackingPoint)
        //   trackingPointMarkerMesh.visible = true
        // }
        intersectionPoint = objectIntersects[0].point
        targetPoint = intersectionPoint
        extraDistanceForCamera = 100
        orbitControls.rotateSpeed = 0.9
      }
      else if (planetIntersects.length>0) { // Note: would probably be advisable to assert here that there is only one intersection point.
        intersectionPoint = planetIntersects[0].point
        // Because we want to orbit around a point at the altitude of the ring...
        targetPoint = intersectionPoint.multiplyScalar((radiusOfPlanet + (dParamWithUnits['pKeyAltitudeFactor'].value * crv.currentMainRingAltitude))/radiusOfPlanet)
        extraDistanceForCamera = 10000
        orbitControls.rotateSpeed = 0.9
        // Uncomment this line if you want to print lat, lon, and alt to console
        //console.log(tram.xyz2lla(intersectionPoint.x, intersectionPoint.y, intersectionPoint.z))
      }
      if ((planetIntersects.length>0) || (objectIntersects.length>0)) {
        targetPointMarkerMesh.position.copy(targetPoint)
        targetPointMarkerMesh.visible = dParamWithUnits['showMarkers'].value
        setupTweeningOperation()
        
        // previousTargetPoint.copy(orbitControls.target.clone())
        // previousUpVector.copy(orbitControls.upDirection.clone())
        // orbitControlsTargetPoint.copy(targetPoint)
        // orbitControlsTargetUpVector = planetCoordSys.worldToLocal(orbitControlsTargetPoint.clone()).normalize()
        // //console.log(orbitControlsTargetUpVector)
        // orbitControlsEarthRingLerpFactor = 0
        // orbitControlsEarthRingLerpSpeed = 1/32
        // orbitControlsNewMaxPolarAngle = Math.PI/2 + Math.PI/2
      }
      break
    case 48: /*0*/
      // Search for the object with name=='launchVehicle'
      if (closestVirtualLaunchVehicle!==null) {
        // Assume that we simply want to stop tracking the vehicle
        closestVirtualLaunchVehicle = null
        stationaryCameraTrackingMode = false
        targetPoint = null
      }
      else {
        let closestSoFar = -1
        launchSystemObject.refFrames.forEach(refFrame => {
          refFrame.wedges.forEach(wedge => {
            Object.entries(wedge).forEach(([objectKey, objectValue]) => {
              if (objectKey=='virtualLaunchVehicles') {
                objectValue.forEach(launchVehicle => {
                  const tmpPosition = launchVehicle.getFuturePosition(refFrame, 0)
                  if ((tmpPosition.x!=="NaN") && (tmpPosition.y!=="NaN") && (tmpPosition.z!=="NaN")) {
                    const distanceAway = camera.position.distanceTo(tmpPosition)
                    if ((closestSoFar==-1) || (distanceAway<closestSoFar)) {
                      closestVirtualLaunchVehicle = {launchVehicle, refFrame}
                      closestSoFar = distanceAway
                    }
                  }
                })
              }
            })
          })
        })
        if (closestVirtualLaunchVehicle!==null) {
          trackingPoint = closestVirtualLaunchVehicle.launchVehicle.getFuturePosition(closestVirtualLaunchVehicle.refFrame, tweeningTime/1000)
          closestVirtualTransitVehicle = null  // Stop tracking the transit vehicle
          closestVirtualElevatorCar = null // Stop tracking the elevator car
          trackingPointMarkerMesh.position.copy(trackingPoint)
          trackingPointMarkerMesh.visible = dParamWithUnits['showMarkers'].value
          targetPoint = trackingPoint.clone()
          setupTweeningOperation()
          orbitControls.rotationSpeed = 0.01
        }
      }
      break
    case 49: /*1*/
      // Search for the object with name=='launchVehicle'
      if (closestVirtualTransitVehicle!==null) {
        // Assume that we simply want to stop tracking the vehicle
        closestVirtualTransitVehicle = null
        stationaryCameraTrackingMode = false
        targetPoint = null
      }
      else {
        let closestSoFar = -1
        transitSystemObject.refFrames.forEach(refFrame => {
          if (refFrame.name==='transitVehiclesCollectorCounterClockwise') {
            refFrame.wedges.forEach(wedge => {
              Object.entries(wedge).forEach(([objectKey, objectValue]) => {
                if (objectKey=='virtualTransitVehicles') {
                  objectValue.forEach(transitVehicle => {
                    const localTmpPosition = transitVehicle.getFuturePosition(refFrame, 0)
                    const tmpPosition = tetheredRingRefCoordSys.localToWorld(localTmpPosition)
                    if ((tmpPosition.x!=="NaN") && (tmpPosition.y!=="NaN") && (tmpPosition.z!=="NaN")) {
                      const distanceAway = camera.position.distanceTo(tmpPosition)
                      if ((closestSoFar===-1) || (distanceAway<closestSoFar)) {
                        closestVirtualTransitVehicle = {transitVehicle, refFrame}
                        closestSoFar = distanceAway
                      }
                    }
                  })
                }
              })
            })
          }
        })
        if (closestVirtualTransitVehicle!==null) {
          trackingPoint = tetheredRingRefCoordSys.localToWorld(closestVirtualTransitVehicle.transitVehicle.getFuturePosition(closestVirtualTransitVehicle.refFrame, tweeningTime/1000))
          closestVirtualLaunchVehicle = null // Stop tracking the launch vehicle
          closestVirtualElevatorCar = null // Stop tracking the elevator car
          trackingPointMarkerMesh.position.copy(trackingPoint)
          trackingPointMarkerMesh.visible = dParamWithUnits['showMarkers'].value
          //orbitControlsMarkerMesh.position.copy(trackingPoint)
          targetPoint = trackingPoint.clone()
          setupTweeningOperation()
        }
      }
      break
    case 50: /*2*/
      // Search for the object with name=='launchVehicle'
      if (closestVirtualElevatorCar!==null) {
        // Assume that we simply want to stop tracking the vehicle
        closestVirtualElevatorCar = null
        stationaryCameraTrackingMode = false
        targetPoint = null
      }
      else {
        let closestSoFar = -1
        transitSystemObject.refFrames.forEach(refFrame => {
          if (refFrame.name==='staticReferenceFrame') {
            refFrame.wedges.forEach(wedge => {
              Object.entries(wedge).forEach(([objectKey, objectValue]) => {
                if (objectKey=='virtualElevatorCars') {
                  objectValue.forEach(elevatorCar => {
                    const localTmpPosition = elevatorCar.getFuturePosition(refFrame, 0)
                    const tmpPosition = tetheredRingRefCoordSys.localToWorld(localTmpPosition)
                    if ((tmpPosition.x!=="NaN") && (tmpPosition.y!=="NaN") && (tmpPosition.z!=="NaN")) {
                      const distanceAway = camera.position.distanceTo(tmpPosition)
                      if ((closestSoFar===-1) || (distanceAway<closestSoFar)) {
                        closestVirtualElevatorCar = {elevatorCar, refFrame}
                        closestSoFar = distanceAway
                      }
                    }
                  })
                }
              })
            })
          }
        })
        if (closestVirtualElevatorCar!==null) {
          trackingPoint = tetheredRingRefCoordSys.localToWorld(closestVirtualElevatorCar.elevatorCar.getFuturePosition(closestVirtualElevatorCar.refFrame, tweeningTime/1000))
          closestVirtualLaunchVehicle = null // Stop tracking the launch vehicle
          closestVirtualTransitVehicle = null // Stop tracking the transit vehicle
          trackingPointMarkerMesh.position.copy(trackingPoint)
          trackingPointMarkerMesh.visible = dParamWithUnits['showMarkers'].value
          //orbitControlsMarkerMesh.position.copy(trackingPoint)
          targetPoint = trackingPoint.clone()
          setupTweeningOperation()
        }
      }
      break
    case 51: /*3*/
      const instances = {}
      scene.traverse(child => {
        const objName = child.name || 'noName'
        if (instances[objName]) {
          instances[objName]++
        }
        else {
          instances[objName] = 1
        }
      })
      Object.entries(instances).forEach(([k, v]) => {
        console.log(k, v)
      })
      break
    case 56: /*8*/
      // Put the moon into the camera's field of view
      moonMesh.position.copy(camera.position)
      moonMesh.rotation.copy(camera.rotation)
      moonMesh.translateZ(-moonOrbitDistance/10)
      break

    case 57: /*9*/
      if (stationaryCameraTrackingMode) {
        // Disable stationary tracking mode
        stationaryCameraTrackingMode = false
        orbitControls.enable = true
      }
      else {
        // Slams the breaks on the camera so that what ever it's tracking will whiz by. 
        stationaryCameraTrackingMode = true

        // Hack to move the camera close to the ring at the same time we enable this mode.
        // Probably should also add a similar hack for the launch system...

        // const pointInRingCoords = tetheredRingRefCoordSys.worldToLocal(camera.position.clone())
        // const offsetToRingCenter = new THREE.Vector3(0, crv.yc, 0)
        // const vectorToCameraFromRingCenter = pointInRingCoords.clone().sub(offsetToRingCenter)
        // vectorToCameraFromRingCenter.y = 0
        // const distanceFromRingCenter = vectorToCameraFromRingCenter.length()
        // vectorToCameraFromRingCenter.normalize().multiplyScalar(crv.mainRingRadius + 50)
        // vectorToCameraFromRingCenter.y = -150
        // vectorToCameraFromRingCenter.add(offsetToRingCenter)
        // camera.position.copy(tetheredRingRefCoordSys.localToWorld(vectorToCameraFromRingCenter))
        // camera.up.copy(camera.position).normalize()

      }
      break
    case 81: /*Q*/
      orbitControls.autoRotate ^= true
      orbitControls.rotateSpeed = dParamWithUnits['orbitControlsRotateSpeed'].value
      break
    // case 82: /*R*/
    //   dParamWithUnits['ringCenterLongitude'].value -= 0.1
    //   updateRing()
    //   break; 
    // case 84: /*T*/
    //   dParamWithUnits['ringCenterLongitude'].value += 0.1
    //   updateRing()
    //   break;
    case 82: /*R*/
      // Raise the Ring
      if (RaiseLowerMode) {
        animateRingRaising = !animateRingRaising
        animateRingLowering = false
      }
      else {
        animateRingMovingOut = !animateRingMovingOut
        animateRingMovingBack = false
      }
      break
    case 76: /*L*/
      // Lower the Ring
      if (RaiseLowerMode) {
        animateRingRaising = false
        animateRingLowering = !animateRingLowering
      }
      else {
        animateRingMovingOut = false
        animateRingMovingBack = !animateRingMovingBack
      }
      break;
    case 85: /*U*/
      // Move the Camera Up
      cameraSpeed += 0.00000001
      break; 
    case 68: /*D*/
      cameraSpeed -= 0.00000001
      break;
    // case 67: /*C*/
    //   console.userdata['capture'] = 1
    //   break;
    // case 84: /*T*/
    //   // Toggle Display of the Tensile Force Arrows
    //   showTensileForceArrows = !showTensileForceArrows
    //   gravityForceArrowsObject.update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
    //   //console.log(showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
    //   break
    // case 71: /*G*/
    //   // Toggle Display of the Tensile Force Arrows
    //   showGravityForceArrows = !showGravityForceArrows
    //   gravityForceArrowsObject.update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
    //   //console.log(showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
    //   break
    // case 73: /*I*/
    //   // Toggle Display of the Tensile Force Arrows
    //   showInertialForceArrows = !showInertialForceArrows
    //   gravityForceArrowsObject.update(dParamWithUnits, mainRingCurve, crv, ctv, radiusOfPlanet, ringToPlanetRotation, showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
    //   //console.log(showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
    //   break
    case 71: /*G*/
      // Initiate (or cancel) control of the camera's position and orientation from the data in the Google Earth Studio provided json file.
      cameraControlActive = !cameraControlActive
      break
    case 86: /*V*/
      lockUpToRingAxis = !lockUpToRingAxis
      break
    case 89: /*Y*/
      // Automatically analyze a range of launch trajectory options
      if (!mtm.active) {
        mtm.start()
      }
      else {
        mtm.active = false
      }

      //backgroundPatchMesh.lookAt(camera.position)
      break
    case 77: /*M*/
      let positionObject = {
        "orbitTarget":{
          "X":orbitControls.target.x.toString(),
          "Y":orbitControls.target.y.toString(),
          "Z":orbitControls.target.z.toString()
        },
        "orbitUpDirection":{
          "X":orbitControls.upDirection.x.toString(),
          "Y":orbitControls.upDirection.y.toString(),
          "Z":orbitControls.upDirection.z.toString()
        },
        "orbitObjectPosition":{
          "X":orbitControls.object.position.x.toString(),
          "Y":orbitControls.object.position.y.toString(),
          "Z":orbitControls.object.position.z.toString()
        },
        "cameraUp":{
          "X":camera.up.x.toString(),
          "Y":camera.up.y.toString(),
          "Z":camera.up.z.toString()
        }
      }
      console.log("Current Position Vectors\n%s", JSON.stringify(positionObject, null, 2))
      break
      case 87: /*W*/
      // This executes and instantaneous "Warp" to a position much closer to the ring
      console.log('\n\norbitControls.target.set(' + orbitControls.target.x + ', ' + orbitControls.target.y + ', ' + orbitControls.target.z + ')\norbitControls.upDirection.set(' + orbitControls.upDirection.x + ', ' + orbitControls.upDirection.y + ', ' + orbitControls.upDirection.z + ')\norbitControls.object.position.set(' + orbitControls.object.position.x + ', ' + orbitControls.object.position.y + ', ' + orbitControls.object.position.z + ')\ncamera.up.set(' + camera.up.x + ', ' + camera.up.y + ', ' + camera.up.z + ')\n')

      orbitControls.maxPolarAngle = Math.PI/2 + .1
      orbitControlsNewMaxPolarAngle = Math.PI/2 + Math.PI/2

      // Near start of mass driver
      // orbitControls.target = launchSystemObject.startOfMassDriver1Position
      // orbitControls.object.position.copy(launchSystemObject.startOfMassDriver1Position.clone().add(new THREE.Vector3(1553302-1553253, -3779622 - -3779619, -4897144 - -4897146)))
      // orbitControls.upDirection.set(-0.07836493543944477, -0.6467967230496569, -0.758625688957207)
      // camera.up.set(-0.07836493543944477, -0.6467967230496569, -0.758625688957207)

      // Location of bug in mass driver screw (need to set nLimit to 500 as well)
      // orbitControls.target.set(1552194.5865943027, -3779932.922417909, -4897240.98907675)
      // orbitControls.upDirection.set(0.24336401900302615, -0.5926415580337122, -0.7678215534524079)
      // orbitControls.object.position.set(1552214.725039794, -3779946.637422108, -4897234.0064508)
      // camera.up.set(0.24336401900302615, -0.5926415580337122, -0.7678215534524079)


      // orbitControls.target.set(-3763210.8232434946, 4673319.5670904, -2255256.723306473)
      // orbitControls.upDirection.set(-0.5870824578788134, 0.7290700269983701, -0.351839570519814)
      // orbitControls.object.position.set(-3764246.447379286, 4672428.630481427, -2255483.089866906)
      // camera.up.set(-0.5870824578788134, 0.7290700269983701, -0.351839570519814)

      // orbitControls.target vector needs to be passed as a float to work correctly
      let tempX = Number.parseFloat(guidParam['CameraPreset'].orbitTarget.X)
      let tempY = Number.parseFloat(guidParam['CameraPreset'].orbitTarget.Y)
      let tempZ = Number.parseFloat(guidParam['CameraPreset'].orbitTarget.Z)

      // set camera position based on Camera Preset
      orbitControls.target.set(tempX, tempY, tempZ)
      orbitControls.upDirection.set(guidParam['CameraPreset'].orbitUpDirection.X,guidParam['CameraPreset'].orbitUpDirection.Y,guidParam['CameraPreset'].orbitUpDirection.Z)
      orbitControls.object.position.set(guidParam['CameraPreset'].orbitObjectPosition.X,guidParam['CameraPreset'].orbitObjectPosition.Y,guidParam['CameraPreset'].orbitObjectPosition.Z)
      camera.up.set(guidParam['CameraPreset'].cameraUp.X,guidParam['CameraPreset'].cameraUp.Y,guidParam['CameraPreset'].cameraUp.Z)

      orbitControlsTargetPoint.copy(orbitControls.target.clone())
      setOrbitControlsTargetUpVector()
      orbitControlsUpVector.copy(orbitControlsTargetUpVector.clone())

      toRingAlreadyTriggered = true
      toPlanetAlreadyTriggered = false
      orbitControlsTargetPoint.copy(orbitControls.target.clone())
      orbitControlsTargetUpVector.copy(orbitControls.upDirection.clone())
      orbitControls.update()
      // guidParamWithUnits['numForkLevels'].value = 8
      // for (var i in gui.__controllers) {
      //   gui.__controllers[i].updateDisplay()
      // }
      // updatedParam()
      // updateRing()
      break;
    case 78: /*N*/
      // Previous "Warp To Location" Command (depricated)
      // This executes and instantaneous "Warp" to a position much closer to the ring

      // Print out the current location of the camera
      console.log('\n\norbitControls.target.set(' + orbitControls.target.x + ', ' + orbitControls.target.y + ', ' + orbitControls.target.z + ')\norbitControls.upDirection.set(' + orbitControls.upDirection.x + ', ' + orbitControls.upDirection.y + ', ' + orbitControls.upDirection.z + ')\norbitControls.object.position.set(' + orbitControls.object.position.x + ', ' + orbitControls.object.position.y + ', ' + orbitControls.object.position.z + ')\ncamera.up.set(' + camera.up.x + ', ' + camera.up.y + ', ' + camera.up.z + ')\n')
      console.log('\n\nnonGUIParams[\'orbitControlsTarget\'] = new THREE.Vector3(' + orbitControls.target.x + ', ' + orbitControls.target.y + ', ' + orbitControls.target.z + ')\nnonGUIParams[\'orbitControlsUpDirection\'] = new THREE.Vector3(' + orbitControls.upDirection.x + ', ' + orbitControls.upDirection.y + ', ' + orbitControls.upDirection.z + ')\nnonGUIParams[\'orbitControlsObjectPosition\'] = new THREE.Vector3(' + orbitControls.object.position.x + ', ' + orbitControls.object.position.y + ', ' + orbitControls.object.position.z + ')\nnonGUIParams[\'cameraUp\'] = new THREE.Vector3(' + camera.up.x + ', ' + camera.up.y + ', ' + camera.up.z + ')\n')

      orbitControls.maxPolarAngle = Math.PI/2 + .1
      orbitControlsNewMaxPolarAngle = Math.PI/2 + Math.PI/2

      switch (flyToLocation) {
      case 0:
        // Near start of mass driver
        if (launchSystemObject) {
          // Start of full length launcher
          // At 150m
          // orbitControls.target.set(1084693.2068705305, -3903242.00193271, -4926488.919130496)
          // orbitControls.upDirection.set(0.1700612807252515, -0.6119573789279946, -0.7723906570988971)
          // orbitControls.object.position.set(1084756.9000704621, -3903240.4953234727, -4926485.709430022)
          // camera.up.set(0.1700612807252515, -0.6119573789279946, -0.7723906570988971)

          // At 100m
          orbitControls.target.set(1087400.0760552743, -3885289.039740853, -4979888.789462031)
          orbitControls.upDirection.set(0.1696873352049711, -0.6062407349576369, -0.7769674250244086)
          orbitControls.object.position.set(1086726.0160455098, -3882487.201004774, -4986263.639147207)
          camera.up.set(0.1696873352049711, -0.6062407349576369, -0.7769674250244086)

          // orbitControls.target.set(1087829.3440702243, -3907631.0156934406, -4941146.498730386)
          // orbitControls.upDirection.set(0.17018078992601707, -0.6119072240380778, -0.7724040703609547)
          // orbitControls.object.position.set(1119741.0157521453, -3910186.450747938, -4935023.659581899)
          // camera.up.set(0.17018078992601707, -0.6119072240380778, -0.7724040703609547)
          
          // Start of short launcher (exit velocity = 1000)
          // orbitControls.target.set(397938.59305886156, -4034234.6848072577, -4924228.909297606)
          // orbitControls.upDirection.set(0.062390422751488345, -0.6325036371292896, -0.7720405327229334)
          // orbitControls.object.position.set(397962.5308820797, -4034241.1083797477, -4924224.965650333)
          // camera.up.set(0.062390422751488345, -0.6325036371292896, -0.7720405327229334)

          // Side on view for test
          // orbitControls.target.set(380077.1301223017, -4037757.386365768, -4924067.123090019)
          // orbitControls.upDirection.set(0.05958033013042138, -0.6329922223483165, -0.7718620541962725)
          // orbitControls.object.position.set(380560.3319892748, -4040818.2235583924, -4923345.919434847)
          // camera.up.set(0.05958033013042138, -0.6329922223483165, -0.7718620541962725)

          // orbitControls.target.set(1085272.9620155653, -3894412.8556745816, -4933140.481168342)
          // orbitControls.upDirection.set(0.17015900275988693, -0.6105907848756152, -0.773449938395977)
          // orbitControls.object.position.set(1085284.9479284438, -3894418.8299996015, -4933138.122713651)
          // camera.up.set(0.17015900275988693, -0.6105907848756152, -0.773449938395977)

          // orbitControls.target = launchSystemObject.startOfMassDriver1Position.clone()
          // orbitControls.object.position.copy(launchSystemObject.startOfMassDriver1Position.clone().add(new THREE.Vector3(1553302-1553253, -3779622 - -3779619, -4897144 - -4897146)))
          // orbitControls.upDirection.set(-0.07836493543944477, -0.6467967230496569, -0.758625688957207)
          // camera.up.set(-0.07836493543944477, -0.6467967230496569, -0.758625688957207)
        }
        camera.near = 0.1
        break
      case 1:
        // Near the end of the launcher's evacuated tube
        orbitControls.target.set(1087829.3440702243, -3907631.0156934406, -4941146.498730386)
        orbitControls.upDirection.set(0.17018078992601707, -0.6119072240380778, -0.7724040703609547)
        orbitControls.object.position.set(1119741.0157521453, -3910186.450747938, -4935023.659581899)
        camera.up.set(0.17018078992601707, -0.6119072240380778, -0.7724040703609547)        
        break
      case 2:
        // Close to Ring at 22 km altitude
        orbitControls.target.set(-3643532.0765374135, 4778082.993834642, -2232448.894907217)
        orbitControls.upDirection.set(-0.5684119480549809, 0.7453922243304064, -0.3482790393005452)
        orbitControls.object.position.set(-3643700.804177911, 4778060.86894906, -2232401.882164564)
        camera.up.set(-0.5684119480549809, 0.7453922243304064, -0.3482790393005452)
        break
      case 3:
        // Near Mount Rainier
        orbitControls.target.set(-3576380.7758285957, 4790183.486825878, -2235354.9156651674)
        orbitControls.upDirection.set(-0.5604409658648994, 0.7515853229361157, -0.34788708818729247)
        orbitControls.object.position.set(-3654817.9846578683, 4740786.5763142025, -2327967.782602368)
        camera.up.set(-0.5604409658648994, 0.7515853229361157, -0.34788708818729247)
        break
      case 4:
        // Looking at the sub-scale launcher's ramp
        orbitControls.target.set(456860.2719243404, -4042753.286542369, -4920259.793647616)
        orbitControls.upDirection.set(0.07250474189605663, -0.6324721569775834, -0.7711822307669628)
        orbitControls.object.position.set(485208.18016969785, -4054566.8461120585, -4916664.678552242)
        camera.up.set(0.07250474189605663, -0.6324721569775834, -0.7711822307669628)
        break
      case 5:
        orbitControls.target.set(462625.6559485008, -4035549.3714889227, -4920605.758009831)
        orbitControls.upDirection.set(0.07250474189605663, -0.6324721569775834, -0.7711822307669628)
        orbitControls.object.position.set(462644.614909767, -4035553.341659306, -4920607.446758332)
        camera.up.set(0.07250474189605663, -0.6324721569775834, -0.7711822307669628)        
        camera.near = 0.1
        break
      }
      flyToLocation = (flyToLocation+1)%6

      orbitControlsTargetPoint.copy(orbitControls.target.clone())
      setOrbitControlsTargetUpVector()
      orbitControlsUpVector.copy(orbitControlsTargetUpVector.clone())

      toRingAlreadyTriggered = true
      toPlanetAlreadyTriggered = false
      orbitControlsTargetPoint.copy(orbitControls.target.clone())
      orbitControlsTargetUpVector.copy(orbitControls.upDirection.clone())
      orbitControls.update()
      break;
    case 83: /*S*/
      genSpecs = true
      updateRing()
      genSpecs = false
      break;
    case 88: /*X*/
      animateZoomingIn = false
      animateZoomingOut = !animateZoomingOut
      break;
    case 90: /*Z*/
      animateZoomingIn = !animateZoomingIn
      animateZoomingOut = false
      break;
    case 72: /*H*/
      // Sweep a parameter to generate data for a graph 
      let results = []
      if (true) {
        const sweptParameter1 = 'equivalentLatitude'
        const sweptParameter2 = 'ringFinalAltitude'
        const backup1 = guidParamWithUnits[sweptParameter1].value
        const backup2 = guidParamWithUnits[sweptParameter2].value
        genSpecs = true
        for (let sweptValue1 = 10; sweptValue1<=70; sweptValue1+=10) {
          guidParamWithUnits[sweptParameter1].value = sweptValue1
          for (let sweptValue2 = 1000; sweptValue2<=100000; sweptValue2+=1000) {
            guidParamWithUnits[sweptParameter2].value = sweptValue2
            Object.entries(guidParamWithUnits).forEach(([k, v]) => {
              guidParam[k] = v.value
            })
            updateRing()
            results.push(specs['capitalCostPerKgSupported'].value)
          }
          console.log(sweptValue1, results.forEach(r => r.toFixed(2)).join(', '))
          results = []
        }
        guidParamWithUnits[sweptParameter1].value = backup1
        guidParamWithUnits[sweptParameter2].value = backup2
        updateRing()
        genSpecs = false
      }
      break;
    case 70: /*F*/
      // This is a utility function that conveniently loads presets for someone who is actively editing the code.
      console.log('Applying Illustration Settings')
      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        v.value = guidParam[k]
      })
      switch(fPreset) {
        case 0:
          // Solar panels on the ring for ring-based solar
          guidParamWithUnits['ringFinalAltitude'].value = 22000  // m
          guidParamWithUnits['numTethers'].value = 1300
          guidParamWithUnits['numForkLevels'].value = 10
          guidParamWithUnits['showLogo'].value = false
          guidParamWithUnits['showXYChart'].value = false
          guidParamWithUnits['showEarthsSurface'].value = true
          guidParamWithUnits['showEarthsAtmosphere'].value = true
          guidParamWithUnits['showMoon'].value = false
          guidParamWithUnits['showStars'].value = false
          guidParamWithUnits['showEarthAxis'].value = false
          guidParamWithUnits['showBackgroundPatch'].value = false
          guidParamWithUnits['showEarthEquator'].value = false
          guidParamWithUnits['showMainRingCurve'].value = false
          guidParamWithUnits['showGravityForceArrows'].value = false
          guidParamWithUnits['showGyroscopicForceArrows'].value = false
          guidParamWithUnits['showTethers'].value = true
          guidParamWithUnits['showTransitSystem'].value = true
          guidParamWithUnits['showStationaryRings'].value = true
          guidParamWithUnits['showMovingRings'].value = false
          guidParamWithUnits['showTransitTube'].value = true
          guidParamWithUnits['showTransitVehicles'].value = false
          guidParamWithUnits['showRingTerminuses'].value = true
          guidParamWithUnits['showGroundTerminuses'].value = false
          guidParamWithUnits['showElevatorCables'].value = true
          guidParamWithUnits['showElevatorCars'].value = false
          guidParamWithUnits['showHabitats'].value = false
          guidParamWithUnits['showSolarArrays'].value = true
          guidParamWithUnits['showLaunchTrajectory'].value = false
          guidParamWithUnits['showMassDriverTube'].value = false
          guidParamWithUnits['showMassDriverScrews'].value = false
          guidParamWithUnits['showEvacuatedTube'].value = false
          guidParamWithUnits['showLaunchSleds'].value = false
          guidParamWithUnits['showLaunchVehicles'].value = false
          guidParamWithUnits['showLaunchVehiclePointLight'].value = false
          guidParamWithUnits['pKeyAltitudeFactor'].value = 1
          guidParamWithUnits['mainRingSpacing'].value = 30

          camera.near = 0.1
          break
        case 1:
          const isOne = (guidParamWithUnits['parameterPresetNumber'].value==1)
          guidParamWithUnits['ringFinalAltitude'].value = 5000  // m
          guidParamWithUnits['numTethers'].value = 1300
          guidParamWithUnits['numForkLevels'].value = 2
          guidParamWithUnits['showLogo'].value = false
          guidParamWithUnits['showXYChart'].value = !isOne
          guidParamWithUnits['showEarthsSurface'].value = true
          guidParamWithUnits['showEarthsAtmosphere'].value = true
          guidParamWithUnits['showMoon'].value = false
          guidParamWithUnits['showStars'].value = false
          guidParamWithUnits['showEarthAxis'].value = false
          guidParamWithUnits['showBackgroundPatch'].value = false
          guidParamWithUnits['showEarthEquator'].value = false
          guidParamWithUnits['showMainRingCurve'].value = false
          guidParamWithUnits['showGravityForceArrows'].value = false
          guidParamWithUnits['showGyroscopicForceArrows'].value = false
          guidParamWithUnits['showTethers'].value = false
          guidParamWithUnits['showTransitSystem'].value = false
          guidParamWithUnits['showStationaryRings'].value = false
          guidParamWithUnits['showMovingRings'].value = false
          guidParamWithUnits['showTransitTube'].value = false
          guidParamWithUnits['showTransitVehicles'].value = false
          guidParamWithUnits['showRingTerminuses'].value = false
          guidParamWithUnits['showGroundTerminuses'].value = false
          guidParamWithUnits['showElevatorCables'].value = false
          guidParamWithUnits['showElevatorCars'].value = false
          guidParamWithUnits['showHabitats'].value = false
          guidParamWithUnits['showSolarArrays'].value = false
          guidParamWithUnits['showLaunchTrajectory'].value = !isOne
          guidParamWithUnits['showMassDriverTube'].value = true
          guidParamWithUnits['showMassDriverScrews'].value = isOne
          guidParamWithUnits['showEvacuatedTube'].value = true
          guidParamWithUnits['showLaunchSleds'].value = isOne
          guidParamWithUnits['showLaunchVehicles'].value = isOne
          guidParamWithUnits['showLaunchVehiclePointLight'].value = false
          guidParamWithUnits['pKeyAltitudeFactor'].value = 0
          camera.near = 0.1
          break
        case 2:
          //orbitControls.upDirection.set(-0.5517139461741912, -0.33633743039380865, -0.7632095744374486)
          guidParamWithUnits['ringFinalAltitude'].value = 100000  // m
          guidParamWithUnits['moveRingFactor'].value = 1
          guidParamWithUnits['equivalentLatitude'].value = Math.acos(targetRadius/(radiusOfPlanet + guidParamWithUnits['ringFinalAltitude'].value)) * 180 / Math.PI
          guidParamWithUnits['ringAmountRaisedFactor'].value = 0.01
          guidParamWithUnits['numMainRings'].value = 1
          guidParamWithUnits['numTethers'].value = 360
          guidParamWithUnits['numForkLevels'].value = 4
          guidParamWithUnits['tetherSpanOverlapFactor'].value = 1
          guidParamWithUnits['tetherPointBxAvePercent'].value = 0.8
          guidParamWithUnits['tetherPointBxDeltaPercent'].value = 0
          guidParamWithUnits['tetherEngineeringFactor'].value = 0.6
          //guidParamWithUnits['numElevatorCables'].value = 180
          // guidParamWithUnits['elevatorCableOpacity'].value = 0.1
          guidParamWithUnits['showMainRingCurve'].value = false
          guidParamWithUnits['showTethers'].value = true
          guidParamWithUnits['showTransitSystem'].value = false
          guidParamWithUnits['showTransitTube'].value = false
          guidParamWithUnits['showTransitVehicles'].value = false
          guidParamWithUnits['showRingTerminuses'].value = false
          guidParamWithUnits['showGroundTerminuses'].value = false
          guidParamWithUnits['showElevatorCables'].value = false
          guidParamWithUnits['showElevatorCars'].value = false
          guidParamWithUnits['showHabitats'].value = false
          guidParamWithUnits['showSolarArrays'].value = false
          guidParamWithUnits['showLaunchTrajectory'].value = false
          guidParamWithUnits['showLaunchVehicles'].value = false
          guidParamWithUnits['animateTransitVehicles'].value = false
          guidParamWithUnits['animateElevatorCars'].value = false
          guidParamWithUnits['animateLaunchVehicles'].value = false
          break
      }
      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        guidParam[k] = v.value
      })
      gui.children.forEach(folder => {
        if (folder.controllers) {
          folder.controllers.forEach(control => {
            control.updateDisplay()
          })
        } 
      })
      
      adjustEarthSurfaceVisibility()
      adjustEarthAtmosphereVisibility()
      adjustRingDesign()
      adjustCableOpacity()
      adjustTetherOpacity()
      updateTransitsystem()  
      adjustRingLatLon()
      adjustRingLatLon2()
      majorRedesign = true
      updateRing()
      majorRedesign = true
      fPreset = (fPreset+1)%3
  
      break;
    case 65: /*A*/
      // const recordEverything = (keyFrames.length == 0)
      // if (!recordEverything) {
      //   // Create a reference to the previous keyframe
      //   previousKeyFrame = keyFrames[keyFrames.length - 1]
      // }
      // Flesh out the basic heirarchy of a keyframe
      const keyFrame = {}
      keyFrame['guidParamWithUnits'] = {}
      keyFrame['orbitControls'] = {}
      keyFrame['orbitControls']['object'] = {}
      keyFrame['camera'] = {}
      // Record the state of guidParamsWithUnits
      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        if (v.tweenable) {
            keyFrame['guidParamWithUnits'][k] = {tween: true, param: 'guidParam', key: k, value: v.value, updateFunction: v.updateFunction}
        }
      })
      // Record the current state of the orbit controls and camera
      keyFrame['orbitControls']['target'] = {tween: true, param: 'orbitControls.target', value: orbitControls.target.clone()}
      keyFrame['orbitControls']['upDirection'] = {tween: true, param: 'orbitControls.upDirection', value: orbitControls.upDirection.clone()}       
      keyFrame['orbitControls']['object']['position'] = {tween: true, param: 'orbitControls.object.position', value: orbitControls.object.position.clone()}
      keyFrame['camera']['up'] = {tween: true, param: 'camera.up', value: camera.up.clone()}
      keyFrames.push(keyFrame)
      break;
    case 75: /*K*/
      // Erase the last keyFrame
      if (keyFrames.length>0) {
        const lastKeyframe = keyFrames.pop()
        // ToDo: We could attempt to dispose of the objects in the last keyfram, but we'll let garbage cleanup deal with that for now
      }
      break;
    case 66: /*B*/
      // Animation Sequence Playback
      // Restore all parameters  to the initia state
      keyFrameDelay = 0
      let orbitControlsTargetTweeners = []
      let orbitControlsUpDirectionTweeners = []
      let orbitControlsObjectPositionTweeners = []
      let cameraUpTweeners = []
      keyFrames.forEach((keyFrame, index) => {
        const firstKeyFrame = (index == 0)
        if (!firstKeyFrame) {
          // Create a reference to the previous keyframe
          previousKeyFrame = keyFrames[index - 1]
        }
        // Traverse the keyFrame and restore the values of the tweenable parameters
        const elements = {
          guidParam: keyFrame['guidParamWithUnits'],
          orbitControls_target: keyFrame['orbitControls']['target'],
          orbitControls_upDirection: keyFrame['orbitControls']['upDirection'],
          orbitControls_object_position: keyFrame['orbitControls']['object']['position'],
          camera_up: keyFrame['camera']['up'] }
        Object.entries(elements).forEach(([k, v]) => {
          // Test Code: const element = {tween: true, param: 'guidParam', key: 'tetherVisibility', value: 1, updateFunction: adjustTetherOpacity}
          switch (k) {
            case 'guidParam':
              // Object.entries(v).forEach(([k1,v1]) => {
              //   if (firstKeyFrame) {
              //     dParamWithUnitsTweeners.push(new TWEEN.Tween(guidParamWithUnits[k1]).to({value: v1.value}, keyFrameDelay).onUpdate(v1.updateFunction).start())
              //   } || (v1.value !== previousKeyFrame['guidParamWithUnits'][k1].value)) {
              //     const target = {}
              //     target[k1] = v1.value
              //     new TWEEN.Tween(guidParam).to(target, guidParamWithUnits['tweeningDuration'].value).easing(TWEEN.Easing.Cubic.InOut).onUpdate(v1.updateFunction).delay(keyFrameDelay).start(timeSinceStart*1000)
              //     console.log(k1, v1.value)
              //   }
              // })
              break
            case 'orbitControls_target':
              if (firstKeyFrame) {
                orbitControlsTargetTweeners.push(new TWEEN.Tween(orbitControls.target).to(v.value, 1000).easing(TWEEN.Easing.Cubic.InOut).start(timeSinceStart*1000))
              }
              else if (!orbitControls.target.equals(previousKeyFrame['orbitControls']['target'])) {
                orbitControlsTargetTweeners.push(new TWEEN.Tween(orbitControls.target).to(v.value, guidParamWithUnits['tweeningDuration'].value).easing(TWEEN.Easing.Cubic.InOut))
                const l = orbitControlsTargetTweeners.length
                orbitControlsTargetTweeners[l - 2].chain(orbitControlsTargetTweeners[l - 1])
              }
              break
            case 'orbitControls_upDirection':
              if (firstKeyFrame) {
                orbitControlsUpDirectionTweeners.push(new TWEEN.Tween(orbitControls.upDirection).to(v.value, 1000).easing(TWEEN.Easing.Cubic.InOut).start(timeSinceStart*1000))
              }
              else if (!orbitControls.upDirection.equals(previousKeyFrame['orbitControls']['upDirection'])) {
                orbitControlsUpDirectionTweeners.push(new TWEEN.Tween(orbitControls.upDirection).to(v.value, guidParamWithUnits['tweeningDuration'].value).easing(TWEEN.Easing.Cubic.InOut))
                const l = orbitControlsUpDirectionTweeners.length
                orbitControlsUpDirectionTweeners[l - 2].chain(orbitControlsUpDirectionTweeners[l - 1])
              }
              break
            case 'orbitControls_object_position':
              if (firstKeyFrame) {
                orbitControlsObjectPositionTweeners.push(new TWEEN.Tween(orbitControls.object.position).to(v.value, 1000).easing(TWEEN.Easing.Cubic.InOut).start(timeSinceStart*1000))
              }
              else if (!orbitControls.object.position.equals(previousKeyFrame['orbitControls']['object']['position'])) {
                orbitControlsObjectPositionTweeners.push(new TWEEN.Tween(orbitControls.object.position).to(v.value, guidParamWithUnits['tweeningDuration'].value).easing(TWEEN.Easing.Cubic.InOut))
                const l = orbitControlsObjectPositionTweeners.length
                orbitControlsObjectPositionTweeners[l - 2].chain(orbitControlsObjectPositionTweeners[l - 1])
              }
              break
            case 'camera_up':
              if (firstKeyFrame) {
                cameraUpTweeners.push(new TWEEN.Tween(camera.up).to(v.value, 1000).easing(TWEEN.Easing.Cubic.InOut).start(timeSinceStart*1000))
              }
              else if (!camera.up.equals(previousKeyFrame['camera']['up'])) {
                cameraUpTweeners.push(new TWEEN.Tween(camera.up).to(v.value, guidParamWithUnits['tweeningDuration'].value).easing(TWEEN.Easing.Cubic.InOut))
                const l = cameraUpTweeners.length
                cameraUpTweeners[l - 2].chain(cameraUpTweeners[l - 1])
              }
              break
          }
        })
        keyFrameDelay += guidParamWithUnits['tweeningDuration'].value*2
      })
      break
    case 69: /*E*/
      followElevators = !followElevators
      break
    case 67: /*C*/
      followTransitVehicles = !followTransitVehicles
      break
    case 74: /*J*/
      if (enableLaunchSystem && (followLaunchVehicles==0)) {
        lastPointOnLaunchTrajectoryCurve = launchSystemObject.launchTrajectoryCurve.getPoint(10/launchSystemObject.durationOfLaunchTrajectory)
        followLaunchVehiclesStartTime = timeSinceStart - 1
        
        const point1OnLaunchTrajectoryCurve = launchSystemObject.launchTrajectoryCurve.getPoint(20/launchSystemObject.durationOfLaunchTrajectory)
        point1OnLaunchTrajectoryCurve.multiplyScalar((radiusOfPlanet + 100) / radiusOfPlanet)

        const point2OnLaunchTrajectoryCurve = launchSystemObject.launchTrajectoryCurve.getPoint(0)
        point2OnLaunchTrajectoryCurve.multiplyScalar((radiusOfPlanet + 100) / radiusOfPlanet)

        orbitControlsTargetPoint.copy(point1OnLaunchTrajectoryCurve)
        setOrbitControlsTargetUpVector()
        new TWEEN.Tween(orbitControls.target)
          .to(point1OnLaunchTrajectoryCurve, 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start(timeSinceStart*1000)
        new TWEEN.Tween(orbitControls.upDirection)
          .to(orbitControlsTargetUpVector, 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start(timeSinceStart*1000)
        new TWEEN.Tween(camera.position)
          .to(point2OnLaunchTrajectoryCurve, 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start(timeSinceStart*1000)
        new TWEEN.Tween(camera.up)
          .to(orbitControlsTargetUpVector, 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start(timeSinceStart*1000)
      
        followLaunchVehicles = 1
      }
      else if (followLaunchVehicles==1) {
        followLaunchVehicles = 2
      }
      else {
        followLaunchVehicles = 0
      }
      break
    case 98: /*Down Arrow*/
      backgroundPatchMesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0).cross(backgroundPatchMesh.position).normalize(), 0.005*Math.PI/180)
      console.log(backgroundPatchMesh.position)
      break
    case 100: /*Left Arrow*/
      backgroundPatchMesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.005*Math.PI/180)
      console.log(backgroundPatchMesh.position)
      break
    case 102: /*Right Arrow*/
      backgroundPatchMesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.005*Math.PI/180)
      console.log(backgroundPatchMesh.position)
      break
    case 104: /*Up Arrow*/
      backgroundPatchMesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0).cross(backgroundPatchMesh.position).normalize(), -0.005*Math.PI/180)
      console.log(backgroundPatchMesh.position)
      break
    case 105: /*Page Up*/
      backgroundPatchMesh.scale.multiplyScalar(1.005)
      console.log(backgroundPatchMesh.scale)
      break
    case 99: /*Page Down*/
      backgroundPatchMesh.scale.multiplyScalar(0.995)
      console.log(backgroundPatchMesh.scale)
      break
    case 188: /*<*/
      backgroundPatchMesh.rotateZ(0.5*Math.PI/180)
      console.log(backgroundPatchMesh.rotation)
      break
    case 190: /*>*/
      backgroundPatchMesh.rotateZ(-0.5*Math.PI/180)
      console.log(backgroundPatchMesh.rotation)
      break
    case 191: /*?*/
      backgroundPatchMesh.material.opacity = 1 - backgroundPatchMesh.material.opacity
      break
    default:
      console.log(event.keyCode)
      break
  }
}

function setupTweeningOperation() {
  orbitControlsTargetPoint.copy(targetPoint)
  const offset = targetPoint.clone().sub(orbitControls.target)
  setOrbitControlsTargetUpVector()

  tweeningActive = true
  new TWEEN.Tween(orbitControls.target)
    .to(orbitControlsTargetPoint, tweeningTime)
    .easing(TWEEN.Easing.Linear.None)
    .start(timeSinceStart*1000)
    .onComplete(() => {tweeningActive = false})
  if (!stationaryCameraTrackingMode) {
    new TWEEN.Tween(orbitControls.object.position)
      .to(orbitControls.object.position.clone().add(offset), tweeningTime)
      .easing(TWEEN.Easing.Linear.None)
      .start(timeSinceStart*1000)
    new TWEEN.Tween(orbitControls.upDirection)
      .to(orbitControlsTargetUpVector, tweeningTime)
      .easing(TWEEN.Easing.Linear.None)
      .start(timeSinceStart*1000)
    new TWEEN.Tween(camera.up)
      .to(orbitControlsTargetUpVector, tweeningTime)
      .easing(TWEEN.Easing.Linear.None  )
      .start(timeSinceStart*1000)
  }
}

function orbitControlsEventHandler() {
  //if (verbose) console.log("recomputing near/far")
  recomputeNearFarClippingPlanes()
  //if (verbose) console.log("auto-adjusting orbit target")

  //Hack
  //autoAdjustOrbitControlsCenter()
}

function recomputeNearFarClippingPlanes() {
  // Calculate the distance to the nearest object - for this we will use the sphere encompassing the Earth and it's stratosphere
  // Multiply that by the cosine of the camera's fulstrum angle
  // Note: Assumes the planet is centered on the origin!!!
  camera.near = Math.max(10, camera.position.length() - (radiusOfPlanet+dParamWithUnits['ringFinalAltitude'].value+extraDistanceForCamera)) * Math.cos(camera.getEffectiveFOV()*Math.PI/180)
  // Hack
  //camera.near = 0.1

  // camera.near = Math.max(10, camera.position.distanceTo(planetMeshes[0].position) - (radiusOfPlanet+dParamWithUnits['ringFinalAltitude'].value+extraDistanceForCamera)) * Math.cos(camera.getEffectiveFOV()*Math.PI/180)
  // Far calculation: Use the pythagorean theorm to compute distance to the Earth's horizon,
  // then add the distrance from there to the edge of the sphere that represents the atmosphere,
  // then pad this sum by a factor of 1.5
  const d1Squared = camera.position.length()**2 - radiusOfPlanet**2
  //const d1Squared = camera.position.distanceTo(planetMeshes[0].position)**2 - radiusOfPlanet**2
  const d2Squared = (radiusOfPlanet*1.1)**2 - radiusOfPlanet**2
  let d1, d2
  if (d1Squared>0) {
    d1 = Math.sqrt(d1Squared)
  }
  else {
    d1 = 0
  }
  if (d2Squared>0) {
    d2 = Math.sqrt(d2Squared)
  }
  else {
    d2 = 0
  }
  camera.far = Math.max(camera.near*16384, (d1 + d2) * 1.5)

  // Hack
  if (enableVR) {
    camera.near = 0.1 // 0.00001 * radiusOfPlanet
    camera.far = 100 * radiusOfPlanet
  }
  else {
    if (nonGUIParams['overrideClipPlanes']) {
      camera.near = nonGUIParams['nearClip']
      camera.far = nonGUIParams['farClip']
    }
  }

  //console.log(camera.near, camera.near*16384, (d1+d2)*1.5, camera.far, 2)
  camera.updateProjectionMatrix()
  nearClippingPlane = camera.near
  farClippingPlane = camera.far
}

let previousUpVector = new THREE.Vector3(0, 1, 0)
let orbitControlsUpVector = new THREE.Vector3(0, 1, 0)
let lockUpToRingAxis = false
let orbitControlsTargetUpVector = new THREE.Vector3(0, 1, 0)
let previousTargetPoint = new THREE.Vector3(0, 0, 0)
let orbitControlsTargetPoint = new THREE.Vector3(0, 0, 0)
let toRingAlreadyTriggered = false
let toPlanetAlreadyTriggered = true
let orbitControlsEarthRingLerpFactor = 1 // When 1, this indicates no tweening is in progress
let orbitControlsEarthRingLerpSpeed
let orbitControlsNewMaxPolarAngle = Math.PI

function autoAdjustOrbitControlsCenter() {
  const distanceToCenterOfEarth = camera.position.length()
  const innerTransitionDistance = radiusOfPlanet+1000000
  const outerTransitionDistance = radiusOfPlanet+2000000
  if (distanceToCenterOfEarth>outerTransitionDistance) {
    toRingAlreadyTriggered = false  // Reset the trigger
    if (!toPlanetAlreadyTriggered) {
      //previousTargetPoint.copy(orbitControlsTargetPoint.clone())
      //previousUpVector.copy(orbitControlsTargetUpVector.clone())
      previousTargetPoint.copy(orbitControls.target.clone())
      previousUpVector.copy(orbitControls.upDirection.clone())
      orbitControlsTargetPoint.set(0, 0, 0)
      // ToDo: Need to find the nearest point on the ring to the orbitControlsSurfaceMarker and set orbitControlsTargetPoint to that
      orbitControlsTargetUpVector.set(0, 1, 0)
      orbitControlsEarthRingLerpFactor = 0
      orbitControlsEarthRingLerpSpeed = 1/256
      orbitControls.maxPolarAngle = Math.PI
      orbitControlsNewMaxPolarAngle = Math.PI
      orbitControls.rotateSpeed = 1
      //orbitControlsSurfaceMarker.visible = false
      toPlanetAlreadyTriggered = true
    }
  }
  //else if ((distanceToCenterOfEarth>innerTransitionDistance) && (distanceToCenterOfEarth<outerTransitionDistance)) {
    //const pointAboveEarthsSurface = pointOnEarthsSurface.clone().multiplyScalar((radiusOfPlanet + crv.currentMainRingAltitude)/radiusOfPlanet)
    //orbitControlsSurfaceMarker.position.copy(pointAboveEarthsSurface)
    //orbitControlsSurfaceMarker.visible = true
  //}
  else if (distanceToCenterOfEarth<=innerTransitionDistance) {
    if (!toRingAlreadyTriggered) {
      const screenCenter = new THREE.Vector2(0, 0) // The center of the screen is, by definition, (0,0)
      raycaster.setFromCamera(screenCenter, camera)
      if (verbose) console.log("raycasting")
      const planetIntersects = []
      planetMeshes.traverse(child => {
        if (child.type==='Mesh') {
          planetIntersects.push.apply(planetIntersects, raycaster.intersectObject(child))
        }
      })
      if (planetIntersects.length>0) {
        const pointOnEarthsSurface = planetIntersects[0].point
        // Second criteria is that we're sufficiently close to the point that the user wants to zoom into, even if they are zooming in at an oblique angle.
        const distanceToPointOnEarthsSurface = pointOnEarthsSurface.clone().sub(camera.position).length()
        if (distanceToPointOnEarthsSurface<innerTransitionDistance) {
          //previousTargetPoint.copy(orbitControlsTargetPoint.clone())
          //previousUpVector.copy(orbitControlsTargetUpVector.clone())
          previousTargetPoint.copy(orbitControls.target.clone())
          previousUpVector.copy(orbitControls.upDirection.clone())
          // ToDo: Need to find the nearest point on the ring to the orbitControlsSurfaceMarker and set orbitControlsTargetPoint to that
          // Convert pointOnEarthsSurface into tetheredRingRefCoordSys
          const localPoint = tetheredRingRefCoordSys.worldToLocal(pointOnEarthsSurface.clone()).normalize()
          // Then compute it's theta value and convert it to a 0 to 1 value 
          const originalTheta = (Math.atan2(localPoint.z, localPoint.x) / (2*Math.PI) + 1) % 1
          // Round theta to align it with the position of an elevator cable
          const numGoodSpots = dParamWithUnits['numVirtualRingTerminuses'].value
          const roundedTheta = Math.round(originalTheta*numGoodSpots) / numGoodSpots * Math.PI*2
          // Then find a point on the ring with the same theta value
          const transitTube_r = crv.mainRingRadius + tram.offset_r(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
          const transitTube_y = crv.yc + tram.offset_y(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
          localPoint.set(transitTube_r*Math.cos(roundedTheta), transitTube_y, transitTube_r*Math.sin(roundedTheta))
          // Convert that point back into planetCoordSys
          const worldPoint = tetheredRingRefCoordSys.localToWorld(localPoint.clone())
          //orbitControlsCenterMarker.position.copy(worldPoint.clone())
          orbitControlsTargetPoint.copy(worldPoint.clone())
          orbitControlsTargetUpVector = planetCoordSys.worldToLocal(worldPoint.clone()).normalize()
          orbitControlsEarthRingLerpFactor = 0
          orbitControlsEarthRingLerpSpeed = 1/256
          orbitControlsNewMaxPolarAngle = Math.PI/2 + Math.PI/2
          orbitControls.rotateSpeed = 0.9
          //orbitControlsSurfaceMarker.visible = false
          toRingAlreadyTriggered = true
        }
      }
    }
    toPlanetAlreadyTriggered = false // Reset trigger      
  }
}

if (enableKMLFileFeature) {
  // This code creates the button that downloads a .kml file which can be displayed using
  // Google Earth's "Create Project" button, followed by "Import KML file from computer"
  var kmlTextFile = null
  var makeKmlTextFile = function () {
    // Hack
    //genKMLFile = true
    genLauncherKMLFile = true
    const prevFastTetherRender = fastTetherRender
    fastTetherRender = false // Can't generate a KML file when using the fast tether rendering technique
    kmlFile = ''
    kmlFile = kmlutils.kmlFileHeader
    updateRing()
    kmlFile = kmlFile.concat(launchSystemObject.kmlFile)
    // kmlFile = kmlFile.concat(tetherKml)
    kmlFile = kmlFile.concat(kmlutils.kmlFileFooter)
    genKMLFile = false
    genLauncherKMLFile = false
    fastTetherRender = prevFastTetherRender
    var data = new Blob([kmlFile], {type: 'text/plain'})
    // If we are replacing a previously generated file we need to manually revoke the object URL to avoid memory leaks.
    if (kmlTextFile !== null) {
      window.URL.revokeObjectURL(kmlTextFile)
    }
    kmlTextFile = window.URL.createObjectURL(data)
    return kmlTextFile
  }

  var createkml = document.getElementById('createkml')

  createkml.addEventListener('click', function () {
    var link = document.createElement('a')
    link.setAttribute('download', 'tethered_ring.kml')
    link.href = makeKmlTextFile()
    document.body.appendChild(link)

    // wait for the link to be added to the document
    window.requestAnimationFrame(function () {
      var event = new MouseEvent('click')
      link.dispatchEvent(event)
      document.body.removeChild(link)
    })
  }, false)
}

if (enableSpecsFileFeature) {
  // This code creates the button that downloads a .csv file which can be loadd into Excel
  var textFile = null
  var makeTextFile = function () {
    genSpecs = true
    genSpecsFile = true
    const prevFastTetherRender = fastTetherRender
    specsFile = ''
    updateRing()
    genSpecs = false
    genSpecsFile = false
    fastTetherRender = prevFastTetherRender
    var data = new Blob([specsFile], {type: 'text/plain'})
    // If we are replacing a previously generated file we need to manually revoke the object URL to avoid memory leaks.
    if (textFile !== null) {
      window.URL.revokeObjectURL(textFile)
    }
    textFile = window.URL.createObjectURL(data)
    return textFile
  }

  var createSpecs = document.getElementById('createSpecs')

  createSpecs.addEventListener('click', function () {
    var link = document.createElement('a')
    link.setAttribute('download', 'tethered_ring.csv')
    link.href = makeTextFile()
    document.body.appendChild(link)

    // wait for the link to be added to the document
    window.requestAnimationFrame(function () {
      var event = new MouseEvent('click')
      link.dispatchEvent(event)
      document.body.removeChild(link)
    })
  }, false)
}

// Synchronized Frame Capture
var startCapturingFramesButton = document.getElementById( 'start-capturing-frames-button' )
var startCapturingTrackPointsButton = document.getElementById( 'start-capturing-track-points-button' )
var stopCapturingAndDownloadButton = document.getElementById( 'stop-capturing-and-download-button' )
var progress = document.getElementById( 'progress' )

startCapturingFramesButton.addEventListener( 'click', function( e ) {

  let framerate

  if (dParamWithUnits['controlCameraFromJsonDuringCapture'].value) {
    framerate = cameraControlData['frameRate']
    cameraControlActive = true
  }
  else {
    framerate = document.querySelector('input[name="framerate"]:checked').value;
  }

  capturer = new CCapture( {
    verbose: false,
    display: true,
    framerate: framerate,
    motionBlurFrames: ( 960 / framerate ) * ( document.querySelector('input[name="motion-blur"]').checked ? 1 : 0 ),
    quality: 100,
    format: document.querySelector('input[name="encoder"]:checked').value,
    workersPath: './components/CCapture/',
    //timeLimit: 60,  // This is just to help prevent the feature from accidentally filling up the hard drve
    //frameLimit: 1200,
    autoSaveTime: 1,
    onProgress: function( p ) { progress.style.width = ( p * 100 ) + '%' }
  } );

  capturer.start();
  this.style.display = 'none';
  startCapturingTrackPointsButton.style.display = 'none';
  stopCapturingAndDownloadButton.style.display = 'initial';
  e.preventDefault();

  // Hack - forces the CCapture resolution
  // const width = 3840
  // const height = 2160
  // renderer.setSize(width, height)
  // camera.aspect = width/height
  // camera.updateProjectionMatrix()

}, false );

startCapturingTrackPointsButton.addEventListener( 'click', function( e ) {
  trackPointLoggerObject = new trackPointLogger()
  trackPointLoggerObject.start(googleEarthProjectFile)
})

stopCapturingAndDownloadButton.addEventListener( 'click', function( e ) {
  if (capturer) captureStop()
  if (trackPointLoggerObject) trackPointLoggerStop()
}, false );

function captureStop() {
  capturer.stop();
  stopCapturingAndDownloadButton.style.display = 'none';
  //this.setAttribute( 'href',  );
  // console.log(capturer, 'Saving...')
  capturer.save();
  startCapturingTrackPointsButton.style.display = 'initial';
  startCapturingFramesButton.style.display = 'initial';
  const width = simContainer.offsetWidth
  const height = simContainer.offsetHeight
  renderer.setSize(width, height)
  camera.aspect = width/height
  camera.updateProjectionMatrix()
}

function trackPointLoggerStop() {
  trackPointLoggerObject.stop()
  stopCapturingAndDownloadButton.style.display = 'none';
  trackPointLoggerObject.save()
  startCapturingTrackPointsButton.style.display = 'initial';
  startCapturingFramesButton.style.display = 'initial';
}
