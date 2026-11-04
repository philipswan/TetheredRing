import * as THREE from 'three'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import * as tram from '../utils/tram.js'
import { subsolarPoint, advanceDate, defaultDaytime } from '../physics/solar.js'
import { SimClock } from '../core/SimClock.js'
import { ParameterStore } from '../params/ParameterStore.js'
import { createParameterDefinitions } from '../params/parameterDefinitions.js'
import { applyPreset, DEFAULT_PRESET_ID, findPreset, PRESETS } from '../presets/presets.js'
import { ParameterGui } from '../ui/ParameterGui.js'
import { createRenderer } from '../scene/createRenderer.js'
import { Lighting } from '../scene/lighting.js'
import { SkyPass } from '../scene/SkyPass.js'
import { Overlays } from '../scene/Overlays.js'
import { backgroundScene } from '../scene/backgroundScene.js'
import { PixelLOD } from '../scene/PixelLOD.js'
import { SubPixelFade } from '../scene/SubPixelFade.js'
import { Ocean } from '../planet/Ocean.js'
import { MooringCables } from '../launcher/MooringCables.js'
import { StructureLines } from '../scene/structureLines.js'
import { Highlights } from '../scene/Highlights.js'
import { InstancedProxyPool } from '../scene/InstancedProxyPool.js'
import { GraphicsQuality, QUALITY_PRESETS } from './GraphicsQuality.js'
import { Planet, defaultPlanetAssets } from '../planet/Planet.js'
import { Sailboats } from '../scene/Sailboats.js'
import { Clouds, SHELL_TOP } from '../planet/clouds/Clouds.js'
import { ViewStatus, applyViewState } from '../ui/ViewStatus.js'
import { setWeatherDate, windAt } from '../scene/seaPlacement.js'
import { ContainerShips } from '../scene/ContainerShips.js'
import { OceanTerminal } from '../launcher/OceanTerminal.js'

// The Earth's global tile sets the A/B control switches between (folders under assets/; see docs/ASSETS.md).
const EARTH_TILE_SETS = { 'Blue Marble, GMTED/GEBCO (earth_hires)': 'earth_hires', 'Original (earth)': 'earth' }
import { AerialPerspective } from '../planet/aerialPerspective.js'
import { RingAssembly } from './RingAssembly.js'
import { transitSystem } from '../transit/transitsystems.js'
import * as Launcher from '../launcher/launcher.js'
import { analyzeLauncherTerrainDisplacement } from '../launcher/launcherTerrainAnalysis.js'
import { CameraController } from '../camera/CameraController.js'
import { GoogleEarthCameraPlayback } from '../camera/GoogleEarthCameraPlayback.js'
import { trackPointLogger } from '../camera/trackPointLogger.js'
import { installKeyboardShortcuts, keyboardHelpText } from '../input/KeyboardShortcuts.js'
import { setupVRControllers } from '../input/vrControllers.js'
import { LaunchTrialSweep } from './LaunchTrialSweep.js'
import { ILLUSTRATION_SETTINGS } from './illustrationSettings.js'
import { downloadText, specsCsv } from './exports.js'
import * as kmlutils from '../export/kmlutils.js'
import { ShotController } from '../shots/ShotController.js'
import { ShotSidebar } from '../ui/ShotSidebar.js'
import cameraPresets from '../data/cameraPresets.json' with { type: 'json' }
import { placeAtHeightInRingPlane } from '../ring/ringGeometry.js'
import { standInScene, warmPrograms } from '../scene/precompile.js'
import mountainList from '../data/mountainList.json' with { type: 'json' }
import googleEarthProjectFile from '../data/googleEarthStudioSampleProjectFile.json' with { type: 'json' }

const LOGO_DURATION = 20 // s of simulated time before the logo hides and preset start actions run
const RING_RAISE_RATE = 0.25 // fraction of full raise per second (R/L keys)
const TUBE_DEPLOY_RATE = 0.0025 // fraction per second
const PRECOMPILE_INTERVAL = 120 // frames between background compiles of new shader programs (precompileShaders)

// The application: builds the scene from the selected preset, owns the per-frame update, and
// exposes the actions used by the GUI and keyboard shortcuts.
//
// Frame structure (see frame()):
//   shots.tick() (the shot playhead moves the clock) -> step(dt): advance animations at clock.time -> render()
// Recording and shot playback drive step()/render() themselves with a fixed time step.
const _sunDirection = new THREE.Vector3()
const _seaCamera = new THREE.Vector3()
const _seaWind = new THREE.Vector3()
const _sunPlanet = new THREE.Vector3()
const _sunWorld = new THREE.Vector3()
const _sunTarget = new THREE.Vector3()

export class App {
  constructor(container, { presetId, enableVR = false, quality, antialias = true, view = null } = {}) {
    this.initialView = view
    this.container = container
    this.enableVR = enableVR
    this.antialias = antialias
    this.presetId = findPreset(presetId) ? presetId : DEFAULT_PRESET_ID
    this.clock = new SimClock()
    this.specs = {}
    this.mouse = new THREE.Vector2(0, 0)
    this.raycaster = new THREE.Raycaster()
    this.ringRaise = 0 // -1 lowering, 0 idle, +1 raising (or moving the ring / deploying the tube)
    this.tubeDeploymentAlpha = 1
    this.illustrationIndex = 0
    this.mountainIndex = 0
    this.logoTimerDone = false
    this.trackPointLogger = null
    this.quality = new GraphicsQuality(this, quality)
  }

  // ------------------------------------------------------------------------------------------
  // Construction
  // ------------------------------------------------------------------------------------------

  async init() {
    this.buildParameters()
    this.buildRenderer()
    this.buildScene()
    this.buildPlanet()
    this.buildRing()
    this.buildTransit()
    this.buildLauncher()
    this.buildCamera()
    await this.loadBackgroundImage()
    this.buildGui()
    this.shots = new ShotController(this)
    this.sidebar = new ShotSidebar(this)
    this.installInput()
    this.quality.apply()
    window.addEventListener('resize', () => this.onResize())
    this.viewStatus = new ViewStatus(this, this.presetParameters)
    this.viewStatus.setVisible(this.d.showViewStatus.value)
    if (this.initialView) applyViewState(this, this.initialView)
    await this.shots.resumePendingShot()
    return this
  }

  buildParameters() {
    this.nonGUIParams = {}
    this.store = new ParameterStore(createParameterDefinitions())
    this.preset = applyPreset(this.presetId, this.store.definitions, this.nonGUIParams)
    this.store.derive()
    // The parameters as the preset left them, for the view status's list of changes (src/ui/ViewStatus.js).
    this.presetParameters = this.store.snapshot()
    this.planetSpec = tram.getPlanetSpec(this.store.get('planetName'))
    this.planetRadius = tram.radiusAtLatitude(0, this.planetSpec.ellipsoid)
    this.isLunarSimulation = this.store.get('planetName') === 'Moon'
    this.enableLaunchSystem = this.nonGUIParams.enableLaunchSystem ?? true
  }

  get d() { return this.store.derived }

  buildRenderer() {
    const canvas = this.container.querySelector('canvas')
    this.renderer = createRenderer(canvas, { alpha: this.d.enableBackgroundAlpha.value, enableVR: this.enableVR, antialias: this.antialias })
    this.renderer.setClearColor(0x000000, this.d.enableBackgroundAlpha.value ? 0 : 1)
    this.nonGUIParams.renderer = this.renderer
    this.nonGUIParams.maxTextureAnisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.nonGUIParams.maxTextureSize = this.renderer.capabilities.maxTextureSize
    this.quality.watchContextLoss(canvas)
  }

