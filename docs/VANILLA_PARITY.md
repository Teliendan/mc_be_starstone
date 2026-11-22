# Vanilla parity: final design, decisions, limits, checks

Target Bedrock 1.26.52; the manifest now uses Script API 2.11.0 / engine 1.26.60 (needed by
`Dimension.spawnXp`). History (inspection narrative, input option
study, probe notes): git `08a2e65` and earlier. Counterparts: redstone ore, lamp, repeater/dust.

## Final design

- Separate **binary** electrical network, six-face mounting, bridge lanes, axial conduits,
  growing inner corners, manual generator; adapters convert native redstone to/from 0/15.
  A redstone-block material profile does not make generator/conduit a native redstone source.
- **Input** (`redstone_input.json`, format 1.26.0, `redstone_consumer {min_power:0,
  propagates_power:false}`, explicit `use_liquid_clipping:true`): the `starstone:surface`
  `onRedstoneUpdate` hook commits `powerLevel > 0` synchronously. Callbacks are the only
  power authority; deduplication is against committed state, not `previousPowerLevel`
  (previous tick). Durable `sourceChanged` owner, multi-source OR and loaded-network
  fallback are kept. No `firstUpdate`, neighbor-change events or beta APIs.
- **Initial read**: a newly tracked input (load / placement / network discovery, not a
  first callback) gets one deferred `block.getRedstonePower()` read.
- **100-tick pass** (32 inputs per deferred run): visuals only (red contact mask, blue
  connections). It never reads power. Timer stops when no inputs are tracked.
- **Output**: `redstone_producer` 0/15, all six connected faces, strong face down
  (`transform_relative`).
- **Ore**: iron/diamond/netherite pickaxes, custom 2-4 Dust (capped Fortune), Silk Touch
  self-drop, light 3, `instrument_sound.up = note.bd`, furnace and blast furnace -> 1 Dust
  (no XP field exists in Bedrock recipes).
- **Ore XP**: after-break event (filtered to `starstone:ore`) for Survival/Adventure,
  not Silk Touch, `doTileDrops` not false: random 1-5, spawned with native `Dimension.spawnXp(block.center(), n)`, one call per
  orb with the split `[1] [1,1] [3] [3,1] [3,1,1]`. Native pickup owns Mending and the award.
  Requires API 2.11.0 / engine 1.26.60 (stable since release 26.60). Replaced the
  `.mcstructure` orb workaround on 2026-10-27 (commit "Replace ore XP structures with Dimension.spawnXp"). Wrong-tool Survival/Adventure breaks are canceled by `harvestGate`, so the
  handler does not re-check the tool.

## Owner decisions

- 2026-10-21: native receiver input replaces the four-tick six-neighbor maximum; no experiments.
- 2026-10-21: ore smelting, bass drum, valued native mining XP implemented.
- 2026-10-21: keep four-Dust + copper precursor, furnace Crystal route, constant light 3,
  existing worldgen; casing conduction of conduit accepted.
- 2026-10-23: probe pack removed; XP value is checked with vanilla `/summon`.

## Known limits

- The `doTileDrops:false` -> no XP gate is a guess (Java does it), not verified Bedrock parity.
- Output writes are budgeted and coalesce newer levels: no pulse-fidelity promise through
  large networks.
- `replace_block_item:true` needs identical item/block IDs, so it cannot be added to the
  `_item` placers; no saved-item migration.
- Lamp is a thin panel, not a full-cube lamp (no 6-tick off delay, no opacity); lamp/devices
  do not copy redstone ore's contact glow.
- Silk-Touched ore smelting gives no furnace XP (confirmed in game by the owner, 2026-11-22, Bedrock 1.26.63).

## In-game checks still worth doing

1. Powered input stays ON for more than 10 s when powered via its support block, via a
   repeater into the support, and via a lever on the support (confirms callbacks hold; the
   periodic pass no longer reads power). Also: input beside an already-powered source after
   placement, and after leaving/re-entering the world.
2. Observer pulse (2 ticks) through an input lights the lamp.
3. One ore break gives 1-5 total XP (`spawnXp` orbs); Mending repairs; Silk Touch gives none.
4. Two quick ore breaks both drop orbs.
5. `doTileDrops` false behaviour vs. vanilla redstone ore; furnace smelting (checked 2026-11-22, 1.26.63: Dust, no XP; blast furnace not separately checked);
   note block under ore plays bass drum.

## Bedrock 26.60 impact (2026-10-27, documented only)

