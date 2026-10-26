# Owner test results — 2026-10-25

Bedrock 1.26.52. Source: workspace `temp/testing_feedback.md`.

| Report | Disposition |
| --- | --- |
| S1 sustained/reloaded input | Owner PASS |
| S2 placement beside powered source | Owner PASS |
| S3 observer pulse | Owner PASS |
| S4 summoned XP orb | Owner clarified the summoned orb awards exactly 1 XP (follow-up); retain working ore structures in this pass |
| S5 quick mining breaks/Mending | Owner PASS |
| Input/output float outside the hand | Fixed in source: native same-ID item replacements use the existing inventory sprites; owner accepted in follow-up (Rest is OK) |
| Graphics need full revision | Deferred at owner's request; `TODO.md` |

The item replacement keeps block IDs, recipes, loot, placement traits and
network code. Existing translated block-name keys also name the items. The
official block-placer contract requires the item and block IDs to match and
returns the replacement for mining/pick-block:
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_block_placer

Offline verification and deployment are recorded in the workspace feedback
tracker. Existing input/cable edits were already present when this task began.
