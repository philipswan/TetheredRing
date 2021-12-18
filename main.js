import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
//import * as THREE from '../three.js'

//import { OrbitControls } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/OrbitControls.js'
//import { OrbitControls } from '../three.js/examples/jsm/controls/OrbitControls.js'
import { OrbitControls } from './OrbitControlsModified.js'

//import { LineMaterial } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/lines/LineMaterial.js'

import { VRButton } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/webxr/VRButton.js'
//import { VRButton } from '../three.js/examples/jsm/webxr/VRButton.js'

//import Stats from '/jsm/libs/stats.module.js'

import vertexShader from './shaders/vertex.glsl'
import fragmentShader from './shaders/fragment.glsl'
import atmosphereVertexShader from './shaders/atmosphereVertex.glsl'
import atmosphereFragmentShader from './shaders/atmosphereFragment.glsl'

import * as dat from 'dat.gui'
import * as tram from './tram.js'
import * as launcher from './launcher.js'
import * as kmlutils from './kmlutils.js'

const enableVR = false
const enableKMLFileFeature = true
const enableSpecsFileFeature = true
let genKMLFile = false
let genSpecsFile = false
let fastTetherRender = true
const majorRedesign = false // False enables work in progress...

// Useful constants that we never plan to change
const gravitationalConstant = 0.0000000000667408
const massOfPlanet = 5.97E+24   // kg   using mass of Earth for now
const radiusOfPlanet = 6378100 // m   using radius of Earth for now
const WGS84FlattenningFactor = 298.257223563    // Used to specify the exact shape of earth, which is approximately an oblate spheroid
const lengthOfSiderealDay = 86164.0905 // seconds    using value for Earth for now

// Constants controlled by sliders
const guidParamWithUnits = {
  //equivalentLatitude: 35.473512807508094,
  // Alternate location with the increased diameter needed to reach both US and China's coastlines (note: too large to construct in the Pacific Ocean)
  //equivalentLatitude: 30.8,
  //ringCenterLongtitude: 182,
  //ringCenterLatitude: 11,
  //ringFinalAltitude: 32000,  // m
  equivalentLatitude: {value:35.473512807508094, units: "degrees"},
  ringCenterLongtitude: {value:186.3, units: "degrees"},
  ringCenterLatitude: {value:14.2, units: "degrees"},
  ringFinalAltitude: {value:32000, units: "meters"},
  ringAmountRaisedFactor: {value:1, units: ""},
  numMainRings: {value:5, units: ""},
  mainRingTubeRadius: {value:0.5, units: "meters"},
  buildLocationRingEccentricity: {value:1, units: ""},
  mainRingEccentricity: {value:1, units: ""},
  mainRingSpacing: {value:10, units: "meters"},
  numTethers: {value:2048, units: ""},
  numForkLevels: {value:5, units: ""},       // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from base to a single attachment point)
  tetherSpanOverlapFactor: {value:2, units: "%"},
  tetherPointBxAvePercent: {value:50, units: "%"},
  tetherPointBxDeltaPercent: {value:40, units: "%"},
  tetherEngineeringFactor: {value:2, units: ""},
  cableVisibility: {value:0.2, units: ""},
  tetherVisibility: {value:0.2, units: ""},
  moveRing: {value:1, units: ""},
  transitTubeUpwardOffset: {value:-100, units: "meters"},
  launchTubeUpwardOffset: {value:100, units: "meters"},
  numTransitTrackLevels: {value:2, units: ""},
  numElevatorCables: {value:1800, units: ""},
  numElevatorCars: {value:1800, units: ""},
  massPerMeterOfRing: {value:100, units: "kg"},
  tetherMaterialDensity: {value:1800, units: "kg*m-3"},
  tetherMaterialTensileStrength: {value:6370, units: "MPa"},
  tetherMaterialCost: {value:21.5, units: "USD/kg"},  
}

// Override one of the initial values with a calcuated value...
const targetRadius = 32800000 / Math.PI / 2   // 32800 km is the max size a perfectly circular ring can be and still fits within the Pacific Ocean
guidParamWithUnits['equivalentLatitude'].value = Math.acos(targetRadius/(radiusOfPlanet + guidParamWithUnits['ringFinalAltitude'].value)) * 180 / Math.PI

// The GUI() object doesn't accept out key value pairs, so we need to create a simplified structure in order for GUI to work
const guidParam = {}
Object.entries(guidParamWithUnits).forEach(([k, v]) => {
  guidParam[k] = v.value
})

const gui = new dat.GUI()
gui.add(guidParam, 'equivalentLatitude', 10, 80).onChange(adjustRingDesign)
gui.add(guidParam, 'ringCenterLongtitude', 0, 360).onChange(adjustRingLatLon)
//gui.add(guidParam, 'ringCenterLongtitude', 185.8-5, 185.5+5).onChange(adjustRingLatLon)
gui.add(guidParam, 'ringCenterLatitude', -90, 90).onChange(adjustRingLatLon)
//gui.add(guidParam, 'ringCenterLatitude', 14-5, 14+5).onChange(adjustRingLatLon)
gui.add(guidParam, 'ringFinalAltitude', 0, 200000).onChange(adjustRingDesign)
gui.add(guidParam, 'ringAmountRaisedFactor', 0, 1).onChange(adjustRingDesign)
gui.add(guidParam, 'numMainRings', 1, 7).onChange(adjustRingDesign).step(1)
gui.add(guidParam, 'buildLocationRingEccentricity', 0.97, 1.03).onChange(adjustRingDesign).step(0.001)
gui.add(guidParam, 'mainRingEccentricity', 0.97, 1.03).onChange(adjustRingDesign).step(0.001)
gui.add(guidParam, 'mainRingSpacing', 1, 30).onChange(adjustRingDesign).step(1)
gui.add(guidParam, 'numTethers', 0, 7200).onChange(adjustRingDesign).step(2) // We want an even number since we're supportting staggered thethers
gui.add(guidParam, 'numForkLevels', 0, 8).onChange(adjustRingDesign).step(1)
gui.add(guidParam, 'tetherSpanOverlapFactor', 0.5, 4).onChange(adjustRingDesign)
gui.add(guidParam, 'tetherPointBxAvePercent', 0, 100).onChange(adjustRingDesign)
gui.add(guidParam, 'tetherPointBxDeltaPercent', 0, 50).onChange(adjustRingDesign)
gui.add(guidParam, 'tetherEngineeringFactor', 0, 10).onChange(adjustRingDesign)
gui.add(guidParam, 'cableVisibility', 0, 1).onChange(adjustCableOpacity)
gui.add(guidParam, 'tetherVisibility', 0, 1).onChange(adjustTetherOpacity)
gui.add(guidParam, 'moveRing', 0, 1).onChange(adjustRingLatLon)
gui.add(guidParam, 'massPerMeterOfRing', 1, 1000).onChange(adjustRingDesign)
gui.add(guidParam, 'tetherMaterialDensity', 400, 8000).onChange(adjustRingDesign)
gui.add(guidParam, 'tetherMaterialTensileStrength', 500, 30000).onChange(adjustRingDesign)
gui.add(guidParam, 'tetherMaterialCost', 1, 100).onChange(adjustRingDesign)


// Actual Design Parameters derived from slider values
let dParamWithUnits = {
  equivalentLatitude: {value:0.6191295957393937, units: "radians"},
  ringCenterLongtitude: {value:3.251548396465436, units: "radians"},
  ringCenterLatitude: {value:0.24783675378319478, units: "radians"},
  ringFinalAltitude: {value:32000, units: "meters"},
  ringAmountRaisedFactor: {value:1, units: ""},
  numControlPoints: {value:256, units: ""},
  numMainRings: {value:5, units: ""},
  buildLocationRingEccentricity: {value:1, units: ""},
  mainRingEccentricity: {value:1, units: ""},
  mainRingTubeRadius: {value:0.5, units: "meters"},
  mainRingSpacing: {value:10, units: "meters"},
  numTethers: {value:2048, units: ""},
  numForkLevels: {value:5, units: ""},    // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from an anchor to a single ring attachment point)
  tetherSpan: {value:0.006135923151542565, units: "radians"}, 
  tetherPointBxAvePercent: {value:50, units: "%"},
  tetherPointBxDeltaPercent: {value:40, units: "%"},
  tetherEngineeringFactor: {value:2, units: ""},
  cableVisibility: {value:0.2, units: ""},
  tetherVisibility: {value:0.2, units: ""},
  transitTubeUpwardOffset: {value:-100, units: "meters"},
  additionalUpperElevatorCable: {value:10, units: "meters"},
  transitTubeTubeRadius: {value:6, units: "meters"},
  launchTubeUpwardOffset: {value:100, units: "meters"},
  numTransitTrackLevels: {value:2, units: ""},
  launchTubeLength: {value:1066666.6666666667, units: "meters"},
  launchTubeAcceleration: {value:30, units: "meters"},
  launchTubeExitVelocity: {value:8000, units: "m*s-1"},
  launchTubeAccelerationTime: {value:266.6666666666667, units: "s"},
  launchTragectoryVisibility: {value:1, units: ""},
  transitTubeOutwardOffset: {value:-10, units: "meters"},
  elevatorUpperTerminusOutwardOffset: {value:-30, units: "meters"},
  numElevatorCables: {value:1800, units: ""},
  numElevatorCars: {value:1800, units: ""},
  showEarthEquator: {value:true, units: ""},
  showEarthAxis: {value:true, units: ""},
  showLaunchOrbit: {value:false, units: ""},
  showLaunchTrajectory: {value:false, units: ""},
  showTransitSystem: {value:true, units: ""},
  showLaunchTubes: {value:false, units: ""},
  showElevators: {value:true, units: ""},
  animateElevators: {value:true, units: ""},
  massPerMeterOfRing: {value:100, units: "kg"},
  tetherMaterialDensity: {value:1800, units: "kg*m-3"},
  tetherMaterialTensileStrength: {value:6370, units: "MPa"},
  tetherMaterialCost: {value:21.5, units: "USD/kg"},
}

