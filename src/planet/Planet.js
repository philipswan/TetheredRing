import * as THREE from 'three';
import { CubedSpherePlanetRenderer, PLANET_YAW } from './CubedSpherePlanetRenderer.js';
import { loadSeaIce, setSeaIceDayOfYear, setSeaIceVisible } from './seaIce.js';
import atmosphereVertexShader from '../shaders/atmosphere.vert.glsl?raw';
import atmosphereFragmentShader from '../shaders/atmosphere.frag.glsl?raw';
import './aerialPerspective.js'; // registers <atmosphere_common>
import { seaWaveUniforms, updateSeaWaves } from './seaWaves.js';
import { SkyLut, SKY_LUT_SIZE, skyLutGlsl } from './skyLut.js';
import { SeaSkyTable } from './seaSkyTable.js';

// Top of the atmosphere shell above sea level (m), where the sky's scattering stops. High enough that
// the air left above it would not show: a line of sight grazing the top crosses ~1100 km of air at
// 4e-6 of sea-level density, under a level of brightness. (At 60 km a grazing line still met ~1%
// optical depth, and the sky ended in a visible edge.)
const _seaWind = new THREE.Vector3();
const _seaQuaternion = new THREE.Quaternion();
const ATMOSPHERE_HEIGHT = 100000;
// Exposure of the scattered light (sky and haze): 1 within the air, falling to SPACE_EXPOSURE as the
// camera climbs from EXPOSURE_FADE[0] to EXPOSURE_FADE[1] above the sea. Within the air the sky fills
// the view and its brightness is compressed (1 - exp(-light)); from space, at full exposure, the limb
// would saturate into a band of even brightness that looks lit from within, instead of fading with
// the air's density.
const SPACE_EXPOSURE = 0.3;
const EXPOSURE_FADE = [20000, 200000];

// Flat surface colours used before tiles stream in, and for bodies that have
// no baked assets at all.
const BODY_SURFACE_COLORS = {
  earth: 0x8aa7c2,
  moon: 0x9a9a9a,
  mars: 0xb5603a,
  mercury: 0x8c8680,
  venus: 0xd9c08c,
  jupiter: 0xc9a27a,
  saturn: 0xdcc795,
  uranus: 0x9fd8e0,
  neptune: 0x4a6fd8,
  pluto: 0xcbb69c,
};

function bodyKey(planetSpec) {
  return String(planetSpec?.name ?? '').toLowerCase();
}

// The regional high-resolution bakes for each body (folders under assets/, overlays on the body's global
// set). Every scene uses all of them that are on the machine: their tiles are streamed only where the
// camera is close enough to need them (see CubedSpherePlanetRenderer._shouldRefine), and one that is
// missing (or not pulled from Git LFS) is skipped. The Earth regions other than hawaii are baked by
// tools/adaptive_lod.py (EARTH_REGIONS); see docs/ASSETS.md.
export const REGIONAL_BAKES = {
  earth: ['hawaii', 'chimborazo', 'new_zealand', 'washington', 'kilimanjaro', 'boca_chica', 'christmas_island', 'queensland'],
  moon: ['moon_tranquillitatis', 'moon_korolev'],
};

// The Earth's global tile set (a folder under assets/): 'earth', or 'earth_hires', baked by
// tools/earth_hires.py from the planet source data (Blue Marble at every level, GMTED/GEBCO heights; see
// docs/ASSETS.md). ?earthTiles=<name> picks one for a page load.
export const EARTH_BASE_TILES = 'earth_hires';

// A global tile set to use instead of one that is not on this machine (not baked, or not pulled from Git
// LFS): assets/earth_hires falls back to assets/earth.
const BASE_TILE_FALLBACKS = { earth_hires: 'earth' };

function earthBaseTiles() {
  if (typeof window === 'undefined' || !window.location) return EARTH_BASE_TILES;
  return new URLSearchParams(window.location.search).get('earthTiles')?.trim() || EARTH_BASE_TILES;
}

/**
 * Baked asset sets for a body (names of folders under assets/): its global set, then its regional
 * bakes. Earth -> [EARTH_BASE_TILES, ...], Moon -> ['moon', ...], anything else -> [] (flat colour).
 */
export function defaultPlanetAssets(planetSpec) {
  const body = bodyKey(planetSpec);
  switch (body) {
    case 'earth': return [earthBaseTiles(), ...REGIONAL_BAKES.earth];
    case 'moon': return [body, ...REGIONAL_BAKES.moon];
    default: return [];
  }
}

