/**
 * Zero-allocation 4x4 matrix math, targeting WebGPU conventions.
 *
 * Storage is **column-major**, matching WGSL's `mat4x4<f32>` memory layout, so a `Mat4` can be
 * written straight into a uniform buffer with no transpose. Index `[c * 4 + r]` is column `c`,
 * row `r`.
 *
 * Two conventions matter here and differ from OpenGL:
 *
 *   1. **Clip-space depth is [0, 1]**, not [-1, 1]. `mat4Perspective` maps near → 0, far → 1.
 *   2. The coordinate system is **right-handed**, with the camera looking down **-Z**.
 *
 * Every operation writes into a caller-supplied `out`. Nothing here allocates.
 */

export type Mat4 = Float32Array;

/** Allocates a matrix, set to identity. Setup only — never call this inside a frame. */
export function mat4Create(): Mat4 {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function mat4Identity(out: Mat4): Mat4 {
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/**
 * Right-handed perspective projection with a [0, 1] depth range (WebGPU / D3D convention).
 *
 * @param fovY  Vertical field of view in radians.
 * @param aspect Viewport width / height.
 */
export function mat4Perspective(
  out: Mat4,
  fovY: number,
  aspect: number,
  near: number,
  far: number
): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);

  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = far * nf; out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = far * near * nf; out[15] = 0;
  return out;
}

/**
 * Builds a first-person view matrix directly from position and Euler angles.
 *
 * This is `Rx(-pitch) * Ry(-yaw) * T(-position)` expanded by hand — cheaper and more numerically
 * predictable than composing three matrices and inverting, and it avoids the gimbal edge cases of
 * a general look-at when pitch is clamped (which it is, see Camera).
 *
 * At yaw = 0, pitch = 0 the camera looks down -Z.
 */
export function mat4View(
  out: Mat4,
  px: number,
  py: number,
  pz: number,
  yaw: number,
  pitch: number
): Mat4 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // Rotation rows of R = Rx(-pitch) * Ry(-yaw):
  //   [ cy      0    -sy    ]
  //   [ sp*sy   cp    sp*cy ]
  //   [ cp*sy  -sp    cp*cy ]
  const r00 = cy, r01 = 0, r02 = -sy;
  const r10 = sp * sy, r11 = cp, r12 = sp * cy;
  const r20 = cp * sy, r21 = -sp, r22 = cp * cy;

  // Translation column is R * (-position).
  const tx = -(r00 * px + r01 * py + r02 * pz);
  const ty = -(r10 * px + r11 * py + r12 * pz);
  const tz = -(r20 * px + r21 * py + r22 * pz);

  // Column-major store.
  out[0] = r00; out[1] = r10; out[2] = r20; out[3] = 0;
  out[4] = r01; out[5] = r11; out[6] = r21; out[7] = 0;
  out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

/** out = a * b. Safe when `out` aliases `a` or `b`. */
export function mat4Multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4];
    const b1 = b[i * 4 + 1];
    const b2 = b[i * 4 + 2];
    const b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

/** Builds a translation + non-uniform scale matrix. Sufficient for axis-aligned scene props. */
export function mat4FromTranslationScale(
  out: Mat4,
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number
): Mat4 {
  out[0] = sx; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = sz; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

/**
 * World-space basis vectors for a given yaw, used to turn input actions into movement.
 *
 * `forward` is flattened onto the XZ plane so that looking up or down does not slow walking or
 * launch the player into the air — standard FPS behavior.
 *
 * Convention: at yaw 0 forward is -Z and right is +X. Positive yaw is a right-handed rotation
 * about +Y, which swings forward toward **-X** (so yaw of π/2 faces world -X). These must stay
 * consistent with `mat4View` or the player walks in a direction they are not looking; the test
 * suite asserts that agreement directly.
 */
export function yawForwardX(yaw: number): number {
  return -Math.sin(yaw);
}

export function yawForwardZ(yaw: number): number {
  return -Math.cos(yaw);
}

export function yawRightX(yaw: number): number {
  return Math.cos(yaw);
}

export function yawRightZ(yaw: number): number {
  return -Math.sin(yaw);
}
