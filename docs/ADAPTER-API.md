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

Newly tracked inputs receive one deferred receiver check. Every100 game ticks,
known positions are queued for recovery and cosmetic contact refresh, with at
most32 positions processed per deferred callback. These reads use the receiver's
own stable `getRedstonePower()`; undefined/unavailable does not establish off.
No neighbor-power OR fallback, per-tick service or world scan is added. Unloaded
entries remain for recovery; stale loaded entries are removed, and the timer
stops when no inputs remain. The diagnostic `lastPolled` value counts the latest
recovery batch, not the old four-tick neighbor poll.

Input migration explicitly preserves prior `use_liquid_clipping:true`. Existing
mounting guards, water behavior, shapes, network ports and saved identifiers
remain. No native passthrough/conductor/producer is added to the input. There is
no dependency on pre-release `firstUpdate`, neighbor-change APIs or Beta APIs.

## Evidence and native acceptance

Offline tests exercise all six mount frames, real main/surface callback wiring,
dispatched two-tick pulse phases, analog deduplication, multiple sources,
storage-failure retry, powered initialization, unknown/unloaded reads and bounded
recovery. They do not simulate Minecraft's electrical rules. Native checks still
cover powered support, directional repeaters/comparators, actual observer pulses,
feedback, water and restart/reload. Budgeted output writes coalesce newer levels;
capturing an input edge does not promise arbitrary large-network pulse fidelity.
The optional [production monitor](NATIVE_PARITY_PROBE.md) observes the actual
input without a block override. [Decision and sources](INPUT_EVENT_OPTIONS.md).
