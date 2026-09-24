import { describe, it, expect } from 'vitest';
import { CityLife, HEAT_COOLDOWN, MAX_HEAT } from '../src/city/CityLife';
import { buildDistrict } from '../src/city/CityLayout';
import { Combat } from '../src/city/Combat';
import { HeroMotor } from '../src/city/HeroMotor';

const DT = 1 / 120;
const d = buildDistrict(4);

describe('CityLife', () => {
  it('walks citizens along the sidewalks, never into a building or out of the district', () => {
    const life = new CityLife(d, 28);
    const bnd = d.bounds;
    const buildings = d.colliders.filter((box) => box.height >= 2);
    const bad: string[] = [];
    for (let n = 0; n < 30 * 120; n++) {
      life.step(DT, false);
      if (n % 10) continue;
      for (const c of life.citizens) {
        if (!(c.x > bnd.minX && c.x < bnd.maxX && c.z > bnd.minZ && c.z < bnd.maxZ)) bad.push(`${c.id} out at ${c.x},${c.z}`);
        if (buildings.some((box) => c.x > box.minX && c.x < box.maxX && c.z > box.minZ && c.z < box.maxZ)) bad.push(`${c.id} inside`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('panics and runs from gunfire, then calms down', () => {
    const life = new CityLife(d, 28);
    const c = life.citizens[0];
    life.gunshot(c.x + 3, c.z + 3);
    expect(c.panic).toBeGreaterThan(0);
    expect(life.fx.some((f) => f.type === 'scream')).toBe(true);
    for (let t = 0; t < 12; t += DT) life.step(DT, false);
    expect(c.panic).toBe(0);
  });

  it('can be shot, raising the heat, and the heat cools when nobody is watching', () => {
    const life = new CityLife(d, 28);
    const c = life.citizens[0];
    const hit = life.trace(c.x, 1.2, c.z + 10, 0, 0, -1);
    expect(hit.citizen).toBe(c);
    life.hurt(c, false);
    expect(c.alive).toBe(false);
    expect(life.stars).toBe(1);
    // Watched by police, it holds; unwatched, it cools.
    for (let t = 0; t < HEAT_COOLDOWN + 2; t += DT) life.step(DT, true);
    expect(life.stars).toBe(1);
    for (let t = 0; t < HEAT_COOLDOWN + 2; t += DT) life.step(DT, false);
    expect(life.stars).toBe(0);
  });

  it('caps the heat at five stars', () => {
    const life = new CityLife(d, 28);
    for (let i = 0; i < 10; i++) life.raiseHeat(1);
    expect(life.stars).toBe(MAX_HEAT);
  });

  it('knocks down whoever a speeding car hits', () => {
    const life = new CityLife(d, 28);
    const c = life.citizens[3];
    expect(life.runOver(c.x, c.z, 1, 2)).toBe(0);
    expect(life.runOver(c.x, c.z, 1, 12)).toBeGreaterThanOrEqual(1);
    expect(c.alive).toBe(false);
  });
});

describe('Police', () => {
  it('arrive already alerted, do not count toward a Choir wave, and stand down', () => {
    const c = new Combat([], d.bounds);
    c.spawnWave(0, 0, 3);
    c.spawn('police', 20, 20, 0);
    expect(c.alive).toBe(3);
    expect(c.policeOnScene).toBe(1);
    const hero = new HeroMotor([], d.bounds);
    hero.place(20, 5, 0);
    for (let t = 0; t < 3; t += DT) c.step(DT, hero, () => {});
    expect(c.enemies.find((e) => e.kind === 'police')!.state).toBe('fight');
    c.standDownPolice();
    expect(c.policeOnScene).toBe(0);
    expect(c.alive).toBe(3);
  });
});
