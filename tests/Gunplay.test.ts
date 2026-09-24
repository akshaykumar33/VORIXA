import { describe, it, expect } from 'vitest';
import { Arsenal, WEAPONS } from '../src/city/Weapons';
import { Combat, direction, rayBoxes, HERO_MAX_HP } from '../src/city/Combat';
import { HeroMotor } from '../src/city/HeroMotor';
import type { Box } from '../src/city/CityLayout';

const DT = 1 / 120;
const open: Box = { minX: -500, maxX: 500, minZ: -500, maxZ: 500, height: 100 };

/** Holds or taps the trigger for a while and counts the shots. */
function fireFor(a: Arsenal, seconds: number, hold: boolean, aiming = false) {
  let shots = 0;
  const offsets: { yaw: number; pitch: number }[] = [];
  for (let n = 0; n < seconds / DT; n++) {
    const down = hold ? true : n % 24 < 12;
    const r = a.step(DT, down, aiming, 0, false);
    if (r) {
      shots++;
      offsets.push(...r.shots);
    }
  }
  return { shots, offsets };
}

describe('Arsenal', () => {
  it('fires a semi-automatic once per trigger pull', () => {
    const a = new Arsenal(1);
    expect(fireFor(a, 0.5, true).shots).toBe(1);
  });

  it('fires an automatic continuously at its rate', () => {
    const a = new Arsenal(1);
    a.select('smg');
    a.step(1, false, false, 0, false); // draw
    const { shots } = fireFor(a, 0.75, true);
    expect(shots).toBeGreaterThanOrEqual(9);
    expect(shots).toBeLessThanOrEqual(11);
  });

  it('empties the magazine, clicks dry, then reloads from the reserve', () => {
    const a = new Arsenal(1);
    const w = WEAPONS.pistol;
    for (let i = 0; i < w.magazine; i++) {
      a.step(1, false, false, 0, false);
      a.step(DT, true, false, 0, false);
    }
    expect(a.ammo.pistol.mag).toBe(0);
    // Pulling on empty (once the last shot has cycled) starts a reload by itself.
    a.step(1, false, false, 0, false);
    a.step(DT, true, false, 0, false);
    expect(a.reloading).toBeGreaterThan(0);
    for (let t = 0; t < w.reloadTime + 0.1; t += DT) a.step(DT, false, false, 0, false);
    expect(a.ammo.pistol.mag).toBe(w.magazine);
    expect(a.ammo.pistol.reserve).toBe(w.reserve - w.magazine);
  });

  it('cancels a reload when switching weapons', () => {
    const a = new Arsenal(1);
    fireFor(a, 1, false);
    a.reload();
    expect(a.reloading).toBeGreaterThan(0);
    a.select('rifle');
    expect(a.reloading).toBe(0);
  });

  it('climbs in a learnable pattern when spraying', () => {
    const a = new Arsenal(7);
    a.select('rifle');
    a.step(1, false, false, 0, false);
    const { offsets } = fireFor(a, 0.6, true, true);
    // Aimed and still, the first shots rise steadily.
    expect(offsets[4].pitch).toBeGreaterThan(offsets[0].pitch + 0.02);
  });

  it('is tighter aimed than from the hip, and wider on the move', () => {
    const spreadOf = (aiming: boolean, moving: number) => {
      const a = new Arsenal(3);
      let sum = 0;
      for (let i = 0; i < 40; i++) {
        a.step(1, false, false, 0, false);
        const r = a.step(DT, true, aiming, moving, false)!;
        sum += Math.hypot(r.shots[0].yaw, r.shots[0].pitch);
        a.ammo.pistol.mag = 12;
      }
      return sum / 40;
    };
    expect(spreadOf(true, 0)).toBeLessThan(spreadOf(false, 0));
    expect(spreadOf(false, 1)).toBeGreaterThan(spreadOf(false, 0));
  });

  it('fires a shotgun as a spread of pellets', () => {
    const a = new Arsenal(1);
    a.select('shotgun');
    a.step(1, false, false, 0, false);
    const r = a.step(DT, true, false, 0, false)!;
    expect(r.shots).toHaveLength(WEAPONS.shotgun.pellets);
  });
});

