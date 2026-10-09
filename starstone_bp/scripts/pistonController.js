// Native movement handles full cubes and pops mounted devices. This observer
// preserves original support relationships and repairs the electrical indexes
// after the engine has finished moving blocks.
import { system, world } from "@minecraft/server";
import { createSupportMotionService } from "./support_motion_service.js";
import { KIND_BY_ID, GENERATOR_ID, CONDUIT_ID, INNER_CORNER_ID } from "./constants.js";
import { innerSupports, pairFromPermutation } from "./innerCorner.js";
import { mountFace, isFaceSupportValid } from "./support.js";
import { supportOffset } from "./surfaceFrame.js";
import { placementIndex } from "./persistence.js";
import { queueMutation } from "./mutationController.js";
import { scheduleAffected } from "./cableComponent.js";

// Measured by the six-direction engine calibration on Bedrock 1.26.52.
export const PISTON_AXES = Object.freeze([
    { x:0, y:-1, z:0 }, { x:0, y:1, z:0 },
    { x:0, y:0, z:1 }, { x:0, y:0, z:-1 },
    { x:1, y:0, z:0 }, { x:-1, y:0, z:0 }
]);
export function readPistonBlock(dimension, position) {
    try {
        if (dimension.isChunkLoaded?.(position) === false) return undefined;
        const block = dimension.getBlock(position);
        return block?.isValid ? block : undefined;
    } catch { return undefined; }
}
export function describePistonBlock(block) {
    if (!block?.isValid || !KIND_BY_ID[block.typeId]) return undefined;
    if (block.typeId === GENERATOR_ID || block.typeId === CONDUIT_ID) {
        return { identity: block.typeId, supports: [], movable: true };
    }
    const face = mountFace(block);
    const pair = block.typeId === INNER_CORNER_ID ? pairFromPermutation(block.permutation) : undefined;
    const supports = block.typeId === INNER_CORNER_ID ? innerSupports(block.location, pair) : (() => {
        if (!face) return undefined;
        const [x,y,z] = supportOffset(face);
        return [{ face, position: { x:block.location.x+x, y:block.location.y+y, z:block.location.z+z } }];
    })();
    if (!supports?.length) return undefined;
    return {
        identity: `${block.typeId}|${pair || face}`, movable: false,
        supports: supports.map(({face: selected, position}) => ({ position, valid: support => isFaceSupportValid(support, selected) }))
    };
}
export const pistonSupport = createSupportMotionService({
    now: () => system.currentTick,
    schedule: (callback, delay = 1) => {
        function step() { if (--delay <= 0) callback(); else system.run(step); }
        system.run(step);
    },
    read: readPistonBlock,
    describe: describePistonBlock,
    remove(block) {
        const { dimension, location: p } = block;
        dimension.runCommand(`setblock ${p.x} ${p.y} ${p.z} air destroy`);
        try { placementIndex.remove(dimension.id, p); }
        catch (error) { console.warn(`[Starstone] Piston removal persistence: ${error.message}`); }
        scheduleAffected({dimension, location:p});
        queueMutation(dimension, p);
    },
    onGone(dimension, record) {
        scheduleAffected({dimension, location:record.position});
        queueMutation(dimension, record.position);
    },
    onMove(block, record) {
        // Keep occupied cells in chains: another moved cube may now occupy the
        // old position. Reconciliation reads final blocks rather than guessed IDs.
        for (const p of [block.location, record.position]) {
            const current = readPistonBlock(block.dimension, p);
            try {
                if (current && KIND_BY_ID[current.typeId]) placementIndex.record(current);
                else if (current) placementIndex.remove(block.dimension.id, p);
            } catch (error) { console.warn(`[Starstone] Piston migration persistence: ${error.message}`); }
            scheduleAffected({dimension:block.dimension, location:p});
        }
        queueMutation(block.dimension, record.position);
        queueMutation(block.dimension, block.location);
    },
    onSettled(dimension, positions) {
        for (const position of positions) {
            scheduleAffected({dimension, location:position});
            queueMutation(dimension, position);
        }
    }
});
let registered = false;
export function registerPistonController() {
    if (registered) return;
    system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
        blockComponentRegistry.registerCustomComponent("starstone:piston_support", {
            onPlace({block}) { pistonSupport.observe(block, {reset:true}); },
            onTick({block}) { pistonSupport.observe(block); }
        });
    });
    world.afterEvents.pistonActivate.subscribe(event => {
        try {
            const axis = PISTON_AXES[event.block.permutation.getState("facing_direction")];
            if (!axis) return;
            pistonSupport.onPiston({ dimension:event.dimension || event.block.dimension,
                position:{...event.block.location}, axis, isExpanding:event.isExpanding,
                piston:event.piston || event.block.getComponent("minecraft:piston") });
        } catch (error) { console.warn(`[Starstone] Piston observer: ${error.message}`); }
    });
    for (const name of ["playerPlaceBlock", "playerBreakBlock", "blockExplode"]) {
        world.afterEvents[name].subscribe(event => {
            if (!event.block) return;
            const dimension = event.dimension || event.block.dimension;
            pistonSupport.invalidate(dimension, event.block.location);
            if (name === "playerPlaceBlock") pistonSupport.observe(event.block, {reset:true});
            pistonSupport.resetAround(dimension, event.block.location);
        });
    }
    // Existing saved circuits warm without scanning world volumes. Scheduled
    // block ticks also initialize structures, commands and newly loaded chunks.
    world.afterEvents.worldLoad.subscribe(() => system.runJob((function* () {
        for (const entry of placementIndex.entries()) {
            if (entry) {
                try {
                    const dimension = world.getDimension(entry.dimensionId);
                    const block = readPistonBlock(dimension, entry.location);
                    if (block) pistonSupport.observe(block);
                } catch { /* Unloaded records warm on their next block tick. */ }
            }
            yield;
        }
    })()));
    registered = true;
}
