"""Temporal artifacts (flicker, shimmer, moire, sliding) in a sequence of frames of a camera move.

The frames come from the cloud bench with BENCH_MOTION (scripts/bench/cloudBenchSteps.mjs): the camera
moves and nothing else does (simulated time is held), so every change from one frame to the next should
be explained by the camera's motion. Two measures of what is not:
  - Block matching (motion estimation, as a video encoder does it): each 16 x 16 block of a frame is
    found in the frame before, within +-search pixels; what is left after the best match (the mean
    absolute residual, of 255) is change that motion cannot explain. Reported per frame, and as a map
    of the median residual over the sequence (artifacts that persist show up; a block of new detail
    coming into view once does not). Matching whole pixels, fine detail leaves a residual under motion by
    fractions of a pixel even when nothing is wrong, so it is also reported relative to each block's detail
    (its mean difference between neighbouring pixels): a change that only adds detail leaves that the same.
  - Video codecs: the bytes of the inter-predicted frames, x264 at a fixed quantiser and AV1 (SVT-AV1) at
    a fixed quality. Both predict each frame from the one before with motion vectors, so flicker and
    shimmer cost bits.
With --baseline (the same move rendered before a change), each is compared, and blocks whose median
residual grew are reported and mapped.

    POSIX:       .venv/bin/python -m tools.motion_artifacts <frames dir> [--baseline <frames dir>] [--mv-video mv.mp4]
    PowerShell:  .venv\\Scripts\\python.exe -m tools.motion_artifacts <frames dir> [--baseline <frames dir>]

Writes residual.png (and, with a baseline, residual-growth.png and relative-growth.png) into the frames'
directory. Needs ffmpeg
(libx264, libsvtav1) and ffprobe on the PATH.
"""
import argparse
import glob
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image


def frames(directory):
    files = sorted(glob.glob(os.path.join(directory, 'frame-*.png')))
    if len(files) < 2:
        raise SystemExit(f'no frames in {directory}')
    return files


def luma(path):
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def residual(prev, cur, block=16, search=8):
    """Per block of cur: the mean absolute difference from its best match in prev within +-search px."""
    h, w = cur.shape[0] // block * block, cur.shape[1] // block * block
    cur = cur[:h, :w]
    padded = np.pad(prev, search, mode='edge')
    best = np.full((h // block, w // block), np.inf, dtype=np.float32)
    for dy in range(-search, search + 1):
        for dx in range(-search, search + 1):
            shifted = padded[search + dy:search + dy + h, search + dx:search + dx + w]
            sad = np.abs(cur - shifted).reshape(h // block, block, w // block, block).mean(axis=(1, 3))
            np.minimum(best, sad, out=best)
    return best


def detail(img, block=16):
    """Per block: the mean absolute difference between neighbouring pixels (how much fine detail it has)."""
    h, w = img.shape[0] // block * block, img.shape[1] // block * block
    g = np.zeros((h, w), dtype=np.float32)
    g[:, :-1] += np.abs(np.diff(img[:h, :w], axis=1))
    g[:-1, :] += np.abs(np.diff(img[:h, :w], axis=0))
    return (g / 2).reshape(h // block, block, w // block, block).mean(axis=(1, 3))


def residuals(files, block, search):
    """Per frame and block: the residual, and the residual relative to the block's detail (+0.5)."""
    out, rel, prev = [], [], luma(files[0])
    for f in files[1:]:
        cur = luma(f)
        r = residual(prev, cur, block, search)
        out.append(r)
        rel.append(r / (detail(cur, block) + 0.5))
        prev = cur
    return np.stack(out), np.stack(rel)


def codec_bytes(directory):
    env = {**os.environ, 'SVT_LOG': '1'}  # (errors only)
    """Bytes of the inter frames: x264 (qp 18, no B-frames) and SVT-AV1 (crf 30)."""
    result = {}
    with tempfile.TemporaryDirectory() as tmp:
        for name, codec in [('x264', ['-c:v', 'libx264', '-qp', '18', '-bf', '0', '-g', '1000', '-sc_threshold', '0', '-preset', 'medium']),
                            ('av1', ['-c:v', 'libsvtav1', '-crf', '30', '-preset', '8', '-g', '1000', '-svtav1-params', 'scd=0'])]:
            path = os.path.join(tmp, f'{name}.mkv')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', os.path.join(directory, 'frame-%04d.png'),
                            *codec, '-pix_fmt', 'yuv420p', path], check=True, env=env)
            sizes = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=size',
                                    '-of', 'csv=p=0', path], check=True, capture_output=True, text=True).stdout.split()
            sizes = [int(s) for s in sizes]
            result[name] = sum(sizes[1:])
    return result


