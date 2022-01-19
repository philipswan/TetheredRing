import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
//import { GUI } from '../three.js/examples/jsm/libs/lil-gui.module.min.js'
import { GUI } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/libs/dat.gui.module'
//import { VRButton } from '../three.js/examples/jsm/webxr/VRButton.js'
//import Stats from '/jsm/libs/stats.module.js'
// import vertexShader from './shaders/vertex.glsl'
// import fragmentShader from './shaders/fragment.glsl'
// import atmosphereVertexShader from './shaders/atmosphereVertex.glsl'
// import atmosphereFragmentShader from './shaders/atmosphereFragment.glsl'
import Stats from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/libs/stats.module.js'
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/OBJLoader.js'
//import { LineMaterial } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/lines/LineMaterial.js'
import { VRButton } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/webxr/VRButton.js'
import * as kmlutils from './kmlutils.js'
import * as launcher from './launcher.js'
//import * as THREE from '../three.js'
//import { OrbitControls } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/OrbitControls.js'
//import { OrbitControls } from '../three.js/examples/jsm/controls/OrbitControls.js'
import { OrbitControls } from './OrbitControlsModified.js'
import { makePlanetTexture } from './planetTexture.js'
//import * as dat from 'dat.gui'
import * as tram from './tram.js'
import { mainRingTubeGeometry, transitTrackGeometry, transitTubeGeometry } from './TransitTrack.js'


const enableVR = false
const enableKMLFileFeature = true
const enableSpecsFileFeature = true
let genKMLFile = false
let genSpecsFile = false
let fastTetherRender = true   // Fast render also uses the jitter reduction technique of creating a mesh with coordinates relative to a point near the ring, and then setting these mesh positions near the ring as well. However, this technique generates coordinates that are not useful for kml file generation.
const majorRedesign = true // False enables work in progress...

// Useful constants that we never plan to change
const gravitationalConstant = 0.0000000000667408
const idealGasConstant = 8314.5 // Joules/kgmole-K
const massOfPlanet = 5.97E+24   // kg   using mass of Earth for now
const radiusOfPlanet = 6378100 // m   using radius of Earth for now
const WGS84FlattenningFactor = 298.257223563    // Used to specify the exact shape of earth, which is approximately an oblate spheroid
const lengthOfSiderealDay = 86164.0905 // seconds    using value for Earth for now

const gui = new GUI()
const folderGeography = gui.addFolder('Location (V6)')
const folderEngineering = gui.addFolder('Engineering')
const folderEconomics = gui.addFolder('Economics')
const folderRendering = gui.addFolder('Rendering')

