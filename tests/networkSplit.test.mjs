// Task 4.5 split-after-removal contract, plus verification that main.js keys the
// removal filter on the broken permutation rather than the (already replaced)
// current block. Run with:
// node tests/networkSplit.test.mjs
//
// Drives real production modules (networkController, networkGraph, electricalBlocks,
// runtime) end to end over the shared fixture world (runtimeFixture.mjs).

import assert from 'node:assert/strict';
import { mc, fixture, drain } from "./runtimeFixture.mjs";

mc.system.beforeEvents = { startup: { subscribe() {} } };
await import("../starstone_bp/scripts/main.js");

// Production discovery and splitting yield through system.runJob: run the call and the
// fixture scheduler together, then return the call's result.
async function settled(fn, ...args) {
    const promise = fn(...args);
    await drain();
    return promise;
}

// Fire every registered playerBreakBlock subscriber against one event, exactly
// as Minecraft would dispatch it to main.js and cableComponent.
function fireBreak(event) {
    const list = globalThis.__mcWorldSubscribers.playerBreakBlock || [];
    for (const handler of list) {
        handler(event);
    }
}

const {
    CABLE_ID,
    GENERATOR_ID,
    LAMP_ID,
    BRIDGE_ID,
    ARM_BITS,
    STATE_CONNECTIONS,
    STATE_ENABLED
} = await import(
    "../starstone_bp/scripts/constants.js"
);
const runtime = await import(
    "../starstone_bp/scripts/networkRuntime.js"
);
const {
    removeAndSplitNetwork,
    captureRemovedNetworks,
    discoverAndRegisterNetwork
} = await import(
    "../starstone_bp/scripts/networkController.js"
);

// Build a straight line of blocks along the +x axis, mounted "up". A cell with
// no explicit connections is a full cable (east + west tangent arms set).
function buildLine(dimId, cells, unloadSet = new Set()) {
    const f = fixture();
    f.dim.id = dimId;
    for (const k of unloadSet) f.unloaded.add(k);
    for (const c of cells) {
        const connections = c.connections !== undefined
            ? c.connections
            : ARM_BITS.local_e + ARM_BITS.local_w;
        if (c.id !== GENERATOR_ID) f.put("minecraft:stone", c.x, c.y - 1, c.z);
        f.put(c.id, c.x, c.y, c.z, {
            [STATE_CONNECTIONS]: connections,
            ...(c.id === GENERATOR_ID ? { [STATE_ENABLED]: c.enabled !== false } : {})
        });
    }
    return { dim: f.dim, blocks: f.store };
}

function nodeRef(dimId, x, y, z, lane) {
    return `${dimId}|${x}|${y}|${z}#${lane}`;
}

// Simulate the game actually removing the broken block after the event captured
// the network state: drop it from the world's block map so discovery no longer
// traverses through it.
function removeBlock(world, x, y, z) {
    world.blocks.delete(`${x},${y},${z}`);
}

function findNet(registered, ref) {
    return registered.find((n) => n.nodes.has(ref));
}

