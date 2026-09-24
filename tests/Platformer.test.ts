import { describe, it, expect } from 'vitest';
import { buildLevel, GROUND_DEPTH, USED, tileAt, type Section } from '../src/platformer/Level';
import { LEVELS } from '../src/platformer/Levels';
import { checkLevel } from '../src/platformer/LevelValidator';
import { PlatformSim, JUMP_VELOCITY, RUN_SPEED, MAX_HEARTS, type PlatformIntent } from '../src/platformer/PlatformSim';

const DT = 1 / 120;
const idle = (over: Partial<PlatformIntent> = {}): PlatformIntent => ({ move: 0, jumpPressed: false, jumpHeld: false, fire: false, ...over });

/** Wraps test sections with a start, and a flag plus three star coins far out of the way. */
function level(sections: Section[]) {
  return buildLevel('test', [
    { width: 4, place: [[0, 1, '@']] },
    ...sections,
    { width: 12, place: [[8, 1, '***'], [0, 10, 'F']] }
  ]);
}

function run(sim: PlatformSim, seconds: number, i: PlatformIntent = idle(), each?: () => void): string[] {
  const seen: string[] = [];
  for (let n = 0; n < Math.round(seconds / DT); n++) {
    sim.update(i, DT);
    each?.();
    for (let f = 0; f < sim.fxCount; f++) seen.push(sim.fx[f].type);
  }
  return seen;
}

function jump(sim: PlatformSim): void {
  sim.update(idle({ jumpPressed: true, jumpHeld: true }), DT);
}

describe('levels', () => {
  it('every authored level can be finished and every star coin reached', () => {
    for (const l of LEVELS) {
      const r = checkLevel(l);
      expect(r.flag, `${l.name}: flag unreachable`).toBe(true);
      r.starCoins.forEach((ok, i) => expect(ok, `${l.name}: star coin ${i + 1} unreachable`).toBe(true));
    }
  });

  it('the validator catches an impossible gap', () => {
    const l = buildLevel('gap', [
      { width: 6, place: [[0, 1, '@'], [4, 2, '***']] },
      { width: 10, ground: [] },
      { width: 6, place: [[0, 3, 'F']] }
    ]);
    expect(checkLevel(l).flag).toBe(false);
  });

  it('rejects malformed levels loudly', () => {
    expect(() => buildLevel('bad', [{ width: 4, place: [[0, 1, 'X']] }])).toThrow(/unknown tile/);
    expect(() => buildLevel('bad', [{ width: 4, place: [[0, 1, '@F']] }])).toThrow(/star coins/);
  });
});

describe('movement', () => {
  it('stands on the ground and runs at full speed', () => {
    const sim = new PlatformSim(level([{ width: 30 }]));
    run(sim, 0.5);
    expect(sim.onGround).toBe(true);
    expect(sim.y).toBe(GROUND_DEPTH);
    run(sim, 1, idle({ move: 1 }));
    expect(sim.vx).toBeCloseTo(RUN_SPEED);
  });

  it('a held jump goes higher than a tapped one', () => {
    const apex = (held: boolean) => {
      const sim = new PlatformSim(level([{ width: 30 }]));
      run(sim, 0.3);
      sim.update(idle({ jumpPressed: true, jumpHeld: held }), DT);
      let top = 0;
      run(sim, 1, idle({ jumpHeld: held }), () => (top = Math.max(top, sim.y)));
      return top - GROUND_DEPTH;
    };
    expect(apex(true)).toBeGreaterThan(apex(false) * 1.4);
    expect(apex(true)).toBeCloseTo((JUMP_VELOCITY * JUMP_VELOCITY) / (2 * 38), 0);
  });

  it('walls stop the hero', () => {
    const sim = new PlatformSim(level([{ width: 10, place: [[0, 3, 'B'], [1, 3, 'B'], [2, 3, 'B']] }]));
    run(sim, 2, idle({ move: 1 }));
    expect(sim.x).toBeLessThan(4 + 3);
  });

  it('coyote time: a jump just after running off a ledge still counts', () => {
    const sim = new PlatformSim(level([{ width: 6 }, { width: 4, ground: [] }, { width: 20 }]));
    let pressed = false;
    run(sim, 3, idle({ move: 1, jumpHeld: true }), () => {
      // Press jump a few frames after the hero has left the ground.
      if (!pressed && !sim.onGround && sim.vy < -0.5) {
        pressed = true;
        sim.update(idle({ move: 1, jumpPressed: true, jumpHeld: true }), DT);
      }
    });
    expect(pressed).toBe(true);
    expect(sim.hearts).toBe(MAX_HEARTS);
  });

  it('jump buffering: a press just before landing jumps on landing', () => {
    const sim = new PlatformSim(level([{ width: 30 }]));
    run(sim, 0.3);
    jump(sim);
    let buffered = false;
    let relaunched = false;
    run(sim, 2, idle({ jumpHeld: true }), () => {
      if (!buffered && !sim.onGround && sim.vy < 0 && sim.y - GROUND_DEPTH < 0.3) {
        buffered = true;
        sim.update(idle({ jumpPressed: true, jumpHeld: true }), DT);
      }
      if (buffered && sim.vy > 5) relaunched = true;
    });
    expect(relaunched).toBe(true);
  });

  it('one-way platforms catch you from above and let you jump up through', () => {
    const sim = new PlatformSim(level([{ width: 20, place: [[1, 2, '======']] }]));
    sim.x = 7.5;
    run(sim, 0.3);
    jump(sim);
    run(sim, 1.5, idle({ jumpHeld: true }));
    expect(sim.y).toBeCloseTo(GROUND_DEPTH + 2, 1);
    expect(sim.onGround).toBe(true);
  });
});

