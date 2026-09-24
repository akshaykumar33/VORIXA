import { describe, it, expect } from 'vitest';
import { RushSim, LANE_WIDTH, MAX_HEARTS, type RushIntent, type StageConfig } from '../src/rush/RushSim';

const DT = 1 / 120;
const intent = (over: Partial<RushIntent> = {}): RushIntent => ({ lane: 0, jump: false, fire: false, nitro: false, aimX: 0, ...over });
const stage = (over: Partial<StageConfig> = {}): StageConfig => ({ length: 400, difficulty: 0.1, hasSecret: false, boss: false, bonus: false, ...over });

function run(sim: RushSim, seconds: number, i: RushIntent = intent(), each?: () => void): string[] {
  const seen: string[] = [];
  for (let n = 0; n < Math.round(seconds / DT); n++) {
    sim.update(i, DT);
    each?.();
    for (let f = 0; f < sim.fxCount; f++) seen.push(sim.fx[f].type);
  }
  return seen;
}

/** A stage with nothing in the way, for testing one mechanic at a time. */
function emptyStage(over: Partial<StageConfig> = {}): RushSim {
  const sim = new RushSim(5);
  sim.startStage(stage(over), 5);
  run(sim, 0.05);
  for (const e of sim.entities) if (e.kind !== 'boss') e.alive = false;
  return sim;
}

describe('stages', () => {
  it('end at the finish flag', () => {
    const sim = new RushSim(3);
    sim.startStage(stage({ length: 300 }), 3);
    const seen = run(sim, 25, intent(), () => {
      sim.hearts = MAX_HEARTS;
      sim.invulnerable = 1;
    });
    expect(seen).toContain('finish');
    expect(sim.phase).toBe('clear');
    expect(sim.distance).toBeGreaterThanOrEqual(300);
  });

  it('lay all three star coins along the way', () => {
    const sim = new RushSim(11);
    sim.startStage(stage({ length: 900 }), 11);
    const found = new Set<number>();
    run(sim, 40, intent(), () => {
      sim.invulnerable = 1;
      for (const e of sim.entities) if (e.alive && e.kind === 'starcoin') found.add(e.hp);
    });
    expect([...found].sort()).toEqual([0, 1, 2]);
  });

  it('count crashes for the no-crash goal', () => {
    const sim = emptyStage();
    sim.spawn('barrier', 0, sim.z + 8);
    run(sim, 0.8);
    expect(sim.crashes).toBe(1);
  });

  it('bonus stages lay nothing that can hurt', () => {
    const sim = new RushSim(8);
    sim.startStage(stage({ length: 800, bonus: true }), 8);
    let hazards = 0;
    run(sim, 20, intent(), () => {
      for (const e of sim.entities) if (e.alive && ['barrier', 'truck', 'traffic', 'drone'].includes(e.kind)) hazards++;
    });
    expect(hazards).toBe(0);
  });
});

describe('star coins', () => {
  it('one floating over a barrier wall needs a jump', () => {
    const grounded = emptyStage();
    const star = grounded.spawn('starcoin', 0, grounded.z + 10, 1.5)!;
    star.hp = 1;
    run(grounded, 0.8);
    expect(grounded.starCoins).toBe(0);

    const jumper = emptyStage();
    jumper.spawn('starcoin', 0, jumper.z + jumper.speed * 0.3, 1.5)!.hp = 1;
    jumper.update(intent({ jump: true }), DT);
    run(jumper, 0.8);
    expect(jumper.starCoins).toBe(0b010);
  });
});

describe('secrets', () => {
  it('a golden crate ignores ramming, opens to shots, and drops a warp portal', () => {
    const sim = emptyStage({ hasSecret: true });
    sim.spawn('goldcrate', 0, sim.z + 30, 2.6);
    const seen = run(sim, 2, intent({ fire: true }));
    expect(seen).toContain('secretReveal');
    const portal = sim.entities.find((e) => e.alive && e.kind === 'portal');
    expect(portal).toBeDefined();
    run(sim, 3, intent({ lane: Math.round(portal!.x / LANE_WIDTH) }));
    expect(sim.foundSecret).toBe(true);
  });
});

