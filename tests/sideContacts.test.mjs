// Owner test feedback 2026-10-26: contacts a player builds beside a device
// rather than on it.
//   1. A floor cable beside a horizontal conduit's end reaches into it.
//   2. An inner corner laid over a conduit end carries the conduit's power.
//   3. A lamp (or bridge, adapter) on top of a block meets a cable on that
//      block's side around the outside edge.
import assert from 'node:assert/strict';
import { fixture, drain } from './runtimeFixture.mjs';
const { scheduleAffected, flushPending } = await import('../starstone_bp/scripts/cableComponent.js');
const { descriptorForBlock } = await import('../starstone_bp/scripts/electricalBlocks.js');
const { discoverNetwork } = await import('../starstone_bp/scripts/networkGraph.js');
const { buildChunkSegments, validateChunkSegments } = await import('../starstone_bp/scripts/chunkIndex.js');
const { buildSegmentGraph } = await import('../starstone_bp/scripts/segmentGraph.js');
const { withFacePair } = await import('../starstone_bp/scripts/innerCorner.js');
const { refreshAdapterVisuals } = await import('../starstone_bp/scripts/redstoneAdapters.js');

const N = 1, E = 2, S = 4, W = 8;
const stones = (f, list) => list.forEach(([x,y,z]) => f.put('minecraft:stone',x,y,z));
function settle(...blocks) {
    for (const block of blocks) scheduleAffected(block);
    flushPending(); flushPending();
}
async function reaches(f, seed, x, y, z, lane = 'main') {
    const promise = discoverNetwork(seed); await drain();
    return (await promise).nodes.has(`${f.dim.id}|${x}|${y}|${z}#${lane}`);
}
// Saved segments, split by chunk, must form one powered network.
function savedNetworks(f, blocks) {
    const chunks = [...new Set(blocks.map(b => b.location.x >> 4))];
    const snapshots = chunks.map(cx => buildChunkSegments(f.dim.id, cx, 0, blocks
        .filter(b => b.location.x >> 4 === cx)
        .map(b => ({ location: b.location, descriptor: descriptorForBlock(b) }))));
    for (const snapshot of snapshots) assert.equal(validateChunkSegments(snapshot), true);
    return buildSegmentGraph(snapshots).networks;
}

// --- 1. Floor cable beside a horizontal conduit end ---------------------------
{
    const f = fixture(); f.dim.id = 'test:conduit-side';
    stones(f, [[1,-1,0],[2,-1,0],[3,-1,0]]);
    const source = f.put('starstone:generator',-1,0,0);
    const conduit = f.put('starstone:conduit',0,0,0,{'starstone:axis':'x'});
    const cable = f.put('starstone:cable',1,0,0,{'minecraft:block_face':'up'});
    const cable2 = f.put('starstone:cable',2,0,0,{'minecraft:block_face':'up'});
    const lamp = f.put('starstone:lamp',3,0,0,{'minecraft:block_face':'up'});
    settle(cable, cable2);
    assert.equal(cable.permutation.getState('starstone:connections'), E|W, 'floor cable extends its arm into the conduit end');
    assert.ok(await reaches(f, source, 3,0,0), 'generator -> conduit -> floor cable -> lamp');
    const networks = savedNetworks(f, [source, conduit, cable, cable2, lamp]);
    assert.equal(networks.length, 1); assert.equal(networks[0].powered, true);

    // The conduit's side is not a contact: a z-axis conduit ends north and south.
    conduit.setPermutation(conduit.permutation.withState('starstone:axis','z'));
    settle(cable);
    assert.equal(cable.permutation.getState('starstone:connections'), E, 'no arm into a conduit side');
    assert.ok(!(await reaches(f, source, 3,0,0)), 'a conduit side carries nothing');
}

// --- 2. Inner corner laid over a conduit end ------------------------------------
{
    const f = fixture(); f.dim.id = 'test:conduit-corner';
    stones(f, [[1,-1,0],[2,-1,0],[3,-1,0]]);
    const source = f.put('starstone:generator',-1,0,0);
    const conduit = f.put('starstone:conduit',0,0,0,{'starstone:axis':'x'});
    const corner = f.put('starstone:inner_corner',1,0,0);
    corner.setPermutation(withFacePair(corner.permutation,'up_east'));
    const cable = f.put('starstone:cable',2,0,0,{'minecraft:block_face':'up'});
    const lamp = f.put('starstone:lamp',3,0,0,{'minecraft:block_face':'up'});
    settle(corner, cable);
    assert.ok(await reaches(f, source, 1,0,0), 'the corner face on the conduit end takes its power');
    assert.ok(await reaches(f, source, 3,0,0), 'generator -> conduit -> inner corner -> cable -> lamp');
    const networks = savedNetworks(f, [source, conduit, corner, cable, lamp]);
    assert.equal(networks.length, 1); assert.equal(networks[0].powered, true);
}

// --- 3. Lamp on top of a block, cable on the block's side ----------------------
{
    const f = fixture(); f.dim.id = 'test:lamp-edge';
    stones(f, [[0,0,0]]);
    const source = f.put('starstone:generator',1,-1,0);
    const cable = f.put('starstone:cable',1,0,0,{'minecraft:block_face':'east'});
    const lamp = f.put('starstone:lamp',0,1,0,{'minecraft:block_face':'up'});
    settle(cable, lamp);
    // On an east wall local_n is up and local_s is down (toward the generator).
    assert.equal(cable.permutation.getState('starstone:connections'), N|S, 'wall cable reaches over the edge to the lamp');
    assert.ok(await reaches(f, source, 0,1,0), 'generator -> wall cable -> lamp around the outside edge');
    const networks = savedNetworks(f, [source, cable, lamp]);
    assert.equal(networks.length, 1); assert.equal(networks[0].powered, true);
}

// The same edge for a bridge, across a chunk border: the wall cable feeds the
// east-west lane only.
{
    const f = fixture(); f.dim.id = 'test:bridge-edge';
    stones(f, [[15,0,0]]);
    const source = f.put('starstone:generator',16,-1,0);
    const cable = f.put('starstone:cable',16,0,0,{'minecraft:block_face':'east'});
    const bridge = f.put('starstone:bridge',15,1,0,{'minecraft:block_face':'up'});
    settle(cable, bridge);
    assert.equal(cable.permutation.getState('starstone:connections'), N|S);
    assert.ok(await reaches(f, source, 15,1,0,'ew'), 'wall cable feeds the bridge east-west lane over the edge');
    assert.ok(!(await reaches(f, source, 15,1,0,'ns')), 'the north-south lane stays isolated');
    const networks = savedNetworks(f, [source, cable, bridge]);
    const powered = networks.filter(network => network.powered);
    assert.equal(powered.length, 1);
    assert.ok(powered[0].nodes.has(`${f.dim.id}|15|1|0#ew`), 'saved segments join the bridge lane across the chunk border');
}

// An adapter on top draws its blue arm toward the edge, like a cable.
{
    const f = fixture(); f.dim.id = 'test:adapter-edge';
    stones(f, [[0,0,0]]);
    f.put('starstone:cable',1,0,0,{'minecraft:block_face':'east'});
    const output = f.put('starstone:redstone_output',0,1,0,{'minecraft:block_face':'up'});
    refreshAdapterVisuals(output);
    assert.equal(output.permutation.getState('starstone:connections'), E, 'adapter blue arm points at the wrapped edge');
}

console.log('side contacts: conduit ends from beside, inner corner over a conduit end, lamp/bridge/adapter around an outside edge passed');
