// Persisted segment metadata carries power through unloaded chunks. All block
// reads below check chunk availability; imports only install plain state.
import { system, world } from "@minecraft/server";
import { placementIndex } from "./persistence.js";
import { chunkIndex, buildIndexedChunkSegments } from "./chunkIndex.js";
import { buildSegmentGraphSteps, updateSegmentGraphSteps } from "./segmentGraph.js";
import { applyPowerSteps, catchUpPending, PENDING_CATCHUP_INTERVAL_TICKS } from "./powerPropagation.js";
import { enqueueWalk } from "./networkWalks.js";
import { SLICE_NODES, SLICE_BUILD, SLICE_SOURCES } from "./slicing.js";
import runtime, { isCompleteNetwork, warmProbes } from "./networkRuntime.js";
import { parseNodeRef, nodeRef, chunkOf } from "./blockKeys.js";
import { configureNetworkPersistence, subscribeNetworkDiscovery, notifyNetworkDiscovered } from "./networkEvents.js";
import { KIND_BY_ID } from "./constants.js";

export const CHUNK_OBSERVER_INTERVAL_TICKS = 100;
export const CHUNK_OBSERVER_BUDGET = 32;
// Write-only property families of earlier versions (source hints, per-network
// power). Nothing read them; the graph load deletes leftovers once per session.
const OBSOLETE_PREFIXES = ["starstone:source_state:", "starstone:logical_power:"];
let swept = false;
const pending = new Map(), retry = new Map(), revisions = new Map(), observed = new Set();
const knownDimensions = new Map();
const discoveryRetries = new Map();
let observerCandidates = new Map(), candidateList;
// The logical graph is built and changed only by the rebuild job below (one job, one
// writer): `graph` is undefined until the first build, `graphBusy` is true while a chunk
// commit (snapshot write + incremental graph update) is between two steps, and
// `refreshRequested` asks for a full rebuild. Readers treat "busy or missing" as "no
// logical data" and fall back to the live walk, which they already do for an unknown source.
let graph, registered = false, running = false, scheduled = false, graphBusy = false, refreshRequested = false, graphBlocked = false;
let builds = 0, commits = 0, staleBuilds = 0, pollOffset = 0;
const keyOf = (id, cx, cz) => `${id}|${cx}|${cz}`;
const dimensionFor = id => { try { return world.getDimension(id); } catch { return knownDimensions.get(id); } };
function loaded(dimension, position) {
    try { return Boolean(dimension?.isChunkLoaded(position)); } catch { return false; }
}
function* sweepObsoleteProperties() {
    swept = true;
    try {
        const ids = world.getDynamicPropertyIds();
        yield;
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (OBSOLETE_PREFIXES.some(prefix => id.startsWith(prefix))) world.setDynamicProperty(id, undefined);
            if ((i + 1) % 1024 === 0) yield;
        }
    } catch (error) {
        console.warn(`[Starstone] Obsolete property sweep failed: ${error.message}`);
    }
}
// Cold start: load and validate the saved chunks and build the graph, in slices. Runs as the
// first part of the rebuild job (never in a callback).
function* loadGraphSteps() {
    if (!swept) yield* sweepObsoleteProperties();
    const snapshots = yield* chunkIndex.loadedChunksSteps();
    const next = yield* buildSegmentGraphSteps(snapshots, { trusted: true });
    graph = next;
    yield* cacheCandidatesSteps(snapshots);
}
// Ask the rebuild job to build the graph (or rebuild it completely). Never blocks.
function requestGraph({ refresh = false } = {}) {
    if (refresh) refreshRequested = true;
    else if (graph) return;
    schedule();
}
// Saved snapshots are rebuilt a chunk at a time after every edit, so a logical
// network can briefly describe an older topology. Nodes owned by a completely
// discovered live network keep the live result; logical power only fills in
// nodes whose live network reaches unloaded chunks or that no walk has seen.
// A generator (yields every SLICE_NODES nodes), run as a walk.
function* applyLogicalSteps(network, dimension, cancelled) {
    const nodes = new Set();
    const owners = new Set();
    const complete = new Map();
    let counted = 0;
    for (const ref of network.nodes) {
        const owner = runtime.networkIdOf(ref);
        if (owner !== undefined) {
            let done = complete.get(owner);
            if (done === undefined) {
                const live = runtime.networkOf(owner);
                if (live) yield* warmProbes(live);
                done = isCompleteNetwork(live, dimension);
                complete.set(owner, done);
            }
            if (done) continue;
        }
        if (owner !== undefined) owners.add(owner);
        nodes.add(ref);
        if (++counted % SLICE_NODES === 0) { yield; if (cancelled()) return; }
    }
    for (const id of owners) {
        const cached = runtime.networkOf(id);
        if (cached) cached.powered = network.powered;
    }
    if (nodes.size) yield* applyPowerSteps({ ...network, nodes }, dimension, cancelled);
}
// Queue the logical power of one network as a walk (a newer one for the same logical id supersedes it).
function applyLogical(network, dimension) {
    enqueueWalk(`logical:${network.id}`, cancelled => applyLogicalSteps(network, dimension, cancelled));
}
// An unchanged snapshot leaves the graph as it is; a chunk that became loaded
// again only needs the latest state re-applied to the networks it belongs to.
// Returns false when there is no usable graph (caller rebuilds it).
function* reapplyChunkNetworksSteps(snapshot) {
    if (!graph) return false;
    const networks = new Set();
    for (const segment of snapshot.segments) {
        const network = graph.segmentToNetwork.get(segment.key);
        if (!network) return false;
        networks.add(network);
    }
    let counted = 0;
    for (const network of networks) {
        const dimension = dimensionFor(parseNodeRef(network.nodes.values().next().value).dimensionId);
        if (!dimension) continue;
        applyLogical(network, dimension);
        notifyNetworkDiscovered(network, dimension);
        counted += network.sources.size;
        if (counted >= SLICE_SOURCES) { counted = 0; yield; }
    }
    return true;
}
function applyAndNotify(network) {
    const dimension = dimensionFor(parseNodeRef(network.nodes.values().next().value).dimensionId);
    if (!dimension) return;
    applyLogical(network, dimension);
    notifyNetworkDiscovered(network, dimension);
}
// Full rebuild: an unknown source or a failed incremental update.
function* refreshLogicalGraphSteps() {
    refreshRequested = false;
    const snapshots = yield* chunkIndex.loadedChunksSteps();
    const next = yield* buildSegmentGraphSteps(snapshots, { trusted: true });
    graph = next;
    yield* cacheCandidatesSteps(snapshots);
    let counted = 0;
    for (const network of graph.networks) {
        applyAndNotify(network);
        counted += 1 + network.sources.size;
        if (counted >= SLICE_SOURCES) { counted = 0; yield; }
    }
}
// A committed snapshot changed: update only the components that touch its chunk
// and re-apply only those networks. Any failure falls back to the full build
// (a half-updated graph is never kept).
function* refreshLogicalChunkSteps(snapshot) {
    if (!graph) { yield* refreshLogicalGraphSteps(); return; }
    let created;
    try { created = yield* updateSegmentGraphSteps(graph, snapshot, { trusted: true }); }
    catch (error) {
        console.warn(`[Starstone] Incremental logical update failed, rebuilding: ${error.message}`);
        yield* refreshLogicalGraphSteps();
        return;
    }
    yield* cacheSnapshotCandidatesSteps(snapshot);
    let counted = 0;
    for (const network of created) {
        applyAndNotify(network);
        counted += 1 + network.sources.size;
        if (counted >= SLICE_SOURCES) { counted = 0; yield; }
    }
}
export function chunkStats() {
    return { running, queued: pending.size, retry: retry.size, observed: observed.size,
        discoveryRetry: discoveryRetries.size,
        builds, commits, staleBuilds, logicalNetworks: graph?.networkCount || 0, graphReady: Boolean(graph),
        pollBudget: CHUNK_OBSERVER_BUDGET, pollInterval: CHUNK_OBSERVER_INTERVAL_TICKS };
}

