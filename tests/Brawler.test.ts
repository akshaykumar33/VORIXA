import { describe, expect, it } from 'vitest';
import { Brawl, MOVES, STAGE_ONE, STEP, rankFor, type PlayerInput, type StageDef } from '../src/brawler/Brawler';

const idle = (): PlayerInput => ({ x: 0, z: 0, punch: false, heavy: false, jump: false, special: false });

function run(b: Brawl, seconds: number, p1: (t: number) => Partial<PlayerInput> = () => ({}), p2: (t: number) => Partial<PlayerInput> = () => ({})): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) b.step([{ ...idle(), ...p1(b.time) }, { ...idle(), ...p2(b.time) }]);
}

/** A stage with one wave right at the start, for testing a fight in isolation. */
const arena = (foes: StageDef['waves'][number]['foes']): StageDef => ({ name: 'Test', length: 2000, waves: [{ at: 0, foes }] });

describe('Brawl', () => {
  it('chains three punches into a knockdown', () => {
    const b = new Brawl(arena(['thug']));
    run(b, 0.02);
    const hero = b.heroes()[0];
    const foe = b.foes()[0];
    // Put the thug right in front of the hero and keep it from swinging back.
    Object.assign(foe, { x: hero.x + 30, z: hero.z, cooldown: 99 });
    hero.facing = 1;
    let presses = 0;
    run(b, 1.2, (t) => ({ punch: Math.floor(t / 0.09) % 2 === 0 && presses++ < 400 }));
    expect(b.players[0].combo).toBeGreaterThanOrEqual(3);
    expect(['down', 'getup', 'dead']).toContain(foe.state);
    expect(foe.hp).toBeLessThanOrEqual(42 - MOVES.jab1.damage - MOVES.jab2.damage - MOVES.jab3.damage);
  });

  it('never lets more than two foes swing at once', () => {
    const b = new Brawl(arena(['thug', 'thug', 'thug', 'thug', 'thug', 'blade']));
    let most = 0;
    for (let i = 0; i < 1200; i++) {
      b.step([idle(), idle()]);
      most = Math.max(most, b.foes().filter((f) => f.state === 'attack').length);
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(2);
  });

  it('locks the screen for a wave and moves on once it is beaten', () => {
    const b = new Brawl(STAGE_ONE);
    run(b, 6, () => ({ x: 1 }));
    expect(b.locked).not.toBeNull();
    expect(b.foes().length).toBe(STAGE_ONE.waves[0].foes.length);
    for (const f of b.foes()) {
      f.hp = 0;
      f.state = 'down';
      f.t = 2;
    }
    run(b, 0.1);
    expect(b.locked).toBeNull();
    expect(b.waveIndex).toBe(1);
  });

  it('clears the stage when the last wave falls, and scores the kills', () => {
    const b = new Brawl(arena(['thug', 'thug']));
    run(b, 0.05);
    for (const f of b.foes()) Object.assign(f, { hp: 0, state: 'down', t: 2, lastBy: b.heroes()[0].id });
    run(b, 0.05);
    expect(b.outcome).toBe('clear');
    expect(b.players[0].score).toBeGreaterThanOrEqual(600);
  });

  it('lets player two join by pressing punch', () => {
    const b = new Brawl(STAGE_ONE);
    expect(b.heroes().length).toBe(1);
    run(b, 0.05, () => ({}), () => ({ punch: true }));
    expect(b.players[1].joined).toBe(true);
    expect(b.heroes().map((h) => h.kind).sort()).toEqual(['kai', 'vex']);
  });

  it('ends the game when every joined player is out of lives', () => {
    const b = new Brawl(arena(['brute']));
    run(b, 0.05);
    const p = b.players[0];
    p.lives = 1;
    const hero = b.heroes()[0];
    Object.assign(hero, { hp: 0, state: 'down', t: 2, y: 0 });
    run(b, 0.05);
    expect(b.outcome).toBe('over');
  });

  it('spends half the rage meter on the special, which hits all round', () => {
    const b = new Brawl(arena(['thug', 'thug']));
    run(b, 0.02);
    const hero = b.heroes()[0];
    const [a, c] = b.foes();
    Object.assign(a, { x: hero.x + 40, z: hero.z, cooldown: 99 });
    Object.assign(c, { x: hero.x - 40, z: hero.z, cooldown: 99 });
    b.players[0].rage = 60;
    run(b, 0.6, (t) => ({ special: t < 0.05 }));
    expect(b.players[0].rage).toBeLessThan(60);
    expect(a.hp).toBeLessThan(42);
    expect(c.hp).toBeLessThan(42);
  });

  it('plays out the same fight from the same seed', () => {
    const fight = () => {
      const b = new Brawl(STAGE_ONE, 7);
      run(b, 12, (t) => ({ x: 1, punch: Math.floor(t * 8) % 2 === 0 }));
      return JSON.stringify(b.fighters.map((f) => [f.x.toFixed(3), f.hp, f.state]));
    };
    expect(fight()).toBe(fight());
  });

  it('ranks a fast, clean, high-scoring stage above a slow, bloody one', () => {
    expect(rankFor(40000, 120, 20)).toBe('S');
    expect(rankFor(9000, 400, 300)).toBe('D');
  });
});
