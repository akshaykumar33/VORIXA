# ADR-0015: "Neon Knuckles" — a Co-op 2D Brawler, Drawn Entirely in Code

* **Status**: Accepted
* **Date**: 2026-10-11
* **Deciders**: Project owner, working session

## Context

The Far Cry direction for VORIXA City was dropped: a photoreal open world assembled from free
assets mixes art styles that never agree, and it could not reach the bar the owner wants. The
owner asked instead for something unique that keeps players engaged: a nostalgic, classic feel,
several levels, fighting, a story, points, stylish and attractive characters, a tough world, and
both solo and team play. Licensed art is not an option, so whatever the style is, the game has to
draw it itself.

## Decision

Build **Neon Knuckles**, a side-scrolling belt brawler in the line of Streets of Rage and Final
Fight, as a new mode at `?mode=brawler`.

* **Art direction: neon silhouettes.** Fighters are dark silhouettes rimmed in their colour's neon
  glow, posed by a procedural skeleton; the city is layered parallax drawn in code (skylines with
  lit windows, neon signs, rain, a wet street that mirrors the lights). No sprite sheets and no
  licences, and one consistent look.
* **Its own pure simulation** (`src/brawler/`): a belt plane (x along the street, z into it, y up),
  fighters with combo chains, heavies, jump attacks and a rage special, hitstun, knockdowns and
  juggles, enemy AI that takes turns attacking and telegraphs its swings, waves that lock the
  screen, a boss, arcade scoring with combo multipliers and a style rank. Deterministic at a fixed
  step, with no DOM or canvas, and tested like the other sims.
* **Co-op from day one.** Two players on one keyboard; player two joins at any time. Friendly
  fire is off.
* **Canvas 2D rendering** (`src/rendering/brawler/`): the style needs glow, blur and paths, which
  Canvas 2D does well; static layers are drawn once to offscreen canvases.
* **Content is mature in tone, not explicit:** crime, rivalry and revenge, with confident, stylish
  fighters.

## Consequences

* **Positive:** a distinctive look that is fully owned, consistent and cheap to extend.
* **Positive:** the genre is naturally replayable: scores, ranks, harder modes and co-op.
* **Negative:** silhouettes carry less detail than painted sprites; character comes from pose,
  colour, outline shape and animation instead.
* **Negative:** a fourth simulation to maintain, kept small and tested to limit that.

## Plan

1. One level, two heroes, three enemy types and a boss, with scoring and co-op (this change).
2. Story panels between stages, more stages, more fighters, weapons and breakables.
3. Online co-op and leaderboards, under their own ADR.
