import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { fbmGlsl, noiseOffsets } from './seaNoise.js';
import '../scene/sunAndSkyLight.js'; // registers <sun_and_sky_light>, which the sea surface uses
import { FOAM_FREQUENCIES, GROUP_FREQUENCIES, GUST_FREQUENCIES, SEA_GUSTS_UNSEEN_DISTANCE, SEA_WAVES_UNRESOLVED_PIXEL, seaSkyReflectionGlsl, seaWaveUniforms, seaWavesGlsl, tileWaveOffsets } from './seaWaves.js';
import { SEA_ICE_FREQUENCIES, seaIceGlsl, seaIceUniforms } from './seaIce.js';
import { apHazeUniforms } from './aerialPerspective.js';
import { PixelLOD } from '../scene/PixelLOD.js';
import { COVER, COVER_COUNT, coastShape, coastSide, groundRelief } from './groundData.js';
import { FULL_MIN_LOD, GroundTextures } from './groundTextures.js';
import { groundFragment, groundFragmentPars, groundNormalFragment, groundOffsets, groundRoughnessFragment, groundUniforms, groundVertex, groundVertexPars } from './groundDetail.js';

// Milliseconds per frame for uploading newly loaded tiles to the GPU (at least one tile per frame;
// everything while recording, which sets PixelLOD.buildBudget to Infinity). Without a budget, the
// many tiles that finish loading together at start-up were all uploaded in one frame's render.
const TILE_UPLOAD_BUDGET_MS = 4;

// The base tile sets (assets/earth, assets/earth_hires, assets/moon) have every tile through this LOD;
// regional overlays only add tiles below it (BASE_FULL_COVERAGE_LOD in tools/adaptive_lod.py).
const BASE_FULL_COVERAGE_LOD = 3;

// Generated ground (groundData.js): below the deepest baked tile, inside a region with ground data, tiles are made on
// the spot from the region's terrain heights, the shape of its coast and generated relief, down to GROUND_MAX_LOD
// (tiles about 10 m across, vertices 0.4 m apart). They are drawn with their baked ancestor's imagery. A generated
// tile is refined once its vertex spacing would cover more than GROUND_SSE_PIXELS pixels.
const GROUND_MAX_LOD = 20;
const GROUND_SSE_PIXELS = 10;
// Generated tiles are not made over open sea further than this from the coast (m).
const GROUND_SEA_MARGIN = 150;
// Baked tiles from this level down, inside a region with ground data, have the generated ground's look too.
const GROUND_LOOK_MIN_LOD = 9; // (level 11 tiles, always several kilometres off, get 38 m texels: their patterns have faded)

// =============================================================================
// CubedSpherePlanetRenderer - cubed-sphere quadtree LOD planet renderer that
// streams KTX2 colour tiles and u16 height tiles from assets/<name>/.
//
// Most code should use the Planet wrapper (Planet.js) rather than this class.
//
// Design notes
// ------------
// The offline asset generator (tools/generate_planet2_lod0_assets.py) bakes every
// cube face and tile by sampling the source equirectangular textures through the
// SAME `cube_to_direction(face, u, v)` mapping used here, with no per-face flips.
// Therefore the runtime mapping is intentionally DIRECT and self-consistent:
//
//   * asset face name        == runtime face name           (no +Z/-Z swap)
//   * asset tile x/y         == runtime tile x/y            (no flip)
//   * geometry UV            == (u01, v01) within the tile   (no per-vertex flip)
//   * height sample location == (u01, v01) within the tile   (same as UV)
//   * KTX2 textures use flipY = false (GPU-compressed default), which matches the
//     generator's row order (image row 0 == tile-local v == 0).
//
// Any whole-planet alignment with the surrounding app coordinate frame is a single
// rigid rotation applied to the surface group (PLANET_YAW), never a per-tile
// transform. This keeps multi-tile (LOD >= 1) layouts from mirroring/scrambling.
//
// Floating-point precision
// ------------------------
// Tile vertices are stored relative to the tile's own centre and the tile mesh
// is positioned at that centre. three.js composes modelViewMatrix in float64 on
// the CPU, so vertices close to the camera keep sub-millimetre precision instead
// of being quantised to ~0.5 m at planet scale (6.4e6 m in float32). The
// procedural surface-detail noise follows the same idea: it is evaluated on the
// tile-local position plus a per-tile, per-frequency offset that is reduced
// modulo the (periodic) noise lattice on the CPU in float64.
// =============================================================================

// Whole-planet yaw used to align the baked longitude frame (lon = atan2(z, x))
// with the surrounding application's longitude system. Apply it to the group
// passed in as `options.group` (Planet.js does this).
export const PLANET_YAW = -Math.PI / 2;

const FACE_INDEX = { '+X': 0, '-X': 1, '+Y': 2, '-Y': 3, '+Z': 4, '-Z': 5 };
const TWO_POW_20 = 1048576;

// Allocation-free numeric tile key (face index, lod <= 31, x/y < 2^20).
function tileNumKey(faceIndex, lod, x, y) {
  return ((faceIndex * 32 + lod) * TWO_POW_20 + x) * TWO_POW_20 + y;
}

// Surface-detail noise. The hash is periodic with DETAIL_PERIOD lattice cells so
// a per-tile offset can be reduced modulo the period without creating seams.
// Each distinct noise frequency (cycles/metre) gets its own offset uniform.
const DETAIL_PERIOD = 1024;
const DETAIL_FREQS = [
  0.0012, 0.0012 * 2.03, 0.0012 * 4.11, // 0-2 macro tone fBm octaves
  0.035, 0.035 * 2.03, 0.035 * 4.11,    // 3-5 regolith fBm octaves
  0.075,                                // 6   pits
  0.0018, 0.012, 0.11, 0.65,            // 7-10 normal-perturbation bands
];

function positiveMod(v, m) {
  const r = v % m;
  return r < 0 ? r + m : r;
}

function byPriorityDesc(a, b) {
  return b.priority - a.priority;
}

const DEFAULT_TILE_META = Object.freeze({
  roughness: 0.15,
  landFraction: 0.5,
  width: 64,
  height: 64,
});

const FACE_NAMES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
// WGS84 first-eccentricity squared, used to convert geocentric<->geodetic latitude
// so terrain maps (geodetic) align with the cubed-sphere geometry.
const WGS84_E2 = 2 / 298.257223563 - 1 / (298.257223563 * 298.257223563);

const DEG2RAD = Math.PI / 180;
// Sea surface (options.water): opacity of deep water, the depth over which it fades in from the
// coastline, and its colour before a tile's imagery has loaded.
const WATER_OPACITY = 0.12; // looking straight into it (the surface's reflection comes on top: see _createWaterMaterial)
const WATER_GRAZING_OPACITY = 0.35;
// Light scattered back out of deep, clear water (linear reflectance; open ocean sends back mostly blue),
// reached over the first WATER_BODY_DEPTH metres. The imagery's ocean, and the darkened sea floor seen
// through the water, are near black.
const WATER_BODY = [0.002, 0.008, 0.025];
const WATER_BODY_DEPTH = 30;
const WATER_SHALLOWS_DEPTH = 30;
// Sea ice on the ground fades out over this height above sea level (m; see _configureSeafloor).
const SEA_ICE_SHORE_HEIGHT = 40;
const WATER_FALLBACK_COLOR = 0x0b2a3a; // (dark, like the imagery's ocean, so it is not taken for land)
// Imagery luminance (linear) over which a pixel counts as land rather than sea (fade between the two).
const WATER_LAND_LUMINANCE = ['0.06', '0.18'];
// The underside of the sea as seen from above it (through the water, near the horizon): deep water.
const WATER_UNDERSIDE_FROM_ABOVE = [0.015, 0.035, 0.06];
// From far away the sun's glint off the sea is one generic sunspot (see _createWaterMaterial): from
// GLINT_FAR[0] to GLINT_FAR[1] (m) it becomes a glint off the level surface as rough as
// GLINT_FAR_SLOPE_VARIANCE (Cox and Munk's mean square slope for a 6 m/s wind, plus the swell).
const GLINT_FAR = [20000, 100000];
// The sea's reflection of a thick overcast's base, as a share of the brightness of the sky it reflects.
const SEA_CLOUD_BASE = 0.55;
const GLINT_FAR_SLOPE_VARIANCE = 0.035;
// Sea floor seen from under the surface (linear RGB), and the depth over which it replaces the imagery.
const SEAFLOOR_COLOR = [0.30, 0.28, 0.22];
const SEAFLOOR_BLEND_DEPTH = 20;

// Fractal noise on the sea floor: octave frequencies (1/m) and the contrast it adds.
const SEAFLOOR_FREQS = [1 / 1600, 1 / 400, 1 / 100, 1 / 25];
const SEAFLOOR_CONTRAST = 0.45;

// -----------------------------------------------------------------------------
// Small math / utility helpers
// -----------------------------------------------------------------------------

// Clamps a scalar into the inclusive range [0, 1].
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Returns a smooth Hermite interpolation in [0,1] across [min,max].
function smoothstep(min, max, v) {
  const t = clamp01((v - min) / (max - min));
  return t * t * (3 - 2 * t);
}

// Maps a normalized value to a debug-friendly heatmap color (blue -> red).
function colorRamp01(v, out) {
  return out.setHSL((1 - clamp01(v)) * 0.66, 1, 0.5);
}

// Builds a stable quadtree tile key in face/lod/x/y format.
function tileKey(face, lod, x, y) {
  return `${face}/${lod}/${x}/${y}`;
}

// Converts cube-face local coordinates (u,v in [-1,1]) into a normalized world
// direction. MUST stay identical to the offline generator's cube_to_direction.
function cubeToDirection(face, u, v, out) {
  switch (face) {
    case '+X': out.set(1, v, -u); break;
    case '-X': out.set(-1, v, u); break;
    case '+Y': out.set(u, 1, -v); break;
    case '-Y': out.set(u, -1, v); break;
    case '+Z': out.set(u, v, 1); break;
    case '-Z': out.set(-u, v, -1); break;
    default: out.set(0, 1, 0); break;
  }
  return out.normalize();
}

// Inverse of cubeToDirection: maps a world direction to its owning cube face and
// the (u,v) in [-1,1] on that face. The owning face is the dominant |component|;
// the per-face (u,v) formulas exactly invert cubeToDirection. Writes into `out`
// ({face,u,v}) to avoid allocation and returns it.
function directionToFaceUV(dir, out) {
  const x = dir.x, y = dir.y, z = dir.z;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) {
    if (x > 0) { out.face = '+X'; out.u = -z / x; out.v = y / x; }
    else       { out.face = '-X'; out.u = -z / x; out.v = -y / x; }
  } else if (ay >= ax && ay >= az) {
    if (y > 0) { out.face = '+Y'; out.u = x / y; out.v = -z / y; }
    else       { out.face = '-Y'; out.u = -x / y; out.v = -z / y; }
  } else {
    if (z > 0) { out.face = '+Z'; out.u = x / z; out.v = y / z; }
    else       { out.face = '-Z'; out.u = x / z; out.v = -y / z; }
  }
  return out;
}

// The (u,v) of a direction on a given cube face (the same formulas as directionToFaceUV, without
// choosing the face): for points on a tile's edge, which lie on two faces at a cube seam.
function directionToUVOnFace(dir, face, out) {
  const x = dir.x, y = dir.y, z = dir.z;
  switch (face) {
    case '+X': case '-X': out.u = -z / x; out.v = face === '+X' ? y / x : -y / x; break;
    case '+Y': case '-Y': out.u = face === '+Y' ? x / y : -x / y; out.v = -z / y; break;
    default: out.u = x / z; out.v = face === '+Z' ? y / z : -y / z; break;
  }
  out.face = face;
  return out;
}

// Intersects a ray from the ellipsoid center along `direction` with an oblate
// ellipsoid aligned to the Y (polar) axis. Reduces cleanly to a sphere when a==b.
function rayEllipsoidIntersection(direction, a, b, out) {
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  const denom = (dx * dx + dz * dz) / (a * a) + (dy * dy) / (b * b);
  const t = 1.0 / Math.sqrt(denom);
  return out.copy(direction).multiplyScalar(t);
}

// Computes the outward surface normal for an axis-aligned ellipsoid at `point`.
function ellipsoidNormal(point, a, b, out) {
  out.set(point.x / (a * a), point.y / (b * b), point.z / (a * a));
  return out.normalize();
}

// Converts a geographic (geodetic) lat/lon (radians) into the local ellipsoid-frame
// unit direction. Source maps are indexed by geodetic latitude, so convert geodetic
// -> geocentric before building the direction (tan(geocentric) = (1-e2)*tan(geodetic)).
function latLonToDirection(lat, lon, out, eccentricitySquared = WGS84_E2) {
  const geoc = Math.atan2((1 - eccentricitySquared) * Math.sin(lat), Math.cos(lat));
  const cl = Math.cos(geoc);
  return out.set(cl * Math.cos(lon), Math.sin(geoc), -cl * Math.sin(lon)).normalize();
}

// Decodes a Uint16 sample into meters using tile min/max height bounds.
function decodeHeightU16(sample, minMeters, maxMeters) {
  return minMeters + (sample / 65535) * (maxMeters - minMeters);
}


// -----------------------------------------------------------------------------
// IndexBufferCache - shared CPU-side triangle index arrays.
//
// Each call returns a FRESH THREE.BufferAttribute backed by a cached typed array.
// A geometry must own its own index BufferAttribute: BufferGeometry.dispose()
// frees the GPU buffer of every attribute it references, so a shared index
// attribute would be destroyed the moment any single tile is disposed/rebuilt,
// corrupting the index buffers of all other tiles that reference it.
//
// Two windings are provided ('fwd' and 'rev') so a tile can pick whichever makes
// its front faces point outward, avoiding backface-culled holes across faces
// whose (u,v) parameterization has opposite handedness.
// -----------------------------------------------------------------------------

class IndexBufferCache {
  constructor() {
    this.cache = new Map();
  }

  getGridIndexArray(segments, reversed) {
    return this._getArray(segments, reversed);
  }

  getIndexAttribute(segments, reversed) {
    const array = this._getArray(segments, reversed);
    return new THREE.BufferAttribute(array, 1);
  }

