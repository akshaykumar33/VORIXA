import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FOLLOW,
  findClip,
  followCamera,
  runPlaybackRate,
  runnerAction,
  smoothToward,
  type Vec3Like
} from '../src/rendering/ThirdPerson';

/**
 * Follow-camera failures are obvious in play and invisible to a typecheck: a camera in front of
 * the runner, one that sinks through the floor looking down, or one heavier at 60 Hz than 144 Hz.
 */

const EYE = { x: 0, y: 1.6, z: 0 };

function place(yaw: number, pitch = 0) {
  const position: Vec3Like = { x: 0, y: 0, z: 0 };
  const target: Vec3Like = { x: 0, y: 0, z: 0 };
  followCamera(EYE, yaw, pitch, DEFAULT_FOLLOW, position, target);
  return { position, target };
}

describe('follow camera', () => {
  it('sits behind the runner when facing down the course', () => {
    // The course runs toward -Z, so behind is +Z.
    const { position } = place(0);
    expect(position.z).toBeGreaterThan(EYE.z + 3);
    expect(Math.abs(position.x)).toBeLessThan(1e-9);
  });

  it('sits above the runner', () => {
    expect(place(0).position.y).toBeGreaterThan(EYE.y);
  });

  it('aims ahead of the runner, not at it', () => {
    // Aiming at the runner centres the character and hides the line the player must read.
    expect(place(0).target.z).toBeLessThan(EYE.z - 3);
  });

  it('swings round when the runner turns', () => {
    const right = place(-Math.PI / 2);
    // Yaw -90 faces +X, so the camera trails on -X.
    expect(right.position.x).toBeLessThan(EYE.x - 3);
  });

  it('keeps its distance at any heading', () => {
    for (const yaw of [0, 0.7, 2, -2.5, Math.PI]) {
      const { position } = place(yaw);
      const flat = Math.hypot(position.x - EYE.x, position.z - EYE.z);
      expect(flat).toBeCloseTo(DEFAULT_FOLLOW.distance, 6);
    }
  });

  it('rises rather than sinking when the player looks down', () => {
    // Pitch is negative looking down. The camera must orbit up and over, never through the floor.
    const level = place(0, 0).position.y;
    const down = place(0, -1.2).position.y;
    expect(down).toBeGreaterThan(level);
  });

  it('never drops below the runner however far the player looks up', () => {
    expect(place(0, 1.5).position.y).toBeGreaterThan(EYE.y - DEFAULT_FOLLOW.distance);
  });
});

describe('smoothing', () => {
  it('converges on the target', () => {
    let value = 0;
    for (let i = 0; i < 600; i++) value = smoothToward(value, 10, 8, 1 / 60);
    expect(value).toBeCloseTo(10, 4);
  });

  it('behaves the same at different frame rates', () => {
    // Same wall-clock time at 60 Hz and 144 Hz must land in the same place.
    let slow = 0;
    for (let i = 0; i < 60; i++) slow = smoothToward(slow, 10, 6, 1 / 60);
    let fast = 0;
    for (let i = 0; i < 144; i++) fast = smoothToward(fast, 10, 6, 1 / 144);
    expect(fast).toBeCloseTo(slow, 6);
  });
});

describe('runner animation', () => {
  it('stands still when stopped', () => {
    expect(runnerAction({ speed: 0, grounded: true, sliding: false })).toBe('idle');
  });

  it('runs when moving on the ground', () => {
    expect(runnerAction({ speed: 8, grounded: true, sliding: false })).toBe('run');
  });

  it('jumps when airborne, whatever the speed', () => {
    expect(runnerAction({ speed: 8, grounded: false, sliding: false })).toBe('jump');
  });

  it('slides over everything else', () => {
    expect(runnerAction({ speed: 8, grounded: true, sliding: true })).toBe('slide');
  });

  it('scales the run clip with speed so feet do not skate', () => {
    expect(runPlaybackRate(10, 5)).toBeCloseTo(2, 6);
    expect(runPlaybackRate(5, 5)).toBeCloseTo(1, 6);
  });

  it('clamps playback to a plausible range', () => {
    expect(runPlaybackRate(0.1, 5)).toBe(0.6);
    expect(runPlaybackRate(100, 5)).toBe(2.2);
    expect(runPlaybackRate(5, 0)).toBe(1);
  });
});

describe('clip matching', () => {
  const quaternius = ['CharacterArmature|Idle', 'CharacterArmature|Run', 'CharacterArmature|Jump', 'CharacterArmature|Roll'];

  it('finds clips by keyword across naming schemes', () => {
    expect(findClip(quaternius, 'idle')).toBe(0);
    expect(findClip(quaternius, 'run')).toBe(1);
    expect(findClip(quaternius, 'jump')).toBe(2);
    expect(findClip(quaternius, 'slide')).toBe(3);
  });

  it('is case-insensitive', () => {
    expect(findClip(['RUNNING'], 'run')).toBe(0);
  });

  it('prefers a real run over a walk', () => {
    expect(findClip(['Walk', 'Run'], 'run')).toBe(1);
  });

  it('reports a miss rather than guessing', () => {
    expect(findClip(['Wave', 'Dance'], 'jump')).toBe(-1);
  });
});
