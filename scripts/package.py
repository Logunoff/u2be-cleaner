"""Create extension icons and a distributable ZIP using only Python's standard library."""
from pathlib import Path
import math
import struct
import zlib
import zipfile

ROOT = Path(__file__).resolve().parent.parent
icons = ROOT / 'extension' / 'icons'
icons.mkdir(exist_ok=True)

def segment_distance(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

segments = [((10, 9), (10, 24)), ((10, 24), (24, 24)), ((17, 9), (24, 9)), ((24, 9), (24, 16)), ((24, 9), (15, 18))]
for size in (16, 32, 48, 128):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            r, g, b, alpha = 230, 94, 60, 255
            px, py = (x+.5)*32/size, (y+.5)*32/size
            qx, qy = max(7-px, 0, px-25), max(7-py, 0, py-25)
            if math.hypot(qx, qy) > 7: alpha = 0
            d = min(segment_distance(px, py, a, end) for a, end in segments)
            blend = max(0, min(1, (1.5-d)*size/32))
            r, g, b = [round(v*(1-blend)+255*blend) for v in (r,g,b)]
            raw.extend((r,g,b,alpha))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size,size,8,6,0,0,0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    (icons / f'{size}.png').write_bytes(png)

dest = ROOT / 'landing' / 'downloads' / 'laterzero-extension.zip'
dest.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted((ROOT / 'extension').rglob('*')):
        if file.is_file(): archive.write(file, file.relative_to(ROOT / 'extension'))
print(f'Packaged {dest}')
