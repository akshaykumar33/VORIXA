import { describe, it, expect } from 'vitest';
import {
  RushSim,
  LANE_WIDTH,
  MAX_HEARTS,
  KIND_SHAPE,
  START_SPEED,
  type RushIntent
} from '../src/rush/RushSim';
import { OPENING_CLEAR, PATTERN_NAMES, pickPattern } from '../src/rush/Patterns';
import { createRng } from '../src/world/Rng';

const DT = 1 / 120;

function intent(over: Partial<RushIntent> = {}): RushIntent {
  return { lane: 0, jump: false, fire: false, nitro: false, aimX: 0, ...over };
}

function step(sim: RushSim, seconds: number, i: RushIntent = intent()): void {
  const ticks = Math.round(seconds / DT);
  for (let n = 0; n < ticks; n++) sim.update(i, DT);
}

/** A running sim with an empty road, so a test controls exactly what is ahead. */
function running(): RushSim {
  const sim = new RushSim(7);
  sim.update(intent({ jump: true }), DT);
  // Land the opening hop, then clear anything the generator laid.
  step(sim, 1);
  for (const e of sim.entities) e.alive = false;
  return sim;
}

function clearRoad(sim: RushSim): void {
  for (const e of sim.entities) e.alive = false;
}

describe('start', () => {
  it('cruises under the title and starts on any input', () => {
    const sim = new RushSim(1);
    step(sim, 2);
    expect(sim.phase).toBe('ready');
    expect(sim.speed).toBeGreaterThan(5);
    sim.update(intent({ fire: true }), DT);
    expect(sim.phase).toBe('running');
    expect(sim.speed).toBeGreaterThanOrEqual(START_SPEED);
  });

  it('keeps the opening stretch clear, measured from where the run began', () => {
    const sim = new RushSim(3);
    step(sim, 10); // long title cruise
    const startZ = sim.z;
    sim.update(intent({ jump: true }), DT);
    for (const e of sim.entities) {
      if (e.alive) expect(e.z).toBeGreaterThanOrEqual(startZ + OPENING_CLEAR - 1);
    }
  });
});

describe('steering', () => {
  it('reaches a new lane in about a fifth of a second', () => {
    const sim = running();
    step(sim, 0.25, intent({ lane: 1 }));
    expect(sim.x).toBeCloseTo(LANE_WIDTH, 5);
  });

  it('clamps requests outside the road', () => {
    const sim = running();
    step(sim, 0.6, intent({ lane: 5 }));
    expect(sim.lane).toBe(1);
  });
});

describe('obstacles', () => {
  it('crashing costs a heart and speed, and grants brief invulnerability', () => {
    const sim = running();
    const before = sim.speed;
    sim.spawn('barrier', 0, sim.z + 6);
    step(sim, 0.5);
    expect(sim.hearts).toBe(MAX_HEARTS - 1);
    expect(sim.speed).toBeLessThan(before);
    expect(sim.invulnerable).toBeGreaterThan(0);
  });

  it('a jump clears a barrier', () => {
    const sim = running();
    sim.spawn('barrier', 0, sim.z + sim.speed * 0.25);
    sim.update(intent({ jump: true }), DT);
    step(sim, 1);
    expect(sim.hearts).toBe(MAX_HEARTS);
  });

  it('a jump does not clear a truck', () => {
    const sim = running();
    sim.spawn('truck', 0, sim.z + sim.speed * 0.25);
    sim.update(intent({ jump: true }), DT);
    step(sim, 1);
    expect(sim.hearts).toBe(MAX_HEARTS - 1);
  });

  it('invulnerability prevents a second heart on the next obstacle', () => {
    const sim = running();
    sim.spawn('barrier', 0, sim.z + 5);
    sim.spawn('barrier', 0, sim.z + 12);
    step(sim, 0.6);
    expect(sim.hearts).toBe(MAX_HEARTS - 1);
  });

  it('three crashes end the run', () => {
    const sim = running();
    for (let i = 0; i < MAX_HEARTS; i++) {
      sim.spawn('truck', 0, sim.z + 8);
      step(sim, 2);
      clearRoad(sim);
    }
    expect(sim.phase).toBe('over');
    expect(sim.hearts).toBe(0);
  });

  it('crates smash for points and top up nitro, without damage', () => {
    const sim = running();
    const nitro = sim.nitro;
    sim.spawn('crate', 0, sim.z + 6);
    step(sim, 0.5);
    expect(sim.hearts).toBe(MAX_HEARTS);
    expect(sim.nitro).toBeGreaterThan(nitro);
    expect(sim.score).toBeGreaterThanOrEqual(50);
  });

  it('nitro rams traffic but not trucks', () => {
    const sim = running();
    sim.nitro = 1;
    sim.spawn('traffic', 0, sim.z + 10, 0, 5);
    step(sim, 0.8, intent({ nitro: true }));
    expect(sim.hearts).toBe(MAX_HEARTS);
    expect(sim.kills).toBe(1);

    sim.nitro = 1;
    sim.spawn('truck', 0, sim.z + 10);
    step(sim, 0.8, intent({ nitro: true }));
    expect(sim.hearts).toBe(MAX_HEARTS - 1);
  });

  it('a ramp launches higher than a jump', () => {
    const jumpSim = running();
    jumpSim.update(intent({ jump: true }), DT);
    let jumpApex = 0;
    for (let i = 0; i < 120; i++) {
      jumpSim.update(intent(), DT);
      jumpApex = Math.max(jumpApex, jumpSim.y);
    }
    const rampSim = running();
    rampSim.spawn('ramp', 0, rampSim.z + 4);
    let rampApex = 0;
    for (let i = 0; i < 180; i++) {
      rampSim.update(intent(), DT);
      rampApex = Math.max(rampApex, rampSim.y);
    }
    expect(rampApex).toBeGreaterThan(jumpApex * 1.5);
  });
});

