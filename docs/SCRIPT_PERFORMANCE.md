# Script performance

2026-10-11, Bedrock 1.26.52 / server 2.8.0. Offline evidence; engine performance
and new scheduling still require in-game acceptance.

The visual queue schedules one deferred flush on dirty work, coalesces events,
and schedules another pass if work arrives during flushing. No idle per-tick
flush timer remains. Native edit/piston hooks still mark affected positions.

Inputs retain four-tick six-neighbor binary sensing and durable source updates.
Native onRedstoneUpdate observes receiver power, which is not established as
equivalent to the previous max of six neighboring getRedstonePower values.
Do not silently alter six-face semantics, feedback or pulse response. No new
redstone_consumer or format change was introduced. Timer starts on registration
of the first input and stops after the last stale input is removed; unloaded
entries remain for recovery.

Static contacts no longer rebuild on every poll. Edit queues and binary power
edges refresh them, with a once-per-25-loaded-polls cosmetic fallback for command
edits and neighbors changing under constant aggregate power. Stable-off polling
averages 7.32 direct block reads instead of 15 (including the fallback, excluding
edit/power-edge work). This is a code bound, not a profiler/FPS result.

Tests: redstoneAdapters.test.mjs covers six mounted faces, source transitions,
unknown support, timer lifecycle, read counts and slow cosmetic recovery;
dirtyQueue.test.mjs covers coalescing, idle behavior and reentrant dirty work.
Full event/persistence/network suites remain required. Workspace progress and
native parity acceptance cases: docs/script-performance-progress.md at root.

Implementation commit: `Reduce support polling and idle electrical script work`.
