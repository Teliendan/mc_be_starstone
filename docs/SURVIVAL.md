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
see [VANILLA_PARITY.md](VANILLA_PARITY.md) for gates and pending native acceptance.
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
native break events still perform network/index cleanup. See [VANILLA_PARITY.md](VANILLA_PARITY.md#harvest-gates-and-native-blast-loot)
for sourced APIs, tool wear, compatibility limits and the in-game acceptance list.

## Recipes

Crafting recipes unlock when the relevant Starstone material is first carried. All counts
are exact recipe outputs. Every crafting recipe is shaped (workspace rule, enforced by
`verify_addon.py` and `survival.test.mjs`). Starstone Dust is obtained from ore; there is no
craftable Dust shortcut.

| Result | Grid (`.` = empty) | Key | Method |
|---|---|---|---|
| 1 `starstone:cable_item` | `CSC` | `C` copper ingot, `S` Dust | Crafting table |
| 1 `starstone:inner_corner_item` | `C.` / `.C` | `C` Cable | Crafting table |
| 1 `starstone:compressed_dust` | `.S.` / `SCS` / `.S.` | `S` Dust, `C` copper ingot | Crafting table |
| 1 Crystal | 1 Compressed Dust + fuel | | Furnace |
| 1 Dust | 1 Silk-Touched Starstone Ore + fuel | | Furnace or blast furnace |
| 4 `starstone:bridge` | `.C.` / `CIC` / `.C.` | `C` Cable, `I` iron ingot | Crafting table |
| 2 `starstone:conduit` | `.D.` / `CSC` / `.D.` | `D` Dust, `C` copper ingot, `S` chiseled stone bricks | Crafting table |
| 1 `starstone:generator` | `CCC` / `SGS` / `CCC` | `C` copper ingot, `S` Crystal, `G` gold ingot | Crafting table |
| 1 `starstone:lamp` | `.C.` / `.S.` / `.G.` | `S` Crystal, `G` glass, `C` copper ingot | Crafting table |
| 1 `starstone:redstone_input` | `.C.` / `RXD` / `.S.` | `S` Crystal, `D` Dust, `C` copper ingot, `R` redstone, `X` comparator | Crafting table |
| 1 `starstone:redstone_output` | `.C.` / `DXR` / `.S.` | `S` Crystal, `D` Dust, `C` copper ingot, `R` redstone, `X` repeater | Crafting table |

A Generator therefore consumes at least eight mined Dust through its two Crystals, two
copper ingots in the precursors, six more copper ingots and one gold ingot in the generator
grid, and fuel for two furnace operations. This makes it a deliberate permanent network
source, while the redstone input adapter offers a cheaper way to power Starstone from an
existing redstone circuit.

The furnace and its hoppers use vanilla behavior: precursor from above, fuel from a side,
and finished Crystals extracted below. The four-Dust crafting step can be automated
separately with a vanilla Crafter where available. A custom Crystal Kiln with its own slots
and exact hopper rules remains a later version gate (owner decision 2026-10-21; see
[DESIGN.md](DESIGN.md)). Retired: `docs/RECIPES.md` in git `1492493`.

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
