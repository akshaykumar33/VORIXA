import * as THREE from 'three';
import { toon, flat, ink, bent } from './Toon';
import { roadMask, kerbMask, grassMask } from './Textures';
import { inflate, type PartPose, type PropSpec } from './PropKit';
import { buildBiomes, type BiomeLook, type Palette } from './Biomes';
import { LANE_WIDTH } from '../../rush/RushSim';
import { ZoneSchedule, ZONE_LENGTH, type BiomeId } from '../../rush/Zones';

/**
 * The world the road runs through: six themed worlds joined end to end.
 *
 * Everything is placed in **car-relative** coordinates: the car stays at z = 0 and the world
 * scrolls past it, which keeps 32-bit float positions precise however far a run goes.
 *
 * ## How a world changes
 *
 * - **Ground** (road, kerbs, grass) is one set of long planes whose colours come from a shader.
 *   It knows three worlds at once — the one behind, the one here, the one ahead — and the
 *   boundary between them is a line on the ground that sweeps toward the car.
 * - **Props** are chosen per roadside slot from the world *at that slot*, so the new world's trees
 *   and buildings appear on the horizon first and arrive naturally.
 * - **Sky, fog, light and clouds** blend over the last stretch before a boundary, so you see the
 *   new world's sky before you reach it.
 */

const ROAD_BEHIND = 30;
const ROAD_AHEAD = 240;
const ROAD_LENGTH = ROAD_BEHIND + ROAD_AHEAD;
/** The curved-world bend is per-vertex, so long planes need vertices all along them. */
const ROAD_SEGMENTS = 110;
const ROAD_TILE = 16;
const ROAD_WIDTH = LANE_WIDTH * 3 + 0.4;
const SLOT_SPACING = 7;
/** Sky and light start turning this far before a boundary. */
const SKY_BLEND_DISTANCE = 240;

