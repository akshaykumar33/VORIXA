/**
 * Particle simulation, with no rendering attached.
 *
 * Every award-winning browser game answers the player's actions with something visible: dust when
 * you land, a puff when you jump, a streak when you boost. Without it, movement is just a camera
 * translating — correct and lifeless. This is the substance of that response.
 *
 * ## Structure-of-arrays, fixed capacity
 *
 * Particles live in parallel `Float32Array`s rather than as objects. Spawning never allocates,
 * dying never frees, and the per-frame update is a tight loop over contiguous memory — the only
 * shape that is safe to run in the frame loop under the engine's no-allocation rule.
 *
 * When the pool is full, a new particle **replaces the oldest** rather than being dropped. A burst
 * the player just caused is always more important than the tail of one from a second ago; refusing
 * the new one would make the effect silently fail at exactly the busiest moments.
 *
 * Pure: bursts in, positions out. The renderer only reads the arrays.
 */

export type BurstKind =
  | 'land'
  | 'jump'
  | 'boost'
  | 'dash'
  | 'checkpoint'
  | 'hazard'
  | 'wallkick'
  | 'explode'
  | 'smoke'
  | 'coin'
  | 'smash'
  | 'muzzle';

interface BurstSpec {
  count: number;
  /** Launch speed range. */
  speedMin: number;
  speedMax: number;
  /** 0 = a flat ring along the ground, 1 = a full sphere. */
  spread: number;
  /** Upward bias added to the launch velocity. */
  lift: number;
  lifeMin: number;
  lifeMax: number;
  sizeMin: number;
  sizeMax: number;
  gravity: number;
  /** Velocity kept per second. Low values stop quickly, like dust; high values carry, like sparks. */
  drag: number;
  /** Packed RGB colours; each particle picks one. */
  colors: readonly number[];
}

/**
 * The vocabulary. Each burst is tuned for what it has to communicate:
 *
 *   - land:       a low ring of dust whose size carries the impact.
 *   - jump:       a small puff under the feet — confirmation, not spectacle.
 *   - boost:      lime streaks thrown backwards, the reward colour.
 *   - dash:       a quick blue spray along the direction of travel.
 *   - checkpoint: a burst of confetti. Progress should feel like an event.
 *   - hazard:     hot red sparks, fast and short. Danger reads as sharp.
 *   - wallkick:   dust off the wall, sideways.
 */
const SPECS: Record<BurstKind, BurstSpec> = {
  land: {
    count: 18, speedMin: 2.5, speedMax: 6, spread: 0.12, lift: 0.8,
    lifeMin: 0.35, lifeMax: 0.7, sizeMin: 0.14, sizeMax: 0.32,
    gravity: 4, drag: 0.02, colors: [0xefe6d2, 0xdcd1b8, 0xc9bda2]
  },
  jump: {
    count: 8, speedMin: 1.2, speedMax: 3, spread: 0.15, lift: 0.4,
    lifeMin: 0.25, lifeMax: 0.45, sizeMin: 0.1, sizeMax: 0.22,
    gravity: 2, drag: 0.03, colors: [0xefe6d2, 0xffffff]
  },
  boost: {
    count: 26, speedMin: 6, speedMax: 12, spread: 0.35, lift: 1.5,
    lifeMin: 0.3, lifeMax: 0.6, sizeMin: 0.08, sizeMax: 0.18,
    gravity: 0, drag: 0.08, colors: [0xb8f23c, 0xe3ff8a, 0xffffff]
  },
  dash: {
    count: 14, speedMin: 5, speedMax: 9, spread: 0.3, lift: 0.5,
    lifeMin: 0.2, lifeMax: 0.4, sizeMin: 0.08, sizeMax: 0.16,
    gravity: 0, drag: 0.05, colors: [0x2f7fe0, 0x8fc2ff, 0xffffff]
  },
  checkpoint: {
    count: 44, speedMin: 4, speedMax: 10, spread: 1, lift: 6,
    lifeMin: 0.9, lifeMax: 1.6, sizeMin: 0.1, sizeMax: 0.2,
    gravity: 9, drag: 0.35, colors: [0xb8f23c, 0xffa62b, 0x3cc0ad, 0xffffff, 0xff5a6a]
  },
  hazard: {
    count: 22, speedMin: 7, speedMax: 14, spread: 1, lift: 2,
    lifeMin: 0.15, lifeMax: 0.35, sizeMin: 0.06, sizeMax: 0.12,
    gravity: 12, drag: 0.1, colors: [0xff4a5c, 0xffa62b, 0xfff0c0]
  },
  wallkick: {
    count: 12, speedMin: 2.5, speedMax: 5, spread: 0.5, lift: 1,
    lifeMin: 0.3, lifeMax: 0.55, sizeMin: 0.1, sizeMax: 0.2,
    gravity: 3, drag: 0.03, colors: [0x3cc0ad, 0xefe6d2]
  },
  // Rush. A cartoon explosion is big, round and bright, and it is over quickly.
  explode: {
    count: 40, speedMin: 5, speedMax: 13, spread: 1, lift: 3,
    lifeMin: 0.35, lifeMax: 0.8, sizeMin: 0.25, sizeMax: 0.6,
    gravity: 6, drag: 0.08, colors: [0xffd23f, 0xffa62b, 0xff5a36, 0xfff3b0]
  },
  smoke: {
    count: 10, speedMin: 0.6, speedMax: 2, spread: 1, lift: 1.4,
    lifeMin: 0.6, lifeMax: 1.1, sizeMin: 0.35, sizeMax: 0.7,
    gravity: -1, drag: 0.2, colors: [0xe8e4f0, 0xc9c3d9, 0xffffff]
  },
  coin: {
    count: 10, speedMin: 2, speedMax: 5, spread: 1, lift: 2.5,
    lifeMin: 0.25, lifeMax: 0.5, sizeMin: 0.08, sizeMax: 0.16,
    gravity: 5, drag: 0.05, colors: [0xffd23f, 0xfff3b0, 0xffffff]
  },
  smash: {
    count: 22, speedMin: 4, speedMax: 9, spread: 0.8, lift: 4,
    lifeMin: 0.45, lifeMax: 0.8, sizeMin: 0.14, sizeMax: 0.3,
    gravity: 16, drag: 0.3, colors: [0xd98f4e, 0xc47a3c, 0x8f5226, 0xf2c38b]
  },
  muzzle: {
    count: 5, speedMin: 3, speedMax: 6, spread: 0.4, lift: 0,
    lifeMin: 0.06, lifeMax: 0.12, sizeMin: 0.1, sizeMax: 0.18,
    gravity: 0, drag: 0.01, colors: [0xfff3b0, 0xffd23f]
  }
};