export function queueChunkRebuild(dimension, cx, cz, y = 0) {
    knownDimensions.set(dimension.id, dimension);
    const key = keyOf(dimension.id, cx, cz);
    revisions.set(key, (revisions.get(key) || 0) + 1);
    pending.set(key, { dimension, cx, cz, y, key });
    rememberCandidate({ dimension, cx, cz, y, key });
    retry.delete(key);
    schedule();
}
function schedule() {
    if (running || scheduled || graphBlocked || (!pending.size && graph && !refreshRequested)) return;
    scheduled = true;
    try {
        system.run(() => {
            scheduled = false;
            if (running || graphBlocked || (!pending.size && graph && !refreshRequested)) return;
            running = true;
            try { system.runJob(rebuildPending()); }
            catch (error) { running = false; console.warn(`[Starstone] Chunk scheduling failed: ${error.message}`); }
        });
    } catch (error) { scheduled = false; throw error; }
}
function hasDiscoveryRetry(key) {
    for (const entry of discoveryRetries.values()) if (entry.key === key) return true;
    return false;
}
// The graph writer: builds the graph when it is missing or a full rebuild was asked, then
// rebuilds one pending chunk at a time. Every part is sliced: one step handles at most ~128
// nodes (or one saved page, or one block read) of a chunk, so no step grows with the chunk.
function* rebuildPending() {
    try {
        while (pending.size || !graph || refreshRequested) {
            if (!graph || refreshRequested) {
                try {
                    if (!graph) yield* loadGraphSteps(); else yield* refreshLogicalGraphSteps();
                } catch (error) {
                    // Retried by the next observer poll; no tight loop.
                    graphBlocked = true;
                    console.warn(`[Starstone] Logical graph build failed: ${error.message}`);
                    return;
                }
                yield;
                continue;
            }
            const [key, request] = pending.entries().next().value;
            pending.delete(key);
            const { dimension, cx, cz, y } = request;
            if (!loaded(dimension, { x:cx*16+8, y, z:cz*16+8 })) { retry.set(key, request); continue; }
            if (hasDiscoveryRetry(key)) { retry.set(key, request); continue; }
            const revision = revisions.get(key);
            builds++;
            try {
                const stale = [];
                const snapshot = yield* buildIndexedChunkSegments(dimension, cx, cz, placementIndex, { onStale: p => stale.push(p) });
                if (revision !== revisions.get(key)) {
                    staleBuilds++;
                    if (!pending.has(key)) pending.set(key, request);
                    continue;
                }
                if (!snapshot) { retry.set(key, request); continue; }
                // Commit: snapshot pages, then the graph. A source toggle arriving meanwhile
                // (commitSourceState) queues its own rebuild and leaves the graph alone.
                graphBusy = true;
                try {
                    const { changed } = yield* chunkIndex.writeChunkSteps(snapshot);
                    commits++;
                    retry.delete(key);
                    // The snapshot already excludes these; drop their hints without
                    // re-queueing this chunk. Re-read: a block may have returned.
                    let reads = 0;
                    for (const p of stale) {
                        if (!loaded(dimension, p)) continue;
                        const block = dimension.getBlock(p);
                        if (block?.isValid && !KIND_BY_ID[block.typeId]) placementIndex.remove(dimension.id, p, { notify: false });
                        if (++reads % 16 === 0) yield;
                    }
                    if (changed || !(yield* reapplyChunkNetworksSteps(snapshot))) yield* refreshLogicalChunkSteps(snapshot);
                } finally { graphBusy = false; }
            } catch (error) {
                retry.set(key, request);
                console.warn(`[Starstone] Chunk reconciliation failed: ${error.message}`);
            }
            yield;
        }
    } finally { running = false; schedule(); }
}

