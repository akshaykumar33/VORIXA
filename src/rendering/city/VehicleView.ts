import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Vehicle } from '../../city/Vehicle';
import { ParticleRenderer } from '../ParticleRenderer';

/**
 * Draws VORIXA City's cars (ADR-0014, phase 3) from Quaternius's Realistic Car Pack: the body,
 * wheels that spin with the road and front wheels that steer, a little body roll and dive, and
 * smoke from a wreck. Read-only with respect to the `Vehicle` simulation.
 */

interface CarView {
  root: THREE.Group;
  body: THREE.Object3D;
  spinners: THREE.Object3D[];
  steerers: THREE.Object3D[];
  wheelRadius: number;
  roll: number;
  pitch: number;
  lastSpeed: number;
  smoke: number;
}

/** Moves a wheel's geometry so its node sits at the wheel's centre: spin and steer turn about it. */
function pivotAtCentre(node: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(node);
  const centre = box.getCenter(new THREE.Vector3());
  node.parent?.worldToLocal(centre);
  const shift = centre.clone().sub(node.position);
  node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.translate(-shift.x, -shift.y, -shift.z);
    }
  });
  node.position.add(shift);
  return (box.max.y - box.min.y) / 2;
}

export class VehicleView {
  public readonly group = new THREE.Group();
  private readonly cars = new Map<number, CarView>();
  private readonly particles = new ParticleRenderer(300);
  private readonly wreckMaterial = new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.9 });

  public constructor(private readonly gltf: GLTF) {
    this.group.add(this.particles.object);
  }

  private viewFor(v: Vehicle): CarView {
    let view = this.cars.get(v.id);
    if (view) return view;
    const source = this.gltf.scene.getObjectByName(v.spec.model);
    const model = source ? source.clone(true) : new THREE.Group();
    model.position.set(0, 0, 0);
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.add(model);
    root.add(body);
    this.group.add(root);
    const spinners: THREE.Object3D[] = [];
    const steerers: THREE.Object3D[] = [];
    let wheelRadius = 0.3;
    root.updateMatrixWorld(true);
    for (const child of [...model.children]) {
      const name = child.name.toLowerCase();
      if (!name.includes('wheel')) continue;
      wheelRadius = pivotAtCentre(child);
      if (name.includes('front')) {
        // Steer on an outer pivot, spin on the wheel itself.
        const steer = new THREE.Group();
        steer.position.copy(child.position);
        child.position.set(0, 0, 0);
        model.add(steer);
        steer.add(child);
        steerers.push(steer);
      }
      spinners.push(child);
    }
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.isMeshStandardMaterial) {
        const dark = m.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.08;
        // Paint gleams, glass and tyres stay dark and dull.
        m.roughness = dark ? 0.55 : 0.28;
        m.metalness = dark ? 0.1 : 0.35;
        m.envMapIntensity = 1.2;
      }
    });
    view = { root, body, spinners, steerers, wheelRadius, roll: 0, pitch: 0, lastSpeed: 0, smoke: 0 };
    this.cars.set(v.id, view);
    return view;
  }

  public update(vehicles: readonly Vehicle[], dt: number): void {
    for (const v of vehicles) {
      const view = this.viewFor(v);
      view.root.position.set(v.x, 0, v.z);
      view.root.rotation.y = v.heading;
      const along = v.forwardSpeed;
      for (const w of view.spinners) w.rotation.x += (along * dt) / Math.max(0.15, view.wheelRadius);
      for (const s of view.steerers) s.rotation.y = v.steer;
      // Dive under braking, squat under power, lean out of turns.
      const accel = (along - view.lastSpeed) / Math.max(1e-3, dt);
      view.lastSpeed = along;
      view.pitch += (Math.max(-0.05, Math.min(0.05, -accel * 0.004)) - view.pitch) * Math.min(1, 6 * dt);
      view.roll += (Math.max(-0.07, Math.min(0.07, v.slip * 0.01 + v.steer * along * 0.002)) - view.roll) * Math.min(1, 6 * dt);
      view.body.rotation.set(view.pitch, 0, view.roll);
      if (v.health <= 0) {
        view.body.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.material !== this.wreckMaterial) mesh.material = this.wreckMaterial;
        });
      }
      // Smoke from the engine when badly damaged.
      if (v.health < 35) {
        view.smoke -= dt;
        if (view.smoke <= 0) {
          view.smoke = v.health <= 0 ? 0.08 : 0.2;
          const f = 1.6;
          this.particles.burst('smoke', v.x + Math.sin(v.heading) * f, 1.1, v.z + Math.cos(v.heading) * f, { intensity: v.health <= 0 ? 0.8 : 0.4 });
        }
      }
    }
    this.particles.update(dt);
  }

  public crash(x: number, z: number, impact: number): void {
    this.particles.burst('smash', x, 0.7, z, { intensity: Math.min(1.5, impact / 12) });
  }
}
