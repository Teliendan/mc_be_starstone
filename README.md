# Starstone for Minecraft Bedrock

A glowing power network that works beside redstone: cables for floors, walls and ceilings, generators, lamps, and adapters to and from redstone. A network is simply on or off, and power never fades with distance, so a long line needs no repeaters.

> **Status: Test version.** Things may still change before the public release, so back up any world you care about. Download: [Releases page](https://github.com/Teliendan/mc_be_starstone/releases).

**Project page:** [teliendan.com](https://teliendan.com/mods/starstone/?utm_source=github&utm_medium=referral&utm_campaign=profile&utm_content=readme) · **Wiki:** [blocks, recipes and how the network works](https://teliendan.com/wiki/starstone/?utm_source=github&utm_medium=referral&utm_campaign=profile&utm_content=readme)

## Features

- **On or off:** when any generator or powered input in a network is on, every cable and device connected to it gets power. A change spreads through the whole network within moments; very large networks can take a little longer.
- **Cables:** cables, bridges, lamps and redstone adapters attach to floors, walls and ceilings, and cables join up on their own as you place them. A line can wrap around the outer edge of a block, for example from its top down onto its side.
- **Inner Corner:** craft it from two cables and place it where a floor meets a wall, or where two walls meet. It joins the cable lines on both faces into one network.
- **Conduit:** a solid block that carries power straight through, so you can pass power through a wall or floor. It points the way you place it, and its sides do not connect.
- **Bridge:** two cable lines cross in the same spot without connecting. Each line keeps its own power.
- **Generator and Lamp:** the generator powers its network as soon as you place it; use it to switch it off and on. The lamp gives full-brightness light while its network is powered.
- **Redstone adapters:** the Redstone Input turns any redstone signal into Starstone power, so levers, buttons, observers and circuits can switch a network. The Redstone Output turns the network back into a full-strength redstone signal for pistons, doors, lamps and other redstone devices.
- **Starstone Ore:** lies underground in the Overworld at Y 15 and below and glows faintly. Mine it with an iron, diamond or netherite pickaxe for 2-4 Starstone Dust and some experience; Fortune gives more dust and Silk Touch keeps the ore block.
- **Crafting:** cables need only copper and Starstone Dust. Four dust and a copper ingot make Compressed Starstone Dust, which a furnace smelts into a Starstone Crystal for the generator, lamp and redstone adapters. Recipes unlock when you first pick up the material they use.
- **Languages:** English, Czech, German, French, Polish, Spanish (Spain and Mexico) and Portuguese (Portugal and Brazil). The translations are AI drafts; corrections are welcome.

## Install

1. Download the `.mcaddon` from the [Releases page](https://github.com/Teliendan/mc_be_starstone/releases).
2. Open the file with Minecraft; it imports both packs.
3. In the world settings, turn on the Starstone **behavior pack** (its resource pack comes with it).

Starstone Ore generates only in newly generated chunks: start a new world, or explore areas you have not visited yet.

Requirements: Minecraft Bedrock 1.26.60 or newer. No experimental toggles are needed. It works on its own and needs none of my other add-ons.

## Known issues

- Very large networks may take a moment to update and can swallow very short redstone pulses.
- There is no in-game manual. Look blocks and recipes up in the [wiki](https://teliendan.com/wiki/starstone/?utm_source=github&utm_medium=referral&utm_campaign=profile&utm_content=readme).

## Feedback

Found a bug or have an idea? Tell me through the [report form](https://teliendan.com/contact/?project=starstone&utm_source=github&utm_medium=referral&utm_campaign=profile&utm_content=readme#report).

## Credits

Made by [Teliendan](https://teliendan.com/?utm_source=github&utm_medium=referral&utm_campaign=profile&utm_content=readme).

- Code written with AI coding agents, directed and tested by Teliendan.
- Every texture, icon and block model is drawn by scripts written for this mod.
- Block sounds are Minecraft's own.

## Disclaimer

Unofficial add-on for Minecraft. Not affiliated with or endorsed by Mojang Studios or Microsoft. "Minecraft" is a trademark of Mojang Studios / Microsoft.

## Licence

See [LICENSE.md](LICENSE.md).

## For developers

Pack layout, generators, tests, diagnostics, open in-game checks and design notes: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## What's new

See [CHANGELOG.md](CHANGELOG.md) and the [Releases page](https://github.com/Teliendan/mc_be_starstone/releases).
