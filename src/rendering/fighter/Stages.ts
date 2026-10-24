import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Akhada's arenas (ADR-0017): places in India's states, each tied to the epics, each with three
 * rounds of weather and its own raga. A stage is data (weather presets, the raga, the story line)
 * and a builder that puts the place together from the arena's kit of parts.
 */

export type StageId = 'varanasi' | 'kurukshetra' | 'rameswaram' | 'jaisalmer';
/** The look of each round: the first, the second (the dramatic one), the third (night). */
export type Weather = 'dusk' | 'storm' | 'night';
export const WEATHER_BY_ROUND: Weather[] = ['dusk', 'storm', 'night'];

export interface Preset {
  sky: string;
  sun: number;
  sunIntensity: number;
  sunDir: THREE.Vector3;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  fog: number;
  fogDensity: number;
  env: number;
  background: number;
  wet: number;
  diya: number;
  rain: boolean;
  /** A sandstorm: dust driven across the arena. */
  dust?: boolean;
}

/** What a stage builder can use: the arena's parts. */
export interface ArenaKit {
  add(...objects: THREE.Object3D[]): void;
  pbr(name: string, repeat: [number, number], tint?: number): THREE.MeshStandardMaterial;
  place(gltf: GLTF, x: number, y: number, z: number, scale: number): void;
  diya(gltf: GLTF, x: number, y: number, z: number): void;
  /** A flame sprite (a torch, a brazier, a lantern) that flickers. */
  flame(x: number, y: number, z: number, size: number): void;
  lamp(x: number, y: number, z: number, colour?: number): void;
  temple(red: THREE.Material, plaster: THREE.Material, kalash: GLTF, x: number, z: number, scale: number, y?: number): void;
  garlands(poles: THREE.Vector3[]): void;
  boat(x: number, z: number, rot: number): void;
  windCloth(m: THREE.MeshStandardMaterial): void;
  water(y: number, colour: number): void;
  /** A point smoke rises from (incense, a burning pyre, a camp). */
  smokeSource(at: THREE.Vector3): void;
  models: { diya: GLTF; pot1: GLTF; pot2: GLTF; clay: GLTF };
}

export interface StageDef {
  id: StageId;
  name: string;
  state: string;
  /** One line of the story the place carries. */
  legend: string;
  raga: string;
  weather: Record<Weather, Preset>;
  /** Where the water is (for rain splashes and mist); null where there is none. */
  waterY: number | null;
  build(kit: ArenaKit): void;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};

// ─── Varanasi, Uttar Pradesh ──────────────────────────────────────────────────────────────────

const STEP_RISE = 0.32;
const STEP_RUN = 0.75;
const STEPS = 8;
const RIVER_Y = -STEP_RISE * STEPS - 0.1;

function umbrellaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const colours = ['#d9b98a', '#c9a676', '#e2c79c'];
  for (let i = 0; i < 16; i++) {
    g.fillStyle = colours[i % colours.length];
    g.beginPath();
    g.moveTo(128, 128);
    g.arc(128, 128, 128, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildVaranasi(k: ArenaKit): void {
  const landing = k.pbr('large_sandstone_blocks', [10, 3]);
  const lower = k.pbr('mossy_sandstone', [8, 1]);
  const red = k.pbr('red_sandstone_wall', [2, 4]);
  const plaster = k.pbr('patterned_clay_plaster', [3, 3], 0xf0d7b0);
  k.add(mesh(new THREE.BoxGeometry(40, 1, 9), landing, 0, -0.5, 1.5));
  for (let i = 0; i < STEPS; i++) {
    k.add(mesh(new THREE.BoxGeometry(40, STEP_RISE, STEP_RUN + 0.02), i > 4 ? lower : landing, 0, -STEP_RISE * (i + 0.5), -3 - STEP_RUN * (i + 0.5)));
  }
  k.water(RIVER_Y, 0x08181c);
  k.add(mesh(new THREE.BoxGeometry(500, 3, 20), new THREE.MeshStandardMaterial({ color: 0x3b3a30, roughness: 1 }), 0, RIVER_Y + 0.6, -175));
  k.temple(red, plaster, k.models.pot1, -7.6, -7.2, 0.72, -1.75);
  k.temple(red, plaster, k.models.pot1, 8.2, -7.6, 0.8, -1.95);
  k.temple(red, plaster, k.models.pot1, -14, -3, 1.3);
  k.temple(red, plaster, k.models.pot1, 15, -3.4, 1.2);
  for (const [x, w, h] of [[-15, 4, 7], [15.5, 3.6, 8.5], [19, 4, 6], [-23, 5, 9]] as const) k.add(mesh(new THREE.BoxGeometry(w, h, 4), plaster, x, h / 2, 1.5));
  const cloth = new THREE.MeshStandardMaterial({ map: umbrellaTexture(), roughness: 0.9, side: THREE.DoubleSide });
  const bamboo = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.8 });
  const poles: THREE.Vector3[] = [];
  for (let x = -8; x <= 8; x += 4) {
    const shade = mesh(new THREE.ConeGeometry(1.7, 0.55, 24, 1, true), cloth, x, 3.05, -2.6);
    shade.rotation.y = x;
    k.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.1, 8), bamboo, x, 1.55, -2.6), shade);
    poles.push(v(x, 2.6, -2.6));
    k.place(x % 8 === 0 ? k.models.pot1 : k.models.pot2, x + 0.7, 0, -2.4, 0.9);
    k.place(k.models.clay, x - 0.8, 0, -2.5, 0.8);
  }
  k.garlands(poles);
  for (let x = -9; x <= 9; x += 1.5) k.diya(k.models.diya, x, 0, -2.95);
  for (const x of [-7, -2.5, 2.5, 7]) k.lamp(x, 0.6, -2.8);
  for (const [x, z, r] of [[-9, -16, 0.2], [6, -22, -0.3], [16, -14, 0.1], [-20, -28, 0.4]] as const) k.boat(x, z, r);
}

// ─── Kurukshetra, Haryana ─────────────────────────────────────────────────────────────────────

/** A chariot wheel: rim, hub and spokes, broken or whole. */
function wheel(m: THREE.Material, radius: number, broken: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(radius, radius * 0.07, 8, 32, broken ? Math.PI * 1.55 : Math.PI * 2), m));
  g.add(mesh(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, radius * 0.3, 12).rotateX(Math.PI / 2), m));
  const spokes = broken ? 9 : 12;
  for (let i = 0; i < spokes; i++) {
    const s = mesh(new THREE.CylinderGeometry(radius * 0.025, radius * 0.03, radius, 6), m);
    s.position.set(0, 0, 0);
    s.rotation.z = (i / 12) * Math.PI * 2;
    s.translateY(radius / 2);
    g.add(s);
  }
  return g;
}

