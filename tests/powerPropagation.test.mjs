// powerPropagation (Task 4.3, runtime parts rewritten for SS-09): applyPower
// writes exactly one permutation per changed cable/lamp/bridge lane/adapter,
// nothing when the state is unchanged, never touches a generator, and leaves
// unloaded nodes pending. Writes come from one job: one step per fixture turn.
import assert from 'node:assert/strict';
import { fixture, drain } from './runtimeFixture.mjs';
const { applyPower, poweredStateForLane, powerStats, pendingUnresolved } = await import('../starstone_bp/scripts/powerPropagation.js');

assert.equal(poweredStateForLane('ns'), 'starstone:powered_ns');
assert.equal(poweredStateForLane('ew'), 'starstone:powered_ew');
assert.equal(poweredStateForLane('main'), 'starstone:powered');

const f = fixture();
const ref = (x, lane = 'main') => `${f.dim.id}|${x}|0|0#${lane}`;
const net = (nodes, powered, consumers) => ({ nodes: new Set(nodes), powered, consumers });
const cells = [
    f.put('starstone:generator', 0, 0, 0), f.put('starstone:cable', 1, 0, 0),
    f.put('starstone:cable', 2, 0, 0), f.put('starstone:lamp', 3, 0, 0)
];
const state = (block, name = 'starstone:powered') => block.permutation.getState(name);
const writes = () => cells.reduce((sum, block) => sum + block.writes, 0);

// One write per changed cable and lamp; the generator source is never written.
{
    const result = applyPower(net([ref(0), ref(1), ref(2), ref(3)], true), f.dim);
    assert.equal(result.written, 0, 'nothing is written synchronously');
    await drain();
    assert.equal(result.written, 3, 'three changed nodes are written');
    assert.equal(result.unresolved, 0);
    assert.equal(cells[0].writes, 0, 'the generator source is never written here');
    assert.ok(cells.slice(1).every(block => block.writes === 1 && state(block) === true), 'each block is written exactly once');
    assert.equal(state(cells[0], 'starstone:powered'), undefined);
}

// Applying the same state again writes nothing.
{
    const before = writes();
    const again = applyPower(net([ref(0), ref(1), ref(2), ref(3)], true), f.dim);
    await drain();
    assert.equal(again.written, 0, 'an already powered network writes nothing');
    assert.equal(writes(), before);
    assert.equal(powerStats().queued, 0);
}

// Bridge lanes update independently, each through its own state.
{
    const bridge = f.put('starstone:bridge', 5, 0, 0);
    applyPower(net([ref(5, 'ns'), ref(5, 'ew')], true), f.dim); await drain();
    assert.equal(state(bridge, 'starstone:powered_ns'), true);
    assert.equal(state(bridge, 'starstone:powered_ew'), true);
    applyPower(net([ref(5, 'ns')], false), f.dim); await drain();
    assert.equal(state(bridge, 'starstone:powered_ns'), false);
    assert.equal(state(bridge, 'starstone:powered_ew'), true, 'the other lane keeps its state');
    const before = bridge.writes;
    applyPower(net([ref(5, 'ns'), ref(5, 'ew')], true), f.dim); await drain();
    assert.equal(bridge.writes - before, 1, 'only the changed lane is written');
}

// An input adapter takes the blue conductor state, not its redstone source value.
{
    const input = f.put('starstone:redstone_input', 6, 0, 0);
    applyPower(net([ref(6)], true), f.dim); await drain();
    assert.equal(state(input, 'starstone:star_powered'), true);
    assert.equal(state(input, 'starstone:powered'), false, 'the redstone source value is independent');
}

// An unloaded node is left pending, not written; the loaded one is.
{
    const loadedCable = f.put('starstone:cable', 7, 0, 0), hidden = f.put('starstone:cable', 8, 0, 0);
    f.unloaded.add('8,0,0');
    const result = applyPower(net([ref(8), ref(7)], true), f.dim); await drain();
    assert.equal(result.written, 1, 'only the loaded cable is written');
    assert.equal(result.unresolved, 1, 'the unloaded cable is left pending');
    assert.ok(pendingUnresolved().has(ref(8)));
    assert.equal(hidden.writes, 0);
    assert.equal(state(loadedCable), true);
    f.unloaded.clear();
    applyPower(net([ref(8)], true), f.dim); await drain();
    assert.equal(state(hidden), true, 'written once it loads');
}

// Writes are spread over job steps, not applied in the calling stack.
{
    const blocks = [];
    for (let x = 20; x < 40; x++) blocks.push(f.put('starstone:cable', x, 0, 0));
    const result = applyPower(net(blocks.map((_, i) => ref(20 + i)), true), f.dim);
    assert.equal(blocks.reduce((sum, block) => sum + block.writes, 0), 0, 'no synchronous writes');
    assert.equal(powerStats().queued, 20);
    await drain();
    assert.equal(result.written, 20);
    assert.ok(blocks.every(block => block.writes === 1));
}
console.log('powerPropagation: one write per changed node, generator skipped, no-op, bridge lanes, adapter state, unloaded nodes and job pacing passed');