describe('blocks', () => {
  it('bumping a coin block from below pays once and uses it up', () => {
    const sim = new PlatformSim(level([{ width: 20, place: [[2, 2, '?']] }]));
    sim.x = 6.5;
    run(sim, 0.3);
    jump(sim);
    run(sim, 1.5, idle({ jumpHeld: true }));
    expect(sim.coins).toBe(1);
    expect(tileAt(sim.level, 6.5, GROUND_DEPTH + 2)).toBe(USED);
    jump(sim);
    run(sim, 1.5, idle({ jumpHeld: true }));
    expect(sim.coins).toBe(1);
  });
});

describe('enemies', () => {
  it('landing on a walker stomps it and bounces', () => {
    const sim = new PlatformSim(level([{ width: 20, place: [[0, 6, 'w']] }]));
    sim.x = 10.5;
    sim.y = GROUND_DEPTH + 4;
    const seen = run(sim, 1);
    expect(seen).toContain('stomp');
    expect(sim.kills).toBe(1);
    expect(sim.hearts).toBe(MAX_HEARTS);
  });

  it('walking into one hurts', () => {
    const sim = new PlatformSim(level([{ width: 20, place: [[0, 8, 'w']] }]));
    run(sim, 2.5, idle({ move: 1 }));
    expect(sim.hearts).toBe(MAX_HEARTS - 1);
  });

  it('walkers turn at ledges instead of falling', () => {
    const sim = new PlatformSim(level([{ width: 6, place: [[0, 3, 'w']] }, { width: 6, ground: [] }, { width: 30 }]));
    sim.x = 30;
    sim.enemies[0].x = 7.5;
    run(sim, 6, idle(), () => (sim.x = 30));
    expect(sim.enemies[0].alive).toBe(true);
  });

  it('the blaster brings one down', () => {
    const sim = new PlatformSim(level([{ width: 20, place: [[0, 12, 'w']] }]));
    run(sim, 1.2, idle({ fire: true }));
    expect(sim.kills).toBe(1);
  });

  it('turrets fire along the ground at a hero in range', () => {
    const sim = new PlatformSim(level([{ width: 20, place: [[0, 10, 't']] }]));
    const seen = run(sim, 4);
    expect(seen).toContain('enemyFire');
    expect(sim.hearts).toBeLessThan(MAX_HEARTS);
  });
});

describe('hazards and goals', () => {
  it('spikes hurt', () => {
    const sim = new PlatformSim(level([{ width: 12, place: [[0, 4, '^^^']] }]));
    run(sim, 1.5, idle({ move: 1 }));
    expect(sim.hearts).toBeLessThan(MAX_HEARTS);
  });

  it('pits cost a heart and send you back to the checkpoint', () => {
    const sim = new PlatformSim(level([{ width: 6, place: [[0, 2, 'C']] }, { width: 10, ground: [] }, { width: 20 }]));
    const seen = run(sim, 3, idle({ move: 1 }));
    expect(seen).toContain('checkpoint');
    expect(seen).toContain('pit');
    expect(sim.hearts).toBeLessThan(MAX_HEARTS);
  });

  it('the flag clears the level', () => {
    const sim = new PlatformSim(level([{ width: 10 }]));
    const seen = run(sim, 5, idle({ move: 1 }));
    expect(seen).toContain('flag');
    expect(sim.phase).toBe('clear');
  });

  it('star coins are collected once each', () => {
    const sim = new PlatformSim(buildLevel('stars', [{ width: 20, place: [[0, 1, '@'], [0, 4, '***'], [0, 16, 'F']] }]));
    run(sim, 1.2, idle({ move: 1 }));
    expect(sim.starCoins).toBe(0b111);
  });
});
