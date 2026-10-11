import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Animated people: Kenney's Mini Characters (CC0, see docs/CREDITS.md), served from
 * `public/chars`. Twelve characters share one skeleton, one texture atlas and one set of 32
 * animation clips, so every clone shares one material and the clips are loaded once per model.
 *
 * Loading is lazy and never blocks a frame: `spawn()` returns null until a model has arrived, and
 * callers keep drawing whatever stood in for it (or nothing) until then.
 */

export const CHARACTER_NAMES = [
  'male-a', 'female-a', 'male-b', 'female-b', 'male-c', 'female-c',
  'male-d', 'female-d', 'male-e', 'female-e', 'male-f', 'female-f'
] as const;
export type CharacterName = (typeof CHARACTER_NAMES)[number];

/** The clips this game uses; the files carry more. */
export type CharacterAnim =
  | 'idle' | 'walk' | 'sprint' | 'jump' | 'fall' | 'crouch' | 'drive' | 'die'
  | 'emote-yes' | 'emote-no' | 'holding-right' | 'holding-right-shoot' | 'attack-kick-right' | 'pick-up';

/** The models are 0.67 units tall; this makes a 1.5 m person. */
export const PERSON_SCALE = 2.2;

interface Loaded {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

/** One animated person. Call `update` every frame it is visible. */
export class Character {
  public readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private current: THREE.AnimationAction | null = null;
  private currentName = '';

  public constructor(model: THREE.Object3D, private readonly clips: Map<string, THREE.AnimationClip>) {
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
  }

  public get playing(): string {
    return this.currentName;
  }

  /**
   * Crossfades to a clip. Replaying the current looping clip is a no-op, so this is safe to call
   * every frame with the desired state. `once` clips hold their last frame.
   */
  public play(name: CharacterAnim, options: { fade?: number; once?: boolean; speed?: number; restart?: boolean } = {}): void {
    const clip = this.clips.get(name);
    if (!clip) return;
    if (name === this.currentName && !options.restart) {
      if (this.current && options.speed !== undefined) this.current.timeScale = options.speed;
      return;
    }
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.timeScale = options.speed ?? 1;
    action.setLoop(options.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = !!options.once;
    const fade = options.fade ?? 0.15;
    if (this.current && this.current !== action) this.current.crossFadeTo(action, fade, false);
    action.play();
    this.current = action;
    this.currentName = name;
  }

  /** Starts the current clip at a given point, so a crowd does not move in lockstep. */
  public offset(seconds: number): void {
    if (this.current) this.current.time = seconds % this.current.getClip().duration;
  }

  public update(dt: number): void {
    this.mixer.update(dt);
  }
}

export class CharacterLibrary {
  private readonly loader = new GLTFLoader();
  private readonly models = new Map<CharacterName, Loaded>();
  private readonly pending = new Map<CharacterName, Promise<Loaded | null>>();
  private sharedMaterial: THREE.Material | null = null;

  /**
   * @param prepareMaterial Adjusts the one shared material once (Rush bends it onto the curved
   *   world). Every clone of every character then uses that material.
   */
  public constructor(
    private readonly baseUrl = '/chars/',
    private readonly prepareMaterial: (material: THREE.MeshStandardMaterial) => THREE.Material = (m) => m
  ) {}

  /** A new animated person, or null while the model is still loading (the load is started). */
  public spawn(name: CharacterName): Character | null {
    const loaded = this.models.get(name);
    if (!loaded) {
      void this.load(name);
      return null;
    }
    const model = cloneSkinned(loaded.scene);
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.material = this.material(mesh.material as THREE.MeshStandardMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Skinned bounds are computed in the bind pose; animation moves limbs outside them.
      mesh.frustumCulled = false;
    });
    return new Character(model, loaded.clips);
  }

  public has(name: CharacterName): boolean {
    return this.models.has(name);
  }

  public load(name: CharacterName): Promise<Loaded | null> {
    let promise = this.pending.get(name);
    if (!promise) {
      promise = this.loader
        .loadAsync(`${this.baseUrl}character-${name}.glb`)
        .then((gltf) => {
          const loaded: Loaded = { scene: gltf.scene, clips: new Map(gltf.animations.map((c) => [c.name, c])) };
          this.models.set(name, loaded);
          return loaded;
        })
        .catch((error: unknown) => {
          console.warn(`[characters] could not load ${name}`, error);
          return null;
        });
      this.pending.set(name, promise);
    }
    return promise;
  }

  private material(original: THREE.MeshStandardMaterial): THREE.Material {
    if (!this.sharedMaterial) {
      // A soft, slightly glossy skin for the flat-coloured atlas: reads as vinyl, not as clay.
      original.roughness = 0.55;
      original.metalness = 0;
      this.sharedMaterial = this.prepareMaterial(original);
    }
    return this.sharedMaterial;
  }
}
