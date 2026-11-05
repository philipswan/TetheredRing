"""Ground cover for the generated close-up ground detail (src/planet/groundDetail.js).

Builds, for a region, a small georeferenced map of what the ground is made of: the kind of surface (lava, grass, forest,
cinder, sand, ...), how exposed the rock is, the kind of coast (beach, low rocky shore, cliff) and where the seasonal
snow lies. The renderer uses it to choose which generated texture and relief to add where the satellite imagery runs
out of detail; the imagery's own colour is kept (the detail only adds variation around it).

Sources (fetched into .cache/ground/, not committed):
  - Copernicus GLO-30 heights (copernicus-dem-30m on AWS), for slope, height and the coastline's relief.
  - ESA WorldCover 2021 10 m land cover (esa-worldcover on AWS), for what grows where.
  - The bake's own imagery (additional_earth_imagery/sources/hawaii_xhr_*.tif), for the colour of the ground: young
    black lava, old brown lava, red cinder, white and black sand.

POSIX:      .venv/bin/python -m tools.ground_cover hawaii
PowerShell: .venv\\Scripts\\python.exe -m tools.ground_cover hawaii
"""

from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'ground'
COPERNICUS = 'https://copernicus-dem-30m.s3.amazonaws.com'
WORLDCOVER = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map'


def _main_checkout() -> Path:
    """The main checkout (a worktree's sources live there: additional_earth_imagery is not in Git)."""
    git = ROOT / '.git'
    if git.is_file():  # a worktree: "gitdir: <main>/.git/worktrees/<name>"
        gitdir = Path(git.read_text().split(':', 1)[1].strip())
        return gitdir.parents[2]  # (<main>/.git/worktrees/<name>)
    return ROOT


IMAGERY_DIRS = [ROOT / 'additional_earth_imagery', _main_checkout() / 'additional_earth_imagery']


def _download(url: str, path: Path) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return True
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            data = r.read()
    except Exception:  # (Copernicus has no tile for all-ocean cells)
        return False
    tmp = path.with_suffix('.part')
    tmp.write_bytes(data)
    tmp.replace(path)
    return True


def copernicus_name(lat: int, lon: int) -> str:
    ns = f'N{lat:02d}' if lat >= 0 else f'S{-lat:02d}'
    ew = f'E{lon:03d}' if lon >= 0 else f'W{-lon:03d}'
    return f'Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM'


def fetch_copernicus(bbox) -> list[Path]:
    """The GLO-30 tiles over bbox (lon_min, lon_max, lat_min, lat_max) that exist."""
    paths = []
    for lat in range(math.floor(bbox[2]), math.ceil(bbox[3])):
        for lon in range(math.floor(bbox[0]), math.ceil(bbox[1])):
            name = copernicus_name(lat, lon)
            path = CACHE / f'{name}.tif'
            if _download(f'{COPERNICUS}/{name}/{name}.tif', path):
                paths.append(path)
    return paths


def worldcover_name(lat: int, lon: int) -> str:
    lat3, lon3 = 3 * math.floor(lat / 3), 3 * math.floor(lon / 3)
    ns = f'N{lat3:02d}' if lat3 >= 0 else f'S{-lat3:02d}'
    ew = f'E{lon3:03d}' if lon3 >= 0 else f'W{-lon3:03d}'
    return f'{ns}{ew}'


def fetch_worldcover(bbox) -> list[Path]:
    names = {worldcover_name(lat, lon)
             for lat in range(math.floor(bbox[2]), math.ceil(bbox[3]))
             for lon in range(math.floor(bbox[0]), math.ceil(bbox[1]))}
    paths = []
    for name in sorted(names):
        path = CACHE / f'wc_{name}.tif'
        if _download(f'{WORLDCOVER}/ESA_WorldCover_10m_2021_v200_{name}_Map.tif', path):
            paths.append(path)
    return paths


class DemReader:
    """Heights (m) from the Copernicus GLO-30 tiles, by latitude and longitude (bilinear)."""

    def __init__(self, bbox=(-156.2, -154.7, 18.8, 20.4)):
        import rasterio
        self.tiles = []
        for path in fetch_copernicus(bbox):
            with rasterio.open(path) as r:
                data = r.read(1).astype(np.float32)
                data[data < -1000] = 0
                self.tiles.append((r.bounds, r.res, data))

    def _tile(self, lat, lon):
        for bounds, res, data in self.tiles:
            if bounds.left <= lon < bounds.right and bounds.bottom <= lat < bounds.top:
                return bounds, res, data
        return None

    def height(self, lat, lon) -> float:
        t = self._tile(lat, lon)
        if t is None:
            return 0.0
        bounds, res, data = t
        x = (lon - bounds.left) / res[0] - 0.5
        y = (bounds.top - lat) / res[1] - 0.5
        x0, y0 = int(max(0, min(data.shape[1] - 2, math.floor(x)))), int(max(0, min(data.shape[0] - 2, math.floor(y))))
        fx, fy = min(1, max(0, x - x0)), min(1, max(0, y - y0))
        d = data[y0:y0 + 2, x0:x0 + 2]
        return float((d[0, 0] * (1 - fx) + d[0, 1] * fx) * (1 - fy) + (d[1, 0] * (1 - fx) + d[1, 1] * fx) * fy)

    def max_within(self, lat, lon, radius) -> float:
        """The highest ground within radius (m) of a point."""
        dlat = radius / 111320.0
        dlon = dlat / math.cos(math.radians(lat))
        n = max(2, int(radius / 15))
        best = -1e9
        for i in range(-n, n + 1):
            for j in range(-n, n + 1):
                if i * i + j * j <= n * n:
                    best = max(best, self.height(lat + dlat * i / n, lon + dlon * j / n))
        return best


