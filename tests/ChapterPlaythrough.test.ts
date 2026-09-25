import { describe, it, expect } from 'vitest';
import { buildDistrict } from '../src/city/CityLayout';
import { HeroMotor, type HeroIntent } from '../src/city/HeroMotor';
import { Combat } from '../src/city/Combat';
import { CityLife, HEAT_COOLDOWN } from '../src/city/CityLife';
import { CHAPTER_ONE, JobRunner, COIN_REACH, type Job } from '../src/city/Jobs';

/**
 * Plays Chapter 1's jobs 2-5 through the real simulations, wired the way CityGame wires them
 * (job events set things up; the hero moves, jumps and shoots with the real code; enemies fight
 * back). No browser: this is the play-test that runs with every `pnpm test`.
 */

const DT = 1 / 120;
const d = buildDistrict(4);
const still = (over: Partial<HeroIntent> = {}): HeroIntent => ({
  forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false, ...over
});

class World {
  public readonly hero = new HeroMotor(d.colliders, d.bounds);
  public readonly combat = new Combat(d.colliders, d.bounds);
  public readonly life = new CityLife(d, 28);
  public coins: { x: number; y: number; z: number; taken: boolean }[] = [];
  public cash = 0;
  public runner: JobRunner | null = null;

  public constructor() {
    this.hero.place(d.spawn.x, d.spawn.z, 0);
  }

  /** The game's handling of job events (CityGame.handleJobEvents), minus the drawing. */
  private handle(): void {
    const r = this.runner!;
    for (const e of r.events) {
      if (e.type === 'spawnCrew') this.combat.spawnWave(e.x, e.z, e.count);
      else if (e.type === 'setHeat') this.life.heat = e.stars;
      else if (e.type === 'placeCoins') this.coins = e.coins.map((c) => ({ ...c, taken: false }));
      else if (e.type === 'spawnBoss') {
        this.combat.spawn('boss', e.x, e.z, 0);
        this.combat.spawnWave(e.x, e.z, e.guards);
      } else if (e.type === 'complete') this.cash += e.cash;
    }
  }

  public start(job: Job): void {
    this.runner = new JobRunner(job);
    this.runner.start();
    this.handle();
  }

  /** One simulation step of everything, as the game's fixed-rate loop does it. */
  public step(intent: HeroIntent = still()): void {
    this.hero.step(intent, DT);
    this.combat.step(DT, this.hero, () => {});
    // The hero is the one under test: keep them standing through the enemies' return fire.
    this.combat.hp = 100;
    this.life.step(DT, this.combat.policeWatching);
    for (const c of this.coins) {
      if (!c.taken && Math.hypot(this.hero.x - c.x, this.hero.y + 1 - c.y, this.hero.z - c.z) < COIN_REACH + 0.25) c.taken = true;
    }
    this.runner!.update(
      {
        heroX: this.hero.x, heroZ: this.hero.z, driving: null, inJobCar: false,
        choirAlive: this.combat.alive, stars: this.life.stars,
        coinsTaken: this.coins.filter((c) => c.taken).length, bossAlive: this.combat.bossAlive
      },
      DT
    );
    this.handle();
  }

  public run(seconds: number, intent?: HeroIntent): void {
    for (let t = 0; t < seconds; t += DT) this.step(intent);
  }

  /**
   * Walks up to each Choir fighter in turn and shoots them in the head with the real ballistics
   * (from the hero's eye, aimed with yaw and pitch), until everyone is down.
   */
  public clearChoir(): number {
    let shots = 0;
    for (let guard = 0; guard < 400 && this.combat.alive > 0; guard++) {
      const e = this.combat.enemies.find((x) => x.state !== 'dead' && x.kind !== 'police')!;
      const m = e.motor;
      const scale = e.kind === 'boss' ? 1.35 : 1;
      // Stand four metres off, on whichever side is clear.
      for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
        this.hero.place(m.x + ox, m.z + oz, 0);
        if (Math.hypot(this.hero.x - m.x - ox, this.hero.z - m.z - oz) < 0.01) break;
      }
      const eye = { x: this.hero.x, y: this.hero.y + 1.65, z: this.hero.z };
      const dx = m.x - eye.x;
      const dy = m.y + 1.63 * scale - eye.y;
      const dz = m.z - eye.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.combat.fire('rifle', [{ yaw: 0, pitch: 0 }], eye.x, eye.y, eye.z, yaw, pitch, 0);
      shots++;
      this.step();
    }
    return shots;
  }
}

const job = (id: string) => CHAPTER_ONE.find((j) => j.id === id)!;

describe('Chapter 1 play-through (jobs 2-5)', () => {
  it('Stash House: arrive, clear the crew with headshots, take the cash on foot', () => {
    const w = new World();
    w.start(job('stash'));
    const go = w.runner!.target!;
    w.hero.place(go.x, go.z, 0);
    w.run(0.2);
    expect(w.combat.alive).toBe(6);
    expect(w.runner!.step).toBe(1);
    const shots = w.clearChoir();
    expect(w.combat.alive).toBe(0);
    expect(shots).toBeLessThan(40);
    w.run(0.2);
    const cash = w.runner!.target!;
    w.hero.place(cash.x, cash.z, 0);
    w.run(0.2);
    expect(w.runner!.state).toBe('complete');
    expect(w.cash).toBe(4000);
  });

  it('Loud Exit: three stars land, and cool off only once nobody is watching', () => {
    const w = new World();
    w.start(job('exit'));
    expect(w.life.stars).toBe(3);
    // A police officer with eyes on the hero holds the heat.
    w.combat.spawn('police', w.hero.x + 10, w.hero.z, 0);
    w.run(HEAT_COOLDOWN + 3);
    expect(w.life.stars).toBe(3);
    // Out of sight (the officer far behind a building line): it cools a star at a time.
    w.combat.standDownPolice();
    w.run(HEAT_COOLDOWN * 3 + 3);
    expect(w.life.stars).toBe(0);
    expect(w.runner!.state).toBe('complete');
    expect(w.cash).toBe(2500);
  });

  it('Tithe: climb each planter and jump for its star, inside the minute', () => {
    const w = new World();
    w.start(job('tithe'));
    expect(w.coins).toHaveLength(3);
    for (const c of w.coins) {
      // Stand on the planter under the star, then jump.
      w.hero.place(c.x, c.z, 0);
      w.hero.y = 0.51;
      w.run(0.1);
      w.step(still({ jumpPressed: true }));
      w.run(1.2);
      expect(c.taken).toBe(true);
    }
    w.run(0.1);
    expect(w.runner!.state).toBe('complete');
    expect(w.cash).toBe(3000);
  });

  it('Cantor: reach him, drop his guards and him (headshots through the plate)', () => {
    const w = new World();
    w.start(job('cantor'));
    const go = w.runner!.target!;
    w.hero.place(go.x, go.z, 0);
    w.run(0.2);
    expect(w.combat.bossAlive).toBe(true);
    expect(w.combat.alive).toBe(5);
    const shots = w.clearChoir();
    expect(w.combat.bossAlive).toBe(false);
    // Cantor's 1,400 HP falls to headshots in a reasonable number of rounds.
    expect(shots).toBeLessThan(60);
    w.run(0.2);
    expect(w.runner!.state).toBe('complete');
    expect(w.cash).toBe(10000);
  });
});
