// SS-01 steps 1-3: an edit rebuilds only the chunk it changed; in-place state
// changes at an indexed position still reach the chunk snapshot.
import assert from 'node:assert/strict';
import { mc, fixture, drain, worldProperties } from './runtimeFixture.mjs';
const controller = await import('../starstone_bp/scripts/chunkController.js');
const cable = await import('../starstone_bp/scripts/cableComponent.js');
const mutation = await import('../starstone_bp/scripts/mutationController.js');
const { placementIndex } = await import('../starstone_bp/scripts/persistence.js');
const { chunkIndex, buildIndexedChunkSegments, buildChunkSegments } = await import('../starstone_bp/scripts/chunkIndex.js');
const { descriptorForBlock } = await import('../starstone_bp/scripts/electricalBlocks.js');
const runtime = (await import('../starstone_bp/scripts/networkRuntime.js')).default;
const props = worldProperties();
globalThis.__mcDimensions = new Map();
controller.registerChunkController();
mutation.registerMutationController();
let counter = 0;
function world() {
    const f = fixture(); f.dim.id = `test:scope-${counter++}`;
    globalThis.__mcDimensions.set(f.dim.id, f.dim);
    runtime.clearNetworks();
    return f;
}
const run = generator => { let r; do r = generator.next(); while (!r.done); return r.value; };
async function line(f, count) {
    f.put('starstone:generator', 0, 0, 0);
    for (let x = 1; x < count; x++) { f.put('starstone:cable', x, 0, 0); f.put('minecraft:stone', x, -1, 0); }
    cable.schedulePlaced(f.dim.getBlock({ x: 0, y: 0, z: 0 }));
    for (let x = 1; x < count; x++) cable.schedulePlaced(f.dim.getBlock({ x, y: 0, z: 0 }));
    cable.flushPending(); await drain();
}
const snapshot = (f, cx) => JSON.parse(JSON.stringify(chunkIndex.readChunk(f.dim.id, cx, 0)));

// Placing one cable on a two-chunk network builds and commits only its own chunk.
{
    const f = world();
    await line(f, 32);
    assert.ok(chunkIndex.readChunk(f.dim.id, 0, 0) && chunkIndex.readChunk(f.dim.id, 1, 0));
    const positions = placementIndex.stats().positions;
    const before = controller.chunkStats();
    f.put('starstone:cable', 31, 0, 1); f.put('minecraft:stone', 31, -1, 1);
    cable.schedulePlaced(f.dim.getBlock({ x: 31, y: 0, z: 1 })); cable.flushPending(); await drain();
    const after = controller.chunkStats();
    assert.equal(after.builds - before.builds, 1, 'one chunk build');
    assert.equal(after.commits - before.commits, 1, 'one chunk commit');
    assert.equal(placementIndex.stats().positions, positions + 1, 'no other position recorded');
}

// An in-place replacement (same position, different mount face) changes the
// snapshot although the index did not change.
{
    const f = world();
    for (const [x, y, z] of [[15, -1, 0], [15, 0, -1], [15, 0, 1], [14, 0, 0], [16, 0, 0], [15, 1, 0]]) f.put('minecraft:stone', x, y, z);
    const first = f.put('starstone:cable', 15, 0, 0, { 'minecraft:block_face': 'up' });
    cable.schedulePlaced(first); cable.flushPending(); await drain();
    const faces = () => snapshot(f, 0).segments.flatMap(s => s.boundaries.map(b => b.mountFace));
    assert.ok(faces().includes('up'));
    const replaced = f.put('starstone:cable', 15, 0, 0, { 'minecraft:block_face': 'north' });
    cable.schedulePlaced(replaced); cable.flushPending(); await drain();
    const now = faces();
    assert.ok(now.length && !now.includes('up') && now.includes('north'), `mount face rewritten: ${now}`);
}

// An explosion-style reconcile that re-records an indexed position rebuilds its chunk.
{
    const f = world();
    for (const [x, y, z] of [[15, -1, 0], [15, 0, -1], [15, 0, 1], [14, 0, 0], [15, 1, 0]]) f.put('minecraft:stone', x, y, z);
    cable.schedulePlaced(f.put('starstone:cable', 15, 0, 0, { 'minecraft:block_face': 'up' })); cable.flushPending(); await drain();
    f.put('starstone:cable', 15, 0, 0, { 'minecraft:block_face': 'north' }); // silent in-place change
    mutation.queueMutation(f.dim, { x: 15, y: 0, z: 0 }); await drain();
    const faces = snapshot(f, 0).segments.flatMap(s => s.boundaries.map(b => b.mountFace));
    assert.ok(faces.includes('north') && !faces.includes('up'), `reconcile rewrote the snapshot: ${faces}`);
}

// A stale indexed position (replaced without events) is dropped by one build.
{
    const f = world();
    await line(f, 6);
    f.put('minecraft:stone', 3, 0, 0);
    const before = controller.chunkStats();
    controller.queueChunkRebuild(f.dim, 0, 0, 0); await drain();
    const after = controller.chunkStats();
    assert.equal(after.builds - before.builds, 1, 'built once, not re-queued by its own cleanup');
    assert.ok(![...placementIndex.positionsInChunk(f.dim.id, 0, 0)].some(p => p.x === 3), 'stale hint removed');
    assert.ok(!snapshot(f, 0).segments.some(s => s.members.some(m => m.includes('|3|0|0#'))));
}

// A snapshot built without support reads equals one built with them (surfaces
// on generators and conduits), so saved snapshots compare unchanged.
{
    const f = world();
    f.put('starstone:generator', 0, 0, 0); f.put('starstone:conduit', 4, 0, 0);
    const blocks = [
        f.put('starstone:cable', 0, 1, 0, { 'minecraft:block_face': 'up' }),
        f.put('starstone:cable', 1, 0, 0, { 'minecraft:block_face': 'up' }), f.put('minecraft:stone', 1, -1, 0),
        f.put('starstone:cable', 4, 1, 0, { 'minecraft:block_face': 'up' }),
        f.put('starstone:lamp', 5, 0, 0, { 'minecraft:block_face': 'up' }), f.put('minecraft:stone', 5, -1, 0),
        f.put('starstone:generator', 0, 0, 0), f.put('starstone:conduit', 4, 0, 0)
    ];
    for (const b of blocks) placementIndex.record(b);
    const without = run(buildIndexedChunkSegments(f.dim, 0, 0, placementIndex));
    const entries = [...placementIndex.positionsInChunk(f.dim.id, 0, 0)].map(location => ({ location, descriptor: descriptorForBlock(f.dim.getBlock(location)) })).filter(e => e.descriptor);
    assert.ok(entries.length >= 5);
    assert.deepEqual(JSON.parse(JSON.stringify(without)), JSON.parse(JSON.stringify(buildChunkSegments(f.dim.id, 0, 0, entries))));
}
console.log('chunkRebuildScope: ok');
