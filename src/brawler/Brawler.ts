/**
 * Neon Knuckles (ADR-0015): the brawler's whole game as pure data and rules.
 *
 * The street is a belt: `x` runs along it, `z` runs into it (0 at the kerb, DEPTH at the shop
 * fronts), `y` is height above the ground. Fighters punch along x and only connect with someone
 * on roughly the same z, the way Streets of Rage plays.
 *
 * Fixed step, seeded randomness, no DOM: the same inputs always give the same fight.
 */

export const STEP = 1 / 120;
export const DEPTH = 64;
/** Width of the play view in world units; the camera never shows more street than this. */
export const VIEW = 640;
const GRAVITY = 1500;
const COMBO_WINDOW = 1.4;

export type Team = 'hero' | 'foe';
export type Kind = 'kai' | 'vex' | 'thug' | 'blade' | 'brute' | 'boss';
export type State = 'idle' | 'walk' | 'attack' | 'jump' | 'hurt' | 'down' | 'getup' | 'dead';
export type MoveId = 'jab1' | 'jab2' | 'jab3' | 'heavy' | 'airkick' | 'special' | 'swipe' | 'slash' | 'slam' | 'charge';

export interface Move {
  startup: number;
  active: number;
  recover: number;
  damage: number;
  /** How far in front it reaches, and how far behind (specials hit all round). */
  reach: number;
  back: number;
  /** Knockback speed, and whether it knocks the target down. */
  push: number;
  knockdown: boolean;
  /** Upward speed given to a knocked-down target: a launcher. */
  lift: number;
  stun: number;
  /** The next move in the chain, if the button is pressed again in time. */
  next?: MoveId;
  /** Forward speed during the move. */
  lunge: number;
}

export const MOVES: Record<MoveId, Move> = {
  jab1: { startup: 0.05, active: 0.06, recover: 0.14, damage: 6, reach: 44, back: 0, push: 30, knockdown: false, lift: 0, stun: 0.28, next: 'jab2', lunge: 20 },
  jab2: { startup: 0.05, active: 0.06, recover: 0.15, damage: 7, reach: 46, back: 0, push: 40, knockdown: false, lift: 0, stun: 0.3, next: 'jab3', lunge: 30 },
  jab3: { startup: 0.09, active: 0.08, recover: 0.3, damage: 13, reach: 52, back: 0, push: 260, knockdown: true, lift: 260, stun: 0.5, lunge: 90 },
  heavy: { startup: 0.18, active: 0.09, recover: 0.34, damage: 17, reach: 58, back: 0, push: 300, knockdown: true, lift: 160, stun: 0.5, lunge: 60 },
  airkick: { startup: 0.04, active: 0.3, recover: 0.05, damage: 12, reach: 50, back: 0, push: 220, knockdown: true, lift: 120, stun: 0.4, lunge: 0 },
  special: { startup: 0.08, active: 0.24, recover: 0.3, damage: 20, reach: 84, back: 84, push: 340, knockdown: true, lift: 300, stun: 0.6, lunge: 0 },
  swipe: { startup: 0.32, active: 0.08, recover: 0.4, damage: 8, reach: 44, back: 0, push: 60, knockdown: false, lift: 0, stun: 0.3, lunge: 40 },
  slash: { startup: 0.2, active: 0.07, recover: 0.3, damage: 7, reach: 50, back: 0, push: 70, knockdown: false, lift: 0, stun: 0.3, lunge: 120 },
  slam: { startup: 0.5, active: 0.1, recover: 0.55, damage: 22, reach: 60, back: 0, push: 320, knockdown: true, lift: 200, stun: 0.6, lunge: 30 },
  charge: { startup: 0.45, active: 0.55, recover: 0.5, damage: 18, reach: 40, back: 0, push: 360, knockdown: true, lift: 220, stun: 0.6, lunge: 520 }
};

interface Stats {
  hp: number;
  speed: number;
  /** Super armour: knockdowns below this damage do not interrupt it. */
  armour: number;
  score: number;
}

