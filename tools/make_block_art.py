"""Generate every Starstone block texture at 16x16 (1 texel = 1 model unit).

    python -B mods/starstone/tools/make_block_art.py [--sheet DIR]

Full cubes (ore, casing, conduit ends, generator) are painted as whole tiles. The thin models
(cable, inner corner, bridge, adapters, lamp) sample small windows; LAYOUT below names every
window, and make_block_models.py maps the faces onto them. Parts that turn with their support
face (cable arms, hubs, adapter arms) are shaded symmetrically so no rotation looks wrong.
"""
import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from starstone_art import (CLEAR, CRYSTAL, ENERGY_OFF, ENERGY_ON, METAL, RED_OFF, RED_ON, RP, STONE,  # noqa: E402
                           Canvas)

OUT = RP / 'textures' / 'blocks'

# Texture windows used by the models: name -> (x, y, w, h).
LAYOUT = {
    'arm6': (0, 0, 6, 2),     # cable / inner corner arm, cell edge -> hub (6 units)
    'arm5': (0, 2, 5, 2),     # adapter and bridge arm, cell edge -> casing (5 units)
    'arm_side6': (0, 0, 6, 1),
    'arm_side5': (0, 2, 5, 1),
    'arm_end': (0, 0, 2, 1),
    'hub': (6, 6, 4, 4),      # cable hub top (4x4)
    'hub_side': (6, 6, 4, 1),
    'plate': (5, 5, 6, 6),    # bridge / adapter casing top (6x6)
    'plate_side': (5, 5, 6, 1),
    'panel': (2, 2, 12, 12),  # lamp panel top
    'panel_side': (2, 2, 12, 1),
    'contact_ns': (6, 0, 4, 2),
    'contact_ew': (0, 6, 2, 4),
    'contact_side_long': (6, 0, 4, 1),
    'contact_side_short': (6, 0, 2, 1),
}


def bevel(c, x0, y0, x1, y1, light, dark, corner=None):
    """Outer rim of a raised plate: top/left lit, bottom/right shaded."""
    for x in range(x0, x1 + 1):
        c[x, y0], c[x, y1] = light, dark
    for y in range(y0, y1 + 1):
        c[x0, y], c[x1, y] = light, dark
    if corner:
        c[x1, y0] = c[x0, y1] = corner


def rivet(c, x, y):
    """2x2 bolt head lit from above."""
    c[x, y], c[x + 1, y], c[x, y + 1], c[x + 1, y + 1] = METAL[6], METAL[6], METAL[4], METAL[4]


# ---------------------------------------------------------------- casing family

def machine_frame():
    """Navy hardware tile shared by casing, conduit ends and generator: bevelled rim, recessed field.
    Lit from the top and symmetric left-right: the Conduit's custom geometry renders model X mirrored,
    so a top-left bevel would turn top-right there and clash with the Generator next to it."""
    c = Canvas(fill=METAL[3])
    for i in range(16):
        c[i, 0], c[i, 1] = METAL[5], METAL[4]
        c[i, 15], c[i, 14] = METAL[1], METAL[2]
    for i in range(1, 15):
        c[0, i] = c[15, i] = METAL[4] if i < 8 else METAL[3]
        c[1, i] = c[14, i] = METAL[3] if i < 8 else METAL[2]
    c[0, 15] = c[15, 15] = METAL[1]
    # Recessed field: shadow cast by the top frame, a lit lip at the bottom, mid-tone sides.
    c.rect(3, 3, 12, 12, METAL[2])
    for i in range(3, 13):
        c[i, 3] = METAL[1]
        c[i, 12] = METAL[3]
        c[3, i] = c[12, i] = METAL[1] if i < 8 else METAL[2]
    c[3, 12] = c[12, 12] = METAL[2]
    for x, y in ((1, 1), (13, 1), (1, 13), (13, 13)):
        rivet(c, x, y)
    return c


def casing():
    c = machine_frame()
    # Two vent slots in the field so a whole wall of casing is not a flat navy plane.
    for y in (6, 9):
        for x in range(5, 11):
            c[x, y] = METAL[0]
            c[x, y + 1] = METAL[3]
    return c


