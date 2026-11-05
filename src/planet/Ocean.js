import * as THREE from 'three'
import { ecefToGeodetic } from '../physics/geodesy.js'
import { fbmGlsl, noiseOffsets, SEA_SURFACE_FREQUENCIES, seaSurfaceLookGlsl } from './seaNoise.js'
import { SeaDarkening } from './seaDarkening.js'
import { seaSkyReflectionGlsl, seaWaveUniforms } from './seaWaves.js'
import '../scene/sunAndSkyLight.js' // registers <sun_and_sky_light>, which seaSkyReflectionGlsl uses
import { WaterFog } from './waterFog.js'

// The sea, as seen from in it: the underside of the water surface, and an underwater look (fog in the
// water colour, no sky). From above, the surface is drawn by the planet's tiles in the colour of the
// ocean in the imagery (see CubedSpherePlanetRenderer._buildWaterGeometry).
//
// The underside is a disc of the sea-level ellipsoid around the point above the camera, out to the
// horizon, rebuilt in float64 relative to that point (a planet-sized sphere would sag by hundreds of
// metres between vertices, and absolute float32 coordinates would jitter). Rings get geometrically
// wider away from the camera, so the surface stays smooth at any depth. It is only drawn while the
// camera is under the surface.
//
// The camera is "under the surface" when it is below sea level and above the sea floor, and "in the
// water" when, in addition, it is not inside the evacuated mass-driver tube, which keeps the water out.
// Under the surface there is no sky (the background is the water colour), and things fade into the water
// by how far the line of sight travels through water, leaving out the part inside the tube (see
// waterFog.js).
const RINGS = 64
const SECTORS = 64
const UNDERSIDE_COLOR = new THREE.Color(0x6fb3c9)
const UNDERSIDE_OPACITY = 0.18 // looking straight up through it (more at grazing angles)
// Seen from above (through the water, near the horizon): deep water, matching the fog in the sea.
const UNDERSIDE_FROM_ABOVE = [0.012, 0.03, 0.05]
// Snell's window: light from above the surface reaches the camera only within the critical angle of the
// vertical, asin(1 / 1.333) = 48.6 degrees; beyond it the surface reflects totally, and shows the water
// below as a mirror would. Within it the surface reflects more towards its edge (Fresnel's equations,
// from water into air), which ripples soften by tilting the surface. The mirrored water is taken as the
// water's colour (the fog's), a little lighter or darker with the ripples, so the surface still shows.
const WATER_INDEX = 1.333
const MIRROR_OPACITY = 0.995 // the mirror mesh draws where the underside is at least this opaque
const undersideGlsl = `
// Fresnel reflectance from water into air (unpolarised), for cos(incidence) = cosI.
float seaUndersideReflectance(float cosI) {
  float sinT2 = ${(WATER_INDEX * WATER_INDEX).toFixed(6)} * (1.0 - cosI * cosI);
  if (sinT2 >= 1.0) return 1.0;
  float cosT = sqrt(1.0 - sinT2);
  float rs = (${WATER_INDEX.toFixed(3)} * cosI - cosT) / (${WATER_INDEX.toFixed(3)} * cosI + cosT);
  float rp = (${WATER_INDEX.toFixed(3)} * cosT - cosI) / (${WATER_INDEX.toFixed(3)} * cosT + cosI);
  return 0.5 * (rs * rs + rp * rp);
}

// The underside's colour and opacity: the surface's own look (shaded), and over it the mirrored water,
// by the reflectance averaged over the ripples' tilt (a few degrees, so the window's edge is soft).
vec4 seaUndersideLook(vec4 shaded, vec3 water, float facing, float ripple) {
  float tilt = 0.035;
  float c = clamp(facing + 0.02 * ripple, 0.0, 1.0);
  float reflectance = (seaUndersideReflectance(clamp(c - tilt, 0.0, 1.0)) + 2.0 * seaUndersideReflectance(c)
    + seaUndersideReflectance(clamp(c + tilt, 0.0, 1.0))) * 0.25;
  vec3 mirrored = water * (1.0 + 0.15 * ripple);
  float alpha = 1.0 - (1.0 - shaded.a) * (1.0 - reflectance);
  vec3 color = (shaded.rgb * shaded.a * (1.0 - reflectance) + mirrored * reflectance) / max(alpha, 1e-4);
  return vec4(color, alpha);
}
`
const SHALLOW_WATER_COLOR = new THREE.Color(0x1f6f8c)
const DEEP_WATER_COLOR = new THREE.Color(0x04131f)
// The water colour goes from slightly darker than SHALLOW just under the surface towards (but never
// as dark as) DEEP, gently: a fraction SURFACE_DARKENING + (MAX_DARKENING - SURFACE_DARKENING) *
// (1 - exp(-depth / DARKENING_DEPTH)) of the way.
const SURFACE_DARKENING = 0.1
const MAX_DARKENING = 0.7
const DARKENING_DEPTH = 600 // m

