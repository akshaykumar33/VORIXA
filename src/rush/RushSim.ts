import { createRng, type Rng } from '../world/Rng';
import { spawnPattern, placeStarCoin, OPENING_CLEAR } from './Patterns';
import { statsFor, defaultLoadout, type CarStats, type WeaponId } from './Garage';

/** Time between shots, per weapon, before the rapid-fire upgrade. */
const WEAPON_INTERVAL: Record<WeaponId, number> = { blaster: 1, spread: 1.35, laser: 0.7 };
/** Spread gun: the side shots fan out this fast sideways (m/s). */
const SPREAD_VX = 9;

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

/**
 * Asphalt-style tricks. A close call is passing something with less than this much air between
 * the bodywork, sideways; it pays a little and tops up nitro, which rewards threading traffic.
 */
export const NEAR_MISS_GAP = 0.9;
/** A flip takes this long. Starting one too close to the ground is the risk. */
export const FLIP_DURATION = 0.55;
/** Height needed to start a flip: ramp launches clear it, ordinary hops only just. */
const FLIP_MIN_HEIGHT = 1.2;
/** Speed kept after landing mid-flip. */
const SLOPPY_LANDING_KEEP = 0.75;

/**
 * Mario Kart-style items. One is held at a time; driving through a box while holding one does
 * nothing, so using an item is always a choice about *when*.
 */
export type ItemKind = 'shield' | 'magnet' | 'rocket' | 'lightning' | 'giant';
export const ITEM_WEIGHTS: readonly [ItemKind, number][] = [
  ['shield', 26],
  ['magnet', 24],
  ['rocket', 26],
  ['lightning', 10],
  ['giant', 14]
];
export const SHIELD_SECONDS = 12;
export const MAGNET_SECONDS = 8;
export const GIANT_SECONDS = 6;
/** Lightning reaches this far up the road. */
const LIGHTNING_RANGE = 110;
/** A rocket's blast clears everything shootable this close to its target. */
const ROCKET_SPLASH = 4.5;
const MAGNET_REACH_X = 7;
const MAGNET_REACH_Z = 45;

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
  | 'ramp'
  | 'itembox'
  | 'starcoin'
  | 'goldcrate'
  | 'portal'
  | 'flag'
  | 'boss';

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
  ramp: { hx: 1.4, hz: 2.6, height: 0.6 },
  itembox: { hx: 0.8, hz: 0.8, height: 2.0 },
  starcoin: { hx: 0.9, hz: 0.9, height: 1.6 },
  goldcrate: { hx: 0.9, hz: 0.9, height: 1.6 },
  portal: { hx: 1.3, hz: 0.6, height: 3.0 },
  flag: { hx: 6, hz: 0.5, height: 5 },
  boss: { hx: 2.4, hz: 2.4, height: 2.4 }
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
  /** Set once the car has gone past it, so a close call or jump-over is counted once. */
  passed: boolean;
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
  /** A rocket from an item: kills outright and splashes. */
  rocket: boolean;
  /** A laser bolt: passes through what it hits instead of stopping. */
  pierce: boolean;
  /** The last entity a piercing bolt hit, so it damages each thing once. */
  lastHit: number;
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
  | 'gameOver'
  | 'nearMiss'
  | 'jumpOver'
  | 'flipStart'
  | 'flip'
  | 'sloppyLanding'
  | 'takedown'
  | 'itemGet'
  | 'itemUse'
  | 'shieldPop'
  | 'lightning'
  | 'starCoin'
  | 'secretReveal'
  | 'secret'
  | 'finish'
  | 'bossHit';

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
  /** Use the held item. Edge-triggered. */
  useItem?: boolean;
}

export type RushPhase = 'ready' | 'running' | 'over' | 'clear';

/**
 * A World Tour stage, as the simulation needs it. The tour data lives in `Tour.ts`; the sim only
 * knows the rules that differ from the endless road.
 */
export interface StageConfig {
  /** Metres to the finish flag; 0 for a boss stage, which ends when the boss falls. */
  length: number;
  difficulty: number;
  /** Hides a golden crate whose warp unlocks the world's secret stage. */
  hasSecret: boolean;
  boss: boolean;
  /** A secret bonus stage: coins and ramps, nothing that hurts. */
  bonus: boolean;
}

