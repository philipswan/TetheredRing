import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js'
import vertexShader from './shaders/vertex.glsl'
import fragmentShader from './shaders/fragment.glsl'
import atmosphereVertexShader from './shaders/atmosphereVertex.glsl'
import atmosphereFragmentShader from './shaders/atmosphereFragment.glsl'
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/OrbitControls.js'
import { LineMaterial } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/lines/LineMaterial.js'
import { VRButton } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/webxr/VRButton.js'

//import * as THREE from '/build/three.module.js'
//import { OrbitControls } from '/jsm/controls/OrbitControls.js'
//import Stats from '/jsm/libs/stats.module.js'

import * as dat from 'dat.gui'
import * as tram from './tram.js'
import * as launcher from './launcher.js'

const enableVR = false

// Useful constants that we never plan to change
const gravitationalConstant = 0.0000000000667408
const massOfPlanet = 5.97E+24   // kg   using mass of Earth for now
const radiusOfPlanet = 6378100 // m   using radius of Earth for now
const lengthOfSiderealDay = 86164.0905 // seconds    using value for Earth for now
const tetherMaterialTensileStrength = 6370000000 // Pascals  (Using carbon fiber for now)
const tetherMaterialDensity = 1800    // kg/m^3

// Constants controlled by sliders
const guidParam = {
  // Repositioned, but same diameter
  equivalentLatitude: 35.5,
  ringCenterLongtitude: 186.8,
  ringCenterLatitude: 13,
  ringFinalAltitude: 32000,  // m
  
  // Alternate location with the increased diameter needed to reach China's coastline (note: too large to construct in the Pacific Ocean)
  //equivalentLatitude: 30.8,
  //ringCenterLongtitude: 182,
  //ringCenterLatitude: 11,
  //ringFinalAltitude: 32000,  // m
  
  ringAmountRaisedFactor: 1.0,
  numMainRings: 5,
  mainRingTubeRadius: 0.5,
  mainRingSpacing: 10,
  numTethers: 3600,
  numForkLevels: 5,      // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from base to a single attachment point)
  tetherSpanOverlapFactor: 2,   // This is an angle that is currently derived from numTethers...
  tetherPointBxAvePercent: 50,
  tetherPointBxDeltaPercent: 40,
  tetherEngineeringFactor: 2.0,
  cableVisibility: 0.2,
  tetherVisibility: 0.2,
  moveRing: 1,
  //CameraTilt: 0
  transitTubeUpwardOffset: -100,
  launchTubeUpwardOffset: 100,
  numTransitTrackLevels: 2,
  numElevatorCables: 360*5,
  numElevatorCars: 360*5,
}

const targetRadius = 32800000 / Math.PI / 2   // 32800 km is the max size a perfectly circular ring can be and still fits within the Pacific Ocean
guidParam.equivalentLatitude = Math.acos(targetRadius/(radiusOfPlanet + guidParam.ringFinalAltitude)) * 180 / Math.PI

const gui = new dat.GUI()
gui.add(guidParam, 'equivalentLatitude', 10, 80).onChange(adjustRingDesign)   // Need this to be in radians somehow
gui.add(guidParam, 'ringCenterLongtitude', 0, 360).onChange(adjustRingLatLon)
gui.add(guidParam, 'ringCenterLatitude', -90, 90).onChange(adjustRingLatLon)
gui.add(guidParam, 'ringFinalAltitude', 0, 200000).onChange(adjustRingDesign)
gui.add(guidParam, 'ringAmountRaisedFactor', 0, 1).onChange(adjustRingDesign)
gui.add(guidParam, 'numMainRings', 1, 7).onChange(adjustRingDesign).step(1)
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

// Actual Design Parameters derived from slider values
let dParam = {
  equivalentLatitude: 35,
  ringCenterLongtitude: 186.6,
  ringCenterLatitude: 13,
  ringFinalAltitude: 32000,  // m
  ringAmountRaisedFactor: 1.0,
  numMainRings: 1,              // Can't make this larger until the dispose/recreate code is improved
  mainRingTubeRadius: 0.5,
  mainRingSpacing: 10,
  numTethers: 360*5,
  numForkLevels: 7,      // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when travelling from base to a single attachment point)
  tetherSpan: 2 * Math.PI / (360*5) * 1.0,   // This is an angle that is currently derived from numTethers...
  tetherPointBxAvePercent: 0,
  tetherPointBxDeltaPercent: 0,
  tetherPointBx: 30000,
  tetherEngineeringFactor: 2.0,
  cableVisibility: .1,
  tetherVisibility: .03,
  transitTubeUpwardOffset: -100,
  additionalUpperElevatorCable: 10,
  transitTubeTubeRadius: 6,
  launchTubeUpwardOffset: 100,
  numTransitTrackLevels: 2,
  launchTubeLength: 0,
  launchTubeAcceleration: 30, // m/s2
  launchTubeExitVelocity: 8000, // m/s
  launchTubeLength: 0, // m
  launchTubeAccelerationTime: 0, // s
  launchTragectoryVisibility: 1,
  transitTubeOutwardOffset: -10, // m
  elevatorUpperTerminusOutwardOffset: -30, // m 
  numElevatorCables: 360*5,
  numElevatorCars: 360*5,
  showEarthEquator: false,
  showEarthAxis: false,
  showLaunchOrbit: false,
  showLaunchTrajectory: false,
  showTransitSystem: true,
  showLaunchTubes: false,
  showElevators: true,
  animateElevators: true,
}