// Convert the more complex dictionary containing values and units into a simplified dictionary that only contains values 
const dParam = {}
Object.entries(dParamWithUnits).forEach(([k, v]) => {
  dParam[k] = v.value
})

let kmlFile = ''
let specsFile = ''

function updatedParam() {   // Read as "update_dParam"
  // Build location (assumes equivalentLatitude = 35)
  const buildLocationRingCenterLongtitude = 213.7    // Degrees
  const buildLocationRingCenterLatitude = -19.2      // Degrees
  dParamWithUnits['equivalentLatitude'].value = guidParam.equivalentLatitude / 180 * Math.PI
  dParamWithUnits['ringCenterLongtitude'].value = tram.lerp(buildLocationRingCenterLongtitude, guidParam.ringCenterLongtitude, guidParam.moveRing)  / 180 * Math.PI
  dParamWithUnits['ringCenterLatitude'].value = tram.lerp(buildLocationRingCenterLatitude, guidParam.ringCenterLatitude, guidParam.moveRing) / 180 * Math.PI
  dParamWithUnits['ringFinalAltitude'].value = guidParam.ringFinalAltitude
  dParamWithUnits['ringAmountRaisedFactor'].value = guidParam.ringAmountRaisedFactor
  dParamWithUnits['numMainRings'].value = guidParam.numMainRings
  dParamWithUnits['mainRingEccentricity'].value = tram.lerp(guidParam.buildLocationRingEccentricity, guidParam.mainRingEccentricity, guidParam.moveRing)
  dParamWithUnits['mainRingTubeRadius'].value = guidParam.mainRingTubeRadius
  dParamWithUnits['numTethers'].value = guidParam.numTethers
  dParamWithUnits['numForkLevels'].value = guidParam.numForkLevels
  dParamWithUnits['tetherSpan'].value = 2 * Math.PI / guidParam.numTethers * guidParam.tetherSpanOverlapFactor
  dParamWithUnits['tetherPointBxAvePercent'].value = guidParam.tetherPointBxAvePercent
  dParamWithUnits['tetherPointBxDeltaPercent'].value = guidParam.tetherPointBxDeltaPercent
  dParamWithUnits['tetherEngineeringFactor'].value = guidParam.tetherEngineeringFactor
  dParamWithUnits['cableVisibility'].value = guidParam.cableVisibility
  dParamWithUnits['tetherVisibility'].value = guidParam.tetherVisibility
  dParamWithUnits['transitTubeUpwardOffset'].value = guidParam.transitTubeUpwardOffset
  dParamWithUnits['additionalUpperElevatorCable'].value = 10
  dParamWithUnits['launchTubeUpwardOffset'].value = guidParam.launchTubeUpwardOffset
  dParamWithUnits['numTransitTrackLevels'].value = guidParam.numTransitTrackLevels
  dParamWithUnits['launchTubeAcceleration'].value = 30 // m/s2
  dParamWithUnits['launchTubeExitVelocity'].value = 8000 // m/s
  dParamWithUnits['launchTubeLength'].value = dParamWithUnits['launchTubeExitVelocity'].value**2 /2 / dParamWithUnits['launchTubeAcceleration'].value
  dParamWithUnits['launchTubeAccelerationTime'].value = dParamWithUnits['launchTubeExitVelocity'].value / dParamWithUnits['launchTubeAcceleration'].value
  dParamWithUnits['launchTragectoryVisibility'].value = 1.0
  dParamWithUnits['numElevatorCables'].value = guidParam.numElevatorCables
  dParamWithUnits['numElevatorCars'].value = guidParam.numElevatorCars
  dParamWithUnits['massPerMeterOfRing'].value = guidParam.massPerMeterOfRing
  dParamWithUnits['tetherMaterialDensity'].value = guidParam.tetherMaterialDensity
  dParamWithUnits['tetherMaterialTensileStrength'].value = guidParam.tetherMaterialTensileStrength
  dParamWithUnits['tetherMaterialCost'].value = guidParam.tetherMaterialCost

  if (genSpecsFile) {
    specsFile = specsFile.concat('// GUI Parameters\n')
    Object.entries(guidParamWithUnits).forEach(([k, v]) => {
      v.value = guidParam[k]    // Copy back the values from the structure that we passed to the GUI
      specsFile = specsFile.concat(k + ',' + v.value + ',' + v.units + '\n')
    })

    specsFile = specsFile.concat('// Design Parameters\n')
    Object.entries(dParamWithUnits).forEach(([k, v]) => {
      v.value = dParam[k]    // Copy back the values from the structure that we passed to the GUI
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

function adjustRingLatLon() {
  updatedParam()
  const object1 = scene.getObjectByName("TetheredRingLonCoordSys")
  object1.rotation.y = dParamWithUnits['ringCenterLongtitude'].value
  const object2 = scene.getObjectByName("TetheredRingLatCoordSys")
  object2.rotation.x = -dParamWithUnits['ringCenterLatitude'].value
}

// Three.js Rendering Setup
let simContainer = document.querySelector('#simContainer')

const raycaster = new THREE.Raycaster()
const scene = new THREE.Scene()
//scene.background = new THREE.Color( 0xffffff )
const fov = 12
const aspectRatio = simContainer.offsetWidth/simContainer.offsetHeight
let nearClippingPlane = 0.1 * radiusOfPlanet
let farClippingPlane = 100 * radiusOfPlanet

const camera = new THREE.PerspectiveCamera(fov, aspectRatio, nearClippingPlane, farClippingPlane)
const cameraGroup = new THREE.Group()
cameraGroup.add(camera)
camera.position.z = -100 * radiusOfPlanet/8

// Need to add these two lines to have the planet apper in VR
if (enableVR) {
  cameraGroup.position.z = -1.005 * radiusOfPlanet
  cameraGroup.rotation.z = Math.PI / 2
  cameraGroup.rotation.y = -Math.PI / 2
}
scene.add(cameraGroup)

const sunLight = new THREE.DirectionalLight(0xffffff, 1)
sunLight.position.set(0, 6 * radiusOfPlanet/8, -20 * radiusOfPlanet/8)

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  //logarithmicDepthBuffer: true,
  canvas: document.querySelector('canvas')
})
//renderer.setSize(innerWidth, innerHeight)
renderer.setSize(simContainer.offsetWidth, simContainer.offsetHeight)
renderer.setPixelRatio(devicePixelRatio)
renderer.xr.enabled = true
renderer.xr.setReferenceSpaceType( 'local' )
//document.body.appendChild(renderer.domElement)

const orbitControls = new OrbitControls(camera, renderer.domElement)
orbitControls.addEventListener('change', recomputeNearFarClippingPlanes)

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

let eightTextureMode
if (enableVR) {
  planetCoordSys.rotation.y = Math.PI * -5.253 / 16
  planetCoordSys.rotation.x = Math.PI * -4 / 16
  eightTextureMode = true
}
else {
  eightTextureMode = false
}

scene.add(planetCoordSys)

const planetMeshes = []
let filename
if (eightTextureMode) {
  let letter
  for (let j=0; j<2; j++) {
    for (let i = 0; i<4; i++) {
      if ((i==0) || (i==1) || (i==3)) {
        letter = String.fromCharCode(65+i)
        //filename = `./textures/world.topo.200404.3x21600x21600.${letter}${j+1}.jpg`
        filename = `./textures/world.topo.200404.3x16384x16384.${letter}${j+1}.jpg`
        console.log(letter, filename)
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments, i*Math.PI/2, Math.PI/2, j*Math.PI/2, Math.PI/2),
          new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
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
        planetMesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
        planetMeshes.push(planetMesh)
      }
    }
  }
}
else {
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
    new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        planetTexture: {
          value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
        }
      }
    })
  )
  planetMesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
  planetMeshes.push(planetMesh)
}
//planetMesh.castShadow = true

const atmosphereMesh = new THREE.Mesh(
  new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
  new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  })
)
// ToDo: Scaling this sphere as opposed to setting its radius directly seems a bit hacky.
atmosphereMesh.scale.set(1.1, 1.1 * (1.0 - 1.0/WGS84FlattenningFactor), 1.1)
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