/** Boss health grows with the world: a few seconds of focus early on, a real fight at the end. */
export function bossHpFor(difficulty: number): number {
  return Math.round(30 + difficulty * 40);
}
/** How far along a stage the three star coins sit. */
const STAR_COIN_AT = [0.25, 0.55, 0.85];
/** Boss stages have no length; their star coins come at fixed distances instead. */
const BOSS_STAR_COIN_AT = [160, 420, 700];
const GOLD_CRATE_AT = 0.62;

const ENTITY_CAPACITY = 128;
const BULLET_CAPACITY = 24;
const FX_CAPACITY = 64;

export class RushSim {
  public phase: RushPhase = 'ready';
  /**
   * The driving school's road: nothing spawns on its own (lessons place their own targets) and
   * crashes cost nothing. Learning should never end in a game over.
   */
  public practice = false;

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
  /** The garage's effect on the car. Set before `reset`/`startStage`, which apply it. */
  public car: CarStats = statsFor(defaultLoadout());
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
  /** Drones (and bosses) only, for the "blast N drones" goals. */
  public droneKills = 0;
  public nearMisses = 0;
  public flips = 0;
  /** Seconds into the current flip, or -1 when not flipping. The renderer spins the car by it. */
  public flipTime = -1;
  public heldItem: ItemKind | null = null;

  /** The stage being played, or null on the endless road. */
  public stage: StageConfig | null = null;
  /** Which star coins this attempt has collected, as bits. */
  public starCoins = 0;
  public foundSecret = false;
  /** Hearts lost this attempt; a no-crash goal needs zero. */
  public crashes = 0;
  public bossMaxHp = 0;
  private bossId = 0;
  private starSlots: number[] = [];
  private goldCrateZ = Infinity;
  private flagPlaced = false;
  public shieldTime = 0;
  public magnetTime = 0;
  public giantTime = 0;

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

  public get seedValue(): number {
    return this.seed;
  }

  public constructor(private seed = 1) {
    this.rng = createRng(seed);
    for (let i = 0; i < ENTITY_CAPACITY; i++) {
      this.entities.push({ id: 0, kind: 'coin', alive: false, x: 0, y: 0, z: 0, vz: 0, hp: 0, age: 0, timer: 0, offset: 0, passed: false });
    }
    for (let i = 0; i < BULLET_CAPACITY; i++) {
      this.bullets.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, life: 0, targetId: 0, rocket: false, pierce: false, lastHit: 0 });
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
    this.hearts = this.car.maxHearts;
    this.invulnerable = 0;
    this.nitro = this.car.startNitro;
    this.nitroActive = false;
    this.score = this.coins = this.kills = this.droneKills = 0;
    this.nearMisses = this.flips = 0;
    this.flipTime = -1;
    this.heldItem = null;
    this.shieldTime = this.magnetTime = this.giantTime = 0;
    this.stage = null;
    this.starCoins = 0;
    this.foundSecret = false;
    this.crashes = 0;
    this.bossMaxHp = 0;
    this.bossId = 0;
    this.starSlots = [];
    this.goldCrateZ = Infinity;
    this.flagPlaced = false;
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

  public get maxHearts(): number {
    return this.car.maxHearts;
  }

