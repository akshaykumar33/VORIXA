import * as THREE from 'three';
import type { BiomeId } from '../../rush/Zones';
import {
  merge,
  hop,
  wave,
  spinZ,
  spinY,
  bob,
  waddle,
  both,
  box,
  ball,
  sphere,
  cyl,
  cone,
  capsule,
  torus,
  type PropPart,
  type PropSpec,
  type Anim
} from './PropKit';

/**
 * The six worlds of Rush: a palette and a cast of props for each.
 *
 * Palettes are chosen as a set so each world is unmistakable at a glance — warm oranges for the
 * canyon, cold blues for the peaks, candy pinks, violet-and-cyan neon, turquoise beach — while
 * the road, kerbs and characters stay readable against every one of them.
 *
 * Props are split into a **near** row just off the kerb (small things, characters, animals) and
 * a **far** row (buildings and landmarks), which is what gives the roadside depth.
 */

export interface Palette {
  skyTop: number;
  skyHorizon: number;
  fog: number;
  sun: number;
  /** 1 for a sun with a halo; 0 hides it (night worlds show the moon via `sun` colour and stars). */
  stars: number;
  ground: [number, number];
  road: [number, number];
  kerb: [number, number];
  hills: number;
  cloud: number;
  cloudRim: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunIntensity: number;
}

export interface BiomeLook {
  palette: Palette;
  near: PropSpec[];
  far: PropSpec[];
}

const INK = 0x1d1b33;
const WHITE = 0xffffff;

function part(geometry: THREE.BufferGeometry, color: number, outline = 0.05, extra: Partial<PropPart> = {}): PropPart {
  return { geometry, color, outline, ...extra };
}

function withAnim(parts: PropPart[], anim: Anim): PropPart[] {
  return parts.map((p) => ({ ...p, anim: p.anim ? both(anim, p.anim) : anim }));
}

// ─── Shared nature ────────────────────────────────────────────────────────────────────────────

function roundTree(leaf: number, weight = 1): PropSpec {
  return {
    parts: [part(cyl(0.22, 0.32, 2.2, 0, 1.1, 0, 7), 0x9a6a44, 0.06), part(ball(1.7, 0, 3.3, 0), leaf, 0.1)],
    weight,
    facing: 'random',
    scale: [0.8, 1.3]
  };
}

function pine(leafA: number, leafB: number, weight = 1, snow = false): PropSpec {
  const parts = [
    part(cyl(0.2, 0.26, 1.2, 0, 0.6, 0, 6), 0x8a5a3a, 0.05),
    part(merge(cone(1.6, 2.6, 0, 2.2, 0, 8), cone(1.15, 2.1, 0, 3.6, 0, 8)), leafA, 0.08)
  ];
  if (snow) parts.push(part(merge(cone(0.8, 1.0, 0, 3.05, 0, 8), cone(0.58, 0.9, 0, 4.35, 0, 8)), WHITE, 0.04));
  else parts[1].color = leafB;
  return { parts, weight, facing: 'random', scale: [0.8, 1.4] };
}

function rock(color: number, weight = 1): PropSpec {
  return {
    parts: [part(new THREE.DodecahedronGeometry(0.9, 0).scale(1.3, 0.75, 1).translate(0, 0.4, 0), color, 0.06)],
    weight,
    facing: 'random',
    scale: [0.7, 1.5]
  };
}

// ─── Meadow ───────────────────────────────────────────────────────────────────────────────────

function cow(): PropSpec {
  const grazing: Anim = (t, phase, out) => {
    out.rz -= (Math.sin(t * 1.3 + phase) * 0.5 + 0.5) * 0.55;
  };
  const head: [number, number, number] = [0.9, 1.4, 0];
  const legs = [-0.6, 0.6].flatMap((x) => [-0.3, 0.3].map((z) => box(0.22, 0.8, 0.22, x, 0.4, z)));
  return {
    parts: [
      part(merge(box(1.7, 0.9, 0.95, 0, 1.15, 0), ...legs), WHITE, 0.05),
      part(merge(box(0.55, 0.45, 0.02, 0.2, 1.25, 0.48), box(0.45, 0.35, 0.02, -0.45, 1.05, -0.48), box(0.5, 0.02, 0.4, -0.2, 1.61, 0.1)), INK, 0),
      part(box(0.55, 0.52, 0.6, 0.25, 0, 0), WHITE, 0.04, { pivot: head, anim: grazing }),
      part(box(0.26, 0.3, 0.5, 0.58, -0.12, 0), 0xffb3c6, 0.03, { pivot: head, anim: grazing }),
      part(merge(cone(0.07, 0.25, 0.2, 0.36, -0.2), cone(0.07, 0.25, 0.2, 0.36, 0.2)), 0xfff0d0, 0.02, { pivot: head, anim: grazing }),
      part(merge(sphere(0.06, 0.53, 0.1, -0.2), sphere(0.06, 0.53, 0.1, 0.2)), INK, 0, { pivot: head, anim: grazing })
    ],
    weight: 0.7,
    facing: 'random'
  };
}

