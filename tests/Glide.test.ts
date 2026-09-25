import { describe, it, expect } from 'vitest';
import { buildDistrict, type Box } from '../src/city/CityLayout';
import { GLIDE_MIN_HEIGHT, HeroMotor, type HeroIntent } from '../src/city/HeroMotor';
import { LADDER_REACH, buildLadders, ladderAt } from '../src/city/Rooftops';
import { Chaos, FIRE_DPS } from '../src/city/Chaos';
import { Combat } from '../src/city/Combat';

const DT = 1 / 120;
const d = buildDistrict(4);
const ladders = buildLadders(d);
const intent = (over: Partial<HeroIntent> = {}): HeroIntent => ({
  forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false, ...over
});
const inside = (b: Box, x: number, z: number) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

function onRoof(): { hero: HeroMotor; ladder: (typeof ladders)[number] } {
  const ladder = ladders[0];
  const hero = new HeroMotor(d.colliders, d.bounds);
  hero.place(ladder.x, ladder.z, 0);
  hero.climb(ladder.x, ladder.z, ladder.roofX, ladder.roofY, ladder.roofZ, ladder.facing + Math.PI);
  for (let t = 0; t < 6 && hero.mode === 'climb'; t += DT) hero.step(intent(), DT);
  return { hero, ladder };
}

describe('Rooftop ladders', () => {
  it('puts a ladder on the pavement in front of every large and medium building', () => {
    expect(ladders.length).toBeGreaterThanOrEqual(12);
    for (const l of ladders) {
      // The hero's spot is free to stand in; the roof spot is on top of a building.
      expect(d.colliders.some((c) => inside(c, l.x, l.z)), `${l.x},${l.z}`).toBe(false);
      expect(d.colliders.some((c) => c.height === l.roofY && inside(c, l.roofX, l.roofZ))).toBe(true);
    }
  });

  it('is only in reach from the ground and close by', () => {
    const l = ladders[0];
    expect(ladderAt(ladders, l.x, l.z, 0)).toBe(l);
    expect(ladderAt(ladders, l.x + LADDER_REACH + 0.2, l.z, 0)).toBeNull();
    expect(ladderAt(ladders, l.x, l.z, 5)).toBeNull();
  });

  it('climbs up and steps onto the roof, where the hero can stand and walk', () => {
    const { hero, ladder } = onRoof();
    expect(hero.mode).toBe('foot');
    expect(hero.y).toBeCloseTo(ladder.roofY, 3);
    expect(hero.grounded).toBe(true);
    for (let t = 0; t < 1; t += DT) hero.step(intent({ forward: 1, cameraYaw: ladder.facing }), DT);
    expect(hero.y).toBeCloseTo(ladder.roofY, 3);
    expect(hero.landSpeed).toBe(0);
  });
});

