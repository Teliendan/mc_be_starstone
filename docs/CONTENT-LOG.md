# Content log fixes

2026-10-04, target game 1.26.52. Owner's content log reported rejected ore feature
rules because their identifiers did not match their filenames. Renamed the files
to `feature_rules/ore_deep.json`, `feature_rules/ore_underground.json`, and
`features/ore_feature.json`, preserving identifiers and generation settings.
The filename requirement is already recorded as verified in game 1.26.52 in the
shared bedrock-blocks references. The corrected Starstone generation needs
in-game confirmation in a new world.

Changed the resource pack's `blocks.json` format from `1.21.120` to `1.21.40`,
matching the maximum supported version reported in the owner's log and the
shared block notes. This version belongs to RP block registration, independently
of BP block definition versions.

Updated the existing survival regression checks for the filenames, rule identifier
matching, and RP blocks format. Shared verifier: 0 errors, 35/35 regression suites
passed. One separate warning remains for missing `minecraft:light_dampening` on
the conduit block. Deployed both packs and confirmed `mods status` reports
`in sync`; in-game confirmation pending.

Implementation commit: `Fix ore feature filenames and resource block format`.
