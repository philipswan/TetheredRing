import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// =============================================================================
// planet2.js - Performant cubed-sphere quadtree LOD planet renderer.
//
// Design notes
// ------------
// The offline asset generator (tools/generate_planet2_lod0_assets.py) bakes every
// cube face and tile by sampling the source equirectangular textures through the
// SAME `cube_to_direction(face, u, v)` mapping used here, with no per-face flips.
// Therefore the runtime mapping is intentionally DIRECT and self-consistent:
//
//   * asset face name        == runtime face name           (no +Z/-Z swap)
//   * geometry UV            == (u01, v01) within the tile   (no per-vertex flip)
//   * height sample location == (u01, v01) within the tile   (same as UV)
//   * KTX2 textures use flipY = false (GPU-compressed default), which matches the
//     generator's row order (image row 0 == tile-local v == 0).
//
// Any whole-planet alignment with the surrounding app coordinate frame is a single
// rigid rotation applied to the planetMeshes group (PLANET_YAW), never a per-tile
// transform. This keeps multi-tile (LOD >= 1) layouts from mirroring/scrambling.
// =============================================================================

const FACE_NAMES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
// WGS84 first-eccentricity squared, used to convert geocentric<->geodetic latitude
// so terrain maps (geodetic) align with the cubed-sphere geometry.
const WGS84_E2 = 2 / 298.257223563 - 1 / (298.257223563 * 298.257223563);

// Whole-planet yaw used to align the baked longitude frame (lon = atan2(z, x))
// with the surrounding application's longitude system. This is a global rigid
// rotation only; it never affects per-tile correctness.
const PLANET_YAW = -Math.PI / 2;

const DEG2RAD = Math.PI / 180;

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
function colorRamp01(v) {
  return new THREE.Color().setHSL((1 - clamp01(v)) * 0.66, 1, 0.5);
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
function latLonToDirection(lat, lon, out) {
  const geoc = Math.atan2((1 - WGS84_E2) * Math.sin(lat), Math.cos(lat));
  const cl = Math.cos(geoc);
  return out.set(cl * Math.cos(lon), Math.sin(geoc), -cl * Math.sin(lon)).normalize();
}

// Decodes a Uint16 sample into meters using tile min/max height bounds.
function decodeHeightU16(sample, minMeters, maxMeters) {
  return minMeters + (sample / 65535) * (maxMeters - minMeters);
}

// -----------------------------------------------------------------------------
// PriorityQueue - binary max-heap keyed by numeric priority.
// -----------------------------------------------------------------------------

class PriorityQueue {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, priority) {
    const node = { item, priority };
    this.items.push(node);
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const end = this.items.pop();
    if (this.items.length > 0 && end) {
      this.items[0] = end;
      this._sinkDown(0);
    }
    return top.item;
  }

  clear() {
    this.items.length = 0;
  }

  _bubbleUp(n) {
    const element = this.items[n];
    while (n > 0) {
      const parentN = (n - 1) >> 1;
      const parent = this.items[parentN];
      if (element.priority <= parent.priority) break;
      this.items[parentN] = element;
      this.items[n] = parent;
      n = parentN;
    }
  }

  _sinkDown(n) {
    const length = this.items.length;
    const element = this.items[n];
    while (true) {
      const leftN = 2 * n + 1;
      const rightN = 2 * n + 2;
      let swap = null;
      let best = element.priority;

      if (leftN < length && this.items[leftN].priority > best) {
        swap = leftN;
        best = this.items[leftN].priority;
      }
      if (rightN < length && this.items[rightN].priority > best) {
        swap = rightN;
      }
      if (swap === null) break;
      this.items[n] = this.items[swap];
      this.items[swap] = element;
      n = swap;
    }
  }
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
    this.lod = lod;
    this.x = x;
    this.y = y;
    this.id = tileKey(face, lod, x, y);
    this.parent = parent;
    this.children = null;

    this.mesh = null;
    this.material = null;
    this.geometry = null;

    this.visible = false;
    this.colorReady = false;
    this.heightReady = false;
    this.loading = false;

    this.loadGeneration = 0;
    this.abortController = null;
    // Bounded retry bookkeeping: a transient color/height failure leaves the tile
    // un-ready so it is re-enqueued (after a backoff delay) up to maxLoadAttempts,
    // instead of permanently showing the flat light-blue fallback material.
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

    this.meta = null;

    // Per-edge coarse-neighbor step [T,B,L,R]. 1 = same/finer (no morph); 2^d = the
    // neighbor is d LODs coarser, so collapse all but every (2^d)th boundary vertex.
    this.edgeSteps = [1, 1, 1, 1];
    // Packed key of edgeSteps used for cheap change detection / rebuild trigger.
    this.edgeMask = 0;

    // Cached geometric bounds (local planet space).
    this.center = new THREE.Vector3();
    this.centerNormal = new THREE.Vector3(0, 1, 0);
    this.worldCenter = new THREE.Vector3();
    this.boundingRadius = 1;
    this.boundsValid = false;
  }

  // A tile is "ready" once both its color and height streams have resolved.
  get ready() {
    return this.colorReady && this.heightReady;
  }
}

// -----------------------------------------------------------------------------
// CubedSpherePlanetRenderer - the quadtree selector / streamer / renderer core.
// -----------------------------------------------------------------------------

