import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MOVES, type Fighter, type MoveId } from '../../fighter/Fight';
import { People, type Person } from '../city/People';
import type { CharacterDef } from '../../city/Crew';

/**
 * A fighter drawn (ADR-0016): a cast person playing the clip for their state, turned to face
 * their opponent, with kicks posed over the clip.
 *
 * The cast's CC0 library has no kicks, so a kick turns the kicking leg's bones to point where the
 * kick goes, in world space, blended in and out over the move. Pointing a bone by the direction to
 * its child works on any skeleton orientation, so nothing depends on the rig's local axes.
 */

/** The base clip for each move, and for kicks, where the leg points (degrees above straight down). */
const MOVE_CLIP: Record<MoveId, { clip: string; kick?: { lift: number; low?: boolean } }> = {
  jab: { clip: 'Punch_Jab' },
  cross: { clip: 'Punch_Cross' },
  hook: { clip: 'Melee_Hook' },
  frontKick: { clip: 'Idle_Shield_Loop', kick: { lift: 70 } },
  roundhouse: { clip: 'Idle_Shield_Loop', kick: { lift: 95 } },
  lowJab: { clip: 'Punch_Jab' },
  lowKick: { clip: 'Crouch_Idle_Loop', kick: { lift: 62, low: true } },
  sweep: { clip: 'Crouch_Idle_Loop', kick: { lift: 82, low: true } },
  airPunch: { clip: 'Punch_Cross' },
  airKick: { clip: 'NinjaJump_Idle_Loop', kick: { lift: 55 } },
  blast: { clip: 'Spell_Simple_Shoot' },
  dashStrike: { clip: 'Shield_Dash' },
  super: { clip: 'Spell_Simple_Shoot' }
};

/** Crouching moves are played standing with the body lowered. */
const CROUCHED = new Set<MoveId>(['lowJab']);

export class FighterView {
  public readonly root = new THREE.Group();
  public readonly person: Person;
  private readonly thigh: THREE.Object3D | null;
  private readonly calf: THREE.Object3D | null;
  private readonly foot: THREE.Object3D | null;
  private readonly aura: THREE.PointLight;
  private hitAlt = false;
  private lastState = '';
  private lastMove: MoveId | null = null;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly pq = new THREE.Quaternion();

  public constructor(people: People, gltf: GLTF, def: CharacterDef, private readonly colour: number) {
    this.person = people.makeFrom(gltf, def, 0.3);
    this.root.add(this.person.root);
    this.person.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const m = this.person.model;
    this.thigh = m.getObjectByName('thigh_r') ?? null;
    this.calf = m.getObjectByName('calf_r') ?? null;
    this.foot = m.getObjectByName('foot_r') ?? null;
    // Their energy glows on them while they charge a blast or a super.
    this.aura = new THREE.PointLight(colour, 0, 4, 2);
    this.aura.position.set(0, 1.2, 0.4);
    this.root.add(this.aura);
    People.play(this.person, 'Idle_Shield_Loop', 0);
  }

