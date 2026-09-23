import * as THREE from 'three';
import { toon, ink } from './Toon';
import { roadTexture, kerbTexture, grassTexture } from './Textures';
import { LANE_WIDTH } from '../../rush/RushSim';

/**
 * The world the road runs through.
 *
 * Everything is placed in **car-relative** coordinates: the car stays at z = 0 and the world
 * scrolls past it. A run can cover 50 km; at that distance 32-bit float positions start to
 * visibly jitter, and car-relative placement sidesteps that entirely.
 *
 * Road, kerbs and grass are long planes whose textures scroll. Roadside props are instanced and
 * placed from a hash of their slot index, so the same stretch of road always has the same trees
 * — no state, no allocation, and a run re-watched from the same seed looks the same.
 */

const ROAD_BEHIND = 30;
const ROAD_AHEAD = 240;
const ROAD_LENGTH = ROAD_BEHIND + ROAD_AHEAD;
/** Vertex spacing along the road. The curved-world bend is per-vertex, so long flat quads would
 * stay straight and cut through the curve. */
const ROAD_SEGMENTS = 110;
const ROAD_TILE = 16;
const ROAD_WIDTH = LANE_WIDTH * 3 + 0.4;

const SLOT_SPACING = 7;

/** Integer hash to [0, 1). Deterministic and allocation-free, for per-slot scatter. */
function rand(k: number, salt: number): number {
  let h = (k * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface PropPart {
  geometry: THREE.BufferGeometry;
  color: number;
  outline: number;
}

/** One prop type: several parts, each an instanced mesh plus an instanced ink hull. */
class PropKind {
  private readonly meshes: THREE.InstancedMesh[] = [];
  private count = 0;

  public constructor(parent: THREE.Object3D, parts: PropPart[], private readonly capacity: number) {
    for (const p of parts) {
      const mesh = new THREE.InstancedMesh(p.geometry, toon(p.color), capacity);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      parent.add(mesh);
      if (p.outline > 0) {
        p.geometry.computeBoundingSphere();
        const r = p.geometry.boundingSphere!.radius;
        const hullGeometry = p.geometry.clone();
        const s = (r + p.outline) / r;
        const c = p.geometry.boundingSphere!.center;
        hullGeometry.translate(-c.x, -c.y, -c.z).scale(s, s, s).translate(c.x, c.y, c.z);
        const hull = new THREE.InstancedMesh(hullGeometry, ink(), capacity);
        hull.frustumCulled = false;
        this.meshes.push(hull);
        parent.add(hull);
      }
    }
  }

  public begin(): void {
    this.count = 0;
  }

  public add(matrix: THREE.Matrix4): void {
    if (this.count >= this.capacity) return;
    for (const mesh of this.meshes) mesh.setMatrixAt(this.count, matrix);
    this.count++;
  }

  public end(): void {
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

function roundTree(): PropPart[] {
  return [
    { geometry: new THREE.CylinderGeometry(0.22, 0.32, 2.2, 7).translate(0, 1.1, 0), color: 0x9a6a44, outline: 0.06 },
    { geometry: new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.3, 0), color: 0x4cc36a, outline: 0.1 }
  ];
}

function pineTree(): PropPart[] {
  return [
    { geometry: new THREE.CylinderGeometry(0.2, 0.26, 1.2, 6).translate(0, 0.6, 0), color: 0x8a5a3a, outline: 0.05 },
    { geometry: new THREE.ConeGeometry(1.6, 2.6, 8).translate(0, 2.2, 0), color: 0x2fa36b, outline: 0.08 },
    { geometry: new THREE.ConeGeometry(1.15, 2.1, 8).translate(0, 3.6, 0), color: 0x38b877, outline: 0.07 }
  ];
}

function bush(): PropPart[] {
  const geometry = new THREE.IcosahedronGeometry(0.9, 1).scale(1.3, 0.8, 1).translate(0, 0.5, 0);
  return [{ geometry, color: 0x66cf52, outline: 0.07 }];
}

function rock(): PropPart[] {
  return [{ geometry: new THREE.DodecahedronGeometry(0.9, 0).scale(1.3, 0.75, 1).translate(0, 0.4, 0), color: 0xb8b3c9, outline: 0.06 }];
}

function house(color: number, roof: number): PropPart[] {
  return [
    { geometry: new THREE.BoxGeometry(5, 3.6, 4.4).translate(0, 1.8, 0), color, outline: 0.12 },
    { geometry: new THREE.ConeGeometry(4.0, 2.4, 4).rotateY(Math.PI / 4).scale(1, 1, 0.9).translate(0, 4.8, 0), color: roof, outline: 0.1 },
    { geometry: new THREE.BoxGeometry(1.1, 1.1, 0.1).translate(-1.2, 2.1, -2.22), color: 0x9fe3ff, outline: 0.05 },
    { geometry: new THREE.BoxGeometry(1.0, 1.9, 0.1).translate(1.2, 0.95, -2.22), color: 0x7a4a30, outline: 0.05 }
  ];
}

function flowerPatch(): PropPart[] {
  return [
    { geometry: new THREE.IcosahedronGeometry(0.28, 0).translate(0, 0.3, 0), color: 0xff7eb6, outline: 0.04 },
    { geometry: new THREE.IcosahedronGeometry(0.24, 0).translate(0.6, 0.26, 0.4), color: 0xffd23f, outline: 0.04 },
    { geometry: new THREE.IcosahedronGeometry(0.26, 0).translate(-0.5, 0.28, 0.5), color: 0xffffff, outline: 0.04 }
  ];
}

export class Scenery {
  public readonly group = new THREE.Group();
  private readonly roadMap: THREE.Texture;
  private readonly kerbMap: THREE.Texture;
  private readonly grassMap: THREE.Texture;
  private readonly near: PropKind[];
  private readonly far: PropKind[];
  private readonly windmillBlades: THREE.InstancedMesh;
  private windmillCount = 0;
  private readonly clouds = new THREE.Group();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  public constructor() {
    this.roadMap = roadTexture();
    this.roadMap.repeat.set(1, ROAD_LENGTH / ROAD_TILE);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH, 1, ROAD_SEGMENTS).rotateX(-Math.PI / 2),
      toon(0xffffff, { map: this.roadMap })
    );
    road.position.set(0, 0, (ROAD_BEHIND - ROAD_AHEAD) / 2);
    road.receiveShadow = true;
    this.group.add(road);

    this.kerbMap = kerbTexture();
    this.kerbMap.repeat.set(1, ROAD_LENGTH / 2);
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.22, ROAD_LENGTH, 1, 1, ROAD_SEGMENTS),
        toon(0xffffff, { map: this.kerbMap })
      );
      kerb.position.set(side * (ROAD_WIDTH / 2 + 0.4), 0.06, road.position.z);
      kerb.receiveShadow = true;
      this.group.add(kerb);
    }

    this.grassMap = grassTexture();
    this.grassMap.repeat.set(30, ROAD_LENGTH / 8);
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(420, ROAD_LENGTH, 1, ROAD_SEGMENTS).rotateX(-Math.PI / 2),
      toon(0xffffff, { map: this.grassMap })
    );
    grass.position.set(0, -0.04, road.position.z);
    grass.receiveShadow = true;
    this.group.add(grass);

    const slots = Math.ceil(ROAD_LENGTH / SLOT_SPACING) * 2;
    this.near = [roundTree(), pineTree(), bush(), rock(), flowerPatch()].map(
      (parts) => new PropKind(this.group, parts, slots)
    );
    this.far = [
      house(0xfff0d6, 0xff6b5a),
      house(0xd6f0ff, 0x3d8bff),
      house(0xffe0f0, 0x9b6bff),
      roundTree(),
      pineTree()
    ].map((parts) => new PropKind(this.group, parts, slots));

    // Windmills get their own blades so the blades can turn.
    const tower = new PropKind(this.group, [
      { geometry: new THREE.CylinderGeometry(0.6, 1.3, 9, 8).translate(0, 4.5, 0), color: 0xfff7e0, outline: 0.12 },
      { geometry: new THREE.ConeGeometry(1.1, 1.4, 8).translate(0, 9.6, 0), color: 0xff6b5a, outline: 0.08 }
    ], slots);
    this.far.push(tower);
    const bladeGeometry = new THREE.BufferGeometry();
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      blades.push(new THREE.BoxGeometry(0.7, 4.2, 0.12).translate(0, 2.2, 0).rotateZ((i * Math.PI) / 2));
    }
    bladeGeometry.copy(mergeBoxes(blades));
    this.windmillBlades = new THREE.InstancedMesh(bladeGeometry, toon(0xf4f1ea), slots);
    this.windmillBlades.frustumCulled = false;
    this.group.add(this.windmillBlades);

    this.buildSky();
  }

  /**
   * Sun, hills and clouds. None of these are bent or fogged: they are the backdrop, and a
   * backdrop that dips with the road reads as the world tilting.
   */
  private buildSky(): void {
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(26, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false })
    );
    sun.position.set(-70, 60, -420);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(28, 36, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false, transparent: true, opacity: 0.45 })
    );
    sun.add(halo);
    this.group.add(sun);

    const hillMaterial = [0x9fd8a0, 0x8ccf9a, 0xb3e0a8].map(
      (color) => new THREE.MeshBasicMaterial({ color, fog: false })
    );
    for (let i = 0; i < 9; i++) {
      const radius = 60 + rand(i, 7) * 70;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hillMaterial[i % 3]);
      hill.scale.y = 0.35 + rand(i, 8) * 0.25;
      hill.position.set(-360 + i * 90, -8, -400 - rand(i, 9) * 60);
      this.group.add(hill);
    }

    const cloudMaterial = new THREE.MeshToonMaterial({ color: 0xffffff, fog: false });
    const cloudInk = new THREE.MeshBasicMaterial({ color: 0xc9d6f2, side: THREE.BackSide, fog: false });
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(rand(i, 1) * 3);
      for (let p = 0; p < puffs; p++) {
        const r = 4 + rand(i * 10 + p, 2) * 4;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), cloudMaterial);
        puff.position.set((p - puffs / 2) * 5.5, rand(i * 10 + p, 3) * 3, rand(i * 10 + p, 4) * 3);
        const rim = new THREE.Mesh(puff.geometry, cloudInk);
        rim.scale.setScalar(1.05);
        puff.add(rim);
        cloud.add(puff);
      }
      cloud.position.set(-260 + rand(i, 5) * 520, 45 + rand(i, 6) * 45, -250 - rand(i, 11) * 150);
      this.clouds.add(cloud);
    }
    this.group.add(this.clouds);
  }

  /** @param distance The car's distance along the road. */
  public update(distance: number, time: number): void {
    // Scroll the ground textures under the car.
    this.roadMap.offset.y = distance / ROAD_TILE;
    this.kerbMap.offset.y = distance / 2;
    this.grassMap.offset.y = distance / 8;

    for (const kind of this.near) kind.begin();
    for (const kind of this.far) kind.begin();
    this.windmillCount = 0;

    const first = Math.floor((distance - ROAD_BEHIND) / SLOT_SPACING);
    const last = Math.ceil((distance + ROAD_AHEAD) / SLOT_SPACING);
    for (let k = first; k <= last; k++) {
      const z = -(k * SLOT_SPACING - distance);
      for (const side of [-1, 1]) {
        const salt = side > 0 ? 1 : 2;
        // Near row: small props just off the kerb.
        if (rand(k, salt) < 0.7) {
          const kind = Math.floor(rand(k, salt + 10) * this.near.length);
          const x = side * (ROAD_WIDTH / 2 + 4 + rand(k, salt + 20) * 9);
          this.place(this.near[kind], x, z + rand(k, salt + 30) * 4, 0.8 + rand(k, salt + 40) * 0.6, rand(k, salt + 50) * 6.28);
        }
        // Far row: houses, big trees, windmills.
        if (rand(k, salt + 60) < 0.45) {
          const kind = Math.floor(rand(k, salt + 70) * this.far.length);
          const x = side * (ROAD_WIDTH / 2 + 16 + rand(k, salt + 80) * 30);
          // Houses face the road; everything else is free.
          const facing = kind < 3 ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : rand(k, salt + 90) * 6.28;
          this.place(this.far[kind], x, z, 1 + rand(k, salt + 95) * 0.4, facing);
          if (kind === this.far.length - 1) this.placeBlades(x, z, time + k);
        }
      }
    }

    for (const kind of this.near) kind.end();
    for (const kind of this.far) kind.end();
    this.windmillBlades.count = this.windmillCount;
    this.windmillBlades.instanceMatrix.needsUpdate = true;

    // Clouds drift slowly; a hint of parallax with distance makes the sky feel deep.
    this.clouds.position.x = Math.sin(time * 0.02) * 20 - (distance * 0.01) % 40;
  }

  private place(kind: PropKind, x: number, z: number, s: number, yaw: number): void {
    this.position.set(x, 0, z);
    this.euler.set(0, yaw, 0);
    this.quaternion.setFromEuler(this.euler);
    this.scale.setScalar(s);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    kind.add(this.matrix);
  }

  private placeBlades(x: number, z: number, t: number): void {
    // Hub near the top of the tower (height 9 × a scale close to 1), facing the road.
    this.position.set(x - Math.sign(x) * 1.4, 8.6, z);
    // Spin in the blades' own plane (z) first, then turn that plane to face the road (y).
    this.euler.set(0, Math.PI / 2, t * 1.3, 'YXZ');
    this.quaternion.setFromEuler(this.euler);
    this.scale.setScalar(1);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.windmillBlades.setMatrixAt(this.windmillCount++, this.matrix);
  }
}

/** Merges non-indexed copies of simple geometries into one. Enough for the windmill blades. */
function mergeBoxes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    positions.push(...(g.getAttribute('position').array as Float32Array));
    normals.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

