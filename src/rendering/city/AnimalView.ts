import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Animal, AnimalKind, Wildlife } from '../../city/Wildlife';

/**
 * The wild animals drawn (ADR-0014, Far Cry layer): Quaternius' Ultimate Animated Animal Pack,
 * one skinned copy per animal, playing the clip that matches what it is doing: grazing (eating,
 * or idling between mouthfuls), walking, galloping, biting or goring, flinching, dying.
 *
 * The pack's animals are flat-coloured low-poly models. A fur grain is worked into their colour
 * (fine noise in world space, darker toward the belly), so they sit a little better next to the
 * realistic people, but they remain stylised.
 */

/** Height of each animal, head up, metres (the models come at their own scale). */
const HEIGHT: Record<AnimalKind, number> = { wolf: 1.0, deer: 1.7, stag: 2.2, fox: 0.55 };

const FUR = /* glsl */ `
  float furHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
`;

interface View {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
}

export class AnimalView {
  public readonly group = new THREE.Group();
  private readonly views = new Map<number, View>();
  private readonly fixes = new Map<AnimalKind, { scale: number; flip: boolean }>();

  public constructor(private readonly models: Record<AnimalKind, GLTF>) {
    for (const [kind, gltf] of Object.entries(models) as [AnimalKind, GLTF][]) {
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const scale = HEIGHT[kind] / Math.max(0.01, box.max.y - box.min.y);
      // Which way the head points: the animal must face +z, as people do.
      const head = gltf.scene.getObjectByName('Head');
      const tail = gltf.scene.getObjectByName('Tail1') ?? gltf.scene.getObjectByName('Torso') ?? null;
      const hz = head ? head.getWorldPosition(new THREE.Vector3()).z : 1;
      const tz = tail ? tail.getWorldPosition(new THREE.Vector3()).z : 0;
      this.fixes.set(kind, { scale, flip: hz < tz });
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats as THREE.MeshStandardMaterial[]) this.furnish(m);
      });
    }
  }

  private furnish(m: THREE.MeshStandardMaterial): void {
    if (m.userData.fur) return;
    m.userData.fur = true;
    const eye = /eye|nose|hoof|hooves|horn/i.test(m.name);
    m.roughness = eye ? 0.25 : 0.88;
    m.metalness = 0;
    if (eye) return;
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFurPos;\nvarying float vFurUp;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFurPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFurUp = objectNormal.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vFurPos;\nvarying float vFurUp;\n${FUR}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Fine strands of lighter and darker hair, and a darker belly.
            float strand = furHash(floor(vFurPos * vec3(90.0, 40.0, 90.0)));
            diffuseColor.rgb *= 0.86 + strand * 0.22;
            diffuseColor.rgb *= mix(0.78, 1.04, smoothstep(-0.6, 0.6, vFurUp));
          }`
        );
    };
    m.customProgramCacheKey = () => 'fur';
  }

  private viewFor(a: Animal): View {
    let v = this.views.get(a.id);
    if (v) return v;
    const gltf = this.models[a.kind];
    const fix = this.fixes.get(a.kind)!;
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(fix.scale);
    if (fix.flip) model.rotation.y = Math.PI;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    });
    const root = new THREE.Group();
    root.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    v = { root, mixer, actions, current: '' };
    this.views.set(a.id, v);
    this.group.add(root);
    return v;
  }

  private play(v: View, names: string[], fade = 0.25, once = false, speed = 1): void {
    const name = names.find((n) => v.actions.has(n));
    if (!name) return;
    const action = v.actions.get(name)!;
    action.timeScale = speed;
    if (v.current === name) return;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    const prev = v.actions.get(v.current);
    if (prev) prev.crossFadeTo(action, fade, false);
    action.play();
    v.current = name;
  }

  public update(life: Wildlife, dt: number, camera: THREE.Vector3): void {
    const live = new Set<number>();
    for (const a of life.animals) {
      live.add(a.id);
      const m = a.motor;
      // Only animals near enough to matter are drawn and animated.
      const far = Math.hypot(m.x - camera.x, m.z - camera.z) > 160;
      const v = this.viewFor(a);
      v.root.visible = !far;
      if (far) continue;
      v.root.position.set(m.x, m.y, m.z);
      v.root.rotation.y = m.facing;
      if (a.state === 'dead') this.play(v, ['Death'], 0.15, true);
      else if (a.hitTime < 0.35) this.play(v, ['Idle_HitReact1', 'Idle_HitReact2'], 0.08, true, 1.4);
      else if (a.biting > 0) this.play(v, a.kind === 'wolf' || a.kind === 'fox' ? ['Attack'] : ['Attack_Headbutt', 'Attack_Kick'], 0.08, true, 1.3);
      else if (m.speed > 3.5) this.play(v, ['Gallop'], 0.2, false, Math.max(0.7, m.speed / 8));
      else if (m.speed > 0.3) this.play(v, ['Walk'], 0.25, false, Math.max(0.6, m.speed / 1.5));
      else if (a.state === 'graze') this.play(v, a.id % 3 === 0 ? ['Idle', 'Idle_2'] : ['Eating', 'Idle'], 0.4);
      else this.play(v, ['Idle', 'Idle_2'], 0.3);
      v.mixer.update(dt);
    }
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      v.root.removeFromParent();
      this.views.delete(id);
    }
  }
}
