import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { CREW, CHOIR, POLICE, PERKS, citizen, unlocked, perkEffects, type PerkId } from '../src/city/Crew';

describe('Crew', () => {
  it('has a cast of distinct, complete characters', () => {
    expect(CREW.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(CREW.map((c) => c.id));
    expect(ids.size).toBe(CREW.length);
    for (const c of CREW) {
      expect(c.name && c.alias && c.role && c.bio).toBeTruthy();
      expect(c.perk).toBeDefined();
      expect(PERKS[c.perk as PerkId]).toBeDefined();
    }
  });

  it('dresses every character in an outfit that exists', () => {
    for (const c of [...CREW, ...CHOIR, POLICE, citizen(1), citizen(2)]) {
      expect(fs.existsSync(`public/city/people/${c.model}.glb`), c.model).toBe(true);
    }
  });

  it('gives each crew member a look of their own: no two share outfit and palette', () => {
    const looks = CREW.map((c) => `${c.model}|${JSON.stringify(c.palette)}`);
    expect(new Set(looks).size).toBe(CREW.length);
  });

  it('unlocks the crew as waves are cleared, starting with three', () => {
    expect(unlocked(0).map((c) => c.id)).toEqual(['vex', 'rook', 'silas']);
    expect(unlocked(3).length).toBe(6);
    expect(unlocked(99).length).toBe(CREW.length);
  });

  it('makes varied citizens, the same every time for the same index', () => {
    expect(citizen(5)).toEqual(citizen(5));
    const looks = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(citizen(i))));
    expect(looks.size).toBe(30);
  });

  it('turns perks into numbers the game applies', () => {
    expect(perkEffects('tank').armorMax).toBe(100);
    expect(perkEffects('quickdraw').reloadTime).toBeLessThan(1);
    expect(perkEffects(undefined)).toEqual(perkEffects(undefined));
    expect(perkEffects('focus').bulletTimeWhenAiming).toBe(true);
  });
});
