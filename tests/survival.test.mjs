import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bp = path.join(root, 'starstone_bp');
const rp = path.join(root, 'starstone_rp');

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));
}

for (const [file, identifier, icon] of [
  ['dust.json', 'starstone:dust', 'starstone_dust'],
  ['crystal.json', 'starstone:crystal', 'starstone_crystal'],
  ['compressed_dust.json', 'starstone:compressed_dust', 'starstone_compressed_dust'],
]) {
  const item = readJson(bp, 'items', file)['minecraft:item'];
  assert.equal(item.description.identifier, identifier);
  assert.equal(item.components['minecraft:max_stack_size'], 64);
  assert.equal(item.components['minecraft:icon'], icon);
  assert.equal(item.components['minecraft:display_name'].value, `item.${identifier}`);
}

const ore = readJson(bp, 'blocks', 'ore.json')['minecraft:block'];
assert.equal(ore.description.identifier, 'starstone:ore');
assert.equal(ore.components['minecraft:geometry'], 'minecraft:geometry.full_block');
assert.equal(ore.components['minecraft:loot'], 'loot_tables/blocks/ore.json');
assert.equal(ore.components['minecraft:material_instances']['*'].texture, 'starstone:ore');
const mining = ore.components['minecraft:destructible_by_mining'];
assert.equal(mining.seconds_to_destroy, 3);
assert.equal(mining.item_specific_speeds, undefined,
  'native pickaxe effectiveness replaces the old hand-tuned tier times');
assert.ok(ore.components['minecraft:tags'].includes('minecraft:is_pickaxe_item_destructible'));
assert.equal(ore.components['minecraft:destructible_by_explosion'].explosion_resistance, 3);

const loot = readJson(bp, 'loot_tables', 'blocks', 'ore.json');
assert.equal(loot.pools.length, 5, 'native loot owns Silk Touch and four exclusive Dust branches');
assert.ok(loot.pools.every(pool => pool.entries.every(entry =>
  entry.functions?.at(-1)?.function === 'explosion_decay')),
  'native explosion context must apply after the approved yield');

const feature = readJson(bp, 'features', 'ore_feature.json')['minecraft:ore_feature'];
assert.equal(feature.description.identifier, 'starstone:ore_feature');
assert.equal(feature.count, 8);
assert.equal(feature.replace_rules[0].places_block, 'starstone:ore');
assert.deepEqual(feature.replace_rules[0].may_replace.map(({ name }) => name), [
  'minecraft:stone', 'minecraft:deepslate',
]);
assert.equal(Object.hasOwn(feature, 'discard_chance_on_air_exposure'), false);

for (const [file, attempts, distribution, extent] of [
  ['ore_underground.json', 4, 'uniform', [-64, 15]],
  ['ore_deep.json', 8, 'triangle', [-96, -32]],
]) {
  const rule = readJson(bp, 'feature_rules', file)['minecraft:feature_rules'];
  assert.equal(rule.description.identifier, `starstone:${path.basename(file, '.json')}`);
  assert.equal(rule.description.places_feature, 'starstone:ore_feature');
  assert.equal(rule.conditions.placement_pass, 'underground_pass');
  assert.equal(rule.distribution.iterations, attempts);
  assert.equal(rule.distribution.y.distribution, distribution);
  assert.deepEqual(rule.distribution.y.extent, extent);
  assert.deepEqual(rule.distribution.x.extent, [0, 16]);
  assert.deepEqual(rule.distribution.z.extent, [0, 16]);
}

