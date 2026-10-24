import type { Kind, StageDef } from './Brawler';

/**
 * Neon Knuckles' story (ADR-0015): face-off dialogue shown between the fighting, arcade-style, with
 * the painted portraits. Pure data, keyed to moments in a stage.
 */

export interface Line {
  /** Who is speaking; their portrait is lit, the other is dimmed. */
  speaker: Kind;
  /** Who they are facing, shown on the other side. */
  facing: Kind;
  text: string;
}

export type Moment = 'intro' | 'brute' | 'boss' | 'clear';

export const STAGE_ONE_STORY: Record<Moment, Line[]> = {
  intro: [
    { speaker: 'kai', facing: 'vex', text: 'Second Street used to be ours. Now the Choir paints it gold and calls the noise a hymn.' },
    { speaker: 'vex', facing: 'kai', text: 'Then we sing louder. Stay close, Kai, and try not to bleed on my jacket.' }
  ],
  brute: [
    { speaker: 'brute', facing: 'kai', text: 'Cantor said you two would come crawling. He said you would be taller.' },
    { speaker: 'kai', facing: 'brute', text: 'Cantor says a lot of things. Tonight he finds out which ones were true.' }
  ],
  boss: [
    { speaker: 'boss', facing: 'vex', text: 'Two strays in my rain. I gave this street its music. What did you ever give it?' },
    { speaker: 'vex', facing: 'boss', text: 'A reason to stop listening.' },
    { speaker: 'boss', facing: 'kai', text: 'Then let us see who is still standing on the last note.' }
  ],
  clear: [
    { speaker: 'kai', facing: 'vex', text: 'Second Street is quiet. First time in a year.' },
    { speaker: 'vex', facing: 'kai', text: 'For tonight. The Choir has other streets, and Cantor has friends who sing worse.' }
  ]
};

/** The story moment a newly started wave opens, if any: the first Brute, and the boss. */
export function momentForWave(stage: StageDef, index: number): Moment | null {
  const foes = stage.waves[index]?.foes ?? [];
  if (foes.includes('boss')) return 'boss';
  const firstBrute = stage.waves.findIndex((w) => w.foes.includes('brute'));
  return firstBrute === index ? 'brute' : null;
}