function sheep(): PropSpec {
  const fluff = merge(
    ball(0.5, 0, 0.95, 0), ball(0.42, 0.4, 1.0, 0.1), ball(0.42, -0.4, 1.0, -0.1),
    ball(0.38, 0.1, 1.25, 0.25), ball(0.38, -0.1, 1.2, -0.28)
  );
  const legs = merge(...[-0.3, 0.3].flatMap((x) => [-0.22, 0.22].map((z) => cyl(0.07, 0.07, 0.6, x, 0.3, z, 6))));
  const parts = [
    part(fluff, WHITE, 0.06),
    part(merge(ball(0.26, 0.72, 1.05, 0, 0), legs), 0x3a3550, 0.04),
    part(merge(sphere(0.06, 0.93, 1.12, -0.1), sphere(0.06, 0.93, 1.12, 0.1)), WHITE, 0)
  ];
  return { parts: withAnim(parts, hop(0.12, 4)), weight: 0.7, facing: 'random' };
}

function flowers(): PropSpec {
  return {
    parts: [
      part(merge(ball(0.28, 0, 0.3, 0, 0), ball(0.22, 1.1, 0.25, -0.5, 0)), 0xff7eb6, 0.04),
      part(merge(ball(0.24, 0.6, 0.26, 0.4, 0), ball(0.2, -0.8, 0.22, 0.6, 0)), 0xffd23f, 0.04),
      part(merge(ball(0.26, -0.5, 0.28, -0.5, 0), ball(0.2, 0.2, 0.22, -1.0, 0)), WHITE, 0.04)
    ],
    weight: 0.8,
    facing: 'random'
  };
}

function house(wall: number, roof: number): PropSpec {
  return {
    parts: [
      part(box(5, 3.6, 4.4, 0, 1.8, 0), wall, 0.12),
      part(cone(4.0, 2.4, 0, 4.8, 0, 4).rotateY(Math.PI / 4).scale(1, 1, 0.9), roof, 0.1),
      part(merge(box(1.1, 1.1, 0.1, -1.2, 2.1, 2.22), box(1.1, 1.1, 0.1, 1.2, 2.6, 2.22)), 0x9fe3ff, 0.05),
      part(box(1.0, 1.9, 0.1, 1.2, 0.95, 2.22).translate(-2.4, 0, 0), 0x7a4a30, 0.05),
      part(box(0.6, 1.4, 0.6, 1.4, 5.0, -0.8), 0xb8b3c9, 0.06)
    ],
    weight: 1,
    facing: 'road'
  };
}

function windmill(): PropSpec {
  const blades = merge(...[0, 1, 2, 3].map((i) => box(0.8, 4.2, 0.1, 0, 2.2, 0).rotateZ((i * Math.PI) / 2)));
  return {
    parts: [
      part(cyl(0.7, 1.4, 9, 0, 4.5, 0, 8), 0xfff7e0, 0.12),
      part(cone(1.2, 1.6, 0, 9.8, 0, 8), 0xff6b5a, 0.08),
      part(blades, 0xf4f1ea, 0.06, { pivot: [0, 8.6, 1.0], anim: spinZ(1.3) }),
      part(sphere(0.35, 0, 8.6, 1.1), 0xff6b5a, 0.04)
    ],
    weight: 0.8,
    facing: 'road'
  };
}

function barn(): PropSpec {
  return {
    parts: [
      part(box(6, 4, 5, 0, 2, 0), 0xe0443e, 0.12),
      part(cone(4.6, 2.6, 0, 5.3, 0, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.85), 0x6b4a3a, 0.1),
      part(merge(box(2.2, 2.8, 0.1, 0, 1.4, 2.53), box(0.2, 3.4, 0.12).rotateZ(0.66).translate(0, 1.4, 2.6), box(0.2, 3.4, 0.12).rotateZ(-0.66).translate(0, 1.4, 2.6)), WHITE, 0.04)
    ],
    weight: 0.7,
    facing: 'road'
  };
}

// ─── Desert ───────────────────────────────────────────────────────────────────────────────────

