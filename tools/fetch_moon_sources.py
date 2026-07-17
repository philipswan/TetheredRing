"""Fetch the global NASA CGI Moon Kit sources used by the Moon tile baker."""

from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


COLOR_URL = (
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
    'lroc_color_poles_8k.tif'
)
HEIGHT_URL = (
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
    'ldem_16.tif'
)
HIGH_COLOR_URL = (
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
    'lroc_color_poles_16k.tif'
)
HIGH_HEIGHT_URL = (
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
    'ldem_64.tif'
)


def _download(url: str, destination: Path) -> None:
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + '.part')
    request = Request(url, headers={'User-Agent': 'TetheredRing lunar asset builder'})
    try:
        with urlopen(request, timeout=120) as response, partial.open('wb') as output:
            total = int(response.headers.get('Content-Length', 0))
            received = 0
            next_report = 32 * 1024 * 1024
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                output.write(block)
                received += len(block)
                if received >= next_report:
                    suffix = f' / {total / 1048576:.0f} MiB' if total else ''
                    print(f'[moon] downloaded {received / 1048576:.0f}{suffix} MiB')
                    next_report += 32 * 1024 * 1024
        partial.replace(destination)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise


def prepare_sources(root: Path) -> tuple[Path, Path]:
    """Return an RGB TIFF and a float TIFF whose elevation units are meters."""
    source_dir = root / '.cache' / 'adaptive_lod' / 'moon'
    color = source_dir / 'lroc_color_poles_8k.tif'
    height_km = source_dir / 'ldem_16_km.tif'
    height_m = source_dir / 'ldem_16_m.tif'

    print('[moon] fetching NASA LRO color mosaic')
    _download(COLOR_URL, color)
    print('[moon] fetching NASA LOLA elevation model')
    _download(HEIGHT_URL, height_km)

    if not height_m.exists():
        print('[moon] converting LOLA heights from kilometers to meters')
        kilometers = np.asarray(Image.open(height_km), dtype=np.float32)
        meters = np.ascontiguousarray(kilometers * 1000.0)
        Image.fromarray(meters, mode='F').save(height_m, compression='tiff_lzw')
        del kilometers, meters

    return color, height_m


def _crop_equirectangular(image: Image.Image, bbox: tuple[float, float, float, float]) -> Image.Image:
    lon_min, lon_max, lat_min, lat_max = bbox
    width, height = image.size
    left = max(0, int(np.floor((lon_min + 180.0) / 360.0 * width)))
    right = min(width, int(np.ceil((lon_max + 180.0) / 360.0 * width)))
    top = max(0, int(np.floor((90.0 - lat_max) / 180.0 * height)))
    bottom = min(height, int(np.ceil((90.0 - lat_min) / 180.0 * height)))
    return image.crop((left, top, right, bottom))


def prepare_korolev_sources(
    root: Path, bbox: tuple[float, float, float, float]
) -> tuple[Path, Path, tuple[float, float, float, float]]:
    """Prepare cropped 16K LROC color and LDEM64 elevation around Korolev."""
    source_dir = root / '.cache' / 'adaptive_lod' / 'moon'
    color_global = source_dir / 'lroc_color_poles_16k.tif'
    height_global = source_dir / 'ldem_64_km.tif'
    tag = '_'.join(str(round(value * 1000)) for value in bbox)
    color_crop = source_dir / f'korolev_color_16k_{tag}.tif'
    height_crop = source_dir / f'korolev_ldem64_m_{tag}.tif'

    print('[moon-korolev] fetching NASA 16K LRO color mosaic')
    _download(HIGH_COLOR_URL, color_global)
    print('[moon-korolev] fetching NASA LDEM64 elevation model')
    _download(HIGH_HEIGHT_URL, height_global)

    # Record the exact pixel-aligned bounds so the tile sampler maps the cropped
    # pixels back to their source coordinates without a half-pixel drift.
    with Image.open(color_global) as image:
        width, height = image.size
        lon_min, lon_max, lat_min, lat_max = bbox
        left = max(0, int(np.floor((lon_min + 180.0) / 360.0 * width)))
        right = min(width, int(np.ceil((lon_max + 180.0) / 360.0 * width)))
        top = max(0, int(np.floor((90.0 - lat_max) / 180.0 * height)))
        bottom = min(height, int(np.ceil((90.0 - lat_min) / 180.0 * height)))
        exact_bbox = (
            left / width * 360.0 - 180.0,
            right / width * 360.0 - 180.0,
            90.0 - bottom / height * 180.0,
            90.0 - top / height * 180.0,
        )
        if not color_crop.exists():
            image.crop((left, top, right, bottom)).convert('RGB').save(color_crop)

    if not height_crop.exists():
        with Image.open(height_global) as image:
            cropped = _crop_equirectangular(image, exact_bbox)
            meters = np.asarray(cropped, dtype=np.float32).copy() * 1000.0
            Image.fromarray(meters, mode='F').save(height_crop, compression='tiff_lzw')

    return color_crop, height_crop, exact_bbox
