import type { CharacterDef } from '../city/Crew';
import type { AsuraLookSpec } from '../rendering/fighter/AsuraLook';
import type { FighterDef } from './Fight';

/**
 * Akhada's fighters (ADR-0017): asuras and rakshasas of the epics and Puranas, each with the look
 * and the powers their story gives them. The cast's realistic bodies carry them; `look` makes the
 * asura (skin, eyes, horns, crown, heads, aura) and `kit` sets their powers in the fight.
 *
 * The gods are not fighters here. These are the epics' great adversaries, told with respect for the
 * stories they come from.
 */
export interface Contender extends FighterDef {
  bio: string;
  /** The text they come from. */
  source: string;
  palette: Record<string, number>;
  look: AsuraLookSpec;
  /** What they say before an arcade fight. */
  taunt: string;
  /** Their super's name, called on its cut-in. */
  superName: string;
}

export const ROSTER: Contender[] = [
  {
    id: 'ravana', name: 'Ravana', title: 'Dashanan, King of Lanka', source: 'Ramayana', model: 'mh-asura-ravana', colour: 0xff5a1f,
    bio: 'Ten heads, twenty arms, and the learning of all the Vedas. He offered his heads to Shiva one by one, and each grew back.',
    taunt: 'Ten heads have learned every way you might fight. Choose one; I already know it.',
    superName: 'Dashanan Inferno',
    palette: { toigo_harem_pants: 0x7a0f18 },
    look: { skin: 0x9a6a4a, eyes: 0xff3d10, crown: 'tall', heads: 9, aura: 'fire' },
    kit: { signature: 'rain', power: 1.12, blast: { speed: 5.2, size: 0.55, damage: 125, chip: 18, style: 'fire' } }
  },
  {
    id: 'mahishasura', name: 'Mahishasura', title: 'The Buffalo Demon', source: 'Devi Mahatmya', model: 'mh-asura-mahisha', colour: 0x8a5cff,
    bio: 'No man or god could kill him, by the boon he won. He took the heavens, and lowered his horns at anyone who stood in the way.',
    taunt: 'Neither man nor god can end me. Which are you?',
    superName: 'Stampede of the Buffalo King',
    palette: { toigo_harem_pants: 0x1c1418 },
    look: { skin: 0x4a3c46, eyes: 0xb07aff, horns: 'buffalo', crown: 'band', aura: 'smoke', scale: 1.08 },
    kit: { signature: 'gore', power: 1.15, defense: 0.95, dash: 1.6, blast: { speed: 6, size: 0.4, damage: 95, chip: 14, style: 'shadow' } }
  },
  {
    id: 'kumbhakarna', name: 'Kumbhakarna', title: 'The Sleeping Giant', source: 'Ramayana', model: 'mh-asura-kumbha', colour: 0xd8a040,
    bio: 'Asked for the throne of Indra; his tongue slipped, and he was granted endless sleep. Woken, he shakes the earth.',
    taunt: 'You woke me for this? Then let me eat, and then let me fight.',
    superName: 'Wrath of the Woken',
    palette: { toigo_harem_pants: 0x8a5a1a },
    look: { skin: 0x6a5244, eyes: 0xffc040, crown: 'band', weapon: 'gada', aura: 'dust', scale: 1.18 },
    kit: { signature: 'ring', power: 1.3, defense: 0.72, speed: 0.75, armour: 95, blast: { speed: 3.6, size: 0.6, damage: 115, chip: 16, style: 'quake', low: true } }
  },
  {
    id: 'hiranyakashipu', name: 'Hiranyakashipu', title: 'The Golden Tyrant', source: 'Bhagavata Purana', model: 'mh-asura-hiranya', colour: 0xffd23d,
    bio: 'Not by man nor beast, not by day nor night, not inside nor out. His boon made him all but invulnerable.',
    taunt: 'Not by day, not by night, not inside, not out. Where will you strike?',
    superName: 'Boon of Hiranya',
    palette: { toigo_harem_pants: 0xe8c860 },
    look: { skin: 0xc9a24a, eyes: 0xfff2a0, crown: 'tall', aura: 'gold' },
    kit: { signature: 'counter', defense: 0.82, armour: 75, blast: { speed: 6.2, size: 0.4, damage: 100, chip: 15, style: 'gold' } }
  },
  {
    id: 'raktabija', name: 'Raktabija', title: 'Seed of Blood', source: 'Devi Mahatmya', model: 'mh-asura-rakta', colour: 0xe0102a,
    bio: 'Every drop of his blood that touched the ground rose as another of him. Wound him and he only grows stronger.',
    taunt: 'Cut me, and two of me will rise. Cut me again.',
    superName: 'Thousand Drops',
    palette: { toigo_harem_pants: 0x2a0608 },
    look: { skin: 0x9e2a2a, eyes: 0xffffff, horns: 'small', aura: 'blood' },
    kit: { signature: 'counter', lifesteal: 0.3, speed: 1.08, blast: { speed: 8, size: 0.3, damage: 80, chip: 12, style: 'blood' } }
  },
  {
    id: 'tataka', name: 'Tataka', title: 'Terror of the Forest', source: 'Ramayana', model: 'mh-asura-tataka', colour: 0x7acc3a,
    bio: 'A yakshi cursed into a rakshasi, she laid waste to the forest by the Sarayu and hurled boulders at all who came near.',
    taunt: 'This forest is mine. The rocks will tell you so.',
    superName: 'Fury of the Forest',
    palette: { toigo_harem_pants: 0x3a4a1a, toigo_keyhole_tank_top: 0x2a3014 },
    look: { skin: 0x5a6a44, eyes: 0xd8ff40, horns: 'ram', aura: 'dust', scale: 1.05 },
    kit: { signature: 'rain', power: 1.1, blast: { speed: 4.6, size: 0.5, damage: 130, chip: 18, style: 'boulder', arc: true } }
  },
  {
    id: 'holika', name: 'Holika', title: 'Who Walked into Fire', source: 'Bhagavata Purana', model: 'mh-asura-holika', colour: 0xff8a1f,
    bio: 'Her shawl made her proof against fire. She carried Prahlada into the flames, and the shawl flew from her to him.',
    taunt: 'Fire has never touched me. Come and stand in it.',
    superName: 'Pyre of the Phalgun Moon',
    palette: { toigo_halter_dress_midi: 0xd8501a },
    look: { skin: 0xb07a5a, eyes: 0xffa020, crown: 'band', aura: 'fire' },
    kit: { signature: 'ring', defense: 0.9, speed: 1.05, blast: { speed: 7.4, size: 0.42, damage: 105, chip: 15, style: 'fire' } }
  },
  {
    id: 'bakasura', name: 'Bakasura', title: 'The Crane Demon', source: 'Mahabharata', model: 'mh-asura-baka', colour: 0x9fe0ff,
    bio: 'He took a cartload of food and a villager every day from Ekachakra, until Bhima came with the cart and ate it himself.',
    taunt: 'A cartload a day, and a villager. Today, a fighter.',
    superName: 'Ekachakra\'s Hunger',
    palette: { toigo_harem_pants: 0xe8e4d8 },
    look: { skin: 0x7a8494, eyes: 0xfff040, crest: true, aura: 'feathers' },
    kit: { signature: 'gore', speed: 1.25, dash: 1.4, defense: 1.08, blast: { speed: 9, size: 0.32, damage: 85, chip: 12, style: 'wind' } }
  }
];

/** A contender as the cast loader wants them. */
export function castDef(c: Contender): CharacterDef {
  return { id: `akhada-${c.id}`, name: c.name, alias: c.title, role: 'Fighter', bio: c.bio, faction: 'crew', model: c.model, palette: c.palette, accent: c.colour };
}
