import * as THREE from 'three'
import { launchBodyColors, launchTrainOffsets } from './launchAssemblyLayout.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'

// Coordinates relative to the sled body; x=sideways, y=forwards, z=up, in metres.
export function launchSledLayout(params) {
  const p = key => params[key].value
  const sx = p('launchSystemRightwardScaleFactor'), sz = p('launchSystemUpwardScaleFactor')
  const vehicleScale = p('launchVehicleScaleFactor')
  const vehicleRadius = p('launchVehicleRadius') * vehicleScale
  const bodyZ = p('launchSledUpwardsOffset')
  const vehicleX = p('launchVehicleSidewaysOffset') / sx - p('launchSledSidewaysOffset')
  const vehicleZ = p('launchVehicleUpwardsOffset') / sz - bodyZ
  const railX = -p('launchSledSidewaysOffset')
  const railTop = (p('launchRailUpwardsOffset') + p('launcherMassDriverRailHeight') / 2) / sz - bodyZ
  const railBottom = (p('launchRailUpwardsOffset') - p('launcherMassDriverRailHeight') / 2) / sz - bodyZ
  const thickness = p('launchSledHeight')
  const clearance = Math.min(0.025, thickness / 8)
  const railHalfWidth = p('launcherMassDriverRailWidth') / (2 * sx)
  const top = vehicleZ - vehicleRadius - clearance
  const bottom = railBottom - clearance - thickness
  return { length: p('launchVehicleBodyLength') * vehicleScale * 1.75,
    aft: launchTrainOffsets(params).sledAft,
    thickness, clearance, vehicleRadius, vehicleX, vehicleZ, railX, railTop, railBottom, railHalfWidth,
    // The original renderer narrowed the OBJ to 60%, giving a 1.968 m body.
    halfWidth: Math.max(p('launchSledWidth') / 2, vehicleRadius * 0.82, railHalfWidth + clearance + thickness),
    top, bottom, centreZ: (top + bottom) / 2 }
}

// Measured transverse construction sections of LaunchSled.obj, in metres.
// Each upper point pairs with the lower point where the circular end closes.
// These are profile controls, not a stored mesh: lengthwise surfaces and topology
// are generated below. The small upper fillet, sloping shoulders and flat centre
// reproduce the original section without adding cradles, guides or supports.
const upperSection = [
  [0,-1.245243373], [0.108944678,-1.245243373],
  [0.323523806,-1.207407283], [0.361850697,-1.198910416],
  [0.400772292,-1.193786291], [0.439992377,-1.192073905],
  [1.639992377,-1.192073905]
]
const lowerSection = [
  [0,-1.693530987], [0.148164763,-1.693530987],
  [0.439992377,-1.642073905], [0.439992377,-1.642073905],
  [0.439992377,-1.642073905], [0.439992377,-1.642073905],
  [1.639992377,-1.642073905]
]
const referenceHalfWidth = 1.639992377
const referenceTop = -1.192073905, referenceBottom = -1.693530987
const referenceHeight = referenceTop-referenceBottom

