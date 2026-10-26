"""Shared palette and pixel helpers for every Starstone texture and icon (16x16, 1 texel = 1 model unit).

Visual language (docs/GRAPHICS.md): dark navy/gunmetal hardware, dark purple-grey host stone,
blue crystal, blue energy that turns cyan-white when powered, vanilla-red redstone parts.
Each ramp runs dark -> light and shifts hue (blue: purple shadows -> aqua lights).
Light comes from the top-left everywhere.
"""
from pathlib import Path

from PIL import Image

MOD = Path(__file__).resolve().parents[1]
RP = MOD / 'starstone_rp'
BP = MOD / 'starstone_bp'


def hexes(*codes):
    return [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for c in codes]


# Gunmetal/navy hardware: 0 = outline, 6 = rim highlight.
METAL = hexes('#0b0b17', '#151a2d', '#1e2641', '#2a3558', '#3a4a74', '#566b98', '#8299c3')
# Host stone of the ore: dark purple-grey, a little warmer in the shadows.
STONE = hexes('#17131b', '#221c28', '#2d2635', '#3a3243', '#494053', '#5b5266')
# Starstone crystal: indigo shadow -> blue -> cyan -> near-white glint.
CRYSTAL = hexes('#0d1352', '#132f9c', '#1b58d6', '#2a8cf4', '#48c2ff', '#9ce8ff', '#effcff')
# Unpowered energy core: dim blue, never brighter than CRYSTAL[2].
ENERGY_OFF = hexes('#121f43', '#1a3263', '#24478a', '#2f5aa6')
# Powered energy: blue -> cyan -> white core.
ENERGY_ON = hexes('#1b58d6', '#2aa6ff', '#5fdcff', '#bff5ff', '#ffffff')
# Redstone, matched to vanilla redstone dust (off = unlit dust, on = lit dust).
RED_OFF = hexes('#2e0404', '#4a0808', '#650d0b', '#7d1510')
RED_ON = hexes('#6a0000', '#a80a06', '#e01a10', '#ff5a3c', '#ff9c80')

CLEAR = (0, 0, 0, 0)


class Canvas:
    """A small RGBA pixel grid; coordinates are (x, y) with y down."""

    def __init__(self, w=16, h=16, fill=CLEAR):
        self.w, self.h = w, h
        self.px = [[fill] * w for _ in range(h)]

    def __getitem__(self, xy):
        x, y = xy
        return self.px[y][x]

    def __setitem__(self, xy, colour):
        x, y = xy
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = colour

    def rect(self, x0, y0, x1, y1, colour):
        """Fill the inclusive rectangle x0..x1, y0..y1."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self[x, y] = colour

    def opaque(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.px[y][x][3] > 0

    def outline(self, colour_for):
        """Paint every empty texel 4-adjacent to the shape; colour_for(x, y) picks its shade."""
        edge = [(x, y) for y in range(self.h) for x in range(self.w)
                if not self.opaque(x, y) and any(self.opaque(x + dx, y + dy)
                                                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in edge:
            self[x, y] = colour_for(x, y)

    def image(self):
        im = Image.new('RGBA', (self.w, self.h))
        im.putdata([c for row in self.px for c in row])
        return im

    def save(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image().save(path)
        return path


def from_rows(rows, key, w=16):
    """Build a Canvas from a character grid; key maps characters to colours ('.' = clear)."""
    c = Canvas(w, len(rows))
    for y, row in enumerate(rows):
        assert len(row) == w, f'row {y} has {len(row)} chars, expected {w}: {row!r}'
        for x, ch in enumerate(row):
            if ch != '.':
                c[x, y] = key[ch]
    return c