  buildScene() {
    const n = this.nonGUIParams
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.scene = new THREE.Scene()
    this.scene.name = 'scene'

    // Everything planet-fixed hangs off planetCoordSys (identity transform except in VR).
    this.planetCoordSys = new THREE.Group()
    this.planetCoordSys.name = 'planetCoordSys'
    this.scene.add(this.planetCoordSys)

    // The camera group carries things that stay with the viewer (VR controllers).
    this.camera3d = new THREE.PerspectiveCamera(this.d.cameraFieldOfView.value, width / height, 0.1, 10 * this.planetRadius)
    this.camera3d.name = 'camera'
    this.cameraGroup = new THREE.Group()
    this.cameraGroup.name = 'cameraGroup'
    this.cameraGroup.add(this.camera3d)
    this.scene.add(this.cameraGroup)
    if (this.enableVR) {
      this.cameraGroup.position.z = -1.005 * this.planetRadius
      this.cameraGroup.rotation.set(0, -Math.PI / 2, Math.PI / 2)
      this.cameraGroup.rotateY(Math.PI)
      this.planetCoordSys.rotation.set(Math.PI * -4 / 16, Math.PI * -5.253 / 16, 0)
    }

    this.lighting = new Lighting(this.scene, this.planetCoordSys, n, this.planetRadius, this.renderer)
    this.sky = new SkyPass(this.d, this.planetSpec, { isLunarSimulation: this.isLunarSimulation, earthRadius: 6378137 })
    this.overlays = new Overlays(width, height)
    if (this.d.showLogo.value) this.overlays.loadLogo('./textures/TransparentLogo.png')
    this.overlays.setLogoVisible(this.d.showLogo.value)
    this.overlays.setChartVisible(this.d.showXYChart.value)
    this.overlays.redrawChartFrame()
    this.highlights = new Highlights()
    this.highlights.configure(this.d)

    this.setImageryAttribution()
    for (const marker of n.debugGeodeticMarkers ?? []) {
      const ecef = tram.geodeticToECEF(marker.lat, marker.lon, marker.altitude || 0, this.planetSpec.ellipsoid)
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(marker.radius || 100000, 16, 12), new THREE.MeshBasicMaterial({ color: marker.color ?? 0xff00ff }))
      mesh.name = marker.name || 'debugGeodeticMarker'
      mesh.position.set(ecef.x, ecef.y, ecef.z)
      this.planetCoordSys.add(mesh)
    }
  }

  // Shows the imagery credits: the planet's (`planetCredits`, as its tile sets load) and any the preset
  // gives (nonGUIParams.imageryAttribution, e.g. for a background image).
  setImageryAttribution(planetCredits) {
    this._planetCredits = planetCredits ?? this._planetCredits ?? ''
    const text = [this.nonGUIParams.imageryAttribution, this._planetCredits].filter(Boolean).join('; ')
    if (!this._attribution && text) {
      this._attribution = document.createElement('div')
      this._attribution.className = 'imagery-attribution'
      document.body.appendChild(this._attribution)
    }
    if (this._attribution) {
      this._attribution.textContent = text
      this._attribution.hidden = !text
    }
  }

  buildPlanet() {
    const n = this.nonGUIParams
    const d = this.d
    const assets = n.planet2Assets ?? defaultPlanetAssets(this.planetSpec)
    this.planet = new Planet(this.planetSpec, {
      renderer: this.renderer,
      assets,
      doubleSided: d.earthTextureDoubleSided.value,
      opacity: d.earthTextureOpacity.value,
      showAtmosphere: d.showEarthsAtmosphere.value,
      displacementScaleMultiplier: (n.planet2DisplacementScaleMultiplier ?? 1) * d.terrainExaggeration.value,
      tileSegments: n.tileSegments,
      maxConcurrentTileLoads: n.maxConcurrentTileLoads,
      maxCachedTiles: n.maxCachedTiles,
      maxTileGpuBytes: n.maxTileGpuBytes,
      tileSseThreshold: n.tileSseThreshold,
      maxAvailableTileLod: n.maxAvailableTileLod,
      requireKtx2: n.planet2RequireKtx2,
      receiveSurfaceShadows: n.enableSurfaceShadows,
      textureAnisotropy: n.planet2TextureAnisotropy,
      locationInterests: n.locationInterests,
      surfaceDetail: n.planet2SurfaceDetail,
      surfaceColor: n.planet2SurfaceColor,
      fastCameraSpeed: n.planet2FastCameraSpeed,
      maxLodWhileFast: n.planet2MaxLodWhileFast,
      debugMode: n.planet2DebugMode,
      // Credits for the planet imagery on screen.
      onAttribution: (text) => this.setImageryAttribution(text),
    })
    this.planetCoordSys.add(this.planet.surface, this.planet.atmosphere)
    // Tethers and cables are hazed by the planet's air, and glow (see src/scene/structureLines.js).
    StructureLines.setHaze(this.planet.atmosphereUniforms)
    StructureLines.setGlowDistance(d.structureGlowDistance.value)
    this.planet.setVisible(d.showEarthsSurface.value)
    this.planet.setSeaIceVisible(d.showSeaIce.value)
    if (this.planetSpec.name === 'Earth' && this.planetSpec.hasOcean) {
      this.clouds = new Clouds(this.planet, this.planetCoordSys)
      this.clouds.enabled = d.showClouds.value
      this.sailboats = new Sailboats(this.planet, this.planetCoordSys, this.planetSpec.ellipsoid)
      this.sailboats.setVisible(d.showSailboats.value)
      if (this.lighting.enableLocalShadows()) this.sailboats.setShadowLight(this.lighting.sunLight)
      this.containerShips = new ContainerShips(this.planet, this.planetCoordSys, this.planetSpec.ellipsoid)
      this.containerShips.setVisible(d.showContainerShips.value)
    }
    this.planet.setAtmosphereVisible(d.showEarthsAtmosphere.value)
    this.ocean = null
    if (this.planetSpec.hasOcean) {
      this.ocean = new Ocean({
        planetSpec: this.planetSpec,
        parent: this.planetCoordSys,
        scene: this.scene,
        sampleTerrainHeight: (lat, lon) => this.planet.sampleTerrainHeight(lat, lon),
      })
      this.applyOceanSettings(d)
    }
  }

  // The sea follows the planet surface's visibility (presets that hide the planet behind a background
  // image hide the sea too).
  applyOceanSettings(d) {
    if (!this.ocean) return
    const enabled = d.showOcean.value && d.showEarthsSurface.value
    this.ocean.visibility = d.underwaterVisibility.value
    this.ocean.setEnabled(enabled)
    this.updateSeaSurfaceVisibility()
  }

  // The tiles' sea surface is only needed from above it (from under the surface the Ocean draws the
  // underside instead).
  updateSeaSurfaceVisibility() {
    const visible = this.ocean.enabled && !this.ocean.cameraUnderSurface
    if (visible !== this._seaSurfaceVisible) {
      this._seaSurfaceVisible = visible
      this.planet.setWaterVisible(visible)
    }
  }

  buildRing() {
    this.ring = new RingAssembly({
      store: this.store,
      planetSpec: this.planetSpec,
      planetCoordSys: this.planetCoordSys,
      ringSpecs: this.nonGUIParams.getRingSpecs(),
      specs: this.specs,
    })
  }

  buildTransit() {
    const r = this.ring
    this.ecv = new tram.elevatorCarVariables(this.planetSpec, this.d, r.crv)
    this.transitSystem = new transitSystem(r.refCoordSys, this.d, this.specs, false, r.crv, this.ecv, this.planetRadius, r.mainRingCurve)
    // The tether roots reach the ground (terrain or sea floor) under each tether.
    r.setTerrain((lat, lon) => this.planet.sampleTerrainHeight(lat, lon))
    // Elevator cables only come down where there is land nearby (on planets with seas).
    if (this.planetSpec.hasOcean) {
      this.transitSystem.setTerrain({
        sampleHeight: (lat, lon) => this.planet.sampleTerrainHeight(lat, lon),
        planetFrame: this.planetCoordSys,
        ellipsoid: this.planetSpec.ellipsoid,
      })
    }
  }

  buildLauncher() {
    this.launchSystem = null
    this.launchTrackFrame = null
    if (!this.enableLaunchSystem) return
    const r = this.ring
    const n = this.nonGUIParams
    this.launchSystem = new Launcher.launcher(this.d, this.clock.time, this.planetCoordSys, this.planetSpec, r.refCoordSys, r.mainRingCurve, r.crv, this.overlays.xyChart, null, this.specs, false, '')
    this.launchSystem.setTerrainSampler((lat, lon) => this.planet.sampleTerrainHeight(lat, lon))
    this.launchSystem.drawLaunchTrajectoryLine(this.d, this.planetCoordSys)

    // A frame aligned with the end of the launch track, used by presets to place the camera
    // ("launchTrackCamera") and the low sun ("launchTrackLightDirection") relative to the track.
    const trackCurve = this.launchSystem.massDriver2Curve || this.launchSystem.launchRampCurve?.[0]
    if (!trackCurve) return
    const origin = this.launchSystem.feederRailEntrancePosition.clone()
    const trackEnd = trackCurve.getPointAt(1)
    const radialUp = origin.clone().normalize()
    const forward = trackEnd.clone().sub(origin)
    forward.addScaledVector(radialUp, -forward.dot(radialUp)).normalize()
    const right = forward.clone().cross(radialUp).normalize()
    const up = right.clone().cross(forward).normalize()
    this.launchTrackFrame = { origin, forward, right, up }

    if (this.isLunarSimulation) {
      // Earth framed behind the launch track for the lunar launch scene (found with the 8 key).
      this.sky.setCompanionBodyDirection(new THREE.Vector3(35889501.075995505, 1667170.5714336203, -13774821.218498856))
      this.sky.companionBody.rotation.set(0.10930226635589775, -1.1569418935892486, -1.480664557200007)
    }

    const cameraFrame = n.launchTrackCamera
    if (cameraFrame) {
      const point = (c = {}) => origin.clone().addScaledVector(forward, c.forward ?? 0).addScaledVector(right, c.right ?? 0).addScaledVector(up, c.up ?? 0)
      const direction = (c = {}) => new THREE.Vector3().addScaledVector(forward, c.forward ?? 0).addScaledVector(right, c.right ?? 0).addScaledVector(up, c.up ?? 1).normalize()
      const reference = n.initialReferencePoint === 'feederRailEntrancePosition' ? origin : new THREE.Vector3()
      n.orbitControlsTarget = point(cameraFrame.target).sub(reference)
      n.orbitControlsObjectPosition = point(cameraFrame.position).sub(reference)
      n.orbitControlsUpDirection = direction(cameraFrame.cameraUp)
      n.cameraUp = direction(cameraFrame.cameraUp)
    }
    const lightFrame = n.launchTrackLightDirection
    if (lightFrame) {
      const sunDirection = new THREE.Vector3()
        .addScaledVector(forward, lightFrame.forward ?? -1)
        .addScaledVector(right, lightFrame.right ?? 0)
        .addScaledVector(up, lightFrame.up ?? 0.22)
      this.lighting.setShadowFocus(trackEnd, sunDirection)
    }
  }

  // For presets whose camera was placed against the ring when the ring was a circle on the
  // equatorial-radius sphere: moves the camera and its target as the ring moved there (see
  // mainRingCurve), from the old ring point to the new one at the target's azimuth about the ring axis.
  lowerCameraWithRing() {
    const controls = this.camera.controls
    const parent = this.camera3d.parent ?? this.scene
    const ring = this.ring.refCoordSys
    parent.updateWorldMatrix(true, false)
    ring.updateWorldMatrix(true, false)
    const target = ring.worldToLocal(parent.localToWorld(controls.target.clone()))
    const crv = this.ring.crv
    // The old ring: a circle at the ring's height above the equatorial-radius sphere.
    const r = this.planetRadius + crv.currentMainRingAltitude
    const oldRadius = r * Math.cos(crv.currentEquivalentLatitude)
    const across = Math.hypot(target.x, target.z)
    const old = new THREE.Vector3(target.x / across * oldRadius, r * Math.sin(crv.currentEquivalentLatitude), target.z / across * oldRadius)
    const moved = placeAtHeightInRingPlane(old.clone(), crv.currentMainRingAltitude, this.ring.ringToPlanetRotation, this.planetSpec.ellipsoid, this.ring.mainRingCurve.planeOffset)
    const shift = ring.localToWorld(moved).sub(ring.localToWorld(old))
    const move = (p) => p.copy(parent.worldToLocal(parent.localToWorld(p.clone()).add(shift)))
    move(controls.target)
    move(controls.object.position)
    controls.update()
  }

  buildCamera() {
    this.camera = new CameraController({
      camera: this.camera3d,
      domElement: this.renderer.domElement,
      planetRadius: this.planetRadius,
      store: this.store,
      nonGUIParams: this.nonGUIParams,
      enableVR: this.enableVR,
      getTrackerContext: () => ({
        scene: this.scene,
        launchSystem: this.launchSystem,
        transitSystem: this.transitSystem,
        ringRefCoordSys: this.ring.refCoordSys,
      }),
    })
    this.camera.addMarkersTo(this.planetCoordSys)
    this.camera.ringAxis.set(0, 1, 0).applyQuaternion(this.ring.ringToPlanetRotation)
    const reference = this.nonGUIParams.initialReferencePoint === 'feederRailEntrancePosition' && this.launchSystem
      ? this.launchSystem.feederRailEntrancePosition
      : new THREE.Vector3()
    this.initialReferencePoint = reference.clone()
    this.camera.placeInitially(reference)
    if (this.nonGUIParams.cameraAtRingHeight) this.lowerCameraWithRing()
    this.camera.controls.autoRotate = this.d.orbitControlsAutoRotate.value
    this.resolveSunDate()

    this.googleEarth = new GoogleEarthCameraPlayback({
      camera: this.camera3d,
      renderer: this.renderer,
      planetCoordSys: this.planetCoordSys,
      store: this.store,
      getPlanetObjects: () => [this.planet.surface, this.planet.atmosphere],
      resize: (width, height) => this.setRenderSize(width, height),
    })
    this.launchTrialSweep = new LaunchTrialSweep(this)

    const tracking = String(this.nonGUIParams.initialTrackingHotkey ?? '')
    this.pendingInitialTracking = /^[0-5]$/.test(tracking) ? Number(tracking) : null
  }

  async loadBackgroundImage() {
    const n = this.nonGUIParams
    if (!n.displayBackgroundImage) return
    let texture
    try {
      texture = await new THREE.TextureLoader().loadAsync(n.backgroundImageFilename)
    }
    catch {
      console.warn(`Background image ${n.backgroundImageFilename} could not be loaded; continuing without it.`)
      return
    }
    this.backgroundImage = texture
    this.background = new backgroundScene(texture.source.data.naturalWidth, texture.source.data.naturalHeight, texture)
    if (this.background.scene) this.background.hidePlanet([this.planet.surface, this.planet.atmosphere])
  }

  buildGui() {
    this.gui = new ParameterGui(this.store, this.parameterHandlers())
    const gui = this.gui.gui

    const sceneFolder = gui.addFolder('Scene').close()
    const presetChoice = { preset: this.presetId }
    const presetOptions = Object.fromEntries(PRESETS.map(p => [p.label, p.id]))
    sceneFolder.add(presetChoice, 'preset', presetOptions).name('Preset (reloads page)').onChange((id) => this.switchPreset(id))
    const qualityChoice = { quality: this.quality.mode }
    const qualityOptions = { 'Auto (adapts resolution)': 'auto', ...Object.fromEntries(Object.entries(QUALITY_PRESETS).map(([k, v]) => [v.label, k])) }
    sceneFolder.add(qualityChoice, 'quality', qualityOptions).name('Graphics quality').onChange((mode) => this.quality.setMode(mode))
    // Temporary: compares the Earth's two global tile sets from the same view (T switches too).
    if (this.planetSpec.name === 'Earth') {
      const planet = this.planet, app = this
      const choice = { get tiles() { return planet.baseTiles }, set tiles(name) { app.setEarthTiles(name) } }
      sceneFolder.add(choice, 'tiles', EARTH_TILE_SETS).name('Earth imagery (A/B, T)').listen()
    }
    const actions = {
      downloadSpecs: () => this.downloadSpecs(),
      downloadKml: () => this.downloadKml(),
      startTrackPoints: () => this.startTrackPointLogging(),
      stopTrackPoints: () => this.stopTrackPointLogging(),
      help: () => alert(`Keyboard shortcuts\n\n${keyboardHelpText()}`),
    }
    sceneFolder.add(actions, 'downloadSpecs').name('Download specs (CSV)')
    sceneFolder.add(actions, 'downloadKml').name('Download KML')
    sceneFolder.add(actions, 'startTrackPoints').name('Start logging track points')
    sceneFolder.add(actions, 'stopTrackPoints').name('Stop logging and download')
    gui.add(actions, 'help').name('Keyboard shortcuts')

    this.specsOutput = document.createElement('div')
    this.specsOutput.className = 'gui-stats'
    this.specsOutput.innerHTML = this.ring.specsSummaryHtml()
    this.gui.folder('TextOutput').$children.appendChild(this.specsOutput)
  }

  installInput() {
    installKeyboardShortcuts(this)
    window.addEventListener('pointermove', (event) => {
      const rect = this.renderer.domElement.getBoundingClientRect()
      this.mouse.set(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height)
    })
    if (this.enableVR) {
      document.body.appendChild(VRButton.createButton(this.renderer))
      this.vr = setupVRControllers(this.renderer, this.cameraGroup)
    }
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame())
  }

  // ------------------------------------------------------------------------------------------
  // Parameter change handlers (named by `onChange` in parameterDefinitions.js)
  // ------------------------------------------------------------------------------------------

  parameterHandlers() {
    const d = () => this.d
    const visibility = (fn) => () => fn(d())
    return {
      updatedParam: () => {},
      adjustRingDesign: () => this.rebuildRing(),
      updateTransitsystem: () => this.updateTransitSystem(),
      updateLauncher: () => this.updateLauncher(),
      adjustRingLatLon: () => { this.ring.adjustLatLon(0); this.updateLauncher() },
      adjustRingLatLon2: () => this.ring.adjustLatLon(1),
      setRingLatLonWithPreset: () => this.applyRingLocationPreset(),
      updateOrbitControlsRotateSpeed: visibility((p) => {
        this.camera.controls.autoRotate = p.orbitControlsAutoRotate.value
        this.camera.controls.autoRotateSpeed = p.orbitControlsRotateSpeed.value
      }),
      forceArrowsUpdate: () => this.ring.showAllForceArrows(),
      gravityForceArrowsUpdate: () => this.ring.showAllForceArrows(),
      gyroscopicForceArrowsUpdate: () => this.ring.updateMarkers(),
      mainRingCurveObjectUpdate: () => this.ring.updateMarkers(),
      earthAxisObjectUpdate: () => this.ring.updateMarkers(),
      earthEquatorObjectUpdate: () => this.ring.updateMarkers(),
      adjustTetherOpacity: () => this.ring.setTetherUniforms(),
      adjustStructureGlow: visibility((p) => StructureLines.setGlowDistance(p.structureGlowDistance.value)),
      adjustHighlights: visibility((p) => this.highlights.configure(p)),
      updateXYChart: visibility((p) => this.overlays.setChartVisible(p.showXYChart.value)),
      updateLogoSprite: visibility((p) => this.overlays.setLogoVisible(p.showLogo.value)),
      updateCamerFieldOfView: visibility((p) => { this.camera3d.fov = p.cameraFieldOfView.value; this.camera3d.updateProjectionMatrix() }),
      resizeTrackingMarkers: () => {},
      updateTrackingMode: () => {},
      adjustStarsVisibility: () => {},
      adjustMoonsVisibility: visibility((p) => { this.sky.companionBody.visible = p.showMoon.value }),
      adjustLaunchTrajectoryOpacity: () => {},
      adjustEarthTextureSidedness: visibility((p) => this.planet.setDoubleSided(p.earthTextureDoubleSided.value)),
      adjustEarthTextureOpacity: visibility((p) => this.planet.setOpacity(p.earthTextureOpacity.value)),
      adjustEarthSurfaceVisibility: visibility((p) => { this.planet.setVisible(p.showEarthsSurface.value); this.applyOceanSettings(p) }),
      adjustOcean: visibility((p) => this.applyOceanSettings(p)),
      adjustSeaIce: visibility((p) => this.planet.setSeaIceVisible(p.showSeaIce.value)),
      adjustSailboats: visibility((p) => this.sailboats?.setVisible(p.showSailboats.value)),
      adjustClouds: visibility((p) => { if (this.clouds) this.clouds.enabled = p.showClouds.value }),
      adjustViewStatus: visibility((p) => this.viewStatus?.setVisible(p.showViewStatus.value)),
      adjustContainerShips: visibility((p) => this.containerShips?.setVisible(p.showContainerShips.value)),
      adjustOceanTerminal: visibility((p) => this.oceanTerminal?.setVisible(p.showLauncherOceanTerminal.value)),
      adjustLaunchVehicleGlow: visibility((p) => this.launchSystem?.glow.configure(this.launchSystem.effectiveParams(p), this.planetSpec)),
      adjustEarthAtmosphereVisibility: visibility((p) => this.planet.setAtmosphereVisible(p.showEarthsAtmosphere.value)),
      adjustTerrainExaggeration: visibility((p) => this.planet.setDisplacementScale((this.nonGUIParams.planet2DisplacementScaleMultiplier ?? 1) * p.terrainExaggeration.value)),
      adjustBackgroundOpacity: visibility((p) => this.renderer.setClearAlpha(p.enableBackgroundAlpha.value ? 0 : 1)),
    }
  }

  // Applies every parameter after a bulk change (shot import, illustration settings).
  applyAllParameters() {
    this.store.derive()
    const handlers = this.parameterHandlers()
    for (const name of ['adjustEarthSurfaceVisibility', 'adjustEarthAtmosphereVisibility', 'adjustEarthTextureOpacity', 'adjustEarthTextureSidedness',
      'adjustTerrainExaggeration', 'adjustSeaIce', 'adjustSailboats', 'adjustContainerShips', 'adjustClouds', 'adjustOceanTerminal', 'adjustMoonsVisibility', 'updateXYChart', 'updateLogoSprite', 'updateCamerFieldOfView',
      'updateOrbitControlsRotateSpeed', 'adjustTetherOpacity', 'adjustStructureGlow', 'adjustHighlights', 'adjustBackgroundOpacity']) handlers[name]()
    this.rebuildRing()
    this.ring.adjustLatLon(0)
    this.gui.refresh()
  }

  updateTransitSystem() {
    const r = this.ring
    this.ecv = new tram.elevatorCarVariables(this.planetSpec, this.d, r.crv)
    this.transitSystem.update(this.d, r.refCoordSys, this.specs, false, r.crv, this.planetRadius, r.mainRingCurve, this.clock.time)
    this.shots?.onSceneChanged()
  }

  updateLauncher() {
    if (!this.launchSystem) return
    const r = this.ring
    this.launchSystem.update(this.d, this.clock.time, this.planetCoordSys, this.planetSpec, r.refCoordSys, r.mainRingCurve, r.crv, this.specs, false, '')
    this.launchSystem.drawLaunchTrajectoryLine(this.d, this.planetCoordSys)
    this.shots?.onSceneChanged()
  }

  recomputeLaunchTrajectory({ curvesOnly = false } = {}) {
    if (!this.launchSystem) return
    const r = this.ring
    if (curvesOnly) this.launchSystem.updateTrajectoryCurves(this.d, this.planetCoordSys, this.planetSpec, r.refCoordSys, r.mainRingCurve, r.crv, this.specs, false, '')
    else this.updateLauncher()
  }

  // Rebuilds the ring and everything attached to it. Returns KML text when requested.
  rebuildRing({ genSpecs = false, genKML = false } = {}) {
    this.transitSystem.destroy(this.d)
    const kml = this.ring.rebuild({ genSpecs, genKMLFile: genKML })
    this.camera.ringAxis.set(0, 1, 0).applyQuaternion(this.ring.ringToPlanetRotation)
    this.updateTransitSystem()
    this.shots?.onSceneChanged()
    let launcherKml = ''
    if (this.launchSystem) {
      const r = this.ring
      this.launchSystem.update(this.d, this.clock.time, this.planetCoordSys, this.planetSpec, r.refCoordSys, r.mainRingCurve, r.crv, this.specs, genKML, '')
      this.launchSystem.drawLaunchTrajectoryLine(this.d, this.planetCoordSys)
      if (genSpecs) {
        tram.updateLauncherSpecs(this.d, r.crv, this.launchSystem, this.specs)
        this.launchSystem.genLauncherSpecs(this.d, this.specs, this.planetSpec)
      }
      launcherKml = this.launchSystem.kmlFile ?? ''
    }
    if (genSpecs) this.specsOutput.innerHTML = this.ring.specsSummaryHtml()
    return kml + launcherKml
  }

  applyRingLocationPreset() {
    const locations = [
      // The most commonly depicted Pacific Ocean location (crosses one small island).
      { equivalentLatitude: null, build: [-19.2, 213.7], final: [14.2, 186.3] },
      // Larger diameter reaching both the US and Chinese coastlines (too large to build in the Pacific).
      { equivalentLatitude: 30.8, build: [-19.2, 213.7], final: [11, 182] },
      // Slightly bigger, crosses no islands.
      { equivalentLatitude: 34, build: [-66.5, 137], final: [-66.5, 137] },
      // Crosses only northern Russia and Iceland; maximises the diameter.
      { equivalentLatitude: 8.1, build: [14.6, 249.2], final: [14.6, 249.2] },
      // Crosses only the United States.
      { equivalentLatitude: 10, build: [-36.9, 269.64], final: [-36.9, 269.64] },
      // Crosses only Mexico.
      { equivalentLatitude: 16, build: [-49, 268], final: [-49, 268] },
      // Crosses only Indonesia and Malaysia.
      { equivalentLatitude: 16, build: [-36.6, 170], final: [-36.6, 170] },
    ]
    const location = locations[this.store.get('locationPresetIndex')]
    if (!location) return
    const s = this.store
    if (location.equivalentLatitude !== null) s.set('equivalentLatitude', location.equivalentLatitude)
    else s.set('equivalentLatitude', createParameterDefinitions().equivalentLatitude.value)
    s.set('buildLocationRingCenterLatitude', location.build[0])
    s.set('buildLocationRingCenterLongitude', location.build[1])
    s.set('finalLocationRingCenterLatitude', location.final[0])
    s.set('finalLocationRingCenterLongitude', location.final[1])
    this.store.derive()
    this.gui.refresh()
    this.ring.adjustLatLon(0)
    this.rebuildRing()
  }

  // Switches the Earth's global tile set in place (see Planet.setBaseTiles), for A/B comparisons.
  setEarthTiles(name) {
    if (this.planetSpec.name !== 'Earth') return
    this.planet.setBaseTiles(name)
    console.info(`[planet] Earth imagery: ${this.planet.baseTiles}`)
  }

  toggleEarthTiles() {
    const names = Object.values(EARTH_TILE_SETS)
    this.setEarthTiles(names[(names.indexOf(this.planet.baseTiles) + 1) % names.length])
  }

  switchPreset(id) {
    const url = new URL(window.location.href)
    url.searchParams.set('preset', id)
    window.location.assign(url.toString())
  }

  // ------------------------------------------------------------------------------------------
  // Simulation state (for shots)
  // ------------------------------------------------------------------------------------------

  getAnimationState() {
    return {
      transit: this.transitSystem.getAnimationState?.() ?? null,
      launcher: this.launchSystem?.getAnimationState?.() ?? null,
      tubeDeploymentAlpha: this.tubeDeploymentAlpha,
      logoTimerDone: this.logoTimerDone,
    }
  }

  setAnimationState(state) {
    if (!state) return
    if (state.transit) this.transitSystem.setAnimationState?.(state.transit)
    if (state.launcher) this.launchSystem?.setAnimationState?.(state.launcher)
    this.tubeDeploymentAlpha = state.tubeDeploymentAlpha ?? this.tubeDeploymentAlpha
    this.logoTimerDone = state.logoTimerDone ?? this.logoTimerDone
  }

  // ------------------------------------------------------------------------------------------
  // Per-frame
  // ------------------------------------------------------------------------------------------

  frame() {
    if (this.shots.busy) return // a recording/playback loop is driving the frames
    const now = performance.now()
    this.quality.onFrame(now)
    // The shot playhead decides the simulated time (playing, paused, rewinding or scrubbed).
    const dt = this.shots.tick(now)
    this.step(dt)
    this.render()
  }

  // Advances everything animated to clock.time. `dt` is the step just taken (may be 0).
  step(dt) {
    const t = this.clock.time
    const d = this.d
    if (this.vr) this.vr.update()
    // The shot camera is placed first, so the objects near it get their models in this frame.
    this.shots.beforeStep()

    if (!this.logoTimerDone && t > LOGO_DURATION) {
      this.logoTimerDone = true
      if (this.store.get('showLogo')) {
        this.store.set('showLogo', false)
        this.store.derive()
        this.overlays.setLogoVisible(false)
      }
      const actions = { animateZoomingOut: this.camera.zoomDirection > 0, orbitControlsAutoRotate: this.camera.controls.autoRotate }
      this.nonGUIParams.startTimerActions(actions)
      if (actions.animateZoomingOut) this.camera.zoomDirection = 1
      this.camera.controls.autoRotate = actions.orbitControlsAutoRotate
    }

    this.stepRingAnimations(dt)
    this.launchTrialSweep.step()

    const viewerPosition = (this.enableVR ? this.cameraGroup : this.camera3d).getWorldPosition(new THREE.Vector3())
    if (this.launchSystem) this.launchSystem.animate(t, viewerPosition, this.tubeDeploymentAlpha)
    this.transitSystem.animate(t, this.ring.refCoordSys, viewerPosition, this.ring.mainRingCurve, d)

    if (this.pendingInitialTracking !== null && this.camera.toggleTracking(this.pendingInitialTracking, { toggle: false })) {
      this.pendingInitialTracking = null
    }

    const googleEarthDrives = this.googleEarth.update(t)
    this.camera.playbackActive = this.shots.drivesCamera || googleEarthDrives
    this.camera.update(t, dt)
    this.planet.update(this.camera3d)
    this.updateSea(t)
    this.sailboats?.update(t, this.camera3d)
    this.containerShips?.update(t, this.camera3d)
    this.updateLauncherTraffic()
    if (this.sailboats?.shadowFocus) this.lighting.setLocalShadowFocus(this.sailboats.shadowFocus)
    // The water surface follows the camera; under it the view switches to the underwater look (see
    // render()), with the evacuated tube kept dry.
    this.ocean?.update(this.camera3d, (point, maxDistance) => this.launchSystem?.tubeNear(point, maxDistance) ?? null)
    if (this.ocean) {
      this.planet.setSeafloorView(this.ocean.enabled && this.ocean.cameraUnderSurface ? 1 : 0)
      this.updateSeaSurfaceVisibility()
    }
    MooringCables.refreshSome()
    this.updateSun()
    this.updateOceanTerminal(t)
    this.lighting.followCameraTarget(this.camera.controls.target)

    if (this.trackPointLogger) {
      const c = this.camera
      this.trackPointLogger.capture(t, this.camera3d.position.clone(), this.camera3d.up.clone(), c.controls.target.clone(), c.controls.upDirection.clone(), this.planetSpec)
    }
  }

  // The sun follows a date on Earth (presets that place the sun themselves, and other bodies, keep
  // their own). Automatic date parameters become a repeatable daytime for the preset's starting view,
  // written back into the parameters so they show in the GUI and are saved with shots.
  get sunFollowsDate() {
    return this.planetSpec.name === 'Earth' && !this.nonGUIParams.sunLightPosition
  }

  resolveSunDate() {
    if (!this.sunFollowsDate) return
    const autoDay = !(this.store.get('sunDayOfYear') >= 1)
    const autoTime = !(this.store.get('sunTimeOfDayUTC') >= 0)
    if (!autoDay && !autoTime) return
    // The place in view: the camera's target, or (for views of the whole planet, which orbit its
    // centre) the point below the camera.
    let target = this.planetCoordSys.worldToLocal(this.camera.controls.target.clone())
    if (target.length() < this.planetRadius / 2) target = this.planetCoordSys.worldToLocal(this.camera3d.getWorldPosition(new THREE.Vector3()))
    const geo = tram.ecefToGeodetic(target.x, target.y, target.z, this.planetSpec.ellipsoid)
    const chosen = defaultDaytime(this.presetId, geo.lat, geo.lon)
    if (autoDay) this.store.set('sunDayOfYear', chosen.dayOfYear)
    if (autoTime) this.store.set('sunTimeOfDayUTC', Math.round(chosen.utcHours * 100) / 100)
    this.store.derive()
  }

  // The sea's waves (Planet.updateSea) in the wind at the camera's point on the sea, the same wind the
  // boats sail in (seaPlacement.windAt).
  updateSea(t) {
    if (!this.planetSpec.hasOcean) return
    const p = this.planetCoordSys.worldToLocal(this.camera3d.getWorldPosition(_seaCamera))
    const g = tram.ecefToGeodetic(p.x, p.y, p.z, this.planetSpec.ellipsoid)
    const wind = windAt(g.lat, g.lon)
    // East and north there, from nearby points (planet axes).
    const at = (lat, lon) => { const q = tram.geodeticToECEF(lat, lon, 0, this.planetSpec.ellipsoid); return new THREE.Vector3(q.x, q.y, q.z) }
    const here = at(g.lat, g.lon)
    const east = at(g.lat, g.lon + 1e-3).sub(here).normalize()
    const north = at(g.lat + 1e-3, g.lon).sub(here).normalize()
    _seaWind.copy(east).multiplyScalar(wind.east).addScaledVector(north, wind.north)
    if (_seaWind.lengthSq() < 1e-12) _seaWind.copy(east)
    this.planetCoordSys.updateWorldMatrix(true, false)
    _seaWind.transformDirection(this.planetCoordSys.matrixWorld)
    this.planet.updateSea(t, _seaWind, wind.speed)
  }

  // Ships around the launcher, where the scenes look (ContainerShips.setLauncherTraffic), whenever the
  // launcher's start moves.
  updateLauncherTraffic() {
    const start = this.containerShips && this.launchSystem?.startPoint()
    if (!start || this._launcherTrafficStart?.equals(start)) return
    this._launcherTrafficStart = start
    const track = this.launchSystem.pathPoints(1000).map((p) => {
      const g = tram.ecefToGeodetic(p.x, p.y, p.z, this.planetSpec.ellipsoid)
      return [g.lat, g.lon, g.alt]
    })
    this.containerShips.setLauncherTraffic(track)
  }

  // The ocean terminal at the launcher's breech, if the breech is under the sea (OceanTerminal.place).
  updateOceanTerminal(t) {
    const breech = this.planetSpec.hasOcean && this.d.showLauncherOceanTerminal.value ? this.launchSystem?.startFrame() : null
    if (!breech) {
      this.oceanTerminal?.setVisible(false)
      return
    }
    this.oceanTerminal ??= new OceanTerminal({
      parent: this.planetCoordSys,
      ellipsoid: this.planetSpec.ellipsoid,
      sampleHeight: (lat, lon) => this.planet.sampleTerrainHeight(lat, lon),
      containerShips: this.containerShips ?? null,
    })
    this.oceanTerminal.setVisible(true)
    this.oceanTerminal.setSchedule(this.launchSystem.terminalSchedule())
    this.oceanTerminal.place(breech)
    const sun = this.lighting.sunLight
    _sunDirection.copy(sun.getWorldPosition(_sunDirection)).sub(sun.target.getWorldPosition(_sunTarget))
    this.oceanTerminal.update(t, this.camera3d, _sunDirection)
  }

  // Sun direction (and the season, for sea ice) for the start date plus the simulated time. The wind on
  // the sea is the weather at the start date (seaPlacement.setWeatherDate).
  updateSun() {
    const startDay = Math.max(1, this.store.get('sunDayOfYear')), startHours = Math.max(0, this.store.get('sunTimeOfDayUTC'))
    if (setWeatherDate(startDay, startHours)) {
      this.sailboats?.resetWeather()
      this.containerShips?.resetWeather()
      this.launchSystem?.resetWeather()
    }
    const date = advanceDate(Math.max(1, this.store.get('sunDayOfYear')), Math.max(0, this.store.get('sunTimeOfDayUTC')), this.clock.time)
    this.clouds?.update(this.renderer, date.dayOfYear, date.utcHours, this.clock.time)
    // The sea's roughness far away follows the weather map's wind, once it has been drawn.
    if (this.clouds && !this._seaWindMapSet) {
      this._seaWindMapSet = true
      this.planet.setSeaWindMap(this.clouds.weatherMap.textures[1])
    }
    this.planet.setSeaClouds(this.clouds)
    this.planet.setDayOfYear(date.dayOfYear + date.utcHours / 24)
    if (!this.sunFollowsDate) return
    const s = subsolarPoint(date.dayOfYear, date.utcHours)
    const p = tram.geodeticToECEF(s.lat, s.lon, 0, this.planetSpec.ellipsoid)
    _sunPlanet.set(p.x, p.y, p.z).normalize()
    this.planetCoordSys.updateWorldMatrix(true, false)
    _sunWorld.copy(_sunPlanet).transformDirection(this.planetCoordSys.matrixWorld)
    this.lighting.setSunDirection(_sunWorld, _sunPlanet)
  }

  stepRingAnimations(dt) {
    if (this.ringRaise === 0 || dt === 0) return
    const mode = this.d.animateElevatedEvacuatedTubeDeployment.value ? 'tube' : 'raise'
    if (mode === 'tube') {
      this.tubeDeploymentAlpha = THREE.MathUtils.clamp(this.tubeDeploymentAlpha + this.ringRaise * dt * TUBE_DEPLOY_RATE, 0, 1)
      if (this.tubeDeploymentAlpha === 0 || this.tubeDeploymentAlpha === 1) this.ringRaise = 0
      return
    }
    const key = 'ringAmountRaisedFactor'
    const value = THREE.MathUtils.clamp(this.store.get(key) + this.ringRaise * dt * RING_RAISE_RATE, 0, 1)
    this.store.set(key, value)
    if (value === 0 || value === 1) this.ringRaise = 0
    this.store.derive()
    this.gui.refresh()
    this.rebuildRing()
  }

  // The camera's height above the planet's ellipsoid (m).
  cameraAltitude() {
    const p = this.planetCoordSys.worldToLocal(this.camera3d.getWorldPosition(this._cameraPosition ??= new THREE.Vector3()))
    return tram.ecefToGeodetic(p.x, p.y, p.z, this.planetSpec.ellipsoid).alt
  }

  prepareRender() {
    this.viewStatus?.update(performance.now())
    this.shots.overlay.update(this.camera3d)
    PixelLOD.beginFrame(this.renderer.info.render.frame)
    this.ring.update()
  }

  render({ prepared = false } = {}) {
    this.quality.beginGpuFrame()
    if (!prepared) this.prepareRender()
    const renderer = this.renderer
    PixelLOD.updateScene(this.scene, this.camera3d)
    InstancedProxyPool.syncAll(this.camera3d, PixelLOD.viewportHeight)
    // Tethers and cables: pixel coverage, and haze from the air (not from under the sea).
    StructureLines.update(
      this.planetSpec.hasOcean === true && this.planet.atmosphere.visible && !this.ocean?.cameraUnderSurface)
    SubPixelFade.update(this.camera3d, PixelLOD.viewportHeight)
    // Lets the transit system keep objects until they are sub-pixel instead of using fixed ranges.
    this.transitSystem.pixelsPerRadian = this.camera3d.projectionMatrix.elements[5] * PixelLOD.viewportHeight / 2
    if (this.launchSystem) this.launchSystem.pixelsPerRadian = this.transitSystem.pixelsPerRadian
    this.sky.update(this.camera3d, this.planetCoordSys, this.lighting.sunLight, this.d, this.planetSpec)
    const sun = this.lighting.sunLight
    this.planet.updateAtmosphere(this.camera3d, sun.getWorldPosition(_sunDirection).sub(sun.target.getWorldPosition(_sunTarget)))
    // Under the sea surface (in the water, or dry inside the tube): no sky (or atmosphere); the
    // background is the water colour.
    const underwater = this.ocean?.enabled && this.ocean.cameraUnderSurface
    const atmosphereVisible = this.planet.atmosphere.visible
    // Haze over everything seen through the air. It lives in the fog code, so the scene needs a fog
    // (the sea's, or else one of zero density).
    const haze = this.planetSpec.hasOcean === true && atmosphereVisible && !underwater
    AerialPerspective.update(haze, this.planet.atmosphereUniforms)
    if (haze && !this.scene.fog) this.scene.fog = this._hazeFog ??= new THREE.FogExp2(0x000000, 0)
    if (underwater) {
      renderer.getClearColor(this._clearColor ??= new THREE.Color())
      this._clearAlpha = renderer.getClearAlpha()
      renderer.setClearColor(this.ocean.fog.color, 1)
      this.planet.atmosphere.visible = false
    }
    renderer.clear()
    if (!underwater) this.sky.render(renderer)
    renderer.clearDepth()
    this.googleEarth.render(renderer)
    if (this.background?.scene) {
      renderer.render(this.background.scene, this.background.camera)
      renderer.clearDepth()
    }
    this.lighting.updateSkyLight(true, this.planet, this.planetSpec.hasOcean === true)
    renderer.render(this.scene, this.camera3d)
    // The launch vehicles' plasma and exhaust (LaunchVehicleGlow.js) are light without a surface, kept out
    // of the clouds' distance prepass. They fly above the clouds, so the clouds cover them seen from below
    // the clouds' tops, and they are drawn over the clouds seen from above.
    const glow = this.launchSystem?.glow
    const glowOverClouds = glow?.anyVisible && this.cameraAltitude() > SHELL_TOP
    if (glow && !glowOverClouds) glow.render(renderer, this.camera3d, this.planetCoordSys)
    // (While the sun and sky light is still set up for this camera: the clouds use it.)
    if (!underwater && atmosphereVisible) {
      this.clouds?.render(renderer, this.scene, this.camera3d, this.lighting.sunLight.intensity, this.planet.atmosphereUniforms.atmoParams.value.y)
    }
    if (glow && glowOverClouds) glow.render(renderer, this.camera3d, this.planetCoordSys)
    this.lighting.updateSkyLight(false)
    if (underwater) {
      renderer.setClearColor(this._clearColor, this._clearAlpha)
      this.planet.atmosphere.visible = atmosphereVisible
    }
    // The highlighted classes, over everything (nothing to do while all are off).
    this.highlights.render(renderer, this.scene, this.camera3d)
    renderer.clearDepth()
    this.overlays.render(renderer)
    this.quality.endGpuFrame()
    if ((this._framesRendered = (this._framesRendered ?? 0) + 1) % PRECOMPILE_INTERVAL === 1) this.precompileShaders()
    warmPrograms(renderer)
  }

  // Compiles the shader programs of new objects in the scene (drawn or not: e.g. the sea surface and the
  // atmosphere while under the sea), the sky's, the launch vehicles' glow's and the clouds' passes' in the
  // background, so that the first frame that draws them does not stall (see precompile.js).
  precompileShaders() {
    if (this._precompiling) return
    const seen = (this._precompiled ??= { scene: new Set(), sky: new Set(), glow: new Set() })
    const scene = standInScene(this.scene, { seen: seen.scene })
    const sky = standInScene(this.sky.scene, { seen: seen.sky })
    const glowScene = this.launchSystem?.glow.scene
    const glow = glowScene && standInScene(glowScene, { seen: seen.glow })
    this._precompiling = true
    Promise.all([
      scene && this.renderer.compileAsync(scene, this.camera3d, this.scene),
      sky && this.renderer.compileAsync(sky, this.sky.camera, this.sky.scene),
      glow && this.renderer.compileAsync(glow, this.camera3d, glowScene),
      this.clouds?.compileAsync(this.renderer, this.scene, this.camera3d),
    ]).catch((error) => console.warn('[app] precompiling shaders failed', error))
      .finally(() => { this._precompiling = false })
  }

  // Sets the drawing-buffer size. `css` keeps the canvas filling its container while recording at
  // a different resolution.
  setRenderSize(width, height, { pixelRatio = this.quality.pixelRatio() } = {}) {
    if (this.shots?.recordingSize) ({ width, height, pixelRatio } = this.shots.recordingSize)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    PixelLOD.viewportHeight = height * pixelRatio
    this.camera3d.aspect = width / height
    this.camera3d.updateProjectionMatrix()
    this.overlays.resize(width, height)
  }

  onResizeAfterRecording() {
    this.onResize({ force: true })
  }

  // Stops key-driven animations (raise/lower, zoom, climb, follow modes) so a shot starts clean.
  stopInteractiveAnimations() {
    this.ringRaise = 0
    this.camera.zoomDirection = 0
    this.camera.climbRate = 0
    this.camera.followElevator = null
    this.camera.followTransitAngularSpeed = 0
    this.camera.tracker.clear()
  }

  onResize({ force = false } = {}) {
    if (this.shots?.busy && !force) return
    const n = this.nonGUIParams
    let width = this.container.clientWidth
    let height = this.container.clientHeight
    const image = this.backgroundImage?.source?.data
    if (n.setResolutionFromBackgroundImage && image) {
      width = image.naturalWidth
      height = image.naturalHeight
    }
    // The shot camera's view is framed like the video (the canvas letterboxes it, see styles.css).
    const aspect = this.shots?.previewAspect
    if (aspect) {
      if (width / height > aspect) width = Math.round(height * aspect)
      else height = Math.round(width / aspect)
    }
    this.setRenderSize(width, height)
  }

  // ------------------------------------------------------------------------------------------
  // Actions (keyboard shortcuts and GUI buttons)
  // ------------------------------------------------------------------------------------------

  togglePause() {
    this.shots.togglePlay()
  }

  orbitPlanetCentre() {
    const c = this.camera.controls
    c.upDirection.set(0, 1, 0)
    if (this.nonGUIParams.overrideOrbitControlsUpDirection) c.upDirection.applyQuaternion(this.ring.ringToPlanetRotation)
    this.camera3d.up.copy(c.upDirection)
    c.target.set(0, 0, 0)
    c.rotateSpeed = 1
    c.maxPolarAngle = Math.PI
  }

  orbitRingCentre() {
    const c = this.camera.controls
    c.upDirection.copy(this.camera.ringAxis)
    this.camera3d.up.copy(c.upDirection)
    c.target.copy(c.upDirection).multiplyScalar(this.ring.crv.y0)
    this.store.set('logZoomRate', -3)
    this.store.derive()
    this.gui.refresh()
    c.rotateSpeed = 1
    c.maxPolarAngle = Math.PI
  }

  // P key: orbit around what is under the mouse pointer. Moving objects are tracked.
  orbitPointUnderMouse() {
    this.raycaster.setFromCamera(this.mouse, this.camera3d)
    const pickable = ['launchVehicle', 'elevatorCar', 'transitVehicle', 'transitTube', 'massDriverTube']
    const moving = { launchVehicle: 0, transitVehicle: 3, elevatorCar: 4 }
    const hits = this.raycaster.intersectObjects([this.ring.refCoordSys, ...(this.launchSystem ? [this.launchSystem.scene ?? this.planetCoordSys] : [])], true)
    for (const name of pickable) {
      for (const hit of hits) {
        let object = hit.object
        while (object && object.name !== name) object = object.parent
        if (!object || !this.isVisibleInScene(hit.object)) continue
        if (name in moving) {
          this.camera.tracker.findNearest(name, hit.point)
          this.camera.tweenTo(this.camera.tracker.getPosition(this.camera.tweeningTime / 1000))
        }
        else {
          this.camera.tweenTo(hit.point)
        }
        this.camera.controls.rotateSpeed = 0.9
        return
      }
    }
    const surface = this.planet.raycast(this.raycaster)[0]
    if (surface) {
      const altitude = this.d.pKeyAltitudeFactor.value * this.ring.crv.currentMainRingAltitude
      const point = surface.point.clone().multiplyScalar((this.planetRadius + altitude) / this.planetRadius)
      this.camera.placeMarker(this.camera.targetMarker, point, this.d.showTrackingMarkers.value)
      this.camera.tweenTo(point)
      this.camera.controls.rotateSpeed = 0.9
    }
  }

  isVisibleInScene(object) {
    for (let o = object; o; o = o.parent) if (!o.visible) return false
    return true
  }

  logObjectCounts() {
    const counts = {}
    this.scene.traverse((child) => { const name = child.name || 'noName'; counts[name] = (counts[name] ?? 0) + 1 })
    console.table(counts)
  }

  analyseLauncherTerrain() {
    if (!this.launchSystem) { console.log('Launch system not enabled'); return }
    analyzeLauncherTerrainDisplacement(this.launchSystem, this.planet.surface, this.planetSpec, tram, this.planetCoordSys, (lat, lon) => this.planet.sampleTerrainHeight(lat, lon))
  }

  placeCompanionBodyInView() {
    const direction = this.camera.controls.target.clone().sub(this.camera3d.position).normalize()
    this.sky.setCompanionBodyDirection(direction)
    const p = this.sky.companionBody.position
    console.log(`Companion body direction: new THREE.Vector3(${p.x}, ${p.y}, ${p.z})`)
  }

  toggleStationaryTracking() {
    this.camera.stationaryTracking = !this.camera.stationaryTracking
  }

  toggleAutoRotate() {
    const c = this.camera.controls
    c.autoRotate = !c.autoRotate
    c.autoRotateSpeed = this.d.orbitControlsRotateSpeed.value
  }

  toggleRaise(direction) {
    this.ringRaise = this.ringRaise === direction ? 0 : direction
  }

  adjustClimbRate(delta) {
    this.camera.climbRate = Math.round((this.camera.climbRate + delta) * 10) / 10
  }

  toggleZoom(direction) {
    this.camera.zoomDirection = this.camera.zoomDirection === direction ? 0 : direction
  }

  warpToCameraPreset() {
    const preset = cameraPresets[this.store.get('cameraPreset')]
    if (!preset) return
    const v = (o) => new THREE.Vector3(Number(o.X), Number(o.Y), Number(o.Z))
    this.camera.setState({
      position: v(preset.orbitObjectPosition).toArray(),
      target: v(preset.orbitTarget).toArray(),
      up: v(preset.cameraUp).toArray(),
      orbitUp: v(preset.orbitUpDirection).toArray(),
    })
    this.camera.controls.maxPolarAngle = Math.PI
  }

  printCameraPosition() {
    const c = this.camera.controls
    const ref = this.initialReferencePoint
    const target = c.target.clone().sub(ref)
    const position = this.camera3d.position.clone().sub(ref)
    const vec = (v) => `new THREE.Vector3(${v.x}, ${v.y}, ${v.z})`
    console.log([
      `nonGUIParams['orbitControlsTarget'] = ${vec(target)}`,
      `nonGUIParams['orbitControlsUpDirection'] = ${vec(c.upDirection)}`,
      `nonGUIParams['orbitControlsObjectPosition'] = ${vec(position)}`,
      `nonGUIParams['cameraUp'] = ${vec(this.camera3d.up)}`,
    ].join('\n'))
    const frame = this.launchTrackFrame
    if (frame) {
      const along = (v, isDirection) => {
        const r = isDirection ? v : v.clone().sub(frame.origin)
        const n = (x) => Number((Math.abs(x) < 5e-7 ? 0 : x).toFixed(6))
        return `{forward: ${n(r.dot(frame.forward))}, right: ${n(r.dot(frame.right))}, up: ${n(r.dot(frame.up))}}`
      }
      console.log(`nonGUIParams['launchTrackCamera'] = {\n  target: ${along(c.target)},\n  position: ${along(this.camera3d.position)},\n  cameraUp: ${along(this.camera3d.up, true)}\n}`)
    }
  }

  toggleLockUpToRingAxis() {
    this.camera.lockUpToRingAxis = !this.camera.lockUpToRingAxis
  }

  toggleFollowElevators() {
    if (this.camera.followElevator) {
      this.camera.followElevator = null
      return
    }
    const calculator = this.transitSystem.elevatorPositionCalculator ?? new tram.elevatorPositionCalculator(this.d, this.ring.crv, this.ecv)
    this.camera.followElevator = () => calculator.calculateElevatorPosition(this.clock.time) + this.planetRadius + this.d.transitTubeUpwardOffset.value
  }

  toggleFollowTransitVehicles() {
    if (this.camera.followTransitAngularSpeed !== 0) {
      this.camera.followTransitAngularSpeed = 0
      return
    }
    this.camera.followTransitAxis.copy(this.camera.ringAxis)
    this.camera.followTransitAngularSpeed = this.d.transitVehicleCruisingSpeed.value / this.ring.crv.mainRingRadius
  }

  moveToLaunchTrajectory() {
    const launcher = this.launchSystem
    if (!launcher?.launchTrajectoryCurve) return
    const curve = launcher.launchTrajectoryCurve
    const duration = launcher.durationOfLaunchTrajectory
    const target = curve.getPoint(20 / duration).multiplyScalar((this.planetRadius + 100) / this.planetRadius)
    const position = curve.getPoint(0).multiplyScalar((this.planetRadius + 100) / this.planetRadius)
    this.camera.tweenTo(target)
    this.camera3d.position.copy(position)
  }

  updateSpecsSummary() {
    this.rebuildRing({ genSpecs: true })
  }

  cycleIllustrationSettings() {
    const settings = ILLUSTRATION_SETTINGS[this.illustrationIndex](this.store.values, this.planetRadius)
    for (const [k, v] of Object.entries(settings)) this.store.set(k, v)
    this.illustrationIndex = (this.illustrationIndex + 1) % ILLUSTRATION_SETTINGS.length
    this.applyAllParameters()
  }

  nextMountainLaunchSite() {
    this.mountainIndex = (this.mountainIndex + 1) % Math.min(120, mountainList.length)
    const mountain = mountainList[this.mountainIndex]
    this.store.set('launcherRampEndLatitude', mountain.lat)
    this.store.set('launcherRampEndLongitude', mountain.lon)
    this.store.derive()
    this.gui.refresh()
    this.updateLauncher()
    console.log(`Launcher ramp moved to ${mountain.name ?? `mountain ${this.mountainIndex}`}`)
  }

  // Sweeps the ramp upward acceleration and logs launcher cost, tube length and ramp time.
  runRampAccelerationSweep() {
    const s = this.store
    const keys = ['launcherMassDriverForwardAcceleration', 'launcherRampUpwardAcceleration']
    const backup = keys.map(k => s.get(k))
    const rows = []
    s.set(keys[0], 80)
    for (let a = 50; a <= 250; a += 10) {
      s.set(keys[1], a)
      this.rebuildRing({ genSpecs: true })
      rows.push({
        rampUpwardAcceleration: a,
        totalCapitalCostBillions: Math.round(this.specs.launcherTotalCapitalCost.value / 1e6) / 1e3,
        evacuatedTubeLengthKm: Math.round(this.specs.launcherElevatedEvacuatedTubeLength.value / 1e3),
        timeWithinRamp: Math.round(this.specs.launchVehicleTimeWithinRamp.value * 100) / 100,
      })
    }
    keys.forEach((k, i) => s.set(k, backup[i]))
    this.rebuildRing()
    console.table(rows)
  }

  toggleLaunchTrialSweep() {
    this.launchTrialSweep.toggle()
  }

  toggleGoogleEarthCamera() {
    this.googleEarth.toggle(this.clock.time).catch((err) => console.error(err))
  }

  downloadSpecs() {
    this.rebuildRing({ genSpecs: true })
    downloadText(specsCsv(this.store.definitions, this.d, this.specs), 'tethered_ring.csv', 'text/csv')
  }

  downloadKml() {
    const body = this.rebuildRing({ genKML: true })
    this.rebuildRing()
    downloadText(kmlutils.kmlFileHeader + body + kmlutils.kmlFileFooter, 'tethered_ring.kml', 'application/vnd.google-earth.kml+xml')
  }

  startTrackPointLogging() {
    this.trackPointLogger = new trackPointLogger(googleEarthProjectFile)
    this.trackPointLogger.start(this.clock.time)
  }

  stopTrackPointLogging() {
    this.trackPointLogger?.stop()
    this.trackPointLogger = null
  }
}
