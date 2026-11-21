# Performance

Offline evidence only: nothing here is a Minecraft tick, frame or watchdog measurement, and no
safe in-game network limit is claimed. Real 1k/5k/10k tick budgets are an open in-game check
([TEST-WORLD.md](TEST-WORLD.md) item 23). Retired: `docs/SCRIPT_PERFORMANCE.md` and
`docs/STRESS.md` in git `1492493`.

Summary of the budgets in force: power visuals are written by one engine-paced `system.runJob`
generator (SS-09, 2026-11-12): each step reads one block and writes at most one permutation, then
yields, so the engine's job budget sets the pace and a newer state for a node supersedes an unread
one; recovery and cosmetic refresh handle at most 32 registered positions per deferred callback
every 100 ticks; validation visits at most 6 indexed cursor entries every 100 ticks (was 16; ~72 block reads per call instead of ~181); the
chunk observer checks at most 32 cached chunk candidates every 100 ticks.

## Script performance and idle work

2026-10-21, Bedrock1.26.52/server2.8.0. Offline evidence; engine profiling and
native timing remain pending. The earlier support/idle optimization remains in
place; implementation commit: `Reduce support polling and idle electrical script work`.

The visual queue schedules a deferred flush only on dirty work and coalesces
edits. Native edit/piston hooks still mark affected positions. No idle per-tick
flush timer exists.

Owner-approved native input replaces the four-tick six-neighbor signal poll.
Stable native callbacks commit binary receiver changes through the existing
durable source owner and loaded-network fallback. Each edge may refresh local
contacts; analog positive-level changes do not repeat binary work. Signal intake
does not wait for a recovery timer.

Receiver recovery and cosmetic refresh run from known registered positions:
one deferred initial check, then a100-tick interval, at most32 positions per
deferred callback. Pending keys coalesce; no broad world volume is scanned.
Steady source checking reads one native receiver value rather than six neighbor
values. Undefined/unavailable reads retain state. The timer starts with the first
tracked input and stops after the last stale entry is removed. Unloaded entries
are retained. This is a code bound, not a profiler/FPS result.

Power writes use one engine-paced job with newer-state coalescing (see "Measured change"; the
earlier 32-node/16-write budgets were removed 2026-11-12). No unbounded pulse queue or replay/stretching service is introduced.
Actual short-pulse delivery in large networks remains a native acceptance check.

Tests: `redstoneAdapters.test.mjs`, real `eventWiring.test.mjs`, support/contacts,
power, persistence and stale-metadata suites. The script-only monitor named in the 2026-10-21 notes has since been removed.

Index caches (2026-10-27, offline only): `chunks()` and placement shard lookups no
longer list all world property ids or re-read saved chunks. Each index scans once,
lazily, then keeps a RAM copy current from its own writes (the only writers of its
prefix). Chunk snapshots are cached deep-frozen after the head commit; placement
caches only shard keys and still reads shard contents. Tests: `chunkSegments`,
`persistence`. A chunk commit now updates the logical graph incrementally (2026-11-12, `updateSegmentGraph`); `buildSegmentGraph` runs only cold.
Memory cost (Node/V8 heap, `temp`-measured 2026-10-27): about 0.6 KB per cable, 0.7 MB at
1k and 5.8 MB at 10k cables (stored text 0.3 / 3.3 MB). The old refresh built the same
objects transiently, so peak use is unchanged; QuickJS in game may be somewhat larger.
Placement `remove()` answers from the key cache when the shard does not exist.

## Offline algorithm stress measurements (2026-09-28)

Run from `C:\mcmods`:

```powershell
node mods/starstone/tests/stress.mjs
```

The harness builds one generator followed by 1,000, 5,000, or 10,000 cables,
discovers the connected network, builds and persists chunk segments, reconstructs
the logical graph from those saved segments, then powers all cables. It asserts
the expected membership, power, and actual write count. The fixture uses loaded
blocks in Node.js; these are **not game ticks, simulation-distance tests, frame
times, or watchdog measurements**.

