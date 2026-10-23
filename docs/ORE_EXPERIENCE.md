# Ore mining experience

Owner-approved Group18 follow-up, 2026-10-21. Target Bedrock1.26.52 /
server2.8.0. Implemented and checked offline; native pickup/Mending acceptance
is pending. No new in-game observations are claimed.

A completed Survival/Adventure player break of `starstone:ore` with an iron,
diamond or netherite pickaxe releases a uniformly chosen integer1–5 XP.
Silk Touch, rejected tools, Creative/Spectator and `doTileDrops:false` release
none. Fortune changes Dust, not the XP range. The before-break item snapshot
from the native after-break event preserves the identity/enchantments of a
tool consumed on its last use. Existing native loot remains the sole item owner.
Explosions/commands do not receive this mining reward. Environmental XP parity
is a separate open interaction, not established by this player-break path.

`scripts/oreExperience.js` places one of five entity-only pack structures at the
broken cell, explicitly excluding blocks and including entities. Both block
layers contain only void indices; replacement blocks and contained water are
not written. There is no per-tick service or persistent custom reward entity.
The structures contain native `minecraft:xp_orb` actors with a Bedrock **Int**
named `experience value`, with totals1 through5. Values are split into native
small denominations: `[1]`, `[1,1]`, `[3]`, `[3,1]`, `[3,1,1]`. This uses encoded
values, not an assumption that every spawned orb is worth one point. Native
pickup owns attraction, Mending and the player's XP award; no direct credit is
added. `Age` starts at0 and no persistence override is authored.

Rebuild the committed binary assets with `node tools/build_ore_xp.mjs`. The
independent decoder in `tests/oreExperience.test.mjs` checks their identifiers,
NBT types, totals, void layers and lack of persistence. Runtime tests exercise
eligible/excluded events and placement options; `eventWiring.test.mjs` imports
the real main entry point to check single subscription/award ownership.
Run `mods verify starstone --suite ore-parity` from the workspace.

## Evidence and engine acceptance

Research followed shared knowledge, installed vanilla, official26.50/26.52
changelogs and API declarations before external runtime/NBT research.

- The original [Bedrock runtime investigation](https://wiki.bedrock.dev/entities/non-mob-runtime-identifiers#minecraft-xp-orb)
  documents native attraction/absorption and the `experience value` extension.
- The [Bedrock entity-format Wiki archive, November2025](https://wiki.ronlab.site/content/minecraftwiki_en_all_maxi_2025-11/Bedrock_Edition_level_format/Entity_format#Experience_Orb)
  identifies the Int value and Short Age. It is format documentation, not a
  target26.52 game measurement; Java's `Value` tag is inapplicable here.
- [StructureManager.place](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/structuremanager?view=minecraft-bedrock-stable)
  and the pinned2.8.0 `StructurePlaceOptions` support entity-only placement.
- The current [Dimension API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimension?view=minecraft-bedrock-stable)
  lists `spawnXp` with a pre-release caution. It is absent from pinned2.8.0;
  the stable page label is not sufficient to adopt it.

Native checks: structures load repeatedly without actor loss/duplicate-ID
errors; pickup totals equal every requested1–5 value without Mending; damaged
Mending equipment repairs and any remainder becomes XP; normal mining awards
once alongside the approved Dust; last-use tools, Fortune, Silk, wrong tools,
Creative, `doTileDrops:false`, reload and Nether/End positions behave as intended.
Compare the gamerule and native orb lifetime against vanilla redstone ore;
these are authored gates/lifetime intent, not measured parity.
The optional [native probe](NATIVE_PARITY_PROBE.md) measures exact requested
amounts without changing the player's inventory, XP or equipment directly.
Custom furnace XP is not configured or promised by the ore smelting recipe.
