import { describe, it, expect } from 'vitest';
import {
  mat4Create,
  mat4Identity,
  mat4Multiply,
  mat4Perspective,
  mat4View,
  mat4FromTranslationScale,
  yawForwardX,
  yawForwardZ,
  yawRightX,
  yawRightZ,
  type Mat4
} from '../src/math/Mat4';

/** Applies a column-major mat4 to a point, returning clip-space [x, y, z, w]. */
function transform(m: Mat4, x: number, y: number, z: number): [number, number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15]
  ];
}

describe('mat4Perspective', () => {
  const near = 0.1;
  const far = 100;
  const proj = mat4Perspective(mat4Create(), Math.PI / 4, 16 / 9, near, far);

  it('maps the near plane to depth 0 (WebGPU convention, not OpenGL -1)', () => {
    const [, , z, w] = transform(proj, 0, 0, -near);
    expect(z / w).toBeCloseTo(0, 6);
  });

  it('maps the far plane to depth 1', () => {
    const [, , z, w] = transform(proj, 0, 0, -far);
    expect(z / w).toBeCloseTo(1, 6);
  });

  it('produces positive w for points in front of the camera', () => {
    const [, , , w] = transform(proj, 0, 0, -10);
    expect(w).toBeGreaterThan(0);
  });

  it('respects aspect ratio by compressing x relative to y', () => {
    const [x] = transform(proj, 1, 0, -1);
    const [, y] = transform(proj, 0, 1, -1);
    // With a wide aspect, a unit of x occupies less clip space than a unit of y.
    expect(Math.abs(x)).toBeLessThan(Math.abs(y));
  });
});

describe('mat4View', () => {
  it('is identity-like at the origin with no rotation', () => {
    const view = mat4View(mat4Create(), 0, 0, 0, 0, 0);
    const [x, y, z] = transform(view, 1, 2, -3);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(2, 6);
    expect(z).toBeCloseTo(-3, 6);
  });

  it('translates the world opposite to camera position', () => {
    const view = mat4View(mat4Create(), 5, 0, 0, 0, 0);
    const [x] = transform(view, 5, 0, 0);
    expect(x).toBeCloseTo(0, 6);
  });

  it('places a point ahead of the camera at negative view-space z', () => {
    const view = mat4View(mat4Create(), 0, 0, 0, 0, 0);
    const [, , z] = transform(view, 0, 0, -10);
    expect(z).toBeLessThan(0);
  });

  it('yaw of 90 degrees turns the camera to face world -X', () => {
    // Positive yaw is a right-handed rotation about +Y, which swings the -Z forward vector
    // toward -X. A point at world -X should therefore be directly ahead, at view-space -Z.
    const view = mat4View(mat4Create(), 0, 0, 0, Math.PI / 2, 0);
    const [x, y, z] = transform(view, -10, 0, 0);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(-10, 5);
  });

  it('pitching up moves a forward point below the view centre', () => {
    const level = mat4View(mat4Create(), 0, 0, 0, 0, 0);
    const pitched = mat4View(mat4Create(), 0, 0, 0, 0, 0.3);
    const [, yLevel] = transform(level, 0, 0, -10);
    const [, yPitched] = transform(pitched, 0, 0, -10);
    expect(yPitched).toBeLessThan(yLevel);
  });

  it('preserves distance from the camera under rotation', () => {
    const a = mat4View(mat4Create(), 0, 0, 0, 0, 0);
    const b = mat4View(mat4Create(), 0, 0, 0, 1.1, -0.4);
    const pa = transform(a, 3, 4, -12);
    const pb = transform(b, 3, 4, -12);
    const lenA = Math.hypot(pa[0], pa[1], pa[2]);
    const lenB = Math.hypot(pb[0], pb[1], pb[2]);
    expect(lenB).toBeCloseTo(lenA, 4);
  });
});

describe('mat4Multiply', () => {
  it('leaves a matrix unchanged when multiplied by identity', () => {
    const m = mat4Perspective(mat4Create(), 1.0, 1.5, 0.1, 50);
    const id = mat4Identity(mat4Create());
    const out = mat4Multiply(mat4Create(), m, id);
    for (let i = 0; i < 16; i++) expect(out[i]).toBeCloseTo(m[i], 6);
  });

  it('is correct when out aliases an input', () => {
    const a = mat4FromTranslationScale(mat4Create(), 1, 2, 3, 1, 1, 1);
    const b = mat4FromTranslationScale(mat4Create(), 10, 20, 30, 1, 1, 1);
    const expected = mat4Multiply(mat4Create(), a, b);
    mat4Multiply(a, a, b); // aliased
    for (let i = 0; i < 16; i++) expect(a[i]).toBeCloseTo(expected[i], 6);
  });

  it('composes translations additively', () => {
    const a = mat4FromTranslationScale(mat4Create(), 1, 2, 3, 1, 1, 1);
    const b = mat4FromTranslationScale(mat4Create(), 10, 20, 30, 1, 1, 1);
    const [x, y, z] = transform(mat4Multiply(mat4Create(), a, b), 0, 0, 0);
    expect([x, y, z]).toEqual([11, 22, 33]);
  });
});

describe('mat4FromTranslationScale', () => {
  it('scales about the origin then translates', () => {
    const m = mat4FromTranslationScale(mat4Create(), 5, 0, 0, 2, 3, 4);
    const [x, y, z] = transform(m, 1, 1, 1);
    expect([x, y, z]).toEqual([7, 3, 4]);
  });
});

describe('yaw basis vectors', () => {
  it('points forward down -Z at yaw 0', () => {
    expect(yawForwardX(0)).toBeCloseTo(0, 6);
    expect(yawForwardZ(0)).toBeCloseTo(-1, 6);
  });

  it('points right down +X at yaw 0', () => {
    expect(yawRightX(0)).toBeCloseTo(1, 6);
    expect(yawRightZ(0)).toBeCloseTo(0, 6);
  });

  it('keeps forward and right perpendicular at arbitrary yaw', () => {
    for (const yaw of [0, 0.7, 1.9, -2.4, Math.PI]) {
      const dot = yawForwardX(yaw) * yawRightX(yaw) + yawForwardZ(yaw) * yawRightZ(yaw);
      expect(dot).toBeCloseTo(0, 6);
    }
  });

  it('keeps both basis vectors unit length', () => {
    for (const yaw of [0, 0.7, 1.9, -2.4]) {
      expect(Math.hypot(yawForwardX(yaw), yawForwardZ(yaw))).toBeCloseTo(1, 6);
      expect(Math.hypot(yawRightX(yaw), yawRightZ(yaw))).toBeCloseTo(1, 6);
    }
  });

  it('agrees with the view matrix about which way is forward', () => {
    const yaw = 0.9;
    const view = mat4View(mat4Create(), 0, 0, 0, yaw, 0);
    // Stepping along the forward basis should land directly ahead of the camera.
    const [x, y, z] = transform(view, yawForwardX(yaw) * 10, 0, yawForwardZ(yaw) * 10);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(-10, 5);
  });
});
