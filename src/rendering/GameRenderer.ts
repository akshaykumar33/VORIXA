import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Atmosphere } from './Atmosphere';
import { GateMaterial } from './GateMaterial';
import { buildCourseStructures } from './CourseStructures';
import {
  createSurfaceMaterial,
  resetSurfaceMaterials,
  updateSurfaceTime
} from './SurfaceMaterial';
import type { Box, CourseData } from '../game/Course';
import type { RigOutput } from '../game/CameraRig';

/**
 * Presentation layer, built on Three.js.
 *
 * This replaces the hand-rolled WebGPU/WebGL2 renderers. That code was correct in the end, but
 * everything it spent effort on — colour space, winding order, depth conventions, shadow setup —
 * is solved infrastructure that contributes nothing to whether the game is fun. The library
 * handles it so the effort can go into the course and the movement instead.
 *
 * Visual language is functional, not decorative. Surfaces are coloured by what they want you to
 * do, so the course is readable at running speed without a tutorial:
 *   slate = stand on it · amber = slide under it · cyan = run along it · green = finish
 */

/*
 * World palette, sharing the interface's tokens so the 3D scene and the HUD read as one product.
 *
 * The previous scheme made structure cyan — which meant the brightest, most saturated colour in
 * the scene was the floor you were already standing on, and nothing was left to mark where you
 * should go next. Inverting that is both a visual and a gameplay fix: structure is cold and
 * neutral, and the signal colour is reserved for things that reward you. Progress literally
 * lights the course up as you take it.
 */
/** Structure: walls, run surfaces, particles, unpassed gates. Cool and deliberately quiet. */
const COLOR_ACCENT = 0x7d93ab;
/** Slide under it. */
const COLOR_WARN = 0xffab1f;
/** Hazard. The only warm-red in the scene, so it never has to compete to be understood. */
const COLOR_BAD = 0xff4d5e;
/** Signal: goal, passed gates, boost. The only chroma in the scene that earns attention. */
const COLOR_GOAL = 0xd6ff45;
/** Sky. Zenith is near-void so the course still reads against it; the horizon carries the light. */
const COLOR_ZENITH = 0x05060a;
const COLOR_HORIZON = 0x131b2a;
const COLOR_GROUND = 0x090b11;

/** Shadows follow the player rather than covering 200 m of course at unusable resolution. */
const SHADOW_EXTENT = 34;

/**
 * Range over which a gate brightens as it approaches, in world units.
 *
 * Roughly two gates ahead at course spacing: near enough that the brightening reads as "this one
 * is next", far enough that the next objective is never invisible.
 */
const GATE_FADE_DISTANCE = 110;

/** Depth of the wrapping dust field, in world units. One modulo period. */
const PARTICLE_SPAN = 180;
/** Speed, in units per second, that saturates the dust streaking effect. */
const PARTICLE_SPEED_REFERENCE = 34;

export class GameRenderer {
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;

  private sun!: THREE.DirectionalLight;
  private ghost!: THREE.Group;
  private gates: THREE.Mesh[] = [];
  private gateMaterials: GateMaterial[] = [];
  private particles!: THREE.Points;
  private particleMaterial: THREE.ShaderMaterial | null = null;
  /** Smoothed camera speed, used only to drive the dust. Not a gameplay value. */
  private dustSpeed = 0;
  private lastCameraX = 0;
  private lastCameraZ = 0;
  private lastDustSample = performance.now();
  private atmosphere!: Atmosphere;
  /**
   * Shader clock origin.
   *
   * A timestamp rather than THREE.Clock (deprecated) or THREE.Timer: shader uniforms need one
   * monotonically increasing number, and reaching for a class that also tracks deltas and
   * pause state would be borrowing machinery for a job that is one subtraction.
   */
  private readonly startedAt = performance.now();

  private disposables: { dispose(): void }[] = [];
  /** One material per surface kind, shared by every box of that kind. */
  private readonly materialCache = new Map<Box['kind'], THREE.Material>();

