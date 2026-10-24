import * as THREE from 'three';
import type { Person } from '../city/People';
import type { Particles } from './Particles';

/**
 * Turns a cast person into an asura (ADR-0017): skin of their legend, glowing eyes, horns, a gold
 * crown and jewellery, a weapon, an aura of their power, and for Ravana, his ten heads.
 *
 * Props hang from the skeleton's bones. Bone axes differ from rig to rig, so each prop is built in
 * the character's own space (y up, +z forward) and turned, once, by the bone's rest orientation.
 * After that it follows the bone through every clip.
 */

export type Horns = 'buffalo' | 'ram' | 'small';
export type Aura = 'fire' | 'smoke' | 'blood' | 'gold' | 'dust' | 'feathers';

export interface AsuraLookSpec {
  skin: number;
  eyes: number;
  horns?: Horns;
  crown?: 'tall' | 'band';
  /** Extra spectral heads beside their own (Ravana: nine). */
  heads?: number;
  /** A crest of feathers (Bakasura). */
  crest?: boolean;
  weapon?: 'gada';
  scale?: number;
  aura: Aura;
}

const GOLD = new THREE.MeshStandardMaterial({ color: 0xd9a32e, metalness: 1, roughness: 0.28 });
const GEM = new THREE.MeshStandardMaterial({ color: 0xc8102e, emissive: 0x6a0010, metalness: 0.2, roughness: 0.1 });
const HORN = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.55, metalness: 0.05 });

const AURA_COLOURS: Record<Aura, number[]> = {
  fire: [0xff6a10, 0xffb21f, 0xff3d10],
  smoke: [0x2a2030, 0x45384f],
  blood: [0xa01020, 0x6e0812],
  gold: [0xffd23d, 0xffe9a0],
  dust: [0xb59a70, 0x8a7350],
  feathers: [0xf2f2ee, 0xd8dde0]
};

/** A bone-attached holder whose children are authored in the character's own space. */
function holder(bone: THREE.Object3D, root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const g = new THREE.Group();
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  g.quaternion.copy(boneQ.invert().multiply(rootQ));
  // Undo the bone's world scale so props keep their authored size.
  const s = bone.getWorldScale(new THREE.Vector3());
  const r = root.getWorldScale(new THREE.Vector3());
  g.scale.set(r.x / s.x, r.y / s.y, r.z / s.z);
  bone.add(g);
  return g;
}

function horn(kind: Horns, side: 1 | -1): THREE.Mesh {
  // A tapering tube along a curve: out to the side, then up (buffalo) or back and round (ram).
  const pts =
    kind === 'buffalo'
      ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12 * side, 0.02, 0.02), new THREE.Vector3(0.24 * side, 0.1, 0.02), new THREE.Vector3(0.28 * side, 0.24, -0.02)]
      : kind === 'ram'
      ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05 * side, 0.08, -0.06), new THREE.Vector3(0.11 * side, 0.02, -0.12), new THREE.Vector3(0.12 * side, -0.08, -0.04)]
      : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02 * side, 0.06, -0.01), new THREE.Vector3(0.05 * side, 0.11, -0.04)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const base = kind === 'small' ? 0.022 : 0.04;
  const geometry = new THREE.TubeGeometry(curve, 24, base, 10, false);
  // Taper toward the tip.
  const pos = geometry.attributes.position;
  const rings = 25;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 11);
    const k = 1 - (ring / (rings - 1)) * 0.92;
    const p = curve.getPoint(ring / (rings - 1));
    pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * k, p.y + (pos.getY(i) - p.y) * k, p.z + (pos.getZ(i) - p.z) * k);
  }
  geometry.computeVertexNormals();
  const m = new THREE.Mesh(geometry, HORN);
  m.castShadow = true;
  return m;
}

function crown(kind: 'tall' | 'band'): THREE.Group {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.05, 24, 1, true), GOLD);
  g.add(band);
  if (kind === 'tall') {
    // A mukut: tiers narrowing to a spire, with a red stone at the front.
    const profile = [0.1, 0.095, 0.085, 0.07, 0.045, 0.02, 0.004].map((r, i) => new THREE.Vector2(r, 0.025 + i * 0.04));
    const tiers = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), GOLD);
    g.add(tiers);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 6), GOLD);
      petal.position.set(Math.sin(a) * 0.1, 0.05, Math.cos(a) * 0.1);
      g.add(petal);
    }
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), GEM);
  gem.position.set(0, 0.01, 0.105);
  g.add(gem);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

