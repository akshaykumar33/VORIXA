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
/** The two taps of a dash must fall within this. */
const DASH_WINDOW = 0.28;
/** Normals that can be cancelled into a special once they connect. */
const CANCELLABLE = new Set<MoveId>(['jab', 'cross', 'lowJab', 'lowKick', 'frontKick']);

/** Where an attack hits; a throw is not blocked at all. */
export type Height = 'high' | 'mid' | 'low' | 'throw';
export type MoveId =
  | 'jab' | 'cross' | 'hook' | 'frontKick' | 'roundhouse'
  | 'lowJab' | 'lowKick' | 'sweep' | 'airPunch' | 'airKick'
  | 'blast' | 'dashStrike' | 'super'
  | 'dashForward' | 'dashBack' | 'throw'
  | 'sigRain' | 'sigGore' | 'sigRing' | 'sigCounter' | 'counterHit';

/** Each asura's signature special (↓↙← + punch), one of four mechanics. */
export type Signature = 'rain' | 'gore' | 'ring' | 'counter';
const SIGNATURE_MOVE: Record<Signature, MoveId> = { rain: 'sigRain', gore: 'sigGore', ring: 'sigRing', counter: 'sigCounter' };
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
  /** Moves the fighter without striking (dashes). */
  movement?: boolean;
  /** Hits on both sides of the fighter, not only in front. */
  around?: boolean;
  /** No blow short of a knockdown interrupts it (super armour for the move). */
  armoured?: boolean;
}

export const MOVES: Record<MoveId, Move> = {
  jab: { startup: 0.05, active: 0.05, recover: 0.12, damage: 40, reach: 0.95, height: 'mid', hitstun: 0.3, blockstun: 0.15, push: 1.2 },
  cross: { startup: 0.08, active: 0.06, recover: 0.2, damage: 70, reach: 1.05, height: 'mid', hitstun: 0.38, blockstun: 0.2, push: 1.8 },
  hook: { startup: 0.14, active: 0.08, recover: 0.3, damage: 110, reach: 1.05, height: 'mid', hitstun: 0.45, blockstun: 0.26, push: 2.6 },
  frontKick: { startup: 0.1, active: 0.07, recover: 0.22, damage: 60, reach: 1.2, height: 'mid', hitstun: 0.3, blockstun: 0.18, push: 2 },
  roundhouse: { startup: 0.18, active: 0.09, recover: 0.36, damage: 120, reach: 1.35, height: 'mid', hitstun: 0.5, blockstun: 0.28, push: 3 },
  lowJab: { startup: 0.05, active: 0.05, recover: 0.12, damage: 30, reach: 0.9, height: 'mid', hitstun: 0.22, blockstun: 0.14, push: 1 },
  lowKick: { startup: 0.07, active: 0.06, recover: 0.18, damage: 45, reach: 1.15, height: 'low', hitstun: 0.26, blockstun: 0.16, push: 1.4 },
  sweep: { startup: 0.14, active: 0.08, recover: 0.42, damage: 90, reach: 1.35, height: 'low', hitstun: 0.6, blockstun: 0.26, push: 2, knockdown: true },
  airPunch: { startup: 0.05, active: 0.2, recover: 0.05, damage: 70, reach: 1.0, height: 'high', hitstun: 0.4, blockstun: 0.22, push: 1.6 },
  airKick: { startup: 0.07, active: 0.25, recover: 0.05, damage: 95, reach: 1.25, height: 'high', hitstun: 0.45, blockstun: 0.24, push: 2 },
  blast: { startup: 0.22, active: 0.05, recover: 0.42, damage: 0, reach: 0, height: 'mid', hitstun: 0.4, blockstun: 0.25, push: 2.2, projectile: { speed: 6.5, damage: 100, chip: 15, size: 0.35 } },
  dashStrike: { startup: 0.12, active: 0.32, recover: 0.4, damage: 120, reach: 0.9, height: 'mid', hitstun: 0.6, blockstun: 0.3, push: 3, knockdown: true, lunge: 7.5, chip: 12 },
  // Double-tap forward or back: a quick burst of movement.
  dashForward: { startup: 0, active: 0.2, recover: 0.07, damage: 0, reach: 0, height: 'mid', hitstun: 0, blockstun: 0, push: 0, lunge: 6.5, movement: true },
  dashBack: { startup: 0, active: 0.18, recover: 0.1, damage: 0, reach: 0, height: 'mid', hitstun: 0, blockstun: 0, push: 0, lunge: -5.5, movement: true },
  // Light punch and light kick together, up close: a grab that no block stops.
  // Signatures. Rain: a strike falls from above where the opponent stands. Gore: an armoured lunge.
  // Ring: a blow all round. Counter: a stance that catches a strike and answers it.
  sigRain: { startup: 0.35, active: 0.05, recover: 0.45, damage: 0, reach: 0, height: 'mid', hitstun: 0.5, blockstun: 0.3, push: 2, knockdown: true },
  sigGore: { startup: 0.15, active: 0.4, recover: 0.45, damage: 130, reach: 0.95, height: 'mid', hitstun: 0.6, blockstun: 0.3, push: 3.5, knockdown: true, lunge: 6.5, chip: 14, armoured: true },
  sigRing: { startup: 0.25, active: 0.12, recover: 0.5, damage: 120, reach: 1.6, height: 'mid', hitstun: 0.6, blockstun: 0.3, push: 3.2, knockdown: true, around: true, chip: 12 },
  sigCounter: { startup: 0.04, active: 0.6, recover: 0.25, damage: 0, reach: 0, height: 'mid', hitstun: 0, blockstun: 0, push: 0, movement: true },
  counterHit: { startup: 0, active: 0.01, recover: 0.3, damage: 140, reach: 1.2, height: 'throw', hitstun: 0.6, blockstun: 0, push: 3.5, knockdown: true },
  throw: { startup: 0.06, active: 0.05, recover: 0.45, damage: 130, reach: 0.95, height: 'throw', hitstun: 0, blockstun: 0, push: 3, knockdown: true },
  super: { startup: 0.45, active: 0.05, recover: 0.6, damage: 0, reach: 0, height: 'mid', hitstun: 0.8, blockstun: 0.4, push: 4, knockdown: true, projectile: { speed: 9, damage: 320, chip: 60, size: 0.7 }, meterCost: 100 }
};