export function createLaunchSledGeometry({ width, length, height }) {
  const pairs = []
  for (let i = upperSection.length-1; i > 0; i--) {
    pairs.push([[-upperSection[i][0],upperSection[i][1]],[-lowerSection[i][0],lowerSection[i][1]]])
  }
  for (let i = 0; i < upperSection.length; i++) pairs.push([upperSection[i],lowerSection[i]])
  const n = pairs.length, positions = [], indices = []
  // The OBJ has a 10 m straight middle with a 3 m circular end at either end.
  const endLength = length*3/16, rise = 0.225
  const radius = (3*3+rise*rise)/(2*rise)
  const stations = new Set([0,3/16,0.5,13/16,1])
  for (let i = 0; i <= 96; i++) stations.add(i/96)
  const ys = [...stations].sort((a,b)=>a-b)
  for (const u of ys) {
    const distance = Math.min(endLength, Math.min(u,1-u)*length)
    const alongArc = 3*(1-distance/endLength)
    const envelope = (Math.sqrt(radius*radius-alongArc*alongArc)-(radius-rise))/rise
    for (const side of [1,-1]) for (const [upper,lower] of pairs) {
      const x = (upper[0]+lower[0])/2 + side*envelope*(upper[0]-lower[0])/2
      const z = (upper[1]+lower[1])/2 + side*envelope*(upper[1]-lower[1])/2
      positions.push(x/referenceHalfWidth*width/2, u*length, (z-referenceBottom)/referenceHeight*height)
    }
  }
  const quad = (a,b,c,d) => indices.push(a,b,d,b,c,d)
  for (let i = 0; i < ys.length-1; i++) {
    const a = i*2*n, b = a+2*n
    for (let j = 0; j < n-1; j++) {
      quad(a+j,a+j+1,b+j+1,b+j)
      quad(a+n+j+1,a+n+j,b+n+j,b+n+j+1)
    }
    quad(a+n,a,b,b+n)
    quad(a+n-1,a+2*n-1,b+2*n-1,b+n-1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  // Paired sections meet at the tips and along the small lower fillet. Omit
  // collapsed triangles so normals and picking remain well-defined there.
  const validIndices = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const attribute = geometry.getAttribute('position')
  for (let i = 0; i < indices.length; i += 3) {
    a.fromBufferAttribute(attribute,indices[i])
    b.fromBufferAttribute(attribute,indices[i+1]).sub(a)
    c.fromBufferAttribute(attribute,indices[i+2]).sub(a)
    if (b.cross(c).lengthSq() > 1e-20) validIndices.push(indices[i],indices[i+1],indices[i+2])
  }
  geometry.setIndex(validIndices)
  // Keep the original flat side faces sharp while smoothing its small fillets.
  const creased = toCreasedNormals(geometry,Math.PI/6)
  creased.setIndex(Array.from({length:creased.getAttribute('position').count},(_,i)=>i))
  geometry.dispose()
  return creased
}

// A closed rail-embracing section. The opening below clears the existing rail
// pedestal (half the rail width), while inward lips capture the rail shoulders.
export function createRailWrappingSledGeometry(d) {
  const inner = d.railHalfWidth+d.clearance
  const slot = d.railHalfWidth/2+d.clearance
  const roof = d.railTop+d.clearance, under = d.railBottom-d.clearance
  const hullRadius = d.vehicleRadius+d.clearance
  const notchHalf = Math.min(d.halfWidth,hullRadius*0.85)
  const saddle = x => d.flatTop ? d.top : d.vehicleZ-Math.sqrt(hullRadius*hullRadius-Math.min(Math.abs(x),notchHalf)**2)
  const points = [new THREE.Vector2(d.vehicleX-d.halfWidth,saddle(-d.halfWidth))]
  for (let i = 0; i <= 48; i++) {
    const x = notchHalf*(2*i/48-1)
    points.push(new THREE.Vector2(d.vehicleX+x,saddle(x)))
  }
  points.push(new THREE.Vector2(d.vehicleX+d.halfWidth,saddle(d.halfWidth)))
  const topCount = points.length
  for (const [x,z] of [[d.halfWidth,d.bottom],[slot,d.bottom],[slot,under],[inner,under],
    [inner,roof],[-inner,roof],[-inner,under],[-slot,under],[-slot,d.bottom],[-d.halfWidth,d.bottom]]) {
    points.push(new THREE.Vector2(d.railX+x,z))
  }
  // This contour runs clockwise: the top is followed by the right capture arm,
  // the rail pocket, then the left capture arm.
  const positions = [], indices = [], n = points.length, rings = 48
  for (let i = 0; i <= rings; i++) {
    const u = i/rings
    const end = Math.max(0,1-Math.min(u,1-u)/(3/16))
    for (let j = 0; j < n; j++) {
      const p = points[j]
      // Preserve the reference's rounded end relief only on the hull contact face;
      // keep the rail pocket clear along its full length, including the ends.
      positions.push(p.x,u*d.length,p.y-(j<topCount ? d.thickness*0.25*end**2 : 0))
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < n; j++) {
    const a = i*n+j, b = i*n+(j+1)%n, c = b+n, e = a+n
    indices.push(a,b,e,b,c,e)
  }
  for (const [a,b,c] of THREE.ShapeUtils.triangulateShape(points,[])) {
    indices.push(a,b,c,rings*n+c,rings*n+b,rings*n+a)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setIndex(indices)
  const creased = toCreasedNormals(geometry,Math.PI/6)
  creased.setIndex(Array.from({length:creased.getAttribute('position').count},(_,i)=>i))
  geometry.dispose()
  return creased
}

export function createLaunchSledBody(params) {
  const body = new THREE.Group()
  body.name = 'body'
  const mesh = new THREE.Mesh(createRailWrappingSledGeometry(launchSledLayout(params)),
    new THREE.MeshPhongMaterial({color:launchBodyColors.sled}))
  mesh.name = 'referenceBody'; mesh.castShadow = true
  body.add(mesh)
  return body
}
