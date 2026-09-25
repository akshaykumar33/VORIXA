# Controls

Every input VORIXA accepts, what it does, and where it is implemented.

Three schemes work simultaneously. Keyboard and mouse are always live. Hand tracking (`G`) and
gaze tracking (`E`) are opt-in, share one camera, and compose — **when gaze is on, your hands
change job.**

---

## Keyboard & mouse — always available

| Input | Action |
|---|---|
| `W` `A` `S` `D` / arrows | Move |
| Mouse | Look |
| `Space` | Jump · wall-jump |
| `Shift` | Dash |
| `Ctrl` / `C` | Slide · crouch |
| `R` | Restart run |
| `G` | Toggle hand control |
| `E` | Toggle gaze control |
| `Esc` / `P` | Pause |

Vision control never replaces these. They remain first-class, which is a standing accessibility
constraint, not a phase.

---

## Hand control — `G`

**What the camera sees:** one hand, 21 landmarks, ~30 Hz. Measurements are normalised against
palm length, so leaning toward or away from the camera does not retune the controls.

### Mode A — hands steer (gaze OFF)

The original mapping. This is also the fallback whenever gaze is off, unsupported, or refused.

| Movement | Action | Detail |
|---|---|---|
| Move hand left/right | Look left/right | 900 px-equivalents per second at full deflection |
| Move hand up/down | Look up/down | 520 px/s — slower, vertical travel is shorter |
| **Open palm** | Move forward | Proportional: half-open is half speed. Fires above 0.28 |
| **Pinch** (thumb to index) | Dash | Edge-triggered once per pinch |
| **Fist** | Jump | Edge-triggered once per close |

### Mode B — hands fly (gaze ON)

Gaze has taken over aiming, so the hands get the controls that actually suit them.

| Movement | Action | Detail |
|---|---|---|
| Move hand left/right | **Bank** the camera | Up to 0.30 rad roll. Layers on top of wall-run lean |
| **Open palm** | **Brake** | Analog. Full brake stops from top speed in ~0.6 s and overrides forward input |
| **Pinch** | Dash | Unchanged |
| **Fist** | Jump | Unchanged |
| *(none)* | Forward motion | Continuous — you are always flying |

**Why the switch:** both hand steering and gaze want to write the look axes. Two devices writing
one axis in a frame is last-writer-wins, which surfaces as the camera fighting itself. Exactly one
device owns any axis per frame.

### Tuning constants

`src/input/GestureMapping.ts` — `PINCH_ENGAGE` 0.38 / `PINCH_RELEASE` 0.55 · `CURL_ENGAGE` 1.35 /
`CURL_RELEASE` 1.62 · `STEER_DEADZONE` 0.07
`src/input/GestureBridge.ts` — `YAW_RATE` 900 · `PITCH_RATE` 520 · `THRUST_THRESHOLD` 0.28

---

## Gaze control — `E`

**What the camera sees:** one face, 478 landmarks **including 10 iris points**, plus blendshape
expression scores. The 468-point model will not work — it has no iris landmarks at all, and
`GazeMapper` rejects it rather than steering on invented data.

| Movement | Action | Detail |
|---|---|---|
| **Look left/right** | Steer left/right | 620 px/s at full deflection |
| **Look up/down** | Steer up/down | 360 px/s |
| **Turn your head** | Extends steering reach | Blended at 32% against 68% eye |
| **Hard blink**, both eyes, held ≥220 ms | **Time dilation** | World drops to 0.4× for 1.6 s |
| Natural blink (100–150 ms) | *Nothing* | Deliberately below threshold |
| Wink (one eye) | *Nothing* | Both eyes required |

### Why eyes and head are summed

Iris position alone **saturates** — an eye can only travel so far before the head follows — so you
could never reach the edge of a wide view without straining. Head pose alone is unbounded but
loses the flick of attention that makes gaze feel telepathic. Summing them reproduces how people
actually look at things: eyes lead, head extends.

### Why 220 ms

An involuntary blink runs 100–150 ms. Firing under that would trigger the ability constantly while
you simply keep your eyes wet. The trigger fires on **crossing** the hold, not on release, so the
effect lands while your eyes are still shut — that is what makes it feel like a button.

### Time dilation is not free

The simulation slows; **the run clock does not.** Slow motion is a precision aid that costs you
real seconds. If the clock slowed with the world, holding a blink would be strictly optimal and
the mechanic would collapse into an exploit. Re-triggering is refused while a window is active, so
it stays a decision about when to spend it.

### Tuning constants

`src/input/GazeMapping.ts` — `EYE_WEIGHT` 0.68 / `HEAD_WEIGHT` 0.32 · `DELIBERATE_HOLD_SECONDS`
0.22 · `BLINK_ENGAGE` 0.62 / `BLINK_RELEASE` 0.38 · `GAZE_DEADZONE` 0.08
`src/input/GazeBridge.ts` — `GAZE_YAW_RATE` 620 · `GAZE_PITCH_RATE` 360
`src/game/Game.ts` — `DILATION_SCALE` 0.4 · `DILATION_DURATION` 1.6

---

## Failure behaviour

Every vision failure is designed, not incidental.

| Situation | Behaviour |
|---|---|
| Hand leaves frame | Controls zero. Never a stuck full-throttle |
| Face leaves frame | Steering zeros — you coast straight, not into a wall at the last angle |
| Eyes shut | Last heading held. Iris points behind closed lids are guesses |
| Camera denied | Mode stays off, reason shown in the HUD. Keyboard unaffected |
| Model missing | Error surfaced on toggle. Game still fully playable |
| Dropped inference frame | Skipped. Smoothing still advances on the real clock |
| Both trackers on | One shared camera stream, one decode |

---

## Architecture

```
HandTracker ─┐                          ┌─ GestureMapping (pure)
             ├─ sharedCamera (refcount) ┤
FaceTracker ─┘                          └─ GazeMapping (pure)
                                              │
                        GestureBridge / GazeBridge
                                              │
                                     InputEngine (action bus)
                                              │
                              PlayerController · CameraRig · Game
```

Trackers do I/O. `*Mapping` modules are pure and unit-tested without a webcam. Bridges translate
intent into normalized actions. **Nothing downstream knows a camera exists** — see ADR-0004 and
ADR-0008.

## Coverage

- `tests/GazeMapping.test.ts` — 21 tests: gaze direction, head blending, blink discrimination,
  face-loss safety, unmirrored-camera sign conventions
- `tests/GestureMapping.test.ts` — 20 tests: pinch, curl, steering, hand-loss safety
- `tests/FlightControls.test.ts` — 8 tests: brake is analog and effective, bank rolls and layers

**Not covered:** gaze and hands have never been verified with a live camera. The numbers above are
population averages and educated guesses. See `docs/STATE_OF_PLAY.md`.
