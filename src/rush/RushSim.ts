import { createRng, type Rng } from '../world/Rng';
import { spawnPattern, OPENING_CLEAR } from './Patterns';

/**
 * Rush: the whole game as a pure, deterministic simulation.
 *
 * A car on an endless three-lane road. Steer between lanes, jump, shoot, survive. Nothing here
 * knows about Three.js, the DOM, or input devices — the game loop hands in a `RushIntent` each
 * tick and reads back entity positions and a queue of effect records. That split is what makes the
 * rules testable: "can a pattern ever wall off every lane" is a unit test, not a play session.
 *
 * ## Coordinates
 *
 * `z` is distance travelled along the road (forward is +z), `x` is lateral (lane × LANE_WIDTH,
 * right is +x), `y` is up with the road surface at 0. The renderer maps these to its own axes.
 */

export const LANE_WIDTH = 3.2;
export const LANE_COUNT = 3;
/** Lanes are -1, 0, +1. */
export const MIN_LANE = -1;
export const MAX_LANE = 1;

export const START_SPEED = 24;
export const MAX_SPEED = 58;
/** m/s gained per second of running. Reaches top speed after about a minute. */
const SPEED_RAMP = 0.55;
/** Speed kept after a crash. Losing momentum is the sting; losing a heart is the cost. */
const CRASH_SPEED_KEEP = 0.62;
const NITRO_BONUS = 20;
const NITRO_DRAIN = 0.32;

/** Lateral speed while changing lanes. One lane in ~0.19 s: quick, but visible as a swerve. */
const LANE_SWITCH_SPEED = 17;
export const JUMP_VELOCITY = 9.5;
export const RAMP_VELOCITY = 14;
export const GRAVITY = 26;

export const MAX_HEARTS = 3;
const INVULNERABLE_AFTER_CRASH = 1.5;

const FIRE_INTERVAL = 0.15;
const BULLET_SPEED = 110;
const BULLET_LIFE = 1.1;
/** How far off the aim ray a target may be and still be tracked by the aim assist. */
const AIM_ASSIST_RADIUS = 2.8;
const AIM_RANGE = 95;

/** Seconds a kill or smash keeps the combo alive. */
const COMBO_WINDOW = 2.5;
const MAX_COMBO = 5;

/** Entities behind the car by more than this are recycled. */
const DESPAWN_BEHIND = 12;
/** Patterns are laid out this far ahead, beyond the fog, so nothing appears in view. */
const SPAWN_AHEAD = 170;

export const PLAYER_HALF_WIDTH = 0.95;
export const PLAYER_HALF_LENGTH = 1.9;

export type EntityKind =
  | 'barrier'
  | 'truck'
  | 'traffic'
  | 'crate'
  | 'coin'
  | 'drone'
  | 'shot'
  | 'nitro'
  | 'heart'
  | 'ramp';

/** Collision half-extents and height per kind. Heights decide what a jump clears. */
export const KIND_SHAPE: Record<EntityKind, { hx: number; hz: number; height: number }> = {
  barrier: { hx: 1.3, hz: 0.4, height: 1.0 },
  truck: { hx: 1.35, hz: 3.6, height: 3.4 },
  traffic: { hx: 1.0, hz: 2.0, height: 1.4 },
  crate: { hx: 0.8, hz: 0.8, height: 1.6 },
  coin: { hx: 0.7, hz: 0.7, height: 1.4 },
  drone: { hx: 1.2, hz: 1.2, height: 1.2 },
  shot: { hx: 0.4, hz: 0.4, height: 0.8 },
  nitro: { hx: 0.8, hz: 0.8, height: 1.6 },
  heart: { hx: 0.8, hz: 0.8, height: 1.6 },
  ramp: { hx: 1.4, hz: 2.6, height: 0.6 }
};

const POINTS: Partial<Record<EntityKind, number>> = {
  coin: 10,
  crate: 50,
  barrier: 40,
  traffic: 150,
  drone: 300
};

export interface Entity {
  /** Stable while alive; renderers key per-entity animation on it. */
  id: number;
  kind: EntityKind;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  /** Forward speed in world terms. Traffic drives; shots fly back toward the car. */
  vz: number;
  hp: number;
  /** Seconds since spawn. */
  age: number;
  /** Kind-specific: the drone's fire countdown. */
  timer: number;
  /** Kind-specific: the drone's hover offset ahead of the car. */
  offset: number;
}

export interface Bullet {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  /** Entity the aim assist locked on to, or 0. Homing on it is what makes eye aiming viable. */
  targetId: number;
}