class CubedSpherePlanetRenderer {
  constructor(options) {
    this.group = options.group;
    this.renderer = options.renderer || null;
    this.planetSpec = options.planetSpec;

    this.manifestUrl = options.manifestUrl;
    this.colorBasePath = options.colorBasePath;
    this.heightBasePath = options.heightBasePath;

    // Optional overlay asset layers (e.g. a high-res Hawaii cone) loaded on top of
    // the base after its manifest resolves. Each overlay tile overrides the base
    // tile at the same key and streams from the overlay's own color/height folders.
    // Shape: [{ name, manifestUrl, colorBasePath, heightBasePath }].
    this.overlays = Array.isArray(options.overlays) ? options.overlays : [];

    this.segments = Math.max(2, options.segments ?? 24);
    this.maxConcurrentLoads = Math.max(1, options.maxConcurrentLoads ?? 8);
    // How many times a tile whose color/height stream errors out is retried
    // before we give up and accept the flat fallback (avoids infinite spin on a
    // genuinely missing/broken tile while surviving transient failures such as
    // net::ERR_NETWORK_CHANGED, which can knock out every in-flight request for a
    // second or two). Retries use exponential backoff so we don't hammer the
    // network during an outage and burn every attempt within a few frames.
    this.maxLoadAttempts = Math.max(1, options.maxLoadAttempts ?? 6);
    this.retryBaseDelayMs = Math.max(1, options.retryBaseDelayMs ?? 200);
    this.retryMaxDelayMs = Math.max(this.retryBaseDelayMs, options.retryMaxDelayMs ?? 4000);
    // How many times a tile whose color/height stream errors out is retried
    // before we give up and accept the flat fallback (avoids infinite spin on a
    // genuinely missing/broken tile while surviving transient failures).
    this.maxLoadAttempts = Math.max(1, options.maxLoadAttempts ?? 4);
    this.maxTileCount = options.maxTileCount ?? 320;
    this.maxGpuBytes = options.maxGpuBytes ?? 700 * 1024 * 1024;
    this.rootLod = 0;
    this.maxAvailableLod = options.maxAvailableLod ?? 6;

    // Screen-space-error refine threshold, in pixels, with hysteresis so tiles
    // do not flicker between expand/collapse at the boundary.
    this.sseThreshold = options.sseThreshold ?? 3.5;
    this.hysteresisExpand = 1.25;
    this.hysteresisCollapse = 0.75;

    // Throttle high-LOD refinement while the camera moves quickly.
    this.fastCameraSpeed = options.fastCameraSpeed ?? Infinity;
    this.maxLodWhileFast = options.maxLodWhileFast ?? Infinity;

    this.requireKtx2 = options.requireKtx2 === true;
    this.displacementScaleMultiplier = Math.max(0, options.displacementScaleMultiplier ?? 1);

    this.locationInterests = (options.locationInterests || [
      { name: 'Mauna Kea', lat: 19.8207, lon: -155.4681, radiusKm: 80, lodBoost: 2 },
    ]).map((loc) => {
      const dir = latLonToDirection(loc.lat * DEG2RAD, loc.lon * DEG2RAD, new THREE.Vector3());
      return { ...loc, dir, lodBoost: loc.lodBoost ?? 1, radiusKm: loc.radiusKm ?? 80 };
    });

    // Ellipsoid (Y is the polar axis). b = a * (1 - f); f == 0 => sphere.
    this.a = this.planetSpec.ellipsoid.a;
    this.b = this.a * (1 - (this.planetSpec.ellipsoid.f || 0));
    this.meanRadius = (2 * this.a + this.b) / 3;

    // Caches and scheduling.
    this.indexBufferCache = new IndexBufferCache();
    this.priorityQueue = new PriorityQueue();
    this.queuedSet = new Set();
    this.inflightLoads = 0;

    this.tiles = new Map();
    this.visibleTiles = new Set();

    this.frame = 0;
    this.lastTimeSec = performance.now() * 0.001;
    this.lastCameraPos = new THREE.Vector3();
    this.cameraSpeedMps = 0;
    this.viewportHeight = (typeof window !== 'undefined') ? window.innerHeight : 1080;

    // Debug.
    this.debugMode = 'none';
    this.debugStats = {
      queue: 0, inflight: 0, loadedTiles: 0, visibleTiles: 0,
      gpuBytes: 0, evictedTiles: 0, droppedLoads: 0,
    };

    // Reusable temporaries (avoid per-frame allocation).
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.worldSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this.planetWorldCenter = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._tmpCamDir = new THREE.Vector3();
    this._tmpTileDir = new THREE.Vector3();
    this._tmpMorphDir = new THREE.Vector3();
    this._tmpFaceUV = { face: '+X', u: 0, v: 0 };

    // Shared base material; per-tile clones receive the streamed color map.
    this.baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x8aa7c2,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    this.manifest = null;
    this.manifestTileMap = new Map();
    // Maps a tile key to the asset layer that owns it (color/height base paths).
    // Only overlay-provided tiles are stored; base tiles fall back to
    // this.colorBasePath / this.heightBasePath, so this stays empty when no
    // overlays are active.
    this.tileSourceMap = new Map();
    // Loads are gated until the manifest resolves so every tile reads its real
    // dimensions/meta (roots are built synchronously before the async fetch).
    this.manifestReady = false;
    // Global height decode range (meters). All height tiles share one range, so it
    // lives at the top of the manifest rather than being repeated per tile.
    this.heightMinMeters = -200;
    this.heightMaxMeters = 8500;

    this.ktx2Loader = CubedSpherePlanetRenderer._getSharedKTX2Loader(this.renderer);

    this._initRoots();
    this._loadManifest();
  }

  // Creates / returns a single shared KTX2 loader and runs detectSupport once.
  static _getSharedKTX2Loader(renderer) {
    if (!CubedSpherePlanetRenderer._sharedLoader) {
      CubedSpherePlanetRenderer._sharedLoader = new KTX2Loader().setTranscoderPath('/basis/');
    }
    if (renderer && !CubedSpherePlanetRenderer._supportDetected) {
      CubedSpherePlanetRenderer._sharedLoader.detectSupport(renderer);
      CubedSpherePlanetRenderer._supportDetected = true;
    }
    return CubedSpherePlanetRenderer._sharedLoader;
  }

  // ---------------------------------------------------------------------------
  // Manifest + roots
  // ---------------------------------------------------------------------------

  async _loadManifest() {
    try {
      const response = await fetch(this.manifestUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`manifest fetch ${response.status}`);
      this.manifest = await response.json();
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
      // Tiles created before the manifest arrived (the six roots, built
      // synchronously in the constructor) cached the default meta. Refresh them
      // now so their real width/height (e.g. 128) is used for size validation.
      for (const tile of this.tiles.values()) {
        tile.meta = this._getTileMeta(tile);
      }
    } catch (error) {
      console.warn('[planet2] manifest load failed, using defaults', error);
    } finally {
      // Allow tile loads to proceed. On failure we run with default meta rather
      // than stalling the globe forever.
      this.manifestReady = true;
    }
  }

