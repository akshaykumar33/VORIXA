import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box, District } from '../../city/CityLayout';
import type { HeroMotor } from '../../city/HeroMotor';
import { SkyLibrary } from '../rush/SkyLibrary';
import { PostFX } from '../rush/PostFX';

/**
 * Draws VORIXA City (ADR-0014) from the CC0 Quaternius assets built by
 * `scripts/assets/build-city.mjs`: the Downtown City MegaKit district, a Universal Base
 * Characters hero driven by the Universal Animation Library, a photographed sky for light, and the
 * shared post chain.
 *
 * The static district is merged by material after it is laid out, so a few hundred placed pieces
 * cost a few dozen draw calls.
 */

export type ViewMode = 'third' | 'first';

/** Third-person camera: over the right shoulder, pulled in when a wall is in the way. */
const CAMERA_DISTANCE = 4.2;
const CAMERA_DISTANCE_AIM = 2.1;
const SHOULDER = 0.55;
const SHOULDER_AIM = 0.75;
const PIVOT_HEIGHT = 1.6;
const EYE_HEIGHT = 1.68;

/** Clips of the Ultimate Modular Characters rig that the hero uses. */
type Clip =
  | 'Idle' | 'Walk' | 'Run' | 'Run_Back' | 'Run_Left' | 'Run_Right' | 'Run_Shoot'
  | 'Idle_Gun' | 'Idle_Gun_Pointing' | 'Idle_Gun_Shoot' | 'Gun_Shoot' | 'Roll' | 'Wave' | 'Death';

/** The hero's outfit (see public/city/people). */
const HERO_MODEL = '/city/people/m-casual_hoodie.glb';
const HERO_HEIGHT = 1.8;
/** The run clip frozen here is a full stride: it reads as a leap, and the rig's IK feet stay put. */
const LEAP_PHASE = 0.3;

