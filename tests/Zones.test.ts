import { describe, it, expect } from 'vitest';
import { ZoneSchedule, ZONE_LENGTH, BIOMES, BIOME_NAMES } from '../src/rush/Zones';

describe('zones', () => {
  it('every run opens in the meadow', () => {
    for (let seed = 1; seed < 20; seed++) expect(new ZoneSchedule(seed).biomeAt(10)).toBe('meadow');
  });

  it('never repeats a world back to back', () => {
    const s = new ZoneSchedule(42);
    for (let i = 1; i < 200; i++) expect(s.biomeOf(i)).not.toBe(s.biomeOf(i - 1));
  });

  it('visits every world', () => {
    const s = new ZoneSchedule(7);
    const seen = new Set(Array.from({ length: 60 }, (_, i) => s.biomeOf(i)));
    expect(seen.size).toBe(BIOMES.length);
  });

  it('is a function of the seed', () => {
    const a = new ZoneSchedule(3);
    const b = new ZoneSchedule(3);
    const c = new ZoneSchedule(4);
    const order = (s: ZoneSchedule) => Array.from({ length: 12 }, (_, i) => s.biomeOf(i)).join();
    expect(order(a)).toBe(order(b));
    expect(order(a)).not.toBe(order(c));
  });

  it('measures the distance to the next boundary', () => {
    const s = new ZoneSchedule(1);
    expect(s.toNextZone(0)).toBe(ZONE_LENGTH);
    expect(s.toNextZone(ZONE_LENGTH - 10)).toBe(10);
    expect(s.zoneIndex(ZONE_LENGTH + 1)).toBe(1);
  });

  it('names every world', () => {
    for (const b of BIOMES) expect(BIOME_NAMES[b].length).toBeGreaterThan(0);
  });
});
