import { describe, it, expect } from 'vitest';
import { buildDistrict, type Box } from '../src/city/CityLayout';
import { Combat } from '../src/city/Combat';
import { Chaos, EXPLOSIVES } from '../src/city/Chaos';
import { HeroMotor, type HeroIntent } from '../src/city/HeroMotor';
import { ALARM_DELAY, ALARM_HEIGHT, Outposts, REINFORCEMENTS, REINFORCE_DELAY, REWARD, buildOutposts, type OutpostEvent } from '../src/city/Outposts';
import { CHAPTER_ONE } from '../src/city/Jobs';

const DT = 1 / 120;
const d = buildDistrict(4);
const defs = buildOutposts(d.pitch);
const still: HeroIntent = { forward: 0, right: 0, cameraYaw: 0, sprint: false, walk: false, jumpPressed: false, faceCamera: false };
const overlaps = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const inside = (x: number, z: number) => x > d.bounds.minX && x < d.bounds.maxX && z > d.bounds.minZ && z < d.bounds.maxZ;

class World {
  public readonly colliders = [...d.colliders, ...defs.flatMap((o) => [...o.barricades, ...o.sandbags])];
  public readonly hero = new HeroMotor(this.colliders, d.bounds);
  public readonly combat = new Combat(this.colliders, d.bounds);
  public readonly chaos = new Chaos();
  public readonly outposts = new Outposts(defs);
  public readonly log: OutpostEvent[] = [];

  public constructor() {
    this.hero.place(d.spawn.x, d.spawn.z, 0);
    this.outposts.populate(this.combat, this.chaos);
  }

  public step(): void {
    this.hero.step(still, DT);
    this.combat.step(DT, this.hero, () => {});
    this.combat.hp = 100;
    this.chaos.step(DT);
    for (const fx of this.chaos.fx) {
      if (fx.type !== 'blast') continue;
      this.combat.blast(fx.blast.x, fx.blast.z, fx.blast.radius, fx.blast.power);
      this.outposts.blast(fx.blast.x, fx.blast.z, fx.blast.radius);
    }
    this.combat.hp = 100;
    this.outposts.step(DT, this.combat);
    this.log.push(...this.outposts.events);
  }

  public run(seconds: number): void {
    for (let t = 0; t < seconds; t += DT) this.step();
  }

  public guards(post: number) {
    return this.combat.enemies.filter((e) => e.post === post && e.state !== 'dead');
  }
}

describe('Outpost layout', () => {
  it('builds five outposts, inside the district and clear of every building', () => {
    expect(defs).toHaveLength(5);
    const buildings = d.colliders.filter((c) => c.height > 5);
    for (const o of defs) {
      for (const b of [...o.barricades, ...o.sandbags]) {
        for (const c of buildings) expect(overlaps(b, c), o.name).toBe(false);
        expect(inside(b.minX, b.minZ) && inside(b.maxX, b.maxZ), o.name).toBe(true);
      }
      for (const p of [...o.guards, ...o.explosives, o.alarm, o.reinforce]) {
        expect(inside(p.x, p.z), `${o.name} ${p.x},${p.z}`).toBe(true);
        for (const c of d.colliders) expect(p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ, `${o.name} in a solid`).toBe(false);
      }
    }
  });

  it('keeps clear of the spawn and of Chapter 1’s places', () => {
    const places = CHAPTER_ONE.flatMap((j) => j.steps.flatMap((s) => ('x' in s ? [{ x: s.x, z: s.z }] : [])));
    for (const o of defs) {
      expect(Math.hypot(o.x - d.spawn.x, o.z - d.spawn.z), o.name).toBeGreaterThan(60);
      for (const p of places) expect(Math.hypot(o.x - p.x, o.z - p.z), `${o.name} vs ${p.x},${p.z}`).toBeGreaterThan(20);
    }
  });
});