/** Integer hash to [0, 1). Deterministic and allocation-free, for per-slot scatter. */
function rand(k: number, salt: number): number {
  let h = (k * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ─── Ground ───────────────────────────────────────────────────────────────────────────────────

interface GroundUniforms {
  prev0: { value: THREE.Color };
  prev1: { value: THREE.Color };
  here0: { value: THREE.Color };
  here1: { value: THREE.Color };
  next0: { value: THREE.Color };
  next1: { value: THREE.Color };
  /** Render-space z of the boundary behind the car (positive) and ahead of it (negative). */
  behind: { value: number };
  ahead: { value: number };
}

function groundUniforms(): GroundUniforms {
  const c = () => ({ value: new THREE.Color() });
  return { prev0: c(), prev1: c(), here0: c(), here1: c(), next0: c(), next1: c(), behind: { value: 1e4 }, ahead: { value: -1e4 } };
}

function groundMaterial(mask: THREE.Texture, u: GroundUniforms): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ map: mask });
  material.defines = { GROUND_BLEND: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uPrev0: u.prev0, uPrev1: u.prev1, uHere0: u.here0, uHere1: u.here1,
      uNext0: u.next0, uNext1: u.next1, uBehind: u.behind, uAhead: u.ahead
    });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGroundZ;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vGroundZ;
         uniform vec3 uPrev0, uPrev1, uHere0, uHere1, uNext0, uNext1;
         uniform float uBehind, uAhead;`
      )
      .replace(
        '#include <map_fragment>',
        `vec4 groundMask = texture2D( map, vMapUv );
         // A short soft edge rather than a hard line: reads as a painted border, not a seam.
         float toNext = smoothstep( uAhead + 4.0, uAhead - 4.0, vGroundZ );
         float toPrev = smoothstep( uBehind - 4.0, uBehind + 4.0, vGroundZ );
         vec3 base = mix( mix( uHere0, uNext0, toNext ), uPrev0, toPrev );
         vec3 alt = mix( mix( uHere1, uNext1, toNext ), uPrev1, toPrev );
         diffuseColor.rgb *= mix( base, alt, groundMask.r ) * ( 1.0 - groundMask.g * 0.3 );`
      );
  };
  material.customProgramCacheKey = () => 'rush-ground';
  return bent(material);
}

// ─── Props ────────────────────────────────────────────────────────────────────────────────────

/** One prop type: several parts, each an instanced mesh plus an instanced ink hull. */
class PropKind {
  private readonly meshes: { mesh: THREE.InstancedMesh; part: number }[] = [];
  private count = 0;
  private readonly local = new THREE.Matrix4();
  private readonly world = new THREE.Matrix4();
  private readonly pose: PartPose = { dy: 0, rx: 0, ry: 0, rz: 0 };
  private readonly euler = new THREE.Euler();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  public constructor(parent: THREE.Object3D, public readonly spec: PropSpec, private readonly capacity: number) {
    spec.parts.forEach((p, index) => {
      const mesh = new THREE.InstancedMesh(p.geometry, p.glow ? flat(p.color) : toon(p.color), capacity);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.meshes.push({ mesh, part: index });
      parent.add(mesh);
      if (p.outline > 0) {
        const hull = new THREE.InstancedMesh(inflate(p.geometry, p.outline), ink(), capacity);
        hull.frustumCulled = false;
        hull.visible = false;
        this.meshes.push({ mesh: hull, part: index });
        parent.add(hull);
      }
    });
  }

  public begin(): void {
    this.count = 0;
  }

  public add(placement: THREE.Matrix4, time: number, phase: number): void {
    if (this.count >= this.capacity) return;
    const parts = this.spec.parts;
    let lastPart = -1;
    for (const { mesh, part } of this.meshes) {
      const p = parts[part];
      if (part !== lastPart) {
        lastPart = part;
        if (!p.anim && !p.pivot) {
          this.world.copy(placement);
        } else {
          const pose = this.pose;
          pose.dy = pose.rx = pose.ry = pose.rz = 0;
          p.anim?.(time, phase, pose);
          const pivot = p.pivot ?? [0, 0, 0];
          this.p.set(pivot[0], pivot[1] + pose.dy, pivot[2]);
          this.euler.set(pose.rx, pose.ry, pose.rz);
          this.q.setFromEuler(this.euler);
          this.local.compose(this.p, this.q, this.one);
          this.world.multiplyMatrices(placement, this.local);
        }
      }
      mesh.setMatrixAt(this.count, this.world);
    }
    this.count++;
  }

  public end(): void {
    for (const { mesh } of this.meshes) {
      mesh.count = this.count;
      // Empty kinds are skipped entirely: six worlds of props must not cost six worlds of draws.
      mesh.visible = this.count > 0;
      if (this.count > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

interface WorldProps {
  near: PropKind[];
  nearWeights: number[];
  far: PropKind[];
  farWeights: number[];
}

function cumulative(kinds: PropKind[]): number[] {
  let total = 0;
  const out = kinds.map((k) => (total += k.spec.weight));
  return out.map((w) => w / total);
}

function pick(kinds: PropKind[], weights: number[], roll: number): PropKind {
  for (let i = 0; i < weights.length; i++) if (roll <= weights[i]) return kinds[i];
  return kinds[kinds.length - 1];
}

// ─── Palette blending ─────────────────────────────────────────────────────────────────────────

/** A palette blended between two worlds, with colours ready for three.js. */
export class BlendedPalette {
  public readonly skyTop = new THREE.Color();
  public readonly skyHorizon = new THREE.Color();
  public readonly fog = new THREE.Color();
  public readonly sun = new THREE.Color();
  public readonly hills = new THREE.Color();
  public readonly cloud = new THREE.Color();
  public readonly cloudRim = new THREE.Color();
  public readonly hemiSky = new THREE.Color();
  public readonly hemiGround = new THREE.Color();
  public stars = 0;
  public hemiIntensity = 1;
  public sunIntensity = 1;
  private readonly a = new THREE.Color();
  private readonly b = new THREE.Color();

  public blend(from: Palette, to: Palette, t: number): void {
    const mix = (out: THREE.Color, x: number, y: number) => out.copy(this.a.setHex(x)).lerp(this.b.setHex(y), t);
    mix(this.skyTop, from.skyTop, to.skyTop);
    mix(this.skyHorizon, from.skyHorizon, to.skyHorizon);
    mix(this.fog, from.fog, to.fog);
    mix(this.sun, from.sun, to.sun);
    mix(this.hills, from.hills, to.hills);
    mix(this.cloud, from.cloud, to.cloud);
    mix(this.cloudRim, from.cloudRim, to.cloudRim);
    mix(this.hemiSky, from.hemiSky, to.hemiSky);
    mix(this.hemiGround, from.hemiGround, to.hemiGround);
    this.stars = from.stars + (to.stars - from.stars) * t;
    this.hemiIntensity = from.hemiIntensity + (to.hemiIntensity - from.hemiIntensity) * t;
    this.sunIntensity = from.sunIntensity + (to.sunIntensity - from.sunIntensity) * t;
  }
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 2.2, 0.0, 1.0);
    vec3 color = mix(uHorizon, uTop, pow(h, 0.7));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// ─── Scenery ──────────────────────────────────────────────────────────────────────────────────

export class Scenery {
  public readonly group = new THREE.Group();
  public readonly palette = new BlendedPalette();
  private schedule = new ZoneSchedule(1);
  private readonly looks: Record<BiomeId, BiomeLook>;
  private readonly props = new Map<BiomeId, WorldProps>();
  private readonly allKinds: PropKind[] = [];

  private readonly roadMap = roadMask();
  private readonly kerbMap = kerbMask();
  private readonly grassMap = grassMask();
  private readonly road = groundUniforms();
  private readonly kerb = groundUniforms();
  private readonly grass = groundUniforms();

  private readonly sky: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly sunDisc: THREE.Mesh;
  private readonly sunHalo: THREE.Mesh;
  private readonly hillMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly cloudMaterial = new THREE.MeshToonMaterial({ color: 0xffffff, fog: false });
  private readonly cloudInk = new THREE.MeshBasicMaterial({ color: 0xc9d6f2, side: THREE.BackSide, fog: false });
  private readonly clouds = new THREE.Group();

  private readonly placement = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  public constructor() {
    this.looks = buildBiomes();

    this.roadMap.repeat.set(1, ROAD_LENGTH / ROAD_TILE);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH, 1, ROAD_SEGMENTS).rotateX(-Math.PI / 2),
      groundMaterial(this.roadMap, this.road)
    );
    road.position.set(0, 0, (ROAD_BEHIND - ROAD_AHEAD) / 2);
    this.group.add(road);

    this.kerbMap.repeat.set(1, ROAD_LENGTH / 2);
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.22, ROAD_LENGTH, 1, 1, ROAD_SEGMENTS),
        groundMaterial(this.kerbMap, this.kerb)
      );
      kerb.position.set(side * (ROAD_WIDTH / 2 + 0.4), 0.06, road.position.z);
      this.group.add(kerb);
    }

    this.grassMap.repeat.set(30, ROAD_LENGTH / 8);
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(420, ROAD_LENGTH, 1, ROAD_SEGMENTS).rotateX(-Math.PI / 2),
      groundMaterial(this.grassMap, this.grass)
    );
    grass.position.set(0, -0.04, road.position.z);
    this.group.add(grass);

    const slots = Math.ceil(ROAD_LENGTH / SLOT_SPACING) * 2 + 4;
    for (const [id, look] of Object.entries(this.looks) as [BiomeId, BiomeLook][]) {
      const near = look.near.map((spec) => new PropKind(this.group, spec, slots));
      const far = look.far.map((spec) => new PropKind(this.group, spec, slots));
      this.allKinds.push(...near, ...far);
      this.props.set(id, { near, nearWeights: cumulative(near), far, farWeights: cumulative(far) });
    }

    this.sky = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.sky);
    dome.renderOrder = -10;
    this.group.add(dome);

    const starPositions = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const theta = rand(i, 1) * Math.PI * 2;
      const y = 0.08 + rand(i, 2) * 0.92;
      const r = Math.sqrt(1 - y * y);
      starPositions.set([Math.cos(theta) * r * 560, y * 560, Math.sin(theta) * r * 560], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false })
    );
    this.group.add(this.stars);

    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 40), new THREE.MeshBasicMaterial({ fog: false }));
    this.sunDisc.position.set(-70, 60, -420);
    this.sunHalo = new THREE.Mesh(
      new THREE.RingGeometry(28, 36, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false, transparent: true, opacity: 0.45 })
    );
    this.sunDisc.add(this.sunHalo);
    this.group.add(this.sunDisc);

    for (let i = 0; i < 9; i++) {
      const radius = 60 + rand(i, 7) * 70;
      const material = new THREE.MeshBasicMaterial({ fog: false });
      this.hillMaterials.push(material);
      const hill = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material);
      hill.scale.y = 0.35 + rand(i, 8) * 0.25;
      hill.position.set(-360 + i * 90, -8, -400 - rand(i, 9) * 60);
      this.group.add(hill);
    }

    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(rand(i, 1) * 3);
      for (let p = 0; p < puffs; p++) {
        const r = 4 + rand(i * 10 + p, 2) * 4;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), this.cloudMaterial);
        puff.position.set((p - puffs / 2) * 5.5, rand(i * 10 + p, 3) * 3, rand(i * 10 + p, 4) * 3);
        const rim = new THREE.Mesh(puff.geometry, this.cloudInk);
        rim.scale.setScalar(1.05);
        puff.add(rim);
        cloud.add(puff);
      }
      cloud.position.set(-260 + rand(i, 5) * 520, 45 + rand(i, 6) * 45, -250 - rand(i, 11) * 150);
      this.clouds.add(cloud);
    }
    this.group.add(this.clouds);
  }

  /** A new run: a new order of worlds. */
  public setSeed(seed: number): void {
    this.schedule = new ZoneSchedule(seed);
  }

  public biomeAt(distance: number): BiomeId {
    return this.schedule.biomeAt(distance);
  }

  /** @param distance The car's distance along the road. */
  public update(distance: number, time: number): void {
    const zone = this.schedule.zoneIndex(distance);
    const here = this.looks[this.schedule.biomeOf(zone)].palette;
    const next = this.looks[this.schedule.biomeOf(zone + 1)].palette;
    const prev = this.looks[this.schedule.biomeOf(zone - 1)].palette;
    const toNext = this.schedule.toNextZone(distance);
    const sinceStart = ZONE_LENGTH - toNext;

    // Ground: three worlds, two boundaries, all in render space.
    for (const [u, key] of [[this.road, 'road'], [this.kerb, 'kerb'], [this.grass, 'ground']] as const) {
      u.prev0.value.setHex(prev[key][0]);
      u.prev1.value.setHex(prev[key][1]);
      u.here0.value.setHex(here[key][0]);
      u.here1.value.setHex(here[key][1]);
      u.next0.value.setHex(next[key][0]);
      u.next1.value.setHex(next[key][1]);
      u.ahead.value = -toNext;
      u.behind.value = zone === 0 ? 1e4 : sinceStart;
    }
    this.roadMap.offset.y = distance / ROAD_TILE;
    this.kerbMap.offset.y = distance / 2;
    this.grassMap.offset.y = distance / 8;

    // Sky and light turn over the approach to the boundary, eased so it starts gently.
    const raw = THREE.MathUtils.clamp(1 - toNext / SKY_BLEND_DISTANCE, 0, 1);
    const t = raw * raw * (3 - 2 * raw);
    const pal = this.palette;
    pal.blend(here, next, t);
    (this.sky.uniforms.uTop.value as THREE.Color).copy(pal.skyTop);
    (this.sky.uniforms.uHorizon.value as THREE.Color).copy(pal.skyHorizon);
    (this.stars.material as THREE.PointsMaterial).opacity = pal.stars;
    this.stars.visible = pal.stars > 0.01;
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.copy(pal.sun);
    (this.sunHalo.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - pal.stars);
    this.hillMaterials.forEach((m, i) => m.color.copy(pal.hills).multiplyScalar(0.92 + (i % 3) * 0.06));
    this.cloudMaterial.color.copy(pal.cloud);
    this.cloudInk.color.copy(pal.cloudRim);
    this.clouds.position.x = Math.sin(time * 0.02) * 20 - ((distance * 0.01) % 40);

    this.placeProps(distance, time);
  }

  private placeProps(distance: number, time: number): void {
    for (const kind of this.allKinds) kind.begin();

    const first = Math.floor((distance - ROAD_BEHIND) / SLOT_SPACING);
    const last = Math.ceil((distance + ROAD_AHEAD) / SLOT_SPACING);
    for (let k = first; k <= last; k++) {
      const slotZ = k * SLOT_SPACING;
      const world = this.props.get(this.schedule.biomeAt(slotZ));
      if (!world) continue;
      const z = -(slotZ - distance);
      for (const side of [-1, 1]) {
        const salt = side > 0 ? 1 : 2;
        if (rand(k, salt) < 0.78) {
          const kind = pick(world.near, world.nearWeights, rand(k, salt + 10));
          const x = side * (ROAD_WIDTH / 2 + 3 + rand(k, salt + 20) * 9);
          this.place(kind, side, x, z + rand(k, salt + 30) * 4, k, salt, time);
        }
        if (rand(k, salt + 60) < 0.5) {
          const kind = pick(world.far, world.farWeights, rand(k, salt + 70));
          const x = side * (ROAD_WIDTH / 2 + 18 + rand(k, salt + 80) * 30);
          this.place(kind, side, x, z, k, salt + 100, time);
        }
      }
    }

    for (const kind of this.allKinds) kind.end();
  }

  private place(kind: PropKind, side: number, x: number, z: number, k: number, salt: number, time: number): void {
    const spec = kind.spec;
    // Road-facing props turn toward the road and a little toward the oncoming car.
    const yaw = spec.facing === 'road'
      ? (side < 0 ? Math.PI / 2 - 0.45 : -Math.PI / 2 + 0.45) + (rand(k, salt + 90) - 0.5) * 0.3
      : rand(k, salt + 90) * Math.PI * 2;
    const [lo, hi] = spec.scale ?? [0.95, 1.1];
    const s = lo + rand(k, salt + 95) * (hi - lo);
    this.position.set(x, 0, z);
    this.euler.set(0, yaw, 0);
    this.quaternion.setFromEuler(this.euler);
    this.scale.setScalar(s);
    this.placement.compose(this.position, this.quaternion, this.scale);
    kind.add(this.placement, time, rand(k, salt + 77) * 10);
  }
}
