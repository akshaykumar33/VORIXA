import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  BRICK,
  GROUND,
  HEART_BLOCK,
  PLATFORM,
  QUESTION,
  SPIKES,
  USED,
  GROUND_DEPTH,
  tileAt,
  type LevelData
} from '../../platformer/Level';
import type { PlatformFx, PlatformSim, Enemy } from '../../platformer/PlatformSim';
import { ParticleRenderer } from '../ParticleRenderer';
import { CharacterLibrary, PERSON_SCALE, type Character } from '../CharacterLibrary';
import { SkyLibrary } from '../rush/SkyLibrary';
import { PostFX } from '../rush/PostFX';
import { bend, finish, flat, toon } from '../rush/Toon';
import { merge } from '../rush/PropKit';
import { buildDrone, buildStarCoin, buildTurret, coinGeometry, type DroneModel, type TurretModel } from '../rush/Models';
import { buildVehicle } from '../rush/Vehicles';
import { buildBiomes } from '../rush/Biomes';
import type { PropSpec } from '../rush/PropKit';

/**
 * Draws On Foot (ADR-0012) in the same premium stylized look as Rush (ADR-0013): the Sunny Meadow
 * sky and light, Rush's own props in the background, and the driver of the red car as the hero.
 *
 * A side view: the level is a strip along +x at z = 0, one world unit per tile, row 0 at the
 * bottom. The camera looks down -z from in front. Rush's curved-world bend is switched off here;
 * everything else (materials, models, post chain) is shared.
 *
 * Read-only with respect to the simulation, like `RushRenderer`.
 */

const STRIP_DEPTH = 3.2;
const CAMERA_DISTANCE = 13.5;
const LOOK_AHEAD = 2.6;

interface Bump {
  index: number;
  time: number;
}

interface EnemyView {
  enemy: Enemy;
  root: THREE.Object3D;
  drone?: DroneModel;
  turret?: TurretModel;
  legs?: THREE.Object3D[];
  body?: THREE.Object3D;
  deathTime: number;
}

/** A canvas-painted face for a block: the question mark, the heart, the brick courses. */
function blockTexture(paint: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  paint(g, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function blockMaterials(): Record<'brick' | 'question' | 'used' | 'heart', THREE.MeshStandardMaterial> {
  const brick = blockTexture((g, s) => {
    g.fillStyle = '#b5532f';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#e8d2b8';
    const row = s / 4;
    for (let r = 0; r < 4; r++) {
      g.fillRect(0, r * row, s, 4);
      const offset = r % 2 ? s / 4 : 0;
      for (let c = 0; c < 3; c++) g.fillRect(offset + (c * s) / 2, r * row, 4, row);
    }
  });
  const question = blockTexture((g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#ffd45a');
    grad.addColorStop(1, '#f0a01c');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#7a4a08';
    for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14]]) {
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.font = 'bold 96px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#7a4a08';
    g.fillText('?', s / 2 + 3, s / 2 + 7);
    g.fillStyle = '#fff6d8';
    g.fillText('?', s / 2, s / 2 + 3);
  });
  const heart = blockTexture((g, s) => {
    g.fillStyle = '#ff7aa8';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffffff';
    g.beginPath();
    const cx = s / 2;
    g.moveTo(cx, s * 0.78);
    g.bezierCurveTo(s * 0.1, s * 0.5, s * 0.25, s * 0.18, cx, s * 0.36);
    g.bezierCurveTo(s * 0.75, s * 0.18, s * 0.9, s * 0.5, cx, s * 0.78);
    g.fill();
  });
  return {
    brick: new THREE.MeshStandardMaterial({ map: brick, roughness: 0.8 }),
    question: new THREE.MeshStandardMaterial({ map: question, roughness: 0.35, metalness: 0.2, emissive: 0x6b4200, emissiveIntensity: 0.35 }),
    used: new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.85 }),
    heart: new THREE.MeshStandardMaterial({ map: heart, roughness: 0.4, emissive: 0x5a0a2a, emissiveIntensity: 0.3 })
  };
}

