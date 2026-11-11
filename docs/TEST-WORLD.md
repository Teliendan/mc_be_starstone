# Repeatable in-game acceptance checklist

Status: **partly run by the owner** (details in "Owner results" at the end). Accepted in
game: six-face placement, art readability, piston policy, explosions, strong redstone output,
support input, mining and new-chunk ore distribution (2026-09-29); sustained, placed-beside
and observer-pulse input, quick mining with Mending (2026-10-25); the 16x16 art and the
side-contact fixes (2026-10-26). Still open: the unloaded-middle sequence (gate 7.6), Silk
Touch and Fortune drops, and 1k/5k/10k real-tick budgets. Node results do not establish game
compatibility.

Use a disposable creative world with both development packs. Record game version,
experiments, simulation distance, pack UUIDs and Content Log before testing.
Do not alter existing survival worlds for these checks. Give cable using
`/give @s starstone:cable_item`; other electrical blocks use their block IDs.
Use `/scriptevent starstone:diagnose` at each checkpoint. `rebuild_nearby` repairs
a 17x9x17 seed volume; connected loaded components can extend beyond it.

## Placement and shapes

1. Build stone supports exposing floor, ceiling, north, south, east, and west
   faces. Place cable, bridge, lamp, redstone_input and redstone_output against
   every face. Each must sit on its support, show the correct orientation and
   retain transparency. Repeat on every face of a Generator: each device must
   mount. Placement on a cable, bridge, lamp or adapter must fail. Break each
   support; the device drops once.
2. On a stone floor, construct isolated cable, endpoint, straight, elbow, T and
   four-arm intersection using neighboring cable cells. Repeat against a wall
   and ceiling. Place one neighbor at a time in each direction. Only that arm
   must appear, touching the central hub and extending to the cell edge without
   gaps or repeated mini-cables. If a direction reverses, look at the cable and
   run `/scriptevent starstone:diagnose cable`. Record its coordinate, reported
   mount face and mask, plus the neighbor coordinate and a screenshot. The
   ordinary four-arm crossing
   joins every arm.
   Then put one cable on the top and another on a side of the same solid cube.
   Their arms should meet around the outside edge and conduct in either
   direction. Repeat with the cube at a chunk border and after breaking one side.
   Repeat with a lamp, a bridge and an output adapter on top instead of the top
   cable: each must light or carry power from the side cable.
   Lay a horizontal conduit fed from a generator at one end. At its other end,
   run a floor cable away from it: the cable's arm must reach into the conduit
   end and carry power. Replace that cable with an Inner Corner laid over the
   conduit end (floor + conduit end face) and a floor cable beyond it: power
   must pass. A floor cable beside the conduit's side must not connect.
   For an inside edge, craft an Inner Corner from two Cables and place it into
   the empty cell between a floor and wall (or two walls). Its traces must
   join the adjacent cable runs. Also make a one-block hole with a solid floor
   and four solid walls, then place the corner in that cell. Run cable to its
   floor and multiple wall faces; they should form one powered network. Remove
   any selected support: the corner should drop once and disconnect the line.
   Check placement at a chunk boundary too.
3. Cross two lines with a bridge in the shared cell. Put a generator at each
   line's start and lamp at each end. Toggle separately: only the corresponding
   lane and lamp change. The compact bridge body must touch its support and
   resemble the bridge texture rather than floating wires. Both lanes must be
   dark when off, and only the powered lane should glow. Break the bridge and
   verify both paths disconnect.
4. Put a conduit between a source and lamp in X, Y, then Z alignment, placing
   against the corresponding axis face. Only its opposite end faces conduct;
   a surface device touching a perpendicular conduit side must not connect.
   Toggle the source: unpowered Conduit ends and Generator faces must be dark
   blue, with no bright powered graphic retained.

## Loaded topology and mutation

5. Make generator—cable—cable—lamp at `(0,64,0)` through `(3,64,0)`, on stone
   at Y63. Repeat with lamp last, generator last and cable last. Toggle rapidly;
   all nodes must settle to the final source state.
   Extend the line across at least three loaded chunks and break a middle cable:
   the distant lamp must switch off. Compare the first and 257th cable when
   powering a long line; the lamp should respond before the full visual wave
   finishes.
6. Add a second generator at the lamp end. Either source on keeps the lamp on;
   both off turns it off. Disconnect each source independently.
7. Join a powered and an unpowered line with one cable. Both become powered.
   Remove that cable; each side recomputes its own source state.
8. Build a rectangular cable loop with a generator and a lamp on opposite sides.
   Remove one edge (lamp stays on), then the opposite edge (lamp turns off).
9. Explode TNT beside several middle cables and a surface support. Surviving
   components must split correctly, masks refresh and unsupported devices drop.
10. Try a normal and sticky piston against every electrical block. The declared
    policy is `push_pull` for generator/conduit/ore and `popped` for mounted
    devices. Move a vanilla supporting block away from a surface device: settled
    piston handling must drop it once even when a valid support replaces it.
    Check the original/destination electrical indexes and both networks;
    bounded periodic validation must also recover current unsupported devices
    and repair their networks. Periodic delay scales with indexed-position count
    and the diagnostic validation budget; piston events have their own local queue.
11. Replace an indexed middle cable with air using `/setblock`. After periodic
    validation reaches it, its placement hint and runtime ownership disappear,
    and disconnected lamps turn off. Place unknown circuits with commands and
    use `rebuild_nearby` to register them; no broad recurring scan is promised.

