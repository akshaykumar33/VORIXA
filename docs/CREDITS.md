# Credits

Third-party assets shipped with VORIXA, and the terms they are used under.

Several of these are **CC-BY**, which requires attribution as a condition of the licence. This
file is that attribution. It is not optional paperwork — remove an entry and shipping the asset
becomes a licence breach.

---

## 3D models

### Fox
`public/characters/Fox.glb` — animated spectator (Survey / Walk / Run cycles).

| Part | Author | Licence |
|---|---|---|
| Model | PixelMannen | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |
| Rigging & animation | tomkranis | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| glTF conversion | @AsoboStudio and @scurest | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |

From the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets).

### Cesium Man
`public/characters/CesiumMan.glb` — animated spectator (walk cycle).

© 2017 Cesium — [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode).

From the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets).

The Cesium logo is a trademark and is **not** covered by the CC-BY grant. If the model is ever
re-textured or shown in a way that features the mark, check
[the Cesium trademark terms](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/LICENSES/LicenseRef-LegalMark-Cesium.txt)
first.

### Rigged Figure
`public/characters/RiggedFigure.glb` — animated spectator.

© 2017 Cesium — [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode).

### Roadside props

All from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets),
re-encoded for the web with `@gltf-transform/cli optimize --texture-size 512 --texture-compress
webp --compress draco` (58 MB of source down to 3.8 MB). Re-encoding is a modification, which
CC-BY permits provided the change is indicated — this paragraph is that indication.

| File | Role | Author | Licence |
|---|---|---|---|
| `Lantern.glb` | Light towers | Microsoft (sbtron); Draco by Frank Galligan | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |
| `PotOfCoals.glb` | Braziers | Darmstadt Graphics Group GmbH (Eric Chadwick) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `CarConcept.glb` | Parked cars | Darmstadt Graphics Group GmbH (Eric Chadwick) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `CesiumMilkTruck.glb` | Parked truck | Cesium | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `SheenChair.glb` | Spectator seating | Wayfair, LLC (Eric Chadwick) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |
| `AntiqueCamera.glb` | Press cameras | UX3D (Maximillan Kamps) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |
| `ToyCar.glb` | Oversized toy car | Guido Odendahl; scene by Eric Chadwick | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |

**Trademarks.** `PotOfCoals` and `CarConcept` carry the Khronos and 3D Commerce logos,
`AntiqueCamera` the UX3D logo, and `CesiumMilkTruck` the Cesium logo. Logos are not covered by the
CC grants; they are included unmodified as shipped by Khronos, and must not be used to imply
endorsement.

### Rejected

`DragonAttenuation` was downloaded and removed before shipping. Its listing includes a CC0 credit,
but only for a cloth backdrop — the dragon itself is under the Stanford Graphics Library terms,
which restrict use. It matched a naive "is it CC?" filter, which is why that filter is not the
check: every part of an asset has to be covered, not just one line of its credits.

---

## Character sprites

`public/mascots/*.webp` — the co-pilot and the rival pilot portraits.

