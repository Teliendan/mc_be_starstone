// networkController.js
//
// Orchestration for Task 4.2: turn one discovered connected electrical component
// into a registered runtime network. It discovers from an explicit seed, computes
// the network's powered flag as "any source is on", and hands the result to
// networkRuntime.js, which replaces any overlapping cached network with the new
// record.
//
// The only Minecraft access here is resolving a source ref to a block so its
// source-on state can be read; no block mutation lives in this module.

import runtime, { isCompleteNetwork, mergeProbes, probesCached, warmProbes } from "./networkRuntime.js";
import { discoverNetwork } from "./networkGraph.js";
import { descriptorForBlock } from "./electricalBlocks.js";
import { applyPower, applyPowerSteps } from "./powerPropagation.js";
import { enqueueWalk } from "./networkWalks.js";
import { SLICE_NODES, SLICE_SOURCES, drive, createGate } from "./slicing.js";
import { runSteps, stepsAsync } from "./jobs.js";
import { nodeRef, parseNodeRef, LANE_IDS, NEIGHBOR_OFFSETS_18 } from "./blockKeys.js";
import { notifyNetworkDiscovered, resolveNetworkPower, resolveNetworkPowerSteps } from "./networkEvents.js";

// Sliced runtime mutations (register / split) must not interleave with each other
// or with a merge; see createGate.
const gate = createGate();

// True when at least one source node in the discovered network is currently on.
// Every node of a single discovery shares the seed's dimension, so each source
// ref resolves through that one dimension. A source ref is "<dim>|<x>|<y>|<z>#<lane>".
// A generator: yields every SLICE_SOURCES sources (two native reads each).
function* anySourceOnSteps(discovered, dimension) {
    let counted = 0;
    for (const ref of discovered.sources) {
        if (++counted % SLICE_SOURCES === 0) yield;
        const { x, y, z } = parseNodeRef(ref);
        let block;
        try {
            if (!dimension.isChunkLoaded({ x, y, z })) continue;
            block = dimension.getBlock({ x, y, z });
        }
        catch { continue; }
        if (!block || !block.isValid) {
            continue;
        }
        const descriptor = descriptorForBlock(block);
        if (descriptor && descriptor.lanes.some((lane) => lane && lane.sourceOn)) {
            return true;
        }
    }
    return false;
}
function anySourceOn(discovered, dimension) { return drive(anySourceOnSteps(discovered, dimension)); }
const anySourceOnAsync = (discovered, dimension) => stepsAsync(anySourceOnSteps(discovered, dimension), discovered.sources.size * 5);

// Re-evaluate the power of the network that owns `ref` and apply it when it
// changed, as a walk: the caller stays O(1). A newer refresh for the same ref
// supersedes an unfinished one (the latest block states win). `committed`: the
// saved chunk metadata already took the source change, so a network that reaches
// unloaded chunks is left to it.
const partial = new WeakSet();
export function scheduleNetworkRefresh(ref, dimension, { committed = false } = {}) {
    enqueueWalk(`refresh:${ref}`, function* (cancelled) {
        const id = runtime.networkIdOf(ref);
        const network = id === undefined ? undefined : runtime.networkOf(id);
        if (!network) return;
        yield* warmProbes(network);
        if (committed && !isCompleteNetwork(network, dimension)) return;
        const powered = yield* anySourceOnSteps(network, dimension);
        if (cancelled()) return;
        if (powered === Boolean(network.powered) && !partial.has(network)) return;
        network.powered = powered;
        // A cancelled walk may have queued only part of the nodes: the next one applies all.
        partial.add(network);
        yield* applyPowerSteps(network, dimension, cancelled);
        if (!cancelled()) partial.delete(network);
    });
}

// Discover the connected electrical component the seed belongs to and register it
// as one runtime network. Overlapping cached networks are replaced by the freshly
// discovered one. Returns the stored record, or undefined when the seed is not an
// electrical block or the discovered component is empty.
export async function discoverAndRegisterNetwork(seed, lane) {
    if (!seed || !seed.isValid || !seed.dimension) {
        return undefined;
    }
    const discovered = await discoverNetwork(seed, undefined, lane);
    if (discovered.nodes.size === 0) {
        return undefined;
    }
    const powered = await anySourceOnAsync(discovered, seed.dimension);
    return registerAndApplyNetworkAsync(discovered, powered, seed.dimension);
}