function updatedParam() {   // Read as "update_dParam"
  // Build location (assumes equivalentLatitude = 35)
  const buildLocationRingCenterLongtitude = 213.7    // Degrees
  const buildLocationRingCenterLatitude = -19.2      // Degrees
  dParam.equivalentLatitude = guidParam.equivalentLatitude / 180 * Math.PI
  dParam.ringCenterLongtitude = tram.lerp(buildLocationRingCenterLongtitude, guidParam.ringCenterLongtitude, guidParam.moveRing)  / 180 * Math.PI
  dParam.ringCenterLatitude = tram.lerp(buildLocationRingCenterLatitude, guidParam.ringCenterLatitude, guidParam.moveRing) / 180 * Math.PI
  dParam.ringFinalAltitude = guidParam.ringFinalAltitude
  dParam.ringAmountRaisedFactor = guidParam.ringAmountRaisedFactor
  dParam.numMainRings = guidParam.numMainRings
  dParam.mainRingTubeRadius = guidParam.mainRingTubeRadius
  dParam.numTethers = guidParam.numTethers
  dParam.numForkLevels = guidParam.numForkLevels
  dParam.tetherSpan = 2 * Math.PI / guidParam.numTethers * guidParam.tetherSpanOverlapFactor
  dParam.tetherPointBxAvePercent = guidParam.tetherPointBxAvePercent
  dParam.tetherPointBxDeltaPercent = guidParam.tetherPointBxDeltaPercent
  dParam.tetherEngineeringFactor = guidParam.tetherEngineeringFactor
  dParam.cableVisibility = guidParam.cableVisibility
  dParam.tetherVisibility = guidParam.tetherVisibility
  dParam.transitTubeUpwardOffset = guidParam.transitTubeUpwardOffset
  dParam.additionalUpperElevatorCable = 10
  dParam.launchTubeUpwardOffset = guidParam.launchTubeUpwardOffset
  dParam.numTransitTrackLevels = guidParam.numTransitTrackLevels
  dParam.launchTubeAcceleration = 30 // m/s2
  dParam.launchTubeExitVelocity = 8000 // m/s
  dParam.launchTubeLength = dParam.launchTubeExitVelocity**2 /2 / dParam.launchTubeAcceleration
  dParam.launchTubeAccelerationTime = dParam.launchTubeExitVelocity / dParam.launchTubeAcceleration
  dParam.launchTragectoryVisibility = 1.0
  dParam.numElevatorCables = guidParam.numElevatorCables
  dParam.numElevatorCars = guidParam.numElevatorCars
}

updatedParam()

function adjustRingDesign() {
  updateRing()
}

function adjustCableOpacity() {
  updatedParam()
  cableMaterial.opacity = dParam.cableVisibility
}

function adjustTetherOpacity() {
  updatedParam()
  tetherMaterial.opacity = dParam.tetherVisibility
}

function adjustRingLatLon() {
  updatedParam()
  const object1 = scene.getObjectByName("TetheredRingLonCoordSys")
  object1.rotation.y = dParam.ringCenterLongtitude
  const object2 = scene.getObjectByName("TetheredRingLatCoordSys")
  object2.rotation.x = -dParam.ringCenterLatitude
}

// Three.js Rendering Setup
let simContainer = document.querySelector('#simContainer')

const raycaster = new THREE.Raycaster()
const scene = new THREE.Scene()
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
atmosphereMesh.scale.set(1.1, 1.1, 1.1)
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

if (dParam.showEarthAxis) {
  const axisGeometry = new THREE.CylinderGeometry(AxisEquatorThickness, AxisEquatorThickness, 2.5*radiusOfPlanet, 4, 1, false)
  const axisMesh = new THREE.Mesh(axisGeometry, grayMaterial)
  planetCoordSys.add(axisMesh)
}

if (dParam.showEarthEquator) {
  const equatorGeometry = new THREE.TorusGeometry(radiusOfPlanet, AxisEquatorThickness, 8, 128)
  const equatorMesh = new THREE.Mesh(equatorGeometry, grayMaterial)
  equatorMesh.rotation.x = 3.1415927/2
  planetCoordSys.add(equatorMesh)
}

