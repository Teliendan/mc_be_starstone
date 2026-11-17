// M49 (owner, 2026-11-17): after a generator toggle, a later topology commit of ANOTHER
// chunk of the same logical network must not bring back the source state the graph saw
// before the toggle. Layout: generator in chunk 0, cables through chunk 1 (unloaded at
// toggle time), lamp in chunk 2; a cable placed beside the lamp re-commits chunk 2.
import assert from 'node:assert/strict';
import { fixture, player, drain, worldProperties } from './runtimeFixture.mjs';
const controller = await import('../starstone_bp/scripts/chunkController.js');
const cable = await import('../starstone_bp/scripts/cableComponent.js');
const { reactToGeneratorToggle } = await import('../starstone_bp/scripts/generatorComponent.js');
const { buildSegmentGraph } = await import('../starstone_bp/scripts/segmentGraph.js');
const { chunkIndex } = await import('../starstone_bp/scripts/chunkIndex.js');
worldProperties();
const f = fixture(); f.dim.id = 'test:logical-source';
globalThis.__mcDimensions = new Map([[f.dim.id, f.dim]]);
const unavailable = new Set();
f.dim.isChunkLoaded = ({ x }) => !unavailable.has(Math.floor(x / 16));
globalThis.__mcPlayers = [player(f.dim)];
controller.registerChunkController();
const lit = b => b.permutation.getState('starstone:powered');
const gen = f.put('starstone:generator', 0, 0, 0);
cable.schedulePlaced(gen); cable.flushPending(); await drain();
for (let x = 1; x < 40; x++) {
    f.put('minecraft:stone', x, -1, 0);
    const block = x === 36 ? f.put('starstone:lamp', x, 0, 0) : f.put('starstone:cable', x, 0, 0);
    cable.schedulePlaced(block); cable.flushPending(); await drain();
}
const lamp = f.dim.getBlock({ x: 36, y: 0, z: 0 });
assert.equal(lit(lamp), true, 'line built and powered');

unavailable.add(1);
async function toggle() {
    gen.setPermutation(gen.permutation.withState('starstone:enabled', !gen.permutation.getState('starstone:enabled')));
    reactToGeneratorToggle(f.dim, 0, 0, 0); await drain();
}
await toggle();
assert.equal(lit(lamp), false, 'toggle off crosses unloaded chunk 1');
// A topology change in chunk 2 (a cable beside the line) re-commits that chunk only.
f.put('minecraft:stone', 37, -1, 1);
const side = f.put('starstone:cable', 37, 0, 1);
cable.schedulePlaced(side); cable.flushPending(); await drain();
assert.equal(lit(lamp), false, 'a later commit of another chunk keeps the toggled-off state');
assert.equal(lit(f.dim.getBlock({ x: 38, y: 0, z: 0 })), false, 'line beyond the lamp stays off');
// The incremental graph equals a full build over the saved snapshots (with overlays).
const full = buildSegmentGraph([...chunkIndex.chunks()], { trusted: true });
assert.equal(full.nodeToNetwork.get(`${f.dim.id}|36|0|0#main`).powered, false);

await toggle();
assert.equal(lit(lamp), true, 'toggle on reaches the lamp');
f.put('minecraft:stone', 38, -1, 1);
const side2 = f.put('starstone:cable', 38, 0, 1);
cable.schedulePlaced(side2); cable.flushPending(); await drain();
assert.equal(lit(lamp), true, 'a later commit keeps the toggled-on state');
console.log('logical source state: toggles survive later commits of other chunks passed');
