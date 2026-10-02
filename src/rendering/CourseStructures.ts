import * as THREE from 'three';
import type { Box } from '../game/Course';

/**
 * Structural detail generated from the course itself.
 *
 * Every platform in the course is a slab floating in mid-air with nothing holding it up. That is
 * the remaining reason the world reads as a diagram rather than a place: the eye has no evidence
 * of weight, no verticality to measure height against, and nothing below the track to indicate
 * that falling means anything.
 *
 * Rather than model props — which means sourcing files, a compression pipeline and load time —
 * the supports are derived from the same box data the collision system uses, so they can never
 * drift out of sync with the level. Move a platform and its pylons move with it.
 *
 * All of it is one `InstancedMesh` per element type: a few hundred pylons cost a single draw call
 * and one shared material, which is the only reason this is affordable at all.
 */

/** Pylons only go under platforms this big; tiny ledges look cluttered with legs. */
const MIN_SUPPORTED_SPAN = 3.0;
/** How far down the pylons run. Fog swallows them well before this, which is the intent. */
const PYLON_DROP = 34;
/** Square cross-section of a pylon, in world units. */
const PYLON_THICKNESS = 0.42;
/** Corner inset, so legs sit under the slab rather than on its outer edge. */
const CORNER_INSET = 0.7;
/** Horizontal skirt depth beneath each platform lip. Gives the slab visible thickness. */
const SKIRT_DEPTH = 0.55;
const SKIRT_THICKNESS = 0.3;

export interface Structures {
  pylons: THREE.InstancedMesh | null;
  skirts: THREE.InstancedMesh | null;
  dispose(): void;
}

/**
 * Builds the supports for a course.
 *
 * Returns nulls when a course has no qualifying platforms rather than empty meshes, so the caller
 * never adds a zero-instance draw call to the scene.
 */
export function buildCourseStructures(
  boxes: readonly Box[],
  material: THREE.Material
): Structures {
  const platforms = boxes.filter(
    (box) =>
      box.kind === 'platform' &&
      box.maxX - box.minX >= MIN_SUPPORTED_SPAN &&
      box.maxZ - box.minZ >= MIN_SUPPORTED_SPAN
  );

  const disposables: { dispose(): void }[] = [];

  const pylons = buildPylons(platforms, material, disposables);
  const skirts = buildSkirts(platforms, material, disposables);

  return {
    pylons,
    skirts,
    dispose() {
      for (const item of disposables) item.dispose();
      disposables.length = 0;
    }
  };
}

function buildPylons(
  platforms: readonly Box[],
  material: THREE.Material,
  disposables: { dispose(): void }[]
): THREE.InstancedMesh | null {
  const count = platforms.length * 4;
  if (count === 0) return null;

  // Unit box anchored at its top face, so an instance scaled on Y grows downward from the
  // platform underside rather than straddling it.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, -0.5, 0);
  disposables.push(geometry);

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  let index = 0;
  for (const box of platforms) {
    const x0 = box.minX + CORNER_INSET;
    const x1 = box.maxX - CORNER_INSET;
    const z0 = box.minZ + CORNER_INSET;
    const z1 = box.maxZ - CORNER_INSET;

    // Shorter pylons on lower platforms, so a slab near the ground is not given a 34-unit leg
    // that punches through the floor plane.
    const drop = Math.min(PYLON_DROP, Math.max(4, box.minY + PYLON_DROP));
    scale.set(PYLON_THICKNESS, drop, PYLON_THICKNESS);

    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1]
    ] as const) {
      position.set(x, box.minY, z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index++, matrix);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A thin rail hanging under each platform's four edges.
 *
 * Without it a platform viewed from slightly below is a zero-thickness plane — the single most
 * obvious tell that the level is made of primitives. The skirt gives every slab a visible lip,
 * which also makes the edge readable on approach from beneath.
 */
function buildSkirts(
  platforms: readonly Box[],
  material: THREE.Material,
  disposables: { dispose(): void }[]
): THREE.InstancedMesh | null {
  const count = platforms.length * 4;
  if (count === 0) return null;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, -0.5, 0);
  disposables.push(geometry);

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  let index = 0;
  for (const box of platforms) {
    const width = box.maxX - box.minX;
    const depth = box.maxZ - box.minZ;
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const y = box.minY;

    // Two rails along Z-facing edges, two along X-facing edges.
    const edges: ReadonlyArray<readonly [number, number, number, number]> = [
      [cx, box.minZ + SKIRT_THICKNESS / 2, width, SKIRT_THICKNESS],
      [cx, box.maxZ - SKIRT_THICKNESS / 2, width, SKIRT_THICKNESS],
      [box.minX + SKIRT_THICKNESS / 2, cz, SKIRT_THICKNESS, depth],
      [box.maxX - SKIRT_THICKNESS / 2, cz, SKIRT_THICKNESS, depth]
    ];

    for (const [x, z, sx, sz] of edges) {
      position.set(x, y, z);
      scale.set(sx, SKIRT_DEPTH, sz);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index++, matrix);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
