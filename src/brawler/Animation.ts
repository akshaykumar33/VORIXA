import { MOVES, type Fighter, type MoveId } from './Brawler';

/**
 * Which sprite-sheet cell shows a fighter (ADR-0015). The sheets follow the layout requested in
 * AI_ASSET_COORDINATION.md: 256 px cells, one row per animation, frames left to right.
 */

export const CELL = 256;
/** The feet's line inside a cell. */
export const BASELINE = 236;
/** A standing fighter's height inside a cell, in pixels. */
export const SPRITE_HEIGHT = 200;

export const ROWS = ['idle', 'walk', 'jab', 'cross', 'uppercut', 'kick', 'jump', 'airkick', 'special', 'hurt', 'knockdown', 'getup'] as const;
export type Row = (typeof ROWS)[number];

export const FRAMES: Record<Row, number> = {
  idle: 4, walk: 6, jab: 3, cross: 3, uppercut: 4, kick: 4, jump: 3, airkick: 2, special: 6, hurt: 2, knockdown: 4, getup: 3
};

/** Each move's animation; enemies reuse the heroes' rows (Cantor's charge sits in `special`). */
const MOVE_ROW: Record<MoveId, Row> = {
  jab1: 'jab', jab2: 'cross', jab3: 'uppercut', heavy: 'kick', airkick: 'airkick', special: 'special',
  swipe: 'jab', slash: 'cross', slam: 'uppercut', charge: 'special'
};

export interface Cell {
  row: Row;
  frame: number;
}

/** The cell for a fighter now. `clock` drives the looping rows (idle, walk). */
export function cellFor(f: Fighter, clock: number): Cell {
  const loop = (row: Row, fps: number): Cell => ({ row, frame: Math.floor(clock * fps + f.id * 0.37) % FRAMES[row] });
  const once = (row: Row, share: number): Cell => ({ row, frame: Math.min(FRAMES[row] - 1, Math.max(0, Math.floor(share * FRAMES[row]))) });
  switch (f.state) {
    case 'walk':
      return loop('walk', 12);
    case 'attack': {
      if (!f.move) return loop('idle', 8);
      const m = MOVES[f.move];
      return once(MOVE_ROW[f.move], f.t / (m.startup + m.active + m.recover));
    }
    case 'jump':
      if (f.move === 'airkick') return once('airkick', f.t / 0.15);
      return { row: 'jump', frame: f.vy > 150 ? 0 : f.vy > -150 ? 1 : 2 };
    case 'hurt':
      return once('hurt', f.t / Math.max(0.05, f.stun));
    case 'down':
      return once('knockdown', f.t / 0.5);
    case 'getup':
      return once('getup', f.t / 0.35);
    default:
      return loop('idle', 8);
  }
}
