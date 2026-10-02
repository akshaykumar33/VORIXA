import * as THREE from 'three';
import { merge } from './PropKit';

/**
 * Materials shared by everything in Rush (ADR-0013: premium stylized).
 *
 * 1. **Physically based finishes.** Every surface is a standard or physical material lit by the
 *    world's HDR sky, so paint gleams, glass reflects and rubber stays matte. `finish()` names
 *    the handful of finishes the game uses; `toon()` is the default matte finish (the name is
 *    historical: it predates the move away from toon shading).
 * 2. **The curved world.** Every vertex ahead of the camera is pulled down (and sideways) by the
 *    square of its distance, so the road rolls away over a horizon and seems to curve. It is the
 *    trick that makes endless runners look like a *place* rather than a corridor, and it costs
 *    three lines of vertex shader.
 *
 * The ink outlines of the old cartoon look are gone: `outline()` is kept as a no-op so model code
 * reads the same, and so the style could be reintroduced in one place.
 */

export const INK = 0x1d1b33;

/** Curvature shared by every bent material. Written by the renderer each frame. */
export const bend = {
  /** Downward curvature: metres of drop per metre² ahead. */
  down: { value: 0.0011 },
  /** Sideways curvature, swung slowly to fake bends in the road. */
  side: { value: 0 }
};

const BEND_VERTEX = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  vec4 bentWorld = modelMatrix * mvPosition;
  // Only ahead of the camera (which sits near z = 0, looking down -z). Behind stays flat so the
  // car and the camera itself are never bent.
  float ahead = max(-bentWorld.z, 0.0);
  float ahead2 = ahead * ahead;
  bentWorld.y -= ahead2 * uBendDown;
  bentWorld.x += ahead2 * uBendSide;
  #ifdef GROUND_BLEND
    vGroundZ = bentWorld.z;
  #endif
  mvPosition = viewMatrix * bentWorld;
  gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Adds the curved-world bend to any built-in material. Chains any existing `onBeforeCompile`
 * rather than replacing it.
 */
export function bent<T extends THREE.Material>(material: T): T {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uBendDown = bend.down;
    shader.uniforms.uBendSide = bend.side;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBendDown;\nuniform float uBendSide;')
      .replace('#include <project_vertex>', BEND_VERTEX);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|bent`;
  return material;
}

const toonCache = new Map<string, THREE.MeshStandardMaterial>();

/** The default matte finish, shared per colour so a hundred props do not compile a hundred programs. */
export function toon(color: number, options: { emissive?: number; map?: THREE.Texture } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${options.emissive ?? 0}|${options.map?.uuid ?? ''}`;
  let material = toonCache.get(key);
  if (!material) {
    material = bent(
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.62,
        metalness: 0.02,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissive ? 1.4 : 1,
        map: options.map ?? null
      })
    );
    toonCache.set(key, material);
  }
  return material;
}

export type Finish = 'paint' | 'glass' | 'rubber' | 'chrome' | 'metal' | 'matte' | 'gloss';

const finishCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * A named surface finish. Car paint is a clear-coated physical material: the clear coat is what
 * makes a car read as a car rather than a painted toy, because it carries a sharp reflection of
 * the sky over a softer coloured base.
 */
export function finish(color: number, kind: Finish): THREE.MeshStandardMaterial {
  const key = `${kind}|${color}`;
  let material = finishCache.get(key);
  if (material) return material;
  switch (kind) {
    case 'paint':
      material = new THREE.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 });
      break;
    case 'glass':
      material = new THREE.MeshPhysicalMaterial({ color: 0x14202e, metalness: 0.1, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 });
      break;
    case 'rubber':
      material = new THREE.MeshStandardMaterial({ color: 0x17181d, metalness: 0, roughness: 0.88 });
      break;
    case 'chrome':
      material = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.18 });
      break;
    case 'metal':
      material = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.35 });
      break;
    case 'gloss':
      material = new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.25, clearcoat: 0.6 });
      break;
    case 'matte':
      material = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.75 });
      break;
  }
  bent(material);
  finishCache.set(key, material);
  return material;
}

