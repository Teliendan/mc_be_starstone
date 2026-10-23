# Starstone parity inspection — Group18

2026-10-21; target Bedrock1.26.52 / Script API2.8.0; source `8331963`.
Initial inspection used unchanged source `8331963` and39 passing runners.
Owner follow-up now approves **stable native input, no experimental features**.
Ore smelting, bass-drum instrument and valued native mining-XP structures are
implemented; input uses native receiver events. The optional monitor is documented in
[NATIVE_PARITY_PROBE.md](NATIVE_PARITY_PROBE.md), with the XP route in
[ORE_EXPERIENCE.md](ORE_EXPERIENCE.md). No new in-game observations are claimed.
The numbered findings retain the initial baseline evidence and recommendations,
before the native implementation was authorized; current status is at the end.

## Scope and retained design

All9 blocks and5 explicit items from [the inventory](VANILLA_INTERACTIONS.md)
were inspected with their linked loot/recipes, mounting states, runtime events
and existing tests. Automatic block items are included in the item review.

Retain the documented separate **binary** electrical network, six-face mounting,
isolated bridge lanes, axial conduits, growing inner corners, unlimited manual
generator, and adapters converting native redstone to/from0/15. A redstone-block
material profile does not make a generator/conduit a constant native redstone
source. Conduit's casing conduction is an explicit prior owner decision.

Existing ore iron/diamond/netherite collection, custom2–4 Dust and capped Fortune
yields, Silk Touch self-drop, constant level3 light and generation settings remain.
Conduit/generator any-tool collection, thin-device/lamp water survival and
waterlogging, piston reactions and original-support departure are already
reviewed choices. Keep the four-Dust-plus-copper precursor and furnace Crystal
route. The proposed future kiln is not a missing parity fix.

## Findings at the inspected baseline

### 1. Short input pulses can be missed — confirmed offline timing limitation

`redstoneAdapters.js` samples registered inputs every4 game ticks. A signal high
only on ticks1–2 is absent at the0/4 polls. The source-only probe executes the
production adapter/network/power code using the existing test fixture:

| Pulse length | Start offsets against a4-tick poll | Input/lamp detected |
| --- | --- | --- |
| 2 game ticks | 0,1,2,3 | yes,no,no,yes |
| 4 game ticks | 0,1,2,3 | yes,yes,yes,yes |

The original scratch reproduction was retired after native input approval;
native callback coverage now lives in `redstoneAdapters.test.mjs`.
The two missed cases have0 input transitions; detected cases have2. This is
ordinary sampling across ticks, not an artificial mid-callback mutation and
not a native observer test. The November2025 Wiki documents observer pulses as
2 game ticks; actual target-engine pulse/delivery timing still needs acceptance.

The existing polling choice is explicit in ADAPTER-API.md and
SCRIPT_PERFORMANCE.md. Tests deliberately reject adding a native consumer until
its semantics match the six-neighbor maximum. Therefore **do not silently swap
the implementation or quadruple polling** and call that equivalent.

Recommendation: investigate/fix short-pulse intake, preferring native
`redstone_consumer`/`onRedstoneUpdate` if engine checks establish the required
input behavior. It is stable from authored format1.26.0; the input currently
uses1.21.120, so it requires a deliberate migration. Check floor/wall/ceiling,
mounting-support power, correctly/incorrectly facing components, output feedback,
zero-power transitions (`min_power:0`) and reload. Preserve water clipping and
existing saved source/network rules. Native events report receiver power;
neighbor block power is a different observation. API availability alone does
not prove equivalence. Also preserve bounded network work: the existing power
queue coalesces newer states, so intake alone does not establish faithful pulse
delivery through every large circuit. Do not promise instantaneous wire parity.

### 2. Silk-Touched ore has no smelting route — propose one Dust

No recipe takes `starstone:ore`. The installed newest vanilla redstone-ore
recipe takes its ore to one redstone item with both `furnace` and `blast_furnace`
tags. This is an applicable alternate use of collected ore, separate from
Crystal refining.

Recommendation: add native `starstone:ore` -> **1 `starstone:dust`** in a furnace
or blast furnace. Mining remains the better yield; do not add campfire/smoker
recipes, reverse Dust crafting, extra Crystal output or a new machine. Native
smelting/hopper behavior needs acceptance. Current furnace recipe documentation
does not establish a custom XP parameter; do not promise native redstone's0.7
smelting XP or add an invented recipe field.

### 3. Ore's note-block instrument — propose bass drum

Ore has no `instrument_sound`. Official defaults are harp on `up`, none on
`down`; the redstone-ore Wiki explicitly documents bass drum underneath a note
block. Its sound identifier is `note.bd`. Ore already uses format1.26.50;
instrument JSON is stable in target26.52 (released from experimental in26.40,
despite the stale experimental notice on the component page).

Recommendation: configure the ore's native note-block instrument as bass drum.
This is a source/documented-default mismatch, not a new measured sound defect.
Test the native orientation after deployment. Do not derive other devices'
instruments from their wood/glass step sounds or change their formats just for
this ore correction; their exact counterpart instruments remain open.

