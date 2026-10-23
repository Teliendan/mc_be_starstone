# Native input decision and evidence

2026-10-21; Bedrock1.26.52 / stable server2.8.0.
Owner: “Do the native, OK. Don't do experimental things.”

The selected production behavior is native receiver power, replacing the old
four-tick maximum-neighbor rule. Base consumer format1.26.0 is stable without
experiments; `min_power:0` admits off updates and `propagates_power:false` does
not opt into native passthrough. The existing surface hook calls the adapter
controller. No firstUpdate, experimental neighbor-change callback, beta dependency,
new native producer or conductor is used.

The callback immediately commits `powerLevel>0` using actual/committed source
state for binary deduplication. Red input source and blue Starstone conductor
states remain independent. Existing durable metadata ownership, multi-source OR,
loaded-network fallback, topology and bounded power writes are retained.

Stable receiver reads provide initialization and recovery: new registrations
queue a deferred check; every100 ticks known inputs are queued again, with at
most32 positions handled in a deferred callback. Unknown/unloaded power retains
state; stale loaded inputs are removed. Cosmetic contacts refresh on this slow
pass. No neighbor-power fallback competes with native off events. This recovery
interval is separate from event response time.

Other explored options were callback-triggered legacy sampling and faster legacy
polling. They were not selected: the first cannot guarantee notification of every
neighbor-power change; the second increases sampling frequency and retains the
old electrical rule. Combining native and neighbor levels would create two
authorities. The owner approved the deliberate move to native receiving behavior.

The old diagnostic block override and its generator/material/loot copies are
retired. The optional [monitor](NATIVE_PARITY_PROBE.md) is script-only, observing
the production input and reporting per-tick source/conductor/self/neighbor reads.
It does not intercept raw native callbacks, replace block definitions or change
the network. Its same-tick sample counts are observations, not an equivalence PASS.

## Verification and remaining native checks

All42 feature runners pass offline, including real entry-point callback wiring,
six mount frames, dispatched pulse phases, analog deduplication, multiple native
sources, failure retry, initial receiver power, unload/reload reconciliation and
32-position recovery batches. Pack verification has0 errors. The script-only
monitor has one expected informational warning for containing no item/block/entity
definitions; the production pack has no warnings. No new engine run is claimed.

In Minecraft check support power, repeaters/comparators toward/away, dust,
observer pulses, output feedback, wet mounts and already-powered world re-entry.
Also compare native self reads with actual input state after reload. The existing
power queue coalesces newer values; no arbitrary end-to-end pulse guarantee for
large networks is added. Leave/re-enter the world after deployment; no worldgen
settings changed.

Deployment complete: production BP, optional monitor BP and RP confirmed in sync.

## Sources and shared history

- [26.0 Creator notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.0?view=minecraft-bedrock-stable): stable consumer/event support and liquid-clipping migration. The input explicitly preserves the old clipping default.
- [Consumer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable), [event](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockcomponentredstoneupdateevent?view=minecraft-bedrock-stable), [Block API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/block?view=minecraft-bedrock-stable) and local2.8.0 declarations: stable current power and possible undefined recovery read.
- [26.20 changelog](https://www.minecraft.net/en-us/article/minecraft--bedrock-edition-26-20-changelog) and [API changelog](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable): firstUpdate remains beta; no promotion found in stable2.8/2.9/2.10.
- [Preview26.60.28](https://feedback.minecraft.net/hc/en-us/articles/49076913532557-Minecraft-Beta-Preview-26-60-28): producer/dust visual fix watch, not input delivery proof.
- [Preview26.60.29](https://www.minecraft.net/en-us/article/minecraft-preview-26-60-29): experimental queued neighbor events were investigated and excluded.

Workspace knowledge commits: `f4b42be` (options), `6782d13` (changelog check).
Stable implementation knowledge/progress: `54f7ddc` (separate workspace repo).
Native electrical/timing evidence remains pending; offline tests do not replace it.