const flatCache = new Map<number, THREE.MeshBasicMaterial>();

/** Unlit and bent: glows, lights, shots, sky details. */
export function flat(color: number): THREE.MeshBasicMaterial {
  let material = flatCache.get(color);
  if (!material) {
    material = bent(new THREE.MeshBasicMaterial({ color }));
    flatCache.set(color, material);
  }
  return material;
}

/** Off in the premium stylized look; one switch brings the cartoon outlines back. */
export const INK_OUTLINES = false;

let inkMaterial: THREE.MeshBasicMaterial | null = null;

export function ink(): THREE.MeshBasicMaterial {
  if (!inkMaterial) {
    inkMaterial = bent(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  }
  return inkMaterial;
}

/**
 * Wraps a mesh with an ink outline.
 *
 * The hull is scaled per axis by `(size + 2t) / size` from the geometry's own bounds, so thin
 * parts (a spoiler, a coin) get the same line weight as fat ones instead of a uniform scale that
 * would swamp them.
 */
export function outline<T extends THREE.Mesh>(mesh: T, thickness = 0.05): T {
  // The premium look has no ink outlines (ADR-0013). Kept so model code is unchanged.
  if (!INK_OUTLINES) return mesh;
  const geometry = mesh.geometry;
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  const hull = new THREE.Mesh(geometry, ink());
  hull.scale.set(
    (size.x + 2 * thickness) / Math.max(size.x, 1e-3),
    (size.y + 2 * thickness) / Math.max(size.y, 1e-3),
    (size.z + 2 * thickness) / Math.max(size.z, 1e-3)
  );
  // A bounding-box centre that is not at the origin would drift under that scale; recentre.
  const centre = new THREE.Vector3();
  geometry.boundingBox!.getCenter(centre);
  hull.position.copy(centre).multiply(new THREE.Vector3(1 - hull.scale.x, 1 - hull.scale.y, 1 - hull.scale.z));
  hull.castShadow = false;
  hull.raycast = () => {};
  mesh.add(hull);
  return mesh;
}

/**
 * Merges every static mesh under `root` into one mesh per material.
 *
 * Models are authored from dozens of small parts because that is how they are easy to shape —
 * but each part is a draw call, and a car with its outlines was over seventy. Parts that never
 * move relative to `root` gain nothing from being separate, so they are baked together; parts
 * that animate are listed in `keep` and left alone (re-parented to `root` first, so baking
 * their original parent cannot orphan them).
 *
 * Transparent parts are skipped: merging them would break their draw order.
 */
export function bake(root: THREE.Object3D, keep: THREE.Object3D[] = []): void {
  for (const k of keep) if (k.parent && k.parent !== root) root.attach(k);
  root.updateMatrixWorld(true);
  const kept = new Set<THREE.Object3D>();
  for (const k of keep) k.traverse((o) => kept.add(o));

  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const relative = new THREE.Matrix4();
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const baked: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o === root || kept.has(o)) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const material = mesh.material;
    if (Array.isArray(material) || material.transparent) return;
    relative.multiplyMatrices(toRoot, mesh.matrixWorld);
    const list = byMaterial.get(material) ?? [];
    list.push(mesh.geometry.clone().applyMatrix4(relative));
    byMaterial.set(material, list);
    baked.push(mesh);
  });
  // Children of baked meshes that were not kept (and are not meshes) go with their parent.
  for (const mesh of baked) mesh.removeFromParent();
  for (const [material, geometries] of byMaterial) {
    const mesh = new THREE.Mesh(merge(...geometries), material);
    root.add(mesh);
  }
}

/** Convenience: a toon mesh with an outline, optionally casting a shadow. */
export function part(
  geometry: THREE.BufferGeometry,
  color: number,
  options: { outline?: number; shadow?: boolean; emissive?: number; finish?: Finish } = {}
): THREE.Mesh {
  const material = options.finish ? finish(color, options.finish) : toon(color, { emissive: options.emissive });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = options.shadow ?? true;
  if (options.outline !== 0) outline(mesh, options.outline ?? 0.05);
  return mesh;
}
