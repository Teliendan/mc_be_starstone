// generatorToggle tests for Task 4.6.
//
// Prove that toggling a generator recomputes only the containing network's
// powered value, applies power only on a change, and never rebuilds topology:
// the network id and count stay fixed across repeated toggles, which a
// discoverAndRegisterNetwork rebuild would have broken by allocating a new id.
//
// Uses the real runtime index, the real anySourceOn and the real applyPower over the
// shared fixture world; the network record is registered by hand, without discovery.
//
// Run: node tests/generatorToggle.test.mjs
import assert from 'node:assert/strict';
import { mc, fixture, drain } from './runtimeFixture.mjs';

const runtime = (await import('../starstone_bp/scripts/networkRuntime.js')).default;
const { reactToGeneratorToggle, registerGeneratorController } = await import('../starstone_bp/scripts/generatorComponent.js');

const STATE_POWERED = 'starstone:powered';
const STATE_ENABLED = 'starstone:enabled';
const ref = (f, x) => `${f.dim.id}|${x}|0|0#main`;

// A generator + cable + cable + lamp line with the generator as the only source.
function line(generatorOn) {
    const f = fixture();
    const generator = f.put('starstone:generator', 0, 0, 0, { [STATE_ENABLED]: generatorOn });
    const cables = [f.put('starstone:cable', 1, 0, 0), f.put('starstone:cable', 2, 0, 0)];
    const lamp = f.put('starstone:lamp', 3, 0, 0);
    runtime.clearNetworks();
    const network = runtime.addNetwork({
        nodes: new Set([0, 1, 2, 3].map(x => ref(f, x))),
        sources: new Set([ref(f, 0)]),
        consumers: new Set([ref(f, 3)]),
        unresolvedBoundaries: new Set()
    }, { assignId: true });
    const writes = () => [...cables, lamp].reduce((sum, block) => sum + block.writes, 0);
    const setGenerator = on => generator.setPermutation(generator.permutation.withState(STATE_ENABLED, on));
    return { f, generator, cables, lamp, network, writes, setGenerator };
}

console.log('toggle applies power exactly once per state change');
{
    const { f, cables, writes, setGenerator } = line(false);
    assert.equal(runtime.networkCount(), 1, 'one network is cached');
    const ownerId = runtime.networkIdOf(ref(f, 0));
    const ownerCountBefore = runtime.networkCount();

    // Toggle the generator ON.
    setGenerator(true);
    const onToggle = reactToGeneratorToggle(f.dim, 0, 0, 0);
    await drain();
    assert.equal(onToggle.changed, true, 'powered changed when the generator turns on');
    assert.equal(onToggle.powered, true, 'any source on recomputes powered to true');
    assert.equal(writes(), 3, 'power written to the two cables and the lamp once');
    assert.equal(cables[0].permutation.getState(STATE_POWERED), true, 'cable reflects the new powered state');

    // Toggle the generator OFF.
    setGenerator(false);
    const offToggle = reactToGeneratorToggle(f.dim, 0, 0, 0);
    await drain();
    assert.equal(offToggle.changed, true, 'powered changed when the generator turns off');
    assert.equal(offToggle.powered, false, 'recompute recomputes powered to false');
    assert.equal(writes(), 6, 'power written back once when it turns off');
    assert.equal(cables[0].permutation.getState(STATE_POWERED), false, 'cable reflects the powered-off state');

    // Toggle again with no state change: writes nothing.
    const noChange = reactToGeneratorToggle(f.dim, 0, 0, 0);
    await drain();
    assert.equal(noChange.changed, false, 'an unchanged toggle writes nothing');
    assert.equal(writes(), 6, 'no permutation writes on a no-op toggle');

    // No topology was rebuilt: the network kept its id and count.
    assert.equal(runtime.networkIdOf(ref(f, 0)), ownerId, 'the containing network keeps its id after toggles');
    assert.equal(runtime.networkCount(), ownerCountBefore, 'no new network was allocated, so no rebuild');
}

console.log('toggle on an unconnected generator is a no-op');
{
    runtime.clearNetworks();
    const f = fixture();
    const generator = f.put('starstone:generator', 9, 9, 9, { [STATE_ENABLED]: true });
    const result = reactToGeneratorToggle(f.dim, 9, 9, 9);
    await drain();
    assert.equal(result, undefined, 'a generator with no cached network returns undefined');
    assert.equal(generator.writes, 0, 'nothing is written for an unconnected generator');
}

console.log('generator registration and interaction use the supported startup component API');
{
    let startup, component;
    mc.system.beforeEvents = { startup: { subscribe(cb) { startup = cb; } } };
    registerGeneratorController();
    startup({ blockComponentRegistry: { registerCustomComponent(id, definition) {
        assert.equal(id, 'starstone:generator', 'registered component matches block attachment');
        component = definition;
    } } });
    const { f, generator, network } = line(true);
    reactToGeneratorToggle(f.dim, 0, 0, 0);
    await drain();
    const owner = runtime.networkIdOf(ref(f, 0));
    component.onPlayerInteract({ block: generator });
    await drain();
    assert.equal(generator.permutation.getState(STATE_ENABLED), false, 'interaction disables generator');
    assert.equal(runtime.networkOf(owner).powered, false, 'interaction powers network off');
    component.onPlayerInteract({ block: generator });
    await drain();
    assert.equal(runtime.networkOf(owner).powered, true, 'second interaction restores power');
    assert.equal(runtime.networkIdOf(ref(f, 0)), owner, 'interaction preserves network topology');
    assert.equal(owner, network.id, 'the registered record is the one toggled');
}

console.log('generatorToggle: all checks passed');
