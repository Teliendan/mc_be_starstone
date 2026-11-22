"""Starstone pack icon ("working circuit", owner pick B1 on 2026-11-22), rendered only from the mod's real block
models and textures: a deepslate-brick room corner, a powered Generator, a Cable to an Inner Corner, a lit Lamp on
the side wall, one Starstone Ore block in the back wall. Deterministic; re-running overwrites both pack icons.

    python -B mods/starstone/tools/make_pack_icon.py            # write starstone_bp/ and starstone_rp/pack_icon.png
    python -B mods/starstone/tools/make_pack_icon.py --sheet    # also temp/starstone-art/pack_sheet.png (256/128/64/32)

Re-run it after any change to the textures or models it shows. Scene space = Blockbench space = world space
(east +x, south +z, up +y; 16 units per block). Model geometry x is mirrored (Blockbench x = -geo x), block
transformations rotate about the cell centre X, then Y, then Z (Bedrock `minecraft:transformation`).
Lighting follows the game's block light (level = emitter - Manhattan distance, brightness l/(4-3l));
mod blocks have face_dimming false, so they are drawn without direction shading.
Not faithful to the game: the glow halos are a grading layer added on top of the bright blue texels (in game these
blocks emit little light), occlusion is ignored, and the cable shapes are chosen by hand to match a valid placement.
The owner chose this from six rendered candidates (other arrangements, stone/deepslate hosts, ore placements;
not kept) on 2026-11-22.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '.claude/skills/bedrock-art/scripts'))
import soft3d  # noqa: E402

SHEET = Path(__file__).resolve().parents[3] / 'temp/starstone-art/pack_sheet.png'
MOD = ROOT / 'mods/starstone'
RP = MOD / 'starstone_rp'
VAN = ROOT / 'reference/vanilla/current/resource_packs'

TEX = {
    'ore': RP / 'textures/blocks/starstone_ore.png',
    'generator': RP / 'textures/blocks/starstone_generator.png',
    'arm_on': RP / 'textures/blocks/starstone_cable_arm_on.png',
    'hub_on': RP / 'textures/blocks/starstone_cable_hub_on.png',
    'lamp_on': RP / 'textures/blocks/starstone_lamp_on.png',
    'stone': VAN / 'vanilla/textures/blocks/stone.png',
    'deepslate': VAN / 'vanilla_1.21.90/textures/blocks/deepslate/deepslate.png',
    'deepslate_top': VAN / 'vanilla_1.21.90/textures/blocks/deepslate/deepslate_top.png',
    'polished_deepslate': VAN / 'vanilla_1.21.90/textures/blocks/deepslate/polished_deepslate.png',
    'deepslate_tiles': VAN / 'vanilla_1.21.90/textures/blocks/deepslate/deepslate_tiles.png',
    'deepslate_bricks': VAN / 'vanilla_1.21.90/textures/blocks/deepslate/deepslate_bricks.png',
}
NAMES = list(TEX)
MODTEX = {'ore', 'generator', 'arm_on', 'hub_on', 'lamp_on'}
# object groups for grading (separate from texture layers)
GROUP = {'host': 0, 'ore': 1, 'generator': 2, 'cable': 3, 'lamp': 4}


def load_geo(file, ident):
    d = json.loads((RP / 'models/blocks' / file).read_text(encoding='utf-8'))
    return next(g for g in d['minecraft:geometry'] if g['description']['identifier'] == ident)


GEO_CABLE = load_geo('starstone_cable.geo.json', 'geometry.starstone_cable')
GEO_CORNER = load_geo('starstone_inner_corner.geo.json', 'geometry.starstone_inner_corner')
GEO_LAMP = load_geo('starstone_surface_device.geo.json', 'geometry.starstone_surface_device')
# block_face -> minecraft:transformation rotation (cable.json / lamp.json permutations)
FACE_ROT = {'up': (0, 0, 0), 'down': (180, 0, 0), 'south': (90, 0, 0), 'north': (90, 180, 0),
            'east': (90, 90, 0), 'west': (90, -90, 0)}
CABLE_MATS = {'*': 'arm_on', 'hub': 'hub_on'}   # powered permutation of cable.json / inner_corner.json
LAMP_MATS = {'*': 'lamp_on'}                     # powered permutation of lamp.json
SUPPORT_DIR = {'up': 'down', 'down': 'up', 'north': 'south', 'south': 'north', 'east': 'west', 'west': 'east'}
for _n, _p in TEX.items():
    assert _p.exists(), _p


class Scene:
    def __init__(self):
        self.full = {}        # (x,y,z) -> (texture name or dict face->name, group)
        self.models = []      # (geo, bones, mats, cell, rotation, group)
        self.lights = []      # (x,y,z,level)

    def block(self, cell, tex, group='host', light=0):
        self.full[tuple(cell)] = (tex, group)
        if light:
            self.lights.append((*cell, light))

    def cable(self, cell, arms, face='up'):
        bones = ['center'] + ['arm_' + a for a in arms]
        self.models.append((GEO_CABLE, bones, CABLE_MATS, cell, FACE_ROT[face], 'cable'))
        self.lights.append((*cell, 1))

    def corner(self, cell, faces, external):
        """faces: active faces (e.g. ['up', 'south']); external: [(face, toward)] arms to neighbours."""
        bones = ['center_' + f for f in faces]
        for f in faces:
            for g in faces:
                if g != f:
                    bones.append(f'arm_{f}_{SUPPORT_DIR[g]}')  # internal bend arm toward the other support
        bones += [f'arm_{f}_{t}' for f, t in external]
        self.models.append((GEO_CORNER, bones, CABLE_MATS, cell, (0, 0, 0), 'cable'))
        self.lights.append((*cell, 1))

    def lamp(self, cell, face):
        self.models.append((GEO_LAMP, ['panel', 'contacts'], LAMP_MATS, cell, FACE_ROT[face], 'lamp'))
        self.lights.append((*cell, 15))

    def faces(self):
        out = []
        nb = {'north': (0, 0, -1), 'south': (0, 0, 1), 'east': (1, 0, 0), 'west': (-1, 0, 0),
              'up': (0, 1, 0), 'down': (0, -1, 0)}
        for (x, y, z), (tex, group) in self.full.items():
            q = soft3d.quads(x * 16, y * 16, z * 16, x * 16 + 16, y * 16 + 16, z * 16 + 16)
            for face, pts in q.items():
                d = nb[face]
                if (x + d[0], y + d[1], z + d[2]) in self.full:
                    continue
                t = tex if isinstance(tex, str) else tex.get(face, tex['side'])
                out.append(([np.array(p, float) for p in pts], face, (0, 0, 16, 16), NAMES.index(t),
                             t in MODTEX, GROUP[group]))
        for geo, bones, mats, cell, rotation, group in self.models:
            out += model_faces(geo, bones, mats, cell, rotation, GROUP[group])
        return out


def model_faces(geo, bones, mats, cell, rotation, group):
    bmap = {b['name']: b for b in geo['bones']}
    R = soft3d.world_rot(rotation)
    centre = np.array([0, 8, 0], float)
    off = np.array([cell[0] * 16 + 8, cell[1] * 16, cell[2] * 16 + 8], float)
    out = []
    for name in bones:
        for c in bmap[name].get('cubes', []):
            o, s = np.array(c['origin'], float), np.array(c['size'], float)
            x0, x1 = -(o[0] + s[0]), -o[0]            # Blockbench x = -geo x
            q = soft3d.quads(x0, o[1], o[2], x1, o[1] + s[1], o[2] + s[2])
            for face, f in c['uv'].items():
                tname = mats.get(f.get('material_instance', '*'), mats['*'])
                A, B, C = (np.array(p, float) for p in q[face])
                rot_ = f.get('uv_rotation', 0) % 360
                for _ in range(rot_ // 90):           # texture (s,t) = (t, 1-s) per 90 deg, as block_render.py
                    D = B + C - A
                    A, B, C = B, D, A
                pts = [(p - centre) @ R.T + centre + off for p in (A, B, C)]
                (u, v), (us, vs) = f['uv'], f['uv_size']
                out.append((pts, face, (u, v, us, vs), NAMES.index(tname), True, group))
    return out


def render(scene, cam, size):
    faces = scene.faces()
    texs = {i: soft3d.load(TEX[n]) for i, n in enumerate(NAMES)}
    look = np.array(cam['look'], float) * 16
    yaw, pitch, dist = math.radians(cam['yaw']), math.radians(cam['pitch']), cam['dist'] * 16
    eye = look + dist * np.array([math.cos(pitch) * math.sin(yaw), math.sin(pitch), -math.cos(pitch) * math.cos(yaw)])
    # render twice: textures by texture layer, groups via a second pass with the group as the "layer"
    f1 = [(p, fc, uv, layer, glow) for p, fc, uv, layer, glow, g in faces]
    rgb, zb, lid, glw = soft3d.render(f1, texs, eye, look, cam['fov'], size)
    gtex = {}
    f2 = []
    for p, fc, uv, layer, glow, g in faces:
        key = layer * 10 + g
        gtex[key] = texs[layer]
        f2.append((p, fc, uv, key, glow))
    _, _, gid, _ = soft3d.render(f2, gtex, eye, look, cam['fov'], size)
    grp = np.where(gid >= 0, gid % 10, -1)
    return dict(rgb=rgb, zb=zb, lid=lid, glw=glw, grp=grp, eye=eye, look=look, fov=cam['fov'])


def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def blur(a, r):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255


def blur3(a, r):
    return np.dstack([blur(a[..., i], r) for i in range(3)])


def grade(buf, scene, P):
    rgb, zb, grp = buf['rgb'], buf['zb'], buf['grp']
    H, W = zb.shape
    hit = np.isfinite(zb)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # world position of each pixel, nudged toward the eye into the air cell in front of the face
    eye, look = buf['eye'], buf['look']
    fwd = look - eye; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right); up = np.cross(right, fwd)
    f = (H / 2) / math.tan(math.radians(buf['fov']) / 2)
    dirs = fwd + ((xx + 0.5 - W / 2) / f)[..., None] * right - ((yy + 0.5 - H / 2) / f)[..., None] * up
    wp = eye + dirs * np.where(hit, zb, 0)[..., None]
    dn = dirs / np.linalg.norm(dirs, axis=-1, keepdims=True)
    cell = np.floor((wp - dn * 0.3) / 16)
    lvl = np.zeros(zb.shape, np.float32)
    for (lx, ly, lz, L) in scene.lights:
        m = np.abs(cell[..., 0] - lx) + np.abs(cell[..., 1] - ly) + np.abs(cell[..., 2] - lz)
        np.maximum(lvl, L - m, out=lvl)
    l = np.clip(lvl, 0, 15) / 15
    bright = (l / (4 - 3 * l)) ** P['gamma']
    light = hexc(P['ambient'])[None, None] + bright[..., None] * hexc(P['blocklight']) * P['bl_gain']
    col = rgb * light
    # bright blue texels of mod blocks keep their own brightness (emissive look)
    mod = hit & (grp >= 1)
    lum = rgb.max(-1)
    emis = mod & (rgb[..., 2] > 0.55) & (rgb[..., 2] - rgb[..., 0] > 0.25)
    keep = np.clip((lum - 0.35) / 0.5, 0, 1) * emis
    col = np.where(mod[..., None], np.maximum(col, rgb * P['mod_floor']), col)
    col = col * (1 - keep[..., None]) + rgb * P['emis_gain'] * keep[..., None]
    # crop a square around the scene (same as a narrower, shifted field of view)
    ys, xs = np.nonzero(hit)
    cx, cy = (xs.min() + xs.max()) / 2 + P['shift'][0] * W, (ys.min() + ys.max()) / 2 + P['shift'][1] * H
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 / (1 - 2 * P['margin'])
    x0, y0, n = int(cx - half), int(cy - half), int(2 * half)
    def crop(a):
        pad = n
        a = np.pad(a, [(pad, pad), (pad, pad)] + [(0, 0)] * (a.ndim - 2))
        return a[y0 + pad:y0 + pad + n, x0 + pad:x0 + pad + n]
    col, hit, grp, emis, rgb = crop(col), crop(hit), crop(grp), crop(emis), crop(rgb)
    H = W = n
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx / W - P['bg_cx']) ** 2) + ((yy / H - P['bg_cy']) ** 2))
    t = np.clip(r / 0.75, 0, 1)[..., None]
    out = hexc(P['bg_in']) * (1 - t) + hexc(P['bg_out']) * t
    out[hit] = col[hit]
    # glow halos per group (blurred emissive texels), blue
    s = H / 1024
    halo = np.zeros_like(out)
    for g, w in P['halo'].items():
        m = (emis & (grp == GROUP[g])).astype(np.float32)
        if not m.any():
            continue
        src = rgb * m[..., None]
        halo += blur3(src, 8 * s) * w[0] + blur3(src, 26 * s) * w[1] + blur3(src, 70 * s) * w[2]
    out = out + halo * hexc(P['halo_tint'])
    v = 1 - P['vig'] * np.clip(((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2) * 2.2, 0, 1)
    out = out * v[..., None]
    return np.clip(out, 0, 1)


BASE = dict(bg_in='#14254a', bg_out='#050914', bg_cx=0.5, bg_cy=0.45, ambient='#1a2236', blocklight='#e8ecff',
            bl_gain=1.05, gamma=0.8, mod_floor=0.55, emis_gain=1.15, halo_tint='#9fd2ff', vig=0.35, margin=0.04, shift=(0, 0),
            halo={'lamp': (0.9, 0.6, 0.35), 'generator': (0.5, 0.35, 0.15), 'cable': (0.7, 0.45, 0.1),
                  'ore': (0.45, 0.25, 0.1)})


def variant_B(ores=((0, 1, -1), (1, 1, -1))):
    """Room corner: north wall + east wall. Generator front left, cable runs right, up the east wall to the lamp;
    ore in the back wall."""
    sc = Scene()
    for x in range(0, 3):
        for z in range(-1, 2):
            sc.block((x, -1, z), 'polished_deepslate')
        for y in range(0, 2):
            sc.block((x, y, -1), 'deepslate_bricks')
    for z in range(-1, 2):
        for y in range(-1, 2):
            sc.block((3, y, z), 'deepslate_bricks')
    for o in ores:
        sc.block(o, 'ore', 'ore', 3)
    sc.block((0, 0, 1), 'generator', 'generator', 1)
    sc.cable((1, 0, 1), 'we')
    sc.corner((2, 0, 1), ['up', 'west'], [('up', 'west'), ('west', 'up')])
    sc.lamp((2, 1, 1), 'west')
    cam = dict(look=(1.1, 0.75, 0.9), yaw=-145, pitch=28, dist=40, fov=10.0)
    return sc, cam, dict(BASE)


def sheet(im, out):
    """The icon at 256/128/64/32 and the 32 px version enlarged, to judge legibility."""
    row = Image.new('RGB', (256 + 128 + 64 + 32 + 128 + 60, 256), (40, 40, 44))
    x = 10
    for s in (256, 128, 64, 32):
        row.paste(im.resize((s, s), Image.LANCZOS), (x, 0))
        x += s + 10
    row.paste(im.resize((32, 32), Image.LANCZOS).resize((128, 128), Image.NEAREST), (x, 0))
    out.parent.mkdir(parents=True, exist_ok=True)
    row.save(out)


def main():
    sc, cam, P = variant_B(((1, 1, -1),))     # B1: one ore block, one block right of the back-wall corner
    img = grade(render(sc, cam, 1400), sc, P)
    icon = Image.fromarray((img * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS)
    for pack in ('starstone_bp', 'starstone_rp'):
        icon.save(MOD / pack / 'pack_icon.png')
        print('wrote', MOD / pack / 'pack_icon.png')
    if '--sheet' in sys.argv[1:]:
        sheet(icon, SHEET)
        print('wrote', SHEET)


if __name__ == '__main__':
    main()
