# Credits

Third-party assets shipped with VORIXA, and the terms they are used under.

Every asset listed here is CC0 or under a font licence; the credit is given anyway, and it records
where each came from. Nothing ships without an entry here.

---

## Fonts

| Font | Author | Licence |
|---|---|---|
| Space Grotesk Variable (body text) | Florian Karsten | SIL Open Font License 1.1 |
| Barlow Condensed (HUD display) | Jeremy Tribby | SIL Open Font License 1.1 |

Self-hosted through Fontsource, not a font CDN: see `src/main.ts` and `src/ui/RushTheme.ts`.

---

## Libraries

| Library | Used for | Licence |
|---|---|---|
| three.js | Rendering (ADR-0010) | MIT |
| postprocessing (Raoul van Rüschen) | Post-processing pipeline (ADR-0013) | zlib |
| n8ao (N8python) | Ambient occlusion (ADR-0013) | CC0 1.0 |
| sharp | Build-time image resizing (asset scripts only, not shipped) | Apache 2.0 |

---

## VORIXA City (ADR-0014)

All by **Quaternius** ([quaternius.com](https://quaternius.com)),
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode), each pack's licence file
checked. Fetched from itch.io by `scripts/assets/fetch-itch.mjs` (every pack's minimum price is
$0), and the animal pack from the Google Drive folder linked on quaternius.com, into
`assets-src/` (not committed), then built into `public/city/` by
`scripts/assets/build-city.mjs`: pieces merged, textures resized to 1024 px WebP, meshes
meshopt-compressed. Content is otherwise unmodified.

| Pack | Built into | Used for |
|---|---|---|
| Downtown City MegaKit (Standard) | `district/` | Streets, intersections, sidewalks, buildings, props, PBR textures |
| Universal Animation Library 1 and 2 (Standard) | `people/mh-anims.glb` | Every clip the realistic cast plays, retargeted onto their skeleton (below) |
| Universal Base Characters | not shipped | Fetched and evaluated; the free bodies have no modern clothing |
| Realistic Car Pack (Nov 2018) | `cars.glb` | Seven drivable cars incl. police and taxi (OBJ converted with obj2gltf) |
| Stylized Nature MegaKit (Standard, the free edition) | `wilds/nature.gltf` | The wild country's trees, pines, dead and twisted trees, rocks, bushes, grass, flowers and ferns, with their textures |
| Ultimate Animated Animal Pack (from quaternius.com, Google Drive; licence file checked) | `wilds/{wolf,deer,stag,fox}.glb` | The wild animals and their clips |
| Ultimate Gun Pack | `guns.glb` | Pistol, SMG, assault rifle, shotgun, sniper rifle (OBJ converted with obj2gltf, Cesium, Apache-2.0, build only) |

Build-only tools (not shipped): glTF-Transform (MIT, Don McCurdy) and meshoptimizer (MIT,
Arseny Kapoulkine). The meshopt decoder that ships is the copy inside three.js (MIT).

### The realistic cast

`public/city/people/mh-*.glb`: the crew, the Choir, Cantor, the police and twelve citizens. Each is
a [MakeHuman](http://www.makehumancommunity.org) person, made in Blender with the MPFB 2 add-on
(GPL, build only, not shipped) by `scripts/assets/blender/make-cast.py`, then compressed by
`scripts/assets/build-city.mjs`. The clips are Quaternius' Universal Animation Library (above),
retargeted by the same script.

Every asset below is [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode), and
each was checked in its own files, not only by the pack it came in: the community packs also hold
AGPL and CC-BY items, which are left out. Clothing with the MakeHuman logo printed on it is left
out too.

| Assets | Author | Source |
|---|---|---|
| Base body, skeleton ("game_engine"), body shapes, skins, eyes, eyebrows, eyelashes; hair `afro01`, `bob01`, `bob02`, `braid01`, `long01`, `ponytail01`, `short01`–`04`; clothes `male_casualsuit01/03/05/06`, `male_elegantsuit01`, `male_worksuit01`, `female_elegantsuit01`, `female_sportsuit01`, `fedora01`, `fedora_cocked`, `shoes01`–`06` | Data Collection AB, Joel Palmius, Jonas Hauquier (released as CC0, September 2020) | MakeHuman system assets and asset packs |
| `elvs_crude_t-shirt_male` | MakeHuman, edited by Elvaerwyn | MakeHuman community asset pack |
| `namuhekam_male_polo_shirt` | Namuhekam | MakeHuman community asset pack |
| `toigo_*`: ankle boots, ballet flats (plain, bows, flowers), flats, cloth shoes, stiletto booties, camisole dress, tiered dress, halter dress, shift dress, fisherman sweater, keyhole tank top, harem pants, wool pants; hair: blunt bob, curled-under bob, inverted bob with bangs | MRT | MakeHuman community asset pack |

Build steps, for the record: bodies at no subdivision, game-engine materials, textures resized to
1024 px WebP (512 px for the two outfits that would otherwise pass the repo's 2 MB file cap),
meshes meshopt-compressed.

### VORIXA City sounds

Recorded, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode), from OpenGameArt.
Cut into single shots, mixed to mono 48 kHz and normalised by `scripts/assets/build-sounds.mjs`
into `public/city/sounds/`; the sources stay in `assets-src/sounds/` (not committed).

| Source | Author | Used for |
|---|---|---|
| [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) | The Free Firearm Sound Library team (uploaded by bart) | Gunshots: Walther PPQ (pistol), 1911 (police), Carl Gustav M45 (SMG), AR-15 (rifle), Mossberg (shotgun), Tikka (sniper) |
| [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds) | springyspringo | Pistol, rifle and shotgun reloads |

Everything else in the city (engine, tyres, siren, impacts, footsteps, cues) is synthesised in
`src/audio/CityAudio.ts`.

## The sky

The city is lit by an HDR sky photograph from [Poly Haven](https://polyhaven.com),
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode): a 1k HDR for lighting and
reflections (`public/sky/beach.hdr`) and a 2048-wide JPEG backdrop from Poly Haven's tone-mapped
image (`public/sky/beach.jpg`). Fetched and prepared by `scripts/assets/fetch-skies.mjs`.

| Poly Haven asset | Authors |
|---|---|
| Qwantani Noon (Pure Sky) | Greg Zaal, Jarod Guest |

---

## Adding an asset

Every third-party asset needs an entry here **before** it ships, recording the author, the licence,
and where it came from. If the licence cannot be identified, the asset does not go in.
