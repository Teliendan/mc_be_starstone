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
| Contacts: six faces, devices, generators, side contacts, outside and inside corners | `integration-regression`, `side-contacts`, `outer-corner`, `inner-corner`, `support-connections`, `geometry-tables` |
| Bridge lanes (discovery, isolation, short circuit) | `network-runtime`, `network-split`, `geometry-tables`, `power-budget` |
| Support removal, drops, splits, placement guard | `support-policy`, `placement-guard`, `network-split`, `integration-regression` |
| Rapid toggles, stale writes, unload between plan and write, 32-node planning, 16-write callbacks, backpressure | `power-budget`, `generator-toggle`, `integration-regression`, `dirty-queue` |
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

## Owner game results, Bedrock 1.26.63, 2026-11-17 (development deploy)

Verified in game: SS-04 a conduit and a generator joined by cables each register once and the lamp lights; restart and
walk-around keep power; `rebuild_nearby` near Y -60 and near the top runs without error; the debug toggle shows its
text. Batch 2: cables added one by one, joining a powered and an unpowered line, a loop and a bridge (46); a cable next
to a 200+ cable line lights at once with no flicker (47); TNT, pistons and `/setblock` of a middle cable settle in
about 5 s (48).
Failed and fixed, not re-tested yet: a cable at the loaded-area edge lost its arm and cut the circuit (49/50,
`61198e7`, inner corners `57a42b3`); a stale source state re-applied after a toggle (`a2c25b1`); cables in a returning
chunk stayed on for seconds (catch-up check `57a42b3`); the ore was loose in the Nature tab (`d59a8cd`).
Not tested: the 1,000-cable PC/tablet timing (49), a redstone clock on an input adapter (50), an old world (51).
