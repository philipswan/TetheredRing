from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import math
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import requests
from PIL import Image


USGS_EXPORT_URL = (
    "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export"
)
USGS_TILE_URL = (
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
)


@dataclass(frozen=True)
class TileSpec:
    i: int
    j: int


def lonlat_to_tile_xy(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    lat = max(min(lat, 85.05112878), -85.05112878)
    n = 2 ** zoom
    x = (lon + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def tile_xy_to_lonlat(x: float, y: float, zoom: int) -> tuple[float, float]:
    n = 2 ** zoom
    lon = x / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n)))
    lat = math.degrees(lat_rad)
    return lon, lat


def tile_bbox(i: int, j: int, w: int = 24, h: int = 12) -> tuple[float, float, float, float]:
    lon_min = -180.0 + i * (360.0 / w)
    lon_max = lon_min + (360.0 / w)
    lat_max = 90.0 - j * (180.0 / h)
    lat_min = lat_max - (180.0 / h)
    return lon_min, lat_min, lon_max, lat_max


def fetch_export_image(bbox: tuple[float, float, float, float], desired_px: int = 8192) -> tuple[Image.Image, int]:
    # Try larger first, then fall back if service limits output size.
    for size in [desired_px, 6144, 4096, 3072, 2048]:
        params = {
            "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
            "bboxSR": 4326,
            "imageSR": 4326,
            "size": f"{size},{size}",
            "format": "jpg",
            "transparent": "false",
            "f": "image",
        }
        response = requests.get(USGS_EXPORT_URL, params=params, timeout=90)
        response.raise_for_status()

        ctype = response.headers.get("Content-Type", "").lower()
        if "image" not in ctype:
            continue

        image = Image.open(BytesIO(response.content)).convert("RGB")
        return image, size

    raise RuntimeError("Unable to download imagery from USGS export service at any tested size.")


def download_xyz_tile(session: requests.Session, zoom: int, x: int, y: int) -> tuple[int, int, Image.Image]:
    url = USGS_TILE_URL.format(z=zoom, y=y, x=x)
    response = session.get(url, timeout=90)
    response.raise_for_status()
    image = Image.open(BytesIO(response.content)).convert("RGB")
    return x, y, image


def reproject_mercator_to_equirectangular(
    mercator_img: Image.Image,
    bbox: tuple[float, float, float, float],
    zoom: int,
    out_size: int,
) -> Image.Image:
    lon_min, lat_min, lon_max, lat_max = bbox

    src = np.asarray(mercator_img, dtype=np.float32)
    src_h, src_w, _ = src.shape

    # X is linear for both Mercator and equirectangular in lon.
    x_src = np.linspace(0.0, src_w - 1.0, out_size, dtype=np.float64)
    x0 = np.floor(x_src).astype(np.int32)
    x1 = np.clip(x0 + 1, 0, src_w - 1)
    wx = (x_src - x0).astype(np.float32)
    one_minus_wx = 1.0 - wx

    # Y differs between projections; map target equirect lat rows into Mercator y.
    lat_rows = np.linspace(lat_max, lat_min, out_size, dtype=np.float64)
    y_tile = np.array([lonlat_to_tile_xy(lon_min, lat, zoom)[1] for lat in lat_rows], dtype=np.float64)
    y0_tile = lonlat_to_tile_xy(lon_min, lat_max, zoom)[1]
    y1_tile = lonlat_to_tile_xy(lon_min, lat_min, zoom)[1]
    y_src = (y_tile - y0_tile) / (y1_tile - y0_tile) * (src_h - 1)
    y_src = np.clip(y_src, 0.0, src_h - 1.0)
    y0 = np.floor(y_src).astype(np.int32)
    y1 = np.clip(y0 + 1, 0, src_h - 1)
    wy = (y_src - y0).astype(np.float32)

    out = np.empty((out_size, out_size, 3), dtype=np.uint8)

    for row in range(out_size):
        row0 = src[y0[row], :, :]
        row1 = src[y1[row], :, :]
        blended_y = row0 * (1.0 - wy[row]) + row1 * wy[row]

        # Bilinear in X for the current row.
        sampled = blended_y[x0, :] * one_minus_wx[:, None] + blended_y[x1, :] * wx[:, None]
        out[row, :, :] = np.clip(sampled, 0.0, 255.0).astype(np.uint8)

    return Image.fromarray(out, mode="RGB")