  public initialize(canvas: HTMLCanvasElement, course: CourseData): void {
    // Clear the animated-surface registry first: re-initialising without this leaves the previous
    // scene's uniforms being ticked forever, which is a slow leak rather than a visible bug.
    resetSurfaceMaterials();
    // Same reason: cached materials belong to the scene being replaced, and reusing them across a
    // rebuild would hand out objects that are about to be disposed.
    this.materialCache.clear();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in recent three.js and silently fell back to PCF while logging
    // a warning on every boot. Asking for what we actually get, and taking the softness from the
    // light's radius instead.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    // No flat background colour: the sky dome below draws it, with a gradient and a horizon.
    // Fog is tinted toward the horizon rather than the void so geometry recedes *into the sky*
    // instead of dissolving into a black hole in the middle of it.
    this.scene.fog = new THREE.Fog(COLOR_HORIZON, 55, 260);

    this.camera = new THREE.PerspectiveCamera(88, 1, 0.1, 400);
    // YXZ is the first-person order: yaw, then pitch, then roll about the view axis.
    this.camera.rotation.order = 'YXZ';

    this.atmosphere = new Atmosphere({
      zenith: COLOR_ZENITH,
      horizon: COLOR_HORIZON,
      ground: COLOR_GROUND,
      accent: COLOR_GOAL
    });
    this.atmosphere.addTo(this.scene);
    this.disposables.push(this.atmosphere);

    this.buildLighting();
    this.buildCourse(course);
    this.buildGates(course);
    this.buildGhost();
    this.buildParticles();

    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom is what makes the neon read as light rather than as paint. Kept restrained: a high
    // threshold means only the emissive accents bloom, not the whole scene.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.5, 0.72);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;

    // Shader pre-warm. Without this, every material compiles the first frame it becomes visible,
    // which lands as a multi-frame hitch partway down the course — the worst possible moment in a
    // time attack. Compiling the whole scene up front moves that cost into the loading screen.
    this.renderer.compile(this.scene, this.camera);
  }

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight(0x6f8ec0, 0x0a0c10, 1.1);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xdfe9ff, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 1;
    cam.far = 140;
    this.sun.shadow.bias = -0.0009;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  private materialFor(kind: Box['kind']): THREE.Material {
    switch (kind) {
      case 'ceiling':
        return createSurfaceMaterial({
          color: 0x241d12,
          emissive: COLOR_WARN,
          emissiveIntensity: 0.22,
          roughness: 0.7,
          // Tighter panels overhead: the ceiling is passed at speed and close range, so a coarse
          // grid would read as one flat plane going by.
          panelScale: 3,
          rimStrength: 0.5,
          rimPower: 2.6
        });
      case 'wall':
        return createSurfaceMaterial({
          color: 0x141a23,
          emissive: COLOR_ACCENT,
          emissiveIntensity: 0.22,
          roughness: 0.55,
          panelScale: 5,
          // Walls are what you run along, so the rim is strong — it makes the runnable edge
          // legible from a distance and at a glancing angle, which is exactly how you approach it.
          rimStrength: 0.75,
          rimPower: 2.4
        });
      case 'goal':
        return new THREE.MeshBasicMaterial({
          color: COLOR_GOAL,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false
        });
      case 'boost':
        return createSurfaceMaterial({
          color: 0x1a2410,
          emissive: COLOR_GOAL,
          emissiveIntensity: 0.85,
          roughness: 0.25,
          metalness: 0.8,
          panelScale: 2.5,
          rimStrength: 0.6,
          // The pulse travels the way you will: seeing the energy run down the pad tells you
          // which direction it throws you before you commit to it.
          pulseSpeed: 5.5,
          pulseStrength: 0.9
        });
      case 'jump_pad':
        return createSurfaceMaterial({
          color: 0x2a1d06,
          emissive: COLOR_WARN,
          emissiveIntensity: 1.0,
          roughness: 0.25,
          metalness: 0.8,
          panelScale: 2.0,
          rimStrength: 0.7,
          // Slower and stronger than boost, so the two are distinguishable at a glance even
          // though both are "active floor".
          pulseSpeed: 3.0,
          pulseStrength: 1.2
        });
      case 'hazard':
        return createSurfaceMaterial({
          color: 0x2e0c10,
          emissive: COLOR_BAD,
          emissiveIntensity: 0.9,
          roughness: 0.35,
          metalness: 0.4,
          panelScale: 1.6,
          rimStrength: 0.9,
          rimPower: 2.0,
          // Fast and urgent. Hazards should read as agitated next to everything else.
          pulseSpeed: 9.0,
          pulseStrength: 0.7
        });
      default:
        // Plain floor. The one surface the player spends the whole run on, so it stays quiet —
        // wide panels for scale, a faint cool rim to give the slab an edge, nothing that competes
        // with the surfaces that actually mean something.
        return createSurfaceMaterial({
          color: 0x161c27,
          roughness: 0.88,
          metalness: 0.04,
          panelScale: 6,
          rim: COLOR_ACCENT,
          rimStrength: 0.3,
          rimPower: 3.6
        });
    }
  }

  private edgeColorFor(kind: Box['kind']): number {
    if (kind === 'ceiling') return COLOR_WARN;
    if (kind === 'goal') return COLOR_GOAL;
    // Boost is a reward, so it carries the signal colour rather than blending into structure.
    if (kind === 'boost') return COLOR_GOAL;
    if (kind === 'jump_pad') return 0xffdd00;
    if (kind === 'hazard') return 0xff0033;
    return COLOR_ACCENT;
  }

