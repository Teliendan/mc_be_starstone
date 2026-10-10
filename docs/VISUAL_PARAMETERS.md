# Visual parameter compatibility

2026-10-10, target Bedrock1.26.52. Source/schema correction, not a new
in-game appearance test.

Conduit19, generator2 and ore1 material declarations used legacy boolean
`ambient_occlusion` in block format1.26.50. The shared visual parameter checker
now rejects that combination. All22values were false and are converted to0,
preserving their intended absence of ambient shading. Normal enabled shading
would use1. Face dimming, textures, models and other rendering fields are retained.
Other Starstone blocks still author older formats where their booleans are legal.
No generator writes these three blocks' material declarations.

The [official26.20 release](https://www.minecraft.net/en-us/article/minecraft--bedrock-edition-26-20-changelog)
requires numeric ambient occlusion0..10, default1. The
[material reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_material_instances)
describes its lighting exponent; installed vanilla's unshaded shrub/mushroom
uses0. Compare these blocks' intended unshaded appearance after reload.
