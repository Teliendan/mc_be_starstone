# Starstone: development

| | |
|---|---|
| Packs | `starstone_bp/` (JSON plus Script API in `scripts/`) + `starstone_rp/`; namespace `starstone:` |
| Script API | `@minecraft/server` 2.11.0, min engine 1.26.60 (`starstone_bp/manifest.json`) |
| Redstone input | native `onRedstoneUpdate` callbacks (owner-approved 2026-10-21), not polling |
| Build | `.\mods package starstone` from the workspace; deploy with `.\mods deploy starstone` |

## Layout

- `tests/` - Node suites (`node tests/run.mjs`) with a `@minecraft/server` shim in `tests/shims/`;
  `wiki/` - player-facing records.
- `tools/make_block_art.py`, `tools/make_item_art.py`, `tools/make_block_models.py` generate every
  16x16 texture, icon and model UV from the palette in `tools/starstone_art.py`;
  `tools/make_pack_icon.py` renders the pack icon from the real blocks;
  `tools/build_inner_corner.py --model-only` regenerates the Inner Corner model.

| Doc | Holds |
|---|---|
| [DESIGN.md](DESIGN.md) | product design, architecture decisions, blocks and operation, crystal route, later kiln option |
| [SURVIVAL.md](SURVIVAL.md) | ore, drops, tuning, generation, every recipe |
| [VANILLA_PARITY.md](VANILLA_PARITY.md) | final design, owner decisions, limits, checks, 26.60 review; per-block materials, tags, water and harvest decisions |
| [GRAPHICS.md](GRAPHICS.md) | art contract, generators, per-asset verdicts |
| [ADAPTER-API.md](ADAPTER-API.md), [CHUNK-SEGMENTS.md](CHUNK-SEGMENTS.md), [INNER-CORNER.md](INNER-CORNER.md), [SUPPORT-MOTION.md](SUPPORT-MOTION.md) | subsystem designs (CHUNK-SEGMENTS also holds recovery and the observer) |
| [PERFORMANCE.md](PERFORMANCE.md) | script budgets, offline stress numbers, review baseline |
| [VERIFICATION.md](VERIFICATION.md) | suite map |
| [TEST-WORLD.md](TEST-WORLD.md) | in-game checklist and the owner's results |
| [LOCALIZATION.md](LOCALIZATION.md) | text workflow; nine locales in a mod-scoped contextual catalog |
| [TODO.md](TODO.md) | open work |

Retired docs (merged or deleted 2026-11-11; git `1492493` holds every one): `PROPOSAL`,
`CRYSTAL-REFINING-PROPOSAL`, `RECIPES`, `STRESS`, `SCRIPT_PERFORMANCE`, `BLOCK_MATERIALS`,
`TAGS`, `WATER`, `HARVEST` (merged into the docs above, each names its source), and the
history-only `CONTENT-LOG`, `VISUAL_PARAMETERS`, `TEST_FEEDBACK_2026-10-25`,
`TEST_FEEDBACK_2026-10-26`, `STARSTONE-AUDIT-2026-09-27` (a 2026-09-27 audit; its error
classes are mapped in VERIFICATION.md) and `GRAPHICS_TASKS`.

## Commands

From the workspace root: `.\mods verify starstone` (shared verifier plus every regression suite;
`--suite <name>`, see `.\mods suites starstone`), `.\mods deploy starstone`,
`.\mods brief starstone`. Extra: `python -B tools/verification/test_verify_addon.py`,
`node mods/starstone/tests/mutation-check.mjs`, `node mods/starstone/tests/stress.mjs`.
In game: `/scriptevent starstone:diagnose`, `diagnose chunk <x> <z> <y>`, `rebuild_nearby`,
`debug on|off` (details in DESIGN.md).

## Open in-game checks

Procedure: [TEST-WORLD.md](TEST-WORLD.md), which also records the owner's results. Accepted
in game: 2026-09-29 six-face placement and art readability, piston policy and explosions, strong
redstone output and support input, mining and new-chunk ore distribution; 2026-10-25 input
scenarios S1-S3 and S5; 2026-10-26 the 16x16 art and side-contact fixes; 2026-11-22 Fortune and
Silk Touch drops, and no furnace XP from smelting the ore (Bedrock 1.26.63). Offline A-B-C
fixtures pass; no Minecraft test of the unloaded-middle case has run.

| Check | Status |
|---|---|
| Actual unloaded-middle or alternate save/unload/load sequence (TEST-WORLD gate 7.6) | Not run |
| 1k/5k/10k real ticks, queue observations and watchdog logs; since 2026-11-12 also the engine-paced power writer on a 1,000-cable line, PC and tablet (TEST-WORLD item 23) | Not run |
| Partial-block support classification | Needs in-game validation |
| Piston-pushed conduit/generator into a mob; dust bends into Redstone Output; load on 26.60 (VANILLA_PARITY "Bedrock 26.60 impact") | Optional owner checks |