const targetRadius = 32800000 / Math.PI / 2   // 32800 km is the max size a perfectly circular ring can be and still fits within the Pacific Ocean
const equivalentLatitudePreset = Math.acos(targetRadius / (radiusOfPlanet + 32000)) * 180 / Math.PI
// Constants controlled by sliders
const guidParamWithUnits = {
  //equivalentLatitude: 35.473512807508094,
  // Alternate location with the increased diameter needed to reach both US and China's coastlines (note: too large to construct in the Pacific Ocean)
  //equivalentLatitude: 30.8,
  //ringCenterLongitude: 182,
  //ringCenterLatitude: 11,
  //ringFinalAltitude: 32000,  // m
  equivalentLatitude: { value: equivalentLatitudePreset, units: "degrees", autoMap: false, min: 10, max: 80, updateFunction: adjustRingDesign, folder: folderGeography },
  // Final Location
  buildLocationRingCenterLongitude: { value: 213.7, units: "degrees", autoMap: false, min: 0, max: 360, updateFunction: adjustRingLatLon, folder: folderGeography },
  finalLocationRingCenterLongitude: { value: 186.3, units: "degrees", autoMap: false, min: 0, max: 360, updateFunction: adjustRingLatLon, folder: folderGeography },
  buildLocationRingCenterLatitude: { value: -19.2, units: "degrees", autoMap: false, min: -90, max: 90, updateFunction: adjustRingLatLon, folder: folderGeography },
  finalLocationRingCenterLatitude: { value: 14.2, units: "degrees", autoMap: false, min: -90, max: 90, updateFunction: adjustRingLatLon, folder: folderGeography },
  // Build location (assumes equivalentLatitude = 35)
  buildLocationRingEccentricity: { value: 1, units: "", autoMap: false, min: 0.97, max: 1.03, step: 0.001, updateFunction: adjustRingDesign, folder: folderGeography },
  finalLocationRingEccentricity: { value: 1, units: "", autoMap: false, min: 0.97, max: 1.03, step: 0.001, updateFunction: adjustRingDesign, folder: folderGeography },
  // ToDo: moveRing needs to call adjustRingDesign when buildLocationRingEccentricity differs from finalLocationRingEccentricity
  moveRing: { value: 1, units: "", autoMap: false, min: 0, max: 1, updateFunction: adjustRingLatLon, folder: folderGeography },

  // Engineering Parameters - Ring
  ringFinalAltitude: { value: 32000, units: "m", autoMap: true, min: 0, max: 200000, updateFunction: adjustRingDesign, folder: folderEngineering },
  ringAmountRaisedFactor: { value: 1, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  numControlPoints: { value: 256, units: '', autoMap: true, min: 4, max: 1024, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  numMainRings: { value: 5, units: "", autoMap: true, min: 1, max: 7, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  mainRingTubeRadius: { value: 0.5, units: "m", autoMap: true, min: .1, max: 5, updateFunction: adjustRingDesign, folder: folderEngineering },
  mainRingSpacing: { value: 10, units: "m", autoMap: true, min: 0, max: 30, updateFunction: adjustRingDesign, folder: folderEngineering },
  massPerMeterOfRing: { value: 100, units: "kg", autoMap: true, min: 1, max: 1000, updateFunction: adjustRingDesign, folder: folderEngineering },

  // Engineering Parameters - Tethers
  numTethers: { value: 2048, units: "", autoMap: true, min: 4, max: 7200, step: 2, updateFunction: adjustRingDesign, folder: folderEngineering },
  numForkLevels: { value: 5, units: "", autoMap: true, min: 0, max: 8, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering },       // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from base to a single attachment point)
  tetherSpanOverlapFactor: { value: 2, units: "%", autoMap: true, min: 0.5, max: 4, updateFunction: adjustRingDesign, folder: folderEngineering },
  tetherPointBxAvePercent: { value: 50, units: "%", autoMap: true, min: 0, max: 100, updateFunction: adjustRingDesign, folder: folderEngineering },
  tetherPointBxDeltaPercent: { value: 40, units: "%", autoMap: true, min: 0, max: 50, updateFunction: adjustRingDesign, folder: folderEngineering },
  tetherMaterialDensity: { value: 1790, units: "kg*m-3", autoMap: true, min: 10, max: 20000, updateFunction: adjustRingDesign, folder: folderEngineering },        // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherMaterialTensileStrength: { value: 7000, units: "MPa", autoMap: true, min: 10, max: 100000, updateFunction: adjustRingDesign, folder: folderEngineering },   // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherMaterialCost: { value: 21.5, units: "USD/kg", autoMap: true, min: .01, max: 1000, updateFunction: adjustRingDesign, folder: folderEngineering },           // Note: Probably not accurate for Toray1100GC
  tetherEngineeringFactor: { value: 2, units: "", autoMap: true, min: 0.1, max: 10, updateFunction: adjustRingDesign, folder: folderEngineering },

  // Engineering Parameters - Elevators
  numElevatorCables: { value: 1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  numElevatorCars: { value: 1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  additionalUpperElevatorCable: { value: 10, units: 'm', autoMap: true, min: 0, max: 50, updateFunction: adjustRingDesign, folder: folderEngineering },
  elevatorUpperTerminusOutwardOffset: { value: -30, units: 'm', autoMap: true, min: -100, max: 0, updateFunction: adjustRingDesign, folder: folderEngineering },

  // Engineering Parameters - Transit System
  transitTubeUpwardOffset: { value: -100, units: "m", autoMap: true, min: -1000, max: 0, updateFunction: adjustRingDesign, folder: folderEngineering },
  numTransitTrackLevels: { value: 2, units: "", autoMap: true, min: 1, max: 3, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitTubeOutwardOffset: { value: -10, units: 'm', autoMap: true, min: -100, max: 0, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitTubeTubeRadius: { value: 6, units: 'm', autoMap: true, min: 1, max: 20, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitTubeInteriorPressure: { value: 10, units: 'Pa', autoMap: true, min: .1, max: 1000, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitTubeInteriorGasMolecularWeight: { value: 29, units: 'kg/kgmole', autoMap: true, min: 1, max: 100, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitTubeInteriorTemperature: { value: 20, units: 'C', autoMap: true, min: 0, max: 40, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitTrackCost: { value: 18000, units: "USD/m", autoMap: true, min: 1, max: 30000, updateFunction: adjustRingDesign, folder: folderEngineering },  // https://youtu.be/PeYIo91DlWo?t=490
  // This is really "aveNumTransitVehiclesPerTrack" at the moment...
  numTransitVehicles: { value: 90, units: '', autoMap: true, min: 0, max: 3600, step: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitVehicleLength: { value: 20, units: 'm', autoMap: true, min: 1, max: 100, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitVehicleRadius: { value: 2, units: 'm', autoMap: true, min: 1, max: 10, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitVehicleCruisingSpeed: { value: 1100, units: 'm/s', autoMap: true, min: 100, max: 2000, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitSystemEfficiencyAtCruisingSpeed: { value: 0.8, units: '', autoMap: true, min: 0.1, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering },
  transitVehicleCoefficientOfDrag: { value: 0.25, units: '', autoMap: true, min: .1, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering },

  // Engineering Parameters - Launch System
  launchTubeUpwardOffset: { value: 100, units: "m", autoMap: true, min: -1000, max: 0, updateFunction: adjustRingDesign, folder: folderEngineering },
  launchTubeAcceleration: { value: 30, units: 'm', autoMap: true, min: 1, max: 1000, updateFunction: adjustRingDesign, folder: folderEngineering },
  launchTubeExitVelocity: { value: 8000, units: 'm*s-1', autoMap: true, min: 100, max: 50000, updateFunction: adjustRingDesign, folder: folderEngineering },
  launchVehicleCoefficientOfDrag: { value: 1, units: '', autoMap: true, min: .1, max: 2, updateFunction: adjustRingDesign, folder: folderEngineering },
  launchVehicleRadius: { value: 1, units: '2', autoMap: true, min: .1, max: 10, updateFunction: adjustRingDesign, folder: folderEngineering },

  // Engineering Parameters - Power
  powerRequirement: { value: 1000, units: "W/m", autoMap: true, min: 1, max: 10000, updateFunction: adjustRingDesign, folder: folderEngineering },   // This is the power that is consumed by the rings maglev systems and all equipment supported by the ring, per meter length of the ring.
  powerConductorDensity: { value: 2710, units: "kg*m-3", autoMap: true, min: 10, max: 10000, updateFunction: adjustRingDesign, folder: folderEngineering },  // Value for aluminum
  powerConductorConductivity: { value: 36900000, units: "Siemens*m-1", autoMap: true, min: 10000000, max: 100000000, updateFunction: adjustRingDesign, folder: folderEngineering }, // Value for Aliminum. One siemen is kg−1⋅m−2⋅s3⋅A2
  powerVoltageAcrossLoad: { value: 100000, units: "Volts", autoMap: true, min: 1, max: 10000000, updateFunction: adjustRingDesign, folder: folderEngineering },
  powerLostInConductorFactor: { value: 0.01, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderEngineering },

  showEarthAxis: { value: false, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  showEarthEquator: { value: false, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  showElevators: { value: true, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  showLaunchOrbit: { value: false, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  showLaunchTrajectory: { value: false, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  showLaunchTubes: { value: false, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  showTransitSystem: { value: true, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  showTransitVehicles: { value: true, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  animateElevators: { value: true, units: '', autoMap: true, updateFunction: adjustRingDesign, folder: folderRendering },
  animateTransitVehicles: { value: true, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustRingDesign, folder: folderRendering },
  cableVisibility: { value: 0.2, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustCableOpacity, folder: folderRendering },
  tetherVisibility: { value: 0.2, units: "", autoMap: true, min: 0, max: 1, updateFunction: adjustTetherOpacity, folder: folderRendering },
  launchTrajectoryVisibility: { value: 1, units: '', autoMap: true, min: 0, max: 1, updateFunction: adjustLaunchTrajectoryOpacity, folder: folderRendering },
  cameraFieldOfView: { value: 45, units: '', autoMap: true, min: 5, max: 90, updateFunction: updateCamerFieldOfView, folder: folderRendering },

}

const current = guidParamWithUnits['powerRequirement'].value / guidParamWithUnits['powerVoltageAcrossLoad'].value
const powerLostInConductor = guidParamWithUnits['powerRequirement'].value * guidParamWithUnits['powerLostInConductorFactor'].value
const voltageDropOverWires = powerLostInConductor / current
const wireResistance = voltageDropOverWires / current
const wireLength = 2 * 84354.4319347572  // This needs to be computed in the tether math section
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

// Add sliders for each entry in guidParamWithUnits to the gui...
Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  if (v.step) {
    guidParamWithUnits[k].folder.add(guidParam, k, v.min, v.max).onChange(v.updateFunction).step(v.step)
  }
  else {
    guidParamWithUnits[k].folder.add(guidParam, k, v.min, v.max).onChange(v.updateFunction)
  }
})
// Add an additional button to the gui to display instructions for the new user
function displayHelp() {
  alert('"Z" and "X" keys zoom in and out.\n"P" key moves the point that the simulation orbits around to a position just above the planet\'s surface near to where the sprite is pointing.\n')
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
      dParamWithUnits[k] = { value: v.value, units: v.units }
    }
  })
  // The following parameters are mapped "manually" from the gui to the model
  dParamWithUnits['equivalentLatitude'] = { value: guidParamWithUnits['equivalentLatitude'].value / 180 * Math.PI, units: "radians" }
  dParamWithUnits['ringCenterLongitude'] = { value: tram.lerp(guidParamWithUnits['buildLocationRingCenterLongitude'].value, guidParamWithUnits['finalLocationRingCenterLongitude'].value, guidParamWithUnits['moveRing'].value) / 180 * Math.PI, units: "radians" }
  dParamWithUnits['ringCenterLatitude'] = { value: tram.lerp(guidParamWithUnits['buildLocationRingCenterLatitude'].value, guidParamWithUnits['finalLocationRingCenterLatitude'].value, guidParamWithUnits['moveRing'].value) / 180 * Math.PI, units: "radians" }
  dParamWithUnits['ringEccentricity'] = { value: tram.lerp(guidParamWithUnits['buildLocationRingEccentricity'].value, guidParamWithUnits['finalLocationRingEccentricity'].value, guidParamWithUnits['moveRing'].value), units: "" }
  dParamWithUnits['launchTubeLength'] = { value: dParamWithUnits['launchTubeExitVelocity'].value ** 2 / 2 / dParamWithUnits['launchTubeAcceleration'].value, units: "m" }
  dParamWithUnits['launchTubeAccelerationTime'] = { value: dParamWithUnits['launchTubeExitVelocity'].value / dParamWithUnits['launchTubeAcceleration'].value, units: "s" }

  if (genSpecsFile) {
    specsFile = specsFile.concat('// GUI Parameters\n')
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + ',' + v.value + ',' + v.units + '\n')
    })

    specsFile = specsFile.concat('// Design Parameters\n')
    Object.entries(dParamWithUnits).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + ',' + v.value + ',' + v.units + '\n')
    })
  }
}

updatedParam()

function adjustRingDesign() {
  updateRing()
}

function adjustCableOpacity() {
  updatedParam()
  cableMaterial.opacity = dParamWithUnits['cableVisibility'].value
}

function adjustTetherOpacity() {
  updatedParam()
  tetherMaterial.opacity = dParamWithUnits['tetherVisibility'].value
}

function adjustLaunchTrajectoryOpacity() {
  updatedParam()
  launchTrajectoryMaterial.opacity = dParamWithUnits['launchTrajectoryVisibility'].value
}

function adjustRingLatLon() {
  updatedParam()
  const object1 = scene.getObjectByName("tetheredRingLonCoordSys")
  object1.rotation.y = dParamWithUnits['ringCenterLongitude'].value
  const object2 = scene.getObjectByName("tetheredRingLatCoordSys")
  object2.rotation.x = -dParamWithUnits['ringCenterLatitude'].value
}

// Three.js Rendering Setup
let simContainer = document.querySelector('#simContainer')

const raycaster = new THREE.Raycaster()
const scene = new THREE.Scene()
//scene.fog = new THREE.FogExp2(0x202040, 0.000005)

//scene.background = new THREE.Color( 0xffffff )
const fov = dParamWithUnits['cameraFieldOfView'].value
const aspectRatio = simContainer.offsetWidth / simContainer.offsetHeight
//console.log("W,H ", simContainer.offsetWidth, simContainer.offsetHeight)
let nearClippingPlane = 0.1 * radiusOfPlanet
let farClippingPlane = 100 * radiusOfPlanet
let extraDistanceForCamera = 10000

const camera = new THREE.PerspectiveCamera(fov, aspectRatio, nearClippingPlane, farClippingPlane)
const cameraGroup = new THREE.Group()
cameraGroup.add(camera)
camera.position.z = -30 * radiusOfPlanet / 8

function updateCamerFieldOfView() {
  updatedParam()
  camera.fov = dParamWithUnits['cameraFieldOfView'].value
}

// Need to add these two lines to have the planet apper in VR
if (enableVR) {
  cameraGroup.position.z = -1.005 * radiusOfPlanet
  cameraGroup.rotation.z = Math.PI / 2
  cameraGroup.rotation.y = -Math.PI / 2
}
scene.add(cameraGroup)

const sunLight = new THREE.DirectionalLight(0xffffff, 1)
sunLight.position.set(0, 6 * radiusOfPlanet / 8, -20 * radiusOfPlanet / 8)

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  //logarithmicDepthBuffer: true,
  canvas: document.querySelector('canvas')
})
//renderer.setSize(innerWidth, innerHeight)
renderer.setSize(simContainer.offsetWidth, simContainer.offsetHeight)
//console.log("W,H ", simContainer.offsetWidth, simContainer.offsetHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.xr.enabled = true
renderer.xr.setReferenceSpaceType('local')
//document.body.appendChild(renderer.domElement)
const stats = new Stats()
simContainer.appendChild(stats.dom)

const orbitControls = new OrbitControls(camera, renderer.domElement)
orbitControls.addEventListener('change', orbitControlsEventHandler)

//orbitControls.autoRotate = true
orbitControls.autoRotateSpeed = 0.1
orbitControls.enableDamping = true
//orbitControls.enablePan = true

const AxisEquatorThickness = radiusOfPlanet * 0.004
const planetWidthSegments = 512
const planetHeightSegments = 128

const planetCoordSys = new THREE.Group()

planetCoordSys.position.x = 0
planetCoordSys.position.y = 0
planetCoordSys.position.z = 0
//planetCoordSys.scale.y = 1.0 - 1.0/WGS84FlattenningFactor // Squishes the earth (and everything else) by the correct flattening factor

let eightTextureMode = false
let TextureMode24x12 = false
let TextureModeOpenLayers = true;
if (enableVR) {
  planetCoordSys.rotation.y = Math.PI * -5.253 / 16
  planetCoordSys.rotation.x = Math.PI * -4 / 16
  eightTextureMode = true
}
else {
  eightTextureMode = false
  TextureMode24x12 = false
}

scene.add(planetCoordSys)

const planetMeshes = []
let filename
let letter

if (TextureMode24x12) {
  const w = 24
  const h = 12
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if ((j != 2) || (i != 3)) {
        filename = `./textures/24x12/LR/earth_LR_${w}x${h}_${i}x${j}.jpg`
      }
      else {
        filename = `./textures/24x12/HR/earth_HR_${w}x${h}_${i}x${j}.jpg`
      }
      console.log(filename)
      const planetMesh = new THREE.Mesh(
        new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments, i * Math.PI * 2 / w, Math.PI * 2 / w, j * Math.PI / h, Math.PI / h),
        new THREE.ShaderMaterial({
          //vertexShader: vertexShader,
          //fragmentShader: fragmentShader,
          vertexShader: document.getElementById('vertexShader').textContent,
          fragmentShader: document.getElementById('fragmentShader').textContent,
          uniforms: {
            planetTexture: {
              //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
              value: new THREE.TextureLoader().load(filename),
            }
          },
          //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
          //displacementScale: 500000,
        })
      )
      planetMesh.rotation.y = -Math.PI / 2  // This is needed to have the planet's texture align with the planet's Longintitude system
      planetMeshes.push(planetMesh)
    }
  }
}
else if (TextureModeOpenLayers) {



  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
    new THREE.ShaderMaterial({
      vertexShader: document.getElementById('vertexShader').textContent,
      fragmentShader: document.getElementById('fragmentShader').textContent,
      uniforms: {
        planetTexture: {
          value: undefined,
        }
      },

    })
  )
  makePlanetTexture(planetMesh, orbitControls, camera, radiusOfPlanet, false, (planetTexture) => {
    planetMesh.material.uniforms.planetTexture.value = planetTexture;
    planetMesh.material.uniforms.planetTexture.needsUpdate = true;
  });


  planetMesh.rotation.y = -Math.PI / 2  // This is needed to have the planet's texture align with the planet's Longintitude system
  planetMeshes.push(planetMesh)


}
else if (eightTextureMode) {
  let letter
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 4; i++) {
      //if ((j==0) && ((i==0) || (i==3))) {
      if ((j == 0) && (i == 0)) {
        letter = String.fromCharCode(65 + i)
        filename = `./textures/world.topo.200404.3x21600x21600.${letter}${j + 1}.jpg`
        //filename = `./textures/world.topo.200404.3x16384x16384.${letter}${j+1}.jpg`
        console.log(letter, filename)
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments, i * Math.PI / 2, Math.PI / 2, j * Math.PI / 2, Math.PI / 2),
          new THREE.ShaderMaterial({
            //vertexShader: vertexShader,
            //fragmentShader: fragmentShader,
            vertexShader: document.getElementById('vertexShader').textContent,
            fragmentShader: document.getElementById('fragmentShader').textContent,
            uniforms: {
              planetTexture: {
                //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
                value: new THREE.TextureLoader().load(filename),
              }
            },
            //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
            //displacementScale: 500000,
          })
        )
        planetMesh.rotation.y = -Math.PI / 2  // This is needed to have the planet's texture align with the planet's Longintitude system
        planetMeshes.push(planetMesh)
      }
    }
  }
}
else {
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
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
      vertexShader: document.getElementById('vertexShader').textContent,
      fragmentShader: document.getElementById('fragmentShader').textContent,
      uniforms: {
        planetTexture: {
          //value: new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg' )
          value: new THREE.TextureLoader().load('./textures/bluemarble_16384.jpg')
          //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
          //value: new THREE.TextureLoader().load( './textures/human_population_density_map.png' )
        }
      }
    })
  )
  planetMesh.rotation.y = -Math.PI / 2  // This is needed to have the planet's texture align with the planet's Longintitude system
  planetMeshes.push(planetMesh)
}
//planetMesh.castShadow = true

const atmosphereMesh = new THREE.Mesh(
  new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
  new THREE.ShaderMaterial({
    //vertexShader: atmosphereVertexShader,
    //fragmentShader: atmosphereFragmentShader,
    vertexShader: document.getElementById('atmosphereVertexShader').textContent,
    fragmentShader: document.getElementById('atmosphereFragmentShader').textContent,

    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  })
)
// ToDo: Scaling this sphere as opposed to setting its radius directly seems a bit hacky.
atmosphereMesh.scale.set(1.1, 1.1 * (1.0 - 1.0 / WGS84FlattenningFactor), 1.1)
//atmosphereMesh.receiveShadow = true

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

const grayMaterial = new THREE.MeshBasicMaterial({ color: 0x3f3f4f })
const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0x5f5f5f })
const greenMaterial = new THREE.MeshLambertMaterial({ color: 0x005f00 })
const metalicMaterial = new THREE.MeshLambertMaterial({ color: 0x878681, transparent: false })
const transparentMaterial1 = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, })
const transparentMaterial2 = new THREE.MeshLambertMaterial({ color: 0xffff80, transparent: true, opacity: 0.35, depthWrite: false, })
var tetherMaterial = new THREE.LineBasicMaterial({
  vertexColors: THREE.VertexColors,
  color: 0x4897f8,     // This line doesn't seem to work
  transparent: true,
  opacity: dParamWithUnits['tetherVisibility'].value
})
var cableMaterial = new THREE.LineBasicMaterial({
  vertexColors: THREE.VertexColors,
  //color: 0x4897f8,
  transparent: true,
  opacity: dParamWithUnits['cableVisibility'].value
})

planetCoordSys.add(sunLight)
planetMeshes.forEach(mesh => {
  planetCoordSys.add(mesh)
})
planetCoordSys.add(atmosphereMesh)

