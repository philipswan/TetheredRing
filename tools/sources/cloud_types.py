"""The real world's mix of cloud types, from surface observations: how much of the sky each type covers,
month by month, over land and ocean, as an observer on the ground sees it. Read by build_weather.py,
which puts it in the weather climatology beside the reanalysis's fields.

Source: Hahn and Warren (2007, updated 2009), A gridded climatology of clouds over land (1971-96) and
ocean (1954-97) from surface observations worldwide, NDP-026E, CDIAC, doi:10.3334/CDIAC/cli.ndp026e.
Downloaded once into additional_earth_imagery/weather/ndp026e/ from the authors' copy
(https://atmos.washington.edu/~rmeast/NDP-026E_data/; no login needed):
  cat01/                  the grid boxes: centres and land fraction (5-degree "5c" and 10-degree "10r" grids)
  cat08-09_18-19/         monthly mean amounts (08 land, 5c; 18 ocean, 10r)
  cat03-05_13-15/         seasonal mean amounts when present (05 land, 5c; 15 ocean, 10r)

The types (the WMO synoptic code's, grouped as in the archive's Table 2): fog (sky obscured), stratus,
stratocumulus, cumulus, cumulonimbus (low); nimbostratus, altostratus, altocumulus (middle); cirriform
(high, all together). Amounts are "actual" amounts (including what is hidden behind lower clouds, by
random overlap), as fractions of the sky. Land and ocean are combined by each 5c box's land fraction.

    .venv/bin/python -m tools.sources.cloud_types          (prints global means, as a check)
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'additional_earth_imagery' / 'weather' / 'ndp026e'
BASE_URL = 'https://atmos.washington.edu/~rmeast/NDP-026E_data'

# The archive's type codes (Table 6a).
TYPES = {'fog': 11, 'st': 12, 'sc': 13, 'cu': 14, 'cb': 15, 'ns': 21, 'as': 22, 'ac': 23, 'hi': 30}
SEASONS = {41: (12, 1, 2), 42: (3, 4, 5), 43: (6, 7, 8), 44: (9, 10, 11)}  # DJF, MAM, JJA, SON


def boxes(grid: str):
    """Box number -> (centre latitude, centre longitude, land fraction) for grid '5c' or '10r'."""
    out = {}
    for line in (DATA / 'cat01' / f'01_BLLF.{grid}').read_text().splitlines():
        if len(line.rstrip()) != 30:
            continue  # (the header)
        box, lat, lon, land = int(line[0:4]), int(line[4:10]) / 100, int(line[10:16]) / 100, int(line[16:22]) / 1e4
        out[box] = (lat, lon, land)
    return out


def read_groups(path: Path):
    """The data groups in a file of Format 121: (type, season or month) -> {box: day-night average}, with
    missing values (negative) left out. Averages are in percent for amounts."""
    groups, current = {}, None
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        if len(line.rstrip()) <= 40:
            # A header: DGRP I5, NBXS I5, GRID I3, LO I2, TYPE I3, PCODE I2, YR I5, SN I3, FMT I4 [MIN VX].
            current = groups.setdefault((int(line[15:18]), int(line[25:28])), {})
            continue
        avg = int(line[38:44])
        if current is not None and avg >= 0:
            current[int(line[0:5])] = avg / 100
    return groups


def box_map(values: dict, table: dict, grid_deg: float):
    """A 1-degree global map (180 x 360: rows from 90 N, columns from 180 W) of a box field (NaN where missing)."""
    out = np.full((180, 360), np.nan)
    for box, v in values.items():
        lat, lon, _ = table[box]
        r0 = int(round(90 - lat - grid_deg / 2))
        c0 = int(round((lon + 180 - grid_deg / 2))) % 360
        n = int(grid_deg)
        cols = [(c0 + k) % 360 for k in range(n)]
        out[max(r0, 0):r0 + n, cols] = v
    return out


def land_fraction_map():
    table = boxes('5c')
    return np.nan_to_num(box_map({b: f for b, (_, _, f) in table.items()}, table, 5), nan=0.0)


def fill(field):
    """Missing cells filled from their neighbours (repeatedly, longitude wrapping), so every cell has a value."""
    f = field.copy()
    for _ in range(400):
        missing = np.isnan(f)
        if not missing.any():
            break
        padded = np.pad(f, ((1, 1), (0, 0)), mode='edge')
        stack = np.stack([np.roll(padded, s, axis=1)[1 + dr:181 + dr] for dr in (-1, 0, 1) for s in (-1, 0, 1)])
        mean = np.nanmean(np.where(np.isnan(stack), np.nan, stack), axis=0)
        f = np.where(missing, mean, f)
    return np.nan_to_num(f, nan=0.0)


def combined(land_values, ocean_values, land_fraction):
    """Land and ocean maps combined by land fraction (each standing in for the other where missing)."""
    land, ocean = land_values.copy(), ocean_values.copy()
    land = np.where(np.isnan(land), ocean, land)
    ocean = np.where(np.isnan(ocean), land, ocean)
    return land_fraction * land + (1 - land_fraction) * ocean


def monthly_amounts():
    """{type: (12, 180, 360) fractions of the sky} on a 1-degree map, plus 'total'."""
    t5, t10 = boxes('5c'), boxes('10r')
    lf = land_fraction_map()
    folder = DATA / 'cat08-09_18-19'
    out = {name: np.zeros((12, 180, 360)) for name in [*TYPES, 'total']}
    for m in range(1, 13):
        land, ocean = {}, {}
        for part in ('low', 'mh', 'tc'):
            land.update(read_groups(folder / f'08_LMMA.{m:02d}.{part}'))
            ocean.update(read_groups(folder / f'18_OMMA.{m:02d}.{part}'))
        for name, code in [*TYPES.items(), ('total', 1)]:
            lv = box_map(land.get((code, m), {}), t5, 5)
            ov = box_map(ocean.get((code, m), {}), t10, 10)
            out[name][m - 1] = fill(combined(lv, ov, lf)) / 100
    return out


def amounts_when_present():
    """{type: (12, 180, 360)}: the share of the sky a type covers when it is there (seasonal, by month)."""
    t5, t10 = boxes('5c'), boxes('10r')
    lf = land_fraction_map()
    folder = DATA / 'cat03-05_13-15'
    names = [n for n in TYPES if n != 'fog']
    out = {name: np.zeros((12, 180, 360)) for name in names}
    for season, months in SEASONS.items():
        land, ocean = {}, {}
        for part in ('low', 'mh'):
            land.update(read_groups(folder / f'05_LMSW.{season}.{part}'))
            ocean.update(read_groups(folder / f'15_O10W.{season}.{part}'))
        for name in names:
            lv = box_map(land.get((TYPES[name], season), {}), t5, 5)
            ov = box_map(ocean.get((TYPES[name], season), {}), t10, 10)
            v = fill(combined(lv, ov, lf)) / 100
            for m in months:
                out[name][m - 1] = v
    return out


def global_mean(field):
    w = np.cos(np.radians(90 - (np.arange(180) + 0.5)))[:, None]
    return float((field * w).sum() / (w.sum() * field.shape[-1]))


if __name__ == '__main__':
    amounts = monthly_amounts()
    awp = amounts_when_present()
    for name in amounts:
        a = amounts[name]
        extra = f'  when present {global_mean(awp[name].mean(axis=0)):.2f}' if name in awp else ''
        print(f'{name:6s} amount {global_mean(a.mean(axis=0)):.3f}  (Jan {global_mean(a[0]):.3f}, Jul {global_mean(a[6]):.3f}){extra}')
