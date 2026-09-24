import type { Box } from './CityLayout';
import { HeroMotor, type HeroIntent } from './HeroMotor';
import { WEAPONS, type WeaponId, type Shot } from './Weapons';

/**
 * Gunfights in VORIXA City (ADR-0014): hit tests against people and the city, enemies who spot the
 * hero, keep their distance, strafe and fire in bursts, and the hero's health and armour.
 * Pure and deterministic, stepped with the hero.
 */

// ─── Geometry ─────────────────────────────────────────────────────────────────────────────────

/** Distance along a ray to the nearest box (slab test), or `max` if none is closer. */
export function rayBoxes(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, boxes: readonly Box[]): number {
  let best = max;
  for (const b of boxes) {
    let t0 = 0;
    let t1 = best;
    let hit = true;
    const slabs: [number, number, number, number][] = [
      [ox, dx, b.minX, b.maxX],
      [oy, dy, 0, b.height],
      [oz, dz, b.minZ, b.maxZ]
    ];
    for (const [o, d, lo, hi] of slabs) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          hit = false;
          break;
        }
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) {
        hit = false;
        break;
      }
    }
    if (hit) best = Math.min(best, t0);
  }
  // The street.
  if (dy < -1e-6) best = Math.min(best, -oy / dy);
  return best;
}

/** Distance along a (unit) ray to a sphere, or Infinity. */
export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const t = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - t * t;
  if (d2 > r * r) return Infinity;
  const h = Math.sqrt(r * r - d2);
  const near = t - h;
  return near >= 0 ? near : t + h >= 0 ? 0 : Infinity;
}

/** A unit direction from yaw and pitch, Three.js conventions (yaw 0 looks along -z). */
export function direction(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

// ─── People ───────────────────────────────────────────────────────────────────────────────────

/** Hit volumes of a standing person, heights in metres: the head, then the body, top to bottom. */
const HEAD = { y: 1.63, r: 0.15 };
const BODY: readonly { y: number; r: number }[] = [
  { y: 1.35, r: 0.27 },
  { y: 1.05, r: 0.28 },
  { y: 0.72, r: 0.24 },
  { y: 0.38, r: 0.2 }
];

export type EnemyKind = 'swat' | 'soldier' | 'police' | 'boss';

/** Cantor, the district's boss: huge health, plated body (the head is the weak point), heavy bursts. */
export const BOSS_HP = 1400;
export const BOSS_SCALE = 1.35;
const BOSS_PLATE = 0.35;
export type EnemyState = 'idle' | 'alert' | 'fight' | 'dead';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  motor: HeroMotor;
  hp: number;
  state: EnemyState;
  /** Time left before an alerted enemy starts shooting (reaction time). */
  alertTimer: number;
  cooldown: number;
  burst: number;
  strafe: number;
  strafeTimer: number;
  /** Seconds since last hit, for the flinch animation. */
  hitTime: number;
  deadTime: number;
  /** Where it was placed, so it returns there when it loses the hero. */
  homeX: number;
  homeZ: number;
  lastSeen: number;
  /** The outpost this fighter guards (1-based); 0 for a wave or a job's crew. */
  post: number;
  /**
   * Heard something but has not seen the hero: walks over to where the noise came from and looks
   * around, and only fights on actually seeing them.
   */
  heard: boolean;
  lookX: number;
  lookZ: number;
  /** Seconds spent looking around at the noise; gives up and goes home after a while. */
  searched: number;
  /** Seconds trying to walk and not getting anywhere (a planter, a car, a barrier in the way). */
  stuck: number;
  /** Seconds left of stepping sideways around an obstacle, and which way. */
  dodge: number;
  dodgeSide: number;
}

export interface Hit {
  kind: 'enemy' | 'world' | 'none';
  distance: number;
  x: number;
  y: number;
  z: number;
  enemy?: Enemy;
  headshot?: boolean;
}

