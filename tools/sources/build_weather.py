"""Weather climatology for the clouds, rain and haze (src/physics/weather.js): for each calendar month,
on a regular GRID_DEG grid (the same as the wind's, tools/sources/build_wind.py), the cloud cover and
its spread, the low and high clouds' heights, how often and how hard it rains, and the humidity.

Source: NCEP/NCAR Reanalysis 1, 6-hourly fields on the T62 Gaussian grid (~1.9 degrees) from NOAA PSL
(https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html), downloaded once into
additional_earth_imagery/weather/ncep/ (no login needed):
  tcdc.eatm         total cloud cover (%)
  pres.lcb/lct      pressure at the low cloud layer's base and top (Pa; missing where there is none)
  pres.mcb/mct      pressure at the middle cloud layer's base and top
  pres.hcb/hct      pressure at the high cloud layer's base and top
  lftx.sfc          the surface lifted index (K; 2.5-degree grid, from surface/): how unstable the air is
  prate, cprat      precipitation rate, and its convective part (kg/m^2/s = mm/s)
  shum.2m, air.2m, pres.sfc   specific humidity, temperature and pressure near the surface
Kalnay et al. (1996), The NCEP/NCAR 40-year reanalysis project, Bull. Amer. Meteor. Soc., 77, 437-470.

For each month, over YEARS, at every source cell:
  cover, coverSd          mean total cloud cover (0..1) and its standard deviation;
  coverCos, coverSin      the first harmonic of its daily cycle in UTC hours;
  lowBase, lowTop         mean heights (km) of the low cloud layer's base and top, where there is one;
  midFreq, midBase, midTop  how often there is a middle cloud layer, and the mean heights (km) of its
                          base and top, where there is one;
  highFreq, highBase      how often there is high cloud, and the mean height (km) of its base;
  highTop                 the mean height (km) of the high cloud's top, where there is some;
  stability               the mean surface lifted index (K): negative where the air near the surface is
                          unstable (cumulus, showers), positive where it is stable (stratus, stratocumulus);
  st, sc, cu, cb, ns, as_, ac, hi   the real world's mean amount (0..1 of the sky) of each cloud type, from
                          surface observations (tools/sources/cloud_types.py; stratus includes fog);
  scWhen, cuWhen, cbWhen, acWhen, asWhen, hiWhen   how much of the sky each covers when it is there;
  ground                  the mean height (km) of the ground (0 over the sea) over the cell, from the land
                          elevation (tools/sources/build_land_elevation.py's GeoTIFF): the clouds keep above it
                          (the reanalysis's cloud heights, averaged over cells, put low cloud under plateaus).
  rainFreq, rainRate      how often it rains (over 0.1 mm/h) and the mean rate then (mm/h);
  convective              the convective share of the rain;
  humidity, humiditySd    mean relative humidity near the surface (0..1) and its standard deviation.
Heights are from pressure by the standard atmosphere. These are averaged over GRID_DEG cells around
the grid's nodes (cos(latitude) weighted; heights only where there were clouds), as for the wind.

Output: src/physics/weatherClimatology.data.js, a module exporting the grid's description and its
values as base64 int8 (times each field's scale), laid out [month][row][column][field].

    .venv/bin/python -m tools.sources.build_weather
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import netCDF4
import numpy as np

from tools.sources.build_wind import fetch_file

ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = ROOT / 'additional_earth_imagery' / 'weather' / 'ncep'
OUT = ROOT / 'src' / 'physics' / 'weatherClimatology.data.js'
BASE_URL = 'https://psl.noaa.gov/thredds/fileServer/Datasets/ncep.reanalysis'
YEARS = range(2022, 2024)
GRID_DEG = 5
RAIN_THRESHOLD = 0.1 / 3600  # mm/s
# (name, scale): value = int8 * scale.
FIELDS = [
    ('cover', 1 / 125), ('coverSd', 1 / 125), ('coverCos', 1 / 250), ('coverSin', 1 / 250),
    ('lowBase', 0.05), ('lowTop', 0.05), ('highFreq', 1 / 125), ('highBase', 0.125),
    ('rainFreq', 1 / 125), ('rainRate', 0.1), ('convective', 1 / 125),
    ('humidity', 1 / 125), ('humiditySd', 1 / 125),
    ('midFreq', 1 / 125), ('midBase', 0.1), ('midTop', 0.1), ('highTop', 0.125), ('stability', 0.3),
    ('st', 1 / 125), ('sc', 1 / 125), ('cu', 1 / 125), ('cb', 1 / 125),
    ('ns', 1 / 125), ('as_', 1 / 125), ('ac', 1 / 125), ('hi', 1 / 125),
    ('ground', 0.05), ('scWhen', 1 / 125), ('cuWhen', 1 / 125), ('cbWhen', 1 / 125), ('acWhen', 1 / 125), ('asWhen', 1 / 125), ('hiWhen', 1 / 125),
]
# (The fields from surface observations of cloud types, filled in separately: see cloud_type_fields.)
CLOUD_TYPE_FIELDS = ['st', 'sc', 'cu', 'cb', 'ns', 'as_', 'ac', 'hi', 'scWhen', 'cuWhen', 'cbWhen', 'acWhen', 'asWhen', 'hiWhen']
SOURCES = {
    'tcdc': 'other_gauss/tcdc.eatm.gauss', 'lcb': 'other_gauss/pres.lcb.gauss', 'lct': 'other_gauss/pres.lct.gauss',
    'hcb': 'other_gauss/pres.hcb.gauss', 'hct': 'other_gauss/pres.hct.gauss',
    'mcb': 'other_gauss/pres.mcb.gauss', 'mct': 'other_gauss/pres.mct.gauss', 'lftx': 'surface/lftx.sfc', 'prate': 'surface_gauss/prate.sfc.gauss', 'cprat': 'surface_gauss/cprat.sfc.gauss',
    'shum': 'surface_gauss/shum.2m.gauss', 'air': 'surface_gauss/air.2m.gauss', 'pres': 'surface_gauss/pres.sfc.gauss',
}


def load(key: str):
    """All of YEARS for one source: values (time, lat, lon; NaN where missing), times (hours since 1800),
    months, UTC hours, lats, lons."""
    values, times, months, hours = [], [], [], []
    for year in YEARS:
        path = f'{SOURCES[key]}.{year}.nc'
        with netCDF4.Dataset(fetch_file(f'{BASE_URL}/{path}', DOWNLOADS / Path(path).name)) as ds:
            name = [v for v in ds.variables if ds.variables[v].ndim == 3][0]
            t = ds.variables['time']
            valid = ~np.ma.getmaskarray(t[:])  # (a few records have no time: they are left out)
            values.append(np.ma.filled(ds.variables[name][:].astype(np.float64), np.nan)[valid])
            times.append(np.ma.getdata(t[:])[valid])
            dates = netCDF4.num2date(times[-1], t.units, only_use_cftime_datetimes=False)
            months += [d.month for d in dates]
            hours += [d.hour + d.minute / 60 for d in dates]
            lats = np.asarray(ds.variables['lat'][:], dtype=np.float64)
            lons = np.asarray(ds.variables['lon'][:], dtype=np.float64)
    return np.concatenate(values), np.concatenate(times), np.array(months), np.array(hours), lats, lons


def height_km(pressure_pa):
    return 44.3308 * (1 - (pressure_pa / 101325) ** 0.190263)


def relative_humidity(q, temperature_k, pressure_pa):
    vapour = q * pressure_pa / (0.622 + 0.378 * q)
    saturation = 611.2 * np.exp(17.67 * (temperature_k - 273.15) / (temperature_k - 29.65))
    return np.clip(vapour / saturation, 0, 1)


def month_stats(d, hours):
    """Per source cell, FIELDS (with the standard deviations as variances, for averaging), and a weight
    per field for averaging it (heights only count where there were clouds)."""
    w = 2 * np.pi * hours / 24
    c, s = np.cos(w)[:, None, None], np.sin(w)[:, None, None]
    cover = d['tcdc'] / 100
    mean = cover.mean(axis=0)
    with np.errstate(invalid='ignore'):
        low = ~np.isnan(d['lcb']) & ~np.isnan(d['lct'])
        high = ~np.isnan(d['hcb'])
        mid = ~np.isnan(d['mcb']) & ~np.isnan(d['mct'])
        high_top = high & ~np.isnan(d['hct'])
        raining = d['prate'] > RAIN_THRESHOLD
        rain_count = raining.sum(axis=0)
        fields = {
            'cover': mean,
            'coverSd': cover.var(axis=0),
            'coverCos': 2 * ((cover - mean) * c).mean(axis=0),
            'coverSin': 2 * ((cover - mean) * s).mean(axis=0),
            'lowBase': np.nanmean(np.where(low, height_km(d['lcb']), np.nan), axis=0),
            'lowTop': np.nanmean(np.where(low, height_km(d['lct']), np.nan), axis=0),
            'highFreq': high.mean(axis=0),
            'highBase': np.nanmean(np.where(high, height_km(d['hcb']), np.nan), axis=0),
            'midFreq': mid.mean(axis=0),
            'midBase': np.nanmean(np.where(mid, height_km(d['mcb']), np.nan), axis=0),
            'midTop': np.nanmean(np.where(mid, height_km(d['mct']), np.nan), axis=0),
            'highTop': np.nanmean(np.where(high_top, height_km(d['hct']), np.nan), axis=0),
            'stability': np.nanmean(d['lftx'], axis=0),
            'rainFreq': raining.mean(axis=0),
            'rainRate': np.where(rain_count > 0, np.where(raining, d['prate'], 0).sum(axis=0) / np.maximum(rain_count, 1) * 3600, 0),
            'convective': np.where(d['prate'].sum(axis=0) > 0, d['cprat'].sum(axis=0) / np.maximum(d['prate'].sum(axis=0), 1e-12), 0),
        }
        for name in CLOUD_TYPE_FIELDS:
            fields[name] = np.zeros_like(mean)  # (filled in from surface observations later: see main)
        fields['ground'] = np.zeros_like(mean)  # (and from the land elevation)
        rh = relative_humidity(d['shum'], d['air'], d['pres'])
        fields['humidity'] = rh.mean(axis=0)
        fields['humiditySd'] = rh.var(axis=0)
    weights = {name: np.ones_like(mean) for name, _ in FIELDS}
    weights['lowBase'] = weights['lowTop'] = low.sum(axis=0).astype(np.float64)
    weights['highBase'] = high.sum(axis=0).astype(np.float64)
    weights['midBase'] = weights['midTop'] = mid.sum(axis=0).astype(np.float64)
    weights['highTop'] = high_top.sum(axis=0).astype(np.float64)
    weights['rainRate'] = rain_count.astype(np.float64)
    weights['convective'] = np.nan_to_num(d['prate']).sum(axis=0)
    return fields, weights


def regrid(fields, weights, lats, lons):
    """Weighted averages over GRID_DEG cells around each node of the output grid (cos(latitude) times
    the field's own weights); standard deviations from the averaged variances. Heights where no cell
    had clouds take the grid's median for that field and month."""
    rows, cols = 180 // GRID_DEG + 1, 360 // GRID_DEG
    out = np.zeros((rows, cols, len(FIELDS)))
    weight_lat = np.cos(np.radians(lats))
    for r in range(rows):
        lat = -90 + GRID_DEG * r
        in_lat = np.abs(lats - lat) <= GRID_DEG / 2
        if not in_lat.any():
            in_lat = np.abs(lats - lat) == np.abs(lats - lat).min()
        for col in range(cols):
            dlon = (lons - GRID_DEG * col + 180) % 360 - 180
            in_lon = np.abs(dlon) <= GRID_DEG / 2
            for f, (name, _) in enumerate(FIELDS):
                block = fields[name][in_lat][:, in_lon]
                w = weights[name][in_lat][:, in_lon] * weight_lat[in_lat][:, None]
                w = np.where(np.isnan(block), 0, w)
                out[r, col, f] = (np.nan_to_num(block) * w).sum() / w.sum() if w.sum() > 0 else np.nan
    for f, (name, _) in enumerate(FIELDS):
        if name.endswith('Sd'):
            out[..., f] = np.sqrt(out[..., f])
        missing = np.isnan(out[..., f])
        if missing.any():
            out[..., f][missing] = np.nanmedian(out[..., f]) if not missing.all() else 0
    return out


ELEVATION = ROOT / 'additional_earth_imagery' / 'sources' / 'land_elevation_gmted_7.5s.tif'


def ground_field():
    """(rows, cols): the mean ground height (km; 0 over the sea) over GRID_DEG cells around the output grid's
    nodes (cos(latitude) weighted), from the land elevation read at 0.25 degrees."""
    import rasterio
    with rasterio.open(ELEVATION) as ds:
        elev = ds.read(1, out_shape=(720, 1440), resampling=rasterio.enums.Resampling.average).astype(np.float64)
        top = ds.bounds.top
    elev = np.maximum(np.nan_to_num(elev), 0) / 1000
    lats = top - 0.125 - 0.25 * np.arange(elev.shape[0])
    lons = -179.875 + 0.25 * np.arange(1440)
    rows, cols = 180 // GRID_DEG + 1, 360 // GRID_DEG
    out = np.zeros((rows, cols))
    weight_lat = np.cos(np.radians(lats))
    for r in range(rows):
        in_lat = np.abs(lats - (-90 + GRID_DEG * r)) <= GRID_DEG / 2
        if not in_lat.any():
            continue
        for col in range(cols):
            in_lon = np.abs((lons - GRID_DEG * col + 180) % 360 - 180) <= GRID_DEG / 2
            w = weight_lat[in_lat][:, None] * np.ones(in_lon.sum())
            out[r, col] = (elev[in_lat][:, in_lon] * w).sum() / w.sum()
    return out


def cloud_type_fields():
    """(12, rows, cols, len(CLOUD_TYPE_FIELDS)): the cloud types' amounts (cloud_types.py) averaged over
    GRID_DEG cells around the output grid's nodes (cos(latitude) weighted), as regrid does."""
    from tools.sources import cloud_types
    amounts, when = cloud_types.monthly_amounts(), cloud_types.amounts_when_present()
    maps = {'st': amounts['st'] + amounts['fog'], 'sc': amounts['sc'], 'cu': amounts['cu'], 'cb': amounts['cb'],
            'ns': amounts['ns'], 'as_': amounts['as'], 'ac': amounts['ac'], 'hi': amounts['hi'],
            'scWhen': when['sc'], 'cuWhen': when['cu'], 'cbWhen': when['cb'], 'acWhen': when['ac'], 'asWhen': when['as'], 'hiWhen': when['hi']}
    lats = 89.5 - np.arange(180)
    lons = -179.5 + np.arange(360)
    rows, cols = 180 // GRID_DEG + 1, 360 // GRID_DEG
    out = np.zeros((12, rows, cols, len(CLOUD_TYPE_FIELDS)))
    weight_lat = np.cos(np.radians(lats))
    for r in range(rows):
        in_lat = np.abs(lats - (-90 + GRID_DEG * r)) <= GRID_DEG / 2
        for col in range(cols):
            in_lon = np.abs((lons - GRID_DEG * col + 180) % 360 - 180) <= GRID_DEG / 2
            w = weight_lat[in_lat][:, None] * np.ones(in_lon.sum())
            for f, name in enumerate(CLOUD_TYPE_FIELDS):
                block = maps[name][:, in_lat][:, :, in_lon]
                out[:, r, col, f] = (block * w).sum(axis=(1, 2)) / w.sum()
    return out


def main():
    loaded = {key: load(key) for key in SOURCES}
    # (Onto the Gaussian grid the other sources share, nearest node: the lifted index is on a 2.5-degree one.)
    lats, lons = loaded['tcdc'][4], loaded['tcdc'][5]
    for key, (values, times, months_, hours_, la, lo) in list(loaded.items()):
        if la.shape != lats.shape or not np.allclose(la, lats):
            rows = np.abs(la[:, None] - lats[None, :]).argmin(axis=0)
            cols = np.abs((lo[:, None] - lons[None, :] + 180) % 360 - 180).argmin(axis=0)
            loaded[key] = (values[:, rows][:, :, cols], times, months_, hours_, lats, lons)
    # The records all the sources have (a few are missing here and there), so they line up in time.
    common = set.intersection(*(set(v[1].tolist()) for v in loaded.values()))
    data = {}
    for key, (values, times, months_, hours_, lats, lons) in loaded.items():
        keep = np.array([t in common for t in times.tolist()])
        data[key] = values[keep]
        months, hours = months_[keep], hours_[keep]
        print(f'loaded {key}: {values.shape} -> {data[key].shape}')
    grids = []
    for month in range(1, 13):
        sel = months == month
        fields, weights = month_stats({k: v[sel] for k, v in data.items()}, hours[sel])
        grids.append(regrid(fields, weights, lats, lons))
        print(f'month {month}: {sel.sum()} samples')
    grid = np.stack(grids)
    grid[..., [n for n, _ in FIELDS].index('ground')] = ground_field()[None]
    types = cloud_type_fields()
    for f, name in enumerate(CLOUD_TYPE_FIELDS):
        grid[..., [n for n, _ in FIELDS].index(name)] = types[..., f]
    for f, (name, scale) in enumerate(FIELDS):
        v = grid[..., f]
        print(f'{name:11s} min {v.min():8.3f} median {np.median(v):8.3f} max {v.max():8.3f} (int8 limit {127 * scale:.3f})')
    q = np.clip(np.round(grid / np.array([s for _, s in FIELDS])), -127, 127).astype(np.int8)
    meta = {
        'source': 'NCEP/NCAR Reanalysis 1, 6-hourly fields (NOAA PSL)',
        'years': [YEARS.start, YEARS.stop - 1],
        'gridDegrees': GRID_DEG,
        'rows': grid.shape[1],
        'cols': grid.shape[2],
        'fields': [name for name, _ in FIELDS],
        'scales': [scale for _, scale in FIELDS],
    }
    OUT.write_text(
        '// Generated by tools/sources/build_weather.py: the weather climatology (see src/physics/weather.js).\n'
        '// Do not edit.\n'
        f'export default {json.dumps(meta)[:-1]}, "data": "{base64.b64encode(q.tobytes()).decode()}"}}\n')
    print(f'wrote {OUT} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
