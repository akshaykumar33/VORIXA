import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildDistrict } from '../src/city/CityLayout';
import { Chaos } from '../src/city/Chaos';
import { Combat } from '../src/city/Combat';
import { HeroMotor } from '../src/city/HeroMotor';
import { Outposts, buildOutposts } from '../src/city/Outposts';
import { buildLadders } from '../src/city/Rooftops';

/**
 * The city's newer views, run for real in Node: built from the real layouts and driven through
 * a fight (blasts, fires, an alarm, a liberation, the glider). No GPU is involved (nothing is drawn),
 * so this catches what the type checker cannot: a geometry merge that fails, a bad index, an update
 * that throws on the second frame. Canvas textures get a stand-in 2D context.
 */

beforeAll(() => {
  const ctx = new Proxy(
    {},
    {
      get: (_t, key) => (key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
      set: () => true
    }
  );
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx })
  };
});

const DT = 1 / 60;
const d = buildDistrict(4);
const defs = buildOutposts(d.pitch);

// A fight's worth of frames for thirty guards: slow under a full parallel test run, so the budget is generous.
describe('City views (no GPU)', { timeout: 20000 }, () => {
  it('ChaosView: fuel, blasts, a chain, fires and their lights, frame after frame', async () => {
    const { ChaosView } = await import('../src/rendering/city/ChaosView');
    const camera = new THREE.PerspectiveCamera();
    const view = new ChaosView(camera);
    const chaos = new Chaos();
    const combat = new Combat(d.colliders, d.bounds);
    new Outposts(defs).populate(combat, chaos);
    view.setExplosives(chaos);
    camera.position.set(defs[0].x, 2, defs[0].z + 20);
    chaos.damage(chaos.explosives[0], 100);
    chaos.damage(chaos.explosives[3], 5);
    let blasts = 0;
    for (let t = 0; t < 4; t += DT) {
      chaos.step(DT);
      for (const fx of chaos.fx) if (fx.type === 'blast') {
        view.blast(fx.blast);
        blasts++;
      }
      view.update(chaos, DT);
    }
    expect(blasts).toBeGreaterThanOrEqual(5);
    expect(view.shake).toBeGreaterThanOrEqual(0);
    // Something is on fire and lit, and nothing in the group has a missing geometry.
    let broken = 0;
    view.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.geometry) broken++;
    });
    expect(broken).toBe(0);
    const lights = view.group.children.filter((o) => (o as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(lights.some((l) => l.intensity > 0)).toBe(true);
  });

  it('OutpostView: barricades, banners and the alarm through held, alerted, ringing and liberated', async () => {
    const { OutpostView } = await import('../src/rendering/city/OutpostView');
    const view = new OutpostView(defs, '#8a6cf0');
    const meshes: THREE.Mesh[] = [];
    view.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const merged = meshes.filter((m) => (m.geometry.getAttribute('position')?.count ?? 0) > 5000);
    expect(merged.length).toBeGreaterThanOrEqual(2);
    const combat = new Combat([...d.colliders, ...defs.flatMap((o) => [...o.barricades, ...o.sandbags])], d.bounds);
    const outposts = new Outposts(defs);
    outposts.populate(combat, new Chaos());
    const hero = new HeroMotor(d.colliders, d.bounds);
    hero.place(defs[0].x, defs[0].z, 0);
    const cam = new THREE.Vector3(defs[0].x, 2, defs[0].z);
    const states = new Set<string>();
    for (let t = 0; t < 20; t += DT) {
      combat.step(DT, hero, () => {});
      combat.hp = 100;
      outposts.step(DT, combat);
      if (t > 15) for (const e of combat.enemies) if (e.post === 1) e.state = 'dead';
      view.update(outposts, DT, cam);
      states.add(outposts.stateOf(defs[0].id));
    }
    expect([...states]).toEqual(expect.arrayContaining(['alerted', 'alarm', 'liberated']));
  });

  it('RooftopView: ladders on the buildings, and the glider opening, banking and folding', async () => {
    const { RooftopView } = await import('../src/rendering/city/RooftopView');
    const ladders = buildLadders(d);
    const view = new RooftopView(ladders, '#8a6cf0');
    const ladderMesh = view.group.children.find((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('position').count > 1000);
    expect(ladderMesh).toBeDefined();
    view.setGliding(true);
    for (let t = 0; t < 1; t += DT) view.update(DT, 0.8, ladders[0].x, ladders[0].z);
    expect(view.glider.visible).toBe(true);
    expect(Math.abs(view.glider.rotation.z)).toBeGreaterThan(0.05);
    view.setGliding(false);
    for (let t = 0; t < 1; t += DT) view.update(DT, 0, ladders[0].x, ladders[0].z);
    expect(view.glider.visible).toBe(false);
  });
});
