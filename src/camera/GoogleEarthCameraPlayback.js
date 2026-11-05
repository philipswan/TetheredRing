import * as THREE from 'three'
import { backgroundScene } from '../scene/backgroundScene.js'

// Plays back a camera path exported from Google Earth Studio, so the simulation can be rendered
// with exactly the same camera as a Google Earth video and composited over it. The export is
// expected at googleEarthImages/<project>/<project>.json, with optional background frames at
// googleEarthImages/<project>/footage/<project>_NNN.jpeg (the folder is not part of the repo).
//
// In "helper" mode (jsonFileCameraControlHelper) the path drives a visible camera helper instead
// of the real camera, to check alignment.
export class GoogleEarthCameraPlayback {
  constructor({ project = 'OrbitMaunaKea', camera, renderer, planetCoordSys, store, getPlanetObjects, resize }) {
    this.project = project
    this.camera = camera
    this.renderer = renderer
    this.resize = resize ?? ((width, height) => {
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    })
    this.store = store
    this.getPlanetObjects = getPlanetObjects
    this.data = null
    this.active = false
    this.startTime = 0
    this.background = null
    this.backgroundFrames = []
    this.saved = null

    this.helperCamera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 1e8)
    this.helperCamera.name = 'googleEarthHelperCamera'
    planetCoordSys.add(this.helperCamera)
    this.helper = new THREE.CameraHelper(this.helperCamera)
    this.helper.name = 'googleEarthHelperCameraHelper'
    this.helper.visible = false
    planetCoordSys.add(this.helper)
  }

  get helperMode() { return this.store.derived.jsonFileCameraControlHelper.value }

  async load() {
    const url = `./googleEarthImages/${this.project}/${this.project}.json`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`)
    this.data = await response.json()
    const maxFrames = this.store.derived.maxBackgroundVideoFrames.value
    if (this.store.derived.controlCameraFromJsonDuringCapture.value) {
      const loader = new THREE.TextureLoader()
      this.backgroundFrames = []
      for (let i = 0; i < Math.min(maxFrames, this.data.numFrames); i++) {
        const name = `./googleEarthImages/${this.project}/footage/${this.project}_${String(i).padStart(3, '0')}.jpeg`
        this.backgroundFrames.push(await loader.loadAsync(name))
      }
    }
  }

  async toggle(simTime) {
    if (this.active) {
      this.stop()
      return
    }
    if (!this.data) await this.load()
    this.start(simTime)
  }

  start(simTime) {
    this.active = true
    this.startTime = simTime
    if (this.helperMode) return
    const size = this.renderer.getSize(new THREE.Vector2())
    this.saved = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      clearAlpha: this.renderer.getClearAlpha(),
      width: size.x,
      height: size.y,
    }
    const first = this.backgroundFrames[0]
    const width = first ? first.source.data.naturalWidth : this.data.width
    const height = first ? first.source.data.naturalHeight : this.data.height
    this.renderer.setClearAlpha(0)
    this.resize(width, height)
    this.background = new backgroundScene(width, height, first ?? null)
    if (this.background.scene) this.background.hidePlanet(this.getPlanetObjects())
  }

  stop() {
    this.active = false
    this.helper.visible = false
    if (!this.saved) return
    this.camera.position.copy(this.saved.position)
    this.camera.quaternion.copy(this.saved.quaternion)
    this.camera.fov = this.saved.fov
    this.camera.aspect = this.saved.width / this.saved.height
    this.camera.updateProjectionMatrix()
    this.renderer.setClearAlpha(this.saved.clearAlpha)
    this.resize(this.saved.width, this.saved.height)
    if (this.background) {
      if (this.background.preserveVisibility.length > 0) this.background.restorePlanet(this.getPlanetObjects())
      this.background.remove()
      this.background = null
    }
    this.saved = null
  }

  // Applies the camera pose for the current time. Returns true while playback drives the camera.
  update(simTime) {
    if (!this.active) return false
    const data = this.data
    const t = simTime - this.startTime
    const frame = Math.min(Math.floor(t * data.frameRate), data.numFrames - 1)
    const pose = data.cameraFrames[frame]
    const deg = Math.PI / 180
    // Google Earth Studio uses X/Y/Z = ECEF Y/Z/X relative to this scene's axes.
    const position = new THREE.Vector3(pose.position.y, pose.position.z, pose.position.x)
    const rotation = new THREE.Vector3(pose.rotation.y * deg, pose.rotation.z * deg, pose.rotation.x * deg)
    const target = this.helperMode ? this.helperCamera : this.camera
    target.position.copy(position)
    target.rotation.order = 'ZXY'
    target.rotation.setFromVector3(rotation)
    target.rotateX(Math.PI / 2)
    target.rotateZ(Math.PI / 2)
    target.fov = pose.fovVertical
    target.updateProjectionMatrix()
    if (this.helperMode) {
      this.helper.visible = true
      this.helper.update()
    }
    else if (this.background?.sprite && this.backgroundFrames[frame]) {
      this.background.sprite.material.map = this.backgroundFrames[frame]
    }
    if (t * data.frameRate > data.numFrames) this.stop()
    return !this.helperMode
  }

  render(renderer) {
    if (this.background?.scene) {
      renderer.render(this.background.scene, this.background.camera)
      renderer.clearDepth()
    }
  }
}
