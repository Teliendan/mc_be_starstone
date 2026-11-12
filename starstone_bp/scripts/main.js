import { world, system } from "@minecraft/server";
import { KIND_BY_ID } from "./constants.js";
import {
    removeAndSplitNetwork,
    captureRemovedNetworks
} from "./networkController.js";
import { registerCableComponent, scheduleAffected } from "./cableComponent.js";
import { registerGeneratorController } from "./generatorComponent.js";
import { registerDiagnostics } from "./diagnostics.js";
import { registerRecovery } from "./repair.js";
import { placementIndex } from "./persistence.js";
import { registerMutationController } from "./mutationController.js";
import { registerChunkController } from "./chunkController.js";
import { registerRedstoneAdapters } from "./redstoneAdapters.js";
import { registerHarvestGate } from "./harvestGate.js";
import { registerOreExperience } from "./oreExperience.js";
import { registerPistonController } from "./pistonController.js";

const TAG = "[Starstone]";
// Engine-side event filters; the handlers keep their own type checks.
const ELECTRICAL_IDS = Object.keys(KIND_BY_ID);

world.afterEvents.worldLoad.subscribe(() => {
    console.log("[Starstone] Starstone active.");
});

// Placement discovery runs from each block component's onPlace hook (cableComponent.js,
// generatorComponent.js): the new node is discovered and merged into the runtime
// index, while unrelated cached networks stay untouched.

// When a Starstone block is removed, its old network must be re-fragmented
// using its cached nodes. The removed type comes from
// event.brokenBlockPermutation, because event.block already holds air or the
// replacement block. Every cached network that references the removed block is
// captured synchronously in the event, then the re-fragmentation is deferred so
// it can safely update surviving blocks. Non-Starstone removals are
// skipped.
function handleElectricalBreak(event) {
    if (KIND_BY_ID[event.brokenBlockPermutation.type.id] === undefined) {
        return;
    }
    const dimension = event.dimension;
    const { x, y, z } = event.block.location;
    try {
        placementIndex.remove(dimension.id, { x, y, z });
    } catch (err) {
        console.warn(`${TAG} Could not persist removal: ${err.message}`);
    }
    const capture = captureRemovedNetworks(dimension, x, y, z);
    system.run(() => {
        try {
            return removeAndSplitNetwork(capture).catch((err) => {
                console.warn(`${TAG} Could not split network after removal: ${err.message}`);
            });
        } catch (err) {
            console.warn(`${TAG} Could not split network after removal: ${err.message}`);
        }
    });
}
world.afterEvents.playerBreakBlock.subscribe(handleElectricalBreak, { blockTypes: ELECTRICAL_IDS });

// The only gated block is the ore, which is not electrical but may support a cable.
registerHarvestGate(({ block }) => scheduleAffected(block));
registerOreExperience();

registerCableComponent();

// Task 4.6: react to generator toggles with a power-only recompute of the
// containing network, never a topology rebuild.
registerGeneratorController();

// Task 5.1: expose the bounded /scriptevent diagnostics, rebuild, and debug
// commands to players.
registerDiagnostics();
registerRecovery();
registerMutationController();
registerChunkController();
registerRedstoneAdapters();
registerPistonController();
