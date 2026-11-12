// SS-09: power visuals are written by one engine-paced job. Every job step reads
// one block and writes at most one permutation; a newer state supersedes an older
// unread one; unloaded nodes stay pending. Fixture turns run ONE step of every
// job per turn, so a turn equals a job step here.
import assert from 'node:assert/strict';
import { fixture, drain } from './runtimeFixture.mjs';
const { applyPower, powerStats, pendingUnresolved } = await import('../starstone_bp/scripts/powerPropagation.js');

const f = fixture(), refs = new Set();
for (let x=0;x<257;x++) {
    f.put(x===256?'starstone:lamp':'starstone:cable',x,0,0);
    refs.add(`${f.dim.id}|${x}|0|0#main`);
}
let reads=0, writes=0;
const getBlock=f.dim.getBlock;
f.dim.getBlock=p=>{
    assert.equal(f.dim.isChunkLoaded(p),true,'the writer never reads an unloaded block');
    reads++; return getBlock(p);
};
const cell=x=>getBlock({x,y:0,z:0});
const powered=x=>cell(x).permutation.getState('starstone:powered');
// Count permutation writes and the order they happen in.
const writeOrder=[];
for (let x=0;x<257;x++) {
    const block=cell(x), write=block.setPermutation;
    block.setPermutation=function(perm) { writes++; writeOrder.push(x); return write.call(this,perm); };
}
// Measure every job step: reads and writes between two yields.
const runJob=globalThis.__mcRunJob;
let steps=0, maxReads=0, maxWrites=0;
globalThis.__mcRunJob=job=>runJob((function*() {
    for (;;) {
        const beforeReads=reads, beforeWrites=writes;
        const result=job.next();
        steps++;
        maxReads=Math.max(maxReads,reads-beforeReads);
        maxWrites=Math.max(maxWrites,writes-beforeWrites);
        if (result.done) return result.value;
        yield;
    }
})());

// Nothing is read or written until the job runs; one read and at most one write per step.
const on=applyPower({nodes:refs,powered:true},f.dim);
assert.equal(reads,0,'applyPower does not read the world synchronously');
assert.equal(on.pending,refs.size);
assert.equal(powerStats().queued,refs.size);
assert.equal(powerStats().peakQueued,refs.size);
assert.equal(powerStats().planning,1,'the writer job is running');
await drain();
assert.equal(on.pending,0);
assert.equal(on.written,refs.size);
assert.equal(writes,refs.size);
assert.equal(maxReads,1,'a step reads one block');
assert.equal(maxWrites,1,'a step writes at most one permutation');
assert.ok(steps>=refs.size,`one step per node (${steps})`);
assert.equal(powerStats().queued,0);
assert.equal(powerStats().planning,0);
for (let x=0;x<257;x++) assert.equal(powered(x),true);

// A lamp hundreds of cables from the source is switched before the cables.
writeOrder.length=0;
const farLamp=`${f.dim.id}|256|0|0#main`;
applyPower({nodes:refs,consumers:new Set([farLamp]),powered:false},f.dim);
await drain();
assert.equal(writeOrder[0],256,'distant lamp is switched off before the cables');
assert.equal(powered(256),false);
applyPower({nodes:refs,consumers:new Set([farLamp]),powered:true},f.dim);
await drain();

// An unchanged network writes nothing.
const before=powerStats().appliedWrites;
const unchanged=applyPower({nodes:refs,powered:true},f.dim);
await drain();
assert.equal(unchanged.written,0);
assert.equal(powerStats().appliedWrites,before,'unchanged network writes nothing');

// A newer state supersedes an older unread one: large off, large on, then a small off.
const old=applyPower({nodes:refs,powered:false},f.dim);
const newer=applyPower({nodes:refs,powered:true},f.dim);
assert.equal(old.pending,0,'a superseded target is no longer pending');
assert.equal(powerStats().queued,refs.size,'one target per node');
const one=`${f.dim.id}|100|0|0#main`;
applyPower({nodes:new Set([one]),powered:false},f.dim);
await drain();
assert.equal(newer.pending,0);
for (let x=0;x<257;x++) assert.equal(powered(x),x!==100,'small result supersedes an older large pass');
assert.equal(old.written,0,'the superseded pass wrote nothing');

// An unloaded node lands in pendingUnresolved and is written after it loads.
f.unloaded.add('256,0,0');
const off=applyPower({nodes:refs,powered:false},f.dim);
await drain();
assert.equal(off.unresolved,1);
assert.ok(pendingUnresolved().has(farLamp));
f.unloaded.clear();
assert.equal(powered(256),true,'the unloaded lamp was not touched');
applyPower({nodes:refs,powered:false},f.dim);
await drain();
assert.equal(powered(256),false);
assert.ok(!pendingUnresolved().has(farLamp));

// Bridge lanes stay independent.
const bridge=f.put('starstone:bridge',300,0,0);
const ns=`${f.dim.id}|300|0|0#ns`, ew=`${f.dim.id}|300|0|0#ew`;
applyPower({nodes:new Set([...refs,ns,ew]),powered:true},f.dim);
applyPower({nodes:new Set([ew]),powered:false},f.dim);
await drain();
assert.equal(bridge.permutation.getState('starstone:powered_ns'),true);
assert.equal(bridge.permutation.getState('starstone:powered_ew'),false,'per-lane target keys preserve bridge lane isolation');

// A failing scheduler does not lock the writer; the next request runs.
const measured=globalThis.__mcRunJob;
let reject=true;
globalThis.__mcRunJob=job=>{ if (reject) throw new Error('scheduler unavailable'); return measured(job); };
assert.throws(()=>applyPower({nodes:refs,powered:false},f.dim),/scheduler unavailable/);
assert.equal(powerStats().planning,0,'scheduler failure clears the running flag');
reject=false;
applyPower({nodes:refs,powered:false},f.dim);
await drain();
assert.equal(powerStats().queued,0,'scheduler failure does not lock future writes');
assert.equal(powered(0),false);
globalThis.__mcRunJob=runJob;
console.log('power writer: one read and one write per job step, consumers first, no-op, superseding targets, unloaded nodes, bridge lanes and scheduler failure passed');