export const STATS: Record<Kind, Stats> = {
  kai: { hp: 120, speed: 165, armour: 0, score: 0 },
  vex: { hp: 130, speed: 155, armour: 0, score: 0 },
  thug: { hp: 42, speed: 95, armour: 0, score: 300 },
  blade: { hp: 30, speed: 150, armour: 0, score: 450 },
  brute: { hp: 110, speed: 70, armour: 14, score: 900 },
  boss: { hp: 420, speed: 110, armour: 16, score: 5000 }
};

export interface Fighter {
  id: number;
  team: Team;
  kind: Kind;
  /** Player slot (0 or 1) for heroes; -1 for foes. */
  slot: number;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  state: State;
  /** Seconds in the current state. */
  t: number;
  move: MoveId | null;
  /** The chain's next press arrived in time. */
  buffered: boolean;
  /** Who this move has already hit. */
  struck: number[];
  /** Invulnerable for this long (after getting up, after respawning). */
  safe: number;
  /** Seconds until this foe may try to attack again. */
  cooldown: number;
  /** How long the current hitstun lasts. */
  stun: number;
  /** The fighter who landed the last hit on this one: they get the KO. */
  lastBy: number;
}

export interface PlayerInput {
  x: number;
  z: number;
  punch: boolean;
  heavy: boolean;
  jump: boolean;
  special: boolean;
}

export interface PlayerState {
  joined: boolean;
  fighter: number;
  lives: number;
  score: number;
  rage: number;
  combo: number;
  comboTimer: number;
  bestCombo: number;
  damageTaken: number;
}

export interface Wave {
  /** The lead hero reaching this x locks the screen and starts the wave. */
  at: number;
  foes: Kind[];
}

export interface Pickup {
  id: number;
  x: number;
  z: number;
  heal: number;
}

export type BrawlEvent =
  | { type: 'hit'; x: number; y: number; z: number; damage: number; heavy: boolean; by: number }
  | { type: 'ko'; x: number; z: number; kind: Kind; score: number }
  | { type: 'whiff'; x: number; z: number }
  | { type: 'go' }
  | { type: 'wave'; index: number }
  | { type: 'heal'; x: number; z: number }
  | { type: 'special'; x: number; z: number }
  | { type: 'clear' }
  | { type: 'over' };

export interface StageDef {
  name: string;
  length: number;
  waves: Wave[];
}

export const STAGE_ONE: StageDef = {
  name: 'Stage 1 — Rain on Second Street',
  length: 3000,
  waves: [
    { at: 420, foes: ['thug', 'thug', 'thug'] },
    { at: 1000, foes: ['thug', 'blade', 'thug', 'blade'] },
    { at: 1600, foes: ['brute', 'thug', 'thug', 'blade'] },
    { at: 2200, foes: ['blade', 'blade', 'brute', 'thug', 'thug'] },
    { at: 2700, foes: ['boss', 'thug', 'thug'] }
  ]
};

/** A style rank from the stage's score, time and damage taken. */
export function rankFor(score: number, seconds: number, damageTaken: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  const points = score / 1000 - seconds / 20 - damageTaken / 40;
  if (points >= 30) return 'S';
  if (points >= 22) return 'A';
  if (points >= 14) return 'B';
  if (points >= 7) return 'C';
  return 'D';
}

export class Brawl {
  public readonly fighters: Fighter[] = [];
  public readonly players: PlayerState[];
  public readonly pickups: Pickup[] = [];
  public readonly events: BrawlEvent[] = [];
  public camera = VIEW / 2;
  /** The screen is held at [lockMin, lockMax] while a wave is alive. */
  public locked: { min: number; max: number } | null = null;
  public waveIndex = 0;
  public time = 0;
  /** A short freeze on every hit: the weight a punch has. */
  public hitstop = 0;
  public outcome: 'playing' | 'clear' | 'over' = 'playing';
  private nextId = 1;
  private seed: number;
  private readonly pressed = [this.blankInput(), this.blankInput()];

