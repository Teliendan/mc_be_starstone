// M50 (owner, 2026-11-17): a cable at the edge of the loaded area kept only one arm after a
// repair pass. An unloaded neighbour is not proof that it is gone: the arm toward an
// unloaded cell (direct or around an outside edge) keeps the state it has.
import assert from 'node:assert/strict';
import { fixture, drain, worldProperties } from './runtimeFixture.mjs';
const cable = await import('../starstone_bp/scripts/cableComponent.js');
const { queueMutation } = await import('../starstone_bp/scripts/mutationController.js');
worldProperties();
const f = fixture(); f.dim.id = 'test:unloaded-arms';
globalThis.__mcDimensions = new Map([[f.dim.id, f.dim]]);
const unavailable = new Set();
f.dim.isChunkLoaded = ({ x }) => !unavailable.has(Math.floor(x / 16));
const arms = b => b.permutation.getState('starstone:connections');
const E = 2, W = 8;

// A straight line across the chunk 0 / chunk 1 border, placed as a player would.
const line = [];
for (let x = 12; x < 20; x++) {
    f.put('minecraft:stone', x, -1, 0);
    line.push(f.put('starstone:cable', x, 0, 0));
    cable.schedulePlaced(line.at(-1)); cable.flushPending(); await drain();
}
const edge = f.dim.getBlock({ x: 15, y: 0, z: 0 });
assert.equal(arms(edge), E | W, 'border cable draws both arms');
unavailable.add(1);
assert.equal(cable.computeCableMask(edge), E | W, 'an unloaded neighbour keeps its arm');
cable.refreshCable(edge);
assert.equal(arms(edge), E | W, 'refresh keeps the arm toward the unloaded chunk');
// The repair pass the periodic validation queues refreshes every loaded node of the network.
queueMutation(f.dim, { x: 13, y: 0, z: 0 }); await drain();
assert.equal(arms(edge), E | W, 'mutation repair keeps the arm toward the unloaded chunk');
// A known neighbour still decides its own arm while another is unknown.
const fresh = f.put('starstone:cable', 15, 0, 0);
assert.equal(cable.computeCableMask(fresh), W, 'a loaded neighbour adds its arm; the unknown one keeps the old 0');
f.store.set('15,0,0', edge);
unavailable.delete(1);
f.store.delete('16,0,0');
assert.equal(cable.computeCableMask(edge), W, 'a loaded, removed neighbour still drops its arm');

// Around an outside edge: floor cable on top of the support at x=15, wall cable on its
// east side (x=16, chunk 1).
const g = fixture(); g.dim.id = 'test:unloaded-arms-outer';
globalThis.__mcDimensions.set(g.dim.id, g.dim);
const gone = new Set();
g.dim.isChunkLoaded = ({ x }) => !gone.has(Math.floor(x / 16));
g.put('minecraft:stone', 15, 0, 0);
const floor = g.put('starstone:cable', 15, 1, 0, { 'minecraft:block_face': 'up' });
g.put('starstone:cable', 16, 0, 0, { 'minecraft:block_face': 'east' });
floor.setPermutation(floor.permutation.withState('starstone:connections', cable.computeCableMask(floor)));
assert.equal(arms(floor) & E, E, 'floor arm wraps the east outside edge');
gone.add(1);
assert.equal(cable.computeCableMask(floor) & E, E, 'an unloaded outside-edge neighbour keeps its arm');
console.log('unloaded arms: border and outside-edge arms survive refreshes while the neighbour chunk is unloaded passed');