The loader is registered by `runtimeFixture.mjs` before dynamically importing the
Minecraft-dependent production modules. No alternate production algorithms are
implemented in the harness.

## Measured change

Before bounded planning, applying power read 1,001 / 5,001 / 10,001 world blocks
in the calling stack, although permutation writes already drained 16 at a time.
The concrete write queue peaked at 1,000 / 5,000 / 10,000 entries respectively.

2026-11-12 (SS-09, owner decision): the plan/write queues and their batch constants
(`PLAN_BATCH=32`, `WRITE_BATCH=16`, backpressure 32) are gone. `applyPower` stores one target per
node and lane (consumers first, a newer state deletes and re-inserts the entry) and starts one
`system.runJob` generator that walks the live Map: per step it checks `isChunkLoaded` (unloaded ->
`pendingReconciliation`), reads the block, and calls `setPermutation` only on a difference, then
yields. One read and at most one write per step; the engine's per-tick job budget sets the pace
(not measured in game; the owner checks a long wire on PC and tablet). Bridge lane keys stay
independent. A skipped (unloaded) write is kept in `pendingReconciliation` (ref -> latest target,
one entry per node, also grouped per chunk). `catchUpPending` runs every
`PENDING_CATCHUP_INTERVAL_TICKS = 10` (2026-11-17, owner M50), probes one `isChunkLoaded` per pending
chunk (zero work when none), re-queues only the returned chunk's nodes and skips nodes with a newer
queued target; a newer `applyPower`, a processed write or a missing block clears the entry. Tick sim
(`scenario.mjs 300 4 64`): worst wrong-visual duration near the player 38 -> 0 ticks. `pendingCatchUp.test.mjs`.
`applyPower` always returns live `{written,unresolved,pending}`: `written` counts
actual state changes, `pending` reaches zero when every target was processed or superseded.
`powerStats()` keeps `queued` (targets), `peakQueued`, `appliedWrites`; `planning` is 1 while the job
runs. Fixture turns now equal job steps (one step per turn). The table below is the
2026-09-28 run of the previous batching and is kept as history; its callback columns do not apply.

Latest run on 2026-09-28, Node 22.14.0:

| Cable count | Discovery generator advances | Segment generator advances | Power callbacks | Synchronous power reads | Max reads/callback | Peak write backlog | Peak pending plans |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 42 | 1,064 | 125 | 0 | 32 | 32 | 1,001 |
| 5,000 | 209 | 5,314 | 625 | 0 | 32 | 32 | 5,001 |
| 10,000 | 417 | 10,627 | 1,249 | 0 | 32 | 32 | 10,001 |

| Cable count | Discovery ms | Segment/storage/graph ms | Power ms | Process heap delta bytes | Dynamic-property bytes | Largest property bytes |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 25 | 128 | 8 | 10,080,048 | 345,427 | 5,422 |
| 5,000 | 74 | 415 | 32 | 19,686,856 | 1,750,280 | 5,512 |
| 10,000 | 75 | 1,066 | 41 | 32,147,808 | 3,542,234 | 5,566 |

Generator advances include completion calls. Callback counts include both
planning and writing. Timings are illustrative, affected by JIT and concurrent
host activity, and are not acceptance thresholds. Heap delta is process heap
after the scenario minus before fixture creation; it includes fixture/index
allocations and garbage collection, is not peak memory, and is not isolated
Minecraft addon memory. Each pending-plan count includes the generator, which
is inspected but does not receive a powered-state write.

Dynamic-property sizes are UTF-8 byte totals for current placement and segment
properties; the largest remains below 32,767 bytes. This straight-line fixture
has sparse chunks. The separate dense `chunkSegments.test.mjs` exercises paging
of 4,096 positions in one chunk.

## Regression coverage and limits

`powerBudget.test.mjs` verifies that nothing is read synchronously, one read and at most one
write per job step, consumers first, the unchanged-network no-op, superseding targets
(large off, large on, small off), unloaded-node avoidance and later write, bridge lane
isolation and that a failing scheduler does not lock the writer. It also covers one write per
changed node, the generator skipped, only the changed bridge lane written and adapter state;
`integrationRegression.test.mjs` retains rapid-toggle and unloading checks.

