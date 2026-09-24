import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WEAPONS, type WeaponId } from '../../city/Weapons';
import { BOSS_SCALE, type Combat, type Enemy } from '../../city/Combat';
import { ParticleRenderer } from '../ParticleRenderer';
import { People, type Person } from './People';

/**
 * Everything about a gunfight that is drawn (ADR-0014, phase 2): the guns (in the hero's hand and
 * as a first-person viewmodel), enemies in SWAT and soldier kit with their own gun animations,
 * muzzle flashes, tracers, impacts and dropped ammunition. Read-only with respect to `Combat`.
 */

const TRACER_LIFE = 0.07;
const FLASH_LIFE = 0.05;

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
}

interface EnemyView {
  enemy: Enemy;
  person: Person;
  root: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Mesh;
  flashLife: number;
}

/** Scales and turns a gun (modelled along +x) to point down -z, `length` metres long. */
function prepareGun(source: THREE.Object3D, length: number): THREE.Group {
  const gun = source.clone(true);
  const box = new THREE.Box3().setFromObject(gun);
  const scale = length / Math.max(0.01, box.max.x - box.min.x);
  gun.scale.setScalar(scale);
  // Grip at the origin: the pistol grip sits roughly a fifth of the way along the gun.
  gun.position.set(-(box.min.x + (box.max.x - box.min.x) * 0.22) * scale, -(box.min.y + (box.max.y - box.min.y) * 0.3) * scale, 0);
  gun.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const m = mesh.material as THREE.MeshStandardMaterial;
    // The pack's colours are flat; give them the finish of gunmetal, polymer and wood.
    if (m.isMeshStandardMaterial) {
      const wood = /wood/i.test(m.name);
      const metal = /metal/i.test(m.name);
      m.metalness = metal ? 0.85 : wood ? 0 : 0.3;
      m.roughness = metal ? 0.35 : wood ? 0.6 : 0.5;
      if (!wood) m.color.lerp(new THREE.Color(0x2a2d33), 0.35);
    }
  });
  const holder = new THREE.Group();
  holder.add(gun);
  holder.rotation.y = Math.PI / 2; // +x → -z
  const aim = new THREE.Group();
  aim.add(holder);
  // The muzzle, for flashes and tracers.
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.02, -length * 0.8);
  aim.add(muzzle);
  return aim;
}

function flashMesh(): THREE.Mesh {
  const texture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,230,1)');
    grad.addColorStop(0.3, 'rgba(255,200,90,0.9)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const m = new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  m.color.setScalar(4);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), m);
  mesh.visible = false;
  return mesh;
}

