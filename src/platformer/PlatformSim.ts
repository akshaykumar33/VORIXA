import {
  tileAt,
  setTile,
  isSolid,
  PLATFORM,
  SPIKES,
  QUESTION,
  HEART_BLOCK,
  USED,
  type LevelData,
  type EnemyKind
} from './Level';

/**
 * On Foot: the platformer, as a pure simulation.
 *
 * Movement is tuned for the feel players know from Mario, and each piece is there for a reason:
 *
 *   - **Acceleration**, not instant speed: running has weight, and turning around takes a beat.
 *   - **Variable jump height**: gravity is lighter while jump is held on the way up, so a tap
 *     hops and a hold leaps.
 *   - **Coyote time**: a jump pressed just after running off a ledge still counts.
 *   - **Jump buffering**: a jump pressed just before landing fires on landing.
 *
 * Without the last two a platformer feels like it eats inputs, which is the most common reason
 * players call one "unfair".
 */

export const HERO_HALF_WIDTH = 0.38;
export const HERO_HEIGHT = 1.5;
export const RUN_SPEED = 7.5;
const GROUND_ACCEL = 45;
const TURN_ACCEL = 80;
const AIR_ACCEL = 30;
export const JUMP_VELOCITY = 14.5;
const GRAVITY_RISING = 38;
const GRAVITY_FALLING = 70;
const MAX_FALL = 22;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
const STOMP_BOUNCE = 10;
const STOMP_BOUNCE_HELD = 14;
const INVULNERABLE_AFTER_HIT = 1.5;
/** Falling this far below the level is falling into a pit. */
const PIT_Y = -3;
export const MAX_HEARTS = 3;

const FIRE_INTERVAL = 0.2;
const BULLET_SPEED = 20;
const BULLET_LIFE = 0.9;
const ENEMY_BULLET_SPEED = 8;

export interface PlatformIntent {
  /** -1 left, 0 stop, +1 right; analog in between for hands. */
  move: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  fire: boolean;
}

export interface Enemy {
  kind: EnemyKind;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  hp: number;
  timer: number;
  age: number;
  /** Which way it faces: -1 left, +1 right. */
  facing: number;
}

export interface Shot {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  life: number;
  hostile: boolean;
}

export type PlatformFxType =
  | 'jump'
  | 'land'
  | 'coin'
  | 'starCoin'
  | 'bump'
  | 'blockCoin'
  | 'heart'
  | 'stomp'
  | 'hurt'
  | 'pit'
  | 'fire'
  | 'enemyFire'
  | 'enemyKilled'
  | 'checkpoint'
  | 'flag'
  | 'gameOver';

export interface PlatformFx {
  type: PlatformFxType;
  x: number;
  y: number;
  amount: number;
}

export type PlatformPhase = 'playing' | 'clear' | 'over';

const ENEMY_SIZE: Record<EnemyKind, { hw: number; h: number }> = {
  walker: { hw: 0.45, h: 0.9 },
  flyer: { hw: 0.45, h: 0.8 },
  turret: { hw: 0.5, h: 1.2 }
};

export class PlatformSim {
  public phase: PlatformPhase = 'playing';
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public onGround = false;
  public facing = 1;
  public hearts = MAX_HEARTS;
  public invulnerable = 0;
  public coins = 0;
  public score = 0;
  public starCoins = 0;
  public elapsed = 0;
  public kills = 0;

  public readonly enemies: Enemy[];
  public readonly shots: Shot[] = [];
  public readonly coinTaken: boolean[];
  public readonly fx: PlatformFx[] = [];
  public fxCount = 0;

  private coyote = 0;
  private jumpBuffer = 0;
  private fireCooldown = 0;
  private respawn: { x: number; y: number };
  private checkpointsReached = 0;
  private stompChain = 0;

  public constructor(public readonly level: LevelData) {
    this.respawn = { ...level.start };
    this.x = level.start.x;
    this.y = level.start.y;
    this.enemies = level.enemies.map((e) => ({
      kind: e.kind,
      alive: true,
      x: e.x,
      y: e.y,
      vx: e.kind === 'walker' ? -2 : 0,
      vy: 0,
      baseX: e.x,
      baseY: e.y,
      hp: e.kind === 'turret' ? 3 : 1,
      timer: 1.5,
      age: 0,
      facing: -1
    }));
    this.coinTaken = level.coins.map(() => false);
    for (let i = 0; i < 24; i++) this.shots.push({ alive: false, x: 0, y: 0, vx: 0, life: 0, hostile: false });
    for (let i = 0; i < 48; i++) this.fx.push({ type: 'coin', x: 0, y: 0, amount: 0 });
  }

