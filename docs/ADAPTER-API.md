# Redstone adapter API and behavior

Owner-approved native input, 2026-10-21. Bedrock1.26.52 / stable server2.8.0.
Input block format1.26.0; output format1.21.120. No experimental features.

## Output

`minecraft:redstone_producer` supplies0/15 on all six connected faces. The
canonical strong face is down, toward mounting support; `transform_relative:true`
rotates it with wall/ceiling mounts. Existing output fields and network budgets
are unchanged. [Official producer reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_producer?view=minecraft-bedrock-stable).

## Input

The base `minecraft:redstone_consumer` uses `min_power:0` and
`propagates_power:false`. The existing `starstone:surface` component's stable
`onRedstoneUpdate` hook forwards current receiver power to the adapter controller:
positive means on, zero means off. Analog positive-to-positive changes do not
create binary transitions. Actual/committed state supplies deduplication;
previous tick power is not treated as the previous callback state.

This deliberately replaces the old maximum-of-six-neighbors rule. A neighboring
powered block alone no longer enables input: native delivery determines the
received signal. Source updates keep the durable `sourceChanged` owner and the
existing loaded-network fallback. Red `starstone:powered` and blue
`starstone:star_powered` remain independent. Topology is not rebuilt per edge.

A newly tracked input (load, placement, network discovery; not a first callback) gets one
deferred `getRedstonePower()` read. Every 100 game ticks known inputs are queued (32 per
deferred run) for a visuals-only refresh of the contact masks; this pass never reads or
commits power, because callbacks are the only authority. No neighbor-power fallback,
per-tick service or world scan. Stale loaded entries are removed and the timer stops when
no inputs remain. Diagnostics report `initialReads`.

Input migration explicitly preserves prior `use_liquid_clipping:true`. Existing
mounting guards, water behavior, shapes, network ports and saved identifiers
remain. No native passthrough/conductor/producer is added to the input. There is
no dependency on pre-release `firstUpdate`, neighbor-change APIs or Beta APIs.

Final design, decisions and in-game checks: [VANILLA_PARITY.md](VANILLA_PARITY.md).