  public start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'running';
    // Garage perks that begin every run.
    if (this.car.startShield) this.shieldTime = SHIELD_SECONDS;
    this.magnetTime = this.car.startMagnet;
    this.speed = Math.max(this.speed, START_SPEED);
    // The car has been cruising under the title; the road ahead is measured from where it is now.
    this.nextSpawnZ = this.z + OPENING_CLEAR;
    this.startZ = this.z;
  }

  /** Starts a World Tour stage straight away: no title cruise, the flag is already out there. */
  public startStage(config: StageConfig, seed: number): void {
    this.reset(seed);
    this.stage = config;
    this.start();
    const at = config.length > 0 ? STAR_COIN_AT.map((f) => f * config.length) : BOSS_STAR_COIN_AT;
    this.starSlots = at.map((d) => this.startZ + d);
    if (config.hasSecret && config.length > 0) this.goldCrateZ = this.startZ + GOLD_CRATE_AT * config.length;
    if (config.boss) {
      const boss = this.spawn('boss', 0, this.z + 90, 5);
      if (boss) {
        boss.hp = this.bossMaxHp = bossHpFor(config.difficulty);
        this.bossId = boss.id;
      }
    }
  }

  /** The boss's remaining health, or 0 when there is none. */
  public get bossHp(): number {
    if (!this.bossId) return 0;
    const boss = this.entities.find((e) => e.alive && e.id === this.bossId);
    return boss ? boss.hp : 0;
  }

  /** The finish line, in road distance, or Infinity on endless roads and boss stages. */
  public get finishZ(): number {
    return this.stage && this.stage.length > 0 ? this.startZ + this.stage.length : Infinity;
  }

  /** Metres covered since the run began. */
  public get distance(): number {
    return this.phase === 'ready' ? 0 : this.z - this.startZ;
  }

  /** 0 at the start, 1 once the run is long enough that everything is at full pressure. */
  public get difficulty(): number {
    if (this.stage) return this.stage.difficulty;
    return Math.min(this.distance / 3200, 1);
  }

  /** Bonus stages lay only coins and ramps. */
  public get bonusRoad(): boolean {
    return this.stage?.bonus === true;
  }

  /** While a boss is up, it is the only thing in the sky. */
  public get dronesAllowed(): boolean {
    return !this.stage?.boss;
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
      e.hp = kind === 'traffic' ? 3 : kind === 'drone' ? 2 : kind === 'crate' ? 1 : kind === 'goldcrate' ? 6 : 0;
      e.age = 0;
      e.timer = 1.4;
      e.offset = 0;
      e.passed = false;
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

    if (this.phase === 'over' || this.phase === 'clear') {
      this.speed *= Math.pow(this.phase === 'clear' ? 0.6 : 0.25, dt);
      this.z += this.speed * dt;
      this.integrateVertical(dt);
      this.updateEntities(dt);
      this.updateBullets(dt);
      return;
    }

    if (this.phase === 'running') this.elapsed += dt;
    this.steer(intent, dt);
    this.drive(intent, dt);
    if (intent.jump && this.phase === 'running') {
      if (this.grounded) this.jump(JUMP_VELOCITY, 'jump');
      else this.startFlip();
    }
    this.advanceFlip(dt);
    this.integrateVertical(dt);

    if (this.phase === 'running') {
      if (intent.useItem) this.useItem();
      this.shieldTime = Math.max(0, this.shieldTime - dt);
      this.magnetTime = Math.max(0, this.magnetTime - dt);
      this.giantTime = Math.max(0, this.giantTime - dt);
      this.fire(intent, dt);
      this.spawnAhead();
    }
    this.updateEntities(dt);
    this.updateBullets(dt);
    if (this.phase === 'running') {
      this.collide();
      this.checkPasses();
      if (this.z >= this.finishZ) this.clearStage();
    }

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
    const step = LANE_SWITCH_SPEED * this.car.handling * dt;
    const before = this.x;
    this.x = Math.abs(delta) <= step ? targetX : this.x + Math.sign(delta) * step;
    this.vx = dt > 0 ? (this.x - before) / dt : 0;
  }

  private drive(intent: RushIntent, dt: number): void {
    if (this.phase === 'running') {
      const cruise = Math.min(START_SPEED + this.elapsed * SPEED_RAMP, MAX_SPEED);
      this.nitroActive = intent.nitro && this.nitro > 0;
      if (this.nitroActive) this.nitro = Math.max(0, this.nitro - (NITRO_DRAIN / this.car.nitroCapacity) * dt);
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
      if (this.flipTime >= 0) {
        // Landed on the roof, more or less. It costs speed, not a heart: a failed trick should
        // sting without ending the run.
        this.flipTime = -1;
        this.speed *= SLOPPY_LANDING_KEEP;
        this.combo = 1;
        this.comboTimer = 0;
        this.emit('sloppyLanding', this.x, 0, this.z, 0);
      }
    }
  }

  private fire(intent: RushIntent, dt: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (!intent.fire || this.fireCooldown > 0) return;
    const weapon = this.car.weapon;
    this.fireCooldown = FIRE_INTERVAL * WEAPON_INTERVAL[weapon] * this.car.fireInterval;

    const muzzleY = this.y + 1.1;
    const muzzleZ = this.z + PLAYER_HALF_LENGTH;
    const aim = aimAt(this, intent.aimX, muzzleY, muzzleZ);
    // The spread gun adds two unguided side shots to the aimed one.
    const shots = weapon === 'spread' ? [0, -SPREAD_VX, SPREAD_VX] : [0];
    for (const side of shots) {
      const bullet = this.bullets.find((b) => !b.alive);
      if (!bullet) break;
      bullet.alive = true;
      bullet.x = this.x;
      bullet.y = muzzleY;
      bullet.z = muzzleZ;
      bullet.vx = aim.vx + side;
      bullet.vy = aim.vy;
      bullet.life = BULLET_LIFE;
      bullet.targetId = side === 0 ? aim.target?.id ?? 0 : 0;
      bullet.rocket = false;
      bullet.pierce = weapon === 'laser';
      bullet.lastHit = 0;
    }
    this.emit('fire', this.x, muzzleY, muzzleZ, weapon === 'laser' ? 2 : weapon === 'spread' ? 1 : 0);
  }

  private clearStage(): void {
    if (this.phase !== 'running') return;
    this.phase = 'clear';
    this.nitroActive = false;
    this.emit('finish', this.x, this.y + 2, this.z, this.score);
  }

  private spawnAhead(): void {
    if (this.practice) return;
    const end = this.finishZ;
    if (!this.flagPlaced && end < this.z + SPAWN_AHEAD) {
      this.spawn('flag', 0, end, 0);
      this.flagPlaced = true;
    }
    // Nothing is laid across the finish: the last stretch is a victory lap.
    while (this.nextSpawnZ < this.z + SPAWN_AHEAD && this.nextSpawnZ < end - 40) {
      let length: number;
      const slot = this.starSlots.findIndex((z) => z >= 0 && z <= this.nextSpawnZ + 30);
      if (slot >= 0) {
        this.starSlots[slot] = -1;
        length = placeStarCoin(this, this.rng, this.nextSpawnZ, slot);
      } else if (this.nextSpawnZ >= this.goldCrateZ) {
        this.goldCrateZ = Infinity;
        // Floating overhead: it has to be shot open, not driven into.
        this.spawn('goldcrate', LANE_WIDTH * this.rng.pick([-1, 0, 1]), this.nextSpawnZ + 20, 2.6);
        length = 24;
      } else {
        length = spawnPattern(this, this.rng, this.nextSpawnZ);
      }
      // Gaps grow with speed so reaction time, not distance, stays roughly constant.
      const gap = this.rng.range(16, 26) * (this.speed / START_SPEED) * 0.75;
      this.nextSpawnZ += length + Math.max(gap, 14);
    }
  }

  private updateEntities(dt: number): void {
    for (const e of this.entities) {
      if (!e.alive) continue;
      e.age += dt;
      if (this.magnetTime > 0 && e.kind === 'coin') this.pull(e, dt);
      if (e.kind === 'drone') this.updateDrone(e, dt);
      else if (e.kind === 'boss') this.updateBoss(e, dt);
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

  /**
   * The boss hangs just ahead and fires volleys. Every volley leaves at least one lane clear at
   * every distance — a boss that can corner you is not hard, just unfair. Below half health it
   * fires faster.
   */
  private updateBoss(e: Entity, dt: number): void {
    const before = e.z;
    e.z = this.z + 36;
    e.vz = dt > 0 ? (e.z - before) / dt : 0;
    e.y = 5 + Math.sin(e.age * 1.7) * 0.5;
    e.x = Math.sin(e.age * 0.45) * LANE_WIDTH * 0.9;
    if (this.phase !== 'running') return;
    e.timer -= dt;
    if (e.timer > 0) return;
    const enraged = e.hp < this.bossMaxHp / 2;
    e.timer = (1.9 - this.difficulty * 0.6) * (enraged ? 0.7 : 1);
    const volley = Math.floor(e.age / 2) % 3;
    const open = this.rng.pick([-1, 0, 1]);
    const shotZ = e.z - 2;
    if (volley === 0) {
      // Straight at you.
      this.spawn('shot', this.lane * LANE_WIDTH, shotZ, 0.9, -16);
    } else if (volley === 1) {
      // A wall with one gap.
      for (const lane of [-1, 0, 1]) if (lane !== open) this.spawn('shot', lane * LANE_WIDTH, shotZ, 0.9, -16);
    } else {
      // A staircase: the gap moves, so you have to move with it.
      const second = open === 1 ? 0 : open + 1;
      for (const lane of [-1, 0, 1]) if (lane !== open) this.spawn('shot', lane * LANE_WIDTH, shotZ, 0.9, -16);
      for (const lane of [-1, 0, 1]) if (lane !== second) this.spawn('shot', lane * LANE_WIDTH, shotZ + 14, 0.9, -16);
    }
    this.emit('enemyFire', e.x, e.y, e.z, 0);
  }

  /** Damages the boss by `amount`; returns true if that finished it. */
  private hurtBoss(e: Entity, amount: number): boolean {
    e.hp -= amount;
    this.emit('bossHit', e.x, e.y + 1, e.z, e.hp);
    if (e.hp > 0) return false;
    this.destroy(e, 'explode');
    return true;
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
        if (b.pierce && b.lastHit === e.id) continue;
        // A laser keeps going; everything else stops at the first thing it hits.
        if (b.pierce) b.lastHit = e.id;
        else b.alive = false;
        if (b.rocket) {
          // Everything shootable near the target goes with it — except a boss, which takes a
          // big hit rather than falling to a single item.
          for (const other of this.entities) {
            if (!other.alive || !isShootable(other.kind)) continue;
            if (Math.abs(other.x - e.x) <= ROCKET_SPLASH && Math.abs(other.z - e.z) <= ROCKET_SPLASH) {
              if (other.kind === 'boss') this.hurtBoss(other, 8);
              else this.destroy(other, other.kind === 'crate' || other.kind === 'goldcrate' ? 'smash' : 'explode');
            }
          }
          break;
        }
        if (e.kind === 'boss') {
          this.hurtBoss(e, 1);
          if (!b.pierce) break;
          continue;
        }
        e.hp -= 1;
        this.emit('hit', b.x, b.y, e.z - shape.hz, 0);
        if (e.hp <= 0) this.destroy(e, e.kind === 'crate' || e.kind === 'goldcrate' ? 'smash' : 'explode');
        if (!b.pierce) break;
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
      if (!e.alive || e.kind === 'drone' || e.kind === 'boss' || e.kind === 'flag') continue;
      const shape = KIND_SHAPE[e.kind];
      if (Math.abs(this.x - e.x) > PLAYER_HALF_WIDTH + shape.hx) continue;
      if (Math.abs(this.z - e.z) > PLAYER_HALF_LENGTH + shape.hz) continue;
      // Clearing the top of an obstacle is the whole point of jumping.
      if (this.y >= e.y + shape.height || this.y + 1.3 <= e.y) continue;
      this.touch(e);
    }
  }

  /** Magnet: coins nearby slide toward the car and are collected as it reaches them. */
  private pull(e: Entity, dt: number): void {
    const dz = e.z - this.z;
    if (dz < -1 || dz > MAGNET_REACH_Z || Math.abs(e.x - this.x) > MAGNET_REACH_X) return;
    const k = 1 - Math.exp(-6 * dt);
    e.x += (this.x - e.x) * k;
    e.y += (this.y + 0.6 - e.y) * k;
    e.z -= Math.max(dz, 0) * k;
  }

  public rollItem(): ItemKind {
    let total = 0;
    for (const [, w] of ITEM_WEIGHTS) total += w;
    let roll = this.rng.next() * total;
    for (const [kind, w] of ITEM_WEIGHTS) {
      roll -= w;
      if (roll <= 0) return kind;
    }
    return 'shield';
  }

  private useItem(): void {
    const item = this.heldItem;
    if (!item) return;
    this.heldItem = null;
    this.emit('itemUse', this.x, this.y + 1, this.z, ITEM_WEIGHTS.findIndex(([k]) => k === item));
    switch (item) {
      case 'shield':
        this.shieldTime = SHIELD_SECONDS;
        break;
      case 'magnet':
        this.magnetTime = MAGNET_SECONDS;
        break;
      case 'giant':
        this.giantTime = GIANT_SECONDS;
        break;
      case 'lightning':
        this.emit('lightning', this.x, 0, this.z, 0);
        for (const e of this.entities) {
          if (!e.alive || e.z < this.z || e.z > this.z + LIGHTNING_RANGE) continue;
          if (e.kind === 'shot') e.alive = false;
          else if (e.kind === 'boss') this.hurtBoss(e, 5);
          else if (isShootable(e.kind) && e.kind !== 'crate' && e.kind !== 'goldcrate') this.destroy(e, 'explode');
        }
        break;
      case 'rocket':
        this.launchRocket();
        break;
    }
  }

  private launchRocket(): void {
    const bullet = this.bullets.find((b) => !b.alive);
    if (!bullet) return;
    // The nearest enemy ahead, drones first: a rocket is for the thing that is shooting at you.
    let target: Entity | null = null;
    let best = Infinity;
    for (const e of this.entities) {
      if (!e.alive || !isShootable(e.kind)) continue;
      const dz = e.z - this.z;
      if (dz < 3 || dz > 120) continue;
      const score = dz - (e.kind === 'drone' ? 60 : 0);
      if (score < best) {
        best = score;
        target = e;
      }
    }
    bullet.alive = true;
    bullet.rocket = true;
    bullet.x = this.x;
    bullet.y = this.y + 1.4;
    bullet.z = this.z + PLAYER_HALF_LENGTH;
    bullet.vx = 0;
    bullet.vy = 0;
    bullet.life = 2.5;
    bullet.targetId = target?.id ?? 0;
    bullet.pierce = false;
    bullet.lastHit = 0;
  }

  private startFlip(): void {
    if (this.flipTime >= 0 || this.y < FLIP_MIN_HEIGHT) return;
    this.flipTime = 0;
    this.emit('flipStart', this.x, this.y, this.z, 0);
  }

  private advanceFlip(dt: number): void {
    if (this.flipTime < 0) return;
    this.flipTime += dt;
    if (this.flipTime >= FLIP_DURATION) {
      // A clean rotation: paid now, before landing, so chaining a second flip is the choice.
      this.flipTime = -1;
      this.flips++;
      this.nitro = Math.min(1, this.nitro + 0.25);
      const points = 150 * this.combo;
      this.bonusScore += points;
      this.combo = Math.min(MAX_COMBO, this.combo + 1);
      this.comboTimer = COMBO_WINDOW;
      this.emit('flip', this.x, this.y + 1, this.z, points);
    }
  }

  /**
   * Close calls and jump-overs, judged once per obstacle as the car's front passes it.
   * Anything that hit the car is already gone, so everything that reaches here was dodged.
   */
  private checkPasses(): void {
    for (const e of this.entities) {
      if (!e.alive || e.passed) continue;
      if (e.kind !== 'traffic' && e.kind !== 'truck' && e.kind !== 'barrier') continue;
      const shape = KIND_SHAPE[e.kind];
      if (e.z + shape.hz > this.z) continue;
      e.passed = true;
      const gap = Math.abs(this.x - e.x) - (PLAYER_HALF_WIDTH + shape.hx);
      if (gap < 0 && this.y >= shape.height) {
        const points = 75 * this.combo;
        this.bonusScore += points;
        this.emit('jumpOver', e.x, shape.height + 0.5, e.z, points);
      } else if (gap >= 0 && gap < NEAR_MISS_GAP) {
        this.nearMisses++;
        this.nitro = Math.min(1, this.nitro + 0.06);
        const points = 50 * this.combo;
        this.bonusScore += points;
        this.emit('nearMiss', e.x, 1.2, e.z, points);
      }
    }
  }

  private touch(e: Entity): void {
    // Giant: everything in the way is flattened, trucks included.
    if (this.giantTime > 0 && (e.kind === 'barrier' || e.kind === 'traffic' || e.kind === 'truck' || e.kind === 'crate' || e.kind === 'shot')) {
      if (e.kind === 'shot') e.alive = false;
      else this.destroy(e, e.kind === 'crate' ? 'smash' : 'takedown');
      return;
    }
    switch (e.kind) {
      case 'starcoin':
        e.alive = false;
        this.starCoins |= 1 << e.hp;
        this.bonusScore += 500;
        this.emit('starCoin', e.x, e.y + 0.8, e.z, e.hp);
        return;
      case 'portal':
        e.alive = false;
        this.foundSecret = true;
        this.bonusScore += 1000;
        this.emit('secret', e.x, 1.5, e.z, 1000);
        return;
      case 'goldcrate':
        // Driving into it (you would have to jump) does nothing: it only opens to shots.
        return;
      case 'itembox':
        e.alive = false;
        if (!this.heldItem) {
          this.heldItem = this.rollItem();
          this.emit('itemGet', e.x, e.y + 1, e.z, ITEM_WEIGHTS.findIndex(([k]) => k === this.heldItem));
        }
        return;
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
        this.hearts = Math.min(this.car.maxHearts, this.hearts + 1);
        e.alive = false;
        this.emit('pickup', e.x, e.y, e.z, 1);
        return;
      case 'ramp':
        if (this.grounded) this.jump(RAMP_VELOCITY, 'ramp');
        return;
      case 'crate':
        // Crates exist to be smashed. They feed the nitro, which is how ramming pays for itself.
        this.nitro = Math.min(1, this.nitro + 0.08);
        if (this.car.magnetOnSmash) this.magnetTime = Math.max(this.magnetTime, 2);
        this.destroy(e, 'smash');
        return;
      case 'barrier':
      case 'traffic':
        // Nitro turns the car into a battering ram. Trucks are the exception: too big to plough.
        if (this.nitroActive) {
          this.destroy(e, e.kind === 'traffic' ? 'takedown' : 'explode');
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
    if (this.shieldTime > 0) {
      // The bubble takes the hit instead of a heart, then it is gone.
      this.shieldTime = 0;
      e.alive = false;
      this.invulnerable = 0.6;
      this.emit('shieldPop', this.x, this.y + 1, this.z + PLAYER_HALF_LENGTH, 0);
      return;
    }
    if (this.practice) {
      e.alive = false;
      this.emit('crash', this.x, this.y + 0.8, this.z + PLAYER_HALF_LENGTH, this.hearts);
      this.invulnerable = INVULNERABLE_AFTER_CRASH;
      return;
    }
    this.hearts--;
    this.crashes++;
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
    if (e.kind === 'traffic' || e.kind === 'drone' || e.kind === 'boss') this.kills++;
    if (e.kind === 'drone' || e.kind === 'boss') this.droneKills++;
    if (e.kind === 'goldcrate') {
      // The secret: a warp portal drops onto the road ahead, in the crate's lane.
      this.spawn('portal', e.x, e.z + 45, 0);
      this.emit('secretReveal', e.x, e.y, e.z, 0);
    }
    if (e.kind === 'boss') {
      this.bonusScore += 2000;
      this.emit(type, e.x, e.y + 1, e.z, 2000);
      this.clearStage();
      return;
    }
    // A takedown is worth more than a shot-down car: you had to commit to the ram.
    const points = this.award(e, true) + (type === 'takedown' ? 100 * this.combo : 0);
    if (type === 'takedown') this.bonusScore += 100 * this.combo;
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
  return kind === 'drone' || kind === 'traffic' || kind === 'crate' || kind === 'goldcrate' || kind === 'boss';
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
    const priority = e.kind === 'boss' ? 3 : e.kind === 'drone' ? 2 : e.kind === 'goldcrate' ? 1.5 : 0;
    const score = off * 4 + dz * 0.05 - priority;
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
