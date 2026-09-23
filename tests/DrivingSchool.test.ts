import { describe, it, expect } from 'vitest';
import { DrivingSchool, type SchoolFrame } from '../src/rush/DrivingSchool';

function frame(over: Partial<SchoolFrame> = {}): SchoolFrame {
  return { dt: 1 / 60, lane: 0, jumps: 0, smashes: 0, nitroActive: false, firing: false, gaze: null, hand: null, eyesSteering: false, ...over };
}

function gaze(rawX: number, extra: Partial<NonNullable<SchoolFrame['gaze']>> = {}): SchoolFrame['gaze'] {
  return { on: true, present: true, rawX, blinkStarted: false, dilating: false, ...extra };
}

function holdFor(school: DrivingSchool, seconds: number, f: Partial<SchoolFrame>): void {
  for (let t = 0; t < seconds; t += 1 / 60) school.update(frame(f));
}

describe('driving school', () => {
  it('only advances when the game sees the player do the thing', () => {
    const s = new DrivingSchool('keys');
    holdFor(s, 10, {});
    expect(s.state.lesson?.id).toBe('lanes');
    for (const lane of [1, 0, -1, 0]) s.update(frame({ lane }));
    expect(s.state.lesson?.id).toBe('jump');
  });

  it('asks the game for targets when a shooting lesson starts', () => {
    const s = new DrivingSchool('keys');
    s.skip();
    s.skip();
    expect(s.state.lesson?.id).toBe('shoot');
    expect(s.pendingRequest).toBe('crates');
    s.update(frame({ smashes: 3 }));
    expect(s.state.lesson?.id).toBe('nitro');
  });

  it('shows a hint to a player who seems stuck', () => {
    const s = new DrivingSchool('keys');
    expect(s.state.showHint).toBe(false);
    holdFor(s, 8, {});
    expect(s.state.showHint).toBe(true);
  });

  it('a tracking flicker does not wipe out a hold', () => {
    const s = new DrivingSchool('keys');
    for (let i = 0; i < 3; i++) s.skip();
    holdFor(s, 0.8, { nitroActive: true });
    const before = s.state.progress;
    s.update(frame({ nitroActive: false }));
    expect(s.state.progress).toBeGreaterThan(before * 0.8);
  });

  it('calibrates the eyes from held poses and produces a usable calibration', () => {
    const s = new DrivingSchool('eyes');
    holdFor(s, 1, { gaze: gaze(0) });
    expect(s.state.lesson?.id).toBe('cal-center');
    // Each pose: a moment to move the eyes, then a steady hold.
    holdFor(s, 2, { gaze: gaze(0.02) });
    holdFor(s, 2, { gaze: gaze(-0.22) });
    holdFor(s, 2, { gaze: gaze(0.25) });
    expect(s.calibration).not.toBeNull();
    expect(s.calibration!.left).toBeCloseTo(-0.22);
    expect(s.calibration!.right).toBeCloseTo(0.25);
    expect(s.state.lesson?.id).toBe('eye-steer');
  });

  it('rejects a calibration where the eyes did not move, and explains why', () => {
    const s = new DrivingSchool('eyes');
    holdFor(s, 1, { gaze: gaze(0) });
    for (let i = 0; i < 3; i++) holdFor(s, 2, { gaze: gaze(0.01) });
    expect(s.calibration).toBeNull();
    expect(s.state.problem).not.toBeNull();
    expect(s.state.lesson?.id).toBe('cal-center');
  });

  it('ignores blink frames while calibrating', () => {
    const s = new DrivingSchool('eyes');
    holdFor(s, 1, { gaze: gaze(0) });
    holdFor(s, 3, { gaze: gaze(0.9, { dilating: true }) });
    expect(s.state.lesson?.id).toBe('cal-center');
  });

  it('skips hand steering when the eyes are steering', () => {
    const s = new DrivingSchool('hands');
    s.skip();
    expect(s.state.lesson?.id).toBe('hand-steer');
    s.update(frame({ eyesSteering: true }));
    expect(s.state.lesson?.id).toBe('fist');
  });

  it('finishes', () => {
    const s = new DrivingSchool('hands');
    for (let i = 0; i < 10; i++) s.skip();
    expect(s.state.done).toBe(true);
    expect(s.state.lesson).toBeNull();
  });
});