def fetch_xyz_mosaic(
    bbox: tuple[float, float, float, float],
    desired_px: int,
    zoom: int = 10,
    max_workers: int = 24,
) -> tuple[Image.Image, int, int]:
    lon_min, lat_min, lon_max, lat_max = bbox

    x0f, y0f = lonlat_to_tile_xy(lon_min, lat_max, zoom)
    x1f, y1f = lonlat_to_tile_xy(lon_max, lat_min, zoom)

    x0 = int(math.floor(min(x0f, x1f)))
    x1 = int(math.floor(max(x0f, x1f)))
    y0 = int(math.floor(min(y0f, y1f)))
    y1 = int(math.floor(max(y0f, y1f)))

    nx = x1 - x0 + 1
    ny = y1 - y0 + 1
    stitched = Image.new("RGB", (nx * 256, ny * 256))

    with requests.Session() as session:
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = [
                pool.submit(download_xyz_tile, session, zoom, x, y)
                for y in range(y0, y1 + 1)
                for x in range(x0, x1 + 1)
            ]
            for future in as_completed(futures):
                x, y, tile = future.result()
                stitched.paste(tile, ((x - x0) * 256, (y - y0) * 256))

    stitched_w, stitched_h = stitched.size

    # Crop in XYZ tile-space coordinates. This preserves correct Mercator mapping
    # and avoids north/south drift from linear interpolation in latitude.
    x_min_f = min(x0f, x1f)
    x_max_f = max(x0f, x1f)
    y_min_f = min(y0f, y1f)
    y_max_f = max(y0f, y1f)

    crop_left = int(round((x_min_f - x0) * 256))
    crop_right = int(round((x_max_f - x0) * 256))
    crop_top = int(round((y_min_f - y0) * 256))
    crop_bottom = int(round((y_max_f - y0) * 256))

    crop_left = max(0, min(crop_left, stitched_w - 1))
    crop_right = max(crop_left + 1, min(crop_right, stitched_w))
    crop_top = max(0, min(crop_top, stitched_h - 1))
    crop_bottom = max(crop_top + 1, min(crop_bottom, stitched_h))

    cropped = stitched.crop((crop_left, crop_top, crop_right, crop_bottom))
    native_w, native_h = cropped.size

    # XYZ source tiles are Web Mercator; the globe texture grid is equirectangular.
    # Reproject to equirectangular so geographic features line up with displacement.
    reproj = reproject_mercator_to_equirectangular(cropped, bbox, zoom=zoom, out_size=desired_px)

    return reproj, native_w, native_h


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    out_dir = project_root / "textures" / "24x12" / "XHR"
    out_dir.mkdir(parents=True, exist_ok=True)

    tiles = [TileSpec(1, 4)]

    for tile in tiles:
        bbox = tile_bbox(tile.i, tile.j)

        # Build a true-detail image from map tiles first, then fall back to export if needed.
        desired_px = 16384
        try:
            image, native_w, native_h = fetch_xyz_mosaic(bbox, desired_px=desired_px, zoom=10)
            source_desc = f"XYZ zoom=10 native={native_w}x{native_h}"
        except Exception as ex:
            image, requested = fetch_export_image(bbox, desired_px=desired_px)
            source_desc = f"EXPORT requested={requested} delivered={image.width}x{image.height} fallback_reason={type(ex).__name__}"

        out_path_versioned = out_dir / f"earth_XHR_24x12_{tile.i}x{tile.j}_z10_16k.jpg"
        out_path_legacy = out_dir / f"earth_XHR_24x12_{tile.i}x{tile.j}.jpg"
        image.save(out_path_versioned, quality=95, optimize=True)
        image.save(out_path_legacy, quality=95, optimize=True)
        print(
            f"Wrote {out_path_versioned} and {out_path_legacy} "
            f"size={image.size} bbox={bbox} source={source_desc}"
        )


if __name__ == "__main__":
    main()