// Wait for a promise inside a runJob generator: yields once per job step until it settles,
// then returns its value or throws its error. `onWait` runs before every yield.
export function* awaitResult(promise, onWait) {
    let done = false, result, failure;
    promise.then(
        value => { result = value; done = true; },
        error => { failure = error; done = true; }
    );
    while (!done) { onWait?.(); yield; }
    if (failure) throw failure;
    return result;
}

// Placement of a bridge must discover both isolated lanes.
export async function discoverAllLanes(seed) {
    const descriptor = descriptorForBlock(seed);
    const seen = new Set();
    const records = [];
    for (const lane of descriptor?.lanes || []) {
        const ref = nodeRef(seed.dimension, seed.location, lane.id);
        if (seen.has(ref)) continue;
        const network = await discoverAndRegisterNetwork(seed, lane);
        if (network) {
            records.push(network);
            for (const node of network.nodes) seen.add(node);
        }
    }
    return records;
}

// The saved-metadata power of the networks about to merge plus the added nodes, the way one
// resolver call over their union would answer (undefined: no logical network knows any of them).
function* logicalPowerSteps(records, added, dimension) {
    let found = false, any = false;
    for (const part of [...records, { nodes: added }]) {
        const value = yield* resolveNetworkPowerSteps(part, dimension);
        if (value !== undefined) { found = true; any ||= value; }
    }
    return found ? any : undefined;
}

// A placed block only adds nodes and joins networks; it never splits one.
export async function extendFromPlacement(seed) {
    const descriptor = descriptorForBlock(seed);
    const dimension = seed.dimension;
    const records = [];
    const seen = new Set();
    // `seen` only matters to a later lane of the same block (a bridge): no copy of a big network otherwise.
    const multiLane = (descriptor?.lanes?.length || 0) > 1;
    for (const lane of descriptor?.lanes || []) {
        const ref = nodeRef(dimension, seed.location, lane.id);
        if (seen.has(ref)) continue;
        const full = async () => {
            const r = await discoverAndRegisterNetwork(seed, lane);
            if (r) { records.push(r); if (multiLane) for (const n of r.nodes) seen.add(n); }
        };
        if (runtime.networkIdOf(ref) !== undefined) { await full(); continue; }
        const walked = await discoverNetwork(seed, undefined, lane, undefined, { stopAtOwned: true });
        if (walked.nodes.size === 0) continue;
        // The merge below is one synchronous section: it must not start in the middle of a
        // sliced registration or split, and everything slow (probe caches, the saved-metadata
        // power of a network that reaches unloaded chunks) is prepared before it.
        let ids, added, logical, logicalDone = false, fallback = false;
        for (;;) {
            await gate.idle();
            ids = new Set(); added = new Set(); fallback = false;
            for (const node of walked.nodes) {
                const owner = runtime.networkIdOf(node);
                if (owner === undefined) added.add(node); else ids.add(owner);
            }
            for (const node of walked.owned) {
                const owner = runtime.networkIdOf(node);
                if (owner === undefined) fallback = true; else ids.add(owner);
            }
            const cold = [...ids].map(id => runtime.networkOf(id)).find(r => r && !probesCached(r));
            if (cold) { await runSteps(warmProbes(cold)); continue; }
            for (const id of ids) if (!isCompleteNetwork(runtime.networkOf(id), dimension)) fallback = true;
            if (fallback) break;
            if (walked.unresolvedBoundaries.size > 0 && !logicalDone) {
                // The merged network will reach an unloaded chunk: the logical graph may know a source.
                const parts = [...ids].map(id => runtime.networkOf(id));
                logical = await runSteps(logicalPowerSteps(parts, added, dimension));
                logicalDone = true;
                continue;
            }
            break;
        }
        if (fallback) { await full(); continue; }
        const pick = set => new Set([...set].filter(n => added.has(n)));
        const delta = { nodes: added, sources: pick(walked.sources), consumers: pick(walked.consumers),
            unresolvedBoundaries: walked.unresolvedBoundaries };
        const before = [...ids].map(id => runtime.networkOf(id));
        const was = new Map(before.map(r => [r, Boolean(r.powered)]));
        let powered = before.some(r => r.powered) || anySourceOn(delta, dimension);
        const { record, absorbed } = runtime.mergeNetworks(ids, delta);
        mergeProbes(record, absorbed, added);
        if (!isCompleteNetwork(record, dimension) && logical !== undefined) powered = powered || logical;
        // Nodes whose visual state may change: added ones, plus every node of a joined
        // network whose power differs. The node sets are collected inside the walk.
        const changedSets = [];
        for (const r of absorbed) if (was.get(r) !== powered) changedSets.push(r.nodes);
        if (was.has(record) && was.get(record) !== powered) changedSets.push(record.nodes);
        record.powered = powered;
        notifyNetworkDiscovered(delta, dimension);
        enqueueWalk(undefined, function* (cancelled) {
            const nodes = new Set(added);
            let counted = 0;
            for (const set of changedSets) for (const n of set) {
                nodes.add(n);
                if (++counted % SLICE_NODES === 0) yield;
            }
            const consumers = new Set();
            for (const n of record.consumers) {
                if (nodes.has(n)) consumers.add(n);
                if (++counted % SLICE_NODES === 0) yield;
            }
            yield* applyPowerSteps({ nodes, consumers, powered }, dimension, cancelled);
        });
        records.push(record);
        if (multiLane) for (const n of record.nodes) seen.add(n);
    }
    return records;
}