// Synchronous source commit; no topology discovery or segment rebuilding here.
// A false result (unknown source) lets the caller run its ordinary
// loaded-cache pass; the chunk snapshot write in updateSource is the commit.
export function commitSourceState(dimension, location, on) {
    knownDimensions.set(dimension.id,dimension);
    const ref = nodeRef(dimension.id, location, "main");
    const key = keyOf(dimension.id, chunkOf(location.x), chunkOf(location.z));
    revisions.set(key, (revisions.get(key) || 0) + 1);
    // No graph yet (cold start) or a commit in flight: the block state is authoritative and
    // the chunk's own rebuild, queued here, brings the saved data and the graph up to date.
    if (!graph || graphBusy) {
        requestGraph();
        queueChunkRebuild(dimension, chunkOf(location.x), chunkOf(location.z), location.y);
        return false;
    }
    const current = graph;
    if (!chunkIndex.updateSource(ref, Boolean(on))) {
        queueChunkRebuild(dimension, chunkOf(location.x), chunkOf(location.z), location.y);
        return false;
    }
    const network = current.nodeToNetwork.get(ref);
    if (!network) { requestGraph({ refresh: true }); return true; }
    // The incremental update rebuilds networks from the graph's stored segments:
    // store the toggled one too, or the next commit of another chunk of this
    // network would restore the pre-toggle source state.
    const view = chunkIndex.readChunk(dimension.id, chunkOf(location.x), chunkOf(location.z));
    const segment = view?.segments.find(s => s.sources.includes(ref));
    if (segment && current.segments.has(segment.key)) current.segments.set(segment.key, segment);
    const active = new Set(network.activeSources);
    if (on) active.add(ref); else active.delete(ref);
    const powered = active.size > 0;
    network.activeSources = active;
    network.powered = powered;
    // The walk over the network's nodes is queued, not run here (a newer toggle supersedes it).
    applyLogical(network, dimension);
    return true;
}

