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

// NodeRefs whose chunk was unloaded when power was computed. Left here so a
// later reconcile pass can recompute and apply power once the chunk loads.
const pendingReconciliation = new Set();

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

// Parse a NodeRef "<dim>|<x>|<y>|<z>#<lane>". Returns a plain object or
// undefined when the reference is malformed.
function parseNodeRef(nodeRef) {
    if (typeof nodeRef !== "string") {
        return undefined;
    }
    const hash = nodeRef.indexOf("#");
    if (hash === -1) {
        return undefined;
    }
    const key = nodeRef.slice(0, hash);
    const lane = nodeRef.slice(hash + 1);
    const pipe = key.indexOf("|");
    if (pipe === -1) {
        return undefined;
    }
    const dim = key.slice(0, pipe);
    const rest = key.slice(pipe + 1);
    const parts = rest.split("|");
    if (parts.length < 3) {
        return undefined;
    }
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return undefined;
    }
    return { dim, x, y, z, lane };
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
            pendingReconciliation.add(ref);
            progress.unresolved++;
            return;
        }
        const block = dimension.getBlock({ x, y, z });
        const current = currentOf(block, lane);
        if (current === "none") return;
        pendingReconciliation.delete(ref);
        if (current.value === powered) return;
        block.setPermutation(block.permutation.withState(current.state, powered));
        appliedWrites++;
        progress.written++;
    } catch (err) {
        pendingReconciliation.add(ref);
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
// superseded. Nothing is read or written synchronously.
export function applyPower(network, dimension) {
    if (!network || !(network.nodes instanceof Set) || !dimension) {
        return { written: 0, unresolved: 0, pending: 0 };
    }
    const progress = { written: 0, unresolved: 0, pending: 0 };
    const consumers = network.consumers instanceof Set ? network.consumers : new Set();
    const powered = Boolean(network.powered);
    for (const refs of [consumers, network.nodes]) for (const ref of refs) {
        if ((refs === consumers && !network.nodes.has(ref)) ||
            (refs === network.nodes && consumers.has(ref))) continue;
        const parsed = parseNodeRef(ref);
        if (!parsed) continue;
        const key = targetKey(dimension, parsed.x, parsed.y, parsed.z, parsed.lane);
        const old = targets.get(key);
        if (old) { old.progress.pending--; targets.delete(key); }
        targets.set(key, { ref, dimension, x: parsed.x, y: parsed.y, z: parsed.z, lane: parsed.lane, powered, progress });
        progress.pending++;
    }
    peakQueued = Math.max(peakQueued, targets.size);
    startJob();
    return progress;
}

// The nodeRefs still waiting on an unloaded chunk, for a later reconcile pass.
export function pendingUnresolved() {
    return pendingReconciliation;
}
