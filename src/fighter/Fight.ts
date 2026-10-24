/**
 * Akhada (ADR-0016): a one-on-one fight as pure data and rules, Street Fighter style.
 *
 * The fight runs on a line: `x` along the stage in metres, `y` up. Each fighter faces the other.
 * Moves have frame data in seconds (startup, active, recovery), and a hit lands when the attacker's
 * active reach covers the defender. Holding away from the opponent blocks: standing blocks high and
 * mid, crouching blocks low and mid. Specials are motion inputs read from a short history of
 * directions (quarter circle forward or back, then a button), or the shortcut buttons, which the
 * CPU and anyone who prefers them use.
 *
 * Fixed step, seeded randomness, no DOM: the same inputs always give the same fight.
 */

export const STEP = 1 / 120;
export const STAGE_HALF = 6;
export const MAX_HP = 1000;
export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;
const GRAVITY = 26;
const WALK = 2.1;
const BACK_WALK = 1.6;
const JUMP_V = 9.2;
const JUMP_X = 2.6;
const BODY = 0.62;
/** Directions held within this window count toward a motion input. */
const MOTION_WINDOW = 0.4;

export type Height = 'high' | 'mid' | 'low';
export type MoveId =
  | 'jab' | 'cross' | 'hook' | 'frontKick' | 'roundhouse'
  | 'lowJab' | 'lowKick' | 'sweep' | 'airPunch' | 'airKick'
  | 'blast' | 'dashStrike' | 'super';
export type Button = 'lp' | 'hp' | 'lk' | 'hk';
export type State = 'stand' | 'walk' | 'crouch' | 'jump' | 'attack' | 'hitstun' | 'blockstun' | 'knockdown' | 'getup' | 'ko' | 'win';

export interface Move {
  startup: number;
  active: number;
  recover: number;
  damage: number;
  /** Reach in front of the fighter's centre, metres. */
  reach: number;
  height: Height;
  hitstun: number;
  blockstun: number;
  /** Pushback on hit and on block, metres per second. */
  push: number;
  knockdown?: boolean;
  /** Forward speed while active (dashes and lunges). */
  lunge?: number;
  /** Fires a projectile at the start of the active frames instead of hitting in place. */
  projectile?: { speed: number; damage: number; chip: number; size: number };
  /** Damage a block still takes (specials only). */
  chip?: number;
  meterCost?: number;
}

export const MOVES: Record<MoveId, Move> = {
  jab: { startup: 0.05, active: 0.05, recover: 0.12, damage: 40, reach: 0.95, height: 'mid', hitstun: 0.25, blockstun: 0.15, push: 1.2 },
  cross: { startup: 0.08, active: 0.06, recover: 0.2, damage: 70, reach: 1.05, height: 'mid', hitstun: 0.35, blockstun: 0.2, push: 1.8 },
  hook: { startup: 0.14, active: 0.08, recover: 0.3, damage: 110, reach: 1.05, height: 'mid', hitstun: 0.45, blockstun: 0.26, push: 2.6 },
  frontKick: { startup: 0.1, active: 0.07, recover: 0.22, damage: 60, reach: 1.2, height: 'mid', hitstun: 0.3, blockstun: 0.18, push: 2 },
  roundhouse: { startup: 0.18, active: 0.09, recover: 0.36, damage: 120, reach: 1.35, height: 'mid', hitstun: 0.5, blockstun: 0.28, push: 3 },
  lowJab: { startup: 0.05, active: 0.05, recover: 0.12, damage: 30, reach: 0.9, height: 'mid', hitstun: 0.22, blockstun: 0.14, push: 1 },
  lowKick: { startup: 0.07, active: 0.06, recover: 0.18, damage: 45, reach: 1.15, height: 'low', hitstun: 0.26, blockstun: 0.16, push: 1.4 },
  sweep: { startup: 0.14, active: 0.08, recover: 0.42, damage: 90, reach: 1.35, height: 'low', hitstun: 0.6, blockstun: 0.26, push: 2, knockdown: true },
  airPunch: { startup: 0.05, active: 0.2, recover: 0.05, damage: 70, reach: 1.0, height: 'high', hitstun: 0.4, blockstun: 0.22, push: 1.6 },
  airKick: { startup: 0.07, active: 0.25, recover: 0.05, damage: 95, reach: 1.25, height: 'high', hitstun: 0.45, blockstun: 0.24, push: 2 },
  blast: { startup: 0.28, active: 0.05, recover: 0.42, damage: 0, reach: 0, height: 'mid', hitstun: 0.4, blockstun: 0.25, push: 2.2, projectile: { speed: 6.5, damage: 100, chip: 15, size: 0.35 } },
  dashStrike: { startup: 0.12, active: 0.32, recover: 0.4, damage: 120, reach: 0.9, height: 'mid', hitstun: 0.6, blockstun: 0.3, push: 3, knockdown: true, lunge: 7.5, chip: 12 },
  super: { startup: 0.45, active: 0.05, recover: 0.6, damage: 0, reach: 0, height: 'mid', hitstun: 0.8, blockstun: 0.4, push: 4, knockdown: true, projectile: { speed: 9, damage: 320, chip: 60, size: 0.7 }, meterCost: 100 }
};