const grayMaterial = new THREE.MeshBasicMaterial({color: 0x3f3f4f})
const whiteMaterial = new THREE.MeshBasicMaterial({color: 0x5f5f5f})
const greenMaterial = new THREE.MeshLambertMaterial({color: 0x005f00})
const metalicMaterial = new THREE.MeshLambertMaterial({color: 0x878681, transparent: false});
const transparentMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, transparent: true, opacity: 0.15});

planetCoordSys.add(sunLight)
planetMeshes.forEach(mesh => {
  planetCoordSys.add(mesh)
})
planetCoordSys.add(atmosphereMesh)

if (dParamWithUnits['showEarthAxis'].value) {
  const axisGeometry = new THREE.CylinderGeometry(AxisEquatorThickness, AxisEquatorThickness, 2.5*radiusOfPlanet, 4, 1, false)
  const axisMesh = new THREE.Mesh(axisGeometry, grayMaterial)
  planetCoordSys.add(axisMesh)
}

if (dParamWithUnits['showEarthEquator'].value) {
  const equatorGeometry = new THREE.TorusGeometry(radiusOfPlanet, AxisEquatorThickness, 8, 128)
  const equatorMesh = new THREE.Mesh(equatorGeometry, grayMaterial)
  equatorMesh.rotation.x = 3.1415927/2
  planetCoordSys.add(equatorMesh)
}

if (dParamWithUnits['showLaunchOrbit'].value) {
  const OrbitalAltitude = 200000 // m
  const launchOrbitGeometry = new THREE.TorusGeometry(radiusOfPlanet + OrbitalAltitude, AxisEquatorThickness, 8, 128)
  const launchOrbitMesh = new THREE.Mesh(launchOrbitGeometry, grayMaterial)
  //launchOrbitMesh.setRotationFromEuler(Math.PI/2 + dParamWithUnits['ringCenterLatitude'].value - (Math.PI/2 - dParamWithUnits['equivalentLatitude'].value), Math.PI/2 + dParamWithUnits['ringCenterLongtitude'].value, 0)
  launchOrbitMesh.rotateY(dParamWithUnits['ringCenterLongtitude'].value)
  launchOrbitMesh.rotateX(Math.PI/2 - dParamWithUnits['ringCenterLatitude'].value + (Math.PI/2 - dParamWithUnits['equivalentLatitude'].value))
  planetCoordSys.add(launchOrbitMesh)
}

// const orbitControlsCenterMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), greenMaterial)
let orbitCenterMarkerSize = 100000
// orbitControlsCenterMarker.position.x = 0
// orbitControlsCenterMarker.position.y = 0
// orbitControlsCenterMarker.position.z = -radiusOfPlanet
// orbitControlsCenterMarker.scale.x = orbitCenterMarkerSize
// orbitControlsCenterMarker.scale.y = orbitCenterMarkerSize
// orbitControlsCenterMarker.scale.z = orbitCenterMarkerSize
// scene.add(orbitControlsCenterMarker)

// Add Some Stars
const starGeometry = new THREE.BufferGeometry()
const starVertices = []
for ( let i = 0; i < 100000; i++ ) {
  // Probably should eliminate all of the stars that are too close to the planet 
  starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // x
  starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // y
  starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // z
// Better code...
//// Create stars at random positions and then push them all 2,000,000 km away from the origin
//  const XYZ = new THREE.Vector3(
//    // Extra math is to avoid creating a star at (0, 0, 0)
//    Math.random()+0.01 * (THREE.MathUtils.randInt(1, 2)*2 - 3),
//    Math.random()+0.01 * (THREE.MathUtils.randInt(1, 2)*2 - 3),
//    Math.random()+0.01 * (THREE.MathUtils.randInt(1, 2)*2 - 3)).normalize().multiplyScalar(2000)
//    //console.log(XYZ)
//  starVertices.push(XYZ)
}

starGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( starVertices, 3 ) )
const stars = new THREE.Points( starGeometry, new THREE.PointsMaterial( { color: 0xFFFFFF } ) )
planetCoordSys.add(stars)  // Todo: This might make the stars rotate with planet. Maybe need another Group...

// "Gimbal" code for the TetheredRingRefCoordSys    
const TetheredRingLonCoordSys = new THREE.Group();
TetheredRingLonCoordSys.name = "TetheredRingLonCoordSys"
planetCoordSys.add(TetheredRingLonCoordSys)
TetheredRingLonCoordSys.position.x = 0
TetheredRingLonCoordSys.position.y = 0
TetheredRingLonCoordSys.rotation.y = dParamWithUnits['ringCenterLongtitude'].value

const TetheredRingLatCoordSys = new THREE.Group();
TetheredRingLatCoordSys.name = "TetheredRingLatCoordSys"
TetheredRingLonCoordSys.add(TetheredRingLatCoordSys)
TetheredRingLatCoordSys.rotation.x = -dParamWithUnits['ringCenterLatitude'].value

const TetheredRingRefCoordSys = new THREE.Group();
TetheredRingLatCoordSys.add(TetheredRingRefCoordSys)
TetheredRingRefCoordSys.rotation.x = Math.PI/2
//TetheredRingRefCoordSys.rotation.y = Math.PI/4  // This is done so that the eccentricity adjustment is where we need it to be
// The above line puts the reference coordinate system's y-axis at lat/lon {0, 0} when RingCenterLat==0 and RingCenterLon==0
// This is needed because the ring will be centered around the coordinate system's y-axis
// We want the ring centered around the y-axis because .setFromSphericalCoords's polar angle is relative to the y-axis

// Generate the main ring
let crv = new tram.commonRingVariables(radiusOfPlanet, dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value)
let ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParam, crv)

const mainRingCurveLineMeshes = []
constructMainRingCurve()

function constructMainRingCurve() {
  const controlPoints = []

  const e = dParamWithUnits['mainRingEccentricity'].value
  for (let a = 0, i = 0; i<dParamWithUnits['numControlPoints'].value; a+=Math.PI*2/dParamWithUnits['numControlPoints'].value, i++) {
    const angleInRingCoordSys = Math.acos(crv.mainRingRadius / (radiusOfPlanet+crv.currentMainRingAltitude)) * Math.sqrt((e*Math.cos(a))**2 + (1/e*Math.sin(a))**2)
    const rInRingCoordSys = (radiusOfPlanet+crv.currentMainRingAltitude) * Math.cos(angleInRingCoordSys)
    const yInRingCoordSys = (radiusOfPlanet+crv.currentMainRingAltitude) * Math.sin(angleInRingCoordSys)
    const xInRingCoordSys = rInRingCoordSys * Math.cos(a)
    const zInRingCoordSys = rInRingCoordSys * Math.sin(a)
    controlPoints.push(new THREE.Vector3(xInRingCoordSys, yInRingCoordSys, zInRingCoordSys))
    }

  const curve = new THREE.CatmullRomCurve3(controlPoints)
  curve.curveType = 'centripetal'
  curve.closed = true
  curve.tension = 0

  const points = curve.getPoints( 1024 )
  // Debug - Draw a loop along the crve to check that it is correctly positioned
  const mainRingCurveLineMesh = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints( points ),
    new THREE.LineBasicMaterial( { color: 0x00ff00 } )
  )
  mainRingCurveLineMeshes.push(mainRingCurveLineMesh)
  //line.position.y = crv.yc
  // Hack mainRingCurveLineMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))
  // End debug

  if (genKMLFile) {
    //KML file placemark creation code for the ring and elevator cables.
    kmlFile = kmlFile.concat(kmlutils.kmlMainRingPlacemarkHeader)
    let xyzWorld, xyzPlanet
    let coordString, firstCoordString

    planetCoordSys.updateWorldMatrix(true)
    TetheredRingLonCoordSys.updateMatrixWorld(true)
    TetheredRingLatCoordSys.updateMatrixWorld(true)
    TetheredRingRefCoordSys.updateMatrixWorld(true)
    points.forEach((point, i) => {
      xyzWorld = TetheredRingRefCoordSys.localToWorld(point.clone())
      xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
      const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
      coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
      if (i==0) {
        firstCoordString = coordString
      }
      kmlFile = kmlFile.concat(coordString)
    })
    kmlFile = kmlFile.concat(firstCoordString)  // We need to repeat the first coordinate to close the loop
    kmlFile = kmlFile.concat(kmlutils.kmlPlacemarkFooter)
  }
}

const mainRingMeshes = []
constructMainRings()

function constructMainRings() {
  const mainRingRadialSegments = 8
  const mainRingTubularSegments = 8192
  const mainRingGeometry = new THREE.TorusGeometry(crv.mainRingRadius, dParamWithUnits['mainRingTubeRadius'].value, mainRingRadialSegments, mainRingTubularSegments)
  for (let i = 0; i<dParamWithUnits['numMainRings'].value; i++) {
    const mainRingMesh = new THREE.Mesh(mainRingGeometry, metalicMaterial)
    mainRingMesh.rotation.x = Math.PI/2      // We need a torus that sits on the x-z plane because .setFromSphericalCoords's polar angle is reletive to the y-axis
    mainRingMesh.position.y = crv.yc + (i-((dParamWithUnits['numMainRings'].value-1)/2))*dParamWithUnits['mainRingSpacing'].value     // Space the rings 10m apart from each other
    mainRingMeshes.push(mainRingMesh)
  }
  mainRingMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))
}

