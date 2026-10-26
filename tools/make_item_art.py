"""Starstone item icons and the pack icon, drawn at 16x16 (deterministic; re-running overwrites the outputs).

    python -B tools/make_item_art.py            # write the icons into starstone_rp/textures/items + both pack icons
    python -B tools/make_item_art.py --sheet    # also write the review sheet temp/starstone-art/items_sheet.png

Shapes are painters or character grids, shading is by rule (light from the top-left), outlines are derived.
Colours come only from the shared ramps in starstone_art.py.
"""
import argparse
import math
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from starstone_art import BP, CLEAR, CRYSTAL, METAL, RED_ON, RP, Canvas, from_rows  # noqa: E402

ITEMS = RP / 'textures' / 'items'
WORKSPACE = Path(__file__).resolve().parents[3]
LIGHT = (-1 / math.sqrt(2), -1 / math.sqrt(2))  # towards the light: top-left


def mask_outline(mask):
    """4-neighbour ring round a set of pixels (the derived outline)."""
    ring = set()
    for x, y in mask:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = (x + dx, y + dy)
            if p not in mask and 0 <= p[0] < 16 and 0 <= p[1] < 16:
                ring.add(p)
    return ring


def lit_side(mask, p):
    """True when an outline pixel sits above/left of the shape (faces the light)."""
    x, y = p
    return (x + 1, y) in mask or (x, y + 1) in mask


# ---------------------------------------------------------------- crystal cluster

def crystal_prism(c, base, tip, hw, tip_len, glint=()):
    """One hexagonal crystal, base -> tip, half-width hw. Three facets across (lit, front, shadow),
    lighter towards the tip; own outline painted first so it lies on whatever is behind it."""
    bx, by = base
    dx, dy = tip[0] - bx, tip[1] - by
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    px_, py_ = -uy, ux
    if px_ * LIGHT[0] + py_ * LIGHT[1] < 0:
        px_, py_ = -px_, -py_
    fill = {}
    for y in range(16):
        for x in range(16):
            cx, cy = x + 0.5 - bx, y + 0.5 - by
            u = cx * ux + cy * uy
            s = cx * px_ + cy * py_
            if not 0 <= u <= length:
                continue
            w = hw * min(1.0, (length - u) / tip_len)
            if abs(s) > w + 0.05:
                continue
            f = s / hw
            idx = 4 if f > 0.3 else 3 if f > -0.3 else 2
            t = u / length
            if t > 0.72:
                idx += 1
            elif t < 0.22:
                idx -= 1
            fill[(x, y)] = idx
    for p in mask_outline(set(fill)):
        c[p] = CRYSTAL[1] if lit_side(fill, p) else CRYSTAL[0]
    for p, idx in fill.items():
        c[p] = CRYSTAL[idx]
    for p in glint:
        c[p] = CRYSTAL[6]
    return fill


def crystal_icon():
    c = Canvas()
    crystal_prism(c, (6.6, 13.3), (2.2, 6.9), 1.35, 1.8, glint=[(3, 8)])
    crystal_prism(c, (9.4, 13.3), (13.8, 6.3), 1.35, 1.8, glint=[(12, 7)])
    crystal_prism(c, (8.0, 13.5), (8.0, 1.4), 2.0, 2.6, glint=[(6, 5), (6, 6), (7, 3)])
    return c


# ---------------------------------------------------------------- dust

DUST = [  # CRYSTAL ramp indices; grains placed by hand (light top-left, dark bottom-right), two sparkles (6)
    '................',
    '................',
    '................',
    '.......11.......',
    '......1541......',
    '.....145430.....',
    '....14365320....',
    '...1453453320...',
    '..145435343220..',
    '..143543436320..',
    '..134352432210..',
    '...0233423210...',
    '....00232100....',
    '......0000......',
    '................',
    '................',
]


def dust_icon():
    return from_rows(DUST, {str(i): CRYSTAL[i] for i in range(7)})


# ---------------------------------------------------------------- compressed dust

