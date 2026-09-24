import { describe, it, expect } from 'vitest';
import { GAP, IDLE_AFTER, LINES, Radio, SAME_CUE_GAP, lineSeconds } from '../src/city/Radio';

const run = (r: Radio, seconds: number, dt = 0.1) => {
  const said: string[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const line = r.step(dt);
    if (line) said.push(line.text);
  }
  return said;
};

describe('Cantor on the radio', () => {
  it('fills in the outpost and the crew member', () => {
    const r = new Radio();
    const line = r.cue('liberated', { outpost: 'Tollgate', crew: 'Vex' })!;
    expect(line.text).not.toMatch(/\{/);
    for (const cue of Object.keys(LINES) as (keyof typeof LINES)[]) {
      for (const l of LINES[cue]) expect(l.length, l).toBeLessThan(110);
    }
  });

  it('does not talk over himself, or right after himself, about ordinary things', () => {
    const r = new Radio();
    expect(r.cue('spotted')).not.toBeNull();
    expect(r.cue('alarm')).toBeNull();
    run(r, 6);
    expect(r.current).toBeNull();
    expect(r.cue('alarm')).toBeNull();
    run(r, GAP);
    expect(r.cue('alarm')).not.toBeNull();
  });

  it('cuts in for what matters, even mid-line', () => {
    const r = new Radio();
    r.cue('chain');
    expect(r.cue('heroDown')?.cue).toBe('heroDown');
    expect(r.cue('liberated', { outpost: 'Tollgate' })?.cue).toBe('liberated');
  });

  it('does not remark on the same kind of thing twice in quick succession', () => {
    const r = new Radio();
    r.cue('chain');
    run(r, GAP + 6);
    expect(r.cue('chain')).toBeNull();
    run(r, SAME_CUE_GAP);
    expect(r.cue('chain')).not.toBeNull();
  });

  it('uses every line for a moment before repeating one', () => {
    const r = new Radio(7);
    const seen = new Set<string>();
    for (let i = 0; i < LINES.heroDown.length; i++) seen.add(r.cue('heroDown')!.text);
    expect(seen.size).toBe(LINES.heroDown.length);
  });

  it('fills a long silence on his own, and keeps quiet while things are happening', () => {
    const r = new Radio();
    expect(run(r, IDLE_AFTER - 5)).toEqual([]);
    expect(run(r, 10)).toHaveLength(1);
    const busy = new Radio();
    const said: string[] = [];
    for (let t = 0; t < IDLE_AFTER * 2; t += 30) {
      busy.cue('wave');
      said.push(...run(busy, 30));
    }
    expect(said).toEqual([]);
  });

  it('leaves each line up long enough to read', () => {
    expect(lineSeconds('Hi.')).toBeGreaterThanOrEqual(2.8);
    expect(lineSeconds(LINES.liberated[0])).toBeGreaterThan(5);
  });
});
