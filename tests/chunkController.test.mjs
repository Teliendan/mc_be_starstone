import assert from 'node:assert/strict';
import { mc, fixture, player, drain } from './runtimeFixture.mjs';
const controller = await import('../starstone_bp/scripts/chunkController.js');
const { placementIndex } = await import('../starstone_bp/scripts/persistence.js');
const { chunkIndex } = await import('../starstone_bp/scripts/chunkIndex.js');
const { reactToGeneratorToggle } = await import('../starstone_bp/scripts/generatorComponent.js');
const { sourceChanged, notifyNetworkDiscovered } = await import('../starstone_bp/scripts/networkEvents.js');
const repair = await import('../starstone_bp/scripts/repair.js');
const runtime = (await import('../starstone_bp/scripts/networkRuntime.js')).default;
const props = new Map();
mc.world.getDynamicProperty = key => props.get(key);
mc.world.getDynamicPropertyIds = () => [...props.keys()];
mc.world.setDynamicProperty = (key,value) => value === undefined ? props.delete(key) : props.set(key,value);
// Keys of the removed write-only families, present in an old world save.
props.set('starstone:source_state:old|0|0|0%23main',true);
props.set('starstone:logical_power:old%7C0',false);
props.set('starstone:unrelated:keep',1);
globalThis.__mcDimensions = new Map();
const f = fixture(); f.dim.id = 'test:three-chunks';
globalThis.__mcDimensions.set(f.dim.id, f.dim);
const unavailable = new Set();
f.dim.isChunkLoaded = ({x}) => !unavailable.has(Math.floor(x/16));
let unloadedReads = 0;
const rawRead = f.dim.getBlock;
f.dim.getBlock = position => {
    if (!f.dim.isChunkLoaded(position)) { unloadedReads++; throw new Error('Unloaded block access'); }
    return rawRead(position);
};
const user = player(f.dim); globalThis.__mcPlayers = [user];
controller.registerChunkController();
const source = f.put('starstone:generator',0,0,0);
const blocks = [source];
for (let x=1;x<32;x++) { blocks.push(f.put('starstone:cable',x,0,0)); f.put('minecraft:stone',x,-1,0); }
const lamp = f.put('starstone:lamp',32,0,0); f.put('minecraft:stone',32,-1,0); blocks.push(lamp);
for (const block of blocks) placementIndex.record(block);
await drain();
repair.startRebuildNearby(user,{radius:8,height:1}); await drain();
assert.equal(lamp.permutation.getState('starstone:powered'),true,'initial metadata connects A-B-C');
assert.ok(chunkIndex.readChunk(f.dim.id,1,0).segments[0].members.length >= 16);
// Breaking a conductor in the middle chunk must invalidate the distant lamp,
// even though both the source and consumer remain in other chunks.
f.store.delete('16,0,0');
placementIndex.remove(f.dim.id,{x:16,y:0,z:0});
await drain();
assert.equal(lamp.permutation.getState('starstone:powered'),false,'middle-chunk break turns off distant lamp');
const restored = f.put('starstone:cable',16,0,0);
placementIndex.record(restored);
await drain();
assert.equal(lamp.permutation.getState('starstone:powered'),true,'repaired middle-chunk link powers distant lamp');
controller.pollLoadedChunks(); await drain();
const standing = controller.chunkStats().builds;
const propertyRead = mc.world.getDynamicProperty;
let standingMetadataReads = 0;
mc.world.getDynamicProperty = key => { standingMetadataReads++; return propertyRead(key); };
controller.pollLoadedChunks(); await drain();
assert.equal(controller.chunkStats().builds,standing,'standing in a loaded chunk never repeats reconciliation');
assert.equal(standingMetadataReads,0,'standing observer uses cached metadata candidates');
mc.world.getDynamicProperty = propertyRead;

unavailable.add(1); controller.pollLoadedChunks(); await drain();
const beforeToggle = controller.chunkStats().builds;
const owner = runtime.networkIdOf(`${f.dim.id}|0|0|0#main`);
source.setPermutation(source.permutation.withState('starstone:enabled',false));
reactToGeneratorToggle(f.dim,0,0,0); await drain();
assert.equal(lamp.permutation.getState('starstone:powered'),false,'A toggle crosses unloaded B using metadata');
assert.equal(controller.chunkStats().builds,beforeToggle,'source toggles do not rebuild chunk topology');
assert.equal(runtime.networkIdOf(`${f.dim.id}|0|0|0#main`),owner,'source toggle keeps runtime network identity');
assert.equal(chunkIndex.readChunk(f.dim.id,0,0).segments.flatMap(s=>s.activeSources).length,0,'source persisted');

unavailable.add(2); controller.pollLoadedChunks(); await drain();
source.setPermutation(source.permutation.withState('starstone:enabled',true));
reactToGeneratorToggle(f.dim,0,0,0); await drain();
assert.equal(lamp.permutation.getState('starstone:powered'),false,'unloaded C is not written');
unavailable.delete(2); user.location.x = 32;
controller.pollLoadedChunks(); await drain();
assert.equal(lamp.permutation.getState('starstone:powered'),true,'reloaded C receives latest logical state across unloaded B');
assert.equal(unloadedReads,0,'controllers never read unloaded B or C blocks');

