import { describe, it, expect } from 'vitest';
import { Chaos, EXPLOSIVES, FIRE_DPS, falloff } from '../src/city/Chaos';
import { Combat } from '../src/city/Combat';
import { HeroMotor } from '../src/city/HeroMotor';
import { buildDistrict } from '../src/city/CityLayout';

const DT = 1 / 120;
const d = buildDistrict(4);

function run(chaos: Chaos, seconds: number, each?: () => void): string[] {
  const log: string[] = [];
  for (let t = 0; t < seconds; t += DT) {
    chaos.step(DT);
    for (const fx of chaos.fx) if (fx.type === 'blast') log.push(`${fx.blast.source}@${t.toFixed(2)}`);
    each?.();
  }
  return log;
}

describe('Chaos', () => {
  it('blows a barrel at once when it is shot hard, and only lights it when shot lightly', () => {
    const c = new Chaos();
    const hard = c.place('barrel', 0, 0);
    const soft = c.place('barrel', 40, 0);
    c.damage(hard, 36);
    c.damage(soft, 10);
    expect(soft.fuse).toBeCloseTo(EXPLOSIVES.barrel.fuse, 5);
    // Within a few frames: it goes off as the bullet lands.
    const log = run(c, 0.2);
    expect(log).toHaveLength(1);
    expect(Number(log[0].split('@')[1])).toBeLessThan(0.05);
    expect(soft.alive).toBe(true);
    run(c, EXPLOSIVES.barrel.fuse);
    expect(soft.alive).toBe(false);
  });

  it('gives propane a hiss before the bang, whatever hits it', () => {
    const c = new Chaos();
    const tank = c.place('propane', 0, 0);
    c.damage(tank, 999);
    expect(run(c, EXPLOSIVES.propane.fuse - 0.1)).toEqual([]);
    expect(run(c, 0.2)).toHaveLength(1);
  });

  it('sets off a row of barrels as a rolling chain, each a beat after the last', () => {
    const c = new Chaos();
    const row = [0, 2, 4, 6, 8].map((x) => c.place('barrel', x, 0));
    c.damage(row[0], 100);
    const times = run(c, 2).map((s) => Number(s.split('@')[1]));
    expect(times).toHaveLength(5);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it('lets fire jump a gap the blast cannot', () => {
    const c = new Chaos();
    // Beyond the first barrel's blast, but inside the fire it leaves.
    const near = c.place('barrel', 0, 0);
    const far = c.place('barrel', EXPLOSIVES.barrel.radius + 0.5, 0);
    c.damage(near, 100);
    run(c, 0.05);
    expect(far.fuse).toBeLessThan(0);
    // The fire spreads to it only if it stands in the flames: move the fire over it.
    c.fires[0].x = far.x;
    run(c, EXPLOSIVES.barrel.fuse + 0.2);
    expect(far.alive).toBe(false);
  });

  it('burns out', () => {
    const c = new Chaos();
    c.blast(0, 0, 5, 100, 'car', { radius: 2, life: 3 });
    expect(c.burning(0.5, 0)).toBe(true);
    const out: string[] = [];
    for (let t = 0; t < 3.2; t += DT) {
      c.step(DT);
      for (const fx of c.fx) out.push(fx.type);
    }
    expect(out).toContain('fireOut');
    expect(c.burning(0.5, 0)).toBe(false);
  });

  it('traces bullets onto explosives', () => {
    const c = new Chaos();
    const e = c.place('barrel', 0, 10);
    const hit = c.trace(0, 0.5, 0, 0, 0, 1, 50);
    expect(hit.explosive).toBe(e);
    expect(hit.t).toBeGreaterThan(9);
    expect(hit.t).toBeLessThan(10);
    expect(c.trace(0, 3, 0, 0, 0, 1, 50).explosive).toBeNull();
  });

  it('falls off with distance', () => {
    expect(falloff(0, 6)).toBe(1);
    expect(falloff(3, 6)).toBe(0.5);
    expect(falloff(7, 6)).toBe(0);
  });
});

describe('Chaos in the fight', () => {
  const hero = () => {
    const h = new HeroMotor(d.colliders, d.bounds);
    h.place(d.spawn.x, d.spawn.z, 0);
    return h;
  };

  it('kills the guards standing by a barrel, hurts the ones further off, and leaves the far ones', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const h = hero();
    const x = h.x + 30;
    const z = h.z;
    const close = combat.spawn('swat', x + 1, z, 0, 1);
    const mid = combat.spawn('swat', x + 5, z, 0, 1);
    const far = combat.spawn('swat', x + 12, z, 0, 1);
    combat.step(DT, h, () => {});
    combat.blast(x, z, EXPLOSIVES.barrel.radius, EXPLOSIVES.barrel.power);
    expect(close.state).toBe('dead');
    expect(mid.state).not.toBe('dead');
    expect(mid.hp).toBeLessThan(120);
    expect(far.hp).toBe(120);
    // Everyone in earshot turns to look.
    expect(far.state).toBe('alert');
    expect(combat.hp).toBe(100);
  });

  it('hurts the hero caught in a blast, and burns them in a fire', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const h = hero();
    combat.step(DT, h, () => {});
    combat.blast(h.x + 2, h.z, 6.5, 160);
    const afterBlast = combat.hp + combat.armor;
    expect(afterBlast).toBeLessThan(150);
    combat.scorch(() => true, FIRE_DPS, 1);
    expect(combat.hp + combat.armor).toBeLessThan(afterBlast - FIRE_DPS * 0.9);
  });

  it('hears loud guns from further away than the pistol', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const h = hero();
    const e = combat.spawn('swat', h.x + 30, h.z, 0);
    combat.noise(h.x, h.z, 14);
    expect(e.state).toBe('idle');
    combat.noise(h.x, h.z, 45);
    expect(e.state).toBe('alert');
  });

  it('sends a guard who heard a shot to look where it came from, without knowing where the hero is', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const h = hero();
    // The noise is 18 m down the road from the guard; the hero is far off, out of sight range.
    const e = combat.spawn('swat', h.x + 30, h.z, 0);
    combat.noise(h.x + 12, h.z, 45);
    h.place(d.spawn.x, d.spawn.z + 100, 0);
    for (let t = 0; t < 4; t += DT) combat.step(DT, h, () => {});
    expect(e.state).toBe('alert');
    expect(Math.hypot(e.motor.x - (d.spawn.x + 12), e.motor.z - d.spawn.z)).toBeLessThan(4);
    // Nobody there: after a look around, back to their post.
    for (let t = 0; t < 12; t += DT) combat.step(DT, h, () => {});
    expect(e.state).toBe('idle');
    expect(combat.hp).toBe(100);
  });

  it('turns a searching guard into a fighting one the moment they see the hero', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const h = hero();
    const e = combat.spawn('swat', h.x + 20, h.z, -Math.PI / 2);
    combat.noise(h.x + 4, h.z, 45);
    for (let t = 0; t < 2; t += DT) combat.step(DT, h, () => {});
    expect(e.state).toBe('fight');
  });

  it('takes a guard down silently from behind, but not one facing a fight', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const h = hero();
    // Facing away from the hero (+x is away; the hero is at -x from them).
    const e = combat.spawn('swat', h.x + 1.2, h.z, Math.PI / 2);
    const other = combat.spawn('swat', h.x + 9, h.z + 9, 0);
    expect(combat.takedown(h)).toBe(e);
    expect(e.state).toBe('dead');
    expect(other.state).toBe('idle');
    const facing = combat.spawn('swat', h.x - 1.2, h.z, Math.PI / 2);
    facing.state = 'fight';
    expect(combat.takedown(h)).toBeNull();
  });

  it('lets a barrel in the line of fire take the bullet instead of the guard behind it', () => {
    const combat = new Combat(d.colliders, d.bounds);
    const chaos = new Chaos();
    const h = hero();
    // Down the road from the spawn: +x, clear of buildings.
    const guard = combat.spawn('swat', h.x + 20, h.z, 0);
    const barrel = chaos.place('barrel', h.x + 12, h.z);
    const eye = { x: h.x, y: 0.5, z: h.z };
    const yaw = -Math.PI / 2; // looking along +x
    const hits = combat.fire('rifle', [{ yaw: 0, pitch: 0 }], eye.x, eye.y, eye.z, yaw, 0, 0, (dx, dy, dz) =>
      chaos.trace(eye.x, eye.y, eye.z, dx, dy, dz, 400).t
    );
    expect(hits[0].kind).toBe('none');
    expect(hits[0].distance).toBeLessThan(12);
    expect(guard.hp).toBe(120);
    chaos.damage(barrel, 36);
    for (let i = 0; i < 6; i++) chaos.step(DT);
    expect(barrel.alive).toBe(false);
  });

  it('reports blast kills (and the wave they clear) to the game on the next step', () => {
    // The game reads Combat.fx right after Combat.step; blasts land between steps.
    const combat = new Combat(d.colliders, d.bounds);
    const h = hero();
    combat.spawnWave(h.x + 30, h.z, 2);
    for (const e of combat.enemies) e.motor.place(h.x + 30, h.z, 0);
    combat.step(DT, h, () => {});
    combat.blast(h.x + 30, h.z, 6.5, 400);
    combat.step(DT, h, () => {});
    const types = combat.fx.map((f) => f.type);
    expect(types.filter((t) => t === 'enemyKilled')).toHaveLength(2);
    expect(types).toContain('waveClear');
    // And read only once.
    combat.step(DT, h, () => {});
    expect(combat.fx.some((f) => f.type === 'waveClear')).toBe(false);
  });

  it('does not count outpost guards as a wave', () => {
    const combat = new Combat(d.colliders, d.bounds);
    combat.spawn('swat', 0, 0, 0, 2);
    expect(combat.alive).toBe(0);
    expect(combat.guardsAlive(2)).toBe(1);
    combat.spawnWave(40, 40, 3);
    expect(combat.alive).toBe(3);
    combat.clearChoir();
    expect(combat.alive).toBe(0);
    expect(combat.guardsAlive(2)).toBe(1);
  });
});
