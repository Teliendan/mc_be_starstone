# Starstone design

The product design, kept to decisions that are still true. Implementation details live in
[CHUNK-SEGMENTS.md](CHUNK-SEGMENTS.md), [ADAPTER-API.md](ADAPTER-API.md),
[INNER-CORNER.md](INNER-CORNER.md), [GRAPHICS.md](GRAPHICS.md) and
[VANILLA_PARITY.md](VANILLA_PARITY.md). The original research proposal and the crystal-refining
proposal are retired: git `1492493` holds `docs/PROPOSAL.md` and `docs/CRYSTAL-REFINING-PROPOSAL.md`
(the proposal's API research list and its MVP order, all built since, are only there).

## Goal

A separate electrical network that replaces the wiring role of redstone, with a cyberpunk
neon look:

- Wall-, floor- and ceiling-mountable glowing cables with automatic connections and junction
  geometry.
- **Electricity is binary.** A network is powered when any of its sources is on; there is no
  0-15 strength and no attenuation. This is deliberately simpler than redstone.
- Explicit two-way adapters to vanilla redstone: redstone above 0 turns the network on;
  the network drives redstone 0 when off and 15 when on. Vanilla redstone itself is not
  modified or reimplemented.

The system's name is Starstone (ore, dust, crystal).

## Architecture decisions

1. **Cables are blocks, never entities.** A cable is a thin custom geometry on a support
   face; connection shape comes from neighbouring cables (endpoint, straight, corner, T,
   cross, vertical, outside and inside edges).
2. **World blocks are authoritative.** Runtime graph data is a reconstructable cache, and
   saved metadata (chunk segments, placement hints) may lag until a changed chunk is observed.
3. **Topology and power state are separate.** Topology changes only when blocks change;
   a power change never rebuilds topology.
4. **Unloaded chunks are an unresolved continuation, not a broken circuit.** Each chunk keeps a
   segment with boundary ports; reciprocal ports join logical networks through saved metadata,
   and a returning chunk receives the network's current state: power writes skipped because a
   chunk was unloaded are remembered per chunk (latest state wins) and re-applied about 0.5 s
   after it returns (`catchUpPending`, every 10 ticks, only that chunk's nodes; 2026-11-17, owner
   M50). The 100-tick chunk poll stays as the fallback. No ticking areas, no forced
   chunk loading just for electricity.
5. **Event-driven, with a bounded safety net.** Placement and removal update topology locally
   and merge or split networks. Commands, explosions, structures and pistons, which have no
   universal callback, are caught by bounded periodic validation (see README and
   SUPPORT-MOTION.md). Nothing scans every cable every tick.
   A placement walks only the new nodes and merges the cached network records it touches
   (`extendFromPlacement`, SS-07, 2026-11-12); it falls back to the full walk for an owned
   seed, an incomplete owner or a vanished owner. The old full re-walk on every placement
   also repaired stale runtime records (a block removed by a command without an event);
   that repair now comes only from periodic validation (6 positions per 100 ticks) and
   `rebuild_nearby`. Removal still re-walks (`removeAndSplitNetwork`).
6. **Do not fight the vanilla redstone engine**: adapters only.

## Blocks and basic operation

Electrical blocks: cable, isolated bridge, conduit, generator, lamp, redstone input and
output, plus the Inner Corner item. Survival content: Ore, Dust, Compressed Dust, Crystal
([SURVIVAL.md](SURVIVAL.md)). Give a cable with `/give @s starstone:cable_item`; other
blocks and items use their normal IDs (`starstone:generator`, `starstone:dust`).

- **Lighting**: ore always emits level 3. Active cables, conduits, generators and adapters
  emit 1, inactive ones 0. A bridge emits 1 when either lane is powered while its lane
  textures stay independent. Powered lamps emit 15. Art readability accepted in game
  (2026-09-29).
- **Mounting**: cables, bridges, lamps and adapters mount on all six support faces. Cables
  expose joined tangent arms; a bridge keeps two independent lanes and has tangent contacts
  only. Every one-face device also wraps around the outside edges of its support cube, so a
  lamp on top of a block meets a cable on its side. An Inner Corner (crafted from two
  Cables) fills an empty inside-corner cell with two perpendicular support faces and joins
  both runs.
- **Conduit**: axis X/Y/Z comes from the placement face; it conducts only between its
  opposite ends. A device mounted on an end, or any arm beside an end pointing into it,
  connects there; its sides never connect. Break and replace it to change the axis. A matching
  conduit or full generator supplies a back contact.
- **Generator**: starts enabled, interaction toggles it. Any active source powers its whole
  connected component.
- **Support and motion**: removing a support drops the surface device once and repairs the
  network. Generator, conduit and ore move with pistons; mounted devices pop when pushed or
  when a selected original support moves, even if a valid block replaces it
  ([SUPPORT-MOTION.md](SUPPORT-MOTION.md); accepted in game 2026-09-29). Explosions are
  reconciled in one deduplicated, yielded batch; command edits are caught by the bounded
  validation. Partial-block support classification still needs in-game validation.
- **Diagnostics**: `/scriptevent starstone:diagnose` (counts, bounded work, retries, dynamic
  property bytes, the looked-at block), `diagnose chunk <x> <z> <y>` (chunk availability
  without reading a block), `rebuild_nearby`, `debug on|off` (persisted). Normal play sends
  no unsolicited chat; player-facing text uses resource-pack localization; startup logs one
  informational line.

## Crystal refining (owner decision 2026-10-21)

The route is four Dust plus one copper ingot into one Compressed Dust at a crafting table,
then Compressed Dust plus ordinary fuel into one Crystal in a vanilla furnace. The precursor
is a separate item because the modern furnace recipe accepts one input item ID, not a
four-item input count. Furnace hoppers keep vanilla input, fuel and output behaviour, and a
vanilla Crafter can automate the precursor where the world has one. No amethyst or slime is
needed. Exact recipes: [SURVIVAL.md](SURVIVAL.md).

### Later option: Crystal Kiln

Wanted: four Dust plus fuel into one Crystal in one machine, input above, fuel from the side,
output below, saved inventory and progress, hopper transfer. A plausible recipe is one
furnace, one piston, two copper ingots, four iron ingots and one Dust, so players can make
it before their first Crystal. Blocker: the custom `minecraft:block_entity` container
component arrived with block format 1.26.20 (Upcoming Creator Features in the 1.26.30
update; the pack was then at 1.21.120) and its documentation does not establish furnace UI
or hopper sided-slot behaviour. Build it only after confirming the installed version,
experiment policy, persistent slots and real hopper transfers in game. This stays a later,
version-gated option; no work is scheduled.

## Ore parity basis

Generation mirrors the bundled vanilla Redstone Ore rules (one feature with `count: 8`, four
uniform attempts from Y -64 to 15, eight triangular deep attempts from Y -96 to -32, no
air-exposure discard). This is parity with versioned reference configuration, not a measured
guarantee of identical counts; existing chunks are not regenerated. Settings and tuning:
[SURVIVAL.md](SURVIVAL.md).
