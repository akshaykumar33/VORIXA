import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { castClips, gripOf } from '../src/rendering/city/People';
import { CANTOR, CHOIR, CITIZEN_MODELS, CREW, POLICE } from '../src/city/Crew';

/**
 * The realistic cast (ADR-0014) as shipped: every person's skeleton and the shared clips are read
 * from public/city/people and rebuilt as Three.js objects (no textures, no browser), then posed.
 */

const DIR = 'public/city/people';
let io: NodeIO;
let anims: THREE.AnimationClip[];
let animHips = 0;

/** A person's skeleton, as Three.js bones in a root group. */
function skeleton(doc: Document): THREE.Group {
  const root = new THREE.Group();
  const made = new Map<Node, THREE.Object3D>();
  const build = (n: Node, parent: THREE.Object3D) => {
    const o = new THREE.Bone();
    o.name = n.getName();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    parent.add(o);
    made.set(n, o);
    for (const c of n.listChildren()) build(c, o);
  };
  for (const n of doc.getRoot().listScenes()[0].listChildren()) build(n, root);
  root.updateMatrixWorld(true);
  return root;
}

function clips(doc: Document): THREE.AnimationClip[] {
  return doc.getRoot().listAnimations().map((a) => {
    const tracks = a.listChannels().map((ch) => {
      const s = ch.getSampler()!;
      const times = Array.from(s.getInput()!.getArray() as ArrayLike<number>);
      const values = Array.from(s.getOutput()!.getArray() as ArrayLike<number>);
      const name = `${ch.getTargetNode()!.getName()}.${ch.getTargetPath() === 'rotation' ? 'quaternion' : 'position'}`;
      return ch.getTargetPath() === 'rotation'
        ? new THREE.QuaternionKeyframeTrack(name, times, values)
        : new THREE.VectorKeyframeTrack(name, times, values);
    });
    return new THREE.AnimationClip(a.getName(), -1, tracks);
  });
}

async function person(model: string) {
  const doc = await io.read(`${DIR}/${model}.glb`);
  const root = skeleton(doc);
  const hips = root.getObjectByName('pelvis')!.position.length() / animHips;
  const mixer = new THREE.AnimationMixer(root);
  const set = castClips(anims, hips);
  const action = (name: string) => mixer.clipAction(set.find((c) => c.name === name)!);
  const at = (bone: string) => new THREE.Vector3().setFromMatrixPosition(root.getObjectByName(bone)!.matrixWorld);
  const pose = (name: string, t = 0) => {
    mixer.stopAllAction();
    const a = action(name);
    a.play();
    a.time = t;
    mixer.update(0);
    root.updateMatrixWorld(true);
  };
  return { doc, root, mixer, action, at, pose, set };
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(`${DIR}/mh-anims.glb`);
  anims = clips(doc);
  animHips = doc.getRoot().listNodes().find((n) => n.getName() === 'pelvis')!.getTranslation().reduce((s, v) => s + v * v, 0) ** 0.5;
});

const CAST = [...CREW, ...CHOIR, CANTOR, POLICE].map((c) => c.model).concat(CITIZEN_MODELS);

