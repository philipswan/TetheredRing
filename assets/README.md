# planet2 Earth Assets (`assets/earth/`)

This folder holds terrain color and displacement (height) textures that are used
by the planet model. A planet is modeled as an ellipsoid, which is then mapped to
a **cubed sphere** — six cube faces, each subdivided into a **quadtree** comprising
many tiles of varying resolutions. This allows a dynamic **level of detail (LoD)**
algorithm to optimize between performance and sharpness based on the camera's
distance from the terrain: tiles close to the camera are drawn from high-detail
sub-tiles, while distant terrain uses a single low-detail tile.

The renderer that consumes these assets is [`planet2.js`](../planet2.js).

## Tiles, faces, and the quadtree

- **Faces.** The six cube faces are named `+X`, `-X`, `+Y`, `-Y`, `+Z`, `-Z`.
- **Level (LoD).** Each face at level `L` is split into a `2^L × 2^L` grid of
  tiles. So `L = 0` is one tile covering the whole face, `L = 1` is `2 × 2`,
  and `L = 11` is `2048 × 2048` tiles.
- **Tile resolution.** Every tile stores a **2048 × 2048** color image and a
  **256 × 256** height grid, regardless of its level. Because each level doubles
  the tile count per axis, descending one level doubles the effective texel
  density on the ground.

