import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mc, fixture } from './runtimeFixture.mjs';
const {handleOreExperience,registerOreExperience,spawnOreExperience} = await import('../starstone_bp/scripts/oreExperience.js');
const placements=[];
mc.world.gameRules={doTileDrops:true};
mc.world.structureManager={place:(...args)=>placements.push(args)};
const f=fixture();
const event=(tool='minecraft:iron_pickaxe',mode='Survival',silk=false)=>({
  brokenBlockPermutation:{type:{id:'starstone:ore'}},
  block:{dimension:f.dim,location:{x:-2,y:70,z:4}},player:{getGameMode:()=>mode},
  itemStackBeforeBreak:tool ? {typeId:tool,getComponent:()=>({hasEnchantment:id=>silk&&id==='silk_touch'})}:undefined
});
for(const tool of ['minecraft:iron_pickaxe','minecraft:diamond_pickaxe','minecraft:netherite_pickaxe']) {
  assert.equal(handleOreExperience(event(tool),()=>0),1);
  assert.equal(handleOreExperience(event(tool,'Adventure'),()=>0.999999),5);
}
const before=placements.length;
for(const e of [event('minecraft:iron_pickaxe','Creative'),
  event('minecraft:iron_pickaxe','Spectator'),event('minecraft:iron_pickaxe','Survival',true)]) assert.equal(handleOreExperience(e),0);
mc.world.gameRules.doTileDrops=false;
assert.equal(handleOreExperience(event()),0);
mc.world.gameRules.doTileDrops=true;
assert.equal(placements.length,before,'no XP placement for excluded breaks');
assert.deepEqual(placements[0],[ 'starstone:ore_xp_1',f.dim,{x:-2,y:70,z:4},{includeBlocks:false,includeEntities:true} ]);
assert.throws(()=>spawnOreExperience(f.dim,{x:0,y:0,z:0},6),RangeError);
registerOreExperience();
const subscribers=globalThis.__mcWorldSubscribers.playerBreakBlock;
assert.equal(subscribers.length,1);
subscribers[0](event());
assert.equal(placements.length,before+1,'actual registered native-break handler releases XP');

// Independent little-endian NBT reader: inspect the committed native assets,
// including tag types, XP totals and lack of any block writes.
function readStructure(file) {
  const b=readFileSync(file);let offset=0;
  const read=(method,n)=>{const v=b[method](offset);offset+=n;return v;};
  const string=()=>{const n=read('readUInt16LE',2),s=b.toString('utf8',offset,offset+n);offset+=n;return s;};
  const payload=type=>{
    if(type===1)return read('readInt8',1);
    if(type===2)return read('readInt16LE',2);
    if(type===3)return read('readInt32LE',4);
    if(type===4)return read('readBigInt64LE',8);
    if(type===5)return read('readFloatLE',4);
    if(type===8)return string();
    if(type===9){const of=read('readUInt8',1),n=read('readInt32LE',4);return Array.from({length:n},()=>payload(of));}
    if(type===10){const result={};for(let t;(t=read('readUInt8',1));){const name=string();result[name]={type:t,value:payload(t)};}return result;}
    throw new Error(`Unexpected asset NBT type ${type}`);
  };
  assert.equal(read('readUInt8',1),10);assert.equal(string(),'');const root=payload(10);assert.equal(offset,b.length);return root;
}
for(let amount=1;amount<=5;amount++) {
  const root=readStructure(`starstone_bp/structures/starstone/ore_xp_${amount}.mcstructure`);
  assert.equal(root.format_version.value,1);
  assert.deepEqual(root.size.value,[1,1,1]);
  const structure=root.structure.value,actors=structure.entities.value;
  assert.deepEqual(structure.block_indices.value,[[-1],[-1]],'both block layers are void');
  assert.equal(structure.palette.value.default.value.block_palette.value.length,0);
  assert.equal(actors.reduce((sum,e)=>sum+e['experience value'].value,0),amount);
  assert.ok(actors.length>=1&&actors.length<=3);
  for(const actor of actors) {
    assert.equal(actor.identifier.value,'minecraft:xp_orb');
    assert.equal(actor['experience value'].type,3,'Bedrock XP value is an Int');
    assert.ok([1,3].includes(actor['experience value'].value),'native small-XP denominations');
    assert.equal(actor.Age.value,0);
    assert.equal(actor.Value,undefined,'do not use Java Value NBT');
    assert.equal(actor.isPersistent,undefined,'keep native orb lifetime');
  }
}
console.log('ore XP: native event eligibility, all gates, exact valued native assets and entity-only placement passed');