if (dParam.showLaunchOrbit) {
  const OrbitalAltitude = 200000 // m
  const launchOrbitGeometry = new THREE.TorusGeometry(radiusOfPlanet + OrbitalAltitude, AxisEquatorThickness, 8, 128)
  const launchOrbitMesh = new THREE.Mesh(launchOrbitGeometry, grayMaterial)
  //launchOrbitMesh.setRotationFromEuler(Math.PI/2 + dParam.ringCenterLatitude - (Math.PI/2 - dParam.equivalentLatitude), Math.PI/2 + dParam.ringCenterLongtitude, 0)
  launchOrbitMesh.rotateY(dParam.ringCenterLongtitude)
  launchOrbitMesh.rotateX(Math.PI/2 - dParam.ringCenterLatitude + (Math.PI/2 - dParam.equivalentLatitude))
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
planetCoordSys.add(stars)

// "Gimbal" code for the TetheredRingRefCoordSys    
const TetheredRingLonCoordSys = new THREE.Group();
TetheredRingLonCoordSys.name = "TetheredRingLonCoordSys"
planetCoordSys.add(TetheredRingLonCoordSys)
TetheredRingLonCoordSys.position.x = 0
TetheredRingLonCoordSys.position.y = 0
TetheredRingLonCoordSys.rotation.y = dParam.ringCenterLongtitude

const TetheredRingLatCoordSys = new THREE.Group();
TetheredRingLatCoordSys.name = "TetheredRingLatCoordSys"
TetheredRingLonCoordSys.add(TetheredRingLatCoordSys)
TetheredRingLatCoordSys.rotation.x = -dParam.ringCenterLatitude

const TetheredRingRefCoordSys = new THREE.Group();
TetheredRingLatCoordSys.add(TetheredRingRefCoordSys)
TetheredRingRefCoordSys.rotation.x = Math.PI/2       
// The above line puts the reference coordinate system's y-axis at lat/lon {0, 0} when RingCenterLat==0 and RingCenterLon==0
// This is needed because the ring will be centered around the coordinate system's y-axis
// We want the ring centered around the y-axis because .setFromSphericalCoords's polar angle is relative to the y-axis

// Generate the main ring
let crv = new tram.commonRingVariables(radiusOfPlanet, dParam.ringFinalAltitude, dParam.equivalentLatitude, dParam.ringAmountRaisedFactor)
let ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParam.ringFinalAltitude, dParam.equivalentLatitude, dParam.ringAmountRaisedFactor, dParam, crv)

const mainRingMeshes = []
constructMainRings()

function constructMainRings() {
  const mainRingRadialSegments = 8
  const mainRingTubularSegments = 8192
  const mainRingGeometry = new THREE.TorusGeometry(crv.mainRingRadius, dParam.mainRingTubeRadius, mainRingRadialSegments, mainRingTubularSegments)
  for (let i = 0; i<dParam.numMainRings; i++) {
    const mainRingMesh = new THREE.Mesh(mainRingGeometry, metalicMaterial)
    mainRingMesh.rotation.x = Math.PI/2      // We need a torus that sits on the x-z plane because .setFromSphericalCoords's polar angle is reletive to the y-axis
    mainRingMesh.position.y = crv.yc + (i-((dParam.numMainRings-1)/2))*dParam.mainRingSpacing     // Space the rings 10m apart from each other
    mainRingMeshes.push(mainRingMesh)
  }
  mainRingMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))
}

const transitSystemMeshes = []
function constructTransitSystem() {
  // Add the transit tube
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const transitTubeRadius = crv.mainRingRadius + tram.offset_r(dParam.transitTubeOutwardOffset, dParam.transitTubeUpwardOffset, crv.currentEquivalentLatitude)
  const transitTube_y = crv.yc + tram.offset_y(dParam.transitTubeOutwardOffset, dParam.transitTubeUpwardOffset, crv.currentEquivalentLatitude)
  const transitTubeRadialSegments = 8
  const transitTubeTubularSegments = 8192
  const transitTubeGeometry = new THREE.TorusGeometry(transitTubeRadius, dParam.transitTubeTubeRadius, transitTubeRadialSegments, transitTubeTubularSegments)
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
    let outwardOffset = trackOffsetsList[i][0] * dParam.transitTubeTubeRadius 
    let upwardOffset = trackOffsetsList[i][1] * dParam.transitTubeTubeRadius
    transitSystemMeshes.push(makeTrackMesh(outwardOffset, upwardOffset, trackWidth, trackHeight, transitTubeRadius, transitTubeMesh.position.y, crv.currentEquivalentLatitude))
  }
  transitSystemMeshes.forEach(mesh => TetheredRingRefCoordSys.add(mesh))
}
if (dParam.showTransitSystem) {
  // Create the transit system
  constructTransitSystem()
}

