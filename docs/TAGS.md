# starstone: tag/family audit

2026-10-13; target Bedrock 1.26.52 / Script API 2.8.0. Source revision `a03f3c5`.

Status: source inventory and official-documentation review; proposals have not been applied. No new engine tests. Pack files were left unchanged. A reasoned omission is a valid audit result.

Scope: 9 block definitions, 0 entity definitions, across every `*_bp` pack in this mod. Relevant explicit item tags were cross-checked for the block/item distinction.

## Recommendations and effects

Keep the current tags and intentional omissions. Ore, generator and conduit have pickaxe speed tags. The other six blocks follow redstone-device/lamp profiles with no preferred tool; do not infer stone/metal tags from texture or sound.

## Complete block inventory

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

## Complete entity inventory

| Entity | Base families | Group overrides / decision |
| --- | --- | --- |
| None | - | No custom entities |

## Related explicit item tags

These are item-component tags, not block tags. This is a cross-check, not a request to classify every inventory item.

| Item | Tags |
| --- | --- |
| None declared | Omission alone is not an error |

## Evidence and follow-up

- Shared decision rules and primary sources: [tags and families](../../../.claude/skills/bedrock-modding/references/14-tags.md).
- Cross-mod findings and verification status: [workspace audit](../../../docs/tag-audit-2026-10-13.md).
- Existing runtime quest/hostility/debug tags are separate from these families. No new runtime tags or cleanup mechanisms are proposed.
- If accepted, update any responsible generator, run `mods verify <mod>`, deploy and confirm `in sync`, then record relevant engine observations here.
