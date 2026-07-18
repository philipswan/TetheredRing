"""Adaptive global LOD map for the planet2 cubed-sphere base, built in verifiable steps.

The goal is a variance-driven restricted quadtree so mountainous regions get LOD 6
while flat/ocean areas stay LOD 3-5, avoiding a wasteful uniform-LOD6 bake
(6*64*64 = 24,576 tiles).

Steps (each writes a colored visualization bake you can load in the globe via
?planet2Assets=earth_lodvis):
  step1 - classify every LOD-6 tile as mountainous via elevation std-dev over its
          ETOPO footprint (top percentile of LAND tiles; ocean excluded).
  step2 - dilate: any LOD-6 tile with dx^2+dy^2 <= 16 of a mountainous tile
          (Euclidean radius 4, across cube faces) is also marked LOD 6.
  step3 - bottom-up quad completion: fill LOD6 to complete LOD5 quads, LOD5 to
          complete LOD4 quads, LOD4 to complete LOD3 quads (LOD3 = global floor),
          yielding a sibling-closed quadtree.

The visualization reuses the real tile-writing pipeline (KTX2 color + u16 .bin
height + manifest) but FABRICATES pixels (solid fill + per-cell borders) so the
exact same code path that ships real tiles is exercised. It is written to a
separate asset folder so existing work in assets/earth is preserved.

Classification state is cached in assets/earth_lodvis/state/*.npz so later steps
(and re-runs) don't recompute the variance pass.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import shutil
import warnings
from pathlib import Path

import numpy as np
from PIL import Image

import tools.generate_planet2_lod0_assets as g
import tools.bake_hawaii_bigisland_hires as hawaii
from tools.fetch_chimborazo_sources import prepare_sources as prepare_chimborazo_sources
from tools.fetch_moon_sources import (
    prepare_sources as prepare_moon_sources,
    prepare_korolev_sources,
    prepare_region_sources,
)

ROOT = Path(__file__).resolve().parents[1]
VIZ_ROOT = ROOT / 'assets' / 'earth_lodvis'
STATE_DIR = VIZ_ROOT / 'state'

# ETOPO decode range used by the base bake / cache; std/land only need meters.
HEIGHT_MIN_M = -11000.0
HEIGHT_MAX_M = 9000.0

LOD6 = 6
TILES_PER_FACE_AXIS = 1 << LOD6  # 64
BASE_FULL_COVERAGE_LOD = 3
COLOR_SOURCE = 'textures/bluemarble_4096.jpg'   # only to satisfy load_sources()
HEIGHT_SOURCE = 'textures/DEM/ETOPO_2022_v1_60s_surface.tif'

# Viz tile sizes (small: fabricated content, not source imagery).
VIZ_COLOR_SIZE = 256
VIZ_HEIGHT_SIZE = 64
# Sea-level u16 code so the viz globe renders as a smooth sphere (no displacement).
_SEA_LEVEL_CODE = int(round((0.0 - HEIGHT_MIN_M) / (HEIGHT_MAX_M - HEIGHT_MIN_M) * 65535.0))

# Classification labels (per LOD-6 cell) and their fill colors.
OCEAN, LAND, MOUNTAIN, DILATED = 0, 1, 2, 3
PALETTE = {
    OCEAN: (28, 58, 116),
    LAND: (56, 132, 60),
    MOUNTAIN: (206, 58, 40),
    DILATED: (232, 130, 40),
}
BORDER_RGB = (12, 12, 12)
BORDER_FRAC = 0.06  # fraction of a LOD-6 cell drawn as border on each edge

# LOD fill colors for the step-3 map (by tile LOD).
LOD_PALETTE = {
    3: (40, 70, 150),
    4: (46, 140, 120),
    5: (210, 170, 40),
    6: (206, 58, 40),
}

# LOD fill colors for regional enhancement tilesets. Coarse tiles are blue;
# progressively finer tiles move through green/yellow/red to magenta.
ENHANCEMENT_LOD_PALETTE = {
    0: (35, 55, 120),
    1: (35, 85, 155),
    2: (30, 120, 175),
    3: (35, 150, 145),
    4: (70, 170, 100),
    5: (145, 180, 55),
    6: (205, 175, 40),
    7: (230, 130, 35),
    8: (225, 85, 35),
    9: (205, 45, 40),
    10: (160, 30, 75),
}

KTX_RELEASES_URL = 'https://github.com/KhronosGroup/KTX-Software/releases'


def _toktx_available() -> bool:
    if shutil.which('toktx'):
        return True
    ktx_tools_bin = os.environ.get('KTX_TOOLS_BIN')
    if ktx_tools_bin:
        executable = 'toktx.exe' if os.name == 'nt' else 'toktx'
        if (Path(ktx_tools_bin) / executable).exists():
            return True
    if os.name == 'nt':
        return any(path.exists() for path in (
            Path('C:/Program Files/KTX-Software/bin/toktx.exe'),
            Path('C:/Program Files (x86)/KTX-Software/bin/toktx.exe'),
        ))
    return False

def _print_toktx_install_instructions() -> None:
    print('[ktx2] WARNING: toktx.exe was not found; PNG fallback tiles will be generated.')
    print('[ktx2] To install it:')
    print(f'  1. Open {KTX_RELEASES_URL}')
    print('  2. Open the latest release and click "Show all" to display every download.')
    print('  3. Choose the release for your operating system.')
    print('  4. Run the installer and install only the command-line tools.')
    print('  5. Ensure toktx is on PATH, or set KTX_TOOLS_BIN to its bin directory.')


# ---------------------------------------------------------------------------
# Step 1: variance classification
# ---------------------------------------------------------------------------

def _load_sources() -> tuple[np.ndarray, np.ndarray]:
    """The bluemarble RGB and the ETOPO height (u16 codes, memory-mapped)."""
    color_src = ROOT / COLOR_SOURCE
    height_src = ROOT / HEIGHT_SOURCE
    rgb, hmap_u16 = g.load_sources(color_src, height_src, False, HEIGHT_MIN_M, HEIGHT_MAX_M)
    return rgb, hmap_u16


# Ocean requires BOTH signals: below sea level AND visually blue. This keeps dry
# sub-sea-level basins (Lake Eyre, Death Valley, the Netherlands) classified as
# land while real water (oceans, the Caspian) stays ocean.
_OCEAN_BLUE_MARGIN = 10

# A tile is mountain-eligible once it has at least this many real land samples,
# so islands far smaller than a LOD-6 tile (Hawaii, Tahiti, Tristan da Cunha)
# qualify on their relief instead of needing an area majority. Using a sample
# COUNT (not a fraction) keeps the bar independent of samples-per-tile while still
# rejecting 1-2 stray coastal samples. The percentile threshold is still
# calibrated on substantial-land tiles.
_MIN_LAND_SAMPLES = 3


def _face_tile_stats(face: str, rgb: np.ndarray, hmap_u16: np.ndarray, samples_per_tile: int):
    """Return (std_m, land_fraction) as (64, 64) [tile_y, tile_x] arrays for a face.

    Samples a uniform grid over the whole face, maps it to the sources with the
    SAME convention the baker uses, then reduces per LOD-6 tile. Relief drives the
    mountain metric; ocean is where a sample is below sea level AND blue in color.
    """
    src_h, src_w = hmap_u16.shape
    n = TILES_PER_FACE_AXIS * samples_per_tile  # total samples per face axis
    s = (np.arange(n, dtype=np.float64) + 0.5) / n
    axis = -1.0 + 2.0 * s  # cube coord in [-1, 1]
    u, v = np.meshgrid(axis, axis)  # u[py,px]=axis[px] (tile_x dir), v -> tile_y dir

    dx, dy, dz = g.cube_to_direction_grid(face, u, v)

    xs, ys = g.direction_to_equirect_xy_grid(dx, dy, dz, src_w, src_h)
    xi = np.clip(np.rint(xs).astype(np.intp), 0, src_w - 1)
    yi = np.clip(np.rint(ys).astype(np.intp), 0, src_h - 1)
    codes = np.asarray(hmap_u16[yi, xi], dtype=np.float64)
    meters = HEIGHT_MIN_M + codes * (HEIGHT_MAX_M - HEIGHT_MIN_M) / 65535.0

    # Color-based water test on the (possibly different-resolution) color source.
    ch, cw = rgb.shape[0], rgb.shape[1]
    cxs, cys = g.direction_to_equirect_xy_grid(dx, dy, dz, cw, ch)
    cxi = np.clip(np.rint(cxs).astype(np.intp), 0, cw - 1)
    cyi = np.clip(np.rint(cys).astype(np.intp), 0, ch - 1)
    px = rgb[cyi, cxi].astype(np.int16)
    r, gch, b = px[..., 0], px[..., 1], px[..., 2]
    is_blue = (b >= r) & (b >= gch) & ((b - r) > _OCEAN_BLUE_MARGIN)
    is_ocean = (meters <= 0.0) & is_blue
    is_land = ~is_ocean

    # Relief is the std of LAND-only samples (ocean excluded, not clamped) so a
    # small tall island isn't diluted toward zero by the surrounding ocean, and
    # continental shelves don't look mountainous from bathymetry alone. Ocean-only
    # tiles have no land samples -> nan -> 0. (v_tile, v_sub, u_tile, u_sub)
    land_only = np.where(is_land, meters, np.nan)
    blocks = land_only.reshape(TILES_PER_FACE_AXIS, samples_per_tile,
                               TILES_PER_FACE_AXIS, samples_per_tile)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', category=RuntimeWarning)  # all-nan ocean tiles
        relief_m = np.nan_to_num(np.nanstd(blocks, axis=(1, 3)), nan=0.0)
    land_blocks = is_land.reshape(TILES_PER_FACE_AXIS, samples_per_tile,
                                  TILES_PER_FACE_AXIS, samples_per_tile)
    land_fraction = land_blocks.mean(axis=(1, 3))
    land_count = land_blocks.sum(axis=(1, 3))
    return relief_m, land_fraction, land_count


def step1(percentile: float, land_frac: float, samples_per_tile: int) -> dict:
    """Classify every LOD-6 tile; cache and return per-face label grids."""
    rgb, hmap_u16 = _load_sources()

    relief_by_face: dict[str, np.ndarray] = {}
    land_by_face: dict[str, np.ndarray] = {}
    count_by_face: dict[str, np.ndarray] = {}
    for face in g.FACES:
        relief_m, land_fraction, land_count = _face_tile_stats(face, rgb, hmap_u16, samples_per_tile)
        relief_by_face[face] = relief_m
        land_by_face[face] = land_fraction
        count_by_face[face] = land_count

    # Calibrate the threshold on substantial-land tiles (land_fraction >= land_frac)
    # so a fringe of coastal/island slivers can't skew it.
    land_mask_all = np.concatenate([
        (land_by_face[f] >= land_frac).ravel() for f in g.FACES])
    relief_all = np.concatenate([relief_by_face[f].ravel() for f in g.FACES])
    land_relief = relief_all[land_mask_all]
    if land_relief.size == 0:
        raise SystemExit('No land tiles found; check land_frac / height source.')
    threshold = float(np.percentile(land_relief, percentile))

    labels: dict[str, np.ndarray] = {}
    n_mountain = 0
    for face in g.FACES:
        is_land = land_by_face[face] >= land_frac
        # A handful of real land samples makes a tile mountain-eligible, so sub-tile
        # islands (Hawaii, Tahiti, Tristan da Cunha) with big relief aren't excluded
        # for lacking an area majority.
        has_land = count_by_face[face] >= _MIN_LAND_SAMPLES
        grid = np.where(is_land, LAND, OCEAN).astype(np.int8)
        mountain = has_land & (relief_by_face[face] >= threshold)
        grid[mountain] = MOUNTAIN
        labels[face] = grid
        n_mountain += int(mountain.sum())

    total = TILES_PER_FACE_AXIS * TILES_PER_FACE_AXIS * len(g.FACES)
    n_land = int(land_mask_all.sum())
    print(f'[step1] relief threshold (p{percentile:g} of land) = {threshold:.1f} m')
    print(f'[step1] land tiles={n_land}/{total}  mountainous={n_mountain} '
          f'({100.0 * n_mountain / total:.1f}% of globe)')

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(STATE_DIR / 'step1.npz',
             threshold=threshold, percentile=percentile, land_frac=land_frac,
             **{f: labels[f] for f in g.FACES},
             **{f'oceanonly_{f}': (count_by_face[f] == 0) for f in g.FACES})
    return labels


def _load_step1() -> dict:
    path = STATE_DIR / 'step1.npz'
    if not path.exists():
        raise SystemExit('step1 state not found; run "step1" first.')
    d = np.load(path)
    return {f: d[f].astype(np.int8) for f in g.FACES}


def _load_ocean_only() -> dict:
    """Per-face mask of tiles that are strictly all-ocean (no land samples at all)."""
    d = np.load(STATE_DIR / 'step1.npz')
    key0 = f'oceanonly_{g.FACES[0]}'
    if key0 not in d.files:
        raise SystemExit('step1 state predates the ocean-only mask; re-run "step1".')
    return {f: d[f'oceanonly_{f}'].astype(bool) for f in g.FACES}


def _load_step2() -> dict:
    path = STATE_DIR / 'step2.npz'
    if not path.exists():
        raise SystemExit('step2 state not found; run "step2" first.')
    d = np.load(path)
    return {f: d[f].astype(np.int8) for f in g.FACES}


# ---------------------------------------------------------------------------
# Step 2: cross-face dilation
# ---------------------------------------------------------------------------

def _owning_face_cell(dx: np.ndarray, dy: np.ndarray, dz: np.ndarray):
    """Map unit direction grids to (face_index, row, col) on the 64x64 face grid.

    face_index follows g.FACES order [+X,-X,+Y,-Y,+Z,-Z]. Inverse of
    cube_to_direction: the owning face is the dominant |component|, and (u, v)
    come from the exact per-face formulas that invert cube_to_direction.
    """
    ax, ay, az = np.abs(dx), np.abs(dy), np.abs(dz)
    face_idx = np.empty(dx.shape, dtype=np.intp)
    u = np.empty(dx.shape, dtype=np.float64)
    v = np.empty(dx.shape, dtype=np.float64)

    mx = (ax >= ay) & (ax >= az)
    my = (ay >= ax) & (ay >= az) & ~mx
    mz = ~mx & ~my

    pos = mx & (dx > 0.0)              # +X: u=-z/x, v=y/x
    neg = mx & ~(dx > 0.0)            # -X: u=-z/x, v=-y/x
    face_idx[pos] = 0; u[pos] = -dz[pos] / dx[pos]; v[pos] = dy[pos] / dx[pos]
    face_idx[neg] = 1; u[neg] = -dz[neg] / dx[neg]; v[neg] = -dy[neg] / dx[neg]

    posy = my & (dy > 0.0)            # +Y: u=x/y, v=-z/y
    negy = my & ~(dy > 0.0)          # -Y: u=-x/y, v=-z/y
    face_idx[posy] = 2; u[posy] = dx[posy] / dy[posy]; v[posy] = -dz[posy] / dy[posy]
    face_idx[negy] = 3; u[negy] = -dx[negy] / dy[negy]; v[negy] = -dz[negy] / dy[negy]

    posz = mz & (dz > 0.0)            # +Z: u=x/z, v=y/z
    negz = mz & ~(dz > 0.0)          # -Z: u=x/z, v=-y/z
    face_idx[posz] = 4; u[posz] = dx[posz] / dz[posz]; v[posz] = dy[posz] / dz[posz]
    face_idx[negz] = 5; u[negz] = dx[negz] / dz[negz]; v[negz] = -dy[negz] / dz[negz]

    col = np.clip(((u + 1.0) * 0.5 * TILES_PER_FACE_AXIS).astype(np.intp),
                  0, TILES_PER_FACE_AXIS - 1)
    row = np.clip(((v + 1.0) * 0.5 * TILES_PER_FACE_AXIS).astype(np.intp),
                  0, TILES_PER_FACE_AXIS - 1)
    return face_idx, row, col


def _padded_mountain_mask(face: str, mstack: np.ndarray, radius: int) -> np.ndarray:
    """A (64+2R)x(64+2R) mountain mask for `face` whose R-cell halo is filled
    from the true neighbouring faces (via the cube-face geometry)."""
    n = TILES_PER_FACE_AXIS
    p = n + 2 * radius
    jj = np.arange(p, dtype=np.float64) - radius            # face cell index in [-R, n+R)
    coord = -1.0 + 2.0 * (jj + 0.5) / n                     # cube coord (|.|>1 in halo)
    uu, vv = np.meshgrid(coord, coord)                      # uu -> col dir, vv -> row dir
    dx, dy, dz = g.cube_to_direction_grid(face, uu, vv)
    ofi, orow, ocol = _owning_face_cell(dx, dy, dz)
    return mstack[ofi, orow, ocol]


def _dilate_disk(mask: np.ndarray, radius: int, r2: int) -> np.ndarray:
    """Shift-OR dilation with a disk kernel dx^2+dy^2 <= r2 (no wrap)."""
    p = mask.shape[0]
    out = np.zeros_like(mask)
    for ddy in range(-radius, radius + 1):
        for ddx in range(-radius, radius + 1):
            if ddx * ddx + ddy * ddy > r2:
                continue
            ys0, ys1 = max(0, ddy), p + min(0, ddy)
            yd0, yd1 = max(0, -ddy), p + min(0, -ddy)
            xs0, xs1 = max(0, ddx), p + min(0, ddx)
            xd0, xd1 = max(0, -ddx), p + min(0, -ddx)
            out[yd0:yd1, xd0:xd1] |= mask[ys0:ys1, xs0:xs1]
    return out


def step2(radius: int) -> dict:
    """Dilate the mountain mask by a disk of radius `radius` (dx^2+dy^2 <= r^2),
    across cube faces, marking newly covered non-mountain tiles as DILATED. Tiles
    that are strictly all-ocean (no land samples) are never dilated into."""
    labels = _load_step1()
    ocean_only = _load_ocean_only()
    r2 = radius * radius
    mstack = np.stack([(labels[f] == MOUNTAIN) for f in g.FACES])  # (6, 64, 64) bool

    n = TILES_PER_FACE_AXIS
    labels2: dict[str, np.ndarray] = {}
    n_dilated = 0
    for face in g.FACES:
        padded = _padded_mountain_mask(face, mstack, radius)
        dilated = _dilate_disk(padded, radius, r2)[radius:radius + n, radius:radius + n]
        grid = labels[face].copy()
        newmask = dilated & (grid != MOUNTAIN) & ~ocean_only[face]
        grid[newmask] = DILATED
        labels2[face] = grid
        n_dilated += int(newmask.sum())

    total = n * n * len(g.FACES)
    n_mountain = int(sum((labels[f] == MOUNTAIN).sum() for f in g.FACES))
    n_hires = n_mountain + n_dilated
    print(f'[step2] radius={radius} (dx^2+dy^2 <= {r2}), cross-face')
    print(f'[step2] mountain={n_mountain}  +dilated={n_dilated}  '
          f'-> hi-res={n_hires}/{total} ({100.0 * n_hires / total:.1f}% of globe)')

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(STATE_DIR / 'step2.npz', radius=radius,
             **{f: labels2[f] for f in g.FACES})
    return labels2


# ---------------------------------------------------------------------------
# Step 3: bottom-up quad completion (restricted quadtree, LOD3 floor)
# ---------------------------------------------------------------------------

def _block_any(mask: np.ndarray) -> np.ndarray:
    """OR-reduce a (2n x 2n) mask into (n x n): a parent is set if any of its
    four children is set."""
    n = mask.shape[0]
    return mask.reshape(n // 2, 2, n // 2, 2).any(axis=(1, 3))


def _up(mask: np.ndarray, factor: int) -> np.ndarray:
    """Nearest-expand a mask by an integer factor (each cell -> factor x factor)."""
    return np.repeat(np.repeat(mask, factor, axis=0), factor, axis=1)


def _quadtree_face(seed6: np.ndarray) -> dict:
    """Bottom-up quad completion for one face.

    Input: seed6 (64x64 bool) = LOD-6 cells that must render at LOD 6.
    Any LOD-5 node containing a seed is subdivided (all 4 LOD-6 children become
    leaves); the same completion propagates up to LOD 4 and LOD 3. LOD 3 is the
    global floor, so every LOD-3 node exists. The result is a sibling-closed
    quadtree: whenever a node subdivides, all 4 children are present (as leaves
    or as further-subdivided nodes).
    """
    subdiv5 = _block_any(seed6)          # 32x32: LOD-5 node has LOD-6 content
    subdiv4 = _block_any(subdiv5)        # 16x16
    subdiv3 = _block_any(subdiv4)        # 8x8

    present4 = _up(subdiv3, 2)           # 16x16: LOD-4 node exists (parent split)
    present5 = _up(subdiv4, 2)           # 32x32
    present6 = _up(subdiv5, 2)           # 64x64

    leaf3 = ~subdiv3
    leaf4 = present4 & ~subdiv4
    leaf5 = present5 & ~subdiv5
    leaf6 = present6.copy()              # every present LOD-6 node is a leaf

    # Per-LOD-6-cell assigned leaf LOD (coarse -> fine; regions are disjoint).
    assigned = np.full((TILES_PER_FACE_AXIS, TILES_PER_FACE_AXIS), 3, dtype=np.int8)
    assigned[_up(leaf4, 4)] = 4
    assigned[_up(leaf5, 2)] = 5
    assigned[leaf6] = 6

    return {
        'subdiv3': subdiv3, 'subdiv4': subdiv4, 'subdiv5': subdiv5,
        'present4': present4, 'present5': present5, 'present6': present6,
        'leaf3': leaf3, 'leaf4': leaf4, 'leaf5': leaf5, 'leaf6': leaf6,
        'assigned': assigned,
    }


def step3() -> dict:
    """Turn the step-2 hi-res seed set (MOUNTAIN + DILATED) into a sibling-closed
    varied-LOD leaf map via bottom-up quad completion."""
    labels = _load_step2()
    faces = _build_adaptive_faces(labels)
    tasks, _ = _iter_adaptive_tile_specs(faces)
    counts = {3: 0, 4: 0, 5: 0, 6: 0}
    for face in g.FACES:
        q = faces[face]
        counts[3] += int(q['leaf3'].sum())
        counts[4] += int(q['leaf4'].sum())
        counts[5] += int(q['leaf5'].sum())
        counts[6] += int(q['leaf6'].sum())

    total_leaves = sum(counts.values())
    total_tiles = len(tasks)
    internal = total_tiles - total_leaves
    uniform6_leaves = TILES_PER_FACE_AXIS * TILES_PER_FACE_AXIS * len(g.FACES)
    uniform6_tiles = ((1 << (2 * (LOD6 + 1))) - 1) // 3 * len(g.FACES)
    print(f'[step3] leaves: LOD3={counts[3]}  LOD4={counts[4]}  '
          f'LOD5={counts[5]}  LOD6={counts[6]}')
    print(f'[step3] total leaves={total_leaves}  (+{internal} internal '
          f'= {total_tiles} tiles to bake)')
    print(f'[step3] vs uniform LOD6: {total_leaves}/{uniform6_leaves} leaves '
          f'({100.0 * total_leaves / uniform6_leaves:.1f}%), '
          f'{total_tiles}/{uniform6_tiles} tiles '
          f'({100.0 * total_tiles / uniform6_tiles:.1f}%)')

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(STATE_DIR / 'step3.npz',
             **{f: faces[f]['assigned'] for f in g.FACES})
    return faces


def _build_adaptive_faces(labels: dict) -> dict:
    """Build the adaptive quadtree faces from the step-2 labels."""
    faces: dict[str, dict] = {}
    for face in g.FACES:
        seed6 = (labels[face] == MOUNTAIN) | (labels[face] == DILATED)
        q = _quadtree_face(seed6)
        q['label'] = labels[face]
        faces[face] = q
    return faces


def _iter_adaptive_tile_specs(faces: dict) -> tuple[list[tuple[str, int, int, int]], list[int]]:
    """Return the exact adaptive tile plan shared by viz and real bakes."""
    tasks: list[tuple[str, int, int, int]] = []
    per_lod: list[int] = []
    for lod in range(0, LOD6 + 1):
        n_lod = 0
        for face in g.FACES:
            present = _present_mask(faces[face], lod)
            ys, xs = np.nonzero(present)
            n_lod += len(ys)
            for ty, tx in zip(ys.tolist(), xs.tolist()):
                tasks.append((face, lod, int(tx), int(ty)))
        per_lod.append(n_lod)
    return tasks, per_lod


def _cleanup_state_dir() -> None:
    """Remove step1/2/3 state after a successful bake."""
    shutil.rmtree(STATE_DIR, ignore_errors=True)


# ---------------------------------------------------------------------------
# Visualization bake (reuses the real tile pipeline; fabricated pixels)
# ---------------------------------------------------------------------------

def _paint_cell_tile(face: str, lod: int, tx: int, ty: int, grid_face: np.ndarray,
                     palette: dict) -> np.ndarray:
    """Fabricate a color tile that paints each covered LOD-6 cell + borders."""
    p = VIZ_COLOR_SIZE
    n = 1 << lod
    s = (np.arange(p, dtype=np.float64) + 0.5) / p
    fx = (tx + s) / n * TILES_PER_FACE_AXIS  # global LOD-6 column coord, per px (u)
    fy = (ty + s) / n * TILES_PER_FACE_AXIS  # global LOD-6 row coord, per px (v)
    col = np.clip(fx.astype(np.intp), 0, TILES_PER_FACE_AXIS - 1)
    row = np.clip(fy.astype(np.intp), 0, TILES_PER_FACE_AXIS - 1)

    cls = grid_face[np.ix_(row, col)]  # (p_py, p_px)
    lut = np.zeros((max(palette) + 1, 3), dtype=np.uint8)
    for k, rgb in palette.items():
        lut[k] = rgb
    img = lut[cls]

    cfx = fx - np.floor(fx)
    cfy = fy - np.floor(fy)
    bx = (cfx < BORDER_FRAC) | (cfx > 1.0 - BORDER_FRAC)
    by = (cfy < BORDER_FRAC) | (cfy > 1.0 - BORDER_FRAC)
    border = by[:, None] | bx[None, :]
    img[border] = BORDER_RGB
    return img


def _solid_tile(rgb: tuple) -> np.ndarray:
    p = VIZ_COLOR_SIZE
    img = np.empty((p, p, 3), dtype=np.uint8)
    img[:] = rgb
    img[:2, :] = BORDER_RGB
    img[-2:, :] = BORDER_RGB
    img[:, :2] = BORDER_RGB
    img[:, -2:] = BORDER_RGB
    return img


def _write_viz_tile(root: Path, face: str, lod: int, tx: int, ty: int,
                    color_rgb: np.ndarray) -> tuple:
    out_color = root / 'color' / face / str(lod) / str(tx)
    out_height = root / 'height' / face / str(lod) / str(tx)
    out_color.mkdir(parents=True, exist_ok=True)
    out_height.mkdir(parents=True, exist_ok=True)

    png_path = out_color / f'{ty}.png'
    Image.fromarray(color_rgb, mode='RGB').save(png_path)
    ktx2_path = out_color / f'{ty}.ktx2'
    encoded_ktx2 = False
    if g.try_encode_ktx2(png_path, ktx2_path):
        encoded_ktx2 = True
        png_path.unlink(missing_ok=True)

    height = np.full(VIZ_HEIGHT_SIZE * VIZ_HEIGHT_SIZE, _SEA_LEVEL_CODE, dtype='<u2')
    height.tofile(out_height / f'{ty}.bin')

    tile_id = f'{face}/{lod}/{tx}/{ty}'
    entry = {'roughness': 0.0, 'landFraction': 0.3,
             'width': VIZ_HEIGHT_SIZE, 'height': VIZ_HEIGHT_SIZE}
    return tile_id, entry, encoded_ktx2


def _write_manifest(tiles: dict, max_lod: int) -> None:
    manifest = {
        'maxAvailableLod': max_lod,
        'minHeight': HEIGHT_MIN_M,
        'maxHeight': HEIGHT_MAX_M,
        'tiles': tiles,
    }
    (VIZ_ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')


def bake_cell_viz(labels: dict, palette: dict, display_lod: int = 3) -> None:
    """Bake a full pyramid (LOD 0..display_lod) painting the LOD-6 cell labels."""
    tiles: dict[str, dict] = {}
    count = 0
    for lod in range(0, display_lod + 1):
        n = 1 << lod
        for face in g.FACES:
            for ty in range(n):
                for tx in range(n):
                    img = _paint_cell_tile(face, lod, tx, ty, labels[face], palette)
                    tile_id, entry = _write_viz_tile(VIZ_ROOT, face, lod, tx, ty, img)
                    tiles[tile_id] = entry
                    count += 1
        print(f'  baked LOD{lod}: {6 * n * n} tiles ({count} total)')
    _write_manifest(tiles, display_lod)
    print(f'[viz] wrote {count} tiles + manifest to {VIZ_ROOT}')


def _paint_lod_map_tile(face: str, lod: int, tx: int, ty: int,
                        label_face: np.ndarray, assigned_face: np.ndarray,
                        lod_palette: dict | None = None) -> np.ndarray:
    """Paint one flat overlay tile: each LOD-6 cell coloured by its land class
    (PALETTE: ocean/land/near-mountain/mountain), with borders drawn only along
    the leaf-tile boundaries so the varied-LOD quad structure is also visible.

    Enhancement tilesets can supply an LOD palette to render each tile by its
    refinement level while retaining the same visualization tile writer.
    """
    if lod_palette is not None:
        if lod in lod_palette:
            rgb = lod_palette[lod]
        else:
            nearest_lod = min(lod_palette, key=lambda level: abs(level - lod))
            rgb = lod_palette[nearest_lod]
        return _solid_tile(rgb)

    p = VIZ_COLOR_SIZE
    n = 1 << lod
    s = (np.arange(p, dtype=np.float64) + 0.5) / p
    fx = (tx + s) / n * TILES_PER_FACE_AXIS  # per-px global LOD-6 column coord (u)
    fy = (ty + s) / n * TILES_PER_FACE_AXIS  # per-px global LOD-6 row coord (v)
    col = np.clip(fx.astype(np.intp), 0, TILES_PER_FACE_AXIS - 1)
    row = np.clip(fy.astype(np.intp), 0, TILES_PER_FACE_AXIS - 1)

    lbl = label_face[np.ix_(row, col)]     # (p_py, p_px) class 0..3
    lut = np.zeros((max(PALETTE) + 1, 3), dtype=np.uint8)
    for k, rgb in PALETTE.items():
        lut[k] = rgb
    img = lut[lbl]

    # Leaf-boundary borders: a leaf at LOD L spans a 2^(6-L) block of LOD-6 cells;
    # draw a border on the block's outer edges.
    cls = assigned_face[np.ix_(row, col)]                 # per-px assigned LOD 3..6
    blk = (1 << (LOD6 - cls)).astype(np.intp)             # per-px block size
    col2d = np.broadcast_to(col[None, :], (p, p))
    row2d = np.broadcast_to(row[:, None], (p, p))
    cfx = (fx - np.floor(fx))[None, :]
    cfy = (fy - np.floor(fy))[:, None]
    on_l = (col2d % blk == 0) & (cfx < BORDER_FRAC)
    on_r = (col2d % blk == blk - 1) & (cfx > 1.0 - BORDER_FRAC)
    on_t = (row2d % blk == 0) & (cfy < BORDER_FRAC)
    on_b = (row2d % blk == blk - 1) & (cfy > 1.0 - BORDER_FRAC)
    img[on_l | on_r | on_t | on_b] = BORDER_RGB
    return img


def bake_lod_map_viz(faces: dict, display_lod: int = 3) -> None:
    """Bake a cheap flat LOD-0..display_lod overlay pyramid that PAINTS the land
    classification (ocean/land/near-mountain/mountain) with the final leaf-tile
    boundaries drawn on top. This just shows which tiles will be baked; planet2
    renders it as flat tiles with no LOD refinement."""
    _ = display_lod
    # Wipe prior viz tiles so stale deep-LOD bakes don't linger on disk.
    for sub in ('color', 'height'):
        d = VIZ_ROOT / sub
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)

    tasks, per_lod = _iter_adaptive_tile_specs(faces)
    tiles: dict[str, dict] = {}
    count = 0
    for face, lod, tx, ty in tasks:
        img = _paint_lod_map_tile(face, lod, tx, ty, faces[face]['label'], faces[face]['assigned'])
        tile_id, entry = _write_viz_tile(VIZ_ROOT, face, lod, tx, ty, img)
        tiles[tile_id] = entry
        count += 1
    for lod, n_lod in enumerate(per_lod):
        print(f'  baked LOD{lod}: {n_lod} tiles')
    _write_manifest(tiles, LOD6)
    _cleanup_state_dir()
    print(f'[viz] wrote {count} tiles + manifest to {VIZ_ROOT}')


# ---------------------------------------------------------------------------
# Step 4: bake the REAL adaptive tiles from imagery, per the step-3 leaf map
# ---------------------------------------------------------------------------

def _present_mask(q: dict, lod: int) -> np.ndarray:
    """Bool grid of which LOD-`lod` nodes exist in the adaptive quadtree.

    LOD0..2 are always-present internal nodes and LOD3 is the global floor, so
    every node exists there; deeper levels come from the quad-completion masks.
    """
    if lod <= 3:
        n = 1 << lod
        return np.ones((n, n), dtype=bool)
    return q['present4'] if lod == 4 else q['present5'] if lod == 5 else q['present6']


def _ensure_color_cache(color_src: Path) -> Path:
    """Return a memory-mappable uint8 HxWx3 .npy of the color source, building it
    once. A huge equirect PNG (e.g. 86400x43200 ~= 11 GB decoded) is decoded a
    single time here so parallel bake workers can share one read-only mmap instead
    of each holding a private copy."""
    if color_src.suffix.lower() == '.npy':
        return color_src
    cache = color_src.with_name(f'{color_src.stem}.rgb_u8.npy')
    if cache.exists():
        return cache
    print(f'[step4] building color cache {cache.name} (one-time decode)...')
    arr = np.asarray(Image.open(color_src).convert('RGB'), dtype=np.uint8)
    tmp = cache.with_name(f'{cache.stem}.tmp{os.getpid()}.npy')
    np.save(tmp, arr)
    os.replace(tmp, cache)
    del arr
    return cache


def _ensure_height_cache(height_src: Path, hmin: float, hmax: float) -> Path:
    """Return the memory-mappable u16 .npy of ETOPO in the manifest's code space,
    building it once (same cache the base baker uses)."""
    cache = height_src.with_name(
        f'{height_src.stem}.u16_{int(round(hmin))}_{int(round(hmax))}.npy')
    if cache.exists():
        return cache
    print(f'[step4] building height cache {cache.name} (one-time)...')
    hmap_m = np.asarray(Image.open(height_src), dtype=np.float32).copy()
    hmap = g._encode_meters_to_u16(hmap_m, hmin, hmax)
    del hmap_m
    tmp = cache.with_name(f'{cache.stem}.tmp{os.getpid()}.npy')
    np.save(tmp, hmap)
    os.replace(tmp, cache)
    return cache


# Per-worker memory-mapped sources (populated by _bake_pool_init in each process).
_BAKE_RGB = None
_BAKE_HMAP = None


def _bake_pool_init(color_cache: Path, height_cache: Path) -> None:
    global _BAKE_RGB, _BAKE_HMAP
    _BAKE_RGB = np.load(color_cache, mmap_mode='r')
    _BAKE_HMAP = np.load(height_cache, mmap_mode='r')


def _body_bake_pool_init(color_cache: Path, height_cache: Path,
                         eccentricity_squared: float) -> None:
    g.set_planet_eccentricity_squared(eccentricity_squared)
    _bake_pool_init(color_cache, height_cache)


def _overlay_pool_init(color_cache: Path, height_cache: Path,
                       regional_color_source: str, regional_height_source: str,
                       regional_bbox: tuple, regional_crop_bbox: tuple | None,
                       regional_height_data_bbox: tuple | None) -> None:
    _bake_pool_init(color_cache, height_cache)
    g.set_regional_source(
        Path(regional_color_source), Path(regional_height_source), regional_bbox,
        regional_crop_bbox, regional_height_data_bbox)


def _overlay_base_pool_init(base_root: Path, base_cache: Path,
                            regional_color_source: str, regional_height_source: str,
                            regional_bbox: tuple, regional_crop_bbox: tuple | None,
                            regional_height_data_bbox: tuple | None) -> None:
    global _BAKE_RGB, _BAKE_HMAP
    _BAKE_RGB = _BAKE_HMAP = None
    g.set_base_tile_source(base_root, base_cache)
    g.set_regional_source(Path(regional_color_source), Path(regional_height_source),
                          regional_bbox, regional_crop_bbox, regional_height_data_bbox)


def _bake_pool_task(task: tuple) -> tuple:
    (face, lod, tx, ty, cs, hs, ocr, ohr, hmin, hmax, ktx) = task
    return g.build_tile_assets(face, lod, tx, ty, cs, hs, _BAKE_RGB, _BAKE_HMAP,
                               ocr, ohr, hmin, hmax, ktx)


def step4_bake(color_source: str, height_source: str, out_root: str | None,
               color_size: int, height_size: int, height_min_m: float,
               height_max_m: float, jobs: int, can_try_ktx2: bool,
               lodvis: bool = False, faces: dict | None = None) -> None:
    """Bake the real color+height tiles for exactly the adaptive tile set defined
    by step 3 (every present node LOD0..leaf), from the imagery sources, and write
    a manifest so planet2 refines exactly to the leaf LODs.

    When lodvis is true, the same tile plan is used but the per-tile renderer
    fabricates solid visualization tiles instead of reading source imagery.
    """
    if faces is None:
        labels = _load_step2()
        faces = _build_adaptive_faces(labels)

    if out_root is None:
        out_root = 'assets/earth_lodvis' if lodvis else 'assets/earth'

    color_src = ROOT / color_source
    height_src = ROOT / height_source

    out = ROOT / out_root
    out_color = out / 'color'
    out_height = out / 'height'
    for d in (out_color, out_height):                 # overwrite: clear stale tiles
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
    out_color.mkdir(parents=True, exist_ok=True)
    out_height.mkdir(parents=True, exist_ok=True)

    tile_specs, per_lod = _iter_adaptive_tile_specs(faces)
    tasks = [(face, lod, tx, ty, color_size, height_size, out_color, out_height,
              height_min_m, height_max_m, can_try_ktx2)
             for (face, lod, tx, ty) in tile_specs]
    print(f'[step4] {len(tasks)} tiles to bake -> {out}  (per LOD: {per_lod})')
    if lodvis:
        print(f'[step4] lodvis=true tile={color_size}px/{height_size}px')
    else:
        if not color_src.exists():
            raise SystemExit(f'Color source not found: {color_src}')
        if not height_src.exists():
            raise SystemExit(f'Height source not found: {height_src}')
        color_cache = _ensure_color_cache(color_src)
        height_cache = _ensure_height_cache(height_src, height_min_m, height_max_m)
        print(f'[step4] color={color_src.name} height={height_src.name} '
              f'tile={color_size}px/{height_size}px jobs={jobs}')

    tiles: dict[str, dict] = {}
    encoded_any = False
    total = len(tasks)
    if lodvis:
        for i, (face, lod, tx, ty) in enumerate(tile_specs, 1):
            img = _paint_lod_map_tile(face, lod, tx, ty, faces[face]['label'],
                                      faces[face]['assigned'])
            tid, entry, enc = _write_viz_tile(out, face, lod, tx, ty, img)
            tiles[tid] = entry
            encoded_any = encoded_any or enc
            if i % 1000 == 0:
                print(f'  {i}/{total} tiles')
    elif jobs > 1:
        with concurrent.futures.ProcessPoolExecutor(
                max_workers=jobs, initializer=_bake_pool_init,
                initargs=(color_cache, height_cache)) as ex:
            for i, (tid, entry, enc) in enumerate(
                    ex.map(_bake_pool_task, tasks, chunksize=8), 1):
                tiles[tid] = entry
                encoded_any = encoded_any or enc
                if i % 1000 == 0:
                    print(f'  {i}/{total} tiles')
    else:
        rgb = np.load(color_cache, mmap_mode='r')
        hmap = np.load(height_cache, mmap_mode='r')
        for i, task in enumerate(tasks, 1):
            (face, lod, tx, ty, cs, hs, ocr, ohr, hmin, hmax, ktx) = task
            tid, entry, enc = g.build_tile_assets(
                face, lod, tx, ty, cs, hs, rgb, hmap, ocr, ohr, hmin, hmax, ktx)
            tiles[tid] = entry
            encoded_any = encoded_any or enc
            if i % 1000 == 0:
                print(f'  {i}/{total} tiles')

    manifest = {
        'maxAvailableLod': LOD6,
        'minHeight': float(height_min_m),
        'maxHeight': float(height_max_m),
        'tiles': tiles,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    if can_try_ktx2 and not encoded_any:
        print('[step4] WARNING: no tiles were KTX2-encoded (toktx missing?); '
              'planet2 may reject PNG-only color tiles.')
    _cleanup_state_dir()
    print(f'[step4] wrote {len(tiles)} tiles + manifest to {out}')


def build_uniform_body(color_source: Path, height_source: Path, out_root: str,
                       max_lod: int, color_size: int, height_size: int,
                       height_min_m: float, height_max_m: float, jobs: int,
                       can_try_ktx2: bool, eccentricity_squared: float,
                       attribution: str) -> None:
    """Bake a complete cubed-sphere pyramid for a non-Earth base body."""
    if max_lod < 0 or max_lod > 8:
        raise SystemExit('--max-lod must be between 0 and 8')
    out = ROOT / out_root
    out_color, out_height = out / 'color', out / 'height'
    for directory in (out_color, out_height):
        if directory.exists():
            shutil.rmtree(directory, ignore_errors=True)
        directory.mkdir(parents=True, exist_ok=True)

    color_cache = _ensure_color_cache(color_source)
    height_cache = _ensure_height_cache(height_source, height_min_m, height_max_m)
    tile_specs = []
    per_lod = {}
    for lod in range(max_lod + 1):
        n = 1 << lod
        per_lod[lod] = 6 * n * n
        tile_specs.extend((face, lod, tx, ty) for face in g.FACES
                          for ty in range(n) for tx in range(n))
    tasks = [(face, lod, tx, ty, color_size, height_size, out_color, out_height,
              height_min_m, height_max_m, can_try_ktx2)
             for face, lod, tx, ty in tile_specs]
    print(f'[moon] {len(tasks)} tiles to bake -> {out} (per LOD: {per_lod})')

    tiles, encoded_any = {}, False
    if jobs > 1:
        with concurrent.futures.ProcessPoolExecutor(
                max_workers=jobs, initializer=_body_bake_pool_init,
                initargs=(color_cache, height_cache, eccentricity_squared)) as ex:
            results = ex.map(_bake_pool_task, tasks, chunksize=8)
            for i, (tile_id, entry, encoded) in enumerate(results, 1):
                tiles[tile_id] = entry
                encoded_any = encoded_any or encoded
                if i % 500 == 0:
                    print(f'  {i}/{len(tasks)} tiles')
    else:
        g.set_planet_eccentricity_squared(eccentricity_squared)
        rgb = np.load(color_cache, mmap_mode='r')
        hmap = np.load(height_cache, mmap_mode='r')
        for i, task in enumerate(tasks, 1):
            face, lod, tx, ty, cs, hs, ocr, ohr, hmin, hmax, ktx = task
            tile_id, entry, encoded = g.build_tile_assets(
                face, lod, tx, ty, cs, hs, rgb, hmap, ocr, ohr,
                hmin, hmax, ktx)
            tiles[tile_id] = entry
            encoded_any = encoded_any or encoded
            if i % 500 == 0:
                print(f'  {i}/{len(tasks)} tiles')

    manifest = {
        'maxAvailableLod': max_lod,
        'minHeight': float(height_min_m),
        'maxHeight': float(height_max_m),
        'body': 'Moon',
        'referenceRadiusMeters': 1737400.0,
        'attribution': attribution,
        'tiles': tiles,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    if can_try_ktx2 and not encoded_any:
        print('[moon] WARNING: tiles were not KTX2-encoded (toktx missing?).')
    print(f'[moon] wrote {len(tiles)} tiles + manifest to {out}')

# ---------------------------------------------------------------------------
# Enhancement overlay: a self-contained high-res cone streamed on top of the base
# ---------------------------------------------------------------------------

HAWAII_ROOT = 'assets/hawaii'
CHIMBORAZO_ROOT = 'assets/chimborazo'

# Mount Chimborazo (1.469 S, 78.817 W). The source extends beyond Ecuador's
# Pacific coast so the westbound enhancement corridor reaches open ocean and
# still has a 0.25-degree blending margin.
CHIMBORAZO_PACIFIC_WEST_LON = -81.1
CHIMBORAZO_REGION_BBOX = (-81.35, -77.067, -3.219, 0.281)
CHIMBORAZO_BASE_COLOR = COLOR_SOURCE
CHIMBORAZO_WIDE_BBOX = (CHIMBORAZO_PACIFIC_WEST_LON, -77.317, -2.669, -0.269)
CHIMBORAZO_MID_BBOX = (-79.317, -78.317, -1.969, -0.969)
# The original summit core was 0.36 degrees wide (-78.997 to -78.637).
# Extend it west by one full original-core width while retaining its east edge.
CHIMBORAZO_CORE_BBOX = (-79.357, -78.637, -1.649, -1.289)
# Repeat the graded mid/core cone to the west. Both bands now continue to the
# Pacific rather than applying a percentage offset that can disappear inside
# cube-tile quantization.
CHIMBORAZO_WEST_CONE_OFFSET = 0.72
CHIMBORAZO_WEST_MID_BBOX = (
    CHIMBORAZO_PACIFIC_WEST_LON,
    CHIMBORAZO_MID_BBOX[1] - CHIMBORAZO_WEST_CONE_OFFSET,
    CHIMBORAZO_MID_BBOX[2], CHIMBORAZO_MID_BBOX[3])
CHIMBORAZO_WEST_CORE_BBOX = (
    CHIMBORAZO_PACIFIC_WEST_LON,
    CHIMBORAZO_CORE_BBOX[1] - CHIMBORAZO_WEST_CONE_OFFSET,
    CHIMBORAZO_CORE_BBOX[2], CHIMBORAZO_CORE_BBOX[3])
CHIMBORAZO_MIN_LOD = 5
CHIMBORAZO_MID_LOD = 7
CHIMBORAZO_MAX_LOD = 11

KOROLEV_REGION_BBOX = (-160.5, -156.0, -5.3, -0.8)
KOROLEV_CORE_BBOX = (-159.25, -157.25, -4.1, -2.1)
KOROLEV_MIN_LOD = 5
KOROLEV_MAX_LOD = 6

TRANQUILLITATIS_REGION_BBOX = (20.5, 26.5, -2.3, 3.7)
TRANQUILLITATIS_CORE_BBOX = (22.0, 25.0, -0.8, 2.2)
MOLTKE_CORE_BBOX = (23.90, 24.50, -0.90, -0.30)
TRANQUILLITATIS_MIN_LOD = 5
TRANQUILLITATIS_MAX_LOD = 6
MOLTKE_MAX_LOD = 9


def chimborazo_sizes_for_lod(lod: int, face_size: int,
                             base_height: int) -> tuple[int, int]:
    """Retain more texels and terrain samples in the deep summit tiles."""
    color, height = hawaii.sizes_for_lod(lod, face_size, base_height)
    return max(512, color), max(256, height)


def korolev_sizes_for_lod(lod: int, face_size: int,
                          base_height: int) -> tuple[int, int]:
    return max(256, face_size), max(128, base_height)


def tranquillitatis_sizes_for_lod(lod: int, face_size: int,
                                  base_height: int) -> tuple[int, int]:
    if lod >= 7:
        return max(512, face_size), max(256, base_height)
    return korolev_sizes_for_lod(lod, face_size, base_height)


def build_overlay(color_source: str, height_source: str, color_size: int,
                  height_size: int, height_min_m: float, height_max_m: float,
                  jobs: int, can_try_ktx2: bool,
                  cone: set | None = None,
                  lodvis: bool = False,
                  out_root: str | None = None,
                  faces: dict | None = None,
                  overlay_name: str = 'overlay',
                  lod_palette: dict | None = None,
                  regional_color_source: str | None = None,
                  regional_height_source: str | None = None,
                  regional_bbox: tuple | None = None,
                  regional_crop_bbox: tuple | None = None,
                  regional_height_data_bbox: tuple | None = None,
                  tile_size_for_lod=None, base_tile_root: str | None = None) -> None:
    """Bake a region-bounded enhancement tileset.

    The caller supplies the enhancement tile plan and regional source data. The
    same plan is used in both modes: normal mode samples the regional imagery and
    height data, while lodvis mode substitutes visualization pixels only.
    """
    if not cone or out_root is None:
        raise ValueError('cone and out_root are required')

    # Do not extend the overlay down to LOD0. Doing so requires sibling completion
    # at every ancestor level and eventually paints the entire cube face. The base
    # tileset supplies the coarser traversal nodes when this is used as an overlay;
    # planet2 can also display this sparse tile forest directly for lodvis.
    bridge = []
    cone_sorted = sorted(cone)
    print(f'[{overlay_name}] enhancement tiles to bake: {len(cone_sorted)}')
    print(f'[{overlay_name}] bridge tiles to bake: {len(bridge)}')

    out = ROOT / out_root
    out_color = out / 'color'
    out_height = out / 'height'
    for d in (out_color, out_height):
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
    out_color.mkdir(parents=True, exist_ok=True)
    out_height.mkdir(parents=True, exist_ok=True)

    tiles: dict[str, dict] = {}
    encoded_any = False

    if lodvis:
        if faces is None and lod_palette is None:
            labels = _load_step2()
            faces = _build_adaptive_faces(labels)
        tile_specs = bridge + cone_sorted
        for i, (face, lod, tx, ty) in enumerate(tile_specs, 1):
            face_data = faces[face] if faces is not None else None
            img = _paint_lod_map_tile(
                face, lod, tx, ty,
                face_data['label'] if face_data is not None else None,
                face_data['assigned'] if face_data is not None else None,
                                      lod_palette=lod_palette)
            tid, entry, enc = _write_viz_tile(out, face, lod, tx, ty, img)
            tiles[tid] = entry
            encoded_any = encoded_any or enc
            if i % 1000 == 0:
                print(f'  {i}/{len(tile_specs)} tiles')
    else:
        required_regional_args = (
            regional_color_source, regional_height_source, regional_bbox)
        if any(value is None for value in required_regional_args):
            raise ValueError(
                'regional_color_source, regional_height_source, and regional_bbox '
                'are required when lodvis is false')

        color_src = ROOT / color_source
        height_src = ROOT / height_source
        regional_color_src = ROOT / regional_color_source
        regional_height_src = ROOT / regional_height_source
        for source_path in (
                color_src, height_src, regional_color_src, regional_height_src):
            if not source_path.exists():
                raise SystemExit(f'Source not found: {source_path}')

        if base_tile_root is None:
            color_cache = _ensure_color_cache(color_src)
            height_cache = _ensure_height_cache(height_src, height_min_m, height_max_m)
        else:
            color_cache = height_cache = None
        jobs = max(1, int(jobs))

        def make_tasks(tile_specs):
            tasks = []
            for face, lod, x, y in tile_specs:
                cs, hs = ((color_size, height_size) if tile_size_for_lod is None
                          else tile_size_for_lod(lod, color_size, height_size))
                tasks.append((face, lod, x, y, cs, hs, out_color, out_height,
                              height_min_m, height_max_m, can_try_ktx2))
            return tasks

        def record(results):
            nonlocal encoded_any
            for tid, entry, enc in results:
                tiles[tid] = entry
                encoded_any = encoded_any or enc

        bridge_tasks = make_tasks(bridge)
        cone_tasks = make_tasks(cone_sorted)
        if jobs > 1:
            if bridge_tasks:
                with concurrent.futures.ProcessPoolExecutor(
                        max_workers=jobs, initializer=_bake_pool_init,
                        initargs=(color_cache, height_cache)) as ex:
                    record(ex.map(_bake_pool_task, bridge_tasks, chunksize=8))
            initializer = _overlay_base_pool_init if base_tile_root else _overlay_pool_init
            initargs = ((ROOT / base_tile_root, ROOT / '.cache/adaptive_lod/base_tiles',
                         str(regional_color_src), str(regional_height_src), regional_bbox,
                         regional_crop_bbox, regional_height_data_bbox) if base_tile_root else
                        (color_cache, height_cache, str(regional_color_src),
                         str(regional_height_src), regional_bbox, regional_crop_bbox,
                         regional_height_data_bbox))
            with concurrent.futures.ProcessPoolExecutor(
                    max_workers=jobs, initializer=initializer, initargs=initargs) as ex:
                record(ex.map(_bake_pool_task, cone_tasks, chunksize=8))
        else:
            rgb = np.load(color_cache, mmap_mode='r') if color_cache else None
            hmap = np.load(height_cache, mmap_mode='r') if height_cache else None
            for task in bridge_tasks:
                (face, lod, tx, ty, cs, hs, ocr, ohr, hmin, hmax, ktx) = task
                record([g.build_tile_assets(
                    face, lod, tx, ty, cs, hs, rgb, hmap,
                    ocr, ohr, hmin, hmax, ktx)])
            if base_tile_root:
                g.set_base_tile_source(ROOT / base_tile_root,
                                       ROOT / '.cache/adaptive_lod/base_tiles')
            g.set_regional_source(
                regional_color_src, regional_height_src, regional_bbox,
                regional_crop_bbox, regional_height_data_bbox)
            for task in cone_tasks:
                (face, lod, tx, ty, cs, hs, ocr, ohr, hmin, hmax, ktx) = task
                record([g.build_tile_assets(
                    face, lod, tx, ty, cs, hs, rgb, hmap,
                    ocr, ohr, hmin, hmax, ktx)])

    if not tiles:
        raise RuntimeError(f'No tiles were generated for overlay "{overlay_name}"')

    manifest = {
        'maxAvailableLod': max(t[1] for t in cone),
        'minHeight': float(height_min_m),
        'maxHeight': float(height_max_m),
        'tiles': tiles,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    if can_try_ktx2 and not encoded_any:
        print(f'[{overlay_name}] WARNING: tiles were not KTX2-encoded '
              '(toktx missing?).')
    print(f'[{overlay_name}] wrote {len(tiles)} tiles + manifest to {out} '
          f'(maxAvailableLod={manifest["maxAvailableLod"]})')


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset', nargs='?', default='earth',
                        help='Asset root to build (earth, moon, moon_korolev, moon_tranquillitatis, hawaii, or chimborazo).')
    parser.add_argument('--color-source', type=str, default='textures/bluemarble_86400x43200.png')
    parser.add_argument('--height-source', type=str, default=HEIGHT_SOURCE)
    parser.add_argument('--color-size', type=int, default=256,
                        help='Color tile edge in px.')
    parser.add_argument('--height-size', type=int, default=64,
                        help='Height tile edge in px.')
    parser.add_argument('--height-min-m', type=float, default=HEIGHT_MIN_M)
    parser.add_argument('--height-max-m', type=float, default=HEIGHT_MAX_M)
    parser.add_argument('--jobs', type=int, default=1,
                        help='Worker processes (mmap-shared sources). 1 = serial (lowest RAM).')
    parser.add_argument('--no-ktx2', action='store_true', default=False,
                        help='Skip KTX2 encoding (leaves PNG color tiles).')
    parser.add_argument('--lodvis', action='store_true', default=False,
                        help='Bake visualization tiles instead of imagery tiles.')
    parser.add_argument('--max-lod', type=int, default=4,
                        help='Deepest level for a uniform base layer (Moon default: 4).')
    args = parser.parse_args()

    if not args.no_ktx2 and not _toktx_available():
        _print_toktx_install_instructions()

    if args.asset == 'earth':
        g.set_planet_eccentricity_squared(g.WGS84_E2)
        step1(75.0, 0.5, 32)
        step2(2)
        faces = step3()
        step4_bake(args.color_source, args.height_source, None,
                   args.color_size, args.height_size, args.height_min_m,
                   args.height_max_m, args.jobs, not args.no_ktx2,
                   lodvis=args.lodvis, faces=faces)
    elif args.asset == 'moon':
        if args.lodvis:
            raise SystemExit('--lodvis is not yet supported by the uniform Moon builder')
        moon_color, moon_height = prepare_moon_sources(ROOT)
        build_uniform_body(
            moon_color, moon_height, 'assets/moon', args.max_lod,
            args.color_size, args.height_size, -10000.0, 11000.0,
            args.jobs, not args.no_ktx2, 0.0,
            'NASA Scientific Visualization Studio; LRO LROC/LOLA')
    elif args.asset == 'moon_korolev':
        cone = hawaii.collect_island_tiles(
            KOROLEV_REGION_BBOX, KOROLEV_MIN_LOD, KOROLEV_MIN_LOD, 0.02)
        cone |= hawaii.collect_island_tiles(
            KOROLEV_CORE_BBOX, KOROLEV_MIN_LOD, KOROLEV_MAX_LOD, 0.01)
        cone = hawaii.close_quadtree(cone, KOROLEV_MIN_LOD - 1)
        cone = {tile for tile in cone if tile[1] >= KOROLEV_MIN_LOD}

        regional_color = regional_height = None
        regional_bbox = KOROLEV_REGION_BBOX
        if not args.lodvis:
            regional_color, regional_height, regional_bbox = prepare_korolev_sources(
                ROOT, KOROLEV_REGION_BBOX)
        g.set_planet_eccentricity_squared(0.0)
        if args.jobs > 1:
            print('[moon-korolev] forcing --jobs 1 so spawned workers retain lunar projection')
        low_color, low_height = prepare_moon_sources(ROOT) if not args.lodvis else (None, None)
        build_overlay(
            (str(low_color.relative_to(ROOT)) if low_color else args.color_source),
            (str(low_height.relative_to(ROOT)) if low_height else args.height_source),
            args.color_size, args.height_size, -10000.0, 11000.0,
            1, not args.no_ktx2, cone=cone, lodvis=args.lodvis,
            out_root=('assets/moon_korolev_lodvis' if args.lodvis
                      else 'assets/moon_korolev'),
            overlay_name='moon-korolev',
            lod_palette=ENHANCEMENT_LOD_PALETTE if args.lodvis else None,
            regional_color_source=(str(regional_color.relative_to(ROOT))
                                   if regional_color else None),
            regional_height_source=(str(regional_height.relative_to(ROOT))
                                    if regional_height else None),
            regional_bbox=regional_bbox,
            tile_size_for_lod=korolev_sizes_for_lod,
            base_tile_root='assets/moon',
        )
    elif args.asset == 'moon_tranquillitatis':
        cone = hawaii.collect_island_tiles(
            TRANQUILLITATIS_REGION_BBOX, TRANQUILLITATIS_MIN_LOD,
            TRANQUILLITATIS_MIN_LOD, 0.02)
        cone |= hawaii.collect_island_tiles(
            TRANQUILLITATIS_CORE_BBOX, TRANQUILLITATIS_MIN_LOD,
            TRANQUILLITATIS_MAX_LOD, 0.01)
        cone |= hawaii.collect_island_tiles(
            MOLTKE_CORE_BBOX, TRANQUILLITATIS_MIN_LOD,
            MOLTKE_MAX_LOD, 0.0025)
        cone = hawaii.close_quadtree(cone, TRANQUILLITATIS_MIN_LOD - 1)
        cone = {tile for tile in cone if tile[1] >= TRANQUILLITATIS_MIN_LOD}

        regional_color = regional_height = None
        regional_bbox = TRANQUILLITATIS_REGION_BBOX
        if not args.lodvis:
            regional_color, regional_height, regional_bbox = prepare_region_sources(
                ROOT, TRANQUILLITATIS_REGION_BBOX, 'tranquillitatis')
        g.set_planet_eccentricity_squared(0.0)
        if args.jobs > 1:
            print('[moon-tranquillitatis] forcing --jobs 1 so spawned workers retain lunar projection')
        low_color, low_height = prepare_moon_sources(ROOT) if not args.lodvis else (None, None)
        build_overlay(
            (str(low_color.relative_to(ROOT)) if low_color else args.color_source),
            (str(low_height.relative_to(ROOT)) if low_height else args.height_source),
            args.color_size, args.height_size, -10000.0, 11000.0,
            1, not args.no_ktx2, cone=cone, lodvis=args.lodvis,
            out_root=('assets/moon_tranquillitatis_lodvis' if args.lodvis
                      else 'assets/moon_tranquillitatis'),
            overlay_name='moon-tranquillitatis',
            lod_palette=ENHANCEMENT_LOD_PALETTE if args.lodvis else None,
            regional_color_source=(str(regional_color.relative_to(ROOT))
                                   if regional_color else None),
            regional_height_source=(str(regional_height.relative_to(ROOT))
                                    if regional_height else None),
            regional_bbox=regional_bbox,
            tile_size_for_lod=tranquillitatis_sizes_for_lod,
            base_tile_root='assets/moon',
        )
    elif args.asset == 'hawaii':
        overlay_min_lod = hawaii.WIDE_LOD
        cone, _ = hawaii.collect_graded_tiles(
            hawaii.CHAIN_BBOX, overlay_min_lod, 0.01,
            ROOT / args.height_source)
        # Sample the wide boundary finely enough to retain narrow cube-projection
        # intersections such as the -X/5/24/26 edge tile.
        wide_step = 0.05
        cone |= hawaii.collect_island_tiles(
            hawaii.WIDE_BBOX, overlay_min_lod, hawaii.WIDE_LOD, wide_step)
        # Earth is complete through LOD3. Add only the LOD4 structural bridge
        # needed for normal parent/child replacement, then rely on Earth's LOD3
        # parents rather than extending the overlay across the cube face.
        cone = hawaii.close_quadtree(cone, BASE_FULL_COVERAGE_LOD)
        cone = {tile for tile in cone if tile[1] > BASE_FULL_COVERAGE_LOD}

        overlay_bbox = (
            min(hawaii.CHAIN_BBOX[0], hawaii.WIDE_BBOX[0]),
            max(hawaii.CHAIN_BBOX[1], hawaii.WIDE_BBOX[1]),
            min(hawaii.CHAIN_BBOX[2], hawaii.WIDE_BBOX[2]),
            max(hawaii.CHAIN_BBOX[3], hawaii.WIDE_BBOX[3]),
        )
        crop_bbox = (
            overlay_bbox[0] - 0.25, overlay_bbox[1] + 0.25,
            overlay_bbox[2] - 0.25, overlay_bbox[3] + 0.25,
        )

        build_overlay(
            args.color_source, args.height_source,
            args.color_size, args.height_size, args.height_min_m,
            args.height_max_m, args.jobs, not args.no_ktx2,
            cone=cone,
            lodvis=args.lodvis,
            out_root='assets/hawaii_lodvis' if args.lodvis else HAWAII_ROOT,
            overlay_name='hawaii',
            lod_palette=ENHANCEMENT_LOD_PALETTE if args.lodvis else None,
            regional_color_source=hawaii.REGION_COLOR,
            regional_height_source=hawaii.REGION_HEIGHT,
            regional_bbox=hawaii.REGION_BBOX,
            regional_crop_bbox=crop_bbox,
            regional_height_data_bbox=hawaii.BIG_ISLAND_HEIGHT_BBOX,
            tile_size_for_lod=hawaii.sizes_for_lod,
        )
    elif args.asset == 'chimborazo':
        cone = hawaii.collect_island_tiles(
            CHIMBORAZO_WIDE_BBOX, CHIMBORAZO_MIN_LOD,
            CHIMBORAZO_MIN_LOD, 0.05)
        cone |= hawaii.collect_island_tiles(
            CHIMBORAZO_MID_BBOX, CHIMBORAZO_MIN_LOD,
            CHIMBORAZO_MID_LOD, 0.01)
        cone |= hawaii.collect_island_tiles(
            CHIMBORAZO_CORE_BBOX, CHIMBORAZO_MIN_LOD,
            CHIMBORAZO_MAX_LOD, 0.005)
        cone |= hawaii.collect_island_tiles(
            CHIMBORAZO_WEST_MID_BBOX, CHIMBORAZO_MIN_LOD,
            CHIMBORAZO_MID_LOD, 0.01)
        cone |= hawaii.collect_island_tiles(
            CHIMBORAZO_WEST_CORE_BBOX, CHIMBORAZO_MIN_LOD,
            CHIMBORAZO_MAX_LOD, 0.005)
        cone = hawaii.close_quadtree(cone, CHIMBORAZO_MIN_LOD)

        crop_bbox = (
            CHIMBORAZO_WIDE_BBOX[0] - 0.25,
            CHIMBORAZO_WIDE_BBOX[1] + 0.25,
            CHIMBORAZO_WIDE_BBOX[2] - 0.25,
            CHIMBORAZO_WIDE_BBOX[3] + 0.25,
        )
        regional_color = regional_height = None
        if not args.lodvis:
            regional_color, regional_height = prepare_chimborazo_sources(
                ROOT, CHIMBORAZO_REGION_BBOX)
        build_overlay(
            CHIMBORAZO_BASE_COLOR, args.height_source,
            args.color_size, args.height_size, args.height_min_m,
            args.height_max_m, args.jobs, not args.no_ktx2,
            cone=cone,
            lodvis=args.lodvis,
            out_root=('assets/chimborazo_lodvis'
                      if args.lodvis else CHIMBORAZO_ROOT),
            overlay_name='chimborazo',
            lod_palette=ENHANCEMENT_LOD_PALETTE if args.lodvis else None,
            regional_color_source=(str(regional_color.relative_to(ROOT))
                                   if regional_color else None),
            regional_height_source=(str(regional_height.relative_to(ROOT))
                                    if regional_height else None),
            regional_bbox=CHIMBORAZO_REGION_BBOX,
            regional_crop_bbox=crop_bbox,
            tile_size_for_lod=chimborazo_sizes_for_lod,
            base_tile_root='assets/earth',
        )
    else:
        raise SystemExit(
            f"Unsupported asset '{args.asset}'. Supported assets are: "
            "earth, moon, moon_korolev, moon_tranquillitatis, hawaii, chimborazo. "
            "Add a new branch in tools/adaptive_lod.py if you want to build another asset."
        )


if __name__ == '__main__':
    main()