  // Fetch each overlay manifest and merge its tiles over the base. An overlay
  // entry wins over a same-key base entry, extends maxAvailableLod, and records
  // its color/height folders in tileSourceMap so _loadColor/_loadHeight stream
  // the overriding tiles from the overlay instead of the base asset root.
  async _loadOverlays() {
    for (const overlay of this.overlays) {
      if (!overlay || !overlay.manifestUrl) continue;
      try {
        const response = await fetch(overlay.manifestUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`overlay manifest fetch ${response.status}`);
        const data = await response.json();

        // Overlays must share the base height decode range: all height tiles are
        // sampled into one global [minHeight, maxHeight] u16 space, so a mismatch
        // would misdecode the overlay's displacement. Warn rather than silently
        // corrupt the terrain.
        const oMin = data.minHeight;
        const oMax = data.maxHeight;
        if ((oMin != null && oMin !== this.heightMinMeters) ||
            (oMax != null && oMax !== this.heightMaxMeters)) {
          console.warn(`[planet2] overlay "${overlay.name}" height range ` +
            `[${oMin}, ${oMax}] differs from base [${this.heightMinMeters}, ` +
            `${this.heightMaxMeters}]; terrain may not match at the seam.`);
        }

        if (data.maxAvailableLod != null) {
          this.maxAvailableLod = Math.max(this.maxAvailableLod, data.maxAvailableLod);
        }

        const source = {
          colorBasePath: overlay.colorBasePath,
          heightBasePath: overlay.heightBasePath,
        };
        let count = 0;
        if (data.tiles) {
          for (const [k, v] of Object.entries(data.tiles)) {
            this.manifestTileMap.set(k, v);
            this.tileSourceMap.set(k, source);
            count += 1;
          }
        }
        console.log(`[planet2] overlay "${overlay.name}" merged ${count} tiles`);
      } catch (error) {
        console.warn(`[planet2] overlay "${overlay.name}" load failed, skipping`, error);
      }
    }
  }

  // Six root tiles so a low-resolution globe is visible immediately.
  _initRoots() {
    for (const face of FACE_NAMES) {
      const tile = this._getOrCreateTile(face, this.rootLod, 0, 0, null);
      this._ensureTileMesh(tile);
      this.group.add(tile.mesh);
    }
  }

  _getOrCreateTile(face, lod, x, y, parent) {
    const id = tileKey(face, lod, x, y);
    let tile = this.tiles.get(id);
    if (tile) return tile;
    tile = new Tile(face, lod, x, y, parent);
    tile.meta = this._getTileMeta(tile);
    this.tiles.set(id, tile);
    return tile;
  }

  // Maps a runtime tile to its baked asset coords. The offline baker and this
  // renderer share the same cubeToDirection() convention and every cube face is
  // right-handed (tangent du x dv points outward), so geometry tiles map directly
  // to their baked files with NO flip. Keeping this an identity transform ensures
  // the content baked for a direction is displayed at that same direction (any
  // per-face mirror here would scramble geography and place refined tiles on the
  // mirrored longitude).
  _assetCoords(face, lod, x, y) {
    return { ax: x, ay: y };
  }

  // Sub-tile sample/UV transform matching _assetCoords (identity).
  _assetUv(face, u01, v01) {
    return { su: u01, sv: v01 };
  }

  // True only if the manifest contains ALL four child tile assets. Requiring the
  // full quad keeps the tree gap-free and prevents 404 storms at ragged region
  // boundaries (where a rectangular baked region only partially covers a parent's
  // four children). Such boundary parents simply stay one LOD coarser.
  _hasChildAssets(tile) {
    const l = tile.lod + 1;
    const x2 = tile.x * 2;
    const y2 = tile.y * 2;
    const childXY = [[x2, y2], [x2 + 1, y2], [x2, y2 + 1], [x2 + 1, y2 + 1]];
    for (const [cx, cy] of childXY) {
      const { ax, ay } = this._assetCoords(tile.face, l, cx, cy);
      if (!this.manifestTileMap.has(tileKey(tile.face, l, ax, ay))) return false;
    }
    return true;
  }

  // Per-tile metadata from the manifest (looked up at the baked asset coords).
  _getTileMeta(tile) {
    const { ax, ay } = this._assetCoords(tile.face, tile.lod, tile.x, tile.y);
    const meta = this.manifestTileMap.get(tileKey(tile.face, tile.lod, ax, ay));
    if (meta) return meta;
    return {
      roughness: 0.15,
      landFraction: 0.5,
      width: 64,
      height: 64,
    };
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  update(camera) {
    if (!camera) return;

    this.frame += 1;
    this._updateCameraSpeed(camera);
    if (typeof window !== 'undefined') this.viewportHeight = window.innerHeight;

    this.group.updateWorldMatrix(true, false);
    this.group.getWorldPosition(this.planetWorldCenter);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);

    // Pixels-per-radian-of-error scale for screen-space error.
    const fov = (camera.fov || 50) * DEG2RAD;
    this._sseScale = this.viewportHeight / (2 * Math.tan(fov / 2));

    this.visibleTiles.clear();

    for (const face of FACE_NAMES) {
      const root = this.tiles.get(tileKey(face, this.rootLod, 0, 0));
      if (root) this._selectTilesRecursive(root, camera);
    }

    this._applyVisibility();
    this._updateEdgeMorph();
    this._processQueue();
    this._evictLRU();

    this.debugStats.queue = this.priorityQueue.size;
    this.debugStats.inflight = this.inflightLoads;
    this.debugStats.loadedTiles = this.tiles.size;
    this.debugStats.visibleTiles = this.visibleTiles.size;
  }

  _updateCameraSpeed(camera) {
    const t = performance.now() * 0.001;
    const dt = Math.max(1e-3, t - this.lastTimeSec);
    this.cameraSpeedMps = camera.position.distanceTo(this.lastCameraPos) / dt;
    this.lastCameraPos.copy(camera.position);
    this.lastTimeSec = t;
  }

