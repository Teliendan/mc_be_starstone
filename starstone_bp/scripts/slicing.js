// Shared helpers for work that grows with the world: it is written once as a
// generator ("...Steps") that yields between slices, and the synchronous form
// is `drive(steps)` for tests and small inputs. Budget per step (owner rule
// 2026-11-21): <= ~128 native block reads, <= 16 writes, ~1-3 ms pure JS.

// Pure-JS items (nodes, refs, segments) handled between two yields.
export const SLICE_NODES = 256;
// Items that allocate several objects each (descriptors, neighbour sets).
export const SLICE_BUILD = 128;
// Source blocks examined between two yields (two native reads each: <= ~96 per step).
export const SLICE_SOURCES = 48;

// Run a generator to the end and return its value.
export function drive(steps) {
    let result;
    while (!(result = steps.next()).done);
    return result.value;
}

// A cooperative lock for sliced work that must not interleave with another sliced
// mutation of the same index (a half-registered network). `run(task)` waits for the
// gate, `idle()` waits until nobody holds it; a synchronous section may start right
// after `await idle()` returns because only job steps (which come later) can take it.
export function createGate() {
    let busy = false;
    const waiters = [];
    const wake = () => { for (const resolve of waiters.splice(0)) resolve(); };
    const wait = () => new Promise(resolve => waiters.push(resolve));
    return {
        get busy() { return busy; },
        async idle() { while (busy) await wait(); },
        async run(task) {
            while (busy) await wait();
            busy = true;
            try { return await task(); }
            finally { busy = false; wake(); }
        }
    };
}