/** How a fighter's blast looks and flies. */
export type BlastStyle = 'fire' | 'quake' | 'boulder' | 'blood' | 'gold' | 'shadow' | 'wind';

/**
 * A fighter's powers (ADR-0017): multipliers on the shared moves, and their own blast. Every field
 * is optional; a fighter without a kit plays the shared moves as they are.
 */
export interface Kit {
  /** Damage dealt, x. */
  power?: number;
  /** Damage taken, x (below 1 is tougher). */
  defense?: number;
  /** Walking speed, x. */
  speed?: number;
  /** Reach of the dash strike's lunge, x. */
  dash?: number;
  /** Hits dealing less than this do not interrupt their attacks (super armour). */
  armour?: number;
  /** Share of damage dealt that heals them. */
  lifesteal?: number;
  /** Their blast: speed (m/s), size (m), damage, chip, how it flies, and its look. */
  blast?: { speed: number; size: number; damage: number; chip: number; style: BlastStyle; low?: boolean; arc?: boolean };
  /** Their signature special. */
  signature?: Signature;
}

export interface FighterDef {
  id: string;
  name: string;
  /** The cast model drawn for them. */
  model: string;
  /** Their energy colour (blasts, super, UI). */
  colour: number;
  title: string;
  kit?: Kit;
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
  signature?: boolean;
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
  style: BlastStyle;
  /** Low blasts travel along the ground and must be blocked crouching. */
  low: boolean;
  /** Arcing blasts are thrown up and fall; `vy` is their upward speed. */
  vy: number;
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
    // A normal that connected (hit or blocked) can be cancelled into a special: the heart of combos.
    if (f.state === 'attack' && f.move && CANCELLABLE.has(f.move) && f.landed) {
      const m = MOVES[f.move];
      if (f.t < m.startup + m.active + m.recover && this.special(f, input, prev, punch, kick)) return;
    }
    if (!this.free(f)) return;
    if (this.special(f, input, prev, punch, kick)) return;
    // A throw: light punch and light kick together, close to someone on the ground.
    if (press('lp') && press('lk')) return this.begin(f, 'throw');
    // Dashes: tap forward or back twice.
    if (input.x !== 0 && Math.sign(input.x) !== Math.sign(prev.x)) {
      if (this.motion(f, [6, 5, 6], DASH_WINDOW)) return this.begin(f, 'dashForward');
      if (this.motion(f, [4, 5, 4], DASH_WINDOW)) return this.begin(f, 'dashBack');
    }

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
    f.vx = crouching ? 0 : input.x * (away ? BACK_WALK : WALK) * (f.def.kit?.speed ?? 1);
    // Holding away is a block, standing or crouching.
    f.blocking = away || (crouching && Math.sign(input.x) === -fwd(f));
  }

  /** Specials: a super (two quarter circles), a blast (one), the dash strike (back), or their buttons. */
  private special(f: Fighter, input: FightInput, prev: FightInput, punch: boolean, kick: boolean): boolean {
    if ((input.super && !prev.super) || (punch && this.motion(f, [2, 3, 6, 2, 3, 6], MOTION_WINDOW * 2))) {
      if (f.meter >= 100) {
        this.begin(f, 'super');
        return true;
      }
    }
    if ((input.blast && !prev.blast) || (punch && this.motion(f, [2, 3, 6]))) {
      if (!this.projectiles.some((p) => p.owner === f.slot)) {
        this.begin(f, 'blast');
        return true;
      }
    }
    if ((input.dash && !prev.dash) || (kick && this.motion(f, [2, 1, 4]))) {
      this.begin(f, 'dashStrike');
      return true;
    }
    const sig = f.def.kit?.signature;
    if (sig && ((input.signature && !prev.signature) || (punch && this.motion(f, [2, 1, 4])))) {
      this.begin(f, SIGNATURE_MOVE[sig]);
      return true;
    }
    return false;
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
        f.vx = active && m.lunge ? fwd(f) * m.lunge * (f.def.kit?.dash ?? 1) : f.vx * 0.8;
        if (m.projectile && f.t >= m.startup && !f.landed) {
          f.landed = true;
          this.fire(f, m);
        }
        if (f.move === 'sigRain' && f.t >= m.startup && !f.landed) {
          f.landed = true;
          this.rain(f);
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
    if (m.projectile || m.movement) return;
    if (f.t < m.startup || f.t >= m.startup + m.active) return;
    const o = this.fighters[1 - f.slot];
    if (o.state === 'ko' || o.state === 'knockdown' || o.state === 'getup') return;
    if (m.height === 'throw' && (o.y > 0 || !['stand', 'walk', 'crouch', 'attack'].includes(o.state))) return;
    const ahead = m.around ? Math.abs(o.x - f.x) : (o.x - f.x) * fwd(f);
    if (ahead < 0 || ahead > m.reach + BODY / 2) return;
    // Lows go under a jump; air attacks only reach someone standing near the height they are at.
    if (m.height === 'low' && o.y > 0.3) return;
    if (Math.abs(o.y - f.y) > 1.5) return;
    f.landed = true;
    this.connect(f, o, m, f.x + fwd(f) * Math.min(ahead, m.reach), f.y + 1.3, m.damage, m.chip ?? 0);
  }

  /** Whether `o` blocks an attack of this height right now. */
  private blocks(o: Fighter, height: Height): boolean {
    if (height === 'throw') return false;
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
    const counter = MOVES.sigCounter;
    if (o.move === 'sigCounter' && o.state === 'attack' && o.t >= counter.startup && o.t < counter.startup + counter.active && m.height !== 'throw') {
      // Caught: the stance ends and the blow comes back on the attacker.
      o.move = 'counterHit';
      o.t = 0;
      o.landed = true;
      this.events.push({ type: 'clash', x, y });
      this.connect(o, by, MOVES.counterHit, by.x, by.y + 1.2, MOVES.counterHit.damage, 0);
      return;
    }
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
    const dealt = Math.round(damage * scale * (by.def.kit?.power ?? 1) * (o.def.kit?.defense ?? 1));
    o.hp = Math.max(0, o.hp - dealt);
    if (by.def.kit?.lifesteal) by.hp = Math.min(MAX_HP, by.hp + Math.round(dealt * by.def.kit.lifesteal));
    // Super armour: a light blow lands but does not stop a heavy fighter's attack.
    const armour = o.move && MOVES[o.move].armoured ? Infinity : o.def.kit?.armour ?? 0;
    if (o.state === 'attack' && o.hp > 0 && !m.knockdown && dealt < armour) {
      this.hitstop = 0.05;
      this.events.push({ type: 'hit', slot: o.slot, x, y, damage: dealt, heavy: false, combo: o.comboTaken });
      return;
    }
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

  /** A strike from above: it falls on where the opponent stands as it is called down. */
  private rain(f: Fighter): void {
    const target = this.fighters[1 - f.slot];
    const own = f.def.kit?.blast;
    this.projectiles.push({
      id: this.nextId++, owner: f.slot, x: target.x, y: 6, vx: 0, damage: 110, chip: 15, size: 0.55,
      super: false, style: own?.style ?? 'fire', low: false, vy: -2
    });
    this.events.push({ type: 'projectile', slot: f.slot, super: false });
  }

  private fire(f: Fighter, m: Move): void {
    const isSuper = f.move === 'super';
    // A fighter's own blast replaces the shared one; their super is it, bigger and stronger.
    const own = f.def.kit?.blast;
    const p = own ? (isSuper ? { ...own, speed: own.speed * 1.3, size: own.size * 1.9, damage: m.projectile!.damage, chip: m.projectile!.chip } : own) : m.projectile!;
    const style = own?.style ?? 'fire';
    const low = !!own?.low && !isSuper;
    const arc = !!own?.arc && !isSuper;
    const x0 = f.x + fwd(f) * 0.8;
    // A thrown boulder is aimed: its arc comes down on where the opponent stands now.
    let vy = 0;
    if (arc) {
      const target = this.fighters[1 - f.slot];
      const flight = Math.max(0.45, Math.abs(target.x - x0) / p.speed);
      vy = (GRAVITY * 0.55 * flight) / 2 - (1.8 - 1.0) / flight;
    }
    this.projectiles.push({
      id: this.nextId++, owner: f.slot, x: x0, y: low ? 0.3 : arc ? 1.8 : 1.25, vx: fwd(f) * p.speed,
      damage: p.damage, chip: p.chip, size: p.size, super: isSuper, style, low, vy
    });
    this.events.push({ type: 'projectile', slot: f.slot, super: f.move === 'super' });
  }

  private moveProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      if (p.vy !== 0 || p.y > 1.81) {
        // Thrown: up, then down; it breaks on the ground.
        p.vy -= GRAVITY * 0.55 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0.15) {
          this.events.push({ type: 'clash', x: p.x, y: 0.2 });
          this.projectiles.splice(i, 1);
          continue;
        }
      }
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
      // Low blasts pass under a jump; everything else reaches up to about head height.
      const reachY = p.low ? o.y < 0.3 : o.y < 1.6 && Math.abs(p.y - (o.y + 1)) < 1.2 + p.size;
      const hits = Math.abs(o.x - p.x) < BODY / 2 + p.size / 2 && reachY && !['knockdown', 'getup', 'ko'].includes(o.state);
      if (hits) {
        const by = this.fighters[p.owner];
        const move = p.super ? MOVES.super : p.low ? { ...MOVES.blast, height: 'low' as const } : MOVES.blast;
        this.connect(by, o, move, p.x, p.y, p.damage, p.chip);
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
