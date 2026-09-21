/**
 * The geometry of the vertical slice, built once on the CPU and shared by both backends.
 *
 * This lives outside the renderers on purpose. WebGPU and WebGL2 differ in how they *upload* and
 * *draw* buffers, but the scene itself must be byte-identical between them — a player who falls
 * back to WebGL2 should see the same world, not a different one. Keeping generation here makes
 * that structural rather than a promise, and makes the scene testable without a GPU.
 *
 * Layouts are chosen to be uploadable verbatim, with no per-frame repacking:
 *   - **Vertices**: interleaved `[px, py, pz, nx, ny, nz]`, 24 bytes per vertex.
 *   - **Instances**: interleaved `[tx, ty, tz, sx, sy, sz, r, g, b, emissive, grid]`, 44 bytes each.
 *
 * The unit cube spans x,z in [-0.5, 0.5] but y in **[0, 1]**, so an instance's translation is the
 * point where it meets the ground and its Y scale is simply its height. Pillars grow upward from
 * the floor instead of sinking half their height into it.
 */

/** Floats per vertex: position (3) + normal (3). */
export const VERTEX_FLOATS = 6;
/** Bytes per vertex. */
export const VERTEX_STRIDE = VERTEX_FLOATS * 4;

/**
 * Floats per instance: translation (3) + scale (3) + colour (3) + material (2).
 *
 * The material pair is `[emissive, grid]`. `grid` marks the surface that should receive the
 * world-space floor grid — the only thing in an untextured scene that tells the player they are
 * moving rather than the world sliding past.
 */
export const INSTANCE_FLOATS = 11;
/** Bytes per instance. */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

/** Ground plane height. Everything in the slice stands on y = 0. */
export const GROUND_Y = 0;

/**
 * Unit cube, four vertices per face so each face carries its own flat normal.
 * Shared vertices would average the normals into a sphere-like shading blob.
 */
export const CUBE_VERTICES = new Float32Array([
  // +X face
  0.5, 0, -0.5, 1, 0, 0,
  0.5, 1, -0.5, 1, 0, 0,
  0.5, 1, 0.5, 1, 0, 0,
  0.5, 0, 0.5, 1, 0, 0,
  // -X face
  -0.5, 0, 0.5, -1, 0, 0,
  -0.5, 1, 0.5, -1, 0, 0,
  -0.5, 1, -0.5, -1, 0, 0,
  -0.5, 0, -0.5, -1, 0, 0,
  // +Y face (top)
  -0.5, 1, 0.5, 0, 1, 0,
  0.5, 1, 0.5, 0, 1, 0,
  0.5, 1, -0.5, 0, 1, 0,
  -0.5, 1, -0.5, 0, 1, 0,
  // -Y face (bottom)
  -0.5, 0, -0.5, 0, -1, 0,
  0.5, 0, -0.5, 0, -1, 0,
  0.5, 0, 0.5, 0, -1, 0,
  -0.5, 0, 0.5, 0, -1, 0,
  // +Z face
  -0.5, 0, 0.5, 0, 0, 1,
  0.5, 0, 0.5, 0, 0, 1,
  0.5, 1, 0.5, 0, 0, 1,
  -0.5, 1, 0.5, 0, 0, 1,
  // -Z face
  0.5, 0, -0.5, 0, 0, -1,
  -0.5, 0, -0.5, 0, 0, -1,
  -0.5, 1, -0.5, 0, 0, -1,
  0.5, 1, -0.5, 0, 0, -1
]);

/** Counter-clockwise winding when viewed from outside, so back-face culling keeps the front. */
export const CUBE_INDICES = new Uint16Array([
  0, 1, 2, 0, 2, 3, // +X
  4, 5, 6, 4, 6, 7, // -X
  8, 9, 10, 8, 10, 11, // +Y
  12, 13, 14, 12, 14, 15, // -Y
  16, 17, 18, 16, 18, 19, // +Z
  20, 21, 22, 20, 22, 23 // -Z
]);

export const CUBE_VERTEX_COUNT = CUBE_VERTICES.length / VERTEX_FLOATS;
export const CUBE_INDEX_COUNT = CUBE_INDICES.length;

export interface SceneOptions {
  /** Seed for the deterministic generator. The same seed always yields the same world. */
  seed?: number;
  /** Half-extent of the pillar field in metres. */
  fieldRadius?: number;
  /** Spacing of the pillar lattice in metres. */
  spacing?: number;
  /** Radius around the spawn point kept clear so the player never starts inside geometry. */
  clearingRadius?: number;
}