### 4. Mining XP is not implemented — supported-path investigation

No Starstone source/loot path awards mining experience. The existing inventory
ledger's claim that XP was covered by harvest tests was incorrect: those tests
cover items, tool gates/wear and explosions, not mining XP. Redstone ore's
documented mining reward is1–5 XP, with no mining XP for Silk Touch.

Recommendation: investigate a correct native-orb route for allowed-tool,
non-Silk mining. There is no ore XP block component in the inspected current
component inventory, and pinned API2.8.0 exposes no XP-orb value setter. Installed
`xp_orb` is summonable, but its JSON does not establish the XP value of a
script-created orb. Do not equate a spawned orb count with an XP total without
measurement. `Player.addExperience` is a point grant, not verified orb pickup/
Mending parity. No direct-credit substitute, dummy reward mob or guessed loot
entry is proposed. Preserve no XP on rejected-tool/Creative/Silk paths and
single native item-drop ownership if a supported implementation is established.
At inspection this was **OPEN**, not an owner-approved no-XP design. The
follow-up below records the subsequently documented native structure route.

## Counterpart and common interaction sweep

| Area | Existing evidence / current disposition |
| --- | --- |
| Mining / material | Recorded redstone-block/ore/lamp/repeater-like profiles, explicit nonflammability, native speed tags and accepted collection differences retained. Existing source/tests cover tool tiers, custom Silk/Fortune quantities and deferred rejected-mining guards/wear. Native timing/effects and compatibility limitations remain in HARVEST.md. XP is separated above. |
| Explosion loot | Ore/conduit/generator have native decay after their owning counts. Cable/corner/bridge/lamp/adapters have explicit self/placer tables without decay. No new blanket decay policy inferred; exact counterpart blast drops and gamerule contexts remain native checks, including default full-drop TNT versus enabled decay and mob blasts. No scripted blast refund or second drop owner. |
| Placement / support | Six-face before-place guards, inner-corner support selection/growth and conduit axis selection are covered by existing suites. Own piston reaction and supplied support are separate from mounting survival. Keep existing support predicate and tested departure service; do not add timers. Exact native support supplied by thin shapes remains open. |
| Pistons / mutation / reload | Native popped or push_pull decisions and bounded support/mutation/index repair retained. Existing tests cover independent lanes, network splits, deferred writes, replacement, restart and unavailable chunks. Actual slime/honey, moving-support, wet support and A–B–C unloaded-middle-world gates remain in TEST-WORLD.md. |
| Native redstone | Output0/15, all six connected faces, transformed strong support face are already configured. Casing conduction is accepted. Exact weak/strong delivery, direction, comparator/observer/sculk and note behavior require native checks; do not add generic comparator inventories or native generator power. Input timing is finding1. |
| Lamp | Preserve mounted thin level15 panel controlled by Starstone. Full-cube vanilla lamp's opacity/conduction and Bedrock6-tick off-delay are not automatically panel requirements. No direct-redstone consumer added to every lamp. |
| Ore light / ecology | Preserve constant level3 glow, including placed ore. Redstone ore's contact-activated level9 glow/random reset/particles are a different behavior; the material profile alone does not require copying it. Actual light propagation, spawning, growth and other ecology remain game checks. |
| Fluids / environment | Existing water decisions remain: thin devices/panel contain and survive water; full cubes block it. Water rules do not prove lava behavior. Native lava, rain/snow, fire/explosion contexts, fluid layer preservation and rendering remain separate checks. No blanket default-policy components added without counterpart evidence. |
| Collision / spawning / navigation | Authored collision/selection boxes and transforms checked by existing suites. Source declarations are not measurements of native pathfinding, entity obstruction, spawning, suffocation, attachments, falling blocks or chest opening. No geometry/art redesign. |
| Generator triggers | Existing player-only manual interaction and persistent enabled state retained. No matching native lever/button counterpart was selected for projectile, mob or wind-charge activation; no extra trigger added solely because the generator has an on/off state. Native game modes/held-item/sneak interaction precedence remains acceptance work. |
| Item identity / pick-block | Cable/corner explicit placers use different IDs from their hidden automatic block items; loot/recipes consistently use `_item`. Actual Creative pick-block and existing inventory outcomes need testing. Official `replace_block_item:true` requires identical item/block IDs, so adding that flag to existing `_item` definitions is not a valid shortcut. No speculative saved-item/recipe migration. |
| Item lifecycle / automation | Five explicit items stack64, use normal icon/display data; resources are bespoke recipe ingredients. Existing recipes have unlocks and use native furnace/Crafter routes. Native hopper/dropper/dispenser, drop/fire/lava/cactus/void, death/keepInventory, displays and stack interactions remain shared game checks. No inferred food, compost, fuel, tool repair, potion, villager trade, beacon or armor use for Starstone resources. |
| Acquisition / worldgen | Existing Overworld stone/deepslate feature, count8, uniform4 and triangular8 attempts match installed numeric redstone setup. No air-exposure discard; no new renewable resource source or density retune. Only new chunks generate ore; this inspection makes no worldgen changes. Older hardcoded/flattened stone replacement semantics are not inferred from absence of data files. |