const _camera = new THREE.Vector3()
const _snapped = new THREE.Vector3()
const _up = new THREE.Vector3()
const _east = new THREE.Vector3()
const _north = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _point = new THREE.Vector3()
const _origin = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()

export class Ocean {
  // parent: the planet's coordinate system (planet-centred, Y = polar axis).
  // sampleTerrainHeight(latDeg, lonDeg) -> { heightMeters } | null
  constructor({ planetSpec, parent, scene, sampleTerrainHeight }) {
    this.ellipsoid = planetSpec.ellipsoid
    this.parent = parent
    this.scene = scene
    this.sampleTerrainHeight = sampleTerrainHeight
    this.visibility = 20000 // m: where things underwater have almost faded out (a cue, not realism)
    this.enabled = true
    this.cameraInWater = false
    this.cameraUnderSurface = false
    this.cameraDepth = 0

    const geometry = discGeometry()
    // Seen from below (back faces), lit by the daylight coming through it rather than shaded: inside
    // Snell's window mostly clear, with the same ripples as the surface seen from above; outside it a
    // mirror of the water (see undersideGlsl). (Lit materials only for the sky's uniforms, used from
    // above by the mirror mesh below: their colour is not shaded.)
    this.material = new THREE.MeshLambertMaterial({
      color: UNDERSIDE_COLOR, transparent: true, depthWrite: false, side: THREE.BackSide,
    })
    this.rippleOffsets = noiseOffsets(new THREE.Vector3(), SEA_SURFACE_FREQUENCIES)
    this.opaque = { value: 0 } // 1 while the camera is above the sea (see update)
    this.material.onBeforeCompile = (shader) => this.patchShader(shader, false)
    this.material.customProgramCacheKey = () => 'seaUnderside'
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.name = 'oceanSurface'
    this.mesh.frustumCulled = false // rebuilt around the camera every frame
    this.mesh.renderOrder = 2       // after the tube and other translucent parts it covers
    this.mesh.visible = false
    parent.add(this.mesh)

    // Outside Snell's window the underside is opaque, and this copy of the disc draws that part of it in
    // the opaque pass, writing depth, so that it hides what is above the surface there even if that is
    // drawn after the translucent disc (e.g. the tube, or lines drawn late). The translucent disc draws
    // over it in the same colour. From above the sea it is the whole disc, as an opaque backstop (see
    // update). (Two meshes rather than one material switched between opaque and translucent, which
    // three.js compiles as two programs: a stall when the camera first crosses the surface.)
    this.mirrorMaterial = new THREE.MeshLambertMaterial({ color: UNDERSIDE_COLOR, side: THREE.BackSide })
    this.mirrorMaterial.onBeforeCompile = (shader) => this.patchShader(shader, true)
    this.mirrorMaterial.customProgramCacheKey = () => 'seaUndersideMirror'
    this.mirror = new THREE.Mesh(geometry, this.mirrorMaterial)
    this.mirror.name = 'oceanSurfaceMirror'
    this.mirror.frustumCulled = false
    this.mirror.visible = false
    parent.add(this.mirror)

    this.fog = new THREE.FogExp2(SHALLOW_WATER_COLOR.clone(), 0)
  }

