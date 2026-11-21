// networkRuntime.js
//
// Runtime network index for the Starstone electrical graph (Task 4.1). Owns the
// two indexes that tie the discovery system to persisted world state:
//
//   networks        id      -> network record
//   nodeToNetwork   NodeRef -> id
//
// A network record matches plan section 5.5:
//
//   {
//     id: number,
//     nodes: Set<NodeRef>,
//     sources: Set<NodeRef>,
//     consumers: Set<NodeRef>,
//     powered: boolean,
//     unresolvedBoundaries: Set<BoundaryKey>
//   }
//
// A NodeRef is a plain string ("<dim>|<x>|<y>|<z>#<lane>"). A bridge block
// exposes two NodeRefs (#ns and #ew) that are never joined to each other, so the
// only way one block position feeds two networks is for those two references to
// land in two different runtime networks. This module keeps that invariant.
//
// It never touches a block or a permutation. Power-only updates and discovery
// live in later tasks; the record.powered flag is filled in when a network is
// registered. A fresh instance is returned by createRuntime() so pure tests run
// against an isolated index, and the default export is the single instance the
// pack shares for its lifetime.

import { parseNodeRef, chunkOf } from "./blockKeys.js";
import { SLICE_NODES, drive } from "./slicing.js";

// Each runtime owns its own indexes. Keeping them inside this factory prevents
// a test runtime from resetting the pack's shared default runtime.
function createRuntime() {
// The two indexes, plus the next id to hand out.
let networks;
let nodeToNetwork;
let nextId;

function resetState() {
    networks = new Map();
    nodeToNetwork = new Map();
    nextId = 1;
}

resetState();

// Move every node of the given networks and the added nodes into the largest
// of them (its id survives). Returns { record, absorbed }.
function mergeNetworks(ids, added) {
    const records = [...ids].map(id => networks.get(id)).filter(Boolean)
        .sort((a, b) => b.nodes.size - a.nodes.size);
    let record = records[0];
    if (!record) {
        record = addNetwork({ nodes: new Set(), sources: new Set(), consumers: new Set(), unresolvedBoundaries: new Set(), powered: false });
    }
    const absorbed = records.slice(1);
    for (const other of absorbed) {
        for (const node of other.nodes) { record.nodes.add(node); nodeToNetwork.set(node, record.id); }
        for (const field of ["sources", "consumers", "unresolvedBoundaries"]) for (const value of other[field]) record[field].add(value);
        networks.delete(other.id);
    }
    for (const node of added.nodes) {
        const owner = nodeToNetwork.get(node);
        if (owner !== undefined && owner !== record.id) throw new Error(`networkRuntime: node ${node} already belongs to network ${owner}`);
        record.nodes.add(node); nodeToNetwork.set(node, record.id);
    }
    for (const field of ["sources", "consumers", "unresolvedBoundaries"]) for (const value of added[field] || []) record[field].add(value);
    return { record, absorbed };
}

// Hand out the next network id. Ids are small positive integers and reset on a
// full clear so a reloaded world starts numbering from one.
function allocateId() {
    const id = nextId;
    nextId += 1;
    return id;
}

// Register a discovered network. Assigns an id when the record has none and
// fills any missing record fields so a partial discovery still forms a valid
// record. Enforces the invariant that every NodeRef belongs to at most one
// runtime network: adding a network that shares a node with a different one
// throws instead of violating the invariant. Returns the stored record.
function* addNetworkSteps(network, { assignId = true } = {}) {
    let counted = 0;
    if (!network || typeof network !== "object") {
        throw new Error("networkRuntime: addNetwork requires a network record");
    }
    if (!(network.nodes instanceof Set)) {
        throw new Error("networkRuntime: network.nodes must be a Set of NodeRefs");
    }

    for (const node of network.nodes) {
        const owner = nodeToNetwork.get(node);
        if (owner !== undefined && owner !== network.id) {
            throw new Error(
                `networkRuntime: node ${node} already belongs to network ${owner}`
            );
        }
        if (++counted % SLICE_NODES === 0) yield;
    }

    const id = assignId || network.id === undefined || network.id === null
        ? allocateId()
        : network.id;

    const record = {
        id,
        nodes: network.nodes,
        sources: network.sources instanceof Set ? network.sources : new Set(),
        consumers: network.consumers instanceof Set ? network.consumers : new Set(),
        powered: Boolean(network.powered),
        unresolvedBoundaries:
            network.unresolvedBoundaries instanceof Set
                ? network.unresolvedBoundaries
                : new Set()
    };

    networks.set(id, record);
    for (const node of record.nodes) {
        nodeToNetwork.set(node, id);
        if (++counted % SLICE_NODES === 0) yield;
    }
    return record;
}
function addNetwork(network, options) { return drive(addNetworkSteps(network, options)); }

// Register a freshly discovered network (plan section 5.5, plus a powered flag
// the controller computes as "any source is on"). A discovery rarely arrives into
// empty space: it usually overlaps a network that was cached before, so every
// cached network that already claims any of the new nodes is dropped first and the
// new record becomes the single owner of every node it lists. The one-network-per-
// node invariant is restored rather than violated. Returns the stored record.
function* registerNetworkSteps(discovered, { assignId = true } = {}) {
    let counted = 0;
    if (!discovered || typeof discovered !== "object" || !(discovered.nodes instanceof Set)) {
        throw new Error("networkRuntime: registerNetwork requires a discovered network record");
    }

    const overlapping = new Set();
    for (const node of discovered.nodes) {
        const owner = nodeToNetwork.get(node);
        if (owner !== undefined) {
            overlapping.add(owner);
        }
        if (++counted % SLICE_NODES === 0) yield;
    }
    for (const id of overlapping) {
        yield* removeNetworkSteps(id);
    }

    return yield* addNetworkSteps(discovered, { assignId });
}
function registerNetwork(discovered, options) { return drive(registerNetworkSteps(discovered, options)); }

// Drop a network by id and release every NodeRef it held so those nodes may join
// another network. Returns true when a network was removed.
function* removeNetworkSteps(id) {
    const record = networks.get(id);
    if (!record) {
        return false;
    }
    let counted = 0;
    for (const node of record.nodes) {
        nodeToNetwork.delete(node);
        if (++counted % SLICE_NODES === 0) yield;
    }
    networks.delete(id);
    return true;
}
function removeNetwork(id) { return drive(removeNetworkSteps(id)); }

// The id a NodeRef currently belongs to, or undefined when it is unassigned.
function networkIdOf(nodeRef) {
    return nodeToNetwork.get(nodeRef);
}

// The stored record for an id, or undefined.
function networkOf(id) {
    return networks.get(id);
}

// The id that the next addNetwork call would assign.
function nextNetworkId() {
    return nextId;
}

// Empty every index and restart id allocation.
function clearNetworks() {
    resetState();
}

// --- Debug / diagnostic accessors -----------------------------------------

function networkCount() {
    return networks.size;
}

function nodeCount() {
    return nodeToNetwork.size;
}

// The set of active network ids.
function networkIds() {
    return new Set(networks.keys());
}

// A copy of the node set for a network, or undefined when the id is unknown.
function nodesIn(id) {
    const record = networks.get(id);
    return record ? new Set(record.nodes) : undefined;
}

// An immutable snapshot of every network for diagnostics.
function snapshot() {
    const out = [];
    for (const record of networks.values()) {
        out.push({
            id: record.id,
            powered: Boolean(record.powered),
            nodes: new Set(record.nodes),
            sources: new Set(record.sources),
            consumers: new Set(record.consumers),
            unresolvedBoundaries: new Set(record.unresolvedBoundaries)
        });
    }
    return out;
}

// The structural invariant holds when every (node, id) pair in nodeToNetwork has
// that node in the matching network's node set. Guaranteed by construction, but
// checked here so diagnostics can report it honestly.
function invariantHolds() {
    for (const [node, id] of nodeToNetwork) {
        const record = networks.get(id);
        if (!record || !record.nodes.has(node)) {
            return false;
        }
    }
    return true;
}

    return {
        addNetwork,
        addNetworkSteps,
        registerNetwork,
        registerNetworkSteps,
        mergeNetworks,
        removeNetwork,
        removeNetworkSteps,
        networkIdOf,
        networkOf,
        nextNetworkId,
        clearNetworks,
        networkCount,
        nodeCount,
        networkIds,
        nodesIn,
        snapshot,
        invariantHolds
    };
}

