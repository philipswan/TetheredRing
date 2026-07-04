"""Bake the minimal set of "sibling-closure" tiles needed to unblock refinement.

The planet2 renderer only refines a tile when ALL FOUR of its children exist
(see _hasChildAssets). A sparse refinement cone can therefore be unreachable if an
ancestor is missing some of its four children -- most notably a root that only has
one child, which strands the entire cone at LOD0.

This script scans the manifest, finds every tile that has some (but not all four)
baked children, bakes ONLY the missing siblings from the same base sources used by
the main generator, and merges them into the manifest. Each closure tile is baked
at the same pixel sizes as its existing sibling so the tree stays uniform.

Run after a cone bake if the globe is stuck at low resolution.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

import tools.generate_planet2_lod0_assets as g

COLOR_SOURCE = 'textures/bluemarble_4096.jpg'
HEIGHT_SOURCE = 'textures/DEM/ETOPO_2022_v1_60s_surface.tif'
DEFAULT_HEIGHT_SIZE = 256
DEFAULT_COLOR_SIZE = 2048


def _kids(key: str) -> list[str]:
    f, l, x, y = key.split('/')
    l, x, y = int(l), int(x), int(y)
    return [f'{f}/{l + 1}/{x * 2 + dx}/{y * 2 + dy}' for dx in (0, 1) for dy in (0, 1)]


def _ktx2_size(path: Path, fallback: int) -> int:
    try:
        with open(path, 'rb') as fh:
            head = fh.read(28)
        return struct.unpack('<I', head[20:24])[0] or fallback
    except (OSError, struct.error):
        return fallback


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_root = root / 'assets' / 'earth'
    out_color_root = out_root / 'color'
    out_height_root = out_root / 'height'
    manifest_path = out_root / 'manifest.json'

    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    tiles = manifest['tiles']
    present = set(tiles)
    height_min_m = float(manifest.get('minHeight', -11000.0))
    height_max_m = float(manifest.get('maxHeight', 9000.0))

    # Missing siblings: any child of an internal node (a node with >=1 baked child)
    # that is not itself baked.
    missing: set[str] = set()
    for key in present:
        kids = _kids(key)
        if any(c in present for c in kids):
            missing.update(c for c in kids if c not in present)

    if not missing:
        print('Tree already sibling-closed; nothing to bake.')
        return

    print(f'Missing closure tiles: {len(missing)}')
    for k in sorted(missing):
        print('   +', k)

    color_src = root / COLOR_SOURCE
    height_src = root / HEIGHT_SOURCE
    if not color_src.exists():
        raise FileNotFoundError(f'Color source not found: {color_src}')
    use_flat = not height_src.exists()
    src_rgb, src_hmap = g.load_sources(
        color_src, height_src, use_flat, height_min_m, height_max_m)

    can_try_ktx2 = True
    baked = 0
    for tile_id in sorted(missing):
        face, lod_s, x_s, y_s = tile_id.split('/')
        lod, x, y = int(lod_s), int(x_s), int(y_s)

        # Match an existing sibling's sizes so the quad is uniform.
        sibling = next((c for c in _kids(f'{face}/{lod - 1}/{x // 2}/{y // 2}')
                        if c in tiles), None)
        height_size = int(tiles[sibling]['height']) if sibling else DEFAULT_HEIGHT_SIZE
        color_size = _ktx2_size(out_color_root / face / lod_s / f'{y_s}.ktx2', DEFAULT_COLOR_SIZE)
        if sibling:
            sf, sl, sx, sy = sibling.split('/')
            color_size = _ktx2_size(out_color_root / sf / sl / sx / f'{sy}.ktx2', DEFAULT_COLOR_SIZE)

        tid, entry, _ = g.build_tile_assets(
            face, lod, x, y, color_size, height_size,
            src_rgb, src_hmap, out_color_root, out_height_root,
            height_min_m, height_max_m, can_try_ktx2)
        tiles[tid] = entry
        baked += 1
        print(f'  baked {tid}  color={color_size} height={height_size}')

    manifest['maxAvailableLod'] = max(int(manifest.get('maxAvailableLod', 0)),
                                      max(int(k.split('/')[1]) for k in tiles))
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'Baked {baked} closure tiles; manifest now has {len(tiles)} tiles.')


if __name__ == '__main__':
    main()
