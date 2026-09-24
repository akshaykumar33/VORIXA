/**
 * VORIXA City's guns (ADR-0014): Counter-Strike-style handling in a pure, deterministic model.
 *
 * - **Magazines and reloads.** A reload takes time and can be interrupted by switching weapons;
 *   an empty magazine reloads itself when the trigger is pulled.
 * - **Spray patterns.** Automatic fire climbs, then sways, in a fixed pattern per gun, so recoil
 *   can be learned and controlled (the CS skill). The pattern resets when the trigger rests.
 * - **Accuracy.** A base spread that grows while moving and in the air and shrinks when aiming
 *   and standing still; the first shot of a burst is the most accurate.
 *
 * Angles are radians. A shot is an offset from the aim direction: `yaw` right, `pitch` up.
 */

export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Node name in `public/city/guns.glb`. */
  model: string;
  /** Real-world length in metres, for scaling the model. */
  length: number;
  damage: number;
  /** Seconds between shots. */
  interval: number;
  automatic: boolean;
  magazine: number;
  reserve: number;
  reloadTime: number;
  pellets: number;
  /** Spread (radians) standing still, hip fire; aiming multiplies it by `aimSpread`. */
  spread: number;
  aimSpread: number;
  /** Extra spread when moving at full speed. */
  moveSpread: number;
  /** Camera kick per shot, radians. */
  kick: number;
  /** Aiming field of view, degrees. */
  aimFov: number;
  range: number;
  headshot: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'Pistol', model: 'Pistol_1', length: 0.22, damage: 34, interval: 0.16, automatic: false,
    magazine: 12, reserve: 48, reloadTime: 1.3, pellets: 1, spread: 0.012, aimSpread: 0.4, moveSpread: 0.03,
    kick: 0.022, aimFov: 50, range: 90, headshot: 2.5
  },
  smg: {
    id: 'smg', name: 'SMG', model: 'SubmachineGun_1', length: 0.6, damage: 22, interval: 0.075, automatic: true,
    magazine: 30, reserve: 120, reloadTime: 1.8, pellets: 1, spread: 0.02, aimSpread: 0.55, moveSpread: 0.02,
    kick: 0.011, aimFov: 50, range: 70, headshot: 2
  },
  rifle: {
    id: 'rifle', name: 'Assault rifle', model: 'AssaultRifle_1', length: 0.95, damage: 36, interval: 0.1, automatic: true,
    magazine: 30, reserve: 90, reloadTime: 2.3, pellets: 1, spread: 0.008, aimSpread: 0.35, moveSpread: 0.05,
    kick: 0.016, aimFov: 42, range: 160, headshot: 3
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', model: 'Shotgun_1', length: 1.0, damage: 13, interval: 0.85, automatic: false,
    magazine: 6, reserve: 24, reloadTime: 2.6, pellets: 9, spread: 0.075, aimSpread: 0.75, moveSpread: 0.01,
    kick: 0.06, aimFov: 52, range: 35, headshot: 1.5
  },
  sniper: {
    id: 'sniper', name: 'Sniper rifle', model: 'SniperRifle_1', length: 1.2, damage: 115, interval: 1.4, automatic: false,
    magazine: 5, reserve: 20, reloadTime: 3, pellets: 1, spread: 0.08, aimSpread: 0.01, moveSpread: 0.1,
    kick: 0.07, aimFov: 18, range: 300, headshot: 2
  }
};

export const LOADOUT: readonly WeaponId[] = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'];

/**
 * The spray pattern for automatic fire, as (yaw, pitch) steps in units of the gun's `kick`:
 * straight up for the first shots, then a sway left and right near the top.
 */
const SPRAY: readonly [number, number][] = [
  [0, 0], [0, 1], [0.1, 1], [-0.1, 1.1], [0.2, 1], [0.1, 0.9], [-0.3, 0.8], [-0.6, 0.5],
  [-0.8, 0.3], [-0.5, 0.2], [0.3, 0.2], [0.8, 0.1], [1, 0.1], [0.6, 0], [-0.2, 0.1], [-0.8, 0],
  [-1, 0.1], [-0.6, 0], [0.2, 0.1], [0.8, 0]
];
/** Where each shot of a spray lands: the running sum of the steps, so the climb accumulates. */
const SPRAY_PATH: readonly [number, number][] = SPRAY.reduce<[number, number][]>((path, [y, p], i) => {
  const prev = i > 0 ? path[i - 1] : [0, 0];
  path.push([prev[0] + y, prev[1] + p]);
  return path;
}, []);

/** The pattern steps back one shot per this many seconds off the trigger. */
const SPRAY_RECOVERY = 0.06;

export interface Shot {
  /** Offsets from the aim direction, radians. */
  yaw: number;
  pitch: number;
}