  public constructor(public readonly stage: StageDef = STAGE_ONE, seed = 1) {
    this.seed = seed >>> 0 || 1;
    this.players = [0, 1].map(() => ({ joined: false, fighter: -1, lives: 3, score: 0, rage: 0, combo: 0, comboTimer: 0, bestCombo: 0, damageTaken: 0 }));
    this.join(0);
  }

  private blankInput(): PlayerInput {
    return { x: 0, z: 0, punch: false, heavy: false, jump: false, special: false };
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  public fighter(id: number): Fighter | undefined {
    return this.fighters.find((f) => f.id === id);
  }

  public heroes(): Fighter[] {
    return this.fighters.filter((f) => f.team === 'hero' && f.state !== 'dead');
  }

  public foes(): Fighter[] {
    return this.fighters.filter((f) => f.team === 'foe' && f.state !== 'dead');
  }

  /** Brings a player in (player two joins mid-game by pressing punch). */
  public join(slot: number): void {
    const p = this.players[slot];
    if (p.joined) return;
    p.joined = true;
    const kind: Kind = slot === 0 ? 'kai' : 'vex';
    const other = this.fighter(this.players[1 - slot].fighter);
    const f = this.spawn(kind, 'hero', other ? other.x - 30 : this.camera - VIEW / 2 + 80, slot === 0 ? 40 : 18);
    f.slot = slot;
    f.safe = 1.5;
    p.fighter = f.id;
  }

  private spawn(kind: Kind, team: Team, x: number, z: number): Fighter {
    const f: Fighter = {
      id: this.nextId++, team, kind, slot: -1, x, z, y: 0, vx: 0, vz: 0, vy: 0,
      facing: 1, hp: STATS[kind].hp, state: 'idle', t: 0, move: null, buffered: false, struck: [], safe: 0, cooldown: 0.6 + this.random() * 0.8, stun: 0.3, lastBy: -1
    };
    this.fighters.push(f);
    return f;
  }

  /** Advances one fixed step. `inputs[slot]` is that player's held state this step. */
  public step(inputs: readonly PlayerInput[]): void {
    this.events.length = 0;
    if (this.outcome !== 'playing') return;
    // Edges: an attack fires on the press, not while held.
    const edges = inputs.map((input, i) => {
      const was = this.pressed[i];
      const edge = { ...input, punch: input.punch && !was.punch, heavy: input.heavy && !was.heavy, jump: input.jump && !was.jump, special: input.special && !was.special };
      this.pressed[i] = { ...input };
      return edge;
    });
    edges.forEach((e, slot) => {
      if (!this.players[slot].joined && e.punch) this.join(slot);
    });
    if (this.hitstop > 0) {
      this.hitstop -= STEP;
      return;
    }
    this.time += STEP;
    for (const p of this.players) {
      if (p.comboTimer > 0 && (p.comboTimer -= STEP) <= 0) p.combo = 0;
    }
    for (const f of this.fighters) {
      if (f.state === 'dead') continue;
      f.t += STEP;
      f.safe = Math.max(0, f.safe - STEP);
      f.cooldown = Math.max(0, f.cooldown - STEP);
      if (f.team === 'hero') this.control(f, edges[f.slot] ?? this.blankInput());
      else this.think(f);
      this.physics(f);
      if (f.state === 'attack') this.resolveAttack(f);
    }
    this.collectPickups();
    this.advanceStage();
  }

  // ─── Heroes ─────────────────────────────────────────────────────────────────────────────────

  private control(f: Fighter, input: PlayerInput): void {
    const p = this.players[f.slot];
    if (f.state === 'idle' || f.state === 'walk') {
      if (input.special && p.rage >= 50) {
        p.rage -= 50;
        this.events.push({ type: 'special', x: f.x, z: f.z });
        return this.begin(f, 'special');
      }
      if (input.jump) {
        f.state = 'jump';
        f.t = 0;
        f.vy = 520;
        f.vx = input.x * STATS[f.kind].speed * 1.1;
        return;
      }
      if (input.punch) return this.begin(f, 'jab1');
      if (input.heavy) return this.begin(f, 'heavy');
      const speed = STATS[f.kind].speed;
      f.vx = input.x * speed;
      f.vz = input.z * speed * 0.6;
      if (input.x !== 0) f.facing = input.x > 0 ? 1 : -1;
      const moving = input.x !== 0 || input.z !== 0;
      if (moving !== (f.state === 'walk')) {
        f.state = moving ? 'walk' : 'idle';
        f.t = 0;
      }
    } else if (f.state === 'jump') {
      if ((input.punch || input.heavy) && f.move === null) {
        f.move = 'airkick';
        f.struck = [];
        f.t = 0;
      }
    } else if (f.state === 'attack' && f.move) {
      if (input.punch && MOVES[f.move].next) f.buffered = true;
    }
  }

  // ─── Foes ───────────────────────────────────────────────────────────────────────────────────

  private think(f: Fighter): void {
    if (f.state !== 'idle' && f.state !== 'walk') return;
    const heroes = this.heroes();
    if (heroes.length === 0) {
      f.vx = f.vz = 0;
      return;
    }
    let target = heroes[0];
    for (const h of heroes) if (Math.abs(h.x - f.x) + Math.abs(h.z - f.z) < Math.abs(target.x - f.x) + Math.abs(target.z - f.z)) target = h;
    const stats = STATS[f.kind];
    const dx = target.x - f.x;
    const dz = target.z - f.z;
    f.facing = dx >= 0 ? 1 : -1;
    // Only two foes swing at once; the rest circle at a distance, so a crowd is a fight, not a wall.
    const swinging = this.fighters.filter((o) => o.team === 'foe' && o.state === 'attack').length;
    const myTurn = swinging < 2 && f.cooldown === 0;
    const range = f.kind === 'boss' && Math.abs(dx) > 180 ? 260 : f.kind === 'brute' || f.kind === 'boss' ? 54 : 42;
    const want = myTurn ? range * 0.6 : 120 + (f.id % 3) * 30;
    const side = dx >= 0 ? -1 : 1;
    const goalX = target.x + side * want;
    const ex = goalX - f.x;
    const ez = (myTurn ? dz : dz + ((f.id % 2) * 2 - 1) * 14);
    const close = Math.abs(ex) < 8 && Math.abs(ez) < 6;
    if (myTurn && Math.abs(dx) <= range + 6 && Math.abs(dz) < 10) {
      const move: MoveId = f.kind === 'blade' ? 'slash' : f.kind === 'brute' ? 'slam' : f.kind === 'boss' ? (Math.abs(dx) > 100 ? 'charge' : this.random() < 0.5 ? 'slam' : 'swipe') : 'swipe';
      f.cooldown = (f.kind === 'boss' ? 0.6 : 1.1) + this.random() * 0.9;
      return this.begin(f, move);
    }
    f.vx = close ? 0 : Math.sign(ex) * Math.min(stats.speed, Math.abs(ex) * 4);
    f.vz = Math.abs(ez) < 3 ? 0 : Math.sign(ez) * stats.speed * 0.5;
    const moving = f.vx !== 0 || f.vz !== 0;
    if (moving !== (f.state === 'walk')) {
      f.state = moving ? 'walk' : 'idle';
      f.t = 0;
    }
  }

  // ─── Shared rules ───────────────────────────────────────────────────────────────────────────

  private begin(f: Fighter, move: MoveId): void {
    f.state = 'attack';
    f.move = move;
    f.t = 0;
    f.buffered = false;
    f.struck = [];
    f.vx = 0;
    f.vz = 0;
  }

  private physics(f: Fighter): void {
    if (f.state === 'attack' && f.move) {
      const m = MOVES[f.move];
      const lunging = f.t >= m.startup && f.t < m.startup + m.active;
      f.vx = lunging ? f.facing * m.lunge : f.vx * 0.85;
      if (f.t >= m.startup + m.active + m.recover) {
        if (f.buffered && m.next) this.begin(f, m.next);
        else this.settle(f);
      }
    }
    if (f.state === 'hurt' && f.t >= 0) {
      f.vx *= 0.9;
      if (f.t >= f.stun) this.settle(f);
    }
    if (f.state === 'down') {
      if (f.y <= 0 && f.vy <= 0) f.vx *= 0.85;
      if (f.y <= 0 && f.t > 0.9) {
        if (f.hp <= 0) return this.kill(f);
        f.state = 'getup';
        f.t = 0;
        f.safe = 0.6;
      }
    }
    if (f.state === 'getup' && f.t > 0.35) this.settle(f);

    f.x += f.vx * STEP;
    f.z = Math.max(0, Math.min(DEPTH, f.z + f.vz * STEP));
    if (f.y > 0 || f.vy > 0) {
      f.vy -= GRAVITY * STEP;
      f.y += f.vy * STEP;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        if (f.state === 'jump') {
          f.move = null;
          this.settle(f);
        }
      }
    }
    if (f.state === 'jump' && f.move === 'airkick') this.resolveAttack(f);
    // Heroes stay on screen; the screen holds while a wave is alive.
    const lo = (this.locked?.min ?? this.camera - VIEW / 2) + 16;
    const hi = (this.locked?.max ?? this.camera + VIEW / 2) - 16;
    if (f.team === 'hero') f.x = Math.max(lo, Math.min(hi, f.x));
    else f.x = Math.max(lo - 160, Math.min(hi + 160, f.x));
  }