# --- Sentinel-2 cloudless imagery (EOX), for telling the ground's kinds apart (not drawn) ----------------------------

EOX_CLOUDLESS_2024 = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'
S2_ZOOM = 14  # about 9 m pixels at the Big Island's latitude: Sentinel-2's own 10 m


def _mercator_xy(lon, lat, zoom):
    n = 2.0 ** zoom
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def fetch_s2(bbox, zoom=S2_ZOOM, workers=6):
    """The Sentinel-2 cloudless web-map tiles over bbox, cached in .cache/ground/s2/<z>/<x>/<y>.jpg."""
    from concurrent.futures import ThreadPoolExecutor
    x0, y0 = _mercator_xy(bbox[0], bbox[3], zoom)
    x1, y1 = _mercator_xy(bbox[1], bbox[2], zoom)
    jobs = [(x, y) for y in range(int(y0), int(y1) + 1) for x in range(int(x0), int(x1) + 1)]

    def get(xy):
        x, y = xy
        path = CACHE / 's2' / str(zoom) / str(x) / f'{y}.jpg'
        for attempt in range(4):
            if _download(EOX_CLOUDLESS_2024.format(z=zoom, x=x, y=y), path):
                return
        print(f'  failed {zoom}/{x}/{y}', flush=True)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, _ in enumerate(pool.map(get, jobs)):
            if i % 500 == 0:
                print(f'[s2] {i}/{len(jobs)}', flush=True)
    return (int(x0), int(y0), int(x1), int(y1))


