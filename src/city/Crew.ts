/**
 * The people of VORIXA City: HEAT (ADR-0014): the playable crew, the Choir syndicate that runs the
 * city, the police, and the citizens. Pure data plus the rules for perks and unlocks.
 *
 * Every character is one of the Ultimate Modular outfits (`public/city/people`) dressed in its own
 * palette: a map from the outfit's material names to colours. That is what lets thirteen outfits
 * become a cast of distinct people rather than thirteen clones.
 */

export type Faction = 'crew' | 'choir' | 'police' | 'citizen';

export type PerkId = 'quickdraw' | 'tank' | 'focus' | 'mechanic' | 'marksman' | 'wheelman' | 'medic' | 'demolition' | 'ghost' | 'smooth';

export interface CharacterDef {
  id: string;
  name: string;
  alias: string;
  role: string;
  /** One line of who they are, for the Safehouse. */
  bio: string;
  faction: Faction;
  /** File in public/city/people, without the extension. */
  model: string;
  /** Material name → colour. Materials not listed keep the outfit's own colour. */
  palette: Record<string, number>;
  perk?: PerkId;
  /** Waves cleared before this crew member joins; 0 means from the start. */
  unlockAt?: number;
}

export const PERKS: Record<PerkId, { name: string; text: string }> = {
  quickdraw: { name: 'Quickdraw', text: 'Reloads 35% faster' },
  tank: { name: 'Plated', text: 'Double armour' },
  focus: { name: 'Focus', text: 'Time slows while aiming' },
  mechanic: { name: 'Mechanic', text: 'Cars take half damage and patch themselves up' },
  marksman: { name: 'Marksman', text: 'Headshots hit 50% harder' },
  wheelman: { name: 'Wheelman', text: 'Cars 15% faster, sharper drifts' },
  medic: { name: 'Field medic', text: 'Health regrows all the way' },
  demolition: { name: 'Breacher', text: 'Shotgun and SMG hit 30% harder' },
  ghost: { name: 'Ghost', text: 'Enemies take longer to spot you' },
  smooth: { name: 'Smooth', text: 'Starts every job with extra ammo' }
};

