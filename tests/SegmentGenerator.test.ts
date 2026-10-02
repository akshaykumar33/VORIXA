import { describe, it, expect } from 'vitest';
import {
  generateSegment,
  difficultyAt,
  SEGMENT_LENGTH
} from '../src/world/SegmentGenerator';
import { PlayerController, type MoveIntent } from '../src/game/PlayerController';
import type { Box } from '../src/game/Course';

/**
 * A procedural course can generate an impossible level at random, which is strictly worse than
 * building one impossible level by hand: it is rare, seed-dependent, and therefore almost
 * impossible to reproduce from a bug report.
 *
 * `tests/Course.test.ts` simulates every gap in the authored course to prove it is clearable.
 * These do the same across many seeds — the generator is only as trustworthy as the number of
 * worlds actually walked.
 */

const TICK = 1 / 120;

function intent(overrides: Partial<MoveIntent> = {}): MoveIntent {
  return {
    forward: 1,
    strafe: 0,
    yaw: 0,
    jumpPressed: false,
    dashPressed: false,
    crouchHeld: false,
    ...overrides
  };
}

/** Widest gap along the centre line of a segment, which is the line a player actually runs. */
function widestCentreGap(boxes: readonly Box[], fromZ: number, toZ: number): number {
  const floors = boxes
    .filter((b) => b.kind === 'platform' && b.minX <= 0 && b.maxX >= 0 && b.maxY <= 0.2)
    .map((b) => ({ minZ: b.minZ, maxZ: b.maxZ }))
    .sort((a, b) => b.maxZ - a.maxZ);

  let widest = 0;
  let edge = fromZ;
  for (const floor of floors) {
    if (floor.maxZ < toZ) break;
    const gap = edge - floor.maxZ;
    if (gap > widest) widest = gap;
    edge = Math.min(edge, floor.minZ);
  }
  return widest;
}

describe('addressability', () => {
  it('places segment N at a position derivable from N alone', () => {
    for (const index of [0, 1, 7, 250]) {
      const segment = generateSegment(1234, index);
      expect(segment.maxZ).toBe(-index * SEGMENT_LENGTH);
      expect(segment.minZ).toBe(-(index + 1) * SEGMENT_LENGTH);
    }
  });

  it('generates a distant segment without generating its predecessors', () => {
    const direct = generateSegment(77, 300);
    for (let i = 0; i < 40; i++) generateSegment(77, i);
    const again = generateSegment(77, 300);
    expect(JSON.stringify(again.boxes)).toBe(JSON.stringify(direct.boxes));
  });

  it('produces different worlds for different seeds', () => {
    const a = generateSegment(1, 5);
    const b = generateSegment(2, 5);
    expect(JSON.stringify(a.boxes)).not.toBe(JSON.stringify(b.boxes));
  });
});

describe('connection', () => {
  it('leaves solid ground at both ends of every segment', () => {
    for (let seed = 0; seed < 8; seed++) {
      for (let index = 0; index < 20; index++) {
        const segment = generateSegment(seed, index);
        const onCentre = segment.boxes.filter(
          (b) => b.kind === 'platform' && b.minX <= 0 && b.maxX >= 0
        );
        // A floor touching the entry edge, and one touching the exit edge.
        expect(onCentre.some((b) => b.maxZ >= segment.maxZ - 0.001)).toBe(true);
        expect(onCentre.some((b) => b.minZ <= segment.minZ + 0.001)).toBe(true);
      }
    }
  });

  it('joins consecutive segments without a seam gap', () => {
    for (let index = 0; index < 25; index++) {
      const a = generateSegment(99, index);
      const b = generateSegment(99, index + 1);
      // A's exit edge and B's entry edge are the same plane; both must carry floor.
      expect(a.minZ).toBe(b.maxZ);
    }
  });
});

describe('reach budget', () => {
  it('never generates a gap beyond jump-plus-dash reach', () => {
    // 11.5 m is the absolute ceiling from a perfect run-up. Anything wider is unclearable by
    // any player, at any skill level, forever.
    for (let seed = 0; seed < 25; seed++) {
      for (let index = 0; index < 30; index++) {
        const segment = generateSegment(seed, index);
        const gap = widestCentreGap(segment.boxes, segment.maxZ, segment.minZ);
        expect(gap).toBeLessThan(11.5);
      }
    }
  });

  it('keeps early segments inside a plain running jump', () => {
    // Before dash gaps unlock, nothing may require a dash.
    for (let seed = 0; seed < 25; seed++) {
      for (let index = 0; index < 8; index++) {
        const segment = generateSegment(seed, index);
        const gap = widestCentreGap(segment.boxes, segment.maxZ, segment.minZ);
        expect(gap).toBeLessThan(6.7);
      }
    }
  });

  it('opens segment 0 with a plain straight', () => {
    for (let seed = 0; seed < 12; seed++) {
      const segment = generateSegment(seed, 0);
      expect(widestCentreGap(segment.boxes, segment.maxZ, segment.minZ)).toBe(0);
    }
  });
});