console.log("networkSplit: breaking the middle of a line splits into two");
{
    runtime.default.clearNetworks();
    const { dim, blocks } = buildLine("overworld", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: CABLE_ID },
        { x: 3, y: 0, z: 0, id: CABLE_ID },
        { x: 4, y: 0, z: 0, id: LAMP_ID }
    ]);
    await settled(discoverAndRegisterNetwork, blocks.get("0,0,0"));
    await drain();

    const before = runtime.default.networkIdOf(nodeRef("overworld", 2, 0, 0, "main"));
    assert.ok(typeof before === "number", "the broken block is cached before removal");

    const capture = captureRemovedNetworks(dim, 2, 0, 0);
    assert.ok(capture.removedRefs.has(nodeRef("overworld", 2, 0, 0, "main")), "capture records the removed #main ref");
    removeBlock({ blocks }, 2, 0, 0);
    const registered = await settled(removeAndSplitNetwork, capture);
    await drain();

    assert.ok(registered.length === 2, "exactly two networks result");
    assert.ok(runtime.default.networkIdOf(nodeRef("overworld", 2, 0, 0, "main")) === undefined, "the removed node is no longer cached");

    const genNet = findNet(registered, nodeRef("overworld", 0, 0, 0, "main"));
    const lampNet = findNet(registered, nodeRef("overworld", 4, 0, 0, "main"));
    assert.ok(genNet !== undefined, "source side keeps its generator");
    assert.ok(genNet && genNet.powered === true, "source side is on");
    assert.ok(lampNet !== undefined, "lamp side is on its own");
    assert.ok(lampNet && lampNet.powered === false, "lamp side is off");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("networkSplit: breaking a block in a loop keeps it one network");
{
    runtime.default.clearNetworks();
    // Square loop in the XZ plane: A(0,0,0)-B(1,0,0)-C(1,0,1)-D(0,0,1)-A.
    const { dim, blocks } = buildLine("overworld", [
        { x: 0, y: 0, z: 0, id: CABLE_ID, connections: ARM_BITS.local_e + ARM_BITS.local_s },
        { x: 1, y: 0, z: 0, id: CABLE_ID, connections: ARM_BITS.local_w + ARM_BITS.local_s },
        { x: 1, y: 0, z: 1, id: CABLE_ID, connections: ARM_BITS.local_n + ARM_BITS.local_w },
        { x: 0, y: 0, z: 1, id: CABLE_ID, connections: ARM_BITS.local_e + ARM_BITS.local_n }
    ]);
    await settled(discoverAndRegisterNetwork, blocks.get("0,0,0"));
    await drain();

    const beforeCount = runtime.default.networkCount();
    const capture = captureRemovedNetworks(dim, 1, 0, 0);
    const registered = await settled(removeAndSplitNetwork, capture);
    await drain();

    assert.ok(beforeCount === 1, "one network was cached before the break");
    assert.equal(registered.length, 1, "one network remains after the break");
    assert.ok(runtime.default.networkCount() === 1, "the loop is still one cached network");
    assert.ok(runtime.default.networkIdOf(nodeRef("overworld", 1, 0, 0, "main")) === undefined, "the removed node is gone");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("networkSplit: removing a bridge processes both of its lane networks");
{
    runtime.default.clearNetworks();
    const { dim, blocks } = buildLine("overworld", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID },      // gen_ew
        { x: 1, y: 0, z: 0, id: BRIDGE_ID },          // bridge (shared)
        { x: 2, y: 0, z: 0, id: LAMP_ID },            // lamp_ew
        { x: 1, y: 0, z: -1, id: GENERATOR_ID },      // gen_ns
        { x: 1, y: 0, z: 1, id: LAMP_ID }             // lamp_ns
    ]);
    await settled(discoverAndRegisterNetwork, blocks.get("0,0,0"));
    await settled(discoverAndRegisterNetwork, blocks.get("1,0,-1"));
    await drain();

    const nsId = runtime.default.networkIdOf(nodeRef("overworld", 1, 0, 0, "ns"));
    const ewId = runtime.default.networkIdOf(nodeRef("overworld", 1, 0, 0, "ew"));
    assert.ok(nsId !== ewId, "the bridge has two distinct cached networks");

    const capture = captureRemovedNetworks(dim, 1, 0, 0);
    assert.ok(capture.removedRefs.has(nodeRef("overworld", 1, 0, 0, "ns")) &&
        capture.removedRefs.has(nodeRef("overworld", 1, 0, 0, "ew")), "capture saw both bridge lanes");
    // The bridge block is gone from the world by the time the split runs.
    removeBlock({ blocks }, 1, 0, 0);
    const registered = await settled(removeAndSplitNetwork, capture);
    await drain();

    assert.ok(runtime.default.networkIdOf(nodeRef("overworld", 1, 0, 0, "ns")) === undefined &&
        runtime.default.networkIdOf(nodeRef("overworld", 1, 0, 0, "ew")) === undefined, "no bridge lane remains cached");
    assert.ok(registered.length === 4, "both lanes were rediscovered (4 single-block networks)");
    const genNetEw = findNet(registered, nodeRef("overworld", 0, 0, 0, "main"));
    const genNetNs = findNet(registered, nodeRef("overworld", 1, 0, -1, "main"));
    assert.ok(genNetEw && genNetEw.powered === true, "the east-west generator side is on");
    assert.ok(genNetNs && genNetNs.powered === true, "the north-south generator side is on");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("networkSplit: a surviving bridge ew seed stays on ew");
{
    runtime.default.clearNetworks();
    const { dim, blocks } = buildLine("overworld", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: BRIDGE_ID },
        { x: 3, y: 0, z: 0, id: CABLE_ID },
        { x: 4, y: 0, z: 0, id: LAMP_ID }
    ]);
    await settled(discoverAndRegisterNetwork, blocks.get("0,0,0"));
    await drain();

    const capture = captureRemovedNetworks(dim, 1, 0, 0);
    const registered = await settled(removeAndSplitNetwork, capture);
    await drain();

    const ewOwned = runtime.default.networkIdOf(nodeRef("overworld", 2, 0, 0, "ew"));
    assert.ok(ewOwned !== undefined, "the bridge ew lane was rediscovered onto its own lane");
    const ewNet = findNet(registered, nodeRef("overworld", 2, 0, 0, "ew"));
    assert.ok(ewNet && ewNet.nodes.has(nodeRef("overworld", 3, 0, 0, "main")) &&
        ewNet.nodes.has(nodeRef("overworld", 4, 0, 0, "main")), "the ew seed followed the ew line (cable + lamp present)");
    assert.ok(runtime.default.networkIdOf(nodeRef("overworld", 2, 0, 0, "ns")) === undefined, "the bridge ns lane was not pulled into any network");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("networkSplit: an unrelated cached network is left unchanged");
{
    runtime.default.clearNetworks();
    const unrelated = buildLine("overworld", [
        { x: 100, y: 0, z: 0, id: GENERATOR_ID },
        { x: 101, y: 0, z: 0, id: CABLE_ID },
        { x: 102, y: 0, z: 0, id: LAMP_ID }
    ]);
    const working = buildLine("nether", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: CABLE_ID },
        { x: 3, y: 0, z: 0, id: CABLE_ID },
        { x: 4, y: 0, z: 0, id: LAMP_ID }
    ]);
    await settled(discoverAndRegisterNetwork, unrelated.blocks.get("100,0,0"));
    await settled(discoverAndRegisterNetwork, working.blocks.get("0,0,0"));
    await drain();

    const genRef = nodeRef("overworld", 100, 0, 0, "main");
    const lampRef = nodeRef("overworld", 102, 0, 0, "main");
    const beforeId = runtime.default.networkIdOf(genRef);
    const beforePowered = runtime.default.snapshot().find((n) => n.nodes.has(genRef))?.powered;

    const capture = captureRemovedNetworks(working.dim, 2, 0, 0);
    await settled(removeAndSplitNetwork, capture);
    await drain();

    assert.ok(runtime.default.networkIdOf(genRef) === beforeId, "the unrelated generator keeps its id");
    assert.ok(runtime.default.networkIdOf(lampRef) === beforeId, "the unrelated lamp still maps to that id");
    const still = runtime.default.snapshot().find((n) => n.nodes.has(genRef));
    assert.ok(still && still.powered === beforePowered, "the unrelated network keeps its powered flag");
    assert.ok(typeof runtime.default.networkIdOf(lampRef) === "number", "the unrelated network still exists");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("networkSplit: a disabled generator reports off, an enabled one reports on");
{
    runtime.default.clearNetworks();
    const disabled = buildLine("overworld", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID, enabled: false },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: LAMP_ID }
    ]);
    const offNet = await settled(discoverAndRegisterNetwork, disabled.blocks.get("0,0,0"));
    await drain();

    runtime.default.clearNetworks();
    const enabled = buildLine("overworld2", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID, enabled: true },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: LAMP_ID }
    ]);
    const onNet = await settled(discoverAndRegisterNetwork, enabled.blocks.get("0,0,0"));
    await drain();

    assert.ok(offNet.powered === false, "a disabled generator produces an off network");
    assert.ok(onNet.powered === true, "an enabled generator produces an on network");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("networkSplit: an unavailable neighbour chunk is guarded, not crashed");
{
    runtime.default.clearNetworks();
    const unload = new Set(["3,0,0"]);
    const { dim, blocks } = buildLine("overworld", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: CABLE_ID },
        { x: 3, y: 0, z: 0, id: CABLE_ID },
        { x: 4, y: 0, z: 0, id: LAMP_ID }
    ], unload);
    await settled(discoverAndRegisterNetwork, blocks.get("0,0,0"));
    await drain();

    let threw = false;
    const capture = captureRemovedNetworks(dim, 2, 0, 0);
    let registered = [];
    try {
        registered = await settled(removeAndSplitNetwork, capture);
    } catch {
        threw = true;
    }
    await drain();
    assert.ok(!threw, "removal did not throw through the unloaded neighbour");
    const genNet = findNet(registered, nodeRef("overworld", 0, 0, 0, "main"));
    assert.ok(genNet && genNet.powered === true, "the reachable source side is still processed");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("main.js: the removal filter keys on the broken permutation");
{
    // Valid removal: a Starstone cable, identified via brokenBlockPermutation.
    runtime.default.clearNetworks();
    const working = buildLine("overworld", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: CABLE_ID },
        { x: 3, y: 0, z: 0, id: CABLE_ID },
        { x: 4, y: 0, z: 0, id: LAMP_ID }
    ]);
    await settled(discoverAndRegisterNetwork, working.blocks.get("0,0,0"));
    await drain();
    const beforeCount = runtime.default.networkCount();

    const breakEvent = {
        block: { type: { id: "minecraft:air" }, location: { x: 2, y: 0, z: 0 }, dimension: working.dim },
        brokenBlockPermutation: { type: { id: CABLE_ID } },
        dimension: working.dim,

    };
    removeBlock(working, 2, 0, 0);
    fireBreak(breakEvent);

    await drain();

    assert.ok(runtime.default.networkCount() === 2, "a valid removal split into two");
    assert.ok(runtime.default.networkIdOf(nodeRef("overworld", 0, 0, 0, "main")) !== undefined, "the source side is on via the real handler");

    // Invalid removal: a non-Starstone block must be skipped without splitting.
    runtime.default.clearNetworks();
    const other = buildLine("overworld3", [
        { x: 0, y: 0, z: 0, id: GENERATOR_ID },
        { x: 1, y: 0, z: 0, id: CABLE_ID },
        { x: 2, y: 0, z: 0, id: LAMP_ID }
    ]);
    await settled(discoverAndRegisterNetwork, other.blocks.get("0,0,0"));
    await drain();
    const otherCount = runtime.default.networkCount();
    const otherRef = nodeRef("overworld3", 0, 0, 0, "main");

    const invalidEvent = {
        block: other.blocks.get("1,0,0"),
        brokenBlockPermutation: { type: { id: "minecraft:stone" } },
        dimension: other.dim,
        location: { x: 1, y: 0, z: 0 }
    };
    fireBreak(invalidEvent);
    await drain();

    assert.ok(runtime.default.networkCount() === otherCount, "a non-Starstone removal queues no split work");
    assert.ok(runtime.default.networkIdOf(otherRef) !== undefined, "the unrelated network is untouched");
    assert.ok(runtime.default.invariantHolds(), "runtime invariant holds");
}

console.log("networkSplit: all checks passed");
