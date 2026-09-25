import { PITCH, INTERSECTION } from './CityLayout';

/**
 * Chapter 1 of VORIXA City: HEAT (ADR-0014): five jobs that string every style together.
 *
 * | Job        | Style          | What happens |
 * |------------|----------------|--------------|
 * | Wheels     | GTA            | Steal the Choir's silver sports car, beat the clock to Kai's garage |
 * | Stash House| Counter-Strike | Clear the stash house crew, grab the cash |
 * | Loud Exit  | GTA / Rush     | Three stars of heat: lose the police |
 * | Tithe      | Mario          | Three star coins high over planters, against the clock |
 * | Cantor     | Contra         | A boss with a huge health pool and guards; headshots count |
 *
 * Each job is a storyboard briefing, a list of steps, and a storyboard outro. `JobRunner` walks
 * the steps against a small snapshot of the game (`JobContext`) and asks the game, through
 * `JobEvent`s, to set things up (spawn a crew, raise the heat, place coins). Pure and tested.
 */

export interface Panel {
  /** Crew id (see Crew.ts) or 'choir' for the villain's lines. */
  speaker: string;
  line: string;
}

export type Step =
  | { kind: 'goto'; text: string; x: number; z: number; radius: number; onFoot?: boolean }
  | { kind: 'steal'; text: string; x: number; z: number; heading: number; model: string }
  | { kind: 'deliver'; text: string; x: number; z: number; radius: number; time: number }
  | { kind: 'clear'; text: string; x: number; z: number; count: number }
  | { kind: 'escape'; text: string; stars: number }
  | { kind: 'collect'; text: string; coins: { x: number; y: number; z: number }[]; time: number }
  | { kind: 'boss'; text: string; x: number; z: number; guards: number };

export interface Job {
  id: string;
  title: string;
  /** Who gives the job (portrait on the objective panel). */
  giver: string;
  briefing: Panel[];
  steps: Step[];
  outro: Panel[];
  cash: number;
}

const P = PITCH;
const I = INTERSECTION / 2;
/** Star coins hang this high: out of reach from the street, in reach from a planter's top. */
export const COIN_HEIGHT = 2.6;
/** How close (3D, from the hero's middle) a coin must be to be taken. */
export const COIN_REACH = 0.6;

export const CHAPTER_ONE: readonly Job[] = [
  {
    id: 'wheels',
    title: 'Wheels',
    giver: 'kai',
    briefing: [
      { speaker: 'kai', line: 'The Choir parked their new toy on Second. Silver sports car. Nobody guards it, because nobody is that stupid.' },
      { speaker: 'vex', line: 'We are exactly that stupid.' },
      { speaker: 'kai', line: 'Then bring it to my garage before their spotters notice. You have ninety seconds.' }
    ],
    steps: [
      { kind: 'steal', text: 'Steal the Choir sports car', x: P + I + 14, z: P - 4.6, heading: Math.PI / 2, model: 'SportsCar2' },
      { kind: 'deliver', text: "Get it to Kai's garage", x: 2 * P + I + 16, z: 2 * P + 4.6, radius: 6, time: 90 }
    ],
    outro: [
      { speaker: 'kai', line: 'Not a scratch. Well. Some scratches. I will call them character.' },
      { speaker: 'choir', line: 'Someone took what belongs to the Choir. Find them.' }
    ],
    cash: 1500
  },
  {
    id: 'stash',
    title: 'Stash House',
    giver: 'rook',
    briefing: [
      { speaker: 'rook', line: 'Choir keep their take in a stash house off the middle intersection. Six guns on the door.' },
      { speaker: 'silas', line: 'Go in hard, stay behind the cars, and count your rounds.' }
    ],
    steps: [
      { kind: 'goto', text: 'Get to the stash house', x: P + 20, z: P + 20, radius: 14 },
      { kind: 'clear', text: 'Clear the stash house crew', x: P, z: P, count: 6 },
      { kind: 'goto', text: 'Grab the cash case', x: P + 4, z: P - 6, radius: 2.2, onFoot: true }
    ],
    outro: [{ speaker: 'rook', line: 'That is a lot of money for people who sing.' }],
    cash: 4000
  },
  {
    id: 'exit',
    title: 'Loud Exit',
    giver: 'silas',
    briefing: [
      { speaker: 'silas', line: 'The stash house had an alarm. Every patrol in the city is coming.' },
      { speaker: 'silas', line: 'Break line of sight. Keep moving. They cannot chase what they cannot see.' }
    ],
    steps: [{ kind: 'escape', text: 'Lose the police', stars: 3 }],
    outro: [{ speaker: 'silas', line: 'Clean. Almost elegant.' }],
    cash: 2500
  },
  {
    id: 'tithe',
    title: 'Tithe',
    giver: 'juno',
    briefing: [
      { speaker: 'juno', line: 'The Choir marks its collection points with gold stars. Three of them on this street.' },
      { speaker: 'juno', line: 'Up high, over the planters. Climb and jump for them. Sixty seconds before the collectors come.' }
    ],
    steps: [
      {
        kind: 'collect',
        text: 'Take the three gold stars',
        // Above three planters (see CityLayout), higher than a jump from the street reaches:
        // climb onto the planter and jump from there.
        coins: [
          { x: P / 2 - 6, y: COIN_HEIGHT, z: 7.4 },
          { x: P / 2 + 8, y: COIN_HEIGHT, z: -7.4 },
          { x: 7.4, y: COIN_HEIGHT, z: P / 2 - 6 }
        ],
        time: 60
      }
    ],
    outro: [{ speaker: 'juno', line: 'Three for three. They will be praying for their collection plate.' }],
    cash: 3000
  },
  {
    id: 'cantor',
    title: 'Cantor',
    giver: 'vex',
    briefing: [
      { speaker: 'choir', line: 'You took our car, our money and our stars. Come and take the street, if you can.' },
      { speaker: 'vex', line: 'Cantor runs this district. Heavy plate, heavy guns. Aim for the head.' },
      { speaker: 'rook', line: 'And kill the choirboys first.' }
    ],
    steps: [
      { kind: 'goto', text: 'Face Cantor at the far intersection', x: 2 * P - 16, z: 2 * P - 16, radius: 16 },
      { kind: 'boss', text: 'Take down Cantor', x: 2 * P, z: 2 * P, guards: 4 }
    ],
    outro: [
      { speaker: 'vex', line: 'Downtown is ours.' },
      { speaker: 'silas', line: 'For tonight. The Choir has more districts, and they will want this one back.' }
    ],
    cash: 10000
  }
];