def save_map(values, scale, path):
    img = np.clip(values / scale * 255, 0, 255).astype(np.uint8)
    Image.fromarray(np.kron(img, np.ones((8, 8), dtype=np.uint8))).save(path)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('frames')
    p.add_argument('--baseline')
    p.add_argument('--block', type=int, default=16)
    p.add_argument('--search', type=int, default=8)
    p.add_argument('--mv-video', help='also write the x264 encoding with its motion vectors drawn')
    args = p.parse_args()
    files = frames(args.frames)
    res, rel = residuals(files, args.block, args.search)
    median = np.median(res, axis=0)
    rel_median = np.median(rel, axis=0)
    print(f'{args.frames}: {len(files)} frames')
    print(f'  residual per frame (mean of blocks): {", ".join(f"{x:.2f}" for x in res.mean(axis=(1, 2)))}')
    print(f'  median residual: mean {median.mean():.3f}  p99 {np.percentile(median, 99):.3f}  max {median.max():.3f}')
    print(f'  relative to detail: mean {rel_median.mean():.3f}  p99 {np.percentile(rel_median, 99):.3f}')
    codec = codec_bytes(args.frames)
    print(f'  inter-frame bytes: x264 {codec["x264"]}  av1 {codec["av1"]}')
    save_map(median, 8.0, os.path.join(args.frames, 'residual.png'))
    if args.baseline:
        base, base_rel = residuals(frames(args.baseline), args.block, args.search)
        base_median = np.median(base, axis=0)
        base_rel_median = np.median(base_rel, axis=0)
        growth = median - base_median
        grown = growth > 0.5 + 0.25 * base_median
        base_codec = codec_bytes(args.baseline)
        print(f'  vs baseline: median residual {base_median.mean():.3f} -> {median.mean():.3f}; '
              f'blocks grown {grown.mean() * 100:.2f}%  (max +{growth.max():.2f})')
        print(f'  vs baseline: inter-frame bytes x264 {base_codec["x264"]} -> {codec["x264"]} '
              f'({(codec["x264"] / max(base_codec["x264"], 1) - 1) * 100:+.1f}%), '
              f'av1 {base_codec["av1"]} -> {codec["av1"]} ({(codec["av1"] / max(base_codec["av1"], 1) - 1) * 100:+.1f}%)')
        rel_grown = rel_median - base_rel_median > 0.1 + 0.25 * base_rel_median
        print(f'  vs baseline, relative to detail (more detail alone does not raise it): {base_rel_median.mean():.3f} -> '
              f'{rel_median.mean():.3f}; blocks grown {rel_grown.mean() * 100:.2f}%')
        save_map(np.maximum(growth, 0), 4.0, os.path.join(args.frames, 'residual-growth.png'))
        save_map(np.maximum(rel_median - base_rel_median, 0), 1.0, os.path.join(args.frames, 'relative-growth.png'))
    if args.mv_video:
        with tempfile.TemporaryDirectory() as tmp:
            enc = os.path.join(tmp, 'x264.mp4')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', os.path.join(args.frames, 'frame-%04d.png'),
                            '-c:v', 'libx264', '-qp', '18', '-bf', '0', '-pix_fmt', 'yuv420p', enc], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-flags2', '+export_mvs', '-i', enc, '-vf', 'codecview=mv=pf',
                            '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', args.mv_video], check=True)


if __name__ == '__main__':
    main()
