# State of Play

**Updated:** 2026-09-22 · **Branch:** `feat/render-first-person-3d-slice`

Session-level handoff. The roadmap in `docs/roadmap/` covers phases; this covers *right now* —
what is done, what is unverified, and what the next person (or agent) should pick up first.

Update this at the end of a working session. Read it at the start of one.

---

## Where things stand

The game is a playable first-person time attack. Three control schemes work: keyboard/mouse,
hand tracking (`G`), and gaze tracking (`E`). Gaze and hands compose — eyes steer while hands
bank, brake and boost.

Recent commits on this branch:

| Commit | What |
|---|---|
| `3393dc1` | Speed-reactive audio, grounded-surface detection |
| `4abb750` | Gaze steering, shared camera, device arbitration |
| `245497f` | Design system, sky atmosphere, canvas sizing fix |

---

## Verified

- `pnpm verify` green: secrets, strict typecheck, **93 tests**
- Production build succeeds; preview serves it; **zero console messages** on load
- Canvas drawing buffer matches its CSS box exactly (measured in-page, not eyeballed)
- Vision asset script stages both models idempotently (hand 7.5 MB, face 3.6 MB)
- Commit hooks enforce scope and subject length — they caught two mistakes this session

## NOT verified — read before building on these

- **Gaze control has never been used with a live face.** All 21 tests are synthetic landmarks.
  The sign conventions for an unmirrored camera are pinned in tests, but nothing has confirmed
  that steering *feels* right or that 220 ms is a comfortable blink hold.
- **No performance profiling under combined load.** Hand and face models inferring on the same
  camera frames has not been measured on integrated graphics. If the budget blows, stagger the
  two detectors across alternate frames.
- **Bundle is 601 kB** (153 kB gzipped), over Vite's 500 kB warning. Mostly three.js. The vision
  runtime already code-splits correctly into its own 154 kB chunk.
- **Motion-dependent visuals have only been seen at a standstill.** Dust speed-streaking and gate
  proximity brightening both need the player actually moving. Synthetic keyboard events do not
  drive the game — pointer lock requires a trusted user gesture — so these were verified as
  "compiles, renders, costs nothing" and not as "looks right at 200 km/h". Someone needs to play
  it. Frame budget measured at standstill: 60 fps, 16.6 ms average, 18.1 ms p95.

---

## Next up

### 1. Tune gaze against a real face — blocks everything else in vision

Run `pnpm dev`, press `E`. Check in this order:

1. **Direction** — look right, does the view go right? The likeliest surviving bug.
2. **Rate** — `GAZE_YAW_RATE` / `GAZE_PITCH_RATE` in `src/input/GazeBridge.ts` (620/360) are
   guesses. Too slow feels sluggish, too fast is nauseating.
3. **Blink** — `DELIBERATE_HOLD_SECONDS` in `GazeMapping.ts` (0.22).
4. **Both modes** — `G` then `E`; hands should stop steering and start banking.

### 2. Visual overhaul — the current priority

The owner's standard is award-winning. Three steps done, the rest outstanding.

**Done:**

- **Atmosphere** (`245497f`) — sky dome with gradient and horizon glow, ground plane, analytic
  distance-faded grid.
- **Surface materials** (`568a824`) — procedural panel lines, fresnel rim, travelling energy
  pulses, injected into `MeshStandardMaterial` via `onBeforeCompile`.
- **Animated scene elements** — checkpoint gates are shader-driven energy curtains that brighten
  on approach and calm when passed; the dust field wraps around the player in the vertex shader
  and streaks with speed.

**Remaining, in impact order:**

- **Geometry detail.** Everything is still a box. Bevels, greebling, or instanced structural
  detail around the track would now do more than any further shader work — this is the single
  biggest remaining gap.
- **Real 3D assets.** Nothing is modelled. A craft mesh and track props, DRACO-compressed and
  KTX2-textured per `skills/creative-webgl-shaders`.
- **WebGPU path.** ADR-0002 commits to WebGPU primary with WebGL2 fallback; the renderer is
  still WebGL-only. `three/webgpu` plus TSL is the 2026 pattern.
- **Dynamic resolution scaling**, per the same skill, once there is enough load to need it.

### 3. Then

Voice/sound reactivity, Rust/WASM procedural generation, Go + Postgres backend for leaderboards
and ghost storage. All agreed in scope, none started.

---

## Open decisions

- **Palette is a deliberate identity change** — lime signal on cold neutrals, replacing cyan.
  It is entirely tokens (`:root` in `index.html`, colour constants in `GameRenderer.ts`), so
  reverting is a handful of values if the owner dislikes it.
- **`ROLL` uses lateral hand position, not true wrist tilt.** Reused the existing smoothed,
  dead-zoned signal rather than adding an untested one. A wrist-angle term would be more faithful.
- **Per-player gaze calibration is unbuilt.** Current ranges are population averages; a
  look-at-the-corners routine would tighten the mapping considerably.

## Uncommitted, deliberately

`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.agents/`, and five `skills/` folders are the owner's own
edits and were left alone. `.claude/skills` is a junction to `skills/` so project skills actually
load — Claude Code does not read a root-level `skills/` directory, which meant all 20 were inert.

## Conventions worth knowing

- Commit scopes are enforced: `repo|engine|render|ecs|input|audio|world|ui|ux|adr|vision|ci|test|deps|security`. Subject ≤72 chars.
- Engine core (`src/core`, `ecs`, `rendering`, `input`, `audio`) imports no UI framework (ADR-0007).
- Effects and decisions are split: trackers do I/O, `*Mapping` modules are pure and tested.
- Nothing reaches `main` except through a PR.