describe('playability', () => {
  it('lets a player run the first segments without falling', () => {
    /*
     * The real check: simulate the controller across generated geometry and confirm it survives.
     *
     * The autopilot jumps when it approaches the far edge of the floor it is standing on, rather
     * than on a fixed cadence. A blind cadence fails on perfectly clearable gaps simply by being
     * airborne at the wrong moment, which makes the test report generator bugs that are not there
     * — it did exactly that on the first run of this suite.
     *
     * This version still cannot rescue an unreachable gap: it jumps from the lip at full speed,
     * which is the best any player could do.
     */
    const SEGMENTS = 4;
    for (let seed = 0; seed < 10; seed++) {
      const boxes: Box[] = [];
      for (let i = 0; i < SEGMENTS; i++) boxes.push(...generateSegment(seed, i).boxes);

      // The generated world is finite here. Running off its far edge is the test's own boundary,
      // not a hole in the course, so the simulation has to stop before it.
      const worldEnd = -SEGMENTS * SEGMENT_LENGTH + 4;

      const floors = boxes
        .filter((b) => b.kind === 'platform' && b.minX <= 0 && b.maxX >= 0 && b.maxY <= 0.2)
        .sort((a, b) => b.maxZ - a.maxZ);

      // Low ceilings the autopilot has to slide under. Standing height is 1.8 m; these sit at
      // 1.3 m, so an autopilot that never crouches simply stops dead against them — which is the
      // tunnel working correctly, not the course being impassable.
      const tunnels = boxes.filter((b) => b.kind === 'ceiling' && b.minY < 1.8);

      const player = new PlayerController();
      player.reset(0, 0.2, -4);

      let fell = false;
      let reachedEnd = false;
      for (let tick = 0; tick < 3200; tick++) {
        const b = player.body;
        if (b.z <= worldEnd) {
          reachedEnd = true;
          break;
        }
        // The floor under the player, if any. Course runs toward -Z, so its far edge is minZ.
        const floor = floors.find((f) => b.z <= f.maxZ && b.z >= f.minZ);
        const nearEdge = floor !== undefined && b.z - floor.minZ < 1.3;
        // Start the slide before the lintel and hold it until clear of the far side.
        const inTunnel = tunnels.some((t) => b.z <= t.maxZ + 4 && b.z >= t.minZ - 1);
        player.update(
          intent({ jumpPressed: nearEdge && !inTunnel, crouchHeld: inTunnel }),
          boxes,
          TICK
        );
        if (player.body.y < -8) {
          fell = true;
          break;
        }
      }
      expect(fell, `seed ${seed} dropped the player into the void`).toBe(false);
      // Asserted too: a run that merely stalled somewhere would otherwise pass as "did not fall".
      expect(reachedEnd, `seed ${seed} never reached the end of the generated course`).toBe(true);
    }
  });

  it('keeps hazards off the centre line so there is always a route', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (let index = 0; index < 25; index++) {
        for (const box of generateSegment(seed, index).boxes) {
          if (box.kind !== 'hazard') continue;
          // A hazard spanning the centre with no way past is a wall wearing a hazard's colour.
          const spansCentre = box.minX <= 0 && box.maxX >= 0;
          expect(spansCentre).toBe(false);
        }
      }
    }
  });
});

describe('difficulty', () => {
  it('ramps from zero and saturates', () => {
    expect(difficultyAt(0)).toBe(0);
    expect(difficultyAt(6)).toBeCloseTo(0.5, 5);
    expect(difficultyAt(12)).toBe(1);
    expect(difficultyAt(400)).toBe(1);
  });

  it('withholds dash gaps until the player has had practice', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (let index = 0; index < 7; index++) {
        const hasWalls = generateSegment(seed, index).boxes.some((b) => b.kind === 'wall');
        expect(hasWalls).toBe(false);
      }
    }
  });

  it('eventually produces the full vocabulary', () => {
    const kinds = new Set<string>();
    for (let index = 0; index < 60; index++) {
      for (const box of generateSegment(5, index).boxes) kinds.add(box.kind);
    }
    // A generator that only ever emits straights is technically passing every safety test above.
    expect(kinds).toContain('boost');
    expect(kinds).toContain('ceiling');
    expect(kinds).toContain('jump_pad');
    expect(kinds).toContain('hazard');
    expect(kinds).toContain('wall');
  });
});

describe('checkpoints', () => {
  it('gives every segment one checkpoint on its entry connector', () => {
    for (let index = 0; index < 20; index++) {
      const segment = generateSegment(3, index);
      expect(segment.checkpoint.index).toBe(index);
      expect(segment.checkpoint.triggerZ).toBeLessThan(segment.maxZ);
      expect(segment.checkpoint.triggerZ).toBeGreaterThan(segment.minZ);
      // Respawn must land on solid connector ground, not in the feature.
      expect(segment.checkpoint.spawnZ).toBeGreaterThan(segment.maxZ - 9);
    }
  });
});
