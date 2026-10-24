# ADR-0016: "Akhada" — a 3D One-on-One Fighter in an Indian Arena

* **Status**: Accepted
* **Date**: 2026-10-24
* **Deciders**: Project owner, working session

## Context

The owner wants a fighting game in the line of Street Fighter, made "whole 3D AAA type" with
real animation, smoke and weather, set in India. Neon Knuckles (ADR-0015) is a 2D belt brawler;
this is a different genre: two fighters, one on one, rounds, health bars, special moves typed as
motion inputs.

The project already owns most of what a 3D fighter needs: a realistic MakeHuman cast with the
Universal Animation Library retargeted onto it (ADR-0014), the three.js render and post chain,
and Poly Haven's CC0 skies, textures and models.

## Decision

Build **Akhada** (the traditional Indian wrestling ground) as a new mode at `?mode=akhada`.

* **2.5D like Street Fighter IV onward:** fighters are 3D, the fight runs on one line (x along the
  stage, y up), the camera watches from the side and follows the pair.
* **Its own pure simulation** (`src/fighter/`): frame data per move (startup, active, recovery,
  damage, hitstun, blockstun, pushback), blocking by holding back (low and high), crouching,
  jumping, knockdowns, projectiles, a super meter, motion inputs (quarter-circle forward and
  back) read from an input history, rounds on a 99-second timer, best of three, and a CPU opponent.
  Deterministic at a fixed step, tested like the other sims.
* **Animation:** the cast's CC0 clips (stance, jab, cross, hook, block, hits, knockback, getting up,
  the energy-blast cast, jumps, KO). There are no CC0 kick clips, so kicks are posed in code: the
  leg bones are driven over a base clip.
* **The arena:** the ghats of Varanasi at the Ganga: sandstone steps, temples, diyas, brass and clay
  pots, marigold garlands, flags and the river, from Poly Haven assets and procedural geometry.
* **Weather by round:** golden dusk, a monsoon storm with rain and lightning, and night lit by the
  diyas, with mist, incense smoke and dust in each.
* **Local versus and versus CPU** at launch; online play would need its own ADR.

## Consequences

* **Positive:** a real 3D fighter built mostly from parts the project already has and owns.
* **Positive:** every asset is CC0 and credited; nothing needs a paid licence.
* **Negative:** the clip library has no kicks, throws or crouching attacks, so those are posed in
  code and will look less polished than motion capture until better CC0 clips are found.
* **Negative:** the cast's outfits are western; a cast dressed for the setting would need new
  CC0 clothing or commissioned models.
