import * as THREE from 'three';

/**
 * The thing the player is flying.
 *
 * Until now the player had no body at all — a first-person camera floating through geometry. That
 * is the single biggest reason the game reads as a viewer rather than a vehicle: with nothing on
 * screen that belongs to you, speed has no anchor, banking has nothing to bank, and the boost you
 * trigger happens entirely off-screen.
 *
 * The craft is a *frame*, not a model. It occupies the periphery — lower corners and a thin spine
 * — and deliberately leaves the centre of the view empty, because the centre is where the player
 * is aiming and anything there is an obstruction rather than an asset. Cockpit framing is the
 * oldest trick in first-person vehicle design and it works because peripheral motion is read
 * without being looked at.
 *
 * Everything is procedural: a handful of thin extruded panels and two additive engine quads. No
 * files to source, no DRACO pipeline, no load time, and it recolours with the design tokens.
 *
 * ## Attached to the camera, not the world
 *
 * The craft is a child of the camera, so it inherits view transform for free and never needs its
 * position solved against yaw and pitch. Its own animation is then *relative* motion — a lag that
 * reads as mass, which is impossible to express if you are busy re-deriving world position every
 * frame.
 */

/** How far in front of the eye the craft sits. Inside the near plane would clip it away. */
const CRAFT_DISTANCE = 0.92;
/** Radians of counter-roll at full bank. Opposes camera roll so the craft leans *into* the turn. */
const BANK_LEAN = 0.34;
/** Lag on the craft following the camera. Lower is heavier. */
const FOLLOW_RATE = 7;

export interface CraftState {
  /** 0–1 normalized speed. Drives engine intensity and forward rake. */
  speed: number;
  /** -1 to +1 deliberate bank. */
  bank: number;
  /** 0–1 analog brake. Flares the airbrakes. */
  brake: number;
  /** True on the frames a boost is firing. */
  boosting: boolean;
  /** True while time dilation is active. */
  dilating: boolean;
}

export interface CraftColors {
  hull: THREE.ColorRepresentation;
  edge: THREE.ColorRepresentation;
  engine: THREE.ColorRepresentation;
  brake: THREE.ColorRepresentation;
}

/**
 * Builds one angular panel.
 *
 * A tapered quad rather than a box: the taper is what makes the silhouette read as designed rather
 * than as a rectangle, and it costs the same two triangles.
 */
