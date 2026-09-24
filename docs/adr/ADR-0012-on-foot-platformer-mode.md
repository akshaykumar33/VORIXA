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
* **Shared presentation.** The hero is the Rush driver, the worlds use the Rush biome
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

## Implementation notes (2026-09-24)

* **Entry.** On Foot runs as its own page, `?mode=onfoot`, reached from the Rush title menu
  (the "On Foot" button or `O`); "Back to the car" (or `Esc` on its title and results) returns.
  A page switch keeps the two games' renderers, loops and input from sharing state; it costs a
  second or two of loading.
* **Presentation follows ADR-0013**, which superseded the toon materials above: the hero is the
  red car's driver as a Kenney Mini Characters person (the same model Rush seats in the car),
  lit by the Sunny Meadow HDR sky, with Rush's post chain, star coins, drones and turrets, and
  meadow props behind the strip. The curved-world bend is switched off for the side view.
* **Gesture jumps are full height.** A brow raise or fist is an edge, not a held button, so
  `PlatformControls` holds the jump for longer than the whole ascent; a test checks gesture and
  held-key jumps reach the same peak.
* **Every attempt plays a fresh copy of the level** (`loadLevel`), because the simulation
  writes bumped blocks back into its level.
