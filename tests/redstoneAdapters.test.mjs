import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,drain} from './runtimeFixture.mjs';
import {FACE_LIST,worldOffset,supportOffset} from '../starstone_bp/scripts/surfaceFrame.js';
const {recheckInputs,trackInput,adapterStats,registerRedstoneAdapters,reactToRedstoneUpdate}=await import('../starstone_bp/scripts/redstoneAdapters.js');
const {discoverAndRegisterNetwork}=await import('../starstone_bp/scripts/networkController.js');
const {applyPower}=await import('../starstone_bp/scripts/powerPropagation.js');
const {default:runtime}=await import('../starstone_bp/scripts/networkRuntime.js');
const timers=new Map();let timerSerial=0;
globalThis.__mcRunInterval=(fn,ticks)=>{const id=++timerSerial;timers.set(id,{fn,ticks});return id;};
globalThis.__mcClearRun=id=>timers.delete(id);
registerRedstoneAdapters();
assert.equal(timers.size,0,'no idle input recovery timer');
const event=(input,power,previous=0)=>{
  input.redstonePower=power;
  reactToRedstoneUpdate({block:input,powerLevel:power,previousPowerLevel:previous});
};
for(const face of FACE_LIST) {
  runtime.clearNetworks();
  const f=fixture();f.dim.id=`test:native_${face}`;
  const input=f.put('starstone:redstone_input',0,0,0,{'minecraft:block_face':face});input.redstonePower=0;
  const [sx,sy,sz]=supportOffset(face);const support=f.put('minecraft:stone',sx,sy,sz);
  const [x,y,z]=worldOffset(face,'local_e');
  const output=f.put('starstone:redstone_output',x,y,z,{'minecraft:block_face':face});
  f.put('minecraft:stone',x+sx,y+sy,z+sz);
  const pending=discoverAndRegisterNetwork(input);await drain();const net=await pending;
  const id=runtime.networkIdOf(`${f.dim.id}|0|0|0#main`);
  assert.equal(timers.size,1);assert.equal([...timers.values()][0].ticks,100,'slow recovery, not signal polling');
  assert.equal(adapterStats().mode,'native');
  support.redstonePower=15;recheckInputs();await drain();
  assert.equal(input.permutation.getState('starstone:powered'),false,'neighbor-only power cannot override receiver off');
  event(input,1);assert.equal(input.permutation.getState('starstone:powered'),true,'native source commits in callback');
  await drain();assert.equal(output.permutation.getState('starstone:powered'),true,`${face} native on`);
  const count=adapterStats().transitions,writes=output.writes;
  event(input,15,1);event(input,7,15);await drain();
  assert.equal(adapterStats().transitions,count,'analog changes do not create binary edges');assert.equal(output.writes,writes);
  event(input,0,7);await drain();
  assert.equal(output.permutation.getState('starstone:powered'),false,`${face} native off despite powered neighbor`);
  assert.equal(runtime.networkIdOf(`${f.dim.id}|0|0|0#main`),id,'native changes preserve topology');
  applyPower({...net,powered:true},f.dim);await drain();
  assert.equal(input.permutation.getState('starstone:powered'),false,'blue conduction cannot overwrite red source');
  applyPower({...net,powered:false},f.dim);await drain();
  // Dispatched callback cases, not native observer/game measurements.
  event(input,0);await drain();
  for(let phase=0;phase<4;phase++) {
    const before=output.writes;
    for(let tick=0;tick<8;tick++) {
      if(tick===phase)event(input,15);
      if(tick===phase+2)event(input,0,15);
      await drain();
      assert.equal(output.permutation.getState('starstone:powered'),tick>=phase&&tick<phase+2);
    }
    assert.equal(output.writes,before+2,`dispatched two-tick pulse at phase ${phase}`);
  }
  input.redstonePower=15;recheckInputs();await drain();
  assert.equal(input.permutation.getState('starstone:powered'),false,'periodic pass never reads power; callbacks own it');
  const [rx,ry,rz]=worldOffset(face,'local_n');f.put('minecraft:lever',rx,ry,rz);
  recheckInputs();await drain();assert.ok(input.permutation.getState('starstone:redstone_connections'),'slow refresh retains command-edit cosmetics');
  f.store.delete('0,0,0');recheckInputs();await drain();
  assert.equal(timers.size,0,'last stale receiver stops its timer');
}
// First tracking reads the input's own power once (load/placement initialisation).
{
  runtime.clearNetworks();
  const f=fixture();f.dim.id='test:initial_read';
  const b=f.put('starstone:redstone_input',0,0,0);b.redstonePower=15;
  trackInput(b);await drain();
  assert.equal(b.permutation.getState('starstone:powered'),true,'initial read powers a pre-powered input');
  b.redstonePower=0;recheckInputs();await drain();
  assert.equal(b.permutation.getState('starstone:powered'),true,'later passes do not re-read power');
  f.store.delete('0,0,0');recheckInputs();await drain();
}
// Two native sources retain binary OR ownership without a topology rebuild.
{
  runtime.clearNetworks();
  const f=fixture();f.dim.id='test:two_native_sources';
  const left=f.put('starstone:redstone_input',0,0,0),right=f.put('starstone:redstone_input',2,0,0);
  const lamp=f.put('starstone:lamp',1,0,0);
  for(let x=0;x<3;x++)f.put('minecraft:stone',x,-1,0);
  left.redstonePower=0;right.redstonePower=0;
  const pending=discoverAndRegisterNetwork(left);await drain();await pending;
  event(left,15);event(right,15);await drain();
  event(left,0,0);await drain();
  assert.equal(lamp.permutation.getState('starstone:powered'),true,'another native source keeps the network on');
  event(right,0,0);await drain();
  assert.equal(lamp.permutation.getState('starstone:powered'),false,'current committed state beats previousPowerLevel on final off');
  f.store.delete('0,0,0');f.store.delete('2,0,0');recheckInputs();await drain();
}
// Bounded recovery avoids reading every registered receiver in one callback.
runtime.clearNetworks();
const callbacks=[],oldRun=globalThis.__mcRun;
globalThis.__mcRun=cb=>{callbacks.push(cb);return callbacks.length;};
const batch=fixture();batch.dim.id='test:bounded_inputs';
try {
  for(let x=0;x<100;x++){const b=batch.put('starstone:redstone_input',x,0,0);b.redstonePower=0;trackInput(b);}
  assert.equal(callbacks.length,1,'new receivers share one deferred recovery batch');
  const reads=adapterStats().initialReads;callbacks.shift()();assert.equal(adapterStats().initialReads-reads,32);
  assert.equal(adapterStats().queuedRechecks,68);assert.equal(callbacks.length,1);
  while(callbacks.length)callbacks.shift()();
  for(let x=0;x<100;x++)batch.store.delete(`${x},0,0`);
  recheckInputs();while(callbacks.length)callbacks.shift()();
} finally {globalThis.__mcRun=oldRun;}
assert.equal(timers.size,0);
const other=fixture();trackInput(other.put('starstone:cable',0,0,0));
assert.equal(adapterStats().registeredInputs,0,'non-input blocks are never registered');
const output=JSON.parse(fs.readFileSync('starstone_bp/blocks/redstone_output.json','utf8'))['minecraft:block'];
const base=output.components['minecraft:redstone_producer'];
const on=output.permutations.find(p=>p.components['minecraft:redstone_producer']).components['minecraft:redstone_producer'];
for(const [component,power] of [[base,0],[on,15]])assert.deepEqual(component,{power,connected_faces:['down','up','north','south','west','east'],strongly_powered_face:'down',transform_relative:true});
const input=JSON.parse(fs.readFileSync('starstone_bp/blocks/redstone_input.json','utf8'));
assert.equal(input.format_version,'1.26.0');
assert.deepEqual(input['minecraft:block'].components['minecraft:redstone_consumer'],{min_power:0,propagates_power:false});
assert.ok(input['minecraft:block'].components['minecraft:liquid_detection'].detection_rules.every(r=>r.use_liquid_clipping===true));
console.log('native inputs: six mounts, dispatched pulse phases, analog dedup, source ownership, initial read and bounded work passed');