function panel(
  nearHalf: number,
  farHalf: number,
  length: number,
  drop: number
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // Near edge at the viewer, far edge pushed forward and slightly down, so the panel rakes away.
  const vertices = new Float32Array([
    -nearHalf, 0, 0,
    nearHalf, 0, 0,
    farHalf, -drop, -length,
    -nearHalf, 0, 0,
    farHalf, -drop, -length,
    -farHalf, -drop, -length
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The craft as a single world-space silhouette, for anything seen from outside — the ghost today,
 * other players later.
 *
 * Shares this module with the first-person frame deliberately. A ghost drawn as an unrelated
 * shape is just a marker; drawn as the same craft, it reads as *you*, which is the entire point of
 * racing a replay of yourself. Keeping both here means a change to the silhouette cannot update
 * one and forget the other.
 *
 * A swept delta: nose forward along -Z, wingtips swept back and slightly down. Twelve triangles,
 * no textures, correct from every angle a ghost is ever viewed from.
 */
export function createCraftSilhouette(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  const nose = [0, 0, -0.95] as const;
  const tipL = [-0.62, -0.06, 0.45] as const;
  const tipR = [0.62, -0.06, 0.45] as const;
  const tail = [0, 0.02, 0.28] as const;
  const keel = [0, -0.2, 0.2] as const;
  const spine = [0, 0.16, -0.1] as const;

  // Upper surfaces, lower surfaces, and a keel fin — enough volume that the shape never
  // degenerates into a flat sliver when viewed edge-on.
  const tris: (readonly [number, number, number])[][] = [
    [nose, tipL, spine],
    [nose, spine, tipR],
    [spine, tipL, tail],
    [spine, tail, tipR],
    [nose, keel, tipL],
    [nose, tipR, keel],
    [keel, tail, tipL],
    [keel, tipR, tail]
  ];

  const positions = new Float32Array(tris.length * 9);
  let at = 0;
  for (const tri of tris) {
    for (const vertex of tri) {
      positions[at++] = vertex[0];
      positions[at++] = vertex[1];
      positions[at++] = vertex[2];
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class PlayerCraft {
  private readonly root = new THREE.Group();
  private readonly hullGroup = new THREE.Group();
  private readonly engines: THREE.Mesh[] = [];
  private readonly airbrakes: THREE.Mesh[] = [];
  private readonly engineMaterial: THREE.MeshBasicMaterial;
  private readonly brakeMaterial: THREE.MeshBasicMaterial;
  private readonly disposables: { dispose(): void }[] = [];

  private lean = 0;
  private rake = 0;
  private flare = 0;
  private idleTime = 0;

  public constructor(colors: CraftColors) {
    /*
     * Low metalness, deliberately.
     *
     * A metallic surface derives almost all of its colour from reflections, and this scene has no
     * environment map — so the first version at metalness 0.72 rendered the hull as flat black
     * silhouettes regardless of the lighting. Dielectric values let the directional light actually
     * shade the panels, and a faint emissive keeps the craft readable against a dark course
     * instead of disappearing into it.
     */
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: colors.hull,
      roughness: 0.55,
      metalness: 0.12,
      emissive: colors.hull,
      emissiveIntensity: 0.35,
      // Lit by the scene, but never casting — a shadow from something attached to the camera
      // tracks the view and looks like a bug.
      side: THREE.DoubleSide
    });
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: colors.edge });
    this.engineMaterial = new THREE.MeshBasicMaterial({
      color: colors.engine,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.brakeMaterial = new THREE.MeshBasicMaterial({
      color: colors.brake,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.disposables.push(hullMaterial, edgeMaterial, this.engineMaterial, this.brakeMaterial);

    /*
     * Placement is driven by the view frustum, not by eyeballing.
     *
     * At `CRAFT_DISTANCE` with an 88° vertical FOV the visible half-height is
     * `0.92 * tan(44°) ≈ 0.89`, and half-width is that times the aspect. Anything nearer the
     * origin than ~70% of those sits in the middle of the screen. The first version of this used
     * y = -0.19 and filled the centre of the view with hull — the track was behind it.
     *
     * These numbers put the wings in the bottom corners with their inner edges clear of the
     * centre third, which is where the player is actually aiming.
     */
    const WING_X = 0.78;
    const WING_Y = -0.62;

    // Two lower wing panels, mirrored. These carry the bank read.
    for (const side of [-1, 1]) {
      const geometry = panel(0.08, 0.26, 0.5, 0.05);
      const wing = new THREE.Mesh(geometry, hullMaterial);
      wing.position.set(side * WING_X, WING_Y, 0);
      wing.rotation.z = side * 0.3;
      this.hullGroup.add(wing);
      this.disposables.push(geometry);

      // A bright leading edge. At speed this is most of what the eye actually registers.
      const edgeGeometry = new THREE.BoxGeometry(0.012, 0.012, 0.48);
      const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
      edge.position.set(side * (WING_X + 0.12), WING_Y - 0.05, -0.24);
      edge.rotation.y = side * -0.07;
      this.hullGroup.add(edge);
      this.disposables.push(edgeGeometry);

      // Airbrake: a flap that swings open under braking.
      const brakeGeometry = new THREE.PlaneGeometry(0.13, 0.16);
      const brake = new THREE.Mesh(brakeGeometry, this.brakeMaterial);
      brake.position.set(side * (WING_X + 0.06), WING_Y - 0.02, 0.06);
      this.hullGroup.add(brake);
      this.airbrakes.push(brake);
      this.disposables.push(brakeGeometry);

      // Engine bloom quad, behind the wing root and facing the viewer.
      const engineGeometry = new THREE.PlaneGeometry(0.17, 0.075);
      const engine = new THREE.Mesh(engineGeometry, this.engineMaterial);
      engine.position.set(side * (WING_X - 0.04), WING_Y - 0.02, 0.12);
      this.hullGroup.add(engine);
      this.engines.push(engine);
      this.disposables.push(engineGeometry);
    }

    this.root.add(this.hullGroup);
    this.root.position.z = -CRAFT_DISTANCE;
    // Never culled: attached to the camera, it is always exactly in front of it, and three.js
    // frustum-culls children against their own world bounds which can flicker at extreme FOV.
    this.root.frustumCulled = false;
    for (const child of this.hullGroup.children) child.frustumCulled = false;
  }

  /**
   * The animated hull node.
   *
   * Exposed because the craft's whole contribution is motion, and motion this subtle cannot be
   * verified from a screenshot — a WebGL canvas with `preserveDrawingBuffer: false` reads back
   * blank, so pixel diffing the running game measures nothing. Tests observe the transform.
   */
  public get hull(): THREE.Object3D {
    return this.hullGroup;
  }

  /**
   * Parents the craft to the camera.
   *
   * The camera must itself be in the scene graph for its children to render — a detail three.js
   * does not warn about, and which shows up as the craft simply never appearing.
   */
  public attachTo(camera: THREE.Camera, scene: THREE.Scene): void {
    if (!camera.parent) scene.add(camera);
    camera.add(this.root);
  }

  /**
   * Animates the craft.
   *
   * Every response is eased rather than set. The lag is the point: instantaneous reaction reads as
   * a HUD element pinned to the screen, while a craft that catches up over a few frames reads as
   * something with mass that the player is flying.
   */
  public update(state: CraftState, dt: number): void {
    const follow = 1 - Math.exp(-FOLLOW_RATE * dt);

    // Counter-roll: the craft leans into the turn while the camera rolls with it, so the two do
    // not simply cancel and the bank stays visible.
    this.lean += (-state.bank * BANK_LEAN - this.lean) * follow;
    this.hullGroup.rotation.z = this.lean;

    // Rake: the nose drops slightly as speed builds, which reads as pressure on the airframe.
    this.rake += (state.speed * 0.06 - this.rake) * follow;
    this.hullGroup.rotation.x = this.rake;
    // Drawn back toward the viewer at speed, widening the field it frames.
    this.root.position.z = -CRAFT_DISTANCE + state.speed * 0.05;

    // Engines: baseline glow with speed, hard flash on boost, damped under dilation so slow
    // motion actually looks calm rather than just slow.
    const target = state.boosting ? 1 : state.speed * 0.55;
    this.flare += (target - this.flare) * (state.boosting ? 1 : follow);
    const dilationDamp = state.dilating ? 0.45 : 1;
    this.engineMaterial.opacity = this.flare * 0.9 * dilationDamp;
    for (const engine of this.engines) {
      const scale = 0.6 + this.flare * 1.5;
      engine.scale.set(scale, 0.7 + this.flare * 0.8, 1);
    }

    /*
     * Idle float.
     *
     * A craft that holds perfectly still reads as a decal stuck to the lens. Two sine waves at
     * incommensurate frequencies never visibly repeat, which is what stops the motion registering
     * as a loop.
     *
     * Damped as speed rises: at pace there is already plenty of motion on screen and adding sway
     * to it just makes the image soft. The float exists for the moment the player is stationary,
     * looking around and deciding where to go.
     */
    this.idleTime += dt;
    const idle = (1 - state.speed) * 0.9;
    this.hullGroup.position.y = Math.sin(this.idleTime * 1.3) * 0.008 * idle;
    this.hullGroup.position.x = Math.sin(this.idleTime * 0.87) * 0.006 * idle;
    this.hullGroup.rotation.y = Math.sin(this.idleTime * 0.61) * 0.012 * idle;

    // Airbrakes swing open and light up proportionally to brake input.
    const brake = Math.min(Math.max(state.brake, 0), 1);
    this.brakeMaterial.opacity = brake * 0.75;
    for (let i = 0; i < this.airbrakes.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.airbrakes[i].rotation.y = side * brake * 1.0;
    }
  }

  public dispose(): void {
    this.root.removeFromParent();
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
  }
}