describe('Taking an outpost', () => {
  it('liberates quietly: every guard taken down from behind, never seen, alarm never rung', () => {
    const w = new World();
    const post = 1;
    for (let guard = 0; guard < 20 && w.guards(post).length > 0; guard++) {
      const e = w.guards(post)[0];
      // Step in right behind them.
      w.hero.place(e.motor.x - Math.sin(e.motor.facing) * 1.1, e.motor.z - Math.cos(e.motor.facing) * 1.1, e.motor.facing);
      expect(w.combat.takedown(w.hero)).toBe(e);
      w.step();
    }
    w.run(0.2);
    const done = w.log.find((e) => e.type === 'liberated');
    expect(done).toMatchObject({ type: 'liberated', undetected: true, quiet: true, cash: REWARD.base + REWARD.undetected + REWARD.quiet });
    expect(w.outposts.stateOf('outpost-1')).toBe('liberated');
    // The other outposts are still held.
    expect(w.outposts.stateOf('outpost-2')).toBe('held');
  });

  it('goes loud: spotted, the alarm rings, reinforcements come, and it is still taken', () => {
    const w = new World();
    const o = defs[0];
    // In the middle of the road, in plain sight.
    w.hero.place(o.x, o.z, 0);
    w.run(1.5);
    expect(w.log.some((e) => e.type === 'spotted')).toBe(true);
    w.run(ALARM_DELAY);
    expect(w.log.some((e) => e.type === 'alarm')).toBe(true);
    w.run(REINFORCE_DELAY + 0.2);
    expect(w.log.find((e) => e.type === 'reinforcements')).toMatchObject({ count: REINFORCEMENTS });
    expect(w.guards(1).length).toBeGreaterThan(REINFORCEMENTS);
    for (const e of w.guards(1)) {
      e.hp = 0;
      e.state = 'dead';
    }
    w.run(0.1);
    expect(w.log.find((e) => e.type === 'liberated')).toMatchObject({ undetected: false, quiet: false, cash: REWARD.base });
  });

  it('never rings if the alarm is shot out in time', () => {
    const w = new World();
    const o = defs[0];
    w.hero.place(o.x, o.z, 0);
    w.run(1.5);
    expect(w.outposts.alarmCountdown(o.id)).not.toBeNull();
    // A shot from the road at the box on its pole.
    const dx = o.alarm.x - w.hero.x;
    const dz = o.alarm.z - w.hero.z;
    const len = Math.hypot(dx, ALARM_HEIGHT - 1.6, dz);
    const hit = w.outposts.traceAlarm(w.hero.x, 1.6, w.hero.z, dx / len, (ALARM_HEIGHT - 1.6) / len, dz / len, 60);
    expect(hit.id).toBe(o.id);
    w.outposts.breakAlarm(hit.id!);
    w.run(ALARM_DELAY + REINFORCE_DELAY + 1);
    expect(w.log.some((e) => e.type === 'alarm')).toBe(false);
    expect(w.log.some((e) => e.type === 'reinforcements')).toBe(false);
  });

  it('goes up with its fuel: one shot at the barrels by the alarm takes the alarm and its guard with it', () => {
    const w = new World();
    const o = defs[0];
    const officer = w.guards(1)[5];
    const barrel = w.chaos.explosives.find((e) => Math.hypot(e.x - o.alarm.x, e.z - o.alarm.z) < 2.5 && e.kind === 'barrel')!;
    w.chaos.damage(barrel, 40);
    w.run(2.5);
    expect(w.outposts.alarmStanding(o.id)).toBe(false);
    expect(officer.state).toBe('dead');
    // The chain took the rest of the stack, propane included.
    const stack = w.chaos.explosives.filter((e) => Math.hypot(e.x - o.alarm.x, e.z - o.alarm.z) < 3);
    expect(stack.every((e) => !e.alive)).toBe(true);
    expect(EXPLOSIVES.propane.radius).toBeGreaterThan(EXPLOSIVES.barrel.radius);
  });

  it('walks its patrol while nothing is wrong', () => {
    const w = new World();
    const patrol = w.guards(1)[4];
    const start = { x: patrol.motor.x, z: patrol.motor.z };
    w.run(14);
    expect(Math.hypot(patrol.motor.x - start.x, patrol.motor.z - start.z)).toBeGreaterThan(6);
    expect(patrol.state).toBe('idle');
  });

  it('remembers liberated outposts: no guards, but the fuel is still there', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const chaos = new Chaos();
    const outposts = new Outposts(defs, new Set(['outpost-1', 'outpost-3']));
    outposts.populate(combat, chaos);
    expect(outposts.liberatedCount).toBe(2);
    expect(combat.guardsAlive(1)).toBe(0);
    expect(combat.guardsAlive(2)).toBe(6);
    expect(chaos.explosives.length).toBe(defs.reduce((n, o) => n + o.explosives.length, 0));
  });
});
