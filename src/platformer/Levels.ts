import { buildLevel, type LevelData, type Section } from './Level';

/**
 * The authored levels. Rows count up from the ground surface; the hero is 1.5 tiles tall and
 * jumps a little under three, so:
 *
 *   row 2  a block the hero can bump from below while standing on the ground
 *   row 1  the highest a one-way platform can sit and still be jumped onto from the ground
 *   ≤ 2    the tallest single step
 *   ≤ 5    the widest gap a running jump clears
 *
 * `LevelValidator` checks these rules for every level, so an unreachable flag fails the tests.
 */

/**
 * 1-1 on foot: "Windmill Walk". Teaches one thing at a time: walk, grab coins, bump a block, stomp a
 * walker, hop a gap, climb, cross a pit on a platform, dodge a turret, jump spikes, then the
 * staircase to the flag. Star coins sit above the first blocks, on a ledge you reach from the pit
 * platform, and on a high ledge off the top of the staircase.
 */
const WINDMILL_WALK: Section[] = [
  // Start: coins to walk into, a row of blocks to bump, a star coin up on top of them.
  // A two-step brick stair beside the blocks is the way up to the star coin on top of them.
  { width: 26, place: [[0, 3, '@'], [1, 6, 'ooo'], [0, 10, 'BB'], [1, 11, 'B'], [2, 13, '?B?B?'], [5, 15, '*'], [0, 21, 'w']] },
  // A first small gap.
  { width: 10, ground: [[0, 3], [6, 9]], place: [[2, 4, 'oo']] },
  // Brick columns to climb over, a walker between them.
  { width: 22, place: [[0, 4, 'BB'], [1, 4, 'BB'], [0, 12, 'w'], [0, 16, 'BB'], [1, 16, 'BB'], [3, 16, 'oo']] },
  // A pit with a platform across it; a small brick ledge above holds the second star coin.
  { width: 22, ground: [[0, 5], [15, 21]], place: [[1, 7, '======'], [4, 9, 'BB'], [5, 9, '*'], [3, 6, 'o'], [3, 13, 'o'], [4, 11, 'f']] },
  // Turret alley: brick cover to hide behind, a heart block for the careful.
  { width: 26, place: [[2, 4, 'H'], [0, 9, 'BB'], [1, 9, 'BB'], [0, 20, 't'], [2, 13, 'ooo'], [0, 16, 'w']] },
  // Spikes to jump, a flyer overhead.
  { width: 20, place: [[0, 7, '^^^'], [3, 7, 'ooo'], [4, 13, 'f']] },
  // Checkpoint, then a three-wide gap.
  { width: 16, ground: [[0, 7], [11, 15]], place: [[0, 3, 'C'], [3, 8, 'ooo']] },
  // The staircase; a high platform off its top holds the third star coin; the flag beyond.
  {
    width: 36,
    place: [
      [0, 2, 'BBBBB'], [1, 3, 'BBBB'], [2, 4, 'BBB'], [3, 5, 'BB'], [4, 6, 'B'],
      [6, 9, '===='], [7, 11, '*'],
      [0, 26, 'F']
    ]
  }
];

export const LEVELS: readonly LevelData[] = [buildLevel('Windmill Walk', WINDMILL_WALK)];
