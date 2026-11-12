// Canonical coordinate strings shared by controllers and persistent metadata.
export function blockKey(dimension, location) {
    const id = typeof dimension === "string" ? dimension : dimension.id;
    const { x, y, z } = location;
    if (typeof id !== "string" || /[|#]/.test(id) || ![x,y,z].every(Number.isSafeInteger)) {
        throw new Error("Invalid block key");
    }
    return `${id}|${x}|${y}|${z}`;
}

// Node refs are "<dimension>|<x>|<y>|<z>#<lane>". The mod builds every ref itself from
// engine dimension ids and integer block locations, so these helpers do not validate;
// refs read back from storage go through the strict parser in chunkIndex.js.
export const LANE_IDS = ["main", "ns", "ew"];

export const chunkOf = value => Math.floor(value / 16);

// The 18 offsets that can hold a connected neighbour: 6 face and 12 edge (diagonal) cells.
export const NEIGHBOR_OFFSETS_18 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
for (let axis = 0; axis < 3; axis++) for (let other = axis + 1; other < 3; other++) {
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const offset = [0, 0, 0]; offset[axis] = a; offset[other] = b;
        NEIGHBOR_OFFSETS_18.push(offset);
    }
}

// The ref of one lane of a block whose "<dimension>|<x>|<y>|<z>" key is already built.
export const laneRef = (key, lane) => `${key}#${lane}`;

export function nodeRef(dimension, location, lane = "main") {
    const id = typeof dimension === "string" ? dimension : dimension.id;
    return `${id}|${location.x}|${location.y}|${location.z}#${lane}`;
}

export function parseBlockKey(key) {
    if (typeof key !== "string") return undefined;
    const parts = key.split("|");
    if (parts.length !== 4 || !parts[0] || /[#]/.test(parts[0]) ||
        !parts.slice(1).every(value => /^(0|-?[1-9]\d*)$/.test(value))) return undefined;
    const [x, y, z] = parts.slice(1).map(Number);
    if (![x,y,z].every(Number.isSafeInteger)) return undefined;
    return { dimensionId: parts[0], x, y, z };
}

// Split an internally built ref into { dimensionId, x, y, z, lane } (no validation).
export function parseNodeRef(ref) {
    const hash = ref.lastIndexOf("#");
    const key = ref.slice(0, hash);
    const a = key.indexOf("|"), b = key.indexOf("|", a + 1), c = key.indexOf("|", b + 1);
    return {
        dimensionId: key.slice(0, a),
        x: Number(key.slice(a + 1, b)), y: Number(key.slice(b + 1, c)), z: Number(key.slice(c + 1)),
        lane: ref.slice(hash + 1)
    };
}
