import { describe, it, expect } from 'vitest';
import {
  TOUR,
  emptyProgress,
  starsFor,
  totalStars,
  worldUnlocked,
  stageUnlocked,
  recordResult,
  findStage,
  goalText,
  goalMet,
  nextStage,
  type StageResult
} from '../src/rush/Tour';

const cleared = (over: Partial<StageResult> = {}): StageResult => ({
  cleared: true, goalMet: false, starCoins: 0, score: 1000, coins: 20, foundSecret: false, ...over
});

describe('the tour', () => {
  it('has six worlds, each with three stages, a boss and a secret, all with unique ids', () => {
    expect(TOUR).toHaveLength(6);
    const ids = new Set<string>();
    for (const w of TOUR) {
      expect(w.motto.length).toBeGreaterThan(0);
      expect(w.stages.filter((s) => !s.boss && !s.secret)).toHaveLength(3);
      expect(w.stages.filter((s) => s.boss)).toHaveLength(1);
      expect(w.stages.filter((s) => s.secret)).toHaveLength(1);
      expect(w.stages.filter((s) => s.hasSecret)).toHaveLength(1);
      for (const s of w.stages) {
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
        expect(goalText(s.goal).length).toBeGreaterThan(0);
      }
    }
  });

  it('gets harder world by world', () => {
    for (let w = 1; w < TOUR.length; w++) {
      expect(TOUR[w].stages[0].difficulty).toBeGreaterThan(TOUR[w - 1].stages[0].difficulty);
    }
  });
});

describe('stars', () => {
  it('one for clearing, one for the goal, one for all three star coins', () => {
    expect(starsFor(undefined)).toBe(0);
    expect(starsFor({ cleared: true, goalMet: false, starCoins: 0b011, bestScore: 0 })).toBe(1);
    expect(starsFor({ cleared: true, goalMet: true, starCoins: 0b111, bestScore: 0 })).toBe(3);
    expect(starsFor({ cleared: false, goalMet: false, starCoins: 0b111, bestScore: 0 })).toBe(0);
  });

  it('progress only improves, and star coins from failed runs still count', () => {
    const p = emptyProgress();
    const stage = TOUR[0].stages[0];
    recordResult(p, stage, cleared({ cleared: false, starCoins: 0b001 }));
    recordResult(p, stage, cleared({ goalMet: true, starCoins: 0b110 }));
    recordResult(p, stage, cleared({ goalMet: false, score: 10 }));
    expect(starsFor(p.stages[stage.id])).toBe(3);
    expect(p.stages[stage.id].bestScore).toBe(1000);
  });

  it('a goal met on a failed run does not count', () => {
    const p = emptyProgress();
    recordResult(p, TOUR[0].stages[0], cleared({ cleared: false, goalMet: true }));
    expect(p.stages[TOUR[0].stages[0].id].goalMet).toBe(false);
  });
});

describe('unlocks', () => {
  it('stages open in order, the boss after all three', () => {
    const p = emptyProgress();
    const [s1, s2, s3] = TOUR[0].stages;
    const boss = TOUR[0].stages.find((s) => s.boss)!;
    expect(stageUnlocked(p, s1)).toBe(true);
    expect(stageUnlocked(p, s2)).toBe(false);
    recordResult(p, s1, cleared());
    expect(stageUnlocked(p, s2)).toBe(true);
    expect(stageUnlocked(p, boss)).toBe(false);
    recordResult(p, s2, cleared());
    recordResult(p, s3, cleared());
    expect(stageUnlocked(p, boss)).toBe(true);
  });

  it('the next world needs the boss beaten and enough stars', () => {
    const p = emptyProgress();
    expect(worldUnlocked(p, 1)).toBe(false);
    for (const s of TOUR[0].stages.filter((s) => !s.secret)) recordResult(p, s, cleared());
    // Four stages cleared: four stars, one short of the five World 2 asks for.
    expect(totalStars(p)).toBe(4);
    expect(worldUnlocked(p, 1)).toBe(false);
    recordResult(p, TOUR[0].stages[0], cleared({ goalMet: true }));
    expect(worldUnlocked(p, 1)).toBe(true);
  });

  it('a secret stage appears only once its warp is found', () => {
    const p = emptyProgress();
    const world = TOUR[0];
    const secret = world.stages.find((s) => s.secret)!;
    const host = world.stages.find((s) => s.hasSecret)!;
    expect(stageUnlocked(p, secret)).toBe(false);
    const { newSecret } = recordResult(p, host, cleared({ foundSecret: true }));
    expect(newSecret).toBe(true);
    expect(stageUnlocked(p, secret)).toBe(true);
    expect(recordResult(p, host, cleared({ foundSecret: true })).newSecret).toBe(false);
  });

  it('finds stages by id', () => {
    expect(findStage('w1-1')?.name).toBe('Windmill Way');
    expect(findStage('nope')).toBeNull();
  });
});


describe('goals', () => {
  const stats = { coins: 50, droneKills: 3, crashes: 0, elapsed: 40 };
  it('are judged on the attempt', () => {
    expect(goalMet({ kind: 'coins', target: 60 }, stats)).toBe(false);
    expect(goalMet({ kind: 'coins', target: 50 }, stats)).toBe(true);
    expect(goalMet({ kind: 'drones', target: 3 }, stats)).toBe(true);
    expect(goalMet({ kind: 'noCrash', target: 0 }, { ...stats, crashes: 1 })).toBe(false);
    expect(goalMet({ kind: 'time', target: 42 }, stats)).toBe(true);
    expect(goalMet({ kind: 'time', target: 39 }, stats)).toBe(false);
    expect(goalMet({ kind: 'finish', target: 0 }, { ...stats, crashes: 1 })).toBe(true);
    expect(goalMet({ kind: 'finish', target: 0 }, { ...stats, crashes: 2 })).toBe(false);
  });
});

describe('next stage', () => {
  it('walks the world in order, then the boss, then the next world', () => {
    const p = emptyProgress();
    const w1 = TOUR[0].stages;
    recordResult(p, w1[0], cleared());
    expect(nextStage(p, w1[0])?.id).toBe('w1-2');
    recordResult(p, w1[1], cleared({ goalMet: true }));
    recordResult(p, w1[2], cleared({ goalMet: true }));
    expect(nextStage(p, w1[2])?.id).toBe('w1-boss');
    recordResult(p, w1[3], cleared());
    expect(nextStage(p, w1[3])?.id).toBe('w2-1');
  });

  it('stops when the next world is still locked, and after a secret stage', () => {
    const p = emptyProgress();
    const w1 = TOUR[0].stages;
    for (const s of w1.filter((s) => !s.secret)) recordResult(p, s, cleared());
    expect(nextStage(p, w1[3])).toBeNull();
    expect(nextStage(p, w1.find((s) => s.secret)!)).toBeNull();
  });
});