/** The crew: who you can play. Colours are sRGB hex. */
export const CREW: readonly CharacterDef[] = [
  {
    id: 'vex', name: 'Vex Marlowe', alias: 'The Spark', role: 'Leader', faction: 'crew', model: 'm-casual_hoodie', perk: 'quickdraw', unlockAt: 0,
    bio: 'Grew up on these streets. Wants them back, and has the nerve to take them.',
    palette: { Purple: 0x5a3fd0, LightBlue: 0x1c2436, White: 0xe8e6e1, Hair: 0x1e1612 }
  },
  {
    id: 'rook', name: 'Rook Adeyemi', alias: 'The Wall', role: 'Enforcer', faction: 'crew', model: 'm-punk', perk: 'tank', unlockAt: 0,
    bio: 'Ex-bouncer. Walks into gunfire so the rest of the crew can walk out of it.',
    palette: { Red: 0xb3202c, Red_Dark: 0x5a1219, Black: 0x17171a, LightBlue: 0x23262e, Skin: 0x7a5238 }
  },
  {
    id: 'silas', name: 'Silas Crane', alias: 'The Planner', role: 'Mastermind', faction: 'crew', model: 'm-suit', perk: 'focus', unlockAt: 0,
    bio: 'Never raises his voice. Never needs to. Sees the fight three moves ahead.',
    palette: { Suit: 0x1f2a3d, Tie: 0xc9a13a, Black: 0x121316, White: 0xf2efe8, Hair: 0x2a2a2e }
  },
  {
    id: 'mara', name: 'Mara Ostrova', alias: 'Wrench', role: 'Mechanic', faction: 'crew', model: 'f-worker', perk: 'mechanic', unlockAt: 1,
    bio: 'Can strip a police cruiser in four minutes. Has, twice.',
    palette: { Worker_Vest: 0x1f8a8a, Worker_Yellow: 0x2a2f3a, Hair_Brown: 0xb3431f, Black: 0x1a1a1e }
  },
  {
    id: 'juno', name: 'Juno Reyes', alias: 'Ghost', role: 'Sniper', faction: 'crew', model: 'f-punk', perk: 'marksman', unlockAt: 2,
    bio: 'Three hundred metres, crosswind, one shot. She does not miss twice.',
    palette: { Pink: 0xe0338f, Black: 0x141418, Hair_Brown: 0x16141a, Skin: 0xb8865c }
  },
  {
    id: 'kai', name: 'Kai Nakamura', alias: 'Drift', role: 'Wheelman', faction: 'crew', model: 'm-beach', perk: 'wheelman', unlockAt: 3,
    bio: 'Drove getaway for the Choir until they stiffed him. Now he drives for you.',
    palette: { Red_Dark: 0xf2a33a, LightBrown: 0x2c3e50, Hair: 0x121212, Skin: 0xd8b48c }
  },
  {
    id: 'dex', name: 'Dex Okafor', alias: 'Patch', role: 'Medic', faction: 'crew', model: 'm-casual_2', perk: 'medic', unlockAt: 4,
    bio: 'Dropped out of med school to stitch up people who could not go to hospitals.',
    palette: { Red_Dark: 0x2e8b57, LightBrown: 0xd9d4c7, LightBlue: 0x243447, Skin: 0x5c3a24, Skin_Darker: 0x4e3120 }
  },
  {
    id: 'mo', name: 'Mo Haddad', alias: 'Hammer', role: 'Breacher', faction: 'crew', model: 'm-worker', perk: 'demolition', unlockAt: 5,
    bio: 'Opens doors. Usually with the door still attached to the wall.',
    palette: { Worker_Vest: 0x3a3f47, Worker_Yellow: 0xe5b021, Moustache: 0x2a1a10 }
  },
  {
    id: 'iris', name: 'Iris Vale', alias: 'Hex', role: 'Infiltrator', faction: 'crew', model: 'f-casual', perk: 'ghost', unlockAt: 6,
    bio: 'Walks past a Choir checkpoint like she owns it. Some days she does.',
    palette: { Orange: 0x6c4ad6, White: 0x1d1d24, Grey: 0x2c2c34, Hair_Blond: 0xd8d8e8, Hair_Brown: 0xd8d8e8 }
  },
  {
    id: 'nova', name: 'Nova Laurent', alias: 'Silk', role: 'The Face', faction: 'crew', model: 'f-formal', perk: 'smooth', unlockAt: 7,
    bio: 'Talks her way into rooms the crew has to shoot their way out of.',
    palette: { Red: 0x0f5c4a, Gold: 0xd9b25a, LimeGreen: 0x0b3b30, Brown: 0x1a120c }
  }
];

/** The Choir: the syndicate that owns the city. Black and red, and a red visor. */
export const CHOIR: readonly CharacterDef[] = [
  {
    id: 'choir-enforcer', name: 'Choir Enforcer', alias: '', role: 'Enforcer', bio: '', faction: 'choir', model: 'm-swat',
    palette: { Swat: 0x1c1c22, Swat_Black: 0x0d0d10, Visor: 0xc01828, Grey: 0x2a1a1e }
  },
  {
    id: 'choir-soldier', name: 'Choir Soldier', alias: '', role: 'Soldier', bio: '', faction: 'choir', model: 'f-soldier',
    palette: { Swat: 0x2a1c20, Black: 0x0d0d10, Grey: 0x5a1a22 }
  },
  {
    id: 'choir-lieutenant', name: 'Choir Lieutenant', alias: '', role: 'Lieutenant', bio: '', faction: 'choir', model: 'm-suit',
    palette: { Suit: 0xe9e4da, Tie: 0xb01828, Black: 0x16161a, White: 0x111114 }
  }
];

/** The police: the outfits as they come, in blue-grey kit. */
export const POLICE: CharacterDef = {
  id: 'police', name: 'Police', alias: '', role: 'Police', bio: '', faction: 'police', model: 'm-swat',
  palette: { Swat: 0x28374f, Swat_Black: 0x141a24 }
};