def iso_brick(x0, y0, a, b, h):
    """Faces of a 2:1 isometric box whose top has its back corner at (x0, y0), extent a along the right-down
    axis and b along the left-down axis, sides h tall. Returns {(x, y): (face, u, v, depth)}."""
    def uv(px, py):
        return (py + px / 2) / 2, (py - px / 2) / 2

    faces = {}
    for y in range(16):
        for x in range(16):
            px, py = x + 0.5 - x0, y + 0.5 - y0
            u, v = uv(px, py)
            if 0 <= u <= a and 0 <= v <= b:
                faces[(x, y)] = ('T', u, v, 0)
                continue
            for z in range(1, h + 1):
                u, v = uv(px, py - z)
                if 0 <= u <= a and 0 <= v <= b:
                    faces[(x, y)] = ('L' if px < 2 * a - 2 * b else 'R', u, v, z)
                    break
    return faces


# Specks: a few grains pressed into the faces (+ lighter, - darker); fixed, not random.
COMPRESSED_SPECKS = {(5, 5): 1, (9, 6): -1, (11, 5): 1, (7, 7): -1, (4, 8): 1, (7, 9): 1, (11, 9): 1,
                     (12, 7): 1, (3, 7): 1, (6, 10): 1, (8, 8): -1, (9, 11): -1}


def compressed_icon():
    """Dust pressed into a compact brick: a 2:1 isometric brick, bright top, mid long front face, dark short
    side, crisp lit edges, a few grains. Same CRYSTAL ramp as the dust."""
    c = Canvas()
    A, B = 4, 2
    faces = iso_brick(6, 2.5, A, B, 4)            # these numbers give clean 2-px stairs on every edge
    for (x, y), (f, u, v, z) in faces.items():
        if f == 'T':
            back_rim = faces.get((x, y - 1), ('-',))[0] != 'T'
            below = faces.get((x, y + 1), ('-',))[0]
            idx = 5 if back_rim or below == 'L' else 4 if below == 'R' or u + v < A + B - 1.5 else 3
        elif f == 'L':
            idx = 3 if z <= 1 else 2
        else:
            idx = 2 if z <= 1 else 1
        idx += COMPRESSED_SPECKS.get((x, y), 0)
        c[x, y] = CRYSTAL[max(1, min(6, idx))]
    mask = set(faces)
    for p in mask_outline(mask):
        c[p] = CRYSTAL[1] if lit_side(mask, p) else CRYSTAL[0]
    c[4, 5] = CRYSTAL[6]
    return c


# ---------------------------------------------------------------- cable coil

def ring(cx, cy, rx, ry, irx, iry):
    """Pixels of an elliptical ring (outer minus inner ellipse), tested at pixel centres."""
    out = set()
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if (dx / rx) ** 2 + (dy / ry) ** 2 <= 1 and (dx / irx) ** 2 + (dy / iry) ** 2 > 1:
                out.add((x, y))
    return out


CABLE_TAIL = [  # loose end hanging from the bottom turn's right side, ending in a plug ('P'/'Q' collar, 'S'/'T' pins)
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '............o...',
    '...........obo..',
    '............Eco.',
    '...........oPQo.',
    '...........oSTo.',
    '............oo..',
    '................',
]


def cable_icon():
    """A hank of Surface Cable: 3 turns stacked, seen from the front and above, each turn a ring with its own
    derived outline drawn back to front (bottom turn first). The blue energy line runs along the outer,
    lower edge of each front arc. A loose end with a plug leaves the bottom turn at the front-right."""
    c = Canvas()
    cx, rx, ry, irx, iry = 7.0, 5.1, 2.7, 3.2, 1.1
    tops = (10.2, 7.3, 4.4)
    for cy, dark in zip(tops, (1, 1, 0)):
        band = ring(cx, cy, rx, ry, irx, iry)
        for p in mask_outline(band):
            c[p] = METAL[0]
        for x, y in band:
            front = y + 0.5 > cy
            right = x + 0.5 > cx + 2
            if front and (x, y + 1) not in band:
                col = CRYSTAL[2] if x + 0.5 > cx + 3 else CRYSTAL[3] if right or x + 0.5 > cx else CRYSTAL[4]
            elif front:
                col = METAL[(3 if right else 4) - dark]
            elif (x, y - 1) not in band and y + 0.5 < cy - 1:
                col = METAL[(4 if right else 5) - dark]          # top of the back arc
            else:
                col = METAL[(2 if right else 4) - dark]          # sides
            c[x, y] = col
    for y in range(16):                        # dark hole inside the top turn
        for x in range(16):
            if ((x + 0.5 - cx) / irx) ** 2 + ((y + 0.5 - tops[-1]) / iry) ** 2 <= 1:
                c[x, y] = METAL[1] if y + 0.5 > tops[-1] else METAL[0]
    key = {'o': METAL[0], 'b': METAL[4], 'c': METAL[3], 'd': METAL[2], 'E': CRYSTAL[3],
           'P': METAL[6], 'Q': METAL[4], 'S': CRYSTAL[5], 'T': CRYSTAL[3]}
    for y, row in enumerate(CABLE_TAIL):
        for x, ch in enumerate(row):
            if ch != '.':
                c[x, y] = key[ch]
    return c


