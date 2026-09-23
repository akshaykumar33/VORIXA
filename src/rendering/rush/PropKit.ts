import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The toolkit roadside props are built from.
 *
 * A prop is a few **parts**, each one colour and one instanced draw. Parts can move: a windmill's
 * blades spin, a fan waves, a penguin waddles. Movement is a small pure function of time and a
 * per-instance phase, evaluated when the instance matrix is written, so a hundred waving fans cost
 * the same draw calls as a hundred still ones.
 */

export interface PartPose {
  dy: number;
  rx: number;
  ry: number;
  rz: number;
}

/** Writes a pose for time `t` (seconds) and a per-instance `phase` into `out`. */
export type Anim = (t: number, phase: number, out: PartPose) => void;

export interface PropPart {
  geometry: THREE.BufferGeometry;
  color: number;
  /** Ink outline thickness in metres; 0 for none. */
  outline: number;
  /** Unlit and bright: lamps, neon, windows at night. */
  glow?: boolean;
  /** The point the part rotates about, in prop space. Geometry is authored relative to it. */
  pivot?: [number, number, number];
  anim?: Anim;
}

export interface PropSpec {
  parts: PropPart[];
  /** Relative frequency among its biome's props. */
  weight: number;
  /** Turn to face the road (and a little toward the oncoming car), or face anywhere. */
  facing: 'road' | 'random';
  /** Random scale range. */
  scale?: [number, number];
}

/** Merges geometries (indexed or not) into one non-indexed geometry. */
export function merge(...geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geometries.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    // Keep only what every built-in geometry has, so any mix merges.
    for (const name of Object.keys(n.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
    }
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error(`Could not merge ${geometries.length} prop geometries: attribute mismatch`);
  return merged;
}

/**
 * The ink hull for a part: the geometry pushed outward along *smoothed* normals.
 *
 * Scaling about the centre (the usual shortcut) fails on multi-piece parts — four legs merged
 * into one geometry would each have their hull shoved sideways. Welding the vertices first and
 * extruding along the averaged normals keeps every piece's outline wrapped around that piece,
 * with no cracks at hard edges.
 */
export function inflate(geometry: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  const hull = geometry.clone();
  hull.deleteAttribute('normal');
  hull.deleteAttribute('uv');
  const welded = mergeVertices(hull, 1e-3);
  welded.computeVertexNormals();
  const position = welded.getAttribute('position');
  const normal = welded.getAttribute('normal');
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + normal.getX(i) * thickness,
      position.getY(i) + normal.getY(i) * thickness,
      position.getZ(i) + normal.getZ(i) * thickness
    );
  }
  position.needsUpdate = true;
  return welded;
}

// ─── Animations ───────────────────────────────────────────────────────────────────────────────

export const hop = (height: number, speed: number): Anim => (t, phase, out) => {
  out.dy += Math.abs(Math.sin(t * speed + phase)) * height;
};

/** An arm raised and waving. `side` -1 is the prop's left. */
export const wave = (side: number, speed = 9): Anim => (t, phase, out) => {
  out.rz += side * (0.35 + Math.sin(t * speed + phase * 1.7) * 0.45);
};

export const spinZ = (speed: number): Anim => (t, phase, out) => {
  out.rz += t * speed + phase;
};

export const spinY = (speed: number): Anim => (t, phase, out) => {
  out.ry += t * speed + phase;
};

export const bob = (height: number, speed: number): Anim => (t, phase, out) => {
  out.dy += Math.sin(t * speed + phase) * height;
};

export const waddle = (angle: number, speed: number): Anim => (t, phase, out) => {
  out.rz += Math.sin(t * speed + phase) * angle;
};

export const nod = (angle: number, speed: number): Anim => (t, phase, out) => {
  out.rx += (Math.sin(t * speed + phase) * 0.5 + 0.5) * angle;
};

/** Several animations applied together. */
export const both = (...anims: Anim[]): Anim => (t, phase, out) => {
  for (const a of anims) a(t, phase, out);
};

// ─── Shape shorthands ─────────────────────────────────────────────────────────────────────────

export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const ball = (r: number, x = 0, y = 0, z = 0, detail = 1) =>
  new THREE.IcosahedronGeometry(r, detail).translate(x, y, z);
export const sphere = (r: number, x = 0, y = 0, z = 0) =>
  new THREE.SphereGeometry(r, 14, 10).translate(x, y, z);
export const cyl = (rt: number, rb: number, h: number, x = 0, y = 0, z = 0, seg = 10) =>
  new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
export const cone = (r: number, h: number, x = 0, y = 0, z = 0, seg = 10) =>
  new THREE.ConeGeometry(r, h, seg).translate(x, y, z);
export const capsule = (r: number, len: number, x = 0, y = 0, z = 0) =>
  new THREE.CapsuleGeometry(r, len, 4, 10).translate(x, y, z);
export const torus = (r: number, tube: number, x = 0, y = 0, z = 0, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, tube, 8, 20, arc).translate(x, y, z);
