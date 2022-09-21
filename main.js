// Use when local
import * as THREE from "three";
//import { GUI } from 'three/examples/jsm/libs/dat.gui.module'
//import { CanvasCapture } from 'canvas-capture'
//import CCapture from 'three/examples/jsm/libs/CCapture.all.min.js'
//import CCapture from 'C:/Users/phils/Documents/repos/Three.js/three.js/examples/jsm/libs/ccapture.all.min.js'
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { TWEEN } from "three/examples/jsm/libs/tween.module.min";
//import { TWEEN } from '../tween.js/dist/tween.esm.js'
import { Water } from "three/examples/jsm/objects/Water.js";
//import * as CCapture from 'three/examples/jsm/libs/CCapture.all.min.js'

import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Use for website
// import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
// import { GUI } from 'https://cdn.skypack.dev/three@0.138.1/examples/jsm/libs/lil-gui.module.min.js'
// import { TWEEN } from 'https://cdn.skypack.dev/three@0.138.1/examples/jsm/libs/tween.module.min'
// import * as BufferGeometryUtils from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/utils/BufferGeometryUtils.js'

// Not used
//import { VRButton } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/webxr/VRButton.js'
//import { FBXLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/FBXLoader.js'
// import Stats from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/libs/stats.module.js'

// import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'
// import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
// import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
// import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
// import Stats from 'three/examples/jsm/libs/stats.module.js'

import {
  mainRingTubeGeometry,
  transitTubeGeometry,
  transitTrackGeometry,
} from "./TransitTrack.js";
import { transitSystem } from "./TransitSystems.js";
import { TetherGeometry } from "./tethers.js";
import { OrbitControls } from "./OrbitControlsModified.js";

import * as tram from "./tram.js";
import * as launcher from "./launcher.js";
import * as kmlutils from "./kmlutils.js";
import * as markers from "./markers.js";

import { makePlanetTexture } from "./planetTexture.js";

let verbose = false;
const enableVR = false;
const enableKMLFileFeature = true;
const enableSpecsFileFeature = true;
let genKMLFile = false;
let genSpecs = false;
let genSpecsFile = false;
let fastTetherRender = true; // Fast render also uses the jitter reduction technique of creating a mesh with coordinates relative to a point near the ring, and then setting these mesh positions near the ring as well. However, this technique generates coordinates that are not useful for kml file generation.
let majorRedesign = true; // False enables work in progress...
let capturer = null;
let animationState = 0;
const keyFrames = [];
let keyFrameDelay = 0;
let previousKeyFrame;
let followElevators = false;
let followTransitVehicles = false;
let followLaunchVehicles = false;

// Useful constants that we never plan to change
// ToDo - We need to output these to the specs file as well.
const gravitationalConstant = 0.0000000000667408;
let massOfPlanet = 5.97e24; // kg   using mass of Earth for now
let radiusOfPlanet = 6378100; // m   using radius of Earth for now
const WGS84FlattenningFactor = 298.257223563; // Used to specify the exact shape of earth, which is approximately an oblate spheroid
const lengthOfSiderealDay = 86164.0905; // seconds    using value for Earth for now

const gui = new GUI({ width: 500 });
//gui.width = 1000
gui.close();
const folderGeography = gui.addFolder("Location (V6)").close();
const folderEngineering = gui.addFolder("Engineering").close();
const folderMaterials = gui.addFolder("Materials").close();
const folderEconomics = gui.addFolder("Economics").close();
const folderRendering = gui.addFolder("Rendering").close();
const folderTextOutput = gui.addFolder("TextOutput").close();

const guiTextOutput = document.createElement("div");
guiTextOutput.classList.add("gui-stats");
guiTextOutput.innerHTML = [
  "(Press 's' to update)",
  "<i>Total Tethered Ring Cost</i>: " + 0,
  "<i>Total Tethered Ring Cost Per Kg Supported</i>: " + 0,
  "<i>Total Stored Energy in TWh</i>: " + 0,
  "<i>Moving Ring Speed</i>: " + 0,
].join("<br/>");
//folderTextOutput.open()
//console.log(folderTextOutput, folderTextOutput.$children, guiTextOutput)
folderTextOutput.$children.appendChild(guiTextOutput);
//folderTextOutput.__ul.appendChild( guiTextOutput );

const targetRadius = 32800000 / Math.PI / 2; // 32800 km is the max size a perfectly circular ring can be and still fits within the Pacific Ocean

const equivalentLatitudePreset =
  (Math.acos(targetRadius / (radiusOfPlanet + 32000)) * 180) / Math.PI;

// Hack - distort scale to better illustrate certain concepts
// radiusOfPlanet = 637810
// massOfPlanet = 5.97E+22

