/**
 * The garage: what coins buy.
 *
 * Upgrades make the car tougher and faster in ways the player can feel in the first few seconds
 * of a run; weapons change *how* you fight, which is where the Contra flavour comes from — the
 * spread gun that fills the screen, the laser that punches through a line of drones.
 *
 * Nothing here is required to finish the World Tour: the base car can do it. Upgrades make it
 * more forgiving and weapons make it more fun, which is the right side of pay-with-play.
 *
 * Pure rules and prices; the simulation reads `statsFor(loadout)` and nothing else.
 */

export type UpgradeId = 'armor' | 'nitroTank' | 'rapidFire' | 'magnet' | 'handling';
export type WeaponId = 'blaster' | 'spread' | 'laser';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** One line per level, so the shop can say exactly what the next purchase does. */
  levels: string[];
  costs: number[];
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  cost: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'armor', name: 'Armor Plating', levels: ['+1 heart (4 total)', '+1 heart (5 total)', 'Shield bubble at the start of every run'], costs: [150, 400, 800] },
  { id: 'nitroTank', name: 'Nitro Tank', levels: ['Nitro lasts 25% longer', 'Nitro lasts 50% longer', 'Start every run with a full tank'], costs: [120, 300, 650] },
  { id: 'rapidFire', name: 'Rapid Fire', levels: ['Fire 15% faster', 'Fire 30% faster', 'Fire 45% faster'], costs: [120, 300, 650] },
  { id: 'magnet', name: 'Coin Magnet', levels: ['3 s magnet at the start', '6 s magnet at the start', 'Magnet after every crate you smash'], costs: [100, 250, 550] },
  { id: 'handling', name: 'Handling', levels: ['Lane changes 15% quicker', 'Lane changes 30% quicker', 'Lane changes 45% quicker'], costs: [100, 250, 550] }
];

export const WEAPONS: readonly WeaponDef[] = [
  { id: 'blaster', name: 'Twin Blaster', description: 'Reliable, homing, never runs dry.', cost: 0 },
  { id: 'spread', name: 'Spread Gun', description: 'Three shots in a fan. Fills the road with trouble.', cost: 500 },
  { id: 'laser', name: 'Laser', description: 'Fast beam that pierces through a whole line of enemies.', cost: 900 }
];

export interface Loadout {
  upgrades: Record<UpgradeId, number>;
  owned: WeaponId[];
  equipped: WeaponId;
}

export function defaultLoadout(): Loadout {
  return {
    upgrades: { armor: 0, nitroTank: 0, rapidFire: 0, magnet: 0, handling: 0 },
    owned: ['blaster'],
    equipped: 'blaster'
  };
}

/** What the simulation needs to know about the car. */
export interface CarStats {
  maxHearts: number;
  /** Multiplier on how long a full nitro tank lasts. */
  nitroCapacity: number;
  startNitro: number;
  /** Multiplier on the time between shots (lower is faster). */
  fireInterval: number;
  /** Multiplier on lane-change speed. */
  handling: number;
  startMagnet: number;
  startShield: boolean;
  magnetOnSmash: boolean;
  weapon: WeaponId;
}

export function statsFor(l: Loadout): CarStats {
  const u = l.upgrades;
  return {
    maxHearts: 3 + Math.min(u.armor, 2),
    startShield: u.armor >= 3,
    nitroCapacity: 1 + Math.min(u.nitroTank, 2) * 0.25,
    startNitro: u.nitroTank >= 3 ? 1 : 0.5,
    fireInterval: 1 - u.rapidFire * 0.15,
    handling: 1 + u.handling * 0.15,
    startMagnet: [0, 3, 6, 6][u.magnet],
    magnetOnSmash: u.magnet >= 3,
    weapon: l.owned.includes(l.equipped) ? l.equipped : 'blaster'
  };
}

export type Purchase = { ok: true; cost: number } | { ok: false; reason: string };

/** What buying the next level of an upgrade would cost, or why it can't be bought. */
export function upgradeQuote(l: Loadout, id: UpgradeId, bank: number): Purchase {
  const def = UPGRADES.find((u) => u.id === id)!;
  const level = l.upgrades[id];
  if (level >= def.costs.length) return { ok: false, reason: 'Fully upgraded' };
  const cost = def.costs[level];
  if (bank < cost) return { ok: false, reason: `Needs ${cost - bank} more coins` };
  return { ok: true, cost };
}

export function weaponQuote(l: Loadout, id: WeaponId, bank: number): Purchase {
  if (l.owned.includes(id)) return { ok: false, reason: 'Owned' };
  const cost = WEAPONS.find((w) => w.id === id)!.cost;
  if (bank < cost) return { ok: false, reason: `Needs ${cost - bank} more coins` };
  return { ok: true, cost };
}

/** Applies a purchase; returns the coins spent (0 if refused). Mutates the loadout. */
export function buyUpgrade(l: Loadout, id: UpgradeId, bank: number): number {
  const q = upgradeQuote(l, id, bank);
  if (!q.ok) return 0;
  l.upgrades[id]++;
  return q.cost;
}

export function buyWeapon(l: Loadout, id: WeaponId, bank: number): number {
  const q = weaponQuote(l, id, bank);
  if (!q.ok) return 0;
  l.owned.push(id);
  l.equipped = id;
  return q.cost;
}

export function equip(l: Loadout, id: WeaponId): boolean {
  if (!l.owned.includes(id)) return false;
  l.equipped = id;
  return true;
}

const LOADOUT_KEY = 'vorixa.rush.loadout';

export function loadLoadout(): Loadout {
  const base = defaultLoadout();
  try {
    const raw = window.localStorage.getItem(LOADOUT_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Loadout>;
    for (const def of UPGRADES) {
      const level = Number(parsed.upgrades?.[def.id]);
      if (Number.isInteger(level)) base.upgrades[def.id] = Math.max(0, Math.min(def.costs.length, level));
    }
    const valid = (w: unknown): w is WeaponId => WEAPONS.some((d) => d.id === w);
    if (Array.isArray(parsed.owned)) base.owned = ['blaster', ...parsed.owned.filter(valid).filter((w) => w !== 'blaster')];
    if (valid(parsed.equipped) && base.owned.includes(parsed.equipped)) base.equipped = parsed.equipped;
    return base;
  } catch {
    return base;
  }
}

export function saveLoadout(l: Loadout): void {
  try {
    window.localStorage.setItem(LOADOUT_KEY, JSON.stringify(l));
  } catch {
    // Purchases last for this visit only.
  }
}
