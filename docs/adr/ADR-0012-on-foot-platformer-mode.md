# ADR-0012: "On Foot" — a Side-Scrolling Platformer Mode

* **Status**: Accepted
* **Date**: 2026-09-24
* **Deciders**: Project owner, working session

## Context

Rush (ADR-0011) borrowed ideas from Mario, Contra and Assassin's Creed, but a lane runner can
only carry so much of them. The owner asked for "a pure Mario level" where "the driver gets out".
A platformer is a different game: free horizontal movement, precise jumping over pits, stomping
enemies, blocks bumped from below. It cannot be expressed as lanes.

## Decision

Add **On Foot**, a side-scrolling platformer mode, alongside Rush rather than inside it.

* **Its own pure simulation** (`src/platformer/`): tile-grid collision, Mario-style movement
  (acceleration, variable jump height, coyote time, jump buffering), enemies, blocks, pickups.
  Deterministic and tested like `RushSim`, with no dependency on Three.js or the DOM.
* **Levels are authored as ASCII grids**, one character per tile. They are readable in a diff,
  easy to tune, and a validator test checks every gap is jumpable and every step climbable.
* **Shared presentation.** The hero is the Rush driver model, the worlds use the Rush biome
  palettes and toon/outline materials, and the HUD shares Rush's style, so both modes read as
  one game.
* **Shared input.** Every device maps onto one small platformer intent: move (-1..1), jump
  pressed/held, fire. Gaze and hand position give the move axis, brows or a fist jump, mouth or a
  pinch fires.

## Consequences

* **Positive:** the genre the owner asked for, with real platforming, built on proven parts.
* **Positive:** levels are cheap to author, so the mode can grow a level per world.
* **Negative:** a second simulation to maintain. It is kept small and fully tested to limit that.
* **Negative:** side-view rendering needs its own camera and scenery; the Rush road renderer
  does not carry over.
