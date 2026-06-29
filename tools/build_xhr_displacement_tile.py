from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image
import tifffile


@dataclass(frozen=True)
class TileBounds:
    lon_min: float
    lon_max: float
    lat_min: float
    lat_max: float


def parse_copernicus_tile_bounds(filename: str) -> TileBounds:
    # Example: Copernicus_DSM_COG_10_N19_00_W156_00_DEM.tif
    stem = Path(filename).stem
    parts = stem.split("_")
    lat_token = parts[4]  # N19
    lon_token = parts[6]  # W156

    lat_sign = 1 if lat_token[0] == "N" else -1
    lon_sign = 1 if lon_token[0] == "E" else -1

    lat0 = lat_sign * float(lat_token[1:])
    lon0 = lon_sign * float(lon_token[1:])

    return TileBounds(
        lon_min=lon0,
        lon_max=lon0 + 1.0,
        lat_min=lat0,
        lat_max=lat0 + 1.0,
    )


def read_dem(path: Path) -> np.ndarray:
    arr = tifffile.imread(path)
    if arr.ndim > 2:
        arr = arr[0]
    arr = np.asarray(arr, dtype=np.float32)

    # Copernicus often uses -32767 as nodata for DEM band.
    arr[arr <= -32000.0] = np.nan
    return arr


def pixel_range_for_bounds(
    full_bounds: TileBounds,
    src_bounds: TileBounds,
    width: int,
    height: int,
) -> tuple[int, int, int, int]:
    # Equirectangular mapping with y downward in image coordinates.
    x0 = int(np.floor((src_bounds.lon_min - full_bounds.lon_min) / (full_bounds.lon_max - full_bounds.lon_min) * width))
    x1 = int(np.ceil((src_bounds.lon_max - full_bounds.lon_min) / (full_bounds.lon_max - full_bounds.lon_min) * width))

    y0 = int(np.floor((full_bounds.lat_max - src_bounds.lat_max) / (full_bounds.lat_max - full_bounds.lat_min) * height))
    y1 = int(np.ceil((full_bounds.lat_max - src_bounds.lat_min) / (full_bounds.lat_max - full_bounds.lat_min) * height))

    x0 = max(0, min(width, x0))
    x1 = max(0, min(width, x1))
    y0 = max(0, min(height, y0))
    y1 = max(0, min(height, y1))
    return x0, x1, y0, y1


def bilinear_resize(src: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
    # Lightweight bilinear resize using Pillow for robustness.
    valid = np.nan_to_num(src, nan=0.0)
    img = Image.fromarray(valid, mode="F")
    img = img.resize((out_w, out_h), resample=Image.BILINEAR)
    out = np.array(img, dtype=np.float32)

    if np.isnan(src).any():
        mask = (~np.isnan(src)).astype(np.float32)
        m = Image.fromarray(mask, mode="F").resize((out_w, out_h), resample=Image.BILINEAR)
        m_arr = np.array(m, dtype=np.float32)
        out[m_arr < 0.5] = np.nan
    return out


def build_displacement_tile(
    source_files: Iterable[Path],
    tile_bounds: TileBounds,
    out_path: Path,
    out_size: int = 8192,
) -> None:
    canvas = np.full((out_size, out_size), np.nan, dtype=np.float32)

    for src_path in source_files:
        src_bounds = parse_copernicus_tile_bounds(src_path.name)

        # Skip sources outside target bounds.
        if src_bounds.lon_max <= tile_bounds.lon_min or src_bounds.lon_min >= tile_bounds.lon_max:
            continue
        if src_bounds.lat_max <= tile_bounds.lat_min or src_bounds.lat_min >= tile_bounds.lat_max:
            continue

        dem = read_dem(src_path)
        x0, x1, y0, y1 = pixel_range_for_bounds(tile_bounds, src_bounds, out_size, out_size)
        if x1 <= x0 or y1 <= y0:
            continue

        resized = bilinear_resize(dem, y1 - y0, x1 - x0)

        region = canvas[y0:y1, x0:x1]
        write_mask = ~np.isnan(resized)
        region[write_mask] = resized[write_mask]
        canvas[y0:y1, x0:x1] = region

    if np.all(np.isnan(canvas)):
        raise RuntimeError("No source DEM data overlapped target tile bounds.")

    # Fill missing cells with 0m so the shader bias/scale still behaves predictably.
    canvas = np.nan_to_num(canvas, nan=0.0)

    # Match the existing project displacement encoding convention used in 24x12 HR tiles.
    # Empirically these are approximately encoded as: code ~= 9000 + 10 * elevation_m.
    encoded = np.clip(9000.0 + 10.0 * canvas, 0.0, 65535.0).astype(np.uint16)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(encoded, mode="I;16").save(out_path)


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    src_dir = project_root / "textures" / "DisplacementMaps" / "XHREarthDisplacement"

    # Render tile (i=1, j=4) for 24x12 equirectangular grid.
    # Lon range: [-165, -150], Lat range: [15, 30]
    target = TileBounds(lon_min=-165.0, lon_max=-150.0, lat_min=15.0, lat_max=30.0)

    inputs = sorted(src_dir.glob("Copernicus_DSM_COG_10_*_DEM.tif"))
    output = src_dir / "earth_XHR_24x12_1x4.png"

    build_displacement_tile(inputs, target, output, out_size=8192)
    print(f"Wrote {output}")
