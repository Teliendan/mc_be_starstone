# Script performance

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
power, persistence and stale-metadata suites. Full verification runs42 feature
runners. The optional script-only monitor observes production states and XP;
it has no block definitions and runs its bounded timer only during a command.

Index caches (2026-10-27, offline only): `chunks()` and placement shard lookups no
longer list all world property ids or re-read saved chunks. Each index scans once,
lazily, then keeps a RAM copy current from its own writes (the only writers of its
prefix). Chunk snapshots are cached deep-frozen after the head commit; placement
caches only shard keys and still reads shard contents. Tests: `chunkSegments`,
`persistence`. `buildSegmentGraph` still re-validates every snapshot per refresh.
Memory cost (Node/V8 heap, `temp`-measured 2026-10-27): about 0.6 KB per cable, 0.7 MB at
1k and 5.8 MB at 10k cables (stored text 0.3 / 3.3 MB). The old refresh built the same
objects transiently, so peak use is unchanged; QuickJS in game may be somewhat larger.
Placement `remove()` answers from the key cache when the shard does not exist.
