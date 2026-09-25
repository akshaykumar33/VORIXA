/**
 * Zero-allocation 3D vector math.
 *
 * Every operation writes into a caller-supplied `out` target. Nothing here allocates, so these
 * are safe to call from inside the tick and render loops (AGENTS.md §2).
 *
 * Vectors are plain `Float32Array`s of length 3. Use `vec3Create` at setup time only.
 */

export type Vec3 = Float32Array;

/** Allocates a vector. Setup only — never call this inside a frame. */
export function vec3Create(x = 0, y = 0, z = 0): Vec3 {
  const out = new Float32Array(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function vec3Set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function vec3Copy(out: Vec3, a: Vec3): Vec3 {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}

export function vec3Add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}

export function vec3Sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

export function vec3Scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  out[2] = a[2] * s;
  return out;
}

/** out = a + b * s. The fused form avoids a temporary in integration steps. */
export function vec3ScaleAndAdd(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out[0] = a[0] + b[0] * s;
  out[1] = a[1] + b[1] * s;
  out[2] = a[2] + b[2] * s;
  return out;
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  // Read into locals first so `out` may alias `a` or `b`.
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];

  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function vec3Length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vec3SquaredLength(a: Vec3): number {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

/** Normalizes `a` into `out`. A zero-length vector is left as zero rather than producing NaN. */
export function vec3Normalize(out: Vec3, a: Vec3): Vec3 {
  const lenSq = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  if (lenSq === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
  }
  const inv = 1 / Math.sqrt(lenSq);
  out[0] = a[0] * inv;
  out[1] = a[1] * inv;
  out[2] = a[2] * inv;
  return out;
}

/** Frame-rate independent exponential smoothing toward `target`. `t` in [0,1] per call. */
export function vec3Lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
