import collections
from pathlib import Path

for root in ['assets/earth', 'assets/hawaii']:
    croot = Path(root) / 'color'
    hroot = Path(root) / 'height'
    if not croot.exists():
        print(root, '-> no color dir'); continue
    ktx = collections.Counter()
    png = collections.Counter()
    zero_ktx = []
    zero_bin = []
    for p in croot.rglob('*.ktx2'):
        face = p.relative_to(croot).parts[0]
        ktx[face] += 1
        if p.stat().st_size == 0:
            zero_ktx.append(str(p))
    for p in croot.rglob('*.png'):
        face = p.relative_to(croot).parts[0]
        png[face] += 1
    for p in hroot.rglob('*.bin'):
        if p.stat().st_size == 0:
            zero_bin.append(str(p))
    print('== %s ==' % root)
    print('  ktx2 per face:', dict(ktx))
    print('  png  per face:', dict(png))
    print('  zero-byte ktx2:', len(zero_ktx), zero_ktx[:5])
    print('  zero-byte bin :', len(zero_bin), zero_bin[:5])
    print('  color face dirs:', sorted(d.name for d in croot.iterdir() if d.is_dir()))
