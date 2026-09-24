import { HeroMotor, type HeroIntent } from './HeroMotor';
import { raySphere, type Combat, type Enemy } from './Combat';
import type { Box } from './CityLayout';
import type { Wilds } from './Wilds';

/**
 * The animals of the wild country (ADR-0014, Far Cry layer). Pure and deterministic, stepped with
 * the fight.
 *
 * - **Deer and foxes** graze and wander; anything alarming (the hero close by, a shot, a blast, a
 *   wolf) sends them bolting away.
 * - **Stags** are deer until they are hurt. Wound one and it turns and charges.
 * - **Wolves** run in packs and hunt whatever is nearest: deer, the hero, or the Choir. A wolf pack
 *   let loose near an outpost is a weapon, as in Far Cry.
 *
 * A dead animal can be skinned for its pelt by walking over it: cash, as the crew's side trade.
 */

export type AnimalKind = 'wolf' | 'deer' | 'stag' | 'fox';
export type AnimalState = 'graze' | 'wander' | 'flee' | 'hunt' | 'attack' | 'dead';

interface Spec {
  hp: number;
  walk: number;
  run: number;
  /** Metres at which it notices the hero. */
  wary: number;
  /** Hit spheres: [height, radius] along its body (and a head). */
  body: { y: number; r: number; forward: number }[];
  bite?: { damage: number; every: number; reach: number };
  pelt: number;
}

export const ANIMALS: Record<AnimalKind, Spec> = {
  wolf: { hp: 70, walk: 1.6, run: 9.5, wary: 30, pelt: 150, bite: { damage: 11, every: 1.1, reach: 1.7 },
    body: [{ y: 0.55, r: 0.35, forward: 0 }, { y: 0.55, r: 0.3, forward: 0.45 }, { y: 0.75, r: 0.2, forward: 0.85 }] },
  deer: { hp: 60, walk: 1.4, run: 11, wary: 22, pelt: 80,
    body: [{ y: 0.85, r: 0.38, forward: 0 }, { y: 0.9, r: 0.34, forward: 0.5 }, { y: 1.45, r: 0.2, forward: 0.8 }] },
  stag: { hp: 130, walk: 1.4, run: 10, wary: 25, pelt: 220, bite: { damage: 24, every: 1.6, reach: 2.1 },
    body: [{ y: 0.95, r: 0.45, forward: 0 }, { y: 1.0, r: 0.4, forward: 0.6 }, { y: 1.6, r: 0.24, forward: 0.95 }] },
  fox: { hp: 30, walk: 1.3, run: 8.5, wary: 16, pelt: 60,
    body: [{ y: 0.35, r: 0.22, forward: 0 }, { y: 0.4, r: 0.15, forward: 0.4 }] }
};

/** Seconds a frightened animal keeps running. */
const FLEE_TIME = 6;
/** Seconds before a dead or skinned animal is replaced by a new one, somewhere out of sight. */
const RESPAWN_AFTER = 90;

export interface Animal {
  id: number;
  kind: AnimalKind;
  motor: HeroMotor;
  hp: number;
  state: AnimalState;
  /** Seconds left in the current state (grazing, wandering, fleeing). */
  timer: number;
  /** Where it is heading (wandering, fleeing). */
  goalX: number;
  goalZ: number;
  /** Who a wolf (or an angry stag) is after. */
  prey: { kind: 'hero' } | { kind: 'enemy'; enemy: Enemy } | { kind: 'animal'; animal: Animal } | null;
  cooldown: number;
  /** Seconds since it last got hurt, for the flinch. */
  hitTime: number;
  deadTime: number;
  skinned: boolean;
  /** Which pack (wolves), so a pack hunts together. */
  pack: number;
  /** Set when it is in the middle of a bite (for the attack animation). */
  biting: number;
}