  _getArray(segments, reversed) {
    const key = `${segments}:${reversed ? 'rev' : 'fwd'}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const vertexCount = (segments + 1) * (segments + 1);
    const tri = [];
    const push = reversed
      ? (a, b, c) => tri.push(a, c, b)
      : (a, b, c) => tri.push(a, b, c);

    // Interior grid.
    for (let y = 0; y < segments; y++) {
      for (let x = 0; x < segments; x++) {
        const a = y * (segments + 1) + x;
        const b = a + 1;
        const c = a + (segments + 1);
        const d = c + 1;
        push(a, b, c);
        push(b, d, c);
      }
    }

    const array = vertexCount > 65535 ? new Uint32Array(tri) : new Uint16Array(tri);
    this.cache.set(key, array);
    return array;
  }
}

// -----------------------------------------------------------------------------
// Tile - per-node quadtree runtime state.
// -----------------------------------------------------------------------------

class Tile {
  constructor(face, lod, x, y, parent = null) {
    this.face = face;
    this.faceIndex = FACE_INDEX[face];
    this.lod = lod;
    this.x = x;
    this.y = y;
    this.id = tileKey(face, lod, x, y);
    this.numKey = tileNumKey(this.faceIndex, lod, x, y);
    this.parent = parent;
    this.children = null;
    // Set once the tile has been evicted/disposed. A disposed tile must never be
    // drawn, linked into the tree, or receive data from an in-flight load.
    this.disposed = false;

    this.mesh = null;
    this.material = null;
    this.geometry = null;

    this.visible = false;
    this.visibleFrame = -1;
    this.wantedFrame = -1;
    this.colorReady = false;
    this.heightReady = false;
    this.uploaded = true;   // false from when a load starts until its data is on the GPU
    this.loading = false;

    this.loadGeneration = 0;
    this.abortController = null;
    this.queuedAtMs = 0;
    this.loadStartedAtMs = 0;
    this.debugSourceKey = 'base';
    // Bounded retry bookkeeping: a transient color/height failure leaves the tile
    // un-ready so it is wanted again (after a backoff delay) up to maxLoadAttempts,
    // instead of permanently showing the flat fallback material. A stream that
    // already succeeded is kept and not fetched again.
    this.loadAttempts = 0;
    this.retryScheduled = false;
    this.retryTimer = null;
    this.texture = null;
    this.heightSamples = null;
    this.heightWidth = 0;
    this.heightHeight = 0;
    this.minHeightMeters = 0;
    this.maxHeightMeters = 0;

    this.estimatedBytes = 0;
    this.priority = 0;
    this.lastUsedFrame = 0;
    this.refinementActive = false;

    this.meta = null;
    // Caches keyed on the renderer's manifestVersion.
    this.cacheVersion = -1;
    this.hasChildAssets = false;
    this.boost = 1;

    // Per-edge coarse-neighbor step [T,B,L,R]. 1 = same/finer (no morph); 2^d = the
    // neighbor is d LODs coarser, so collapse all but every (2^d)th boundary vertex.
    this.edgeSteps = [1, 1, 1, 1];
    // The coarser visible neighbour across each edge (where edgeSteps > 1), whose heights the edge takes.
    this.edgeNeighbors = [null, null, null, null];
    // The coarser drawn tiles this tile's boundary takes its positions from (edges T, B, L, R, then corners TL, TR,
    // BL, BR; see _updateEdgeMorph), the key they were taken with, and a count of this tile's geometry rebuilds.
    this.boundarySources = null;
    this.boundaryKey = '';
    this.geometryVersion = 0;

    // Cached geometric bounds (planet-local space). `center` is also the tile
    // mesh's position: vertices are stored relative to it.
    this.center = new THREE.Vector3();
    this.centerDir = new THREE.Vector3(0, 1, 0);
    this.centerNormal = new THREE.Vector3(0, 1, 0);
    this.worldCenter = new THREE.Vector3();
    this.boundingRadius = 1;
    this.angularRadius = 0;
    this.boundsValid = false;

    // Per-frequency surface-detail noise offsets (only with surfaceDetail).
    this.detailOffsets = null;

    // Generated ground (see GROUND_MAX_LOD): `ground` is the region's GroundData for a generated tile (null for a
    // baked one), `colorTile` the baked ancestor whose imagery it shows. Its heights are heightGrid, (segments + 3)^2
    // samples: the vertices and a ring of one more around them (for the normals at its edges).
    this.ground = null;
    this.colorTile = null;
    this.heightGrid = null;
    // The height (m) the ground is near around the tile, for its bounds and its distance from the camera.
    this.refHeight = 0;
  }

  // A tile is "loaded" once both its color and height streams have resolved, and "ready" (drawn) once
  // it has also been uploaded to the GPU (CubedSpherePlanetRenderer._uploadTiles).
  get loaded() {
    return this.colorReady && this.heightReady;
  }

  get ready() {
    return this.colorReady && this.heightReady && this.uploaded;
  }
}

// -----------------------------------------------------------------------------
// CubedSpherePlanetRenderer - the quadtree selector / streamer / renderer core.
// -----------------------------------------------------------------------------

export class CubedSpherePlanetRenderer {
  /**
   * @param {object} options
   * @param {THREE.Group} options.group  Group that receives the tile meshes.
   * @param {THREE.WebGLRenderer} [options.renderer]  Used for KTX2 support
   *   detection and the drawing-buffer height for screen-space error.
   * @param {object} options.planetSpec  Needs `ellipsoid: { a, f }`.
   * @param {Array<{name, manifestUrl, colorBasePath, heightBasePath}>} [options.assets]
   *   Ordered asset stack (first = base, later = overlays). Empty = no streaming,
   *   flat-colour procedural sphere.
   * See Planet.js for the remaining (camelCase) options.
   */
  constructor(options) {
    this.group = options.group;
    this.renderer = options.renderer || null;
    this.planetSpec = options.planetSpec;
    const flattening = this.planetSpec?.ellipsoid?.f || 0;
    this.planetE2 = 2 * flattening - flattening * flattening;

    this.assets = Array.isArray(options.assets) ? options.assets.filter((a) => a && a.manifestUrl) : [];
    this.hasAssets = this.assets.length > 0;
    const baseAsset = this.assets[0] || null;
    this.manifestUrl = baseAsset?.manifestUrl ?? null;
    this.colorBasePath = baseAsset?.colorBasePath ?? null;
    this.heightBasePath = baseAsset?.heightBasePath ?? null;
    // Assets after the first one are overlaid in order, each using its own
    // manifest and tile folders.
    this.overlays = this.assets.slice(1);
    // The assets whose manifests loaded, as { name, attribution } (from the manifest, if it has one),
    // reported to options.onAssetsLoaded once all have been tried. An asset that is not on this machine
    // (or is still a Git LFS pointer, not pulled) is skipped: the tiles below it are used instead.
    this.loadedAssets = [];
    this.onAssetsLoaded = options.onAssetsLoaded ?? null;
    // The assets whose tiles are on screen (names, sorted), reported to options.onVisibleAssets whenever
    // they change, so that each source's credit is shown while its imagery is.
    this.onVisibleAssets = options.onVisibleAssets ?? null;
    this._visibleAssetsKey = null;

    this.enabled = true;
    this.segments = Math.max(2, options.tileSegments ?? 24);
    this.maxConcurrentLoads = Math.max(1, options.maxConcurrentTileLoads ?? 8);
    // How many times a tile whose color/height stream errors out is retried
    // before we give up and accept the flat fallback (avoids infinite spin on a
    // genuinely missing/broken tile while surviving transient failures such as
    // net::ERR_NETWORK_CHANGED, which can knock out every in-flight request for a
    // second or two). Retries use exponential backoff so we don't hammer the
    // network during an outage and burn every attempt within a few frames.
    this.maxLoadAttempts = Math.max(1, options.maxLoadAttempts ?? 6);
    this.retryBaseDelayMs = Math.max(1, options.retryBaseDelayMs ?? 200);
    this.retryMaxDelayMs = Math.max(this.retryBaseDelayMs, options.retryMaxDelayMs ?? 4000);
    this.maxTileCount = options.maxCachedTiles ?? 320;
    this.maxGpuBytes = options.maxTileGpuBytes ?? 700 * 1024 * 1024;
    this.rootLod = 0;
    // Without assets the sphere is still refined geometrically (flat colour) so
    // the silhouette stays smooth close up.
    this.maxAvailableLod = options.maxAvailableTileLod ?? 6;

    // Screen-space-error refine threshold, in pixels, with hysteresis so tiles
    // do not flicker between expand/collapse at the boundary.
    this.sseThreshold = options.tileSseThreshold ?? 1.5;
    // Colour tile resolution (texels per side) assumed when choosing LOD before a tile has loaded.
    this.tileTextureSize = options.tileTextureSize ?? 256;
    this.hysteresisExpand = 1.25;
    this.hysteresisCollapse = 0.75;

    // Throttle high-LOD refinement while the camera moves quickly.
    this.fastCameraSpeed = options.fastCameraSpeed ?? Infinity;
    this.maxLodWhileFast = options.maxLodWhileFast ?? Infinity;
    // The deepest LOD to use (for comparing levels; Infinity = as deep as the assets go).
    this.lodCap = Infinity;

    this.requireKtx2 = options.requireKtx2 === true;
    this.receiveSurfaceShadows = options.receiveSurfaceShadows === true;
    // A sea surface at sea level over terrain below it (planets with oceans; see _buildWaterGeometry).
    this.hasWater = options.water === true;
    this.waterVisible = true;
    this.seaLite = false; // the sea's lighter shader (SEA_LITE, seaWaves.js), for the lighter graphics qualities
    // 0..1: how strongly ground below sea level is drawn as sea floor (see _configureSeafloor). Set
    // while the camera is under the sea surface; shared by every tile material.
    this.seafloorView = { value: 0 };
    this.textureAnisotropy = Math.max(1, options.textureAnisotropy ?? 4);
    this.displacementScaleMultiplier = Math.max(0, options.displacementScaleMultiplier ?? 1);
    // Startup tracing (console logs, resource-timing scans and the ASCII chart)
    // is debugging aid only and costs time per tile, so it is opt-in.
    this.traceEnabled = options.startupChart === true;
    this.surfaceDetail = options.surfaceDetail?.enabled ? {
      nearMeters: options.surfaceDetail.nearMeters ?? 1500,
      farMeters: options.surfaceDetail.farMeters ?? 90000,
      normalStrength: options.surfaceDetail.normalStrength ?? 0.7,
      albedoStrength: options.surfaceDetail.albedoStrength ?? 0.16,
      roughnessStrength: options.surfaceDetail.roughnessStrength ?? 0.12,
    } : null;

    // Regions of generated ground (GroundData objects; groundData.js).
    this.groundData = options.groundData ?? [];
    // Their data on the GPU, for the tiles' look (groundTextures.js).
    this.groundTextures = new Map(this.groundData.map((g) => [g, new GroundTextures(g)]));
    for (const g of this.groundData) g.ready.then((ok) => { if (ok) this.manifestVersion++; });
    this.groundMaxLod = GROUND_MAX_LOD;
    // The generated ground's look (groundDetail.js) on generated tiles (?groundDetail=0 for their shape alone).
    this.groundShading = options.groundShading ?? true;
    this.groundDebug = Number(new URLSearchParams(globalThis.location?.search ?? '').get('groundDebug') ?? 0);

    this.locationInterests = (options.locationInterests || []).map((loc) => {
      const dir = latLonToDirection(
        loc.lat * DEG2RAD, loc.lon * DEG2RAD, new THREE.Vector3(), this.planetE2);
      return { ...loc, dir, lodBoost: loc.lodBoost ?? 1, radiusKm: loc.radiusKm ?? 80 };
    });

    // Ellipsoid (Y is the polar axis). b = a * (1 - f); f == 0 => sphere.
    this.a = this.planetSpec.ellipsoid.a;
    this.b = this.a * (1 - (this.planetSpec.ellipsoid.f || 0));
    this.meanRadius = (2 * this.a + this.b) / 3;

    // Caches and scheduling.
    this.indexBufferCache = new IndexBufferCache();
    // Tiles that want a load this frame, with priorities computed this frame.
    // Rebuilt every update, so stale priorities and no-longer-wanted tiles
    // never get loaded ahead of what the camera currently needs.
    this.wantedTiles = [];
    this._uploadQueue = [];   // loaded tiles waiting for their GPU upload (_uploadTiles)
    this.inflightLoads = 0;

    this.tiles = new Map(); // numKey -> Tile
    this.visibleList = [];
    this._evictCandidates = [];
    this._evictStack = [];

    this.frame = 0;
    this.lastTimeSec = performance.now() * 0.001;
    this.lastCameraPos = new THREE.Vector3();
    this.hasLastCameraPos = false;
    this.cameraSpeedMps = 0;

    // Debug.
    this.debugMode = 'none';
    this.debugStats = {
      queue: 0, inflight: 0, loadedTiles: 0, visibleTiles: 0,
      gpuBytes: 0, evictedTiles: 0, droppedLoads: 0,
      loadStarted: 0, loadFinished: 0, loadSucceeded: 0, loadSuperseded: 0, loadFailed: 0, loadRetries: 0,
      colorFetchMs: 0, colorDecodeUploadMs: 0, heightFetchMs: 0, heightPostFetchMs: 0,
      colorTransferBytes: 0, heightTransferBytes: 0,
      maxColorFetchMs: 0, maxColorDecodeUploadMs: 0, maxHeightFetchMs: 0, maxHeightPostFetchMs: 0,
      maxQueue: 0, maxInflight: 0, maxLoadedTiles: 0, maxVisibleTiles: 0,
      overlayManifests: 0, overlayTilesMerged: 0, overlayTilesSkipped: 0,
      overlayManifestMs: 0, overlayMergeMs: 0,
      startupTrace: {
        t0Ms: performance.now(),
        firstUpdateMs: null,
        firstEnqueueMs: null,
        firstLoadStartedMs: null,
        firstLoadFinishedMs: null,
        firstVisibleReadyMs: null,
        manifestReadyMs: null,
        firstUpdateTileCount: null,
        firstEnqueueTileId: null,
        firstLoadTileId: null,
        firstFinishedTileId: null,
        firstVisibleReadyTileId: null,
        lastEventMs: null,
        chartPrinted: false,
        idleFrames: 0,
        manifestFetchStartMs: null,
        manifestFetchEndMs: null,
      },
      sourceStats: {},
    };

    // Reusable temporaries (avoid per-frame allocation).
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.worldSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this._groupInverse = new THREE.Matrix4();
    this._camWorld = new THREE.Vector3();
    this._camLocal = new THREE.Vector3();
    this._camDirLocal = new THREE.Vector3(0, 1, 0);
    this._camDistLocal = 0;
    this._groupScale = 1;
    this._horizonAngle = Math.PI;
    this._peakAngle = 0;
    this._sseScale = 1;
    this._tmpDir = new THREE.Vector3();
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._tmpMorphDir = new THREE.Vector3();
    this._tmpFaceUV = { face: '+X', u: 0, v: 0 };
    this._tmpNearUV = { face: '+X', u: 0, v: 0 };
    this._tmpPointDir = new THREE.Vector3();
    this._tmpPointNormal = new THREE.Vector3();
    this._tmpNormalA = new THREE.Vector3();
    this._tmpNormalB = new THREE.Vector3();
    this._tmpNormalC = new THREE.Vector3();
    this._tmpNormalD = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector2();
    this._tmpLatLon = { lat: 0, lon: 0 };
    this._tmpCover = new Float32Array(COVER_COUNT);
    this._tmpRefPoint = new THREE.Vector3();
    this._tmpColor = new THREE.Color();

    // Shared base material; per-tile clones receive the streamed color map.
    // Material.copy carries side/transparent/opacity/depthWrite, so settings
    // applied to the base material reach every future tile.
    this.baseMaterial = new THREE.MeshStandardMaterial({
      color: options.surfaceColor ?? 0x8aa7c2,
      roughness: 1,
      metalness: 0,
      side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.opacity = 1;

    this.manifest = null;
    this.manifestTileMap = new Map();
    // Bumped whenever manifest data changes, invalidating per-tile caches.
    this.manifestVersion = 0;
    // Maps a tile key to the asset layer that owns it (color/height base paths).
    // Only overlay-provided tiles are stored; base tiles fall back to
    // this.colorBasePath / this.heightBasePath, so this stays empty when no
    // overlays are active.
    this.tileSourceMap = new Map();
    // Loads are gated until the manifest resolves so every tile reads its real
    // dimensions/meta (roots are built synchronously before the async fetch).
    this.manifestReady = !this.hasAssets;
    // Global height decode range (meters). All height tiles share one range, so it
    // lives at the top of the manifest rather than being repeated per tile.
    this.heightMinMeters = this.hasAssets ? -200 : 0;
    this.heightMaxMeters = this.hasAssets ? 8500 : 0;
    this.startupTimeline = new Map();
    this.startupManifestEvents = [];
    this.selectionRoots = [];
    this.selectionRootIds = new Set();

    this.ktx2Loader = this.hasAssets ? CubedSpherePlanetRenderer._getSharedKTX2Loader(this.renderer) : null;

    if (options.opacity != null) this.setOpacity(options.opacity);
    this._initRoots();
    this.manifestLoaded = this.hasAssets ? this._loadManifest() : Promise.resolve();
    if (options.debugMode && options.debugMode !== 'none') this.setDebugMode(options.debugMode);
  }

  // Records the first occurrence of a startup milestone (cheap; logs only when
  // tracing is enabled).
  _traceFirst(key, tile = null, tileIdKey = null) {
    const trace = this.debugStats.startupTrace;
    if (trace[key] != null) return;
    const elapsedMs = performance.now() - trace.t0Ms;
    trace[key] = elapsedMs;
    if (tile && tileIdKey) trace[tileIdKey] = tile.id;
    if (this.traceEnabled) {
      console.log(`[planet] [startup] ${key} +${elapsedMs.toFixed(1)}ms${tile ? ` tile=${tile.id}` : ''}`);
    }
  }

  _recordStartupTileEvent(tile, kind, elapsedMs = null) {
    if (!this.traceEnabled) return;
    if (!tile || tile.lod == null || tile.lod > 1) return;
    const trace = this.debugStats.startupTrace;
    const ts = elapsedMs != null ? elapsedMs : (performance.now() - trace.t0Ms);

    const key = tile.id;
    let entry = this.startupTimeline.get(key);
    if (!entry) {
      entry = {
        tile,
        events: [],
        seen: new Set(),
      };
      this.startupTimeline.set(key, entry);
    }
    if (entry.seen.has(kind)) return;
    entry.seen.add(kind);
    entry.events.push({ kind, ms: ts });
    trace.lastEventMs = ts;
  }

  _recordStartupManifestEvent(kind, elapsedMs = null) {
    if (!this.traceEnabled) return;
    const trace = this.debugStats.startupTrace;
    const ts = elapsedMs != null ? elapsedMs : (performance.now() - trace.t0Ms);
    this.startupManifestEvents.push({ kind, ms: ts });
    trace.lastEventMs = ts;
  }

  // Creates / returns a single shared KTX2 loader and runs detectSupport once.
  static _getSharedKTX2Loader(renderer) {
    if (!CubedSpherePlanetRenderer._sharedLoader) {
      const base = import.meta.env?.BASE_URL ?? '/';
      CubedSpherePlanetRenderer._sharedLoader = new KTX2Loader().setTranscoderPath(`${base}basis/`);
    }
    if (renderer && !CubedSpherePlanetRenderer._supportDetected) {
      const loader = CubedSpherePlanetRenderer._sharedLoader;
      loader.detectSupport(renderer);
      // Prefer BC7 to ASTC where both are offered: desktop GPUs that report ASTC may not have it in
      // hardware (Intel from Gen12/Xe on), and the driver then decompresses each ASTC texture on
      // upload (40-150 ms for a 2048 px enhancement tile). BC7 is native wherever it is reported;
      // phones and tablets, which lack it, keep ASTC.
      if (loader.workerConfig?.bptcSupported) loader.workerConfig.astcSupported = false;
      CubedSpherePlanetRenderer._supportDetected = true;
    } else if (!renderer && !CubedSpherePlanetRenderer._supportDetected) {
      console.warn('[planet] renderer missing; KTX2 detectSupport(renderer) deferred.');
    }
    return CubedSpherePlanetRenderer._sharedLoader;
  }

  // ---------------------------------------------------------------------------
  // Manifest + roots
  // ---------------------------------------------------------------------------

  async _loadManifest() {
    const trace = this.debugStats.startupTrace;
    try {
      trace.manifestFetchStartMs = performance.now() - trace.t0Ms;
      this._recordStartupManifestEvent('manifestFetch', trace.manifestFetchStartMs);
      // Tiles and manifests are immutable build outputs: use normal HTTP caching.
      const response = await fetch(this.manifestUrl);
      if (!response.ok) throw new Error(`manifest fetch ${response.status}`);
      this.manifest = await response.json();
      this.loadedAssets.push({ name: this.assets[0].name, attribution: this.manifest.attribution ?? null });
      this.maxAvailableLod = this.manifest.maxAvailableLod ?? this.maxAvailableLod;
      this.heightMinMeters = this.manifest.minHeight ?? this.heightMinMeters;
      this.heightMaxMeters = this.manifest.maxHeight ?? this.heightMaxMeters;
      if (this.manifest.tiles) {
        for (const [k, v] of Object.entries(this.manifest.tiles)) {
          this.manifestTileMap.set(k, v);
        }
      }
      // Merge any overlay layers on top of the base. Overlay tiles override the
      // base tile at the same key and remember which folder to stream from.
      await this._loadOverlays();
      this._rebuildSelectionRoots();
    } catch (error) {
      console.warn('[planet] manifest load failed, using defaults', error);
    } finally {
      // Tiles created before the manifest arrived (the six roots, built
      // synchronously in the constructor) cached the default meta. Refresh them
      // now so their real width/height (e.g. 128) is used for size validation.
      this.manifestVersion += 1;
      for (const tile of this.tiles.values()) {
        tile.meta = this._getTileMeta(tile);
      }
      // Allow tile loads to proceed. On failure we run with default meta rather
      // than stalling the globe forever.
      trace.manifestFetchEndMs = performance.now() - trace.t0Ms;
      this._recordStartupManifestEvent('manifestReady', trace.manifestFetchEndMs);
      this.manifestReady = true;
      this.onAssetsLoaded?.(this.loadedAssets);
      this._traceFirst('manifestReadyMs');
    }
  }

  // Fetch each overlay manifest and merge its tiles over the base. An overlay
  // entry wins over a same-key base entry, extends maxAvailableLod, and records
  // its color/height folders in tileSourceMap so _loadColor/_loadHeight stream
  // the overriding tiles from the overlay instead of the base asset root.
  async _loadOverlays() {
    for (let overlayIndex = 0; overlayIndex < this.overlays.length; overlayIndex++) {
      const overlay = this.overlays[overlayIndex];
      const sourceStats = this._getSourceStats(overlay.name);
      try {
        const overlayFetchStartMs = performance.now() - this.debugStats.startupTrace.t0Ms;
        this._recordStartupManifestEvent('overlayFetch', overlayFetchStartMs);
        const response = await fetch(overlay.manifestUrl);
        const manifestStart = performance.now();
        // Not on this machine (a 404, or the dev server's page instead), or not pulled from Git LFS (a
        // pointer file): fall back to the tiles below.
        const data = response.ok ? await response.json().catch(() => null) : null;
        if (!data || typeof data !== 'object') {
          console.info(`[planet] "${overlay.name}" is not on this machine (or not pulled from Git LFS): ` +
            'using the tiles below it');
          continue;
        }
        const manifestMs = performance.now() - manifestStart;

        // Overlays must share the base height decode range: all height tiles are
        // sampled into one global [minHeight, maxHeight] u16 space, so a mismatch
        // would misdecode the overlay's displacement. Warn rather than silently
        // corrupt the terrain.
        const oMin = data.minHeight;
        const oMax = data.maxHeight;
        if ((oMin != null && oMin !== this.heightMinMeters) ||
            (oMax != null && oMax !== this.heightMaxMeters)) {
          console.warn(`[planet] overlay "${overlay.name}" height range ` +
            `[${oMin}, ${oMax}] differs from base [${this.heightMinMeters}, ` +
            `${this.heightMaxMeters}]; terrain may not match at the seam.`);
        }

        if (data.maxAvailableLod != null) {
          this.maxAvailableLod = Math.max(this.maxAvailableLod, data.maxAvailableLod);
        }
        this.loadedAssets.push({ name: overlay.name, attribution: data.attribution ?? null });

        const source = {
          name: overlay.name,
          colorBasePath: overlay.colorBasePath,
          heightBasePath: overlay.heightBasePath,
          layerIndex: overlayIndex + 1,
        };
        let count = 0;
        const mergeStart = performance.now();
        if (data.tiles) {
          // An overlay's tiles above overlayMinLod are left out where the base has its own, so from
          // further out the globe is the base's one unbroken dataset. The base is complete through
          // BASE_FULL_COVERAGE_LOD, so an overlay's tiles there would only replace the base's imagery over
          // a large area (a quarter of a cube face at LOD 1) with its own: older bakes include such a chain
          // of tiles down to their area (tools/adaptive_lod.py now leaves them out). A base set can name a
          // deeper level in its manifest (assets/earth_hires: the level its regional areas are covered to,
          // plus one; see tools/earth_hires.py).
          const overlayMinLod = this.manifest?.overlayMinLod ?? BASE_FULL_COVERAGE_LOD + 1;
          for (const [k, v] of Object.entries(data.tiles)) {
            const lod = Number(k.split('/')[1]);
            if (lod < overlayMinLod && this.manifestTileMap.has(k) && !this.tileSourceMap.has(k)) continue;
            this.manifestTileMap.set(k, v);
            this.tileSourceMap.set(k, source);
            count += 1;
          }
        }
        const mergeMs = performance.now() - mergeStart;
        this._recordStartupManifestEvent('overlayReady', performance.now() - this.debugStats.startupTrace.t0Ms);
        this.debugStats.overlayManifests += 1;
        this.debugStats.overlayTilesMerged += count;
        this.debugStats.overlayManifestMs += manifestMs;
        this.debugStats.overlayMergeMs += mergeMs;
        sourceStats.manifestTilesMerged += count;
        sourceStats.manifestFetchMs += manifestMs;
        sourceStats.manifestMergeMs += mergeMs;
        if (this.traceEnabled) {
          console.log(`[planet] overlay "${overlay.name}" merged ${count} tiles in ` +
            `${manifestMs.toFixed(1)}ms fetch + ${mergeMs.toFixed(1)}ms merge`);
        }
      } catch (error) {
        console.warn(`[planet] overlay "${overlay.name}" load failed, skipping`, error);
      }
    }
  }

  _flushStartupChartIfReady() {
    if (!this.traceEnabled) return;
    const trace = this.debugStats.startupTrace;
    if (trace.chartPrinted) return;
    if (trace.firstVisibleReadyMs == null) return;
    const nowMs = performance.now() - trace.t0Ms;
    const quietMs = trace.lastEventMs != null ? nowMs - trace.lastEventMs : 0;
    if (quietMs < 2000) return;
    trace.chartPrinted = true;
    console.log(this._renderStartupChart());
  }

  _renderStartupChart() {
    const rows = [];
    for (const entry of this.startupTimeline.values()) {
      if (!entry.tile || entry.tile.lod == null || entry.tile.lod > 1 || entry.events.length === 0) continue;
      rows.push(entry);
    }
    rows.sort((a, b) => {
      const ta = a.tile;
      const tb = b.tile;
      if (!ta && !tb) return 0;
      if (!ta) return -1;
      if (!tb) return 1;
      if (ta.lod !== tb.lod) return ta.lod - tb.lod;
      const faceA = FACE_NAMES.indexOf(ta.face);
      const faceB = FACE_NAMES.indexOf(tb.face);
      if (faceA !== faceB) return faceA - faceB;
      if (ta.x !== tb.x) return ta.x - tb.x;
      return ta.y - tb.y;
    });

    const trace = this.debugStats.startupTrace;
    const maxMs = Math.max(
      trace.lastEventMs ?? 0,
      trace.firstVisibleReadyMs ?? 0,
      trace.firstLoadFinishedMs ?? 0,
      trace.firstLoadStartedMs ?? 0,
      trace.firstEnqueueMs ?? 0,
      trace.manifestReadyMs ?? 0,
      trace.firstUpdateMs ?? 0,
    );
    const focusMs = Math.max(
      15000,
      (trace.firstVisibleReadyMs ?? 0) + 5000,
      (trace.firstLoadFinishedMs ?? 0) + 2000,
    );
    const chartMs = Math.min(maxMs, focusMs);
    const width = 168;
    const labelWidth = 15;
    const scaleMsPerCol = chartMs > 0 ? chartMs / (width - 1) : 1;
    const scale = chartMs > 0 ? (width - 1) / chartMs : 1;
    const tickEveryMs = chartMs > 0 ? 1000 : 1;
    const chartPrefix = `${''.padEnd(labelWidth-7)} `;

    const tickLine = new Array(width).fill('.');
    const labelLine = new Array(width).fill(' ');
    for (let ms = 0; ms <= chartMs; ms += tickEveryMs) {
      const col = Math.min(width - 1, Math.round(ms * scale));
      tickLine[col] = '|';
      const label = String(Math.round(ms / 1000));
      for (let i = 0; i < label.length && col + i < width; i += 1) {
        labelLine[col + i] = label[i];
      }
    }

    const eventChar = {
      enqueue: 'q',
      start: 's',
      colorFetch: 'c',
      colorDone: 'C',
      heightFetch: 'h',
      heightDone: 'H',
      apply: 'a',
      visible: 'v',
      manifestFetch: 'm',
      manifestReady: 'M',
      overlayFetch: 'o',
      overlayReady: 'O',
    };
    const eventCounts = {
      enqueue: 0, start: 0, colorFetch: 0, colorDone: 0, heightFetch: 0, heightDone: 0,
      apply: 0, visible: 0, manifestFetch: 0, manifestReady: 0, overlayFetch: 0, overlayReady: 0,
    };
    for (const entry of rows) {
      for (const ev of entry.events) {
        if (eventCounts[ev.kind] != null) eventCounts[ev.kind] += 1;
      }
    }

    const renderRows = [];
    if (this.startupManifestEvents.length > 0) {
      renderRows.push({
        label: `${'MANIFEST'.padEnd(labelWidth - 1)}M`,
        events: this.startupManifestEvents,
      });
    }
    for (const entry of rows) {
      const tile = entry.tile;
      const colorRowKinds = new Set(['enqueue', 'start', 'colorFetch', 'colorDone', 'apply', 'visible']);
      const heightRowKinds = new Set(['enqueue', 'start', 'heightFetch', 'heightDone', 'apply', 'visible']);
      renderRows.push({
        label: `${`LOD${tile.lod} ${tile.id}`.padEnd(labelWidth - 1)}C`,
        events: entry.events.filter((ev) => colorRowKinds.has(ev.kind)),
      });
      renderRows.push({
        label: `${`LOD${tile.lod} ${tile.id}`.padEnd(labelWidth - 1)}H`,
        events: entry.events.filter((ev) => heightRowKinds.has(ev.kind)),
      });
    }

    const lines = [];
    lines.push('legend: m=manifest-fetch  M=manifest-ready  o=overlay-fetch  O=overlay-ready  q=enqueue  s=start  c=color-fetch  C=color-done  h=height-fetch  H=height-done  a=apply  v=visible');
    lines.push(`max t = ${maxMs.toFixed(1)} ms`);
    lines.push(`chart t = ${chartMs.toFixed(1)} ms`);
    lines.push(`events: m=${eventCounts.manifestFetch} M=${eventCounts.manifestReady} o=${eventCounts.overlayFetch} O=${eventCounts.overlayReady} q=${eventCounts.enqueue} s=${eventCounts.start} c=${eventCounts.colorFetch} C=${eventCounts.colorDone} h=${eventCounts.heightFetch} H=${eventCounts.heightDone} a=${eventCounts.apply} v=${eventCounts.visible}`);
    lines.push(`${chartPrefix}t(ms)  ${labelLine.join('')}`);
    lines.push(`${chartPrefix}       ${tickLine.join('')}`);
    for (const entry of renderRows) {
      const row = new Array(width).fill('.');
      for (const ev of entry.events) {
        const col = Math.min(width - 1, Math.round(ev.ms * scale));
        const existing = row[col];
        row[col] = existing === '.' ? eventChar[ev.kind] || '?' : '*';
      }
      lines.push(`${entry.label} ${row.join('')}`);
    }
    return lines.join('\n');
  }


  _getSourceStats(sourceKey = 'base') {
    const key = sourceKey || 'base';
    let stats = this.debugStats.sourceStats[key];
    if (!stats) {
      stats = {
        loadStarted: 0,
        loadSucceeded: 0,
        loadSuperseded: 0,
        loadFailed: 0,
        loadRetries: 0,
        loadFinished: 0,
        queueWaitMs: 0,
        colorLoadMs: 0,
        heightLoadMs: 0,
        loadMs: 0,
        colorFetchMs: 0,
        colorDecodeUploadMs: 0,
        heightFetchMs: 0,
        heightPostFetchMs: 0,
        colorTransferBytes: 0,
        heightTransferBytes: 0,
        maxQueueWaitMs: 0,
        maxColorLoadMs: 0,
        maxHeightLoadMs: 0,
        maxLoadMs: 0,
        maxColorFetchMs: 0,
        maxColorDecodeUploadMs: 0,
        maxHeightFetchMs: 0,
        maxHeightPostFetchMs: 0,
        manifestTilesMerged: 0,
        manifestTilesSkipped: 0,
        manifestFetchMs: 0,
        manifestMergeMs: 0,
        evictedTiles: 0,
        byLod: {},
      };
      this.debugStats.sourceStats[key] = stats;
    }
    return stats;
  }

  _getLodStats(sourceStats, lod) {
    const key = String(lod);
    let stats = sourceStats.byLod[key];
    if (!stats) {
      stats = {
        loadStarted: 0,
        loadSucceeded: 0,
        loadSuperseded: 0,
        loadFailed: 0,
        loadRetries: 0,
        loadFinished: 0,
        queueWaitMs: 0,
        colorLoadMs: 0,
        heightLoadMs: 0,
        loadMs: 0,
        colorFetchMs: 0,
        colorDecodeUploadMs: 0,
        heightFetchMs: 0,
        heightPostFetchMs: 0,
        colorTransferBytes: 0,
        heightTransferBytes: 0,
        maxQueueWaitMs: 0,
        maxColorLoadMs: 0,
        maxHeightLoadMs: 0,
        maxLoadMs: 0,
        maxColorFetchMs: 0,
        maxColorDecodeUploadMs: 0,
        maxHeightFetchMs: 0,
        maxHeightPostFetchMs: 0,
      };
      sourceStats.byLod[key] = stats;
    }
    return stats;
  }

  _getTileSourceKey(tile) {
    return this.tileSourceMap.get(tile.id)?.name || 'base';
  }

  _recordLoadMetrics(sourceStats, lodStats, {
    queueWaitMs = 0,
    colorMs = 0,
    heightMs = 0,
    loadMs = 0,
    colorFetchMs = 0,
    heightFetchMs = 0,
    colorTransferBytes = 0,
    heightTransferBytes = 0,
    outcome = 'success',
  } = {}) {
    this.debugStats.loadFinished += 1;
    sourceStats.loadFinished += 1;
    lodStats.loadFinished += 1;

    sourceStats.queueWaitMs += queueWaitMs;
    sourceStats.colorLoadMs += colorMs;
    sourceStats.heightLoadMs += heightMs;
    sourceStats.loadMs += loadMs;
    sourceStats.colorFetchMs += colorFetchMs;
    sourceStats.heightFetchMs += heightFetchMs;
    sourceStats.colorDecodeUploadMs += Math.max(0, colorMs - colorFetchMs);
    sourceStats.heightPostFetchMs += Math.max(0, heightMs - heightFetchMs);
    sourceStats.colorTransferBytes += colorTransferBytes;
    sourceStats.heightTransferBytes += heightTransferBytes;
    sourceStats.maxQueueWaitMs = Math.max(sourceStats.maxQueueWaitMs, queueWaitMs);
    sourceStats.maxColorLoadMs = Math.max(sourceStats.maxColorLoadMs, colorMs);
    sourceStats.maxHeightLoadMs = Math.max(sourceStats.maxHeightLoadMs, heightMs);
    sourceStats.maxLoadMs = Math.max(sourceStats.maxLoadMs, loadMs);
    sourceStats.maxColorFetchMs = Math.max(sourceStats.maxColorFetchMs, colorFetchMs);
    sourceStats.maxColorDecodeUploadMs = Math.max(sourceStats.maxColorDecodeUploadMs, Math.max(0, colorMs - colorFetchMs));
    sourceStats.maxHeightFetchMs = Math.max(sourceStats.maxHeightFetchMs, heightFetchMs);
    sourceStats.maxHeightPostFetchMs = Math.max(sourceStats.maxHeightPostFetchMs, Math.max(0, heightMs - heightFetchMs));

    lodStats.queueWaitMs += queueWaitMs;
    lodStats.colorLoadMs += colorMs;
    lodStats.heightLoadMs += heightMs;
    lodStats.loadMs += loadMs;
    lodStats.colorFetchMs += colorFetchMs;
    lodStats.heightFetchMs += heightFetchMs;
    lodStats.colorDecodeUploadMs += Math.max(0, colorMs - colorFetchMs);
    lodStats.heightPostFetchMs += Math.max(0, heightMs - heightFetchMs);
    lodStats.colorTransferBytes += colorTransferBytes;
    lodStats.heightTransferBytes += heightTransferBytes;
    lodStats.maxQueueWaitMs = Math.max(lodStats.maxQueueWaitMs, queueWaitMs);
    lodStats.maxColorLoadMs = Math.max(lodStats.maxColorLoadMs, colorMs);
    lodStats.maxHeightLoadMs = Math.max(lodStats.maxHeightLoadMs, heightMs);
    lodStats.maxLoadMs = Math.max(lodStats.maxLoadMs, loadMs);
    lodStats.maxColorFetchMs = Math.max(lodStats.maxColorFetchMs, colorFetchMs);
    lodStats.maxColorDecodeUploadMs = Math.max(lodStats.maxColorDecodeUploadMs, Math.max(0, colorMs - colorFetchMs));
    lodStats.maxHeightFetchMs = Math.max(lodStats.maxHeightFetchMs, heightFetchMs);
    lodStats.maxHeightPostFetchMs = Math.max(lodStats.maxHeightPostFetchMs, Math.max(0, heightMs - heightFetchMs));

    switch (outcome) {
      case 'success':
        this.debugStats.loadSucceeded += 1;
        sourceStats.loadSucceeded += 1;
        lodStats.loadSucceeded += 1;
        break;
      case 'superseded':
        this.debugStats.loadSuperseded += 1;
        sourceStats.loadSuperseded += 1;
        lodStats.loadSuperseded += 1;
        break;
      case 'retry':
        this.debugStats.loadRetries += 1;
        sourceStats.loadRetries += 1;
        lodStats.loadRetries += 1;
        break;
      case 'failed':
        this.debugStats.loadFailed += 1;
        sourceStats.loadFailed += 1;
        lodStats.loadFailed += 1;
        break;
      default:
        break;
    }

    this.debugStats.queue = this.wantedTiles.length;
    this.debugStats.inflight = this.inflightLoads;
    this.debugStats.loadedTiles = this.tiles.size;
    this.debugStats.visibleTiles = this.visibleList.length;
    this.debugStats.colorFetchMs += colorFetchMs;
    this.debugStats.heightFetchMs += heightFetchMs;
    this.debugStats.colorDecodeUploadMs += Math.max(0, colorMs - colorFetchMs);
    this.debugStats.heightPostFetchMs += Math.max(0, heightMs - heightFetchMs);
    this.debugStats.colorTransferBytes += colorTransferBytes;
    this.debugStats.heightTransferBytes += heightTransferBytes;
    this.debugStats.maxColorFetchMs = Math.max(this.debugStats.maxColorFetchMs, colorFetchMs);
    this.debugStats.maxColorDecodeUploadMs = Math.max(this.debugStats.maxColorDecodeUploadMs, Math.max(0, colorMs - colorFetchMs));
    this.debugStats.maxHeightFetchMs = Math.max(this.debugStats.maxHeightFetchMs, heightFetchMs);
    this.debugStats.maxHeightPostFetchMs = Math.max(this.debugStats.maxHeightPostFetchMs, Math.max(0, heightMs - heightFetchMs));
  }

  _getLatestResourceTiming(url, sinceMs = 0) {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return null;
    }
    const target = new URL(url, window.location.href).href;
    let best = null;
    for (const entry of performance.getEntriesByType('resource')) {
      if (entry.name !== target) continue;
      if (entry.startTime + entry.duration < sinceMs - 1) continue;
      if (!best || entry.startTime > best.startTime) best = entry;
    }
    return best;
  }

  // Bilinear height lookup in meters at tile-local (u01, v01).
  // The terrain point (planet frame, absolute) at cube coordinates (u, v) on a tile's face, which may
  // lie beyond the tile: its height then comes from the tile there (see _heightNear).
  _terrainPointAt(tile, u, v, out) {
    const dir = this._tmpPointDir, nor = this._tmpPointNormal;
    cubeToDirection(tile.face, u, v, dir);
    rayEllipsoidIntersection(dir, this.a, this.b, out);
    ellipsoidNormal(out, this.a, this.b, nor);
    const span = 2 / Math.pow(2, tile.lod);
    const u01 = (u + 1) / span - tile.x, v01 = (v + 1) / span - tile.y;
    const eps = tile.heightGrid ? 1.0001 / this.segments : 1e-9;
    const inside = u01 >= -eps && u01 <= 1 + eps && v01 >= -eps && v01 <= 1 + eps;
    const h = inside ? this._sampleHeight(tile, u01, v01) : this._heightNear(dir, tile.lod);
    return out.addScaledVector(nor, h * this.displacementScaleMultiplier);
  }

  // The height in the direction `dir` from the loaded tile covering it at `lod`, or else its nearest
  // loaded ancestor; 0 if none is loaded.
  _heightNear(dir, lod) {
    const f = directionToFaceUV(dir, this._tmpNearUV);
    const faceIndex = FACE_INDEX[f.face];
    for (let l = lod; l >= this.rootLod; l--) {
      const count = 1 << l, span = 2 / count;
      const x = Math.min(count - 1, Math.max(0, Math.floor((f.u + 1) / span)));
      const y = Math.min(count - 1, Math.max(0, Math.floor((f.v + 1) / span)));
      const t = this._getTile(faceIndex, l, x, y);
      if (t?.heightGrid || (t?.heightSamples && t.heightWidth && t.heightHeight)) return this._sampleHeight(t, (f.u + 1) / span - x, (f.v + 1) / span - y);
    }
    return 0;
  }

  _sampleHeight(tile, u01, v01) {
    if (tile.heightGrid) {
      // A generated tile's grid: its vertices and one more ring around them.
      const seg = this.segments, G = seg + 3, grid = tile.heightGrid;
      const px = Math.min(G - 1, Math.max(0, u01 * seg + 1)), py = Math.min(G - 1, Math.max(0, v01 * seg + 1));
      const x0 = Math.min(G - 2, Math.floor(px)), y0 = Math.min(G - 2, Math.floor(py));
      const tx = px - x0, ty = py - y0, i = y0 * G + x0;
      const a = grid[i] + (grid[i + 1] - grid[i]) * tx;
      const b = grid[i + G] + (grid[i + G + 1] - grid[i + G]) * tx;
      return a + (b - a) * ty;
    }
    const samples = tile.heightSamples;
    if (!samples) return 0;
    const w = tile.heightWidth;
    const h = tile.heightHeight;
    if (!w || !h) return 0;

    const px = clamp01(u01) * (w - 1);
    const py = clamp01(v01) * (h - 1);
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = px - x0;
    const ty = py - y0;

    const min = tile.minHeightMeters;
    const max = tile.maxHeightMeters;
    const h00 = decodeHeightU16(samples[y0 * w + x0], min, max);
    const h10 = decodeHeightU16(samples[y0 * w + x1], min, max);
    const h01 = decodeHeightU16(samples[y1 * w + x0], min, max);
    const h11 = decodeHeightU16(samples[y1 * w + x1], min, max);
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * ty;
  }

  _estimateTextureBytes(texture) {
    const img = texture.image;
    const w = (img && img.width) || 256;
    const h = (img && img.height) || 256;
    return Math.ceil(w * h * 1.34); // compressed + mip chain estimate
  }

  getDebugStats() {
    const sourceStats = {};
    for (const [name, stats] of Object.entries(this.debugStats.sourceStats)) {
      const byLod = {};
      for (const [lod, lodStats] of Object.entries(stats.byLod || {})) {
        const finished = lodStats.loadFinished || 0;
        byLod[lod] = {
          ...lodStats,
          avgQueueWaitMs: finished ? lodStats.queueWaitMs / finished : 0,
          avgColorLoadMs: finished ? lodStats.colorLoadMs / finished : 0,
          avgHeightLoadMs: finished ? lodStats.heightLoadMs / finished : 0,
          avgLoadMs: finished ? lodStats.loadMs / finished : 0,
          avgColorFetchMs: finished ? lodStats.colorFetchMs / finished : 0,
          avgColorDecodeUploadMs: finished ? lodStats.colorDecodeUploadMs / finished : 0,
          avgHeightFetchMs: finished ? lodStats.heightFetchMs / finished : 0,
          avgHeightPostFetchMs: finished ? lodStats.heightPostFetchMs / finished : 0,
          avgColorTransferBytes: finished ? lodStats.colorTransferBytes / finished : 0,
          avgHeightTransferBytes: finished ? lodStats.heightTransferBytes / finished : 0,
        };
      }
      const finished = stats.loadFinished || 0;
      sourceStats[name] = {
        ...stats,
        avgQueueWaitMs: finished ? stats.queueWaitMs / finished : 0,
        avgColorLoadMs: finished ? stats.colorLoadMs / finished : 0,
        avgHeightLoadMs: finished ? stats.heightLoadMs / finished : 0,
        avgLoadMs: finished ? stats.loadMs / finished : 0,
        avgColorFetchMs: finished ? stats.colorFetchMs / finished : 0,
        avgColorDecodeUploadMs: finished ? stats.colorDecodeUploadMs / finished : 0,
        avgHeightFetchMs: finished ? stats.heightFetchMs / finished : 0,
        avgHeightPostFetchMs: finished ? stats.heightPostFetchMs / finished : 0,
        avgColorTransferBytes: finished ? stats.colorTransferBytes / finished : 0,
        avgHeightTransferBytes: finished ? stats.heightTransferBytes / finished : 0,
        byLod,
      };
    }
    return {
      ...this.debugStats,
      sourceStats,
      queue: this.wantedTiles.length,
      inflight: this.inflightLoads,
      pendingUploads: this._uploadQueue.length,
      loadedTiles: this.tiles.size,
      visibleTiles: this.visibleList.length,
      cameraSpeedMps: Math.round(this.cameraSpeedMps),
    };
  }

  // Six root tiles so a low-resolution globe is visible immediately.
  _initRoots() {
    for (const face of FACE_NAMES) {
      const tile = this._getOrCreateTile(face, this.rootLod, 0, 0, null);
      this._ensureTileMesh(tile);
      this.group.add(tile.mesh);
      this.selectionRoots.push(tile);
      this.selectionRootIds.add(tile.id);
      // Without assets there is nothing to stream: tiles are flat and ready.
      if (!this.hasAssets) this._markFlatReady(tile);
    }
  }

  _markFlatReady(tile) {
    tile.colorReady = true;
    tile.heightReady = true;
  }

  // A regional visualization can be the first/only asset and may intentionally
  // omit LOD0 and every tile outside its footprint. Treat every manifest tile
  // whose parent is absent as a root of a sparse quadtree forest.
  _rebuildSelectionRoots() {
    if (!this.manifest?.tiles) return;

    const roots = [];
    const rootIds = new Set();
    for (const id of this.manifestTileMap.keys()) {
      const [face, lodText, xText, yText] = id.split('/');
      const lod = Number(lodText);
      const x = Number(xText);
      const y = Number(yText);
      if (!FACE_NAMES.includes(face) || !Number.isInteger(lod) ||
          !Number.isInteger(x) || !Number.isInteger(y)) continue;

      const parentId = lod > 0 ? tileKey(face, lod - 1, x >> 1, y >> 1) : null;
      if (parentId && this.manifestTileMap.has(parentId)) continue;

      const tile = this._getOrCreateTile(face, lod, x, y, null);
      this._ensureTileMesh(tile);
      roots.push(tile);
      rootIds.add(tile.id);
    }
    this.selectionRoots = roots;
    this.selectionRootIds = rootIds;
  }

  _getTile(faceIndex, lod, x, y) {
    return this.tiles.get(tileNumKey(faceIndex, lod, x, y));
  }

  _getOrCreateTile(face, lod, x, y, parent) {
    let tile = this._getTile(FACE_INDEX[face], lod, x, y);
    if (tile) {
      // Always (re-)link: the parent may itself have been re-created after an
      // eviction, and the child must point at the live instance.
      if (parent) tile.parent = parent;
      return tile;
    }
    tile = new Tile(face, lod, x, y, parent);
    tile.meta = this._getTileMeta(tile);
    this.tiles.set(tile.numKey, tile);
    if (!this.hasAssets) this._markFlatReady(tile);
    return tile;
  }

  // Refreshes the per-tile caches that depend only on manifest data.
  _refreshTileCache(tile) {
    if (tile.cacheVersion === this.manifestVersion) return;
    tile.cacheVersion = this.manifestVersion;
    tile.hasChildAssets = this._computeHasChildAssets(tile);
    tile.boost = this.hasAssets ? this._priorityBoost(tile, tile.meta || this._getTileMeta(tile)) : 1;
  }

  // True only if the manifest contains ALL four child tile assets. Requiring the
  // full quad keeps the tree gap-free and prevents 404 storms at ragged region
  // boundaries (where a rectangular baked region only partially covers a parent's
  // four children). Such boundary parents simply stay one LOD coarser.
  _computeHasChildAssets(tile) {
    if (!this.hasAssets) return tile.lod < this.maxAvailableLod;
    tile.childrenGenerated = false;
    if (!tile.ground && this._bakedChildren(tile)) return true;
    // Below the baked tiles: generated ones, inside a region with ground data.
    tile.childrenGenerated = this._canGenerateChildren(tile);
    return tile.childrenGenerated;
  }

  _bakedChildren(tile) {
    const l = tile.lod + 1;
    const parentLayer = this.tileSourceMap.get(tile.id)?.layerIndex ?? 0;
    for (let i = 0; i < 4; i++) {
      const childKey = tileKey(tile.face, l, tile.x * 2 + (i & 1), tile.y * 2 + (i >> 1));
      if (!this.manifestTileMap.has(childKey)) return false;
      // Once an overlay owns a parent, refinement must not replace it with
      // descendants from a lower-priority layer (typically the base Earth).
      // A same-layer or later overlay child is safe; a base child is not.
      const childLayer = this.tileSourceMap.get(childKey)?.layerIndex ?? 0;
      if (childLayer < parentLayer) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Generated ground (see GROUND_MAX_LOD and groundData.js)
  // ---------------------------------------------------------------------------

  // Geodetic latitude and longitude (degrees) of a direction in the planet group's frame (the generator's mapping).
  _latLon(dir, out) {
    out.lon = Math.atan2(-dir.z, dir.x) / DEG2RAD;
    out.lat = Math.atan2(dir.y, (1 - this.planetE2) * Math.hypot(dir.x, dir.z)) / DEG2RAD;
    return out;
  }

  // The loaded region of ground data that holds the whole tile, or null.
  _groundFor(tile) {
    if (!this.groundData.length || tile.lod < 8) return null;
    const span = 2 / Math.pow(2, tile.lod), u0 = -1 + tile.x * span, v0 = -1 + tile.y * span;
    const ll = this._tmpLatLon;
    for (const g of this.groundData) {
      if (!g.loaded) continue;
      let inside = true;
      for (let i = 0; i < 4 && inside; i++) {
        cubeToDirection(tile.face, u0 + span * (i & 1), v0 + span * (i >> 1), this._tmpDir);
        this._latLon(this._tmpDir, ll);
        inside = g.covers(ll.lat, ll.lon);
      }
      if (inside) return g;
    }
    return null;
  }

  _canGenerateChildren(tile) {
    if (tile.lod >= this.groundMaxLod) return false;
    const g = tile.ground ?? this._groundFor(tile);
    if (!g) return false;
    // Not over open sea (more than GROUND_SEA_MARGIN from the coast all over the tile): nothing to add there.
    if (g.has(...this._tileLatLonBox(tile))) {
      const span = 2 / Math.pow(2, tile.lod), u0 = -1 + tile.x * span, v0 = -1 + tile.y * span;
      const c = this._tmpCover, ll = this._tmpLatLon;
      for (let i = 0; i < 25; i++) {
        cubeToDirection(tile.face, u0 + span * (i % 5) / 4, v0 + span * Math.floor(i / 5) / 4, this._tmpDir);
        this._latLon(this._tmpDir, ll);
        g.cover(ll.lat, ll.lon, c);
        if (c[COVER.coast] > -GROUND_SEA_MARGIN) return true;
      }
      return false;
    }
    // (Until its data is here; then the tiles' cached answers are worked out again.)
    g.request(...this._tileLatLonBox(tile)).then(() => { this.manifestVersion++; });
    return true;
  }

  // [latMin, latMax, lonMin, lonMax] (degrees) around a tile.
  _tileLatLonBox(tile, margin = 0) {
    const span = 2 / Math.pow(2, tile.lod), u0 = -1 + tile.x * span, v0 = -1 + tile.y * span;
    const ll = this._tmpLatLon;
    let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;
    for (let i = 0; i < 4; i++) {
      cubeToDirection(tile.face, u0 + span * (-margin + (1 + 2 * margin) * (i & 1)), v0 + span * (-margin + (1 + 2 * margin) * (i >> 1)), this._tmpDir);
      this._latLon(this._tmpDir, ll);
      latMin = Math.min(latMin, ll.lat); latMax = Math.max(latMax, ll.lat);
      lonMin = Math.min(lonMin, ll.lon); lonMax = Math.max(lonMax, ll.lon);
    }
    return [latMin, latMax, lonMin, lonMax];
  }

  // The region's own plane for the generated ground's patterns: its origin (on the ellipsoid at the middle of the
  // region) and the directions east and north there. Patterns are functions of the position on this plane, so they
  // are the same on every tile (it is within 0.03% of the ground's own distances over 200 km).
  _groundFrame(g) {
    if (g.frame) return g.frame;
    const b = g.manifest.bbox;
    const lat = (b[2] + b[3]) / 2 * DEG2RAD, lon = (b[0] + b[1]) / 2 * DEG2RAD;
    const dir = latLonToDirection(lat, lon, new THREE.Vector3(), this.planetE2);
    const origin = rayEllipsoidIntersection(dir, this.a, this.b, new THREE.Vector3());
    const up = ellipsoidNormal(origin, this.a, this.b, new THREE.Vector3());
    const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon)); // d/dlon of (cos lon, 0, -sin lon)
    const north = new THREE.Vector3().crossVectors(up, east).normalize();
    g.frame = { origin, east, north, up };
    return g.frame;
  }

  // Starts making a generated tile: once its region's data and its ancestor's imagery are here, it is queued for
  // building like a loaded tile (its heights are worked out when its geometry is built, within the upload budget).
  _requestGround(tile) {
    if (tile.loading || tile.loaded) return;
    if (!tile.colorTile?.ready) return;
    tile.loading = true;
    tile.uploaded = false;
    const [latMin, latMax, lonMin, lonMax] = this._tileLatLonBox(tile, 0.1);
    const pad = 3 / tile.ground.cpd;
    const generation = tile.loadGeneration;
    tile.ground.request(latMin - pad, latMax + pad, lonMin - pad, lonMax + pad).then(() => {
      if (tile.disposed || tile.loadGeneration !== generation) return;
      tile.loading = false;
      tile.colorReady = true;
      tile.heightReady = true;
      this._uploadQueue.push(tile);
    });
  }

  // A generated tile's heights (heightGrid): the region's terrain, the coast's shape and the generated relief, at
  // each vertex and a ring of points one step beyond its edges.
  _buildGroundHeights(tile) {
    const g = tile.ground ?? tile.groundLook, frame = this._groundFrame(g);
    const seg = this.segments, G = seg + 3;
    const span = 2 / Math.pow(2, tile.lod), u0 = -1 + tile.x * span, v0 = -1 + tile.y * span;
    const spacing = span * (Math.PI / 4) * this.meanRadius / seg;
    const grid = new Float32Array(G * G);
    const cover = this._tmpCover, ll = this._tmpLatLon, dir = this._tmpDir, pos = this._tmpA;
    let sum = 0, min = Infinity, max = -Infinity;
    for (let gy = 0; gy < G; gy++) {
      const v = v0 + span * (gy - 1) / seg;
      for (let gx = 0; gx < G; gx++) {
        const u = u0 + span * (gx - 1) / seg;
        cubeToDirection(tile.face, u, v, dir);
        this._latLon(dir, ll);
        let h = g.height(ll.lat, ll.lon);
        g.cover(ll.lat, ll.lon, cover);
        // (The region's heights include the sea floor near the coast. Beyond them, out at sea, the baked
        // ancestor's own heights, clamped to its edge.)
        if (h !== h) {
          const ct = tile.colorTile ?? tile, ctSpan = 2 / Math.pow(2, ct.lod);
          directionToUVOnFace(dir, ct.face, this._tmpFaceUV);
          h = this._sampleHeight(ct, (this._tmpFaceUV.u + 1) / ctSpan - ct.x, (this._tmpFaceUV.v + 1) / ctSpan - ct.y);
        }
        h = coastShape(h, cover, spacing);
        rayEllipsoidIntersection(dir, this.a, this.b, pos).sub(frame.origin);
        h += groundRelief(pos.dot(frame.east), pos.dot(frame.north), cover, spacing);
        h = coastSide(h, cover);
        grid[gy * G + gx] = h;
        sum += h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    tile.heightGrid = grid;
    tile.refHeight = sum / (G * G);
    // Its bounds: its ground, and the sea surface over it if there is one (a deep-water tile whose bounds were its sea
    // floor's alone was culled while its sea surface was in view, leaving a hole down to the next tile's sea floor).
    const top = this.hasWater ? Math.max(max, 0) : max, bottom = min;
    tile.boundsHeight = (top + bottom) / 2;
    tile.heightAllowance = (top - bottom) / 2 + 20;
    tile.boundsValid = false;
    this._updateTileBounds(tile);
  }

  // A tile's look (groundDetail.js) samples its region's data directly (groundTextures.js); it needs the transform from
  // the region's cells to its colour texture's UVs (for the imagery's colour from inland near the coast).
  _groundCellToUv(tile) {
    const g = tile.ground ?? tile.groundLook, ct = tile.colorTile ?? tile;
    const span = 2 / Math.pow(2, ct.lod), cu = -1 + (ct.x + 0.5) * span, cv = -1 + (ct.y + 0.5) * span;
    const ll = this._tmpLatLon, eps = span * 0.01, cell = (u, v) => {
      cubeToDirection(ct.face, u, v, this._tmpDir);
      this._latLon(this._tmpDir, ll);
      return [(ll.lon - g.lonMin) * g.cpd, (g.latMax - ll.lat) * g.cpd];
    };
    const c0 = cell(cu, cv), cuu = cell(cu + eps, cv), cvv = cell(cu, cv + eps);
    // d(cell)/d(uv), inverted: d(uv)/d(cell). (UV runs 0..1 across the colour tile: du = eps / span.)
    const duv = eps / span;
    const a = (cuu[0] - c0[0]) / duv, b = (cvv[0] - c0[0]) / duv, c = (cuu[1] - c0[1]) / duv, d = (cvv[1] - c0[1]) / duv;
    const det = a * d - b * c;
    return new THREE.Vector4(d / det, -b / det, -c / det, a / det);
  }

  // A baked tile inside a region with ground data, from level GROUND_LOOK_MIN_LOD down, has the generated ground's
  // look too, so it does not change where generated tiles take over.
  _groundLookForBaked(tile) {
    if (tile.ground || tile.groundUniforms || !this.groundShading || tile.lod < GROUND_LOOK_MIN_LOD) return;
    const g = this._groundFor(tile);
    if (!g) return;
    tile.groundLook = g;
    this._configureGroundDetail(tile.material, tile);
    tile.material.needsUpdate = true;
  }

  // Keeps the region data under the drawn tiles with a look on the GPU (and gives baked tiles loaded before their
  // region's data their look).
  _updateGroundTextures() {
    for (const t of this.groundTextures.values()) t.tick();
    for (const tile of this.visibleList) {
      if (!tile.ground && !tile.groundLook && tile.ready && tile.groundLookChecked !== this.manifestVersion) {
        tile.groundLookChecked = this.manifestVersion;
        this._groundLookForBaked(tile);
        if (tile.groundLook) this._replaceGeometry(tile);
      }
      const g = tile.ground ?? tile.groundLook;
      if (!g) continue;
      tile.groundBox ??= this._tileLatLonBox(tile, 0.02);
      this.groundTextures.get(g)?.need(...tile.groundBox, tile.lod >= FULL_MIN_LOD);
      // (A baked tile's heights from the region's data once it has arrived.)
      if (tile.groundLook && tile.loaded && !tile.heightGrid && g.has(...tile.groundBox)) this._replaceGeometry(tile);
    }
  }

  _configureGroundDetail(material, tile) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    const frame = this._groundFrame(tile.ground ?? tile.groundLook);
    const rel = this._tmpA.copy(tile.center).sub(frame.origin);
    const g = tile.ground ?? tile.groundLook, textures = this.groundTextures.get(g);
    const uniforms = tile.groundUniforms = {
      groundEast: { value: frame.east },
      groundNorth: { value: frame.north },
      groundFrameUp: { value: frame.up },
      groundTileCenter: { value: tile.center },
      groundOffset: { value: groundOffsets(rel.dot(frame.east), rel.dot(frame.north)) },
      groundA: { get value() { return textures.a ?? null; } },
      groundB: { get value() { return textures.b ?? null; } },
      groundS: { get value() { return textures.s ?? null; } },
      groundCA: { get value() { return textures.ca ?? null; } },
      groundCB: { get value() { return textures.cb ?? null; } },
      groundCS: { get value() { return textures.cs ?? null; } },
      groundLookup: { get value() { return textures.lookup ?? null; } },
      groundGrid: { value: new THREE.Vector3(g.n, g.cols, g.rows) },
      groundCellMetres: { value: 110600 / g.cpd },
      groundActive: { get value() { return textures.ready ? 1 : 0; } },
      groundCellToUv: { value: this._groundCellToUv(tile) },
    };
    material.onBeforeCompile = (shader, renderer) => {
      if (previous) previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms, groundUniforms);
      if (this.groundDebug === 1) shader.fragmentShader = '#define GROUND_DEBUG\n' + shader.fragmentShader;
      if (this.groundDebug === 2) {
        // (Unlit: the ground's colour alone, without the light's shading, for telling seams in the colour from seams
        // in the normals.)
        shader.fragmentShader = '#define GROUND_DEBUG_ALBEDO\n' + shader.fragmentShader.replace('#include <opaque_fragment>',
          'outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>');
      }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
${groundVertexPars}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
${groundVertex(this.a, this.b)}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
${groundFragmentPars}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
${groundFragment}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
${groundRoughnessFragment}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${groundNormalFragment}`);
    };
    material.customProgramCacheKey = () => (previousKey ? previousKey.call(material) : '') + '|ground';
  }

  // Per-tile metadata from the manifest.
  _getTileMeta(tile) {
    return this.manifestTileMap.get(tile.id) || DEFAULT_TILE_META;
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  // Height of the surface the camera renders into, in physical pixels.
  _viewportHeight() {
    const r = this.renderer;
    if (r) {
      const target = r.getRenderTarget?.();
      if (target) return target.height;
      if (r.getDrawingBufferSize) return r.getDrawingBufferSize(this._tmpV2).y || 1080;
    }
    return (typeof window !== 'undefined') ? window.innerHeight : 1080;
  }

  update(camera) {
    if (!camera || !this.enabled) return;

    if (this.debugStats.startupTrace.firstUpdateMs == null) {
      this.debugStats.startupTrace.firstUpdateTileCount = this.tiles.size;
      this._traceFirst('firstUpdateMs');
    }

    this.frame += 1;
    this._uploadTiles();

    // The camera may live inside a moved parent (e.g. the VR camera group), so
    // always work from its world transform.
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this._camWorld);
    this._updateCameraSpeed();

    this.group.updateWorldMatrix(true, false);
    this._groupInverse.copy(this.group.matrixWorld).invert();
    this._groupScale = this.group.matrixWorld.getMaxScaleOnAxis();
    this._camLocal.copy(this._camWorld).applyMatrix4(this._groupInverse);
    this._camDistLocal = this._camLocal.length();
    if (this._camDistLocal > 0) this._camDirLocal.copy(this._camLocal).divideScalar(this._camDistLocal);

    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);

    // Pixels per unit of (error / distance). projectionMatrix[5] = 1/tan(fov/2),
    // which also accounts for camera.zoom and works for cameras without .fov.
    const p5 = camera.projectionMatrix.elements[5] || (1 / Math.tan(25 * DEG2RAD));
    this._sseScale = 0.5 * this._viewportHeight() * p5;

    // Horizon culling. A point at angle theta from the sub-camera point is
    // hidden by the planet when theta > acos(R/d) + acos(R/(R+h)), where R is a
    // conservative (low) occluder radius and h the highest terrain.
    const mult = this.displacementScaleMultiplier;
    const occluderRadius = this.b + Math.min(0, this.heightMinMeters * mult);
    const peakRadius = this.a + Math.max(0, this.heightMaxMeters * mult);
    if (this._camDistLocal > occluderRadius) {
      this._horizonAngle = Math.acos(occluderRadius / this._camDistLocal);
      this._peakAngle = Math.acos(Math.min(1, occluderRadius / peakRadius));
    } else {
      this._horizonAngle = Math.PI; // Camera below the occluder: do not cull.
      this._peakAngle = 0;
    }

    this.visibleList.length = 0;
    this.wantedTiles.length = 0;

    for (const root of this.selectionRoots) {
      if (!root.disposed) this._selectTilesRecursive(root);
    }

    this._applyVisibility();
    if (this.groundData.length) this._updateGroundTextures();
    this._updateSeaFar(camera);
    this._updateEdgeMorph();
    this._processQueue();
    this._evictLRU();

    const stats = this.debugStats;
    stats.queue = this.wantedTiles.length;
    stats.inflight = this.inflightLoads;
    stats.loadedTiles = this.tiles.size;
    stats.visibleTiles = this.visibleList.length;
    stats.maxQueue = Math.max(stats.maxQueue, stats.queue);
    stats.maxInflight = Math.max(stats.maxInflight, this.inflightLoads);
    stats.maxLoadedTiles = Math.max(stats.maxLoadedTiles, this.tiles.size);
    stats.maxVisibleTiles = Math.max(stats.maxVisibleTiles, stats.visibleTiles);
    this._flushStartupChartIfReady();
  }

  _updateCameraSpeed() {
    const t = performance.now() * 0.001;
    const dt = Math.max(1e-3, t - this.lastTimeSec);
    this.cameraSpeedMps = this.hasLastCameraPos ? this._camWorld.distanceTo(this.lastCameraPos) / dt : 0;
    this.lastCameraPos.copy(this._camWorld);
    this.hasLastCameraPos = true;
    this.lastTimeSec = t;
  }

  // Recursively selects visible tiles, always keeping a parent visible until ALL
  // of its children are loaded and ready (so no holes appear during streaming).
  _selectTilesRecursive(tile) {
    // The first asset may itself be a sparse regional tileset (for example,
    // assets=['hawaii']). Do not display or load cube-face roots and other
    // tiles that its explicit manifest does not contain.
    if (this.manifestReady && this.manifest?.tiles &&
        !this.manifestTileMap.has(tile.id) && !tile.ground) {
      return;
    }

    tile.lastUsedFrame = this.frame;

    if (!this._isTileVisible(tile)) {
      return;
    }

    const shouldRefine = this._shouldRefine(tile);
    tile.refinementActive = shouldRefine;
    if (shouldRefine) {
      this._ensureChildren(tile);

      let allReady = true;
      for (const child of tile.children) {
        child.lastUsedFrame = this.frame;
        if (!child.ready) {
          this._want(child);
          allReady = false;
        }
      }

      if (allReady) {
        for (const child of tile.children) {
          this._selectTilesRecursive(child);
        }
        return; // Parent is fully replaced by its children this frame.
      }
      // else: fall through and keep this parent visible while children stream in.
    }

    tile.visibleFrame = this.frame;
    this.visibleList.push(tile);
    if (!tile.ready) this._want(tile);
  }

  // Frustum + horizon culling. Roots are never horizon-culled so the globe
  // silhouette is always complete.
  _isTileVisible(tile) {
    this._updateTileBounds(tile);

    tile.worldCenter.copy(tile.center).addScaledVector(tile.centerNormal, tile.ground ? (tile.boundsHeight ?? tile.refHeight) : 0)
      .applyMatrix4(this.group.matrixWorld);
    this.worldSphere.center.copy(tile.worldCenter);
    this.worldSphere.radius = tile.boundingRadius * this._groupScale;

    if (!this.frustum.intersectsSphere(this.worldSphere)) return false;

    if (tile.lod === this.rootLod) return true;
    if (this._horizonAngle >= Math.PI) return true;

    const cosTheta = THREE.MathUtils.clamp(tile.centerDir.dot(this._camDirLocal), -1, 1);
    const theta = Math.acos(cosTheta);
    return theta - tile.angularRadius < this._horizonAngle + this._peakAngle + 0.01;
  }

  // Screen-space-error driven refinement with hysteresis and speed throttling.
  // Refinement is asset-driven: a tile only refines if higher-LOD child tiles
  // were actually generated (present in the manifest), which prevents 404 storms
  // and the flicker/evict churn they cause. Tiles from regional overlays refine
  // the same way as the base's (by how large they are on screen): every Earth
  // scene loads every overlay on the machine, and uses its tiles where the
  // camera is close enough to need them.
  _shouldRefine(tile) {
    if (tile.lod >= this.lodCap) return false;
    if (tile.lod >= this.maxAvailableLod && !this.groundData.length) return false;
    this._refreshTileCache(tile);
    if (!tile.hasChildAssets) return false;

    if (this.cameraSpeedMps > this.fastCameraSpeed && tile.lod >= this.maxLodWhileFast) {
      return false;
    }

    const distance = Math.max(1, this._tmpRefPoint.copy(tile.center)
      .addScaledVector(tile.centerNormal, tile.refHeight).distanceTo(this._camLocal));
    const geometricError = this._tileGeometricError(tile);
    const sse = (geometricError / distance) * this._sseScale;
    if (tile.ground || tile.childrenGenerated) {
      // A generated tile, or a baked one whose children would be generated (they show its imagery, no sharper): by
      // how far apart its vertices are on screen.
      const threshold = GROUND_SSE_PIXELS * (tile.refinementActive ? this.hysteresisCollapse : this.hysteresisExpand);
      return sse > threshold;
    }

    // Terrain-aware bias: rougher / mountainous / interesting tiles refine sooner;
    // open-ocean / flat tiles refine later.
    const threshold = tile.refinementActive
      ? this.sseThreshold * this.hysteresisCollapse
      : this.sseThreshold * this.hysteresisExpand;
    return sse > threshold / tile.boost;
  }

  // Approximate world-space geometric error: half a tile's surface span.
  // World-space size (m) of the detail a tile can show. With streamed imagery that is one colour
  // texel, so a tile is refined once its texels would be magnified beyond sseThreshold pixels.
  // Without assets only the silhouette matters, so it is one geometry segment.
  _tileGeometricError(tile) {
    const tileSpan = 2 / Math.pow(2, tile.lod); // in cube-face [-1,1] units
    const tileArc = tileSpan * (Math.PI / 4) * this.meanRadius; // a whole face spans ~pi/2 radians
    return this.hasAssets && !tile.ground && !tile.childrenGenerated ? tileArc / this.tileTextureSize : tileArc / this.segments;
  }

  // True if the tile's surface footprint overlaps a location-of-interest disc.
  _tileWithinLocation(tile, loc) {
    this._updateTileBounds(tile);
    const angular = tile.centerDir.angleTo(loc.dir);
    const locAngularRadius = (loc.radiusKm * 1000) / this.meanRadius;
    return angular < (tile.angularRadius + locAngularRadius);
  }

  // Multiplicative priority/refinement boost from terrain + locations of interest.
  // Depends only on manifest data, so it is cached per tile (_refreshTileCache).
  _priorityBoost(tile, meta) {
    let boost = 1;
    const land = clamp01(meta.landFraction ?? 0.5);
    // Make the coarse globe establish itself quickly before we spend budget on
    // deeper refinements. This helps avoid back-face / far-side starvation when
    // the queue is busy with near-camera tiles.
    boost += Math.max(0, 3 - tile.lod) * 2.5;
    if (tile.lod === 0) boost *= 12;
    else if (tile.lod === 1) boost *= 5;
    boost += 2.5 * clamp01((meta.roughness ?? 0.1) * 6);        // rough/mountainous
    boost += 1.2 * land;                                         // land over ocean
    boost -= 0.6 * (1 - land);                                   // de-prioritize ocean
    for (const loc of this.locationInterests) {
      if (this._tileWithinLocation(tile, loc)) boost += 2 * loc.lodBoost;
    }
    return Math.max(0.4, boost);
  }

  _computePriority(tile) {
    this._updateTileBounds(tile);
    this._refreshTileCache(tile);
    const distance = Math.max(1, tile.center.distanceTo(this._camLocal));

    // Closer + higher LOD + interesting terrain = higher load priority.
    let priority = 1e6 / distance;
    priority += tile.lod * 50;
    priority *= tile.boost;

    // Strongly prefer camera-facing tiles.
    const facing = tile.centerNormal.dot(this._camDirLocal);
    const facingWeight = tile.lod <= 1 ? 1 : 0.5 + 0.5 * clamp01(facing);
    priority *= facingWeight;

    return priority;
  }

  // ---------------------------------------------------------------------------
  // Geometric bounds
  // ---------------------------------------------------------------------------

  _updateTileBounds(tile) {
    if (tile.boundsValid) return;
    const tileSpan = 2 / Math.pow(2, tile.lod);
    const cu = -1 + tile.x * tileSpan + tileSpan * 0.5;
    const cv = -1 + tile.y * tileSpan + tileSpan * 0.5;

    cubeToDirection(tile.face, cu, cv, this._tmpDir);
    rayEllipsoidIntersection(this._tmpDir, this.a, this.b, tile.center);
    tile.centerDir.copy(tile.center).normalize();
    ellipsoidNormal(tile.center, this.a, this.b, tile.centerNormal);

    // Bounding radius from center to the farthest tile corner (plus a height
    // allowance). Using only one corner can underestimate the tile's true
    // footprint and make edge tiles blink out near the frustum boundary.
    let maxCornerDist = 0;
    for (let i = 0; i < 4; i++) {
      const u = cu + ((i & 1) ? 0.5 : -0.5) * tileSpan;
      const v = cv + ((i & 2) ? 0.5 : -0.5) * tileSpan;
      cubeToDirection(tile.face, u, v, this._tmpDir);
      rayEllipsoidIntersection(this._tmpDir, this.a, this.b, this._tmpA);
      maxCornerDist = Math.max(maxCornerDist, tile.center.distanceTo(this._tmpA));
    }
    const heightAllowance = tile.ground
      ? (tile.heightAllowance ?? 500) + Math.abs(tile.refHeight) * 0 // (centred at refHeight: see _isTileVisible)
      : 10000 * Math.max(1, this.displacementScaleMultiplier);
    tile.boundingRadius = maxCornerDist + heightAllowance;
    tile.angularRadius = maxCornerDist / this.meanRadius;
    tile.boundsValid = true;
  }

  // ---------------------------------------------------------------------------
  // Geometry construction
  // ---------------------------------------------------------------------------

  _ensureTileMesh(tile) {
    if (tile.mesh) return;
    this._updateTileBounds(tile);
    const geometry = this._buildTileGeometry(tile);
    const material = this.baseMaterial.clone();
    this._configureSurfaceDetail(material, tile);
    if (this.hasWater) this._configureSeafloor(material, tile);
    if (tile.ground && this.groundShading) this._configureGroundDetail(material, tile);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `tile:${tile.id}`;
    mesh.frustumCulled = false; // we do our own conservative culling
    mesh.receiveShadow = this.receiveSurfaceShadows;
    mesh.visible = false;
    // Relative-to-centre rendering: vertices are local to the tile centre.
    mesh.position.copy(tile.center);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.planetTile = tile.id;

    tile.mesh = mesh;
    tile.geometry = geometry;
    tile.material = material;
    this._updateTileWater(tile);
  }

  // Per-tile noise offsets: (tileCentre * frequency) mod DETAIL_PERIOD, computed
  // in float64 so the shader only ever sees small numbers.
  _computeDetailOffsets(tile) {
    if (!tile.detailOffsets) tile.detailOffsets = DETAIL_FREQS.map(() => new THREE.Vector3());
    const c = tile.center;
    for (let i = 0; i < DETAIL_FREQS.length; i++) {
      const f = DETAIL_FREQS[i];
      tile.detailOffsets[i].set(
        positiveMod(c.x * f, DETAIL_PERIOD),
        positiveMod(c.y * f, DETAIL_PERIOD),
        positiveMod(c.z * f, DETAIL_PERIOD));
    }
    return tile.detailOffsets;
  }

  // Adds repeat-free synthetic regolith detail in planet-local meters. The real
  // height mesh still controls silhouettes and terrain clearance; these bands
  // affect only lighting/color and fade out before they can shimmer at distance.
  // The noise is evaluated on tile-local positions plus per-tile offsets (see
  // _computeDetailOffsets) so it stays precise in float32.
  _configureSurfaceDetail(material, tile) {
    if (!this.surfaceDetail) return;
    const settings = this.surfaceDetail;
    const offsets = this._computeDetailOffsets(tile);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.lunarDetailNear = { value: settings.nearMeters };
      shader.uniforms.lunarDetailFar = { value: settings.farMeters };
      shader.uniforms.lunarNormalStrength = { value: settings.normalStrength };
      shader.uniforms.lunarAlbedoStrength = { value: settings.albedoStrength };
      shader.uniforms.lunarRoughnessStrength = { value: settings.roughnessStrength };
      shader.uniforms.lunarFreq = { value: DETAIL_FREQS };
      shader.uniforms.lunarOffset = { value: offsets };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
varying vec3 vPlanetDetailPosition;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vPlanetDetailPosition = position;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
#define LUNAR_BANDS ${DETAIL_FREQS.length}
varying vec3 vPlanetDetailPosition;
uniform float lunarDetailNear;
uniform float lunarDetailFar;
uniform float lunarNormalStrength;
uniform float lunarAlbedoStrength;
uniform float lunarRoughnessStrength;
uniform float lunarFreq[LUNAR_BANDS];
uniform vec3 lunarOffset[LUNAR_BANDS];

// Noise-lattice coordinate of the current fragment for band i (small numbers).
#define LUNAR_P(i) (vPlanetDetailPosition * lunarFreq[i] + lunarOffset[i])

float lunarHash(vec3 p) {
  p = mod(p, ${DETAIL_PERIOD.toFixed(1)}); // periodic lattice: per-tile offsets wrap seamlessly
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float lunarNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = lunarHash(i);
  float n100 = lunarHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = lunarHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = lunarHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = lunarHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = lunarHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = lunarHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = lunarHash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

// Three-octave fBm whose octaves are bands i, i+1, i+2.
float lunarFbm(int i) {
  return 0.57 * lunarNoise(LUNAR_P(i)) + 0.28 * lunarNoise(LUNAR_P(i + 1) + 17.1) +
         0.15 * lunarNoise(LUNAR_P(i + 2) + 41.7);
}

float lunarBandVisibility(float pixelFootprintMeters, float spatialScale) {
  // spatialScale is cycles/metre. Remove a band before a screen pixel spans a
  // significant fraction of its noise cell (procedural equivalent of a mipmap).
  // The broad interval prevents visible concentric transition bands as the
  // camera moves: detail starts softening near Nyquist and takes ~8x growth in
  // pixel footprint to disappear completely.
  return 1.0 - smoothstep(0.25, 2.0, pixelFootprintMeters * spatialScale);
}

vec3 lunarNoiseGradient(int i) {
  vec3 q = LUNAR_P(i);
  const float e = 0.35;
  return vec3(
    lunarNoise(q + vec3(e, 0.0, 0.0)) - lunarNoise(q - vec3(e, 0.0, 0.0)),
    lunarNoise(q + vec3(0.0, e, 0.0)) - lunarNoise(q - vec3(0.0, e, 0.0)),
    lunarNoise(q + vec3(0.0, 0.0, e)) - lunarNoise(q - vec3(0.0, 0.0, e))
  );
}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float lunarFade = 1.0 - smoothstep(lunarDetailNear, lunarDetailFar, length(vViewPosition));
float lunarPixelFootprint = max(length(dFdx(vPlanetDetailPosition)),
                                length(dFdy(vPlanetDetailPosition)));
float lunarMacroVis = lunarBandVisibility(lunarPixelFootprint, lunarFreq[0]);
float lunarRegolithVis = lunarBandVisibility(lunarPixelFootprint, lunarFreq[3]);
float lunarPitsVis = lunarBandVisibility(lunarPixelFootprint, lunarFreq[6]);
float lunarMacro = lunarFbm(0);
float lunarRegolith = lunarFbm(3);
float lunarPits = smoothstep(0.78, 0.94, lunarNoise(LUNAR_P(6)));
float lunarTone = (lunarMacro - 0.5) * 0.7 * lunarMacroVis +
                  (lunarRegolith - 0.5) * 0.3 * lunarRegolithVis;
diffuseColor.rgb *= 1.0 + lunarFade * lunarAlbedoStrength * lunarTone;
diffuseColor.rgb *= 1.0 - lunarFade * lunarPits * lunarPitsVis * 0.08;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
float lunarNormalDistantVis = lunarBandVisibility(lunarPixelFootprint, lunarFreq[7]);
float lunarNormalLargeVis = lunarBandVisibility(lunarPixelFootprint, lunarFreq[8]);
float lunarNormalMediumVis = lunarBandVisibility(lunarPixelFootprint, lunarFreq[9]);
float lunarNormalFineVis = lunarBandVisibility(lunarPixelFootprint, lunarFreq[10]);
vec3 lunarGrad = lunarNoiseGradient(7) * (0.42 * lunarNormalDistantVis) +
                 lunarNoiseGradient(8) * (0.75 * lunarNormalLargeVis) +
                 lunarNoiseGradient(9) * (0.35 * lunarNormalMediumVis) +
                 lunarNoiseGradient(10) * (0.12 * lunarNormalFineVis);
lunarGrad -= normal * dot(lunarGrad, normal);
normal = normalize(normal - lunarFade * lunarNormalStrength * lunarGrad);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + lunarFade * lunarRoughnessStrength *
  (lunarRegolith - 0.35) * lunarRegolithVis, 0.55, 1.0);`);
    };
    material.customProgramCacheKey = () => 'planet-lunar-regolith-v4-rtc';
    material.roughness = 0.88;
    material.needsUpdate = true;
  }

  // Builds an indexed tile mesh on the ellipsoid with baked displacement. The
  // vertex positions are relative to tile.center (the mesh position).
  // UV == (u01, v01) and height sampling == (u01, v01): a direct, self-consistent
  // mapping that matches the offline asset generator at every LOD.
  _buildTileGeometry(tile) {
    if (tile.ground && !tile.heightGrid && tile.loaded) this._buildGroundHeights(tile);
    // A baked tile with the look takes its heights from the region's data too, once it is here: every tile in the
    // region then has the same ground and sea floor (and so the same depth of water) where it meets another.
    if (tile.groundLook && !tile.heightGrid && tile.loaded && tile.groundLook.has(...this._tileLatLonBox(tile, 0.02))) {
      this._buildGroundHeights(tile);
    }
    this._updateTileBounds(tile);
    const seg = this.segments;
    // A generated tile shows its baked ancestor's imagery: its UVs are in that tile's texture.
    const ct = tile.colorTile;
    const uvScale = ct ? Math.pow(2, ct.lod - tile.lod) : 1;
    const uvU0 = ct ? tile.x * uvScale - ct.x : 0, uvV0 = ct ? tile.y * uvScale - ct.y : 0;
    const tileSpan = 2 / Math.pow(2, tile.lod);
    const u0 = -1 + tile.x * tileSpan;
    const v0 = -1 + tile.y * tileSpan;
    const cx = tile.center.x, cy = tile.center.y, cz = tile.center.z;

    const total = (seg + 1) * (seg + 1);

    const positions = new Float32Array(total * 3);
    const normals = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 2);

    const displacementScale = this.displacementScaleMultiplier;
    const dir = this._tmpDir;
    const pos = this._tmpA;
    const nor = this._tmpB;
    // For the sea surface (see _buildWaterGeometry): each vertex at sea level, and its height.
    const seaPositions = this.hasWater ? new Float32Array(total * 3) : null;
    const seaNormals = this.hasWater ? new Float32Array(total * 3) : null;
    const heights = this.hasWater ? new Float32Array(total) : null;

    for (let y = 0; y <= seg; y++) {
      const v01 = y / seg;
      const v = v0 + tileSpan * v01;
      for (let x = 0; x <= seg; x++) {
        const u01 = x / seg;
        const u = u0 + tileSpan * u01;

        cubeToDirection(tile.face, u, v, dir);
        rayEllipsoidIntersection(dir, this.a, this.b, pos);
        ellipsoidNormal(pos, this.a, this.b, nor);

        const h = this._sampleHeight(tile, u01, v01) * displacementScale;
        const index = y * (seg + 1) + x;
        const i3 = index * 3;
        const i2 = index * 2;
        if (seaPositions) {
          seaPositions[i3] = pos.x - cx; seaPositions[i3 + 1] = pos.y - cy; seaPositions[i3 + 2] = pos.z - cz;
          seaNormals[i3] = nor.x; seaNormals[i3 + 1] = nor.y; seaNormals[i3 + 2] = nor.z;
          heights[index] = h;
        }
        pos.addScaledVector(nor, h);

        // Subtract the centre in float64 before narrowing to float32.
        positions[i3] = pos.x - cx; positions[i3 + 1] = pos.y - cy; positions[i3 + 2] = pos.z - cz;
        normals[i3] = nor.x; normals[i3 + 1] = nor.y; normals[i3 + 2] = nor.z;
        uvs[i2] = uvU0 + u01 * uvScale; uvs[i2 + 1] = uvV0 + v01 * uvScale;
      }
    }

    // Normals from the height field by central differences, one grid step either way, taking the
    // points beyond the tile's edge from the tile next to it: both tiles then agree on the normal at
    // their shared edge (normals from each tile's own triangles differ there, which shows as a line).
    const step = tileSpan / seg;
    const pu = this._tmpNormalA, pd = this._tmpNormalB, pv = this._tmpNormalC, pw = this._tmpNormalD;
    for (let y = 0; y <= seg; y++) {
      const v = v0 + tileSpan * y / seg;
      for (let x = 0; x <= seg; x++) {
        const u = u0 + tileSpan * x / seg;
        this._terrainPointAt(tile, u + step, v, pu).sub(this._terrainPointAt(tile, u - step, v, pd));
        this._terrainPointAt(tile, u, v + step, pv).sub(this._terrainPointAt(tile, u, v - step, pw));
        pu.cross(pv).normalize();
        const i3 = (y * (seg + 1) + x) * 3;
        // (Facing out, as the ellipsoid normal does: the cross product's sign depends on the face.)
        if (pu.x * normals[i3] + pu.y * normals[i3 + 1] + pu.z * normals[i3 + 2] < 0) pu.negate();
        normals[i3] = pu.x; normals[i3 + 1] = pu.y; normals[i3 + 2] = pu.z;
      }
    }

    // Joining the neighbours: every vertex on this tile's boundary takes the position (and normal) of the coarsest
    // drawn tile touching it there (its edge neighbours, and at a corner the diagonal one too), as that tile is drawn:
    // straight between its own boundary vertices. Every tile touching a boundary point then agrees on it, whatever
    // the mix of levels, and of generated and baked tiles, meeting there (a baked tile counts as coarser than a
    // generated one of the same level). Coarser tiles are built first, and a tile is rebuilt whenever one it took
    // its boundary from has been (see _updateEdgeMorph). The sea surface's depths follow; its own positions are on
    // the ellipsoid, the same for every tile.
    const sources = tile.boundarySources;
    if (sources && sources.some(Boolean)) {
      const take = (x, y, src) => {
        if (!src?.mesh?.geometry) return;
        const g = src.mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array;
        cubeToDirection(tile.face, u0 + tileSpan * x / seg, v0 + tileSpan * y / seg, dir);
        directionToUVOnFace(dir, src.face, this._tmpFaceUV);
        const sSpan = 2 / Math.pow(2, src.lod);
        const gx = Math.min(seg, Math.max(0, ((this._tmpFaceUV.u + 1) / sSpan - src.x) * seg));
        const gy = Math.min(seg, Math.max(0, ((this._tmpFaceUV.v + 1) / sSpan - src.y) * seg));
        // (On its boundary one of gx, gy is 0 or seg: bilinear there is straight along its edge.)
        const x0 = Math.min(seg - 1, Math.floor(gx)), y0 = Math.min(seg - 1, Math.floor(gy));
        const fx = gx - x0, fy = gy - y0;
        const i00 = (y0 * (seg + 1) + x0) * 3, i10 = i00 + 3, i01 = i00 + (seg + 1) * 3, i11 = i01 + 3;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const sc = src.center, i3 = (y * (seg + 1) + x) * 3;
        for (let k = 0; k < 3; k++) {
          const p = P[i00 + k] * w00 + P[i10 + k] * w10 + P[i01 + k] * w01 + P[i11 + k] * w11;
          positions[i3 + k] = p + (k === 0 ? sc.x - cx : k === 1 ? sc.y - cy : sc.z - cz);
          normals[i3 + k] = N[i00 + k] * w00 + N[i10 + k] * w10 + N[i01 + k] * w01 + N[i11 + k] * w11;
        }
        if (heights) {
          // (The depth for the sea surface: how far the point is above the ellipsoid, along its normal.)
          rayEllipsoidIntersection(dir, this.a, this.b, pos);
          ellipsoidNormal(pos, this.a, this.b, nor);
          heights[i3 / 3] = (positions[i3] + cx - pos.x) * nor.x + (positions[i3 + 1] + cy - pos.y) * nor.y + (positions[i3 + 2] + cz - pos.z) * nor.z;
        }
      };
      // Edges T, B, L, R (sources 0-3), then corners TL, TR, BL, BR (4-7): a corner takes the coarsest of its two
      // edges' sources and its diagonal one.
      for (let i = 1; i < seg; i++) {
        take(i, 0, sources[0]); take(i, seg, sources[1]); take(0, i, sources[2]); take(seg, i, sources[3]);
      }
      const coarsest = (...list) => list.reduce((best, t) => (t && (!best || this._coarserThan(t, best)) ? t : best), null);
      take(0, 0, coarsest(sources[0], sources[2], sources[4]));
      take(seg, 0, coarsest(sources[0], sources[3], sources[5]));
      take(0, seg, coarsest(sources[1], sources[2], sources[6]));
      take(seg, seg, coarsest(sources[1], sources[3], sources[7]));
      // (Normals were turned outward with the rest: the neighbour's are already.)
    }

    // Choose the winding that makes front faces point outward for this face's
    // (u,v) handedness, so FrontSide culling never opens holes.
    // (Judged from the ellipsoid, not the terrain: a steep slope, or an edge stitched to a neighbour, can fold the
    // terrain's corner triangle over, which flipped the tile and its sea surface, showing the sea's dark underside.)
    const reversed = this._faceNeedsReversedWinding(tile, u0, v0, tileSpan / seg);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    // Where each vertex is in its region's data (cells east and south of its north-west corner): the look samples
    // the region's data there (groundTextures.js).
    const look = tile.ground ?? tile.groundLook;
    if (look?.loaded) {
      const cells = new Float32Array(total * 2), ll = this._tmpLatLon;
      for (let y = 0; y <= seg; y++) {
        for (let x = 0; x <= seg; x++) {
          cubeToDirection(tile.face, u0 + tileSpan * x / seg, v0 + tileSpan * y / seg, dir);
          this._latLon(dir, ll);
          const k = (y * (seg + 1) + x) * 2;
          cells[k] = (ll.lon - look.lonMin) * look.cpd;
          cells[k + 1] = (look.latMax - ll.lat) * look.cpd;
        }
      }
      geometry.setAttribute('groundCell', new THREE.BufferAttribute(cells, 2));
    }
    geometry.setIndex(this.indexBufferCache.getIndexAttribute(seg, reversed));
    geometry.computeBoundingSphere();
    geometry.userData.waterGeometry = seaPositions
      ? this._buildWaterGeometry(seaPositions, seaNormals, uvs, heights, seg, reversed)
      : null;
    return geometry;
  }

  // The sea surface over this tile: the tile's grid at sea level, with each vertex's depth of water
  // (negative over land). Its material discards the land and uses the tile's own colour texture, so
  // the water takes the local colour of the ocean in the imagery and ends at the terrain's coastline.
  // Null if the tile has no terrain below sea level.
  _buildWaterGeometry(positions, normals, uvs, heights, seg, reversed) {
    let anyWater = false;
    const depths = new Float32Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
      depths[i] = -heights[i];
      if (heights[i] < 0) anyWater = true;
    }
    if (!anyWater) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs.slice(0, (seg + 1) * (seg + 1) * 2), 2));
    geometry.setAttribute('seaDepth', new THREE.BufferAttribute(depths, 1));
    geometry.setIndex(new THREE.BufferAttribute(this.indexBufferCache.getGridIndexArray(seg, reversed), 1));
    geometry.computeBoundingSphere();
    return geometry;
  }

  // Creates, replaces or removes the tile's sea-surface mesh (a child of the tile mesh, so it follows
  // the tile's position and visibility).
  //
  // Two meshes share the geometry: the translucent surface (front faces), drawn after the translucent
  // things it covers, and its opaque underside (back faces). From above the sea, a view ray that skims
  // the surface near the horizon passes into the water and, because of the Earth's curvature, comes
  // back out through the underside further on, where there is no sea floor behind it. The underside is
  // drawn in the opaque pass, so it is in place before anything translucent in the water (the cable
  // lines, the tube) is blended over it: otherwise they would blend with the sky behind and glow.
  _updateTileWater(tile) {
    const waterGeometry = tile.mesh?.geometry?.userData.waterGeometry ?? null;
    if (!waterGeometry) {
      if (tile.waterMesh) {
        tile.mesh.remove(tile.waterMesh, tile.waterUnderside);
        tile.waterMesh.material.dispose();
        tile.waterMesh = null;
        tile.waterUnderside = null;
      }
      return;
    }
    if (!tile.waterMesh) {
      tile.waterMesh = new THREE.Mesh(waterGeometry, this._createWaterMaterial(tile));
      tile.waterMesh.name = 'seaSurface';
      tile.waterMesh.frustumCulled = false; // the tile is culled instead
      tile.waterMesh.renderOrder = 2;       // after the translucent things it covers (e.g. the tube)
      tile.waterMesh.visible = this.waterVisible;
      tile.waterUnderside = new THREE.Mesh(waterGeometry, this._waterUndersideMaterial());
      tile.waterUnderside.name = 'seaUnderside';
      tile.waterUnderside.frustumCulled = false;
      tile.waterUnderside.visible = this.waterVisible;
      tile.mesh.add(tile.waterMesh, tile.waterUnderside);
    }
    else {
      tile.waterMesh.geometry = waterGeometry;
      tile.waterUnderside.geometry = waterGeometry;
    }
  }

  // The sea's underside as seen from above it (shared by every tile): opaque deep water, with the sky
  // reflected as a level surface there would reflect it (seaWaves.js), so where it shows through cracks
  // between tiles near the horizon it matches the surface around it.
  _waterUndersideMaterial() {
    if (this._undersideMaterial) return this._undersideMaterial;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(...WATER_UNDERSIDE_FROM_ABOVE),
      side: THREE.BackSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.seaSlopeVariance = seaWaveUniforms.seaSlopeVariance;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute float seaDepth;
varying float vSeaDepth;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vSeaDepth = seaDepth;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vSeaDepth;`)
        .replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>
