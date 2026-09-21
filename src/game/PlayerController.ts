import { yawForwardX, yawForwardZ, yawRightX, yawRightZ } from '../math/Mat4';
import {
  PLAYER_SLIDE_HEIGHT,
  PLAYER_STAND_HEIGHT,
  canStandAt,
  moveAndCollide,
  type MutableBody
} from './Collision';
import type { Box } from './Course';

/**
 * The movement model. This is the game.
 *
 * Everything here is in service of one thing: that holding forward and playing well should make
 * you faster, and that the ceiling on "playing well" should be high enough to keep chasing. The
 * model is Quake-derived rather than realistic, for a specific reason — Quake's air acceleration
 * has the property that steering into your own momentum *gains* speed, so a skilled player and a
 * new player run the same course at very different velocities without the game ever changing the
 * rules on them. That headroom is what makes a time-attack game worth replaying.
 *
 * Consequences of that choice, all deliberate:
 *   - **Friction is low and acceleration is high**, so direction changes are crisp rather than
 *     floaty. Sluggish acceleration is the single fastest way to make a movement game feel bad.
 *   - **Air control is capped, not removed.** Removing it makes jumps feel like commitment to a
 *     mistake; leaving it uncapped removes the skill.
 *   - **Momentum is never silently discarded.** Sliding, dashing and wall-running all *hand back*
 *     the speed you brought into them. A mechanic that resets your speed teaches players to stop
 *     using it.
 *
 * The controller is pure: it takes an intent and a world, mutates a body, and reports events.
 * No rendering, no input devices, no audio — so the feel can be unit-tested.
 */

export const GRAVITY = 26;
export const MAX_GROUND_SPEED = 9.5;
const GROUND_ACCEL = 90;
const FRICTION = 7.5;
/** Below this, friction kills the last of the speed outright instead of asymptoting toward zero. */
const STOP_SPEED = 2.5;

/**
 * Air acceleration is applied against a tiny wish speed. This is the strafe-jumping rule: the
 * projection test lets you add speed perpendicular to your current motion indefinitely, while
 * never letting you simply accelerate forwards in mid-air.
 */
const AIR_ACCEL = 62;
const AIR_WISH_CAP = 1.9;

export const JUMP_SPEED = 9.2;
/** Grace period after walking off an edge where a jump still counts. Players always jump late. */
const COYOTE_TIME = 0.12;
/** Grace period before landing where a jump press is remembered. Players always jump early. */
const JUMP_BUFFER = 0.15;

export const DASH_SPEED = 26;
const DASH_DURATION = 0.16;
export const DASH_COOLDOWN = 1.4;

const SLIDE_ENTRY_SPEED = 4.5;
const SLIDE_FRICTION = 1.1;
/** A small kick on entry, so sliding is always worth doing rather than merely free. */
const SLIDE_BOOST = 2.6;
const SLIDE_STEER = 14;

const WALLRUN_MAX_TIME = 1.5;
const WALLRUN_MIN_SPEED = 5.5;
const WALLRUN_GRAVITY = 5.5;
/** Cap on downward drift while attached, so a wall-run reads as running, not sliding down. */
const WALLRUN_MAX_FALL = 2.2;
const WALLJUMP_OUT = 9;
const WALLJUMP_UP = 8.6;
/** Stops the player immediately re-attaching to the wall they just jumped off. */
const WALLRUN_RELOCK = 0.25;

export interface MoveIntent {
  /** -1 back, +1 forward. */
  forward: number;
  /** -1 left, +1 right. */
  strafe: number;
  yaw: number;
  jumpPressed: boolean;
  dashPressed: boolean;
  crouchHeld: boolean;
}

export interface PlayerEvents {
  jumped: boolean;
  wallJumped: boolean;
  dashed: boolean;
  slideStarted: boolean;
  wallRunStarted: boolean;
  /** Downward speed on touchdown, or 0 if the player did not land this tick. */
  landed: number;
  /** True on the tick a dash is refused because it is still cooling down. */
  dashRefused: boolean;
}