export interface FighterDef {
  id: string;
  name: string;
  /** The cast model drawn for them. */
  model: string;
  /** Their energy colour (blasts, super, UI). */
  colour: number;
  title: string;
}

export interface FightInput {
  /** -1..1, screen left/right. */
  x: number;
  /** -1 down (crouch), 1 up (jump). */
  y: number;
  lp: boolean;
  hp: boolean;
  lk: boolean;
  hk: boolean;
  /** Shortcut specials, for the CPU and for anyone who prefers a button to a motion. */
  blast?: boolean;
  dash?: boolean;
  super?: boolean;
}

export interface Fighter {
  slot: 0 | 1;
  def: FighterDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  /** Super meter, 0..100. */
  meter: number;
  state: State;
  t: number;
  move: MoveId | null;
  /** This move has connected (one hit per move). */
  landed: boolean;
  stun: number;
  /** Hits taken in the current combo, for scaling and the counter. */
  comboTaken: number;
  /** Was the last thing that touched them blocked. */
  blocking: boolean;
  wins: number;
}

export interface Projectile {
  id: number;
  owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  damage: number;
  chip: number;
  size: number;
  super: boolean;
}

export type FightEvent =
  | { type: 'hit'; slot: 0 | 1; x: number; y: number; damage: number; heavy: boolean; combo: number }
  | { type: 'block'; slot: 0 | 1; x: number; y: number }
  | { type: 'whiff'; slot: 0 | 1; move: MoveId }
  | { type: 'attack'; slot: 0 | 1; move: MoveId }
  | { type: 'projectile'; slot: 0 | 1; super: boolean }
  | { type: 'clash'; x: number; y: number }
  | { type: 'knockdown'; slot: 0 | 1 }
  | { type: 'ko'; slot: 0 | 1 }
  | { type: 'round'; round: number }
  | { type: 'fight' }
  | { type: 'timeup' }
  | { type: 'roundEnd'; winner: 0 | 1 | null }
  | { type: 'match'; winner: 0 | 1 };

export type Phase = 'intro' | 'fight' | 'ended' | 'over';

/** Which way is "toward the opponent" in screen terms. */
const fwd = (f: Fighter) => f.facing;

export class Fight {
  public readonly fighters: [Fighter, Fighter];
  public readonly projectiles: Projectile[] = [];
  public readonly events: FightEvent[] = [];
  public phase: Phase = 'intro';
  public round = 1;
  public clock = ROUND_TIME;
  /** Seconds in the current phase. */
  public phaseT = 0;
  public hitstop = 0;
  /** The fight slows for a moment on a KO. */
  public slowmo = 0;
  public winner: 0 | 1 | null = null;
  private nextId = 1;
  private readonly prev: FightInput[] = [blank(), blank()];
  /** Recent directions per player, in numpad notation relative to facing, with timestamps. */
  private readonly history: { dir: number; t: number }[][] = [[], []];
  private time = 0;
  private roundPending = false;

