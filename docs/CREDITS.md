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
$0) into `assets-src/` (not committed), then built into `public/city/` by
`scripts/assets/build-city.mjs`: pieces merged, textures resized to 1024 px WebP, meshes
meshopt-compressed. Content is otherwise unmodified.

| Pack | Built into | Used for |
|---|---|---|
| Downtown City MegaKit (Standard) | `district/` | Streets, intersections, sidewalks, buildings, props, PBR textures |
| Ultimate Modular Characters (men) | `people/m-*.glb` | The hero (Casual Hoodie), police (Swat), pedestrians |
| Ultimate Modular Women | `people/f-*.glb` | Pedestrians, soldiers |
| Universal Base Characters, Universal Animation Library | not shipped | Fetched and evaluated; the free bodies have no modern clothing |
| Realistic Car Pack (Nov 2018) | not yet | Cars (phase 3) |
| Ultimate Gun Pack | not yet | Guns (phase 2) |

Build-only tools (not shipped): glTF-Transform (MIT, Don McCurdy) and meshoptimizer (MIT,
Arseny Kapoulkine). The meshopt decoder that ships is the copy inside three.js (MIT).

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

## Adding an asset

Every third-party asset needs an entry here **before** it ships, recording the author, the licence,
and where it came from. If the licence cannot be identified, the asset does not go in.
