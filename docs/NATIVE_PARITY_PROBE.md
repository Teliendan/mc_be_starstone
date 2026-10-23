# Optional production parity monitor

2026-10-21; Bedrock1.26.52/server2.8.0. Stable APIs only; no game run claimed.
The normal input now uses native receiver events. This optional behavior pack
is script-only: **no block override, custom component or experimental feature**.
It can remain active alongside the production BP/RP without changing input
definitions. Use a separate test world for diagnostics, especially XP spawning.

## Input observation

Prepare the input/source and a downstream cable/lamp circuit. Look at the input
within six blocks and run `/scriptevent starstone_probe:input`. For80 ticks
(about four seconds), it samples the actual production source state (`on`), blue
conductor (`starOn`), receiver self power and six-neighbor powers. Schema3
reports `observation:production_state`, mount/initial state and per-tick samples.
It does **not** claim to record raw engine callbacks or their previous-power field.

Neighbor order is +X,-X,+Y,-Y,+Z,-Z. Missing neighbors are null and mark an
incomplete read. The analysis counts observed source/conductor changes and
same-sample native/legacy-neighbor differences. Unknown reads remain unknown;
there is no automatic PASS. Timer order can affect individual sample differences.
The old schema2 callback experiment and its block generator are retired.

JSON goes to chat/content log and the pack's `starstone_probe:last` property.
Retrieve it with `/scriptevent starstone_probe:last`. Repeat all six mounts,
powered supports, directed repeaters/comparators, dust, observer pulses at
different phases, feedback, wet mounts and reload. Observe actual downstream
outputs too: source capture alone does not prove budgeted output pulse delivery.
Save game version, layout, report and lamp/output outcome.

## XP observation

In Survival/Adventure away from unrelated XP/players/orbs, run
`/scriptevent starstone_probe:xp 1`, then repeat amounts2–5. It places the
corresponding production native-orb structure at the player's cell and records
total XP/equipment before and after80 ticks. First test without Mending, then
with damaged Mending equipment. Inspect exact pickup totals, repair and XP
remainder. It does not set XP, change inventory/game mode/gamerules or delete
entities. Keep spawned orbs within pickup range and finish one session at a time.
Pre-existing nearby orbs are rejected, but newly arriving XP/players can still
affect the result. Reports are evidence to inspect, not automatic success.

Only one session runs at a time, with no idle interval. Sessions stop after80
ticks or target/player/dimension loss. At most80 samples and8 neighbor-ID
snapshots are retained; snapshot overflow is reported. Pack labels/descriptions
come from the localization catalog in nine locales plus compatibility aliases.
Unit tests validate recording/stop paths and summary interpretation with synthetic
states; they do not simulate native electrical delivery, pickup or Mending.