Source review against the 26.60 changelog and API 2.11.0 / 2.12.0-beta declarations; nothing tested in game on 26.60.

- Verdict: nothing in the mod breaks. The review's top item, `Dimension.spawnXp` (stable in 2.11.0) replacing the ore XP structures, is now in `oreExperience.js` (checked 2026-11-11).
- MCPE-242204 (dust connects to a custom `redstone_producer`): owner check only. Dust beside a Redstone Output should bend into it; if it does, close the redstone watch note in the workspace `docs/workarounds.md`.
- Deferred: redstone dust now exposes `redstone_north/east/south/west` states, which could narrow `redstoneContactMask` to dust that points at the adapter; ignored unless the owner reports a mismatch (current rule deliberately shows contact at zero power).
- Deferred: experimental `minecraft:neighbor_change` / `onNeighborChanged` (block format 1.26.60, beta API 2.12.0) could replace the scripted support-survival and random-tick fallback. Wait for stable (owner decision 2026-10-21: no experiments or beta APIs). Limits: 100 events per chunk per tick, queue of 4,096 per chunk.
- Latent: single-object `collision_box` is rejected at block format 1.26.60 (`bridge`, `lamp`, `redstone_input`, `redstone_output`); wrap it in `[ ]` before any bump. Whether `collision_box: false` (cable, inner corner) stays valid is unknown.
- Not relevant: MCPE-240755 (no `placement_filter`/`onBreak`), loot count-0 change (tables are not format 1.26.60), entity schema strictness (no entities).
- Owner checks: Starstone loads and works on 26.60 at API 2.8.0; dust bends into Redstone Output; a piston pushing a conduit or generator into a mob pushes or damages it like vanilla (optional).

## Per-block parity decisions

Merged from four retired per-block notes; each section keeps its date and target. Git
`1492493` holds `docs/BLOCK_MATERIALS.md`, `docs/TAGS.md`, `docs/WATER.md` and `docs/HARVEST.md`.

## Block materials

2026-10-09, Bedrock 1.26.52. Configured from vanilla reference data; new timing,
fire and explosion behavior still needs game acceptance. Policy:
`starstone_bp/block_materials.json`; shared standard:
`C:/mcmods/.claude/skills/bedrock-blocks/references/materials.md`.

| Blocks | Vanilla counterpart | Mining parameter | Blast | Efficient tool |
| --- | --- | ---: | ---: | --- |
| Conduit, generator | Redstone block | 5 | 6 | pickaxe |
| Ore | Normal redstone ore | 3 | 3 | pickaxe |
| Lamp | Redstone lamp | 0.3 | 0.3 | any |
| Cable, bridge, inner corner, redstone input/output | Repeater / thin redstone device | 0 | 0 | any |

