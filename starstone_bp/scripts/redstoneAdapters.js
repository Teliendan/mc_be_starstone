import { system } from "@minecraft/server";
import { REDSTONE_INPUT_ID, REDSTONE_OUTPUT_ID, STATE_POWERED, STATE_CONNECTIONS } from "./constants.js";
import { ARM_NAMES, worldOffset } from "./surfaceFrame.js";
import { cableConnectionMask } from "./cableTopology.js";
import { descriptorForBlock, cableDescriptor } from "./electricalBlocks.js";
import { CABLE_ID } from "./constants.js";
import { blockKey, parseNodeRef } from "./blockKeys.js";
import runtime, { isCompleteNetwork } from "./networkRuntime.js";
import { anySourceOn } from "./networkController.js";
import { applyPower } from "./powerPropagation.js";
import { sourceChanged, subscribeNetworkDiscovery } from "./networkEvents.js";

export const INPUT_RECHECK_TICKS = 100; // Recovery/cosmetics; native events own signal changes.
export const INPUT_RECHECK_BATCH = 32;
const inputs = new Map();
const rechecks = new Set();
let registered = false, lastPolled = 0, transitions = 0;
let inputTimer;
let recheckScheduled = false;

function syncInputTimer() {
    if (registered && inputs.size && inputTimer === undefined) inputTimer = system.runInterval(recheckInputs, INPUT_RECHECK_TICKS);
    else if (!inputs.size && inputTimer !== undefined) { system.clearRun(inputTimer); inputTimer = undefined; }
}

export function trackInput(block) {
    if (!block?.isValid || block.typeId !== REDSTONE_INPUT_ID) return;
    const key = blockKey(block.dimension, block.location);
    if (!inputs.has(key)) {
        inputs.set(key, { dimension: block.dimension, location: { ...block.location }, last: undefined });
        rechecks.add(key);
        scheduleRechecks();
    }
    syncInputTimer();
    return inputs.get(key);
}

export function adapterStats() {
    return { mode: "native", registeredInputs: inputs.size, lastPolled, transitions,
        interval: INPUT_RECHECK_TICKS, recheckBudget: INPUT_RECHECK_BATCH, queuedRechecks: rechecks.size };
}

// The blue contacts follow the same coplanar network edges as cable. Red
// contacts are independent: they indicate a neighboring redstone conductor or
// source even when that neighbor currently carries zero power.
const REDSTONE_CONTACTS = new Set([
    "minecraft:redstone_wire", "minecraft:redstone_block", "minecraft:redstone_torch",
    "minecraft:unlit_redstone_torch", "minecraft:repeater", "minecraft:powered_repeater",
    "minecraft:unpowered_repeater", "minecraft:comparator", "minecraft:powered_comparator",
    "minecraft:unpowered_comparator", "minecraft:lever", "minecraft:stone_button",
    "minecraft:wooden_button", "minecraft:tripwire_hook", "minecraft:observer",
    "minecraft:daylight_detector", "minecraft:daylight_detector_inverted"
]);
function isRedstoneContact(block) {
    if (!block?.isValid || block.typeId?.startsWith("starstone:")) return false;
    if (REDSTONE_CONTACTS.has(block.typeId)) return true;
    try { return (block.getRedstonePower?.() ?? 0) > 0; } catch { return false; }
}
export function redstoneContactMask(block) {
    const face = block?.permutation?.getState("minecraft:block_face");
    if (!face) return 0;
    let mask = 0;
    for (let i = 0; i < ARM_NAMES.length; i++) {
        const [dx,dy,dz] = worldOffset(face, ARM_NAMES[i]);
        const { x,y,z } = block.location;
        const position = { x:x+dx, y:y+dy, z:z+dz };
        try {
            if (block.dimension.isChunkLoaded?.(position) === false) continue;
            if (isRedstoneContact(block.dimension.getBlock(position))) mask |= 1 << i;
        } catch { /* Unknown neighbor is not a visual contact. */ }
    }
    return mask;
}
export function refreshAdapterVisuals(block) {
    if (!block?.isValid || (block.typeId !== REDSTONE_INPUT_ID && block.typeId !== REDSTONE_OUTPUT_ID)) return;
    const face = block.permutation.getState("minecraft:block_face");
    const neighbors = {};
    for (const arm of ARM_NAMES) {
        const [dx,dy,dz] = worldOffset(face,arm);
        const {x,y,z} = block.location;
        const position = {x:x+dx,y:y+dy,z:z+dz};
        try {
            if (block.dimension.isChunkLoaded?.(position) === false) continue;
            const adjacent = block.dimension.getBlock(position);
            if (!adjacent?.isValid) continue;
            neighbors[arm] = adjacent.typeId === CABLE_ID
                ? cableDescriptor({mountFace:adjacent.permutation.getState("minecraft:block_face"),connections:15})
                : descriptorForBlock(adjacent);
        } catch { /* An unavailable neighbor is not a visual contact. */ }
    }
    const blue = cableConnectionMask(face,neighbors);
    const red = redstoneContactMask(block);
    let permutation = block.permutation;
    if (permutation.getState(STATE_CONNECTIONS) !== blue) permutation = permutation.withState(STATE_CONNECTIONS,blue);
    if (permutation.getState("starstone:redstone_connections") !== red) permutation = permutation.withState("starstone:redstone_connections",red);
    if (permutation !== block.permutation) block.setPermutation(permutation);
}

