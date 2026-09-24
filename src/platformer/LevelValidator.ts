import { tileAt, isSolid, PLATFORM, SPIKES, type LevelData } from './Level';

/**
 * Proves a level can be finished, using the hero's real limits.
 *
 * A standing spot is an empty two-tile-tall column cell with something to stand on beneath it.
 * From one spot you can reach another if it is within a running jump sideways and no more than a
 * jump's height up. A breadth-first search from the start then says whether the flag and each
 * star coin can be reached. It is conservative about headroom — it ignores ceilings — which suits
 * the open layouts these levels use.
 */

/** Tiles a running jump clears sideways. */
export const MAX_JUMP_ACROSS = 5;
/** Tiles a jump rises (the hero's feet), rounded down. */
export const MAX_JUMP_UP = 2;
/** How far above a standing spot the hero's body reaches at the top of a jump. */
const REACH_ABOVE = 4.2;

interface Spot {
  x: number;
  y: number;
}

function standingSpots(level: LevelData): Spot[] {
  const spots: Spot[] = [];
  for (let x = 0; x < level.width; x++) {
    for (let y = 1; y < level.height; y++) {
      const below = tileAt(level, x + 0.5, y - 1);
      const here = tileAt(level, x + 0.5, y);
      const above = tileAt(level, x + 0.5, y + 1);
      const floor = isSolid(below) || below === PLATFORM;
      if (floor && !isSolid(here) && here !== SPIKES && !isSolid(above)) spots.push({ x, y });
    }
  }
  return spots;
}

export interface Reachability {
  flag: boolean;
  starCoins: boolean[];
  reached: Spot[];
}

export function checkLevel(level: LevelData): Reachability {
  const spots = standingSpots(level);
  const startX = Math.floor(level.start.x);
  const startY = Math.round(level.start.y);
  const first = spots.find((s) => s.x === startX && s.y === startY);
  if (!first) return { flag: false, starCoins: [false, false, false], reached: [] };

  const seen = new Set<Spot>([first]);
  const queue: Spot[] = [first];
  while (queue.length) {
    const a = queue.shift()!;
    for (const b of spots) {
      if (seen.has(b)) continue;
      const across = Math.abs(b.x - a.x);
      const up = b.y - a.y;
      // Walking: next column, same height, or dropping down any distance.
      const walk = across <= 1 && up <= 0;
      const jump = across <= MAX_JUMP_ACROSS && up <= MAX_JUMP_UP;
      if (walk || jump) {
        seen.add(b);
        queue.push(b);
      }
    }
  }
  const reached = [...seen];
  const flagX = Math.floor(level.flag.x);
  const flag = reached.some((s) => Math.abs(s.x - flagX) <= 1 && Math.abs(s.y - level.flag.y) <= 1);
  const starCoins = level.starCoins.map((c) =>
    reached.some((s) => Math.abs(s.x + 0.5 - c.x) <= 2.5 && c.y - s.y <= REACH_ABOVE && c.y - s.y >= -1)
  );
  return { flag, starCoins, reached };
}
