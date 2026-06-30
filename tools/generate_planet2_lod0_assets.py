from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
# WGS84 first-eccentricity squared; converts geocentric<->geodetic latitude so the
# equirect terrain maps (geodetic) align with the cubed-sphere geometry.
WGS84_E2 = 2.0 / 298.257223563 - 1.0 / (298.257223563 * 298.257223563)


def cube_to_direction(face: str, u: float, v: float) -> tuple[float, float, float]:
    if face == '+X':
        vec = np.array([1.0, v, -u], dtype=np.float64)
    elif face == '-X':
        vec = np.array([-1.0, v, u], dtype=np.float64)
    elif face == '+Y':
        vec = np.array([u, 1.0, -v], dtype=np.float64)
    elif face == '-Y':
        vec = np.array([u, -1.0, v], dtype=np.float64)
    elif face == '+Z':
        vec = np.array([u, v, 1.0], dtype=np.float64)
    elif face == '-Z':
        vec = np.array([-u, v, -1.0], dtype=np.float64)
    else:
        raise ValueError(f'Unknown face: {face}')

    n = np.linalg.norm(vec)
    if n <= 0.0:
        return (0.0, 1.0, 0.0)
    vec /= n
    return (float(vec[0]), float(vec[1]), float(vec[2]))


def bilinear_sample_rgb(image: np.ndarray, x: float, y: float) -> np.ndarray:
    h, w, _ = image.shape

    x = np.clip(x, 0.0, w - 1.0)
    y = np.clip(y, 0.0, h - 1.0)

    x0 = int(np.floor(x))
    y0 = int(np.floor(y))
    x1 = min(w - 1, x0 + 1)
    y1 = min(h - 1, y0 + 1)

    tx = x - x0
    ty = y - y0

    c00 = image[y0, x0].astype(np.float64)
    c10 = image[y0, x1].astype(np.float64)
    c01 = image[y1, x0].astype(np.float64)
    c11 = image[y1, x1].astype(np.float64)

    cx0 = c00 * (1.0 - tx) + c10 * tx
    cx1 = c01 * (1.0 - tx) + c11 * tx
    return (cx0 * (1.0 - ty) + cx1 * ty).astype(np.float64)


def bilinear_sample_u16(image: np.ndarray, x: float, y: float) -> float:
    h, w = image.shape

    x = np.clip(x, 0.0, w - 1.0)
    y = np.clip(y, 0.0, h - 1.0)

    x0 = int(np.floor(x))
    y0 = int(np.floor(y))
    x1 = min(w - 1, x0 + 1)
    y1 = min(h - 1, y0 + 1)

    tx = x - x0
    ty = y - y0

    h00 = float(image[y0, x0])
    h10 = float(image[y0, x1])
    h01 = float(image[y1, x0])
    h11 = float(image[y1, x1])

    hx0 = h00 * (1.0 - tx) + h10 * tx
    hx1 = h01 * (1.0 - tx) + h11 * tx
    return hx0 * (1.0 - ty) + hx1 * ty


def direction_to_equirect_xy(dx: float, dy: float, dz: float, width: int, height: int) -> tuple[float, float]:
    # Negative dz keeps the rendered Earth right-handed (East x North = Up); a
    # +dz convention mirrors geography across every cube face.
    lon = math.atan2(-dz, dx)
    # Source maps are indexed by GEODETIC latitude; convert from geocentric.
    lat = math.atan2(dy, (1.0 - WGS84_E2) * math.hypot(dx, dz))

    x = (lon + math.pi) / (2.0 * math.pi) * (width - 1)
    y = (math.pi * 0.5 - lat) / math.pi * (height - 1)
    return (x, y)