function buildKurukshetra(k: ArenaKit): void {
  const earth = k.pbr('mud_cracked_dry_03', [16, 8], 0xd8b890);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.9, roughness: 0.4 });
  // The plain runs to the horizon.
  const ground = mesh(new THREE.PlaneGeometry(300, 200).rotateX(-Math.PI / 2), earth, 0, 0, -60);
  k.add(ground);
  // Broken chariots and fallen wheels where the armies met.
  const c1 = wheel(wood, 1.1, false);
  c1.position.set(-6.5, 1.1, -3.5);
  c1.rotation.y = 0.3;
  const c2 = wheel(wood, 1.1, true);
  c2.position.set(-5.4, 0.15, -2.6);
  c2.rotation.set(-Math.PI / 2 + 0.15, 0, 0.4);
  const c3 = wheel(bronze, 1.3, false);
  c3.position.set(7.8, 1.3, -4.5);
  c3.rotation.y = -0.4;
  k.add(c1, c2, c3);
  const bed = mesh(new THREE.BoxGeometry(2.2, 0.5, 1.4), wood, -6.2, 1.2, -4.4);
  bed.rotation.z = 0.25;
  k.add(bed);
  // Spears and arrows standing in the earth, and shields where they fell.
  for (let i = 0; i < 40; i++) {
    const x = -13 + ((i * 7.31) % 26);
    const z = -3 - ((i * 3.17) % 9);
    if (Math.abs(x) < 3 && z > -4) continue;
    const len = i % 3 === 0 ? 2.2 : 0.9;
    const shaft = mesh(new THREE.CylinderGeometry(0.015, 0.02, len, 5), wood, x, len / 2 - 0.1, z);
    shaft.rotation.set(Math.sin(i) * 0.4, 0, Math.cos(i * 1.3) * 0.5);
    k.add(shaft);
  }
  for (const [x, z] of [[-3.5, -3.2], [4.2, -3.6], [10, -6], [-10, -5]] as const) {
    const shield = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), bronze, x, 0.05, z);
    shield.rotation.x = 0.1;
    k.add(shield);
  }
  // The armies' camps on the horizon: tents and banners.
  const tent = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.95 });
  for (let i = 0; i < 14; i++) {
    const x = -40 + i * 6 + Math.sin(i) * 2;
    k.add(mesh(new THREE.ConeGeometry(1.8, 2.6, 8), tent, x, 1.3, -32 - (i % 3) * 5));
  }
  const banners = [0xff7a10, 0xd81e2a, 0xffd23d, 0xffffff, 0x1e58c8];
  for (let i = 0; i < 9; i++) {
    const x = -11 + i * 2.7;
    const z = -5.5 - (i % 2) * 2;
    if (Math.abs(x) < 2) continue;
    k.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 4.2, 6), wood, x, 2.1, z));
    const cloth = new THREE.MeshStandardMaterial({ color: banners[i % banners.length], roughness: 0.8, side: THREE.DoubleSide });
    k.windCloth(cloth);
    const flag = mesh(new THREE.PlaneGeometry(1.6, 0.8, 16, 4).translate(0.8, 0, 0), cloth, x + 0.03, 3.8, z);
    k.add(flag);
  }
  // Braziers burning on the field, and the smoke of the war.
  for (const [x, z] of [[-8.5, -2.6], [8.5, -2.6], [-2, -7], [3.5, -8]] as const) {
    k.add(mesh(new THREE.CylinderGeometry(0.4, 0.22, 0.6, 12), bronze, x, 0.3, z));
    k.flame(x, 0.85, z, 0.9);
    k.lamp(x, 1.1, z, 0xff7a30);
    k.smokeSource(v(x, 1, z));
  }
  for (const x of [-25, -12, 14, 30]) k.smokeSource(v(x, 2, -40));
}

// ─── Rameswaram, Tamil Nadu ───────────────────────────────────────────────────────────────────

/** A gopuram: a stepped tower of painted tiers under a barrel-vaulted crown with kalashas. */
function gopuram(stone: THREE.Material, x: number, z: number, scale: number): THREE.Group {
  const g = new THREE.Group();
  const paints = [0xe8d8b0, 0xd89a4a, 0x8ac0c8, 0xd86a5a, 0xf0e4c0, 0x9ac87a, 0xe0b860];
  g.add(mesh(new THREE.BoxGeometry(7, 3, 4.5), stone, 0, 1.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x140c06 }), 0, 1.2, 2.26));
  for (let i = 0; i < 7; i++) {
    const w = 6.4 - i * 0.7;
    const d = 4 - i * 0.38;
    const tier = mesh(new THREE.BoxGeometry(w, 1.1, d), new THREE.MeshStandardMaterial({ color: paints[i], roughness: 0.85 }), 0, 3.55 + i * 1.1, 0);
    g.add(tier);
    // Little shrines along each tier's edge, the gopuram's carved figures in silhouette.
    for (let s = -2; s <= 2; s++) g.add(mesh(new THREE.BoxGeometry(0.35, 0.5, 0.25), new THREE.MeshStandardMaterial({ color: paints[(i + 3) % paints.length] }), s * w * 0.18, 4.15 + i * 1.1, d / 2 + 0.1));
  }
  const vault = mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0b860, roughness: 0.7 }), 0, 11.3, 0);
  g.add(vault);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a32e, metalness: 1, roughness: 0.3 });
  for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.ConeGeometry(0.12, 0.6, 8), gold, i * 0.45, 12.5, 0));
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

function palm(x: number, z: number, lean: number): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(v(0, 0, 0), v(lean * 0.6, 3.5, 0), v(lean, 7, 0));
  g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.95 })));
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const frond = mesh(new THREE.PlaneGeometry(0.5, 3, 1, 6).translate(0, 1.5, 0), leaf, lean, 7, 0);
    const pos = frond.geometry.attributes.position;
    for (let p = 0; p < pos.count; p++) pos.setZ(p, -Math.pow(pos.getY(p) / 3, 2) * 1.1);
    frond.geometry.computeVertexNormals();
    frond.rotation.set(-1.1, (i / 9) * Math.PI * 2, 0, 'YXZ');
    g.add(frond);
  }
  g.position.set(x, 0, z);
  return g;
}

