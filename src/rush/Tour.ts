import type { BiomeId } from './Zones';

/**
 * World Tour: the story mode.
 *
 * Baron Buzz has stolen the Golden Wheel and sent his drones out over every road. Six worlds, each
 * with its own motto and guardian, each a handful of stages ending in a boss. Like a Mario world,
 * every stage has something to find: three star coins tucked into awkward places, and in some a
 * golden crate that hides a warp to a secret stage.
 *
 * Pure data and rules. The simulation plays a stage; this decides what stages exist, what counts
 * as clearing one, what is unlocked, and what the player has earned.
 */

export type GoalKind = 'finish' | 'coins' | 'drones' | 'noCrash' | 'time';

export interface StageGoal {
  kind: GoalKind;
  /** Coins to collect, drones to blast, or seconds to beat. Unused for finish and noCrash. */
  target: number;
}

export interface StageDef {
  /** Stable across releases: progress is saved against it. */
  id: string;
  world: number;
  name: string;
  /** Metres to the finish flag. Boss stages end when the boss falls instead. */
  length: number;
  goal: StageGoal;
  /** 0 (gentle) to 1 (everything at once). */
  difficulty: number;
  seed: number;
  /** A golden crate hides a warp to this world's secret stage. */
  hasSecret: boolean;
  boss: boolean;
  /** Secret stages are hidden on the map until their warp is found. */
  secret: boolean;
}

export interface WorldDef {
  index: number;
  biome: BiomeId;
  name: string;
  motto: string;
  guardian: string;
  /** What the guardian says before the first stage: a line of story. */
  intro: string;
  /** Stars needed, in total, to open this world. */
  starsToUnlock: number;
  stages: StageDef[];
}

export function goalText(goal: StageGoal): string {
  switch (goal.kind) {
    case 'finish':
      return 'Reach the finish flag';
    case 'coins':
      return `Collect ${goal.target} coins`;
    case 'drones':
      return `Blast ${goal.target} drones`;
    case 'noCrash':
      return 'Finish without a single crash';
    case 'time':
      return `Finish in under ${goal.target} seconds`;
  }
}

interface WorldSketch {
  biome: BiomeId;
  name: string;
  motto: string;
  guardian: string;
  intro: string;
  stages: [string, number, StageGoal][];
  boss: string;
  secretName: string;
  /** Stage (0-based) that hides the golden crate. */
  secretIn: number;
}

