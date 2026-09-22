import * as THREE from 'three';

/**
 * Checkpoint gates as energy curtains.
 *
 * A checkpoint is the most important thing on screen — it is literally the objective — and it was
 * drawn as a flat plane at 14% opacity. At speed that is nearly invisible against the course, so
 * the player navigates by the route map instead of by looking at the world, which is a failure of
 * the 3D scene to do its job.
 *
 * The replacement reads at a distance and at a glance:
 *
 *   - A bright frame around the aperture, because an edge is legible where a wash is not.
 *   - Scanlines travelling upward, so the gate is obviously *active* rather than scenery.
 *   - Brightness rising as the player closes in, which turns "where is the next one" into
 *     something the eye answers rather than the minimap.
 *   - A state change on passing: the curtain calms and shifts to the signal colour, so progress
 *     is visible in the world behind you.
 *
 * Additive, depth-write disabled, double-sided — it is light, not a surface, and the player flies
 * straight through it.
 */

const VERTEX = /* glsl */ `
  varying vec2 vGateUv;

  void main() {
    vGateUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3  uColor;
  uniform float uTime;
  uniform float uPassed;
  uniform float uProximity;

  varying vec2 vGateUv;

  void main() {
    vec2 uv = vGateUv;

    // Distance to the nearest edge, in UV space. Drives the frame.
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float frame = 1.0 - smoothstep(0.0, 0.055, edge);

    // Scanlines travelling upward. Slower and fainter once passed: the gate stays legible as a
    // landmark without continuing to demand attention it no longer deserves.
    float speed = mix(2.4, 0.5, uPassed);
    float scan = sin((uv.y - uTime * speed) * 26.0) * 0.5 + 0.5;
    scan = pow(scan, 3.0);

    // A soft vertical wash so the aperture is not a hollow rectangle.
    float wash = (1.0 - abs(uv.y - 0.5) * 2.0) * 0.28;

    // Approach brightening. Squared so it stays subtle until genuinely close, then ramps.
    float approach = mix(0.35, 1.0, uProximity * uProximity);

    float intensity = frame * 1.5 + scan * 0.42 + wash;
    intensity *= approach;
    // A passed gate drops to a quiet marker rather than vanishing, which would make the course
    // behind you read as unbuilt.
    intensity *= mix(1.0, 0.45, uPassed);

    gl_FragColor = vec4(uColor * intensity, clamp(intensity, 0.0, 1.0));
  }
`;

export class GateMaterial extends THREE.ShaderMaterial {
  public constructor(color: THREE.ColorRepresentation) {
    super({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: { value: 0 },
        uPassed: { value: 0 },
        uProximity: { value: 0 }
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }

  public setTime(elapsed: number): void {
    this.uniforms.uTime.value = elapsed;
  }

  /** 0 = ahead of the player, 1 = already cleared. */
  public setPassed(passed: boolean): void {
    this.uniforms.uPassed.value = passed ? 1 : 0;
  }

  /** 0 = far away, 1 = on top of it. */
  public setProximity(value: number): void {
    this.uniforms.uProximity.value = value;
  }

  public setColor(color: THREE.ColorRepresentation): void {
    (this.uniforms.uColor.value as THREE.Color).set(color);
  }
}