class S2Reader:
    """Sentinel-2 cloudless colour (0..1 sRGB) at latitudes and longitudes, from the cached web-map tiles."""

    def __init__(self, zoom=S2_ZOOM):
        from PIL import Image
        self.Image = Image
        self.zoom = zoom
        self.tiles = {}

    def _tile(self, x, y):
        key = (x, y)
        t = self.tiles.get(key)
        if t is None:
            path = CACHE / 's2' / str(self.zoom) / str(x) / f'{y}.jpg'
            if path.exists():
                t = np.asarray(self.Image.open(path).convert('RGB'), dtype=np.float32) / 255.0
            else:
                t = np.zeros((256, 256, 3), np.float32)
            if len(self.tiles) > 600:
                self.tiles.clear()
            self.tiles[key] = t
        return t

    def sample(self, lat, lon):
        """lat, lon: 2-D arrays (degrees). Nearest pixel (the grids are close to Sentinel-2's own)."""
        n = 2.0 ** self.zoom
        px = (lon + 180.0) / 360.0 * n * 256.0
        py = (1.0 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2.0 * n * 256.0
        ix, iy = np.floor(px).astype(np.int64), np.floor(py).astype(np.int64)
        tx, ty = ix // 256, iy // 256
        out = np.zeros(lat.shape + (3,), np.float32)
        for x in np.unique(tx):
            for y in np.unique(ty[tx == x]):
                m = (tx == x) & (ty == y)
                t = self._tile(int(x), int(y))
                out[m] = t[iy[m] - y * 256, ix[m] - x * 256]
        return out


# --- The bake ---------------------------------------------------------------------------------------------------------

REGIONS = {
    # The Big Island: the whole island and 300+ m of sea around it.
    'hawaii': dict(bbox=(-156.2, -154.7, 18.8, 20.4), out='assets/hawaii_ground'),
}
# The Big Island's beaches, going round the island clockwise from the north (Upolu Point): (name, latitude,
# longitude, half-length along the coast in metres, sand). The points are approximate (snap_beaches moves each to
# the shore; Kehena, Waipio and Waialea were checked against published coordinates). Black-sand beaches look like
# lava from above, so they are
# listed; white ones are also found in the imagery (bright, low and gentle by the sea). Elsewhere the coast is low
# rocky lava shore, or cliffs where the ground rises more than 10 m within 30 m of the sea (the Hamakua coast, the
# Kohala valleys, Ka Lae, the Puna and Hilina coasts).
BEACHES = [
    ('Pololu', 20.2045, -155.7330, 250, 'black'),
    ('Honokane Nui', 20.1880, -155.7020, 120, 'black'),
    ('Waimanu', 20.1435, -155.6280, 250, 'black'),
    ('Waipio', 20.1197, -155.5930, 450, 'black'),
    ('Laupahoehoe', 19.9930, -155.2390, 60, 'black'),
    ('Kolekole', 19.8770, -155.1180, 40, 'black'),
    ('Honolii', 19.7580, -155.0890, 80, 'black'),
    ('Richardson', 19.7350, -155.0230, 60, 'black'),
    ('Isaac Hale (Pohoiki)', 19.4610, -154.8430, 80, 'black'),
    ('Kehena', 19.3948, -154.9290, 80, 'black'),
    ('Kaimu', 19.3610, -154.9720, 300, 'black'),
    ('Halape', 19.2710, -155.2530, 150, 'white'),
    ('Punaluu', 19.1365, -155.5050, 300, 'black'),
    ('Whittington', 19.0870, -155.5500, 80, 'black'),
    ('Papakolea (green)', 18.9360, -155.6460, 150, 'green'),
    ('Hookena', 19.3830, -155.8980, 200, 'grey'),
    ('Kealakekua (Napoopoo)', 19.4790, -155.9200, 60, 'grey'),
    ('Kahaluu', 19.5800, -155.9670, 120, 'grey'),
    ('White Sands (Laaloa)', 19.6090, -155.9760, 80, 'white'),
    ('Kamakahonu', 19.6400, -155.9970, 60, 'white'),
    ('Old Kona Airport', 19.6450, -155.9990, 300, 'white'),
    ('Kikaua Point', 19.8150, -155.9940, 50, 'white'),
    ('Mahaiula', 19.7840, -156.0350, 250, 'white'),
    ('Makalawena', 19.7950, -156.0300, 400, 'white'),
    ('Kua Bay (Maniniowali)', 19.8100, -156.0000, 120, 'white'),
    ('Kiholo Bay', 19.8570, -155.9280, 700, 'pebble'),
    ('Anaehoomalu (A-Bay)', 19.9130, -155.8890, 350, 'white'),
    ('Waialea (Beach 69)', 19.9820, -155.8280, 150, 'white'),
    ('Hapuna', 19.9915, -155.8260, 350, 'white'),
    ('Kaunaoa (Mauna Kea Beach)', 20.0010, -155.8250, 250, 'white'),
    ('Spencer', 20.0220, -155.8240, 120, 'white'),
]
# The sand's shade (the cover's shade channel: imagery brightness, which the renderer turns into the sand's colour).
SAND_SHADE = {'white': 0.32, 'grey': 0.12, 'black': 0.05, 'green': 0.09, 'pebble': 0.08}

CELLS_PER_DEGREE = 4000   # about 28 x 26 m cells at 20N
CHUNK_DEG = 0.1
FINE = 3                  # the coastline is found on a grid FINE times finer (ESA WorldCover's own 10 m)
COAST_SCALE = 2.0         # metres per unit of the coast channel (128 = the coastline)
HEIGHT_OFFSET, HEIGHT_SCALE = -6000.0, 0.2   # (from 6000 m below sea level, the deep sea round the island, to 7100 m)
HEIGHT_FIRST = 32768      # (the prediction of a chunk's first height sample, in HEIGHT_SCALE steps: the middle of the range)
CHANNELS = ['height', 'veg', 'tree', 'shrub', 'coast', 'rough', 'sand', 'cinder', 'built', 'cliff', 'shade']

# WorldCover classes
WC_TREE, WC_SHRUB, WC_GRASS, WC_CROP, WC_BUILT, WC_BARE, WC_SNOW, WC_WATER, WC_WETLAND, WC_MANGROVE, WC_MOSS = \
    10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100


class Mosaic:
    """A set of north-up EPSG:4326 rasters read as one, by window."""

    def __init__(self, paths):
        import rasterio
        self.sources = [rasterio.open(p) for p in paths]

    def read(self, lon0, lat1, res, w, h, fill=0, dtype=np.float32):
        """The w x h grid of cells res degrees wide from (lon0, lat1) (its north-west corner), nearest sample."""
        out = np.full((h, w), fill, dtype)
        lon = lon0 + (np.arange(w) + 0.5) * res
        lat = lat1 - (np.arange(h) + 0.5) * res
        for s in self.sources:
            b = s.bounds
            cols = np.floor((lon - b.left) / s.res[0]).astype(np.int64)
            rows = np.floor((b.top - lat) / s.res[1]).astype(np.int64)
            cm = (cols >= 0) & (cols < s.width)
            rm = (rows >= 0) & (rows < s.height)
            if not cm.any() or not rm.any():
                continue
            from rasterio.windows import Window
            c0, c1 = cols[cm].min(), cols[cm].max()
            r0, r1 = rows[rm].min(), rows[rm].max()
            data = s.read(1, window=Window(c0, r0, c1 - c0 + 1, r1 - r0 + 1))
            sub = data[np.ix_(rows[rm] - r0, cols[cm] - c0)]
            out[np.ix_(rm, cm)] = sub
        return out


def bilinear_dem(dem: 'Mosaic', lon0, lat1, res, w, h):
    """Heights at cell centres, bilinear from the GLO-30 posts (which are at whole arc-seconds)."""
    pad = 2
    step = 1 / 3600
    # The posts around the window.
    plon0 = math.floor((lon0) / step) * step - pad * step
    plat1 = math.ceil(lat1 / step) * step + pad * step
    pw = int(math.ceil(w * res / step)) + 2 * pad + 2
    ph = int(math.ceil(h * res / step)) + 2 * pad + 2
    # Posts are read as cells centred on them.
    posts = dem.read(plon0 - step / 2, plat1 + step / 2, step, pw, ph, fill=0)
    posts[posts < -1000] = 0
    lon = lon0 + (np.arange(w) + 0.5) * res
    lat = lat1 - (np.arange(h) + 0.5) * res
    fx = (lon - plon0) / step
    fy = (plat1 - lat) / step
    x0 = np.floor(fx).astype(int)
    y0 = np.floor(fy).astype(int)
    tx = (fx - x0)[None, :]
    ty = (fy - y0)[:, None]
    a = posts[np.ix_(y0, x0)]
    b = posts[np.ix_(y0, x0 + 1)]
    c = posts[np.ix_(y0 + 1, x0)]
    d = posts[np.ix_(y0 + 1, x0 + 1)]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def looks_like_sea(rgb, lum):
    """Sentinel-2 pixels that look like the sea: blue (blue above red: the open sea here is 0.08-0.24 bluer than red,
    the sea at the foot of the Hamakua cliffs 0.03-0.06, land and young lava -0.09 to 0.04), or the white of surf."""
    blue = (rgb[..., 2] - rgb[..., 0]) > 0.035
    surf = (lum > 0.22) & ((rgb.max(axis=-1) - rgb.min(axis=-1)) < 0.08)
    return blue | surf


def _block_mean(a, k):
    h, w = a.shape[0] // k, a.shape[1] // k
    return a[:h * k, :w * k].reshape(h, k, w, k, *a.shape[2:]).mean(axis=(1, 3))


def snap_beaches(dem, wc, s2, radius=1500.0):
    """BEACHES moved to the shoreline: each to the best point of the coast within `radius` metres of where it is
    listed (the list's points are approximate): low and gentle behind it, and bright for white sand."""
    from scipy import ndimage
    fres = 1.0 / (CELLS_PER_DEGREE * FINE)
    snapped = []
    for name, lat, lon, half, kind in BEACHES:
        mlat = 110574.0 + 1110 * math.sin(math.radians(lat)) ** 2
        mlon = 111320.0 * math.cos(math.radians(lat))
        k = int(radius / (fres * mlat)) + 4
        lon0, lat1 = lon - k * fres, lat + k * fres
        w = 2 * k
        wcf = wc.read(lon0, lat1, fres, w, w, fill=0, dtype=np.uint8)
        hf = bilinear_dem(dem, lon0, lat1, fres, w, w)
        LAT, LON = np.meshgrid(lat1 - (np.arange(w) + 0.5) * fres, lon0 + (np.arange(w) + 0.5) * fres, indexing='ij')
        lum = s2.sample(LAT, LON) @ np.array([0.2126, 0.7152, 0.0722], np.float32)  # noqa: F841 (used below)
        rgb = s2.sample(LAT, LON)
        sea = ((wcf == WC_WATER) | (wcf == 0)) & ((hf < 2) | ((hf < 40) & looks_like_sea(rgb, lum)))
        sea = ndimage.binary_opening(sea)
        shore = ~sea & ndimage.binary_dilation(sea, iterations=2)
        rise = ndimage.maximum_filter(np.where(sea, 0, hf), size=7)
        dist = np.hypot((LAT - lat) * mlat, (LON - lon) * mlon)
        cost = 2 * dist / radius + np.clip(rise - 8, 0, 30) / 6  # (the heights include trees: a beach can be backed by 8 m of them)
        if kind == 'white':
            cost -= 0.3 * np.clip((ndimage.uniform_filter(lum, 5) - 0.15) / 0.1, 0, 1)
        cost[~shore | (dist > radius)] = np.inf
        if not np.isfinite(cost).any():
            print(f'[ground] beach {name}: no shore within {radius:.0f} m; left out')
            continue
        y, x = np.unravel_index(np.argmin(cost), cost.shape)
        print(f'[ground] beach {name}: moved {dist[y, x]:.0f} m to the shore', flush=True)
        snapped.append((name, float(LAT[y, x]), float(LON[y, x]), half, kind))
    return snapped


def build(region: str, only=None):
    import zlib
    from scipy import ndimage
    cfg = REGIONS[region]
    bbox = cfg['bbox']
    out = ROOT / cfg['out']
    (out / 'chunks').mkdir(parents=True, exist_ok=True)
    dem = Mosaic(fetch_copernicus(bbox))
    wc = Mosaic(fetch_worldcover(bbox))
    fetch_s2(bbox)
    s2 = S2Reader()
    beaches = snap_beaches(dem, wc, s2) if region == 'hawaii' else []

    n = int(round(CHUNK_DEG * CELLS_PER_DEGREE))
    cols = int(round((bbox[1] - bbox[0]) / CHUNK_DEG))
    rows = int(round((bbox[3] - bbox[2]) / CHUNK_DEG))
    res = 1.0 / CELLS_PER_DEGREE
    fres = res / FINE
    margin = 40  # fine cells around each chunk (400 m), for the distances to the coast
    lat_mid = math.radians((bbox[2] + bbox[3]) / 2)
    m_per_deg_lat = 110574.0 + 1110 * math.sin(lat_mid) ** 2
    m_per_deg_lon = 111320.0 * math.cos(lat_mid)

    # The open sea, for the whole region (on the coarse grid): water that reaches the region's edge. (Inland water,
    # fishponds and the summit's lake are not sea.)
    print('[ground] open sea', flush=True)
    W, H = cols * n, rows * n
    water = np.zeros((H, W), bool)
    for j in range(rows):
        wcrow = wc.read(bbox[0], bbox[3] - j * CHUNK_DEG, fres, W * FINE, n * FINE, fill=0, dtype=np.uint8)
        frac = _block_mean(((wcrow == WC_WATER) | (wcrow == 0)).astype(np.float32), FINE)
        water[j * n:(j + 1) * n] = frac > 0.5
    labels, _ = ndimage.label(water)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    sea = np.isin(labels, edge[edge > 0])
    sea_near = ndimage.binary_dilation(sea, iterations=2)
    del labels, water

    chunks = []
    for j in range(rows):
        for i in range(cols):
            key = f'{i}_{j}'
            if only and key not in only:
                continue
            ys, xs = j * n, i * n
            # (Open sea too: every chunk of the region, so every generated tile's heights, sea floor included, come
            # from one source and agree where tiles meet.)
            lon0 = bbox[0] + i * CHUNK_DEG
            lat1 = bbox[3] - j * CHUNK_DEG
            data = bake_chunk(lon0, lat1, n, res, fres, margin, dem, wc, s2, sea_near, (xs, ys),
                              m_per_deg_lat, m_per_deg_lon, ndimage, beaches)
            (out / 'chunks' / f'{key}.bin').write_bytes(zlib.compress(data, 9))
            chunks.append(key)
            print(f'[ground] chunk {key} ({len(chunks)})', flush=True)

    if only and (out / 'manifest.json').exists():
        manifest = json.loads((out / 'manifest.json').read_text())
        chunks = sorted(set(manifest['chunks']) | set(chunks))
    manifest = {
        'version': 2,
        'bbox': list(bbox),
        'cellsPerDegree': CELLS_PER_DEGREE,
        'chunkCells': n,
        'channels': CHANNELS,
        'heightOffset': HEIGHT_OFFSET,
        'heightScale': HEIGHT_SCALE,
        'heightFirst': HEIGHT_FIRST,
        'coastScale': COAST_SCALE,
        'chunks': sorted(chunks),
        'attribution': 'Copernicus GLO-30 DEM; ESA WorldCover 2021; Sentinel-2 cloudless 2024 by EOX (contains '
                       'modified Copernicus Sentinel data)',
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(f'[ground] {len(chunks)} chunks in {out}')


def bake_chunk(lon0, lat1, n, res, fres, margin, dem, wc, s2, sea_near, origin, mlat, mlon, ndimage, beaches):
    nf = n * FINE
    wf = nf + 2 * margin
    flon0 = lon0 - margin * fres
    flat1 = lat1 + margin * fres
    # Fine grid (10 m) with the margin.
    wcf = wc.read(flon0, flat1, fres, wf, wf, fill=0, dtype=np.uint8)
    hf = bilinear_dem(dem, flon0, flat1, fres, wf, wf)
    lat = flat1 - (np.arange(wf) + 0.5) * fres
    lon = flon0 + (np.arange(wf) + 0.5) * fres
    LAT, LON = np.meshgrid(lat, lon, indexing='ij')
    rgb = s2.sample(LAT, LON)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)

    # The sea on the fine grid: WorldCover's water (or no data) where the coarse open sea is near.
    xs, ys = origin
    m3 = margin // FINE
    H, W = sea_near.shape
    near = np.zeros((n + 2 * m3 + 2, n + 2 * m3 + 2), bool)
    sy0, sx0 = ys - m3 - 1, xs - m3 - 1
    yy0, xx0 = max(0, sy0), max(0, sx0)
    yy1, xx1 = min(H, sy0 + near.shape[0]), min(W, sx0 + near.shape[1])
    near[:] = True  # (beyond the region: sea)
    near[yy0 - sy0:yy1 - sy0, xx0 - sx0:xx1 - sx0] = sea_near[yy0:yy1, xx0:xx1]
    near_f = np.repeat(np.repeat(near, FINE, 0), FINE, 1)
    off = FINE - margin % FINE if margin % FINE else FINE
    near_f = near_f[off:off + wf, off:off + wf]
    # (At sea level by the heights; or, up to 40 m where the 30 m heights smear a sea cliff out over the sea, looking
    # like the sea: WorldCover takes young black lava, standing on old land, for water, Kiholo's 1859 flow and
    # Keahole's among them.)
    bluish = (rgb[..., 2] - rgb[..., 0]) > 0.0  # (not the grey of new lava on what was sea: Kapoho's 2018 flow)
    seaf = ((wcf == WC_WATER) | (wcf == 0)) & near_f & (((hf < 2) & bluish) | ((hf < 40) & looks_like_sea(rgb, lum)))
    # Small specks of land or sea (surf, boats, a 10 m pixel of reef) are noise.
    seaf = ndimage.binary_opening(seaf, iterations=1) | (seaf & ~ndimage.binary_opening(~seaf, iterations=1))

    # Signed distance to the coastline, metres, positive on land.
    sampling = (fres * mlat, fres * mlon)
    d_land = ndimage.distance_transform_edt(~seaf, sampling=sampling)
    d_sea = ndimage.distance_transform_edt(seaf, sampling=sampling)
    sdf = np.where(seaf, -d_sea + 0.5 * sampling[0], d_land - 0.5 * sampling[0]).astype(np.float32)

    # Cliffs: how high the coast rises right behind the shoreline (m), the highest ground within 60 m inland of the
    # nearest point of the coastline, where it rises more than 10 m within 30 m (a gentle slope rising as far within
    # 60 m is not a cliff); carried to every cell from its nearest coastline point.
    land = ~seaf
    rise60 = ndimage.maximum_filter(np.where(land, hf, 0), size=13)  # +-60 m
    rise30 = ndimage.maximum_filter(np.where(land, hf, 0), size=7)   # +-30 m
    shore = land & (sdf < 15)
    if shore.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~shore, sampling=sampling, return_indices=True)
        cliff_h = np.where(rise30[iy, ix] > 10, rise60[iy, ix], 0)
        shore_iy, shore_ix = iy, ix
    else:
        cliff_h = np.zeros_like(hf)
        shore_iy = shore_ix = None

    # Slope of the 30 m terrain (rise over run).
    gy, gx = np.gradient(ndimage.uniform_filter(hf, 3), sampling[0], sampling[1])
    slope = np.hypot(gx, gy)

    def frac(*classes):
        return np.isin(wcf, classes).astype(np.float32)

    tree = frac(WC_TREE, WC_MANGROVE)
    shrub = frac(WC_SHRUB)
    veg = frac(WC_TREE, WC_SHRUB, WC_GRASS, WC_CROP, WC_WETLAND, WC_MANGROVE) + 0.5 * frac(WC_MOSS)
    built = frac(WC_BUILT)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # WorldCover calls much of the leeward dry grass and kiawe scrub (tan in the imagery) bare. Bare lava is dark and
    # grey; dry grass is lighter and tan, green vegetation green. Above about 2800 m tan is cinder and ash, not grass.
    # (Dark lava is a slightly greenish grey in Sentinel-2: green has to stand clear of both red and blue.)
    tan = np.clip((lum - 0.13) / 0.06, 0, 1) * np.clip((r - b - 0.03) / 0.06, 0, 1)
    green = np.clip((g - np.maximum(r, b) - 0.012) / 0.03, 0, 1) * np.clip((lum - 0.04) / 0.04, 0, 1)
    below_tree_line = np.clip((3000 - hf) / 400, 0, 1)
    grassy = np.maximum(tan * 0.85, green) * below_tree_line * (hf > 1)
    veg = np.maximum(veg, grassy * (1 - built))
    bare = np.clip(1 - veg - built, 0, 1)
    redness = np.clip((r - b) / np.maximum(r + g + b, 0.05) * 3.0, 0, 1)
    # Sand: bare, near the sea, low and gentle; or bright and low anywhere on the coast.
    # (The Big Island's beaches are narrow: low bright ground further inland is pahoehoe.)
    coastal = np.clip(1 - (sdf - 25) / 40, 0, 1) * (sdf > -30)
    low = np.clip(1 - (hf - 4) / 8, 0, 1)
    gentle = np.clip(1 - (slope - 0.08) / 0.12, 0, 1)
    # (White coral sand is the brightest thing on the coast; sunlit surf and pale coral rubble come close, so only
    # wide enough bright stretches count: four 10 m pixels of five.)
    # White sand: bright on dry land behind the shoreline (not the surf on it), wide enough, below a low coast (not a
    # cliff) and not built on; then carried down to the water's edge.
    bright = np.clip((lum - 0.24) / 0.08, 0, 1) * (rgb.min(axis=-1) > 0.14) * (sdf > 8)
    bright = np.minimum(bright, ndimage.uniform_filter(bright, 5) * 1.25)
    # (Coral sand is a west coast thing, Kohala and Kona: elsewhere the bright shore is surf on rock, or listed.)
    west = (LON < -155.79) & (LAT > 19.15)
    core = coastal * low * gentle * bright * np.clip(bare + 0.3, 0, 1) * (cliff_h < 9) * (1 - built) * west
    sand = ndimage.maximum_filter(core, size=5) * ((sdf > -30) & (sdf < 70)) * (1 - built)
    shade_fix = np.full(hf.shape, -1.0, np.float32)
    beach_w = np.zeros(hf.shape, np.float32)
    # The listed beaches, along the coast within their half-lengths of their points.
    for name, blat, blon, half, kind in beaches:
        dy = (LAT - blat) * mlat
        dx = (LON - blon) * mlon
        if (np.hypot(dy, dx) > half + 200).all():
            continue
        if shore_iy is not None:
            # (By the distance of each cell's nearest shoreline point from the beach's point.)
            sy, sx = shore_iy, shore_ix
            along = np.hypot(dy[sy, sx], dx[sy, sx])
        else:
            along = np.hypot(dy, dx)
        on = (along < half) & (sdf > -40) & (sdf < 70) & (hf < 15)
        weight = np.clip((half - along) / 40, 0, 1) * np.clip(1 - (sdf - 45) / 25, 0, 1) * on
        sand = np.maximum(sand, weight)
        beach_w = np.maximum(beach_w, weight)
        shade_fix = np.where(weight > 0.05, SAND_SHADE[kind], shade_fix)
        cliff_h = np.where(weight > 0.3, np.minimum(cliff_h, 4), cliff_h)
    # (The vegetation behind a listed beach stops at its sand.)
    veg, tree, shrub = veg * (1 - beach_w), tree * (1 - beach_w), shrub * (1 - beach_w)
    bare = np.clip(1 - veg - built, 0, 1)
    # Cinder and tephra: bare, reddish, or high on the mountains (the summits are cinder cones and ash).
    high = np.clip((hf - 2800) / 600, 0, 1)
    cinder = bare * np.clip(np.maximum(redness * np.clip((hf - 300) / 500, 0, 1), high * 0.85), 0, 1) * (1 - sand)
    # Rough (a'a) or smooth (pahoehoe) lava where bare: a'a is darker and coarser-textured in the imagery.
    tex = np.sqrt(np.maximum(ndimage.uniform_filter(lum * lum, 5) - ndimage.uniform_filter(lum, 5) ** 2, 0))
    rough = np.clip(0.5 + (tex - 0.025) * 12 + (0.10 - lum) * 3, 0, 1)

    # Down to the chunk's cells (the margin off, FINE x FINE fine cells each).
    def coarse(a):
        return _block_mean(a[margin:margin + nf, margin:margin + nf], FINE)

    height = bilinear_dem(dem, lon0, lat1, res, n, n)
    # Over the sea, the sea floor (the planet source data's GEBCO bathymetry): Copernicus has only the sea's surface.
    # Every generated tile then takes the same sea floor, whichever baked tile it came from.
    sea_c = coarse(seaf.astype(np.float32)) > 0.5
    if sea_c.any():
        height = np.where(sea_c, np.clip(bathymetry(lon0, lat1, res, n), HEIGHT_OFFSET, -1.0), height)
    sdf_c = coarse(sdf)
    planes = {
        'veg': coarse(veg), 'tree': coarse(tree), 'shrub': coarse(shrub),
        'coast': np.clip(np.round(128 + sdf_c / COAST_SCALE), 0, 255),
        'rough': coarse(rough), 'sand': coarse(sand), 'cinder': coarse(cinder), 'built': coarse(built),
        'cliff': np.clip(coarse(cliff_h), 0, 255), 'shade': coarse(np.where(shade_fix >= 0, shade_fix, lum)),
    }
    # (For size: the shade is only used for the coast's sand, and roughness and cinder are smooth estimates, kept to
    # 16 levels.)
    planes['shade'] = np.where(sdf_c < 300, planes['shade'], 0)
    for name in ('rough', 'cinder'):
        planes[name] = np.round(ndimage.uniform_filter(planes[name], 3) * 15) / 15
    parts = [encode_heights(height)]
    for name in CHANNELS[1:]:
        a = planes[name]
        if name not in ('coast', 'cliff'):
            a = np.clip(np.round(a * 255), 0, 255)
        parts.append(a.astype(np.uint8).tobytes())
    return b''.join(parts)


