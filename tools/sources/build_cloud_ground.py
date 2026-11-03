"""The ground's height for the clouds (src/planet/clouds/cloudGround.png): the land's mean height over each
0.125-degree cell (0 over the sea), in steps of STEP metres, as an 8-bit grayscale PNG (equirectangular, from
180 W, north at the top). The clouds keep above it and build on the slopes the wind blows up, clearing in the
lee (Clouds.js, OROGRAPHIC_*).

Source: the land elevation GeoTIFF (tools/sources/build_land_elevation.py), read at the output's
resolution with averaging (its overviews).

    POSIX:      .venv/bin/python -m tools.sources.build_cloud_ground
    PowerShell: .venv\\Scripts\\python.exe -m tools.sources.build_cloud_ground
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'additional_earth_imagery' / 'sources' / 'land_elevation_gmted_7.5s.tif'
OUT = ROOT / 'src' / 'planet' / 'clouds' / 'cloudGround.png'
WIDTH, HEIGHT = 2880, 1440  # 0.125 degrees
STEP = 25  # m


def main():
    with rasterio.open(SOURCE) as ds:
        assert ds.bounds.left == -180 and ds.bounds.top == 90 and ds.bounds.bottom == -90
        elevation = ds.read(1, out_shape=(HEIGHT, WIDTH), resampling=rasterio.enums.Resampling.average)
    elevation = np.maximum(np.nan_to_num(elevation.astype(np.float64)), 0)
    q = np.clip(np.round(elevation / STEP), 0, 255).astype(np.uint8)
    Image.fromarray(q).save(OUT, optimize=True)
    print(f'wrote {OUT} ({OUT.stat().st_size} bytes; highest cell {elevation.max():.0f} m)')


if __name__ == '__main__':
    main()
