import type { CharacterDef } from '../city/Crew';
import type { FighterDef } from './Fight';

/**
 * Akhada's fighters (ADR-0016): the realistic cast, renamed and dressed in the colours of the
 * ghats. `palette` recolours their garments; `colour` is their energy (blasts, the super, the UI).
 */
export interface Contender extends FighterDef {
  bio: string;
  palette: Record<string, number>;
}

export const ROSTER: Contender[] = [
  {
    id: 'veer', name: 'Veer', title: 'The Lion of Kashi', model: 'mh-dex', colour: 0xff8a1f,
    bio: 'Wrestled on these ghats before he could read. Fights like the river: slow, then all at once.',
    palette: { male_casualsuit06: 0xd9661a }
  },
  {
    id: 'arjun', name: 'Arjun', title: 'The Monsoon Blade', model: 'mh-kai', colour: 0x3de1c0,
    bio: 'Quick hands, quicker feet. Says the rain tells him where you will step.',
    palette: { namuhekam_male_polo_shirt: 0x1f6b4a, toigo_wool_pants: 0x1a1d24 }
  },
  {
    id: 'meera', name: 'Meera', title: 'The Storm Dancer', model: 'mh-juno', colour: 0xff3d9a,
    bio: 'Trained in kathak, then in everything else. Every kick lands on the beat.',
    palette: { female_sportsuit01: 0xc2185b }
  },
  {
    id: 'rani', name: 'Rani', title: 'The Iron Bangle', model: 'mh-mara', colour: 0xff4040,
    bio: 'Runs the boatmen of Dashashwamedh. Nobody crosses the river without her say.',
    palette: { male_worksuit01: 0x8e1b22 }
  }
];

/** A contender as the cast loader wants them. */
export function castDef(c: Contender): CharacterDef {
  return { id: `akhada-${c.id}`, name: c.name, alias: c.title, role: 'Fighter', bio: c.bio, faction: 'crew', model: c.model, palette: c.palette, accent: c.colour };
}
