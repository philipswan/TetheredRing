import * as THREE from 'three'
import { stars } from './stars.js'

const MOON_ORBIT_DISTANCE = 384467000 // m
const SUN_DISTANCE = 5e10 // m (inside the sky camera's far plane; only the direction matters)
const SUN_ANGULAR_RADIUS = 0.2665 * Math.PI / 180
const SUN_SPRITE_SCALE = 12 // the sprite is this many disc radii across: the rest is glow
const _sunDir = new THREE.Vector3()
const _target = new THREE.Vector3()
const _up = new THREE.Vector3()
const _pole = new THREE.Vector3()

// A white disc of 1/SUN_SPRITE_SCALE of the texture's width, with a soft glow around it.
function sunTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  const r = size / 2
  const disc = r / (SUN_SPRITE_SCALE / 2)
  const gradient = g.createRadialGradient(r, r, 0, r, r, r)
  gradient.addColorStop(0, 'rgba(255,255,250,1)')
  gradient.addColorStop(disc / r * 0.9, 'rgba(255,255,245,1)')
  gradient.addColorStop(disc / r * 1.1, 'rgba(255,240,200,0.45)')
  gradient.addColorStop(0.45, 'rgba(255,220,170,0.08)')
  gradient.addColorStop(1, 'rgba(255,210,160,0)')
  g.fillStyle = gradient
  g.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Renders far-away things (stars and the companion body: the Moon, or Earth when the simulation is
// on the Moon) in a separate pass with its own camera, before the main scene.
//
// The main camera's far plane is fitted to the planet and ring so depth precision stays usable;
// anything beyond it (stars at 256 planet radii, the Moon at 384,000 km) used to be clipped. The sky
// camera copies the main camera's orientation and position but has a far plane large enough for
// the solar neighbourhood.
const _spin = new THREE.Quaternion()
const _axisY = new THREE.Vector3(0, 1, 0)

export class SkyPass {
  constructor(dParamWithUnits, planetSpec, { isLunarSimulation, earthRadius }) {
    this.scene = new THREE.Scene()
    this.scene.name = 'skyScene'
    this.camera = new THREE.PerspectiveCamera(45, 1, 1e4, 1e12)
    this.camera.name = 'skyCamera'

    // Mirrors planetCoordSys so sky objects keep their planet-relative placement.
    this.planetFrame = new THREE.Group()
    this.planetFrame.name = 'skyPlanetFrame'
    this.planetFrame.matrixAutoUpdate = false
    this.scene.add(this.planetFrame)

    this.stars = new stars(dParamWithUnits, planetSpec)
    this.scene.add(this.stars)

    const companionRadius = isLunarSimulation ? earthRadius : 1737400
    const texture = new THREE.TextureLoader().load(isLunarSimulation ? './textures/earth_clouds_2048.jpg' : './textures/moon.jpg')
    texture.colorSpace = THREE.SRGBColorSpace
    this.companionBody = new THREE.Mesh(
      new THREE.SphereGeometry(companionRadius, 64, 32),
      new THREE.MeshLambertMaterial({ map: texture }),
    )
    this.companionBody.name = isLunarSimulation ? 'earth' : 'moon'
    this.companionBody.position.set(MOON_ORBIT_DISTANCE, 0, 0)
    this.companionBody.visible = dParamWithUnits.showMoon.value
    this.planetFrame.add(this.companionBody)

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1)
    this.scene.add(this.sunLight)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.15))

    // The sun: a disc (its real 0.53 degree size) with a glow, far beyond the Moon so the Moon (and
    // the planet, drawn later) can pass in front of it. Seen through the air, the atmosphere draws it
    // instead (see atmosphere.frag.glsl), since the sky is drawn over this pass.
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }))
    this.sun.name = 'sun'
    this.sun.scale.setScalar(2 * SUN_DISTANCE * Math.tan(SUN_ANGULAR_RADIUS) * SUN_SPRITE_SCALE)
    this.scene.add(this.sun)
  }

  // Places the companion body along a direction from the planet centre (planet frame).
  setCompanionBodyDirection(direction, distance = MOON_ORBIT_DISTANCE) {
    this.companionBody.position.copy(direction).normalize().multiplyScalar(distance)
  }

  // The stars are fixed in space: the planet turns under them once a sidereal day (a little faster than
  // the sun's day, so over the year the sun moves once round them). `days` is the day of the year
  // (from 1) plus the fraction of the day (UTC). The star field is random, so where the angle starts
  // does not matter, only that it turns at the sidereal rate about the planet's axis.
  setSiderealTime(days) {
    this.siderealAngle = 2 * Math.PI * 1.0027379093508 * (days - 1)
  }

  update(mainCamera, planetCoordSys, sunLight, dParamWithUnits, planetSpec) {
    mainCamera.updateMatrixWorld()
    mainCamera.matrixWorld.decompose(this.camera.position, this.camera.quaternion, this.camera.scale)
    this.camera.fov = mainCamera.fov
    this.camera.aspect = mainCamera.aspect
    this.camera.zoom = mainCamera.zoom
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    planetCoordSys.updateMatrixWorld()
    this.planetFrame.matrix.copy(planetCoordSys.matrixWorld)
    this.planetFrame.matrixWorldNeedsUpdate = true
    // (Turning about the planet's axis, its local y, against the planet's rotation.)
    planetCoordSys.getWorldQuaternion(this.stars.quaternion)
    this.stars.quaternion.multiply(_spin.setFromAxisAngle(_axisY, -(this.siderealAngle ?? 0)))
    this.sunLight.position.copy(sunLight.getWorldPosition(new THREE.Vector3()))
    _sunDir.copy(this.sunLight.position).sub(sunLight.target.getWorldPosition(_target)).normalize()
    this.sun.position.copy(this.camera.position).addScaledVector(_sunDir, SUN_DISTANCE)
    // The camera's height (above the ellipsoid, along the geocentric direction: close enough) and
    // the sun's elevation there, for the stars.
    _up.copy(this.camera.position).sub(_target.setFromMatrixPosition(planetCoordSys.matrixWorld))
    const r = _up.length()
    _up.divideScalar(r)
    const { a, b = a * (1 - (planetSpec.ellipsoid.f || 0)) } = planetSpec.ellipsoid
    const sinLat = _up.dot(_pole.setFromMatrixColumn(planetCoordSys.matrixWorld, 1).normalize())
    const altitude = r - a * b / Math.hypot(b * Math.sqrt(1 - sinLat * sinLat), a * sinLat)
    this.stars.animate(dParamWithUnits, _up, altitude, _sunDir)
  }

  render(renderer) {
    renderer.render(this.scene, this.camera)
  }
}
