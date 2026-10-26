# Owner test results — 2026-10-26

After the 16x16 art redo (commit `7aa74ca`). Owner: "The graphics as such is OK."

| Report | Disposition |
| --- | --- |
| Bridge and Lamp float in front of the player instead of in hand | Fixed in source: same-ID native block-item replacements (`items/bridge.json`, `items/lamp.json`) with new item icons, as for the adapters on 2026-10-25 |
| A floor cable beside a horizontal conduit's end does not extend its arm or take power | Fixed: a full block's world port facing a surface arm is a contact (`hasReciprocalPort`, live graph, saved segments); before, a conduit met surfaces only through their back |
| An inner corner laid over a conduit end connects visually but carries no power | Fixed: inner-corner face arms accept a conduit end like a generator (`innerNeighborAllowed`, `neighborContactsFace`) |
| A lamp on a block with a cable on that block's side does not connect | Read as an outside edge (lamp on top, cable on the side face). Fixed: every one-face device wraps outside edges (`wrapFaces`, `outerArmMask`); adapters draw their blue arm toward the edge |
| Adapter emblem reads ">>"; wanted "->" | Redrawn: shaft in the source colour, head in the target colour |

Regression: `tests/sideContacts.test.mjs` covers each report in the live graph and saved
segments (including a bridge across a chunk border); every case failed before the fix.
A conduit side still never connects. Not yet checked in game.