  public constructor(a: FighterDef, b: FighterDef) {
    this.fighters = [this.make(0, a), this.make(1, b)];
    this.resetRound();
  }

  private make(slot: 0 | 1, def: FighterDef): Fighter {
    return { slot, def, x: 0, y: 0, vx: 0, vy: 0, facing: 1, hp: MAX_HP, meter: 0, state: 'stand', t: 0, move: null, landed: false, stun: 0, comboTaken: 0, blocking: false, wins: 0 };
  }

  private resetRound(): void {
    const [a, b] = this.fighters;
    for (const f of this.fighters) {
      Object.assign(f, { y: 0, vx: 0, vy: 0, hp: MAX_HP, state: 'stand', t: 0, move: null, landed: false, stun: 0, comboTaken: 0, blocking: false });
    }
    a.x = -1.8;
    b.x = 1.8;
    a.facing = 1;
    b.facing = -1;
    this.projectiles.length = 0;
    this.clock = ROUND_TIME;
    this.phase = 'intro';
    this.phaseT = 0;
    // Raised on the next step, so it is not cleared before anyone reads it.
    this.roundPending = true;
  }

  public step(inputs: readonly FightInput[]): void {
    this.events.length = 0;
    if (this.phase === 'over') return;
    if (this.roundPending) {
      this.roundPending = false;
      this.events.push({ type: 'round', round: this.round });
    }
    this.time += STEP;
    this.phaseT += STEP;
    // The intro holds the fighters still; FIGHT! after two seconds.
    if (this.phase === 'intro') {
      if (this.phaseT >= 2) {
        this.phase = 'fight';
        this.phaseT = 0;
        this.events.push({ type: 'fight' });
      }
      this.prev[0] = { ...inputs[0] };
      this.prev[1] = { ...inputs[1] };
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= STEP;
      return;
    }
    const dt = this.slowmo > 0 ? STEP * 0.3 : STEP;
    this.slowmo = Math.max(0, this.slowmo - STEP);

    if (this.phase === 'fight') {
      this.clock = Math.max(0, this.clock - dt);
      if (this.clock === 0) return this.timeUp();
    }
    for (const f of this.fighters) {
      const input = this.phase === 'fight' ? inputs[f.slot] ?? blank() : blank();
      this.record(f, input);
      this.control(f, input, this.prev[f.slot]);
      this.prev[f.slot] = { ...input };
    }
    for (const f of this.fighters) this.physics(f, dt);
    this.separate();
    for (const f of this.fighters) this.resolve(f);
    this.moveProjectiles(dt);
    this.face();
    if (this.phase === 'ended' && this.phaseT > 3.2) this.nextRound();
  }

  // ─── Input ──────────────────────────────────────────────────────────────────────────────────

  /** Numpad direction relative to facing: 6 is toward the opponent, 4 away, 2 down, 8 up. */
  private dirOf(f: Fighter, input: FightInput): number {
    const h = Math.sign(input.x) * fwd(f);
    const v = Math.sign(input.y);
    return 5 + h + v * 3;
  }

  private record(f: Fighter, input: FightInput): void {
    const h = this.history[f.slot];
    const dir = this.dirOf(f, input);
    if (h.length === 0 || h[h.length - 1].dir !== dir) h.push({ dir, t: this.time });
    while (h.length && this.time - h[0].t > MOTION_WINDOW * 2) h.shift();
  }

  /** Whether the recent directions contain `seq` in order, all within the motion window. */
  private motion(f: Fighter, seq: number[], window = MOTION_WINDOW): boolean {
    const h = this.history[f.slot].filter((e) => this.time - e.t <= window);
    let i = 0;
    for (const e of h) if (e.dir === seq[i] && ++i === seq.length) return true;
    return false;
  }

  // ─── Control ────────────────────────────────────────────────────────────────────────────────

  private free(f: Fighter): boolean {
    return f.state === 'stand' || f.state === 'walk' || f.state === 'crouch';
  }