/** A static copy of one of Rush's instanced prop types, for the background. */
function propGroup(spec: PropSpec): THREE.Group {
  const group = new THREE.Group();
  for (const p of spec.parts) {
    const mesh = new THREE.Mesh(p.geometry, p.glow ? flat(p.color) : toon(p.color));
    if (p.pivot) mesh.position.set(...p.pivot);
    mesh.castShadow = !p.glow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function hash(k: number, salt: number): number {
  let h = (k * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A round, armoured beetle: the walker. Faces +x. */
function buildBeetle(): { root: THREE.Group; body: THREE.Group; legs: THREE.Mesh[] } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.7), finish(0x8e2b3a, 'gloss'));
  shell.scale.set(1.05, 0.9, 0.9);
  shell.position.y = 0.3;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.16, 18), toon(0x2a2233));
  belly.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), toon(0x2a2233));
  head.position.set(0.42, 0.38, 0);
  body.add(shell, belly, head);
  for (const z of [-0.12, 0.12]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), toon(0xffffff));
    white.position.set(0.6, 0.48, z);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flat(0x14121e));
    pupil.position.set(0.68, 0.48, z);
    body.add(white, pupil);
  }
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.25, -0.3], [0.2, -0.3], [-0.25, 0.3], [0.2, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 3, 6).translate(0, -0.12, 0), toon(0x2a2233));
    leg.position.set(x, 0.24, z);
    root.add(leg);
    legs.push(leg);
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, body, legs };
}

/** The little blaster the hero carries: a gloss body, a chrome muzzle. */
function buildBlaster(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), finish(0xff5a36, 'gloss'));
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.08, 10).rotateX(Math.PI / 2), finish(0xe8ecf2, 'chrome'));
  muzzle.position.z = 0.11;
  g.add(body, muzzle);
  return g;
}

