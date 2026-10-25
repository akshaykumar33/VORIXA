import { MOVES, blank, type Fight, type FightInput } from './Fight';

/**
 * The CPU opponent (ADR-0016): it reads the fight like a player would, with a reaction time, and
 * answers with the same inputs a player has. Difficulty sets how fast it reacts, how often it
 * blocks, and how often it makes a good decision instead of a random one.
 *
 * Seeded, so a fight against it replays exactly.
 */

export interface Difficulty {
  /** Seconds before it reacts to something new. */
  reaction: number;
  /** Chance to block an attack it has seen coming. */
  block: number;
  /** Chance a decision is a good one rather than a random poke. */
  smart: number;
}

export const DIFFICULTY: Record<'easy' | 'normal' | 'hard', Difficulty> = {
  easy: { reaction: 0.42, block: 0.25, smart: 0.35 },
  normal: { reaction: 0.26, block: 0.55, smart: 0.6 },
  hard: { reaction: 0.15, block: 0.85, smart: 0.85 }
};

export class Cpu {
  private seed: number;
  /** The current plan, held for a short while so it does not twitch every step. */
  private plan: FightInput = blank();
  private planFor = 0;
  /**
   * A technique being typed out, step by step, as a player's hands would: a dash's two taps, a
   * jab cancelled into a blast's quarter circle. Each entry is an input held for some steps.
   */
  private script: { input: Partial<FightInput>; steps: number }[] = [];
  /** When it first saw the threat it is reacting to. */
  private sawAt = -1;
  private time = 0;

  public constructor(private readonly slot: 0 | 1, private readonly level: Difficulty, seed = 7) {
    this.seed = seed >>> 0 || 1;
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  public think(fight: Fight, dt: number): FightInput {
    this.time += dt;
    // A technique in progress plays out to its end.
    if (this.script.length) {
      const next = this.script[0];
      next.steps -= 1;
      if (next.steps <= 0) this.script.shift();
      return { ...blank(), ...next.input };
    }
    const me = fight.fighters[this.slot];
    const them = fight.fighters[1 - this.slot];
    const toward = Math.sign(them.x - me.x) || 1;
    const gap = Math.abs(them.x - me.x);
    const back = -toward;

    // A threat: they are mid-attack in reach, jumping in, or a blast is coming.
    const blast = fight.projectiles.find((p) => p.owner !== this.slot && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(me.x - p.x) < 4);
    const attacking = them.state === 'attack' && them.move && !MOVES[them.move].projectile && gap < MOVES[them.move].reach + 0.8;
    const jumpingIn = them.state === 'jump' && gap < 3 && Math.sign(them.vx) === Math.sign(me.x - them.x);
    const threat = blast || attacking || jumpingIn;
    if (threat && this.sawAt < 0) this.sawAt = this.time;
    if (!threat) this.sawAt = -1;
    const reacted = this.sawAt >= 0 && this.time - this.sawAt >= this.level.reaction;

    const input = blank();
    if (reacted) {
      if (blast && this.random() < this.level.smart * 0.6 && Math.abs(me.x - blast.x) < 2.6) {
        // Jump the fireball toward them.
        input.y = 1;
        input.x = toward;
        return input;
      }
      if (jumpingIn && this.random() < this.level.smart) {
        input.hk = true; // An anti-air roundhouse.
        return input;
      }
      if (this.random() < this.level.block) {
        input.x = back;
        if (them.move === 'sweep' || them.move === 'lowKick') input.y = -1;
        return input;
      }
    }

    // Punish a whiff: they are recovering in reach.
    if (them.state === 'attack' && them.move && gap < 1.4 && this.random() < this.level.smart * 0.08) {
      const m = MOVES[them.move];
      if (them.t > m.startup + m.active) {
        input.hp = true;
        return input;
      }
    }

    // Otherwise follow a plan for a short while.
    if (this.time >= this.planFor) this.choose(fight, gap, toward, back);
    const plan = { ...this.plan };
    // Buttons fire once per plan.
    this.plan.lp = this.plan.hp = this.plan.lk = this.plan.hk = false;
    this.plan.blast = this.plan.dash = this.plan.super = false;
    return plan;
  }

  /** Starts a technique: `x` values are toward (+1) or away (-1) from the opponent. */
  private perform(toward: number, steps: [Partial<FightInput>, number][]): void {
    this.script = steps.map(([input, n]) => ({ input: { ...input, ...(input.x !== undefined ? { x: input.x * toward } : {}) }, steps: n }));
  }

  private choose(fight: Fight, gap: number, toward: number, back: number): void {
    const me = fight.fighters[this.slot];
    const smart = this.random() < this.level.smart;
    const r = this.random();
    const them = fight.fighters[1 - this.slot];
    // The techniques, chosen more often the better the CPU: a jab cancelled into a blast up close,
    // a dash to close from mid range, a back-dash away when crowded in the corner.
    const technique = this.random() < this.level.smart * 0.45;
    if (technique) {
      if (gap < 1.15 && them.y === 0 && !fight.projectiles.some((q) => q.owner === this.slot)) {
        this.perform(toward, [[{ lp: true }, 3], [{}, 6], [{ y: -1 }, 4], [{ y: -1, x: 1 }, 4], [{ x: 1 }, 3], [{ x: 1, lp: true }, 3]]);
        return;
      }
      if (gap > 1.8 && gap < 3.4) {
        this.perform(toward, [[{ x: 1 }, 3], [{}, 3], [{ x: 1 }, 4]]);
        return;
      }
      if (gap < 1.4 && Math.abs(me.x) > 4.6 && Math.sign(me.x) === -toward) {
        // Cornered: a back-dash would hit the wall, so dash through the gap toward the centre.
        this.perform(toward, [[{ x: 1 }, 3], [{}, 3], [{ x: 1 }, 4]]);
        return;
      }
      if (gap < 1.3 && them.state === 'attack') {
        this.perform(toward, [[{ x: -1 }, 3], [{}, 3], [{ x: -1 }, 4]]);
        return;
      }
    }
    const p = blank();
    let hold = 0.2 + this.random() * 0.35;
    if (me.meter >= 100 && gap > 2 && smart) p.super = true;
    else if (gap > 3.2) {
      if (r < 0.35 && !fight.projectiles.some((q) => q.owner === this.slot)) p.blast = true;
      else if (r < 0.45 && smart) p.dash = true;
      else p.x = toward;
    } else if (gap > 1.5) {
      if (r < 0.35) p.x = toward;
      else if (r < 0.5) {
        p.x = toward;
        p.y = 1;
      } else if (r < 0.65 && smart) p.blast = true;
      else if (r < 0.8) p.lk = true;
      else p.x = back;
    } else {
      const them = fight.fighters[1 - this.slot];
      // Close: throw someone who keeps blocking; otherwise pokes, a sweep, a step back to reset.
      if (gap < 0.95 && them.blocking && smart && r < 0.35) {
        p.lp = true;
        p.lk = true;
      } else if (r < 0.25) p.lp = true;
      else if (r < 0.42) p.hp = true;
      else if (r < 0.56) p.lk = true;
      else if (r < 0.66) p.hk = true;
      else if (r < 0.76) {
        p.y = -1;
        p.hk = true;
      } else if (r < 0.86) p.x = back;
      else {
        p.y = -1;
        p.x = back;
      }
      hold = 0.12 + this.random() * 0.2;
    }
    this.plan = p;
    this.planFor = this.time + hold;
  }
}
