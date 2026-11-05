# Writes tests/bench/mountainViews.json: views of clouds meeting mountains (Mauna Kea, Luzon's Cordillera, the
# western USA, New Zealand, the Himalayas and the Andes), mid-morning local time, in the weather's clouds unless a view
# sets a sky of its own (Clouds.setCloudTypeTest).
# POSIX: python3 scripts/bench/mountainViews.py    PowerShell: python scripts\bench\mountainViews.py
import json, math

A, F = 6378137.0, 1 / 298.257223563


def ecef(lat, lon, h):
    p, l = math.radians(lat), math.radians(lon)
    e2 = F * (2 - F)
    n = A / math.sqrt(1 - e2 * math.sin(p) ** 2)
    return [(n + h) * math.cos(p) * math.cos(l), (n + h) * math.cos(p) * math.sin(l), (n * (1 - e2) + h) * math.sin(p)]


def scene(v):
    return [v[1], v[2], v[0]]  # X = ECEF y, Y = ECEF z, Z = ECEF x


def view(name, camera, target, fov=60, day=196, local_hours=10.0, sky=None):
    """camera and target: (latitude, longitude, height in metres)."""
    lat, lon = camera[0], camera[1]
    utc = local_hours - lon / 15
    day += math.floor(utc / 24)
    utc %= 24
    p, l = math.radians(lat), math.radians(lon)
    up = [math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)]
    r = lambda v: [round(x, 3) for x in v]
    v = {'preset': 'bigIslandLauncher', 'time': 10, 'sunDayOfYear': day, 'sunTimeOfDayUTC': round(utc, 3),
         'camera': {'position': r(scene(ecef(*camera))), 'target': r(scene(ecef(*target))), 'up': r(scene(up)), 'orbitUp': r(scene(up)), 'fov': fov},
         'parameters': {'sunDayOfYear': day, 'sunTimeOfDayUTC': round(utc, 3)}}
    if sky:
        v['cloudType'] = sky
    return {'name': name, 'view': v}


MAUNA_KEA = (19.8207, -155.4681, 4207)
trade_deck = {'low': [0.85, 0.6, 0, 1800, 2400], 'rain': 0, 'humidity': 0.8}
views = [
    view('mauna-kea-from-sea', (20.25, -155.15, 30), MAUNA_KEA, 45),
    view('mauna-kea-from-sea-trade-deck', (20.25, -155.15, 30), MAUNA_KEA, 45, sky=trade_deck),
    view('mauna-kea-summit-trade-deck', (19.8207, -155.4681, 4230), (19.95, -155.0, 1500), 70, sky=trade_deck),
    view('mauna-kea-aerial', (20.6, -154.6, 9000), MAUNA_KEA, 50),
    view('luzon-cordillera', (16.0, 120.2, 3000), (16.6, 120.9, 2900), 60),
    view('mount-rainier', (47.15, -122.1, 1500), (46.853, -121.76, 4392), 45),
    view('sierra-nevada', (36.4, -117.6, 6000), (36.578, -118.292, 4421), 60),
    view('himalaya-everest', (27.6, 86.5, 9000), (27.988, 86.925, 8849), 60),
    view('andes-aconcagua', (-32.4, -69.6, 7000), (-32.653, -70.011, 6961), 60),
    view('nz-aoraki', (-43.35, 169.75, 5000), (-43.595, 170.142, 3724), 60),
    view('nz-ruapehu', (-39.0, 175.3, 600), (-39.281, 175.565, 2797), 50),
    view('nz-ruapehu-above-deck', (-39.0, 175.3, 4500), (-39.281, 175.565, 2797), 60),
]
json.dump(views, open('tests/bench/mountainViews.json', 'w'), indent=1)
print(len(views))