export class PlayerController {
  public readonly body: MutableBody = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    height: PLAYER_STAND_HEIGHT
  };

  public grounded = false;
  public sliding = false;
  public wallRunning = false;
  /** -1 when the wall is on the player's left, +1 on the right, 0 when not attached. */
  public wallSide = 0;
  public dashCooldown = 0;

  private coyote = 0;
  private jumpBuffer = 0;
  private dashTimer = 0;
  private dashDirX = 0;
  private dashDirZ = 0;
  private wallRunTimer = 0;
  private wallRelock = 0;
  private wallNormalX = 0;
  private wallNormalZ = 0;

  public readonly events: PlayerEvents = {
    jumped: false,
    wallJumped: false,
    dashed: false,
    slideStarted: false,
    wallRunStarted: false,
    landed: 0,
    dashRefused: false
  };

  public get speed(): number {
    return Math.hypot(this.body.vx, this.body.vz);
  }

  /** Eye height above the feet, which drops during a slide. */
  public get eyeHeight(): number {
    return this.body.height - 0.25;
  }

  public reset(x: number, y: number, z: number): void {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    b.height = PLAYER_STAND_HEIGHT;
    this.grounded = true;
    this.sliding = false;
    this.wallRunning = false;
    this.wallSide = 0;
    this.dashCooldown = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dashTimer = 0;
    this.wallRunTimer = 0;
    this.wallRelock = 0;
    this.clearEvents();
  }

  private clearEvents(): void {
    const e = this.events;
    e.jumped = false;
    e.wallJumped = false;
    e.dashed = false;
    e.slideStarted = false;
    e.wallRunStarted = false;
    e.landed = 0;
    e.dashRefused = false;
  }

  public update(intent: MoveIntent, boxes: readonly Box[], dt: number): void {
    this.clearEvents();

    const b = this.body;
    const wasGrounded = this.grounded;

    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.wallRelock = Math.max(0, this.wallRelock - dt);
    this.jumpBuffer = intent.jumpPressed ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);

    // Wish direction in world space, from the direction the camera is facing.
    const fx = yawForwardX(intent.yaw);
    const fz = yawForwardZ(intent.yaw);
    const rx = yawRightX(intent.yaw);
    const rz = yawRightZ(intent.yaw);

    let wishX = fx * intent.forward + rx * intent.strafe;
    let wishZ = fz * intent.forward + rz * intent.strafe;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 0) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    this.updateDash(intent, wishX, wishZ, fx, fz);

    if (this.dashTimer > 0) {
      // A dash overrides everything: fixed speed, no gravity, no steering. Being briefly
      // uninterruptible is what makes it feel decisive rather than like a nudge.
      this.dashTimer -= dt;
      b.vx = this.dashDirX * DASH_SPEED;
      b.vz = this.dashDirZ * DASH_SPEED;
      b.vy = 0;
    } else {
      this.updateWallRun(intent, dt);

      if (this.wallRunning) {
        b.vy = Math.max(b.vy - WALLRUN_GRAVITY * dt, -WALLRUN_MAX_FALL);
      } else if (this.grounded) {
        this.updateGround(intent, wishX, wishZ, wishLength, dt);
      } else {
        this.applyAirAccel(wishX, wishZ, wishLength, dt);
        b.vy -= GRAVITY * dt;
      }

      this.tryJump();
    }

    this.updateHeight(intent, boxes);

    const hit = moveAndCollide(boxes, b, dt);

    this.grounded = hit.grounded;
    this.wallNormalX = hit.wallNormalX;
    this.wallNormalZ = hit.wallNormalZ;

    if (this.grounded) {
      this.coyote = COYOTE_TIME;
      this.wallRunTimer = 0;
      if (!wasGrounded && hit.landingSpeed > 1) {
        this.events.landed = hit.landingSpeed;
      }
      if (this.wallRunning) this.detachWall();
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    if (hit.ceilingHit && b.vy > 0) b.vy = 0;
  }

  private updateDash(
    intent: MoveIntent,
    wishX: number,
    wishZ: number,
    facingX: number,
    facingZ: number
  ): void {
    if (!intent.dashPressed || this.dashTimer > 0) return;

    if (this.dashCooldown > 0) {
      // Surfaced so the HUD can flash the cooldown rather than silently eating the input.
      this.events.dashRefused = true;
      return;
    }

    // Dash where you are steering, or where you are looking if you are not steering at all.
    const hasWish = wishX !== 0 || wishZ !== 0;
    this.dashDirX = hasWish ? wishX : facingX;
    this.dashDirZ = hasWish ? wishZ : facingZ;
    this.dashTimer = DASH_DURATION;
    this.dashCooldown = DASH_COOLDOWN;
    this.events.dashed = true;

    if (this.wallRunning) this.detachWall();
  }

  private updateGround(
    intent: MoveIntent,
    wishX: number,
    wishZ: number,
    wishLength: number,
    dt: number
  ): void {
    const b = this.body;
    const wantsSlide = intent.crouchHeld;

    if (wantsSlide && !this.sliding && this.speed >= SLIDE_ENTRY_SPEED) {
      this.sliding = true;
      this.events.slideStarted = true;
      const s = this.speed;
      // Boost along existing motion, never a new direction: the slide rewards the speed you
      // already had rather than granting speed you did not earn.
      if (s > 0.01) {
        b.vx += (b.vx / s) * SLIDE_BOOST;
        b.vz += (b.vz / s) * SLIDE_BOOST;
      }
    } else if (!wantsSlide) {
      this.sliding = false;
    }

    if (this.sliding) {
      this.applyFriction(SLIDE_FRICTION, dt);
      // Light steering only. Full control would make sliding strictly better than running.
      if (wishLength > 0) {
        b.vx += wishX * SLIDE_STEER * dt;
        b.vz += wishZ * SLIDE_STEER * dt;
      }
      if (this.speed < SLIDE_ENTRY_SPEED * 0.55) this.sliding = false;
    } else {
      this.applyFriction(FRICTION, dt);
      this.accelerate(wishX, wishZ, wishLength * MAX_GROUND_SPEED, GROUND_ACCEL, dt);
    }
  }

  private updateWallRun(intent: MoveIntent, dt: number): void {
    const attached = this.wallRunning;
    const canAttach =
      !this.grounded &&
      this.wallRelock <= 0 &&
      this.wallRunTimer < WALLRUN_MAX_TIME &&
      this.speed >= WALLRUN_MIN_SPEED &&
      intent.forward > 0 &&
      (this.wallNormalX !== 0 || this.wallNormalZ !== 0);

    if (!canAttach) {
      if (attached) this.detachWall();
      return;
    }

    // Only run walls you are travelling *along*. Running into a wall head-on should stop you,
    // not reward you.
    const alongX = this.wallNormalX !== 0 ? Math.abs(this.body.vz) : Math.abs(this.body.vx);
    if (alongX < WALLRUN_MIN_SPEED * 0.7) {
      if (attached) this.detachWall();
      return;
    }

    this.wallRunTimer += dt;
    if (!attached) {
      this.wallRunning = true;
      this.events.wallRunStarted = true;
      // Kill any residual fall so attaching reads as catching the wall, not hitting it.
      if (this.body.vy < 0) this.body.vy *= 0.25;
    }

    // Which shoulder is the wall on? Used for camera roll and for the wall-jump direction.
    if (this.wallNormalX !== 0) {
      const right = yawRightX(intent.yaw);
      this.wallSide = Math.sign(-this.wallNormalX * right) || 1;
    } else {
      const right = yawRightZ(intent.yaw);
      this.wallSide = Math.sign(-this.wallNormalZ * right) || 1;
    }
  }

  private detachWall(): void {
    this.wallRunning = false;
    this.wallSide = 0;
  }

  private tryJump(): void {
    if (this.jumpBuffer <= 0) return;

    const b = this.body;

    if (this.wallRunning) {
      b.vy = WALLJUMP_UP;
      b.vx += this.wallNormalX * WALLJUMP_OUT;
      b.vz += this.wallNormalZ * WALLJUMP_OUT;
      this.detachWall();
      this.wallRelock = WALLRUN_RELOCK;
      this.wallRunTimer = 0;
      this.jumpBuffer = 0;
      this.events.wallJumped = true;
      return;
    }

    if (this.grounded || this.coyote > 0) {
      b.vy = JUMP_SPEED;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.sliding = false;
      this.events.jumped = true;
    }
  }

  private updateHeight(intent: MoveIntent, boxes: readonly Box[]): void {
    const b = this.body;
    const wantsLow = this.sliding || intent.crouchHeld;
    const target = wantsLow ? PLAYER_SLIDE_HEIGHT : PLAYER_STAND_HEIGHT;

    // Refuse to stand up inside a ceiling — otherwise releasing crouch in the tunnel would
    // teleport the player through the roof.
    if (target > b.height && !canStandAt(boxes, b.x, b.y, b.z)) return;
    b.height = target;
  }

  private applyFriction(friction: number, dt: number): void {
    const b = this.body;
    const speed = Math.hypot(b.vx, b.vz);
    if (speed <= 0) return;

    const drop = Math.max(speed, STOP_SPEED) * friction * dt;
    const next = Math.max(speed - drop, 0);
    const scale = next / speed;
    b.vx *= scale;
    b.vz *= scale;
  }

  private applyAirAccel(wishX: number, wishZ: number, wishLength: number, dt: number): void {
    if (wishLength <= 0) return;
    this.accelerate(wishX, wishZ, Math.min(wishLength * MAX_GROUND_SPEED, AIR_WISH_CAP), AIR_ACCEL, dt);
  }

  /**
   * Quake's acceleration primitive.
   *
   * Speed is only ever added along the wish direction, and only up to the amount that would bring
   * the *projection* of velocity onto that direction up to `wishSpeed`. When you are already
   * moving faster than that along the wish direction, nothing is added — which is why this cannot
   * run away with itself, and why turning slightly while airborne is free speed.
   */
  private accelerate(
    wishX: number,
    wishZ: number,
    wishSpeed: number,
    accel: number,
    dt: number
  ): void {
    if (wishSpeed <= 0) return;
    const b = this.body;
    const projected = b.vx * wishX + b.vz * wishZ;
    const addSpeed = wishSpeed - projected;
    if (addSpeed <= 0) return;

    const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed);
    b.vx += wishX * accelSpeed;
    b.vz += wishZ * accelSpeed;
  }
}