Enqueuing targets remains O(network members) synchronous work without world reads. Chunk
JSON serialization, metadata graph computation, and the pure local component builder remain
synchronous CPU work and require real dense-chunk/game profiling. No claim of
in-game compatibility, rendering performance, unloaded-middle continuity, or
watchdog safety follows from these Node measurements.

## Review baseline, 2026-11-10 (before the SS-01..SS-07 fixes)

From `docs/review-2026-11-10/starstone.md` in the workspace. Scratch benchmarks drive the
production modules through the mod's own Node shim (`tests/runtimeFixture.mjs`); times are
Node/V8 on the dev machine, and Bedrock runs scripts in QuickJS, an interpreter, so expect
each figure roughly an order of magnitude slower in game (a hypothesis, not measured). Call
counts are exact and engine-independent. Re-measure after the fixes and update this table.

| Scenario (flat floor of cables, 256 per chunk, one generator) | getBlock | isChunkLoaded | dyn-prop reads | dyn-prop bytes written | whole-graph refreshes | V8 ms |
|---|---:|---:|---:|---:|---:|---:|
| Place ONE cable on a 256-cable / 1-chunk network | 5,506 | 11,015 | 263 | 26,818 | 1 | 28 |
| Place ONE cable on a 1,024-cable / 4-chunk network | 19,811 | 59,087 | 1,045 | 27,217 | 5 | 89 |
| Place ONE cable on a 4,096-cable / 16-chunk network | 77,027 | 1,264,103 | 4,165 | 27,731 | 17 | 697 |
| Toggle the generator, 1,024 cables / 4 chunks (synchronous part) | 2 | 4,103 | 3 | 25,858 | 1 | 2.9 |
| Toggle the generator, 4,096 cables / 16 chunks (synchronous part) | 2 | 65,555 | 3 | 25,858 | 1 | 11.6 |
| One logical-graph rebuild, 10,240 cables / 40 chunks (`buildSegmentGraph`) | - | - | - | - | 1 | 34 (15 of it re-validation) |

### After Batch 2 (2026-11-12; Starstone commits `12f2956`, `9366008`, `2d8c7e1`, `b93f787`, `a971ad6`, `0d6ed22`, `c330add`)

Same harness and counts (`temp/starstone-b2/bench.mjs`, scratch; 256 cables per chunk, one
generator), exact call counts, V8 ms are rough. Changes: one read per cell per walk, a placement
walks only the new nodes and merges cached networks, a placement rebuilds only its own chunk, the
logical graph is updated incrementally, power is one engine-paced job, a toggle writes a small
source overlay. The oracle (random placements checked against a full rediscovery, visuals and fresh
snapshots; 6 seeds x 250 placements on a 36x36 floor) passes.

| Scenario | getBlock | isChunkLoaded | dyn-prop reads | dyn-prop bytes written | chunk builds / commits | V8 ms |
|---|---:|---:|---:|---:|---:|---:|
| Place ONE cable, 256 cables / 1 chunk | 331 | 666 | 4 | 26,818 | 1 / 1 | 13 |
| Place ONE cable, 1,024 / 4 chunks | 331 | 675 | 4 | 27,217 | 1 / 1 | 13 |
| Place ONE cable, 4,096 / 16 chunks | 331 | 711 | 4 | 27,731 | 1 / 1 | 10 |
| Place ONE cable, 10,240 / 40 chunks | 331 | 783 | 4 | 27,731 | 1 / 1 | 12 |
| Toggle the generator, 1,024 / 4 (synchronous part) | 2 | 11 | 0 | 33 (off) / 0 (on, overlay removed) | 0 | 2 |
| Toggle the generator, 4,096 / 16 (synchronous part) | 2 | 35 | 0 | 33 / 0 | 0 | 2 |