  public update(intent: PlatformIntent, dt: number): void {
    this.fxCount = 0;
    if (this.phase !== 'playing') return;
    this.elapsed += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    this.run(intent, dt);
    this.jump(intent, dt);
    this.moveX(dt);
    this.moveY(intent, dt);
    this.fire(intent, dt);

    this.updateEnemies(dt);
    this.updateShots(dt);
    this.touchEnemies(intent);
    this.pickups();
    this.hazards();

    if (this.y < PIT_Y) this.fallIntoPit();
    if (this.x >= this.level.flag.x - 0.3 && this.phase === 'playing') this.reachFlag();
  }

  // ─── Hero movement ────────────────────────────────────────────────────────────────────────

  private run(intent: PlatformIntent, dt: number): void {
    const move = Math.max(-1, Math.min(1, intent.move));
    if (Math.abs(move) > 0.1) this.facing = Math.sign(move);
    const target = move * RUN_SPEED;
    const turning = Math.sign(target) !== 0 && Math.sign(target) !== Math.sign(this.vx) && Math.abs(this.vx) > 0.5;
    const accel = this.onGround ? (turning ? TURN_ACCEL : GROUND_ACCEL) : AIR_ACCEL;
    const delta = target - this.vx;
    const step = accel * dt;
    this.vx = Math.abs(delta) <= step ? target : this.vx + Math.sign(delta) * step;
  }

