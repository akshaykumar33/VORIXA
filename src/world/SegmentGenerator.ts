import type { Box, Checkpoint, SurfaceKind } from '../game/Course';
import { streamFor, type Rng } from './Rng';

/**
 * Procedural course segments.
 *
 * The hand-authored course in `Course.ts` is built against a reach budget derived from
 * `PlayerController`, and `tests/Course.test.ts` simulates every gap to prove it is passable. An
 * earlier hand-built layout had a dash gap with no landing platform in range — invisible in the
 * code, unclearable by any amount of skill. A generator that ignores that budget would reproduce
 * that bug endlessly and at random, which is far worse than doing it once by hand.
 *
 * So every gap here is clamped well inside the budget, and the generated course is simulated in
 * `tests/SegmentGenerator.test.ts` the same way the authored one is.
 *
 * ## Fixed-length segments
 *
 * Every segment occupies exactly `SEGMENT_LENGTH` along Z, so segment N always starts at
 * `-N * SEGMENT_LENGTH`. That is what makes the world addressable: the streamer can build segment
 * 500 on its own, and a player who backtracks gets byte-identical geometry rather than a
 * regenerated variant.
 *
 * A variable-length scheme would force segment starts to depend on every preceding segment's
 * length, which means generating the world in order, from the beginning, forever.
 *
 * ## Connectors
 *
 * Each segment reserves solid ground at both ends. Features live in the middle. Two arbitrary
 * segments therefore always join, without either needing to know what it is adjacent to.
 */

export const SEGMENT_LENGTH = 60;
/** Solid ground reserved at each end so any two segments connect. */
const CONNECTOR = 9;

/**
 * Reach budget, mirrored from `Course.ts`. Generated gaps stay under these, not at them — a gap
 * exactly at the limit is only clearable from a perfect run-up, which a procedural course cannot
 * guarantee the player will have.
 */
const MAX_JUMP_GAP = 5.8;
const MAX_DASH_GAP = 9.6;

const HALF_WIDTH_MIN = 3.6;
const HALF_WIDTH_MAX = 7;

function slab(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  kind: SurfaceKind = 'platform'
): Box {
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minY: Math.min(y0, y1),
    maxY: Math.max(y0, y1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
    kind
  };
}

/** Waist-high rails. They read as a lane without ever being the thing you collide with. */
function rails(halfWidth: number, z0: number, z1: number): Box[] {
  return [
    slab(-halfWidth - 0.4, -halfWidth, 0, 0.9, z0, z1),
    slab(halfWidth, halfWidth + 0.4, 0, 0.9, z0, z1)
  ];
}

export interface Segment {
  readonly index: number;
  readonly boxes: readonly Box[];
  /** One checkpoint per segment, placed on the entry connector. */
  readonly checkpoint: Checkpoint;
  /** Inclusive Z bounds. `maxZ` is the entry edge, `minZ` the exit — the course runs toward -Z. */
  readonly minZ: number;
  readonly maxZ: number;
}

/** Feature vocabulary. Each is verified passable within the reach budget. */
type Feature = 'straight' | 'jump_gap' | 'dash_gap' | 'slide' | 'jump_pad' | 'hazard_run';

/**
 * Difficulty ramp, 0 to 1.
 *
 * Reaches full difficulty around segment 12 — roughly two minutes in. Ramping faster makes the
 * opening feel like a test rather than an invitation; ramping slower leaves good players idle
 * long enough to quit before the course has shown them anything.
 */
export function difficultyAt(index: number): number {
  return Math.min(index / 12, 1);
}

/** Feature choices available at a given difficulty. Early segments cannot produce dash gaps. */
function vocabularyFor(difficulty: number): Feature[] {
  const features: Feature[] = ['straight', 'jump_gap'];
  if (difficulty > 0.15) features.push('slide');
  if (difficulty > 0.3) features.push('jump_pad');
  if (difficulty > 0.45) features.push('hazard_run');
  if (difficulty > 0.6) features.push('dash_gap');
  return features;
}

/**
 * Builds one segment.
 *
 * Pure in `(seed, index)`: no shared state, no dependence on generation order, no clock. This is
 * what lets the streamer build and discard segments freely.
 */
export function generateSegment(seed: number, index: number): Segment {
  const rng = streamFor(seed, index);
  const maxZ = -index * SEGMENT_LENGTH;
  const minZ = maxZ - SEGMENT_LENGTH;

  const difficulty = difficultyAt(index);
  const halfWidth = rng.range(
    HALF_WIDTH_MAX - (HALF_WIDTH_MAX - HALF_WIDTH_MIN) * difficulty,
    HALF_WIDTH_MAX
  );

  const boxes: Box[] = [];

  // Entry connector. Always solid, always full width, so the join is never the difficulty.
  const entryEnd = maxZ - CONNECTOR;
  boxes.push(slab(-halfWidth, halfWidth, -1, 0, entryEnd, maxZ));
  boxes.push(...rails(halfWidth, entryEnd, maxZ));

  // Exit connector.
  const exitStart = minZ + CONNECTOR;
  boxes.push(slab(-halfWidth, halfWidth, -1, 0, minZ, exitStart));
  boxes.push(...rails(halfWidth, minZ, exitStart));

  // Segment 0 is always a plain straight: the opening seconds are where a player discovers that
  // holding forward builds speed, and nothing should punish them for finding out.
  const feature: Feature = index === 0 ? 'straight' : rng.pick(vocabularyFor(difficulty));
  boxes.push(...buildFeature(feature, rng, halfWidth, entryEnd, exitStart, difficulty));

  return {
    index,
    boxes,
    checkpoint: {
      index,
      spawnX: 0,
      spawnY: 0,
      spawnZ: maxZ - 2,
      triggerZ: maxZ - 3,
      halfWidth,
      label: `CP ${index}`
    },
    minZ,
    maxZ
  };
}

