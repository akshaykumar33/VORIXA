import type { Box } from './CityLayout';

/**
 * An arcade car for VORIXA City (ADR-0014, phase 3): GTA-style handling rather than a simulation.
 *
 * - Throttle, brake and reverse; top speed and acceleration per model.
 * - Steering that tightens at low speed and calms at high speed, turning about the rear axle.
 * - Grip: sideways velocity is scrubbed off quickly, far less with the handbrake on, which is what
 *   lets the car slide into a drift.
 * - Collision: the car is two circles (front and back) pushed out of the city's boxes. Hitting a
 *   wall costs speed and health in proportion to the impact.
 *
 * Headings follow the hero's convention: the model faces +z at heading 0, so it moves along
 * (sin h, cos h).
 */

export interface VehicleSpec {
  model: string;
  maxSpeed: number;
  accel: number;
  /** Radius of each collision circle; the circles sit at ±`reach` along the car. */
  radius: number;
  reach: number;
}

export const VEHICLE_SPECS: Record<string, VehicleSpec> = {
  SportsCar: { model: 'SportsCar', maxSpeed: 38, accel: 13, radius: 0.92, reach: 1.1 },
  SportsCar2: { model: 'SportsCar2', maxSpeed: 36, accel: 12, radius: 0.95, reach: 1.1 },
  NormalCar1: { model: 'NormalCar1', maxSpeed: 28, accel: 8, radius: 0.92, reach: 1.2 },
  NormalCar2: { model: 'NormalCar2', maxSpeed: 27, accel: 8, radius: 0.85, reach: 0.9 },
  SUV: { model: 'SUV', maxSpeed: 27, accel: 7.5, radius: 1.08, reach: 1.15 },
  Taxi: { model: 'Taxi', maxSpeed: 29, accel: 8.5, radius: 0.92, reach: 1.2 },
  Cop: { model: 'Cop', maxSpeed: 34, accel: 11, radius: 0.92, reach: 1.05 }
};

export interface DriveIntent {
  /** -1 (brake / reverse) … +1 (full throttle). */
  throttle: number;
  /** -1 left … +1 right. */
  steer: number;
  handbrake: boolean;
}

export type VehicleFx = { type: 'crash'; impact: number; x: number; z: number } | { type: 'wrecked' };

const BRAKE = 22;
const REVERSE_MAX = 9;
const DRAG = 0.35;
const ROLLING = 1.6;
const GRIP = 9;
const DRIFT_GRIP = 1.4;
const MAX_STEER = 0.62;
const WHEELBASE = 2.4;

export class Vehicle {
  public x = 0;
  public z = 0;
  public heading = 0;
  /** Velocity in world space. */
  public vx = 0;
  public vz = 0;
  /** Current wheel angle, radians (eased toward the stick). */
  public steer = 0;
  public health = 100;
  public occupied = false;
  /** Perks: top-speed and damage multipliers for whoever is driving. */
  public speedScale = 1;
  public damageScale = 1;
  public readonly fx: VehicleFx[] = [];

  public constructor(
    public readonly id: number,
    public readonly spec: VehicleSpec,
    private readonly colliders: readonly Box[],
    private readonly bounds: Box
  ) {}

  public place(x: number, z: number, heading: number): this {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = this.vz = 0;
    return this;
  }

