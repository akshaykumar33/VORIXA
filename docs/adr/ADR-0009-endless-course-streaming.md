# ADR-0009: Endless Course Streaming

* **Status**: Superseded by ADR-0014 (the mode it describes was removed on 2026-09-25)
* **Date**: 2026-09-23
* **Deciders**: Engineering Kernel
* **Relates to**: ADR-0005 (procedural world generation), ADR-0004 (action bus)

## Context

VORIXA needs an endless playground alongside the authored time-attack course.

ADR-0005 already accepts "procedural infinite world generation and chunk streaming", but it
specifies **voxel terrain** — 32×64×32 m cubic chunks of multi-octave Simplex noise and cellular
automata, meshed in Web Workers. That decision predates the pivot to a box-course time attack
(`d51d9b3`). The game no longer has terrain; it has a linear course of collision boxes with a
reach budget tuned against `PlayerController`.

Applying ADR-0005 literally would mean building a voxel mesher for a game with no voxels. Its
*principles* still hold — deterministic seeds, bounded memory, recycling — but the unit of
streaming has to be a course segment, not a terrain chunk. This ADR records that adaptation rather
than silently diverging from an accepted decision.

## Decision Drivers

* A procedural course must never generate an unclearable gap. Doing so at random is far worse than
  doing it once by hand: rare, seed-dependent, and near-impossible to reproduce from a report.
* Memory must stay flat however far anyone runs.
* Ghost replays and shared seeds require byte-identical regeneration.
* The authored course must keep working, unchanged.

## Considered Options

1. **Extend ADR-0005's voxel chunks.** Rejected: the game has no terrain to voxelise, and a
   marching-cubes surface cannot express a slide tunnel with a 1.3 m lintel.
2. **Variable-length segments chained end to end.** Rejected — see below.
3. **Fixed-length, independently addressable segments.** Chosen.

## Decision

### Fixed-length segments

Every segment occupies exactly 60 m along Z, so segment N always starts at `-N × 60`.

Variable lengths would make each segment's position depend on the sum of all preceding lengths,
which forces the world to be generated in order, from the beginning, forever. A player respawning
at segment 200 would have to generate 199 segments to find out where 200 starts.

### Positional addressing, not a sequential stream

`Rng.streamFor(seed, index)` hashes the pair into a sub-seed rather than advancing shared state.
Segment 500 is therefore generatable without generating 0–499, and a segment regenerated an hour
later after backtracking is byte-identical.

This is the property the whole design rests on: streaming loads chunks out of order by nature.

### Connectors

Each segment reserves 9 m of solid, full-width ground at both ends; features occupy the middle.
Any two segments therefore join without either knowing what it is adjacent to — no stitching pass,
no adjacency awareness, which is the cost ADR-0005 flags as its main negative.

### Reach budget, with margin

Generated gaps are clamped *inside* the budget in `Course.ts`, not at it: 5.8 m against a 6.7 m
running jump, 9.6 m against an 11.5 m jump-plus-dash. A gap at the exact limit is only clearable
from a perfect run-up, which a procedural course cannot guarantee the player will have.

Difficulty ramps over 12 segments and gates the vocabulary — dash gaps do not appear until the
player has cleared ordinary ones.

### `CourseSource`

`RunState` previously read `CourseData` directly, indexing `checkpoints[i + 1]` by **array
position**. Correct for a fixed course, silently wrong for a sliding window: position 3 means a
different checkpoint after every eviction, so the run would re-arm checkpoints it had passed.

Both shapes now satisfy one interface addressing checkpoints by **absolute index**. A checkpoint's
identity is its number in the course, not where it currently sits in an array. Collision,
respawn and the run timer cannot tell which shape they have.

### Eviction over caching

Segments behind the window are dropped, not cached. Generation is pure and cheap, so retaining
them would trade a guaranteed memory ceiling for an unmeasurable saving. Two segments are kept
*behind* the player so respawn lands on geometry that still exists.

## Consequences

### Positive

* Memory is flat: a 7-segment window at 400 segments travelled, verified by test.
* The world is shareable as text — `?endless=cobalt-drift`.
* Endless is opt-in; the authored course is untouched and remains the default.
* 49 tests cover it, including a simulation of `PlayerController` across generated geometry for
  ten seeds — the same verification the authored course gets.

### Negative

* Generation runs on the main thread, against ADR-0005's Web Worker requirement. At ~60 m per
  segment and a handful of boxes each this is sub-millisecond, but it will need revisiting if
  segment complexity grows.
* Fixed-length segments cap how long a single feature can be. A 90 m wall-run cannot be expressed
  without spanning segments, which the connector rule forbids.
* One checkpoint per segment couples pacing to segment length.

### Revisit if

Segment generation exceeds ~2 ms, or a feature needs to span segments. Both point to moving
generation into a Worker and introducing multi-segment features with explicit adjacency — at which
point ADR-0005's stitching problem returns and this ADR should be superseded rather than patched.