function saguaro(weight = 1): PropSpec {
  const arms = merge(
    cyl(0.28, 0.28, 0.9, 0, 0, 0).rotateZ(Math.PI / 2).translate(0.5, 1.8, 0),
    capsule(0.28, 0.9, 0.9, 2.4, 0),
    capsule(0.26, 0.6, -0.8, 1.6, 0),
    cyl(0.26, 0.26, 0.6, 0, 0, 0).rotateZ(Math.PI / 2).translate(-0.45, 1.2, 0)
  );
  return {
    parts: [
      part(merge(capsule(0.45, 3.0, 0, 1.9, 0), arms), 0x4caf50, 0.07),
      part(merge(ball(0.2, 0, 3.85, 0), ball(0.14, 0.9, 3.1, 0)), 0xff5fa8, 0.03)
    ],
    weight,
    facing: 'random',
    scale: [0.8, 1.4]
  };
}

function barrelCactus(): PropSpec {
  return {
    parts: [
      part(sphere(0.55, 0, 0.5, 0).scale(1, 0.9, 1), 0x3fae5a, 0.05),
      part(ball(0.16, 0, 1.0, 0), 0xffd23f, 0.03)
    ],
    weight: 0.9,
    facing: 'random',
    scale: [0.8, 1.3]
  };
}

function tumbleweed(): PropSpec {
  return {
    parts: [part(new THREE.IcosahedronGeometry(0.6, 0), 0xc49a5a, 0.05, { pivot: [0, 0.6, 0], anim: both(hop(0.5, 4), spinZ(-5)) })],
    weight: 0.6,
    facing: 'random'
  };
}

function signpost(): PropSpec {
  return {
    parts: [
      part(cyl(0.1, 0.1, 2.4, 0, 1.2, 0, 6), 0x8a5a3a, 0.04),
      part(merge(box(1.4, 0.4, 0.1, 0.4, 2.0, 0), cone(0.28, 0.4, 0, 0, 0, 3).rotateZ(-Math.PI / 2).translate(1.3, 2.0, 0)), 0xd9a066, 0.04)
    ],
    weight: 0.5,
    facing: 'road'
  };
}

function mesa(): PropSpec {
  return {
    parts: [
      part(cyl(6.5, 7.5, 5, 0, 2.5, 0, 7), 0xd9773a, 0.14),
      part(cyl(5.2, 6.2, 2.4, 0, 6.2, 0, 7), 0xe8955a, 0.12),
      part(cyl(5.3, 5.3, 0.5, 0, 5.1, 0, 7), 0xc2562f, 0.06)
    ],
    weight: 1.2,
    facing: 'random',
    scale: [0.8, 1.4]
  };
}

function adobe(): PropSpec {
  const beams = merge(...[-1.2, 0, 1.2].map((x) => cyl(0.12, 0.12, 0.8, 0, 0, 0, 6).rotateX(Math.PI / 2).translate(x, 2.6, 2.1)));
  return {
    parts: [
      part(box(4, 3, 4, 0, 1.5, 0), 0xf0b27a, 0.1),
      part(merge(box(0.9, 1.6, 0.1, 0.9, 0.8, 2.02), box(0.7, 0.7, 0.1, -0.9, 1.8, 2.02)), 0x7a4a30, 0.04),
      part(beams, 0x8a5a3a, 0.03)
    ],
    weight: 1,
    facing: 'road'
  };
}

function waterTower(): PropSpec {
  const legs = merge(...[-1, 1].flatMap((x) => [-1, 1].map((z) => cyl(0.12, 0.12, 5, x, 2.5, z, 6))));
  return {
    parts: [
      part(legs, 0x8a5a3a, 0.05),
      part(cyl(1.8, 1.8, 2.4, 0, 6.2, 0, 14), 0xff6b5a, 0.1),
      part(cone(2.0, 1.2, 0, 8.0, 0, 14), 0x8a5a3a, 0.08)
    ],
    weight: 0.6,
    facing: 'random'
  };
}

// ─── Snow ─────────────────────────────────────────────────────────────────────────────────────

