"""Fetch the authoritative regional inputs used by the Chimborazo LOD bake."""

from __future__ import annotations

import math
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.request import urlopen

from tools.build_xhr_displacement_tile import TileBounds, build_displacement_tile
from tools.download_xhr_hawaii_texture_tiles import fetch_xyz_mosaic


COPERNICUS_GLO30 = "https://copernicus-dem-30m.s3.amazonaws.com"
EOX_CLOUDLESS_2024 = (
    "https://tiles.maps.eox.at/wmts/1.0.0/"
    "s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
)


def _hemisphere(value: int, positive: str, negative: str, width: int) -> str:
    return f"{positive if value >= 0 else negative}{abs(value):0{width}d}_00"


def _copernicus_name(lat: int, lon: int) -> str:
    return (
        "Copernicus_DSM_COG_10_"
        f"{_hemisphere(lat, 'N', 'S', 2)}_"
        f"{_hemisphere(lon, 'E', 'W', 3)}_DEM"
    )


def _download(url: str, destination: Path) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    for attempt in range(1, 4):
        try:
            downloaded = 0
            with urlopen(url, timeout=30) as response:
                total = int(response.headers.get("Content-Length", 0))
                with temporary.open("wb") as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
                        downloaded += len(chunk)
                        if downloaded % (8 * 1024 * 1024) < len(chunk):
                            suffix = f"/{total / 1048576:.0f}" if total else ""
                            print(f"    {downloaded / 1048576:.0f}{suffix} MiB", flush=True)
            temporary.replace(destination)
            return True
        except HTTPError as error:
            temporary.unlink(missing_ok=True)
            if error.code == 404:
                return False  # Copernicus omits ocean-only one-degree cells.
            if attempt == 3:
                raise
        except (OSError, TimeoutError) as error:
            temporary.unlink(missing_ok=True)
            if attempt == 3:
                raise
            print(f"    download attempt {attempt} failed: {error}; retrying", flush=True)
            time.sleep(attempt)
    return False


def prepare_sources(
    root: Path,
    bbox: tuple[float, float, float, float],
    pixels: int = 12288,
) -> tuple[Path, Path]:
    """Return locally prepared color/height images made from upstream datasets."""
    cache = root / ".cache" / "adaptive_lod" / "chimborazo"
    cache.mkdir(parents=True, exist_ok=True)
    # Include the requested extent in derived filenames. Otherwise changing the
    # overlay boundary silently reuses the old, narrower crop and makes a rebuild
    # appear not to have moved at all.
    bbox_tag = "_".join(str(round(value * 1000)) for value in bbox)
    color = cache / f"eoxcloudless_2024_{pixels}_{bbox_tag}.jpg"
    height = cache / f"copernicus_glo30_{pixels}_{bbox_tag}_meters.tif"

    if not color.exists():
        print("[chimborazo] fetching EOxCloudless 2024 source tiles")
        # Zoom 12 supplies roughly 38 m source pixels at the equator, closely
        # matching a 12288px equirectangular output across this 3.5-degree box.
        lon_min, lon_max, lat_min, lat_max = bbox
        imagery_bbox = (lon_min, lat_min, lon_max, lat_max)
        image, _, _ = fetch_xyz_mosaic(
            imagery_bbox, desired_px=pixels, zoom=12, max_workers=4,
            url_template=EOX_CLOUDLESS_2024,
            cache_dir=cache / "eox_xyz_tiles")
        image.save(color, quality=95, optimize=True)

    if not height.exists():
        print("[chimborazo] fetching Copernicus GLO-30 source tiles")
        lon_min, lon_max, lat_min, lat_max = bbox
        dem_dir = cache / "copernicus"
        sources: list[Path] = []
        for lat in range(math.floor(lat_min), math.ceil(lat_max)):
            for lon in range(math.floor(lon_min), math.ceil(lon_max)):
                name = _copernicus_name(lat, lon)
                path = dem_dir / f"{name}.tif"
                if not path.exists():
                    print(f"[chimborazo] downloading {name}", flush=True)
                    found = _download(f"{COPERNICUS_GLO30}/{name}/{name}.tif", path)
                    if not found:
                        print(f"[chimborazo] Copernicus tile absent (ocean): {name}")
                        continue
                sources.append(path)
        build_displacement_tile(
            sources,
            TileBounds(lon_min, lon_max, lat_min, lat_max),
            height,
            out_size=pixels,
            encode_xhr=False,
        )

    return color, height