describe('bosses', () => {
  it('fall to sustained fire and clear the stage', () => {
    const sim = emptyStage({ length: 0, boss: true, difficulty: 0.2 });
    expect(sim.bossHp).toBeGreaterThan(0);
    const seen = run(sim, 40, intent({ fire: true }), () => {
      sim.hearts = MAX_HEARTS;
      sim.invulnerable = 1;
    });
    expect(seen).toContain('finish');
    expect(sim.phase).toBe('clear');
  });

  it('take a big hit from a rocket, but do not fall to one', () => {
    const sim = emptyStage({ length: 0, boss: true, difficulty: 0.5 });
    const before = sim.bossHp;
    sim.heldItem = 'rocket';
    sim.update(intent({ useItem: true }), DT);
    run(sim, 2);
    expect(sim.bossHp).toBe(before - 8);
  });

  it('every volley leaves a lane open', () => {
    const sim = emptyStage({ length: 0, boss: true, difficulty: 1 });
    const seenIds = new Set<number>();
    run(sim, 30, intent(), () => {
      sim.hearts = MAX_HEARTS;
      sim.invulnerable = 5;
      const fresh = sim.entities.filter((e) => e.alive && e.kind === 'shot' && !seenIds.has(e.id));
      for (const shot of fresh) {
        seenIds.add(shot.id);
        const row = sim.entities.filter((o) => o.alive && o.kind === 'shot' && Math.abs(o.z - shot.z) < 2);
        const lanes = new Set(row.map((o) => Math.round(o.x / LANE_WIDTH)));
        expect(lanes.size).toBeLessThan(3);
      }
    });
    expect(seenIds.size).toBeGreaterThan(10);
  });
});

describe('turrets', () => {
  it('fire shots that curve into the lane the car is in', () => {
    const sim = emptyStage({ difficulty: 0.5 });
    sim.update(intent({ lane: 1 }), DT);
    run(sim, 0.3, intent({ lane: 1 }));
    sim.spawn('turret', -6.2, sim.z + 60, 0);
    let arrived = false;
    run(sim, 4, intent({ lane: 1 }), () => {
      sim.hearts = MAX_HEARTS;
      for (const e of sim.entities) {
        if (e.alive && e.kind === 'shot' && Math.abs(e.z - sim.z) < 4) arrived ||= Math.abs(e.x - LANE_WIDTH) < 1.2;
      }
    });
    expect(arrived).toBe(true);
  });

  it('can be blasted', () => {
    const sim = emptyStage({ difficulty: 0.5 });
    sim.spawn('turret', 6.2, sim.z + 50, 0);
    run(sim, 2.5, intent({ fire: true, aimX: 1 }), () => (sim.invulnerable = 1));
    expect(sim.entities.some((e) => e.alive && e.kind === 'turret')).toBe(false);
  });
});

describe('watchers', () => {
  function underWatcher(lane: number): { sim: RushSim; seen: string[] } {
    const sim = emptyStage({ difficulty: 0.3 });
    const w = sim.spawn('watcher', 0, sim.z + 40, 4.2)!;
    // Freeze its sweep on the given lane by picking its phase.
    let seen: string[] = [];
    seen = run(sim, 3, intent({ lane }), () => {
      w.age = 0;
      w.id = [...Array(200).keys()].find((id) => Math.round(Math.sin(id) * 1.25) === lane)!;
    });
    return { sim, seen };
  }

  it('spot a car in their light and call the drones', () => {
    const { sim, seen } = underWatcher(0);
    expect(seen).toContain('spotted');
    expect(sim.entities.some((e) => e.alive && e.kind === 'drone')).toBe(true);
  });

  it('reward slipping through the dark lane', () => {
    const sim = emptyStage({ difficulty: 0.3 });
    const w = sim.spawn('watcher', 0, sim.z + 40, 4.2)!;
    // Light pinned on the right lane; the car drives in the left.
    const seen = run(sim, 3, intent({ lane: -1 }), () => {
      w.age = 0;
      w.id = [...Array(200).keys()].find((id) => Math.round(Math.sin(id) * 1.25) === 1)!;
    });
    expect(seen).toContain('sneaky');
    expect(seen).not.toContain('spotted');
  });

  it('shrug off bullets', () => {
    const sim = emptyStage({ difficulty: 0.3 });
    sim.spawn('watcher', 0, sim.z + 40, 4.2);
    const seen = run(sim, 0.8, intent({ fire: true }));
    expect(seen).not.toContain('hit');
  });

  it('fall to an air assassination off the ramp', () => {
    const sim = new RushSim(21);
    sim.startStage(stage({ difficulty: 0.3 }), 21);
    run(sim, 0.05);
    for (const e of sim.entities) e.alive = false;
    const rampZ = sim.z + 20;
    sim.spawn('ramp', 0, rampZ);
    const t = 14 / 26;
    sim.spawn('watcher', 0, rampZ + 2.6 + sim.speed * t, 4.2);
    const seen = run(sim, 3, intent(), () => (sim.hearts = MAX_HEARTS));
    expect(seen).toContain('assassinate');
  });
});