  // The underside's shader (a MeshLambertMaterial's, patched). mirror: only the opaque part outside
  // Snell's window, for the mirror mesh.
  patchShader(shader, mirror) {
    shader.uniforms.seaRippleOffset = { value: this.rippleOffsets }
    shader.uniforms.seaUndersideOpaque = this.opaque
    shader.uniforms.seaSlopeVariance = seaWaveUniforms.seaSlopeVariance
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vSeaLocal;
varying vec3 vSeaView;
varying vec3 vSeaNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vSeaLocal = transformed;
vSeaView = -mvPosition.xyz;
vSeaNormal = normalize(normalMatrix * normal);`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float seaUndersideOpaque;
varying vec3 vSeaLocal;
varying vec3 vSeaView;
varying vec3 vSeaNormal;
${fbmGlsl('seaRipple', SEA_SURFACE_FREQUENCIES)}
${seaSurfaceLookGlsl(UNDERSIDE_OPACITY)}
${undersideGlsl}`)
      .replace('#include <alphatest_fragment>', `if (seaUndersideOpaque > 0.5) {
  diffuseColor = vec4(${UNDERSIDE_FROM_ABOVE.map(c => c.toFixed(3)).join(', ')}, 1.0);
}
else {
  float ripple = seaRippleFbm(vSeaLocal, length(vSeaView));
  float facing = abs(dot(normalize(vSeaNormal), normalize(vSeaView)));
  float shine;
  vec4 shaded = seaSurfaceShade(diffuseColor.rgb, ripple, facing, shine);
  // The water's own colour, mirrored outside Snell's window (the fog colour is in the output colour
  // space, as it is blended in after the conversion to it).
#ifdef USE_FOG
  vec3 water = sRGBTransferEOTF(vec4(fogColor, 1.0)).rgb;
#else
  vec3 water = diffuseColor.rgb * 0.3;
#endif
  diffuseColor = seaUndersideLook(shaded, water, facing, ripple);
${mirror ? `  if (diffuseColor.a < ${MIRROR_OPACITY.toFixed(3)}) discard;
  diffuseColor.a = 1.0;` : ''}
}
#include <alphatest_fragment>`)
      .replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>
${seaSkyReflectionGlsl}`)
      // Unlit. From above, the backstop shows what the surface there would: deep water reflecting the
      // sky, as the sea surface does (seaWaves.js), most of all near the horizon.
      .replace('#include <opaque_fragment>', `outgoingLight = diffuseColor.rgb;
if (seaUndersideOpaque > 0.5) {
  vec3 view = normalize(vSeaView);
  vec3 up = normalize(vSeaNormal);
  outgoingLight = mix(outgoingLight, seaSkyReflection(reflect(-view, up), sqrt(seaSlopeVariance)), seaReflectance(abs(dot(up, view))));
}
#include <opaque_fragment>`)
  }

  setEnabled(enabled) {
    this.enabled = enabled
    if (!enabled) {
      this.setCameraInWater(false)
      this.mesh.visible = false
      this.mirror.visible = false
      SeaDarkening.update(false)
      if (this.scene.fog === this.fog) this.scene.fog = null
    }
  }

  // camera: the rendering camera. tubeNear(localPoint, maxDistance): the evacuated tube near a point (in
  // the parent's coordinates), { point, tangent, radius } (see LaunchSystem.tubeNear), or null.
  update(camera, tubeNear = () => null) {
    if (!this.enabled) return
    this.parent.updateWorldMatrix(true, false)
    camera.getWorldPosition(_camera)
    this.parent.worldToLocal(_camera)

    const geo = ecefToGeodetic(_camera.x, _camera.y, _camera.z, this.ellipsoid)
    const seaFloor = (geo.alt < 0) ? this.sampleTerrainHeight(geo.lat, geo.lon)?.heightMeters ?? -Infinity : -Infinity
    this.cameraUnderSurface = geo.alt < 0 && geo.alt > seaFloor
    // (Beyond twice the visibility the tube makes no difference: the water has hidden it.)
    const tube = this.cameraUnderSurface ? tubeNear(_camera, 2 * this.visibility) : null
    WaterFog.update(tube, _camera, this.parent.getWorldQuaternion(_quaternion))
    const dry = tube && _dir.subVectors(_camera, tube.point).projectOnPlane(tube.tangent).length() < tube.radius
    this.setCameraInWater(this.cameraUnderSurface && !dry, -geo.alt)
    // From above the sea, things under it fade into the water by their optical path through it.
    const above = !this.cameraUnderSurface
    SeaDarkening.update(above, _camera, this.ellipsoid, this.parent.getWorldQuaternion(_quaternion))

    // The disc is the sea's underside: seen from under the surface, rippled and translucent within
    // Snell's window (the translucent mesh, drawn after the translucent things it covers) and a mirror of
    // the water outside it (the mirror mesh, opaque); from above, an opaque backstop (the mirror mesh
    // alone) for rays that dip under the surface and would come back out of it beyond the horizon (the
    // Earth curves away), so the sky never shows through the sea. Being opaque and drawn in the opaque
    // pass, it is in place before anything translucent in front of it (e.g. the cable lines) is blended
    // over it; otherwise they would blend with the sky behind it and glow against the dark water.
    this.mesh.visible = !above
    this.mirror.visible = true
    this.opaque.value = above ? 1 : 0
    // The disc is built for the camera's height above the sea in steps of 1/16 octave, and for its position
    // on a grid with cells 1% of that (the innermost ring is 5% of it), so it is rebuilt only when the camera
    // has moved by about that much, and is a function of where the camera is, not of where it was when last
    // built: every render of a frame draws the same disc.
    const level = Math.round(16 * Math.log2(Math.max(1, Math.abs(geo.alt))))
    const height = Math.pow(2, level / 16)
    const cell = Math.max(0.05, 0.01 * height)
    _snapped.set(Math.round(_camera.x / cell) * cell, Math.round(_camera.y / cell) * cell, Math.round(_camera.z / cell) * cell)
    if (!this._builtAt || this._builtAbove !== above || this._builtVisibility !== this.visibility || this._builtLevel !== level || !this._builtAt.equals(_snapped)) {
      this.buildSurface(height, above, _snapped)
      ;(this._builtAt ??= new THREE.Vector3()).copy(_snapped)
      this._builtAbove = above
      this._builtVisibility = this.visibility
      this._builtLevel = level
    }
  }

  setCameraInWater(inWater, depth = 0) {
    this.cameraInWater = inWater
    if (!inWater && depth <= 0) this.cameraUnderSurface = false
    this.cameraDepth = depth
    // The water colour darkens with depth (also used as the background under the surface).
    const darkening = SURFACE_DARKENING + (MAX_DARKENING - SURFACE_DARKENING) * (1 - Math.exp(-Math.max(0, depth) / DARKENING_DEPTH))
    this.fog.color.copy(SHALLOW_WATER_COLOR).lerp(DEEP_WATER_COLOR, darkening)
    // The fog stays on the scene while the sea is shown (so materials keep the fog code, which also
    // carries the from-above darkening: see seaDarkening.js); it only fades things under the surface,
    // by their path through water (inside the tube, only what is seen through its walls: waterFog.js).
    // FogExp2 reaches ~95% at sqrt(3) / density.
    this.fog.density = this.cameraUnderSurface ? Math.sqrt(3) / Math.max(1, this.visibility) : 0
    if (this.enabled) this.scene.fog = this.fog
  }

  // Rebuilds the surface disc around the point below the camera (heightAboveSea: |camera altitude|).
  // From above it reaches past twice the horizon distance: a ray that skims under the surface comes
  // back out of it about as far beyond the horizon as it went in before it. From below it reaches as
  // far as the water lets anything be seen, so that nothing above the surface shows past its edge.
  // centre: the point (parent coordinates) the disc is built under (the camera, or near it).
  buildSurface(heightAboveSea, above = false, centre = _camera) {
    const horizon = this.horizonDistance(heightAboveSea)
    const reach = above ? horizon * 2.2 + 1000 : Math.max(horizon * 1.05 + 1000, 2 * this.visibility)
    this.fillDisc(this.mesh, heightAboveSea, Math.max(3000, reach), 0, centre)
    this.mirror.position.copy(this.mesh.position)
    noiseOffsets(this.mesh.position, SEA_SURFACE_FREQUENCIES, this.rippleOffsets) // ripples stay put as the disc moves
  }

  meanRadius() {
    const a = this.ellipsoid.a
    return (2 * a + (this.ellipsoid.b ?? a * (1 - (this.ellipsoid.f || 0)))) / 3
  }

  horizonDistance(heightAboveSea) {
    return Math.sqrt(heightAboveSea * (2 * this.meanRadius() + heightAboveSea))
  }

  // Fills a disc mesh: rings around the point below the camera, `depth` metres below sea level, out to
  // maxDistance (never more than a quarter of the way round), in float64 relative to its centre.
  fillDisc(mesh, heightAboveSea, maxDistance, depth, centre = _camera) {
    const a = this.ellipsoid.a
    const b = this.ellipsoid.b ?? a * (1 - (this.ellipsoid.f || 0))
    const meanRadius = this.meanRadius()
    maxDistance = Math.min(meanRadius * Math.PI / 2, maxDistance)
    const firstRing = Math.max(0.5, heightAboveSea * 0.05)
    const growth = Math.pow(maxDistance / firstRing, 1 / (RINGS - 1))

    const surfacePoint = (direction, target) => {
      const t = 1 / Math.sqrt((direction.x ** 2 + direction.z ** 2) / (a * a) + (direction.y ** 2) / (b * b))
      return target.copy(direction).multiplyScalar(t - depth)
    }
    _up.copy(centre).normalize()
    surfacePoint(_up, _origin)
    // Any tangent basis will do (the disc is symmetric); avoid the pole's degenerate cross product.
    _east.set(0, 1, 0).cross(_up)
    if (_east.lengthSq() < 1e-12) _east.set(1, 0, 0)
    _east.normalize()
    _north.crossVectors(_up, _east)

    const positions = mesh.geometry.attributes.position.array
    const normals = mesh.geometry.attributes.normal.array
    let k = 0
    for (let i = 0; i <= RINGS; i++) {
      const angle = (i === 0) ? 0 : firstRing * growth ** (i - 1) / meanRadius
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      for (let j = 0; j <= SECTORS; j++) {
        const azimuth = 2 * Math.PI * j / SECTORS
        _dir.copy(_up).multiplyScalar(cosA)
          .addScaledVector(_east, sinA * Math.cos(azimuth))
          .addScaledVector(_north, sinA * Math.sin(azimuth))
        surfacePoint(_dir, _point)
        // Subtract in float64 before storing as float32.
        positions[k] = _point.x - _origin.x
        positions[k + 1] = _point.y - _origin.y
        positions[k + 2] = _point.z - _origin.z
        // Ellipsoid normal
        _dir.set(_point.x / (a * a), _point.y / (b * b), _point.z / (a * a)).normalize()
        normals[k] = _dir.x; normals[k + 1] = _dir.y; normals[k + 2] = _dir.z
        k += 3
      }
    }
    mesh.position.copy(_origin)
    mesh.geometry.attributes.position.needsUpdate = true
    mesh.geometry.attributes.normal.needsUpdate = true
  }

  dispose() {
    this.setEnabled(false)
    this.mesh.parent?.remove(this.mesh)
    this.mirror.parent?.remove(this.mirror)
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.mirrorMaterial.dispose()
  }
}

// A disc of RINGS x SECTORS quads around its centre (positions filled in by Ocean.fillDisc).
function discGeometry() {
  const vertexCount = (RINGS + 1) * (SECTORS + 1)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage))
  const index = []
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      const a = i * (SECTORS + 1) + j, b = a + SECTORS + 1
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  geometry.setIndex(index)
  return geometry
}