def cube_to_direction_grid(face: str, u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Vectorized form of cube_to_direction: u, v are 2D arrays of cube coords."""
    ones = np.ones_like(u)
    if face == '+X':
        x, y, z = ones, v, -u
    elif face == '-X':
        x, y, z = -ones, v, u
    elif face == '+Y':
        x, y, z = u, ones, -v
    elif face == '-Y':
        x, y, z = u, -ones, v
    elif face == '+Z':
        x, y, z = u, v, ones
    elif face == '-Z':
        x, y, z = -u, v, -ones
    else:
        raise ValueError(f'Unknown face: {face}')

    n = np.sqrt(x * x + y * y + z * z)
    n = np.where(n > 0.0, n, 1.0)
    return x / n, y / n, z / n


def direction_to_equirect_xy_grid(dx: np.ndarray, dy: np.ndarray, dz: np.ndarray, width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Vectorized form of direction_to_equirect_xy."""
    # Negative dz keeps the rendered Earth right-handed (East x North = Up); a
    # +dz convention mirrors geography across every cube face.
    lon = np.arctan2(-dz, dx)
    # Source maps are indexed by GEODETIC latitude; convert from geocentric.
    lat = np.arctan2(dy, (1.0 - WGS84_E2) * np.sqrt(dx * dx + dz * dz))
    x = (lon + math.pi) / (2.0 * math.pi) * (width - 1)
    y = (math.pi * 0.5 - lat) / math.pi * (height - 1)
    return x, y


def bilinear_sample_grid(image: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Vectorized bilinear sample. image is (H, W) or (H, W, C); xs/ys share a 2D shape.

    Returns a float64 array of shape xs.shape (+ (C,) when image has channels).
    """
    h = image.shape[0]
    w = image.shape[1]

    xs = np.clip(xs, 0.0, w - 1.0)
    ys = np.clip(ys, 0.0, h - 1.0)

    x0 = np.floor(xs).astype(np.intp)
    y0 = np.floor(ys).astype(np.intp)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)

    tx = xs - x0
    ty = ys - y0

    img = image.astype(np.float64)
    if img.ndim == 3:
        tx = tx[..., None]
        ty = ty[..., None]

    c00 = img[y0, x0]
    c10 = img[y0, x1]
    c01 = img[y1, x0]
    c11 = img[y1, x1]

    cx0 = c00 * (1.0 - tx) + c10 * tx
    cx1 = c01 * (1.0 - tx) + c11 * tx
    return cx0 * (1.0 - ty) + cx1 * ty


def _tile_uv_grids(lod: int, tile_x: int, tile_y: int, face_size: int, align: str = 'center') -> tuple[np.ndarray, np.ndarray]:
    """Build the (u, v) cube-coordinate grids for a tile.

    align='center' samples pixel centers (good for color). align='edge' samples
    edge-inclusive [0..1] so adjacent tiles share identical boundary columns/rows,
    which the renderer's edge-inclusive height lookup requires to avoid seam cracks.
    """
    tile_count = 1 << lod
    if align == 'edge':
        s = np.arange(face_size, dtype=np.float64) / (face_size - 1)
    else:
        s = (np.arange(face_size, dtype=np.float64) + 0.5) / face_size
    u_axis = -1.0 + 2.0 * ((tile_x + s) / tile_count)
    v_axis = -1.0 + 2.0 * ((tile_y + s) / tile_count)
    u, v = np.meshgrid(u_axis, v_axis)  # u[py, px]=u_axis[px], v[py, px]=v_axis[py]
    return u, v


# Optional regional high-res equirect override (loaded by set_regional_source).
# Color is uint8 HxWx3; height is float meters HxW; bbox is (lon_min,lon_max,lat_min,lat_max) deg.
_REGIONAL_RGB: np.ndarray | None = None
_REGIONAL_HM: np.ndarray | None = None
_REGIONAL_BBOX: tuple[float, float, float, float] | None = None


def _regional_pixel_coords(dx, dy, dz, width, height):
    """For a direction grid, return (mask_in_bbox, sample_x, sample_y) for the regional tile."""
    lon = np.degrees(np.arctan2(-dz, dx))  # matches direction_to_equirect_xy_grid convention
    # Geodetic latitude, matching direction_to_equirect_xy_grid so the regional crop aligns.
    lat = np.degrees(np.arctan2(dy, (1.0 - WGS84_E2) * np.sqrt(dx * dx + dz * dz)))
    lon_min, lon_max, lat_min, lat_max = _REGIONAL_BBOX
    mask = (lon >= lon_min) & (lon <= lon_max) & (lat >= lat_min) & (lat <= lat_max)
    rx = (lon - lon_min) / (lon_max - lon_min) * (width - 1)
    ry = (lat_max - lat) / (lat_max - lat_min) * (height - 1)
    return mask, rx, ry


def set_regional_source(color_path: Path | None, height_path: Path, bbox: tuple[float, float, float, float]) -> None:
    global _REGIONAL_RGB, _REGIONAL_HM, _REGIONAL_BBOX
    _REGIONAL_BBOX = bbox
    if color_path is not None:
        _REGIONAL_RGB = np.asarray(Image.open(color_path).convert('RGB'), dtype=np.uint8)
    h_img = Image.open(height_path)
    code = np.asarray(h_img, dtype=np.float32)
    # XHR displacement encoding: code ~= 9000 + 10 * elevation_m.
    _REGIONAL_HM = (code - 9000.0) / 10.0


def generate_tile_color(face: str, src_rgb: np.ndarray, lod: int, tile_x: int, tile_y: int, face_size: int) -> np.ndarray:
    u, v = _tile_uv_grids(lod, tile_x, tile_y, face_size)
    dx, dy, dz = cube_to_direction_grid(face, u, v)
    sx, sy = direction_to_equirect_xy_grid(dx, dy, dz, src_rgb.shape[1], src_rgb.shape[0])
    sampled = bilinear_sample_grid(src_rgb, sx, sy)
    if _REGIONAL_RGB is not None:
        mask, rx, ry = _regional_pixel_coords(dx, dy, dz, _REGIONAL_RGB.shape[1], _REGIONAL_RGB.shape[0])
        if mask.any():
            rs = bilinear_sample_grid(_REGIONAL_RGB, rx, ry)
            sampled[mask] = rs[mask]
    return np.clip(np.round(sampled), 0, 255).astype(np.uint8)


def generate_tile_height(face: str, src_hmap: np.ndarray, lod: int, tile_x: int, tile_y: int, face_size: int, height_min_m: float = -200.0, height_max_m: float = 8500.0) -> np.ndarray:
    u, v = _tile_uv_grids(lod, tile_x, tile_y, face_size, align='edge')
    dx, dy, dz = cube_to_direction_grid(face, u, v)
    sx, sy = direction_to_equirect_xy_grid(dx, dy, dz, src_hmap.shape[1], src_hmap.shape[0])
    sampled = bilinear_sample_grid(src_hmap, sx, sy)
    if _REGIONAL_HM is not None:
        mask, rx, ry = _regional_pixel_coords(dx, dy, dz, _REGIONAL_HM.shape[1], _REGIONAL_HM.shape[0])
        if mask.any():
            meters = bilinear_sample_grid(_REGIONAL_HM, rx, ry)
            encoded = (meters - height_min_m) / (height_max_m - height_min_m) * 65535.0
            sampled[mask] = encoded[mask]
    return np.clip(np.round(sampled), 0, 65535).astype(np.uint16)


def generate_face_color(face: str, src_rgb: np.ndarray, face_size: int) -> np.ndarray:
    return generate_tile_color(face, src_rgb, 0, 0, 0, face_size)


def generate_face_height(face: str, src_hmap: np.ndarray, face_size: int) -> np.ndarray:
    return generate_tile_height(face, src_hmap, 0, 0, face_size)


def lat_lon_to_tile_path(lat_deg: float, lon_deg: float, max_lod: int) -> list[tuple[str, int, int, int]]:
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    # Geodetic -> geocentric so the direction matches the cubed-sphere geometry.
    geoc = math.atan2((1.0 - WGS84_E2) * math.sin(lat), math.cos(lat))
    # Build the direction with the SAME convention used when baking content
    # (direction_to_equirect_xy uses lon = atan2(-dz, dx)), i.e. dx = cos*cos(lon),
    # dz = -cos*sin(lon). The negative z keeps geography right-handed and ensures
    # refined tiles land on the cube tile the imagery is actually drawn into.
    x = math.cos(geoc) * math.cos(lon)
    y = math.sin(geoc)
    z = -math.cos(geoc) * math.sin(lon)

    absx, absy, absz = abs(x), abs(y), abs(z)
    if absx >= absy and absx >= absz:
        face = '+X' if x > 0 else '-X'
        ma = absx
        u = (-z / ma) if x > 0 else (z / ma)
        v = y / ma
    elif absy >= absx and absy >= absz:
        face = '+Y' if y > 0 else '-Y'
        ma = absy
        u = x / ma
        v = (-z / ma) if y > 0 else (z / ma)
    else:
        face = '+Z' if z > 0 else '-Z'
        ma = absz
        u = (x / ma) if z > 0 else (-x / ma)
        v = y / ma

    path = []
    for lod in range(1, max_lod + 1):
        tile_count = 1 << lod
        # Geometry tile coords. The renderer addresses assets identically to geometry
        # tiles (no flip), so we place refined tiles at the geometry coords the
        # renderer will request for this lat/lon.
        geom_x = min(tile_count - 1, max(0, int(((u + 1.0) * 0.5) * tile_count)))
        geom_y = min(tile_count - 1, max(0, int(((v + 1.0) * 0.5) * tile_count)))
        path.append((face, lod, geom_x, geom_y))
    return path


def load_sources(color_src_path: Path, height_src_path: Path, use_flat_height: bool) -> tuple[np.ndarray, np.ndarray]:
    color_img = Image.open(color_src_path).convert('RGB')
    color_np = np.asarray(color_img, dtype=np.uint8)

    if use_flat_height:
        hmap_np = np.zeros((512, 1024), dtype=np.uint16)
    else:
        h_img = Image.open(height_src_path)
        if h_img.mode in ('I;16', 'I'):
            hmap_np = np.asarray(h_img, dtype=np.uint16)
        else:
            # Many existing source files are 8-bit preview images even though their
            # filenames mention 16-bit. Expand them to the full 0..65535 range so the
            # renderer gets usable terrain displacement instead of effectively flat data.
            hmap_u8 = np.asarray(h_img.convert('L'), dtype=np.uint8)
            hmap_np = (hmap_u8.astype(np.uint16) * 257)
    return color_np, hmap_np


def build_tile_assets(face: str, lod: int, tile_x: int, tile_y: int, color_size: int, height_size: int, src_rgb: np.ndarray, src_hmap: np.ndarray, out_color_root: Path, out_height_root: Path, height_min_m: float, height_max_m: float, can_try_ktx2: bool) -> tuple[str, dict, bool]:
    """Generate + write one tile's color/height files and return its manifest entry.

    Does not mutate any shared state, so it is safe to run in a worker process.
    """
    color_tile = generate_tile_color(face, src_rgb, lod, tile_x, tile_y, color_size)
    height_tile = generate_tile_height(face, src_hmap, lod, tile_x, tile_y, height_size, height_min_m, height_max_m)

    color_dir = out_color_root / face / str(lod) / str(tile_x)
    height_dir = out_height_root / face / str(lod) / str(tile_x)
    color_dir.mkdir(parents=True, exist_ok=True)
    height_dir.mkdir(parents=True, exist_ok=True)

    png_path = color_dir / f'{tile_y}.png'
    Image.fromarray(color_tile, mode='RGB').save(png_path, quality=95)

    encoded_ktx2 = False
    color_file = png_path
    if can_try_ktx2:
        ktx2_path = color_dir / f'{tile_y}.ktx2'
        if try_encode_ktx2(png_path, ktx2_path):
            encoded_ktx2 = True
            png_path.unlink(missing_ok=True)
            color_file = ktx2_path

    bin_path = height_dir / f'{tile_y}.bin'
    height_tile.astype('<u2').tofile(bin_path)
    roughness = float(np.std(height_tile.astype(np.float32) / 65535.0))

    tile_id = f'{face}/{lod}/{tile_x}/{tile_y}'
    entry = {
        'roughness': roughness,
        'landFraction': 0.3,
        'width': int(height_size),
        'height': int(height_size),
    }
    return tile_id, entry, encoded_ktx2


# Per-worker source images, populated by _pool_init in each pool process so the
# large source arrays are loaded once per process rather than pickled per task.
_WORKER_SRC_RGB: np.ndarray | None = None
_WORKER_SRC_HMAP: np.ndarray | None = None


def _pool_init(color_src_path: Path, height_src_path: Path, use_flat_height: bool) -> None:
    global _WORKER_SRC_RGB, _WORKER_SRC_HMAP
    _WORKER_SRC_RGB, _WORKER_SRC_HMAP = load_sources(color_src_path, height_src_path, use_flat_height)


def _pool_run_task(task: tuple) -> tuple[str, dict, bool]:
    (face, lod, tile_x, tile_y, color_size, height_size,
     out_color_root, out_height_root, height_min_m, height_max_m, can_try_ktx2) = task
    return build_tile_assets(face, lod, tile_x, tile_y, color_size, height_size,
                             _WORKER_SRC_RGB, _WORKER_SRC_HMAP, out_color_root, out_height_root,
                             height_min_m, height_max_m, can_try_ktx2)


def run_tile_tasks(tasks: list, jobs: int, color_src_path: Path, height_src_path: Path,
                   use_flat_height: bool, src_rgb: np.ndarray, src_hmap: np.ndarray) -> list:
    """Generate a batch of tiles, in parallel across processes when worthwhile."""
    if not tasks:
        return []
    if jobs > 1 and len(tasks) > 1:
        with concurrent.futures.ProcessPoolExecutor(
            max_workers=jobs,
            initializer=_pool_init,
            initargs=(color_src_path, height_src_path, use_flat_height),
        ) as executor:
            return list(executor.map(_pool_run_task, tasks))
    return [
        build_tile_assets(face, lod, tile_x, tile_y, color_size, height_size,
                          src_rgb, src_hmap, out_color_root, out_height_root,
                          height_min_m, height_max_m, can_try_ktx2)
        for (face, lod, tile_x, tile_y, color_size, height_size,
             out_color_root, out_height_root, height_min_m, height_max_m, can_try_ktx2) in tasks
    ]


def try_encode_ktx2(src_png: Path, dst_ktx2: Path) -> bool:
    toktx = shutil.which('toktx')
    if not toktx:
        ktx_tools_bin = os.environ.get('KTX_TOOLS_BIN')
        if ktx_tools_bin:
            candidate = Path(ktx_tools_bin) / ('toktx.exe' if os.name == 'nt' else 'toktx')
            if candidate.exists():
                toktx = str(candidate)

    if not toktx and os.name == 'nt':
        common_windows_paths = [
            Path('C:/Program Files/KTX-Software/bin/toktx.exe'),
            Path('C:/Program Files (x86)/KTX-Software/bin/toktx.exe'),
        ]
        for candidate in common_windows_paths:
            if candidate.exists():
                toktx = str(candidate)
                break

    if not toktx:
        return False

    cmd = [
        toktx,
        '--t2',
        '--encode',
        'uastc',
        '--assign_oetf',
        'srgb',
        '--assign_primaries',
        'bt709',
        '--genmipmap',
        str(dst_ktx2),
        str(src_png),
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except Exception as ex:
        print(f'[lod0] KTX2 encode failed for {src_png.name}: {ex}')
        return False

    return True


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate LOD0 cubed-sphere assets for planet2 renderer.')
    parser.add_argument('--color-source', type=str, default='textures/bluemarble_4096.jpg')
    parser.add_argument('--height-source', type=str, default='textures/EARTH_DISPLACE_42K_16BITS_preview.jpg')
    parser.add_argument('--face-size', type=int, default=512)
    parser.add_argument('--height-size', type=int, default=128)
    parser.add_argument('--flat-height', action='store_true', default=False)
    parser.add_argument('--height-min-m', type=float, default=-200.0)
    parser.add_argument('--height-max-m', type=float, default=8500.0)
    parser.add_argument('--out-root', type=str, default='assets/earth')
    parser.add_argument('--prefer-ktx2', action='store_true', default=True)
    parser.add_argument('--no-ktx2', action='store_true', default=False)
    parser.add_argument('--lod1-face', type=str, default=None)
    parser.add_argument('--lod1-color-size', type=int, default=None)
    parser.add_argument('--lod1-height-size', type=int, default=None)
    parser.add_argument('--lod1-only', action='store_true', default=False)
    parser.add_argument('--refine-lat', type=float, default=None)
    parser.add_argument('--refine-lon', type=float, default=None)
    parser.add_argument('--refine-face-override', type=str, default=None)
    parser.add_argument('--refine-min-lod', type=int, default=1)
    parser.add_argument('--refine-max-lod', type=int, default=None)
    parser.add_argument('--refine-color-size', type=int, default=None)
    parser.add_argument('--refine-height-size', type=int, default=None)
    parser.add_argument('--regional-color', type=str, default=None,
                        help='High-res equirect color tile to overlay where it covers (e.g. Hawaii XHR).')
    parser.add_argument('--regional-height', type=str, default=None,
                        help='High-res equirect 16-bit displacement tile (code=9000+10*m) to overlay.')
    parser.add_argument('--regional-bbox', type=float, nargs=4, default=None,
                        metavar=('LON_MIN', 'LON_MAX', 'LAT_MIN', 'LAT_MAX'),
                        help='Geographic bounds of the regional tiles in degrees.')
    parser.add_argument('--jobs', type=int, default=max(1, min((os.cpu_count() or 1), 8)),
                        help='Number of worker processes for tile generation (1 = serial).')
    parser.add_argument('--reset-manifest', action='store_true', default=False,
                        help='Start a fresh manifest instead of merging into the existing one.')
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    color_src_path = root / args.color_source
    height_src_path = root / args.height_source

    out_root = root / args.out_root
    out_color_root = out_root / 'color'
    out_height_root = out_root / 'height'

    out_color_root.mkdir(parents=True, exist_ok=True)
    out_height_root.mkdir(parents=True, exist_ok=True)

    if not color_src_path.exists():
        raise FileNotFoundError(f'Color source not found: {color_src_path}')

    use_flat_height = args.flat_height or (not height_src_path.exists())
    color_np, hmap_np = load_sources(color_src_path, height_src_path, use_flat_height)

    manifest_path = out_root / 'manifest.json'
    # Refinement runs are additive: merge into the existing manifest so previously
    # baked tiles/cones survive. A fresh full bake can clear with --reset-manifest.
    incremental = args.lod1_only or (args.refine_lat is not None and not args.reset_manifest)
    if incremental and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    else:
        manifest = {
            'maxAvailableLod': 0,
            'tiles': {},
        }

    # Height decode range is uniform across every tile, so it lives once at the top
    # of the manifest rather than being repeated in each tile entry.
    manifest['minHeight'] = float(args.height_min_m)
    manifest['maxHeight'] = float(args.height_max_m)

    can_try_ktx2 = args.prefer_ktx2 and not args.no_ktx2
    encoded_any_ktx2 = False
    jobs = max(1, int(args.jobs))

    if args.regional_height and args.regional_bbox:
        set_regional_source(
            (root / args.regional_color) if args.regional_color else None,
            root / args.regional_height,
            tuple(args.regional_bbox),
        )
        jobs = 1  # regional overlay state is process-local; run serial for simplicity
        print(f'Regional override active: bbox={args.regional_bbox} height={args.regional_height}')

    if not args.lod1_only:
        root_tasks = [
            (face, 0, 0, 0, args.face_size, args.height_size, out_color_root, out_height_root,
             float(args.height_min_m), float(args.height_max_m), can_try_ktx2)
            for face in FACES
        ]
        for tile_id, entry, encoded in run_tile_tasks(root_tasks, jobs, color_src_path, height_src_path, use_flat_height, color_np, hmap_np):
            manifest['tiles'][tile_id] = entry
            encoded_any_ktx2 = encoded_any_ktx2 or encoded

        manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')

        print(f'Wrote manifest: {manifest_path}')
        print(f'Wrote color tiles under: {out_color_root}')
        print(f'Wrote height tiles under: {out_height_root}')

    if args.lod1_face:
        lod1_face = args.lod1_face.strip()
        if lod1_face not in FACES:
            raise ValueError(f'Unknown lod1 face: {lod1_face}')

        lod1_color_size = int(args.lod1_color_size or args.face_size)
        lod1_height_size = int(args.lod1_height_size or args.height_size)
        manifest['maxAvailableLod'] = max(manifest.get('maxAvailableLod', 0), 1)

        lod1_tasks = [
            (lod1_face, 1, tile_x, tile_y, lod1_color_size, lod1_height_size, out_color_root, out_height_root,
             float(args.height_min_m), float(args.height_max_m), can_try_ktx2)
            for tile_y in range(2) for tile_x in range(2)
        ]
        for tile_id, entry, encoded in run_tile_tasks(lod1_tasks, jobs, color_src_path, height_src_path, use_flat_height, color_np, hmap_np):
            manifest['tiles'][tile_id] = entry
            encoded_any_ktx2 = encoded_any_ktx2 or encoded

        manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        print(f'Wrote LOD1 tiles for face: {lod1_face}')

    if args.refine_lat is not None and args.refine_lon is not None and args.refine_max_lod is not None:
        refine_path = lat_lon_to_tile_path(args.refine_lat, args.refine_lon, int(args.refine_max_lod))
        refine_min_lod = max(1, int(args.refine_min_lod))
        refine_color_size = int(args.refine_color_size or args.face_size)
        refine_height_size = int(args.refine_height_size or args.height_size)
        refine_face_override = args.refine_face_override.strip() if args.refine_face_override else None
        if refine_face_override and refine_face_override not in FACES:
            raise ValueError(f'Unknown refine face override: {refine_face_override}')

        manifest['maxAvailableLod'] = max(manifest.get('maxAvailableLod', 0), int(args.refine_max_lod))

        refine_tasks = []
        parent_x = 0
        parent_y = 0
        for path_face, lod, target_x, target_y in refine_path:
            face = refine_face_override or path_face

            if lod < refine_min_lod:
                parent_x = target_x
                parent_y = target_y
                continue

            child_x0 = parent_x * 2
            child_y0 = parent_y * 2
            for dy in range(2):
                for dx in range(2):
                    refine_tasks.append((
                        face, lod, child_x0 + dx, child_y0 + dy, refine_color_size, refine_height_size,
                        out_color_root, out_height_root, float(args.height_min_m), float(args.height_max_m), can_try_ktx2,
                    ))

            parent_x = target_x
            parent_y = target_y

        for tile_id, entry, encoded in run_tile_tasks(refine_tasks, jobs, color_src_path, height_src_path, use_flat_height, color_np, hmap_np):
            manifest['tiles'][tile_id] = entry
            encoded_any_ktx2 = encoded_any_ktx2 or encoded

        manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        print(f'Wrote refinement pyramid for lat={args.refine_lat}, lon={args.refine_lon} to LOD {args.refine_max_lod}')

    if can_try_ktx2 and not encoded_any_ktx2:
        scope = 'lod1-only tiles' if args.lod1_only else 'LOD0 tiles'
        print(f'[lod0] toktx not found or failed; PNG fallback files were generated for {scope}.')


if __name__ == '__main__':
    main()
