import json, collections
from pathlib import Path

FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']

for root in ['assets/earth', 'assets/hawaii']:
    mp = Path(root) / 'manifest.json'
    if not mp.exists():
        print(root, '-> NO manifest')
        continue
    m = json.load(open(mp))
    tiles = m['tiles']
    byl = collections.Counter(int(k.split('/')[1]) for k in tiles)
    faces = collections.Counter(k.split('/')[0] for k in tiles)
    print('%s: %d tiles maxLod=%s minH=%s maxH=%s' % (
        root, len(tiles), m.get('maxAvailableLod'), m.get('minHeight'), m.get('maxHeight')))
    print('  per-LOD:', dict(sorted(byl.items())))
    print('  per-face:', dict(faces))
    for f in FACES:
        k = f + '/0/0/0'
        c = Path(root) / 'color' / f / '0' / '0' / '0.ktx2'
        h = Path(root) / 'height' / f / '0' / '0' / '0.bin'
        print('   root %s: manifest=%s color=%s height=%s' % (f, k in tiles, c.exists(), h.exists()))