From [page-mascot](https://koboyo.com/page-mascot) by nilbuild. Each character is two 3×3 sheets:
nine head directions and nine expressions.

Characters in use: `scout` (co-pilot), plus `drone`, `gearbot`, `clockwork`, `postbot`, `rocket`,
`knight`, `tiger`, `raccoon`, `owl`, `penguin`, `fox`, `astronaut` as rival pilots.

---

## Fonts

| Font | Author | Licence |
|---|---|---|
| Space Grotesk Variable | Florian Karsten | SIL Open Font License 1.1 |
| JetBrains Mono Variable | JetBrains | SIL Open Font License 1.1 |
| Lilita One (comic strips) | Juan Montoreano | SIL Open Font License 1.1 |
| Barlow Condensed (Rush HUD display) | Jeremy Tribby | SIL Open Font License 1.1 |

Self-hosted through `@fontsource-variable`, not a font CDN — see `src/main.ts`.

---

## Machine-learning models

| Model | Source | Licence |
|---|---|---|
| `hand_landmarker.task` | Google MediaPipe | Apache 2.0 |
| `face_landmarker.task` | Google MediaPipe | Apache 2.0 |

Staged into `public/models/` by `scripts/fetch-vision-assets.mjs` rather than committed — they are
binaries, and a repository is the wrong place for 11 MB of weights.

---

## Libraries

| Library | Used for | Licence |
|---|---|---|
| three.js | Rendering (ADR-0010) | MIT |
| @mediapipe/tasks-vision | Hand and gaze tracking (ADR-0008) | Apache 2.0 |
| postprocessing (Raoul van Rüschen) | Post-processing pipeline (ADR-0013) | zlib |
| n8ao (N8python) | Ambient occlusion (ADR-0013) | CC0 1.0 |
| sharp | Build-time image resizing (asset scripts only, not shipped) | Apache 2.0 |

---

## VORIXA City (ADR-0014)

All by **Quaternius** ([quaternius.com](https://quaternius.com)),
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode), each pack's licence file
checked. Fetched from itch.io by `scripts/assets/fetch-itch.mjs` (every pack's minimum price is
$0), and the clothed characters from the Google Drive folders linked on quaternius.com, into
`assets-src/` (not committed), then built into `public/city/` by
`scripts/assets/build-city.mjs`: pieces merged, textures resized to 1024 px WebP, meshes
meshopt-compressed. Content is otherwise unmodified.

| Pack | Built into | Used for |
|---|---|---|
| Downtown City MegaKit (Standard) | `district/` | Streets, intersections, sidewalks, buildings, props, PBR textures |
| Ultimate Modular Characters (men) | `people/m-*.glb` | The hero (Casual Hoodie), police (Swat), pedestrians |
| Ultimate Modular Women | `people/f-*.glb` | Pedestrians, soldiers |
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

The Akhada asuras (`mh-asura-*.glb`, ADR-0017) are built the same way from the same CC0 assets:
bare-chested bodies, `toigo_harem_pants`, `toigo_keyhole_tank_top` and `toigo_halter_dress_midi`,
hair `long01` and `braid01`. Horns, crowns, jewellery and the gada are modelled in code.

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

## Animated people (Rush and On Foot)

[Mini Characters 1.0](https://kenney.nl/assets/mini-characters) by **Kenney** (www.kenney.nl),
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). The twelve
`character-*.glb` files and the shared `Textures/colormap.png` are served from `public/chars`
unmodified, with the pack's licence file alongside them (`LICENSE-kenney.txt`). They are the
roadside spectators, the driver in each car, and the hero of On Foot.

---

## Skies (Rush and On Foot)

HDR sky photographs from [Poly Haven](https://polyhaven.com), all
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Each world ships a 1k HDR
for lighting and reflections and a 2048-wide JPEG backdrop made from Poly Haven's tone-mapped
image. Fetched and prepared by `scripts/assets/fetch-skies.mjs`.

| World | Poly Haven asset | Authors |
|---|---|---|
| Sunny Meadow | Kloofendal 48d Partly Cloudy (Pure Sky) | Greg Zaal, Jarod Guest |
| Cactus Canyon | Qwantani Sunset (Pure Sky) | Greg Zaal, Jarod Guest |
| Frosty Peaks | Kloofendal Misty Morning (Pure Sky) | Greg Zaal |
| Sugar Rush | Belfast Sunset (Pure Sky) | Greg Zaal, Dimitrios Savva, Jarod Guest |
| Neon Nights | Qwantani Night (Pure Sky) | Greg Zaal, Jarod Guest |
| Coconut Coast | Qwantani Noon (Pure Sky) | Greg Zaal, Jarod Guest |

---

## Neon Knuckles (ADR-0015)

Key art, the Stage 1 backdrop and the six character portraits in `public/assets/brawler/` were
made for this project at the owner's direction (generated images; delivery notes and requests in
`AI_ASSET_COORDINATION.md`). They are the project's own, with no third-party licence. The game
loads the `.webp` copies, resized and compressed from the delivered `.jpg` files.

---

## Akhada (ADR-0016)

From [Poly Haven](https://polyhaven.com), all [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
Fetched and prepared by `scripts/assets/fetch-akhada.mjs` into `public/akhada/`: 1k HDRs and 2048-wide
tone-mapped backdrops for the skies, 1k PBR maps as WebP, and models with 512 px WebP textures.

| Asset | Kind | Authors |
|---|---|---|
| Qwantani Dusk 2 (Pure Sky) | Sky (dusk round) | Greg Zaal, Jarod Guest |
| Kloofendal Overcast (Pure Sky) | Sky (monsoon round) | Greg Zaal |
| Large Sandstone Blocks | Ghat steps | Rob Tuytel |
| Mossy Sandstone | Wet lower steps | Dimitrios Savva |
| Red Sandstone Wall | Temples | Amal Kumar |
| Patterned Clay Plaster | Houses | Amal Kumar |
| Brass Diya Lantern | Lamps on the steps | Bhargav Kubal |
| Brass Pot 01, Brass Pot 02 | Props | Rico Cilliers |
| Ceramic Pot | Props | Aron Łyczek |
| Mud Cracked Dry 03 | Kurukshetra's field | Dario Barresi, Dimitrios Savva |
| Aerial Beach 01 | Rameswaram's shore, Jaisalmer's dunes | Rob Tuytel |
| White Sandstone Bricks | Rameswaram's gopurams | Rob Tuytel |
| Sandstone Blocks 08 | Jaisalmer's fort | Rob Tuytel |
| Rock Wall 08 | Rameswaram's granite pillars | Amal Kumar |
| Red Laterite Soil Stones | Kerala's riverbank | Amal Kumar |

The night round reuses Qwantani Night (above, under Skies).

---

## Adding an asset

Every third-party asset needs an entry here **before** it ships, recording the author, the licence,
and where it came from. If the licence cannot be identified, the asset does not go in.
