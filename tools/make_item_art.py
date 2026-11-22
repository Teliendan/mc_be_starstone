"""Starstone item icons, drawn at 16x16 (deterministic; re-running overwrites the outputs).

    python -B tools/make_item_art.py            # write the icons into starstone_rp/textures/items
    (the pack icon is a render of real blocks: tools/make_pack_icon.py)
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
from starstone_art import CLEAR, CRYSTAL, METAL, RP, Canvas, from_rows  # noqa: E402
import make_block_art as block_art  # noqa: E402
from make_block_art import bevel  # noqa: E402

ITEMS = RP / 'textures' / 'items'
WORKSPACE = Path(__file__).resolve().parents[3]


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

def crystal_icon():
    """Starstone Crystal: a brilliant-cut gem (vanilla diamond/emerald convention), echoing the cut crystal on
    the Generator face. Octagon; a table lit top-left with a white rim and a shaded lower-right rim; eight
    crown facets shaded by their direction to the top-left light; dark indigo outline; three glints.
    Owner picked this (option C3) on 2026-11-22."""
    c = Canvas()
    cx, cy = 8.0, 8.0

    def octo(x, y, r, cut):
        dx, dy = abs(x + 0.5 - cx), abs(y + 0.5 - cy)
        return dx <= r and dy <= r and dx + dy <= r + cut

    gem = {(x, y) for y in range(16) for x in range(16) if octo(x, y, 6, 2.6)}
    table = {(x, y) for (x, y) in gem if octo(x, y, 2.6, 1.2)}
    for (x, y) in gem:
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        if (x, y) in table:
            i = 5 if dx + dy < -1 else 4 if dx + dy < 2 else 3
        else:
            k = round(math.atan2(dy, dx) / (math.pi / 4)) % 8          # which of the 8 crown facets
            lit = -(math.cos(k * math.pi / 4) + math.sin(k * math.pi / 4)) / math.sqrt(2)   # 1 = faces the light
            i = 5 if lit > 0.8 else 4 if lit > 0.3 else 3 if lit > -0.3 else 2 if lit > -0.8 else 1
        c[x, y] = CRYSTAL[i]
    for (x, y) in table:
        if any(q not in table for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
            c[x, y] = CRYSTAL[6] if x + y < 15 else CRYSTAL[2]
    for p in mask_outline(gem):
        c[p] = CRYSTAL[0]
    for p in ((5, 5), (6, 4), (7, 6)):
        c[p] = CRYSTAL[6]
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
    """The bend of a cable running into an inside corner, drawn as a square L: one arm up the wall, one along
    the floor to the left, a hub in the crease. Sheath lit on its top/left side, energy line in the middle,
    end ferrules, like the coil. (Owner 2026-11-22: the earlier 2:1 floor arm read as a wrong angle.)"""
    c = Canvas()
    ox, oy = 0, 2                                  # placement of the whole drawing
    floor = {}
    for x in range(2, 9):
        for v, col in enumerate((METAL[4], CRYSTAL[4] if x < 5 else CRYSTAL[3], METAL[2])):
            floor[(x + ox, 8 + v + oy)] = METAL[(5, 4, 3)[v]] if x == 2 else col     # x == 2: end ferrule
    paint_part(c, floor)
    wall = {}
    for y in range(2, 8):
        tip = y == 2
        wall[(10 + ox, y + oy)] = METAL[5] if tip else METAL[4]
        wall[(11 + ox, y + oy)] = METAL[4] if tip else CRYSTAL[4] if y < 5 else CRYSTAL[3]
        wall[(12 + ox, y + oy)] = METAL[3] if tip else METAL[2]
    paint_part(c, wall)
    hub_rows = ['56554', '5ab43', '4cd32', '33221']
    key = {str(i): METAL[i] for i in range(7)} | {'a': CRYSTAL[5], 'b': CRYSTAL[4], 'c': CRYSTAL[4], 'd': CRYSTAL[2]}
    paint_part(c, {(9 + x + ox, 8 + y + oy): key[ch] for y, row in enumerate(hub_rows) for x, ch in enumerate(row)})
    return c


# ---------------------------------------------------------------- redstone adapters

def adapter_icon(kind):
    """The placed adapter seen from above (owner 2026-11-22: icon and block must look alike): the block's own
    8x8 casing and "->" emblem, unmirrored (source left, target right), with a powered source arm in from the
    left and a powered target arm out to the right, each 3 long, on a derived dark outline."""
    c = Canvas()
    red, blue = block_art.redstone_arm(True), block_art.cable_arm(True)
    src, dst = (red, blue) if kind == 'input' else (blue, red)
    ax, ay, _, _ = block_art.LAYOUT['arm4']
    for i in range(3):
        for j in range(2):
            c[1 + i, 7 + j] = src[ax + i, ay + j]
            c[12 + i, 7 + j] = dst[ax + 1 + i, ay + j]
    block_art.casing8(c, 4, 4, block_art.adapter_emblem(kind), mirror=False)
    mask = {(x, y) for y in range(16) for x in range(16) if c.opaque(x, y)}
    for p in mask_outline(mask):
        c[p] = METAL[1] if lit_side(mask, p) else METAL[0]
    return c


# ---------------------------------------------------------------- bridge and lamp

def bridge_icon():
    """The placed Bridge seen from above (owner 2026-11-22: icon and block must look alike), powered: the
    north-south cable with the dot in the middle, the east-west arms running into the port housings beside
    it, on a derived dark outline. Every texel comes from the block textures."""
    c = Canvas()
    arm, ports = block_art.cable_arm(True), block_art.bridge()
    lay = block_art.LAYOUT
    ax, ay, _, _ = lay['arm4']
    for i in range(3):                              # east-west arms, 3 long on the icon
        for j in range(2):
            c[1 + i, 7 + j] = arm[ax + i, ay + j]
            c[14 - i, 7 + j] = arm[ax + 3 - i, ay + j]
    px, py, _, _ = lay['port']
    for k in range(4):                              # port housings, 2 wide, the window turned upright
        for x in (4, 5, 10, 11):
            c[x, 6 + k] = ports[px + k, py]
    sx, sy, _, _ = lay['arm6']
    for k in range(5):                              # north-south arms, 5 long, turned upright
        for j in range(2):
            c[7 + j, 1 + k] = arm[sx + 1 + k, sy + j]
            c[7 + j, 14 - k] = arm[sx + 1 + k, sy + j]
    hx, hy, _, _ = lay['xhub']
    for i in range(4):
        for j in range(4):
            c[6 + i, 6 + j] = arm[hx + i, hy + j]
    mask = {(x, y) for y in range(16) for x in range(16) if c.opaque(x, y)}
    for q in mask_outline(mask):
        c[q] = METAL[1] if lit_side(mask, q) else METAL[0]
    return c


def lamp_icon():
    """The lit Lamp as placed, seen from above: the block texture's panel and four-pane lens, without the
    contacts, on a dark outline."""
    tex = block_art.lamp(True)
    c = Canvas()
    for x in range(1, 15):
        for y in range(1, 15):
            c[x, y] = METAL[0]
    for x in range(2, 14):
        for y in range(2, 14):
            c[x, y] = tex[x, y]
    for x, y in ((1, 1), (14, 1), (1, 14), (14, 14)):
        c[x, y] = CLEAR
    return c




ICONS = {
    'starstone_crystal': crystal_icon,
    'starstone_dust': dust_icon,
    'starstone_compressed_dust': compressed_icon,
    'starstone_cable': cable_icon,
    'starstone_inner_corner': inner_corner_icon,
    'starstone_redstone_input': lambda: adapter_icon('input'),
    'starstone_redstone_output': lambda: adapter_icon('output'),
    'starstone_bridge': bridge_icon,
    'starstone_lamp': lamp_icon,
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
    args = ap.parse_args()
    written = []
    for name, paint in ICONS.items():
        written.append(paint().save(args.out / f'{name}.png'))
    sheet_dir = WORKSPACE / 'temp/starstone-art'
    for p in written:
        print(p)
    if args.sheet:
        out = sheet_dir / 'items_sheet.png'
        cmd = [sys.executable, '-B', str(WORKSPACE / '.claude/skills/bedrock-art/scripts/icon_sheet.py'), str(out),
               *map(str, written), '--ref', *map(str, REFS)]
        subprocess.run(cmd, check=True)


if __name__ == '__main__':
    main()
