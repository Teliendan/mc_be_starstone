// Persistent chunk-local electrical components. No world data is read on import.
// See docs/CHUNK-SEGMENTS.md in the mod repo for the recoverable page protocol.
import { world } from "@minecraft/server";
import { descriptorForBlock } from "./electricalBlocks.js";
import { worldDirOfPort } from "./portDirections.js";
import { ARM_NAMES, FACE_LIST } from "./constants.js";
import { nodeRef, chunkOf } from "./blockKeys.js";
import { faceNormal, negate, vecEquals } from "./surfaceFrame.js";
import { outerCornerOffset, outerOffsets, outerWrap, wrapFaces } from "./cornerTopology.js";
import { innerNeighborAllowed, facesOfPair } from "./innerCorner.js";

export const CHUNK_SCHEMA_VERSION = 1;
export const CHUNK_PROPERTY_PREFIX = "starstone:segments:";
export const CHUNK_SOURCES_PREFIX = "starstone:sources:";
export const CHUNK_MAX_OVERLAY_SOURCES = 256;
export const CHUNK_PAGE_BYTES = 24000;
export const CHUNK_MAX_PAGES = 4096;
const DIMENSION = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const INTEGER = /^(?:0|[1-9]\d*|-[1-9]\d*)$/;
const KINDS = new Set(["cable", "inner-corner", "bridge", "conduit", "source", "consumer", "adapter-in", "adapter-out"]);
const FACES = new Set(["up", "down", "north", "south", "east", "west"]);

