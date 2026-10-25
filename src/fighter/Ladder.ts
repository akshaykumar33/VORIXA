/**
 * Akhada's arcade ladder (ADR-0017): the single-player run. The player meets every other fighter
 * once, in a seeded order, across the arenas in turn, with the CPU growing harder as they climb.
 * Pure data: the game reads the rungs.
 */

export type LadderDifficulty = 'easy' | 'normal' | 'hard';

export interface Rung<Stage extends string> {
  opponent: string;
  stage: Stage;
  difficulty: LadderDifficulty;
}

/** Easy for the first two fights, normal through the middle, hard for the last two. */
export function difficultyAt(index: number, total: number): LadderDifficulty {
  if (index < 2) return 'easy';
  if (index >= total - 2) return 'hard';
  return 'normal';
}

/**
 * The ladder for a player: every other fighter once, shuffled by `seed`, with the last fighter
 * fixed as the climax if given, and the arenas cycling in order.
 */
export function buildLadder<Stage extends string>(player: string, roster: readonly string[], stages: readonly Stage[], seed: number, finale?: string): Rung<Stage>[] {
  let s = seed >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const field = roster.filter((id) => id !== player && id !== finale);
  for (let i = field.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [field[i], field[j]] = [field[j], field[i]];
  }
  if (finale && finale !== player) field.push(finale);
  return field.map((opponent, i) => ({ opponent, stage: stages[i % stages.length], difficulty: difficultyAt(i, field.length) }));
}