def conduit_end(powered):
    c = machine_frame()
    glow = ENERGY_ON if powered else ENERGY_OFF
    # Round port: a 8x8 metal ring (lit lower-right lip, shadowed upper-left) around a 4x4 core.
    ring = [
        '..1111..',
        '.122224.',
        '12....34',
        '12....44',
        '12....44',
        '13....44',
        '.344444.',
        '..4444..',
    ]
    shade = {'1': METAL[1], '2': METAL[0], '3': METAL[3], '4': METAL[4]}
    for dy, row in enumerate(ring):
        for dx, ch in enumerate(row):
            if ch in shade:
                c[4 + dx, 4 + dy] = shade[ch]
    if powered:
        core = ['2333', '3443', '3443', '2332']
        key = {'2': glow[1], '3': glow[2], '4': glow[4]}
    else:
        core = ['1222', '2332', '2331', '1110']
        key = {'0': glow[0], '1': glow[1], '2': glow[2], '3': glow[3]}
    for dy, row in enumerate(core):
        for dx, ch in enumerate(row):
            c[6 + dx, 6 + dy] = key[ch]
    # Glow leaking into the ring on the powered end.
    if powered:
        for x, y in ((7, 5), (8, 5), (5, 7), (5, 8), (10, 7), (10, 8), (7, 10), (8, 10)):
            c[x, y] = ENERGY_ON[0]
    # Port notches in the frame, top/bottom/left/right, so the axis end reads as a socket.
    for x, y in ((7, 1), (8, 1), (7, 14), (8, 14), (1, 7), (1, 8), (14, 7), (14, 8)):
        c[x, y] = glow[1] if powered else METAL[0]
    return c


def generator(powered):
    c = machine_frame()
    gem = CRYSTAL if powered else [METAL[1], ENERGY_OFF[0], ENERGY_OFF[1], ENERGY_OFF[2],
                                    ENERGY_OFF[3], CRYSTAL[2], CRYSTAL[3]]
    # Cut gem seen from above: octagon outline, a ring of crown facets shaded by the direction
    # they face (top-left lit), a flat table in the middle with one glint line.
    facet = {'n': 5, 'w': 4, 'e': 2, 's': 1, 'nw': 6, 'ne': 3, 'sw': 3, 'se': 1}
    for dy in range(10):
        for dx in range(10):
            cut = min(dx, 9 - dx) + min(dy, 9 - dy)
            if cut < 2:
                continue  # octagon corners
            x, y = 3 + dx, 3 + dy
            if cut == 2 or dx in (0, 9) or dy in (0, 9):
                c[x, y] = gem[0]
            elif 3 <= dx <= 6 and 3 <= dy <= 6:
                c[x, y] = gem[5] if dx + dy == 7 else gem[4] if dx + dy < 7 else gem[3]
            else:
                ns = 'n' if dy < 3 else 's' if dy > 6 else ''
                we = 'w' if dx < 3 else 'e' if dx > 6 else ''
                if ns and we:  # diagonal facet, split from its neighbours along the diagonal
                    c[x, y] = gem[facet[ns + we]]
                else:
                    c[x, y] = gem[facet[ns or we]]
    c[6, 6] = gem[6]
    # Power taps at the four edge midpoints.
    tap = ENERGY_ON[3] if powered else ENERGY_OFF[1]
    tap_dark = ENERGY_ON[1] if powered else ENERGY_OFF[0]
    for x, y in ((7, 1), (1, 7)):
        c[x, y], c[x + (y == 1), y + (x == 1)] = tap, tap_dark
    for x, y in ((7, 14), (14, 7)):
        c[x, y], c[x + (y == 14), y + (x == 14)] = tap_dark, tap_dark
    return c


# ---------------------------------------------------------------- ore

def tone_field(x, y):
    """Tiling tone field over 16 texels (whole-number periods), mostly horizontal strata like deepslate."""
    t = (math.cos(2 * math.pi * (y + 0.6 * math.sin(2 * math.pi * x / 16)) / 8)
         + 0.6 * math.cos(2 * math.pi * (x + 2 * y) / 16 + 1.3)
         + 0.45 * math.cos(2 * math.pi * (3 * x - y) / 16 + 0.4))
    return t


def ore():
    c = Canvas()
    vals = sorted(tone_field(x, y) for y in range(16) for x in range(16))
    cuts = [vals[int(len(vals) * q)] for q in (0.18, 0.5, 0.85)]
    for y in range(16):
        for x in range(16):
            v = tone_field(x, y)
            c[x, y] = STONE[1 + sum(v > k for k in cuts)]
    # Lift the top-left edge of every lighter patch one step: stones read as lumps, not blur.
    base = [[c[x, y] for x in range(16)] for y in range(16)]
    for y in range(16):
        for x in range(16):
            here, up, left = base[y][x], base[(y - 1) % 16][x], base[y][(x - 1) % 16]
            if STONE.index(here) >= 3 and STONE.index(up) < STONE.index(here) and STONE.index(left) < STONE.index(here):
                c[x, y] = STONE[5]
            elif STONE.index(here) == 1 and STONE.index(up) == 1 and STONE.index(left) > 2:
                c[x, y] = STONE[0]
    # Crystal shards (x, y, rows): diagonal prisms lit on the top-left, 0 = dark seat in the rock.
    clusters = [
        (2, 1, ['65.', '543', '42.', '3..', '0..']),             # upright prism
        (9, 0, ['...6', '..65', '.643', '642.', '30..']),        # long '/' shard
        (6, 7, ['.6..', '6543', '.432', '..0.']),                # chunk
        (13, 6, ['6.', '54', '0.']),                             # chip
        (0, 10, ['6...', '554.', '.4432', '..30']),              # '\' shard
        (10, 11, ['.6.6', '6545', '4320', '0...']),             # twin points
    ]
    for x0, y0, rows in clusters:
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch == '0':
                    c[(x0 + dx) % 16, (y0 + dy) % 16] = STONE[0]
                elif ch != '.':
                    c[(x0 + dx) % 16, (y0 + dy) % 16] = CRYSTAL[int(ch)]
    return c


