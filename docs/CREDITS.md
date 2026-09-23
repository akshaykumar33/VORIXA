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

---

## Adding an asset

Every third-party asset needs an entry here **before** it ships, recording the author, the licence,
and where it came from. If the licence cannot be identified, the asset does not go in.