describe('The glider', () => {
  it('opens only with height under the hero, not on an ordinary jump', () => {
    const hero = new HeroMotor(d.colliders, d.bounds);
    hero.place(d.spawn.x, d.spawn.z, 0);
    hero.step(intent({ jumpPressed: true }), DT);
    for (let t = 0; t < 0.2; t += DT) hero.step(intent(), DT);
    hero.step(intent({ jumpPressed: true }), DT);
    expect(hero.height).toBeLessThan(GLIDE_MIN_HEIGHT);
    expect(hero.mode).toBe('foot');
  });

  it('turns a deadly drop off a roof into a soft landing far away', () => {
    // Without it: walk off the roof edge toward the street, and fall.
    const fall = onRoof();
    const out = fall.ladder.facing;
    const yaw = out + Math.PI; // camera looking out over the street
    for (let t = 0; t < 4 && !(fall.hero.grounded && fall.hero.y < 1); t += DT) fall.hero.step(intent({ forward: 1, cameraYaw: yaw }), DT);
    expect(fall.hero.y).toBeLessThan(1);
    expect(fall.hero.landSpeed).toBeGreaterThan(18);

    // With it: the same walk, then the glider once clear of the roof, turning to fly down the
    // street (straight on, the building across the road is only 18 m away).
    const { hero, ladder } = onRoof();
    let opened = false;
    const start = { x: hero.x, z: hero.z };
    // Down the street toward the middle of the district (a camera looks along -sin, -cos of yaw).
    const middle = (d.bounds.minX + d.bounds.maxX) / 2;
    const along = middle > hero.x ? -Math.PI / 2 : Math.PI / 2;
    for (let t = 0; t < 30 && !(opened && hero.mode === 'foot'); t += DT) {
      const drop = !opened && hero.height > GLIDE_MIN_HEIGHT + 1;
      hero.step(intent({ forward: opened ? 0 : 1, cameraYaw: opened ? along : yaw, jumpPressed: drop }), DT);
      if (hero.fx.includes('glide')) opened = true;
    }
    expect(opened).toBe(true);
    expect(hero.mode).toBe('foot');
    expect(hero.landSpeed).toBeLessThan(6);
    const flown = Math.hypot(hero.x - start.x, hero.z - start.z);
    expect(flown, `glided ${flown.toFixed(1)} m from ${ladder.roofY} m`).toBeGreaterThan(ladder.roofY * 2);
  });

  it('dives faster and flares slower, and rises in an updraft', () => {
    const sink = (forward: number, updraft = 0) => {
      const { hero, ladder } = onRoof();
      // Out over the street, at roof height.
      hero.z = ladder.z + (ladder.facing === 0 ? 8 : -8);
      hero.mode = 'glide';
      hero.updraft = updraft;
      // Flying along the street.
      for (let t = 0; t < 2; t += DT) hero.step(intent({ forward, cameraYaw: ladder.facing + Math.PI / 2 }), DT);
      return { vy: hero.vy, speed: hero.speed };
    };
    const level = sink(0);
    const dive = sink(1);
    const flare = sink(-1);
    expect(dive.vy).toBeLessThan(level.vy);
    expect(dive.speed).toBeGreaterThan(level.speed);
    expect(flare.vy).toBeGreaterThan(level.vy);
    expect(sink(0, 7).vy).toBeGreaterThan(0);
  });

  it('rides the heat off a fire up, and is not burned by it on the way', () => {
    const chaos = new Chaos();
    const combat = new Combat(d.colliders, d.bounds);
    const { hero, ladder } = onRoof();
    // A fire in the street below, where the glider is.
    hero.z = ladder.z + (ladder.facing === 0 ? 8 : -8);
    hero.y = 12;
    hero.mode = 'glide';
    chaos.ignite(hero.x, hero.z, 2.5, 30);
    expect(chaos.updraft(hero.x, hero.z, 12)).toBeGreaterThan(4);
    expect(chaos.updraft(hero.x + 30, hero.z, 12)).toBe(0);
    expect(chaos.updraft(hero.x, hero.z, 50)).toBe(0);
    const start = hero.y;
    for (let t = 0; t < 1.5; t += DT) {
      hero.updraft = chaos.updraft(hero.x, hero.z, hero.height);
      hero.step(intent({ forward: -1, cameraYaw: ladder.facing + Math.PI / 2 }), DT);
      combat.step(DT, hero, () => {});
      combat.scorch((x, z) => chaos.burning(x, z), FIRE_DPS, DT);
    }
    expect(hero.y).toBeGreaterThan(start);
    expect(combat.hp).toBe(100);
  });

  it('folds away with another jump, and the fall resumes', () => {
    const { hero, ladder } = onRoof();
    hero.mode = 'glide';
    hero.x = ladder.x;
    hero.z = ladder.z + (ladder.facing === 0 ? 6 : -6);
    hero.step(intent({ jumpPressed: true }), DT);
    expect(hero.mode).toBe('foot');
    for (let t = 0; t < 0.5; t += DT) hero.step(intent(), DT);
    expect(hero.vy).toBeLessThan(-5);
  });
});