// A discovered network already has a source index. Registration reads only
// those source positions, never all cable nodes or a surrounding volume.
function observeSources(network, dimension) {
    for (const ref of network.sources) {
        const p = parseNodeRef(ref);
        if (!p || p.dimensionId !== dimension.id) continue;
        try {
            if (dimension.isChunkLoaded(p)) trackInput(dimension.getBlock(p));
        } catch { /* A later discovery will retry an unavailable source. */ }
    }
}

function commitInput(block, input, on, visualsReady = false) {
    if (on === input.last && on === Boolean(block.permutation.getState(STATE_POWERED))) return;
    if (!visualsReady) refreshAdapterVisuals(block);
    if (Boolean(block.permutation.getState(STATE_POWERED)) !== on) {
        block.setPermutation(block.permutation.withState(STATE_POWERED, on));
    }
    const { dimension, location } = block;
    // Preserve the existing durable source owner and loaded-network fallback.
    const committed = sourceChanged(dimension, location, on);
    const key = blockKey(dimension, location);
    const network = runtime.networkOf(runtime.networkIdOf(`${key}#main`));
    if (!committed || isCompleteNetwork(network, dimension)) {
        if (network) {
            const powered = anySourceOn(network, dimension);
            if (powered !== network.powered) {
                network.powered = powered;
                applyPower(network, dimension);
            }
        }
    }
    input.last = on;
    transitions++;
}

// Called by the existing surface component, only on the native input consumer.
// Compare against committed/live state, not previousPowerLevel (previous tick).
export function reactToRedstoneUpdate(event) {
    const block = event.block;
    const input = trackInput(block);
    if (!input) return;
    try { commitInput(block, input, event.powerLevel > 0); }
    catch (error) { console.warn(`[Starstone] Native input update deferred: ${error.message}`); }
}

function scheduleRechecks() {
    if (recheckScheduled || !rechecks.size) return;
    recheckScheduled = true;
    try { system.run(processRechecks); }
    catch (error) { recheckScheduled = false; throw error; }
}

function processRechecks() {
    lastPolled = 0;
    let visited = 0;
    for (const key of rechecks) {
        if (visited++ >= INPUT_RECHECK_BATCH) break;
        rechecks.delete(key);
        const input = inputs.get(key);
        if (!input) continue;
        const { dimension, location } = input;
        try {
            if (!dimension.isChunkLoaded(location)) continue;
            const block = dimension.getBlock(location);
            if (!block?.isValid) continue;
            if (block.typeId !== REDSTONE_INPUT_ID) { inputs.delete(key); continue; }
            refreshAdapterVisuals(block);
            // Recovery uses receiver power too. Undefined does not establish off.
            const power = block.getRedstonePower();
            if (power === undefined) continue;
            lastPolled++;
            commitInput(block, input, power > 0, true);
        } catch (error) {
            // Preserve the last committed input value so a transient storage
            // or world-access failure retries instead of silently losing power.
            console.warn(`[Starstone] Input recovery deferred: ${error.message}`);
        }
    }
    recheckScheduled = false;
    syncInputTimer();
    scheduleRechecks();
}

export function recheckInputs() {
    for (const key of inputs.keys()) rechecks.add(key);
    scheduleRechecks();
}

export function registerRedstoneAdapters() {
    if (registered) return;
    subscribeNetworkDiscovery(observeSources);
    registered = true;
    syncInputTimer();
}
