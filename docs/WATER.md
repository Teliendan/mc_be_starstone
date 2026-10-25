# Water decisions

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