export type CombatFx =
  | { type: 'enemyShot'; enemy: Enemy; hit: boolean; tx: number; ty: number; tz: number }
  | { type: 'enemyHurt'; enemy: Enemy; headshot: boolean; x: number; y: number; z: number }
  | { type: 'enemyKilled'; enemy: Enemy; headshot: boolean; how?: 'blast' | 'fire' | 'takedown' }
  | { type: 'heroHurt'; amount: number; fromX: number; fromZ: number }
  | { type: 'heroDown' }
  | { type: 'impact'; x: number; y: number; z: number }
  | { type: 'pickup'; weapon: WeaponId; rounds: number }
  | { type: 'waveClear'; wave: number }
  | { type: 'policeDown' }
  | { type: 'bossDown' };

const SIGHT = 48;
const REACTION = 0.55;
const KEEP_NEAR = 9;
const KEEP_FAR = 24;
const BURST = 3;
const BURST_GAP = 0.14;
const ENEMY_DAMAGE = 7;
export const HERO_MAX_HP = 100;
export const HERO_MAX_ARMOR = 50;
/** Health comes back on its own to here (GTA's half bar), after a moment out of fire. */
const REGEN_CAP = 50;
const REGEN_DELAY = 5;
/** Seconds a guard searches where a noise came from before giving up. */
export const SEARCH_TIME = 7;
/** Reach of a silent takedown, from behind or before they are fighting. */
export const TAKEDOWN_REACH = 1.9;

