"""Rebuild assets/earth/manifest.json from the tiles already on disk.

Use this when the tile images (color .ktx2 + height .bin) exist but the manifest
is missing/stale/out-of-sync (e.g. after a manual folder rename + copy-back, or an
interrupted bake). It scans every height .bin, derives each tile's true size from
the buffer (height tiles are square), recomputes roughness the same way the bakers
do, and writes a consistent manifest without re-baking any imagery.

The height decode range (minHeight/maxHeight) is preserved from the existing
manifest when present, otherwise it falls back to the ETOPO range used by the bakers.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

DEFAULT_MIN_HEIGHT = -11000.0
DEFAULT_MAX_HEIGHT = 9000.0
LAND_FRACTION = 0.3  # matches build_tile_assets(); only affects refinement priority


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out_root = root / 'assets' / 'earth'
    height_root = out_root / 'height'
    color_root = out_root / 'color'
    manifest_path = out_root / 'manifest.json'

    # Preserve the decode range (and any other top-level fields) from the existing
    # manifest so we don't silently change how heights are interpreted.
    min_height = DEFAULT_MIN_HEIGHT
    max_height = DEFAULT_MAX_HEIGHT
    if manifest_path.exists():
        try:
            prev = json.loads(manifest_path.read_text(encoding='utf-8'))
            min_height = float(prev.get('minHeight', min_height))
            max_height = float(prev.get('maxHeight', max_height))
        except (ValueError, OSError):
            pass

    bin_files = sorted(height_root.rglob('*.bin'))
    if not bin_files:
        raise SystemExit(f'No height .bin tiles found under {height_root}')

    tiles: dict[str, dict] = {}
    max_lod = 0
    missing_color = 0
    bad_size = 0

    for bin_path in bin_files:
        rel = bin_path.relative_to(height_root)
        parts = rel.with_suffix('').parts  # (face, lod, tx, ty)
        if len(parts) != 4:
            print(f'  skip (unexpected path): {rel.as_posix()}')
            continue
        face, lod_s, tx_s, ty_s = parts
        lod, tx, ty = int(lod_s), int(tx_s), int(ty_s)

        samples = np.fromfile(bin_path, dtype='<u2')
        side = int(round(math.sqrt(samples.size)))
        if side <= 0 or side * side != samples.size:
            print(f'  skip (non-square {samples.size} samples): {rel.as_posix()}')
            bad_size += 1
            continue

        roughness = float(np.std(samples.astype(np.float32) / 65535.0))

        color_file = color_root / face / lod_s / tx_s / f'{ty_s}.ktx2'
        if not color_file.exists():
            missing_color += 1

        tile_id = f'{face}/{lod}/{tx}/{ty}'
        tiles[tile_id] = {
            'roughness': roughness,
            'landFraction': LAND_FRACTION,
            'width': side,
            'height': side,
        }
        max_lod = max(max_lod, lod)

    manifest = {
        'maxAvailableLod': max_lod,
        'minHeight': min_height,
        'maxHeight': max_height,
        'tiles': tiles,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    from collections import Counter
    per_lod = Counter(k.split('/')[1] for k in tiles)
    print(f'Wrote {manifest_path}')
    print(f'  tiles={len(tiles)} maxAvailableLod={max_lod} '
          f'minHeight={min_height} maxHeight={max_height}')
    print('  per-LOD=' + str(dict(sorted(per_lod.items(), key=lambda kv: int(kv[0])))))
    if missing_color:
        print(f'  WARNING: {missing_color} tiles have no matching .ktx2 color file')
    if bad_size:
        print(f'  WARNING: {bad_size} .bin files had non-square sample counts (skipped)')


if __name__ == '__main__':
    main()
