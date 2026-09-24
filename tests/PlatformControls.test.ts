import { describe, it, expect } from 'vitest';
import { PlatformControls, GESTURE_JUMP_HOLD, type PlatformSources } from '../src/platformer/PlatformControls';
import { loadLevel, LEVELS } from '../src/platformer/Levels';
import { PlatformSim } from '../src/platformer/PlatformSim';

const none = (over: Partial<PlatformSources> = {}): PlatformSources => ({
  leftHeld: false,
  rightHeld: false,
  jumpPressed: false,
  jumpHeld: false,
  fireHeld: false,
  gaze: null,
  face: null,
  hand: null,
  ...over
});

describe('PlatformControls', () => {
  it('maps keys to move, jump and fire', () => {
    const c = new PlatformControls();
    expect(c.resolve(none({ rightHeld: true }), 0.01).move).toBe(1);
    expect(c.resolve(none({ leftHeld: true }), 0.01).move).toBe(-1);
    expect(c.resolve(none({ leftHeld: true, rightHeld: true }), 0.01).move).toBe(0);
    const i = c.resolve(none({ jumpPressed: true, jumpHeld: true, fireHeld: true }), 0.01);
    expect(i.jumpPressed && i.jumpHeld && i.fire).toBe(true);
  });

  it('walks where the eyes look, with a dead zone in the middle', () => {
    const c = new PlatformControls();
    const look = (gazeX: number) => c.resolve(none({ gaze: { present: true, gazeX } }), 0.01).move;
    expect(look(0)).toBe(0);
    expect(look(0.8)).toBe(1);
    // Hysteresis: easing back toward the middle keeps walking until the release zone.
    expect(look(0.35)).toBe(1);
    expect(look(0.1)).toBe(0);
    expect(look(-0.9)).toBe(-1);
  });

  it('walks where the palm points when the eyes are off', () => {
    const c = new PlatformControls();
    const hand = (steerX: number) => ({ present: true, steerX, fistStarted: false, pinching: false });
    expect(c.resolve(none({ hand: hand(0.6) }), 0.01).move).toBe(1);
    expect(c.resolve(none({ hand: hand(-0.6) }), 0.01).move).toBe(-1);
  });

  it('lets the keys override a gesture', () => {
    const c = new PlatformControls();
    expect(c.resolve(none({ leftHeld: true, gaze: { present: true, gazeX: 0.9 } }), 0.01).move).toBe(-1);
  });

  it('turns a brow raise into a full-height jump', () => {
    const c = new PlatformControls();
    const first = c.resolve(none({ face: { jumpStarted: true, firing: false } }), 0.01);
    expect(first.jumpPressed).toBe(true);
    expect(first.jumpHeld).toBe(true);
    const during = c.resolve(none({ face: { jumpStarted: false, firing: false } }), GESTURE_JUMP_HOLD / 2);
    expect(during.jumpPressed).toBe(false);
    expect(during.jumpHeld).toBe(true);
    const after = c.resolve(none({ face: { jumpStarted: false, firing: false } }), GESTURE_JUMP_HOLD);
    expect(after.jumpHeld).toBe(false);
  });

  it('jumps as high from a gesture as from a held key', () => {
    const peak = (gesture: boolean) => {
      const sim = new PlatformSim(loadLevel(0));
      const c = new PlatformControls();
      let top = sim.y;
      for (let n = 0; n < 120; n++) {
        const src = gesture
          ? none({ face: { jumpStarted: n === 0, firing: false } })
          : none({ jumpPressed: n === 0, jumpHeld: true });
        sim.update(c.resolve(src, 1 / 120), 1 / 120);
        top = Math.max(top, sim.y);
      }
      return top;
    };
    expect(peak(true)).toBeCloseTo(peak(false), 1);
  });

  it('fires from a mouth, a pinch or the mouse', () => {
    const c = new PlatformControls();
    expect(c.resolve(none({ face: { jumpStarted: false, firing: true } }), 0.01).fire).toBe(true);
    expect(c.resolve(none({ hand: { present: true, steerX: 0, fistStarted: false, pinching: true } }), 0.01).fire).toBe(true);
    expect(c.resolve(none({ fireHeld: true }), 0.01).fire).toBe(true);
  });
});

describe('loadLevel', () => {
  it('returns a fresh copy each time, so a bumped block does not stay bumped', () => {
    const a = loadLevel(0);
    const b = loadLevel(0);
    expect(a.tiles).not.toBe(b.tiles);
    a.tiles.fill(0);
    expect(b.tiles).toEqual(LEVELS[0].tiles);
  });
});