function hash(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Combat {
  public readonly enemies: Enemy[] = [];
  public readonly fx: CombatFx[] = [];
  public hp = HERO_MAX_HP;
  public armor = HERO_MAX_ARMOR;
  public kills = 0;
  public headshots = 0;
  public wave = 0;
  /** Perk-tuned rules (see Crew.perkEffects). */
  public armorMax = HERO_MAX_ARMOR;
  public regenCap = REGEN_CAP;
  public headshotScale = 1;
  /** Extra damage for the close-range guns (Breacher). */
  public closeScale = 1;
  /** How much longer enemies take to react (Ghost). */
  public spotScale = 1;
  /** Movable cover (parked and driven cars), refreshed by the game each step. */
  public readonly cover: Box[] = [];
  private sinceHurt = 99;
  private tick = 0;
  private nextId = 1;
  /** Ammo dropped by fallen enemies: walk over it to take it. */
  public readonly drops: { x: number; z: number; weapon: WeaponId; rounds: number; alive: boolean }[] = [];

  public constructor(
    private readonly colliders: readonly Box[],
    private readonly bounds: Box
  ) {}

  public spawn(kind: EnemyKind, x: number, z: number, facing: number, post = 0): Enemy {
    const motor = new HeroMotor(this.colliders, this.bounds);
    motor.place(x, z, facing);
    const e: Enemy = {
      id: this.nextId++, kind, motor, hp: kind === 'boss' ? BOSS_HP : kind === 'swat' ? 120 : 100,
      state: kind === 'police' || kind === 'boss' ? 'alert' : 'idle', alertTimer: kind === 'police' ? 1.2 : kind === 'boss' ? 1.5 : 0, cooldown: 0,
      burst: 0, strafe: 1, strafeTimer: 0, hitTime: 99, deadTime: 0, homeX: x, homeZ: z, lastSeen: 99, post,
      heard: false, lookX: x, lookZ: z, searched: 0, stuck: 0, dodge: 0, dodgeSide: 1
    };
    this.enemies.push(e);
    return e;
  }

  /** Starts a wave: a squad around a point, spread so they do not stand in a line. */
  public spawnWave(cx: number, cz: number, count: number): void {
    this.wave++;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash(this.wave, i) * 0.8;
      const r = 6 + hash(i, this.wave + 3) * 8;
      this.spawn(i % 3 === 2 ? 'soldier' : 'swat', cx + Math.cos(a) * r, cz + Math.sin(a) * r, a + Math.PI);
    }
  }

  /** Choir still standing in the current wave or job (not the police, not outpost guards). */
  public get alive(): number {
    return this.enemies.filter((e) => e.state !== 'dead' && e.kind !== 'police' && e.post === 0).length;
  }

  /** Guards of one outpost still standing. */
  public guardsAlive(post: number): number {
    return this.enemies.filter((e) => e.state !== 'dead' && e.post === post).length;
  }

  public get bossAlive(): boolean {
    return this.enemies.some((e) => e.kind === 'boss' && e.state !== 'dead');
  }

  public get boss(): Enemy | null {
    return this.enemies.find((e) => e.kind === 'boss') ?? null;
  }

  public get policeOnScene(): number {
    return this.enemies.filter((e) => e.state !== 'dead' && e.kind === 'police').length;
  }

  /** Police who can see the hero right now: while they can, the heat does not cool. */
  public get policeWatching(): boolean {
    return this.enemies.some((e) => e.kind === 'police' && e.state === 'fight' && e.lastSeen < 1);
  }

  /** Clears the wave's or job's Choir fighters off the street (a job restarting); outposts stay held. */
  public clearChoir(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].kind !== 'police' && this.enemies[i].post === 0) this.enemies.splice(i, 1);
  }

  /** The heat is off: the police go home. */
  public standDownPolice(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].kind === 'police') this.enemies.splice(i, 1);
  }

  /**
   * Traces one bullet from the camera. Hits closer than `minDistance` are ignored, so a third-
   * person camera behind the hero does not shoot the hero's own shoulder or a wall behind it.
   */
  public trace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, minDistance = 0): Hit {
    let best = rayBoxes(ox, oy, oz, dx, dy, dz, rayBoxes(ox, oy, oz, dx, dy, dz, range, this.cover), this.colliders);
    let hit: Hit = best < range ? { kind: 'world', distance: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best } : { kind: 'none', distance: range, x: ox + dx * range, y: oy + dy * range, z: oz + dz * range };
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const m = e.motor;
      const k = e.kind === 'boss' ? BOSS_SCALE : 1;
      const head = raySphere(ox, oy, oz, dx, dy, dz, m.x, m.y + HEAD.y * k, m.z, HEAD.r * k);
      let t = head;
      let headshot = head < Infinity;
      for (const s of BODY) {
        const b = raySphere(ox, oy, oz, dx, dy, dz, m.x, m.y + s.y * k, m.z, s.r * k);
        if (b < t) {
          t = b;
          headshot = false;
        }
      }
      if (t < best && t >= minDistance) {
        best = t;
        hit = { kind: 'enemy', distance: t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, enemy: e, headshot };
      }
    }
    return hit;
  }

  /**
   * Resolves the hero's shots (from `Arsenal.step`) aimed along yaw/pitch from the camera.
   * @param block For each shot's direction, how far until something the fight does not own stops
   *   it (a barrel, an alarm, a bystander). A shot stopped that way comes back as kind 'none' at
   *   that distance, for the caller to resolve.
   */
  public fire(
    weapon: WeaponId, shots: readonly Shot[], ox: number, oy: number, oz: number, yaw: number, pitch: number, minDistance: number,
    block?: (dx: number, dy: number, dz: number) => number
  ): Hit[] {
    const w = WEAPONS[weapon];
    const hits: Hit[] = [];
    for (const s of shots) {
      const [dx, dy, dz] = direction(yaw + s.yaw, pitch + s.pitch);
      const hit = this.trace(ox, oy, oz, dx, dy, dz, block ? Math.min(w.range, block(dx, dy, dz)) : w.range, minDistance);
      hits.push(hit);
      const close = weapon === 'shotgun' || weapon === 'smg' ? this.closeScale : 1;
      if (hit.kind === 'enemy' && hit.enemy) this.damage(hit.enemy, w.damage * close * (hit.headshot ? w.headshot * this.headshotScale : 1), !!hit.headshot, hit);
      else if (hit.kind === 'world') this.fx.push({ type: 'impact', x: hit.x, y: hit.y, z: hit.z });
    }
    return hits;
  }

  /**
   * A blast: everyone in reach is hurt in proportion to how near they are (Cantor's plate turns
   * most of it), the hero too, and everyone in earshot turns to look.
   */
  public blast(x: number, z: number, radius: number, power: number): void {
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.motor.x - x, e.motor.z - z);
      if (d >= radius) continue;
      this.damage(e, power * (1 - d / radius), false, { kind: 'enemy', distance: d, x: e.motor.x, y: 1, z: e.motor.z, enemy: e }, 'blast');
    }
    const d = Math.hypot(this.heroX - x, this.heroZ - z);
    if (d < radius) this.hurtHero(power * 0.6 * (1 - d / radius), x, z);
    this.noise(x, z, 60);
  }

  /**
   * Something loud at (x, z): idle fighters within `radius` turn toward it and come looking
   * (the pistol is quiet, the sniper rifle is heard across the district). Hearing is not seeing:
   * they walk to the noise and search, and fight only once they set eyes on the hero.
   */
  public noise(x: number, z: number, radius: number): void {
    for (const e of this.enemies) {
      if (e.state !== 'idle' && !(e.state === 'alert' && e.heard)) continue;
      if (Math.hypot(e.motor.x - x, e.motor.z - z) > radius) continue;
      e.state = 'alert';
      e.heard = true;
      e.lookX = x;
      e.lookZ = z;
      e.searched = 0;
      e.motor.facing = Math.atan2(x - e.motor.x, z - e.motor.z);
    }
  }

  /** Fires burn whoever stands in them, the hero included, at `dps` a second. */
  public scorch(burning: (x: number, z: number) => boolean, dps: number, dt: number): void {
    for (const e of this.enemies) {
      if (e.state === 'dead' || !burning(e.motor.x, e.motor.z)) continue;
      this.damage(e, dps * dt, false, { kind: 'enemy', distance: 0, x: e.motor.x, y: 1, z: e.motor.z, enemy: e }, 'fire', true);
    }
    // Only standing in it: a glider or a rooftop over the flames is out of reach.
    if (this.hp > 0 && this.heroY < 1.5 && burning(this.heroX, this.heroZ)) this.hurtHero(dps * dt, this.heroX, this.heroZ, true);
  }

  /**
   * A silent takedown: the nearest fighter within reach who is not yet fighting, or whose back is
   * turned. Returns them, or null when nobody is in reach.
   */
  public takedown(hero: HeroMotor): Enemy | null {
    const best = this.takedownTarget(hero);
    if (!best) return null;
    this.damage(best, best.hp + 1, false, { kind: 'enemy', distance: 0, x: best.motor.x, y: 1, z: best.motor.z, enemy: best }, 'takedown');
    return best;
  }

  /** Who a takedown would take right now (for the prompt), or null. */
  public takedownTarget(hero: HeroMotor): Enemy | null {
    let best: Enemy | null = null;
    let bestD = TAKEDOWN_REACH;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.kind === 'boss') continue;
      const dx = hero.x - e.motor.x;
      const dz = hero.z - e.motor.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const toHero = Math.atan2(dx, dz);
      const behind = Math.abs(Math.atan2(Math.sin(toHero - e.motor.facing), Math.cos(toHero - e.motor.facing))) > 1.9;
      if (e.state === 'fight' && !behind) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  private heroX = 0;
  private heroY = 0;
  private heroZ = 0;

  private damage(e: Enemy, amount: number, headshot: boolean, at: Hit, how?: 'blast' | 'fire' | 'takedown', quiet = false): void {
    // Cantor's plate turns most body shots; the head is bare.
    e.hp -= e.kind === 'boss' && !headshot ? amount * BOSS_PLATE : amount;
    if (!quiet) e.hitTime = 0;
    // Being shot gives the hero away, from any direction.
    if ((e.state === 'idle' || e.heard) && how !== 'takedown') {
      e.state = 'alert';
      e.heard = false;
      e.alertTimer = REACTION * 0.6;
    }
    if (!quiet) this.fx.push({ type: 'enemyHurt', enemy: e, headshot, x: at.x, y: at.y, z: at.z });
    if (e.hp <= 0) {
      e.state = 'dead';
      e.deadTime = 0;
      this.kills++;
      if (headshot) this.headshots++;
      this.fx.push({ type: 'enemyKilled', enemy: e, headshot, how });
      const weapon: WeaponId = e.kind === 'swat' ? 'smg' : e.kind === 'police' ? 'pistol' : 'rifle';
      if (e.kind === 'boss') this.fx.push({ type: 'bossDown' });
      this.drops.push({ x: e.motor.x, z: e.motor.z, weapon, rounds: WEAPONS[weapon].magazine, alive: true });
      if (e.kind === 'police') this.fx.push({ type: 'policeDown' });
      else if (e.post === 0 && this.alive === 0) this.fx.push({ type: 'waveClear', wave: this.wave });
    }
  }

  /** A car at speed knocks down anyone in its path. Returns how many it hit. */
  public runOver(x: number, z: number, radius: number, speed: number): number {
    if (speed < 5) return 0;
    let hits = 0;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      if (Math.hypot(e.motor.x - x, e.motor.z - z) > radius + 0.35) continue;
      this.damage(e, speed * 12, false, { kind: 'enemy', distance: 0, x: e.motor.x, y: 1, z: e.motor.z, enemy: e });
      hits++;
    }
    return hits;
  }

  /** Damage to the hero: armour takes most of it first, like Counter-Strike's kevlar. */
  public hurtHero(amount: number, fromX: number, fromZ: number, quiet = false): void {
    if (this.hp <= 0) return;
    const absorbed = Math.min(this.armor, amount * 0.6);
    this.armor -= absorbed;
    this.hp = Math.max(0, this.hp - (amount - absorbed));
    this.sinceHurt = 0;
    // A burn is a steady drain, not a hit from somewhere: no damage marker every tick.
    if (!quiet) this.fx.push({ type: 'heroHurt', amount, fromX, fromZ });
    if (this.hp <= 0) this.fx.push({ type: 'heroDown' });
  }

  public reviveHero(): void {
    this.hp = HERO_MAX_HP;
    this.armor = this.armorMax;
    this.sinceHurt = 99;
  }

  public step(dt: number, hero: HeroMotor, pickup: (weapon: WeaponId, rounds: number) => void): void {
    this.fx.length = 0;
    this.tick++;
    this.heroX = hero.x;
    this.heroY = hero.y;
    this.heroZ = hero.z;
    this.sinceHurt += dt;
    if (this.hp > 0 && this.sinceHurt > REGEN_DELAY && this.hp < this.regenCap) this.hp = Math.min(this.regenCap, this.hp + 8 * dt);

    for (const d of this.drops) {
      if (!d.alive || Math.hypot(hero.x - d.x, hero.z - d.z) > 1.3) continue;
      d.alive = false;
      pickup(d.weapon, d.rounds);
      this.fx.push({ type: 'pickup', weapon: d.weapon, rounds: d.rounds });
    }

    for (const e of this.enemies) this.think(e, dt, hero);
  }

  private canSee(e: Enemy, hero: HeroMotor): boolean {
    const m = e.motor;
    const dx = hero.x - m.x;
    const dy = hero.y + 1.5 - (m.y + 1.55);
    const dz = hero.z - m.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > SIGHT) return false;
    const blocked = rayBoxes(m.x, m.y + 1.55, m.z, dx / dist, dy / dist, dz / dist, rayBoxes(m.x, m.y + 1.55, m.z, dx / dist, dy / dist, dz / dist, dist, this.cover), this.colliders);
    return blocked >= dist - 0.3;
  }

  private readonly intent: HeroIntent = { forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false };

  private think(e: Enemy, dt: number, hero: HeroMotor): void {
    e.hitTime += dt;
    const m = e.motor;
    if (e.state === 'dead') {
      e.deadTime += dt;
      return;
    }
    const dx = hero.x - m.x;
    const dz = hero.z - m.z;
    const dist = Math.hypot(dx, dz);
    const toHero = Math.atan2(dx, dz);
    const heroAlive = this.hp > 0;
    const sees = heroAlive && this.canSee(e, hero);
    e.lastSeen = sees ? 0 : e.lastSeen + dt;

    if (e.state === 'idle') {
      // Spots the hero when in front of it, or at close range from any side.
      const facingDiff = Math.abs(Math.atan2(Math.sin(toHero - m.facing), Math.cos(toHero - m.facing)));
      if (sees && (facingDiff < 1.3 || dist < 12)) {
        e.state = 'alert';
        e.alertTimer = (REACTION + hash(e.id, 5) * 0.4) * this.spotScale;
      }
    }
    if (e.state === 'alert' && e.heard) {
      // Searching: they see what is in front of them, or right beside them.
      const ahead = Math.abs(Math.atan2(Math.sin(toHero - m.facing), Math.cos(toHero - m.facing))) < 1.4;
      if (sees && (ahead || dist < 6)) {
        // There they are.
        e.heard = false;
        e.alertTimer = (REACTION + hash(e.id, 5) * 0.4) * this.spotScale;
      } else if (Math.hypot(e.lookX - m.x, e.lookZ - m.z) < 2.5) {
        e.searched += dt;
        // Looking around where the noise was.
        m.facing += dt * 1.4 * (hash(e.id, 3) < 0.5 ? -1 : 1);
        if (e.searched > SEARCH_TIME) {
          e.state = 'idle';
          e.heard = false;
        }
      }
    } else if (e.state === 'alert') {
      e.alertTimer -= dt;
      if (e.alertTimer <= 0) e.state = 'fight';
    }

    // Movement: hold a band of distance and strafe; walk home when the hero is gone.
    const intent = this.intent;
    intent.forward = 0;
    intent.right = 0;
    intent.sprint = false;
    intent.walk = false;
    if (e.state === 'fight' && heroAlive) {
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafe = hash(e.id, this.tick) < 0.5 ? -1 : 1;
        e.strafeTimer = 1.2 + hash(this.tick, e.id) * 1.6;
      }
      intent.cameraYaw = Math.atan2(-dx, -dz);
      intent.forward = dist > KEEP_FAR || e.lastSeen > 1.5 ? 1 : dist < KEEP_NEAR ? -1 : 0;
      intent.right = e.lastSeen > 1.5 ? 0 : e.strafe * 0.8;
      intent.walk = intent.forward === 0;
    } else if (e.state === 'alert' && e.heard && Math.hypot(e.lookX - m.x, e.lookZ - m.z) >= 2.5) {
      intent.cameraYaw = Math.atan2(-(e.lookX - m.x), -(e.lookZ - m.z));
      intent.forward = 1;
    } else if (e.state === 'idle' && Math.hypot(e.homeX - m.x, e.homeZ - m.z) > 1) {
      intent.cameraYaw = Math.atan2(-(e.homeX - m.x), -(e.homeZ - m.z));
      intent.forward = 1;
      intent.walk = true;
    }
    // Blocked: hop anything low (planters, kerbs), and step sideways around anything taller.
    intent.jumpPressed = false;
    if (e.dodge > 0) {
      e.dodge -= dt;
      intent.right = e.dodgeSide;
    } else if (intent.forward !== 0 && m.speed < 0.6 && m.grounded) {
      e.stuck += dt;
      if (e.stuck > 0.35) {
        e.stuck = 0;
        intent.jumpPressed = true;
        e.dodge = 0.9;
        e.dodgeSide = hash(e.id, this.tick) < 0.5 ? -1 : 1;
      }
    } else e.stuck = 0;
    m.step(intent, dt);
    if (e.state === 'fight' || (e.state === 'alert' && !e.heard)) m.facing = toHero;

    // Shooting: bursts, with accuracy falling off with distance and a moving target.
    e.cooldown -= dt;
    if (e.state === 'fight' && sees && e.cooldown <= 0) {
      e.burst++;
      const burst = e.kind === 'boss' ? 7 : BURST;
      e.cooldown = e.burst >= burst ? 0.9 + hash(e.id, this.tick) * 0.8 : BURST_GAP * (e.kind === 'boss' ? 0.7 : 1);
      if (e.burst >= burst) e.burst = 0;
      const chance = Math.max(0.08, 0.62 - dist * 0.012 - hero.speed * 0.045 - (hero.grounded ? 0 : 0.2));
      const hit = hash(this.tick, e.id * 7) < chance;
      const miss = hit ? 0 : 0.6 + hash(e.id, this.tick * 3) * 1.2;
      const side = hash(this.tick, e.id * 11) < 0.5 ? -1 : 1;
      this.fx.push({
        type: 'enemyShot', enemy: e, hit,
        tx: hero.x + Math.cos(toHero) * miss * side, ty: hero.y + 1.2 + (hit ? 0 : miss * 0.3), tz: hero.z - Math.sin(toHero) * miss * side
      });
      if (hit) this.hurtHero(e.kind === 'boss' ? ENEMY_DAMAGE * 1.6 : ENEMY_DAMAGE, m.x, m.z);
    } else if (e.state === 'fight' && !sees && e.lastSeen > 8) {
      e.state = 'idle';
    }
  }
}