if (dParamWithUnits['showEarthAxis'].value) {
  const axisGeometry = new THREE.CylinderGeometry(AxisEquatorThickness, AxisEquatorThickness, 2.5 * radiusOfPlanet, 4, 1, false)
  const axisMesh = new THREE.Mesh(axisGeometry, grayMaterial)
  planetCoordSys.add(axisMesh)
}

if (dParamWithUnits['showEarthEquator'].value) {
  const equatorGeometry = new THREE.TorusGeometry(radiusOfPlanet, AxisEquatorThickness, 8, 128)
  const equatorMesh = new THREE.Mesh(equatorGeometry, grayMaterial)
  equatorMesh.rotation.x = 3.1415927 / 2
  planetCoordSys.add(equatorMesh)
}

if (dParamWithUnits['showLaunchOrbit'].value) {
  const OrbitalAltitude = 200000 // m
  const launchOrbitGeometry = new THREE.TorusGeometry(radiusOfPlanet + OrbitalAltitude, AxisEquatorThickness, 8, 128)
  const launchOrbitMesh = new THREE.Mesh(launchOrbitGeometry, grayMaterial)
  //launchOrbitMesh.setRotationFromEuler(Math.PI/2 + dParamWithUnits['ringCenterLatitude'].value - (Math.PI/2 - dParamWithUnits['equivalentLatitude'].value), Math.PI/2 + dParamWithUnits['ringCenterLongitude'].value, 0)
  launchOrbitMesh.rotateY(dParamWithUnits['ringCenterLongitude'].value)
  launchOrbitMesh.rotateX(Math.PI / 2 - dParamWithUnits['ringCenterLatitude'].value + (Math.PI / 2 - dParamWithUnits['equivalentLatitude'].value))
  planetCoordSys.add(launchOrbitMesh)
}

// const orbitControlsCenterMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), grayMaterial)
// let orbitControlsCenterMarkerSize = 5000
// orbitControlsCenterMarker.position.x = 0
// orbitControlsCenterMarker.position.y = 0
// orbitControlsCenterMarker.position.z = -radiusOfPlanet
// orbitControlsCenterMarker.scale.x = orbitControlsCenterMarkerSize
// orbitControlsCenterMarker.scale.y = orbitControlsCenterMarkerSize
// orbitControlsCenterMarker.scale.z = orbitControlsCenterMarkerSize
// scene.add(orbitControlsCenterMarker)

// const orbitControlsSurfaceMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), greenMaterial)
// let orbitControlsSurfaceMarkerSize = 50000
// orbitControlsSurfaceMarker.position.x = 0
// orbitControlsSurfaceMarker.position.y = 0
// orbitControlsSurfaceMarker.position.z = -radiusOfPlanet
// orbitControlsSurfaceMarker.scale.x = orbitControlsSurfaceMarkerSize
// orbitControlsSurfaceMarker.scale.y = orbitControlsSurfaceMarkerSize
// orbitControlsSurfaceMarker.scale.z = orbitControlsSurfaceMarkerSize
// orbitControlsSurfaceMarker.visible = false
// scene.add(orbitControlsSurfaceMarker)

// Add Some Stars
const starGeometry = new THREE.BufferGeometry()
const starVertices = []
for (let i = 0; i < 10000;) {
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
  if (XYZ.length() <= 1) {
    // The random position needs to be not on the origin and also within a unit sphere
    XYZ.normalize().multiplyScalar(256 * radiusOfPlanet)
    starVertices.push(XYZ.x, XYZ.y, XYZ.z)
    i++
  }
}

starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3))
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xFFFFFF }))
planetCoordSys.add(stars)  // Todo: This might make the stars rotate with planet. Maybe need another Group...

// "Gimbal" code for the tetheredRingRefCoordSys    
const tetheredRingLonCoordSys = new THREE.Group();
tetheredRingLonCoordSys.name = "tetheredRingLonCoordSys"
planetCoordSys.add(tetheredRingLonCoordSys)
tetheredRingLonCoordSys.position.x = 0
tetheredRingLonCoordSys.position.y = 0
tetheredRingLonCoordSys.rotation.y = dParamWithUnits['ringCenterLongitude'].value

const tetheredRingLatCoordSys = new THREE.Group();
tetheredRingLatCoordSys.name = "tetheredRingLatCoordSys"
tetheredRingLonCoordSys.add(tetheredRingLatCoordSys)
tetheredRingLatCoordSys.rotation.x = -dParamWithUnits['ringCenterLatitude'].value

const tetheredRingRefCoordSys = new THREE.Group();
tetheredRingLatCoordSys.add(tetheredRingRefCoordSys)
tetheredRingRefCoordSys.rotation.x = Math.PI / 2
//tetheredRingRefCoordSys.rotation.y = Math.PI/4  // This is done so that the eccentricity adjustment is where we need it to be
// The above line puts the reference coordinate system's y-axis at lat/lon {0, 0} when RingCenterLat==0 and RingCenterLon==0
// This is needed because the ring will be centered around the coordinate system's y-axis
// We want the ring centered around the y-axis because .setFromSphericalCoords's polar angle is relative to the y-axis

// Generate the main ring
let crv = new tram.commonRingVariables(radiusOfPlanet, dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value)
let ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv)
let tvv = new tram.transitVehicleVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv)

const mainRingCurveLineMeshes = []
let ringCurve
constructMainRingCurve()

function constructMainRingCurve() {
  const controlPoints = []

  const e = dParamWithUnits['ringEccentricity'].value
  for (let a = 0, i = 0; i < dParamWithUnits['numControlPoints'].value; a += Math.PI * 2 / dParamWithUnits['numControlPoints'].value, i++) {
    const angleInRingCoordSys = Math.acos(crv.mainRingRadius / (radiusOfPlanet + crv.currentMainRingAltitude)) * Math.sqrt((e * Math.cos(a)) ** 2 + (1 / e * Math.sin(a)) ** 2)
    const rInRingCoordSys = (radiusOfPlanet + crv.currentMainRingAltitude) * Math.cos(angleInRingCoordSys)
    const yInRingCoordSys = (radiusOfPlanet + crv.currentMainRingAltitude) * Math.sin(angleInRingCoordSys)
    const xInRingCoordSys = rInRingCoordSys * Math.cos(a)
    const zInRingCoordSys = rInRingCoordSys * Math.sin(a)
    controlPoints.push(new THREE.Vector3(xInRingCoordSys, yInRingCoordSys, zInRingCoordSys))
  }

  ringCurve = new THREE.CatmullRomCurve3(controlPoints)
  ringCurve.curveType = 'centripetal'
  ringCurve.closed = true
  ringCurve.tension = 0

  const points = ringCurve.getPoints(8192)
  // Debug - Draw a loop along the curve to check that it is correctly positioned
  const mainRingCurveLineMesh = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x00ff00 })
  )
  mainRingCurveLineMeshes.push(mainRingCurveLineMesh)
  //mainRingCurveLineMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))

  if (genKMLFile) {
    //KML file placemark creation code for the ring and elevator cables.
    kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader)
    let xyzWorld, xyzPlanet
    let coordString, firstCoordString

    planetCoordSys.updateWorldMatrix(true)
    tetheredRingLonCoordSys.updateMatrixWorld(true)
    tetheredRingLatCoordSys.updateMatrixWorld(true)
    tetheredRingRefCoordSys.updateMatrixWorld(true)
    points.forEach((point, i) => {
      xyzWorld = tetheredRingRefCoordSys.localToWorld(point.clone())
      xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
      const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
      coordString = '          ' + Math.round(lla.lon * 10000000) / 10000000 + ',' + Math.round(lla.lat * 10000000) / 10000000 + ',' + Math.round(Math.abs(lla.alt) * 1000) / 1000 + '\n'
      if (i == 0) {
        firstCoordString = coordString
      }
      kmlFile = kmlFile.concat(coordString)
    })
    kmlFile = kmlFile.concat(firstCoordString)  // We need to repeat the first coordinate to close the loop
    kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)
  }
}

const numWedges = 256
let start, end

console.log("V6")
const mainRingMeshes = []
console.log("Constructing Main Rings")
constructMainRings()

function constructMainRings() {
  const mro = (dParamWithUnits['numMainRings'].value - 1) / 2
  const referencePoint = new THREE.Vector3()

  for (let j = 0; j < numWedges; j++) {
    start = j / numWedges
    end = (j + 1) / numWedges
    referencePoint.copy(ringCurve.getPointAt((start + end) / 2))

    for (let i = 0; i < dParamWithUnits['numMainRings'].value; i++) {
      const mainRingGeometry = new mainRingTubeGeometry(ringCurve, start, end, referencePoint, 8192 / numWedges, (i - mro) * dParamWithUnits['mainRingSpacing'].value, dParamWithUnits['mainRingTubeRadius'].value)
      const mainRingMesh = new THREE.Mesh(mainRingGeometry, metalicMaterial)
      mainRingMesh.position.copy(referencePoint)
      mainRingMeshes.push(mainRingMesh)
    }
  }
  mainRingMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))
}

const transitSystemMeshes = []
const trackOffsetsList = [[-0.4, 0.8], [0.4, 0.8], [-0.4, -0.1], [0.4, -0.1]]

if (dParamWithUnits['showTransitSystem'].value) {
  // Create the transit system
  console.log("Constructing Transit System")
  constructTransitSystem()
}
function constructTransitSystem() {
  // Add the transit tube
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const transitTube_r = crv.mainRingRadius + tram.offset_r(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const transitTube_y = crv.yc + tram.offset_y(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)

  const trackHalfWidth = 0.2
  const trackHalfHeight = 0.05
  const referencePoint = new THREE.Vector3()
  let outwardOffset = [], upwardOffset = []
  for (let i = 0; i < trackOffsetsList.length; i++) {
    outwardOffset[i] = dParamWithUnits['transitTubeOutwardOffset'].value + trackOffsetsList[i][0] * dParamWithUnits['transitTubeTubeRadius'].value
    upwardOffset[i] = dParamWithUnits['transitTubeUpwardOffset'].value + trackOffsetsList[i][1] * dParamWithUnits['transitTubeTubeRadius'].value
  }
  for (let j = 0; j < numWedges; j++) {
    start = j / numWedges
    end = (j + 1) / numWedges
    referencePoint.copy(ringCurve.getPointAt((start + end) / 2))

    for (let i = 0; i < dParamWithUnits['numMainRings'].value; i++) {
      const mainRingGeometry = new transitTubeGeometry(ringCurve, start, end, referencePoint, 8192 / numWedges, dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, dParamWithUnits['transitTubeTubeRadius'].value)
      const mainRingMesh = new THREE.Mesh(mainRingGeometry, metalicMaterial)
      mainRingMesh.position.copy(referencePoint)
      mainRingMeshes.push(mainRingMesh)
    }

    const tubeGeometry = new transitTubeGeometry(ringCurve, start, end, referencePoint, 8192 / numWedges, dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, dParamWithUnits['transitTubeTubeRadius'].value)
    const transitTubeMesh = new THREE.Mesh(tubeGeometry, transparentMaterial1)
    transitTubeMesh.position.copy(referencePoint)
    transitSystemMeshes.push(transitTubeMesh)

    // Add four tracks inside the transit tube
    for (let i = 0; i < trackOffsetsList.length; i++) {
      const trackGeometry = new transitTrackGeometry(ringCurve, start, end, referencePoint, 8192 / numWedges, outwardOffset[i], upwardOffset[i], trackHalfWidth, trackHalfHeight)
      const transitTrackMesh = new THREE.Mesh(trackGeometry, metalicMaterial)
      transitTrackMesh.position.copy(referencePoint)
      transitSystemMeshes.push(transitTrackMesh)
    }
  }
  transitSystemMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))
}