export class CombatView {
  public readonly group = new THREE.Group();
  private readonly guns = new Map<WeaponId, THREE.Group>();
  private readonly viewGuns = new Map<WeaponId, THREE.Group>();
  private heroGun: THREE.Group | null = null;
  private viewGun: THREE.Group | null = null;
  private readonly viewRig = new THREE.Group();
  private readonly heroFlash = flashMesh();
  private readonly viewFlash = flashMesh();
  private heroFlashLife = 0;
  private readonly flashLight = new THREE.PointLight(0xffc27a, 0, 8, 2);
  private readonly tracers: Tracer[] = [];
  private readonly tracerMaterial: THREE.MeshBasicMaterial;
  private readonly enemyTracerMaterial: THREE.MeshBasicMaterial;
  private readonly enemies = new Map<number, EnemyView>();
  private readonly drops: THREE.Mesh[] = [];
  private readonly dropMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6, metalness: 0.2, emissive: 0x2a3a10, emissiveIntensity: 0.6 });
  private readonly particles = new ParticleRenderer(400);
  private kick = 0;
  private sway = 0;
  private reloadDip = 0;
  private currentWeapon: WeaponId | null = null;
  /** First-person arms: sleeves and hands in the hero's colours. */
  private readonly skinMaterial = new THREE.MeshStandardMaterial({ color: 0xd8a67c, roughness: 0.55 });
  private readonly sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x5a3fd0, roughness: 0.85 });
  private arms: THREE.Group | null = null;
  /** Hidden while the hero drives. */
  public holstered = false;

  public constructor(
    private readonly gunsGltf: GLTF,
    private readonly makeEnemy: (kind: 'swat' | 'soldier' | 'police' | 'boss') => Person,
    camera: THREE.PerspectiveCamera,
    private heroHand: THREE.Object3D | null,
    private heroRoot: THREE.Object3D
  ) {
    this.tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    this.tracerMaterial.color.multiplyScalar(3);
    this.enemyTracerMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a60, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    this.enemyTracerMaterial.color.multiplyScalar(3);
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const source = gunsGltf.scene.getObjectByName(WEAPONS[id].model);
      if (!source) continue;
      this.guns.set(id, prepareGun(source, WEAPONS[id].length));
      const fp = prepareGun(source, WEAPONS[id].length);
      fp.traverse((o) => ((o as THREE.Mesh).castShadow = false));
      this.viewGuns.set(id, fp);
    }
    this.group.add(this.particles.object, this.flashLight);
    // The first-person rig rides on the camera.
    camera.add(this.viewRig);
    this.viewRig.add(this.viewFlash);
  }

  /** A new hero model (the Safehouse): move the gun into the new hand. */
  public rebindHero(hand: THREE.Object3D | null, root: THREE.Object3D): void {
    this.heroHand = hand;
    this.heroRoot = root;
    const id = this.currentWeapon;
    this.currentWeapon = null;
    if (id) this.setWeapon(id);
  }

  public setWeapon(id: WeaponId): void {
    if (id === this.currentWeapon) return;
    this.currentWeapon = id;
    this.heroGun?.removeFromParent();
    this.viewGun?.removeFromParent();
    const gun = this.guns.get(id) ?? null;
    const view = this.viewGuns.get(id) ?? null;
    this.heroGun = gun;
    this.viewGun = view;
    if (gun) {
      if (this.heroHand) {
        // The hand bone's space: carried in the fist, barrel forward with the forearm.
        this.heroHand.add(gun);
        const s = 1 / this.worldScaleOf(this.heroHand);
        gun.scale.setScalar(s);
        gun.position.set(0, 0.09 * s, 0.03 * s);
        gun.rotation.set(Math.PI / 2, 0, Math.PI);
      } else this.heroRoot.add(gun);
      gun.getObjectByName('muzzle')?.add(this.heroFlash);
    }
    if (view) {
      this.arms?.removeFromParent();
      this.arms = this.buildArms(WEAPONS[id].length, id === 'pistol');
      view.add(this.arms);
      this.viewRig.add(view);
      view.position.set(0.2, -0.2, -0.42);
      view.getObjectByName('muzzle')?.add(this.viewFlash);
    }
    this.reloadDip = 0.5;
  }

  private worldScaleOf(o: THREE.Object3D): number {
    o.updateWorldMatrix(true, false);
    const s = new THREE.Vector3();
    o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    return s.x || 1;
  }

  /** The muzzle in world space, for tracers; the first-person gun's when in first person. */
  public muzzle(firstPerson: boolean, out: THREE.Vector3): THREE.Vector3 {
    void firstPerson;
    const gun = this.heroGun;
    const m = gun?.getObjectByName('muzzle');
    if (!m) return out.copy(this.heroRoot.position).setY(1.4);
    m.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(m.matrixWorld);
  }

  public heroFired(kick: number, from: THREE.Vector3, to: THREE.Vector3, firstPerson: boolean): void {
    this.kick = Math.min(1, this.kick + kick * 12);
    this.heroFlashLife = FLASH_LIFE;
    this.flashLight.position.copy(from);
    this.flashLight.intensity = 6;
    this.addTracer(from, to, this.tracerMaterial);
    this.particles.burst('muzzle', from.x, from.y, from.z, { intensity: 0.4 });
    void firstPerson;
  }

  public impact(x: number, y: number, z: number, flesh: boolean): void {
    this.particles.burst(flesh ? 'hazard' : 'smash', x, y, z, { intensity: flesh ? 0.5 : 0.35 });
  }

  public enemyFired(enemy: Enemy, tx: number, ty: number, tz: number): void {
    const view = this.enemies.get(enemy.id);
    if (!view) return;
    view.flashLife = FLASH_LIFE;
    view.muzzle.updateWorldMatrix(true, false);
    const from = new THREE.Vector3().setFromMatrixPosition(view.muzzle.matrixWorld);
    this.addTracer(from, new THREE.Vector3(tx, ty, tz), this.enemyTracerMaterial);
  }

  /** The hero's colours for the first-person arms. */
  public setArmColours(skin: number, sleeve: number): void {
    this.skinMaterial.color.setHex(skin);
    this.sleeveMaterial.color.setHex(sleeve);
  }

  /**
   * Two forearms and hands holding the gun, in the gun's space (grip at the origin, barrel down
   * -z): the trigger hand on the grip, the support hand under the barrel (or cupping the grip
   * for a pistol), both forearms running back toward the camera.
   */
  private buildArms(length: number, pistol: boolean): THREE.Group {
    const g = new THREE.Group();
    const limb = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
      const d = to.clone().sub(from);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, d.length() - radius * 2), 4, 10), material);
      mesh.position.copy(from).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.add(mesh);
    };
    const hand = (at: THREE.Vector3) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.1), this.skinMaterial);
      mesh.position.copy(at);
      g.add(mesh);
    };
    const grip = new THREE.Vector3(0.0, -0.05, 0.02);
    const support = pistol ? new THREE.Vector3(-0.03, -0.07, 0.0) : new THREE.Vector3(0.0, -0.05, -length * 0.42);
    hand(grip);
    hand(support);
    // Wrist to elbow: back, down and out, sleeves over the upper part.
    const rightElbow = new THREE.Vector3(0.1, -0.18, 0.34);
    const leftElbow = pistol ? new THREE.Vector3(-0.14, -0.2, 0.32) : new THREE.Vector3(-0.2, -0.2, 0.1);
    limb(grip.clone().add(new THREE.Vector3(0, -0.01, 0.05)), rightElbow, 0.038, this.skinMaterial);
    limb(rightElbow.clone().lerp(grip, 0.35), rightElbow.clone().add(new THREE.Vector3(0.05, -0.08, 0.3)), 0.058, this.sleeveMaterial);
    limb(support.clone().add(new THREE.Vector3(0, -0.01, 0.05)), leftElbow, 0.036, this.skinMaterial);
    limb(leftElbow.clone().lerp(support, 0.35), leftElbow.clone().add(new THREE.Vector3(-0.08, -0.08, 0.3)), 0.056, this.sleeveMaterial);
    return g;
  }

  public reloading(progress: number): void {
    // Dip the gun out of view and back while reloading.
    this.reloadDip = progress > 0 ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
  }

  private addTracer(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material): void {
    const length = from.distanceTo(to);
    if (length < 0.5) return;
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, -0.5), material);
      this.group.add(mesh);
      t = { mesh, life: 0 };
      this.tracers.push(t);
    }
    t.mesh.material = material;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.rotateY(Math.PI);
    t.mesh.scale.set(1, 1, length);
    t.mesh.visible = true;
    t.life = TRACER_LIFE;
  }

  private viewFor(e: Enemy): EnemyView {
    let v = this.enemies.get(e.id);
    if (v) return v;
    const person = this.makeEnemy(e.kind);
    const model = person.model;
    const root = person.root;
    // Their rifles.
    // Three.js strips the dot from the rig's "Wrist.R" when it loads.
    const hand = person.hand;
    void model;
    const weapon = e.kind === 'swat' ? 'smg' : e.kind === 'police' ? 'pistol' : 'rifle';
    if (e.kind === 'boss') root.scale.setScalar(BOSS_SCALE);
    const source = this.gunsGltf.scene.getObjectByName(WEAPONS[weapon].model);
    const gun = source ? prepareGun(source, WEAPONS[weapon].length) : new THREE.Group();
    const flash = flashMesh();
    gun.getObjectByName('muzzle')?.add(flash);
    if (hand) {
      hand.add(gun);
      root.updateMatrixWorld(true);
      const s = 1 / this.worldScaleOf(hand);
      gun.scale.setScalar(s);
      gun.position.set(0, 0.09 * s, 0.03 * s);
      gun.rotation.set(Math.PI / 2, 0, Math.PI);
    }
    this.group.add(root);
    v = { enemy: e, person, root, muzzle: gun.getObjectByName('muzzle') ?? gun, flash, flashLife: 0 };
    this.enemies.set(e.id, v);
    return v;
  }

  private play(v: EnemyView, name: string, fade = 0.2, once = false, speed = 1): void {
    People.play(v.person, name, fade, once, speed);
  }

  public update(combat: Combat, dt: number, time: number, firstPerson: boolean, aiming: boolean, moving: number): void {
    // Anyone who has left the fight (police standing down) leaves the street.
    for (const [id, v] of this.enemies) {
      if (!combat.enemies.includes(v.enemy)) {
        v.root.removeFromParent();
        this.enemies.delete(id);
      }
    }
    // Enemies.
    for (const e of combat.enemies) {
      const v = this.viewFor(e);
      const m = e.motor;
      v.root.position.set(m.x, m.y, m.z);
      v.root.rotation.y = m.facing;
      if (e.state === 'dead') {
        this.play(v, 'Death', 0.1, true);
        // Sink out of the street after a while, so bodies do not pile up.
        if (e.deadTime > 6) v.root.position.y -= Math.min(2, (e.deadTime - 6) * 0.6);
        v.root.visible = e.deadTime < 10;
      } else if (e.hitTime < 0.3) this.play(v, 'HitRecieve', 0.05, true, 1.6);
      else if (m.speed > 0.5) this.play(v, e.state === 'fight' ? 'Run_Shoot' : 'Walk', 0.2, false, Math.max(0.6, m.speed / 4));
      else if (e.state === 'fight') this.play(v, 'Idle_Gun_Shoot', 0.2);
      else this.play(v, 'Idle_Gun', 0.3);
      v.flashLife -= dt;
      v.flash.visible = v.flashLife > 0;
      if (v.flash.visible) v.flash.rotation.z = Math.random() * Math.PI;
      v.person.mixer.update(dt);
    }

    // Tracers fade fast.
    for (const t of this.tracers) {
      t.life -= dt;
      t.mesh.visible = t.life > 0;
    }

    // Muzzle flashes and their light.
    this.heroFlashLife -= dt;
    const flashing = this.heroFlashLife > 0;
    this.heroFlash.visible = flashing;
    this.viewFlash.visible = false;
    if (flashing) this.heroFlash.rotation.z = this.viewFlash.rotation.z = Math.random() * Math.PI;
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120);

    // Dropped ammunition boxes, bobbing.
    let n = 0;
    for (const d of combat.drops) {
      if (!d.alive) continue;
      let mesh = this.drops[n];
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.3), this.dropMaterial);
        mesh.castShadow = true;
        this.group.add(mesh);
        this.drops.push(mesh);
      }
      mesh.visible = true;
      mesh.position.set(d.x, 0.3 + Math.sin(time * 3 + d.x) * 0.06, d.z);
      mesh.rotation.y = time * 1.5;
      n++;
    }
    for (let i = n; i < this.drops.length; i++) this.drops[i].visible = false;

    // First-person gun: sway with movement, kick back when firing, dip for reloads; hidden in
    // third person (the hero carries the other one).
    this.kick = Math.max(0, this.kick - dt * 9);
    this.sway += dt * (2 + moving * 8);
    if (this.viewGun) {
      this.viewGun.visible = firstPerson;
      const bob = Math.sin(this.sway) * 0.012 * moving;
      const aimX = aiming ? 0.0 : 0.17;
      const aimY = aiming ? -0.12 : -0.19;
      this.viewGun.position.set(aimX + Math.cos(this.sway * 0.5) * 0.008 * moving, aimY + bob - this.reloadDip * 0.25, -0.62 + this.kick * 0.06);
      this.viewGun.rotation.set(this.kick * 0.18 - this.reloadDip * 0.6, aiming ? 0 : 0.06, 0);
    }
    if (this.heroGun) this.heroGun.visible = !this.holstered;
    if (this.viewGun) this.viewGun.visible = false;
    this.particles.update(dt);
  }
}
