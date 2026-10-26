# Starstone graphics contract

The visual language is dark navy/gunmetal hardware with blue and cyan energy.
Powered surfaces may reach cyan-white; unpowered surfaces remain dark blue.
Cables, bridges, lamps and adapters mount on full support faces. Generator, ore
and conduit are full cubes.

## Resolution, palette and generators (16x16 redo, 2026-10-26)

All art is 16x16 at 1 texel = 1 model unit, made by deterministic generators; edit
the script and re-run, never the PNG. The earlier 32x32 art (cut from AI-painted
atlases, sampled at twice vanilla density) is in git history before this redo.

| Script (`tools/`) | Makes |
|---|---|
| `starstone_art.py` | Shared ramps (METAL navy/gunmetal, STONE dark purple-grey, CRYSTAL, ENERGY_OFF, ENERGY_ON, RED_OFF, RED_ON) and pixel helpers |
| `make_block_art.py` | Every block texture; `LAYOUT` names the texture windows the models sample |
| `make_block_models.py` | Face UVs of every block model (`assign_uvs`), also used by `build_inner_corner.py --model-only` |
| `make_item_art.py` | Item icons and both 256x256 pack icons (16x16 art scaled 16x) |

Rules the art follows: light from the top on full cubes; parts that turn with
their support face (cable arms and hubs, adapter arms) are shaded symmetrically
and their strips are palindromes, so every arm meets its neighbour with a clamp
pair at the cell edge. Custom geometry renders model X mirrored, so the machine
frame shared by Generator (vanilla full block) and Conduit (custom cube) is
symmetric left-right, and the adapter emblems are drawn mirrored in the texture.
Review state per asset: `docs/GRAPHICS_TASKS.md`.

## Cables and edge joins

`geometry.starstone_cable` uses a permanent `center` bone and four optional
`arm_n`, `arm_e`, `arm_s`, `arm_w` bones. Their bits in
`starstone:connections` are 1, 2, 4 and 8. The arm geometry reaches slightly
past the cell edge (0.14 model units) so adjoining arms meet without a seam,
including cables wrapped around the outside edge of one support cube. The
unpowered and powered materials are `starstone:cable_off` and
`starstone:cable_on`. The four arms of an ordinary cable form one joined lane;
a four-arm intersection is not an isolated crossing.

An inside edge needs multiple cable sheets in one occupied block cell.
`starstone:inner_corner` is a separate walk-through block with 54 valid
combinations of two to six supported faces. Each active perpendicular face
pair contributes grounded strips that meet at the bend; all selected faces
share one electrical lane. A one-block hole can thus join the floor and all
four walls. Placement selects supported faces with adjacent cables plus the
clicked face. When no adjacent cable identifies a face, it selects every
supported face. Every selected face must retain full support. Its item is
crafted from two Cables and placed into an empty cell.
Its item has a separate bent-cable icon from `tools/make_item_art.py`.

Bridge, Lamp and both adapters are held as flat item sprites: each has a same-ID
item (`starstone_bp/items/<id>.json`, `minecraft:block_placer` with
`replace_block_item`) with its own icon. Without one, the hand shows the thin block
model floating in front of the player (owner report 2026-10-25/26).

Cable mask and face transformation tests cover all 16 masks and all six mounting
faces. The user's remaining one-direction visual inversion could not be
reproduced offline and needs a targeted in-game check with the exact clicked
face and neighbor coordinate recorded.

## Flat devices

The lamp uses `geometry.starstone_surface_device`, a thin panel and contacts.
It is a consumer and also carries power between its four surface ports.

`geometry.starstone_bridge` is a grounded, flat casing with narrow local
north-south and east-west lanes extending to opposite cell edges. The two lanes
are electrically isolated and separately mapped to on/off cable materials by
`starstone:powered_ns` and `starstone:powered_ew`. The center casing covers the
crossing without floating duplicate wires. Its body uses the registered
`starstone:bridge` texture: a raised plate with dark ports where the east-west
lane passes underneath.

`geometry.starstone_adapter` is a grounded center box. It has independently
masked blue Starstone arms and red redstone contact arms; unused arms disappear.
A blue arm also shows toward an outside edge that wraps to a conductor.
The redstone input and output emblems show the conversion direction as one
arrow ("->", shaft in the source colour, head in the target colour), while face
transformations orient the whole model to the support. The Starstone and
redstone masks must be refreshed when touching blocks change. Output power is
still controlled by Bedrock's `minecraft:redstone_producer` component.

## Full cubes and powered states

The Generator uses `starstone:generator_off` while disabled and the original
bright `starstone:generator` while enabled. The Conduit uses dark
`starstone:conduit_end_off` on its two axis ends while unpowered and bright
`starstone:conduit_end` when powered; its other faces remain
`starstone:casing`. Powered Conduit and Generator emit light level 1, off 0.
Ore emits light level 3.

## Pack artwork and rebuilding

Both development packs have the same 256x256 `pack_icon.png`, drawn at 16x16 by
`tools/make_item_art.py` and scaled up 16x without smoothing.

From `C:\mcmods`, rebuild everything with:

```powershell
python -B mods/starstone/tools/make_block_art.py
python -B mods/starstone/tools/make_block_models.py
python -B mods/starstone/tools/build_inner_corner.py --model-only
python -B mods/starstone/tools/make_item_art.py
```

The generators change only PNGs and model UVs, never block behaviour JSON.