export interface BurstOptions {
  /** Scales count and speed, 0–2. A soft landing makes a soft puff. */
  intensity?: number;
  /**
   * Horizontal direction the effect is thrown along (unit-ish), e.g. opposite to travel for a
   * boost trail. Omitted for radial bursts.
   */
  dirX?: number;
  dirZ?: number;
}

export class ParticlePool {
  public readonly capacity: number;

  public readonly x: Float32Array;
  public readonly y: Float32Array;
  public readonly z: Float32Array;
  public readonly vx: Float32Array;
  public readonly vy: Float32Array;
  public readonly vz: Float32Array;
  /** Remaining life in seconds; zero or below means the slot is free. */
  public readonly life: Float32Array;
  public readonly maxLife: Float32Array;
  public readonly size: Float32Array;
  public readonly gravity: Float32Array;
  public readonly drag: Float32Array;
  public readonly color: Uint32Array;

  /** Next slot to write, cycling — which is what makes "replace the oldest" free. */
  private cursor = 0;
  private seed: number;

  public constructor(capacity = 512, seed = 1) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.color = new Uint32Array(capacity);
    this.seed = seed >>> 0 || 1;
  }

  /** xorshift32. Inline and allocation-free; visual variety does not need a better generator. */
  private random(): number {
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  private range(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  public burst(kind: BurstKind, px: number, py: number, pz: number, options: BurstOptions = {}): void {
    const spec = SPECS[kind];
    const intensity = Math.max(0, Math.min(options.intensity ?? 1, 2));
    const count = Math.round(spec.count * (0.4 + intensity * 0.6));
    const hasDir = options.dirX !== undefined || options.dirZ !== undefined;

    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;

      // Direction: a random point on a sphere, flattened toward the ground plane by `spread`.
      const theta = this.random() * Math.PI * 2;
      const up = (this.random() * 2 - 1) * spec.spread;
      const flat = Math.sqrt(Math.max(0, 1 - up * up));
      let dx = Math.cos(theta) * flat;
      let dz = Math.sin(theta) * flat;

      if (hasDir) {
        // Directed bursts lean hard along the given direction, keeping a little scatter.
        dx = dx * 0.35 + (options.dirX ?? 0);
        dz = dz * 0.35 + (options.dirZ ?? 0);
      }

      const speed = this.range(spec.speedMin, spec.speedMax) * (0.6 + intensity * 0.4);
      this.x[i] = px;
      this.y[i] = py;
      this.z[i] = pz;
      this.vx[i] = dx * speed;
      this.vy[i] = up * speed + spec.lift;
      this.vz[i] = dz * speed;
      const life = this.range(spec.lifeMin, spec.lifeMax);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = this.range(spec.sizeMin, spec.sizeMax);
      this.gravity[i] = spec.gravity;
      this.drag[i] = spec.drag;
      this.color[i] = spec.colors[Math.floor(this.random() * spec.colors.length)];
    }
  }

  public update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;

      // Frame-rate independent drag: keep `drag` of the velocity per second.
      const keep = Math.pow(this.drag[i], dt);
      this.vx[i] *= keep;
      this.vy[i] = this.vy[i] * keep - this.gravity[i] * dt;
      this.vz[i] *= keep;

      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
    }
  }

  /**
   * Visible size of a particle right now: grows in quickly, then shrinks away.
   *
   * Popping in at full size and vanishing at full size are both visible as flicker; easing both
   * ends is what makes a burst read as a puff rather than a spawn.
   */
  public displaySize(i: number): number {
    if (this.life[i] <= 0) return 0;
    const t = 1 - this.life[i] / this.maxLife[i];
    const grow = Math.min(t / 0.15, 1);
    const shrink = 1 - t * t;
    return this.size[i] * grow * shrink;
  }

  /**
   * Moves every particle by the same offset. Rush keeps the car at the origin and scrolls the
   * world past it; particles belong to the world, so they scroll with it.
   */
  public shift(dx: number, dy: number, dz: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.x[i] += dx;
      this.y[i] += dy;
      this.z[i] += dz;
    }
  }

  public get alive(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.life[i] > 0) n++;
    return n;
  }

  public clear(): void {
    this.life.fill(0);
  }
}
