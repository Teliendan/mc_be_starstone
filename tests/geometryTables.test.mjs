// Geometry and descriptor tables: surface frames, port directions, cable neighbour masks,
// descriptors and bridge lanes (formerly surfaceFrame, portDirections, cableTopology, descriptor
// and graphNeighbor tests). Pure rules over the face tables; each section keeps its own scope.
import assert from 'node:assert/strict';
import "./runtimeFixture.mjs"; // registers the @minecraft/server loader for networkGraph
import { FACE_LIST, ARM_NAMES, ARM_BITS, AXIS_X, AXIS_Y, AXIS_Z, AXIS_FOR_FACE } from "../starstone_bp/scripts/constants.js";
import { supportOffset, arms, frameForFace, worldOffset, negate, vecEquals, NORMALS } from "../starstone_bp/scripts/surfaceFrame.js";
import { worldDirOfPort, WORLD_PORTS } from "../starstone_bp/scripts/portDirections.js";
import { generatorDescriptor, conduitDescriptor, cableDescriptor, addBackContact, flatDescriptor, bridgeDescriptor, matchingConduitAxis, descriptorForBlock, bridgeNodeRefs, bridgeLaneAt, buildBridgeEdges, laneHasPort, LANE_NS, LANE_EW, LANE_MAIN } from "../starstone_bp/scripts/electricalBlocks.js";
import { cableConnectionMask, hasReciprocalPort } from "../starstone_bp/scripts/cableTopology.js";

// networkGraph imports @minecraft/server, so it loads after the fixture registered the loader.
const { findReciprocalLane } = await import("../starstone_bp/scripts/networkGraph.js");

