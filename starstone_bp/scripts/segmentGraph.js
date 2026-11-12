// Logical networks over saved metadata only. Never receives a Dimension/Block.
import { parseSegmentNodeRef, reciprocalSegmentContact, validateChunkSegments } from "./chunkIndex.js";

const contactKey = (dimensionId, x, y, z, dir) => `${dimensionId}|${x}|${y}|${z}|${dir.join(",")}`;
const chunkKeyOf = (dimensionId, cx, cz) => `${dimensionId}|${cx}|${cz}`;
const unresolvedKey = port => `${port.ref}|${port.direction.join(",")}`;

function reciprocalKey(port) {
    const p = parseSegmentNodeRef(port.ref), [dx, dy, dz] = port.direction;
    return contactKey(p.dimensionId, p.x + dx, p.y + dy, p.z + dz, [-dx, -dy, -dz]);
}

function addSegment(graph, segment) {
    graph.segments.set(segment.key, segment);
    graph.adjacency.set(segment.key, new Set());
    graph.unresolved.set(segment.key, new Set());
    for (const port of segment.boundaries) {
        const p = parseSegmentNodeRef(port.ref);
        const key = contactKey(p.dimensionId, p.x, p.y, p.z, port.direction);
        if (!graph.contacts.has(key)) graph.contacts.set(key, []);
        graph.contacts.get(key).push({ segment: segment.key, port });
    }
}

// Connect one segment's ports to their reciprocal contacts (both directions)
// and recompute which of its ports have no counterpart.
function linkSegment(graph, id) {
    const segment = graph.segments.get(id), unresolved = new Set();
    for (const port of segment.boundaries) {
        let connected = false;
        for (const candidate of graph.contacts.get(reciprocalKey(port)) || []) {
            if (!reciprocalSegmentContact(port, candidate.port, port.direction)) continue;
            graph.adjacency.get(id).add(candidate.segment);
            graph.adjacency.get(candidate.segment).add(id);
            connected = true;
        }
        if (!connected) unresolved.add(unresolvedKey(port));
    }
    graph.unresolved.set(id, unresolved);
}

// Components of the given seed segments, in sorted seed order (the network id is
// the smallest segment key, as in a full build). Registers them in the graph.
function buildNetworks(graph, seeds) {
    const visited = new Set(), created = [];
    for (const seed of [...seeds].sort()) {
        if (visited.has(seed)) continue;
        const network = { id: seed, segments: new Set(), nodes: new Set(), sources: new Set(), activeSources: new Set(), consumers: new Set(), unresolvedBoundaries: new Set(), powered: false };
        const queue = [seed]; visited.add(seed);
        for (let head = 0; head < queue.length; head++) {
            const id = queue[head], segment = graph.segments.get(id);
            network.segments.add(id); graph.segmentToNetwork.set(id, network);
            for (const ref of segment.members) { network.nodes.add(ref); graph.nodeToNetwork.set(ref, network); }
            for (const field of ["sources", "activeSources", "consumers"]) for (const ref of segment[field]) network[field].add(ref);
            for (const ref of graph.unresolved.get(id)) network.unresolvedBoundaries.add(ref);
            for (const neighbor of graph.adjacency.get(id)) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
        }
        network.powered = network.activeSources.size > 0;
        graph.networkMap.set(network.id, network);
        created.push(network);
    }
    return created;
}