  // Recursively selects visible tiles, always keeping a parent visible until ALL
  // of its children are loaded and ready (so no holes appear during streaming).
  _selectTilesRecursive(tile, camera) {
    tile.lastUsedFrame = this.frame;

    if (!this._isTileVisible(tile, camera)) {
      return;
    }

    if (this._shouldRefine(tile, camera)) {
      this._ensureChildren(tile);

      let allReady = true;
      for (const child of tile.children) {
        child.lastUsedFrame = this.frame;
        child.priority = this._computePriority(child, camera);
        if (!child.ready) {
          this._enqueueLoad(child, child.priority);
          allReady = false;
        }
      }

      if (allReady) {
        for (const child of tile.children) {
          this._selectTilesRecursive(child, camera);
        }
        return; // Parent is fully replaced by its children this frame.
      }
      // else: fall through and keep this parent visible while children stream in.
    }

    this.visibleTiles.add(tile.id);
    tile.priority = this._computePriority(tile, camera);
    if (!tile.ready) this._enqueueLoad(tile, tile.priority);
  }

  // Frustum + conservative horizon (backside) culling. Roots are never culled so
  // the globe silhouette is always complete.
  _isTileVisible(tile, camera) {
    this._updateTileBounds(tile);

    tile.worldCenter.copy(tile.center).applyMatrix4(this.group.matrixWorld);
    this.worldSphere.center.copy(tile.worldCenter);
    this.worldSphere.radius = tile.boundingRadius;

    if (!this.frustum.intersectsSphere(this.worldSphere)) return false;

    if (tile.lod === this.rootLod) return true;

    // Horizon test: cull tiles whose surface faces away from the camera. Uses a
    // generous margin so partially visible limb tiles are kept.
    this._tmpCamDir.copy(camera.position).sub(this.planetWorldCenter).normalize();
    const worldNormal = this._tmpTileDir
      .copy(tile.centerNormal)
      .transformDirection(this.group.matrixWorld);
    const facing = worldNormal.dot(this._tmpCamDir);
    return facing > -0.25;
  }

  // Screen-space-error driven refinement with hysteresis and speed throttling.
  // Refinement is asset-driven: a tile only refines if higher-LOD child tiles
  // were actually generated (present in the manifest), which prevents 404 storms
  // and the flicker/evict churn they cause.
  _shouldRefine(tile, camera) {
    const meta = tile.meta || this._getTileMeta(tile);
    if (tile.lod >= this.maxAvailableLod) return false;
    if (!this._hasChildAssets(tile)) return false;

    if (this.cameraSpeedMps > this.fastCameraSpeed && tile.lod >= this.maxLodWhileFast) {
      return false;
    }

    const distance = Math.max(1, tile.worldCenter.distanceTo(camera.position));
    const geometricError = this._tileGeometricError(tile);
    const sse = (geometricError / distance) * this._sseScale;

    // Terrain-aware bias: rougher / mountainous / interesting tiles refine sooner;
    // open-ocean / flat tiles refine later.
    const boost = this._priorityBoost(tile, meta);
    const expandThreshold = (this.sseThreshold * this.hysteresisExpand) / boost;
    return sse > expandThreshold;
  }

  // Approximate world-space geometric error: half a tile's surface span.
  _tileGeometricError(tile) {
    const tileSpan = 2 / Math.pow(2, tile.lod); // in cube-face [-1,1] units
    return 0.5 * tileSpan * this.meanRadius;
  }

  // True if the tile's surface footprint overlaps a location-of-interest disc.
  _tileWithinLocation(tile, loc) {
    this._updateTileBounds(tile);
    const angular = tile.center.clone().normalize().angleTo(loc.dir);
    const tileAngularRadius = tile.boundingRadius / this.meanRadius;
    const locAngularRadius = (loc.radiusKm * 1000) / this.meanRadius;
    return angular < (tileAngularRadius + locAngularRadius);
  }

  // Multiplicative priority/refinement boost from terrain + locations of interest.
  _priorityBoost(tile, meta) {
    let boost = 1;
    const land = clamp01(meta.landFraction ?? 0.5);
    boost += 2.5 * clamp01((meta.roughness ?? 0.1) * 6);        // rough/mountainous
    boost += 1.2 * land;                                         // land over ocean
    boost -= 0.6 * (1 - land);                                   // de-prioritize ocean
    for (const loc of this.locationInterests) {
      if (this._tileWithinLocation(tile, loc)) boost += 2 * loc.lodBoost;
    }
    return Math.max(0.4, boost);
  }

  _computePriority(tile, camera) {
    const meta = tile.meta || this._getTileMeta(tile);
    const distance = Math.max(1, tile.worldCenter.distanceTo(camera.position));

    // Closer + higher LOD + interesting terrain = higher load priority.
    let priority = 1e6 / distance;
    priority += tile.lod * 50;
    priority *= this._priorityBoost(tile, meta);

    // Strongly prefer camera-facing tiles.
    this._tmpCamDir.copy(camera.position).sub(this.planetWorldCenter).normalize();
    const facing = this._tmpTileDir.copy(tile.centerNormal)
      .transformDirection(this.group.matrixWorld).dot(this._tmpCamDir);
    priority *= 0.5 + 0.5 * clamp01(facing);

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
    ellipsoidNormal(tile.center, this.a, this.b, tile.centerNormal);

    // Bounding radius from center to the farthest tile corner (plus a height
    // allowance). Using only one corner can underestimate the tile's true
    // footprint and make edge tiles blink out near the frustum boundary.
    let maxCornerDist = 0;
    const corners = [
      [cu - tileSpan * 0.5, cv - tileSpan * 0.5],
      [cu + tileSpan * 0.5, cv - tileSpan * 0.5],
      [cu - tileSpan * 0.5, cv + tileSpan * 0.5],
      [cu + tileSpan * 0.5, cv + tileSpan * 0.5],
    ];
    for (const [u, v] of corners) {
      cubeToDirection(tile.face, u, v, this._tmpDir);
      rayEllipsoidIntersection(this._tmpDir, this.a, this.b, this._tmpA);
      maxCornerDist = Math.max(maxCornerDist, tile.center.distanceTo(this._tmpA));
    }
    const heightAllowance = 10000 * Math.max(1, this.displacementScaleMultiplier);
    tile.boundingRadius = maxCornerDist + heightAllowance;
    tile.boundsValid = true;
  }

