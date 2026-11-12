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

import runtime, { isCompleteNetwork, mergeProbes } from "./networkRuntime.js";
import { discoverNetwork } from "./networkGraph.js";
import { descriptorForBlock } from "./electricalBlocks.js";
import { applyPower } from "./powerPropagation.js";
import { nodeRef, parseNodeRef, LANE_IDS, NEIGHBOR_OFFSETS_18 } from "./blockKeys.js";
import { notifyNetworkDiscovered, resolveNetworkPower } from "./networkEvents.js";

// True when at least one source node in the discovered network is currently on.
// Every node of a single discovery shares the seed's dimension, so each source
// ref resolves through that one dimension. A source ref is "<dim>|<x>|<y>|<z>#<lane>".
function anySourceOn(discovered, dimension) {
    for (const ref of discovered.sources) {
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
    const powered = anySourceOn(discovered, seed.dimension);
    return registerAndApplyNetwork(discovered, powered, seed.dimension);
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

// A placed block only adds nodes and joins networks; it never splits one.
export async function extendFromPlacement(seed) {
    const descriptor = descriptorForBlock(seed);
    const dimension = seed.dimension;
    const records = [];
    const seen = new Set();
    for (const lane of descriptor?.lanes || []) {
        const ref = nodeRef(dimension, seed.location, lane.id);
        if (seen.has(ref)) continue;
        const full = async () => {
            const r = await discoverAndRegisterNetwork(seed, lane);
            if (r) { records.push(r); for (const n of r.nodes) seen.add(n); }
        };
        if (runtime.networkIdOf(ref) !== undefined) { await full(); continue; }
        const walked = await discoverNetwork(seed, undefined, lane, undefined, { stopAtOwned: true });
        if (walked.nodes.size === 0) continue;
        const ids = new Set(), added = new Set();
        let fallback = false;
        for (const node of walked.nodes) {
            const owner = runtime.networkIdOf(node);
            if (owner === undefined) added.add(node); else ids.add(owner);
        }
        for (const node of walked.owned) {
            const owner = runtime.networkIdOf(node);
            if (owner === undefined) fallback = true; else ids.add(owner);
        }
        for (const id of ids) if (!isCompleteNetwork(runtime.networkOf(id), dimension)) fallback = true;
        if (fallback) { await full(); continue; }
        const pick = set => new Set([...set].filter(n => added.has(n)));
        const delta = { nodes: added, sources: pick(walked.sources), consumers: pick(walked.consumers),
            unresolvedBoundaries: walked.unresolvedBoundaries };
        const before = [...ids].map(id => runtime.networkOf(id));
        const was = new Map(before.map(r => [r, Boolean(r.powered)]));
        let powered = before.some(r => r.powered) || anySourceOn(delta, dimension);
        // Nodes whose visual state may change: added ones, plus every node of
        // a joined network whose power differs (collected before the merge).
        const { record, absorbed } = runtime.mergeNetworks(ids, delta);
        mergeProbes(record, absorbed, added);
        if (!isCompleteNetwork(record, dimension)) {
            const logical = resolveNetworkPower(record, dimension);
            if (logical !== undefined) powered = powered || logical;
        }
        const nodes = new Set(added);
        for (const r of absorbed) if (was.get(r) !== powered) for (const n of r.nodes) nodes.add(n);
        if (was.has(record) && was.get(record) !== powered) for (const n of record.nodes) nodes.add(n);
        record.powered = powered;
        notifyNetworkDiscovered(delta, dimension);
        const consumers = new Set([...record.consumers].filter(n => nodes.has(n)));
        applyPower({ nodes, consumers, powered }, dimension);
        records.push(record);
        for (const n of record.nodes) seen.add(n);
    }
    return records;
}

// Replace every cached network touched by a discovery, then immediately apply
// the merged component's computed power. Parameters are injectable so the
// merge-and-apply contract can be tested without a Minecraft world.
export function registerAndApplyNetwork(
    discovered,
    powered,
    dimension,
    targetRuntime = runtime,
    apply = applyPower
) {
    const registered = targetRuntime.registerNetwork({ ...discovered, powered });
    if (targetRuntime === runtime && apply === applyPower) {
        // Saved metadata may lag a break or reconnect by several rebuilds; it
        // must not override a network the live walk saw completely. Across an
        // unloaded chunk it can only add a source the walk could not see.
        if (!isCompleteNetwork(registered, dimension)) {
            const logical = resolveNetworkPower(registered, dimension);
            if (logical !== undefined) registered.powered = registered.powered || logical;
        }
        notifyNetworkDiscovered(registered, dimension);
    }
    apply(registered, dimension);
    return registered;
}

// Capture everything a split needs from the runtime cache in the after-break event. Given the removed position, collect every cached network that
// references that block's lanes, the block's own lane refs, and a copy of each
// touched network's nodes. Returns the plain snapshot, or undefined when no
// cached network references the block (so the removal cannot fragment anything).
function captureRemovedNetworks(dimension, x, y, z) {
    const laneRefs = LANE_IDS.map((lane) => nodeRef(dimension, { x, y, z }, lane));
    const networkNodes = new Set();
    const removedRefs = new Set(laneRefs);
    const ids = new Set(laneRefs.map(ref => runtime.networkIdOf(ref)));
    for (const id of ids) {
        if (id === undefined) continue;
        for (const ref of runtime.networkOf(id)?.nodes || []) networkNodes.add(ref);
    }
    if (networkNodes.size === 0) {
        return undefined;
    }
    return { dimension, coords: { x, y, z }, networkNodes, removedRefs };
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
    const { dimension, coords, networkNodes, removedRefs } = capture;
    const { x, y, z } = coords;

    const touchedIds = new Set();
    for (const ref of networkNodes) {
        const id = runtime.networkIdOf(ref);
        if (id !== undefined) {
            touchedIds.add(id);
        }
    }
    for (const id of touchedIds) {
        runtime.removeNetwork(id);
    }

    const allowed = new Set();
    for (const ref of networkNodes) {
        if (removedRefs.has(ref)) {
            continue;
        }
        allowed.add(ref);
    }

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
        let claimed = false;
        for (const node of component.nodes) {
            if (assigned.has(node)) {
                claimed = true;
                break;
            }
        }
        if (claimed) {
            continue;
        }
        for (const node of component.nodes) {
            assigned.add(node);
        }
        const powered = anySourceOn(component, dimension);
        registered.push(registerAndApplyNetwork(component, powered, dimension));
    }
    return registered;
}

export { anySourceOn, captureRemovedNetworks };
export default {
    discoverAndRegisterNetwork,
    registerAndApplyNetwork,
    removeAndSplitNetwork,
    captureRemovedNetworks,
    anySourceOn
};
