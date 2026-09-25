import { raySphere } from './Combat';
import type { Box } from './CityLayout';

/**
 * Things that go bang in VORIXA City (ADR-0014, Far Cry layer): explosive barrels, propane tanks,
 * the blasts they make, and the fires those leave. Pure data and rules, stepped at the game's
 * fixed rate, so a chain reaction is testable without a renderer.
 *
 * - A **barrel** shot hard enough goes up at once; a lighter hit, or fire, lights it, and it burns
 *   for a moment first.
 * - A **propane tank** hit by anything starts to hiss and blows a second and a half later, bigger
 *   than a barrel.
 * - Every **blast** hurts what is near it, in proportion to how near, and sets off the explosives
 *   it reaches, each a beat after the last, so a row of barrels goes off as a rolling chain rather
 *   than one flash. Cars are sources too: a wrecked car is a blast (the game calls `blast`).
 * - Every blast leaves a **fire** that burns for a while, hurts anyone standing in it, and lights
 *   any explosive it touches: the chain can jump gaps.
 */

export type ExplosiveKind = 'barrel' | 'propane';
export type BlastSource = ExplosiveKind | 'car';

interface Spec {
  hp: number;
  radius: number;
  power: number;
  /** Seconds from being lit (a light hit, or fire) to the blast. */
  fuse: number;
  /** Height of the object, and the radius of the sphere bullets hit. */
  height: number;
  hitRadius: number;
  fire: { radius: number; life: number };
}

export const EXPLOSIVES: Record<ExplosiveKind, Spec> = {
  barrel: { hp: 30, radius: 6.5, power: 160, fuse: 1.3, height: 0.92, hitRadius: 0.4, fire: { radius: 2.2, life: 10 } },
  propane: { hp: 10, radius: 8.5, power: 210, fuse: 1.6, height: 1.25, hitRadius: 0.32, fire: { radius: 3, life: 7 } }
};

/** A wrecked car's blast. */
export const CAR_BLAST = { radius: 7.5, power: 180, fire: { radius: 2.8, life: 14 } };

/** Damage per second to anyone standing in a fire. */
export const FIRE_DPS = 28;

export interface Explosive {
  id: number;
  kind: ExplosiveKind;
  x: number;
  z: number;
  hp: number;
  /** Seconds until it blows; negative while it is not lit. */
  fuse: number;
  alive: boolean;
}

export interface Blast {
  x: number;
  y: number;
  z: number;
  radius: number;
  power: number;
  source: BlastSource;
}

export interface Fire {
  id: number;
  x: number;
  z: number;
  radius: number;
  /** Seconds left burning. */
  life: number;
  /** Seconds it burns in all, for the flames to die down toward the end. */
  total: number;
}

export type ChaosFx =
  | { type: 'lit'; explosive: Explosive }
  | { type: 'blast'; blast: Blast }
  | { type: 'fireOut'; fire: Fire };

/** How much of a blast reaches a point `d` metres from its centre: 1 at the centre, 0 at the edge. */
export function falloff(d: number, radius: number): number {
  return d >= radius ? 0 : 1 - d / radius;
}

export class Chaos {
  public readonly explosives: Explosive[] = [];
  public readonly fires: Fire[] = [];
  /** What happened this step, and anything since the last one (a shot lighting a tank). */
  public readonly fx: ChaosFx[] = [];
  private seen = 0;
  private nextId = 1;
  private nextFire = 1;

  public place(kind: ExplosiveKind, x: number, z: number): Explosive {
    const e: Explosive = { id: this.nextId++, kind, x, z, hp: EXPLOSIVES[kind].hp, fuse: -1, alive: true };
    this.explosives.push(e);
    return e;
  }

  /** The solid box of a standing explosive: it blocks bullets and bodies until it blows. */
  public static box(e: Explosive): Box {
    const s = EXPLOSIVES[e.kind];
    const r = s.hitRadius * 0.6;
    return { minX: e.x - r, maxX: e.x + r, minZ: e.z - r, maxZ: e.z + r, height: s.height * 0.87 };
  }

