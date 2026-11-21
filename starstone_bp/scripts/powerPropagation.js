// powerPropagation.js
//
// Task 4.3 — apply binary power to electrical blocks. Given a registered
// runtime network, write the network's `powered` result into every node's
// applicable block state:
//
//   * ordinary cable, conduit, lamp and output adapter use `starstone:powered`
//   * input adapter uses `starstone:star_powered` for its blue conductor; its
//     `starstone:powered` state remains the independent redstone source value
//   * a bridge lane uses `starstone:powered_ns` for #ns and `starstone:powered_ew`
//     for #ew, so the two lanes update independently
//
// Only blocks whose applicable powered state actually changes are written, and
// each such write changes just that one state through `block.permutation` so
// every unrelated state (mounting face, connections, axis, enabled, light) is
// preserved. Writes are deferred to one engine-paced `system.runJob` generator
// (owner decision SS-09, 2026-11-12): each step reads one block and writes at
// most one permutation, then yields, so the engine's per-tick job budget sets
// the pace. A newer target for the same node and lane supersedes an older unread
// one and moves to the end. Actual frame/tick safety still needs an in-game
// measurement. Locations whose chunk is unloaded are skipped and left in
// pendingReconciliation for a later reconcile pass (see Task 7.5); the block
// is never touched while it cannot be reached.
//
// The generator is the source, not a consumer: its `enabled` state is managed
// separately, so a source block is never given a `powered` state here.

import { system } from "@minecraft/server";
import { parseNodeRef, chunkOf } from "./blockKeys.js";
import { SLICE_NODES, drive } from "./slicing.js";
import {
    CABLE_ID,
    INNER_CORNER_ID,
    BRIDGE_ID,
    CONDUIT_ID,
    LAMP_ID,
    REDSTONE_INPUT_ID,
    REDSTONE_OUTPUT_ID,
    LANE_NS,
    LANE_EW,
    STATE_POWERED,
    STATE_STAR_POWERED,
    STATE_POWERED_NS,
    STATE_POWERED_EW,
} from "./constants.js";

const TAG = "[Starstone]";

// Blocks that actually own a Starstone visual power state and may be written here. The
// generator (a source) owns `enabled`, not `powered`, so it is intentionally
// absent and never rewritten by this module.
const POWERED_CAPABLE = new Set([CABLE_ID, INNER_CORNER_ID, BRIDGE_ID, CONDUIT_ID, LAMP_ID, REDSTONE_INPUT_ID, REDSTONE_OUTPUT_ID]);

// Pending targets, one per node and lane, in application order (consumers first):
//   { ref, dimension, x, y, z, lane, powered, progress }
// The job deletes an entry before processing it; applyPower deletes and
// re-inserts, so the live Map iterator below sees every newer state.
const targets = new Map();
let running = false;
let peakQueued = 0;
let appliedWrites = 0;
export function powerStats() {
    return { queued: targets.size, peakQueued, appliedWrites, planning: running ? 1 : 0 };
}
function targetKey(dimension, x, y, z, lane) {
    return `${dimension.id}|${x}|${y}|${z}|plan:${lane}`;
}

// Writes skipped because their chunk was unloaded: ref -> latest desired target. The latest
// desired state wins: a newer applyPower for the ref replaces the entry (see applyPower), and
// a processed or impossible write (block gone) drops it. At most one entry per node.
const pendingReconciliation = new Map();
// The same entries grouped by chunk: chunkKey -> Set(ref). catchUpPending probes one chunk per
// group, so its cost follows the number of pending chunks and is zero when there are none.
const pendingChunks = new Map();
export const PENDING_CATCHUP_INTERVAL_TICKS = 10;
function chunkKeyOf(dimension, x, z) { return `${dimension.id}|${chunkOf(x)}|${chunkOf(z)}`; }
function addPending(target) {
    const { ref, dimension, x, z } = target;
    const key = chunkKeyOf(dimension, x, z);
    pendingReconciliation.set(ref, { ...target, chunkKey: key });
    let refs = pendingChunks.get(key);
    if (!refs) pendingChunks.set(key, refs = new Set());
    refs.add(ref);
}
function dropPending(ref) {
    const entry = pendingReconciliation.get(ref);
    if (!entry) return;
    pendingReconciliation.delete(ref);
    const refs = pendingChunks.get(entry.chunkKey);
    if (refs) { refs.delete(ref); if (!refs.size) pendingChunks.delete(entry.chunkKey); }
}

// The block-state a lane writes, per plan section 5.2/5.3.
export function poweredStateForLane(lane) {
    if (lane === LANE_NS) {
        return STATE_POWERED_NS;
    }
    if (lane === LANE_EW) {
        return STATE_POWERED_EW;
    }
    return STATE_POWERED;
}

