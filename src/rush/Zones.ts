/**
 * The road is a tour: every `ZONE_LENGTH` metres it enters a new themed world.
 *
 * Pure schedule, no visuals. Every run opens in the meadow — the friendliest place to learn —
 * and then visits the others in an order drawn from the run's seed, never repeating a world back
 * to back. The renderer asks "which world is at this distance?" for every roadside slot, which is
 * what makes a boundary sweep toward the car rather than the whole world flicking over at once.
 */

export type BiomeId = 'meadow' | 'desert' | 'snow' | 'candy' | 'neon' | 'beach';

export const BIOMES: readonly BiomeId[] = ['meadow', 'desert', 'snow', 'candy', 'neon', 'beach'];

export const BIOME_NAMES: Record<BiomeId, string> = {
  meadow: 'Sunny Meadow',
  desert: 'Cactus Canyon',
  snow: 'Frosty Peaks',
  candy: 'Sugar Rush',
  neon: 'Neon Nights',
  beach: 'Coconut Coast'
};

export const ZONE_LENGTH = 750;

/** Integer hash, deterministic and allocation-free. */
function hash(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The world for zone `index` (0 is the first). Recursion depth equals the index; a cache keeps
 * that linear for a whole run rather than quadratic.
 */
export class ZoneSchedule {
  private readonly cache: BiomeId[] = ['meadow'];

  public constructor(private readonly seed: number) {}

  public biomeOf(index: number): BiomeId {
    if (index < 0) return 'meadow';
    while (this.cache.length <= index) {
      const i = this.cache.length;
      const previous = this.cache[i - 1];
      const choices = BIOMES.filter((b) => b !== previous);
      this.cache.push(choices[hash(this.seed, i) % choices.length]);
    }
    return this.cache[index];
  }

  /** The world at a distance along the road. */
  public biomeAt(distance: number): BiomeId {
    return this.biomeOf(Math.floor(distance / ZONE_LENGTH));
  }

  public zoneIndex(distance: number): number {
    return Math.floor(distance / ZONE_LENGTH);
  }

  /** Metres from `distance` to the start of the next zone. */
  public toNextZone(distance: number): number {
    return (Math.floor(distance / ZONE_LENGTH) + 1) * ZONE_LENGTH - distance;
  }
}