export type WildFx =
  | { type: 'bite'; animal: Animal; target: 'hero' | 'enemy' | 'animal'; x: number; z: number }
  | { type: 'hurt'; animal: Animal; x: number; y: number; z: number }
  | { type: 'killed'; animal: Animal }
  | { type: 'pelt'; animal: Animal; cash: number }
  | { type: 'howl'; animal: Animal };

function hash(n: number, salt: number): number {
  let h = (Math.imul(n, 374761393) + Math.imul(salt, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Wildlife {
  public readonly animals: Animal[] = [];
  public readonly fx: WildFx[] = [];
  private nextId = 1;
  private tick = 0;
  private readonly intent: HeroIntent = { forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false };
  private readonly respawns: { kind: AnimalKind; pack: number; at: number }[] = [];
  private clock = 0;

  public constructor(
    private readonly wilds: Wilds,
    private readonly colliders: readonly Box[],
    private readonly bounds: Box,
    populate = true
  ) {
    if (!populate) return;
    // Three wolf packs in the woods, deer herds in the meadows, a few stags and foxes.
    for (let p = 0; p < 3; p++) for (let i = 0; i < 3; i++) this.spawnSomewhere('wolf', p + 1, 1000 + p * 10 + i);
    for (let i = 0; i < 9; i++) this.spawnSomewhere('deer', 0, 2000 + i);
    for (let i = 0; i < 3; i++) this.spawnSomewhere('stag', 0, 3000 + i);
    for (let i = 0; i < 5; i++) this.spawnSomewhere('fox', 0, 4000 + i);
  }

  /** A spot in the wild, away from the city's edge, the trail and the lake. */
  private spot(seed: number, packSeed = 0): { x: number; z: number } {
    const w = this.wilds;
    for (let k = 0; k < 40; k++) {
      const s = packSeed ? packSeed : seed + k * 7;
      let x = w.minX + 6 + hash(s, 1 + k) * (w.maxX - w.minX - 12);
      let z = w.z0 + 40 + hash(s, 2 + k) * (w.z1 - w.z0 - 50);
      if (packSeed) {
        // Packs keep together.
        x += (hash(seed, 3) - 0.5) * 6;
        z += (hash(seed, 4) - 0.5) * 6;
      }
      if (Math.hypot(x - w.lake.x, z - w.lake.z) < w.lake.radius + 4) continue;
      if (this.colliders.some((c) => x > c.minX - 0.5 && x < c.maxX + 0.5 && z > c.minZ - 0.5 && z < c.maxZ + 0.5)) continue;
      return { x, z };
    }
    return { x: (w.minX + w.maxX) / 2, z: w.z0 + 60 };
  }

  public spawn(kind: AnimalKind, x: number, z: number, pack = 0): Animal {
    const motor = new HeroMotor(this.colliders, this.bounds, this.wilds.ground);
    motor.place(x, z, hash(this.nextId, 9) * Math.PI * 2);
    const a: Animal = {
      id: this.nextId++, kind, motor, hp: ANIMALS[kind].hp, state: 'graze', timer: 2 + hash(this.nextId, 5) * 6,
      goalX: x, goalZ: z, prey: null, cooldown: 0, hitTime: 99, deadTime: 0, skinned: false, pack, biting: 0
    };
    this.animals.push(a);
    return a;
  }

  private spawnSomewhere(kind: AnimalKind, pack: number, seed: number): Animal {
    const p = this.spot(seed, pack ? 5000 + pack * 97 + Math.floor(this.clock) : 0);
    return this.spawn(kind, p.x, p.z, pack);
  }

  /** Nearest living animal along a ray, within `max` (for bullets). */
  public trace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; animal: Animal | null; head: boolean } {
    let best = max;
    let hit: Animal | null = null;
    let head = false;
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const m = a.motor;
      const fx = Math.sin(m.facing);
      const fz = Math.cos(m.facing);
      ANIMALS[a.kind].body.forEach((s, i, all) => {
        const t = raySphere(ox, oy, oz, dx, dy, dz, m.x + fx * s.forward, m.y + s.y, m.z + fz * s.forward, s.r);
        if (t < best) {
          best = t;
          hit = a;
          head = i === all.length - 1 && all.length > 2;
        }
      });
    }
    return { t: best, animal: hit, head };
  }

  /** Something hurts an animal (a bullet, a blast, fire, a wolf). */
  public hurt(a: Animal, amount: number, fromX: number, fromZ: number, byHero: boolean): void {
    if (a.state === 'dead') return;
    a.hp -= amount;
    a.hitTime = 0;
    this.fx.push({ type: 'hurt', animal: a, x: a.motor.x, y: a.motor.y + 0.8, z: a.motor.z });
    if (a.hp <= 0) {
      a.state = 'dead';
      a.deadTime = 0;
      this.fx.push({ type: 'killed', animal: a });
      this.respawns.push({ kind: a.kind, pack: a.pack, at: this.clock + RESPAWN_AFTER });
      return;
    }
    // A wounded stag (or a wolf) turns on whoever hurt it; everything else runs.
    if (byHero && (a.kind === 'stag' || a.kind === 'wolf')) {
      a.state = 'hunt';
      a.prey = { kind: 'hero' };
    } else if (a.kind !== 'wolf') this.scare(a, fromX, fromZ);
  }

  private scare(a: Animal, fromX: number, fromZ: number): void {
    if (a.state === 'dead' || a.state === 'hunt' || a.state === 'attack') return;
    const away = Math.atan2(a.motor.x - fromX, a.motor.z - fromZ) + (hash(a.id, this.tick) - 0.5) * 0.8;
    a.state = 'flee';
    a.timer = FLEE_TIME;
    a.goalX = a.motor.x + Math.sin(away) * 60;
    a.goalZ = a.motor.z + Math.cos(away) * 60;
  }

  /** A loud noise: prey within `radius` bolts; wolves come to see. */
  public noise(x: number, z: number, radius: number): void {
    for (const a of this.animals) {
      if (a.state === 'dead' || Math.hypot(a.motor.x - x, a.motor.z - z) > radius) continue;
      if (a.kind === 'wolf') {
        if (a.state === 'graze' || a.state === 'wander') {
          a.state = 'wander';
          a.goalX = x;
          a.goalZ = z;
          a.timer = 12;
        }
      } else this.scare(a, x, z);
    }
  }

  /** A blast: hurts in proportion to distance, and frightens everything that survives it. */
  public blast(x: number, z: number, radius: number, power: number): void {
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const d = Math.hypot(a.motor.x - x, a.motor.z - z);
      if (d < radius) this.hurt(a, power * (1 - d / radius), x, z, true);
    }
    this.noise(x, z, 70);
  }

  /** Fire burns whatever stands in it. */
  public scorch(burning: (x: number, z: number) => boolean, dps: number, dt: number): void {
    for (const a of this.animals) if (a.state !== 'dead' && burning(a.motor.x, a.motor.z)) this.hurt(a, dps * dt, a.motor.x, a.motor.z, false);
  }

  /**
   * @param hero The hero (hunted by wolves, avoided by prey).
   * @param combat The fight: wolves hunt the Choir too, and bite them.
   * @param heroAlive False while the hero is down: nothing hunts a body.
   */
  public step(dt: number, hero: HeroMotor, combat: Combat, heroAlive: boolean): void {
    this.fx.length = 0;
    this.tick++;
    this.clock += dt;
    for (const a of this.animals) this.think(a, dt, hero, combat, heroAlive);
    // Pelts: walk over a dead animal to skin it.
    for (const a of this.animals) {
      if (a.state !== 'dead' || a.skinned || a.deadTime < 0.8) continue;
      if (Math.hypot(a.motor.x - hero.x, a.motor.z - hero.z) < 1.6) {
        a.skinned = true;
        this.fx.push({ type: 'pelt', animal: a, cash: ANIMALS[a.kind].pelt });
      }
    }
    // The wild refills itself, out of the hero's sight.
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (this.clock < r.at) continue;
      this.respawns.splice(i, 1);
      const a = this.spawnSomewhere(r.kind, r.pack, 9000 + this.nextId);
      if (Math.hypot(a.motor.x - hero.x, a.motor.z - hero.z) < 60) {
        // Too close to appear from nowhere: try again later.
        this.animals.splice(this.animals.indexOf(a), 1);
        this.respawns.push({ ...r, at: this.clock + 10 });
      }
    }
    // Long-dead, skinned bodies are cleared away.
    for (let i = this.animals.length - 1; i >= 0; i--) if (this.animals[i].state === 'dead' && this.animals[i].deadTime > 40) this.animals.splice(i, 1);
  }

  private preyPosition(p: NonNullable<Animal['prey']>, hero: HeroMotor): { x: number; z: number; alive: boolean } {
    if (p.kind === 'hero') return { x: hero.x, z: hero.z, alive: true };
    if (p.kind === 'enemy') return { x: p.enemy.motor.x, z: p.enemy.motor.z, alive: p.enemy.state !== 'dead' };
    return { x: p.animal.motor.x, z: p.animal.motor.z, alive: p.animal.state !== 'dead' };
  }

  private think(a: Animal, dt: number, hero: HeroMotor, combat: Combat, heroAlive: boolean): void {
    const m = a.motor;
    const spec = ANIMALS[a.kind];
    a.hitTime += dt;
    a.cooldown -= dt;
    a.biting = Math.max(0, a.biting - dt);
    if (a.state === 'dead') {
      a.deadTime += dt;
      return;
    }
    const heroD = Math.hypot(hero.x - m.x, hero.z - m.z);
    const heroNear = heroAlive && hero.mode !== 'glide' && heroD < spec.wary;

    if (a.kind === 'wolf') {
      // Hunt the nearest living thing worth hunting: the hero, a Choir fighter, or prey.
      if (a.state !== 'hunt' && a.state !== 'attack') {
        let best = spec.wary;
        let prey: Animal['prey'] = null;
        if (heroNear) {
          best = heroD;
          prey = { kind: 'hero' };
        }
        for (const e of combat.enemies) {
          if (e.state === 'dead' || e.kind === 'boss') continue;
          const d = Math.hypot(e.motor.x - m.x, e.motor.z - m.z);
          if (d < best) {
            best = d;
            prey = { kind: 'enemy', enemy: e };
          }
        }
        for (const o of this.animals) {
          if (o === a || o.kind === 'wolf' || o.state === 'dead') continue;
          const d = Math.hypot(o.motor.x - m.x, o.motor.z - m.z);
          if (d < best * 0.8) {
            best = d;
            prey = { kind: 'animal', animal: o };
          }
        }
        if (prey) {
          if (a.state === 'graze' || a.state === 'wander') this.fx.push({ type: 'howl', animal: a });
          a.state = 'hunt';
          a.prey = prey;
          // The pack joins in.
          for (const o of this.animals) if (o.pack === a.pack && o.pack && o !== a && o.state !== 'dead' && o.state !== 'attack') {
            o.state = 'hunt';
            o.prey = prey;
          }
        }
      }
    } else if (heroNear && a.state !== 'hunt' && a.state !== 'attack') {
      this.scare(a, hero.x, hero.z);
    } else if (a.kind !== 'stag') {
      // Prey keeps clear of wolves too.
      for (const o of this.animals) {
        if (o.kind !== 'wolf' || o.state === 'dead') continue;
        if (Math.hypot(o.motor.x - m.x, o.motor.z - m.z) < 14 && a.state !== 'flee') this.scare(a, o.motor.x, o.motor.z);
      }
    }

    const intent = this.intent;
    intent.forward = 0;
    intent.right = 0;
    intent.sprint = false;
    intent.walk = false;
    intent.jumpPressed = false;
    let speed = 0;
    let goalX = a.goalX;
    let goalZ = a.goalZ;

    switch (a.state) {
      case 'graze':
        a.timer -= dt;
        if (a.timer <= 0) {
          a.state = 'wander';
          a.timer = 5 + hash(a.id, this.tick) * 6;
          const ang = hash(this.tick, a.id) * Math.PI * 2;
          a.goalX = m.x + Math.sin(ang) * 12;
          a.goalZ = m.z + Math.cos(ang) * 12;
        }
        break;
      case 'wander':
        a.timer -= dt;
        speed = spec.walk;
        if (a.timer <= 0 || Math.hypot(a.goalX - m.x, a.goalZ - m.z) < 1.5) {
          a.state = 'graze';
          a.timer = 3 + hash(a.id, this.tick + 1) * 7;
          speed = 0;
        }
        break;
      case 'flee':
        a.timer -= dt;
        speed = spec.run;
        if (a.timer <= 0) {
          a.state = 'graze';
          a.timer = 2 + hash(a.id, this.tick) * 4;
          speed = 0;
        }
        break;
      case 'hunt':
      case 'attack': {
        const p = a.prey ? this.preyPosition(a.prey, hero) : null;
        if (!p || !p.alive || (a.prey?.kind === 'hero' && (!heroAlive || hero.mode === 'glide')) || Math.hypot(p.x - m.x, p.z - m.z) > spec.wary * 2.2) {
          a.state = 'wander';
          a.prey = null;
          a.timer = 4;
          a.goalX = m.x;
          a.goalZ = m.z;
          break;
        }
        goalX = p.x;
        goalZ = p.z;
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        const bite = spec.bite!;
        if (d < bite.reach) {
          a.state = 'attack';
          speed = 0;
          m.facing = Math.atan2(p.x - m.x, p.z - m.z);
          if (a.cooldown <= 0) {
            a.cooldown = bite.every;
            a.biting = 0.5;
            const prey = a.prey!;
            if (prey.kind === 'hero') {
              combat.hurtHero(bite.damage, m.x, m.z);
              this.fx.push({ type: 'bite', animal: a, target: 'hero', x: hero.x, z: hero.z });
            } else if (prey.kind === 'enemy') {
              combat.hurtEnemy(prey.enemy, bite.damage * 1.6);
              this.fx.push({ type: 'bite', animal: a, target: 'enemy', x: prey.enemy.motor.x, z: prey.enemy.motor.z });
            } else {
              this.hurt(prey.animal, bite.damage * 1.5, m.x, m.z, false);
              this.fx.push({ type: 'bite', animal: a, target: 'animal', x: prey.animal.motor.x, z: prey.animal.motor.z });
            }
          }
        } else {
          a.state = 'hunt';
          speed = spec.run * (a.kind === 'stag' ? 0.85 : 1);
        }
        break;
      }
    }

    if (speed > 0) {
      const dx = goalX - m.x;
      const dz = goalZ - m.z;
      if (Math.hypot(dx, dz) > 0.3) {
        // HeroMotor moves at walk, jog or sprint; scale the stick to the animal's own pace.
        intent.cameraYaw = Math.atan2(-dx, -dz);
        intent.sprint = speed > 7.4 * 0.9;
        intent.walk = speed <= 2;
        const top = intent.sprint ? 7.4 : intent.walk ? 1.9 : 4.6;
        intent.forward = Math.min(1, speed / top);
      }
    }
    m.step(intent, dt);
    // Animals outrun a sprinting hero: the motor's sprint is a person's, so add the difference.
    if (speed > 7.4 && m.speed > 0.1) {
      const k = speed / Math.max(7.4, m.speed);
      m.x += m.vx * (k - 1) * dt;
      m.z += m.vz * (k - 1) * dt;
    }
  }
}
