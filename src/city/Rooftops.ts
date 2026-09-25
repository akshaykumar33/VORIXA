import { BUILDINGS, footprint, type District } from './CityLayout';

/**
 * Rooftop access (ADR-0014, Far Cry layer): a fire-escape ladder up the front of the tall
 * buildings, so the city has a second level. From a roof the hero can run to the next roof, look
 * down on an outpost, snipe, or jump and open the glider. Pure data from the district's layout.
 *
 * Only the large and medium buildings get one: their fronts stand flush with the pavement (the
 * small one has front steps in the way).
 */

export interface Ladder {
  /** Where the hero stands to climb: on the pavement, at the wall. */
  x: number;
  z: number;
  /** The wall the ladder is bolted to, and which way it faces (out, toward the street). */
  wallX: number;
  wallZ: number;
  facing: number;
  /** The roof: its height, and where the hero steps off onto it. */
  roofY: number;
  roofX: number;
  roofZ: number;
}

/** How close the hero must stand to take a ladder. */
export const LADDER_REACH = 1.3;

export function buildLadders(district: District): Ladder[] {
  const out: Ladder[] = [];
  for (const p of district.placements) {
    if (p.piece !== 'Building_Large_2' && p.piece !== 'Building_Medium_2_001') continue;
    const b = footprint(p.piece, p.x, p.z, p.rot);
    // Inside the district only (the outer ring is scenery beyond the walls).
    const bd = district.bounds;
    if (b.minX < bd.minX || b.maxX > bd.maxX || b.minZ < bd.minZ || b.maxZ > bd.maxZ) continue;
    const flip = Math.abs(p.rot) > 1;
    // Near the building's left corner as seen from the street, clear of the door in the middle.
    const x = flip ? b.maxX - 1.1 : b.minX + 1.1;
    const wallZ = flip ? b.minZ : b.maxZ;
    const out1 = flip ? -1 : 1;
    out.push({
      x,
      z: wallZ + out1 * 0.5,
      wallX: x,
      wallZ,
      facing: flip ? Math.PI : 0,
      roofY: BUILDINGS[p.piece].height,
      roofX: x,
      roofZ: wallZ - out1 * 1.6
    });
  }
  return out;
}

/** The ladder the hero can take from (x, z), if one is in reach. */
export function ladderAt(ladders: readonly Ladder[], x: number, z: number, y: number): Ladder | null {
  for (const l of ladders) if (y < 0.5 && Math.hypot(l.x - x, l.z - z) < LADDER_REACH) return l;
  return null;
}