const transitSystemMeshes = []
function constructTransitSystem() {
  // Add the transit tube
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const transitTubeRadius = crv.mainRingRadius + tram.offset_r(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const transitTube_y = crv.yc + tram.offset_y(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const transitTubeRadialSegments = 8
  const transitTubeTubularSegments = 8192
  const transitTubeGeometry = new THREE.TorusGeometry(transitTubeRadius, dParamWithUnits['transitTubeTubeRadius'].value, transitTubeRadialSegments, transitTubeTubularSegments)
  const transitTubeMesh = new THREE.Mesh(transitTubeGeometry, transparentMaterial)
  transitTubeMesh.rotation.x = Math.PI/2      // We need a torus that sits on the x-z plane because .setFromSphericalCoords's polar angle is reletive to the y-axis
  transitTubeMesh.position.y = transitTube_y
  transitSystemMeshes.push(transitTubeMesh)

  // Add four tracks inside the transit tube
  // These really need to be a more like a ribbon with a rectangular cross-section but to do that I will need to implement a custom geometry. For now, torus geometry...
  function makeTrackMesh(outwardOffset, upwardOffset, width, height, transitTubeRadius, transitTubePosition_y, currentEquivalentLatitude) {
    const trackInnerRadius = transitTubeRadius + tram.offset_r(outwardOffset - width/2, upwardOffset - height/2, crv.currentEquivalentLatitude)
    const trackOuterRadius = transitTubeRadius + tram.offset_r(outwardOffset + width/2, upwardOffset - height/2, crv.currentEquivalentLatitude)
    const thetaSegments = 8192
    //const trackGeometry = new THREE.RingGeometry(trackInnerRadius, trackOuterRadius, thetaSegments)
    const trackGeometry = new THREE.TorusGeometry((trackInnerRadius + trackOuterRadius)/2, width, 8, thetaSegments)
    const transitTrackMesh = new THREE.Mesh(trackGeometry, metalicMaterial)
    transitTrackMesh.rotation.x = Math.PI/2
    transitTrackMesh.position.y = transitTubePosition_y + tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    return transitTrackMesh
  }
  
  const trackWidth = 0.2
  const trackHeight = 0.1
  const trackOffsetsList = [[-0.5, 0.8], [-0.5, -0.1], [0.5, 0.8], [0.5, -0.1]]
  for (let i = 0; i<trackOffsetsList.length; i++) {
    let outwardOffset = trackOffsetsList[i][0] * dParamWithUnits['transitTubeTubeRadius'].value 
    let upwardOffset = trackOffsetsList[i][1] * dParamWithUnits['transitTubeTubeRadius'].value
    transitSystemMeshes.push(makeTrackMesh(outwardOffset, upwardOffset, trackWidth, trackHeight, transitTubeRadius, transitTubeMesh.position.y, crv.currentEquivalentLatitude))
  }
  transitSystemMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))
}
if (dParamWithUnits['showTransitSystem'].value) {
  // Create the transit system
  constructTransitSystem()
}

const launchTubeMeshes = []
function constructLaunchTube() {
  // Add the launch tube
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const launchTubeOutwardOffset = 10
  const launchTubeRadius = crv.mainRingRadius + tram.offset_r(launchTubeOutwardOffset, -dParamWithUnits['launchTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const launchTube_y = crv.yc + tram.offset_y(launchTubeOutwardOffset, -dParamWithUnits['launchTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const launchTubeArc = dParamWithUnits['launchTubeLength'].value/(2*Math.PI*launchTubeRadius)*2*Math.PI
  
  const launchTubeTubeRadius = 10000
  const launchTubeRadialSegments = 8
  const launchTubeTubularSegments = 8192
  const launchTubeGeometry = new THREE.TorusGeometry(launchTubeRadius, launchTubeTubeRadius, launchTubeRadialSegments, launchTubeTubularSegments, launchTubeArc)
  const launchTubeMesh = new THREE.Mesh(launchTubeGeometry, transparentMaterial)
  launchTubeMesh.rotation.x = Math.PI/2      // We need a torus that sits on the x-z plane because .setFromSphericalCoords's polar angle is reletive to the y-axis
  launchTubeMesh.rotation.z = Math.PI/2      // We need a torus that sits on the x-z plane because .setFromSphericalCoords's polar angle is reletive to the y-axis
  launchTubeMesh.position.y = launchTube_y
  launchTubeMeshes.push(launchTubeMesh)

  // Add four tracks inside the transit tube
  // These really need to be a more like a ribbon with a rectangular cross-section but to do that I will need to implement a custom geometry. For now, torus geometry...
  function makeTrackMesh(outwardOffset, upwardOffset, width, height, launchTubeRadius, launchTubePosition_y, currentEquivalentLatitude) {
    const trackInnerRadius = launchTubeRadius + tram.offset_r(outwardOffset - width/2, upwardOffset - height/2, crv.currentEquivalentLatitude)
    const trackOuterRadius = launchTubeRadius + tram.offset_r(outwardOffset + width/2, upwardOffset - height/2, crv.currentEquivalentLatitude)
    const thetaSegments = 8192
    //const trackGeometry = new THREE.RingGeometry(trackInnerRadius, trackOuterRadius, thetaSegments)
    const trackGeometry = new THREE.TorusGeometry((trackInnerRadius + trackOuterRadius)/2, width, 8, thetaSegments, launchTubeArc)
    const launchTrackMesh = new THREE.Mesh(trackGeometry, metalicMaterial)
    launchTrackMesh.rotation.x = Math.PI/2
    launchTrackMesh.position.y = launchTubePosition_y + tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
    return launchTrackMesh
  }
  
  const trackWidth = 0.5
  const trackHeight = 0.2
  const trackOffsetsList = [[-0.5, 0.8], [0.5, 0.8]]
  for (let i = 0; i<trackOffsetsList.length; i++) {
    let outwardOffset = trackOffsetsList[i][0] * launchTubeTubeRadius 
    let upwardOffset = trackOffsetsList[i][1] * launchTubeTubeRadius
    launchTubeMeshes.push(makeTrackMesh(outwardOffset, upwardOffset, trackWidth, trackHeight, launchTubeRadius, launchTubeMesh.position.y, crv.currentEquivalentLatitude))
  }
  launchTubeMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))
}
// Create the launch sytem
if (dParamWithUnits['showLaunchTubes'].value) {
  constructLaunchTube()
}

let elevatorAltitude = (crv.currentMainRingAltitude+dParamWithUnits['transitTubeUpwardOffset'].value) - 20
const elevatorCarMeshes = []
const elevatorCableMeshes = []
var cableMaterial = new THREE.LineBasicMaterial({
  vertexColors: THREE.VertexColors,
  //color: 0x4897f8,
  transparent: true,
  opacity: dParamWithUnits['cableVisibility'].value
})

function addStraightLineSegment(points, ) {

  // const tempGeometry = new THREE.BufferGeometry().setFromPoints(points)    // Add the new geometry back
  // // tempGeometry.addAttribute("color", new THREE.Float32BufferAttribute(0x0000ff, 3) );
  // for (let i=0; i<dParamWithUnits['numTethers'].value/2; i++) {
  //   tethers[i] = new THREE.LineSegments(tempGeometry.clone(), tetherMaterial);
  //   tethers[i].rotation.y = 2 * Math.PI * i * 2 / dParamWithUnits['numTethers'].value
  //   TetheredRingRefCoordSys.add(tethers[i])
  // }

  // const points.push(new THREE.Vector3().setFromSphericalCoords(r_0, ω_0, θ + branch.dθ_0))
  
  // const elevatorCableGeometry = new THREE.CylinderGeometry(elevatorCableTubeRadius, elevatorCableTubeRadius, elevatorCableLength, elevatorCableTubularSegments)
  // const elevatorCableMesh = new THREE.Mesh(elevatorCableGeometry, transparentMaterial)
  // elevatorCableMesh.rotation.x = Math.PI/2
  // elevatorCableMesh.position.y = crv.yc + tram.offset_y(-10, -elevatorCableLength, crv.currentEquivalentLatitude)
}

