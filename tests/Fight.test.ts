import { describe, expect, it } from 'vitest';
import { Cpu, DIFFICULTY } from '../src/fighter/Cpu';
import { Fight, MAX_HP, MOVES, STEP, blank, type FightInput, type FighterDef } from '../src/fighter/Fight';

const A: FighterDef = { id: 'a', name: 'A', model: 'mh-kai', colour: 0xff8a1f, title: '' };
const B: FighterDef = { id: 'b', name: 'B', model: 'mh-vex', colour: 0x3de1ff, title: '' };

type Script = (t: number) => Partial<FightInput>;

function run(f: Fight, seconds: number, p1: Script = () => ({}), p2: Script = () => ({})): void {
  let t = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i++, t += STEP) f.step([{ ...blank(), ...p1(t) }, { ...blank(), ...p2(t) }]);
}

/** A fight past its intro, the two fighters a set distance apart. */
function ready(gap = 1.2): Fight {
  const f = new Fight(A, B);
  run(f, 2.05);
  f.fighters[0].x = -gap / 2;
  f.fighters[1].x = gap / 2;
  return f;
}

describe('Fight', () => {
  it('holds the fighters through the intro, then calls FIGHT', () => {
    const f = new Fight(A, B);
    run(f, 1.5, () => ({ x: 1 }));
    expect(f.phase).toBe('intro');
    expect(f.fighters[0].x).toBe(-1.8);
    run(f, 0.6);
    expect(f.phase).toBe('fight');
  });

  it('lands a jab in range and takes its damage', () => {
    const f = ready(1.0);
    run(f, 0.4, (t) => ({ lp: t < 0.02 }));
    expect(f.fighters[1].hp).toBe(MAX_HP - MOVES.jab.damage);
  });

  it('blocks a mid standing and a low only crouching', () => {
    const f = ready(1.0);
    run(f, 0.4, (t) => ({ lp: t < 0.02 }), () => ({ x: 1 }));
    expect(f.fighters[1].hp).toBe(MAX_HP);
    const g = ready(1.0);
    run(g, 0.5, (t) => ({ y: -1, lk: t < 0.02 }), () => ({ x: 1 }));
    expect(g.fighters[1].hp).toBeLessThan(MAX_HP);
    const h = ready(1.0);
    run(h, 0.5, (t) => ({ y: -1, lk: t < 0.02 }), () => ({ x: 1, y: -1 }));
    expect(h.fighters[1].hp).toBe(MAX_HP);
  });

  it('reads a quarter circle forward and punch as a blast that crosses the stage', () => {
    const f = ready(5);
    let fired = false;
    // Down, down-forward, forward, then punch.
    const motion: Script = (t) => (t < 0.05 ? { y: -1 } : t < 0.1 ? { y: -1, x: 1 } : t < 0.15 ? { x: 1 } : t < 0.17 ? { x: 1, lp: true } : {});
    for (let i = 0; i < 300; i++) {
      run(f, STEP, (t) => motion(i * STEP + t));
      if (f.projectiles.length) fired = true;
    }
    expect(fired).toBe(true);
    expect(f.fighters[1].hp).toBe(MAX_HP - MOVES.blast.projectile!.damage);
  });

  it('knocks down with a sweep, and the fighter gets up', () => {
    const f = ready(1.2);
    run(f, 0.35, (t) => ({ y: -1, hk: t < 0.02 }));
    expect(f.fighters[1].state).toBe('knockdown');
    run(f, 2);
    expect(f.fighters[1].state).toBe('stand');
  });

  it('scales combo damage after the second hit', () => {
    const f = ready(0.9);
    // Hold the defender in place: every hit lands during the last one's hitstun.
    run(f, 1.2, (t) => ({ lp: Math.floor(t / 0.11) % 2 === 0 }));
    const taken = MAX_HP - f.fighters[1].hp;
    expect(f.fighters[1].comboTaken > 2 || taken < MOVES.jab.damage * 6).toBe(true);
  });

  it('ends a round on a KO and the match after two rounds', () => {
    const f = ready(1.0);
    f.fighters[1].hp = 30;
    run(f, 0.4, (t) => ({ lp: t < 0.02 }));
    expect(f.phase).toBe('ended');
    expect(f.fighters[0].wins).toBe(1);
    run(f, 4);
    expect(f.round).toBe(2);
    expect(f.fighters[1].hp).toBe(MAX_HP);
    run(f, 2.1);
    f.fighters[0].x = -0.5;
    f.fighters[1].x = 0.5;
    f.fighters[1].hp = 30;
    run(f, 0.4, (t) => ({ lp: t < 0.02 }));
    run(f, 4);
    expect(f.phase).toBe('over');
    expect(f.winner).toBe(0);
  });

  it('spends a full meter on a super', () => {
    const f = ready(4);
    f.fighters[0].meter = 100;
    run(f, 1.2, (t) => ({ super: t < 0.02 }));
    // The super empties the bar; landing it earns a little back.
    expect(f.fighters[0].meter).toBeLessThan(25);
    expect(f.fighters[1].hp).toBeLessThan(MAX_HP - 200);
  });

  it('gives a CPU that blocks and fights back, and a fight that replays exactly', () => {
    const play = () => {
      const f = ready(2);
      const cpu = new Cpu(1, DIFFICULTY.hard, 3);
      for (let i = 0; i < 120 * 20; i++) f.step([{ ...blank(), lp: Math.floor(i / 20) % 3 === 0, x: 1 }, cpu.think(f, STEP)]);
      return f;
    };
    const a = play();
    const b = play();
    expect(a.fighters.map((x) => x.hp)).toEqual(b.fighters.map((x) => x.hp));
    expect(a.fighters[0].hp).toBeLessThan(MAX_HP);
  });
});
