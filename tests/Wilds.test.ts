import { describe, it, expect } from 'vitest';
import { BUILDINGS, buildDistrict } from '../src/city/CityLayout';
import { Combat } from '../src/city/Combat';
import { HeroMotor, type HeroIntent } from '../src/city/HeroMotor';
import { openWilds, waterDepth, WADE_DEPTH, WATER_LEVEL } from '../src/city/Wilds';
import { ANIMALS, Wildlife } from '../src/city/Wildlife';

const DT = 1 / 120;
const fresh = () => {
  const d = buildDistrict(4);
  const w = openWilds(d);
  return { d, w };
};
const { d, w } = fresh();
const intent = (over: Partial<HeroIntent> = {}): HeroIntent => ({
  forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false, ...over
});

describe('The wild country', () => {
  it('opens the north edge: no skyline buildings past the last road, and bounds that run north', () => {
    const before = buildDistrict(4);
    const buildings = (list: typeof d.colliders) => list.filter((c) => Object.values(BUILDINGS).some((b) => b.height === c.height));
    expect(buildings(d.colliders).length).toBeLessThan(buildings(before.colliders).length);
    expect(buildings(d.colliders).some((c) => c.minZ > (d.roadsZ - 1) * d.pitch)).toBe(false);
    expect(d.bounds.maxZ).toBeGreaterThan(w.z0 + 250);
  });

  it('is flat in the city and rolls into hills beyond it, the same every time', () => {
    expect(w.ground(40, 40)).toBe(0);
    expect(w.ground(40, w.z0 - 1)).toBe(0);
    let high = 0;
    for (let z = w.z0 + 60; z < w.z1; z += 10) for (let x = w.minX; x < w.maxX; x += 10) high = Math.max(high, w.ground(x, z));
    expect(high).toBeGreaterThan(8);
    expect(fresh().w.ground(77, w.z0 + 90)).toBe(w.ground(77, w.z0 + 90));
    // No cliffs: the ground never jumps more than a steep slope between neighbouring metres.
    for (let z = w.z0; z < w.z1; z += 3) for (let x = w.minX; x < w.maxX; x += 3) {
      expect(Math.abs(w.ground(x + 1, z) - w.ground(x, z))).toBeLessThan(1.2);
    }
  });

  it('has a lake to wade, never deeper than the waist, and a trail kept clear of trees', () => {
    expect(waterDepth(w, w.lake.x, w.lake.z)).toBeGreaterThan(0.5);
    expect(waterDepth(w, w.lake.x, w.lake.z)).toBeLessThanOrEqual(WADE_DEPTH + 1e-9);
    expect(w.ground(w.lake.x, w.lake.z)).toBeLessThan(WATER_LEVEL);
    for (const t of w.trees) for (const p of w.trail) expect(Math.hypot(t.x - p.x, t.z - p.z)).toBeGreaterThan(3.5);
    expect(w.trees.length).toBeGreaterThan(150);
    expect(w.trees.every((t) => Math.abs(t.y - w.ground(t.x, t.z)) < 1e-9)).toBe(true);
  });

  it('lets the hero walk up the trail into the hills, feet on the ground all the way', () => {
    const hero = new HeroMotor(d.colliders, d.bounds, w.ground);
    const start = w.trail[0];
    hero.place(start.x, start.z - 4, Math.PI);
    let maxGap = 0;
    for (let i = 1; i < w.trail.length - 2; i++) {
      const p = w.trail[i];
      for (let t = 0; t < 4 && Math.hypot(p.x - hero.x, p.z - hero.z) > 1.5; t += DT) {
        hero.step(intent({ forward: 1, cameraYaw: Math.atan2(-(p.x - hero.x), -(p.z - hero.z)) }), DT);
        maxGap = Math.max(maxGap, Math.abs(hero.y - w.ground(hero.x, hero.z)));
      }
    }
    expect(hero.z).toBeGreaterThan(w.z0 + 200);
    expect(maxGap).toBeLessThan(0.7);
    expect(hero.landSpeed).toBeLessThan(6);
  });

  it('stops a body at a tree trunk', () => {
    const tree = w.trees[10];
    const hero = new HeroMotor(d.colliders, d.bounds, w.ground);
    hero.place(tree.x - 3, tree.z, 0);
    for (let t = 0; t < 2; t += DT) hero.step(intent({ forward: 1, cameraYaw: Math.PI / 2 }), DT);
    expect(hero.x).toBeLessThan(tree.x);
  });
});

