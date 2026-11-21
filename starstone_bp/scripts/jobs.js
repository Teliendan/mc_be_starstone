// Engine-paced jobs for sliced work (kept apart from slicing.js, which has no engine import).
import { system } from "@minecraft/server";
import { SLICE_NODES, drive } from "./slicing.js";

// Run a generator as an engine-paced job and resolve with its return value
// (rejects with its error). Used by async flows that await sliced work.
export function runSteps(steps) {
    return new Promise((resolve, reject) => {
        system.runJob((function* () {
            try { resolve(yield* steps); }
            catch (error) { reject(error); }
        })());
    });
}

// Small inputs run synchronously (no job round trip); big ones as a job. Await the result.
export function stepsAsync(steps, size) {
    if (size > SLICE_NODES) return runSteps(steps);
    try { return Promise.resolve(drive(steps)); } catch (error) { return Promise.reject(error); }
}