const transitVehicleMeshes = []
if (dParamWithUnits['showTransitSystem'].value && dParamWithUnits['showTransitVehicles'].value) {
  console.log("Constructing Transit Vehicles")
  constructTransitVehicles()
}
function constructTransitVehicles() {

  const C_D = dParamWithUnits['transitVehicleCoefficientOfDrag'].value
  const P = dParamWithUnits['transitTubeInteriorPressure'].value
  const MW = dParamWithUnits['transitTubeInteriorGasMolecularWeight'].value
  const T = dParamWithUnits['transitTubeInteriorTemperature'].value
  const ρ = P * MW / (T + 273.15) / idealGasConstant
  specs['transitTubeInteriorGasDensity'] = { value: ρ, units: "kg*m-3" }
  const A = Math.PI * dParamWithUnits['transitVehicleRadius'].value ** 2
  const V = dParamWithUnits['transitVehicleCruisingSpeed'].value
  const F = C_D * ρ * A * V ** 2
  specs['transitVehicleAerodynamicDragForce'] = { value: F, units: "N" }
  const η = dParamWithUnits['transitSystemEfficiencyAtCruisingSpeed'].value
  specs['transitVehiclePowerConsumptionWhenCruising'] = { value: F * V / η, units: "W" }

  const loader = new GLTFLoader()
  loader.load('models/TransitCar.glb', addTransitVehicles,
    // called when loading is in progresses
    function (xhr) {
      console.log((xhr.loaded / xhr.total * 100) + '% transit car loaded');
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened', error);
    }
  )

  function addTransitVehicles({ scene }) {
    // Add Transit Vehicles
    const object = scene.children[0]
    console.log(object)

    object.scale.set(.034, .034, .034)
    //object.visible = false
    for (let a = 0, i = 0; i < dParamWithUnits['numTransitVehicles'].value; a += Math.PI * 2 / dParamWithUnits['numTransitVehicles'].value, i++) {
      for (let i = 0; i < trackOffsetsList.length; i++) {
        const outwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + trackOffsetsList[i][0] * dParamWithUnits['transitTubeTubeRadius'].value
        const upwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + trackOffsetsList[i][1] * dParamWithUnits['transitTubeTubeRadius'].value - dParamWithUnits['transitVehicleRadius'].value - 0.35  // Last is half of the track height

        transitVehicleMeshes.push(makeTransitVehicleMesh(object, outwardOffset, upwardOffset, a, i))
      }
    }

    function makeTransitVehicleMesh(object, outwardOffset, upwardOffset, a, i) {
      //const transitVehicleGeometry = new THREE.CylinderGeometry(dParamWithUnits['transitVehicleRadius'].value, dParamWithUnits['transitVehicleRadius'].value, dParamWithUnits['transitVehicleLength'].value, 64, 1)
      //const transitVehicleMesh = new THREE.Mesh(transitVehicleGeometry, metalicMaterial)
      const transitVehicleMesh = object.clone()
      if ((a == 0) && (i == 0)) { console.log(object) }
      computeTransitVehiclePositionAndRotation(transitVehicleMesh, outwardOffset, upwardOffset, a, 0)
      transitVehicleMesh.userData = { 'a': a, 'i': i }
      return transitVehicleMesh
    }

    transitVehicleMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))
  }
}
function computeTransitVehiclePositionAndRotation(transitVehicleMesh, outwardOffset, upwardOffset, a, d) {
  const transitVehiclePosition_r = crv.mainRingRadius + tram.offset_r(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
  const a2 = a + d / transitVehiclePosition_r
  transitVehicleMesh.position.set(transitVehiclePosition_r * Math.cos(a2), crv.yc + tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude), transitVehiclePosition_r * Math.sin(a2))
  transitVehicleMesh.rotation.set(0, -a2, crv.currentEquivalentLatitude)
  transitVehicleMesh.rotateZ(-Math.PI / 2)
}

const launchTubeMeshes = []
function constructLaunchTube() {
  // Add the launch tube
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const launchTubeOutwardOffset = 10
  const launchTubeRadius = crv.mainRingRadius + tram.offset_r(launchTubeOutwardOffset, -dParamWithUnits['launchTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const launchTube_y = crv.yc + tram.offset_y(launchTubeOutwardOffset, -dParamWithUnits['launchTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const launchTubeArc = dParamWithUnits['launchTubeLength'].value / (2 * Math.PI * launchTubeRadius) * 2 * Math.PI

  const launchTubeTubeRadius = 10000
  const launchTubeRadialSegments = 8
  const launchTubeTubularSegments = 1024
  const launchTubeGeometry = new THREE.TorusGeometry(launchTubeRadius, launchTubeTubeRadius, launchTubeRadialSegments, launchTubeTubularSegments, launchTubeArc)
  const launchTubeMesh = new THREE.Mesh(launchTubeGeometry, transparentMaterial1)
  launchTubeMesh.rotation.x = Math.PI / 2      // We need a torus that sits on the x-z plane because .setFromSphericalCoords's polar angle is reletive to the y-axis
  launchTubeMesh.rotation.z = Math.PI / 2      // We need a torus that sits on the x-z plane because .setFromSphericalCoords's polar angle is reletive to the y-axis
  launchTubeMesh.position.y = launchTube_y
  launchTubeMeshes.push(launchTubeMesh)

  // Add four tracks inside the transit tube
  // These really need to be a more like a ribbon with a rectangular cross-section but to do that I will need to implement a custom geometry. For now, torus geometry...
  function makeTrackMesh(outwardOffset, upwardOffset, width, height, launchTubeRadius, launchTubePosition_y, currentEquivalentLatitude) {
    const trackInnerRadius = launchTubeRadius + tram.offset_r(outwardOffset - width / 2, upwardOffset - height / 2, crv.currentEquivalentLatitude)
    const trackOuterRadius = launchTubeRadius + tram.offset_r(outwardOffset + width / 2, upwardOffset - height / 2, crv.currentEquivalentLatitude)
    const thetaSegments = 1024
    //const trackGeometry = new THREE.RingGeometry(trackInnerRadius, trackOuterRadius, thetaSegments)
    const trackGeometry = new THREE.TorusGeometry((trackInnerRadius + trackOuterRadius) / 2, width, 8, thetaSegments, launchTubeArc)
    const launchTrackMesh = new THREE.Mesh(trackGeometry, metalicMaterial)
    launchTrackMesh.rotation.x = Math.PI / 2
    launchTrackMesh.position.y = launchTubePosition_y + tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    return launchTrackMesh
  }

  const trackWidth = 0.5
  const trackHeight = 0.2
  const trackOffsetsList = [[-0.5, 0.8], [0.5, 0.8]]
  for (let i = 0; i < trackOffsetsList.length; i++) {
    let outwardOffset = trackOffsetsList[i][0] * launchTubeTubeRadius
    let upwardOffset = trackOffsetsList[i][1] * launchTubeTubeRadius
    launchTubeMeshes.push(makeTrackMesh(outwardOffset, upwardOffset, trackWidth, trackHeight, launchTubeRadius, launchTubeMesh.position.y, crv.currentEquivalentLatitude))
  }
  launchTubeMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))
}
// Create the launch sytem
if (dParamWithUnits['showLaunchTubes'].value) {
  console.log("Constructing Launch Tube")
  constructLaunchTube()
}

let elevatorAltitude = (crv.currentMainRingAltitude + dParamWithUnits['transitTubeUpwardOffset'].value) - 20
const elevatorCarMeshes = []
const elevatorCableMeshes = []

function addStraightLineSegment(points,) {

  // const tempGeometry = new THREE.BufferGeometry().setFromPoints(points)    // Add the new geometry back
  // // tempGeometry.addAttribute("color", new THREE.Float32BufferAttribute(0x0000ff, 3) );
  // for (let i=0; i<dParamWithUnits['numTethers'].value/2; i++) {
  //   tethers[i] = new THREE.LineSegments(tempGeometry.clone(), tetherMaterial);
  //   tethers[i].rotation.y = 2 * Math.PI * i * 2 / dParamWithUnits['numTethers'].value
  //   tetheredRingRefCoordSys.add(tethers[i])
  // }

  // const points.push(new THREE.Vector3().setFromSphericalCoords(r_0, ω_0, θ + branch.dθ_0))

  // const elevatorCableGeometry = new THREE.CylinderGeometry(elevatorCableTubeRadius, elevatorCableTubeRadius, elevatorCableLength, elevatorCableTubularSegments)
  // const elevatorCableMesh = new THREE.Mesh(elevatorCableGeometry, transparentMaterial2)
  // elevatorCableMesh.rotation.x = Math.PI/2
  // elevatorCableMesh.position.y = crv.yc + tram.offset_y(-10, -elevatorCableLength, crv.currentEquivalentLatitude)
}