export function parseSegmentNodeRef(ref) {
    if (typeof ref !== "string") return undefined;
    const match = /^([^|]+)\|([^|]+)\|([^|]+)\|([^|#]+)#(main|ns|ew)$/.exec(ref);
    if (!match || !DIMENSION.test(match[1]) || !match.slice(2, 5).every(value => INTEGER.test(value))) return undefined;
    const [x, y, z] = match.slice(2, 5).map(Number);
    if (![x, y, z].every(Number.isSafeInteger) || [x, y, z].some(value => Math.abs(value) > 2147483647)) return undefined;
    return { dimensionId: match[1], x, y, z, lane: match[5] };
}

function validChunk(dimensionId, cx, cz) {
    return typeof dimensionId === "string" && DIMENSION.test(dimensionId) && Number.isSafeInteger(cx) && Number.isSafeInteger(cz) &&
        Math.abs(cx) <= 134217727 && Math.abs(cz) <= 134217727;
}

// Shared by the local builder and metadata graph. Direction is from a to b.
// Reciprocal directions are necessary but do not override mounting rules. A
// conduit's axial port meets a surface's back or a tangent arm alike.
export function compatibleSegmentContacts(a, b, direction) {
    if (direction.reduce((sum, value) => sum + Math.abs(value), 0) === 2) {
        return Boolean(outerWrap(a,b,direction));
    }
    if (a.kind === "inner-corner" && !innerNeighborAllowed(a,b,direction)) return false;
    if (b.kind === "inner-corner" && !innerNeighborAllowed(b,a,negate(direction))) return false;
    if (a.mountFace && b.mountFace && a.mountFace !== b.mountFace) return false;
    return true;
}

function directions(descriptor, lane) {
    const ports = new Set(lane.ports);
    // A cable's visible mask can lose an arm when its neighbor unloads. Segment
    // topology records potential contacts; exact reciprocal metadata decides
    // whether a connection actually exists.
    if (descriptor.kind === "cable") for (const arm of ARM_NAMES) ports.add(arm);
    // The support may be across an unloaded horizontal border. Keep its
    // potential back contact; matching metadata will require a full source or
    // correctly oriented conduit. Bridges deliberately have no back contact.
    if (descriptor.mountFace && descriptor.kind !== "bridge") ports.add("back");
    const result = new Map();
    for (const port of ports) {
        const dir = worldDirOfPort(descriptor.mountFace, port);
        if (dir) result.set(dir.join(","), dir.map(value => value || 0));
        if (port !== "back" && dir) for (const around of outerOffsets(descriptor, dir)) result.set(around.join(","),around);
    }
    return [...result.values()];
}

function allowedContact(a, b, dir) {
    if (!compatibleSegmentContacts(a, b, dir)) return false;
    if (dir.reduce((sum, value) => sum + Math.abs(value), 0) === 2) return true;
    // Potential back contacts cannot join two surface elements, or an unrelated
    // full block. Tangent surface contacts still use the ordinary rules.
    for (const [surface, other, towardOther] of [[a, b, dir], [b, a, negate(dir)]]) {
        if (surface.mountFace && vecEquals(worldDirOfPort(surface.mountFace, "back"), towardOther) &&
            (other.mountFace || (other.kind !== "conduit" && other.kind !== "source"))) return false;
    }
    return true;
}

export { allowedContact as reciprocalSegmentContact };

// Pure construction from validated, complete indexed observations in one chunk.
// The stable local key is its lexicographically smallest lane-aware NodeRef;
// input order and source/visual state changes therefore do not change the key.
export function buildChunkSegments(dimensionId, cx, cz, entries) {
    if (!validChunk(dimensionId, cx, cz)) throw new Error("Invalid segment chunk");
    const nodes = new Map(), byPosition = new Map();
    for (const { location, descriptor } of entries) {
        if (!descriptor) continue;
        for (const lane of descriptor.lanes) {
            const ref = nodeRef(dimensionId, location, lane.id);
            if (!parseSegmentNodeRef(ref) || chunkOf(location.x) !== cx || chunkOf(location.z) !== cz || nodes.has(ref)) {
                throw new Error("Invalid or duplicate segment member");
            }
            const item = { ref, location, descriptor, lane, directions: directions(descriptor, lane), neighbors: new Set(), boundaries: [] };
            nodes.set(ref, item);
            const key = `${location.x}|${location.y}|${location.z}`;
            if (!byPosition.has(key)) byPosition.set(key, []);
            byPosition.get(key).push(item);
        }
    }
    for (const item of nodes.values()) {
        const { x, y, z } = item.location;
        for (const dir of item.directions) {
            const [nx, ny, nz] = [x + dir[0], y + dir[1], z + dir[2]];
            if (chunkOf(nx) !== cx || chunkOf(nz) !== cz) {
                item.boundaries.push({
                    ref: item.ref, direction: [...dir], destination: [chunkOf(nx), chunkOf(nz)],
                    kind: item.descriptor.kind, mountFace: item.descriptor.mountFace || null,
                    facePair: item.descriptor.facePair || null
                });
                continue;
            }
            for (const neighbor of byPosition.get(`${nx}|${ny}|${nz}`) || []) {
                if (allowedContact(item.descriptor, neighbor.descriptor, dir) && neighbor.directions.some(other => vecEquals(other, negate(dir)))) {
                    item.neighbors.add(neighbor.ref);
                }
            }
        }
    }
    const visited = new Set(), segments = [];
    for (const seed of [...nodes.keys()].sort()) {
        if (visited.has(seed)) continue;
        const queue = [seed], members = [], sources = [], activeSources = [], consumers = [], boundaries = [];
        visited.add(seed);
        for (let head = 0; head < queue.length; head++) {
            const item = nodes.get(queue[head]);
            members.push(item.ref);
            if (item.descriptor.kind === "source" || item.descriptor.kind === "adapter-in") sources.push(item.ref);
            if (item.lane.sourceOn) {
                if (!sources.includes(item.ref)) sources.push(item.ref);
                activeSources.push(item.ref);
            }
            if (item.descriptor.kind === "consumer" || item.descriptor.kind === "adapter-out") consumers.push(item.ref);
            boundaries.push(...item.boundaries);
            for (const neighbor of item.neighbors) if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
        members.sort(); sources.sort(); activeSources.sort(); consumers.sort();
        boundaries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        segments.push({ key: members[0], members, sources, activeSources, consumers, boundaries });
    }
    return { v: CHUNK_SCHEMA_VERSION, dimensionId, cx, cz, segments };
}

// Generator reads only explicitly loaded indexed locations. A single unavailable
// indexed position makes the result undefined, preserving the prior whole-chunk
// snapshot. A guarded Block view also protects descriptor support lookups.
export function* buildIndexedChunkSegments(dimension, cx, cz, placementIndex, { onStale } = {}) {
    const entries = [];
    // The snapshot never depends on the support: directions() always adds the
    // potential back contact. Skip the descriptor's support read.
    const noSupport = { getBlock() { return undefined; } };
    for (const location of placementIndex.positionsInChunk(dimension.id, cx, cz)) {
        let block;
        try {
            if (!dimension.isChunkLoaded(location)) return undefined;
            block = dimension.getBlock(location);
            if (!block?.isValid) return undefined;
        } catch { return undefined; }
        const descriptor = descriptorForBlock({
            isValid: true, type: block.type, location: { ...location },
            permutation: block.permutation, dimension: noSupport
        });
        if (descriptor) entries.push({ location: { ...location }, descriptor });
        else onStale?.({ ...location });
        yield;
    }
    return buildChunkSegments(dimension.id, cx, cz, entries);
}

// Strict validation is shared by disk reads and pure graph input. A corrupt
// chunk is never partly admitted as a valid logical conductor.
export function validateChunkSegments(snapshot) {
    if (!snapshot || snapshot.v !== CHUNK_SCHEMA_VERSION || !validChunk(snapshot.dimensionId, snapshot.cx, snapshot.cz) || !Array.isArray(snapshot.segments)) return false;
    const allMembers = new Set(), keys = new Set();
    for (const segment of snapshot.segments) {
        if (!segment || !Array.isArray(segment.members) || !segment.members.length || keys.has(segment.key)) return false;
        keys.add(segment.key);
        const members = new Set();
        for (const ref of segment.members) {
            const p = parseSegmentNodeRef(ref);
            if (!p || p.dimensionId !== snapshot.dimensionId || chunkOf(p.x) !== snapshot.cx || chunkOf(p.z) !== snapshot.cz || allMembers.has(ref)) return false;
            members.add(ref); allMembers.add(ref);
        }
        if (segment.key !== [...members].sort()[0]) return false;
        for (const field of ["sources", "activeSources", "consumers"]) {
            if (!Array.isArray(segment[field]) || new Set(segment[field]).size !== segment[field].length || segment[field].some(ref => !members.has(ref))) return false;
        }
        if (segment.activeSources.some(ref => !segment.sources.includes(ref)) || !Array.isArray(segment.boundaries)) return false;
        const seenBoundaries = new Set();
        for (const port of segment.boundaries) {
            if (!port || !members.has(port.ref) || !Array.isArray(port.direction) || port.direction.length !== 3 ||
                !port.direction.every(v => Number.isInteger(v) && Math.abs(v) <= 1) ||
                ![1,2].includes(port.direction.reduce((n, v) => n + Math.abs(v), 0)) ||
                !Array.isArray(port.destination) || port.destination.length !== 2 || !KINDS.has(port.kind) ||
                (port.mountFace !== null && !FACES.has(port.mountFace))) return false;
            const p = parseSegmentNodeRef(port.ref), [dx, , dz] = port.direction;
            const destination = [chunkOf(p.x + dx), chunkOf(p.z + dz)];
            if (!vecEquals(destination, port.destination) || (destination[0] === snapshot.cx && destination[1] === snapshot.cz)) return false;
            if (port.kind === "bridge" && (p.lane === "main" || !port.mountFace || vecEquals(worldDirOfPort(port.mountFace, "back"), port.direction))) return false;
            if (port.kind !== "bridge" && p.lane !== "main") return false;
            const diagonal = port.direction.reduce((n,v)=>n+Math.abs(v),0) === 2;
            if (port.kind === "inner-corner" &&
                (port.mountFace !== null || !facesOfPair(port.facePair) || (!diagonal &&
                 !facesOfPair(port.facePair).some(face=>
                     innerNeighborAllowed(port,{mountFace:face},port.direction))))) return false;
            if (["cable", "bridge", "consumer", "adapter-in", "adapter-out"].includes(port.kind) && !port.mountFace) return false;
            if (diagonal && !wrapFaces(port).some(from => FACE_LIST.some(face => {
                    const offset = outerCornerOffset(from,face);
                    return offset && vecEquals(offset,port.direction);
                }))) return false;
            if (port.kind === "conduit" && port.mountFace) return false;
            if (port.kind === "bridge") {
                const arms = p.lane === "ns" ? ["local_n", "local_s"] : ["local_e", "local_w"];
                // A diagonal port leaves through the arm toward the wrapped edge.
                const normal = faceNormal(port.mountFace);
                const armDir = diagonal ? port.direction.map((v, i) => v + normal[i]) : port.direction;
                if (!arms.some(arm => vecEquals(worldDirOfPort(port.mountFace, arm), armDir))) return false;
            }
            const key = `${port.ref}|${port.direction.join(",")}`;
            if (seenBoundaries.has(key)) return false;
            seenBoundaries.add(key);
        }
    }
    return true;
}

function checksum(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(16);
}

function propertyBase(dimensionId, cx, cz) {
    if (!validChunk(dimensionId, cx, cz)) throw new Error("Invalid segment chunk");
    return `${CHUNK_PROPERTY_PREFIX}${encodeURIComponent(dimensionId)}|${cx}|${cz}`;
}

function parseHead(raw) {
    if (typeof raw !== "string") throw new Error("Invalid segment head");
    const head = JSON.parse(raw);
    if (!head || head.v !== CHUNK_SCHEMA_VERSION || ![0, 1].includes(head.bank) || !Number.isInteger(head.pages) ||
        head.pages < 1 || head.pages > CHUNK_MAX_PAGES || !Number.isInteger(head.length) || head.length < 1 ||
        Math.ceil(head.length / CHUNK_PAGE_BYTES) !== head.pages || typeof head.checksum !== "string" || !/^[a-f0-9]{1,8}$/.test(head.checksum)) throw new Error("Invalid segment head");
    return head;
}

// Freeze cached snapshots so a caller cannot change the committed state in RAM.
function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const item of Object.values(value)) deepFreeze(item);
    }
    return value;
}