function constructElevatorCables() {
  // Add elevator cables
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value
  const elevatorCableUpperAttachPnt_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
  const elevatorCableUpperPlatform_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const elevatorCableLowerAttachPnt_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  const elevatorCableUpperAttachPnt_y = crv.yc + tram.offset_y(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value + dParamWithUnits['additionalUpperElevatorCable'].value, crv.currentEquivalentLatitude)
  const elevatorCableUpperPlatform_y = crv.yc + tram.offset_y(cableOutwardOffset, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
  const elevatorCableLowerAttachPnt_y = crv.yc + tram.offset_y(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  //const elevatorCableTubeRadius = 1000.01
  //const elevatorCableTubularSegments = 8 

  let tempGeometry
  const platformMesh = new THREE.Mesh(new THREE.BoxGeometry(dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value*2, 1, 10), greenMaterial)

  // planetCoordSys.updateWorldMatrix(true)
  // TetheredRingLonCoordSys.updateMatrixWorld(true)
  // TetheredRingLatCoordSys.updateMatrixWorld(true)
  // TetheredRingRefCoordSys.updateMatrixWorld(true)

  for (let a = 0, i = 0; i<dParamWithUnits['numElevatorCables'].value; a+=Math.PI*2/dParamWithUnits['numElevatorCables'].value, i++) {
    const elevatorCableUpperAttachPnt = new THREE.Vector3(
      elevatorCableUpperAttachPnt_r * Math.cos(a),
      elevatorCableUpperAttachPnt_y,
      elevatorCableUpperAttachPnt_r * Math.sin(a)
    )
    const elevatorCableUpperPlatform = new THREE.Vector3(
      elevatorCableUpperPlatform_r * Math.cos(a),
      elevatorCableUpperPlatform_y,
      elevatorCableUpperPlatform_r * Math.sin(a)
    )
    const elevatorCableLowerAttachPnt = new THREE.Vector3(
      elevatorCableLowerAttachPnt_r * Math.cos(a),
      elevatorCableLowerAttachPnt_y,
      elevatorCableLowerAttachPnt_r * Math.sin(a)
    )

    // Now create an array of two points use that to make a LineSegment Geometry
    tempGeometry = new THREE.BufferGeometry().setFromPoints([elevatorCableUpperAttachPnt, elevatorCableLowerAttachPnt])
    //tempGeometry.setAttribute("color", new THREE.Float32BufferAttribute(0x0000ff, 3) )
    elevatorCableMeshes.push( new THREE.LineSegments(tempGeometry.clone(), cableMaterial) )
    
    // Add platforms at the top and bottom of each the elevator cable 
    platformMesh.rotation.x = 0
    platformMesh.rotation.y = -a
    platformMesh.rotation.z = crv.currentEquivalentLatitude - Math.PI/2
    platformMesh.position.set(elevatorCableUpperPlatform.x, elevatorCableUpperPlatform.y, elevatorCableUpperPlatform.z)
    elevatorCableMeshes.push(platformMesh.clone())
    platformMesh.position.set(elevatorCableLowerAttachPnt.x, elevatorCableLowerAttachPnt.y, elevatorCableLowerAttachPnt.z)
    elevatorCableMeshes.push(platformMesh.clone())
  }
  elevatorCableMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))

}

function constructElevatorCars() {
  // Add elevator Cars
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value
  const elevatorCarPosition_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  const elevatorCarPosition_y = crv.yc + tram.offset_y(cableOutwardOffset, elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)

  const elevatorCarMesh = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 10, 16), metalicMaterial)

  for (let a = 0, i = 0; i<dParamWithUnits['numElevatorCars'].value; a+=Math.PI*2/dParamWithUnits['numElevatorCars'].value, i++) {
    const elevatorCarPosition = new THREE.Vector3(
      elevatorCarPosition_r * Math.cos(a),
      elevatorCarPosition_y,
      elevatorCarPosition_r * Math.sin(a)
    )
    
    // Add elevator car
    elevatorCarMesh.position.set(elevatorCarPosition.x, elevatorCarPosition.y, elevatorCarPosition.z)
    elevatorCarMesh.rotation.x = 0
    elevatorCarMesh.rotation.y = -a
    elevatorCarMesh.rotation.z = crv.currentEquivalentLatitude - Math.PI/2
    elevatorCarMesh.userData = a
    elevatorCarMeshes.push(elevatorCarMesh.clone())
  }
  elevatorCarMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))
}
if (dParamWithUnits['showElevators'].value) {
  constructElevatorCables()
  constructElevatorCars()
}

// Tethers
const tethers = []
constructTethers()

