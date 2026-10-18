# Material texture credits

All four images below are stored locally and included in the offline build. Their original resolution is 512 × 512; the stored files have not been enlarged, cropped, or recompressed. Filenames were changed for clarity. The current scene uses the two color maps: the oak photograph is cropped and blended into a larger low-contrast board atlas at runtime; the warm wood photograph is blended and tinted on furniture. Normal and roughness originals are retained as source assets, but are not currently assigned to materials.

## Neutral wood grain PBR set

Files:

- `assets/materials/wood-grain-albedo.jpg`
- `assets/materials/wood-grain-normal.jpg`
- `assets/materials/wood-grain-roughness.jpg`

**© 2021 Wayfair. Models and textures by Eric Chadwick.** Licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Source: [Khronos glTF Sample Assets — Chair Damask Purplegold](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/ChairDamaskPurplegold). The model's [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/ChairDamaskPurplegold/README.md#legal) explicitly credits and licenses the models and textures.

Original paths in that revision:

- `Models/ChairDamaskPurplegold/glTF/chair_wood_albedo.jpg`
- `Models/ChairDamaskPurplegold/glTF/chair_wood_normal.jpg`
- `Models/ChairDamaskPurplegold/glTF/chair_wood_roughness0.jpg`

The albedo is neutral and can be tinted. Normal and roughness maps are non-color data; load them without an sRGB transfer function. The roughness texture is sampled by Three.js from its green channel.

## Warm wood color map

File: `assets/materials/walnut-albedo.png`

**Babylon.js Assets contributors**, licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), as declared by the repository's [README](https://github.com/BabylonJS/Assets/blob/c81f5d744fe8d41acfebd89eaeb7008c6f9659e3/README.md) and [LICENSE](https://github.com/BabylonJS/Assets/blob/c81f5d744fe8d41acfebd89eaeb7008c6f9659e3/LICENSE). No asset-specific replacement license is present in the texture directory.

Original: [`textures/woodAlbedo.png`](https://github.com/BabylonJS/Assets/blob/c81f5d744fe8d41acfebd89eaeb7008c6f9659e3/textures/woodAlbedo.png). “Walnut” in the local filename describes its warm appearance, not a botanical identification made by the source.

## Integrity

SHA-256 of the downloaded, unmodified images:

| File | SHA-256 |
| --- | --- |
| `wood-grain-albedo.jpg` | `6f985ac8ec698cab1ae7aeeb87d139b604d6169a516ca46593481ea25d0dcc10` |
| `wood-grain-normal.jpg` | `78c7f4fa334223d0aa6dacb8d5044d9f63d84eb3d2e95881e578d53d4c3413ed` |
| `wood-grain-roughness.jpg` | `048ac9e59d05b196bee1bdadfdf6a77589ee327fb3070bb4d773a760a60d3d49` |
| `walnut-albedo.png` | `a8fea301ceb44f62a294b17e6f9c6616810e152f362561a48c2ce29d27aa66b9` |

Combined size: 939,376 bytes (about 917 KiB).
