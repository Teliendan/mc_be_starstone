# Block materials

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
native tool effectiveness applies. Its existing scripted harvest tier, Silk Touch
and Fortune logic is retained; see SURVIVAL.md. Other blocks retain their existing
loot behavior; a speed tag does not impose a new pickaxe drop requirement.

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

Conduit native conductivity remains its default false; Generator's existing true
is preserved. Their destruction counterpart cannot decide this network/casing
interaction. Owner question saved in workspace `docs/block-property-questions.md`.
Check break/step/place sounds and opaque Conduit lighting after pack reload.
