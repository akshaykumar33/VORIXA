import { describe, it, expect } from 'vitest';
import {
  musicEvents,
  bpmFor,
  midiToHz,
  C_MAJOR,
  STEPS_PER_BAR,
  type MusicEvent,
  type MusicLevel
} from '../src/audio/RushMusic';

const LOOP = STEPS_PER_BAR * 4;

function loop(level: MusicLevel): MusicEvent[] {
  const all: MusicEvent[] = [];
  const out: MusicEvent[] = [];
  for (let step = 0; step < LOOP; step++) {
    const n = musicEvents(step, level, out);
    for (let i = 0; i < n; i++) all.push({ ...out[i] });
  }
  return all;
}

describe('soundtrack', () => {
  it('stays in key: every pitched note is in C major', () => {
    for (const level of ['title', 'run', 'nitro'] as const) {
      for (const e of loop(level)) {
        if (e.voice === 'kick' || e.voice === 'snare' || e.voice === 'hat') continue;
        expect(C_MAJOR.has(((e.midi % 12) + 12) % 12)).toBe(true);
      }
    }
  });

  it('the title has no drums; racing adds them on the beat', () => {
    expect(loop('title').some((e) => e.voice === 'kick' || e.voice === 'snare')).toBe(false);
    const out: MusicEvent[] = [];
    for (const step of [0, 4, 8, 12]) {
      const n = musicEvents(step, 'run', out);
      expect(out.slice(0, n).some((e) => e.voice === 'kick')).toBe(true);
    }
  });

  it('levels stack: everything in a lower level still plays in a higher one', () => {
    const key = (e: MusicEvent) => `${e.voice}:${e.midi}`;
    const levels: MusicLevel[] = ['title', 'run', 'nitro'];
    for (let i = 1; i < levels.length; i++) {
      const lower = new Set(loop(levels[i - 1]).filter((e) => e.voice !== 'arp').map(key));
      const higher = new Set(loop(levels[i]).map(key));
      for (const k of lower) expect(higher.has(k)).toBe(true);
    }
    expect(loop('nitro').some((e) => e.voice === 'lead')).toBe(true);
    expect(loop('run').some((e) => e.voice === 'lead')).toBe(false);
  });

  it('loops seamlessly', () => {
    const a: MusicEvent[] = [];
    const b: MusicEvent[] = [];
    for (let step = 0; step < LOOP; step++) {
      const n = musicEvents(step, 'nitro', a);
      const m = musicEvents(step + LOOP * 3, 'nitro', b);
      expect(m).toBe(n);
      for (let i = 0; i < n; i++) expect(b[i]).toEqual(a[i]);
    }
  });

  it('speeds up with the car, within a groove-safe range', () => {
    expect(bpmFor(0)).toBeLessThan(bpmFor(1));
    expect(bpmFor(-5)).toBe(bpmFor(0));
    expect(bpmFor(1)).toBeLessThanOrEqual(150);
  });

  it('tunes A4 to 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });
});
