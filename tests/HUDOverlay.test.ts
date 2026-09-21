import { describe, it, expect } from 'vitest';
import { yawToHeading } from '../src/ui/HUDOverlay';

describe('compass heading', () => {
  it('reads north when facing the default direction', () => {
    const heading = yawToHeading(0);
    expect(heading.point).toBe('N');
    expect(heading.degrees).toBeCloseTo(0, 6);
  });

  it('reads west after a positive quarter turn', () => {
    // Positive yaw swings the view toward world -X, which is west.
    expect(yawToHeading(Math.PI / 2).point).toBe('W');
  });

  it('reads east after a negative quarter turn', () => {
    expect(yawToHeading(-Math.PI / 2).point).toBe('E');
  });

  it('reads south when turned all the way around', () => {
    expect(yawToHeading(Math.PI).point).toBe('S');
  });

  it('always reports a bearing within a single revolution', () => {
    for (let yaw = -20; yaw <= 20; yaw += 0.13) {
      const heading = yawToHeading(yaw);
      expect(heading.degrees).toBeGreaterThanOrEqual(0);
      expect(heading.degrees).toBeLessThan(360);
      expect(heading.point).toBeTruthy();
    }
  });

  it('never reports the wrap-around bearing as a ninth compass point', () => {
    // 359.9 degrees rounds to 8 buckets of 45; the modulo has to fold it back to N.
    expect(yawToHeading(-0.001).point).toBe('N');
  });
});