def bathymetry(lon0, lat1, res, n):
    """Heights (m) at the centres of an n x n grid of cells res degrees wide from (lon0, lat1), bilinear from the
    planet source data's 7.5" elevation (GMTED on land, GEBCO under the sea; tools/sources)."""
    import rasterio
    from rasterio.windows import Window
    from scipy import ndimage
    path = next((d / 'sources' / 'elevation_7.5s.tif' for d in IMAGERY_DIRS if (d / 'sources' / 'elevation_7.5s.tif').exists()), None)
    if path is None:
        raise FileNotFoundError('additional_earth_imagery/sources/elevation_7.5s.tif (tools/sources build_elevation)')
    with rasterio.open(path) as r:
        step = r.res[0]
        c0 = int(math.floor((lon0 - r.bounds.left) / step)) - 2
        r0 = int(math.floor((r.bounds.top - lat1) / step)) - 2
        size = int(math.ceil(n * res / step)) + 5
        data = r.read(1, window=Window(c0, r0, size, size)).astype(np.float32)
    lon = lon0 + (np.arange(n) + 0.5) * res
    lat = lat1 - (np.arange(n) + 0.5) * res
    x = (lon - (-180.0)) / step - 0.5 - c0
    y = (90.0 - lat) / step - 0.5 - r0
    Y, X = np.meshgrid(y, x, indexing='ij')
    return ndimage.map_coordinates(data, [Y, X], order=1, mode='nearest')


