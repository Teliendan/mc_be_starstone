import assert from 'node:assert/strict';
import { mc, fixture, drain } from './runtimeFixture.mjs';
const definitions = new Map();
mc.system.beforeEvents = {startup:{subscribe(cb) { cb({blockComponentRegistry:{
    registerCustomComponent(id, definition) { definitions.set(id, definition); }
}}); }}};
globalThis.__mcDimensions = new Map();
await import('../starstone_bp/scripts/main.js');
const { pistonSupport, PISTON_AXES } = await import('../starstone_bp/scripts/pistonController.js');
const { placementIndex } = await import('../starstone_bp/scripts/persistence.js');
const { discoverAllLanes } = await import('../starstone_bp/scripts/networkController.js');
const cableController = await import('../starstone_bp/scripts/cableComponent.js');
const runtime = (await import('../starstone_bp/scripts/networkRuntime.js')).default;
const { chunkIndex } = await import('../starstone_bp/scripts/chunkIndex.js');

let serial = 0;
function setup() {
    runtime.clearNetworks();
    const f = fixture();
    f.dim.id = `test:piston-${serial++}`;
    globalThis.__mcDimensions.set(f.dim.id, f.dim);
    const commands = [];
    const run = f.dim.runCommand;
    f.dim.runCommand = command => { commands.push(command); return run(command); };
    return {...f, commands};
}
function warm(block) { definitions.get('starstone:piston_support').onTick({block}); }
function fire(f, positions, {origin={x:-1,y:-1,z:0}, facing=4, expanding=true}={}) {
    const piston = {isMoving:false, getAttachedBlocksLocations:() => positions};
    const block = f.put('minecraft:piston',origin.x,origin.y,origin.z,{facing_direction:facing});
    block.getComponent = () => piston;
    for (const callback of globalThis.__mcWorldSubscribers.pistonActivate || []) {
        callback({dimension:f.dim, block, piston, isExpanding:expanding});
    }
}
async function discover(block) {
    cableController.schedulePlaced(block); cableController.flushPending(); await drain();
    const work=discoverAllLanes(block); await drain(); await work; await drain();
}
function indexed(f, p) { return placementIndex.positionsInChunk(f.dim.id,Math.floor(p.x/16),Math.floor(p.z/16))
    .some(q=>q.x===p.x && q.y===p.y && q.z===p.z); }

// The calibrated map is part of the public adapter, with no inferred reversals.
assert.deepEqual(PISTON_AXES, [{x:0,y:-1,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},
    {x:0,y:0,z:-1},{x:1,y:0,z:0},{x:-1,y:0,z:0}]);

// Preserve the original support even when the engine delivers a block tick
// after replacing stone with the new head, but before pistonActivate.
{
    const f=setup();
    const source=f.put('starstone:generator',-1,0,0);
    const cable=f.put('starstone:cable',0,0,0);
    f.put('minecraft:stone',0,-1,0);
    const lamp=f.put('starstone:lamp',1,0,0); f.put('minecraft:stone',1,-1,0);
    definitions.get('starstone:piston_support').onPlace({block:cable});
    for (const callback of globalThis.__mcWorldSubscribers.playerPlaceBlock || []) callback({block:cable, dimension:f.dim});
    warm(lamp); await discover(source);
    assert.equal(lamp.permutation.getState('starstone:powered'),true);
    f.put('minecraft:piston_arm_collision',0,-1,0);
    warm(cable);
    fire(f,[{x:0,y:-1,z:0},{x:1,y:-1,z:0}]);
    await drain();
    assert.equal(f.dim.getBlock(cable.location).typeId,'minecraft:air');
    assert.equal(f.commands.filter(c=>c.includes('setblock 0 0 0 air destroy')).length,1);
    assert.equal(indexed(f,cable.location),false);
    assert.equal(lamp.permutation.getState('starstone:powered'),false,'support motion splits electrical network');
    assert.equal(runtime.networkIdOf(`${f.dim.id}|0|0|0#main`),undefined);
    assert.equal(runtime.invariantHolds(),true);
}

// Native popping does not need onPlayerBreak to clear old electrical ownership.
for (const id of ['cable','bridge','lamp','redstone_input','redstone_output']) {
    const f=setup();
    const block=f.put(`starstone:${id}`,0,0,0); f.put('minecraft:stone',0,-1,0);
    warm(block); placementIndex.record(block); await discover(block);
    f.store.delete('0,0,0');
    fire(f,[{x:0,y:0,z:0}],{origin:{x:-1,y:0,z:0}});
    await drain();
    assert.equal(f.commands.length,0,`${id}: native destruction must not trigger a second drop`);
    assert.equal(indexed(f,block.location),false,`${id}: native drop clears durable hint`);
    for (const lane of ['main','ns','ew']) assert.equal(runtime.networkIdOf(`${f.dim.id}|0|0|0#${lane}`),undefined);
}