  // ---------------------------------------------------------------------------
  // Geometry construction
  // ---------------------------------------------------------------------------

  _ensureTileMesh(tile) {
    if (tile.mesh) return;
    const geometry = this._buildTileGeometry(tile);
    const material = this.baseMaterial.clone();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `tile:${tile.id}`;
    mesh.frustumCulled = false; // we do our own conservative culling
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    tile.mesh = mesh;
    tile.geometry = geometry;
    tile.material = material;
  }

  // Builds an indexed, watertight tile mesh on the ellipsoid with baked displacement.
  // UV == (u01, v01) and height sampling == (u01, v01): a direct, self-consistent
  // mapping that matches the offline asset generator at every LOD.
  _buildTileGeometry(tile) {
    const seg = this.segments;
    const tileSpan = 2 / Math.pow(2, tile.lod);
    const u0 = -1 + tile.x * tileSpan;
    const v0 = -1 + tile.y * tileSpan;

    const total = (seg + 1) * (seg + 1);

    const positions = new Float32Array(total * 3);
    const normals = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 2);

    const displacementScale = this.displacementScaleMultiplier;
    const dir = this._tmpDir;
    const pos = this._tmpA;
    const nor = this._tmpB;

    const write = (index, p, n, u, v) => {
      const i3 = index * 3;
      const i2 = index * 2;
      positions[i3] = p.x; positions[i3 + 1] = p.y; positions[i3 + 2] = p.z;
      normals[i3] = n.x; normals[i3 + 1] = n.y; normals[i3 + 2] = n.z;
      uvs[i2] = u; uvs[i2 + 1] = v;
    };

    for (let y = 0; y <= seg; y++) {
      const v01 = y / seg;
      const v = v0 + tileSpan * v01;
      for (let x = 0; x <= seg; x++) {
        const u01 = x / seg;
        const u = u0 + tileSpan * u01;

        cubeToDirection(tile.face, u, v, dir);
        rayEllipsoidIntersection(dir, this.a, this.b, pos);
        ellipsoidNormal(pos, this.a, this.b, nor);

        // Sample the baked asset at the flipped coords and store the same coords
        // as the texture UV so color + height + geometry all stay aligned.
        const { su, sv } = this._assetUv(tile.face, u01, v01);
        const h = this._sampleHeight(tile, su, sv) * displacementScale;
        pos.addScaledVector(nor, h);

        write(y * (seg + 1) + x, pos, nor, su, sv);
      }
    }

    // CDLOD edge morph: where an edge faces a coarser neighbor, collapse the in-between
    // boundary vertices onto the segment between the coarse tile's shared vertices so the
    // fine edge matches the coarse vertex spacing (removes T-junction cracks). Handles
    // multi-level differences via a per-edge step of 2^(levelDiff).
    const steps = tile.edgeSteps || [1, 1, 1, 1];
    if (steps[0] > 1 || steps[1] > 1 || steps[2] > 1 || steps[3] > 1) {
      const idx = (x, y) => y * (seg + 1) + x;
      const lerp = (i, a, b, t) => {
        const i3 = i * 3, a3 = a * 3, b3 = b * 3;
        positions[i3] = positions[a3] + (positions[b3] - positions[a3]) * t;
        positions[i3 + 1] = positions[a3 + 1] + (positions[b3 + 1] - positions[a3 + 1]) * t;
        positions[i3 + 2] = positions[a3 + 2] + (positions[b3 + 2] - positions[a3 + 2]) * t;
      };
      const morphEdge = (step, vert, get) => {
        let s = Math.min(step, seg);
        while (s > 1 && seg % s !== 0) s >>= 1; // clamp to a divisor of seg
        if (s <= 1) return;
        for (let i = 0; i < seg; i++) {
          if (i % s === 0) continue;
          const lo = Math.floor(i / s) * s, hi = lo + s;
          lerp(get(i), get(lo), get(hi), (i - lo) / s);
        }
      };
      morphEdge(steps[0], true, (x) => idx(x, 0));     // T
      morphEdge(steps[1], true, (x) => idx(x, seg));   // B
      morphEdge(steps[2], true, (y) => idx(0, y));     // L
      morphEdge(steps[3], true, (y) => idx(seg, y));   // R
    }

