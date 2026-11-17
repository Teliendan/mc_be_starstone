// M50 (owner, 2026-11-17): skipped power writes and inner-corner arms around unloaded chunks.
//  1. Writes to an unloaded chunk are remembered per chunk (latest desired state wins) and
//     re-applied by catchUpPending a few ticks after the chunk is back, touching only that
//     chunk's nodes; cost follows the number of pending chunks and is zero with none.
//  2. An inner corner keeps its arm toward an unloaded neighbour like a straight cable does.
import assert from 'node:assert/strict';
import { fixture, drain, worldProperties } from './runtimeFixture.mjs';
import { withFacePair, armsFromPermutation, withArms, ARM_BIT } from '../starstone_bp/scripts/innerCorner.js';
const power = await import('../starstone_bp/scripts/powerPropagation.js');
const cable = await import('../starstone_bp/scripts/cableComponent.js');
worldProperties();

// --- 1. pending writes ----------------------------------------------------------
const f = fixture(); f.dim.id = 'test:catchup';
const gone = new Set();
let probes = 0;
f.dim.isChunkLoaded = ({ x }) => { probes++; return !gone.has(Math.floor(x / 16)); };
const ref = x => `${f.dim.id}|${x}|0|0#main`;
const lit = x => f.store.get(`${x},0,0`).permutation.getState('starstone:powered');
for (const x of [2, 3, 18, 19, 34]) f.put('starstone:cable', x, 0, 0);
assert.equal(power.catchUpPending(), 0, 'nothing pending: nothing to do');
probes = 0; power.catchUpPending();
assert.equal(probes, 0, 'no pending chunk, no probe');

gone.add(1); gone.add(2);
power.applyPower({ nodes: new Set([ref(2), ref(3), ref(18), ref(19), ref(34)]), powered: true }, f.dim);
await drain();
assert.equal(lit(2), true); assert.equal(lit(3), true);
assert.equal(lit(18), false, 'unloaded chunk untouched');
assert.equal(power.pendingUnresolved().size, 3, 'three skipped nodes in two chunks');
probes = 0;
assert.equal(power.catchUpPending(), 0, 'still unloaded: nothing queued');
assert.equal(probes, 2, 'one probe per pending chunk, not per node');

// The latest desired state wins: a newer target for one node replaces the skipped one.
power.applyPower({ nodes: new Set([ref(19)]), powered: false }, f.dim);
await drain();
assert.equal(power.pendingUnresolved().get(ref(19)).powered, false, 'entry holds the newest state');
// Chunk 1 returns; chunk 2 stays away. Only chunk 1 nodes are re-applied.
gone.delete(1);
const before = power.powerStats().appliedWrites;
assert.equal(power.catchUpPending(), 2, 'only the returned chunk\'s pending nodes are queued');
await drain();
assert.equal(lit(18), true);
assert.equal(lit(19), false, 'the newest (off) target was kept');
assert.equal(power.powerStats().appliedWrites - before, 1, 'one write: the node that differed');
assert.equal(power.pendingUnresolved().size, 1, 'the other chunk is still pending');
probes = 0; power.catchUpPending();
assert.equal(probes, 1);
// A node with a newer queued target is not overwritten by its stale entry.
power.applyPower({ nodes: new Set([ref(34)]), powered: false }, f.dim);
gone.delete(2);
power.catchUpPending();
await drain();
assert.equal(lit(34), false, 'newer off target beats the skipped on entry');
assert.equal(power.pendingUnresolved().size, 0, 'all entries cleared');
probes = 0; assert.equal(power.catchUpPending(), 0); assert.equal(probes, 0, 'idle again: zero probes');
// Bounded: a block that is gone is dropped, not kept forever.
gone.add(2);
power.applyPower({ nodes: new Set([ref(34)]), powered: true }, f.dim); await drain();
assert.equal(power.pendingUnresolved().size, 1);
f.store.delete('34,0,0'); gone.delete(2);
power.catchUpPending(); await drain();
assert.equal(power.pendingUnresolved().size, 0, 'a removed block leaves no pending entry');
assert.ok(power.PENDING_CATCHUP_INTERVAL_TICKS >= 10 && power.PENDING_CATCHUP_INTERVAL_TICKS <= 20);

// --- 2. inner corner arms -------------------------------------------------------
const g = fixture(); g.dim.id = 'test:catchup-inner';
const away = new Set();
g.dim.isChunkLoaded = ({ x }) => !away.has(Math.floor(x / 16));
for (const [x, y, z] of [[15, -1, 0], [14, 0, 0], [16, -1, 0], [14, 1, 0]]) g.put('minecraft:stone', x, y, z);
let corner = g.put('starstone:inner_corner', 15, 0, 0);
corner.setPermutation(withFacePair(corner.permutation, 'up_east'));
const floor = g.put('starstone:cable', 16, 0, 0, { 'minecraft:block_face': 'up' });
const arms = () => armsFromPermutation(corner.permutation);
cable.refreshInnerCorner(corner, { notify: false });
const drawn = arms();
assert.notEqual(drawn, 0, 'a floor cable in the next chunk draws an arm');
away.add(1);
assert.equal(cable.computeInnerCornerState(corner).arms, drawn, 'unloaded neighbour keeps the drawn arm');
cable.refreshInnerCorner(corner, { notify: false });
assert.equal(arms(), drawn, 'refresh keeps it');
away.delete(1);
g.store.delete('16,0,0');
cable.refreshInnerCorner(corner, { notify: false });
assert.equal(arms(), 0, 'a loaded, removed neighbour still drops its arm');
console.log('pending catch-up: per-chunk skipped writes, latest state wins, bounded, idle cost zero; inner corner arms keep unloaded neighbours passed');
