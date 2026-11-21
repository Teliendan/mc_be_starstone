// Network-sized power work runs as "walks": generators that queue power targets
// in slices (applyPowerSteps) behind one engine-paced job, so no callback ever
// loops over a whole network. Walks run one at a time in the order they were
// requested, so the latest request writes last, as the synchronous queue did.
// A walk with a key supersedes an earlier unfinished walk with the same key (its
// newer state replaces the old one); a walk without a key never does.
import { system } from "@minecraft/server";

const queue = [];
let current;
let running = false;
let completed = 0, cancelledCount = 0;

export function walkStats() {
    return { queued: queue.length, running: running ? 1 : 0, completed, cancelled: cancelledCount };
}

// steps(cancelled) returns the walk's generator; cancelled() turns true once a newer
// walk with the same key was requested.
export function enqueueWalk(key, steps) {
    if (key !== undefined && key !== null) {
        for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i].key === key) { queue[i].cancelled = true; queue.splice(i, 1); cancelledCount++; }
        }
        if (current?.key === key) { current.cancelled = true; cancelledCount++; }
    }
    queue.push({ key, steps, cancelled: false });
    start();
}

function start() {
    if (running || !queue.length) return;
    running = true;
    try { system.runJob(runner()); }
    catch (error) { running = false; throw error; }
}

function* runner() {
    try {
        while (queue.length) {
            const walk = current = queue.shift();
            try { yield* walk.steps(() => walk.cancelled); }
            catch (error) { console.warn(`[Starstone] Power walk failed: ${error.message}`); }
            current = undefined;
            completed++;
            yield;
        }
    } finally {
        running = false;
        current = undefined;
        if (queue.length) { try { start(); } catch (error) { console.warn(`[Starstone] Could not restart power walks: ${error.message}`); } }
    }
}