// Constants controlled by sliders
const guidParamWithUnits = {
  //equivalentLatitude: 35.473512807508094,
  // Alternate location with the increased diameter needed to reach both US and China's coastlines (note: too large to construct in the Pacific Ocean)
  //equivalentLatitude: 30.8,
  //ringCenterLongitude: 182,
  //ringCenterLatitude: 11,
  //ringFinalAltitude: 32000,  // m
  equivalentLatitude: {
    value: equivalentLatitudePreset,
    units: "degrees",
    autoMap: false,
    min: 0,
    max: 89.9,
    updateFunction: adjustRingDesign,
    folder: folderGeography,
  },
  // Final Location
  buildLocationRingCenterLongitude: {
    value: 213.7,
    units: "degrees",
    autoMap: false,
    min: 0,
    max: 360,
    updateFunction: adjustRingLatLon,
    folder: folderGeography,
  },
  finalLocationRingCenterLongitude: {
    value: 186.3,
    units: "degrees",
    autoMap: false,
    min: 0,
    max: 360,
    updateFunction: adjustRingLatLon,
    folder: folderGeography,
  },
  buildLocationRingCenterLatitude: {
    value: -19.2,
    units: "degrees",
    autoMap: false,
    min: -90,
    max: 90,
    updateFunction: adjustRingLatLon,
    folder: folderGeography,
  },
  //Hack
  finalLocationRingCenterLatitude: {
    value: 14.2,
    units: "degrees",
    autoMap: false,
    min: -90,
    max: 90,
    updateFunction: adjustRingLatLon,
    folder: folderGeography,
  },
  //finalLocationRingCenterLatitude: {value: 90, units: "degrees", autoMap: false, min: -90, max: 90, updateFunction: adjustRingLatLon, folder: folderGeography},
  // Build location (assumes equivalentLatitude = 35)
  buildLocationRingEccentricity: {
    value: 1,
    units: "",
    autoMap: false,
    min: 0.97,
    max: 1.03,
    step: 0.001,
    updateFunction: adjustRingDesign,
    folder: folderGeography,
  },
  finalLocationRingEccentricity: {
    value: 1,
    units: "",
    autoMap: false,
    min: 0.97,
    max: 1.03,
    step: 0.001,
    updateFunction: adjustRingDesign,
    folder: folderGeography,
  },
  // ToDo: moveRing needs to call adjustRingDesign when buildLocationRingEccentricity differs from finalLocationRingEccentricity
  moveRing: {
    value: 1,
    units: "",
    autoMap: false,
    min: 0,
    max: 1,
    tweenable: true,
    updateFunction: adjustRingLatLon,
    folder: folderGeography,
  },
  locationPresetIndex: {
    value: 0,
    units: "",
    autoMap: true,
    min: 0,
    max: 6,
    tweenable: false,
    updateFunction: setRingLatLonWithPreset,
    folder: folderGeography,
  },

  // Physical Constants
  permeabilityOfFreeSpace: {
    value: 4 * Math.PI * 1e-7,
    units: "N/A2",
    autoMap: true,
    min: 0,
    max: 0.0001,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },

  // Engineering Parameters - Ring
  ringFinalAltitude: {
    value: 32000,
    units: "m",
    autoMap: true,
    min: 0,
    max: 200000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  ringAmountRaisedFactor: {
    value: 1,
    units: "",
    autoMap: true,
    min: 0,
    max: 5,
    tweenable: true,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  //movingRingsRotationalPeriod: {value: 1800, units: "s", autoMap: true, min: 0, max: 3600, updateFunction: adjustRingDesign, folder: folderEngineering},
  movingRingsMassPortion: {
    value: 0.382,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  numControlPoints: {
    value: 256,
    units: "",
    autoMap: true,
    min: 4,
    max: 1024,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  totalMassPerMeterOfRing: {
    value: 100,
    units: "kg",
    autoMap: true,
    min: 1,
    max: 1000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  statorMassPerUnitOfLoad: {
    value: 0.02,
    units: "kg/N",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  relativePermeabilityOfCore: {
    value: 8000,
    units: "",
    autoMap: true,
    min: 0,
    max: 100000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  ringMaglevFieldLoopLength: {
    value: 0.1,
    units: "m",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  ringMaglevCoreCrossSectionLength: {
    value: 0.01,
    units: "m",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  ringMaglevCoreCrossSectionWidth: {
    value: 0.02,
    units: "m",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  ringMaglevAirGap: {
    value: 0.0005,
    units: "m",
    autoMap: true,
    min: 0,
    max: 0.01,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  ringMaglevCoilsNumLoops: {
    value: 100,
    units: "",
    autoMap: true,
    min: 0,
    max: 1000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  wireRadius: {
    value: 0.0013,
    units: "",
    autoMap: true,
    min: 0,
    max: 0.01,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  portionOfCoreOnStationaryRing: {
    value: 0.7,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },

  // Engineering Parameters - Tethers
  numTethers: {
    value: 3600,
    units: "",
    autoMap: true,
    min: 4,
    max: 7200,
    step: 2,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  numForkLevels: {
    value: 7,
    units: "",
    autoMap: true,
    min: 0,
    max: 10,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  }, // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from base to a single attachment point)
  tetherSpanOverlapFactor: {
    value: 2,
    units: "%",
    autoMap: true,
    min: 0.5,
    max: 4,
    tweenable: true,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  tetherPointBxAvePercent: {
    value: 50,
    units: "%",
    autoMap: true,
    min: 0,
    max: 100,
    tweenable: true,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  tetherPointBxDeltaPercent: {
    value: 40,
    units: "%",
    autoMap: true,
    min: 0,
    max: 50,
    tweenable: true,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  tetherEngineeringFactor: {
    value: 2.0,
    units: "",
    autoMap: true,
    min: 0.1,
    max: 10,
    tweenable: true,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },

  // Engineering Parameters - Stationary Rings
  numMainRings: {
    value: 5,
    units: "",
    autoMap: true,
    min: 1,
    max: 7,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  mainRingTubeRadius: {
    value: 0.5,
    units: "m",
    autoMap: true,
    min: 0.1,
    max: 5,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  }, // ToDo - Retire this parameter
  mainRingSpacing: {
    value: 10,
    units: "m",
    autoMap: true,
    min: 0,
    max: 30,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },

  numMainRings2: {
    value: 5,
    units: "",
    autoMap: true,
    min: 1,
    max: 7,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  mainRingSpacing2: {
    value: 10,
    units: "m",
    autoMap: true,
    min: 0,
    max: 30,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  mainRingUpwardOffset: {
    value: 0,
    units: "m",
    autoMap: true,
    min: -100,
    max: 100,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  mainRingOutwardOffset: {
    value: 0,
    units: "m",
    autoMap: true,
    min: -10,
    max: 10,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  stationaryRingTubeRadius: {
    value: 0.5,
    units: "m",
    autoMap: true,
    min: 0.1,
    max: 20,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  movingRingTubeRadius: {
    value: 0.4,
    units: "m",
    autoMap: true,
    min: 0.1,
    max: 20,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  // ToDo: These are really a function of numMainRings. Should calculate them rather than specifying them.
  stationaryRingNumModels: {
    value: 512,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  movingRingNumModels: {
    value: 512,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  // numVirtualStationaryRings: This is computed from the sum of numVirtualRingTerminuses and numVirtualHabitats
  // numVirtualMovingRings: This is computed from the sum of numVirtualRingTerminuses and numVirtualHabitats

  // Engineering Parameters - Transit System
  transitTubeTubeRadius: {
    value: 6,
    units: "m",
    autoMap: true,
    min: 1,
    max: 20,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTubeUpwardOffset: {
    value: -100,
    units: "m",
    autoMap: true,
    min: -200,
    max: 0,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTubeOutwardOffset: {
    value: -15,
    units: "m",
    autoMap: true,
    min: -11,
    max: -9,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTubeNumModels: {
    value: 256,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTrackOuterOffset: {
    value: 2.2875,
    units: "m",
    autoMap: true,
    min: 1.5,
    max: 2.5,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTrackUpperOffset1: {
    value: 4.7875,
    units: "m",
    autoMap: true,
    min: 2.5,
    max: 3.5,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTrackUpperOffset2: {
    value: -0.025,
    units: "m",
    autoMap: true,
    min: -1.0,
    max: -0.5,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  // ToDo - Need 4 sliders for adjusting the track vertical and horizontal spacing and offsets
  ringTerminusOutwardOffset: {
    value: -9.75,
    units: "m",
    autoMap: true,
    min: -10,
    max: -5,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  ringTerminusUpwardOffset: {
    value: -3.8,
    units: "m",
    autoMap: true,
    min: -5,
    max: -3,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  groundTerminusOutwardOffset: {
    value: -9.75,
    units: "m",
    autoMap: true,
    min: -200,
    max: 200,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  groundTerminusUpwardOffset: {
    value: 150,
    units: "m",
    autoMap: true,
    min: -200,
    max: 200,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },

  transitVehicleUpwardOffset: {
    value: 1.1,
    units: "m",
    autoMap: true,
    min: -1,
    max: 2,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitVehicleCruisingSpeed: {
    value: 500,
    units: "m/s",
    autoMap: true,
    min: 0,
    max: 2000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitVehicleMaxAcceleration: {
    value: 10,
    units: "m/s2",
    autoMap: true,
    min: 0,
    max: 50,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitVehicleMergeTime: {
    value: 1,
    units: "s",
    autoMap: true,
    min: 1,
    max: 30,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitVehicleStopDuration: {
    value: 3,
    units: "s",
    autoMap: true,
    min: 1,
    max: 300,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },

  // ToDo: There are no calculations implemented yet that use the following parameters
  transitVehicleLength: {
    value: 20,
    units: "m",
    autoMap: true,
    min: 1,
    max: 100,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  // ToDo - Vehicle Radius doesn't do anything and probably does not match the model
  transitVehicleRadius: {
    value: 2,
    units: "m",
    autoMap: true,
    min: 1,
    max: 10,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTubeInteriorPressure: {
    value: 10,
    units: "Pa",
    autoMap: true,
    min: 0.1,
    max: 1000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTubeInteriorGasMolecularWeight: {
    value: 29,
    units: "kg/kgmole",
    autoMap: true,
    min: 1,
    max: 100,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitTubeInteriorTemperature: {
    value: 20,
    units: "C",
    autoMap: true,
    min: 0,
    max: 40,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitSystemEfficiencyAtCruisingSpeed: {
    value: 0.8,
    units: "",
    autoMap: true,
    min: 0.1,
    max: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitVehicleCoefficientOfDrag: {
    value: 0.25,
    units: "",
    autoMap: true,
    min: 0.1,
    max: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitSystemMassPerMeter: {
    value: 200,
    units: "kg",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  transitSystemMaterialsCostPerMeter: {
    value: 18000,
    units: "USD/m",
    autoMap: true,
    min: 1,
    max: 30000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  }, // https://youtu.be/PeYIo91DlWo?t=490

  // ToDo: these parameters are not properly updated yet
  numVirtualTransitVehicles: {
    value: 40000,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  transitVehicleNumModels: {
    value: 256,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  numVirtualRingTerminuses: {
    value: 1800,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  numVirtualGroundTerminuses: {
    value: 1800,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  ringTerminusNumModels: {
    value: 32,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  groundTerminusNumModels: {
    value: 32,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },

  // Engineering Parameters - Elevators
  numElevatorCables: {
    value: 900,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  numElevatorCableModels: {
    value: 32,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  numVirtualElevatorCars: {
    value: 1800,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  elevatorCarNumModels: {
    value: 32,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  additionalUpperElevatorCable: {
    value: 20,
    units: "m",
    autoMap: true,
    min: 0,
    max: 50,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  elevatorCableOutwardOffset: {
    value: -24,
    units: "m",
    autoMap: true,
    min: -30,
    max: -10,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  elevatorCableForwardOffset: {
    value: -11,
    units: "m",
    autoMap: true,
    min: -100,
    max: 0,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  elevatorCarUpwardOffset: {
    value: 0.32,
    units: "m",
    autoMap: true,
    min: -10,
    max: 10,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  elevatorCarMaxSpeed: {
    value: 200,
    units: "m/s",
    autoMap: true,
    min: 0,
    max: 2000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  elevatorCarMaxAcceleration: {
    value: 2,
    units: "m/s2",
    autoMap: true,
    min: 0,
    max: 50,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },

  // Habitats
  numVirtualHabitats: {
    value: 17100,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  habitatNumModels: {
    value: 256,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  habitatUpwardOffset: {
    value: 3.66,
    units: "m",
    autoMap: true,
    min: -10,
    max: 10,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  habitatOutwardOffset: {
    value: 14.32,
    units: "m",
    autoMap: true,
    min: 0,
    max: 20,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  habitatForwardOffset: {
    value: 4.16,
    units: "m",
    autoMap: true,
    min: 0,
    max: 10,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  //habitatBubbleMaterialTensileStress: {value: 7000000, units: 'Pa', autoMap: true, min: 0, max: 100000000, updateFunction: updateTransitsystem, folder: folderEngineering},
  //habitatBubbleMaterialDensity: {value: 2500, units: 'kg/m3', autoMap: true, min: 0, max: 4000, updateFunction: updateTransitsystem, folder: folderEngineering},
  // Carbon Fiber
  // habitatBubbleMaterialTensileStress: {value: 7000000000, units: 'Pa', autoMap: true, min: 0, max: 100000000, updateFunction: updateTransitsystem, folder: folderEngineering},
  // habitatBubbleMaterialDensity: {value: 1790, units: 'kg/m3', autoMap: true, min: 0, max: 4000, updateFunction: updateTransitsystem, folder: folderEngineering},
  // Alon (Aluminium oxynitride)  Warner, Charles & Hartnett, Thomas & Fisher, Donald & Sunne, Wayne. (2005). Characterization of ALON (TM) optical ceramic. Proceedings of SPIE - The International Society for Optical Engineering. 5786. 10.1117/12.607596.
  habitatBubbleMaterialTensileStrength: {
    value: 700,
    units: "MPa",
    autoMap: true,
    min: 0,
    max: 100000000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  habitatBubbleMaterialDensity: {
    value: 3700,
    units: "kg/m3",
    autoMap: true,
    min: 0,
    max: 4000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  habitatBubbleMaterialEngineeringFactor: {
    value: 2,
    units: "",
    autoMap: true,
    min: 0,
    max: 10,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  habitatBubbleMaterialCost: {
    value: 35,
    units: "USD/kg",
    autoMap: true,
    min: 0,
    max: 10,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  }, // This is a swag - 5X the glass values from here https://exportv.ru/price-index/laminated-glass
  habitatAirPressure: {
    value: 100000,
    units: "Pa",
    autoMap: true,
    min: 0,
    max: 110000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  idealGasConstant: {
    value: 8.3145,
    units: "Joules/mole/K",
    autoMap: true,
    min: 0,
    max: 10000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },

  // Engineering Parameters - Launch System
  launchTubeTubeRadius: {
    value: 6,
    units: "m",
    autoMap: true,
    min: 1,
    max: 20,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchTubeUpwardOffset: {
    value: -250,
    units: "m",
    autoMap: true,
    min: -200,
    max: 0,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchTubeOutwardOffset: {
    value: 5,
    units: "m",
    autoMap: true,
    min: -11,
    max: -9,
    step: 0.001,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchTubeAcceleration: {
    value: 30,
    units: "m",
    autoMap: true,
    min: 1,
    max: 1000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchTubeExitVelocity: {
    value: 8000,
    units: "m*s-1",
    autoMap: true,
    min: 100,
    max: 50000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchTubeNumModels: {
    value: 256,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },

  launchVehicleCoefficientOfDrag: {
    value: 1,
    units: "",
    autoMap: true,
    min: 0.1,
    max: 2,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  launchVehicleRadius: {
    value: 5,
    units: "m",
    autoMap: true,
    min: 0.1,
    max: 20,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchVehicleBodyLength: {
    value: 50,
    units: "m",
    autoMap: true,
    min: 0.1,
    max: 200,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchVehicleNoseConeLength: {
    value: 80,
    units: "m",
    autoMap: true,
    min: 0.1,
    max: 20,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchVehicleCruisingSpeed: {
    value: 8000,
    units: "m/s",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  numVirtualLaunchVehicles: {
    value: 4000,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },
  launchVehicleNumModels: {
    value: 64,
    units: "",
    autoMap: true,
    min: 0,
    max: 3600,
    step: 1,
    updateFunction: updateTransitsystem,
    folder: folderEngineering,
  },

  // Engineering Parameters - Power
  powerRequirement: {
    value: 1000,
    units: "W/m",
    autoMap: true,
    min: 1,
    max: 10000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  }, // This is the power that is consumed by the rings maglev systems and all equipment supported by the ring, per meter length of the ring.
  powerConductorDensity: {
    value: 2710,
    units: "kg*m-3",
    autoMap: true,
    min: 10,
    max: 10000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  }, // Value for aluminum
  powerConductorConductivity: {
    value: 36900000,
    units: "Siemens*m-1",
    autoMap: true,
    min: 10000000,
    max: 100000000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  }, // Value for Aliminum. One siemen is kg−1⋅m−2⋅s3⋅A2
  powerVoltageAcrossLoad: {
    value: 100000,
    units: "Volts",
    autoMap: true,
    min: 1,
    max: 10000000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  powerLostInConductorFactor: {
    value: 0.01,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },

  movingRingLinearMotorEfficiency: {
    value: 0.9,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelReferenceTemperature: {
    value: 25,
    units: "C",
    autoMap: true,
    min: -100,
    max: 100,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelAverageTemperature: {
    value: -40,
    units: "C",
    autoMap: true,
    min: -100,
    max: 100,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelTemperatureEfficiencyFactor: {
    value: 0.0045,
    units: "C-1",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelTemperatureCoefficient: {
    value: -0.47,
    units: "%/C",
    autoMap: true,
    min: -1,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelEfficiencyAtReferenceTemperature: {
    value: 0.2,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelMassPerMeterSquared: {
    value: 0.28,
    units: "kg/m2",
    autoMap: true,
    min: 0,
    max: 100,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelMountMassPerMeterSquared: {
    value: 0.1,
    units: "kg/m2",
    autoMap: true,
    min: 0,
    max: 100,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelCostPerWatt: {
    value: 2.5,
    units: "USD/W",
    autoMap: true,
    min: 0,
    max: 10,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelPeakSolarPowerPerMeterSquared: {
    value: 1361,
    units: "W/m2",
    autoMap: true,
    min: 0,
    max: 10000,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPowerAvailibilityFactor: {
    value: 0.5,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },
  solarPanelWidth: {
    value: 10,
    units: "m",
    autoMap: true,
    min: 0,
    max: 10,
    updateFunction: adjustRingDesign,
    folder: folderEngineering,
  },

  // Material Parameters - Tethers
  tetherMaterialDensityCarbonFiber: {
    value: 1790,
    units: "kg*m-3",
    autoMap: false,
    min: 10,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  }, // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherMaterialTensileStrengthCarbonFiber: {
    value: 7000,
    units: "MPa",
    autoMap: false,
    min: 10,
    max: 100000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  }, // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherMaterialCostCarbonFiber: {
    value: 22,
    units: "USD/kg",
    autoMap: false,
    min: 0.01,
    max: 1000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  }, // Note: Probably not accurate for Toray1100GC
  tetherMaterialDensityGraphene: {
    value: 2090,
    units: "kg*m-3",
    autoMap: false,
    min: 10,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  }, //
  tetherMaterialTensileStrengthGraphene: {
    value: 130500,
    units: "MPa",
    autoMap: false,
    min: 10,
    max: 100000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  }, //
  tetherMaterialCostGraphene: {
    value: 220,
    units: "USD/kg",
    autoMap: false,
    min: 0.01,
    max: 1000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  }, //
  tetherMaterialDensityCustom: {
    value: 1790,
    units: "kg*m-3",
    autoMap: false,
    min: 10,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  tetherMaterialTensileStrengthCustom: {
    value: 7000,
    units: "MPa",
    autoMap: false,
    min: 10,
    max: 100000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  tetherMaterialCostCustom: {
    value: 22,
    units: "USD/kg",
    autoMap: false,
    min: 0.01,
    max: 1000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialResistivityCopper: {
    value: 1.68e-8,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialResistivityAluminum: {
    value: 2.65e-8,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialResistivityCustom: {
    value: 2.65e-8,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialDensityCopper: {
    value: 8960,
    units: "kg/m3",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialDensityAluminum: {
    value: 2700,
    units: "kg/m3",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialDensityCustom: {
    value: 2700,
    units: "kg/m3",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialCostCopper: {
    value: 9.7289,
    units: "USD/kg",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialCostAluminum: {
    value: 3.3,
    units: "USD/kg",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coilConductorMaterialCostCustom: {
    value: 3.3,
    units: "USD/kg",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coreMaterialDensityIron: {
    value: 7874,
    units: "kg/m3",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  coreMaterialCostIron: {
    value: 0.09,
    units: "USD/kg",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },
  bulkMaterialCost: {
    value: 0.09,
    units: "USD/kg",
    autoMap: true,
    min: 0,
    max: 20000,
    updateFunction: adjustRingDesign,
    folder: folderMaterials,
  },

  // Economics Parameters
  wholesaleCostOfEnergy: {
    value: 0.02 / 3.6e6,
    units: "USD/J",
    autoMap: true,
    min: 0,
    max: 0.1,
    updateFunction: adjustRingDesign,
    folder: folderEconomics,
  },

  // Rendering Parameters
  parameterPresetNumber: {
    value: 0,
    units: "",
    autoMap: true,
    updateFunction: adjustRingDesign,
    folder: folderRendering,
  },
  showEarthsSurface: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: adjustEarthSurfaceVisibility,
    folder: folderRendering,
  },
  showEarthsAtmosphere: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: adjustEarthAtmosphereVisibility,
    folder: folderRendering,
  },
  earthTextureOpacity: {
    value: 1,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustEarthOpacity,
    folder: folderRendering,
  },
  showStars: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: adjustStarsVisibility,
    folder: folderRendering,
  },
  showEarthAxis: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: earthAxisObjectUpdate,
    folder: folderRendering,
  },
  showBackgroundPatch: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: updateBackgroundPatch,
    folder: folderRendering,
  },
  showEarthEquator: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: earthEquatorObjectUpdate,
    folder: folderRendering,
  },
  showMainRingCurve: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: mainRingCurveObjectUpdate,
    folder: folderRendering,
  },
  showGravityForceArrows: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: gravityForceArrowsUpdate,
    folder: folderRendering,
  },
  showGyroscopicForceArrows: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: gyroscopicForceArrowsUpdate,
    folder: folderRendering,
  },
  forceArrowSize: {
    value: 50000,
    units: "",
    autoMap: true,
    min: 0,
    max: 1000000,
    tweenable: true,
    updateFunction: gravityForceArrowsUpdate,
    folder: folderRendering,
  },
  numForceArrows: {
    value: 32,
    units: "",
    autoMap: true,
    min: 0,
    max: 1024,
    updateFunction: gravityForceArrowsUpdate,
    folder: folderRendering,
  },
  showMainRings: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: adjustRingDesign,
    folder: folderRendering,
  },
  showTethers: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: adjustRingDesign,
    folder: folderRendering,
  },
  showTransitSystem: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: adjustRingDesign,
    folder: folderRendering,
  },
  showStationaryRing: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showMovingRing: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  // Note: The following parameter is not the actual speed of the movng rings, but a lower speed selected to make the moving rings motion more visible
  movingRingsSpeedForRendering: {
    value: 100,
    units: "",
    autoMap: true,
    min: 0,
    max: 100000,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showTransitTube: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showTransitVehicles: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showRingTerminuses: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showGroundTerminuses: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showElevatorCables: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: adjustRingDesign,
    folder: folderRendering,
  },
  showElevatorCars: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showHabitats: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showLaunchOrbit: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: adjustRingDesign,
    folder: folderRendering,
  },
  showLaunchTrajectory: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: adjustRingDesign,
    folder: folderRendering,
  },
  showLaunchTube: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showLaunchVehicles: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  showLaunchVehiclePointLight: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  animateMovingRings: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  animateElevatorCars: {
    value: true,
    units: "",
    autoMap: true,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  animateTransitVehicles: {
    value: true,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  animateLaunchVehicles: {
    value: true,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: updateTransitsystem,
    folder: folderRendering,
  },
  cableVisibility: {
    value: 0.1,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    tweenable: true,
    updateFunction: adjustCableOpacity,
    folder: folderRendering,
  },
  tetherVisibility: {
    value: 0.13,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    tweenable: true,
    updateFunction: adjustTetherOpacity,
    folder: folderRendering,
  },
  tetherColor: {
    value: 0x000000,
    units: "",
    autoMap: true,
    min: 0,
    max: 0xffffff,
    tweenable: false,
    updateFunction: adjustTetherColor,
    folder: folderRendering,
  },
  launchTrajectoryVisibility: {
    value: 1,
    units: "",
    autoMap: true,
    min: 0,
    max: 1,
    updateFunction: adjustLaunchTrajectoryOpacity,
    folder: folderRendering,
  },
  cameraFieldOfView: {
    value: 45,
    units: "",
    autoMap: true,
    min: 5,
    max: 90,
    tweenable: true,
    updateFunction: updateCamerFieldOfView,
    folder: folderRendering,
  },
  orbitControlsAutoRotate: {
    value: false,
    units: "",
    autoMap: true,
    updateFunction: updateOrbitControlsRotateSpeed,
    folder: folderRendering,
  },
  orbitControlsRotateSpeed: {
    value: 1,
    units: "",
    autoMap: true,
    min: -10,
    max: 10,
    updateFunction: updateOrbitControlsRotateSpeed,
    folder: folderRendering,
  },
  logZoomRate: {
    value: -2,
    units: "",
    autoMap: true,
    min: -5,
    max: -1,
    updateFunction: updateOrbitControlsRotateSpeed,
    folder: folderRendering,
  },
  perfOptimizedThreeJS: {
    value: false,
    units: "",
    autoMap: true,
    min: 5,
    max: 90,
    updateFunction: updatePerfOptimzation,
    folder: folderRendering,
  },
  tweeningDuration: {
    value: 6000,
    units: "",
    autoMap: true,
    min: 0,
    max: 1000000,
    updateFunction: updatedParam,
    folder: folderRendering,
  },
  pKeyAltitudeFactor: {
    value: 1,
    units: "",
    autoMap: true,
    min: 0,
    max: 2,
    updateFunction: updatedParam,
    folder: folderRendering,
  },
  //showStats: {value: false, units: '', autoMap: true, updateFunction: updateStats, folder: folderRendering},
  // showEarthClouds: {value: true, units: '', autoMap: true, updateFunction: adjustEarthCloudsVisibility, folder: folderRendering},
  // earthCloudsOpacity: {value: 1, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustEarthCloudsOpacity, folder: folderRendering},
};

function updatePerfOptimzation() {
  if (guidParam["perfOptimizedThreeJS"]) {
    scene.autoUpdate = false;
  } else {
    scene.autoUpdate = true;
  }
}

const current =
  guidParamWithUnits["powerRequirement"].value /
  guidParamWithUnits["powerVoltageAcrossLoad"].value;
const powerLostInConductor =
  guidParamWithUnits["powerRequirement"].value *
  guidParamWithUnits["powerLostInConductorFactor"].value;
const voltageDropOverWires = powerLostInConductor / current;
const wireResistance = voltageDropOverWires / current;
const wireLength = 2 * 84354.4319347572; // This needs to be computed in the tether math section
const wireCrossSectionalArea =
  wireLength /
  guidParamWithUnits["powerConductorConductivity"].value /
  wireResistance;
const wireCrossSectionalArea_mm2perkm = wireCrossSectionalArea * 1000 * 1000000;
const wireDiameter = 2 * Math.sqrt(wireCrossSectionalArea_mm2perkm / Math.PI);

// A = S*V = kg−1⋅m−2⋅s3⋅A2*m-1 * kg·m2·s−3·A−1
// WireResistance = Voltage^2 / Power
// CrossSectionalArea = Length / Conductivity / WireResistance

// Override one of the initial values with a calcuated value...

// The GUI() object doesn't accept out key value pairs, so we need to create a simplified structure in order for GUI to work
const guidParam = {};
Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  guidParam[k] = v.value;
});

// Add sliders for each entry in guidParamWithUnits to the gui...

// Constants controlled by pull-pown lists
const tetherMaterials = {
  Custom: "CUSTOM",
  CarbonFiber: "CARBON_FIBER",
  Graphene: "GRAPHENE",
};
const coilConductorMaterials = {
  Aluminum: "ALUMINUM",
  Copper: "COPPER",
  Custom: "CUSTOM",
};

guidParam["TetherMaterial"] = tetherMaterials.CarbonFiber;
guidParam["CoilConductorMaterial"] = coilConductorMaterials.Aluminum;
folderMaterials
  .add(guidParam, "TetherMaterial", tetherMaterials)
  .onChange(updateTetherMaterial);
folderMaterials
  .add(guidParam, "CoilConductorMaterial", coilConductorMaterials)
  .onChange(updateCoilConductorMaterial);

// Add automapped sliders
Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  if (v.step) {
    guidParamWithUnits[k].folder
      .add(guidParam, k, v.min, v.max)
      .onChange(v.updateFunction)
      .step(v.step);
  } else {
    guidParamWithUnits[k].folder
      .add(guidParam, k, v.min, v.max)
      .onChange(v.updateFunction);
  }
});

function updateTetherMaterial() {
  switch (guidParam["TetherMaterial"]) {
    case tetherMaterials.CarbonFiber:
      dParamWithUnits["tetherMaterialDensity"] = {
        value: guidParamWithUnits["tetherMaterialDensityCarbonFiber"].value,
        units: guidParamWithUnits["tetherMaterialDensityCarbonFiber"].units,
      };
      dParamWithUnits["tetherMaterialTensileStrength"] = {
        value:
          guidParamWithUnits["tetherMaterialTensileStrengthCarbonFiber"].value,
        units:
          guidParamWithUnits["tetherMaterialTensileStrengthCarbonFiber"].units,
      };
      dParamWithUnits["tetherMaterialCost"] = {
        value: guidParamWithUnits["tetherMaterialCostCarbonFiber"].value,
        units: guidParamWithUnits["tetherMaterialCostCarbonFiber"].units,
      };
      break;
    case tetherMaterials.Graphene:
      dParamWithUnits["tetherMaterialDensity"] = {
        value: guidParamWithUnits["tetherMaterialDensityGraphene"].value,
        units: guidParamWithUnits["tetherMaterialDensityGraphene"].units,
      };
      dParamWithUnits["tetherMaterialTensileStrength"] = {
        value:
          guidParamWithUnits["tetherMaterialTensileStrengthGraphene"].value,
        units:
          guidParamWithUnits["tetherMaterialTensileStrengthGraphene"].units,
      };
      dParamWithUnits["tetherMaterialCost"] = {
        value: guidParamWithUnits["tetherMaterialCostGraphene"].value,
        units: guidParamWithUnits["tetherMaterialCostGraphene"].units,
      };
      break;
    case tetherMaterials.Custom:
      dParamWithUnits["tetherMaterialDensity"] = {
        value: guidParamWithUnits["tetherMaterialDensityCustom"].value,
        units: guidParamWithUnits["tetherMaterialDensityCustom"].units,
      };
      dParamWithUnits["tetherMaterialTensileStrength"] = {
        value: guidParamWithUnits["tetherMaterialTensileStrengthCustom"].value,
        units: guidParamWithUnits["tetherMaterialTensileStrengthCustom"].units,
      };
      dParamWithUnits["tetherMaterialCost"] = {
        value: guidParamWithUnits["tetherMaterialCostCustom"].value,
        units: guidParamWithUnits["tetherMaterialCostCustom"].units,
      };
      break;
  }
}

function updateCoilConductorMaterial() {
  switch (guidParam["CoilConductorMaterial"]) {
    case coilConductorMaterials.Copper:
      dParamWithUnits["coilConductorMaterialResistivity"] = {
        value:
          guidParamWithUnits["coilConductorMaterialResistivityCopper"].value,
        units:
          guidParamWithUnits["coilConductorMaterialResistivityCopper"].units,
      };
      dParamWithUnits["coilConductorMaterialDensity"] = {
        value: guidParamWithUnits["coilConductorMaterialDensityCopper"].value,
        units: guidParamWithUnits["coilConductorMaterialDensityCopper"].units,
      };
      dParamWithUnits["coilConductorMaterialCost"] = {
        value: guidParamWithUnits["coilConductorMaterialCostCopper"].value,
        units: guidParamWithUnits["coilConductorMaterialCostCopper"].units,
      };
      break;
    case coilConductorMaterials.Aluminum:
      dParamWithUnits["coilConductorMaterialResistivity"] = {
        value:
          guidParamWithUnits["coilConductorMaterialResistivityAluminum"].value,
        units:
          guidParamWithUnits["coilConductorMaterialResistivityAluminum"].units,
      };
      dParamWithUnits["coilConductorMaterialDensity"] = {
        value: guidParamWithUnits["coilConductorMaterialDensityAluminum"].value,
        units: guidParamWithUnits["coilConductorMaterialDensityAluminum"].units,
      };
      dParamWithUnits["coilConductorMaterialCost"] = {
        value: guidParamWithUnits["coilConductorMaterialCostAluminum"].value,
        units: guidParamWithUnits["coilConductorMaterialCostAluminum"].units,
      };
      break;
    case coilConductorMaterials.Custom:
      dParamWithUnits["coilConductorMaterialResistivity"] = {
        value:
          guidParamWithUnits["coilConductorMaterialResistivityCustom"].value,
        units:
          guidParamWithUnits["coilConductorMaterialResistivityCustom"].units,
      };
      dParamWithUnits["coilConductorMaterialDensity"] = {
        value: guidParamWithUnits["coilConductorMaterialDensityCustom"].value,
        units: guidParamWithUnits["coilConductorMaterialDensityCustom"].units,
      };
      dParamWithUnits["coilConductorMaterialCost"] = {
        value: guidParamWithUnits["coilConductorMaterialCostCustom"].value,
        units: guidParamWithUnits["coilConductorMaterialCostCustom"].units,
      };
      break;
  }
}

// Add an additional button to the gui to display instructions for the new user
function displayHelp() {
  alert(
    '"Z" and "X" keys zoom in and out.\n"P" key moves the point that the simulation orbits around to a position just above the planet\'s surface near to where the sprite is pointing.\n'
  );
}
guidParam["Help"] = displayHelp;
gui.add(guidParam, "Help");

// Actual Design Parameters derived from slider values
let dParamWithUnits = {};
const specs = {};
let kmlFile = "";
let specsFile = "";

function updatedParam() {
  // Read as "update_dParam"
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    v.value = guidParam[k];
  });
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    if (v.autoMap) {
      dParamWithUnits[k] = { value: v.value, units: v.units };
    }
  });
  // The following parameters are mapped "manually" from the gui to the model
  dParamWithUnits["equivalentLatitude"] = {
    value: (guidParamWithUnits["equivalentLatitude"].value / 180) * Math.PI,
    units: "radians",
  };
  console.log((dParamWithUnits["equivalentLatitude"].value * 180) / Math.PI);
  const alpha = guidParamWithUnits["moveRing"].value;
  dParamWithUnits["ringCenterLongitude"] = {
    value:
      (tram.lerp(
        guidParamWithUnits["buildLocationRingCenterLongitude"].value,
        guidParamWithUnits["finalLocationRingCenterLongitude"].value,
        alpha
      ) /
        180) *
      Math.PI,
    units: "radians",
  };
  dParamWithUnits["ringCenterLatitude"] = {
    value:
      (tram.lerp(
        guidParamWithUnits["buildLocationRingCenterLatitude"].value,
        guidParamWithUnits["finalLocationRingCenterLatitude"].value,
        alpha
      ) /
        180) *
      Math.PI,
    units: "radians",
  };
  dParamWithUnits["ringEccentricity"] = {
    value: tram.lerp(
      guidParamWithUnits["buildLocationRingEccentricity"].value,
      guidParamWithUnits["finalLocationRingEccentricity"].value,
      alpha
    ),
    units: "",
  };
  dParamWithUnits["launchTubeLength"] = {
    value:
      dParamWithUnits["launchTubeExitVelocity"].value ** 2 /
      2 /
      dParamWithUnits["launchTubeAcceleration"].value,
    units: "m",
  };
  dParamWithUnits["launchTubeAccelerationTime"] = {
    value:
      dParamWithUnits["launchTubeExitVelocity"].value /
      dParamWithUnits["launchTubeAcceleration"].value,
    units: "s",
  };
  updateTetherMaterial();
  updateCoilConductorMaterial();

  if (genSpecsFile) {
    specsFile = specsFile.concat("// GUI Parameters\n");
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + "," + v.value + "," + v.units + "\n");
    });

    specsFile = specsFile.concat("// Design Parameters\n");
    Object.entries(dParamWithUnits).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + "," + v.value + "," + v.units + "\n");
    });
  }
}

updatedParam();

function updateTransitsystem() {
  updatedParam();
  crv = new tram.commonRingVariables(
    radiusOfPlanet,
    dParamWithUnits["ringFinalAltitude"].value,
    dParamWithUnits["equivalentLatitude"].value,
    dParamWithUnits["ringAmountRaisedFactor"].value
  );
  ecv = new tram.elevatorCarVariables(
    gravitationalConstant,
    massOfPlanet,
    radiusOfPlanet,
    dParamWithUnits,
    crv
  );
  constructMainRingCurve();

  const dx = dParamWithUnits["transitTrackOuterOffset"].value;
  const dy1 = dParamWithUnits["transitTrackUpperOffset1"].value;
  const dy2 = dParamWithUnits["transitTrackUpperOffset2"].value;
  trackOffsetsList = [
    [-dx, dy1],
    [dx, dy1],
    [-dx, dy2],
    [dx, dy2],
  ];
  transitSystemObject.update(
    dParamWithUnits,
    specs,
    genSpecs,
    trackOffsetsList,
    crv,
    radiusOfPlanet,
    mainRingCurve,
    timeSinceStart
  );
}

function adjustRingDesign() {
  updateRing();
}

function adjustEarthSurfaceVisibility() {
  updatedParam();
  planetMeshes.forEach((mesh) => {
    mesh.visible = guidParamWithUnits["showEarthsSurface"].value;
  });
}

function adjustEarthAtmosphereVisibility() {
  updatedParam();
  atmosphereMesh.visible = guidParamWithUnits["showEarthsAtmosphere"].value;
}

function adjustEarthOpacity() {
  updatedParam();
  planetMeshes.forEach((mesh) => {
    mesh.material.opacity = guidParamWithUnits["earthTextureOpacity"].value;
  });
}

function adjustStarsVisibility() {
  updatedParam();
  starsMesh.visible = guidParamWithUnits["showStars"].value;
}

function adjustCableOpacity() {
  updatedParam();
  cableMaterial.opacity = dParamWithUnits["cableVisibility"].value;
}

function adjustTetherOpacity() {
  updatedParam();
  tetherMaterial.opacity = dParamWithUnits["tetherVisibility"].value;
  console.log("Updating" + dParamWithUnits["tetherVisibility"].value);
}

function adjustTetherColor() {
  updatedParam();
  tetherMaterial.color = dParamWithUnits["tetherColor"].value;
  console.log("Updating Color " + dParamWithUnits["tetherColor"].value);
}

function adjustLaunchTrajectoryOpacity() {
  updatedParam();
  launchTrajectoryMaterial.opacity =
    dParamWithUnits["launchTrajectoryVisibility"].value;
}

let ringToPlanetRotation = new THREE.Quaternion();

function gimbalMath() {
  // "Gimbal" code for the tetheredRingRefCoordSys
  const v1 = new THREE.Vector3(0, 1, 0);
  const v2 = new THREE.Vector3().setFromSphericalCoords(
    1,
    Math.PI / 2 - dParamWithUnits["ringCenterLatitude"].value,
    dParamWithUnits["ringCenterLongitude"].value
  );
  ringToPlanetRotation.setFromUnitVectors(v1, v2);
  tetheredRingRefCoordSys.setRotationFromQuaternion(ringToPlanetRotation);
  tetheredRingRefCoordSys.updateMatrixWorld(true);
}

function adjustRingLatLon() {
  updatedParam();
  gimbalMath();
  //updateRing()
}

function setRingLatLonWithPreset() {
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    v.value = guidParam[k];
  });
  switch (guidParam["locationPresetIndex"]) {
    case 0:
      // The most commonly depicted pacific ocean location. Crosses one small island in the pacific though.
      guidParamWithUnits["equivalentLatitude"].value = equivalentLatitudePreset;
      guidParamWithUnits["buildLocationRingCenterLongitude"].value = 213.7;
      guidParamWithUnits["finalLocationRingCenterLongitude"].value = 186.3;
      guidParamWithUnits["buildLocationRingCenterLatitude"].value = -19.2;
      guidParamWithUnits["finalLocationRingCenterLatitude"].value = 14.2;
      break;
    case 1:
      // Alternate final location with the increased diameter needed to reach both US and China's coastlines (note: too large to construct in the Pacific Ocean)
      guidParamWithUnits["equivalentLatitude"].value = 30.8;
      guidParamWithUnits["buildLocationRingCenterLongitude"].value = 213.7;
      guidParamWithUnits["finalLocationRingCenterLongitude"].value = 182;
      guidParamWithUnits["buildLocationRingCenterLatitude"].value = -19.2;
      guidParamWithUnits["finalLocationRingCenterLatitude"].value = 11;
      break;
    case 2:
      // Alastair proposed a new ring construction location which is slightly bigger but does not cross any islands.
      guidParamWithUnits["equivalentLatitude"].value = 34;
      guidParamWithUnits["buildLocationRingCenterLongitude"].value = 137;
      guidParamWithUnits["finalLocationRingCenterLongitude"].value = 137;
      guidParamWithUnits["buildLocationRingCenterLatitude"].value = -66.5;
      guidParamWithUnits["finalLocationRingCenterLatitude"].value = -66.5;
      break;
    case 3:
      // This is a build location that only crosses northern Russia and Iceland. It really maximizes the diameter of the tethered ring and thus minimizes the costs.
      // Certainly, it could be an interesting option for Russia if they can negotiate the use of Antarctica for this would be willing to level some land in Siberia.
      guidParamWithUnits["equivalentLatitude"].value = 8.1;
      guidParamWithUnits["buildLocationRingCenterLongitude"].value = 249.2;
      guidParamWithUnits["finalLocationRingCenterLongitude"].value = 249.2;
      guidParamWithUnits["buildLocationRingCenterLatitude"].value = 14.6;
      guidParamWithUnits["finalLocationRingCenterLatitude"].value = 14.6;
      break;
    case 4:
      // This is a build location that only crosses the United States. Tricky to construct here because the Rocky Mountains would get in the way of the mass stream;
      // however, probably easier to solve this problem than to create the concentrated turn-a-round needed for a partial orbital ring or a lofstrom loop.
      guidParamWithUnits["equivalentLatitude"].value = 10;
      guidParamWithUnits["buildLocationRingCenterLongitude"].value = 269.64;
      guidParamWithUnits["finalLocationRingCenterLongitude"].value = 269.64;
      guidParamWithUnits["buildLocationRingCenterLatitude"].value = -36.9;
      guidParamWithUnits["finalLocationRingCenterLatitude"].value = -36.9;
      break;
    case 5:
      // This is a build location that only crosses Mexico. Tricky to construct here because mountains would get in the way of the mass-stream;
      // however, probably easier to solve this problem than to create the concentrated turn-a-round needed for a partial orbital ring or a Lofstrom Loop.
      guidParamWithUnits["equivalentLatitude"].value = 16;
      guidParamWithUnits["buildLocationRingCenterLongitude"].value = 268;
      guidParamWithUnits["finalLocationRingCenterLongitude"].value = 268;
      guidParamWithUnits["buildLocationRingCenterLatitude"].value = -49;
      guidParamWithUnits["finalLocationRingCenterLatitude"].value = -49;
      break;
    case 6:
      // This is a build location that only crosses Indonesia and Malaysia. Tricky to construct here because mountains would get in the way of the mass-stream;
      // however, probably easier to solve this problem than to create the concentrated turn-a-round needed for a partial orbital ring or a Lofstrom Loop.
      guidParamWithUnits["equivalentLatitude"].value = 16;
      guidParamWithUnits["buildLocationRingCenterLongitude"].value = 170;
      guidParamWithUnits["finalLocationRingCenterLongitude"].value = 170;
      guidParamWithUnits["buildLocationRingCenterLatitude"].value = -36.6;
      guidParamWithUnits["finalLocationRingCenterLatitude"].value = -36.6;
      break;
  }
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    guidParam[k] = v.value;
  });
  updatedParam();
  gimbalMath();
  adjustRingDesign();
}

// Three.js Rendering Setup
let simContainer = document.querySelector("#simContainer");

const raycaster = new THREE.Raycaster();
const scene = new THREE.Scene();
const renderToBuffer = false; // Hack - needs a GUI control still

// Used for saving the rendered images to series of numbered files
let bufferTexture;
if (renderToBuffer) {
  const imageDumpWidth = 128;
  const imageDumpHeight = 72;
  bufferTexture = new THREE.WebGLRenderTarget(imageDumpWidth, imageDumpHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.NearestFilter,
  });
}

//scene.matrixAutoUpdate = false
scene.autoUpdate = true;

//scene.fog = new THREE.FogExp2(0x202040, 0.000005)

//scene.background = new THREE.Color( 0xffffff )
//scene.background = null
const fov = dParamWithUnits["cameraFieldOfView"].value;
const aspectRatio = simContainer.offsetWidth / simContainer.offsetHeight;
//console.log("W,H ", simContainer.offsetWidth, simContainer.offsetHeight)
let nearClippingPlane = 0.1 * radiusOfPlanet;
let farClippingPlane = 100 * radiusOfPlanet;
let extraDistanceForCamera = 10000;

const camera = new THREE.PerspectiveCamera(
  fov,
  aspectRatio,
  nearClippingPlane,
  farClippingPlane
);
const cameraGroup = new THREE.Group();
cameraGroup.add(camera);
camera.position.z = (-30 * radiusOfPlanet) / 8;
camera.matrixValid = false;

function updateCamerFieldOfView() {
  updatedParam();
  camera.fov = dParamWithUnits["cameraFieldOfView"].value;
}

function updateOrbitControlsRotateSpeed() {
  updatedParam();
  orbitControls.autoRotate = dParamWithUnits["orbitControlsAutoRotate"].value;
  orbitControls.autoRotateSpeed =
    dParamWithUnits["orbitControlsRotateSpeed"].value;
}

// Need to add these two lines to have the planet apper in VR
if (enableVR) {
  cameraGroup.position.z = -1.005 * radiusOfPlanet;
  cameraGroup.rotation.z = Math.PI / 2;
  cameraGroup.rotation.y = -Math.PI / 2;
  cameraGroup.matrixValid = false;
}
scene.add(cameraGroup);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  //alpha: true,  // Make the background transparent
  //logarithmicDepthBuffer: true,
  canvas: document.querySelector("canvas"),
});
//renderer.setSize(innerWidth, innerHeight)
renderer.setSize(simContainer.offsetWidth, simContainer.offsetHeight);
//renderer.setClearColor( 0x000000, 0 );
//console.log("W,H ", simContainer.offsetWidth, simContainer.offsetHeight)
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");
//document.body.appendChild(renderer.domElement)
//const stats = new Stats()
//simContainer.appendChild( stats.dom )

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.addEventListener("change", orbitControlsEventHandler);

//orbitControls.autoRotate = true
orbitControls.autoRotateSpeed =
  dParamWithUnits["orbitControlsRotateSpeed"].value;
orbitControls.enableDamping = true;
//orbitControls.dampingFactor *= 0.1
//orbitControls.enablePan = true

const planetWidthSegments = 768;
const planetHeightSegments = 192;

const sunLight = new THREE.DirectionalLight(0x0f0f0f0, 1);
sunLight.name = "sunlight";
sunLight.position.set(0, (-6 * radiusOfPlanet) / 8, (-20 * radiusOfPlanet) / 8);
sunLight.matrixValid = false;
if (guidParam["perfOptimizedThreeJS"]) sunLight.freeze();
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x4f4f4f, 1);
ambientLight.name = "ambientLight";
scene.add(ambientLight);

const planetCoordSys = new THREE.Group();

//planetCoordSys.scale.y = 1.0 - 1.0/WGS84FlattenningFactor // Squishes the earth (and everything else) by the correct flattening factor

let eightTextureMode = false;
let TextureMode24x12 = true;
let TextureModeOpenLayers = false;
if (enableVR) {
  planetCoordSys.rotation.y = (Math.PI * -5.253) / 16;
  planetCoordSys.rotation.x = (Math.PI * -4) / 16;
  planetCoordSys.matrixValid = false;
  eightTextureMode = false;
} else {
  eightTextureMode = false;
  TextureMode24x12 = true;
}
const useShaders = true;

scene.add(planetCoordSys);

const tetheredRingRefCoordSys = new THREE.Group();
tetheredRingRefCoordSys.name = "tetheredRingRefCoordSys";
planetCoordSys.add(tetheredRingRefCoordSys);
gimbalMath();

//tetheredRingRefCoordSys.rotation.y = Math.PI/4  // This is done so that the eccentricity adjustment is where we need it to be
// The above line puts the reference coordinate system's y-axis at lat/lon {0, 0} when RingCenterLat==0 and RingCenterLon==0
// This is needed because the ring will be centered around the coordinate system's y-axis
// We want the ring centered around the y-axis because .setFromSphericalCoords's polar angle is relative to the y-axis
planetCoordSys.updateWorldMatrix(true);
tetheredRingRefCoordSys.updateMatrixWorld(true);

const planetMeshes = [];
let filename;

if (TextureMode24x12) {
  // const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({color: 0x3f3f4f}))
  // let markerSize = 50000
  // marker.scale.set(markerSize, markerSize, markerSize)

  const w = 24;
  const h = 12;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const pointOnEarthsSurface = new THREE.Vector3().setFromSphericalCoords(
        radiusOfPlanet,
        (Math.PI * (1 + 2 * j)) / (2 * h),
        Math.PI * (1 + (1 + 2 * i) / w)
      );
      const localPoint = tetheredRingRefCoordSys.worldToLocal(
        pointOnEarthsSurface.clone()
      );
      // marker.position.copy(localPoint)
      // tetheredRingRefCoordSys.add(marker.clone())

      if (
        localPoint.y < 0.45 * radiusOfPlanet ||
        localPoint.y > 0.7 * radiusOfPlanet
      ) {
        //if ((j!=2) || (i!=3)) { // Just render seattle area in high-res
        filename = `./textures/24x12/LR/earth_LR_${w}x${h}_${i}x${j}.jpg`;
      } else {
        filename = `./textures/24x12/HR/earth_HR_${w}x${h}_${i}x${j}.jpg`;
      }
      //console.log(filename)
      const planetGeometry = new THREE.SphereGeometry(
        radiusOfPlanet,
        planetWidthSegments / w,
        planetHeightSegments / h,
        (i * Math.PI * 2) / w,
        (Math.PI * 2) / w,
        (j * Math.PI) / h,
        Math.PI / h
      );
      const planetMesh = new THREE.Mesh(
        planetGeometry,
        useShaders
          ? new THREE.ShaderMaterial({
              //vertexShader: vertexShader,
              //fragmentShader: fragmentShader,
              vertexShader: document.getElementById("vertexShader").textContent,
              fragmentShader:
                document.getElementById("fragmentShader").textContent,
              //fragmentShader: document.getElementById( 'fragmentShaderInv' ).textContent,
              uniforms: {
                planetTexture: {
                  //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
                  value: new THREE.TextureLoader().load(filename),
                },
              },
            })
          : new THREE.MeshPhongMaterial({
              map: new THREE.TextureLoader().load(filename),
              transparent: true,
              opacity: dParamWithUnits["earthTextureOpacity"].value,
            })
        //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
        //displacementScale: 500000,
      );
      planetMesh.name = "planet";
      planetMesh.rotation.y = -Math.PI / 2; // This is needed to have the planet's texture align with the planet's Longintitude system
      planetMesh.matrixValid = false;
      if (guidParam["perfOptimizedThreeJS"]) planetMesh.freeze();
      planetMeshes.push(planetMesh);
    }
  }
} else if (TextureModeOpenLayers) {
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      radiusOfPlanet,
      planetWidthSegments,
      planetHeightSegments
    ),
    new THREE.ShaderMaterial({
      vertexShader: document.getElementById("vertexShader").textContent,
      fragmentShader: document.getElementById("fragmentShader").textContent,
      uniforms: {
        planetTexture: {
          value: undefined,
        },
      },
    })
  );
  makePlanetTexture(
    planetMesh,
    orbitControls,
    camera,
    radiusOfPlanet,
    false,
    (planetTexture) => {
      planetMesh.material.uniforms.planetTexture.value = planetTexture;
      planetMesh.material.uniforms.planetTexture.needsUpdate = true;
    }
  );

  planetMesh.name = "planet";
  planetMesh.rotation.y = -Math.PI / 2; // This is needed to have the planet's texture align with the planet's Longintitude system
  planetMesh.matrixValid = false;
  if (guidParam["perfOptimizedThreeJS"]) planetMesh.freeze();
  planetMeshes.push(planetMesh);
} else if (eightTextureMode) {
  let letter;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 4; i++) {
      //if ((j==0) && ((i==0) || (i==3))) {
      if (j == 0 && i == 0) {
        letter = String.fromCharCode(65 + i);
        filename = `./textures/world.topo.200404.3x21600x21600.${letter}${
          j + 1
        }.jpg`;
        //filename = `./textures/world.topo.200404.3x16384x16384.${letter}${j+1}.jpg`
        if (verbose) console.log(letter, filename);
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(
            radiusOfPlanet,
            planetWidthSegments,
            planetHeightSegments,
            (i * Math.PI) / 2,
            Math.PI / 2,
            (j * Math.PI) / 2,
            Math.PI / 2
          ),
          new THREE.ShaderMaterial({
            //vertexShader: vertexShader,
            //fragmentShader: fragmentShader,
            vertexShader: document.getElementById("vertexShader").textContent,
            fragmentShader:
              document.getElementById("fragmentShader").textContent,
            uniforms: {
              planetTexture: {
                //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
                value: new THREE.TextureLoader().load(filename),
              },
            },
            //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
            //displacementScale: 500000,
          })
        );
        planetMesh.name = "planet";
        planetMesh.rotation.y = -Math.PI / 2; // This is needed to have the planet's texture align with the planet's Longintitude system
        planetMesh.matrixValid = false;
        if (guidParam["perfOptimizedThreeJS"]) planetMesh.freeze();
        planetMeshes.push(planetMesh);
      }
    }
  }
} else if (useShaders) {
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      radiusOfPlanet,
      planetWidthSegments,
      planetHeightSegments
    ),
    // new THREE.MeshPhongMaterial({
    //   //roughness: 1,
    //   //metalness: 0,
    //   map: new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg' ),
    //   //map: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' ),
    //   //map: new THREE.TextureLoader().load( './textures/earthmap1k.jpg' ),
    //   //bumpMap: new THREE.TextureLoader().load( './textures/earthbump.jpg' ),
    //   //bumpScale: 1000000,
    //   //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
    //   //displacementScale: 20000,
    // })
    // Hack
    new THREE.ShaderMaterial({
      //vertexShader: vertexShader,
      //fragmentShader: fragmentShader,
      vertexShader: document.getElementById("vertexShader").textContent,
      fragmentShader: document.getElementById("fragmentShader").textContent,
      blending: THREE.CustomBlending,
      blendSrcAlpha: 0.5,
      uniforms: {
        planetTexture: {
          //value: new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg' )
          //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.jpg' )
          //value: new THREE.TextureLoader().load( './textures/venus1280x720.jpg' )
          //value: new THREE.TextureLoader().load( './textures/Titan2000x1000.jpg' )
          value: new THREE.TextureLoader().load(
            "./textures/bluemarble_16384.png"
          ),
          //value: new THREE.TextureLoader().load( './textures/human_population_density_map.png' )
        },
      },
    })
  );
  planetMesh.name = "planet";
  planetMesh.rotation.y = -Math.PI / 2; // This is needed to have the planet's texture align with the planet's Longintitude system
  planetMesh.matrixValid = false;
  if (guidParam["perfOptimizedThreeJS"]) planetMesh.freeze();
  planetMeshes.push(planetMesh);
} else {
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      radiusOfPlanet,
      planetWidthSegments,
      planetHeightSegments
    ),
    new THREE.MeshPhongMaterial({
      //roughness: 1,
      //metalness: 0,
      //map: new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg' ),
      //map: new THREE.TextureLoader().load( './textures/venus1280x720.jpg' ),
      map: new THREE.TextureLoader().load("./textures/bluemarble_16384.png"),
      //map: new THREE.TextureLoader().load( './textures/earthmap1k.jpg' ),
      //bumpMap: new THREE.TextureLoader().load( './textures/earthbump.jpg' ),
      //bumpScale: 1000000,
      //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
      //displacementScale: 20000,
      // blending: THREE.CustomBlending,
      // blendEquation: THREE.AddEquation, //default
      // blendSrc: THREE.SrcAlphaFactor, //default
      // blendDst: THREE.OneMinusSrcAlphaFactor, //default
      // blendSrcAlpha: dParamWithUnits['earthTextureOpacity'].value,
      // transparent: true,
      opacity: dParamWithUnits["earthTextureOpacity"].value,
    })
  );
  planetMesh.name = "planet";
  planetMesh.rotation.y = -Math.PI / 2; // This is needed to have the planet's texture align with the planet's Longintitude system
  planetMesh.matrixValid = false;
  if (guidParam["perfOptimizedThreeJS"]) planetMesh.freeze();
  planetMeshes.push(planetMesh);
}
//planetMesh.castShadow = true
planetMeshes.forEach((mesh) => {
  planetCoordSys.add(mesh);
});

const atmosphereMesh = new THREE.Mesh(
  new THREE.SphereGeometry(
    radiusOfPlanet,
    planetWidthSegments / 16,
    planetHeightSegments / 16
  ),
  new THREE.ShaderMaterial({
    //vertexShader: atmosphereVertexShader,
    //fragmentShader: atmosphereFragmentShader,
    vertexShader: document.getElementById("atmosphereVertexShader").textContent,
    fragmentShader: document.getElementById("atmosphereFragmentShader")
      .textContent,

    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
);
atmosphereMesh.name = "atmosphere";

// ToDo: Scaling this sphere as opposed to setting its radius directly seems a bit hacky.
atmosphereMesh.scale.set(1.1, 1.1 * (1.0 - 1.0 / WGS84FlattenningFactor), 1.1);
//atmosphereMesh.receiveShadow = true
planetCoordSys.add(atmosphereMesh);
const moonTexture = new THREE.TextureLoader().load("./textures/moon.jpg");
//initializing thigs as objects
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(radiusOfPlanet * 0.27, 64, 32),
  new THREE.MeshStandardMaterial({
    map: moonTexture,
  })
);
planetCoordSys.add(moonMesh);
function rotate() {
  requestAnimationFrame(rotate);
  renderer.render(planetCoordSys, camera);
}
rotate();
var moonPivot = new THREE.Object3D();
atmosphereMesh.add(moonPivot);
moonPivot.add(moonMesh);

const big = 12756200;
moonMesh.position.set(big, 10, 0);
function spin() {
  requestAnimationFrame(spin);
  moonPivot.rotation.y += 0.01;
  renderer.render(planetCoordSys, camera);
}

spin();

// const water = new Water(
//   new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments/16, planetHeightSegments/16),
//   {
//     textureWidth: 512,
//     textureHeight: 512,
//     waterNormals: new THREE.TextureLoader().load( './textures/waternormals.jpg', function ( texture ) {
//       texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
//     } ),
//     sunDirection: new THREE.Vector3(),
//     sunColor: 0xffffff,
//     waterColor: 0x001e0f,
//     distortionScale: 3.7,
//     fog: scene.fog !== undefined
//   }
// )
// scene.add(water)

// Experimental code
// const plane = new THREE.mesh(new THREE.PlaneGeometry(2, 2, 512, 512),
//   new THREE.MeshStandardMaterial(
//     {
//       map: earthBaseColor,
//       normalMap: earthNormalMap,
//       displacementMap: earthDisplacementMap,
//       displacementScale: 0.1,
//       roughnessMap: earthRoughnessMap,
//       roughness: 0.5,
//       aoMap: earthAmbienOcclusionMap,
//     }
//   )
// )
// plane.geometry.atributes.uv2 = plane.geometry.atributes.uv
// scene.add(plane)

// const earth2Geometry = new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments, 0, Math.PI/2, 0, Math.PI/2)
// const earth2Material = new THREE.MeshPhongMaterial({
//   roughness: 1,
//   metalness: 0,
//   map: new THREE.TextureLoader().load( './textures/world.topo.200404.3x21600x21600.A1.jpg' ),
//   //map: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' ),
//   //map: new THREE.TextureLoader().load( './textures/earthmap1k.jpg' ),
//   //bumpMap: new THREE.TextureLoader().load( './textures/earthbump.jpg' ),
//   //bumpScale: 1000000,
//   displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
//   displacementScale: 20000,
// })
// const earth2Mesh = new THREE.Mesh(earth2Geometry, earth2Material)
// earth2Mesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
//earthMesh.position =
//scene.add(earth2Mesh)

const grayMaterial = new THREE.MeshBasicMaterial({ color: 0x3f3f4f });
const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0x5f5f5f });
const greenMaterial = new THREE.MeshLambertMaterial({ color: 0x005f00 });
const metalicMaterial = new THREE.MeshBasicMaterial({
  color: 0x878681,
  transparent: false,
});
const transparentMaterial1 = new THREE.MeshPhongMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.55,
});
const transparentMaterial2 = new THREE.MeshLambertMaterial({
  color: 0xffff80,
  transparent: true,
  opacity: 0.35,
});
const transparentMaterial3 = new THREE.MeshLambertMaterial({
  color: 0xffff80,
  transparent: true,
  opacity: 0,
});

var tetherMaterial = new THREE.LineBasicMaterial({
  //vertexColors: THREE.VertexColors,
  color: 0x4897f8,
  //color: 0x000000,
  //color: 0x808080,
  //color: 0xc0c0f0,
  transparent: true,
  opacity: dParamWithUnits["tetherVisibility"].value,
});
// const thickness = 2
// const tetherMaterial = new THREE.ShaderMaterial( {
//   uniforms: { 'thickness': { value: thickness } },
//   vertexShader: document.getElementById( 'tetherVertexShader' ).textContent,
//   fragmentShader: document.getElementById( 'tetherFragmentShader' ).textContent,
//   side: THREE.DoubleSide,
//   alphaToCoverage: true // only works when WebGLRenderer's "antialias" is set to "true"
// } )

var cableMaterial = new THREE.LineBasicMaterial({
  vertexColors: THREE.VertexColors,
  //color: 0x4897f8,
  transparent: true,
  opacity: dParamWithUnits["cableVisibility"].value,
});

const earthAxisObject = new markers.earthAxisObject(
  planetCoordSys,
  dParamWithUnits,
  radiusOfPlanet
);
function earthAxisObjectUpdate() {
  updatedParam();
  earthAxisObject.update(dParamWithUnits, radiusOfPlanet);
}

const earthEquatorObject = new markers.earthEquatorObject(
  planetCoordSys,
  dParamWithUnits,
  radiusOfPlanet
);
function earthEquatorObjectUpdate() {
  updatedParam();
  earthEquatorObject.update(dParamWithUnits, radiusOfPlanet);
}

if (dParamWithUnits["showLaunchOrbit"].value) {
  const OrbitalAltitude = 200000; // m
  const launchOrbitGeometry = new THREE.TorusGeometry(
    radiusOfPlanet + OrbitalAltitude,
    AxisEquatorThickness,
    8,
    128
  );
  const launchOrbitMesh = new THREE.Mesh(launchOrbitGeometry, grayMaterial);
  launchOrbitMesh.name = "launchOrbit";
  //launchOrbitMesh.setRotationFromEuler(Math.PI/2 + dParamWithUnits['ringCenterLatitude'].value - (Math.PI/2 - dParamWithUnits['equivalentLatitude'].value), Math.PI/2 + dParamWithUnits['ringCenterLongitude'].value, 0)
  launchOrbitMesh.rotateY(dParamWithUnits["ringCenterLongitude"].value);
  launchOrbitMesh.rotateX(
    Math.PI / 2 -
      dParamWithUnits["ringCenterLatitude"].value +
      (Math.PI / 2 - dParamWithUnits["equivalentLatitude"].value)
  );
  planetCoordSys.add(launchOrbitMesh);
}

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
const starGeometry = new THREE.BufferGeometry();
const starVertices = [];
for (let i = 0; i < 10000; ) {
  // Probably should eliminate all of the stars that are too close to the planet
  // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // x
  // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // y
  // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // z
  // Better code...
  // Create stars at random positions and then push them all 2,000,000 km away from the origin
  const XYZ = new THREE.Vector3(
    THREE.MathUtils.randFloat(-1, 1),
    THREE.MathUtils.randFloat(-1, 1),
    THREE.MathUtils.randFloat(-1, 1)
  );
  if (XYZ.length() <= 1) {
    // The random position needs to be not on the origin and also within a unit sphere
    XYZ.normalize().multiplyScalar(256 * radiusOfPlanet);
    starVertices.push(XYZ.x, XYZ.y, XYZ.z);
    i++;
  }
}
starGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(starVertices, 3)
);
const starsMesh = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({ color: 0xffffff })
);
starsMesh.name = "stars";
planetCoordSys.add(starsMesh); // Todo: This might make the stars rotate with planet. Maybe need another Group...

// Generate the main ring
let crv = new tram.commonRingVariables(
  radiusOfPlanet,
  dParamWithUnits["ringFinalAltitude"].value,
  dParamWithUnits["equivalentLatitude"].value,
  dParamWithUnits["ringAmountRaisedFactor"].value
);
let ctv = new tram.commonTetherVariables();
let ecv = new tram.elevatorCarVariables(
  gravitationalConstant,
  massOfPlanet,
  radiusOfPlanet,
  dParamWithUnits,
  crv
);
let tvv = new tram.transitVehicleVariables(
  gravitationalConstant,
  massOfPlanet,
  radiusOfPlanet,
  dParamWithUnits,
  crv
);

// Add a patch of high res texture on the ground as a background for some downward looking shots
const backgroundPatchGeometry = new THREE.PlaneGeometry(100000, 100000);
//const backgroundPatchGeometry = new THREE.SphereGeometry(100000, 32, 32)
const backgroundPatchMaterial = new THREE.MeshBasicMaterial({
  side: THREE.DoubleSide,
  //map: new THREE.TextureLoader().load( './textures/ZionNationalPark.jpg' ),
  //map: new THREE.TextureLoader().load( './textures/Mongolia.jpg' ),
  map: new THREE.TextureLoader().load("./textures/myakka_oli_2022031_lrg.jpg"),
  //map: new THREE.TextureLoader().load( './textures/chinasolar_oli_2020264_lrg.jpg' ),
  //map: new THREE.TextureLoader().load( './textures/AustraliaDesert.jpg' ),
  //map: new THREE.TextureLoader().load( './textures/CrepuscularRays.jpg' ),
});
const backgroundPatchMesh = new THREE.Mesh(
  backgroundPatchGeometry,
  backgroundPatchMaterial
  // new THREE.ShaderMaterial({
  //   vertexShader: document.getElementById( 'vertexShader' ).textContent,
  //   fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
  //   uniforms: {
  //     planetTexture: {
  //       value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
  //     }
  //   }
  // })
);
const patchAltitude = 50;
backgroundPatchMesh.position
  .set(2658955.8695003525, 5083161.091401661, -2859960.6445000893)
  .multiplyScalar(
    (radiusOfPlanet + patchAltitude) / (radiusOfPlanet + crv.ringFinalAltitude)
  );
backgroundPatchMesh.lookAt(
  0.41481475047657973,
  0.7930065109804368,
  -0.44617193583828985
);
let backgroundPatchActive = false;
updateBackgroundPatch();

function updateBackgroundPatch() {
  updatedParam();
  if (!backgroundPatchActive && dParamWithUnits["showBackgroundPatch"].value) {
    planetCoordSys.add(backgroundPatchMesh);
    backgroundPatchActive = true;
  } else if (
    backgroundPatchActive &&
    !dParamWithUnits["showBackgroundPatch"].value
  ) {
    planetCoordSys.remove(backgroundPatchMesh);
    backgroundPatchActive = false;
  }
}

let mainRingCurve;
let mainRingCurveControlPoints;
constructMainRingCurve();

function constructMainRingCurve() {
  mainRingCurveControlPoints = tram.generateMainRingControlPoints(
    dParamWithUnits,
    crv,
    radiusOfPlanet,
    ringToPlanetRotation,
    planetCoordSys,
    tetheredRingRefCoordSys
  );
  const threejsControlPoints = [];
  mainRingCurveControlPoints.forEach((point) => {
    threejsControlPoints.push(new THREE.Vector3(point.x, point.y, point.z));
  });

  mainRingCurve = new THREE.CatmullRomCurve3(threejsControlPoints);
  mainRingCurve.curveType = "centripetal";
  mainRingCurve.closed = true;
  mainRingCurve.tension = 0;

  if (genKMLFile) {
    const numPointsOnMainRingCurve = 8192;
    const points = mainRingCurve.getPoints(numPointsOnMainRingCurve);

    //KML file placemark creation code for the ring and elevator cables.
    kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader);
    let xyzWorld, xyzPlanet;
    let coordString, firstCoordString;

    planetCoordSys.updateWorldMatrix(true);
    tetheredRingRefCoordSys.updateMatrixWorld(true);
    points.forEach((point, i) => {
      xyzWorld = tetheredRingRefCoordSys.localToWorld(point.clone());
      xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone());
      const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z);
      coordString =
        "          " +
        Math.round(lla.lon * 10000000) / 10000000 +
        "," +
        Math.round(lla.lat * 10000000) / 10000000 +
        "," +
        Math.round(Math.abs(lla.alt) * 1000) / 1000 +
        "\n";
      if (i == 0) {
        firstCoordString = coordString;
      }
      kmlFile = kmlFile.concat(coordString);
    });
    kmlFile = kmlFile.concat(firstCoordString); // We need to repeat the first coordinate to close the loop
    kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter);
  }
}

const mainRingCurveObject = new markers.mainRingCurveObject(
  tetheredRingRefCoordSys,
  dParamWithUnits,
  mainRingCurve
);
function mainRingCurveObjectUpdate() {
  updatedParam();
  mainRingCurveObject.update(dParamWithUnits, mainRingCurve);
}

// Tethers
const tethers = [];
constructTethers();
function constructTethers() {
  if (dParamWithUnits["showTethers"].value) {
    if (verbose) console.log("Constructing Tethers");
    const tetherGeometry = new TetherGeometry(
      radiusOfPlanet,
      gravitationalConstant,
      massOfPlanet,
      crv,
      ctv,
      dParamWithUnits,
      specs,
      fastTetherRender,
      genKMLFile,
      kmlFile,
      genSpecs
    );
    const tempTetherMesh = new THREE.LineSegments(
      tetherGeometry,
      tetherMaterial
    );
    if (fastTetherRender) {
      const n = dParamWithUnits["numTethers"].value;
      const k = (2 * Math.PI * 2) / n;
      for (let i = 0; i < n / 2; i++) {
        // Really should be currentCatenaryTypes.length, but that value is hidden from us here
        const θ = i * k;
        const referencePoint = new THREE.Vector3().setFromSphericalCoords(
          radiusOfPlanet + crv.currentMainRingAltitude,
          -(Math.PI / 2 - crv.currentEquivalentLatitude),
          θ
        );
        tempTetherMesh.position.copy(referencePoint);
        tempTetherMesh.rotation.y = θ;
        tempTetherMesh.matrixValid = false;
        tethers[i] = tempTetherMesh.clone();
        tetheredRingRefCoordSys.add(tethers[i]);
      }
    } else {
      tethers[0] = tempTetherMesh.clone();
      tetheredRingRefCoordSys.add(tethers[0]);
    }
  }
}

const gravityForceArrowsObject = new markers.gravityForceArrowsObject(
  planetCoordSys,
  dParamWithUnits,
  mainRingCurveControlPoints,
  mainRingCurve,
  crv,
  ctv,
  radiusOfPlanet,
  ringToPlanetRotation
);
function gravityForceArrowsUpdate() {
  updatedParam();
  showTensileForceArrows = true;
  showGravityForceArrows = true;
  showInertialForceArrows = true;
  gravityForceArrowsObject.update(
    dParamWithUnits,
    mainRingCurveControlPoints,
    mainRingCurve,
    crv,
    ctv,
    radiusOfPlanet,
    ringToPlanetRotation,
    showTensileForceArrows,
    showGravityForceArrows,
    showInertialForceArrows
  );
}

const gyroscopicForceArrowsObject = new markers.gyroscopicForceArrowsObject(
  planetCoordSys,
  dParamWithUnits,
  mainRingCurveControlPoints,
  mainRingCurve,
  crv,
  radiusOfPlanet,
  ringToPlanetRotation
);
function gyroscopicForceArrowsUpdate() {
  updatedParam();
  gyroscopicForceArrowsObject.update(
    dParamWithUnits,
    mainRingCurveControlPoints,
    mainRingCurve,
    crv,
    radiusOfPlanet,
    ringToPlanetRotation
  );
}

const numWedges = 64; // Wedges are used to keep points within meshes from becoming too spread out, losing precision, and then starting to jitter

let start, end;

console.log("V6");

const mainRingMeshes = [];
const transitSystemMeshes = [];
const dx = dParamWithUnits["transitTrackOuterOffset"].value;
const dy1 = dParamWithUnits["transitTrackUpperOffset1"].value;
const dy2 = dParamWithUnits["transitTrackUpperOffset2"].value;
let trackOffsetsList = [
  [-dx, dy1],
  [dx, dy1],
  [-dx, dy2],
  [dx, dy2],
];

constructMainRingAndTransitSystem();
function constructMainRingAndTransitSystem() {
  if (dParamWithUnits["showTransitSystem"].value) {
    //console.log("Constructing Transit System")
    // Add the transit tube
    // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
    const transitTube_r =
      crv.mainRingRadius +
      tram.offset_r(
        dParamWithUnits["transitTubeOutwardOffset"].value,
        dParamWithUnits["transitTubeUpwardOffset"].value,
        crv.currentEquivalentLatitude
      );
    const transitTube_y =
      crv.yc +
      tram.offset_y(
        dParamWithUnits["transitTubeOutwardOffset"].value,
        dParamWithUnits["transitTubeUpwardOffset"].value,
        crv.currentEquivalentLatitude
      );

    const trackHalfWidth = 0.2;
    const trackHalfHeight = 0.05;
    const referencePoint = new THREE.Vector3();

    // Construct the main rings
    const mro = (dParamWithUnits["numMainRings"].value - 1) / 2;
    for (let j = 0; j < numWedges; j++) {
      const mainRingGeometries = [];
      start = j / numWedges;
      end = (j + 1) / numWedges;
      referencePoint.copy(mainRingCurve.getPoint((start + end) / 2));

      // for (let i = 0; i<dParamWithUnits['numMainRings'].value; i++) {
      //   mainRingGeometries[i] = new mainRingTubeGeometry(mainRingCurve, start, end, referencePoint, 8192/numWedges, (i-mro) * dParamWithUnits['mainRingSpacing'].value, dParamWithUnits['mainRingTubeRadius'].value-.25)
      // }
      // const mainRingMesh = new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries( mainRingGeometries ), metalicMaterial)
      // mainRingMesh.name = 'mainRing'
      // mainRingMesh.position.copy(referencePoint)
      // mainRingMesh.matrixValid = false
      // if (guidParam['perfOptimizedThreeJS']) mainRingMesh.freeze()
      // mainRingMeshes.push( mainRingMesh )
    }
    // mainRingMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))

    // Construct the Transit Tube
    // Outer tube
    // for (let j = 0; j<numWedges; j++) {
    //   start = j / numWedges
    //   end = (j+1) / numWedges
    //   referencePoint.copy( mainRingCurve.getPoint( (start+end)/2 ) )

    //   const tempTransitTubeGeometry = new transitTubeGeometry(mainRingCurve, start, end, referencePoint, 8192/numWedges, dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, dParamWithUnits['transitTubeTubeRadius'].value)
    //   const transitTubeMesh = new THREE.Mesh(tempTransitTubeGeometry, transparentMaterial3)
    //   transitTubeMesh.name = 'transitTube'
    //   transitTubeMesh.position.copy(referencePoint)
    //   transitTubeMesh.matrixValid = false
    //   if (guidParam['perfOptimizedThreeJS']) transitTubeMesh.freeze()
    //   transitSystemMeshes.push( transitTubeMesh )
    // }

    // Four tracks within outer tube
    let outwardOffset = [],
      upwardOffset = [];
    for (let i = 0; i < trackOffsetsList.length; i++) {
      outwardOffset[i] =
        dParamWithUnits["transitTubeOutwardOffset"].value +
        trackOffsetsList[i][0];
      upwardOffset[i] =
        dParamWithUnits["transitTubeUpwardOffset"].value +
        trackOffsetsList[i][1];
    }
    for (let j = 0; j < numWedges; j++) {
      start = j / numWedges;
      end = (j + 1) / numWedges;
      referencePoint.copy(mainRingCurve.getPoint((start + end) / 2));

      // Add four tracks inside the transit tube
      for (let i = 0; i < trackOffsetsList.length; i++) {
        const trackGeometry = new transitTrackGeometry(
          mainRingCurve,
          start,
          end,
          referencePoint,
          8192 / numWedges,
          outwardOffset[i],
          upwardOffset[i],
          trackHalfWidth,
          trackHalfHeight
        );
        const transitTrackMesh = new THREE.Mesh(trackGeometry, metalicMaterial);
        transitTrackMesh.name = "transitTrack";
        transitTrackMesh.position.copy(referencePoint);
        transitTrackMesh.matrixValid = false;
        if (guidParam["perfOptimizedThreeJS"]) transitTrackMesh.freeze();
        transitSystemMeshes.push(transitTrackMesh);
      }
    }
    transitSystemMeshes.forEach((mesh) => tetheredRingRefCoordSys.add(mesh));
  }
}

const transitSystemObject = new transitSystem(
  tetheredRingRefCoordSys,
  dParamWithUnits,
  specs,
  genSpecs,
  trackOffsetsList,
  crv,
  ecv,
  radiusOfPlanet,
  mainRingCurve
);

const elevatorCableMeshes = [];
constructElevatorCables();
function constructElevatorCables() {
  if (dParamWithUnits["showElevatorCables"].value) {
    //console.log("Constructing Elevator Cables")

    // Add elevator cables
    // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
    const cableOutwardOffset =
      dParamWithUnits["transitTubeOutwardOffset"].value -
      dParamWithUnits["transitTubeTubeRadius"].value +
      dParamWithUnits["elevatorCableOutwardOffset"].value;
    const elevatorCableUpperAttachPnt_dr = tram.offset_r(
      cableOutwardOffset,
      dParamWithUnits["transitTubeUpwardOffset"].value +
        dParamWithUnits["additionalUpperElevatorCable"].value,
      crv.currentEquivalentLatitude
    );
    const elevatorCableLowerAttachPnt_dr = tram.offset_r(
      cableOutwardOffset,
      -crv.currentMainRingAltitude,
      crv.currentEquivalentLatitude
    );
    const elevatorCableUpperAttachPnt_dy = tram.offset_y(
      cableOutwardOffset,
      dParamWithUnits["transitTubeUpwardOffset"].value +
        dParamWithUnits["additionalUpperElevatorCable"].value,
      crv.currentEquivalentLatitude
    );
    const elevatorCableLowerAttachPnt_dy = tram.offset_y(
      cableOutwardOffset,
      -crv.currentMainRingAltitude,
      crv.currentEquivalentLatitude
    );
    //const elevatorCableLowerAttachPnt_da = dParamWithUnits['elevatorCableForwardOffset'].value / (2 * Math.PI * (crv.mainRingRadius + elevatorCableUpperAttachPnt_dr))
    const elevatorCableLowerAttachPnt_da =
      -69.5 /
      (2 * Math.PI * (crv.mainRingRadius + elevatorCableUpperAttachPnt_dr));

    const wedgeReferencePoints = Array(numWedges);
    for (let wedgeIndex = 0; wedgeIndex < numWedges; wedgeIndex++) {
      wedgeReferencePoints[wedgeIndex] = new THREE.Vector3();
      wedgeReferencePoints[wedgeIndex].copy(
        mainRingCurve.getPoint((wedgeIndex + 0.5) / numWedges)
      );
      mainRingCurve.getPoint((wedgeIndex + 0.5) / numWedges);
    }
    const pointSets = Array(numWedges)
      .fill()
      .map((entry) => []); // declare an array of empty arrays for storing points
    const n = dParamWithUnits["numElevatorCables"].value;
    for (
      let a = elevatorCableLowerAttachPnt_da, i = 0;
      i < n;
      a += (2 * Math.PI) / n, i++
    ) {
      const mrcp = mainRingCurve.getPoint((a / 2 / Math.PI) % 1); // mrcp is the main ring curve point

      const elevatorCableUpperAttachPnt = new THREE.Vector3(
        mrcp.x + elevatorCableUpperAttachPnt_dr * Math.cos(a),
        mrcp.y + elevatorCableUpperAttachPnt_dy,
        mrcp.z + elevatorCableUpperAttachPnt_dr * Math.sin(a)
      );
      const elevatorCableLowerAttachPnt = new THREE.Vector3(
        mrcp.x + elevatorCableLowerAttachPnt_dr * Math.cos(a),
        mrcp.y + elevatorCableLowerAttachPnt_dy,
        mrcp.z + elevatorCableLowerAttachPnt_dr * Math.sin(a)
      );

      // For performance reasons, within each wedge all of the elevator cables are collected into a single geometry
      const wedgeIndex = Math.floor((i * numWedges) / n);
      const wedgeReferencePoint = wedgeReferencePoints[wedgeIndex];
      pointSets[wedgeIndex].push(
        elevatorCableUpperAttachPnt.sub(wedgeReferencePoint)
      );
      pointSets[wedgeIndex].push(
        elevatorCableLowerAttachPnt.sub(wedgeReferencePoint)
      );
      // Now create an array of two points use that to make a LineSegment Geometry
      //tempGeometry.setAttribute("color", new THREE.Float32BufferAttribute(0x0000ff, 3) )
    }
    for (let wedgeIndex = 0; wedgeIndex < numWedges; wedgeIndex++) {
      const pointSet = pointSets[wedgeIndex];
      const elevatorCableMesh = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pointSet),
        cableMaterial
      );
      pointSet.splice(0, pointSet.length); // Empty the array
      elevatorCableMesh.position.copy(wedgeReferencePoints[wedgeIndex]);
      elevatorCableMesh.matrixValid = false;
      elevatorCableMeshes.push(elevatorCableMesh);
    }
    elevatorCableMeshes.forEach((mesh) => tetheredRingRefCoordSys.add(mesh));
  }
}

if (dParamWithUnits["showLaunchTrajectory"].value) {
  // Launch Trajectory Line
  const l = new launcher.launcher();
  const angleFromNorthPole =
    Math.PI / 2 -
    dParamWithUnits["ringCenterLatitude"].value +
    (Math.PI / 2 - crv.currentEquivalentLatitude);
  const launcherExitPosition = new THREE.Vector3().setFromSphericalCoords(
    radiusOfPlanet + crv.currentMainRingAltitude,
    angleFromNorthPole,
    dParamWithUnits["ringCenterLongitude"].value
  );

  const launcherExitMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    greenMaterial
  );
  let launcherExitMarkerSize = 1000;
  launcherExitMarker.position.copy(launcherExitPosition);
  launcherExitMarker.scale.set(
    launcherExitMarkerSize,
    launcherExitMarkerSize,
    launcherExitMarkerSize
  );
  launcherExitMarker.matrixValid = false;
  planetCoordSys.add(launcherExitMarker);

  l.Update();
  let ADandV;
  ADandV = l.GetAltitudeDistanceAndVelocity(0);
  //const displacement = new THREE.Vector3(0, 0, 0)
  //let distanceTraveledInsideTube = 0
  //let distanceTraveledOutsideTube = 0
  //let angularDistance = (distanceTraveledInsideTube-dParamWithUnits['launchTubeLength'].value)/crv.mainRingRadius
  //let prevVehiclePostion = new THREE.Vector3(crv.mainRingRadius * Math.sin(angularDistance), crv.yf, crv.mainRingRadius * Math.cos(angularDistance))

  let t = 0;
  let prevVehiclePostion = new THREE.Vector3(
    (l.R_Earth + ADandV.Altitude) *
      Math.sin(ADandV.Distance / (l.R_Earth + ADandV.Altitude)),
    crv.yf,
    (l.R_Earth + ADandV.Altitude) *
      Math.cos(ADandV.Distance / (l.R_Earth + ADandV.Altitude))
  );
  let currVehiclePostion = new THREE.Vector3(0, 0, 0);
  const color = new THREE.Color();
  const launchTrajectoryPoints = [];
  const launchTrajectoryColors = [];

  for (
    t = 1;
    t < 3 * dParamWithUnits["launchTubeAccelerationTime"].value;
    t++
  ) {
    // distanceTraveledInsideTube = 0.5 * dParamWithUnits['launchTubeAcceleration'].value * t**2
    // distanceTraveledOutsideTube = Math.max(0, dParamWithUnits['launchTubeExitVelocity'].value * (t - dParamWithUnits['launchTubeAccelerationTime'].value))
    // angularDistance = Math.min(0, (distanceTraveledInsideTube-dParamWithUnits['launchTubeLength'].value)/crv.mainRingRadius)
    // currVehiclePostion = new THREE.Vector3(
    //   crv.mainRingRadius * Math.sin(angularDistance) + distanceTraveledOutsideTube,
    //   crv.yf,
    //   crv.mainRingRadius * Math.cos(angularDistance))
    //displacement.add()
    //currVehiclePostion = prevVehiclePostion.clone().add(displacement)
    //console.log(prevVehiclePostion, currVehiclePostion)

    ADandV = l.GetAltitudeDistanceAndVelocity(t);
    currVehiclePostion = new THREE.Vector3(
      (l.R_Earth + ADandV.Altitude) *
        Math.sin(ADandV.Distance / (l.R_Earth + ADandV.Altitude)),
      crv.yf,
      (l.R_Earth + ADandV.Altitude) *
        Math.cos(ADandV.Distance / (l.R_Earth + ADandV.Altitude))
    );

    launchTrajectoryPoints.push(prevVehiclePostion);
    launchTrajectoryPoints.push(currVehiclePostion);
    prevVehiclePostion = currVehiclePostion.clone();
    color.setHSL(0.5, 0.5, 1.0 * (t % 10 == 9 || t % 60 == 58)); // Draw line with thick and thin tick marks
    launchTrajectoryColors.push(color.r, color.g, color.b);
    launchTrajectoryColors.push(color.r, color.g, color.b);

    const currentAltitude = 32000;
    const airDensity = l.GetAirDensity(currentAltitude);
    const vehicleVelocity = 8000; // ToDo
    const vehicleCrossSectionalArea =
      Math.PI * dParamWithUnits["launchVehicleRadius"].value ** 2;
    const forceOfDrag =
      dParamWithUnits["launchVehicleCoefficientOfDrag"].value *
      airDensity *
      vehicleCrossSectionalArea *
      vehicleVelocity ** 2;
    const powerToOvercomeDrag = forceOfDrag * vehicleVelocity;
  }

  const launchTrajectoryGeometry = new THREE.BufferGeometry().setFromPoints(
    launchTrajectoryPoints
  );
  launchTrajectoryGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(launchTrajectoryColors, 3)
  );

  var launchTrajectoryMaterial = new THREE.LineBasicMaterial({
    vertexColors: THREE.VertexColors,
    transparent: true,
    opacity: dParamWithUnits["launchTrajectoryVisibility"].value,
  });
  const launchTrajectoryMesh = new THREE.LineSegments(
    launchTrajectoryGeometry,
    launchTrajectoryMaterial
  );
  tetheredRingRefCoordSys.add(launchTrajectoryMesh);
  //planetCoordSys.add( launchTrajectoryMesh )
  // End Launch Trajectory Line
}

//calculateAdditionalSpecs()
function calculateAdditionalSpecs() {
  const transitTube_r =
    crv.mainRingRadius +
    tram.offset_r(
      dParamWithUnits["transitTubeOutwardOffset"].value,
      dParamWithUnits["transitTubeUpwardOffset"].value,
      crv.currentEquivalentLatitude
    );
  const transitTubeSurfaceArea =
    2 *
    Math.PI *
    dParamWithUnits["transitTubeTubeRadius"].value *
    (2 * Math.PI * transitTube_r);
  const transitTubeInteriorVolume =
    Math.PI *
    dParamWithUnits["transitTubeTubeRadius"].value ** 2 *
    (2 * Math.PI * transitTube_r);
  specs["transitTubeSurfaceArea"] = {
    value: transitTubeSurfaceArea,
    units: "m2",
  };
  specs["transitTubeInteriorVolume"] = {
    value: transitTubeInteriorVolume,
    units: "m3",
  };

  // Calculate equivalent space elevator mass and cost
  let T;
  for (let f = 0; f < 1; f++) {
    T =
      (dParamWithUnits["tetherMaterialTensileStrength"].value * 1000000) /
      dParamWithUnits["tetherEngineeringFactor"].value;
    T *= 2 ** f;
    const hoursInSiderealDay = 23.9344696;
    const ClimberEmptyMass = 1000; //kg
    const ClimberPayloadMass = 19000; //kg
    const ClimberFuelMass = 100; //kg
    const ClimberInitialAltitude = 0; // m
    const ClimberMaxAccelleration = 9.8; // m/s2
    const ClimberTotalMass =
      ClimberEmptyMass + ClimberPayloadMass + ClimberFuelMass;
    const GravityForce =
      (gravitationalConstant * ClimberTotalMass * massOfPlanet) /
      (radiusOfPlanet + ClimberInitialAltitude) ** 2;
    const CentripetalForce =
      (-ClimberTotalMass *
        ((2 * Math.PI * (radiusOfPlanet + ClimberInitialAltitude)) /
          (hoursInSiderealDay * 3600)) **
          2) /
      (radiusOfPlanet + ClimberInitialAltitude);
    const SurfaceTerminusAnchoringForce = 10000; // N
    const TotalLoadForce =
      GravityForce +
      CentripetalForce +
      ClimberMaxAccelleration * ClimberTotalMass +
      SurfaceTerminusAnchoringForce;
    const A_s = TotalLoadForce / (T * 1000000);
    const ρ = dParamWithUnits["tetherMaterialDensity"].value;
    const R = radiusOfPlanet;
    const R_g = R + 35786000; //m
    const R_a = R_g * 2;
    const g = 9.8; // m/s2
    const step = 1;
    let r;
    let A;
    let V;
    V = 0;
    let A_prev = A_s;
    //console.log(A_s, T)
    for (r = R + step; r < R_a; r += step) {
      A =
        A_s *
        Math.exp(
          ((ρ * g * R ** 2) / T) *
            (1 / R + R ** 2 / 2 / R_g ** 3 - 1 / r - r ** 2 / 2 / R_g ** 3)
        );
      V += ((A_prev + A) / 2) * step;
      A_prev = A;
    }
    const M = V * ρ;
    const spaceElevatorCost = M * dParamWithUnits["tetherMaterialCost"].value;

    if (f == 1) {
      specs["spaceElevatorTetherVolumeWithSameMaterials"] = {
        value: V,
        units: "m3",
      };
      specs["spaceElevatorTetherMassWithSameMaterials"] = {
        value: M,
        units: "kg",
      };
      specs["spaceElevatorTetherCostWithSameMaterials"] = {
        value: spaceElevatorCost,
        units: "USD",
      };
      specs["spaceElevatorTetherCostPerKgOfLoadWithSameMaterials"] = {
        value: spaceElevatorCost / (ClimberPayloadMass / g),
        units: "USD",
      };
    }
  }
}

function updateRing() {
  if (majorRedesign) {
    mainRingMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      tetheredRingRefCoordSys.remove(mesh);
    });
    mainRingMeshes.splice(0, mainRingMeshes.length);
  }
  if (verbose) console.log("dispose mainRingMeshes ");

  if (dParamWithUnits["showTransitSystem"].value) {
    if (majorRedesign) {
      transitSystemMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
        tetheredRingRefCoordSys.remove(mesh);
      });
      transitSystemMeshes.splice(0, transitSystemMeshes.length);
    }
  }
  if (verbose) console.log("dispose transitSystemMeshes ");

  if (dParamWithUnits["showElevatorCables"].value) {
    elevatorCableMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      tetheredRingRefCoordSys.remove(mesh);
    });
    elevatorCableMeshes.splice(0, elevatorCableMeshes.length);
  }
  if (verbose) console.log("dispose elevatorCableMeshes ");

  tethers.forEach((tether) => {
    tether.geometry.dispose();
    tether.material.dispose();
    //tether.color.dispose()
    tetheredRingRefCoordSys.remove(tether);
  });
  tethers.splice(0, tethers.length);
  if (verbose) console.log("dispose tethers ");

  // Update the parameters prior to reconsrructing the scene
  updatedParam();

  // Reconstruction Section
  crv = new tram.commonRingVariables(
    radiusOfPlanet,
    dParamWithUnits["ringFinalAltitude"].value,
    dParamWithUnits["equivalentLatitude"].value,
    dParamWithUnits["ringAmountRaisedFactor"].value
  );
  // ToDo, need to add crv parameters to the specs file. Specifically: crv.mainRingRadius, crv.mainRingCircumference, crv.mainRingMassPerMeter,
  ecv = new tram.elevatorCarVariables(
    gravitationalConstant,
    massOfPlanet,
    radiusOfPlanet,
    dParamWithUnits,
    crv
  );

  constructMainRingCurve();
  if (verbose) console.log("constructMainRingCurve ");

  if (dParamWithUnits["showTransitSystem"].value) {
    if (majorRedesign) {
      constructMainRingAndTransitSystem();
    } else {
      transitSystemMeshes.forEach((mesh, i) => {
        const transitTube_y =
          crv.yc +
          tram.offset_y(
            dParamWithUnits["transitTubeOutwardOffset"].value,
            dParamWithUnits["transitTubeUpwardOffset"].value,
            crv.currentEquivalentLatitude
          );
        if (i == 0) {
          mesh.position.y = transitTube_y;
          mesh.matrixValid = false;
        } else {
          //const outwardOffset = trackOffsetsList[i-1][0] * dParamWithUnits['transitTubeTubeRadius'].value
          //const upwardOffset = trackOffsetsList[i-1][1] * dParamWithUnits['transitTubeTubeRadius'].value
          //mesh.position.y = transitTube_y + tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
          //mesh.matrixValid = false
        }
      });
    }
  }
  mainRingCurveObject.update(dParamWithUnits, mainRingCurve);
  transitSystemObject.update(
    dParamWithUnits,
    specs,
    genSpecs,
    trackOffsetsList,
    crv,
    radiusOfPlanet,
    mainRingCurve,
    [timeSinceStart]
  );
  if (verbose) console.log("transitSystemObject.update ");

  constructElevatorCables();
  if (verbose) console.log("constructElevatorCables ");
  //if (verbose) console.log("Updating Tethers")
  constructTethers();
  if (verbose) console.log("constructTethers ");

  gravityForceArrowsObject.update(
    dParamWithUnits,
    mainRingCurveControlPoints,
    mainRingCurve,
    crv,
    ctv,
    radiusOfPlanet,
    ringToPlanetRotation,
    showTensileForceArrows,
    showGravityForceArrows,
    showInertialForceArrows
  );
  //calculateAdditionalSpecs()

  if (genSpecs) {
    guiTextOutput.innerHTML = [
      "(Press 's' to update)",
      "<i>Total Tethered Ring Cost</i>: " +
        specs["sumOfAllCapitalCosts"].value.toFixed(2) +
        " " +
        specs["sumOfAllCapitalCosts"].units,
      "<i>Total Tethered Ring Cost Per Kg Supported</i>: " +
        specs["capitalCostPerKgSupported"].value.toFixed(2) +
        " " +
        specs["capitalCostPerKgSupported"].units,
      "<i>Total Stored Energy in TWh</i>: " +
        specs["movingRingsTotalKineticEnergyTWh"].value.toFixed(2) +
        " " +
        specs["movingRingsTotalKineticEnergyTWh"].units,
      "<i>Moving Ring Speed</i>: " +
        specs["movingRingSpeed"].value.toFixed(2) +
        " " +
        specs["movingRingSpeed"].units,
    ].join("<br/>");
  }

  if (genSpecsFile) {
    //if (verbose) console.log("Generating Specs File")
    specsFile = specsFile.concat("// Derived Specifications\n");
    Object.entries(specs).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + "," + v.value + "," + v.units + "\n");
    });
  }
  if (verbose) console.log("done ");
}

const mouse = {
  x: undefined,
  y: undefined,
};
let intersectionPoint = new THREE.Vector3();
let targetPoint = new THREE.Vector3();
let animateRingRaising = false;
let animateRingLowering = false;
let animateZoomingIn = false;
let animateZoomingOut = false;
//let animateCameraGoingUp = false
//let animateCameraGoingDown = false
let cameraSpeed = 0;
let showTensileForceArrows = false;
let showGravityForceArrows = false;
let showInertialForceArrows = false;
const clock = new THREE.Clock();
let timeSinceStart = 0;
let prevWeAreFar1 = NaN;
let prevWeAreFar2 = NaN;

function animate() {
  renderer.setAnimationLoop(renderFrame);
}

// Hack
console.userdata = {
  capture: 0,
  matrixAutoUpdateData: {},
  matrixWorldUpdateData: {},
};
const elevatorPosCalc = new tram.elevatorPositionCalculator(
  dParamWithUnits,
  crv,
  ecv
);

function renderFrame() {
  if (orbitControlsEarthRingLerpFactor != 1) {
    //console.log("Lerping...")
    orbitControlsEarthRingLerpFactor = tram.clamp(
      orbitControlsEarthRingLerpFactor + orbitControlsEarthRingLerpSpeed,
      0,
      1
    );

    orbitControls.enabled = false;
    orbitControls.target.lerpVectors(
      previousTargetPoint,
      orbitControlsTargetPoint,
      orbitControlsEarthRingLerpFactor
    );
    const upVector = new THREE.Vector3();
    upVector
      .lerpVectors(
        previousUpVector,
        orbitControlsTargetUpVector,
        orbitControlsEarthRingLerpFactor
      )
      .normalize();
    camera.up.copy(upVector);
    orbitControls.upDirection.copy(upVector);
    upVector
      .lerpVectors(
        previousUpVector,
        orbitControlsTargetUpVector,
        orbitControlsEarthRingLerpFactor
      )
      .normalize();
    camera.up.copy(upVector);
    orbitControls.upDirection.copy(upVector);
    orbitControls.screenSpacePanning = false;
    orbitControls.enabled = true;
    orbitControls.update();
  } else {
    orbitControls.maxPolarAngle = orbitControlsNewMaxPolarAngle;
    // const offTarget = orbitControls.target.clone().sub(orbitControlsTargetPoint).length()
    // console.log(offTarget)
    // if ((offTarget>100) && (offTarget<10000) && (orbitControlsTargetPoint.length()>radiusOfPlanet)) {
    //   orbitControls.target.lerp(orbitControlsTargetPoint, 0.02)
    //   console.log("pulling towards last target")
    // }
  }

  //planetMesh.rotation.y += 0.000001
  if (animateZoomingIn || animateZoomingOut) {
    var offset = new THREE.Vector3();
    offset.copy(orbitControls.object.position).sub(orbitControls.target);
    if (animateZoomingIn) {
      offset.multiplyScalar(1 - 10 ** dParamWithUnits["logZoomRate"].value);
    } else if (animateZoomingOut) {
      offset.multiplyScalar(1 + 10 ** dParamWithUnits["logZoomRate"].value);
    }
    orbitControls.object.position.copy(orbitControls.target).add(offset);
  }
  orbitControls.update();

  const delta = clock.getDelta();
  timeSinceStart += delta;

  if (animateRingRaising || animateRingLowering) {
    if (verbose) console.log("Raise/Lower Start " + clock.getDelta());
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      v.value = guidParam[k];
    });
    const ringRaiseRateFactor = 0.25;
    if (animateRingRaising) {
      guidParamWithUnits["ringAmountRaisedFactor"].value = Math.min(
        1,
        guidParamWithUnits["ringAmountRaisedFactor"].value +
          delta * ringRaiseRateFactor
      );
      if (guidParamWithUnits["ringAmountRaisedFactor"].value == 1)
        animateRingRaising = false;
      // guidParamWithUnits['moveRing'].value = Math.min(1, guidParamWithUnits['moveRing'].value+delta*ringRaiseRateFactor)
      // if (guidParamWithUnits['moveRing'].value==1) animateRingRaising = false
    }
    if (animateRingLowering) {
      guidParamWithUnits["ringAmountRaisedFactor"].value = Math.max(
        0,
        guidParamWithUnits["ringAmountRaisedFactor"].value -
          delta * ringRaiseRateFactor
      );
      if (guidParamWithUnits["ringAmountRaisedFactor"].value == 0)
        animateRingLowering = false;
      // guidParamWithUnits['moveRing'].value = Math.max(0, guidParamWithUnits['moveRing'].value-delta*ringRaiseRateFactor)
      // if (guidParamWithUnits['moveRing'].value==0) animateRingLowering = false
      //cameraGroup.position.z -= -0.0001 * radiusOfPlanet
      //console.log(cameraGroup.position.z/radiusOfPlanet)
    }
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      guidParam[k] = v.value;
    });
    for (var i in gui.__controllers) {
      gui.__controllers[i].updateDisplay();
    }
    //adjustRingLatLon()
    updateTransitsystem();

    majorRedesign = true;
    updateRing();
    majorRedesign = true;
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

  transitSystemObject.animate(
    timeSinceStart,
    tetheredRingRefCoordSys,
    camera.position.clone(),
    mainRingCurve,
    dParamWithUnits
  );

  const weAreFar1 =
    camera.position.length() >
    (radiusOfPlanet + crv.currentMainRingAltitude) * 1.1;
  if (weAreFar1 !== prevWeAreFar1) {
    if (weAreFar1) {
      // To improve rendering performance when zoomed out, make parts of the ring invisible
      starsMesh.visible = true;
      transitSystemMeshes.forEach((mesh) => {
        mesh.visible = false;
      });
      mainRingMeshes.forEach((mesh) => {
        mesh.visible = false;
      });
    } else {
      starsMesh.visible = false;
      transitSystemMeshes.forEach((mesh) => {
        mesh.visible = true;
      });
      mainRingMeshes.forEach((mesh) => {
        mesh.visible = true;
      });
    }
  }
  prevWeAreFar1 = weAreFar1;

  const weAreFar2 = camera.position.length() > radiusOfPlanet * 4;
  if (weAreFar2 !== prevWeAreFar2) {
    if (weAreFar2) {
      elevatorCableMeshes.forEach((mesh) => {
        mesh.visible = false;
      });
    } else {
      elevatorCableMeshes.forEach((mesh) => {
        mesh.visible = true;
      });
    }
  }
  prevWeAreFar2 = weAreFar2;

  if (console.userdata["capture"] == 1) {
    console.userdata["matrixAutoUpdateData"] = {};
    console.userdata["matrixWorldUpdateData"] = {};
  }

  if (!scene.autoUpdate) {
    // Performance improved less automatic version
    scene.selectivelyUpdateMatrixWorld();
  }

  if (renderToBuffer) {
    renderer.render(scene, camera, bufferTexture);
  } else {
    renderer.render(scene, camera);
  }
  if (capturer) {
    capturer.capture(renderer.domElement);
    //capturer.capture( bufferTexture );  // Doesn't work because bufferTexture doesn't support the toBlob method
  }

  //requestAnimationFrame(animate)
  //simContainer = document.querySelector('#simContainer')
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)
  //renderer.setViewport( 0, 0, simContainer.offsetWidth, simContainer.offsetHeight )
  orbitControls.enabled = false;
  TWEEN.update(timeSinceStart * 1000);
  if (followElevators) {
    const elevatorDistanceFromEarthsCenter =
      elevatorPosCalc.calculateElevatorPosition(timeSinceStart) +
      radiusOfPlanet +
      dParamWithUnits["transitTubeUpwardOffset"].value;
    camera.position
      .normalize()
      .multiplyScalar(elevatorDistanceFromEarthsCenter);
    orbitControls.target
      .normalize()
      .multiplyScalar(elevatorDistanceFromEarthsCenter);
  }
  if (followTransitVehicles) {
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(
      ringToPlanetRotation
    );
    const driftFactor = 0.99;
    const angle =
      (driftFactor *
        delta *
        dParamWithUnits["transitVehicleCruisingSpeed"].value) /
      crv.mainRingRadius;
    camera.position.applyAxisAngle(axis, angle);
    orbitControls.target.applyAxisAngle(axis, angle);
  }
  if (followLaunchVehicles > 0) {
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(
      ringToPlanetRotation
    );
    const driftFactor =
      1 +
      (followLaunchVehicles - 2) * 0.02 +
      Math.sin(timeSinceStart * 0.3) * 0.01 +
      Math.sin(timeSinceStart * 1) * 0.003;
    const angle =
      (driftFactor *
        delta *
        dParamWithUnits["launchVehicleCruisingSpeed"].value) /
      crv.mainRingRadius;
    camera.position.applyAxisAngle(axis, angle);
    orbitControls.target.applyAxisAngle(axis, angle);
  }
  orbitControls.enabled = true;
  orbitControls.update();

  if (console.userdata["capture"] == 1) {
    if (verbose) console.log(console.userdata);
    console.userdata["capture"] = 2;
  }

  //stats.update();
}

if (verbose) console.log("Adding resize event listener");
window.addEventListener("resize", onWindowResize);
function onWindowResize() {
  simContainer = document.querySelector("#simContainer");
  camera.aspect = simContainer.offsetWidth / simContainer.offsetHeight;
  camera.updateProjectionMatrix();
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)
  renderer.setSize(simContainer.offsetWidth, simContainer.offsetHeight);
  //console.log("resizing...", simContainer.offsetWidth, simContainer.offsetHeight)
}

if (verbose) console.log("Adding keydown event listener");
document.addEventListener("keydown", onKeyDown);

if (verbose) console.log("Adding mousemove event listener");
addEventListener("mousemove", (event) => {
  mouse.x = 2 * (event.clientX / simContainer.offsetWidth) - 1;
  mouse.y = 1 - 2 * (event.clientY / simContainer.offsetHeight);
});

if (verbose) console.log("Adding keydown event listener");
if (verbose) console.log("Adding VR button");
//document.body.appendChild( VRButton.createButton( renderer ) )

if (verbose) console.log("Calling animate");
animate();

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
    orbitControlsTargetUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(
      ringToPlanetRotation
    );
  } else {
    planetCoordSys.updateWorldMatrix(true);
    tetheredRingRefCoordSys.updateMatrixWorld(true);
    orbitControlsTargetUpVector = planetCoordSys
      .worldToLocal(orbitControlsTargetPoint.clone())
      .normalize();
    console.log("Setting target up vector", orbitControlsTargetUpVector);
  }
}

function onKeyDown(event) {
  // Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  //   v.value = guidParam[k]
  // })

  switch (event.keyCode) {
    case 79 /*O*/:
      orbitControls.target.set(0, 0, 0);
      orbitControls.rotateSpeed = 1;
      setOrbitControlsTargetUpVector();
      orbitControls.maxPolarAngle = Math.PI;
      orbitControlsNewMaxPolarAngle = Math.PI;
      //camera.up.set(0, 1, 0)
      break;
    case 73 /*I*/:
      orbitControls.target = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(ringToPlanetRotation)
        .multiplyScalar(crv.y0);
      orbitControls.rotateSpeed = 1;
      setOrbitControlsTargetUpVector();
      orbitControls.maxPolarAngle = Math.PI;
      orbitControlsNewMaxPolarAngle = Math.PI;
      //camera.up.set(0, 1, 0)
      break;
    case 80 /*P*/:
      raycaster.setFromCamera(mouse, camera);
      let planetIntersects = [];
      planetMeshes.forEach((mesh) => {
        planetIntersects.push.apply(
          planetIntersects,
          raycaster.intersectObject(mesh)
        );
      });
      let transitTubeIntersects = [];
      if (dParamWithUnits["showTransitSystem"].value) {
        tetheredRingRefCoordSys.children.forEach((mesh) => {
          if (mesh.name.length > 0) {
            console.log(mesh.name);
          }
          if (mesh.name === "transitTube") {
            transitTubeIntersects.push.apply(
              transitTubeIntersects,
              raycaster.intersectObject(mesh)
            );
          }
        });
      }
      if (transitTubeIntersects.length > 0) {
        intersectionPoint = transitTubeIntersects[0].point;
        targetPoint = intersectionPoint;
        extraDistanceForCamera = 100;
        orbitControls.rotateSpeed = 0.9;
      } else if (planetIntersects.length > 0) {
        // Note: would probably be advisable to assert here that there is only one intersection point.
        intersectionPoint = planetIntersects[0].point;
        // Because we want to orbit around a point at the altitude of the ring...
        targetPoint = intersectionPoint.multiplyScalar(
          (radiusOfPlanet +
            dParamWithUnits["pKeyAltitudeFactor"].value *
              crv.currentMainRingAltitude) /
            radiusOfPlanet
        );
        extraDistanceForCamera = 10000;
        orbitControls.rotateSpeed = 0.9;
        // Uncomment this line if you want to print lat, lon, and alt to console
        //console.log(tram.xyz2lla(intersectionPoint.x, intersectionPoint.y, intersectionPoint.z))
      }
      if (planetIntersects.length > 0 || transitTubeIntersects.length > 0) {
        orbitControlsTargetPoint.copy(targetPoint.clone());
        setOrbitControlsTargetUpVector();
        new TWEEN.Tween(orbitControls.target)
          .to(orbitControlsTargetPoint, 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start(timeSinceStart * 1000);
        new TWEEN.Tween(orbitControls.upDirection)
          .to(orbitControlsTargetUpVector, 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start(timeSinceStart * 1000);
        new TWEEN.Tween(camera.up)
          .to(orbitControlsTargetUpVector, 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start(timeSinceStart * 1000);
        // new TWEEN.Tween(orbitControlsUpVector)
        // .to(orbitControlsTargetUpVector, 1000)
        // .easing(TWEEN.Easing.Cubic.InOut)
        // .start(timeSinceStart*1000)

        camera.up.copy(orbitControlsUpVector.clone());
        orbitControls.upDirection.copy(orbitControlsUpVector.clone());

        // previousTargetPoint.copy(orbitControls.target.clone())
        // previousUpVector.copy(orbitControls.upDirection.clone())
        // orbitControlsTargetPoint.copy(targetPoint.clone())
        // orbitControlsTargetUpVector = planetCoordSys.worldToLocal(orbitControlsTargetPoint.clone()).normalize()
        // //console.log(orbitControlsTargetUpVector)
        // orbitControlsEarthRingLerpFactor = 0
        // orbitControlsEarthRingLerpSpeed = 1/32
        // orbitControlsNewMaxPolarAngle = Math.PI/2 + Math.PI/2
      }
      break;
    case 81 /*Q*/:
      orbitControls.autoRotate ^= true;
      orbitControls.rotateSpeed =
        dParamWithUnits["orbitControlsRotateSpeed"].value;
      break;
    // case 82: /*R*/
    //   dParamWithUnits['ringCenterLongitude'].value -= 0.1
    //   updateRing()
    //   break;
    // case 84: /*T*/
    //   dParamWithUnits['ringCenterLongitude'].value += 0.1
    //   updateRing()
    //   break;
    case 82 /*R*/:
      // Raise the Ring
      animateRingRaising = !animateRingRaising;
      animateRingLowering = false;
      break;
    case 76 /*L*/:
      // Lower the Ring
      animateRingRaising = false;
      animateRingLowering = !animateRingLowering;
      break;
    case 85 /*U*/:
      // Move the Camera Up
      cameraSpeed += 0.00000001;
      break;
    case 68 /*D*/:
      cameraSpeed -= 0.00000001;
      break;
    // case 67: /*C*/
    //   console.userdata['capture'] = 1
    //   break;
    case 84 /*T*/:
      // Toggle Display of the Tensile Force Arrows
      showTensileForceArrows = !showTensileForceArrows;
      gravityForceArrowsObject.update(
        dParamWithUnits,
        mainRingCurveControlPoints,
        mainRingCurve,
        crv,
        ctv,
        radiusOfPlanet,
        ringToPlanetRotation,
        showTensileForceArrows,
        showGravityForceArrows,
        showInertialForceArrows
      );
      //console.log(showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
      break;
    case 71 /*G*/:
      // Toggle Display of the Tensile Force Arrows
      showGravityForceArrows = !showGravityForceArrows;
      gravityForceArrowsObject.update(
        dParamWithUnits,
        mainRingCurveControlPoints,
        mainRingCurve,
        crv,
        ctv,
        radiusOfPlanet,
        ringToPlanetRotation,
        showTensileForceArrows,
        showGravityForceArrows,
        showInertialForceArrows
      );
      //console.log(showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
      break;
    case 73 /*I*/:
      // Toggle Display of the Tensile Force Arrows
      showInertialForceArrows = !showInertialForceArrows;
      gravityForceArrowsObject.update(
        dParamWithUnits,
        mainRingCurveControlPoints,
        mainRingCurve,
        crv,
        ctv,
        radiusOfPlanet,
        ringToPlanetRotation,
        showTensileForceArrows,
        showGravityForceArrows,
        showInertialForceArrows
      );
      //console.log(showTensileForceArrows, showGravityForceArrows, showInertialForceArrows)
      break;
    case 86 /*V*/:
      lockUpToRingAxis = !lockUpToRingAxis;
      break;
    case 89 /*Y*/:
      backgroundPatchMesh.lookAt(camera.position);
      break;
    case 87 /*W*/:
      // This executes and instantaneous "Warp" to a position much closer to the ring
      console.log(
        "\n\norbitControls.target.set(" +
          orbitControls.target.x +
          ", " +
          orbitControls.target.y +
          ", " +
          orbitControls.target.z +
          ")\norbitControls.upDirection.set(" +
          orbitControls.upDirection.x +
          ", " +
          orbitControls.upDirection.y +
          ", " +
          orbitControls.upDirection.z +
          ")\norbitControls.object.position.set(" +
          orbitControls.object.position.x +
          ", " +
          orbitControls.object.position.y +
          ", " +
          orbitControls.object.position.z +
          ")\ncamera.up.set(" +
          camera.up.x +
          ", " +
          camera.up.y +
          ", " +
          camera.up.z +
          ")\n"
      );

      orbitControls.maxPolarAngle = Math.PI / 2 + 0.1;
      orbitControlsNewMaxPolarAngle = Math.PI / 2 + Math.PI / 2;

      // Over Seattle
      // orbitControls.target.set(-3728615.36059678, 4702742.973959817, -2251613.4283880345)
      // orbitControls.upDirection.set(-0.5816870725007586, 0.7336570090212697, -0.3512656299717662)
      // orbitControls.object.position.set(-3728723.436685938, 4702649.491443358, -2251664.0418805806)
      // camera.up.set(-0.5816870725007586, 0.7336570090212697, -0.3512656299717662)

      // Near Launch Tube Exit
      // orbitControls.target.set(-959403.9186715716, -4131275.008171093, -4806261.304458168)
      // orbitControls.upDirection.set(-0.1496731133449664, -0.6445051771451986, -0.7498073324359138)
      // orbitControls.object.position.set(-963233.9251227962, -4135157.2251201035, -4802567.211628173)
      // camera.up.set(-0.1496731133449664, -0.6445051771451986, -0.7498073324359138)

      // Near Launch Tube Exit
      // orbitControls.target.set(33178.768367661774, -4117699.478692944, -4912389.51831872)
      // orbitControls.upDirection.set(0.005176093611151558, -0.642386653058475, -0.7663632272149147)
      // orbitControls.object.position.set(32229.08411921596, -4118140.307036758, -4912011.091366182)
      // camera.up.set(0.005176093611151558, -0.642386653058475, -0.7663632272149147)

      // Near Launch Tube Entrance
      // orbitControls.target.set(1647190.8829419166, -3683942.7903694445, -4980181.980788017)
      // orbitControls.upDirection.set(0.2569764437820993, -0.5747394570336154, -0.7769412229183174)
      // orbitControls.object.position.set(1647910.788732048, -3683797.352299046, -4980117.875703896)
      // camera.up.set(0.2569764437820993, -0.5747394570336154, -0.7769412229183174)

      // Over Russia
      orbitControls.target.set(
        2658955.8695003525,
        5083161.091401661,
        -2859960.6445000893
      );
      orbitControls.upDirection.set(
        0.41481475047657973,
        0.7930065109804368,
        -0.44617193583828985
      );
      orbitControls.object.position.set(
        2658928.67289732,
        5083188.169494178,
        -2860038.5902062203
      );
      camera.up.set(
        0.41481475047657973,
        0.7930065109804368,
        -0.44617193583828985
      );

      orbitControlsTargetPoint.copy(orbitControls.target.clone());
      setOrbitControlsTargetUpVector();
      orbitControlsUpVector.copy(orbitControlsTargetUpVector.clone());

      // orbitControls.target.set(-3763210.8232434946, 4673319.5670904, -2255256.723306473)
      // orbitControls.upDirection.set(-0.5870824578788134, 0.7290700269983701, -0.351839570519814)
      // orbitControls.object.position.set(-3764246.447379286, 4672428.630481427, -2255483.089866906)
      // camera.up.set(-0.5870824578788134, 0.7290700269983701, -0.351839570519814)

      toRingAlreadyTriggered = true;
      toPlanetAlreadyTriggered = false;
      orbitControlsTargetPoint.copy(orbitControls.target.clone());
      orbitControlsTargetUpVector.copy(orbitControls.upDirection.clone());
      orbitControls.update();
      // guidParamWithUnits['numForkLevels'].value = 8
      // for (var i in gui.__controllers) {
      //   gui.__controllers[i].updateDisplay()
      // }
      // updatedParam()
      // updateRing()
      break;
    case 88 /*X*/:
      animateZoomingIn = false;
      animateZoomingOut = !animateZoomingOut;
      break;
    case 90 /*Z*/:
      animateZoomingIn = !animateZoomingIn;
      animateZoomingOut = false;
      break;
    case 83 /*S*/:
      genSpecs = true;
      updateRing();
      genSpecs = false;
      break;
    case 72 /*H*/:
      // Sweep a parameter to generate data for a graph
      if (true) {
        const sweptParameter = "ringFinalAltitude";
        const backup = guidParamWithUnits[sweptParameter].value;
        genSpecs = true;
        for (let sweptValue = 1000; sweptValue <= 100000; sweptValue += 1000) {
          guidParamWithUnits[sweptParameter].value = sweptValue;
          Object.entries(guidParamWithUnits).forEach(([k, v]) => {
            guidParam[k] = v.value;
          });
          updateRing();
          console.log(sweptValue, specs["capitalCostPerKgSupported"].value);
        }
        guidParamWithUnits[sweptParameter].value = backup;
        updateRing();
        genSpecs = false;
      }
      break;
    case 70 /*F*/:
      // This is a utility function that conveniently loads presets for someone who is actively editing the code.
      console.log("Applying Illustration Settings");
      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        v.value = guidParam[k];
      });
      switch (guidParamWithUnits["parameterPresetNumber"].value) {
        case 0:
          //orbitControls.upDirection.set(-0.5517139461741912, -0.33633743039380865, -0.7632095744374486)
          //guidParamWithUnits['ringFinalAltitude'].value = 200000  // m
          //guidParamWithUnits['equivalentLatitude'].value = Math.acos(targetRadius/(radiusOfPlanet + guidParamWithUnits['ringFinalAltitude'].value)) * 180 / Math.PI
          //guidParamWithUnits['ringAmountRaisedFactor'].value = 0.01
          //guidParamWithUnits['numMainRings'].value = 1
          guidParamWithUnits["numTethers"].value = 3600;
          guidParamWithUnits["numForkLevels"].value = 10;
          //guidParamWithUnits['tetherSpanOverlapFactor'].value = 1
          //guidParamWithUnits['tetherPointBxAvePercent'].value = 0.8
          //guidParamWithUnits['tetherPointBxDeltaPercent'].value = 0
          //guidParamWithUnits['tetherEngineeringFactor'].value = 0.5
          //guidParamWithUnits['numElevatorCables'].value = 180
          //guidParamWithUnits['moveRing'].value = 0

          guidParamWithUnits["showEarthsSurface"].value = false;
          guidParamWithUnits["showEarthsAtmosphere"].value = false;
          //guidParamWithUnits['showMainRingCurve'].value = false
          //guidParamWithUnits['showMainRings'].value = true
          //guidParamWithUnits['showTethers'].value = true
          //guidParamWithUnits['showTransitSystem'].value = false
          //guidParamWithUnits['showTransitTube'].value = false
          //guidParamWithUnits['showTransitVehicles'].value = false
          //guidParamWithUnits['showRingTerminuses'].value = false
          guidParamWithUnits["showGroundTerminuses"].value = true;
          //guidParamWithUnits['showElevatorCables'].value = false
          //guidParamWithUnits['showElevatorCars'].value = false
          //guidParamWithUnits['showHabitats'].value = false
          //guidParamWithUnits['showLaunchOrbit'].value = false
          //guidParamWithUnits['showLaunchTrajectory'].value = false
          guidParamWithUnits["showLaunchTube"].value = false;
          guidParamWithUnits["showLaunchVehicles"].value = false;
          //guidParamWithUnits['showLaunchVehiclePointLight'].value = false
          guidParamWithUnits["cableVisibility"].value = 0.4;
          guidParamWithUnits["tetherVisibility"].value = 0.4;

          //guidParamWithUnits['pKeyAltitudeFactor'].value = 0
          break;
        case 1:
          //orbitControls.upDirection.set(-0.5517139461741912, -0.33633743039380865, -0.7632095744374486)
          guidParamWithUnits["ringFinalAltitude"].value = 100000; // m
          guidParamWithUnits["moveRing"].value = 1;
          guidParamWithUnits["equivalentLatitude"].value =
            (Math.acos(
              targetRadius /
                (radiusOfPlanet + guidParamWithUnits["ringFinalAltitude"].value)
            ) *
              180) /
            Math.PI;
          guidParamWithUnits["ringAmountRaisedFactor"].value = 0.01;
          guidParamWithUnits["numMainRings"].value = 1;
          guidParamWithUnits["numTethers"].value = 360;
          guidParamWithUnits["numForkLevels"].value = 4;
          guidParamWithUnits["tetherSpanOverlapFactor"].value = 1;
          guidParamWithUnits["tetherPointBxAvePercent"].value = 0.8;
          guidParamWithUnits["tetherPointBxDeltaPercent"].value = 0;
          guidParamWithUnits["tetherEngineeringFactor"].value = 0.6;
          //guidParamWithUnits['numElevatorCables'].value = 180
          guidParamWithUnits["moveRing"].value = 0;
          // guidParamWithUnits['cableVisibility'].value = 0.1
          guidParamWithUnits["tetherVisibility"].value = 0.8;
          guidParamWithUnits["showMainRingCurve"].value = false;
          guidParamWithUnits["showMainRings"].value = false;
          guidParamWithUnits["showTethers"].value = true;
          guidParamWithUnits["showTransitSystem"].value = false;
          guidParamWithUnits["showTransitTube"].value = false;
          guidParamWithUnits["showTransitVehicles"].value = false;
          guidParamWithUnits["showRingTerminuses"].value = false;
          guidParamWithUnits["showGroundTerminuses"].value = false;
          guidParamWithUnits["showElevatorCables"].value = false;
          guidParamWithUnits["showElevatorCars"].value = false;
          guidParamWithUnits["showHabitats"].value = false;
          guidParamWithUnits["showLaunchOrbit"].value = false;
          guidParamWithUnits["showLaunchTrajectory"].value = false;
          guidParamWithUnits["showLaunchTube"].value = false;
          guidParamWithUnits["showLaunchVehicles"].value = false;
          guidParamWithUnits["animateTransitVehicles"].value = false;
          guidParamWithUnits["animateElevatorCars"].value = false;
          guidParamWithUnits["animateLaunchVehicles"].value = false;
          break;
      }
      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        guidParam[k] = v.value;
      });
      gui.children.forEach((folder) => {
        if (folder.controllers) {
          folder.controllers.forEach((control) => {
            control.updateDisplay();
          });
        }
      });

      adjustEarthSurfaceVisibility();
      adjustEarthAtmosphereVisibility();
      adjustRingDesign();
      adjustCableOpacity();
      adjustTetherOpacity();
      updateTransitsystem();
      adjustRingLatLon();
      majorRedesign = true;
      updateRing();
      majorRedesign = true;

      break;
    case 65 /*A*/:
      // const recordEverything = (keyFrames.length == 0)
      // if (!recordEverything) {
      //   // Create a reference to the previous keyframe
      //   previousKeyFrame = keyFrames[keyFrames.length - 1]
      // }
      // Flesh out the basic heirarchy of a keyframe
      const keyFrame = {};
      keyFrame["guidParamWithUnits"] = {};
      keyFrame["orbitControls"] = {};
      keyFrame["orbitControls"]["object"] = {};
      keyFrame["camera"] = {};
      // Record the state of guidParamsWithUnits
      Object.entries(guidParamWithUnits).forEach(([k, v]) => {
        if (v.tweenable) {
          keyFrame["guidParamWithUnits"][k] = {
            tween: true,
            param: "guidParam",
            key: k,
            value: v.value,
            updateFunction: v.updateFunction,
          };
        }
      });
      // Record the current state of the orbit controls and camera
      keyFrame["orbitControls"]["target"] = {
        tween: true,
        param: "orbitControls.target",
        value: orbitControls.target.clone(),
      };
      keyFrame["orbitControls"]["upDirection"] = {
        tween: true,
        param: "orbitControls.upDirection",
        value: orbitControls.upDirection.clone(),
      };
      keyFrame["orbitControls"]["object"]["position"] = {
        tween: true,
        param: "orbitControls.object.position",
        value: orbitControls.object.position.clone(),
      };
      keyFrame["camera"]["up"] = {
        tween: true,
        param: "camera.up",
        value: camera.up.clone(),
      };
      keyFrames.push(keyFrame);
      break;
    case 75 /*K*/:
      // Erase the last keyFrame
      if (keyFrames.length > 0) {
        const lastKeyframe = keyFrames.pop();
        // ToDo: We could attempt to dispose of the objects in the last keyfram, but we'll let garbage cleanup deal with that for now
      }
      break;
    case 66 /*B*/:
      // Animation Sequence Playback
      // Restore all parameters  to the initia state
      keyFrameDelay = 0;
      let orbitControlsTargetTweeners = [];
      let orbitControlsUpDirectionTweeners = [];
      let orbitControlsObjectPositionTweeners = [];
      let cameraUpTweeners = [];
      keyFrames.forEach((keyFrame, index) => {
        const firstKeyFrame = index == 0;
        if (!firstKeyFrame) {
          // Create a reference to the previous keyframe
          previousKeyFrame = keyFrames[index - 1];
        }
        // Traverse the keyFrame and restore the values of the tweenable parameters
        const elements = {
          guidParam: keyFrame["guidParamWithUnits"],
          orbitControls_target: keyFrame["orbitControls"]["target"],
          orbitControls_upDirection: keyFrame["orbitControls"]["upDirection"],
          orbitControls_object_position:
            keyFrame["orbitControls"]["object"]["position"],
          camera_up: keyFrame["camera"]["up"],
        };
        Object.entries(elements).forEach(([k, v]) => {
          // Test Code: const element = {tween: true, param: 'guidParam', key: 'tetherVisibility', value: 1, updateFunction: adjustTetherOpacity}
          switch (k) {
            case "guidParam":
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
              break;
            case "orbitControls_target":
              if (firstKeyFrame) {
                orbitControlsTargetTweeners.push(
                  new TWEEN.Tween(orbitControls.target)
                    .to(v.value, 1000)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .start(timeSinceStart * 1000)
                );
              } else if (
                !orbitControls.target.equals(
                  previousKeyFrame["orbitControls"]["target"]
                )
              ) {
                orbitControlsTargetTweeners.push(
                  new TWEEN.Tween(orbitControls.target)
                    .to(v.value, guidParamWithUnits["tweeningDuration"].value)
                    .easing(TWEEN.Easing.Cubic.InOut)
                );
                const l = orbitControlsTargetTweeners.length;
                orbitControlsTargetTweeners[l - 2].chain(
                  orbitControlsTargetTweeners[l - 1]
                );
              }
              break;
            case "orbitControls_upDirection":
              if (firstKeyFrame) {
                orbitControlsUpDirectionTweeners.push(
                  new TWEEN.Tween(orbitControls.upDirection)
                    .to(v.value, 1000)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .start(timeSinceStart * 1000)
                );
              } else if (
                !orbitControls.upDirection.equals(
                  previousKeyFrame["orbitControls"]["upDirection"]
                )
              ) {
                orbitControlsUpDirectionTweeners.push(
                  new TWEEN.Tween(orbitControls.upDirection)
                    .to(v.value, guidParamWithUnits["tweeningDuration"].value)
                    .easing(TWEEN.Easing.Cubic.InOut)
                );
                const l = orbitControlsUpDirectionTweeners.length;
                orbitControlsUpDirectionTweeners[l - 2].chain(
                  orbitControlsUpDirectionTweeners[l - 1]
                );
              }
              break;
            case "orbitControls_object_position":
              if (firstKeyFrame) {
                orbitControlsObjectPositionTweeners.push(
                  new TWEEN.Tween(orbitControls.object.position)
                    .to(v.value, 1000)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .start(timeSinceStart * 1000)
                );
              } else if (
                !orbitControls.object.position.equals(
                  previousKeyFrame["orbitControls"]["object"]["position"]
                )
              ) {
                orbitControlsObjectPositionTweeners.push(
                  new TWEEN.Tween(orbitControls.object.position)
                    .to(v.value, guidParamWithUnits["tweeningDuration"].value)
                    .easing(TWEEN.Easing.Cubic.InOut)
                );
                const l = orbitControlsObjectPositionTweeners.length;
                orbitControlsObjectPositionTweeners[l - 2].chain(
                  orbitControlsObjectPositionTweeners[l - 1]
                );
              }
              break;
            case "camera_up":
              if (firstKeyFrame) {
                cameraUpTweeners.push(
                  new TWEEN.Tween(camera.up)
                    .to(v.value, 1000)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .start(timeSinceStart * 1000)
                );
              } else if (!camera.up.equals(previousKeyFrame["camera"]["up"])) {
                cameraUpTweeners.push(
                  new TWEEN.Tween(camera.up)
                    .to(v.value, guidParamWithUnits["tweeningDuration"].value)
                    .easing(TWEEN.Easing.Cubic.InOut)
                );
                const l = cameraUpTweeners.length;
                cameraUpTweeners[l - 2].chain(cameraUpTweeners[l - 1]);
              }
              break;
          }
        });
        keyFrameDelay += guidParamWithUnits["tweeningDuration"].value * 2;
      });
      break;
    case 69 /*E*/:
      followElevators = !followElevators;
      break;
    case 67 /*C*/:
      followTransitVehicles = !followTransitVehicles;
      break;
    case 74 /*J*/:
      followLaunchVehicles = (followLaunchVehicles + 3) % 4;
      break;
  }
}

function orbitControlsEventHandler() {
  //if (verbose) console.log("recomputing near/far")
  recomputeNearFarClippingPlanes();
  //if (verbose) console.log("auto-adjusting orbit target")

  //Hack
  //autoAdjustOrbitControlsCenter()
}

function recomputeNearFarClippingPlanes() {
  // Calculate the distance to the nearest object - for this we will use the sphere encompassing the Earth and it's stratosphere
  // Multiply that by the cosine of thecamera's fulstrum angle
  // Note: Assumes the planet is centered on the origin!!!
  camera.near =
    Math.max(
      10,
      camera.position.length() -
        (radiusOfPlanet +
          dParamWithUnits["ringFinalAltitude"].value +
          extraDistanceForCamera)
    ) * Math.cos((camera.getEffectiveFOV() * Math.PI) / 180);
  // camera.near = Math.max(10, camera.position.distanceTo(planetMeshes[0].position) - (radiusOfPlanet+dParamWithUnits['ringFinalAltitude'].value+extraDistanceForCamera)) * Math.cos(camera.getEffectiveFOV()*Math.PI/180)
  // Far calculation: Use the pythagorean theorm to compute distance to the Earth's horizon,
  // then add the distrance from there to the edge of the sphere that represents the atmosphere,
  // then pad this sum by a factor of 1.5
  const d1Squared = camera.position.length() ** 2 - radiusOfPlanet ** 2;
  //const d1Squared = camera.position.distanceTo(planetMeshes[0].position)**2 - radiusOfPlanet**2
  const d2Squared = (radiusOfPlanet * 1.1) ** 2 - radiusOfPlanet ** 2;
  let d1, d2;
  if (d1Squared > 0) {
    d1 = Math.sqrt(d1Squared);
  } else {
    d1 = 0;
  }
  if (d2Squared > 0) {
    d2 = Math.sqrt(d2Squared);
  } else {
    d2 = 0;
  }
  camera.far = Math.max(camera.near * 16384, (d1 + d2) * 1.5);

  // Hack
  if (enableVR) {
    camera.near = 0.0001 * radiusOfPlanet;
    camera.far = 1 * radiusOfPlanet;
  }
  //console.log(camera.near, camera.near*16384, (d1+d2)*1.5, camera.far, 2)
  camera.updateProjectionMatrix();
  nearClippingPlane = camera.near;
  farClippingPlane = camera.far;
}

let previousUpVector = new THREE.Vector3(0, 1, 0);
let orbitControlsUpVector = new THREE.Vector3(0, 1, 0);
let lockUpToRingAxis = false;
let orbitControlsTargetUpVector = new THREE.Vector3(0, 1, 0);
let previousTargetPoint = new THREE.Vector3(0, 0, 0);
let orbitControlsTargetPoint = new THREE.Vector3(0, 0, 0);
let toRingAlreadyTriggered = false;
let toPlanetAlreadyTriggered = true;
let orbitControlsEarthRingLerpFactor = 1; // When 1, this indicates no tweening is in progress
let orbitControlsEarthRingLerpSpeed;
let orbitControlsNewMaxPolarAngle = Math.PI;

function autoAdjustOrbitControlsCenter() {
  const distanceToCenterOfEarth = camera.position.length();
  const innerTransitionDistance = radiusOfPlanet + 1000000;
  const outerTransitionDistance = radiusOfPlanet + 2000000;
  if (distanceToCenterOfEarth > outerTransitionDistance) {
    toRingAlreadyTriggered = false; // Reset the trigger
    if (!toPlanetAlreadyTriggered) {
      //previousTargetPoint.copy(orbitControlsTargetPoint.clone())
      //previousUpVector.copy(orbitControlsTargetUpVector.clone())
      previousTargetPoint.copy(orbitControls.target.clone());
      previousUpVector.copy(orbitControls.upDirection.clone());
      orbitControlsTargetPoint.set(0, 0, 0);
      // ToDo: Need to find the nearest point on the ring to the orbitControlsSurfaceMarker and set orbitControlsTargetPoint to that
      orbitControlsTargetUpVector.set(0, 1, 0);
      orbitControlsEarthRingLerpFactor = 0;
      orbitControlsEarthRingLerpSpeed = 1 / 256;
      orbitControls.maxPolarAngle = Math.PI;
      orbitControlsNewMaxPolarAngle = Math.PI;
      orbitControls.rotateSpeed = 1;
      //orbitControlsSurfaceMarker.visible = false
      toPlanetAlreadyTriggered = true;
    }
  }
  //else if ((distanceToCenterOfEarth>innerTransitionDistance) && (distanceToCenterOfEarth<outerTransitionDistance)) {
  //const pointAboveEarthsSurface = pointOnEarthsSurface.clone().multiplyScalar((radiusOfPlanet + crv.currentMainRingAltitude)/radiusOfPlanet)
  //orbitControlsSurfaceMarker.position.copy(pointAboveEarthsSurface)
  //orbitControlsSurfaceMarker.visible = true
  //}
  else if (distanceToCenterOfEarth <= innerTransitionDistance) {
    if (!toRingAlreadyTriggered) {
      const screenCenter = new THREE.Vector2(0, 0); // The center of the screen is, by definition, (0,0)
      raycaster.setFromCamera(screenCenter, camera);
      if (verbose) console.log("raycasting");
      const planetIntersects = [];
      planetMeshes.forEach((mesh) => {
        planetIntersects.push.apply(
          planetIntersects,
          raycaster.intersectObject(mesh)
        );
      });
      if (planetIntersects.length > 0) {
        const pointOnEarthsSurface = planetIntersects[0].point;
        // Second criteria is that we're sufficiently close to the point that the user wants to zoom into, even if they are zooming in at an oblique angle.
        const distanceToPointOnEarthsSurface = pointOnEarthsSurface
          .clone()
          .sub(camera.position)
          .length();
        if (distanceToPointOnEarthsSurface < innerTransitionDistance) {
          //previousTargetPoint.copy(orbitControlsTargetPoint.clone())
          //previousUpVector.copy(orbitControlsTargetUpVector.clone())
          previousTargetPoint.copy(orbitControls.target.clone());
          previousUpVector.copy(orbitControls.upDirection.clone());
          // ToDo: Need to find the nearest point on the ring to the orbitControlsSurfaceMarker and set orbitControlsTargetPoint to that
          // Convert pointOnEarthsSurface into tetheredRingRefCoordSys
          const localPoint = tetheredRingRefCoordSys
            .worldToLocal(pointOnEarthsSurface.clone())
            .normalize();
          // Then compute it's theta value and convert it to a 0 to 1 value
          const originalTheta =
            (Math.atan2(localPoint.z, localPoint.x) / (2 * Math.PI) + 1) % 1;
          // Round theta to align it with the position of an elevator cable
          const numGoodSpots =
            dParamWithUnits["numVirtualRingTerminuses"].value;
          const roundedTheta =
            (Math.round(originalTheta * numGoodSpots) / numGoodSpots) *
            Math.PI *
            2;
          // Then find a point on the ring with the same theta value
          const transitTube_r =
            crv.mainRingRadius +
            tram.offset_r(
              dParamWithUnits["transitTubeOutwardOffset"].value,
              dParamWithUnits["transitTubeUpwardOffset"].value,
              crv.currentEquivalentLatitude
            );
          const transitTube_y =
            crv.yc +
            tram.offset_y(
              dParamWithUnits["transitTubeOutwardOffset"].value,
              dParamWithUnits["transitTubeUpwardOffset"].value,
              crv.currentEquivalentLatitude
            );
          localPoint.set(
            transitTube_r * Math.cos(roundedTheta),
            transitTube_y,
            transitTube_r * Math.sin(roundedTheta)
          );
          // Convert that point back into planetCoordSys
          const worldPoint = tetheredRingRefCoordSys.localToWorld(
            localPoint.clone()
          );
          //orbitControlsCenterMarker.position.copy(worldPoint.clone())
          orbitControlsTargetPoint.copy(worldPoint.clone());
          orbitControlsTargetUpVector = planetCoordSys
            .worldToLocal(worldPoint.clone())
            .normalize();
          orbitControlsEarthRingLerpFactor = 0;
          orbitControlsEarthRingLerpSpeed = 1 / 256;
          orbitControlsNewMaxPolarAngle = Math.PI / 2 + Math.PI / 2;
          orbitControls.rotateSpeed = 0.9;
          //orbitControlsSurfaceMarker.visible = false
          toRingAlreadyTriggered = true;
        }
      }
    }
    toPlanetAlreadyTriggered = false; // Reset trigger
  }
}

if (enableKMLFileFeature) {
  // This code creates the button that downloads a .kml file which can be displayed using
  // Google Earth's "Create Project" button, followed by "Import KML file from computer"
  var textFile = null;
  var makeTextFile = function () {
    genKMLFile = true;
    const prevFastTetherRender = fastTetherRender;
    fastTetherRender = false; // Can't generate a KML file when using the fast tether rendering technique
    kmlFile = "";
    kmlFile = kmlutils.kmlFileHeader;
    updateRing();
    genKMLFile = false;
    fastTetherRender = prevFastTetherRender;
    var data = new Blob([kmlFile], { type: "text/plain" });
    // If we are replacing a previously generated file we need to manually revoke the object URL to avoid memory leaks.
    if (textFile !== null) {
      window.URL.revokeObjectURL(textFile);
    }
    textFile = window.URL.createObjectURL(data);
    return textFile;
  };

  var createkml = document.getElementById("createkml");

  createkml.addEventListener(
    "click",
    function () {
      var link = document.createElement("a");
      link.setAttribute("download", "tethered_ring.kml");
      link.href = makeTextFile();
      document.body.appendChild(link);

      // wait for the link to be added to the document
      window.requestAnimationFrame(function () {
        var event = new MouseEvent("click");
        link.dispatchEvent(event);
        document.body.removeChild(link);
      });
    },
    false
  );
}

if (enableSpecsFileFeature) {
  // This code creates the button that downloads a .csv file which can be loadd into Excel
  var textFile = null;
  var makeTextFile = function () {
    genSpecs = true;
    genSpecsFile = true;
    const prevFastTetherRender = fastTetherRender;
    specsFile = "";
    updateRing();
    genSpecs = false;
    genSpecsFile = false;
    fastTetherRender = prevFastTetherRender;
    var data = new Blob([specsFile], { type: "text/plain" });
    // If we are replacing a previously generated file we need to manually revoke the object URL to avoid memory leaks.
    if (textFile !== null) {
      window.URL.revokeObjectURL(textFile);
    }
    textFile = window.URL.createObjectURL(data);
    return textFile;
  };

  var createSpecs = document.getElementById("createSpecs");

  createSpecs.addEventListener(
    "click",
    function () {
      var link = document.createElement("a");
      link.setAttribute("download", "tethered_ring.csv");
      link.href = makeTextFile();
      document.body.appendChild(link);

      // wait for the link to be added to the document
      window.requestAnimationFrame(function () {
        var event = new MouseEvent("click");
        link.dispatchEvent(event);
        document.body.removeChild(link);
      });
    },
    false
  );
}

// Synchronized Frame Capture
var sCB = document.getElementById("start-capturing-button"),
  dVB = document.getElementById("download-video-button"),
  progress = document.getElementById("progress");

sCB.addEventListener(
  "click",
  function (e) {
    var framerate = document.querySelector(
      'input[name="framerate"]:checked'
    ).value;

    capturer = new CCapture({
      verbose: false,
      display: true,
      framerate: framerate,
      motionBlurFrames:
        (960 / framerate) *
        (document.querySelector('input[name="motion-blur"]').checked ? 1 : 0),
      quality: 100,
      format: document.querySelector('input[name="encoder"]:checked').value,
      workersPath: "./ccapture_workers/",
      timeLimit: 60, // This is just to help prevent the feature from accidentally filling up the hard drve
      frameLimit: 1200,
      autoSaveTime: 1,
      onProgress: function (p) {
        progress.style.width = p * 100 + "%";
      },
    });

    capturer.start();
    this.style.display = "none";
    dVB.style.display = "block";
    e.preventDefault();
  },
  false
);

dVB.addEventListener(
  "click",
  function (e) {
    capturer.stop();
    this.style.display = "none";
    //this.setAttribute( 'href',  );
    console.log(capturer, "Saving...");
    capturer.save();
    sCB.style.display = "block";
  },
  false
);
