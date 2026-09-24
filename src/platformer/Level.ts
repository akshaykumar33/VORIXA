/**
 * Platformer levels: a tile grid (1 m tiles, y up) plus the things placed on it.
 *
 * Levels are authored as **sections** — a start area, a gap, a pit crossing, a staircase —
 * placed side by side. Each section says where its ground is and drops short strings of tiles at
 * row/column positions. That keeps authoring readable and makes a misaligned character
 * impossible, which a hand-typed 180-column ASCII map could not promise.
 *
 * Tile characters in placed strings:
 *
 *   B brick   ? coin block   H heart block   = one-way platform   ^ spikes
 *   o coin    * star coin    w walker        f flyer             t turret
 *   C checkpoint              F flag pole    @ hero start         (space) nothing
 *
 * Rows count **up from the ground surface**: row 0 is the air just above the ground (where the
 * hero stands), row 2 is where a block sits so a jumping hero can bump it from below.
 */

export type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const EMPTY: Tile = 0;
export const GROUND: Tile = 1;
export const BRICK: Tile = 2;
export const QUESTION: Tile = 3;
export const USED: Tile = 4;
export const PLATFORM: Tile = 5;
export const SPIKES: Tile = 6;
export const HEART_BLOCK: Tile = 7;

export type EnemyKind = 'walker' | 'flyer' | 'turret';

export interface Point {
  x: number;
  y: number;
}

export interface LevelData {
  name: string;
  width: number;
  height: number;
  /** Row-major, row 0 at the bottom. */
  tiles: Uint8Array;
  start: Point;
  coins: Point[];
  /** In left-to-right order: star coin 0, 1, 2. */
  starCoins: Point[];
  enemies: (Point & { kind: EnemyKind })[];
  checkpoints: Point[];
  flag: Point;
}

/** Solid from every side. */
export function isSolid(t: number): boolean {
  return t === GROUND || t === BRICK || t === QUESTION || t === USED || t === HEART_BLOCK;
}

/** Ground occupies rows 0..GROUND_DEPTH-1; the surface the hero stands on is at y = GROUND_DEPTH. */
export const GROUND_DEPTH = 3;
const SKY_ROWS = 10;

export interface Section {
  width: number;
  /** Column ranges [from, to] (inclusive) that have ground. Omitted: ground all the way across. */
  ground?: [number, number][];
  /** [row above the surface, column, tiles]: tiles placed left to right from that cell. */
  place?: [number, number, string][];
}

/**
 * Builds a level from sections. Throws with the section and cell on anything malformed, so a
 * broken level fails its test loudly instead of loading wrong.
 */
export function buildLevel(name: string, sections: readonly Section[]): LevelData {
  const width = sections.reduce((w, s) => w + s.width, 0);
  const height = GROUND_DEPTH + SKY_ROWS;
  const tiles = new Uint8Array(width * height);
  const level: LevelData = {
    name,
    width,
    height,
    tiles,
    start: { x: 1.5, y: GROUND_DEPTH },
    coins: [],
    starCoins: [],
    enemies: [],
    checkpoints: [],
    flag: { x: width - 2.5, y: GROUND_DEPTH }
  };
  let sawStart = false;
  let sawFlag = false;
  let x0 = 0;
  sections.forEach((section, si) => {
    const ranges = section.ground ?? [[0, section.width - 1]];
    for (const [from, to] of ranges) {
      for (let c = from; c <= to; c++) {
        for (let y = 0; y < GROUND_DEPTH; y++) tiles[y * width + x0 + c] = GROUND;
      }
    }
    for (const [row, col, text] of section.place ?? []) {
      for (let i = 0; i < text.length; i++) {
        const x = x0 + col + i;
        const y = GROUND_DEPTH + row;
        if (col + i >= section.width || y >= height) {
          throw new Error(`Section ${si} places '${text}' outside itself at row ${row}, column ${col + i}`);
        }
        const at = { x: x + 0.5, y };
        switch (text[i]) {
          case 'B': tiles[y * width + x] = BRICK; break;
          case '?': tiles[y * width + x] = QUESTION; break;
          case 'H': tiles[y * width + x] = HEART_BLOCK; break;
          case '=': tiles[y * width + x] = PLATFORM; break;
          case '^': tiles[y * width + x] = SPIKES; break;
          case 'o': level.coins.push(at); break;
          case '*': level.starCoins.push(at); break;
          case 'w': level.enemies.push({ kind: 'walker', ...at }); break;
          case 'f': level.enemies.push({ kind: 'flyer', ...at }); break;
          case 't': level.enemies.push({ kind: 'turret', ...at }); break;
          case 'C': level.checkpoints.push(at); break;
          case 'F': level.flag = at; sawFlag = true; break;
          case '@': level.start = at; sawStart = true; break;
          case ' ': break;
          default: throw new Error(`Section ${si}: unknown tile '${text[i]}' at row ${row}, column ${col + i}`);
        }
      }
    }
    x0 += section.width;
  });
  if (!sawStart) throw new Error(`${name}: no hero start (@)`);
  if (!sawFlag) throw new Error(`${name}: no flag (F)`);
  if (level.starCoins.length !== 3) throw new Error(`${name}: ${level.starCoins.length} star coins; a level needs exactly 3`);
  level.starCoins.sort((a, b) => a.x - b.x);
  return level;
}

export function tileAt(level: LevelData, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  // The level's ends are walls; below it is the pit; above it is open sky.
  if (tx < 0 || tx >= level.width) return GROUND;
  if (ty < 0 || ty >= level.height) return EMPTY;
  return level.tiles[ty * level.width + tx];
}

export function setTile(level: LevelData, x: number, y: number, t: Tile): void {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= level.width || ty < 0 || ty >= level.height) return;
  level.tiles[ty * level.width + tx] = t;
}
