# Harvest gates and native blast loot

2026-10-10; target Bedrock 1.26.52, stable Script API 2.8.0. Documented API/schema
plus offline behavior tests. This new path has not been accepted in game.

| Block | Vanilla counterpart | Collection | Native owning table |
| --- | --- | --- | --- |
| Conduit, generator | Redstone block | Any item tagged `minecraft:is_pickaxe`, including copper | One self item, then `explosion_decay` |
| Ore | Normal redstone ore | Existing iron/diamond/netherite pickaxe IDs | Custom Dust 2-4; Fortune I/II/III+ 3-5/4-6/5-7; Silk Touch one Ore; decay last |

Ore quantities retain the reviewed Starstone design; vanilla redstone's different
Dust quantities do not override it. Custom tagged pickaxes collect conduit and
generator; their ability to mine ore remains outside the approved exact-ID gate.
Other Starstone blocks keep their existing collection policy.

## Why there are two mechanisms

Native mining-efficiency tags set tool effectiveness, not a collection gate.
Positive `match_tool` loot conditions also exclude tool-less environmental
destruction. A negated tool test cannot distinguish an empty-handed player from
an explosion. The old player-only ore item spawner and empty table lost all blast
loot; they are removed.

`harvestGate.js` intercepts only a completed wrong-tool survival/adventure player
break through `world.beforeEvents.playerBreakBlock`. It cancels the native break
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
explicitly runs Starstone's existing placement-index removal, network capture/
split and neighboring support/connection refresh. Native allowed-tool breaks
keep their existing event route.

## Tool wear and remaining limits

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

## Evidence and acceptance

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
exercises tool tiers, tag use, pass-through, prior cancellation, deferred guards,
deduplication and replacement invalidation. `eventWiring.test.mjs` imports the
real entry point and proves rejected generator mining removes its saved hint and
turns off the neighboring powered lamp. Wear has its own focused suite.

After deployment/reload, compare hand, axe, shears, each pickaxe tier and relevant
enchanted tools against redstone block/ore. Check durability/Unbreaking, Creative,
doTileDrops false, TNT decay true/false and mob explosions, rapid attempts,
replacement protection and network cleanup. This replaces the prior plain-mining
acceptance for the changed harvest route; Fortune/Silk remain unverified in game.

## Questions saved for the owner

No new numeric loot choice is required: the prior custom ore yields are retained.
If exact native wrong-tool statistics/effects or custom-tool wear are required,
the script replacement's documented limits need an explicit decision after the
in-game comparison. Ore access for custom/modded or future pickaxe IDs remains a
separate tier-design decision; no new IDs are silently assigned iron-tier ability.
