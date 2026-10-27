import { world } from '@minecraft/server';

const ORE = 'starstone:ore';

// One native orb per entry, so the total keeps vanilla-like denominations.
const ORBS = { 1: [1], 2: [1, 1], 3: [3], 4: [3, 1], 5: [3, 1, 1] };

export function spawnOreExperience(dimension, location, amount) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 5) throw new RangeError('Ore XP must be 1–5');
    // Native orbs: pickup (and Mending) is handled by the engine.
    for (const orb of ORBS[amount]) dimension.spawnXp(location, orb);
}

export function handleOreExperience(event, random = Math.random) {
    const mode = event.player.getGameMode();
    if (mode !== 'Survival' && mode !== 'Adventure') return 0;
    const tool = event.itemStackBeforeBreak;
    // Survival/Adventure wrong-tool breaks are canceled by harvestGate, so a tool is valid here.
    // doTileDrops gating is a guess (Java does it), not verified Bedrock parity.
    if (world.gameRules.doTileDrops === false) return 0;
    if (tool.getComponent('minecraft:enchantable')?.hasEnchantment('silk_touch')) return 0;
    const amount = 1 + Math.floor(random() * 5);
    spawnOreExperience(event.block.dimension, event.block.center(), amount);
    return amount;
}

export function registerOreExperience() {
    // A completed native player break owns this reward. Canceled wrong-tool
    // removals, explosions and commands do not generate this event.
    world.afterEvents.playerBreakBlock.subscribe(event => {
        try { handleOreExperience(event); }
        catch (error) { console.warn(`[Starstone] Ore experience failed: ${error.message}`); }
    }, { blockTypes: [ORE] });
}