${seaSkyReflectionGlsl}`)
        .replace('#include <alphatest_fragment>', `if (vSeaDepth <= 0.0) discard; // land
#include <alphatest_fragment>`)
        .replace('#include <opaque_fragment>', `{
  vec3 view = normalize(vViewPosition);
  vec3 up = normalize(vNormal);
  outgoingLight = mix(diffuseColor.rgb, seaSkyReflection(reflect(-view, up), sqrt(seaSlopeVariance)), seaReflectance(abs(dot(up, view))));
}
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'seaUndersideFromAbove';
    this._undersideMaterial = material;
    return material;
  }

  // The sea surface (front faces; see _updateTileWater). Two layers, composited over what is under the
  // surface (the sea floor, and the tube and cables in the water, which show through):
  // - The water: the imagery's ocean colour, lit, mostly clear (WATER_OPACITY, clearer still in the
  //   shallows, so the coastline is soft).
  // - The surface: wind-driven waves (seaWaves.js) that reflect the sky (by Fresnel's law, little when
  //   looked into and nearly all at grazing angles; the sky by the atmosphere's own model) and glint
  //   in the sun (Blinn-Phong, as rough as the waves too fine to draw), with whitecaps in strong wind.
//   On a rough sea the reflection is limited by the waves' slopes (seaWaves.js: seaReflectanceGlsl).
  // Since a glint is far brighter than the water's opacity allows in normal blending, the opacity is
  // raised to at least the brightness, with the colour divided by it: the same result over what is
  // behind, without clamping. Where there is sea ice at the simulated date (seaIce.js), it covers the
  // water: opaque, matte and flat.
  _createWaterMaterial(tile) {
    const texture = tile.texture ?? tile.colorTile?.texture ?? null; // (a generated tile shows its ancestor's)
    const material = new THREE.MeshPhongMaterial({
      color: texture ? 0xffffff : WATER_FALLBACK_COLOR,
      map: texture,
      specular: new THREE.Color().setRGB(0.02, 0.02, 0.02), // water's reflectance looking straight in (Fresnel F0)
      transparent: true,
      depthWrite: false,
    });
    material.defines = this._seaDefines(false);
    tile.seaFar = false;
    const waveOffsets = tileWaveOffsets(tile.center);
    const gustOffsets = noiseOffsets(tile.center, GUST_FREQUENCIES);
    const foamOffsets = noiseOffsets(tile.center, FOAM_FREQUENCIES);
    const groupOffsets = noiseOffsets(tile.center, GROUP_FREQUENCIES);
    const iceOffsets = noiseOffsets(tile.center, SEA_ICE_FREQUENCIES);
    const invA2 = (1 / (this.a * this.a)).toExponential(10);
    const invB2 = (1 / (this.b * this.b)).toExponential(10);
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, seaWaveUniforms, seaIceUniforms, apHazeUniforms);
      shader.fragmentShader = '#define AP_HAZE_LUT\n#define AP_HAZE_LUT_SEA\n' + shader.fragmentShader;  // (aerialPerspective.js)
      shader.uniforms.seaWaveOffset = { value: waveOffsets };
      shader.uniforms.seaGustOffset = { value: gustOffsets };
      shader.uniforms.seaFoamOffset = { value: foamOffsets };
      shader.uniforms.seaGroupOffset = { value: groupOffsets };
      shader.uniforms.seaIceOffset = { value: iceOffsets };
      shader.uniforms.seaTileCenter = { value: tile.center };
      // The sea's darkening of what is seen through it (seaDarkening.js) is not for the surface itself.
      // It is worked out per vertex from the depth below sea level, and where a tile's edge is pulled
      // onto a coarser neighbour's straight edge, its vertices sag up to tens of metres below the sea's
      // curve: the surface would darken along those edges, fading over one row of triangles.
      shader.uniforms.seaParams = { value: { x: 1, y: 0 } };
      // Per-pixel normals: on a distant (coarse) tile the vertex normals, interpolated across big flat
      // triangles, are slightly off from cell to cell, and the sharp sun glint turns that into a grid.
      // The normal is instead computed for each pixel from the ellipsoid at its planet position (to
      // ~1e-7 rad in float32) and rotated into view space with the (constant) mesh axes.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform vec3 seaTileCenter;
attribute float seaDepth;
varying float vSeaDepth;
varying vec3 vSeaLocal;
varying vec3 vSeaPlanet;
varying vec3 vSeaAxisX;
varying vec3 vSeaAxisY;
varying vec3 vSeaAxisZ;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vSeaDepth = seaDepth;
vSeaLocal = transformed;
vSeaPlanet = transformed + seaTileCenter;
vSeaAxisX = normalMatrix * vec3(1.0, 0.0, 0.0);
vSeaAxisY = normalMatrix * vec3(0.0, 1.0, 0.0);
vSeaAxisZ = normalMatrix * vec3(0.0, 0.0, 1.0);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vSeaDepth;
varying vec3 vSeaLocal;
varying vec3 vSeaPlanet;
varying vec3 vSeaAxisX;
varying vec3 vSeaAxisY;
varying vec3 vSeaAxisZ;
${fbmGlsl('seaIce', SEA_ICE_FREQUENCIES)}
${seaIceGlsl}
${seaWavesGlsl}

// Ellipsoid normal at this pixel, in planet axes.
vec3 seaPlanetNormal() {
  return normalize(vSeaPlanet * vec3(${invA2}, ${invB2}, ${invA2}));
}

// A direction in planet axes, in view space.
vec3 seaToView(vec3 n) {
  return normalize(n.x * vSeaAxisX + n.y * vSeaAxisY + n.z * vSeaAxisZ);
}`)
        .replace('#include <lights_phong_pars_fragment>', `#include <lights_phong_pars_fragment>
${seaSkyReflectionGlsl}`)
        .replace('#include <alphatest_fragment>', `if (vSeaDepth <= 0.0) discard; // land
// Where the imagery itself shows land, snow or ice (bright; the ocean in the imagery is very dark),
// there is no water: the coastline follows the imagery, and coarse distant tiles, whose coastal
// vertices can dip below sea level, do not dot the shore with blobs of water.
float seaImageryLand = smoothstep(${WATER_LAND_LUMINANCE[0]}, ${WATER_LAND_LUMINANCE[1]}, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
if (seaImageryLand >= 1.0) discard;
float seaViewDistance = length(vViewPosition);
// More opaque at grazing angles (judged from the level surface, not the waves), as the water's depth
// along the line of sight grows; clearer in the shallows.
float seaWaterAlpha = mix(${WATER_OPACITY.toFixed(3)}, ${WATER_GRAZING_OPACITY.toFixed(3)}, pow(1.0 - abs(dot(seaToView(seaPlanetNormal()), normalize(vViewPosition))), 4.0))
  * mix(0.4, 1.0, clamp(vSeaDepth / ${WATER_SHALLOWS_DEPTH.toFixed(1)}, 0.0, 1.0));
float seaIce = 0.0;
{
  float concentration = seaIceConcentration(seaPlanetNormal());
  if (concentration > 0.0) {
    vec4 ice = seaIceLook(concentration, seaIceFbm(vSeaLocal, seaViewDistance), seaViewDistance);
    seaIce = ice.a;
    diffuseColor.rgb = mix(diffuseColor.rgb, ice.rgb, seaIce);
    seaWaterAlpha = mix(seaWaterAlpha, 1.0, seaIce);
  }
}
#include <alphatest_fragment>`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
float seaUnresolved;
vec3 seaUp = seaPlanetNormal();
#ifdef SEA_FAR
// (The far sea, _updateSeaFar: what the rest draws there. Every band too fine for its pixel, so all of the
// waves' slope is roughness; the gusts faded out, so a gust factor of 1; the whitecaps' average cover.)
seaUnresolved = seaUnresolvedFar * seaRoughnessHere(seaUp) / seaSlopeVariance;
normal = seaToView(seaUp);
float seaFoamCover = (seaFoam.y > 0.0 ? clamp(seaFoam.y, 0.0, 0.2) : 0.0) * (1.0 - seaIce);
#else
float seaGustNow = seaGustFactor(vSeaLocal, seaViewDistance);
vec3 seaSlope = seaWaveSlope(vSeaLocal, seaUp, seaGustNow, seaUnresolved);
normal = seaToView(normalize(seaUp - seaSlope * (1.0 - seaIce)));
float seaFoamCover = seaWhitecaps(vSeaLocal, seaViewDistance, seaGustNow, length(fwidth(vSeaLocal))) * (1.0 - seaIce);
#endif`)
        .replace('#include <lights_phong_fragment>', `#include <lights_phong_fragment>
material.specularStrength *= 1.0 - seaIce; // ice is matte: no sun glint
// Blinn-Phong's exponent for the slopes too fine to draw (Beckmann roughness m^2 = their mean square
// slope), no sharper than the sun's disc allows.
material.specularShininess = clamp(2.0 / (seaUnresolved + 2e-4) - 2.0, 4.0, 8000.0);`)
        .replace('#include <opaque_fragment>', `{
  vec3 view = normalize(vViewPosition);
  float fresnel = seaReflectance(dot(normal, view)) * (1.0 - seaIce);
  vec3 water = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  // From far away (GLINT_FAR) the sun's glint is a generic sunspot: off the level surface, as rough as a
  // typical breeze leaves the sea everywhere (GLINT_FAR_SLOPE_VARIANCE; Beckmann's distribution, Fresnel
  // reflectance), whatever the waves, gusts, whitecaps or each place's wind (which made it a patchwork,
  // with rings around the camera where the gusts' noise changed scale).
#ifdef SEA_FAR
  // (The far sea is beyond GLINT_FAR: the generic sunspot alone.)
  vec3 glint = vec3(0.0);
  float glintFar = 1.0;
#else
  vec3 glint = reflectedLight.directSpecular;
  float glintFar = smoothstep(${GLINT_FAR[0].toFixed(1)}, ${GLINT_FAR[1].toFixed(1)}, seaViewDistance);
#endif
  #if NUM_DIR_LIGHTS > 0
  if (glintFar > 0.0) {
    vec3 n = seaToView(seaUp), l = directionalLights[0].direction;
    vec3 h = normalize(l + view);
    float nh = max(dot(n, h), 1e-3), nl = dot(n, l), nv = max(dot(n, view), 0.02);
    float m2 = ${GLINT_FAR_SLOPE_VARIANCE.toFixed(4)};
    float beckmann = exp(-(1.0 - nh * nh) / (nh * nh * m2)) / (PI * m2 * nh * nh * nh * nh);
    float f = 0.02 + 0.98 * pow(1.0 - max(dot(view, h), 0.0), 5.0);
    vec3 far = nl > 0.0 ? slDirect * directionalLights[0].color * f * beckmann / (4.0 * nv) : vec3(0.0);
    glint = mix(glint, far * (1.0 - seaIce), glintFar);
  }
  #endif
  // The sky it reflects, and in it the clouds over the sea (seaCloudCover), whose bases are grey, as bright as
  // the sky under thin or broken cloud and darker under a thick overcast (SEA_CLOUD_BASE): under thick cloud
  // the sea is grey, not the blue of a clear sky.
  vec3 seaSky = seaSkyReflection(reflect(-view, normal), sqrt(seaUnresolved));
  float seaCover = seaCloudCover(seaUp);
  seaSky = mix(seaSky, vec3(dot(seaSky, vec3(0.2126, 0.7152, 0.0722))) * mix(1.0, ${SEA_CLOUD_BASE.toFixed(2)}, seaCover * seaCover), seaCover);
  vec3 light = (1.0 - fresnel) * seaWaterAlpha * water + fresnel * seaSky + glint;
  float alpha = (1.0 - fresnel) * seaWaterAlpha + fresnel;
  // The light the water itself sends back (water-leaving light), in the sun and sky light (sunAndSkyLight.js).
  // (Under cloud, the sky's light on it is the clouds' grey, not the clear sky's blue.)
  vec3 seaIrradiance = mix(slSkyDown, vec3(dot(slSkyDown, vec3(0.2126, 0.7152, 0.0722))), seaCover) + ambientLightColor;
  #if NUM_DIR_LIGHTS > 0
    seaIrradiance += slDirect * directionalLights[0].color * max(dot(seaToView(seaUp), directionalLights[0].direction), 0.0);
  #endif
  light += (1.0 - fresnel) * (1.0 - seaIce) * vec3(${WATER_BODY.map(c => c.toFixed(4)).join(', ')}) * RECIPROCAL_PI * seaIrradiance
    * smoothstep(0.0, ${WATER_BODY_DEPTH.toFixed(1)}, vSeaDepth);
  if (seaFoamCover > 0.0) {
    // White water: matte, lit by the sun and sky (sunAndSkyLight.js) and the night light.
    vec3 irradiance = slSkyDown + ambientLightColor;
    #if NUM_DIR_LIGHTS > 0
      irradiance += slDirect * directionalLights[0].color * max(dot(normal, directionalLights[0].direction), 0.0);
    #endif
    light = mix(light, 0.6 * RECIPROCAL_PI * irradiance, seaFoamCover);
    alpha = mix(alpha, 1.0, seaFoamCover);
  }
  light *= 1.0 - seaImageryLand;
  alpha *= 1.0 - seaImageryLand;
  diffuseColor.a = clamp(max(alpha, max(light.r, max(light.g, light.b))), 1e-4, 1.0);
  outgoingLight = light / diffuseColor.a;
}
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'seaSurface';
    return material;
  }

  // The imagery shows the ocean as seen from space (near-black navy), which underwater makes the sea
  // floor indistinguishable from the water. While the camera is under the surface (seafloorView = 1),
  // ground below sea level is drawn in a sediment colour instead, keeping the imagery's light and dark
  // variation, with mild fractal noise (seaNoise.js), blending in over the first SEAFLOOR_BLEND_DEPTH
  // metres below sea level. The altitude is computed per vertex from the tile-local position plus the
  // tile centre (good to ~1 m in float32).
  //
  // Sea ice (seaIce.js) is also drawn on the ground, fully below sea level and fading out over the first
  // SEA_ICE_SHORE_HEIGHT metres above it, so it reaches the shore where the sea surface's edge is
  // ragged (coarse tiles' coastal triangles, and the cut where the imagery shows land).
  _configureSeafloor(material, tile) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    const offsets = noiseOffsets(tile.center, SEAFLOOR_FREQS);
    const iceOffsets = noiseOffsets(tile.center, SEA_ICE_FREQUENCIES);
    const invA2 = (1 / (this.a * this.a)).toExponential(10);
    const invB2 = (1 / (this.b * this.b)).toExponential(10);
    material.onBeforeCompile = (shader, renderer) => {
      if (previous) previous.call(material, shader, renderer);
      shader.uniforms.seafloorView = this.seafloorView;
      shader.uniforms.seafloorTileCenter = { value: tile.center };
      shader.uniforms.seafloorOffset = { value: offsets };
      shader.uniforms.seaIceOffset = { value: iceOffsets };
      Object.assign(shader.uniforms, seaIceUniforms, apHazeUniforms);
      shader.fragmentShader = '#define AP_HAZE_LUT\n' + shader.fragmentShader;  // (aerialPerspective.js)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform vec3 seafloorTileCenter;
varying float vSeafloorAltitude;
varying vec3 vSeafloorLocal;
varying vec3 vSeaIceNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vSeafloorLocal = transformed;
{
  vec3 p = transformed + seafloorTileCenter;
  vSeaIceNormal = p * vec3(${invA2}, ${invB2}, ${invA2});
  float r = length(p);
  vec3 d = p / r;
  float surface = 1.0 / sqrt((d.x * d.x + d.z * d.z) / ${(this.a * this.a).toExponential(10)} + d.y * d.y / ${(this.b * this.b).toExponential(10)});
  vSeafloorAltitude = r - surface;
}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float seafloorView;
varying float vSeafloorAltitude;
varying vec3 vSeafloorLocal;
varying vec3 vSeaIceNormal;
${fbmGlsl('seafloor', SEAFLOOR_FREQS)}
${fbmGlsl('seaIce', SEA_ICE_FREQUENCIES)}
${seaIceGlsl}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
if (seafloorView > 0.0 && vSeafloorAltitude < 0.0) {
  float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float mottle = seafloorFbm(vSeafloorLocal, length(vViewPosition));
  vec3 sediment = vec3(${SEAFLOOR_COLOR.map(c => c.toFixed(3)).join(', ')}) * (0.75 + 1.5 * luma)
    * (1.0 + ${SEAFLOOR_CONTRAST.toFixed(2)} * mottle) * vec3(1.0 + 0.08 * mottle, 1.0, 1.0 - 0.08 * mottle);
  float amount = seafloorView * clamp(-vSeafloorAltitude / ${SEAFLOOR_BLEND_DEPTH.toFixed(1)}, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, sediment, amount);
}
if (seafloorView < 1.0 && vSeafloorAltitude < ${SEA_ICE_SHORE_HEIGHT.toFixed(1)}) {
  float concentration = seaIceConcentration(normalize(vSeaIceNormal));
  if (concentration > 0.0) {
    float viewDistance = length(vViewPosition);
    vec4 ice = seaIceLook(concentration, seaIceFbm(vSeafloorLocal, viewDistance), viewDistance);
    float shore = 1.0 - smoothstep(0.0, ${SEA_ICE_SHORE_HEIGHT.toFixed(1)}, vSeafloorAltitude);
    diffuseColor.rgb = mix(diffuseColor.rgb, ice.rgb, ice.a * shore * (1.0 - seafloorView));
  }
}`);
    };
    material.customProgramCacheKey = () => (previousKey ? previousKey.call(material) : '') + '|seafloor';
  }


  // 1 while the camera is under the sea surface (see _configureSeafloor), 0 otherwise.
  setSeafloorView(amount) {
    this.seafloorView.value = amount;
  }

  // The sea's lighter shader (SEA_LITE: fewer wave trains and noise octaves) on, or off, on every tile.
  setSeaLite(on) {
    if (on === this.seaLite) return;
    this.seaLite = on;
    for (const tile of this.tiles.values()) {
      if (!tile.waterMesh) continue;
      tile.waterMesh.material.defines = this._seaDefines(tile.seaFar);
      tile.waterMesh.material.needsUpdate = true;
    }
  }

  _seaDefines(far) {
    const defines = this.seaLite ? { SEA_LITE: '' } : {};
    if (far) defines.SEA_FAR = '';
    return defines;
  }

  // The far sea (SEA_FAR): a smaller shader for the tiles wholly beyond where the waves, gusts, whitecaps and
  // the glint off the waves show (every wave band under a pixel, the gusts' octaves faded out, past
  // GLINT_FAR), which draws there exactly what the full one does. Its many parts held so many registers that
  // on Intel's integrated GPUs the sea ran at half width everywhere, even where they were all skipped: from
  // space, as much as the waves' own cost close up. Per tile, from its nearest point to the camera, with a
  // margin; the pixel the narrowest of the view (towards its corners, cos^2 of the angle off its axis).
  _updateSeaFar(camera) {
    const p = camera.projectionMatrix.elements;
    const tanDiagonal2 = 1 / (p[0] * p[0]) + 1 / (p[5] * p[5]);
    const pixelAngle = 1 / (this._sseScale * (1 + tanDiagonal2));
    const margin = 1.25;
    const scale = this._groupScale || 1;
    const farFrom = Math.max(SEA_GUSTS_UNSEEN_DISTANCE, GLINT_FAR[1], SEA_WAVES_UNRESOLVED_PIXEL / pixelAngle) * margin;
    for (const tile of this.visibleList) {
      if (!tile.waterMesh) continue;
      const nearest = (tile.center.distanceTo(this._camLocal) - tile.boundingRadius) * scale;
      const far = nearest > farFrom;
      if (far === tile.seaFar) continue;
      tile.seaFar = far;
      tile.waterMesh.material.defines = this._seaDefines(far);
      tile.waterMesh.material.needsUpdate = true;
    }
  }

  // Shows or hides the sea surface on every tile.
  setWaterVisible(visible) {
    this.waterVisible = visible;
    for (const tile of this.tiles.values()) {
      if (tile.waterMesh) tile.waterMesh.visible = tile.waterUnderside.visible = visible;
    }
  }

  // Determines whether the forward index winding produces inward-facing triangles
  // for this tile (in which case the reversed winding is needed).
  _faceNeedsReversedWinding(tile, u0, v0, step) {
    const a = rayEllipsoidIntersection(cubeToDirection(tile.face, u0, v0, this._tmpDir), this.a, this.b, new THREE.Vector3());
    const b = rayEllipsoidIntersection(cubeToDirection(tile.face, u0 + step, v0, this._tmpDir), this.a, this.b, new THREE.Vector3());
    const c = rayEllipsoidIntersection(cubeToDirection(tile.face, u0, v0 + step, this._tmpDir), this.a, this.b, new THREE.Vector3());
    const n = ellipsoidNormal(a, this.a, this.b, new THREE.Vector3());
    return b.sub(a).cross(c.sub(a)).dot(n) < 0;
  }

  _needsReversedWinding(positions, normals, seg) {
    const ia = 0;
    const ib = 1;
    const ic = seg + 1;
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const e1x = positions[ib * 3] - ax, e1y = positions[ib * 3 + 1] - ay, e1z = positions[ib * 3 + 2] - az;
    const e2x = positions[ic * 3] - ax, e2y = positions[ic * 3 + 1] - ay, e2z = positions[ic * 3 + 2] - az;
    // geometric normal = e1 x e2
    const gx = e1y * e2z - e1z * e2y;
    const gy = e1z * e2x - e1x * e2z;
    const gz = e1x * e2y - e1y * e2x;
    const dot = gx * normals[0] + gy * normals[1] + gz * normals[2];
    return dot < 0;
  }

  _replaceGeometry(tile) {
    if (!tile.mesh) return;
    tile.geometryVersion = (tile.geometryVersion ?? 0) + 1;
    const newGeometry = this._buildTileGeometry(tile);
    const oldGeometry = tile.mesh.geometry;
    tile.mesh.geometry = newGeometry;
    tile.geometry = newGeometry;
    if (oldGeometry && oldGeometry !== newGeometry) {
      oldGeometry.dispose();
      oldGeometry.userData.waterGeometry?.dispose();
    }
    this._updateTileWater(tile);
  }

  /**
   * Samples the resident terrain at a geodetic lat/lon (degrees). Returns null
   * when no height tile covering the point is resident. `heightMeters` includes
   * the displacement multiplier (it is the rendered surface height);
   * `rawHeightMeters` is the baked height.
   */
  sampleTerrainHeight(latDeg, lonDeg) {
    if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return null;

    const direction = latLonToDirection(
      latDeg * DEG2RAD, lonDeg * DEG2RAD, this._tmpDir, this.planetE2);
    return this._sampleTerrainHeightAtDirection(direction);
  }

  // Terrain heights from a fixed tile: the deepest in the manifests (base or overlays) that covers the
  // unit direction `direction` (planet group frame), down to maxLod, whatever is loaded for display. For
  // things placed from the terrain that must come out the same wherever the camera has been (see
  // src/scene/Sailboats.js). Resolves to a function of a unit direction giving the height in metres
  // (null outside the tile), or to null where there is no terrain data. Each tile is fetched once.
  async fixedHeightSampler(direction, maxLod) {
    await this.manifestLoaded;
    const f = directionToFaceUV(direction, {});
    for (let lod = Math.min(maxLod, this.maxAvailableLod); lod >= 0; lod--) {
      const count = 1 << lod, span = 2 / count;
      const x = Math.min(count - 1, Math.max(0, Math.floor((f.u + 1) / span)));
      const y = Math.min(count - 1, Math.max(0, Math.floor((f.v + 1) / span)));
      const key = tileKey(f.face, lod, x, y);
      const meta = this.manifestTileMap.get(key);
      if (!meta) continue;
      this._fixedHeights ??= new Map();
      if (this._fixedHeights.size > 4000) this._fixedHeights.clear();
      let sampler = this._fixedHeights.get(key);
      if (!sampler) {
        sampler = this._fetchFixedHeights({ id: key, face: f.face, lod, x, y }, meta);
        this._fixedHeights.set(key, sampler);
      }
      return sampler;
    }
    return null;
  }

  async _fetchFixedHeights(tile, meta) {
    const response = await fetch(this._heightUrl(tile)).catch(() => null);
    if (!response?.ok) return null;
    const samples = new Uint16Array(await response.arrayBuffer());
    const w = meta.width ?? 64, h = meta.height ?? 64;
    if (samples.length !== w * h) return null;
    const min = this.heightMinMeters, max = this.heightMaxMeters;
    const span = 2 / (1 << tile.lod), uv = {};
    return (direction) => {
      directionToUVOnFace(direction, tile.face, uv);
      const u01 = (uv.u + 1) / span - tile.x, v01 = (uv.v + 1) / span - tile.y;
      if (!(u01 >= 0 && u01 <= 1 && v01 >= 0 && v01 <= 1)) return null;
      const px = u01 * (w - 1), py = v01 * (h - 1);
      const x0 = Math.min(w - 2, Math.floor(px)), y0 = Math.min(h - 2, Math.floor(py));
      const tx = px - x0, ty = py - y0, i = y0 * w + x0;
      const top = samples[i] + (samples[i + 1] - samples[i]) * tx;
      const bottom = samples[i + w] + (samples[i + w + 1] - samples[i + w]) * tx;
      return decodeHeightU16(top + (bottom - top) * ty, min, max);
    };
  }

  // Same as sampleTerrainHeight, for a unit direction in the planet group's local frame.
  _sampleTerrainHeightAtDirection(direction) {
    const faceUv = directionToFaceUV(direction, this._tmpFaceUV);
    const faceIndex = FACE_INDEX[faceUv.face];
    const globalU = clamp01((faceUv.u + 1) * 0.5);
    const globalV = clamp01((faceUv.v + 1) * 0.5);

    // Prefer the deepest resident height tile, falling back through loaded
    // ancestors. Tiles are streamed asynchronously, so absence is not an error.
    const deepest = this.groundData.length ? Math.max(this.maxAvailableLod, this.groundMaxLod) : this.maxAvailableLod;
    for (let lod = deepest; lod >= this.rootLod; lod--) {
      const count = 2 ** lod;
      const x = Math.min(count - 1, Math.floor(globalU * count));
      const y = Math.min(count - 1, Math.floor(globalV * count));
      const tile = this._getTile(faceIndex, lod, x, y);
      if (!tile?.heightGrid && (!tile?.heightSamples || !tile.heightWidth || !tile.heightHeight)) continue;
      const localU = globalU * count - x;
      const localV = globalV * count - y;
      const raw = this._sampleHeight(tile, localU, localV);
      return {
        heightMeters: raw * this.displacementScaleMultiplier,
        rawHeightMeters: raw,
        face: faceUv.face,
        lod,
        x,
        y,
        u: localU,
        v: localV,
        tileId: tile.id,
      };
    }
    return null;
  }

  _latLonArgs(dir) {
    const ll = this._latLon(dir, this._tmpLatLon);
    return [ll.lat, ll.lon];
  }

  _ensureChildren(tile) {
    const l = tile.lod + 1;
    // Keep a stable 4-slot array. Eviction may null out individual slots (see
    // _disposeTile) while siblings stay live, so refill only the vacated (or
    // disposed) slots rather than rebuilding the whole quad.
    if (!tile.children) tile.children = [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      const existing = tile.children[i];
      if (existing && !existing.disposed) continue;
      const child = this._getOrCreateTile(tile.face, l, tile.x * 2 + (i & 1), tile.y * 2 + (i >> 1), tile);
      if (tile.childrenGenerated && !child.ground) {
        child.ground = tile.ground ?? this._groundFor(tile);
        child.colorTile = tile.colorTile ?? tile;
        child.meta = DEFAULT_TILE_META;
        // (Its distance from the camera judged from the ground's height there until its own heights are made.)
        this._updateTileBounds(child);
        const h = child.ground.height(...this._latLonArgs(child.centerDir));
        child.refHeight = h === h ? h : tile.refHeight;
        child.boundsValid = false;
      }
      this._ensureTileMesh(child);
      tile.children[i] = child;
    }
  }

  // ---------------------------------------------------------------------------
  // Visibility application
  // ---------------------------------------------------------------------------

  _applyVisibility() {
    const visibleAssets = new Set();
    for (const tile of this.tiles.values()) {
      if (!tile.mesh) continue;
      const visible = tile.visibleFrame === this.frame;
      tile.visible = visible;
      tile.mesh.visible = visible;
      if (visible && tile.ready) {
        // (A generated tile shows its baked ancestor's imagery, and the ground data's.)
        visibleAssets.add(this.tileSourceMap.get((tile.colorTile ?? tile).id)?.name ?? this.assets[0]?.name);
        if (tile.ground) visibleAssets.add(tile.ground.name);
      }
      if (visible && tile.ready && this.debugStats.startupTrace.firstVisibleReadyMs == null) {
        this._traceFirst('firstVisibleReadyMs', tile, 'firstVisibleReadyTileId');
      }
      if (visible && tile.ready) this._recordStartupTileEvent(tile, 'visible');
      if (visible && tile.mesh.parent !== this.group) {
        this.group.add(tile.mesh);
      }
    }
    if (this.debugMode !== 'none') this._applyDebugColors();
    const names = [...visibleAssets].filter(Boolean).sort();
    const key = names.join(',');
    if (key !== this._visibleAssetsKey) {
      this._visibleAssetsKey = key;
      this.onVisibleAssets?.(names);
    }
  }

  // True if tile a counts as coarser than tile b where they meet: a lower level; or at the same level, a plain baked
  // tile against one with the region's heights (heightGrid: a baked tile with the look), and either against a
  // generated one.
  _coarserThan(a, b) {
    if (a.lod !== b.lod) return a.lod < b.lod;
    const rank = (t) => (t.ground ? 2 : t.heightGrid ? 1 : 0);
    return rank(a) < rank(b);
  }

  // The drawn tile across from this one at (dx, dy) tiles away (an edge or diagonal neighbour), if it is coarser
  // than this one (see _coarserThan); else null.
  _coarserNeighbour(tile, dx, dy) {
    const tc = 2 ** tile.lod;
    let nfaceIndex = tile.faceIndex, nx = tile.x + dx, ny = tile.y + dy;
    if (nx < 0 || ny < 0 || nx >= tc || ny >= tc) {
      const span = 2 / tc;
      cubeToDirection(tile.face, -1 + (nx + 0.5) * span, -1 + (ny + 0.5) * span, this._tmpMorphDir);
      directionToFaceUV(this._tmpMorphDir, this._tmpFaceUV);
      nfaceIndex = FACE_INDEX[this._tmpFaceUV.face];
      nx = Math.min(tc - 1, Math.max(0, Math.floor((this._tmpFaceUV.u + 1) * 0.5 * tc)));
      ny = Math.min(tc - 1, Math.max(0, Math.floor((this._tmpFaceUV.v + 1) * 0.5 * tc)));
    }
    for (let d = 0; tile.lod - d >= this.rootLod; d++) {
      const n = this._getTile(nfaceIndex, tile.lod - d, Math.floor(nx / 2 ** d), Math.floor(ny / 2 ** d));
      if (n && n.visibleFrame === this.frame && n.ready && n.mesh?.geometry) return this._coarserThan(n, tile) ? n : null;
    }
    return null;
  }

  // Each visible tile's boundary sources (the coarser drawn tiles its boundary takes its positions from: see
  // _buildTileGeometry), rebuilding it when they, or their geometry, change. Coarser tiles first, so a tile sees its
  // sources' geometry as it will be drawn this frame.
  _updateEdgeMorph() {
    const order = this.visibleList.filter((t) => t.ready);
    const rank = (t) => (t.ground ? 2 : t.heightGrid ? 1 : 0);
    order.sort((a, b) => (a.lod - b.lod) || (rank(a) - rank(b)));
    const offsets = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const tile of order) {
      const sources = offsets.map(([dx, dy]) => this._coarserNeighbour(tile, dx, dy));
      const key = sources.map((n) => (n ? `${n.numKey}:${n.geometryVersion}` : '')).join('|');
      if (key !== tile.boundaryKey) {
        tile.boundaryKey = key;
        tile.boundarySources = sources;
        // (Kept for the debug stats and the sea's far variant: the edges' level differences.)
        tile.edgeSteps = sources.slice(0, 4).map((n) => (n ? 2 ** (tile.lod - n.lod) : 1));
        tile.edgeNeighbors = sources.slice(0, 4);
        this._replaceGeometry(tile);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  // Marks a tile as wanted this frame with a freshly computed priority.
  _want(tile) {
    if (tile.wantedFrame === this.frame) return;
    tile.wantedFrame = this.frame;
    tile.priority = this._computePriority(tile);
    if (tile.ground) { this._requestGround(tile); return; }
    if (tile.loading || tile.loaded || tile.retryScheduled || !this.hasAssets) return;
    if (tile.queuedAtMs === 0) {
      tile.queuedAtMs = performance.now();
      this._traceFirst('firstEnqueueMs', tile, 'firstEnqueueTileId');
      this._recordStartupTileEvent(tile, 'enqueue');
    }
    this.wantedTiles.push(tile);
  }

  _processQueue() {
    // Wait for the manifest so tiles load with correct dimensions/meta.
    if (!this.manifestReady || !this.hasAssets) return;
    const free = this.maxConcurrentLoads - this.inflightLoads;
    const wanted = this.wantedTiles;
    if (free <= 0 || wanted.length === 0) return;
    if (wanted.length > free) wanted.sort(byPriorityDesc);
    let started = 0;
    for (let i = 0; i < wanted.length && started < free; i++) {
      const tile = wanted[i];
      if (tile.disposed || tile.loaded || tile.loading || tile.retryScheduled) continue;
      // Loads can be wanted before the manifest arrives. Skip any that the
      // resolved sparse manifest says do not exist instead of issuing 404s.
      if (this.manifest?.tiles && !this.manifestTileMap.has(tile.id)) continue;
      this._loadTile(tile);
      started += 1;
    }
  }

  _addTileBytes(tile, bytes) {
    tile.estimatedBytes += bytes;
    this.debugStats.gpuBytes += bytes;
  }

  async _loadTile(tile) {
    tile.loading = true;
    tile.uploaded = false;
    tile.loadGeneration += 1;
    const generation = tile.loadGeneration;
    tile.abortController = new AbortController();
    const signal = tile.abortController.signal;
    tile.debugColorFetchMs = 0;
    tile.debugColorTransferBytes = 0;
    tile.debugHeightFetchMs = 0;
    tile.debugHeightTransferBytes = 0;
    const sourceKey = this._getTileSourceKey(tile);
    const sourceStats = this._getSourceStats(sourceKey);
    const lodStats = this._getLodStats(sourceStats, tile.lod);
    const loadStartedAt = performance.now();
    const queueWaitMs = tile.queuedAtMs > 0 ? Math.max(0, loadStartedAt - tile.queuedAtMs) : 0;
    tile.queuedAtMs = 0;
    tile.loadStartedAtMs = loadStartedAt;
    tile.debugSourceKey = sourceKey;
    this._traceFirst('firstLoadStartedMs', tile, 'firstLoadTileId');
    this._recordStartupTileEvent(tile, 'start');
    this.debugStats.loadStarted += 1;
    sourceStats.loadStarted += 1;
    lodStats.loadStarted += 1;
    this.inflightLoads += 1;
    this.debugStats.maxInflight = Math.max(this.debugStats.maxInflight, this.inflightLoads);

    // Only fetch the streams that are still missing: a previous attempt may
    // already have delivered one of them.
    const needColor = !tile.colorReady;
    const needHeight = !tile.heightReady;
    let colorMs = 0;
    let heightMs = 0;
    const metrics = (outcome) => ({
      queueWaitMs,
      colorMs,
      heightMs,
      loadMs: performance.now() - loadStartedAt,
      colorFetchMs: tile.debugColorFetchMs || 0,
      heightFetchMs: tile.debugHeightFetchMs || 0,
      colorTransferBytes: tile.debugColorTransferBytes || 0,
      heightTransferBytes: tile.debugHeightTransferBytes || 0,
      outcome,
    });

    try {
      const startedAt = performance.now();
      const colorPromise = needColor
        ? this._loadColor(tile, signal).finally(() => { colorMs = performance.now() - startedAt; })
        : Promise.resolve(null);
      const heightPromise = needHeight
        ? this._loadHeight(tile, signal).finally(() => { heightMs = performance.now() - startedAt; })
        : Promise.resolve(null);
      const [colorResult, heightResult] = await Promise.allSettled([colorPromise, heightPromise]);

      // Evicted (or superseded) while the request was in flight: drop the data.
      if (tile.disposed || tile.loadGeneration !== generation) {
        if (colorResult.status === 'fulfilled' && colorResult.value) colorResult.value.dispose();
        this._recordLoadMetrics(sourceStats, lodStats, metrics('superseded'));
        return;
      }

      if (needColor && colorResult.status === 'fulfilled') {
        const texture = colorResult.value;
        tile.texture = texture; // null => tolerated missing color (flat material)
        tile.colorReady = true;
        if (texture) this._addTileBytes(tile, this._estimateTextureBytes(texture));
        this._recordStartupTileEvent(tile, 'colorDone');
      }
      if (needHeight && heightResult.status === 'fulfilled') {
        const height = heightResult.value;
        tile.heightSamples = height.samples;
        tile.heightWidth = height.width;
        tile.heightHeight = height.height;
        tile.minHeightMeters = height.minHeightMeters;
        tile.maxHeightMeters = height.maxHeightMeters;
        tile.heightReady = true;
        this._addTileBytes(tile, height.samples.byteLength || 0);
        this._recordStartupTileEvent(tile, 'heightDone');
      }

      if (tile.loaded) {
        this._recordLoadMetrics(sourceStats, lodStats, metrics('success'));
        this._traceFirst('firstLoadFinishedMs', tile, 'firstFinishedTileId');
        this._uploadQueue.push(tile);
        this._recordStartupTileEvent(tile, 'apply');
        return;
      }

      // At least one stream failed.
      const error = colorResult.status === 'rejected' ? colorResult.reason : heightResult.reason;
      if (signal.aborted) return;
      tile.loadAttempts += 1;
      if (tile.loadAttempts < this.maxLoadAttempts) {
        this._recordLoadMetrics(sourceStats, lodStats, metrics('retry'));
        // Transient failure (e.g. net::ERR_NETWORK_CHANGED). Leave the tile
        // un-ready and let selection want it again after an exponential backoff
        // so a brief network blip has time to clear before the next attempt.
        const delay = Math.min(
          this.retryMaxDelayMs,
          this.retryBaseDelayMs * 2 ** (tile.loadAttempts - 1),
        );
        tile.retryScheduled = true;
        if (tile.retryTimer) clearTimeout(tile.retryTimer);
        tile.retryTimer = setTimeout(() => {
          tile.retryTimer = null;
          tile.retryScheduled = false;
        }, delay);
        return;
      }
      this._recordLoadMetrics(sourceStats, lodStats, metrics('failed'));
      console.warn(
        `[planet] tile load gave up ${tile.id} ` +
        `after ${tile.loadAttempts} attempts, using flat fallback:`,
        error?.message || error,
      );
      this.debugStats.droppedLoads += 1;
      // Mark the missing streams ready with flat data so selection can progress.
      if (!tile.heightReady) {
        tile.heightSamples = null;
        tile.heightWidth = 0;
        tile.heightHeight = 0;
        tile.heightReady = true;
      }
      tile.colorReady = true;
      this._uploadQueue.push(tile);
    } finally {
      if (tile.loadGeneration === generation) {
        tile.loading = false;
        tile.abortController = null;
      }
      this.inflightLoads -= 1;
    }
  }

  _colorUrl(tile) {
    const src = this.tileSourceMap.get(tile.id);
    const colorBase = src ? src.colorBasePath : this.colorBasePath;
    return `${colorBase}/${tile.face}/${tile.lod}/${tile.x}/${tile.y}.ktx2`;
  }

  _heightUrl(tile) {
    const src = this.tileSourceMap.get(tile.id);
    const heightBase = src ? src.heightBasePath : this.heightBasePath;
    return `${heightBase}/${tile.face}/${tile.lod}/${tile.x}/${tile.y}.bin`;
  }

  async _loadColor(tile, signal) {
    const url = this._colorUrl(tile);
    const startedAt = performance.now();
    const trace = this.debugStats.startupTrace;
    try {
      const texture = await this.ktx2Loader.loadAsync(url);
      if (this.traceEnabled) {
        const timing = this._getLatestResourceTiming(url, startedAt);
        tile.debugColorFetchMs = timing ? Math.max(0, timing.responseEnd - timing.startTime) : 0;
        tile.debugColorTransferBytes = timing?.transferSize || 0;
        const fetchEndMs = timing ? Math.max(0, timing.responseEnd - trace.t0Ms) : (performance.now() - trace.t0Ms);
        this._recordStartupTileEvent(tile, 'colorFetch', fetchEndMs);
      } else {
        tile.debugColorFetchMs = performance.now() - startedAt;
      }
      if (signal.aborted) { texture.dispose(); return null; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; // GPU-compressed; matches the generator's row order
      texture.anisotropy = this.textureAnisotropy;
      texture.needsUpdate = true;
      return texture;
    } catch (error) {
      tile.debugColorFetchMs = 0;
      tile.debugColorTransferBytes = 0;
      if (this.requireKtx2) return null;
      throw error;
    }
  }

  async _loadHeight(tile, signal) {
    const meta = tile.meta || this._getTileMeta(tile);
    const width = meta.width ?? 64;
    const height = meta.height ?? 64;
    const minHeightMeters = this.heightMinMeters;
    const maxHeightMeters = this.heightMaxMeters;

    const url = this._heightUrl(tile);
    const startedAt = performance.now();
    const trace = this.debugStats.startupTrace;
    // Tiles are immutable build outputs: use normal HTTP caching.
    const response = await fetch(url, { signal });

    if (!response.ok) {
      tile.debugHeightFetchMs = 0;
      tile.debugHeightTransferBytes = 0;
      this._recordStartupTileEvent(tile, 'heightFetch');
      if (response.status === 404) {
        return { width, height, minHeightMeters, maxHeightMeters, samples: new Uint16Array(width * height) };
      }
      throw new Error(`height fetch ${response.status} for ${url}`);
    }

    const buffer = await response.arrayBuffer();
    if (this.traceEnabled) {
      const timing = this._getLatestResourceTiming(url, startedAt);
      tile.debugHeightFetchMs = timing ? Math.max(0, timing.responseEnd - timing.startTime) : 0;
      tile.debugHeightTransferBytes = timing?.transferSize || 0;
      const fetchEndMs = timing ? Math.max(0, timing.responseEnd - trace.t0Ms) : (performance.now() - trace.t0Ms);
      this._recordStartupTileEvent(tile, 'heightFetch', fetchEndMs);
    } else {
      tile.debugHeightFetchMs = performance.now() - startedAt;
      tile.debugHeightTransferBytes = buffer.byteLength;
    }
    const samples = new Uint16Array(buffer);
    let outWidth = width;
    let outHeight = height;
    if (samples.length !== width * height) {
      // Height tiles are always square, so the .bin is self-describing. Trust its
      // actual size over the manifest metadata when they disagree (e.g. after a
      // partial/mixed re-bake or manual file copy) so decoding stays correct
      // instead of reading past the buffer or misindexing the grid.
      const side = Math.round(Math.sqrt(samples.length));
      if (side > 0 && side * side === samples.length) {
        outWidth = side;
        outHeight = side;
      } else {
        console.warn(`[planet] height size mismatch ${tile.id}: got ${samples.length}, expected ${width * height}`);
      }
    }
    return { width: outWidth, height: outHeight, minHeightMeters, maxHeightMeters, samples };
  }

  // Rebuilds geometry (with height) and swaps the streamed color map into place.
  // Uploads newly loaded tiles' textures and applies their data, within TILE_UPLOAD_BUDGET_MS per
  // frame; a tile is drawn (ready) only once uploaded, and until then its parent stays in view.
  _uploadTiles() {
    const queue = this._uploadQueue;
    if (queue.length === 0) return;
    const budget = PixelLOD.buildBudget === Infinity ? Infinity : TILE_UPLOAD_BUDGET_MS;
    const start = performance.now();
    let done = 0;
    while (done < queue.length && (done === 0 || performance.now() - start < budget)) {
      const tile = queue[done++];
      if (tile.disposed || !tile.loaded) continue;
      if (tile.texture && this.renderer) this.renderer.initTexture(tile.texture);
      this._applyTileData(tile);
      tile.uploaded = true;
    }
    queue.splice(0, done);
  }

  _applyTileData(tile) {
    if (!tile.mesh || tile.disposed) return;
    tile.groundLookChecked = this.manifestVersion;
    this._groundLookForBaked(tile);

    this._replaceGeometry(tile);

    const texture = tile.texture ?? tile.colorTile?.texture ?? null;
    if (texture && this.debugMode === 'none') {
      tile.material.map = texture;
      tile.material.color.set(0xffffff);
      tile.material.needsUpdate = true;
    }
    if (tile.waterMesh && texture && tile.waterMesh.material.map !== texture) {
      tile.waterMesh.material.map = texture;
      tile.waterMesh.material.color.set(0xffffff);
      tile.waterMesh.material.needsUpdate = true;
    }
    // Use a uniform finish across all tiles; deriving roughness from per-tile
    // terrain variance makes refined regions visibly matte/shiny vs their parent.
    tile.material.roughness = 1;
  }

  // ---------------------------------------------------------------------------
  // Eviction (LRU, budget-bounded). Roots and ancestors-of-visible are protected.
  // ---------------------------------------------------------------------------

  _overBudget() {
    return this.tiles.size > this.maxTileCount || this.debugStats.gpuBytes > this.maxGpuBytes;
  }

  _evictLRU() {
    if (!this._overBudget()) return;

    const candidates = this._evictCandidates;
    candidates.length = 0;
    for (const tile of this.tiles.values()) {
      if (tile.lod === this.rootLod) continue;
      if (this.selectionRootIds.has(tile.id)) continue;
      // Selection touches every tile required to preserve the current view,
      // including off-screen siblings needed for an atomic parent-to-children
      // transition. Evicting one of those siblings makes the selector recreate
      // and reload it next frame, producing an endless coarse/detail cycle.
      if (tile.lastUsedFrame === this.frame) continue;
      if (tile.visibleFrame === this.frame) continue;
      if (this._isAncestorOfVisible(tile)) continue;
      candidates.push(tile);
    }
    // Least recently used first; deepest first among equals.
    candidates.sort((a, b) => (a.lastUsedFrame - b.lastUsedFrame) || (b.lod - a.lod));

    for (const tile of candidates) {
      if (!this._overBudget()) break;
      if (tile.disposed) continue; // already removed together with an ancestor
      this._disposeTile(tile, true);
    }
    candidates.length = 0;
  }

  _isAncestorOfVisible(tile) {
    if (!tile.children) return false;
    const stack = this._evictStack;
    stack.length = 0;
    for (const c of tile.children) if (c) stack.push(c);
    while (stack.length) {
      const t = stack.pop();
      if (t.visibleFrame === this.frame) { stack.length = 0; return true; }
      if (t.children) for (const c of t.children) if (c) stack.push(c);
    }
    return false;
  }

  // Disposes a tile and (first) all of its descendants, so no child is ever left
  // linked under a parent that no longer exists.
  _disposeTile(tile, countAsEviction = false) {
    if (tile.disposed) return;
    if (tile.children) {
      for (const child of tile.children) {
        if (!child || child.disposed || child.parent !== tile) continue;
        if (this.selectionRootIds.has(child.id) || child.lastUsedFrame === this.frame) {
          child.parent = null; // still needed this frame: just unlink
          continue;
        }
        this._disposeTile(child, countAsEviction);
      }
      tile.children = null;
    }

    tile.disposed = true;
    tile.loadGeneration += 1; // invalidates any in-flight load
    if (tile.abortController) {
      tile.abortController.abort();
      tile.abortController = null;
    }
    tile.loading = false;
    if (tile.retryTimer) {
      clearTimeout(tile.retryTimer);
      tile.retryTimer = null;
      tile.retryScheduled = false;
    }
    if (tile.mesh && tile.mesh.parent) tile.mesh.parent.remove(tile.mesh);
    if (tile.texture) { tile.texture.dispose(); tile.texture = null; }
    if (tile.mesh?.geometry) {
      tile.mesh.geometry.dispose();
      tile.mesh.geometry.userData.waterGeometry?.dispose();
    }
    if (tile.waterMesh) { tile.waterMesh.material.dispose(); tile.waterMesh = null; tile.waterUnderside = null; }
    if (tile.material && tile.material !== this.baseMaterial) tile.material.dispose();
    tile.heightSamples = null;
    tile.heightGrid = null;
    this.debugStats.gpuBytes = Math.max(0, this.debugStats.gpuBytes - tile.estimatedBytes);
    tile.estimatedBytes = 0;

    // Detach ONLY this tile from its parent's child list, leaving live siblings
    // in place.
    const parent = tile.parent;
    if (parent && parent.children) {
      const idx = parent.children.indexOf(tile);
      if (idx !== -1) parent.children[idx] = null;
    }
    tile.parent = null;

    if (this.tiles.get(tile.numKey) === tile) this.tiles.delete(tile.numKey);
    if (countAsEviction) {
      this.debugStats.evictedTiles += 1;
      this._getSourceStats(this._getTileSourceKey(tile)).evictedTiles += 1;
    }
  }

  /**
   * Debugging: how well the drawn tiles meet. For every vertex on every edge of every drawn tile, the drawn tile on
   * the other side of the edge and the gap (m) between that vertex and its edge there (straight between its own
   * vertices, as it is drawn). Edges on screen with no drawn tile beyond them are counted as uncovered. camera: the
   * camera (to tell which edges are on screen). Returns { edges, maxGap, over5cm, over1m, uncovered, worst: [...] }.
   */
  measureSeams(camera) {
    const seg = this.segments, visible = new Map();
    for (const t of this.visibleList) if (t.ready && t.mesh?.geometry) visible.set(t.id, t);
    const find = (dir) => {
      const f = directionToFaceUV(dir, {});
      for (let lod = Math.max(this.maxAvailableLod, this.groundMaxLod); lod >= 0; lod--) {
        const n = 2 ** lod, x = Math.min(n - 1, Math.floor((f.u + 1) / 2 * n)), y = Math.min(n - 1, Math.floor((f.v + 1) / 2 * n));
        const t = visible.get(tileKey(f.face, lod, x, y));
        if (t) return t;
      }
      return null;
    };
    const vertex = (t, i, out) => {
      const p = t.mesh.geometry.attributes.position;
      return out.set(p.getX(i), p.getY(i), p.getZ(i)).add(t.center);
    };
    const toWorld = this.group.matrixWorld, frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const a = new THREE.Vector3(), b0 = new THREE.Vector3(), b1 = new THREE.Vector3(), dir = new THREE.Vector3(), w = new THREE.Vector3();
    // (Separately for edges with a generated tile on either side: baked tiles have long-standing gaps of their own
    // where asset sets meet, far off.)
    const out = { edges: 0, maxGap: 0, over5cm: 0, over1m: 0, uncovered: 0, worst: [],
      generated: { edges: 0, maxGap: 0, over5cm: 0, over1m: 0, uncovered: 0 } };
    for (const t of visible.values()) {
      const span = 2 / 2 ** t.lod, u0 = -1 + t.x * span, v0 = -1 + t.y * span;
      for (let e = 0; e < 4; e++) {
        let edgeGap = 0, edgeUncovered = 0, other = null;
        for (let i = 0; i <= seg; i++) {
          const [x, y] = e === 0 ? [i, 0] : e === 1 ? [i, seg] : e === 2 ? [0, i] : [seg, i];
          vertex(t, y * (seg + 1) + x, a);
          // (Just across the edge, by a hair (a small fraction of the finest tile's step, whatever this tile's level:
          // a coarse tile's neighbour can be ten levels finer), and a hair along it, inwards, so a corner is the
          // neighbour's across this edge, not the diagonal one's.)
          const hair = Math.min(0.25, 0.01 * 2 ** (t.lod - this.groundMaxLod));
          const along = i < seg / 2 ? hair : -hair;
          const du = e === 2 ? -hair : e === 3 ? hair : along, dv = e === 0 ? -hair : e === 1 ? hair : along;
          cubeToDirection(t.face, u0 + span * (x + du) / seg, v0 + span * (y + dv) / seg, dir);
          const n = find(dir);
          if (!n) {
            if (frustum.containsPoint(w.copy(a).applyMatrix4(toWorld))) edgeUncovered++;
            continue;
          }
          if (n === t) continue;
          other = n;
          // The neighbour's own edge at this vertex's direction: straight between its two edge vertices there.
          cubeToDirection(t.face, u0 + span * x / seg, v0 + span * y / seg, dir);
          const nf = directionToUVOnFace(dir, n.face, {}), nSpan = 2 / 2 ** n.lod;
          const nu = ((nf.u + 1) / nSpan - n.x) * seg, nv = ((nf.v + 1) / nSpan - n.y) * seg;
          const alongU = Math.min(Math.abs(nu), Math.abs(nu - seg)) > Math.min(Math.abs(nv), Math.abs(nv - seg));
          const tt = Math.min(seg, Math.max(0, alongU ? nu : nv)), k = Math.min(seg - 1, Math.floor(tt)), f = tt - k;
          const fixed = Math.round(alongU ? nv : nu);
          const at = (q) => (alongU ? fixed * (seg + 1) + q : q * (seg + 1) + fixed);
          vertex(n, at(k), b0); vertex(n, at(k + 1), b1);
          const gap = a.distanceTo(b0.lerp(b1, f));
          edgeGap = Math.max(edgeGap, gap);
        }
        for (const o of t.ground || other?.ground ? [out, out.generated] : [out]) {
          o.edges++;
          if (edgeUncovered) o.uncovered++;
          o.maxGap = Math.max(o.maxGap, edgeGap);
          if (edgeGap > 0.05) o.over5cm++;
          if (edgeGap > 1) o.over1m++;
        }
        if ((edgeGap > 0.05 || edgeUncovered) && (t.ground || other?.ground)) {
          out.worst.push({ tile: t.id, edge: e, neighbor: other?.id ?? null, gap: +edgeGap.toFixed(2), uncovered: edgeUncovered,
            generated: !!t.ground, neighborGenerated: !!other?.ground });
        }
      }
    }
    out.maxGap = +out.maxGap.toFixed(3);
    out.generated.maxGap = +out.generated.maxGap.toFixed(3);
    out.worst.sort((p, q) => q.gap - p.gap || q.uncovered - p.uncovered);
    out.worst.length = Math.min(out.worst.length, 12);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Public controls
  // ---------------------------------------------------------------------------

  // When disabled, update() does nothing (no selection, no streaming).
  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  setDebugMode(mode) {
    this.debugMode = mode || 'none';
    if (this.debugMode === 'none') {
      // Restore streamed textures.
      for (const tile of this.tiles.values()) {
        if (!tile.material) continue;
        tile.material.wireframe = false;
        if (tile.texture) {
          tile.material.map = tile.texture;
          tile.material.color.set(0xffffff);
        } else {
          tile.material.map = null;
          tile.material.color.copy(this.baseMaterial.color);
        }
        tile.material.needsUpdate = true;
      }
    } else {
      this._applyDebugColors();
    }
  }

  setDoubleSided(doubleSided) {
    const side = doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    for (const material of this._allMaterials()) {
      if (material.side === side) continue;
      material.side = side;
      material.needsUpdate = true;
    }
  }

  // Opacity in [0,1] for the base material and every current tile material
  // (future tiles inherit it from the base material).
  setOpacity(value) {
    const opacity = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
    this.opacity = opacity;
    const transparent = opacity < 1;
    for (const material of this._allMaterials()) {
      material.opacity = opacity;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.depthWrite = !transparent;
        material.needsUpdate = true;
      }
    }
  }

  // Changes the terrain exaggeration and rebuilds every resident tile.
  setDisplacementScale(multiplier) {
    const m = Math.max(0, Number(multiplier) || 0);
    if (m === this.displacementScaleMultiplier) return;
    this.displacementScaleMultiplier = m;
    for (const tile of this.tiles.values()) {
      tile.boundsValid = false;
      this._updateTileBounds(tile);
      if (tile.mesh) this._replaceGeometry(tile);
    }
  }

  *_allMaterials() {
    yield this.baseMaterial;
    for (const tile of this.tiles.values()) {
      if (tile.material) yield tile.material;
    }
  }

  // Intersections with the currently displayed tiles only (coarse parents that
  // are hidden while their children are shown are ignored), nearest first.
  raycast(raycaster, intersects = []) {
    if (!this.group.visible) return intersects;
    this.group.updateWorldMatrix(true, false);
    for (const tile of this.visibleList) {
      const mesh = tile.mesh;
      if (!mesh || !mesh.visible || tile.disposed) continue;
      if (!raycaster.layers.test(mesh.layers)) continue;
      mesh.updateWorldMatrix(false, false);
      mesh.raycast(raycaster, intersects);
    }
    intersects.sort((a, b) => a.distance - b.distance);
    return intersects;
  }

  _applyDebugColors() {
    const mode = this.debugMode;
    const color = this._tmpColor;
    for (const tile of this.visibleList) {
      if (!tile.material) continue;
      const meta = tile.meta || this._getTileMeta(tile);
      let wireframe = false;

      switch (mode) {
        case 'tileBorders':
          wireframe = true;
          color.setHex(0x00ff88);
          break;
        case 'lod':
          colorRamp01(tile.lod / Math.max(1, this.maxAvailableLod), color);
          break;
        case 'ground': // (generated tiles by level, 10 blue to 20 red; baked ones grey, lighter the deeper)
          if (tile.ground) colorRamp01((tile.lod - 10) / 10, color);
          else color.setRGB(0.1 + tile.lod * 0.05, 0.1 + tile.lod * 0.05, 0.1 + tile.lod * 0.05);
          break;
        case 'priority':
          colorRamp01(clamp01(tile.priority / 5e6), color);
          break;
        case 'roughness':
          colorRamp01(clamp01((meta.roughness ?? 0) * 6), color);
          break;
        case 'landWater':
          color.setRGB(clamp01(meta.landFraction ?? 0.5), 0.3, clamp01(meta.waterFraction ?? 0.5));
          break;
        case 'loading':
          color.setHex(tile.ready ? 0x2266ff : tile.loading ? 0xffaa00 : 0xff2244);
          break;
        default:
          color.setHex(0x8aa7c2);
          break;
      }

      const material = tile.material;
      material.color.copy(color);
      // Colour changes are plain uniform updates; only a change of map or
      // wireframe needs a program/state refresh.
      if (material.map !== null || material.wireframe !== wireframe) {
        material.map = null;
        material.wireframe = wireframe;
        material.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const tile of [...this.tiles.values()]) this._disposeTile(tile);
    this.tiles.clear();
    this.visibleList.length = 0;
    this.wantedTiles.length = 0;
    this.baseMaterial.dispose();
  }
}
