import { describe, it, expect } from 'vitest';
import { ParticlePool } from '../src/rendering/ParticlePool';

/**
 * Particle bugs are rarely crashes. They are effects that silently never fire at busy moments,
 * bursts that pop rather than puff, or dust that behaves differently at 60 Hz and 144 Hz — all
 * invisible to a typecheck and all felt immediately in play.
 */

describe('bursts', () => {
  it('spawns live particles at the burst origin', () => {
    const pool = new ParticlePool(128);
    pool.burst('land', 3, 1, -7);
    expect(pool.alive).toBeGreaterThan(0);
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.life[i] <= 0) continue;
      expect(pool.x[i]).toBe(3);
      expect(pool.y[i]).toBe(1);
      expect(pool.z[i]).toBe(-7);
    }
  });

  it('scales with intensity', () => {
    const soft = new ParticlePool(256);
    soft.burst('land', 0, 0, 0, { intensity: 0.2 });
    const hard = new ParticlePool(256);
    hard.burst('land', 0, 0, 0, { intensity: 2 });
    // A soft landing makes a soft puff, a hard one a real cloud.
    expect(hard.alive).toBeGreaterThan(soft.alive);
  });

  it('throws directed bursts along their direction', () => {
    const pool = new ParticlePool(256, 7);
    pool.burst('boost', 0, 0, 0, { dirX: 0, dirZ: 1 });
    let sumZ = 0;
    for (let i = 0; i < pool.capacity; i++) if (pool.life[i] > 0) sumZ += pool.vz[i];
    expect(sumZ).toBeGreaterThan(0);
  });

  it('never allocates past capacity and keeps the newest burst', () => {
    // A full pool must replace the oldest, not refuse the burst the player just caused.
    const pool = new ParticlePool(20);
    pool.burst('checkpoint', 0, 0, 0);
    pool.burst('hazard', 99, 99, 99);
    expect(pool.alive).toBeLessThanOrEqual(20);
    let newest = 0;
    for (let i = 0; i < pool.capacity; i++) if (pool.life[i] > 0 && pool.x[i] === 99) newest++;
    expect(newest).toBeGreaterThan(0);
  });
});

describe('simulation', () => {
  it('particles die out', () => {
    const pool = new ParticlePool(64);
    pool.burst('jump', 0, 0, 0);
    for (let i = 0; i < 200; i++) pool.update(1 / 60);
    expect(pool.alive).toBe(0);
  });

  it('gravity pulls falling particles down', () => {
    const pool = new ParticlePool(64, 3);
    pool.burst('hazard', 0, 10, 0);
    for (let i = 0; i < 12; i++) pool.update(1 / 60);
    let below = 0;
    for (let i = 0; i < pool.capacity; i++) if (pool.life[i] > 0 && pool.vy[i] < 0) below++;
    expect(below).toBeGreaterThan(0);
  });

  it('behaves the same at different frame rates', () => {
    const at60 = new ParticlePool(8, 5);
    const at144 = new ParticlePool(8, 5);
    at60.burst('dash', 0, 0, 0);
    at144.burst('dash', 0, 0, 0);
    for (let i = 0; i < 12; i++) at60.update(1 / 60);
    for (let i = 0; i < 29; i++) at144.update(1 / 144);
    // Same wall-clock time (0.2 s), same place, within integration error.
    for (let i = 0; i < 8; i++) {
      if (at60.life[i] <= 0 || at144.life[i] <= 0) continue;
      expect(at144.x[i]).toBeCloseTo(at60.x[i], 0);
      expect(at144.z[i]).toBeCloseTo(at60.z[i], 0);
    }
  });
});

describe('display size', () => {
  it('eases in from nothing rather than popping', () => {
    const pool = new ParticlePool(8, 2);
    pool.burst('land', 0, 0, 0);
    expect(pool.displaySize(0)).toBeLessThan(pool.size[0] * 0.2);
  });

  it('is zero for dead slots', () => {
    expect(new ParticlePool(4).displaySize(0)).toBe(0);
  });

  it('shrinks away near end of life', () => {
    const pool = new ParticlePool(8, 2);
    pool.burst('land', 0, 0, 0);
    pool.life[0] = pool.maxLife[0] * 0.05;
    expect(pool.displaySize(0)).toBeLessThan(pool.size[0] * 0.2);
  });
});
