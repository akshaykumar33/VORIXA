import type { District } from './CityLayout';
import { PITCH, INTERSECTION } from './CityLayout';
import { raySphere } from './Combat';

/**
 * The people who live in VORIXA City (ADR-0014, phase 4): citizens who walk the sidewalks, flinch
 * and run from gunfire, and can be hurt, and the HEAT they bring down on the hero when they are.
 * Pure and deterministic, stepped with everything else.
 *
 * Each citizen walks up and down one stretch of sidewalk. Gunfire within earshot sends them
 * running away from the shooter; after a while out of danger they calm down and walk again.
 */

export interface Citizen {
  id: number;
  x: number;
  z: number;
  facing: number;
  /** The stretch of sidewalk they walk: along x (dir 0) or z (dir 1), at a fixed across. */
  dir: 0 | 1;
  across: number;
  from: number;
  to: number;
  heading: 1 | -1;
  speed: number;
  panic: number;
  alive: boolean;
  deadTime: number;
}

export type LifeFx = { type: 'citizenDown'; citizen: Citizen; byCar: boolean } | { type: 'scream'; x: number; z: number };

/** HEAT: the wanted level, 0–5 stars. */
export const MAX_HEAT = 5;
/** Seconds without an incident before one star cools off. */
export const HEAT_COOLDOWN = 22;
const WALK = 1.35;
const RUN = 5.2;
const HEARING = 30;
const PANIC_TIME = 9;

function hash(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class CityLife {
  public readonly citizens: Citizen[] = [];
  public readonly fx: LifeFx[] = [];
  /** Stars, 0..5, fractional while it builds; the HUD shows the whole stars. */
  public heat = 0;
  private calm = 0;

  public constructor(district: District, count = 28) {
    const roads = district.roadsX;
    for (let n = 0; n < count; n++) {
      const dir = (hash(n, 1) < 0.5 ? 0 : 1) as 0 | 1;
      const line = Math.floor(hash(n, 2) * roads);
      const block = Math.floor(hash(n, 3) * (roads - 1));
      const side = hash(n, 4) < 0.5 ? -1 : 1;
      // The building side of the sidewalk, clear of the planters at the kerb.
      const across = line * PITCH + side * (8.32 + hash(n, 5) * 0.12);
      const from = block * PITCH + INTERSECTION / 2 + 1;
      const to = (block + 1) * PITCH - INTERSECTION / 2 - 1;
      const along = from + hash(n, 6) * (to - from);
      const c: Citizen = {
        id: n, dir, across, from, to, heading: hash(n, 7) < 0.5 ? 1 : -1, speed: WALK * (0.85 + hash(n, 8) * 0.3),
        x: 0, z: 0, facing: 0, panic: 0, alive: true, deadTime: 0
      };
      this.setAlong(c, along);
      this.citizens.push(c);
    }
  }

  private along(c: Citizen): number {
    return c.dir === 0 ? c.x : c.z;
  }

  private setAlong(c: Citizen, a: number): void {
    if (c.dir === 0) {
      c.x = a;
      c.z = c.across;
    } else {
      c.x = c.across;
      c.z = a;
    }
    c.facing = c.dir === 0 ? (c.heading > 0 ? Math.PI / 2 : -Math.PI / 2) : c.heading > 0 ? 0 : Math.PI;
  }

  /** A gunshot at (x, z): everyone in earshot panics and runs away from it. */
  public gunshot(x: number, z: number): void {
    for (const c of this.citizens) {
      if (!c.alive || Math.hypot(c.x - x, c.z - z) > HEARING) continue;
      if (c.panic <= 0) this.fx.push({ type: 'scream', x: c.x, z: c.z });
      c.panic = PANIC_TIME;
      // Run along their sidewalk, away from the shot.
      const away = this.along(c) - (c.dir === 0 ? x : z);
      c.heading = away >= 0 ? 1 : -1;
    }
  }

  /** Nearest citizen hit by a ray, as a distance, or Infinity. */
  public trace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): { distance: number; citizen: Citizen | null } {
    let best = Infinity;
    let who: Citizen | null = null;
    for (const c of this.citizens) {
      if (!c.alive) continue;
      for (const [y, r] of [[1.6, 0.16], [1.2, 0.28], [0.75, 0.25], [0.35, 0.2]] as const) {
        const t = raySphere(ox, oy, oz, dx, dy, dz, c.x, y, c.z, r);
        if (t < best) {
          best = t;
          who = c;
        }
      }
    }
    return { distance: best, citizen: who };
  }

  public hurt(c: Citizen, byCar: boolean): void {
    if (!c.alive) return;
    c.alive = false;
    c.deadTime = 0;
    this.fx.push({ type: 'citizenDown', citizen: c, byCar });
    this.raiseHeat(1);
    this.gunshot(c.x, c.z);
  }

  /** A blast: those close enough are killed, everyone in earshot runs. */
  public blast(x: number, z: number, radius: number): void {
    for (const c of this.citizens) if (c.alive && Math.hypot(c.x - x, c.z - z) < radius * 0.6) this.hurt(c, false);
    this.gunshot(x, z);
  }

  /** Raises the wanted level by `stars` (fractions build up), and resets the cool-down. */
  public raiseHeat(stars: number): void {
    this.heat = Math.min(MAX_HEAT, this.heat + stars);
    this.calm = 0;
  }

  public get stars(): number {
    return Math.floor(this.heat + 1e-9);
  }

  /** A car at speed hits whoever is in its path. */
  public runOver(x: number, z: number, radius: number, speed: number): number {
    if (speed < 4) return 0;
    let hits = 0;
    for (const c of this.citizens) {
      if (!c.alive || Math.hypot(c.x - x, c.z - z) > radius + 0.35) continue;
      this.hurt(c, true);
      hits++;
    }
    return hits;
  }

  /**
   * @param seenByPolice Police can see the hero: heat does not cool while they can.
   */
  public step(dt: number, seenByPolice: boolean): void {
    this.fx.length = 0;
    this.calm += dt;
    if (!seenByPolice && this.heat > 0 && this.calm > HEAT_COOLDOWN) {
      this.heat = Math.max(0, Math.ceil(this.heat) - 1);
      this.calm = 0;
    }
    for (const c of this.citizens) {
      if (!c.alive) {
        c.deadTime += dt;
        // Paramedics come for everyone eventually: the street refills.
        if (c.deadTime > 30) {
          c.alive = true;
          c.panic = 0;
          this.setAlong(c, c.from + hash(c.id, Math.floor(c.deadTime)) * (c.to - c.from));
        }
        continue;
      }
      c.panic = Math.max(0, c.panic - dt);
      const speed = c.panic > 0 ? RUN : c.speed;
      let a = this.along(c) + c.heading * speed * dt;
      // Turn around at the end of their stretch.
      if (a > c.to) {
        a = c.to;
        c.heading = -1;
      } else if (a < c.from) {
        a = c.from;
        c.heading = 1;
      }
      this.setAlong(c, a);
    }
  }
}