# ---------------------------------------------------------------- inner corner

def paint_part(c, part):
    """Paint {(x, y): colour} over the canvas with its own derived outline underneath (back-to-front);
    the outline is a shade lighter where it faces the light."""
    mask = set(part)
    for p in mask_outline(mask):
        c[p] = METAL[1] if lit_side(mask, p) else METAL[0]
    for p, col in part.items():
        c[p] = col


def inner_corner_icon():
    """The bend of a cable running into an inside corner, seen from above: one arm up the back wall, one along
    the floor towards the viewer (2:1), a hub in the crease. Sheath lit on its top/left side, energy line in
    the middle, like the coil."""
    c = Canvas()
    ox, oy = 1, 0                                  # placement of the whole drawing
    floor = {}
    for x in range(2, 8):
        line = 9 + (7 - x) // 2
        for v, col in enumerate((METAL[4], CRYSTAL[4] if x < 5 else CRYSTAL[3], METAL[2])):
            floor[(x + ox, line + v + oy)] = METAL[(5, 4, 3)[v]] if x == 2 else col     # x == 2: end ferrule
    paint_part(c, floor)
    wall = {}
    for y in range(2, 8):
        tip = y == 2
        wall[(9 + ox, y + oy)] = METAL[5] if tip else METAL[4]
        wall[(10 + ox, y + oy)] = METAL[4] if tip else CRYSTAL[4] if y < 5 else CRYSTAL[3]
        wall[(11 + ox, y + oy)] = METAL[3] if tip else METAL[2]
    paint_part(c, wall)
    hub_rows = ['56554', '5ab43', '4cd32', '33221']
    key = {str(i): METAL[i] for i in range(7)} | {'a': CRYSTAL[5], 'b': CRYSTAL[4], 'c': CRYSTAL[4], 'd': CRYSTAL[2]}
    paint_part(c, {(8 + x + ox, 8 + y + oy): key[ch] for y, row in enumerate(hub_rows) for x, ch in enumerate(row)})
    return c


# ---------------------------------------------------------------- redstone adapters

ADAPTER = [
    '................',
    '................',
    '................',
    '................',
    '...oooooooooo...',
    '..o6555555544o..',
    '.o54ddddddddd3o.',
    '.o4dAAAdddddd2o.',
    '.o4dAAAdddddd2o.',
    '.o3dddddddddd2o.',
    '..o3222222221o..',
    '...oooooooooo...',
    '................',
    '................',
    '................',
    '................',
]
ARROW = {  # (x, y): shade 0 dark .. 3 light; shaft then head pointing right
    (7, 7): 2, (8, 7): 2, (9, 7): 2, (7, 8): 1, (8, 8): 1, (9, 8): 1,
    (10, 5): 3, (10, 6): 2, (10, 7): 2, (10, 8): 1, (10, 9): 1, (10, 10): 0,
    (11, 6): 3, (11, 7): 2, (11, 8): 1, (11, 9): 0,
    (12, 7): 3, (12, 8): 1,
}
ARROW_EDGE = [(9, 4), (10, 4), (11, 5), (12, 6), (13, 7), (13, 8), (12, 9), (11, 10), (10, 11), (9, 11)]


