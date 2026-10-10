import assert from 'node:assert/strict';
import { fixture, drain } from './runtimeFixture.mjs';
const { canCollect, registerHarvestGate } = await import('../starstone_bp/scripts/harvestGate.js');

function tool(typeId, tagged = typeId.endsWith('_pickaxe')) {
    return { typeId, hasTag: tag => tagged && tag === 'minecraft:is_pickaxe',
        clone() { return tool(typeId, tagged); }, getComponent() { return undefined; } };
}
for (const block of ['starstone:conduit', 'starstone:generator']) {
    for (const material of ['wooden','stone','copper','golden','iron','diamond','netherite'])
        assert.equal(canCollect(block,tool(`minecraft:${material}_pickaxe`)),true);
    assert.equal(canCollect(block,tool('test:tagged_pick',true)),true);
    assert.equal(canCollect(block,tool('test:untagged_pickaxe',false)),false);
    assert.equal(canCollect(block,undefined),false);
    assert.equal(canCollect(block,tool('minecraft:iron_axe')),false);
}
for (const material of ['wooden','stone','copper','golden','iron','diamond','netherite'])
    assert.equal(canCollect('starstone:ore',tool(`minecraft:${material}_pickaxe`)),['iron','diamond','netherite'].includes(material));
assert.equal(canCollect('starstone:ore',tool('test:tagged_pick',true)),false,'ore tier policy remains exact reviewed IDs');
assert.equal(canCollect('starstone:ore',undefined),false);

const removed=[];
registerHarvestGate(event=>removed.push(event));
const handler=globalThis.__mcWorldBeforeSubscribers.playerBreakBlock[0];
function makeEvent(id='starstone:generator', held=undefined, mode='Survival') {
    const f=fixture(); const block=f.put(id,2,5,3);
    const player={isValid:true,selectedSlotIndex:0,getGameMode:()=>mode};
    return {f,event:{block,player,itemStack:held,cancel:false}};
}
for (const [id,held,mode] of [
    ['starstone:generator',tool('minecraft:copper_pickaxe'),'Survival'],
    ['starstone:conduit',tool('minecraft:wooden_pickaxe'),'Survival'],
    ['starstone:ore',tool('minecraft:iron_pickaxe'),'Survival'],
    ['starstone:generator',undefined,'Creative'],
    ['starstone:generator',undefined,'Spectator'],
    ['minecraft:stone',undefined,'Survival'],
]) {
    const {f,event}=makeEvent(id,held,mode); handler(event); await drain();
    assert.equal(event.cancel,false); assert.equal(f.dim.getBlock(event.block.location).typeId,id);
}
{
    const {f,event}=makeEvent(); event.cancel=true; handler(event); await drain();
    assert.equal(f.dim.getBlock(event.block.location).typeId,'starstone:generator','respect prior protection');
}
for (const id of ['starstone:ore','starstone:conduit','starstone:generator']) {
    const {f,event}=makeEvent(id,tool('minecraft:iron_axe'));
    const before=removed.length;
    handler(event); assert.equal(event.cancel,true);
    assert.equal(f.dim.getBlock(event.block.location).typeId,id,'before-event remains read only');
    handler({...event,cancel:false}); await drain();
    assert.equal(f.dim.getBlock(event.block.location).typeId,'minecraft:air');
    assert.equal(removed.length,before+1,'concurrent attempts must remove/clean once');
    assert.equal(removed.at(-1).typeId,id);
    assert.equal(removed.at(-1).block.typeId,'minecraft:air');
}
for (const change of ['type','state','unloaded','disconnect','creative','spectator','placeSame','blast']) {
    const {f,event}=makeEvent(); const before=removed.length; handler(event);
    if (change==='type') f.put('minecraft:diamond_block',2,5,3);
    if (change==='state') f.put('starstone:generator',2,5,3,{'starstone:enabled':false});
    if (change==='unloaded') f.unloaded.add('2,5,3');
    if (change==='disconnect') event.player.isValid=false;
    if (change==='creative') event.player.getGameMode=()=> 'Creative';
    if (change==='spectator') event.player.getGameMode=()=> 'Spectator';
    if (change==='placeSame' || change==='blast') {
        for (const cb of globalThis.__mcWorldSubscribers[change==='blast'?'blockExplode':'playerPlaceBlock']) cb({block:event.block});
    }
    await drain(); assert.equal(removed.length,before,`${change}: no stale removal or wear`);
    f.unloaded.clear(); assert.notEqual(f.dim.getBlock(event.block.location).typeId,'minecraft:air');
}
console.log('harvest gate: tool tiers, native pass-through, prior cancel, deferred guards, dedup and replacement invalidation passed');