const SKETCHES: WorldSketch[] = [
  {
    biome: 'meadow', name: 'Sunny Meadow', motto: 'Every road starts with a wave.', guardian: 'Farmer Bea',
    intro: 'Baron Buzz snatched the Golden Wheel and his bee-drones are loose in my fields! Chase them off, driver.',
    stages: [
      ['Windmill Way', 900, { kind: 'finish', target: 0 }],
      ['Haystack Hop', 1100, { kind: 'coins', target: 60 }],
      ['Barnyard Blitz', 1200, { kind: 'drones', target: 3 }]
    ],
    boss: 'Queen Buzzbot', secretName: 'Clover Cloud', secretIn: 1
  },
  {
    biome: 'desert', name: 'Cactus Canyon', motto: 'Hot wheels, cool head.', guardian: 'Sheriff Sol',
    intro: 'Them saucers have been buzzing my canyon since sunup. Keep your cool out there — the road bites.',
    stages: [
      ['Tumbleweed Trail', 1100, { kind: 'finish', target: 0 }],
      ['Mesa Mayhem', 1200, { kind: 'noCrash', target: 0 }],
      ['Sunset Stampede', 1300, { kind: 'time', target: 42 }]
    ],
    boss: 'The Sand Saucer', secretName: 'Oasis Run', secretIn: 2
  },
  {
    biome: 'snow', name: 'Frosty Peaks', motto: 'Slide with style.', guardian: 'Pip the Penguin',
    intro: 'Brr! The Baron froze our lift and stole our cocoa. Style points count up here — show some flair!',
    stages: [
      ['Snowman Slalom', 1200, { kind: 'coins', target: 80 }],
      ['Igloo Express', 1300, { kind: 'drones', target: 5 }],
      ['Avalanche Alley', 1400, { kind: 'noCrash', target: 0 }]
    ],
    boss: 'Blizzard Bot', secretName: 'Aurora Loop', secretIn: 0
  },
  {
    biome: 'candy', name: 'Sugar Rush', motto: "Life's sweeter at full speed.", guardian: 'Lolly',
    intro: 'Somebody is licking all the lollipops and it is DEFINITELY the Baron. Go go go, faster is sweeter!',
    stages: [
      ['Gumdrop Gulch', 1300, { kind: 'time', target: 44 }],
      ['Cupcake Canyon', 1400, { kind: 'coins', target: 100 }],
      ['Candy Cane Chase', 1500, { kind: 'drones', target: 6 }]
    ],
    boss: 'Sir Sprinkles', secretName: 'Sugar Cloud', secretIn: 1
  },
  {
    biome: 'neon', name: 'Neon Nights', motto: 'The city never brakes.', guardian: 'DJ Volt',
    intro: "The Baron's UFOs jammed my broadcast. Crank it up — this city runs on speed and bass.",
    stages: [
      ['Billboard Boulevard', 1400, { kind: 'noCrash', target: 0 }],
      ['Ferris Wheel Freeway', 1500, { kind: 'drones', target: 8 }],
      ['Midnight Express', 1600, { kind: 'time', target: 48 }]
    ],
    boss: 'Mothership Zero', secretName: 'Hyperlane', secretIn: 2
  },
  {
    biome: 'beach', name: 'Coconut Coast', motto: 'Ride the tide home.', guardian: 'Captain Crab',
    intro: "The Baron's hideout is out past the lighthouse, and the Golden Wheel with it. This is it, matey.",
    stages: [
      ['Palm Tree Parade', 1500, { kind: 'coins', target: 120 }],
      ['Lighthouse Leap', 1600, { kind: 'noCrash', target: 0 }],
      ['Tidal Wave Run', 1700, { kind: 'drones', target: 10 }]
    ],
    boss: 'Baron Buzz', secretName: 'Treasure Cove', secretIn: 0
  }
];

/** Stars needed to open each world: enough that a world must be played properly, not rushed. */
const UNLOCK = [0, 5, 12, 20, 28, 36];

function buildTour(): WorldDef[] {
  return SKETCHES.map((w, wi) => {
    const stages: StageDef[] = w.stages.map(([name, length, goal], si) => ({
      id: `w${wi + 1}-${si + 1}`,
      world: wi,
      name,
      length,
      goal,
      difficulty: Math.min(0.08 + wi * 0.16 + si * 0.05, 1),
      seed: 1000 * (wi + 1) + si * 97 + 13,
      hasSecret: si === w.secretIn,
      boss: false,
      secret: false
    }));
    stages.push({
      id: `w${wi + 1}-boss`,
      world: wi,
      name: w.boss,
      length: 0,
      goal: { kind: 'finish', target: 0 },
      difficulty: Math.min(0.2 + wi * 0.16, 1),
      seed: 1000 * (wi + 1) + 777,
      hasSecret: false,
      boss: true,
      secret: false
    });
    stages.push({
      id: `w${wi + 1}-secret`,
      world: wi,
      name: w.secretName,
      length: 800,
      goal: { kind: 'coins', target: 150 },
      difficulty: 0.05,
      seed: 1000 * (wi + 1) + 555,
      hasSecret: false,
      boss: false,
      secret: true
    });
    return {
      index: wi,
      biome: w.biome,
      name: w.name,
      motto: w.motto,
      guardian: w.guardian,
      intro: w.intro,
      starsToUnlock: UNLOCK[wi],
      stages
    };
  });
}

export const TOUR: readonly WorldDef[] = buildTour();

export function findStage(id: string): StageDef | null {
  for (const w of TOUR) for (const s of w.stages) if (s.id === id) return s;
  return null;
}

// ─── Progress ─────────────────────────────────────────────────────────────────────────────────

/** What a player has earned on one stage. Only ever improves: a worse run never takes it away. */
export interface StageRecord {
  cleared: boolean;
  goalMet: boolean;
  /** Which of the three star coins were collected, as bits. */
  starCoins: number;
  bestScore: number;
}