describe('pickups', () => {
  it('coins count and score', () => {
    const sim = running();
    sim.spawn('coin', 0, sim.z + 5, 0.6);
    step(sim, 0.4);
    expect(sim.coins).toBe(1);
  });

  it('hearts never exceed the maximum', () => {
    const sim = running();
    sim.spawn('heart', 0, sim.z + 5, 0.3);
    step(sim, 0.4);
    expect(sim.hearts).toBe(MAX_HEARTS);
  });
});

describe('shooting', () => {
  it('aim assist brings down a drone in another lane', () => {
    const sim = running();
    sim.spawn('drone', LANE_WIDTH, sim.z + 40, 3.4);
    step(sim, 1.5, intent({ fire: true, aimX: 1 / 1.6 }));
    expect(sim.kills).toBe(1);
  });

  it('does not fire faster than the fire interval', () => {
    const sim = running();
    let shots = 0;
    for (let i = 0; i < 120; i++) {
      sim.update(intent({ fire: true }), DT);
      for (let f = 0; f < sim.fxCount; f++) if (sim.fx[f].type === 'fire') shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(6);
    expect(shots).toBeLessThanOrEqual(8);
  });

  it('kills in quick succession build a combo', () => {
    const sim = running();
    for (let i = 0; i < 3; i++) sim.spawn('crate', 0, sim.z + 8 + i * 3);
    step(sim, 0.6);
    expect(sim.combo).toBeGreaterThan(1);
  });
});

describe('patterns', () => {
  it('every pattern is reachable', () => {
    const rng = createRng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) seen.add(pickPattern(rng, i / 4000));
    expect([...seen].sort()).toEqual([...PATTERN_NAMES].sort());
  });

  it('never walls off all three lanes with trucks', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = new RushSim(seed);
      sim.update(intent({ jump: true }), DT);
      // Fast-forward the road without playing: move the car along and let patterns spawn.
      for (let t = 0; t < 400; t++) {
        sim.z += 25;
        sim.update(intent(), DT);
        sim.hearts = MAX_HEARTS;
        sim.invulnerable = 10;
        const trucks = sim.entities.filter((e) => e.alive && e.kind === 'truck');
        for (const a of trucks) {
          const lanes = new Set(
            trucks
              .filter((b) => Math.abs(b.z - a.z) < KIND_SHAPE.truck.hz * 2 + 20)
              .map((b) => Math.round(b.x / LANE_WIDTH))
          );
          expect(lanes.size).toBeLessThan(3);
        }
      }
    }
  });

  it('is deterministic from the seed', () => {
    const a = new RushSim(99);
    const b = new RushSim(99);
    const script = intent({ jump: true, fire: true });
    step(a, 8, script);
    step(b, 8, script);
    const snapshot = (s: RushSim) =>
      s.entities.filter((e) => e.alive).map((e) => `${e.kind}:${e.x.toFixed(2)}:${e.z.toFixed(1)}`);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.score).toBe(b.score);
  });
});

