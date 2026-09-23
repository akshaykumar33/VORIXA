import * as THREE from 'three';
import {
  LANE_WIDTH,
  MAX_SPEED,
  START_SPEED,
  KIND_SHAPE,
  aimAt,
  type RushSim,
  type Entity,
  type EntityKind,
  type FxRecord
} from '../../rush/RushSim';
import { ParticleRenderer } from '../ParticleRenderer';
import { bend, bent, flat, ink, toon } from './Toon';
import { Scenery } from './Scenery';
import { buildVehicle, buildTraffic, TRAFFIC_KINDS, type CarModel, type VehicleKind } from './Vehicles';
import type { BiomeId } from '../../rush/Zones';
import type { DroneStyle } from './Models';

/** Which enemy costume each world uses, and in which colours. */
const DRONE_LOOK: Record<BiomeId, [DroneStyle, number, number]> = {
  meadow: ['bee', 0xffd23f, 0x1d1b33],
  candy: ['bee', 0xff8fc8, 0x1d1b33],
  beach: ['bee', 0xff9f1c, 0x1d1b33],
  desert: ['saucer', 0xe8955a, 0x3fa7ff],
  snow: ['saucer', 0x9fe3ff, 0xff4d5e],
  neon: ['ufo', 0x6a3aa8, 0x3ff7ff]
};
import {
  buildTruck,
  buildBarrier,
  buildCrate,
  buildDrone,
  buildShot,
  buildNitro,
  buildHeart,
  buildRamp,
  coinGeometry,
  type DroneModel,
  type BarrierModel
} from './Models';

/**
 * Draws a `RushSim`.
 *
 * Read-only with respect to the simulation: it reads positions and effect records and never
 * writes back. All motion that is purely cosmetic — squash and stretch, body roll, wheel spin,
 * camera shake — lives here, so the rules stay deterministic while the presentation is free to be
 * as bouncy as it likes.
 *
 * ## Car-relative space
 *
 * The car is always at z = 0; an entity `d` metres ahead is drawn at z = -d. See `Scenery`.
 */

const FOG_NEAR = 90;
const FOG_FAR = 245;

/** Crosshair range, matching the sim's aim ray. */
const AIM_DISTANCE = 45;
const AIM_SPREAD = LANE_WIDTH * 1.6;

/** A reusable model for one entity kind, recycled between entities. */
interface Actor {
  root: THREE.Group;
  blob: THREE.Mesh;
  car?: CarModel;
  drone?: DroneModel;
  barrier?: BarrierModel;
  /** Hover height of the model's origin above the entity's y, for bobbing pickups. */
  lift: number;
}

