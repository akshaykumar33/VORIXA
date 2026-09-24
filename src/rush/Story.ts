import { TOUR } from './Tour';

/**
 * The storyboards: three-panel comic strips that frame the World Tour.
 *
 * Each world opens with its guardian explaining what Baron Buzz has done there, and each boss
 * ends with a victory beat and the Baron escaping — until the last world, where he doesn't.
 * Short on purpose: three panels, a line each, then you are driving again.
 *
 * Pure data: the scene ids are saved in progress so each strip plays once (and can be replayed).
 */

export type Actor = 'driver' | 'guardian' | 'baron' | 'drone' | 'boss' | 'wheel' | 'crowd';

export interface Panel {
  cast: Actor[];
  /** Who is talking; their name heads the speech bubble. */
  speaker: string;
  line: string;
  /** A big comic sound effect lettered across the panel. */
  sfx?: string;
}

export interface Scene {
  id: string;
  world: number;
  title: string;
  panels: [Panel, Panel, Panel];
}

function intro(world: number): Scene {
  const w = TOUR[world];
  const boss = w.stages.find((s) => s.boss)!.name;
  return {
    id: `intro-w${world + 1}`,
    world,
    title: `World ${world + 1} · ${w.name}`,
    panels: [
      { cast: ['baron', 'wheel'], speaker: 'Baron Buzz', line: world === 0 ? 'The Golden Wheel is MINE! Every road in the land will buzz to my tune!' : `Ha! You'll never get past ${boss}!`, sfx: world === 0 ? 'BZZZT!' : undefined },
      { cast: ['guardian'], speaker: w.guardian, line: w.intro },
      { cast: ['driver', 'guardian'], speaker: 'You', line: `“${w.motto}” Let's roll!`, sfx: 'VROOM!' }
    ]
  };
}

function outro(world: number): Scene {
  const w = TOUR[world];
  const boss = w.stages.find((s) => s.boss)!.name;
  const last = world === TOUR.length - 1;
  return {
    id: `outro-w${world + 1}`,
    world,
    title: last ? 'The Golden Wheel' : `${w.name} is free!`,
    panels: last
      ? [
          { cast: ['baron'], speaker: 'Baron Buzz', line: 'No, no, NO! Beaten by a driver with a scarf?!', sfx: 'KA-BOOM!' },
          { cast: ['driver', 'wheel'], speaker: 'You', line: 'The Golden Wheel goes home. Every road runs free again.' },
          { cast: ['crowd', 'guardian', 'driver'], speaker: 'Everyone', line: 'Three cheers for the fastest driver in six worlds!', sfx: 'HOORAY!' }
        ]
      : [
          { cast: ['boss'], speaker: boss, line: 'Bzzt… systems… failing…', sfx: 'KA-BOOM!' },
          { cast: ['guardian', 'driver'], speaker: w.guardian, line: `You did it! ${w.name} can breathe again.`, sfx: 'YEAH!' },
          { cast: ['baron', 'wheel'], speaker: 'Baron Buzz', line: `Lucky break! Catch me in ${TOUR[world + 1].name} — if you dare!` }
        ]
  };
}

export const SCENES: readonly Scene[] = TOUR.flatMap((_, i) => [intro(i), outro(i)]);

export function introScene(world: number): Scene {
  return SCENES.find((s) => s.id === `intro-w${world + 1}`)!;
}

export function outroScene(world: number): Scene {
  return SCENES.find((s) => s.id === `outro-w${world + 1}`)!;
}