// A source change while a yielded snapshot is in flight invalidates its revision
// before it can overwrite the newer durable source state.
controller.queueChunkRebuild(f.dim,0,0);
const originalJob = globalThis.__mcRunJob;
let injected = false;
globalThis.__mcRunJob = generator => originalJob(function* () {
    let next = generator.next();
    while (!next.done) {
        if (!injected) {
            injected = true;
            source.setPermutation(source.permutation.withState('starstone:enabled',false));
            sourceChanged(f.dim,source.location,false);
        }
        yield next.value;
        next = generator.next();
    }
}());
await drain(); globalThis.__mcRunJob = originalJob;
assert.equal(injected,true);
assert.ok(controller.chunkStats().staleBuilds > 0,'stale snapshot is discarded');
assert.equal(chunkIndex.readChunk(f.dim.id,0,0).segments.flatMap(s=>s.activeSources).length,0);
assert.equal(lamp.permutation.getState('starstone:powered'),false);

// Failure committing source metadata must leave consumer visuals unchanged.
const writes = lamp.writes;
const store = mc.world.setDynamicProperty;
mc.world.setDynamicProperty = () => { throw new Error('simulated disk full'); };
source.setPermutation(source.permutation.withState('starstone:enabled',true));
assert.throws(()=>sourceChanged(f.dim,source.location,true),/disk full/);
await drain();
assert.equal(lamp.writes,writes);
mc.world.setDynamicProperty = store;
sourceChanged(f.dim,source.location,true); await drain();
assert.equal(lamp.permutation.getState('starstone:powered'),true);
assert.equal(unloadedReads,0);

// A chunk can disappear between the availability probe and the actual read;
// indexing failure must remain retryable rather than escape from a runJob.
const late = f.put('starstone:generator',64,0,0);
const guardedRead = f.dim.getBlock;
let failRead = true;
f.dim.getBlock = position => {
    if (position.x === 64 && failRead) { failRead = false; throw new Error('read raced unload'); }
    return guardedRead(position);
};
notifyNetworkDiscovered({nodes:new Set([`${f.dim.id}|64|0|0#main`]),sources:new Set()},f.dim);
await drain();
assert.equal(controller.chunkStats().discoveryRetry,1);
assert.equal(chunkIndex.readChunk(f.dim.id,4,0),undefined,'incomplete indexing cannot publish a chunk');
controller.pollLoadedChunks(); await drain();
assert.equal(controller.chunkStats().discoveryRetry,0);
assert.ok(chunkIndex.readChunk(f.dim.id,4,0).segments.some(s=>s.members.includes(`${f.dim.id}|64|0|0#main`)));
f.dim.getBlock = guardedRead;

const later = f.put('starstone:generator',80,0,0);
let failIndex = true;
mc.world.setDynamicProperty = (key,value) => {
    if (failIndex && key.startsWith('starstone:placement:')) { failIndex = false; throw new Error('index write unavailable'); }
    return store(key,value);
};
notifyNetworkDiscovered({nodes:new Set([`${f.dim.id}|80|0|0#main`]),sources:new Set()},f.dim);
await drain();
assert.equal(controller.chunkStats().discoveryRetry,1);
mc.world.setDynamicProperty = store;
controller.pollLoadedChunks(); await drain();
assert.equal(controller.chunkStats().discoveryRetry,0);
assert.ok(placementIndex.positionsInChunk(f.dim.id,5,0).some(p=>p.x===80));

// Placement removal has already committed when its change listener runs; the
// now-source-free chunk must still reconcile across unloaded intermediate metadata.
assert.equal(lamp.permutation.getState('starstone:powered'),true);
f.store.delete('0,0,0');
placementIndex.remove(f.dim.id,source.location);
assert.ok(controller.chunkStats().queued > 0,'metadata repair queues on placement removal');
assert.ok(!placementIndex.positionsInChunk(f.dim.id,0,0).some(p=>p.x===0),'placement removal really committed');
await drain();
assert.equal(chunkIndex.readChunk(f.dim.id,0,0).segments.flatMap(s=>s.sources).length,0);
assert.equal(lamp.permutation.getState('starstone:powered'),false,'removed source cannot power C across unloaded B');
const ids = [...props.keys()];
assert.ok(!ids.some(k=>k.startsWith('starstone:source_state:')||k.startsWith('starstone:logical_power:')),'obsolete keys swept and never rewritten');
assert.equal(props.get('starstone:unrelated:keep'),1,'sweep touches only the two obsolete prefixes');
assert.ok(ids.some(k=>k.startsWith('starstone:placement:')),'placement index untouched by sweep');
assert.ok(chunkIndex.readChunk(f.dim.id,0,0),'chunk snapshots untouched by sweep');
assert.equal(unloadedReads,0);
console.log('chunk controller: integrated A-B-C continuity, source durability, unload/reload, observer dedup and revision guard passed');