def encode_heights(height):
    """The height plane: each sample (HEIGHT_SCALE steps above HEIGHT_OFFSET) less its prediction from the samples to
    its west, north and north-west (west + north - north-west; the first row and column from the one before, the first
    sample from HEIGHT_FIRST), zigzag
    coded (0, -1, 1, -2, ... -> 0, 1, 2, 3, ...), as a plane of low bytes then a plane of high bytes."""
    h = np.clip(np.round((height - HEIGHT_OFFSET) / HEIGHT_SCALE), 0, 65535).astype(np.int64)
    r = h.copy()
    r[0, 0] = h[0, 0] - HEIGHT_FIRST
    r[0, 1:] = h[0, 1:] - h[0, :-1]
    r[1:, 0] = h[1:, 0] - h[:-1, 0]
    r[1:, 1:] = h[1:, 1:] - h[1:, :-1] - h[:-1, 1:] + h[:-1, :-1]
    z = np.where(r >= 0, 2 * r, -2 * r - 1)
    assert z.max() < 65536
    return (z & 255).astype(np.uint8).tobytes() + (z >> 8).astype(np.uint8).tobytes()


def decode_heights(raw, n):
    z = np.frombuffer(raw[:n * n], np.uint8).astype(np.int64) + (np.frombuffer(raw[n * n:2 * n * n], np.uint8).astype(np.int64) << 8)
    z = z.reshape(n, n)
    r = np.where(z & 1, -(z + 1) // 2, z // 2)
    h = np.zeros((n, n), np.int64)
    r = r.copy()
    r[0, 0] += HEIGHT_FIRST
    h[0] = np.cumsum(r[0])
    h[1:, 0] = h[0, 0] + np.cumsum(r[1:, 0])
    for y in range(1, n):
        # h[y, x] = r + h[y, x-1] + h[y-1, x] - h[y-1, x-1]  =>  h[y] - h[y-1] = cumsum of r[y] (with the first column)
        d = np.cumsum(np.concatenate([[h[y, 0] - h[y - 1, 0]], r[y, 1:]]))
        h[y] = h[y - 1] + d
    return h * HEIGHT_SCALE + HEIGHT_OFFSET


def read_chunk(region, key):
    """A baked chunk's planes: {'height': float metres, channel: uint8}."""
    import zlib
    out = ROOT / REGIONS[region]['out']
    n = int(round(CHUNK_DEG * CELLS_PER_DEGREE))
    raw = zlib.decompress((out / 'chunks' / f'{key}.bin').read_bytes())
    planes = {'height': decode_heights(raw, n)}
    for k, name in enumerate(CHANNELS[1:]):
        planes[name] = np.frombuffer(raw[n * n * (2 + k):n * n * (3 + k)], np.uint8).reshape(n, n)
    return planes


def preview(region, keys, folder):
    from PIL import Image
    folder.mkdir(parents=True, exist_ok=True)
    for key in keys:
        p = read_chunk(region, key)
        h = p['height']
        Image.fromarray(np.clip(h / max(1, h.max()) * 255, 0, 255).astype(np.uint8)).save(folder / f'{key}_height.png')
        for name in CHANNELS[1:]:
            Image.fromarray(p[name]).save(folder / f'{key}_{name}.png')
        # A false-colour summary: red = bare lava (rough brighter), green = vegetation, blue = sand; coastline white.
        rgb = np.zeros(h.shape + (3,), np.uint8)
        rgb[..., 1] = p['veg']
        rgb[..., 0] = np.clip(255 - p['veg'].astype(int) - p['sand'], 0, 255) * (0.5 + p['rough'] / 510)
        rgb[p['coast'] < 128] = (0, 0, 60)
        rgb[..., 2] = np.maximum(p['sand'], p['cinder'] // 2)
        rgb[np.abs(p['coast'].astype(int) - 128) <= 1] = 255
        cliff = (p['cliff'] > 15) & (np.abs(p['coast'].astype(int) - 128) < 10)
        rgb[cliff] = (255, 255, 0)
        Image.fromarray(rgb).save(folder / f'{key}_summary.png')


if __name__ == '__main__':
    import argparse
    import json  # noqa: F401
    parser = argparse.ArgumentParser(description='Bake the ground cover for a region (see the module docstring).')
    parser.add_argument('region', choices=sorted(REGIONS))
    parser.add_argument('--only', help='comma-separated chunk keys (i_j) to rebake')
    parser.add_argument('--preview', help='write PNG previews of these chunks\' planes into this folder (no bake)')
    args = parser.parse_args()
    if args.preview:
        preview(args.region, args.only.split(','), Path(args.preview))
        raise SystemExit
    build(args.region, only=set(args.only.split(',')) if args.only else None)
