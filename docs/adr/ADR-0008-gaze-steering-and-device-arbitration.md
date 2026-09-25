# ADR-0008: Gaze Steering, Shared Camera, and Device Arbitration

* **Status**: Superseded by ADR-0014 (the mode it describes was removed on 2026-09-25)
* **Date**: 2026-09-22
* **Deciders**: Engineering Kernel

## Context

VORIXA's defining idea is that the player's body is the controller. Hand tracking (ADR-0004,
`HandTracker`/`GestureMapping`) established the pattern; gaze completes it. The target experience
is **eyes steer, hands fly**: the player looks where they want to go while their hands handle
banking, braking, and boost, with a deliberate hard blink as a discrete ability.

Research into the 2026 award landscape reinforced the direction — immersive 3D took 61% of
Awwwards Site of the Day in Q1 2026, up from 23% in 2024 — and reinforced the discipline: the
sites that win commit depth to *one* interaction rather than stacking effects. Gaze steering is
that one interaction, so it has to be excellent rather than merely present.

Two hard constraints shaped the design:

1. **One camera, two consumers.** `HandTracker` called `getUserMedia` directly and owned its own
   `<video>`. A face tracker doing the same means two decoded streams of an identical picture, and
   on a meaningful share of hardware the second request fails outright because the device is held
   exclusively. Hands and eyes are designed to run *together*, so this was blocking, not cosmetic.
2. **Two devices, one look axis.** Both hand steering and gaze want to write `LOOK_X`/`LOOK_Y`.
   Unmanaged, that is last-writer-wins within a frame, which surfaces as the camera fighting
   itself — a bug that is miserable to diagnose from a player's description.

## Decision Drivers

* Gaze must feel intentional, not twitchy — eyes move in saccades, and translating those literally
  into camera motion is nauseating.
* A deliberate blink must be distinguishable from the involuntary blinks a player cannot suppress.
* Losing the face mid-run must fail safe.
* No regression to keyboard/mouse or hands-only play, which remain fully supported.
* The existing effects/decisions split must hold, so gaze logic stays testable without a webcam.

## Considered Options

1. **Head pose only.** Cheap and robust, no iris landmarks needed. Rejected: it ignores the flick
   of attention that makes gaze control feel telepathic, and forces players to move their whole
   head to aim.
2. **Iris position only.** Precise and how players expect to aim, but it saturates — an eye can
   only travel so far before the head follows — so the player cannot reach the edges of a wide
   view without straining.
3. **Weighted sum of iris offset and head pose.** Chosen.

## Decision

### Gaze estimation

Combine both signals, `EYE_WEIGHT 0.68` / `HEAD_WEIGHT 0.32`. This reproduces how people actually
look at things: eyes lead, head follows and extends reach past the iris ceiling. Both terms are
normalised against facial spans (interocular width, face height) so leaning toward or away from
the camera does not silently retune the controls — the same discipline `GestureMapping` applies
with palm length.

Requires the **478-landmark iris-refined model**. The 468-point variant has no iris points at all;
`GazeMapper` rejects a short landmark set rather than steering on invented data.

Gaze rates are deliberately below the hand mapping (620/360 px-equivalents per second against
900/520) so a saccade reads as a lean rather than a snap.

### Deliberate blink

Blink closure comes from the model's blendshape head (`eyeBlinkLeft`/`eyeBlinkRight`), which was
trained on closure directly and stays honest through squints and glasses where an eyelid-distance
ratio degrades. Eyelid geometry remains as a fallback when blendshapes are unavailable.

Both eyes must stay shut for **220 ms** to count. An involuntary blink runs roughly 100–150 ms;
firing under that would make the ability constant noise while the player simply keeps their eyes
wet. The trigger fires on crossing the hold threshold, not on release, so the effect lands while
the eyes are still shut — which is what makes it feel like a button.

### Shared camera

Introduce `CameraSource`: a reference-counted stream and `<video>`, exposed as the `sharedCamera`
module singleton. Trackers `acquire()`/`release()`; hardware opens on first acquire and closes on
last release. `HandTracker` was refactored onto it with no change to its public API. Permission
verdicts are cached so a player who declined is not re-prompted on every toggle.

A module singleton rather than an injected dependency: the browser exposes exactly one camera
permission per origin, so modelling several independent instances would describe something the
platform does not offer. Tests construct `CameraSource` directly.

### Device arbitration

`applyGestureIntent` takes a `HandRole`:

* **`'steer'`** — hands own the camera. The original mapping, and the fallback whenever gaze is
  off, unsupported, or refused: hand position aims, open palm is the throttle.
* **`'flight'`** — gaze owns the camera. Forward motion becomes continuous, lateral hand position
  banks (`ROLL`), open palm becomes an analog air brake (`BRAKE`), pinch still boosts.

`Game.frame()` resolves the role once per frame from whether gaze is actually running. Exactly one
device writes any given axis per frame.

## Consequences

### Positive

* Hands and eyes run simultaneously on one camera, one decode.
* Gaze logic is pure and covered by 21 tests with no webcam, including the sign conventions of an
  unmirrored front-facing camera — the error most likely to survive to a player steering backwards.
* Failure is safe at every layer: no face zeroes steering rather than freezing it; shut eyelids
  hold the last heading rather than steering on guessed iris points; a dropped inference frame is
  skipped, not fatal.
* Keyboard, mouse, and hands-only play are unchanged.
* Adding a third vision consumer costs one `acquire()`.

### Negative

* A second ~3.7 MB model to stage. Mitigated by on-demand import and the existing
  `predev`/`prebuild` hooks; players who never press `E` never download it.
* Two models inferring per camera frame raises GPU cost on low-end hardware. Not yet profiled
  under combined load — see Follow-ups.
* `HandRole` means hand gestures mean different things in different modes, which is a learnability
  cost the HUD has to carry.

### Follow-ups

* Profile combined hand + face inference on integrated graphics; consider staggering the two
  detectors across alternate camera frames if the budget is exceeded.
* Per-player gaze calibration. The current ranges are population averages; a short look-at-the-
  corners routine would tighten the mapping considerably.
* True wrist tilt for `ROLL`. Lateral hand position is used today because it reuses the existing
  smoothed, dead-zoned signal; a wrist-angle term would be more faithful to the intent.
* Accessibility: gaze steering must never become the only path to any action. Keyboard and mouse
  remain first-class, and that is a standing constraint, not a phase.