// Only writeChunk and updateSource write these properties, so RAM mirrors disk after
// one lazy scan. known: property base -> frozen committed snapshot, or undefined
// (absent/corrupt). texts: base -> the committed (escaped) JSON text, so an unchanged
// write is recognised without any property read. checksums: base -> that text's checksum.
//
// Source overlay (schema v1 unchanged): a toggle writes only
//   starstone:sources:<encoded dimension>|cx|cz = {"v":1,"base":<head checksum>,"on":[sorted refs]}
// and readChunk/chunks() return the snapshot with every segment's activeSources taken from
// it (filtered to that segment's sources). A rebuild commit writes the full snapshot (its
// activeSources come from block state) and deletes the overlay; the `base` checksum makes a
// leftover overlay of an older snapshot inert. An older mod version ignores the overlay and
// sees the last rebuilt source state. overlays: base -> Set of active refs; views: base ->
// frozen snapshot with the overlay applied (only where it differs from the committed one).
export function createChunkIndex(storage, { warn = message => console.warn(message) } = {}) {
    const warned = new Set(), known = new Map(), texts = new Map(), checksums = new Map();
    const overlays = new Map(), views = new Map();
    let scanned = false, overlayIds; // overlayIds: overlay keys seen by the scan, kept current
    function corrupt(key) {
        if (warned.has(key)) return;
        warned.add(key);
        try { warn(`[Starstone] Ignoring corrupt segment chunk ${key}`); } catch { /* Diagnostic only. */ }
    }
    const overlayKey = base => `${CHUNK_SOURCES_PREFIX}${base.slice(CHUNK_PROPERTY_PREFIX.length)}`;
    const visible = base => views.get(base) ?? known.get(base);
    function load(base, dimensionId, cx, cz) {
        const rawHead = storage.getDynamicProperty(`${base}:head`);
        if (rawHead === undefined) return undefined;
        let head;
        try { head = parseHead(rawHead); } catch { corrupt(base); return undefined; }
        const parts = [];
        for (let i = 0; i < head.pages; i++) {
            const part = storage.getDynamicProperty(`${base}:${head.bank}:${i}`);
            const expected = Math.min(CHUNK_PAGE_BYTES, head.length - i * CHUNK_PAGE_BYTES);
            if (typeof part !== "string" || part.length !== expected || /[^\x00-\x7f]/.test(part)) { corrupt(base); return undefined; }
            parts.push(part);
        }
        const text = parts.join("");
        try {
            if (checksum(text) !== head.checksum) throw new Error("Segment checksum mismatch");
            const snapshot = JSON.parse(text);
            if (!validateChunkSegments(snapshot) || snapshot.dimensionId !== dimensionId || snapshot.cx !== cx || snapshot.cz !== cz) throw new Error("Invalid segment snapshot");
            texts.set(base, text);
            checksums.set(base, head.checksum);
            return deepFreeze(snapshot);
        } catch { corrupt(base); return undefined; }
    }
    // The saved overlay of a chunk, applied to its freshly loaded snapshot. A corrupt
    // overlay warns once and is ignored: the snapshot's own value wins. An overlay of an
    // older snapshot (different base checksum) is inert, not corrupt.
    function loadOverlay(base) {
        const key = overlayKey(base);
        if (overlayIds && !overlayIds.has(key)) return;
        const raw = storage.getDynamicProperty(key);
        if (raw === undefined) return;
        try {
            const value = JSON.parse(raw);
            if (!value || value.v !== 1 || typeof value.base !== "string" || !Array.isArray(value.on) ||
                value.on.length > CHUNK_MAX_OVERLAY_SOURCES || value.on.some(ref => !parseSegmentNodeRef(ref))) throw new Error("Invalid source overlay");
            if (value.base !== checksums.get(base)) return;
            setOverlay(base, new Set(value.on));
        } catch { corrupt(key); }
    }
    function applyOverlay(snapshot, on) {
        let differs = false;
        const segments = snapshot.segments.map(segment => {
            const wanted = segment.sources.filter(ref => on.has(ref)).sort();
            if (wanted.length === segment.activeSources.length && wanted.every((ref, i) => ref === segment.activeSources[i])) return segment;
            differs = true;
            return { ...segment, activeSources: wanted };
        });
        return differs ? deepFreeze({ ...snapshot, segments }) : snapshot;
    }
    function setOverlay(base, on) {
        const view = applyOverlay(known.get(base), on);
        overlays.set(base, on);
        if (view === known.get(base)) views.delete(base); else views.set(base, view);
    }
    function dropOverlay(base) { overlays.delete(base); views.delete(base); }
    function readChunk(dimensionId, cx, cz) {
        const base = propertyBase(dimensionId, cx, cz);
        // Storage exceptions propagate and leave nothing cached.
        if (!known.has(base)) {
            known.set(base, load(base, dimensionId, cx, cz));
            if (known.get(base)) loadOverlay(base);
        }
        return visible(base);
    }
    // `trusted`: the caller built the snapshot from a validated cached one
    // (updateSource), so the schema check is skipped.
    function writeChunk(snapshot, { trusted = false } = {}) {
        if (!trusted && !validateChunkSegments(snapshot)) throw new Error("Invalid segment snapshot");
        const base = propertyBase(snapshot.dimensionId, snapshot.cx, snapshot.cz);
        const text = JSON.stringify(snapshot).replace(/[\u007f-￿]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
        const pages = Math.ceil(text.length / CHUNK_PAGE_BYTES);
        if (pages > CHUNK_MAX_PAGES) throw new Error("Segment chunk exceeds page limit");
        const sameBase = () => known.get(base) !== undefined && texts.get(base) === text;
        // Same topology text: nothing to rewrite, but a rebuild reads the block state, which
        // wins over a pending source overlay (and clears it).
        const settleUnchanged = () => {
            if (!overlays.has(base)) return { changed: false };
            const differs = views.has(base);
            storage.setDynamicProperty(overlayKey(base), undefined);
            overlayIds?.delete(overlayKey(base));
            dropOverlay(base);
            return { changed: differs };
        };
        // Unchanged: compare with the committed text before reading anything.
        if (sameBase()) return settleUnchanged();
        const rawHead = storage.getDynamicProperty(`${base}:head`);
        let oldHead;
        if (rawHead !== undefined) {
            try { oldHead = parseHead(rawHead); } catch { corrupt(base); }
        }
        readChunk(snapshot.dimensionId, snapshot.cx, snapshot.cz);
        if (sameBase()) return settleUnchanged();
        const bank = oldHead ? 1 - oldHead.bank : 0;
        for (let i = 0; i < pages; i++) storage.setDynamicProperty(`${base}:${bank}:${i}`, text.slice(i * CHUNK_PAGE_BYTES, (i + 1) * CHUNK_PAGE_BYTES));
        // The sole commit point. Until this succeeds all readers retain the
        // previous complete bank. Exceptions propagate; no RAM state is advanced.
        const sum = checksum(text);
        storage.setDynamicProperty(`${base}:head`, JSON.stringify({ v: CHUNK_SCHEMA_VERSION, bank, pages, length: text.length, checksum: sum }));
        // Cache what a disk read would now return, never the caller's object.
        known.set(base, deepFreeze(JSON.parse(text)));
        texts.set(base, text);
        checksums.set(base, sum);
        dropOverlay(base);
        // The new head already makes an old overlay inert (its base differs); deleting it is cleanup.
        const key = overlayKey(base);
        if (!overlayIds || overlayIds.has(key)) {
            try { storage.setDynamicProperty(key, undefined); overlayIds?.delete(key); }
            catch (error) { try { warn(`[Starstone] Could not delete source overlay ${key}: ${error.message}`); } catch { /* Diagnostic only. */ } }
        }
        return { changed: true };
    }
    function* chunks() {
        if (!scanned) {
            const ids = [...storage.getDynamicPropertyIds()];
            overlayIds = new Set(ids.filter(key => typeof key === "string" && key.startsWith(CHUNK_SOURCES_PREFIX)));
            for (const key of ids) {
                if (typeof key !== "string" || !key.startsWith(CHUNK_PROPERTY_PREFIX) || !key.endsWith(":head")) continue;
                const parts = key.slice(CHUNK_PROPERTY_PREFIX.length, -5).split("|");
                let dimensionId;
                try { dimensionId = decodeURIComponent(parts[0]); } catch { corrupt(key); continue; }
                if (parts.length !== 3 || !parts.slice(1).every(p => INTEGER.test(p)) || !validChunk(dimensionId, Number(parts[1]), Number(parts[2])) || encodeURIComponent(dimensionId) !== parts[0]) { corrupt(key); continue; }
                readChunk(dimensionId, Number(parts[1]), Number(parts[2]));
            }
            scanned = true;
        }
        for (const base of [...known.keys()]) { const snapshot = visible(base); if (snapshot) yield snapshot; }
    }
    // Patch a known source's on/off summary without any block read. Writes only the
    // small overlay property; a chunk with very many sources falls back to a full write.
    function updateSource(ref, on) {
        const p = parseSegmentNodeRef(ref);
        if (!p || typeof on !== "boolean") return false;
        const snapshot = readChunk(p.dimensionId, chunkOf(p.x), chunkOf(p.z));
        const segment = snapshot?.segments.find(s => s.sources.includes(ref));
        if (!segment) return false;
        const base = propertyBase(p.dimensionId, chunkOf(p.x), chunkOf(p.z));
        const active = new Set(snapshot.segments.flatMap(s => s.activeSources));
        if (active.has(ref) === on) return true;
        if (on) active.add(ref); else active.delete(ref);
        if (active.size > CHUNK_MAX_OVERLAY_SOURCES) {
            // Cached snapshots are frozen: write a changed copy.
            const next = new Set(segment.activeSources);
            if (on) next.add(ref); else next.delete(ref);
            const changed = { ...segment, activeSources: [...next].sort() };
            writeChunk({ ...snapshot, segments: snapshot.segments.map(s => s === segment ? changed : s) }, { trusted: true });
            return true;
        }
        const key = overlayKey(base);
        const committed = new Set(known.get(base).segments.flatMap(s => s.activeSources));
        if (active.size === committed.size && [...active].every(item => committed.has(item))) {
            // Back at the committed state: no overlay needed.
            if (overlays.has(base)) { storage.setDynamicProperty(key, undefined); overlayIds?.delete(key); }
            dropOverlay(base);
        } else {
            storage.setDynamicProperty(key, JSON.stringify({ v: 1, base: checksums.get(base), on: [...active].sort() }));
            overlayIds?.add(key);
            setOverlay(base, active);
        }
        return true;
    }
    return { readChunk, writeChunk, chunks, updateSource };
}

export const chunkIndex = createChunkIndex(world);
