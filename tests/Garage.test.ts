import { describe, it, expect } from 'vitest';
import {
  defaultLoadout,
  statsFor,
  buyUpgrade,
  buyWeapon,
  equip,
  upgradeQuote,
  weaponQuote,
  UPGRADES
} from '../src/rush/Garage';

describe('the garage', () => {
  it('the stock car is the classic three-heart blaster', () => {
    const s = statsFor(defaultLoadout());
    expect(s.maxHearts).toBe(3);
    expect(s.weapon).toBe('blaster');
    expect(s.fireInterval).toBe(1);
    expect(s.startShield).toBe(false);
  });

  it('upgrades cost more each level, and stop at the top', () => {
    for (const def of UPGRADES) {
      for (let i = 1; i < def.costs.length; i++) expect(def.costs[i]).toBeGreaterThan(def.costs[i - 1]);
      expect(def.levels).toHaveLength(def.costs.length);
    }
    const l = defaultLoadout();
    let bank = 10_000;
    for (let i = 0; i < 3; i++) bank -= buyUpgrade(l, 'armor', bank);
    expect(upgradeQuote(l, 'armor', bank)).toEqual({ ok: false, reason: 'Fully upgraded' });
    const s = statsFor(l);
    expect(s.maxHearts).toBe(5);
    expect(s.startShield).toBe(true);
    expect(bank).toBe(10_000 - 150 - 400 - 800);
  });

  it('refuses what you cannot afford and says how much is missing', () => {
    const l = defaultLoadout();
    expect(buyUpgrade(l, 'rapidFire', 50)).toBe(0);
    expect(l.upgrades.rapidFire).toBe(0);
    expect(upgradeQuote(l, 'rapidFire', 50)).toEqual({ ok: false, reason: 'Needs 70 more coins' });
  });

  it('weapons are bought once and can be swapped freely', () => {
    const l = defaultLoadout();
    expect(buyWeapon(l, 'spread', 500)).toBe(500);
    expect(statsFor(l).weapon).toBe('spread');
    expect(weaponQuote(l, 'spread', 9999)).toEqual({ ok: false, reason: 'Owned' });
    expect(equip(l, 'blaster')).toBe(true);
    expect(equip(l, 'laser')).toBe(false);
    expect(statsFor(l).weapon).toBe('blaster');
  });

  it('a stale equipped weapon falls back to the blaster', () => {
    const l = defaultLoadout();
    l.equipped = 'laser';
    expect(statsFor(l).weapon).toBe('blaster');
  });
});