All explicitly nonflammable. Ore's old per-tier fixed times are removed;
native tool effectiveness applies. Ore retains its approved iron+ harvest tier
and custom Silk Touch/Fortune quantities, now in exclusive native loot pools.
Owner clarification 2026-10-10: Conduit and generator drop with any tool or hand;
their pickaxe effectiveness only changes breaking speed. Ore alone uses a guarded
completed-break handler to remove wrong-tool breaks without loot; native tables
own mining and explosion drops. See [Harvest gates](#harvest-gates-and-native-blast-loot) for source
confidence, wear, network cleanup and remaining compatibility limits. Other
blocks retain their existing loot behavior.

Check in game: compare conduit/generator and ore against their counterparts
using hand, wrong tool and each pickaxe tier; check Efficiency, Silk Touch and
Fortune drops; compare TNT/fire survival and network cleanup. These are source
choices, not a claim of identical engine timings or lifecycle parity.

Remaining-property batch, 2026-10-10 / target 1.26.52: Conduit now explicitly
declares dampening 15, preserving its solid opaque cube. All nine blocks gain
RP sounds from their recorded counterparts: conduit/generator/ore stone, lamp
glass, the five thin repeater devices wood (including inner corner's RP entry).
Vanilla repeater's sound is wood despite its stone base. Sourced `property_checks`
enforce these values, including actual RP sound precedence over BP components.
No block-format upgrade or script/network change was required.

Owner answer2026-10-10: Conduit's casing conducts ordinary native redstone.
It now explicitly declares redstone_conductor true and records this reviewed
opaque-casing choice. Generator retains its existing true. No native producer
was added; the scripted Starstone network remains separate. The shared verifier
checks the whole conduction object across inherited permutation states.
Check ordinary native redstone through each conduit orientation, alongside
Starstone signals, break/step/place sounds and opaque lighting after reload.
No design question remains; actual native signal propagation needs game acceptance.

Group18 follow-up2026-10-21: Ore's native note-block instrument now specifies
`up:note.bd` (bass drum), checked in the property ledger against redstone ore.
Its existing format1.26.50 supports the component, released stable in26.40.
Native audible selection remains an acceptance check after reload.

## Tag and family audit

2026-10-13; target Bedrock 1.26.52 / Script API 2.8.0. Source revision `a03f3c5`.

Status: source inventory and official-documentation review; proposals have not been applied. No new engine tests. Pack files were left unchanged. A reasoned omission is a valid audit result.

Scope: 9 block definitions, 0 entity definitions, across every `*_bp` pack in this mod. Relevant explicit item tags were cross-checked for the block/item distinction.

### Recommendations and effects

Keep the current tags and intentional omissions. Ore, generator and conduit have pickaxe speed tags. The other six blocks follow redstone-device/lamp profiles with no preferred tool; do not infer stone/metal tags from texture or sound.

### Complete block inventory

Tags below are declared in root components. `omitted` and `[]` both mean no declared tags; they are retained by design unless a proposal above says otherwise. The material profile records the existing mining/harvest policy; a tag is not a harvest gate.

| Block | Declared tags | Profile / decision |
| --- | --- | --- |
| [starstone:bridge](../starstone_bp/blocks/bridge.json) | omitted | `redstone_device`; retain |
| [starstone:cable](../starstone_bp/blocks/cable.json) | omitted | `redstone_device`; retain |
| [starstone:conduit](../starstone_bp/blocks/conduit.json) | `minecraft:is_pickaxe_item_destructible` | `redstone_block`; retain |
| [starstone:generator](../starstone_bp/blocks/generator.json) | `minecraft:is_pickaxe_item_destructible` | `redstone_block`; retain |
| [starstone:inner_corner](../starstone_bp/blocks/inner_corner.json) | omitted | `redstone_device`; retain |
| [starstone:lamp](../starstone_bp/blocks/lamp.json) | omitted | `redstone_lamp`; retain |
| [starstone:ore](../starstone_bp/blocks/ore.json) | `minecraft:is_pickaxe_item_destructible` | `redstone_ore`; retain |
| [starstone:redstone_input](../starstone_bp/blocks/redstone_input.json) | omitted | `redstone_device`; retain |
| [starstone:redstone_output](../starstone_bp/blocks/redstone_output.json) | omitted | `redstone_device`; retain |

Inspected all block permutations: 0 tag-component overrides. Other components still vary by state; no all-state engine behavior is claimed.

### Complete entity inventory

| Entity | Base families | Group overrides / decision |
| --- | --- | --- |
| None | - | No custom entities |

### Related explicit item tags

These are item-component tags, not block tags. This is a cross-check, not a request to classify every inventory item.

| Item | Tags |
| --- | --- |
| None declared | Omission alone is not an error |

### Evidence and follow-up

- Shared decision rules and primary sources: [tags and families](../../../.claude/skills/bedrock-modding/references/14-tags.md).
- Existing runtime quest/hostility/debug tags are separate from these families. No new runtime tags or cleanup mechanisms are proposed.
- If accepted, update any responsible generator, run `mods verify <mod>`, deploy and confirm `in sync`, then record relevant engine observations here.

## Water decisions

2026-10-09, Bedrock 1.26.52 / API 2.8.0. **Implemented; deployment authorized; not yet verified in game.**
Owner accepted the revised policy, including the lamp's custom waterlogging behavior.
The owner's later repeater/comparator comparison supersedes the first recommendation
that supported electrical parts pop. Evidence: .claude/skills/bedrock-blocks/references/water.md (full research: workspace git 30442bb and earlier).

| Block ID (prefix `starstone:`) | Bucket waterlogging | Incoming flow | Analogue / reason |
| --- | --- | --- | --- |
| `cable` | Yes | Survives; flow through | Bedrock repeater/comparator; owner's revised direction |
| `inner_corner` | Yes | Survives; flow through | Same network wiring |
| `bridge` | Yes | Survives; flow through | Same network wiring |
| `redstone_input` | Yes | Survives; flow through | Bedrock supported redstone component |
| `redstone_output` | Yes | Survives; flow through | Bedrock supported redstone component |
| `lamp` | Yes | Survives; flow through; remains lit when powered | Owner accepted custom panel policy; follows network components |
| `ore` | No | Survives; blocks flow | Solid ore |
| `generator` | No | Survives; blocks flow | Standalone full-cube machine |
| `conduit` | No | Survives; blocks flow | Solid casing; not vanilla aquatic conduit |

Surface parts explicitly use containment true + `no_reaction`, outgoing restrictions
empty. Lamp behavior is the accepted custom design, not a claim that the full-cube vanilla
redstone lamp waterlogs. Support and piston reactions remain separate. The inner-corner
generator reproduces this policy; other generators preserve their base components.

Primary evidence: [Bedrock 1.20.30](https://www.minecraft.net/en-us/article/minecraft-1-20-30-update-now-available-bedrock)
fixes repeaters/comparators disrupting flow during power switches (MCPE-157055).
[Component docs](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_liquid_detection?view=minecraft-bedrock-stable)
document containment and incoming flow separately.

Blocks retain format 1.21.120, so liquid clipping uses the pre-1.26 default true.
Do not insert the newer clipping field without a deliberate format migration. Thin
non-colliding shapes need rendering checks; Lothlorien's newer-format unclipped rule
is not a universal recipe.

Offline mutation tests replace a cable with air/source water/flowing water and check
network repair, stale-index removal and preservation of replacement water. These model
forced replacement, not ordinary flooding under this new survival policy. Existing
bounded reconciliation still handles silent removal; no water poller was added.

Pending engine checks: buckets and placement into source/flowing water on all mount
faces; actual flow through every component; outgoing flow; network continuity and
adapter power while flooded; power/mask updates preserving secondary-layer water;
lamp illumination/rendering; support loss while wet; world reload. Ordinary flooding
should drop no components. Full cubes exclude water.

Validation on 2026-10-09: full `mods verify starstone` passes with zero errors
(one warning). Owner authorized deployment and commits on 2026-10-09.

## Harvest gates and native blast loot

2026-10-10; target Bedrock 1.26.52, stable Script API 2.8.0. Documented API/schema
plus offline behavior tests. This new path has not been accepted in game.

| Block | Vanilla counterpart | Collection | Native owning table |
| --- | --- | --- | --- |
| Conduit, generator | Redstone block material; owner collection policy | Any tool or hand; pickaxes only change breaking speed | One self item, then `explosion_decay` |
| Ore | Normal redstone ore | Existing iron/diamond/netherite pickaxe IDs | Custom Dust 2-4; Fortune I/II/III+ 3-5/4-6/5-7; Silk Touch one Ore; decay last |

Ore quantities retain the reviewed Starstone design; vanilla redstone's different
Dust quantities do not override it. Owner clarification 2026-10-10: tool
effectiveness normally changes breaking speed, without denying collection.
Conduit and generator therefore use unconditional native self loot; their
pickaxe efficiency remains. Ore retains its explicitly tested exact-ID exception.
Other Starstone blocks keep their existing collection policy.

### Why there are two mechanisms

Native mining-efficiency tags set tool effectiveness, not a collection gate.
Positive `match_tool` loot conditions also exclude tool-less environmental
destruction. A negated tool test cannot distinguish an empty-handed player from
an explosion. The old player-only ore item spawner and empty table lost all blast
loot; they are removed.

`harvestGate.js` intercepts only a completed wrong-tool Ore survival/adventure
player break through `world.beforeEvents.playerBreakBlock`. It cancels the native break
and defers a guarded `Block.setType("minecraft:air")`, producing no items.
Unrelated blocks, prior-canceled events, valid tools, Creative and Spectator pass
through unchanged. Native tables own allowed mining and all environmental loot,
including the engine's `doTileDrops` and explosion-decay context. There is no
post-explosion item refund or invented script explosion probability.

The queued removal checks player validity/current mode, original block type and
every permutation state. Same-cell attempts are deduplicated. Placement and
explosion callbacks invalidate a pending removal. Unloaded, changed and replaced
cells are preserved. A command replacing a cell with an identical type and all
identical states within that one-tick interval cannot be distinguished by the
documented API; no unique block-instance token is exposed.

Canceled breaks do not issue the normal after-player-break event. The callback
runs Starstone's neighboring support/connection refresh (the gated Ore is not an
electrical block, so it has no placement-index or network entry, but it may
support a cable). Native allowed-tool Ore breaks
and every conduit/generator player break keep their existing event route.

### Tool wear and remaining limits

`harvestWear.js` supplies guarded vanilla-tool wear after successful rejected
removal, with Unbreaking and item/slot identity checks. Its exact supported IDs,
unsupported custom/spear cases and sourced wear rules are recorded in that file
and its focused regression suite. Changing slot/item while work is queued must
not damage the replacement stack. No wear is applied when removal is skipped.
The archived Wiki wear source predates the target engine. Unknown custom tools
and newer spears receive no guessed wear. A visible native durability charge
before the deferred callback makes the fingerprint differ and is skipped; a
charge occurring afterward cannot be detected here. Bedrock's documented extra
use at the last durability point is not emulated by the helper. These require
target-engine acceptance rather than a claim of exact native durability parity.

The rejected-tool path uses an API replacement rather than a completed native
destruction. Native break statistics/advancement triggers and other add-ons'
after-break subscribers are not recreated. Native client sound/particles for a
canceled break have not been measured; no guessed synthetic effect is added.
Earlier cancellation is respected, but a later independent subscriber's intent
cannot be inferred after dispatch. These are explicit compatibility limits,
not claims of complete engine parity. Allowed-tool native breaks retain their
native behavior.

### Evidence and acceptance

Group18 adds a separate eligible native-player-break XP owner, preserving the
existing single native item-drop owner. The 1–5 native `spawnXp` orb split,
Silk/tool/mode/gamerule gates and native acceptance are documented in
the Ore XP entry under "Final design" above. Item-loot tests alone do not verify XP.

- Local API declarations: `C:/mcmods/reference/server-2.8.0.d.ts`,
  `PlayerBreakBlockBeforeEvent.cancel/itemStack`, `Block.setType`,
  `BlockPermutation.getAllStates`, `ItemStack.clone/hasTag`.
- [Official before-break event](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/playerbreakblockbeforeevent?view=minecraft-bedrock-stable)
  and [Block API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/block?view=minecraft-bedrock-stable):
  cancellation plus deferred mutation from the restricted event.
- [26.50 changelog](https://www.minecraft.net/en-us/article/minecraft--bedrock-edition-26-50-changelog):
  condition `operator: "not"`; BP minimum engine is raised to 1.26.50.
  [Official loot conditions](https://learn.microsoft.com/en-us/minecraft/creator/documents/loottableconditions?view=minecraft-bedrock-stable)
  supply positive enchantment ranges. Negating Fortune>=1 avoids the old
  in-game failure of matching a missing enchantment as explicit level zero.
- [Official loot functions](https://learn.microsoft.com/en-us/minecraft/creator/documents/lootandtradetablefunctions?view=minecraft-bedrock-stable):
  `set_count` min/max followed by native per-item `explosion_decay`.
- Installed vanilla's distributed loot folder has chests/entities/equipment/
  gameplay, not the built-in redstone ore/block tables; it cannot establish an
  undocumented block-source condition. Shared harvest research and the authored
  [tool-based destruction recipe](https://wiki.bedrock.dev/blocks/tool-based-destruction)
  explicitly record the native tool-predicate environmental-drop limitation.

Regressions: `oreLoot.test.mjs` evaluates exclusive native predicates and approved
count endpoints (including no-tool context, Silk priority, Fortune III+ cap),
requires decay, and rejects deliberately broken tables. `harvestGate.test.mjs`
exercises exact Ore tool tiers, any-tool/hand conduit and generator pass-through,
prior cancellation, deferred guards,
deduplication and replacement invalidation. `eventWiring.test.mjs` imports the
real entry point and proves native empty-handed generator mining removes its saved hint and
turns off the neighboring powered lamp. Wear has its own focused suite.

After deployment/reload, compare hand, axe, shears, each pickaxe tier and relevant
enchanted tools against redstone block/ore. Check durability/Unbreaking, Creative,
doTileDrops false, TNT decay true/false and mob explosions, rapid attempts,
replacement protection and network cleanup. Conduit/generator collection must
remain native for every tool, while Ore alone takes the rejected-tool route.
Fortune/Silk verified in game by the owner (2026-11-22, Bedrock 1.26.63).

### Questions saved for the owner

No new numeric loot choice is required: the prior custom ore yields are retained.
If exact native wrong-tool statistics/effects or custom-tool wear are required,
the script replacement's documented limits need an explicit decision after the
in-game comparison. Ore access for custom/modded or future pickaxe IDs remains a
separate tier-design decision; no new IDs are silently assigned iron-tier ability.
