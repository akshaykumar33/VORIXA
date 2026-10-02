import { ROAD_HALF_WIDTH, type Box, type District } from './CityLayout';

/**
 * The wild country north of the city (ADR-0014, Far Cry layer): past the last road the district
 * opens onto rolling hills, a forest thick with pines toward the high ground, a lake in a basin,
 * and a dirt trail winding up from the city. Pure data: the ground's height anywhere, where every
 * tree and rock stands, and the solids a body cannot walk through (trunks and big rocks).
 *
 * Everything is a deterministic function of position, so the same hills are there every time and
 * the tests can walk them.
 */

/** How deep the wilds run north of the city's last sidewalk, metres. */
export const WILD_DEPTH = 300;
/** The lake's surface; its bed is kept just deep enough to wade (waist deep at most). */
export const WATER_LEVEL = -0.35;
export const WADE_DEPTH = 1.0;

export interface Lake {
  x: number;
  z: number;
  radius: number;
}

export type TreeKind = 'common' | 'pine' | 'dead' | 'twisted';

export interface Prop {
  piece: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
}

export interface Wilds {
  /** Where the city stops and the wild begins (z), and where the wild ends. */
  z0: number;
  z1: number;
  minX: number;
  maxX: number;
  lake: Lake;
  /** The trail's centre line, sampled south to north. */
  trail: { x: number; z: number }[];
  trees: Prop[];
  rocks: Prop[];
  /** Grass, flowers, ferns, bushes, pebbles, mushrooms: looks only, no collision. */
  plants: Prop[];
  /** Trunks and big rocks. */
  solids: Box[];
  ground: (x: number, z: number) => number;
}

// ─── Noise ────────────────────────────────────────────────────────────────────────────────────

function hash2(x: number, z: number, salt: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(salt, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, salt: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt);
  const b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt);
  const d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x: number, z: number, salt: number): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    v += a * valueNoise(x * f, z * f, salt + i);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}

