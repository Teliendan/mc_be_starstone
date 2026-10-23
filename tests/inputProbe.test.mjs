import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mc,fixture,player} from './runtimeFixture.mjs';

let receive,nextTimer=1,receiver=0;
const timers=new Map(),placements=[];
mc.system.currentTick=0;
mc.system.beforeEvents={startup:{subscribe:()=>{throw new Error('production monitor must not register block hooks');}}};
mc.system.afterEvents.scriptEventReceive.subscribe=cb=>receive=cb;
globalThis.__mcRunInterval=(cb,period)=>{assert.equal(period,1);const id=nextTimer++;timers.set(id,cb);return id;};
globalThis.__mcClearRun=id=>timers.delete(id);
mc.world.structureManager={place:(...args)=>placements.push(args)};
await import('../starstone_input_probe_bp/scripts/main.js');
assert.equal(timers.size,0,'no idle sampling');
const f=fixture(),input=f.put('starstone:redstone_input',0,70,0);
const source=f.put('minecraft:redstone_block',1,70,0);
source.power=0;
const getBlock=f.dim.getBlock;
f.dim.getBlock=pos=>{const b=getBlock(pos);if(b)b.getRedstonePower=()=>b.typeId==='starstone:redstone_input'?receiver:b.power??0;return b;};
input.getRedstonePower=()=>receiver;
f.dim.getEntities=()=>[];
const p=player(f.dim,input);
p.getGameMode=()=>'Survival';p.getComponent=()=>undefined;
let xp=10;p.getTotalXp=()=>xp;
globalThis.__mcPlayers=[p];
const command=(id,message='')=>receive({id:`starstone_probe:${id}`,message,sourceEntity:p});
const report=()=>JSON.parse(mc.world.getDynamicProperty('starstone_probe:last'));
const tick=()=>{mc.system.currentTick++;for(const cb of [...timers.values()])cb();};
const warn=console.warn;console.warn=()=>{};
try {
  command('input');assert.equal(timers.size,1);
  command('input');assert.equal(report().error,'probe_busy');assert.equal(timers.size,1);
  // Fixture-provided production states verify recording, not engine delivery.
  for(let i=0;i<80;i++){
    source.power=i<2?15:0;
    receiver=source.power;
    input.permutation=input.permutation.withState('starstone:powered',i<2).withState('starstone:star_powered',i===1);
    if(i<12)source.typeId=`other:source_${i}`;
    tick();
  }
  const r=report();
  assert.equal(r.reason,'complete');assert.equal(r.samples.length,80);
  assert.equal(r.schemaVersion,3);assert.equal(r.observation,'production_state');assert.equal(r.mount,'up');
  assert.equal(r.initial.max,0);assert.equal(r.initial.on,false);
  assert.deepEqual(r.samples.slice(0,3).map(s=>s.max),[15,15,0]);
  assert.deepEqual(r.samples[0].neighbors,[15,0,0,0,0,0]);
  assert.equal(r.events,undefined,'does not claim raw native callbacks');
  assert.equal(r.analysis.neighborMatches,80);
  assert.equal(r.analysis.observedSourceChanges,2);assert.equal(r.analysis.observedBlueChanges,2);
  assert.equal(r.neighborTypes.length,8);assert.ok(r.droppedNeighborTypes>0);
  assert.ok(Buffer.byteLength(JSON.stringify(r),'utf8')<32767,'bounded report fits dynamic string');
  assert.equal(input.writes,0,'probe only observes the input');
  assert.equal(timers.size,0,'sampling stops at completion');
  command('last');assert.equal(p.messages.at(-1),JSON.stringify(r));

  command('input');f.unloaded.add('-1,70,0');receiver=undefined;
  for(let i=0;i<80;i++)tick();
  assert.equal(report().samples[0].self,null);
  assert.equal(report().analysis.unknownComparisons,80);
  assert.equal(report().analysis.nativeHighNeighborLow,0,'partial negative reads cannot establish a discrepancy');
  f.unloaded.clear();
  receiver=0;

  command('input');f.unloaded.add('0,70,0');tick();
  assert.equal(report().reason,'target_unloaded');assert.equal(timers.size,0);
  f.unloaded.clear();
  command('input');input.typeId='minecraft:air';tick();
  assert.equal(report().reason,'target_replaced');assert.equal(timers.size,0);
  input.typeId='starstone:redstone_input';

  command('xp','6');assert.equal(report().error,'xp_amount_1_to_5');
  assert.equal(placements.length,0);
  f.dim.getEntities=()=>[{}];command('xp','3');
  assert.equal(report().error,'nearby_xp_orbs');assert.equal(timers.size,0);
  f.dim.getEntities=()=>[];
  command('xp','3');assert.deepEqual(placements[0],[ 'starstone:ore_xp_3',f.dim,{x:0,y:0,z:0},{includeBlocks:false,includeEntities:true} ]);
  xp=13; // Fixture-provided reading, not a simulated pickup implementation.
  for(let i=0;i<80;i++)tick();
  assert.equal(report().xpDelta,3);assert.equal(report().nearbyPlayers,1);
  assert.equal(report().equipmentBefore.length,6);assert.equal(timers.size,0);
  command('xp','1');p.getTotalXp=()=>{throw new Error('player unavailable');};
  for(let i=0;i<80;i++)tick();
  assert.match(report().readError,/player unavailable/);assert.equal(timers.size,0,'failed final reads still stop the timer');
} finally {console.warn=warn;}

const json=path=>JSON.parse(readFileSync(path,'utf8'));
const core=json('starstone_bp/blocks/redstone_input.json');
assert.equal(core.format_version,'1.26.0');
assert.deepEqual(core['minecraft:block'].components['minecraft:redstone_consumer'],{min_power:0,propagates_power:false});
assert.equal(existsSync('starstone_input_probe_bp/blocks/redstone_input.json'),false,'monitor cannot override production input');
assert.equal(existsSync('starstone_input_probe_bp/block_materials.json'),false,'obsolete override material ledger retired');
console.log('optional monitor: bounded production-state recording, cleanup, XP readings and no block override passed');
