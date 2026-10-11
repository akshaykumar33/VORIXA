import { describe, it, expect } from 'vitest';
import { CourseStream, segmentIndexFor } from '../src/world/CourseStream';
import { SEGMENT_LENGTH } from '../src/world/SegmentGenerator';

/**
 * The streamer is where an infinite world either stays bounded or quietly leaks.
 *
 * Its failure modes are all slow and invisible: a window that grows by one segment per minute
 * looks perfect for the first five, and a flat box array that is replaced rather than mutated
 * leaves collision reading a world the player left ten seconds ago. Neither shows up in a
 * screenshot.
 */

const AT = (index: number) => -index * SEGMENT_LENGTH - 5;

describe('indexing', () => {
  it('maps world Z to the segment containing it', () => {
    expect(segmentIndexFor(0)).toBe(0);
    expect(segmentIndexFor(-1)).toBe(0);
    expect(segmentIndexFor(-SEGMENT_LENGTH)).toBe(1);
    expect(segmentIndexFor(-SEGMENT_LENGTH * 3 - 1)).toBe(3);
  });

  it('clamps behind the start rather than going negative', () => {
    // Being knocked back past the origin must not ask for segment -1.
    expect(segmentIndexFor(10)).toBe(0);
  });
});

describe('windowing', () => {
  it('populates on the first update', () => {
    const stream = new CourseStream(1);
    expect(stream.update(0)).toBe(true);
    expect(stream.live.length).toBeGreaterThan(0);
    expect(stream.boxes.length).toBeGreaterThan(0);
  });

  it('keeps the window a fixed size however far the player runs', () => {
    // The property the whole design exists for.
    //
    // Measured in steady state rather than against the first update: near the start the window is
    // clamped at zero and is legitimately smaller, so comparing to it would assert the clamp is
    // broken rather than that the window is bounded.
    const stream = new CourseStream(1, { ahead: 4, behind: 2 });

    stream.update(AT(20));
    const steady = stream.live.length;
    expect(steady).toBe(7);

    for (let index = 21; index < 400; index++) stream.update(AT(index));

    expect(stream.live.length).toBe(steady);
  });

  it('clamps the window near the start without growing later', () => {
    const stream = new CourseStream(1, { ahead: 4, behind: 2 });
    stream.update(0);
    // behind is clamped away at the origin: indices 0..4 only.
    expect(stream.live.length).toBe(5);
    stream.update(AT(30));
    expect(stream.live.length).toBe(7);
  });

  it('does no work when the player has not changed segment', () => {
    const stream = new CourseStream(1);
    stream.update(0);
    // Called every tick; must be a cheap no-op on the overwhelming majority of them.
    expect(stream.update(-1)).toBe(false);
    expect(stream.update(-5)).toBe(false);
    expect(stream.added.length).toBe(0);
  });

  it('reports what entered and left', () => {
    const stream = new CourseStream(1, { ahead: 2, behind: 1 });
    stream.update(0);
    stream.update(AT(3));
    expect(stream.added.length).toBeGreaterThan(0);
    expect(stream.removed.length).toBeGreaterThan(0);
    // Nothing may appear in both lists in one update.
    const addedIds = new Set(stream.added.map((s) => s.index));
    for (const segment of stream.removed) expect(addedIds.has(segment.index)).toBe(false);
  });

  it('retains segments behind the player', () => {
    // Respawning at the last checkpoint must land on geometry that still exists.
    const stream = new CourseStream(1, { ahead: 3, behind: 2 });
    stream.update(AT(10));
    const indices = stream.live.map((s) => s.index);
    expect(indices).toContain(9);
    expect(indices).toContain(8);
  });

  it('never generates a segment before the start', () => {
    const stream = new CourseStream(1, { ahead: 3, behind: 4 });
    stream.update(0);
    for (const segment of stream.live) expect(segment.index).toBeGreaterThanOrEqual(0);
  });
});

describe('collision view', () => {
  it('mutates the box array in place rather than replacing it', () => {
    // Collision holds this by reference. Replacing the array would leave it reading a stale world
    // with no error anywhere — the player falls through geometry that is visibly on screen.
    const stream = new CourseStream(1);
    stream.update(0);
    const held = stream.boxes;

    stream.update(AT(6));
    expect(stream.boxes).toBe(held);
    expect(held.length).toBeGreaterThan(0);
  });

  it('contains only boxes from resident segments', () => {
    const stream = new CourseStream(1, { ahead: 2, behind: 1 });
    stream.update(AT(20));

    const liveMin = Math.min(...stream.live.map((s) => s.minZ));
    const liveMax = Math.max(...stream.live.map((s) => s.maxZ));
    for (const box of stream.boxes) {
      expect(box.maxZ).toBeLessThanOrEqual(liveMax + 0.001);
      expect(box.minZ).toBeGreaterThanOrEqual(liveMin - 0.001);
    }
  });

  it('exposes one checkpoint per resident segment', () => {
    const stream = new CourseStream(1, { ahead: 3, behind: 1 });
    stream.update(AT(12));
    expect(stream.checkpoints.length).toBe(stream.live.length);
  });
});

describe('determinism', () => {
  it('regenerates identical geometry after backtracking', () => {
    const stream = new CourseStream(77, { ahead: 1, behind: 0 });
    stream.update(AT(5));
    const before = JSON.stringify(stream.live.find((s) => s.index === 5)?.boxes);

    // Run far enough that segment 5 is evicted, then come back.
    stream.update(AT(40));
    expect(stream.live.some((s) => s.index === 5)).toBe(false);
    stream.update(AT(5));

    expect(JSON.stringify(stream.live.find((s) => s.index === 5)?.boxes)).toBe(before);
  });

  it('produces different worlds for different seeds', () => {
    const a = new CourseStream(1);
    const b = new CourseStream(2);
    a.update(AT(3));
    b.update(AT(3));
    expect(JSON.stringify(a.boxes)).not.toBe(JSON.stringify(b.boxes));
  });
});

describe('respawn', () => {
  it('returns the last checkpoint the player passed', () => {
    const stream = new CourseStream(1);
    stream.update(AT(8));
    const respawn = stream.respawnFor(AT(8));
    expect(respawn).not.toBeNull();
    // Behind the player, not ahead of them.
    expect(respawn!.triggerZ).toBeGreaterThanOrEqual(AT(8));
  });

  it('always returns somewhere to respawn', () => {
    // "Nowhere to respawn" is not a state a run can recover from.
    const stream = new CourseStream(1);
    stream.update(0);
    expect(stream.respawnFor(-1e6)).not.toBeNull();
    expect(stream.respawnFor(1e6)).not.toBeNull();
  });
});

describe('teardown', () => {
  it('drops everything and reports it', () => {
    const stream = new CourseStream(1);
    stream.update(AT(4));
    const resident = stream.live.length;

    stream.clear();
    expect(stream.live.length).toBe(0);
    expect(stream.boxes.length).toBe(0);
    // The renderer needs the eviction list to dispose the meshes it built.
    expect(stream.removed.length).toBe(resident);
  });

  it('repopulates after clearing', () => {
    const stream = new CourseStream(1);
    stream.update(AT(4));
    stream.clear();
    expect(stream.update(AT(4))).toBe(true);
    expect(stream.live.length).toBeGreaterThan(0);
  });
});