function constructElevatorCables() {
  // Add elevator cables
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value
  const elevatorCableUpperAttachPnt_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
  const elevatorCableupperElevatorTerminus_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const elevatorCableLowerAttachPnt_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  const elevatorCableUpperAttachPnt_y = crv.yc + tram.offset_y(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
  const elevatorCableupperElevatorTerminus_y = crv.yc + tram.offset_y(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const elevatorCableLowerAttachPnt_y = crv.yc + tram.offset_y(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  //const elevatorCableTubeRadius = 1000.01
  //const elevatorCableTubularSegments = 8 

  let tempGeometry
  const upperElevatorTerminusLength = 2 * (-dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value)
  const upperElevatorTerminusWidth = 20
  const upperElevatorTerminusThickness = 10
  const upperElevatorTerminusMesh = new THREE.Mesh(new THREE.BoxGeometry(upperElevatorTerminusLength, upperElevatorTerminusThickness, upperElevatorTerminusWidth), transparentMaterial2)

  // planetCoordSys.updateWorldMatrix(true)
  // tetheredRingLonCoordSys.updateMatrixWorld(true)
  // tetheredRingLatCoordSys.updateMatrixWorld(true)
  // tetheredRingRefCoordSys.updateMatrixWorld(true)

  const n = dParamWithUnits['numElevatorCables'].value
  for (let a = 0, i = 0; i < n; a += Math.PI * 2 / n, i++) {
    const elevatorCableReferencePnt = new THREE.Vector3(
      elevatorCableUpperAttachPnt_r * Math.cos(a),
      elevatorCableUpperAttachPnt_y,
      elevatorCableUpperAttachPnt_r * Math.sin(a)
    )
    const elevatorCableUpperAttachPnt = new THREE.Vector3(
      elevatorCableUpperAttachPnt_r * Math.cos(a),
      elevatorCableUpperAttachPnt_y,
      elevatorCableUpperAttachPnt_r * Math.sin(a)
    )
    const elevatorCableupperElevatorTerminus = new THREE.Vector3(
      elevatorCableupperElevatorTerminus_r * Math.cos(a),
      elevatorCableupperElevatorTerminus_y,
      elevatorCableupperElevatorTerminus_r * Math.sin(a)
    )
    const elevatorCableLowerAttachPnt = new THREE.Vector3(
      elevatorCableLowerAttachPnt_r * Math.cos(a),
      elevatorCableLowerAttachPnt_y,
      elevatorCableLowerAttachPnt_r * Math.sin(a)
    )

    // Now create an array of two points use that to make a LineSegment Geometry
    tempGeometry = new THREE.BufferGeometry().setFromPoints([elevatorCableUpperAttachPnt.sub(elevatorCableReferencePnt), elevatorCableLowerAttachPnt.sub(elevatorCableReferencePnt)])
    //tempGeometry.setAttribute("color", new THREE.Float32BufferAttribute(0x0000ff, 3) )
    const elevatorCableMesh = new THREE.LineSegments(tempGeometry.clone(), cableMaterial)
    elevatorCableMesh.position.copy(elevatorCableReferencePnt)
    elevatorCableMeshes.push(elevatorCableMesh)

    // Add platforms at the top and bottom of each the elevator cable 
    upperElevatorTerminusMesh.rotation.x = 0
    upperElevatorTerminusMesh.rotation.y = -a
    upperElevatorTerminusMesh.rotation.z = crv.currentEquivalentLatitude - Math.PI / 2
    upperElevatorTerminusMesh.position.set(elevatorCableupperElevatorTerminus.x, elevatorCableupperElevatorTerminus.y, elevatorCableupperElevatorTerminus.z)
    elevatorCableMeshes.push(upperElevatorTerminusMesh.clone())
    // For the lower terminus, just duplicating the upperElevatorTerminus for now
    upperElevatorTerminusMesh.position.set(elevatorCableLowerAttachPnt.x, elevatorCableLowerAttachPnt.y, elevatorCableLowerAttachPnt.z)
    elevatorCableMeshes.push(upperElevatorTerminusMesh.clone())
  }
  elevatorCableMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))

}

function constructElevatorCars() {

  const loader = new OBJLoader()
  //const loader = new FBXLoader()//
  loader.load(
    'models/ElevatorPod.obj',
    //'models/TransitCar.fbx',
    addCars,
    // called when loading is in progresses
    function (xhr) {
      console.log((xhr.loaded / xhr.total * 100) + '% elevator car loaded')
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened')
    }
  )

  function addCars(object) {

    // Add elevator Cars
    // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
    const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value
    const elevatorCarPosition_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, elevatorAltitude - crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
    const elevatorCarPosition_y = crv.yc + tram.offset_y(cableOutwardOffset, elevatorAltitude - crv.currentMainRingAltitude, crv.currentEquivalentLatitude)

    //const elevatorCarMesh = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 10, 16), metalicMaterial)
    const elevatorCarMesh = object
    elevatorCarMesh.scale.set(0.25, 0.25, 0.25)

    for (let a = 0, i = 0; i < dParamWithUnits['numElevatorCars'].value; a += Math.PI * 2 / dParamWithUnits['numElevatorCars'].value, i++) {
      const elevatorCarPosition = new THREE.Vector3(
        elevatorCarPosition_r * Math.cos(a),
        elevatorCarPosition_y,
        elevatorCarPosition_r * Math.sin(a)
      )

      // Add elevator car
      elevatorCarMesh.position.set(elevatorCarPosition.x, elevatorCarPosition.y, elevatorCarPosition.z)
      elevatorCarMesh.rotation.x = 0
      elevatorCarMesh.rotation.y = -a
      elevatorCarMesh.rotation.z = crv.currentEquivalentLatitude - Math.PI / 2
      elevatorCarMesh.userData = a
      elevatorCarMeshes.push(elevatorCarMesh.clone())
    }
    elevatorCarMeshes.forEach(mesh => tetheredRingRefCoordSys.add(mesh))
  }
}
if (dParamWithUnits['showElevators'].value) {
  console.log("Constructing Elevator Cables")
  constructElevatorCables()
  console.log("Constructing Elevator Cars")
  constructElevatorCars()
}

// Tethers
const tethers = []
console.log("Constructing Tethers")
constructTethers()

function constructTethers() {
  const tetherPoints = []
  const tetherIndices = []  // These indices index points in tetherPoints, reusing them to save memory
  const tetherStrips = []   // This array will store other arrays that will each define a "strip" of points
  const mrr = 10000 //crv.mainRingRadius

  tetherMath()       // Regenerate the strips of points that define a forking tether
  // Tethered Ring Math
  function tetherMath() {
    // Inputs:
    // gravitationalConstant, radiusOfPlanet, massOfPlanet
    // dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value, dParamWithUnits['massPerMeterOfRing'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['tetherEngineeringFactor'].value, dParamWithUnits['numForkLevels'].value, dParamWithUnits['tetherPointBxAvePercent'].value, dParamWithUnits['tetherPointBxDeltaPercent'].value
    // tetherMaterialDensity, tetherStress

    const final_r = radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value

    const m = dParamWithUnits['massPerMeterOfRing'].value
    const fExertedByGravityOnRing = gravitationalConstant * massOfPlanet * m / (final_r ** 2)

    // The following vectors are cylindricl coordinates
    const fG = new tram.forceVector() // Vector representing the force of gravity at a point on the tether in ring-centered cylindrical coordinates
    const fT = new tram.forceVector() // Vector representing the tensile force exerted at a point on the tether in ring-centered cylindrical coordinates
    const fI = new tram.forceVector() // Vector representing the force of gravity at a point on the tether in ring-centered cylindrical coordinates

    fG.ρ = -fExertedByGravityOnRing * Math.cos(dParamWithUnits['equivalentLatitude'].value)
    fG.φ = 0
    fG.z = -fExertedByGravityOnRing * Math.sin(dParamWithUnits['equivalentLatitude'].value)
    fT.z = -fG.z                     // Eq 6

    const tetherStress = dParamWithUnits['tetherMaterialTensileStrength'].value * 1000000 / dParamWithUnits['tetherEngineeringFactor'].value
    const aveForceOfGravity = gravitationalConstant * massOfPlanet * 1 / ((radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value / 2) ** 2)
    const c = tetherStress / dParamWithUnits['tetherMaterialDensity'].value / aveForceOfGravity  // We're using the average force of gravity here as an engineering approximation (Eq 17)

    // Initially we will assume that PointB is at x=0 on the catenary. This is done just so that we can calculate a temporary "PointP.x", 
    // and then set PointB.x as a percentage of this temporarty PointP.x. 
    const tempPointP = new tram.cateneryVector()
    tempPointP.y = dParamWithUnits['ringFinalAltitude'].value
    tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y / c))      // Eq 11
    tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y / c))      // Eq 13b

    const tetherTypes = [[], []]
    const finalCatenaryTypes = [[], []]                          // Shape of the catenary after the ring is raised to full height - used to "design" the thethers.
    const currentCatenaryTypes = [[], []]                        // Shape of the catenery for the portion of the tethers that are off the ground when the ring is less than fully elevated   
    const finalTetherLength = []
    const currentTetherLength = []
    const numTetherSegments = (2 ** (dParamWithUnits['numForkLevels'].value + 1)) - 1       // Starting from anchor, after each fork the distance to the next fork (or attacment point) is halved
    const numTetherPoints = numTetherSegments + 1                // Because, for example, it takes 5 points to speify 4 segments

    specs['tetherSpacing'] = { value: 2 * crv.mainRingRadius * Math.PI / dParamWithUnits['numTethers'].value, units: "m" }

    finalCatenaryTypes.forEach((catenaryType, j) => {
      const pointB = new tram.cateneryVector()
      const pointP = new tram.cateneryVector()
      const pointA = new tram.cateneryVector()
      const minusplus = [-1, 1]
      pointB.x = tempPointP.x * (dParamWithUnits['tetherPointBxAvePercent'].value + minusplus[j] * dParamWithUnits['tetherPointBxDeltaPercent'].value / 2) / 100
      pointB.θ = pointB.x / c                              // Eq 12
      pointB.y = c * Math.log(1.0 / Math.cos(pointB.x / c))    // Eq 10
      pointB.s = c * Math.acosh(Math.exp(pointB.y / c))      // Eq 13b
      pointP.y = pointB.y + dParamWithUnits['ringFinalAltitude'].value
      pointP.x = c * Math.acos(Math.exp(-pointP.y / c))      // Eq 11
      pointP.s = c * Math.acosh(Math.exp(pointP.y / c))      // Eq 13b
      pointP.θ = pointP.x / c                              // Eq 12
      const ω_P = -(Math.PI / 2 - (dParamWithUnits['equivalentLatitude'].value))
      fT.ρ = fT.z / (Math.tan(pointP.θ + ω_P))               // Eq 20
      fI.ρ = -fG.ρ - fT.ρ                                  // Eq 21
      pointP.T = Math.sqrt(fT.ρ ** 2 + fT.z ** 2)
      pointA.T = pointP.T * Math.cos(pointP.θ)             // Eq 17, Note: pointA.T is also referred to as 'T0'
      pointB.T = pointA.T / Math.cos(pointB.θ)             // Eq 17, Note: pointA.T is also referred to as 'T0'
      finalTetherLength[j] = pointP.s - pointB.s

      const points = [pointB, pointP]
      const label = ['B', 'P']
      points.forEach((point, k) => {
        point.crossSectionalArea = point.T / tetherStress * Math.cosh(point.s / c)        // Eq 14
        // These are simplifed rough calculations. They will help to reveal errors in more precice calculations performed later.
        // There's a cosine effect that will increase stress on the tethers in proportion to their ω angle
        specs['numAnchorPoints_' + label[k] + j] = { value: 2 ** (k * dParamWithUnits['numForkLevels'].value), units: "" }
        specs['tetherCrossSectionalArea_' + label[k] + j] = { value: point.crossSectionalArea * specs['tetherSpacing'].value / specs['numAnchorPoints_' + label[k] + j].value, units: "m2" }
        specs['tetherDiameter_' + label[k] + j] = { value: 2 * Math.sqrt(specs['tetherCrossSectionalArea_' + label[k] + j].value / 2 / Math.PI), units: "m" }  // because: d = 2*r = 2*sqrt(a/2/pi)
        specs['tetherForce_' + label[k] + j] = { value: specs['tetherCrossSectionalArea_' + label[k] + j].value * tetherStress, units: "N" }
      })
      specs['tetherLength_Rough' + j] = { value: pointP.s - pointB.s, units: "m" }       // Note: Does not account for forks
      specs['tetherVolume_Rough' + j] = {
        value: specs['tetherLength_Rough' + j].value * (
          (specs['tetherCrossSectionalArea_' + label[0] + j].value * specs['numAnchorPoints_' + label[0] + j].value) +
          (specs['tetherCrossSectionalArea_' + label[1] + j].value * specs['numAnchorPoints_' + label[1] + j].value)
        ) / 2,
        units: "m3"
      }
      specs['tetherMass_Rough' + j] = { value: specs['tetherVolume_Rough' + j].value * dParamWithUnits['tetherMaterialDensity'].value, units: "kg" }
    })
    specs['tetherMaterialTotalMass_Rough'] = { value: (specs['tetherMass_Rough' + 0].value + specs['tetherMass_Rough' + 1].value) / 2 * dParamWithUnits['numTethers'].value, units: "kg" }
    specs['tetherEqCO2TotalMass_Rough'] = { value: specs['tetherMaterialTotalMass_Rough'].value * 44 / 12, units: "kg" }
    specs['tetherCost_Rough'] = { value: specs['tetherMaterialTotalMass_Rough'].value * dParamWithUnits['tetherMaterialCost'].value / 1000000000, units: "Billion USD" }

    // At this point the final length of the tethers (measured along the catenary) is known, but the tethers current shape is still
    // a function of its state of deployment.
    // The next steps involve calculating the catenary for the current state of deployment, and then mapping the tether design onto that catenary. 

    const r = Math.sqrt(crv.yc * crv.yc + crv.mainRingRadius * crv.mainRingRadius)

    tempPointP.y = r - radiusOfPlanet
    tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y / c))      // Eq 11
    tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y / c))      // Eq 13b

    const pointB_s = []

    currentCatenaryTypes.forEach((catenaryType, j) => {
      const pointB = new tram.cateneryVector()
      const pointP = new tram.cateneryVector()
      const minusplus = [-1, 1]
      pointB.x = tempPointP.x * (dParamWithUnits['tetherPointBxAvePercent'].value + minusplus[j] * dParamWithUnits['tetherPointBxDeltaPercent'].value / 2) / 100
      pointB.y = c * Math.log(1.0 / Math.cos(pointB.x / c))    // Eq 10
      pointB.s = c * Math.acosh(Math.exp(pointB.y / c))      // Eq 13b
      pointB_s[j] = pointB.s  // We'll need to use this later
      pointP.y = pointB.y + crv.currentMainRingAltitude
      pointP.x = c * Math.acos(Math.exp(-pointP.y / c))      // Eq 11
      pointP.s = c * Math.acosh(Math.exp(pointP.y / c))      // Eq 13b
      pointP.θ = pointP.x / c                                  // Eq 12
      const ω_P = -(Math.PI / 2 - crv.currentEquivalentLatitude)   // negative because angle increases in clockwise direction
      fT.ρ = fT.z / (Math.tan(pointP.θ + ω_P))         // Eq 20
      fI.ρ = -fG.ρ - fT.ρ                           // Eq 21

      currentTetherLength[j] = pointP.s - pointB.s

      for (let i = 0; i <= numTetherPoints - 1; i++) {
        const sFraction = i / (numTetherPoints - 1)
        const s = pointB.s + currentTetherLength[j] - finalTetherLength[j] * (1 - sFraction)
        // Compute a distance from the center of the planet and a angle from the ring's axis of symmetry
        const x = 2 * c * Math.atan(Math.exp(s / c)) - (c * Math.PI / 2)   // Eq 15
        const y = c * Math.log(Math.cosh(s / c))                           // Eq 16
        const r = radiusOfPlanet + (y - pointB.y)
        const ω_anchor = ω_P + (pointP.x - pointB.x) / radiusOfPlanet     // Left this unreduced to make it a bit easier to understand the logic
        const ω = ω_anchor - (x - pointB.x) / radiusOfPlanet
        catenaryType.push(new tram.CatenaryPolarVec3(r, ω, s))
      }
    })

    // Dang it!!! I reused 'θ' here so now it has two meanings. It has one meaning in the catenary-of-constant-stress formula and another in the spherical coordinate system in which the tethers are generated.
    // Super sorry! Will add to my backlog.
    class Branch {
      constructor(base_point, base_dr, base_dω, base_dθ, target_point, target_dr, target_dω, target_dθ) {
        this.base_point = base_point
        this.base_dr = base_dr                   // This is the distance from the root tether segment to the base of the current branch in the r-axis
        this.base_dω = base_dω                   // This is the distance from the root tether segment to the base of the current branch in the r-axis
        this.base_dθ = base_dθ                   // This is the distance from the root tether segment to the base of the current branch in the θ-axis
        this.target_point = target_point
        this.target_dr = target_dr               // This is the distance from the root tether segment to point on the ring that the current segment is heading towards, in the r-axis
        this.target_dω = target_dω               // This is the distance from the root tether segment to point on the ring that the current segment is heading towards, in the r-axis
        this.target_dθ = target_dθ               // This is the distance from the root tether segment to point on the ring that the current segment is heading towards, in the θ-axis
        this.dr_0 = base_dr
        this.dr_1 = 0
        this.dω_0 = base_dω
        this.dω_1 = 0
        this.dθ_0 = base_dθ
        this.dθ_1 = 0
        this.stripIndex = -1     // '-1' indicates that a strip has not been started for this branch yet
      }
    }

    if (fastTetherRender) {
      // The 'j' index is used to stagger the tethers 
      // We are assuming here that the ring has a constant altitude, so we can create just two types of tethers and reuse them over and over again, all the way around the ring. 
      // This improves model performance, but it is not accurate for at least two reasons. 1) The earth is a obique spheroid. 2) Economics will no doubt favor a design that is
      // not perfectly circular nor at a constant atitude.
      const referencePoint = new THREE.Vector3().setFromSphericalCoords(radiusOfPlanet + crv.currentMainRingAltitude, -(Math.PI / 2 - crv.currentEquivalentLatitude), 0)
      tetherTypes.forEach((tetherType, j) => {
        const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
        makeTetherStrips(j, θ, referencePoint)
      })
    }
    else {
      for (let j = 0; j < dParamWithUnits['numTethers'].value; j++) {
        //for (let j = dParamWithUnits['numTethers'].value*28/32; j<dParamWithUnits['numTethers'].value*29/32; j++) {
        const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
        const referencePoint = new THREE.Vector3(0, 0, 0)
        makeTetherStrips(j, θ, referencePoint)
      }
    }

    function makeTetherStrips(j, θ, referencePoint) {
      const jModNumTypes = j % currentCatenaryTypes.length
      const catenaryPoints = currentCatenaryTypes[jModNumTypes]
      // Spherical coordinates (r, ω, θ) are defined using three.js convention, where ω is the polar angle, θ is the equitorial angle 
      let r_0 = catenaryPoints[0].r
      let ω_0 = catenaryPoints[0].ω
      let s_0 = catenaryPoints[0].s
      let r_1
      let ω_1
      let s_1
      let branches = []
      branches.push(new Branch(0, 0.0, 0.0, 0.0, numTetherPoints, 0.0, 0.0, 0.0))  // This defines the trunk of the tether

      const mro = (dParamWithUnits['numMainRings'].value - 1) / 2
      for (let i = 0; i <= numTetherPoints - 2; i++) {
        r_1 = catenaryPoints[i + 1].r
        ω_1 = catenaryPoints[i + 1].ω
        s_1 = catenaryPoints[i + 1].s

        if ((s_0 < pointB_s[jModNumTypes]) && (pointB_s[jModNumTypes] < s_1)) {
          // We need to recalculate the r_0, ω_0 values more accurately by using lerps...
          const frac = (pointB_s[jModNumTypes] - s_0) / (s_1 - s_0)
          r_0 = tram.lerp(r_0, r_1, frac)
          ω_0 = tram.lerp(ω_0, ω_1, frac)
        }

        if ((i > 0) && (Number.isInteger(Math.log2(numTetherPoints - i)))) {      // If we're at a point where the tether segments fork...
          const logNumStays = dParamWithUnits['numForkLevels'].value + 1 - Math.log2(numTetherPoints - i)
          const tetherSpan = 2 * Math.PI / dParamWithUnits['numTethers'].value * dParamWithUnits['tetherSpanOverlapFactor'].value
          const target_dθ_Alteration = tetherSpan / (2 ** (logNumStays + 1))
          branches.forEach((branch, index) => {
            if (i < numTetherPoints - 2) {
              // Create two new branches, then delete the original
              branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ + target_dθ_Alteration))
              branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ - target_dθ_Alteration))
            }
            else {
              for (let k = 0; k < dParamWithUnits['numMainRings'].value; k++) {
                const target_dr_Alteration = (k - mro) * dParamWithUnits['mainRingSpacing'].value * Math.sin(crv.constructionEquivalentLatitude)
                const target_dω_Alteration = (k - mro) * dParamWithUnits['mainRingSpacing'].value * Math.cos(crv.constructionEquivalentLatitude) / r_0    // Dividing by r_0 is an approximation, a better r value may be needed for perfect accuracy
                branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr + target_dr_Alteration, branch.target_dω + target_dω_Alteration, branch.target_dθ + target_dθ_Alteration))
                branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr - target_dr_Alteration, branch.target_dω - target_dω_Alteration, branch.target_dθ - target_dθ_Alteration))
              }
            }
            delete branches[index]    // Some advice out there says not to use delete because then len() will return wrong results, but it's efficient at this task
          })
        }
        branches.forEach((branch) => {
          const alpha = (i + 1 - branch.base_point) / (numTetherPoints - 1 - branch.base_point)
          branch.dr_1 = tram.lerp(branch.base_dr, branch.target_dr, alpha)
          branch.dω_1 = tram.lerp(branch.base_dω, branch.target_dω, alpha)
          branch.dθ_1 = tram.lerp(branch.base_dθ, branch.target_dθ, alpha)
          if (s_1 > pointB_s[jModNumTypes]) {   // When raising the ring, points on the parts of the tether that are on the spool have all have the same coordinates (i.e. the spool's coordinates).
            if (s_0 < pointB_s[jModNumTypes]) {
              // We need to recalculate the branch.dr_0 and branch.dθ_0 values more accurately by using a lerp...
              // Note, this code doesn't recalculate the values correctly for the final tether branches that fork away vertically 
              const frac = (pointB_s[jModNumTypes] - s_0) / (s_1 - s_0)
              branch.dr_0 = tram.lerp(branch.dr_0, branch.dr_1, frac)
              branch.dω_0 = tram.lerp(branch.dω_0, branch.dω_1, frac)
              branch.dθ_0 = tram.lerp(branch.dθ_0, branch.dθ_1, frac)
            }
            if (branch.stripIndex == -1) {
              // Start a new array for the strip, add it to the array of arrays, and register its index with the branch object 
              branch.stripIndex = tetherStrips.push([]) - 1
              // Push the branch's first point onto the tether stirps array 
              const point = new THREE.Vector3().setFromSphericalCoords(r_0 + branch.dr_0, ω_0 + branch.dω_0, θ + branch.dθ_0)
              const absolutePoint = new THREE.Vector3().setFromSphericalCoords(r_0 + branch.dr_0, ω_0 + branch.dω_0, θ + branch.dθ_0)
              tetherStrips[branch.stripIndex].push(absolutePoint.sub(referencePoint))
            }
            const absolutePoint = new THREE.Vector3().setFromSphericalCoords(r_1 + branch.dr_1, ω_1 + branch.dω_1, θ + branch.dθ_1)
            tetherStrips[branch.stripIndex].push(absolutePoint.sub(referencePoint))
          }
          branch.dr_0 = branch.dr_1
          branch.dω_0 = branch.dω_1
          branch.dθ_0 = branch.dθ_1
        })
        r_0 = r_1
        ω_0 = ω_1
        s_0 = s_1
      }
    }

    // Convert all of the tetherStrips into indexed lines
    let numIndices = 0
    tetherStrips.forEach(strip => {
      strip.forEach((point, i) => {
        tetherPoints.push(point)
        if (i > 0) {
          tetherIndices.push(numIndices - 1)
          tetherIndices.push(numIndices)
        }
        numIndices++
      })
    })

    // Add tether points to KML file
    if (genKMLFile) {
      planetCoordSys.updateWorldMatrix(true)
      tetheredRingLonCoordSys.updateMatrixWorld(true)
      tetheredRingLatCoordSys.updateMatrixWorld(true)
      tetheredRingRefCoordSys.updateMatrixWorld(true)

      tetherStrips.forEach(strip => {
        kmlFile = kmlFile.concat(kmlutils.kmlTetherPlacemarkHeader)
        strip.forEach((point) => {
          const xyzWorld = tetheredRingRefCoordSys.localToWorld(point.clone())
          const xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
          const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
          //const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
          const coordString = '          ' + Math.round(lla.lon * 10000000) / 10000000 + ',' + Math.round(lla.lat * 10000000) / 10000000 + ',' + Math.round(Math.abs(lla.alt) * 1000) / 1000 + '\n'
          kmlFile = kmlFile.concat(coordString)
        })
        kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)
      })
      kmlFile = kmlFile.concat(kmlutils.kmlFileFooter)
    }
  }

  const tetherGeometry = new THREE.BufferGeometry().setFromPoints(tetherPoints)
  tetherGeometry.setIndex(tetherIndices)
  // tetherGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( tetherPoints, 3 ) );
  // tetherGeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( tetherColors, 3 ) );
  tetherGeometry.computeBoundingSphere()
  tetherPoints.splice(0, tetherPoints.length)   // Frees the memory used for these points
  tetherIndices.splice(0, tetherIndices.length)   // Frees the memory used for these points
  tetherStrips.splice(0, tetherStrips.length)   // Frees the memory used for these points

  const tempTetherMesh = new THREE.LineSegments(tetherGeometry, tetherMaterial)

  if (fastTetherRender) {
    const n = dParamWithUnits['numTethers'].value
    const k = 2 * Math.PI * 2 / n
    for (let i = 0; i < n / 2; i++) {     // Really should be currentCatenaryTypes.length, but that value is hidden from us here
      const θ = i * k
      const referencePoint = new THREE.Vector3().setFromSphericalCoords(radiusOfPlanet + crv.currentMainRingAltitude, -(Math.PI / 2 - crv.currentEquivalentLatitude), θ)
      tempTetherMesh.position.copy(referencePoint)
      tempTetherMesh.rotation.y = θ
      tethers[i] = tempTetherMesh.clone()
      tetheredRingRefCoordSys.add(tethers[i])
    }
  }
  else {
    tethers[0] = tempTetherMesh.clone()
    tetheredRingRefCoordSys.add(tethers[0])
  }
}