describe('The cast', () => {
  it('ships every person under the 2 MB file cap, on the clips’ skeleton', async () => {
    const bones = anims[0].tracks.map((t) => t.name.split('.')[0]);
    for (const model of CAST) {
      expect(fs.statSync(`${DIR}/${model}.glb`).size, model).toBeLessThan(2e6);
      const names = new Set((await io.read(`${DIR}/${model}.glb`)).getRoot().listNodes().map((n) => n.getName()));
      for (const b of bones) expect(names.has(b), `${model} ${b}`).toBe(true);
    }
  });

  it('has every clip the game asks for, under the game’s names', () => {
    const names = new Set(castClips(anims, 1).map((c) => c.name));
    for (const n of ['Idle', 'Walk', 'Run', 'Run_Back', 'Run_Left', 'Run_Right', 'Run_Shoot', 'Idle_Gun', 'Idle_Gun_Pointing',
      'Idle_Gun_Shoot', 'Gun_Shoot', 'Interact', 'Roll', 'Wave', 'Death', 'HitRecieve', 'Drive']) {
      expect(names.has(n), n).toBe(true);
    }
  });

  it('faces +z and keeps short and tall people’s feet on the ground', async () => {
    for (const model of ['mh-vex', 'mh-rook', 'mh-citizen-10', 'mh-citizen-11']) {
      const p = await person(model);
      p.pose('Idle', 0.5);
      expect(p.at('ball_l').z, model).toBeGreaterThan(p.at('foot_l').z);
      const lowest = Math.min(p.at('ball_l').y, p.at('ball_r').y, p.at('foot_l').y, p.at('foot_r').y);
      expect(lowest, model).toBeGreaterThan(-0.03);
      expect(lowest, model).toBeLessThan(0.1);
      // Standing tall: the head well above the hips.
      expect(p.at('head').y - p.at('pelvis').y, model).toBeGreaterThan(0.5);
    }
  });

  it('puts the pistol in the right hand, barrel forward and top up, when aiming', async () => {
    for (const model of ['mh-vex', 'mh-nova', 'mh-cantor']) {
      const p = await person(model);
      const hand = p.root.getObjectByName('hand_r')!;
      const grip = gripOf(p.root, hand, p.action('Idle_Gun_Pointing'))!;
      expect(grip, model).not.toBeNull();
      const gun = new THREE.Object3D();
      gun.position.copy(grip.position);
      gun.quaternion.copy(grip.quaternion);
      hand.add(gun);
      p.pose('Idle_Gun_Pointing');
      const q = gun.getWorldQuaternion(new THREE.Quaternion());
      const barrel = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const top = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      expect(barrel.z, model).toBeGreaterThan(0.99);
      expect(top.y, model).toBeGreaterThan(0.99);
      // In the hand: within a hand's width of the wrist, out in front of the chest.
      const at = gun.getWorldPosition(new THREE.Vector3());
      expect(at.distanceTo(p.at('hand_r')), model).toBeLessThan(0.12);
      expect(at.z, model).toBeGreaterThan(p.at('spine_03').z + 0.2);
      // And the gun stays in the hand once the person moves on.
      p.pose('Pistol_Reload', 0.6);
      expect(gun.getWorldPosition(new THREE.Vector3()).distanceTo(p.at('hand_r')), model).toBeLessThan(0.12);
    }
  });

  it('runs and guns: legs from the run, arms held in the aim', async () => {
    const p = await person('mh-vex');
    const ankles: number[] = [];
    const hands: THREE.Vector3[] = [];
    for (const t of [0, 0.2, 0.4]) {
      p.pose('Run_Shoot', t);
      ankles.push(p.at('foot_l').z - p.at('foot_r').z);
      hands.push(p.at('hand_r').sub(p.at('pelvis')));
    }
    // The feet swap over through the stride…
    expect(Math.max(...ankles) - Math.min(...ankles)).toBeGreaterThan(0.3);
    // …while the gun hand stays up and out front.
    for (const h of hands) {
      expect(h.z).toBeGreaterThan(0.3);
      expect(h.y).toBeGreaterThan(0.3);
    }
  });

  it('runs backwards as the forward run reversed', async () => {
    const run = castClips(anims, 1).find((c) => c.name === 'Run')!;
    const back = castClips(anims, 1).find((c) => c.name === 'Run_Back')!;
    expect(back.duration).toBeCloseTo(run.duration, 5);
    const a = run.tracks.find((t) => t.name === 'thigh_l.quaternion')!;
    const b = back.tracks.find((t) => t.name === 'thigh_l.quaternion')!;
    expect(Array.from(b.values.slice(0, 4))).toEqual(Array.from(a.values.slice(-4)));
  });
});