// Full-cube movement repairs both components and preserves the engine's state.
// Cross x=15/16 also checks independently persisted chunk snapshots.
for (const enabled of [true,false]) {
    const f=setup();
    const source=f.put('starstone:generator',15,0,0,{'starstone:enabled':enabled});
    const oldLamp=f.put('starstone:lamp',15,0,-1); f.put('minecraft:stone',15,-1,-1);
    const newLamp=f.put('starstone:lamp',16,0,1); f.put('minecraft:stone',16,-1,1);
    warm(source); warm(oldLamp); warm(newLamp); await discover(source); await discover(newLamp);
    f.store.delete('15,0,0');
    const moved=f.put('starstone:generator',16,0,0,{'starstone:enabled':enabled});
    fire(f,[{x:15,y:0,z:0},{x:16,y:0,z:0}],{origin:{x:14,y:0,z:0}});
    await drain();
    assert.equal(oldLamp.permutation.getState('starstone:powered'),false);
    assert.equal(newLamp.permutation.getState('starstone:powered'),enabled);
    assert.equal(moved.permutation.getState('starstone:enabled'),enabled);
    assert.equal(indexed(f,source.location),false);
    assert.equal(indexed(f,moved.location),true);
    const snapshots=[...chunkIndex.chunks()].filter(s=>s.dimensionId===f.dim.id);
    assert.ok(snapshots.some(s=>s.cx===1 && s.segments.some(segment=>segment.members.includes(`${f.dim.id}|16|0|0#main`))));
    assert.ok(snapshots.every(s=>s.segments.every(segment=>!segment.members.includes(`${f.dim.id}|15|0|0#main`))));
    assert.equal(runtime.invariantHolds(),true);
}

// Two same-type cubes in a chain must retain every final occupied hint and axis.
{
    const f=setup();
    for (const x of [0,1]) { const b=f.put('starstone:conduit',x,0,0,{'starstone:axis':'x'}); warm(b); placementIndex.record(b); }
    f.store.delete('0,0,0');
    f.put('starstone:conduit',2,0,0,{'starstone:axis':'x'});
    fire(f,[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}],{origin:{x:-1,y:0,z:0}});
    await drain();
    assert.equal(indexed(f,{x:0,y:0,z:0}),false);
    for (const x of [1,2]) {
        const b=f.dim.getBlock({x,y:0,z:0});
        assert.equal(b.permutation.getState('starstone:axis'),'x');
        assert.equal(indexed(f,b.location),true);
    }
    assert.equal(runtime.invariantHolds(),true);
}

// A selected inner-corner support's departure pops the whole device, even if
// another pair could remain. Unknown chunk availability never supplies evidence.
{
    const f=setup();
    const block=f.put('starstone:inner_corner',0,0,0,{'starstone:face_mask_low':5});
    f.put('minecraft:stone',0,-1,0); f.put('minecraft:stone',0,0,1);
    warm(block);
    f.put('minecraft:moving_block',0,-1,0);
    fire(f,[{x:0,y:-1,z:0}]);
    f.put('minecraft:stone',0,-1,0);
    await drain();
    assert.equal(f.dim.getBlock(block.location).typeId,'minecraft:air');
    assert.equal(f.commands.length,1);
}
{
    const f=setup();
    const block=f.put('starstone:cable',0,0,0); f.put('minecraft:stone',0,-1,0); warm(block);
    f.unloaded.add('0,-1,0');
    warm(block); fire(f,[{x:0,y:-1,z:0}]); await drain();
    assert.equal(f.commands.length,0);
    assert.equal(f.dim.getBlock(block.location).typeId,'starstone:cable');
    f.unloaded.clear();
    // A valid replacement after unavailable settlement must compare against the
    // preserved stone history, not establish a new generator baseline.
    f.put('starstone:generator',0,-1,0);
    fire(f,[{x:0,y:-1,z:0}]); await drain();
    assert.equal(f.dim.getBlock(block.location).typeId,'minecraft:air');
    assert.equal(f.commands.length,1);
}
assert.ok(pistonSupport.size()>=0);
console.log('pistons: original support, tick ordering, real network teardown/migration, chunk snapshots, cube states, chains, inner corners and unknown support passed');
