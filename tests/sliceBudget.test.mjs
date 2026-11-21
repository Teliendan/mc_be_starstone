// Budget test (S1-S4 of the 2026-11-21 performance audit): no job step, callback or microtask burst may do
// work that grows with the world. A counting dimension/world counts native calls per call; the drain loop
// treats every system.run callback, every job step and every callback trigger as one call.
// Limits per call (performance.md "When a call needs a job"): <= 128 block reads, <= 16 block writes,
// <= 16 property writes; the generator callback that starts a walk must stay O(1) (<= 8 reads/writes).
import assert from 'node:assert/strict';
import { fixture, mc, worldProperties } from './runtimeFixture.mjs';

worldProperties();
const f = fixture();
globalThis.__mcDimensions = new Map([[f.dim.id, f.dim]]);
const c = { read: 0, write: 0, propSet: 0 };
const gb = f.dim.getBlock;
f.dim.getBlock = p => { c.read++; return gb(p); };
const sp = mc.world.setDynamicProperty;
mc.world.setDynamicProperty = (k, v) => { c.propSet++; return sp(k, v); };
const writeCounter = block => {
    const w = block.setPermutation;
    block.setPermutation = function (p) { c.write++; return w.call(this, p); };
    return block;
};

const runs = [], jobs = [];
globalThis.__mcRun = cb => { runs.push(cb); return runs.length; };
globalThis.__mcRunJob = job => { jobs.push(job); return jobs.length; };
const worst = { read: 0, write: 0, propSet: 0 };
let calls = 0;
function call(fn) {
    const before = { ...c };
    const r = fn();
    calls++;
    for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], c[k] - before[k]);
    return r;
}
async function drain() {
    for (let turn = 0; turn < 1e6; turn++) {
        for (const cb of runs.splice(0)) call(cb);
        for (const job of jobs.splice(0)) { if (!call(() => job.next().done)) jobs.push(job); }
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        if (!runs.length && !jobs.length) await new Promise(r => setImmediate(r));
        if (!runs.length && !jobs.length) return;
    }
    throw new Error('no finish');
}

const { schedulePlaced, scheduleAffected } = await import('../starstone_bp/scripts/cableComponent.js');
const { registerChunkController, pollLoadedChunks, chunkStats } = await import('../starstone_bp/scripts/chunkController.js');
const { reactToGeneratorToggle } = await import('../starstone_bp/scripts/generatorComponent.js');
const { placementIndex } = await import('../starstone_bp/scripts/persistence.js');
const { captureRemovedNetworks, removeAndSplitNetwork } = await import('../starstone_bp/scripts/networkController.js');
const runtime = (await import('../starstone_bp/scripts/networkRuntime.js')).default;
registerChunkController();

// Dense chunk: 8 floors of 256 cables = 2,048 cables in one chunk.
const cables = [];
for (let layer = 0; layer < 8; layer++) {
    const y = 63 + layer * 2;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) f.put('minecraft:stone', x, y, z);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        if (layer === 0 && ((x === 0 && z === 0) || (x === 15 && z === 15))) continue;
        const b = writeCounter(f.put('starstone:cable', x, y + 1, z, { 'starstone:connections': 0, 'minecraft:block_face': 'up' }));
        placementIndex.record(b); scheduleAffected(b); cables.push(b);
    }
}
const gen = writeCounter(f.put('starstone:generator', 0, 64, 0, { 'starstone:enabled': true }));
schedulePlaced(gen); await drain();
pollLoadedChunks(); await drain();
assert.ok(chunkStats().graphReady, 'the logical graph is built by the job');
const limit = (what, v, max) => assert.ok(v <= max, `${what}: ${v} > ${max}`);
function report(label) {
    limit(`${label}: block reads per call`, worst.read, 128);
    limit(`${label}: block writes per call`, worst.write, 16);
    limit(`${label}: property writes per call`, worst.propSet, 16);
    console.log(`${label}: ${calls} calls, worst per call ${JSON.stringify(worst)}`);
}
const reset = () => { for (const k of Object.keys(worst)) worst[k] = 0; calls = 0; };

// S1: placing one cable into a 2,048-node chunk rebuilds its snapshot in slices.
reset();
{
    const placed = writeCounter(f.put('starstone:cable', 15, 64, 15, { 'starstone:connections': 0, 'minecraft:block_face': 'up' }));
    call(() => { schedulePlaced(placed); });
    await drain();
    report('S1 place one cable (2,048-node chunk)');
    assert.ok(calls > 100, 'the rebuild is spread over many calls');
}

// S2: the toggle callback is O(1); the network walk runs as sliced job steps.
for (const on of [false, true]) {
    reset();
    gen.setPermutation(gen.permutation.withState('starstone:enabled', on));
    const before = { ...c };
    call(() => reactToGeneratorToggle(f.dim, 0, 64, 0));
    assert.ok(c.read - before.read <= 8 && c.write - before.write <= 8, `S2 callback stays O(1): ${c.read - before.read} reads`);
    await drain();
    report(`S2 toggle generator ${on ? 'on' : 'off'}`);
    const net = runtime.networkOf(runtime.networkIdOf(`${f.dim.id}|0|64|0#main`));
    assert.equal(Boolean(net.powered), on);
    assert.equal(cables[5].permutation.getState('starstone:powered'), on, 'power reached the cables');
}

// S2b: a newer toggle supersedes an unfinished walk (latest state wins).
{
    reset();
    gen.setPermutation(gen.permutation.withState('starstone:enabled', false));
    call(() => reactToGeneratorToggle(f.dim, 0, 64, 0));
    for (let i = 0; i < 3; i++) for (const job of jobs.splice(0)) { if (!call(() => job.next().done)) jobs.push(job); }
    gen.setPermutation(gen.permutation.withState('starstone:enabled', true));
    call(() => reactToGeneratorToggle(f.dim, 0, 64, 0));
    await drain();
    assert.ok(cables.filter(b => b.location.y === 64).every(b => b.permutation.getState('starstone:powered') === true), 'the newest state won on every cable');
    report('S2b superseding toggles');
}

// S3: breaking a cable splits and re-registers the network in slices.
reset();
{
    const victim = cables.find(b => b.location.x === 8 && b.location.z === 8 && b.location.y === 64);
    f.store.delete('8,64,8');
    placementIndex.remove(f.dim.id, victim.location);
    const capture = call(() => captureRemovedNetworks(f.dim, 8, 64, 8));
    assert.ok(capture, 'capture records the touched networks');
    call(() => { removeAndSplitNetwork(capture); });
    scheduleAffected({ dimension: f.dim, location: victim.location });
    await drain();
    report('S3 break one cable (split)');
}

// S4: cold start: a fresh index loads and validates every saved chunk and builds the graph as steps.
{
    reset();
    const { createChunkIndex } = await import('../starstone_bp/scripts/chunkIndex.js');
    const { buildSegmentGraphSteps } = await import('../starstone_bp/scripts/segmentGraph.js');
    const idx = createChunkIndex(mc.world);
    const job = (function* () { const snaps = yield* idx.loadedChunksSteps(); return yield* buildSegmentGraphSteps(snaps, { trusted: true }); })();
    let r, steps = 0;
    while (!(r = call(() => job.next())).done) steps++;
    assert.ok(steps > 10, `cold load is sliced (${steps} steps)`);
    assert.ok(r.value.networkCount >= 1);
    report('S4 cold graph load');
}
console.log('sliceBudget: ok');
