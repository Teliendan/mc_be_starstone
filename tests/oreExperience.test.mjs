import assert from 'node:assert/strict';
import { mc, fixture } from './runtimeFixture.mjs';
const {handleOreExperience,registerOreExperience,spawnOreExperience} = await import('../starstone_bp/scripts/oreExperience.js');
mc.world.gameRules={doTileDrops:true};
const f=fixture();
const event=(tool='minecraft:iron_pickaxe',mode='Survival',silk=false)=>({
  brokenBlockPermutation:{type:{id:'starstone:ore'}},
  block:{dimension:f.dim,location:{x:-2,y:70,z:4},center:()=>({x:-1.5,y:70.5,z:4.5})},player:{getGameMode:()=>mode},
  itemStackBeforeBreak:tool ? {typeId:tool,getComponent:()=>({hasEnchantment:id=>silk&&id==='silk_touch'})}:undefined
});
for(const tool of ['minecraft:iron_pickaxe','minecraft:diamond_pickaxe','minecraft:netherite_pickaxe']) {
  assert.equal(handleOreExperience(event(tool),()=>0),1);
  assert.equal(handleOreExperience(event(tool,'Adventure'),()=>0.999999),5);
}
const placements=f.dim.xp;
const before=placements.length;
for(const e of [event('minecraft:iron_pickaxe','Creative'),
  event('minecraft:iron_pickaxe','Spectator'),event('minecraft:iron_pickaxe','Survival',true)]) assert.equal(handleOreExperience(e),0);
mc.world.gameRules.doTileDrops=false;
assert.equal(handleOreExperience(event()),0);
mc.world.gameRules.doTileDrops=true;
assert.equal(placements.length,before,'no XP placement for excluded breaks');
assert.deepEqual(placements[0],{location:{x:-1.5,y:70.5,z:4.5},amount:1},'block centre, one orb of 1');
const orbs=amount=>{const start=placements.length;spawnOreExperience(f.dim,{x:0.5,y:1.5,z:2.5},amount);return placements.slice(start).map(p=>p.amount);};
assert.deepEqual([1,2,3,4,5].map(orbs),[[1],[1,1],[3],[3,1],[3,1,1]],'vanilla-like orb split');
assert.ok(placements.every(p=>p.amount>=1&&p.amount<=12000));
const mark=placements.length;
assert.throws(()=>spawnOreExperience(f.dim,{x:0,y:0,z:0},6),RangeError);
registerOreExperience();
const subscribers=globalThis.__mcWorldSubscribers.playerBreakBlock;
assert.equal(subscribers.length,1);
subscribers[0](event());
assert.ok(placements.length>mark,'actual registered native-break handler releases XP');

console.log('ore XP: native event eligibility, all gates, spawnXp orb split and block-centre location passed');
