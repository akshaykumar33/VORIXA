import { PITCH, type Box } from './CityLayout';
import type { Combat, EnemyKind } from './Combat';
import type { Chaos, ExplosiveKind } from './Chaos';
import { raySphere } from './Combat';

/**
 * Choir outposts (ADR-0014, Far Cry layer): checkpoints the syndicate has thrown across the city's
 * roads, each to be taken back. Pure data and rules, stepped with the fight.
 *
 * An outpost is a road segment closed by concrete barriers, with sandbag nests, a patrol, stacks
 * of fuel (barrels and propane: the loud way in), and an **alarm** on a pole. Guards stand idle
 * until they spot the hero or hear something; once one is fighting, the outpost is **alerted** and
 * the alarm is raised after a few seconds, unless it is shot out first or nobody is left to raise
 * it. A ringing alarm brings **reinforcements** down the road. When the last guard falls the
 * outpost is **liberated**: cash, a bonus for never being seen, and one for keeping the alarm
 * quiet. Liberated outposts stay liberated.
 */

export type OutpostState = 'held' | 'alerted' | 'alarm' | 'liberated';

export interface GuardSpot {
  kind: Extract<EnemyKind, 'swat' | 'soldier'>;
  x: number;
  z: number;
  facing: number;
  /** A second point to walk between, for the patrol. */
  patrol?: { x: number; z: number };
}

export interface OutpostDef {
  id: string;
  name: string;
  x: number;
  z: number;
  /** 0: the road runs along x; 1: along z. */
  dir: 0 | 1;
  barricades: Box[];
  /** Sandbag walls: low cover, drawn differently from the concrete. */
  sandbags: Box[];
  explosives: { kind: ExplosiveKind; x: number; z: number }[];
  alarm: { x: number; z: number };
  /** Banner poles, for the colours flown over the outpost. */
  banners: { x: number; z: number }[];
  guards: GuardSpot[];
  /** Where reinforcements come from, down the road. */
  reinforce: { x: number; z: number };
}

/** Seconds from an outpost being alerted to the alarm ringing. */
export const ALARM_DELAY = 6;
/** Seconds from the alarm to reinforcements arriving. */
export const REINFORCE_DELAY = 7;
export const REINFORCEMENTS = 4;
export const REWARD = { base: 1500, undetected: 1500, quiet: 500 };
/** The alarm box on its pole: its height and the size of the target it makes. */
export const ALARM_HEIGHT = 1.55;
const ALARM_RADIUS = 0.3;

/** Road segment centres (in blocks) where the Choir have dug in: clear of the jobs and the spawn. */
const SITES: { name: string; i: number; j: number; dir: 0 | 1 }[] = [
  { name: 'Tollgate', i: 2.5, j: 0, dir: 0 },
  { name: 'Westside Checkpoint', i: 0, j: 2.5, dir: 1 },
  { name: 'North Line', i: 0.5, j: 3, dir: 0 },
  { name: 'The Throat', i: 3, j: 1.5, dir: 1 },
  { name: 'Hymn Yard', i: 2.5, j: 3, dir: 0 }
];

