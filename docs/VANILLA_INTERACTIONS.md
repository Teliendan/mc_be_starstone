# Vanilla interaction ledger

2026-10-18; target Bedrock **1.26.52** / Script API **2.8.0**.
Source/documentation audit, with approved Group18 source follow-up2026-10-21.
**No new engine tests.**

Group18 inspected2026-10-21: [detailed findings and counterpart sweep](PARITY_INSPECTION.md).
Owner approved stable native input and the other fixes, excluding experiments.
Ore-to-one-Dust furnace/blast recipe, ore bass-drum instrument and documented
valued native1–5 mining XP are implemented. Native receiver events replace the
old four-tick neighbor sampling. Recovery uses stable receiver reads; no beta
API or neighbor fallback. The script-only [monitor](NATIVE_PARITY_PROBE.md)
observes production. XP pickup/Mending, cooking and sound remain
native acceptance checks. No automatic item-id migration or broad defaults.
The [native decision](INPUT_EVENT_OPTIONS.md) records source ownership,100-tick
bounded recovery and remaining native delivery/reload checks. All42 regressions
pass offline; no full engine-compatibility claim.

Follow the [shared interaction workflow](../../../.claude/skills/bedrock-modding/references/22-vanilla-interactions.md)
and [source/coverage report](../../../docs/vanilla-interactions-audit-2026-10-18.md).
The source report supplies canonical/archived Wiki URLs, inspected sections and
access/version limits. November 2025 archived pages are discovery evidence, not
proof of current engine behavior.

Every identifier below inherits the shared common prompts and its family row.
Linked block items, entity placers, projectiles and variants must be tested as
one feature. Existing notes establish only the interactions they actually
describe. **OPEN** means discovery/intent/implementation or game behavior remains
unresolved; no family below claims a completed all-interactions parity sweep.
For closure, expand the family row into individual interaction outcomes using
the shared row format and record test version/date.

## Family findings and decisions

| Group | Counterparts / existing evidence | Disposition and remaining interactions |
| --- | --- | --- |
| Power blocks | Stone, redstone lamp and repeater by material/function; [PARITY_INSPECTION.md](PARITY_INSPECTION.md), `BLOCK_MATERIALS.md`, `WATER.md`, `SUPPORT-MOTION.md` | Group18 stable native input approved/implemented. Retain binary network, mounts, water/material/piston rules and0/15 output. Native receiver events own source state; stable self reads supply bounded recovery, with no neighbor OR or experimental API. **OPEN native:** actual delivery/feedback/timing/reload, observer/comparator/sculk, non-ore instruments, collision/spawn/support/environment and automation. |
| Ore | Redstone ore by aspect; [PARITY_INSPECTION.md](PARITY_INSPECTION.md), `HARVEST.md`, material ledger, ore loot | Tool/Fortune/Silk/item loot routes retained. New XP eligibility/assets/real-main wiring tests are separate from loot tests. Approved ore->1Dust furnace/blast, bass drum and valued native1–5 mining XP implemented. Keep custom yields, level3 continuous glow and existing generation. **OPEN native:** rewards/timing, exact XP pickup/Mending, repeated actor loading, explosion/fire/gamerules and physical/ecological acceptance. |
| Placement items | Cable/inner-corner linked blocks; [PARITY_INSPECTION.md](PARITY_INSPECTION.md), `INNER-CORNER.md`, `SURVIVAL.md` | Existing placement/loot/recipe identities retained. `replace_block_item:true` requires matching item/block IDs, so it cannot simply be added to `_item` placers. **OPEN native:** actual pick-block/raw automatic item identity, stacking/recipe compatibility, displays, inventory automation/dispenser and lifecycle. No saved-item migration proposed without evidence. |
| Resources | Dust/precursor/crystal; [PARITY_INSPECTION.md](PARITY_INSPECTION.md), `RECIPES.md`, `CRYSTAL-REFINING-PROPOSAL.md` | Retain four Dust plus copper precursor and native furnace Crystal route; no new kiln/amethyst gate or generic redstone/diamond consumers. Approved ore smelting is a separate route. **OPEN native:** furnace/hopper/Crafter operation and XP, inventory/drop/death/display/automation outcomes. No evidence demands new fuel/repair/brewing/trade/beacon uses. |

The linked Group18 sweep records source findings, prior choices, supported-path
investigations and remaining game acceptance separately. This inspection makes
the approved native input authority change; topology/budgets, worldgen and item
loot remain as accepted. Ore rewards and uses change only as recorded above.

## Exact authored inventory

### Blocks (9)

| Identifier | Review group | Source |
| --- | --- | --- |
| `starstone:bridge` | Power blocks | [starstone_bp](../starstone_bp/blocks/bridge.json) |
| `starstone:cable` | Power blocks | [starstone_bp](../starstone_bp/blocks/cable.json) |
| `starstone:conduit` | Power blocks | [starstone_bp](../starstone_bp/blocks/conduit.json) |
| `starstone:generator` | Power blocks | [starstone_bp](../starstone_bp/blocks/generator.json) |
| `starstone:inner_corner` | Power blocks | [starstone_bp](../starstone_bp/blocks/inner_corner.json) |
| `starstone:lamp` | Power blocks | [starstone_bp](../starstone_bp/blocks/lamp.json) |
| `starstone:ore` | Ore | [starstone_bp](../starstone_bp/blocks/ore.json) |
| `starstone:redstone_input` | Power blocks | [starstone_bp](../starstone_bp/blocks/redstone_input.json) |
| `starstone:redstone_output` | Power blocks | [starstone_bp](../starstone_bp/blocks/redstone_output.json) |

### Items (5)

| Identifier | Review group | Source |
| --- | --- | --- |
| `starstone:cable_item` | Placement items | [starstone_bp](../starstone_bp/items/cable_item.json) |
| `starstone:compressed_dust` | Resources | [starstone_bp](../starstone_bp/items/compressed_dust.json) |
| `starstone:crystal` | Resources | [starstone_bp](../starstone_bp/items/crystal.json) |
| `starstone:dust` | Resources | [starstone_bp](../starstone_bp/items/dust.json) |
| `starstone:inner_corner_item` | Placement items | [starstone_bp](../starstone_bp/items/inner_corner_item.json) |

### Entities (0)

No explicit entities definitions. Reused vanilla/automatic block items still require applicable review.

