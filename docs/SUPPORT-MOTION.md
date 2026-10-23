# Starstone piston policy

Accepted rollout: 2026-10-09, Bedrock 1.26.52 / stable server API 2.8.0.
Implementation commit: `Implement Starstone piston movement and support survival`.

Generator, conduit and ore use native `push_pull`; enabled state and conduit axis
travel with the permutation. Cable, inner corner, bridge, lamp and both redstone
adapters use native `popped`. A stationary mounted device also drops once when
any selected original support departs, including replacement by valid support.
Piston departure destroys a whole inner corner; ordinary support edits retain
its ability to shrink to a remaining bend. Existing shape eligibility is unchanged.

`pistonController.js` adapts the shared `support_motion_service.js`. Placement
callbacks warm support history; saved placements also warm in a yielded
load job. Local piston jobs preserve that history and sample departure immediately,
then reconcile after at least ten samples and a stationary piston (forty-sample
limit). Unknown/moving support retains history; witnessed departure after a timeout
is recovered on the next stable observation. Native popping cannot duplicate script loot.

Old and destination positions feed mutation repair and diagonal visual refresh.
Final occupied cells determine placement hints, preserving adjacent identical
cube chains. Runtime networks, source metadata, masks and saved chunk graphs
rebuild from the resulting world state.

Validation: all 36 regression suites pass, including actual main-entry event
wiring, native-pop cleanup, old/new power, cross-chunk hints and snapshots,
disabled generators, conduit axes/chains, corner detachment and unknown recovery.
The underlying support recipe passed the owner's 18-case engine probe; production
rendering/loot, six-direction cube travel, rapid/concurrent pistons, doors in other
mods and performance were not confirmed in this session.

Performance correction, 2026-10-11 (1.26.52 / API 2.8.0): removed all eight
looping [2,2] support timers. Placement/edit/piston events now drive support;
the shared service discovers cold attachments around actual moving cells and
new expansion heads. Sparse native random ticks recover command changes, reloads
and timeout witnesses; no fixed recovery deadline (none at randomTickSpeed 0).
The 16,384-record cache rewarms through events/random ticks. Existing bounded
electrical validation and input timers remain independent of support polling.
Cold event discovery and the absence of support timers pass offline regressions;
specific engine event timing still requires game acceptance. Departure already
completed without saved history or observed motion cannot be reconstructed.

Owner follow-up, 2026-10-11: the piston-support correction alone removed the
reported game lag. This is a qualitative result for the deployed combined setup,
not an independent Starstone benchmark or acceptance of every motion/loot case.
Do not attribute that recovery to later electrical optimizations. Avoid permanent
fast per-block support polling; prefer native survival and bounded event-local
work with the cheapest correct fallback. Workspace .claude/skills/bedrock-scripting/references/performance.md
records the shared lesson.