if (dParamWithUnits['showLaunchTrajectory'].value) {
  // Launch Trajectory Line
  const l = new launcher.launcher()
  const angleFromNorthPole = (Math.PI / 2 - dParamWithUnits['ringCenterLatitude'].value + (Math.PI / 2 - crv.currentEquivalentLatitude))
  const launcherExitPosition = new THREE.Vector3().setFromSphericalCoords(
    radiusOfPlanet + crv.currentMainRingAltitude,
    angleFromNorthPole,
    dParamWithUnits['ringCenterLongitude'].value
  )

  const launcherExitMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), greenMaterial)
  let launcherExitMarkerSize = 1000
  launcherExitMarker.position.copy(launcherExitPosition)
  launcherExitMarker.scale.set(launcherExitMarkerSize, launcherExitMarkerSize, launcherExitMarkerSize)
  planetCoordSys.add(launcherExitMarker)

  l.Update()
  let ADandV
  ADandV = l.GetAltitudeDistanceAndVelocity(0)
  //const displacement = new THREE.Vector3(0, 0, 0)
  //let distanceTraveledInsideTube = 0
  //let distanceTraveledOutsideTube = 0
  //let angularDistance = (distanceTraveledInsideTube-dParamWithUnits['launchTubeLength'].value)/crv.mainRingRadius
  //let prevVehiclePostion = new THREE.Vector3(crv.mainRingRadius * Math.sin(angularDistance), crv.yf, crv.mainRingRadius * Math.cos(angularDistance))

  let t = 0
  let prevVehiclePostion = new THREE.Vector3(
    (l.R_Earth + ADandV.Altitude) * Math.sin(ADandV.Distance / (l.R_Earth + ADandV.Altitude)),
    crv.yf,
    (l.R_Earth + ADandV.Altitude) * Math.cos(ADandV.Distance / (l.R_Earth + ADandV.Altitude)))
  let currVehiclePostion = new THREE.Vector3(0, 0, 0)
  const color = new THREE.Color()
  const launchTrajectoryPoints = []
  const launchTrajectoryColors = []

  for (t = 1; t < 3 * dParamWithUnits['launchTubeAccelerationTime'].value; t++) {
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

    ADandV = l.GetAltitudeDistanceAndVelocity(t)
    currVehiclePostion = new THREE.Vector3(
      (l.R_Earth + ADandV.Altitude) * Math.sin(ADandV.Distance / (l.R_Earth + ADandV.Altitude)),
      crv.yf,
      (l.R_Earth + ADandV.Altitude) * Math.cos(ADandV.Distance / (l.R_Earth + ADandV.Altitude)))

    launchTrajectoryPoints.push(prevVehiclePostion)
    launchTrajectoryPoints.push(currVehiclePostion)
    prevVehiclePostion = currVehiclePostion.clone()
    color.setHSL(0.5, 0.5, 1.0 * ((t % 10 == 9) || (t % 60 == 58)))   // Draw line with thick and thin tick marks
    launchTrajectoryColors.push(color.r, color.g, color.b)
    launchTrajectoryColors.push(color.r, color.g, color.b)

    const currentAltitude = 32000
    const airDensity = l.GetAirDensity(currentAltitude)
    const vehicleVelocity = 8000  // ToDo
    const vehicleCrossSectionalArea = Math.PI * dParamWithUnits['launchVehicleRadius'].value ** 2
    const forceOfDrag = dParamWithUnits['launchVehicleCoefficientOfDrag'].value * airDensity * vehicleCrossSectionalArea * vehicleVelocity ** 2
    const powerToOvercomeDrag = forceOfDrag * vehicleVelocity

  }

  const launchTrajectoryGeometry = new THREE.BufferGeometry().setFromPoints(launchTrajectoryPoints)
  launchTrajectoryGeometry.setAttribute('color', new THREE.Float32BufferAttribute(launchTrajectoryColors, 3));

  var launchTrajectoryMaterial = new THREE.LineBasicMaterial({
    vertexColors: THREE.VertexColors,
    transparent: true,
    opacity: dParamWithUnits['launchTrajectoryVisibility'].value
  })
  const launchTrajectoryMesh = new THREE.LineSegments(launchTrajectoryGeometry, launchTrajectoryMaterial)
  tetheredRingRefCoordSys.add(launchTrajectoryMesh)
  //planetCoordSys.add( launchTrajectoryMesh )
  // End Launch Trajectory Line
}