function buildFeature(
  feature: Feature,
  rng: Rng,
  halfWidth: number,
  entryEnd: number,
  exitStart: number,
  difficulty: number
): Box[] {
  const boxes: Box[] = [];
  // Feature space runs from entryEnd down to exitStart, both negative, entryEnd the larger.
  const span = entryEnd - exitStart;

  switch (feature) {
    case 'straight': {
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, exitStart, entryEnd));
      boxes.push(...rails(halfWidth, exitStart, entryEnd));
      // A boost pad on an otherwise empty straight is the reward for a clean entry.
      if (rng.chance(0.5)) {
        const z = rng.range(exitStart + 8, entryEnd - 8);
        boxes.push(slab(-2.5, 2.5, 0, 0.05, z - 4, z, 'boost'));
      }
      break;
    }

    case 'jump_gap': {
      // One gap, comfortably inside a running jump, with solid ground either side of it.
      const gap = rng.range(3.2, MAX_JUMP_GAP);
      const gapStart = rng.range(exitStart + 10, entryEnd - 10 - gap);
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, gapStart + gap, entryEnd));
      boxes.push(...rails(halfWidth, gapStart + gap, entryEnd));
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, exitStart, gapStart));
      boxes.push(...rails(halfWidth, exitStart, gapStart));
      break;
    }

    case 'dash_gap': {
      // Too far to jump, inside jump-plus-dash. Flanked by wall-run walls so there are two
      // solutions — giving one obstacle two answers is what makes a route worth optimising.
      const gap = rng.range(6.5, MAX_DASH_GAP);
      const gapStart = rng.range(exitStart + 12, entryEnd - 12 - gap);
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, gapStart + gap, entryEnd));
      boxes.push(...rails(halfWidth, gapStart + gap, entryEnd));
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, exitStart, gapStart));
      boxes.push(...rails(halfWidth, exitStart, gapStart));

      const wallX = Math.min(halfWidth - 0.4, 4.6);
      boxes.push(slab(wallX - 1, wallX, 0, 9, gapStart, gapStart + gap, 'wall'));
      boxes.push(slab(-wallX, -wallX + 1, 0, 9, gapStart, gapStart + gap, 'wall'));
      break;
    }

    case 'slide': {
      // Ceiling at 1.3 m: standing height is 1.8, slide height 1.0. Exactly one way through.
      // The lintel is kept thin and the posts stop at the same height, so it reads as a portal to
      // duck through rather than a wall to stop at.
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, exitStart, entryEnd));
      boxes.push(...rails(halfWidth, exitStart, entryEnd));

      const length = rng.range(8, 13);
      const z1 = rng.range(exitStart + 10, entryEnd - 10 - length);
      const z0 = z1 + length;
      boxes.push(slab(-halfWidth, halfWidth, 1.3, 2.1, z1, z0, 'ceiling'));
      boxes.push(slab(-halfWidth, -halfWidth + 0.6, 0, 2.1, z1, z0));
      boxes.push(slab(halfWidth - 0.6, halfWidth, 0, 2.1, z1, z0));
      break;
    }

    case 'jump_pad': {
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, exitStart, entryEnd));
      boxes.push(...rails(halfWidth, exitStart, entryEnd));
      const z = rng.range(exitStart + 10, entryEnd - 12);
      const x = rng.range(-halfWidth + 2.5, halfWidth - 2.5);
      boxes.push(slab(x - 1.1, x + 1.1, 0, 0.05, z - 4, z, 'jump_pad'));
      break;
    }

    case 'hazard_run': {
      boxes.push(slab(-halfWidth, halfWidth, -1, 0, exitStart, entryEnd));
      boxes.push(...rails(halfWidth, exitStart, entryEnd));

      // Pylons alternate sides, so the line through them is a weave rather than a straight run.
      // Never more than one per Z band, and never spanning the full width — a hazard the player
      // cannot route around is a wall, and walls belong in the vocabulary as walls.
      const count = 1 + Math.floor(difficulty * 2.99);
      const usable = span - 20;
      for (let i = 0; i < count; i++) {
        const z = entryEnd - 10 - (usable / (count + 1)) * (i + 1);
        const side = i % 2 === 0 ? 1 : -1;
        const x = side * rng.range(1.4, Math.max(1.6, halfWidth - 1.8));
        boxes.push(slab(x - 0.8, x + 0.8, 0, 1.8, z - 1, z + 1, 'hazard'));
      }
      break;
    }
  }

  return boxes;
}