function constructTethers() {
  const tetherPoints = []
  const tetherIndices = []  // These indices index points in tetherPoints, reusing them to save memory
  const tetherStrips = []   // This array will store other arrays that will each define a "strip" of points

  tetherMath()       // Regenerate the strips of points that define a forking tether
  // Tethered Ring Math
  function tetherMath() {
    // Inputs:
    // gravitationalConstant, radiusOfPlanet, massOfPlanet
    // dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value, dParamWithUnits['massPerMeterOfRing'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['tetherEngineeringFactor'].value, dParamWithUnits['numForkLevels'].value, dParamWithUnits['tetherPointBxAvePercent'].value, dParamWithUnits['tetherPointBxDeltaPercent'].value
    // tetherMaterialDensity, tetherStress

    const final_r = radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value

    const m = dParamWithUnits['massPerMeterOfRing'].value
    const fExertedByGravityOnRing = gravitationalConstant * massOfPlanet * m / (final_r**2)
    
    // The following vectors are cylindricl coordinates
    const fG = new tram.forceVector() // Vector representing the force of gravity at a point on the tether in ring-centered cylindrical coordinates
    const fT = new tram.forceVector() // Vector representing the tensile force exerted at a point on the tether in ring-centered cylindrical coordinates
    const fI = new tram.forceVector() // Vector representing the force of gravity at a point on the tether in ring-centered cylindrical coordinates

    fG.ρ = -fExertedByGravityOnRing * Math.cos(dParamWithUnits['equivalentLatitude'].value)
    fG.φ = 0
    fG.z = -fExertedByGravityOnRing * Math.sin(dParamWithUnits['equivalentLatitude'].value)
    fT.z = -fG.z                     // Eq 6

    const tetherStress = dParamWithUnits['tetherMaterialTensileStrength'].value*1000000 / dParamWithUnits['tetherEngineeringFactor'].value
    const aveForceOfGravity = gravitationalConstant * massOfPlanet * 1 / ((radiusOfPlanet + dParamWithUnits['ringFinalAltitude'].value / 2)**2)
    const c = tetherStress / dParamWithUnits['tetherMaterialDensity'].value / aveForceOfGravity  // We're using the average force of gravity here as an engineering approximation (Eq 17)
    
    // Initially we will assume that PointB is at x=0 on the catenary. This is done just so that we can calculate a temporary "PointP.x", 
    // and then set PointB.x as a percentage of this temporarty PointP.x. 
    const tempPointP = new tram.cateneryVector()
    tempPointP.y = dParamWithUnits['ringFinalAltitude'].value
    tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y/c))      // Eq 11
    tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y/c))      // Eq 13b
    
    const tetherTypes = [[], []]
    const finalCatenaryTypes = [[], []]                          // Shape of the catenary after the ring is raised to full height - used to "design" the thethers.
    const currentCatenaryTypes = [[], []]                        // Shape of the catenery for the portion of the tethers that are off the ground when the ring is less than fully elevated   
    const finalTetherLength = []
    const currentTetherLength = []
    const numTetherSegments = (2 ** (dParamWithUnits['numForkLevels'].value+1)) - 1       // Starting from anchor, after each fork the distance to the next fork (or attacment point) is halved
    const numTetherPoints = numTetherSegments + 1                // Because, for example, it takes 5 points to speify 4 segments

    finalCatenaryTypes.forEach((catenaryType, j) => {
      const pointB = new tram.cateneryVector()
      const pointP = new tram.cateneryVector()
      const pointA = new tram.cateneryVector()
      const minusplus = [-1, 1]
      pointB.x = tempPointP.x * (dParamWithUnits['tetherPointBxAvePercent'].value + minusplus[j] * dParamWithUnits['tetherPointBxDeltaPercent'].value/2)/100
      pointB.y = c * Math.log(1.0/Math.cos(pointB.x/c))    // Eq 10
      pointB.s = c * Math.acosh(Math.exp(pointB.y/c))      // Eq 13b
      pointP.y = pointB.y + dParamWithUnits['ringFinalAltitude'].value
      pointP.x = c * Math.acos(Math.exp(-pointP.y/c))      // Eq 11
      pointP.s = c * Math.acosh(Math.exp(pointP.y/c))      // Eq 13b
      pointP.θ = pointP.x / c                                  // Eq 12
      const ω_P = -(Math.PI/2 - (dParamWithUnits['equivalentLatitude'].value))
      fT.ρ = fT.z / (Math.tan(pointP.θ+ω_P))                  // Eq 20
      fI.ρ = -fG.ρ - fT.ρ                                     // Eq 21
      pointP.T = Math.sqrt(fT.ρ**2 + fT.z**2)
      pointA.T = pointP.T * Math.cos(pointP.θ)                 // Eq 17, Note: pointA.T is also referred to as 'T0'
      pointP.crossSectionalArea = pointA.T/tetherStress * Math.cosh(pointP.s/c)        // Eq 14
      pointB.crossSectionalArea = pointA.T/tetherStress * Math.cosh(pointB.s/c)        // Eq 14
      const tetherDiameterPerKilometerOfRing = Math.sqrt(pointB.crossSectionalArea*1000/Math.PI) * 2
      console.log(tetherDiameterPerKilometerOfRing)
      finalTetherLength[j] = pointP.s - pointB.s          // Note: Does not account for forks
    })

    // At this point the final length of the tethers (measured along the catenary) is known, but the tethers current shape is still
    // a function of its state of deployment.
    // The next steps involve calculating the catenary for the current state of deployment, and then mapping the tether design onto that catenary. 

    const r = Math.sqrt(crv.yc*crv.yc + crv.mainRingRadius*crv.mainRingRadius)

    tempPointP.y = r - radiusOfPlanet
    tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y/c))      // Eq 11
    tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y/c))      // Eq 13b
    
    const pointB_s = []
    
    currentCatenaryTypes.forEach((catenaryType, j) => {
      const pointB = new tram.cateneryVector()
      const pointP = new tram.cateneryVector()
      const minusplus = [-1, 1]
      pointB.x = tempPointP.x * (dParamWithUnits['tetherPointBxAvePercent'].value + minusplus[j] * dParamWithUnits['tetherPointBxDeltaPercent'].value/2)/100
      pointB.y = c * Math.log(1.0/Math.cos(pointB.x/c))    // Eq 10
      pointB.s = c * Math.acosh(Math.exp(pointB.y/c))      // Eq 13b
      pointB_s[j] = pointB.s  // We'll need to use this later
      pointP.y = pointB.y + crv.currentMainRingAltitude
      pointP.x = c * Math.acos(Math.exp(-pointP.y/c))      // Eq 11
      pointP.s = c * Math.acosh(Math.exp(pointP.y/c))      // Eq 13b
      pointP.θ = pointP.x / c                                  // Eq 12
      const ω_P = -(Math.PI/2 - crv.currentEquivalentLatitude)   // negative because angle increases in clockwise direction
      fT.ρ = fT.z / (Math.tan(pointP.θ+ω_P))         // Eq 20
      fI.ρ = -fG.ρ - fT.ρ                           // Eq 21

      currentTetherLength[j] = pointP.s - pointB.s
      
      for (let i = 0; i<=numTetherPoints-1; i++) {
        const sFraction = i / (numTetherPoints-1)
        const s = pointB.s + currentTetherLength[j] - finalTetherLength[j] * (1 - sFraction)
        // Compute a distance from the center of the planet and a angle from the ring's axis of symmetry
        const x = 2 * c * Math.atan(Math.exp(s/c)) - (c * Math.PI / 2)   // Eq 15
        const y = c * Math.log(Math.cosh(s/c))                           // Eq 16
        const r = radiusOfPlanet + (y - pointB.y)
        const ω_anchor = ω_P + (pointP.x-pointB.x) / radiusOfPlanet     // Left this unreduced to make it a bit easier to understand the logic
        const ω = ω_anchor - (x-pointB.x) / radiusOfPlanet
        catenaryType.push(new tram.CatenaryPolarVec3(r, ω, s))
      }
    })

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
      tetherTypes.forEach((tetherType, j) => {
        const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
        makeTetherStrips(j, θ)
      })
    }
    else {
      //for (let j = 0; j<dParamWithUnits['numTethers'].value; j++) {
      for (let j = dParamWithUnits['numTethers'].value*28/32; j<dParamWithUnits['numTethers'].value*29/32; j++) {
        const θ = j / dParamWithUnits['numTethers'].value * 2.0 * Math.PI
        makeTetherStrips(j, θ)
      }
    }

    function makeTetherStrips(j, θ) {
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

      const mro = (dParamWithUnits['numMainRings'].value - 1)/2
      for (let i = 0; i<=numTetherPoints-2; i++) {
        r_1 = catenaryPoints[i+1].r
        ω_1 = catenaryPoints[i+1].ω
        s_1 = catenaryPoints[i+1].s

        if ((s_0<pointB_s[jModNumTypes]) && (pointB_s[jModNumTypes]<s_1)) {
          // We need to recalculate the r_0, ω_0 values more accurately by using lerps...
          const frac = (pointB_s[jModNumTypes]-s_0)/(s_1-s_0)
          r_0 = tram.lerp(r_0, r_1, frac)
          ω_0 = tram.lerp(ω_0, ω_1, frac)
        }

        if ((i>0) && (Number.isInteger(Math.log2(numTetherPoints-i)))) {      // If we're at a point where the tether segments fork...
          const logNumStays = dParamWithUnits['numForkLevels'].value + 1 - Math.log2(numTetherPoints-i)
          const target_dθ_Alteration = dParamWithUnits['tetherSpan'].value/(2**(logNumStays+1))
          branches.forEach((branch, index) => {
            if (i<numTetherPoints-2) {
              // Create two new branches, then delete the original
              branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ + target_dθ_Alteration))
              branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr, branch.target_dω, branch.target_dθ - target_dθ_Alteration))
            }
            else {
              for (let k = 0; k<dParamWithUnits['numMainRings'].value; k++) {
                const target_dr_Alteration = (k-mro)*dParamWithUnits['mainRingSpacing'].value * Math.sin(crv.constructionEquivalentLatitude)
                const target_dω_Alteration = (k-mro)*dParamWithUnits['mainRingSpacing'].value * Math.cos(crv.constructionEquivalentLatitude) / r_0    // Dividing by r_0 is an approximation, a better r value may be needed for perfect accuracy
                branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr + target_dr_Alteration, branch.target_dω + target_dω_Alteration, branch.target_dθ + target_dθ_Alteration))
                branches.push(new Branch(i, branch.dr_0, branch.dω_0, branch.dθ_0, numTetherPoints, branch.target_dr - target_dr_Alteration, branch.target_dω - target_dω_Alteration, branch.target_dθ - target_dθ_Alteration))
              }
            }
            delete branches[index]    // Some advice out there says not to use delete because then len() will return wrong results, but it's efficient at this task
          })
        }
        branches.forEach((branch) => {
          const alpha = (i+1 - branch.base_point)/(numTetherPoints-1 - branch.base_point)
          branch.dr_1 = tram.lerp(branch.base_dr, branch.target_dr, alpha)
          branch.dω_1 = tram.lerp(branch.base_dω, branch.target_dω, alpha)
          branch.dθ_1 = tram.lerp(branch.base_dθ, branch.target_dθ, alpha)
          if (s_1>pointB_s[jModNumTypes]) {   // When raising the ring, points on the parts of the tether that are on the spool have all have the same coordinates (i.e. the spool's coordinates).
            if (s_0<pointB_s[jModNumTypes]) {
              // We need to recalculate the branch.dr_0 and branch.dθ_0 values more accurately by using a lerp...
              // Note, this code doesn't recalculate the values correctly for the final tether branches that fork away vertically 
              const frac = (pointB_s[jModNumTypes]-s_0)/(s_1-s_0)
              branch.dr_0 = tram.lerp(branch.dr_0, branch.dr_1, frac)
              branch.dω_0 = tram.lerp(branch.dω_0, branch.dω_1, frac)
              branch.dθ_0 = tram.lerp(branch.dθ_0, branch.dθ_1, frac)
            }
            if (branch.stripIndex==-1) {
              // Start a new array for the strip, add it to the array of arrays, and register its index with the branch object 
              branch.stripIndex = tetherStrips.push( [] ) - 1
              // Push the branch's first point onto the tether stirps array 
              tetherStrips[branch.stripIndex].push( new THREE.Vector3().setFromSphericalCoords(r_0 + branch.dr_0, ω_0 + branch.dω_0, θ + branch.dθ_0) )
            }
            tetherStrips[branch.stripIndex].push( new THREE.Vector3().setFromSphericalCoords(r_1 + branch.dr_1, ω_1 + branch.dω_1, θ + branch.dθ_1) )
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
        if (i>0) {
          tetherIndices.push(numIndices-1)
          tetherIndices.push(numIndices)
        }
        numIndices++
      })
    })
    
    // Add tether points to KML file
    if (genKMLFile) {
      planetCoordSys.updateWorldMatrix(true)
      TetheredRingLonCoordSys.updateMatrixWorld(true)
      TetheredRingLatCoordSys.updateMatrixWorld(true)
      TetheredRingRefCoordSys.updateMatrixWorld(true)

      tetherStrips.forEach(strip => {
        kmlFile = kmlFile.concat(kmlutils.kmlTetherPlacemarkHeader)
        strip.forEach((point) => {
          const xyzWorld = TetheredRingRefCoordSys.localToWorld(point.clone())
          const xyzPlanet = planetCoordSys.worldToLocal(xyzWorld.clone())
          const lla = tram.xyz2lla(xyzPlanet.x, xyzPlanet.y, xyzPlanet.z)
          //const coordString = '          ' + lla.lon + ',' + lla.lat + ',' + lla.alt + '\n'
          const coordString = '          ' + Math.round(lla.lon*10000000)/10000000 + ',' + Math.round(lla.lat*10000000)/10000000 + ',' + Math.round(Math.abs(lla.alt)*1000)/1000 + '\n'
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
  var tetherMaterial = new THREE.LineBasicMaterial({
    vertexColors: THREE.VertexColors,
    color: 0x4897f8,     // This lines doesn't seem to work
    transparent: true,
    opacity: dParamWithUnits['tetherVisibility'].value
  })
  
  const tempTether = new THREE.LineSegments(tetherGeometry, tetherMaterial)
  if (fastTetherRender) {
    const k = 2 * Math.PI * 2 / dParamWithUnits['numTethers'].value
    for (let i=0; i<dParamWithUnits['numTethers'].value/2; i++) {     // Really should be currentCatenaryTypes.length, but that value is hidden from us here
      tempTether.rotation.y = i * k
      tethers[i] = tempTether.clone()
      TetheredRingRefCoordSys.add(tethers[i])
    }
  }
  else {
    tethers[0] = tempTether.clone()
    TetheredRingRefCoordSys.add(tethers[0])
  }
}

if (dParamWithUnits['showLaunchTrajectory'].value) {
  // Launch Tragectory Line
  const l = new launcher.launcher()
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
    (l.R_Earth + ADandV.Altitude) * Math.sin(ADandV.Distance/(l.R_Earth + ADandV.Altitude)),
    crv.yf,
    (l.R_Earth + ADandV.Altitude) * Math.cos(ADandV.Distance/(l.R_Earth + ADandV.Altitude)))
  let currVehiclePostion  = new THREE.Vector3(0, 0, 0)
  const color = new THREE.Color()
  const launchTragectoryPoints = []
  const launchTragectoryColors = []

  for (t=1; t<3*dParamWithUnits['launchTubeAccelerationTime'].value; t++) {
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
      (l.R_Earth + ADandV.Altitude) * Math.sin(ADandV.Distance/(l.R_Earth + ADandV.Altitude)),
      crv.yf,
      (l.R_Earth + ADandV.Altitude) * Math.cos(ADandV.Distance/(l.R_Earth + ADandV.Altitude)))
    //console.log(ADandV)
    
    launchTragectoryPoints.push(prevVehiclePostion)
    launchTragectoryPoints.push(currVehiclePostion)
    prevVehiclePostion = currVehiclePostion.clone()
    color.setHSL(0.5 , 0.5, 1.0 * ((t%10==9) || (t%60==58)))
    launchTragectoryColors.push(color.r, color.g, color.b)
    launchTragectoryColors.push(color.r, color.g, color.b)
  }

  const launchTragectoryGeometry = new THREE.BufferGeometry().setFromPoints(launchTragectoryPoints)
  launchTragectoryGeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( launchTragectoryColors, 3 ) );

  var launchTragectoryMaterial = new THREE.LineBasicMaterial({
    vertexColors: THREE.VertexColors,
    transparent: true,
    opacity: dParamWithUnits['launchTragectoryVisibility'].value
  })
  const launchTragectoryMesh = new THREE.LineSegments(launchTragectoryGeometry, launchTragectoryMaterial)
  TetheredRingRefCoordSys.add( launchTragectoryMesh )
  // End Launch Tragectory Line
}

function updateRing() {
  
  // Deletion Section
  mainRingCurveLineMeshes.forEach(mesh => {
    mesh.geometry.dispose()
    mesh.material.dispose()
    TetheredRingRefCoordSys.remove(mesh)
  })
  mainRingCurveLineMeshes.splice(0, mainRingCurveLineMeshes.length)

  if (majorRedesign) {
    mainRingMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      TetheredRingRefCoordSys.remove(mesh)
    })
    mainRingMeshes.splice(0, mainRingMeshes.length)
  }

  if (dParamWithUnits['showTransitSystem'].value) {
    if (majorRedesign) {
      transitSystemMeshes.forEach(mesh => {
        mesh.geometry.dispose()
        mesh.material.dispose()
        TetheredRingRefCoordSys.remove(mesh)
      })
      transitSystemMeshes.splice(0, transitSystemMeshes.length)
    }
  }

  if (dParamWithUnits['showLaunchTubes'].value) {
    launchTubeMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      TetheredRingRefCoordSys.remove(mesh)
    })
    launchTubeMeshes.splice(0, launchTubeMeshes.length)
  }

  if (dParamWithUnits['showElevators'].value) {
    elevatorCableMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      TetheredRingRefCoordSys.remove(mesh)
    })
    elevatorCableMeshes.splice(0, elevatorCableMeshes.length)

    elevatorCarMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      TetheredRingRefCoordSys.remove(mesh)
    })
    elevatorCarMeshes.splice(0, elevatorCarMeshes.length)
  }

  tethers.forEach(tether => {
    tether.geometry.dispose()
    tether.material.dispose()
    //tether.color.dispose()
    TetheredRingRefCoordSys.remove(tether)
  })
  tethers.splice(0, tethers.length)

  // Update the parameters prior to reconsrructing the scene
  updatedParam()

  // Reconstruction Section
  crv = new tram.commonRingVariables(radiusOfPlanet, dParamWithUnits['ringFinalAltitude'].value, dParamWithUnits['equivalentLatitude'].value, dParamWithUnits['ringAmountRaisedFactor'].value)
  ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParam, crv)
 
  constructMainRingCurve()
  if (majorRedesign) {
    constructMainRings()
  }
  else {
    mainRingMeshes.forEach((mesh, i) => {
      mesh.position.y = crv.yc + (i-((dParamWithUnits['numMainRings'].value-1)/2))*dParamWithUnits['mainRingSpacing'].value
    })
  }

  if (dParamWithUnits['showTransitSystem'].value) {
    if (majorRedesign) {
      constructTransitSystem()
    }
    else {
      transitSystemMeshes.forEach((mesh, i) => {
        const transitTube_y = crv.yc + tram.offset_y(dParamWithUnits['transitTubeOutwardOffset'].value, dParamWithUnits['transitTubeUpwardOffset'].value, crv.currentEquivalentLatitude)
        if (i==0) {
          mesh.position.y = transitTube_y
        }
        else {
          const trackOffsetsList = [[-0.5, 0.8], [-0.5, -0.1], [0.5, 0.8], [0.5, -0.1]]
          const outwardOffset = trackOffsetsList[i-1][0] * dParamWithUnits['transitTubeTubeRadius'].value 
          const upwardOffset = trackOffsetsList[i-1][1] * dParamWithUnits['transitTubeTubeRadius'].value
          mesh.position.y = transitTube_y + tram.offset_y(outwardOffset, upwardOffset, crv.currentEquivalentLatitude)
        }
      })
    }
  }
  if (dParamWithUnits['showLaunchTubes'].value) {
    constructLaunchTube()
  }
  if (dParamWithUnits['showElevators'].value) {
    constructElevatorCables()
    constructElevatorCars()
  }
  constructTethers()
}

