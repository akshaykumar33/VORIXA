import {
  mat4Create,
  mat4Multiply,
  mat4Perspective,
  mat4View,
  type Mat4
} from '../math/Mat4';

/** Pitch is clamped just short of vertical; exactly ±90° degenerates the view basis. */
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

const DEG_TO_RAD = Math.PI / 180;

export interface CameraOptions {
  /** Vertical field of view in degrees at rest. */
  fovDegrees?: number;
  /** Extra vertical FOV in degrees applied at full sprint, for speed sensation. */
  sprintFovBoost?: number;
  /** Radians of rotation per pixel of mouse movement. */
  lookSensitivity?: number;
  near?: number;
  far?: number;
  /** Eye height above the entity's feet position, in metres. */
  eyeHeight?: number;
}

/**
 * First-person camera.
 *
 * Two deliberate feel decisions:
 *
 *   1. **Look is raw and undamped.** Smoothing the mouse adds input latency, which reads as
 *      sluggishness in first person no matter how good it looks on paper. The camera turns on the
 *      same frame the mouse moves.
 *   2. **Position and FOV are damped.** Easing the eye toward the simulated position gives motion
 *      weight without touching aim responsiveness, and widening FOV under sprint sells speed.
 *
 * Both use exponential smoothing (`1 - exp(-lambda * dt)`), which is frame-rate independent —
 * a fixed per-frame lerp factor would make the camera behave differently at 60 and 144 Hz.
 *
 * Allocates only in the constructor; `update` and the matrix getters are allocation-free.
 */
export class Camera {
  public yaw = 0;
  public pitch = 0;

  public readonly fovDegrees: number;
  public readonly sprintFovBoost: number;
  public readonly lookSensitivity: number;
  public readonly near: number;
  public readonly far: number;
  public readonly eyeHeight: number;

  /** Smoothed eye position in world space. */
  public eyeX = 0;
  public eyeY = 0;
  public eyeZ = 0;

  private currentFov: number;
  private aspect = 1;

  private readonly view: Mat4 = mat4Create();
  private readonly proj: Mat4 = mat4Create();
  private readonly viewProj: Mat4 = mat4Create();

  constructor(options: CameraOptions = {}) {
    this.fovDegrees = options.fovDegrees ?? 75;
    this.sprintFovBoost = options.sprintFovBoost ?? 10;
    this.lookSensitivity = options.lookSensitivity ?? 0.0022;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 500;
    this.eyeHeight = options.eyeHeight ?? 1.7;
    this.currentFov = this.fovDegrees;
  }

  /** Applies a raw mouse delta in pixels. Pitch is clamped; yaw wraps freely. */
  public applyLook(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * this.lookSensitivity;
    this.pitch -= deltaY * this.lookSensitivity;

    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    else if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;

    // Keep yaw in [-PI, PI] so it never drifts toward float precision loss over a long session.
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  public setAspect(width: number, height: number): void {
    this.aspect = height > 0 ? width / height : 1;
  }

  /** Snaps the eye to the target with no smoothing. Use on spawn and teleport. */
  public snapTo(targetX: number, targetY: number, targetZ: number): void {
    this.eyeX = targetX;
    this.eyeY = targetY + this.eyeHeight;
    this.eyeZ = targetZ;
  }

  /**
   * Advances damped state toward the simulated player position.
   *
   * @param sprintAmount 0 at walking pace, 1 at full sprint — drives FOV widening.
   */
  public update(
    targetX: number,
    targetY: number,
    targetZ: number,
    deltaTime: number,
    sprintAmount = 0
  ): void {
    const positionLambda = 24;
    const fovLambda = 8;

    const posT = 1 - Math.exp(-positionLambda * deltaTime);
    this.eyeX += (targetX - this.eyeX) * posT;
    this.eyeY += (targetY + this.eyeHeight - this.eyeY) * posT;
    this.eyeZ += (targetZ - this.eyeZ) * posT;

    const targetFov = this.fovDegrees + this.sprintFovBoost * sprintAmount;
    this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-fovLambda * deltaTime));
  }

  /** Recomputes view, projection, and their product. Allocation-free. */
  public updateMatrices(): void {
    mat4Perspective(this.proj, this.currentFov * DEG_TO_RAD, this.aspect, this.near, this.far);
    mat4View(this.view, this.eyeX, this.eyeY, this.eyeZ, this.yaw, this.pitch);
    mat4Multiply(this.viewProj, this.proj, this.view);
  }

  /** Combined projection * view. Valid after `updateMatrices`. */
  public get viewProjection(): Mat4 {
    return this.viewProj;
  }

  public get effectiveFovDegrees(): number {
    return this.currentFov;
  }
}