export type FxType =
  | 'coin'
  | 'smash'
  | 'explode'
  | 'crash'
  | 'jump'
  | 'land'
  | 'fire'
  | 'hit'
  | 'ramp'
  | 'pickup'
  | 'enemyFire'
  | 'gameOver';

export interface FxRecord {
  type: FxType;
  x: number;
  y: number;
  z: number;
  /** Type-specific magnitude: landing impact, points awarded. */
  amount: number;
}

/** What the player wants this tick, already resolved from every input device. */
export interface RushIntent {
  /** The lane the player is asking for, -1..1. */
  lane: number;
  jump: boolean;
  fire: boolean;
  nitro: boolean;
  /** Crosshair, -1 (left) to +1 (right). */
  aimX: number;
}

export type RushPhase = 'ready' | 'running' | 'over';

const ENTITY_CAPACITY = 128;
const BULLET_CAPACITY = 24;
const FX_CAPACITY = 64;

export class RushSim {
  public phase: RushPhase = 'ready';

  // The car.
  public lane = 0;
  public x = 0;
  public y = 0;
  public vy = 0;
  public z = 0;
  public speed = 0;
  public grounded = true;
  /** Lateral velocity this tick, for body roll. */
  public vx = 0;
  public hearts = MAX_HEARTS;
  public invulnerable = 0;
  public nitro = 0.5;
  public nitroActive = false;

  /** Where the run began; the title cruise before it does not count. */
  public startZ = 0;
  public score = 0;
  public coins = 0;
  public combo = 1;
  private comboTimer = 0;
  public elapsed = 0;
  public kills = 0;

  public readonly entities: Entity[] = [];
  public readonly bullets: Bullet[] = [];
  /** Effects raised during the last tick. Read, then discarded — the next tick overwrites them. */
  public readonly fx: FxRecord[] = [];
  public fxCount = 0;

  private rng: Rng;
  private nextId = 1;
  private nextSpawnZ = OPENING_CLEAR;
  private fireCooldown = 0;
  /** Distance points are accrued fractionally so slow ticks are not rounded away. */
  private distanceScore = 0;
  private bonusScore = 0;

