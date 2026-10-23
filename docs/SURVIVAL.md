# Starstone survival content

## Resources

Ore emits light level 3, including hand-placed ore. This does not change its
generation frequency or allow it to shine through solid surrounding stone.

`starstone:dust`, `starstone:compressed_dust`, and `starstone:crystal` are stackable items. Starstone Ore is a
full block using the source texture already present in the resource pack.
Ore now uses the normal Redstone Ore material profile: base mining parameter 3,
blast resistance 3 and native pickaxe effectiveness. The old six hand-tuned
`item_specific_speeds` are removed. This is the normal stone ore counterpart,
not Deepslate Redstone Ore (4.5). Tool tier, enchantments and game modifiers
determine actual break time; native timing still needs an in-game check.
Gold, wood, stone and copper pickaxes cannot collect ore drops.

Starstone Ore drops 2–4 Dust when mined with an iron, diamond, or netherite
pickaxe. Stone pickaxes are not sufficient. Silk Touch on a valid pickaxe drops
the ore block. Fortune I, II, and III yield 3–5, 4–6, and 5–7 Dust.

Eligible non-Silk player mining also releases1–5 XP through valued native orbs;
see [ORE_EXPERIENCE.md](ORE_EXPERIENCE.md) for gates and pending native acceptance.
Collected ore smelts to one Dust in a furnace or blast furnace. Ore underneath
a note block selects the bass drum (`note.bd`); actual sound/cooking still need
an in-game check. No generation or continuous level3-light setting changes.

Native loot now owns mining and explosion drops. Its exclusive branches use
positive enchantment ranges and 26.50 condition negation, avoiding the old
in-game failure of matching a missing enchantment as level zero. Every owning
entry applies native explosion decay after its count. Creative-mode breaks and
`doTileDrops` follow native loot behavior.

A completed wrong-tool Ore player break is canceled and removed without items on
the next tick, with replacement guards and existing network/support cleanup.
Conduit and generator collect with any tool or hand, per the owner's 2026-10-10
clarification; their native pickaxe effectiveness changes speed only. Their
native break events still perform network/index cleanup. See [HARVEST.md](HARVEST.md)
for sourced APIs, tool wear, compatibility limits and the in-game acceptance list.

## Generation tuning

The `starstone:ore_underground` feature rule makes four uniform attempts per
Overworld chunk from Y -64 through 15. The `starstone:ore_deep` rule adds eight
triangular attempts from Y -96 through -32. Both place one ore feature with
`count: 8`, replacing stone or deepslate. No air-exposure discard is configured.
These settings mirror the bundled vanilla Redstone Ore rules; they do not
guarantee identical measured counts in any particular world.

The feature schemas are documented by Bedrock's
[ore feature reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/features/minecraft_ore_feature?view=minecraft-bedrock-stable),
and [feature rule reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/features/feature_rule_definition?view=minecraft-bedrock-stable).

## In-game checks pending

Static regression and pack verification cover identifiers, loot-pool structure,
and generation bounds. A loaded-world check is still required to confirm
generation frequency, visible cave exposure, and ore drops in the target
Bedrock build.