// Imagery credits for assets whose manifests do not carry their own (a manifest's `attribution` wins),
// shown while their tiles are on screen. hawaii's imagery is Esri World Imagery (fetched by
// tools/download_xhr_hawaii_texture_tiles.py); the other Earth regions' is EOxCloudless.
const EOX_CLOUDLESS = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)';
const ESRI_WORLD_IMAGERY = 'Powered by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const ASSET_ATTRIBUTIONS = {
  hawaii: ESRI_WORLD_IMAGERY,
  chimborazo: EOX_CLOUDLESS,
  // Regional bakes made with tools/adaptive_lod.py's EARTH_REGIONS use the same imagery.
  new_zealand: EOX_CLOUDLESS,
  washington: EOX_CLOUDLESS,
  kilimanjaro: EOX_CLOUDLESS,
  boca_chica: EOX_CLOUDLESS,
  christmas_island: EOX_CLOUDLESS,
  queensland: EOX_CLOUDLESS,
};

function assetFromName(name) {
  const base = `${import.meta.env?.BASE_URL ?? '/'}assets/${name}`;
  return {
    name,
    manifestUrl: `${base}/manifest.json`,
    colorBasePath: `${base}/color`,
    heightBasePath: `${base}/height`,
  };
}

function parseNameList(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list.map((s) => String(s).trim()).filter((s) => s.length > 0))];
}