export interface SceneData {
  /**
   * Interleaved instance attributes, ready to upload. Pinned to a plain `ArrayBuffer` rather than
   * `ArrayBufferLike`: GPU upload paths reject `SharedArrayBuffer`-backed views.
   */
  instances: Float32Array<ArrayBuffer>;
  instanceCount: number;
  /** Half-extent of the generated field, for fog and far-plane tuning. */
  extent: number;
}

/**
 * Deterministic PRNG (mulberry32). `Math.random` would make the world different on every reload
 * and make the generator impossible to assert on, so the seed is explicit and the sequence is
 * reproducible across machines and backends.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Art-direction palette (docs/design/ART_DIRECTION.md), as 0–1 float RGB.
 *
 * The slate token `#0a0c10` is a *background* value. Used directly as an albedo it disappears:
 * multiplied by any plausible lighting term it lands below the point where a display can separate
 * it from the void, and the scene reads as floating shapes with no floor. Surfaces therefore use a
 * lifted slate, tuned so the darkest lit face still sits clear of black while the overall mood
 * stays as dark as the direction asks.
 */
const SLATE: readonly [number, number, number] = [0.085, 0.10, 0.132];
const ACCENTS: readonly (readonly [number, number, number])[] = [
  [0.0, 0.941, 1.0], // radiant cyan  #00f0ff
  [1.0, 0.718, 0.012], // neon amber   #ffb703
  [0.447, 0.035, 0.718] // ion purple   #7209b7
];

/**
 * Builds the monolith field: a ground slab plus a jittered lattice of pillars of varying height,
 * a minority of which glow in an accent colour to give the eye something to navigate by.
 *
 * Runs once at startup. It allocates, and is not safe to call inside a frame.
 */
export function buildScene(options: SceneOptions = {}): SceneData {
  const seed = options.seed ?? 0x564f5258; // "VORX"
  const fieldRadius = options.fieldRadius ?? 120;
  const spacing = options.spacing ?? 10;
  const clearingRadius = options.clearingRadius ?? 8;

  const rand = mulberry32(seed);
  const values: number[] = [];

  const push = (
    tx: number,
    ty: number,
    tz: number,
    sx: number,
    sy: number,
    sz: number,
    r: number,
    g: number,
    b: number,
    emissive: number,
    grid: number
  ): void => {
    values.push(tx, ty, tz, sx, sy, sz, r, g, b, emissive, grid);
  };

  // Ground slab. Its top face sits exactly at y = 0 because the cube's base is its origin, so the
  // slab is translated down by its own thickness.
  const groundSize = fieldRadius * 2 + spacing * 2;
  const groundThickness = 2;
  push(
    0,
    GROUND_Y - groundThickness,
    0,
    groundSize,
    groundThickness,
    groundSize,
    SLATE[0] * 0.8,
    SLATE[1] * 0.8,
    SLATE[2] * 0.85,
    0,
    1 // the floor, and only the floor, carries the grid
  );

  for (let gx = -fieldRadius; gx <= fieldRadius; gx += spacing) {
    for (let gz = -fieldRadius; gz <= fieldRadius; gz += spacing) {
      // Jitter breaks the lattice up so the field reads as terrain rather than a spreadsheet.
      const x = gx + (rand() - 0.5) * spacing * 0.7;
      const z = gz + (rand() - 0.5) * spacing * 0.7;

      if (Math.hypot(x, z) < clearingRadius) continue;
      // A third of the lattice stays empty, which is what creates walkable corridors.
      if (rand() < 0.34) continue;

      const footprint = 1.2 + rand() * 3.4;
      // Distance-weighted height: the horizon gets the colossal silhouettes, the player's immediate
      // surroundings stay readable and navigable.
      const distance = Math.hypot(x, z) / fieldRadius;
      const height = 2 + rand() * 10 + distance * distance * 26;

      const isAccent = rand() < 0.08;
      if (isAccent) {
        const accent = ACCENTS[Math.floor(rand() * ACCENTS.length)];
        // Emissive stays below 1 so the lambert term still shades the faces. Push it higher and
        // the monolith flattens into a colour-filled silhouette with no volume.
        push(x, GROUND_Y, z, footprint, height, footprint, accent[0], accent[1], accent[2], 0.55, 0);
      } else {
        // Subtle per-pillar value variation keeps large slate masses from flattening out.
        const shade = 0.7 + rand() * 0.75;
        push(
          x,
          GROUND_Y,
          z,
          footprint,
          height,
          footprint,
          SLATE[0] * shade,
          SLATE[1] * shade,
          SLATE[2] * shade,
          0,
          0
        );
      }
    }
  }

  return {
    instances: new Float32Array(values),
    instanceCount: values.length / INSTANCE_FLOATS,
    extent: fieldRadius
  };
}