describe('Combat', () => {
  const wall: Box = { minX: -1, maxX: 1, minZ: -12, maxZ: -10, height: 10 };

  it('stops bullets at walls and the street', () => {
    expect(rayBoxes(0, 1.5, 0, 0, 0, -1, 100, [wall])).toBeCloseTo(10, 5);
    const [dx, dy, dz] = direction(0, -0.5);
    expect(rayBoxes(0, 1.5, 0, dx, dy, dz, 100, [])).toBeCloseTo(1.5 / Math.sin(0.5), 3);
  });

  it('tells a headshot from a body shot', () => {
    const c = new Combat([], open);
    const e = c.spawn('swat', 0, -10, 0);
    const head = c.trace(0, 1.63, 0, 0, 0, -1, 100);
    expect(head.kind).toBe('enemy');
    expect(head.headshot).toBe(true);
    const body = c.trace(0, 1.0, 0, 0, 0, -1, 100);
    expect(body.enemy).toBe(e);
    expect(body.headshot).toBe(false);
    expect(c.trace(0, 1.0, 0, 1, 0, 0, 100).kind).toBe('none');
  });

  it('cannot shoot an enemy through a wall', () => {
    const c = new Combat([wall], open);
    c.spawn('swat', 0, -20, 0);
    expect(c.trace(0, 1.2, 0, 0, 0, -1, 100).kind).toBe('world');
  });

  it('kills with damage, drops ammo, and clears the wave', () => {
    const c = new Combat([], open);
    const e = c.spawn('soldier', 0, -8, 0);
    const kinds: string[] = [];
    for (let i = 0; i < 2; i++) {
      c.fire('rifle', [{ yaw: 0, pitch: 0 }], 0, 1.63, 0, 0, 0, 0);
      kinds.push(...c.fx.map((f) => f.type));
    }
    expect(e.state).toBe('dead');
    expect(c.headshots).toBe(1);
    expect(kinds).toContain('waveClear');
    const hero = new HeroMotor([], open);
    hero.place(0, -8, 0);
    let picked = 0;
    c.step(DT, hero, (_w, rounds) => (picked += rounds));
    expect(picked).toBeGreaterThan(0);
  });

  it('lets armour soak damage first, and regrows health to half', () => {
    const c = new Combat([], open);
    c.hurtHero(20, 0, 0);
    expect(c.armor).toBeLessThan(50);
    expect(c.hp).toBe(HERO_MAX_HP - 8);
    c.hp = 20;
    const hero = new HeroMotor([], open);
    for (let t = 0; t < 12; t += DT) c.step(DT, hero, () => {});
    expect(c.hp).toBeCloseTo(50, 0);
  });

  it('has enemies that spot the hero, then shoot, but not through walls', () => {
    const run = (colliders: Box[]) => {
      const c = new Combat(colliders, open);
      c.spawn('swat', 0, -25, 0); // facing +z, toward the hero
      const hero = new HeroMotor([], open);
      hero.place(0, 0, Math.PI);
      let shots = 0;
      for (let t = 0; t < 5; t += DT) {
        c.step(DT, hero, () => {});
        shots += c.fx.filter((f) => f.type === 'enemyShot').length;
      }
      return { shots, state: c.enemies[0].state };
    };
    const inOpen = run([]);
    expect(inOpen.state).toBe('fight');
    expect(inOpen.shots).toBeGreaterThan(3);
    const behindWall = run([wall]);
    expect(behindWall.state).toBe('idle');
    expect(behindWall.shots).toBe(0);
  });
});

describe('Cover', () => {
  it('stops bullets at a parked car, both ways', () => {
    const c = new Combat([], open);
    c.spawn('swat', 0, -20, 0);
    c.cover.push({ minX: -1, maxX: 1, minZ: -11, maxZ: -9, height: 1.4 });
    expect(c.trace(0, 1.0, 0, 0, 0, -1, 100).kind).toBe('world');
    // Over the roof, the head is exposed.
    expect(c.trace(0, 1.63, 0, 0, 0, -1, 100).kind).toBe('enemy');
  });
});
