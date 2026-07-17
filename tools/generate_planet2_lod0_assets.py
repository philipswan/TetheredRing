from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import os
import shutil
import subprocess
import time
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

    if image.ndim == 3:
        tx = tx[..., None]
        ty = ty[..., None]

    # Gather the four corner texels FIRST (in the source's native dtype), then
    # promote only those small per-tile arrays to float. Converting the whole
    # `image` up front (image.astype(float64)) would materialize the entire source
    # as float64 -- e.g. an 86400x43200x3 uint8 mmap (~11 GB) becomes ~89 GB per
    # call and thrashes to the pagefile. Indexing the native array keeps the work
    # proportional to the tile size.
    c00 = image[y0, x0].astype(np.float64)
    c10 = image[y0, x1].astype(np.float64)
    c01 = image[y1, x0].astype(np.float64)
    c11 = image[y1, x1].astype(np.float64)

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
# Color is uint8 HxWx3; height is float meters HxW; each array keeps its OWN exact
# geographic bbox (lon_min,lon_max,lat_min,lat_max) deg, because cropping the color
# and height sources (which differ in resolution) yields slightly different extents.
_REGIONAL_RGB: np.ndarray | None = None
_REGIONAL_HM: np.ndarray | None = None
_REGIONAL_BBOX: tuple[float, float, float, float] | None = None
_REGIONAL_RGB_BBOX: tuple[float, float, float, float] | None = None
_REGIONAL_HM_BBOX: tuple[float, float, float, float] | None = None
# Optional sub-rectangle (lon_min, lon_max, lat_min, lat_max) within which the
# regional HEIGHT source actually carries data. A regional displacement tile can
# span a wide bbox yet only contain relief for part of it (e.g. the XHR Hawaii
# source has Big-Island terrain but reads flat sea-level elsewhere); restricting
# the override to this rectangle lets the base globe's relief fill the rest instead
# of being flattened. None => the whole regional bbox is treated as valid data.
_REGIONAL_HM_DATA_BBOX: tuple[float, float, float, float] | None = None
# When True, the regional height override is only applied where it carries land relief
# (sample above sea level). The legacy XHR displacement reads a flat ~0 m over water,
# so overriding the ocean with it would erase the base globe's real bathymetry; a real
# meters DEM (e.g. ETOPO/NCEI) carries genuine negative depths and sets this False so
# its bathymetry is kept.
_REGIONAL_HM_LAND_ONLY: bool = False
_REGIONAL_HM_SEA_LEVEL_M: float = 0.5


def _regional_pixel_coords(dx, dy, dz, width, height, bbox):
    """For a direction grid, return (mask_in_bbox, sample_x, sample_y) for the regional tile."""
    lon = np.degrees(np.arctan2(-dz, dx))  # matches direction_to_equirect_xy_grid convention
    # Geodetic latitude, matching direction_to_equirect_xy_grid so the regional crop aligns.
    lat = np.degrees(np.arctan2(dy, (1.0 - WGS84_E2) * np.sqrt(dx * dx + dz * dz)))
    lon_min, lon_max, lat_min, lat_max = bbox
    mask = (lon >= lon_min) & (lon <= lon_max) & (lat >= lat_min) & (lat <= lat_max)
    rx = (lon - lon_min) / (lon_max - lon_min) * (width - 1)
    ry = (lat_max - lat) / (lat_max - lat_min) * (height - 1)
    return mask, rx, ry


