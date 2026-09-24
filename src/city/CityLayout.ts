/**
 * The street plan of VORIXA City's first district (ADR-0014): a grid of 4-lane roads with
 * intersections, and blocks lined with buildings facing the streets. Pure data, so the plan and
 * its colliders are testable without a renderer.
 *
 * Units are metres, matching the Downtown City MegaKit. The kit's pieces, as measured from the
 * built `city.glb`:
 *
 * - `Street_4Lane`: 6 m along x, 18 m across z (four lanes plus a sidewalk each side).
 * - `Street_4WayIntersection`: 24.66 m square.
 * - Buildings have their front on z = 0 and extend toward -z.
 */

export interface Placement {
  piece: string;
  /** The block (or road cell) it belongs to, so the renderer can batch and cull per chunk. */
  chunk: string;
  x: number;
  z: number;
  /** Rotation about y, radians. */
  rot: number;
}

/** An axis-aligned solid: buildings, and the district's outer walls. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface District {
  placements: Placement[];
  colliders: Box[];
  /** Where the player may walk: the district's roads and blocks. */
  bounds: Box;
  spawn: { x: number; z: number; yaw: number };
  /** The size of one block from road centre to road centre. */
  pitch: number;
  roadsX: number;
  roadsZ: number;
}

export const INTERSECTION = 24.66;
export const ROAD_SEGMENT = 6;
export const ROAD_HALF_WIDTH = 9;
/** Road segments between two intersections. */
export const SEGMENTS_PER_BLOCK = 6;
export const PITCH = INTERSECTION + ROAD_SEGMENT * SEGMENTS_PER_BLOCK;

/** Footprints of the prebuilt buildings in their own space, front at z = 0. */
export const BUILDINGS: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number; height: number }> = {
  Building_Large_2: { minX: -9.32, maxX: 11.32, minZ: -16.32, maxZ: 0.32, height: 28 },
  Building_Medium_2_001: { minX: -7.53, maxX: 7.53, minZ: -12.49, maxZ: 0.57, height: 25 },
  Building_Small_1: { minX: -7.23, maxX: 5.23, minZ: -12.23, maxZ: 2.31, height: 17 }
};

/** Pairs of buildings that fit side by side along one block face. */
const PAIRS: [string, string][] = [
  ['Building_Large_2', 'Building_Medium_2_001'],
  ['Building_Medium_2_001', 'Building_Large_2'],
  ['Building_Large_2', 'Building_Small_1'],
  ['Building_Small_1', 'Building_Medium_2_001'],
  ['Building_Medium_2_001', 'Building_Small_1'],
  ['Building_Small_1', 'Building_Large_2']
];

