/**
 * Deterministic random numbers for world generation.
 *
 * Two properties matter, and the second is the one that shapes the design:
 *
 *   1. **Reproducible.** The same seed must produce the same world on every machine, forever.
 *      Ghost replays, shared seeds and leaderboards are all meaningless otherwise — a run is only
 *      comparable to another run on identical geometry. `Math.random()` cannot do this.
 *
 *   2. **Positionally addressable.** Segment 500 must be generatable without first generating
 *      segments 0 through 499. A plain sequential generator makes every value depend on how many
 *      were drawn before it, which forces the world to be built in order and from the beginning —
 *      fatal for streaming, where the player may respawn anywhere and chunks load out of order.
 *
 * Property 2 is solved by hashing coordinates into a seed rather than advancing a shared stream.
 * `streamFor(index)` is a pure function of its inputs, so a segment generated on load and the same
 * segment regenerated an hour later after the player backtracked are byte-identical.
 *
 * Zero allocation per draw: the generator is a closure over one integer, which is what makes it
 * safe to use inside chunk generation without producing garbage.
 */

/**
 * Integer avalanche hash.
 *
 * Mixes every input bit into every output bit, so adjacent indices — which is exactly what world
 * generation asks for — produce completely unrelated seeds. A weaker mix leaves visible structure:
 * segments that rhyme with each other every few steps, which players read as repetition.
 */
export function hashInt(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

/** Combines a world seed with a coordinate into an independent sub-seed. */
export function hashCoord(seed: number, index: number): number {
  // The odd multiplier decorrelates the two inputs before mixing, so seed+1/index and
  // seed/index+1 do not collide onto the same value.
  return hashInt((seed | 0) ^ Math.imul(index | 0, 0x9e3779b9));
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  /** Uniformly picks one element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
}

/**
 * Creates a generator from a seed.
 *
 * mulberry32: 32 bits of state, passes the usual smoke tests for this purpose, and is a handful of
 * integer operations per draw. Cryptographic quality is irrelevant here — what matters is speed,
 * determinism, and no visible structure in the output.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  // A zero state is a fixed point for some generators in this family; nudging it off zero costs
  // nothing and removes a seed that would otherwise produce a constant stream.
  if (state === 0) state = 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    // Math.floor over a scaled float rather than a modulo, which would bias toward low values.
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Rng.pick received an empty list.');
      return items[Math.floor(next() * items.length)];
    }
  };
}

/**
 * A generator for one addressable slot in the world.
 *
 * This is the entry point world generation should use. Every call with the same `(seed, index)`
 * returns a generator producing the same sequence, regardless of what else has been generated.
 */
export function streamFor(seed: number, index: number): Rng {
  return createRng(hashCoord(seed, index));
}

/**
 * Derives a seed from arbitrary text, so seeds can be shared and typed by people.
 *
 * "cobalt-drift" is a far better thing to send someone than 2847193756.
 */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hashInt(hash);
}