def adapter_icon(source, target):
    """Navy plate with a recessed slot: the source signal as a block on the left, an arrow of the target
    signal pointing right. source/target: 4-shade ramps dark -> light."""
    key = {'o': METAL[0], 'd': METAL[1], 'A': METAL[1]} | {str(i): METAL[i] for i in range(7)}
    c = from_rows(ADAPTER, key)     # 'd' = the dark slot floor, 'A' = where the source block sits
    for (x, y), shade in {(4, 7): 3, (5, 7): 2, (6, 7): 1, (4, 8): 2, (5, 8): 1, (6, 8): 0}.items():
        c[x, y] = source[shade]
    for p in ARROW_EDGE:
        c[p] = METAL[0]
    for (x, y), shade in ARROW.items():
        c[x, y] = target[shade]
    return c


RED = [RED_ON[1], RED_ON[2], RED_ON[3], RED_ON[4]]
CYAN = [CRYSTAL[3], CRYSTAL[4], CRYSTAL[5], CRYSTAL[6]]


# ---------------------------------------------------------------- pack icon

def pack_icon():
    c = Canvas()
    for y in range(16):
        for x in range(16):
            edge = min(x, y, 15 - x, 15 - y)
            if edge == 0:
                col = METAL[0]
            elif edge == 1:
                col = METAL[4] if (x == 1 or y == 1) and x < 15 - 1 and y < 15 - 1 else METAL[2]
            else:
                col = METAL[2] if (x + y) < 15 else METAL[1]
            c[x, y] = col
    for corner in ((0, 0), (0, 15), (15, 0), (15, 15)):
        c[corner] = CLEAR
    for x, y in ((2, 2), (13, 2), (2, 13), (13, 13)):   # corner bolts, as on the casing
        c[x, y] = METAL[5]
        c[x + 1, y + 1] = METAL[0]
    crystal = crystal_icon()
    for y in range(16):
        for x in range(16):
            if crystal.opaque(x, y):
                c[x, y] = crystal[x, y]
    return c


ICONS = {
    'starstone_crystal': crystal_icon,
    'starstone_dust': dust_icon,
    'starstone_compressed_dust': compressed_icon,
    'starstone_cable': cable_icon,
    'starstone_inner_corner': inner_corner_icon,
    'starstone_redstone_input': lambda: adapter_icon(RED, CYAN),
    'starstone_redstone_output': lambda: adapter_icon(CYAN, RED),
}

VANILLA = WORKSPACE / 'reference/vanilla/current/resource_packs'
REFS = [VANILLA / 'vanilla/textures/items/diamond.png',
        VANILLA / 'vanilla_1.17.0/textures/items/amethyst_shard.png',
        VANILLA / 'vanilla/textures/items/redstone_dust.png',
        VANILLA / 'vanilla/textures/items/glowstone_dust.png',
        VANILLA / 'vanilla/textures/items/brick.png',
        VANILLA / 'vanilla/textures/items/string.png',
        VANILLA / 'vanilla/textures/items/repeater.png']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', action='store_true', help='write temp/starstone-art/items_sheet.png')
    ap.add_argument('--out', type=Path, default=ITEMS, help='icon output folder (default: the RP)')
    ap.add_argument('--no-pack', action='store_true', help='do not write the pack icons')
    args = ap.parse_args()
    written = []
    for name, paint in ICONS.items():
        written.append(paint().save(args.out / f'{name}.png'))
    pack16 = pack_icon()
    big = pack16.image().resize((256, 256), resample=0)  # NEAREST, exactly 16x
    if not args.no_pack:
        for pack in (BP, RP):
            big.save(pack / 'pack_icon.png')
    sheet_dir = WORKSPACE / 'temp/starstone-art'
    pack16.save(sheet_dir / 'icons/pack_icon16.png')
    for p in written:
        print(p)
    if args.sheet:
        out = sheet_dir / 'items_sheet.png'
        cmd = [sys.executable, '-B', str(WORKSPACE / '.claude/skills/bedrock-art/scripts/icon_sheet.py'), str(out),
               *map(str, written), str(sheet_dir / 'icons/pack_icon16.png'), '--ref', *map(str, REFS)]
        subprocess.run(cmd, check=True)


if __name__ == '__main__':
    main()
