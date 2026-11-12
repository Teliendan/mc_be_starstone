// Chunk snapshot schema v1 stays readable, and a source toggle writes only a small
// overlay property (SS-06, owner choice C 2026-11-12): older saved worlds load unchanged,
// older mod versions still read the snapshot, a rebuild folds the overlay in.
import assert from 'node:assert/strict';
import { fixture } from './runtimeFixture.mjs';
const { createChunkIndex, buildChunkSegments, CHUNK_SOURCES_PREFIX } = await import('../starstone_bp/scripts/chunkIndex.js');
import { generatorDescriptor } from '../starstone_bp/scripts/electricalBlocks.js';

const dim = 'minecraft:overworld';
// Properties of one chunk exactly as written by the mod before the overlay existed
// (schema v1, one page, head with checksum): a generator that is on, two cables and a second
// generator that is off.
const V1_PROPERTIES = [
  [
    "starstone:segments:minecraft%3Aoverworld|0|0:0:0",
    "{\"v\":1,\"dimensionId\":\"minecraft:overworld\",\"cx\":0,\"cz\":0,\"segments\":[{\"key\":\"minecraft:overworld|0|0|0#main\",\"members\":[\"minecraft:overworld|0|0|0#main\",\"minecraft:overworld|1|0|0#main\",\"minecraft:overworld|2|0|0#main\"],\"sources\":[\"minecraft:overworld|0|0|0#main\"],\"activeSources\":[\"minecraft:overworld|0|0|0#main\"],\"consumers\":[],\"boundaries\":[{\"ref\":\"minecraft:overworld|0|0|0#main\",\"direction\":[-1,0,0],\"destination\":[-1,0],\"kind\":\"source\",\"mountFace\":null,\"facePair\":null},{\"ref\":\"minecraft:overworld|0|0|0#main\",\"direction\":[0,0,-1],\"destination\":[0,-1],\"kind\":\"source\",\"mountFace\":null,\"facePair\":null},{\"ref\":\"minecraft:overworld|1|0|0#main\",\"direction\":[0,-1,-1],\"destination\":[0,-1],\"kind\":\"cable\",\"mountFace\":\"up\",\"facePair\":null},{\"ref\":\"minecraft:overworld|1|0|0#main\",\"direction\":[0,0,-1],\"destination\":[0,-1],\"kind\":\"cable\",\"mountFace\":\"up\",\"facePair\":null},{\"ref\":\"minecraft:overworld|2|0|0#main\",\"direction\":[0,-1,-1],\"destination\":[0,-1],\"kind\":\"cable\",\"mountFace\":\"up\",\"facePair\":null},{\"ref\":\"minecraft:overworld|2|0|0#main\",\"direction\":[0,0,-1],\"destination\":[0,-1],\"kind\":\"cable\",\"mountFace\":\"up\",\"facePair\":null}]},{\"key\":\"minecraft:overworld|15|0|8#main\",\"members\":[\"minecraft:overworld|15|0|8#main\"],\"sources\":[\"minecraft:overworld|15|0|8#main\"],\"activeSources\":[],\"consumers\":[],\"boundaries\":[{\"ref\":\"minecraft:overworld|15|0|8#main\",\"direction\":[1,0,0],\"destination\":[1,0],\"kind\":\"source\",\"mountFace\":null,\"facePair\":null}]}]}"
  ],
  [
    "starstone:segments:minecraft%3Aoverworld|0|0:head",
    "{\"v\":1,\"bank\":0,\"pages\":1,\"length\":1452,\"checksum\":\"ad98f135\"}"
  ]
];
function disk(entries = V1_PROPERTIES) {
    const data = new Map(entries), log = [];
    return {
        data, log,
        getDynamicProperty: key => data.get(key),
        getDynamicPropertyIds: () => [...data.keys()],
        setDynamicProperty(key, value) { log.push([key, value]); if (value === undefined) data.delete(key); else data.set(key, value); }
    };
}
const warnings = [];
const open = storage => createChunkIndex(storage, { warn: text => warnings.push(text) });
const A = `${dim}|0|0|0#main`, B = `${dim}|15|0|8#main`;
const active = snapshot => snapshot.segments.flatMap(s => s.activeSources).sort();

