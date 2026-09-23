# ADR-0011: Pivot to Rush, a Cartoon Lane Runner with Shooting

* **Status**: Accepted
* **Date**: 2026-09-23
* **Deciders**: Project owner, working session

## Context

The parkour time-attack has deep, well-tested systems (free 3D movement, streaming, rivals,
gaze and hand control), but it has repeatedly failed the bar the owner cares about most: that it
*looks and feels* fun. Play-testing feedback was consistent: the world reads as "geometric lines",
the characters are stand-ins, and the game "seems naive".

The root cause is structural, not a missing polish pass. Free-roaming parkour needs a rigged,
animated humanoid and hand-built level geometry to look good. Neither can be produced in code,
and the art packs that would supply them have not arrived.

The owner asked for "something like Temple Run, vehicle crash racing + shooting", controlled with
gestures, keyboard, mouse and eyes, in an animated cartoon world.

## Decision

Build **Rush** as the default game:

* **Temple Run structure.** An endless road in three lanes, getting steadily faster. You steer
  between lanes, jump, and survive. Three hearts per run.
* **The runner is a vehicle.** A chunky cartoon car needs no skeleton or animation clips. Its
  life comes from procedural motion (squash and stretch, body roll, spinning wheels), which code
  does well. This removes the asset dependency that stalled the parkour game.
* **Crash racing.** Slow traffic to dodge, crates to smash through for points.
* **Shooting.** Drones pace you and fire back. The player aims with a crosshair.
* **Every input device maps to the same small intent.** Lanes are *absolute* for eyes and hands
  ("look at the lane you want") and *relative* for keys. Fire, jump and nitro are edges or holds.
* **Cartoon art direction built in code:** toon ramp and inverted-hull ink outlines (already in
  the codebase), a curved-world vertex bend so the road rolls over the horizon, and saturated,
  rounded shapes.

The simulation (`src/rush/`) is pure and deterministic from a seed, like the parkour physics.
Three.js stays confined to rendering (ADR-0007, ADR-0010).

The parkour game is kept, not deleted, and remains reachable at `?mode=parkour`.

## Consequences

* **Positive:** every visible element can be authored to a consistent standard with no outside
  assets. The genre reads instantly and teaches itself.
* **Positive:** input, audio, particles and the toon pipeline are reused unchanged.
* **Negative:** lane-based movement is shallower than free parkour; depth has to come from
  pattern design, shooting and speed instead.
* **Negative:** two games in one repository. If Rush holds up, the parkour code should be
  retired in a later ADR rather than maintained indefinitely.