  /** Signed speed along the car's nose, m/s (negative in reverse). */
  public get forwardSpeed(): number {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  public get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** Sideways speed, m/s: how much the car is sliding. */
  public get slip(): number {
    return this.vx * Math.cos(this.heading) - this.vz * Math.sin(this.heading);
  }

  public step(intent: DriveIntent, dt: number): void {
    this.fx.length = 0;
    const s = this.spec;
    const wrecked = this.health <= 0;
    let along = this.forwardSpeed;
    let side = this.slip;

    // Engine, brakes, reverse.
    const throttle = wrecked ? 0 : intent.throttle;
    if (throttle > 0) {
      const top = s.maxSpeed * this.speedScale;
      along += throttle * s.accel * this.speedScale * (1 - Math.max(0, along) / top) * dt * (along < 0 ? 3 : 1);
    } else if (throttle < 0) {
      if (along > 0.5) along = Math.max(0, along + throttle * BRAKE * dt);
      else along = Math.max(-REVERSE_MAX, along + throttle * s.accel * 0.6 * dt);
    }
    if (intent.handbrake) along -= Math.sign(along) * Math.min(Math.abs(along), BRAKE * 0.45 * dt);
    // Air and rolling resistance.
    along -= Math.sign(along) * Math.min(Math.abs(along), (ROLLING + DRAG * along * along * 0.02) * dt);

    // Grip: scrub the sideways slide.
    const grip = intent.handbrake ? DRIFT_GRIP : GRIP;
    side -= side * Math.min(1, grip * dt);

    // Steering: eased, and gentler at speed so the car stays drivable flat out.
    const target = (wrecked ? 0 : intent.steer) * MAX_STEER * (1 - Math.min(0.7, Math.abs(along) / 60));
    this.steer += (target - this.steer) * Math.min(1, 8 * dt);
    // Back to world velocity in the frame it was measured in. The body then turns under it, so a
    // turn opens a sideways slip that grip scrubs off next step; with the handbrake, it lingers.
    const nx = Math.sin(this.heading);
    const nz = Math.cos(this.heading);
    this.vx = nx * along + nz * side;
    this.vz = nz * along - nx * side;
    const yawRate = (along / WHEELBASE) * Math.tan(this.steer) * (intent.handbrake ? 1.35 : 1);
    this.heading += yawRate * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.collide();
  }

  /** Where the two collision circles are. */
  public circles(): [number, number, number, number] {
    const fx = Math.sin(this.heading) * this.spec.reach;
    const fz = Math.cos(this.heading) * this.spec.reach;
    return [this.x + fx, this.z + fz, this.x - fx, this.z - fz];
  }

  private collide(): void {
    const r = this.spec.radius;
    const [ax, az, bx, bz] = this.circles();
    let pushX = 0;
    let pushZ = 0;
    let normalX = 0;
    let normalZ = 0;
    for (const [cx0, cz0] of [[ax, az], [bx, bz]] as const) {
      for (const b of this.colliders) {
        if (b.height < 0.4) continue;
        const cx = Math.max(b.minX, Math.min(cx0, b.maxX));
        const cz = Math.max(b.minZ, Math.min(cz0, b.maxZ));
        const ox = cx0 - cx;
        const oz = cz0 - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const depth = r - d;
        const nx = d2 > 1e-12 ? ox / d : 0;
        const nz = d2 > 1e-12 ? oz / d : 1;
        pushX += nx * depth;
        pushZ += nz * depth;
        normalX += nx;
        normalZ += nz;
      }
    }
    // The district's edge is a wall too.
    const w = this.bounds;
    for (const cx of [ax, bx]) {
      if (cx - r < w.minX) (pushX += w.minX - (cx - r)), (normalX += 1);
      if (cx + r > w.maxX) (pushX -= cx + r - w.maxX), (normalX -= 1);
    }
    for (const cz of [az, bz]) {
      if (cz - r < w.minZ) (pushZ += w.minZ - (cz - r)), (normalZ += 1);
      if (cz + r > w.maxZ) (pushZ -= cz + r - w.maxZ), (normalZ -= 1);
    }
    if (pushX === 0 && pushZ === 0) return;
    this.x += pushX;
    this.z += pushZ;
    const n = Math.hypot(normalX, normalZ) || 1;
    const ux = normalX / n;
    const uz = normalZ / n;
    const into = this.vx * ux + this.vz * uz;
    if (into < 0) {
      // Lose the speed into the wall, with a little bounce, and take damage for hard hits.
      this.vx -= into * ux * 1.3;
      this.vz -= into * uz * 1.3;
      this.vx *= 0.8;
      this.vz *= 0.8;
      const impact = -into;
      if (impact > 3) {
        const before = this.health;
        this.health = Math.max(0, this.health - (impact - 3) * 2.2 * this.damageScale);
        this.fx.push({ type: 'crash', impact, x: this.x - ux * r, z: this.z - uz * r });
        if (before > 0 && this.health <= 0) this.fx.push({ type: 'wrecked' });
      }
    }
  }
}

/** The car as a box for bullets and the camera: its footprint, 1.4 m tall. */
export function coverBox(v: Vehicle, out: Box): Box {
  const half = v.spec.reach + v.spec.radius * 0.8;
  const hx = Math.abs(Math.sin(v.heading)) * half + Math.abs(Math.cos(v.heading)) * v.spec.radius * 0.95;
  const hz = Math.abs(Math.cos(v.heading)) * half + Math.abs(Math.sin(v.heading)) * v.spec.radius * 0.95;
  out.minX = v.x - hx;
  out.maxX = v.x + hx;
  out.minZ = v.z - hz;
  out.maxZ = v.z + hz;
  out.height = 1.4;
  return out;
}

/** Pushes two cars apart when their circles overlap, trading some momentum. */
export function separate(a: Vehicle, b: Vehicle): number {
  const ca = a.circles();
  const cb = b.circles();
  let hit = 0;
  const r = a.spec.radius + b.spec.radius;
  for (let i = 0; i < 4; i += 2) {
    for (let j = 0; j < 4; j += 2) {
      const dx = ca[i] - cb[j];
      const dz = ca[i + 1] - cb[j + 1];
      const d = Math.hypot(dx, dz);
      if (d >= r || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      const push = (r - d) / 2;
      a.x += nx * push;
      a.z += nz * push;
      b.x -= nx * push;
      b.z -= nz * push;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel < 0) {
        const j2 = -rel * 0.6;
        a.vx += nx * j2;
        a.vz += nz * j2;
        b.vx -= nx * j2;
        b.vz -= nz * j2;
        hit = Math.max(hit, -rel);
      }
    }
  }
  return hit;
}
