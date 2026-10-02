import { describe, it, expect } from 'vitest';
import { CoPilot, type CoPilotInput } from '../src/ui/CoPilot';

/**
 * Whether the co-pilot actually follows the player is invisible in a screenshot: a character wired
 * to a permanently-zero input looks exactly like one that is working and happens to be facing
 * forward. That is precisely how the first version shipped — the horizontal fallback read an axis
 * only ever written by hand tracking, so for a mouse player the head could not turn at all.
 *
 * Cell indices are row-major into the 3×3 directions sheet:
 *
 *   0 up-left    1 up      2 up-right
 *   3 left       4 centre  5 right
 *   6 down-left  7 down    8 down-right
 */

const CENTRE = 4;
const DT = 1 / 60;

function input(overrides: Partial<CoPilotInput> = {}): CoPilotInput {
  return {
    gazeX: 0,
    gazeY: 0,
    mood: 'idle',
    trackingLost: false,
    visible: true,
    ...overrides
  };
}

/** Steps long enough for hysteresis to settle on a direction. */
function settle(pilot: CoPilot, state: CoPilotInput, steps = 20): void {
  for (let i = 0; i < steps; i++) pilot.update(DT, state);
}

describe('head direction', () => {
  it('faces centre when the player is looking straight ahead', () => {
    const pilot = new CoPilot();
    settle(pilot, input());
    expect(pilot.headCell).toBe(CENTRE);
  });

  it('looks right when the player looks right', () => {
    const pilot = new CoPilot();
    settle(pilot, input({ gazeX: 1 }));
    expect(pilot.headCell).toBe(5);
  });

  it('looks left when the player looks left', () => {
    const pilot = new CoPilot();
    settle(pilot, input({ gazeX: -1 }));
    expect(pilot.headCell).toBe(3);
  });

  it('looks up when the player looks up', () => {
    // Input is positive-up; the sheet's top row is cells 0-2. Getting this inverted produces a
    // character that mirrors the player, which looks deliberate and is completely wrong.
    const pilot = new CoPilot();
    settle(pilot, input({ gazeY: 1 }));
    expect(pilot.headCell).toBe(1);
  });

  it('looks down when the player looks down', () => {
    const pilot = new CoPilot();
    settle(pilot, input({ gazeY: -1 }));
    expect(pilot.headCell).toBe(7);
  });

  it('handles the diagonals', () => {
    const upRight = new CoPilot();
    settle(upRight, input({ gazeX: 1, gazeY: 1 }));
    expect(upRight.headCell).toBe(2);

    const downLeft = new CoPilot();
    settle(downLeft, input({ gazeX: -1, gazeY: -1 }));
    expect(downLeft.headCell).toBe(6);
  });

  it('returns to centre inside the dead zone', () => {
    const pilot = new CoPilot();
    settle(pilot, input({ gazeX: 1 }));
    expect(pilot.headCell).not.toBe(CENTRE);

    settle(pilot, input({ gazeX: 0.05 }));
    expect(pilot.headCell).toBe(CENTRE);
  });

  it('does not chatter on a sector boundary', () => {
    /*
     * A gaze resting exactly between two sectors would otherwise flip cells every frame, which is
     * far more distracting than the head simply lagging.
     */
    const pilot = new CoPilot();
    settle(pilot, input({ gazeX: 1, gazeY: 0 }));
    const settled = pilot.headCell;

    let changes = 0;
    for (let i = 0; i < 200; i++) {
      // Jitter either side of the right/up-right boundary.
      const wobble = Math.sin(i) * 0.02;
      pilot.update(DT, input({ gazeX: 1, gazeY: 0.4 + wobble }));
      if (pilot.headCell !== settled) changes++;
    }
    // One settled transition is fine; flipping back and forth is not.
    expect(changes === 0 || changes === 200).toBe(true);
  });
});

describe('reactions', () => {
  it('shows a reaction on a mood change', () => {
    const pilot = new CoPilot();
    pilot.update(DT, input({ mood: 'boost' }));
    expect(pilot.faceCell).toBe(2); // sparkle
  });

  it('gives each mood its own face', () => {
    const moods = [
      ['hazard', 7],
      ['checkpoint', 8],
      ['dilating', 3],
      ['record', 1]
    ] as const;

    for (const [mood, cell] of moods) {
      const pilot = new CoPilot();
      pilot.update(DT, input({ mood }));
      expect(pilot.faceCell, mood).toBe(cell);
    }
  });

  it('decays a reaction rather than holding it', () => {
    // Holding a boost must not freeze the face for the whole pad.
    const pilot = new CoPilot();
    pilot.update(DT, input({ mood: 'boost' }));
    expect(pilot.faceCell).toBe(2);

    settle(pilot, input({ mood: 'boost' }), 120);
    expect(pilot.faceCell).not.toBe(2);
  });

  it('shows a sleepy face when the tracker loses the player', () => {
    // A tracker that has quietly stopped seeing you is otherwise indistinguishable from one that
    // is working and ignoring you.
    const pilot = new CoPilot();
    settle(pilot, input({ trackingLost: true }), 90);
    expect(pilot.faceCell).toBe(6); // sleepy
  });

  it('prioritises an event over the sleepy face', () => {
    const pilot = new CoPilot();
    pilot.update(DT, input({ mood: 'hazard', trackingLost: true }));
    expect(pilot.faceCell).toBe(7); // dizzy
  });
});

describe('drawing safety', () => {
  it('reports not loaded before sheets arrive', () => {
    expect(new CoPilot().loaded).toBe(false);
  });

  it('keeps tracking while hidden', () => {
    // Stepped while hidden so it appears already settled rather than snapping from a stale pose.
    const pilot = new CoPilot();
    settle(pilot, input({ gazeX: 1, visible: false }));
    expect(pilot.headCell).toBe(5);
  });
});
