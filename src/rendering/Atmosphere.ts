import * as THREE from 'three';

/**
 * Sky, horizon and ground — the things that make the course sit *somewhere*.
 *
 * Previously the scene background was a single flat colour. Flat black is the most reliable tell
 * that a 3D scene is a tech demo: with no horizon there is no sense of scale, with no gradient
 * there is no sense of air, and with no ground the world visibly stops existing a few metres from
 * the track. Fog fading geometry into a void reads as things disappearing, not as distance.
 *
 * Three pieces, all cheap:
 *
 *   - A sky dome carrying a vertical gradient plus a horizon glow, so "up" and "out" look
 *     different and the eye gets a reference for level.
 *   - A ground plane far below the course, so falling reads as falling *into* somewhere.
 *   - A distance-faded grid on that plane, which is what actually communicates speed — a smooth
 *     surface at 200 km/h looks identical to a stationary one.
 *
 * Everything here is a shader on existing geometry. No textures to load, no draw calls that
 * scale with course length.
 */

/** Rendered behind everything; large enough that the player never approaches its shell. */
const SKY_RADIUS = 900;
/**
 * The paddock floor.
 *
 * Below every course's kill height (-12 endless, -18 authored), so a fall still ends the attempt
 * before the player could touch it — ground you pass through reads as a bug, not as depth. High
 * enough that roadside props, spectators and light towers have something to stand on: the course
 * is a suspended ribbon, and anything placed beside it with no floor floats in mid-air.
 */
export const GROUND_Y = -20;
const GROUND_EXTENT = 1600;

export interface AtmosphereColors {
  /** Deep sky, straight overhead. */
  zenith: THREE.ColorRepresentation;
  /** Sky at eye level, where the glow sits. */
  horizon: THREE.ColorRepresentation;
  /** The ground plane itself. */
  ground: THREE.ColorRepresentation;
  /** Grid lines and the horizon glow. Carries the signal colour at low intensity. */
  accent: THREE.ColorRepresentation;
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldDirection;

  void main() {
    // Direction from the camera to this vertex, which is all a sky gradient needs — the dome's
    // own position is irrelevant because it is effectively at infinity.
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uAccent;
  uniform float uTime;

  varying vec3 vWorldDirection;

  // Cheap hash-based noise. Used only to break up banding, never as a visible feature.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 dir = normalize(vWorldDirection);

    // Height above the horizon, 0 at eye level and 1 straight up. The power curve keeps the
    // gradient concentrated near the horizon where the eye actually looks.
    float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    float t = pow(smoothstep(0.34, 0.92, height), 1.35);
    vec3 sky = mix(uHorizon, uZenith, t);

    // Horizon glow: a tight band at eye level. This is what gives the scene a sense of air and
    // tells the player where level is without a visible line.
    float band = 1.0 - smoothstep(0.0, 0.16, abs(dir.y));
    sky += uAccent * band * 0.10;

    // A slow vertical drift so the sky is never completely static. Far too subtle to read as
    // movement; enough that the image does not feel frozen behind a moving camera.
    float drift = sin(dir.x * 2.1 + uTime * 0.05) * 0.5 + 0.5;
    sky += uAccent * band * drift * 0.025;

    // Dither. Smooth dark gradients band badly on 8-bit displays, and banding is the fastest way
    // to make an otherwise good sky look cheap.
    float dither = (hash(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0);
    gl_FragColor = vec4(sky + dither, 1.0);
  }
`;

const GROUND_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform vec3 uGround;
  uniform vec3 uAccent;
  uniform float uTime;

  varying vec3 vWorldPosition;

  /**
   * Analytically anti-aliased grid.
   *
   * Drawing lines with a plain step() produces vicious aliasing at grazing angles — exactly the
   * angle this plane is always viewed from. Dividing by the screen-space derivative widens the
   * line as it recedes, which is what keeps distant grid from turning into noise.
   */
  float grid(vec2 coord, float spacing, float thickness) {
    vec2 cell = abs(fract(coord / spacing - 0.5) - 0.5) / fwidth(coord / spacing);
    float line = min(cell.x, cell.y);
    return 1.0 - min(line * thickness, 1.0);
  }

  void main() {
    vec2 p = vWorldPosition.xz;

    float fine = grid(p, 8.0, 1.0);
    float coarse = grid(p, 40.0, 1.4);

    // Fade with distance from the camera so the horizon is atmosphere rather than moire.
    float dist = length(vWorldPosition.xz - cameraPosition.xz);
    float fade = 1.0 - smoothstep(180.0, 620.0, dist);

    // A slow pulse travelling outward, tying the ground to the sense of speed.
    float pulse = sin(dist * 0.02 - uTime * 1.1) * 0.5 + 0.5;

    vec3 colour = uGround;
    colour += uAccent * fine * 0.16 * fade;
    colour += uAccent * coarse * 0.30 * fade;
    colour += uAccent * coarse * pulse * 0.10 * fade;

    gl_FragColor = vec4(colour, 1.0);
  }
`;

export class Atmosphere {
  private readonly skyUniforms: Record<string, THREE.IUniform>;
  private readonly groundUniforms: Record<string, THREE.IUniform>;
  private readonly disposables: { dispose(): void }[] = [];

  public readonly sky: THREE.Mesh;
  public readonly ground: THREE.Mesh;

  public constructor(colors: AtmosphereColors) {
    this.skyUniforms = {
      uZenith: { value: new THREE.Color(colors.zenith) },
      uHorizon: { value: new THREE.Color(colors.horizon) },
      uAccent: { value: new THREE.Color(colors.accent) },
      uTime: { value: 0 }
    };

    const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      // Seen from inside, and it must never be fogged or depth-tested against the world.
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
    // Drawn first, and never culled by the camera's frustum since it always surrounds it.
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;

    this.groundUniforms = {
      uGround: { value: new THREE.Color(colors.ground) },
      uAccent: { value: new THREE.Color(colors.accent) },
      uTime: { value: 0 }
    };

    const groundGeometry = new THREE.PlaneGeometry(GROUND_EXTENT, GROUND_EXTENT, 1, 1);
    const groundMaterial = new THREE.ShaderMaterial({
      uniforms: this.groundUniforms,
      vertexShader: GROUND_VERTEX,
      fragmentShader: GROUND_FRAGMENT,
      fog: false
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = GROUND_Y;
    this.ground.frustumCulled = false;

    this.disposables.push(skyGeometry, skyMaterial, groundGeometry, groundMaterial);
  }

  public addTo(scene: THREE.Scene): void {
    scene.add(this.sky);
    scene.add(this.ground);
  }

  /**
   * Keeps the dome and the ground centred on the player horizontally.
   *
   * Without this the player eventually reaches the edge of both and watches the world end. Only
   * the horizontal axes follow — letting the ground track vertically would make falling toward it
   * impossible, and the whole point of a floor is that you can approach it.
   */
  public update(elapsed: number, cameraPosition: THREE.Vector3): void {
    this.skyUniforms.uTime.value = elapsed;
    this.groundUniforms.uTime.value = elapsed;

    this.sky.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    this.ground.position.x = cameraPosition.x;
    this.ground.position.z = cameraPosition.z;
  }

  public dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
  }
}