// `?planetAssets=earth,hawaii` overrides the asset stack (debugging aid).
function assetNamesFromUrl() {
  if (typeof window === 'undefined' || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get('planetAssets') ?? params.get('planet2Assets');
  return value ? parseNameList(value) : null;
}

/**
 * A planet surface (cubed-sphere quadtree LOD, streamed KTX2/height tiles) plus
 * an atmosphere shell.
 *
 * Usage:
 *   const planet = new Planet(planetSpec, { renderer, opacity: 1 });
 *   planetCoordSys.add(planet.surface, planet.atmosphere);
 *   // every frame, before rendering:
 *   planet.update(camera);
 *
 * Options (second constructor argument):
 *   renderer              THREE.WebGLRenderer. Needed for KTX2 support detection
 *                         and for the drawing-buffer height used by the LOD.
 *   assets                Ordered asset names under assets/ (first = base globe,
 *                         later = overlays), e.g. ['earth', 'hawaii'].
 *                         Default: defaultPlanetAssets(planetSpec). A URL
 *                         parameter ?planetAssets=a,b overrides it.
 *   doubleSided           Render tile back faces (default false).
 *   opacity               Surface opacity 0..1 (default 1).
 *   showAtmosphere        Initial atmosphere visibility (default true).
 *   tileSegments          Grid segments per tile edge (default 24).
 *   maxConcurrentTileLoads  Parallel tile downloads (default 8).
 *   maxCachedTiles        Resident tile budget (default 320).
 *   maxTileGpuBytes       Estimated texture+height byte budget (default 700 MiB).
 *   tileSseThreshold      Refine when one colour texel would cover more than this many pixels (default 1.5;
 *                         smaller = sharper, more tiles).
 *   tileTextureSize       Colour tile resolution assumed for LOD selection (default 256)
 *   maxAvailableTileLod   Deepest LOD to use before the manifest is loaded, and
 *                         the geometric refinement depth for bodies without
 *                         assets (default 6; manifests override it).
 *   requireKtx2           If true, a failed colour tile is tolerated (flat colour)
 *                         instead of being retried (default false).
 *   receiveSurfaceShadows Tile meshes receive shadows (default false).
 *   textureAnisotropy     Colour texture anisotropy (default 4).
 *   locationInterests     [{ name, lat, lon, radiusKm = 80, lodBoost = 1 }] areas
 *                         refined and loaded preferentially (default []).
 *   displacementScaleMultiplier  Terrain exaggeration (default 1).
 *   surfaceDetail         { enabled, nearMeters, farMeters, normalStrength,
 *                         albedoStrength, roughnessStrength } procedural regolith
 *                         detail for close-up views (default off).
 *   surfaceColor          Flat colour for unloaded tiles / bodies without assets
 *                         (default per body, e.g. reddish for Mars).
 *   water                 Draw a sea surface over terrain below sea level, coloured
 *                         by the imagery (default: planetSpec.hasOcean).
 *   fastCameraSpeed       Camera speed (m/s) above which refinement is capped
 *                         at maxLodWhileFast (default Infinity = never).
 *   maxLodWhileFast       See fastCameraSpeed (default Infinity).
 *   debugMode             'none' | 'tileBorders' | 'lod' | 'priority' |
 *                         'roughness' | 'landWater' | 'loading' (default 'none').
 *   startupChart          Log startup timing milestones and an ASCII load chart
 *                         to the console (default false).
 *   onAttribution(text)   Called whenever the imagery on screen changes, with the
 *                         credits of the assets whose tiles are shown ('' if
 *                         none). Assets that are not on this machine are skipped
 *                         (the tiles below them are used), and so are their
 *                         credits.
 */
const _atmoQuaternion = new THREE.Quaternion();
const _atmoInverse = new THREE.Quaternion();
const _atmoCamera = new THREE.Vector3();
const _atmoCentre = new THREE.Vector3();
const _atmoPole = new THREE.Vector3();

export class Planet {
  constructor(planetSpec, {
    renderer = null,
    assets,
    doubleSided = false,
    opacity = 1,
    showAtmosphere = true,
    onAttribution = null,
    ...rendererOptions
  } = {}) {
    this.planetSpec = planetSpec;

    const assetNames = assetNamesFromUrl() ?? parseNameList(assets ?? defaultPlanetAssets(planetSpec));
    this.assetNames = assetNames;

    this.manifestAttributions = new Map(); // asset name -> its manifest's credit

    this.surface = new THREE.Group();
    this.surface.name = 'planetSurface';
    this.surface.rotation.y = PLANET_YAW; // aligns the baked longitude frame with the app's

    this.rendererOptions = {
      ...rendererOptions,
      surfaceColor: rendererOptions.surfaceColor ?? BODY_SURFACE_COLORS[bodyKey(planetSpec)] ?? 0x8aa7c2,
      renderer,
      planetSpec,
      doubleSided,
      opacity,
      water: rendererOptions.water ?? planetSpec.hasOcean === true,
      onAssetsLoaded: (loaded) => {
        for (const { name, attribution } of loaded) if (attribution) this.manifestAttributions.set(name, attribution);
      },
      onVisibleAssets: (names) => onAttribution?.([...new Set(names
        .map((name) => this.manifestAttributions.get(name) ?? ASSET_ATTRIBUTIONS[name])
        .filter(Boolean))].join('; ')),
    };
    // One renderer per global tile set that has been shown (see setBaseTiles); `lod` is the one in use.
    // Settings made through Planet are kept so a renderer created later starts with them.
    this.renderers = new Map();
    this.settings = new Map(); // renderer method -> its last arguments
    this.visible = true;
    this.lod = this._createRenderer(assetNames);
    // Seasonal sea ice on the Earth's sea surface (seaIce.js; the date is set by setDayOfYear).
    if (bodyKey(planetSpec) === 'earth' && this.rendererOptions.water) loadSeaIce();

    // The atmosphere: a shell ATMOSPHERE_HEIGHT above the sea-level ellipsoid, drawn from inside
    // (its far side), shaded per pixel by single scattering along the line of sight through it (see
    // atmosphere.frag.glsl and updateAtmosphere). Finely tessellated so its edge stays smooth (the
    // chord sag of 256 x 128 segments is about 0.5 km).
    const a = planetSpec.ellipsoid.a;
    const b = a * (1 - (planetSpec.ellipsoid.f || 0));
    this.ellipsoid = { a, b };
    this.atmosphereUniforms = {
      atmoCamera: { value: new THREE.Vector4() },
      atmoPole: { value: new THREE.Vector4() },
      atmoParams: { value: new THREE.Vector4(0, 1, a, a + ATMOSPHERE_HEIGHT) },
      atmoSun: { value: new THREE.Vector3(0, 1, 0) },
    };
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 256, 128),
      new THREE.ShaderMaterial({
        // (The sea it draws near the horizon reflects the sky as the sea surface does: seaWaves.js.)
        // (The sea it draws near the horizon reflects the sky as the sea surface does: seaWaves.js.)
        uniforms: {
          ...this.atmosphereUniforms, seaSlopeVariance: seaWaveUniforms.seaSlopeVariance,
          skyLight: { value: null }, skyTransmittance: { value: null }, skyLutSize: { value: new THREE.Vector2(...SKY_LUT_SIZE) },
        },
        defines: planetSpec.hasOcean === true ? { SEA_REFLECTION: '' } : {},
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader.replace('SKY_LUT_GLSL', skyLutGlsl),
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        // Premultiplied: scattered light + background * (1 - opacity).
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.atmosphere.name = 'atmosphere';
    this.atmosphere.scale.set(a + ATMOSPHERE_HEIGHT, b + ATMOSPHERE_HEIGHT, a + ATMOSPHERE_HEIGHT);
    this.atmosphere.frustumCulled = false; // also the sky around the camera when it is inside the shell
    this.atmosphere.visible = showAtmosphere;
    this.skyLut = null;
    this.setSkyLut(true);
  }

  // The sky read from a table worked out once a frame (skyLut.js) rather than marched at every pixel.
  setSkyLut(on) {
    if (on === !!this.skyLut) return;
    const material = this.atmosphere.material;
    if (on) {
      this.skyLut = new SkyLut(this.atmosphereUniforms);
      material.uniforms.skyLight.value = this.skyLut.light;
      material.uniforms.skyTransmittance.value = this.skyLut.transmittance;
      material.defines.SKY_LUT = '';
    } else {
      this.skyLut.dispose();
      this.skyLut = null;
      delete material.defines.SKY_LUT;
    }
    material.needsUpdate = true;
  }

  /**
   * Updates the atmosphere for this frame: camera (world) and the direction to the sun (world).
   * The large terms are computed here in float64 so the shader works with small numbers.
   */
  /**
   * The sea's waves for simulated time t (s), in the wind at the camera's point on the sea: the way it
   * blows (a unit vector, world axes) and its speed (m/s). See seaWaves.js.
   */
  updateSea(t, windDirection, windSpeed) {
    this.lod.group.updateWorldMatrix(true, false);
    _seaWind.copy(windDirection).applyQuaternion(this.lod.group.getWorldQuaternion(_seaQuaternion).invert()).normalize();
    updateSeaWaves(t, _seaWind, windSpeed);
  }

  /** The weather map's wind texture (clouds/weatherMap.js), for the sea's roughness far away (seaWaves.js). */
  setSeaWindMap(texture) {
    seaWaveUniforms.seaWindMap.value = texture;
    seaWaveUniforms.seaWindMapActive.value = texture ? 1 : 0;
  }

  /** The clouds' cover for the sea's reflection of them (seaWaves.js seaCloudCover): clouds, a Clouds (or null). */
  setSeaClouds(clouds) {
    const u = clouds?.uniforms;
    seaWaveUniforms.seaCoverMap.value = u?.weatherA.value ?? null;
    seaWaveUniforms.seaRealClouds.value = u?.realClouds.value ?? null;
    seaWaveUniforms.seaCloudBlend.value.set(u?.realBlend.value ?? 0, u?.realDeclination.value ?? 0, u?.realClouds.value ? 1 : 0);
  }

  updateAtmosphere(camera, sunDirection) {
    const { a, b } = this.ellipsoid;
    const k = a / b;
    const top = a + ATMOSPHERE_HEIGHT;
    this.atmosphere.updateWorldMatrix(true, false);
    const q = this.atmosphere.getWorldQuaternion(_atmoQuaternion);
    // Camera relative to the planet centre, in the planet's own axes (y = polar), then stretched.
    camera.getWorldPosition(_atmoCamera);
    _atmoCamera.sub(this.atmosphere.getWorldPosition(_atmoCentre)).applyQuaternion(_atmoInverse.copy(q).invert());
    _atmoCamera.y *= k;
    const c2 = _atmoCamera.lengthSq();
    _atmoCamera.applyQuaternion(q);
    const u = this.atmosphereUniforms;
    u.atmoCamera.value.set(_atmoCamera.x, _atmoCamera.y, _atmoCamera.z, c2 - top * top);
    _atmoPole.set(0, 1, 0).applyQuaternion(q);
    u.atmoPole.value.set(_atmoPole.x, _atmoPole.y, _atmoPole.z, k - 1);
    u.atmoParams.value.x = c2 - a * a;
    const fade = THREE.MathUtils.smoothstep(Math.sqrt(c2) - a, EXPOSURE_FADE[0], EXPOSURE_FADE[1]);
    u.atmoParams.value.y = THREE.MathUtils.lerp(1, SPACE_EXPOSURE, fade);
    u.atmoSun.value.copy(sunDirection).normalize();
    if (this.skyLut && this.atmosphere.visible && this.rendererOptions.renderer) this.skyLut.update(this.rendererOptions.renderer);
    // The sky from sea level, for the lighter qualities' sea (worked out once).
    if (this.rendererOptions.renderer) {
      this.seaSkyTable ??= new SeaSkyTable();
      this.seaSkyTable.update(this.rendererOptions.renderer, a);
      seaWaveUniforms.seaSkyTable.value = this.seaSkyTable.texture;
    }
  }

  _createRenderer(assetNames) {
    const group = new THREE.Group();
    group.name = `planetTiles:${assetNames[0] ?? 'none'}`;
    this.surface.add(group);
    const base = assetNames[0];
    const lod = new CubedSpherePlanetRenderer({
      ...this.rendererOptions,
      group,
      assets: assetNames.map(assetFromName),
      onAssetsLoaded: (loaded) => {
        this.rendererOptions.onAssetsLoaded(loaded);
        const fallback = BASE_TILE_FALLBACKS[base];
        if (fallback && this.lod === lod && !loaded.some(({ name }) => name === base)) {
          console.warn(`[planet] "${base}" is not on this machine (or not pulled from Git LFS): using "${fallback}"`);
          this.setBaseTiles(fallback);
        }
      },
    });
    this.renderers.set(base, lod);
    return lod;
  }

  // Calls a renderer setting on every renderer, and keeps it for renderers created later.
  _setOnRenderers(method, ...args) {
    this.settings.set(method, args);
    for (const lod of this.renderers.values()) lod[method](...args);
  }

  /** The global tile set in use (the first asset, e.g. 'earth' or 'earth_hires'). */
  get baseTiles() {
    return this.assetNames[0];
  }

  /**
   * Switches the global tile set (a folder under assets/) without rebuilding anything else, keeping
   * the regional bakes. The set switched away from keeps its loaded tiles, so switching back is
   * immediate: for comparing two sets from the same view.
   */
  setBaseTiles(name) {
    if (!name || name === this.baseTiles) return;
    const previous = this.lod;
    const assetNames = [name, ...this.assetNames.slice(1)];
    const next = this.renderers.get(name) ?? this._createRenderer(assetNames);
    for (const [method, args] of this.settings) next[method](...args);
    next.sseThreshold = previous.sseThreshold; // (graphics quality sets it directly)
    previous.setEnabled(false);
    previous.group.visible = false;
    next.group.visible = true;
    next.setEnabled(this.visible);
    this.assetNames = assetNames;
    this.lod = next;
  }

  /** The date for seasonal effects (sea ice): day of the year, 1 = 1 January, fractional days allowed. */
  setDayOfYear(dayOfYear) {
    setSeaIceDayOfYear(dayOfYear);
  }

  setSeaIceVisible(visible) {
    setSeaIceVisible(visible);
  }

  /** Per-frame LOD selection and streaming. Call before rendering. */
  update(camera) {
    this.lod.update(camera);
  }

  /** Shows/hides the surface. While hidden, update() streams nothing. */
  setVisible(visible) {
    this.surface.visible = !!visible;
    this.visible = !!visible;
    this.lod.setEnabled(!!visible);
  }

  // Sea surface over terrain below sea level (planets with oceans).
  // The sea's lighter shader, for the lighter graphics qualities (see CubedSpherePlanetRenderer.setSeaLite).
  setSeaLite(on) {
    this._setOnRenderers('setSeaLite', on)
  }

  setWaterVisible(visible) {
    this._setOnRenderers('setWaterVisible', visible)
  }

  // 1 while the camera is under the sea surface: the ground below sea level is drawn as sea floor.
  setSeafloorView(amount) {
    this._setOnRenderers('setSeafloorView', amount)
  }

  setAtmosphereVisible(visible) {
    this.atmosphere.visible = !!visible;
  }

  setOpacity(value) {
    this._setOnRenderers('setOpacity', value);
  }

  setDoubleSided(doubleSided) {
    this._setOnRenderers('setDoubleSided', doubleSided);
  }

  setDisplacementScale(multiplier) {
    this._setOnRenderers('setDisplacementScale', multiplier);
  }

  setDebugMode(mode) {
    this._setOnRenderers('setDebugMode', mode);
  }

  /**
   * Terrain height at a geodetic lat/lon (degrees) from the resident tiles, or
   * null if nothing covering the point is loaded. See
   * CubedSpherePlanetRenderer.sampleTerrainHeight for the result fields.
   */
  sampleTerrainHeight(latDeg, lonDeg) {
    return this.lod.sampleTerrainHeight(latDeg, lonDeg);
  }

  /** See CubedSpherePlanetRenderer.fixedHeightSampler. */
  fixedHeightSampler(direction, maxLod) {
    return this.lod.fixedHeightSampler(direction, maxLod);
  }

    /** Intersections with the visible surface tiles only, nearest first. */
  raycast(raycaster) {
    return this.lod.raycast(raycaster, []);
  }

  getDebugStats() {
    return this.lod.getDebugStats();
  }

  dispose() {
    for (const lod of this.renderers.values()) lod.dispose();
    this.surface.removeFromParent();
    this.atmosphere.removeFromParent();
    this.atmosphere.geometry.dispose();
    this.atmosphere.material.dispose();
  }
}
