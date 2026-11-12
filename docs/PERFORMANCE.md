# Performance

Offline evidence only: nothing here is a Minecraft tick, frame or watchdog measurement, and no
safe in-game network limit is claimed. Real 1k/5k/10k tick budgets are an open in-game check
([TEST-WORLD.md](TEST-WORLD.md) item 23). Retired: `docs/SCRIPT_PERFORMANCE.md` and
`docs/STRESS.md` in git `1492493`.

Summary of the budgets in force: power planning reads at most 32 nodes per callback, power
writes at most 16 per callback (a deferred large request keeps at most 32 queued writes);
recovery and cosmetic refresh handle at most 32 registered positions per deferred callback
every 100 ticks; validation visits at most 16 indexed cursor entries every 100 ticks; the
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

The power planner/write queue retains its32-node/16-write budgets and newer-state
coalescing. No unbounded pulse queue or replay/stretching service is introduced.
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

Power propagation now defers plans for networks above `PLAN_BATCH=32`. One
planning callback reads at most 32 nodes, and concrete writes retain
`WRITE_BATCH=16`. Backpressure limits a large request's concrete write backlog to
32 entries. Pending plans retain only references, desired booleans, dimension
handles, and progress records. New targets supersede old unread plans and queued
writes per node/state; bridge lane state keys remain independent. Small networks
still return exact immediate planned-write counts, preserving the existing API.

Large `applyPower` calls return live `{written,unresolved,pending}` counters.
`written` counts actual scheduled state changes, not candidate members. `pending`
becomes zero after planning or supersession; writes may still be draining.
`powerStats()` preserves `queued`, `peakQueued`, `appliedWrites`, `writeBudget`
and adds `planning`, `peakPlanning`, `planningBudget`.

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

`powerBudget.test.mjs` verifies deferred large-network reads, per-callback read
and write budgets, backpressure, unchanged-network no-op behavior, superseding
toggles and small splits, unloaded-block avoidance, and bridge lane isolation.
The existing `powerPropagation.test.mjs` still verifies the pure planner and
exact small-network return counts; `integrationRegression.test.mjs` retains
rapid-toggle and unloading checks.

Enqueuing pending references remains O(network members) synchronous work without
world reads. Multiple separate small calls can collectively schedule more than
32 writes; the 32-entry backlog measurement applies to deferred large requests,
while write callbacks still cap actual writes at 16. Chunk JSON serialization,
metadata graph computation, and the pure local component builder remain
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