// The powered state a block owns for a lane, as { state, value }, or "none" when
// the block cannot carry one (gone, not powered-capable, state missing).
function currentOf(block, lane) {
    if (!block || !block.isValid) return "none";
    const typeId = block.type.id;
    if (!POWERED_CAPABLE.has(typeId)) return "none";
    const state = typeId === REDSTONE_INPUT_ID ? STATE_STAR_POWERED : poweredStateForLane(lane);
    const current = block.permutation.getState(state);
    if (current === undefined) return "none";
    return { state, value: Boolean(current) };
}

// One job step: read the block, write at most one state. Unreachable or failing
// nodes go to pendingReconciliation; the block is never touched while unloaded.
function applyTarget(target) {
    const { ref, dimension, x, y, z, lane, powered, progress } = target;
    try {
        if (!dimension.isChunkLoaded({ x, y, z })) {
            addPending(target);
            progress.unresolved++;
            return;
        }
        const block = dimension.getBlock({ x, y, z });
        const current = currentOf(block, lane);
        if (current === "none") { dropPending(ref); return; }
        dropPending(ref);
        if (current.value === powered) return;
        block.setPermutation(block.permutation.withState(current.state, powered));
        appliedWrites++;
        progress.written++;
    } catch (err) {
        addPending(target);
        console.warn(`${TAG} Could not set power for ${ref}: ${err.message}`);
    }
}

function* writer() {
    try {
        for (const [key, target] of targets) {
            targets.delete(key);
            target.progress.pending--;
            applyTarget(target);
            yield;
        }
    } finally {
        running = false;
        // Targets added while the last step yielded are normally seen by the
        // live iterator; this covers an interrupted job.
        if (targets.size > 0) {
            try { startJob(); } catch (error) { console.warn(`${TAG} Could not restart power writer: ${error.message}`); }
        }
    }
}

function startJob() {
    if (running || targets.size === 0) return;
    running = true;
    try { system.runJob(writer()); }
    catch (error) { running = false; throw error; }
}

// Set the power of every node of a network: consumers first (the visible result
// of a circuit, so a distant lamp does not wait behind every cable), then the
// rest. Returns live { written, unresolved, pending } progress: written counts
// actual state changes, pending reaches zero when every target was processed or
// superseded. Nothing is read or written here: this only queues targets, a
// generator that yields every SLICE_NODES nodes so a big network never queues
// in one call. `cancelled` (optional) stops it early at a slice boundary.
export function* applyPowerSteps(network, dimension, cancelled) {
    if (!network || !(network.nodes instanceof Set) || !dimension) {
        return { written: 0, unresolved: 0, pending: 0 };
    }
    const progress = { written: 0, unresolved: 0, pending: 0 };
    const consumers = network.consumers instanceof Set ? network.consumers : new Set();
    const powered = Boolean(network.powered);
    let counted = 0;
    for (const refs of [consumers, network.nodes]) for (const ref of refs) {
        if ((refs === consumers && !network.nodes.has(ref)) ||
            (refs === network.nodes && consumers.has(ref))) continue;
        const parsed = parseNodeRef(ref);
        const key = targetKey(dimension, parsed.x, parsed.y, parsed.z, parsed.lane);
        dropPending(ref); // this target supersedes any skipped older one
        const old = targets.get(key);
        if (old) { old.progress.pending--; targets.delete(key); }
        targets.set(key, { ref, dimension, x: parsed.x, y: parsed.y, z: parsed.z, lane: parsed.lane, powered, progress });
        progress.pending++;
        if (++counted % SLICE_NODES === 0) {
            peakQueued = Math.max(peakQueued, targets.size);
            startJob();
            yield;
            if (cancelled?.()) return progress;
        }
    }
    peakQueued = Math.max(peakQueued, targets.size);
    startJob();
    return progress;
}
export function applyPower(network, dimension) {
    return drive(applyPowerSteps(network, dimension));
}

// Re-queue the skipped writes of every pending chunk that is loaded again (one chunk probe per
// pending chunk, called every PENDING_CATCHUP_INTERVAL_TICKS). Only those nodes are touched, with
// their latest desired state; applyTarget clears the entry (or re-adds it if the chunk went away
// again). A node with a newer queued target is left to that target.
export function catchUpPending() {
    if (!pendingChunks.size) return 0;
    let queued = 0;
    for (const refs of pendingChunks.values()) {
        let first;
        for (const ref of refs) { first = pendingReconciliation.get(ref); break; }
        if (!first) continue;
        try { if (!first.dimension.isChunkLoaded({ x: first.x, y: first.y, z: first.z })) continue; }
        catch { continue; }
        for (const ref of refs) {
            const entry = pendingReconciliation.get(ref);
            const key = targetKey(entry.dimension, entry.x, entry.y, entry.z, entry.lane);
            if (targets.has(key)) continue;
            const progress = { written: 0, unresolved: 0, pending: 1 };
            targets.set(key, { ...entry, progress });
            queued++;
        }
    }
    if (queued) { peakQueued = Math.max(peakQueued, targets.size); startJob(); }
    return queued;
}

// The nodeRefs still waiting on an unloaded chunk, for a later reconcile pass.
export function pendingUnresolved() {
    return pendingReconciliation;
}
