import { streamFor } from '../world/Rng';

/**
 * Rival craft flying the course alongside the player.
 *
 * The world has architecture, weather and a horizon, and nothing alive in it. A course with no
 * other traffic reads as a time trial on a closed track — which is what it is, but a *lonely* one.
 * Something else moving through the same space is the cheapest presence a racing game can buy.
 *
 * ## These are pace-setters, not physics agents
 *
 * Rivals fly an analytic path rather than running through `PlayerController`. That is a deliberate
 * limit, not a shortcut waiting to be upgraded:
 *
 *   - A physics rival needs an AI that can clear procedurally generated gaps it has never seen.
 *     When it fails — and it will, on some seed, for some player — the rival falls into the void
 *     and the world looks broken.
 *   - Rivals are seen from behind, at distance, at speed. Their contribution is *motion through
 *     the space*, and an analytic path delivers that exactly.
 *   - It costs no collision queries, so a dozen rivals are free.
 *
 * The honest description is "traffic", and the moment a rival needs to interact with geometry this
 * approach should be replaced rather than patched.
 *
 * Pure and deterministic: seed and elapsed time in, poses out. No renderer, no clock, no course
 * lookup — so the behaviour is testable, and two players on the same seed see the same traffic.
 */

export interface RivalPose {
  x: number;
  y: number;
  z: number;
  /** Heading, radians. Derived from lateral velocity so a rival faces where it is going. */
  yaw: number;
  /** Bank angle, radians. Rivals lean into their own weave. */
  roll: number;
  /** 0–1, fades a rival in as it enters range rather than popping it into existence. */
  opacity: number;
}

export interface RivalOptions {
  count?: number;
  /** How far ahead of the player rivals are recycled to, in world units. */
  aheadDistance?: number;
  /** How far behind the player a rival may fall before being recycled. */
  behindDistance?: number;
  /** Half-width of the lane rivals weave within. Kept inside the narrowest generated track. */
  laneHalfWidth?: number;
}

const DEFAULTS = {
  count: 6,
  aheadDistance: 260,
  behindDistance: 70,
  laneHalfWidth: 3.4
} as const;

/** Rival cruise speeds, in world units per second, bracketing the player's own top pace. */
const SPEED_MIN = 14;
const SPEED_MAX = 26;
/** Height above the track surface. Rivals fly, so they are never underfoot. */
const CRUISE_HEIGHT = 2.6;

interface RivalState {
  z: number;
  speed: number;
  /** Lateral weave, as amplitude and angular frequency with a per-rival phase offset. */
  weaveAmplitude: number;
  weaveRate: number;
  weavePhase: number;
  bobAmplitude: number;
  bobRate: number;
  heightOffset: number;
  /**
   * Where inside the ahead boundary this rival is placed on recycle, as a fraction of it.
   *
   * Strictly less than 1, and this matters: recycling to exactly the boundary means the very next
   * frame moves the rival past it and recycles again, every frame, forever. The rival never ages,
   * never fades in and never visibly moves — it simply sits pinned at the far edge.
   *
   * Varying it per rival also stops recycled traffic from reappearing in a neat row.
   */
  recycleFraction: number;
  /** Seconds since this rival was recycled, used to fade it in. */
  age: number;
}

const FADE_IN_SECONDS = 1.1;

export class RivalPack {
  private readonly states: RivalState[] = [];
  private readonly poses: RivalPose[] = [];
  private readonly aheadDistance: number;
  private readonly behindDistance: number;
  private readonly laneHalfWidth: number;
  private elapsed = 0;

  public constructor(seed: number, options: RivalOptions = {}) {
    const count = options.count ?? DEFAULTS.count;
    this.aheadDistance = options.aheadDistance ?? DEFAULTS.aheadDistance;
    this.behindDistance = options.behindDistance ?? DEFAULTS.behindDistance;
    this.laneHalfWidth = options.laneHalfWidth ?? DEFAULTS.laneHalfWidth;

    for (let i = 0; i < count; i++) {
      // A stream per rival, so adding one never changes the behaviour of the others.
      const rng = streamFor(seed, 9000 + i);
      this.states.push({
        // Spread along the corridor at birth rather than stacked at one Z, or the first thing the
        // player sees is a wall of craft appearing together.
        z: -rng.range(20, this.aheadDistance),
        speed: rng.range(SPEED_MIN, SPEED_MAX),
        weaveAmplitude: rng.range(0.35, 1) * this.laneHalfWidth,
        weaveRate: rng.range(0.18, 0.5),
        weavePhase: rng.range(0, Math.PI * 2),
        bobAmplitude: rng.range(0.15, 0.6),
        bobRate: rng.range(0.3, 0.8),
        heightOffset: rng.range(-0.5, 2.4),
        recycleFraction: rng.range(0.7, 0.95),
        age: FADE_IN_SECONDS
      });
      this.poses.push({ x: 0, y: 0, z: 0, yaw: 0, roll: 0, opacity: 0 });
    }
  }

  public get all(): readonly RivalPose[] {
    return this.poses;
  }

  /**
   * Advances every rival.
   *
   * @param dt       Seconds elapsed. Dilated time is passed deliberately — rivals slow down with
   *                 the world, because traffic that keeps full pace during a dilation would make
   *                 the ability feel like a handicap rather than an advantage.
   * @param playerZ  Used for recycling only, never to chase the player. Rubber-banding traffic to
   *                 the player's position is immediately obvious and makes the world feel fake.
   * @returns The pack's own pose array, mutated in place — this runs every frame and must not
   *          allocate.
   */
  public update(dt: number, playerZ: number): readonly RivalPose[] {
    this.elapsed += dt;

    for (let i = 0; i < this.states.length; i++) {
      const state = this.states[i];
      const pose = this.poses[i];

      state.z -= state.speed * dt;
      state.age += dt;

      // Recycle in both directions: a rival the player has outrun is as useless as one they have
      // left behind, and both would otherwise stream forever into empty space.
      const behind = state.z > playerZ + this.behindDistance;
      const ahead = state.z < playerZ - this.aheadDistance;
      if (behind || ahead) {
        state.z = playerZ - this.aheadDistance * state.recycleFraction;
        state.age = 0;
      }

      const wave = this.elapsed * state.weaveRate + state.weavePhase;
      const x = Math.sin(wave) * state.weaveAmplitude;
      // Lateral velocity, analytically. Differentiating the weave rather than comparing frames
      // means the heading is exact and never jitters at low frame rates.
      const lateralVelocity = Math.cos(wave) * state.weaveAmplitude * state.weaveRate;

      pose.x = x;
      pose.y = CRUISE_HEIGHT + state.heightOffset + Math.sin(this.elapsed * state.bobRate) * state.bobAmplitude;
      pose.z = state.z;
      // Craft travel toward -Z, so a rival drifting right turns slightly away from straight ahead.
      pose.yaw = Math.atan2(lateralVelocity, state.speed);
      pose.roll = -pose.yaw * 2.6;
      pose.opacity = Math.min(state.age / FADE_IN_SECONDS, 1);
    }

    return this.poses;
  }
}
