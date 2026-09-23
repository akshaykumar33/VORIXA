# The Award Plan

**Goal:** a browser game that stands next to the Awwwards winners — Messenger (Abeto), Bruno
Simon's 2025 portfolio — on craft, not on feature count.

**Written:** 2026-09-23 · **Owner:** the working session · **Status:** Phase 1 in progress

---

## What the winners actually do

Researched before writing this, so the plan targets the real reasons they win.

| Winner | What makes it | What we take |
|---|---|---|
| Messenger (Abeto) | Cel shading, ink outlines, warm palette on mostly simple shapes. "Quality comes from art direction, not polygon count." Tiny, complete world. | The art direction (landed in `f05210f`). A *small complete* world beats a large empty one. |
| Bruno Simon 2025 | Everything reacts. Physics toys, particles, sound on every contact. Blender-built world. | **Game feel.** Every action gets a visible, audible response. |
| Both | A single idea, executed completely. A first ten seconds that teaches without text. | Focus, onboarding, and finish. |

The honest diagnosis of VORIXA today: the systems are deep (gaze control, streaming, rivals,
tested physics) but the **felt** layer is thin. Running, jumping and landing produce almost no
visible reaction, the world has no identity, and the characters are stand-ins. Winners invert
that ratio.

---

## The concept, sharpened

**A sky-city parkour run above a sea of clouds.** Look where you want to go; your eyes steer.

Why this concept: the course is already a ribbon suspended in air — that was a weakness when it
floated over a void, and becomes the identity when it floats over clouds. It also explains the
fall (you drop into the clouds), gives the horizon something beautiful to hold, and fits the
bright cel-shaded palette.

---

## Phases

Each phase ends playable, committed, and checked in a browser — never a pile of half-layers.

### Phase 1 — Game feel ("juice") · *no assets needed* · **in progress**

The single highest-impact phase. A player judges a game in the first few seconds of movement.

1. **Particle system** — pooled, instanced, one draw call. Landing dust, jump puffs, boost
   trails, dash streaks, checkpoint bursts.
2. **Squash and stretch** on the runner — stretch on take-off, squash on landing, scaled by
   impact. The oldest animation principle and the cheapest way to make motion feel alive.
3. **Camera feedback** — impact shake on hard landings and hazards, a short punch on boost,
   all scaled and respecting `prefers-reduced-motion`.
4. **Hit-stop** — a few frames of freeze on hazard hits and checkpoint banks, so moments land.

*Done means:* every player action has a visible and an audible response, measured at 60 fps.

### Phase 2 — World identity · *no assets needed*

1. **Cloud sea** replacing the flat green field: layered, lit, softly moving cloud planes.
2. **Floating islands** carrying the roadside props and spectators, so nothing stands on air.
3. **Distant sky city** silhouettes and a sun disc — a horizon worth looking at.
4. Outlines extended to buildings and props so the whole world shares one drawing style.

*Done means:* a screenshot with the UI hidden reads as a specific place.

### Phase 3 — Characters and cohesive art · *needs the Quaternius packs in `assets-src/`*

1. Proper runner with real run / jump / slide / idle clips.
2. Track rebuilt from modular sci-fi pieces instead of boxes.
3. An animated crowd and matching props; the mismatched Khronos test models retired.

*Done means:* no stand-in or placeholder asset visible anywhere.

### Phase 4 — The first thirty seconds

1. Title screen that is the game, not a menu over it — camera orbit, one clear call to action.
2. A first segment that teaches run, jump, slide and dash by level design, not by text.
3. A results screen: time, best, ghost delta, and a shareable seed link.

*Done means:* someone who has never seen it finishes a run without reading instructions.

### Phase 5 — Sound as a first-class layer

1. A procedural music loop that follows speed and intensity.
2. Contact sounds for every surface kind, spatialised.
3. Mix pass: nothing clips, everything is audible at the default volume.

### Phase 6 — Ship quality

1. Loading screen with real progress; nothing pops in after start.
2. Performance budget: 60 fps on a mid-range laptop, mobile fallback path.
3. Lighthouse and accessibility pass; keyboard-only run possible.
4. A credits page, OG image, and a short capture video — what an awards submission needs.

---

## Rules for executing this plan

- **One phase at a time**, in order. Phase 3 is the only one blocked on outside input.
- **Look at it in a browser** before calling any step done. Several past bugs — the clipped sky,
  the scrim behind the canvas, floating props — were invisible to tests and obvious on screen.
- **Tests for decisions, eyes for looks.** Pure logic gets unit tests; visuals get screenshots.
- **Record every third-party asset** in `docs/CREDITS.md` before it ships.
- **Update this file** as phases complete, so the next session starts oriented.