const smooth = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Distance from (x, z) to a polyline. */
function distanceToLine(line: readonly { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

// ─── The country ──────────────────────────────────────────────────────────────────────────────

/**
 * Opens the district's north edge onto the wild: the skyline buildings beyond the last road come
 * down, the walkable bounds run north, and the district gets its ground function. Returns the
 * wild's layout. Call once, before anything is built from the district.
 */
export function openWilds(district: District): Wilds {
  const P = district.pitch;
  const north = (district.roadsZ - 1) * P;
  const z0 = north + ROAD_HALF_WIDTH;
  const z1 = z0 + WILD_DEPTH;
  const minX = district.bounds.minX;
  const maxX = district.bounds.maxX;

  // The skyline north of the last road: gone (buildings only; the road's planters stay).
  for (let i = district.colliders.length - 1; i >= 0; i--) {
    const c = district.colliders[i];
    if (c.height > 5 && c.minZ > north) district.colliders.splice(i, 1);
  }
  for (let i = district.placements.length - 1; i >= 0; i--) {
    if (district.placements[i].chunk.startsWith('b') && district.placements[i].chunk.endsWith(`,${district.roadsZ - 1}`)) district.placements.splice(i, 1);
  }
  district.bounds.maxZ = z1 - 0.5;

  const lake: Lake = { x: (minX + maxX) * 0.62, z: z0 + 165, radius: 34 };
  // The trail leaves the city up the second north-south road and winds north, round the lake.
  const trail: { x: number; z: number }[] = [];
  for (let z = z0 - 2; z <= z1; z += 10) {
    const k = (z - z0) / WILD_DEPTH;
    trail.push({ x: P + Math.sin(k * 5.2) * 26 + k * 18, z });
  }

  const ground = (x: number, z: number): number => {
    if (z <= z0) return 0;
    const rise = smooth(z0 + 4, z0 + 55, z);
    // The trail follows the hills' long shape, with the small bumps worn off it and a slight dip.
    const dTrail = distanceToLine(trail, x, z);
    const worn = smooth(1.5, 7, dTrail);
    let h = (fbm(x / 70, z / 70, 11) - 0.35) * 26 + fbm(x / 22, z / 22, 23) * 3 * worn - (1 - worn) * 0.25;
    // Higher toward the back, so the far ridge frames the view.
    h += smooth(z0 + 120, z1, z) * 16;
    h *= rise;
    // The lake's basin, just deep enough to wade.
    const dLake = Math.hypot(x - lake.x, z - lake.z);
    if (dLake < lake.radius * 1.6) {
      const bowl = 1 - smooth(lake.radius * 0.55, lake.radius * 1.6, dLake);
      h = h * (1 - bowl) + (WATER_LEVEL - WADE_DEPTH) * bowl;
    }
    return Math.max(h, WATER_LEVEL - WADE_DEPTH);
  };
  district.ground = ground;

  const trees: Prop[] = [];
  const rocks: Prop[] = [];
  const plants: Prop[] = [];
  const solids: Box[] = [];
  const open = (x: number, z: number, margin: number) =>
    x > minX + 2 && x < maxX - 2 && z > z0 + 10 && z < z1 - 2 && distanceToLine(trail, x, z) > 4 + margin && Math.hypot(x - lake.x, z - lake.z) > lake.radius + 3 + margin;

  // Trees on a jittered grid, thicker where the forest noise says, pines on the high ground.
  const CELL = 8;
  for (let gx = Math.floor(minX / CELL); gx <= Math.ceil(maxX / CELL); gx++) {
    for (let gz = Math.floor(z0 / CELL); gz <= Math.ceil(z1 / CELL); gz++) {
      const x = (gx + 0.2 + hash2(gx, gz, 1) * 0.6) * CELL;
      const z = (gz + 0.2 + hash2(gx, gz, 2) * 0.6) * CELL;
      if (!open(x, z, 1)) continue;
      const forest = fbm(x / 55, z / 55, 5);
      if (hash2(gx, gz, 3) > forest * 1.5 - 0.15) continue;
      const y = ground(x, z);
      const pick = hash2(gx, gz, 4);
      const kind: TreeKind = y > 9 || pick < 0.35 ? 'pine' : pick < 0.9 ? 'common' : pick < 0.93 ? 'twisted' : 'dead';
      const n = 1 + Math.floor(hash2(gx, gz, 6) * 5);
      const piece = kind === 'pine' ? `Pine_${n}` : kind === 'common' ? `CommonTree_${n}` : kind === 'twisted' ? `TwistedTree_${n}` : `DeadTree_${n}`;
      const scale = 0.85 + hash2(gx, gz, 7) * 0.55;
      trees.push({ piece, x, y, z, rot: hash2(gx, gz, 8) * Math.PI * 2, scale });
      const r = 0.35 * scale;
      solids.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, height: y + 8 });
    }
  }
  // Rocks scattered in the open, big ones solid.
  for (let i = 0; i < 70; i++) {
    const x = minX + hash2(i, 1, 31) * (maxX - minX);
    const z = z0 + 12 + hash2(i, 2, 31) * (WILD_DEPTH - 14);
    if (!open(x, z, 0)) continue;
    const scale = 0.8 + hash2(i, 3, 31) * 1.6;
    const y = ground(x, z);
    rocks.push({ piece: `Rock_Medium_${1 + (i % 3)}`, x, y, z, rot: hash2(i, 4, 31) * Math.PI * 2, scale });
    if (scale > 1.4) {
      const r = 0.9 * scale;
      solids.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, height: y + 1.4 * scale });
    }
  }
  // Undergrowth: grass everywhere it grows, flowers in the meadows, ferns and bushes under trees.
  const PLANTS = ['Grass_Common_Tall', 'Grass_Wispy_Tall', 'Grass_Common_Short', 'Grass_Wispy_Short', 'Flower_3_Group', 'Flower_4_Group', 'Fern_1', 'Bush_Common', 'Bush_Common_Flowers', 'Plant_1', 'Plant_7', 'Clover_1', 'Mushroom_Common', 'Pebble_Round_2'];
  for (let i = 0; i < 2600; i++) {
    const x = minX + hash2(i, 5, 41) * (maxX - minX);
    const z = z0 + 3 + hash2(i, 6, 41) * (WILD_DEPTH - 5);
    if (Math.hypot(x - lake.x, z - lake.z) < lake.radius * 0.95) continue;
    if (distanceToLine(trail, x, z) < 1.8) continue;
    const k = hash2(i, 7, 41);
    const piece = PLANTS[k < 0.55 ? Math.floor(k / 0.55 * 4) : 4 + Math.floor(((k - 0.55) / 0.45) * (PLANTS.length - 4))];
    plants.push({ piece, x, y: ground(x, z), z, rot: hash2(i, 8, 41) * Math.PI * 2, scale: 0.8 + hash2(i, 9, 41) * 0.7 });
  }
  district.colliders.push(...solids);
  return { z0, z1, minX, maxX, lake, trail, trees, rocks, plants, solids, ground };
}

/** Whether (x, z) is in the lake's water (and how deep, at the ground there). */
export function waterDepth(w: Wilds, x: number, z: number): number {
  return Math.max(0, WATER_LEVEL - w.ground(x, z));
}