export interface TourProgress {
  stages: Record<string, StageRecord>;
  /** Secret stages whose warps have been found. */
  secrets: string[];
  /** Coins banked across the tour, for the garage shop. */
  bank: number;
}

export function emptyProgress(): TourProgress {
  return { stages: {}, secrets: [], bank: 0 };
}

export function bitCount(bits: number): number {
  let n = 0;
  for (let b = bits; b; b >>= 1) n += b & 1;
  return n;
}

/**
 * Stars on a stage, out of three: one for clearing it, one for its goal, one for all three star
 * coins. Three distinct things to go back for, which is what makes replaying a stage worth it.
 */
export function starsFor(record: StageRecord | undefined): number {
  if (!record || !record.cleared) return 0;
  return 1 + (record.goalMet ? 1 : 0) + (bitCount(record.starCoins) === 3 ? 1 : 0);
}

export function totalStars(progress: TourProgress): number {
  let total = 0;
  for (const record of Object.values(progress.stages)) total += starsFor(record);
  return total;
}

export function worldUnlocked(progress: TourProgress, world: number): boolean {
  if (world === 0) return true;
  const previousBoss = TOUR[world - 1].stages.find((s) => s.boss);
  const bossBeaten = previousBoss ? progress.stages[previousBoss.id]?.cleared === true : true;
  return bossBeaten && totalStars(progress) >= TOUR[world].starsToUnlock;
}

/**
 * Stages open in order within a world, the boss after all regular stages are cleared, and a
 * secret stage only once its warp has been found.
 */
export function stageUnlocked(progress: TourProgress, stage: StageDef): boolean {
  if (!worldUnlocked(progress, stage.world)) return false;
  const world = TOUR[stage.world];
  if (stage.secret) return progress.secrets.includes(stage.id);
  const regular = world.stages.filter((s) => !s.boss && !s.secret);
  if (stage.boss) return regular.every((s) => progress.stages[s.id]?.cleared);
  const index = regular.indexOf(stage);
  return index <= 0 || progress.stages[regular[index - 1].id]?.cleared === true;
}

export interface StageResult {
  cleared: boolean;
  goalMet: boolean;
  starCoins: number;
  score: number;
  coins: number;
  foundSecret: boolean;
}

/** Folds a finished attempt into progress. Returns what is new, for the celebration. */
export function recordResult(progress: TourProgress, stage: StageDef, result: StageResult): { newStars: number; newSecret: boolean } {
  const before = starsFor(progress.stages[stage.id]);
  const old = progress.stages[stage.id] ?? { cleared: false, goalMet: false, starCoins: 0, bestScore: 0 };
  // Star coins collected on a failed run still count: finding one is the achievement.
  progress.stages[stage.id] = {
    cleared: old.cleared || result.cleared,
    goalMet: old.goalMet || (result.cleared && result.goalMet),
    starCoins: old.starCoins | result.starCoins,
    bestScore: Math.max(old.bestScore, result.cleared ? result.score : 0)
  };
  progress.bank += result.coins;
  let newSecret = false;
  if (result.foundSecret) {
    const secret = TOUR[stage.world].stages.find((s) => s.secret);
    if (secret && !progress.secrets.includes(secret.id)) {
      progress.secrets.push(secret.id);
      newSecret = true;
    }
  }
  return { newStars: starsFor(progress.stages[stage.id]) - before, newSecret };
}

const PROGRESS_KEY = 'vorixa.rush.tour';

export function loadProgress(): TourProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<TourProgress>;
    return {
      stages: typeof parsed.stages === 'object' && parsed.stages ? parsed.stages : {},
      secrets: Array.isArray(parsed.secrets) ? parsed.secrets.filter((s) => typeof s === 'string') : [],
      bank: Number.isFinite(parsed.bank) ? Number(parsed.bank) : 0
    };
  } catch {
    // Corrupt or blocked storage: start fresh rather than crash the menu.
    return emptyProgress();
  }
}

export function saveProgress(progress: TourProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Progress lasts for this visit only.
  }
}