function gada(): THREE.Group {
  // A mace: a long gold-bound shaft and a ribbed iron head with a spike.
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.9, 10), GOLD);
  shaft.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3a3430, metalness: 0.9, roughness: 0.35 }));
  head.scale.y = 1.25;
  head.position.y = 0.8;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 8), GOLD);
  tip.position.y = 0.98;
  g.add(shaft, head, tip);
  for (let i = 0; i < 8; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16, Math.PI), GOLD);
    rib.position.y = 0.8;
    rib.rotation.y = (i / 8) * Math.PI;
    rib.scale.y = 1.25;
    g.add(rib);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export class AsuraLook {
  /** Each copy of the head, its place in the fan, and the box of planes that keeps only its head. */
  private readonly heads: { mesh: THREE.SkinnedMesh; offset: number; box: THREE.Plane[] }[] = [];
  private readonly crowns: THREE.Object3D[] = [];
  private readonly headBone: THREE.Object3D | null;
  private readonly tmp = new THREE.Vector3();
  private emitT = 0;

  public constructor(private readonly person: Person, private readonly spec: AsuraLookSpec, scene: THREE.Scene) {
    const model = person.model;
    if (spec.scale) person.root.scale.setScalar(spec.scale);
    // Skin and eyes.
    for (const mesh of person.meshes) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list as THREE.MeshStandardMaterial[]) {
        const name = m.name.toLowerCase();
        if (name.includes('skin')) m.color.setHex(spec.skin);
        if (name === 'eyes') {
          m.emissive = new THREE.Color(spec.eyes);
          m.emissiveIntensity = 3;
        }
      }
    }
    this.headBone = model.getObjectByName('head') ?? null;
    const head = this.headBone;
    if (head) {
      const h = holder(head, person.root);
      if (spec.horns) {
        for (const side of [1, -1] as const) {
          const m = horn(spec.horns, side);
          m.position.set(0.07 * side, spec.horns === 'buffalo' ? 0.13 : 0.17, 0.01);
          // Mahishasura's are a buffalo's: wide and heavy.
          if (spec.horns === 'buffalo') m.scale.setScalar(1.9);
          h.add(m);
        }
      }
      if (spec.crown) {
        const c = crown(spec.crown);
        c.position.set(0, 0.17, -0.005);
        h.add(c);
      }
      if (spec.crest) {
        for (let i = 0; i < 7; i++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.22, 5), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.9 }));
          f.position.set(0, 0.17 + i * 0.012, -0.03 - i * 0.025);
          f.rotation.x = -0.9 - i * 0.12;
          h.add(f);
        }
      }
      // Earrings: heavy gold rings.
      for (const side of [1, -1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16), GOLD);
        ring.position.set(0.085 * side, 0.05, 0.0);
        ring.rotation.y = Math.PI / 2;
        h.add(ring);
      }
    }
    // Necklace and armlets.
    const neck = model.getObjectByName('neck_01');
    if (neck) {
      const n = holder(neck, person.root);
      const torque = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 24), GOLD);
      torque.rotation.x = Math.PI / 2 - 0.35;
      torque.position.set(0, -0.03, 0.02);
      n.add(torque);
    }
    for (const side of ['l', 'r']) {
      const arm = model.getObjectByName(`upperarm_${side}`);
      const fore = model.getObjectByName(`lowerarm_${side}`);
      if (!arm || !fore) continue;
      // Ring the arm where it is: a band around the bone, halfway down.
      person.root.updateMatrixWorld(true);
      const a = arm.getWorldPosition(new THREE.Vector3());
      const b = fore.getWorldPosition(new THREE.Vector3());
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20), GOLD);
      const mid = a.clone().lerp(b, 0.55);
      band.position.copy(arm.worldToLocal(mid.clone()));
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), arm.worldToLocal(b.clone()).sub(arm.worldToLocal(a.clone())).normalize());
      const s = arm.getWorldScale(new THREE.Vector3());
      const r = person.root.getWorldScale(new THREE.Vector3());
      band.scale.set(r.x / s.x, r.y / s.y, r.z / s.z);
      arm.add(band);
    }
    if (spec.weapon === 'gada') {
      const hand = model.getObjectByName('hand_r');
      const fore = model.getObjectByName('lowerarm_r');
      if (hand && fore) {
        person.root.updateMatrixWorld(true);
        const w = gada();
        // Gripped in the fist, pointing the way the forearm points.
        const dir = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
        const g = holder(hand, person.root);
        const local = dir.applyQuaternion(person.root.getWorldQuaternion(new THREE.Quaternion()).invert());
        w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
        w.position.copy(local.clone().multiplyScalar(-0.25));
        g.add(w);
      }
    }
    if (spec.heads) this.spectralHeads(spec.heads, scene);
  }

  /**
   * Ravana's heads: copies of the body, drawn only above the neck, standing in a row either side of
   * his own. They share his skeleton, so they turn and nod with him.
   */
  private spectralHeads(count: number, scene: THREE.Scene): void {
    // Without the hair: long hair on every copy hides the faces. Each copy wears a crown instead.
    const hairless = (m: THREE.Mesh) => !(Array.isArray(m.material) ? m.material : [m.material]).some((x) => /hair/i.test(x.name));
    const skinned = this.person.meshes.filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh && hairless(m)) as THREE.SkinnedMesh[];
    for (let i = 0; i < count; i++) {
      // A fan behind and above his own head: from level behind him, up and over the top.
      const offset = THREE.MathUtils.degToRad(-12 + (i / Math.max(1, count - 1)) * 118);
      // Five planes around the head: below it, and either side in x and z. Clipping keeps what is
      // inside all of them, so raised fists and shoulders are cut away.
      const box = [0, 1, 2, 3, 4].map(() => new THREE.Plane());
      for (const src of skinned) {
        const materials = (Array.isArray(src.material) ? src.material : [src.material]).map((m) => {
          const c = (m as THREE.MeshStandardMaterial).clone();
          c.clippingPlanes = box;
          // Spectral: a translucent golden glow, a vision of his heads rather than flesh.
          c.emissive = new THREE.Color(0xff8a1f);
          c.emissiveIntensity = 0.55;
          c.transparent = true;
          c.opacity = 0.78;
          c.depthWrite = false;
          return c;
        });
        const mesh = new THREE.SkinnedMesh(src.geometry, materials.length === 1 ? materials[0] : materials);
        mesh.bindMode = THREE.DetachedBindMode;
        mesh.bind(src.skeleton, src.bindMatrix);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        scene.add(mesh);
        this.heads.push({ mesh, offset, box });
      }
      const c = crown('band');
      c.scale.setScalar(this.spec.scale ?? 1);
      scene.add(c);
      this.crowns.push(c);
    }
  }

  /** Per frame: Ravana's heads follow him; the aura of their power rises. */
  public update(dt: number, facing: 1 | -1, glow: Particles, smoke: Particles, lit: boolean): void {
    const root = this.person.root;
    if (this.heads.length && this.headBone) {
      this.headBone.getWorldPosition(this.tmp);
      const half = 0.15 * (this.spec.scale ?? 1);
      // The fan is seen side on: back from his face (against his facing) and up.
      const r = 0.42 * (this.spec.scale ?? 1);
      this.heads.forEach((h, i) => {
        const a = h.offset;
        // The local matrix (the scene recomputes world matrices from it each frame).
        const ox = -facing * Math.cos(a) * r;
        const oy = Math.sin(a) * r;
        const oz = (i % 2 ? 1 : -1) * 0.04;
        h.mesh.matrix.makeTranslation(ox, oy, oz);
        h.mesh.matrixWorldNeedsUpdate = true;
        // The box around where this copy's head now is.
        const x = this.tmp.x + ox;
        const y = this.tmp.y + oy;
        const z = this.tmp.z + oz;
        h.box[0].set(new THREE.Vector3(0, 1, 0), -(y - 0.03));
        h.box[1].set(new THREE.Vector3(1, 0, 0), -(x - half));
        h.box[2].set(new THREE.Vector3(-1, 0, 0), x + half);
        h.box[3].set(new THREE.Vector3(0, 0, 1), -(z - half));
        h.box[4].set(new THREE.Vector3(0, 0, -1), z + half);
        // One crown per copy (the copies share submeshes, so every few entries are one head).
        const crownOf = this.crowns[Math.floor((i * this.crowns.length) / this.heads.length)];
        crownOf?.position.set(x, y + 0.17 * (this.spec.scale ?? 1), z);
        h.mesh.visible = root.visible;
      });
    }
    this.emitT += dt;
    const every = this.spec.aura === 'fire' || this.spec.aura === 'blood' ? 0.03 : 0.06;
    const colours = AURA_COLOURS[this.spec.aura];
    while (this.emitT > every) {
      this.emitT -= every;
      const p = root.position;
      const x = p.x + (Math.random() - 0.5) * 0.7;
      const y = p.y + Math.random() * 1.8 * (this.spec.scale ?? 1);
      const z = (Math.random() - 0.5) * 0.5;
      const color = colours[Math.floor(Math.random() * colours.length)];
      switch (this.spec.aura) {
        case 'fire':
          glow.emit({ x, y: p.y + Math.random() * 0.6, z, vy: 1.2 + Math.random(), size: 0.12, grow: 0.02, life: 0.6, color, alpha: lit ? 1 : 0.7 });
          break;
        case 'blood':
          glow.emit({ x, y, z, vy: -1.5, size: 0.04, life: 0.5, color, alpha: 0.9, lift: -6 });
          break;
        case 'gold':
          glow.emit({ x, y, z, vy: 0.3, size: 0.05, life: 1.2, color, alpha: 0.9 });
          break;
        case 'feathers':
          smoke.emit({ x, y, z, vx: -facing * 0.6, vy: -0.2, size: 0.07, life: 1.4, color, alpha: 0.8 });
          break;
        default:
          smoke.emit({ x, y: p.y + 0.05, z, vy: 0.25, size: 0.3, grow: 0.9, life: 1.6, color, alpha: 0.28 });
      }
    }
  }

  public dispose(): void {
    for (const h of this.heads) h.mesh.removeFromParent();
    for (const c of this.crowns) c.removeFromParent();
  }
}