def _crop_regional(arr: np.ndarray, full_bbox, crop_bbox):
    """Crop an equirect regional array to crop_bbox and return (sub_array, exact_bbox).

    Uses the same pixel-center mapping as _regional_pixel_coords, so the returned
    sub-array paired with its exact_bbox samples identically to the full array over
    the retained region. The crop is expanded outward to whole pixels so nothing
    inside crop_bbox is lost. Discards the full array's hold on memory by returning
    a contiguous copy of just the needed window.
    """
    lon_min, lon_max, lat_min, lat_max = full_bbox
    h, w = int(arr.shape[0]), int(arr.shape[1])
    clon_min, clon_max, clat_min, clat_max = crop_bbox
    # Clamp the requested window to what the source actually covers.
    clon_min = max(clon_min, lon_min); clon_max = min(clon_max, lon_max)
    clat_min = max(clat_min, lat_min); clat_max = min(clat_max, lat_max)
    x_of = lambda lon: (lon - lon_min) / (lon_max - lon_min) * (w - 1)
    y_of = lambda lat: (lat_max - lat) / (lat_max - lat_min) * (h - 1)
    x0 = max(0, min(w - 1, int(math.floor(x_of(clon_min)))))
    x1 = max(0, min(w - 1, int(math.ceil(x_of(clon_max)))))
    y0 = max(0, min(h - 1, int(math.floor(y_of(clat_max)))))  # lat_max -> smallest y
    y1 = max(0, min(h - 1, int(math.ceil(y_of(clat_min)))))
    sub = np.ascontiguousarray(arr[y0:y1 + 1, x0:x1 + 1])
    lon_at = lambda x: lon_min + x / (w - 1) * (lon_max - lon_min)
    lat_at = lambda y: lat_max - y / (h - 1) * (lat_max - lat_min)
    exact = (lon_at(x0), lon_at(x1), lat_at(y1), lat_at(y0))
    return sub, exact


def set_regional_source(color_path: Path | None, height_path: Path, bbox: tuple[float, float, float, float], crop_bbox: tuple[float, float, float, float] | None = None, height_data_bbox: tuple[float, float, float, float] | None = None) -> None:
    """Load the regional color/height overrides.

    When crop_bbox is provided, each full source is loaded, cropped to that window,
    and the full-resolution array is released immediately -- so a worker only keeps
    the tiny island window in memory instead of the entire 15-degree regional cell.

    height_data_bbox optionally limits the HEIGHT override to a sub-rectangle where
    the source actually carries relief (see _REGIONAL_HM_DATA_BBOX); the color
    override is unaffected.
    """
    global _REGIONAL_RGB, _REGIONAL_HM, _REGIONAL_BBOX
    global _REGIONAL_RGB_BBOX, _REGIONAL_HM_BBOX, _REGIONAL_HM_DATA_BBOX, _REGIONAL_HM_LAND_ONLY
    _REGIONAL_BBOX = bbox
    _REGIONAL_HM_DATA_BBOX = tuple(height_data_bbox) if height_data_bbox is not None else None
    if color_path is not None:
        rgb = np.asarray(Image.open(color_path).convert('RGB'), dtype=np.uint8)
        if crop_bbox is not None:
            rgb, _REGIONAL_RGB_BBOX = _crop_regional(rgb, bbox, crop_bbox)
        else:
            _REGIONAL_RGB_BBOX = bbox
        _REGIONAL_RGB = rgb
    h_img = Image.open(height_path)
    if height_path.suffix.lower() in ('.tif', '.tiff') or h_img.mode == 'F':
        # GeoTIFF/float DEM (e.g. NCEI Hawaii multibeam): values are real meters
        # (sea level = 0, ocean negative) and are used directly, including bathymetry.
        hm = np.asarray(h_img, dtype=np.float32)
        _REGIONAL_HM_LAND_ONLY = False
    else:
        # XHR displacement encoding: code ~= 9000 + 10 * elevation_m. It is flat over
        # water, so it may only override where it carries land (see _REGIONAL_HM_LAND_ONLY),
        # leaving the base globe's bathymetry intact under the ocean.
        code = np.asarray(h_img, dtype=np.float32)
        hm = (code - 9000.0) / 10.0
        _REGIONAL_HM_LAND_ONLY = True
    if crop_bbox is not None:
        hm, _REGIONAL_HM_BBOX = _crop_regional(hm, bbox, crop_bbox)
    else:
        _REGIONAL_HM_BBOX = bbox
    _REGIONAL_HM = hm


_BASE_TILE_ROOT: Path | None = None
_BASE_TILE_CACHE: Path | None = None
_BASE_COLOR_TILES: dict[Path, np.ndarray] = {}
_BASE_HEIGHT_TILES: dict[Path, np.ndarray] = {}