## Persistence and actual chunk loading (gate 7.6)

12. Save/reopen beside the first circuit. Initial-spawn recovery reconstructs
    the spawn section once; a respawn does not start another scan. Repeat at a
    substantially different Y level and in another dimension.
13. Build a line from X0 through X47 at Y64/Z0: generator in chunk A (0,0),
    cables through B (1,0), lamp in C (2,0). Visit the entire line so all positions
    and segments are indexed, then diagnose and confirm power.
14. Arrange players/simulation distance so B actually unloads; confirm using
    `/scriptevent starstone:diagnose chunk 1 0 64` from the same dimension.
    A visual impression or distance alone is not evidence of unloading.
15. Toggle the source in A while B is confirmed unloaded. Visit/load C and
    confirm its lamp receives the latest state. Reload B and confirm no duplicate
    segments or phantom sources. Repeat with the source off, save/reopen, and
    with a removed boundary cable before unloading.
16. If simulation rules cannot keep A/C observable while B unloads, record that
    limitation. Run the equivalent sequence: index all, leave B/C unloaded,
    toggle A, save/reopen, visit C, then B. Record exact observations and diagnose
    output. Do not call an adjacent-loaded-chunk test unloaded continuity.

## Redstone adapters

17. Put each input on a solid support and cable it tangentially to a lamp. Supply
    redstone to the support: 0→1 turns Starstone on, 15→0 turns it off, and 1→15
    produces no extra binary transition. Repeat all six faces, then power
    adjacent redstone dust/device while the support remains unpowered. A nearby
    generator or cable must connect to the adapter's Starstone network. Only
    touching blue Starstone and red redstone arms should be visible; the center
    box must remain grounded without stray side fragments.
18. Power an output from a Starstone generator. Its supporting block must be
    strongly powered at 15 when on, and 0 when off. Check floor, wall, ceiling
    and all surrounding faces: the output now directly serves touching redstone
    neighbors on all faces.
19. Remove/unload an input or its support; no bogus source transitions or errors
    should appear. Input is native-callback driven; the diagnose adapter counts must not
    grow with the cable count.

## Survival, resources, and release

20. Give Dust, Crystal and Ore; check names/icons and storage. Switch to Survival
    before testing drops (Creative mining intentionally drops nothing). Mine
    hand-placed ore with hand, wooden/stone/gold picks (no drops), then iron,
    diamond and netherite picks. Verify 2–4 Dust without Fortune, increased
    Fortune yield, and exactly one Ore with Silk Touch. See SURVIVAL.md for the
    implemented Fortune formula and generation tuning. Break time follows the
    native redstone-ore profile (VANILLA_PARITY.md "Block materials"); compare it with redstone ore.
21. Search only newly generated Overworld chunks in both the general Y -64..15
    and deep Y -96..-32 ranges. Record sampled chunk count, ore count/heights,
    exposed ore and replacement blocks; compare a redstone sample from the same
    chunks. Existing chunks must not be retroactively populated.
22. Craft every recipe in SURVIVAL.md and confirm counts, icons and dependence
    on mined material. Feed Compressed Dust through a hopper into a vanilla
    furnace, fuel from the side and extract Crystal from below.
23. Test 1,000, 5,000 and 10,000 cable nodes separately. Record real rebuild ticks,
    power-update ticks, queue peaks, dynamic-property bytes and watchdog/Content
    Log messages. Offline PERFORMANCE.md measurements are algorithm evidence only.
24. With debug off, normal placement, walking and source toggles produce no chat
    spam or Content Log warnings/errors. Recheck floor/wall/ceiling textures in
    bright and dark conditions. Both packs should show the new crystal-circuit
    icon. All messages and item names must resolve.

## Owner results

Bedrock 1.26.52 unless noted. Everything not listed here is unrun.

| Date | Result |
|---|---|
| 2026-09-29 | Accepted: six-face placement and final art readability, piston policy and explosions, strong redstone output and support input, mining and new-chunk ore distribution. Pack load accepted; Content Log/version details not needed. |
| 2026-10-25 | S1 sustained/reloaded input, S2 placement beside a powered source, S3 observer pulse, S5 quick mining breaks with Mending: owner PASS. S4 summoned XP orb: the native orb awards exactly 1 XP (no ore reward refactor in that pass). Input/output floating outside the hand: fixed with same-ID native block-item replacements using the existing inventory sprites; owner accepted ("Rest is OK"). Full graphics revision deferred, done on 2026-10-26. |
| 2026-10-26 | After the 16x16 art redo (commit `7aa74ca`) the owner said "The graphics as such is OK". Fixed and re-tested the same day (commit `f7e6283`; "Fixed, I like it."): Bridge and Lamp float in front of the player (same-ID block-item replacements with new icons, as for the adapters); a floor cable beside a horizontal conduit's end now extends its arm and takes power (a full block's world port facing a surface arm is a contact: `hasReciprocalPort`, live graph and saved segments); an inner corner laid over a conduit end now carries power (`innerNeighborAllowed`, `neighborContactsFace`); a lamp on a block with a cable on its side connects (every one-face device wraps outside edges: `wrapFaces`, `outerArmMask`; adapters draw their blue arm toward the edge); the adapter emblem reads "->" not ">>". A conduit side still never connects. `tests/sideContacts.test.mjs` covers each report (each failed before the fix). |

Full text of the retired feedback notes: git `1492493` (`docs/TEST_FEEDBACK_2026-10-25.md`,
`docs/TEST_FEEDBACK_2026-10-26.md`).