function discovered(network, dimension) {
    // Logical notifications register loaded adapter sources, but must not feed
    // back into another segment build.
    if (network.segments) return;
    knownDimensions.set(dimension.id, dimension);
    const job = function* () {
        const chunks = new Map();
        // Wait for the logical graph (built by the rebuild job); without one nothing counts as saved.
        while (!graph && !graphBlocked) { requestGraph(); yield; }
        const committed = graph?.nodeToNetwork ?? new Map();
        try {
            for (const ref of network.nodes) {
                const position = parseNodeRef(ref);
                if (position.dimensionId !== dimension.id) continue;
                const cx = chunkOf(position.x), cz = chunkOf(position.z);
                const key = keyOf(dimension.id,cx,cz);
                // Saved and not awaiting a rebuild: its position is indexed.
                if (committed.has(ref) && !pending.has(key) && !retry.has(key)) continue;
                chunks.set(key, { cx, cz, y:position.y });
                try {
                    if (!loaded(dimension, position)) throw new Error("Discovered position unloaded");
                    const block = dimension.getBlock(position);
                    if (!block?.isValid) throw new Error("Discovered position unavailable");
                    // Gone/replaced blocks are settled by the indexed builder.
                    if (placementIndex.record(block) === false && KIND_BY_ID[block.type.id]) {
                        throw new Error("Discovered position could not be indexed");
                    }
                    discoveryRetries.delete(ref);
                } catch (error) {
                    discoveryRetries.set(ref, { dimension, position, key });
                    console.warn(`[Starstone] Discovery indexing deferred: ${error.message}`);
                }
                yield;
            }
        } finally {
            // New hints queue their chunk through the index change listener.
        }
    }();
    try { system.runJob(job); }
    catch (error) {
        for (const ref of network.nodes) {
            const position = parseNodeRef(ref);
            if (position.dimensionId === dimension.id) discoveryRetries.set(ref, {
                dimension, position, key:keyOf(dimension.id,chunkOf(position.x),chunkOf(position.z))
            });
        }
        console.warn(`[Starstone] Discovery indexing could not schedule: ${error.message}`);
    }
}

function rememberCandidate(request) {
    const key = request.key || keyOf(request.dimension.id,request.cx,request.cz);
    const previous = observerCandidates.get(key);
    if (!previous || previous.dimension !== request.dimension || previous.y !== request.y) {
        observerCandidates.set(key,request);
        candidateList = undefined;
    }
}
function* cacheSnapshotCandidatesSteps(snapshot) {
    const dimension = dimensionFor(snapshot.dimensionId);
    if (!dimension) return;
    const y = snapshot.segments.length ? parseNodeRef(snapshot.segments[0].members[0]).y : 0;
    rememberCandidate({dimension,cx:snapshot.cx,cz:snapshot.cz,y});
    let counted = 0;
    for (const segment of snapshot.segments) for (const boundary of segment.boundaries) {
        const [cx,cz] = boundary.destination;
        rememberCandidate({dimension,cx,cz,y:parseNodeRef(boundary.ref).y || y});
        if (++counted % SLICE_BUILD === 0) yield;
    }
}
function* cacheCandidatesSteps(snapshots) {
    // Replaced on a full rebuild; a committed chunk only adds its own entries.
    // Never on a standing poll.
    observerCandidates = new Map();
    candidateList = undefined;
    for (const snapshot of snapshots) yield* cacheSnapshotCandidatesSteps(snapshot);
    for (const request of pending.values()) rememberCandidate(request);
    for (const request of retry.values()) rememberCandidate(request);
}