const launchTubeMeshes = []
function constructLaunchTube() {
  // Add the launch tube
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const launchTubeOutwardOffset = 10
  const launchTubeRadius = crv.mainRingRadius + tram.offset_r(launchTubeOutwardOffset, -dParam.launchTubeUpwardOffset, crv.currentEquivalentLatitude)
  const launchTube_y = crv.yc + tram.offset_y(launchTubeOutwardOffset, -dParam.launchTubeUpwardOffset, crv.currentEquivalentLatitude)
  const launchTubeArc = dParam.launchTubeLength/(2*Math.PI*launchTubeRadius)*2*Math.PI
  
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
if (dParam.showLaunchTubes) {
  constructLaunchTube()
}

let elevatorAltitude = (crv.currentMainRingAltitude+dParam.transitTubeUpwardOffset) - 20
const elevatorCarMeshes = []
const elevatorCableMeshes = []
var cableMaterial = new THREE.LineBasicMaterial({
  vertexColors: THREE.VertexColors,
  //color: 0x4897f8,
  transparent: true,
  opacity: dParam.cableVisibility
})

function addStraightLineSegment(points, ) {

  // const tempGeometry = new THREE.BufferGeometry().setFromPoints(points)    // Add the new geometry back
  // // tempGeometry.addAttribute("color", new THREE.Float32BufferAttribute(0x0000ff, 3) );
  // for (let i=0; i<dParam.numTethers/2; i++) {
  //   tethers[i] = new THREE.LineSegments(tempGeometry.clone(), tetherMaterial);
  //   tethers[i].rotation.y = 2 * Math.PI * i * 2 / dParam.numTethers
  //   TetheredRingRefCoordSys.add(tethers[i])
  // }

  // const points.push(new THREE.Vector3().setFromSphericalCoords(r_0, φ_0, θ + branch.dθ_0))
  
  // const elevatorCableGeometry = new THREE.CylinderGeometry(elevatorCableTubeRadius, elevatorCableTubeRadius, elevatorCableLength, elevatorCableTubularSegments)
  // const elevatorCableMesh = new THREE.Mesh(elevatorCableGeometry, transparentMaterial)
  // elevatorCableMesh.rotation.x = Math.PI/2
  // elevatorCableMesh.position.y = crv.yc + tram.offset_y(-10, -elevatorCableLength, crv.currentEquivalentLatitude)
}

function constructElevatorCables() {
  // Add elevator cables
  // crv.y0, crv.yc, and crv.yf are the initial, current, and final distances between the center of the earth and the center of mass of the moving rings.
  const cableOutwardOffset = dParam.transitTubeOutwardOffset - dParam.transitTubeTubeRadius + dParam.elevatorUpperTerminusOutwardOffset
  const elevatorCableUpperAttachPnt_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, dParam.transitTubeUpwardOffset + dParam.additionalUpperElevatorCable, crv.currentEquivalentLatitude)
  const elevatorCableUpperPlatform_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, dParam.transitTubeUpwardOffset, crv.currentEquivalentLatitude)
  const elevatorCableLowerAttachPnt_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  const elevatorCableUpperAttachPnt_y = crv.yc + tram.offset_y(cableOutwardOffset, dParam.transitTubeUpwardOffset + dParam.additionalUpperElevatorCable, crv.currentEquivalentLatitude)
  const elevatorCableUpperPlatform_y = crv.yc + tram.offset_y(cableOutwardOffset, dParam.transitTubeUpwardOffset, crv.currentEquivalentLatitude)
  const elevatorCableLowerAttachPnt_y = crv.yc + tram.offset_y(cableOutwardOffset, -crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  //const elevatorCableTubeRadius = 1000.01
  //const elevatorCableTubularSegments = 8 

  let tempGeometry
  const platformMesh = new THREE.Mesh(new THREE.BoxGeometry(dParam.elevatorUpperTerminusOutwardOffset*2, 1, 10), greenMaterial)

  for (let a = 0; a<Math.PI*2; a+=Math.PI*2/dParam.numElevatorCables) {
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
  const cableOutwardOffset = dParam.transitTubeOutwardOffset - dParam.transitTubeTubeRadius + dParam.elevatorUpperTerminusOutwardOffset
  const elevatorCarPosition_r = crv.mainRingRadius + tram.offset_r(cableOutwardOffset, elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)
  const elevatorCarPosition_y = crv.yc + tram.offset_y(cableOutwardOffset, elevatorAltitude-crv.currentMainRingAltitude, crv.currentEquivalentLatitude)

  const elevatorCarMesh = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 10, 16), metalicMaterial)

  for (let a = 0; a<Math.PI*2; a+=Math.PI*2/dParam.numElevatorCars) {
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
if (dParam.showElevators) {
  constructElevatorCables()
  constructElevatorCars()
}

// Tethers
// Tethered Ring Math
function tetherMath() {
  // Inputs:
  // gravitationalConstant, radiusOfPlanet, massOfPlanet
  // dParam.ringFinalAltitude, dParam.ringAmountRaisedFactor, dParam.massPerMeterOfRing, dParam.equivalentLatitude, dParam.tetherEngineeringFactor, dParam.numForkLevels, dParam.tetherPointBxAvePercent, dParam.tetherPointBxDeltaPercent
  // tetherMaterialDensity, tetherStress

  const final_r = radiusOfPlanet + dParam.ringFinalAltitude

  const m = 1     // Mass per meter of ring (ToDo: Make this a design parameter) (ToDo: Set this to a more realistic default value)
  const fExertedByGravityOnRing = gravitationalConstant * massOfPlanet * m / (final_r**2)
  // The following vectors are in spherical coordinates where: x = rho, y = θ, and z = z
  const fG = new THREE.Vector3() // Vector representing the force of gravity at a point on the tether in planet-centered spherical coordinates
  const fT = new THREE.Vector3() // Vector representing the tensile force exerted at a point on the tether in planet-centered spherical coordinates
  const fI = new THREE.Vector3()  // Vector representing the force of gravity at a point on the tether in planet-centered spherical coordinates

  fG.x = -fExertedByGravityOnRing * Math.cos(dParam.equivalentLatitude)
  fG.y = 0
  fG.z = -fExertedByGravityOnRing * Math.sin(dParam.equivalentLatitude)
  fT.z = -fG.z                     // Eq 6

  const tetherStress = tetherMaterialTensileStrength / dParam.tetherEngineeringFactor
  const aveForceOfGravity = gravitationalConstant * massOfPlanet * 1 / ((radiusOfPlanet + dParam.ringFinalAltitude / 2)**2)
  const c = tetherStress / tetherMaterialDensity / aveForceOfGravity  // We're using the average force of gravity here as an engineering approximation (Eq 17)
  
  // Initially we will assume that PointB is at x=0 on the catenary. This is done just so that we can calculate a temporary "PointP.x", 
  // and then set PointB.x as a percentage of this temporarty PointP.x. 
  const tempPointP = new tram.CateneryVec3()
  tempPointP.y = dParam.ringFinalAltitude
  tempPointP.x = c * Math.acos(Math.exp(-tempPointP.y/c))      // Eq 11
  tempPointP.s = c * Math.acosh(Math.exp(tempPointP.y/c))      // Eq 13b
  
  const tetherTypes = [[], []]
  const finalCatenaryTypes = [[], []]                          // Shape of the catenary after the ring is raised to full height - used to "design" the thethers.
  const currentCatenaryTypes = [[], []]                        // Shape of the catenery for the portion of the tethers that are off the ground when the ring is less than fully elevated   
  const finalTetherLength = []
  const currentTetherLength = []
  const numTetherSegments = (2 ** (dParam.numForkLevels+1)) - 1       // Starting from anchor, after each fork the distance to the next fork (or attacment point) is halved
  const numTetherPoints = numTetherSegments + 1                // Because, for example, it takes 5 points to speify 4 segments

  finalCatenaryTypes.forEach((catenaryType, j) => {
    const pointB = new tram.CateneryVec3()
    const pointP = new tram.CateneryVec3()
    const minusplus = [-1, 1]
    pointB.x = tempPointP.x * (dParam.tetherPointBxAvePercent + minusplus[j] * dParam.tetherPointBxDeltaPercent/2)/100
    pointB.y = c * Math.log(1.0/Math.cos(pointB.x/c))    // Eq 10
    pointB.s = c * Math.acosh(Math.exp(pointB.y/c))      // Eq 13b
    pointP.y = pointB.y + dParam.ringFinalAltitude
    //pointP.x = c * Math.acos(Math.exp(-pointP.y/c))      // Eq 11
    pointP.s = c * Math.acosh(Math.exp(pointP.y/c))      // Eq 13b
    //const θ_P = pointP.x / c
    //const φ_P = -(Math.PI/2 - (dParam.equivalentLatitude))
    //fT.x = fT.z / (Math.tan(θ_P+φ_P))                    // Eq 19
    //fI.x = -fG.x - fT.x                                  // Eq 20
    finalTetherLength[j] = pointP.s - pointB.s     // Does not account for forks
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
    const pointB = new tram.CateneryVec3()
    const pointP = new tram.CateneryVec3()
    const minusplus = [-1, 1]
    pointB.x = tempPointP.x * (dParam.tetherPointBxAvePercent + minusplus[j] * dParam.tetherPointBxDeltaPercent/2)/100
    pointB.y = c * Math.log(1.0/Math.cos(pointB.x/c))    // Eq 10
    pointB.s = c * Math.acosh(Math.exp(pointB.y/c))      // Eq 13b
    pointB_s[j] = pointB.s  // We'll need to use this later
    pointP.y = pointB.y + crv.currentMainRingAltitude
    pointP.x = c * Math.acos(Math.exp(-pointP.y/c))      // Eq 11
    pointP.s = c * Math.acosh(Math.exp(pointP.y/c))      // Eq 13b
    const θ_P = pointP.x / c
    const φ_P = -(Math.PI/2 - crv.currentEquivalentLatitude)   // negative because angle increases in clockwise direction
    fT.x = fT.z / (Math.tan(θ_P+φ_P))         // Eq 19
    fI.x = -fG.x - fT.x                           // Eq 20

    currentTetherLength[j] = pointP.s - pointB.s
    
    for (let i = 0; i<=numTetherPoints-1; i++) {
      const sFraction = i / (numTetherPoints-1)
      let s = pointB.s + currentTetherLength[j] - finalTetherLength[j] * (1 - sFraction)
      // Compute a distance from the center of the planet and a angle from the ring's axis of symmetry
      let x = 2 * c * Math.atan(Math.exp(s/c)) - (c * Math.PI / 2)   // Eq 15
      let y = c * Math.log(Math.cosh(s/c))                           // Eq 16
      let r = radiusOfPlanet + (y - pointB.y)
      let φ_anchor = φ_P + (pointP.x-pointB.x) / radiusOfPlanet     // Left this unreduced to make it a bit easier to understand the logic
      let φ = φ_anchor - (x-pointB.x) / radiusOfPlanet
      catenaryType.push(new tram.CatenaryPolarVec3(r, φ, s))
    }
  })

  class Branch {
    constructor(base_point, base_dθ, target_point, target_dθ) {
      this.base_point = base_point
      this.base_dθ = base_dθ                   // This is the distance from the root tether segment to the base of the current branch in the θ-axis
      this.target_point = target_point
      this.target_dθ = target_dθ               // This is the distance from the root tether segment to point on the ring that the current segment is heading towards, in the θ-axis
      this.dθ_0 = base_dθ
      this.dθ_1 = 0
    }
  }

  // The 'j' index is used to stagger the tethers 
  const tetherSegments = [[], []]
  let indexesToDelete
  tetherTypes.forEach((tetherType, j) => {
    const catenaryPoints = currentCatenaryTypes[j]
    const θ = j / dParam.numTethers * 2.0 * Math.PI
    // Spherical coordinates (r, φ, θ) as commonly used by three.js, where φ id the polar angle, θ is the equitorial angle 
    let r_0 = catenaryPoints[0].r
    let φ_0 = catenaryPoints[0].φ
    let s_0 = catenaryPoints[0].s
    let r_1
    let φ_1
    let s_1
    let branches = []
    branches.push(new Branch(0, 0.0, numTetherPoints, 0.0))  // This defines the trunck of the tether

    const mro = (dParam.numMainRings-1)/2
    for (let i = 0; i<=numTetherPoints-2; i++) {
      r_1 = catenaryPoints[i+1].r
      φ_1 = catenaryPoints[i+1].φ
      s_1 = catenaryPoints[i+1].s

      if ((s_0<pointB_s[j]) && (pointB_s[j]<s_1)) {
        // We need to recalculate the r_0, φ_0 values more accurately by using lerps...
        const frac = (pointB_s[j]-s_0)/(s_1-s_0)
        r_0 = tram.lerp(r_0, r_1, frac)
        φ_0 = tram.lerp(φ_0, φ_1, frac)
      }

      if ((i>0) && (Number.isInteger(Math.log2(numTetherPoints-i)))) {      // If we're at a point where the tether segments fork...
        const logNumStays = dParam.numForkLevels + 1 - Math.log2(numTetherPoints-i)
        const target_dθ_Alteration = dParam.tetherSpan/(2**(logNumStays+1))
        branches.forEach((branch, index) => {
          // Create two new branches, then delete the original
          branches.push(new Branch(i, branch.dθ_0, numTetherPoints, branch.target_dθ + target_dθ_Alteration))
          branches.push(new Branch(i, branch.dθ_0, numTetherPoints, branch.target_dθ - target_dθ_Alteration))
          delete branches[index]    // Some advice out there says not to use delete because then len() will return wrong results, but it's efficient at this task
        })
      }
      branches.forEach((branch) => {
        branch.dθ_1 = tram.lerp(branch.base_dθ, branch.target_dθ, (i+1 - branch.base_point)/(numTetherPoints-1 - branch.base_point))
        if (s_1>pointB_s[j]) {   // When raising the ring, points on the parts of the tether that are on the spool have all have the same coordinates (i.e. the spool's coordinates).
          if (s_0<pointB_s[j]) {
            // We need to recalculate the branch.dθ_0 value more accurately by using a lerp...
            const frac = (pointB_s[j]-s_0)/(s_1-s_0)
            branch.dθ_0 = tram.lerp(branch.dθ_0, branch.dθ_1, frac)
          }
          if (i<numTetherPoints-2) {
            tetherPoints.push( new THREE.Vector3().setFromSphericalCoords(r_0, φ_0, θ + branch.dθ_0))
            tetherPoints.push( new THREE.Vector3().setFromSphericalCoords(r_1, φ_1, θ + branch.dθ_1))
          }
          else {
            for (let k = 0; k<dParam.numMainRings; k++) {
              tetherPoints.push( new THREE.Vector3().setFromSphericalCoords(r_0, φ_0, θ + branch.dθ_0))
              let outwardPoint = new THREE.Vector3().setFromSphericalCoords(r_1, φ_1, θ + branch.dθ_1) 
              outwardPoint.y += (k-mro)*dParam.mainRingSpacing
              tetherPoints.push(outwardPoint)
            }
          }
        }
        branch.dθ_0 = branch.dθ_1
      })
      r_0 = r_1
      φ_0 = φ_1
      s_0 = s_1
    }
  })
}

// Generate the Tethers
const tetherPoints = []
const tethers = []
tetherMath()
const tetherGeometry = new THREE.BufferGeometry().setFromPoints(tetherPoints)
var tetherMaterial = new THREE.LineBasicMaterial({
  vertexColors: THREE.VertexColors,
  //color: 0x4897f8,
  transparent: true,
  opacity: dParam.tetherVisibility
})
for (let i=0; i<dParam.numTethers/2; i++) {
  tethers[i] = new THREE.LineSegments(tetherGeometry, tetherMaterial);
  tethers[i].rotation.y = 2 * Math.PI * i * 2 / dParam.numTethers
  TetheredRingRefCoordSys.add(tethers[i])
}
tetherPoints.splice(0, tetherPoints.length)   // Frees the memory used for these points

if (dParam.showLaunchTrajectory) {
  // Launch Tragectory Line
  const l = new launcher.launcher()
  l.Update()
  let ADandV
  ADandV = l.GetAltitudeDistanceAndVelocity(0)
  //const displacement = new THREE.Vector3(0, 0, 0)
  //let distanceTraveledInsideTube = 0
  //let distanceTraveledOutsideTube = 0
  //let angularDistance = (distanceTraveledInsideTube-dParam.launchTubeLength)/crv.mainRingRadius
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

  for (t=1; t<3*dParam.launchTubeAccelerationTime; t++) {
    // distanceTraveledInsideTube = 0.5 * dParam.launchTubeAcceleration * t**2
    // distanceTraveledOutsideTube = Math.max(0, dParam.launchTubeExitVelocity * (t - dParam.launchTubeAccelerationTime))
    // angularDistance = Math.min(0, (distanceTraveledInsideTube-dParam.launchTubeLength)/crv.mainRingRadius)
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
    opacity: dParam.launchTragectoryVisibility
  })
  const launchTragectoryMesh = new THREE.LineSegments(launchTragectoryGeometry, launchTragectoryMaterial)
  TetheredRingRefCoordSys.add( launchTragectoryMesh )
  // End Launch Tragectory Line
}

