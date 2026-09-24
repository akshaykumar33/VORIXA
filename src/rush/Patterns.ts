import type { Rng } from '../world/Rng';
import type { RushSim, EntityKind } from './RushSim';
import { LANE_WIDTH, RAMP_VELOCITY, GRAVITY } from './RushSim';

/**
 * The road ahead, one pattern at a time.
 *
 * Temple Run-style games live or die on this. Each pattern is a small, readable situation — a
 * gap to thread, a wall to jump, a drone to shoot — with coins placed to *suggest* the answer.
 *
 * One invariant is never broken: **no row blocks every lane with something that cannot be
 * jumped.** Trucks are the only unjumpable obstacle, and a pattern places at most two abreast.
 * Barriers and traffic can fill a row, because a jump clears both.
 */

/** Empty road at the start of a run: time to find the controls before anything asks for them. */
export const OPENING_CLEAR = 70;

type Pattern = (sim: RushSim, rng: Rng, z: number) => number;

const LANES = [-1, 0, 1] as const;

function laneX(lane: number): number {
  return lane * LANE_WIDTH;
}

function otherLanes(lane: number): number[] {
  return LANES.filter((l) => l !== lane);
}

function coinLine(sim: RushSim, lane: number, z: number, count: number, spacing = 4): number {
  for (let i = 0; i < count; i++) sim.spawn('coin', laneX(lane), z + i * spacing, 0.6);
  return count * spacing;
}

/** Coins along the arc a ramp launch will actually fly, so following them is the reward. */
function rampArc(sim: RushSim, lane: number, z: number): void {
  const speed = Math.max(sim.speed, 20);
  const airtime = (2 * RAMP_VELOCITY) / GRAVITY;
  for (let t = 0.12; t < airtime - 0.05; t += 0.12) {
    const y = RAMP_VELOCITY * t - 0.5 * GRAVITY * t * t;
    sim.spawn('coin', laneX(lane), z + speed * t, y + 0.6);
  }
}

const patterns: Record<string, Pattern> = {
  coins(sim, rng, z) {
    return coinLine(sim, rng.pick(LANES), z, rng.int(5, 9));
  },

  // Coins that snake across lanes teach steering without a single obstacle.
  coinSnake(sim, rng, z) {
    let lane: number = rng.pick(LANES);
    for (let i = 0; i < 10; i++) {
      if (i % 3 === 2) lane = Math.max(-1, Math.min(1, lane + rng.pick([-1, 1])));
      sim.spawn('coin', laneX(lane), z + i * 4, 0.6);
    }
    return 40;
  },

  barrier(sim, rng, z) {
    const lane = rng.pick(LANES);
    sim.spawn('barrier', laneX(lane), z);
    coinLine(sim, rng.pick(otherLanes(lane)), z - 8, 5);
    return 12;
  },

  barrierPair(sim, rng, z) {
    const open = rng.pick(LANES);
    for (const lane of otherLanes(open)) sim.spawn('barrier', laneX(lane), z);
    coinLine(sim, open, z - 6, 4);
    return 10;
  },

  // Every lane blocked, but low: the only answer is to jump. Coins hang over the middle.
  jumpWall(sim, _rng, z) {
    for (const lane of LANES) sim.spawn('barrier', laneX(lane), z);
    for (let i = -1; i <= 1; i++) sim.spawn('coin', 0, z + i * 3, 2.0);
    return 10;
  },

  trucks(sim, rng, z) {
    const count = sim.difficulty > 0.25 && rng.chance(0.5) ? 2 : 1;
    const open = rng.pick(LANES);
    const blocked = otherLanes(open).slice(0, count);
    for (const lane of blocked) sim.spawn('truck', laneX(lane), z);
    coinLine(sim, open, z - 6, 4);
    return 16;
  },

  traffic(sim, rng, z) {
    const count = 1 + (sim.difficulty > 0.3 && rng.chance(0.5) ? 1 : 0);
    const lanes = [...LANES];
    for (let i = 0; i < count; i++) {
      const lane = lanes.splice(rng.int(0, lanes.length - 1), 1)[0];
      sim.spawn('traffic', laneX(lane), z + i * 14, 0, rng.range(9, 17));
    }
    return 14 * count + 6;
  },

  crates(sim, rng, z) {
    const count = rng.int(3, 6);
    for (let i = 0; i < count; i++) sim.spawn('crate', laneX(rng.pick(LANES)), z + i * 5);
    return count * 5;
  },

  ramp(sim, rng, z) {
    const lane = rng.pick(LANES);
    sim.spawn('ramp', laneX(lane), z);
    rampArc(sim, lane, z + 2.6);
    coinLine(sim, lane, z - 12, 3);
    return 12;
  },

  // Contra: a turret on one side of the road (both, later on), with crates for cover and points.
  turrets(sim, rng, z) {
    const sides = sim.difficulty > 0.5 && rng.chance(0.5) ? [-1, 1] : [rng.pick([-1, 1])];
    for (const side of sides) sim.spawn('turret', side * (LANE_WIDTH * 1.5 + 1.4), z + 30, 0);
    sim.spawn('crate', laneX(rng.pick(LANES)), z + 10);
    return 40;
  },

  // Assassin's Creed: a watcher sweeping its searchlight, and a ramp to leap onto it from.
  stealth(sim, rng, z) {
    const lane = rng.pick(LANES);
    sim.spawn('ramp', laneX(lane), z);
    // At a ramp launch's height, a car length or so past the top of the arc.
    const t = RAMP_VELOCITY / GRAVITY;
    sim.spawn('watcher', laneX(lane), z + 2.6 + Math.max(sim.speed, START_FOR_ARC) * t, 4.2);
    return 40;
  },

  drone(sim, rng, z) {
    if (sim.aliveDrones > 0) return patterns.crates(sim, rng, z);
    sim.spawn('drone', laneX(rng.pick(LANES)), z + 20, 3.4);
    return patterns.coinSnake(sim, rng, z);
  },

  // A row across all three lanes, Mario Kart style: nobody has to steer for one.
  items(sim, _rng, z) {
    for (const lane of LANES) sim.spawn('itembox', laneX(lane), z, 0.2);
    return 8;
  },

  pickup(sim, rng, z) {
    const kind: EntityKind = sim.hearts < sim.maxHearts && rng.chance(0.35) ? 'heart' : 'nitro';
    const lane = rng.pick(LANES);
    sim.spawn(kind, laneX(lane), z, 0.3);
    return 6;
  }
};