  public constructor(private seed = 1) {
    this.rng = createRng(seed);
    for (let i = 0; i < ENTITY_CAPACITY; i++) {
      this.entities.push({ id: 0, kind: 'coin', alive: false, x: 0, y: 0, z: 0, vz: 0, hp: 0, age: 0, timer: 0, offset: 0 });
    }
    for (let i = 0; i < BULLET_CAPACITY; i++) {
      this.bullets.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, life: 0, targetId: 0 });
    }
    for (let i = 0; i < FX_CAPACITY; i++) this.fx.push({ type: 'coin', x: 0, y: 0, z: 0, amount: 0 });
  }

  /** Back to the start line with a fresh, identical world. */
  public reset(seed = this.seed): void {
    this.seed = seed;
    this.rng = createRng(seed);
    this.phase = 'ready';
    this.lane = 0;
    this.x = this.y = this.vy = this.z = this.vx = 0;
    this.startZ = 0;
    this.speed = 0;
    this.grounded = true;
    this.hearts = MAX_HEARTS;
    this.invulnerable = 0;
    this.nitro = 0.5;
    this.nitroActive = false;
    this.score = this.coins = this.kills = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.elapsed = 0;
    this.distanceScore = this.bonusScore = 0;
    this.nextSpawnZ = OPENING_CLEAR;
    this.fireCooldown = 0;
    this.fxCount = 0;
    for (const e of this.entities) e.alive = false;
    for (const b of this.bullets) b.alive = false;
  }

  public start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'running';
    this.speed = Math.max(this.speed, START_SPEED);
    // The car has been cruising under the title; the road ahead is measured from where it is now.
    this.nextSpawnZ = this.z + OPENING_CLEAR;
    this.startZ = this.z;
  }

  /** Metres covered since the run began. */
  public get distance(): number {
    return this.phase === 'ready' ? 0 : this.z - this.startZ;
  }

  /** 0 at the start, 1 once the run is long enough that everything is at full pressure. */
  public get difficulty(): number {
    return Math.min(this.distance / 3200, 1);
  }

  public get aliveDrones(): number {
    let n = 0;
    for (const e of this.entities) if (e.alive && e.kind === 'drone') n++;
    return n;
  }

  /**
   * Adds an entity. Used by the pattern generator.
   *
   * When the pool is full the spawn is dropped rather than recycling a live entity: pulling an
   * obstacle out from in front of the player is far worse than one fewer coin in the distance.
   */
  public spawn(kind: EntityKind, x: number, z: number, y = 0, vz = 0): Entity | null {
    for (const e of this.entities) {
      if (e.alive) continue;
      e.id = this.nextId++;
      e.kind = kind;
      e.alive = true;
      e.x = x;
      e.y = y;
      e.z = z;
      e.vz = vz;
      e.hp = kind === 'traffic' ? 3 : kind === 'drone' ? 2 : kind === 'crate' ? 1 : 0;
      e.age = 0;
      e.timer = 1.4;
      e.offset = 0;
      return e;
    }
    return null;
  }

  public update(intent: RushIntent, dt: number): void {
    this.fxCount = 0;

    if (this.phase === 'ready') {
      // The title screen is the game: the car cruises the empty opening stretch until the
      // player does anything at all.
      this.speed += (12 - this.speed) * (1 - Math.exp(-1.5 * dt));
      if (intent.jump || intent.fire || intent.nitro || intent.lane !== this.lane) this.start();
    }

    if (this.phase === 'over') {
      this.speed *= Math.pow(0.25, dt);
      this.z += this.speed * dt;
      this.integrateVertical(dt);
      this.updateEntities(dt);
      this.updateBullets(dt);
      return;
    }

    if (this.phase === 'running') this.elapsed += dt;
    this.steer(intent, dt);
    this.drive(intent, dt);
    if (intent.jump && this.grounded && this.phase === 'running') this.jump(JUMP_VELOCITY, 'jump');
    this.integrateVertical(dt);

    if (this.phase === 'running') {
      this.fire(intent, dt);
      this.spawnAhead();
    }
    this.updateEntities(dt);
    this.updateBullets(dt);
    if (this.phase === 'running') this.collide();

    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }
    this.score = Math.floor(this.distanceScore + this.bonusScore);
  }

  private steer(intent: RushIntent, dt: number): void {
    this.lane = Math.max(MIN_LANE, Math.min(MAX_LANE, Math.round(intent.lane)));
    const targetX = this.lane * LANE_WIDTH;
    const delta = targetX - this.x;
    const step = LANE_SWITCH_SPEED * dt;
    const before = this.x;
    this.x = Math.abs(delta) <= step ? targetX : this.x + Math.sign(delta) * step;
    this.vx = dt > 0 ? (this.x - before) / dt : 0;
  }

  private drive(intent: RushIntent, dt: number): void {
    if (this.phase === 'running') {
      const cruise = Math.min(START_SPEED + this.elapsed * SPEED_RAMP, MAX_SPEED);
      this.nitroActive = intent.nitro && this.nitro > 0;
      if (this.nitroActive) this.nitro = Math.max(0, this.nitro - NITRO_DRAIN * dt);
      const target = cruise + (this.nitroActive ? NITRO_BONUS : 0);
      // Ease rather than snap, so crashes and nitro read as a surge and a recovery.
      this.speed += (target - this.speed) * (1 - Math.exp(-2.2 * dt));
    }
    this.z += this.speed * dt;
    if (this.phase === 'running') this.distanceScore += this.speed * dt * 0.5;
  }

  private jump(velocity: number, type: FxType): void {
    this.vy = velocity;
    this.grounded = false;
    this.emit(type, this.x, 0, this.z, velocity);
  }

  private integrateVertical(dt: number): void {
    if (this.grounded) return;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      const impact = -this.vy;
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
      this.emit('land', this.x, 0, this.z, impact);
    }
  }

  private fire(intent: RushIntent, dt: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (!intent.fire || this.fireCooldown > 0) return;
    const bullet = this.bullets.find((b) => !b.alive);
    if (!bullet) return;
    this.fireCooldown = FIRE_INTERVAL;

    const muzzleY = this.y + 1.1;
    const muzzleZ = this.z + PLAYER_HALF_LENGTH;
    const aim = aimAt(this, intent.aimX, muzzleY, muzzleZ);
    bullet.alive = true;
    bullet.x = this.x;
    bullet.y = muzzleY;
    bullet.z = muzzleZ;
    bullet.vx = aim.vx;
    bullet.vy = aim.vy;
    bullet.life = BULLET_LIFE;
    bullet.targetId = aim.target?.id ?? 0;
    this.emit('fire', this.x, muzzleY, muzzleZ, 0);
  }

  private spawnAhead(): void {
    while (this.nextSpawnZ < this.z + SPAWN_AHEAD) {
      const length = spawnPattern(this, this.rng, this.nextSpawnZ);
      // Gaps grow with speed so reaction time, not distance, stays roughly constant.
      const gap = this.rng.range(16, 26) * (this.speed / START_SPEED) * 0.75;
      this.nextSpawnZ += length + Math.max(gap, 14);
    }
  }

  private updateEntities(dt: number): void {
    for (const e of this.entities) {
      if (!e.alive) continue;
      e.age += dt;
      if (e.kind === 'drone') this.updateDrone(e, dt);
      else e.z += e.vz * dt;
      if (e.z < this.z - DESPAWN_BEHIND) e.alive = false;
    }
  }

  /**
   * A drone swoops in from ahead, paces the car at a fixed lead, weaves between lanes and drops
   * shots down its current lane. After a while it gives up and climbs away.
   */
  private updateDrone(e: Entity, dt: number): void {
    const lead = e.age < 12 ? 34 : 34 + (e.age - 12) * 40;
    if (e.offset === 0) e.offset = e.z - this.z;
    e.offset += (lead - e.offset) * (1 - Math.exp(-1.2 * dt));
    const before = e.z;
    e.z = this.z + e.offset;
    // Its real forward speed, so aim lead treats a pacing drone as the moving target it is.
    e.vz = dt > 0 ? (e.z - before) / dt : 0;
    e.y = 3.4 + Math.sin(e.age * 2.3) * 0.35 + Math.max(0, e.age - 12) * 3;
    // Weave: dwell on a lane, then glide to the next, so shots come from readable positions.
    const laneTarget = Math.round(Math.sin(e.age * 0.55 + e.id) * 1.2);
    e.x += (laneTarget * LANE_WIDTH - e.x) * (1 - Math.exp(-2.5 * dt));

    if (this.phase !== 'running' || e.age > 12) return;
    e.timer -= dt;
    if (e.timer <= 0) {
      e.timer = 2.2 - this.difficulty * 0.9 + this.rng.range(0, 0.5);
      const lane = Math.round(e.x / LANE_WIDTH);
      this.spawn('shot', lane * LANE_WIDTH, e.z - 1.5, 0.9, -16);
      this.emit('enemyFire', e.x, e.y, e.z, 0);
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.alive = false;
        continue;
      }
      const step = (BULLET_SPEED + this.speed) * dt;
      if (b.targetId !== 0) this.home(b);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += step;
      for (const e of this.entities) {
        if (!e.alive || !isShootable(e.kind)) continue;
        const shape = KIND_SHAPE[e.kind];
        if (Math.abs(b.x - e.x) > shape.hx + 0.35) continue;
        // Swept along z: a bullet moves ~1 m per tick and would tunnel through a crate otherwise.
        if (b.z < e.z - shape.hz || b.z - step > e.z + shape.hz) continue;
        if (b.y < e.y - 0.4 || b.y > e.y + shape.height + 0.4) continue;
        b.alive = false;
        e.hp -= 1;
        this.emit('hit', b.x, b.y, e.z - shape.hz, 0);
        if (e.hp <= 0) this.destroy(e, e.kind === 'crate' ? 'smash' : 'explode');
        break;
      }
    }
  }

  /** Re-aims a locked bullet at its target's current position; drops the lock if it is gone. */
  private home(b: Bullet): void {
    const target = this.entities.find((e) => e.alive && e.id === b.targetId);
    if (!target || target.z < b.z) {
      b.targetId = 0;
      return;
    }
    const closing = BULLET_SPEED + this.speed - target.vz;
    const t = Math.max((target.z - b.z) / Math.max(closing, 1), 0.01);
    b.vx = (target.x - b.x) / t;
    b.vy = (target.y + KIND_SHAPE[target.kind].height * 0.5 - b.y) / t;
  }

  private collide(): void {
    for (const e of this.entities) {
      if (!e.alive || e.kind === 'drone') continue;
      const shape = KIND_SHAPE[e.kind];
      if (Math.abs(this.x - e.x) > PLAYER_HALF_WIDTH + shape.hx) continue;
      if (Math.abs(this.z - e.z) > PLAYER_HALF_LENGTH + shape.hz) continue;
      // Clearing the top of an obstacle is the whole point of jumping.
      if (this.y >= e.y + shape.height || this.y + 1.3 <= e.y) continue;
      this.touch(e);
    }
  }

  private touch(e: Entity): void {
    switch (e.kind) {
      case 'coin':
        this.coins++;
        this.award(e, false);
        e.alive = false;
        this.emit('coin', e.x, e.y, e.z, POINTS.coin ?? 0);
        return;
      case 'nitro':
        this.nitro = Math.min(1, this.nitro + 0.4);
        e.alive = false;
        this.emit('pickup', e.x, e.y, e.z, 0);
        return;
      case 'heart':
        this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
        e.alive = false;
        this.emit('pickup', e.x, e.y, e.z, 1);
        return;
      case 'ramp':
        if (this.grounded) this.jump(RAMP_VELOCITY, 'ramp');
        return;
      case 'crate':
        // Crates exist to be smashed. They feed the nitro, which is how ramming pays for itself.
        this.nitro = Math.min(1, this.nitro + 0.08);
        this.destroy(e, 'smash');
        return;
      case 'barrier':
      case 'traffic':
        // Nitro turns the car into a battering ram. Trucks are the exception: too big to plough.
        if (this.nitroActive) {
          this.destroy(e, 'explode');
          return;
        }
        this.crash(e);
        return;
      case 'truck':
      case 'shot':
        this.crash(e);
        return;
      case 'drone':
        return;
    }
  }

  private crash(e: Entity): void {
    if (this.invulnerable > 0) return;
    this.hearts--;
    this.invulnerable = INVULNERABLE_AFTER_CRASH;
    this.speed *= CRASH_SPEED_KEEP;
    this.combo = 1;
    this.comboTimer = 0;
    // The obstacle goes too. Leaving it would pin the car against it and cost a second heart
    // the moment invulnerability ends.
    e.alive = false;
    this.emit('crash', this.x, this.y + 0.8, this.z + PLAYER_HALF_LENGTH, this.hearts);
    if (this.hearts <= 0) {
      this.phase = 'over';
      this.nitroActive = false;
      this.emit('gameOver', this.x, this.y, this.z, this.score);
    }
  }

  private destroy(e: Entity, type: FxType): void {
    e.alive = false;
    if (e.kind === 'traffic' || e.kind === 'drone') this.kills++;
    const points = this.award(e, true);
    this.emit(type, e.x, e.y + KIND_SHAPE[e.kind].height * 0.5, e.z, points);
  }

  /** Adds an entity's points, multiplied by the combo when it counts toward one. */
  private award(e: Entity, extendsCombo: boolean): number {
    const base = POINTS[e.kind] ?? 0;
    const points = base * (extendsCombo ? this.combo : 1);
    this.bonusScore += points;
    if (extendsCombo) {
      this.combo = Math.min(MAX_COMBO, this.combo + (this.comboTimer > 0 ? 1 : 0));
      this.comboTimer = COMBO_WINDOW;
    }
    return points;
  }

  private emit(type: FxType, x: number, y: number, z: number, amount: number): void {
    if (this.fxCount >= this.fx.length) return;
    const r = this.fx[this.fxCount++];
    r.type = type;
    r.x = x;
    r.y = y;
    r.z = z;
    r.amount = amount;
  }
}