def set_base_tile_source(root: Path | None, cache: Path | None = None) -> None:
    global _BASE_TILE_ROOT, _BASE_TILE_CACHE
    _BASE_TILE_ROOT, _BASE_TILE_CACHE = root, cache
    _BASE_COLOR_TILES.clear()
    _BASE_HEIGHT_TILES.clear()


def _base_ancestor(face: str, lod: int, x: int, y: int, kind: str, suffix: str):
    for ancestor_lod in range(lod, -1, -1):
        shift = lod - ancestor_lod
        ax, ay = x >> shift, y >> shift
        path = _BASE_TILE_ROOT / kind / face / str(ancestor_lod) / str(ax) / f'{ay}.{suffix}'
        if path.exists():
            return path, ancestor_lod, ax, ay
    raise FileNotFoundError(f'No base {kind} ancestor for {face}/{lod}/{x}/{y}')


def _ktx_executable() -> str:
    executable = shutil.which('ktx')
    candidate = Path('C:/Program Files/KTX-Software/bin/ktx.exe')
    if not executable and candidate.exists():
        executable = str(candidate)
    if not executable:
        raise RuntimeError('ktx extract is required to sample base Earth color tiles')
    return executable


def _load_base_color(path: Path) -> np.ndarray:
    if path not in _BASE_COLOR_TILES:
        relative = path.relative_to(_BASE_TILE_ROOT / 'color').with_suffix('.png')
        png = _BASE_TILE_CACHE / 'color' / relative
        if not png.exists():
            png.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run([_ktx_executable(), 'extract', '--transcode', 'rgb8',
                            str(path), str(png)], check=True, capture_output=True)
        _BASE_COLOR_TILES[path] = np.asarray(Image.open(png).convert('RGB'), dtype=np.uint8)
    return _BASE_COLOR_TILES[path]


def _load_base_height(path: Path) -> np.ndarray:
    if path not in _BASE_HEIGHT_TILES:
        raw = np.fromfile(path, dtype='<u2')
        edge = math.isqrt(raw.size)
        if edge * edge != raw.size:
            raise ValueError(f'Base height tile is not square: {path}')
        _BASE_HEIGHT_TILES[path] = raw.reshape(edge, edge)
    return _BASE_HEIGHT_TILES[path]


def _sample_base_tile(face: str, lod: int, x: int, y: int, size: int, kind: str) -> np.ndarray:
    suffix = 'ktx2' if kind == 'color' else 'bin'
    path, ancestor_lod, ax, ay = _base_ancestor(face, lod, x, y, kind, suffix)
    source = _load_base_color(path) if kind == 'color' else _load_base_height(path)
    scale = 1 << (lod - ancestor_lod)
    rel_x, rel_y = x - ax * scale, y - ay * scale
    if kind == 'height':
        s = np.linspace(0.0, 1.0, size, dtype=np.float64)
        sx = (rel_x + s) / scale * (source.shape[1] - 1)
        sy = (rel_y + s) / scale * (source.shape[0] - 1)
    else:
        s = (np.arange(size, dtype=np.float64) + 0.5) / size
        sx = (rel_x + s) / scale * source.shape[1] - 0.5
        sy = (rel_y + s) / scale * source.shape[0] - 0.5
    return bilinear_sample_grid(source, *np.meshgrid(sx, sy))


def generate_tile_color(face: str, src_rgb: np.ndarray, lod: int, tile_x: int, tile_y: int, face_size: int) -> np.ndarray:
    u, v = _tile_uv_grids(lod, tile_x, tile_y, face_size)
    dx, dy, dz = cube_to_direction_grid(face, u, v)
    if _BASE_TILE_ROOT is not None:
        sampled = _sample_base_tile(face, lod, tile_x, tile_y, face_size, 'color')
    else:
        sx, sy = direction_to_equirect_xy_grid(dx, dy, dz, src_rgb.shape[1], src_rgb.shape[0])
        sampled = bilinear_sample_grid(src_rgb, sx, sy)
    if _REGIONAL_RGB is not None:
        mask, rx, ry = _regional_pixel_coords(dx, dy, dz, _REGIONAL_RGB.shape[1], _REGIONAL_RGB.shape[0], _REGIONAL_RGB_BBOX)
        if mask.any():
            rs = bilinear_sample_grid(_REGIONAL_RGB, rx, ry)
            sampled[mask] = rs[mask]
    return np.clip(np.round(sampled), 0, 255).astype(np.uint8)


