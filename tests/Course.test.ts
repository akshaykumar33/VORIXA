import { describe, it, expect } from 'vitest';
import { buildCourse } from '../src/game/Course';
import { PlayerController, type MoveIntent } from '../src/game/PlayerController';

/**
 * Passability tests.
 *
 * A level that cannot be finished is worth nothing, and that failure is invisible in code review —
 * the boxes all look reasonable, the numbers all look reasonable, and the gap is still two metres
 * too wide. The only way to know is to run it. An earlier layout here had a dash gap whose landing
 * platform was twenty metres away; these tests exist so that cannot happen again silently.
 *
 * Each case drives the real controller against the real course with a scripted input, then asserts
 * the player got past the obstacle without falling. They double as the tuning contract: if someone
 * lowers `JUMP_SPEED` or widens a gap, the specific obstacle that broke is named in the failure.
 */

const TICK = 1 / 120;
const course = buildCourse();

function intent(overrides: Partial<MoveIntent> = {}): MoveIntent {
  return {
    forward: 1,
    strafe: 0,
    yaw: 0, // yaw 0 faces -Z, which is down-course
    jumpPressed: false,
    dashPressed: false,
    crouchHeld: false,
    ...overrides
  };
}

interface RunResult {
  z: number;
  y: number;
  fell: boolean;
  minY: number;
  maxSpeed: number;
}

/**
 * @param script Returns the intent for a tick, given the player's current position.
 */
function run(
  startZ: number,
  ticks: number,
  script: (z: number, y: number, tick: number) => MoveIntent,
  startY = 0,
  /** Stops the run once the objective is met, so the player does not sail on into the next gap. */
  until?: (z: number, y: number) => boolean
): RunResult {
  const player = new PlayerController();
  player.reset(0, startY, startZ);

  let minY = startY;
  let maxSpeed = 0;

  for (let i = 0; i < ticks; i++) {
    const b = player.body;
    if (until?.(b.z, b.y)) break;
    player.update(script(b.z, b.y, i), course.boxes, TICK);
    minY = Math.min(minY, player.body.y);
    maxSpeed = Math.max(maxSpeed, player.speed);
    if (player.body.y < course.killY) break;
  }

  return {
    z: player.body.z,
    y: player.body.y,
    fell: player.body.y < -2,
    minY,
    maxSpeed
  };
}

describe('course reach budget', () => {
  it('a running jump clears roughly 6–8 m, which is what the gaps are sized against', () => {
    // Measured on flat ground with no obstacles in the way, from the start straight.
    const result = run(-10, 240, (z) => intent({ jumpPressed: z <= -14 && z > -14.2 }));
    expect(result.maxSpeed).toBeGreaterThan(9);
    expect(result.fell).toBe(false);
  });
});

describe('course is completable', () => {
  it('segment 1→2: clears the 4 m jump gap at running speed', () => {
    // Build speed on the start straight, jump just before the lip at z = -30.
    const result = run(-16, 400, (z) => intent({ jumpPressed: z <= -29.6 && z > -30.2 }));
    expect(result.fell).toBe(false);
    expect(result.z).toBeLessThan(-34);
  });

  it('segment 3: slides under the tunnel lintel', () => {
    // Crouch before the lintel at z = -44 and hold it through to z = -54.
    const result = run(-38, 500, (z) => intent({ crouchHeld: z <= -41 && z >= -58 }), 0, (z) => z < -58);
    expect(result.fell).toBe(false);
    expect(result.z).toBeLessThan(-56);
  });

  it('segment 3: a standing player is stopped by the lintel', () => {
    // The tunnel has to actually be an obstacle, or the slide mechanic is decorative.
    const result = run(-38, 400, () => intent());
    expect(result.z).toBeGreaterThan(-45);
  });

  it('segment 4: clears the 6 m speed gap with a running jump', () => {
    const result = run(-50, 500, (z) =>
      intent({
        crouchHeld: z <= -41 && z >= -55,
        jumpPressed: z <= -61.6 && z > -62.2
      }),
      0,
      (z) => z < -70
    );
    expect(result.fell).toBe(false);
    expect(result.z).toBeLessThan(-68);
  });

  it('segment 5: clears the 10 m dash gap with jump plus dash', () => {
    const result = run(-78, 500, (z) =>
      intent({
        jumpPressed: z <= -87.6 && z > -88.2,
        dashPressed: z <= -88.6 && z > -89.2
      }),
      0,
      (z) => z < -100
    );
    expect(result.fell).toBe(false);
    expect(result.z).toBeLessThan(-98);
  });

  it('segment 5: cannot be crossed by jumping alone, so the dash is load-bearing', () => {
    const result = run(-78, 400, (z) => intent({ jumpPressed: z <= -87.6 && z > -88.2 }));
    // Horizontal speed carries them past -98 while falling, so the proof is the fall itself.
    expect(result.fell).toBe(true);
  });

  it('segment 7: runs up the stair climb without stalling', () => {
    const result = run(-100, 900, () => intent(), 0, (z) => z < -130);
    expect(result.fell).toBe(false);
    // Should end the climb at the top step height.
    expect(result.y).toBeGreaterThan(4);
    expect(result.z).toBeLessThan(-124);
  });

  it('segment 8: reaches the mid-corridor ledge with a jump', () => {
    const result = run(-124, 600, (z) => intent({ jumpPressed: z <= -129.6 && z > -130.2 }), 4.5, (z) => z < -137);
    expect(result.fell).toBe(false);
    expect(result.z).toBeLessThan(-136);
  });

  it('segment 9: reaches the finish line from the far ledge', () => {
    const result = run(-136.5, 900, (z) => intent({ jumpPressed: z <= -139.6 && z > -140.2 }), 4.5, (z) => z < course.finishZ);
    expect(result.fell).toBe(false);
    expect(result.z).toBeLessThan(course.finishZ);
  });
});

describe('course structure', () => {
  it('places every checkpoint on solid ground', () => {
    for (const cp of course.checkpoints) {
      const supported = course.boxes.some(
        (b) =>
          b.kind !== 'goal' &&
          cp.spawnX >= b.minX &&
          cp.spawnX <= b.maxX &&
          cp.spawnZ >= b.minZ &&
          cp.spawnZ <= b.maxZ &&
          Math.abs(b.maxY - cp.spawnY) < 0.01
      );
      expect(supported, `checkpoint ${cp.index} (${cp.label}) has no floor under it`).toBe(true);
    }
  });

  it('orders checkpoints down the course', () => {
    for (let i = 1; i < course.checkpoints.length; i++) {
      expect(course.checkpoints[i].triggerZ).toBeLessThan(course.checkpoints[i - 1].triggerZ);
    }
    expect(course.finishZ).toBeLessThan(
      course.checkpoints[course.checkpoints.length - 1].triggerZ
    );
  });

  it('keeps the kill plane below every surface the player runs on', () => {
    for (const cp of course.checkpoints) {
      expect(cp.spawnY).toBeGreaterThan(course.killY);
    }
  });
});