/** Integer hash to [0, 1): a district is the same every time it is built. */
function hash(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The world-space box of a building footprint after rotation by 0 or π and translation. */
export function footprint(piece: string, x: number, z: number, rot: number): Box {
  const b = BUILDINGS[piece];
  const flip = Math.abs(rot) > 1;
  return flip
    ? { minX: x - b.maxX, maxX: x - b.minX, minZ: z - b.maxZ, maxZ: z - b.minZ, height: b.height }
    : { minX: x + b.minX, maxX: x + b.maxX, minZ: z + b.minZ, maxZ: z + b.maxZ, height: b.height };
}

/**
 * @param roads Intersections per side (roads × roads); the district has (roads-1)² inner blocks
 *   and a ring of scenery blocks outside the walkable bounds.
 */
export function buildDistrict(roads = 4): District {
  const placements: Placement[] = [];
  const colliders: Box[] = [];
  const P = PITCH;

  // Intersections and the roads between them.
  for (let i = 0; i < roads; i++) {
    for (let j = 0; j < roads; j++) {
      const chunk = `${i},${j}`;
      placements.push({ piece: 'Street_4WayIntersection', chunk, x: i * P, z: j * P, rot: 0 });
      for (let k = 0; k < SEGMENTS_PER_BLOCK; k++) {
        const along = INTERSECTION / 2 + ROAD_SEGMENT / 2 + k * ROAD_SEGMENT;
        if (i < roads - 1) placements.push({ piece: 'Street_4Lane', chunk, x: i * P + along, z: j * P, rot: 0 });
        if (j < roads - 1) placements.push({ piece: 'Street_4Lane', chunk, x: i * P, z: j * P + along, rot: Math.PI / 2 });
      }
      // Markings and street furniture along the road east (a) and the road north (b) of here.
      for (const dir of [0, 1] as const) {
        if ((dir === 0 && i >= roads - 1) || (dir === 1 && j >= roads - 1)) continue;
        const rot = dir === 0 ? 0 : Math.PI / 2;
        // (along, across) in road space → world.
        const at = (along: number, across: number) =>
          dir === 0 ? { x: i * P + along, z: j * P + across } : { x: i * P + across, z: j * P + along };
        for (let k = 0; k < SEGMENTS_PER_BLOCK; k++) {
          const along = INTERSECTION / 2 + ROAD_SEGMENT / 2 + k * ROAD_SEGMENT;
          placements.push({ piece: 'Decal_DoubleYellow_Straight', chunk, ...at(along, 0), rot });
          placements.push({ piece: 'Decal_BrokenLine_Straight', chunk, ...at(along, -3), rot });
          placements.push({ piece: 'Decal_BrokenLine_Straight', chunk, ...at(along, 3), rot });
        }
        // Crosswalks at both ends of the road, where it meets the intersections.
        for (const along of [INTERSECTION / 2 + 2.4, P - INTERSECTION / 2 - 2.4]) {
          placements.push({ piece: 'Decal_Crosswalk_Wide', chunk, ...at(along, 0), rot });
        }
        // Planters on both sidewalks, and a manhole in the road: things to hop on and notice.
        for (const [along, across] of [[P / 2 - 6, 7.4], [P / 2 + 8, -7.4]] as const) {
          const p = at(along, across);
          placements.push({ piece: 'Sidewalk_Planter', chunk, ...p, rot });
          const hw = dir === 0 ? 0.99 : 0.88;
          const hd = dir === 0 ? 0.88 : 0.99;
          colliders.push({ minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd, height: 0.51 });
        }
        if (hash(i, j, dir + 7) < 0.6) placements.push({ piece: 'Prop_ManholeCover', chunk, ...at(P / 2, 1.5), rot: 0 });
      }
    }
  }

  // Blocks: two buildings along each face that meets a road, backs to a service alley.
  const inset = ROAD_HALF_WIDTH + 0.6;
  for (let bi = -1; bi < roads; bi++) {
    for (let bj = -1; bj < roads; bj++) {
      const x0 = bi * P;
      const z0 = bj * P;
      // Inner blocks front a road on both faces. The outer ring is skyline beyond the bounds, and
      // only its faces that look into the district are built.
      const inX = bi >= 0 && bi < roads - 1;
      for (const face of [0, 1] as const) {
        const roadZ = face === 0 ? bj : bj + 1;
        if (!inX || roadZ < 0 || roadZ >= roads) continue;
        // Face 0 fronts the road at z0 (buildings turned to face -z); face 1 the road at z0 + P.
        const pair = PAIRS[Math.floor(hash(bi, bj, face) * PAIRS.length)];
        const rot = face === 0 ? Math.PI : 0;
        let cursor = x0 + inset;
        for (const piece of pair) {
          const b = BUILDINGS[piece];
          // Left edge in world space depends on the turn.
          const x = face === 0 ? cursor + b.maxX : cursor - b.minX;
          // Set back by the building's own overhang (steps, porches), so the sidewalk stays clear.
          const frontZ = face === 0 ? z0 + inset + b.maxZ : z0 + P - inset - b.maxZ;
          placements.push({ piece, chunk: `b${bi},${bj}`, x, z: frontZ, rot });
          colliders.push(footprint(piece, x, frontZ, rot));
          cursor += b.maxX - b.minX + 1.2;
        }
      }
    }
  }

  const bounds: Box = {
    minX: -ROAD_HALF_WIDTH + 0.5,
    maxX: (roads - 1) * P + ROAD_HALF_WIDTH - 0.5,
    minZ: -ROAD_HALF_WIDTH + 0.5,
    maxZ: (roads - 1) * P + ROAD_HALF_WIDTH - 0.5,
    height: 100
  };
  return {
    placements,
    colliders,
    bounds,
    // On the sidewalk by the first intersection, looking up the avenue.
    spawn: { x: INTERSECTION / 2 + 4, z: -ROAD_HALF_WIDTH + 2.2, yaw: -Math.PI / 2 },
    pitch: P,
    roadsX: roads,
    roadsZ: roads
  };
}