// An existing v1 world is read unchanged, by scan and by direct read.
{
    const storage = disk(), index = open(storage);
    const snapshot = index.readChunk(dim, 0, 0);
    assert.equal(snapshot.v, 1);
    assert.equal(snapshot.segments.length, 2);
    assert.deepEqual(active(snapshot), [A]);
    assert.deepEqual([...open(disk()).chunks()].map(s => active(s)), [[A]]);
    assert.equal(warnings.length, 0);
    assert.deepEqual(index.writeChunk(JSON.parse(JSON.stringify(snapshot))), { changed: false }, 'rewriting the same snapshot is a no-op');
    assert.equal(storage.log.length, 0);
}


const OVERLAY = `${CHUNK_SOURCES_PREFIX}minecraft%3Aoverworld|0|0`;
const topology = storage => [...storage.data].filter(([key]) => key.startsWith('starstone:segments:'));

// A toggle writes under 300 bytes, only the overlay; a fresh index (restart) sees the same view.
{
    const storage = disk(), index = open(storage);
    index.readChunk(dim, 0, 0);
    const before = topology(storage);
    storage.log.length = 0;
    assert.equal(index.updateSource(B, true), true);
    const bytes = storage.log.reduce((sum, [, value]) => sum + (value?.length || 0), 0);
    assert.ok(bytes > 0 && bytes < 300, `toggle wrote ${bytes} bytes`);
    assert.deepEqual(storage.log.map(([key]) => key), [OVERLAY]);
    assert.deepEqual(topology(storage), before, 'the v1 head and pages stay exactly as an older version reads them');
    assert.deepEqual(active(index.readChunk(dim, 0, 0)), [A, B]);
    assert.deepEqual(active(open(storage).readChunk(dim, 0, 0)), [A, B], 'restart with the overlay present');
    assert.deepEqual([...open(storage).chunks()].map(active), [[A, B]], 'the scan applies it too');
    // Another toggle replaces the overlay in place.
    assert.equal(index.updateSource(A, false), true);
    assert.deepEqual(active(open(storage).readChunk(dim, 0, 0)), [B]);
    // Returning to the committed state removes the overlay.
    assert.equal(index.updateSource(A, true), true);
    assert.equal(index.updateSource(B, false), true);
    assert.equal(storage.data.has(OVERLAY), false, 'no overlay while the view equals the snapshot');
    assert.deepEqual(active(open(storage).readChunk(dim, 0, 0)), [A]);
    // A no-op toggle writes nothing.
    storage.log.length = 0;
    assert.equal(index.updateSource(A, true), true);
    assert.equal(storage.log.length, 0);
    assert.equal(index.updateSource(`${dim}|9|9|9#main`, true), false, 'an unknown source is reported');
}

// A rebuild commit folds the overlay in and deletes it.
{
    const storage = disk(), index = open(storage);
    index.updateSource(B, true);
    assert.ok(storage.data.has(OVERLAY));
    const rebuilt = JSON.parse(JSON.stringify(index.readChunk(dim, 0, 0)));
    // Same topology, block state says B is off: the overlay is dropped and the change reported.
    rebuilt.segments.find(segment => segment.sources.includes(B)).activeSources = [];
    assert.deepEqual(index.writeChunk(rebuilt), { changed: true });
    assert.equal(storage.data.has(OVERLAY), false);
    assert.deepEqual(active(index.readChunk(dim, 0, 0)), [A]);
    assert.deepEqual(active(open(storage).readChunk(dim, 0, 0)), [A]);
    // A topology change writes new pages; a toggle before it is gone with the overlay.
    index.updateSource(B, true);
    const grown = buildChunkSegments(dim, 0, 0, [
        { location: { x: 0, y: 0, z: 0 }, descriptor: generatorDescriptor({ sourceOn: true }) },
        { location: { x: 15, y: 0, z: 8 }, descriptor: generatorDescriptor({ sourceOn: false }) },
        { location: { x: 5, y: 0, z: 5 }, descriptor: generatorDescriptor({ sourceOn: false }) }
    ]);
    assert.deepEqual(index.writeChunk(grown), { changed: true });
    assert.equal(storage.data.has(OVERLAY), false);
    assert.deepEqual(active(open(storage).readChunk(dim, 0, 0)), [A]);
}