def generate_tile_height(face: str, src_hmap: np.ndarray, lod: int, tile_x: int, tile_y: int, face_size: int, height_min_m: float = -200.0, height_max_m: float = 8500.0) -> np.ndarray:
    u, v = _tile_uv_grids(lod, tile_x, tile_y, face_size, align='edge')
    dx, dy, dz = cube_to_direction_grid(face, u, v)
    if _BASE_TILE_ROOT is not None:
        sampled = _sample_base_tile(face, lod, tile_x, tile_y, face_size, 'height')
    else:
        sx, sy = direction_to_equirect_xy_grid(dx, dy, dz, src_hmap.shape[1], src_hmap.shape[0])
        sampled = bilinear_sample_grid(src_hmap, sx, sy)
    if _REGIONAL_HM is not None:
        mask, rx, ry = _regional_pixel_coords(dx, dy, dz, _REGIONAL_HM.shape[1], _REGIONAL_HM.shape[0], _REGIONAL_HM_BBOX)
        if _REGIONAL_HM_DATA_BBOX is not None:
            # Restrict the override to the sub-rectangle that actually carries relief
            # so the base globe fills the rest (see _REGIONAL_HM_DATA_BBOX).
            lon = np.degrees(np.arctan2(-dz, dx))
            lat = np.degrees(np.arctan2(dy, (1.0 - WGS84_E2) * np.sqrt(dx * dx + dz * dz)))
            d_lon_min, d_lon_max, d_lat_min, d_lat_max = _REGIONAL_HM_DATA_BBOX
            mask = mask & (lon >= d_lon_min) & (lon <= d_lon_max) & (lat >= d_lat_min) & (lat <= d_lat_max)
        if mask.any():
            meters = bilinear_sample_grid(_REGIONAL_HM, rx, ry)
            if _REGIONAL_HM_LAND_ONLY:
                # Only let a flat-ocean displacement source override where it is real
                # land, so the base globe's bathymetry survives under the water.
                mask = mask & (meters > _REGIONAL_HM_SEA_LEVEL_M)
            if mask.any():
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


def _encode_meters_to_u16(hmap_m: np.ndarray, height_min_m: float, height_max_m: float) -> np.ndarray:
    """Encode a float meters height array into the manifest's u16 code space in place.

    code = (m - min) / (max - min) * 65535, clamped to [0, 65535]. Done in float32
    (mantissa is exact over 0..65535) to avoid a float64 temporary the size of the
    entire ETOPO grid. The input array is consumed and freed by the caller.
    """
    scale = np.float32(65535.0 / (height_max_m - height_min_m))
    hmap_m -= np.float32(height_min_m)
    hmap_m *= scale
    np.clip(hmap_m, 0.0, 65535.0, out=hmap_m)
    return np.round(hmap_m).astype(np.uint16)


