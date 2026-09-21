import { describe, it, expect } from 'vitest';
import { Camera, PITCH_LIMIT } from '../src/rendering/Camera';

describe('Camera look', () => {
  it('clamps pitch below vertical however far the mouse travels', () => {
    const cam = new Camera();
    cam.applyLook(0, -100000);
    expect(cam.pitch).toBeCloseTo(PITCH_LIMIT, 6);
    expect(cam.pitch).toBeLessThan(Math.PI / 2);

    cam.applyLook(0, 200000);
    expect(cam.pitch).toBeCloseTo(-PITCH_LIMIT, 6);
    expect(cam.pitch).toBeGreaterThan(-Math.PI / 2);
  });

  it('keeps yaw wrapped within [-PI, PI] instead of drifting unbounded', () => {
    const cam = new Camera();
    for (let i = 0; i < 200; i++) cam.applyLook(-500, 0);
    expect(cam.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(cam.yaw).toBeLessThanOrEqual(Math.PI);
  });

  it('turns proportionally to mouse distance', () => {
    const cam = new Camera();
    cam.applyLook(100, 0);
    const once = cam.yaw;
    cam.yaw = 0;
    cam.applyLook(200, 0);
    expect(cam.yaw).toBeCloseTo(once * 2, 6);
  });

  it('moving the mouse right turns the view right', () => {
    const cam = new Camera();
    cam.applyLook(50, 0);
    // Turning right decreases yaw under our right-handed convention.
    expect(cam.yaw).toBeLessThan(0);
  });
});

describe('Camera damping', () => {
  it('snaps directly to the target with no smoothing', () => {
    const cam = new Camera({ eyeHeight: 1.7 });
    cam.snapTo(3, 0, -4);
    expect(cam.eyeX).toBe(3);
    expect(cam.eyeY).toBeCloseTo(1.7, 6);
    expect(cam.eyeZ).toBe(-4);
  });

  it('eases toward the target rather than jumping', () => {
    const cam = new Camera();
    cam.snapTo(0, 0, 0);
    cam.update(10, 0, 0, 1 / 60);
    expect(cam.eyeX).toBeGreaterThan(0);
    expect(cam.eyeX).toBeLessThan(10);
  });

  it('converges on the target when held still', () => {
    const cam = new Camera();
    cam.snapTo(0, 0, 0);
    for (let i = 0; i < 300; i++) cam.update(10, 0, -5, 1 / 60);
    expect(cam.eyeX).toBeCloseTo(10, 3);
    expect(cam.eyeZ).toBeCloseTo(-5, 3);
  });

  it('damps frame-rate independently', () => {
    // One second of travel should land in the same place at 30 Hz and 240 Hz.
    const slow = new Camera();
    slow.snapTo(0, 0, 0);
    for (let i = 0; i < 30; i++) slow.update(10, 0, 0, 1 / 30);

    const fast = new Camera();
    fast.snapTo(0, 0, 0);
    for (let i = 0; i < 240; i++) fast.update(10, 0, 0, 1 / 240);

    expect(fast.eyeX).toBeCloseTo(slow.eyeX, 3);
  });

  it('holds the eye above the feet position by eye height', () => {
    const cam = new Camera({ eyeHeight: 1.7 });
    cam.snapTo(0, 0, 0);
    for (let i = 0; i < 300; i++) cam.update(0, 5, 0, 1 / 60);
    expect(cam.eyeY).toBeCloseTo(6.7, 3);
  });
});

describe('Camera field of view', () => {
  it('rests at the configured field of view', () => {
    const cam = new Camera({ fovDegrees: 75 });
    expect(cam.effectiveFovDegrees).toBeCloseTo(75, 6);
  });

  it('widens toward the sprint boost under sustained sprint', () => {
    const cam = new Camera({ fovDegrees: 75, sprintFovBoost: 10 });
    for (let i = 0; i < 300; i++) cam.update(0, 0, 0, 1 / 60, 1);
    expect(cam.effectiveFovDegrees).toBeCloseTo(85, 2);
  });

  it('returns to rest when sprint stops', () => {
    const cam = new Camera({ fovDegrees: 75, sprintFovBoost: 10 });
    for (let i = 0; i < 300; i++) cam.update(0, 0, 0, 1 / 60, 1);
    for (let i = 0; i < 300; i++) cam.update(0, 0, 0, 1 / 60, 0);
    expect(cam.effectiveFovDegrees).toBeCloseTo(75, 2);
  });
});

describe('Camera matrices', () => {
  it('produces a finite view-projection matrix', () => {
    const cam = new Camera();
    cam.setAspect(1920, 1080);
    cam.snapTo(0, 0, 0);
    cam.updateMatrices();
    const m = cam.viewProjection;
    expect(m.length).toBe(16);
    for (let i = 0; i < 16; i++) expect(Number.isFinite(m[i])).toBe(true);
  });

  it('survives a zero-height viewport without producing NaN', () => {
    const cam = new Camera();
    cam.setAspect(800, 0);
    cam.updateMatrices();
    for (let i = 0; i < 16; i++) expect(Number.isFinite(cam.viewProjection[i])).toBe(true);
  });

  it('reuses the same matrix instance across frames', () => {
    const cam = new Camera();
    cam.setAspect(100, 100);
    cam.updateMatrices();
    const first = cam.viewProjection;
    cam.updateMatrices();
    // Identity here proves the render path is not allocating a matrix per frame.
    expect(cam.viewProjection).toBe(first);
  });
});
