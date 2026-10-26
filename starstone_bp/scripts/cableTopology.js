// cableTopology.js
//
// Pure cable neighbor rules for Task 2.1. Given a cable mounting face and the
// four neighbor descriptors found along that cable's local arms, return the
// 0..15 coplanar connection mask.
//
// The four connection bits are local to the cable surface and match the cable
// model in GRAPHICS.md:
//
//   1 = local_n   (north arm)
//   2 = local_e   (east arm)
//   4 = local_s   (south arm)
//   8 = local_w   (west arm)
//
// A bit is set only when the neighbor in that direction has a reciprocal port on
// the same surface: the neighbor mounts on the same face and exposes a port whose
// world direction points back at this cable. Full blocks without a mount face
// (generator, conduit) count when one of their world ports faces the cable, so
// a cable reaches a conduit's end from beside it, not only from its face.

import { worldOffset } from "./surfaceFrame.js";
import { worldDirOfPort } from "./portDirections.js";
import { innerNeighborAllowed } from "./innerCorner.js";

export const ARM_NAMES = ["local_n", "local_e", "local_s", "local_w"];

export const ARM_BITS = {
    local_n: 1,
    local_e: 2,
    local_s: 4,
    local_w: 8
};

// World vectors for the world_* port names, in Bedrock axes (+X east, +Y up,
// +Z south). Only used for descriptors that express ports in world space.
const WORLD_PORTS = {
    world_up: [0, 1, 0],
    world_down: [0, -1, 0],
    world_north: [0, 0, -1],
    world_south: [0, 0, 1],
    world_east: [1, 0, 0],
    world_west: [-1, 0, 0]
};

function negate(v) {
    return [-v[0], -v[1], -v[2]];
}

function vecEquals(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

// World direction of a single port on the neighbor's own surface. The neighbor
// shares this cable's mounting face, so its local frame is identical.
function portWorldDir(face, port) {
    if (port in WORLD_PORTS) {
        return WORLD_PORTS[port];
    }
    return worldOffset(face, port);
}

// True when the neighbor exposes a port pointing back at this cable, i.e. a
// reciprocal port on the same surface, or a full block's port facing it.
export function hasReciprocalPort(face, neighbor, recipWorldDir) {
    if (!neighbor || !neighbor.lanes) {
        return false;
    }
    if (neighbor.kind === "inner-corner" &&
        !innerNeighborAllowed(neighbor,{mountFace:face},recipWorldDir)) return false;
    if (neighbor.mountFace && neighbor.mountFace !== face) return false;
    for (const lane of neighbor.lanes) {
        if (!lane || !lane.ports) {
            continue;
        }
        for (const port of lane.ports) {
            const direction = worldDirOfPort(neighbor.mountFace, port);
            if (direction && vecEquals(direction, recipWorldDir)) {
                return true;
            }
        }
    }
    return false;
}

// The four neighbor descriptors keyed by local arm name, each either undefined
// (no neighbor there) or a descriptor:
//
//   { kind, mountFace, lanes: [{ id, ports: Set<portName> }] }
//
// Returns the 0..15 connection mask for this cable's surface.
export function cableConnectionMask(face, neighbors) {
    let mask = 0;
    for (const arm of ARM_NAMES) {
        const neighbor = neighbors[arm];
        if (!neighbor) {
            continue;
        }
        const armWorldDir = worldOffset(face, arm);
        const recipWorldDir = negate(armWorldDir);
        if (hasReciprocalPort(face, neighbor, recipWorldDir)) {
            mask |= ARM_BITS[arm];
        }
    }
    return mask;
}

export default {
    ARM_NAMES,
    ARM_BITS,
    WORLD_PORTS,
    hasReciprocalPort,
    cableConnectionMask
};