    // Choose the winding that makes front faces point outward for this face's
    // (u,v) handedness, so FrontSide culling never opens holes.
    const reversed = this._needsReversedWinding(positions, normals, seg);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(this.indexBufferCache.getIndexAttribute(seg, reversed));
    geometry.computeBoundingSphere();
    return geometry;
  }

  // Determines whether the forward index winding produces inward-facing triangles
  // for this tile (in which case the reversed winding is needed).
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

  // Bilinear height lookup in meters at tile-local (u01, v01).
  _sampleHeight(tile, u01, v01) {
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

  _ensureChildren(tile) {
    const l = tile.lod + 1;
    const x2 = tile.x * 2;
    const y2 = tile.y * 2;
    const coords = [[x2, y2], [x2 + 1, y2], [x2, y2 + 1], [x2 + 1, y2 + 1]];
    // Keep a stable 4-slot array. Eviction may null out individual slots (see
    // _disposeTile) while siblings stay live, so refill only the vacated slots
    // rather than rebuilding the whole quad -- rebuilding used to drop references
    // to the still-alive siblings and corrupt the tree linkage.
    if (!tile.children) tile.children = [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      if (tile.children[i]) continue;
      const child = this._getOrCreateTile(tile.face, l, coords[i][0], coords[i][1], tile);
      this._ensureTileMesh(child);
      tile.children[i] = child;
    }
  }

  // ---------------------------------------------------------------------------
  // Visibility application
  // ---------------------------------------------------------------------------

  _applyVisibility() {
    for (const tile of this.tiles.values()) {
      if (!tile.mesh) continue;
      const visible = this.visibleTiles.has(tile.id);
      tile.visible = visible;
      tile.mesh.visible = visible;
      if (visible && tile.mesh.parent !== this.group) {
        this.group.add(tile.mesh);
      }
    }
    if (this.debugMode !== 'none') this._applyDebugColors();
  }

  // Computes each visible tile's coarser-neighbor edge mask and rebuilds geometry
  // when it changes, so edges morph to match coarser same-face neighbors. Cross-
  // face edges are left untouched (no T-junction within a single face there).
  _updateEdgeMorph() {
    const count = 1 << this.rootLod;
    for (const id of this.visibleTiles) {
      const tile = this.tiles.get(id);
      if (!tile || !tile.ready) continue;
      const tc = 1 << tile.lod;
      // For each edge, find how many LOD levels coarser the visible neighbor is by
      // walking up ancestors. step = 2^d where d is that difference (1 = same/finer).
      // Resolve the neighbor across an edge, then find how many LOD levels coarser
      // the visible neighbor is (step = 2^d; 1 == same/finer, no morph needed).
      // Within the face this is plain (x,y) arithmetic; across a cube seam we
      // evaluate the shared parametrization just past the edge and invert it to the
      // owning face + cell -- the same principle as within-face, no adjacency table.
      const nstep = (dx, dy) => {
        let nface = tile.face;
        let nx = tile.x + dx;
        let ny = tile.y + dy;
        if (nx < 0 || ny < 0 || nx >= tc || ny >= tc) {
          const span = 2 / tc;
          const u = -1 + (nx + 0.5) * span; // cell-center cube coords (may exceed +/-1)
          const v = -1 + (ny + 0.5) * span;
          cubeToDirection(tile.face, u, v, this._tmpMorphDir);
          directionToFaceUV(this._tmpMorphDir, this._tmpFaceUV);
          nface = this._tmpFaceUV.face;
          nx = Math.min(tc - 1, Math.max(0, Math.floor((this._tmpFaceUV.u + 1) * 0.5 * tc)));
          ny = Math.min(tc - 1, Math.max(0, Math.floor((this._tmpFaceUV.v + 1) * 0.5 * tc)));
        }
        for (let d = 1; tile.lod - d >= this.rootLod; d++) {
          if (this.visibleTiles.has(tileKey(nface, tile.lod - d, nx >> d, ny >> d))) return 1 << d;
        }
        return 1;
      };
      const steps = [
        nstep(0, -1), // T
        nstep(0, 1),  // B
        nstep(-1, 0), // L
        nstep(1, 0),  // R
      ];
      const mask = steps[0] | (steps[1] << 5) | (steps[2] << 10) | (steps[3] << 15);
      if (mask !== tile.edgeMask) {
        tile.edgeMask = mask;
        tile.edgeSteps = steps;
        if (tile.mesh) {
          const newGeom = this._buildTileGeometry(tile);
          const old = tile.mesh.geometry;
          tile.mesh.geometry = newGeom;
          tile.geometry = newGeom;
          if (old && old !== newGeom) old.dispose();
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  _enqueueLoad(tile, priority) {
    if (tile.loading || tile.ready || tile.retryScheduled) return;
    if (this.queuedSet.has(tile.id)) return;
    this.queuedSet.add(tile.id);
    this.priorityQueue.push(tile, priority);
  }

  _processQueue() {
    // Wait for the manifest so tiles load with correct dimensions/meta.
    if (!this.manifestReady) return;
    while (this.inflightLoads < this.maxConcurrentLoads && this.priorityQueue.size > 0) {
      const tile = this.priorityQueue.pop();
      if (!tile) break;
      this.queuedSet.delete(tile.id);
      if (tile.ready || tile.loading) continue;
      this._loadTile(tile);
    }
  }

  async _loadTile(tile) {
    tile.loading = true;
    tile.loadGeneration += 1;
    const generation = tile.loadGeneration;
    tile.abortController = new AbortController();
    const signal = tile.abortController.signal;
    this.inflightLoads += 1;

    try {
      const [texture, height] = await Promise.all([
        this._loadColor(tile, signal),
        this._loadHeight(tile, signal),
      ]);

      if (tile.loadGeneration !== generation) {
        if (texture) texture.dispose();
        return; // superseded by a newer load / disposed
      }

      if (texture) {
        tile.texture = texture;
        tile.colorReady = true;
      } else {
        tile.colorReady = true; // tolerate missing color (keep parent fallback)
      }

      tile.heightSamples = height.samples;
      tile.heightWidth = height.width;
      tile.heightHeight = height.height;
      tile.minHeightMeters = height.minHeightMeters;
      tile.maxHeightMeters = height.maxHeightMeters;
      tile.heightReady = true;

      tile.estimatedBytes = (height.samples.byteLength || 0) +
        (texture ? this._estimateTextureBytes(texture) : 0);
      this.debugStats.gpuBytes += tile.estimatedBytes;

      this._applyTileData(tile);
    } catch (error) {
      if (!signal.aborted) {
        tile.loadAttempts += 1;
        if (tile.loadAttempts < this.maxLoadAttempts) {
          // Transient failure (e.g. net::ERR_NETWORK_CHANGED). Leave the tile
          // un-ready and re-enqueue after an exponential backoff so a brief
          // network blip has time to clear before the next attempt. Gated by
          // `retryScheduled` so per-frame selection doesn't re-enqueue it early.
          const delay = Math.min(
            this.retryMaxDelayMs,
            this.retryBaseDelayMs * 2 ** (tile.loadAttempts - 1),
          );
          tile.retryScheduled = true;
          if (tile.retryTimer) clearTimeout(tile.retryTimer);
          tile.retryTimer = setTimeout(() => {
            tile.retryTimer = null;
            tile.retryScheduled = false;
            // Only retry if this exact tile is still live and still wanted.
            if (this.tiles.get(tile.id) === tile && !tile.ready && !tile.loading) {
              this._enqueueLoad(tile, tile.priority);
            }
          }, delay);
          return;
        }
        console.warn(
          `[planet2] tile load gave up ${tile.id} ` +
          `after ${tile.loadAttempts} attempts, using flat fallback:`,
          error?.message || error,
        );
        this.debugStats.droppedLoads += 1;
        // Mark height ready with flat data so selection can still progress.
        if (!tile.heightReady) {
          tile.heightSamples = null;
          tile.heightWidth = 0;
          tile.heightHeight = 0;
          tile.heightReady = true;
        }
        tile.colorReady = true;
        this._applyTileData(tile);
      }
    } finally {
      if (tile.loadGeneration === generation) {
        tile.loading = false;
        tile.abortController = null;
      }
      this.inflightLoads -= 1;
    }
  }

  async _loadColor(tile, signal) {
    const { ax, ay } = this._assetCoords(tile.face, tile.lod, tile.x, tile.y);
    const src = this.tileSourceMap.get(tileKey(tile.face, tile.lod, ax, ay));
    const colorBase = src ? src.colorBasePath : this.colorBasePath;
    const url = `${colorBase}/${tile.face}/${tile.lod}/${ax}/${ay}.ktx2`;
    try {
      const texture = await this.ktx2Loader.loadAsync(url);
      if (signal.aborted) { texture.dispose(); return null; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; // GPU-compressed; matches the generator's row order
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      return texture;
    } catch (error) {
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

    const { ax, ay } = this._assetCoords(tile.face, tile.lod, tile.x, tile.y);
    const src = this.tileSourceMap.get(tileKey(tile.face, tile.lod, ax, ay));
    const heightBase = src ? src.heightBasePath : this.heightBasePath;
    const url = `${heightBase}/${tile.face}/${tile.lod}/${ax}/${ay}.bin`;
    const response = await fetch(url, { signal, cache: 'no-cache' });

    if (!response.ok) {
      if (response.status === 404) {
        return { width, height, minHeightMeters, maxHeightMeters, samples: new Uint16Array(width * height) };
      }
      throw new Error(`height fetch ${response.status} for ${url}`);
    }

    const buffer = await response.arrayBuffer();
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
        console.warn(`[planet2] height size mismatch ${tile.id}: got ${samples.length}, expected ${width * height}`);
      }
    }
    return { width: outWidth, height: outHeight, minHeightMeters, maxHeightMeters, samples };
  }

  _estimateTextureBytes(texture) {
    const img = texture.image;
    const w = (img && img.width) || 256;
    const h = (img && img.height) || 256;
    return Math.ceil(w * h * 1.34); // compressed + mip chain estimate
  }

  // Rebuilds geometry (with height) and swaps the streamed color map into place.
  _applyTileData(tile) {
    if (!tile.mesh) return;

    const newGeometry = this._buildTileGeometry(tile);
    const oldGeometry = tile.mesh.geometry;
    tile.mesh.geometry = newGeometry;
    tile.geometry = newGeometry;
    if (oldGeometry && oldGeometry !== newGeometry) oldGeometry.dispose();

    if (tile.texture && this.debugMode === 'none') {
      tile.material.map = tile.texture;
      tile.material.color.set(0xffffff);
      tile.material.needsUpdate = true;
    }
    // Use a uniform finish across all tiles; deriving roughness from per-tile
    // terrain variance makes refined regions visibly matte/shiny vs their parent.
    tile.material.roughness = 1;
  }

  // ---------------------------------------------------------------------------
  // Eviction (LRU, budget-bounded). Roots and ancestors-of-visible are protected.
  // ---------------------------------------------------------------------------

  _evictLRU() {
    let tileCount = this.tiles.size;
    let gpuBytes = this.debugStats.gpuBytes;
    if (tileCount <= this.maxTileCount && gpuBytes <= this.maxGpuBytes) return;

    const candidates = [];
    for (const tile of this.tiles.values()) {
      if (tile.lod === this.rootLod) continue;
      if (this.visibleTiles.has(tile.id)) continue;
      if (this._isAncestorOfVisible(tile)) continue;
      candidates.push(tile);
    }
    candidates.sort((a, b) => a.lastUsedFrame - b.lastUsedFrame);

    for (const tile of candidates) {
      if (tileCount <= this.maxTileCount && gpuBytes <= this.maxGpuBytes) break;
      gpuBytes = Math.max(0, gpuBytes - tile.estimatedBytes);
      this._disposeTile(tile);
      tileCount -= 1;
      this.debugStats.evictedTiles += 1;
    }
    this.debugStats.gpuBytes = gpuBytes;
  }

  _isAncestorOfVisible(tile) {
    if (!tile.children) return false;
    const stack = tile.children.slice();
    while (stack.length) {
      const t = stack.pop();
      if (!t) continue;
      if (this.visibleTiles.has(t.id)) return true;
      if (t.children) stack.push(...t.children);
    }
    return false;
  }

  _disposeTile(tile) {
    if (tile.abortController) {
      tile.abortController.abort();
      tile.abortController = null;
    }
    if (tile.retryTimer) {
      clearTimeout(tile.retryTimer);
      tile.retryTimer = null;
      tile.retryScheduled = false;
    }
    if (tile.mesh && tile.mesh.parent) tile.mesh.parent.remove(tile.mesh);
    if (tile.texture) { tile.texture.dispose(); tile.texture = null; }
    if (tile.mesh?.geometry) tile.mesh.geometry.dispose();
    if (tile.material && tile.material !== this.baseMaterial) tile.material.dispose();

    // Detach ONLY this tile from its parent's child list, leaving live siblings
    // in place. Nulling the whole array here would orphan the siblings and make
    // _isAncestorOfVisible() wrongly report the parent has no visible descendants,
    // so the LRU would then evict ancestors of on-screen tiles (visible shards).
    const parent = tile.parent;
    if (parent && parent.children) {
      const idx = parent.children.indexOf(tile);
      if (idx !== -1) parent.children[idx] = null;
    }

    this.queuedSet.delete(tile.id);
    this.tiles.delete(tile.id);
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

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
        }
        tile.material.needsUpdate = true;
      }
    } else {
      this._applyDebugColors();
    }
  }

  _applyDebugColors() {
    const mode = this.debugMode;
    for (const tile of this.tiles.values()) {
      if (!tile.material || !this.visibleTiles.has(tile.id)) continue;
      const meta = tile.meta || this._getTileMeta(tile);
      let color = null;
      let wireframe = false;

      switch (mode) {
        case 'tileBorders':
          wireframe = true;
          color = new THREE.Color(0x00ff88);
          break;
        case 'lod':
          color = colorRamp01(tile.lod / Math.max(1, this.maxAvailableLod));
          break;
        case 'priority':
          color = colorRamp01(clamp01(tile.priority / 5e6));
          break;
        case 'roughness':
          color = colorRamp01(clamp01((meta.roughness ?? 0) * 6));
          break;
        case 'landWater':
          color = new THREE.Color().setRGB(
            clamp01(meta.landFraction ?? 0.5), 0.3, clamp01(meta.waterFraction ?? 0.5));
          break;
        case 'loading':
          color = tile.ready ? new THREE.Color(0x2266ff)
            : tile.loading ? new THREE.Color(0xffaa00)
              : new THREE.Color(0xff2244);
          break;
        default:
          color = new THREE.Color(0x8aa7c2);
          break;
      }

      tile.material.wireframe = wireframe;
      tile.material.map = null;
      if (color) tile.material.color.copy(color);
      tile.material.needsUpdate = true;
    }
  }

  getDebugStats() {
    return {
      ...this.debugStats,
      queue: this.priorityQueue.size,
      inflight: this.inflightLoads,
      loadedTiles: this.tiles.size,
      visibleTiles: this.visibleTiles.size,
      cameraSpeedMps: Math.round(this.cameraSpeedMps),
    };
  }

  dispose() {
    for (const tile of [...this.tiles.values()]) this._disposeTile(tile);
    this.tiles.clear();
    this.visibleTiles.clear();
    this.priorityQueue.clear();
    this.queuedSet.clear();
    this.baseMaterial.dispose();
  }
}

// -----------------------------------------------------------------------------
// planet2 - public factory returning [planetMeshes, atmosphereMesh, backgroundPatch]
// with attached LOD-control hooks, matching the planet.js contract used by main.js.
// -----------------------------------------------------------------------------

export class planet2 {
  constructor(dParamWithUnits, planetSpec, enableVR, nonGUIParams = {}) {
    const renderer = nonGUIParams.renderer ||
      (typeof nonGUIParams.getRenderer === 'function' ? nonGUIParams.getRenderer() : null);
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    } else {
      console.warn('[planet2] renderer missing; KTX2 detectSupport(renderer) deferred.');
    }

    const planetMeshes = new THREE.Group();
    planetMeshes.name = 'planetMeshes';
    planetMeshes.rotation.y = PLANET_YAW; // global alignment only

    // Allow swapping the tile asset folder at runtime (e.g. a LOD visualization
    // bake) via ?planet2Assets=earth_lodviz, without touching the real assets.
    const assetRoot = (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('planet2Assets')) || 'earth';

    // Optional overlay asset layers streamed on top of the base (e.g. a high-res
    // Hawaii cone that overrides some Earth tiles). Enabled via
    // ?planet2Overlays=hawaii (comma-separated) or nonGUIParams.planet2Overlays;
    // off by default so the base globe is unchanged unless requested.
    const overlayParam = (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('planet2Overlays')) || '';
    const overlayNames = [
      ...overlayParam.split(','),
      ...(Array.isArray(nonGUIParams.planet2Overlays) ? nonGUIParams.planet2Overlays : []),
    ]
      .map((s) => String(s).trim())
      .filter((s) => s.length > 0);
    const overlays = [...new Set(overlayNames)].map((name) => ({
      name,
      manifestUrl: `/assets/${name}/manifest.json`,
      colorBasePath: `/assets/${name}/color`,
      heightBasePath: `/assets/${name}/height`,
    }));

    const lodRenderer = new CubedSpherePlanetRenderer({
      group: planetMeshes,
      renderer,
      planetSpec,
      manifestUrl: `/assets/${assetRoot}/manifest.json`,
      colorBasePath: `/assets/${assetRoot}/color`,
      heightBasePath: `/assets/${assetRoot}/height`,
      overlays,
      segments: nonGUIParams.tileSegments ?? 24,
      maxConcurrentLoads: nonGUIParams.maxConcurrentTileLoads ?? 8,
      maxTileCount: nonGUIParams.maxCachedTiles ?? 320,
      maxGpuBytes: nonGUIParams.maxTileGpuBytes ?? 700 * 1024 * 1024,
      sseThreshold: nonGUIParams.tileSseThreshold ?? 3.5,
      maxAvailableLod: nonGUIParams.maxAvailableTileLod ?? 6,
      requireKtx2: nonGUIParams.planet2RequireKtx2 === true,
      locationInterests: nonGUIParams.locationInterests,
      displacementScaleMultiplier: nonGUIParams.planet2DisplacementScaleMultiplier ?? 1,
      fastCameraSpeed: nonGUIParams.planet2FastCameraSpeed ?? Infinity,
      maxLodWhileFast: nonGUIParams.planet2MaxLodWhileFast ?? Infinity,
    });
    this.lodRenderer = lodRenderer;

    // Atmosphere shell (back-sided additive shader), matching the legacy stack.
    const roughPlanetRadius = planetSpec.ellipsoid.a;
    const atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(roughPlanetRadius, 64, 32),
      new THREE.ShaderMaterial({
        vertexShader: document.getElementById('atmosphereVertexShader')?.textContent ||
          'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: document.getElementById('atmosphereFragmentShader')?.textContent ||
          'void main(){gl_FragColor=vec4(0.2,0.4,1.0,0.12);}',
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
      })
    );
    atmosphereMesh.name = 'atmosphere';
    atmosphereMesh.visible = dParamWithUnits?.showEarthsAtmosphere?.value ?? true;

    const f = planetSpec.ellipsoid.f || 0;
    const polarScale = 1.0 - f;
    atmosphereMesh.scale.set(1.1, 1.1 * polarScale, 1.1);

    const backgroundPatchMesh = null;

    const result = [planetMeshes, atmosphereMesh, backgroundPatchMesh];
    result.updatePlanetLod = (camera) => lodRenderer.update(camera);
    result.setPlanetDebugMode = (mode) => lodRenderer.setDebugMode(mode);
    result.getPlanetDebugStats = () => lodRenderer.getDebugStats();
    result.disposePlanetLod = () => lodRenderer.dispose();

    if (typeof nonGUIParams.registerPlanetLodUpdater === 'function') {
      nonGUIParams.registerPlanetLodUpdater(result.updatePlanetLod);
    }

    return result;
  }
}