  private jump(intent: PlatformIntent, dt: number): void {
    this.coyote = this.onGround ? COYOTE_TIME : Math.max(0, this.coyote - dt);
    this.jumpBuffer = intent.jumpPressed ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = JUMP_VELOCITY;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.emit('jump', this.x, this.y, 0);
    }
    // Lighter gravity while rising with jump held: tap to hop, hold to leap.
    const g = this.vy > 0 && intent.jumpHeld ? GRAVITY_RISING : GRAVITY_FALLING;
    this.vy = Math.max(this.vy - g * dt, -MAX_FALL);
  }

  private moveX(dt: number): void {
    this.x += this.vx * dt;
    const bottom = this.y + 0.05;
    const top = this.y + HERO_HEIGHT - 0.05;
    if (this.vx > 0) {
      const edge = this.x + HERO_HALF_WIDTH;
      for (let y = Math.floor(bottom); y <= Math.floor(top); y++) {
        if (isSolid(tileAt(this.level, edge, y))) {
          this.x = Math.floor(edge) - HERO_HALF_WIDTH - 0.001;
          this.vx = 0;
          break;
        }
      }
    } else if (this.vx < 0) {
      const edge = this.x - HERO_HALF_WIDTH;
      for (let y = Math.floor(bottom); y <= Math.floor(top); y++) {
        if (isSolid(tileAt(this.level, edge, y))) {
          this.x = Math.floor(edge) + 1 + HERO_HALF_WIDTH + 0.001;
          this.vx = 0;
          break;
        }
      }
    }
  }

  private moveY(intent: PlatformIntent, dt: number): void {
    const before = this.y;
    this.y += this.vy * dt;
    const left = this.x - HERO_HALF_WIDTH + 0.02;
    const right = this.x + HERO_HALF_WIDTH - 0.02;
    const wasOnGround = this.onGround;
    this.onGround = false;

    if (this.vy <= 0) {
      const row = Math.floor(this.y);
      for (const cx of [left, right]) {
        const t = tileAt(this.level, cx, row);
        // One-way platforms only catch you from above.
        const catches = isSolid(t) || (t === PLATFORM && before >= row + 1 - 0.001);
        if (catches) {
          this.y = row + 1;
          if (!wasOnGround && this.vy < -4) this.emit('land', this.x, this.y, -this.vy);
          this.vy = 0;
          this.onGround = true;
          this.stompChain = 0;
          break;
        }
      }
    } else {
      const head = this.y + HERO_HEIGHT;
      const row = Math.floor(head);
      // Bump the block most under the hero's head first, like Mario.
      const order = Math.abs(this.x - Math.floor(left) - 0.5) < Math.abs(this.x - Math.floor(right) - 0.5) ? [left, right] : [right, left];
      for (const cx of order) {
        const t = tileAt(this.level, cx, row);
        if (isSolid(t)) {
          this.y = row - HERO_HEIGHT;
          this.vy = 0;
          this.bump(cx, row, t);
          break;
        }
      }
    }
    void intent;
  }

  private bump(x: number, y: number, tile: number): void {
    const cx = Math.floor(x) + 0.5;
    this.emit('bump', cx, y, tile);
    if (tile === QUESTION) {
      setTile(this.level, x, y, USED);
      this.coins++;
      this.score += 100;
      this.emit('blockCoin', cx, y + 1, 100);
    } else if (tile === HEART_BLOCK) {
      setTile(this.level, x, y, USED);
      this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
      this.emit('heart', cx, y + 1, this.hearts);
    }
  }

  // ─── Shooting ─────────────────────────────────────────────────────────────────────────────

  private fire(intent: PlatformIntent, dt: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (!intent.fire || this.fireCooldown > 0) return;
    const shot = this.shots.find((s) => !s.alive);
    if (!shot) return;
    this.fireCooldown = FIRE_INTERVAL;
    shot.alive = true;
    shot.hostile = false;
    shot.x = this.x + this.facing * 0.5;
    shot.y = this.y + 0.8;
    shot.vx = this.facing * BULLET_SPEED;
    shot.life = BULLET_LIFE;
    this.emit('fire', shot.x, shot.y, this.facing);
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.life -= dt;
      s.x += s.vx * dt;
      if (s.life <= 0 || isSolid(tileAt(this.level, s.x, s.y))) {
        s.alive = false;
        continue;
      }
      if (s.hostile) {
        if (this.invulnerable <= 0 && Math.abs(s.x - this.x) < HERO_HALF_WIDTH + 0.15 && s.y > this.y && s.y < this.y + HERO_HEIGHT) {
          s.alive = false;
          this.hurt(Math.sign(s.vx));
        }
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const size = ENEMY_SIZE[e.kind];
        if (Math.abs(s.x - e.x) < size.hw + 0.2 && s.y > e.y - 0.1 && s.y < e.y + size.h + 0.1) {
          s.alive = false;
          e.hp--;
          if (e.hp <= 0) this.kill(e, 150);
          break;
        }
      }
    }
  }

  // ─── Enemies ──────────────────────────────────────────────────────────────────────────────

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.age += dt;
      // Enemies far off screen wait; a level should not play itself before you arrive.
      if (Math.abs(e.x - this.x) > 22) continue;
      if (e.kind === 'walker') this.updateWalker(e, dt);
      else if (e.kind === 'flyer') {
        e.x = e.baseX + Math.sin(e.age * 0.9) * 2.5;
        e.y = e.baseY + Math.sin(e.age * 2.2) * 1.1;
        e.facing = Math.cos(e.age * 0.9) >= 0 ? 1 : -1;
      } else {
        this.updateTurret(e, dt);
      }
    }
  }

  /** Walks, falls off nothing (turns at ledges and walls), like a Goomba with better manners. */
  private updateWalker(e: Enemy, dt: number): void {
    const size = ENEMY_SIZE.walker;
    e.vy = Math.max(e.vy - GRAVITY_FALLING * dt, -MAX_FALL);
    e.y += e.vy * dt;
    const row = Math.floor(e.y);
    if (e.vy <= 0 && (isSolid(tileAt(this.level, e.x, row)) || tileAt(this.level, e.x, row) === PLATFORM)) {
      e.y = row + 1;
      e.vy = 0;
    }
    const ahead = e.x + Math.sign(e.vx) * (size.hw + 0.05);
    const wall = isSolid(tileAt(this.level, ahead, e.y + 0.3));
    const below = tileAt(this.level, ahead, e.y - 0.5);
    const ledge = e.vy === 0 && !isSolid(below) && below !== PLATFORM;
    if (wall || ledge) e.vx = -e.vx;
    e.x += e.vx * dt;
    e.facing = Math.sign(e.vx) || e.facing;
    if (e.y < PIT_Y) e.alive = false;
  }

  /** Faces the hero and fires along the ground when the hero is in range. */
  private updateTurret(e: Enemy, dt: number): void {
    e.facing = this.x < e.x ? -1 : 1;
    const dx = Math.abs(this.x - e.x);
    if (dx > 13 || Math.abs(this.y - e.y) > 3) return;
    e.timer -= dt;
    if (e.timer > 0) return;
    e.timer = 2.2;
    const shot = this.shots.find((s) => !s.alive);
    if (!shot) return;
    shot.alive = true;
    shot.hostile = true;
    shot.x = e.x + e.facing * 0.6;
    shot.y = e.y + 0.75;
    shot.vx = e.facing * ENEMY_BULLET_SPEED;
    shot.life = 3;
    this.emit('enemyFire', shot.x, shot.y, e.facing);
  }

  private touchEnemies(intent: PlatformIntent): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const size = ENEMY_SIZE[e.kind];
      if (Math.abs(this.x - e.x) > HERO_HALF_WIDTH + size.hw) continue;
      if (this.y > e.y + size.h || this.y + HERO_HEIGHT < e.y) continue;
      // Coming down on top of it is a stomp; any other touch hurts.
      if (this.vy < 0 && this.y >= e.y + size.h * 0.5) {
        this.stompChain++;
        this.vy = intent.jumpHeld ? STOMP_BOUNCE_HELD : STOMP_BOUNCE;
        this.emit('stomp', e.x, e.y + size.h, this.stompChain);
        this.kill(e, 100 * this.stompChain);
      } else if (this.invulnerable <= 0) {
        this.hurt(Math.sign(this.x - e.x) || 1);
      }
    }
  }

  private kill(e: Enemy, points: number): void {
    e.alive = false;
    this.kills++;
    this.score += points;
    this.emit('enemyKilled', e.x, e.y + 0.5, points);
  }

  // ─── Pickups, hazards, the ends of the level ──────────────────────────────────────────────

  private pickups(): void {
    const cx = this.x;
    const cy = this.y + HERO_HEIGHT / 2;
    this.level.coins.forEach((c, i) => {
      if (this.coinTaken[i]) return;
      if (Math.abs(c.x - cx) < 0.75 && Math.abs(c.y + 0.5 - cy) < 1.1) {
        this.coinTaken[i] = true;
        this.coins++;
        this.score += 10;
        this.emit('coin', c.x, c.y + 0.5, 10);
      }
    });
    this.level.starCoins.forEach((s, i) => {
      if (this.starCoins & (1 << i)) return;
      if (Math.abs(s.x - cx) < 0.9 && Math.abs(s.y + 0.5 - cy) < 1.3) {
        this.starCoins |= 1 << i;
        this.score += 1000;
        this.emit('starCoin', s.x, s.y + 0.5, i);
      }
    });
    this.level.checkpoints.forEach((c, i) => {
      if (i < this.checkpointsReached || this.x < c.x) return;
      this.checkpointsReached = i + 1;
      this.respawn = { x: c.x, y: c.y };
      this.emit('checkpoint', c.x, c.y, i);
    });
  }

  private hazards(): void {
    if (this.invulnerable > 0) return;
    const left = this.x - HERO_HALF_WIDTH + 0.1;
    const right = this.x + HERO_HALF_WIDTH - 0.1;
    // Spikes are the lower half of their tile: touching the points, not the air above them.
    const row = Math.floor(this.y);
    for (const cx of [left, right]) {
      if (tileAt(this.level, cx, row) === SPIKES && this.y - row < 0.5) {
        this.vy = 11;
        this.hurt(0);
        return;
      }
    }
  }

  private hurt(direction: number): void {
    if (this.invulnerable > 0 || this.phase !== 'playing') return;
    this.hearts--;
    this.invulnerable = INVULNERABLE_AFTER_HIT;
    this.vx = direction * 6;
    this.vy = Math.max(this.vy, 7);
    this.emit('hurt', this.x, this.y + 1, this.hearts);
    if (this.hearts <= 0) this.gameOver();
  }

  private fallIntoPit(): void {
    this.hearts--;
    this.emit('pit', this.x, 0, this.hearts);
    if (this.hearts <= 0) {
      this.gameOver();
      return;
    }
    this.x = this.respawn.x;
    this.y = this.respawn.y;
    this.vx = this.vy = 0;
    this.invulnerable = INVULNERABLE_AFTER_HIT;
  }

  private gameOver(): void {
    this.phase = 'over';
    this.emit('gameOver', this.x, this.y, this.score);
  }

  private reachFlag(): void {
    this.phase = 'clear';
    // Grab the pole high for a bigger bonus, as tradition demands.
    const height = Math.max(0, this.y - this.level.flag.y);
    const bonus = 500 + Math.round(height) * 400;
    this.score += bonus;
    this.emit('flag', this.x, this.y, bonus);
  }

  private emit(type: PlatformFxType, x: number, y: number, amount: number): void {
    if (this.fxCount >= this.fx.length) return;
    const f = this.fx[this.fxCount++];
    f.type = type;
    f.x = x;
    f.y = y;
    f.amount = amount;
  }
}
