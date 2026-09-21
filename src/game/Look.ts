/** Pitch is clamped just short of vertical; exactly ±90° degenerates the view basis. */
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

/**
 * Mouse look.
 *
 * Deliberately raw and undamped. Smoothing the mouse adds input latency, which reads as
 * sluggishness in first person no matter how good it looks in a video — and in a game where the
 * whole skill expression is steering your own momentum, a camera that lags behind the mouse is
 * the difference between a run feeling precise and feeling approximate. The view turns on the
 * same frame the mouse moves.
 */
export class Look {
  public yaw = 0;
  public pitch = 0;
  /** Radians of rotation per pixel of mouse movement. */
  public sensitivity: number;

  constructor(sensitivity = 0.0022) {
    this.sensitivity = sensitivity;
  }

  public apply(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * this.sensitivity;
    this.pitch -= deltaY * this.sensitivity;

    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    else if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;

    // Keep yaw in [-PI, PI] so it never drifts toward float precision loss over a long session.
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  public reset(yaw = 0, pitch = 0): void {
    this.yaw = yaw;
    this.pitch = pitch;
  }
}
