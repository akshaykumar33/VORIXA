import { describe, it, expect } from 'vitest';
import { buildDistrict, PITCH, ROAD_HALF_WIDTH, type Box } from '../src/city/CityLayout';
import { HeroMotor, JOG_SPEED, SPRINT_SPEED, WALK_SPEED, type HeroIntent } from '../src/city/HeroMotor';

const DT = 1 / 120;
const still = (over: Partial<HeroIntent> = {}): HeroIntent => ({
  forward: 0,
  right: 0,
  cameraYaw: 0,
  sprint: false,
  walk: false,
  jumpPressed: false,
  faceCamera: false,
  ...over
});
const overlaps = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

describe('CityLayout', () => {
  const d = buildDistrict(4);

  it('lays a full road grid', () => {
    expect(d.placements.filter((p) => p.piece === 'Street_4WayIntersection')).toHaveLength(16);
    // 4 rows × 3 gaps × 6 segments, in both directions.
    expect(d.placements.filter((p) => p.piece === 'Street_4Lane')).toHaveLength(2 * 4 * 3 * 6);
  });

  it('keeps every building off every road', () => {
    // Planters (low) belong on the sidewalk; buildings must stay behind it.
    for (const b of d.colliders.filter((c) => c.height > 2)) {
      for (let r = 0; r < 4; r++) {
        const c = r * PITCH;
        const acrossZ = b.maxZ > c - ROAD_HALF_WIDTH && b.minZ < c + ROAD_HALF_WIDTH;
        const acrossX = b.maxX > c - ROAD_HALF_WIDTH && b.minX < c + ROAD_HALF_WIDTH;
        expect(acrossZ, `building over the road at z=${c}`).toBe(false);
        expect(acrossX, `building over the road at x=${c}`).toBe(false);
      }
    }
  });

  it('never overlaps two buildings', () => {
    const c = d.colliders;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) expect(overlaps(c[i], c[j])).toBe(false);
  });

  it('spawns the hero on open ground inside the bounds', () => {
    const s = d.spawn;
    expect(s.x > d.bounds.minX && s.x < d.bounds.maxX && s.z > d.bounds.minZ && s.z < d.bounds.maxZ).toBe(true);
    for (const b of d.colliders) expect(s.x > b.minX && s.x < b.maxX && s.z > b.minZ && s.z < b.maxZ).toBe(false);
  });

  it('is the same every time', () => {
    expect(buildDistrict(4)).toEqual(d);
  });
});

describe('HeroMotor', () => {
  const open: Box = { minX: -100, maxX: 100, minZ: -100, maxZ: 100, height: 100 };
  const run = (m: HeroMotor, i: HeroIntent, seconds: number) => {
    for (let n = 0; n < seconds / DT; n++) m.step(i, DT);
  };

  it('walks, jogs and sprints at their speeds', () => {
    for (const [over, speed] of [[{ walk: true }, WALK_SPEED], [{}, JOG_SPEED], [{ sprint: true }, SPRINT_SPEED]] as const) {
      const m = new HeroMotor([], open);
      run(m, still({ forward: 1, ...over }), 1);
      expect(m.speed).toBeCloseTo(speed, 1);
    }
  });

  it('moves relative to the camera', () => {
    const m = new HeroMotor([], open);
    // Camera turned to look along +x (yaw -90°): forward is +x.
    run(m, still({ forward: 1, cameraYaw: -Math.PI / 2 }), 0.5);
    expect(m.x).toBeGreaterThan(1);
    expect(Math.abs(m.z)).toBeLessThan(0.01);
    // And the hero turns to face where it is going (+x is facing +90°).
    expect(m.facing).toBeCloseTo(Math.PI / 2, 1);
  });

  it('jumps and lands', () => {
    const m = new HeroMotor([], open);
    m.step(still({ jumpPressed: true }), DT);
    expect(m.fx).toContain('jump');
    let top = 0;
    let landed = false;
    for (let n = 0; n < 240; n++) {
      m.step(still(), DT);
      top = Math.max(top, m.y);
      if (m.fx.includes('land')) landed = true;
    }
    expect(top).toBeGreaterThan(0.8);
    expect(landed).toBe(true);
    expect(m.y).toBe(0);
  });

  it('cannot walk through a building, and slides along it', () => {
    const wall: Box = { minX: 2, maxX: 4, minZ: -10, maxZ: 10, height: 20 };
    const m = new HeroMotor([wall], open);
    // Push diagonally into the wall: stopped in x, still moving in z.
    run(m, still({ forward: 1, right: 1, cameraYaw: -Math.PI / 2 }), 2);
    expect(m.x).toBeLessThanOrEqual(2 - 0.34);
    expect(m.z).toBeGreaterThan(2);
  });

  it('stays inside the district', () => {
    const m = new HeroMotor([], { minX: -5, maxX: 5, minZ: -5, maxZ: 5, height: 100 });
    run(m, still({ forward: 1, sprint: true }), 5);
    expect(m.z).toBeGreaterThan(-5);
  });

  it('faces the camera while aiming, even when strafing', () => {
    const m = new HeroMotor([], open);
    run(m, still({ right: 1, faceCamera: true }), 1);
    // Camera yaw 0 looks along -z, which is facing ±180°.
    expect(Math.abs(Math.abs(m.facing) - Math.PI)).toBeLessThan(0.05);
  });

  it('never ends up inside a building of the real district', () => {
    const d = buildDistrict(4);
    const m = new HeroMotor(d.colliders, d.bounds);
    m.place(d.spawn.x, d.spawn.z, 0);
    // Sprint around in a slow spiral for a while.
    const inside: string[] = [];
    for (let n = 0; n < 120 * 30; n++) {
      m.step(still({ forward: 1, right: 0.3, cameraYaw: n * 0.0015, sprint: true }), DT);
      for (const b of d.colliders) {
        if (m.x > b.minX + 0.01 && m.x < b.maxX - 0.01 && m.z > b.minZ + 0.01 && m.z < b.maxZ - 0.01) inside.push(`${n}: ${m.x},${m.z}`);
      }
    }
    expect(inside).toEqual([]);
  });
});