  /** The nearest standing explosive along a ray, within `max`. */
  public trace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; explosive: Explosive | null } {
    let best = max;
    let hit: Explosive | null = null;
    for (const e of this.explosives) {
      if (!e.alive) continue;
      const s = EXPLOSIVES[e.kind];
      const t = raySphere(ox, oy, oz, dx, dy, dz, e.x, s.height / 2, e.z, Math.max(s.hitRadius, s.height / 2) * 1.05);
      if (t < best) {
        best = t;
        hit = e;
      }
    }
    return { t: best, explosive: hit };
  }

  /** A bullet (or anything else) hits an explosive. */
  public damage(e: Explosive, amount: number): void {
    if (!e.alive) return;
    e.hp -= amount;
    if (e.kind === 'propane' || e.hp > 0) this.light(e, EXPLOSIVES[e.kind].fuse);
    else this.light(e, 0.02);
  }

  /** Sets an explosive going, `fuse` seconds from now (or sooner, if it was already lit). */
  public light(e: Explosive, fuse: number): void {
    if (!e.alive) return;
    const wasLit = e.fuse >= 0;
    e.fuse = wasLit ? Math.min(e.fuse, fuse) : fuse;
    if (!wasLit) this.fx.push({ type: 'lit', explosive: e });
  }

  /** A blast from outside (a car going up): hurts, chains and burns like any other. */
  public blast(x: number, z: number, radius: number, power: number, source: BlastSource, fire: { radius: number; life: number }): Blast {
    const b: Blast = { x, y: 0.6, z, radius, power, source };
    this.fx.push({ type: 'blast', blast: b });
    for (const e of this.explosives) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      const k = falloff(d, radius);
      if (k <= 0) continue;
      e.hp -= power * k;
      // Each link of a chain goes a beat after the last, further ones later.
      this.light(e, e.hp <= 0 ? 0.12 + d * 0.035 : EXPLOSIVES[e.kind].fuse * 0.6);
    }
    this.fires.push({ id: this.nextFire++, x, z, radius: fire.radius, life: fire.life, total: fire.life });
    return b;
  }

  /** Flames without a blast: a wrecked car burning, before it goes up. */
  public ignite(x: number, z: number, radius: number, life: number): Fire {
    const f: Fire = { id: this.nextFire++, x, z, radius, life, total: life };
    this.fires.push(f);
    return f;
  }

  /**
   * Rising air over the fires at (x, z), `height` metres up (m/s upward): strong low down and
   * close in, fading with distance and height. A glider rides it up.
   */
  public updraft(x: number, z: number, height: number): number {
    let lift = 0;
    for (const f of this.fires) {
      const reach = f.radius * 2.4;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < reach) lift = Math.max(lift, 9 * (1 - d / reach) * Math.max(0, 1 - height / 45));
    }
    return lift;
  }

  /** Whether (x, z) is inside a fire. */
  public burning(x: number, z: number): boolean {
    return this.fires.some((f) => f.life > 0 && Math.hypot(x - f.x, z - f.z) < f.radius);
  }

  public get lit(): number {
    return this.explosives.filter((e) => e.alive && e.fuse >= 0).length;
  }

  public step(dt: number): void {
    this.fx.splice(0, this.seen);
    for (const e of this.explosives) {
      if (!e.alive || e.fuse < 0) continue;
      e.fuse -= dt;
      if (e.fuse > 0) continue;
      e.alive = false;
      const s = EXPLOSIVES[e.kind];
      this.blast(e.x, e.z, s.radius, s.power, e.kind, s.fire);
    }
    for (const f of this.fires) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        this.fx.push({ type: 'fireOut', fire: f });
        continue;
      }
      // Flames reaching an explosive light it.
      for (const e of this.explosives) {
        if (e.alive && e.fuse < 0 && Math.hypot(e.x - f.x, e.z - f.z) < f.radius + 0.4) this.light(e, EXPLOSIVES[e.kind].fuse);
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) if (this.fires[i].life <= 0) this.fires.splice(i, 1);
    this.seen = this.fx.length;
  }
}