function updateRing() {

  // Deletion Section
  mainRingCurveLineMeshes.forEach(mesh => {
    mesh.geometry.dispose()
    mesh.material.dispose()
    tetheredRingRefCoordSys.remove(mesh)
  })
  mainRingCurveLineMeshes.splice(0, mainRingCurveLineMeshes.length)

  if (majorRedesign) {
    mainRingMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      tetheredRingRefCoordSys.remove(mesh)
    })
    mainRingMeshes.splice(0, mainRingMeshes.length)
  }

  if (dParamWithUnits['showTransitSystem'].value) {
    if (majorRedesign) {
      transitSystemMeshes.forEach(mesh => {
        mesh.geometry.dispose()
        mesh.material.dispose()
        tetheredRingRefCoordSys.remove(mesh)
      })
      transitSystemMeshes.splice(0, transitSystemMeshes.length)
      if (dParamWithUnits['showTransitVehicles'].value) {
        //console.log(transitVehicleMeshes)
        transitVehicleMeshes.forEach(mesh => {
          //mesh.geometry.dispose()
          //mesh.material.dispose()
          tetheredRingRefCoordSys.remove(mesh)
        })
        transitVehicleMeshes.splice(0, transitVehicleMeshes.length)
      }
    }
  }

  if (dParamWithUnits['showLaunchTubes'].value) {
    launchTubeMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      tetheredRingRefCoordSys.remove(mesh)
    })
    launchTubeMeshes.splice(0, launchTubeMeshes.length)
  }

  if (dParamWithUnits['showElevators'].value) {
    elevatorCableMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      tetheredRingRefCoordSys.remove(mesh)
    })
    elevatorCableMeshes.splice(0, elevatorCableMeshes.length)

    elevatorCarMeshes.forEach(mesh => {
      //mesh.geometry.dispose()
      //mesh.material.dispose()
      tetheredRingRefCoordSys.remove(mesh)
    })
    elevatorCarMeshes.splice(0, elevatorCarMeshes.length)
  }

  tethers.forEach(tether => {
    tether.geometry.dispose()
    tether.material.dispose()
    //tether.color.dispose()
    tetheredRingRefCoordSys.remove(tether)
  })
  tethers.splice(0, tethers.length)

  // Update the parameters prior to reconsrructing the scene
  updatedParam()

  // Reconstruction Section
  crv = new tram.commonRingVariables(radiusOfPlanet, dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value)
  ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParamWithUnits, crv)

  constructMainRingCurve()
  if (majorRedesign) {
    constructMainRings()
  }
  else {
    mainRingMeshes.forEach((mesh, i) => {
      mesh.position.y = crv.yc + (i - ((dParamWithUnits['numMainRings'].value - 1) / 2)) * dParamWithUnits['mainRingSpacing'].value
    })
  }

  if (dParamWithUnits['showTransitSystem'].value) {
    if (majorRedesign) {
      constructTransitSystem()
      if (dParamWithUnits['showTransitVehicles'].value) {
        constructTransitVehicles()
      }
    }
    else {
      transitSystemMeshes.forEach((mesh, i) => {
        const transitTube_y = crv.yc + tram.offset_y(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
        if (i == 0) {
          mesh.position.y = transitTube_y
        }
        else {
          //const outwardOffset = trackOffsetsList[i-1][0] * dParamWithUnits['transitTubeTubeRadius'].value 
          //const upwardOffset = trackOffsetsList[i-1][1] * dParamWithUnits['transitTubeTubeRadius'].value
          //mesh.position.y = transitTube_y + tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        }
      })
    }
  }

  if (dParamWithUnits['showLaunchTubes'].value) {
    console.log("Updating Launch Tube")
    constructLaunchTube()
  }
  if (dParamWithUnits['showElevators'].value) {
    console.log("Updating Elevator Cables")
    constructElevatorCables()
    console.log("Updating Elevator Cars")
    constructElevatorCars()
  }
  console.log("Updating Tethers")
  constructTethers()

  if (genSpecsFile) {
    console.log("Generating Specs File")
    specsFile = specsFile.concat('// Derived Specifications\n')
    Object.entries(specs).forEach(([k, v]) => {
      specsFile = specsFile.concat(k + ',' + v.value + ',' + v.units + '\n')
    })
  }
}

const mouse = {
  x: undefined,
  y: undefined
}
let intersectionPoint = new THREE.Vector3
let targetPoint = new THREE.Vector3
let animateRingRaising = false
let animateRingLowering = false
let animateZoomingIn = false
let animateZoomingOut = false
let animateCameraGoingUp = false
let animateCameraGoingDown = false
const clock = new THREE.Clock();
let timeSinceStart = 0

function animate() {
  renderer.setAnimationLoop(renderFrame)
}

function renderFrame() {
  //requestAnimationFrame(animate)
  //simContainer = document.querySelector('#simContainer')
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)
  //renderer.setViewport( 0, 0, simContainer.offsetWidth, simContainer.offsetHeight )

  if (orbitControlsEarthRingLerpFactor != 1) {
    console.log("Lerping...")
    orbitControlsEarthRingLerpFactor = tram.clamp(orbitControlsEarthRingLerpFactor + orbitControlsEarthRingLerpSpeed, 0, 1)

    orbitControls.enabled = false
    orbitControls.target.lerpVectors(previousTargetPoint, orbitControlsTargetPoint, orbitControlsEarthRingLerpFactor)
    const upVector = new THREE.Vector3()
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

  //planetMesh.rotation.y += 0.000001
  if (animateZoomingIn || animateZoomingOut) {
    var offset = new THREE.Vector3
    offset.copy(orbitControls.object.position).sub(orbitControls.target)
    if (animateZoomingIn) {
      offset.multiplyScalar(0.995)
    } else if (animateZoomingOut) {
      offset.multiplyScalar(1.005)
    }
    orbitControls.object.position.copy(orbitControls.target).add(offset);
  }
  orbitControls.update()
  const delta = clock.getDelta()
  timeSinceStart += delta

  if (animateRingRaising || animateRingLowering) {
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      v.value = guidParam[k]
    })

    if (animateRingRaising) {
      guidParamWithUnits['ringAmountRaisedFactor'].value = Math.min(1, guidParamWithUnits['ringAmountRaisedFactor'].value + delta * 0.01)
      if (guidParamWithUnits['ringAmountRaisedFactor'].value == 1) animateRingRaising = false
    }
    if (animateRingLowering) {
      guidParamWithUnits['ringAmountRaisedFactor'].value = Math.max(0, guidParamWithUnits['ringAmountRaisedFactor'].value - delta * 0.01)
      if (guidParamWithUnits['ringAmountRaisedFactor'].value == 0) animateRingLowering = false
      //cameraGroup.position.z -= -0.0001 * radiusOfPlanet
      //console.log(cameraGroup.position.z/radiusOfPlanet)
    }
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      guidParam[k] = v.value
    })

    adjustRingDesign()
  }
  if (animateCameraGoingUp || animateCameraGoingDown) {
    if (animateCameraGoingUp) {
      camera.position.multiplyScalar(1.000001)
      orbitControls.target.multiplyScalar(1.000001)
      if (camera.position.length() >= radiusOfPlanet + 100000) animateCameraGoingUp = false
    }
    if (animateCameraGoingDown) {
      camera.position.multiplyScalar(0.999999)
      orbitControls.target.multiplyScalar(0.999999)
      if (camera.position.length() <= radiusOfPlanet) animateCameraGoingDown = false
    }
  }

  if (dParamWithUnits['showElevators'].value && dParamWithUnits['animateElevators'].value) {
    elevatorAltitude = tram.getElevatorCarAltitude(dParamWithUnits, crv, ecv, timeSinceStart)
    //console.log(elevatorAltitude)
    const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value
    elevatorCarMeshes.forEach(mesh => {
      const a = mesh.userData
      const elevatorCarPosition_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, elevatorAltitude - crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
      const elevatorCarPosition_y = crv.yc + tram.offset_y(cableOutwardOffset, elevatorAltitude - crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
      mesh.position.set(elevatorCarPosition_r * Math.cos(a), elevatorCarPosition_y, elevatorCarPosition_r * Math.sin(a))
    })
  }

  if (dParamWithUnits['showTransitSystem'].value && dParamWithUnits['showTransitVehicles'].value && dParamWithUnits['animateTransitVehicles'].value) {
    const TransitVehiclePosition = tram.getTransitVehiclePosition(dParamWithUnits, crv, tvv, timeSinceStart)
    const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value
    const sign = [0, -1, 0, 1]
    transitVehicleMeshes.forEach(mesh => {
      const a = mesh.userData.a
      const i = mesh.userData.i

      const outwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value + trackOffsetsList[i][0] * dParamWithUnits['transitTubeTubeRadius'].value
      const upwardOffset = dParamWithUnits['transitTubeUpwardOffset'].value + trackOffsetsList[i][1] * dParamWithUnits['transitTubeTubeRadius'].value - dParamWithUnits['transitVehicleRadius'].value - .35  // Last is half of the track height
      computeTransitVehiclePositionAndRotation(mesh, outwardOffset, upwardOffset, a, TransitVehiclePosition * sign[i])
    })
  }

  if (camera.position.length() > (radiusOfPlanet + crv.currentMainRingAltitude) * 1.1) {
    // To improve rendering performance when zoomed out, make parts of the ring invisible
    stars.visible = true
    transitSystemMeshes.forEach(mesh => { mesh.visible = false })
    transitVehicleMeshes.forEach(mesh => { mesh.visible = false })
    mainRingMeshes.forEach(mesh => { mesh.visible = false })
    elevatorCarMeshes.forEach(mesh => { mesh.visible = false })
  }
  else {
    stars.visible = false
    transitSystemMeshes.forEach(mesh => { mesh.visible = true })
    transitVehicleMeshes.forEach(mesh => { mesh.visible = true })
    mainRingMeshes.forEach(mesh => { mesh.visible = true })
    elevatorCarMeshes.forEach(mesh => { mesh.visible = true })
  }
  if (camera.position.length() > radiusOfPlanet * 4) {
    launchTubeMeshes.forEach(mesh => { mesh.visible = false })
    elevatorCableMeshes.forEach(mesh => { mesh.visible = false })
  }
  else {
    launchTubeMeshes.forEach(mesh => { mesh.visible = true })
    elevatorCableMeshes.forEach(mesh => { mesh.visible = true })
  }
  renderer.render(scene, camera)
  transitSystemMeshes.forEach(mesh => { mesh.visible = true })

  stats.update();
}

console.log("Adding resize event listener")
window.addEventListener('resize', onWindowResize)
function onWindowResize() {
  simContainer = document.querySelector('#simContainer')
  camera.aspect = simContainer.offsetWidth / simContainer.offsetHeight
  camera.updateProjectionMatrix()
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)
  renderer.setSize(simContainer.offsetWidth, simContainer.offsetHeight)
  //console.log("resizing...", simContainer.offsetWidth, simContainer.offsetHeight)
}

console.log("Adding keydown event listener")
document.addEventListener('keydown', onKeyDown)

console.log("Adding mousemove event listener")
addEventListener('mousemove', (event) => {
  mouse.x = 2 * (event.clientX / simContainer.offsetWidth) - 1
  mouse.y = 1 - 2 * (event.clientY / simContainer.offsetHeight)
})

