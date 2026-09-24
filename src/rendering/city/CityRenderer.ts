import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box, District } from '../../city/CityLayout';
import { wrap, type HeroFx, type HeroMotor } from '../../city/HeroMotor';
import { SkyLibrary } from '../rush/SkyLibrary';
import { PostFX } from '../rush/PostFX';
import { rayBoxes, type Combat } from '../../city/Combat';
import { CombatView } from './CombatView';
import { VehicleView } from './VehicleView';
import { People, type Grip, type Person } from './People';
import { Showroom } from './Showroom';
import { CityLifeView } from './CityLifeView';
import { JobView } from './JobView';
import { ChaosView } from './ChaosView';
import { OutpostView } from './OutpostView';
import { RooftopView } from './RooftopView';
import type { Ladder } from '../../city/Rooftops';
import type { Chaos } from '../../city/Chaos';
import type { OutpostDef, Outposts } from '../../city/Outposts';
import type { CityLife } from '../../city/CityLife';
import { CANTOR, CHOIR, CREW, POLICE, type CharacterDef } from '../../city/Crew';
import { coverBox, type Vehicle } from '../../city/Vehicle';

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
  | 'Idle_Gun' | 'Idle_Gun_Pointing' | 'Idle_Gun_Shoot' | 'Gun_Shoot' | 'Roll' | 'Wave' | 'Death' | 'Takedown' | 'Climb' | 'Glide';

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
  /** Field of view while aiming: the current gun's (a sniper zooms far further). */
  public aimFov = 48;
  /** Seconds since the hero last fired, for the shooting poses. */
  public sinceFired = 99;
  /** 0..1 through a reload (0 when not reloading), set by the game each frame. */
  public reloadProgress = 0;
  /** The reload gesture: the arms-only part of the "Interact" clip, blended over anything. */
  private reloadAction: THREE.AnimationAction | null = null;
  /** Recoil punch on the view, radians; decays back to the aim point. */
  public punchPitch = 0;
  public punchYaw = 0;
  public combatView: CombatView | null = null;
  public vehicleView: VehicleView | null = null;
  public lifeView: CityLifeView | null = null;
  public readonly jobView = new JobView();
  /** Barrels, blasts and fires. */
  public readonly chaosView: ChaosView;
  public outpostView: OutpostView | null = null;
  /** Ladders up the tall buildings, and the hero's glider. */
  public rooftopView: RooftopView | null = null;
  private lastFacing = 0;
  /** The simulations the two views above draw, set by the game. */
  public chaos: Chaos | null = null;
  public outposts: Outposts | null = null;
  /** Seconds left of the hero's takedown move, during which it plays over everything. */
  private takingDown = 0;
  /** The car the hero is driving, or null on foot. */
  public driving: Vehicle | null = null;
  private heroHand: THREE.Object3D | null = null;
  private heroHead: THREE.Object3D | null = null;
  private heroGrip: Grip | null = null;

  private renderer!: THREE.WebGLRenderer;
  private post: PostFX | null = null;
  private skies: SkyLibrary | null = null;
  private readonly sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  private readonly hemi = new THREE.HemisphereLight(0xd8e6ff, 0x5a5048, 0.35);
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  private hero: THREE.Object3D | null = null;
  private heroMeshes: THREE.Object3D[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  public readonly people = new People();
  /** Who the hero is: a crew member, dressed by `People`. */
  public heroDef: CharacterDef = CREW[0];
  /** The Safehouse turntable; drawn instead of the city while it is open. */
  public readonly showroom = new Showroom(this.people);
  public showroomOpen = false;
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private landing = 0;
  private colliders: readonly Box[] = [];
  /** Cars the camera must not pass through (refreshed each frame from the vehicles). */
  private readonly carBoxes: Box[] = [];

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
    this.chaosView = new ChaosView(this.camera);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.jobView.group, this.chaosView.group);
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
    this.showroom.resize(width / height);
  }

  /** Loads the assets and builds the district. Resolves when the city can be drawn. */
  public async load(district: District, onProgress: (share: number) => void = () => {}): Promise<void> {
    this.colliders = district.colliders;
    let done = 0;
    const track = <T,>(p: Promise<T>) =>
      p.then((v) => {
        onProgress(++done / 8);
        return v;
      });
    const [city, hero, guns, swat, soldier, cars, police, cantor] = await Promise.all([
      track(this.loader.loadAsync('/city/district/city.gltf')),
      track(this.people.make(this.heroDef)),
      track(this.loader.loadAsync('/city/guns.glb')),
      track(this.people.load(CHOIR[0].model)),
      track(this.people.load(CHOIR[1].model)),
      track(this.loader.loadAsync('/city/cars.glb')),
      track(this.people.load(POLICE.model)),
      track(this.people.load(CANTOR.model))
    ]);
    this.buildDistrict(city, district);
    this.buildHero(hero);
    this.scene.add(this.camera);
    // The Choir: enforcers in black suits, soldiers in oxblood, and Cantor himself.
    this.combatView = new CombatView(
      guns,
      (kind) =>
        kind === 'boss'
          ? this.people.makeFrom(cantor, CANTOR, 0.45)
          : kind === 'police'
          ? this.people.makeFrom(police, POLICE, 0.25)
          : this.people.makeFrom(kind === 'swat' ? swat : soldier, kind === 'swat' ? CHOIR[0] : CHOIR[1], 0.25),
      this.camera,
      this.heroHand,
      this.hero!,
      this.heroGrip
    );
    this.scene.add(this.combatView.group);
    this.vehicleView = new VehicleView(cars);
    this.scene.add(this.vehicleView.group);
    this.lifeView = new CityLifeView(this.people);
    this.scene.add(this.lifeView.group);
    this.lifeView.preload();
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

  private buildHero(person: Person): void {
    // An arms-only copy of "Interact" is the reload (for the cast, the real pistol reload; for the
    // older outfits, reaching and working with the hands). It plays over whatever the legs are
    // doing, so the hero can reload on the move.
    const interact = person.actions.get('Interact')?.getClip();
    if (interact) {
      const arms = interact.clone();
      arms.name = 'Reload_Arms';
      arms.tracks = arms.tracks.filter((t) => /arm|wrist|hand|clavicle|index|middle|ring|pinky|thumb|shoulder/i.test(t.name));
      this.reloadAction = person.mixer.clipAction(arms);
      this.reloadAction.setLoop(THREE.LoopRepeat, Infinity);
      this.reloadAction.weight = 0;
      this.reloadAction.play();
    } else this.reloadAction = null;
    this.hero = person.root;
    if (this.rooftopView) person.root.add(this.rooftopView.glider);
    this.heroMeshes = person.meshes;
    this.heroHand = person.hand;
    this.heroGrip = person.grip;
    this.heroHead = person.head;
    this.mixer = person.mixer;
    this.actions = person.actions;
    this.current = null;
    this.currentName = '';
    this.scene.add(person.root);
    this.play('Idle', 0);
  }

  /** A storyboard portrait of a character (rendered in the Safehouse studio, cached). */
  public portrait(def: CharacterDef): Promise<string> {
    return this.showroom.portrait(def, this.renderer, this.scene.environment);
  }

  /** Swaps who the hero is (the Safehouse), keeping position, facing and the gun in hand. */
  public async setHero(def: CharacterDef): Promise<void> {
    if (!this.ready) {
      this.heroDef = def;
      return;
    }
    const person = await this.people.make(def);
    const old = this.hero;
    if (old) {
      person.root.position.copy(old.position);
      person.root.rotation.copy(old.rotation);
      old.removeFromParent();
    }
    this.heroDef = def;
    this.buildHero(person);
    this.combatView?.rebindHero(person.hand, person.root, person.grip);
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

  /** Builds the outposts' barricades, banners and alarms (their fuel is drawn by the chaos view). */
  public setOutposts(defs: readonly OutpostDef[], accent: string): void {
    this.outpostView?.group.removeFromParent();
    this.outpostView = new OutpostView(defs, accent);
    this.scene.add(this.outpostView.group);
  }

  /** Builds the rooftop ladders and the glider (in the crew's colour). */
  public setLadders(ladders: readonly Ladder[], accent: string): void {
    this.rooftopView?.group.removeFromParent();
    this.rooftopView = new RooftopView(ladders, accent);
    this.scene.add(this.rooftopView.group);
    this.hero?.add(this.rooftopView.glider);
  }

  /** The hero's silent takedown: a short, sharp strike. */
  public takedown(): void {
    this.takingDown = 0.7;
    this.currentName = '';
    this.play('Takedown', 0.05, true, 1.4);
  }

  /** Called with the hero's per-step effects, for animation cues. */
  public heroEvent(fx: HeroFx): void {
    if (fx === 'land') this.landing = 0.15;
    if (fx === 'glide') this.rooftopView?.setGliding(true);
    if (fx === 'stow') this.rooftopView?.setGliding(false);
  }

  public render(hero: HeroMotor, dt: number, combat?: Combat, vehicles: readonly Vehicle[] = [], life?: CityLife): void {
    if (this.showroomOpen) {
      this.showroom.render(this.renderer, dt, this.scene.environment);
      return;
    }
    if (!this.ready || !this.hero) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.animateHero(hero, dt);
    this.vehicleView?.update(vehicles, dt);
    this.carBoxes.length = 0;
    for (const v of vehicles) {
      if (v === this.driving || Math.abs(v.x - hero.x) > 14 || Math.abs(v.z - hero.z) > 14) continue;
      this.carBoxes.push(coverBox(v, { minX: 0, maxX: 0, minZ: 0, maxZ: 0, height: 0 }));
    }
    if (life) this.lifeView?.update(life, dt);
    if (this.chaos) this.chaosView.update(this.chaos, dt);
    if (this.outposts) this.outpostView?.update(this.outposts, dt, this.camera.position);
    const turn = dt > 0 ? wrap(hero.facing - this.lastFacing) / dt : 0;
    this.lastFacing = hero.facing;
    this.rooftopView?.update(dt, turn, hero.x, hero.z);
    this.jobView.update(performance.now() / 1000);
    if (this.driving) this.placeDriveCamera(this.driving, dt);
    else this.placeCamera(hero, dt);
    if (combat && this.combatView) {
      this.combatView.update(combat, dt, performance.now() / 1000, this.view === 'first', this.aiming, Math.min(1, hero.speed / 4.6));
    }

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

    if (this.takingDown > 0) {
      this.takingDown -= dt;
    } else if (hero.mode === 'climb') {
      this.play('Climb', 0.15);
    } else if (hero.mode === 'glide') {
      this.play('Glide', 0.3);
    } else if (!hero.grounded) {
      // A leap: the run cycle held at full stride.
      if (this.currentName !== 'Run' || (this.current && this.current.timeScale !== 0)) {
        this.play('Run', 0.1, false, 0);
        const run = this.actions.get('Run');
        if (run) run.time = run.getClip().duration * LEAP_PHASE;
      }
    } else if (this.aiming) {
      // Aiming: strafe, backpedal or advance relative to where the hero faces.
      if (speed < 0.5) this.play(this.sinceFired < 0.25 ? 'Idle_Gun_Shoot' : 'Idle_Gun_Pointing', 0.1);
      else {
        const fx = Math.sin(hero.facing);
        const fz = Math.cos(hero.facing);
        const along = (hero.vx * fx + hero.vz * fz) / speed;
        const side = (hero.vx * fz - hero.vz * fx) / speed;
        const clip: Clip = along > 0.7 ? 'Run_Shoot' : along < -0.7 ? 'Run_Back' : side > 0 ? 'Run_Left' : 'Run_Right';
        this.play(clip, 0.15, false, Math.max(0.6, speed / 4.6));
      }
    } else if (this.sinceFired < 0.4 && speed > 0.5) this.play('Run_Shoot', 0.1, false, Math.max(0.7, speed / 4.6));
    else if (this.sinceFired < 0.4) this.play('Idle_Gun_Shoot', 0.08);
    else if (speed > 5.6) this.play('Run', 0.2, false, 1.1 + (speed - 5.6) * 0.12);
    else if (speed > 2.6) this.play('Run', 0.2, false, speed / 5.2);
    else if (speed > 0.25) this.play('Walk', 0.2, false, Math.max(0.7, speed / 1.7));
    else this.play('Idle_Gun', 0.25);
    if (this.reloadAction) {
      const target = this.reloadProgress > 0 && !this.driving ? 1.4 : 0;
      this.reloadAction.weight += (target - this.reloadAction.weight) * Math.min(1, 12 * dt);
    }
    this.mixer?.update(dt);
    this.sinceFired += dt;

    // First person: the body would fill the view; hide it (the gun viewmodel comes with gunplay).
    // Inside a car the hero is hidden (the pack's windows are opaque). In first person the body
    // stays: the head is collapsed so the camera can sit at the eyes and look down at real arms
    // holding the real gun, as modern shooters do.
    const visible = !this.driving;
    for (const m of this.heroMeshes) m.visible = visible;
    if (this.heroHead) this.heroHead.scale.setScalar(this.view === 'first' ? 0.001 : 1);
  }

  /** Chase camera behind the car (or the driver's view in first person), wider at speed. */
  private placeDriveCamera(car: Vehicle, dt: number): void {
    const k = 1 - Math.exp(-8 * dt);
    const cam = this.camera;
    const speed = Math.abs(car.forwardSpeed);
    cam.fov += (this.fovBase + Math.min(16, speed * 0.45) - cam.fov) * k;
    cam.updateProjectionMatrix();
    const yaw = this.yaw;
    const pitch = Math.min(0.2, this.pitch);
    const lookX = -Math.sin(yaw) * Math.cos(pitch);
    const lookY = Math.sin(pitch);
    const lookZ = -Math.cos(yaw) * Math.cos(pitch);
    if (this.view === 'first') {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      // The driver's seat: left of centre, eye height, a little behind the windscreen.
      cam.position.set(car.x + fz * 0.35 - fx * 0.1, 1.15, car.z - fx * 0.35 - fz * 0.1);
      this.target.set(cam.position.x + lookX, cam.position.y + lookY, cam.position.z + lookZ);
      cam.lookAt(this.target);
      return;
    }
    const pivot = this.tmp.set(car.x, 1.7, car.z);
    const want = 7 + Math.min(2.5, speed * 0.06);
    const hit = rayBoxes(pivot.x, pivot.y, pivot.z, -lookX, -lookY, -lookZ, want, this.colliders);
    const d = Math.max(1.5, Math.min(want, hit - 0.3));
    cam.position.set(pivot.x - lookX * d, Math.max(0.8, pivot.y - lookY * d + 0.6), pivot.z - lookZ * d);
    this.target.set(pivot.x + lookX * 8, pivot.y + lookY * 8, pivot.z + lookZ * 8);
    cam.lookAt(this.target);
  }

  private placeCamera(hero: HeroMotor, dt: number): void {
    const k = 1 - Math.exp(-12 * dt);
    const cam = this.camera;
    const gliding = hero.mode === 'glide';
    const targetFov = this.aiming ? this.aimFov : this.fovBase + (gliding ? 12 : Math.min(8, Math.max(0, hero.speed - 5) * 3));
    this.punchPitch *= Math.exp(-10 * dt);
    this.punchYaw *= Math.exp(-10 * dt);
    cam.fov += (targetFov - cam.fov) * k;
    cam.updateProjectionMatrix();

    // A blast nearby shakes the view, and the shake dies away fast.
    const shake = this.chaosView.shake;
    this.chaosView.shake *= Math.exp(-7 * dt);
    const yaw = this.yaw + this.punchYaw + (Math.random() - 0.5) * shake;
    const pitch = this.pitch + this.punchPitch + (Math.random() - 0.5) * shake;
    const lookX = -Math.sin(yaw) * Math.cos(pitch);
    const lookY = Math.sin(pitch);
    const lookZ = -Math.cos(yaw) * Math.cos(pitch);

    if (this.view === 'first') {
      cam.position.set(hero.x, hero.y + EYE_HEIGHT, hero.z);
      if (this.heroHead) {
        // The eyes: the head bone, a touch forward so the collapsed head never shows.
        this.heroHead.getWorldPosition(this.tmp);
        cam.position.set(this.tmp.x + lookX * 0.14, this.tmp.y + 0.1, this.tmp.z + lookZ * 0.14);
      }
      this.target.set(cam.position.x + lookX, cam.position.y + lookY, cam.position.z + lookZ);
      cam.lookAt(this.target);
      return;
    }

    // Gliding: pulled well back and up, to see the canopy and the drop.
    this.cameraDistance += ((this.aiming ? CAMERA_DISTANCE_AIM : gliding ? 8.5 : CAMERA_DISTANCE) - this.cameraDistance) * k;
    this.shoulder += ((this.aiming ? SHOULDER_AIM : SHOULDER) - this.shoulder) * k;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const pivot = this.tmp.set(hero.x + rightX * this.shoulder, hero.y + PIVOT_HEIGHT + (gliding ? 2.2 : 0), hero.z + rightZ * this.shoulder);
    // Back along the look direction, but never through a wall.
    const want = this.cameraDistance;
    const hit = rayBoxes(pivot.x, pivot.y, pivot.z, -lookX, -lookY, -lookZ, rayBoxes(pivot.x, pivot.y, pivot.z, -lookX, -lookY, -lookZ, want, this.carBoxes), this.colliders);
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