const mouse = {
  x: undefined,
  y: undefined
}
let intersectionPoint = new THREE.Vector3
let targetPoint = new THREE.Vector3
let orbitControlsRotateSpeed = 1
let AnimateRaising = false
let AnimateLowering = false
let AnimateZoomingIn = false
let AnimateZoomingOut = false
const clock = new THREE.Clock();
let timeSinceStart = 0

function animate() {
  renderer.setAnimationLoop( renderFrame )
}

function renderFrame() {
  //requestAnimationFrame(animate)
  //simContainer = document.querySelector('#simContainer')
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)
  //renderer.setViewport( 0, 0, simContainer.offsetWidth, simContainer.offsetHeight )
  renderer.render(scene, camera)

  //planetMesh.rotation.y += 0.000001
  if (AnimateZoomingIn || AnimateZoomingOut) {
    var offset = new THREE.Vector3
    offset.copy( orbitControls.object.position ).sub( orbitControls.target )
    if (AnimateZoomingIn) {
      offset.multiplyScalar(0.995)
    } else if (AnimateZoomingOut) {
      offset.multiplyScalar(1.005)
    }
    orbitControls.object.position.copy( orbitControls.target ).add( offset );
  }
  orbitControls.update()
  const delta = clock.getDelta()
  timeSinceStart += delta

  if (AnimateRaising || AnimateLowering) {
    if (AnimateRaising) {
      guidParam.ringAmountRaisedFactor = Math.min(1, guidParam.ringAmountRaisedFactor+delta*0.01)
      if (guidParam.ringAmountRaisedFactor==1) AnimateRaising = false
    }
    if (AnimateLowering) {
      guidParam.ringAmountRaisedFactor = Math.max(0, guidParam.ringAmountRaisedFactor-delta*0.01)
      if (guidParam.ringAmountRaisedFactor==0) AnimateLowering = false
      //cameraGroup.position.z -= -0.0001 * radiusOfPlanet
      //console.log(cameraGroup.position.z/radiusOfPlanet)
    }
    adjustRingDesign()
  }

  if (dParamWithUnits['showElevators'].value && dParamWithUnits['animateElevators'].value) {
    elevatorAltitude = tram.getElevatorCarAltitude(dParam, crv, ecv, timeSinceStart)
    //console.log(elevatorAltitude)
    const cableOutwardOffset = dParamWithUnits['transitTubeOutwardOffset'].value - dParamWithUnits['transitTubeTubeRadius'].value + dParamWithUnits['elevatorUpperTerminusOutwardOffset'].value
    elevatorCarMeshes.forEach(mesh => {
      const a = mesh.userData
      const elevatorCarPosition_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
      const elevatorCarPosition_y = crv.yc + tram.offset_y(cableOutwardOffset, elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
      mesh.position.set(elevatorCarPosition_r * Math.cos(a), elevatorCarPosition_y, elevatorCarPosition_r * Math.sin(a))
    })
  }
}