function updateRing() {
  
  // Deletion Section
  mainRingMeshes.forEach(mesh => {
    mesh.geometry.dispose()
    mesh.material.dispose()
    TetheredRingRefCoordSys.remove(mesh)
  })
  mainRingMeshes.splice(0, mainRingMeshes.length)

  if (dParam.showTransitSystem) {
    transitSystemMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      TetheredRingRefCoordSys.remove(mesh)
    })
    transitSystemMeshes.splice(0, transitSystemMeshes.length)
  }

  if (dParam.showLaunchTubes) {
    launchTubeMeshes.forEach(mesh => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      TetheredRingRefCoordSys.remove(mesh)
    })
    launchTubeMeshes.splice(0, launchTubeMeshes.length)
  }

  if (dParam.showElevators) {
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

  for (let i=0; i<dParam.numTethers/2; i++) {
    tethers[i].geometry.dispose()
    tethers[i].material.dispose()
    //tethers[i].color.dispose()
    TetheredRingRefCoordSys.remove(tethers[i])
  }

  // Update the parameters prior to reconsrructing the scene
  updatedParam()

  // Reconstruction Section
  crv = new tram.commonRingVariables(radiusOfPlanet, dParam.ringFinalAltitude, dParam.equivalentLatitude, dParam.ringAmountRaisedFactor)
  ecv = new tram.elevatorCarVariables(gravitationalConstant, massOfPlanet, radiusOfPlanet, dParam.ringFinalAltitude, dParam.equivalentLatitude, dParam.ringAmountRaisedFactor, dParam, crv)
  constructMainRings()
  if (dParam.showTransitSystem) {
    constructTransitSystem()
  }
  if (dParam.showLaunchTubes) {
    constructLaunchTube()
  }
  if (dParam.showElevators) {
    constructElevatorCables()
    constructElevatorCars()
  }
  tetherMath()       // Regenerate the geometry

  const tempGeometry = new THREE.BufferGeometry().setFromPoints(tetherPoints)    // Add the new geometry back
  // tempGeometry.addAttribute("color", new THREE.Float32BufferAttribute(0x0000ff, 3) );
  for (let i=0; i<dParam.numTethers/2; i++) {
    tethers[i] = new THREE.LineSegments(tempGeometry.clone(), tetherMaterial);
    tethers[i].rotation.y = 2 * Math.PI * i * 2 / dParam.numTethers
    TetheredRingRefCoordSys.add(tethers[i])
  }
  tetherPoints.splice(0, tetherPoints.length)   // Frees the memory used for these points
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
      cameraGroup.position.z -= -0.0001 * radiusOfPlanet
      console.log(cameraGroup.position.z/radiusOfPlanet)
    }
    adjustRingDesign()
  }

  if (dParam.showElevators && dParam.animateElevators) {
    elevatorAltitude = tram.getElevatorCarAltitude(dParam, crv, ecv, timeSinceStart)
    //console.log(elevatorAltitude)
    const cableOutwardOffset = dParam.transitTubeOutwardOffset - dParam.transitTubeTubeRadius + dParam.elevatorUpperTerminusOutwardOffset
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
//   const r = radiusOfPlanet + dParam.ringFinalAltitude * dParam.ringAmountRaisedFactor
//   const φ = -(Math.PI/2 - dParam.equivalentLatitude)
//   let pointOnRing = new THREE.Vector3()
//   const cursorPoint = intersectionPoint.multiplyScalar((radiusOfPlanet + dParam.ringFinalAltitude * dParam.ringAmountRaisedFactor)/radiusOfPlanet)

//   let minDistace
//   let bestPoint = new THREE.Vector3()
//   for (let i = 0; i<dParam.numTethers; i+=dParam.numTethers/4) {
//     const θ = i / dParam.numTethers * 2.0 * Math.PI
//     pointOnRing.setFromSphericalCoords(r, φ, θ).localToWorld()
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
      if (dParam.showTransitSystem) {
        transitSystemMeshes.forEach(mesh => {
          transitTubeIntersects.push.apply(transitTubeIntersects, raycaster.intersectObject(mesh))
        })
      }
      if (transitTubeIntersects.length>0) {
        intersectionPoint = transitTubeIntersects[0].point
        targetPoint = intersectionPoint
        orbitCenterMarkerSize = 100
        orbitControlsRotateSpeed = 0.05
      }
      else if (planetIntersects.length>0) { // Note: would probably be advisable to assert here that there is only one intersection point.
        intersectionPoint = planetIntersects[0].point
        targetPoint = intersectionPoint.multiplyScalar((radiusOfPlanet + crv.currentMainRingAltitude)/radiusOfPlanet)
        orbitCenterMarkerSize = 10000
        orbitControlsRotateSpeed = 0.9
      }
      orbitControls.target.copy(targetPoint)
      const upVector = new THREE.Vector3
      upVector.copy(intersectionPoint).normalize()
      //console.log(upVector)
      //camera.up.set(intersectionPoint.normalize())
      cameraGroup.up.set(upVector.x, upVector.y, upVector.z)
      //orbitControls.up.set(upVector.x, upVector.y, upVector.z)
      orbitControls.screenSpacePanning = false      
      orbitControls.rotateSpeed = orbitControlsRotateSpeed
      break;
    case 81: /*Q*/
      orbitControls.autoRotate ^= true
      break;
    case 82: /*R*/
      dParam.ringCenterLongtitude -= 0.1
      updateRing()
      break; 
    case 84: /*T*/
      dParam.ringCenterLongtitude += 0.1
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
      guidParam.numElevatorCables = 45
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
  camera.near = Math.max(10, camera.position.distanceTo(planetMeshes[0].position) - (radiusOfPlanet+dParam.ringFinalAltitude+orbitCenterMarkerSize)) * Math.cos(camera.getEffectiveFOV()*Math.PI/180)
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