def load_sources(color_src_path: Path, height_src_path: Path, use_flat_height: bool,
                 height_min_m: float = -200.0, height_max_m: float = 8500.0) -> tuple[np.ndarray, np.ndarray]:
    color_img = Image.open(color_src_path).convert('RGB')
    color_np = np.asarray(color_img, dtype=np.uint8)

    if use_flat_height:
        # Fill with the code for sea level (0 m) so "flat" means the ocean surface,
        # not the bottom of the decode range.
        code0 = int(round(np.clip((0.0 - height_min_m) / (height_max_m - height_min_m) * 65535.0, 0, 65535)))
        hmap_np = np.full((512, 1024), code0, dtype=np.uint16)
    else:
        h_img = Image.open(height_src_path)
        is_meters = height_src_path.suffix.lower() in ('.tif', '.tiff') or h_img.mode == 'F'
        if is_meters:
            # ETOPO/GeoTIFF elevation is real meters (sea level = 0, ocean negative).
            # Encode into the manifest's u16 code space. The full 21600x10800 grid is
            # slow to decode and ~0.5 GB per worker, and the bake re-inits a pool for
            # every phase/cone, so the encoded result is cached as a .npy that every
            # worker memory-maps (shared via the OS page cache) instead of re-decoding.
            cache = height_src_path.with_name(
                f'{height_src_path.stem}.u16_{int(round(height_min_m))}_{int(round(height_max_m))}.npy')
            if cache.exists():
                hmap_np = np.load(cache, mmap_mode='r')
            else:
                hmap_m = np.asarray(h_img, dtype=np.float32).copy()
                hmap_np = _encode_meters_to_u16(hmap_m, height_min_m, height_max_m)
                del hmap_m
                # Write via a per-process temp + atomic replace so concurrent first-run
                # workers can't read a half-written cache (os.replace is atomic on the
                # same filesystem; a worker that built its own array just uses it). The
                # temp keeps the .npy suffix so np.save doesn't append another one.
                tmp = cache.with_name(f'{cache.stem}.tmp{os.getpid()}.npy')
                try:
                    np.save(tmp, hmap_np)
                    os.replace(tmp, cache)
                except OSError:
                    try:
                        tmp.unlink()
                    except OSError:
                        pass
        elif h_img.mode in ('I;16', 'I'):
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


def _pool_init(color_src_path: Path, height_src_path: Path, use_flat_height: bool,
               height_min_m: float = -200.0, height_max_m: float = 8500.0) -> None:
    global _WORKER_SRC_RGB, _WORKER_SRC_HMAP
    _WORKER_SRC_RGB, _WORKER_SRC_HMAP = load_sources(
        color_src_path, height_src_path, use_flat_height, height_min_m, height_max_m)


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
    # The height decode range is uniform across a bake; take it from the first task
    # so workers encode a meters source (ETOPO) into the same u16 space main() uses.
    hmin, hmax = tasks[0][8], tasks[0][9]
    if jobs > 1 and len(tasks) > 1:
        with concurrent.futures.ProcessPoolExecutor(
            max_workers=jobs,
            initializer=_pool_init,
            initargs=(color_src_path, height_src_path, use_flat_height, hmin, hmax),
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

    # toktx occasionally fails with a transient error (exit 2) when another process
    # briefly holds the source .png or destination .ktx2 -- on Windows this is common
    # under antivirus or cloud-sync (OneDrive/NextCloud) scanning during a parallel
    # bake. Retry a few times with a short backoff so a momentary lock does not
    # permanently drop the tile to a PNG the renderer (requireKtx2) will reject.
    attempts = 4
    last_stderr = ''
    for attempt in range(attempts):
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            return True
        except subprocess.CalledProcessError as ex:
            last_stderr = (ex.stderr or b'').decode('utf-8', 'replace').strip()
        except Exception as ex:  # toktx missing/not executable, etc. -- not retryable
            print(f'[lod0] KTX2 encode error for {src_png.name}: {ex}')
            return False
        if attempt < attempts - 1:
            time.sleep(0.25 * (attempt + 1))

    print(f'[lod0] KTX2 encode failed for {src_png.name} after {attempts} attempts: '
          f'{last_stderr or "exit status 2"}')
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate LOD0 cubed-sphere assets for planet2 renderer.')
    parser.add_argument('--color-source', type=str, default='textures/bluemarble_4096.jpg')
    parser.add_argument('--height-source', type=str, default='textures/DEM/ETOPO_2022_v1_60s_surface.tif')
    parser.add_argument('--face-size', type=int, default=512)
    parser.add_argument('--height-size', type=int, default=128)
    parser.add_argument('--flat-height', action='store_true', default=False)
    parser.add_argument('--height-min-m', type=float, default=-11000.0)
    parser.add_argument('--height-max-m', type=float, default=9000.0)
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
    color_np, hmap_np = load_sources(
        color_src_path, height_src_path, use_flat_height,
        float(args.height_min_m), float(args.height_max_m))

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
