/**
 * The people of VORIXA City: HEAT (ADR-0014): the playable crew, the Choir syndicate that runs the
 * city, the police, and the citizens. Pure data plus the rules for perks and unlocks.
 *
 * Every character is their own realistic person (`public/city/people/mh-*.glb`): a MakeHuman body
 * with its own skin, hair and clothes, built by `scripts/assets/blender/make-cast.py`. A palette
 * can still tint a garment (its material is named after the garment), which is how the police get
 * navy uniforms and each citizen a shirt of their own.
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
  /** Their colour on storyboard panels. */
  accent?: number;
  /** First-person arms: skin, and sleeve (the skin again when the sleeves stop above the elbow). */
  arms?: { skin: number; sleeve: number };
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
    id: 'vex', name: 'Vex Marlowe', alias: 'The Spark', role: 'Leader', faction: 'crew', model: 'mh-vex', perk: 'quickdraw', unlockAt: 0,
    bio: 'Grew up on these streets. Wants them back, and has the nerve to take them.',
    palette: {},
    accent: 0x7a5cf0,
    arms: { skin: 0xe0b394, sleeve: 0x4a5236 }
  },
  {
    id: 'rook', name: 'Rook Adeyemi', alias: 'The Wall', role: 'Enforcer', faction: 'crew', model: 'mh-rook', perk: 'tank', unlockAt: 0,
    bio: 'Ex-bouncer. Walks into gunfire so the rest of the crew can walk out of it.',
    palette: { 'elvs_crude_t-shirt_male': 0x9e1c28 },
    accent: 0xd0303c,
    arms: { skin: 0x5c3a28, sleeve: 0x5c3a28 }
  },
  {
    id: 'silas', name: 'Silas Crane', alias: 'The Planner', role: 'Mastermind', faction: 'crew', model: 'mh-silas', perk: 'focus', unlockAt: 0,
    bio: 'Never raises his voice. Never needs to. Sees the fight three moves ahead.',
    palette: {},
    accent: 0xc9a13a,
    arms: { skin: 0xe8c4a8, sleeve: 0x1a1a1e }
  },
  {
    id: 'mara', name: 'Mara Ostrova', alias: 'Wrench', role: 'Mechanic', faction: 'crew', model: 'mh-mara', perk: 'mechanic', unlockAt: 1,
    bio: 'Can strip a police cruiser in four minutes. Has, twice.',
    palette: {},
    accent: 0x2aa8a8,
    arms: { skin: 0xf0cdb0, sleeve: 0xf0cdb0 }
  },
  {
    id: 'juno', name: 'Juno Reyes', alias: 'Ghost', role: 'Sniper', faction: 'crew', model: 'mh-juno', perk: 'marksman', unlockAt: 2,
    bio: 'Three hundred metres, crosswind, one shot. She does not miss twice.',
    palette: {},
    accent: 0xe0338f,
    arms: { skin: 0xc99a78, sleeve: 0xc99a78 }
  },
  {
    id: 'kai', name: 'Kai Nakamura', alias: 'Drift', role: 'Wheelman', faction: 'crew', model: 'mh-kai', perk: 'wheelman', unlockAt: 3,
    bio: 'Drove getaway for the Choir until they stiffed him. Now he drives for you.',
    palette: { namuhekam_male_polo_shirt: 0xe89a2e },
    accent: 0xf2a33a,
    arms: { skin: 0xe0bb95, sleeve: 0xe0bb95 }
  },
  {
    id: 'dex', name: 'Dex Okafor', alias: 'Patch', role: 'Medic', faction: 'crew', model: 'mh-dex', perk: 'medic', unlockAt: 4,
    bio: 'Dropped out of med school to stitch up people who could not go to hospitals.',
    palette: {},
    accent: 0x3cb371,
    arms: { skin: 0x5a3a26, sleeve: 0x5a3a26 }
  },
  {
    id: 'mo', name: 'Mo Haddad', alias: 'Hammer', role: 'Breacher', faction: 'crew', model: 'mh-mo', perk: 'demolition', unlockAt: 5,
    bio: 'Opens doors. Usually with the door still attached to the wall.',
    palette: {},
    accent: 0xe5b021,
    arms: { skin: 0xd6a784, sleeve: 0xd6a784 }
  },
  {
    id: 'iris', name: 'Iris Vale', alias: 'Hex', role: 'Infiltrator', faction: 'crew', model: 'mh-iris', perk: 'ghost', unlockAt: 6,
    bio: 'Walks past a Choir checkpoint like she owns it. Some days she does.',
    palette: {},
    accent: 0x8a6cf0,
    arms: { skin: 0xeccaa8, sleeve: 0x8e2a2e }
  },
  {
    id: 'nova', name: 'Nova Laurent', alias: 'Silk', role: 'The Face', faction: 'crew', model: 'mh-nova', perk: 'smooth', unlockAt: 7,
    bio: 'Talks her way into rooms the crew has to shoot their way out of.',
    palette: {},
    accent: 0x1fc39a,
    arms: { skin: 0x6b4630, sleeve: 0x6b4630 }
  }
];

