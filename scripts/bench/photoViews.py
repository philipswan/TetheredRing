# Writes tests/bench/photoViews.json: a view per photograph in "Cloud Examples" (camera on a ship's deck in the
# western Pacific, the sun at the photograph's date and local time, and its sky's cloud types for Clouds.setCloudTypeTest).
# POSIX: python3 scripts/bench/photoViews.py    PowerShell: python scripts\\bench\\photoViews.py
import json, math, datetime
LAT, LON, HEIGHT = 15.0, 135.0, 20.0   # western Pacific, a ship's deck
A, F = 6378137.0, 1 / 298.257223563
def ecef(lat, lon, h):
    p, l = math.radians(lat), math.radians(lon); e2 = F * (2 - F)
    n = A / math.sqrt(1 - e2 * math.sin(p) ** 2)
    return [(n + h) * math.cos(p) * math.cos(l), (n + h) * math.cos(p) * math.sin(l), (n * (1 - e2) + h) * math.sin(p)]
def scene(v): return [v[1], v[2], v[0]]   # X = ECEF y, Y = ECEF z, Z = ECEF x
def view(name, photo, when, vfov, pitch, azimuth, sky):
    t = datetime.datetime.fromisoformat(when)
    utc = t.hour + t.minute / 60 - LON / 15
    day = t.timetuple().tm_yday + math.floor(utc / 24); utc %= 24
    p, l = math.radians(LAT), math.radians(LON)
    up = [math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)]
    east = [-math.sin(l), math.cos(l), 0]
    north = [-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p)]
    a, e = math.radians(azimuth), math.radians(pitch)
    d = [math.cos(e) * (math.cos(a) * north[i] + math.sin(a) * east[i]) + math.sin(e) * up[i] for i in range(3)]
    pos = ecef(LAT, LON, HEIGHT)
    tgt = [pos[i] + 1000 * d[i] for i in range(3)]
    r = lambda v: [round(x, 3) for x in v]
    sky = {'rain': 0, 'humidity': 0.8, **sky}   # (the test's rain and haze, not the weather's)
    return {'name': name, 'photo': photo, 'view': {'preset': 'bigIslandLauncher', 'time': 10, 'sunDayOfYear': day, 'sunTimeOfDayUTC': round(utc, 3),
            'camera': {'position': r(scene(pos)), 'target': r(scene(tgt)), 'up': r(scene(up)), 'orbitUp': r(scene(up)), 'fov': vfov},
            'parameters': {'sunDayOfYear': day, 'sunTimeOfDayUTC': round(utc, 3)}, 'cloudType': sky}}
cu = lambda c, top=1500: [c, 0, 0, 600, top]
views = [
  view('altocumulus', 'Altocumulus.jpg', '2019-07-26T07:38', 31, 13, 300, {'mid': [0.65, 0, 3500], 'low': cu(0.06)}),
  view('cumulus+altocumulus', 'Calm Cumulus+Altocumulus.JPG', '2019-07-26T07:36', 25, 11, 300, {'mid': [0.85, 0, 3500], 'low': cu(0.12)}),
  view('cumulus+altostratus', 'Calm Cumulus+Altostratus.JPG', '2019-07-26T07:40', 29, 13, 300, {'mid': [0.45, 1, 3000], 'low': cu(0.15)}),
  view('altocumulus+cumulus', 'Altocumulus+Cumulus.JPG', '2019-06-30T17:28', 26, 6, 60, {'mid': [0.9, 0.6, 3000], 'low': cu(0.25, 1200)}),
  view('nimbostratus-under', 'Nimbostratus under.JPG', '2019-06-30T14:37', 44, 1, 60, {'low': [1, 1, 0, 700, 4500], 'rain': 3, 'humidity': 0.95}),
  view('nimbostratus-edge', 'Nimbostratus edge.JPG', '2019-06-30T14:36', 54, 16, 60, {'low': [0.85, 1, 0, 700, 4500], 'rain': 3, 'humidity': 0.95}),
  view('stratocumulus', 'Stratocumulus+Altocumulus+Cirrostratus.JPG', '2019-08-03T08:38', 30, 6, 300, {'low': [0.9, 0.6, 0, 700, 1500], 'high': [0.8, 0.3, 9000]}),
  view('stratus', 'Stratus.JPG', '2019-08-05T07:26', 30, 5, 300, {'low': [1, 1, 0, 300, 900]}),
  view('hazy-cumulus', 'hazy horizon cumulus.JPG', '2019-06-19T11:29', 30, 5, 300, {'low': cu(0.2, 1700)}),
  view('cirrus-dusk', 'Cirrocumulus+Cirrus Dusk.JPG', '2019-07-04T19:09', 26, 6, 290, {'high': [0.5, 0.15, 9000], 'cells': 0.5}),
]
json.dump(views, open('tests/bench/photoViews.json', 'w'), indent=1)
print(len(views))
