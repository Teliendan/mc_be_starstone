import assert from 'node:assert/strict';
import { fixture, drain } from './runtimeFixture.mjs';
const { discoverNetwork } = await import('../starstone_bp/scripts/networkGraph.js');
const runtime = (await import('../starstone_bp/scripts/networkRuntime.js')).default;

// A walk over a 16x16 cable floor reads each cell at most once.
{
    runtime.clearNetworks();
    const f = fixture();
    globalThis.__mcDimensions = new Map([[f.dim.id, f.dim]]);
    const reads = new Map();
    const loaded = new Map();
    const getBlock = f.dim.getBlock, isChunkLoaded = f.dim.isChunkLoaded;
    f.dim.getBlock = p => { const k = `${p.x},${p.y},${p.z}`; reads.set(k, (reads.get(k) || 0) + 1); return getBlock(p); };
    f.dim.isChunkLoaded = p => { const k = `${p.x},${p.y},${p.z}`; loaded.set(k, (loaded.get(k) || 0) + 1); return isChunkLoaded(p); };
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        f.put('minecraft:stone', x, 63, z);
        f.put('starstone:cable', x, 64, z, { 'starstone:connections': 0 });
    }
    const cable = await import('../starstone_bp/scripts/cableComponent.js');
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        const b = f.store.get(`${x},64,${z}`);
        b.permutation = b.permutation.withState('starstone:connections', cable.computeCableMask(b));
    }
    reads.clear(); loaded.clear();
    const seed = f.dim.getBlock({ x: 0, y: 64, z: 0 });
    const walk = discoverNetwork(seed); await drain(); const net = await walk;
    assert.equal(net.nodes.size, 256);
    // The cable layer is read once per cell; each descriptor also reads its support.
    for (const [key, count] of reads) if (key.split(',')[1] === '64') assert.equal(count, 1, `getBlock read ${key} ${count} times`);
    const total = [...reads.values()].reduce((a, b) => a + b, 0);
    assert.ok(total < 1100, `getBlock calls ${total}`);
}

// A descriptor failure still rejects the walk (it is not swallowed by the cache).
{
    const f = fixture();
    const a = f.put('starstone:cable', 0, 64, 0, { 'starstone:connections': 10 });
    f.put('starstone:cable', 1, 64, 0, { 'starstone:connections': 10 });
    f.put('minecraft:stone', 0, 63, 0); f.put('minecraft:stone', 1, 63, 0);
    const original = f.dim.getBlock;
    f.dim.getBlock = p => {
        const b = original(p);
        if (p.x === 1 && b.typeId === 'starstone:cable') b.permutation = { ...b.permutation, getState() { throw new Error('descriptor boom'); } };
        return b;
    };
    const failed = assert.rejects(discoverNetwork(a), /descriptor boom/); await drain(); await failed;
}
console.log('walkCache: ok');