// A leftover overlay of an older snapshot is inert; a corrupt one warns once and is ignored.
{
    const storage = disk(), index = open(storage);
    index.updateSource(B, true);
    const stale = storage.data.get(OVERLAY);
    const grown = buildChunkSegments(dim, 0, 0, [
        { location: { x: 0, y: 0, z: 0 }, descriptor: generatorDescriptor({ sourceOn: true }) },
        { location: { x: 15, y: 0, z: 8 }, descriptor: generatorDescriptor({ sourceOn: false }) },
        { location: { x: 5, y: 0, z: 5 }, descriptor: generatorDescriptor({ sourceOn: false }) }
    ]);
    index.writeChunk(grown);
    storage.data.set(OVERLAY, stale); // as if the cleanup delete had not happened
    warnings.length = 0;
    assert.deepEqual(active(open(storage).readChunk(dim, 0, 0)), [A], 'an overlay of an older snapshot does not apply');
    assert.equal(warnings.length, 0, 'a stale overlay is not corruption');
    for (const garbage of ['not json', '{"v":2,"base":"x","on":[]}', '{"v":1,"base":"x","on":[1]}', '[]']) {
        const broken = disk(); broken.data.set(OVERLAY, garbage);
        warnings.length = 0;
        const reader = open(broken);
        assert.deepEqual(active(reader.readChunk(dim, 0, 0)), [A], `corrupt overlay ${garbage} is ignored`);
        reader.readChunk(dim, 0, 0); [...reader.chunks()];
        assert.equal(warnings.length, 1, 'warns once');
    }
    // Refs that are not sources of the chunk are ignored.
    const odd = disk();
    odd.data.set(OVERLAY, JSON.stringify({ v: 1, base: JSON.parse(V1_PROPERTIES[1][1]).checksum, on: [B, `${dim}|1|0|0#main`] }));
    assert.deepEqual(active(open(odd).readChunk(dim, 0, 0)), [B], 'the overlay replaces the saved sources; non-sources are ignored');
}

// A failing overlay write leaves the cached view at the committed state.
{
    const storage = disk(), index = open(storage);
    index.readChunk(dim, 0, 0);
    const set = storage.setDynamicProperty;
    storage.setDynamicProperty = () => { throw new Error('storage unavailable'); };
    assert.throws(() => index.updateSource(B, true), /storage unavailable/);
    storage.setDynamicProperty = set;
    assert.deepEqual(active(index.readChunk(dim, 0, 0)), [A]);
    assert.deepEqual(active(open(storage).readChunk(dim, 0, 0)), [A]);
}

// More sources than the overlay limit: the toggle falls back to a full snapshot write.
{
    const storage = disk(), index = open(storage);
    const entries = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        entries.push({ location: { x, y, z }, descriptor: generatorDescriptor({ sourceOn: true }) });
    }
    index.writeChunk(buildChunkSegments(dim, 0, 0, entries));
    const ref = `${dim}|3|1|4#main`;
    storage.log.length = 0;
    assert.equal(index.updateSource(ref, false), true);
    assert.equal(storage.data.has(OVERLAY), false, 'no overlay for a chunk with very many active sources');
    assert.ok(storage.log.some(([key]) => key.endsWith(':head')), 'full snapshot written');
    const view = active(open(storage).readChunk(dim, 0, 0));
    assert.equal(view.length, 511);
    assert.ok(!view.includes(ref));
}
console.log('chunk overlay: v1 snapshots readable; toggles write a small overlay; rebuild folds it in; stale/corrupt/failed overlays are safe');