  /** Plays the clip for the fighter's state, places and turns them, and poses kicks. */
  public update(f: Fighter, dt: number, walkingBack: boolean): void {
    const p = this.person;
    this.root.position.set(f.x, f.y, 0);
    // The cast face +z; turn them to face along x toward the opponent.
    const yaw = f.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (['stand', 'walk', 'crouch', 'attack', 'jump', 'blockstun', 'hitstun'].includes(f.state)) this.root.rotation.y = yaw;

    const changed = f.state !== this.lastState || f.move !== this.lastMove;
    this.lastState = f.state;
    this.lastMove = f.move;
    let lower = 0;
    switch (f.state) {
      case 'stand':
        People.play(p, f.blocking ? 'Sword_Block' : 'Idle_Shield_Loop', 0.15);
        break;
      case 'walk':
        People.play(p, f.blocking && walkingBack ? 'Sword_Block' : 'Walk_Loop', 0.15, false, walkingBack ? -0.8 : 1.1);
        break;
      case 'crouch':
        People.play(p, 'Crouch_Idle_Loop', 0.12);
        break;
      case 'jump':
        if (f.move) this.playMove(f, changed);
        else People.play(p, f.vy > 0 && f.t < 0.15 ? 'NinjaJump_Start' : 'NinjaJump_Idle_Loop', 0.1, f.vy > 0 && f.t < 0.15);
        break;
      case 'attack':
        this.playMove(f, changed);
        if (f.move && CROUCHED.has(f.move)) lower = 0.32;
        break;
      case 'hitstun':
        if (changed) {
          this.hitAlt = !this.hitAlt;
          this.restart(this.hitAlt ? 'Hit_Head' : 'Hit_Chest', 0.06);
        }
        break;
      case 'blockstun':
        People.play(p, 'Sword_Block', 0.06);
        break;
      case 'knockdown':
        if (changed) this.restart('Hit_Knockback', 0.05);
        break;
      case 'getup':
        if (changed) this.restart('LayToIdle', 0.1, 1.6);
        break;
      case 'ko':
        if (changed) this.restart('Death01', 0.15);
        break;
      case 'win':
        People.play(p, f.t < 1.4 ? 'Yes' : 'Idle_FoldArms_Loop', 0.3, f.t < 1.4);
        break;
    }
    this.person.root.position.y = -lower;
    p.mixer.update(dt);

    // Kicks: turn the leg to its target, blended over the move's frames.
    const plan = f.move ? MOVE_CLIP[f.move].kick : undefined;
    if (plan && f.move && this.thigh && this.calf && this.foot) {
      const m = MOVES[f.move];
      const total = m.startup + m.active + m.recover;
      const k = f.t < m.startup ? f.t / m.startup : f.t < m.startup + m.active ? 1 : Math.max(0, 1 - (f.t - m.startup - m.active) / m.recover);
      const weight = f.state === 'jump' ? Math.min(1, f.t / 0.06) : Math.min(1, k * 1.1);
      if (weight > 0 && f.t < total + 0.05) this.kick(f.facing, plan.lift, weight);
    }

    const charging = f.state === 'attack' && (f.move === 'blast' || f.move === 'super');
    const target = charging ? (f.move === 'super' ? 9 : 4) : 0;
    this.aura.intensity += (target - this.aura.intensity) * Math.min(1, dt * 12);
  }

  private playMove(f: Fighter, changed: boolean): void {
    if (!f.move || !changed) return;
    const m = MOVES[f.move];
    const name = MOVE_CLIP[f.move].clip;
    const action = this.person.actions.get(name);
    // Strikes play their clip over the move's length, so the hand lands on the active frames.
    const total = m.startup + m.active + m.recover;
    const speed = action && !MOVE_CLIP[f.move].kick ? Math.max(0.6, Math.min(3, action.getClip().duration / total)) : 1;
    this.restart(name, 0.06, speed, !MOVE_CLIP[f.move].kick);
  }

  private restart(name: string, fade: number, speed = 1, once = true): void {
    const p = this.person;
    // Restart even when it is already playing (a second hit replays the reaction), fading out
    // whatever was on before.
    const previous = p.actions.get(p.current);
    p.current = '';
    People.play(p, name, fade, once, speed);
    const next = p.actions.get(name);
    if (previous && previous !== next) previous.fadeOut(fade);
  }

  /** Points `bone` so its child lies along `dir` (world space), by `weight`. */
  private aim(bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3, weight: number): void {
    bone.updateWorldMatrix(true, true);
    bone.getWorldPosition(this.a);
    child.getWorldPosition(this.b);
    const current = this.b.sub(this.a).normalize();
    this.q.setFromUnitVectors(current, dir);
    // World rotation → the bone's parent space, applied on top of the clip's pose.
    bone.parent!.getWorldQuaternion(this.pq);
    const local = this.pq.clone().invert().multiply(this.q).multiply(this.pq);
    const target = local.multiply(bone.quaternion);
    bone.quaternion.slerp(target, weight);
  }

  private kick(facing: 1 | -1, liftDeg: number, weight: number): void {
    const lift = THREE.MathUtils.degToRad(liftDeg);
    // Straight down is (0, -1, 0); the kick swings it forward toward the opponent.
    const dir = new THREE.Vector3(Math.sin(lift) * facing, -Math.cos(lift), 0).normalize();
    this.aim(this.thigh!, this.calf!, dir, weight);
    this.aim(this.calf!, this.foot!, dir, weight);
    this.person.model.updateMatrixWorld(true);
  }

  public dispose(): void {
    this.root.removeFromParent();
  }

  /** Where the fighter's chest is, for effects. */
  public chest(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.root.position.x, this.root.position.y + 1.3, 0);
  }

  public get energy(): number {
    return this.colour;
  }
}