# ---------------------------------------------------------------- thin parts (windows, see LAYOUT)

def strip(c, x0, y0, pattern, ramp, end):
    """Two-texel-wide conductor; pattern indexes ramp, 'm' is a clamp in the end colour.
    Both rows match: the part turns with its support, so it carries no light direction."""
    for i, ch in enumerate(pattern):
        col = end if ch == 'm' else ramp[int(ch)]
        c[x0 + i, y0] = c[x0 + i, y0 + 1] = col


def cable_arm(powered):
    c = Canvas()
    ramp = ENERGY_ON if powered else ENERGY_OFF
    # Palindromes: the end at the cell edge and the end at the hub look alike, so the
    # mirrored/rotated arms all join neighbours with a clamp pair (a coupling).
    strip(c, 0, 0, 'm2332m' if powered else 'm1221m', ramp, METAL[3])
    strip(c, 0, 2, 'm232m' if powered else 'm121m', ramp, METAL[3])
    return c


def redstone_arm(powered):
    c = Canvas()
    ramp = RED_ON if powered else RED_OFF
    strip(c, 0, 0, '213312' if powered else '123321', ramp, None)
    strip(c, 0, 2, '23432' if powered else '12321', ramp, None)
    # Dust grain: one darker texel per row, offset between rows (no checkerboard).
    c[1, 2] = ramp[1]
    c[3, 3] = ramp[1]
    c[2, 0] = ramp[1]
    c[4, 1] = ramp[1]
    return c


def cable_hub(powered):
    c = Canvas()
    ramp = ENERGY_ON if powered else ENERGY_OFF
    x0, y0, _, _ = LAYOUT['hub']
    edge, core = (ramp[1], ramp[4]) if powered else (ramp[1], ramp[3])
    # Four-fold symmetric node: metal corners, conductor edges that continue the arms, bright core.
    for dy in range(4):
        for dx in range(4):
            corner = dx in (0, 3) and dy in (0, 3)
            inner = dx in (1, 2) and dy in (1, 2)
            c[x0 + dx, y0 + dy] = METAL[4] if corner else core if inner else edge
    return c


def plate(c, emblem):
    """6x6 raised casing plate at LAYOUT['plate'] with a 4x4 emblem (rows of ramp colours)."""
    x0, y0, _, _ = LAYOUT['plate']
    c.rect(x0, y0, x0 + 5, y0 + 5, METAL[3])
    bevel(c, x0, y0, x0 + 5, y0 + 5, METAL[5], METAL[1], METAL[3])
    for dy, row in enumerate(emblem):
        for dx, col in enumerate(row):
            if col is not None:
                c[x0 + 1 + dx, y0 + 1 + dy] = col


def bridge():
    c = Canvas()
    m = METAL
    # The east-west lane runs under the plate: dark ports at its ends, a covered channel between.
    plate(c, [
        [m[4], m[3], m[3], m[2]],
        [m[0], m[1], m[1], m[0]],
        [m[0], m[1], m[1], m[0]],
        [m[3], m[2], m[2], m[2]],
    ])
    return c


def adapter(kind):
    """Redstone input: red -> blue. Output: blue -> red. The emblem shows the conversion direction."""
    c = Canvas()
    r, b = RED_ON[2], ENERGY_ON[1]
    rd, bd = RED_ON[1], ENERGY_ON[0]
    src, src_d, dst, dst_d = (r, rd, b, bd) if kind == 'input' else (b, bd, r, rd)
    # A "->": shaft in the source colour, arrowhead in the target colour. Model X mirrors world X
    # (see the cableVisual tests), so it is drawn pointing to texture left; seen from above in the
    # world it runs from the source on the left to the target on the right.
    plate(c, [
        [None, dst, None, None],
        [dst, dst, src, src],
        [dst_d, dst, src_d, src_d],
        [None, dst_d, None, None],
    ])
    return c