describe('Wildlife', () => {
  const setup = () => {
    const { d, w } = fresh();
    const combat = new Combat(d.colliders, d.bounds, w.ground, true);
    const hero = new HeroMotor(d.colliders, d.bounds, w.ground);
    hero.place(w.trail[0].x, w.trail[0].z, 0);
    const life = new Wildlife(w, d.colliders, d.bounds, false);
    return { d, w, combat, hero, life };
  };
  const run = (s: ReturnType<typeof setup>, seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += DT) {
      s.hero.step(intent(), DT);
      s.combat.step(DT, s.hero, () => {});
      s.life.step(DT, s.hero, s.combat, s.combat.hp > 0);
      each?.();
    }
  };

  it('populates the wild with packs, herds, stags and foxes', () => {
    const { d, w } = fresh();
    const life = new Wildlife(w, d.colliders, d.bounds);
    const count = (k: string) => life.animals.filter((a) => a.kind === k).length;
    expect(count('wolf')).toBe(9);
    expect(count('deer')).toBeGreaterThanOrEqual(6);
    for (const a of life.animals) expect(a.motor.z).toBeGreaterThan(w.z0 + 30);
  });

  it('sends deer bolting from the hero, faster than a person runs', () => {
    const s = setup();
    const p = s.w.trail[8];
    s.hero.place(p.x, p.z, 0);
    const deer = s.life.spawn('deer', p.x + 10, p.z);
    run(s, 2);
    expect(deer.state).toBe('flee');
    expect(Math.hypot(deer.motor.x - s.hero.x, deer.motor.z - s.hero.z)).toBeGreaterThan(20);
  });

  it('frightens prey with a shot heard from afar', () => {
    const s = setup();
    const p = s.w.trail[12];
    const deer = s.life.spawn('deer', p.x + 30, p.z);
    s.hero.place(p.x - 20, p.z, 0);
    run(s, 0.1);
    expect(deer.state).not.toBe('flee');
    s.life.noise(s.hero.x, s.hero.z, 60);
    expect(deer.state).toBe('flee');
  });

  it('brings a wolf pack down on the hero, biting', () => {
    const s = setup();
    const p = s.w.trail[10];
    s.hero.place(p.x, p.z, 0);
    for (let i = 0; i < 3; i++) s.life.spawn('wolf', p.x + 14 + i, p.z + 2, 1);
    let bites = 0;
    run(s, 8, () => {
      bites += s.life.fx.filter((f) => f.type === 'bite' && f.target === 'hero').length;
      s.combat.hp = Math.max(s.combat.hp, 1);
    });
    expect(bites).toBeGreaterThan(3);
  });

  it('turns wolves on the Choir: a guard alone in the woods is prey', () => {
    const s = setup();
    const p = s.w.trail[14];
    // The hero is far away; the guard is close to the pack.
    s.hero.place(s.w.trail[2].x, s.w.trail[2].z, 0);
    const guard = s.combat.spawn('swat', p.x, p.z, 0);
    for (let i = 0; i < 3; i++) s.life.spawn('wolf', p.x + 10 + i, p.z, 1);
    run(s, 25);
    expect(guard.state).toBe('dead');
  });

  it('turns a wounded stag into a charging one, and a dead animal into a pelt', () => {
    const s = setup();
    const p = s.w.trail[9];
    s.hero.place(p.x, p.z, 0);
    const stag = s.life.spawn('stag', p.x + 16, p.z);
    s.life.hurt(stag, 30, s.hero.x, s.hero.z, true);
    expect(stag.state).toBe('hunt');
    let gored = false;
    run(s, 6, () => {
      if (s.life.fx.some((f) => f.type === 'bite' && f.animal === stag)) gored = true;
    });
    expect(gored).toBe(true);
    s.life.hurt(stag, 999, s.hero.x, s.hero.z, true);
    expect(stag.state).toBe('dead');
    s.hero.place(stag.motor.x, stag.motor.z, 0);
    let cash = 0;
    run(s, 1.5, () => {
      for (const f of s.life.fx) if (f.type === 'pelt') cash += f.cash;
    });
    expect(cash).toBe(ANIMALS.stag.pelt);
  });

  it('is hit by bullets along its body, and blown up by blasts', () => {
    const s = setup();
    const p = s.w.trail[11];
    const wolf = s.life.spawn('wolf', p.x, p.z);
    const hit = s.life.trace(p.x - 10, wolf.motor.y + 0.55, p.z, 1, 0, 0, 50);
    expect(hit.animal).toBe(wolf);
    s.life.blast(p.x + 1, p.z, 6.5, 160);
    expect(wolf.state).toBe('dead');
  });

  it('never hunts a hero who is gliding overhead', () => {
    const s = setup();
    const p = s.w.trail[10];
    s.hero.place(p.x, p.z, 0);
    s.hero.mode = 'glide';
    const wolf = s.life.spawn('wolf', p.x + 8, p.z, 1);
    s.life.step(DT, s.hero, s.combat, true);
    expect(wolf.state === 'hunt' && wolf.prey?.kind === 'hero').toBe(false);
  });
});
