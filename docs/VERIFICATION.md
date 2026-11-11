# Verification: suite map

Feature suites are registered in `tests/suites.json` (one per test file, plus the groups
`ore-parity`, `input-investigation` and `native-input`); list them with `.\mods suites starstone`.
Run one while iterating (`.\mods verify starstone --suite <name>`) and the full run before
hand-over. `.\mods brief starstone` is the docs index.

The shared verifier is `.claude/skills/bedrock-lookup/scripts/verify_addon.py`; it stays
generic (no Starstone IDs or rules in it) and runs the project runner `tests/run.mjs` through
`--regression-tests`. Its negative fixtures are permanent in
`tools/verification/test_verify_addon.py`. Node is required because scripts are parsed as
modules. Manual extras: `node mods/starstone/tests/mutation-check.mjs` (a wrong
mounting-plane edge in an isolated copy must be rejected by the graph suite) and
`node mods/starstone/tests/stress.mjs` (see [PERFORMANCE.md](PERFORMANCE.md)).

## What guards what

Origin: the 2026-09-27 implementation audit (git `1492493`, `docs/STARSTONE-AUDIT-2026-09-27.md`),
extended by later features.

| Error class | Suite or check |
|---|---|
| Malformed JSON/JS, invented components, bad loot/light/item shapes, display_name, block_placer format floor, loot `count` on entries, nested `match_tool`, `query.is_valid()` bone visibility, geometry/bone/UV-material references | shared verifier (generic checks and fixtures) |
| Block component registered but not wired by main; startup, placement, interaction, break, script-command dispatch | `event-wiring` |
| Cable masks and arms (16 masks, six mounting rotations, hub UV), powered/off art, lamp transparency, conduit face bindings, pack icons | `cable-visual`, `cable-direction-regression`, `visual-geometry`, `adapter-visual`, `pack-contract` |
| Contacts: six faces, devices, generators, side contacts, outside and inside corners | `integration-regression`, `side-contacts`, `outer-corner`, `inner-corner`, `support-connections`, `port-directions`, `graph-neighbor`, `surface-frame`, `cable-topology`, `descriptor` |
| Bridge lanes (discovery, isolation, short circuit) | `network-merge`, `network-split`, `descriptor`, `power-budget` |
| Support removal, drops, splits, placement guard | `support-policy`, `placement-guard`, `network-split`, `integration-regression` |
| Rapid toggles, stale writes, unload between plan and write, 32-node planning, 16-write callbacks, backpressure | `power-propagation`, `power-budget`, `generator-toggle`, `integration-regression`, `dirty-queue` |
| Placement hints, restart, corruption, oversized properties, failed writes | `persistence`, `repair` |
| Chunk segments: reciprocity, paging, restart, corrupt pages, rollback; A-B-C metadata paths, stale metadata, revision rejection | `chunk-segments`, `segment-graph`, `chunk-controller`, `stale-metadata` |
| Explosion batching, command replacement, bounded validation, pistons | `mutation`, `piston` |
| Rebuild/diagnostics: restored networks, concurrent rejection, 2,601-position maximum scan, player filter | `diagnostics`, `event-wiring`, `repair` |
| Redstone adapters: six supports, 0/1/15 transitions, unloaded retention, source-state protection, native callbacks | `redstone-adapters`, `native-input` |
| Ore loot (exclusive Silk/Fortune branches, no-tool context, decay), harvest gate tiers, tool wear, ore XP | `ore-loot`, `harvest-gate`, `harvest-wear`, `ore-experience`, `ore-parity` |
| Recipes, unlocks, precursor, no amethyst gate | shared verifier (unlocks) and `survival` |
| Broken tests or a silently failed child process | the verifier runs the runner and fails on nonzero or timeout |

## Limits

Static registration analysis cannot prove computed IDs, aliases or startup execution; the
verifier warns when dynamic registration is present, and the runtime suites check the real
wiring. A pass does not prove in-game behaviour, rendering, partial-block support, bridge
back-contact lane policy (a design choice), unloaded-chunk continuity or safe network sizes:
those remain in [TEST-WORLD.md](TEST-WORLD.md).