  private settle(f: Fighter): void {
    f.state = 'idle';
    f.t = 0;
    f.move = null;
    f.vx = 0;
    f.vz = 0;
  }

  private resolveAttack(f: Fighter): void {
    if (!f.move) return;
    const m = MOVES[f.move];
    const airborne = f.move === 'airkick';
    if (!airborne && (f.t < m.startup || f.t >= m.startup + m.active)) return;
    if (airborne && f.t > m.active) return;
    let hitAny = false;
    for (const o of this.fighters) {
      if (o.team === f.team || o.state === 'dead' || o.safe > 0 || f.struck.includes(o.id)) continue;
      if (o.state === 'down' && o.y <= 0) continue;
      const ahead = (o.x - f.x) * f.facing;
      if (ahead > m.reach || ahead < -m.back) continue;
      if (Math.abs(o.z - f.z) > 14 || Math.abs(o.y - f.y) > 60) continue;
      f.struck.push(o.id);
      hitAny = true;
      this.land(f, o, m);
    }
    if (!hitAny && f.t >= m.startup && f.t < m.startup + STEP * 1.5 && !airborne && f.team === 'hero') this.events.push({ type: 'whiff', x: f.x, z: f.z });
  }

  private land(by: Fighter, o: Fighter, m: Move): void {
    o.hp -= m.damage;
    o.lastBy = by.id;
    this.hitstop = m.knockdown ? 0.07 : 0.04;
    this.events.push({ type: 'hit', x: o.x, y: o.y + 50, z: o.z, damage: m.damage, heavy: m.knockdown, by: by.id });
    const dir = (o.x >= by.x ? 1 : -1) as 1 | -1;
    o.facing = (dir === 1 ? -1 : 1) as 1 | -1;
    if (by.team === 'hero') {
      const p = this.players[by.slot];
      p.combo += 1;
      p.comboTimer = COMBO_WINDOW;
      p.bestCombo = Math.max(p.bestCombo, p.combo);
      p.score += Math.round(m.damage * 10 * this.multiplier(by.slot));
      p.rage = Math.min(100, p.rage + m.damage * 0.9);
    } else {
      const p = this.players[o.slot];
      p.damageTaken += m.damage;
      p.rage = Math.min(100, p.rage + m.damage * 0.6);
      p.combo = 0;
    }
    const armoured = m.damage < STATS[o.kind].armour && o.hp > 0;
    if (armoured) return;
    if (m.knockdown || o.hp <= 0 || o.y > 0) {
      o.state = 'down';
      o.t = 0;
      o.move = null;
      o.vx = dir * m.push;
      o.vz = 0;
      o.vy = Math.max(o.vy, m.lift || 140);
      o.y = Math.max(o.y, 1);
    } else {
      o.state = 'hurt';
      o.t = 0;
      o.move = null;
      o.vx = dir * m.push;
      o.vz = 0;
      o.stun = m.stun;
    }
  }

