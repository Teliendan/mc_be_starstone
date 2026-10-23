import { world } from '@minecraft/server';
import { canCollect } from './harvestGate.js';

const ORE = 'starstone:ore';

export function spawnOreExperience(dimension, location, amount) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 5) throw new RangeError('Ore XP must be 1–5');
    // These structures contain native valued xp_orb actors and no blocks.
    // Explicitly exclude both block layers, preserving replacement blocks/water.
    world.structureManager.place(`starstone:ore_xp_${amount}`, dimension, {
        x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z)
    }, { includeBlocks: false, includeEntities: true });
}

export function handleOreExperience(event, random = Math.random) {
    if (event.brokenBlockPermutation?.type.id !== ORE) return 0;
    const mode = event.player.getGameMode();
    if (mode !== 'Survival' && mode !== 'Adventure') return 0;
    const tool = event.itemStackBeforeBreak;
    if (!canCollect(ORE, tool) || world.gameRules.doTileDrops === false) return 0;
    if (tool.getComponent('minecraft:enchantable')?.hasEnchantment('silk_touch')) return 0;
    const amount = 1 + Math.floor(random() * 5);
    spawnOreExperience(event.block.dimension, event.block.location, amount);
    return amount;
}

export function registerOreExperience() {
    // A completed native player break owns this reward. Canceled wrong-tool
    // removals, explosions and commands do not generate this event.
    world.afterEvents.playerBreakBlock.subscribe(event => {
        try { handleOreExperience(event); }
        catch (error) { console.warn(`[Starstone] Ore experience failed: ${error.message}`); }
    });
}