  private buildParticles(): void {
    const count = 400;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 36;
      positions[i * 3 + 1] = Math.random() * 22 - 2;
      // Spread evenly across one wrap period; the shader re-centres this on the player.
      positions[i * 3 + 2] = Math.random() * PARTICLE_SPAN;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    /*
     * Dust that reacts to speed.
     *
     * Previously a static point cloud rotating slowly, which conveyed nothing: at 200 km/h the
     * air looked identical to standing still. Speed in a first-person game is communicated almost
     * entirely by things passing you, so the dust is the instrument.
     *
     * The field wraps around the player inside the vertex shader with a modulo, which means it is
     * effectively infinite while staying 400 static points and zero per-frame CPU work — no
     * respawning, no buffer uploads, no allocation in the frame loop.
     */
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(COLOR_ACCENT) },
        uSpeed: { value: 0 },
        uPlayerZ: { value: 0 },
        uSpan: { value: PARTICLE_SPAN }
      },
      vertexShader: /* glsl */ `
        uniform float uSpeed;
        uniform float uPlayerZ;
        uniform float uSpan;
        varying float vFade;

        void main() {
          vec3 p = position;

          // Wrap relative to the player so the field always surrounds them. mod() keeps the
          // result positive, then it is re-centred so half the dust sits ahead and half behind.
          float rel = mod(p.z - uPlayerZ, uSpan);
          p.z = uPlayerZ + rel - uSpan * 0.5;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);

          // Points grow with speed, so the field reads as streaking rather than drifting.
          // Divided by depth so distant dust does not clump into a solid sheet.
          //
          // The base term is deliberately non-trivial: scaling size purely from speed makes the
          // dust vanish at a standstill, which empties the scene at exactly the moment the player
          // is looking around deciding where to go.
          float size = (0.9 + uSpeed * 1.5) * (60.0 / -mv.z);
          gl_PointSize = clamp(size, 1.5, 16.0);

          // Fade at the far edge of the wrap, or particles visibly pop into existence behind the
          // player and at the horizon.
          vFade = 1.0 - smoothstep(uSpan * 0.28, uSpan * 0.5, abs(p.z - uPlayerZ));

          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uSpeed;
        varying float vFade;

        void main() {
          // Round, soft-edged point. Square points are an instant tell.
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float alpha = (1.0 - smoothstep(0.0, 0.25, r)) * vFade * (0.42 + uSpeed * 0.45);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    // The wrap keeps the field centred on the player, so frustum culling by its original bounds
    // would blink it out entirely once they move away from the origin.
    this.particles.frustumCulled = false;
    this.particleMaterial = material;
    this.scene.add(this.particles);
    this.disposables.push(geometry, material);
  }

  /**
   * One material per surface kind, not one per box.
   *
   * Every box used to build its own material. That is a separate uniform set and a separate
   * draw-call state change for each of a hundred-odd slabs, all of which are visually identical
   * within their kind — pure cost for no difference on screen. Sharing also means a tuning change
   * to a kind takes effect everywhere at once.
   */
  private sharedMaterialFor(kind: Box['kind']): THREE.Material {
    const existing = this.materialCache.get(kind);
    if (existing) return existing;
    const material = this.materialFor(kind);
    this.materialCache.set(kind, material);
    this.disposables.push(material);
    return material;
  }

  private buildCourse(course: CourseData): void {
    for (const box of course.boxes) {
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const d = box.maxZ - box.minZ;

      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = this.sharedMaterialFor(box.kind);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(box.minX + w / 2, box.minY + h / 2, box.minZ + d / 2);

      if (box.kind !== 'goal') {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      this.scene.add(mesh);
      // The material is shared and disposed once by the cache; only the geometry is per-box.
      this.disposables.push(geometry);

      // Outlined edges are not decoration: at speed, an unlit platform lip is invisible, and
      // players fall off things they never saw the boundary of.
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: this.edgeColorFor(box.kind),
        transparent: true,
        opacity: box.kind === 'platform' ? 0.32 : 0.75
      });
      const line = new THREE.LineSegments(edges, lineMaterial);
      line.position.copy(mesh.position);
      this.scene.add(line);
      this.disposables.push(edges, lineMaterial);
    }

    this.buildStructures(course);
  }

  /**
   * Adds the procedural supports that give the course weight.
   *
   * Runs after the boxes so the structure material can reuse the platform material already in the
   * cache — the legs are made of the same stuff as the thing they hold up, which is both correct
   * and one fewer shader program.
   */
  private buildStructures(course: CourseData): void {
    const structures = buildCourseStructures(course.boxes, this.sharedMaterialFor('platform'));
    if (structures.pylons) this.scene.add(structures.pylons);
    if (structures.skirts) this.scene.add(structures.skirts);
    this.disposables.push(structures);
  }

  private buildGates(course: CourseData): void {
    for (const cp of course.checkpoints) {
      if (cp.index === 0) continue;
      const geometry = new THREE.PlaneGeometry(cp.halfWidth * 2, 5);
      const material = new GateMaterial(COLOR_ACCENT);
      const gate = new THREE.Mesh(geometry, material);
      gate.position.set(cp.spawnX, cp.spawnY + 2.5, cp.triggerZ);
      this.scene.add(gate);
      this.gates.push(gate);
      this.gateMaterials.push(material);
      this.disposables.push(geometry, material);
    }
  }

  private buildGhost(): void {
    this.ghost = new THREE.Group();
    const geometry = new THREE.CapsuleGeometry(0.34, 1.05, 4, 12);
    const material = new THREE.MeshBasicMaterial({
      color: COLOR_ACCENT,
      transparent: true,
      opacity: 0.3,
      // No depth write, so the ghost never hides the geometry you are trying to land on.
      depthWrite: false
    });
    const body = new THREE.Mesh(geometry, material);
    body.position.y = 0.9;
    this.ghost.add(body);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.disposables.push(geometry, material);
  }

  public setGhostPose(x: number, y: number, z: number, yaw: number): void {
    this.ghost.visible = true;
    this.ghost.position.set(x, y, z);
    this.ghost.rotation.y = yaw;
  }

  public hideGhost(): void {
    this.ghost.visible = false;
  }

  /** Lights up gates the player has already banked. */
  /**
   * Advances the gate shaders and tells each how close the player is.
   *
   * Distance is measured along Z alone rather than in full 3D. The course runs down that axis, so
   * Z distance is what "how far until the next gate" actually means — true euclidean distance
   * would make a gate dim simply because the player drifted wide, which is the moment they most
   * need it to be visible.
   */
  /**
   * Feeds player speed and position to the dust field.
   *
   * Speed is derived from camera movement rather than taken from the simulation, so the renderer
   * stays ignorant of gameplay — it reacts to where the camera actually went, which is also
   * correct during a ghost replay or any future spectator view where there is no local player
   * velocity to read.
   */
  private updateDust(rig: RigOutput): void {
    const material = this.particleMaterial;
    if (!material) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastDustSample) / 1000, 0.1);
    this.lastDustSample = now;

    if (dt > 0) {
      const dx = rig.x - this.lastCameraX;
      const dz = rig.z - this.lastCameraZ;
      const instant = Math.hypot(dx, dz) / dt;
      // Smoothed, or the streaking flickers on every frame-time wobble.
      this.dustSpeed += (instant - this.dustSpeed) * Math.min(1, dt * 8);
    }
    this.lastCameraX = rig.x;
    this.lastCameraZ = rig.z;

    material.uniforms.uSpeed.value = Math.min(this.dustSpeed / PARTICLE_SPEED_REFERENCE, 1);
    material.uniforms.uPlayerZ.value = rig.z;
  }

  private updateGates(elapsed: number, playerZ: number): void {
    for (let i = 0; i < this.gateMaterials.length; i++) {
      const material = this.gateMaterials[i];
      material.setTime(elapsed);
      const gate = this.gates[i];
      if (!gate) continue;
      const distance = Math.abs(gate.position.z - playerZ);
      material.setProximity(1 - Math.min(distance / GATE_FADE_DISTANCE, 1));
    }
  }

  public setCheckpointProgress(passedIndex: number): void {
    for (let i = 0; i < this.gateMaterials.length; i++) {
      const passed = i + 1 <= passedIndex;
      this.gateMaterials[i].setColor(passed ? COLOR_GOAL : COLOR_ACCENT);
      this.gateMaterials[i].setPassed(passed);
    }
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = height > 0 ? width / height : 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
  }

  public render(rig: RigOutput): void {
    this.camera.position.set(rig.x, rig.y, rig.z);
    this.camera.rotation.set(rig.pitch, rig.yaw, rig.roll);
    if (this.camera.fov !== rig.fov) {
      this.camera.fov = rig.fov;
      this.camera.updateProjectionMatrix();
    }

    // Keep the shadow frustum centred on the action.
    this.sun.position.set(rig.x + 26, rig.y + 46, rig.z + 20);
    this.sun.target.position.set(rig.x, rig.y, rig.z);
    this.sun.target.updateMatrixWorld();

    this.updateDust(rig);

    const elapsed = (performance.now() - this.startedAt) / 1000;
    this.atmosphere.update(elapsed, this.camera.position);
    // One clock for every pulsing surface, rather than each material tracking its own.
    updateSurfaceTime(elapsed);
    this.updateGates(elapsed, rig.z);

    this.composer.render();
  }

  public dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables = [];
    this.composer?.dispose();
    this.renderer?.dispose();
  }
}