  /** The score multiplier for a player's current combo: up by half every five hits, to 4x. */
  public multiplier(slot: number): number {
    return Math.min(4, 1 + Math.floor(this.players[slot].combo / 5) * 0.5);
  }

  private kill(f: Fighter): void {
    f.state = 'dead';
    f.t = 0;
    if (f.team === 'foe') {
      const score = STATS[f.kind].score;
      // The KO goes to whoever hit them last.
      const killer = this.fighter(f.lastBy);
      if (killer && killer.team === 'hero') this.players[killer.slot].score += Math.round(score * this.multiplier(killer.slot));
      this.events.push({ type: 'ko', x: f.x, z: f.z, kind: f.kind, score });
      if (this.random() < (f.kind === 'brute' ? 0.6 : 0.18)) this.pickups.push({ id: this.nextId++, x: f.x, z: f.z, heal: f.kind === 'brute' ? 50 : 30 });
      return;
    }
    const p = this.players[f.slot];
    p.lives -= 1;
    p.combo = 0;
    if (p.lives > 0) {
      f.state = 'idle';
      f.hp = STATS[f.kind].hp;
      f.y = 220;
      f.vy = 0;
      f.safe = 2.5;
      p.rage = 100;
    }
    if (this.players.every((q) => !q.joined || q.lives <= 0)) {
      this.outcome = 'over';
      this.events.push({ type: 'over' });
    }
  }

