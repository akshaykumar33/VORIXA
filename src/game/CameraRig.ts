import { MAX_GROUND_SPEED } from './PlayerController';

/**
 * Camera feel.
 *
 * None of this changes where the player is or what they can do — it changes how fast it *reads*,
 * which in a movement game is most of the experience. Speed you cannot perceive may as well not
 * exist, so the camera's whole job is to make velocity legible:
 *
 *   - **FOV widens with speed.** The single most effective speed cue there is; the periphery
 *     streams past faster than the centre and the world appears to stretch.
 *   - **Roll on strafe and wall-run.** Tells you which way your momentum is leaning without
 *     costing any screen space, and makes wall-running read as leaning into the wall.
 *   - **A dip on landing, scaled by impact.** Gives the ground weight. Without it, falling forty
 *     metres feels the same as stepping off a kerb.
 *   - **Shake only on hard landings.** Used sparingly, because constant shake reads as noise and
 *     makes precise platforming harder rather than more exciting.
 *
 * Every response is an exponential decay toward a target, which is frame-rate independent —
 * a per-frame constant would make the camera behave differently at 60 and 144 Hz.
 */

export interface RigOutput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Radians of roll about the view axis. */
  roll: number;
  /** Vertical FOV in degrees. */
  fov: number;
}

export interface RigInput {
  x: number;
  /** Feet position; eye height is added here. */
  y: number;
  z: number;
  eyeHeight: number;
  yaw: number;
  pitch: number;
  speed: number;
  /** -1 left, +1 right, for strafe lean. */
  strafe: number;
  /** 0 when not attached, otherwise which shoulder the wall is on. */
  wallSide: number;
  dashing: boolean;
  sliding: boolean;
}

const BASE_FOV = 88;
/** Extra degrees at maximum speed. Generous, because this is the main speed cue. */
const SPEED_FOV = 26;
const DASH_FOV_PUNCH = 14;
/** Speed at which the FOV boost saturates — well above running pace, so sprinting still reads. */
const FOV_SATURATION_SPEED = MAX_GROUND_SPEED * 2.4;

const STRAFE_ROLL = 0.028;
const WALLRUN_ROLL = 0.23;
const SLIDE_ROLL = 0.035;

const DEG = Math.PI / 180;

export class CameraRig {
  public readonly out: RigOutput = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: BASE_FOV
  };

  private eyeY = 0;
  private roll = 0;
  private fov = BASE_FOV;
  private dashPunch = 0;
  private landingDip = 0;
  private shake = 0;
  private shakeSeed = Math.random() * 1000;

  public reset(input: RigInput): void {
    this.eyeY = input.y + input.eyeHeight;
    this.roll = 0;
    this.fov = BASE_FOV;
    this.dashPunch = 0;
    this.landingDip = 0;
    this.shake = 0;
  }

  /** @param landingSpeed Downward speed on touchdown this tick, or 0. */
  public update(
    input: RigInput,
    landingSpeed: number,
    dashed: boolean,
    dt: number,
    boosted: boolean = false,
    hazardHit: boolean = false
  ): RigOutput {
    if (dashed) this.dashPunch = 1;
    if (boosted) this.dashPunch = 1.4;
    if (hazardHit) this.shake = Math.max(this.shake, 0.85);
    if (landingSpeed > 3) {
      const impact = Math.min((landingSpeed - 3) / 18, 1);
      this.landingDip = Math.max(this.landingDip, impact);
      // Only genuinely heavy landings shake; a routine hop must not.
      if (impact > 0.45) this.shake = Math.max(this.shake, impact);
    }

    this.dashPunch *= Math.exp(-7 * dt);
    this.landingDip *= Math.exp(-9 * dt);
    this.shake *= Math.exp(-11 * dt);

    // Eye height is smoothed, not snapped: the drop into a slide should be felt as a movement,
    // and unsmoothed step-ups read as the world jolting.
    const targetEye = input.y + input.eyeHeight;
    this.eyeY += (targetEye - this.eyeY) * (1 - Math.exp(-22 * dt));

    const speedFactor = Math.min(input.speed / FOV_SATURATION_SPEED, 1);
    const targetFov = BASE_FOV + SPEED_FOV * speedFactor + DASH_FOV_PUNCH * this.dashPunch;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-9 * dt));

    let targetRoll = -input.strafe * STRAFE_ROLL;
    if (input.wallSide !== 0) targetRoll = input.wallSide * WALLRUN_ROLL;
    else if (input.sliding) targetRoll += -input.strafe * SLIDE_ROLL;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-11 * dt));

    this.shakeSeed += dt * 47;

    const o = this.out;
    o.x = input.x + this.shakeOffset(this.shakeSeed) * this.shake * 0.35;
    o.y = this.eyeY - this.landingDip * 0.42 + this.shakeOffset(this.shakeSeed * 1.7) * this.shake * 0.35;
    o.z = input.z;
    o.yaw = input.yaw;
    o.pitch = input.pitch - this.landingDip * 0.08;
    o.roll = this.roll;
    o.fov = this.fov;
    return o;
  }

  /** Cheap deterministic noise in [-1, 1]; a sine pair beats Math.random, which reads as static. */
  private shakeOffset(seed: number): number {
    return Math.sin(seed) * 0.6 + Math.sin(seed * 2.37) * 0.4;
  }
}

export { BASE_FOV, DEG };