// Replace every cached network touched by a discovery, then apply the merged
// component's computed power (queued as a walk). Parameters are injectable so the
// merge-and-apply contract can be tested without a Minecraft world.
// A generator: the registration, probe cache and saved-metadata lookup run in slices.
export function* registerAndApplyNetworkSteps(
    discovered,
    powered,
    dimension,
    targetRuntime = runtime,
    apply = applyPower
) {
    const registered = targetRuntime.registerNetworkSteps
        ? yield* targetRuntime.registerNetworkSteps({ ...discovered, powered })
        : targetRuntime.registerNetwork({ ...discovered, powered });
    const live = targetRuntime === runtime && apply === applyPower;
    if (live) {
        yield* warmProbes(registered);
        // Saved metadata may lag a break or reconnect by several rebuilds; it
        // must not override a network the live walk saw completely. Across an
        // unloaded chunk it can only add a source the walk could not see.
        if (!isCompleteNetwork(registered, dimension)) {
            const logical = yield* resolveNetworkPowerSteps(registered, dimension);
            if (logical !== undefined) registered.powered = registered.powered || logical;
        }
        notifyNetworkDiscovered(registered, dimension);
        enqueueWalk(undefined, cancelled => applyPowerSteps(registered, dimension, cancelled));
    } else {
        apply(registered, dimension);
    }
    return registered;
}
export function registerAndApplyNetwork(discovered, powered, dimension, targetRuntime = runtime, apply = applyPower) {
    return drive(registerAndApplyNetworkSteps(discovered, powered, dimension, targetRuntime, apply));
}
const registerAndApplyNetworkAsync = (discovered, powered, dimension) =>
    gate.run(() => stepsAsync(registerAndApplyNetworkSteps(discovered, powered, dimension), discovered.nodes.size));

// Capture everything a split needs from the runtime cache in the after-break event. Given the removed position, collect every cached network that
// references that block's lanes, the block's own lane refs, and the touched networks' node sets (the live sets, not copies: copying a big
// network here would be a call that grows with the world). Returns the plain snapshot, or undefined when no
// cached network references the block (so the removal cannot fragment anything).
function captureRemovedNetworks(dimension, x, y, z) {
    const laneRefs = LANE_IDS.map((lane) => nodeRef(dimension, { x, y, z }, lane));
    const networkSets = [];
    const removedRefs = new Set(laneRefs);
    const ids = new Set(laneRefs.map(ref => runtime.networkIdOf(ref)));
    for (const id of ids) {
        const nodes = id === undefined ? undefined : runtime.networkOf(id)?.nodes;
        if (nodes?.size) networkSets.push(nodes);
    }
    if (networkSets.length === 0) {
        return undefined;
    }
    return { dimension, coords: { x, y, z }, networkSets, removedRefs };
}

