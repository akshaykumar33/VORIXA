import { describe, it, expect } from 'vitest';
import { RivalPack } from '../src/game/Rivals';

/**
 * Traffic fails in ways that are obvious to a player and invisible in code: rivals that visibly
 * rubber-band to the camera, drift off the track, stack on top of each other, or pop into
 * existence a few metres ahead.
 *
 * The pack is pure so all of it can be driven without a renderer.
 */

const DT = 1 / 60;

/** Runs the pack for a duration at a fixed player position. */
function run(pack: RivalPack, seconds: number, playerZ = 0): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) pack.update(DT, playerZ);
}

describe('determinism', () => {
  it('produces the same traffic for the same seed', () => {
    const a = new RivalPack(42);
    const b = new RivalPack(42);
    run(a, 3);
    run(b, 3);
    expect(JSON.stringify(a.all)).toBe(JSON.stringify(b.all));
  });

  it('produces different traffic for different seeds', () => {
    const a = new RivalPack(1);
    const b = new RivalPack(2);
    run(a, 3);
    run(b, 3);
    expect(JSON.stringify(a.all)).not.toBe(JSON.stringify(b.all));
  });
});

describe('placement', () => {
  it('spreads rivals along the corridor rather than stacking them', () => {
    // A wall of craft appearing together is the first thing the player would see otherwise.
    const pack = new RivalPack(7);
    pack.update(DT, 0);
    const zs = pack.all.map((p) => p.z);
    expect(new Set(zs.map((z) => Math.round(z))).size).toBeGreaterThan(1);
  });

  it('keeps every rival inside the lane', () => {
    const pack = new RivalPack(3, { laneHalfWidth: 3.4 });
    for (let i = 0; i < 4000; i++) {
      pack.update(DT, 0);
      for (const pose of pack.all) {
        // Drifting off the track is the single most obvious failure.
        expect(Math.abs(pose.x)).toBeLessThanOrEqual(3.4);
      }
    }
  });

  it('flies above the track surface', () => {
    const pack = new RivalPack(5);
    for (let i = 0; i < 2000; i++) {
      pack.update(DT, 0);
      for (const pose of pack.all) expect(pose.y).toBeGreaterThan(0.5);
    }
  });
});

describe('movement', () => {
  it('travels down the course', () => {
    const pack = new RivalPack(11);
    pack.update(DT, 0);
    const before = pack.all.map((p) => p.z);
    run(pack, 0.5);
    // Course runs toward -Z. At least one rival must have advanced without being recycled.
    const advanced = pack.all.some((p, i) => p.z < before[i]);
    expect(advanced).toBe(true);
  });

  it('gives rivals different speeds', () => {
    // Traffic moving in lockstep reads as a single rigid object.
    const pack = new RivalPack(13);
    pack.update(DT, 0);
    const start = pack.all.map((p) => p.z);
    run(pack, 1.5);
    const travelled = pack.all.map((p, i) => Math.abs(p.z - start[i]));
    expect(new Set(travelled.map((d) => Math.round(d))).size).toBeGreaterThan(1);
  });

  it('banks into its own weave', () => {
    const pack = new RivalPack(17);
    let sawRoll = false;
    for (let i = 0; i < 1200; i++) {
      pack.update(DT, 0);
      for (const pose of pack.all) {
        if (Math.abs(pose.roll) > 0.02) sawRoll = true;
        // Roll opposes yaw, so a craft turning right leans right rather than away from the turn.
        if (Math.abs(pose.yaw) > 0.01) expect(Math.sign(pose.roll)).toBe(-Math.sign(pose.yaw));
      }
    }
    expect(sawRoll).toBe(true);
  });

  it('keeps bank angles plausible', () => {
    const pack = new RivalPack(19);
    for (let i = 0; i < 2000; i++) {
      pack.update(DT, 0);
      // A craft rolled past ~50 degrees reads as out of control, not as cornering.
      for (const pose of pack.all) expect(Math.abs(pose.roll)).toBeLessThan(0.9);
    }
  });
});

describe('recycling', () => {
  it('recycles a rival the player has outrun', () => {
    const pack = new RivalPack(23, { behindDistance: 50 });
    // Player teleports far down the course; everything is now well behind them.
    pack.update(DT, -5000);
    for (const pose of pack.all) expect(pose.z).toBeLessThan(-5000 + 50);
  });

  it('recycles a rival that has run too far ahead', () => {
    const pack = new RivalPack(29, { aheadDistance: 200 });
    run(pack, 60, 0);
    // Without forward recycling they stream into empty space forever.
    for (const pose of pack.all) expect(pose.z).toBeGreaterThan(-200 - 1);
  });

  it('fades a recycled rival in rather than popping it', () => {
    /*
     * Ahead distance is roomy but not absurd. It has to be large enough that a fast rival cannot
     * outrun the corridor during the window — that would legitimately reset its own fade and say
     * nothing about whether fading works — but it also sets the *initial* spread, so an enormous
     * value scatters rivals so far out that they are neither behind nor ahead of the teleported
     * player and never recycle at all.
     */
    const pack = new RivalPack(31, { behindDistance: 40, aheadDistance: 1200 });
    run(pack, 2, 0);

    // Player teleports far down the course, leaving every rival behind.
    pack.update(DT, -5000);
    for (const pose of pack.all) expect(pose.opacity).toBeLessThan(0.2);

    run(pack, 2, -5000);
    for (const pose of pack.all) expect(pose.opacity).toBe(1);
  });

  it('does not pin a rival at the recycle boundary', () => {
    /*
     * The bug this caught: recycling to exactly `playerZ - aheadDistance` means the next frame
     * moves the rival past that boundary and recycles it again, every frame. It never ages, never
     * fades in and never visibly moves — it just sits at the far edge, permanently invisible.
     */
    const pack = new RivalPack(43, { aheadDistance: 200 });
    pack.update(DT, -9000);
    const justRecycled = pack.all.map((p) => p.z);

    run(pack, 1, -9000);
    for (let i = 0; i < justRecycled.length; i++) {
      expect(pack.all[i].z).toBeLessThan(justRecycled[i]);
      expect(pack.all[i].opacity).toBeGreaterThan(0);
    }
  });

  it('does not rubber-band toward the player', () => {
    /*
     * The failure this guards against: traffic that quietly matches the player's pace. It makes
     * a course feel fake immediately, and it is tempting to add because it keeps rivals on screen.
     *
     * A stationary player must watch rivals leave, not have them wait around.
     */
    const pack = new RivalPack(37, { aheadDistance: 1e6, behindDistance: 1e6 });
    pack.update(DT, 0);
    const start = pack.all.map((p) => p.z);
    run(pack, 4, 0);
    for (let i = 0; i < start.length; i++) {
      expect(pack.all[i].z).toBeLessThan(start[i] - 30);
    }
  });
});

describe('allocation', () => {
  it('returns the same pose objects every frame', () => {
    // This runs every frame; allocating a pose array per call is exactly the garbage the engine
    // rules forbid in the loop.
    const pack = new RivalPack(41);
    const first = pack.update(DT, 0);
    const second = pack.update(DT, 0);
    expect(second).toBe(first);
    expect(second[0]).toBe(first[0]);
  });
});
