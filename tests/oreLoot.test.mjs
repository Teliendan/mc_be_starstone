import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => JSON.parse(fs.readFileSync(`starstone_bp/${file}`, 'utf8'));
const ore = read('loot_tables/blocks/ore.json');
function matches(condition, tool) {
    assert.equal(condition.condition, 'match_tool');
    const result = !!tool && condition.enchantments.every(({enchantment, levels}) => {
        const level = tool[enchantment];
        return level !== undefined && level >= (levels.range_min ?? -Infinity) && level <= (levels.range_max ?? Infinity);
    });
    return condition.operator === 'not' ? !result : result;
}
function drops(table, tool, upper = false) {
    const result = [];
    for (const pool of table.pools) {
        assert.equal(pool.rolls, 1);
        if (!(pool.conditions || []).every(condition => matches(condition, tool))) continue;
        assert.equal(pool.entries.length, 1);
        const entry = pool.entries[0];
        assert.equal(entry.type, 'item');
        const functions = entry.functions || [];
        assert.equal(functions.at(-1)?.function, 'explosion_decay');
        assert.equal(functions.filter(fn => fn.function === 'explosion_decay').length, 1);
        // Native decay uses the engine blast context. Outside blasts it preserves
        // the stack; do not recreate or guess its radius formula in this oracle.
        const setCount = functions.find(fn => fn.function === 'set_count');
        result.push({item: entry.name, count: setCount ? setCount.count[upper ? 'max' : 'min'] : 1});
    }
    return result;
}
function contract(table) {
    for (const fortune of [undefined, 1, 2, 3, 4, 255]) {
        const tool = fortune === undefined ? {} : {fortune};
        const bonus = Math.min(fortune ?? 0, 3);
        assert.deepEqual(drops(table, tool), [{item: 'starstone:dust', count: 2 + bonus}]);
        assert.deepEqual(drops(table, tool, true), [{item: 'starstone:dust', count: 4 + bonus}]);
        assert.deepEqual(drops(table, {...tool, silk_touch: 1}), [{item: 'starstone:ore', count: 1}]);
    }
    assert.deepEqual(drops(table, undefined), [{item: 'starstone:dust', count: 2}],
        'environmental no-tool context must select the base native branch');
}
contract(ore);
for (const id of ['conduit', 'generator']) {
    const table = read(`loot_tables/blocks/${id}.json`);
    assert.deepEqual(drops(table, undefined), [{item: `starstone:${id}`, count: 1}]);
    assert.deepEqual(drops(table, {silk_touch:1, fortune:3}), [{item:`starstone:${id}`, count:1}]);
}
const engine = read('manifest.json').header.min_engine_version;
assert.ok(engine[1] >= 26 && (engine[1] > 26 || engine[2] >= 50), 'condition negation requires 26.50');
const main = fs.readFileSync('starstone_bp/scripts/main.js', 'utf8');
assert.doesNotMatch(main, /registerOreLoot|oreLoot\.js/);
assert.ok(!fs.existsSync('starstone_bp/scripts/oreLoot.js'), 'no obsolete after-break item spawner');
for (const mutate of [
    table => { table.pools[1].conditions = []; },
    table => { table.pools[3].entries[0].functions[0].count.max = 8; },
    table => { table.pools[0].entries[0].functions = []; },
    table => { table.pools[1].conditions[1].operator = 'equals'; },
]) {
    const broken = structuredClone(ore); mutate(broken);
    assert.throws(() => contract(broken), 'exclusive yield/decay contract must reject broken fixture');
}
console.log('native ore loot: approved yield, all Fortune branches, Silk exclusivity, environmental ownership, decay and broken fixtures passed');