console.log("Adding keydown event listener")
console.log("Adding VR button")
document.body.appendChild(VRButton.createButton(renderer))

console.log("Calling animate")
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

function onKeyDown(event) {
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    v.value = guidParam[k]
  })

  switch (event.keyCode) {
    case 79: /*O*/
      orbitControls.target.set(0, 0, 0)
      orbitControls.rotateSpeed = 1
      orbitControls.upDirection.set(0, 1, 0)
      orbitControls.maxPolarAngle = Math.PI
      orbitControlsNewMaxPolarAngle = Math.PI
      camera.up.set(0, 1, 0)
      break;
    case 80: /*P*/
      raycaster.setFromCamera(mouse, camera)
      let planetIntersects = []
      planetMeshes.forEach(mesh => {
        planetIntersects.push.apply(planetIntersects, raycaster.intersectObject(mesh))
      })
      let transitTubeIntersects = []
      if (dParamWithUnits['showTransitSystem'].value) {
        transitSystemMeshes.forEach(mesh => {
          transitTubeIntersects.push.apply(transitTubeIntersects, raycaster.intersectObject(mesh))
        })
      }
      if (transitTubeIntersects.length > 0) {
        intersectionPoint = transitTubeIntersects[0].point
        targetPoint = intersectionPoint
        extraDistanceForCamera = 100
        orbitControls.rotateSpeed = 0.05
      }
      else if (planetIntersects.length > 0) { // Note: would probably be advisable to assert here that there is only one intersection point.
        intersectionPoint = planetIntersects[0].point
        // Because we want to orbit around a point at the altitude of the ring...
        targetPoint = intersectionPoint.multiplyScalar((radiusOfPlanet + crv.currentMainRingAltitude) / radiusOfPlanet)
        extraDistanceForCamera = 10000
        orbitControls.rotateSpeed = 0.9
        // Uncomment this line if you want to print lat, lon, and alt to console
        //console.log(tram.xyz2lla(intersectionPoint.x, intersectionPoint.y, intersectionPoint.z))
      }
      if (planetIntersects.length > 0 || transitTubeIntersects.length > 0) {
        previousTargetPoint.copy(orbitControls.target.clone())
        previousUpVector.copy(orbitControls.upDirection.clone())
        orbitControlsTargetPoint.copy(targetPoint.clone())
        orbitControlsTargetUpVector = planetCoordSys.worldToLocal(orbitControlsTargetPoint.clone()).normalize()
        orbitControlsEarthRingLerpFactor = 0
        orbitControlsEarthRingLerpSpeed = 1 / 32
        orbitControlsNewMaxPolarAngle = Math.PI / 2 + .1
      }
      break;
    case 81: /*Q*/
      orbitControls.autoRotate ^= true
      break;
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
      animateRingRaising = !animateRingRaising
      animateRingLowering = false
      break;
    case 76: /*L*/
      // Lower the Ring
      animateRingRaising = false
      animateRingLowering = !animateRingLowering
      break;
    case 85: /*U*/
      // Move the Camera Up
      animateCameraGoingUp = !animateCameraGoingUp
      animateCameraGoingDown = false
      break;
    case 68: /*D*/
      animateCameraGoingDown = !animateCameraGoingDown
      animateCameraGoingUp = false
      break;
    case 87: /*W*/
      // This executes and instantaneous "Warp" to a position much closer to the ring
      orbitControls.maxPolarAngle = Math.PI / 2 + .1
      orbitControlsNewMaxPolarAngle = Math.PI / 2 + .1
      orbitControls.target.set(-3763210.8232434946, 4673319.5670904, -2255256.723306473)
      orbitControls.upDirection.set(-0.5870824578788134, 0.7290700269983701, -0.351839570519814)
      orbitControls.object.position.set(-3764246.447379286, 4672428.630481427, -2255483.089866906)
      camera.up.set(-0.5870824578788134, 0.7290700269983701, -0.351839570519814)
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
    case 88: /*X*/
      animateZoomingIn = false
      animateZoomingOut = !animateZoomingOut
      break;
    case 90: /*Z*/
      animateZoomingIn = !animateZoomingIn
      animateZoomingOut = false
      break;
    case 69: /*E*/
      recomputeNearFarClippingPlanes()
      break;
    case 70: /*F*/
      guidParamWithUnits['ringFinalAltitude'].value = 200000  // m
      guidParamWithUnits['equivalentLatitude'].value = Math.acos(targetRadius / (radiusOfPlanet + guidParamWithUnits['ringFinalAltitude'].value)) * 180 / Math.PI
      guidParamWithUnits['ringAmountRaisedFactor'].value = 0.01
      guidParamWithUnits['numMainRings'].value = 1
      //guidParamWithUnits['mainRingTubeRadius'].value = 1
      guidParamWithUnits['numTethers'].value = 180
      guidParamWithUnits['numForkLevels'].value = 6
      guidParamWithUnits['tetherSpanOverlapFactor'].value = 1
      guidParamWithUnits['tetherPointBxAvePercent'].value = 0.8
      guidParamWithUnits['tetherPointBxDeltaPercent'].value = 0
      guidParamWithUnits['tetherEngineeringFactor'].value = 0.5
      guidParamWithUnits['numElevatorCables'].value = 180
      guidParamWithUnits['numElevatorCars'].value = 0
      adjustRingDesign()
      guidParamWithUnits['moveRing'].value = 0
      adjustRingLatLon()
      guidParamWithUnits['cableVisibility'].value = 0.1
      adjustCableOpacity()
      guidParamWithUnits['tetherVisibility'].value = 1
      adjustTetherOpacity()
      planetCoordSys.rotation.y = 2 * Math.PI * -(213.7 + 180) / 360
      planetCoordSys.rotation.x = 2 * Math.PI * (90 + 19.2) / 360
      break;
  }
  Object.entries(guidParamWithUnits).forEach(([k, v]) => {
    guidParam[k] = v.value
  })
}

function orbitControlsEventHandler() {
  //console.log("recomputing near/far")
  recomputeNearFarClippingPlanes()
  //console.log("auto-adjusting orbit target")
  autoAdjustOrbitControlsCenter()
  //console.log("done")
}

function recomputeNearFarClippingPlanes() {
  // Calculate the distance to the nearest object - for this we will use the sphere encompassing the Earth and it's stratosphere
  // Multiply that by the cosine of thecamera's fulstrum angle
  camera.near = Math.max(10, camera.position.distanceTo(planetMeshes[0].position) - (radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value + extraDistanceForCamera)) * Math.cos(camera.getEffectiveFOV() * Math.PI / 180)
  // Far calculation: Use the pythagorean theorm to compute distance to the Earth's horizon,
  // then add the distrance from there to the edge of the sphere that represents the atmosphere,
  // then pad this sum by a factor of 1.5
  const d1Squared = camera.position.distanceTo(planetMeshes[0].position) ** 2 - radiusOfPlanet ** 2
  const d2Squared = (radiusOfPlanet * 1.1) ** 2 - radiusOfPlanet ** 2
  let d1, d2
  if (d1Squared > 0) {
    d1 = Math.sqrt(d1Squared)
  }
  else {
    d1 = 0
  }
  if (d2Squared > 0) {
    d2 = Math.sqrt(d2Squared)
  }
  else {
    d2 = 0
  }
  camera.far = Math.max(camera.near * 16384, (d1 + d2) * 1.5)

  // Hack
  if (enableVR) {
    camera.near = 0.0001 * radiusOfPlanet
    camera.far = 1 * radiusOfPlanet
  }
  //console.log(camera.near, camera.near*16384, (d1+d2)*1.5, camera.far, 2)
  camera.updateProjectionMatrix()
  nearClippingPlane = camera.near
  farClippingPlane = camera.far
}

let previousUpVector = new THREE.Vector3(0, 1, 0)
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
  const innerTransitionDistance = radiusOfPlanet + 1000000
  const outerTransitionDistance = radiusOfPlanet + 2000000
  if (distanceToCenterOfEarth > outerTransitionDistance) {
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
      orbitControlsEarthRingLerpSpeed = 1 / 256
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
  else if (distanceToCenterOfEarth <= innerTransitionDistance) {
    if (!toRingAlreadyTriggered) {
      const screenCenter = new THREE.Vector2(0, 0) // The center of the screen is, by definition, (0,0)
      raycaster.setFromCamera(screenCenter, camera)
      const planetIntersects = []

      const intersection = (mesh) => {
        const point = new THREE.Vector3();
        return raycaster.ray.intersectSphere(mesh.geometry.boundingSphere, point)
      }

      planetMeshes.forEach(mesh => {
        const intersects = intersection(mesh);
        intersects && planetIntersects.push(intersects)
      })

      console.log(planetIntersects)
      const pointOnEarthsSurface = planetIntersects[0]
      // Second criteria is that we're sufficiently close to the point that the user wants to zoom into, even if they are zooming in at an oblique angle.
      const distanceToPointOnEarthsSurface = pointOnEarthsSurface.clone().sub(camera.position).length()
      if (distanceToPointOnEarthsSurface < innerTransitionDistance) {
        //previousTargetPoint.copy(orbitControlsTargetPoint.clone())
        //previousUpVector.copy(orbitControlsTargetUpVector.clone())
        previousTargetPoint.copy(orbitControls.target.clone())
        previousUpVector.copy(orbitControls.upDirection.clone())
        // ToDo: Need to find the nearest point on the ring to the orbitControlsSurfaceMarker and set orbitControlsTargetPoint to that
        // Convert pointOnEarthsSurface into tetheredRingRefCoordSys
        const localPoint = tetheredRingRefCoordSys.worldToLocal(pointOnEarthsSurface.clone()).normalize()
        // Then compute it's theata value
        const originalTheta = Math.atan2(localPoint.z, localPoint.x)
        // Round theta to align it with the position of an elevator cable
        const numGoodSpots = Math.min(dParamWithUnits['numTransitVehicles'].value, dParamWithUnits['numElevatorCables'].value)
        const roundedTheta = Math.round(originalTheta / (Math.PI * 2) * numGoodSpots) / numGoodSpots * Math.PI * 2
        // Then find a point on the ring with the same theta value
        const transitTube_r = crv.mainRingRadius + tram.offset_r(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
        const transitTube_y = crv.yc + tram.offset_y(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
        localPoint.set(transitTube_r * Math.cos(roundedTheta), transitTube_y, transitTube_r * Math.sin(roundedTheta))
        // Convert that point back into planetCoordSys
        const worldPoint = tetheredRingRefCoordSys.localToWorld(localPoint.clone())
        //orbitControlsCenterMarker.position.copy(worldPoint.clone())
        orbitControlsTargetPoint.copy(worldPoint.clone())
        orbitControlsTargetUpVector = planetCoordSys.worldToLocal(worldPoint.clone()).normalize()
        orbitControlsEarthRingLerpFactor = 0
        orbitControlsEarthRingLerpSpeed = 1 / 256
        orbitControlsNewMaxPolarAngle = Math.PI / 2 + .1
        orbitControls.rotateSpeed = 0.9
        //orbitControlsSurfaceMarker.visible = false
        toRingAlreadyTriggered = true
      }
    }
    toPlanetAlreadyTriggered = false // Reset trigger      
  }
}

if (enableKMLFileFeature) {
  // This code creates the button that downloads a .kml file which can be displayed using
  // Google Earth's "Create Project" button, followed by "Import KML file from computer"
  var textFile = null
  var makeTextFile = function () {
    genKMLFile = true
    const prevFastTetherRender = fastTetherRender
    fastTetherRender = false // Can't generate a KML file when using the fast tether rendering technique
    kmlFile = ''
    kmlFile = kmlutils.kmlFileHeader
    updateRing()
    genKMLFile = false
    fastTetherRender = prevFastTetherRender
    var data = new Blob([kmlFile], { type: 'text/plain' })
    // If we are replacing a previously generated file we need to manually revoke the object URL to avoid memory leaks.
    if (textFile !== null) {
      window.URL.revokeObjectURL(textFile)
    }
    textFile = window.URL.createObjectURL(data)
    return textFile
  }

  var createkml = document.getElementById('createkml')

  createkml.addEventListener('click', function () {
    var link = document.createElement('a')
    link.setAttribute('download', 'tethered_ring.kml')
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

if (enableSpecsFileFeature) {
  // This code creates the button that downloads a .csv file which can be loadd into Excel
  var textFile = null
  var makeTextFile = function () {
    genSpecsFile = true
    const prevFastTetherRender = fastTetherRender
    specsFile = ''
    updateRing()
    genSpecsFile = false
    fastTetherRender = prevFastTetherRender
    var data = new Blob([specsFile], { type: 'text/plain' })
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