/** The outposts, the same every time: positions follow the district's block pitch. */
export function buildOutposts(P = PITCH): OutpostDef[] {
  return SITES.map((site, n) => {
    const cx = site.i * P;
    const cz = site.j * P;
    const dir = site.dir;
    // Road space (along the road, across it) to world space.
    const at = (along: number, across: number) => (dir === 0 ? { x: cx + along, z: cz + across } : { x: cx + across, z: cz + along });
    const box = (along: number, across: number, halfAlong: number, halfAcross: number, height: number): Box => {
      const c = at(along, across);
      const hx = dir === 0 ? halfAlong : halfAcross;
      const hz = dir === 0 ? halfAcross : halfAlong;
      return { minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz, height };
    };
    // Facing (yaw about y, 0 = +z) of "down the road" in each direction.
    const up = dir === 0 ? Math.PI / 2 : 0;
    const down = up + Math.PI;
    // Mirror every other outpost, so no two read the same from the street.
    const m = n % 2 === 0 ? 1 : -1;
    const barricades = [
      // Barriers across the asphalt at both ends, a gate gap in the middle.
      box(-9, -4.1, 0.3, 2.4, 1.05), box(-9, 4.1, 0.3, 2.4, 1.05),
      box(9, -4.1, 0.3, 2.4, 1.05), box(9, 4.1, 0.3, 2.4, 1.05)
    ];
    const sandbags = [box(-3.5, 4 * m, 0.35, 1.3, 1.0), box(3.5, -4 * m, 0.35, 1.3, 1.0)];
    const explosives: OutpostDef['explosives'] = [
      // Fuel by the alarm: shoot it and the alarm goes with it.
      { kind: 'barrel', ...at(-2, 7.6 * m) }, { kind: 'barrel', ...at(-1.25, 7.8 * m) }, { kind: 'barrel', ...at(-1.65, 7.0 * m) },
      { kind: 'propane', ...at(1.3, 7.8 * m) }, { kind: 'propane', ...at(1.8, 7.9 * m) },
      // And by the far nest.
      { kind: 'barrel', ...at(5, -7.6 * m) }, { kind: 'barrel', ...at(5.7, -7.3 * m) },
      { kind: 'barrel', ...at(3.5, -5.5 * m) }
    ];
    const guards: GuardSpot[] = [
      { kind: 'swat', ...at(-7.6, -1.2), facing: down },
      { kind: 'swat', ...at(7.6, 1.2), facing: up },
      // Behind the sandbags, looking out over them.
      { kind: 'soldier', ...at(-2.6, 4 * m), facing: down },
      { kind: 'soldier', ...at(2.6, -4 * m), facing: up },
      { kind: 'swat', ...at(-5.5, 0), facing: up, patrol: at(5.5, 0) },
      { kind: 'soldier', ...at(0.4, 6.4 * m), facing: m > 0 ? (dir === 0 ? Math.PI : -Math.PI / 2) : dir === 0 ? 0 : Math.PI / 2 }
    ];
    return {
      id: `outpost-${n + 1}`,
      name: site.name,
      x: cx,
      z: cz,
      dir,
      barricades,
      sandbags,
      explosives,
      alarm: at(0, 8.2 * m),
      banners: [at(-9.6, -7.2), at(9.6, 7.2)],
      guards,
      reinforce: at(26 * m, -2)
    };
  });
}

export type OutpostEvent =
  | { type: 'spotted'; outpost: OutpostDef }
  | { type: 'alarm'; outpost: OutpostDef }
  | { type: 'alarmDown'; outpost: OutpostDef }
  | { type: 'reinforcements'; outpost: OutpostDef; count: number }
  | { type: 'liberated'; outpost: OutpostDef; cash: number; undetected: boolean; quiet: boolean };

interface Live {
  def: OutpostDef;
  post: number;
  state: OutpostState;
  alarmIn: number;
  alarmAlive: boolean;
  /** Seconds until reinforcements arrive; negative when none are coming. */
  reinforceIn: number;
  detected: boolean;
  rang: boolean;
  patrolClock: number;
}

export class Outposts {
  public readonly events: OutpostEvent[] = [];
  private readonly live: Live[];

  /** @param liberated Outpost ids already taken back (saved progress). */
  public constructor(public readonly defs: readonly OutpostDef[], liberated: ReadonlySet<string> = new Set()) {
    this.live = defs.map((def, n) => ({
      def, post: n + 1, state: liberated.has(def.id) ? 'liberated' : 'held', alarmIn: -1, alarmAlive: true,
      reinforceIn: -1, detected: false, rang: false, patrolClock: n * 1.7
    }));
  }

  public stateOf(id: string): OutpostState {
    return this.live.find((l) => l.def.id === id)?.state ?? 'held';
  }

  public alarmStanding(id: string): boolean {
    return this.live.find((l) => l.def.id === id)?.alarmAlive ?? false;
  }

  /** Seconds until an alerted outpost's alarm rings (null when it is not counting down). */
  public alarmCountdown(id: string): number | null {
    const l = this.live.find((x) => x.def.id === id);
    return l && l.state === 'alerted' && l.alarmAlive ? Math.max(0, l.alarmIn) : null;
  }

  public get liberatedCount(): number {
    return this.live.filter((l) => l.state === 'liberated').length;
  }

  public get liberatedIds(): string[] {
    return this.live.filter((l) => l.state === 'liberated').map((l) => l.def.id);
  }