function buildRameswaram(k: ArenaKit): void {
  const sand = k.pbr('aerial_beach_01', [12, 5], 0xd8c49a);
  const stone = k.pbr('white_sandstone_bricks', [3, 2], 0xd8ccb8);
  k.add(mesh(new THREE.BoxGeometry(60, 1, 14), sand, 0, -0.5, -1));
  // The sea, where the stones of the Setu run out toward Lanka.
  k.water(-0.25, 0x0c3a48);
  const rock = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9 });
  for (let i = 0; i < 16; i++) {
    const r = mesh(new THREE.DodecahedronGeometry(0.6 + (i % 3) * 0.2, 0), rock, -2 + i * 0.4 + Math.sin(i) * 0.6, -0.15, -9 - i * 2.4);
    r.scale.y = 0.35;
    k.add(r);
  }
  // The temple's gopuram rising behind the mandapa, and a second further down the shore.
  k.add(gopuram(stone, -3, -16, 1.5), gopuram(stone, 18, -10, 1.1));
  // A mandapa of carved granite pillars behind the fight.
  const granite = k.pbr('rock_wall_08', [1, 3], 0xb0a898);
  for (let x = -6; x <= 6; x += 3) {
    k.add(mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), granite, x, 1.7, -4));
    k.add(mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), granite, x, 3.5, -4));
    for (const y of [0.9, 1.9, 2.8]) k.add(mesh(new THREE.BoxGeometry(0.58, 0.18, 0.58), granite, x, y, -4));
  }
  k.add(mesh(new THREE.BoxGeometry(14, 0.4, 1.6), granite, 0, 3.85, -4));
  // Coconut palms leaning over the shore, two framing the fight.
  for (const [x, z, lean] of [[-7.8, -2.4, 1.2], [8.2, -2.8, -1.3], [-15, -4, -0.8], [15, -5, 0.9], [-24, -6, 1.0]] as const) k.add(palm(x, z, lean));
  for (const [x, z, r] of [[-6, -14, 0.3], [9, -18, -0.2]] as const) k.boat(x, z, r);
  for (let x = -6; x <= 6; x += 3) k.diya(k.models.diya, x + 0.4, 0, -3.6);
  for (const x of [-4, 4]) k.lamp(x, 0.8, -3.5);
  k.place(k.models.pot1, -1.5, 0, -3.4, 1);
  k.place(k.models.clay, 1.5, 0, -3.4, 1);
}

// ─── Jaisalmer, Rajasthan ─────────────────────────────────────────────────────────────────────