// ======================================================================
// surfaceFrame.test.mjs
// Surface-frame table tests for Task 1.4.
//
// ======================================================================
{
  function vecList(vectors) {
    return JSON.stringify(vectors.map((v) => `[${v.join(",")}]`));
  }

  function length3(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  // Six explicit expected mappings: the four local arms and the support offset for
  // every mounting face. This table is the source of truth the RP transformation
  // table is checked against (Task 1.5).
  const EXPECTED = {
    up: {
      normal: [0, 1, 0],
      support: [0, -1, 0],
      arms: { local_n: [0, 0, -1], local_e: [1, 0, 0], local_s: [0, 0, 1], local_w: [-1, 0, 0] }
    },
    down: {
      normal: [0, -1, 0],
      support: [0, 1, 0],
      arms: { local_n: [0, 0, 1], local_e: [1, 0, 0], local_s: [0, 0, -1], local_w: [-1, 0, 0] }
    },
    north: {
      normal: [0, 0, -1],
      support: [0, 0, 1],
      arms: { local_n: [0, 1, 0], local_e: [-1, 0, 0], local_s: [0, -1, 0], local_w: [1, 0, 0] }
    },
    south: {
      normal: [0, 0, 1],
      support: [0, 0, -1],
      arms: { local_n: [0, 1, 0], local_e: [1, 0, 0], local_s: [0, -1, 0], local_w: [-1, 0, 0] }
    },
    east: {
      normal: [1, 0, 0],
      support: [-1, 0, 0],
      arms: { local_n: [0, 1, 0], local_e: [0, 0, -1], local_s: [0, -1, 0], local_w: [0, 0, 1] }
    },
    west: {
      normal: [-1, 0, 0],
      support: [1, 0, 0],
      arms: { local_n: [0, 1, 0], local_e: [0, 0, 1], local_s: [0, -1, 0], local_w: [0, 0, -1] }
    }
  };

  console.log("surfaceFrame: six explicit expected mappings");
  for (const face of FACE_LIST) {
    const frame = frameForFace(face);
    const expected = EXPECTED[face];

    assert.ok(FACE_LIST.length === 6, `[${face}] face count`);
    assert.ok(vecEquals(frame.normal, expected.normal), `[${face}] normal`);
    assert.ok(vecEquals(frame.supportOffset, expected.support), `[${face}] support offset is inverse of normal`);
    for (const arm of ARM_NAMES) {
      assert.ok(vecEquals(frame.arms[arm], expected.arms[arm]), `[${face}] ${arm} matches expected`);
    }
    assert.ok(vecEquals(supportOffset(face), expected.support), `[${face}] supportOffset matches worldOffset(face,"back")-style inverse`);
    assert.ok(vecEquals(worldOffset(face, "local_e"), expected.arms.local_e), `[${face}] worldOffset(face,local_e) resolves`);
  }

  console.log("surfaceFrame: geometric checks for every face");
  for (const face of FACE_LIST) {
    const frame = frameForFace(face);
    const { normal, arms: a } = frame;
    const vectors = [a.local_n, a.local_e, a.local_s, a.local_w];

    // unit length
    for (const arm of ARM_NAMES) {
      assert.ok(Math.abs(length3(a[arm]) - 1) < 1e-9, `[${face}] ${arm} unit length`);
    }

    // unique
    const unique = new Set(vectors.map((v) => `${v.join(",")}`));
    assert.ok(unique.size === 4, `[${face}] four arms unique`);

    // perpendicular to the face normal
    for (const arm of ARM_NAMES) {
      assert.ok(Math.abs(dot(a[arm], normal)) < 1e-9, `[${face}] ${arm} perpendicular to normal`);
    }

    // opposites in north/south and east/west pairs
    assert.ok(vecEquals(a.local_n, a.local_s.map((v) => -v)), `[${face}] local_n == -local_s`);
    assert.ok(vecEquals(a.local_e, a.local_w.map((v) => -v)), `[${face}] local_e == -local_w`);

    // right-handed frame: local_e x local_n == normal
    const crossE = [
      a.local_e[1] * a.local_n[2] - a.local_e[2] * a.local_n[1],
      a.local_e[2] * a.local_n[0] - a.local_e[0] * a.local_n[2],
      a.local_e[0] * a.local_n[1] - a.local_e[1] * a.local_n[0]
    ];
    assert.ok(vecEquals(crossE, normal), `[${face}] local_e x local_n == normal`);
  }

}

// ======================================================================
// portDirections.test.mjs
// Port-direction back-contact tests for Task 3.5A.
//
// Prove the repaired graph direction logic: a surface element's "back" port
// resolves to supportOffset(mountFace), never to worldOffset, and absolute
// world_* ports still resolve without a mount face so the full-cube generator's
// six absolute contacts work. Reciprocal directions are checked for three
// cases: (1) a cable mounted directly on every generator face, (2) a cable arm
// in an adjacent block touching every generator face, and (3) a surface cable
// backed by a matching conduit. Absolute generator ports must stay one joined
// source lane.
//
// ======================================================================
{
  // The absolute world_* port name whose vector equals v.
  function worldNameForVec(v) {
      for (const [port, vec] of Object.entries(WORLD_PORTS)) {
          if (vecEquals(vec, v)) {
              return port;
          }
      }
      throw new Error(`no world port for ${v}`);
  }

  // A conduit axis and one mount face whose support normal lies on that axis.
  const CONDUIT_AXIS_FOR_FACE = {
      [AXIS_X]: "east",
      [AXIS_Y]: "up",
      [AXIS_Z]: "north"
  };

  console.log("portDirections: the generator keeps one joined source lane on six absolute contacts");
  const generator = generatorDescriptor();
  assert.equal(generator.lanes.length, 1, "the generator has exactly one lane");
  assert.equal(generator.mountFace, undefined, "the full-cube generator has no mount face");
  assert.ok(generator.lanes[0].ports.size === 6 && [...generator.lanes[0].ports].every((p) => p.startsWith("world_")), "every generator contact is an absolute world_* port");
  for (const [port, vec] of Object.entries(WORLD_PORTS)) {
      assert.ok(vecEquals(worldDirOfPort(undefined, port), vec), `worldDirOfPort resolves ${port} without a mount face`);
  }

  console.log("portDirections: back resolves to supportOffset, never to worldOffset");
  assert.equal(worldDirOfPort("up", "back"), supportOffset("up"), "back resolves to supportOffset(up)");
  let worldOffsetThrows = false;
  try {
      worldOffset("up", "back");
  } catch {
      worldOffsetThrows = true;
  }
  assert.ok(worldOffsetThrows && worldDirOfPort("up", "back") !== undefined, "worldOffset rejects 'back', so a non-throwing back resolution proves it did not go there");
  assert.equal(worldDirOfPort(undefined, "back"), undefined, "a mount-face-less source has no back direction");
  assert.equal(worldDirOfPort("up", "local_n"), worldOffset("up", "local_n"), "local arms still resolve through worldOffset");

  console.log("graph direction: a cable mounted directly on every generator face");
  for (const face of FACE_LIST) {
      const backed = addBackContact(cableDescriptor({ mountFace: face, connections: 0 }));
      assert.ok(backed.lanes[0].ports.has("back"), `${face}: the backed cable carries a back contact`);
      const towardGen = worldDirOfPort(face, "back");
      assert.ok(vecEquals(towardGen, supportOffset(face)), `${face}: the cable's back points to the supporting generator`);
      assert.equal(findReciprocalLane(generator, negate(towardGen)), "main", `${face}: generator reciprocates the cable's back on main`);
      const genPort = worldNameForVec(NORMALS[face]);
      assert.equal(findReciprocalLane(backed, negate(worldDirOfPort(undefined, genPort))), "main", `${face}: cable reciprocates the generator on main`);
  }

  console.log("graph direction: a cable arm in an adjacent block touching every generator face");
  for (const face of FACE_LIST) {
      const inward = negate(NORMALS[face]);
      let side = null;
      for (const m of FACE_LIST) {
          for (const arm of ARM_NAMES) {
              if (vecEquals(worldOffset(m, arm), inward)) {
                  side = { mountFace: m, arm };
                  break;
              }
          }
          if (side) break;
      }
      assert.ok(side !== null, `${face}: a tangent arm reaches back into the generator ${face} face`);
      if (side) {
          const touching = cableDescriptor({ mountFace: side.mountFace, connections: ARM_BITS[side.arm] });
          const towardGen = worldOffset(side.mountFace, side.arm);
          assert.equal(findReciprocalLane(generator, negate(towardGen)), "main", `${face}: generator reciprocates the touching arm on main`);
          const genPort = worldNameForVec(NORMALS[face]);
          assert.equal(findReciprocalLane(touching, negate(worldDirOfPort(undefined, genPort))), "main", `${face}: touching arm reciprocates the generator on main`);
      }
  }

  console.log("graph direction: a surface cable backed by a matching conduit");
  for (const [axis, face] of Object.entries(CONDUIT_AXIS_FOR_FACE)) {
      const conduit = conduitDescriptor({ axis });
      assert.ok(AXIS_FOR_FACE[face] === axis, `axis ${axis}: the mount face ${face} lies on the conduit axis`);
      const backed = addBackContact(cableDescriptor({ mountFace: face, connections: 0 }));
      assert.ok(backed.lanes[0].ports.has("back"), `${axis}: the backed cable carries a back contact`);
      const towardConduit = worldDirOfPort(face, "back");
      assert.ok(vecEquals(towardConduit, supportOffset(face)), `${axis}: the cable's back points to the supporting conduit`);
      assert.equal(findReciprocalLane(conduit, negate(towardConduit)), "main", `${axis}: conduit reciprocates the cable's back on main`);
      const conduitPort = worldNameForVec(NORMALS[face]);
      assert.equal(findReciprocalLane(backed, negate(worldDirOfPort(undefined, conduitPort))), "main", `${axis}: cable reciprocates the conduit on main`);
  }

}

// ======================================================================
// cableTopology.test.mjs
// Cable neighbor rule tests for Task 2.1.
//
// ======================================================================
{
  // A coplanar cable neighbor on the same face exposes all four joined local ports.
  function sameFaceCable(face) {
      return {
          kind: "cable",
          mountFace: face,
          lanes: [{ id: "main", ports: new Set(["local_n", "local_e", "local_s", "local_w"]) }]
      };
  }

  // A flat device (generator/lamp/adapter): one joined main lane, four tangent
  // local ports. A restricted device may omit ports to model a one-directional
  // contact.
  function sameFaceDevice(face, ports = ["local_n", "local_e", "local_s", "local_w"]) {
      return {
          kind: "device",
          mountFace: face,
          lanes: [{ id: "main", ports: new Set(ports) }]
      };
  }

  // A bridge: ns lane carries the local n/s ports, ew lane carries the local
  // e/w ports. The two lanes are independent.
  function sameFaceBridge(face) {
      return {
          kind: "bridge",
          mountFace: face,
          lanes: [
              { id: "ns", ports: new Set(["local_n", "local_s"]) },
              { id: "ew", ports: new Set(["local_e", "local_w"]) }
          ]
      };
  }

  // A conduit has no mount face; its two world ports lie on its axis.
  function conduitNeighbor(ports = ["world_up", "world_down"]) {
      return {
          kind: "conduit",
          lanes: [{ id: "main", ports: new Set(ports) }]
      };
  }

  const FACE = "north";

  console.log("cableTopology: isolated");
  assert.equal(cableConnectionMask(FACE, {}), 0, "isolated dot is mask 0");

  console.log("cableTopology: endpoint");
  assert.equal(cableConnectionMask(FACE, { local_n: sameFaceCable(FACE) }), ARM_BITS.local_n, "one north neighbor is a single endpoint bit");

  console.log("cableTopology: straight");
  assert.equal(cableConnectionMask(FACE, { local_n: sameFaceCable(FACE), local_s: sameFaceCable(FACE) }), ARM_BITS.local_n | ARM_BITS.local_s, "opposite neighbors form a straight");

  console.log("cableTopology: L/elbow");
  assert.equal(cableConnectionMask(FACE, { local_n: sameFaceCable(FACE), local_e: sameFaceCable(FACE) }), ARM_BITS.local_n | ARM_BITS.local_e, "adjacent neighbors form an L");

  console.log("cableTopology: T");
  assert.equal(cableConnectionMask(FACE, {
      local_n: sameFaceCable(FACE),
      local_e: sameFaceCable(FACE),
      local_s: sameFaceCable(FACE)
  }), ARM_BITS.local_n | ARM_BITS.local_e | ARM_BITS.local_s, "three neighbors form a T");

  console.log("cableTopology: joined four-way intersection");
  assert.equal(cableConnectionMask(FACE, {
      local_n: sameFaceCable(FACE),
      local_e: sameFaceCable(FACE),
      local_s: sameFaceCable(FACE),
      local_w: sameFaceCable(FACE)
  }), 15, "four neighbors form the joined intersection");

  console.log("cableTopology: bridge-lane contact");
  assert.equal(cableConnectionMask(FACE, { local_n: sameFaceBridge(FACE) }), ARM_BITS.local_n, "bridge north side contacts the ns lane");
  assert.equal(cableConnectionMask(FACE, { local_e: sameFaceBridge(FACE) }), ARM_BITS.local_e, "bridge east side contacts the ew lane");
  assert.equal(cableConnectionMask(FACE, { local_n: sameFaceBridge(FACE), local_w: sameFaceBridge(FACE) }), ARM_BITS.local_n | ARM_BITS.local_w, "bridge lanes are contacted independently on their own sides");

  console.log("cableTopology: different-face rejection");
  assert.equal(cableConnectionMask(FACE, { local_n: sameFaceCable("east") }), 0, "a neighbor on a different mounting face connects nothing");

  console.log("cableTopology: a conduit end is a tangent contact, its side is not");
  // On a north wall local_n points up: a y conduit above shows its lower end.
  assert.equal(cableConnectionMask(FACE, { local_n: conduitNeighbor() }), ARM_BITS.local_n, "an arm reaches a conduit end");
  assert.equal(cableConnectionMask(FACE, { local_n: conduitNeighbor(["world_east", "world_west"]) }), 0, "an arm never reaches a conduit side");

  console.log("cableTopology: reciprocal device port checks");
  assert.equal(cableConnectionMask(FACE, { local_s: sameFaceDevice(FACE) }), ARM_BITS.local_s, "a flat device with a joined port on the reciprocal side connects");
  assert.equal(cableConnectionMask(FACE, { local_n: sameFaceDevice(FACE, ["local_n"]) }), 0, "a device port pointing away from the neighbor is not reciprocal");
  assert.equal(hasReciprocalPort(FACE, conduitNeighbor(["world_north", "world_south"]), [0, -1, 0]), false, "hasReciprocalPort rejects a conduit whose axis misses the cable");
  assert.equal(hasReciprocalPort(FACE, sameFaceCable("east"), [0, -1, 0]), false, "hasReciprocalPort rejects a different-face neighbor");

}

// ======================================================================
// descriptor.test.mjs
// Descriptor contract tests for Task 3.3.
//
// Prove the plan section 5.4 descriptor contract: cables expose their current
// world-space tangent ports, flat sources and consumers expose four joined
// tangent ports, the bridge exposes two isolated lanes, a matching conduit
// support adds a back contact, and reciprocal ports agree. Runs with no
// Minecraft module, so descriptorForBlock is exercised only through plain
// stand-in objects that shape like a Block.
//
// ======================================================================
{
  function has(descriptor, laneId, port) {
      for (const lane of descriptor.lanes) {
          if (lane.id === laneId) {
              return lane.ports.has(port);
          }
      }
      return false;
  }

  function portSet(descriptor, laneId) {
      for (const lane of descriptor.lanes) {
          if (lane.id === laneId) {
              return new Set(lane.ports);
          }
      }
      return undefined;
  }

  function worldNameForVec(vec) {
      const sign = [
          vec[0] > 0 ? "east" : vec[0] < 0 ? "west" : null,
          vec[1] > 0 ? "up" : vec[1] < 0 ? "down" : null,
          vec[2] > 0 ? "south" : vec[2] < 0 ? "north" : null
      ].find((n) => n !== null);
      return `world_${sign}`;
  }

  console.log("descriptor: cable exposes current world-space tangent ports");
  for (const face of FACE_LIST) {
      // Every connection mask exposes exactly the world port of each set arm.
      for (let mask = 0; mask < 16; mask++) {
          const desc = cableDescriptor({ mountFace: face, connections: mask });
          assert.equal(desc.kind, "cable", `cable kind on ${face}`);
          assert.equal(desc.lanes.length, 1, `cable has one lane on ${face}`);
          const expected = new Set();
          if (mask & 1) expected.add(worldNameForVec(worldOffset(face, "local_n")));
          if (mask & 2) expected.add(worldNameForVec(worldOffset(face, "local_e")));
          if (mask & 4) expected.add(worldNameForVec(worldOffset(face, "local_s")));
          if (mask & 8) expected.add(worldNameForVec(worldOffset(face, "local_w")));
          const got = portSet(desc, "main");
          assert.equal([...got].sort().join(","), [...expected].sort().join(","), `mask ${mask} on ${face} ports`);
      }
  }
  assert.equal(portSet(cableDescriptor({ mountFace: "up", connections: 0 }), "main").size, 0, "isolated cable exposes no ports");
  assert.equal([...portSet(cableDescriptor({ mountFace: "up", connections: 3 }), "main")].sort().join(","), "world_east,world_north", "north+east bits expose world_north and world_east");

  // A flat source never reaches the graph (electricalBlocks overwrites its kind), so only
  // the consumer shape is asserted.
  console.log("descriptor: flat consumer exposes four joined tangent ports");
  for (const face of FACE_LIST) {
      const lamp = flatDescriptor({ mountFace: face });
      assert.equal(lamp.kind, "consumer", "lamp kind is consumer");
      assert.equal(lamp.lanes[0].sourceOn, false, "consumer lane flags no sourceOn");
      assert.equal(portSet(lamp, "main").size, 4, "flat consumer has four joined ports");
      for (const arm of ["local_n", "local_e", "local_s", "local_w"]) {
          assert.ok(portSet(lamp, "main").has(worldNameForVec(worldOffset(face, arm))), `flat port covers ${arm} on ${face}`);
      }
  }

  console.log("descriptor: bridge exposes two isolated lanes");
  const bridge = bridgeDescriptor({ mountFace: "up", poweredNs: true, poweredEw: false });
  assert.equal(bridge.kind, "bridge", "bridge kind");
  assert.equal(bridge.mountFace, "up", "bridge retains its mounting face for world-direction resolution");
  assert.equal(bridge.lanes.length, 2, "bridge has two lanes");
  assert.equal([...portSet(bridge, "ns")].sort().join(","), "local_n,local_s", "ns lane carries local_n/local_s");
  assert.equal([...portSet(bridge, "ew")].sort().join(","), "local_e,local_w", "ew lane carries local_e/local_w");
  assert.ok([...portSet(bridge, "ns")].every((p) => !portSet(bridge, "ew").has(p)), "the two lanes share no port");
  assert.equal(bridge.lanes[0].powered, true, "ns lane carries its own powered flag");
  assert.equal(bridge.lanes[1].powered, false, "ew lane carries its own powered flag");

  console.log("descriptor: conduit joins two opposite world ports along its axis");
  assert.equal([...portSet(conduitDescriptor({ axis: "z" }), "main")].sort().join(","), "world_north,world_south", "z axis runs north-south");
  assert.equal([...portSet(conduitDescriptor({ axis: "x" }), "main")].sort().join(","), "world_east,world_west", "x axis runs east-west");
  assert.equal([...portSet(conduitDescriptor({ axis: "y" }), "main")].sort().join(","), "world_down,world_up", "y axis runs up-down");

  console.log("descriptor: matching conduit support adds a back contact");
  assert.ok(matchingConduitAxis("up", "y") === true, "up face matches a y conduit");
  assert.ok(matchingConduitAxis("up", "x") === false, "up face rejects an x conduit");
  assert.ok(matchingConduitAxis("north", "z") === true, "north face matches a z conduit");
  assert.ok(matchingConduitAxis("east", "x") === true, "east face matches an x conduit");
  const backed = addBackContact(cableDescriptor({ mountFace: "up", connections: 1 }));
  assert.ok(backed.lanes[0].ports.has("back"), "addBackContact adds the back port");
  assert.equal(backed.lanes[0].ports.size, 2, "back contact is added alongside the tangent port");

  console.log("descriptor: reciprocal world-space ports agree across opposite arms");
  const OPPOSITE = { local_n: "local_s", local_s: "local_n", local_e: "local_w", local_w: "local_e" };
  function isInverse(a, b) {
      return a[0] === -b[0] && a[1] === -b[1] && a[2] === -b[2];
  }
  for (const face of FACE_LIST) {
      for (const arm of ["local_n", "local_e", "local_s", "local_w"]) {
          const forward = worldOffset(face, arm);
          const oppositeArm = OPPOSITE[arm];
          const backward = worldOffset(face, oppositeArm);
          assert.ok(isInverse(forward, backward), `arm ${arm} is the inverse of ${oppositeArm} on ${face}`);
          // A cable exposing `arm` and a coplanar neighbor on that arm exposing its
          // opposite (reciprocal) port point at each other in world space.
          const ours = worldNameForVec(forward);
          const theirs = worldNameForVec(backward);
          assert.ok(ours !== theirs, `our ${arm} port ${ours} is the inverse of neighbor's ${oppositeArm} port ${theirs}`);
      }
  }

  console.log("descriptor: descriptorForBlock returns undefined for unrelated blocks");
  assert.equal(descriptorForBlock(undefined), undefined, "invalid block yields no descriptor");
  assert.equal(descriptorForBlock({ isValid: false }), undefined, "an invalid block yields no descriptor");
  assert.equal(descriptorForBlock({ type: { id: "minecraft:stone" }, isValid: true, permutation: { getState: () => undefined } }), undefined, "a non-starstone block yields no descriptor");

  console.log("descriptor: descriptorForBlock never embeds the Block object");
  const standIn = {
      isValid: true,
      type: { id: "starstone:cable" },
      location: { x: 1, y: 2, z: 3 },
      dimension: { isChunkLoaded: () => true, getBlock: () => undefined },
      permutation: {
          getState: (name) => ({
              "minecraft:block_face": "up",
              "starstone:connections": 3,
              "starstone:powered": true
          }[name])
      }
  };
  const desc = descriptorForBlock(standIn);
  assert.ok(desc.block === undefined && desc.lanes.every((lane) => !lane.block), "descriptor has no block reference");
  assert.ok(portSet(desc, "main").has(worldNameForVec(worldOffset("up", "local_n"))) && portSet(desc, "main").has(worldNameForVec(worldOffset("up", "local_e"))), "cable descriptor exposes the tangent ports for connections 3");

  console.log("descriptor: a matching conduit support adds the back contact");
  const withConduit = {
      isValid: true,
      type: { id: "starstone:lamp" },
      location: { x: 1, y: 2, z: 3 },
      dimension: {
          isChunkLoaded: () => true,
          getBlock: () => ({
              isValid: true,
              permutation: { getState: (name) => ("starstone:axis" === name ? "y" : undefined) }
          })
      },
      permutation: {
          getState: (name) => ({
              "minecraft:block_face": "up",
              "starstone:powered": true
          }[name])
      }
  };
  const lampDesc = descriptorForBlock(withConduit);
  assert.ok(lampDesc.lanes[0].ports.has("back"), "a flat device on a matching y conduit support gains the back port");

  const withoutConduit = {
      isValid: true,
      type: { id: "starstone:lamp" },
      location: { x: 1, y: 2, z: 3 },
      dimension: {
          isChunkLoaded: () => true,
          getBlock: () => ({
              isValid: true,
              permutation: { getState: (name) => ("starstone:axis" === name ? "x" : undefined) }
          })
      },
      permutation: {
          getState: (name) => ({
              "minecraft:block_face": "up",
              "starstone:powered": true
          }[name])
      }
  };
  const lampNoConduit = descriptorForBlock(withoutConduit);
  assert.ok(!lampNoConduit.lanes[0].ports.has("back"), "a flat device on a non-matching conduit support has no back port");

  // Whether a neighbour descriptor exposes a port pointing along target, the world
  // direction from the generator back to that neighbour.
  function neighborHasPortDir(descriptor, mountFace, target) {
      for (const lane of descriptor.lanes) {
          for (const port of lane.ports) {
              const dir = worldDirOfPort(mountFace, port);
              if (dir && vecEquals(dir, target)) {
                  return true;
              }
          }
      }
      return false;
  }

  console.log("descriptor: the generator exposes one joined source lane on all six world faces");
  const gen = generatorDescriptor();
  assert.equal(gen.kind, "source", "the generator kind is source");
  assert.equal(gen.lanes.length, 1, "the generator has exactly one lane");
  assert.equal(gen.mountFace, undefined, "the full-cube generator has no mounting face");
  assert.equal(gen.lanes[0].sourceOn, true, "the generator lane is a source");
  assert.equal(portSet(gen, "main").size, 6, "the generator exposes six world ports in a single lane");
  for (const face of FACE_LIST) {
      assert.ok(portSet(gen, "main").has(worldNameForVec(NORMALS[face])), `the generator carries the world contact of ${face}`);
  }
  assert.ok(portSet(gen, "main").size === 6 && [...portSet(gen, "main")].every((p) => p.startsWith("world_")), "every generator contact lives in the one source lane");

  console.log("descriptor: descriptorForBlock reports the enabled generator as a six-contact source");
  const genStandIn = {
      isValid: true,
      type: { id: "starstone:generator" },
      location: { x: 0, y: 0, z: 0 },
      dimension: { isChunkLoaded: () => true, getBlock: () => undefined },
      permutation: { getState: (name) => ("starstone:enabled" === name ? true : undefined) }
  };
  const genBlockDesc = descriptorForBlock(genStandIn);
  assert.equal(genBlockDesc.kind, "source", "the generator block descriptor is a source");
  assert.equal(genBlockDesc.lanes.length, 1, "the generator block descriptor has one lane");
  assert.equal(genBlockDesc.lanes[0].sourceOn, true, "an enabled generator flags its source lane");
  assert.equal(portSet(genBlockDesc, "main").size, 6, "the generator block descriptor contacts all six faces");

  console.log("descriptor: a cable backed by a generator support gains a reciprocal back contact");
  const genBlock = {
      isValid: true,
      type: { id: "starstone:generator" },
      location: { x: 0, y: 0, z: 0 },
      dimension: { isChunkLoaded: () => true, getBlock: () => genBlock },
      permutation: { getState: () => undefined }
  };
  const backedCableStandIn = {
      isValid: true,
      type: { id: "starstone:cable" },
      location: { x: 0, y: 0, z: 0 },
      dimension: { isChunkLoaded: () => true, getBlock: () => genBlock },
      permutation: { getState: (name) => ("minecraft:block_face" === name ? "up" : undefined) }
  };
  const backedCableDesc = descriptorForBlock(backedCableStandIn);
  assert.ok(backedCableDesc.lanes[0].ports.has("back"), "a cable mounted on a generator support gains the back contact");

  console.log("descriptor: a cable mounted on a generator face reciprocates on each of the six faces");
  for (const face of FACE_LIST) {
      const outward = NORMALS[face];
      const inward = outward.map((v) => -v);
      assert.ok(vecEquals(worldDirOfPort(undefined, worldNameForVec(outward)), outward), `the generator points toward ${face} along its world port`);
      const backed = addBackContact(cableDescriptor({ mountFace: face, connections: 1 }));
      assert.ok(backed.lanes[0].ports.has("back"), `a ${face}-mounted cable gains a back contact`);
      assert.ok(neighborHasPortDir(backed, face, inward), `the ${face}-mounted cable's back contact points back at the generator`);
  }

  console.log("descriptor: a cable arm touching a generator face connects on each of the six faces");
  for (const face of FACE_LIST) {
      const inward = NORMALS[face].map((v) => -v);
      let side = null;
      for (const m of FACE_LIST) {
          for (const arm of ARM_NAMES) {
              if (vecEquals(worldOffset(m, arm), inward)) {
                  side = { mountFace: m, arm };
                  break;
              }
          }
          if (side) {
              break;
          }
      }
      assert.ok(side !== null, `a tangent arm reaches back into the ${face} face of the generator`);
      if (side) {
          const touching = cableDescriptor({ mountFace: side.mountFace, connections: ARM_BITS[side.arm] });
          assert.ok(neighborHasPortDir(touching, side.mountFace, inward), `the ${face}-touching cable arm reaches the generator`);
      }
  }

  console.log("descriptor: the lamp stays a joined conducting consumer, not a leaf");
  for (const face of FACE_LIST) {
      const lamp = flatDescriptor({ mountFace: face });
      assert.equal(lamp.kind, "consumer", `the lamp kind is consumer on ${face}`);
      assert.equal(lamp.lanes.length, 1, `the lamp has one joined lane on ${face}`);
      assert.equal(lamp.lanes[0].sourceOn, false, `the lamp is not a source on ${face}`);
      assert.equal(portSet(lamp, "main").size, 4, `the lamp has four joined tangent ports on ${face}`);
      const ports = [...portSet(lamp, "main")];
      assert.ok(ports.length >= 2, `the lamp can receive on one tangent port and propagate through another on ${face}`);
  }

}

// ======================================================================
// graphNeighbor.test.mjs
// Graph neighbor rule tests for Task 2.7.
//
// Prove bridge lane isolation: a single bridge contributes two isolated node
// references, a neighboring cable joins only its matching lane, and two
// generators feeding perpendicular lines through the bridge can independently
// drive off/off, on/off, off/on, and on/on at two distant lamps.
//
// ======================================================================
{
  // An undirected line graph of #main cable nodes with a lamp or generator at one
  // end and the bridge lane node at the other. Edges are stored both directions so
  // power reaches either end.
  class Line {
      constructor() {
          this.edges = new Set();
          this.adj = new Map();
      }

      add(a, b) {
          const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
          if (this.edges.has(key)) return;
          this.edges.add(key);
          if (!this.adj.has(a)) this.adj.set(a, []);
          if (!this.adj.has(b)) this.adj.set(b, []);
          this.adj.get(a).push(b);
          this.adj.get(b).push(a);
      }

      reachable(from) {
          const seen = new Set([from]);
          const stack = [from];
          while (stack.length > 0) {
              const node = stack.pop();
              for (const next of (this.adj.get(node) || [])) {
                  if (!seen.has(next)) {
                      seen.add(next);
                      stack.push(next);
                  }
              }
          }
          return seen;
      }
  }

  const BRIDGE = "bridge";
  const FACE = "up";

  // Neighbor descriptors around the bridge, one per local arm, each carrying its
  // own block key so buildBridgeEdges can target the correct #main node.
  function bridgeNeighbors() {
      return {
          local_n: { key: "cable_n" },
          local_e: { key: "cable_e" },
          local_s: { key: "cable_s" },
          local_w: { key: "cable_w" }
      };
  }

  console.log("electricalBlocks: two node refs per bridge");
  const refs = bridgeNodeRefs(BRIDGE);
  assert.equal(refs.length, 2, "a bridge yields exactly two node references");
  assert.equal(refs[0], `${BRIDGE}#${LANE_NS}`, "first reference is the ns lane");
  assert.equal(refs[1], `${BRIDGE}#${LANE_EW}`, "second reference is the ew lane");
  assert.ok(refs.every((r) => r.includes("#")), "no reference is unsuffixed");
  assert.ok(refs[0] !== refs[1], "the two references differ");

  console.log("electricalBlocks: a neighbor joins only its matching lane");
  assert.equal(bridgeLaneAt(FACE, "local_n"), LANE_NS, "north arm contacts the ns lane");
  assert.equal(bridgeLaneAt(FACE, "local_s"), LANE_NS, "south arm contacts the ns lane");
  assert.equal(bridgeLaneAt(FACE, "local_e"), LANE_EW, "east arm contacts the ew lane");
  assert.equal(bridgeLaneAt(FACE, "local_w"), LANE_EW, "west arm contacts the ew lane");
  assert.ok(laneHasPort(LANE_NS, "local_n") && laneHasPort(LANE_NS, "local_s"), "ns lane carries the north and south ports");
  assert.ok(laneHasPort(LANE_EW, "local_e") && laneHasPort(LANE_EW, "local_w"), "ew lane carries the east and west ports");

  const bridgeEdges = buildBridgeEdges(BRIDGE, FACE, bridgeNeighbors());
  const nsEdgeTargets = bridgeEdges.filter(([, to]) => to === `${BRIDGE}#${LANE_NS}`).length;
  const ewEdgeTargets = bridgeEdges.filter(([, to]) => to === `${BRIDGE}#${LANE_EW}`).length;
  assert.equal(nsEdgeTargets, 2, "both north and south neighbors target the ns lane");
  assert.equal(ewEdgeTargets, 2, "both east and west neighbors target the ew lane");
  assert.ok(bridgeEdges.every(([from, to]) => !(from === `${BRIDGE}#${LANE_NS}` && to === `${BRIDGE}#${LANE_EW}`) && !(from === `${BRIDGE}#${LANE_EW}` && to === `${BRIDGE}#${LANE_NS}`)), "there is never an edge between the ns and ew lanes");

  console.log("bridge: two perpendicular lines stay isolated in all power states");
  const graph = new Line();
  // North-south line feeds lamp_s through the ns lane.
  graph.add("gen_n#main", "cable_n#main");
  graph.add("cable_s#main", "lamp_s#main");
  // East-west line feeds lamp_w through the ew lane.
  graph.add("gen_e#main", "cable_e#main");
  graph.add("cable_w#main", "lamp_w#main");
  // The bridge joins each cable to the lane that matches its arm.
  for (const [from, to] of bridgeEdges) {
      graph.add(from, to);
  }

  const states = [];
  for (const genN of [false, true]) {
      for (const genE of [false, true]) {
          const sources = [];
          if (genN) sources.push("gen_n#main");
          if (genE) sources.push("gen_e#main");
          const seen = new Set();
          for (const s of sources) for (const node of graph.reachable(s, sources)) seen.add(node);
          const lampS = seen.has("lamp_s#main");
          const lampW = seen.has("lamp_w#main");
          states.push({ genN, genE, lampS, lampW });
      }
  }

  const key = (s) => `${s.genN ? 1 : 0},${s.genE ? 1 : 0}->${s.lampS ? 1 : 0},${s.lampW ? 1 : 0}`;
  const covered = new Set(states.map(key));
  assert.ok(covered.has("0,0->0,0"), "off/off at both lamps");
  assert.ok(covered.has("1,0->1,0"), "on/off: ns generator powers only lamp_s");
  assert.ok(covered.has("0,1->0,1"), "on/off: ew generator powers only lamp_w");
  assert.ok(covered.has("1,1->1,1"), "on/on: both generators power their own lamp");

  const genNOnlyReachLampW = states.filter((s) => s.genN && !s.genE).some((s) => s.lampW);
  const genEOnlyReachLampS = states.filter((s) => !s.genN && s.genE).some((s) => s.lampS);
  assert.ok(!genNOnlyReachLampW, "the ns generator never reaches the ew lamp");
  assert.ok(!genEOnlyReachLampS, "the ew generator never reaches the ns lamp");

}

console.log("geometryTables: all checks passed");
