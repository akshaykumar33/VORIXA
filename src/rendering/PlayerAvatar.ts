import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createGltfLoader } from './GltfAssets';
import {
  findClip,
  runnerAction,
  runPlaybackRate,
  type RunnerAction,
  type RunnerState
} from './ThirdPerson';

/**
 * The runner the third-person camera follows.
 *
 * The model is configuration, not code: `RUNNER_MODEL` names a file, a scale and the speed its
 * run cycle was authored at. The current model is a stand-in; the proper character from the art
 * pack replaces it by editing that one constant, with no change to how it is animated or placed.
 *
 * Failure is survivable: if the model cannot load, the game still plays — it simply shows no
 * runner, exactly as the first-person view never did.
 */

export interface RunnerModel {
  url: string;
  scale: number;
  /**
   * Ground speed, in units per second, at which the run clip's feet match the floor. Playback is
   * scaled against this so the runner does not skate.
   */
  clipSpeed: number;
}

/**
 * Stand-in runner until the art pack arrives. Its one clip is a walk, so the keyword matcher maps
 * every action onto it — adequate for checking the camera, not the final look.
 */
export const RUNNER_MODEL: RunnerModel = {
  url: '/characters/CesiumMan.glb',
  scale: 1.15,
  clipSpeed: 1.6
};

/**
 * glTF defines a model's front as +Z. The game faces -Z at yaw 0, because that is the direction
 * the course runs — so every model needs a half turn to face where it is going.
 */
const GLTF_FACING_OFFSET = Math.PI;

/** Crossfade between actions. Long enough to hide the cut, short enough to read as responsive. */
const CROSSFADE = 0.18;

export interface AvatarPose extends RunnerState {
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class PlayerAvatar {
  private readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<RunnerAction, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentAction: RunnerAction | null = null;
  private ready = false;

  public get object(): THREE.Object3D {
    return this.root;
  }

  public get loaded(): boolean {
    return this.ready;
  }

  public async load(model: RunnerModel = RUNNER_MODEL): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(model.url);
      const body = cloneSkinned(gltf.scene);
      body.scale.setScalar(model.scale);
      body.rotation.y = GLTF_FACING_OFFSET;
      body.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        // The runner sits inside the player-centred shadow frustum, so it can cast cheaply — and a
        // character with no shadow reads as pasted onto the scene rather than standing in it.
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      this.root.add(body);

      this.mixer = new THREE.AnimationMixer(body);
      const names = gltf.animations.map((clip) => clip.name);
      for (const action of ['idle', 'run', 'jump', 'slide'] as const) {
        let index = findClip(names, action);
        // Fall back to any clip at all: a runner with one generic cycle beats a frozen T-pose.
        if (index === -1 && gltf.animations.length > 0) index = 0;
        if (index === -1) continue;
        this.actions.set(action, this.mixer.clipAction(gltf.animations[index]));
      }

      this.clipSpeed = model.clipSpeed;
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  private clipSpeed = 1;

  public update(pose: AvatarPose, dt: number): void {
    if (!this.ready || !this.mixer) return;

    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.yaw;

    const action = runnerAction(pose);
    if (action !== this.currentAction) this.play(action);
    if (this.current && action === 'run') {
      this.current.timeScale = runPlaybackRate(pose.speed, this.clipSpeed);
    }

    this.mixer.update(dt);
  }

  private play(action: RunnerAction): void {
    const next = this.actions.get(action);
    this.currentAction = action;
    if (!next || next === this.current) return;

    next.reset().setEffectiveWeight(1).play();
    if (this.current) next.crossFadeFrom(this.current, CROSSFADE, false);
    this.current = next;
  }

  public setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  public dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
    this.ready = false;
  }
}