/** What the job runner needs to know about the game. */
export interface JobContext {
  heroX: number;
  heroZ: number;
  /** The model of the car the hero is driving, or null on foot. */
  driving: string | null;
  /** The id the game gave the car it placed for a steal step, and whether the hero is in it. */
  inJobCar: boolean;
  choirAlive: number;
  stars: number;
  coinsTaken: number;
  bossAlive: boolean;
}

export type JobEvent =
  | { type: 'placeCar'; x: number; z: number; heading: number; model: string }
  | { type: 'spawnCrew'; x: number; z: number; count: number }
  | { type: 'setHeat'; stars: number }
  | { type: 'placeCoins'; coins: { x: number; y: number; z: number }[] }
  | { type: 'spawnBoss'; x: number; z: number; guards: number }
  | { type: 'step'; index: number; text: string }
  | { type: 'complete'; cash: number }
  | { type: 'failed'; reason: string };

export type JobState = 'active' | 'complete' | 'failed';

export class JobRunner {
  public step = -1;
  public state: JobState = 'active';
  /** Seconds left on a timed step, or null. */
  public timeLeft: number | null = null;
  public readonly events: JobEvent[] = [];
  private escapeStarted = false;

  public constructor(public readonly job: Job) {}

  public get current(): Step | null {
    return this.state === 'active' && this.step >= 0 ? this.job.steps[this.step] ?? null : null;
  }

  /** Where the objective marker goes, or null when there is no single place (escape, collect). */
  public get target(): { x: number; z: number } | null {
    const s = this.current;
    if (!s) return null;
    if (s.kind === 'goto' || s.kind === 'steal' || s.kind === 'deliver' || s.kind === 'clear' || s.kind === 'boss') return { x: s.x, z: s.z };
    return null;
  }

  public start(): void {
    this.events.length = 0;
    this.advance();
  }

  private advance(): void {
    this.step++;
    this.timeLeft = null;
    const s = this.job.steps[this.step];
    if (!s) {
      this.state = 'complete';
      this.events.push({ type: 'complete', cash: this.job.cash });
      return;
    }
    this.events.push({ type: 'step', index: this.step, text: s.text });
    switch (s.kind) {
      case 'steal':
        this.events.push({ type: 'placeCar', x: s.x, z: s.z, heading: s.heading, model: s.model });
        break;
      case 'deliver':
        this.timeLeft = s.time;
        break;
      case 'clear':
        this.events.push({ type: 'spawnCrew', x: s.x, z: s.z, count: s.count });
        break;
      case 'escape':
        this.escapeStarted = false;
        this.events.push({ type: 'setHeat', stars: s.stars });
        break;
      case 'collect':
        this.timeLeft = s.time;
        this.events.push({ type: 'placeCoins', coins: s.coins });
        break;
      case 'boss':
        this.events.push({ type: 'spawnBoss', x: s.x, z: s.z, guards: s.guards });
        break;
      case 'goto':
        break;
    }
  }

  public update(ctx: JobContext, dt: number): void {
    this.events.length = 0;
    const s = this.current;
    if (!s) return;
    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.state = 'failed';
        this.events.push({ type: 'failed', reason: s.kind === 'collect' ? 'The collectors arrived' : 'Out of time' });
        return;
      }
    }
    const near = (x: number, z: number, r: number) => Math.hypot(ctx.heroX - x, ctx.heroZ - z) <= r;
    let done = false;
    switch (s.kind) {
      case 'goto':
        done = near(s.x, s.z, s.radius) && (!s.onFoot || ctx.driving === null);
        break;
      case 'steal':
        done = ctx.inJobCar;
        break;
      case 'deliver':
        done = ctx.inJobCar && near(s.x, s.z, s.radius);
        break;
      case 'clear':
        done = ctx.choirAlive === 0;
        break;
      case 'escape':
        // It only counts once the heat has actually landed.
        if (ctx.stars > 0) this.escapeStarted = true;
        done = this.escapeStarted && ctx.stars === 0;
        break;
      case 'collect':
        done = ctx.coinsTaken >= s.coins.length;
        break;
      case 'boss':
        done = !ctx.bossAlive && ctx.choirAlive === 0;
        break;
    }
    if (done) this.advance();
  }
}
