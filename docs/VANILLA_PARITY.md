# Vanilla parity: final design, decisions, limits, checks

Target Bedrock 1.26.52 / Script API 2.8.0. History (inspection narrative, input option
study, probe notes): git `08a2e65` and earlier. Counterparts: redstone ore, lamp, repeater/dust.

## Final design

- Separate **binary** electrical network, six-face mounting, bridge lanes, axial conduits,
  growing inner corners, manual generator; adapters convert native redstone to/from 0/15.
  A redstone-block material profile does not make generator/conduit a native redstone source.
- **Input** (`redstone_input.json`, format 1.26.0, `redstone_consumer {min_power:0,
  propagates_power:false}`, explicit `use_liquid_clipping:true`): the `starstone:surface`
  `onRedstoneUpdate` hook commits `powerLevel > 0` synchronously. Callbacks are the only
  power authority; deduplication is against committed state, not `previousPowerLevel`
  (previous tick). Durable `sourceChanged` owner, multi-source OR and loaded-network
  fallback are kept. No `firstUpdate`, neighbor-change events or beta APIs.
- **Initial read**: a newly tracked input (load / placement / network discovery, not a
  first callback) gets one deferred `block.getRedstonePower()` read.
- **100-tick pass** (32 inputs per deferred run): visuals only (red contact mask, blue
  connections). It never reads power. Timer stops when no inputs are tracked.
- **Output**: `redstone_producer` 0/15, all six connected faces, strong face down
  (`transform_relative`).
- **Ore**: iron/diamond/netherite pickaxes, custom 2-4 Dust (capped Fortune), Silk Touch
  self-drop, light 3, `instrument_sound.up = note.bd`, furnace and blast furnace -> 1 Dust
  (no XP field exists in Bedrock recipes).
- **Ore XP**: after-break event (filtered to `starstone:ore`) for Survival/Adventure,
  not Silk Touch, `doTileDrops` not false: random 1-5, spawned with native `Dimension.spawnXp(block.center(), n)`, one call per
  orb with the split `[1] [1,1] [3] [3,1] [3,1,1]`. Native pickup owns Mending and the award.
  Requires API 2.11.0 / engine 1.26.60 (stable since release 26.60). Replaced the
  `.mcstructure` orb workaround on 2026-10-27 (commit "Replace ore XP structures with Dimension.spawnXp"). Wrong-tool Survival/Adventure breaks are canceled by `harvestGate`, so the
  handler does not re-check the tool.

## Owner decisions

- 2026-10-21: native receiver input replaces the four-tick six-neighbor maximum; no experiments.
- 2026-10-21: ore smelting, bass drum, valued native mining XP implemented.
- 2026-10-21: keep four-Dust + copper precursor, furnace Crystal route, constant light 3,
  existing worldgen; casing conduction of conduit accepted.
- 2026-10-23: probe pack removed; XP value is checked with vanilla `/summon`.

## Known limits

- The `doTileDrops:false` -> no XP gate is a guess (Java does it), not verified Bedrock parity.
- Output writes are budgeted and coalesce newer levels: no pulse-fidelity promise through
  large networks.
- `replace_block_item:true` needs identical item/block IDs, so it cannot be added to the
  `_item` placers; no saved-item migration.
- Lamp is a thin panel, not a full-cube lamp (no 6-tick off delay, no opacity); lamp/devices
  do not copy redstone ore's contact glow.
- Silk-Touched ore smelting gives no furnace XP.

## In-game checks still worth doing

1. Powered input stays ON for more than 10 s when powered via its support block, via a
   repeater into the support, and via a lever on the support (confirms callbacks hold; the
   periodic pass no longer reads power). Also: input beside an already-powered source after
   placement, and after leaving/re-entering the world.
2. Observer pulse (2 ticks) through an input lights the lamp.
3. One ore break gives 1-5 total XP (`spawnXp` orbs); Mending repairs; Silk Touch gives none.
4. Two quick ore breaks both drop orbs.
5. `doTileDrops` false behaviour vs. vanilla redstone ore; furnace/blast furnace smelting;
   note block under ore plays bass drum.
