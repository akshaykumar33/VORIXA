import { describe, it, expect } from 'vitest';
import { createRng, hashCoord, hashInt, seedFromString, streamFor } from '../src/world/Rng';

/**
 * World generation is only worth building on a generator with two guarantees: the same seed always
 * produces the same world, and any segment can be produced without producing its predecessors.
 *
 * Both are invisible when broken. A subtly order-dependent generator still produces a plausible
 * world — it just produces a *different* one depending on where the player entered, which surfaces
 * as geometry changing behind your back and ghost replays desyncing.
 */

function draw(rng: { next(): number }, count: number): number[] {
  return Array.from({ length: count }, () => rng.next());
}

describe('determinism', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(createRng(12345), 20)).toEqual(draw(createRng(12345), 20));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(createRng(1), 20)).not.toEqual(draw(createRng(2), 20));
  });

  it('survives a zero seed', () => {
    // Zero is a fixed point for some generators in this family and would emit a constant stream.
    const values = draw(createRng(0), 12);
    expect(new Set(values).size).toBeGreaterThan(8);
  });
});

describe('positional addressing', () => {
  it('generates a segment without generating its predecessors', () => {
    // The property the whole streaming design rests on.
    const direct = draw(streamFor(99, 500), 8);

    let sequential: number[] = [];
    for (let i = 0; i <= 500; i++) sequential = draw(streamFor(99, i), 8);

    expect(direct).toEqual(sequential);
  });

  it('gives adjacent indices unrelated streams', () => {
    // Weak mixing leaves segments that rhyme every few steps, which reads as repetition.
    const a = draw(streamFor(7, 100), 6);
    const b = draw(streamFor(7, 101), 6);
    expect(a).not.toEqual(b);
    expect(Math.abs(a[0] - b[0])).toBeGreaterThan(0.01);
  });

  it('does not collide seed and index', () => {
    // hash(seed+1, index) must not equal hash(seed, index+1).
    expect(hashCoord(5, 10)).not.toBe(hashCoord(6, 9));
    expect(hashCoord(5, 10)).not.toBe(hashCoord(4, 11));
  });

  it('regenerates identically when the player backtracks', () => {
    const first = draw(streamFor(42, 17), 10);
    // …a hundred other segments generated in between…
    for (let i = 0; i < 100; i++) draw(streamFor(42, 200 + i), 4);
    expect(draw(streamFor(42, 17), 10)).toEqual(first);
  });
});

describe('distribution', () => {
  it('stays inside [0, 1)', () => {
    const rng = createRng(3);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('has a roughly uniform mean', () => {
    const rng = createRng(11);
    let total = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) total += rng.next();
    expect(total / n).toBeCloseTo(0.5, 1);
  });

  it('covers the full integer range inclusively', () => {
    const rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps range within bounds', () => {
    const rng = createRng(8);
    for (let i = 0; i < 2000; i++) {
      const v = rng.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
    }
  });

  it('honours chance probabilities', () => {
    const rng = createRng(13);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (rng.chance(0.25)) hits++;
    expect(hits / 10000).toBeCloseTo(0.25, 1);
  });

  it('avalanches single-bit input changes', () => {
    // Adjacent inputs must not produce adjacent outputs.
    const a = hashInt(1000);
    const b = hashInt(1001);
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });
});

describe('pick', () => {
  it('selects from the list', () => {
    const rng = createRng(21);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 200; i++) expect(items).toContain(rng.pick(items));
  });

  it('throws on an empty list rather than returning undefined', () => {
    // Returning undefined would surface far downstream as a null geometry, long after the cause.
    expect(() => createRng(1).pick([])).toThrow();
  });
});

describe('text seeds', () => {
  it('maps text to a stable seed', () => {
    expect(seedFromString('cobalt-drift')).toBe(seedFromString('cobalt-drift'));
  });

  it('separates similar text', () => {
    expect(seedFromString('cobalt-drift')).not.toBe(seedFromString('cobalt-drifz'));
  });
});