/** The Choir: the syndicate that owns the city. Black suits, and oxblood on the soldiers. */
export const CHOIR: readonly CharacterDef[] = [
  { id: 'choir-enforcer', name: 'Choir Enforcer', alias: '', role: 'Enforcer', bio: '', faction: 'choir', model: 'mh-choir-enforcer', palette: {} },
  {
    id: 'choir-soldier', name: 'Choir Soldier', alias: '', role: 'Soldier', bio: '', faction: 'choir', model: 'mh-choir-soldier',
    palette: { female_sportsuit01: 0x8a3a40 }
  },
  { id: 'choir-lieutenant', name: 'Choir Lieutenant', alias: '', role: 'Lieutenant', bio: '', faction: 'choir', model: 'mh-choir-lieutenant', palette: {} }
];

/** Cantor, who runs the Choir: old, heavy, and in a fedora. */
export const CANTOR: CharacterDef = {
  id: 'cantor', name: 'Cantor', alias: 'The Voice', role: 'Boss', bio: 'Owns the city by owning the people who run it.', faction: 'choir',
  model: 'mh-cantor', palette: {}
};

/** The police: navy polos and trousers. */
export const POLICE: CharacterDef = {
  id: 'police', name: 'Police', alias: '', role: 'Police', bio: '', faction: 'police', model: 'mh-police',
  palette: { namuhekam_male_polo_shirt: 0x2c3e62, toigo_wool_pants: 0x3a4250 }
};

/** Citizens: twelve people of every age and background, the plain garments tinted per person. */
export const CITIZEN_MODELS = Array.from({ length: 12 }, (_, i) => `mh-citizen-${i + 1}`);
const CLOTH = [0x3b5b8c, 0x8c3b3b, 0x3b8c5a, 0xc9a13a, 0x6a6a72, 0x2c2c34, 0xd9d4c7, 0x7a4a8c, 0x1f8a8a, 0xb35a2c];

/** Plain, light garments: the ones a tint reads well on. */
const CLOTH_MATERIALS = ['elvs_crude_t-shirt_male', 'namuhekam_male_polo_shirt', 'toigo_wool_pants', 'male_casualsuit01', 'male_casualsuit03', 'male_casualsuit06'];
/** The hero's own suit: a citizen wearing it is always recoloured, so nobody walks past as the hero's twin. */
const HERO_SUIT = 'male_casualsuit05';

function hash(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A citizen, deterministic per index: a person and everyday colours. */
export function citizen(n: number): CharacterDef {
  const model = CITIZEN_MODELS[Math.floor(hash(n, 1) * CITIZEN_MODELS.length)];
  const palette: Record<string, number> = {};
  CLOTH_MATERIALS.forEach((m, i) => {
    if (hash(n, 10 + i) < 0.6) palette[m] = CLOTH[Math.floor(hash(n, 30 + i) * CLOTH.length)];
  });
  palette[HERO_SUIT] = CLOTH[Math.floor(hash(n, 40) * CLOTH.length)];
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