/** Citizens: every outfit, each a few palettes of everyday colours, picked per person. */
export const CITIZEN_MODELS = ['m-casual_2', 'm-casual_hoodie', 'm-beach', 'm-worker', 'm-suit', 'f-casual', 'f-formal', 'f-suit', 'f-worker', 'f-punk', 'm-punk'];
const CLOTH = [0x3b5b8c, 0x8c3b3b, 0x3b8c5a, 0xc9a13a, 0x6a6a72, 0x2c2c34, 0xd9d4c7, 0x7a4a8c, 0x1f8a8a, 0xb35a2c];
const SKIN = [0xf1c9a5, 0xd8a67c, 0xb8865c, 0x8d5a3b, 0x5c3a24];
const HAIR = [0x16141a, 0x3b2a1e, 0x6b4a2a, 0xb38a4a, 0x8a8a8a];

/** Cloth materials per outfit: what a citizen's palette recolours. */
const CLOTH_MATERIALS = ['Purple', 'LightBlue', 'Red', 'Red_Dark', 'LightBrown', 'Orange', 'Pink', 'Suit', 'Tie', 'Worker_Vest', 'White', 'Grey', 'Black', 'LimeGreen'];

function hash(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A citizen, deterministic per index: an outfit and everyday colours. */
export function citizen(n: number): CharacterDef {
  const model = CITIZEN_MODELS[Math.floor(hash(n, 1) * CITIZEN_MODELS.length)];
  const palette: Record<string, number> = {
    Skin: SKIN[Math.floor(hash(n, 2) * SKIN.length)],
    Hair: HAIR[Math.floor(hash(n, 3) * HAIR.length)],
    Hair_Brown: HAIR[Math.floor(hash(n, 3) * HAIR.length)],
    Hair_Blond: HAIR[Math.floor(hash(n, 3) * HAIR.length)]
  };
  CLOTH_MATERIALS.forEach((m, i) => {
    if (hash(n, 10 + i) < 0.6) palette[m] = CLOTH[Math.floor(hash(n, 30 + i) * CLOTH.length)];
  });
  return { id: `citizen-${n}`, name: 'Citizen', alias: '', role: 'Citizen', bio: '', faction: 'citizen', model, palette };
}

/** Everyone who can be chosen after clearing `wavesCleared` waves. */
export function unlocked(wavesCleared: number): CharacterDef[] {
  return CREW.filter((c) => (c.unlockAt ?? 0) <= wavesCleared);
}

/** Numbers the game applies for a perk. Neutral values when there is none. */
export interface PerkEffects {
  reloadTime: number;
  armorMax: number;
  bulletTimeWhenAiming: boolean;
  carDamage: number;
  carRepair: boolean;
  headshot: number;
  carSpeed: number;
  regenCap: number;
  closeDamage: number;
  spotDelay: number;
  bonusAmmo: number;
}

export function perkEffects(perk: PerkId | undefined): PerkEffects {
  const e: PerkEffects = {
    reloadTime: 1, armorMax: 50, bulletTimeWhenAiming: false, carDamage: 1, carRepair: false, headshot: 1,
    carSpeed: 1, regenCap: 50, closeDamage: 1, spotDelay: 1, bonusAmmo: 0
  };
  switch (perk) {
    case 'quickdraw': e.reloadTime = 0.65; break;
    case 'tank': e.armorMax = 100; break;
    case 'focus': e.bulletTimeWhenAiming = true; break;
    case 'mechanic': e.carDamage = 0.5; e.carRepair = true; break;
    case 'marksman': e.headshot = 1.5; break;
    case 'wheelman': e.carSpeed = 1.15; break;
    case 'medic': e.regenCap = 100; break;
    case 'demolition': e.closeDamage = 1.3; break;
    case 'ghost': e.spotDelay = 2.2; break;
    case 'smooth': e.bonusAmmo = 1; break;
  }
  return e;
}