export class CityRenderer {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 1200);
  public view: ViewMode = 'third';
  /** Camera orientation, driven by the mouse. */
  public yaw = 0;
  public pitch = -0.12;
  public aiming = false;

  private renderer!: THREE.WebGLRenderer;
  private post: PostFX | null = null;
  private skies: SkyLibrary | null = null;
  private readonly sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  private readonly hemi = new THREE.HemisphereLight(0xd8e6ff, 0x5a5048, 0.35);
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  private hero: THREE.Object3D | null = null;
  private heroMeshes: THREE.Object3D[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private landing = 0;
  private colliders: readonly Box[] = [];

  private readonly camPos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private cameraDistance = CAMERA_DISTANCE;
  private shoulder = SHOULDER;
  private fovBase = 62;
  public ready = false;

  public constructor() {
    this.scene.fog = new THREE.Fog(0xbfd0e0, 120, 420);
    this.scene.background = new THREE.Color(0xa9c6e6);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -35;
    sc.right = 35;
    sc.top = 35;
    sc.bottom = -35;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
  }

  /**
   * @param low The low-effects preset (`?lowfx`): no post chain, no shadows, half resolution.
   *   For weak GPUs, and for software-rendered browser tests.
   */
  public initialize(canvas: HTMLCanvasElement, low = false): void {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(low ? 0.5 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.skies = new SkyLibrary(this.renderer);
    void this.skies.load('beach').then((sky) => {
      if (!sky) return;
      this.scene.background = sky.backdrop;
      this.scene.environment = sky.environment;
      this.scene.backgroundIntensity = 1.05;
      // The noon sky is strong; at full strength it washes the asphalt out to grey-white.
      this.scene.environmentIntensity = 0.6;
    });
    if (low) this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    else this.post = new PostFX(this.renderer, this.scene, this.camera);
  }

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Loads the assets and builds the district. Resolves when the city can be drawn. */
  public async load(district: District, onProgress: (share: number) => void = () => {}): Promise<void> {
    this.colliders = district.colliders;
    let done = 0;
    const track = <T,>(p: Promise<T>) =>
      p.then((v) => {
        onProgress(++done / 2);
        return v;
      });
    const [city, hero] = await Promise.all([
      track(this.loader.loadAsync('/city/district/city.gltf')),
      track(this.loader.loadAsync(HERO_MODEL))
    ]);
    this.buildDistrict(city, district);
    this.buildHero(hero);
    this.ready = true;
  }

  private buildDistrict(city: GLTF, district: District): void {
    // Merge per chunk (a block, or a road cell) and per material: few draw calls, but each chunk
    // is its own mesh, so blocks out of view are culled from the camera and the shadow passes.
    const groups = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    for (const p of district.placements) {
      const source = city.scene.getObjectByName(p.piece);
      if (!source) continue;
      const piece = source.clone(true);
      piece.position.set(p.x, 0, p.z);
      piece.rotation.set(0, p.rot, 0);
      piece.updateMatrixWorld(true);
      piece.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const geometry = toFloat(mesh.geometry).applyMatrix4(mesh.matrixWorld);
        // The kit keeps wear and dirt masks in vertex colours for its engines' custom shaders;
        // multiplied in as colour they paint every wall base red.
        geometry.deleteAttribute('color');
        const signature = Object.keys(geometry.attributes).sort().join(',') + (geometry.index ? '|i' : '|n');
        const key = `${p.chunk}|${mesh.material.uuid}|${signature}`;
        const group = groups.get(key) ?? { material: mesh.material, geometries: [] };
        group.geometries.push(geometry);
        groups.set(key, group);
      });
    }
    const district3d = new THREE.Group();
    district3d.name = 'district';
    for (const { material, geometries } of groups.values()) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      const transparent = (material as THREE.MeshStandardMaterial).transparent;
      mesh.castShadow = !transparent;
      mesh.receiveShadow = true;
      district3d.add(mesh);
      this.tuneMaterial(material);
    }
    this.scene.add(district3d);

    // Paving inside the blocks. Plain: the kit's concrete texture is a trim sheet, and tiling it
    // across a block paints stripes.
    const span = district.pitch * (district.roadsX + 1);
    const paving = new THREE.MeshStandardMaterial({ color: 0x8e8a83, roughness: 0.92 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), paving);
    const mid = (district.pitch * (district.roadsX - 1)) / 2;
    ground.position.set(mid, -0.16, mid);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /** Window glass reflects the sky; everything else keeps the kit's PBR values. */
  private tuneMaterial(material: THREE.Material): void {
    const m = material as THREE.MeshStandardMaterial;
    if (!m.isMeshStandardMaterial) return;
    if (m.vertexColors) {
      m.vertexColors = false;
      m.needsUpdate = true;
    }
    if (/glass/i.test(m.name)) {
      m.roughness = 0.05;
      m.metalness = 0.9;
      m.envMapIntensity = 1.4;
    }
  }

  private buildHero(hero: GLTF): void {
    const model = hero.scene;
    // Normalise to a 1.8 m person, feet on the ground, whatever the export scale.
    const box = new THREE.Box3().setFromObject(model);
    const scale = HERO_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.heroMeshes.push(mesh);
      const m = mesh.material as THREE.MeshStandardMaterial;
      // Flat-coloured cloth and skin: a little sheen, never plastic.
      if (m.isMeshStandardMaterial) {
        m.roughness = Math.max(m.roughness, 0.6);
        m.metalness = 0;
      }
    });
    const root = new THREE.Group();
    root.add(model);
    this.hero = root;
    this.scene.add(root);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of hero.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('Idle', 0);
  }

  private play(name: Clip, fade = 0.18, once = false, speed = 1): void {
    const action = this.actions.get(name);
    if (!action) return;
    action.timeScale = speed;
    if (name === this.currentName) return;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    if (this.current) this.current.crossFadeTo(action, fade, false);
    action.play();
    this.current = action;
    this.currentName = name;
  }

  /** Called with the hero's per-step effects, for animation cues. */
  public heroEvent(fx: 'jump' | 'land'): void {
    if (fx === 'land') this.landing = 0.15;
  }

  public render(hero: HeroMotor, dt: number): void {
    if (!this.ready || !this.hero) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.animateHero(hero, dt);
    this.placeCamera(hero, dt);

    this.sun.position.set(hero.x - 40, 70, hero.z + 25);
    this.sun.target.position.set(hero.x, 0, hero.z);
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private animateHero(hero: HeroMotor, dt: number): void {
    const root = this.hero!;
    root.position.set(hero.x, hero.y, hero.z);
    root.rotation.y = hero.facing;
    const speed = hero.speed;
    this.landing = Math.max(0, this.landing - dt);

    if (!hero.grounded) {
      // A leap: the run cycle held at full stride.
      if (this.currentName !== 'Run' || (this.current && this.current.timeScale !== 0)) {
        this.play('Run', 0.1, false, 0);
        const run = this.actions.get('Run');
        if (run) run.time = run.getClip().duration * LEAP_PHASE;
      }
    } else if (this.aiming) {
      // Aiming: strafe, backpedal or advance relative to where the hero faces.
      if (speed < 0.5) this.play('Idle_Gun_Pointing', 0.12);
      else {
        const fx = Math.sin(hero.facing);
        const fz = Math.cos(hero.facing);
        const along = (hero.vx * fx + hero.vz * fz) / speed;
        const side = (hero.vx * fz - hero.vz * fx) / speed;
        const clip: Clip = along > 0.7 ? 'Run_Shoot' : along < -0.7 ? 'Run_Back' : side > 0 ? 'Run_Left' : 'Run_Right';
        this.play(clip, 0.15, false, Math.max(0.6, speed / 4.6));
      }
    } else if (speed > 5.6) this.play('Run', 0.2, false, 1.1 + (speed - 5.6) * 0.12);
    else if (speed > 2.6) this.play('Run', 0.2, false, speed / 5.2);
    else if (speed > 0.25) this.play('Walk', 0.2, false, Math.max(0.7, speed / 1.7));
    else this.play('Idle', 0.25);
    this.mixer?.update(dt);

    // First person: the body would fill the view; hide it (the gun viewmodel comes with gunplay).
    const visible = this.view === 'third';
    for (const m of this.heroMeshes) m.visible = visible;
  }

  private placeCamera(hero: HeroMotor, dt: number): void {
    const k = 1 - Math.exp(-12 * dt);
    const cam = this.camera;
    const targetFov = this.aiming ? 48 : this.fovBase + Math.min(8, Math.max(0, hero.speed - 5) * 3);
    cam.fov += (targetFov - cam.fov) * k;
    cam.updateProjectionMatrix();

    const lookX = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const lookY = Math.sin(this.pitch);
    const lookZ = -Math.cos(this.yaw) * Math.cos(this.pitch);

    if (this.view === 'first') {
      cam.position.set(hero.x, hero.y + EYE_HEIGHT, hero.z);
      this.target.set(cam.position.x + lookX, cam.position.y + lookY, cam.position.z + lookZ);
      cam.lookAt(this.target);
      return;
    }

    this.cameraDistance += ((this.aiming ? CAMERA_DISTANCE_AIM : CAMERA_DISTANCE) - this.cameraDistance) * k;
    this.shoulder += ((this.aiming ? SHOULDER_AIM : SHOULDER) - this.shoulder) * k;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const pivot = this.tmp.set(hero.x + rightX * this.shoulder, hero.y + PIVOT_HEIGHT, hero.z + rightZ * this.shoulder);
    // Back along the look direction, but never through a wall.
    const want = this.cameraDistance;
    const hit = rayBoxes(pivot.x, pivot.y, pivot.z, -lookX, -lookY, -lookZ, want, this.colliders);
    const d = Math.max(0.6, Math.min(want, hit - 0.25));
    this.camPos.set(pivot.x - lookX * d, Math.max(0.4, pivot.y - lookY * d), pivot.z - lookZ * d);
    cam.position.copy(this.camPos);
    this.target.set(pivot.x + lookX * 10, pivot.y + lookY * 10, pivot.z + lookZ * 10);
    cam.lookAt(this.target);
  }
}

/**
 * A float copy of a geometry. The built assets store vertex data quantized (normalized 16-bit
 * integers, undone by each node's transform); baking a world transform into such an attribute
 * would clamp every vertex to ±1, so attributes are widened before merging.
 */
function toFloat(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (source.index) geometry.setIndex(Array.from(source.index.array as ArrayLike<number>));
  return geometry;
}

/** Distance along a ray to the nearest box (slab test), or `max` if none is closer. */
export function rayBoxes(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, boxes: readonly Box[]): number {
  let best = max;
  for (const b of boxes) {
    let t0 = 0;
    let t1 = best;
    const slabs: [number, number, number, number][] = [
      [ox, dx, b.minX, b.maxX],
      [oy, dy, 0, b.height],
      [oz, dz, b.minZ, b.maxZ]
    ];
    let hit = true;
    for (const [o, d, lo, hi] of slabs) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          hit = false;
          break;
        }
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) {
        hit = false;
        break;
      }
    }
    if (hit) best = Math.min(best, t0);
  }
  return best;
}