const blocks = readJson(rp, 'blocks.json');
assert.equal(blocks.format_version, '1.21.40');
assert.deepEqual(blocks['starstone:ore'], { sound: 'stone' });
const terrain = readJson(rp, 'textures', 'terrain_texture.json');
assert.equal(terrain.texture_data['starstone:ore'].textures, 'textures/blocks/starstone_ore');
const items = readJson(rp, 'textures', 'item_texture.json');
for (const key of ['starstone_dust', 'starstone_crystal', 'starstone_compressed_dust']) {
  assert.equal(typeof items.texture_data[key]?.textures, 'string');
}
const lang = fs.readFileSync(path.join(rp, 'texts', 'en_US.lang'), 'utf8');
for (const key of ['tile.starstone:ore.name=', 'item.starstone:dust=', 'item.starstone:crystal=', 'item.starstone:compressed_dust=']) {
  assert.equal(lang.includes(key), true);
}
const recipe = (name, kind) => readJson(bp, 'recipes', `${name}.json`)[`minecraft:recipe_${kind}`];
const cable = recipe('cable', 'shaped');
assert.deepEqual(cable.pattern, ['CSC']);
assert.equal(cable.key.C.item, 'minecraft:copper_ingot');
assert.equal(cable.key.S.item, 'starstone:dust');
assert.deepEqual(cable.result, { item: 'starstone:cable_item', count: 1 });
const innerCorner = recipe('inner_corner', 'shaped');
assert.deepEqual(innerCorner.pattern, ['C ', ' C']);
assert.equal(innerCorner.key.C.item, 'starstone:cable_item');
assert.deepEqual(innerCorner.result, { item: 'starstone:inner_corner_item', count: 1 });
// Count how often each item fills the grid of a shaped recipe.
const gridCount = (body, item) => body.pattern.join('').split('')
  .filter(symbol => symbol !== ' ' && body.key[symbol]?.item === item).length;
const compressed = recipe('compressed_dust', 'shaped');
assert.equal(gridCount(compressed, 'starstone:dust'), 4);
assert.equal(gridCount(compressed, 'minecraft:copper_ingot'), 1);
assert.equal(compressed.result.item, 'starstone:compressed_dust');
const crystal = recipe('crystal', 'furnace');
assert.equal(crystal.input, 'starstone:compressed_dust');
assert.equal(crystal.output, 'starstone:crystal');
assert.deepEqual(crystal.tags, ['furnace']);
const bridge = recipe('bridge', 'shaped');
assert.equal(gridCount(bridge, 'starstone:cable_item'), 4);
assert.equal(gridCount(bridge, 'starstone:crystal'), 0);
const conduit = recipe('conduit', 'shaped');
assert.equal(gridCount(conduit, 'minecraft:chiseled_stone_bricks'), 1);
const generator = recipe('generator', 'shaped');
assert.equal(gridCount(generator, 'starstone:crystal'), 2);
const lamp = recipe('lamp', 'shaped');
assert.equal(gridCount(lamp, 'starstone:crystal'), 1);
assert.equal(gridCount(lamp, 'starstone:dust'), 0);
assert.equal(lamp.result.item, 'starstone:lamp');
assert.equal(lamp.unlock[0].item, 'starstone:crystal');
// Workspace rule: every crafting recipe defines its shape. A consistent grid
// uses every key symbol, and every symbol it uses is in the key.
for (const file of fs.readdirSync(path.join(bp, 'recipes'))) {
  const data = readJson(bp, 'recipes', file);
  if (data['minecraft:recipe_furnace']) continue;
  assert.equal(data['minecraft:recipe_shapeless'], undefined, `${file} must not be shapeless`);
  const body = data['minecraft:recipe_shaped'];
  assert.ok(body, `${file} is a shaped recipe`);
  assert.ok(Array.isArray(body.pattern) && body.pattern.length >= 1 && body.pattern.length <= 3, `${file} has a 1-3 row pattern`);
  assert.equal(new Set(body.pattern.map(row => row.length)).size, 1, `${file} pattern rows share one width`);
  assert.ok(body.pattern[0].length <= 3, `${file} pattern is at most 3 wide`);
  const used = new Set(body.pattern.join('').replace(/ /g, ''));
  assert.deepEqual([...used].sort(), Object.keys(body.key).sort(), `${file} key matches its pattern symbols`);
  assert.equal(body.tags.includes('crafting_table'), true);
  assert.equal(body.unlock.length > 0, true);
  assert.equal(JSON.stringify(body).includes('amethyst'), false);
}
assert.equal(fs.existsSync(path.join(root, 'docs', 'SURVIVAL.md')), true);

console.log('survival tests passed');
