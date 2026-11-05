# Each photograph beside its render (the same height), for comparing: photoSheet.py <render dir> <out.jpg> [names...]
# POSIX: .venv/bin/python scripts/bench/photoSheet.py .scratch/bench/photos sheet.jpg   PowerShell: .venv\\Scripts\\python.exe scripts\\bench\\photoSheet.py ...
import sys, json
from PIL import Image, ImageDraw, ImageOps
src = '/home/alastair/git/tethered-ring/Cloud Examples/'
d, out = sys.argv[1], sys.argv[2]
views = json.load(open('tests/bench/photoViews.json'))
names = sys.argv[3:] or [v['name'] for v in views]
H = 480
rows = []
for v in views:
    if v['name'] not in names: continue
    p = ImageOps.exif_transpose(Image.open(src + v['photo'])).convert('RGB'); p = p.resize((round(p.width * H / p.height), H))
    r = Image.open(f"{d}/{v['name']}.png").convert('RGB'); r = r.resize((round(r.width * H / r.height), H))
    row = Image.new('RGB', (p.width + r.width + 10, H)); row.paste(p, (0, 0)); row.paste(r, (p.width + 10, 0))
    ImageDraw.Draw(row).text((8, 8), v['name'] + ' (photo | render)', fill=(255, 0, 0)); rows.append(row)
W = max(r.width for r in rows)
sheet = Image.new('RGB', (W, H * len(rows)))
for i, r in enumerate(rows): sheet.paste(r, (0, i * H))
sheet.save(out, quality=85)
