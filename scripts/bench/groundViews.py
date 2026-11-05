# Writes tests/bench/groundViews.json: close-to-the-ground views of the Big Island (the Kona coast up to Mauna Kea's
# summit, the coast's beaches and cliffs), mid-morning local time in early February (Mauna Kea's seasonal snow), for
# judging the generated ground detail. Each camera starts `eye` metres above the highest ground within `clear` metres
# of it (the Copernicus GLO-30 heights); the bench (scripts/bench/cloudBenchSteps.mjs, camera.eyeAboveGround) then
# puts it `eye` metres above the terrain as drawn, which can be well above or below those heights.
#
# Needs the Copernicus GLO-30 tiles over the island (tools/ground_cover.py fetches them into .cache/ground).
# POSIX:      .venv/bin/python scripts/bench/groundViews.py
# PowerShell: .venv\Scripts\python.exe scripts\bench\groundViews.py
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.ground_cover import DemReader  # noqa: E402

A, F = 6378137.0, 1 / 298.257223563
dem = DemReader()


def ecef(lat, lon, h):
    p, l = math.radians(lat), math.radians(lon)
    e2 = F * (2 - F)
    n = A / math.sqrt(1 - e2 * math.sin(p) ** 2)
    return [(n + h) * math.cos(p) * math.cos(l), (n + h) * math.cos(p) * math.sin(l), (n * (1 - e2) + h) * math.sin(p)]


def scene(v):
    return [v[1], v[2], v[0]]  # X = ECEF y, Y = ECEF z, Z = ECEF x


def ground(lat, lon, clear):
    return max(0.0, dem.max_within(lat, lon, clear))


def view(name, camera, target, fov=60, eye=2.0, clear=60.0, target_eye=0.0, day=35, local_hours=10.0, sea=False):
    """camera and target: (latitude, longitude); heights are found from the terrain. sea: the camera is over the sea, at
    `eye` metres above sea level."""
    lat, lon = camera
    h = ground(lat, lon, clear) + eye
    th = max(0.0, dem.height(*target)) + target_eye
    utc = local_hours - lon / 15
    day += math.floor(utc / 24)
    utc %= 24
    p, l = math.radians(lat), math.radians(lon)
    up = [math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)]
    r = lambda v: [round(x, 3) for x in v]
    v = {'preset': 'bigIslandLauncher', 'time': 10, 'sunDayOfYear': day, 'sunTimeOfDayUTC': round(utc, 3),
         'camera': {'position': r(scene(ecef(lat, lon, h))), 'target': r(scene(ecef(target[0], target[1], th))),
                    'up': r(scene(up)), 'orbitUp': r(scene(up)), 'fov': fov, **({} if sea else {'eyeAboveGround': eye})},
         'parameters': {'sunDayOfYear': day, 'sunTimeOfDayUTC': round(utc, 3)},
         'cloudType': {'low': [0, 0, 0, 1800, 2400], 'rain': 0, 'humidity': 0.5}}
    return {'name': name, 'view': v}


MAUNA_KEA = (19.8207, -155.4681)
views = [
    # The transect from the west coast to the summit.
    view('hapuna-beach', (19.9905, -155.8262), (19.9960, -155.8270), 70, eye=1.7, clear=15),
    view('kona-lava-shore', (19.7330, -156.0510), (19.7400, -156.0560), 70, eye=1.7, clear=20),
    view('kona-coast-200m', (19.83, -155.99), MAUNA_KEA, 60, eye=200, clear=300),
    view('waikoloa-scrub', (19.93, -155.78), MAUNA_KEA, 70, eye=1.7, clear=30),
    view('waimea-pasture', (20.00, -155.60), MAUNA_KEA, 70, eye=1.7, clear=30),
    view('saddle-lava-1km', (19.66, -155.55), MAUNA_KEA, 60, eye=1000, clear=1500),
    view('mauna-kea-mid-slope', (19.76, -155.455), MAUNA_KEA, 70, eye=1.7, clear=30),
    view('mauna-kea-summit-west', (19.8207, -155.4720), (19.80, -155.90), 70, eye=1.7, clear=30),
    view('mauna-kea-summit-snow', (19.810, -155.480), MAUNA_KEA, 60, eye=1.7, clear=30),
    view('mauna-kea-aerial-3km', (19.70, -155.62), MAUNA_KEA, 55, eye=3000, clear=3000),
    view('west-coast-helicopter', (19.95, -155.88), MAUNA_KEA, 60, eye=1200, clear=1500),
    # Coasts elsewhere: cliffs and black sand.
    view('hamakua-cliffs-from-sea', (20.06, -155.32), (20.02, -155.36), 60, eye=15, clear=10, sea=True),
    view('kohala-cliffs-pololu', (20.22, -155.70), (20.18, -155.70), 60, eye=30, clear=10, sea=True),
    view('waipio-from-sea', (20.138, -155.578), (20.120, -155.592), 55, eye=25, clear=10, sea=True),
    view('punaluu-black-sand', (19.1355, -155.5050), (19.1380, -155.5040), 70, eye=1.7, clear=15),
    view('chain-of-craters-sea-cliffs', (19.29, -155.10), (19.297, -155.115), 60, eye=40, clear=10, sea=True),
]
json.dump(views, open(ROOT / 'tests/bench/groundViews.json', 'w'), indent=1)
print(len(views))