const runtime = createRuntime();

// A live discovery that reached every node without crossing into an unloaded
// chunk is exact while all of those chunks stay loaded: its own sources decide
// its power. Saved chunk metadata is needed once any part is out of reach,
// including a chunk that unloaded after discovery and hides a source.
const chunkProbes = new WeakMap();
function addProbe(byChunk, ref) {
    const { x, y, z } = parseNodeRef(ref);
    const key = `${chunkOf(x)},${chunkOf(z)}`;
    if (!byChunk.has(key)) byChunk.set(key, { x, y, z });
}
function probesOf(network) {
    let probes = chunkProbes.get(network);
    if (!probes) {
        probes = new Map();
        for (const ref of network.nodes || []) addProbe(probes, ref);
        chunkProbes.set(network, probes);
    }
    return probes.values();
}
// Keep a merged record's probe cache current without re-reading all its nodes.
export function mergeProbes(record, absorbed, addedNodes) {
    const probes = chunkProbes.get(record);
    if (!probes) return;
    for (const other of absorbed) {
        const theirs = chunkProbes.get(other);
        if (theirs) { for (const [key, p] of theirs) if (!probes.has(key)) probes.set(key, p); }
        else for (const ref of other.nodes) addProbe(probes, ref);
    }
    for (const ref of addedNodes) addProbe(probes, ref);
}
// True when the probe cache of a network is built (isCompleteNetwork is then O(chunks)).
export const probesCached = network => chunkProbes.has(network);
// Build the probe cache in slices, so a later isCompleteNetwork is O(chunks).
export function* warmProbes(network) {
    if (chunkProbes.has(network)) return;
    const probes = new Map();
    let counted = 0;
    for (const ref of network.nodes || []) {
        addProbe(probes, ref);
        if (++counted % SLICE_NODES === 0) yield;
    }
    if (!chunkProbes.has(network)) chunkProbes.set(network, probes);
}
export function isCompleteNetwork(network, dimension) {
    if (!network || network.unresolvedBoundaries?.size > 0) return false;
    if (!dimension) return true;
    for (const position of probesOf(network)) {
        try { if (!dimension.isChunkLoaded(position)) return false; }
        catch { return false; }
    }
    return true;
}

export { createRuntime, runtime };
export default runtime;