def lamp(powered):
    """Top view of the whole device: 12x12 panel with a framed lens, four contacts to the cell edges."""
    c = Canvas()
    glow = ENERGY_ON if powered else ENERGY_OFF
    x0, y0 = 2, 2
    c.rect(x0, y0, x0 + 11, y0 + 11, METAL[3])
    bevel(c, x0, y0, x0 + 11, y0 + 11, METAL[5], METAL[1], METAL[3])
    for x, y in ((3, 3), (11, 3), (3, 11), (11, 11)):
        c[x, y] = METAL[5]
        c[x + 1, y + 1] = METAL[2]
    # Lens 8x8 behind a frame: four panes split by a metal cross (like a redstone lamp's cells).
    lx, ly = x0 + 2, y0 + 2
    for x in range(8):
        c[lx + x, ly - 1] = METAL[1]
        c[lx - 1, ly + x] = METAL[1]
        c[lx + x, ly + 8] = METAL[4]
        c[lx + 8, ly + x] = METAL[4]
    for dy in range(8):
        for dx in range(8):
            if dx in (3, 4) or dy in (3, 4):
                c[lx + dx, ly + dy] = (glow[1] if powered else METAL[2]) if (dx in (3, 4)) != (dy in (3, 4))                     else (glow[2] if powered else METAL[3])
                continue
            px, py = dx % 5, dy % 5  # position inside its 3x3 pane
            if powered:
                tone = 4 if px + py == 0 else 3 if px + py < 3 else 2
            else:
                tone = 3 if px + py == 0 else 1 if px + py < 3 else 0
            c[lx + dx, ly + dy] = glow[tone]
    # Contacts (4 long, 2 deep) to each cell edge.
    for x in range(6, 10):
        for y in (0, 1, 14, 15):
            c[x, y] = METAL[4] if x in (6, 9) else glow[2] if powered else METAL[2]
    for y in range(6, 10):
        for x in (0, 1, 14, 15):
            c[x, y] = METAL[4] if y in (6, 9) else glow[2] if powered else METAL[2]
    return c


TEXTURES = {
    'starstone_ore': ore,
    'starstone_casing': casing,
    'starstone_conduit_end': lambda: conduit_end(True),
    'starstone_conduit_end_off': lambda: conduit_end(False),
    'starstone_generator': lambda: generator(True),
    'starstone_generator_off': lambda: generator(False),
    'starstone_cable_arm_on': lambda: cable_arm(True),
    'starstone_cable_arm_off': lambda: cable_arm(False),
    'starstone_cable_hub_on': lambda: cable_hub(True),
    'starstone_cable_hub_off': lambda: cable_hub(False),
    'starstone_redstone_arm_on': lambda: redstone_arm(True),
    'starstone_redstone_arm_off': lambda: redstone_arm(False),
    'starstone_bridge': bridge,
    'starstone_redstone_input': lambda: adapter('input'),
    'starstone_redstone_output': lambda: adapter('output'),
    'starstone_lamp_on': lambda: lamp(True),
    'starstone_lamp_off': lambda: lamp(False),
}


def check_windows(images):
    """Every window a model samples must be fully painted in the textures that use it."""
    uses = {
        'arm6': ['starstone_cable_arm_on', 'starstone_cable_arm_off', 'starstone_redstone_arm_on',
                 'starstone_redstone_arm_off'],
        'arm5': ['starstone_cable_arm_on', 'starstone_cable_arm_off', 'starstone_redstone_arm_on',
                 'starstone_redstone_arm_off'],
        'hub': ['starstone_cable_hub_on', 'starstone_cable_hub_off'],
        'plate': ['starstone_bridge', 'starstone_redstone_input', 'starstone_redstone_output'],
        'panel': ['starstone_lamp_on', 'starstone_lamp_off'],
        'contact_ns': ['starstone_lamp_on', 'starstone_lamp_off'],
        'contact_ew': ['starstone_lamp_on', 'starstone_lamp_off'],
    }
    for window, names in uses.items():
        x0, y0, w, h = LAYOUT[window]
        for name in names:
            im = images[name]
            holes = [(x, y) for y in range(y0, y0 + h) for x in range(x0, x0 + w) if im[x, y][3] == 0]
            assert not holes, f'{name}: window {window} has unpainted texels {holes}'


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out', default=str(OUT), help='output folder (default: the resource pack)')
    args = ap.parse_args()
    images = {name: make() for name, make in TEXTURES.items()}
    check_windows(images)
    for name, c in images.items():
        c.save(Path(args.out) / f'{name}.png')
    print(f'wrote {len(images)} textures to {args.out}')


if __name__ == '__main__':
    main()
