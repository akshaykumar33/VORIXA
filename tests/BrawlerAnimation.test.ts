import { describe, expect, it } from 'vitest';
import { Brawl, MOVES } from '../src/brawler/Brawler';
import { FRAMES, cellFor } from '../src/brawler/Animation';

const hero = () => new Brawl().heroes()[0];

describe('sprite cells', () => {
  it('loops idle and walk within their frame counts', () => {
    const f = hero();
    for (let t = 0; t < 3; t += 0.05) {
      expect(cellFor(f, t).frame).toBeLessThan(FRAMES.idle);
      f.state = 'walk';
      const c = cellFor(f, t);
      expect(c.row).toBe('walk');
      expect(c.frame).toBeLessThan(FRAMES.walk);
      f.state = 'idle';
    }
  });

  it('plays a punch from wind-up to recovery across its frames', () => {
    const f = hero();
    f.state = 'attack';
    f.move = 'jab1';
    const total = MOVES.jab1.startup + MOVES.jab1.active + MOVES.jab1.recover;
    f.t = 0;
    expect(cellFor(f, 0)).toEqual({ row: 'jab', frame: 0 });
    f.t = total * 0.99;
    expect(cellFor(f, 0)).toEqual({ row: 'jab', frame: FRAMES.jab - 1 });
  });

  it('maps the combo finisher, the kick and the boss charge to their rows', () => {
    const f = hero();
    f.state = 'attack';
    f.t = 0;
    f.move = 'jab3';
    expect(cellFor(f, 0).row).toBe('uppercut');
    f.move = 'heavy';
    expect(cellFor(f, 0).row).toBe('kick');
    f.move = 'charge';
    expect(cellFor(f, 0).row).toBe('special');
  });

  it('holds the last knockdown frame while lying down', () => {
    const f = hero();
    f.state = 'down';
    f.t = 5;
    expect(cellFor(f, 0)).toEqual({ row: 'knockdown', frame: FRAMES.knockdown - 1 });
  });

  it('shows rise, tuck and fall through a jump', () => {
    const f = hero();
    f.state = 'jump';
    f.move = null;
    f.vy = 400;
    expect(cellFor(f, 0).frame).toBe(0);
    f.vy = 0;
    expect(cellFor(f, 0).frame).toBe(1);
    f.vy = -400;
    expect(cellFor(f, 0).frame).toBe(2);
  });
});

import { STAGE_ONE } from '../src/brawler/Brawler';
import { STAGE_ONE_STORY, momentForWave } from '../src/brawler/Story';

describe('story moments', () => {
  it('opens a scene at the first brute and at the boss, and nowhere else', () => {
    const moments = STAGE_ONE.waves.map((_, i) => momentForWave(STAGE_ONE, i));
    expect(moments.filter((m) => m === 'brute')).toHaveLength(1);
    expect(moments[STAGE_ONE.waves.length - 1]).toBe('boss');
    expect(moments.filter((m) => m === null).length).toBe(STAGE_ONE.waves.length - 2);
  });

  it('has lines for every moment', () => {
    for (const lines of Object.values(STAGE_ONE_STORY)) expect(lines.length).toBeGreaterThan(0);
  });
});
