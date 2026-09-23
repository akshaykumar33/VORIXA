import { describe, it, expect } from 'vitest';
import { ResolutionScaler } from '../src/rendering/ResolutionScaler';

/**
 * A resolution controller fails in ways that are hard to see and easy to ship: it oscillates, or
 * it latches to minimum after one hitch and never recovers, or it reacts to a tab regaining focus
 * as though the GPU had collapsed. None of those look like a bug in a screenshot — the image is
 * simply, inexplicably, soft.
 *
 * The policy is pure precisely so it can be driven with synthetic frame times instead.
 */

const OPTS = { targetMs: 16.67, windowSize: 10, cooldownFrames: 5 };

/** Feeds n frames at a fixed cost, returning every scale change observed. */
function feed(scaler: ResolutionScaler, frameMs: number, frames: number): number[] {
  const changes: number[] = [];
  for (let i = 0; i < frames; i++) {
    const next = scaler.sample(frameMs);
    if (next !== null) changes.push(next);
  }
  return changes;
}

describe('startup', () => {
  it('starts at full resolution', () => {
    expect(new ResolutionScaler(OPTS).scale).toBe(1);
  });

  it('decides nothing until it has a full window', () => {
    // Acting on a partial window means reacting to startup itself, while shaders are compiling.
    const scaler = new ResolutionScaler(OPTS);
    for (let i = 0; i < OPTS.windowSize - 1; i++) {
      expect(scaler.sample(60)).toBeNull();
    }
    expect(scaler.scale).toBe(1);
  });
});

describe('scaling down', () => {
  it('drops resolution when frames go over budget', () => {
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 30, 40);
    expect(scaler.scale).toBeLessThan(1);
  });

  it('keeps dropping while load persists', () => {
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 40, 30);
    const first = scaler.scale;
    feed(scaler, 40, 60);
    expect(scaler.scale).toBeLessThan(first);
  });

  it('never goes below the floor', () => {
    // Past a point the image is soft enough to be its own problem; dropping further buys nothing.
    const scaler = new ResolutionScaler({ ...OPTS, minScale: 0.6 });
    feed(scaler, 200, 600);
    expect(scaler.scale).toBe(0.6);
  });

  it('reacts to the tail, not the average', () => {
    // A steady 9 ms with a 40 ms hitch every tenth frame averages inside budget and feels awful.
    const scaler = new ResolutionScaler(OPTS);
    for (let i = 0; i < 200; i++) scaler.sample(i % 10 === 0 ? 40 : 9);
    expect(scaler.scale).toBeLessThan(1);
  });
});

describe('scaling up', () => {
  it('recovers when the load goes away', () => {
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 40, 60);
    const dropped = scaler.scale;
    expect(dropped).toBeLessThan(1);

    feed(scaler, 5, 400);
    expect(scaler.scale).toBeGreaterThan(dropped);
  });

  it('returns all the way to full given enough headroom', () => {
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 40, 60);
    feed(scaler, 4, 1200);
    expect(scaler.scale).toBe(1);
  });

  it('never exceeds full resolution', () => {
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 1, 600);
    expect(scaler.scale).toBe(1);
  });

  it('climbs more cautiously than it falls', () => {
    // Symmetric steps oscillate: raise, blow the budget, lower, come in under, raise again.
    const down = new ResolutionScaler(OPTS);
    feed(down, 40, 30);
    const dropAmount = 1 - down.scale;

    const up = new ResolutionScaler(OPTS);
    feed(up, 40, 60);
    const before = up.scale;
    feed(up, 4, 30);
    const riseAmount = up.scale - before;

    expect(riseAmount).toBeLessThan(dropAmount);
  });
});

describe('stability', () => {
  it('does not oscillate at a comfortable frame time', () => {
    // Just inside budget: the controller should sit still rather than hunt.
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 15, 200);
    const changes = feed(scaler, 15, 400);
    expect(changes.length).toBe(0);
    expect(scaler.scale).toBe(1);
  });

  it('waits out a cooldown between changes', () => {
    const scaler = new ResolutionScaler({ ...OPTS, cooldownFrames: 30 });
    // Exactly one window, so the first change lands on the last of these frames and the cooldown
    // begins untouched. Feeding more here would burn part of it and the next batch would be
    // measuring a partly-elapsed timer rather than a fresh one.
    const first = feed(scaler, 50, OPTS.windowSize);
    expect(first.length).toBe(1);

    const changes = feed(scaler, 50, 29);
    // Resizing a WebGL target reallocates its buffers; doing that every frame is the cost this
    // whole mechanism exists to avoid.
    expect(changes.length).toBe(0);
  });

  it('reports a change only on the frame it happens', () => {
    const scaler = new ResolutionScaler(OPTS);
    const changes = feed(scaler, 40, 200);
    expect(changes.length).toBeGreaterThan(0);
    // Every reported value is a real change from the one before it.
    for (let i = 1; i < changes.length; i++) expect(changes[i]).not.toBe(changes[i - 1]);
  });
});

describe('bad input', () => {
  it('ignores a tab regaining focus', () => {
    // A backgrounded tab reports frame times in seconds. Treating that as GPU load would slam the
    // scale to minimum for something that was never a rendering cost.
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 5, 60);
    for (let i = 0; i < 40; i++) expect(scaler.sample(4000)).toBeNull();
    expect(scaler.scale).toBe(1);
  });

  it('ignores nonsense values', () => {
    const scaler = new ResolutionScaler(OPTS);
    expect(scaler.sample(Number.NaN)).toBeNull();
    expect(scaler.sample(Number.POSITIVE_INFINITY)).toBeNull();
    expect(scaler.sample(0)).toBeNull();
    expect(scaler.sample(-8)).toBeNull();
    expect(scaler.scale).toBe(1);
  });
});

describe('reset', () => {
  it('forgets history without changing the current scale', () => {
    const scaler = new ResolutionScaler(OPTS);
    feed(scaler, 40, 60);
    const held = scaler.scale;

    scaler.reset();
    expect(scaler.scale).toBe(held);
    // History is gone, so a fresh window is needed before anything changes again.
    expect(scaler.sample(4)).toBeNull();
  });
});