  /** The solid parts of every outpost (held or not: the barricades stay), for the colliders. */
  public get solids(): Box[] {
    return this.defs.flatMap((d) => [...d.barricades, ...d.sandbags]);
  }

  /** Mans every held outpost and stocks its fuel. */
  public populate(combat: Combat, chaos: Chaos): void {
    for (const l of this.live) {
      if (l.state === 'liberated') continue;
      for (const g of l.def.guards) combat.spawn(g.kind, g.x, g.z, g.facing, l.post);
      for (const e of l.def.explosives) chaos.place(e.kind, e.x, e.z);
    }
    // Liberated outposts keep their fuel: it is the crew's now, and still goes bang.
    for (const l of this.live) if (l.state === 'liberated') for (const e of l.def.explosives) chaos.place(e.kind, e.x, e.z);
  }

  /** The nearest standing alarm along a ray, within `max`. */
  public traceAlarm(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; id: string | null } {
    let best = max;
    let id: string | null = null;
    for (const l of this.live) {
      if (!l.alarmAlive) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, l.def.alarm.x, ALARM_HEIGHT, l.def.alarm.z, ALARM_RADIUS);
      if (t < best) {
        best = t;
        id = l.def.id;
      }
    }
    return { t: best, id };
  }

  /** The alarm is shot out (or blown up): it will not ring. */
  public breakAlarm(id: string): void {
    const l = this.live.find((x) => x.def.id === id);
    if (!l || !l.alarmAlive) return;
    l.alarmAlive = false;
    if (l.state === 'alarm') l.state = 'alerted';
    this.events.push({ type: 'alarmDown', outpost: l.def });
  }

  /** A blast takes out any alarm in its reach. */
  public blast(x: number, z: number, radius: number): void {
    for (const l of this.live) if (l.alarmAlive && Math.hypot(l.def.alarm.x - x, l.def.alarm.z - z) < radius * 0.8) this.breakAlarm(l.def.id);
  }

  public step(dt: number, combat: Combat): void {
    this.events.length = 0;
    for (const l of this.live) {
      if (l.state === 'liberated') continue;
      const guards = combat.enemies.filter((e) => e.post === l.post);
      const standing = guards.filter((e) => e.state !== 'dead');

      // The patrol walks its beat while nobody is looking for trouble.
      l.patrolClock += dt;
      if (l.state === 'held') {
        l.def.guards.forEach((g, n) => {
          const e = guards[n];
          if (!g.patrol || !e || e.state !== 'idle') return;
          const out = Math.floor(l.patrolClock / 8) % 2 === 1;
          e.homeX = out ? g.patrol.x : g.x;
          e.homeZ = out ? g.patrol.z : g.z;
        });
      }

      if (!l.detected && standing.some((e) => e.state === 'fight')) {
        l.detected = true;
        if (l.state === 'held') {
          l.state = 'alerted';
          l.alarmIn = ALARM_DELAY;
          this.events.push({ type: 'spotted', outpost: l.def });
        }
      }
      if (l.state === 'alerted' && l.alarmAlive && standing.length > 0) {
        l.alarmIn -= dt;
        if (l.alarmIn <= 0) {
          l.state = 'alarm';
          l.rang = true;
          l.reinforceIn = REINFORCE_DELAY;
          this.events.push({ type: 'alarm', outpost: l.def });
        }
      }
      if (l.reinforceIn > 0) {
        l.reinforceIn -= dt;
        if (l.reinforceIn <= 0) {
          const r = l.def.reinforce;
          for (let i = 0; i < REINFORCEMENTS; i++) {
            const e = combat.spawn(i === 3 ? 'soldier' : 'swat', r.x + (i % 2) * 1.6, r.z + Math.floor(i / 2) * 1.6, 0, l.post);
            e.state = 'alert';
            e.alertTimer = 0.4 + i * 0.2;
          }
          this.events.push({ type: 'reinforcements', outpost: l.def, count: REINFORCEMENTS });
        }
      }

      const coming = l.reinforceIn > 0;
      if (guards.length > 0 && standing.length === 0 && !coming) {
        l.state = 'liberated';
        const undetected = !l.detected;
        const quiet = !l.rang;
        const cash = REWARD.base + (undetected ? REWARD.undetected : 0) + (quiet ? REWARD.quiet : 0);
        this.events.push({ type: 'liberated', outpost: l.def, cash, undetected, quiet });
      }
    }
  }
}