function snowman(): PropSpec {
  const stick = cyl(0.05, 0.05, 0.9, 0, 0.45, 0, 5);
  return {
    parts: [
      part(merge(ball(0.7, 0, 0.65, 0), ball(0.5, 0, 1.65, 0), ball(0.36, 0, 2.4, 0)), WHITE, 0.06),
      part(cone(0.08, 0.45, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(0, 2.4, 0.55), 0xff8c3a, 0.02),
      part(merge(sphere(0.06, -0.13, 2.5, 0.31), sphere(0.06, 0.13, 2.5, 0.31), sphere(0.07, 0, 1.75, 0.47), sphere(0.07, 0, 1.5, 0.48)), INK, 0),
      part(merge(cyl(0.26, 0.28, 0.42, 0, 2.95, 0, 12), cyl(0.42, 0.42, 0.05, 0, 2.74, 0, 16)), INK, 0.03),
      part(torus(0.34, 0.09, 0, 0, 0).rotateX(Math.PI / 2).translate(0, 2.08, 0), 0xff4d5e, 0.03),
      part(stick, 0x7a4a30, 0.02, { pivot: [-0.45, 1.75, 0], anim: wave(1, 4) }),
      part(stick.clone(), 0x7a4a30, 0.02, { pivot: [0.45, 1.75, 0], anim: wave(-1, 4) })
    ],
    weight: 0.9,
    facing: 'road'
  };
}

function penguin(): PropSpec {
  const parts = [
    part(capsule(0.36, 0.5, 0, 0.65, 0), 0x2a2d4a, 0.05),
    part(sphere(0.3, 0, 0.6, 0.14).scale(1, 1.3, 1), WHITE, 0),
    part(cone(0.08, 0.22, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(0, 1.05, 0.4), 0xff9f1c, 0.02),
    part(merge(sphere(0.07, -0.12, 1.15, 0.3), sphere(0.07, 0.12, 1.15, 0.3)), WHITE, 0),
    part(merge(sphere(0.035, -0.12, 1.15, 0.36), sphere(0.035, 0.12, 1.15, 0.36)), INK, 0),
    part(merge(box(0.2, 0.06, 0.3, -0.14, 0.03, 0.1), box(0.2, 0.06, 0.3, 0.14, 0.03, 0.1)), 0xff9f1c, 0.02)
  ];
  return { parts: withAnim(parts, waddle(0.22, 7)), weight: 1, facing: 'road' };
}

function iceCrystal(): PropSpec {
  return {
    parts: [part(new THREE.OctahedronGeometry(0.6, 0).scale(0.7, 1.4, 0.7), 0x9fe3ff, 0.04, { pivot: [0, 1.3, 0], anim: both(spinY(1.2), bob(0.2, 2)) })],
    weight: 0.6,
    facing: 'random'
  };
}

function igloo(): PropSpec {
  return {
    parts: [
      part(new THREE.SphereGeometry(2.4, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), 0xf4f8ff, 0.1),
      part(cyl(0.8, 0.8, 1.4, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(0, 0.6, 2.4), 0xe1ecfa, 0.06),
      part(new THREE.CircleGeometry(0.55, 12).translate(0, 0.6, 3.11), 0x3d4a7a, 0)
    ],
    weight: 1,
    facing: 'road'
  };
}

function snowMountain(): PropSpec {
  return {
    parts: [part(cone(9, 14, 0, 7, 0, 9), 0x9fb7d9, 0.14), part(cone(3.7, 5.8, 0, 11.1, 0, 9), WHITE, 0.08)],
    weight: 1.2,
    facing: 'random',
    scale: [0.9, 1.6]
  };
}

function cabin(): PropSpec {
  return {
    parts: [
      part(box(4.4, 3, 3.6, 0, 1.5, 0), 0x9a6a44, 0.1),
      part(cone(3.4, 2.2, 0, 4.1, 0, 4).rotateY(Math.PI / 4).scale(1, 1, 0.85), WHITE, 0.08),
      part(box(1, 1, 0.1, 0.9, 1.7, 1.82), 0xffd23f, 0, { glow: true }),
      part(box(0.6, 1.4, 0.6, -1.2, 4.2, 0), 0x6b4a3a, 0.05)
    ],
    weight: 0.8,
    facing: 'road'
  };
}

// ─── Candy ────────────────────────────────────────────────────────────────────────────────────

function lollipop(color: number, weight = 0.6): PropSpec {
  return {
    parts: [
      part(cyl(0.08, 0.08, 2.4, 0, 1.2, 0, 6), WHITE, 0.03),
      part(cyl(0.8, 0.8, 0.2, 0, 0, 0, 20).rotateX(Math.PI / 2), color, 0.05, { pivot: [0, 2.7, 0], anim: spinZ(2) }),
      part(torus(0.48, 0.09, 0, 0, 0.11, Math.PI * 1.5), WHITE, 0, { pivot: [0, 2.7, 0], anim: spinZ(2) })
    ],
    weight,
    facing: 'road'
  };
}

function gumdrop(color: number): PropSpec {
  return {
    parts: [part(new THREE.SphereGeometry(0.7, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), color, 0.05, { anim: hop(0.25, 5) })],
    weight: 0.45,
    facing: 'random',
    scale: [0.8, 1.3]
  };
}

function candyCane(): PropSpec {
  const stripes = merge(...[0.4, 0.9, 1.4, 1.9, 2.4].map((y) => torus(0.16, 0.05).rotateX(Math.PI / 2).translate(0, y, 0)));
  return {
    parts: [
      part(merge(cyl(0.15, 0.15, 2.6, 0, 1.3, 0, 10), torus(0.4, 0.15, 0.4, 2.6, 0, Math.PI)), 0xff4d5e, 0.04),
      part(stripes, WHITE, 0)
    ],
    weight: 0.7,
    facing: 'road'
  };
}

function cupcake(): PropSpec {
  return {
    parts: [
      part(cyl(0.55, 0.4, 0.6, 0, 0.3, 0, 12), 0xf2a65a, 0.05),
      part(merge(ball(0.6, 0, 0.78, 0), ball(0.4, 0, 1.15, 0)), 0xffc2e2, 0.05),
      part(ball(0.14, 0, 1.6, 0), 0xff4d5e, 0.03)
    ],
    weight: 0.7,
    facing: 'random',
    scale: [0.8, 1.4]
  };
}

function iceCreamTower(): PropSpec {
  return {
    parts: [
      part(cyl(1.8, 0.2, 5, 0, 2.5, 0, 12), 0xf2b366, 0.1),
      part(ball(1.9, 0, 5.6, 0), 0xff8fc8, 0.1),
      part(ball(1.6, 0, 7.3, 0), 0x9ff0c9, 0.09),
      part(ball(1.3, 0, 8.7, 0), 0xfff0d6, 0.08),
      part(ball(0.4, 0, 10.1, 0), 0xff4d5e, 0.04)
    ],
    weight: 1,
    facing: 'random'
  };
}

function cakeHouse(): PropSpec {
  return {
    parts: [
      part(cyl(3, 3, 2.2, 0, 1.1, 0, 18), 0xfff0f5, 0.1),
      part(cyl(2.2, 2.2, 1.8, 0, 3.1, 0, 18), 0xffb3d9, 0.09),
      part(merge(cyl(3.05, 3.05, 0.3, 0, 2.2, 0, 18), cyl(2.25, 2.25, 0.3, 0, 4.0, 0, 18)), 0xff5fa8, 0.05),
      part(cyl(0.18, 0.18, 1.2, 0, 4.6, 0, 8), 0x9fe3ff, 0.04),
      part(cone(0.18, 0.4, 0, 5.4, 0, 8), 0xffd23f, 0, { glow: true, anim: bob(0.05, 12) })
    ],
    weight: 1,
    facing: 'random'
  };
}

function candyMushroom(): PropSpec {
  const dots = merge(...[0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return ball(0.35, Math.cos(a) * 1.7, 4.5, Math.sin(a) * 1.7);
  }), ball(0.4, 0, 5.6, 0));
  return {
    parts: [
      part(cyl(0.7, 0.9, 3.6, 0, 1.8, 0, 12), 0xfff0d6, 0.08),
      part(new THREE.SphereGeometry(2.6, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(0, 3.5, 0), 0xff4d5e, 0.1),
      part(dots, WHITE, 0)
    ],
    weight: 0.9,
    facing: 'random',
    scale: [0.9, 1.3]
  };
}

// ─── Neon ─────────────────────────────────────────────────────────────────────────────────────

function streetLamp(glow: number): PropSpec {
  return {
    parts: [
      part(merge(cyl(0.1, 0.14, 4.2, 0, 2.1, 0, 8), box(1.2, 0.12, 0.12, 0.5, 4.1, 0)), 0x3a3560, 0.04),
      part(box(0.5, 0.18, 0.4, 1.0, 3.95, 0), glow, 0, { glow: true })
    ],
    weight: 0.8,
    facing: 'road'
  };
}

function hologram(): PropSpec {
  return {
    parts: [
      part(cyl(0.7, 0.8, 0.4, 0, 0.2, 0, 12), 0x2b2458, 0.05),
      part(cone(0.7, 1.4, 0, 0, 0, 4), 0xff3df2, 0, { glow: true, pivot: [0, 1.6, 0], anim: both(spinY(1.6), bob(0.2, 2)) })
    ],
    weight: 0.6,
    facing: 'random'
  };
}

function neonArch(color: number): PropSpec {
  return {
    parts: [part(torus(1.6, 0.1, 0, 0, 0, Math.PI), color, 0, { glow: true })],
    weight: 0.5,
    facing: 'road'
  };
}

function tower(height: number, window: number): PropSpec {
  const rows = Math.floor(height / 2.2);
  const windows = merge(...Array.from({ length: rows }, (_, i) => box(4.2, 0.35, 0.1, 0, 1.6 + i * 2.2, 2.56)));
  return {
    parts: [
      part(box(5, height, 5, 0, height / 2, 0), 0x2b2458, 0.12),
      part(windows, window, 0, { glow: true }),
      part(sphere(0.35, 0, height + 1.2, 0), 0xff3df2, 0, { glow: true, anim: bob(0.15, 3) }),
      part(cyl(0.06, 0.06, 1.2, 0, height + 0.6, 0, 4), 0x8f7bff, 0)
    ],
    weight: 1,
    facing: 'road',
    scale: [0.9, 1.3]
  };
}

function billboard(): PropSpec {
  return {
    parts: [
      part(merge(cyl(0.15, 0.15, 5, -1.8, 2.5, 0, 6), cyl(0.15, 0.15, 5, 1.8, 2.5, 0, 6)), 0x3a3560, 0.04),
      part(box(5, 2.6, 0.2, 0, 5.6, 0), 0xff3df2, 0, { glow: true }),
      part(merge(box(3.6, 0.4, 0.1, 0, 6.1, 0.12), box(2.4, 0.4, 0.1, -0.6, 5.2, 0.12)), 0x3ff7ff, 0, { glow: true })
    ],
    weight: 0.8,
    facing: 'road'
  };
}

function ferrisWheel(): PropSpec {
  const spokes = merge(...Array.from({ length: 8 }, (_, i) => box(0.12, 10, 0.12, 0, 0, 0).rotateZ((i * Math.PI) / 8)));
  const cars = merge(...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return box(0.9, 0.9, 0.9, Math.cos(a) * 5, Math.sin(a) * 5, 0);
  }));
  const spin = spinZ(0.35);
  return {
    parts: [
      part(merge(box(0.3, 8, 0.3).rotateZ(-0.3).translate(-1.2, 3.8, 0), box(0.3, 8, 0.3).rotateZ(0.3).translate(1.2, 3.8, 0)), 0x3a3560, 0.06),
      part(torus(5, 0.15), 0xff3df2, 0, { glow: true, pivot: [0, 7.5, 0], anim: spin }),
      part(spokes, 0x3ff7ff, 0, { glow: true, pivot: [0, 7.5, 0], anim: spin }),
      part(cars, 0xffd23f, 0, { glow: true, pivot: [0, 7.5, 0], anim: spin })
    ],
    weight: 0.6,
    facing: 'road'
  };
}

// ─── Beach ────────────────────────────────────────────────────────────────────────────────────

function palm(weight = 1): PropSpec {
  const trunk = merge(...Array.from({ length: 6 }, (_, i) => cyl(0.2, 0.26, 0.85, i * i * 0.045, 0.42 + i * 0.8, 0, 8)));
  const topX = 25 * 0.045;
  const leaves = merge(...Array.from({ length: 7 }, (_, i) =>
    box(0.55, 0.06, 2.4, 0, 0, 1.2).rotateX(0.45).rotateY((i / 7) * Math.PI * 2).translate(topX, 4.9, 0)
  ));
  return {
    parts: [
      part(trunk, 0xb07a45, 0.05),
      part(leaves, 0x3fbf5f, 0.04),
      part(merge(ball(0.2, topX + 0.2, 4.75, 0.1), ball(0.2, topX - 0.15, 4.72, -0.15)), 0x6b4a3a, 0.03)
    ],
    weight,
    facing: 'random',
    scale: [0.9, 1.4]
  };
}

function umbrella(color: number): PropSpec {
  return {
    parts: [
      part(cyl(0.05, 0.05, 2.4, 0, 1.2, 0, 6), WHITE, 0.02),
      part(cone(1.5, 0.6, 0, 2.5, 0, 10), color, 0.05),
      part(box(1.4, 0.12, 0.6, 0.9, 0.3, 0), 0xfff0c2, 0.03)
    ],
    weight: 0.45,
    facing: 'random'
  };
}

function surfboard(color: number): PropSpec {
  return {
    parts: [
      part(capsule(0.3, 1.6, 0, 1.1, 0).scale(1, 1, 0.25), color, 0.04),
      part(box(0.1, 1.8, 0.02, 0, 1.1, 0.08), WHITE, 0)
    ],
    weight: 0.35,
    facing: 'road'
  };
}

function crab(): PropSpec {
  const parts = [
    part(merge(sphere(0.45, 0, 0.32, 0).scale(1, 0.55, 0.8), ball(0.2, -0.55, 0.35, 0.3), ball(0.2, 0.55, 0.35, 0.3)), 0xff5a36, 0.04),
    part(merge(sphere(0.09, -0.14, 0.62, 0.2), sphere(0.09, 0.14, 0.62, 0.2)), WHITE, 0.02),
    part(merge(sphere(0.045, -0.14, 0.63, 0.28), sphere(0.045, 0.14, 0.63, 0.28)), INK, 0)
  ];
  return { parts: withAnim(parts, both(hop(0.08, 14), waddle(0.18, 14))), weight: 0.8, facing: 'road' };
}

function sandcastle(): PropSpec {
  return {
    parts: [
      part(merge(box(1.6, 0.7, 1.6, 0, 0.35, 0), cyl(0.3, 0.35, 1.1, -0.65, 0.55, -0.65, 8), cyl(0.3, 0.35, 1.1, 0.65, 0.55, 0.65, 8), cyl(0.35, 0.4, 1.5, 0, 1.3, 0, 8)), 0xf2cf86, 0.05),
      part(merge(cyl(0.02, 0.02, 0.6, 0, 2.3, 0, 4), box(0.35, 0.22, 0.02, 0.18, 2.5, 0)), 0xff4d5e, 0)
    ],
    weight: 0.5,
    facing: 'random'
  };
}

function beachHut(): PropSpec {
  return {
    parts: [
      part(box(3.4, 2.6, 3, 0, 1.6, 0), 0x6fd6c9, 0.08),
      part(merge(...[-1.4, 1.4].flatMap((x) => [-1.2, 1.2].map((z) => cyl(0.12, 0.12, 0.6, x, 0.3, z, 6)))), 0xb07a45, 0.03),
      part(cone(3, 1.8, 0, 3.8, 0, 4).rotateY(Math.PI / 4), 0xe8c070, 0.08),
      part(box(0.9, 1.5, 0.1, 0.6, 1.3, 1.52), 0xff5a36, 0.03)
    ],
    weight: 1,
    facing: 'road'
  };
}

function lighthouse(): PropSpec {
  const bands = (from: number) => merge(...[0, 2, 4].map((i) => cyl(1.3 - (from + i) * 0.08, 1.38 - (from + i) * 0.08, 1.4, 0, 0.7 + (from + i) * 1.4, 0, 14)));
  return {
    parts: [
      part(bands(0), 0xfff7e0, 0.1),
      part(bands(1), 0xff4d5e, 0.1),
      part(cyl(0.9, 0.9, 1, 0, 8.9, 0, 12), 0xffd23f, 0, { glow: true }),
      part(cone(1.2, 1.2, 0, 10, 0, 12), 0xff4d5e, 0.06)
    ],
    weight: 0.6,
    facing: 'random'
  };
}

// ─── The worlds ───────────────────────────────────────────────────────────────────────────────

export function buildBiomes(): Record<BiomeId, BiomeLook> {
  return {
    meadow: {
      palette: {
        skyTop: 0x3fa7ff, skyHorizon: 0xcfdcea, fog: 0xc6d6e6, sun: 0xfff1b8, stars: 0,
        ground: [0x6a9e45, 0x5b8f3b], road: [0x3b3e45, 0xece6d6], kerb: [0xc8373f, 0xece6d6],
        hills: 0x9fd8a0, cloud: 0xffffff, cloudRim: 0xc9d6f2,
        hemiSky: 0xe6f4ff, hemiGround: 0x9bd48a, hemiIntensity: 1.15, sunIntensity: 1.7
      },
      near: [
        roundTree(0x4cc36a), pine(0x2fa36b, 0x38b877), rock(0xb8b3c9, 0.6), flowers(), cow(), sheep(),
        { parts: [{ geometry: new THREE.IcosahedronGeometry(0.9, 1).scale(1.3, 0.8, 1).translate(0, 0.5, 0), color: 0x66cf52, outline: 0.07 }], weight: 0.8, facing: 'random' }
      ],
      far: [house(0xfff0d6, 0xff6b5a), house(0xd6f0ff, 0x3d8bff), house(0xffe0f0, 0x9b6bff), windmill(), barn(), roundTree(0x44b862, 0.8), pine(0x2fa36b, 0x38b877, 0.8)]
    },
    desert: {
      palette: {
        skyTop: 0xff8a5c, skyHorizon: 0xffd79a, fog: 0xffcf92, sun: 0xfff4c0, stars: 0,
        ground: [0xd9a86a, 0xcc9a5c], road: [0x4a4441, 0xf0e2c4], kerb: [0xd8652a, 0xf0e2c4],
        hills: 0xe79a5a, cloud: 0xfff0e0, cloudRim: 0xf0b58a,
        hemiSky: 0xffe4c8, hemiGround: 0xd9a066, hemiIntensity: 1.1, sunIntensity: 1.8
      },
      near: [
        saguaro(), barrelCactus(), rock(0xd9773a, 1), tumbleweed(), signpost()
      ],
      far: [mesa(), adobe(), waterTower(), saguaro(1.2)]
    },
    snow: {
      palette: {
        skyTop: 0x6fb2ff, skyHorizon: 0xd8e2ec, fog: 0xd3dde8, sun: 0xfffbe8, stars: 0,
        ground: [0xe8eef6, 0xd5e0ee], road: [0x40444f, 0xf2f4f7], kerb: [0x2f6fd0, 0xf2f4f7],
        hills: 0xdbe9fb, cloud: 0xffffff, cloudRim: 0xb8cff0,
        hemiSky: 0xeaf4ff, hemiGround: 0xc8d8ee, hemiIntensity: 1.2, sunIntensity: 1.3
      },
      near: [
        pine(0x2f7d5b, 0x2f7d5b, 1.4, true), snowman(), penguin(), iceCrystal(), rock(0xc9d6f2, 0.5)
      ],
      far: [igloo(), snowMountain(), cabin(), pine(0x2f7d5b, 0x2f7d5b, 1, true)]
    },
    candy: {
      palette: {
        skyTop: 0xff8fd0, skyHorizon: 0xffe3f3, fog: 0xffe0f2, sun: 0xfff6c8, stars: 0,
        ground: [0x8fd8b4, 0x7bcaa3], road: [0x5a4a78, 0xf6e8f2], kerb: [0xe0508f, 0xf6e8f2],
        hills: 0xffc2e2, cloud: 0xffffff, cloudRim: 0xffb3d9,
        hemiSky: 0xfff0fa, hemiGround: 0xb9f2d8, hemiIntensity: 1.2, sunIntensity: 1.5
      },
      near: [
        lollipop(0xff5fa8), lollipop(0x3fa7ff), gumdrop(0xff4d5e), gumdrop(0x5ad16b), gumdrop(0xffd23f), candyCane(), cupcake()
      ],
      far: [iceCreamTower(), cakeHouse(), candyMushroom(), lollipop(0xffd23f, 0.6)]
    },
    neon: {
      palette: {
        skyTop: 0x120c38, skyHorizon: 0x6a3aa8, fog: 0x3a2270, sun: 0xf3eaff, stars: 1,
        ground: [0x1b1733, 0x221d40], road: [0x16141f, 0x3ff7ff], kerb: [0xff3df2, 0x3ff7ff],
        hills: 0x2b1f5c, cloud: 0x5b3f9a, cloudRim: 0x2a1d55,
        hemiSky: 0x9f8bff, hemiGround: 0x3a2a70, hemiIntensity: 1.0, sunIntensity: 0.6
      },
      near: [
        streetLamp(0x3ff7ff), streetLamp(0xff3df2), hologram(), neonArch(0x3ff7ff), neonArch(0xff3df2)
      ],
      far: [tower(18, 0xffd23f), tower(26, 0x3ff7ff), tower(12, 0xff3df2), billboard(), ferrisWheel()]
    },
    beach: {
      palette: {
        skyTop: 0x2fc6ff, skyHorizon: 0xdbe8ef, fog: 0xd6e4ec, sun: 0xfff3b0, stars: 0,
        ground: [0xe8cf95, 0xdcc083], road: [0x44474f, 0xf2f2ee], kerb: [0x2aa89c, 0xf2f2ee],
        hills: 0x6fd6c9, cloud: 0xffffff, cloudRim: 0xbfe8f5,
        hemiSky: 0xf0fbff, hemiGround: 0xe9cf8f, hemiIntensity: 1.15, sunIntensity: 1.8
      },
      near: [
        palm(), umbrella(0xff5a36), umbrella(0x2ec4b6), umbrella(0xffd23f), surfboard(0x3fa7ff), surfboard(0xff5fa8), crab(), sandcastle()
      ],
      far: [beachHut(), lighthouse(), palm(1.2)]
    }
  };
}
