// Opt-in development pack. Structured diagnostic data uses stable technical
// keys; pack title/description are localized. No polling until a command runs.
import {system,world} from '@minecraft/server';
import {summarizeInputTrace} from './inputTrace.js';
const INPUT='starstone:redstone_input',RESULT='starstone_probe:last';
const OFFSETS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
let active;
function emit(player,report) {
    const data=JSON.stringify(report);
    try {world.setDynamicProperty(RESULT,data);} catch(error) {console.warn(`[StarstoneProbe] report storage: ${error.message}`);}
    console.warn(`[StarstoneProbe] ${data}`);
    try {player.sendMessage(data);} catch { /* Report is still in the content log. */ }
}
function sampleInput(block) {
    let max=0,complete=true;
    const neighbors=[];
    for(const offset of OFFSETS) {
        const p={x:block.location.x+offset[0],y:block.location.y+offset[1],z:block.location.z+offset[2]};
        try {
            if(!block.dimension.isChunkLoaded(p)) {complete=false;continue;}
            const neighbor=block.dimension.getBlock(p);
            if(!neighbor?.isValid) {complete=false;continue;}
            const power=neighbor.getRedstonePower()??0;
            max=Math.max(max,power);neighbors.push({offset,id:neighbor.typeId,power});
        } catch {complete=false;}
    }
    let self=null;
    try {self=block.getRedstonePower()??null;} catch { /* Unknown is not zero power. */ }
    return {max,complete,self,on:Boolean(block.permutation.getState('starstone:powered')),
        starOn:Boolean(block.permutation.getState('starstone:star_powered')),neighbors};
}
function equipment(player) {
    const equippable=player.getComponent('minecraft:equippable');
    return ['Mainhand','Offhand','Head','Chest','Legs','Feet'].map(slot=>{
        const item=equippable?.getEquipment(slot),durability=item?.getComponent('minecraft:durability');
        return {slot,id:item?.typeId??null,damage:durability?.damage??null,
            mending:item?.getComponent('minecraft:enchantable')?.hasEnchantment('mending')??false};
    });
}
function watch(player,kind,target,amount) {
    if(active) {emit(player,{error:'probe_busy'});return;}
    const start=system.currentTick,dimension=player.dimension;
    const report={schemaVersion:3,observation:'production_state',kind,start,dimension:dimension.id,position:{...target},samples:[],
        neighborTypes:[],droppedNeighborTypes:0};
    if(kind==='input') {
        const block=dimension.getBlock(target),{neighbors,...initial}=sampleInput(block);
        report.mount=block.permutation.getState('minecraft:block_face');report.initial=initial;
    }
    if(kind==='xp') {
        const mode=player.getGameMode();
        if(mode!=='Survival'&&mode!=='Adventure') {emit(player,{error:'survival_or_adventure_required'});return;}
        if(dimension.getEntities({type:'minecraft:xp_orb',location:player.location,maxDistance:12}).length) {
            emit(player,{error:'nearby_xp_orbs'});return;
        }
        report.amount=amount;report.xpBefore=player.getTotalXp();report.equipmentBefore=equipment(player);
        world.structureManager.place(`starstone:ore_xp_${amount}`,dimension,{
            x:Math.floor(target.x),y:Math.floor(target.y),z:Math.floor(target.z)
        },{includeBlocks:false,includeEntities:true});
    }
    const session={player,dimension,target,report,timer:undefined,finished:false};
    active=session;
    const finish=reason=>{
        if(session.finished) return;
        session.finished=true;
        system.clearRun(session.timer);active=undefined;report.end=system.currentTick;report.reason=reason;
        try {
            if(kind==='xp'&&player.isValid) {
                report.xpAfter=player.getTotalXp();report.xpDelta=report.xpAfter-report.xpBefore;
                report.equipmentAfter=equipment(player);
                report.nearbyPlayers=world.getAllPlayers().filter(p=>p.dimension.id===dimension.id&&
                    Math.hypot(p.location.x-target.x,p.location.y-target.y,p.location.z-target.z)<12).length;
            }
        } catch(error) {report.readError=String(error);}
        if(kind==='input') report.analysis=summarizeInputTrace(report);
        emit(player,report);
    };
    session.timer=system.runInterval(()=>{
        try {
            if(!player.isValid||player.dimension.id!==dimension.id) {finish('player_unavailable');return;}
            if(kind==='input') {
                if(!dimension.isChunkLoaded(target)) {finish('target_unloaded');return;}
                const block=dimension.getBlock(target);
                if(block?.typeId!==INPUT) {finish('target_replaced');return;}
                const {neighbors,...state}=sampleInput(block);
                const types=neighbors.map(n=>({offset:n.offset,id:n.id}));
                const last=report.neighborTypes.at(-1)?.types;
                if(JSON.stringify(types)!==JSON.stringify(last)) {
                    if(report.neighborTypes.length<8) report.neighborTypes.push({tick:system.currentTick,types});
                    else report.droppedNeighborTypes++;
                }
                report.samples.push({tick:system.currentTick,...state,
                    neighbors:OFFSETS.map(offset=>neighbors.find(n=>n.offset===offset)?.power??null)});
            }
            if(system.currentTick-start>=80) finish('complete');
        } catch(error) {report.error=String(error);finish('error');}
    },1);
}
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(!event.id.startsWith('starstone_probe:')||event.sourceEntity?.typeId!=='minecraft:player') return;
    const player=event.sourceEntity;
    try {
        if(event.id==='starstone_probe:last') {player.sendMessage(world.getDynamicProperty(RESULT)??'{}');return;}
        if(event.id==='starstone_probe:input') {
            const block=player.getBlockFromViewDirection({maxDistance:6})?.block;
            if(block?.typeId!==INPUT) {emit(player,{error:'target_redstone_input'});return;}
            watch(player,'input',block.location);return;
        }
        if(event.id==='starstone_probe:xp') {
            const amount=Number(event.message);
            if(!Number.isInteger(amount)||amount<1||amount>5) {emit(player,{error:'xp_amount_1_to_5'});return;}
            watch(player,'xp',player.location,amount);
        }
    } catch(error) {emit(player,{error:String(error)});}
});