export function isShootable(kind: EntityKind): boolean {
  return kind === 'drone' || kind === 'traffic' || kind === 'crate';
}

/**
 * Where a shot fired now should go.
 *
 * The crosshair defines a ray; any shootable target close to it is tracked, with lead for its
 * own motion. Aim assist is not a crutch here — aiming with your eyes or an open hand is far less
 * precise than a mouse, and without it the shooting would only work for one of the four devices.
 */
export function aimAt(
  sim: Pick<RushSim, 'entities' | 'x' | 'speed'>,
  aimX: number,
  muzzleY: number,
  muzzleZ: number
): { vx: number; vy: number; target: Entity | null } {
  // The crosshair points at a spot on the road 45 m ahead; aimX = ±1 is one lane beyond the edge.
  const aimSpread = LANE_WIDTH * 1.6;
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const e of sim.entities) {
    if (!e.alive || !isShootable(e.kind)) continue;
    const dz = e.z - muzzleZ;
    if (dz < 2 || dz > AIM_RANGE) continue;
    const rayX = sim.x + (aimX * aimSpread - sim.x) * Math.min(dz / 45, 1.4);
    const off = Math.abs(e.x - rayX);
    if (off > AIM_ASSIST_RADIUS) continue;
    // Prefer on-ray over near: the player pointed at it, so that is the one they meant.
    const score = off * 4 + dz * 0.05 - (e.kind === 'drone' ? 2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }

  const bulletSpeed = BULLET_SPEED + sim.speed;
  if (best) {
    const closing = bulletSpeed - best.vz;
    const t = Math.max((best.z - muzzleZ) / Math.max(closing, 1), 0.01);
    const targetY = best.y + KIND_SHAPE[best.kind].height * 0.5;
    return { vx: (best.x - sim.x) / t, vy: (targetY - muzzleY) / t, target: best };
  }
  const t = 45 / bulletSpeed;
  return { vx: (aimX * aimSpread - sim.x) / t, vy: 0, target: null };
}