function buildJaisalmer(k: ArenaKit): void {
  const gold = k.pbr('sandstone_blocks_08', [4, 2], 0xf0c890);
  const floor = k.pbr('sandstone_blocks_08', [12, 3], 0xe8c088);
  const sand = k.pbr('aerial_beach_01', [30, 20], 0xf0c890);
  k.add(mesh(new THREE.BoxGeometry(40, 1, 8), floor, 0, -0.5, 1));
  // Dunes rolling away behind the fort's terrace.
  const dunes = new THREE.PlaneGeometry(300, 160, 120, 60).rotateX(-Math.PI / 2);
  const p = dunes.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, (Math.sin(x * 0.05 + z * 0.08) * 2.4 + Math.sin(x * 0.13 - z * 0.05) * 1.2 + 2) * Math.min(1, Math.max(0, (-z - 4) / 20)));
  }
  dunes.computeVertexNormals();
  k.add(mesh(dunes, sand, 0, -0.6, -75));
  // The golden fort: a long wall of bastions on its hill behind the fight.
  const wall = mesh(new THREE.BoxGeometry(70, 6, 2.4), gold, 0, 3, -12);
  k.add(wall);
  for (let x = -30; x <= 30; x += 7.5) {
    k.add(mesh(new THREE.CylinderGeometry(2, 2.3, 8.4, 16), gold, x, 4.2, -11.5));
    for (let c = 0; c < 10; c++) {
      const a = (c / 10) * Math.PI * 2;
      k.add(mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), gold, x + Math.cos(a) * 2, 8.7, -11.5 + Math.sin(a) * 2));
    }
  }
  for (let x = -34; x <= 34; x += 1.4) k.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.5), gold, x, 6.3, -11));
  // Havelis with jharokha balconies either side of the terrace.
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 1 });
  for (const [x, w, h] of [[-11, 5, 7], [11.5, 5.5, 8]] as const) {
    k.add(mesh(new THREE.BoxGeometry(w, h, 4), gold, x, h / 2, -3.5));
    for (const y of [2.6, 5]) {
      for (const dx of [-1.4, 0, 1.4]) {
        k.add(mesh(new THREE.BoxGeometry(0.9, 1.2, 0.7), gold, x + dx, y, -1.4));
        k.add(mesh(new THREE.BoxGeometry(0.6, 0.8, 0.1), dark, x + dx, y, -1.02));
      }
    }
  }
  // Bunting in Rajasthan's colours strung across the terrace, and lanterns.
  const colours = [0xff2a6a, 0xffb21f, 0x1ec8a8, 0xff6a10, 0x8a3aff];
  for (let i = 0; i < 46; i++) {
    const x = -9 + i * 0.4;
    const y = 4.4 - Math.sin((i / 45) * Math.PI) * 0.9;
    const tri = mesh(new THREE.ConeGeometry(0.14, 0.3, 3), new THREE.MeshStandardMaterial({ color: colours[i % colours.length], side: THREE.DoubleSide }), x, y, -2.5);
    tri.rotation.x = Math.PI;
    k.add(tri);
  }
  for (const x of [-7, -2.5, 2.5, 7]) {
    k.flame(x, 2.6, -2.4, 0.35);
    k.lamp(x, 2.6, -2.2, 0xffb050);
  }
  k.place(k.models.pot2, -4.5, 0, -2.2, 1.1);
  k.place(k.models.clay, 4.8, 0, -2.2, 1.2);
}

// ─── The stages ───────────────────────────────────────────────────────────────────────────────

