import * as THREE from 'three';
import { streamFor } from '../world/Rng';

/**
 * The world either side of the track.
 *
 * The course is an excellent ribbon of geometry suspended in nothing. Everything built so far —
 * sky, ground, supports, materials — improves the ribbon; none of it answers the question the eye
 * asks first, which is *where am I*. A track with no surroundings reads as a test level however
 * well it is lit.
 *
 * Three elements, chosen because each does a different job at a different distance:
 *
 *   - **Towers** flanking the course at mid distance. These are the parallax layer: at speed they
 *     sweep past, and nothing communicates velocity like something large going by close. This is
 *     the single biggest contributor.
 *   - **Beacons** on the tower tops. Small emissive points that bloom, giving the mid-ground
 *     depth cues at night and a rhythm to follow.
 *   - **Monoliths** far out and huge. They barely move with the camera, which is exactly what
 *     makes them read as distant and enormous — the horizon needs occupants or the fog is just a
 *     grey wall.
 *
 * Everything is instanced and derived from the segment's own seed, so it is deterministic,
 * disposed with its segment, and costs three draw calls per segment regardless of count.
 *
 * Deliberately never placed over the track. Decoration that can be collided with is level design,
 * and level design belongs in `SegmentGenerator` where it is verified passable.
 */

/** Horizontal clearance from the course centre line. Nothing decorative comes closer. */
const TRACK_CLEARANCE = 13;

const TOWERS_PER_SEGMENT = 5;
const BEACONS_PER_SEGMENT = TOWERS_PER_SEGMENT;
const MONOLITHS_PER_SEGMENT = 2;

export interface DressingMaterials {
  tower: THREE.Material;
  beacon: THREE.Material;
  monolith: THREE.Material;
}

export interface Dressing {
  meshes: THREE.InstancedMesh[];
  dispose(): void;
}

/**
 * Builds the decoration for one segment.
 *
 * @param seed  The world seed, so two different worlds are decorated differently.
 * @param index The segment index — decoration is derived from a stream offset from the one that
 *              produced the geometry, so changing decoration can never shift the course layout.
 */
export function buildSetDressing(
  seed: number,
  index: number,
  minZ: number,
  maxZ: number,
  materials: DressingMaterials
): Dressing {
  // Offset the stream: sharing it with the layout generator would mean adding a tower silently
  // rewrote every gap downstream of it.
  const rng = streamFor(seed, index * 2 + 1);

  const meshes: THREE.InstancedMesh[] = [];
  const disposables: { dispose(): void }[] = [];

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  // ── Towers ──────────────────────────────────────────────────────────────────
  const towerGeometry = new THREE.BoxGeometry(1, 1, 1);
  // Anchored at the base so a scaled instance grows upward from where it is placed.
  towerGeometry.translate(0, 0.5, 0);
  disposables.push(towerGeometry);

  const towers = new THREE.InstancedMesh(towerGeometry, materials.tower, TOWERS_PER_SEGMENT);
  const beaconGeometry = new THREE.SphereGeometry(0.5, 6, 4);
  disposables.push(beaconGeometry);
  const beacons = new THREE.InstancedMesh(beaconGeometry, materials.beacon, BEACONS_PER_SEGMENT);

  for (let i = 0; i < TOWERS_PER_SEGMENT; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    const x = side * rng.range(TRACK_CLEARANCE, TRACK_CLEARANCE + 34);
    const z = rng.range(minZ, maxZ);
    // Bases sit below the track and run up past it, so they are cut by the course rather than
    // standing politely beside it — that overlap is what sells them as structure rather than props.
    const base = rng.range(-30, -14);
    const height = rng.range(22, 62);
    const width = rng.range(2.2, 6.5);
    const depth = rng.range(2.2, 6.5);

    position.set(x, base, z);
    scale.set(width, height, depth);
    euler.set(0, rng.range(0, Math.PI), 0);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    towers.setMatrixAt(i, matrix);

    position.set(x, base + height, z);
    const beaconScale = rng.range(0.5, 1.1);
    scale.set(beaconScale, beaconScale, beaconScale);
    matrix.compose(position, new THREE.Quaternion(), scale);
    beacons.setMatrixAt(i, matrix);
  }

  towers.instanceMatrix.needsUpdate = true;
  beacons.instanceMatrix.needsUpdate = true;
  // Never shadow-casting: these are far from the shadow frustum, so they would only ever cost
  // fill rate for a shadow that lands outside the visible cascade.
  towers.castShadow = false;
  towers.receiveShadow = false;
  meshes.push(towers, beacons);

  // ── Monoliths ───────────────────────────────────────────────────────────────
  const monolithGeometry = new THREE.BoxGeometry(1, 1, 1);
  monolithGeometry.translate(0, 0.5, 0);
  disposables.push(monolithGeometry);

  const monoliths = new THREE.InstancedMesh(
    monolithGeometry,
    materials.monolith,
    MONOLITHS_PER_SEGMENT
  );

  for (let i = 0; i < MONOLITHS_PER_SEGMENT; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * rng.range(150, 330);
    const z = rng.range(minZ - 120, maxZ + 120);
    position.set(x, rng.range(-60, -30), z);
    scale.set(rng.range(18, 46), rng.range(90, 230), rng.range(18, 46));
    euler.set(0, rng.range(0, Math.PI), 0);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    monoliths.setMatrixAt(i, matrix);
  }

  monoliths.instanceMatrix.needsUpdate = true;
  monoliths.castShadow = false;
  monoliths.receiveShadow = false;
  meshes.push(monoliths);

  // Instanced bounds are computed from the source geometry, which here is a unit cube — so
  // three.js would cull these the moment the unit cube left the frustum, long before the towers
  // themselves did.
  for (const mesh of meshes) mesh.frustumCulled = false;

  return {
    meshes,
    dispose() {
      for (const item of disposables) item.dispose();
      disposables.length = 0;
    }
  };
}