The place-one-cable bytes are the one rebuilt chunk snapshot (an unavoidable topology write); the
walk, power plan and logical graph no longer depend on the network size. Visual settling after a
toggle is now one job step per node (1,024 cables: 1,025 steps, 0 `system.run` callbacks; 4,096:
4,097 steps). `node tests/stress.mjs` asserts one read per power job step at 1k/5k/10k and exact
write counts. How many steps the engine runs per tick is not measured: the owner checks a
1,000-cable line on PC and tablet (TEST-WORLD item 23).

## No call grows with the world (2026-11-21, Bedrock 1.26.63, offline only)

Owner rule (performance.md "When a call needs a job"): no callback, job step or microtask burst may do
work that grows with the network or chunk; per step <= ~128 block reads, <= 16 writes, ~1-3 ms pure JS.
Audit findings S1-S7 (`temp/perf-audit/report.md`) are fixed; behaviour is unchanged (all suites and the
full-rebuild oracle pass). **Not measured in game**: fixture numbers exclude native and dynamic-property
cost; a Starstone DIAG build (`.\mods diag starstone <version>`, `tools/diag/`) is the way to measure.

- S1 chunk snapshot rebuild: `buildChunkSegmentsSteps` (generator, packed numeric cell keys, boundary sort by
  a key built once, not `JSON.stringify` in the comparator), `writeChunkSteps` (text built in slices, one
  property page per step, head last), `validateChunkSegmentsSteps`, `updateSegmentGraphSteps`,
  `buildNetworksSteps` in slices of 128-256 nodes. Sync forms (`buildChunkSegments`, `writeChunk`,
  `updateSegmentGraph`) drive the same generators for pure code and tests.
- S2 generator click / redstone-input edge: the callback commits the source and calls
  `scheduleNetworkRefresh`; the node walk (`anySourceOn`, power enqueue) is a walk in `networkWalks.js`
  (one engine job, slices of 256 nodes, 48 sources). A newer refresh/logical walk of the same key supersedes
  a running one (latest state wins), as the power writer already does per node.
- S3 split / registration: `captureRemovedNetworks` keeps the live node sets (no copy); `removeAndSplitNetwork`,
  `registerAndApplyNetworkSteps`, probe cache (`warmProbes`) and power enqueue run in slices. A cooperative gate
  keeps the placement merge (one synchronous section) out of a half-registered network.
- S4 cold start: the graph is loaded (sweep, load + validate + freeze saved chunks, build) by the rebuild job
  (`loadGraphSteps`); until it is ready callers get "no logical data" and use the live walk. A source toggle
  before that queues the chunk rebuild instead.
- S5 the world-load support warm-up is gone (see SUPPORT-MOTION.md). S6 validation budget 6. S7 the placement
  index keeps decoded shards in a 64-entry LRU keyed by the stored text, sorts with a typed array.
- Test: `tests/sliceBudget.test.mjs` (suite `slice-budget`): counting mock, 2,048-cable chunk, per-call
  reads/writes, O(1) toggle callback, superseding toggles, split, cold load.

Offline bench (`temp/starstone-perf/`, slowest single call, ms, JIT / jitless), before -> after:

| Scenario | Before | After |
|---|---|---|
| place one cable, 256/chunk (40 chunks) | 10 / 25 | 0.9 / 4.0 |
| break one cable, 256/chunk, 10k cables | 24 / 39 | 6.8 / 10.3 |
| place one cable, 2,048/chunk (4k cables) | 46 / 159 | 2.1 / 6.3 |
| place one cable, 2,048/chunk (10k cables) | 66 / 161 | 1.9 / 6.2 |
| break one cable, 2,048/chunk | 58-77 / 162-173 | 2.1 / 6.7-7.0 |
| toggle generator, 10k cables | 7-10 / 15 | 1.5 / 2.3 |
| cold graph load, 10k cables (one call before) | ~90 / ~220 | worst step 1.7 / 2.1 (total 56 / 219) |
| cold graph load, 2,048/chunk | ~26 / ~83 | worst step 1.1 / 2.7 |
| validation interval | 181 reads | 72 reads |
