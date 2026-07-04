"""Bake full high-LOD tile coverage over Hawaii's Big Island.

The stock generator (tools/generate_planet2_lod0_assets.py) refines only the tile
*pyramid through a single lat/lon point* (a 2x2 block per level), so one --refine
run leaves most of the island at the coarse base LOD. This wrapper reuses that
generator's own projection (lat_lon_to_tile_path) over a dense grid to collect
EVERY tile that touches the island's bounding box at each LOD, then bakes them all
in one process (sources loaded once) with the high-res Hawaii XHR regional overlay,
merging the result into the existing assets/earth manifest.

Per-tile pixel sizes scale down with LOD: low LODs stay large (so nothing already
baked is downgraded), high LODs stay lean (the ~100 m/px regional source does not
justify 2048x2048 tiles that each span < 0.05 deg).

Run from the repository root:

    python -m tools.bake_hawaii_bigisland_hires
    # or: python tools/bake_hawaii_bigisland_hires.py
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Make the sibling generator importable whether run as a script or a module.
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools import generate_planet2_lod0_assets as g  # noqa: E402


# Big Island geographic extent, padded a little so tiles straddling the coastline
# are counted as "touching" the island.
DEFAULT_BBOX = (-156.15, -154.70, 18.85, 20.35)  # lon_min, lon_max, lat_min, lat_max

# High-res regional overlay (same source the existing island cone uses).
REGION_COLOR = 'textures/24x12/XHR/earth_XHR_24x12_1x4.jpg'
REGION_HEIGHT = 'textures/DisplacementMaps/XHREarthDisplacement/earth_XHR_24x12_1x4.png'
REGION_BBOX = (-165.0, -150.0, 15.0, 30.0)

# Main Hawaiian islands are baked as ONE chain: the land is baked at ISLAND_LOD and
# the surrounding ocean is filled with progressively coarser (bigger) tiles out to
# OCEAN_MIN_LOD, so the channels between islands never leave a gap yet open water
# does not pay for LOD-10 tiles. The whole-chain bounding box spans every island
# (Big Island in the SE to Niihau in the NW) plus a small pad.
CHAIN_BBOX = (-160.60, -154.55, 18.75, 22.45)  # lon_min, lon_max, lat_min, lat_max
ISLAND_LOD = 10
OCEAN_MIN_LOD = 7
# Distance-from-land (degrees) out to which each intermediate LOD ring extends. Land
# is ISLAND_LOD; beyond the last ring the ocean fill drops to OCEAN_MIN_LOD.
LOD_RING_DEG = {9: 0.10, 8: 0.30}
# Base-displacement 8-bit value above the fake-ocean plateau (~36) that counts as
# land when building the land mask that drives the LOD gradient.
LAND_THRESHOLD_U8 = 45
# Only the Big Island falls inside the XHR displacement source's real data; the rest
# of that source reads flat sea-level, so the high-res height override is confined to
# this rectangle and the base globe supplies relief for the other islands.
BIG_ISLAND_HEIGHT_BBOX = (-156.15, -154.70, 18.85, 20.40)

# Wide, coarse XHR *color* overlay. Extends the regional satellite appearance far
# out into the surrounding ocean (like the legacy 15-degree XHR patch) WITHOUT
# baking island-grade detail: these tiles carry the XHR COLOR but take their height
# from the base globe (the XHR height source only has real relief on the Big Island,
# so it stays confined by BIG_ISLAND_HEIGHT_BBOX). Kept inside the XHR source cell
# (REGION_BBOX) so every tile samples real color data. A single coarse LOD keeps the
# tile count/bake time small while still painting the wide look.
WIDE_BBOX = (-164.0, -151.0, 16.0, 29.0)  # lon_min, lon_max, lat_min, lat_max
WIDE_LOD = 5


def sizes_for_lod(lod: int, face_size: int, base_height: int) -> tuple[int, int]:
    """Per-tile (color, height) pixel sizes that track the source resolution.

    Low LODs keep the full base sizes (large tiles cover large areas, so we must
    not downgrade them); each LOD above the knee halves the tile size, clamped to
    a sensible floor.
    """
    color = max(128, face_size >> max(0, lod - 7))
    height = max(64, base_height >> max(0, lod - 8))
    return color, height


def collect_island_tiles(bbox, min_lod, max_lod, step_deg):
    """Return the deduped set of (face, lod, x, y) tiles touching the bbox.

    Reuses the generator's own lat/lon -> tile-path mapping so the tiles line up
    exactly with what the renderer requests. A grid step well below one max-LOD
    tile width guarantees every touching tile contains at least one sample.
    """
    lon_min, lon_max, lat_min, lat_max = bbox
    tiles = set()

    lat = lat_min
    while lat <= lat_max + 1e-9:
        lon = lon_min
        while lon <= lon_max + 1e-9:
            for face, lod, tx, ty in g.lat_lon_to_tile_path(lat, lon, max_lod):
                if lod >= min_lod:
                    tiles.add((face, lod, tx, ty))
            lon += step_deg
        lat += step_deg

    return tiles


def close_quadtree(tiles, min_lod):
    """Complete every partially-covered parent so the quadtree has no ragged edges.

    A rectangular baked region rarely aligns to quadtree tile boundaries, so some
    parents end up with only 1-3 of their 4 children baked. The renderer only
    refines a parent when ALL four child tiles exist (gap-free tree, no 404 storms),
    so those ragged parents would never refine and their island-edge detail would
    stay coarse. This closure adds the missing sibling tiles (and any ancestors they
    imply) until every parent that owns a baked child owns all four -- iterated to a
    fixpoint because adding a sibling can expose a newly-ragged parent one level up.
    """
    tiles = set(tiles)
    while True:
        present_children = {}
        for (face, lod, x, y) in tiles:
            if lod <= min_lod:
                continue
            present_children.setdefault((face, lod - 1, x >> 1, y >> 1), True)
        added = False
        for (face, plod, px, py) in list(present_children):
            x2, y2 = px * 2, py * 2
            for cx, cy in ((x2, y2), (x2 + 1, y2), (x2, y2 + 1), (x2 + 1, y2 + 1)):
                if (face, plod + 1, cx, cy) not in tiles:
                    tiles.add((face, plod + 1, cx, cy))
                    added = True
            # Ensure the parent itself is baked so the pyramid is continuous.
            if plod >= min_lod and (face, plod, px, py) not in tiles:
                tiles.add((face, plod, px, py))
                added = True
        if not added:
            break
    return tiles


def _load_land_mask(bbox, step_deg, disp_path):
    """Boolean land grid over bbox sampled from the base global displacement.

    Returns (mask, lon_axis, lat_axis) where mask[i, j] is True over land at
    lat_axis[i] (north-to-south rows) / lon_axis[j]. Land is any base-displacement
    value above the fake-ocean plateau (LAND_THRESHOLD_U8). The base globe carries
    every Hawaiian island (unlike the Big-Island-only XHR height source), so it is
    the right source for deciding where to spend the high LODs.
    """
    lon_min, lon_max, lat_min, lat_max = bbox
    Image.MAX_IMAGE_PIXELS = None
    # ETOPO/GeoTIFF sources carry real meters (sea level = 0); a legacy 8-bit preview
    # uses the fake-ocean plateau, so it is thresholded in u8 code space instead.
    is_meters = str(disp_path).lower().endswith(('.tif', '.tiff'))
    img = Image.open(disp_path)
    if not is_meters:
        img = img.convert('L')
    src_w, src_h = img.size  # global equirect: lon -180..180, lat 90..-90
    px0 = int(np.floor((lon_min + 180.0) / 360.0 * src_w))
    px1 = int(np.ceil((lon_max + 180.0) / 360.0 * src_w))
    py0 = int(np.floor((90.0 - lat_max) / 180.0 * src_h))
    py1 = int(np.ceil((90.0 - lat_min) / 180.0 * src_h))
    crop = img.crop((px0, py0, px1, py1))
    n_lon = max(2, int(round((lon_max - lon_min) / step_deg)) + 1)
    n_lat = max(2, int(round((lat_max - lat_min) / step_deg)) + 1)
    crop = crop.resize((n_lon, n_lat), Image.BILINEAR)
    if is_meters:
        arr = np.asarray(crop, dtype=np.float32)  # row 0 = north; values in meters
        mask = arr > 0.0
    else:
        arr = np.asarray(crop, dtype=np.uint8)  # row 0 = north
        mask = arr > LAND_THRESHOLD_U8
    lon_axis = np.linspace(lon_min, lon_max, n_lon)
    lat_axis = np.linspace(lat_max, lat_min, n_lat)
    return mask, lon_axis, lat_axis


def _dilate(mask, iters):
    """Grow a boolean grid by `iters` 4-connected steps (no SciPy dependency)."""
    out = mask
    for _ in range(int(iters)):
        d = out.copy()
        d[1:, :] |= out[:-1, :]
        d[:-1, :] |= out[1:, :]
        d[:, 1:] |= out[:, :-1]
        d[:, :-1] |= out[:, 1:]
        out = d
    return out


def collect_graded_tiles(bbox, min_lod, step_deg, disp_path):
    """Collect tiles for the whole chain with a land-driven LOD gradient.

    Land tiles get ISLAND_LOD; concentric rings around the land step the LOD down
    per LOD_RING_DEG; everything else in the box is filled at OCEAN_MIN_LOD so the
    inter-island channels are covered without baking open ocean at LOD 10.
    """
    mask, lon_axis, lat_axis = _load_land_mask(bbox, step_deg, disp_path)
    target = np.full(mask.shape, OCEAN_MIN_LOD, dtype=np.int16)
    for lod in sorted(LOD_RING_DEG):  # widest (lowest LOD) ring first
        target[_dilate(mask, round(LOD_RING_DEG[lod] / step_deg))] = lod
    target[mask] = ISLAND_LOD

    tiles = set()
    n_lat, n_lon = mask.shape
    for i in range(n_lat):
        lat = float(lat_axis[i])
        row = target[i]
        for j in range(n_lon):
            for face, lod, tx, ty in g.lat_lon_to_tile_path(lat, float(lon_axis[j]), int(row[j])):
                if lod >= min_lod:
                    tiles.add((face, lod, tx, ty))
    return tiles, mask


def _worker_init(color_src, height_src, use_flat, reg_color, reg_height, reg_bbox, crop_bbox, height_data_bbox, height_min_m, height_max_m):
    # Each worker process loads the sources and the regional overlay once; the
    # overlay lives in generator module globals that are process-local. The overlay
    # is cropped to crop_bbox on load so each worker only holds the tiny island
    # window instead of the full 15-degree regional cell (which otherwise costs ~1 GB
    # of RAM per worker and forces the machine to page).
    g._pool_init(Path(color_src), Path(height_src), use_flat, height_min_m, height_max_m)
    g.set_regional_source(
        Path(reg_color) if reg_color else None,
        Path(reg_height),
        tuple(reg_bbox),
        tuple(crop_bbox),
        tuple(height_data_bbox) if height_data_bbox is not None else None,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--min-lod', type=int, default=1)
    parser.add_argument('--max-lod', type=int, default=11,
                        help='Max LOD when baking a single custom --bbox region '
                             '(the default island set carries its own per-island LODs).')
    parser.add_argument('--face-size', type=int, default=2048,
                        help='Color tile size at/below the LOD knee (scales down for higher LODs).')
    parser.add_argument('--height-size', type=int, default=256,
                        help='Height tile size at/below the LOD knee (scales down for higher LODs).')
    parser.add_argument('--height-min-m', type=float, default=-11000.0)
    parser.add_argument('--height-max-m', type=float, default=9000.0)
    parser.add_argument('--grid-step-deg', type=float, default=0.01,
                        help='Sampling grid spacing; must be < one max-LOD tile width.')
    parser.add_argument('--wide-lod', type=int, default=WIDE_LOD,
                        help='Coarse LOD used to paint the wide XHR color overlay into '
                             'the surrounding ocean (0 disables the wide fill). Only '
                             'applies to the default multi-island set, not --bbox.')
    parser.add_argument('--wide-bbox', type=float, nargs=4, default=list(WIDE_BBOX),
                        metavar=('LON_MIN', 'LON_MAX', 'LAT_MIN', 'LAT_MAX'),
                        help='Extent of the wide coarse XHR color overlay (kept inside '
                             'the XHR source cell so every tile has real color data).')
    parser.add_argument('--bbox', type=float, nargs=4, default=None,
                        metavar=('LON_MIN', 'LON_MAX', 'LAT_MIN', 'LAT_MAX'),
                        help='Bake a single custom region (at --max-lod) instead of '
                             'the default multi-island Hawaiian set.')
    parser.add_argument('--out-root', type=str, default='assets/earth')
    parser.add_argument('--no-ktx2', action='store_true', default=False)
    parser.add_argument('--jobs', type=int,
                        default=max(1, min((__import__('os').cpu_count() or 1), 8)))
    parser.add_argument('--dry-run', action='store_true', default=False,
                        help='Report the tile counts that would be baked, then exit.')
    args = parser.parse_args()

    color_src_path = _REPO_ROOT / 'textures/bluemarble_4096.jpg'
    height_src_path = _REPO_ROOT / 'textures/DEM/ETOPO_2022_v1_60s_surface.tif'
    reg_color = _REPO_ROOT / REGION_COLOR
    reg_height = _REPO_ROOT / REGION_HEIGHT

    for p in (color_src_path, height_src_path, reg_color, reg_height):
        if not p.exists():
            raise FileNotFoundError(f'Required source not found: {p}')

    out_root = _REPO_ROOT / args.out_root
    out_color_root = out_root / 'color'
    out_height_root = out_root / 'height'
    out_color_root.mkdir(parents=True, exist_ok=True)
    out_height_root.mkdir(parents=True, exist_ok=True)

    can_try_ktx2 = not args.no_ktx2

    # Region to bake: an explicit --bbox bakes a single custom box uniformly at
    # --max-lod; otherwise the whole Hawaiian chain is baked with a land-driven LOD
    # gradient (islands at ISLAND_LOD, ocean filled with coarser tiles out to
    # OCEAN_MIN_LOD). Only the Big Island lies inside the XHR height source's real
    # data, so the high-res height override is confined there and the base globe
    # supplies relief for the other islands.
    if args.bbox is not None:
        chain_bbox = tuple(args.bbox)
        overall_max_lod = args.max_lod
        height_data_bbox = None
        tiles = collect_island_tiles(chain_bbox, args.min_lod, args.max_lod, args.grid_step_deg)
        land_mask = None
        overlay_bbox = chain_bbox
        print(f'Custom region bbox {chain_bbox} -> LOD {args.min_lod}..{args.max_lod}')
    else:
        chain_bbox = CHAIN_BBOX
        overall_max_lod = ISLAND_LOD
        height_data_bbox = BIG_ISLAND_HEIGHT_BBOX
        tiles, land_mask = collect_graded_tiles(chain_bbox, args.min_lod, args.grid_step_deg, height_src_path)
        print(f'Chain bbox {chain_bbox}: land -> LOD {ISLAND_LOD}, ocean graded to '
              f'LOD {OCEAN_MIN_LOD} (rings {LOD_RING_DEG}); '
              f'land cells = {int(land_mask.sum())}')
        # Wide coarse XHR-color fill: paint the regional satellite look far out into
        # the surrounding ocean at a single coarse LOD (no island-grade detail). Union
        # it with the graded chain; deeper chain tiles still win when the camera is
        # close. The overlay crop is widened to WIDE_BBOX so these tiles receive XHR
        # color; their height comes from the base globe (height_data_bbox unchanged).
        overlay_bbox = chain_bbox
        if args.wide_lod and args.wide_lod > 0:
            wide_bbox = tuple(args.wide_bbox)
            # One wide-LOD tile spans ~90/2^lod deg; a step at a quarter of that is
            # dense enough to hit every touched tile without a huge grid.
            wide_step = max(args.grid_step_deg, 90.0 / (1 << args.wide_lod) / 4.0)
            wide_tiles = collect_island_tiles(wide_bbox, args.min_lod, args.wide_lod, wide_step)
            tiles |= wide_tiles
            overlay_bbox = (
                min(chain_bbox[0], wide_bbox[0]), max(chain_bbox[1], wide_bbox[1]),
                min(chain_bbox[2], wide_bbox[2]), max(chain_bbox[3], wide_bbox[3]),
            )
            print(f'Wide XHR color fill: bbox {wide_bbox} at LOD {args.wide_lod} '
                  f'(+{len(wide_tiles)} tiles, step {wide_step:.3f} deg). '
                  f'Overlay crop widened -> more RAM/worker; lower --jobs if it pages.')

    # The regional overlay only needs to cover the baked box, so crop it to the box
    # plus a small pad (tiles whose edges straddle a boundary). This lets each worker
    # hold ~tens of MB instead of ~1 GB of overlay. When the wide color fill is on,
    # overlay_bbox already spans the wide box so its ocean tiles get XHR color too.
    pad = 0.25
    crop_bbox = (
        overlay_bbox[0] - pad,
        overlay_bbox[1] + pad,
        overlay_bbox[2] - pad,
        overlay_bbox[3] + pad,
    )

    # --- Close the quadtree so every refined parent owns all four children; ragged
    # region edges would otherwise leave the renderer's all-4-children refine gate
    # stuck coarse. ---------------------------------------------------------------
    before_close = len(tiles)
    tiles = close_quadtree(tiles, args.min_lod)

    per_lod = {}
    for _, lod, _, _ in tiles:
        per_lod[lod] = per_lod.get(lod, 0) + 1

    print(f'{before_close} tiles collected, {len(tiles)} after quadtree closure '
          f'(LOD {args.min_lod}..{overall_max_lod})')
    for lod in sorted(per_lod):
        c, h = sizes_for_lod(lod, args.face_size, args.height_size)
        print(f'  LOD {lod:2d}: {per_lod[lod]:5d} tiles  (color {c}px, height {h}px)')

    if args.dry_run:
        print('Dry run - no tiles baked.')
        return

    tasks = []
    for face, lod, tx, ty in sorted(tiles):
        color_size, height_size = sizes_for_lod(lod, args.face_size, args.height_size)
        tasks.append((
            face, lod, tx, ty, color_size, height_size,
            out_color_root, out_height_root,
            float(args.height_min_m), float(args.height_max_m), can_try_ktx2,
        ))

    # --- Load manifest (merge into existing) --------------------------------
    manifest_path = out_root / 'manifest.json'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    else:
        manifest = {'maxAvailableLod': 0, 'tiles': {}}
    manifest['minHeight'] = float(args.height_min_m)
    manifest['maxHeight'] = float(args.height_max_m)
    manifest['maxAvailableLod'] = max(int(manifest.get('maxAvailableLod', 0)), overall_max_lod)

    # --- Bake ---------------------------------------------------------------
    jobs = max(1, int(args.jobs))
    total = len(tasks)
    done = 0
    encoded_any_ktx2 = False

    def _record(result):
        nonlocal done, encoded_any_ktx2
        tile_id, entry, encoded = result
        manifest['tiles'][tile_id] = entry
        encoded_any_ktx2 = encoded_any_ktx2 or encoded
        done += 1
        if done % 100 == 0 or done == total:
            print(f'  baked {done}/{total} tiles')

    if jobs > 1 and total > 1:
        with concurrent.futures.ProcessPoolExecutor(
            max_workers=jobs,
            initializer=_worker_init,
            initargs=(str(color_src_path), str(height_src_path), False,
                      str(reg_color), str(reg_height), REGION_BBOX, crop_bbox, height_data_bbox,
                      float(args.height_min_m), float(args.height_max_m)),
        ) as executor:
            for result in executor.map(g._pool_run_task, tasks, chunksize=8):
                _record(result)
    else:
        # Serial: set the overlay once in this process, then bake in-line.
        color_np, hmap_np = g.load_sources(color_src_path, height_src_path, False,
                                           float(args.height_min_m), float(args.height_max_m))
        g.set_regional_source(reg_color, reg_height, REGION_BBOX, crop_bbox, height_data_bbox)
        for (face, lod, tx, ty, color_size, height_size,
             ocr, ohr, hmin, hmax, try_ktx2) in tasks:
            _record(g.build_tile_assets(face, lod, tx, ty, color_size, height_size,
                                        color_np, hmap_np, ocr, ohr, hmin, hmax, try_ktx2))

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'Wrote manifest: {manifest_path}')
    print(f'maxAvailableLod = {manifest["maxAvailableLod"]}, total tiles in manifest = {len(manifest["tiles"])}')
    if can_try_ktx2 and not encoded_any_ktx2:
        print('[warn] toktx not found/failed; PNG color fallbacks were written. '
              'planet2RequireKtx2 will reject PNG-only tiles.')


if __name__ == '__main__':
    main()
