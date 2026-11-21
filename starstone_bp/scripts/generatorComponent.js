// generatorComponent.js
//
// Task 4.6 — react to generator toggles without rebuilding topology.
//
// A generator's `enabled` flag is the network's only source flag. Toggling it
// must recompute the CONTAINING network's `powered` value and write power only
// when that value changes. This module never calls discoverNetwork(): it finds
// the owning network straight from the runtime node->network index
// (networkIdOf), recomputes power from that network's stored sources through
// anySourceOn (each source block's state read once, no edge walking), and queues
// the power writes only on a real change. Repeated toggles therefore cost no
// topology traversal.

import { system } from "@minecraft/server";
import runtime from "./networkRuntime.js";
import { scheduleNetworkRefresh } from "./networkController.js";
import { STATE_ENABLED } from "./constants.js";
import { nodeRef } from "./blockKeys.js";
import { sourceChanged } from "./networkEvents.js";
import { schedulePlaced } from "./cableComponent.js";

const TAG = "[Starstone]";

// The generator exposes one joined source lane, #main.
const GEN_LANE = "main";

// Recompute the containing network's powered value after a generator toggle and
// apply power only when it changed. The owning network is found from the runtime
// index (networkIdOf), never by discovering. The callback stays O(1): it commits the
// source state and queues a refresh walk (networkController.scheduleNetworkRefresh)
// that reads the sources in slices and queues the power writes in slices, so a toggle
// of a 10,000-cable network costs the same here as one of a 3-cable network. A newer
// toggle of the same generator supersedes an unfinished walk (the latest state wins).
// Returns { id, scheduled } or undefined when the generator owns no cached network.
export function reactToGeneratorToggle(dimension, x, y, z) {
    const ref = nodeRef(dimension, { x, y, z }, GEN_LANE);
    const id = runtime.networkIdOf(ref);
    const block = dimension.getBlock({ x, y, z });
    // Saved metadata decides only for a network that reaches unloaded chunks (the walk checks).
    const committed = Boolean(block?.isValid &&
        sourceChanged(dimension, { x, y, z }, Boolean(block.permutation.getState(STATE_ENABLED))));
    if (id === undefined) {
        return undefined;
    }
    scheduleNetworkRefresh(ref, dimension, { committed });
    return { id, scheduled: true };
}

// Interaction changes the state and immediately updates the existing network.
// Other scripts changing STATE_ENABLED must call reactToGeneratorToggle too.
export function registerGeneratorController() {
    system.beforeEvents.startup.subscribe((event) => {
        event.blockComponentRegistry.registerCustomComponent("starstone:generator", {
            onPlace({ block }) { schedulePlaced(block); },
            onPlayerInteract({ block }) {
                try {
                    const enabled = Boolean(block.permutation.getState(STATE_ENABLED));
                    block.setPermutation(block.permutation.withState(STATE_ENABLED, !enabled));
                    const { x, y, z } = block.location;
                    reactToGeneratorToggle(block.dimension, x, y, z);
                } catch (err) {
                    console.warn(`${TAG} Could not toggle generator: ${err.message}`);
                }
            }
        });
    });
}