## Sources and confidence

Read relevant shared modding/blocks/items/scripting/lookup guidance and references,
workspace research/interaction review, mod material/harvest/water/support/adapter/
performance/recipe/refining/tag/verification notes before external research.
Compared all current authored declarations and their relevant runtime/tests;
installed newest redstone ore features/recipes, utility definitions and RP sound
policy. Built-in vanilla ore/repeater block BP definitions are not exposed as
data-driven files; absence does not establish unsupported native behavior.

Primary sources retrieved2026-10-21:

- [26.50 changelog](https://feedback.minecraft.net/hc/en-us/articles/48826825649933-Minecraft-Bedrock-Edition-26-50-Changelog-Wilderness-Bound) and [26.52 hotfix](https://feedback.minecraft.net/hc/en-us/articles/49175370527501-Minecraft-Bedrock-Edition-26-52-Hotfix-Changelog): checked before proposing a workaround. Neither supplies a fix for the custom sampling or missing recipes/XP.26.50's condition negation is already used in ore loot; retain it.
- [26.0 Creator notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.0?view=minecraft-bedrock-stable), [redstone consumer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable), [custom component callbacks](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockcustomcomponent?view=minecraft-bedrock-stable), and pinned2.8.0 declarations: stable receiver/event availability and zero-power filtering, not equivalence to neighbor sampling.
- [26.40 Creator notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.40?view=minecraft-bedrock-stable) and [instrument_sound](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_instrument_sound?view=minecraft-bedrock-stable): stable block component, defaults and instrument IDs. Newer API methods in those notes are not assumed available in pinned2.8.0.
- [Furnace recipes](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_furnace?view=minecraft-bedrock-stable) plus installed `vanilla_1.26.40/recipes/furnace_redstone_ore.json`: native furnace/blast recipe tags and one-item result. No documented custom XP field inferred.
- [block_placer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_block_placer?view=minecraft-bedrock-stable): replacement-item registration requires identical IDs.

The owner-requested current Minecraft Wiki ore page was robots-denied.
November2025 archives supply conceptual/numeric counterpart discovery, **not
target26.52 engine proof**: [Redstone Ore](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Redstone_Ore),
[Redstone Repeater](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Redstone_Repeater),
[Redstone Lamp](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Redstone_Lamp),
[Block of Redstone](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Block_of_Redstone),
[Redstone Dust](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Redstone_Dust),
[Observer](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Observer),
[Note Block](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Note_Block),
[Experience](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Experience).
Usage/breaking/smelting/material/edition and linked pulse/instrument/XP sections
were inspected. Java-only water/glow/timing or summon-NBT details are not copied
as Bedrock guarantees. Ore glow/light, mounts and resource roles remain the
mod's established choices, not generic vanilla omissions.

The pulse scratch and prototype block override/generator are retired. Maintained
XP templates, script-only monitor and feature regressions live in the mod.
Localization uses the catalog; diagnostics report technical JSON.

Workspace knowledge/progress commit: `d7ef8d6`
(`Inspect Starstone parity and record input pulse limits`). This identifies the
initial inspection record, before the approved source follow-up.

## Approved follow-up, 2026-10-21

1. **Implemented with owner approval:** stable native receiver events now own
   input power, replacing neighbor-level sampling. Format1.26.0 preserves old
   water clipping. Existing surface hooks and durable source/network ownership
   remain. Deferred initialization plus100-tick recovery checks only the native
   receiver, at most32 positions/callback. No experimental APIs, firstUpdate or
   neighbor fallback. Native directional/timing/reload acceptance remains open.
2. **Implemented:** ore ->1Dust using native furnace/blast tags. Existing
   precursor/Crystal recipes and mining yields remain as accepted. No invented
   furnace XP parameter.
3. **Implemented:** native ore `instrument_sound.up:note.bd`, recorded in the
   block material property ledger. No unrelated device instrument migrations.
4. **Implemented documented route; native acceptance pending:** eligible
   non-Silk player mining places valued native orbs totaling1–5 XP. Bedrock NBT
   supplies an Int `experience value`; no guessed orb count or direct credit.
   Wrong tools, modes, Silk and doTileDrops gates are covered offline. Native
   exact pickup, Mending, repeated structure loading and gamerules still need
   measurement. See the linked XP/probe notes for sources and protocol.

Native implementation verification: **42/42** feature runners and localization
pass. Production BP/RP checks:0 errors/0 warnings/0 exceptions. The script-only
monitor has one expected informational no-definitions warning,0 errors.
Native implementation deployed; all three packs confirmed in sync.
Earlier shared progress: `89ebf20`; options/changelog: `f4b42be`, `6782d13`.
Stable native implementation knowledge/progress: `54f7ddc` in the workspace repo.

Current [native decision and evidence](INPUT_EVENT_OPTIONS.md). Monitor schema3
samples production states without a block override or raw-callback claims.
No engine compatibility/timing/pickup result is inferred from offline tests.
New feature runners are registered in `tests/suites.json`; no broad mod commit
or push is performed by this task. Normal pack source changes need world re-entry;
there is no worldgen change or new-world requirement for these ore fixes.