  private collectPickups(): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const h = this.heroes().find((f) => Math.abs(f.x - p.x) < 24 && Math.abs(f.z - p.z) < 14 && f.y === 0);
      if (!h) continue;
      h.hp = Math.min(STATS[h.kind].hp, h.hp + p.heal);
      this.pickups.splice(i, 1);
      this.events.push({ type: 'heal', x: p.x, z: p.z });
    }
  }

  private advanceStage(): void {
    const heroes = this.heroes();
    if (heroes.length === 0) return;
    const lead = Math.max(...heroes.map((h) => h.x));
    if (this.locked) {
      if (this.foes().length === 0) {
        this.locked = null;
        this.waveIndex += 1;
        if (this.waveIndex >= this.stage.waves.length) {
          this.outcome = 'clear';
          this.events.push({ type: 'clear' });
          return;
        }
        this.events.push({ type: 'go' });
      }
    } else {
      const wave = this.stage.waves[this.waveIndex];
      if (wave && lead >= wave.at) {
        this.locked = { min: wave.at - VIEW / 2 + 80, max: wave.at + VIEW / 2 + 80 };
        wave.foes.forEach((kind, i) => {
          const fromRight = i % 2 === 0 || kind === 'boss';
          const x = fromRight ? this.locked!.max + 40 + i * 30 : this.locked!.min - 40 - i * 30;
          this.spawn(kind, 'foe', x, 8 + this.random() * (DEPTH - 16));
        });
        this.events.push({ type: 'wave', index: this.waveIndex });
      }
    }
    // The camera follows the heroes' middle, but never back, and only within the lock.
    const mid = heroes.reduce((s, h) => s + h.x, 0) / heroes.length;
    let target = Math.max(this.camera, mid);
    if (this.locked) target = Math.max(this.locked.min + VIEW / 2, Math.min(this.locked.max - VIEW / 2, target));
    this.camera = Math.min(this.stage.length - VIEW / 2, target);
  }
}