// `trusted` skips re-validation for snapshots that come from chunkIndex, which
// validated them when they were loaded or written.
export function buildSegmentGraph(chunks, { trusted = false } = {}) {
    const graph = {
        segments: new Map(), contacts: new Map(), adjacency: new Map(), unresolved: new Map(),
        chunkSegments: new Map(), networkMap: new Map(), nodeToNetwork: new Map(), segmentToNetwork: new Map(),
        get networks() { return [...this.networkMap.values()]; },
        get networkCount() { return this.networkMap.size; }
    };
    for (const snapshot of chunks) {
        if (!trusted && !validateChunkSegments(snapshot)) throw new Error("Invalid segment graph input");
        const chunkKey = chunkKeyOf(snapshot.dimensionId, snapshot.cx, snapshot.cz);
        if (graph.chunkSegments.has(chunkKey)) throw new Error("Duplicate segment chunk");
        graph.chunkSegments.set(chunkKey, new Set());
        // Stable keys include dimension and absolute position/lane, making
        // them unique across chunks without an additional generated ID.
        for (const segment of snapshot.segments) { addSegment(graph, segment); graph.chunkSegments.get(chunkKey).add(segment.key); }
    }
    for (const id of graph.segments.keys()) linkSegment(graph, id);
    buildNetworks(graph, graph.segments.keys());
    return graph;
}

// Replace one chunk's snapshot in a graph built by buildSegmentGraph and
// recompute only the components that held an old segment of that chunk, the
// new segments, and the networks the new segments now touch. Returns the new
// networks; every other network object is untouched. The result equals a full
// build over the same snapshots (segmentGraph.test.mjs checks this).
export function updateSegmentGraph(graph, snapshot, { trusted = false } = {}) {
    if (!trusted && !validateChunkSegments(snapshot)) throw new Error("Invalid segment graph input");
    const chunkKey = chunkKeyOf(snapshot.dimensionId, snapshot.cx, snapshot.cz);
    const oldKeys = graph.chunkSegments.get(chunkKey) || new Set();
    const freed = new Set(); // surviving segments of deleted networks
    const deleteNetwork = network => {
        graph.networkMap.delete(network.id);
        for (const ref of network.nodes) graph.nodeToNetwork.delete(ref);
        for (const id of network.segments) { graph.segmentToNetwork.delete(id); freed.add(id); }
    };
    for (const id of oldKeys) {
        const network = graph.segmentToNetwork.get(id);
        if (network && graph.networkMap.get(network.id) === network) deleteNetwork(network);
    }
    // Drop the old segments of the chunk with their contacts and edges.
    for (const id of oldKeys) {
        const segment = graph.segments.get(id);
        for (const neighbor of graph.adjacency.get(id)) graph.adjacency.get(neighbor)?.delete(id);
        for (const port of segment.boundaries) {
            const p = parseSegmentNodeRef(port.ref), key = contactKey(p.dimensionId, p.x, p.y, p.z, port.direction);
            const rest = graph.contacts.get(key).filter(entry => entry.segment !== id);
            if (rest.length) graph.contacts.set(key, rest); else graph.contacts.delete(key);
        }
        graph.segments.delete(id); graph.adjacency.delete(id); graph.unresolved.delete(id);
        freed.delete(id);
    }
    // Insert the new segments.
    const fresh = new Set();
    for (const segment of snapshot.segments) { addSegment(graph, segment); fresh.add(segment.key); }
    if (fresh.size) graph.chunkSegments.set(chunkKey, fresh); else graph.chunkSegments.delete(chunkKey);
    // Relink: the new segments, and segments of the surrounding chunks whose
    // ports lead into this chunk (their counterpart may have changed).
    for (const id of fresh) linkSegment(graph, id);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const around = graph.chunkSegments.get(chunkKeyOf(snapshot.dimensionId, snapshot.cx + dx, snapshot.cz + dz));
        if (!around) continue;
        for (const id of around) {
            const leads = graph.segments.get(id).boundaries.some(port => port.destination[0] === snapshot.cx && port.destination[1] === snapshot.cz);
            if (leads) linkSegment(graph, id);
        }
    }
    // A new segment may now touch a network that was not affected: merge it.
    for (const id of fresh) {
        for (const neighbor of graph.adjacency.get(id)) {
            const network = graph.segmentToNetwork.get(neighbor);
            if (network && graph.networkMap.get(network.id) === network) deleteNetwork(network);
        }
    }
    return buildNetworks(graph, new Set([...freed, ...fresh]));
}