Each color tile is produced like this: the relevant **source imagery** (the
equirectangular global and regional images listed under
[Where the raw data comes from](#where-the-raw-data-comes-from)) is read, its
pixels are sampled to generate the new pixels needed for a **2048 × 2048** tile,
and that tile is then handed to `toktx`, which in a single step builds the
**mipmap** chain (the full-size image plus progressively half-sized copies used
for distant/angled views) and compresses the whole chain into the GPU-native
**KTX2 / UASTC** format. The resulting compressed file is stored at its
`color/face/lod/x/y.ktx2` location in the asset directory.

KTX2/UASTC is a GPU-native format: the compressed data is uploaded to the GPU and
sampled directly without a CPU decode step, so tiles load faster and use far less
video memory than equivalent PNG/JPEG textures.

Height tiles, however, are stored uncompressed because exact values are needed along their edges to avoid visible seams.

## Directory layout

Tiles are stored in a directory structure of the form
`planetary_body/{color|height}/face/lod/x/y`, where `x` and `y` are the tile's column and row indicies within the LOD level's `2^L × 2^L` grid (`x` increases along the face's horizontal
axis, `y` along the vertical; both range from `0` to `2^L − 1`).

```
assets/earth/
├── manifest.json              <- index of every tile that exists (see below)
├── color/
│   └── <face>/<lod>/<x>/<y>.ktx2
└── height/
    └── <face>/<lod>/<x>/<y>.bin
```

Example concrete paths for the single top-level tile of the `-X` face:

```
assets/earth/color/-X/0/0/0.ktx2
assets/earth/height/-X/0/0/0.bin
```

The tree is **sparse**: only tiles that were actually generated exist on disk.
High levels exist only where the source was refined (for example, the Hawaiian
Islands are generated down to level 11, with a coarser fill out over the
surrounding ocean), and the rest of the globe stops at the base level.

## File formats

### Color — `*.ktx2`
KTX2 (UASTC), loaded with three.js `KTX2Loader`. Stored in sRGB with mipmaps;
rows are top-to-bottom (`flipY = false`) to match the way the generator writes
them.

### Height — `*.bin`
A raw little-endian **`Uint16`** array, `256 × 256` samples, row-major, with no
header. Each sample is a normalized elevation; convert it to meters using the
global elevation range from the top of the manifest (`minHeight`, `maxHeight`):

```
elevation_m = minHeight + (sample / 65535) * (maxHeight - minHeight)
```

The first and last rows/columns of a height tile sit exactly on the tile boundary,
so neighboring tiles share identical edge values and meet without seams.

## The manifest — `assets/earth/manifest.json`

This is the manifest (in json format) of which tiles exist. It is written to disk by the generator script [`tools/generate_planet2_lod0_assets.py`](../tools/generate_planet2_lod0_assets.py)
as each tile is produced, and is later read at runtime by
[`planet2.js`](../planet2.js) (in its `_loadManifest()` method).

Top-level shape:

```jsonc
{
  "maxAvailableLod": 11,        // deepest level present anywhere
  "minHeight": -200,            // global height-decode floor (meters)
  "maxHeight": 8500,            // global height-decode ceiling (meters)
  "tiles": {
    "+X/0/0/0": { ...metadata... },
    "-X/0/0/0": { ...metadata... },
    // one entry per tile, keyed by "face/lod/x/y"
  }
}
```

Top-level fields:

| Field             | Why it's needed                                                                 |
| ----------------- | ------------------------------------------------------------------------------- |
| `maxAvailableLod` | Hard cap on subdivision depth; the renderer never refines past this level.       |
| `minHeight`/`maxHeight` | Elevation range (meters) used to decode every `.bin` sample. Every tile shares the same range, so it is stored once here instead of being repeated per tile. |
| `tiles`           | Map of which tiles exist, keyed by `face/lod/x/y`.                               |

Per-tile metadata fields. Every field below is read at runtime; fields the
renderer never consumed (per-tile elevation range, byte-size hints, encoding tag,
and a redundant per-tile depth value) were removed so each tile entry stays small.

| Field             | Why it's needed                                                                 |
| ----------------- | ------------------------------------------------------------------------------- |
| `roughness`       | Std-dev of the tile's normalized height. `planet2.js` `_priorityBoost()` refines rough/mountainous tiles sooner, so detail is spent where the terrain varies. |
| `landFraction`    | Fraction of the tile that is land (water fraction is just `1 - landFraction`, so only one value is stored). `_priorityBoost()` uses it to favor land and de-prioritize open ocean. |
| `width`/`height`  | Sample count per axis of the `.bin` grid; `_loadHeight()` needs them to read the raw `Uint16` buffer with the correct dimensions. |

The renderer uses the manifest to decide where it is allowed to subdivide: before
splitting a tile it checks the manifest for the four child tile keys, so it only
descends where higher-detail tiles were actually generated (this avoids requesting
files that don't exist). Tile URLs are built directly from the key, e.g.
`{colorBasePath}/{face}/{lod}/{x}/{y}.ktx2`.

The base URLs are configured where the renderer is constructed in `planet2.js`:

```js
manifestUrl:    '/assets/earth/manifest.json',
colorBasePath:  '/assets/earth/color',
heightBasePath: '/assets/earth/height',
```

## Overlay asset layers (`assets/hawaii/`)

An **overlay** is a second, self-contained asset folder (same
`manifest.json` + `color/` + `height/` layout as the base) that is loaded **on
top of** the base at runtime and merged into it. Overlays keep the base bake
generic and cheap while letting a region carry its own high-resolution enhancement
without re-baking the whole globe.

Enable overlays with the `?planet2Overlays=` URL parameter (comma-separated) or the
`nonGUIParams.planet2Overlays` array. They are **off by default**, so the base
globe is unchanged unless requested:

```
http://localhost:5173/?planet2Overlays=hawaii
```

How the merge works (`planet2.js` `_loadOverlays()`):

- The base manifest loads first, then each overlay manifest is fetched and its
  tiles are merged into the same tile map. **An overlay tile overrides the base
  tile at the same `face/lod/x/y` key.**
- Each overlay-provided tile remembers its own `color/height` folders, so
  `_loadColor()` / `_loadHeight()` stream the overriding tiles from
  `/assets/<overlay>/…` while every other tile still comes from the base.
- `maxAvailableLod` becomes the maximum across the base and all overlays, so the
  renderer can refine into the overlay's deeper levels. Overlays must share the
  base's `minHeight`/`maxHeight` decode range (a mismatch is logged as a warning).
- The merge is a union, so refinement everywhere *outside* the overlay's region is
  unaffected — the overlay only replaces the specific keys it contains.

**Seam-free integration.** Because the mesh displaces per vertex from the height
texture, an overlay tile and the adjacent base tile must sample **identical**
elevation along their shared edge — this requires the same displacement source
*and* the same tile resolution. The Hawaii overlay is therefore built as a hybrid
by [`tools/adaptive_lod.py`](../tools/adaptive_lod.py) (`hawaii` subcommand):

- The high-resolution XHR cone (the deep levels, `LOD ≥ 7`) is **extracted
  verbatim** from `assets/earth`. Its neighbors are interior overlay tiles, and its
  boundary with the coarser bridge is reconciled by the renderer's CDLOD edge
  morph — exactly as it already renders inside the base.
- The `LOD 0–6` **bridge/ancestor tiles are re-baked** from the *same* sources and
  tile sizes the base bake (`step4`) uses, so they are sampling-identical to the
  regenerated base and meet it without a crack.

The bridge is a full self-contained subtree down to `LOD 0` with sibling
completion (every parent owns all four children), so the merged tree is reachable
from the base floor into the cone with no ragged parents. Build it **before**
regenerating `assets/earth` (or restore the base from a backup first):

```
python -m tools.adaptive_lod hawaii   # -> assets/hawaii  (extract cone + bake bridge)
python -m tools.adaptive_lod step4    # regenerate the adaptive assets/earth base
```

## Where the raw data comes from

Tiles are generated from **equirectangular** (lat/lon) source images:

- **Global color** — a whole-Earth color map (e.g. NASA Blue Marble).
- **Global elevation** — a whole-Earth displacement map, where pixel brightness
  encodes elevation.
- **Regional high-resolution source (optional)** — a higher-resolution color
  image plus a 16-bit displacement image covering a specific area. For the
  Hawaii region these come from the "XHR" texture set, fetched by
  [`tools/download_xhr_hawaii_texture_tiles.py`](../tools/download_xhr_hawaii_texture_tiles.py)
  and assembled into a displacement image by
  [`tools/build_xhr_displacement_tile.py`](../tools/build_xhr_displacement_tile.py).
  In that displacement image, elevation in meters is encoded as
  `code = 9000 + 10 × elevation_m`.

## How the scripts turn raw data into tiles

The generator is
[`tools/generate_planet2_lod0_assets.py`](../tools/generate_planet2_lod0_assets.py).
For each tile it:

1. Builds the grid of points covering that tile on its cube face.
2. Projects each grid point out to a 3D direction on the sphere, then converts
   that direction to a latitude/longitude and the corresponding pixel location in
   the equirectangular source image.
3. Samples the source image (bilinear) at those locations to produce the tile's
   pixels.
4. Writes the color grid as a PNG and then encodes it to KTX2 with `toktx`;
   writes the height grid as the normalized `Uint16` `.bin`.

If a regional high-resolution source is supplied and a tile falls within its
geographic bounds, the script samples that higher-resolution image instead of the
global one for the covered area, so those tiles carry finer detail.

### Giving some locations more detail than others

By default the script only generates the top levels everywhere. To make a specific
place reach deeper levels, you pass its location and a target level on the command
line:

- `--refine-lat` and `--refine-lon` — the latitude/longitude to refine.
- `--refine-max-lod` — how many levels deep to generate at that location.

Given those, the script walks the quadtree from the top down toward that
latitude/longitude and generates the chain of tiles leading to it (and their
immediate neighbors), level by level, up to the requested depth. Running it for
several nearby points produces a contiguous high-detail region; running it for
points further out at shallower depths produces a gradual step-down to the base
level so there is no abrupt detail boundary.

A region of higher-resolution source imagery is supplied separately:

- `--regional-color`, `--regional-height` — the high-resolution source images.
- `--regional-bbox LON_MIN LON_MAX LAT_MIN LAT_MAX` — the area they cover.

## Regenerating the assets

The complete build procedure (which source images, which locations get which
depth, and in what order) is captured in
[`tools/build_planet2_assets.ps1`](../tools/build_planet2_assets.ps1):

```pwsh
# Preview the exact commands without writing anything:
pwsh tools/build_planet2_assets.ps1 -DryRun

# Rebuild assets/earth from scratch (overwrites current tiles):
pwsh tools/build_planet2_assets.ps1
```

The first step starts a fresh manifest; later steps merge into it, so the order of
steps matters. See the script header for the source-image paths and the regional
bounding box.