describe('scoring', () => {
  it('the title cruise earns nothing; the run starts from zero', () => {
    const sim = new RushSim(5);
    step(sim, 5);
    expect(sim.score).toBe(0);
    expect(sim.distance).toBe(0);
    sim.update(intent({ jump: true }), DT);
    step(sim, 1);
    expect(sim.distance).toBeGreaterThan(20);
    expect(sim.distance).toBeLessThan(40);
    expect(sim.score).toBeGreaterThan(0);
  });
});

describe('tricks', () => {
  function events(sim: RushSim, seconds: number, i: RushIntent = intent()): string[] {
    const seen: string[] = [];
    const ticks = Math.round(seconds / DT);
    for (let n = 0; n < ticks; n++) {
      sim.update(i, DT);
      for (let f = 0; f < sim.fxCount; f++) seen.push(sim.fx[f].type);
    }
    return seen;
  }

  it('threading past traffic in the next lane is a close call that feeds nitro', () => {
    const sim = running();
    sim.nitro = 0.2;
    // Right lane edge sits 3.2 - 1.0 - 0.95 = 1.25 m away: too far. Offset it to a hair's gap.
    sim.spawn('traffic', PLAYER_EDGE_GAP(0.4), sim.z + 20, 0, 5);
    const seen = events(sim, 1.5);
    expect(seen).toContain('nearMiss');
    expect(sim.nearMisses).toBe(1);
    expect(sim.nitro).toBeGreaterThan(0.2);
  });

  it('a comfortable pass is not a close call', () => {
    const sim = running();
    sim.spawn('traffic', LANE_WIDTH, sim.z + 20, 0, 5);
    expect(events(sim, 1.5)).not.toContain('nearMiss');
  });

  it('clearing a barrier in the air pays a jump-over, once', () => {
    const sim = running();
    sim.spawn('barrier', 0, sim.z + sim.speed * 0.25);
    sim.update(intent({ jump: true }), DT);
    const seen = events(sim, 1);
    expect(seen.filter((t) => t === 'jumpOver')).toHaveLength(1);
    expect(sim.hearts).toBe(MAX_HEARTS);
  });

  it('a flip off a ramp completes in the air and pays nitro', () => {
    const sim = running();
    sim.nitro = 0;
    sim.spawn('ramp', 0, sim.z + 4);
    // Ride onto the ramp, then flip near the top of the arc.
    events(sim, 0.4);
    const seen = [...events(sim, DT, intent({ jump: true })), ...events(sim, 1.5)];
    expect(seen).toContain('flip');
    expect(seen).not.toContain('sloppyLanding');
    expect(sim.flips).toBe(1);
    expect(sim.nitro).toBeGreaterThan(0.2);
  });

  it('landing mid-flip is sloppy: speed lost, hearts kept', () => {
    const sim = running();
    sim.update(intent({ jump: true }), DT);
    // Wait for the height a flip needs, then start one too late to finish before touchdown.
    let guard = 0;
    while (!(sim.vy < 0 && sim.y < 1.5 && sim.y > 1.2) && guard++ < 200) sim.update(intent(), DT);
    const before = sim.speed;
    const seen = [...events(sim, DT, intent({ jump: true })), ...events(sim, 1)];
    expect(seen).toContain('sloppyLanding');
    expect(sim.speed).toBeLessThan(before);
    expect(sim.hearts).toBe(MAX_HEARTS);
  });

  it('a nitro ram through traffic is a takedown worth more than a shot', () => {
    const sim = running();
    sim.nitro = 1;
    sim.spawn('traffic', 0, sim.z + 10, 0, 5);
    const before = sim.score;
    const seen = events(sim, 0.8, intent({ nitro: true }));
    expect(seen).toContain('takedown');
    expect(sim.score - before).toBeGreaterThanOrEqual(250);
  });
});

/** Lateral position that leaves `gap` metres between the car and traffic in the right lane. */
function PLAYER_EDGE_GAP(gap: number): number {
  return 0.95 + 1.0 + gap;
}
