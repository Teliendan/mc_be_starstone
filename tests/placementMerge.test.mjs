// SS-07 structural: a placement merges cached network records instead of
// re-walking the whole network. The oracle in miniature compares every runtime
// network with a full rediscovery after each placement.
import assert from 'node:assert/strict';
import { mc, fixture, drain, worldProperties } from './runtimeFixture.mjs';
const cable = await import('../starstone_bp/scripts/cableComponent.js');
const controller = await import('../starstone_bp/scripts/chunkController.js');
const { discoverNetwork } = await import('../starstone_bp/scripts/networkGraph.js');
const { descriptorForBlock } = await import('../starstone_bp/scripts/electricalBlocks.js');
const runtime = (await import('../starstone_bp/scripts/networkRuntime.js')).default;
const { anySourceOn } = await import('../starstone_bp/scripts/networkController.js');
const { chunkIndex, buildIndexedChunkSegments } = await import('../starstone_bp/scripts/chunkIndex.js');
const { placementIndex } = await import('../starstone_bp/scripts/persistence.js');
const props = worldProperties();
globalThis.__mcDimensions = new Map();
controller.registerChunkController();
let counter = 0;
function world() {
    const f = fixture(); f.dim.id = `test:merge-${counter++}`;
    globalThis.__mcDimensions.set(f.dim.id, f.dim);
    runtime.clearNetworks();
    return f;
}
const ref = (f, x, z, lane = 'main', y = 0) => `${f.dim.id}|${x}|${y}|${z}#${lane}`;
const stone = (f, x, z) => f.put('minecraft:stone', x, -1, z);
const wire = (f, x, z) => { stone(f, x, z); return f.put('starstone:cable', x, 0, z); };
async function place(f, ...blocks) {
    for (const b of blocks) cable.schedulePlaced(b);
    cable.flushPending(); await drain();
}
const lit = b => b.permutation.getState('starstone:powered');
async function rediscover(f, id) {
    const net = runtime.networkOf(id);
    const first = [...net.nodes][0];
    const [, x, y, z] = first.slice(0, first.indexOf('#')).split('|').map(Number);
    const lane = first.slice(first.indexOf('#') + 1);
    const block = f.dim.getBlock({ x, y, z });
    const laneObject = descriptorForBlock(block).lanes.find(l => l.id === lane);
    const walk = discoverNetwork(block, undefined, laneObject); await drain();
    return walk;
}
async function assertConsistent(f, label) {
    for (const id of runtime.networkIds()) {
        const net = runtime.networkOf(id);
        const full = await rediscover(f, id);
        assert.deepEqual([...net.nodes].sort(), [...full.nodes].sort(), `${label}: membership of ${id}`);
        assert.equal(Boolean(net.powered), anySourceOn(full, f.dim), `${label}: power of ${id}`);
    }
}

// Oracle in miniature: random placements on a floor, checked after each one.
async function oracle(seed, size, count, chunks) {
    const f = world();
    let state = seed;
    const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    for (let x = 0; x < size; x++) for (let z = 0; z < 16; z++) f.put('minecraft:stone', x, 63, z);
    const cells = [];
    for (let x = 0; x < size; x++) for (let z = 0; z < (chunks ? 16 : size); z++) cells.push([x, z]);
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    let n = 0;
    for (const [x, z] of cells.slice(0, count)) {
        const r = rand();
        const id = r < 0.05 ? 'starstone:generator' : r < 0.12 ? 'starstone:lamp' : r < 0.18 ? 'starstone:bridge' : 'starstone:cable';
        const states = id === 'starstone:generator' ? { 'starstone:enabled': rand() < 0.7 } : {};
        await place(f, f.put(id, x, 64, z, states));
        n++;
        await assertConsistent(f, `seed ${seed} placement ${n}`);
        for (const b of f.store.values()) {
            if (b.typeId !== 'starstone:cable' && b.typeId !== 'starstone:lamp') continue;
            const owner = runtime.networkIdOf(`${f.dim.id}|${b.location.x}|${b.location.y}|${b.location.z}#main`);
            const want = owner === undefined ? false : Boolean(runtime.networkOf(owner).powered);
            assert.equal(Boolean(lit(b)), want, `seed ${seed} placement ${n}: visual at ${b.location.x},${b.location.z}`);
        }
        for (let cx = 0; cx <= Math.floor((size - 1) / 16); cx++) {
            const g = buildIndexedChunkSegments(f.dim, cx, 0, placementIndex); let step;
            do step = g.next(); while (!step.done);
            const saved = chunkIndex.readChunk(f.dim.id, cx, 0);
            if (!step.value.segments.length && !saved) continue;
            assert.deepEqual(JSON.parse(JSON.stringify(saved)), JSON.parse(JSON.stringify(step.value)), `seed ${seed} placement ${n}: snapshot ${cx}`);
        }
    }
}
await oracle(1, 12, 70, false);
await oracle(5, 12, 70, false);
await oracle(3, 32, 40, true);

