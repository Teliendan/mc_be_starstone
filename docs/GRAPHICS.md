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
| `make_item_art.py` | Item icons; the flat devices' icons are top views of the placed block built from its own textures |
| `make_pack_icon.py` | Both 256x256 pack icons: a render of real blocks (uses the skill's `soft3d.py`) |

Rules the art follows: light from the top on full cubes; parts that turn with
their support face (cable arms and hubs, adapter arms) are shaded symmetrically
and their strips are palindromes, so every arm meets its neighbour with a clamp
pair at the cell edge. Custom geometry renders model X mirrored, so the machine
frame shared by Generator (vanilla full block) and Conduit (custom cube) is
symmetric left-right, and the adapter emblems are drawn mirrored in the texture.
Review state: see the table. Rule since 2026-11-22 (owner): a flat device's icon is the top view of the placed block,
and where that view is unclear the block changes, not just the icon.

Owner verdicts: 2026-11-22, the icon and device redesign below (Crystal, Inner Corner icon, adapters, Bridge,
pack icon): "I like these, we are done." 2026-10-26, after the 16x16 redo (commits `7aa74ca` and `f7e6283`): "The
graphics as such is OK", and after the follow-up fixes "Fixed, I like it." Verdicts are final
(owner accepted in game), to check (deployed, owner to look) or to do. Per-asset notes:

| Asset | Verdict | Notes |
|---|---|---|
| Ore | final | Dark purple-grey stone, six blue shards in different directions |
| Generator on/off | final | Navy machine frame, cut crystal; off = dark gem |
| Conduit ends on/off, casing sides | final | Round port with glowing core; vented casing |
| Cable arms and hubs on/off | final | 2-wide conductor, clamp pair at each cell edge, 4-fold hub |
| Inner Corner | final | Same textures as the cable |
| Bridge | final | The cable dot (hub with metal east/west edges, on the north-south lane's material) carrying the north-south lane; the east-west arms (4 long) run into two 2x4 port housings beside it, where they go underneath. Replaced the 6x6 riveted plate on 2026-11-22 (owner: plate read as a beetle; keep an element in the middle like the cable's dot; the lower lane must not stop short) |
| Lamp on/off | final | Four-pane lens, contacts lit when powered |
| Redstone Input/Output casing and emblem | final | 8x8 casing (was 6x6) with a 6x6 arrow ("->" per owner, not ">>"): shaft in the source colour, head in the target colour, drawn mirrored for the mirrored model X; arms 4.14 long (window `arm4`). Enlarged 2026-11-22 so the placed block and the icon look alike (owner picked "both meet in the middle") |
| Redstone arms on/off | final | Red strips in vanilla redstone dust colours |
| Crystal icon | final | Brilliant-cut gem echoing the Generator's cut crystal; owner picked it from five options on 2026-11-22. The old three-prism fan was "usable, not nice" |
| Dust, Compressed Dust icons | final | |
| Cable icon | final | Stacked coil with a plug end |
| Inner Corner icon | final | Square L bend (wall arm up, floor arm left, hub in the crease); the earlier 2:1 floor arm read as a wrong angle (owner 2026-11-22) |
| Redstone Input/Output icons | final | Top view of the placed block: the 8x8 casing and arrow unmirrored, powered source arm left, target arm right (2026-11-22; the earlier capsule icon was clear but looked unlike the placed block) |
| Bridge icon | final | Top view of the placed Bridge, powered, from the block textures (2026-11-22) |
| Lamp icon | final | Lit lamp panel (held-item fix) |
| Pack icon | final | "Working circuit" render (owner pick B1 of six, 2026-11-22): deepslate-brick room corner, powered Generator, Cable, Inner Corner, lit Lamp on the side wall, one ore block in the back wall. Was a 16x16 crystal cluster scaled 16x |

The retired task list is in git `1492493` (`docs/GRAPHICS_TASKS.md`).

## Cables and edge joins

`geometry.starstone_cable` uses a permanent `center` bone and four optional
`arm_n`, `arm_e`, `arm_s`, `arm_w` bones. Their bits in
`starstone:connections` are 1, 2, 4 and 8. The arm geometry reaches slightly
past the cell edge (0.14 model units) so adjoining arms meet without a seam,
including cables wrapped around the outside edge of one support cube. The
unpowered and powered materials are `starstone:cable_off` and
`starstone:cable_on`. The four arms of an ordinary cable form one joined lane;
a four-arm intersection is not an isolated crossing. An arm whose neighbour cell (direct or
around the outside edge) is in an unloaded chunk keeps its drawn state on a refresh; before
2026-11-17 a repair pass at the edge of the loaded area dropped it (owner M50,
`unloadedArms.test.mjs`). Inner corners follow the same rule (an arm toward an unloaded direct or
outside-edge cell keeps its drawn state; 2026-11-17, `pendingCatchUp.test.mjs`).

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

`geometry.starstone_bridge` has narrow local north-south and east-west lanes
extending to opposite cell edges. The two lanes are electrically isolated and
separately mapped to on/off cable materials by `starstone:powered_ns` and
`starstone:powered_ew`. Bones: `lane_ns` (two 6-long arms), `hub` (the 4x4 dot,
on the `lane_ns` material, texture window `xhub` in the cable arm textures),
`lane_ew` (two 4-long arms, window `arm4`) and `body` (two 2x4 port housings,
`starstone:bridge` texture, windows `port*`) where the east-west lane goes in
under the dot.

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

Both development packs have the same 256x256 `pack_icon.png`, rendered by
`tools/make_pack_icon.py` from the real models and textures (re-run it after changing
any piece it shows; `--sheet` writes a 256/128/64/32 check to `temp/starstone-art/`).
The glow halos are graded on top; in game the blocks emit little light.

From `C:\mcmods`, rebuild everything with:

```powershell
python -B mods/starstone/tools/make_block_art.py
python -B mods/starstone/tools/make_block_models.py
python -B mods/starstone/tools/build_inner_corner.py --model-only
python -B mods/starstone/tools/make_item_art.py
python -B mods/starstone/tools/make_pack_icon.py
```

The generators change only PNGs and model UVs, never block behaviour JSON (cube sizes are hand-edited in the
geometry files; `make_block_models.py` then maps their UVs).

## Material parameter note (2026-10-10, Bedrock 1.26.52)

Conduit, generator and ore material declarations use numeric `ambient_occlusion` 0 (the old
boolean `false`, intentionally unshaded); the shared visual-parameter checker rejects the
boolean form for block format 1.26.50 and later, and official release 26.20 requires 0..10
with default 1. Not an in-game appearance test: compare these blocks' unshaded look after a
reload. Retired: `docs/VISUAL_PARAMETERS.md` and `docs/CONTENT-LOG.md` (ore feature files
renamed to match their identifiers, resource `blocks.json` format 1.21.40, 2026-10-04) in git `1492493`.