type PoolKey = string;

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export class RushRenderer {
  private renderer!: THREE.WebGLRenderer;
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(64, 1, 0.1, 700);

  private readonly scenery = new Scenery();
  private player: CarModel = buildVehicle('zippy');
  /** Seconds left on the driver's fist-pump after a kill. */
  private cheer = 0;
  /** Seconds left seeing stars after a crash. */
  private dizzy = 0;
  private readonly playerBlob: THREE.Mesh;
  private readonly particles = new ParticleRenderer(900);

  private readonly pools = new Map<PoolKey, Actor[]>();
  private readonly used = new Map<PoolKey, number>();
  /** The world each drone was first seen in, so it keeps one costume for its whole life. */
  private readonly droneBiome = new Map<number, BiomeId>();

  private readonly coins: THREE.InstancedMesh;
  private readonly coinHulls: THREE.InstancedMesh;
  private readonly bullets: THREE.InstancedMesh;
  private readonly lockRing: THREE.Mesh;
  private readonly laneBeacon: THREE.Mesh;
  private laneBeaconLane = 0;

  private readonly sun = new THREE.DirectionalLight(0xfff4dc, 1.7);
  private readonly hemi = new THREE.HemisphereLight(0xe6f4ff, 0x9bd48a, 1.15);
  private readonly fog = new THREE.Fog(0xffe2b8, FOG_NEAR, FOG_FAR);

  // Presentation state.
  private squash = 0;
  private squashVelocity = 0;
  private roll = 0;
  private pitch = 0;
  private wheelSpin = 0;
  private trauma = 0;
  private fov = 64;
  private readonly cameraPosition = new THREE.Vector3(0, 3.6, 7.8);
  private readonly cameraTarget = new THREE.Vector3(0, 1.3, -10);
  private readonly lookTarget = new THREE.Vector3();
  private lastDistance = 0;
  private time = 0;
  private turretYaw = 0;
  /** 1 on the title screen's showroom orbit, 0 in the chase view; eased between. */
  private showroom = 1;
  private readonly orbitPosition = new THREE.Vector3();
  private readonly orbitTarget = new THREE.Vector3();

  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  private width = 1;
  private height = 1;

  public constructor() {
    // The sky is a dome in the scenery, coloured per world.
    this.scene.fog = this.fog;
    this.scene.add(this.hemi);
    this.sun.position.set(-8, 18, 6);
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.scenery.group);
    this.scene.add(this.player.root);
    this.playerBlob = blobShadow(1.3, 2.3);
    this.scene.add(this.playerBlob);

    const particleMesh = this.particles.object as THREE.InstancedMesh;
    bent(particleMesh.material as THREE.Material);
    this.scene.add(particleMesh);

    const coinGeo = coinGeometry();
    this.coins = new THREE.InstancedMesh(coinGeo, toon(0xffd23f, { emissive: 0x6b4a00 }), 96);
    const hullGeo = coinGeo.clone().scale(1.14, 1.14, 1.6);
    this.coinHulls = new THREE.InstancedMesh(hullGeo, ink(), 96);
    for (const m of [this.coins, this.coinHulls]) {
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }

    const bulletGeo = new THREE.CapsuleGeometry(0.12, 1.1, 4, 8).rotateX(Math.PI / 2);
    this.bullets = new THREE.InstancedMesh(bulletGeo, flat(0xfff06a), 24);
    this.bullets.frustumCulled = false;
    this.bullets.count = 0;
    this.scene.add(this.bullets);

    // Shown around whatever the aim assist has locked on to, so eye and hand players can see
    // what they are about to hit.
    this.lockRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.1, 6, 32),
      bent(new THREE.MeshBasicMaterial({ color: 0xff4fd8, fog: false, depthTest: false, transparent: true }))
    );
    this.lockRing.renderOrder = 10;
    this.lockRing.visible = false;
    this.scene.add(this.lockRing);

    // A glowing arrow painted on a lane, for the driving school's "look here" lessons.
    const arrow = new THREE.Shape();
    arrow.moveTo(0, 2.2);
    arrow.lineTo(1.3, 0.6);
    arrow.lineTo(0.5, 0.6);
    arrow.lineTo(0.5, -2);
    arrow.lineTo(-0.5, -2);
    arrow.lineTo(-0.5, 0.6);
    arrow.lineTo(-1.3, 0.6);
    arrow.closePath();
    this.laneBeacon = new THREE.Mesh(
      new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2),
      bent(new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.85, depthWrite: false, fog: false }))
    );
    this.laneBeacon.visible = false;
    this.laneBeacon.renderOrder = 3;
    this.scene.add(this.laneBeacon);
  }

  public initialize(canvas: HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // No tone mapping: cartoon colours are chosen exactly and should arrive exactly.
    this.renderer.toneMapping = THREE.NoToneMapping;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Effects raised by the simulation this tick. Called per tick, not per frame. */
  public effect(fx: FxRecord, carDistance: number): void {
    const x = fx.x;
    const y = fx.y;
    const z = -(fx.z - carDistance);
    const p = this.particles;
    switch (fx.type) {
      case 'coin':
        p.burst('coin', x, y + 0.4, z);
        break;
      case 'smash':
        p.burst('smash', x, y, z, { intensity: 1.3 });
        this.addTrauma(0.12);
        break;
      case 'explode':
        this.cheer = 0.9;
        p.burst('explode', x, y, z, { intensity: 1.4 });
        p.burst('smoke', x, y + 0.5, z, { intensity: 1.5 });
        this.addTrauma(0.3);
        break;
      case 'crash':
        p.burst('explode', x, y, z, { intensity: 1 });
        p.burst('hazard', x, y, z, { intensity: 2 });
        p.burst('smoke', x, y, z + 1, { intensity: 2 });
        this.addTrauma(0.85);
        this.squashVelocity -= 9;
        this.dizzy = 1.5;
        this.cheer = 0;
        break;
      case 'jump':
        p.burst('jump', x, 0.1, z + 1.5, { intensity: 1.2 });
        this.squashVelocity += 7;
        break;
      case 'ramp':
        p.burst('boost', x, 0.3, z + 2, { dirX: 0, dirZ: 1, intensity: 1.2 });
        this.squashVelocity += 10;
        this.addTrauma(0.15);
        break;
      case 'land': {
        const impact = Math.min(fx.amount / 14, 1.6);
        p.burst('land', x, 0.1, z, { intensity: impact });
        this.squashVelocity -= 4 + impact * 8;
        this.addTrauma(impact * 0.25);
        break;
      }
      case 'fire':
        p.burst('muzzle', x, y + 0.5, z - 0.9, { dirX: 0, dirZ: -1 });
        break;
      case 'hit':
        p.burst('hazard', x, y, z, { intensity: 0.6 });
        break;
      case 'pickup':
        p.burst('checkpoint', x, y + 0.8, z, { intensity: 0.8 });
        break;
      case 'enemyFire':
        p.burst('dash', x, y - 0.4, z, { intensity: 0.5 });
        break;
      case 'gameOver':
        p.burst('explode', x, y + 0.6, z, { intensity: 2 });
        p.burst('smoke', x, y + 1, z, { intensity: 2 });
        this.addTrauma(1);
        break;
    }
  }

  private addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public render(sim: RushSim, aimX: number, frameDelta: number): void {
    this.time += frameDelta;
    const travelled = sim.z - this.lastDistance;
    this.lastDistance = sim.z;
    // Particles live in the world, and the world moved toward the camera.
    this.particles.pool.shift(0, 0, travelled);
    this.particles.update(frameDelta);

    // The road swings gently left and right. Driven by distance, so it stops when the car does.
    bend.side.value = Math.sin(sim.z * 0.0021) * 0.0011 + Math.sin(sim.z * 0.0007 + 1.3) * 0.0006;

    this.scenery.update(sim.z, this.time);
    const pal = this.scenery.palette;
    this.fog.color.copy(pal.fog);
    this.hemi.color.copy(pal.hemiSky);
    this.hemi.groundColor.copy(pal.hemiGround);
    this.hemi.intensity = pal.hemiIntensity;
    this.sun.intensity = pal.sunIntensity;
    this.drawPlayer(sim, aimX, frameDelta);
    this.drawEntities(sim);
    this.drawBullets(sim);
    this.drawLock(sim, aimX);
    if (this.laneBeacon.visible) {
      this.laneBeacon.position.set(this.laneBeaconLane * LANE_WIDTH, 0.08, -22 - Math.sin(this.time * 5) * 1.5);
    }
    this.placeCamera(sim, frameDelta);

    this.renderer.render(this.scene, this.camera);
  }

  private drawPlayer(sim: RushSim, aimX: number, dt: number): void {
    const car = this.player;
    car.root.position.set(sim.x, sim.y, 0);

    // Squash and stretch: a damped spring driven by kicks from jumps and landings.
    const k = 220;
    const damping = 16;
    this.squashVelocity += (-k * this.squash - damping * this.squashVelocity) * dt;
    this.squash += this.squashVelocity * dt;
    const s = THREE.MathUtils.clamp(this.squash, -0.35, 0.35);
    car.body.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.3);

    // Lean into lane changes; nose up while climbing, down while falling.
    const targetRoll = THREE.MathUtils.clamp(-sim.vx * 0.018, -0.28, 0.28);
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-12 * dt));
    const targetPitch = sim.grounded ? 0 : THREE.MathUtils.clamp(sim.vy * 0.03, -0.35, 0.35);
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-8 * dt));
    car.body.rotation.set(this.pitch, sim.vx * -0.012, this.roll);
    // An idle engine shake, so the car is alive even standing on the title screen.
    car.body.position.y = Math.sin(this.time * 38) * 0.015 * (sim.speed > 1 ? 1 : 0.4);

    this.wheelSpin -= (sim.speed * dt) / car.wheelRadius;
    for (const wheel of car.wheels) wheel.rotation.x = this.wheelSpin;

    const flameOn = sim.nitroActive;
    for (const flame of car.flames) {
      flame.visible = flameOn;
      if (flameOn) flame.scale.set(1, 1, 0.8 + Math.random() * 0.7);
    }

    if (car.turret) {
      // Turn the blaster toward where the next shot is going.
      const aim = aimAt(sim, aimX, sim.y + 1.1, sim.z + 1.9);
      const yaw = Math.atan2(-aim.vx, 110 + sim.speed);
      this.turretYaw += (yaw - this.turretYaw) * (1 - Math.exp(-14 * dt));
      car.turret.rotation.y = this.turretYaw;
    }

    this.animateDriver(sim, dt);

    // Blink while invulnerable: the universal "you got hit, you're safe for a moment" signal.
    car.root.visible = sim.invulnerable <= 0 || Math.floor(this.time * 14) % 2 === 0;

    this.playerBlob.position.set(sim.x, 0.03, 0);
    const lift = Math.max(0, 1 - sim.y / 6);
    this.playerBlob.scale.setScalar(0.5 + lift * 0.5);
    (this.playerBlob.material as THREE.MeshBasicMaterial).opacity = 0.28 * lift;

    // Keep the shadow-casting light over the car so its shadow never walks off the map.
    this.sun.position.set(sim.x - 8, 18, 6);
    this.sun.target.position.set(sim.x, 0, 0);
  }

  /**
   * The driver is the car's face: they lean into turns, bob with the engine, let their scarf
   * stream in the wind, punch the air after a kill and see stars after a crash.
   */
  private animateDriver(sim: RushSim, dt: number): void {
    const d = this.player.driver;
    if (!d) return;
    const t = this.time;
    this.cheer = Math.max(0, this.cheer - dt);
    this.dizzy = Math.max(0, this.dizzy - dt);
    const wrecked = sim.phase === 'over';

    d.head.rotation.z = -this.roll * 1.3 + (this.dizzy > 0 || wrecked ? Math.sin(t * 11) * 0.3 : 0);
    d.head.rotation.y = this.turretYaw * 0.6;
    d.head.position.y = 0.85 + Math.abs(Math.sin(t * 16)) * 0.03 * Math.min(sim.speed / 20, 1);
    d.stars.visible = this.dizzy > 0 || wrecked;
    d.stars.rotation.y = t * 6;

    const wind = Math.min(sim.speed / 30, 1.4);
    d.scarf.forEach((segment, i) => {
      segment.rotation.x = -0.15 + Math.sin(t * (9 + wind * 8) + i * 1.3) * 0.3 * wind;
      segment.rotation.y = Math.sin(t * 6.5 + i * 0.9) * 0.3 * wind;
    });

    const target = this.cheer > 0 ? -0.35 + Math.sin(t * 22) * 0.25 : -2.4;
    d.arm.rotation.z += (target - d.arm.rotation.z) * (1 - Math.exp(-18 * dt));
  }

  /** Swaps the player's car. Purely cosmetic: every car shares one collision box. */
  public setVehicle(kind: VehicleKind): void {
    this.scene.remove(this.player.root);
    this.player = buildVehicle(kind);
    this.scene.add(this.player.root);
  }

  private drawEntities(sim: RushSim): void {
    for (const key of this.used.keys()) this.used.set(key, 0);
    let coinCount = 0;

    for (const e of sim.entities) {
      if (!e.alive) continue;
      const z = -(e.z - sim.z);
      if (z < -260 || z > 30) continue;

      if (e.kind === 'coin') {
        if (coinCount >= this.coins.instanceMatrix.count) continue;
        this.euler.set(0, this.time * 4 + e.id, 0);
        this.quaternion.setFromEuler(this.euler);
        this.position.set(e.x, e.y + 0.6 + Math.sin(this.time * 5 + e.id) * 0.12, z);
        this.scale.setScalar(1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.coins.setMatrixAt(coinCount, this.matrix);
        this.coinHulls.setMatrixAt(coinCount, this.matrix);
        coinCount++;
        continue;
      }

      const actor = this.acquire(e);
      actor.root.visible = true;
      actor.root.position.set(e.x, e.y + actor.lift, z);
      this.animate(actor, e, sim);
      actor.blob.position.y = -(e.y + actor.lift) + 0.03;
    }

    this.coins.count = coinCount;
    this.coinHulls.count = coinCount;
    this.coins.instanceMatrix.needsUpdate = true;
    this.coinHulls.instanceMatrix.needsUpdate = true;

    // Hide pooled actors nobody claimed this frame.
    for (const [key, pool] of this.pools) {
      const n = this.used.get(key) ?? 0;
      for (let i = n; i < pool.length; i++) pool[i].root.visible = false;
    }
  }

  private poolKey(e: Entity): PoolKey {
    if (e.kind === 'traffic') return `traffic${TRAFFIC_KINDS[e.id % TRAFFIC_KINDS.length]}${e.id % 6}`;
    if (e.kind === 'truck') return `truck${e.id % 3}`;
    if (e.kind === 'drone') return `drone-${this.droneBiomeOf(e)}`;
    return e.kind;
  }

  private droneBiomeOf(e: Entity): BiomeId {
    let biome = this.droneBiome.get(e.id);
    if (!biome) {
      // Bounded: ids only grow, and old drones are long gone by the time this fills.
      if (this.droneBiome.size > 64) this.droneBiome.clear();
      biome = this.scenery.biomeAt(e.z);
      this.droneBiome.set(e.id, biome);
    }
    return biome;
  }

  private acquire(e: Entity): Actor {
    const key = this.poolKey(e);
    let pool = this.pools.get(key);
    if (!pool) {
      pool = [];
      this.pools.set(key, pool);
    }
    const index = this.used.get(key) ?? 0;
    this.used.set(key, index + 1);
    if (index < pool.length) return pool[index];
    const actor = this.build(e);
    pool.push(actor);
    this.scene.add(actor.root);
    return actor;
  }

  private build(e: Entity): Actor {
    const root = new THREE.Group();
    const shape = KIND_SHAPE[e.kind];
    const blob = blobShadow(shape.hx * 1.2, shape.hz * 1.2);
    root.add(blob);
    const actor: Actor = { root, blob, lift: 0 };
    switch (e.kind) {
      case 'traffic': {
        const car = buildTraffic(TRAFFIC_KINDS[e.id % TRAFFIC_KINDS.length], e.id);
        root.add(car.root);
        actor.car = car;
        break;
      }
      case 'truck': {
        const liveries: [string, number][] = [['#ff5a36', 0x3d8bff], ['#2ec4b6', 0xffc93c], ['#9b6bff', 0xff6b5a]];
        const [livery, cab] = liveries[e.id % 3];
        root.add(buildTruck(livery, cab));
        break;
      }
      case 'barrier': {
        const barrier = buildBarrier();
        root.add(barrier.root);
        actor.barrier = barrier;
        break;
      }
      case 'crate':
        root.add(buildCrate());
        break;
      case 'drone': {
        const [style, hull, trim] = DRONE_LOOK[this.droneBiomeOf(e)];
        const drone = buildDrone(style, hull, trim);
        root.add(drone.root);
        actor.drone = drone;
        break;
      }
      case 'shot':
        root.add(buildShot());
        break;
      case 'nitro':
        root.add(buildNitro());
        actor.lift = 0.9;
        break;
      case 'heart':
        root.add(buildHeart());
        actor.lift = 1.0;
        break;
      case 'ramp':
        root.add(buildRamp());
        blob.visible = false;
        break;
      case 'coin':
        break;
    }
    return actor;
  }

  private animate(actor: Actor, e: Entity, sim: RushSim): void {
    const t = this.time;
    const model = actor.root.children[1] as THREE.Object3D | undefined;
    switch (e.kind as EntityKind) {
      case 'traffic':
        if (actor.car) {
          for (const w of actor.car.wheels) w.rotation.x = -(e.z / actor.car.wheelRadius);
          actor.car.body.position.y = Math.abs(Math.sin(t * 9 + e.id)) * 0.05;
        }
        break;
      case 'barrier':
        if (actor.barrier) {
          const on = Math.floor(t * 3 + e.id) % 2 === 0;
          actor.barrier.lamps[0].visible = on;
          actor.barrier.lamps[1].visible = !on;
        }
        break;
      case 'drone':
        if (actor.drone) {
          const d = actor.drone;
          if (d.style === 'bee') {
            // Wings buzz: a fast flap reads as flight far better than any hover.
            for (const w of d.spinners) w.rotation.z = Math.sin(t * 40) * 0.6;
          } else if (d.style === 'ufo') {
            for (const r of d.spinners) r.rotation.y = t * 3;
          } else {
            for (const r of d.spinners) r.rotation.y = t * 30;
          }
          // The eye follows the car. A villain that watches you is a villain you notice.
          d.pupil.position.x = d.pupilHome.x + THREE.MathUtils.clamp((sim.x - e.x) * 0.05, -0.14, 0.14);
          d.light.visible = Math.floor(t * 5) % 2 === 0;
          d.root.rotation.z = Math.sin(t * 2.1 + e.id) * 0.12;
          // A wind-up squash just before firing: the tell that a shot is coming.
          const windUp = e.timer < 0.35 && e.age < 12 ? 1 - e.timer / 0.35 : 0;
          d.root.scale.set(1.4 * (1 + windUp * 0.2), 1.4 * (1 - windUp * 0.25), 1.4 * (1 + windUp * 0.2));
        }
        break;
      case 'shot':
        if (model) model.scale.setScalar(1 + Math.sin(t * 30) * 0.15);
        break;
      case 'nitro':
      case 'heart':
        if (model) {
          model.rotation.y = t * 2.5;
          model.position.y = Math.sin(t * 4 + e.id) * 0.15;
        }
        break;
      case 'crate':
        if (model) model.rotation.y = Math.sin(e.id) * 0.3;
        break;
      default:
        break;
    }
  }

  private drawBullets(sim: RushSim): void {
    let n = 0;
    for (const b of sim.bullets) {
      if (!b.alive) continue;
      this.position.set(b.x, b.y, -(b.z - sim.z));
      this.euler.set(0, Math.atan2(-b.vx, 110 + sim.speed), 0);
      this.quaternion.setFromEuler(this.euler);
      this.scale.setScalar(1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.bullets.setMatrixAt(n++, this.matrix);
    }
    this.bullets.count = n;
    this.bullets.instanceMatrix.needsUpdate = true;
  }

  private drawLock(sim: RushSim, aimX: number): void {
    const target = sim.phase === 'running' ? aimAt(sim, aimX, sim.y + 1.1, sim.z + 1.9).target : null;
    this.lockRing.visible = target !== null;
    if (!target) return;
    const height = KIND_SHAPE[target.kind].height;
    this.lockRing.position.set(target.x, target.y + height * 0.5, -(target.z - sim.z) + 1.5);
    this.lockRing.rotation.z = this.time * 3;
    const pulse = 1 + Math.sin(this.time * 12) * 0.08;
    this.lockRing.scale.setScalar(pulse * (target.kind === 'drone' ? 1.2 : 1));
  }

  private placeCamera(sim: RushSim, dt: number): void {
    const follow = 1 - Math.exp(-7 * dt);
    this.cameraPosition.x += (sim.x * 0.55 - this.cameraPosition.x) * follow;
    // High and tipped down, runner-style: the road ahead is the play area, so the camera shows
    // plenty of it and threats read while there is still time to react.
    this.cameraPosition.y += (5.4 + sim.y * 0.55 - this.cameraPosition.y) * follow;
    this.cameraPosition.z = 9.5;
    this.cameraTarget.x += (sim.x * 0.75 - this.cameraTarget.x) * follow;
    this.cameraTarget.y += (0.4 + sim.y * 0.35 - this.cameraTarget.y) * follow;
    this.cameraTarget.z = -20;

    // The title screen is a showroom: the camera sweeps around the car in close three-quarter
    // views (never in front of it, where the road behind is unbuilt), then glides into the chase
    // position when the run starts.
    const inShowroom = sim.phase === 'ready' ? 1 : 0;
    this.showroom += (inShowroom - this.showroom) * (1 - Math.exp(-2.2 * dt));
    const a = Math.sin(this.time * 0.32) * 1.05;
    this.orbitPosition.set(sim.x + Math.sin(a) * 7.2, 2.6, Math.cos(a) * 7.2);
    this.orbitTarget.set(sim.x, 1.9, 0);
    this.cameraPosition.lerp(this.orbitPosition, this.showroom);
    this.cameraTarget.lerp(this.orbitTarget, this.showroom);

    // Field of view opens with speed — the cheapest, strongest speed cue there is.
    const speedT = THREE.MathUtils.clamp((sim.speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1);
    const targetFov = 58 + speedT * 10 + (sim.nitroActive ? 9 : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-4 * dt));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.cameraPosition);
    this.lookTarget.copy(this.cameraTarget);

    // Trauma-based shake: squared, so small hits barely register and big ones really rattle.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const shake = this.trauma * this.trauma * (REDUCED_MOTION ? 0.15 : 1);
    if (shake > 0) {
      const t = this.time * 45;
      this.camera.position.x += Math.sin(t * 1.1) * 0.35 * shake;
      this.camera.position.y += Math.sin(t * 1.7 + 1) * 0.28 * shake;
      this.lookTarget.x += Math.sin(t * 0.9 + 2) * 0.5 * shake;
    }
    this.camera.lookAt(this.lookTarget);
    this.camera.rotation.z += Math.sin(this.time * 40) * 0.02 * shake - this.roll * 0.15;
  }

  /** A new run: a new order of worlds, and nothing left over from the last one. */
  public setSeed(seed: number): void {
    this.scenery.setSeed(seed);
    this.particles.pool.clear();
    this.lastDistance = 0;
  }

  /** The world of zone `index` on this run's road. */
  public biomeOf(index: number): BiomeId {
    return this.scenery.biomeOfZone(index);
  }

  /** The world the car is in right now. */
  public get biome(): BiomeId {
    return this.scenery.biomeAt(this.lastDistance);
  }

  /** True while the aim assist has a target, so the HUD can show the crosshair locked. */
  public get hasLock(): boolean {
    return this.lockRing.visible;
  }

  /**
   * Screen position (CSS px) of a world point `ahead` metres in front of the car, bent like the
   * road. False when the point is behind the camera.
   */
  public projectPoint(x: number, y: number, ahead: number, out: { x: number; y: number }): boolean {
    const d = Math.max(ahead, 0);
    this.position.set(x + d * d * bend.side.value, y - d * d * bend.down.value, -ahead);
    this.position.project(this.camera);
    if (this.position.z > 1) return false;
    out.x = (this.position.x * 0.5 + 0.5) * this.width;
    out.y = (-this.position.y * 0.5 + 0.5) * this.height;
    return true;
  }

  /**
   * The aim value that puts the crosshair under a screen x (CSS px). At a fixed depth projection
   * is linear in world x, so two projected points pin it down exactly.
   */
  public aimForScreenX(screenX: number): number {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    this.projectAim(-1, a);
    this.projectAim(1, b);
    if (Math.abs(b.x - a.x) < 1) return 0;
    const t = (screenX - a.x) / (b.x - a.x);
    return Math.max(-1.6, Math.min(1.6, -1 + 2 * t));
  }

  /** Marks a lane on the road ahead for a lesson ("look at the LEFT lane"), or clears it. */
  public setLaneHighlight(lane: number | null): void {
    this.laneBeacon.visible = lane !== null;
    if (lane !== null) this.laneBeaconLane = lane;
  }

  /** Screen position (CSS px) of the crosshair for a given aim, following the road's bend. */
  public projectAim(aimX: number, out: { x: number; y: number }): void {
    const d = AIM_DISTANCE;
    this.position.set(aimX * AIM_SPREAD + d * d * bend.side.value, 1.4 - d * d * bend.down.value, -d);
    this.position.project(this.camera);
    out.x = (this.position.x * 0.5 + 0.5) * this.width;
    out.y = (-this.position.y * 0.5 + 0.5) * this.height;
  }
}

function blobShadow(rx: number, rz: number): THREE.Mesh {
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(rx, 1, rz),
    bent(new THREE.MeshBasicMaterial({ color: 0x1d1b33, transparent: true, opacity: 0.28, depthWrite: false }))
  );
  blob.renderOrder = 1;
  return blob;
}
