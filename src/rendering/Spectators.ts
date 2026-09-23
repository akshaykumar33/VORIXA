import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { streamFor } from '../world/Rng';

/**
 * Animated spectators lining the course.
 *
 * Everything in this world so far is procedural geometry — panels, boxes, silhouettes. That is
 * fine for architecture and wrong for life: a swept delta reads as a craft, but nothing built from
 * primitives reads as *someone watching you*. Real rigged models with real animation cycles are
 * the only thing that does.
 *
 * Models are glTF from the Khronos sample set, chosen because they are permissively licensed,
 * genuinely animated, and small. Attribution lives in `docs/CREDITS.md` — CC-BY requires it, and
 * a game that ships borrowed art without credit is not something to hand anyone.
 *
 * ## A fixed pool, not per-segment spawning
 *
 * Skinned meshes are expensive to clone: each needs its own skeleton and animation mixer. Building
 * them per streamed segment would mean constructing and discarding rigs every few seconds, which
 * is exactly the churn the streaming design exists to avoid.
 *
 * Instead a bounded pool is created once and repositioned as the player advances, the same
 * approach the dust and the rivals use. The count is fixed, the cost is flat, and no skeleton is
 * ever built twice.
 */

export interface SpectatorModel {
  url: string;
  /** Uniform scale to bring the model to roughly human height in world units. */
  scale: number;
  /** Which animation clip to play. Index, because clip names vary between models. */
  clip: number;
}

/**
 * The cast.
 *
 * Fox has Survey, Walk and Run cycles; Survey (0) is the idle-ish one, which is what a spectator
 * should be doing. CesiumMan has a single walk.
 */
export const SPECTATOR_MODELS: readonly SpectatorModel[] = [
  { url: '/characters/Fox.glb', scale: 0.03, clip: 0 },
  { url: '/characters/CesiumMan.glb', scale: 1.45, clip: 0 }
];

/** How many spectators exist at once. Flat cost, however far the player runs. */
const POOL_SIZE = 22;
/** Clearance from the centre line. Spectators are beside the track, never on it. */
const MIN_OFFSET = 9;
const MAX_OFFSET = 19;
/** Corridor ahead of the player that spectators are recycled into. */
const AHEAD = 220;
const BEHIND = 60;

interface Spectator {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  z: number;
  side: number;
  offset: number;
  height: number;
}

export class SpectatorCrowd {
  private readonly group = new THREE.Group();
  private readonly spectators: Spectator[] = [];
  private ready = false;
  private recycleIndex = 0;

  public get object(): THREE.Object3D {
    return this.group;
  }

  public get loaded(): boolean {
    return this.ready;
  }

  /**
   * Loads the models and builds the pool.
   *
   * Failure is survivable and silent: the crowd simply never appears. A decorative asset that
   * cannot be fetched must not stop the game starting, and on a flaky connection that is the
   * difference between a slightly emptier roadside and a blank screen.
   */
  public async load(seed: number): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const loaded = await Promise.all(
        SPECTATOR_MODELS.map(async (model) => ({
          model,
          gltf: await loader.loadAsync(model.url)
        }))
      );

      for (let i = 0; i < POOL_SIZE; i++) {
        const rng = streamFor(seed, 4000 + i);
        const source = loaded[i % loaded.length];

        // SkeletonUtils.clone, not Object3D.clone: a plain clone shares the skeleton, so every
        // copy would animate identically and in lockstep — which reads as a row of puppets.
        const root = cloneSkinned(source.gltf.scene);
        const scale = source.model.scale * rng.range(0.85, 1.15);
        root.scale.setScalar(scale);

        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            // No shadow casting: spectators sit well outside the shadow cascade that follows the
            // player, so they would cost fill rate for a shadow that lands nowhere.
            (child as THREE.Mesh).castShadow = false;
            (child as THREE.Mesh).receiveShadow = false;
          }
        });

        const mixer = new THREE.AnimationMixer(root);
        const clips = source.gltf.animations;
        if (clips.length > 0) {
          const action = mixer.clipAction(clips[Math.min(source.model.clip, clips.length - 1)]);
          // Random phase and slightly varied rate, or fourteen spectators breathe as one organism.
          action.time = rng.range(0, clips[0].duration);
          action.timeScale = rng.range(0.8, 1.25);
          action.play();
        }

        const spectator: Spectator = {
          root,
          mixer,
          z: -rng.range(10, AHEAD),
          side: rng.chance(0.5) ? 1 : -1,
          offset: rng.range(MIN_OFFSET, MAX_OFFSET),
          // Perched at varying heights so the crowd follows the terrain edge rather than a plane.
          height: rng.range(-2.5, 0.5)
        };

        this.place(spectator);
        this.group.add(root);
        this.spectators.push(spectator);
      }

      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  /**
   * Advances animation and recycles spectators the player has passed.
   *
   * Only one spectator is repositioned per frame. Moving several at once is imperceptible
   * individually but shows up as a cluster appearing together at the edge of view; staggering
   * spreads it into something the eye never catches.
   */
  public update(dt: number, playerZ: number): void {
    if (!this.ready) return;

    for (const spectator of this.spectators) spectator.mixer.update(dt);

    const candidate = this.spectators[this.recycleIndex % this.spectators.length];
    this.recycleIndex++;

    const behind = candidate.z > playerZ + BEHIND;
    const ahead = candidate.z < playerZ - AHEAD;
    if (behind || ahead) {
      candidate.z = playerZ - AHEAD * 0.92;
      this.place(candidate);
    }
  }

  /** Positions a spectator and turns it to face the track. */
  private place(spectator: Spectator): void {
    spectator.root.position.set(spectator.side * spectator.offset, spectator.height, spectator.z);
    // Face inward. A crowd staring away from the course is worse than no crowd.
    spectator.root.rotation.y = spectator.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  public dispose(): void {
    for (const spectator of this.spectators) {
      spectator.mixer.stopAllAction();
      spectator.root.removeFromParent();
    }
    this.spectators.length = 0;
    this.ready = false;
  }
}
