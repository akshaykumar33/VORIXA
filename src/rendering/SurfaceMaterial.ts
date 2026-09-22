import * as THREE from 'three';

/**
 * Surface detail for course geometry.
 *
 * Every obstacle in the course is a box, and an untextured box lit by one directional light reads
 * as a placeholder no matter how good the palette is: flat faces give the eye nothing to measure
 * scale or form against, and the silhouette is the only information present.
 *
 * Rather than authoring textures — which means asset pipeline, memory, and load time for geometry
 * that is fundamentally procedural — the detail is generated in the fragment shader and injected
 * into `MeshStandardMaterial` through `onBeforeCompile`. That keeps three.js's PBR lighting,
 * shadow mapping, tone mapping and fog exactly as they were; we are adding to the emissive term,
 * not replacing the material.
 *
 * Three effects, each doing a specific job:
 *
 *   - **Panel lines**, projected in world space, so adjacent boxes share a continuous grid instead
 *     of each stretching its own UVs. This is what gives the eye a scale reference.
 *   - **Fresnel rim**, brightening glancing angles. Real surfaces do this, and its absence is a
 *     large part of why untextured geometry looks like flat-shaded cardboard.
 *   - **Energy pulse**, travelling along the surface for active kinds (boost, jump pad), so
 *     "this does something" is visible before you reach it.
 */

export interface SurfaceParams {
  color: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  /** World units between panel lines. Larger reads as bigger architecture. */
  panelScale?: number;
  /** How strongly panel lines show. 0 disables them. */
  panelStrength?: number;
  /** Rim colour at glancing angles. Defaults to the emissive colour. */
  rim?: THREE.ColorRepresentation;
  /** Rim brightness. 0 disables. */
  rimStrength?: number;
  /** Rim falloff exponent. Higher is a tighter edge. */
  rimPower?: number;
  /** Travelling pulse speed in world units per second. 0 disables. */
  pulseSpeed?: number;
  pulseStrength?: number;
}

/** Materials created here, so the renderer can advance their clocks in one pass. */
const animated: THREE.IUniform<number>[] = [];

const COMMON_CHUNK = /* glsl */ `
  varying vec3 vSurfaceWorldPos;
  uniform float uPanelScale;
  uniform float uPanelStrength;
  uniform vec3  uRimColor;
  uniform float uRimStrength;
  uniform float uRimPower;
  uniform float uPulseSpeed;
  uniform float uPulseStrength;
  uniform float uSurfaceTime;

  /**
   * Screen-space-derivative anti-aliased line grid.
   *
   * fwidth() gives the rate of change of the coordinate across one pixel, so dividing by it keeps
   * lines a constant *pixel* width however far away or steeply angled the surface is. A plain
   * step() comparison aliases into shimmering noise at exactly the grazing angles a racing course
   * is mostly viewed from.
   */
  float panelLine(vec2 coord, float thickness) {
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line * thickness, 1.0);
  }
`;

const WORLDPOS_CHUNK = /* glsl */ `
  vSurfaceWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const DETAIL_CHUNK = /* glsl */ `
  {
    // Project the grid along whichever axis the face points down least — a cheap triplanar pick.
    // Using a single planar projection would smear the grid to invisibility on two faces of
    // every box.
    vec3 n = abs(vNormal);
    vec2 panelCoord;
    if (n.y > n.x && n.y > n.z) {
      panelCoord = vSurfaceWorldPos.xz;
    } else if (n.x > n.z) {
      panelCoord = vSurfaceWorldPos.zy;
    } else {
      panelCoord = vSurfaceWorldPos.xy;
    }
    panelCoord /= uPanelScale;

    float fine = panelLine(panelCoord, 1.0);
    float coarse = panelLine(panelCoord * 0.25, 1.5);

    // Panel lines darken the base and lift the emissive slightly, so they read as recessed seams
    // catching a little light rather than as painted-on stripes.
    float seam = max(fine * 0.55, coarse);
    diffuseColor.rgb *= 1.0 - seam * uPanelStrength * 0.45;
    totalEmissiveRadiance += uRimColor * seam * uPanelStrength * 0.10;

    // Fresnel. vViewPosition points from the fragment toward the camera in view space, and the
    // normal here is already the shaded view-space normal, so this stays correct for
    // normal-mapped surfaces too.
    float fresnel = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
    totalEmissiveRadiance += uRimColor * fresnel * uRimStrength;

    // Travelling pulse along the dominant horizontal axis.
    if (uPulseStrength > 0.0) {
      float travel = vSurfaceWorldPos.z * 0.35 - uSurfaceTime * uPulseSpeed;
      float wave = pow(sin(travel) * 0.5 + 0.5, 3.0);
      totalEmissiveRadiance += uRimColor * wave * uPulseStrength;
    }
  }
`;

/**
 * Builds a standard material carrying the procedural detail above.
 *
 * The returned material is a plain `MeshStandardMaterial` in every respect that matters to the
 * rest of the renderer — it shadows, fogs and tone-maps identically — so nothing downstream needs
 * to know it was patched.
 */
export function createSurfaceMaterial(params: SurfaceParams): THREE.MeshStandardMaterial {
  const {
    color,
    emissive = 0x000000,
    emissiveIntensity = 0,
    roughness = 0.8,
    metalness = 0.05,
    panelScale = 4,
    panelStrength = 1,
    rim,
    rimStrength = 0.35,
    rimPower = 3.2,
    pulseSpeed = 0,
    pulseStrength = 0
  } = params;

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness,
    metalness
  });

  const time: THREE.IUniform<number> = { value: 0 };
  if (pulseStrength > 0) animated.push(time);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPanelScale = { value: panelScale };
    shader.uniforms.uPanelStrength = { value: panelStrength };
    shader.uniforms.uRimColor = { value: new THREE.Color(rim ?? emissive ?? color) };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uRimPower = { value: rimPower };
    shader.uniforms.uPulseSpeed = { value: pulseSpeed };
    shader.uniforms.uPulseStrength = { value: pulseStrength };
    shader.uniforms.uSurfaceTime = time;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vSurfaceWorldPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WORLDPOS_CHUNK}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_CHUNK}`)
      // Injected after emissivemap_fragment: by this point `normal`, `vViewPosition`,
      // `diffuseColor` and `totalEmissiveRadiance` all exist, and nothing has consumed them yet.
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${DETAIL_CHUNK}`
      );
  };

  // Materials with different shader source must not share a compiled program. Without a distinct
  // key three.js caches the first variant and silently reuses it for every surface kind.
  material.customProgramCacheKey = () =>
    `surface:${panelScale}:${panelStrength}:${rimStrength}:${rimPower}:${pulseStrength}`;

  return material;
}

/** Advances every pulsing surface. Called once per frame rather than per material. */
export function updateSurfaceTime(elapsed: number): void {
  for (const uniform of animated) uniform.value = elapsed;
}

/** Drops the animation registry. Call when tearing the scene down. */
export function resetSurfaceMaterials(): void {
  animated.length = 0;
}