document.addEventListener( 'resize', onWindowResize )
function onWindowResize() {
  simContainer = document.querySelector('#simContainer')
  camera.aspect = simContainer.offsetWidth/simContainer.offsetHeight
  camera.updateProjectionMatrix()
  //console.log(simContainer.offsetWidth, simContainer.offsetHeight)
  renderer.setSize( simContainer.offsetWidth, simContainer.offsetHeight)
}

document.addEventListener( 'keydown', onKeyDown )
document.body.appendChild( VRButton.createButton( renderer ) )

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

function onKeyDown( event ) {
  switch ( event.keyCode ) {
    case 79: /*O*/
      orbitControls.target.copy(new THREE.Vector3(0, 0, 0))
      orbitControls.rotateSpeed = 1
      cameraGroup.up.set(0, 1, 0)
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
      console.log(planetIntersects.length, transitTubeIntersects.length)
      if (transitTubeIntersects.length>0) {
        intersectionPoint = transitTubeIntersects[0].point
        targetPoint = intersectionPoint
        orbitCenterMarkerSize = 100
        orbitControlsRotateSpeed = 0.05
      }
      else if (planetIntersects.length>0) { // Note: would probably be advisable to assert here that there is only one intersection point.
        intersectionPoint = planetIntersects[0].point
        // Because we want to orbit around a point at the altitude of the ring...
        targetPoint = intersectionPoint.multiplyScalar((radiusOfPlanet + crv.currentMainRingAltitude)/radiusOfPlanet)
        //targetPoint = intersectionPoint.multiplyScalar((radiusOfPlanet + 100)/radiusOfPlanet)
        orbitCenterMarkerSize = 10000
        orbitControlsRotateSpeed = 0.9
        // Uncomment this line if you want to print lat, lon, and alt to console
        //console.log(tram.xyz2lla(intersectionPoint.x, intersectionPoint.y, intersectionPoint.z))
      }

      orbitControls.target.copy(targetPoint)
      orbitControls.enabled = false
      //orbitControls.minAzimuthAngle = Math.PI - .5
      //orbitControls.maxAzimuthAngle = Math.PI + .5
      //orbitControls.minPolarAngle = Math.PI/2 - .01
      orbitControls.maxPolarAngle = Math.PI/2 + .1

      const upVector = planetCoordSys.worldToLocal(intersectionPoint).normalize()
      camera.up = upVector     // Optional, but recommended
      orbitControls.upDirection = upVector
      orbitControls.screenSpacePanning = false      
      orbitControls.rotateSpeed = orbitControlsRotateSpeed
      orbitControls.enabled = true
      orbitControls.update()
      break;
    case 81: /*Q*/
      orbitControls.autoRotate ^= true
      break;
    case 82: /*R*/
      dParamWithUnits['ringCenterLongtitude'].value -= 0.1
      updateRing()
      break; 
    case 84: /*T*/
      dParamWithUnits['ringCenterLongtitude'].value += 0.1
      updateRing()
      break;
    case 85: /*U*/
      AnimateRaising = !AnimateRaising
      AnimateLowering = false
      break;
    case 87:
      // This executes and instantaneous "Warp" to a position much closer to the ring
      orbitControls.target = new THREE.Vector3 (-4362280.9120827615, 4045083.6759703127, -2386622.5328984708)
      orbitControls.object.position.copy( new THREE.Vector3 (-4363806.163530101, 4043286.837993776, -2386967.5287545356))
      orbitControls.update()
      guidParam.numForkLevels = 8
      for (var i in gui.__controllers) {
        gui.__controllers[i].updateDisplay()
      }
      updatedParam()
      updateRing()
      break;
    case 88: /*X*/
      AnimateZoomingIn = false
      AnimateZoomingOut = !AnimateZoomingOut
      break;
    case 90: /*Z*/
      AnimateZoomingIn = !AnimateZoomingIn
      AnimateZoomingOut = false
      break;
    case 68: /*D*/
      AnimateRaising = false
      AnimateLowering = !AnimateLowering
      break;
    case 69: /*E*/
      recomputeNearFarClippingPlanes()
      break;
    case 70: /*F*/
      guidParam.ringFinalAltitude = 200000  // m
      guidParam.equivalentLatitude = Math.acos(targetRadius/(radiusOfPlanet + guidParam.ringFinalAltitude)) * 180 / Math.PI
      guidParam.ringAmountRaisedFactor = 0.01
      guidParam.numMainRings = 1
      //guidParam.mainRingTubeRadius = 1
      guidParam.numTethers = 180
      guidParam.numForkLevels = 6
      guidParam.tetherSpanOverlapFactor = 1
      guidParam.tetherPointBxAvePercent = 0.8
      guidParam.tetherPointBxDeltaPercent = 0
      guidParam.tetherEngineeringFactor = 0.5
      guidParam.numElevatorCables = 180
      guidParam.numElevatorCars = 0
      adjustRingDesign()
      guidParam.moveRing = 0
      adjustRingLatLon()
      guidParam.cableVisibility = 0.1
      adjustCableOpacity()
      guidParam.tetherVisibility = 1
      adjustTetherOpacity()
      planetCoordSys.rotation.y = 2 * Math.PI * -(213.7+180) / 360
      planetCoordSys.rotation.x = 2 * Math.PI * (90+19.2) / 360
      break;
  }
}

function recomputeNearFarClippingPlanes() {
  // Calculate the distance to the nearest object - for this we will use the sphere encompassing the Earth and it's stratosphere
  // Multiply that by the cosine of thecamera's fulstrum angle
  camera.near = Math.max(10, camera.position.distanceTo(planetMeshes[0].position) - (radiusOfPlanet+dParamWithUnits['ringFinalAltitude'].value+orbitCenterMarkerSize)) * Math.cos(camera.getEffectiveFOV()*Math.PI/180)
  // Far calculation: Use the pythagorean theorm to compute distance to the Earth's horizon,
  // then add the distrance from there to the edge of the sphere that represents the atmosphere,
  // then pad this sum by a factor of 1.5
  const d1Squared = camera.position.distanceTo(planetMeshes[0].position)**2 - radiusOfPlanet**2
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
    camera.near = 0.0001 * radiusOfPlanet
    camera.far = 1 * radiusOfPlanet
  }
  //console.log(camera.near, camera.near*16384, (d1+d2)*1.5, camera.far, 2)
  camera.updateProjectionMatrix()
  nearClippingPlane = camera.near
  farClippingPlane = camera.far
}

addEventListener('mousemove', (event) => {
  mouse.x = 2 * (event.clientX / simContainer.offsetWidth) - 1
  mouse.y = 1 - 2 * (event.clientY / simContainer.offsetHeight)
})

if (enableKMLFileFeature) {
  // This code creates the button that downloads a .kml file which can be displayed using
  // Google Earth's "Create Project" button, followed by "Import KML file from computer"
  var textFile = null
  var makeTextFile = function (text) {
    genKMLFile = true
    const prevFastTetherRender = fastTetherRender
    fastTetherRender = false // Can't generate a KML file when using the fast tether rendering technique
    kmlFile = ''
    kmlFile = kmlutils.kmlFileHeader
    updateRing()
    genKMLFile = false
    fastTetherRender = prevFastTetherRender
    var data = new Blob([kmlFile], {type: 'text/plain'})
    // If we are replacing a previously generated file we need to manually revoke the object URL to avoid memory leaks.
    if (textFile !== null) {
      window.URL.revokeObjectURL(textFile)
    }
    textFile = window.URL.createObjectURL(data)
    return textFile
  }

  var createkml = document.getElementById('createkml')
  var kmlTextBox = document.getElementById('kmlTextBox')

  createkml.addEventListener('click', function () {
    var link = document.createElement('a')
    link.setAttribute('download', 'tethered_ring.kml')
    link.href = makeTextFile(kmlTextBox.value)
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
  var makeTextFile = function (text) {
    genSpecsFile = true
    const prevFastTetherRender = fastTetherRender
    specsFile = ''
    updateRing()
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
  var specsTextBox = document.getElementById('specsTextBox')

  createSpecs.addEventListener('click', function () {
    var link = document.createElement('a')
    link.setAttribute('download', 'tethered_ring.csv')
    link.href = makeTextFile(specsTextBox.value)
    document.body.appendChild(link)

    // wait for the link to be added to the document
    window.requestAnimationFrame(function () {
      var event = new MouseEvent('click')
      link.dispatchEvent(event)
      document.body.removeChild(link)
    })
  }, false)
}