  private control(f: Fighter, input: FightInput, prev: FightInput): void {
    const press = (b: Button) => input[b] && !prev[b];
    const punch = press('lp') || press('hp');
    const kick = press('lk') || press('hk');
    if (f.state === 'jump') {
      if (!f.move && (punch || kick)) this.begin(f, kick ? 'airKick' : 'airPunch', true);
      return;
    }
    if (!this.free(f)) return;
    // Specials first: a super (two quarter circles), a blast (one), the dash strike (back), or their buttons.
    if ((input.super && !prev.super) || (punch && this.motion(f, [2, 3, 6, 2, 3, 6], MOTION_WINDOW * 2))) {
      if (f.meter >= 100) return this.begin(f, 'super');
    }
    if ((input.blast && !prev.blast) || (punch && this.motion(f, [2, 3, 6]))) {
      if (!this.projectiles.some((p) => p.owner === f.slot)) return this.begin(f, 'blast');
    }
    if ((input.dash && !prev.dash) || (kick && this.motion(f, [2, 1, 4]))) return this.begin(f, 'dashStrike');

    const crouching = input.y < 0;
    if (press('lp')) return this.begin(f, crouching ? 'lowJab' : 'jab');
    if (press('hp')) return this.begin(f, crouching ? 'lowJab' : this.hpMove(f));
    if (press('lk')) return this.begin(f, crouching ? 'lowKick' : 'frontKick');
    if (press('hk')) return this.begin(f, crouching ? 'sweep' : 'roundhouse');
    if (input.y > 0 && !(prev.y > 0)) {
      f.state = 'jump';
      f.t = 0;
      f.move = null;
      f.vy = JUMP_V;
      f.vx = Math.sign(input.x) * JUMP_X;
      return;
    }
    const next: State = crouching ? 'crouch' : input.x !== 0 ? 'walk' : 'stand';
    if (next !== f.state) {
      f.state = next;
      f.t = 0;
    }
    const away = Math.sign(input.x) === -fwd(f);
    f.vx = crouching ? 0 : input.x * (away ? BACK_WALK : WALK);
    // Holding away is a block, standing or crouching.
    f.blocking = away || (crouching && Math.sign(input.x) === -fwd(f));
  }

  /** A heavy punch is a hook up close and a cross at range. */
  private hpMove(f: Fighter): MoveId {
    const other = this.fighters[1 - f.slot];
    return Math.abs(other.x - f.x) < 1.1 ? 'hook' : 'cross';
  }

  private begin(f: Fighter, move: MoveId, air = false): void {
    const m = MOVES[move];
    if (m.meterCost) f.meter -= m.meterCost;
    f.move = move;
    f.landed = false;
    f.t = 0;
    f.blocking = false;
    if (!air) {
      f.state = 'attack';
      f.vx = 0;
    }
    this.events.push({ type: 'attack', slot: f.slot, move });
  }

  // ─── Motion ─────────────────────────────────────────────────────────────────────────────────

