import * as THREE from 'three';

/**
 * The cartoon look, shared by everything in Rush.
 *
 * Three pieces, all cheap:
 *
 * 1. **A toon ramp.** Two hard light bands and a lit band, so every rounded shape reads as a
 *    drawing rather than a render.
 * 2. **Ink outlines** by the inverted-hull trick: a slightly larger copy of the mesh, drawn
 *    back-faces only in near-black. No post-processing pass, and it works on instanced meshes.
 * 3. **The curved world.** Every vertex ahead of the camera is pulled down (and sideways) by the
 *    square of its distance, so the road rolls away over a horizon and seems to curve. It is the
 *    trick that makes endless runners look like a *place* rather than a corridor, and it costs
 *    three lines of vertex shader.
 */

export const INK = 0x1d1b33;

let ramp: THREE.DataTexture | null = null;

function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    // Shadow, mid, lit. The shadow band is kept bright: cartoons are rarely dark.
    const bands = new Uint8Array([140, 205, 255]);
    ramp = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

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

const toonCache = new Map<string, THREE.MeshToonMaterial>();

/** A bent toon material, shared per colour so a hundred cars do not compile a hundred programs. */
export function toon(color: number, options: { emissive?: number; map?: THREE.Texture } = {}): THREE.MeshToonMaterial {
  const key = `${color}|${options.emissive ?? 0}|${options.map?.uuid ?? ''}`;
  let material = toonCache.get(key);
  if (!material) {
    material = bent(
      new THREE.MeshToonMaterial({
        color,
        gradientMap: toonRamp(),
        emissive: options.emissive ?? 0x000000,
        map: options.map ?? null
      })
    );
    toonCache.set(key, material);
  }
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

/** Convenience: a toon mesh with an outline, optionally casting a shadow. */
export function part(
  geometry: THREE.BufferGeometry,
  color: number,
  options: { outline?: number; shadow?: boolean; emissive?: number } = {}
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, toon(color, { emissive: options.emissive }));
  mesh.castShadow = options.shadow ?? true;
  if (options.outline !== 0) outline(mesh, options.outline ?? 0.05);
  return mesh;
}