function retryDiscoveries() {
    let checked = 0;
    const limit = Math.min(CHUNK_OBSERVER_BUDGET,discoveryRetries.size);
    for (const [ref, entry] of discoveryRetries) {
        if (checked++ >= limit) break;
        const {dimension,position} = entry;
        // Rotate unavailable entries so later retries cannot starve.
        discoveryRetries.delete(ref);
        try {
            if (!loaded(dimension,position)) throw new Error("unloaded");
            const block = dimension.getBlock(position);
            if (!block?.isValid) throw new Error("unavailable");
            if (placementIndex.record(block) === false && KIND_BY_ID[block.type.id]) throw new Error("index unavailable");
            queueChunkRebuild(dimension,chunkOf(position.x),chunkOf(position.z),position.y);
        } catch { discoveryRetries.set(ref,entry); }
    }
}

// Player origins plus known destinations provide a bounded round-robin probe.
// Availability probes do not access Block objects. Standing in a loaded chunk
// does not reschedule it; unload/reload and explicit mutations do.
export function pollLoadedChunks() {
    graphBlocked = false;
    requestGraph();
    retryDiscoveries();
    for (const player of world.getAllPlayers()) {
        if (!player.isValid) continue;
        try {
            const { dimension, location } = player;
            const cx = chunkOf(location.x), cz = chunkOf(location.z);
            rememberCandidate({dimension,cx,cz,y:Math.floor(location.y)});
        } catch { /* Player disconnected during capture. */ }
    }
    const entries = candidateList ||= [...observerCandidates];
    if (!entries.length) return;
    for (let step = 0; step < Math.min(CHUNK_OBSERVER_BUDGET, entries.length); step++) {
        const [key, request] = entries[(pollOffset + step) % entries.length];
        const {dimension,cx,cz,y} = request;
        if (!loaded(dimension, {x:cx*16+8,y,z:cz*16+8})) { observed.delete(key); continue; }
        if (!observed.has(key) || retry.has(key)) {
            observed.add(key);
            queueChunkRebuild(dimension,cx,cz,y);
        }
    }
    pollOffset = (pollOffset + CHUNK_OBSERVER_BUDGET) % entries.length;
    schedule();
}

export function registerChunkController() {
    if (registered) return;
    placementIndex.subscribeChanges(({type,dimensionId,location}) => {
        const dimension = dimensionFor(dimensionId);
        if (dimension) queueChunkRebuild(dimension,chunkOf(location.x),chunkOf(location.z),location.y);
    });
    subscribeNetworkDiscovery(discovered);
    configureNetworkPersistence({
        sourceChanged: commitSourceState,
        topologyChanged(dimension, location) {
            queueChunkRebuild(dimension, chunkOf(location.x), chunkOf(location.z), location.y);
        },
        // Saved-metadata power of a live network: undefined while the graph is missing or being
        // changed (callers then keep the live result), otherwise any overlapping logical network.
        // A generator: a big network is read in slices.
        *resolvePowerSteps(network) {
            if (!graph || graphBusy) { requestGraph(); return undefined; }
            const known = graph;
            let found = false, powered = false, counted = 0;
            for (const ref of network.nodes) {
                const logical = known.nodeToNetwork.get(ref);
                if (logical) {
                    found = true; powered ||= logical.powered;
                    if (powered) break;
                }
                if (++counted % SLICE_NODES === 0) { yield; if (graphBusy || graph !== known) return undefined; }
            }
            return found ? powered : undefined;
        }
    });
    system.runInterval(pollLoadedChunks, CHUNK_OBSERVER_INTERVAL_TICKS);
    // Skipped writes of an unloaded chunk are re-applied about half a second after it returns.
    system.runInterval(catchUpPending, PENDING_CATCHUP_INTERVAL_TICKS);
    registered = true;
}
