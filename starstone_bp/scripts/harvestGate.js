import { system, world } from "@minecraft/server";
import { damageRejectedTool } from "./harvestWear.js";

const ORE_PICKS = new Set([
    "minecraft:iron_pickaxe", "minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe"
]);
const GATED_BLOCKS = new Set(["starstone:ore"]);

export function canCollect(blockId, tool) {
    if (blockId === "starstone:ore") return ORE_PICKS.has(tool?.typeId);
    return true;
}

function stateKey(permutation) {
    const states = permutation.getAllStates();
    return JSON.stringify(Object.keys(states).sort().map(key => [key, states[key]]));
}

// Native loot remains the only item-drop owner, including explosions. A tool
// predicate alone would also suppress environmental drops. Intercept only a
// completed wrong-tool player break, then remove its unchanged cell without loot.
export function registerHarvestGate(onRemoved = () => {}) {
    const pending = new Map();
    const keyFor = (dimension, location) =>
        `${dimension.id}|${location.x}|${location.y}|${location.z}`;
    const invalidate = event => {
        if (pending.size && event.block) pending.delete(keyFor(event.block.dimension, event.block.location));
    };
    world.afterEvents.playerPlaceBlock.subscribe(invalidate);
    world.afterEvents.blockExplode.subscribe(invalidate);
    world.beforeEvents.playerBreakBlock.subscribe(event => {
        if (event.cancel) return;
        const block = event.block;
        const typeId = block.typeId;
        if (!GATED_BLOCKS.has(typeId)) return;
        const player = event.player;
        const mode = player.getGameMode();
        if (mode === "Creative" || mode === "Spectator" || canCollect(typeId, event.itemStack)) return;
        const dimension = block.dimension;
        const location = { ...block.location };
        const key = keyFor(dimension, location);
        const states = stateKey(block.permutation);
        const slotIndex = player.selectedSlotIndex;
        const tool = event.itemStack?.clone();
        event.cancel = true;
        if (pending.has(key)) return;
        const token = {};
        pending.set(key, token);
        system.run(() => {
            try {
                if (pending.get(key) !== token || player.isValid === false) return;
                const currentMode = player.getGameMode();
                if (currentMode === "Creative" || currentMode === "Spectator") return;
                const current = dimension.getBlock(location);
                if (!current?.isValid || current.typeId !== typeId || stateKey(current.permutation) !== states) return;
                current.setType("minecraft:air");
                // Canceled player breaks do not emit the ordinary after-break
                // event. Explicitly run our network/support cleanup once.
                try { onRemoved({ dimension, location, typeId, block: dimension.getBlock(location) }); }
                catch (error) { console.warn(`[Starstone] Harvest cleanup failed: ${error.message}`); }
                try { damageRejectedTool(player, slotIndex, tool); }
                catch (error) { console.warn(`[Starstone] Harvest tool wear failed: ${error.message}`); }
            } catch (error) {
                console.warn(`[Starstone] Rejected harvest failed: ${error.message}`);
            } finally {
                if (pending.get(key) === token) pending.delete(key);
            }
        });
    }, { blockTypes: [...GATED_BLOCKS] });
}
