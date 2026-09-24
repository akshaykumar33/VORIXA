import { describe, it, expect } from 'vitest';
import { RushControls, zoneFor, GAZE_ZONES, type ControlSources } from '../src/rush/RushControls';

function sources(over: Partial<ControlSources> = {}): ControlSources {
  return {
    leftPressed: false,
    rightPressed: false,
    jumpPressed: false,
    itemPressed: false,
    fireHeld: false,
    nitroHeld: false,
    mouseAimX: null,
    gaze: null,
    hand: null,
    ...over
  };
}

function hand(over: Partial<NonNullable<ControlSources['hand']>> = {}): NonNullable<ControlSources['hand']> {
  return { present: true, steerX: 0, steerY: 0, thrust: 0.5, fistStarted: false, pinching: false, ...over };
}

describe('zones', () => {
  it('holds the previous zone inside the hysteresis band', () => {
    expect(zoneFor(0.3, 1, GAZE_ZONES)).toBe(1);
    expect(zoneFor(0.3, 0, GAZE_ZONES)).toBe(0);
    expect(zoneFor(0.1, 1, GAZE_ZONES)).toBe(0);
    expect(zoneFor(-0.5, 0, GAZE_ZONES)).toBe(-1);
  });
});

describe('keyboard', () => {
  it('moves one lane per press and stops at the edge', () => {
    const c = new RushControls();
    expect(c.resolve(sources({ rightPressed: true })).lane).toBe(1);
    expect(c.resolve(sources({ rightPressed: true })).lane).toBe(1);
    expect(c.resolve(sources({ leftPressed: true })).lane).toBe(0);
  });
});

describe('gaze', () => {
  it('looking at a side zone requests that lane', () => {
    const c = new RushControls();
    expect(c.resolve(sources({ gaze: { present: true, gazeX: -0.7 } })).lane).toBe(-1);
  });

  it('holding a gaze does not cancel a key press', () => {
    const c = new RushControls();
    c.resolve(sources({ gaze: { present: true, gazeX: 0 } }));
    c.resolve(sources({ rightPressed: true, gaze: { present: true, gazeX: 0 } }));
    expect(c.resolve(sources({ gaze: { present: true, gazeX: 0 } })).lane).toBe(1);
  });

  it('takes steering from the hands while it is present', () => {
    const c = new RushControls();
    const lane = c.resolve(sources({ gaze: { present: true, gazeX: 0 }, hand: hand({ steerX: 0.9 }) })).lane;
    expect(lane).toBe(0);
  });
});

describe('hands', () => {
  it('steer when the eyes are off', () => {
    const c = new RushControls();
    expect(c.resolve(sources({ hand: hand({ steerX: 0.8 }) })).lane).toBe(1);
  });

  it('fist jumps, pinch fires', () => {
    const c = new RushControls();
    const i = c.resolve(sources({ hand: hand({ fistStarted: true, pinching: true }) }));
    expect(i.jump).toBe(true);
    expect(i.fire).toBe(true);
  });

  it('a resting open hand is not nitro; a raised one is', () => {
    const c = new RushControls();
    expect(c.resolve(sources({ hand: hand({ thrust: 1, steerY: 0 }) })).nitro).toBe(false);
    expect(c.resolve(sources({ hand: hand({ thrust: 1, steerY: 0.6 }) })).nitro).toBe(true);
  });
});

describe('aim', () => {
  it('follows the mouse when it is in use, and the lane otherwise', () => {
    const c = new RushControls();
    expect(c.resolve(sources({ mouseAimX: -0.9 })).aimX).toBe(-0.9);
    c.resolve(sources({ rightPressed: true }));
    expect(c.resolve(sources()).aimX).toBeCloseTo(1 / 1.6);
  });
});

describe('items', () => {
  it('Q or F uses the item', () => {
    const c = new RushControls();
    expect(c.resolve(sources({ itemPressed: true })).useItem).toBe(true);
  });

  it('a raised fist uses the item; a low fist still jumps', () => {
    const c = new RushControls();
    const raised = c.resolve(sources({ hand: hand({ fistStarted: true, steerY: 0.6 }) }));
    expect(raised.useItem).toBe(true);
    expect(raised.jump).toBe(false);
    const low = c.resolve(sources({ hand: hand({ fistStarted: true, steerY: 0 }) }));
    expect(low.jump).toBe(true);
    expect(low.useItem).toBe(false);
  });
});