/**
 * Lays one of the three star coins in a spot that asks for a skill: the peak of a ramp jump,
 * high over a barrier wall (only a jump reaches it), or tucked right behind a parked truck (cut in
 * the moment you pass it). Which spot each coin gets is drawn from the stage seed.
 */
export function placeStarCoin(sim: RushSim, rng: Rng, z: number, index: number): number {
  const variant = (index + rng.int(0, 2)) % 3;
  const lane = rng.pick(LANES);
  if (sim.bonusRoad) {
    // A bonus stage is a reward: its star coins wait in the open, at the end of a coin trail.
    coinLine(sim, lane, z, 6);
    const star = sim.spawn('starcoin', laneX(lane), z + 26, 0.3);
    if (star) star.hp = index;
    return 30;
  }
  if (variant === 0) {
    sim.spawn('ramp', laneX(lane), z);
    const t = RAMP_VELOCITY / GRAVITY;
    const apex = (RAMP_VELOCITY * RAMP_VELOCITY) / (2 * GRAVITY);
    const star = sim.spawn('starcoin', laneX(lane), z + 2.6 + Math.max(sim.speed, START_FOR_ARC) * t, apex - 0.4);
    if (star) star.hp = index;
    coinLine(sim, lane, z - 14, 3);
    return 34;
  }
  if (variant === 1) {
    for (const l of LANES) sim.spawn('barrier', laneX(l), z);
    // At 1.5 m it clears a grounded car's roof (1.3 m): only a jump collects it.
    const star = sim.spawn('starcoin', laneX(lane), z, 1.5);
    if (star) star.hp = index;
    return 14;
  }
  const open = rng.pick(LANES);
  const blocked = otherLanes(open);
  for (const l of blocked) sim.spawn('truck', laneX(l), z);
  const star = sim.spawn('starcoin', laneX(rng.pick(blocked)), z + 3.6 + 11, 0.3);
  if (star) star.hp = index;
  coinLine(sim, open, z - 6, 5);
  return 30;
}

/** Arcs are laid assuming at least this speed, so a slow start still lines up with the coins. */
const START_FOR_ARC = 20;

const BONUS_PATTERNS = ['coins', 'coinSnake', 'ramp', 'coins', 'items'];

/**
 * Pattern weights by difficulty. Early road is coins and single barriers; pressure — trucks,
 * two-car traffic, drones — ramps in as the run goes on.
 */
function weights(difficulty: number, allowDrones = true): [string, number][] {
  const d = difficulty;
  return [
    ['coins', 2.2 - d],
    ['coinSnake', 1.4 - d * 0.6],
    ['barrier', 2],
    ['barrierPair', 0.6 + d * 1.4],
    ['jumpWall', 0.4 + d],
    ['trucks', 0.6 + d * 1.6],
    ['traffic', 0.8 + d * 1.6],
    ['crates', 1.2],
    ['ramp', 0.8],
    ['drone', !allowDrones || d < 0.06 ? 0 : 0.7 + d * 1.5],
    ['pickup', 0.45],
    ['items', 0.75],
    ['turrets', d < 0.2 ? 0 : 0.5 + d],
    ['stealth', d < 0.12 ? 0 : 0.55 + d * 0.6]
  ];
}

export function pickPattern(rng: Rng, difficulty: number, allowDrones = true): string {
  const table = weights(difficulty, allowDrones);
  let total = 0;
  for (const [, w] of table) total += Math.max(w, 0);
  let roll = rng.next() * total;
  for (const [name, w] of table) {
    roll -= Math.max(w, 0);
    if (roll <= 0) return name;
  }
  return table[0][0];
}

/** Lays one pattern starting at `z` and returns how much road it used. */
export function spawnPattern(sim: RushSim, rng: Rng, z: number): number {
  if (sim.bonusRoad) return patterns[rng.pick(BONUS_PATTERNS)](sim, rng, z);
  return patterns[pickPattern(rng, sim.difficulty, sim.dronesAllowed)](sim, rng, z);
}

export const PATTERN_NAMES = Object.keys(patterns);