// The still-valid former-neighbor seeds rediscovery may start from: each of the
// six neighbors' lanes that belonged to a freed old network and is not itself one
// of the removed refs. Each seed carries the real neighbor block so discovery
// reads it directly, plus the exact lane that was attached to the old network so
// a surviving bridge lane is rediscovered on its own lane, never the first.
function rediscoverySeeds(dimension, x, y, z, allowed, removedRefs) {
    const seeds = [];
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS_18) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        let block;
        try {
            if (!dimension.isChunkLoaded({ x: nx, y: ny, z: nz })) continue;
            block = dimension.getBlock({ x: nx, y: ny, z: nz });
        } catch { continue; }
        if (!block || !block.isValid) {
            continue;
        }
        const descriptor = descriptorForBlock(block);
        if (descriptor === undefined || descriptor.lanes === undefined) {
            continue;
        }
        for (const lane of LANE_IDS) {
            const ref = nodeRef(dimension, { x: nx, y: ny, z: nz }, lane);
            if (!allowed.has(ref) || removedRefs.has(ref)) {
                continue;
            }
            const laneObj = descriptor.lanes.find((l) => l && l.id === lane);
            if (!laneObj) {
                continue;
            }
            seeds.push({ block, laneId: lane, lane: laneObj, ref });
        }
    }
    return seeds;
}

// Split the cached network(s) touched by a removed node (Task 4.5).
//
// `capture` is a plain snapshot taken synchronously by the caller in the break
// event, before the block's state disappears from the world: the affected
// coordinates, its lane refs, copies of every touched network's nodes, and the
// removed refs. Freeze every network that referenced the removed block, then
// free its nodes. Rediscover from each still-valid former neighbor's old lane,
// restricted to the freed node set, dropping the removed refs and rejecting any
// node owned by an unrelated cached network. Register each distinct fragment as
// its own network with power recomputed and applied. Distinct fragments never
// share a node, so a fragment whose nodes are all already claimed belongs to a
// fragment registered earlier and is skipped.
//
// Returns the array of freshly registered networks (possibly empty when the node
// was unowned or the whole network is gone).
export async function removeAndSplitNetwork(capture) {
    if (!capture || !capture.dimension || !capture.coords) {
        return [];
    }
    const { dimension, coords, networkSets, removedRefs } = capture;
    const { x, y, z } = coords;

    // Free the old networks and collect their nodes (minus the removed ones) in slices.
    const touchedIds = new Set();
    const allowed = new Set();
    await gate.run(() => runSteps((function* () {
        let counted = 0;
        for (const nodes of networkSets) for (const ref of nodes) {
            const id = runtime.networkIdOf(ref);
            if (id !== undefined) touchedIds.add(id);
            if (!removedRefs.has(ref)) allowed.add(ref);
            if (++counted % SLICE_NODES === 0) yield;
        }
        for (const id of touchedIds) yield* runtime.removeNetworkSteps(id);
    })()));

    const seeds = rediscoverySeeds(dimension, x, y, z, allowed, removedRefs);
    const registered = [];
    const assigned = new Set();
    for (const seed of seeds) {
        if (assigned.has(seed.ref)) continue;
        const component = await discoverNetwork(seed.block, allowed, seed.lane, removedRefs);
        for (const ref of removedRefs) {
            component.nodes.delete(ref);
        }
        if (component.nodes.size === 0) {
            assigned.add(seed.ref);
            continue;
        }
        // A fragment whose nodes were all claimed by an earlier one is skipped; claim the rest.
        const claimed = await stepsAsync((function* () {
            let counted = 0;
            for (const node of component.nodes) {
                if (assigned.has(node)) return true;
                if (++counted % SLICE_NODES === 0) yield;
            }
            for (const node of component.nodes) {
                assigned.add(node);
                if (++counted % SLICE_NODES === 0) yield;
            }
            return false;
        })(), component.nodes.size);
        if (claimed) continue;
        const powered = await anySourceOnAsync(component, dimension);
        registered.push(await registerAndApplyNetworkAsync(component, powered, dimension));
    }
    return registered;
}

export { anySourceOn, captureRemovedNetworks };
export default {
    discoverAndRegisterNetwork,
    awaitResult,
    registerAndApplyNetwork,
    removeAndSplitNetwork,
    captureRemovedNetworks,
    anySourceOn
};
