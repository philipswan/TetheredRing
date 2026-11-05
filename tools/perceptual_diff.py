"""Whether a change to a rendered image could be seen, judged by a high-quality lossy codec (AVIF: AV1).

A good lossy codec spends its bits where the eye would notice and drops what it would not (detail
hidden in texture, noise below what a flat area shows), so the error it leaves in each block of an
image is a measure of how much could change there unseen. For a baseline image A and a candidate B
(the same view, after a change), each 16 x 16 block is:
  - within the budget: B differs from A by less than encoding A at high quality does (or by less than
    the floor, a level or so, invisible anywhere), or
  - visible: by more, and the difference survives encoding (B's encoding differs from A's by more than
    the budget too), so the codec keeps it and it would show.

    POSIX:       .venv/bin/python -m tools.perceptual_diff A.png B.png [--out heat.png]
                 .venv/bin/python -m tools.perceptual_diff --baseline .scratch/bench/base --candidate .scratch/bench/now
    PowerShell:  .venv\\Scripts\\python.exe -m tools.perceptual_diff --baseline .scratch\\bench\\base --candidate .scratch\\bench\\now

With directories, compares the images of the same name (skipping *.diff.png, *.cost.png and *.heat.png)
and writes <name>.heat.png into the candidate's directory: the candidate, darkened, with visible blocks
red. Needs ffmpeg with libsvtav1 (and an AV1 decoder) on the PATH. Exits with 1 if any block is visible.
"""
import argparse
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)


def avif_roundtrip(image, crf):
    env = {**os.environ, 'SVT_LOG': '1'}  # (errors only)
    """The image (float RGB, 0..255) encoded as AVIF at crf (lower is better) and decoded again."""
    h, w, _ = image.shape
    with tempfile.TemporaryDirectory() as tmp:
        src, enc = os.path.join(tmp, 'in.png'), os.path.join(tmp, 'out.avif')
        Image.fromarray(image.astype(np.uint8)).save(src)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c:v', 'libsvtav1', '-crf', str(crf), '-preset', '6',
                        '-pix_fmt', 'yuv420p10le', '-frames:v', '1', enc], check=True, env=env)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', enc, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                             check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3).astype(np.float32)


def block_rms(diff, block):
    h, w = diff.shape[0] // block * block, diff.shape[1] // block * block
    d = diff[:h, :w]
    return np.sqrt((d * d).reshape(h // block, block, w // block, block, 3).mean(axis=(1, 3, 4)))


def compare(a, b, crf=15, block=16, floor=1.5):
    if a.shape != b.shape:
        raise ValueError(f'sizes differ: {a.shape} {b.shape}')
    a_enc, b_enc = avif_roundtrip(a, crf), avif_roundtrip(b, crf)
    budget = np.maximum(block_rms(a_enc - a, block), floor)
    change = block_rms(b - a, block)
    survives = block_rms(b_enc - a_enc, block)
    over = change > budget
    visible = over & (survives > budget)
    return {
        'meanAbs': float(np.abs(b - a).mean()),
        'overBudget': float(over.mean()),
        'visible': float(visible.mean()),
        'visibleBlocks': int(visible.sum()),
        'worstRatio': float((change / budget).max()),
    }, visible


def heat_map(b, visible, block, path):
    out = b * 0.5
    for y, x in zip(*np.nonzero(visible)):
        out[y * block:(y + 1) * block, x * block:(x + 1) * block] = [255, 40, 40]
    Image.fromarray(out.astype(np.uint8)).save(path)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('a', nargs='?')
    p.add_argument('b', nargs='?')
    p.add_argument('--baseline')
    p.add_argument('--candidate')
    p.add_argument('--out', help='heat map (single pair)')
    p.add_argument('--crf', type=int, default=15, help='AV1 quality for the budget (default 15: high)')
    p.add_argument('--block', type=int, default=16)
    p.add_argument('--floor', type=float, default=1.5, help='RMS levels (of 255) invisible anywhere')
    args = p.parse_args()
    pairs = []
    if args.baseline and args.candidate:
        skip = ('.diff.png', '.cost.png', '.heat.png')
        for name in sorted(os.listdir(args.candidate)):
            if name.endswith('.png') and not name.endswith(skip) and os.path.exists(os.path.join(args.baseline, name)):
                pairs.append((name[:-4], os.path.join(args.baseline, name), os.path.join(args.candidate, name),
                              os.path.join(args.candidate, name[:-4] + '.heat.png')))
    elif args.a and args.b:
        pairs.append((os.path.basename(args.b), args.a, args.b, args.out))
    else:
        p.error('give two images, or --baseline and --candidate directories')
    any_visible = False
    print(f"{'image':24s}{'mean |d|':>10s}{'over budget':>13s}{'visible':>10s}{'worst x':>9s}")
    for name, pa, pb, heat in pairs:
        a, b = load(pa), load(pb)
        r, visible = compare(a, b, args.crf, args.block, args.floor)
        any_visible |= r['visibleBlocks'] > 0
        print(f"{name:24s}{r['meanAbs']:10.3f}{r['overBudget'] * 100:12.2f}%{r['visible'] * 100:9.2f}%{r['worstRatio']:9.2f}")
        if heat:
            heat_map(b, visible, args.block, heat)
    sys.exit(1 if any_visible else 0)


if __name__ == '__main__':
    main()
