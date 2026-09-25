import { describe, it, expect } from 'vitest';
import { CHAPTER_ONE, JobRunner, type JobContext } from '../src/city/Jobs';
import { CREW } from '../src/city/Crew';
import { buildDistrict } from '../src/city/CityLayout';

const ctx = (over: Partial<JobContext> = {}): JobContext => ({
  heroX: 0, heroZ: 0, driving: null, inJobCar: false, choirAlive: 0, stars: 0, coinsTaken: 0, bossAlive: false, ...over
});
const byId = (id: string) => CHAPTER_ONE.find((j) => j.id === id)!;

describe('Chapter one', () => {
  it('has five jobs, each with a briefing, steps, an outro and pay', () => {
    expect(CHAPTER_ONE.map((j) => j.id)).toEqual(['wheels', 'stash', 'exit', 'tithe', 'cantor']);
    for (const j of CHAPTER_ONE) {
      expect(j.briefing.length).toBeGreaterThan(0);
      expect(j.steps.length).toBeGreaterThan(0);
      expect(j.outro.length).toBeGreaterThan(0);
      expect(j.cash).toBeGreaterThan(0);
    }
  });

  it('is voiced by real crew members (or the Choir)', () => {
    const ids = new Set([...CREW.map((c) => c.id), 'choir']);
    for (const j of CHAPTER_ONE) for (const p of [...j.briefing, ...j.outro]) expect(ids.has(p.speaker), p.speaker).toBe(true);
  });

  it('puts every objective inside the district', () => {
    const b = buildDistrict(4).bounds;
    for (const j of CHAPTER_ONE) {
      for (const s of j.steps) {
        const points = 'x' in s ? [{ x: s.x, z: s.z }] : s.kind === 'collect' ? s.coins : [];
        for (const p of points) expect(p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ, `${j.id} ${s.kind}`).toBe(true);
      }
    }
  });
});

describe('JobRunner', () => {
  it('runs Wheels: steal the car, then deliver it in time', () => {
    const r = new JobRunner(byId('wheels'));
    r.start();
    expect(r.events.some((e) => e.type === 'placeCar')).toBe(true);
    r.update(ctx(), 1);
    expect(r.step).toBe(0);
    r.update(ctx({ inJobCar: true, driving: 'SportsCar2' }), 1);
    expect(r.step).toBe(1);
    expect(r.timeLeft).toBe(90);
    const s = byId('wheels').steps[1] as { x: number; z: number };
    r.update(ctx({ inJobCar: true, driving: 'SportsCar2', heroX: s.x, heroZ: s.z }), 1);
    expect(r.state).toBe('complete');
    expect(r.events).toContainEqual({ type: 'complete', cash: 1500 });
  });

  it('fails a timed step when the clock runs out', () => {
    const r = new JobRunner(byId('wheels'));
    r.start();
    r.update(ctx({ inJobCar: true }), 1);
    for (let t = 0; t < 95; t++) r.update(ctx({ inJobCar: true }), 1);
    expect(r.state).toBe('failed');
  });

  it('runs Stash House: arrive, clear the crew, take the cash on foot', () => {
    const r = new JobRunner(byId('stash'));
    r.start();
    const [go, clear, cash] = byId('stash').steps as { x: number; z: number }[];
    r.update(ctx({ heroX: go.x, heroZ: go.z }), 0.1);
    expect(r.events.some((e) => e.type === 'spawnCrew')).toBe(true);
    r.update(ctx({ choirAlive: 6 }), 0.1);
    expect(r.step).toBe(1);
    r.update(ctx({ choirAlive: 0 }), 0.1);
    expect(r.step).toBe(2);
    void clear;
    // Still in a car: the case has to be picked up on foot.
    r.update(ctx({ heroX: cash.x, heroZ: cash.z, driving: 'Taxi' }), 0.1);
    expect(r.state).toBe('active');
    r.update(ctx({ heroX: cash.x, heroZ: cash.z }), 0.1);
    expect(r.state).toBe('complete');
  });

  it('runs Loud Exit only after the heat has landed', () => {
    const r = new JobRunner(byId('exit'));
    r.start();
    expect(r.events).toContainEqual({ type: 'setHeat', stars: 3 });
    r.update(ctx({ stars: 0 }), 0.1);
    expect(r.state).toBe('active');
    r.update(ctx({ stars: 3 }), 0.1);
    r.update(ctx({ stars: 0 }), 0.1);
    expect(r.state).toBe('complete');
  });

  it('runs Tithe and Cantor', () => {
    const t = new JobRunner(byId('tithe'));
    t.start();
    t.update(ctx({ coinsTaken: 3 }), 0.1);
    expect(t.state).toBe('complete');
    const c = new JobRunner(byId('cantor'));
    c.start();
    const go = byId('cantor').steps[0] as { x: number; z: number };
    c.update(ctx({ heroX: go.x, heroZ: go.z }), 0.1);
    expect(c.events.some((e) => e.type === 'spawnBoss')).toBe(true);
    c.update(ctx({ bossAlive: true, choirAlive: 5 }), 0.1);
    c.update(ctx({ bossAlive: false, choirAlive: 0 }), 0.1);
    expect(c.state).toBe('complete');
  });
});

describe('Tithe coins', () => {
  it('can only be reached by jumping from a planter, not from the street', async () => {
    const { HeroMotor } = await import('../src/city/HeroMotor');
    const { COIN_REACH } = await import('../src/city/Jobs');
    const d = buildDistrict(4);
    const tithe = byId('tithe').steps[0] as { coins: { x: number; y: number; z: number }[] };
    const peak = (fromPlanter: boolean, coin: { x: number; y: number; z: number }) => {
      const m = new HeroMotor(d.colliders, d.bounds);
      m.place(coin.x, coin.z, 0);
      if (fromPlanter) m.y = 0.51;
      m.step({ forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false }, 1 / 120);
      let best = Infinity;
      m.step({ forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: true, faceCamera: false }, 1 / 120);
      for (let n = 0; n < 200; n++) {
        m.step({ forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false }, 1 / 120);
        best = Math.min(best, Math.hypot(m.x - coin.x, m.y + 1 - coin.y, m.z - coin.z));
      }
      return best;
    };
    for (const coin of tithe.coins) {
      // Every coin sits over a planter.
      expect(d.colliders.some((b) => b.height < 1 && coin.x > b.minX && coin.x < b.maxX && coin.z > b.minZ && coin.z < b.maxZ)).toBe(true);
      expect(peak(true, coin)).toBeLessThan(COIN_REACH);
    }
    // From the street beside a planter, out of reach.
    const coin = tithe.coins[0];
    const m = new HeroMotor([], d.bounds);
    m.place(coin.x + 3, coin.z, 0);
    let best = Infinity;
    m.step({ forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: true, faceCamera: false }, 1 / 120);
    for (let n = 0; n < 200; n++) {
      m.step({ forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false }, 1 / 120);
      best = Math.min(best, Math.abs(m.y + 1 - coin.y));
    }
    expect(best).toBeGreaterThan(COIN_REACH);
  });
});