// An unpowered line joins a powered one with one cable: both light.
{
    const f = world();
    const gen = f.put('starstone:generator', 0, 0, 0);
    const first = [-1, 1, 2].map(x => wire(f, x, 0));
    const second = [4, 5].map(x => wire(f, x, 0));
    const lamp = f.put('starstone:lamp', 6, 0, 0); stone(f, 6, 0);
    await place(f, gen, ...first, ...second, lamp);
    assert.ok(first.every(lit));
    assert.deepEqual([...second, lamp].map(lit), [false, false, false]);
    const bigger = runtime.networkIdOf(ref(f, 0, 0));
    await place(f, wire(f, 3, 0));
    assert.deepEqual([...first, ...second, lamp].map(lit), [true, true, true, true, true, true]);
    assert.equal(runtime.networkIdOf(ref(f, 5, 0)), bigger, 'the larger record keeps its id');
    assert.equal(runtime.networkCount(), 1);
    await assertConsistent(f, 'join');
}

// Two powered networks join; both stay lit and one record remains.
{
    const f = world();
    const gens = [f.put('starstone:generator', 0, 0, 0), f.put('starstone:generator', 6, 0, 0)];
    const wires = [1, 2, 4, 5].map(x => wire(f, x, 0));
    await place(f, ...gens, ...wires);
    assert.equal(runtime.networkCount(), 2);
    await place(f, wire(f, 3, 0));
    assert.equal(runtime.networkCount(), 1);
    assert.ok(wires.every(lit));
    await assertConsistent(f, 'two powered');
}

// A bridge joins two lines on separate lanes without merging them.
{
    const f = world();
    const gen = f.put('starstone:generator', -1, 0, 0);
    const lampEw = f.put('starstone:lamp', 1, 0, 0); stone(f, 1, 0);
    const lampNs = f.put('starstone:lamp', 0, 0, 1); stone(f, 0, 1);
    const cableNs = wire(f, 0, -1);
    await place(f, gen, lampEw, lampNs, cableNs);
    const bridge = f.put('starstone:bridge', 0, 0, 0); stone(f, 0, 0);
    await place(f, bridge);
    assert.equal(lit(lampEw), true);
    assert.equal(lit(lampNs), false);
    assert.notEqual(runtime.networkIdOf(ref(f, 0, 0, 'ns')), runtime.networkIdOf(ref(f, 0, 0, 'ew')));
    await assertConsistent(f, 'bridge');
}

// Placing on an owned position (in-place replacement) falls back to a full walk.
{
    const f = world();
    const gen = f.put('starstone:generator', 0, 0, 0);
    const wires = [1, 2, 3].map(x => wire(f, x, 0));
    await place(f, gen, ...wires);
    await place(f, f.put('starstone:cable', 2, 0, 0));
    await assertConsistent(f, 'owned');
    assert.equal(runtime.networkCount(), 1);
}

// An owner with an unresolved boundary falls back; the result stays exact.
{
    const f = world();
    const gen = f.put('starstone:generator', 0, 0, 0);
    const wires = [1, 2, 3].map(x => wire(f, x, 0));
    await place(f, gen, ...wires);
    // Mark the owner incomplete: the merge path must hand it to a full walk.
    runtime.networkOf(runtime.networkIdOf(ref(f, 3, 0))).unresolvedBoundaries.add('fake|boundary');
    const extra = wire(f, 1, 1);
    await place(f, extra);
    assert.equal(lit(extra), true);
    assert.equal(runtime.networkOf(runtime.networkIdOf(ref(f, 1, 1))).unresolvedBoundaries.size, 0, 'a full walk replaced the record');
    await assertConsistent(f, 'unresolved');
}

// Two placements in one flush end in one exact network.
{
    const f = world();
    const gen = f.put('starstone:generator', 0, 0, 0);
    const a = wire(f, 1, 0);
    await place(f, gen, a);
    const b = wire(f, 2, 0), c = wire(f, 3, 0), d = wire(f, 4, 0);
    await place(f, d, b, c);
    assert.ok([a, b, c, d].every(lit));
    assert.equal(runtime.networkCount(), 1);
    await assertConsistent(f, 'one flush');
}

// One placement next to a 256-node network reads few blocks.
{
    const f = world();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { stone(f, x, z); if (x || z) f.put('starstone:cable', x, 0, z); }
    f.put('starstone:generator', 0, 0, 0);
    await place(f, ...[...f.store.values()].filter(b => b.typeId.startsWith('starstone:')));
    assert.equal(runtime.networkCount(), 1);
    let reads = 0; const getBlock = f.dim.getBlock;
    f.dim.getBlock = p => { reads++; return getBlock(p); };
    const extra = wire(f, 16, 15);
    await place(f, extra);
    f.dim.getBlock = getBlock;
    assert.equal(lit(extra), true);
    assert.ok(reads < 400, `getBlock calls ${reads}`);
}
console.log('placementMerge: ok');