export class PlatformRenderer {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 600);
  private renderer!: THREE.WebGLRenderer;
  private post: PostFX | null = null;
  private skies: SkyLibrary | null = null;

  private readonly sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  private readonly hemi = new THREE.HemisphereLight(0xdfeeff, 0x6a8f4a, 0.45);
  private readonly particles = new ParticleRenderer(600);
  private readonly people = new CharacterLibrary('/chars/');
  private hero: Character | null = null;
  private readonly heroHolder = new THREE.Group();

  private level: LevelData | null = null;
  private readonly world = new THREE.Group();
  private readonly materials = blockMaterials();
  private blocks: Record<'brick' | 'question' | 'used' | 'heart', THREE.InstancedMesh> | null = null;
  private blocksDirty = true;
  private readonly bumps: Bump[] = [];
  private coins: THREE.InstancedMesh | null = null;
  private readonly starCoins: THREE.Group[] = [];
  private readonly enemyViews: EnemyView[] = [];
  private shotsFriendly: THREE.InstancedMesh | null = null;
  private shotsHostile: THREE.InstancedMesh | null = null;
  private readonly checkpointBanners: THREE.Mesh[] = [];
  private flagCloth: THREE.Mesh | null = null;
  private flagRaised = 0;
  private flagTarget = 0;

  private time = 0;
  private fireFlash = 0;
  private readonly cam = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private trauma = 0;

  public constructor() {
    // The curved world is a Rush effect; a side view wants a flat world.
    bend.down.value = 0;
    bend.side.value = 0;

    this.scene.fog = new THREE.Fog(0xcad9e8, 60, 220);
    this.scene.background = new THREE.Color(0xa9cdf0);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.world, this.heroHolder);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 16;
    sc.bottom = -10;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.particles.object);
  }

  public initialize(canvas: HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.skies = new SkyLibrary(this.renderer);
    void this.skies.load('meadow').then((sky) => {
      if (!sky) return;
      this.scene.background = sky.backdrop;
      this.scene.environment = sky.environment;
    });
    this.post = new PostFX(this.renderer, this.scene, this.camera);
  }

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Builds the scenery for a level. Called for every attempt, since each attempt has a fresh level. */
  public load(level: LevelData, sim: PlatformSim): void {
    this.level = level;
    this.world.clear();
    this.enemyViews.length = 0;
    this.starCoins.length = 0;
    this.checkpointBanners.length = 0;
    this.bumps.length = 0;
    this.flagRaised = 0;
    this.flagTarget = 0;
    this.blocksDirty = true;

    this.buildGround(level);
    this.buildBlocks(level);
    this.buildPlatformsAndSpikes(level);
    this.buildCoins(level);
    this.buildLandmarks(level);
    this.buildBackground(level);
    this.buildEnemies(sim);
    this.buildShots(sim);

    this.cam.set(level.start.x, level.start.y + 2.4, CAMERA_DISTANCE);
    this.look.set(level.start.x + LOOK_AHEAD, level.start.y + 1.2, 0);
  }

  private buildGround(level: LevelData): void {
    const dirt: THREE.BufferGeometry[] = [];
    const grass: THREE.BufferGeometry[] = [];
    for (let y = 0; y < level.height; y++) {
      let x = 0;
      while (x < level.width) {
        if (tileAt(level, x, y) !== GROUND) {
          x++;
          continue;
        }
        const from = x;
        while (x < level.width && tileAt(level, x, y) === GROUND) x++;
        const w = x - from;
        dirt.push(new THREE.BoxGeometry(w, 1, STRIP_DEPTH).translate(from + w / 2, y + 0.5, 0));
        // A grass cap wherever the ground is open to the sky, run by run.
        let c = from;
        while (c < x) {
          if (tileAt(level, c, y + 1) === GROUND) {
            c++;
            continue;
          }
          const cf = c;
          while (c < x && tileAt(level, c, y + 1) !== GROUND) c++;
          const cw = c - cf;
          grass.push(new RoundedBoxGeometry(cw + 0.08, 0.32, STRIP_DEPTH + 0.16, 2, 0.08).translate(cf + cw / 2, y + 1 - 0.12, 0));
        }
      }
    }
    if (dirt.length) {
      const dirtMesh = new THREE.Mesh(merge(...dirt), new THREE.MeshStandardMaterial({ color: 0x8a5d3b, roughness: 0.95 }));
      dirtMesh.receiveShadow = true;
      this.world.add(dirtMesh);
    }
    if (grass.length) {
      const grassMesh = new THREE.Mesh(merge(...grass), new THREE.MeshStandardMaterial({ color: 0x6fb04a, roughness: 0.85 }));
      grassMesh.receiveShadow = true;
      grassMesh.castShadow = true;
      this.world.add(grassMesh);
    }

    // The meadow behind the strip, and water under it: a fall is into a river, not into the void.
    const meadow = new THREE.Mesh(
      new THREE.PlaneGeometry(level.width + 400, 260).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6a9e45, roughness: 1 })
    );
    meadow.position.set(level.width / 2, GROUND_DEPTH - 0.02, -STRIP_DEPTH / 2 - 130);
    meadow.receiveShadow = true;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(level.width + 400, 30).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x2c7fa8, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.92 })
    );
    water.position.set(level.width / 2, 0.7, 6);
    this.world.add(meadow, water);
  }

  private buildBlocks(level: LevelData): void {
    let capacity = 0;
    for (const t of level.tiles) if (t === BRICK || t === QUESTION || t === USED || t === HEART_BLOCK) capacity++;
    const geometry = new RoundedBoxGeometry(0.98, 0.98, 0.98, 2, 0.07);
    const make = (m: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(geometry, m, Math.max(1, capacity));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.world.add(mesh);
      return mesh;
    };
    this.blocks = {
      brick: make(this.materials.brick),
      question: make(this.materials.question),
      used: make(this.materials.used),
      heart: make(this.materials.heart)
    };
  }

  private buildPlatformsAndSpikes(level: LevelData): void {
    const planks: THREE.BufferGeometry[] = [];
    const spikes: THREE.BufferGeometry[] = [];
    for (let y = 0; y < level.height; y++) {
      let x = 0;
      while (x < level.width) {
        const t = tileAt(level, x, y);
        if (t === SPIKES) {
          for (const dx of [0.2, 0.5, 0.8]) for (const dz of [-0.7, 0, 0.7]) spikes.push(new THREE.ConeGeometry(0.13, 0.55, 8).translate(x + dx, y + 0.27, dz));
          x++;
          continue;
        }
        if (t !== PLATFORM) {
          x++;
          continue;
        }
        const from = x;
        while (x < level.width && tileAt(level, x, y) === PLATFORM) x++;
        const w = x - from;
        planks.push(new RoundedBoxGeometry(w, 0.28, 1.8, 2, 0.06).translate(from + w / 2, y + 1 - 0.14, 0));
        // Ropes up out of shot: a platform hung from the sky reads as deliberate.
        for (const px of [from + 0.3, x - 0.3]) planks.push(new THREE.CylinderGeometry(0.03, 0.03, 8, 5).translate(px, y + 5, -0.6));
      }
    }
    if (planks.length) {
      const m = new THREE.Mesh(merge(...planks), new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.75 }));
      m.castShadow = m.receiveShadow = true;
      this.world.add(m);
    }
    if (spikes.length) {
      const m = new THREE.Mesh(merge(...spikes), finish(0xc9ced8, 'metal'));
      m.castShadow = true;
      this.world.add(m);
    }
  }

  private buildCoins(level: LevelData): void {
    const coins = new THREE.InstancedMesh(
      coinGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.85, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.5 }),
      Math.max(1, level.coins.length)
    );
    coins.castShadow = true;
    coins.frustumCulled = false;
    this.coins = coins;
    this.world.add(coins);
    for (const s of level.starCoins) {
      const star = buildStarCoin();
      star.scale.setScalar(0.62);
      star.position.set(s.x, s.y + 0.5, 0);
      this.starCoins.push(star);
      this.world.add(star);
    }
  }

  private buildLandmarks(level: LevelData): void {
    // The car the hero climbed out of, parked at the start with its door open to the adventure.
    const car = buildVehicle('zippy');
    if (car.driver) car.driver.root.visible = false;
    car.root.position.set(level.start.x - 3.2, GROUND_DEPTH, -0.4);
    car.root.rotation.y = -Math.PI / 2 + 0.35;
    car.root.scale.setScalar(0.72);
    car.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.world.add(car.root);

    for (const c of level.checkpoints) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), finish(0xe8ecf2, 'chrome'));
      pole.position.set(c.x, c.y + 1.3, -0.9);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: 0x9aa3b5, side: THREE.DoubleSide, roughness: 0.7 }));
      banner.position.set(c.x + 0.47, c.y + 2.25, -0.9);
      pole.castShadow = banner.castShadow = true;
      this.checkpointBanners.push(banner);
      this.world.add(pole, banner);
    }

    const f = level.flag;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 9, 12), finish(0xe8ecf2, 'chrome'));
    pole.position.set(f.x, f.y + 4.5, 0);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), finish(0xffc93c, 'metal'));
    ball.position.set(f.x, f.y + 9.1, 0);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05, 8, 1).translate(-0.8, 0, 0), new THREE.MeshStandardMaterial({ color: 0xff5a36, side: THREE.DoubleSide, roughness: 0.6 }));
    cloth.position.set(f.x - 0.05, f.y + 1.2, 0);
    const base = new THREE.Mesh(new RoundedBoxGeometry(1, 0.5, 1, 2, 0.06), finish(0x5a5f6e, 'metal'));
    base.position.set(f.x, f.y + 0.25, 0);
    for (const m of [pole, ball, cloth, base]) m.castShadow = true;
    this.flagCloth = cloth;
    this.world.add(pole, ball, cloth, base);
  }

  /** Rush's meadow, set back from the strip in two depths, so the level sits in a place. */
  private buildBackground(level: LevelData): void {
    const meadow = buildBiomes().meadow;
    const near = meadow.near.filter((s) => s.facing === 'random');
    const far = meadow.far;
    const add = (specs: PropSpec[], spacing: number, zMin: number, zMax: number, salt: number, scale: number) => {
      for (let i = -3; i * spacing < level.width + 20; i++) {
        if (hash(i, salt) < 0.3) continue;
        const spec = specs[Math.floor(hash(i, salt + 1) * specs.length)];
        const prop = propGroup(spec);
        const z = zMin + hash(i, salt + 2) * (zMax - zMin);
        prop.position.set(i * spacing + hash(i, salt + 3) * spacing, GROUND_DEPTH, z);
        prop.rotation.y = hash(i, salt + 4) * Math.PI * 2;
        prop.scale.setScalar(scale * (0.85 + hash(i, salt + 5) * 0.3));
        this.world.add(prop);
      }
    };
    add(near, 5, -4.5, -9, 11, 0.9);
    add(far, 16, -22, -48, 23, 1.3);
  }

  private buildEnemies(sim: PlatformSim): void {
    for (const enemy of sim.enemies) {
      const view: EnemyView = { enemy, root: new THREE.Group(), deathTime: -1 };
      if (enemy.kind === 'walker') {
        const beetle = buildBeetle();
        view.root = beetle.root;
        view.body = beetle.body;
        view.legs = beetle.legs;
      } else if (enemy.kind === 'flyer') {
        const drone = buildDrone('bee', 0xffd23f, 0x1d1b33);
        drone.root.scale.setScalar(0.5);
        view.root.add(drone.root);
        view.drone = drone;
      } else {
        const turret = buildTurret();
        turret.root.scale.setScalar(0.55);
        view.root.add(turret.root);
        view.turret = turret;
      }
      view.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.enemyViews.push(view);
      this.world.add(view.root);
    }
  }

  private buildShots(sim: PlatformSim): void {
    const geo = new THREE.CapsuleGeometry(0.09, 0.45, 4, 8).rotateZ(Math.PI / 2);
    const hot = (hex: number) => {
      const m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
      // Brighter than white so the bloom pass picks the bolts out.
      m.color.multiplyScalar(3);
      return m;
    };
    this.shotsFriendly = new THREE.InstancedMesh(geo, hot(0xffe36a), sim.shots.length);
    this.shotsHostile = new THREE.InstancedMesh(geo, hot(0xff4d5e), sim.shots.length);
    for (const m of [this.shotsFriendly, this.shotsHostile]) {
      m.frustumCulled = false;
      m.count = 0;
      this.world.add(m);
    }
  }

  // ─── Per tick ─────────────────────────────────────────────────────────────────────────────

  public effect(fx: PlatformFx): void {
    const p = this.particles;
    switch (fx.type) {
      case 'jump':
        p.burst('jump', fx.x, fx.y, 0, { intensity: 0.6 });
        break;
      case 'land':
        p.burst('land', fx.x, fx.y, 0, { intensity: 0.7 });
        break;
      case 'coin':
      case 'blockCoin':
        p.burst('coin', fx.x, fx.y, 0);
        break;
      case 'starCoin':
        p.burst('coin', fx.x, fx.y, 0, { intensity: 2.2 });
        this.trauma = Math.min(1, this.trauma + 0.2);
        break;
      case 'bump': {
        if (!this.level) break;
        const index = Math.floor(fx.y) * this.level.width + Math.floor(fx.x);
        this.bumps.push({ index, time: 0 });
        this.blocksDirty = true;
        p.burst('smash', fx.x, fx.y, 0, { intensity: 0.5 });
        break;
      }
      case 'heart':
        p.burst('checkpoint', fx.x, fx.y, 0);
        this.blocksDirty = true;
        break;
      case 'stomp':
        p.burst('smash', fx.x, fx.y, 0, { intensity: 1.1 });
        this.trauma = Math.min(1, this.trauma + 0.18);
        break;
      case 'enemyKilled':
        p.burst('explode', fx.x, fx.y + 0.5, 0, { intensity: 0.9 });
        this.trauma = Math.min(1, this.trauma + 0.25);
        break;
      case 'hurt':
      case 'pit':
        p.burst('hazard', fx.x, fx.y + 0.6, 0);
        this.trauma = Math.min(1, this.trauma + 0.5);
        break;
      case 'fire':
        p.burst('muzzle', fx.x, fx.y, 0, { intensity: 0.5 });
        this.fireFlash = 0.25;
        break;
      case 'checkpoint': {
        const banner = this.checkpointBanners[fx.amount];
        if (banner) (banner.material as THREE.MeshStandardMaterial).color.setHex(0x3ddc84);
        p.burst('checkpoint', fx.x, fx.y + 1, 0);
        break;
      }
      case 'flag':
        this.flagTarget = 1;
        p.burst('checkpoint', fx.x, fx.y + 2, 0, { intensity: 2 });
        break;
      case 'gameOver':
        p.burst('smoke', fx.x, fx.y + 0.5, 0, { intensity: 1.5 });
        break;
    }
  }

  /** A world point in canvas CSS pixels, for HUD popups; null when behind the camera. */
  public toScreen(x: number, y: number): { x: number; y: number } | null {
    this.v.set(x, y, 0).project(this.camera);
    if (this.v.z > 1) return null;
    const canvas = this.renderer.domElement;
    return { x: (this.v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-this.v.y * 0.5 + 0.5) * canvas.clientHeight };
  }

  // ─── Per frame ────────────────────────────────────────────────────────────────────────────

  public render(sim: PlatformSim, dt: number): void {
    this.time += dt;
    this.fireFlash = Math.max(0, this.fireFlash - dt);
    this.particles.update(dt);
    if (this.level) {
      this.drawBlocks(this.level, dt);
      this.drawCoins(sim);
      this.drawEnemies(sim, dt);
      this.drawShots(sim);
      this.drawFlag(dt);
    }
    this.drawHero(sim, dt);
    this.placeCamera(sim, dt);
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private drawBlocks(level: LevelData, dt: number): void {
    for (const b of this.bumps) b.time += dt;
    while (this.bumps.length && this.bumps[0].time > 0.22) {
      this.bumps.shift();
      this.blocksDirty = true;
    }
    if (!this.blocksDirty && this.bumps.length === 0) return;
    this.blocksDirty = false;
    const blocks = this.blocks!;
    blocks.brick.count = blocks.question.count = blocks.used.count = blocks.heart.count = 0;
    for (let i = 0; i < level.tiles.length; i++) {
      const t = level.tiles[i];
      const target = t === BRICK ? blocks.brick : t === QUESTION ? blocks.question : t === USED ? blocks.used : t === HEART_BLOCK ? blocks.heart : null;
      if (!target) continue;
      const x = i % level.width;
      const y = Math.floor(i / level.width);
      const bump = this.bumps.find((b) => b.index === i);
      const lift = bump ? Math.sin((bump.time / 0.22) * Math.PI) * 0.28 : 0;
      this.matrix.makeTranslation(x + 0.5, y + 0.5 + lift, 0);
      target.setMatrixAt(target.count++, this.matrix);
    }
    for (const m of Object.values(blocks)) m.instanceMatrix.needsUpdate = true;
  }

  private drawCoins(sim: PlatformSim): void {
    const coins = this.coins!;
    const level = this.level!;
    let n = 0;
    this.e.set(0, this.time * 3, 0);
    this.q.setFromEuler(this.e);
    this.s.setScalar(0.42);
    level.coins.forEach((c, i) => {
      if (sim.coinTaken[i]) return;
      this.v.set(c.x, c.y + 0.5 + Math.sin(this.time * 3 + c.x) * 0.06, 0);
      this.matrix.compose(this.v, this.q, this.s);
      coins.setMatrixAt(n++, this.matrix);
    });
    coins.count = n;
    coins.instanceMatrix.needsUpdate = true;
    this.starCoins.forEach((star, i) => {
      star.visible = (sim.starCoins & (1 << i)) === 0;
      star.rotation.y = this.time * 2;
    });
  }

  private drawEnemies(sim: PlatformSim, dt: number): void {
    for (const view of this.enemyViews) {
      const e = view.enemy;
      if (!e.alive) {
        // A squash and a fade rather than popping out of existence.
        if (view.deathTime < 0) view.deathTime = 0;
        view.deathTime += dt;
        const k = Math.max(0, 1 - view.deathTime / 0.3);
        view.root.scale.set(1 + (1 - k) * 0.4, k, 1 + (1 - k) * 0.4);
        view.root.visible = k > 0;
        continue;
      }
      view.root.visible = true;
      view.root.position.set(e.x, e.y, 0);
      if (view.body && view.legs) {
        view.root.rotation.y = e.facing > 0 ? 0 : Math.PI;
        const step = this.time * 14;
        view.legs.forEach((leg, i) => (leg.rotation.z = Math.sin(step + (i % 2) * Math.PI) * 0.6));
        view.body.position.y = Math.abs(Math.sin(step)) * 0.04;
      } else if (view.drone) {
        // Drones are modelled facing +z (toward the camera), which is right for a side view too.
        for (const s of view.drone.spinners) s.rotation.y += dt * 30;
        view.drone.root.rotation.z = Math.sin(this.time * 3) * 0.15;
      } else if (view.turret) {
        const dx = sim.x - e.x;
        view.turret.head.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }

  private drawShots(sim: PlatformSim): void {
    const friendly = this.shotsFriendly!;
    const hostile = this.shotsHostile!;
    friendly.count = hostile.count = 0;
    this.q.identity();
    this.s.set(1, 1, 1);
    for (const shot of sim.shots) {
      if (!shot.alive) continue;
      const target = shot.hostile ? hostile : friendly;
      this.v.set(shot.x, shot.y, 0);
      this.matrix.compose(this.v, this.q, this.s);
      target.setMatrixAt(target.count++, this.matrix);
    }
    friendly.instanceMatrix.needsUpdate = true;
    hostile.instanceMatrix.needsUpdate = true;
  }

  private drawFlag(dt: number): void {
    if (!this.flagCloth || !this.level) return;
    this.flagRaised += (this.flagTarget - this.flagRaised) * (1 - Math.exp(-2.5 * dt));
    this.flagCloth.position.y = this.level.flag.y + 1.2 + this.flagRaised * 6.8;
    // A breeze: the free edge ripples.
    const pos = this.flagCloth.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(this.time * 6 + x * 3) * 0.12 * (-x / 1.6));
    }
    pos.needsUpdate = true;
  }

  private drawHero(sim: PlatformSim, dt: number): void {
    if (!this.hero) {
      this.hero = this.people.spawn('male-a');
      if (!this.hero) return;
      this.hero.root.scale.setScalar(PERSON_SCALE);
      this.heroHolder.add(this.hero.root);
      // Attach the blaster to the right arm, so it swings with the animation.
      const arm = this.hero.root.getObjectByName('arm-right');
      const blaster = buildBlaster();
      blaster.position.set(-0.02, -0.17, 0.06);
      (arm ?? this.hero.root).add(blaster);
    }
    const hero = this.hero;
    this.heroHolder.position.set(sim.x, sim.y, 0);
    // Side-on, turned a little toward the camera so the face reads while running.
    const targetYaw = sim.facing * (Math.PI / 2 - 0.3);
    // Turn quickly but visibly; an instant flip reads as a glitch.
    const yaw = hero.root.rotation.y;
    hero.root.rotation.y = yaw + (targetYaw - yaw) * (1 - Math.exp(-20 * dt));

    const speed = Math.abs(sim.vx);
    if (sim.phase === 'over') hero.play('die', { once: true });
    else if (!sim.onGround) hero.play(sim.vy > 0 ? 'jump' : 'fall', { fade: 0.1 });
    else if (this.fireFlash > 0 && speed < 1) hero.play('holding-right-shoot', { fade: 0.08 });
    else if (speed > 5.5) hero.play('sprint', { speed: speed / 7 });
    else if (speed > 0.4) hero.play('walk', { speed: 0.6 + speed / 4 });
    else if (sim.phase === 'clear') hero.play('emote-yes');
    else hero.play('idle');
    hero.update(dt);

    // Blink while invulnerable.
    this.heroHolder.visible = sim.invulnerable <= 0 || Math.floor(this.time * 14) % 2 === 0;

    this.sun.position.set(sim.x - 12, sim.y + 22, 16);
    this.sun.target.position.set(sim.x + 4, sim.y, 0);
  }

  private placeCamera(sim: PlatformSim, dt: number): void {
    const level = this.level;
    // Half the view's width where the hero stands. On a narrow or portrait screen it is only a few
    // tiles, so the look-ahead and the edge clamp shrink with it and the hero stays in frame.
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * CAMERA_DISTANCE * this.camera.aspect;
    const lead = sim.facing * Math.min(LOOK_AHEAD, half * 0.45);
    let tx = sim.x + lead;
    const edge = Math.min(8, half);
    if (level) tx = Math.max(edge, Math.min(level.width - edge, tx));
    // Vertical follow is lazier than horizontal: jumping should not bounce the whole screen.
    const ty = Math.max(GROUND_DEPTH + 3.4, sim.y + 3);
    this.cam.x += (tx - this.cam.x) * (1 - Math.exp(-4 * dt));
    this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-2.2 * dt));
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const shake = this.trauma * this.trauma * 0.35;
    this.camera.position.set(
      this.cam.x + (Math.random() - 0.5) * shake,
      this.cam.y + 0.8 + (Math.random() - 0.5) * shake,
      CAMERA_DISTANCE
    );
    this.look.set(this.cam.x, this.cam.y - 0.6, 0);
    this.camera.lookAt(this.look);
  }
}
