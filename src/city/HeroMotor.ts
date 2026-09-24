import type { Box } from './CityLayout';

/**
 * The on-foot hero of VORIXA City (ADR-0014): third-person movement with walk, jog and sprint,
 * a jump, and collision against the city's boxes. Pure and deterministic, stepped at a fixed rate
 * by the game, so it is testable without a renderer.
 *
 * Direction conventions match Three.js: a camera with `rotation.y = yaw` looks along
 * (-sin yaw, 0, -cos yaw). The hero's model faces +z, so it turns to `facing = atan2(dx, dz)`.
 */

export const WALK_SPEED = 1.9;
export const JOG_SPEED = 4.6;
export const SPRINT_SPEED = 7.4;
export const JUMP_VELOCITY = 6.2;
export const GRAVITY = 20;
export const HERO_RADIUS = 0.35;
const ACCEL_GROUND = 26;
const ACCEL_AIR = 7;
/** Turns toward where it is going at this rate (radians per second, eased). */
const TURN_RATE = 12;
const COYOTE = 0.1;

export interface HeroIntent {
  /** Camera-relative stick: forward (+1) / back (-1), right (+1) / left (-1). */
  forward: number;
  right: number;
  /** The camera's yaw; movement is relative to it. */
  cameraYaw: number;
  sprint: boolean;
  /** Slow, deliberate walk (a light stick push, or the walk key). */
  walk: boolean;
  jumpPressed: boolean;
  /** Aiming or first person: the hero faces the camera rather than the way it moves. */
  faceCamera: boolean;
}

export type HeroFx = 'jump' | 'land';

export class HeroMotor {
  public x = 0;
  public y = 0;
  public z = 0;
  public vx = 0;
  public vy = 0;
  public vz = 0;
  public facing = 0;
  public grounded = true;
  /** Seconds in the air since leaving the ground, for the landing animation. */
  public airTime = 0;
  public readonly fx: HeroFx[] = [];
  private coyote = 0;

  public constructor(
    private readonly colliders: readonly Box[],
    private readonly bounds: Box
  ) {}

  public place(x: number, z: number, facing: number): void {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vx = this.vy = this.vz = 0;
    this.facing = facing;
    this.grounded = true;
  }

  /** Horizontal speed, m/s. */
  public get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  public step(intent: HeroIntent, dt: number): void {
    this.fx.length = 0;

    // Desired velocity from the camera-relative stick.
    const sin = Math.sin(intent.cameraYaw);
    const cos = Math.cos(intent.cameraYaw);
    let dx = -sin * intent.forward + cos * intent.right;
    let dz = -cos * intent.forward - sin * intent.right;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    const top = intent.sprint && !intent.faceCamera ? SPRINT_SPEED : intent.walk ? WALK_SPEED : JOG_SPEED;
    const tx = dx * top;
    const tz = dz * top;
    const accel = (this.grounded ? ACCEL_GROUND : ACCEL_AIR) * dt;
    this.vx += clamp(tx - this.vx, -accel * top, accel * top) * (this.grounded ? 1 : 0.6);
    this.vz += clamp(tz - this.vz, -accel * top, accel * top) * (this.grounded ? 1 : 0.6);

    // Facing: toward movement, or along the camera while aiming.
    const want = intent.faceCamera
      ? Math.atan2(-sin, -cos)
      : Math.hypot(dx, dz) > 0.05
        ? Math.atan2(dx, dz)
        : this.facing;
    this.facing += wrap(want - this.facing) * Math.min(1, TURN_RATE * dt);

    // Jump, with a little coyote time off ledges.
    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);
    if (intent.jumpPressed && this.coyote > 0) {
      this.vy = JUMP_VELOCITY;
      this.grounded = false;
      this.coyote = 0;
      this.fx.push('jump');
    }

    this.vy -= GRAVITY * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;

    this.collide();

    // Ground: the street, or the top of a box the hero is over.
    const floor = this.floorAt(this.x, this.z);
    if (this.y <= floor) {
      if (!this.grounded) {
        this.fx.push('land');
      }
      this.y = floor;
      this.vy = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      if (this.grounded && this.y - floor > 0.05) this.grounded = false;
      if (!this.grounded) this.airTime += dt;
    }
  }

  private floorAt(x: number, z: number): number {
    let floor = 0;
    for (const b of this.colliders) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && this.y >= b.height - 0.3) floor = Math.max(floor, b.height);
    }
    return floor;
  }

  /** Pushes the hero's circle out of every box it overlaps, and keeps it inside the district. */
  private collide(): void {
    const r = HERO_RADIUS;
    for (const b of this.colliders) {
      if (this.y >= b.height - 0.05) continue;
      const cx = clamp(this.x, b.minX, b.maxX);
      const cz = clamp(this.z, b.minZ, b.maxZ);
      const ox = this.x - cx;
      const oz = this.z - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        this.x = cx + (ox / d) * r;
        this.z = cz + (oz / d) * r;
        // Remove the velocity into the wall so the hero slides along it.
        const nx = ox / d;
        const nz = oz / d;
        const into = this.vx * nx + this.vz * nz;
        if (into < 0) {
          this.vx -= into * nx;
          this.vz -= into * nz;
        }
      } else {
        // Centre inside the box: leave by the nearest side.
        const exits = [this.x - b.minX, b.maxX - this.x, this.z - b.minZ, b.maxZ - this.z];
        const k = exits.indexOf(Math.min(...exits));
        if (k === 0) this.x = b.minX - r;
        else if (k === 1) this.x = b.maxX + r;
        else if (k === 2) this.z = b.minZ - r;
        else this.z = b.maxZ + r;
      }
    }
    const w = this.bounds;
    if (this.x < w.minX + r) (this.x = w.minX + r), (this.vx = Math.max(0, this.vx));
    if (this.x > w.maxX - r) (this.x = w.maxX - r), (this.vx = Math.min(0, this.vx));
    if (this.z < w.minZ + r) (this.z = w.minZ + r), (this.vz = Math.max(0, this.vz));
    if (this.z > w.maxZ - r) (this.z = w.maxZ - r), (this.vz = Math.min(0, this.vz));
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wraps an angle difference into (-π, π]. */
export function wrap(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}