export interface FireResult {
  shots: Shot[];
  /** Camera kick for this trigger pull, radians. */
  kickPitch: number;
  kickYaw: number;
}

export type WeaponEvent = 'fire' | 'dry' | 'reloadStart' | 'reloadEnd' | 'switch';

/** Deterministic noise, so a seeded fight replays exactly. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export class Arsenal {
  public current: WeaponId = 'pistol';
  public readonly ammo: Record<WeaponId, { mag: number; reserve: number }>;
  public reloading = 0;
  public cooldown = 0;
  public readonly events: WeaponEvent[] = [];
  private sprayIndex = 0;
  private sprayRest = 0;
  private triggerWasDown = false;
  private readonly random: () => number;

  public constructor(seed = 1, owned: readonly WeaponId[] = LOADOUT) {
    this.random = rng(seed);
    this.ammo = {} as Record<WeaponId, { mag: number; reserve: number }>;
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const w = WEAPONS[id];
      this.ammo[id] = owned.includes(id) ? { mag: w.magazine, reserve: w.reserve } : { mag: 0, reserve: 0 };
    }
  }

  public get def(): WeaponDef {
    return WEAPONS[this.current];
  }

  /** How far through a reload, 0..1; 0 when not reloading. */
  public get reloadProgress(): number {
    return this.reloading > 0 ? 1 - this.reloading / this.def.reloadTime : 0;
  }

  public select(id: WeaponId): void {
    if (id === this.current) return;
    this.current = id;
    // Switching cancels a reload and takes a moment to draw.
    this.reloading = 0;
    this.cooldown = Math.max(this.cooldown, 0.35);
    this.sprayIndex = 0;
    this.events.push('switch');
  }

  public reload(): void {
    const a = this.ammo[this.current];
    if (this.reloading > 0 || a.mag >= this.def.magazine || a.reserve <= 0) return;
    this.reloading = this.def.reloadTime;
    this.events.push('reloadStart');
  }

  /**
   * One simulation step of the trigger.
   * @param down Trigger held this step.
   * @param aiming Aiming down the sights.
   * @param moving 0 standing still … 1 at full speed.
   * @param airborne In the air: shots go wide.
   */
  public step(dt: number, down: boolean, aiming: boolean, moving: number, airborne: boolean): FireResult | null {
    this.events.length = 0;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const w = this.def;
    const a = this.ammo[this.current];

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const take = Math.min(w.magazine - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.events.push('reloadEnd');
      }
    }

    // The spray pattern walks back while the trigger rests.
    if (!down) {
      this.sprayRest += dt;
      while (this.sprayRest >= SPRAY_RECOVERY && this.sprayIndex > 0) {
        this.sprayRest -= SPRAY_RECOVERY;
        this.sprayIndex--;
      }
    } else this.sprayRest = 0;

    const pulled = down && !this.triggerWasDown;
    this.triggerWasDown = down;
    const wants = w.automatic ? down : pulled;
    if (!wants || this.cooldown > 0 || this.reloading > 0) return null;

    if (a.mag <= 0) {
      if (pulled) {
        this.events.push('dry');
        this.reload();
      }
      return null;
    }

    a.mag--;
    this.cooldown = w.interval;
    this.events.push('fire');

    const step = SPRAY[Math.min(this.sprayIndex, SPRAY.length - 1)];
    const where = SPRAY_PATH[Math.min(this.sprayIndex, SPRAY_PATH.length - 1)];
    this.sprayIndex++;
    const spread =
      w.spread * (aiming ? w.aimSpread : 1) + w.moveSpread * Math.min(1, moving) + (airborne ? w.spread * 4 + 0.04 : 0);
    const shots: Shot[] = [];
    for (let p = 0; p < w.pellets; p++) {
      // Uniform in a disc: the square root keeps pellets from clumping in the middle.
      const r = spread * Math.sqrt(this.random());
      const t = this.random() * Math.PI * 2;
      // The pattern moves the shot with the kick for automatic fire; single shots only kick.
      const patternYaw = w.automatic ? where[0] * w.kick * 0.5 : 0;
      const patternPitch = w.automatic ? where[1] * w.kick * 0.5 : 0;
      shots.push({ yaw: patternYaw + Math.cos(t) * r, pitch: patternPitch + Math.sin(t) * r });
    }
    const kickYaw = w.automatic ? step[0] * w.kick * 0.6 : (this.random() - 0.5) * w.kick * 0.4;
    return { shots, kickPitch: w.kick * (aiming ? 0.7 : 1), kickYaw };
  }

  /** Picks up ammunition for a weapon, e.g. from a crate or a fallen enemy. */
  public addAmmo(id: WeaponId, rounds: number): void {
    this.ammo[id].reserve += rounds;
  }
}