const sun = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const STAGES: Record<StageId, StageDef> = {
  varanasi: {
    id: 'varanasi', name: 'The Ghats of Kashi', state: 'Uttar Pradesh', raga: 'bhairav', waterY: RIVER_Y,
    legend: 'Kashi, the city of light, where the Ganga turns north and the lamps never go out.',
    weather: {
      dusk: { sky: '/akhada/sky/qwantani_dusk_2_puresky', sun: 0xffa660, sunIntensity: 2.6, sunDir: sun(-0.7, 0.32, -0.6), hemiSky: 0xffc8a0, hemiGround: 0x3a2618, hemi: 0.45, fog: 0xc48f6e, fogDensity: 0.011, env: 0.75, background: 1, wet: 0, diya: 1, rain: false },
      storm: { sky: '/akhada/sky/kloofendal_overcast_puresky', sun: 0xa9bcd8, sunIntensity: 1.1, sunDir: sun(0.3, 0.8, -0.4), hemiSky: 0x8a9bb0, hemiGround: 0x22262c, hemi: 0.4, fog: 0x5b6573, fogDensity: 0.022, env: 0.55, background: 0.8, wet: 1, diya: 0.8, rain: true },
      night: { sky: '/sky/neon', sun: 0x8fa6ff, sunIntensity: 0.55, sunDir: sun(0.5, 0.6, -0.6), hemiSky: 0x404a80, hemiGround: 0x120c18, hemi: 0.22, fog: 0x1b1a30, fogDensity: 0.016, env: 0.35, background: 0.7, wet: 0.3, diya: 2.2, rain: false }
    },
    build: buildVaranasi
  },
  kurukshetra: {
    id: 'kurukshetra', name: 'The Field of Kurukshetra', state: 'Haryana', raga: 'malkauns', waterY: null,
    legend: 'Dharmakshetra, where two armies met for eighteen days, and the Gita was spoken between them.',
    weather: {
      dusk: { sky: '/sky/desert', sun: 0xff7a40, sunIntensity: 2.8, sunDir: sun(0.8, 0.22, -0.5), hemiSky: 0xffa070, hemiGround: 0x3a2014, hemi: 0.45, fog: 0xb86a48, fogDensity: 0.012, env: 0.7, background: 1, wet: 0, diya: 1.4, rain: false },
      storm: { sky: '/akhada/sky/kloofendal_overcast_puresky', sun: 0xb0a090, sunIntensity: 1, sunDir: sun(-0.3, 0.7, -0.5), hemiSky: 0x7a7468, hemiGround: 0x241c14, hemi: 0.4, fog: 0x4a4038, fogDensity: 0.026, env: 0.5, background: 0.75, wet: 0.8, diya: 1.2, rain: true },
      night: { sky: '/sky/neon', sun: 0x8fa6ff, sunIntensity: 0.45, sunDir: sun(-0.5, 0.6, -0.6), hemiSky: 0x3a3a70, hemiGround: 0x120c0c, hemi: 0.2, fog: 0x1a1420, fogDensity: 0.018, env: 0.3, background: 0.7, wet: 0, diya: 2.4, rain: false }
    },
    build: buildKurukshetra
  },
  rameswaram: {
    id: 'rameswaram', name: 'The Shore of Rameswaram', state: 'Tamil Nadu', raga: 'hamsadhwani', waterY: -0.25,
    legend: 'Where the vanaras laid the stones of the Setu across the sea to Lanka.',
    weather: {
      dusk: { sky: '/sky/meadow', sun: 0xfff0d8, sunIntensity: 2.8, sunDir: sun(0.5, 0.75, -0.4), hemiSky: 0xbfd8ff, hemiGround: 0x5a4a30, hemi: 0.55, fog: 0xa8c4d8, fogDensity: 0.008, env: 0.85, background: 1, wet: 0, diya: 0.6, rain: false },
      storm: { sky: '/akhada/sky/kloofendal_overcast_puresky', sun: 0xa9bcd8, sunIntensity: 1, sunDir: sun(0.3, 0.8, -0.4), hemiSky: 0x8a9bb0, hemiGround: 0x22262c, hemi: 0.42, fog: 0x56677a, fogDensity: 0.024, env: 0.55, background: 0.8, wet: 1, diya: 0.8, rain: true },
      night: { sky: '/sky/neon', sun: 0x9ab0ff, sunIntensity: 0.6, sunDir: sun(0.4, 0.6, -0.7), hemiSky: 0x40508a, hemiGround: 0x101420, hemi: 0.24, fog: 0x18203a, fogDensity: 0.014, env: 0.4, background: 0.8, wet: 0.3, diya: 2, rain: false }
    },
    build: buildRameswaram
  },
  jaisalmer: {
    id: 'jaisalmer', name: 'The Golden Fort', state: 'Rajasthan', raga: 'maand', waterY: null,
    legend: 'Sonar Qila rises from the Thar, gold at noon and fire at sunset, the desert at its feet.',
    weather: {
      dusk: { sky: '/sky/beach', sun: 0xfff2d8, sunIntensity: 3.2, sunDir: sun(0.3, 0.9, -0.3), hemiSky: 0xcfe0ff, hemiGround: 0x8a6a40, hemi: 0.5, fog: 0xe8d0a8, fogDensity: 0.006, env: 0.8, background: 1, wet: 0, diya: 0.4, rain: false },
      storm: { sky: '/sky/desert', sun: 0xff9a50, sunIntensity: 1.6, sunDir: sun(0.7, 0.3, -0.6), hemiSky: 0xd8945a, hemiGround: 0x5a3a1a, hemi: 0.5, fog: 0xc88a50, fogDensity: 0.035, env: 0.5, background: 0.6, wet: 0, diya: 1, rain: false, dust: true },
      night: { sky: '/sky/neon', sun: 0x8fa6ff, sunIntensity: 0.5, sunDir: sun(0.5, 0.6, -0.6), hemiSky: 0x3a4078, hemiGround: 0x1a1008, hemi: 0.22, fog: 0x161428, fogDensity: 0.012, env: 0.35, background: 0.8, wet: 0, diya: 2.4, rain: false }
    },
    build: buildJaisalmer
  }
};

export const STAGE_ORDER: StageId[] = ['varanasi', 'kurukshetra', 'rameswaram', 'jaisalmer'];
