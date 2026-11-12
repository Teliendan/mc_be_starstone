// Offline algorithm measurements. Scheduler steps here are NOT Minecraft ticks.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fixture, drain } from './runtimeFixture.mjs';
const { discoverNetwork } = await import('../starstone_bp/scripts/networkGraph.js');
const { applyPower, powerStats } = await import('../starstone_bp/scripts/powerPropagation.js');
const { createPlacementIndex } = await import('../starstone_bp/scripts/persistence.js');
const { buildIndexedChunkSegments, createChunkIndex } = await import('../starstone_bp/scripts/chunkIndex.js');
const { buildSegmentGraph } = await import('../starstone_bp/scripts/segmentGraph.js');

for (const count of [1000,5000,10000]) {
    const heapStart=process.memoryUsage().heapUsed;
    const f = fixture();
    f.dim.id = `test:stress_${count}`;
    const values = new Map();
    const storage = {
        getDynamicProperty: k => values.get(k), getDynamicPropertyIds: () => [...values.keys()],
        setDynamicProperty(k,v) { if (v === undefined) values.delete(k); else values.set(k,v); }
    };
    const placements = createPlacementIndex(storage);
    const chunks = createChunkIndex(storage);
    const source = f.put('starstone:generator',0,0,0);
    placements.record(source);
    for (let x=1; x<=count; x++) placements.record(f.put('starstone:cable',x,0,0,{'starstone:connections':10}));
    let jobSteps = 0, reads=0, maxStepReads=0, peakQueued=0, peakPlanning=0, powerSteps=0, measuring=false;
    const getBlock=f.dim.getBlock;
    f.dim.getBlock=p=>{ reads++; return getBlock(p); };
    const job = globalThis.__mcRunJob;
    globalThis.__mcRunJob = generator => job((function*() {
        while (true) {
            jobSteps++; const before=reads;
            const result=generator.next();
            if (measuring) { powerSteps++; maxStepReads=Math.max(maxStepReads,reads-before); peakQueued=Math.max(peakQueued,powerStats().queued); }
            if (result.done) return result.value;
            yield result.value;
        }
    })());
    const start = performance.now();
    const discovery = discoverNetwork(source);
    await drain();
    const net = await discovery;
    assert.equal(net.nodes.size,count+1);
    const topologyMs = performance.now()-start, topologyJobSteps=jobSteps;
    let segmentSteps=0;
    const segmentStart = performance.now();
    for (let cx=0;cx<=Math.floor(count/16);cx++) {
        const generator = buildIndexedChunkSegments(f.dim,cx,0,placements);
        let result;
        do { result=generator.next(); segmentSteps++; } while (!result.done);
        chunks.writeChunk(result.value);
    }
    const logical=buildSegmentGraph([...chunks.chunks()]);
    assert.equal(logical.networks.length,1);
    assert.equal(logical.networks[0].nodes.size,count+1);
    assert.equal(logical.networks[0].powered,true);
    const segmentMs=performance.now()-segmentStart;
    const before=powerStats().appliedWrites;
    measuring=true;
    const powerStart=performance.now();
    const beforeReads=reads;
    applyPower({...net,powered:true},f.dim);
    const synchronousPowerReads=reads-beforeReads;
    peakQueued=powerStats().peakQueued;
    peakPlanning=powerStats().planning || 0;
    await drain();
    measuring=false;
    assert.equal(powerStats().appliedWrites-before,count);
    assert.equal(maxStepReads,1,'one read per power job step');
    assert.equal(f.dim.getBlock({x:count,y:0,z:0}).permutation.getState('starstone:powered'),true);
    console.log(JSON.stringify({cables:count,topologyJobSteps,topologyMs:Math.round(topologyMs),segmentSteps,segmentMs:Math.round(segmentMs),powerJobSteps:powerSteps,powerMs:Math.round(performance.now()-powerStart),synchronousPowerReads,maxStepReads,peakQueued,peakPlanning,heapDeltaBytes:process.memoryUsage().heapUsed-heapStart,dynamicPropertyBytes:[...values.values()].reduce((sum,v)=>sum+Buffer.byteLength(v,'utf8'),0),maxPropertyBytes:Math.max(...[...values.values()].map(v=>Buffer.byteLength(v,'utf8'))),gameTicks:'not measured',watchdog:'not available in Node'}));
    globalThis.__mcRunJob=job;
}