  private physics(f: Fighter, dt: number): void {
    f.t += dt;
    switch (f.state) {
      case 'attack': {
        const m = MOVES[f.move!];
        const active = f.t >= m.startup && f.t < m.startup + m.active;
        f.vx = active && m.lunge ? fwd(f) * m.lunge : f.vx * 0.8;
        if (m.projectile && f.t >= m.startup && !f.landed) {
          f.landed = true;
          this.fire(f, m);
        }
        if (f.t >= m.startup + m.active + m.recover) this.settle(f);
        break;
      }
      case 'hitstun':
      case 'blockstun':
        f.vx *= 0.88;
        if (f.t >= f.stun) this.settle(f);
        break;
      case 'knockdown':
        if (f.y <= 0 && f.vy <= 0) f.vx *= 0.85;
        if (f.y <= 0 && f.t > 1.1) {
          if (f.hp <= 0) {
            f.state = 'ko';
            f.t = 0;
          } else {
            f.state = 'getup';
            f.t = 0;
          }
        }
        break;
      case 'getup':
        if (f.t > 0.55) this.settle(f);
        break;
    }
    f.x += f.vx * dt;
    if (f.y > 0 || f.vy > 0) {
      f.vy -= GRAVITY * dt;
      f.y += f.vy * dt;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        if (f.state === 'jump') {
          f.move = null;
          this.settle(f);
        }
      }
    }
    f.x = Math.max(-STAGE_HALF, Math.min(STAGE_HALF, f.x));
  }

  private settle(f: Fighter): void {
    f.state = 'stand';
    f.t = 0;
    f.move = null;
    f.vx = 0;
    if (f.stun > 0 || f.comboTaken > 0) f.comboTaken = 0;
    f.stun = 0;
  }

  /** Bodies do not pass through each other on the ground; the one at a wall pushes the other. */
  private separate(): void {
    const [a, b] = this.fighters;
    if (a.y > 0.8 || b.y > 0.8 || a.state === 'ko' || b.state === 'ko') return;
    const gap = b.x - a.x;
    const overlap = BODY - Math.abs(gap);
    if (overlap <= 0) return;
    const dir = gap >= 0 ? 1 : -1;
    a.x -= (dir * overlap) / 2;
    b.x += (dir * overlap) / 2;
    for (const f of this.fighters) f.x = Math.max(-STAGE_HALF, Math.min(STAGE_HALF, f.x));
  }

  private face(): void {
    const [a, b] = this.fighters;
    for (const [f, o] of [[a, b], [b, a]] as const) {
      if (this.free(f) && o.x !== f.x) f.facing = o.x > f.x ? 1 : -1;
    }
  }

  // ─── Hits ───────────────────────────────────────────────────────────────────────────────────

  private resolve(f: Fighter): void {
    if (!f.move || f.landed) return;
    const m = MOVES[f.move];
    if (m.projectile) return;
    if (f.t < m.startup || f.t >= m.startup + m.active) return;
    const o = this.fighters[1 - f.slot];
    if (o.state === 'ko' || o.state === 'knockdown' || o.state === 'getup') return;
    const ahead = (o.x - f.x) * fwd(f);
    if (ahead < 0 || ahead > m.reach + BODY / 2) return;
    // Lows go under a jump; air attacks only reach someone standing near the height they are at.
    if (m.height === 'low' && o.y > 0.3) return;
    if (Math.abs(o.y - f.y) > 1.5) return;
    f.landed = true;
    this.connect(f, o, m, f.x + fwd(f) * Math.min(ahead, m.reach), f.y + 1.3, m.damage, m.chip ?? 0);
  }

  /** Whether `o` blocks an attack of this height right now. */
  private blocks(o: Fighter, height: Height): boolean {
    if (!(this.free(o) || o.state === 'blockstun') || !o.blocking) return false;
    const crouched = o.state === 'crouch' || (o.state === 'blockstun' && o.y === 0 && this.prevCrouch(o));
    if (height === 'low') return crouched;
    if (height === 'high') return !crouched;
    return true;
  }

  private prevCrouch(o: Fighter): boolean {
    return this.prev[o.slot].y < 0;
  }

  private connect(by: Fighter, o: Fighter, m: Move, x: number, y: number, damage: number, chip: number): void {
    const dir = fwd(by);
    if (this.blocks(o, m.height)) {
      o.state = 'blockstun';
      o.t = 0;
      o.stun = m.blockstun;
      o.vx = dir * m.push;
      o.hp = Math.max(1, o.hp - chip);
      by.meter = Math.min(100, by.meter + 3);
      this.hitstop = 0.04;
      this.events.push({ type: 'block', slot: o.slot, x, y });
      return;
    }
    // Combos scale down: full damage for two hits, then less each hit, to a floor of 30%.
    o.comboTaken += 1;
    const scale = Math.max(0.3, 1 - Math.max(0, o.comboTaken - 2) * 0.1);
    const dealt = Math.round(damage * scale);
    o.hp = Math.max(0, o.hp - dealt);
    by.meter = Math.min(100, by.meter + dealt * 0.06);
    o.meter = Math.min(100, o.meter + dealt * 0.04);
    o.move = null;
    const heavy = m.knockdown || dealt >= 100;
    this.hitstop = heavy ? 0.1 : 0.06;
    this.events.push({ type: 'hit', slot: o.slot, x, y, damage: dealt, heavy, combo: o.comboTaken });
    if (o.hp <= 0 || m.knockdown || o.y > 0) {
      o.state = 'knockdown';
      o.t = 0;
      o.vx = dir * (m.push + 1.5);
      o.vy = Math.max(o.vy, 5);
      o.y = Math.max(o.y, 0.01);
      this.events.push({ type: 'knockdown', slot: o.slot });
      if (o.hp <= 0) this.ko(o);
    } else {
      o.state = 'hitstun';
      o.t = 0;
      o.stun = m.hitstun;
      o.vx = dir * m.push;
    }
  }

  private fire(f: Fighter, m: Move): void {
    const p = m.projectile!;
    this.projectiles.push({
      id: this.nextId++, owner: f.slot, x: f.x + fwd(f) * 0.8, y: 1.25, vx: fwd(f) * p.speed,
      damage: p.damage, chip: p.chip, size: p.size, super: f.move === 'super'
    });
    this.events.push({ type: 'projectile', slot: f.slot, super: f.move === 'super' });
  }

  private moveProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      // Two blasts meeting cancel; a super eats a blast and keeps going.
      const other = this.projectiles.find((q) => q.owner !== p.owner && Math.abs(q.x - p.x) < (q.size + p.size) / 2);
      if (other) {
        this.events.push({ type: 'clash', x: (p.x + other.x) / 2, y: p.y });
        if (p.super && !other.super) {
          this.projectiles.splice(this.projectiles.indexOf(other), 1);
          i = Math.min(i, this.projectiles.length - 1);
          continue;
        }
        this.projectiles.splice(i, 1);
        if (!other.super) {
          const j = this.projectiles.indexOf(other);
          if (j >= 0) this.projectiles.splice(j, 1);
          i = Math.min(i, this.projectiles.length);
        }
        continue;
      }
      const o = this.fighters[1 - p.owner];
      const hits = Math.abs(o.x - p.x) < BODY / 2 + p.size / 2 && o.y < 1.6 && !['knockdown', 'getup', 'ko'].includes(o.state);
      if (hits) {
        const by = this.fighters[p.owner];
        this.connect(by, o, p.super ? MOVES.super : MOVES.blast, p.x, p.y, p.damage, p.chip);
        this.projectiles.splice(i, 1);
      } else if (Math.abs(p.x) > STAGE_HALF + 3) this.projectiles.splice(i, 1);
    }
  }

  // ─── Rounds ─────────────────────────────────────────────────────────────────────────────────

  private ko(loser: Fighter): void {
    if (this.phase !== 'fight') return;
    const winner = this.fighters[1 - loser.slot];
    this.slowmo = 1.2;
    this.events.push({ type: 'ko', slot: loser.slot });
    this.endRound(winner.slot);
  }

  private timeUp(): void {
    const [a, b] = this.fighters;
    this.events.push({ type: 'timeup' });
    this.endRound(a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1);
  }

  private endRound(winner: 0 | 1 | null): void {
    this.phase = 'ended';
    this.phaseT = 0;
    if (winner !== null) {
      this.fighters[winner].wins += 1;
      const w = this.fighters[winner];
      if (this.free(w) || w.state === 'attack') {
        w.state = 'win';
        w.t = 0;
        w.move = null;
      }
    }
    this.events.push({ type: 'roundEnd', winner });
  }

  private nextRound(): void {
    const champ = this.fighters.find((f) => f.wins >= ROUNDS_TO_WIN);
    if (champ) {
      this.phase = 'over';
      this.winner = champ.slot;
      this.events.push({ type: 'match', winner: champ.slot });
      return;
    }
    this.round += 1;
    this.resetRound();
  }
}

export function blank(): FightInput {
  return { x: 0, y: 0, lp: false, hp: false, lk: false, hk: false };
}
