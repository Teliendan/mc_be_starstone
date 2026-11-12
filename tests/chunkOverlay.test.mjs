// Chunk snapshot schema v1 stays readable, and a source toggle writes only a small
// overlay property (SS-06, owner choice C 2026-11-12): older saved worlds load unchanged,
// older mod versions still read the snapshot, a rebuild folds the overlay in.
import assert from 'node:assert/strict';
import { fixture } from './runtimeFixture.mjs';
const { createChunkIndex } = await import('../starstone_bp/scripts/chunkIndex.js');

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

console.log('chunk overlay: v1 snapshots stay readable');
